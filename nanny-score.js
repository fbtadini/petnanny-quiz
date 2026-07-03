/* nanny-score.js — SCORE DE SAÚDE (o "Whoop/Apple Health pra cães, sem aparelho") — v1
 * <script src="nanny-score.js"></script> no meu-cao.html, DEPOIS de nanny-hoje.js.
 * Expõe:
 *   window.nannyScore(dog)   -> objeto com o score, os anéis, confiança, flags, ação #1 e tendência
 *   window.renderScore(dog)  -> desenha o painel dentro de #tab-hoje (chame no lugar do headline atual)
 *
 * FILOSOFIA (por que isso existe):
 *  - É um ÍNDICE DE CUIDADO E PREVENÇÃO, não um diagnóstico. Nunca afirma doença.
 *  - Sem aparelho: só cruza o que o tutor já tem (vacina, antipulga, vermífugo, peso, rotina,
 *    idade, flags da raça). Igual Whoop/Garmin dão um número do dia; aqui o número é do cuidado.
 *  - HONESTO: dado faltando NÃO vira nota alta falsa — vira "confiança baixa". Falta de registro
 *    ≠ cão desprotegido, então não zeramos; marcamos como lacuna e pedimos o dado.
 *  - É o SWITCHING COST: o histórico do score se acumula dia a dia (scoreHistory). Quanto mais
 *    tempo, mais valioso e insubstituível — ninguém recomeça isso do zero em outro app.
 *  - PROATIVO: além do número, entrega a ÚNICA ação de maior alavanca pra subir o score.
 *
 * Globais opcionais do hub (usa se existirem, degrada se não): getBreed, ageInMonths, BREED_CARE,
 * nannyInsights, saveDogs, setTab, WESTIE.
 */
