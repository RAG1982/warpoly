import { EVT } from './events.js';
import { NEUTRAL_OWNER_ID } from './EntityIds.js';
import { Body } from './Body.js';
import { TREE_WOOD_LEGACY } from '../data/economy.js';

/**
 * Árvore de simulação (F2-08b): só dados. A malha instanciada, o hit-proxy, a árvore caindo e o toco
 * vivem em `src/render/TreeView.js`, que lê `isDead`/`shakeTimer`/`fallProgress` a cada quadro.
 */
export class Tree {
  /**
   * @param {object} terrain  só `getHeight(x, z)`
   * @param {object|null} [rng]  F2-03: RNG de simulação (`gm.rngMap`) usado para `rotY`/escala,
   *   para o mapa ficar idêntico entre execuções da mesma seed. Obrigatório (F9-03): sem `rng` lança erro — `Math.random` na sim quebraria o lockstep.
   */
  constructor(terrain, x, z, type = 'oak', rng = null) {
    if (!rng) throw new Error('Tree: rng de simulação obrigatório (F9-03)');
    this.terrain = terrain;
    this.type = 'tree';
    this.treeType = type;
    this.woodRemaining = TREE_WOOD_LEGACY;
    this.maxWood = TREE_WOOD_LEGACY;
    this.isDead = false;
    this.isDisposed = false;
    this.fallProgress = 0;
    this.shakeTimer = 0;

    const h = this.terrain.getHeight(x, z);
    const rotY = rng.next() * Math.PI * 2;
    const s = 0.85 + rng.next() * 0.35;
    this.scale = s;
    this.collisionRadius = 0.75 * s;
    this.baseRotY = rotY;

    // Compat legado: `tree.mesh.position` (corpo de simulação, não é um Object3D).
    this.mesh = new Body(x, h, z);
    this.mesh.rotation.y = rotY;
    this.mesh.scale.set(s, s, s);
    this.mesh.userData.entity = this;
    this.position = this.mesh.position;
    this.basePos = this.position.clone();
  }

  /** Queda terminada: o view mostra o toco. */
  get hasStump() {
    return this.isDead && this.fallProgress >= 1.0 && !this.isDisposed;
  }

  /**
   * F2-07: só a lógica de estado (madeira restante). O VFX de lasca de madeira ao golpear a
   * árvore sai como evento `WORKER_HAMMER`/`WORKER_CHOP` emitido pelo chamador (`Unit.js`, que
   * conhece o `ownerId` de quem está cortando) — ver `Unit.updateGathering`.
   */
  chop(amount) {
    if (this.isDead) return 0;

    const harvested = Math.min(amount, this.woodRemaining);
    this.woodRemaining -= harvested;

    if (this.woodRemaining <= 0) {
      this.shakeTimer = 0;
      this.die();
    } else {
      // Shake tree only while living
      this.shakeTimer = 0.25;
    }

    return harvested;
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.woodRemaining = 0;
    this.collisionRadius = 0;
    this.shakeTimer = 0;
  }

  /**
   * @param {number} delta
   * @param {import('../sim/EventBus.js').EventBus|null} [events]  F2-07: no lugar de
   *   `particleSystem` — emite `WORKER_CHOP` quando a queda termina (lascas finais); o ouvinte
   *   de VFX decide se/como desenhar (sem condição de dono: sempre tocava, ver F2-07).
   */
  update(delta, events = null) {
    // Tremor ao ser golpeada (só árvore viva em pé); o view desenha o ângulo a partir de `shakeTimer`.
    if (!this.isDead && this.shakeTimer > 0) this.shakeTimer -= delta;

    // Queda ao ser cortada; ao terminar o view troca a árvore caída pelo toco.
    if (this.isDead && this.fallProgress < 1.0) {
      this.fallProgress += delta * 1.5;
      if (this.fallProgress >= 1.0 && events) {
        events.emit(EVT.WORKER_CHOP, {
          pos: { x: this.basePos.x, y: this.basePos.y, z: this.basePos.z },
          ownerId: NEUTRAL_OWNER_ID
        });
      }
    }
  }

  /** O toco sob uma construção é descartado (o view remove as malhas). */
  dispose() {
    this.isDisposed = true;
  }
}
