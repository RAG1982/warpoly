/**
 * hazards.js — F4-04b: perigos de chão criados por magias (Runas Explosivas e Redemoinho). Pool só de dados,
 * sem three.js: a apresentação lê `gm.hazards.items` (`src/render/HazardView.js`). Passo em `GameManager.simStep`.
 *
 * - `rune`: armadilha estática, invisível a inimigos (só dono/aliados a veem). Dispara quando um hostil terrestre
 *   (`layer !== 'air'`) chega a ≤ `trigger` (1,2): dano mágico `damage` (60) em raio `blast` (1,5) — 1
 *   `computeDamage` por alvo, em ordem de id — e some. Expira em `lifetime` s. Máx. `maxActive` (12) por jogador:
 *   ao passar disso as mais antigas somem (FIFO).
 * - `whirlwind`: vaga por `duration` s; novo destino aleatório (RNG da partida: `gm.combatRng`) a cada `retarget`
 *   s dentro de `wander` do ponto de origem; a cada 0,5 s causa `dps/2` de dano mágico a unidades terrestres
 *   (amigas também) em raio `radius`. Sem colisão.
 * Eventos (`EVT.HAZARD_SPAWNED/REMOVED`) só para apresentação; o estado entra no checksum (`stateChecksum`).
 */
import { SIM_DT } from './constants.js';
import { computeDamage } from './combat.js';
import { EVT } from './events.js';

const WHIRL_TICK = 0.5;

const alive = u => !u.isDead && !u.isDying && u.hp > 0 && !u.immune;
const grounded = u => u.layer !== 'air';

export class HazardPool {
  /** @param {*} gm GameManager */
  constructor(gm) {
    this.gm = gm;
    /** @type {Array<object>} em ordem de criação (determinístico). */
    this.items = [];
    this._seq = 0;
    this._buf = [];
  }

  clear() {
    this.items.length = 0;
    this._seq = 0;
  }

  count(kind = null, ownerId = null) {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) {
      const h = this.items[i];
      if ((kind === null || h.kind === kind) && (ownerId === null || h.ownerId === ownerId)) n++;
    }
    return n;
  }

  _emit(type, h, extra) {
    const gm = this.gm;
    if (!gm.events) return;
    const y = gm.terrain ? gm.terrain.getHeight(h.x, h.z) : 0;
    gm.events.emit(type, { hazardId: h.id, kind: h.kind, ownerId: h.ownerId, pos: { x: h.x, y, z: h.z }, ...extra });
  }

  _add(h) {
    h.id = ++this._seq;
    this.items.push(h);
    this._emit(EVT.HAZARD_SPAWNED, h);
    return h;
  }

  _remove(index, triggered = false) {
    const h = this.items.splice(index, 1)[0];
    this._emit(EVT.HAZARD_REMOVED, h, { triggered });
    return h;
  }

  /** Cria `fx.count` runas num círculo de raio `fx.radius` ao redor de (x,z). */
  spawnRunes(ownerId, x, z, fx) {
    const n = fx.count || 6;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this._add({
        kind: 'rune', ownerId,
        x: x + Math.cos(ang) * fx.radius, z: z + Math.sin(ang) * fx.radius,
        life: fx.lifetime, trigger: fx.triggerRadius, blast: fx.blastRadius, damage: fx.damage
      });
    }
    // limite por jogador: remove as mais antigas
    const max = fx.maxActive || 12;
    let owned = this.count('rune', ownerId);
    for (let i = 0; i < this.items.length && owned > max; i++) {
      const h = this.items[i];
      if (h.kind === 'rune' && h.ownerId === ownerId) { this._remove(i); i--; owned--; }
    }
  }

  spawnWhirlwind(ownerId, x, z, fx) {
    return this._add({
      kind: 'whirlwind', ownerId, x, z, ox: x, oz: z, tx: x, tz: z, life: fx.duration,
      retarget: 0, tickT: 0, speed: fx.speed || 3, wander: fx.wander || 6, radius: fx.radius || 2,
      dmg: (fx.dps || 12) * WHIRL_TICK, interval: fx.retarget || 2
    });
  }

  /** Um passo de simulação. */
  step(dt = SIM_DT) {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      h.life -= dt;
      if (h.life <= 0) { this._remove(i); i--; continue; }
      if (h.kind === 'rune') {
        if (this._stepRune(h)) { this._remove(i, true); i--; }
      } else {
        this._stepWhirl(h, dt);
      }
    }
  }

  _stepRune(h) {
    const gm = this.gm;
    if (!gm.unitGrid) return false;
    const buf = this._buf;
    buf.length = 0;
    gm.unitGrid.queryRadius(h.x, h.z, h.trigger, u => alive(u) && grounded(u) && gm.isHostile(h.ownerId, u.ownerId), buf);
    if (buf.length === 0) return false;
    // dispara: dano mágico em raio `blast` (1 computeDamage por alvo, ordem de id)
    buf.length = 0;
    gm.unitGrid.queryRadius(h.x, h.z, h.blast, u => alive(u) && grounded(u) && gm.isHostile(h.ownerId, u.ownerId), buf);
    buf.sort((a, b) => a.id - b.id);
    const dmg = { basic: h.damage, piercing: 0, type: 'magic' };
    for (let k = 0; k < buf.length; k++) {
      const u = buf[k];
      if (!alive(u)) continue;
      u.lastAttackerOwnerId = h.ownerId;
      u.takeDamage(computeDamage(dmg, u, gm.combatRng), null, gm.allUnits);
    }
    buf.length = 0;
    if (gm.events) {
      const y = gm.terrain ? gm.terrain.getHeight(h.x, h.z) : 0;
      gm.events.emit(EVT.EXPLOSION, { pos: { x: h.x, y, z: h.z }, radius: h.blast, ownerId: h.ownerId });
    }
    return true;
  }

  _stepWhirl(h, dt) {
    const gm = this.gm;
    h.retarget -= dt;
    if (h.retarget <= 0) {
      h.retarget = h.interval;
      const ang = gm.combatRng.next() * Math.PI * 2;
      const r = Math.sqrt(gm.combatRng.next()) * h.wander;
      h.tx = h.ox + Math.cos(ang) * r;
      h.tz = h.oz + Math.sin(ang) * r;
    }
    const dx = h.tx - h.x;
    const dz = h.tz - h.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      const k = Math.min(1, (h.speed * dt) / d);
      h.x += dx * k;
      h.z += dz * k;
    }
    h.tickT += dt;
    if (h.tickT + 1e-9 < WHIRL_TICK) return;
    h.tickT -= WHIRL_TICK;
    const buf = this._buf;
    buf.length = 0;
    gm.unitGrid.queryRadius(h.x, h.z, h.radius, u => alive(u) && grounded(u), buf); // fogo amigo aceito
    buf.sort((a, b) => a.id - b.id);
    for (let k = 0; k < buf.length; k++) {
      const u = buf[k];
      if (!alive(u)) continue;
      u.lastAttackerOwnerId = h.ownerId;
      u.takeDamage(h.dmg, null, gm.allUnits);
    }
    buf.length = 0;
  }
}
