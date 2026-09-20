import * as THREE from 'three';
import { materials, enableShadows } from '../materials.js';
import { getGraniteBoulderTextures, getRiverPebbleTextures } from './rockTextures.js';
import {
  getFlowerTextures,
  getFlowerCenterTextures,
  getBerryBushTextures,
  getBerryTextures,
  getGrassBladeTextures,
  getMushroomTextures,
  getMushroomStemTextures,
  getMushroomGillsTextures,
  getStumpBarkTextures,
  getStumpTopTextures,
  getWaterLilyTextures,
  getLotusTextures
} from './floraTextures.js';

/**
 * Next-Gen Stylized Environment & Ground Decorations for WarPoly
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Models:
 * 1. createFlowerPatch(type): Multi-flower patch with leafy rosette bases, petal gradients, and glowing pollen centers.
 * 2. createBerryBush(type): Lush rounded shrub with protruding glossy red/blue berry clusters.
 * 3. createBoulder(size): Imposing stylized faceted mountain boulder with moss cap, rock strata, and scree talus.
 * 4. createPebbles(count): Water-worn river stones with smooth bevels, quartz veins, and polished specular finish.
 * 5. createGrassTuft(): Elegant stylized grass tuft with multiple curved blades of varying heights and gradients.
 * 6. createMushroomStump(): Weathered mossy tree stump with vibrant spotted fairy mushrooms and chanterelles.
 * 7. createWaterLily(): Floating circular emerald lily pad with notch & lotus blossom with yellow stamen.
 */

// Cached PBR Materials to maximize performance and minimize draw calls
const pbrMaterialCache = new Map();

function getCachedPBRMaterial(key, createFn) {
  if (!pbrMaterialCache.has(key)) {
    pbrMaterialCache.set(key, createFn());
  }
  return pbrMaterialCache.get(key);
}

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
  if (tex.metalnessMap !== undefined) {
    matParams.metalnessMap = tex.metalnessMap;
  }
  return new THREE.MeshStandardMaterial(matParams);
}

/* ==========================================================================
   1. FLOWER PATCH (Flores Estilizadas)
   ========================================================================== */
const FLOWER_TYPES = ['pink', 'white', 'yellow', 'blue'];

/**
 * Creates a cluster of low-poly stylized flowers with realistic leafy bases,
 * textured petal gradients, and glowing golden pollen centers.
 * @param {'pink'|'white'|'yellow'|'blue'|'mixed'} [type='pink']
 * @returns {THREE.Group}
 */
