/* casa-segura.js — PetNanny · preparação da casa (acolhimento)
 * ---------------------------------------------------------------------------
 * NÃO é uma lista de "tudo que pode dar errado". É o menor conjunto de itens
 * de alta consequência, filtrado pelo que já se sabe do cão. Item que não se
 * aplica não aparece — lista longa não é lida, e tutor novo já está ansioso.
 *
 * Entradas (todas já existem no produto):
 *   dog.pesoFaixa   '0'..'5'  → porte 1..5 via WRANGES
 *   dog.breedKey              → siz/nrg de breeds.js (porte adulto e energia)
 *   ageInMonths(dog)          → idade em meses
 *   dog.previsao / .aguardando→ modo pré-chegada
 *   moradia                   → resolvida aqui, de petnanny_tutor_perfil ou
 *                               petnanny_quiz_result. Valores do quiz:
 *                               sem_externo | externo_pequeno | externo_grande | sitio
 *
 * `evidencia` é honesta de propósito:
 *   alta  = consequência grave e bem documentada (queda, fuga, ingestão)
 *   media = consenso prático, sem literatura forte
 * Item de dose/toxicologia NÃO entra aqui. Isso é outro módulo e depende de
 * revisão veterinária.
 * --------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  var FASES = { PRE: 'pre', SEMANA1: 'semana1', CRESCENDO: 'crescendo' };

  // Valores reais do quiz (index.html, pergunta "moradia").
  var APTO    = ['sem_externo', 'externo_pequeno'];
  var EXTERNO = ['externo_grande', 'sitio'];

  function _ler(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }

  /* Resolve a moradia sem depender de nanny-tutor.js estar carregado:
   * 1) o que o tutor respondeu aqui no hub  2) perfil já construído
   * 3) resultado cru do quiz                4) null → a UI pergunta.  */
  function moradiaDe(dog) {
    if (dog && dog.moradia) return dog.moradia;
    var p = _ler('petnanny_tutor_perfil');
    if (p && p.moradia) return p.moradia;
    var q = _ler('petnanny_quiz_result');
    if (q && q.answers && q.answers.moradia) return q.answers.moradia;
    if (q && q.a && q.a.moradia) return q.a.moradia;
    return null;
  }

  var ITENS = [

    /* ── PRÉ-CHEGADA: o que só funciona se for feito ANTES ──────────── */
    {
      id: 'tela',
      fase: FASES.PRE, prio: 1, evidencia: 'alta',
      titulo: 'Tela em janelas e sacada',
      porque: 'Queda de altura é uma das causas mais banais de morte de filhote em apartamento — ' +
              'e a única da lista que não dá segunda chance. Cão não tem noção de borda.',
      acao: 'Tela de proteção (não mosquiteiro) em toda janela que abre e no vão da sacada. ' +
            'Se for alugado, existe modelo removível com fixação por tensão.',
      pergunta: 'As janelas e a sacada já estão com tela?',
      cond: { moradia: APTO }
    },
    {
      id: 'guarda_corpo',
      fase: FASES.PRE, prio: 1, evidencia: 'alta',
      titulo: 'Vão do guarda-corpo',
      porque: 'Filhote pequeno passa entre as barras de um guarda-corpo padrão. ' +
              'A tela resolve o vão de cima, não o de baixo.',
      acao: 'Fecha o vão inferior com rede de nylon ou policarbonato até o cão crescer.',
      pergunta: 'O vão embaixo do guarda-corpo está fechado?',
      cond: { moradia: APTO, idadeMaxMeses: 12, porteAdultoMax: 3 }
    },
    {
      id: 'plantas',
      fase: FASES.PRE, prio: 1, evidencia: 'alta',
      titulo: 'Plantas fora de alcance',
      porque: 'As listas que circulam no Brasil são traduzidas dos EUA e citam plantas que ' +
              'quase ninguém tem aqui, enquanto ignoram as que estão em toda sala brasileira.',
      acao: 'Retire ou eleve: comigo-ninguém-pode, tinhorão, antúrio, copo-de-leite, ' +
            'espirradeira, coroa-de-cristo, mamona, azaleia. Elevar só resolve se o cão adulto ' +
            'não alcançar — reavalie quando ele crescer.',
      pergunta: 'As plantas já estão fora do alcance dele?',
      cond: {}
    },
    {
      id: 'quimicos',
      fase: FASES.PRE, prio: 1, evidencia: 'alta',
      titulo: 'Produtos de limpeza e remédios em armário fechado',
      porque: 'Debaixo da pia é o pior lugar possível: é exatamente a altura do cão e ' +
              'costuma ser porta sem trava.',
      acao: 'Sobe tudo para armário alto ou põe trava infantil na porta de baixo. ' +
            'Vale para remédio humano também — bolsa e criado-mudo contam.',
      pergunta: 'Limpeza e remédios já estão trancados ou no alto?',
      cond: {}
    },
    {
      id: 'lixo',
      fase: FASES.PRE, prio: 2, evidencia: 'alta',
      titulo: 'Lixo com tampa e fora de alcance',
      porque: 'Osso cozido, gordura, embalagem, fio dental. É a fonte de emergência ' +
              'mais comum e a mais fácil de eliminar.',
      acao: 'Lixeira com tampa pesada ou dentro de armário. Cão de porte grande ' +
            'alcança bancada — a lixeira em cima da pia não resolve.',
      pergunta: 'O lixo está com tampa e fora do alcance?',
      cond: {}
    },
    {
      id: 'fios',
      fase: FASES.PRE, prio: 2, evidencia: 'alta',
      titulo: 'Fios e tomadas',
      porque: 'Entre 2 e 7 meses o filhote explora com a boca. Fio de carregador na ' +
              'tomada é choque e queimadura de língua.',
      acao: 'Espiral organizador nos fios acessíveis, protetor nas tomadas baixas, ' +
            'extensão fora do chão.',
      pergunta: 'Os fios ao alcance dele já estão protegidos?',
      cond: { idadeMaxMeses: 10 }
    },
    {
      id: 'fuga_porta',
      fase: FASES.PRE, prio: 1, evidencia: 'alta',
      titulo: 'Ponto de fuga na entrada',
      porque: 'A primeira semana é o pico de fuga: o cão ainda não tem vínculo com a casa ' +
              'e não sabe voltar. Adotado é o caso de maior risco.',
      acao: 'Portãozinho ou uma porta interna fechada criando duas barreiras entre ele ' +
            'e a rua. Confere vão embaixo do portão e frestas na cerca.',
      pergunta: 'Tem duas barreiras entre ele e a rua?',
      cond: {}
    },
    {
      id: 'piscina',
      fase: FASES.PRE, prio: 1, evidencia: 'alta',
      titulo: 'Piscina',
      porque: 'Cachorro cai e não acha a escada. Nada em pânico pela borda até cansar. ' +
              'Saber nadar não protege — achar a saída é que protege.',
      acao: 'Cerca ou capa rígida. Se ficar aberta, ensina a rota de saída repetindo ' +
            'da água até a escada.',
      pergunta: 'A piscina está cercada ou coberta?',
      cond: { moradia: EXTERNO }
    },
    {
      id: 'cantinho',
      fase: FASES.PRE, prio: 2, evidencia: 'media',
      titulo: 'Um lugar só dele',
      porque: 'Nos primeiros dias o cão precisa de um ponto de recuo. Não é mimo: ' +
              'reduz estresse de transição e dá para onde mandá-lo quando a casa está cheia.',
      acao: 'Canto de parede, longe de porta e corredor, com cama e água. ' +
            'Regra da casa: ali ninguém mexe com ele, nem criança.',
      pergunta: 'Ele já tem um canto de descanso definido?',
      cond: {}
    },

    /* ── PRIMEIRA SEMANA ─────────────────────────────────────────────── */
    {
      id: 'identificacao',
      fase: FASES.SEMANA1, prio: 1, evidencia: 'alta',
      titulo: 'Plaquinha com telefone, hoje',
      porque: 'Microchip só funciona se alguém levar o cão a um lugar com leitor. ' +
              'A plaquinha funciona com o vizinho que o achou na esquina.',
      acao: 'Plaquinha na coleira com seu telefone — antes do microchip, que pode esperar ' +
            'a próxima consulta. Coleira fica mesmo dentro de casa na primeira semana.',
      pergunta: 'Ele já está com plaquinha e telefone na coleira?',
      cond: {}
    },
    {
      id: 'plasticos',
      fase: FASES.SEMANA1, prio: 2, evidencia: 'alta',
      titulo: 'Sacos e embalagens',
      porque: 'Saco plástico e embalagem de salgadinho causam sufocamento — o cão enfia ' +
              'a cabeça, o saco cola e ele não consegue tirar. Acontece em silêncio.',
      acao: 'Sacola e embalagem em gaveta fechada, nunca no chão nem pendurada baixo.',
      pergunta: 'Sacolas e embalagens estão guardadas?',
      cond: {}
    },
    {
      id: 'escada',
      fase: FASES.SEMANA1, prio: 2, evidencia: 'media',
      titulo: 'Escada',
      porque: 'Subir e descer escada em filhote de placa de crescimento aberta, e em cão de ' +
              'corpo longo em qualquer idade, é carga repetida em articulação e coluna.',
      acao: 'Portãozinho no topo e na base nos primeiros meses. Cão de corpo longo: ' +
            'carrega no colo ou instala rampa.',
      pergunta: 'A escada está bloqueada ou tem rampa?',
      cond: { ouCorpoLongo: true, idadeMaxMeses: 12 }
    },

    /* ── CONFORME CRESCE ─────────────────────────────────────────────── */
    {
      id: 'realcance',
      fase: FASES.CRESCENDO, prio: 1, evidencia: 'alta',
      titulo: 'Refazer a volta na casa — ele cresceu',
      porque: 'Quase toda casa é preparada uma vez e nunca revista. Um cão que vai a 30 kg ' +
              'passa a limpar a bancada, abrir armário de baixo e alcançar a mesa.',
      acao: 'Anda pela casa na altura do focinho dele hoje, não na de quando chegou. ' +
            'Bancada, mesa de centro, pia, churrasqueira.',
      pergunta: 'Já refez a volta na casa com a altura dele agora?',
      cond: { porteAdultoMin: 3 }
    },
    {
      id: 'tedio',
      fase: FASES.CRESCENDO, prio: 2, evidencia: 'media',
      titulo: 'Destruição é tédio, não teimosia',
      porque: 'Cão de energia alta sem gasto mental destrói. Isso não é falha de caráter e ' +
              'não se resolve com bronca — e é uma das causas mais comuns de devolução.',
      acao: 'Comedouro interativo no lugar da vasilha, cinco minutos de faro por dia, ' +
            'passeio com cheiro em vez de só distância.',
      pergunta: 'Ele tem alguma atividade mental no dia a dia?',
      cond: { energiaMin: 4 }
    },
    {
      id: 'veneno_vizinho',
      fase: FASES.CRESCENDO, prio: 2, evidencia: 'media',
      titulo: 'O que entra pelo muro',
      porque: 'Raticida e isca de vizinho aparecem no quintal sem aviso. ' +
              'Raticida anticoagulante tem janela de horas antes do sinal aparecer.',
      acao: 'Confere o quintal antes de soltar. Sabendo que houve dedetização por perto, ' +
            'evita o quintal por alguns dias.',
      pergunta: 'Você confere o quintal antes de soltar ele?',
      cond: { moradia: EXTERNO }
    }
  ];

  /* ── AVALIAÇÃO ────────────────────────────────────────────────────── */

  var CORPO_LONGO = ['dachshund', 'basset', 'basset_hound', 'corgi', 'pembroke', 'cardigan',
                     'teckel', 'salsicha', 'shih_tzu', 'lhasa_apso', 'pequines'];

  function porteAdulto(dog, breed) {
    if (breed && breed.siz) return breed.siz;                 // 1..5 de breeds.js
    var W = { '0': 1, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
    return W[String(dog && dog.pesoFaixa)] || null;           // null = desconhecido
  }

  function energia(breed) { return (breed && breed.nrg) || null; }

  function corpoLongo(dog, breed) {
    var k = String((dog && dog.breedKey) || '').toLowerCase();
    for (var i = 0; i < CORPO_LONGO.length; i++) if (k.indexOf(CORPO_LONGO[i]) !== -1) return true;
    return false;
  }

  // Regra de ouro: condição desconhecida NÃO esconde item de alta consequência.
  // Na dúvida, mostra. Errar mostrando um item a mais é barato; esconder tela
  // de janela porque a moradia não foi preenchida, não é.
  function aplica(item, ctx) {
    var c = item.cond || {};

    if (c.moradia) {
      if (ctx.moradia && c.moradia.indexOf(ctx.moradia) === -1) return false;
      if (!ctx.moradia && item.prio > 1) return false;         // desconhecido: só prio 1
    }
    if (c.idadeMaxMeses != null && ctx.idadeMeses != null && ctx.idadeMeses > c.idadeMaxMeses) {
      if (!c.ouCorpoLongo || !ctx.corpoLongo) return false;
    }
    if (c.porteAdultoMin != null && ctx.porteAdulto != null && ctx.porteAdulto < c.porteAdultoMin) return false;
    if (c.porteAdultoMax != null && ctx.porteAdulto != null && ctx.porteAdulto > c.porteAdultoMax) return false;
    if (c.energiaMin != null) {
      if (ctx.energia == null) return false;                   // sem dado, não chuta
      if (ctx.energia < c.energiaMin) return false;
    }
    return true;
  }

  /**
   * @param {Object} dog
   * @param {Object} opts { breed, moradia, idadeMeses, fase, max }
   * @return {Array} itens já filtrados e ordenados
   */
  function itensPara(dog, opts) {
    opts = opts || {};
    var breed = opts.breed || null;
    var ctx = {
      moradia: opts.moradia || moradiaDe(dog),
      idadeMeses: (opts.idadeMeses != null ? opts.idadeMeses : null),
      porteAdulto: porteAdulto(dog, breed),
      energia: energia(breed),
      corpoLongo: corpoLongo(dog, breed)
    };

    var fase = opts.fase || faseDe(dog, ctx.idadeMeses);

    // Fases são CUMULATIVAS. Quem cadastra o cão depois que ele já chegou —
    // o caso mais comum em adoção — perderia justamente os itens de pré-chegada,
    // que são os de maior consequência. Item de fase anterior só sai da lista
    // quando é respondido.
    var ORDEM = [FASES.PRE, FASES.SEMANA1, FASES.CRESCENDO];
    var ate = ORDEM.indexOf(fase);
    var respondidos = (dog && dog.casaSegura) || {};

    var out = ITENS.filter(function (it) {
      var i = ORDEM.indexOf(it.fase);
      if (i > ate) return false;                       // fase futura, ainda não
      if (i < ate && respondidos[it.id]) return false; // atrasado mas já resolvido
      return aplica(it, ctx);
    });

    // Item que só passou porque falta informação é marcado, pra UI perguntar
    // em vez de afirmar ("Você tem piscina?" e não "Cerque a piscina").
    out.forEach(function (it) {
      it._incerto = !!(it.cond && it.cond.moradia && !ctx.moradia);
    });

    var teto = opts.max || 6;
    var porPrio = function (a, b) { return a.prio - b.prio; };
    var atrasados = out.filter(function (it) { return ORDEM.indexOf(it.fase) < ate; }).sort(porPrio);
    var atuais    = out.filter(function (it) { return ORDEM.indexOf(it.fase) === ate; }).sort(porPrio);

    // Backlog não pode engolir a fase atual: quem nunca respondeu nada ficaria
    // preso em pré-chegada para sempre e nunca veria o conteúdo do momento dele.
    var maxAtrasados = Math.min(atrasados.length, Math.max(2, teto - atuais.length));
    return atrasados.slice(0, maxAtrasados).concat(atuais).slice(0, teto);
  }

  function faseDe(dog, idadeMeses) {
    if (dog && (dog.aguardando || dog.previsao)) return FASES.PRE;
    if (!dog || !dog.chegada) return FASES.PRE;
    var dias = Math.floor((Date.now() - new Date(dog.chegada + 'T00:00:00')) / 86400000);
    if (dias <= 10) return FASES.SEMANA1;
    return FASES.CRESCENDO;
  }

  /** Estado por cão: { itemId: 'sim'|'ainda_nao', ... } — vive no próprio dog */
  function marcar(dog, itemId, resposta) {
    if (!dog) return dog;
    dog.casaSegura = dog.casaSegura || {};
    dog.casaSegura[itemId] = { r: resposta, at: new Date().toISOString().slice(0, 10) };
    return dog;
  }

  /**
   * Sinal de preparo: 0..1 sobre os itens QUE SE APLICAM a este cão.
   * Serve como proxy medido de prontidão — melhor que autorrelato no D+180.
   * Retorna null enquanto não houver resposta suficiente pra significar algo.
   */
  function indicePreparo(dog, opts) {
    var todas = [FASES.PRE, FASES.SEMANA1, FASES.CRESCENDO].reduce(function (acc, f) {
      var o = {}; for (var k in (opts || {})) o[k] = opts[k];
      o.fase = f; o.max = 99;
      return acc.concat(itensPara(dog, o));
    }, []);
    if (!todas.length) return null;

    var st = (dog && dog.casaSegura) || {};
    var respondidos = 0, sim = 0;
    todas.forEach(function (it) {
      if (st[it.id]) { respondidos++; if (st[it.id].r === 'sim') sim++; }
    });
    if (respondidos < 3) return null;
    return { indice: sim / todas.length, respondidos: respondidos, total: todas.length };
  }

  global.CasaSegura = {
    FASES: FASES, ITENS: ITENS,
    itensPara: itensPara, faseDe: faseDe, moradiaDe: moradiaDe,
    APTO: APTO, EXTERNO: EXTERNO,
    marcar: marcar, indicePreparo: indicePreparo
  };

})(typeof window !== 'undefined' ? window : this);
