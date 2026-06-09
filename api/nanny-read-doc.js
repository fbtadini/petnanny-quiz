// api/nanny-read-doc.js
// Função serverless da Vercel. Lê um documento do vet (foto ou PDF) com o Claude
// e devolve os dados estruturados em JSON. A chave fica em process.env (nunca no navegador).

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { data, media_type } = req.body || {};
    if (!data || !media_type) {
      return res.status(400).json({ error: 'Faltou data ou media_type' });
    }

    // monta o bloco do documento (imagem ou PDF)
    const isPdf = media_type === 'application/pdf';
    const docBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type, data } };

    const prompt =
      'Você é a Nanny, da PetNanny. Leia este documento veterinário (caderneta, ' +
      'carteira de vacinação, prontuário ou receita — pode ser foto torta, com ' +
      'carimbo ou manuscrita). Extraia as informações em JSON e responda SOMENTE com ' +
      'o JSON, sem nenhum texto antes ou depois, neste formato exato:\n' +
      '{"vacinas":[{"nome":"","data":"AAAA-MM-DD"}],' +
      '"antiparasitario":[{"produto":"","data":"AAAA-MM-DD"}],' +
      '"condicoes":[],"vet":"",' +
      '"proximas_datas":[{"o_que":"","data":"AAAA-MM-DD"}],' +
      '"confianca":"alta|media|baixa","precisa_revisao":true}\n' +
      'Use datas no formato AAAA-MM-DD quando der pra identificar. Campos sem ' +
      'informação ficam vazios. Marque precisa_revisao=true se algo estiver ilegível ' +
      'ou ambíguo. Não invente: se não tiver certeza, deixe vazio e baixe a confianca.';

    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [docBlock, { type: 'text', text: prompt }] }]
      })
    });

    if (!apiResp.ok) {
      const detail = await apiResp.text();
      return res.status(502).json({ error: 'A IA respondeu com erro', detail });
    }

    const out = await apiResp.json();
    const text = (out.content || [])
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n');

    let extracted = null;
    try {
      extracted = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (e) {
      // a IA não devolveu JSON limpo
    }

    return res.status(200).json({ ok: true, extracted });
  } catch (e) {
    return res.status(500).json({ error: 'Falha na função', detail: String(e) });
  }
};
