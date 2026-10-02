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
    this._deposits = { ref: null, len: -1, views: [] };
    this._trees = { ref: null, len: -1, views: [] };
    this._critters = { ref: null, len: -1, views: [] };
  }

  /** Objeto 3D (picking por raycast) da entidade, se ela tem view; `undefined` caso contrário. */
  rootOf(entity) {
    return this.views.get(entity)?.root;
  }

  /**
   * Sincroniza as views de uma lista: cria as que faltam e remove as que saíram. Em listas estáticas
   * (árvores/minas, centenas de itens) a varredura completa só roda quando a lista muda de tamanho/identidade
   * (ou a cada 30 quadros); nos demais quadros só as views já criadas são atualizadas.
   */
  _sync(slot, list, make, frame, cached) {
    const full = !cached || slot.ref !== list || slot.len !== list.length || frame % 30 === 0;
    if (full) {
      slot.ref = list;
      slot.len = list.length;
      const old = slot.views;
      slot.views = [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.isDisposed) continue;
        let v = this.views.get(e);
        if (!v) {
          v = make(e);
          this.views.set(e, v);
        }
        this._seen.set(e, frame);
        slot.views.push(v);
      }
      for (let i = 0; i < old.length; i++) {
        const v = old[i];
        if (this._seen.get(v.entity) !== frame) {
          v.dispose();
          this.views.delete(v.entity);
          this._seen.delete(v.entity);
        }
      }
    }
    for (let i = 0; i < slot.views.length; i++) slot.views[i].update();
  }

  update() {
    const gm = this.gm;
    const frame = ++this._frame;
    this._sync(this._deposits, gm.resourceDeposits, e => new ResourceDepositView(e, this.scene), frame, true);
    this._sync(this._trees, gm.trees, e => new TreeView(e, this.scene, gm.treeManager), frame, true);
    this._sync(this._critters, gm.critters, e => new CritterView(e, this.scene), frame, false);
  }

  /** As malhas ficam na cena: o descarte da `MatchSession` as libera junto com o resto da partida. */
  dispose() {
    this.views.clear();
    this._seen.clear();
  }
}
