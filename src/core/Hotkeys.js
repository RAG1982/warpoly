/**
 * Hotkeys.js (F3-01) — resolução pura de teclas em ações (sem three.js/DOM; testável em Node).
 *
 * `resolveKey(key, ctx)` devolve a ação (ou null) e o `InputManager` a executa.
 *  key: { code, ctrl, shift, alt, meta }
 *  ctx: { hasUnits, hasBuilding, targetMode, cardLetters:Set<string> } — `cardLetters` = letras dos
 *       botões visíveis do card de comandos.
 *
 * Prioridade (ver docs/02_MECANICAS.md, "Controles"):
 *  1. Ctrl/Shift+1..9 e 1..9 (grupos de controle) — sempre.
 *  2. Com construção selecionada (e sem unidades): letras do card.
 *  3. Com unidades selecionadas: S/H/A/P são ordens; as demais letras vão ao card (se existirem lá).
 *  4. Em modo-alvo as letras do card/ordens ficam bloqueadas (só Esc/clique direito cancelam).
 */

/** Máximo de unidades selecionadas por caixa/duplo clique (as mais próximas do centro da caixa). */
export const SELECTION_LIMIT = 24;

/** Letras de ordens (com unidades selecionadas e sem construção) — padrão; ver `getBindings()`. */
export const ORDER_KEYS = { KeyS: 'stop', KeyH: 'hold', KeyA: 'attackMove', KeyP: 'patrol' };

/**
 * F6-08: ações remapeáveis → `KeyboardEvent.code` padrão. Letras do card de comandos
 * (construir/treinar/pesquisar) e grupos de controle (1..9) não são remapeáveis.
 */
export const DEFAULT_BINDINGS = Object.freeze({
  stop: 'KeyS',
  hold: 'KeyH',
  attackMove: 'KeyA',
  patrol: 'KeyP',
  idleWorker: 'Period',
  lastAlert: 'Space',
  hq: 'Backspace'
});

/** Nomes (PT-BR) das ações remapeáveis, na ordem da tela de opções. */
export const BINDING_LABELS = Object.freeze({
  stop: 'Parar',
  hold: 'Manter posição',
  attackMove: 'Atacar-movendo',
  patrol: 'Patrulhar',
  idleWorker: 'Próximo trabalhador ocioso',
  lastAlert: 'Ir ao último alerta',
  hq: 'Centralizar no Centro'
});

/** Teclas que não podem ser atribuídas (dígitos = grupos; Esc/Enter/Tab/setas/modificadoras). */
const RESERVED = /^(Digit[0-9]|Numpad[0-9]|Escape|Enter|Tab|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|F[0-9]{1,2})$/;

/** Letras fixas do card (construir/treinar/pesquisar + WASD da câmera) — também reservadas. */
const FIXED_LETTERS = new Set(['KeyW', 'KeyD']);

let bindings = { ...DEFAULT_BINDINGS };
let codeToAction = invert(bindings);

function invert(b) {
  const m = new Map();
  for (const [action, code] of Object.entries(b)) if (code) m.set(code, action);
  return m;
}

/** Atribuições atuais (cópia). */
export function getBindings() { return { ...bindings }; }

/** Código que não pode ser atribuído a nenhuma ação. */
export function isReservedCode(code) { return RESERVED.test(code || '') || FIXED_LETTERS.has(code); }

/** Ação já usando `code` (ignorando `exceptAction`), ou null. */
export function findConflict(code, exceptAction = null, map = bindings) {
  for (const [action, c] of Object.entries(map)) if (c === code && action !== exceptAction) return action;
  return null;
}

/**
 * Aplica um mapa parcial `{ ação: code }` sobre o padrão. Entradas inválidas (ação desconhecida,
 * código reservado ou duplicado) são ignoradas, mantendo o padrão da ação. Devolve as atribuições efetivas.
 */
export function setBindings(overrides = {}) {
  const next = {};
  const used = new Set();
  const actions = Object.keys(DEFAULT_BINDINGS);
  // 1) atribuições do usuário válidas e únicas
  for (const a of actions) {
    const code = overrides && overrides[a];
    if (code && !isReservedCode(code) && !used.has(code)) { next[a] = code; used.add(code); }
  }
  // 2) o resto volta ao padrão se a tecla padrão estiver livre; senão fica sem tecla (null)
  for (const a of actions) {
    if (next[a]) continue;
    const def = DEFAULT_BINDINGS[a];
    if (!used.has(def)) { next[a] = def; used.add(def); } else next[a] = null;
  }
  bindings = next;
  codeToAction = invert(bindings);
  return getBindings();
}

/** Texto curto de uma tecla para mostrar na UI (`KeyS` → `S`, `Space` → `Espaço`). */
export function codeLabel(code) {
  if (!code) return '';
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  const d = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (d) return d[1];
  const names = { Space: 'Espaço', Period: '.', Comma: ',', Backspace: 'Backspace', Minus: '-', Equal: '=', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Home: 'Home', End: 'End', Insert: 'Insert', Delete: 'Delete', PageUp: 'PageUp', PageDown: 'PageDown' };
  return names[code] || code;
}

export function digitOf(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code || '');
  return m ? Number(m[1]) : 0;
}

/** Letra ('A'..'Z') de um `KeyboardEvent.code`, ou ''. */
export function letterOf(code) {
  const m = /^Key([A-Z])$/.exec(code || '');
  return m ? m[1] : '';
}

/**
 * Resolve uma tecla em ação.
 * @returns {null | {type:'group', op:'set'|'add'|'select', n:number}
 *   | {type:'order', order:'stop'|'hold'|'attackMove'|'patrol'}
 *   | {type:'card', letter:string} | {type:'idleWorker'} | {type:'lastAlert'} | {type:'hq'}}
 */
export function resolveKey(key, ctx) {
  const { code } = key;
  const n = digitOf(code);
  if (n) {
    if (key.ctrl || key.meta) return { type: 'group', op: 'set', n };
    if (key.shift) return { type: 'group', op: 'add', n };
    if (!key.alt) return { type: 'group', op: 'select', n };
    return null;
  }
  if (key.ctrl || key.meta || key.alt) return null;

  const bound = codeToAction.get(code);
  if (bound === 'idleWorker' || bound === 'lastAlert' || bound === 'hq') return { type: bound };

  const letter = letterOf(code);
  if (ctx.targetMode) return null;

  const unitsOnly = ctx.hasUnits && !ctx.hasBuilding;
  if (unitsOnly && (bound === 'stop' || bound === 'hold' || bound === 'attackMove' || bound === 'patrol')) {
    return { type: 'order', order: bound };
  }
  if (!letter) return null;
  if (ctx.cardLetters && ctx.cardLetters.has(letter)) return { type: 'card', letter };
  return null;
}

/**
 * Até `limit` itens mais próximos de `center`. `items`: `[{id, x, y}]` (posição na tela ou no mundo).
 * Devolve na ordem de proximidade; estável por id nos empates.
 */
export function limitByDistance(items, center, limit = SELECTION_LIMIT) {
  if (items.length <= limit) return items.slice();
  return items
    .map(it => ({ it, d: (it.x - center.x) ** 2 + (it.y - center.y) ** 2 }))
    .sort((a, b) => a.d - b.d || a.it.id - b.it.id)
    .slice(0, limit)
    .map(o => o.it);
}
