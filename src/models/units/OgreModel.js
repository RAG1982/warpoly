import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { getOgreFaceTextures, getOgreClubTextures } from './ogreTextures.js';
import { getGruntArmorTextures } from './gruntTextures.js';
import { getPeonPantsBootsTextures } from './peonTextures.js';

/**
 * Next-Gen Stylized Low-Poly Orc Ogre (Ogro da Horda / Brutamontes Gigante)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Features:
 * - Colossal, hulking brute build (large scale, massive torso, belly, and thick arms).
 * - Ochre-tan brute skin, heavy brow, single ivory horn atop head.
 * - Studded leather harness, belt with iron buckle, and heavy spiked tree-trunk club.
 * 
 * Rigging / userData:
 * Contains { torso, head, armL, armR, legL, legR, weapon, horn }
 * compatible with UnitAnimator!
 */
export function createOgre() {
  const ogre = new THREE.Group();
  ogre.name = 'Ogre';

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

  const faceMat = createPBRMaterial(getOgreFaceTextures(), { bumpScale: 0.06 });
  const armorMat = createPBRMaterial(getGruntArmorTextures(), { bumpScale: 0.06 });
  const clubMat = createPBRMaterial(getOgreClubTextures(), { bumpScale: 0.07, metalness: 0.6 });
  const pantsMat = createPBRMaterial(getPeonPantsBootsTextures(), { bumpScale: 0.06 });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x854d0e,
    roughness: 0.7,
    metalness: 0.1,
    flatShading: true
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.8,
    flatShading: true
  });

  // --- 1. TORSO (Giant, rotund, powerful) ---
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'Torso';
  torsoGroup.position.set(0, 1.45, 0);

  // Massive chest
  const chestGeo = new THREE.BoxGeometry(1.35, 0.85, 0.88);
  const chestMesh = new THREE.Mesh(chestGeo, armorMat);
  chestMesh.position.set(0, 0.22, 0);
  torsoGroup.add(chestMesh);

  // Rotund belly
  const bellyGeo = new THREE.BoxGeometry(1.28, 0.68, 0.95);
  const bellyMesh = new THREE.Mesh(bellyGeo, skinMat);
  bellyMesh.position.set(0, -0.4, 0.06);
  torsoGroup.add(bellyMesh);

  // --- 2. HEAD & HORN ---
  const headGroup = new THREE.Group();
  headGroup.name = 'Head';
  headGroup.position.set(0, 0.82, 0.15);

  const headGeo = new THREE.BoxGeometry(0.72, 0.68, 0.72);
  const headMesh = new THREE.Mesh(headGeo, faceMat);
  headGroup.add(headMesh);

  // Single Ivory Horn on Forehead
  const hornGeo = new THREE.ConeGeometry(0.12, 0.52, 6);
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.35 });
  const horn = new THREE.Mesh(hornGeo, hornMat);
  horn.name = 'Horn';
  horn.position.set(0, 0.42, 0.28);
  horn.rotation.x = 0.45;
  headGroup.add(horn);

  torsoGroup.add(headGroup);

  // --- 3. ARMS & SPIKED CLUB ---
  // Left Arm
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.82, 0.38, 0);

  const bicepL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.42), skinMat);
  bicepL.position.set(0, -0.24, 0);
  armL.add(bicepL);

  const forearmL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.38), skinMat);
  forearmL.position.set(0, -0.68, 0.06);
  forearmL.rotation.x = 0.35;
  armL.add(forearmL);

  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.36), ironMat);
  handL.position.set(0, -0.98, 0.16);
  armL.add(handL);

  torsoGroup.add(armL);

  // Right Arm (Club Arm)
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.82, 0.38, 0);

  const bicepR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.42), skinMat);
  bicepR.position.set(0, -0.24, 0);
  armR.add(bicepR);

  const forearmR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.38), skinMat);
  forearmR.position.set(0, -0.68, 0.06);
  forearmR.rotation.x = 0.35;
  armR.add(forearmR);

  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.36), ironMat);
  handR.position.set(0, -0.98, 0.16);
  armR.add(handR);

  // Spiked Tree Trunk Club
  const weapon = new THREE.Group();
  weapon.name = 'Weapon';
  weapon.position.set(0, -1.02, 0.24);
  weapon.rotation.x = -Math.PI / 4;

  const clubHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 2.1, 7), clubMat);
  clubHaft.position.set(0, 0.45, 0);
  weapon.add(clubHaft);

  // Spikes sticking out of club
  for (let i = 0; i < 8; i++) {
    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), ironMat);
    const angle = (i / 8) * Math.PI * 2;
    spk.position.set(Math.cos(angle) * 0.14, 0.6 + (i % 3) * 0.25, Math.sin(angle) * 0.14);
    spk.rotation.z = Math.cos(angle) * 0.5;
    spk.rotation.x = Math.sin(angle) * 0.5;
    weapon.add(spk);
  }

  armR.add(weapon);
  torsoGroup.add(armR);

  ogre.add(torsoGroup);

  // --- 4. LEGS (Thick tree-trunk legs) ---
  // Left Leg
  const legL = new THREE.Group();
  legL.name = 'LegL';
  legL.position.set(-0.38, 0.95, 0);

  const thighL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.5), pantsMat);
  thighL.position.set(0, -0.28, 0);
  legL.add(thighL);

  const shinL = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.46), pantsMat);
  shinL.position.set(0, -0.74, 0.04);
  legL.add(shinL);

  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.62), pantsMat);
  footL.position.set(0, -1.02, 0.18);
  legL.add(footL);

  ogre.add(legL);

  // Right Leg
  const legR = new THREE.Group();
  legR.name = 'LegR';
  legR.position.set(0.38, 0.95, 0);

  const thighR = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.5), pantsMat);
  thighR.position.set(0, -0.28, 0);
  legR.add(thighR);

  const shinR = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.46), pantsMat);
  shinR.position.set(0, -0.74, 0.04);
  legR.add(shinR);

  const footR = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.62), pantsMat);
  footR.position.set(0, -1.02, 0.18);
  legR.add(footR);

  ogre.add(legR);

  enableShadows(ogre);

  ogre.userData = {
    torso: torsoGroup,
    head: headGroup,
    armL: armL,
    armR: armR,
    legL: legL,
    legR: legR,
    weapon: weapon,
    horn: horn
  };

  return ogre;
}
