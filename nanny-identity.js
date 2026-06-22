/* nanny-identity.js — ESPINHA DE IDENTIDADE (cliente do hub) — v3
 * <script src="nanny-identity.js"></script> no meu-cao.html
 * Depende de (já existem no hub): saveDogs(), loadDogs(), renderList(), upcomingReminders(dog)
 *
 * v3 — TRAVAS ANTI-PERDA:
 *  (1) restore nunca apaga local com servidor vazio (servidor vazio + local com cão => sobe).
 *  (2) sync nunca envia lista vazia (servidor jamais é zerado por push vazio).
 *  Pior caso = "não atualiza", nunca "apaga".
 */
(function () {
  var SYNC_URL = '/api/nanny-sync';
  var TUTOR_KEY = 'petnanny_tutor';
  var LS_DOGS = 'petnanny_dogs_v1';   // mesma chave do hub

  function getTutor() { try { return JSON.parse(localStorage.getItem(TUTOR_KEY) || 'null'); } catch (e) { return null; } }
  function setTutor(t) { try { localStorage.setItem(TUTOR_KEY, JSON.stringify(t)); } catch (e) {} }
  function currentDogs() { try { return JSON.parse(localStorage.getItem(LS_DOGS) || '[]'); } catch (e) { return []; } }

  function buildProximas() {
    var out = [];
    currentDogs().forEach(function (d) {
      var ups = [];
      try { ups = (window.upcomingReminders ? window.upcomingReminders(d) : []) || []; } catch (e) {}
      ups.forEach(function (u) {
        if (u && u.when) out.push({ o_que: u.t || 'um cuidado', nome: d.nome || '', data: new Date(u.when).toISOString().slice(0, 10) });
      });
    });
    return out;
  }

  var _timer = null;
  function nannySync(force) {
    var t = getTutor();
    if (!t || !t.email) return;
    if (!currentDogs().length) return;   // TRAVA 2: nunca sobe lista vazia
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      fetch(SYNC_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save', email: t.email,
          dogs: currentDogs(), proximas: buildProximas(),
          send_welcome: !t.token
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok && j.token) { t.token = j.token; setTutor(t); } })
        .catch(function () {});
    }, force ? 0 : 1200);
  }
  window.nannySync = nannySync;

  function nannyRestore() {
    var m = location.search.match(/[?&]t=([^&]+)/);
    if (!m) return Promise.resolve(false);
    var token = decodeURIComponent(m[1]);
    return fetch(SYNC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load', token: token })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        if (!j || !j.ok) return false;
        setTutor({ email: j.email, token: token });
        var serverDogs = (j.dogs && j.dogs.length) ? j.dogs : null;
        if (serverDogs) {
          // servidor tem cão => fonte de verdade no restore
          try { localStorage.setItem(LS_DOGS, JSON.stringify(serverDogs)); if (window.loadDogs) window.loadDogs(); if (window.renderList) window.renderList(); } catch (e) {}
        } else {
          // TRAVA 1: servidor vazio NÃO apaga o local. Se local tem cão, sobe pra consertar.
          if (currentDogs().length) nannySync(true);
          if (window.renderList) window.renderList();
        }
        return true;
      })
      .catch(function () { try { history.replaceState(null, '', location.pathname); } catch (e) {} return false; });
  }

  function renderOptIn() {
    var box = document.getElementById('nanny-optin');
    if (!box) return;
    var t = getTutor();
    if (t && t.email) {
      box.innerHTML = '<div style="font-size:13px;color:#7a9970">🔔 Lembretes ativos em <strong>' + t.email + '</strong></div>';
      return;
    }
    box.innerHTML =
      '<div style="background:#f7f2ea;border:1px solid #e8ddd2;border-radius:14px;padding:16px;margin:12px 0">'
      + '<div style="font-weight:600;margin-bottom:4px">Quer que a Nanny te avise das próximas datas?</div>'
      + '<div style="font-size:13px;color:#7a6a58;margin-bottom:10px">Vacina, antiparasitário e vermífugo chegando — um email, sem spam. Opcional.</div>'
      + '<input id="nanny-email" type="email" placeholder="seu@email.com" style="width:100%;box-sizing:border-box;border:1.5px solid #e8ddd2;border-radius:10px;padding:11px 13px;font-size:14px;margin-bottom:8px">'
      + '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#7a6a58;margin-bottom:10px">'
      + '<input id="nanny-consent" type="checkbox" style="margin-top:2px">'
      + '<span>Aceito receber lembretes por email. Posso sair quando quiser.</span></label>'
      + '<button id="nanny-optin-btn" style="background:#7a9970;color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:600;cursor:pointer">Ativar lembretes</button>'
      + '<div id="nanny-optin-msg" style="font-size:12px;margin-top:8px"></div>'
      + '</div>';
    document.getElementById('nanny-optin-btn').onclick = function () {
      var email = (document.getElementById('nanny-email').value || '').trim();
      var ok = document.getElementById('nanny-consent').checked;
      var msg = document.getElementById('nanny-optin-msg');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.style.color = '#c0392b'; msg.textContent = 'Confere o email.'; return; }
      if (!ok) { msg.style.color = '#c0392b'; msg.textContent = 'Marque o consentimento.'; return; }
      setTutor({ email: email, token: null });
      msg.style.color = '#7a9970';
      if (currentDogs().length) { nannySync(true); msg.textContent = 'Pronto! Email de confirmação a caminho.'; }
      else { msg.textContent = 'Assim que você cadastrar um cão, ativo os lembretes e te mando o email.'; }
      setTimeout(renderOptIn, 1500);
    };
  }
  window.nannyRenderOptIn = renderOptIn;

  window.nannyBoot = function () {
    nannyRestore().then(function (restored) {
      if (!restored) {
        var t = getTutor();
        if (t && t.email && currentDogs().length) nannySync(true); // auto-conserto
      }
      renderOptIn();
    });
  };
})();
