/* nanny-tutor.js — O PERFIL DO TUTOR ATRAVESSA O PRODUTO — v1
 * <script src="nanny-tutor.js"></script> no meu-cao.html (qualquer posição depois do breeds.js).
 *
 * O PROBLEMA QUE ISSO RESOLVE:
 *   O quiz coleta moradia, rotina, horas fora, experiência, crianças, outros animais, alergia,
 *   orçamento, atividade e um vetor de utilidade do conjoint. Depois disso, o hub pede tudo de
 *   novo e o `contexto_cao` mandado pra Nanny tem raça, idade, sexo, condições — e ZERO sobre
 *   quem é a pessoa. A Nanny responde igual pra um tutor de primeiro cão, apartamento, 10h fora,
 *   com criança pequena, e pra um tutor experiente com quintal. Não deveria.
 *
 * O QUE FAZ:
 *   1. Lê `petnanny_quiz_result` (gravado pelo index.html) e normaliza num perfil compacto.
 *   2. Persiste em `petnanny_tutor_perfil` — sobrevive à limpeza do resultado do quiz.
 *   3. Injeta `perfil_tutor` em toda chamada a /api/nanny-ask, sem tocar no nanny-ask-ui.js.
 *   4. Expõe sugestões de pré-preenchimento pro cadastro (window.nannyTutorSugestoes).
 *
 * PRIVACIDADE: nada aqui sai do aparelho além do que já ia pra API da Nanny. Não há dado novo
 * sendo coletado — é dado que a pessoa já deu, deixando de ser desperdiçado.
 */
