import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getGruntFaceTextures,
  getGruntArmorTextures,
  getGruntAxeTextures
} from './gruntTextures.js';
import { getPeonPantsBootsTextures } from './peonTextures.js';

/**
 * Next-Gen Stylized Low-Poly Orc Grunt (Guerreiro Grunt / Infantaria de Choque da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Features:
 * - Broad, massive muscular physique with imposing broad shoulders.
 * - Emerald green skin with crimson war paint, heavy tusks, and glowing amber eyes.
 * - Heavy blackened iron spangenhelm helmet with massive curved bone horns.
 * - Spiked iron shoulder pauldrons with forged steel spikes.
 * - Studded iron cuirass with red Horde crest, fur war kilt, and iron-plated boots.
 * - Colossal double-bladed battleaxe with razor-sharp edges and leather wrap.
 * 
 * Rigging / userData:
 * Contains { torso, head, armL, armR, legL, legR, weapon, helm, hornL, hornR, pauldronL, pauldronR }
 * fully compatible with UnitAnimator (Idle, Walk, Fight Cleave, Hurt, Die)!
 */
export function createGrunt() {
  const grunt = new THREE.Group();
  grunt.name = 'Grunt';

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

  const faceMat = createPBRMaterial(getGruntFaceTextures(), { bumpScale: 0.06 });
  const armorMat = createPBRMaterial(getGruntArmorTextures(), { bumpScale: 0.07, metalness: 0.8 });
  const axeMat = createPBRMaterial(getGruntAxeTextures(), { bumpScale: 0.06, metalness: 0.85 });
  const pantsMat = createPBRMaterial(getPeonPantsBootsTextures(), { bumpScale: 0.06 });

  const orcSkinMat = new THREE.MeshStandardMaterial({
    color: 0x2d4e1c,
    roughness: 0.65,
    metalness: 0.1,
    flatShading: true
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.85,
    flatShading: true
  });

  const hornMat = new THREE.MeshStandardMaterial({
    color: 0xf3f4f6,
    roughness: 0.45,
    metalness: 0.05,
    flatShading: true
  });

  // --- 1. TORSO (Massive, broad-shouldered) ---
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'Torso';
  torsoGroup.position.set(0, 1.35, 0);

  // Heavy Cuirass
  const chestGeo = new THREE.BoxGeometry(1.08, 0.78, 0.68);
  const chestMesh = new THREE.Mesh(chestGeo, armorMat);
  chestMesh.position.set(0, 0.15, 0);
  torsoGroup.add(chestMesh);

  // Waist & Belt
  const waistGeo = new THREE.BoxGeometry(0.92, 0.54, 0.58);
  const waistMesh = new THREE.Mesh(waistGeo, armorMat);
  waistMesh.position.set(0, -0.35, 0);
  torsoGroup.add(waistMesh);

  // Fur War Kilt
  const furGeo = new THREE.BoxGeometry(0.96, 0.35, 0.62);
  const furMesh = new THREE.Mesh(furGeo, new THREE.MeshStandardMaterial({ color: 0x3f2d1e, roughness: 0.9 }));
  furMesh.position.set(0, -0.62, 0);
  torsoGroup.add(furMesh);

  // --- 2. HEAD & HORNS ---
  const headGroup = new THREE.Group();
  headGroup.name = 'Head';
  headGroup.position.set(0, 0.7, 0.08);

  const headGeo = new THREE.BoxGeometry(0.62, 0.6, 0.62);
  const headMesh = new THREE.Mesh(headGeo, faceMat);
  headGroup.add(headMesh);

  // Spangenhelm Iron Helmet
  const helmGeo = new THREE.BoxGeometry(0.66, 0.38, 0.66);
  const helmMesh = new THREE.Mesh(helmGeo, ironMat);
  helmMesh.position.set(0, 0.2, 0);
  headGroup.add(helmMesh);

  // Nose & Brow Guard
  const noseGuard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.14), ironMat);
  noseGuard.position.set(0, 0.05, 0.34);
  headGroup.add(noseGuard);

  // Massive Curved Bone Horns
  const hornL = new THREE.Group();
  hornL.name = 'HornL';
  const hornR = new THREE.Group();
  hornR.name = 'HornR';

  [-0.38, 0.38].forEach(hx => {
    const isL = hx < 0;
    const hornObj = isL ? hornL : hornR;
    hornObj.position.set(hx, 0.28, 0.05);

    // Segment 1 (Base pointing outward)
    const baseCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.35, 6), hornMat);
    baseCyl.rotation.z = isL ? Math.PI / 3 : -Math.PI / 3;
    hornObj.add(baseCyl);

    // Segment 2 (Curve pointing upward & forward)
    const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 6), hornMat);
    tipCone.position.set(isL ? -0.22 : 0.22, 0.25, 0.08);
    tipCone.rotation.z = isL ? 0.25 : -0.25;
    tipCone.rotation.x = 0.3;
    hornObj.add(tipCone);

    headGroup.add(hornObj);
  });

  // Sharp Lower Tusks
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.25 });
  [-0.19, 0.19].forEach(tx => {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.28, 5), tuskMat);
    tusk.position.set(tx, -0.06, 0.34);
    tusk.rotation.x = -0.35;
    headGroup.add(tusk);
  });

  torsoGroup.add(headGroup);

  // --- 3. PAULDRONS (Spiked Iron Shoulders) ---
  const pauldronL = new THREE.Group();
  pauldronL.name = 'PauldronL';
  pauldronL.position.set(-0.65, 0.48, 0);

  const pPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.52), ironMat);
  pPlateL.rotation.z = 0.25;
  pauldronL.add(pPlateL);

  // Shoulder Spikes
  const spikeL1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 5), ironMat);
  spikeL1.position.set(-0.14, 0.24, 0);
  spikeL1.rotation.z = 0.45;
  pauldronL.add(spikeL1);

  torsoGroup.add(pauldronL);

  const pauldronR = new THREE.Group();
  pauldronR.name = 'PauldronR';
  pauldronR.position.set(0.65, 0.48, 0);

  const pPlateR = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.52), ironMat);
  pPlateR.rotation.z = -0.25;
  pauldronR.add(pPlateR);

  const spikeR1 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 5), ironMat);
  spikeR1.position.set(0.14, 0.24, 0);
  spikeR1.rotation.z = -0.45;
  pauldronR.add(spikeR1);

  torsoGroup.add(pauldronR);

  // --- 4. ARMS & WEAPON ---
  // Left Arm
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.64, 0.32, 0);

  const bicepL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.32), orcSkinMat);
  bicepL.position.set(0, -0.22, 0);
  armL.add(bicepL);

  const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.48, 0.3), ironMat);
  forearmL.position.set(0, -0.62, 0.05);
  forearmL.rotation.x = 0.35;
  armL.add(forearmL);

  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), ironMat);
  handL.position.set(0, -0.88, 0.15);
  armL.add(handL);

  torsoGroup.add(armL);

  // Right Arm (Weapon Arm)
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.64, 0.32, 0);

  const bicepR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.32), orcSkinMat);
  bicepR.position.set(0, -0.22, 0);
  armR.add(bicepR);

  const forearmR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.48, 0.3), ironMat);
  forearmR.position.set(0, -0.62, 0.05);
  forearmR.rotation.x = 0.35;
  armR.add(forearmR);

  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), ironMat);
  handR.position.set(0, -0.88, 0.15);
  armR.add(handR);

  // --- COLOSSAL DOUBLE-BLADED BATTLEAXE ---
  const weapon = new THREE.Group();
  weapon.name = 'Weapon';
  weapon.position.set(0, -0.9, 0.22);
  weapon.rotation.x = -Math.PI / 4;

  // Heavy Haft
  const shaftGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.85, 8);
  const shaftMesh = new THREE.Mesh(shaftGeo, axeMat);
  shaftMesh.position.set(0, 0.3, 0);
  weapon.add(shaftMesh);

  // Double Cleaver Blades (Fore & Aft)
  [-0.32, 0.32].forEach(bx => {
    const isFront = bx > 0;
    const bladeGeo = new THREE.BoxGeometry(0.07, 0.72, 0.52);
    const bladeMesh = new THREE.Mesh(bladeGeo, axeMat);
    bladeMesh.position.set(0, 0.95, bx);
    weapon.add(bladeMesh);

    // Beveled wingtips
    const tipMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), axeMat);
    tipMesh.position.set(0, 1.35, bx);
    tipMesh.rotation.x = isFront ? 0.3 : -0.3;
    weapon.add(tipMesh);
  });

  // Top Spear Point / Spike
  const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), axeMat);
  topSpike.position.set(0, 1.45, 0);
  weapon.add(topSpike);

  // Skull/Spike Pommel
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), ironMat);
  pommel.position.set(0, -0.65, 0);
  weapon.add(pommel);

  armR.add(weapon);
  torsoGroup.add(armR);

  grunt.add(torsoGroup);

  // --- 5. LEGS & COMBAT BOOTS ---
  // Left Leg
  const legL = new THREE.Group();
  legL.name = 'LegL';
  legL.position.set(-0.3, 0.9, 0);

  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.58, 0.4), pantsMat);
  thighL.position.set(0, -0.26, 0);
  legL.add(thighL);

  const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.36), ironMat);
  shinL.position.set(0, -0.68, 0.04);
  legL.add(shinL);

  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.52), ironMat);
  bootL.position.set(0, -0.92, 0.16);
  legL.add(bootL);

  grunt.add(legL);

  // Right Leg
  const legR = new THREE.Group();
  legR.name = 'LegR';
  legR.position.set(0.3, 0.9, 0);

  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.58, 0.4), pantsMat);
  thighR.position.set(0, -0.26, 0);
  legR.add(thighR);

  const shinR = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.36), ironMat);
  shinR.position.set(0, -0.68, 0.04);
  legR.add(shinR);

  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.52), ironMat);
  bootR.position.set(0, -0.92, 0.16);
  legR.add(bootR);

  grunt.add(legR);

  enableShadows(grunt);

  grunt.userData = {
    torso: torsoGroup,
    head: headGroup,
    armL: armL,
    armR: armR,
    legL: legL,
    legR: legR,
    weapon: weapon,
    helm: helmMesh,
    hornL: hornL,
    hornR: hornR,
    pauldronL: pauldronL,
    pauldronR: pauldronR
  };

  return grunt;
}
