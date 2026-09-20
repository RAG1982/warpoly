import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getKnightCuirassTextures,
  getKnightTunicTextures,
  getKnightBeltTextures,
  getKnightHelmetFaceTextures,
  getKnightPlumeTextures,
  getKnightShieldFrontTextures,
  getKnightShieldBackTextures,
  getKnightSwordBladeTextures,
  getKnightLimbsTextures
} from './knightTextures.js';

/**
 * Next-Gen Stylized Low-Poly Knight (Overwatch / Valorant / UE5 Masterpiece)
 * Faithfully recreating the Knight from modelo.png reference.
 * 
 * Recent improvements:
 * 1. Shield is completely flat (uniform planar thickness, no pyramid cone at base).
 *    Front face proudly displays the hand-painted Golden Rampant Lion crest on cobalt blue.
 * 2. Sword cutting edge faces directly FORWARD (aligned along Z axis in direction of strike),
 *    with fuller groove on the flat sides and winged quillons extending to the sides.
 * 
 * @returns {THREE.Group}
 */
export function createKnight() {
  const knight = new THREE.Group();
  knight.name = 'Knight';

  // --- 1. PBR Texture Sets & Dedicated Component Materials ---
  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale || 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 1.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const cuirassMat = createPBRMaterial(getKnightCuirassTextures(), { bumpScale: 0.06 });
  const tunicMat = createPBRMaterial(getKnightTunicTextures(), { bumpScale: 0.08 });
  const beltMat = createPBRMaterial(getKnightBeltTextures(), { bumpScale: 0.06 });
  const helmFaceMat = createPBRMaterial(getKnightHelmetFaceTextures(), { bumpScale: 0.05 });
  const plumeMat = createPBRMaterial(getKnightPlumeTextures(), { bumpScale: 0.06 });
  const shieldFrontMat = createPBRMaterial(getKnightShieldFrontTextures(), { bumpScale: 0.08 });
  const shieldBackMat = createPBRMaterial(getKnightShieldBackTextures(), { bumpScale: 0.06 });
  const swordBladeMat = createPBRMaterial(getKnightSwordBladeTextures(), { bumpScale: 0.06 });
  const limbsMat = createPBRMaterial(getKnightLimbsTextures(), { bumpScale: 0.05 });

  // Pure gold & steel accents for 3D trims
  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf5b81a,
    roughness: 0.22,
    metalness: 0.85,
    flatShading: true
  });

  const steelAccentMat = new THREE.MeshStandardMaterial({
    color: 0xc8d2dc,
    roughness: 0.28,
    metalness: 0.75,
    flatShading: true
  });

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x5a2d16,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true
  });

  const rubyMat = new THREE.MeshStandardMaterial({
    color: 0xbe123c,
    emissive: 0x4c0519,
    roughness: 0.1,
    metalness: 0.1,
    flatShading: true
  });

  // --- 2. TORSO & CUIRASS ---
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 1.05, 0);

  // A. Sculpted Gothic Breastplate with central keel
  const breastGeo = new THREE.BoxGeometry(0.56, 0.52, 0.38);
  const breastplate = new THREE.Mesh(breastGeo, cuirassMat);
  breastplate.position.set(0, 0.12, 0);
  torso.add(breastplate);

  // Central vertical chest keel ridge
  const keelGeo = new THREE.BoxGeometry(0.04, 0.48, 0.04);
  const keel = new THREE.Mesh(keelGeo, steelAccentMat);
  keel.position.set(0, 0.12, 0.195);
  torso.add(keel);

  // Gorget (Armored Neck Collar) with gold rim
  const gorgetGeo = new THREE.BoxGeometry(0.48, 0.12, 0.34);
  const gorget = new THREE.Mesh(gorgetGeo, cuirassMat);
  gorget.position.set(0, 0.38, 0.01);
  torso.add(gorget);

  const gorgetRim = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.03, 0.36), goldAccentMat);
  gorgetRim.position.set(0, 0.42, 0.01);
  torso.add(gorgetRim);

  // B. Thick Leather War Belt with Golden Lion Buckle
  const beltGeo = new THREE.BoxGeometry(0.58, 0.13, 0.40);
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.position.set(0, -0.16, 0);
  torso.add(belt);

  // 3D Lion Head Buckle plate
  const buckleGeo = new THREE.BoxGeometry(0.16, 0.15, 0.05);
  const buckle = new THREE.Mesh(buckleGeo, goldAccentMat);
  buckle.position.set(0, -0.16, 0.22);
  torso.add(buckle);

  // Right hip leather potion/coin pouch
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.12), leatherMat);
  pouch.position.set(0.31, -0.18, 0.05);
  pouch.rotation.z = -0.1;
  torso.add(pouch);

  const pouchFlap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.13), leatherMat);
  pouchFlap.position.set(0.31, -0.11, 0.05);
  torso.add(pouchFlap);

  const pouchBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.03), goldAccentMat);
  pouchBuckle.position.set(0.31, -0.15, 0.12);
  torso.add(pouchBuckle);

  // C. Faulds & Tassets (Articulated Hip Plates)
  const tassetsGroup = new THREE.Group();
  tassetsGroup.position.set(0, -0.22, 0);

  // Center groin tasset
  const centerTassetGeo = new THREE.BoxGeometry(0.20, 0.22, 0.04);
  const centerTasset = new THREE.Mesh(centerTassetGeo, cuirassMat);
  centerTasset.position.set(0, -0.05, 0.21);
  centerTasset.rotation.x = 0.12;
  tassetsGroup.add(centerTasset);

  // Left hip tasset
  const tassetL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.04), cuirassMat);
  tassetL.position.set(-0.21, -0.06, 0.19);
  tassetL.rotation.set(0.12, 0, 0.15);
  tassetsGroup.add(tassetL);

  // Right hip tasset
  const tassetR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.04), cuirassMat);
  tassetR.position.set(0.21, -0.06, 0.19);
  tassetR.rotation.set(0.12, 0, -0.15);
  tassetsGroup.add(tassetR);

  // Gold rims on tassets
  [-0.21, 0, 0.21].forEach((tx, idx) => {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(idx === 1 ? 0.21 : 0.19, 0.03, 0.05), goldAccentMat);
    rim.position.set(tx, -0.16, 0.21);
    tassetsGroup.add(rim);
  });

  torso.add(tassetsGroup);

  // D. Royal Blue Embroidered Tunic / Gambeson Skirt (under tassets)
  const tunicSkirtGeo = new THREE.BoxGeometry(0.54, 0.28, 0.38);
  const tunicSkirt = new THREE.Mesh(tunicSkirtGeo, tunicMat);
  tunicSkirt.position.set(0, -0.28, 0);
  torso.add(tunicSkirt);

  // Gold embroidered hem trim
  const tunicHem = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.40), goldAccentMat);
  tunicHem.position.set(0, -0.41, 0);
  torso.add(tunicHem);

  knight.add(torso);

  // --- 3. HEAD & VISORED HELMET ---
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.62, 0);

  // Main Helmet Skull (Sallet / Armet with beveled crown)
  const helmGeo = new THREE.BoxGeometry(0.42, 0.44, 0.42);
  const helm = new THREE.Mesh(helmGeo, limbsMat);
  head.add(helm);

  // Beveled Crown Cap (Chamfered Top)
  const crownGeo = new THREE.ConeGeometry(0.28, 0.12, 4);
  crownGeo.rotateY(Math.PI / 4);
  const crown = new THREE.Mesh(crownGeo, limbsMat);
  crown.position.set(0, 0.26, 0);
  head.add(crown);

  // Visor Faceplate with Brow Plate & Slit (Dedicated Hand-Painted Visor Texture)
  const visorWedge = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.10), helmFaceMat);
  visorWedge.position.set(0, 0.02, 0.21);
  head.add(visorWedge);

  // Brow reinforcement band with gold rivets
  const browBand = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.12), goldAccentMat);
  browBand.position.set(0, 0.12, 0.21);
  head.add(browBand);

  // Recessed dark eye visor slit with inner glow
  const visorSlit = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.035, 0.02),
    new THREE.MeshStandardMaterial({
      color: 0x05070a,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.4,
      roughness: 0.1
    })
  );
  visorSlit.position.set(0, 0.03, 0.262);
  head.add(visorSlit);

  // Lower jaw / bevor chin guard
  const chinBevor = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 4), limbsMat);
  chinBevor.position.set(0, -0.16, 0.12);
  chinBevor.rotation.x = -Math.PI / 5;
  head.add(chinBevor);

  // Flowing Stylized Crimson Plume / Crest (Dedicated Feather Plume Material)
  const plume = new THREE.Group();
  plume.name = 'Plume';

  // Golden plume socket
  const socketGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.10, 6);
  const socket = new THREE.Mesh(socketGeo, goldAccentMat);
  socket.position.set(0, 0.28, 0.04);
  plume.add(socket);

  // Segment 1: Arched base plume
  const seg1Geo = new THREE.BoxGeometry(0.10, 0.32, 0.38);
  const seg1 = new THREE.Mesh(seg1Geo, plumeMat);
  seg1.position.set(0, 0.42, -0.02);
  seg1.rotation.x = -0.22;
  plume.add(seg1);

  // Segment 2: Sweeping middle plume
  const seg2Geo = new THREE.BoxGeometry(0.09, 0.26, 0.34);
  const seg2 = new THREE.Mesh(seg2Geo, plumeMat);
  seg2.position.set(0, 0.45, -0.24);
  seg2.rotation.x = -0.55;
  plume.add(seg2);

  // Segment 3: Flowing trailing tail
  const seg3Geo = new THREE.ConeGeometry(0.12, 0.42, 4);
  seg3Geo.rotateY(Math.PI / 4);
  const seg3 = new THREE.Mesh(seg3Geo, plumeMat);
  seg3.position.set(0, 0.24, -0.42);
  seg3.rotation.x = -1.25;
  plume.add(seg3);

  head.add(plume);
  knight.add(head);

  // --- 4. PAULDRONS (TIERED SHOULDER ARMOR) ---
  function createPauldron(isLeft = true) {
    const pGroup = new THREE.Group();
    pGroup.name = isLeft ? 'PauldronL' : 'PauldronR';

    // Main curved shoulder dome
    const dome = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), limbsMat);
    dome.rotation.z = isLeft ? 0.15 : -0.15;
    pGroup.add(dome);

    // Sword-breaker upright rim
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.29), goldAccentMat);
    rim.position.set(isLeft ? 0.11 : -0.11, 0.08, 0);
    pGroup.add(rim);

    // Gold lower border
    const goldBorder = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.29), goldAccentMat);
    goldBorder.position.set(0, -0.09, 0);
    pGroup.add(goldBorder);

    // Secondary lower lame plate (overlapping upper arm)
    const lame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.25), limbsMat);
    lame.position.set(isLeft ? -0.03 : 0.03, -0.12, 0);
    lame.rotation.z = isLeft ? 0.22 : -0.22;
    pGroup.add(lame);

    // Embossed gold heraldic rivet
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 6), goldAccentMat);
    stud.position.set(0, 0.02, 0.15);
    stud.rotation.x = Math.PI / 2;
    pGroup.add(stud);

    return pGroup;
  }

  const pauldronL = createPauldron(true);
  pauldronL.position.set(-0.38, 1.30, 0);
  knight.add(pauldronL);

  const pauldronR = createPauldron(false);
  pauldronR.position.set(0.38, 1.30, 0);
  knight.add(pauldronR);

  // --- 5. ARMS & GAUNTLETS ---
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.38, 1.25, 0);

  // Upper arm rerebrace
  const upperArmL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.28, 0.17), limbsMat);
  upperArmL.position.set(0, -0.14, 0);
  armL.add(upperArmL);

  // Elbow couter with gold star rivet
  const couterL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 4), limbsMat);
  couterL.position.set(0, -0.28, -0.07);
  couterL.rotation.x = -Math.PI / 2;
  armL.add(couterL);

  const couterStudL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), goldAccentMat);
  couterStudL.position.set(0, -0.28, -0.14);
  armL.add(couterStudL);

  // Forearm vambrace
  const foreArmL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.16), limbsMat);
  foreArmL.position.set(0, -0.42, 0.02);
  armL.add(foreArmL);

  // Armored Gauntlet
  const gauntletL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), steelAccentMat);
  gauntletL.position.set(0, -0.58, 0.02);
  armL.add(gauntletL);

  knight.add(armL);

  // Right Arm
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.38, 1.25, 0);

  const upperArmR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.28, 0.17), limbsMat);
  upperArmR.position.set(0, -0.14, 0);
  armR.add(upperArmR);

  const couterR = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 4), limbsMat);
  couterR.position.set(0, -0.28, -0.07);
  couterR.rotation.x = -Math.PI / 2;
  armR.add(couterR);

  const couterStudR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), goldAccentMat);
  couterStudR.position.set(0, -0.28, -0.14);
  armR.add(couterStudR);

  const foreArmR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.16), limbsMat);
  foreArmR.position.set(0, -0.42, 0.02);
  armR.add(foreArmR);

  const gauntletR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), steelAccentMat);
  gauntletR.position.set(0, -0.58, 0.02);
  armR.add(gauntletR);

  knight.add(armR);

  // --- 6. LEGS & SABATONS (BOOTS) ---
  function createLeg(isLeft = true) {
    const leg = new THREE.Group();
    leg.name = isLeft ? 'LegL' : 'LegR';
    leg.position.set(isLeft ? -0.16 : 0.16, 0.68, 0);

    // Thigh armor (cuisse)
    const cuisse = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.32, 0.22), limbsMat);
    cuisse.position.set(0, -0.14, 0);
    leg.add(cuisse);

    // Knee armor (poleyn with wings and gold star)
    const poleyn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12), limbsMat);
    poleyn.position.set(0, -0.31, 0.10);
    leg.add(poleyn);

    const poleynPoint = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.10, 4), limbsMat);
    poleynPoint.position.set(0, -0.31, 0.17);
    poleynPoint.rotation.x = Math.PI / 2;
    leg.add(poleynPoint);

    const kneeStar = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), goldAccentMat);
    kneeStar.position.set(0, -0.31, 0.22);
    leg.add(kneeStar);

    // Shin armor (greave)
    const greave = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.20), limbsMat);
    greave.position.set(0, -0.48, 0);
    leg.add(greave);

    // Articulated Sabaton (Knight boot)
    const sabatonGroup = new THREE.Group();
    sabatonGroup.position.set(0, -0.64, 0);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.30), limbsMat);
    foot.position.set(0, 0.02, 0.04);
    sabatonGroup.add(foot);

    // Pointed toe lames
    const toe = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 4), limbsMat);
    toe.position.set(0, 0.01, 0.22);
    toe.rotation.x = Math.PI / 2;
    toe.scale.set(0.9, 1.0, 0.6);
    sabatonGroup.add(toe);

    // Leather sole
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.38), leatherMat);
    sole.position.set(0, -0.05, 0.08);
    sabatonGroup.add(sole);

    leg.add(sabatonGroup);
    return leg;
  }

  const legL = createLeg(true);
  knight.add(legL);

  const legR = createLeg(false);
  knight.add(legR);

  // --- 7. THE ROYAL KITE SHIELD (COMPLETELY FLAT PLANAR DESIGN) ---
  // No pyramid protruding at base! Uniform flat thickness (0.04m) with proud Golden Lion crest!
  const shieldGroup = new THREE.Group();
  shieldGroup.name = 'ShieldGroup';

  // Flat 2D Medieval Kite Shield Silhouette
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-0.28, 0.42);
  shieldShape.lineTo(0.28, 0.42);
  shieldShape.lineTo(0.28, 0.06);
  shieldShape.quadraticCurveTo(0.26, -0.25, 0, -0.48);
  shieldShape.quadraticCurveTo(-0.26, -0.25, -0.28, 0.06);
  shieldShape.closePath();

  // Unified Flat Shield Geometry (uniform 0.04m thickness, totally flat, no pyramid)
  const shieldPlateGeo = new THREE.ExtrudeGeometry(shieldShape, {
    depth: 0.04,
    bevelEnabled: false
  });

  // Material groups:
  // Front face (vertices 75..150): materialIndex 0 -> shieldFrontMat
  // Back face (vertices 0..75): materialIndex 1 -> shieldBackMat
  // Rim / Sides (vertices 150..312): materialIndex 2 -> steelAccentMat
  shieldPlateGeo.groups = [
    { start: 75, count: 75, materialIndex: 0 },
    { start: 0, count: 75, materialIndex: 1 },
    { start: 150, count: 162, materialIndex: 2 }
  ];

  const sPos = shieldPlateGeo.attributes.position;
  const sUvs = shieldPlateGeo.attributes.uv;
  for (let i = 0; i < sPos.count; i++) {
    const x = sPos.getX(i);
    const y = sPos.getY(i);
    const z = sPos.getZ(i);

    if (z > 0.02) {
      // Front face
      const u = (x + 0.28) / 0.56;
      const v = (y + 0.48) / 0.90;
      sUvs.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    } else if (z < 0.01 && i < 150) {
      // Back face
      const u = 1.0 - (x + 0.28) / 0.56;
      const v = (y + 0.48) / 0.90;
      sUvs.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    }
  }
  sUvs.needsUpdate = true;

  const shieldMesh = new THREE.Mesh(shieldPlateGeo, [shieldFrontMat, shieldBackMat, steelAccentMat]);
  shieldMesh.position.z = -0.02;
  shieldGroup.add(shieldMesh);

  // Flat Polished Steel Border Rim along top
  const rimTop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.035, 0.046), steelAccentMat);
  rimTop.position.set(0, 0.42, 0);
  shieldGroup.add(rimTop);

  // Gold Corner Reinforcing Brackets
  const bracketL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.048), goldAccentMat);
  bracketL.position.set(-0.25, 0.39, 0);
  shieldGroup.add(bracketL);

  const bracketR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.048), goldAccentMat);
  bracketR.position.set(0.25, 0.39, 0);
  shieldGroup.add(bracketR);

  // Shield Back: Diamond-tufted Leather Arm Cushion & Straps
  const armCushion = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.025), leatherMat);
  armCushion.position.set(0, 0.02, -0.03);
  shieldGroup.add(armCushion);

  const armStrap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.02), leatherMat);
  armStrap.position.set(0, 0.06, -0.035);
  shieldGroup.add(armStrap);

  const handGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 6), leatherMat);
  handGrip.position.set(0, -0.10, -0.035);
  shieldGroup.add(handGrip);

  // Position shield on left arm (braced naturally at -17 degrees)
  shieldGroup.position.set(-0.48, 0.95, 0.28);
  shieldGroup.rotation.y = -0.3;
  knight.add(shieldGroup);

  // --- 8. THE ROYAL BROADSWORD (CUTTING EDGE FACING FORWARD!) ---
  // The cutting edge faces forward (+Z in strike direction) so swings cut directly into foes!
  const sword = new THREE.Group();
  sword.name = 'Sword';

  // Double-edged steel blade with fuller groove
  // Width along Z = 0.11 (Cutting edges at +Z forward and -Z back)
  // Thickness along X = 0.032 (Flat sides at +X and -X)
  // Length along Y = 1.05
  const bladeGeo = new THREE.BoxGeometry(0.032, 1.05, 0.11);
  const blade = new THREE.Mesh(bladeGeo, swordBladeMat);
  blade.position.y = 0.58;
  sword.add(blade);

  // Sharpened blade tip (aligned with cutting edges at +Z and -Z)
  const tipGeo = new THREE.ConeGeometry(0.078, 0.18, 4);
  tipGeo.rotateY(Math.PI / 4);
  const bladeTip = new THREE.Mesh(tipGeo, swordBladeMat);
  bladeTip.position.y = 1.14;
  bladeTip.scale.set(0.40, 1.0, 1.0); // Thin along X, wide along Z
  sword.add(bladeTip);

  // Central fuller blood groove along flat faces
  const fullerGeo = new THREE.BoxGeometry(0.036, 0.75, 0.016);
  const fuller = new THREE.Mesh(fullerGeo, steelAccentMat);
  fuller.position.y = 0.55;
  sword.add(fuller);

  // Winged Golden Crossguard
  // Quillons extend left (-X) and right (+X) to protect the hand
  const guardGroup = new THREE.Group();
  guardGroup.position.y = 0.05;

  const guardCenter = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.14), goldAccentMat);
  guardGroup.add(guardCenter);

  // Winged quillons extending along X axis
  const quillonL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.07), goldAccentMat);
  quillonL.position.set(-0.16, 0.02, 0);
  quillonL.rotation.z = -0.22;
  guardGroup.add(quillonL);

  const quillonR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.07), goldAccentMat);
  quillonR.position.set(0.16, 0.02, 0);
  quillonR.rotation.z = 0.22;
  guardGroup.add(quillonR);

  // Inset cut Royal Ruby gem in crossguard center (flanked on both flat faces)
  const guardGemL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), rubyMat);
  guardGemL.position.set(-0.05, 0, 0);
  guardGroup.add(guardGemL);

  const guardGemR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), rubyMat);
  guardGemR.position.set(0.05, 0, 0);
  guardGroup.add(guardGemR);

  sword.add(guardGroup);

  // Spiral Wrapped Leather Grip
  const gripGeo = new THREE.CylinderGeometry(0.032, 0.028, 0.24, 8);
  const grip = new THREE.Mesh(gripGeo, leatherMat);
  grip.position.y = -0.11;
  sword.add(grip);

  // Grip wire rings
  [-0.05, -0.11, -0.17].forEach(gy => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.005, 4, 12), goldAccentMat);
    ring.position.y = gy;
    ring.rotation.x = Math.PI / 2;
    sword.add(ring);
  });

  // Faceted Golden Octagonal Pommel
  const pommelGeo = new THREE.DodecahedronGeometry(0.07, 0);
  const pommel = new THREE.Mesh(pommelGeo, goldAccentMat);
  pommel.position.y = -0.27;
  sword.add(pommel);

  // Position sword in right hand with cutting edge facing FORWARD (+Z)
  sword.position.set(0.48, 0.75, 0.25);
  sword.rotation.x = 0.5;
  sword.rotation.y = 0;
  sword.rotation.z = -0.1;
  knight.add(sword);

  // --- 9. Save References in userData for Animation & Rigs ---
  knight.userData = {
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    sword,
    shieldGroup,
    pauldronL,
    pauldronR,
    plume
  };

  return enableShadows(knight);
}
