/* nanny-identity.js — ESPINHA DE IDENTIDADE (cliente do hub)
 * Carregue no meu-cao.html com:  <script src="nanny-identity.js"></script>
 * Depende de: dogs[], saveDogs(), loadDogs(), renderList(), upcomingReminders(dog)
 * (todas já existem no hub).
 *
 * O que faz:
 *  - Guarda {email, token} em localStorage (petnanny_tutor).
 *  - Ao salvar cães, empurra pro servidor (debounced) — só se a pessoa optou.
 *  - Se a URL tiver ?t=TOKEN (magic link), restaura os cães daquele tutor e limpa a URL.
 *  - Renderiza um card de opt-in discreto (email + consentimento).
 */
(function () {
  const SYNC_URL = '/api/nanny-sync';
  const TUTOR_KEY = 'petnanny_tutor';

  function getTutor() { try { return JSON.parse(localStorage.getItem(TUTOR_KEY) || 'null'); } catch (e) { return null; } }
  function setTutor(t) { try { localStorage.setItem(TUTOR_KEY, JSON.stringify(t)); } catch (e) {} }

  // monta a lista de próximas datas a partir da lógica que o hub JÁ tem
  function buildProximas() {
    const out = [];
    (window.dogs || []).forEach(function (d) {
      let ups = [];
      try { ups = (window.upcomingReminders ? window.upcomingReminders(d) : []) || []; } catch (e) {}
      ups.forEach(function (u) {
        if (u && u.when) {
          out.push({ o_que: u.t || 'um cuidado', nome: d.nome || '', data: new Date(u.when).toISOString().slice(0, 10) });
        }
      });
    });
    return out;
  }

  let _timer = null;
  function nannySync(force) {
    const t = getTutor();
    if (!t || !t.email) return;            // só sincroniza quem optou
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          email: t.email,
          dogs: window.dogs || [],
          proximas: buildProximas(),
          send_welcome: !t.token   // primeira vez: manda email de confirmação com magic link
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok && j.token) { t.token = j.token; setTutor(t); } })
        .catch(function () {});
    }, force ? 0 : 1200);
  }
  window.nannySync = nannySync;

  // restaura via magic link (?t=TOKEN), depois limpa a URL
  function nannyRestore() {
    const m = location.search.match(/[?&]t=([^&]+)/);
    if (!m) return Promise.resolve(false);
    const token = decodeURIComponent(m[1]);
    return fetch(SYNC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load', token: token })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        // tira o token da URL de qualquer jeito (não deixa magic link no histórico)
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        if (!j || !j.ok || !j.dogs) return false;
        setTutor({ email: j.email, token: token });
        // mescla: servidor é a fonte de verdade no restore
        try {
          window.dogs = j.dogs;
          if (window.saveDogs) window.saveDogs();
          if (window.renderList) window.renderList();
        } catch (e) {}
        return true;
      })
      .catch(function () { try { history.replaceState(null, '', location.pathname); } catch (e) {} return false; });
  }

  // card de opt-in (injeta no container #nanny-optin se existir)
  function renderOptIn() {
    const box = document.getElementById('nanny-optin');
    if (!box) return;
    const t = getTutor();
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
      const email = (document.getElementById('nanny-email').value || '').trim();
      const ok = document.getElementById('nanny-consent').checked;
      const msg = document.getElementById('nanny-optin-msg');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.style.color = '#c0392b'; msg.textContent = 'Confere o email.'; return; }
      if (!ok) { msg.style.color = '#c0392b'; msg.textContent = 'Marque o consentimento.'; return; }
      setTutor({ email: email, token: null });
      nannySync(true);
      msg.style.color = '#7a9970'; msg.textContent = 'Pronto! Te mandamos um email de confirmação.';
      setTimeout(renderOptIn, 1500);
    };
  }
  window.nannyRenderOptIn = renderOptIn;

  // boot: roda no carregamento
  window.nannyBoot = function () {
    nannyRestore().then(renderOptIn);
  };
})();
