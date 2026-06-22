/* gear.js — CAMADA DE PRODUTO (curadoria determinística da lista de chegada)
 * <script src="gear.js"></script> no meu-cao.html (depois do breeds.js)
 *
 * FILOSOFIA: a IA/curadoria entra AQUI (offline), nunca no runtime. O app só cruza
 * as flags da raça (BREED_CARE) com este catálogo de forma determinística — zero
 * alucinação, custo zero por uso, e toda recomendação é verdadeira porque você aprovou.
 *
 * COMO ATIVAR A COMPRA: preencha o campo `link` de cada categoria com seu link de
 * afiliado (Petz/Cobasi). Enquanto `link` estiver vazio, o app mostra só a orientação
 * ("o que procurar"); assim que houver link, o botão de compra e o aviso de comissão
 * aparecem sozinhos. Mantenha o afiliado de VAREJISTA (agnóstico de marca) — é o que
 * preserva a tese da PetNanny. Nunca afiliado de fabricante de ração.
 */
(function () {
  // Categorias curadas. oque = "o que procurar" (orientação honesta, sem marca).
  var CAT = {
    comedouro:      { ic: '🍽️', nome: 'Comedouro e bebedouro', oque: 'Inox ou cerâmica higienizam melhor. Focinho curto pede tigela rasa; focinho longo, mais funda.', link: '' },
    cama:           { ic: '🛏️', nome: 'Cama / caminha', oque: 'Do tamanho dele, em canto calmo. Capa lavável facilita muito.', link: '' },
    guia_peitoral:  { ic: '🦮', nome: 'Guia + peitoral', oque: 'Peitoral distribui melhor a força que a coleira. Meça o tórax antes de comprar.', link: '' },
    plaquinha:      { ic: '🏷️', nome: 'Plaquinha de identificação', oque: 'Com seu telefone gravado — o jeito mais rápido de reencontrar um cão perdido.', link: '' },
    transporte:     { ic: '🚗', nome: 'Transporte seguro', oque: 'Caixa de transporte ou cinto de segurança pet pra trazer ele e ir ao vet.', link: '' },
    tapete:         { ic: '🧻', nome: 'Tapete higiênico', oque: 'Pros primeiros dias e pra ensinar o xixi no lugar certo.', link: '' },
    confinamento:   { ic: '🏠', nome: 'Cercadinho ou caixa (crate)', oque: 'Espaço seguro pra quando você não puder vigiar — ajuda na adaptação e no xixi.', link: '' },
    // pelagem
    escova_pinos:   { ic: '🪮', nome: 'Escova de pinos', oque: 'Pro dia a dia: desembaraça sem agredir a pele.', link: '' },
    rasqueadeira:   { ic: '🪮', nome: 'Rasqueadeira (slicker)', oque: 'Tira o pelo morto da camada de cima.', link: '' },
    rastelo:        { ic: '🪮', nome: 'Rastelo de subpelo', oque: 'Pras trocas de pelo: remove o subpelo solto sem cortar (evite furminator/lâmina).', link: '' },
    pente:          { ic: '🪮', nome: 'Pente de metal', oque: 'Acha nós rentes à pele que a escova não pega.', link: '' },
    escova_macia:   { ic: '🪮', nome: 'Escova de cerdas macias', oque: '1x/semana tira pelo morto e ativa a pele.', link: '' },
    // saúde
    kit_dental:     { ic: '🦷', nome: 'Escova e pasta dental de cão', oque: 'Pasta DE CÃO (a humana é tóxica pra eles). Cães pequenos juntam mais tártaro.', link: '' },
    rampa:          { ic: '🛗', nome: 'Rampa ou degraus', oque: 'Pro sofá/cama: poupa coluna e joelhos dos saltos.', link: '' },
    comedouro_lento:{ ic: '🐢', nome: 'Comedouro lento', oque: 'Desacelera quem come rápido — ajuda a reduzir o risco de torção gástrica.', link: '' },
    enriquecimento: { ic: '🧩', nome: 'Brinquedo de enriquecimento', oque: 'Recheável e tapete de farejar gastam energia mental e evitam bagunça por tédio.', link: '' },
    denticao:       { ic: '🦴', nome: 'Brinquedo de dentição', oque: 'Pro filhote aliviar a gengiva e poupar seus móveis.', link: '' }
  };
  window.GEAR_CATALOG = CAT;

  // Cruza o cão + flags (BREED_CARE) com o catálogo. Determinístico.
  // dog: objeto do cão; b: getBreed(dog); c: BREED_CARE[breedKey] (ou {}).
  function gearListFor(dog, b, c) {
    c = c || {}; b = b || {};
    var coat = c.coat;
    var list = [];
    var push = function (id) { if (CAT[id]) list.push(Object.assign({ id: id }, CAT[id])); };

    // Ração (dinâmica por porte — não é categoria fixa)
    var porte = (b.siz <= 2) ? 'porte pequeno' : (b.siz >= 4 ? 'porte grande' : 'porte médio');
    list.push({ id: 'racao', ic: '🍖', nome: 'Ração (' + porte + ')', oque: 'Na fase certa (filhote/adulto) — confira a orientação acima e o vet.', link: '' });

    // Essenciais (todo cão)
    ['comedouro', 'cama', 'guia_peitoral', 'plaquinha', 'transporte', 'tapete', 'confinamento'].forEach(push);

    // Pelagem por tipo de coat
    if (coat === 'double') { push('escova_pinos'); push('rasqueadeira'); push('rastelo'); }
    else if (coat === 'hair') { push('escova_pinos'); push('pente'); }
    else if (coat === 'wire') { push('escova_pinos'); push('pente'); }
    else { push('escova_macia'); }

    // Saúde da raça (flags)
    if (b.siz <= 2) push('kit_dental');
    if (c.longBack || c.patella) push('rampa');
    if (c.bloat) push('comedouro_lento');
    if (b.nrg >= 4) push('enriquecimento');

    // Filhote (origem indica criador/loja)
    if (dog && dog.origem === 'filhote_criador') push('denticao');

    return list;
  }
  window.gearListFor = gearListFor;
})();
