/* nanny-ask-ui.js — A PORTA ÚNICA "Pergunta pra Nanny" (cliente) — v2
 * <script src="nanny-ask-ui.js"></script> no meu-cao.html (depois do nanny-identity.js)
 * Monta sozinho em #nanny-ask (perfil) e #nanny-ask-home (tela inicial, sem cão).
 *
 * v2:
 *  - rosto da Nanny (WESTIE) onde ELA fala; nunca no dado puro do cão.
 *  - acessibilidade: texto ≥12px, contraste melhor, alvos de toque de 42px, aria-label.
 *  - skeleton de carregamento (não "✨ analisando" cru).
 *  - dossiê de saúde (condições/vacinas/exames/peso) entra no contexto → Nanny sabe do cão.
 *  - funciona SEM cão cadastrado: responde e convida a cadastrar pra guardar (pânico das 22h).
 *  - micro-feedback ao guardar ("guardado no dossiê").
 *
 * Globais do hub: dogObj, getBreed, ageLabel, ageInMonths, rangeOf, saveDogs,
 * downscaleImage, nannySync, BREED_CARE, WESTIE, gtag, startRegister.
 */
(function () {
  var NANNY_WESTIE='<svg viewBox="0 0 100 100"><path d="M24 42 L20 10 L42 24 Z" fill="#fff" stroke="#c9b798" stroke-width="3" stroke-linejoin="round"/><path d="M76 42 L80 10 L58 24 Z" fill="#fff" stroke="#c9b798" stroke-width="3" stroke-linejoin="round"/><path d="M20 55 Q20 28 50 28 Q80 28 80 55 Q80 78 72 83 Q64 89 54 88 Q50 92 46 88 Q36 89 28 83 Q20 78 20 55 Z" fill="#fff" stroke="#c9b798" stroke-width="3" stroke-linejoin="round"/><ellipse cx="38" cy="53" rx="4" ry="5" fill="#3d2c1e"/><ellipse cx="62" cy="53" rx="4" ry="5" fill="#3d2c1e"/><ellipse cx="50" cy="67" rx="6" ry="5" fill="#3d2c1e"/></svg>';
  var ENDPOINT = '/api/nanny-ask', PEND_KEY = 'petnanny_pergunta_avulsa';
  var CT = { pri:'#3d2c1e', sec:'#5f5142', mut:'#7a6a58', line:'#e8ddd2', green:'#7a9970', cream:'#f7f2ea' };
  var NIVEL = {
    leve:        { cor:'#5c7a52', bg:'#eef3ea', label:'Tranquilo' },
    observar:    { cor:'#9a7717', bg:'#f6efdb', label:'Vale observar' },
    procurar_vet:{ cor:'#c0722e', bg:'#f7ece0', label:'Procure um vet' },
    urgente:     { cor:'#b02a1f', bg:'#f7e4e1', label:'Urgente' }
  };
  function g(fn){ return (typeof window[fn]==='function')?window[fn]:null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function track(ev,p){ try{ if(window.gtag) window.gtag('event',ev,p||{});}catch(e){} }
  function nannyFace(px){ var s=(typeof WESTIE!=='undefined'&&WESTIE)?WESTIE:NANNY_WESTIE; return '<span class="na-face" aria-hidden="true" style="display:inline-flex;width:'+px+'px;height:'+px+'px;border-radius:50%;background:#f3ddc9;border:1px solid #f3d9c2;padding:4px;box-sizing:border-box;flex-shrink:0">'+s+'</span>'; }

  function styleOnce(){
    if(document.getElementById('nanny-ask-css')) return;
    var st=document.createElement('style'); st.id='nanny-ask-css';
    st.textContent='@keyframes naShimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}'
      +'.na-skel{height:12px;border-radius:6px;background:#efe6da;background-image:linear-gradient(90deg,#efe6da 0px,#f6f0e6 80px,#efe6da 160px);background-size:400px 100%;animation:naShimmer 1.1s infinite linear}'
      +'.na-btn-ic{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;background:transparent}'
      +'.na-fade{animation:naFade .28s ease}@keyframes naFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'+'.na-face svg{width:100%;height:100%;display:block}'+'.na-chip{display:inline-block;font-size:12.5px;color:#5f5142;background:#f7f2ea;border:1px solid #e8ddd2;border-radius:20px;padding:7px 13px;margin:0 6px 6px 0;cursor:pointer}';
    document.head.appendChild(st);
  }

  // ---------- contexto (dossiê de saúde entra aqui) ----------
  function saudeSlice(dog){
    var h=dog.health||{}, s={};
    if((h.condicoes||[]).length) s.condicoes=h.condicoes.slice(-5);
    if((h.vacinas||[]).length) s.vacinas_recentes=h.vacinas.slice(-4).map(function(v){return {nome:v.nome,classe:v.classe,data:v.data};});
    if((h.exames||[]).length) s.exames=h.exames.slice(-4).map(function(e){return {tipo:e.tipo,achado:e.achado,data:e.data};});
    if(dog.pesoFaixa!=null) s.peso_faixa='faixa '+dog.pesoFaixa+' (informada pelo tutor)';
    if((dog.notes||'').trim()) s.o_que_o_tutor_contou=(dog.notes||'').slice(0,300);
    return s;
  }
  function contextoCao(){
    var dog=g('dogObj')?window.dogObj():null;
    if(!dog) return { _dog:null };
    var b=g('getBreed')?window.getBreed(dog):{};
    var c=(typeof BREED_CARE!=='undefined'&&dog.breedKey&&BREED_CARE[dog.breedKey])||{};
    var carac=[];
    if(c.brachy)carac.push('braquicefálico (focinho achatado)');
    if(c.bloat)carac.push('peito fundo (risco de torção)');
    if(c.longBack)carac.push('coluna alongada');
    if(c.patella)carac.push('joelho propenso a luxação de patela');
    return { _dog:dog,
      nome:dog.nome||'', raca:(b&&b.name)||dog.customBreed||dog.raca||'',
      idade:(g('ageLabel')&&g('ageInMonths'))?window.ageLabel(window.ageInMonths(dog)):'',
      porte:(g('rangeOf')&&(window.rangeOf(dog)||{}).band)||'',
      caracteristicas_saude:carac, saude:saudeSlice(dog),
      ultimas_perguntas:(dog.perguntas||[]).slice(-3).map(function(p){return {data:p.data,texto:p.texto,nivel:p.nivel};}) };
  }

  function fileToImg(file){
    if(!file) return Promise.resolve(null);
    var ds=g('downscaleImage');
    if(ds) return window.downscaleImage(file,1400,0.82).then(function(d){return d?{data:d.split(',')[1],media_type:'image/jpeg'}:null;});
    return new Promise(function(res){var r=new FileReader();r.onload=function(){res({data:String(r.result).split(',')[1],media_type:file.type||'image/jpeg'});};r.onerror=function(){res(null);};r.readAsDataURL(file);});
  }

  var pendingImg={};

  function chipsHTML(mode){
    var chips=[['Que ração comprar?','Que ração é a certa pra ele?'],['Late quando saio','Ele late ou chora quando fico fora. O que faço?'],['O que pode comer?','O que ele pode e o que não pode comer?'],['Coçando muito','Tá se coçando muito, o que pode ser?']];
    if(mode==='perfil'){
      var dog=g('dogObj')?window.dogObj():null;
      if(dog){
        var c=(typeof BREED_CARE!=='undefined'&&dog.breedKey&&BREED_CARE[dog.breedKey])||{};
        var meses=g('ageInMonths')?window.ageInMonths(dog):null, filhote=(dog.origem==='filhote_criador')||(meses!=null&&meses<12), senior=(meses!=null&&meses>=96);
        var a=[];
        if(filhote){a.push(['Vacinas do filhote?','Quais vacinas o filhote precisa e quando?']);a.push(['Ensinar o xixi','Como ensino ele a fazer xixi no lugar certo?']);a.push(['Quando castrar?','Qual a idade certa pra castrar?']);}
        else if(senior){a.push(['Exames de idoso','Que exames de rotina um cão idoso precisa?']);a.push(['Sinais de dor','Como sei se ele está sentindo dor ou envelhecendo mal?']);}
        if(c.brachy)a.push(['Ofegante no calor','Ele fica muito ofegante no calor, é normal?']);
        if(c.coat==='double')a.push(['Queda de pelo','Ele solta muito pelo, como lido com isso?']);
        if(c.longBack)a.push(['Cuidar da coluna','Como proteger a coluna dele no dia a dia?']);
        a.push(['Que ração comprar?','Que ração é a certa pra ele?']);
        a.push(['Comportamento','Ele tem um comportamento que me preocupa, posso te contar?']);
        var day=[];
        try{ var ups=g('upcomingReminders')?window.upcomingReminders(dog):[]; var over=(ups||[]).filter(function(u){return u.status==='overdue'||u.status==='stale';})[0]; if(over){ var nm=(over.t||'cuidado').split('(')[0].trim(); day.push([nm+' atrasado',(over.t||'cuidado')+' está atrasado — como eu resolvo?']); } }catch(e){}
        chips=day.concat(a).slice(0,4);
      }
    }
    return '<div id="na-chips-'+mode+'" style="margin-top:9px">'+chips.map(function(ch){return '<span class="na-chip" data-q="'+ch[1].replace(/"/g,'&quot;')+'">'+ch[0]+'</span>';}).join('')+'</div>';
  }
  function cardHTML(mode){
    var semCao=(mode==='home');
    return '<div class="na-fade" style="background:#fff;border:1px solid '+CT.line+';border-radius:16px;padding:15px 15px 14px">'
      + '<div style="display:flex;align-items:center;gap:9px;margin-bottom:9px">'+nannyFace(30)
      + '<div><div style="font-weight:500;font-size:15px;color:'+CT.pri+'">Pergunta pra Nanny</div>'
      + '<div style="font-size:12px;color:'+CT.sec+'">'+(semCao?'Uma dúvida agora? Pode perguntar — não precisa cadastrar antes.':'Descreva ou mande uma foto. Ela usa o que sabe do seu cão.')+'</div></div></div>'
      + '<textarea id="na-text-'+mode+'" rows="2" aria-label="Sua dúvida sobre o cão" placeholder="Pode ser qualquer coisa: saúde, comportamento, ração, banho, passeio…" style="width:100%;box-sizing:border-box;border:1.5px solid '+CT.line+';border-radius:12px;padding:12px 13px;font-size:15px;font-family:inherit;color:'+CT.pri+';resize:vertical"></textarea>'+ chipsHTML(mode)
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:8px">'
      + '<button type="button" class="na-btn-ic" id="na-cam-'+mode+'" aria-label="Anexar foto"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="'+CT.mut+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/></svg></button>'
      + '<span id="na-tag-'+mode+'" style="font-size:12px;color:'+CT.green+';display:none"><span>foto anexada</span> · <a href="#" id="na-clr-'+mode+'" style="color:#b02a1f">remover</a></span>'
      + '<button type="button" id="na-send-'+mode+'" style="margin-left:auto;min-height:42px;background:'+CT.green+';color:#fff;border:0;border-radius:12px;padding:0 20px;font-weight:500;font-size:15px;cursor:pointer">Perguntar</button>'
      + '<input id="na-file-'+mode+'" type="file" accept="image/*" style="display:none">'
      + '</div>'
      + '<div id="na-phototip-'+mode+'" style="display:none;font-size:12px;color:'+CT.sec+';margin-top:9px;line-height:1.45;background:#f7f2ea;border:1px solid '+CT.line+';border-radius:10px;padding:9px 11px"><strong>Pra foto ajudar de verdade:</strong> boa luz (perto de uma janela), aproxime bem do ponto (olho, pele, dente, orelha), segure firme e evite flash direto. Pode mandar 2 ângulos. Foto torta eu leio — nítida eu leio melhor.</div>'+ '<div style="font-size:12px;color:'+CT.mut+';margin-top:9px;line-height:1.4">A Nanny não é veterinária e isto não é consulta. É orientação pra te ajudar a decidir.</div>'
      + '<div id="na-out-'+mode+'" style="margin-top:12px"></div>'
      + '</div>';
  }

  function wire(mode){
    var cam=document.getElementById('na-cam-'+mode), file=document.getElementById('na-file-'+mode);
    var chips=document.getElementById('na-chips-'+mode);
    if(chips) chips.querySelectorAll('.na-chip').forEach(function(ch){ ch.onclick=function(){ var ta=document.getElementById('na-text-'+mode); ta.value=ch.getAttribute('data-q')||ch.textContent; ta.focus(); }; });
    var tip=document.getElementById('na-phototip-'+mode);
    cam.onclick=function(){ if(tip) tip.style.display='block'; file.click(); };
    file.onchange=function(){var f=this.files&&this.files[0];if(!f)return;var tag=document.getElementById('na-tag-'+mode);tag.style.display='inline';tag.firstChild.textContent='anexando…';fileToImg(f).then(function(img){pendingImg[mode]=img;tag.firstChild.textContent=img?'foto anexada':'não deu pra ler a foto';});};
    document.getElementById('na-clr-'+mode).onclick=function(e){e.preventDefault();pendingImg[mode]=null;file.value='';document.getElementById('na-tag-'+mode).style.display='none';};
    document.getElementById('na-send-'+mode).onclick=function(){enviar(mode);};
  }

  function skeleton(out){
    out.innerHTML='<div style="display:flex;gap:9px;align-items:flex-start">'+nannyFace(30)
      +'<div style="flex:1"><div class="na-skel" style="width:40%;margin-bottom:8px"></div><div class="na-skel" style="width:90%;margin-bottom:6px"></div><div class="na-skel" style="width:75%"></div></div></div>';
  }

  var threads={perfil:[],home:[]};

  function seedFollowup(mode){
    if(mode!=='perfil')return;
    var dog=g('dogObj')?window.dogObj():null; if(!dog)return;
    if(threads.perfil.length)return;
    var pg=dog.perguntas||[]; if(!pg.length)return;
    var lp=pg[pg.length-1];
    if(lp&&(lp.nivel==='observar'||lp.nivel==='procurar_vet')){
      var t=(lp.texto||'').slice(0,40);
      threads.perfil.push({de:'nanny',r:{nivel:'observar',followup:true,o_que_fazer_agora:'Você me falou de "'+t+'" da última vez. Como está isso agora?'}});
    }
  }
  function mdLite(x){var t=esc(x==null?'':x);t=t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');t=t.replace(/(^|<br>|\s)(\d+)\.\s/g,'$1<br>$2. ');t=t.replace(/\n/g,'<br>');t=t.replace(/^(<br>)+/,'');return t;}
  function tutorBubble(texto){
    return '<div class="na-fade" style="display:flex;justify-content:flex-end;margin:10px 0 0"><div style="max-width:82%;background:'+CT.cream+';border:1px solid '+CT.line+';border-radius:14px 14px 4px 14px;padding:9px 12px;font-size:13.5px;color:'+CT.pri+';line-height:1.5">'+esc(texto)+'</div></div>';
  }
  function nannyAnswerHTML(r,dog){
    var n=NIVEL[r.nivel]||NIVEL.observar;
    var h='<div class="na-fade" style="border:1px solid '+n.cor+'33;background:'+n.bg+';border-radius:14px;padding:13px 14px;margin-top:8px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+nannyFace(28)
      + '<span style="font-weight:500;color:'+n.cor+';font-size:14px">'+(r.followup?'A Nanny quer saber':n.label)+'</span></div>';
    if(r.o_que_fazer_agora)h+='<div style="font-size:14.5px;color:'+CT.pri+';line-height:1.6'+(r.por_que?';margin-bottom:8px':'')+'">'+mdLite(r.o_que_fazer_agora)+'</div>';
    if(r.por_que)h+='<div style="font-size:13px;color:'+CT.sec+';line-height:1.55">'+mdLite(r.por_que)+'</div>';
    if(r.nivel==='urgente'||r.nivel==='procurar_vet'){
      var termo=r.nivel==='urgente'?'pronto atendimento veterinário 24h perto de mim':'veterinário perto de mim';
      h+='<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(termo)+'" target="_blank" rel="noopener" style="display:inline-block;margin-top:9px;background:'+n.cor+';color:#fff;text-decoration:none;border-radius:10px;padding:10px 16px;font-weight:500;font-size:13.5px">Achar um vet perto</a>';
    }
    if(r.pro_vet)h+='<div style="font-size:12px;color:'+CT.green+';margin-top:9px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="'+CT.green+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Guardei um resumo pra levar ao vet \u2014 está na aba Carteira.</div>';
    if(!r.followup)h+='<div style="font-size:11.5px;color:'+CT.mut+';margin-top:9px;line-height:1.4">A Nanny não é veterinária e isto não é consulta. A decisão de saúde é sempre do seu veterinário.</div>';
    h+='</div>';
    return h;
  }
  function renderThread(mode){
    var out=document.getElementById('na-out-'+mode); if(!out)return;
    var dog=g('dogObj')?window.dogObj():null; var h='';
    threads[mode].forEach(function(m){ h+= m.de==='tutor'?tutorBubble(m.texto):nannyAnswerHTML(m.r,dog); });
    var last=threads[mode][threads[mode].length-1];
    if(dog && last && last.de==='nanny'){
      h+='<div style="font-size:12px;color:'+CT.mut+';margin-top:10px;text-align:center">↑ Pode continuar a conversa na caixa acima.</div>';
    }
    if(!dog && last && last.de==='nanny'){
      h+='<div class="na-fade" style="margin-top:10px;background:'+CT.cream+';border:1px solid '+CT.line+';border-radius:12px;padding:12px 13px"><div style="font-size:13px;color:'+CT.pri+';line-height:1.5;margin-bottom:9px">Quer que eu guarde isso e acompanhe? Cadastra seu cão \u2014 leva 10 segundos.</div><button type="button" id="na-go-reg" style="background:'+CT.green+';color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:500;font-size:14px;cursor:pointer">Cadastrar meu cão</button></div>';
    }
    out.innerHTML=h;
    var go=document.getElementById('na-go-reg'); if(go)go.onclick=function(){ if(g('startRegister'))window.startRegister(); };
  }
  function enviar(mode,isReply){
    var out=document.getElementById('na-out-'+mode);
    var el=document.getElementById('na-text-'+mode);
    var texto=((el&&el.value)||'').trim();
    var img=isReply?null:pendingImg[mode];
    if(!texto&&!img){ if(!isReply&&out)out.innerHTML='<div style="font-size:13px;color:#b02a1f">Escreve a dúvida ou anexa uma foto.</div>'; return; }
    var ctx=contextoCao(); var dog=ctx._dog; delete ctx._dog;
    threads[mode].push({de:'tutor',texto:texto||'(foto)'});
    var conversa=threads[mode].map(function(m){return {de:m.de,texto:m.de==='nanny'?((m.r&&m.r.o_que_fazer_agora)||''):m.texto};});
    var body={ texto:texto, conversa:conversa }; if(img) body.imagens=[img];
    if(dog) body.contexto_cao=ctx;
    if(el)el.value='';
    if(!isReply){ pendingImg[mode]=null; var fe=document.getElementById('na-file-'+mode); if(fe)fe.value=''; var tg=document.getElementById('na-tag-'+mode); if(tg)tg.style.display='none'; }
    renderThread(mode);
    if(out)out.insertAdjacentHTML('beforeend','<div style="margin-top:8px;display:flex;gap:9px;align-items:flex-start">'+nannyFace(28)+'<div style="flex:1"><div class="na-skel" style="width:40%;margin-bottom:8px"></div><div class="na-skel" style="width:90%;margin-bottom:6px"></div><div class="na-skel" style="width:70%"></div></div></div>');
    fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();})
      .then(function(j){
        if(!j||!j.ok||!j.resposta){ threads[mode].push({de:'nanny',r:{nivel:'observar',o_que_fazer_agora:'Não consegui responder agora. Tenta de novo em instantes.'}}); renderThread(mode); return; }
        var r=j.resposta; threads[mode].push({de:'nanny',r:r});
        if(dog){
          var repeat=(dog.perguntas&&dog.perguntas.length>=1); dog.perguntas=dog.perguntas||[];
          dog.perguntas.push({id:Date.now()+'-'+Math.random().toString(36).slice(2,7),data:new Date().toISOString().slice(0,10),texto:texto||'(foto)',nivel:r.nivel,resposta:r.o_que_fazer_agora,por_que:r.por_que||'',pro_vet:r.pro_vet||''});
          if(Array.isArray(r.novos_eventos)){dog.eventos=dog.eventos||[];r.novos_eventos.forEach(function(e){if(e&&e.tipo)dog.eventos.push({tipo:e.tipo,origem:'observacao_nanny',data:new Date().toISOString().slice(0,10),confianca:e.confianca||'media',payload:e.payload||{}});});}
          if(g('saveDogs'))window.saveDogs(); if(g('nannySync'))window.nannySync(true);
          if(g('renderDocs')){try{window.renderDocs(dog);}catch(e){}}
          track('nanny_ask',{nivel:r.nivel,com_foto:!!img}); if(repeat)track('nanny_ask_repeat',{nivel:r.nivel});
        } else {
          try{ localStorage.setItem(PEND_KEY,JSON.stringify({data:new Date().toISOString().slice(0,10),texto:texto||'(foto)',nivel:r.nivel,resposta:r.o_que_fazer_agora,pro_vet:r.pro_vet||''})); }catch(e){}
          track('nanny_ask',{nivel:r.nivel,sem_cadastro:true});
        }
        renderThread(mode);
      })
      .catch(function(){ threads[mode].push({de:'nanny',r:{nivel:'observar',o_que_fazer_agora:'Falha de conexão. Tenta de novo.'}}); renderThread(mode); });
  }

  // adota a pergunta avulsa (feita sem cadastro) no 1º cão, sem editar o fluxo de cadastro
  function adotarAvulsa(){
    var dog=g('dogObj')?window.dogObj():null; if(!dog||(dog.perguntas&&dog.perguntas.length))return;
    var raw; try{ raw=localStorage.getItem(PEND_KEY);}catch(e){} if(!raw)return;
    try{ var p=JSON.parse(raw); dog.perguntas=[p]; if(g('saveDogs'))window.saveDogs(); if(g('nannySync'))window.nannySync(true); localStorage.removeItem(PEND_KEY); }catch(e){}
  }

  function mountInto(id,mode){ var box=document.getElementById(id); if(!box)return; box.innerHTML=cardHTML(mode); wire(mode); if(mode==='perfil'){ seedFollowup('perfil'); renderThread('perfil'); } }
  function boot(){ styleOnce(); var hasDogs=false; try{ hasDogs=(typeof dogs!=='undefined'&&dogs&&dogs.length>0); }catch(e){}
    if(document.getElementById('nanny-ask')){ adotarAvulsa(); mountInto('nanny-ask','perfil'); }
    if(document.getElementById('nanny-ask-home')&&!hasDogs) mountInto('nanny-ask-home','home'); }
  window.nannyAskMount=boot;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
})();