export function createFlowerPatch(type = 'pink') {
  const patchGroup = new THREE.Group();
  patchGroup.name = 'FlowerPatch';

  const count = 9 + Math.floor(Math.random() * 5); // 9-13 flowers
  const centerMat = getCachedPBRMaterial('flower_center_mat', () => {
    const tex = getFlowerCenterTextures();
    return createPBRMat(tex, {
      roughness: 0.8,
      bumpScale: 0.04,
      emissive: new THREE.Color(0xd97706),
      emissiveIntensity: 0.28
    });
  });

  const leafMat = getCachedPBRMaterial('flower_leaf_mat', () => {
    return new THREE.MeshStandardMaterial({
      color: 0x3f721d,
      roughness: 0.65,
      flatShading: true
    });
  });

  for (let i = 0; i < count; i++) {
    const flower = new THREE.Group();
    const flowerType = type === 'mixed'
      ? FLOWER_TYPES[Math.floor(Math.random() * FLOWER_TYPES.length)]
      : (FLOWER_TYPES.includes(type) ? type : 'pink');

    const petalMat = getCachedPBRMaterial(`flower_petal_${flowerType}`, () => {
      const tex = getFlowerTextures(flowerType);
      return createPBRMat(tex, {
        roughness: 0.6,
        bumpScale: 0.03,
        side: THREE.DoubleSide
      });
    });

    const stemH = 0.32 + Math.random() * 0.18;

    // --- 1. Base Leaf Rosette (spreading foliage on ground) ---
    const rosetteGroup = new THREE.Group();
    const numLeaves = 4 + Math.floor(Math.random() * 3);
    for (let l = 0; l < numLeaves; l++) {
      const lAngle = (l / numLeaves) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const lLen = 0.18 + Math.random() * 0.08;
      const leafGeo = new THREE.ConeGeometry(0.06, lLen, 4);
      const leafMesh = new THREE.Mesh(leafGeo, leafMat);
      leafMesh.rotation.x = Math.PI * 0.42;
      leafMesh.rotation.y = lAngle;
      leafMesh.position.set(Math.cos(lAngle) * (lLen * 0.4), 0.02, Math.sin(lAngle) * (lLen * 0.4));
      rosetteGroup.add(leafMesh);
    }
    flower.add(rosetteGroup);

    // --- 2. Curved / Tilted Stem ---
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, stemH, 5);
    const stemMesh = new THREE.Mesh(stemGeo, leafMat);
    stemMesh.position.y = stemH * 0.5;
    const tiltX = (Math.random() - 0.5) * 0.18;
    const tiltZ = (Math.random() - 0.5) * 0.18;
    stemMesh.rotation.set(tiltX, 0, tiltZ);
    flower.add(stemMesh);

    // --- 3. Calyx Cup ---
    const calyxGeo = new THREE.ConeGeometry(0.07, 0.09, 5);
    const calyxMesh = new THREE.Mesh(calyxGeo, leafMat);
    calyxMesh.position.set(tiltX * stemH, stemH, tiltZ * stemH);
    calyxMesh.rotation.x = Math.PI; // Inverted cup
    flower.add(calyxMesh);

    // --- 4. Flower Head & Sculpted Cupped Petals ---
    const headGroup = new THREE.Group();
    headGroup.position.set(tiltX * stemH, stemH + 0.04, tiltZ * stemH);

    // Petal whorl: radiating cupped petals
    const numPetals = 6 + Math.floor(Math.random() * 3);
    for (let p = 0; p < numPetals; p++) {
      const pAngle = (p / numPetals) * Math.PI * 2;
      const petalGeo = new THREE.ConeGeometry(0.07, 0.18, 4);
      const petalMesh = new THREE.Mesh(petalGeo, petalMat);
      petalMesh.scale.set(1.4, 0.35, 1.0); // Flatten into petal blade
      petalMesh.rotation.x = 0.55; // Cupped upward angle
      petalMesh.rotation.y = pAngle;
      petalMesh.position.set(Math.cos(pAngle) * 0.07, 0.04, Math.sin(pAngle) * 0.07);
      headGroup.add(petalMesh);
    }

    // --- 5. Central Golden Pollen Button ---
    const stamenGeo = new THREE.SphereGeometry(0.065, 8, 6);
    const stamenMesh = new THREE.Mesh(stamenGeo, centerMat);
    stamenMesh.position.y = 0.05;
    stamenMesh.scale.set(1.1, 0.7, 1.1);
    headGroup.add(stamenMesh);

    flower.add(headGroup);

    // Scatter within patch radius
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * 1.1;
    flower.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    flower.rotation.y = Math.random() * Math.PI * 2;

    const s = 0.85 + Math.random() * 0.35;
    flower.scale.set(s, s, s);

    patchGroup.add(flower);
  }

  // Interspersed subtle grass shoots in flower patch
  const grassMat = getCachedPBRMaterial('grass_blade_mat', () => {
    const tex = getGrassBladeTextures();
    return createPBRMat(tex, {
      roughness: 0.45,
      bumpScale: 0.04,
      side: THREE.DoubleSide
    });
  });

  for (let g = 0; g < 6; g++) {
    const ga = Math.random() * Math.PI * 2;
    const gd = Math.random() * 0.9;
    const gBlade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.35, 3), grassMat);
    gBlade.position.set(Math.cos(ga) * gd, 0.17, Math.sin(ga) * gd);
    gBlade.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    patchGroup.add(gBlade);
  }

  return enableShadows(patchGroup);
}

/* ==========================================================================
   2. BERRY BUSH (Arbusto de Frutas Silvestres)
   ========================================================================== */
/**
 * Creates a lush rounded leafy shrub with protruding red or blueberry clusters.
 * @param {'red'|'blue'} [type='red']
 * @returns {THREE.Group}
 */
