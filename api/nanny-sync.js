// api/nanny-sync.js
// Proxy MESMA ORIGEM entre o hub (meu-cao.html) e o webhook do Apps Script.
// Por que existe: o Apps Script não devolve header de CORS, então o navegador
// não consegue LER a resposta dele direto. Aqui o navegador fala com a Vercel
// (mesma origem, sem CORS) e a Vercel fala com o Apps Script servidor-a-servidor
// (onde CORS não existe). Bônus: o token vai no CORPO, nunca na URL.
//
// ENVS (Vercel > Project > Settings > Environment Variables):
//   NANNY_GS_URL  = a mesma URL /exec do seu webhook do Apps Script
//   NANNY_SHARED  = o segredo que o nannySetup() imprimiu no log


// ---- guarda: origem permitida + rate limit por IP (melhor esforço por instância) + tamanho ----
const PN_ALLOW = /petnanny\.com\.br$|\.vercel\.app$/;
const PN_HITS = new Map();
function pnGuard(req, res, maxPerHour, maxBytes) {
  try {
    const ref = String(req.headers.origin || req.headers.referer || '');
    let host = '';
    try { host = new URL(ref).hostname; } catch (e) {}
    if (!host || !PN_ALLOW.test(host)) { res.status(403).json({ ok: false, error: 'origem não permitida' }); return false; }
    const len = parseInt(req.headers['content-length'] || '0', 10);
    if (maxBytes && len > maxBytes) { res.status(413).json({ ok: false, error: 'arquivo/payload grande demais' }); return false; }
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim();
    const now = Date.now();
    let arr = (PN_HITS.get(ip) || []).filter(t => now - t < 3600e3);
    if (arr.length >= maxPerHour) { res.status(429).json({ ok: false, error: 'muitas requisições — tenta daqui a pouco' }); return false; }
    arr.push(now); PN_HITS.set(ip, arr);
    if (PN_HITS.size > 5000) PN_HITS.clear();
    return true;
  } catch (e) { return true; }
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });
  if (!pnGuard(req, res, 120, 1536 * 1024)) return;

  try {
    const { action, email, dogs, proximas, token, send_welcome, set_optin } = req.body || {};
    const GS = process.env.NANNY_GS_URL;
    const SHARED = process.env.NANNY_SHARED;
    if (!GS || !SHARED) return res.status(500).json({ ok: false, error: 'env faltando' });

    let payload;
    if (action === 'save') {
      payload = { event: 'nanny_save', shared: SHARED, email, dogs, proximas, send_welcome: !!send_welcome, set_optin };
    } else if (action === 'load') {
      payload = { event: 'nanny_load', shared: SHARED, token };
    } else {
      return res.status(400).json({ ok: false, error: 'action invalida' });
    }

    const r = await fetch(GS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await r.text();

    let data;
    try { data = JSON.parse(text); } catch (e) { return res.status(502).json({ ok: false, error: 'resposta nao-json', detail: text.slice(0, 300) }); }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
};
