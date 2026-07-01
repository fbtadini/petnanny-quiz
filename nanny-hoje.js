/* nanny-hoje.js — ABA HOJE (a superfície viva) + digest "o que a Nanny sabe" — v1
 * <script src="nanny-hoje.js"></script> no meu-cao.html (depois do nanny-ask-ui.js)
 * Expõe window.renderHoje(dog) e window.nannyKnows(dog).
 *
 * Princípio: abre no que MUDA (status, pendências, o que a Nanny sabe do cão), não na
 * enciclopédia. Desenhada pro dia calmo primeiro; pendências entram como camada por cima.
 * Cada item diz sua relação (por que está ali) e leva ao lugar certo ao tocar.
 *
 * Globais do hub: getBreed, statusSummary, upcomingReminders, ageInMonths, ageLabel,
 * BREED_CARE, setTab, fmt, WESTIE, nannyAskMount.
 */
(function () {
  var NANNY_WESTIE='<svg viewBox="0 0 100 100"><path d="M24 42 L20 10 L42 24 Z" fill="#fff" stroke="#c9b798" stroke-width="3" stroke-linejoin="round"/><path d="M76 42 L80 10 L58 24 Z" fill="#fff" stroke="#c9b798" stroke-width="3" stroke-linejoin="round"/><path d="M20 55 Q20 28 50 28 Q80 28 80 55 Q80 78 72 83 Q64 89 54 88 Q50 92 46 88 Q36 89 28 83 Q20 78 20 55 Z" fill="#fff" stroke="#c9b798" stroke-width="3" stroke-linejoin="round"/><ellipse cx="38" cy="53" rx="4" ry="5" fill="#3d2c1e"/><ellipse cx="62" cy="53" rx="4" ry="5" fill="#3d2c1e"/><ellipse cx="50" cy="67" rx="6" ry="5" fill="#3d2c1e"/></svg>';
  var CT = { pri:'#3d2c1e', sec:'#5f5142', mut:'#7a6a58', line:'#e8ddd2', green:'#7a9970', cream:'#f7f2ea', peach:'#f3ddc9', amber:'#b7902a' };
  function g(fn){ return (typeof window[fn]==='function')?window[fn]:null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function art(dog){ return (dog&&dog.sexo==='femea')?'a':'o'; }
  function face(px){ var s=(typeof WESTIE!=='undefined'&&WESTIE)?WESTIE:NANNY_WESTIE; return '<span aria-hidden="true" style="display:inline-flex;width:'+px+'px;height:'+px+'px;border-radius:50%;background:'+CT.peach+';border:1px solid #f3d9c2;padding:3px;box-sizing:border-box;flex-shrink:0"><span style="display:block;width:100%;height:100%">'+s+'</span></span>'; }
  function fmtWhen(d){ try{ if(g('fmt'))return window.fmt(d); }catch(e){} try{ return new Date(d).toLocaleDateString('pt-BR'); }catch(e){ return ''; } }

  // ---------- insights: o que a Nanny SABE (não só o que você digitou) ----------
  window.nannyKnows = function (dog) {
    var out = [];
    var c = (typeof BREED_CARE!=='undefined' && dog.breedKey && BREED_CARE[dog.breedKey]) || {};
    if (c.brachy) out.push({ic:'😮‍💨',t:'Focinho achatado — atenção ao calor e ao esforço; peitoral, nunca coleira.'});
    if (c.bloat)  out.push({ic:'🍽️',t:'Peito fundo — comer rápido aumenta o risco de torção; comedouro lento ajuda.'});
    if (c.longBack) out.push({ic:'🦴',t:'Coluna alongada — rampa (não escada) poupa o disco; evite saltos.'});
    if (c.patella) out.push({ic:'🦵',t:'Joelho propenso a luxação de patela — evite saltos do sofá e da cama.'});
    var h = dog.health || {};
    (h.condicoes||[]).forEach(function(x){ var t=(typeof x==='string')?x:(x&&x.nome); if(t) out.push({ic:'📋',t:'Condição registrada: '+t+'.'}); });
    if ((dog.weights||[]).length) {
      var w = dog.weights[dog.weights.length-1], line = 'Peso mais recente: '+w.kg+' kg.';
      if (dog.weights.length>=2) { var p=dog.weights[dog.weights.length-2], d=w.kg-p.kg; if(Math.abs(d)>=0.3) line='Peso: '+w.kg+' kg ('+(d>0?'+':'')+d.toFixed(1)+' kg desde a última).'; }
      out.push({ic:'⚖️',t:line});
    }
    var perg = dog.perguntas || [];
    if (perg.length) { var last=perg[perg.length-1]; out.push({ic:'💬',t:'Você já me perguntou '+perg.length+(perg.length>1?' vezes':' vez')+' — a última: “'+esc((last.texto||'').slice(0,42))+'”.'}); }
    if ((dog.notes||'').trim()) out.push({ic:'📝',t:'Você me contou: “'+esc((dog.notes||'').slice(0,80))+((dog.notes||'').length>80?'…':'')+'”'});
    return out;
  };

  function nome(dog){ return dog.nome || 'seu cão'; }

  // ---- MOTOR DE INSIGHTS: cruza os dados e vira conclusão (não lista de fatos) ----
  window.nannyInsights = function (dog, b, c) {
    b = b || {}; c = c || {}; var out = [], n = esc(nome(dog));
    var mo = new Date().getMonth(), quente = (mo >= 8 || mo <= 2);
    var ws = dog.weights || [], wUp = null;
    if (ws.length >= 2) { var d = ws[ws.length-1].kg - ws[ws.length-2].kg; if (d >= 0.3) wUp = d; }
    var meses = (typeof window.ageInMonths === 'function') ? window.ageInMonths(dog) : null;
    var av = (b.aviso || '').toLowerCase();
    var engorda = /engorda|acima do peso|obesid|controle a comida|controle rigoroso|engordar/.test(av);
    var cond = dog.conditions || {}, diag = Object.keys(cond).filter(function(k){ return cond[k] && cond[k].status === 'diagnosticado'; });
    function kg(x){ return x.toFixed(1).replace('.', ','); }

    if (wUp && (c.patella || c.longBack)) out.push({ic:'⚖️',t:'A '+n+' ganhou '+kg(wUp)+' kg desde a última pesagem. Pra uma raça com '+(c.patella?'joelho':'coluna')+' sensível, peso extra pesa direto na articulação — vale segurar a comida e comentar com o vet.'});
    else if (wUp && engorda) out.push({ic:'⚖️',t:'Subiu '+kg(wUp)+' kg — e '+(b.name||'essa raça')+' engorda fácil. Não deixa virar bola de neve: mede a ração e corta o petisco extra.'});

    if (c.brachy && (quente || wUp)) out.push({ic:'😮‍💨',t:'Focinho achatado'+(quente?' e época de calor':'')+(wUp?' com o peso subindo':'')+' — o risco respiratório sobe. Passeio nas horas frescas, sem esforço no sol, e peitoral em vez de coleira.'});
    if (c.coat === 'double' && quente) out.push({ic:'🌡️',t:'Pelo duplo no calor: caprichar na escovação tira o subpelo e ajuda a '+n+' a se refrescar. Nunca raspar a tosa — o subpelo protege do sol.'});
    if (diag.length) out.push({ic:'📋',t:'Com '+(diag.length>1?'condições já diagnosticadas':'uma condição já diagnosticada')+', os cuidados preventivos deixam de ser opcionais — mantém o acompanhamento com o vet em dia.'});
    if (meses != null && meses >= 96) out.push({ic:'🎂',t:(b.name||'Ela')+' entrou na fase sênior. Daqui pra frente, exame de sangue a cada 6 meses e olho no peso e na disposição pegam problema cedo.'});
    if (dog.chegada) { var dias = Math.floor((Date.now() - new Date(dog.chegada+'T00:00:00'))/864e5); if (dias >= 0 && dias <= 90 && ((dog.temperamento||[]).length || b.ind <= 2)) out.push({ic:'🏠',t:'Faz '+dias+' dias que ela chegou. Comportamento novo nesta fase quase sempre é adaptação, não a personalidade dela — dá tempo e rotina antes de concluir.'}); }
    if (b.nrg >= 4 && meses != null && meses < 36 && !out.some(function(o){return o.ic==='⚡';})) out.push({ic:'⚡',t:(b.name||'Ela')+' é de energia alta e ainda jovem: sem gasto físico e mental diário, sobra pra bagunça e latido. Brinquedo de enriquecimento e passeio resolvem a maior parte.'});

    return out.slice(0, 3);
  };

  // ---- cabeçalho leve+inteligente pras abas antigas (Cuidar, Saúde) ----
  window.tabHeader = function (dog, kind) {
    if (!dog) return '';
    var ss = (typeof window.statusSummary === 'function') ? window.statusSummary(dog) : {cls:'',txt:''};
    if (kind === 'cuidar') {
      var b = (typeof window.getBreed === 'function') ? window.getBreed(dog) : {};
      var c = (typeof BREED_CARE !== 'undefined' && BREED_CARE[dog.breedKey]) || {};
      var ins = (typeof window.nannyInsights === 'function') ? window.nannyInsights(dog, b, c) : [];
      var top = ins[0];
      var col = ss.cls === 'warn' ? CT.amber : (ss.cls === 'ok' ? CT.green : CT.mut);
      var h = '<div style="background:#fff;border:1px solid '+CT.line+';border-radius:14px;padding:12px 14px;margin-bottom:14px">';
      h += '<div style="font-size:13.5px;color:'+col+';font-weight:500">'+esc((ss.txt||'').replace(/^[^A-Za-zÀ-ú]+/,''))+'</div>';
      if (top) h += '<div style="display:flex;gap:9px;align-items:flex-start;margin-top:9px;padding-top:9px;border-top:1px solid '+CT.cream+'"><span style="font-size:15px">'+(top.ic||'💡')+'</span><span style="font-size:12.5px;color:'+CT.pri+';line-height:1.45">'+esc(top.t)+'</span></div>';
      h += '</div>';
      return h;
    }
    if (kind === 'saude') {
      var he = dog.health || {}, ws = dog.weights || [];
      var vac = (he.vacinas||[]).length, conds = (he.condicoes||[]).length;
      var chips = [];
      chips.push({ic:'💉', t: vac ? (vac+' vacina'+(vac>1?'s':'')+' lida'+(vac>1?'s':'')) : 'sem carteira ainda'});
      if (ws.length) chips.push({ic:'⚖️', t: String(ws[ws.length-1].kg).replace('.',',')+' kg'});
      if (conds) chips.push({ic:'📋', t: conds+' condiç'+(conds>1?'ões':'ão')});
      return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+chips.map(function(cp){return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:'+CT.pri+';background:#fff;border:1px solid '+CT.line+';border-radius:20px;padding:6px 12px">'+cp.ic+' '+cp.t+'</span>';}).join('')+'</div>';
    }
    return '';
  };

  window.renderHoje = function (dog) {
    var el = document.getElementById('tab-hoje'); if (!el || !dog) return;
    var ss = g('statusSummary') ? window.statusSummary(dog) : { cls:'', txt:'' };
    var ups = g('upcomingReminders') ? (window.upcomingReminders(dog) || []) : [];
    var att = ups.filter(function(u){ return u.status!=='upcoming'; });
    var next = ups.filter(function(u){ return u.status==='upcoming'; })[0];
    var meses = (g('ageInMonths')) ? window.ageInMonths(dog) : null;
    var h = '';

    // --- saudação (calma vs atenção) ---
    if (dog.aguardando) {
      h += '<div style="display:flex;align-items:center;gap:8px;margin:2px 2px 14px"><span style="color:'+CT.mut+';font-size:13px">Plano de chegada — quando '+nome(dog)+' chegar, avise aqui que eu começo o acompanhamento dos primeiros 90 dias.</span></div>';
    } else if (att.length) {
      h += '<div style="display:flex;align-items:center;gap:7px;margin:2px 2px 14px"><span style="color:'+CT.amber+';font-size:14px">'+ (att.length>1?att.length+' coisas':'Uma coisa') +' pra você ver hoje.</span></div>';
    } else {
      h += '<div style="display:flex;align-items:center;gap:7px;margin:2px 2px 14px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="'+CT.green+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span style="color:'+CT.green+';font-size:14px">Tudo tranquilo com '+esc(nome(dog))+' hoje.</span></div>';
    }

    // --- pergunta pra Nanny (montada pelo módulo) ---
    h += '<div id="nanny-ask" style="margin-bottom:16px"></div>';

    // --- pra hoje (pendências; 1 = card; 2+ = um card compacto que leva à lista) ---
    if (att.length === 1 || next && !att.length) {
      h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:0 2px 8px">Pra hoje</div>';
      if (att.length === 1) {
        var r = att[0];
        h += '<div onclick="setTab(\'lembretes\')" style="cursor:pointer;background:#fff;border:1px solid '+CT.line+';border-left:3px solid '+CT.amber+';border-radius:0 14px 14px 0;padding:12px 13px;margin-bottom:9px">'
          + '<div style="font-weight:500;font-size:14px;color:'+CT.pri+'">'+esc(r.t||'Cuidado pendente')+'</div>'
          + '<div style="font-size:12px;color:'+CT.sec+';margin-top:1px">'+(r.status==='stale'?'última faz tempo':'atrasada')+(r.when?(' · '+fmtWhen(r.when)):'')+' · toque pra ver</div></div>';
      } else {
        h += '<div onclick="setTab(\'lembretes\')" style="cursor:pointer;background:#fff;border:1px solid '+CT.line+';border-left:3px solid '+CT.green+';border-radius:0 14px 14px 0;padding:12px 13px;margin-bottom:9px">'
          + '<div style="font-weight:500;font-size:14px;color:'+CT.pri+'">Próximo: '+esc((next.t||'').toLowerCase())+'</div>'
          + '<div style="font-size:12px;color:'+CT.sec+';margin-top:1px">'+(next.when?fmtWhen(next.when):'')+' · toque pra ver</div></div>';
      }
      h += '<div style="height:6px"></div>';
    } else if (att.length >= 2) {
      h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:0 2px 8px">Pra hoje</div>';
      h += '<div onclick="setTab(\'lembretes\')" style="cursor:pointer;background:#fff;border:1px solid '+CT.line+';border-left:3px solid '+CT.amber+';border-radius:0 14px 14px 0;padding:12px 13px;margin-bottom:9px">';
      h += '<div style="font-weight:500;font-size:14px;color:'+CT.pri+';margin-bottom:5px">'+att.length+' cuidados precisam de atenção</div>';
      att.slice(0,3).forEach(function(r){ h += '<div style="font-size:12.5px;color:'+CT.sec+';padding:2px 0">• '+esc(r.t||'')+' — '+(r.status==='stale'?'vencido':'atrasado')+'</div>'; });
      if (att.length>3) h += '<div style="font-size:12px;color:'+CT.mut+';padding:2px 0">+'+(att.length-3)+' mais</div>';
      h += '<div style="font-size:12px;color:'+CT.green+';margin-top:5px">Ver todos nos Lembretes ›</div></div>';
      h += '<div style="height:6px"></div>';
    }

    // --- o que a Nanny sabe: painel visual de estado + frase de memória (voz da Nanny) ---
    var bc = (typeof BREED_CARE!=='undefined' && dog.breedKey && BREED_CARE[dog.breedKey]) || {};
    var flags = [];
    if (bc.brachy) flags.push({ic:'😮‍💨',l:'respiração'});
    if (bc.bloat) flags.push({ic:'🍽️',l:'peito fundo'});
    if (bc.longBack) flags.push({ic:'🦴',l:'coluna'});
    if (bc.patella) flags.push({ic:'🦵',l:'joelho'});
    var he = dog.health || {};
    var conds = (he.condicoes||[]).map(function(x){ return (typeof x==='string')?x:(x&&x.nome); }).filter(Boolean);
    var ws = dog.weights || [], wLast = ws.length?ws[ws.length-1]:null, wDelta = null;
    if (ws.length>=2) { var dd = ws[ws.length-1].kg - ws[ws.length-2].kg; if (Math.abs(dd)>=0.3) wDelta = dd; }
    var hasState = wLast || flags.length || conds.length;
    var mem = '';
    var notes = (dog.notes||'').trim(), perg = dog.perguntas || [];
    if (notes) mem = 'Você me contou que ' + esc(notes.slice(0,90)) + (notes.length>90?'…':'') + '.';
    if (perg.length) { var lt = esc((perg[perg.length-1].texto||'').slice(0,40)); mem += (mem?' ':'') + 'A gente já conversou ' + perg.length + (perg.length>1?' vezes':' vez') + (lt?(' — a última sobre '+lt):'') + '.'; }

    if (hasState || mem) h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:0 2px 8px">O que eu sei d'+art(dog)+' '+esc(nome(dog))+'</div>';
    if (hasState) {
      h += '<div style="display:flex;gap:9px;margin-bottom:'+(conds.length?'9px':'12px')+'">';
      // peso
      h += '<div style="flex:1;background:#fff;border:1px solid '+CT.line+';border-radius:14px;padding:12px 13px">'
        + '<div style="font-size:11px;color:'+CT.mut+';text-transform:uppercase;letter-spacing:.04em">Peso</div>';
      if (wLast) h += '<div style="font-size:22px;font-weight:600;color:'+CT.pri+';line-height:1.1;margin-top:3px">'+String(wLast.kg).replace('.',',')+'<span style="font-size:13px;font-weight:400"> kg</span></div>'
        + '<div style="font-size:11.5px;margin-top:3px;color:'+(wDelta!=null?CT.amber:CT.mut)+'">'+(wDelta!=null?((wDelta>0?'↑ +':'↓ ')+String(Math.abs(wDelta).toFixed(1)).replace('.',',')+' kg'):'estável')+'</div>';
      else h += '<div style="font-size:18px;color:'+CT.mut+';margin-top:6px">—</div><div style="font-size:11.5px;color:'+CT.mut+';margin-top:2px">registre no Plano</div>';
      h += '</div>';
      // atenção da raça
      h += '<div style="flex:1;background:#fff;border:1px solid '+CT.line+';border-radius:14px;padding:12px 13px">'
        + '<div style="font-size:11px;color:'+CT.mut+';text-transform:uppercase;letter-spacing:.04em">Atenção da raça</div>';
      if (flags.length) h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px">'+flags.map(function(f){return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:'+CT.pri+';background:'+CT.cream+';border-radius:20px;padding:4px 9px">'+f.ic+' '+f.l+'</span>';}).join('')+'</div>';
      else h += '<div style="font-size:13px;color:'+CT.green+';margin-top:8px">✓ nada especial</div>';
      h += '</div>';
      h += '</div>';
      if (conds.length) h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">'+conds.map(function(cn){return '<span style="font-size:12px;color:#8a5a1a;background:#f6efdb;border:1px solid #e8d6a8;border-radius:20px;padding:5px 11px">📋 '+esc(cn)+'</span>';}).join('')+'</div>';
    }
    // --- A Nanny reparou: insights cruzados (a inteligência) ---
    var bObj = (typeof window.getBreed === 'function') ? window.getBreed(dog) : {};
    var insights = window.nannyInsights(dog, bObj, bc);
    if (insights.length) {
      h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:2px 2px 8px">A Nanny reparou</div>';
      h += '<div style="background:#fff;border:1px solid '+CT.line+';border-radius:14px;padding:4px 13px;margin-bottom:12px">';
      insights.forEach(function(k,i){ h += '<div style="display:flex;gap:11px;align-items:flex-start;padding:11px 0;'+(i?'border-top:1px solid '+CT.cream:'')+'">'
        + '<span style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:'+CT.cream+';display:flex;align-items:center;justify-content:center;font-size:15px">'+(k.ic||'💡')+'</span>'
        + '<span style="font-size:13px;color:'+CT.pri+';line-height:1.5">'+esc(k.t||'')+'</span></div>'; });
      h += '</div>';
    }

    if (mem) h += '<div style="display:flex;gap:10px;align-items:flex-start;background:'+CT.cream+';border-radius:14px;padding:12px 13px;margin-bottom:12px">'+face(30)+'<div style="flex:1;font-size:13px;color:'+CT.pri+';line-height:1.5">'+mem+'</div></div>';
    if (hasState || mem) h += '<div style="font-size:11.5px;color:'+CT.mut+';margin:0 2px 14px;line-height:1.4">Quanto mais você me conta e me manda documentos, mais eu sei. Conte medos e manias na aba Raça.</div>';

    // --- dossiê (o acúmulo, clicável) ---
    var files = dog.files || [];
    var last = files.length ? files[files.length-1] : null;
    h += '<div onclick="setTab(\'docs\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:11px 13px;background:#efe6da;border-radius:12px">'
      + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="'+CT.mut+'" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
      + '<div style="flex:1"><div style="font-size:12.5px;color:'+CT.pri+';font-weight:500">Dossiê d'+art(dog)+' '+esc(nome(dog))+'</div>'
      + '<div style="font-size:11px;color:'+CT.mut+';margin-top:1px">'+(last?('última guardada: '+esc(last.type||'documento')):'toque pra guardar carteira, exames e documentos')+'</div></div>'
      + '<span style="color:'+CT.mut+';font-size:16px">›</span></div>';

    el.innerHTML = h;
    if (g('nannyAskMount')) window.nannyAskMount();
  };
})();
