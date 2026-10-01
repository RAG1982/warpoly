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

/** Letras de ordens (com unidades selecionadas e sem construção). */
export const ORDER_KEYS = { KeyS: 'stop', KeyH: 'hold', KeyA: 'attackMove', KeyP: 'patrol' };

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

  if (code === 'Period') return { type: 'idleWorker' };
  if (code === 'Space') return { type: 'lastAlert' };
  if (code === 'Backspace') return { type: 'hq' };

  const letter = letterOf(code);
  if (!letter || ctx.targetMode) return null;

  const unitsOnly = ctx.hasUnits && !ctx.hasBuilding;
  if (unitsOnly && ORDER_KEYS[code]) return { type: 'order', order: ORDER_KEYS[code] };
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
