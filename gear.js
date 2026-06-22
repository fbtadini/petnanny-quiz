/* gear.js — CAMADA DE PRODUTO (spec por raça + checklist) — Fase 1.5
 * <script src="gear.js"></script> no meu-cao.html (depois do breeds.js)
 *
 * Cada item tem a SPEC certa pra raça (derivada de BREED_CARE + porte/clima) e um id
 * estável (pro checklist lembrar o que já foi comprado). O link leva à busca filtrada.
 *
 * MONETIZAÇÃO: LOJA.cupom (Parceiro Petz). TROCAR LOJA: mude LOJA.base/nome.
 * CONFIRME o formato real da busca da loja antes de confiar nos links.
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

    // RAÇÃO — porte + fase
    mk('racao', '🍖', 'Ração (' + pt.replace('medio', 'médio') + (filhote ? ', filhote' : '') + ')',
      'No porte e na fase certos — confira a orientação acima e o vet.',
      'racao ' + (filhote ? 'filhote ' : '') + pt);

    // COMEDOURO — spec por focinho / peito
    if (c.brachy && c.bloat) mk('comedouro', '🍽️', 'Comedouro lento e raso',
      'Focinho achatado + peito fundo: o lento reduz o risco de torção gástrica e o raso facilita respirar enquanto come.',
      'comedouro lento raso cachorro');
    else if (c.brachy) mk('comedouro', '🍽️', 'Comedouro raso',
      'Focinho achatado: tigela funda atrapalha a respiração ao comer — prefira rasa e larga.',
      'comedouro raso cachorro focinho curto');
    else if (c.bloat) mk('comedouro', '🍽️', 'Comedouro lento',
      'Peito fundo: comer rápido aumenta o risco de torção gástrica. O comedouro lento força pausas.',
      'comedouro lento cachorro');
    else mk('comedouro', '🍽️', 'Comedouro e bebedouro',
      'Inox ou cerâmica higienizam melhor que plástico.', 'comedouro e bebedouro cachorro');

    // CAMA — spec por porte / clima
    if (grande) mk('cama', '🛏️', 'Cama ortopédica',
      'Porte grande pesa nas articulações — espuma ortopédica distribui o peso e poupa cotovelos e quadril.',
      'cama ortopedica cachorro grande');
    else if (frio) mk('cama', '🛏️', 'Cama tipo toca/iglu',
      'Sente frio: cama fechada segura o calor melhor que um colchonete aberto.', 'cama iglu toca cachorro');
    else if (calor) mk('cama', '🛏️', 'Cama/colchonete refrescante',
      'Superaquece fácil: tecido ou gel refrescante ajuda nos dias quentes.', 'cama refrescante gel cachorro');
    else mk('cama', '🛏️', 'Cama / caminha',
      'Do tamanho dele, em canto calmo. Capa lavável facilita.', 'cama cachorro ' + pt);

    // GUIA / PEITORAL — spec
    if (c.brachy) mk('peitoral', '🦮', 'Peitoral (nunca coleira)',
      'Braquicefálico: a coleira pressiona as vias aéreas. Peitoral é o seguro.', 'peitoral cachorro');
    else if (grande) mk('peitoral', '🦮', 'Peitoral anti-puxão',
      'Porte forte: peitoral anti-puxão dá controle sem machucar o pescoço.', 'peitoral antipuxao cachorro grande');
    else mk('peitoral', '🦮', 'Guia + peitoral',
      'Peitoral distribui melhor que coleira. Meça o tórax antes.', 'peitoral e guia cachorro');

    // PLAQUINHA
    mk('plaquinha', '🏷️', 'Plaquinha de identificação',
      'Com seu telefone gravado — o jeito mais rápido de reencontrar um cão perdido.', 'plaquinha identificacao cachorro');

    // TRANSPORTE — porte
    if (grande) mk('transporte', '🚗', 'Cinto de segurança pet',
      'Cão grande raramente cabe em caixa — o cinto pet é o seguro pro carro.', 'cinto seguranca pet cachorro grande');
    else mk('transporte', '🚗', 'Caixa de transporte',
      'Pra trazer ele e ir ao vet com segurança.', 'caixa de transporte cachorro ' + pt);

    // TAPETE
    mk('tapete', '🧻', 'Tapete higiênico', 'Pros primeiros dias e pra ensinar o xixi no lugar.', 'tapete higienico cachorro');

    // CONFINAMENTO — porte
    mk('confinamento', '🏠', 'Cercadinho ou caixa (crate)',
      'Espaço seguro pra quando você não puder vigiar — ajuda na adaptação e no xixi.',
      grande ? 'crate cachorro grande' : 'cercadinho cachorro');

    // PELAGEM — por tipo de coat
    if (coat === 'double') {
      mk('escova_pinos', '🪮', 'Escova de pinos', 'Pro dia a dia, desembaraça sem agredir a pele.', 'escova de pinos cachorro');
      mk('rasqueadeira', '🪮', 'Rasqueadeira (slicker)', 'Tira o pelo morto da camada de cima.', 'rasqueadeira cachorro');
      mk('rastelo', '🪮', 'Rastelo de subpelo', 'Pras trocas de pelo: remove o subpelo sem cortar (evite furminator/lâmina).', 'rastelo de subpelo cachorro');
    } else if (coat === 'hair' || coat === 'wire') {
      mk('escova_pinos', '🪮', 'Escova de pinos', 'Desembaraça o pelo que cresce contínuo.', 'escova de pinos cachorro');
      mk('pente', '🪮', 'Pente de metal', 'Acha nós rentes à pele que a escova não pega — entre as tosas.', 'pente para caes');
    } else {
      mk('escova_curta', '🪮', 'Luva ou escova de cerdas', 'Pelo curto: uma luva tira-pelo 1x/semana resolve.', 'luva tira pelo cachorro');
    }

    // DENTAL — cães pequenos
    if (mini) mk('dental', '🦷', 'Escova dedeira + pasta de cão',
      'Cães pequenos juntam mais tártaro. Dedeira é mais fácil de começar; pasta DE CÃO (a humana é tóxica).',
      'escova dedeira e pasta de dente cachorro');

    // RAMPA / ESCADA — coluna ou joelho
    if (c.longBack) mk('rampa', '🛗', 'Rampa (corpo alongado)',
      'Coluna comprida: rampa (não escada) evita a flexão que machuca o disco.', 'rampa para cachorro sofa');
    else if (c.patella) mk('rampa', '🛗', 'Rampa ou escada pet',
      'Joelho propenso a luxação: evita o impacto dos saltos do sofá e da cama.', 'rampa escada cachorro pequeno');

    // ENRIQUECIMENTO — energia alta
    if (b.nrg >= 4) mk('enriquecimento', '🧩', 'Brinquedo de enriquecimento',
      'Energia alta: recheável e tapete de farejar gastam a cabeça e evitam bagunça por tédio.',
      'brinquedo interativo recheavel cachorro');

    // DENTIÇÃO — filhote
    if (filhote) mk('denticao', '🦴', 'Mordedor de dentição',
      'Pro filhote aliviar a gengiva e poupar seus móveis.', 'brinquedo mordedor filhote');

    return L;
  }
  window.gearListFor = gearListFor;
})();
