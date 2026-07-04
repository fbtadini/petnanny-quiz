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
  var CT = { pri:'var(--ct-pri)', sec:'var(--ct-sec)', mut:'var(--ct-mut)', line:'var(--ct-line)', green:'var(--ct-greensoft)', cream:'var(--ct-cream)', peach:'var(--ct-peach)', amber:'var(--ct-amber)', red:'var(--ct-red)' };
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
    // CRUZAMENTO: mudança de faixa de peso — dose de antiparasitário/vermífugo acompanha o peso
    try{
      var wsX=dog.weights||[];
      if(wsX.length>=2 && typeof window.faixaFromKg==='function'){
        var _BND={'0':'< 2 kg','1':'2–4,5 kg','2':'4,5–10 kg','3':'10–20 kg','4':'20–40 kg','5':'40–56 kg'};
        var fA=window.faixaFromKg(wsX[wsX.length-2].kg), fB=window.faixaFromKg(wsX[wsX.length-1].kg);
        if(fA!==fB && _BND[fB] && !out.some(function(o){return /faixa de peso/.test(o.t||'');}))
          out.unshift({ic:'⚖️',t:ArtU(dog)+' '+n+' mudou de faixa de peso (agora '+_BND[fB]+') — dose de antiparasitário e vermífugo acompanha o peso; confere o rótulo na próxima compra.'});
      }
    }catch(e){}
    // CRUZAMENTO: peso atual × faixa da raça — fora da faixa sobe pra Hoje
    try{
      var wsY=dog.weights||[];
      if(wsY.length && typeof window.bandFor==='function' && typeof window.pesoStatus==='function'){
        var bdY=window.bandFor(dog, wsY[wsY.length-1].kg);
        if(bdY&&bdY.breed){ var stY=window.pesoStatus(wsY[wsY.length-1].kg,bdY.b,bdY.puppy);
          if(stY&&/^(acima|abaixo)/.test(stY.t)) out.unshift({ic:'⚖️',t:ArtU(dog)+' '+n+' está '+stY.t+'.'});
        }
      }
    }catch(e){}
    // PERFIL VIVO: personalidade envelhece — a cada ~4 meses, um convite gentil pra revisar
    try{
      if((dog.temperamento&&dog.temperamento.length)||dog.notes){
        if(!dog.tempAt){ dog.tempAt=(typeof window.localISO==='function')?window.localISO():''; if(dog.tempAt&&typeof window.saveDogs==='function')window.saveDogs(); }
        else{
          var dTp=Math.floor((Date.now()-new Date(dog.tempAt+'T00:00:00'))/864e5);
          if(dTp>=120 && !out.length) out.push({ic:'\ud83d\udcdd',t:'Faz uns '+Math.round(dTp/30)+' meses que voc\u00ea me contou como '+art(dog)+' '+n+' \u00e9. Continua igual? D\u00e1 uma revisada na aba Perfil \u2014 personalidade muda, e eu acompanho.'});
        }
      }
    }catch(e){}
    return out.slice(0, 3);
  };

  // (blocos pré-merge removidos daqui — o veredito único agora é o Score)
  // ---------- 🛒 Reposição: o consumível certo, na hora certa (anti/vermífugo pelo plano + ração estimada) ----------
  window.nannySalvarRacao = function(){
    var dog=(typeof window.dogObj==='function')?window.dogObj():null; if(!dog) return;
    var kg=parseFloat(((document.getElementById('repo-kg')||{}).value||'').replace(',','.'));
    var ab=(document.getElementById('repo-data')||{}).value||'';
    var mk=((document.getElementById('repo-marca')||{}).value||'').trim().slice(0,40);
    if(!kg||!ab){ alert('Preenche o tamanho do pacote (kg) e a data que abriu 🙂'); return; }
    dog.racao={kg:kg,aberto:ab,marca:mk};
    if(typeof window.saveDogs==='function')window.saveDogs(); if(window.nannySync)window.nannySync(true);
    if(window.renderHoje)window.renderHoje(dog);
    try{ if(window.gtag)window.gtag('event','racao_anotada',{}); }catch(e){}
  };
  window.nannySalvarTapete=function(){
    var dog=(typeof window.dogObj==='function')?window.dogObj():null; if(!dog) return;
    var q=parseInt(((document.getElementById('tp-qtd')||{}).value||''),10);
    var pd=parseInt(((document.getElementById('tp-dia')||{}).value||'2'),10)||2;
    var ini=(document.getElementById('tp-data')||{}).value||'';
    if(!q||!ini){ alert('Quantos tapetes tem o pacote e quando come\u00e7ou? 🙂'); return; }
    dog.tapete={qtd:q,porDia:pd,inicio:ini};
    if(typeof window.saveDogs==='function')window.saveDogs(); if(window.nannySync)window.nannySync(true);
    if(window.renderHoje)window.renderHoje(dog);
  };
  function nannyReposicao(dog){
    try{
      if(dog && dog.aguardando) return ''; // pré-chegada: sem reposição de cão que não chegou
      var hoje=new Date(); hoje.setHours(0,0,0,0);
      var rows=[], notaEst=false;
      var BRAND={bravecto:'/bravecto',seresto:'/seresto',simparic:'/simparic',nexgard:'/nexgard',frontline:'/frontline',drontal:'/drontal'};
      var base=(window.GEAR_LOJA&&window.GEAR_LOJA.base)||'https://www.petz.com.br/busca?q=';
      var linkDe=function(prod,q){ var k=String(prod||'').toLowerCase().split(' ')[0]; return BRAND[k]?('https://www.petz.com.br'+BRAND[k]):(base+encodeURIComponent(q||prod||'')); };
      var addRow=function(dias,label,prod,q){
        var tone=dias<0?'#b5483a':(dias<=7?'#b7902a':CT.sec);
        var when=dias<0?('venceu há '+(-dias)+' d'):(dias===0?'vence hoje':('vence em '+dias+' d'));
        rows.push('<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid '+CT.cream+'">'
          +'<span style="flex:1;font-size:13px;color:'+CT.pri+';line-height:1.4">'+esc(label)+(prod?(' \u00b7 <b>'+esc(prod)+'</b>'):'')+' <span style="color:'+tone+'">\u2014 '+when+'</span></span>'
          +'<a href="'+linkDe(prod,q)+'" target="_blank" rel="noopener" onclick="try{window.gtag&&gtag(\'event\',\'reposicao_click\',{})}catch(e){}" style="flex:0 0 auto;font-size:12px;color:#fff;background:'+CT.green+';border-radius:9px;padding:6px 12px;text-decoration:none;font-weight:600">Comprar</a></div>');
      };
      // anti + vermífugo: a MESMA fonte do plano (carePlan/itemStatus), nada de relógio paralelo
      if(typeof window.carePlan==='function' && typeof window.itemStatus==='function'){
        window.carePlan(dog).forEach(function(it){
          if(!it.recorrente || (it.key!=='anti'&&it.key!=='verm')) return;
          var s=window.itemStatus(dog,it); if(!s||!s.next) return;
          var dias=Math.round((s.next-hoje)/864e5); if(dias>21) return;
          var prod= it.key==='anti' ? ((dog.done&&dog.done.antiProduto&&dog.done.antiProduto!=='outro')?dog.done.antiProduto:'') : ((dog.done&&dog.done[it.key+'_marca'])||'');
          addRow(dias, it.key==='anti'?'Antipulga/carrapato':'Verm\u00edfugo', prod, it.key==='anti'?'antipulgas cachorro':'vermifugo cachorro');
        });
      }
      // ração: estimativa de consumo (só com peso + pacote anotado)
      var infoR='';
      var r=dog.racao;
      if(r&&r.aberto&&r.kg){
        var kgDog=(dog.weights&&dog.weights.length)?dog.weights[dog.weights.length-1].kg:null;
        if(kgDog){
          var gDia=kgDog<=10?kgDog*25:(kgDog<=25?kgDog*18:kgDog*14);
          var dur=Math.max(3,Math.round((r.kg*1000)/gDia));
          var resta=Math.round((new Date(r.aberto+'T00:00:00')-hoje)/864e5)+dur;
          if(resta<=14){ addRow(resta,'Ra\u00e7\u00e3o (estimativa)',(r.marca||''),'racao cachorro'); notaEst=true; }
          else infoR='<div style="font-size:12px;color:'+CT.mut+';padding:8px 0 2px;border-top:1px solid '+CT.cream+'">\ud83c\udf5a Ra\u00e7\u00e3o'+(r.marca?(' ('+esc(r.marca)+')'):'')+': d\u00e1 pra ~'+resta+' dias (estimativa).</div>';
        }
      } else {
        infoR='<div style="padding:9px 0 2px;border-top:1px solid '+CT.cream+'">'
          +'<div style="font-size:12.5px;color:'+CT.sec+';margin-bottom:7px">\ud83c\udf5a Ra\u00e7\u00e3o: me conta o pacote que eu aviso antes de acabar.</div>'
          +'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
          +'<input id="repo-kg" type="number" step="0.5" min="0.5" placeholder="kg do pacote" style="width:110px;padding:7px 9px;border:1px solid '+CT.line+';border-radius:9px;font-family:inherit;font-size:12.5px">'
          +'<input id="repo-data" type="date" style="padding:7px 9px;border:1px solid '+CT.line+';border-radius:9px;font-family:inherit;font-size:12.5px">'
          +'<input id="repo-marca" placeholder="marca (opcional)" style="width:130px;padding:7px 9px;border:1px solid '+CT.line+';border-radius:9px;font-family:inherit;font-size:12.5px">'
          +'<button onclick="nannySalvarRacao()" style="background:'+CT.green+';color:#fff;border:0;border-radius:9px;padding:8px 13px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit">Anotar</button>'
          +'</div></div>';
      }
      // tapete higiênico: só entra em cena pra quem usa (chip de xixi marcado ou pacote já anotado)
      var tp=dog.tapete;
      if(tp&&tp.qtd&&tp.inicio){
        var pdT=(+tp.porDia)||2, durT=Math.max(1,Math.round(tp.qtd/pdT));
        var restaT=Math.round((new Date(tp.inicio+'T00:00:00')-hoje)/864e5)+durT;
        if(restaT<=10){ rows.push('<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid '+CT.cream+'">'
          +'<span style="flex:1;font-size:13px;color:'+CT.pri+'">\ud83e\uddfb Tapete higi\u00eanico <span style="color:'+(restaT<0?'#b5483a':(restaT<=4?'#b7902a':CT.sec))+'">\u2014 '+(restaT<0?'acabou':(restaT===0?'acaba hoje':('acaba em ~'+restaT+' d')))+'</span></span>'
          +'<a href="https://www.petz.com.br/cachorro/tapetes-fraldas-e-banheiros/tapetes-higienicos" target="_blank" rel="noopener" onclick="try{window.gtag&&gtag(\'event\',\'reposicao_click\',{})}catch(e){}" style="flex:0 0 auto;font-size:12px;color:#fff;background:'+CT.green+';border-radius:9px;padding:6px 12px;text-decoration:none;font-weight:600">Comprar</a></div>'); }
        else infoR+='<div style="font-size:12px;color:'+CT.mut+';padding:8px 0 2px;border-top:1px solid '+CT.cream+'">\ud83e\uddfb Tapete: d\u00e1 pra ~'+restaT+' dias.</div>';
      } else if((dog.temperamento||[]).indexOf('xixi')>=0){
        infoR+='<div style="padding:9px 0 2px;border-top:1px solid '+CT.cream+'">'
          +'<div style="font-size:12.5px;color:'+CT.sec+';margin-bottom:7px">\ud83e\uddfb Usa tapete higi\u00eanico? Me conta o pacote que eu aviso antes de acabar.</div>'
          +'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
          +'<input id="tp-qtd" type="number" min="1" placeholder="qtd no pacote" style="width:115px;padding:7px 9px;border:1px solid '+CT.line+';border-radius:9px;font-family:inherit;font-size:12.5px">'
          +'<select id="tp-dia" style="padding:7px 9px;border:1px solid '+CT.line+';border-radius:9px;font-family:inherit;font-size:12.5px"><option value="1">1/dia</option><option value="2" selected>2/dia</option><option value="3">3/dia</option><option value="4">4/dia</option></select>'
          +'<input id="tp-data" type="date" style="padding:7px 9px;border:1px solid '+CT.line+';border-radius:9px;font-family:inherit;font-size:12.5px">'
          +'<button onclick="nannySalvarTapete()" style="background:'+CT.green+';color:#fff;border:0;border-radius:9px;padding:8px 13px;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit">Anotar</button></div></div>';
      }
      if(!rows.length && !infoR) return '';
      return '<div style="background:#fff;border:1px solid '+CT.line+';border-radius:16px;padding:13px 15px;margin-bottom:16px">'
        +'<div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.mut+';font-weight:700;margin-bottom:3px">\ud83d\uded2 Reposi\u00e7\u00e3o</div>'
        +rows.join('')+infoR
        +(notaEst?'<div style="font-size:10.5px;color:'+CT.mut+';margin-top:6px">Consumo de ra\u00e7\u00e3o \u00e9 estimativa \u2014 quantidades, com o vet.</div>':'')
        +'</div>';
    }catch(e){ return ''; }
  }

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

    h += nannyReposicao(dog);

    // --- primeiro passo (cold start): sem nenhum histórico de saúde nem documento,
    // o caminho mais rápido pro primeiro "uau" é a foto da carteira — a Nanny lê
    // e preenche tudo. Some sozinho assim que existir qualquer dado. ---
    try{
      var _he = dog.health || {};
      var _semHist = !((_he.vacinas||[]).length || (_he.antiparasitario||[]).length || (_he.vermifugo||[]).length) && !(dog.files||[]).length && !(dog.weights||[]).length;
      if (!dog.aguardando && _semHist) {
        h += '<div style="background:#fff;border:1.5px solid '+CT.green+'33;border-radius:16px;padding:14px 15px;margin-bottom:16px">'
          + '<div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:'+CT.green+';font-weight:700;margin-bottom:5px">\u2728 Primeiro passo</div>'
          + '<div style="font-size:13.5px;color:'+CT.pri+';line-height:1.5;margin-bottom:10px">Fotografa a <b>carteira de vacina\u00e7\u00e3o</b> d'+art(dog)+' '+esc(nome(dog))+' \u2014 eu leio as datas, monto o plano e te aviso do que falta. \u00c9 o jeito mais r\u00e1pido de come\u00e7ar (30 segundos, sem digitar nada).</div>'
          + '<label style="display:inline-flex;align-items:center;gap:7px;background:'+CT.green+';color:#fff;border-radius:11px;padding:11px 16px;font-weight:700;font-size:13.5px;cursor:pointer">\ud83d\udcf8 Fotografar carteira<input type="file" accept="image/*,.pdf" multiple style="display:none" onchange="setTab(\'saude\');nannyReadDoc(this,\'doc\')"></label>'
          + '<div style="font-size:11.5px;color:'+CT.mut+';margin-top:8px">N\u00e3o tem a carteira em m\u00e3os? Tudo bem \u2014 d\u00e1 pra registrar na aba Sa\u00fade quando quiser.</div>'
          + '</div>';
      }
    }catch(e){}


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
    h += '<div onclick="setTab(\'carteira\')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:11px 13px;background:var(--ct-track);border-radius:12px">'
      + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="'+CT.mut+'" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
      + '<div style="flex:1"><div style="font-size:12.5px;color:'+CT.pri+';font-weight:500">Dossiê d'+art(dog)+' '+esc(nome(dog))+'</div>'
      + '<div style="font-size:11px;color:'+CT.mut+';margin-top:1px">'+(last?('última guardada: '+esc(last.type||'documento')):'toque pra guardar carteira, exames e documentos')+'</div></div>'
      + '<span style="color:'+CT.mut+';font-size:16px">›</span></div>';

    el.innerHTML = h;
    if (g('nannyAskMount')) window.nannyAskMount();
  };
})();
