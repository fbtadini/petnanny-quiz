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
    if (c.brachy) out.push('Focinho achatado — atenção ao calor e ao esforço; peitoral, nunca coleira.');
    if (c.bloat)  out.push('Peito fundo — comer rápido aumenta o risco de torção; comedouro lento ajuda.');
    if (c.longBack) out.push('Coluna alongada — rampa (não escada) poupa o disco; evite saltos.');
    if (c.patella) out.push('Joelho propenso a luxação de patela — evite saltos do sofá e da cama.');
    var h = dog.health || {};
    (h.condicoes||[]).forEach(function(x){ var t=(typeof x==='string')?x:(x&&x.nome); if(t) out.push('Condição registrada: '+t+'.'); });
    if ((dog.weights||[]).length) {
      var w = dog.weights[dog.weights.length-1], line = 'Peso mais recente: '+w.kg+' kg.';
      if (dog.weights.length>=2) { var p=dog.weights[dog.weights.length-2], d=w.kg-p.kg; if(Math.abs(d)>=0.3) line='Peso: '+w.kg+' kg ('+(d>0?'+':'')+d.toFixed(1)+' kg desde a última pesagem).'; }
      out.push(line);
    }
    var perg = dog.perguntas || [];
    if (perg.length) { var last=perg[perg.length-1]; out.push('Você já me perguntou '+perg.length+(perg.length>1?' vezes':' vez')+' — a última: “'+esc((last.texto||'').slice(0,48))+'”.'); }
    if ((dog.notes||'').trim()) out.push('Você me contou: “'+esc((dog.notes||'').slice(0,90))+((dog.notes||'').length>90?'…':'')+'”');
    return out;
  };

  function nome(dog){ return dog.nome || 'seu cão'; }

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

    // --- o que a Nanny sabe (insights, não só o que você digitou) ---
    var knows = window.nannyKnows(dog);
    if (knows.length) {
      h += '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';margin:0 2px 8px">O que eu sei d'+art(dog)+' '+esc(nome(dog))+'</div>';
      h += '<div style="background:#fff;border:1px solid '+CT.line+';border-radius:14px;padding:6px 14px">';
      knows.forEach(function(k,i){ h += '<div style="display:flex;gap:9px;align-items:flex-start;padding:9px 0;'+(i?'border-top:1px solid '+CT.cream:'')+'"><span style="color:'+CT.green+';margin-top:5px;font-size:8px">●</span><span style="font-size:13px;color:'+CT.pri+';line-height:1.5">'+esc(k)+'</span></div>'; });
      h += '</div>';
      h += '<div style="font-size:11.5px;color:'+CT.mut+';margin:7px 2px 14px;line-height:1.4">Quanto mais você me conta e me manda documentos, mais eu sei. Conte medos e manias na aba Raça.</div>';
    }

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
