/* nanny-hoje.js — ABA HOJE (a superfície viva) + digest "o que a Nanny sabe" — v1
 * <script src="nanny-hoje.js"></script> no meu-cao.html (depois do nanny-ask-ui.js)
 * Expõe window.renderHoje(dog)
 *
 * Princípio: abre no que MUDA (status, pendências, o que a Nanny sabe do cão), não na
 * enciclopédia. Desenhada pro dia calmo primeiro; pendências entram como camada por cima.
 * Cada item diz sua relação (por que está ali) e leva ao lugar certo ao tocar.
 *
 * Globais do hub: getBreed, upcomingReminders, ageInMonths, ageLabel,
 * BREED_CARE, setTab, fmt, WESTIE, nannyAskMount.
 */
(function () {
  var NANNY_WESTIE='<svg viewBox="0 0 100 100"><path d="M24 42 L20 10 L42 24 Z" fill="#fff" stroke="#c9b798" stroke-width="4.5" stroke-linejoin="round"/><path d="M76 42 L80 10 L58 24 Z" fill="#fff" stroke="#c9b798" stroke-width="4.5" stroke-linejoin="round"/><path d="M20 55 Q20 28 50 28 Q80 28 80 55 Q80 78 72 83 Q64 89 54 88 Q50 92 46 88 Q36 89 28 83 Q20 78 20 55 Z" fill="#fff" stroke="#c9b798" stroke-width="4.5" stroke-linejoin="round"/><ellipse cx="38" cy="53" rx="4.5" ry="5.2" fill="#3d2c1e"/><ellipse cx="62" cy="53" rx="4.5" ry="5.2" fill="#3d2c1e"/><ellipse cx="50" cy="66" rx="5.5" ry="4.5" fill="#3d2c1e"/><path d="M50 70.5 L50 75" fill="none" stroke="#3d2c1e" stroke-width="3.4" stroke-linecap="round"/><path d="M42.5 77 Q50 82.5 57.5 77" fill="none" stroke="#3d2c1e" stroke-width="3.4" stroke-linecap="round"/></svg>';
  var CT = { pri:'#3d2c1e', sec:'#5f5142', mut:'#7a6a58', line:'#e8ddd2', green:'#7a9970', cream:'#f7f2ea', peach:'#f3ddc9', amber:'#b7902a', red:'#c0562e' };
  function g(fn){ return (typeof window[fn]==='function')?window[fn]:null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function art(dog){ return (dog&&dog.sexo==='femea')?'a':'o'; }
  function ArtU(dog){ return (dog&&dog.sexo==='femea')?'A':'O'; }
  function pron(dog){ return (dog&&dog.sexo==='femea')?'ela':'ele'; }
  function face(px){ var s=(typeof WESTIE!=='undefined'&&WESTIE)?WESTIE:NANNY_WESTIE; return '<span aria-hidden="true" style="display:inline-flex;width:'+px+'px;height:'+px+'px;border-radius:50%;background:'+CT.peach+';border:1px solid #f3d9c2;padding:3px;box-sizing:border-box;flex-shrink:0"><span style="display:block;width:100%;height:100%">'+s+'</span></span>'; }
  function fmtWhen(d){ try{ if(g('fmt'))return window.fmt(d); }catch(e){} try{ return new Date(d).toLocaleDateString('pt-BR'); }catch(e){ return ''; } }

  function nome(dog){ return dog.nome || 'seu cão'; }

  // ---- MOTOR DE INSIGHTS: cruza os dados e vira conclusão (não lista de fatos) ----
  window.nannyInsights = function (dog, b, c) {
    b = b || {}; c = c || {}; var out = [], n = esc(nome(dog));
    var adot = dog.origem === 'adotado';
    var mo = new Date().getMonth(), quente = (mo >= 8 || mo <= 2);
    var ws = dog.weights || [], wUp = null;
    if (ws.length >= 2) { var d = ws[ws.length-1].kg - ws[ws.length-2].kg; if (d >= 0.3) wUp = d; }
    var meses = (typeof window.ageInMonths === 'function') ? window.ageInMonths(dog) : null;
    var av = (b.aviso || '').toLowerCase();
    var engorda = /engorda|acima do peso|obesid|controle a comida|controle rigoroso|engordar/.test(av);
    var cond = dog.conditions || {}, diag = Object.keys(cond).filter(function(k){ return cond[k] && cond[k].status === 'diagnosticado'; });
    function kg(x){ return x.toFixed(1).replace('.', ','); }

    if (wUp && (c.patella || c.longBack)) out.push({ic:'⚖️',t:ArtU(dog)+' '+n+' ganhou '+kg(wUp)+' kg desde a última pesagem. Pra uma raça com '+(c.patella?'joelho':'coluna')+' sensível, peso extra pesa direto na articulação — vale segurar a comida e comentar com o vet.'});
    else if (wUp && engorda) out.push({ic:'⚖️',t:'Subiu '+kg(wUp)+' kg — e '+(b.name||'essa raça')+' engorda fácil. Não deixa virar bola de neve: mede a ração e corta o petisco extra.'});

    if (c.brachy && (quente || wUp)) out.push({ic:'😮‍💨',t:'Focinho achatado'+(quente?' e época de calor':'')+(wUp?' com o peso subindo':'')+' — o risco respiratório sobe. Passeio nas horas frescas, sem esforço no sol, e peitoral em vez de coleira.'});
    if (c.coat === 'double' && quente) out.push({ic:'🌡️',t:'Pelo duplo no calor: caprichar na escovação tira o subpelo e ajuda '+art(dog)+' '+n+' a se refrescar. Nunca raspar a tosa — o subpelo protege do sol.'});
    if (diag.length) out.push({ic:'📋',t:'Com '+(diag.length>1?'condições já diagnosticadas':'uma condição já diagnosticada')+', os cuidados preventivos deixam de ser opcionais — mantém o acompanhamento com o vet em dia.'});
    if (meses != null && meses >= 96) out.push({ic:'🎂',t:(b.name||(dog.sexo==='femea'?'Ela':'Ele'))+' entrou na fase sênior. Daqui pra frente, exame de sangue a cada 6 meses e olho no peso e na disposição pegam problema cedo.'});
    if (dog.chegada) { var dias = Math.floor((Date.now() - new Date(dog.chegada+'T00:00:00'))/864e5); if (dias >= 0 && dias <= 90 && ((dog.temperamento||[]).length || b.ind <= 2)) out.push({ic:'🏠',t:'Faz '+dias+' dias que '+pron(dog)+' chegou. Comportamento novo nesta fase quase sempre é adaptação, não a personalidade d'+pron(dog)+' — dá tempo e rotina antes de concluir.'}); }
    if (b.nrg >= 4 && meses != null && meses < 36 && !adot && !out.some(function(o){return o.ic==='⚡';})) out.push({ic:'⚡',t:(b.name||(dog.sexo==='femea'?'Ela':'Ele'))+' é de energia alta e ainda jovem: sem gasto físico e mental diário, sobra pra bagunça e latido. Brinquedo de enriquecimento e passeio resolvem a maior parte.'});
    if (b.nrg >= 4 && meses != null && meses < 36 && adot && (dog.temperamento||[]).length && !out.some(function(o){return o.ic==='⚡';})) out.push({ic:'⚡',t:'Pelo que você contou, '+art(dog)+' '+n+' tem bastante energia — sem gasto físico e mental diário, sobra pra bagunça. Brinquedo de enriquecimento e passeio ajudam muito.'});

    // CRUZAMENTO: o que o tutor escreveu × predisposição da raça (ex.: "senta torto" em raça com patela)
    try{
      var careX=(window.BREED_CARE&&window.BREED_CARE[dog.breedKey])||{};
      var ntX=String(dog.notes||'').toLowerCase();
      if(careX.patella && /senta|patinha|perninha|manc|pulinh|salt|apoia/.test(ntX) && !out.some(function(o){return o.ic==='\ud83e\uddb5';}))
        out.unshift({ic:'\ud83e\uddb5',t:'Voc\u00ea contou que '+art(dog)+' '+n+' senta/apoia diferente \u2014 em ra\u00e7a com tend\u00eancia a patela, vale filmar o movimento e mostrar ao vet na pr\u00f3xima consulta.'});
    }catch(e){}
    return out.slice(0, 3);
  };

  // (blocos pré-merge removidos daqui — o veredito único agora é o Score)
  window.renderHoje = function (dog) {
    var el = document.getElementById('tab-hoje'); if (!el || !dog) return;
    var ups = g('upcomingReminders') ? (window.upcomingReminders(dog) || []) : [];
    var att = ups.filter(function(u){ return u.status!=='upcoming'; });
    var next = ups.filter(function(u){ return u.status==='upcoming'; })[0];
    var meses = (g('ageInMonths')) ? window.ageInMonths(dog) : null;
    var h = '';

    // --- ESTADO DO CÃO: painel de SCORE de saúde (headline da Hoje) ---
    if (dog.aguardando) {
      h += '<div style="display:flex;align-items:center;gap:8px;margin:2px 2px 16px"><span style="color:'+CT.mut+';font-size:13px">Plano de chegada — quando '+esc(nome(dog))+' chegar, avise aqui que eu começo o acompanhamento dos primeiros 90 dias.</span></div>';
    } else if (g('renderScore')) {
      h += window.renderScore(dog);
    } else {
      // fallback raro (nanny-score.js não carregou): sem segundo motor de veredito pra manter em sincronia
      h += '<div style="background:#fff;border:1px solid '+CT.line+';border-radius:16px;padding:14px 15px;margin-bottom:16px;font-size:13px;color:'+CT.sec+'">Carregando o painel de '+esc(nome(dog))+'… se não aparecer, recarrega a página.</div>';
    }

    // --- pergunta pra Nanny (montada pelo módulo) ---
    h += '<div id="nanny-ask" style="margin-bottom:16px"></div>';

    // --- pra resolver: SÓ pendências atrasadas. O "próximo" e a previsão agora vivem no Score. ---
    if (att.length === 1) {
      var r = att[0];
      h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:0 2px 8px">Pra resolver</div>';
      h += '<div onclick="setTab(\'saude\')" style="cursor:pointer;background:#fff;border:1px solid '+CT.line+';border-left:3px solid '+CT.amber+';border-radius:0 14px 14px 0;padding:12px 13px;margin-bottom:9px">'
        + '<div style="font-weight:500;font-size:14px;color:'+CT.pri+'">'+esc(r.t||'Cuidado pendente')+'</div>'
        + '<div style="font-size:12px;color:'+CT.sec+';margin-top:1px">'+(r.status==='stale'?'última faz tempo':'atrasada')+(r.when?(' · '+fmtWhen(r.when)):'')+' · toque pra registrar</div></div>';
      h += '<div style="height:6px"></div>';
    } else if (att.length >= 2) {
      h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:0 2px 8px">Pra resolver</div>';
      h += '<div onclick="setTab(\'saude\')" style="cursor:pointer;background:#fff;border:1px solid '+CT.line+';border-left:3px solid '+CT.amber+';border-radius:0 14px 14px 0;padding:12px 13px;margin-bottom:9px">';
      h += '<div style="font-weight:500;font-size:14px;color:'+CT.pri+';margin-bottom:5px">'+att.length+' cuidados atrasados</div>';
      att.slice(0,3).forEach(function(r){ h += '<div style="font-size:12.5px;color:'+CT.sec+';padding:2px 0">• '+esc(r.t||'')+' — '+(r.status==='stale'?'vencido':'atrasado')+'</div>'; });
      if (att.length>3) h += '<div style="font-size:12px;color:'+CT.mut+';padding:2px 0">+'+(att.length-3)+' mais</div>';
      h += '<div style="font-size:12px;color:'+CT.green+';margin-top:5px">Ver na Saúde ›</div></div>';
      h += '<div style="height:6px"></div>';
    }

    // --- inteligência (insights cruzados + recorrência) agora vive DENTRO do card de Score ---
    // (o painel de score renderiza "A Nanny reparou" já fundido; aqui a Hoje fica enxuta.)

    // --- dossiê (o acúmulo, clicável) ---
    var files = dog.files || [];
    var last = files.length ? files[files.length-1] : null;
    h += '<div onclick="setTab(\'carteira\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:11px 13px;background:#efe6da;border-radius:12px">'
      + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="'+CT.mut+'" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
      + '<div style="flex:1"><div style="font-size:12.5px;color:'+CT.pri+';font-weight:500">Dossiê d'+art(dog)+' '+esc(nome(dog))+'</div>'
      + '<div style="font-size:11px;color:'+CT.mut+';margin-top:1px">'+(last?('última guardada: '+esc(last.type||'documento')):'toque pra guardar carteira, exames e documentos')+'</div></div>'
      + '<span style="color:'+CT.mut+';font-size:16px">›</span></div>';

    el.innerHTML = h;
    if (g('nannyAskMount')) window.nannyAskMount();
  };
})();
