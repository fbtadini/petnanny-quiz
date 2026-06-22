/* nanny-identity.js — ESPINHA DE IDENTIDADE (cliente do hub) — v4
 * <script src="nanny-identity.js"></script> no meu-cao.html
 * Depende de (já existem no hub): saveDogs(), loadDogs(), renderList(), upcomingReminders(dog)
 *
 * v4:
 *  - opt-out DURÁVEL: salvar dados não mexe no optin; só ação explícita liga/desliga.
 *  - botão "Voltar a receber lembretes" (reativar) e "pausar" no próprio app.
 *  - o app reflete o estado real do servidor (se a pessoa saiu pelo email, aparece "pausado").
 *  - "Carregando seu perfil…" enquanto restaura.
 *  - mantém as travas anti-perda da v3.
 */
(function () {
  var SYNC_URL = '/api/nanny-sync', TUTOR_KEY = 'petnanny_tutor', LS_DOGS = 'petnanny_dogs_v1';

  function getTutor() { try { return JSON.parse(localStorage.getItem(TUTOR_KEY) || 'null'); } catch (e) { return null; } }
  function setTutor(t) { try { localStorage.setItem(TUTOR_KEY, JSON.stringify(t)); } catch (e) {} }
  function currentDogs() { try { return JSON.parse(localStorage.getItem(LS_DOGS) || '[]'); } catch (e) { return []; } }
  function postSync(body) { return fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  function buildProximas() {
    var out = [];
    currentDogs().forEach(function (d) {
      if (d.aguardando) {
        // cão ainda não chegou: 1 nudge de volta (~10 dias), sem datas de vacina
        var base = d.criadoEm ? new Date(d.criadoEm) : new Date();
        var when = new Date(base.getTime() + 10 * 864e5);
        out.push({ o_que: 'Já pegou seu cão? Atualize o plano de chegada com a Nanny', nome: (d.nome && d.nome !== 'Meu futuro cão') ? d.nome : '', data: when.toISOString().slice(0, 10) });
        return;
      }
      var ups = [];
      try { ups = (window.upcomingReminders ? window.upcomingReminders(d) : []) || []; } catch (e) {}
      ups.forEach(function (u) { if (u && u.when) out.push({ o_que: u.t || 'um cuidado', nome: d.nome || '', data: new Date(u.when).toISOString().slice(0, 10) }); });
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
      var body = { action: 'save', email: t.email, dogs: currentDogs(), proximas: buildProximas() };
      if (setOptin) body.set_optin = setOptin;
      body.send_welcome = (!t.token && setOptin === 'sim');  // email de boas-vindas só na 1ª ativação
      postSync(body).then(function (j) {
        if (j && j.ok) { t.token = j.token || t.token; if (j.optin) t.optin = j.optin; setTutor(t); renderOptIn(); }
      }).catch(function () {});
    }, force ? 0 : 1200);
  }
  window.nannySync = nannySync;

  function applyLoad(j, token) {
    if (!j || !j.ok) return false;
    setTutor({ email: j.email, token: token, optin: j.optin || 'sim' });
    var serverDogs = (j.dogs && j.dogs.length) ? j.dogs : null;
    if (serverDogs) {
      try { localStorage.setItem(LS_DOGS, JSON.stringify(serverDogs)); if (window.loadDogs) window.loadDogs(); if (window.renderList) window.renderList(); } catch (e) {}
    } else {
      if (currentDogs().length) nannySync(true);   // servidor vazio + local com cão => sobe (não apaga)
      if (window.renderList) window.renderList();
    }
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
      box.innerHTML = '<div style="font-size:13px;color:#7a9970">🔔 Lembretes ativos em <strong>' + t.email + '</strong> · '
        + '<a href="#" id="nanny-pause" style="color:#9a8b78">pausar</a></div>';
      document.getElementById('nanny-pause').onclick = function (ev) { ev.preventDefault(); var tt = getTutor(); if (tt) { tt.optin = 'nao'; setTutor(tt); } renderOptIn(); nannySync(true, 'nao'); };
      return;
    }
    // sem tutor: formulário
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
      if (!currentDogs().length) { msg.style.color = '#c0392b'; msg.textContent = 'Cadastre seu cão primeiro — aí dá pra ativar os lembretes.'; return; }
      setTutor({ email: email, token: null, optin: 'sim' });
      nannySync(true, 'sim');
      msg.style.color = '#7a9970'; msg.textContent = 'Pronto! Email de confirmação a caminho.';
    };
  }
  window.nannyRenderOptIn = renderOptIn;

  window.nannyBoot = function () {
    var box = document.getElementById('nanny-optin');
    if (box) box.innerHTML = '<div style="font-size:13px;color:#7a6a58">Carregando seu perfil…</div>';
    var m = location.search.match(/[?&]t=([^&]+)/);
    var urlTok = m ? decodeURIComponent(m[1]) : null;
    if (urlTok) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
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
