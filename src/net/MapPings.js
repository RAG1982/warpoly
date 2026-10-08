/**
 * MapPings.js — F9-04: pings de mapa entre aliados (só apresentação; vêm de `session.onMapPing`, fora da sim).
 * Lógica pura: guarda os pings vivos com expiração e limite por jogador; `active(now)` devolve
 * `{x, z, kind, color, from, age}` com `age` em 0..1 (formato de `drawMinimapPings`). Relógio injetado
 * (ms) para teste; nada aqui lê ou altera a simulação nem entra no checksum.
 */
export const PING_LIFE_MS = 6000;
export const MAX_PINGS_PER_PLAYER = 3;
const KINDS = new Set(['attention', 'attack', 'defend', 'help']);

export class MapPings {
  /** @param {{lifeMs?: number, maxPerPlayer?: number}} [o] */
  constructor({ lifeMs = PING_LIFE_MS, maxPerPlayer = MAX_PINGS_PER_PLAYER } = {}) {
    this.lifeMs = lifeMs;
    this.maxPerPlayer = maxPerPlayer;
    /** @type {{x: number, z: number, kind: string, color: string|null, from: number, t0: number}[]} */
    this.items = [];
  }

  /** Registra um ping (kind desconhecido vira 'attention'). Devolve o item guardado. */
  add({ x, z, kind = 'attention', from, color = null }, now) {
    const item = { x, z, kind: KINDS.has(kind) ? kind : 'attention', color, from, t0: now };
    this.items.push(item);
    // limite por jogador: descarta os mais antigos
    const mine = this.items.filter((p) => p.from === from);
    for (let i = 0; i < mine.length - this.maxPerPlayer; i++) this.items.splice(this.items.indexOf(mine[i]), 1);
    return item;
  }

  /** Remove expirados e devolve os vivos com `age`. */
  active(now) {
    this.items = this.items.filter((p) => now - p.t0 < this.lifeMs);
    return this.items.map((p) => ({ ...p, age: (now - p.t0) / this.lifeMs }));
  }

  clear() {
    this.items.length = 0;
  }
}
