import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getOakBarkTextures,
  getPineBarkTextures,
  getOakFoliageTextures,
  getPineNeedleTextures,
  getAutumnOakFoliageTextures,
  createTreeMaterial
} from '../models/environment/treeTextures.js';

let cachedTreeGeometries = null;

function getOrCreateTreeGeometries() {
  if (cachedTreeGeometries) return cachedTreeGeometries;

  function createOrientedSegmentGeo(p1, p2, radiusBase, radiusTip, segments = 6) {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 0.001) return null;
    const geo = new THREE.CylinderGeometry(radiusTip, radiusBase, len, segments);
    geo.translate(0, len * 0.5, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    m.setPosition(p1);
    geo.applyMatrix4(m);
    return geo;
  }

  // 1. Oak Trunk Geometry
  const oakTrunkGeos = [];
  const gLower = new THREE.CylinderGeometry(0.52, 0.76, 1.8, 7);
  gLower.translate(0, 0.9, 0);
  oakTrunkGeos.push(gLower);

  const gUpper = new THREE.CylinderGeometry(0.40, 0.52, 1.7, 7);
  const mUpper = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.06, 0.15, 0.07));
  mUpper.setPosition(0.04, 2.45, 0.02);
  gUpper.applyMatrix4(mUpper);
  oakTrunkGeos.push(gUpper);

  const gKnot = new THREE.CylinderGeometry(0.16, 0.22, 0.42, 6);
  const mKnot = new THREE.Matrix4().makeRotationZ(-Math.PI * 0.38);
  mKnot.setPosition(0.46, 1.65, 0.2);
  gKnot.applyMatrix4(mKnot);
  oakTrunkGeos.push(gKnot);

  // Roots
  [
    { start: new THREE.Vector3(0.35, 0.65, 0.0),   end: new THREE.Vector3(1.15, 0.05, 0.1),   rBase: 0.28, rTip: 0.14 },
    { start: new THREE.Vector3(-0.32, 0.60, 0.15),  end: new THREE.Vector3(-1.15, 0.05, 0.35), rBase: 0.28, rTip: 0.14 },
    { start: new THREE.Vector3(0.0, 0.60, -0.32),  end: new THREE.Vector3(0.0, 0.05, -1.15),  rBase: 0.28, rTip: 0.14 }
  ].forEach(r => {
    const g = createOrientedSegmentGeo(r.start, r.end, r.rBase, r.rTip, 6);
    if (g) oakTrunkGeos.push(g);
  });

  // Branches
  [
    { start: new THREE.Vector3(0.05, 2.9, 0.02),   end: new THREE.Vector3(0.95, 3.85, 0.65),  rBase: 0.24, rTip: 0.13 },
    { start: new THREE.Vector3(-0.02, 2.85, 0.04),  end: new THREE.Vector3(-1.05, 3.80, 0.55), rBase: 0.22, rTip: 0.12 },
    { start: new THREE.Vector3(0.0, 2.90, -0.05),  end: new THREE.Vector3(0.10, 3.90, -0.90), rBase: 0.23, rTip: 0.13 }
  ].forEach(b => {
    const g = createOrientedSegmentGeo(b.start, b.end, b.rBase, b.rTip, 6);
    if (g) oakTrunkGeos.push(g);
  });
  const oakTrunkGeo = mergeGeometries(oakTrunkGeos);

  // 2. Oak Foliage Geometry
  const oakFoliageGeos = [];
  const clusters = [
    { x: 0.05,  y: 4.85, z: 0.05,  r: 1.85, rot: [0.20,  0.40, -0.15], scale: [1.05, 0.95, 1.02] },
    { x: -1.25, y: 3.55, z: 0.85,  r: 1.50, rot: [-0.25, 0.70,  0.20], scale: [1.10, 0.92, 1.00] },
    { x: 1.20,  y: 3.65, z: 0.70,  r: 1.55, rot: [0.35, -0.50, -0.15], scale: [1.00, 0.95, 1.08] },
    { x: -1.10, y: 3.75, z: -0.95, r: 1.42, rot: [0.15,  1.10,  0.25], scale: [1.05, 0.90, 1.00] },
    { x: 1.05,  y: 3.45, z: -1.05, r: 1.48, rot: [-0.20,-0.85,  0.10], scale: [1.02, 0.93, 1.05] },
    { x: -0.65, y: 4.45, z: -0.35, r: 1.25, rot: [0.40,  0.25, -0.20], scale: [0.98, 1.02, 0.98] },
    { x: 0.75,  y: 4.55, z: 0.30,  r: 1.30, rot: [-0.30,-0.35,  0.25], scale: [1.02, 0.96, 1.00] }
  ];
  clusters.forEach(c => {
    const g = new THREE.DodecahedronGeometry(c.r, 0);
    const m = new THREE.Matrix4();
    m.makeRotationFromEuler(new THREE.Euler(...c.rot));
    if (c.scale) m.scale(new THREE.Vector3(...c.scale));
    m.setPosition(c.x, c.y, c.z);
    g.applyMatrix4(m);
    oakFoliageGeos.push(g);
  });
  const oakFoliageGeo = mergeGeometries(oakFoliageGeos);

  // 3. Pine Trunk Geometry
  const pineTrunkGeos = [];
  const p1 = new THREE.CylinderGeometry(0.36, 0.54, 2.2, 7); p1.translate(0, 1.1, 0); pineTrunkGeos.push(p1);
  const p2 = new THREE.CylinderGeometry(0.24, 0.36, 2.4, 6); p2.translate(0, 3.3, 0); pineTrunkGeos.push(p2);
  const p3 = new THREE.CylinderGeometry(0.12, 0.24, 2.0, 5); p3.translate(0, 5.2, 0); pineTrunkGeos.push(p3);
  [
    { start: new THREE.Vector3(0.24, 0.45, 0.0),   end: new THREE.Vector3(0.95, 0.05, 0.0),   rBase: 0.20, rTip: 0.10 },
    { start: new THREE.Vector3(-0.20, 0.45, 0.15), end: new THREE.Vector3(-0.85, 0.05, 0.45), rBase: 0.20, rTip: 0.10 },
    { start: new THREE.Vector3(-0.10, 0.45, -0.22),end: new THREE.Vector3(-0.45, 0.05, -0.90),rBase: 0.20, rTip: 0.10 }
  ].forEach(r => {
    const g = createOrientedSegmentGeo(r.start, r.end, r.rBase, r.rTip, 5);
    if (g) pineTrunkGeos.push(g);
  });
  const pineTrunkGeo = mergeGeometries(pineTrunkGeos);

  // 4. Pine Needles Geometry
  const pineNeedleGeos = [];
  [
    { r: 2.35, h: 2.00, y: 2.40, seg: 8 },
    { r: 1.95, h: 1.80, y: 3.65, seg: 8 },
    { r: 1.50, h: 1.65, y: 4.80, seg: 7 },
    { r: 1.05, h: 1.45, y: 5.85, seg: 6 },
    { r: 0.58, h: 1.25, y: 6.75, seg: 5 }
  ].forEach(t => {
    const g = new THREE.ConeGeometry(t.r, t.h, t.seg);
    g.translate(0, t.y, 0);
    pineNeedleGeos.push(g);
  });
  const gSpire = new THREE.ConeGeometry(0.18, 0.55, 4);
  gSpire.translate(0, 7.45, 0);
  pineNeedleGeos.push(gSpire);
  const pineNeedlesGeo = mergeGeometries(pineNeedleGeos);

  cachedTreeGeometries = {
    oakTrunkGeo,
    oakFoliageGeo,
    pineTrunkGeo,
    pineNeedlesGeo
  };
  return cachedTreeGeometries;
}

