import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOakBarkTextures,
  getPineBarkTextures,
  getOakFoliageTextures,
  getPineNeedleTextures,
  getAutumnOakFoliageTextures,
  getBirchBarkTextures,
  getBirchFoliageTextures,
  createTreeMaterial
} from './treeTextures.js';

/**
 * Procedural PBR Material Cache to reuse materials across tree instances
 */
const treeMaterialCache = new Map();

function getMaterial(key, creator) {
  if (!treeMaterialCache.has(key)) {
    treeMaterialCache.set(key, creator());
  }
  return treeMaterialCache.get(key);
}

function getOakBarkMaterial() {
  return getMaterial('oakBark', () =>
    createTreeMaterial(getOakBarkTextures(), { bumpScale: 0.02, roughness: 0.85, flatShading: false })
  );
}

function getOakFoliageMaterial() {
  return getMaterial('oakFoliage', () =>
    createTreeMaterial(getOakFoliageTextures(), { bumpScale: 0.015, roughness: 0.78, flatShading: true })
  );
}

function getPineBarkMaterial() {
  return getMaterial('pineBark', () =>
    createTreeMaterial(getPineBarkTextures(), { bumpScale: 0.02, roughness: 0.85, flatShading: false })
  );
}

function getPineNeedleMaterial() {
  return getMaterial('pineNeedle', () =>
    createTreeMaterial(getPineNeedleTextures(), { bumpScale: 0.015, roughness: 0.75, flatShading: true })
  );
}

function getAutumnOakFoliageMaterial() {
  return getMaterial('autumnOakFoliage', () =>
    createTreeMaterial(getAutumnOakFoliageTextures(), { bumpScale: 0.015, roughness: 0.78, flatShading: true })
  );
}

function getBirchBarkMaterial() {
  return getMaterial('birchBark', () =>
    createTreeMaterial(getBirchBarkTextures(), { bumpScale: 0.05, roughness: 0.80, flatShading: false })
  );
}

function getBirchFoliageMaterial() {
  return getMaterial('birchFoliage', () =>
    createTreeMaterial(getBirchFoliageTextures(), { bumpScale: 0.05, roughness: 0.72, flatShading: true })
  );
}

function getPineconeMaterial() {
  return getMaterial('pinecone', () =>
    createTreeMaterial(getPineBarkTextures(), { bumpScale: 0.04, roughness: 0.85, flatShading: true })
  );
}

/**
 * Helper to build an oriented cylinder segment between two 3D points
 * (used for organic roots and branch forks)
 */
function createOrientedSegment(p1, p2, radiusBase, radiusTip, segments = 6, material) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 0.001) return new THREE.Group();

  const geo = new THREE.CylinderGeometry(radiusTip, radiusBase, len, segments);
  // Shift origin to base p1 so it connects seamlessly
  geo.translate(0, len * 0.5, 0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(p1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

/**
 * Helper to build stylized hanging foliage vine / leaf drops
 */
function createHangingVine(x, y, z, length, material, beadCount = 3) {
  const vine = new THREE.Group();
  vine.position.set(x, y, z);

  for (let b = 0; b < beadCount; b++) {
    const progress = b / beadCount;
    const r = (1 - progress * 0.42) * 0.22;
    const dropY = -b * (length / beadCount) - 0.1;
    const dropMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), material);
    dropMesh.position.set(
      Math.sin(b * 1.5) * 0.06,
      dropY,
      Math.cos(b * 1.5) * 0.06
    );
    dropMesh.rotation.set(b * 0.5, b * 0.7, b * 0.3);
    vine.add(dropMesh);
  }

  return vine;
}

/**
 * Helper to build a 3D low-poly pinecone
 */
function create3DPinecone(material) {
  const coneGroup = new THREE.Group();

  // Pointed lower cone
  const lowerGeo = new THREE.ConeGeometry(0.12, 0.26, 5);
  lowerGeo.rotateX(Math.PI);
  lowerGeo.translate(0, -0.13, 0);
  const lower = new THREE.Mesh(lowerGeo, material);
  coneGroup.add(lower);

  // Rounded upper base cap
  const upperGeo = new THREE.ConeGeometry(0.11, 0.14, 5);
  upperGeo.translate(0, 0.07, 0);
  const upper = new THREE.Mesh(upperGeo, material);
  coneGroup.add(upper);

  return coneGroup;
}

