/**
 * ControlGroups.js (F3-01) — grupos de controle 1..9 (lógica pura, sem three.js/DOM).
 *
 * Guarda **ids** de unidades. `select` resolve os ids por `resolve(id)` (devolve a unidade
 * viva ou null); mortos saem do grupo. Duplo toque no mesmo dígito em < 350 ms sinaliza
 * "centralizar câmera".
 */

export const DOUBLE_TAP_MS = 350;

/** Limite de unidades selecionadas por caixa (as mais próximas do centro da caixa). */
export const SELECTION_LIMIT = 24;

export class ControlGroups {
  constructor() {
    this.groups = new Map(); // dígito (1..9) → number[] de ids
    this._lastTapDigit = null;
    this._lastTapTime = -Infinity;
  }

  /** Grava (substitui) o grupo com os ids dados. Lista vazia limpa o grupo. */
  set(digit, ids) {
    if (ids.length === 0) this.groups.delete(digit);
    else this.groups.set(digit, [...new Set(ids)]);
  }

  /** Adiciona ids ao grupo (sem duplicar). */
  add(digit, ids) {
    this.set(digit, [...(this.groups.get(digit) || []), ...ids]);
  }

  /** Ids gravados (inclui mortos até o próximo `select`). */
  get(digit) {
    return this.groups.get(digit) || [];
  }

  /**
   * Resolve o grupo em entidades vivas e remove do grupo as que não existem mais.
   * @param {(id:number)=>object|null} resolve
   */
  select(digit, resolve) {
    const alive = [];
    for (const id of this.get(digit)) {
      const u = resolve(id);
      if (u && !u.isDead && !u.isDying && u.state !== 'dying') alive.push(u);
    }
    this.set(digit, alive.map(u => u.id));
    return alive;
  }

  /**
   * Registra um toque no dígito; devolve true se for o 2º toque (mesmo dígito) dentro de
   * `DOUBLE_TAP_MS` — o chamador centraliza a câmera. `now` em ms.
   */
  tap(digit, now) {
    const isDouble = this._lastTapDigit === digit && now - this._lastTapTime < DOUBLE_TAP_MS;
    this._lastTapDigit = isDouble ? null : digit;
    this._lastTapTime = now;
    return isDouble;
  }

  clear() {
    this.groups.clear();
    this._lastTapDigit = null;
    this._lastTapTime = -Infinity;
  }
}

/**
 * Limita `items` (com `sx`,`sy` = posição em tela) às `limit` mais próximas do centro do retângulo.
 * @param {{x1:number,y1:number,x2:number,y2:number}} rect
 */
export function limitByBoxCenter(items, rect, limit = SELECTION_LIMIT) {
  if (items.length <= limit) return items;
  const cx = (rect.x1 + rect.x2) / 2;
  const cy = (rect.y1 + rect.y2) / 2;
  return items
    .map(it => ({ it, d: (it.sx - cx) ** 2 + (it.sy - cy) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(o => o.it);
}
