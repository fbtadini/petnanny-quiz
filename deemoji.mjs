#!/usr/bin/env node
/* deemoji.mjs — troca emoji por ícones Lucide no repo do PetNanny.
 *
 * POR QUE: emoji é bitmap renderizado pelo sistema operacional — você não controla cor,
 * forma nem alinhamento, e ele muda entre iPhone, Android e Windows. Ícone de traço é SVG
 * de uma cor só que herda `currentColor`, então acompanha o dark mode que você já tem,
 * de graça. É o único elemento visual puxando a identidade (cream/marrom/#e8733a,
 * Playfair + DM Sans) pra baixo.
 *
 * USO:
 *   node deemoji.mjs                 # relatório, não escreve nada
 *   node deemoji.mjs --apply         # aplica (cria .bak de cada arquivo tocado)
 *   node deemoji.mjs --apply --only=breeds.js,gear.js
 *
 * ANTES DE RODAR COM --apply: commit tudo. O script cria .bak, mas commit é commit.
 *
 * DEPOIS DE APLICAR, adicione uma vez no <head> de index.html e meu-cao.html:
 *   <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
 * E ao final de cada render que injeta HTML via innerHTML:
 *   if (window.lucide) lucide.createIcons();
 * (o hub já re-renderiza bastante; chamar no fim do renderProfile/renderHoje cobre quase tudo)
 */
