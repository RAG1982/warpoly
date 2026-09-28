import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getPeonFaceTextures,
  getPeonTunicHarnessTextures,
  getPeonPantsBootsTextures,
  getPeonToolTextures
} from './peonTextures.js';
import {
  getVillagerBackpackTextures,
  getVillagerWoodBundleTextures,
  getVillagerGoldSackTextures
} from './villagerTextures.js';

/**
 * Next-Gen Stylized Low-Poly Orc Peon (Trabalhador Orc / Aldeão da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Features:
 * - Hunched, muscular orcish build with broad shoulders and forward neck posture.
 * - Olive/emerald green skin with prominent lower tusks, heavy brow ridge, and piercing amber eyes.
 * - Coarse dark burlap tunic and crossed rawhide harness with iron rivets.
 * - Patchwork leather trousers with cross-stitches and mud-splattered work boots with iron toe caps.
 * - Interchangeable tools:
 *   * Crude Orc Woodcutter's Axe (notched cleaver blade, rawhide-wrapped wood haft)
 *   * Heavy Spiked Iron Pickaxe (forged chisel point for gold and stone mining)
 *   * Stone Builder's Mallet (for construction)
 * - Modular Cargo Backpack:
 *   * Stack of tied timber logs for lumber gathering
 *   * Burlap sack filled with sparkling gold ore nuggets
 * 
 * Rigging / userData:
 * Contains { torso, head, armL, armR, legL, legR, toolGroup, axe, pickaxe, hammer, pack, woodBundle, goldSack }
 * ensuring full compatibility with in-game and inspector animations!
 */
