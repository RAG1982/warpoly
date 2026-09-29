/**
 * Hotkeys.js (F3-01) — resolução pura de teclas (sem three.js/DOM).
 *
 * `resolveKey` decide o que uma tecla faz conforme o contexto; o InputManager executa a ação.
 * Prioridade: modo alvo (só Esc) > unidades selecionadas sem construção (S/H/A/P) > letras do card.
 */

/** Ações de comando por tecla quando há unidades (e nenhuma construção) selecionadas. */
export const UNIT_COMMAND_KEYS = {
  KeyS: 'stop',
  KeyH: 'hold',
  KeyA: 'attackMove',
  KeyP: 'patrol'
};

/** "KeyQ" → "Q"; outras teclas → null. */
export function letterOf(code) {
  return /^Key[A-Z]$/.test(code) ? code.slice(3) : null;
}

/** "Digit3" → 3; "Numpad3" → 3; outras → null (0 não é grupo). */
export function digitOf(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

/**
 * @param {{code:string, ctrl?:boolean, shift?:boolean}} key
 * @param {{targetMode?:string|null, hasUnits?:boolean, hasBuilding?:boolean, typing?:boolean}} ctx
 * @returns {{type:string, [k:string]:any}|null}
 *   tipos: 'group-set'|'group-add'|'group-select' (digit), 'unit-command' (command),
 *   'card' (letter), 'idle-worker', 'last-alert', 'go-hq'
 */
export function resolveKey(key, ctx = {}) {
  if (ctx.typing) return null;
  const { code, ctrl = false, shift = false } = key;

  const digit = digitOf(code);
  if (digit !== null) {
    if (ctrl) return { type: 'group-set', digit };
    if (shift) return { type: 'group-add', digit };
    return { type: 'group-select', digit };
  }

  if (code === 'Period') return { type: 'idle-worker' };
  if (code === 'Space') return { type: 'last-alert' };
  if (code === 'Backspace') return { type: 'go-hq' };

  if (ctrl) return null;
  // Em modo alvo (A/P aguardando clique) as letras não disparam nada além de Esc (tratado fora).
  if (ctx.targetMode) return null;

  if (ctx.hasUnits && !ctx.hasBuilding && UNIT_COMMAND_KEYS[code]) {
    return { type: 'unit-command', command: UNIT_COMMAND_KEYS[code] };
  }

  const letter = letterOf(code);
  if (letter) return { type: 'card', letter };
  return null;
}

/**
 * Acha, dentro das `roots` (contêineres do card visível), o botão cuja dica termina em "(X)"
 * — mesma fonte das letras exibidas por `src/ui/hotkeys.js`. Botões desabilitados são ignorados.
 */
export function findCardButton(roots, letter) {
  const suffix = `(${letter})`;
  for (const root of roots) {
    if (!root) continue;
    for (const btn of root.querySelectorAll('button')) {
      if (btn.disabled) continue;
      const title = btn.getAttribute('title') || '';
      if (title.endsWith(suffix) && btn.offsetParent !== null) return btn;
    }
  }
  return null;
}
