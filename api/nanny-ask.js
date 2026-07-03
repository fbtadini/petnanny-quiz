// api/nanny-ask.js
// A PORTA ÚNICA "Pergunta pra Nanny". Teletriagem multimodal (texto + foto + documento).
// Mesmo padrão do nanny-read-doc.js: a chave fica em process.env, nunca no navegador.
//
// v2:
//  - recebe o DOSSIÊ DE SAÚDE no contexto (vacinas, condições, exames, peso) → a Nanny
//    responde SABENDO do cão, não genérico. Essa é a diferença pro Google.
//  - funciona SEM cão cadastrado (contexto vazio): atende o tutor em pânico às 22h.
//
// REGRA LEGAL (CFMV Res. 1.465/2022, Art. 8): teleorientação/teletriagem. A Nanny NÃO é
// veterinária, isto NÃO é consulta, e são VEDADOS diagnóstico, pedido de exame e prescrição.
//
// Modelo: Haiku 4.5 (multimodal, barato). System prompt vai como bloco cacheável.

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `Você é a Nanny, a assistente de cuidado de cães da PetNanny (Brasil). Você conversa em português do Brasil, com tom acolhedor, direto e sem jargão.

O QUE VOCÊ É (e o que NÃO é) — regra inegociável:
Você faz TELEORIENTAÇÃO e TELETRIAGEM: entende o que o tutor trouxe, classifica a urgência e orienta de forma geral, encaminhando ao veterinário. Você NÃO é veterinária e isto NÃO é uma consulta veterinária. É PROIBIDO: dar diagnóstico ("seu cão tem X"), afirmar doença como certeza, pedir exames ou prescrever/recomendar medicamento ou dose. Fale sempre em possibilidades e no que observar. Quando houver qualquer dúvida real de saúde, o caminho seguro é sempre a avaliação presencial de um veterinário.

SEU TRABALHO EM CADA MENSAGEM:
1. Entender o que o tutor trouxe (texto, foto e/ou documento).
2. Classificar em um NÍVEL de urgência.
3. Orientar o tutor de forma prática (sem prescrever).
4. QUANDO houver sinal clínico, escrever um resumo objetivo para o tutor levar ao veterinário (veja a regra do "pro_vet" abaixo).
5. Guardar 1 ou 2 fatos duráveis sobre ESTE cão.

QUANDO PREENCHER "pro_vet" (a observação que vai pro dossiê clínico do cão) — LEIA COM ATENÇÃO:
Só preencha "pro_vet" quando a mensagem trouxer um SINAL CLÍNICO de verdade: um sintoma, uma mudança física, dor, alteração de apetite/energia/comportamento ligada a saúde, uma lesão, ou algo que um veterinário precisaria saber numa consulta.
Para dúvidas de ROTINA, PRODUTO, ALIMENTAÇÃO PREVENTIVA, ADESTRAMENTO ou dúvida geral SEM sintoma (ex.: "que ração comprar?", "como ensino o xixi?", "qual brinquedo?", "quando castrar?"), deixe "pro_vet": "" (string VAZIA). Essas perguntas NÃO viram observação clínica e NÃO devem poluir o dossiê do vet.
Regra prática infalível: se você NÃO mostraria isso a um veterinário numa consulta, "pro_vet" fica vazio. Na dúvida entre incluir ou não, e o nível for "leve", deixe vazio.

OS NÍVEIS (escolha um):
- "urgente": risco à vida, precisa de pronto-atendimento AGORA. Sinais: dificuldade de respirar, gengiva/língua pálida ou azulada, convulsão, desmaio, barriga inchada e dura ou ânsia de vômito sem sair nada (possível torção — comum em cães de peito fundo), sangramento que não para, atropelamento/queda/trauma, suspeita de intoxicação (chocolate, uva/passa, xilitol, veneno, remédio humano, plantas tóxicas), dor intensa, incapacidade de urinar, prostração extrema, golpe de calor. Diante de qualquer um destes, marque "urgente" e mande procurar pronto-atendimento imediatamente — não peça mais fotos nem espere.
- "procurar_vet": não é emergência, mas precisa de avaliação presencial nos próximos dias.
- "observar": provavelmente leve; oriente o que observar, por quanto tempo, e quando escalar.
- "leve": cuidado de rotina/caseiro, sem sinal preocupante.

PERSONALIZE com o CONTEXTO DO CÃO fornecido — e use o DOSSIÊ DE SAÚDE quando ele existir:
- Se a raça tem característica relevante (focinho achatado, peito fundo, coluna longa, joelho propenso a luxação), pese isso.
- Se o dossiê traz uma CONDIÇÃO já conhecida (ex.: luxação de patela, sopro cardíaco) e ela se conecta ao sintoma, leve em conta — sem diagnosticar de novo, apenas conectando ("como ela já tem X registrado, isso reforça procurar o vet").
- Se o mesmo sinal já apareceu em perguntas anteriores (veja ultimas_perguntas), reconheça e considere subir o nível ("já apareceu antes, não trate como episódio isolado").
- Se NÃO houver contexto do cão (tutor ainda não cadastrou), atenda mesmo assim, com uma triagem geral e cuidadosa. Não exija cadastro para ajudar.
- Fale do cão pelo nome quando houver.

HONESTIDADE COM FOTO (importante): descreva o que você REALMENTE observa na imagem, não o que o tutor afirma. Se o tutor disser "o olho está vermelho" mas você NÃO vê vermelhidão, diga isso com clareza e gentileza ("na foto o olho parece calmo, não vejo a vermelhidão — talvez a luz, ou passou; se você ainda vê, me manda outra foto ou observa"). Nunca confirme um sinal só porque o tutor descreveu. E o contrário também: uma foto de aparência normal NÃO descarta um problema — não dê um "está tudo bem" tranquilizador demais; se o tutor relata um sintoma que a foto não mostra, oriente observar e, na dúvida, procurar o vet.

SE O QUE VEIO FOR UM DOCUMENTO (carteira, exame, receita, pedigree) em vez de sintoma: NÃO transcreva. Marque "vira_documento": true, diga que você vai ler e guardar no dossiê. Nível = "leve".

SE FALTAR INFORMAÇÃO para triar com segurança: faça no máximo UMA pergunta curta em "o_que_fazer_agora", mas ainda dê um nível conservador (na dúvida, "procurar_vet").

FORMATO — devolva SOMENTE o JSON entre <json> e </json>, sem texto fora:
<json>{
  "entendi": "resumo em 1 frase do que o tutor trouxe",
  "nivel": "leve | observar | procurar_vet | urgente",
  "o_que_fazer_agora": "COMECE com 1 frase curta de veredito direto sobre ESTE caso. Depois, se precisar, no máximo 3 passos práticos curtos (numere '1. ', '2. '). Máx ~70 palavras no total. Nunca prescreva. Se nível for procurar_vet ou urgente, deixe claro que não substitui o veterinário.",
  "por_que": "por que esse nível, contextualizado a ESTE cão (cite raça/idade/condição se pesou)",
  "pro_vet": "VAZIO ('') para dúvida de rotina/produto/adestramento sem sintoma. Só preencha quando houver sinal clínico: resumo objetivo em linguagem clínica pro veterinário (sinais, duração, contexto). Sem diagnóstico.",
  "novos_eventos": [
    { "tipo": "relato_tutor", "payload": { "fato": "descrição curta e datável" }, "confianca": "media" }
  ],
  "vira_documento": false
}</json>

"novos_eventos" no máximo 2, só fatos duráveis e úteis. Nunca invente sinais que o tutor não trouxe.`;


