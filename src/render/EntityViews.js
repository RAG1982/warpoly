/**
 * EntityViews.js — F2-08b: cria/atualiza/remove as views (malhas) das entidades de simulação que já são só
 * dados (`Tree`, `ResourceDeposit`, `Critter`, `Building`/`Wall`, `Unit`), a partir das listas da `gm`. Chamado a cada quadro
 * pela `MatchSession` (nunca em modo headless). Só lê a simulação.
 */
import { TreeView } from './TreeView.js';
import { ResourceDepositView } from './ResourceDepositView.js';
import { CritterView } from './CritterView.js';
import { createBuildingView } from './createBuildingView.js';
import { WallBatch } from './WallView.js';
import { BuildingView } from './BuildingView.js';
import { UnitView } from './UnitView.js';
import * as THREE from 'three';

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
    this._deposits = { ref: null, len: -1, views: [] };
    this._trees = { ref: null, len: -1, views: [] };
    this._critters = { ref: null, len: -1, views: [] };
    this._buildings = { ref: null, len: -1, views: [] };
    this._units = { ref: null, len: -1, views: [] };
    // Contexto do quadro lido pelas views (`update(frameDelta, ctx)`): LOD de animação por frustum/distância.
    this.camera = null;
    this.alpha = 1;
    this.frameIndex = 0;
    this.lodFrustum = null;
    this.lodTarget = null;
    this._frustum = new THREE.Frustum();
    this._projScreen = new THREE.Matrix4();
    /** F3-08: um InstancedMesh por facção ('human' | 'orc') com todos os segmentos de muralha. */
    this._wallBatches = {};
    this._frameDelta = 0;
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
      const next = slot.spare || [];
      next.length = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.isDisposed) continue;
        let v = this.views.get(e);
        if (!v) {
          v = make(e);
          this.views.set(e, v);
        }
        v._evFrame = frame; // marca "visto neste quadro" (sem alocar/consultar Map)
        next.push(v);
      }
      for (let i = 0; i < old.length; i++) {
        const v = old[i];
        if (v._evFrame !== frame) {
          v.dispose();
          this.views.delete(v.entity);
        }
      }
      slot.views = next;
      slot.spare = old;
    }
    for (let i = 0; i < slot.views.length; i++) slot.views[i].update(this._frameDelta, this);
  }

  /**
   * @param {number} [frameDelta]  segundos reais do quadro (0 = pausado)
   * @param {number} [alpha]  fração do próximo passo de simulação (interpolação das unidades)
   */
  update(frameDelta = 0, alpha = 1) {
    const gm = this.gm;
    const frame = ++this._frame;
    this._frameDelta = frameDelta;
    this.alpha = alpha;
    this.frameIndex++;
    const sm = gm.sceneManager;
    const camera = sm && sm.camera;
    this.camera = camera || null;
    if (camera) {
      this._projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.lodFrustum = this._frustum.setFromProjectionMatrix(this._projScreen);
      this.lodTarget = sm.cameraTarget;
    } else {
      this.lodFrustum = null;
      this.lodTarget = null;
    }
    this._sync(this._deposits, gm.resourceDeposits, e => new ResourceDepositView(e, this.scene), frame, true);
    this._sync(this._trees, gm.trees, e => new TreeView(e, this.scene, gm.treeManager), frame, true);
    this._sync(this._critters, gm.critters, e => new CritterView(e, this.scene), frame, false);
    this._sync(this._buildings, gm.buildings, e => createBuildingView(e, this.scene, f => this.getWallBatch(f)), frame, false);
    this._sync(this._units, gm.allUnits, e => new UnitView(e, this.scene), frame, false);
  }

  /** As malhas ficam na cena: o descarte da `MatchSession` as libera junto com o resto da partida. */
  dispose() {
    for (const v of this.views.values()) if (v instanceof BuildingView || v instanceof UnitView) v.dispose();
    for (const wb of Object.values(this._wallBatches)) wb.dispose();
    this._wallBatches = {};
    this.views.clear();
  }
}
