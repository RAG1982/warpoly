import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getArcherHoodTextures,
  getArcherFaceTextures,
  getArcherFeatherTextures,
  getArcherTunicTextures,
  getArcherBracersPauldronsTextures,
  getArcherLegsBootsTextures,
  getArcherBowTextures,
  getArcherQuiverTextures
} from './archerTextures.js';

/**
 * Next-Gen Stylized Low-Poly Archer (Warcraft 2 Hand-Painted / Overwatch / UE5 Art Style)
 * Faithfully crafted from the professional 3D character turnaround sheet concept art:
 * 
 * Key Features:
 * 1. Deep forest emerald green hood with cowl peak, compact neck collar, and two-tiered golden feather ornament.
 * 2. Rugged, determined warrior face with trimmed sandy-brown beard and mustache, intense archer eyes.
 * 3. Deep emerald tunic with rich golden embroidered borders and central split hem.
 * 4. Cross-body heavy leather harness with brass buckles, round metal studs, and sturdy war belt.
 * 5. Hip utility pouches, sheathed hunting dagger on right hip, and ranger shortsword on left hip.
 * 6. Chunky two-tiered studded leather & steel pauldrons, short tunic sleeves with gold hems, bare muscular arms.
 * 7. Heavy steel forearm vambraces with metal rivets over leather wraps, and fingerless shooting gloves.
 * 8. Olive ranger trousers with curved steel knee poleyns, cuffed leather boots with steel toe caps.
 * 9. Ornate carved golden-oak recurve bow held firmly in left hand, with graceful recurved tips, elven golden runes, and taut string.
 * 10. Hand-tooled leather back quiver slung diagonally, featuring an ornate gold collar with green emerald jewel,
 *     stuffed with fletched arrows.
 * 
 * @returns {THREE.Group}
 */
