import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGraniteBoulderTextures, getRiverPebbleTextures } from '../models/environment/rockTextures.js';
import {
  getFlowerTextures,
  getFlowerCenterTextures,
  getBerryBushTextures,
  getBerryTextures,
  getGrassBladeTextures,
  getMushroomTextures,
  getStumpBarkTextures,
  getWaterLilyTextures,
  getLotusTextures
} from '../models/environment/floraTextures.js';

function createPBRMat(tex, opts = {}) {
  const matParams = {
    map: tex.map || null,
    roughnessMap: tex.roughnessMap || null,
    bumpMap: tex.bumpMap || null,
    bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.05,
    roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.0,
    flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
    ...opts
  };
  return new THREE.MeshStandardMaterial(matParams);
}

export class Decorations {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'InstancedDecorations';

    this.createInstancedGrassTufts();
    this.createInstancedPebbles();
    this.createInstancedBoulders();
    this.createInstancedBerryBushes();
    this.createInstancedMushroomStumps();
    this.createInstancedWaterLilies();
    this.createInstancedFlowerPatches();

    this.scene.add(this.group);
  }

  // --- 1. INSTANCED GRASS TUFTS (1 Draw Call for 60 Grass Tufts) ---
  createInstancedGrassTufts() {
    const bladeGeos = [];
    const numBlades = 12;
    for (let i = 0; i < numBlades; i++) {
      const ang = (i / numBlades) * Math.PI * 2;
      const h = 0.52 + (i % 3) * 0.08;
      const g = new THREE.ConeGeometry(0.045, h, 3);
      g.translate(0, h * 0.5, 0);

      const m = new THREE.Matrix4().makeRotationZ(0.24 + (i % 2) * 0.08);
      m.premultiply(new THREE.Matrix4().makeRotationY(ang));
      m.setPosition(Math.cos(ang) * 0.08, 0, Math.sin(ang) * 0.08);
      g.applyMatrix4(m);
      bladeGeos.push(g);
    }

    const tuftGeo = mergeGeometries(bladeGeos);
    const grassMat = createPBRMat(getGrassBladeTextures(), {
      roughness: 0.5,
      bumpScale: 0.04,
      side: THREE.DoubleSide
    });

    const count = 60;
    const instancedGrass = new THREE.InstancedMesh(tuftGeo, grassMat, count);
    instancedGrass.name = 'InstancedGrassTufts';
    instancedGrass.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const rx = (Math.random() - 0.5) * 130;
      const rz = (Math.random() - 0.5) * 130;
      const h = this.terrain.getHeight(rx, rz);

      if (h > 1.8) {
        dummy.position.set(rx, h, rz);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        const s = 0.85 + Math.random() * 0.35;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        instancedGrass.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instancedGrass.setMatrixAt(i, dummy.matrix);
      }
    }

    instancedGrass.instanceMatrix.needsUpdate = true;
    this.group.add(instancedGrass);
  }

  // --- 2. INSTANCED RIVER PEBBLES (1 Draw Call for 50 Pebble Clusters) ---
  createInstancedPebbles() {
    const pebbleGeos = [];
    const p1 = new THREE.DodecahedronGeometry(0.32, 1);
    p1.scale(1.2, 0.55, 0.95);
    p1.translate(0, 0.16, 0);
    pebbleGeos.push(p1);

    const p2 = new THREE.DodecahedronGeometry(0.24, 1);
    p2.scale(1.1, 0.5, 0.9);
    p2.translate(0.35, 0.12, 0.25);
    pebbleGeos.push(p2);

    const p3 = new THREE.DodecahedronGeometry(0.18, 1);
    p3.scale(1.1, 0.45, 0.9);
    p3.translate(-0.3, 0.09, -0.2);
    pebbleGeos.push(p3);

    const clusterGeo = mergeGeometries(pebbleGeos);
    const pebbleMat = createPBRMat(getRiverPebbleTextures(), {
      flatShading: false,
      roughness: 0.35,
      bumpScale: 0.03
    });

    const count = 50;
    const instancedPebbles = new THREE.InstancedMesh(clusterGeo, pebbleMat, count);
    instancedPebbles.name = 'InstancedPebbles';
    instancedPebbles.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const rx = (Math.random() - 0.5) * 130;
      const rz = (Math.random() - 0.5) * 130;
      const h = this.terrain.getHeight(rx, rz);

      if (h > 0.4 && h < 3.2) {
        dummy.position.set(rx, h + 0.05, rz);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        const s = 0.8 + Math.random() * 0.4;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        instancedPebbles.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instancedPebbles.setMatrixAt(i, dummy.matrix);
      }
    }

    instancedPebbles.instanceMatrix.needsUpdate = true;
    this.group.add(instancedPebbles);
  }

  // --- 3. INSTANCED BOULDERS (1 Draw Call for 10 Granite Boulders) ---
  createInstancedBoulders() {
    const bGeos = [];
    const main = new THREE.DodecahedronGeometry(1.0, 0);
    main.scale(1.55, 1.15, 1.3);
    main.translate(0, 0.95, 0);
    bGeos.push(main);

    const left = new THREE.DodecahedronGeometry(0.8, 0);
    left.scale(1.2, 0.75, 0.95);
    left.translate(-0.95, 0.58, 0.25);
    bGeos.push(left);

    const right = new THREE.DodecahedronGeometry(0.85, 0);
    right.scale(1.15, 0.85, 1.2);
    right.translate(0.9, 0.62, -0.2);
    bGeos.push(right);

    const crest = new THREE.DodecahedronGeometry(0.55, 0);
    crest.scale(1.3, 0.65, 0.9);
    crest.translate(0.1, 1.85, -0.15);
    bGeos.push(crest);

    const boulderGeo = mergeGeometries(bGeos);
    const rockMat = createPBRMat(getGraniteBoulderTextures(), {
      flatShading: true,
      roughness: 0.88,
      bumpScale: 0.08
    });

    const positions = [
      { x: 51, z: -47, s: 1.7 },
      { x: 29, z: -45, s: 1.2 },
      { x: 55, z: -27, s: 0.8 },
      { x: -51, z: 47, s: 1.7 },
      { x: -29, z: 45, s: 1.6 },
      { x: -55, z: 27, s: 1.2 },
      { x: -14, z: -12, s: 1.6 },
      { x: 14, z: 12, s: 1.6 },
      { x: -3, z: 16, s: 1.2 },
      { x: 3, z: -16, s: 1.2 }
    ];

    const instancedBoulders = new THREE.InstancedMesh(boulderGeo, rockMat, positions.length);
    instancedBoulders.name = 'InstancedBoulders';
    instancedBoulders.castShadow = true;
    instancedBoulders.receiveShadow = true;

    const dummy = new THREE.Object3D();
    positions.forEach((bp, i) => {
      const h = this.terrain.getHeight(bp.x, bp.z);
      dummy.position.set(bp.x, h, bp.z);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.scale.set(bp.s, bp.s, bp.s);
      dummy.updateMatrix();
      instancedBoulders.setMatrixAt(i, dummy.matrix);
    });

    instancedBoulders.instanceMatrix.needsUpdate = true;
    this.group.add(instancedBoulders);
  }

  // --- 4. INSTANCED BERRY BUSHES (2 Draw Calls: Foliage + Berries) ---
  createInstancedBerryBushes() {
    const bushPositions = [
      { x: 31, z: -39 },
      { x: 43, z: -44 },
      { x: -31, z: 39 },
      { x: -43, z: 44 },
      { x: 8, z: -3 },
      { x: -8, z: 3 }
    ];

    // Foliage geometry
    const fGeos = [];
    const mainDode = new THREE.DodecahedronGeometry(0.85, 0);
    mainDode.scale(1.2, 0.9, 1.1);
    mainDode.translate(0, 0.85, 0);
    fGeos.push(mainDode);

    const sideL = new THREE.DodecahedronGeometry(0.65, 0);
    sideL.scale(1.0, 0.8, 0.9);
    sideL.translate(-0.55, 0.65, 0.2);
    fGeos.push(sideL);

    const sideR = new THREE.DodecahedronGeometry(0.68, 0);
    sideR.scale(1.0, 0.8, 0.95);
    sideR.translate(0.55, 0.68, -0.15);
    fGeos.push(sideR);

    const bushFoliageGeo = mergeGeometries(fGeos);
    const foliageMat = createPBRMat(getBerryBushTextures('red'), {
      flatShading: true,
      roughness: 0.55,
      bumpScale: 0.05
    });

    // Berry spheres geometry
    const bGeos = [];
    for (let b = 0; b < 14; b++) {
      const sp = new THREE.SphereGeometry(0.10, 6, 5);
      const ang = (b / 14) * Math.PI * 2;
      const rad = 0.72 + (b % 3) * 0.12;
      const by = 0.65 + Math.sin(b * 1.8) * 0.25;
      sp.translate(Math.cos(ang) * rad, by, Math.sin(ang) * rad);
      bGeos.push(sp);
    }
    const berryGeo = mergeGeometries(bGeos);
    const berryMat = createPBRMat(getBerryTextures('red'), {
      roughness: 0.2,
      bumpScale: 0.03
    });

    const instancedFoliage = new THREE.InstancedMesh(bushFoliageGeo, foliageMat, bushPositions.length);
    const instancedBerries = new THREE.InstancedMesh(berryGeo, berryMat, bushPositions.length);
    instancedFoliage.castShadow = true;
    instancedFoliage.receiveShadow = true;
    instancedBerries.castShadow = true;

    const dummy = new THREE.Object3D();
    bushPositions.forEach((bp, i) => {
      const h = this.terrain.getHeight(bp.x, bp.z);
      dummy.position.set(bp.x, h, bp.z);
      dummy.rotation.y = (i * Math.PI) / 3;
      dummy.scale.set(1.1, 1.1, 1.1);
      dummy.updateMatrix();

      instancedFoliage.setMatrixAt(i, dummy.matrix);
      instancedBerries.setMatrixAt(i, dummy.matrix);
    });

    instancedFoliage.instanceMatrix.needsUpdate = true;
    instancedBerries.instanceMatrix.needsUpdate = true;
    this.group.add(instancedFoliage);
    this.group.add(instancedBerries);
  }

  // --- 5. INSTANCED MUSHROOM STUMPS (2 Draw Calls: Stump + Mushrooms) ---
  createInstancedMushroomStumps() {
    const stumpPositions = [
      { x: 26, z: -35 },
      { x: -26, z: 35 },
      { x: 4, z: -8 },
      { x: -4, z: 8 }
    ];

    // Wood Stump
    const sGeos = [];
    const trunk = new THREE.CylinderGeometry(0.48, 0.62, 0.75, 7);
    trunk.translate(0, 0.375, 0);
    sGeos.push(trunk);

    const root1 = new THREE.CylinderGeometry(0.12, 0.22, 0.6, 5);
    root1.translate(0.5, 0.2, 0.2);
    sGeos.push(root1);
    const root2 = new THREE.CylinderGeometry(0.12, 0.22, 0.6, 5);
    root2.translate(-0.45, 0.2, -0.3);
    sGeos.push(root2);

    const stumpGeo = mergeGeometries(sGeos);
    const stumpMat = createPBRMat(getStumpBarkTextures(), {
      flatShading: true,
      roughness: 0.85,
      bumpScale: 0.06
    });

    // Mushrooms
    const mGeos = [];
    for (let m = 0; m < 5; m++) {
      const cap = new THREE.ConeGeometry(0.14, 0.18, 6);
      const ang = (m / 5) * Math.PI * 1.5 - 0.5;
      const mr = 0.55 + (m % 2) * 0.1;
      cap.translate(Math.cos(ang) * mr, 0.25 + (m % 3) * 0.08, Math.sin(ang) * mr);
      mGeos.push(cap);
    }
    const mushroomGeo = mergeGeometries(mGeos);
    const mushroomMat = createPBRMat(getMushroomTextures(), {
      roughness: 0.35,
      bumpScale: 0.04
    });

    const instancedStumps = new THREE.InstancedMesh(stumpGeo, stumpMat, stumpPositions.length);
    const instancedMushrooms = new THREE.InstancedMesh(mushroomGeo, mushroomMat, stumpPositions.length);
    instancedStumps.castShadow = true;
    instancedStumps.receiveShadow = true;
    instancedMushrooms.castShadow = true;

    const dummy = new THREE.Object3D();
    stumpPositions.forEach((sp, i) => {
      const h = this.terrain.getHeight(sp.x, sp.z);
      dummy.position.set(sp.x, h, sp.z);
      dummy.rotation.y = i * 1.2;
      dummy.scale.set(1.0, 1.0, 1.0);
      dummy.updateMatrix();

      instancedStumps.setMatrixAt(i, dummy.matrix);
      instancedMushrooms.setMatrixAt(i, dummy.matrix);
    });

    instancedStumps.instanceMatrix.needsUpdate = true;
    instancedMushrooms.instanceMatrix.needsUpdate = true;
    this.group.add(instancedStumps);
    this.group.add(instancedMushrooms);
  }

  // --- 6. INSTANCED WATER LILIES (2 Draw Calls: Pads + Lotus Petals) ---
  createInstancedWaterLilies() {
    const lilyPositions = [
      { x: -9, z: -6 },
      { x: -6, z: -9 },
      { x: 9, z: 6 },
      { x: 6, z: 9 },
      { x: -18, z: -1 },
      { x: 18, z: 1 }
    ];

    // Lily pad geometry (flat disc)
    const padGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.03, 10);
    const padMat = createPBRMat(getWaterLilyTextures(), {
      roughness: 0.35,
      bumpScale: 0.03
    });

    // Lotus flower geometry (central dome + petals)
    const pGeos = [];
    const dome = new THREE.SphereGeometry(0.12, 6, 5);
    dome.translate(0, 0.08, 0);
    pGeos.push(dome);

    for (let p = 0; p < 8; p++) {
      const petal = new THREE.ConeGeometry(0.08, 0.22, 4);
      const pa = (p / 8) * Math.PI * 2;
      petal.translate(0, 0.11, 0);
      const m = new THREE.Matrix4().makeRotationZ(0.5);
      m.premultiply(new THREE.Matrix4().makeRotationY(pa));
      m.setPosition(Math.cos(pa) * 0.1, 0.04, Math.sin(pa) * 0.1);
      petal.applyMatrix4(m);
      pGeos.push(petal);
    }
    const lotusGeo = mergeGeometries(pGeos);
    const lotusMat = createPBRMat(getLotusTextures(), {
      roughness: 0.3,
      bumpScale: 0.04
    });

    const instancedPads = new THREE.InstancedMesh(padGeo, padMat, lilyPositions.length);
    const instancedLotus = new THREE.InstancedMesh(lotusGeo, lotusMat, lilyPositions.length);

    const dummy = new THREE.Object3D();
    lilyPositions.forEach((lp, i) => {
      dummy.position.set(lp.x, 0.06, lp.z);
      dummy.rotation.y = (i * Math.PI) / 3;
      dummy.scale.set(1.0, 1.0, 1.0);
      dummy.updateMatrix();

      instancedPads.setMatrixAt(i, dummy.matrix);
      instancedLotus.setMatrixAt(i, dummy.matrix);
    });

    instancedPads.instanceMatrix.needsUpdate = true;
    instancedLotus.instanceMatrix.needsUpdate = true;
    this.group.add(instancedPads);
    this.group.add(instancedLotus);
  }

  // --- 7. INSTANCED FLOWER PATCHES (2 Draw Calls: Leaves + Petals) ---
  createInstancedFlowerPatches() {
    const patchPositions = [
      { x: 41, z: -31 }, { x: 34, z: -38 }, { x: 47, z: -36 },
      { x: 40, z: -43 }, { x: 32, z: -30 }, { x: 45, z: -41 },
      { x: 6, z: -7 },   { x: -7, z: 6 },   { x: 3, z: 4 },
      { x: -4, z: -3 },  { x: -32, z: 31 }, { x: -41, z: 39 },
      { x: -47, z: 34 }
    ];

    // Patch Leaves & Stems
    const leafGeos = [];
    for (let f = 0; f < 10; f++) {
      const ang = (f / 10) * Math.PI * 2;
      const dist = 0.3 + (f % 3) * 0.25;
      const stem = new THREE.CylinderGeometry(0.025, 0.03, 0.35, 4);
      stem.translate(Math.cos(ang) * dist, 0.175, Math.sin(ang) * dist);
      leafGeos.push(stem);

      const leaf = new THREE.ConeGeometry(0.06, 0.22, 3);
      leaf.translate(Math.cos(ang) * (dist + 0.08), 0.06, Math.sin(ang) * (dist + 0.08));
      leafGeos.push(leaf);
    }
    const flowerLeafGeo = mergeGeometries(leafGeos);
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x489639,
      roughness: 0.55,
      flatShading: true
    });

    // Petals & Pollen Centers
    const petalGeos = [];
    for (let f = 0; f < 10; f++) {
      const ang = (f / 10) * Math.PI * 2;
      const dist = 0.3 + (f % 3) * 0.25;
      const px = Math.cos(ang) * dist;
      const pz = Math.sin(ang) * dist;

      // Pollen center
      const center = new THREE.SphereGeometry(0.065, 6, 5);
      center.translate(px, 0.36, pz);
      petalGeos.push(center);

      // 5 Petals around center
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        const pet = new THREE.ConeGeometry(0.05, 0.16, 4);
        pet.translate(0, 0.08, 0);
        const m = new THREE.Matrix4().makeRotationZ(0.7);
        m.premultiply(new THREE.Matrix4().makeRotationY(pa));
        m.setPosition(px + Math.cos(pa) * 0.09, 0.35, pz + Math.sin(pa) * 0.09);
        pet.applyMatrix4(m);
        petalGeos.push(pet);
      }
    }
    const flowerPetalGeo = mergeGeometries(petalGeos);
    const petalMat = createPBRMat(getFlowerTextures('yellow'), {
      roughness: 0.4,
      bumpScale: 0.04
    });

    const instancedLeaves = new THREE.InstancedMesh(flowerLeafGeo, leafMat, patchPositions.length);
    const instancedPetals = new THREE.InstancedMesh(flowerPetalGeo, petalMat, patchPositions.length);
    instancedLeaves.receiveShadow = true;
    instancedPetals.receiveShadow = true;

    const dummy = new THREE.Object3D();
    patchPositions.forEach((pp, i) => {
      const h = this.terrain.getHeight(pp.x, pp.z);
      dummy.position.set(pp.x, h, pp.z);
      dummy.rotation.y = i * 0.9;
      dummy.scale.set(1.1, 1.1, 1.1);
      dummy.updateMatrix();

      instancedLeaves.setMatrixAt(i, dummy.matrix);
      instancedPetals.setMatrixAt(i, dummy.matrix);
    });

    instancedLeaves.instanceMatrix.needsUpdate = true;
    instancedPetals.instanceMatrix.needsUpdate = true;
    this.group.add(instancedLeaves);
    this.group.add(instancedPetals);
  }
}
