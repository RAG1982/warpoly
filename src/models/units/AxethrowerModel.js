import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getAxethrowerFaceTextures,
  getAxethrowerHarnessTextures,
  getAxethrowerAxeTextures
} from './axethrowerTextures.js';

/**
 * Next-Gen Stylized Low-Poly Troll Axethrower (Arremessador de Machadinhas Troll / Atirador da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Features:
 * - Lean, predatory, athletic troll build.
 * - Jungle teal skin with war paint stripes and long curved ivory tusks.
 * - Magnificent tall flaming-orange/crimson mohawk hair crest.
 * - Tribal bone bead necklace and fur tiger-pattern loincloth.
 * - Twin throwing tomahawks with razor crescent steel edges and rawhide wraps.
 * 
 * Rigging / userData:
 * Contains { torso, head, armL, armR, legL, legR, weapon, weaponL, weaponR, mohawk, drawnAxe }
 * compatible with UnitAnimator (Idle, Walk, Ranged Axe Throw, Hurt, Die)!
 */
export function createAxethrower() {
  const troll = new THREE.Group();
  troll.name = 'Axethrower';

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

  const faceMat = createPBRMaterial(getAxethrowerFaceTextures(), { bumpScale: 0.06 });
  const harnessMat = createPBRMaterial(getAxethrowerHarnessTextures(), { bumpScale: 0.06 });
  const axeMat = createPBRMaterial(getAxethrowerAxeTextures(), { bumpScale: 0.06, metalness: 0.8 });

  const trollSkinMat = new THREE.MeshStandardMaterial({
    color: 0x0d9488,
    roughness: 0.6,
    metalness: 0.1,
    flatShading: true
  });

  const mohawkMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true
  });

  const tuskMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true
  });

  // --- 1. TORSO (Lean, athletic, upright) ---
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'Torso';
  torsoGroup.position.set(0, 1.3, 0);

  // Ribcage / Chest
  const chestGeo = new THREE.BoxGeometry(0.78, 0.72, 0.48);
  const chestMesh = new THREE.Mesh(chestGeo, harnessMat);
  chestMesh.position.set(0, 0.18, 0);
  torsoGroup.add(chestMesh);

  // Lean Waist
  const waistGeo = new THREE.BoxGeometry(0.66, 0.48, 0.42);
  const waistMesh = new THREE.Mesh(waistGeo, harnessMat);
  waistMesh.position.set(0, -0.32, 0);
  torsoGroup.add(waistMesh);

  // Fur Loincloth
  const kiltGeo = new THREE.BoxGeometry(0.7, 0.42, 0.46);
  const kiltMesh = new THREE.Mesh(kiltGeo, harnessMat);
  kiltMesh.position.set(0, -0.62, 0);
  torsoGroup.add(kiltMesh);

  // --- 2. HEAD & MOHAWK ---
  const headGroup = new THREE.Group();
  headGroup.name = 'Head';
  headGroup.position.set(0, 0.66, 0.05);

  const headGeo = new THREE.BoxGeometry(0.48, 0.52, 0.52);
  // Rosto só na face frontal (+Z); demais faces com pele lisa (ordem BoxGeometry: +x,-x,+y,-y,+z,-z)
  const headMesh = new THREE.Mesh(headGeo, [trollSkinMat, trollSkinMat, trollSkinMat, trollSkinMat, faceMat, trollSkinMat]);
  headGroup.add(headMesh);

  // Tall Flaming Mohawk Hair Crest
  const mohawkGeo = new THREE.BoxGeometry(0.14, 0.72, 0.65);
  const mohawk = new THREE.Mesh(mohawkGeo, mohawkMat);
  mohawk.name = 'Mohawk';
  mohawk.position.set(0, 0.48, -0.04);
  mohawk.rotation.x = -0.15;
  headGroup.add(mohawk);

  // Long Pointed Troll Ears
  [-0.28, 0.28].forEach(ex => {
    const earGeo = new THREE.ConeGeometry(0.08, 0.42, 4);
    const earMesh = new THREE.Mesh(earGeo, trollSkinMat);
    earMesh.position.set(ex, 0.1, -0.1);
    earMesh.rotation.z = ex > 0 ? -Math.PI / 3 : Math.PI / 3;
    earMesh.rotation.x = -0.35;
    headGroup.add(earMesh);
  });

  // Long Curved Troll Tusks
  [-0.18, 0.18].forEach(tx => {
    const isL = tx < 0;
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.42, 5), tuskMat);
    tusk.position.set(tx, 0.02, 0.28);
    tusk.rotation.x = -0.55;
    tusk.rotation.z = isL ? 0.35 : -0.35;
    headGroup.add(tusk);
  });

  torsoGroup.add(headGroup);

  // --- 3. ARMS & THROWING AXES ---
  function buildThrowingAxe() {
    const axeGrp = new THREE.Group();
    // Haft
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 6), axeMat);
    haft.position.set(0, 0.12, 0);
    axeGrp.add(haft);

    // Crescent Blade
    const bladeGeo = new THREE.BoxGeometry(0.05, 0.42, 0.35);
    const blade = new THREE.Mesh(bladeGeo, axeMat);
    blade.position.set(0, 0.48, 0.16);
    axeGrp.add(blade);

    // Feather / Bone ornament
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), mohawkMat);
    feather.position.set(0, -0.35, 0);
    feather.rotation.z = Math.PI;
    axeGrp.add(feather);

    return axeGrp;
  }

  // Left Arm (Holds second axe)
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.48, 0.38, 0);

  const bicepL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.24), trollSkinMat);
  bicepL.position.set(0, -0.22, 0);
  armL.add(bicepL);

  const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.22), trollSkinMat);
  forearmL.position.set(0, -0.58, 0.05);
  forearmL.rotation.x = 0.3;
  armL.add(forearmL);

  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), trollSkinMat);
  handL.position.set(0, -0.82, 0.14);
  armL.add(handL);

  const weaponL = buildThrowingAxe();
  weaponL.name = 'WeaponL';
  weaponL.position.set(0, -0.84, 0.18);
  weaponL.rotation.x = -Math.PI / 4;
  armL.add(weaponL);

  torsoGroup.add(armL);

  // Right Arm (Primary Throwing Arm)
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.48, 0.38, 0);

  const bicepR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.46, 0.24), trollSkinMat);
  bicepR.position.set(0, -0.22, 0);
  armR.add(bicepR);

  const forearmR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.22), trollSkinMat);
  forearmR.position.set(0, -0.58, 0.05);
  forearmR.rotation.x = 0.3;
  armR.add(forearmR);

  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), trollSkinMat);
  handR.position.set(0, -0.82, 0.14);
  armR.add(handR);

  const weaponR = buildThrowingAxe();
  weaponR.name = 'WeaponR';
  weaponR.position.set(0, -0.84, 0.18);
  weaponR.rotation.x = -Math.PI / 4;
  armR.add(weaponR);

  torsoGroup.add(armR);

  troll.add(torsoGroup);

  // --- 4. LEGS (Long, athletic) ---
  // Left Leg
  const legL = new THREE.Group();
  legL.name = 'LegL';
  legL.position.set(-0.24, 0.85, 0);

  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.54, 0.3), trollSkinMat);
  thighL.position.set(0, -0.24, 0);
  legL.add(thighL);

  const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.26), trollSkinMat);
  shinL.position.set(0, -0.66, 0.04);
  legL.add(shinL);

  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.45), trollSkinMat);
  footL.position.set(0, -0.9, 0.15);
  legL.add(footL);

  troll.add(legL);

  // Right Leg
  const legR = new THREE.Group();
  legR.name = 'LegR';
  legR.position.set(0.24, 0.85, 0);

  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.54, 0.3), trollSkinMat);
  thighR.position.set(0, -0.24, 0);
  legR.add(thighR);

  const shinR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.26), trollSkinMat);
  shinR.position.set(0, -0.66, 0.04);
  legR.add(shinR);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.45), trollSkinMat);
  footR.position.set(0, -0.9, 0.15);
  legR.add(footR);

  troll.add(legR);

  enableShadows(troll);

  troll.userData = {
    torso: torsoGroup,
    head: headGroup,
    armL: armL,
    armR: armR,
    legL: legL,
    legR: legR,
    weapon: weaponR,
    weaponL: weaponL,
    weaponR: weaponR,
    drawnAxe: weaponR,
    mohawk: mohawk
  };

  return troll;
}