export class TreeManager {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];

    // Capacity per tree type
    this.maxOaks = 120;
    this.maxPines = 120;
    this.maxAutumn = 120;

    this.oakCount = 0;
    this.pineCount = 0;
    this.autumnCount = 0;

    const geos = getOrCreateTreeGeometries();

    // Materials
    this.oakBarkMat = createTreeMaterial(getOakBarkTextures(), { bumpScale: 0.02, roughness: 0.85, flatShading: false });
    this.oakFoliageMat = createTreeMaterial(getOakFoliageTextures(), { bumpScale: 0.015, roughness: 0.72, flatShading: true });
    this.pineBarkMat = createTreeMaterial(getPineBarkTextures(), { bumpScale: 0.02, roughness: 0.85, flatShading: false });
    this.pineNeedleMat = createTreeMaterial(getPineNeedleTextures(), { bumpScale: 0.015, roughness: 0.70, flatShading: true });
    this.autumnFoliageMat = createTreeMaterial(getAutumnOakFoliageTextures(), { bumpScale: 0.015, roughness: 0.72, flatShading: true });

    // 6 InstancedMeshes covering all trees
    this.oakTrunkMesh = new THREE.InstancedMesh(geos.oakTrunkGeo, this.oakBarkMat, this.maxOaks);
    this.oakFoliageMesh = new THREE.InstancedMesh(geos.oakFoliageGeo, this.oakFoliageMat, this.maxOaks);

    this.pineTrunkMesh = new THREE.InstancedMesh(geos.pineTrunkGeo, this.pineBarkMat, this.maxPines);
    this.pineNeedlesMesh = new THREE.InstancedMesh(geos.pineNeedlesGeo, this.pineNeedleMat, this.maxPines);

    this.autumnTrunkMesh = new THREE.InstancedMesh(geos.oakTrunkGeo, this.oakBarkMat, this.maxAutumn);
    this.autumnFoliageMesh = new THREE.InstancedMesh(geos.oakFoliageGeo, this.autumnFoliageMat, this.maxAutumn);

    this.instancedMeshes = [
      this.oakTrunkMesh,
      this.oakFoliageMesh,
      this.pineTrunkMesh,
      this.pineNeedlesMesh,
      this.autumnTrunkMesh,
      this.autumnFoliageMesh
    ];

    this.instancedMeshes.forEach(im => {
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.isTreeInstanced = true;
      im.userData.treeEntities = [];
      this.scene.add(im);
    });

    this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  registerTree(tree, x, y, z, rotY, scale, type) {
    let trunkMesh, foliageMesh, idx;

    if (type === 'pine') {
      trunkMesh = this.pineTrunkMesh;
      foliageMesh = this.pineNeedlesMesh;
      idx = this.pineCount++;
    } else if (type === 'autumn') {
      trunkMesh = this.autumnTrunkMesh;
      foliageMesh = this.autumnFoliageMesh;
      idx = this.autumnCount++;
    } else {
      trunkMesh = this.oakTrunkMesh;
      foliageMesh = this.oakFoliageMesh;
      idx = this.oakCount++;
    }

    tree.instanceType = type;
    tree.instanceIndex = idx;
    tree.trunkMesh = trunkMesh;
    tree.foliageMesh = foliageMesh;

    // Build base matrix
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
    tree.baseMatrix = matrix.clone();

    trunkMesh.setMatrixAt(idx, matrix);
    foliageMesh.setMatrixAt(idx, matrix);

    trunkMesh.userData.treeEntities[idx] = tree;
    foliageMesh.userData.treeEntities[idx] = tree;

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;

    this.trees.push(tree);
  }

  shakeTree(tree, angle) {
    if (tree.isDead || !tree.baseMatrix || !tree.trunkMesh) return;
    const tempMatrix = tree.baseMatrix.clone();
    const rotZ = new THREE.Matrix4().makeRotationZ(angle);
    tempMatrix.multiply(rotZ);

    tree.trunkMesh.setMatrixAt(tree.instanceIndex, tempMatrix);
    tree.foliageMesh.setMatrixAt(tree.instanceIndex, tempMatrix);
    tree.trunkMesh.instanceMatrix.needsUpdate = true;
    tree.foliageMesh.instanceMatrix.needsUpdate = true;
  }

  resetTreeMatrix(tree) {
    if (tree.isDead || !tree.baseMatrix || !tree.trunkMesh) return;
    tree.trunkMesh.setMatrixAt(tree.instanceIndex, tree.baseMatrix);
    tree.foliageMesh.setMatrixAt(tree.instanceIndex, tree.baseMatrix);
    tree.trunkMesh.instanceMatrix.needsUpdate = true;
    tree.foliageMesh.instanceMatrix.needsUpdate = true;
  }

  hideTree(tree) {
    if (!tree.trunkMesh) return;
    tree.trunkMesh.setMatrixAt(tree.instanceIndex, this.zeroMatrix);
    tree.foliageMesh.setMatrixAt(tree.instanceIndex, this.zeroMatrix);
    tree.trunkMesh.instanceMatrix.needsUpdate = true;
    tree.foliageMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.instancedMeshes.forEach(im => {
      this.scene.remove(im);
      if (im.geometry) im.geometry.dispose();
    });
    this.trees = [];
    this.oakCount = 0;
    this.pineCount = 0;
    this.autumnCount = 0;
  }
}
