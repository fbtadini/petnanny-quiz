/* gear.js — CAMADA DE PRODUTO (spec por raça + checklist) — Fase 1.5 (v2 queries)
 * <script src="gear.js"></script> no meu-cao.html (depois do breeds.js)
 *
 * MUDANÇA v2 (importante): as buscas da Petz QUEBRAM quando você empilha qualificador
 * (ex.: "cama cachorro porte medio" devolvia porta-saquinho). Regra nova:
 *   - QUERY = 1 âncora forte + "cachorro/para cachorro". NUNCA empilhar porte/raça na string.
 *   - A adaptação por RAÇA vive em QUAL item aparece (rampa p/ coluna longa, peitoral p/
 *     braquicefálico) e no TEXTO do card — não na query. Isso é de propósito.
 *   - Toda query aqui é curta (≤3 palavras) e testável. Ver lista de validação separada.
 *
 * MONETIZAÇÃO: LOJA.cupom (Parceiro Petz). CONFIRME o formato real da busca da loja.
 */
(function () {
  var LOJA = {
    nome: 'Petz',
    base: 'https://www.petz.com.br/busca?q=', // confirme o formato real da busca
    cupom: ''                                  // ex.: 'NANNY10' — quando preencher, mostra o banner
  };
  window.GEAR_LOJA = LOJA;

  function porteTxt(b) { return (b && b.siz <= 2) ? 'porte pequeno' : ((b && b.siz >= 4) ? 'porte grande' : 'porte medio'); }
  function urlDe(q) { return LOJA.base + encodeURIComponent(q); }

  function gearListFor(dog, b, c) {
    c = c || {}; b = b || {};
    var pt = porteTxt(b), coat = c.coat, filhote = (dog && dog.origem === 'filhote_criador');
    var grande = b.siz >= 4, mini = b.siz <= 2;
    var frio = (b.ctl != null && b.ctl <= 2), calor = (b.htl != null && b.htl <= 2);
    var L = [];
    var mk = function (id, ic, nome, oque, q) { L.push({ id: id, ic: ic, nome: nome, oque: oque, url: urlDe(q) }); };

    // RAÇÃO — porte/fase ficam no CARD; a query só ancora em "ração cachorro" (+ fase)
    mk('racao', '🍖', 'Ração (' + pt.replace('medio', 'médio') + (filhote ? ', filhote' : '') + ')',
      'No porte e na fase certos — confira a orientação acima e o vet.',
      filhote ? 'ração cachorro filhote' : 'ração cachorro');

    // COMEDOURO — "lento" é o termo que a busca entende; o "raso" fica no texto
    if (c.bloat) mk('comedouro', '🍽️', 'Comedouro lento' + (c.brachy ? ' e raso' : ''),
      c.brachy ? 'Peito fundo + focinho achatado: o lento reduz risco de torção; escolha um raso e largo pra respirar comendo.'
               : 'Peito fundo: comer rápido aumenta o risco de torção gástrica. O comedouro lento força pausas.',
      'comedouro lento cachorro');
    else if (c.brachy) mk('comedouro', '🍽️', 'Comedouro raso',
      'Focinho achatado: tigela funda atrapalha a respiração ao comer — prefira rasa e larga.',
      'comedouro cachorro');
    else mk('comedouro', '🍽️', 'Comedouro e bebedouro',
      'Inox ou cerâmica higienizam melhor que plástico.', 'comedouro cachorro');

    // CAMA — a diferenciação vira o ADJETIVO âncora (nunca "porte X")
    if (grande) mk('cama', '🛏️', 'Cama ortopédica',
      'Porte grande pesa nas articulações — espuma ortopédica distribui o peso e poupa cotovelos e quadril.',
      'cama ortopedica cachorro');
    else if (frio) mk('cama', '🛏️', 'Cama tipo toca/iglu',
      'Sente frio: cama fechada segura o calor melhor que um colchonete aberto.', 'cama iglu cachorro');
    else if (calor) mk('cama', '🛏️', 'Cama/colchonete refrescante',
      'Superaquece fácil: tecido ou gel refrescante ajuda nos dias quentes.', 'cama refrescante cachorro');
    else mk('cama', '🛏️', 'Cama / caminha',
      'Do tamanho dele, em canto calmo. Capa lavável facilita.', 'cama para cachorro');

    // GUIA / PEITORAL
    if (c.brachy) mk('peitoral', '🦮', 'Peitoral (nunca coleira)',
      'Braquicefálico: a coleira pressiona as vias aéreas. Peitoral é o seguro.', 'peitoral cachorro');
    else if (grande) mk('peitoral', '🦮', 'Peitoral anti-puxão',
      'Porte forte: peitoral anti-puxão dá controle sem machucar o pescoço.', 'peitoral antipuxao cachorro');
    else mk('peitoral', '🦮', 'Guia + peitoral',
      'Peitoral distribui melhor que coleira. Meça o tórax antes.', 'peitoral cachorro');

    // PLAQUINHA
    mk('plaquinha', '🏷️', 'Plaquinha de identificação',
      'Com seu telefone gravado — o jeito mais rápido de reencontrar um cão perdido.', 'plaquinha para cachorro');

    // TRANSPORTE — porte no texto; query ancorada
    if (grande) mk('transporte', '🚗', 'Cinto de segurança pet',
      'Cão grande raramente cabe em caixa — o cinto pet é o seguro pro carro.', 'cinto seguranca cachorro');
    else mk('transporte', '🚗', 'Caixa de transporte',
      'Pra trazer ele e ir ao vet com segurança.', 'caixa de transporte cachorro');

    // TAPETE
    mk('tapete', '🧻', 'Tapete higiênico', 'Pros primeiros dias e pra ensinar o xixi no lugar.', 'tapete higienico cachorro');

    // CONFINAMENTO
    mk('confinamento', '🏠', 'Cercadinho',
      'Espaço seguro pra quando você não puder vigiar — ajuda na adaptação e no xixi.',
      'cercadinho cachorro');

    // PELAGEM — por tipo de coat (âncoras que a busca reconhece)
    if (coat === 'double') {
      mk('escova_pinos', '🪮', 'Escova de pinos', 'Pro dia a dia, desembaraça sem agredir a pele.', 'escova de pinos cachorro');
      mk('rasqueadeira', '🪮', 'Rasqueadeira (slicker)', 'Tira o pelo morto da camada de cima.', 'rasqueadeira cachorro');
      mk('rastelo', '🪮', 'Rastelo de subpelo', 'Pras trocas de pelo: remove o subpelo (evite furminator/lâmina).', 'rastelo cachorro');
    } else if (coat === 'hair' || coat === 'wire') {
      mk('escova_pinos', '🪮', 'Escova de pinos', 'Desembaraça o pelo que cresce contínuo.', 'escova de pinos cachorro');
      mk('pente', '🪮', 'Pente de metal', 'Acha nós rentes à pele que a escova não pega — entre as tosas.', 'pente para cachorro');
    } else {
      mk('escova_curta', '🪮', 'Luva ou escova de cerdas', 'Pelo curto: uma luva tira-pelo 1x/semana resolve.', 'luva tira pelo cachorro');
    }

    // DENTAL — cães pequenos (dedeira/pasta-de-cão ficam no texto; âncora = "pasta de dente")
    if (mini) mk('dental', '🦷', 'Escova dedeira + pasta de cão',
      'Cães pequenos juntam mais tártaro. Comece pela dedeira; use pasta DE CÃO (a humana é tóxica).',
      'pasta de dente cachorro');

    // RAMPA / ESCADA — coluna ou joelho (aqui está a adaptação por raça de verdade)
    if (c.longBack) mk('rampa', '🛗', 'Rampa (corpo alongado)',
      'Coluna comprida: rampa (não escada) evita a flexão que machuca o disco.', 'rampa para cachorro');
    else if (c.patella) mk('rampa', '🛗', 'Rampa ou escada pet',
      'Joelho propenso a luxação: evita o impacto dos saltos do sofá e da cama.', 'rampa para cachorro');

    // ENRIQUECIMENTO — energia alta
    if (b.nrg >= 4) mk('enriquecimento', '🧩', 'Brinquedo de enriquecimento',
      'Energia alta: recheável e tapete de farejar gastam a cabeça e evitam bagunça por tédio.',
      'brinquedo interativo cachorro');

    // DENTIÇÃO — filhote
    if (filhote) mk('denticao', '🦴', 'Mordedor de dentição',
      'Pro filhote aliviar a gengiva e poupar seus móveis.', 'mordedor para filhote');

    return L;
  }
  window.gearListFor = gearListFor;
})();
