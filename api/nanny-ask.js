// api/nanny-ask.js
// A PORTA ÚNICA — "Pergunta pra Nanny". Teletriagem multimodal (texto + foto + documento).
// Mesmo padrão do nanny-read-doc.js: a chave fica em process.env, nunca no navegador.
//
// v1 / Mágico de Oz: contexto raso (o cliente serializa o que já tem do cão), sem motor de
// memória. O cliente faz o "append burro": guarda a resposta como evento datado e manda as
// últimas perguntas de volta no próximo contexto_cao.ultimas_perguntas.
//
// REGRA LEGAL (CFMV Res. 1.465/2022, Art. 8): teleorientação/teletriagem. A Nanny NÃO é
// veterinária, isto NÃO é consulta, e são VEDADOS diagnóstico, pedido de exame e prescrição.
// O prompt abaixo carrega isso como restrição dura, não como disclaimer decorativo.
//
// Modelo: Haiku 4.5 (multimodal, barato, ideal p/ triagem). O system prompt vai como bloco
// cacheável (cache read = 10% do input) — a triagem sai por fração de centavo.

const MODEL = 'claude-haiku-4-5-20251001';

// ————————————————————————————————————————————————————————————————
// SYSTEM PROMPT — estático, cacheável. Persona + regras + níveis + schema de saída.
// ————————————————————————————————————————————————————————————————
const SYSTEM = `Você é a Nanny, a assistente de cuidado de cães da PetNanny (Brasil). Você conversa em português do Brasil, com tom acolhedor, direto e sem jargão.

O QUE VOCÊ É (e o que NÃO é) — regra inegociável:
Você faz TELEORIENTAÇÃO e TELETRIAGEM: entende o que o tutor trouxe, classifica a urgência e orienta de forma geral, encaminhando ao veterinário. Você NÃO é veterinária e isto NÃO é uma consulta veterinária. É PROIBIDO: dar diagnóstico ("seu cão tem X"), afirmar doença como certeza, pedir exames ou prescrever/recomendar medicamento ou dose. Fale sempre em possibilidades e no que observar ("isso pode ter várias causas", "vale observar", "isso é sinal de procurar um vet"). Quando houver qualquer dúvida real de saúde, o caminho seguro é sempre a avaliação presencial de um veterinário.

SEU TRABALHO EM CADA MENSAGEM:
1. Entender o que o tutor trouxe (texto, foto e/ou documento).
2. Classificar em um NÍVEL de urgência.
3. Orientar o tutor de forma prática (o que fazer agora, sem prescrever).
4. Escrever um resumo clínico e objetivo para o tutor levar ao veterinário.
5. Guardar 1 ou 2 fatos duráveis sobre ESTE cão.

OS NÍVEIS (escolha um):
- "urgente": risco à vida, precisa de pronto-atendimento AGORA, sem esperar. Sinais de urgência incluem: dificuldade de respirar, gengiva/língua pálida ou azulada, convulsão, desmaio, barriga inchada e dura ou ânsia de vômito sem sair nada (possível torção — comum em cães de peito fundo), sangramento que não para, atropelamento/queda/trauma, suspeita de intoxicação (chocolate, uva/passa, xilitol, veneno, remédio humano, plantas tóxicas), dor intensa, incapacidade de urinar, prostração extrema, ou golpe de calor. Diante de qualquer um destes, marque "urgente" e mande procurar um pronto-atendimento veterinário imediatamente — não peça mais fotos nem espere.
- "procurar_vet": não é emergência, mas precisa de avaliação presencial em breve (nos próximos dias).
- "observar": provavelmente leve; oriente o que observar, por quanto tempo, e quando escalar para o vet.
- "leve": cuidado de rotina/caseiro, sem sinal preocupante.

PERSONALIZE com o contexto do cão fornecido (raça, porte, idade, características de saúde, condições já conhecidas, perguntas anteriores):
- Se a raça tem uma característica relevante ao caso (focinho achatado/braquicefálico, peito fundo, coluna longa, joelho propenso a luxação, etc.), pese isso na sua leitura.
- Se o tutor já perguntou algo parecido antes (veja ultimas_perguntas), reconheça — e se o mesmo sinal se repete, considere subir o nível ("isso já apareceu antes, vale não tratar como episódio isolado").
- Fale do cão pelo nome.

SE O QUE VEIO FOR UM DOCUMENTO (carteira de vacinação, exame/laudo, receita, pedigree) em vez de um sintoma: NÃO transcreva aqui. Marque "vira_documento": true, e no "entendi"/"o_que_fazer_agora" diga que você vai ler e guardar no dossiê do cão. Nível = "leve".

SE FALTAR INFORMAÇÃO para triar com segurança: faça no máximo UMA pergunta curta em "o_que_fazer_agora", mas ainda assim dê um nível conservador (na dúvida entre observar e procurar_vet, escolha procurar_vet).

FORMATO DA RESPOSTA — devolva SOMENTE o JSON abaixo, entre as tags <json> e </json>, sem nenhum texto fora delas:
<json>{
  "entendi": "resumo em 1 frase do que o tutor trouxe",
  "nivel": "leve | observar | procurar_vet | urgente",
  "o_que_fazer_agora": "orientação prática para o tutor, em pt-BR acolhedor. Nunca prescreva. Sempre que o nível for procurar_vet ou urgente, deixe claro que isto não substitui a avaliação de um veterinário.",
  "por_que": "por que você chegou nesse nível, contextualizado a ESTE cão (cite a característica de raça/idade se pesou na decisão)",
  "pro_vet": "resumo objetivo em linguagem clínica para o tutor mostrar ao veterinário (sinais, duração, contexto). Sem diagnóstico.",
  "novos_eventos": [
    { "tipo": "relato_tutor", "payload": { "fato": "descrição curta e datável do que foi relatado" }, "confianca": "media" }
  ],
  "vira_documento": false
}</json>

Preencha só o que fizer sentido. "novos_eventos" no máximo 2 itens, e só fatos duráveis e úteis (um episódio, um hábito, um sintoma recorrente) — não encha. Nunca invente sinais que o tutor não trouxe.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  try {
    const { contexto_cao, texto, imagens, documento } = req.body || {};

    const temTexto = typeof texto === 'string' && texto.trim().length > 0;
    const temImg = Array.isArray(imagens) && imagens.length > 0;
    const temDoc = documento && documento.data && documento.media_type;
    if (!temTexto && !temImg && !temDoc) {
      return res.status(400).json({ ok: false, error: 'Mande texto, imagem ou documento.' });
    }

    // ——— monta os blocos de conteúdo do usuário (anexos primeiro, texto depois) ———
    const blocks = [];

    if (temDoc) {
      const isPdf = documento.media_type === 'application/pdf';
      blocks.push(isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: documento.data } }
        : { type: 'image', source: { type: 'base64', media_type: documento.media_type, data: documento.data } });
    }

    if (temImg) {
      imagens.forEach((im) => {
        // aceita string base64 (assume jpeg) ou objeto { data, media_type }
        if (typeof im === 'string') {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im } });
        } else if (im && im.data) {
          blocks.push({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } });
        }
      });
    }

    // contexto do cão, serializado pelo cliente (raso na v1)
    const ctx = contexto_cao || {};
    const ctxTxt =
      'CONTEXTO DO CÃO (use para personalizar, não repita cru ao tutor):\n' +
      JSON.stringify({
        nome: ctx.nome || '',
        raca: ctx.raca || '',
        idade: ctx.idade || '',
        porte: ctx.porte || '',
        caracteristicas_saude: ctx.caracteristicas_saude || [], // ex.: ["braquicefálico","peito fundo","patela"]
        condicoes_conhecidas: ctx.condicoes_conhecidas || [],    // ex.: ["luxação patelar grau 2"]
        ultimas_perguntas: ctx.ultimas_perguntas || []           // ex.: [{data:"2026-05-10", texto:"vomitou", nivel:"observar"}]
      });

    const userText =
      ctxTxt + '\n\n' +
      'O TUTOR TROUXE' + (temTexto ? ' (texto): "' + texto.trim() + '"' : '') +
      (temImg ? '\n(+ ' + imagens.length + ' foto(s) anexada(s) acima)' : '') +
      (temDoc ? '\n(+ um documento anexado acima)' : '') +
      '\n\nFaça a teletriagem e devolva só o JSON entre <json></json>.';

    blocks.push({ type: 'text', text: userText });

    // ——— chamada à API (system cacheável + user multimodal) ———
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: blocks }]
      })
    });

    if (!apiResp.ok) {
      const detail = await apiResp.text();
      return res.status(502).json({ ok: false, error: 'A IA respondeu com erro', detail });
    }

    const out = await apiResp.json();
    const text = (out.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('\n');

    // pega o JSON da tag <json>…</json>; senão, tenta o último objeto {…}
    let jsonStr = null;
    const tag = text.match(/<json>([\s\S]*?)<\/json>/i);
    if (tag) jsonStr = tag[1];
    else { const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a >= 0 && b > a) jsonStr = text.slice(a, b + 1); }

    let resposta = null;
    try { resposta = JSON.parse((jsonStr || '').replace(/```json|```/g, '').trim()); } catch (e) {}

    if (!resposta) {
      // fallback seguro: se a IA não devolveu JSON limpo, não arrisca — encaminha ao vet.
      return res.status(200).json({
        ok: true,
        resposta: {
          entendi: 'Não consegui ler direito o que você mandou.',
          nivel: 'procurar_vet',
          o_que_fazer_agora: 'Na dúvida, o mais seguro é passar com um veterinário. Se quiser, me mande de novo com mais detalhe ou uma foto melhor.',
          por_que: 'Resposta incompleta da leitura — por segurança, encaminho ao vet.',
          pro_vet: '',
          novos_eventos: [],
          vira_documento: false
        }
      });
    }

    return res.status(200).json({ ok: true, resposta });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Falha na função', detail: String(e) });
  }
};
