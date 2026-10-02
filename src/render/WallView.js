import * as THREE from 'three';
import { BuildingView } from './BuildingView.js';
import { getWallGeometry, getWallMaterial } from '../models/buildings/WallModel.js';

/** F3-08: máximo de instâncias por facção no InstancedMesh de segmentos (excedente não é desenhado). */
export const WALL_BATCH_CAP = 400;

const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Um InstancedMesh por facção com todos os segmentos de muralha (em obra ou concluídos):
 * 1 draw call por facção, não importa quantos segmentos existam (F3-08 item 8).
 */
export class WallBatch {
  constructor(scene, faction, cap = WALL_BATCH_CAP) {
    this.faction = faction;
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(getWallGeometry(faction), getWallMaterial(faction), cap);
    this.mesh.name = `WallBatch_${faction}`;
    this.mesh.frustumCulled = false; // caixa de culling seria só a do segmento-base
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    /** Índices liberados por muralhas destruídas, reaproveitados por `add`. */
    this._free = [];
    this._used = 0;
    this.scene = scene;
    if (scene) scene.add(this.mesh);
  }

  /** @returns {number} índice da instância, ou -1 se o teto foi atingido */
  add() {
    let idx;
    if (this._free.length > 0) {
      idx = this._free.pop();
    } else if (this._used < this.cap) {
      idx = this._used++;
      this.mesh.count = this._used;
    } else {
      return -1;
    }
    return idx;
  }

  set(idx, x, y, z, scaleY = 1) {
    if (idx < 0) return;
    _pos.set(x, y, z);
    _scale.set(1, scaleY, 1);
    _m.compose(_pos, _quat, _scale);
    this.mesh.setMatrixAt(idx, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(idx) {
    if (idx < 0) return;
    this.mesh.setMatrixAt(idx, _zeroMatrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(idx) {
    if (idx < 0) return;
    this.hide(idx);
    this._free.push(idx);
  }

  dispose() {
    if (this.scene) this.scene.remove(this.mesh);
    this.mesh.dispose();
  }
}

// Malha de picking invisível (cliques/seleção): 0 draw calls (`visible = false`), mas o
// Raycaster ainda a testa. Compartilhada por todos os segmentos.
const pickGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
pickGeo.translate(0, 1.2, 0);
const pickMat = new THREE.MeshBasicMaterial({ visible: false });

/**
 * F3-08 / F2-08c — view de um segmento de muralha (`src/sim/Wall.js`). Reaproveita `BuildingView` (andaime/obra por
 * estágios, barra de vida), mas o corpo visual vive num InstancedMesh por facção (`WallBatch`) em vez de um Mesh por
 * segmento; aqui só há um hit-proxy invisível para picking.
 */
export class WallView extends BuildingView {
  /** @param {import('../sim/Wall.js').Wall} wall  @param {WallBatch|null} [batch] */
  constructor(wall, scene, batch = null) {
    super(wall, scene);
    if (batch) this.attachToBatch(batch);
  }

  createBuildingMesh() {
    const g = new THREE.Group();
    g.name = 'WallPick';
    const pick = new THREE.Mesh(pickGeo, pickMat);
    pick.visible = false;
    g.add(pick);
    return g;
  }

  createScaffoldMesh() {
    const g = new THREE.Group();
    g.name = 'Scaffold';
    return g;
  }

  attachToBatch(batch) {
    this._batch = batch;
    this._batchIdx = batch.add();
    this._batchShown = null;
    this._syncBatch(true);
  }

  updateConstructionState() {
    super.updateConstructionState();
    if (this._batch) this._syncBatch(true);
  }

  _syncBatch(force = false) {
    if (!this._batch || this._batchIdx < 0) return;
    const e = this.entity;
    const shown = !e.isDead && this._shown();
    if (!force && shown === this._batchShown) return;
    this._batchShown = shown;
    if (!shown) {
      this._batch.hide(this._batchIdx);
      return;
    }
    const p = e.mesh.position;
    const factor = e.isConstructed ? 1 : Math.max(0.1, e.buildProgress / 100);
    this._batch.set(this._batchIdx, p.x, p.y, p.z, factor);
  }

  update(frameDelta, ctx) {
    super.update(frameDelta, ctx);
    this._syncBatch(false); // reflete a névoa de guerra
  }

  _releaseBatch() {
    if (this._batch) {
      this._batch.remove(this._batchIdx);
      this._batch = null;
      this._batchIdx = -1;
    }
  }

  dispose() {
    this._releaseBatch();
    super.dispose();
  }
}
