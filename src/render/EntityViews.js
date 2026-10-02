/**
 * EntityViews.js — F2-08b: cria/atualiza/remove as views (malhas) das entidades de simulação que já são só
 * dados (`Tree`, `ResourceDeposit`, `Critter`), a partir das listas da `gm`. Chamado a cada quadro pela
 * `MatchSession` (nunca em modo headless). Nunca escreve na simulação.
 */
import { TreeView } from './TreeView.js';
import { ResourceDepositView } from './ResourceDepositView.js';
import { CritterView } from './CritterView.js';

export class EntityViews {
  /**
   * @param {import('../core/GameManager.js').GameManager} gm
   * @param {import('three').Scene} scene
   */
  constructor(gm, scene) {
    this.gm = gm;
    this.scene = scene;
    /** @type {Map<object, {root: object, update: Function, dispose: Function}>} */
    this.views = new Map();
    this._frame = 0;
    this._seen = new Map();
  }

  /** Objeto 3D (picking por raycast) da entidade, se ela tem view; `undefined` caso contrário. */
  rootOf(entity) {
    return this.views.get(entity)?.root;
  }

  _sync(list, make, frame) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.isDisposed) continue;
      let v = this.views.get(e);
      if (!v) {
        v = make(e);
        this.views.set(e, v);
      }
      this._seen.set(e, frame);
      v.update();
    }
  }

  update() {
    const gm = this.gm;
    const frame = ++this._frame;
    this._sync(gm.resourceDeposits, e => new ResourceDepositView(e, this.scene), frame);
    this._sync(gm.trees, e => new TreeView(e, this.scene, gm.treeManager), frame);
    this._sync(gm.critters, e => new CritterView(e, this.scene), frame);
    for (const [e, v] of this.views) {
      if (this._seen.get(e) !== frame) {
        v.dispose();
        this.views.delete(e);
        this._seen.delete(e);
      }
    }
  }

  /** As malhas ficam na cena: o descarte da `MatchSession` as libera junto com o resto da partida. */
  dispose() {
    this.views.clear();
    this._seen.clear();
  }
}
