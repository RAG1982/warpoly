import { ModelFactory } from './ModelFactory.js';
import { NEUTRAL_OWNER_ID } from '../sim/EntityIds.js';

/**
 * F3-10: critter decorativo (ovelha/porco). Classe leve, SEM `Unit`: sem animador, sem barra de
 * vida, sem entrada nas grades espaciais nem em `getUnitsOf`. Registra-se em `gm.entitiesById`
 * (para `CMD.ATTACK` por id) e em `gm.critters` (picking/atualização).
 *
 * Comportamento: passeio aleatório curto ao redor da origem (passo a cada 2–6 s, RNG próprio
 * derivado da partida — nunca `Math.random`), foge 4 s ao ser ferido, tem `hp: 8`, é dono
 * `NEUTRAL_OWNER_ID` (nunca alvo de auto-aquisição: `isHostile(x, -1)` é sempre falso) e ao morrer
 * deixa a carcaça 3 s. Não soma recursos nem emite `UNIT_DIED` (não conta em estatísticas).
 * LOD: fora da visão do jogador local (névoa) não atualiza movimento.
 */
export const CRITTER_HP = 8;
const WALK_SPEED = 1.2;
const FLEE_SPEED = 4.5;
const FLEE_TIME = 4;
const CARCASS_TIME = 3;

export class Critter {
  /**
   * @param {object} gm   GameManager (usa `scene`, `terrain`, `pathfinder`, `fogOfWar`)
   * @param {string} species  'sheep' | 'pig'
   * @param {number} x
   * @param {number} z
   * @param {{next: () => number}} rng  RNG determinístico próprio deste critter
   * @param {number} radius  raio do passeio ao redor da origem
   */
  constructor(gm, species, x, z, rng, radius = 6) {
    this.gameManager = gm;
    this.scene = gm.scene;
    this.terrain = gm.terrain;
    this.species = species;
    this.type = `critter_${species}`;
    this.name = species === 'pig' ? 'Porco' : 'Ovelha';
    this.id = undefined;
    this.ownerId = NEUTRAL_OWNER_ID;
    this.rng = rng;
    this.homeX = x;
    this.homeZ = z;
    this.radius = radius;

    this.hp = CRITTER_HP;
    this.maxHp = CRITTER_HP;
    this.armor = 0;
    this.collisionRadius = 0.6;
    this.isDead = false;
    this.canRemove = false;
    this.isDisposed = false;

    this.state = 'idle'; // idle | walking | fleeing | dead
    this.stepTimer = 2 + rng.next() * 4;
    this.fleeTimer = 0;
    this.deadTimer = 0;
    this.targetX = x;
    this.targetZ = z;
    this._fleeDx = 0;
    this._fleeDz = 1;
    this._bob = rng.next() * Math.PI * 2;

    this.mesh = ModelFactory.createCritter(species);
    this.mesh.position.set(x, this.terrain.getHeight(x, z), z);
    this.mesh.rotation.y = rng.next() * Math.PI * 2;
    this.mesh.scale.setScalar(1.4);
    this.mesh.userData.entity = this;
    this.scene.add(this.mesh);
  }

  /** Critters nunca são "inimigos" (clique esquerdo apenas seleciona; ataque é por ordem explícita). */
  get faction() {
    return 'neutral';
  }

  _walkable(x, z) {
    const pf = this.gameManager.pathfinder;
    if (pf && pf.isWater(x, z)) return false;
    return this.terrain.getHeight(x, z) >= 0.65;
  }

  /** `amount` já é o dano final (computeDamage). Foge do atacante por 4 s; morre com hp <= 0. */
  takeDamage(amount, attacker = null) {
    if (this.isDead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    this.state = 'fleeing';
    this.fleeTimer = FLEE_TIME;
    const p = this.mesh.position;
    let dx = 1;
    let dz = 0;
    if (attacker && attacker.mesh) {
      dx = p.x - attacker.mesh.position.x;
      dz = p.z - attacker.mesh.position.z;
    }
    const len = Math.hypot(dx, dz) || 1;
    this._fleeDx = dx / len;
    this._fleeDz = dz / len;
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.state = 'dead';
    this.deadTimer = 0;
    // Carcaça: tomba de lado (visual).
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z) + 0.25;
  }

  update(dt) {
    if (this.canRemove) return;
    const gm = this.gameManager;
    const p = this.mesh.position;

    if (this.isDead) {
      this.deadTimer += dt;
      if (this.deadTimer >= CARCASS_TIME) this.canRemove = true;
      return;
    }

    // LOD: fora da visão do jogador local, sem atualização de movimento (visual apenas).
    const fog = gm.fogOfWar;
    const seen = !fog || fog.isVisible(p.x, p.z);
    this.mesh.visible = seen;
    if (!seen && this.state !== 'fleeing') return;

    if (this.state === 'fleeing') {
      this.fleeTimer -= dt;
      const nx = p.x + this._fleeDx * FLEE_SPEED * dt;
      const nz = p.z + this._fleeDz * FLEE_SPEED * dt;
      if (this._walkable(nx, nz)) {
        p.x = nx;
        p.z = nz;
        this.mesh.rotation.y = Math.atan2(this._fleeDx, this._fleeDz);
      }
      if (this.fleeTimer <= 0) {
        this.state = 'idle';
        this.stepTimer = 2 + this.rng.next() * 4;
      }
    } else if (this.state === 'walking') {
      const dx = this.targetX - p.x;
      const dz = this.targetZ - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) {
        this.state = 'idle';
        this.stepTimer = 2 + this.rng.next() * 4;
      } else {
        const step = Math.min(d, WALK_SPEED * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        // Novo ponto de passeio dentro do raio da origem (se cair na água, espera o próximo passo).
        const ang = this.rng.next() * Math.PI * 2;
        const dist = this.rng.next() * this.radius;
        const tx = this.homeX + Math.cos(ang) * dist;
        const tz = this.homeZ + Math.sin(ang) * dist;
        if (this._walkable(tx, tz)) {
          this.targetX = tx;
          this.targetZ = tz;
          this.state = 'walking';
        } else {
          this.stepTimer = 2 + this.rng.next() * 4;
        }
      }
    }

    p.y = this.terrain.getHeight(p.x, p.z);
    // Balanço simples enquanto anda/foge (sem esqueleto).
    if (this.state === 'walking' || this.state === 'fleeing') {
      this._bob += dt * (this.state === 'fleeing' ? 14 : 7);
      this.mesh.rotation.z = Math.sin(this._bob) * 0.08;
    } else {
      this.mesh.rotation.z = 0;
    }
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.mesh && this.scene) this.scene.remove(this.mesh);
  }
}
