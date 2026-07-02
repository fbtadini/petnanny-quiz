/**
 * PetNanny — Apps Script (behavior tracking + follow-up survey)
 *
 * MUDANÇAS DESTA VERSÃO:
 * 1. NOVO HANDLER 'behavior_update': eventos pós quiz_complete (whatif, share,
 *    pdf, expansão de cards) atualizam a linha existente da pessoa com 12 colunas
 *    novas de tracking comportamental. Permite cohort analysis cruzando perfil
 *    com comportamento individual (ex: "perfis que usaram whatif convertem mais?").
 * 2. NOVO HANDLER 'followup': pesquisa de outcome real disparada 21+ dias após
 *    o quiz. Grava em aba SEPARADA 'followup' (decision, breed, rating, comment).
 *    Permite cruzar session_id pra ver: tutor decidiu? que raça pegou? rating?
 *    É o input que faltava pra futuramente treinar ML com outcome real.
 * 3. 12 COLUNAS NOVAS antes de raw_json: cards_expanded, assumptions_warnings,
 *    whatif_used, whatif_levers_changed, whatif_final_top, whatif_time_ms,
 *    pdf_downloaded, share_clicked, restart_clicked, reached_bottom,
 *    behavior_last_update, behavior_last_reason.
 * 4. MIGRATION REFATORADA: agora detecta qualquer coluna faltante em FULL_HEADERS
 *    e adiciona em batch. Funciona pra cabeçalhos de 48, 52, 53, 54 cols ou
 *    qualquer estado intermediário.
 *
 * COMO ATUALIZAR:
 * 1. Abra script.google.com → seu projeto PetNanny.
 * 2. Cole este código completo SUBSTITUINDO o anterior.
 * 3. Salve (Ctrl+S).
 * 4. Deploy → Manage deployments → Edit (lápis) → New version → Deploy.
 *    URL do webhook NÃO MUDA — cliente continua funcionando.
 * 5. (Opcional) Rode `migrateHeadersOnce()` manualmente no editor pra forçar
 *    a adição das 12 colunas novas sem esperar a primeira submissão.
 *
 * EVENTOS QUE O DOPOST PROCESSA:
 *   - 'quiz_complete': append nova linha (default quando não tem 'event')
 *   - 'feedback': atualiza coluna post_feedback da linha existente
 *   - 'quick_feedback': atualiza coluna quick_reaction da linha existente
 *   - 'behavior_update': atualiza 12 colunas de behavior da linha existente
 *   - 'followup': append em aba separada 'followup' (outcome real 21d+ depois)
 */

