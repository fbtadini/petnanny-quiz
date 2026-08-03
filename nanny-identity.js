/* nanny-identity.js — ESPINHA DE IDENTIDADE (cliente do hub) — v5
 * <script src="nanny-identity.js"></script> no meu-cao.html
 * Depende de (já existem no hub): saveDogs(), loadDogs(), renderList(), upcomingReminders(dog)
 *
 * v4:
 *  - opt-out DURÁVEL: salvar dados não mexe no optin; só ação explícita liga/desliga.
 *  - botão "Voltar a receber lembretes" (reativar) e "pausar" no próprio app.
 *  - o app reflete o estado real do servidor (se a pessoa saiu pelo email, aparece "pausado").
 *  - "Carregando seu perfil…" enquanto restaura.
 *  - mantém as travas anti-perda da v3.
 *
 * v5 — SYNC NÃO-DESTRUTIVO:
 *  - slimDogs() só compacta se o payload realmente estourar o budget,
 *    e compacta em degraus (30 -> 15 -> 5). Antes cortava sempre em 20.
 *  - applyLoad() FUNDE local+servidor em vez de sobrescrever o localStorage.
 *  - cão que só existe neste aparelho não é mais destruído pelo load.
 *  - vacinas nunca são compactadas.
 *  - removida a linha eventos.slice(-150): d.eventos não existe no hub
 *    (código morto e mina para perda silenciosa futura).
 */
