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
      'documentos veterinários brasileiros. As fotos costumam vir TORTAS ou ROTACIONADAS ' +
      '(de lado/de cabeça pra baixo) — gire mentalmente e leia na orientação certa.\n\n' +
      'COMO UMA CARTEIRA BRASILEIRA FUNCIONA (muito importante):\n' +
      '- Ela tem colunas: DATA (data da aplicação, quase sempre MANUSCRITA), VACINA/' +
      'VERMÍFUGO/ECTOPARASITAS (onde fica um ADESIVO impresso do produto ou o nome à mão), ' +
      'MÉDICO VETERINÁRIO, e REVACINAÇÃO/REPETIR (a PRÓXIMA dose).\n' +
      '- A DATA DE APLICAÇÃO é a MANUSCRITA na coluna DATA. NÃO é a data do adesivo.\n' +
      '- O NOME do produto vem do ADESIVO impresso (ex.: Vanguard Plus, Nobivac DHPPi+L, ' +
      'Nobivac KC, GiardiaVax, Antirrábica/Labovet, Bordetella; antipulga: Simparic, ' +
      'Bravecto, NexGard; vermífugo: Drontal, Vermivet, Endal, Petzi). Case o NOME do adesivo ' +
      'com a DATA manuscrita da mesma linha.\n' +
      '- O adesivo traz PART (lote), FABR (fabricação) e VENC (validade). NUNCA use essas — ' +
      'não são data de aplicação. REVACINAÇÃO/REPETIR é a PRÓXIMA dose → vai em proximas_datas.\n' +
      '- "Controle de Vacinação" → vacinas. "Vermífugo" → vermifugo. "Controle de ' +
      'Ectoparasitas" → antiparasitario.\n\n' +
      'EXEMPLO de uma linha: DATA manuscrita "02/04/2021", adesivo impresso "Vanguard Plus" ' +
      '(com PART/FABR/VENC), REVACINAÇÃO "23/04/2021" → vacina {nome:"Vanguard Plus", ' +
      'data:"2021-04-02"} e proximas_datas {o_que:"Revacinação Vanguard Plus", data:"2021-04-23"}. ' +
      'Ignore o FABR/VENC do adesivo.\n\n' +
      'CLASSIFIQUE cada vacina pela FUNÇÃO, no campo "classe":\n' +
      '- "polivalente" = a múltipla (cinomose/parvovirose/hepatite/parainfluenza ± leptospirose): V6/V8/V10, Vanguard, Vanguard Plus, Nobivac DHPPi, Nobivac DHPPi+L, Nobivac Canine/Canino (1-Dp, 1-DAPPv), óctupla, déctupla.\n' +
      '- "antirrabica" = antirrábica/raiva.\n' +
      '- "tosse_canis" = tosse dos canis/Bordetella: Nobivac KC, Vanguard B Oral, Bronchi-Shield. ATENÇÃO: NÃO é polivalente.\n' +
      '- "giardia" = GiardiaVax. "leishmaniose" = Leish-Tec/Leishmune. "outra" = o resto.\n' +
      'Cuidado: nem todo "Nobivac"/"Vanguard" é polivalente — Nobivac KC e Vanguard B Oral são tosse_canis.\n\n' +
      'SE o documento for PEDIGREE / CERTIFICADO / REGISTRO (CBKC, kennel club, certificado de raça/genealogia): ' +
      'preencha o objeto "pedigree" (nome de registro, nº de registro, raça, cor, nascimento, canil/criador, pai, mãe, microchip se houver) e deixe as listas de saúde vazias.\n\n' +
      'SE for LAUDO / EXAME (sangue/hemograma, bioquímico, urina, imagem, raio-X, ultrassom, avaliação ortopédica como patela/displasia, ecocardiograma): ' +
      'preencha "exames" com {tipo, data, achado}. O "achado" é um RESUMO CURTO do que o laudo CONCLUI, nas palavras do próprio documento ' +
      '(ex.: "luxação de patela grau 2 no joelho esquerdo", "hemograma dentro da normalidade", "sopro cardíaco grau II"). ' +
      'NÃO interprete nem dê diagnóstico seu — apenas transcreva/resuma o que o laudo afirma. Se não houver conclusão clara, deixe achado "".\n\n' +
      'TRABALHE EM ETAPAS:\n' +
      'ETAPA 0 — Diga que tipo de documento é.\n' +
      'ETAPA 1 — Transcreva LINHA POR LINHA, da PRIMEIRA até a ÚLTIMA, SEM PULAR NENHUMA. ' +
      'Uma carteira pode ter 5, 10, 15+ aplicações ao longo de vários anos — liste TODAS. ' +
      'Cada reforço anual é uma linha separada (a mesma vacina pode aparecer em 2022, 2023, 2024, 2025, 2026 — registre cada uma). ' +
      'Para cada linha, diga a DATA manuscrita de aplicação, o NOME do produto (do adesivo) e a revacinação. ' +
      'Datas BR são DD/MM/AAAA (dia primeiro). LEIA O ANO DÍGITO A DÍGITO com atenção — não confunda 2021/2024/2026, nem 3 com 8. ' +
      'Prefira sempre a data MAIS RECENTE legível; na dúvida entre dois anos, escreva o que está escrito, não o mais antigo. ' +
      'Se a data manuscrita estiver ilegível, deixe "" e marque "incerto":true.\n' +
      'ETAPA 2 — No FINAL, só o JSON entre <json> e </json>:\n' +
      '<json>{"tipo_documento":"carteira de vacinação | nota de antipulga | nota de vermífugo | laudo de exame | receita | pedigree/certificado | outro",' +
      '"resumo":"frase curta do que leu",' +
      '"vacinas":[{"nome":"","classe":"polivalente|antirrabica|tosse_canis|giardia|leishmaniose|outra","data":"AAAA-MM-DD","incerto":false}],' +
      '"antiparasitario":[{"produto":"","data":"AAAA-MM-DD","incerto":false}],' +
      '"vermifugo":[{"produto":"","data":"AAAA-MM-DD","incerto":false}],' +
      '"condicoes":[],"vet":"","microchip":"",' +
      '"exames":[{"tipo":"","data":"AAAA-MM-DD","achado":"","incerto":false}],' +
      '"pedigree":{"nome_registro":"","registro":"","raca":"","cor":"","nascimento":"AAAA-MM-DD","canil":"","pai":"","mae":"","microchip":""},' +
      '"proximas_datas":[{"o_que":"","data":"AAAA-MM-DD"}],' +
      '"confianca":"alta|media|baixa","precisa_revisao":true}</json>\n\n' +
      'Preencha só o que REALMENTE está no documento (deixe vazio o que não houver). Converta datas para AAAA-MM-DD. ' +
      'confianca="baixa" se a foto estiver ruim/ilegível. NÃO invente nada.';

    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 4096,
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