// TCASA_TABLE — temperamento em casa por raça (1=calmo, 2=médio default, 3=alerta).
// Idêntico à tabela TCASA do cliente (index.html). Mantido aqui pra resolver
// tcasa_top1/2/3 das raças recomendadas no momento do appendRow, sem precisar
// do cliente enviar 3 valores extras (mantém payload enxuto).
// Quando mexer no cliente, sincronize aqui também.
const TCASA_TABLE = {
  // CALMO em casa (1) — 18 raças
  galgo:1, bulldog_ingles:1, bulldog_frances:1, bullmastif:1, bernese:1,
  newfoundland:1, sao_bernardo:1, mastim_ingles:1, basset_hound:1, pequines:1,
  cavalier:1, dogue_alemao:1, lebrel:1, chin:1, coton_tulear:1,
  shih_tzu:1, pug:1, chow_chow:1,
  // ALERTA/AGITADO em casa (3) — 20 raças
  jack_russell:3, pinscher:3, papillon:3, yorkshire:3, biewer:3,
  chihuahua:3, lulu_pomerania:3, schnauzer:3, westie:3, terrier_brasileiro:3,
  beagle:3, corgi:3, cattle_dog:3, pastor_belga_malinois:3, border_collie:3,
  pastor_shetland:3, bull_terrier:3, dachshund:3, dachshund_standard:3, vizsla:3
  // Demais 29 raças = 2 (médio, default)
};

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const payload = JSON.parse(e.postData.contents);
    const evt = payload.event || 'quiz_complete';

    // ESPINHA DE IDENTIDADE (Nanny.Spine.gs) — sem estes 2 ifs, todo autosave do hub
    // cai como linha lixo na aba 'respostas' e o sync/lembrete por email não funciona.
    if (evt === 'nanny_save') return nannySave_(payload, ss);
    if (evt === 'nanny_load') return nannyLoad_(payload, ss);

    if (evt === 'followup') {
      // FOLLOW-UP SURVEY — pesquisa de outcome real disparada 21+ dias após
      // o quiz. Grava em aba separada 'followup' pra não inflar a tabela
      // principal (uma pessoa pode ter feito o quiz uma vez mas o followup
      // refere a uma JORNADA, não a uma resposta — é evento de natureza distinta).
      //
      // Análise: cruza followup.session_id com respostas.session_id pra ver
      // que tipo de tutor de fato decidiu, qual raça acabou comprando vs o
      // top recomendado, qual rating deu.
      const fb = ss.getSheetByName('followup') || ss.insertSheet('followup');
      if (fb.getLastRow() === 0) {
        fb.appendRow([
          'ts_server','session_id','submission_n',
          'decision',     // ja_tem / decidiu_raca / ainda_pensando / desistiu
          'breed',        // raça que pegou ou planeja (text livre, pode ser SRD)
          'rating',       // 1-5 — quanto o resultado fez sentido
          'comment',      // texto livre opcional
          'user_agent','raw_json'
        ]);
      }
      fb.appendRow([
        new Date(),
        payload.session_id || '',
        payload.submission_n || '',
        payload.decision || '',
        payload.breed || '',
        payload.rating || '',
        payload.comment || '',
        payload.user_agent || '',
        JSON.stringify(payload)
      ]);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, evt: 'followup' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (evt === 'behavior_update') {
      // Atualiza colunas de comportamento na linha existente do quiz_complete.
      // Match pela tupla (session_id, submission_n). Eventos como whatif/share/pdf
      // disparam DEPOIS do quiz_complete original ter sido salvo — esse handler
      // atualiza a linha de origem com os campos novos.
      const sh = ss.getSheetByName('respostas');
      if (!sh || sh.getLastRow() < 2) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'no_rows' })).setMimeType(ContentService.MimeType.JSON);
      }
      const data = sh.getDataRange().getValues();
      let foundRow = -1;
      for (let i = data.length - 1; i >= 1; i--) {
        const sessionMatch = data[i][1] === payload.session_id;
        const submissionMatch = payload.submission_n
          ? String(data[i][2]) === String(payload.submission_n)
          : true;
        if (sessionMatch && submissionMatch) {
          foundRow = i + 1;
          break;
        }
      }
      if (foundRow < 0) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'row_not_found' })).setMimeType(ContentService.MimeType.JSON);
      }
      // Mapeia campos do behavior pra colunas (pela header — robusto a migrations)
      const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const b = payload.behavior || {};
      const setCol = (colName, value) => {
        const idx = headerRow.indexOf(colName);
        if (idx >= 0) sh.getRange(foundRow, idx + 1).setValue(value);
      };
      const arr = v => Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join('|') : (v || '');
      setCol('cards_expanded', arr(b.cards_expanded));
      setCol('assumptions_warnings', arr(b.assumptions_warnings_shown));
      setCol('whatif_used', b.whatif_entered ? 'TRUE' : 'FALSE');
      setCol('whatif_levers_changed', arr(b.whatif_levers_changed));
      setCol('whatif_final_top', arr(b.whatif_final_top));
      setCol('whatif_time_ms', b.whatif_time_spent_ms || 0);
      setCol('pdf_downloaded', b.pdf_downloaded ? 'TRUE' : 'FALSE');
      setCol('share_clicked', b.share_whatsapp_clicked ? 'TRUE' : 'FALSE');
      setCol('restart_clicked', b.restart_clicked ? 'TRUE' : 'FALSE');
      setCol('reached_bottom', b.reached_bottom ? 'TRUE' : 'FALSE');
      setCol('behavior_last_update', new Date());
      setCol('behavior_last_reason', payload.reason || '');
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, updated: true, row: foundRow, evt: evt }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (evt === 'feedback' || evt === 'quick_feedback' || evt === 'quick_react_top') {
      // 3 eventos correlatos atualizam a linha existente:
      //   - feedback: texto livre → coluna post_feedback
      //   - quick_feedback: emoji do rodapé → quick_reaction (bottom)
      //   - quick_react_top: emoji do topo → quick_reaction_top
      // Antes 'quick_react_top' usava o mesmo event 'quick_feedback' e sobrescrevia
      // a mesma coluna — bug confirmado pelo cliente. Agora cada um vai pra coluna
      // própria, capturando as DUAS perguntas (são conceitualmente diferentes:
      // experiência do quiz vs qualidade da recomendação).
      const sh = ss.getSheetByName('respostas');
      if (sh && sh.getLastRow() >= 2) {
        const data = sh.getDataRange().getValues();
        let foundRow = -1;
        for (let i = data.length - 1; i >= 1; i--) {
          const sessionMatch = data[i][1] === payload.session_id;
          const submissionMatch = payload.submission_n
            ? String(data[i][2]) === String(payload.submission_n)
            : true;
          if (sessionMatch && submissionMatch) {
            foundRow = i + 1;
            break;
          }
        }
        if (foundRow > 0) {
          if (evt === 'feedback') {
            sh.getRange(foundRow, 43).setValue(payload.feedback || '');
          } else {
            // Detecta coluna pelo nome — funciona pós-migration
            const headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
            const colName = (evt === 'quick_react_top') ? 'quick_reaction_top' : 'quick_reaction';
            const col = headerRow.indexOf(colName) + 1;
            if (col > 0) {
              sh.getRange(foundRow, col).setValue(payload.reaction || '');
            }
          }
          return ContentService
            .createTextOutput(JSON.stringify({ ok: true, updated: true, row: foundRow, evt: evt }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      // Fallback: órfão (não achou linha matching pelo session+submission)
      const fb = ss.getSheetByName('feedback_orfao') || ss.insertSheet('feedback_orfao');
      if (fb.getLastRow() === 0) {
        fb.appendRow(['ts_server','event','session_id','submission_n','origem','top_breed','match_pct','feedback_text','reaction','raw_json']);
      }
      fb.appendRow([
        new Date(),
        evt,
        payload.session_id || '',
        payload.submission_n || '',
        payload.origem || '',
        payload.topBreed || payload.top1_breed || '',
        payload.matchPct || '',
        payload.feedback || '',
        payload.reaction || '',
        JSON.stringify(payload)
      ]);
    } else {
      const sh = ss.getSheetByName('respostas') || ss.insertSheet('respostas');
      ensureHeaders(sh);

      const d = payload.data || {};
      const qa = d.quizAnswers || {};
      const ff = d.freeform || {};
      const r = d.results || [];
      const em = d.expectationMatch || {};
      const utm = payload.utm || {};
      const pt = d.perfilTutor || {};
      const arr = v => Array.isArray(v) ? v.join('|') : (v || '');

      sh.appendRow([
        new Date(),
        payload.session_id || '',
        payload.submission_n || '',
        payload.origem || qa.origem || '',
        d.email || '',
        ff.desiredBreed || '',
        ff.desiredBreedKey || '',
        em.matched === true ? 'TRUE' : (em.matched === false ? 'FALSE' : ''),
        em.position || '',
        em.method || '',
        r[0] && r[0].key || '', r[0] && r[0].name || '', r[0] && r[0].matchPct || '',
        r[1] && r[1].key || '', r[1] && r[1].name || '', r[1] && r[1].matchPct || '',
        r[2] && r[2].key || '', r[2] && r[2].name || '', r[2] && r[2].matchPct || '',
        qa.moradia || '', qa.clima || '', qa.vizinhos || '', qa.guarda || '',
        qa.alergia || '', qa.criancas || '', qa.necessidades_especiais || '',
        arr(qa.animais), qa.gato_perfil || '', arr(qa.cao_porte), qa.cao_temperamento || '',
        qa.sozinho || '', qa.atividade || '', qa.orcamento || '',
        qa.experiencia || '',
        qa.porte_imaginado || '', qa.grooming || '', qa.baba || '',
        qa.tradeoff_apego || '', qa.tradeoff_social || '', qa.tradeoff_energia || '',
        qa.energia_imaginada || '', qa.tradeoff_temperamento || '', qa.eixo_final || '',
        ff.postResultFeedback || '',
        payload.user_agent || '',
        utm.source || '', utm.medium || '', utm.campaign || '',
        // ── COLUNAS NOVAS — perfil de tutor + intent inicial ──
        qa.intent_inicial || '',
        pt.prosa || '',
        Array.isArray(pt.alertas) ? pt.alertas.join(' || ') : (pt.alertas || ''),
        pt.arquetipo_id || '',
        // stated_size + gap: respostas da tela de calibração de tamanho.
        // Podem ser null/vazio se pessoa pulou. Gap é número 0..3.5 (diferença com revealed).
        qa.stated_size || '',
        (typeof qa.stated_revealed_gap === 'number') ? qa.stated_revealed_gap.toFixed(1) : '',
        // tcasa_preferido: derivado do conjoint pelo cliente (1=calmo, 2=neutro, 3=alerta).
        // tcasa_top1/2/3: TCASA das raças recomendadas. Tabela inline pra evitar
        // duplicação com cliente — raças não listadas viram 2 (médio, neutro).
        qa.tcasa_preferido || '',
        (r[0] && r[0].key && TCASA_TABLE[r[0].key]) || (r[0] ? 2 : ''),
        (r[1] && r[1].key && TCASA_TABLE[r[1].key]) || (r[1] ? 2 : ''),
        (r[2] && r[2].key && TCASA_TABLE[r[2].key]) || (r[2] ? 2 : ''),
        // quick_reaction_top e quick_reaction começam vazias — preenchidas
        // depois via events 'quick_react_top' (topo) e 'quick_feedback' (rodapé).
        // São perguntas conceitualmente diferentes — armazenadas em colunas separadas.
        '', '',
        // ── BEHAVIOR TRACKING — 12 colunas preenchidas via 'behavior_update' ──
        '', '',          // cards_expanded, assumptions_warnings
        '', '', '', '',  // whatif_used, levers_changed, final_top, time_ms
        '', '', '', '',  // pdf_downloaded, share_clicked, restart_clicked, reached_bottom
        '', '',          // behavior_last_update, behavior_last_reason
        // ── raw_json ──
        JSON.stringify(payload)
      ]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Garante que o cabeçalho da aba "respostas" tem todas as 52 colunas.
 *
 * Casos:
 * - Aba vazia → cria cabeçalho completo (52 colunas).
 * - Aba com cabeçalho antigo (48 cols, termina em raw_json sem ter intent_inicial)
 *   → insere 4 colunas novas ANTES de raw_json, preservando todos os dados existentes.
 * - Aba já com cabeçalho novo → no-op.
 *
 * Inserir antes de raw_json mantém os dados existentes alinhados — Sheets desloca
 * as células do raw_json (coluna 48) pra coluna 52 automaticamente. Linhas antigas
 * ficam com as 4 colunas novas vazias, o que é o comportamento esperado.
 */
function ensureHeaders(sh) {
  const FULL_HEADERS = [
    'ts_server','session_id','submission_n','origem','email',
    'desired_breed','desired_breed_key',
    'exp_matched','exp_position','exp_method',
    'top1_key','top1_name','top1_pct',
    'top2_key','top2_name','top2_pct',
    'top3_key','top3_name','top3_pct',
    'moradia','clima','vizinhos','guarda',
    'alergia','criancas','necessidades_especiais','animais','gato_perfil','cao_porte','cao_temperamento',
    'sozinho','atividade','orcamento',
    'experiencia',
    'porte_imaginado','grooming','baba',
    'tradeoff_apego','tradeoff_social','tradeoff_energia','energia_imaginada','tradeoff_temperamento','eixo_final',
    'post_feedback',
    'user_agent','utm_source','utm_medium','utm_campaign',
    'intent_inicial','perfil_tutor_prosa','perfil_tutor_alertas','arquetipo_id',
    // STATED PREFERENCE DE TAMANHO — pergunta opcional depois do conjoint.
    // stated_size: 1-5 (micro/peq/med/grd/gig) ou vazio (pulou)
    // stated_revealed_gap: 0..3.5 — diferença com porte_imaginado (derivado conjoint)
    // Não usado no ranking — só pra análise de cohort (stated×revealed correlation).
    'stated_size','stated_revealed_gap',
    // TEMPERAMENTO EM CASA — derivado do conjoint (lat+conv+ind).
    // tcasa_preferido: 1=quer calmo / 2=neutro / 3=quer alerta-agitado.
    // tcasa_top1/2/3: temperamento das raças recomendadas (1=calmo, 2=médio, 3=alerta).
    // Permite análise: pessoa derivada como "quer calmo" recebeu raças tcasa=1?
    'tcasa_preferido','tcasa_top1','tcasa_top2','tcasa_top3',
    // QUICK REACTIONS — SEPARADAS porque são perguntas diferentes:
    // quick_reaction_top: "O quiz fez sentido?" (sobre a experiência do quiz)
    // quick_reaction_bottom: "Esse resultado combinou?" (sobre a recomendação)
    // Antes ficava tudo numa coluna só (quick_reaction) e cliente sobrescrevia
    // quando pessoa clicava nos dois — bug real reportado.
    'quick_reaction_top','quick_reaction',
    // ── BEHAVIOR TRACKING — preenchidas via event 'behavior_update' ──
    // Eventos pós quiz_complete (whatif, share, pdf, expand cards) atualizam
    // estas colunas na linha existente. Ver handler 'behavior_update' no doPost.
    'cards_expanded','assumptions_warnings',
    'whatif_used','whatif_levers_changed','whatif_final_top','whatif_time_ms',
    'pdf_downloaded','share_clicked','restart_clicked','reached_bottom',
    'behavior_last_update','behavior_last_reason',
    'raw_json'
  ];

  // Aba vazia: cria cabeçalho completo
  if (sh.getLastRow() === 0) {
    sh.appendRow(FULL_HEADERS);
    return;
  }

  // Lê cabeçalho atual
  let lastCol = sh.getLastColumn();
  let headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  // RENOMEAÇÃO: cao_energia → cao_temperamento (mudou no quiz na versão anterior)
  const caoEnergiaIdx = headerRow.indexOf('cao_energia');
  if (caoEnergiaIdx !== -1) {
    sh.getRange(1, caoEnergiaIdx + 1).setValue('cao_temperamento');
    headerRow[caoEnergiaIdx] = 'cao_temperamento';
  }

  // INSERÇÃO: coluna 'guarda' (depois de 'vizinhos')
  // NOTA: pergunta de guarda foi REMOVIDA do quiz, mas mantemos a coluna pra
  // dados antigos não sumirem. Novas submissões deixam vazio nessa coluna.
  if (headerRow.indexOf('guarda') === -1) {
    const vizinhosIdx = headerRow.indexOf('vizinhos');
    if (vizinhosIdx !== -1) {
      sh.insertColumnsAfter(vizinhosIdx + 1, 1);
      sh.getRange(1, vizinhosIdx + 2).setValue('guarda');
      headerRow.splice(vizinhosIdx + 1, 0, 'guarda');
    }
  }

  // INSERÇÃO INCREMENTAL de colunas faltantes antes de raw_json.
  // Garante que TODAS as colunas em FULL_HEADERS (exceto raw_json) existam.
  // Aplicável a qualquer estado: cabeçalho antigo de 48, 52, 53, 54 cols, etc.
  // Reordena baseado em FULL_HEADERS pra manter consistência.
  const rawJsonIdx = headerRow.indexOf('raw_json');
  if (rawJsonIdx === -1) {
    // Sem raw_json no header — situação anômala. Não toca.
    return;
  }

  // Lista de colunas faltantes (na ordem em que aparecem em FULL_HEADERS, ignorando raw_json)
  const missing = [];
  for (const col of FULL_HEADERS) {
    if (col === 'raw_json') continue;
    if (headerRow.indexOf(col) === -1) missing.push(col);
  }

  // Insere as faltantes ANTES de raw_json, na ordem do FULL_HEADERS.
  // Coloca em batch — 1 insertColumnsBefore + 1 setValues — pra ser idempotente
  // e barato em api calls.
  if (missing.length > 0) {
    sh.insertColumnsBefore(rawJsonIdx + 1, missing.length);
    sh.getRange(1, rawJsonIdx + 1, 1, missing.length).setValues([missing]);
  }
}

/**
 * Roda manualmente uma vez pra forçar a migration sem esperar próxima submissão.
 * No editor do Apps Script: selecione "migrateHeadersOnce" no dropdown → Run.
 * Não causa nenhum dano se já tiver sido aplicada.
 */
function migrateHeadersOnce() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('respostas');
  if (!sh) {
    // Logger em vez de getUi() — getUi() só funciona se script estiver atrelado a uma
    // planilha aberta na interface. Logger funciona em qualquer contexto de execução
    // (editor standalone, trigger, etc).
    Logger.log('ERRO: Aba "respostas" não encontrada.');
    return;
  }
  ensureHeaders(sh);
  Logger.log('Migration concluída. Cabeçalho agora tem ' + sh.getLastColumn() + ' colunas.');
}

function setupDashboards(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const r = "respostas";

  // ════════════════════════════════════════════════════════════════════════
  // ABA 1: resumo — métricas de volume, origem, intent, qualidade, engajamento
  // ════════════════════════════════════════════════════════════════════════
  let sh = ss.getSheetByName('resumo') || ss.insertSheet('resumo');
  sh.clear();
  sh.getRange('A1').setValue('PETNANNY — DASHBOARD').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Atualiza automático conforme novas respostas chegam').setFontSize(10).setFontColor('#888');
  // Mapeamento de colunas (referência do FULL_HEADERS atual):
  //   A=ts_server  D=origem  C=submission_n  H=exp_matched  Q=top3_key
  //   AR=post_feedback  AW=intent_inicial
  const rows = [
    ['', ''],
    ['VOLUME', ''],
    ['Total de quizes', `=COUNTA(${r}!A2:A)`],
    ['Hoje', `=COUNTIF(${r}!A2:A,">="&TODAY())`],
    ['Últimos 7 dias', `=COUNTIF(${r}!A2:A,">="&TODAY()-7)`],
    ['Últimos 30 dias', `=COUNTIF(${r}!A2:A,">="&TODAY()-30)`],
    ['', ''],
    ['ORIGEM', ''],
    ['Comprar', `=COUNTIF(${r}!D2:D,"comprar")`],
    ['Adotar', `=COUNTIF(${r}!D2:D,"adotar")`],
    ['% adoção', `=IFERROR(COUNTIF(${r}!D2:D,"adotar")/COUNTA(${r}!A2:A),0)`],
    ['', ''],
    ['INTENT INICIAL', ''],
    ['Já decidiu', `=COUNTIF(${r}!AW2:AW,"intent_decidido")`],
    ['Pesquisando', `=COUNTIF(${r}!AW2:AW,"intent_pesquisando")`],
    ['Já tem cão', `=COUNTIF(${r}!AW2:AW,"intent_existente")`],
    ['Só curiosidade', `=COUNTIF(${r}!AW2:AW,"intent_curioso")`],
    ['', ''],
    ['QUALIDADE DE MATCH', ''],
    ['Top3 vazio (perfil difícil)', `=COUNTA(${r}!A2:A)-COUNTA(${r}!Q2:Q)`],
    ['% perfil difícil', `=IFERROR((COUNTA(${r}!A2:A)-COUNTA(${r}!Q2:Q))/COUNTA(${r}!A2:A),0)`],
    ['Recebeu raça desejada no top3', `=COUNTIF(${r}!H2:H,"TRUE")`],
    ['Não recebeu', `=COUNTIF(${r}!H2:H,"FALSE")`],
    ['% match com desejada', `=IFERROR(COUNTIF(${r}!H2:H,"TRUE")/(COUNTIF(${r}!H2:H,"TRUE")+COUNTIF(${r}!H2:H,"FALSE")),0)`],
    ['', ''],
    ['ENGAJAMENTO', ''],
    ['Quizes com feedback escrito', `=COUNTIF(${r}!AR2:AR,"<>")`],
    ['% com feedback', `=IFERROR(COUNTIF(${r}!AR2:AR,"<>")/COUNTA(${r}!A2:A),0)`],
    ['1ª submissão (dataset limpo)', `=COUNTIF(${r}!C2:C,1)`],
    ['Refazem o quiz (n>=2)', `=COUNTIF(${r}!C2:C,">=2")`]
  ];
  for(let i=0; i<rows.length; i++){
    sh.getRange(i+4, 1).setValue(rows[i][0]);
    if(typeof rows[i][1]==='string' && rows[i][1].startsWith('=')) sh.getRange(i+4, 2).setFormula(rows[i][1]);
    else sh.getRange(i+4, 2).setValue(rows[i][1]);
  }
  // Linhas das %: B14 (% adoção), B22 (% perfil difícil), B25 (% match desejada), B28 (% feedback)
  ['B14','B22','B25','B28'].forEach(c=>sh.getRange(c).setNumberFormat('0.0%'));
  // Headers das seções (negrito verde)
  ['A6','A11','A16','A21','A28'].forEach(c=>sh.getRange(c).setFontWeight('bold').setFontColor('#7a9970'));
  sh.setColumnWidth(1, 320); sh.setColumnWidth(2, 100);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 2: top_racas — distribuição de top1
  // L = top1_name
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('top_racas') || ss.insertSheet('top_racas');
  sh.clear();
  sh.getRange('A1').setValue('TOP RAÇAS RECOMENDADAS (como top1)').setFontWeight('bold').setFontSize(14);
  sh.getRange('A3:C3').setValues([['Raça','Vezes recomendada','% do total']]);
  sh.getRange('A3:C3').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A4').setFormula(`=QUERY(${r}!L2:L,"select L, count(L) where L is not null and L<>'' group by L order by count(L) desc label count(L) ''",0)`);
  sh.getRange('C4').setFormula(`=ARRAYFORMULA(IF(B4:B="","",IFERROR(B4:B/SUM(B4:B),0)))`);
  sh.getRange('C:C').setNumberFormat('0.0%');
  sh.setColumnWidth(1, 240);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 3: expectation_gap — desejou X, recebeu X no top3?
  // F = desired_breed   H = exp_matched
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('expectation_gap') || ss.insertSheet('expectation_gap');
  sh.clear();
  sh.getRange('A1').setValue('GAP DE EXPECTATIVA — quem desejou X, recebeu X no top3?').setFontWeight('bold').setFontSize(14);
  sh.getRange('A4:D4').setValues([['Raça desejada','Vezes desejada','Matched no top3','% match']]);
  sh.getRange('A4:D4').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A5').setFormula(`=QUERY(${r}!F2:F,"select F, count(F) where F is not null and F<>'' group by F order by count(F) desc label count(F) ''",0)`);
  sh.getRange('C5').setFormula(`=ARRAYFORMULA(IF(A5:A="","",IFERROR(COUNTIFS(${r}!F2:F,A5:A,${r}!H2:H,"TRUE"),0)))`);
  sh.getRange('D5').setFormula(`=ARRAYFORMULA(IF(B5:B="","",IFERROR(C5:C/B5:B,0)))`);
  sh.getRange('D:D').setNumberFormat('0.0%');
  sh.setColumnWidth(1, 220);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 4: feedback_browser — feedback escrito pra ler corrido
  // A=ts D=origem L=top1_name M=top1_pct F=desired_breed AR=post_feedback
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('feedback_browser') || ss.insertSheet('feedback_browser');
  sh.clear();
  sh.getRange('A1').setValue('FEEDBACK ESCRITO — leitura corrida').setFontWeight('bold').setFontSize(14);
  sh.getRange('A3:F3').setValues([['Data','Origem','Top1','Match%','Desejou','Feedback']]);
  sh.getRange('A3:F3').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A4').setFormula(`=QUERY(${r}!A2:AR,"select A, D, L, M, F, AR where AR is not null and AR<>'' order by A desc label A '', D '', L '', M '', F '', AR ''",0)`);
  sh.setColumnWidth(6, 400);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 5: arquetipos — distribuição de arquetipo_id (perfis de tutor)
  // AZ = arquetipo_id
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('arquetipos') || ss.insertSheet('arquetipos');
  sh.clear();
  sh.getRange('A1').setValue('DISTRIBUIÇÃO DE ARQUÉTIPOS DE TUTOR').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Agrupamento por combinação habitat/ritmo/família/experiência/origem').setFontSize(10).setFontColor('#888');
  sh.getRange('A4:C4').setValues([['Arquétipo','Quantidade','% do total']]);
  sh.getRange('A4:C4').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A5').setFormula(`=QUERY(${r}!AZ2:AZ,"select AZ, count(AZ) where AZ is not null and AZ<>'' group by AZ order by count(AZ) desc label count(AZ) ''",0)`);
  sh.getRange('C5').setFormula(`=ARRAYFORMULA(IF(B5:B="","",IFERROR(B5:B/SUM(B5:B),0)))`);
  sh.getRange('C:C').setNumberFormat('0.0%');
  sh.setColumnWidth(1, 280);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 6: tcasa_analysis (NOVA) — distribuição do temperamento preferido +
  //   cruzamento com tcasa do top1 (sucesso do desempate Galgo×Papillon)
  // BC = tcasa_preferido   BD = tcasa_top1
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('tcasa_analysis') || ss.insertSheet('tcasa_analysis');
  sh.clear();
  sh.getRange('A1').setValue('TEMPERAMENTO EM CASA — preferência derivada e match com top1').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('tcasa_preferido derivado do conjoint (lat+conv+ind). 1=quer calmo · 2=neutro · 3=quer alerta.').setFontSize(10).setFontColor('#888');

  // Bloco 1: distribuição de tcasa_preferido
  sh.getRange('A4').setValue('DISTRIBUIÇÃO DA PREFERÊNCIA DERIVADA').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A5:C5').setValues([['tcasa_preferido','Quantidade','% do total']]);
  sh.getRange('A5:C5').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A6').setValue('1 (quer calmo)');
  sh.getRange('A7').setValue('2 (neutro)');
  sh.getRange('A8').setValue('3 (quer alerta)');
  sh.getRange('B6').setFormula(`=COUNTIF(${r}!BC2:BC,1)`);
  sh.getRange('B7').setFormula(`=COUNTIF(${r}!BC2:BC,2)`);
  sh.getRange('B8').setFormula(`=COUNTIF(${r}!BC2:BC,3)`);
  sh.getRange('C6').setFormula(`=IFERROR(B6/SUM(B6:B8),0)`);
  sh.getRange('C7').setFormula(`=IFERROR(B7/SUM(B6:B8),0)`);
  sh.getRange('C8').setFormula(`=IFERROR(B8/SUM(B6:B8),0)`);
  sh.getRange('C6:C8').setNumberFormat('0.0%');

  // Bloco 2: cruzamento — quando pessoa quer calmo (BC=1), top1 é calmo (BD=1)?
  sh.getRange('A11').setValue('CRUZAMENTO PREFERÊNCIA × TOP1 (sucesso do desempate)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A12').setValue('Quando pessoa derivou como X, top1 saiu com tcasa = ?').setFontSize(10).setFontColor('#888');
  sh.getRange('A13:E13').setValues([['Preferido →', 'Top1=1 calmo','Top1=2 médio','Top1=3 alerta','% coerente']]);
  sh.getRange('A13:E13').setFontWeight('bold').setBackground('#f0e8d8');
  // Linha "preferido = 1" (quer calmo) → quantas vezes top1 saiu como 1, 2, 3
  sh.getRange('A14').setValue('Quer calmo (1)');
  sh.getRange('B14').setFormula(`=COUNTIFS(${r}!BC2:BC,1,${r}!BD2:BD,1)`);
  sh.getRange('C14').setFormula(`=COUNTIFS(${r}!BC2:BC,1,${r}!BD2:BD,2)`);
  sh.getRange('D14').setFormula(`=COUNTIFS(${r}!BC2:BC,1,${r}!BD2:BD,3)`);
  sh.getRange('E14').setFormula(`=IFERROR(B14/(B14+C14+D14),0)`);
  // Linha "preferido = 2" (neutro)
  sh.getRange('A15').setValue('Neutro (2)');
  sh.getRange('B15').setFormula(`=COUNTIFS(${r}!BC2:BC,2,${r}!BD2:BD,1)`);
  sh.getRange('C15').setFormula(`=COUNTIFS(${r}!BC2:BC,2,${r}!BD2:BD,2)`);
  sh.getRange('D15').setFormula(`=COUNTIFS(${r}!BC2:BC,2,${r}!BD2:BD,3)`);
  sh.getRange('E15').setFormula(`=IFERROR(C15/(B15+C15+D15),0)`);
  // Linha "preferido = 3" (quer alerta)
  sh.getRange('A16').setValue('Quer alerta (3)');
  sh.getRange('B16').setFormula(`=COUNTIFS(${r}!BC2:BC,3,${r}!BD2:BD,1)`);
  sh.getRange('C16').setFormula(`=COUNTIFS(${r}!BC2:BC,3,${r}!BD2:BD,2)`);
  sh.getRange('D16').setFormula(`=COUNTIFS(${r}!BC2:BC,3,${r}!BD2:BD,3)`);
  sh.getRange('E16').setFormula(`=IFERROR(D16/(B16+C16+D16),0)`);
  sh.getRange('E14:E16').setNumberFormat('0.0%');
  sh.getRange('A18').setValue('Leia "% coerente" como: quando pessoa pediu calmo, quantas % das vezes recebeu top1 calmo? Quanto maior, melhor o desempate.').setFontSize(10).setFontColor('#888').setWrap(true);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 130); sh.setColumnWidth(3, 130); sh.setColumnWidth(4, 130); sh.setColumnWidth(5, 110);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 7: stated_vs_revealed (NOVA) — distribuição de stated_size + gap médio
  // BA = stated_size   BB = stated_revealed_gap
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('stated_vs_revealed') || ss.insertSheet('stated_vs_revealed');
  sh.clear();
  sh.getRange('A1').setValue('STATED × REVEALED — tela de silhuetas de tamanho').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('stated_size = tamanho que pessoa marcou na silhueta. Comparado com porte_imaginado derivado do conjoint. Gap > 1 = pessoa imaginou tamanho bem diferente do que escolheu nos pares.').setFontSize(10).setFontColor('#888').setWrap(true);

  // Bloco 1: distribuição stated_size
  sh.getRange('A5').setValue('DISTRIBUIÇÃO STATED_SIZE').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6:C6').setValues([['stated_size','Quantidade','% do total de quizes']]);
  sh.getRange('A6:C6').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A7').setValue('1 (Micro até 4kg)');
  sh.getRange('A8').setValue('2 (Pequeno 4-10kg)');
  sh.getRange('A9').setValue('3 (Médio 10-25kg)');
  sh.getRange('A10').setValue('4 (Grande 25-45kg)');
  sh.getRange('A11').setValue('5 (Gigante 45kg+)');
  sh.getRange('A12').setValue('(pulou)');
  for(let i=1; i<=5; i++){
    sh.getRange(6+i, 2).setFormula(`=COUNTIF(${r}!BA2:BA,${i})`);
    // % do total de quizes (não do total que respondeu) — assim a soma das 6
    // linhas (1-5 + pulou) dá 100%, comportamento mais intuitivo.
    sh.getRange(6+i, 3).setFormula(`=IFERROR(B${6+i}/COUNTA(${r}!A2:A),0)`);
  }
  // BUG FIX: COUNTIF(BA2:BA,"") conta TODAS as células vazias até linha 1000 do
  // Sheets, mesmo quando não há submissão correspondente — resultava em 997 e %
  // de 49850%. Solução: total de quizes menos os que responderam = pularam.
  sh.getRange('B12').setFormula(`=COUNTA(${r}!A2:A)-SUM(B7:B11)`);
  sh.getRange('C12').setFormula(`=IFERROR(B12/COUNTA(${r}!A2:A),0)`);
  sh.getRange('C7:C12').setNumberFormat('0.0%');

  // Bloco 2: distribuição do gap
  sh.getRange('A15').setValue('GAP STATED × REVEALED (quanto pessoa imaginou diferente do conjoint)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A16:B16').setValues([['Métrica','Valor']]);
  sh.getRange('A16:B16').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A17').setValue('Gap médio');
  sh.getRange('B17').setFormula(`=IFERROR(AVERAGE(${r}!BB2:BB),0)`);
  sh.getRange('A18').setValue('Gap >= 1 (alinhado a desalinhado leve)');
  sh.getRange('B18').setFormula(`=COUNTIF(${r}!BB2:BB,">=1")`);
  sh.getRange('A19').setValue('Gap >= 2 (desalinhamento sério — aparece nota no resultado)');
  sh.getRange('B19').setFormula(`=COUNTIF(${r}!BB2:BB,">=2")`);
  sh.getRange('A20').setValue('% com gap >= 2 (entre quem respondeu)');
  sh.getRange('B20').setFormula(`=IFERROR(B19/COUNTA(${r}!BB2:BB),0)`);
  sh.getRange('B20').setNumberFormat('0.0%');
  sh.getRange('B17').setNumberFormat('0.00');
  sh.setColumnWidth(1, 360); sh.setColumnWidth(2, 130);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 7b: stated_vs_revealed_deep (NOVA) — análises cruzadas profundas
  //
  // Hipótese de produto: o gap entre stated_size (silhueta marcada) e
  // porte_imaginado (derivado do conjoint) é o INSIGHT central do PetNanny.
  // É exatamente onde o produto entrega valor: pessoa imagina X, descobre via
  // pares que prefere Y. Aqui medimos esse gap em 4 dimensões.
  //
  // Colunas usadas:
  //   BA = stated_size (1-5)        AI = porte_imaginado (imag_pequeno/medio/grande)
  //   BB = stated_revealed_gap      AO = energia_imaginada
  //   BG = quick_reaction_top       BH = quick_reaction (bottom)
  //   AW = intent_inicial           AZ = arquetipo_id            D = origem
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('stated_vs_revealed_deep') || ss.insertSheet('stated_vs_revealed_deep');
  sh.clear();
  sh.getRange('A1').setValue('STATED × REVEALED — análise profunda do gap (insight central do produto)').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Onde pessoa imaginou um tamanho mas o conjoint revelou outro — o quiz capturou um desalinhamento que ela não tinha consciência. Esse é o valor que o produto entrega.').setFontSize(10).setFontColor('#888').setWrap(true);

  // ─── BLOCO 1: matriz stated × revealed ──────────────────────────────────
  // Cruza stated_size (BA, 1-5) com porte_imaginado (AI, 3 valores).
  // Mostra: das pessoas que IMAGINARAM micro, quantas o conjoint REVELOU
  // como querendo pequeno/médio/grande?
  sh.getRange('A5').setValue('1. MATRIZ STATED × REVEALED').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6').setValue('Linhas = stated (silhueta marcada). Colunas = revealed (conjoint). Diagonal = coerente. Fora da diagonal = gap.').setFontSize(10).setFontColor('#888').setWrap(true);
  sh.getRange('A8:E8').setValues([['Imaginou ↓ / Revelou →','Pequeno (1-2)','Médio (3)','Grande (4-5)','Total na linha']]);
  sh.getRange('A8:E8').setFontWeight('bold').setBackground('#f0e8d8');
  const statedLabels = [
    [1, 'Micro (1)'], [2, 'Pequeno (2)'], [3, 'Médio (3)'], [4, 'Grande (4)'], [5, 'Gigante (5)']
  ];
  statedLabels.forEach((row, i) => {
    const rowIdx = 9 + i;
    sh.getRange(rowIdx, 1).setValue(row[1]);
    // Pequeno revelado = imag_pequeno
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIFS(${r}!BA2:BA,${row[0]},${r}!AI2:AI,"imag_pequeno")`);
    // Médio revelado = imag_medio
    sh.getRange(rowIdx, 3).setFormula(`=COUNTIFS(${r}!BA2:BA,${row[0]},${r}!AI2:AI,"imag_medio")`);
    // Grande revelado = imag_grande
    sh.getRange(rowIdx, 4).setFormula(`=COUNTIFS(${r}!BA2:BA,${row[0]},${r}!AI2:AI,"imag_grande")`);
    sh.getRange(rowIdx, 5).setFormula(`=SUM(B${rowIdx}:D${rowIdx})`);
  });
  sh.getRange('A14').setValue('Total por revelado').setFontWeight('bold');
  sh.getRange('B14').setFormula('=SUM(B9:B13)');
  sh.getRange('C14').setFormula('=SUM(C9:C13)');
  sh.getRange('D14').setFormula('=SUM(D9:D13)');
  sh.getRange('E14').setFormula('=SUM(E9:E13)');
  sh.getRange('A14:E14').setBackground('#f8f4ee');

  // ─── BLOCO 2: aceitação x gap ───────────────────────────────────────────
  // Pessoas com gap alto aceitaram a recomendação? Mede via quick_reaction_top
  // (sobre a experiência do quiz) e quick_reaction (sobre o resultado).
  sh.getRange('A17').setValue('2. PESSOAS COM GAP — ACEITARAM A RECOMENDAÇÃO?').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A18').setValue('Quem teve gap alto entre stated e revealed: 👍/😐/👎 sobre a experiência e sobre o resultado. Se gap alto + 👍 = quiz quebrou a expectativa de forma positiva (caso de uso ideal).').setFontSize(10).setFontColor('#888').setWrap(true);
  sh.getRange('A20:D20').setValues([['Faixa de gap','👍 positivo','😐 neutro','👎 negativo']]);
  sh.getRange('A20:D20').setFontWeight('bold').setBackground('#f0e8d8');
  // Sub-bloco: reação sobre o resultado (BH = quick_reaction bottom)
  sh.getRange('A21').setValue('Resultado final (BH):').setFontStyle('italic').setFontSize(10);
  sh.getRange('A22').setValue('Gap 0 (coerente)');
  sh.getRange('B22').setFormula(`=COUNTIFS(${r}!BB2:BB,0,${r}!BH2:BH,"👍")`);
  sh.getRange('C22').setFormula(`=COUNTIFS(${r}!BB2:BB,0,${r}!BH2:BH,"😐")`);
  sh.getRange('D22').setFormula(`=COUNTIFS(${r}!BB2:BB,0,${r}!BH2:BH,"👎")`);
  sh.getRange('A23').setValue('Gap 1-2 (desalinhado leve)');
  sh.getRange('B23').setFormula(`=COUNTIFS(${r}!BB2:BB,">=1",${r}!BB2:BB,"<=2",${r}!BH2:BH,"👍")`);
  sh.getRange('C23').setFormula(`=COUNTIFS(${r}!BB2:BB,">=1",${r}!BB2:BB,"<=2",${r}!BH2:BH,"😐")`);
  sh.getRange('D23').setFormula(`=COUNTIFS(${r}!BB2:BB,">=1",${r}!BB2:BB,"<=2",${r}!BH2:BH,"👎")`);
  sh.getRange('A24').setValue('Gap >=2 (desalinhado sério)');
  sh.getRange('B24').setFormula(`=COUNTIFS(${r}!BB2:BB,">=2",${r}!BH2:BH,"👍")`);
  sh.getRange('C24').setFormula(`=COUNTIFS(${r}!BB2:BB,">=2",${r}!BH2:BH,"😐")`);
  sh.getRange('D24').setFormula(`=COUNTIFS(${r}!BB2:BB,">=2",${r}!BH2:BH,"👎")`);

  // ─── BLOCO 3: gap médio por intent ──────────────────────────────────────
  // Quem entrou no quiz com qual intent tem gap maior?
  sh.getRange('A27').setValue('3. GAP MÉDIO POR INTENT INICIAL').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A28').setValue('Quem entrou "já decidiu" tem gap maior ou menor que quem entrou "pesquisando"? Se decidido tiver gap maior, isso sugere que ela "decidiu" mas o conjoint mostra outra coisa.').setFontSize(10).setFontColor('#888').setWrap(true);
  sh.getRange('A30:C30').setValues([['Intent inicial','Quantidade','Gap médio']]);
  sh.getRange('A30:C30').setFontWeight('bold').setBackground('#f0e8d8');
  const intents = [
    ['Já decidiu','intent_decidido'],
    ['Pesquisando','intent_pesquisando'],
    ['Já tem cão','intent_existente'],
    ['Só curiosidade','intent_curioso']
  ];
  intents.forEach((row, i) => {
    const rowIdx = 31 + i;
    sh.getRange(rowIdx, 1).setValue(row[0]);
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIF(${r}!AW2:AW,"${row[1]}")`);
    // Gap médio só pra quem respondeu silhueta (BB não vazio)
    sh.getRange(rowIdx, 3).setFormula(`=IFERROR(AVERAGEIFS(${r}!BB2:BB,${r}!AW2:AW,"${row[1]}",${r}!BB2:BB,">=0"),0)`);
  });
  sh.getRange('C31:C34').setNumberFormat('0.00');

  // ─── BLOCO 4: gap por arquetipo de tutor ────────────────────────────────
  // Qual perfil de tutor é mais inconsistente entre o que imagina e o que escolhe?
  sh.getRange('A37').setValue('4. GAP POR ARQUETIPO DE TUTOR').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A38').setValue('Arquétipos com gap médio alto = público-alvo do PetNanny (precisam do quiz pra desalinhar do estereótipo). Arquétipos com gap baixo = pessoas alinhadas, talvez não precisem do quiz.').setFontSize(10).setFontColor('#888').setWrap(true);
  sh.getRange('A40:C40').setValues([['Arquétipo','Quantidade','Gap médio']]);
  sh.getRange('A40:C40').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A41').setFormula(`=QUERY(${r}!AZ2:BB,"select AZ, count(AZ), avg(BB) where AZ is not null and AZ<>'' and BB is not null group by AZ order by avg(BB) desc label count(AZ) '', avg(BB) ''",0)`);
  sh.getRange('C41:C').setNumberFormat('0.00');

  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(2, 130); sh.setColumnWidth(3, 130); sh.setColumnWidth(4, 130); sh.setColumnWidth(5, 130);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 8: behavior (NOVA) — métricas pós-quiz_complete
  // BI=cards_expanded BK=whatif_used BO=pdf_downloaded BP=share_clicked
  // BQ=restart_clicked BR=reached_bottom
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('behavior') || ss.insertSheet('behavior');
  sh.clear();
  sh.getRange('A1').setValue('BEHAVIOR — o que pessoas fazem APÓS ver o resultado').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Eventos atualizados via behavior_update no doPost. Permite cohort cruzando perfil com comportamento.').setFontSize(10).setFontColor('#888').setWrap(true);

  sh.getRange('A5:C5').setValues([['Ação','Vezes','% sobre total de quizes']]);
  sh.getRange('A5:C5').setFontWeight('bold').setBackground('#f0e8d8');
  const behaviorRows = [
    ['Expandiu pelo menos 1 card (cards_expanded > 0)', `=COUNTIF(${r}!BI2:BI,">0")`],
    ['Usou whatif (whatif_used = TRUE)',                `=COUNTIF(${r}!BK2:BK,"TRUE")`],
    ['Baixou PDF do guia (pdf_downloaded = TRUE)',      `=COUNTIF(${r}!BO2:BO,"TRUE")`],
    ['Clicou em compartilhar (share_clicked = TRUE)',   `=COUNTIF(${r}!BP2:BP,"TRUE")`],
    ['Refez quiz pelo botão (restart_clicked = TRUE)',  `=COUNTIF(${r}!BQ2:BQ,"TRUE")`],
    ['Rolou até o fim (reached_bottom = TRUE)',         `=COUNTIF(${r}!BR2:BR,"TRUE")`]
  ];
  for(let i=0; i<behaviorRows.length; i++){
    sh.getRange(6+i, 1).setValue(behaviorRows[i][0]);
    sh.getRange(6+i, 2).setFormula(behaviorRows[i][1]);
    sh.getRange(6+i, 3).setFormula(`=IFERROR(B${6+i}/COUNTA(${r}!A2:A),0)`);
  }
  sh.getRange('C6:C11').setNumberFormat('0.0%');

  // Bloco 2: quick reactions
  sh.getRange('A14').setValue('QUICK REACTIONS (emojis nas 2 perguntas separadas)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A15').setValue('Top: "O quiz fez sentido?" (sobre a experiência) · Bottom: "Esse resultado combinou?" (sobre a recomendação)').setFontSize(10).setFontColor('#888').setWrap(true);
  sh.getRange('A17:C17').setValues([['Emoji','Top (BG)','Bottom (BH)']]);
  sh.getRange('A17:C17').setFontWeight('bold').setBackground('#f0e8d8');
  // BG=quick_reaction_top   BH=quick_reaction (bottom)
  const emojis = ['👍','😐','👎'];
  for(let i=0; i<emojis.length; i++){
    sh.getRange(18+i, 1).setValue(emojis[i]);
    sh.getRange(18+i, 2).setFormula(`=COUNTIF(${r}!BG2:BG,"${emojis[i]}")`);
    sh.getRange(18+i, 3).setFormula(`=COUNTIF(${r}!BH2:BH,"${emojis[i]}")`);
  }
  sh.setColumnWidth(1, 380); sh.setColumnWidth(2, 100); sh.setColumnWidth(3, 100);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 9: funil_temporal (NOVA) — cohort por semana e por mês
  //
  // Razão: cada deploy de mudança no scoring/insights/UI pode mover métricas.
  // Sem cohort temporal, é impossível ver se mudança X melhorou ou piorou.
  // 2 granularidades:
  //   - Por semana: ruidoso com N pequeno, mas detalhe pra detecção rápida
  //   - Por mês: agrega ruído, sinal robusto desde N=100+
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('funil_temporal') || ss.insertSheet('funil_temporal');
  sh.clear();
  sh.getRange('A1').setValue('FUNIL TEMPORAL — qualidade do produto ao longo do tempo').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Use pra ver se cada deploy melhorou ou piorou métricas. Mensal é mais robusto, semanal capta mudanças rápidas.').setFontSize(10).setFontColor('#888').setWrap(true);

  // Bloco 1: cohort SEMANAL — últimas 12 semanas (visão recente)
  sh.getRange('A5').setValue('POR SEMANA (últimas 12)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6:F6').setValues([['Semana','Quizes','% 👍 (top)','% 👍 (bottom)','% match desejada','Gap stated×revealed médio']]);
  sh.getRange('A6:F6').setFontWeight('bold').setBackground('#f0e8d8');
  // QUERY agrupando por semana via TRUNC do timestamp em dias e divisão por 7.
  // Hack: usa-se INT((A - DATE(1970,1,1))/7) como bucket de semana.
  // Mas Sheets Query Language não tem TRUNC complexo — usa-se WEEK(A) que pega
  // semana do ano. Funciona pra olhar últimas 12 semanas.
  // BG=reaction_top  BH=reaction_bottom  H=exp_matched  BB=stated_revealed_gap
  // Geramos as 12 linhas via fórmula manual com WEEKNUM:
  // Linha 7: semana atual, linha 8: -1 semana, ..., linha 18: -11 semanas.
  for(let w = 0; w < 12; w++){
    const rowIdx = 7 + w;
    // Data de início da semana = TODAY() - w*7 - WEEKDAY(TODAY())
    // Usamos uma fórmula que retorna "DD/MM" do começo da semana
    sh.getRange(rowIdx, 1).setFormula(`=TEXT(TODAY()-${w}*7-WEEKDAY(TODAY())+1,"dd/mm")&"-"&TEXT(TODAY()-${w}*7-WEEKDAY(TODAY())+7,"dd/mm")`);
    // # quizes nesta semana
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7))`);
    // % 👍 top
    sh.getRange(rowIdx, 3).setFormula(`=IFERROR(COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!BG2:BG,"👍")/MAX(1,COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!BG2:BG,"<>")),0)`);
    // % 👍 bottom
    sh.getRange(rowIdx, 4).setFormula(`=IFERROR(COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!BH2:BH,"👍")/MAX(1,COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!BH2:BH,"<>")),0)`);
    // % match desejada (H=TRUE entre quem tinha desejada)
    sh.getRange(rowIdx, 5).setFormula(`=IFERROR(COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!H2:H,"TRUE")/MAX(1,COUNTIFS(${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!H2:H,"<>")),0)`);
    // Gap médio
    sh.getRange(rowIdx, 6).setFormula(`=IFERROR(AVERAGEIFS(${r}!BB2:BB,${r}!A2:A,">="&(TODAY()-${w}*7-WEEKDAY(TODAY())+1),${r}!A2:A,"<="&(TODAY()-${w}*7-WEEKDAY(TODAY())+7),${r}!BB2:BB,">=0"),0)`);
  }
  sh.getRange('C7:E18').setNumberFormat('0.0%');
  sh.getRange('F7:F18').setNumberFormat('0.00');

  // Bloco 2: cohort MENSAL — últimos 12 meses
  sh.getRange('A21').setValue('POR MÊS (últimos 12)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A22:F22').setValues([['Mês','Quizes','% 👍 (top)','% 👍 (bottom)','% match desejada','Gap stated×revealed médio']]);
  sh.getRange('A22:F22').setFontWeight('bold').setBackground('#f0e8d8');
  for(let m = 0; m < 12; m++){
    const rowIdx = 23 + m;
    // Mês: começo e fim usando EOMONTH
    sh.getRange(rowIdx, 1).setFormula(`=TEXT(EOMONTH(TODAY(),-${m}-1)+1,"mm/yyyy")`);
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}))`);
    sh.getRange(rowIdx, 3).setFormula(`=IFERROR(COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!BG2:BG,"👍")/MAX(1,COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!BG2:BG,"<>")),0)`);
    sh.getRange(rowIdx, 4).setFormula(`=IFERROR(COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!BH2:BH,"👍")/MAX(1,COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!BH2:BH,"<>")),0)`);
    sh.getRange(rowIdx, 5).setFormula(`=IFERROR(COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!H2:H,"TRUE")/MAX(1,COUNTIFS(${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!H2:H,"<>")),0)`);
    sh.getRange(rowIdx, 6).setFormula(`=IFERROR(AVERAGEIFS(${r}!BB2:BB,${r}!A2:A,">="&(EOMONTH(TODAY(),-${m}-1)+1),${r}!A2:A,"<="&EOMONTH(TODAY(),-${m}),${r}!BB2:BB,">=0"),0)`);
  }
  sh.getRange('C23:E34').setNumberFormat('0.0%');
  sh.getRange('F23:F34').setNumberFormat('0.00');
  sh.setColumnWidth(1, 150);
  for(let c=2; c<=6; c++) sh.setColumnWidth(c, 130);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 10: qualidade_x_perfil (NOVA) — match por dimensões simples
  //
  // Em vez de granular por arquetipo_id (50+ combinações), agrupamos em 3
  // dimensões de alto valor: experiência, moradia, presença de criança.
  // Cada uma com 2-3 buckets, N por bucket viável já com 100 quizes.
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('qualidade_x_perfil') || ss.insertSheet('qualidade_x_perfil');
  sh.clear();
  sh.getRange('A1').setValue('QUALIDADE DO MATCH POR PERFIL DO TUTOR').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Identifica perfis onde o produto está acertando mais (👍) ou errando mais (👎). Buckets grossos pra ter N suficiente em cada.').setFontSize(10).setFontColor('#888').setWrap(true);

  // Bloco 1: por experiência (AH)
  sh.getRange('A5').setValue('POR EXPERIÊNCIA').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6:E6').setValues([['Experiência','Quizes','% 👍 (top)','% 👍 (bottom)','% match desejada']]);
  sh.getRange('A6:E6').setFontWeight('bold').setBackground('#f0e8d8');
  const exps = [
    ['Primeiro cão','primeiro_cao'],
    ['Tem experiência','experiencia'],
    ['Experiência avançada','experiencia_avancada']
  ];
  exps.forEach((row, i) => {
    const rowIdx = 7 + i;
    sh.getRange(rowIdx, 1).setValue(row[0]);
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIF(${r}!AH2:AH,"${row[1]}")`);
    sh.getRange(rowIdx, 3).setFormula(`=IFERROR(COUNTIFS(${r}!AH2:AH,"${row[1]}",${r}!BG2:BG,"👍")/MAX(1,COUNTIFS(${r}!AH2:AH,"${row[1]}",${r}!BG2:BG,"<>")),0)`);
    sh.getRange(rowIdx, 4).setFormula(`=IFERROR(COUNTIFS(${r}!AH2:AH,"${row[1]}",${r}!BH2:BH,"👍")/MAX(1,COUNTIFS(${r}!AH2:AH,"${row[1]}",${r}!BH2:BH,"<>")),0)`);
    sh.getRange(rowIdx, 5).setFormula(`=IFERROR(COUNTIFS(${r}!AH2:AH,"${row[1]}",${r}!H2:H,"TRUE")/MAX(1,COUNTIFS(${r}!AH2:AH,"${row[1]}",${r}!H2:H,"<>")),0)`);
  });
  sh.getRange('C7:E9').setNumberFormat('0.0%');

  // Bloco 2: por moradia (T)
  sh.getRange('A12').setValue('POR MORADIA').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A13:E13').setValues([['Moradia','Quizes','% 👍 (top)','% 👍 (bottom)','% match desejada']]);
  sh.getRange('A13:E13').setFontWeight('bold').setBackground('#f0e8d8');
  const moradias = [
    ['Apto sem externo','sem_externo'],
    ['Apto com sacada','externo_pequeno'],
    ['Casa com quintal','externo_grande'],
    ['Sítio','sitio']
  ];
  moradias.forEach((row, i) => {
    const rowIdx = 14 + i;
    sh.getRange(rowIdx, 1).setValue(row[0]);
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIF(${r}!T2:T,"${row[1]}")`);
    sh.getRange(rowIdx, 3).setFormula(`=IFERROR(COUNTIFS(${r}!T2:T,"${row[1]}",${r}!BG2:BG,"👍")/MAX(1,COUNTIFS(${r}!T2:T,"${row[1]}",${r}!BG2:BG,"<>")),0)`);
    sh.getRange(rowIdx, 4).setFormula(`=IFERROR(COUNTIFS(${r}!T2:T,"${row[1]}",${r}!BH2:BH,"👍")/MAX(1,COUNTIFS(${r}!T2:T,"${row[1]}",${r}!BH2:BH,"<>")),0)`);
    sh.getRange(rowIdx, 5).setFormula(`=IFERROR(COUNTIFS(${r}!T2:T,"${row[1]}",${r}!H2:H,"TRUE")/MAX(1,COUNTIFS(${r}!T2:T,"${row[1]}",${r}!H2:H,"<>")),0)`);
  });
  sh.getRange('C14:E17').setNumberFormat('0.0%');

  // Bloco 3: por presença de criança (Y)
  sh.getRange('A20').setValue('POR PRESENÇA DE CRIANÇA').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A21:E21').setValues([['Crianças','Quizes','% 👍 (top)','% 👍 (bottom)','% match desejada']]);
  sh.getRange('A21:E21').setFontWeight('bold').setBackground('#f0e8d8');
  const kids = [
    ['Sem crianças','sem_criancas'],
    ['Criança grande (>6)','criancas'],
    ['Criança pequena (<6)','criancas_pequenas'],
    ['Planeja ter','planeja_criancas']
  ];
  kids.forEach((row, i) => {
    const rowIdx = 22 + i;
    sh.getRange(rowIdx, 1).setValue(row[0]);
    sh.getRange(rowIdx, 2).setFormula(`=COUNTIF(${r}!Y2:Y,"${row[1]}")`);
    sh.getRange(rowIdx, 3).setFormula(`=IFERROR(COUNTIFS(${r}!Y2:Y,"${row[1]}",${r}!BG2:BG,"👍")/MAX(1,COUNTIFS(${r}!Y2:Y,"${row[1]}",${r}!BG2:BG,"<>")),0)`);
    sh.getRange(rowIdx, 4).setFormula(`=IFERROR(COUNTIFS(${r}!Y2:Y,"${row[1]}",${r}!BH2:BH,"👍")/MAX(1,COUNTIFS(${r}!Y2:Y,"${row[1]}",${r}!BH2:BH,"<>")),0)`);
    sh.getRange(rowIdx, 5).setFormula(`=IFERROR(COUNTIFS(${r}!Y2:Y,"${row[1]}",${r}!H2:H,"TRUE")/MAX(1,COUNTIFS(${r}!Y2:Y,"${row[1]}",${r}!H2:H,"<>")),0)`);
  });
  sh.getRange('C22:E25').setNumberFormat('0.0%');
  sh.getRange('A28').setValue('Atenção: linhas com Quizes < 10 são ruidosas. Espere N≥30 por bucket pra ter sinal.').setFontSize(10).setFontColor('#888').setFontStyle('italic');
  sh.setColumnWidth(1, 240);
  for(let c=2; c<=5; c++) sh.setColumnWidth(c, 130);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 11: bugs_a_investigar (NOVA) — lista de quizes problemáticos
  //
  // Lista quizes que apresentam sinais de bug ou caso extremo. Uma linha por
  // quiz problemático. Filtro pra cada categoria de problema.
  //
  // Critérios:
  //  - top3 vazio (Q vazio mas A preenchido): perfil filtrado por hard filters
  //  - raça desejada "outra" não no catálogo (G vazio + F preenchido)
  //  - exp_matched=TRUE mas top1_key != desired_breed_key (inconsistência)
  //  - gap stated×revealed >= 3 (desalinhamento extremo)
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('bugs_a_investigar') || ss.insertSheet('bugs_a_investigar');
  sh.clear();
  sh.getRange('A1').setValue('BUGS A INVESTIGAR — linhas problemáticas pra olhar').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Cada bloco lista quizes com um sinal específico de bug ou caso extremo. Use pra investigar problemas reais antes de virar tendência.').setFontSize(10).setFontColor('#888').setWrap(true);

  // Bloco 1: TOP3 VAZIO (perfil filtrado demais)
  sh.getRange('A5').setValue('1. TOP3 VAZIO (pessoa não recebeu nenhuma raça)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6').setValue('Hard filters cortaram catálogo inteiro. Perfil pode ser impossível (clima+criança+alergia juntos) ou bug.').setFontSize(10).setFontColor('#888');
  sh.getRange('A7:E7').setValues([['Data','Origem','Moradia','Crianças','Raça desejada']]);
  sh.getRange('A7:E7').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A8').setFormula(`=QUERY(${r}!A2:Y,"select A, D, T, Y, F where K is null or K='' order by A desc limit 50 label A '', D '', T '', Y '', F ''",0)`);
  
  // Bloco 2: RAÇA DESEJADA NÃO CATALOGADA
  sh.getRange('A60').setValue('2. RAÇA DESEJADA NÃO NO CATÁLOGO (escreveu "outra" ou raça inexistente)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A61').setValue('Pessoa digitou raça que não está no catálogo. Pode ser bug de input ou raça pra adicionar.').setFontSize(10).setFontColor('#888');
  sh.getRange('A62:C62').setValues([['Data','O que digitou','Email']]);
  sh.getRange('A62:C62').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A63').setFormula(`=QUERY(${r}!A2:G,"select A, F, E where F is not null and F<>'' and (G is null or G='' or G='outra') order by A desc limit 50 label A '', F '', E ''",0)`);

  // Bloco 3: GAP STATED×REVEALED EXTREMO (>=3)
  sh.getRange('A115').setValue('3. GAP STATED×REVEALED >=3 (desalinhamento extremo)').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A116').setValue('Pessoa imaginou tamanho muito diferente do que o conjoint revelou. Caso de uso ideal ou erro do conjoint.').setFontSize(10).setFontColor('#888');
  sh.getRange('A117:F117').setValues([['Data','stated_size','porte_imaginado','top1','reaction_bottom','feedback']]);
  sh.getRange('A117:F117').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A118').setFormula(`=QUERY(${r}!A2:BH,"select A, BA, AI, L, BH, AR where BB >= 3 order by A desc limit 50 label A '', BA '', AI '', L '', BH '', AR ''",0)`);

  // Bloco 4: INCONSISTÊNCIA exp_matched
  sh.getRange('A170').setValue('4. INCONSISTÊNCIA: exp_matched=TRUE mas top1_key ≠ desired_breed_key').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A171').setValue('Match foi marcado mas a raça top1 não é a desejada — pode ser que matched no top2 ou top3.').setFontSize(10).setFontColor('#888');
  sh.getRange('A172:E172').setValues([['Data','Raça desejada','top1','top2','top3']]);
  sh.getRange('A172:E172').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A173').setFormula(`=QUERY(${r}!A2:Q,"select A, F, K, N, Q where H='TRUE' and G is not null and G<>'' and K<>G order by A desc limit 50 label A '', F '', K '', N '', Q ''",0)`);

  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 200); sh.setColumnWidth(3, 200); sh.setColumnWidth(4, 200); sh.setColumnWidth(5, 200); sh.setColumnWidth(6, 300);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 12: reaction_matrix (NOVA) — matriz 3×3 de quick_reaction_top × bottom
  //
  // Top = "o quiz fez sentido?" (sobre experiência)
  // Bottom = "esse resultado combinou?" (sobre o output do scoring)
  //
  // As 9 combinações revelam diagnóstico do problema:
  //  - 👍 top + 👍 bottom: ideal
  //  - 👍 top + 👎 bottom: experiência boa, scoring errado
  //  - 👎 top + 👍 bottom: experiência ruim, mas sortou raça boa
  //  - 👎 top + 👎 bottom: falha total
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('reaction_matrix') || ss.insertSheet('reaction_matrix');
  sh.clear();
  sh.getRange('A1').setValue('MATRIZ DE REAÇÕES — experiência × resultado').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Cruza quick_reaction_top (experiência) × quick_reaction_bottom (resultado). Diagnóstico do problema: 👍 top + 👎 bottom ⇒ scoring errado. 👎 top + 👍 bottom ⇒ experiência ruim mas sorte.').setFontSize(10).setFontColor('#888').setWrap(true);

  sh.getRange('A5').setValue('MATRIZ DE CONTAGEM').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6:E6').setValues([['Top ↓ / Bottom →','👍','😐','👎','Total Top']]);
  sh.getRange('A6:E6').setFontWeight('bold').setBackground('#f0e8d8');
  const reacts = ['👍','😐','👎'];
  reacts.forEach((rt, i) => {
    const rowIdx = 7 + i;
    sh.getRange(rowIdx, 1).setValue(rt);
    reacts.forEach((rb, j) => {
      sh.getRange(rowIdx, 2+j).setFormula(`=COUNTIFS(${r}!BG2:BG,"${rt}",${r}!BH2:BH,"${rb}")`);
    });
    sh.getRange(rowIdx, 5).setFormula(`=SUM(B${rowIdx}:D${rowIdx})`);
  });
  sh.getRange('A10').setValue('Total Bottom');
  sh.getRange('B10').setFormula('=SUM(B7:B9)');
  sh.getRange('C10').setFormula('=SUM(C7:C9)');
  sh.getRange('D10').setFormula('=SUM(D7:D9)');
  sh.getRange('E10').setFormula('=SUM(E7:E9)');
  sh.getRange('A10:E10').setBackground('#f8f4ee').setFontWeight('bold');

  // Interpretação
  sh.getRange('A13').setValue('INTERPRETAÇÃO RÁPIDA').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A14:B14').setValues([['Padrão','# quizes']]);
  sh.getRange('A14:B14').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A15').setValue('👍👍 Ideal (experiência boa + resultado bom)');
  sh.getRange('B15').setFormula(`=COUNTIFS(${r}!BG2:BG,"👍",${r}!BH2:BH,"👍")`);
  sh.getRange('A16').setValue('👍👎 PROBLEMA NO SCORING (quiz bom, resultado errado)');
  sh.getRange('B16').setFormula(`=COUNTIFS(${r}!BG2:BG,"👍",${r}!BH2:BH,"👎")`);
  sh.getRange('A17').setValue('👎👍 PROBLEMA NA EXPERIÊNCIA (quiz ruim, deu sorte)');
  sh.getRange('B17').setFormula(`=COUNTIFS(${r}!BG2:BG,"👎",${r}!BH2:BH,"👍")`);
  sh.getRange('A18').setValue('👎👎 Falha total');
  sh.getRange('B18').setFormula(`=COUNTIFS(${r}!BG2:BG,"👎",${r}!BH2:BH,"👎")`);
  sh.getRange('A19').setValue('Não responderam ambos');
  sh.getRange('B19').setFormula(`=COUNTA(${r}!A2:A)-(COUNTIFS(${r}!BG2:BG,"<>",${r}!BH2:BH,"<>"))`);

  sh.setColumnWidth(1, 360); sh.setColumnWidth(2, 100); sh.setColumnWidth(3, 100); sh.setColumnWidth(4, 100); sh.setColumnWidth(5, 110);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 13: top_racas_por_origem (NOVA) — separa comprar vs adotar
  //
  // Aba top_racas mistura comprar+adotar. Em adoção, SRD sempre vem #1 (regra
  // do produto) — distorce a leitura geral. Separar mostra a realidade real
  // de cada fluxo.
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('top_racas_por_origem') || ss.insertSheet('top_racas_por_origem');
  sh.clear();
  sh.getRange('A1').setValue('TOP RAÇAS — separadas por origem (comprar vs adotar)').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Aba top_racas geral mistura os dois fluxos. Adoção sempre tem SRD #1 (regra do produto), o que distorce. Aqui separa.').setFontSize(10).setFontColor('#888').setWrap(true);

  // Coluna esquerda: COMPRAR
  sh.getRange('A4').setValue('FLUXO COMPRAR').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A5:B5').setValues([['Raça','Vezes como top1']]);
  sh.getRange('A5:B5').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A6').setFormula(`=QUERY(${r}!D2:L,"select L, count(L) where D='comprar' and L is not null and L<>'' group by L order by count(L) desc label count(L) ''",0)`);

  // Coluna direita: ADOTAR
  sh.getRange('D4').setValue('FLUXO ADOTAR').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('D5:E5').setValues([['Raça','Vezes como top1']]);
  sh.getRange('D5:E5').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('D6').setFormula(`=QUERY(${r}!D2:L,"select L, count(L) where D='adotar' and L is not null and L<>'' group by L order by count(L) desc label count(L) ''",0)`);

  sh.setColumnWidth(1, 240); sh.setColumnWidth(2, 140);
  sh.setColumnWidth(3, 30);
  sh.setColumnWidth(4, 240); sh.setColumnWidth(5, 140);

  // ════════════════════════════════════════════════════════════════════════
  // ABA 14: leads (NOVA) — emails capturados com perfil
  //
  // Lead = pessoa que deixou email. Lista organizada por valor:
  //   - intent_inicial=decidido + reaction_bottom=👍 ⇒ lead mais quente
  //   - intent_inicial=pesquisando + 👍 ⇒ lead morno
  //   - sem reaction ou 👎 ⇒ lead a investigar
  // ════════════════════════════════════════════════════════════════════════
  sh = ss.getSheetByName('leads') || ss.insertSheet('leads');
  sh.clear();
  sh.getRange('A1').setValue('LEADS CAPTURADOS — emails com perfil resumido').setFontWeight('bold').setFontSize(14);
  sh.getRange('A2').setValue('Lista ordenada por data desc. Use intent + reaction pra priorizar outreach manual.').setFontSize(10).setFontColor('#888').setWrap(true);

  // Bloco 1: resumo de captura
  sh.getRange('A5').setValue('RESUMO').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A6:B6').setValues([['Métrica','Valor']]);
  sh.getRange('A6:B6').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A7').setValue('Total de emails capturados');
  sh.getRange('B7').setFormula(`=COUNTIF(${r}!E2:E,"<>")`);
  sh.getRange('A8').setValue('% dos quizes com email');
  sh.getRange('B8').setFormula(`=IFERROR(B7/COUNTA(${r}!A2:A),0)`);
  sh.getRange('B8').setNumberFormat('0.0%');
  sh.getRange('A9').setValue('Leads quentes (intent=decidido + 👍 bottom)');
  sh.getRange('B9').setFormula(`=COUNTIFS(${r}!E2:E,"<>",${r}!AW2:AW,"intent_decidido",${r}!BH2:BH,"👍")`);
  sh.getRange('A10').setValue('Leads mornos (pesquisando ou outro intent com 👍)');
  sh.getRange('B10').setFormula(`=COUNTIFS(${r}!E2:E,"<>",${r}!BH2:BH,"👍")-B9`);

  // Bloco 2: lista corrida de leads
  sh.getRange('A13').setValue('LISTA DE LEADS').setFontWeight('bold').setFontColor('#7a9970');
  sh.getRange('A14:G14').setValues([['Data','Email','Origem','Intent','Top1 raça','Reaction final','Feedback escrito']]);
  sh.getRange('A14:G14').setFontWeight('bold').setBackground('#f0e8d8');
  sh.getRange('A15').setFormula(`=QUERY(${r}!A2:AR,"select A, E, D, AW, L, BH, AR where E is not null and E<>'' order by A desc label A '', E '', D '', AW '', L '', BH '', AR ''",0)`);

  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 90); sh.setColumnWidth(4, 150); sh.setColumnWidth(5, 200); sh.setColumnWidth(6, 100); sh.setColumnWidth(7, 350);

  SpreadsheetApp.flush();
  Logger.log('Dashboards atualizados: 15 abas (resumo, top_racas, expectation_gap, feedback_browser, arquetipos, tcasa_analysis, stated_vs_revealed, stated_vs_revealed_deep, behavior, funil_temporal, qualidade_x_perfil, bugs_a_investigar, reaction_matrix, top_racas_por_origem, leads).');
}
