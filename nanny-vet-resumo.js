/* nanny-vet-resumo.js — RESUMO CLÍNICO PRO VETERINÁRIO (a ponte pro vet) — v1
 * <script src="nanny-vet-resumo.js"></script> no meu-cao.html
 * Expõe window.nannyVetResumo(dog?) — abre uma janela de impressão (o tutor salva como PDF
 * ou mostra na tela do consultório). O vet só LÊ; nunca atua na plataforma (fora do escopo
 * regulatório). O schema de origem já aceita 'vet' como autor no futuro, sem refactor.
 *
 * REGRA DE TOM: linguagem CLÍNICA e seca. SEM voz da Nanny, SEM emoji, SEM diagnóstico.
 * Cada dado traz PROCEDÊNCIA (lido de documento vs. informado pelo tutor) — é o que dá
 * credibilidade e faz o vet respeitar (e recomendar) o documento.
 *
 * Globais do hub: dogObj, getBreed, ageLabel, ageInMonths.
 */
(function () {
  function g(fn){ return (typeof window[fn]==='function')?window[fn]:null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  function br(d){ if(!d)return''; var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m?(m[3]+'/'+m[2]+'/'+m[1]):esc(d); }
  function byDateDesc(a,b){ return String(b.data||'').localeCompare(String(a.data||'')); }
  function rows(arr,cols){ return arr.map(function(it){return '<tr>'+cols.map(function(c){return '<td>'+esc(c(it)||'—')+'</td>';}).join('')+'</tr>';}).join(''); }

  function build(dog){
    var b=g('getBreed')?window.getBreed(dog):{};
    var raca=(b&&b.name)||dog.customBreed||dog.raca||'Não informada';
    var idade=(g('ageLabel')&&g('ageInMonths'))?window.ageLabel(window.ageInMonths(dog)):'';
    var sexo=dog.sexo==='femea'?'Fêmea':(dog.sexo==='macho'?'Macho':'Não informado');
    var h=dog.health||{}, ped=dog.pedigree||{};
    var vac=(h.vacinas||[]).slice().sort(byDateDesc);
    var obs=(dog.perguntas||[]).filter(function(p){return p&&p.pro_vet&&!p.no_vet;}).slice().sort(function(a,b){return String(b.data||'').localeCompare(String(a.data||''));});
    var anti=(h.antiparasitario||[]).slice().sort(byDateDesc);
    var verm=(h.vermifugo||[]).slice().sort(byDateDesc);
    var ex=(h.exames||[]).slice().sort(byDateDesc);
    var prox=(h.proximas_datas||[]).slice().sort(function(a,b){return String(a.data).localeCompare(String(b.data));});
    var cond=(h.condicoes||[]);
    var hoje=new Date().toLocaleDateString('pt-BR');
    var pesoTxt='—';
    if((dog.weights||[]).length){ var w=dog.weights[dog.weights.length-1]; pesoTxt=w.kg+' kg'+(w.d?(' ('+br(w.d)+')'):''); }
    else if(dog.pesoFaixa!=null){ pesoTxt='faixa '+esc(dog.pesoFaixa)+' (informada)'; }

    function sec(title,inner){ return inner?'<h2>'+title+'</h2>'+inner:''; }
    function tbl(head,body){ return '<table><thead><tr>'+head.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+body+'</tbody></table>'; }

    var idRows=''
      +'<tr><td class="k">Nome</td><td>'+esc(dog.nome||'—')+'</td><td class="k">Espécie</td><td>Canina</td></tr>'
      +'<tr><td class="k">Raça</td><td>'+esc(raca)+'</td><td class="k">Sexo</td><td>'+sexo+'</td></tr>'
      +'<tr><td class="k">Idade</td><td>'+(esc(idade)||'—')+'</td><td class="k">Peso</td><td>'+pesoTxt+'</td></tr>'
      +'<tr><td class="k">Microchip</td><td>'+(esc(dog.microchip||h.microchip||'')||'—')+'</td><td class="k">Nascimento</td><td>'+(br(dog.nascimento||ped.nascimento)||'—')+'</td></tr>';

    var body=''
      + '<div class="head"><div><div class="doc-title">Resumo clínico</div><div class="doc-sub">'+esc(dog.nome||'Cão')+' · '+esc(raca)+'</div></div><div class="doc-date">Gerado em '+hoje+'</div></div>'
      + '<table class="id">'+idRows+'</table>'
      + sec('Histórico vacinal', vac.length?tbl(['Vacina','Classe','Aplicação'],rows(vac,[function(v){return v.nome;},function(v){return v.classe;},function(v){return br(v.data);}])):'')
      + sec('Antiparasitário', anti.length?tbl(['Produto','Aplicação'],rows(anti,[function(v){return v.produto;},function(v){return br(v.data);}])):'')
      + sec('Vermífugo', verm.length?tbl(['Produto','Aplicação'],rows(verm,[function(v){return v.produto;},function(v){return br(v.data);}])):'')
      + sec('Próximas datas registradas', prox.length?tbl(['Item','Previsão'],rows(prox,[function(v){return v.o_que;},function(v){return br(v.data);}])):'')
      + sec('Exames e laudos', ex.length?tbl(['Tipo','Achado (transcrito)','Data'],rows(ex,[function(v){return v.tipo;},function(v){return v.achado;},function(v){return br(v.data);}])):'')
      + sec('Condições registradas', cond.length?'<ul>'+cond.map(function(c){return '<li>'+esc(typeof c==='string'?c:(c.nome||JSON.stringify(c)))+'</li>';}).join('')+'</ul>':'')
      + sec('Observações relatadas (triagem Nanny)', obs.length?tbl(['Data','Observação'],rows(obs,[function(o){return br(o.data);},function(o){return o.pro_vet;}])):'')
      + sec('Evolução de peso', (function(){
          var ws=(dog.weights||[]).slice().sort(function(a,b){return String(a.d).localeCompare(String(b.d));});
          if(!ws.length) return '';
          var prev=null, body='';
          ws.forEach(function(w){ var dl=(prev!=null)?(w.kg-prev):null; body+='<tr><td>'+br(w.d)+'</td><td>'+String(w.kg).replace('.',',')+' kg</td><td>'+(dl==null?'—':((dl>0?'+':'')+dl.toFixed(1).replace('.',',')+' kg'))+'</td></tr>'; prev=w.kg; });
          var t=tbl(['Data','Peso','Variação'], body);
          if(ws.length>=2){ var f=ws[0], l=ws[ws.length-1], tot=l.kg-f.kg; t+='<p style="font-size:12px;color:#444;margin:6px 0 0">Tendência: '+String(f.kg).replace('.',',')+' kg ('+br(f.d)+') → '+String(l.kg).replace('.',',')+' kg ('+br(l.d)+'), variação de '+(tot>0?'+':'')+tot.toFixed(1).replace('.',',')+' kg no período.</p>'; }
          return t;
        })())
      + sec('Situação de vacinas e cuidados (calculado — confirmar)', (function(){
          var ups=[]; try{ if(typeof window!=='undefined'&&typeof window.upcomingReminders==='function') ups=window.upcomingReminders(dog)||[]; }catch(e){}
          if(!ups.length) return '';
          function ws(w){ try{ return (w instanceof Date)?w.toLocaleDateString('pt-BR'):br(w); }catch(e){ return ''; } }
          function st(u){ return u.status==='overdue'?('Atrasado desde '+ws(u.when)):(u.status==='stale'?('Última faz tempo — '+ws(u.when)):('Em dia · próximo em '+ws(u.when))); }
          return tbl(['Item','Situação'], rows(ups,[function(u){return u.t;},function(u){return st(u);}]));
        })())
      + '<div class="prov"><strong>Procedência dos dados:</strong> vacinas, antiparasitário, vermífugo e exames foram lidos de documentos enviados pelo tutor. Peso, condições e observações foram informados pelo tutor. A situação de cuidados é calculada pelo app a partir das datas registradas — confirme. Este documento não constitui laudo nem diagnóstico.</div>'
      + '<div class="foot">Documento gerado pelo tutor via PetNanny · dados a confirmar com o responsável</div>';

    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo clínico — '+esc(dog.nome||'Cão')+'</title>'
      + '<style>'
      + '*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:32px 34px;font-size:13px;line-height:1.5}'
      + '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a1a;padding-bottom:10px;margin-bottom:14px}'
      + '.doc-title{font-size:20px;font-weight:700}.doc-sub{font-size:13px;color:#444;margin-top:2px}.doc-date{font-size:12px;color:#555}'
      + 'h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#1a1a1a;border-bottom:1px solid #bbb;padding-bottom:3px;margin:18px 0 8px}'
      + 'table{width:100%;border-collapse:collapse;margin:0}td,th{text-align:left;padding:5px 8px;vertical-align:top}'
      + 'thead th{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#555;border-bottom:1px solid #999}'
      + 'tbody tr:nth-child(even){background:#f6f6f4}table.id td{border-bottom:1px solid #eee}table.id .k{color:#555;width:15%;font-weight:600}'
      + 'ul{margin:4px 0;padding-left:18px}li{margin:3px 0}.dt{color:#555;font-variant-numeric:tabular-nums}'
      + '.prov{font-size:11px;color:#555;background:#f6f6f4;border:1px solid #e2e2de;border-radius:6px;padding:9px 11px;margin-top:20px;line-height:1.45}'
      + '.foot{font-size:10.5px;color:#888;text-align:center;margin-top:16px;border-top:1px solid #ddd;padding-top:8px}'
      + '@media print{body{padding:0}}'
      + '</style></head><body>'+body+'</body></html>';
  }

  window.nannyVetResumo=function(dog){
    dog=dog||(g('dogObj')?window.dogObj():null);
    if(!dog){ alert('Selecione um cão primeiro.'); return; }
    try{ if(window.gtag) window.gtag('event','vet_resumo_gerado',{}); }catch(e){}
    var w=window.open('','_blank');
    if(!w){ alert('Permita pop-ups para gerar o resumo.'); return; }
    w.document.open(); w.document.write(build(dog)); w.document.close();
    w.focus(); setTimeout(function(){ try{ w.print(); }catch(e){} }, 350);
  };
})();