import fs from 'node:fs';
import path from 'node:path';

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const ONLY = (ARGS.find(a => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);

/* ---------------------------------------------------------------------------
 * MAPA. Três destinos possíveis:
 *   'icon:<nome>'  -> vira <i data-lucide="nome"></i>
 *   'txt:<coisa>'  -> vira texto/entidade (setas, check, x — tipografia, não ícone)
 *   'drop'         -> some (decoração que não carrega informação)
 * ------------------------------------------------------------------------- */
const MAP = {
  // --- tipografia: não são ícones, são caracteres. Entidade é mais leve e não precisa de JS.
  '→': 'txt:&rarr;', '←': 'txt:&larr;', '↑': 'txt:&uarr;', '↓': 'txt:&darr;',
  '⇒': 'txt:&rArr;', '✓': 'txt:&#10003;', '✔': 'txt:&#10003;', '✕': 'txt:&times;', '✖': 'txt:&times;',
  '★': 'txt:&#9733;', '☆': 'txt:&#9734;', '·': 'txt:·',

  // --- estado e alerta
  '⚠': 'icon:alert-triangle', '⚠️': 'icon:alert-triangle',
  '✅': 'icon:check-circle-2', '❌': 'icon:x-circle', '❓': 'icon:help-circle',
  '🔒': 'icon:lock', '🔓': 'icon:lock-open', '🔔': 'icon:bell', '🔕': 'icon:bell-off',
  '⏳': 'icon:hourglass', '⏩': 'icon:fast-forward', '🔁': 'icon:repeat', '↺': 'icon:rotate-ccw',

  // --- saúde e cuidado
  '💉': 'icon:syringe', '🩺': 'icon:stethoscope', '🌡': 'icon:thermometer', '🌡️': 'icon:thermometer',
  '💊': 'icon:pill', '🦴': 'icon:bone', '⚖': 'icon:scale', '⚖️': 'icon:scale',
  '🛡': 'icon:shield', '🛡️': 'icon:shield', '🧬': 'icon:dna',

  // --- rotina e objetos
  '🍽': 'icon:utensils', '🍽️': 'icon:utensils', '🍖': 'icon:beef', '🌭': 'icon:beef',
  '🛏': 'icon:bed-double', '🛏️': 'icon:bed-double', '🏠': 'icon:home', '🏡': 'icon:home',
  '🦮': 'icon:dog', '🐾': 'icon:paw-print', '🏷': 'icon:tag', '🏷️': 'icon:tag',
  '🚗': 'icon:car', '🧻': 'icon:scroll', '🪮': 'icon:brush', '🦷': 'icon:smile',
  '🛗': 'icon:move-up-right', '🧩': 'icon:puzzle', '🛒': 'icon:shopping-cart',
  '📷': 'icon:camera', '📁': 'icon:folder', '📝': 'icon:pencil', '✎': 'icon:pencil',
  '📋': 'icon:clipboard-list', '📅': 'icon:calendar', '📤': 'icon:share-2', '📥': 'icon:download',
  '🔍': 'icon:search', '💡': 'icon:lightbulb', '🎓': 'icon:graduation-cap', '🎉': 'icon:party-popper',
  '🌤': 'icon:cloud-sun', '🌤️': 'icon:cloud-sun', '☁': 'icon:cloud', '☁️': 'icon:cloud',
  '⚡': 'icon:zap', '💨': 'icon:wind', '🌙': 'icon:moon', '🧭': 'icon:compass',
  '💚': 'icon:heart', '🧡': 'icon:heart', '💛': 'icon:heart', '🤍': 'icon:heart', '❤': 'icon:heart',
  '👍': 'icon:thumbs-up', '👎': 'icon:thumbs-down',

  // --- decoração de raça e reações: informação zero, ruído visual alto.
  //     No breeds.js o campo `emoji` deve ser removido do schema, não substituído por ícone:
  //     um ícone genérico de cachorro em 67 raças é pior que nada. O lugar disso é foto.
  '🐕': 'drop', '🐶': 'drop', '🐩': 'drop', '🦺': 'drop', '🦊': 'drop', '🐺': 'drop',
  '🦁': 'drop', '🐻': 'drop', '🦋': 'drop', '🥊': 'drop', '🎂': 'drop',
  '😐': 'drop', '🤔': 'drop', '😤': 'drop', '😮': 'drop',

  // --- segunda passada (achados da varredura no repo)
  '🔖': 'icon:bookmark', '🏆': 'icon:trophy', '🥇': 'icon:medal', '🥈': 'icon:medal', '🥉': 'icon:medal',
  '📖': 'icon:book-open', '📚': 'icon:library', '📜': 'icon:scroll', '📄': 'icon:file-text',
  '📦': 'icon:package', '📎': 'icon:paperclip', '💾': 'icon:save', '📸': 'icon:camera',
  '🔬': 'icon:microscope', '⚕': 'icon:cross', '⚕️': 'icon:cross', '🏥': 'icon:building-2',
  '🦵': 'icon:bone', '👂': 'icon:ear', '👁': 'icon:eye', '👁️': 'icon:eye', '👀': 'icon:eye',
  '🥣': 'icon:soup', '🍼': 'icon:baby-bottle', '🚽': 'icon:toilet', '🧴': 'icon:droplet',
  '🚿': 'icon:shower-head', '✂': 'icon:scissors', '✂️': 'icon:scissors', '📏': 'icon:ruler',
  '🛋': 'icon:sofa', '🛋️': 'icon:sofa', '🚶': 'icon:footprints', '🏃': 'icon:footprints',
  '💰': 'icon:wallet', '💵': 'icon:banknote', '💎': 'icon:gem', '🎯': 'icon:target',
  '🕐': 'icon:clock', '🗓': 'icon:calendar-days', '🗓️': 'icon:calendar-days',
  '🔊': 'icon:volume-2', '🎤': 'icon:mic', '🚨': 'icon:siren', '🚩': 'icon:flag',
  '🚫': 'icon:ban', '🙅': 'icon:ban', '🤝': 'icon:handshake', '👋': 'icon:hand',
  '🌿': 'icon:leaf', '🌱': 'icon:sprout', '🌾': 'icon:wheat', '🌲': 'icon:trees',
  '❄': 'icon:snowflake', '❄️': 'icon:snowflake', '☀': 'icon:sun', '☀️': 'icon:sun',
  '☔': 'icon:umbrella', '🌬': 'icon:wind', '🎾': 'icon:circle-dot',
  '🏢': 'icon:building', '🏘': 'icon:houses', '🧥': 'icon:shirt',
  '💭': 'icon:message-circle', '🔮': 'icon:sparkles', '✨': 'icon:sparkles', '✦': 'txt:&#10022;',
  '➕': 'txt:+', '⬇': 'txt:&darr;', '↕': 'txt:&#8597;', '↩': 'txt:&crarr;',
  '🔄': 'icon:refresh-cw', '↻': 'icon:rotate-cw', '↶': 'icon:rotate-ccw',
  '🔎': 'icon:search', '✍': 'icon:pencil', '🟢': 'icon:circle',
  // pessoas e outros bichos: decoração
  '👶': 'drop', '🧒': 'drop', '👦': 'drop', '👤': 'drop', '🧓': 'drop', '🤷': 'drop',
  '🙂': 'drop', '😔': 'drop', '😨': 'drop', '🎎': 'drop', '🎆': 'drop',
  '🐱': 'drop', '🐈': 'drop', '😺': 'drop', '😾': 'drop', '🐰': 'drop', '🐦': 'drop',
  '🐹': 'drop', '🕷': 'drop'
};

const RX_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;

function alvo(dir) {
  return fs.readdirSync(dir)
    .filter(f => /\.(js|gs|html|json)$/.test(f))
    .filter(f => !f.endsWith('.bak'))
    .filter(f => !ONLY.length || ONLY.includes(f));
}

function trocar(txt, arquivo) {
  let n = 0;
  // breeds.js: o campo `emoji` é DADO, não marcação. Um ícone genérico de cachorro repetido
  // em 67 raças é pior que nada — o lugar disso é foto da raça. Some o campo inteiro.
  if (arquivo === 'breeds.js') {
    const antes = txt.length;
    txt = txt.replace(/,?\s*emoji\s*:\s*(["'])(?:(?!\1).)*\1\s*,?/g, (m) => (m.trim().startsWith(',') && m.trim().endsWith(',')) ? ',' : '');
    if (txt.length !== antes) n += 67;
  }
  const naoMapeado = new Map();
  // ordena por comprimento pra casar '⚠️' (com variation selector) antes de '⚠'
  const chaves = Object.keys(MAP).sort((a, b) => b.length - a.length);
  for (const k of chaves) {
    const destino = MAP[k];
    const partes = txt.split(k);
    if (partes.length === 1) continue;
    n += partes.length - 1;
    let sub;
    if (destino === 'drop') sub = '';
    else if (destino.startsWith('txt:')) sub = destino.slice(4);
    // ATRIBUTO SEM ASPAS, de propósito: o emoji costuma estar DENTRO de uma string JS
    // (`emoji:"🐾"`, `'🩺 Vacina'`). Aspas na marcação quebrariam a string. HTML5 aceita
    // valor de atributo sem aspas quando não há espaço — que é o caso aqui, sempre.
    else sub = `<i data-lucide=${destino.slice(5)} aria-hidden=true></i>`;
    txt = partes.join(sub);
  }
  // limpa espaço duplo e espaço antes de pontuação que o drop deixa pra trás
  txt = txt.replace(/ {2,}/g, ' ').replace(/(["'>]) +([,.;:])/g, '$1$2');
  for (const m of txt.match(RX_EMOJI) || []) {
    if (m === '\uFE0F' || m === '\u200D') continue;
    naoMapeado.set(m, (naoMapeado.get(m) || 0) + 1);
  }
  return { txt, n, naoMapeado };
}

const dir = process.cwd();
const arquivos = alvo(dir);
let total = 0;
const pendentes = new Map();
const linhas = [];

for (const f of arquivos) {
  const p = path.join(dir, f);
  let orig;
  try { orig = fs.readFileSync(p, 'utf8'); } catch { continue; }
  const { txt, n, naoMapeado } = trocar(orig, f);
  if (!n && !naoMapeado.size) continue;
  total += n;
  for (const [k, v] of naoMapeado) pendentes.set(k, (pendentes.get(k) || 0) + v);
  linhas.push(`  ${f.padEnd(28)} ${String(n).padStart(4)} trocas` + (naoMapeado.size ? `  · ${naoMapeado.size} sem mapa` : ''));
  if (APPLY && n) {
    fs.writeFileSync(p + '.bak', orig);
    fs.writeFileSync(p, txt);
  }
}

console.log(`\n${APPLY ? 'APLICADO' : 'SIMULACAO (nada foi escrito)'} — ${arquivos.length} arquivos varridos\n`);
console.log(linhas.join('\n') || '  nenhum emoji encontrado');
console.log(`\n  total: ${total} trocas`);
if (pendentes.size) {
  console.log(`\n  SEM MAPA (${pendentes.size}) — decida um a um antes de rodar de novo:`);
  console.log('  ' + [...pendentes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}
if (!APPLY) console.log('\n  rode com --apply pra escrever (gera .bak de cada arquivo tocado)\n');
else console.log('\n  .bak criado ao lado de cada arquivo. Confira no navegador antes de commitar.\n');