export function createArcher() {
  const archer = new THREE.Group();
  archer.name = 'Archer';

  // --- 1. PBR Texture Sets & Material Helpers ---
  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale || 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.60,
      metalness: opts.metalness !== undefined ? opts.metalness : 1.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const hoodClothMat = createPBRMaterial(getArcherHoodTextures(), { bumpScale: 0.05, roughness: 0.55 });
  const faceMat = createPBRMaterial(getArcherFaceTextures(), { bumpScale: 0.05, roughness: 0.55 });
  const featherMat = createPBRMaterial(getArcherFeatherTextures(), { bumpScale: 0.05, roughness: 0.40, metalness: 0.5 });
  const tunicMat = createPBRMaterial(getArcherTunicTextures(), { bumpScale: 0.05, roughness: 0.55 });
  const bracersPauldronsMat = createPBRMaterial(getArcherBracersPauldronsTextures(), { bumpScale: 0.05, roughness: 0.32, metalness: 0.85 });
  const legsBootsMat = createPBRMaterial(getArcherLegsBootsTextures(), { bumpScale: 0.05, roughness: 0.58 });
  const bowMat = createPBRMaterial(getArcherBowTextures(), { bumpScale: 0.05, roughness: 0.45 });
  const quiverMat = createPBRMaterial(getArcherQuiverTextures(), { bumpScale: 0.05, roughness: 0.55 });

  // Accent & Trim Materials
  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.18,
    metalness: 0.90,
    flatShading: true
  });

  const steelAccentMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.22,
    metalness: 0.88,
    flatShading: true
  });

  const leatherAccentMat = new THREE.MeshStandardMaterial({
    color: 0x5a2d16,
    roughness: 0.72,
    metalness: 0.05,
    flatShading: true
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xdf9f79,
    roughness: 0.65,
    metalness: 0.0,
    flatShading: true
  });

  const beardMat = new THREE.MeshStandardMaterial({
    color: 0x6b4c28,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: true
  });

  const emeraldGemMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x047857,
    roughness: 0.08,
    metalness: 0.15,
    flatShading: true
  });

  const bowStringMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.15
  });

  const arrowShaftMat = new THREE.MeshStandardMaterial({
    color: 0xca8a04,
    roughness: 0.65,
    metalness: 0.0,
    flatShading: true
  });

  const arrowFletchMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    roughness: 0.50,
    metalness: 0.10,
    flatShading: true
  });

  // --- 2. TORSO & TUNIC & HARNESS ---
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 1.05, 0);

  // Upper Chest / Emerald Tunic Block
  const chestGeo = new THREE.BoxGeometry(0.54, 0.48, 0.34);
  const chest = new THREE.Mesh(chestGeo, tunicMat);
  chest.position.set(0, 0.14, 0);
  torso.add(chest);

  // Gold Trim Collar Hem at top of chest
  const collarTrim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.36), goldAccentMat);
  collarTrim.position.set(0, 0.38, 0);
  torso.add(collarTrim);

  // 3D Diagonal Cross-Body Harness Straps with Rivets
  // Primary diagonal strap: right shoulder down to left hip
  const strap1Geo = new THREE.BoxGeometry(0.12, 0.54, 0.03);
  const strap1 = new THREE.Mesh(strap1Geo, leatherAccentMat);
  strap1.position.set(0, 0.14, 0.18);
  strap1.rotation.z = -0.52;
  torso.add(strap1);

  // Secondary diagonal cross strap
  const strap2Geo = new THREE.BoxGeometry(0.10, 0.52, 0.03);
  const strap2 = new THREE.Mesh(strap2Geo, leatherAccentMat);
  strap2.position.set(0, 0.14, 0.185);
  strap2.rotation.z = 0.52;
  torso.add(strap2);

  // Square Brass Harness Buckle at intersection
  const harnessBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.04), goldAccentMat);
  harnessBuckle.position.set(-0.02, 0.16, 0.205);
  torso.add(harnessBuckle);

  // Harness Metal Studs / Rivets
  [-0.15, 0.15].forEach((sy, idx) => {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), steelAccentMat);
    rivet.position.set(idx === 0 ? 0.13 : -0.14, 0.14 + sy, 0.20);
    torso.add(rivet);
  });

  // Heavy Leather War Belt at Waist
  const beltGeo = new THREE.BoxGeometry(0.58, 0.14, 0.38);
  const belt = new THREE.Mesh(beltGeo, leatherAccentMat);
  belt.position.set(0, -0.14, 0);
  torso.add(belt);

  // Center Chunky Golden War Belt Buckle
  const buckleGeo = new THREE.BoxGeometry(0.18, 0.16, 0.05);
  const buckle = new THREE.Mesh(buckleGeo, goldAccentMat);
  buckle.position.set(0, -0.14, 0.21);
  torso.add(buckle);

  const buckleProng = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.03), goldAccentMat);
  buckleProng.position.set(0, -0.14, 0.235);
  torso.add(buckleProng);

  // Right Hip: Leather Utility Pouch & Sheathed Hunting Dagger
  const pouchR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.12), leatherAccentMat);
  pouchR.position.set(0.31, -0.16, 0.06);
  pouchR.rotation.z = -0.12;
  torso.add(pouchR);

  const pouchRFlap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.13), leatherAccentMat);
  pouchRFlap.position.set(0.31, -0.10, 0.06);
  pouchRFlap.rotation.z = -0.12;
  torso.add(pouchRFlap);

  const pouchRStud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), goldAccentMat);
  pouchRStud.position.set(0.31, -0.14, 0.13);
  torso.add(pouchRStud);

  // Hunting Dagger Sheath on Right Hip
  const daggerSheath = new THREE.Group();
  daggerSheath.position.set(0.24, -0.26, 0.18);
  daggerSheath.rotation.z = 0.15;
  daggerSheath.rotation.x = 0.1;

  const dScabbard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), leatherAccentMat);
  daggerSheath.add(dScabbard);

  const dTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), goldAccentMat);
  dTip.position.set(0, -0.14, 0);
  dTip.rotation.x = Math.PI;
  daggerSheath.add(dTip);

  const dHilt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.03), goldAccentMat);
  dHilt.position.set(0, 0.16, 0);
  daggerSheath.add(dHilt);
  torso.add(daggerSheath);

  // Left Hip: Ranger Shortsword / Long Dagger
  const swordSheath = new THREE.Group();
  swordSheath.position.set(-0.31, -0.28, 0.04);
  swordSheath.rotation.z = -0.25;
  swordSheath.rotation.x = 0.15;

  const sScabbard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.04), leatherAccentMat);
  swordSheath.add(sScabbard);

  const sTip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 4), steelAccentMat);
  sTip.position.set(0, -0.22, 0);
  sTip.rotation.x = Math.PI;
  swordSheath.add(sTip);

  const sPommel = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04, 0), goldAccentMat);
  sPommel.position.set(0, 0.25, 0);
  swordSheath.add(sPommel);
  torso.add(swordSheath);

  // Left Hip Utility Pouch behind shortsword
  const pouchL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.10), leatherAccentMat);
  pouchL.position.set(-0.29, -0.16, -0.10);
  pouchL.rotation.z = 0.12;
  torso.add(pouchL);

  // Tunic Skirt Flaps (Front Split & Back Flap)
  const flapFL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.03), tunicMat);
  flapFL.position.set(-0.14, -0.34, 0.18);
  flapFL.rotation.x = 0.10;
  torso.add(flapFL);

  const flapFLTrim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.035), goldAccentMat);
  flapFLTrim.position.set(-0.14, -0.47, 0.19);
  torso.add(flapFLTrim);

  const flapFR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.03), tunicMat);
  flapFR.position.set(0.14, -0.34, 0.18);
  flapFR.rotation.x = 0.10;
  torso.add(flapFR);

  const flapFRTrim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.035), goldAccentMat);
  flapFRTrim.position.set(0.14, -0.47, 0.19);
  torso.add(flapFRTrim);

  const flapBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.30, 0.03), tunicMat);
  flapBack.position.set(0, -0.35, -0.18);
  flapBack.rotation.x = -0.10;
  torso.add(flapBack);

  const flapBackTrim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.035), goldAccentMat);
  flapBackTrim.position.set(0, -0.49, -0.19);
  torso.add(flapBackTrim);

  // --- 10. THE DIAGONAL BACK QUIVER & ARROWS (Attached to Torso Back) ---
  const quiver = new THREE.Group();
  quiver.name = 'Quiver';
  // Slung diagonally across back: tilts from right shoulder down to left hip
  quiver.position.set(0.10, 0.24, -0.25);
  quiver.rotation.z = 0.32;
  quiver.rotation.x = -0.26;

  // Hand-Tooled Leather Cylinder Body
  const qBodyGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.74, 8);
  const qBody = new THREE.Mesh(qBodyGeo, quiverMat);
  quiver.add(qBody);

  // Reinforced Bottom Brass Cap
  const qBaseCap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.08, 8), goldAccentMat);
  qBaseCap.position.y = -0.37;
  quiver.add(qBaseCap);

  // Golden Filigree Collar at top mouth of quiver
  const qCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.14, 8), goldAccentMat);
  qCollar.position.y = 0.37;
  quiver.add(qCollar);

  // Large Glowing Emerald Cabochon Jewel on the collar
  const qEmerald = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), emeraldGemMat);
  qEmerald.position.set(0, 0.37, 0.13);
  qEmerald.scale.set(1.0, 1.0, 0.6);
  quiver.add(qEmerald);

  // Bundled Arrows protruding from quiver mouth
  const arrowAngles = [-0.18, -0.09, 0.0, 0.09, 0.18, 0.27];
  arrowAngles.forEach((ang, idx) => {
    const arrowGroup = new THREE.Group();
    arrowGroup.position.set(
      Math.sin(ang) * 0.07 + (idx % 2 === 0 ? 0.02 : -0.02),
      0.40,
      Math.cos(ang) * 0.05 - 0.02
    );
    arrowGroup.rotation.z = ang * 0.8;
    arrowGroup.rotation.x = (idx % 2 === 0 ? 0.08 : -0.08);

    // Arrow wooden shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.38, 4), arrowShaftMat);
    shaft.position.y = 0.16;
    arrowGroup.add(shaft);

    // 3 Fletching Feathers (White/Gold vanes)
    for (let f = 0; f < 3; f++) {
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.14, 0.045), arrowFletchMat);
      fletch.position.y = 0.27;
      fletch.rotation.y = (f * Math.PI * 2) / 3;
      arrowGroup.add(fletch);
    }

    // Gold/thread nock binding
    const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 4), goldAccentMat);
    nock.position.y = 0.35;
    arrowGroup.add(nock);

    quiver.add(arrowGroup);
  });

  torso.add(quiver);
  archer.add(torso);

  // --- 3. HEAD, FOREST GREEN HOOD & GOLDEN FEATHER ---
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.58, 0);

  // Hood Structure: neatly envelops head while leaving the front face opening clear and broad
  // A. Back wall of hood
  const hoodBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.22), hoodClothMat);
  hoodBack.position.set(0, 0.04, -0.10);
  head.add(hoodBack);

  // B. Top dome of hood
  const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.26), hoodClothMat);
  hoodTop.position.set(0, 0.20, 0.09);
  head.add(hoodTop);

  // C. Left side wall of hood
  const hoodSideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.24), hoodClothMat);
  hoodSideL.position.set(-0.19, 0.03, 0.08);
  head.add(hoodSideL);

  // D. Right side wall of hood
  const hoodSideR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.24), hoodClothMat);
  hoodSideR.position.set(0.19, 0.03, 0.08);
  head.add(hoodSideR);

  // E. Pointed Cowl Peak at top/back of hood
  const peakGeo = new THREE.ConeGeometry(0.20, 0.32, 5);
  const peak = new THREE.Mesh(peakGeo, hoodClothMat);
  peak.position.set(0, 0.22, -0.16);
  peak.rotation.x = -0.45;
  head.add(peak);

  // F. Compact Neck Collar (neatly connecting hood to shoulders without covering chest harness)
  const neckCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.24, 0.08, 8), hoodClothMat);
  neckCollar.position.set(0, -0.18, 0);
  head.add(neckCollar);

  // G. Golden Embroidered Face Opening Border Trim
  const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.035, 0.04), goldAccentMat);
  topTrim.position.set(0, 0.15, 0.20);
  head.add(topTrim);

  const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.04), goldAccentMat);
  leftTrim.position.set(-0.17, 0.0, 0.20);
  head.add(leftTrim);

  const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.04), goldAccentMat);
  rightTrim.position.set(0.17, 0.0, 0.20);
  head.add(rightTrim);

  // H. Front Faceplate: Clean, Heroic Hand-Painted Face & Trimmed Beard
  const faceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.04), faceMat);
  faceMesh.position.set(0, 0.01, 0.18);
  head.add(faceMesh);

  // Sculpted 3D Stylized Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), skinMat);
  nose.position.set(0, 0.03, 0.21);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  // I. Golden Feather Ornament (Pinned to Left Side of Hood)
  const plume = new THREE.Group();
  plume.name = 'Plume';
  plume.position.set(-0.24, 0.18, 0.02);
  plume.rotation.z = -0.32;
  plume.rotation.x = -0.22;

  // Primary Long Feather
  const f1Geo = new THREE.BoxGeometry(0.08, 0.38, 0.015);
  const feather1 = new THREE.Mesh(f1Geo, featherMat);
  feather1.position.set(-0.04, 0.16, 0);
  feather1.rotation.z = -0.15;
  plume.add(feather1);

  // Secondary Tiered Feather
  const f2Geo = new THREE.BoxGeometry(0.06, 0.28, 0.015);
  const feather2 = new THREE.Mesh(f2Geo, featherMat);
  feather2.position.set(0.02, 0.12, 0.02);
  feather2.rotation.z = 0.15;
  plume.add(feather2);

  // Golden Brooch Pin with Emerald Stud
  const brooch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 6), goldAccentMat);
  brooch.position.set(0, 0, 0.02);
  brooch.rotation.x = Math.PI / 2;
  plume.add(brooch);

  const broochGem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), emeraldGemMat);
  broochGem.position.set(0, 0, 0.035);
  plume.add(broochGem);

  head.add(plume);
  archer.add(head);

  // --- 4. PAULDRONS & ARMS ---
  function createPauldron(isLeft = true) {
    const pGroup = new THREE.Group();
    pGroup.name = isLeft ? 'PauldronL' : 'PauldronR';

    // Leather foundation base
    const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.28), leatherAccentMat);
    pGroup.add(pBase);

    // Upper Curved Studded Steel Plate
    const plateUpper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), bracersPauldronsMat);
    plateUpper.position.set(0, 0.05, 0);
    pGroup.add(plateUpper);

    // Lower Tiered Plate
    const plateLower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.24), bracersPauldronsMat);
    plateLower.position.set(0, -0.06, 0);
    pGroup.add(plateLower);

    // Domed Steel Rivets on Pauldron Plate Rims
    [-0.09, 0, 0.09].forEach(px => {
      const rUp = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 4), steelAccentMat);
      rUp.position.set(px, 0.05, 0.135);
      pGroup.add(rUp);

      const rLow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), steelAccentMat);
      rLow.position.set(px, -0.06, 0.125);
      pGroup.add(rLow);
    });

    return pGroup;
  }

  // Left Arm (Holds Bow in hand)
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.38, 1.25, 0);

  // Pauldron on shoulder
  const pauldronL = createPauldron(true);
  pauldronL.position.set(0, 0.08, 0);
  pauldronL.rotation.z = 0.22;
  armL.add(pauldronL);

  // Short Green Tunic Sleeve with Gold Trim
  const sleeveL = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.115, 0.14, 6), tunicMat);
  sleeveL.position.set(0, -0.04, 0);
  armL.add(sleeveL);

  const sleeveTrimL = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.03, 6), goldAccentMat);
  sleeveTrimL.position.set(0, -0.10, 0);
  armL.add(sleeveTrimL);

  // Muscular Bare Upper Arm (Bicep)
  const bicepL = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.18, 6), skinMat);
  bicepL.position.set(0, -0.18, 0);
  armL.add(bicepL);

  // Forearm with Heavy Archer Vambrace (Steel Plate + Rivets)
  const foreArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.24, 6), bracersPauldronsMat);
  foreArmL.position.set(0, -0.36, 0.02);
  armL.add(foreArmL);

  // Outer Curved Steel Guard Plate
  const guardPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.14), steelAccentMat);
  guardPlateL.position.set(-0.08, -0.36, 0.02);
  armL.add(guardPlateL);

  [-0.06, 0, 0.06].forEach(gy => {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), steelAccentMat);
    r.position.set(-0.11, -0.36 + gy, 0.02);
    armL.add(r);
  });

  // Fingerless Archer Glove & Bare Fingers
  const gloveL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), leatherAccentMat);
  gloveL.position.set(0, -0.51, 0.02);
  armL.add(gloveL);

  const fingersL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.12), skinMat);
  fingersL.position.set(0, -0.58, 0.02);
  armL.add(fingersL);

  // --- 6. THE ORNATE CARVED RECURVE GOLDEN-OAK BOW (Held in Left Hand) ---
  const bow = new THREE.Group();
  bow.name = 'Bow';

  // Catmull-Rom Curve for Graceful Recurve Limbs
  // Wood belly curves boldly FORWARD (+Z, away from archer),
  // with recurved tips meeting the taut bowstring cleanly at Z = 0!
  const bowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.72, 0.00),   // Upper recurved tip (meeting string at z=0)
    new THREE.Vector3(0, 0.54, 0.08),   // Upper limb recurve transition
    new THREE.Vector3(0, 0.28, 0.18),   // Upper limb belly (arching boldly forward)
    new THREE.Vector3(0, 0.00, 0.14),   // Center handle riser (held in left palm)
    new THREE.Vector3(0, -0.28, 0.18),  // Lower limb belly (arching boldly forward)
    new THREE.Vector3(0, -0.54, 0.08),  // Lower limb recurve transition
    new THREE.Vector3(0, -0.72, 0.00)   // Lower recurved tip (meeting string at z=0)
  ]);

  const bowGeo = new THREE.TubeGeometry(bowCurve, 20, 0.032, 6, false);
  const bowMesh = new THREE.Mesh(bowGeo, bowMat);
  bow.add(bowMesh);

  // Center Handle Riser Leather Grip
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.22, 8), leatherAccentMat);
  grip.position.set(0, 0, 0.14);
  bow.add(grip);

  // Gold Rings at Handle Ends
  [-0.11, 0.11].forEach(gy => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 4, 12), goldAccentMat);
    ring.position.set(0, gy, 0.14);
    ring.rotation.x = Math.PI / 2;
    bow.add(ring);
  });

  // Carved Gold Finials at Recurved Tips (aligned cleanly with tips and string nocks at z=0)
  [0.72, -0.72].forEach((ty, idx) => {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.10, 5), goldAccentMat);
    finial.position.set(0, ty, 0.00);
    finial.rotation.x = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
    bow.add(finial);
  });

  // Dynamic 2-Segment Bowstring that forms a realistic taut triangle when drawn
  const stringGeo = new THREE.CylinderGeometry(0.007, 0.007, 1.0, 4);
  const bowStringTop = new THREE.Mesh(stringGeo, bowStringMat);
  bow.add(bowStringTop);

  const bowStringBottom = new THREE.Mesh(stringGeo, bowStringMat);
  bow.add(bowStringBottom);

  // Nocked Arrow placed on bowstring during draw
  const drawnArrow = new THREE.Group();
  drawnArrow.name = 'DrawnArrow';

  const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.72, 4), arrowShaftMat);
  arrowShaft.position.z = 0.36;
  arrowShaft.rotation.x = Math.PI / 2;
  drawnArrow.add(arrowShaft);

  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), steelAccentMat);
  arrowHead.position.z = 0.72;
  arrowHead.rotation.x = Math.PI / 2;
  drawnArrow.add(arrowHead);

  for (let f = 0; f < 3; f++) {
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.035, 0.12), arrowFletchMat);
    fletch.position.set(0, 0, 0.06);
    fletch.rotation.z = (f * Math.PI * 2) / 3;
    drawnArrow.add(fletch);
  }

  drawnArrow.visible = false;
  bow.add(drawnArrow);

  const topTipPos = new THREE.Vector3(0, 0.72, 0.00);
  const botTipPos = new THREE.Vector3(0, -0.72, 0.00);
  const upVec = new THREE.Vector3(0, 1, 0);

  function updateBowString(drawDist = 0) {
    const nockPos = new THREE.Vector3(0, 0, -drawDist);

    // Update Top String Segment
    const dirTop = new THREE.Vector3().subVectors(nockPos, topTipPos);
    const lenTop = dirTop.length();
    bowStringTop.position.addVectors(topTipPos, nockPos).multiplyScalar(0.5);
    bowStringTop.scale.set(1, lenTop, 1);
    bowStringTop.quaternion.setFromUnitVectors(upVec, dirTop.normalize());

    // Update Bottom String Segment
    const dirBot = new THREE.Vector3().subVectors(nockPos, botTipPos);
    const lenBot = dirBot.length();
    bowStringBottom.position.addVectors(botTipPos, nockPos).multiplyScalar(0.5);
    bowStringBottom.scale.set(1, lenBot, 1);
    bowStringBottom.quaternion.setFromUnitVectors(upVec, dirBot.normalize());

    // Update Drawn Arrow Visibility & Nock Alignment
    if (drawDist > 0.02) {
      drawnArrow.visible = true;
      drawnArrow.position.set(0, 0, -drawDist);
    } else {
      drawnArrow.visible = false;
    }
  }

  // Initialize string straight at rest
  updateBowString(0);
  bow.userData.updateBowString = updateBowString;

  // Position Bow firmly gripped in left hand:
  // Grip at z=0.14 is held in palm at (0, -0.51, 0.02), string faces backward towards archer at z=-0.12
  bow.position.set(0, -0.51, -0.12);
  bow.rotation.set(0, 0, 0);
  armL.add(bow);

  archer.add(armL);

  // Right Arm (Draws String)
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.38, 1.25, 0);

  const pauldronR = createPauldron(false);
  pauldronR.position.set(0, 0.08, 0);
  pauldronR.rotation.z = -0.22;
  armR.add(pauldronR);

  const sleeveR = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.115, 0.14, 6), tunicMat);
  sleeveR.position.set(0, -0.04, 0);
  armR.add(sleeveR);

  const sleeveTrimR = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.03, 6), goldAccentMat);
  sleeveTrimR.position.set(0, -0.10, 0);
  armR.add(sleeveTrimR);

  const bicepR = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.18, 6), skinMat);
  bicepR.position.set(0, -0.18, 0);
  armR.add(bicepR);

  const foreArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.24, 6), bracersPauldronsMat);
  foreArmR.position.set(0, -0.36, 0.02);
  armR.add(foreArmR);

  const guardPlateR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.14), steelAccentMat);
  guardPlateR.position.set(0.08, -0.36, 0.02);
  armR.add(guardPlateR);

  [-0.06, 0, 0.06].forEach(gy => {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), steelAccentMat);
    r.position.set(0.11, -0.36 + gy, 0.02);
    armR.add(r);
  });

  const gloveR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), leatherAccentMat);
  gloveR.position.set(0, -0.51, 0.02);
  armR.add(gloveR);

  const fingersR = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.12), skinMat);
  fingersR.position.set(0, -0.58, 0.02);
  armR.add(fingersR);

  archer.add(armR);

  // --- 5. LEGS, KNEE POLEYNS & CUFFED BOOTS ---
  function createLeg(isLeft = true) {
    const leg = new THREE.Group();
    leg.name = isLeft ? 'LegL' : 'LegR';
    leg.position.set(isLeft ? -0.16 : 0.16, 0.68, 0);

    // Thighs (Olive Archer Trousers)
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.32, 0.22), legsBootsMat);
    thigh.position.set(0, -0.16, 0);
    leg.add(thigh);

    // Steel Knee Poleyns with Domed Rivets
    const poleyn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.10), steelAccentMat);
    poleyn.position.set(0, -0.31, 0.10);
    leg.add(poleyn);

    // Center Gold Star / Rivet on Knee
    const kneeStar = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 4), goldAccentMat);
    kneeStar.position.set(0, -0.31, 0.16);
    leg.add(kneeStar);

    // Leather Straps behind knee
    const kneeStrap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.06, 0.12), leatherAccentMat);
    kneeStrap.position.set(0, -0.31, -0.06);
    leg.add(kneeStrap);

    // Lower Shin (Boot Upper)
    const bootUpper = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.20), legsBootsMat);
    bootUpper.position.set(0, -0.48, 0);
    leg.add(bootUpper);

    // Folded-over Leather Boot Cuff
    const bootCuff = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.23), leatherAccentMat);
    bootCuff.position.set(0, -0.38, 0);
    leg.add(bootCuff);

    const cuffRim = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.02, 0.24), goldAccentMat);
    cuffRim.position.set(0, -0.33, 0);
    leg.add(cuffRim);

    // Buckled Ankle Strap
    const ankleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.22), leatherAccentMat);
    ankleStrap.position.set(0, -0.56, 0.01);
    leg.add(ankleStrap);

    const ankleBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.03), goldAccentMat);
    ankleBuckle.position.set(isLeft ? -0.10 : 0.10, -0.56, 0.01);
    leg.add(ankleBuckle);

    // Foot Sabaton / Heavy Leather Ranger Boot
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.63, 0);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.11, 0.30), leatherAccentMat);
    foot.position.set(0, 0.02, 0.04);
    footGroup.add(foot);

    // Reinforced Steel Toe Cap with Rivets
    const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.10, 0.12), steelAccentMat);
    toeCap.position.set(0, 0.02, 0.15);
    footGroup.add(toeCap);

    [-0.06, 0.06].forEach(tx => {
      const toeRivet = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), steelAccentMat);
      toeRivet.position.set(tx, 0.06, 0.19);
      footGroup.add(toeRivet);
    });

    // Rugged Leather Sole
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.38), leatherAccentMat);
    sole.position.set(0, -0.05, 0.07);
    footGroup.add(sole);

    leg.add(footGroup);
    return leg;
  }

  const legL = createLeg(true);
  archer.add(legL);

  const legR = createLeg(false);
  archer.add(legR);

  // --- 7. SAVE REFERENCES IN userData FOR RIGGING & ANIMATIONS ---
  archer.userData = {
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    bow,
    quiver,
    pauldronL,
    pauldronR,
    plume,
    updateBowString,
    drawnArrow,
    bowStringTop,
    bowStringBottom
  };

  return enableShadows(archer);
}
