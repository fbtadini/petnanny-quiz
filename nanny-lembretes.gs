/* nanny-lembretes.gs — substitui nannyReminderCron e nannySendReminder_
 * ═══════════════════════════════════════════════════════════════════════
 * PROBLEMA DO CÓDIGO ANTERIOR (verificado por simulação de 60 dias):
 *
 *   Um filhote com V10 (05/08), vermífugo (07/08), antipulga (09/08) e
 *   antirrábica (12/08) recebia 4 emails — todos sobre V10 e antipulga.
 *   Vermífugo e antirrábica NUNCA eram mencionados.
 *
 *   Causa: o cron mandava só `cand[0]` (o mais urgente) e depois travava
 *   5 dias. Item que nunca chegava ao topo da fila nunca era avisado.
 *   E, sem memória do que já foi dito, o MESMO item voltava 3 vezes.
 *
 * O QUE MUDA
 *   1. Digest: até 3 itens num email só. Nada morre de fome na fila.
 *   2. Memória por item, em `avisos_json` (coluna nova, criada sozinha).
 *      Cada item pode gerar no máximo 2 emails: um antes, um se vencer.
 *   3. Throttle cai de 5 para 3 dias — com digest e memória, o risco de
 *      spam sai do intervalo e vai para o controle por item.
 *   4. Poda automática: item que saiu do plano some do histórico.
 *
 * INSTALAÇÃO
 *   - cola este arquivo no projeto Apps Script
 *   - APAGA nannyReminderCron e nannySendReminder_ do nanny-spine.gs
 *     (nomes duplicados no Apps Script têm resolução imprevisível)
 *   - roda nannyLembretesDryRun() antes de confiar: mostra o que SERIA
 *     enviado, sem enviar nada
 * ═══════════════════════════════════════════════════════════════════════ */

var LEMB = {
  JANELA_ANTES: 7,     // avisa a partir de D-7
  JANELA_DEPOIS: 7,    // cutuca até D+7 e para (não persegue para sempre)
  THROTTLE_DIAS: 3,    // intervalo mínimo entre dois emails para o mesmo tutor
  MAX_ITENS: 3,        // teto por email — lista longa não é lida
  COL_AVISOS: 9        // coluna de estado; criada automaticamente
};

/* ── ENTRADA ──────────────────────────────────────────────────────────── */

function nannyReminderCron() { return _lembretesRodar_(false); }
function nannyLembretesDryRun() { return _lembretesRodar_(true); }

function _lembretesRodar_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NANNY_SHEET);
  if (!sh || sh.getLastRow() < 2) return 'sem dados';

  _garantirColunaAvisos_(sh);

  var data = sh.getDataRange().getValues();
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var relatorio = [];

  for (var i = 1; i < data.length; i++) {
    var email = data[i][0], token = data[i][1];
    var optin = ('' + data[i][2]).toLowerCase();
    if (!email || optin !== 'sim') continue;

    var ultimo = data[i][5] ? new Date(data[i][5]) : null;
    if (ultimo && (hoje - ultimo) / 864e5 < LEMB.THROTTLE_DIAS) continue;

    var proximas = [];
    try { proximas = JSON.parse(data[i][4] || '[]'); } catch (e) {}

    var avisos = {};
    try { avisos = JSON.parse(data[i][LEMB.COL_AVISOS - 1] || '{}'); } catch (e) {}

    var sel = _selecionar_(proximas, avisos, hoje);
    if (!sel.itens.length) {
      // poda mesmo sem envio, pra planilha não crescer sem limite
      if (sel.podou && !dryRun) sh.getRange(i + 1, LEMB.COL_AVISOS).setValue(JSON.stringify(sel.avisos));
      continue;
    }

    relatorio.push({
      email: email,
      itens: sel.itens.map(function (x) { return x.o_que + ' (D' + (x.dias >= 0 ? '-' : '+') + Math.abs(x.dias) + ')'; })
    });

    if (dryRun) continue;

    try {
      _enviarLote_(email, token, sel.itens);
      sh.getRange(i + 1, 6).setValue(new Date());
      sh.getRange(i + 1, LEMB.COL_AVISOS).setValue(JSON.stringify(sel.avisos));
    } catch (e) {
      // falha de envio NÃO marca como avisado — o item volta na próxima rodada
      Logger.log('falha ao enviar para ' + email + ': ' + e);
    }
  }

  var out = (dryRun ? '[DRY RUN] ' : '') + relatorio.length + ' tutor(es):\n' +
    relatorio.map(function (r) { return '  ' + r.email + ' → ' + r.itens.join(', '); }).join('\n');
  Logger.log(out);
  return out;
}

/* ── SELEÇÃO ──────────────────────────────────────────────────────────── */

/**
 * Devolve até MAX_ITENS que ainda não foram avisados NA FASE em que estão.
 * Fase 'a' = antecipado (ainda vai vencer). Fase 'v' = venceu ou é hoje.
 * O mesmo item pode gerar 2 emails no total, um por fase — nunca mais.
 */