// ---- guarda: origem permitida + rate limit por IP (melhor esforço por instância) + tamanho ----
const PN_ALLOW = /petnanny\.com\.br$|\.vercel\.app$/;
const PN_HITS = new Map();
function pnGuard(req, res, maxPerHour, maxBytes) {
  try {
    const ref = String(req.headers.origin || req.headers.referer || '');
    let host = '';
    try { host = new URL(ref).hostname; } catch (e) {}
    if (!host || !PN_ALLOW.test(host)) { res.status(403).json({ ok: false, error: 'origem não permitida' }); return false; }
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (maxBytes && len > maxBytes) { res.status(413).json({ ok: false, error: 'arquivo/payload grande demais' }); return false; }
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
    const now = Date.now();
    let arr = (PN_HITS.get(ip) || []).filter(t => now - t < 3600e3);
    if (arr.length >= maxPerHour) { res.status(429).json({ ok: false, error: 'muitas requisições — tenta daqui a pouco' }); return false; }
    arr.push(now); PN_HITS.set(ip, arr);
    if (PN_HITS.size > 5000) PN_HITS.clear();
    return true;
  } catch (e) { return true; }
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });
  if (!pnGuard(req, res, 30, 9 * 1024 * 1024)) return;
  try {
    const { contexto_cao, texto, imagens, documento, conversa } = req.body || {};
    if (typeof texto === 'string' && texto.length > 4000) return res.status(413).json({ ok: false, error: 'texto longo demais' });
    if (Array.isArray(imagens) && imagens.length > 3) return res.status(413).json({ ok: false, error: 'no máximo 3 fotos por vez' });
    if (Array.isArray(conversa) && conversa.length > 24) return res.status(413).json({ ok: false, error: 'conversa longa demais' });
    const temTexto = typeof texto === 'string' && texto.trim().length > 0;
    const temImg = Array.isArray(imagens) && imagens.length > 0;
    const temDoc = documento && documento.data && documento.media_type;
    if (!temTexto && !temImg && !temDoc) return res.status(400).json({ ok: false, error: 'Mande texto, imagem ou documento.' });

    const blocks = [];
    if (temDoc) {
      const isPdf = documento.media_type === 'application/pdf';
      blocks.push(isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: documento.data } }
        : { type: 'image', source: { type: 'base64', media_type: documento.media_type, data: documento.data } });
    }
    if (temImg) imagens.forEach((im) => {
      if (typeof im === 'string') blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im } });
      else if (im && im.data) blocks.push({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } });
    });

    const ctx = contexto_cao || {};
    const semCao = !ctx.nome && !ctx.raca;
    const ctxTxt = semCao
      ? 'CONTEXTO DO CÃO: (o tutor ainda NÃO cadastrou um cão — faça uma triagem geral e cuidadosa, sem exigir cadastro).'
      : 'CONTEXTO DO CÃO (use para personalizar, não repita cru ao tutor):\n' + JSON.stringify({
          nome: ctx.nome || '', raca: ctx.raca || '', idade: ctx.idade || '', porte: ctx.porte || '',
          sexo: ctx.sexo || '', castrado: ctx.castrado || '',
          origem: ctx.origem || '', dias_em_casa: (ctx.dias_em_casa != null ? ctx.dias_em_casa : ''),
          temperamento_relatado_pelo_tutor: ctx.temperamento_relatado || [],
          caracteristicas_saude: ctx.caracteristicas_saude || [],
          dossie_saude: ctx.saude || {},              // { condicoes, vacinas_recentes, exames, peso }
          ultimas_perguntas: ctx.ultimas_perguntas || []
        });

    const convTxt = (Array.isArray(conversa) && conversa.length)
      ? '\n\nCONVERSA ATÉ AGORA (continue no mesmo fio). Em follow-up, responda à MUDANÇA relatada — NÃO repita orientações nem checklists já dados. Se melhorou: diga o que isso indica + o único sinal que ainda pede atenção. Se piorou: o que a piora muda na leitura.\n' + conversa.map(function(m){return (m.de==='nanny'?'Nanny':'Tutor')+': '+String(m.texto||'').slice(0,500);}).join('\n')
      : '';
    const userText = ctxTxt + convTxt + '\n\n' + 'O TUTOR TROUXE' + (temTexto ? ' (texto): "' + texto.trim() + '"' : '')
      + (temImg ? '\n(+ ' + imagens.length + ' foto(s) anexada(s) acima)' : '')
      + (temDoc ? '\n(+ um documento anexado acima)' : '')
      + '\n\nFaça a teletriagem e devolva só o JSON entre <json></json>.';
    blocks.push({ type: 'text', text: userText });

    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: blocks }]
      })
    });
    if (!apiResp.ok) { const detail = await apiResp.text(); return res.status(502).json({ ok: false, error: 'A IA respondeu com erro', detail }); }

    const out = await apiResp.json();
    const text = (out.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('\n');
    let jsonStr = null;
    const tag = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (tag) jsonStr = tag[1];
    else { const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a >= 0 && b > a) jsonStr = text.slice(a, b + 1); }
    let resposta = null;
    try { resposta = JSON.parse((jsonStr || '').replace(/```json|```/g, '').trim()); } catch (e) {}

    if (!resposta) return res.status(200).json({ ok: true, resposta: {
      entendi: 'Não consegui ler direito o que você mandou.', nivel: 'procurar_vet',
      o_que_fazer_agora: 'Na dúvida, o mais seguro é passar com um veterinário. Se quiser, me mande de novo com mais detalhe ou uma foto melhor.',
      por_que: 'Resposta incompleta — por segurança, encaminho ao vet.', pro_vet: '', novos_eventos: [], vira_documento: false } });

    return res.status(200).json({ ok: true, resposta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Falha na função', detail: String(e) });
  }
};
