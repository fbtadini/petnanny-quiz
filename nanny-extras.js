/* nanny-extras.js — camada "pet tech" do hub Meu Cão — v1
 * <script src="nanny-extras.js"></script> DEPOIS de nanny-hoje/nanny-score no meu-cao.html.
 *
 * Tudo aqui é ADITIVO: embrulha o renderHoje e apensa cards no fim da aba Hoje.
 * Se qualquer coisa falhar, o hub original segue intacto (try/catch em volta de tudo).
 *
 * O que mora aqui:
 *  1. Clima do passeio (Open-Meteo, sem chave) cruzado com tolerância a calor/frio da raça
 *  2. Reposição preditiva do antiparasitário (produto capturado no registro) + alta temporada BR
 *  3. Memória "há X anos" (chegada / primeira vacina)
 *  4. Padrão do diário: menções de coceira/pele × janelas com proteção vencida
 *  5. window.nannyICS()        — exporta próximas datas em .ics (calendário)
 *  6. window.nannyShareCard()  — card compartilhável (canvas → navigator.share / download)
 *  7. window.nannyRegistroCard(key) — card rico pós-registro (chip do produto + barra da janela)
 *  8. Count-up do número do Score (#pn-scnum)
 *
 * Globais do hub que ele usa (com fallback silencioso): dogObj, getBreed,
 * upcomingReminders, antiInterval, nannyScore, saveDogs.
 */