(function () {
  var K_QUIZ = 'petnanny_quiz_result', K_PERFIL = 'petnanny_tutor_perfil';

  function ler(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function g(fn) { return (typeof window[fn] === 'function') ? window[fn] : null; }

  /* ---------- dicionários: chave crua do quiz -> frase pra IA ---------- */
  var MORADIA = {
    apartamento_pequeno: 'apartamento pequeno, sem área externa',
    apartamento: 'apartamento',
    apartamento_grande: 'apartamento grande',
    casa_sem_quintal: 'casa sem quintal',
    casa_quintal_pequeno: 'casa com quintal pequeno',
    casa_quintal: 'casa com quintal',
    casa_quintal_grande: 'casa com quintal grande',
    sitio: 'sítio ou chácara'
  };
  var EXPERIENCIA = {
    primeiro_cao: 'primeiro cão da vida',
    ja_tive: 'já teve cão antes',
    tenho_cao: 'já tem ou já teve outros cães',
    experiente: 'tutor experiente'
  };
  var ATIVIDADE = {
    sedentario: 'rotina sedentária',
    moderado: 'rotina moderadamente ativa',
    ativo: 'rotina ativa',
    muito_ativo: 'rotina muito ativa'
  };
  var CRIANCAS = {
    sem_criancas: 'sem crianças em casa',
    planeja_criancas: 'planeja ter filhos',
    criancas: 'tem crianças em casa',
    criancas_pequenas: 'tem criança pequena em casa'
  };
  var TEMPO = {
    integral: 'fica em casa a maior parte do dia',
    meio_periodo: 'fora de casa meio período',
    fora_dia: 'fora de casa o dia inteiro',
    viaja: 'viaja com frequência'
  };

  function frase(mapa, v) { if (!v) return null; return mapa[v] || null; }
  function lista(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

  /* --------------------------- construção --------------------------- */
  function construir() {
    var q = ler(K_QUIZ);
    var salvo = ler(K_PERFIL);
    if (!q && salvo) return salvo;
    if (!q) return null;

    var a = q.quizAnswers || {};
    var pt = q.perfilTutor || {};
    var cj = q.conjoint || {};

    // Prioridades vêm do vetor de utilidade do conjoint (escolha revelada), não do declarado.
    var prioridades = [];
    var quer_calmo = false, aceita_pelo = true, quer_pequeno = false;
    try {
      var u = cj.utility || {};
      var pares = Object.keys(u).map(function (k) { return { k: k, v: Number(u[k]) || 0 }; })
        .sort(function (x, y) { return Math.abs(y.v) - Math.abs(x.v); });
      prioridades = pares.slice(0, 3).map(function (p) { return p.k + (p.v < 0 ? ' (evita)' : ''); });
      if ((u.nrg != null && Number(u.nrg) < 0) || a.energia_imaginada === 'imag_calmo' || a.atividade === 'sedentario') quer_calmo = true;
      if (u.grm != null && Number(u.grm) < 0) aceita_pelo = false;
      if ((u.siz != null && Number(u.siz) < 0) || a.porte_imaginado === 'imag_pequeno') quer_pequeno = true;
    } catch (e) {}

    var contexto = [];
    [frase(MORADIA, a.moradia), frase(EXPERIENCIA, a.experiencia), frase(TEMPO, a.tempo_casa || a.rotina),
     frase(ATIVIDADE, a.atividade), frase(CRIANCAS, a.criancas)].forEach(function (f) { if (f) contexto.push(f); });

    var animais = lista(a.animais).filter(function (x) { return x && x !== 'nenhum'; });
    if (animais.length) contexto.push('convive com ' + animais.join(' e ') + ' em casa');
    if (a.alergia === 'alergia') contexto.push('alguém na casa tem alergia');
    if (a.necessidade_especial && a.necessidade_especial !== 'nao') contexto.push('há alguém com necessidade especial na casa');

    var perfil = {
      v: 1,
      em: new Date().toISOString().slice(0, 10),
      arquetipo: pt.arquetipo_id || (cj.archetype || null),
      origem_pretendida: a.origem || null,           // 'adotar' | 'comprar' | ...
      experiencia: a.experiencia || null,
      moradia: a.moradia || null,
      contexto: contexto,                             // frases prontas pra IA
      prioridades: prioridades,                       // do conjoint, não do declarado
      alertas: (pt.alertas || []).slice(0, 4),
      quer_calmo: quer_calmo,
      quer_pequeno: quer_pequeno,
      aceita_pelo: aceita_pelo,
      orcamento: a.orcamento || null,
      racas_sugeridas: (q.results || []).slice(0, 3).map(function (r) { return r.name; }),
      raca_desejada: (q.freeform && q.freeform.desiredBreed) || null
    };
    gravar(K_PERFIL, perfil);
    return perfil;
  }

  var _cache = null;
  window.nannyTutorPerfil = function (forcar) {
    if (_cache && !forcar) return _cache;
    try { _cache = construir(); } catch (e) { _cache = null; }
    return _cache;
  };

  /* ------------- sugestões de pré-preenchimento do cadastro -------------
   * Não preenche sozinho (o cão real pode não ser nenhum dos sugeridos).
   * Devolve o que o formulário PODE oferecer como padrão.
   */
  window.nannyTutorSugestoes = function () {
    var p = window.nannyTutorPerfil(); if (!p) return null;
    return {
      origem: p.origem_pretendida === 'adotar' ? 'adotado' : null,
      breedKeys: (ler(K_QUIZ) && (ler(K_QUIZ).results || []).slice(0, 3).map(function (r) { return r.key; })) || [],
      porte_provavel: p.quer_pequeno ? 'pequeno' : null
    };
  };

  /* ---------- versão compacta pro prompt (sem PII, sem texto livre) ---------- */
  function paraPrompt() {
    var p = window.nannyTutorPerfil(); if (!p) return null;
    var out = {};
    if (p.contexto && p.contexto.length) out.contexto_da_casa = p.contexto;
    if (p.experiencia) out.experiencia = EXPERIENCIA[p.experiencia] || p.experiencia;
    if (p.prioridades && p.prioridades.length) out.prioridades_reveladas = p.prioridades;
    if (p.alertas && p.alertas.length) out.alertas_do_quiz = p.alertas;
    if (p.origem_pretendida) out.origem_pretendida = p.origem_pretendida;
    return Object.keys(out).length ? out : null;
  }

  /* ---------- registro compartilhado do enriquecedor (idempotente) ---------- */
  window.__pnAskEnrichers = window.__pnAskEnrichers || [];
  window.__pnAskEnrichers.push(function (body) {
    try { var p = paraPrompt(); if (p) body.perfil_tutor = p; } catch (e) {}
  });

  if (!window.__pnAskFetchHook) {
    window.__pnAskFetchHook = 1;
    var orig = window.fetch;
    if (typeof orig === 'function') {
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
  }

  try { window.nannyTutorPerfil(); } catch (e) {}
})();
