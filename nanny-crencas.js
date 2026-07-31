/* nanny-crencas.js — CRENÇAS E BOATOS (o que "mitos x verdades" virou) — v1
 * <script src="nanny-crencas.js"></script> no meu-cao.html, DEPOIS de nanny-hoje.js.
 * Também pode ser carregado no index.html (só o CORPUS é usado lá, pra gerar página).
 *
 * POR QUE NÃO É UM QUIZ:
 *  - Card sequencial com voto e gabarito vira prova escolar. Além de chato, envenena o dado:
 *    quando a pessoa sente que está sendo avaliada, ela responde o que ACHA que é certo,
 *    não o que acredita. Aí a base de crenças vira ficção.
 *  - Aqui a crença é DETECTADA, nunca perguntada. Dois gatilhos:
 *      (a) TEXTO — a pergunta que o tutor já digita pra Nanny É a crença dele, em linguagem
 *          natural. Casamos com o corpus e a Nanny tece a correção na própria resposta.
 *      (b) COMPORTAMENTO — um adiamento, uma repetição, uma contradição. Nunca um atributo
 *          estático ("é fêmea, logo mostre o card X") — isso é catálogo, não inteligência,
 *          e obriga a manter um mapa à mão pra sempre.
 *  - REVISÃO também não é perguntada. Se o tutor passa a FAZER o que não fazia (marcou o
 *    primeiro passeio depois do card sobre vacina), isso é a revisão. Comportamento como
 *    evidência, não autodeclaração.
 *
 * O INIMIGO É O BOATO, NUNCA O TUTOR. Nenhuma copy aqui diz "você errou".
 *
 * Expõe:
 *   window.CRENCAS                     -> corpus (também serve pra gerar páginas de SEO)
 *   window.nannyDetectarCrenca(texto)  -> [entradas do corpus que casaram]
 *   window.nannyCrencaCard(dog)        -> HTML do card comportamental (ou '')
 *   window.nannyCrencaDispensar(id)
 *   window.nannyCrencaExplicar(id)
 */