(function () {
  var CT = { pri:'#3d2c1e', sec:'#5f5142', mut:'#7a6a58', line:'#e8ddd2', green:'#4a7c59',
             greenSoft:'#7a9970', cream:'#f7f2ea', peach:'#f3ddc9', amber:'#b7902a', red:'#c0562e',
             track:'#efe6da' };
  function g(fn){ return (typeof window[fn]==='function') ? window[fn] : null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function clamp(x){ return Math.max(0, Math.min(100, x)); }
  function daysBetween(a,b){ return Math.floor((b-a)/864e5); }
  function parseD(d){ if(!d) return null; var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); if(!m) return null; var dt=new Date(+m[1], +m[2]-1, +m[3]); return isNaN(dt)?null:dt; }
  function mostRecent(arr){ var d=null; (arr||[]).forEach(function(x){ var dd=parseD(x&&x.data); if(dd&&(!d||dd>d)) d=dd; }); return d; }

  // classe funcional da vacina (heurística leve; alinha com o leitor de documento)
  function vacClass(v){
    if(v && v.classe){ var c=v.classe; if(c==='polivalente')return 'multi'; if(c==='antirrabica')return 'rabies'; return c; }
    var n=((v&&v.nome)||'').toLowerCase();
    if(/rai|rábic|rabic|antirr/.test(n)) return 'rabies';
    if(/v8|v10|v6|polivalente|nobivac|vanguard|óctupla|déctupla|dhppi|canine|canino/.test(n) && !/\bkc\b|b oral|bronchi/.test(n)) return 'multi';
    return 'outra';
  }
  // fonte ÚNICA de intervalo: o antiInterval do hub (meu-cao). Fallback local só se o hub não carregou — ALINHADO com ele.
  function antiInterval(produto){
    try{ if(typeof window.antiInterval==='function'){ var r=window.antiInterval(produto); if(r&&r.dias) return r.dias; } }catch(e){}
    var p=(''+(produto||'')).toLowerCase();
    if(/bravecto/.test(p)) return 84;
    if(/seresto|coleira/.test(p)) return 240;
    return 30; }

  // --- componente 0..100 a partir de "há quantos dias foi" vs "intervalo esperado" ---
  // known:false quando não há registro (não penaliza como 0; entra provisório e derruba confiança)
  function windowScore(lastDate, intervalDays, today){
    if(!lastDate) return { pct:45, known:false };
    var age = daysBetween(lastDate, today);
    if(age <= intervalDays) return { pct:100, known:true };
    if(age <= intervalDays*1.5) return { pct:65, known:true };
    if(age <= intervalDays*2.5) return { pct:35, known:true };
    return { pct:15, known:true };
  }

  function state(pct, known){
    if(!known) return 'incompleto';
    if(pct>=80) return 'ok';
    if(pct>=50) return 'watch';
    return 'low';
  }

  // --- TEMA RECORRENTE: o insight que a contagem de "N vezes" queria ser ---
  // Cruza os assuntos das conversas; se um SINAL DE SAÚDE voltou 2+ vezes, isso é sinal
  // (não episódio isolado). Só considera temas clínicos — ração repetida não é insight.
  function stripAcc(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  var THEMES=[
    {label:'coceira ou pele', rx:/coc(a|e)|coceira|prurido|\bpele\b|alerg|pulga|carrapat|caspa|descam|lamben/},
    {label:'vômito',          rx:/vomit|enjoo|regurgit|golfa|ansia de vomit/},
    {label:'fezes moles ou diarreia', rx:/diarr|fezes|\bcoco\b|amolec|intestin|prende o coco|constip/},
    {label:'mancar ou dor na pata', rx:/manca|claudic|\bpata\b|joelho|patela|\bperna\b|dor(?!me)/},
    {label:'tosse',           rx:/tosse|tossin|engasg|\bronco\b/},
    {label:'apetite',         rx:/come(r|ndo)? menos|apetite|nao come|recus.*comida|sem fome|parou de comer/},
    {label:'olhos',           rx:/\bolho\b|remela|lacrim|conjuntiv/},
    {label:'ouvidos',         rx:/ouvido|orelha|otite/}
  ];
  window.nannyRecurring = function (dog) {
    var pg=(dog&&dog.perguntas)||[]; if(pg.length<2) return null;
    var recent=pg.slice(-10), hits={};
    recent.forEach(function(p){ var txt=stripAcc((p.entendi||'')+' '+(p.texto||''));
      THEMES.forEach(function(th,i){ if(th.rx.test(txt)){ (hits[i]=hits[i]||[]).push(p); } }); });
    var bi=null; Object.keys(hits).forEach(function(i){ if(hits[i].length>=2 && (bi===null||hits[i].length>hits[bi].length)) bi=i; });
    if(bi===null) return null;
    var arr=hits[bi], c=arr.length, label=THEMES[bi].label, last=arr[arr.length-1];
    // o desfecho manda: resolvido não grita pra sempre — vira monitoramento gentil e some em 3 semanas
    if(last && last.outcome==='melhorou'){
      var dd=999; try{ dd=Math.floor((Date.now()-new Date((last.outcome_data||last.data)+'T00:00:00'))/864e5); }catch(e){}
      if(dd>21) return null;
      return { ic:'🔁', recurring:true, resolved:true,
        t:'Tivemos '+label+' '+c+' vezes por aqui — a última você marcou como resolvida ✓. Sigo de olho: se voltar, me conta na hora, porque aí é padrão, não episódio.' };
    }
    if(last && last.outcome==='piorou'){
      return { ic:'🔁', recurring:true,
        t:'Você já me trouxe '+label+' '+c+' vezes e a última PIOROU. Isso deixou de ser episódio isolado — leva ao veterinário.' };
    }
    return { ic:'🔁', recurring:true,
      t:'Você já me trouxe '+label+' '+c+' vezes. Se está voltando, não trate como episódio isolado — vale mostrar ao veterinário.' };
  };

  function fmtDate(d){ try{ return d.toLocaleDateString('pt-BR'); }catch(e){ return ''; } }
  // A Nanny PREVÊ: o próximo evento que muda o score (vencimento futuro) + risco sazonal.
  // É a camada preditiva — não espera vencer, avisa antes.
  window.nannyForecast = function (dog) {
    var today=new Date(); today.setHours(0,0,0,0);
    var ups = g('upcomingReminders') ? (window.upcomingReminders(dog)||[]) : [];
    var upcoming = ups.filter(function(u){ return u.status==='upcoming' && u.when; }).sort(function(a,b){ return a.when-b.when; });
    var next = upcoming[0];
    var care = (typeof BREED_CARE!=='undefined' && dog.breedKey && BREED_CARE[dog.breedKey]) || {};
    var mo = today.getMonth(), hot = (mo>=8 || mo<=2);   // verão BR ~ set–mar
    if(next){
      var days = Math.ceil((next.when - today)/864e5);
      var lim = Math.max(7, Math.min(21, Math.round(((next.intervalo)||365)*0.2)));   // 30d->7 · 84d->17 · anual->21
      if(days>=0 && days<=lim){
        var t=String(next.t||''), isProt=/vacin|antip|verm|polivalente|r[áa]bic/i.test(t) || next.tipo==='Vacina';
        var nome=t.split(/\s[—-]\s|\s\(/)[0].trim().toLowerCase();   // "Antirrábica — anual" -> "antirrábica"
        return { ic:'⏳', t:nome.charAt(0).toUpperCase()+nome.slice(1)+' vence em '+days+' dia'+(days!==1?'s':'')+' ('+fmtDate(next.when)+')'+(isProt?' — bom já programar a próxima.':'.') };
      }
    }
    if(care.brachy && hot) return { ic:'🌡️', t:'Estação quente chegando: focinho achatado sofre mais no calor — planeje passeios cedo/tarde e evite esforço no sol.' };
    return null;
  };

  window.nannyScore = function (dog) {
    var today = new Date(); today.setHours(0,0,0,0);
    var he = dog.health || {};
    var meses = g('ageInMonths') ? window.ageInMonths(dog) : (dog.idadeMeses!=null?dog.idadeMeses:null);
    var filhote = (dog.origem==='filhote_criador') || (meses!=null && meses<12);
    var senior = (meses!=null && meses>=96);
    var b = g('getBreed') ? window.getBreed(dog) : {};
    var care = (typeof BREED_CARE!=='undefined' && dog.breedKey && BREED_CARE[dog.breedKey]) || {};
    var lacunas = [];

    // ---------------- ANEL 1 — PROTEÇÃO (vacina + antipulga + vermífugo) ----------------
    var vac = he.vacinas || [];
    var lastMulti = mostRecent(vac.filter(function(v){return vacClass(v)==='multi';}));
    var lastRabies = mostRecent(vac.filter(function(v){return vacClass(v)==='rabies';}));
    var lastAnti  = mostRecent(he.antiparasitario);
    var lastVerm  = mostRecent(he.vermifugo);
    var antiProd = (he.antiparasitario&&he.antiparasitario.length)?he.antiparasitario[he.antiparasitario.length-1].produto:((dog.done&&dog.done.antiProduto&&dog.done.antiProduto!=='outro')?dog.done.antiProduto:'');
    var antiOv=(dog.done&&+dog.done.antiIntervalo)||0;
    var antiInt = antiOv || antiInterval(antiProd);
    var vermInt = filhote ? 30 : 120;

    // REGISTROS RÁPIDOS (done.*) também contam: quem marca sem mandar documento não pode ficar com "lacuna" eterna.
    // Classifica pelo NOME do item do plano (fonte única) — sem chaves hardcoded.
    try{
      if(typeof window.carePlan==='function'){
        window.carePlan(dog).forEach(function(it){
          var dd=(dog.done&&it&&dog.done[it.key])?parseD(dog.done[it.key]):null; if(!dd) return;
          var lo=((it.grupo||'')+' '+(it.nome||'')).toLowerCase();
          if(it.key==='anti'){ if(!lastAnti||dd>lastAnti) lastAnti=dd; }
          else if(it.key==='verm'){ if(!lastVerm||dd>lastVerm) lastVerm=dd; }
          else if(/r[áa]bica|antirr/.test(lo)){ if(!lastRabies||dd>lastRabies) lastRabies=dd; }
          else if(/v8|v10|polivalente|m[úu]ltipla/.test(lo)){ if(!lastMulti||dd>lastMulti) lastMulti=dd; }
        });
      }
    }catch(e){}
    var cMulti  = windowScore(lastMulti, 395, today);   // ~13 meses
    var cRabies = windowScore(lastRabies, 395, today);
    // idade importa: antirrábica só é esperada a partir de ~16 semanas (~112 dias) — antes disso não é lacuna nem buraco.
    // Em DIAS: ageInMonths de calendário arredonda e errava por 1 mês na borda (105d virava "4 meses").
    var idadeDias=null; try{ if(dog.nascimento){ idadeDias=Math.floor((today - new Date(dog.nascimento+'T00:00:00'))/864e5); } }catch(e){}
    var rabiesExpected = !((idadeDias!=null && idadeDias<115) || (idadeDias==null && meses!=null && meses<4));
    if(!rabiesExpected && !cRabies.known) cRabies = { pct:100, known:true, notYet:true };
    var cAnti   = windowScore(lastAnti, antiInt, today);
    var cVerm   = windowScore(lastVerm, vermInt, today);
    var comps = [cMulti, cRabies, cAnti, cVerm];
    // Proteção pondera VACINA CORE (multi+antirrábica) acima de parasitas — uma core atrasada
    // é mais grave que antipulga, e média simples deixava um item bom mascarar o outro.
    var coreScore = (cMulti.pct + cRabies.pct)/2;
    var parasiteScore = (cAnti.pct + cVerm.pct)/2;
    var protecao = Math.round(coreScore*0.65 + parasiteScore*0.35);
    var protKnown = comps.filter(function(c){return c.known;}).length;
    if(!cMulti.known)  lacunas.push('vacina polivalente');
    if(rabiesExpected && !cRabies.known) lacunas.push('antirrábica');
    if(!cAnti.known)   lacunas.push('antipulga');
    if(!cVerm.known)   lacunas.push('vermífugo');
    // FILHOTE EM PROTOCOLO: dose sugerida já passada e não registrada é o maior risco da vida do cão.
    // Usa o plano do hub (mesma fonte, sem duplicar cronograma).
    var puppyPend = [];
    try{
      if(meses!=null && meses<12 && typeof window.carePlan==='function' && typeof window.itemStatus==='function'){
        window.carePlan(dog).forEach(function(it){ if(!it.recorrente){ var st=window.itemStatus(dog,it); if(st&&st.st==='overdue') puppyPend.push(it); } });
      }
    }catch(e){}
    if(puppyPend.length){ protecao = Math.min(protecao, 55); }

    // ---------------- ANEL 2 — PESO (estável e saudável; recência do registro) ----------------
    // NUNCA "quanto menor melhor". Recompensa estabilidade + registro recente; penaliza oscilação
    // brusca (mais ainda em raça com joelho/coluna sensível). Sem registro => incompleto.
    var ws = (dog.weights||[]).slice().sort(function(a,b){return String(a.d).localeCompare(String(b.d));});
    var pesoPct, pesoKnown = ws.length>0, pesoDetail='';
    if(!ws.length){ pesoPct=55; lacunas.push('peso'); pesoDetail='sem pesagem registrada'; }
    else {
      var last=ws[ws.length-1], lastD=parseD(last.d), rec = lastD?daysBetween(lastD, today):999;
      var recencia = rec<=95 ? 100 : (rec<=190 ? 70 : (rec<=380 ? 45 : 25));
      var estab = 100, delta=null;
      if(ws.length>=2){ delta = last.kg - ws[ws.length-2].kg; var pct=Math.abs(delta)/Math.max(1,ws[ws.length-2].kg);
        if(filhote && delta>0){ estab = 100; }   // filhote crescendo = saúde, não oscilação
        else {
          estab = pct<=0.03 ? 100 : (pct<=0.07 ? 75 : (pct<=0.12 ? 50 : 25));
          if(delta>0 && (care.patella||care.longBack)) estab = Math.max(0, estab-15);   // ganho pesa na articulação
        }
      }
      pesoPct = Math.round(recencia*0.45 + estab*0.55);
      pesoDetail = String(last.kg).replace('.',',')+' kg' + (delta!=null?(' ('+(delta>0?'+':'')+delta.toFixed(1).replace('.',',')+' kg)'):'') + (rec>190?' · pesagem antiga':'');
    }

    // ---------------- ANEL 3 — ROTINA (aderência + engajamento recente) ----------------
    var ups = g('upcomingReminders') ? (window.upcomingReminders(dog)||[]) : [];
    var atrasados = ups.filter(function(u){return u.status==='overdue'||u.status==='stale';}).length;
    var rotinaBase = atrasados===0 ? 100 : (atrasados===1 ? 70 : (atrasados===2 ? 45 : 25));
    // engajamento: última interação (pergunta/pesagem/documento) recente = cuidado ativo
    var lastAsk = (dog.perguntas||[]).length ? parseD(dog.perguntas[dog.perguntas.length-1].data) : null;
    var lastDoc = (dog.files||[]).length ? new Date(dog.files[dog.files.length-1].at||0) : null;
    var lastW = ws.length ? parseD(ws[ws.length-1].d) : null;
    var lastTouch = [lastAsk,lastDoc,lastW].filter(Boolean).sort(function(a,b){return b-a;})[0] || null;
    var engaj = !lastTouch ? 55 : (function(){ var d=daysBetween(lastTouch, today); return d<=30?100:(d<=60?80:(d<=120?55:35)); })();
    var rotina = Math.round(rotinaBase*0.6 + engaj*0.4);
    // cold-start: sem NENHUM histórico de cuidado, "nada atrasado" não é rotina em dia — não pinta verde
    var temDone = dog.done && Object.keys(dog.done).length>0;
    var temAlgumHist = (he.vacinas||[]).length || (he.antiparasitario||[]).length || (he.vermifugo||[]).length || (dog.perguntas||[]).length || ws.length || temDone;
    if(!temAlgumHist) rotina = Math.min(rotina, 45);

    // ---------------- SCORE COMPOSTO ----------------
    var score = Math.round(protecao*0.42 + pesoPct*0.28 + rotina*0.30);
    // ajuste por fase: sênior sem exame recente reduz um pouco (a régua sobe com a idade)
    var temExameRecente = (he.exames||[]).some(function(e){ var d=parseD(e.data); return d && daysBetween(d,today)<=210; });
    if(senior && !temExameRecente){ score = Math.max(0, score-6); }
    score = clamp(score);

    // confiança: alta se sabemos proteção + peso; baixa se muita lacuna
    var conf = (protKnown>=3 && pesoKnown) ? 'alta' : ((protKnown>=2 || (protKnown>=1 && pesoKnown)) ? 'media' : 'baixa');

    // flags de raça (gerenciar, não punir o cão)
    var flags = [];
    if(care.patella)  flags.push({ic:'🦵', t:'joelho (patela)'});
    if(care.longBack) flags.push({ic:'🦴', t:'coluna longa'});
    if(care.brachy)   flags.push({ic:'😮‍💨', t:'focinho achatado'});
    if(care.bloat)    flags.push({ic:'🍽️', t:'peito fundo'});
    if(senior)        flags.push({ic:'🎂', t:'fase sênior'});

    // ação #1: o gargalo de maior alavanca (menor anel conhecido -> lacuna concreta)
    var rings = [
      { key:'protecao', label:'Proteção', pct:protecao, state:state(protecao,protKnown>0), known:protKnown>0 },
      { key:'peso',     label:'Peso',     pct:pesoPct,  state:state(pesoPct,pesoKnown),     known:pesoKnown, detail:pesoDetail },
      { key:'rotina',   label:'Rotina',   pct:rotina,   state:state(rotina,true),           known:true }
    ];
    if(!rabiesExpected){ lacunas = lacunas.filter(function(l){ return !/r[áa]bica/.test(l); }); }  // <16 semanas: rábica não é lacuna, venha de onde vier
    var topAction = pickAction(rings, lacunas, atrasados, senior, temExameRecente, dog, ws, today, puppyPend);

    // tendência: histórico de peso real (prova de conceito do gráfico longitudinal)
    var trend = ws.slice(-8).map(function(w){ return { d:w.d, kg:w.kg }; });

    var verditoTxt = verdito(score, conf);
    if(atrasados>0 && /muito bom/i.test(verditoTxt)) verditoTxt='Bom';   // coerência: com atraso na tela, o rótulo não fecha em "Muito bom"
    return { score:score, verdito:verditoTxt, conf:conf, rings:rings, flags:flags,
             lacunas:lacunas, topAction:topAction, trend:trend, senior:senior };
  };

  function verdito(score, conf){
    var base = score>=85?'Muito bom' : score>=70?'Bom' : score>=50?'Requer atenção' : 'Precisa de cuidado';
    return base;
  }

  function pickAction(rings, lacunas, atrasados, senior, temExameRecente, dog, ws, today, puppyPend){
    // prioridade nova: dose de filhote pendente acima de tudo — confirmar/registrar antes de alarmar
    if(puppyPend && puppyPend.length){ var itp=puppyPend[0];
      return { t:'A '+itp.nome+' era pra ~'+(itp.sugerido?fmtDate(itp.sugerido):'estas semanas')+'. Se já foi dada, registra em 10 segundos; se não, agenda com o vet — nessa fase é a proteção que mais importa.', cta:'saude', ic:'💉', topic:'vacina' }; }
    // prioridade: proteção com lacuna > atrasados > peso sem/antigo > sênior sem exame > manter
    if(lacunas.indexOf('vacina polivalente')>=0 || lacunas.indexOf('antirrábica')>=0){
      var jaLeu = (typeof window.hasHealthData==='function') && window.hasHealthData(dog);
      var faltaV = (lacunas.indexOf('vacina polivalente')>=0?'a polivalente (V8/V10)':'a antirrábica');
      return jaLeu
        ? { t:'Na carteira que li não achei '+faltaV+'. Se já foi dada, registra no plano em 10 segundos; se não, agenda com o vet.', cta:'saude', ic:'💉', topic:'vacina' }
        : { t:'Suba a carteira de vacinação — é o que mais pesa no score e eu monto o histórico sozinha.', cta:'carteira', ic:'💉', topic:'vacina' };
    }
    if(atrasados>0)
      return { t:'Tem '+atrasados+(atrasados>1?' cuidados atrasados':' cuidado atrasado')+' — registrar (ou renovar) sobe o anel de Rotina.', cta:'carteira', ic:'⏰', topic:'rotina' };
    if(lacunas.indexOf('antipulga')>=0 || lacunas.indexOf('vermífugo')>=0)
      return { t:'Falta registrar antipulga/vermífugo — sem isso a Proteção fica no escuro.', cta:'carteira', ic:'🛡️', topic:'protecao' };
    if(!ws.length)
      return { t:'Registre o peso uma vez — vira a linha de base que eu acompanho pra proteger as articulações.', cta:'cuidados', ic:'⚖️', topic:'peso' };
    if(ws.length){ var lastD=parseD(ws[ws.length-1].d); if(lastD && daysBetween(lastD,today)>190)
      return { t:'A última pesagem é antiga — uma nova me deixa ver a tendência de peso de novo.', cta:'cuidados', ic:'⚖️', topic:'peso' }; }
    if(senior && !temExameRecente)
      return { t:'Cão sênior: um check-up com exame de sangue nos próximos meses mantém o score sólido — vale falar com o vet.', cta:null, ic:'🩺', topic:'exame' };
    return { t:'Está tudo em dia. Continue registrando que o histórico fica cada vez mais valioso.', cta:null, ic:'✅', topic:'manter' };
  }

  // ---------------- RENDER ----------------
  function ring(pct, size, stroke, color){
    var r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1 - clamp(pct)/100);
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" aria-hidden="true">'
      + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="'+CT.track+'" stroke-width="'+stroke+'"/>'
      + '<circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+stroke+'" stroke-linecap="round" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 '+size/2+' '+size/2+')"/>'
      + '</svg>';
  }
  function scoreColor(s){ return s>=85?CT.green : s>=70?CT.greenSoft : s>=50?CT.amber : CT.red; }
  function ringColor(st){ return st==='ok'?CT.greenSoft : st==='watch'?CT.amber : st==='low'?CT.red : CT.mut; }

  // sparkline genérico a partir de uma lista de números (score ao longo do tempo, peso, etc.)
  function sparklineVals(vals, color, w){
    if(!vals || vals.length<2) return '';
    var W=w||150, H=30, pad=3, min=Math.min.apply(null,vals), max=Math.max.apply(null,vals), span=(max-min)||1;
    var pts=vals.map(function(v,i){ var x=pad+(W-2*pad)*(i/(vals.length-1)); var y=H-pad-(H-2*pad)*((v-min)/span); return x.toFixed(1)+','+y.toFixed(1); });
    var lastXY=pts[pts.length-1].split(',');
    return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'
      + '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+(color||CT.greenSoft)+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<circle cx="'+lastXY[0]+'" cy="'+lastXY[1]+'" r="2.6" fill="'+(color||CT.green)+'"/></svg>';
  }

  function sparkline(trend){
    if(trend.length<2) return '';
    var kgs=trend.map(function(t){return t.kg;}), min=Math.min.apply(null,kgs), max=Math.max.apply(null,kgs);
    var W=150, H=34, pad=3, span=(max-min)||1;
    var pts=trend.map(function(t,i){ var x=pad+(W-2*pad)*(i/(trend.length-1)); var y=H-pad-(H-2*pad)*((t.kg-min)/span); return x.toFixed(1)+','+y.toFixed(1); });
    var last=trend[trend.length-1];
    return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'
      + '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+CT.greenSoft+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<circle cx="'+pts[pts.length-1].split(',')[0]+'" cy="'+pts[pts.length-1].split(',')[1]+'" r="2.6" fill="'+CT.green+'"/></svg>';
  }

  window.renderScore = function (dog) {
    if(!dog) return '';
    var s = window.nannyScore(dog);
    var today0 = new Date(); today0.setHours(0,0,0,0);

    // tendência: compara com o score de ~7 dias atrás, ANTES de gravar o de hoje
    var histBefore = (dog.scoreHistory||[]).slice();
    var delta = null;
    if(histBefore.length){
      var wk = histBefore.filter(function(hh){ var d=parseD(hh.d); return d && daysBetween(d,today0)>=6; });
      var base = wk.length ? wk[wk.length-1].s : histBefore[0].s;
      if(typeof base==='number') delta = s.score - base;
    }

    // acumula histórico do score (1x por dia) — o switching cost longitudinal
    try {
      if(s.conf==='baixa') throw 0;  // 48 provisório não é linha de base, é ruído
      dog.scoreHistory = dog.scoreHistory || [];
      var iso = today0.toISOString().slice(0,10);
      var lastH = dog.scoreHistory[dog.scoreHistory.length-1];
      if(!lastH || lastH.d !== iso){ dog.scoreHistory.push({ d:iso, s:s.score }); if(dog.scoreHistory.length>60) dog.scoreHistory=dog.scoreHistory.slice(-60); if(g('saveDogs')) window.saveDogs(); }
      else if(lastH && lastH.s !== s.score){ lastH.s = s.score; if(g('saveDogs')) window.saveDogs(); }
    } catch(e){}
    var sparkVals = (dog.scoreHistory||[]).map(function(hh){ return hh.s; });

    var isSetup = (s.conf==='baixa');
    var col = isSetup ? CT.mut : scoreColor(s.score);
    var confTxt = s.conf==='alta' ? '' : (s.conf==='media' ? 'confiança média · faltam alguns dados' : 'confiança baixa · faltam dados-chave');
    var deltaChip = '';
    if(delta!=null && Math.abs(delta)>=1){
      var up = delta>0, dc = up?CT.greenSoft:CT.red;
      deltaChip = '<div><span style="display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;color:'+dc+';background:'+(up?'#eef3ea':'#f7ece0')+';border-radius:20px;padding:2px 9px;margin-top:5px">'+(up?'▲':'▼')+' '+(up?'+':'')+delta+' esta semana</span></div>';
    } else if(delta!=null){
      deltaChip = '<div style="font-size:11.5px;color:'+CT.mut+';margin-top:5px">→ estável esta semana</div>';
    }

    var h = '<div style="background:#fff;border:1px solid '+CT.line+';border-radius:16px;padding:16px 15px 14px;margin-bottom:14px">';

    // topo: gauge grande + veredito
    h += '<div style="display:flex;align-items:center;gap:16px">';
    h += '<div style="position:relative;flex:0 0 96px;width:96px;height:96px">'+ring(s.score,96,9,col)
      + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">'
      + '<div style="font-family:\'Playfair Display\',Georgia,serif;font-weight:800;font-size:28px;color:'+col+';line-height:1">'+(isSetup?'—':s.score)+'</div>'
      + '<div style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:'+CT.mut+'">'+(isSetup?'score':'de 100')+'</div></div></div>';
    h += '<div style="flex:1;min-width:0">'
      + '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:'+CT.mut+'">Score de saúde d'+((dog.sexo==='femea')?'a ':'o ')+esc(dog.nome||'seu cão')+'</div>'
      + '<div style="font-family:\'Playfair Display\',Georgia,serif;font-weight:800;font-size:21px;color:'+col+';line-height:1.1;margin-top:2px">'+(isSetup?'Ainda sem score':esc(s.verdito))+'</div>'
      + (isSetup?('<div style="font-size:12px;color:'+CT.mut+';margin-top:4px;line-height:1.4">Destrava com a carteira de vacinação + 1 pesagem — eu leio e monto sozinha.</div>'):deltaChip)
      + (confTxt?('<div style="font-size:11.5px;color:'+CT.amber+';margin-top:3px">'+confTxt+'</div>'):'')
      + '</div></div>';

    // tendência do score (longitudinal) — aparece quando há histórico de alguns dias
    if(!isSetup && sparkVals.length>=3){
      h += '<div style="display:flex;align-items:center;gap:11px;margin-top:12px;padding:9px 11px;background:'+CT.cream+';border-radius:12px">'
        + '<div style="flex:0 0 auto">'+sparklineVals(sparkVals, col, 148)+'</div>'
        + '<div style="flex:1;font-size:11px;color:'+CT.mut+';line-height:1.35">Tendência do score · últimos '+sparkVals.length+' registros. Quanto mais você acompanha, mais fina fica a leitura.</div></div>';
    }

    // três anéis (Proteção / Peso / Rotina) — estilo Apple. Peso = registro rápido (1 toque).
    h += '<div style="display:flex;gap:8px;margin-top:16px">';
    s.rings.forEach(function(rg){
      var rc = ringColor(rg.state);
      var val = rg.known ? (rg.pct+'%') : '—';
      var isPeso = (rg.key==='peso');
      var canLog = isPeso && (typeof window.nannyLogWeight==='function');
      var sub = rg.state==='incompleto' ? (canLog?'toque pra pesar':'sem dado') : (rg.detail ? esc(rg.detail) : (rg.state==='ok'?'em dia':(rg.state==='watch'?'atenção':'atrasado')));
      var onclk = canLog ? 'nannyLogWeight()' : "setTab('saude');window.scrollTo({top:0,behavior:'smooth'})";
      h += '<button onclick="'+onclk+'" style="flex:1;text-align:center;background:'+CT.cream+';border:0;border-radius:12px;padding:11px 6px;cursor:pointer;font-family:inherit">'
        + '<div style="position:relative;width:52px;height:52px;margin:0 auto">'+ring(rg.known?rg.pct:0,52,6,rc)
        + '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:'+rc+'">'+val+'</div></div>'
        + '<div style="font-size:12px;font-weight:600;color:'+CT.pri+';margin-top:6px">'+rg.label+(canLog?' <span style="color:'+CT.greenSoft+'">＋</span>':'')+'</div>'
        + '<div style="font-size:10.5px;color:'+CT.mut+';margin-top:1px;line-height:1.3;min-height:26px">'+sub+'</div></button>';
    });
    h += '</div>';

    // A Nanny PREVÊ: o próximo evento que muda o score (camada preditiva)
    var prev = null; try { prev = (typeof window.nannyForecast==='function') ? window.nannyForecast(dog) : null; } catch(e){}
    if(prev){
      h += '<div style="display:flex;gap:11px;align-items:flex-start;background:#eef4fa;border:1px solid #d9e6f2;border-radius:12px;padding:11px 13px;margin-top:13px">'
        + '<span style="flex:0 0 30px;width:30px;height:30px;border-radius:50%;background:#dcebf7;display:flex;align-items:center;justify-content:center;font-size:15px">'+(prev.ic||'📅')+'</span>'
        + '<div style="flex:1"><div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#3f6a94;font-weight:700;margin-bottom:2px">A Nanny prevê</div>'
        + '<div style="font-size:13px;color:'+CT.pri+';line-height:1.5">'+esc(prev.t)+'</div></div></div>';
    }

    // A Nanny reparou: a ação #1 pra subir o score (proativo)
    if(s.topAction){
      var faceSvg = (typeof WESTIE!=='undefined'&&WESTIE)?WESTIE:'';
      h += '<div style="display:flex;gap:11px;align-items:flex-start;background:'+CT.cream+';border-radius:12px;padding:12px 13px;margin-top:13px">'
        + '<span style="flex:0 0 32px;width:32px;height:32px;border-radius:50%;background:'+CT.peach+';border:1px solid #f3d9c2;display:flex;align-items:center;justify-content:center;overflow:hidden">'+(faceSvg||('<span style="font-size:16px">'+(s.topAction.ic||'💡')+'</span>'))+'</span>'
        + '<div style="flex:1"><div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.greenSoft+';font-weight:700;margin-bottom:2px">Pra subir o score</div>'
        + '<div style="font-size:13px;color:'+CT.pri+';line-height:1.5">'+esc(s.topAction.t)+'</div>'
        + (s.topAction.cta?('<button onclick="setTab(\''+s.topAction.cta+'\');window.scrollTo({top:0,behavior:\'smooth\'})" style="margin-top:8px;background:'+CT.greenSoft+';color:#fff;border:0;border-radius:9px;padding:8px 14px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit">Resolver agora</button>'):'')
        + '</div></div>';
    }

    // A Nanny reparou: 1 insight cruzado dentro do card (recorrência tem prioridade).
    // Fundido aqui pra ser a ÚNICA superfície de inteligência da Hoje.
    var reparou = null;
    try { reparou = (typeof window.nannyRecurring==='function') ? window.nannyRecurring(dog) : null; } catch(e){}
    if(!reparou && typeof window.nannyInsights==='function'){
      var b2 = g('getBreed') ? window.getBreed(dog) : {};
      var c2 = (typeof BREED_CARE!=='undefined' && dog.breedKey && BREED_CARE[dog.breedKey]) || {};
      var ins = []; try { ins = window.nannyInsights(dog, b2, c2) || []; } catch(e){}
      var actTopic = (s.topAction && s.topAction.topic) || '';
      ins = ins.filter(function(k){ return !(actTopic==='peso' && k.ic==='⚖️'); });  // não repete o que a ação já diz
      if(ins.length) reparou = ins[0];
    }
    if(reparou){
      h += '<div style="display:flex;gap:11px;align-items:flex-start;margin-top:11px;padding-top:12px;border-top:1px solid '+CT.cream+'">'
        + '<span style="flex:0 0 32px;width:32px;height:32px;border-radius:50%;background:'+CT.peach+';border:1px solid #f3d9c2;display:flex;align-items:center;justify-content:center;overflow:hidden">'+(((typeof WESTIE!=='undefined')&&WESTIE)?WESTIE:('<span style="font-size:15px">'+(reparou.ic||'💡')+'</span>'))+'</span>'
        + '<div style="flex:1"><div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';font-weight:700;margin-bottom:2px">A Nanny reparou</div>'
        + '<div style="font-size:13px;color:'+CT.pri+';line-height:1.5">'+esc(reparou.t||'')+'</div></div></div>';
    }

    // flags da raça (gerenciar) + tendência de peso
    if(s.flags.length){
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:13px">';
      h += '<span style="font-size:11px;color:'+CT.mut+';align-self:center;margin-right:2px">A monitorar:</span>';
      s.flags.forEach(function(f){ h += '<span style="font-size:11.5px;color:'+CT.sec+';background:'+CT.cream+';border:1px solid '+CT.line+';border-radius:16px;padding:4px 10px">'+f.ic+' '+esc(f.t)+'</span>'; });
      h += '</div>';
    }
    if(s.trend.length>=2){
      var first=s.trend[0], last=s.trend[s.trend.length-1], tot=(last.kg-first.kg);
      h += '<div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid '+CT.cream+'">'
        + '<div style="flex:0 0 auto">'+sparklineVals(s.trend.map(function(t){return t.kg;}), CT.greenSoft, 120)+'</div>'
        + '<div style="flex:1;font-size:11.5px;color:'+CT.mut+';line-height:1.4"><b style="color:'+CT.sec+';font-weight:600">Peso</b>: '+String(first.kg).replace('.',',')+' → '+String(last.kg).replace('.',',')+' kg '
        + '<span style="color:'+(Math.abs(tot)<0.3?CT.mut:(tot>0?CT.amber:CT.greenSoft))+'">('+(tot>0?'+':'')+tot.toFixed(1).replace('.',',')+' kg)</span></div></div>';
    }

    h += '<div style="font-size:10.5px;color:'+CT.mut+';margin-top:12px;line-height:1.4;opacity:.9">O score é um índice de cuidado e prevenção — não é diagnóstico. A decisão de saúde é sempre do veterinário.</div>';
    h += '</div>';
    return h;
  };
})();