(function () {
  var SYNC_URL = '/api/nanny-sync', TUTOR_KEY = 'petnanny_tutor', LS_DOGS = 'petnanny_dogs_v1';

  function getTutor() { try { return JSON.parse(localStorage.getItem(TUTOR_KEY) || 'null'); } catch (e) { return null; } }
  function setTutor(t) { try { localStorage.setItem(TUTOR_KEY, JSON.stringify(t)); } catch (e) {} }
  function currentDogs() { try { return JSON.parse(localStorage.getItem(LS_DOGS) || '[]'); } catch (e) { return []; } }
  var SYNC_BUDGET = 45000;   // célula do Sheets estoura em ~50k chars; margem de 5k

  // Binário nunca sobe: foto e thumb ficam no aparelho (bom pra LGPD).
  // No load, o merge devolve as locais.
  function _semBinarios(d) {
    var c = {};
    for (var k in d) { if (k === 'photo') continue; c[k] = d[k]; }
    if (Array.isArray(d.files)) {
      c.files = d.files.map(function (f) {
        return { id: f.id, type: f.type, name: f.name, at: f.at };
      });
    }
    return c;
  }

  // Versão magra de UMA conversa. _c:1 marca "compactado", pra que no merge
  // ela nunca vença a versão completa que está no aparelho.
  function _compactar(p) {
    if (!p) return p;
    return {
      id: p.id, data: p.data,
      entendi: String(p.entendi || p.texto || '').slice(0, 90),
      nivel: p.nivel,
      outcome: p.outcome || '', outcome_data: p.outcome_data || '',
      pro_vet: p.pro_vet ? String(p.pro_vet).slice(0, 140) : '',
      _c: 1
    };
  }

  function _aplicarNivel(dogs, manterInteiras) {
    return dogs.map(function (d) {
      if (!Array.isArray(d.perguntas) || d.perguntas.length <= manterInteiras) return d;
      var corte = d.perguntas.length - manterInteiras;
      var c = {}; for (var k in d) c[k] = d[k];
      c.perguntas = d.perguntas.map(function (p, i) { return i >= corte ? p : _compactar(p); });
      return c;
    });
  }

  function slimDogs() {
    var base = currentDogs().map(_semBinarios);

    // Cabe inteiro? Sobe inteiro. Caso normal — antes nunca acontecia.
    if (JSON.stringify(base).length <= SYNC_BUDGET) return base;

    // Não coube: compacta em degraus, sempre as conversas MAIS ANTIGAS.
    var degraus = [30, 15, 5, 0];
    var tentativa = base;
    for (var i = 0; i < degraus.length; i++) {
      tentativa = _aplicarNivel(base, degraus[i]);
      if (JSON.stringify(tentativa).length <= SYNC_BUDGET) return tentativa;
    }
    try {
      console.warn('[petnanny] sync acima do budget mesmo compactado ('
        + JSON.stringify(tentativa).length
        + ' chars). Histórico completo permanece no aparelho.');
    } catch (e) {}
    return tentativa;
  }

  function postSync(body) { return fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  function buildProximas() {
    var out = [];
    currentDogs().forEach(function (d) {
      if (d.aguardando) {
        // cão ainda não chegou: 1 nudge de volta (~10 dias), sem datas de vacina
        var base = d.criadoEm ? new Date(d.criadoEm) : new Date();
        var when = new Date(base.getTime() + 10 * 864e5);
        out.push({ o_que: 'Já pegou seu cão? Atualize o plano de chegada com a Nanny', nome: (d.nome && d.nome !== 'Meu futuro cão') ? d.nome : '', sexo: d.sexo || '', data: when.toISOString().slice(0, 10) });
        return;
      }
      var ups = [];
      try { ups = (window.upcomingReminders ? window.upcomingReminders(d) : []) || []; } catch (e) {}
      ups.forEach(function (u) { if (u && u.when) out.push({ o_que: u.t || 'um cuidado', nome: d.nome || '', sexo: d.sexo || '', data: new Date(u.when).toISOString().slice(0, 10) }); });
    });
    return out;
  }

  // setOptin: 'sim' | 'nao' | undefined. undefined = save comum, NÃO mexe no optin.
  var _timer = null;
  function nannySync(force, setOptin) {
    var t = getTutor();
    if (!t || !t.email) return;
    if (!currentDogs().length && !setOptin) return;   // trava: save comum nunca sobe vazio
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      var body = { action: 'save', email: t.email, dogs: slimDogs(), proximas: buildProximas() };
      if (setOptin) body.set_optin = setOptin;
      body.send_welcome = (!t.token && setOptin === 'sim');  // email de boas-vindas só na 1ª ativação
      postSync(body).then(function (j) {
        if (j && j.ok) {
          t.token = j.token || t.token; if (j.optin) t.optin = j.optin; setTutor(t); renderOptIn();
          // ativação: busca o que já existe no servidor e aplica na hora (multi-aparelho sem reload)
          if (setOptin === 'sim' && t.token) {
            postSync({ action: 'load', token: t.token }).then(function (jj) { applyLoad(jj, t.token); renderOptIn(); }).catch(function () {});
          }
        }
      }).catch(function () {});
    }, force ? 0 : 1200);
  }
  window.nannySync = nannySync;

  /* ── MERGE ─────────────────────────────────────────────────────── */

  function _chave(item, campo) {
    if (item && item[campo]) return String(item[campo]);
    return 'k:' + JSON.stringify([item && item.data, item && item.at,
      String((item && (item.texto || item.entendi || item.nome || '')) || '').slice(0, 60)]);
  }

  // União local+servidor. Em conflito vence quem tem mais conteúdo,
  // e compactado (_c) NUNCA vence completo.
  function _unir(local, servidor, campoId) {
    var mapa = {}, ordem = [];
    function por(item) {
      if (!item) return;
      var id = _chave(item, campoId);
      if (!(id in mapa)) { mapa[id] = item; ordem.push(id); return; }
      var atual = mapa[id];
      if (item._c && !atual._c) return;
      if (atual._c && !item._c) { mapa[id] = item; return; }
      if (JSON.stringify(item).length > JSON.stringify(atual).length) mapa[id] = item;
    }
    (local || []).forEach(por);
    (servidor || []).forEach(por);
    var out = ordem.map(function (id) { return mapa[id]; });
    out.sort(function (a, b) {
      return String((a && (a.data || a.at)) || '').localeCompare(String((b && (b.data || b.at)) || ''));
    });
    return out;
  }

  // files: metadado vem do servidor, thumb só existe local — preserva os dois.
  function _unirFiles(local, servidor) {
    var u = _unir(local, servidor, 'id');
    var thumbs = {};
    (local || []).forEach(function (f) { if (f && f.id && f.thumb) thumbs[f.id] = f.thumb; });
    u.forEach(function (f) { if (f && f.id && !f.thumb && thumbs[f.id]) f.thumb = thumbs[f.id]; });
    return u;
  }

  function applyLoad(j, token) {
    if (!j || !j.ok) return false;
    setTutor({ email: j.email, token: token, optin: j.optin || 'sim' });

    var serverDogs = (j.dogs && j.dogs.length) ? j.dogs : null;

    if (!serverDogs) {
      // servidor vazio: nunca apaga o local, sobe o que tem aqui
      if (currentDogs().length) nannySync(true);
      if (window.renderList) window.renderList();
      return true;
    }

    var final;
    try {
      var loc = currentDogs(), porId = {};
      loc.forEach(function (d) { if (d && d.id) porId[d.id] = d; });

      final = serverDogs.map(function (d) {
        var l = d && d.id ? porId[d.id] : null;
        if (!l) return d;

        if (l.photo && !d.photo) { d.photo = l.photo; d.photoPos = l.photoPos || d.photoPos; }

        d.perguntas = _unir(l.perguntas, d.perguntas, 'id');
        d.vacinas   = _unir(l.vacinas,   d.vacinas,   'id');
        d.files     = _unirFiles(l.files, d.files);

        // campo local que o servidor ainda não conhece não pode sumir
        for (var k in l) if (!(k in d)) d[k] = l[k];
        return d;
      });

      // cão que só existe neste aparelho sobrevive ao load
      var vistos = {};
      final.forEach(function (d) { if (d && d.id) vistos[d.id] = 1; });
      loc.forEach(function (l) { if (l && l.id && !vistos[l.id]) final.push(l); });

    } catch (e) {
      // falhou o merge: mantém o local intacto, não sobrescreve nada
      try { console.warn('[petnanny] merge falhou, local preservado', e); } catch (e2) {}
      if (window.renderList) window.renderList();
      return true;
    }

    try {
      localStorage.setItem(LS_DOGS, JSON.stringify(final));
      if (window.loadDogs) window.loadDogs();
      if (window.renderList) window.renderList();
    } catch (e) {}
    return true;
  }

  function renderOptIn() {
    var box = document.getElementById('nanny-optin'); if (!box) return;
    var t = getTutor();

    if (t && t.email && t.optin === 'nao') {   // pausado
      box.innerHTML = '<div style="background:#f7f2ea;border:1px solid #e8ddd2;border-radius:14px;padding:14px;margin:12px 0">'
        + '<div style="font-size:13px;color:#7a6a58;margin-bottom:8px">🔕 Lembretes pausados para <strong>' + t.email + '</strong>.</div>'
        + '<button id="nanny-react" style="background:#7a9970;color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:600;cursor:pointer">Voltar a receber lembretes</button></div>';
      document.getElementById('nanny-react').onclick = function () { var tt = getTutor(); if (tt) { tt.optin = 'sim'; setTutor(tt); } renderOptIn(); nannySync(true, 'sim'); };
      return;
    }
    if (t && t.email) {   // ativo
      box.innerHTML = '<div style="font-size:13px;color:#7a9970">🔔 Perfil sincronizado + lembretes em <strong>' + t.email + '</strong> · '
        + '<a href="#" id="nanny-pause" style="color:#9a8b78">pausar</a></div>';
      document.getElementById('nanny-pause').onclick = function (ev) { ev.preventDefault(); var tt = getTutor(); if (tt) { tt.optin = 'nao'; setTutor(tt); } renderOptIn(); nannySync(true, 'nao'); };
      return;
    }
    // sem tutor: formulário
    box.innerHTML =
      '<div style="background:#f7f2ea;border:1px solid #e8ddd2;border-radius:14px;padding:16px;margin:12px 0">'
      + '<div style="font-weight:600;margin-bottom:4px">Teu perfil em qualquer aparelho + lembretes</div>'
      + '<div style="font-size:13px;color:#7a6a58;margin-bottom:10px">A Nanny te avisa das próximas datas (vacina, antiparasitário, vermífugo) — e teu perfil passa a abrir em qualquer celular ou computador com esse email. Sem senha, sem spam.</div>'
      + '<input id="nanny-email" type="email" placeholder="seu@email.com" style="width:100%;box-sizing:border-box;border:1.5px solid #e8ddd2;border-radius:10px;padding:11px 13px;font-size:14px;margin-bottom:8px">'
      + '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#7a6a58;margin-bottom:10px">'
      + '<input id="nanny-consent" type="checkbox" style="margin-top:2px">'
      + '<span>Aceito receber lembretes por email. Posso sair quando quiser.</span></label>'
      + '<button id="nanny-optin-btn" style="background:#7a9970;color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:600;cursor:pointer">Ativar perfil e lembretes</button>'
      + '<div id="nanny-optin-msg" style="font-size:12px;margin-top:8px"></div>'
      + '<div style="font-size:11.5px;color:#9a8b78;margin-top:8px">Já ativou em outro aparelho? Usa o <b>mesmo email</b> — teu perfil aparece aqui na hora.</div>'
      + '</div>';
    document.getElementById('nanny-optin-btn').onclick = function () {
      var email = (document.getElementById('nanny-email').value || '').trim();
      var ok = document.getElementById('nanny-consent').checked;
      var msg = document.getElementById('nanny-optin-msg');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.style.color = '#c0392b'; msg.textContent = 'Confere o email.'; return; }
      if (!ok) { msg.style.color = '#c0392b'; msg.textContent = 'Marque o consentimento.'; return; }
      // sem cão local = provável recuperação de perfil de outro aparelho; a trava do servidor
      // garante que um save vazio nunca apaga o que já está guardado.
      setTutor({ email: email, token: null, optin: 'sim' });
      nannySync(true, 'sim');
      msg.style.color = '#7a9970'; msg.textContent = currentDogs().length ? 'Pronto! Sincronizando…' : 'Pronto! Buscando teu perfil…';
    };
  }
  window.nannyRenderOptIn = renderOptIn;

  window.nannyBoot = function () {
    var box = document.getElementById('nanny-optin');
    if (box) box.innerHTML = '<div style="font-size:13px;color:#7a6a58">Carregando seu perfil…</div>';
    var sTok = null; try { sTok = sessionStorage.getItem('petnanny_urltok'); if (sTok) sessionStorage.removeItem('petnanny_urltok'); } catch (e) {}
    var m = location.search.match(/[?&]t=([^&]+)/);
    var urlTok = sTok ? decodeURIComponent(sTok) : (m ? decodeURIComponent(m[1]) : null);
    if (m) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    var t = getTutor();
    var token = urlTok || (t && t.token);
    if (token) {
      postSync({ action: 'load', token: token }).then(function (j) { applyLoad(j, token); renderOptIn(); })
        .catch(function () { renderOptIn(); });
    } else {
      renderOptIn();
    }
  };
})();
