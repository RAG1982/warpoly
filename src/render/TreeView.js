import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';

// Material invisível compartilhado dos hit-proxies de árvore (raycast/seleção).
const hitProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

/**
 * TreeView (F2-08b): malha de uma `Tree` da simulação. Registra a instância no `TreeManager`
 * (1 draw call para todas), cria o hit-proxy clicável, o tremor ao ser golpeada, a árvore caindo
 * (malha própria) e o toco. Lê `isDead/shakeTimer/fallProgress` da sim; nunca escreve nela.
 */
export class TreeView {
  /**
   * @param {import('../sim/Tree.js').Tree} tree
   * @param {THREE.Scene} scene
   * @param {import('../world/TreeManager.js').TreeManager|null} treeManager
   */
  constructor(tree, scene, treeManager) {
    this.tree = tree;
    this.entity = tree;
    this.scene = scene;
    this.treeManager = treeManager;
    this.disposed = false;
    this.fallingMesh = null;
    this.stumpMesh = null;
    this._shaking = false;
    // Direção da queda: puramente visual (não afeta o estado da simulação).
    this.fallDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();

    const s = tree.scale;
    const { x, y, z } = tree.basePos;
    this.basePos = new THREE.Vector3(x, y, z);
    if (treeManager) {
      treeManager.registerTree(this, x, y, z, tree.baseRotY, s, tree.treeType);
      const hitGeo = new THREE.CylinderGeometry(0.85 * s, 1.1 * s, 4.5 * s, 6);
      hitGeo.translate(0, 2.25 * s, 0);
      this.root = new THREE.Mesh(hitGeo, hitProxyMaterial);
      this.root.position.set(x, y, z);
    } else {
      this.root = ModelFactory.createTree(tree.treeType);
      this.root.position.set(x, y, z);
      this.root.rotation.y = tree.baseRotY;
      this.root.scale.set(s, s, s);
    }
    this.root.userData.entity = tree;
    scene.add(this.root);
  }

  get isDead() {
    return this.tree.isDead;
  }

  _startFall() {
    const t = this.tree;
    if (this.treeManager) {
      this.treeManager.hideTree(this);
      this.fallingMesh = ModelFactory.createTree(t.treeType);
      this.fallingMesh.position.copy(this.basePos);
      this.fallingMesh.rotation.y = t.baseRotY;
      this.fallingMesh.scale.set(t.scale, t.scale, t.scale);
      this.scene.add(this.fallingMesh);
    }
  }

  _createStump() {
    if (this.stumpMesh) return;
    const t = this.tree;
    this.stumpMesh = ModelFactory.createMushroomStump();
    this.stumpMesh.position.copy(this.basePos);
    this.stumpMesh.rotation.y = t.baseRotY;
    this.stumpMesh.scale.set(t.scale, t.scale, t.scale);
    this.stumpMesh.userData.entity = t;
    this.stumpMesh.traverse(child => {
      if (child.isMesh) child.userData.entity = t;
    });
    this.scene.add(this.stumpMesh);

    // O hit-proxy vira um cilindro baixo para o clique no toco ser preciso.
    if (this.treeManager) {
      if (this.root.geometry) this.root.geometry.dispose();
      const stumpHitGeo = new THREE.CylinderGeometry(0.85 * t.scale, 0.95 * t.scale, 1.0 * t.scale, 6);
      stumpHitGeo.translate(0, 0.5 * t.scale, 0);
      this.root.geometry = stumpHitGeo;
      this.root.position.copy(this.basePos);
    } else {
      this.scene.remove(this.root);
    }
  }

  update() {
    if (this.disposed) return;
    const t = this.tree;
    if (t.isDisposed) {
      this.dispose();
      return;
    }

    if (!t.isDead) {
      if (t.shakeTimer > 0) {
        const angle = Math.sin(t.shakeTimer * 40) * 0.08;
        if (this.treeManager) this.treeManager.shakeTree(this, angle);
        else this.root.rotation.z = angle;
        this._shaking = true;
      } else if (this._shaking) {
        if (this.treeManager) this.treeManager.resetTreeMatrix(this);
        else this.root.rotation.z = 0;
        this._shaking = false;
      }
      return;
    }

    if (this.stumpMesh) return;
    if (!this.fallingMesh && !this._fallStarted) {
      this._fallStarted = true;
      this._startFall();
    }
    const p = Math.min(t.fallProgress, 1);
    const target = this.fallingMesh || this.root;
    const tilt = (p * Math.PI) / 2;
    target.rotation.x = this.fallDir.z * tilt;
    target.rotation.z = -this.fallDir.x * tilt;
    target.position.y = this.basePos.y - p * 0.6;
    if (t.fallProgress >= 1) {
      this._createStump();
      if (this.fallingMesh) {
        this.scene.remove(this.fallingMesh);
        this.fallingMesh = null;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.treeManager) this.treeManager.hideTree(this);
    this.scene.remove(this.root);
    if (this.root.geometry) this.root.geometry.dispose();
    if (this.fallingMesh) {
      this.scene.remove(this.fallingMesh);
      this.fallingMesh = null;
    }
    if (this.stumpMesh) {
      this.scene.remove(this.stumpMesh);
      this.stumpMesh = null;
    }
  }
}