export function createBerryBush(type = 'red') {
  const bushGroup = new THREE.Group();
  bushGroup.name = 'BerryBush';

  const foliageMat = getCachedPBRMaterial(`bush_foliage_${type}`, () => {
    const tex = getBerryBushTextures(type);
    return createPBRMat(tex, {
      flatShading: true,
      roughness: 0.55,
      bumpScale: 0.05
    });
  });

  const berryMat = getCachedPBRMaterial(`bush_berry_${type}`, () => {
    const tex = getBerryTextures(type);
    return createPBRMat(tex, {
      roughness: 0.2,
      bumpScale: 0.03
    });
  });

  const woodMat = getCachedPBRMaterial('bush_wood_mat', () => {
    const tex = getStumpBarkTextures();
    return createPBRMat(tex, {
      roughness: 0.85,
      bumpScale: 0.06
    });
  });

  // --- 1. Gnarled Woody Stems at Base ---
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.55, 6);
  const trunk = new THREE.Mesh(trunkGeo, woodMat);
  trunk.position.set(0, 0.27, 0);
  bushGroup.add(trunk);

  // Angled branches entering the foliage
  const branchConfigs = [
    { len: 0.45, rx: 0.4, rz: 0.3, px: 0.1, py: 0.35, pz: 0.1 },
    { len: 0.5, rx: -0.35, rz: -0.4, px: -0.1, py: 0.35, pz: -0.1 },
    { len: 0.42, rx: 0.3, rz: -0.35, px: -0.1, py: 0.38, pz: 0.1 }
  ];

  branchConfigs.forEach(b => {
    const bGeo = new THREE.CylinderGeometry(0.06, 0.09, b.len, 5);
    const bMesh = new THREE.Mesh(bGeo, woodMat);
    bMesh.rotation.set(b.rx, 0, b.rz);
    bMesh.position.set(b.px, b.py, b.pz);
    bushGroup.add(bMesh);
  });

  // --- 2. Multi-Tiered Organic Foliage Clumps ---
  const foliageClumps = [
    { r: 0.88, x: 0, y: 0.95, z: 0, sx: 1.2, sy: 0.9, sz: 1.1 },
    { r: 0.68, x: -0.62, y: 0.72, z: 0.25, sx: 1.1, sy: 0.85, sz: 1.0 },
    { r: 0.72, x: 0.60, y: 0.76, z: -0.22, sx: 1.05, sy: 0.9, sz: 1.15 },
    { r: 0.65, x: 0.12, y: 0.68, z: 0.62, sx: 1.1, sy: 0.8, sz: 1.0 },
    { r: 0.62, x: -0.22, y: 0.75, z: -0.60, sx: 1.0, sy: 0.85, sz: 1.1 },
    { r: 0.58, x: 0.05, y: 1.35, z: -0.05, sx: 1.15, sy: 0.95, sz: 1.1 }
  ];

  foliageClumps.forEach(c => {
    const geo = new THREE.DodecahedronGeometry(c.r, 0);
    const mesh = new THREE.Mesh(geo, foliageMat);
    mesh.position.set(c.x, c.y, c.z);
    mesh.scale.set(c.sx, c.sy, c.sz);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    bushGroup.add(mesh);
  });

  // --- 3. Protruding Juicy Berry Clusters ---
  const clusterPositions = [
    { x: -0.65, y: 0.92, z: 0.55 },
    { x: 0.72, y: 0.85, z: 0.45 },
    { x: -0.55, y: 0.98, z: -0.55 },
    { x: 0.68, y: 1.05, z: -0.42 },
    { x: 0.05, y: 1.25, z: 0.78 },
    { x: -0.15, y: 1.32, z: -0.72 },
    { x: 0.45, y: 1.45, z: 0.35 },
    { x: -0.42, y: 1.42, z: 0.28 },
    { x: 0.82, y: 0.62, z: 0.12 },
    { x: -0.80, y: 0.68, z: -0.15 }
  ];

  clusterPositions.forEach(cp => {
    const cluster = new THREE.Group();
    cluster.position.set(cp.x, cp.y, cp.z);

    // Stemlet
    const stemletGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.08, 4);
    const stemlet = new THREE.Mesh(stemletGeo, woodMat);
    cluster.add(stemlet);

    // 3-5 glossy berries in tight cluster
    const numBerries = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < numBerries; b++) {
      const bRad = 0.085 + Math.random() * 0.035;
      const bGeo = new THREE.SphereGeometry(bRad, 8, 6);
      const bMesh = new THREE.Mesh(bGeo, berryMat);
      const ba = (b / numBerries) * Math.PI * 2;
      const br = 0.065 + Math.random() * 0.03;
      bMesh.position.set(Math.cos(ba) * br, 0.04 + Math.sin(b * 1.5) * 0.03, Math.sin(ba) * br);
      cluster.add(bMesh);
    }

    // Little leaf framing the berries
    const accentLeafGeo = new THREE.ConeGeometry(0.05, 0.14, 4);
    const accentLeaf = new THREE.Mesh(accentLeafGeo, foliageMat);
    accentLeaf.scale.set(1.3, 0.3, 1.0);
    accentLeaf.position.set(0.08, 0.06, 0);
    accentLeaf.rotation.z = Math.PI * 0.35;
    cluster.add(accentLeaf);

    bushGroup.add(cluster);
  });

  return enableShadows(bushGroup);
}

/* ==========================================================================
   3. GRANITE BOULDER (Grande Rochedo de Granito)
   ========================================================================== */
/**
 * Creates an imposing stylized faceted mountain boulder with moss cap and layered rock strata.
 * @param {'large'|'medium'|'small'|number} [size='large']
 * @returns {THREE.Group}
 */
