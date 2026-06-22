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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  try {
    const { action, email, dogs, proximas, token, send_welcome } = req.body || {};
    const GS = process.env.NANNY_GS_URL;
    const SHARED = process.env.NANNY_SHARED;
    if (!GS || !SHARED) return res.status(500).json({ ok: false, error: 'env faltando' });

    let payload;
    if (action === 'save') {
      payload = { event: 'nanny_save', shared: SHARED, email, dogs, proximas, send_welcome: !!send_welcome };
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