(function () {
  'use strict';

  function g(fn){ return (typeof window[fn]==='function') ? window[fn] : null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function parseD(s){ if(!s) return null; if(s instanceof Date) return s; var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? new Date(+m[1],+m[2]-1,+m[3]) : null; }
  function brDate(d){ if(!d) return ''; return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear(); }
  function daysBetween(a,b){ return Math.round((b-a)/864e5); }
  var HIGH_SEASON = [9,10,11,12,1,2,3]; // set–mar: pico de pulga/carrapato no BR

  /* ================= hook no renderHoje ================= */
  function hook(){
    var o = window.renderHoje;
    if(!o || o.__pn) return;
    var w = function(dog){ o(dog); try{ extrasHoje(dog); }catch(e){} };
    w.__pn = 1; window.renderHoje = w;
  }
  hook();
  document.addEventListener('DOMContentLoaded', function(){
    hook();
    // corrida: se a Hoje renderizou antes do wrap, roda uma vez por fora
    setTimeout(function(){
      try{
        var d = g('dogObj') && window.dogObj();
        var el = document.getElementById('tab-hoje');
        if(d && el && el.children.length && !document.getElementById('pn-extras')) extrasHoje(d);
      }catch(e){}
    }, 350);
  });

  function extrasHoje(dog){
    var el = document.getElementById('tab-hoje'); if(!el || !dog) return;
    ['pn-extras','pn-extras-b'].forEach(function(id){ var o=document.getElementById(id); if(o) o.remove(); });
    var top = document.createElement('div'); top.id='pn-extras';
    top.innerHTML = climaShell();
    if(el.firstElementChild) el.insertBefore(top, el.firstElementChild.nextSibling); else el.appendChild(top);
    var box = document.createElement('div'); box.id='pn-extras-b';
    box.innerHTML = reposicaoHTML(dog) + memoriaHTML(dog) + padraoHTML(dog);
    el.appendChild(box);
    climaFill(dog);
    countUp();
  }

  /* ================= count-up do score ================= */
  function countUp(){
    try{
      var n = document.getElementById('pn-scnum'); if(!n) return;
      var t = parseInt(n.textContent,10); if(!isFinite(t)) return;
      if(n.__pn === t) return; n.__pn = t;
      var from = Math.max(0, t-22), t0 = null;
      function step(ts){ if(!t0) t0=ts; var p=Math.min(1,(ts-t0)/550); p=1-Math.pow(1-p,3);
        n.textContent = Math.round(from + (t-from)*p); if(p<1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }catch(e){}
  }

  /* ================= 1) clima × raça ================= */
  function geoState(){ try{ return localStorage.getItem('pn_geo'); }catch(e){ return null; } }

  function climaShell(){
    var st = geoState();
    if(st === 'denied') return '';
    if(st){ return '<div class="card" id="pn-clima" style="padding:14px 16px"><div style="font-size:12.5px;color:var(--ct-mut)">☁️ carregando o clima do passeio…</div></div>'; }
    return '<div class="card" id="pn-clima" style="padding:14px 16px">'
      + '<div style="display:flex;align-items:center;gap:10px;justify-content:space-between">'
      + '<div><div style="font-size:13px;font-weight:600;color:var(--ct-pri)">🌤️ Clima do passeio</div>'
      + '<div style="font-size:11.5px;color:var(--ct-mut);margin-top:2px">a Nanny cruza o tempo de hoje com a pelagem e o focinho da ra\u00e7a</div><div style="font-size:10.5px;color:var(--ct-mut);margin-top:4px;line-height:1.45">A localiza\u00e7\u00e3o \u00e9 aproximada (~1 km), fica s\u00f3 no seu aparelho e \u00e9 usada apenas pra buscar a previs\u00e3o (Open-Meteo). N\u00e3o enviamos nem guardamos nos nossos servidores.</div></div>'
      + '<button onclick="nannyClimaOn()" style="border:none;background:var(--accent);color:#fff;border-radius:20px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">permitir</button>'
      + '</div></div>';
  }

  window.nannyClimaOff = function(){
    try{ localStorage.setItem('pn_geo','denied'); localStorage.removeItem('pn_clima_c'); }catch(e){}
    var c=document.getElementById('pn-clima'); if(c) c.remove();
  };
  window.nannyClimaOn = function(){
    if(!navigator.geolocation){ alert('Seu navegador não permite localização.'); return; }
    navigator.geolocation.getCurrentPosition(function(pos){
      try{ localStorage.setItem('pn_geo', pos.coords.latitude.toFixed(2)+','+pos.coords.longitude.toFixed(2)); }catch(e){}
      var c=document.getElementById('pn-clima'); if(c) c.innerHTML='<div style="font-size:12.5px;color:var(--ct-mut)">☁️ carregando o clima do passeio…</div>';
      var d = g('dogObj') && window.dogObj(); if(d) climaFill(d);
      if(window.gtag) try{ gtag('event','clima_on'); }catch(e){}
    }, function(){
      try{ localStorage.setItem('pn_geo','denied'); }catch(e){}
      var c=document.getElementById('pn-clima'); if(c) c.remove();
    }, {timeout:8000, maximumAge:6e5});
  };

  function heatProfile(dog){
    var b = g('getBreed') ? window.getBreed(dog) : null;
    var flags=[], sens=0, cold=false;
    if(b){
      if(b.htl!=null && b.htl<=2){ sens=2; flags.push('raça sensível ao calor'); }
      else if(b.htl===3){ sens=1; }
      if(b.ctl!=null && b.ctl>=4){ sens=Math.max(sens,1); flags.push('pelagem de frio (subpelo)'); }
      if(b.ctl!=null && b.ctl<=2) cold=true;
      if(/braquicef|focinho (curto|achatado)/i.test((b.aviso||'')+' '+(b.desc||''))){ sens=2; if(flags.indexOf('focinho curto (braquicefálico)')<0) flags.push('focinho curto (braquicefálico)'); }
    }
    return { sens:sens, flags:flags, cold:cold };
  }

  function climaFill(dog){
    var el = document.getElementById('pn-clima'); if(!el) return;
    var geo = geoState(); if(!geo || geo==='denied') return;
    var cache=null; try{ cache=JSON.parse(localStorage.getItem('pn_clima_c')||'null'); }catch(e){}
    if(cache && cache.v && (Date.now()-cache.ts) < 3*36e5){ renderClima(el,dog,cache.v); return; }
    var ll = geo.split(',');
    fetch('https://api.open-meteo.com/v1/forecast?latitude='+ll[0]+'&longitude='+ll[1]
      + '&current=temperature_2m,apparent_temperature&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=1')
      .then(function(r){ return r.json(); })
      .then(function(j){
        var v = { now:Math.round(j.current.temperature_2m), feel:Math.round(j.current.apparent_temperature),
                  max:Math.round(j.daily.temperature_2m_max[0]), rain:(j.daily.precipitation_probability_max||[0])[0]||0 };
        try{ localStorage.setItem('pn_clima_c', JSON.stringify({ts:Date.now(), v:v})); }catch(e){}
        renderClima(el,dog,v);
      })
      .catch(function(){ el.innerHTML='<div style="font-size:12px;color:var(--ct-mut)">☁️ não consegui buscar o clima agora — tento de novo na próxima visita.</div>'; });
  }

  function renderClima(el,dog,v){
    var hp = heatProfile(dog);
    var rec, tone='var(--ct-green)';
    if(v.max>=32 || (v.max>=29 && hp.sens===2)){ rec='passeio só antes das 9h ou depois das 18h — e teste o asfalto com a mão (regra dos 7 segundos)'; tone='var(--ct-red)'; }
    else if(v.max>=28 || (v.max>=26 && hp.sens>=1)){ rec='evite o sol das 11h às 16h e leve água'; tone='var(--ct-amber)'; }
    else if(v.max<=13 && hp.cold){ rec='friozinho pra raça — uma roupinha no passeio ajuda'; tone='var(--ct-amber)'; }
    else { rec='dia bom pra passear a qualquer hora'; }
    if(v.rain>=60) rec += ' · ☔ '+v.rain+'% de chance de chuva';
    el.innerHTML = '<div style="display:flex;gap:14px;align-items:center">'
      + '<div style="font-size:27px;font-weight:800;font-family:\'Playfair Display\',Georgia,serif;color:var(--ct-pri);line-height:1">'+v.now+'°</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:12.5px;font-weight:600;color:var(--ct-pri)">🌤️ Passeio de hoje · máx '+v.max+'°'+(v.feel!==v.now?' · sensação '+v.feel+'°':'')+'</div>'
      + '<div style="font-size:12px;color:'+tone+';margin-top:2px;line-height:1.45">'+esc(rec)+'</div>'
      + (hp.flags.length ? '<div style="font-size:10.5px;color:var(--ct-mut);margin-top:3px">considerando: '+esc(hp.flags.join(' \u00b7 '))+'</div>' : '')
      + '<div style="margin-top:3px"><a onclick="nannyClimaOff()" style="font-size:10px;color:var(--ct-mut);text-decoration:underline;cursor:pointer;opacity:.8">desligar clima</a></div>'
      + '</div></div>';
  }

  /* ================= 2) reposição preditiva + alta temporada ================= */
  function nextAnti(dog){
    var up = g('upcomingReminders') ? window.upcomingReminders(dog) : [];
    var anti=null;
    up.forEach(function(r){ if(!anti && /antiparasit|antipulga|carrapato/i.test(r.t||'')) anti=r; });
    return anti;
  }

  function reposicaoHTML(dog){
    try{
      var anti = nextAnti(dog); if(!anti || !anti.when) return '';
      var today=new Date(); today.setHours(0,0,0,0);
      var d = daysBetween(today, anti.when);
      var season = HIGH_SEASON.indexOf(today.getMonth()+1) >= 0;
      var urg = (anti.status && anti.status!=='upcoming');
      if(!urg && d>14){
        if(season && d<=30){
          return '<div class="card" style="padding:12px 16px;border-left:3px solid var(--ct-amber)">'
            + '<div style="font-size:12.5px;color:var(--ct-sec);line-height:1.5">🕷️ <b>Alta temporada de pulga e carrapato</b> (primavera–verão) — a proteção vence em '+d+' dias. É a pior época do ano pra deixar passar.</div></div>';
        }
        return '';
      }
      var prod = (dog.done && dog.done.antiProduto) || '';
      var titulo = urg ? 'proteção vencida' : ('vence em '+d+' dia'+(d===1?'':'s'));
      var link = 'https://www.petz.com.br/busca?q='+encodeURIComponent(prod || 'antipulgas e carrapatos');
      return '<div class="card" style="padding:14px 16px;border-left:3px solid '+(urg?'var(--ct-red)':'var(--ct-amber)')+'">'
        + '<div style="font-size:13px;font-weight:600;color:var(--ct-pri)">🛒 Reposição · antiparasitário'
        + (prod ? ' <span style="background:var(--ct-cream);border-radius:12px;padding:1px 8px;font-size:11px;font-weight:600;color:var(--ct-sec)">'+esc(prod)+'</span>' : '')
        + '</div>'
        + '<div style="font-size:12.5px;color:var(--ct-sec);margin-top:4px;line-height:1.5">'
        + titulo + (urg ? ' — quanto antes repuser, antes a proteção volta.' : ' — pedir agora chega a tempo.')
        + (season ? ' <b>Estamos na alta temporada de pulga e carrapato no Brasil.</b>' : '')
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
        + '<a href="'+link+'" target="_blank" rel="noopener" onclick="window.gtag&&gtag(\'event\',\'reposicao_petz\')" style="text-decoration:none;background:var(--accent);color:#fff;border-radius:20px;padding:7px 14px;font-size:12px;font-weight:600">ver na Petz →</a>'
        + '<button onclick="nannyICS()" style="background:none;border:1.5px solid var(--ct-line);border-radius:20px;padding:7px 13px;font-size:12px;font-weight:600;color:var(--ct-sec);cursor:pointer;font-family:inherit">📅 pôr datas no calendário</button>'
        + '</div></div>';
    }catch(e){ return ''; }
  }

  /* ================= 3) memória "há X anos" ================= */
  function memoriaHTML(dog){
    try{
      var today=new Date(); today.setHours(0,0,0,0);
      var evs=[];
      if(dog.chegada) evs.push({ d:dog.chegada, txt:'chegava em casa' });
      var vac=(dog.health && dog.health.vacinas)||[];
      if(vac.length){
        var first=vac.slice().sort(function(a,b){ return String(a.data||'').localeCompare(String(b.data||'')); })[0];
        if(first && first.data) evs.push({ d:first.data, txt:'tomava a '+(first.nome?('vacina '+first.nome):'primeira vacina registrada') });
      }
      for(var i=0;i<evs.length;i++){
        var d0=parseD(evs[i].d); if(!d0) continue;
        var anos=today.getFullYear()-d0.getFullYear(); if(anos<1) continue;
        var ann=new Date(d0); ann.setFullYear(d0.getFullYear()+anos);
        var diff=daysBetween(ann,today);
        if(diff>=0 && diff<=3){
          return '<div class="card" style="padding:14px 16px;background:linear-gradient(135deg,var(--card),var(--warm))">'
            + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-deep)">💛 há '+anos+' ano'+(anos>1?'s':'')+'</div>'
            + '<div style="font-size:13.5px;color:var(--ct-pri);margin-top:4px;line-height:1.5">'
            + (anos===1?'Há exatamente 1 ano':'Nesta data, há '+anos+' anos')+', '+esc(dog.nome||'seu cão')+' '+esc(evs[i].txt)+'. 🐾</div></div>';
        }
      }
      return '';
    }catch(e){ return ''; }
  }

  /* ================= 4) padrão do diário: pele × proteção vencida ================= */
  function padraoHTML(dog){
    try{
      var pg=(dog.perguntas||[]).filter(function(p){ return p && p.data && /coceira|coç|pele|dermat|alergi/i.test((p.tema||'')+' '+(p.texto||'')); });
      if(pg.length<2) return '';
      var apps=((dog.health && dog.health.antiparasitario)||[]).map(function(a){ return parseD(a.data); }).filter(Boolean).sort(function(a,b){ return a-b; });
      if(!apps.length) return '';
      var iv=null;
      if(dog.done && dog.done.antiIntervalo) iv=dog.done.antiIntervalo;
      if(!iv){ try{ var r=g('antiInterval') && window.antiInterval((dog.done&&dog.done.antiProduto)||''); if(r&&r.dias) iv=r.dias; }catch(e){} }
      iv = iv || 30;
      function covered(d){ for(var i=apps.length-1;i>=0;i--){ if(apps[i]<=d) return daysBetween(apps[i],d)<=iv; } return false; }
      var fora=0,total=0;
      pg.forEach(function(p){ var d=parseD(p.data); if(!d) return; total++; if(!covered(d)) fora++; });
      if(total<2 || fora<2 || (fora/total)<0.6) return '';
      return '<div class="card" style="padding:14px 16px;border-left:3px solid var(--ct-amber)">'
        + '<div style="font-size:13px;font-weight:600;color:var(--ct-pri)">🔍 Um padrão que a Nanny reparou</div>'
        + '<div style="font-size:12.5px;color:var(--ct-sec);margin-top:4px;line-height:1.55">Das suas '+total+' menções a coceira/pele no diário, <b>'+fora+' aconteceram em períodos com o antiparasitário vencido</b>. Pode ser coincidência — mas é o tipo de conexão que vale levar pro veterinário na próxima consulta.</div></div>';
    }catch(e){ return ''; }
  }

  /* ================= 5) export .ics ================= */
  window.nannyICS = function(){
    try{
      var dog = g('dogObj') && window.dogObj(); if(!dog) return;
      var up = g('upcomingReminders') ? window.upcomingReminders(dog) : [];
      var fut = up.filter(function(r){ return r.when && r.status==='upcoming'; })
                  .sort(function(a,b){ return a.when-b.when; }).slice(0,12);
      if(!fut.length){ alert('Ainda não há próximas datas pra exportar.'); return; }
      function icsD(d){ return d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2); }
      var nome = dog.nome || 'meu cão';
      var L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PetNanny//BR','CALSCALE:GREGORIAN'];
      fut.forEach(function(r,i){
        var d2=new Date(r.when); d2.setDate(d2.getDate()+1);
        L.push('BEGIN:VEVENT',
          'UID:pn-'+i+'-'+icsD(r.when)+'@petnanny.com.br',
          'DTSTART;VALUE=DATE:'+icsD(r.when),
          'DTEND;VALUE=DATE:'+icsD(d2),
          'SUMMARY:'+(r.tipo==='Vacina'?'💉':'🐾')+' '+nome+': '+String(r.t||'').replace(/[\r\n,;]/g,' ')+' (PetNanny)',
          'BEGIN:VALARM','TRIGGER:-P2D','ACTION:DISPLAY','DESCRIPTION:'+String(r.t||'').replace(/[\r\n,;]/g,' '),'END:VALARM',
          'END:VEVENT');
      });
      L.push('END:VCALENDAR');
      var blob=new Blob([L.join('\r\n')],{type:'text/calendar;charset=utf-8'});
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='petnanny-'+String(nome).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.ics';
      document.body.appendChild(a); a.click(); a.remove();
      if(window.gtag) try{ gtag('event','ics_export'); }catch(e){}
    }catch(e){}
  };

  /* ================= 6) share card ================= */
  window.nannyShareCard = function(){
    try{
      var dog = g('dogObj') && window.dogObj(); if(!dog) return;
      var s=null; try{ s = g('nannyScore') && window.nannyScore(dog); }catch(e){}
      var score = (s && typeof s.score==='number' && s.conf!=='baixa') ? s.score : null;
      var b = g('getBreed') ? window.getBreed(dog) : null;
      var c=document.createElement('canvas'); c.width=1080; c.height=1350;
      var x=c.getContext('2d');
      x.fillStyle='#faf7f2'; x.fillRect(0,0,1080,1350);
      x.textAlign='center';
      x.fillStyle='#e8733a'; x.font='700 42px "DM Sans",sans-serif'; x.fillText('PetNanny', 540, 122);
      x.fillStyle='#3d2c1e'; x.font='800 94px "Playfair Display",Georgia,serif'; x.fillText(dog.nome||'Meu cão', 540, 295);
      if(b && b.name){ x.fillStyle='#7a5c44'; x.font='500 40px "DM Sans",sans-serif'; x.fillText(b.name, 540, 358); }
      var cx=540, cy=705, R=212;
      x.lineWidth=36; x.strokeStyle='#efe6da'; x.beginPath(); x.arc(cx,cy,R,0,Math.PI*2); x.stroke();
      if(score!=null){
        x.strokeStyle = score>=80?'#4a7c59':(score>=60?'#e8733a':'#c0562e'); x.lineCap='round';
        x.beginPath(); x.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+Math.PI*2*score/100); x.stroke();
        x.fillStyle='#3d2c1e'; x.font='800 152px "Playfair Display",Georgia,serif'; x.fillText(String(score), 540, cy+54);
        x.fillStyle='#7a5c44'; x.font='600 38px "DM Sans",sans-serif'; x.fillText('Score de cuidado', 540, cy+R+92);
      } else {
        x.fillStyle='#7a5c44'; x.font='600 44px "DM Sans",sans-serif'; x.fillText('cuidando com a Nanny 🐶', 540, cy+16);
      }
      x.fillStyle='#a8967f'; x.font='400 32px "DM Sans",sans-serif';
      x.fillText(new Date().toLocaleDateString('pt-BR'), 540, cy+R+148);
      x.fillStyle='#3d2c1e'; x.font='600 38px "DM Sans",sans-serif'; x.fillText('🐾 petnanny.com.br', 540, 1272);
      c.toBlob(function(blob){
        if(!blob) return;
        var f=null; try{ f=new File([blob],'petnanny-score.png',{type:'image/png'}); }catch(e){}
        if(f && navigator.canShare && navigator.canShare({files:[f]})){
          navigator.share({files:[f], title:'PetNanny'}).catch(function(){});
        } else {
          var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='petnanny-score.png';
          document.body.appendChild(a); a.click(); a.remove();
        }
        if(window.gtag) try{ gtag('event','share_card'); }catch(e){}
      },'image/png');
    }catch(e){}
  };

  /* ================= 7) card rico pós-registro ================= */
  var REG_LABEL = { anti:'Antiparasitário', vermifugo:'Vermífugo', annual_multi:'Vacina múltipla (V8/V10)',
                    annual_rabies:'Antirrábica', annual:'Vacina anual' };
  window.nannyRegistroCard = function(key){
    try{
      var dog = g('dogObj') && window.dogObj(); if(!dog || !dog.done || !dog.done[key]) return;
      var date = parseD(dog.done[key]); if(!date) return;
      var label = REG_LABEL[key] || 'Cuidado';
      var prod = (key==='anti' && dog.done.antiProduto) ? dog.done.antiProduto : (dog.done[key+'_marca'] || '');
      var iv = null;
      if(key==='anti'){
        iv = dog.done.antiIntervalo || null;
        if(!iv){ try{ var r=g('antiInterval') && window.antiInterval(dog.done.antiProduto||''); if(r&&r.dias) iv=r.dias; }catch(e){} }
        iv = iv || 30;
      } else if(key==='vermifugo'){ iv = dog.done.vermIntervalo || 90; }
      else { iv = 365; }
      var next=new Date(date); next.setDate(next.getDate()+iv);
      var today=new Date(); today.setHours(0,0,0,0);
      var usado=Math.max(0, Math.min(1, daysBetween(date,today)/iv));
      var resta=Math.round((1-usado)*100);
      var old=document.getElementById('pn-regov'); if(old) old.remove();
      var ov=document.createElement('div'); ov.id='pn-regov';
      ov.style.cssText='position:fixed;inset:0;background:rgba(20,14,9,.45);z-index:60;display:flex;align-items:center;justify-content:center;padding:22px';
      ov.innerHTML = '<div class="card" style="max-width:360px;width:100%;margin:0;padding:22px;text-align:center" onclick="event.stopPropagation()">'
        + '<div style="width:52px;height:52px;border-radius:50%;background:var(--green-light);display:flex;align-items:center;justify-content:center;font-size:25px;margin:0 auto 10px">✅</div>'
        + '<div style="font-family:\'Playfair Display\',Georgia,serif;font-weight:800;font-size:19px;color:var(--ct-pri)">'+esc(label)+' registrado</div>'
        + (prod ? '<div style="margin-top:7px"><span style="background:var(--ct-cream);border-radius:14px;padding:3px 11px;font-size:12px;font-weight:600;color:var(--ct-sec)">'+esc(prod)+'</span></div>' : '')
        + '<div style="margin-top:15px;text-align:left">'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ct-mut);margin-bottom:4px"><span>'+brDate(date)+'</span><span>protegido até <b>'+brDate(next)+'</b></span></div>'
        + '<div style="height:8px;border-radius:6px;background:var(--ct-track);overflow:hidden"><div style="height:100%;width:'+resta+'%;background:linear-gradient(90deg,var(--green),var(--ct-greensoft));border-radius:6px;transition:width .6s ease"></div></div>'
        + '<div style="font-size:11px;color:var(--ct-mut);margin-top:4px">'+resta+'% da janela de '+iv+' dias pela frente</div>'
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:16px">'
        + '<button onclick="nannyICS()" style="flex:1;background:none;border:1.5px solid var(--ct-line);border-radius:12px;padding:10px;font-size:12.5px;font-weight:600;color:var(--ct-sec);cursor:pointer;font-family:inherit">📅 calendário</button>'
        + '<button onclick="document.getElementById(\'pn-regov\').remove()" style="flex:1;background:var(--accent);border:none;border-radius:12px;padding:10px;font-size:12.5px;font-weight:600;color:#fff;cursor:pointer;font-family:inherit">fechar</button>'
        + '</div></div>';
      ov.onclick=function(){ ov.remove(); };
      document.body.appendChild(ov);
      try{ navigator.vibrate && navigator.vibrate([12,40,12]); }catch(e){}
    }catch(e){}
  };
})();