export function createBoulder(size = 'large') {
  const boulderGroup = new THREE.Group();
  boulderGroup.name = 'Boulder';

  const scaleFactor = typeof size === 'number'
    ? size
    : (size === 'small' ? 0.7 : (size === 'medium' ? 1.2 : 1.75));

  const rockMat = getCachedPBRMaterial('granite_boulder_mat', () => {
    const tex = getGraniteBoulderTextures();
    return createPBRMat(tex, {
      flatShading: true,
      roughness: 0.88,
      bumpScale: 0.08
    });
  });

  // --- 1. Colossal Chiseled Central Boulder ---
  const mainGeo = new THREE.DodecahedronGeometry(1.0, 0);
  const mainRock = new THREE.Mesh(mainGeo, rockMat);
  mainRock.scale.set(1.55, 1.15, 1.3);
  mainRock.position.set(0, 0.95, 0);
  mainRock.rotation.set(0.2, 0.6, 0.15);
  boulderGroup.add(mainRock);

  // --- 2. Sheared Flanking Rock Slabs (Geological Cleavage) ---
  // Left shoulder slab
  const leftGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const leftRock = new THREE.Mesh(leftGeo, rockMat);
  leftRock.scale.set(1.2, 0.75, 0.95);
  leftRock.position.set(-0.95, 0.58, 0.25);
  leftRock.rotation.set(-0.3, 0.4, 0.35);
  boulderGroup.add(leftRock);

  // Right cliff slab
  const rightGeo = new THREE.DodecahedronGeometry(0.75, 0);
  const rightRock = new THREE.Mesh(rightGeo, rockMat);
  rightRock.scale.set(1.15, 0.82, 0.9);
  rightRock.position.set(0.88, 0.55, -0.32);
  rightRock.rotation.set(0.25, -0.5, -0.28);
  boulderGroup.add(rightRock);

  // Back support shelf
  const backGeo = new THREE.DodecahedronGeometry(0.68, 0);
  const backRock = new THREE.Mesh(backGeo, rockMat);
  backRock.scale.set(1.05, 0.7, 0.85);
  backRock.position.set(0.15, 0.5, -0.85);
  backRock.rotation.set(0.4, 0.2, 0);
  boulderGroup.add(backRock);

  // --- 3. Upper Moss Cap (Sunlit apex with velvety moss) ---
  const mossCapGeo = new THREE.DodecahedronGeometry(0.92, 0);
  const mossCap = new THREE.Mesh(mossCapGeo, rockMat);
  mossCap.scale.set(1.35, 0.4, 1.15);
  mossCap.position.set(0.04, 1.68, -0.05);
  mossCap.rotation.set(0.1, 0.3, -0.1);
  boulderGroup.add(mossCap);

  // --- 4. Ground Scree / Fractured Stone Chips at Base ---
  const chipConfigs = [
    { s: 0.24, x: -1.45, z: 0.45, r: 0.5 },
    { s: 0.18, x: -1.25, z: -0.65, r: 1.2 },
    { s: 0.22, x: 1.35, z: 0.38, r: 2.1 },
    { s: 0.26, x: 1.15, z: -0.85, r: 0.8 },
    { s: 0.16, x: 0.45, z: 1.25, r: 1.7 },
    { s: 0.2, x: -0.65, z: 1.18, r: 2.6 }
  ];

  chipConfigs.forEach(c => {
    const chipGeo = new THREE.DodecahedronGeometry(c.s, 0);
    const chip = new THREE.Mesh(chipGeo, rockMat);
    chip.scale.set(1.2, 0.6, 1.0);
    chip.position.set(c.x, c.s * 0.35, c.z);
    chip.rotation.set(Math.random() * Math.PI, c.r, Math.random() * Math.PI);
    boulderGroup.add(chip);
  });

  boulderGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
  return enableShadows(boulderGroup);
}

/* ==========================================================================
   4. RIVER PEBBLES (Seixos & Pedras de Rio)
   ========================================================================== */
/**
 * Creates realistic water-worn river stones with smooth bevels, quartz veins,
 * and a polished specular finish.
 * @param {number} [count=1]
 * @returns {THREE.Mesh|THREE.Group}
 */
export function createPebbles(count = 1) {
  const pebbleMat = getCachedPBRMaterial('river_pebble_mat', () => {
    const tex = getRiverPebbleTextures();
    return createPBRMat(tex, {
      flatShading: false, // Smooth water-tumbled surface
      roughness: 0.35,
      bumpScale: 0.03
    });
  });

  const makePebble = (baseR = 0.3) => {
    const geo = new THREE.DodecahedronGeometry(baseR, 1);
    const mesh = new THREE.Mesh(geo, pebbleMat);
    mesh.name = 'Pebble';
    // Water-worn flattened river stone ellipsoid
    const sx = 1.15 + (Math.random() - 0.5) * 0.3;
    const sy = 0.55 + (Math.random() - 0.5) * 0.15;
    const sz = 0.95 + (Math.random() - 0.5) * 0.25;
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.3,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.3
    );
    mesh.position.y = (baseR * sy) * 0.75;
    return mesh;
  };

  if (count <= 1) {
    const single = makePebble(0.32);
    return enableShadows(single);
  }

  const group = new THREE.Group();
  group.name = 'Pebbles';

  // Natural cluster distribution: dominant anchor stone surrounded by satellite pebbles
  const pebbleConfigs = [
    { r: 0.38, ox: 0, oz: 0 },
    { r: 0.28, ox: -0.45, oz: 0.25 },
    { r: 0.25, ox: 0.42, oz: -0.22 },
    { r: 0.20, ox: -0.25, oz: -0.38 },
    { r: 0.16, ox: 0.35, oz: 0.35 },
    { r: 0.14, ox: -0.58, oz: -0.15 }
  ];

  const actualCount = Math.min(count, 12);
  for (let i = 0; i < actualCount; i++) {
    const cfg = pebbleConfigs[i % pebbleConfigs.length];
    const r = cfg.r * (0.85 + Math.random() * 0.3);
    const p = makePebble(r);
    const jitterX = (Math.random() - 0.5) * 0.2;
    const jitterZ = (Math.random() - 0.5) * 0.2;
    p.position.x = cfg.ox + jitterX;
    p.position.z = cfg.oz + jitterZ;
    group.add(p);
  }

  return enableShadows(group);
}