(function () {
  var LIM_DIAS = 7;          // no máximo 1 card comportamental por semana
  var CT = {
    pri: 'var(--ct-pri, var(--brown, #3d2c1e))',
    sec: 'var(--ct-sec, var(--brown-mid, #7a5c44))',
    mut: 'var(--ct-mut, var(--brown-mid, #9a8b78))',
    line: 'var(--ct-line, var(--line, #ece1d2))',
    card: 'var(--card, #fff)',
    accent: 'var(--accent, #e8733a)'
  };

  function g(fn) { return (typeof window[fn] === 'function') ? window[fn] : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hoje() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function iso(d) { d = d || hoje(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dias(a, b) { try { return Math.floor((new Date(b) - new Date(a)) / 864e5); } catch (e) { return 9e9; } }
  function semAcento(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function track(ev, p) { try { if (g('pnTrack')) window.pnTrack(ev, p || {}); else if (window.gtag) window.gtag('event', ev, p || {}); } catch (e) {} }

  /* ============================ CORPUS ============================
   * evid: 'forte' | 'moderada' | 'contestada'  — exibir o grau é o que constrói
   *       autoridade. Fingir certeza no que é contestado é o que a destrói.
   * alvo: id de marco/ação cujo acontecimento posterior conta como REVISÃO.
   */
  var CRENCAS = [
    {
      id: 'passeio_vacina',
      crenca: 'Não pode botar o pé na rua antes da última vacina',
      rx: /(sair|passea?r?|rua|calcada|calçada|chao|chão|parque|pisar)[^.?!]{0,40}(antes|sem|ate|até)[^.?!]{0,25}(vacin|dose|imuniz)|(vacin|dose)[^.?!]{0,40}(antes|pra|para)[^.?!]{0,20}(sair|passear|rua)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A janela de socialização fecha antes de a vacinação terminar. Ficar trancado até a última dose costuma custar mais caro, em medo e reatividade, do que o risco que evita.',
      pratica: 'Sair com manejo: colo, casa de amigos com cães vacinados, gramado pouco frequentado. Evitar chão de pet shop, praça de cachorro e poça.',
      alvo: 'passeio'
    },
    {
      id: 'macho_femea',
      crenca: 'Fêmea é mais carinhosa e mais fácil de criar que macho',
      rx: /(femea|fêmea|menina|cadela)[^.?!]{0,40}(carinhos|doce|docil|dócil|calma|facil|fácil|melhor|apegad)|(macho|menino)[^.?!]{0,40}(agressiv|bravo|dificil|difícil|territorial|pior)|macho\s+ou\s+f[eê]mea|f[eê]mea\s+ou\s+macho/i,
      veredito: 'mito', evid: 'moderada',
      correcao: 'Diferenças por sexo existem, mas o efeito é pequeno. Castração pesa mais que sexo, e o indivíduo pesa mais que os dois juntos.',
      pratica: 'Uma hora com o cão específico prevê mais que sexo, raça e pedigree somados.'
    },
    {
      id: 'raca_personalidade',
      crenca: 'A raça define a personalidade do cão',
      rx: /(raca|raça)[^.?!]{0,40}(personalidade|temperamento|jeito|comportamento)|(por ser|porque e|porque é)[^.?!]{0,20}(golden|labrador|pitbull|pit bull|border|shih|husky|beagle)[^.?!]{0,30}(ele|ela|e |é )/i,
      veredito: 'meia_verdade', evid: 'forte',
      correcao: 'Raça prevê bem o hardware — porte adulto, energia basal, pelagem, doença hereditária. Prevê mal o software: estudo com quase 18 mil cães estimou que a raça explica cerca de 9% da variação de comportamento de um cão individual.',
      pratica: 'Use raça pra planejar espaço, custo e saúde. Use o cão pra prever o cão.'
    },
    {
      id: 'grande_apartamento',
      crenca: 'Cachorro grande não vive bem em apartamento',
      rx: /(grande|porte grande|gigante)[^.?!]{0,40}(apartament|apto|apê|ape\b|espaco|espaço|pequeno)|(apartament|apto)[^.?!]{0,40}(grande|gigante)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'Energia não é o mesmo que tamanho. Galgo e dogue alemão dormem quase o dia todo. Border collie e beagle em apartamento sem trabalho mental destroem a casa.',
      pratica: 'A pergunta certa não é quantos metros você tem, é quantos minutos e quanta cabeça você tem por dia.'
    },
    {
      id: 'filhote_melhor',
      crenca: 'Filhote é melhor que adulto',
      rx: /(filhote)[^.?!]{0,30}(ou|do que|em vez de|melhor que)[^.?!]{0,20}adulto|adulto[^.?!]{0,25}(ou|do que|em vez de)[^.?!]{0,20}filhote|(adulto|adotar adulto|cao adulto|cão adulto)[^.?!]{0,40}(dificil|difícil|vicio|vício|manha|problema|trauma|vale a pena)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'Adulto tem o temperamento já revelado — você vê o que está levando. Filhote é loteria: o comportamento adulto ainda não existe pra ser avaliado.',
      pratica: 'Se é o seu primeiro cão, adulto é o caminho de menor risco, não o de menor esforço.'
    },
    {
      id: 'alfa_matilha',
      crenca: 'Você precisa ser o alfa da matilha',
      rx: /(alfa|alpha|dominan|dominar|matilha|lider da casa|líder da casa|mostrar quem manda|impor respeito)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A teoria veio de lobos em cativeiro e foi refutada — o próprio pesquisador que a popularizou se retratou. Cão doméstico não organiza a casa como matilha, e método baseado em confronto aumenta agressividade.',
      pratica: 'Previsibilidade e reforço do que você quer que se repita funcionam melhor que confronto — e não custam a relação.'
    },
    {
      id: 'cara_de_culpa',
      crenca: 'Ele sabe que fez errado, olha a cara de culpado',
      rx: /(cara de culpa|culpad|sabe que fez|sabe que errou|faz de proposito|faz de propósito|pra me irritar|por vinganca|por vingança|birra)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A "cara de culpa" é resposta à sua repreensão, não consciência do ato. Aparece igual quando o cão não fez nada e mesmo assim é repreendido.',
      pratica: 'Brigar depois do fato não ensina — só ensina a ter medo de você chegando em casa.'
    },
    {
      id: 'castracao_cedo',
      crenca: 'Quanto mais cedo castrar, melhor',
      rx: /(castr|caster|neutra|esteriliz)[^.?!]{0,40}(cedo|idade|quando|meses|antes do cio|primeiro cio)|(quando|que idade|quantos meses|quanto tempo)[^.?!]{0,30}castr/i,
      veredito: 'contestado', evid: 'contestada',
      correcao: 'Em cães de porte grande há estudos associando castração precoce a maior risco ortopédico e a alguns tumores. Em fêmeas, castrar antes do primeiro cio reduz muito o risco de tumor mamário e elimina piometra. Não existe uma idade única certa.',
      pratica: 'Decisão por porte, sexo e contexto — com o seu veterinário. Desconfie de quem responde isso com um número só.'
    },
    {
      id: 'srd_saudavel',
      crenca: 'Vira-lata é mais saudável, não fica doente',
      rx: /(vira.?lata|srd|sem raca|sem raça|mestico|mestiço)[^.?!]{0,40}(saudavel|saudável|forte|nao fica doente|não fica doente|nao adoece|resistente)/i,
      veredito: 'meia_verdade', evid: 'moderada',
      correcao: 'Menor risco de doença hereditária ligada a linhagem fechada, sim. Zero proteção contra obesidade, doença periodontal, cardiopatia adquirida, verminose, parasita e acidente — que é o que mais aparece na clínica.',
      pratica: 'Vacina, antiparasitário e peso continuam valendo igual. Não existe cão que dispensa prevenção.'
    },
    {
      id: 'nariz_quente',
      crenca: 'Nariz quente e seco quer dizer febre',
      rx: /(nariz|focinho)[^.?!]{0,30}(quente|seco|frio|umido|úmido)|(febre)[^.?!]{0,30}(nariz|focinho)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A temperatura do focinho varia com sono, ambiente e hidratação. Não diz nada sobre febre.',
      pratica: 'Febre em cão se mede com termômetro. Sinal que importa é prostração, tremor, recusa de comida.'
    },
    {
      id: 'sete_anos',
      crenca: 'Um ano de cachorro equivale a sete anos humanos',
      rx: /(7|sete)\s*anos?[^.?!]{0,25}(human|pessoa|gente)|idade\s+(humana|em humano)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A curva não é linear. O primeiro ano concentra muito mais desenvolvimento que os sete da conta, e o envelhecimento depois varia bastante com o porte — cães grandes envelhecem mais rápido.',
      pratica: 'Porte muda quando começa a fase idosa: gigante por volta dos 6, pequeno mais perto dos 10.'
    },
    {
      id: 'grama_doente',
      crenca: 'Cachorro come grama porque está doente ou com falta de algo',
      rx: /(come|comendo|comeu)[^.?!]{0,20}(grama|capim|mato|planta)/i,
      veredito: 'mito', evid: 'moderada',
      correcao: 'Comer grama é comum em cães saudáveis e a maioria não vomita depois. Não é sinal confiável de doença nem de carência.',
      pratica: 'O que preocupa é o que veio junto: vômito repetido, apatia, perda de apetite. E cuidado com grama tratada com veneno.'
    },
    {
      id: 'osso_leite',
      crenca: 'Pode dar osso e leite que é natural',
      rx: /(osso|ossinho)[^.?!]{0,30}(cozido|frango|dar|pode)|(leite)[^.?!]{0,25}(dar|pode|vaca)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'Osso cozido estilhaça e perfura. Osso de frango é o pior caso. E a maioria dos cães adultos não digere lactose bem — leite costuma render diarreia.',
      pratica: 'Se quiser dar algo pra roer, mordedor próprio resolve sem risco de cirurgia de emergência.'
    },
    {
      id: 'racas_perigosas',
      crenca: 'Tem raça que é perigosa por natureza',
      rx: /(pitbull|pit bull|rottweiler|dobermann|doberman)[^.?!]{0,40}(perigos|agressiv|ataca|traicoeir|traiçoeir)|(raca|raça)[^.?!]{0,20}perigos/i,
      veredito: 'contestado', evid: 'contestada',
      correcao: 'Porte e força mudam a gravidade de um acidente — isso é real. Mas identificação visual de raça é notoriamente imprecisa, e legislação por raça tem eficácia mal sustentada na literatura. Manejo, socialização e contexto explicam mais que a etiqueta.',
      pratica: 'Avalie o cão à sua frente e o seu preparo pra conduzir aquele porte, não a etiqueta.'
    },
    {
      id: 'racao_cara',
      crenca: 'Ração cara é jogar dinheiro fora, cachorro come qualquer coisa',
      rx: /(racao|ração)[^.?!]{0,30}(cara|barata|premium|standard|vale a pena|diferenca|diferença)/i,
      veredito: 'meia_verdade', evid: 'moderada',
      correcao: 'Preço não é qualidade automática, mas a faixa econômica costuma ter mais enchimento e menos digestibilidade — o cão come mais, faz mais fezes e você economiza menos do que parece.',
      pratica: 'Compare custo por dia, não preço do saco. E olhe a fase: filhote e adulto têm exigências diferentes.'
    },
    {
      id: 'chocolate_pouco',
      crenca: 'Um pedacinho de chocolate não faz mal',
      rx: /(chocolate|uva|passa|cebola|alho|xilitol|adocante|adoçante|abacate|macadamia|macadâmia)[^.?!]{0,40}(pouco|pedacinho|pode|faz mal|problema|perigo)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A dose depende do peso do cão e do tipo — chocolate amargo é muito mais perigoso que ao leite. Uva e passa causam falência renal em quantidade imprevisível, e xilitol (em bala, chiclete e pasta de dente humana) é grave em quantidade mínima.',
      pratica: 'Ingeriu, não espere sintoma: ligue pro veterinário com o peso do cão e a quantidade em mãos.'
    },
    {
      id: 'nao_precisa_vermifugo',
      crenca: 'Cão que só fica em casa não precisa de vermífugo nem antipulga',
      rx: /(so fica em casa|só fica em casa|nao sai|não sai|apartament|dentro de casa)[^.?!]{0,40}(vermifug|vermífug|antipulga|carrapat|pulga|precis)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'Pulga sobe de elevador, entra em sacola e na barra da sua calça. Ovo de verme entra na sola do sapato. Cão de apartamento adoece com os dois.',
      pratica: 'O protocolo muda de intensidade conforme a exposição, mas não vira zero.'
    },
    {
      id: 'castrar_engorda',
      crenca: 'Castrar engorda e muda a personalidade',
      rx: /(castr)[^.?!]{0,35}(engorda|gordo|obes|muda|personalidade|fica trist|preguic|preguiç)/i,
      veredito: 'meia_verdade', evid: 'moderada',
      correcao: 'A necessidade calórica cai depois da castração — se a porção continuar igual, o cão engorda. Não é o procedimento, é a conta de comida que ficou errada. Personalidade não muda; alguns comportamentos ligados a hormônio, como marcação e fuga, tendem a reduzir.',
      pratica: 'Ajuste a porção após a castração e pese o cão a cada 2 ou 3 meses.'
    },
    {
      id: 'latido_manha',
      crenca: 'Se der atenção quando ele chora, vira manha',
      rx: /(chora|chorando|latindo|late|gane|gani)[^.?!]{0,40}(manha|mimad|acostuma|nao dar atencao|não dar atenção|ignorar|deixar chorar)/i,
      veredito: 'meia_verdade', evid: 'moderada',
      correcao: 'Filhote recém-chegado chorando à noite não está fazendo manha — está sozinho pela primeira vez na vida. Ignorar nessa fase costuma piorar. O cuidado com reforço acidental vale depois, com o cão já adaptado e para comportamentos de demanda.',
      pratica: 'Nas primeiras semanas, proximidade à noite acelera a adaptação. Depois, você reduz gradualmente.'
    },
    {
      id: 'socializar_depois',
      crenca: 'Socializar dá pra fazer depois, quando ele crescer',
      rx: /(socializ)[^.?!]{0,40}(depois|mais tarde|quando crescer|adulto|sem pressa)|(medo|assustad|reativ)[^.?!]{0,40}(passa|melhora)[^.?!]{0,20}(com o tempo|sozinho)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'A janela mais sensível vai de cerca de 3 a 14 semanas. Depois dela, ainda dá pra trabalhar — mas vira reabilitação, mais lenta e com teto mais baixo.',
      pratica: 'Nessa fase, quantidade e variedade de experiências positivas importam mais que treino formal.'
    },
    {
      id: 'pelo_curto_solta',
      crenca: 'Cão de pelo curto não solta pelo',
      rx: /(pelo curto|pelagem curta)[^.?!]{0,35}(solta|cai|nao solta|não solta|limpo)|(nao solta pelo|não solta pelo)/i,
      veredito: 'mito', evid: 'forte',
      correcao: 'Pelo curto costuma soltar bastante — e o pelo curto e duro gruda mais no sofá que o longo. Quem solta pouco são as pelagens que crescem contínuo e precisam de tosa, tipo poodle e shih tzu.',
      pratica: 'Se o problema é pelo em casa, olhe o tipo de pelagem, não o comprimento.'
    },
    {
      id: 'hipoalergenico',
      crenca: 'Existe cachorro hipoalergênico',
      rx: /(hipoalerg|nao da alergia|não dá alergia|alergia a (cachorro|cao|cão))/i,
      veredito: 'meia_verdade', evid: 'moderada',
      correcao: 'A alergia é a proteína da saliva e da pele, não o pelo. Raças que soltam menos espalham menos alérgeno pela casa, o que ajuda — mas nenhum cão é livre de alérgeno.',
      pratica: 'Antes de decidir, passe algumas horas com aquele cão específico. Reação varia muito por indivíduo.'
    }
  ];
  window.CRENCAS = CRENCAS;

  var LABEL = { mito: 'Boato', meia_verdade: 'Meia verdade', contestado: 'Em disputa', verdade: 'Procede' };
  var EVID = { forte: 'evidência forte', moderada: 'evidência moderada', contestada: 'ainda em disputa' };

  /* ===================== (a) DETECÇÃO POR TEXTO ===================== */
  function detectar(texto) {
    var t = String(texto || ''); if (t.length < 8) return [];
    var alvo = t + ' ' + semAcento(t);
    var out = [];
    for (var i = 0; i < CRENCAS.length && out.length < 2; i++) {
      try { if (CRENCAS[i].rx.test(alvo)) out.push(CRENCAS[i]); } catch (e) {}
    }
    return out;
  }
  window.nannyDetectarCrenca = detectar;

  /* ============== REGISTRO E REVISÃO (por comportamento) ============== */
  function reg(dog) { dog.crencas = dog.crencas || {}; return dog.crencas; }

  function marcarVisto(dog, id) {
    if (!dog) return;
    var r = reg(dog); r[id] = r[id] || {};
    if (!r[id].visto) r[id].visto = iso();
    r.__ultimo = iso();
    if (g('saveDogs')) window.saveDogs();
  }

  // Revisão = o tutor passou a FAZER o que não fazia. Nada de autodeclaração.
  function checarRevisoes(dog) {
    if (!dog || !dog.crencas) return;
    var mudou = false;
    CRENCAS.forEach(function (c) {
      if (!c.alvo) return;
      var r = dog.crencas[c.id];
      if (!r || !r.visto || r.revisado) return;
      var feito = dog.marcos && dog.marcos[c.alvo];
      if (feito && feito >= r.visto) { r.revisado = feito; mudou = true; track('crenca_revisada', { id: c.id }); }
    });
    if (mudou && g('saveDogs')) window.saveDogs();
  }

  window.nannyCrencaDispensar = function (id) {
    var dog = g('dogObj') ? window.dogObj() : null; if (!dog) return;
    var r = reg(dog); r[id] = r[id] || {}; r[id].dispensado = iso();
    if (g('saveDogs')) window.saveDogs();
    track('crenca_dispensada', { id: id });
    var el = document.getElementById('pn-crenca'); if (el) el.remove();
  };

  window.nannyCrencaExplicar = function (id) {
    var c = null; for (var i = 0; i < CRENCAS.length; i++) if (CRENCAS[i].id === id) c = CRENCAS[i];
    if (!c) return;
    track('crenca_explicar', { id: id });
    if (g('setTab')) window.setTab('hoje');
    var ta = document.getElementById('na-text-hoje') || document.getElementById('na-text-perfil');
    if (ta) {
      ta.value = 'Me explica melhor: ' + c.crenca.toLowerCase().replace(/^./, function (m) { return m.toLowerCase(); }) + '?';
      try { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      ta.focus();
    }
  };

  /* ================= (b) DETECÇÃO POR COMPORTAMENTO =================
   * Cada gatilho exige um SINAL — adiamento, repetição, contradição.
   * Nunca "o cão tem o atributo X, logo mostre o card X".
   */
  function gatilhos(dog) {
    var out = [], idade = null, diasCasa = null;
    try { if (g('ageInMonths')) idade = window.ageInMonths(dog); } catch (e) {}
    if (dog.chegada) { var d = dias(dog.chegada, iso()); if (d >= 0) diasCasa = d; }
    var marcos = dog.marcos || {};
    var pg = dog.perguntas || [];

    // 1. ADIAMENTO: em casa há 3+ semanas, filhote, e o primeiro passeio nunca aconteceu.
    if (diasCasa != null && diasCasa >= 21 && !marcos.passeio && idade != null && idade <= 6) {
      out.push({ id: 'passeio_vacina', motivo: 'a ' + (dog.nome || 'ele') + ' está há ' + diasCasa + ' dias com você e o primeiro passeio ainda não foi marcado' });
    }

    // 2. REPETIÇÃO: o mesmo tema voltou 2+ vezes nas conversas.
    var temas = [
      { rx: /medo|assustad|treme|se esconde|reativ|late.*estranho/i, id: 'socializar_depois' },
      { rx: /latin|chora|gane|sozinh|separac|separaç/i, id: 'latido_manha' },
      { rx: /destr[oó]i|roeu|mordeu (o|a) (sofa|sofá|movel|móvel|sapato)|bagunca|bagunça/i, id: 'raca_personalidade' },
      { rx: /puxa a guia|nao obedece|não obedece|teimos|manda em/i, id: 'alfa_matilha' },
      { rx: /engord|gordo|acima do peso|obes/i, id: 'castrar_engorda' }
    ];
    temas.forEach(function (t) {
      var n = 0;
      pg.forEach(function (p) { var s = (p && (p.texto || p.entendi)) || ''; if (t.rx.test(s)) n++; });
      if (n >= 2) out.push({ id: t.id, motivo: 'esse assunto já voltou ' + n + ' vezes nas suas conversas comigo' });
    });

    // 3. CONTRADIÇÃO: pediu calmo no quiz e escolheu uma raça de energia alta.
    try {
      var perfil = g('nannyTutorPerfil') ? window.nannyTutorPerfil() : null;
      var b = g('getBreed') ? window.getBreed(dog) : null;
      if (perfil && b && b.nrg >= 4 && perfil.quer_calmo) {
        out.push({ id: 'raca_personalidade', motivo: 'no quiz você priorizou um cão tranquilo, e essa é uma raça de energia alta' });
      }
    } catch (e) {}

    // 4. LACUNA DE PREVENÇÃO em cão que não sai — o boato clássico por trás disso.
    try {
      var h = dog.health || {};
      var semAnti = !(h.antiparasitario || []).length, semVerm = !(h.vermifugo || []).length;
      if ((semAnti || semVerm) && diasCasa != null && diasCasa >= 45) {
        out.push({ id: 'nao_precisa_vermifugo', motivo: 'não há registro de antipulga nem vermífugo aqui há um tempo' });
      }
    } catch (e) {}

    return out;
  }

  function escolher(dog) {
    if (!dog) return null;
    var r = dog.crencas || {};
    if (r.__ultimo && dias(r.__ultimo, iso()) < LIM_DIAS) return null;  // no máximo 1 por semana
    var cands = gatilhos(dog);
    for (var i = 0; i < cands.length; i++) {
      var st = r[cands[i].id];
      if (st && (st.dispensado || st.visto)) continue;   // já mostrou ou o tutor pediu pra parar
      for (var j = 0; j < CRENCAS.length; j++) if (CRENCAS[j].id === cands[i].id) return { c: CRENCAS[j], motivo: cands[i].motivo };
    }
    return null;
  }

  /* ============================ CARD ============================ */
  function card(dog) {
    checarRevisoes(dog);
    var pick = escolher(dog); if (!pick) return '';
    var c = pick.c;
    marcarVisto(dog, c.id);
    track('crenca_mostrada', { id: c.id });

    var tomEvid = c.evid === 'forte' ? 'var(--ct-green, #4a7c59)' : (c.evid === 'contestada' ? CT.mut : CT.accent);

    return '<div id="pn-crenca" class="card" style="margin-top:14px;border-color:' + CT.line + '">'
      + '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + CT.mut + ';margin-bottom:8px">'
      + 'Circulando por aí</div>'
      + '<div style="font-size:12.5px;color:' + CT.sec + ';line-height:1.5;margin-bottom:10px">Reparei que ' + esc(pick.motivo) + '. Costuma ter um boato por trás disso.</div>'
      + '<div style="font-size:15.5px;font-weight:600;color:' + CT.pri + ';line-height:1.4;margin-bottom:8px">&ldquo;' + esc(c.crenca) + '&rdquo;</div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px">'
      + '<span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;border:1px solid ' + CT.line + ';color:' + CT.pri + '">' + (LABEL[c.veredito] || 'Boato') + '</span>'
      + '<span style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid ' + CT.line + ';color:' + tomEvid + '">' + (EVID[c.evid] || '') + '</span>'
      + '</div>'
      + '<div style="font-size:13.5px;color:' + CT.pri + ';line-height:1.6;margin-bottom:10px">' + esc(c.correcao) + '</div>'
      + '<div style="font-size:13px;color:' + CT.sec + ';line-height:1.55;background:var(--warm, #f5efe6);border-radius:10px;padding:10px 12px;margin-bottom:12px">'
      + '<b style="color:' + CT.pri + '">Na prática:</b> ' + esc(c.pratica) + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" onclick="nannyCrencaExplicar(\'' + c.id + '\')" style="background:none;border:1.5px solid ' + CT.line + ';border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;color:' + CT.pri + ';cursor:pointer">Me explica melhor</button>'
      + '<button type="button" onclick="nannyCrencaDispensar(\'' + c.id + '\')" style="background:none;border:0;padding:9px 6px;font:inherit;font-size:13px;color:' + CT.mut + ';cursor:pointer">Entendi</button>'
      + '</div></div>';
  }
  window.nannyCrencaCard = card;

  /* =================== HOOK NO renderHoje (aditivo) =================== */
  function instalar() {
    if (window.__pnCrencaHook) return;
    var orig = window.renderHoje;
    if (typeof orig !== 'function') return;
    window.__pnCrencaHook = 1;
    window.renderHoje = function (dog) {
      var r; try { r = orig.apply(this, arguments); } catch (e) { r = null; }
      try {
        var d = dog || (g('dogObj') ? window.dogObj() : null);
        if (!d || d.aguardando) return r;
        var host = document.getElementById('tab-hoje'); if (!host) return r;
        var velho = document.getElementById('pn-crenca'); if (velho) velho.remove();
        var html = card(d);
        if (html) host.insertAdjacentHTML('beforeend', html);
      } catch (e) {}
      return r;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(instalar, 0); });
  else setTimeout(instalar, 0);

  /* ========== ENRIQUECEDOR DA CHAMADA À NANNY (registro compartilhado) ==========
   * O interceptor de fetch vive em UM lugar só (nanny-tutor.js instala o mesmo bloco).
   * Aqui só registramos o que queremos acrescentar ao corpo da requisição.
   */
  window.__pnAskEnrichers = window.__pnAskEnrichers || [];
  window.__pnAskEnrichers.push(function (body) {
    try {
      var hits = detectar(body && body.texto);
      if (!hits.length) return;
      body.crencas = hits.map(function (c) {
        return { crenca: c.crenca, veredito: c.veredito, evidencia: c.evid, correcao: c.correcao, na_pratica: c.pratica };
      });
      var dog = g('dogObj') ? window.dogObj() : null;
      if (dog) hits.forEach(function (c) { marcarVisto(dog, c.id); });
      track('crenca_detectada_texto', { id: hits[0].id });
    } catch (e) {}
  });
  instalarInterceptor();

  function instalarInterceptor() {
    if (window.__pnAskFetchHook) return;
    window.__pnAskFetchHook = 1;
    var orig = window.fetch;
    if (typeof orig !== 'function') return;
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (url.indexOf('/api/nanny-ask') >= 0 && init && init.body && typeof init.body === 'string') {
          var body = JSON.parse(init.body);
          (window.__pnAskEnrichers || []).forEach(function (fn) { try { fn(body); } catch (e) {} });
          init = Object.assign({}, init, { body: JSON.stringify(body) });
        }
      } catch (e) {}
      return orig.call(this, input, init);
    };
  }
})();
