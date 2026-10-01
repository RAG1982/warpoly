/**
 * ControlGroups.js (F3-01) — grupos de controle 1..9 (lógica pura, sem three.js/DOM).
 *
 * Guarda ids de unidades por grupo. `isAlive(id)` é injetado para filtrar mortos ao consultar.
 * Duplo toque (< DOUBLE_TAP_MS) no mesmo número pede para centralizar a câmera.
 */
export const DOUBLE_TAP_MS = 350;

export class ControlGroups {
  constructor() {
    /** @type {Map<number, number[]>} */
    this.groups = new Map();
    this._lastTapN = -1;
    this._lastTapAt = -Infinity;
  }

  /** Grava (substitui) o grupo `n` com `ids`. Lista vazia remove o grupo. */
  set(n, ids) {
    if (!ids || ids.length === 0) this.groups.delete(n);
    else this.groups.set(n, [...new Set(ids)]);
  }

  /** Acrescenta `ids` ao grupo `n` (sem duplicar). */
  add(n, ids) {
    const cur = this.groups.get(n) || [];
    this.set(n, [...cur, ...ids]);
  }

  /** Ids do grupo que ainda estão vivos (e poda os mortos do grupo). */
  get(n, isAlive = () => true) {
    const cur = this.groups.get(n);
    if (!cur) return [];
    const alive = cur.filter(isAlive);
    if (alive.length !== cur.length) this.set(n, alive);
    return alive;
  }

  /**
   * Seleciona o grupo `n`: devolve `{ids, center}` — `center` = true se for o 2º toque no mesmo
   * número em menos de DOUBLE_TAP_MS (câmera deve centralizar). `now` em ms.
   */
  recall(n, now, isAlive = () => true) {
    const ids = this.get(n, isAlive);
    const center = this._lastTapN === n && now - this._lastTapAt < DOUBLE_TAP_MS;
    this._lastTapN = n;
    this._lastTapAt = center ? -Infinity : now;
    return { ids, center };
  }

  clear() {
    this.groups.clear();
    this._lastTapN = -1;
    this._lastTapAt = -Infinity;
  }
}