/**
 * 1. OAK TREE & AUTUMN OAK TREE
 * Sculpted gnarled trunk with 4-5 root buttresses anchoring into ground,
 * organic branch forks, multi-tiered stylized dodecahedral leaf clumps
 * with varied scale and tilt, small hanging vines/leaves.
 */
function createOakTree(isAutumn = false) {
  const tree = new THREE.Group();
  tree.name = isAutumn ? 'AutumnOakTree' : 'OakTree';

  const trunkGroup = new THREE.Group();
  trunkGroup.name = 'Trunk';

  const foliageGroup = new THREE.Group();
  foliageGroup.name = 'Foliage';

  const barkMat = getOakBarkMaterial();
  const foliageMat = isAutumn ? getAutumnOakFoliageMaterial() : getOakFoliageMaterial();

  // 1.1 Sculpted Gnarled Trunk (Multi-segment with organic lean)
  const lowerTrunkGeo = new THREE.CylinderGeometry(0.52, 0.76, 1.8, 7);
  const lowerTrunk = new THREE.Mesh(lowerTrunkGeo, barkMat);
  lowerTrunk.position.set(0, 0.9, 0);
  trunkGroup.add(lowerTrunk);

  const upperTrunkGeo = new THREE.CylinderGeometry(0.40, 0.52, 1.7, 7);
  const upperTrunk = new THREE.Mesh(upperTrunkGeo, barkMat);
  upperTrunk.position.set(0.04, 2.45, 0.02);
  upperTrunk.rotation.set(-0.06, 0.15, 0.07);
  trunkGroup.add(upperTrunk);

  // Cut knothole branch stub
  const knotGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.42, 6);
  knotGeo.rotateZ(-Math.PI * 0.38);
  const knothole = new THREE.Mesh(knotGeo, barkMat);
  knothole.position.set(0.46, 1.65, 0.2);
  trunkGroup.add(knothole);

  // 1.2 3 Clean Root Buttresses anchoring gently into ground
  const rootButtresses = [
    { start: new THREE.Vector3(0.35, 0.65, 0.0),   end: new THREE.Vector3(1.15, 0.05, 0.1),   rBase: 0.28, rTip: 0.14 },
    { start: new THREE.Vector3(-0.32, 0.60, 0.15),  end: new THREE.Vector3(-1.15, 0.05, 0.35), rBase: 0.28, rTip: 0.14 },
    { start: new THREE.Vector3(0.0, 0.60, -0.32),  end: new THREE.Vector3(0.0, 0.05, -1.15),  rBase: 0.28, rTip: 0.14 }
  ];

  rootButtresses.forEach(rb => {
    const root = createOrientedSegment(rb.start, rb.end, rb.rBase, rb.rTip, 6, barkMat);
    trunkGroup.add(root);
  });

  // 1.3 3 Clean Branch Forks reaching out to cradle canopy
  const branchForks = [
    { start: new THREE.Vector3(0.05, 2.9, 0.02),   end: new THREE.Vector3(0.95, 3.85, 0.65),  rBase: 0.24, rTip: 0.13 },
    { start: new THREE.Vector3(-0.02, 2.85, 0.04),  end: new THREE.Vector3(-1.05, 3.80, 0.55), rBase: 0.22, rTip: 0.12 },
    { start: new THREE.Vector3(0.0, 2.90, -0.05),  end: new THREE.Vector3(0.10, 3.90, -0.90), rBase: 0.23, rTip: 0.13 }
  ];

  branchForks.forEach(bf => {
    const branch = createOrientedSegment(bf.start, bf.end, bf.rBase, bf.rTip, 6, barkMat);
    trunkGroup.add(branch);
  });

  tree.add(trunkGroup);

  // 1.4 Multi-Tiered Stylized Dodecahedral Leaf Clumps (Clean low-poly canopy)
  const clusters = [
    // Main High Central Crown
    { x: 0.05,  y: 4.85, z: 0.05,  r: 1.85, rot: [0.20,  0.40, -0.15], scale: [1.05, 0.95, 1.02] },
    // Front-Left Canopy Dome
    { x: -1.25, y: 3.55, z: 0.85,  r: 1.50, rot: [-0.25, 0.70,  0.20], scale: [1.10, 0.92, 1.00] },
    // Front-Right Canopy Dome
    { x: 1.20,  y: 3.65, z: 0.70,  r: 1.55, rot: [0.35, -0.50, -0.15], scale: [1.00, 0.95, 1.08] },
    // Rear-Left Canopy Dome
    { x: -1.10, y: 3.75, z: -0.95, r: 1.42, rot: [0.15,  1.10,  0.25], scale: [1.05, 0.90, 1.00] },
    // Rear-Right Canopy Dome
    { x: 1.05,  y: 3.45, z: -1.05, r: 1.48, rot: [-0.20,-0.85,  0.10], scale: [1.02, 0.93, 1.05] },
    // Upper-Left Secondary Cluster
    { x: -0.65, y: 4.45, z: -0.35, r: 1.25, rot: [0.40,  0.25, -0.20], scale: [0.98, 1.02, 0.98] },
    // Upper-Right Secondary Cluster
    { x: 0.75,  y: 4.55, z: 0.30,  r: 1.30, rot: [-0.30,-0.35,  0.25], scale: [1.02, 0.96, 1.00] }
  ];

  clusters.forEach(c => {
    const geo = new THREE.DodecahedronGeometry(c.r, 0);
    const mesh = new THREE.Mesh(geo, foliageMat);
    mesh.position.set(c.x, c.y, c.z);
    mesh.rotation.set(...c.rot);
    if (c.scale) mesh.scale.set(...c.scale);
    foliageGroup.add(mesh);
  });

  tree.add(foliageGroup);

  // Rigging & userData contract
  tree.userData = {
    trunk: trunkGroup,
    foliage: foliageGroup,
    type: isAutumn ? 'autumn' : 'oak'
  };

  return tree;
}