export const createPebble = () => createPebbles(1);

/* ==========================================================================
   5. GRASS TUFT (Tufo de Grama Estilizada)
   ========================================================================== */
/**
 * Helper to build an arched curved grass blade with custom tapered geometry
 */
function createCurvedBladeGeometry(width = 0.09, height = 0.65, bendX = 0.25, bendZ = 0.15) {
  const geom = new THREE.BufferGeometry();
  const dirLen = Math.hypot(bendX, bendZ) || 1;
  const perpX = -bendZ / dirLen;
  const perpZ = bendX / dirLen;

  const stations = [
    { x: 0, y: 0, z: 0, w: width, v: 0.0 },
    { x: bendX * 0.22, y: height * 0.38, z: bendZ * 0.22, w: width * 0.82, v: 0.35 },
    { x: bendX * 0.62, y: height * 0.74, z: bendZ * 0.62, w: width * 0.52, v: 0.72 },
    { x: bendX * 1.12, y: height * 0.94, z: bendZ * 1.12, w: 0.012, v: 1.0 }
  ];

  const positions = [];
  const uvs = [];
  const indices = [];

  stations.forEach(st => {
    const halfW = st.w * 0.5;
    positions.push(st.x - perpX * halfW, st.y, st.z - perpZ * halfW);
    uvs.push(0.0, st.v);
    positions.push(st.x + perpX * halfW, st.y, st.z + perpZ * halfW);
    uvs.push(1.0, st.v);
  });

  for (let seg = 0; seg < 3; seg++) {
    const i0 = seg * 2;
    const i1 = i0 + 1;
    const i2 = i0 + 2;
    const i3 = i0 + 3;
    indices.push(i0, i1, i2);
    indices.push(i1, i3, i2);
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return geom;
}

/**
 * Creates an elegant stylized grass tuft with multiple curved blades of varying heights and gradients.
 * @returns {THREE.Group}
 */
export function createGrassTuft() {
  const tuft = new THREE.Group();
  tuft.name = 'GrassTuft';

  const grassMat = getCachedPBRMaterial('grass_blade_mat', () => {
    const tex = getGrassBladeTextures();
    return createPBRMat(tex, {
      roughness: 0.45,
      bumpScale: 0.04,
      side: THREE.DoubleSide
    });
  });

  const numBlades = 11 + Math.floor(Math.random() * 5); // 11-15 curved blades

  for (let b = 0; b < numBlades; b++) {
    const angle = (b / numBlades) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const height = 0.45 + Math.random() * 0.38;
    const width = 0.075 + Math.random() * 0.035;
    const bendDist = 0.18 + Math.random() * 0.22;
    const bendX = Math.cos(angle) * bendDist;
    const bendZ = Math.sin(angle) * bendDist;

    const bladeGeo = createCurvedBladeGeometry(width, height, bendX, bendZ);
    const bladeMesh = new THREE.Mesh(bladeGeo, grassMat);

    // Minor root offset
    const rootR = Math.random() * 0.06;
    bladeMesh.position.set(Math.cos(angle) * rootR, 0, Math.sin(angle) * rootR);
    tuft.add(bladeMesh);
  }

  // Central 3-leaf clover at ground base
  const cloverGroup = new THREE.Group();
  cloverGroup.position.y = 0.04;
  for (let c = 0; c < 3; c++) {
    const ca = (c / 3) * Math.PI * 2;
    const cGeo = new THREE.ConeGeometry(0.04, 0.1, 4);
    const cMesh = new THREE.Mesh(cGeo, grassMat);
    cMesh.scale.set(1.4, 0.2, 1.0);
    cMesh.rotation.set(Math.PI * 0.45, 0, ca);
    cMesh.position.set(Math.cos(ca) * 0.06, 0, Math.sin(ca) * 0.06);
    cloverGroup.add(cMesh);
  }
  tuft.add(cloverGroup);

  return enableShadows(tuft);
}

/* ==========================================================================
   6. MUSHROOM STUMP (Tronco com Cogumelos Mágicos)
   ========================================================================== */
/**
 * Creates a weathered mossy tree stump with a cluster of vibrant spotted fairy mushrooms
 * (Amanita muscaria) and chanterelles growing at its base.
 * @returns {THREE.Group}
 */
export function createMushroomStump() {
  const stumpGroup = new THREE.Group();
  stumpGroup.name = 'MushroomStump';

  const barkMat = getCachedPBRMaterial('stump_bark_mat', () => {
    const tex = getStumpBarkTextures();
    return createPBRMat(tex, {
      flatShading: true,
      roughness: 0.88,
      bumpScale: 0.08
    });
  });

  const topRingsMat = getCachedPBRMaterial('stump_top_mat', () => {
    const tex = getStumpTopTextures();
    return createPBRMat(tex, {
      roughness: 0.72,
      bumpScale: 0.05
    });
  });

  const amanitaCapMat = getCachedPBRMaterial('amanita_cap_mat', () => {
    const tex = getMushroomTextures('amanita');
    return createPBRMat(tex, {
      roughness: 0.38,
      bumpScale: 0.04
    });
  });

  const chanterelleCapMat = getCachedPBRMaterial('chanterelle_cap_mat', () => {
    const tex = getMushroomTextures('chanterelle');
    return createPBRMat(tex, {
      roughness: 0.62,
      bumpScale: 0.04
    });
  });

  const gillsMat = getCachedPBRMaterial('mushroom_gills_mat', () => {
    const tex = getMushroomGillsTextures();
    return createPBRMat(tex, {
      roughness: 0.75,
      bumpScale: 0.04,
      side: THREE.DoubleSide
    });
  });

  const stemMat = getCachedPBRMaterial('mushroom_stem_mat', () => {
    const tex = getMushroomStemTextures();
    return createPBRMat(tex, {
      roughness: 0.75,
      bumpScale: 0.03
    });
  });

  // --- 1. Weathered Tree Stump Trunk ---
  const trunkH = 0.95;
  const trunkGeo = new THREE.CylinderGeometry(0.68, 0.88, trunkH, 8, 1, true); // Open ends
  const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
  trunkMesh.position.y = trunkH * 0.5;
  stumpGroup.add(trunkMesh);

  // Top cross-cut disc with annual growth rings & drying cracks
  const topGeo = new THREE.CircleGeometry(0.68, 16);
  topGeo.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(topGeo, topRingsMat);
  topMesh.position.y = trunkH;
  stumpGroup.add(topMesh);

  // Weathered jagged heartwood rim notch
  const rimNotchGeo = new THREE.BoxGeometry(0.18, 0.15, 0.18);
  const rimNotch = new THREE.Mesh(rimNotchGeo, barkMat);
  rimNotch.position.set(0.48, trunkH - 0.05, 0.32);
  rimNotch.rotation.y = 0.4;
  stumpGroup.add(rimNotch);

  // --- 2. Flared Exposed Gnarly Roots ---
  const rootAngles = [0.3, 1.8, 3.4, 4.9];
  rootAngles.forEach(ra => {
    const rootGeo = new THREE.CylinderGeometry(0.12, 0.32, 0.7, 5);
    const rootMesh = new THREE.Mesh(rootGeo, barkMat);
    rootMesh.rotation.set(0.48, ra, 0);
    const rDist = 0.78;
    rootMesh.position.set(Math.cos(ra) * rDist, 0.22, Math.sin(ra) * rDist);
    stumpGroup.add(rootMesh);
  });

  // --- 3. Bracket Fungi (Shelf Mushrooms on Trunk Bark) ---
  const shelfConfigs = [
    { y: 0.48, a: 1.1, r: 0.24 },
    { y: 0.65, a: 1.25, r: 0.18 },
    { y: 0.75, a: 0.95, r: 0.14 }
  ];

  shelfConfigs.forEach(sc => {
    const shelfGeo = new THREE.CylinderGeometry(sc.r, sc.r, 0.035, 8, 1, false, 0, Math.PI);
    const shelfMesh = new THREE.Mesh(shelfGeo, chanterelleCapMat);
    shelfMesh.position.set(Math.cos(sc.a) * 0.72, sc.y, Math.sin(sc.a) * 0.72);
    shelfMesh.rotation.set(0.15, sc.a - Math.PI * 0.5, 0);
    stumpGroup.add(shelfMesh);
  });

  // --- 4. Cluster of Vibrant Spotted Fairy Mushrooms (Amanita muscaria) ---
  const amanitaConfigs = [
    { capR: 0.24, stemH: 0.44, x: -0.72, z: 0.48, tiltX: 0.15, tiltZ: -0.1 },
    { capR: 0.17, stemH: 0.32, x: -0.92, z: 0.32, tiltX: -0.2, tiltZ: 0.15 },
    { capR: 0.14, stemH: 0.26, x: -0.58, z: 0.72, tiltX: 0.25, tiltZ: 0.12 },
    { capR: 0.09, stemH: 0.16, x: -0.82, z: 0.65, tiltX: 0.1, tiltZ: -0.2 },
    { capR: 0.08, stemH: 0.14, x: -0.48, z: 0.52, tiltX: -0.15, tiltZ: 0.1 }
  ];

  amanitaConfigs.forEach(ac => {
    const mGroup = new THREE.Group();
    mGroup.position.set(ac.x, 0, ac.z);

    // Curved stalk
    const sGeo = new THREE.CylinderGeometry(ac.capR * 0.22, ac.capR * 0.32, ac.stemH, 6);
    const sMesh = new THREE.Mesh(sGeo, stemMat);
    sMesh.position.y = ac.stemH * 0.5;
    sMesh.rotation.set(ac.tiltX, 0, ac.tiltZ);
    mGroup.add(sMesh);

    // Annulus / collar frill
    const ringGeo = new THREE.TorusGeometry(ac.capR * 0.32, 0.02, 4, 8);
    const ringMesh = new THREE.Mesh(ringGeo, stemMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.set(ac.tiltX * (ac.stemH * 0.7), ac.stemH * 0.7, ac.tiltZ * (ac.stemH * 0.7));
    mGroup.add(ringMesh);

    // Mushroom Cap (hemisphere)
    const capGeo = new THREE.SphereGeometry(ac.capR, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const capMesh = new THREE.Mesh(capGeo, amanitaCapMat);
    const topX = ac.tiltX * ac.stemH;
    const topZ = ac.tiltZ * ac.stemH;
    capMesh.position.set(topX, ac.stemH + ac.capR * 0.25, topZ);
    mGroup.add(capMesh);

    // Gills underneath
    const gGeo = new THREE.CircleGeometry(ac.capR * 0.95, 8);
    gGeo.rotateX(Math.PI / 2);
    const gMesh = new THREE.Mesh(gGeo, gillsMat);
    gMesh.position.set(topX, ac.stemH + 0.02, topZ);
    mGroup.add(gMesh);

    stumpGroup.add(mGroup);
  });

  // --- 5. Golden Chanterelles at Root Base ---
  const chanterelleConfigs = [
    { capR: 0.18, stemH: 0.28, x: 0.65, z: 0.68 },
    { capR: 0.13, stemH: 0.22, x: 0.85, z: 0.52 },
    { capR: 0.10, stemH: 0.16, x: 0.52, z: 0.82 }
  ];

  chanterelleConfigs.forEach(cc => {
    const cGroup = new THREE.Group();
    cGroup.position.set(cc.x, 0, cc.z);

    // Stalk
    const sGeo = new THREE.CylinderGeometry(cc.capR * 0.25, cc.capR * 0.35, cc.stemH, 5);
    const sMesh = new THREE.Mesh(sGeo, stemMat);
    sMesh.position.y = cc.stemH * 0.5;
    cGroup.add(sMesh);

    // Flared trumpet cap
    const capGeo = new THREE.ConeGeometry(cc.capR, 0.12, 7);
    const capMesh = new THREE.Mesh(capGeo, chanterelleCapMat);
    capMesh.position.y = cc.stemH + 0.04;
    cGroup.add(capMesh);

    stumpGroup.add(cGroup);
  });

  // Decaying twigs on ground
  const twigGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.45, 4);
  const twig = new THREE.Mesh(twigGeo, barkMat);
  twig.rotation.set(Math.PI / 2, 0.6, 0.4);
  twig.position.set(-0.25, 0.02, 1.05);
  stumpGroup.add(twig);

  return enableShadows(stumpGroup);
}

/* ==========================================================================
   7. WATER LILY & LOTUS BLOSSOM (Vitória-Régia & Flor de Lótus)
   ========================================================================== */
/**
 * Helper to build an emerald circular lily pad geometry with characteristic V-notch
 */
function createLilyPadGeometry(radius = 0.85, notchAngle = 0.28) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(Math.cos(notchAngle) * radius, Math.sin(notchAngle) * radius);
  shape.absarc(0, 0, radius, notchAngle, Math.PI * 2 - notchAngle, false);
  shape.lineTo(0, 0);

  const geom = new THREE.ShapeGeometry(shape, 28);
  geom.rotateX(-Math.PI / 2);

  // Normalize UVs to map directly to the center of the lily pad texture
  const pos = geom.attributes.position;
  const uvs = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = (x / radius) * 0.48 + 0.5;
    const v = (z / radius) * 0.48 + 0.5;
    uvs.push(u, v);
  }
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a floating circular emerald lily pad with notch and floating pink/white
 * lotus blossom with golden stamen.
 * @returns {THREE.Group}
 */
export function createWaterLily() {
  const lilyGroup = new THREE.Group();
  lilyGroup.name = 'WaterLily';

  const padMat = getCachedPBRMaterial('lily_pad_mat', () => {
    const tex = getWaterLilyTextures();
    return createPBRMat(tex, {
      roughness: 0.32,
      bumpScale: 0.03,
      side: THREE.DoubleSide
    });
  });

  const lotusMat = getCachedPBRMaterial('lotus_blossom_mat', () => {
    const tex = getLotusTextures();
    return createPBRMat(tex, {
      roughness: 0.52,
      bumpScale: 0.03,
      side: THREE.DoubleSide
    });
  });

  const stamenMat = getCachedPBRMaterial('lotus_stamen_mat', () => {
    const tex = getFlowerCenterTextures();
    return createPBRMat(tex, {
      roughness: 0.8,
      bumpScale: 0.04,
      emissive: new THREE.Color(0xf59e0b),
      emissiveIntensity: 0.35
    });
  });

  // --- 1. Main Floating Emerald Lily Pad ---
  const mainPadGeo = createLilyPadGeometry(0.85, 0.28);
  const mainPad = new THREE.Mesh(mainPadGeo, padMat);
  mainPad.position.y = 0.02;
  lilyGroup.add(mainPad);

  // Upturned rim rim ring
  const rimGeo = new THREE.TorusGeometry(0.84, 0.018, 4, 24, Math.PI * 2 - 0.56);
  const rimMesh = new THREE.Mesh(rimGeo, padMat);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.rotation.z = 0.28;
  rimMesh.position.y = 0.035;
  lilyGroup.add(rimMesh);

  // --- 2. Secondary Baby Lily Pad Floating Nearby ---
  const babyPadGeo = createLilyPadGeometry(0.42, 0.32);
  const babyPad = new THREE.Mesh(babyPadGeo, padMat);
  babyPad.position.set(0.95, 0.015, 0.55);
  babyPad.rotation.y = 1.35;
  lilyGroup.add(babyPad);

  // --- 3. Floating Pink/White Lotus Blossom ---
  const lotusBlossom = new THREE.Group();
  lotusBlossom.position.set(-0.2, 0.03, -0.15);

  // Blossom receptacle base
  const recepGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.06, 8);
  const recep = new THREE.Mesh(recepGeo, padMat);
  recep.position.y = 0.03;
  lotusBlossom.add(recep);

  // Layer 1: Outer Whorl (8 wide open petals tilted outward)
  const numOuter = 8;
  for (let i = 0; i < numOuter; i++) {
    const a = (i / numOuter) * Math.PI * 2;
    const pGeo = new THREE.ConeGeometry(0.11, 0.32, 4);
    const petal = new THREE.Mesh(pGeo, lotusMat);
    petal.scale.set(1.4, 0.25, 1.0);
    petal.rotation.x = 0.88; // Wide open ~50°
    petal.rotation.y = a;
    petal.position.set(Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14);
    lotusBlossom.add(petal);
  }

  // Layer 2: Middle Whorl (6 upright cupping petals)
  const numMid = 6;
  for (let i = 0; i < numMid; i++) {
    const a = (i / numMid) * Math.PI * 2 + 0.25;
    const pGeo = new THREE.ConeGeometry(0.095, 0.27, 4);
    const petal = new THREE.Mesh(pGeo, lotusMat);
    petal.scale.set(1.3, 0.25, 1.0);
    petal.rotation.x = 0.52; // Cupped inward
    petal.rotation.y = a;
    petal.position.set(Math.cos(a) * 0.09, 0.11, Math.sin(a) * 0.09);
    lotusBlossom.add(petal);
  }

  // Layer 3: Inner Whorl (4-5 tight petals guarding stamen)
  const numInner = 5;
  for (let i = 0; i < numInner; i++) {
    const a = (i / numInner) * Math.PI * 2 + 0.5;
    const pGeo = new THREE.ConeGeometry(0.08, 0.22, 4);
    const petal = new THREE.Mesh(pGeo, lotusMat);
    petal.scale.set(1.2, 0.25, 1.0);
    petal.rotation.x = 0.26; // Almost upright
    petal.rotation.y = a;
    petal.position.set(Math.cos(a) * 0.05, 0.13, Math.sin(a) * 0.05);
    lotusBlossom.add(petal);
  }

  // Central Golden Stamen Core
  const stamenCoreGeo = new THREE.CylinderGeometry(0.085, 0.065, 0.08, 8);
  const stamenCore = new THREE.Mesh(stamenCoreGeo, stamenMat);
  stamenCore.position.y = 0.12;
  lotusBlossom.add(stamenCore);

  // Golden stamen filament beads
  for (let f = 0; f < 10; f++) {
    const fa = (f / 10) * Math.PI * 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), stamenMat);
    bead.position.set(Math.cos(fa) * 0.08, 0.15, Math.sin(fa) * 0.08);
    lotusBlossom.add(bead);
  }

  lilyGroup.add(lotusBlossom);

  // Subtle translucent aquatic water ring
  const rippleGeo = new THREE.RingGeometry(0.7, 1.05, 24);
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
  });
  const ripple = new THREE.Mesh(rippleGeo, rippleMat);
  ripple.position.y = 0.005;
  lilyGroup.add(ripple);

  return enableShadows(lilyGroup);
}