export function createPeon() {
  const peon = new THREE.Group();
  peon.name = 'Peon';

  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale || 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const faceMat = createPBRMaterial(getPeonFaceTextures(), { bumpScale: 0.06 });
  const tunicMat = createPBRMaterial(getPeonTunicHarnessTextures(), { bumpScale: 0.07 });
  const pantsMat = createPBRMaterial(getPeonPantsBootsTextures(), { bumpScale: 0.06 });
  const toolMat = createPBRMaterial(getPeonToolTextures(), { bumpScale: 0.06, metalness: 0.8 });
  const packMat = createPBRMaterial(getVillagerBackpackTextures(), { bumpScale: 0.06 });
  const woodMat = createPBRMaterial(getVillagerWoodBundleTextures(), { bumpScale: 0.08 });
  const goldMat = createPBRMaterial(getVillagerGoldSackTextures(), { bumpScale: 0.08 });

  // Common orc skin material for limbs
  const orcSkinMat = new THREE.MeshStandardMaterial({
    color: 0x47702e,
    roughness: 0.65,
    metalness: 0.1,
    flatShading: true
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.8,
    flatShading: true
  });

  // --- 1. TORSO (Hunched forward, muscular) ---
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'Torso';
  torsoGroup.position.set(0, 1.25, -0.08);
  torsoGroup.rotation.x = 0.22; // Orcish hunched forward posture

  // Broad upper chest
  const chestGeo = new THREE.BoxGeometry(0.92, 0.72, 0.62);
  const chestMesh = new THREE.Mesh(chestGeo, tunicMat);
  chestMesh.position.set(0, 0.15, 0);
  torsoGroup.add(chestMesh);

  // Muscular belly / lower torso
  const waistGeo = new THREE.BoxGeometry(0.82, 0.52, 0.54);
  const waistMesh = new THREE.Mesh(waistGeo, tunicMat);
  waistMesh.position.set(0, -0.32, -0.02);
  torsoGroup.add(waistMesh);

  // Heavy belt buckle
  const buckleGeo = new THREE.BoxGeometry(0.24, 0.2, 0.08);
  const buckleMesh = new THREE.Mesh(buckleGeo, ironMat);
  buckleMesh.position.set(0, -0.42, 0.26);
  torsoGroup.add(buckleMesh);

  // Shoulder iron rivet plates
  [-0.46, 0.46].forEach(sx => {
    const padGeo = new THREE.BoxGeometry(0.28, 0.14, 0.44);
    const padMesh = new THREE.Mesh(padGeo, ironMat);
    padMesh.position.set(sx, 0.45, 0);
    padMesh.rotation.z = sx > 0 ? -0.2 : 0.2;
    torsoGroup.add(padMesh);
  });

  // --- 2. HEAD (Heavy jaw, tusks, brow) ---
  const headGroup = new THREE.Group();
  headGroup.name = 'Head';
  headGroup.position.set(0, 0.62, 0.16); // Forward neck projection

  // Skull
  const skullGeo = new THREE.BoxGeometry(0.58, 0.56, 0.58);
  const skullMesh = new THREE.Mesh(skullGeo, faceMat);
  headGroup.add(skullMesh);

  // Heavy Orc Brow ridge
  const browGeo = new THREE.BoxGeometry(0.62, 0.16, 0.24);
  const browMesh = new THREE.Mesh(browGeo, orcSkinMat);
  browMesh.position.set(0, 0.18, 0.22);
  headGroup.add(browMesh);

  // Lower Jaw protruding forward
  const jawGeo = new THREE.BoxGeometry(0.54, 0.24, 0.32);
  const jawMesh = new THREE.Mesh(jawGeo, orcSkinMat);
  jawMesh.position.set(0, -0.22, 0.18);
  headGroup.add(jawMesh);

  // Pointed Orc Ears
  [-0.32, 0.32].forEach(ex => {
    const earGeo = new THREE.ConeGeometry(0.09, 0.3, 4);
    const earMesh = new THREE.Mesh(earGeo, orcSkinMat);
    earMesh.position.set(ex, 0.08, -0.05);
    earMesh.rotation.z = ex > 0 ? -Math.PI / 3 : Math.PI / 3;
    earMesh.rotation.x = -0.2;
    headGroup.add(earMesh);
  });

  // Sharp Lower Jaw Tusks
  const tuskMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.3,
    metalness: 0.1
  });
  [-0.18, 0.18].forEach(tx => {
    const tuskGeo = new THREE.ConeGeometry(0.06, 0.24, 4);
    const tuskMesh = new THREE.Mesh(tuskGeo, tuskMat);
    tuskMesh.position.set(tx, -0.06, 0.34);
    tuskMesh.rotation.x = -0.3;
    tuskMesh.rotation.z = tx > 0 ? -0.15 : 0.15;
    headGroup.add(tuskMesh);
  });

  // Topknot / leather head wrap
  const knotGeo = new THREE.SphereGeometry(0.12, 5, 5);
  const knotMesh = new THREE.Mesh(knotGeo, new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }));
  knotMesh.position.set(0, 0.36, -0.1);
  headGroup.add(knotMesh);

  torsoGroup.add(headGroup);

  // --- 3. ARMS (Long, beefy, hung forward) ---
  // Left Arm
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.56, 0.38, 0);

  const bicepL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.28), orcSkinMat);
  bicepL.position.set(0, -0.22, 0);
  armL.add(bicepL);

  const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.48, 0.26), orcSkinMat);
  forearmL.position.set(0, -0.62, 0.04);
  forearmL.rotation.x = 0.25;
  armL.add(forearmL);

  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), orcSkinMat);
  handL.position.set(0, -0.88, 0.12);
  armL.add(handL);

  torsoGroup.add(armL);

  // Right Arm (holds toolGroup)
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.56, 0.38, 0);

  const bicepR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.28), orcSkinMat);
  bicepR.position.set(0, -0.22, 0);
  armR.add(bicepR);

  const forearmR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.48, 0.26), orcSkinMat);
  forearmR.position.set(0, -0.62, 0.04);
  forearmR.rotation.x = 0.25;
  armR.add(forearmR);

  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), orcSkinMat);
  handR.position.set(0, -0.88, 0.12);
  armR.add(handR);

  // --- TOOL GROUP (interchangeable Axe, Pickaxe, Hammer) ---
  const toolGroup = new THREE.Group();
  toolGroup.name = 'ToolGroup';
  toolGroup.position.set(0, -0.92, 0.18);
  armR.add(toolGroup);

  // 1. Crude Orc Woodcutter's Axe
  const axe = new THREE.Group();
  axe.name = 'Axe';

  const axeHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.25, 6), toolMat);
  axeHaft.position.set(0, 0.15, 0);
  axe.add(axeHaft);

  // Chipped cleaver blade
  const axeBladeGeo = new THREE.BoxGeometry(0.06, 0.48, 0.36);
  const axeBlade = new THREE.Mesh(axeBladeGeo, toolMat);
  axeBlade.position.set(0, 0.62, 0.18);
  axe.add(axeBlade);

  // Back spike
  const axeSpike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), toolMat);
  axeSpike.position.set(0, 0.62, -0.15);
  axeSpike.rotation.x = -Math.PI / 2;
  axe.add(axeSpike);

  toolGroup.add(axe);

  // 2. Heavy Spiked Iron Pickaxe
  const pickaxe = new THREE.Group();
  pickaxe.name = 'Pickaxe';
  pickaxe.visible = false;

  const pickHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.3, 6), toolMat);
  pickHaft.position.set(0, 0.15, 0);
  pickaxe.add(pickHaft);

  const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.8), toolMat);
  pickHead.position.set(0, 0.65, 0);
  pickaxe.add(pickHead);

  toolGroup.add(pickaxe);

  // 3. Stone Builder's Mallet
  const hammer = new THREE.Group();
  hammer.name = 'Hammer';
  hammer.visible = false;

  const hamHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 1.1, 6), toolMat);
  hamHaft.position.set(0, 0.15, 0);
  hammer.add(hamHaft);

  const hamHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.42), toolMat);
  hamHead.position.set(0, 0.58, 0);
  hammer.add(hamHead);

  toolGroup.add(hammer);
  torsoGroup.add(armR);

  // --- 4. BACKPACK & CARGO ---
  const pack = new THREE.Group();
  pack.name = 'Pack';
  pack.position.set(0, 0.05, -0.42);
  pack.visible = false;

  // Timber frame
  const frameGeo = new THREE.BoxGeometry(0.65, 0.75, 0.16);
  const frameMesh = new THREE.Mesh(frameGeo, packMat);
  pack.add(frameMesh);

  // Wood Bundle Cargo
  const woodBundle = new THREE.Group();
  woodBundle.name = 'WoodBundle';
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.82, 8), woodMat);
    log.rotation.x = Math.PI / 2;
    log.position.set((i % 2 - 0.5) * 0.26, Math.floor(i / 2) * 0.24, 0.12);
    woodBundle.add(log);
  }
  woodBundle.visible = false;
  pack.add(woodBundle);

  // Gold Sack Cargo
  const goldSack = new THREE.Group();
  goldSack.name = 'GoldSack';
  const sackGeo = new THREE.SphereGeometry(0.35, 7, 7);
  const sackMesh = new THREE.Mesh(sackGeo, goldMat);
  sackMesh.scale.set(1.0, 1.25, 0.9);
  sackMesh.position.set(0, 0.1, 0.15);
  goldSack.add(sackMesh);
  goldSack.visible = false;
  pack.add(goldSack);

  torsoGroup.add(pack);
  peon.add(torsoGroup);

  // --- 5. LEGS (Thick, heavy-set) ---
  // Left Leg
  const legL = new THREE.Group();
  legL.name = 'LegL';
  legL.position.set(-0.25, 0.85, -0.05);

  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.36), pantsMat);
  thighL.position.set(0, -0.25, 0);
  legL.add(thighL);

  const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.32), pantsMat);
  shinL.position.set(0, -0.65, 0.05);
  legL.add(shinL);

  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.46), pantsMat);
  footL.position.set(0, -0.88, 0.14);
  legL.add(footL);

  peon.add(legL);

  // Right Leg
  const legR = new THREE.Group();
  legR.name = 'LegR';
  legR.position.set(0.25, 0.85, -0.05);

  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.36), pantsMat);
  thighR.position.set(0, -0.25, 0);
  legR.add(thighR);

  const shinR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.32), pantsMat);
  shinR.position.set(0, -0.65, 0.05);
  legR.add(shinR);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.46), pantsMat);
  footR.position.set(0, -0.88, 0.14);
  legR.add(footR);

  peon.add(legR);

  // Enable Shadows
  enableShadows(peon);

  // Register userData references for animations & controls
  peon.userData = {
    torso: torsoGroup,
    head: headGroup,
    armL: armL,
    armR: armR,
    legL: legL,
    legR: legR,
    toolGroup: toolGroup,
    axe: axe,
    pickaxe: pickaxe,
    hammer: hammer,
    pack: pack,
    woodBundle: woodBundle,
    goldSack: goldSack
  };

  return peon;
}