/**
 * 2. PINE TREE
 * Tall tapered trunk, 4-5 tiered conical needle skirts with serrated
 * faceted hems and needle textures, small 3D pinecones.
 */
function createPineTree() {
  const tree = new THREE.Group();
  tree.name = 'PineTree';

  const trunkGroup = new THREE.Group();
  trunkGroup.name = 'Trunk';

  const foliageGroup = new THREE.Group();
  foliageGroup.name = 'Foliage';

  const barkMat = getPineBarkMaterial();
  const needleMat = getPineNeedleMaterial();
  const coneMat = getPineconeMaterial();

  // 2.1 Tall Tapered Pine Trunk (Segmented)
  const lowerTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.54, 2.2, 7), barkMat);
  lowerTrunk.position.set(0, 1.1, 0);
  trunkGroup.add(lowerTrunk);

  const midTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 2.4, 6), barkMat);
  midTrunk.position.set(0, 3.3, 0);
  trunkGroup.add(midTrunk);

  const upperTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 2.0, 5), barkMat);
  upperTrunk.position.set(0, 5.2, 0);
  trunkGroup.add(upperTrunk);

  // 3 Clean Root Flares
  const pineRoots = [
    { start: new THREE.Vector3(0.24, 0.45, 0.0),   end: new THREE.Vector3(0.95, 0.05, 0.0),   rBase: 0.20, rTip: 0.10 },
    { start: new THREE.Vector3(-0.20, 0.45, 0.15), end: new THREE.Vector3(-0.85, 0.05, 0.45), rBase: 0.20, rTip: 0.10 },
    { start: new THREE.Vector3(-0.10, 0.45, -0.22),end: new THREE.Vector3(-0.45, 0.05, -0.90),rBase: 0.20, rTip: 0.10 }
  ];

  pineRoots.forEach(pr => {
    const root = createOrientedSegment(pr.start, pr.end, pr.rBase, pr.rTip, 5, barkMat);
    trunkGroup.add(root);
  });

  tree.add(trunkGroup);

  // 2.2 5 Clean Tiered Conical Needle Skirts (Crisp low-poly evergreen silhouette)
  const tiers = [
    { r: 2.35, h: 2.00, y: 2.40, seg: 8 },
    { r: 1.95, h: 1.80, y: 3.65, seg: 8 },
    { r: 1.50, h: 1.65, y: 4.80, seg: 7 },
    { r: 1.05, h: 1.45, y: 5.85, seg: 6 },
    { r: 0.58, h: 1.25, y: 6.75, seg: 5 } // Spire pinnacle
  ];

  tiers.forEach((t) => {
    const coneGeo = new THREE.ConeGeometry(t.r, t.h, t.seg);
    const cone = new THREE.Mesh(coneGeo, needleMat);
    cone.position.set(0, t.y, 0);
    foliageGroup.add(cone);
  });

  // Needle tip spire sprig at apex
  const spireSprigGeo = new THREE.ConeGeometry(0.18, 0.55, 4);
  const spireSprig = new THREE.Mesh(spireSprigGeo, needleMat);
  spireSprig.position.set(0, 7.45, 0);
  foliageGroup.add(spireSprig);

  tree.add(foliageGroup);

  // Rigging & userData contract
  tree.userData = {
    trunk: trunkGroup,
    foliage: foliageGroup,
    type: 'pine'
  };

  return tree;
}