function _selecionar_(proximas, avisos, hoje) {
  var vivos = {}, cand = [], podou = false;

  (proximas || []).forEach(function (p) {
    if (!p || !p.data) return;
    var id = _idItem_(p);
    vivos[id] = 1;

    var dias = Math.round((new Date(p.data + 'T00:00:00') - hoje) / 864e5);
    if (dias > LEMB.JANELA_ANTES || dias < -LEMB.JANELA_DEPOIS) return;

    var fase = dias > 0 ? 'a' : 'v';
    var st = avisos[id] || {};
    if (st[fase]) return;                       // já foi dito nesta fase

    cand.push({
      id: id, fase: fase, dias: dias,
      o_que: p.o_que || 'um cuidado',
      nome: p.nome || '', sexo: p.sexo || ''
    });
  });

  // poda: item que saiu do plano não precisa mais de histórico
  Object.keys(avisos).forEach(function (k) { if (!vivos[k]) { delete avisos[k]; podou = true; } });

  // vencido primeiro, depois o mais próximo de vencer
  cand.sort(function (a, b) { return a.dias - b.dias; });
  var itens = cand.slice(0, LEMB.MAX_ITENS);

  itens.forEach(function (it) {
    avisos[it.id] = avisos[it.id] || {};
    avisos[it.id][it.fase] = 1;
  });

  return { itens: itens, avisos: avisos, podou: podou };
}

/** id estável: mesmo item em rodadas diferentes tem sempre o mesmo id */
function _idItem_(p) {
  var base = (p.nome || '') + '|' + (p.o_que || '') + '|' + (p.data || '');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, base);
  return bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('').substring(0, 12);
}

/* ── EMAIL ────────────────────────────────────────────────────────────── */

function _enviarLote_(email, token, itens) {
  var quando = function (d) {
    return d < 0 ? ('venceu há ' + Math.abs(d) + ' dia' + (Math.abs(d) > 1 ? 's' : ''))
         : d === 0 ? 'é hoje'
         : ('é em ' + d + ' dia' + (d > 1 ? 's' : ''));
  };
  var quem = function (it) {
    return it.nome ? ((it.sexo === 'femea' ? 'da ' : 'do ') + it.nome) : 'do seu cão';
  };

  var corpo, assunto;

  if (itens.length === 1) {
    var u = itens[0];
    assunto = 'Lembrete: ' + u.o_que + ' ' + quem(u);
    corpo = '<p><strong>' + u.o_que + '</strong> ' + quem(u) + ' ' + quando(u.dias) + '.</p>';
  } else {
    assunto = itens.length + ' cuidados chegando' +
      (itens[0].nome ? (' ' + quem(itens[0]).replace(/^d[ao] /, 'para ')) : '');
    corpo = '<p>Alguns cuidados estão na janela agora:</p><ul style="padding-left:18px;margin:10px 0">'
      + itens.map(function (it) {
          return '<li style="margin:5px 0"><strong>' + it.o_que + '</strong> ' + quem(it) + ' — ' + quando(it.dias) + '.</li>';
        }).join('')
      + '</ul>';
  }

  var html = nannyShell_(
    '<h2 style="font-size:20px">Lembrete da Nanny</h2>'
    + corpo
    + '<p>Dá uma olhada no plano e marque quando fizer:</p>'
    + '<p style="margin:18px 0">' + nannyBtn_(token) + '</p>', token
  );

  MailApp.sendEmail({
    to: email, name: 'PetNanny', replyTo: 'contato@petnanny.com.br',
    subject: assunto, htmlBody: html
  });
}

/* ── INFRA ────────────────────────────────────────────────────────────── */

function _garantirColunaAvisos_(sh) {
  if (sh.getLastColumn() >= LEMB.COL_AVISOS) {
    var atual = sh.getRange(1, LEMB.COL_AVISOS).getValue();
    if (atual === 'avisos_json') return;
  }
  sh.getRange(1, LEMB.COL_AVISOS).setValue('avisos_json');
}

/**
 * Roda UMA vez após instalar, se já houver tutores recebendo lembretes.
 * Marca os itens já vencidos como "antecipado enviado" para o tutor não
 * receber, de uma vez, o aviso de tudo que já passou.
 */
function nannyLembretesMigrar() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NANNY_SHEET);
  if (!sh || sh.getLastRow() < 2) return 'sem dados';
  _garantirColunaAvisos_(sh);

  var data = sh.getDataRange().getValues();
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  var n = 0;

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var proximas = []; try { proximas = JSON.parse(data[i][4] || '[]'); } catch (e) {}
    var avisos = {};
    proximas.forEach(function (p) {
      if (!p || !p.data) return;
      var dias = Math.round((new Date(p.data + 'T00:00:00') - hoje) / 864e5);
      if (dias <= 0) avisos[_idItem_(p)] = { a: 1 };   // já passou: não reabre a fase antecipada
    });
    sh.getRange(i + 1, LEMB.COL_AVISOS).setValue(JSON.stringify(avisos));
    n++;
  }
  return 'migrados: ' + n;
}

function nannyEnsureTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'nannyReminderCron';
  });
  if (!exists) ScriptApp.newTrigger('nannyReminderCron').timeBased().everyDays(1).atHour(9).create();
}
