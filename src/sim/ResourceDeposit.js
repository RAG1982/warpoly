import { MINE_SLOTS } from '../data/index.js';
import { Body } from './Body.js';

/** Quantidade padrão de cada tipo de jazida (petróleo: poço no mar, F4-07a). */
const DEFAULT_AMOUNT = { gold: 2500, stone: 2500, oil: 5000 };

export class ResourceDeposit {
  /** @param {number} [amount]  quantidade inicial (padrão por tipo; `mapDef.resources[].amount`) */
  constructor(terrain, type, x, z, amount = DEFAULT_AMOUNT[type] || 2500) {
    this.terrain = terrain;
    this.type = type; // 'gold', 'stone' or 'oil' (F4-07a: poço de petróleo, em água rasa)
    this.resourcesRemaining = amount;
    this.maxResources = amount;
    /** F4-07a: plataforma (`Building`, role 'platform') erguida sobre este poço, ou null. Só o petróleo usa. */
    this.platform = null;

    // F3-04: mina/pedreira como gargalo — só `slots` trabalhadores dentro por vez (`inside`),
    // os demais esperam em `queue` (ordem de chegada). Ver `requestEnter`/`release` e
    // `Unit.updateWaitingMine`/`updateInsideMine`.
    this.slots = MINE_SLOTS[type] || 1;
    this.inside = [];
    this.queue = [];
    this._depletedEmitted = false;
    this._justDepleted = false;

    this.name = type === 'gold' ? 'Gold Mine' : (type === 'oil' ? 'Oil Well' : 'Stone Quarry');

    this.collisionRadius = type === 'gold' ? 3.4 : (type === 'oil' ? 2.6 : 3.0);

    const h = this.terrain.getHeight(x, z);
    // Compat legado: `deposit.mesh.position` (corpo de simulação; a malha vive em `render/ResourceDepositView`).
    this.mesh = new Body(x, h, z);
    this.mesh.userData.entity = this;
    this.position = this.mesh.position;
  }

  /**
   * F3-04: `unit` tenta um lugar dentro (`slots`). Devolve `true` (entrou — já removido da
   * fila) ou `false` (sem vaga — enfileirado se ainda não estiver, ordem de chegada = ordem
   * da primeira chamada, determinística: sem `Math.random`/relógio).
   */
  requestEnter(unit) {
    if (this.inside.indexOf(unit) >= 0) return true;
    if (this.inside.length < this.slots) {
      const qi = this.queue.indexOf(unit);
      if (qi >= 0) this.queue.splice(qi, 1);
      this.inside.push(unit);
      return true;
    }
    if (this.queue.indexOf(unit) < 0) this.queue.push(unit);
    return false;
  }

  /** Remove `unit` de dentro/da fila (saída normal, ordem nova ou morte — ver `Unit._exitMine`). */
  release(unit) {
    const ii = this.inside.indexOf(unit);
    if (ii >= 0) this.inside.splice(ii, 1);
    const qi = this.queue.indexOf(unit);
    if (qi >= 0) this.queue.splice(qi, 1);
  }

  /**
   * F2-07: só a lógica de estado (recurso restante). O VFX de poeira/brilho ao minerar sai como
   * evento `WORKER_MINE` emitido pelo chamador (`Unit.js`, que conhece o `ownerId` de quem está
   * minerando) — ver `Unit.updateInsideMine`. F3-04: ao esgotar (`resourcesRemaining` chega a
   * 0 pela primeira vez), marca `_justDepleted` para `consumeDepletedFlag()` — emite
   * `RESOURCE_DEPLETED` uma única vez (item 3/6 da spec).
   */
  mine(amount) {
    const harvested = Math.min(amount, this.resourcesRemaining);
    this.resourcesRemaining -= harvested;
    if (this.resourcesRemaining <= 0 && !this._depletedEmitted) {
      this._depletedEmitted = true;
      this._justDepleted = true;
    }
    return harvested;
  }

  /** Consome (uma vez) o aviso de esgotamento gerado por `mine()`. */
  consumeDepletedFlag() {
    if (this._justDepleted) {
      this._justDepleted = false;
      return true;
    }
    return false;
  }
}
