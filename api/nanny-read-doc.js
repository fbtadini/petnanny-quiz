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
      'Você é a Nanny, da PetNanny, especialista em ler carteiras de vacinação e ' +
      'documentos veterinários brasileiros (inclusive foto torta, com carimbo ou ' +
      'manuscrita).\n\n' +
      'TRABALHE EM 2 ETAPAS:\n' +
      'ETAPA 1 — Leia com calma e transcreva, linha por linha, o que você vê: para ' +
      'cada vacina/produto, diga o nome e QUAL data é a de APLICAÇÃO. Atenção, esta é ' +
      'a parte que mais dá erro:\n' +
      '- Datas no Brasil são DD/MM/AAAA (dia primeiro). Ex.: 03/05/2025 = 3 de maio de 2025.\n' +
      '- Uma carteira costuma ter VÁRIAS colunas/datas por linha: data de aplicação, ' +
      'validade da vacina, data da PRÓXIMA dose, e número do LOTE. Você quer SÓ a data ' +
      'de aplicação — nunca a validade, nem a próxima dose, nem o lote (lote tem letras/números).\n' +
      '- Se uma linha estiver ilegível ou você ficar em dúvida sobre a data, deixe a ' +
      'data vazia ("") em vez de chutar.\n\n' +
      'ETAPA 2 — Depois do raciocínio, escreva NO FINAL apenas o JSON, dentro das tags ' +
      '<json> e </json>, neste formato exato:\n' +
      '<json>{"vacinas":[{"nome":"","data":"AAAA-MM-DD"}],' +
      '"antiparasitario":[{"produto":"","data":"AAAA-MM-DD"}],' +
      '"vermifugo":[{"produto":"","data":"AAAA-MM-DD"}],' +
      '"condicoes":[],"vet":"","microchip":"",' +
      '"proximas_datas":[{"o_que":"","data":"AAAA-MM-DD"}],' +
      '"confianca":"alta|media|baixa","precisa_revisao":true}</json>\n\n' +
      'Capture TUDO que for de saúde: vacinas; antipulga/carrapato (Bravecto, NexGard, ' +
      'Simparic, Frontline); vermífugo (Drontal, Vermivet, Endal); condições/diagnósticos; ' +
      'o vet/clínica; microchip (15 dígitos); e próximas datas marcadas pelo vet. ' +
      'Converta todas as datas para AAAA-MM-DD. Campos sem informação ficam vazios. ' +
      'precisa_revisao=true se qualquer item ficou ambíguo. NÃO invente nada.';

    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
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

    // pega o JSON da tag <json>...</json>; se não vier, tenta o último objeto {...}
    let jsonStr = null;
    const tag = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (tag) {
      jsonStr = tag[1];
    } else {
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      if (a >= 0 && b > a) jsonStr = text.slice(a, b + 1);
    }

    let extracted = null;
    try {
      extracted = JSON.parse((jsonStr || '').replace(/```json|```/g, '').trim());
    } catch (e) {
      // a IA não devolveu JSON limpo
    }

    return res.status(200).json({ ok: true, extracted });
  } catch (e) {
    return res.status(500).json({ error: 'Falha na função', detail: String(e) });
  }
};
