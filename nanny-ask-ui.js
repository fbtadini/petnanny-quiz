/* nanny-ask-ui.js — A PORTA ÚNICA "Pergunta pra Nanny" (cliente) — v1 / Mágico de Oz
 * <script src="nanny-ask-ui.js"></script> no meu-cao.html (depois do nanny-identity.js)
 * Monta sozinho em <div id="nanny-ask"></div>. Zero código pra colar no meio do HTML.
 *
 * Usa globais que já existem no hub: dogObj, getBreed, ageLabel, ageInMonths, rangeOf,
 * saveDogs, downscaleImage, nannySync, BREED_CARE, gtag.
 * Fala com /api/nanny-ask (Haiku 4.5, teletriagem dentro da Res. CFMV 1.465/2022).
 *
 * "Append burro": cada resposta vira uma pergunta datada em dog.perguntas e os fatos em
 * dog.eventos; salva e sobe pra nuvem. Sem motor de memória — só acúmulo.
 */
(function () {
  var ENDPOINT = '/api/nanny-ask';

  var NIVEL = {
    leve:        { cor: '#7a9970', bg: '#eef3ea', label: 'Tranquilo',       ic: '🟢' },
    observar:    { cor: '#b7902a', bg: '#f6efdb', label: 'Vale observar',   ic: '🟡' },
    procurar_vet:{ cor: '#d98a3d', bg: '#f7ece0', label: 'Procure um vet',  ic: '🟠' },
    urgente:     { cor: '#c0392b', bg: '#f7e4e1', label: 'Urgente',         ic: '🔴' }
  };

  function g(fn) { return (typeof window[fn] === 'function') ? window[fn] : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function track(ev, params) { try { if (window.gtag) window.gtag('event', ev, params || {}); } catch (e) {} }

  // contexto raso do cão, do que já existe no hub
  function contextoCao() {
    var dog = g('dogObj') ? window.dogObj() : null;
    if (!dog) return null;
    var b = g('getBreed') ? window.getBreed(dog) : {};
    var c = (typeof BREED_CARE !== 'undefined' && dog.breedKey && BREED_CARE[dog.breedKey]) || {};
    var carac = [];
    if (c.brachy) carac.push('braquicefálico (focinho achatado)');
    if (c.bloat) carac.push('peito fundo (risco de torção)');
    if (c.longBack) carac.push('coluna alongada');
    if (c.patella) carac.push('joelho propenso a luxação de patela');
    var idade = (g('ageLabel') && g('ageInMonths')) ? window.ageLabel(window.ageInMonths(dog)) : '';
    var porte = (g('rangeOf') && (window.rangeOf(dog) || {}).band) || '';
    return {
      _dog: dog,
      nome: dog.nome || '',
      raca: (b && b.name) || dog.raca || '',
      idade: idade,
      porte: porte,
      caracteristicas_saude: carac,
      condicoes_conhecidas: dog.condicoes || [],
      ultimas_perguntas: (dog.perguntas || []).slice(-3).map(function (p) { return { data: p.data, texto: p.texto, nivel: p.nivel }; })
    };
  }

  function fileToImg(file) {
    // usa o downscale do hub se existir; devolve { data(base64), media_type }
    if (!file) return Promise.resolve(null);
    var ds = g('downscaleImage');
    if (ds) {
      return window.downscaleImage(file, 1400, 0.82).then(function (durl) {
        if (!durl) return null;
        return { data: durl.split(',')[1], media_type: 'image/jpeg' };
      });
    }
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res({ data: String(r.result).split(',')[1], media_type: file.type || 'image/jpeg' }); };
      r.onerror = function () { res(null); };
      r.readAsDataURL(file);
    });
  }

  var pendingImg = null;

  function mount() {
    var box = document.getElementById('nanny-ask');
    if (!box) return;
    box.innerHTML =
      '<div style="background:#fff;border:1px solid #e8ddd2;border-radius:16px;padding:16px;margin:2px 0 14px;box-shadow:0 1px 4px rgba(0,0,0,.03)">'
      + '<div style="font-weight:700;font-size:16px;color:#3d2c1e;margin-bottom:2px">Pergunta pra Nanny</div>'
      + '<div style="font-size:12.5px;color:#7a6a58;margin-bottom:10px">Uma dúvida sobre seu cão? Descreva ou mande uma foto. Não é consulta veterinária — é uma orientação pra te ajudar a decidir.</div>'
      + '<textarea id="na-text" rows="2" placeholder="Ex.: tá com o olho vermelho e lacrimejando desde ontem…" style="width:100%;box-sizing:border-box;border:1.5px solid #e8ddd2;border-radius:12px;padding:11px 13px;font-size:14px;font-family:inherit;resize:vertical"></textarea>'
      + '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">'
      + '<button id="na-photo-btn" type="button" style="background:#f7f2ea;border:1px solid #e8ddd2;border-radius:10px;padding:9px 13px;font-size:13px;cursor:pointer">📷 Foto</button>'
      + '<span id="na-photo-tag" style="font-size:12px;color:#7a9970;display:none"><span>foto anexada</span> · <a href="#" id="na-photo-clear" style="color:#c0392b">remover</a></span>'
      + '<input id="na-photo" type="file" accept="image/*" style="display:none">'
      + '<button id="na-send" type="button" style="margin-left:auto;background:#7a9970;color:#fff;border:0;border-radius:10px;padding:10px 20px;font-weight:600;font-size:14px;cursor:pointer">Perguntar</button>'
      + '</div>'
      + '<div id="na-out" style="margin-top:12px"></div>'
      + '</div>';

    document.getElementById('na-photo-btn').onclick = function () { document.getElementById('na-photo').click(); };
    document.getElementById('na-photo').onchange = function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var tag = document.getElementById('na-photo-tag');
      tag.style.display = 'inline'; tag.firstChild.textContent = 'anexando…';
      fileToImg(f).then(function (img) { pendingImg = img; tag.firstChild.textContent = img ? 'foto anexada ' : 'não deu pra ler a foto '; });
    };
    document.getElementById('na-photo-clear').onclick = function (e) { e.preventDefault(); pendingImg = null; document.getElementById('na-photo').value = ''; document.getElementById('na-photo-tag').style.display = 'none'; };
    document.getElementById('na-send').onclick = enviar;
  }

  function enviar() {
    var out = document.getElementById('na-out');
    var texto = (document.getElementById('na-text').value || '').trim();
    if (!texto && !pendingImg) { out.innerHTML = '<div style="font-size:13px;color:#c0392b">Escreve a dúvida ou anexa uma foto 🙂</div>'; return; }

    var ctx = contextoCao();
    if (!ctx) { out.innerHTML = '<div style="font-size:13px;color:#c0392b">Cadastre/selecione um cão primeiro.</div>'; return; }
    var dog = ctx._dog; delete ctx._dog;

    var btn = document.getElementById('na-send');
    btn.disabled = true; btn.textContent = 'Nanny está lendo…';
    out.innerHTML = '<div style="font-size:13px;color:#7a6a58">✨ Nanny está analisando…</div>';

    var body = { contexto_cao: ctx, texto: texto };
    if (pendingImg) body.imagens = [pendingImg];

    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false; btn.textContent = 'Perguntar';
        if (!j || !j.ok || !j.resposta) { out.innerHTML = '<div style="font-size:13px;color:#c0392b">A Nanny não conseguiu responder agora. Tenta de novo em instantes.</div>'; return; }
        var r = j.resposta;

        // ——— append burro: guarda a pergunta e os fatos, salva, sobe pra nuvem ———
        var repeat = (dog.perguntas && dog.perguntas.length >= 1);
        dog.perguntas = dog.perguntas || [];
        dog.perguntas.push({ data: new Date().toISOString().slice(0, 10), texto: texto || '(foto)', nivel: r.nivel, resposta: r.o_que_fazer_agora });
        if (Array.isArray(r.novos_eventos)) {
          dog.eventos = dog.eventos || [];
          r.novos_eventos.forEach(function (e) { if (e && e.tipo) dog.eventos.push({ tipo: e.tipo, origem: 'observacao_nanny', data: new Date().toISOString().slice(0, 10), confianca: e.confianca || 'media', payload: e.payload || {} }); });
        }
        if (g('saveDogs')) window.saveDogs();
        if (g('nannySync')) window.nannySync(true);

        track('nanny_ask', { nivel: r.nivel, com_foto: !!body.imagens });
        if (repeat) track('nanny_ask_repeat', { nivel: r.nivel });

        render(r, out);
        pendingImg = null; document.getElementById('na-photo').value = ''; document.getElementById('na-photo-tag').style.display = 'none';
        document.getElementById('na-text').value = '';
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = 'Perguntar';
        out.innerHTML = '<div style="font-size:13px;color:#c0392b">Falha de conexão. Suas anotações não se perderam. Tenta de novo.</div>';
      });
  }

  function render(r, out) {
    var n = NIVEL[r.nivel] || NIVEL.observar;
    var html = '<div style="border:1px solid ' + n.cor + '33;background:' + n.bg + ';border-radius:14px;padding:14px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:15px">' + n.ic + '</span>'
      + '<span style="font-weight:700;color:' + n.cor + '">' + n.label + '</span></div>';
    if (r.o_que_fazer_agora) html += '<div style="font-size:14px;color:#3d2c1e;line-height:1.5;margin-bottom:8px">' + esc(r.o_que_fazer_agora) + '</div>';
    if (r.por_que) html += '<div style="font-size:12.5px;color:#7a6a58;line-height:1.5;margin-bottom:8px">' + esc(r.por_que) + '</div>';

    // urgente / procurar_vet: botão de achar vet perto
    if (r.nivel === 'urgente' || r.nivel === 'procurar_vet') {
      var termo = r.nivel === 'urgente' ? 'pronto atendimento veterinário 24h perto de mim' : 'veterinário perto de mim';
      html += '<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(termo) + '" target="_blank" rel="noopener" '
        + 'style="display:inline-block;background:' + n.cor + ';color:#fff;text-decoration:none;border-radius:10px;padding:9px 16px;font-weight:600;font-size:13px;margin-top:2px">📍 Achar um vet perto</a>';
    }
    // documento: manda pra aba Documentos
    if (r.vira_documento) {
      html += '<div style="margin-top:8px"><button type="button" onclick="(window.setTab&&setTab(\'docs\'))" style="background:#7a9970;color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:600;font-size:13px;cursor:pointer">📄 Guardar no dossiê →</button></div>';
    }
    // resumo pro vet, dobrável
    if (r.pro_vet) {
      html += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;color:' + n.cor + ';font-weight:600">📋 Resumo pra mostrar ao veterinário</summary>'
        + '<div style="font-size:12.5px;color:#3d2c1e;line-height:1.5;background:#fff;border:1px solid #e8ddd2;border-radius:10px;padding:10px;margin-top:6px">' + esc(r.pro_vet) + '</div></details>';
    }
    html += '<div style="font-size:11px;color:#9a8b78;margin-top:10px;line-height:1.4">A Nanny não é veterinária e isto não é uma consulta. Orientação geral — a decisão de saúde é sempre do seu veterinário.</div>';
    html += '</div>';
    out.innerHTML = html;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
