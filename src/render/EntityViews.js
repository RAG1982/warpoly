/**
 * EntityViews.js — F2-08b: cria/atualiza/remove as views (malhas) das entidades de simulação que já são só
 * dados (`Tree`, `ResourceDeposit`, `Critter`, `Building`/`Wall`), a partir das listas da `gm`. Chamado a cada quadro
 * pela `MatchSession` (nunca em modo headless). Só lê a simulação (F2-08c: construções; unidades na etapa seguinte).
 */
import { TreeView } from './TreeView.js';
import { ResourceDepositView } from './ResourceDepositView.js';
import { CritterView } from './CritterView.js';
import { createBuildingView } from './createBuildingView.js';
import { WallBatch } from './WallView.js';
import { BuildingView } from './BuildingView.js';

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
    this._buildings = { ref: null, len: -1, views: [] };
    /** F3-08: um InstancedMesh por facção ('human' | 'orc') com todos os segmentos de muralha. */
    this._wallBatches = {};
    this._frameDelta = 0;
    this._alpha = 1;
  }

  /** `WallBatch` compartilhado da facção (criado sob demanda). */
  getWallBatch(faction) {
    if (!this._wallBatches[faction]) this._wallBatches[faction] = new WallBatch(this.scene, faction);
    return this._wallBatches[faction];
  }

  /** View (malha) da entidade, se existir. */
  viewOf(entity) {
    return this.views.get(entity);
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
    const camera = this.gm.sceneManager?.camera;
    for (let i = 0; i < slot.views.length; i++) slot.views[i].update(this._frameDelta, this.gm, camera, this._alpha);
  }

  /**
   * @param {number} [frameDelta]  segundos reais do quadro (0 = pausado)
   * @param {number} [alpha]  fração do próximo passo de simulação (interpolação das unidades)
   */
  update(frameDelta = 0, alpha = 1) {
    const gm = this.gm;
    const frame = ++this._frame;
    this._frameDelta = frameDelta;
    this._alpha = alpha;
    this._sync(this._deposits, gm.resourceDeposits, e => new ResourceDepositView(e, this.scene), frame, true);
    this._sync(this._trees, gm.trees, e => new TreeView(e, this.scene, gm.treeManager), frame, true);
    this._sync(this._critters, gm.critters, e => new CritterView(e, this.scene), frame, false);
    this._sync(this._buildings, gm.buildings, e => createBuildingView(e, this.scene, f => this.getWallBatch(f)), frame, false);
  }

  /** As malhas ficam na cena: o descarte da `MatchSession` as libera junto com o resto da partida. */
  dispose() {
    for (const v of this.views.values()) if (v instanceof BuildingView) v.dispose();
    for (const wb of Object.values(this._wallBatches)) wb.dispose();
    this._wallBatches = {};
    this.views.clear();
    this._seen.clear();
  }
}