/**
 * 3. BIRCH TREE
 * Slender pale birch trunk with characteristic sweeping curve,
 * delicate yellow-green/golden leaf clusters, and hanging catkin leaf drops.
 */
function createBirchTree() {
  const tree = new THREE.Group();
  tree.name = 'BirchTree';

  const trunkGroup = new THREE.Group();
  trunkGroup.name = 'Trunk';

  const foliageGroup = new THREE.Group();
  foliageGroup.name = 'Foliage';

  const barkMat = getBirchBarkMaterial();
  const foliageMat = getBirchFoliageMaterial();

  // 3.1 Slender Curved Birch Trunk (3 curved segments)
  const baseTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.40, 1.8, 7), barkMat);
  baseTrunk.position.set(0, 0.9, 0);
  trunkGroup.add(baseTrunk);

  const midTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 1.8, 7), barkMat);
  midTrunk.position.set(0.06, 2.6, 0.04);
  midTrunk.rotation.set(0.05, 0.2, 0.08);
  trunkGroup.add(midTrunk);

  const upperTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 1.8, 6), barkMat);
  upperTrunk.position.set(0.12, 4.25, 0.06);
  upperTrunk.rotation.set(-0.04, -0.1, -0.05);
  trunkGroup.add(upperTrunk);

  // 4 Slender Root Buttresses
  const birchRoots = [
    { start: new THREE.Vector3(0.18, 0.45, 0.0),  end: new THREE.Vector3(0.85, 0.05, 0.12),  rBase: 0.18, rTip: 0.08 },
    { start: new THREE.Vector3(-0.18, 0.45, 0.08), end: new THREE.Vector3(-0.85, 0.05, 0.25), rBase: 0.18, rTip: 0.08 },
    { start: new THREE.Vector3(0.05, 0.45, 0.18),  end: new THREE.Vector3(0.20, 0.05, 0.85),  rBase: 0.16, rTip: 0.07 },
    { start: new THREE.Vector3(-0.08, 0.45, -0.18),end: new THREE.Vector3(-0.35, 0.05, -0.82),rBase: 0.16, rTip: 0.07 }
  ];

  birchRoots.forEach(br => {
    const root = createOrientedSegment(br.start, br.end, br.rBase, br.rTip, 5, barkMat);
    trunkGroup.add(root);
  });

  // 3 Slender Upper Branches
  const birchBranches = [
    { start: new THREE.Vector3(0.10, 3.8, 0.05), end: new THREE.Vector3(0.75, 4.75, 0.35),  rBase: 0.10, rTip: 0.05 },
    { start: new THREE.Vector3(0.08, 3.7, 0.03), end: new THREE.Vector3(-0.70, 4.65, 0.25), rBase: 0.09, rTip: 0.05 },
    { start: new THREE.Vector3(0.12, 3.9, 0.06), end: new THREE.Vector3(0.15, 4.85, -0.70), rBase: 0.09, rTip: 0.05 }
  ];

  birchBranches.forEach(bb => {
    const branch = createOrientedSegment(bb.start, bb.end, bb.rBase, bb.rTip, 5, barkMat);
    trunkGroup.add(branch);
  });

  tree.add(trunkGroup);

  // 3.2 Delicate Airy Leaf Clusters (Lighter, fluttering silhouette)
  const birchClusters = [
    // Top Central Crown
    { x: 0.15,  y: 5.25, z: 0.05,  r: 1.35, rot: [0.25,  0.50, -0.15], scale: [1.02, 0.95, 1.00] },
    // High-Left Fluttering Cluster
    { x: -0.85, y: 4.75, z: 0.40,  r: 1.10, rot: [-0.20, 0.80,  0.15], scale: [1.05, 0.90, 1.02] },
    // High-Right Fluttering Cluster
    { x: 0.90,  y: 4.85, z: 0.35,  r: 1.15, rot: [0.35, -0.60, -0.20], scale: [0.98, 0.95, 1.05] },
    // Rear High Cluster
    { x: 0.10,  y: 4.95, z: -0.75, r: 1.05, rot: [0.15,  0.95,  0.25], scale: [1.00, 0.92, 1.00] },
    // Mid-Left Canopy Cluster
    { x: -0.95, y: 3.95, z: -0.20, r: 0.95, rot: [-0.30,-0.40,  0.20], scale: [1.05, 0.90, 0.98] },
    // Mid-Right Canopy Cluster
    { x: 0.85,  y: 4.05, z: -0.40, r: 0.98, rot: [0.20,  0.30, -0.15], scale: [0.98, 0.95, 1.02] },
    // Front Lower Light Cluster
    { x: 0.10,  y: 3.85, z: 0.80,  r: 0.90, rot: [0.15, -0.70,  0.10], scale: [1.02, 0.92, 1.00] }
  ];

  birchClusters.forEach(bc => {
    const geo = new THREE.DodecahedronGeometry(bc.r, 0);
    const mesh = new THREE.Mesh(geo, foliageMat);
    mesh.position.set(bc.x, bc.y, bc.z);
    mesh.rotation.set(...bc.rot);
    if (bc.scale) mesh.scale.set(...bc.scale);
    foliageGroup.add(mesh);
  });

  // 3.3 Hanging birch catkin leaf drops
  const birchHangingDrops = [
    { x: -0.90, y: 3.40, z: 0.45,  len: 0.65, count: 3 },
    { x: 0.95,  y: 3.45, z: 0.35,  len: 0.70, count: 3 },
    { x: 0.12,  y: 3.35, z: 0.85,  len: 0.60, count: 3 },
    { x: 0.15,  y: 3.45, z: -0.75, len: 0.65, count: 3 }
  ];

  birchHangingDrops.forEach(bd => {
    const drop = createHangingVine(bd.x, bd.y, bd.z, bd.len, foliageMat, bd.count);
    foliageGroup.add(drop);
  });

  tree.add(foliageGroup);

  // Rigging & userData contract
  tree.userData = {
    trunk: trunkGroup,
    foliage: foliageGroup,
    type: 'birch'
  };

  return tree;
}

/**
 * Creates next-gen stylized AAA video game quality trees for WarPoly
 * Supporting: 'oak', 'pine', 'autumn', 'birch'
 *
 * @param {'oak'|'pine'|'autumn'|'autumn_oak'|'birch'} type
 * @returns {THREE.Group}
 */
export function createTree(type = 'oak') {
  let tree;

  switch (type) {
    case 'pine':
      tree = createPineTree();
      break;
    case 'autumn':
    case 'autumn_oak':
      tree = createOakTree(true);
      break;
    case 'birch':
      tree = createBirchTree();
      break;
    case 'oak':
    default:
      tree = createOakTree(false);
      break;
  }

  return enableShadows(tree);
}
