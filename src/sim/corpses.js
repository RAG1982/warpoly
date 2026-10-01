/**
 * corpses.js — F4-04: pool fixo de cadáveres (puro; só dados, sem entidade 3D).
 *
 * Ao morrer, uma unidade não-`corpseless` registra `{x, z, ownerId, type, t}` por `CORPSE_LIFETIME` s de
 * tempo de jogo. Capacidade `CORPSE_CAPACITY` (64), FIFO: cheio, o registro mais antigo é sobrescrito.
 * Os objetos são pré-alocados (nenhuma alocação por morte). `Erguer Mortos` consome os mais antigos
 * dentro do raio, em ordem determinística (por `t`, empate por índice de inserção).
 */
import { CORPSE_LIFETIME, CORPSE_CAPACITY } from '../data/combat.js';

export class CorpsePool {
  constructor(capacity = CORPSE_CAPACITY) {
    this.capacity = capacity;
    /** @type {Array<{active:boolean,x:number,z:number,ownerId:number,type:string,t:number,seq:number}>} */
    this.items = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = { active: false, x: 0, z: 0, ownerId: 0, type: '', t: 0, seq: 0 };
    this._seq = 0;
    this._buf = [];
  }

  /** Quantidade de cadáveres ativos. */
  get count() {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.items[i].active) n++;
    return n;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.items[i].active = false;
    this._seq = 0;
  }

  /** Registra um cadáver em (x,z) no instante `now` (tempo de jogo, s). Sobrescreve o mais antigo se cheio. */
  add(x, z, ownerId, type, now) {
    // slot livre (ou expirado) primeiro; senão sobrescreve o de menor `seq` (mais antigo)
    let slot = -1;
    let oldest = 0;
    for (let i = 0; i < this.capacity; i++) {
      const c = this.items[i];
      if (!c.active) { slot = i; break; }
      if (c.seq < this.items[oldest].seq) oldest = i;
    }
    if (slot < 0) slot = oldest;
    const c = this.items[slot];
    c.active = true;
    c.x = x;
    c.z = z;
    c.ownerId = ownerId;
    c.type = type;
    c.t = now;
    c.seq = ++this._seq;
  }

  /** Expira os cadáveres com mais de `CORPSE_LIFETIME` s. */
  prune(now) {
    for (let i = 0; i < this.capacity; i++) {
      const c = this.items[i];
      if (c.active && now - c.t > CORPSE_LIFETIME) c.active = false;
    }
  }

  /** Quantos cadáveres ativos há em `radius` de (x,z). */
  countNear(x, z, radius) {
    let n = 0;
    const r2 = radius * radius;
    for (let i = 0; i < this.capacity; i++) {
      const c = this.items[i];
      if (c.active && (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) <= r2) n++;
    }
    return n;
  }

  /**
   * Consome até `max` cadáveres (os mais antigos) em `radius` de (x,z). Devolve quantos foram consumidos;
   * `out` (opcional) recebe `{x,z}` de cada um (para posicionar as invocações).
   */
  consume(x, z, radius, max, out = null) {
    const r2 = radius * radius;
    const buf = this._buf;
    buf.length = 0;
    for (let i = 0; i < this.capacity; i++) {
      const c = this.items[i];
      if (c.active && (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) <= r2) buf.push(c);
    }
    buf.sort((a, b) => a.seq - b.seq);
    const n = Math.min(max, buf.length);
    for (let i = 0; i < n; i++) {
      if (out) out.push({ x: buf[i].x, z: buf[i].z });
      buf[i].active = false;
    }
    buf.length = 0;
    return n;
  }
}
