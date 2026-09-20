import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getBanditFaceTextures,
  getBanditHelmetTextures,
  getBanditHornTextures,
  getBanditBrigandineTextures,
  getBanditRaggedClothTextures,
  getBanditArmsPauldronTextures,
  getBanditLegsBootsTextures,
  getBanditFurTextures,
  getBanditWeaponTextures
} from './banditTextures.js';

/**
 * Next-Gen Stylized Low-Poly Bandit Raider / Bandido
 * Inspired by Warcraft 2 Hand-Painted Art Style & AAA Modern Standards (Overwatch / Valorant).
 * 
 * Key Visual & Technical Highlights:
 * 1. Fierce battle-scarred barbarian face with blood-red tribal war paint streaks, glowing fiery angry eyes,
 *    thick wild dark beard and walrus mustache, and iron nasal spangenhelm.
 * 2. Curved menacing bone horns mounted on helmet sides with smooth gradient shading from aged ivory
 *    to charred blood-stained tips and growth rings.
 * 3. Quilted dark leather brigandine cuirass with forged iron studs, ragged crimson cloth trim with frayed hems,
 *    crossed leather harness with carved bone skull medallion, and wide spiked war belt.
 * 4. Asymmetrical raider silhouette: heavy forged iron pauldron with 3 vicious conical spikes on left shoulder,
 *    muscular tanned barbarian arms with battle scars and war paint, studded leather vambraces, and fingerless
 *    combat gloves with spiked knuckle plates.
 * 5. Patched rough-spun raider trousers, shaggy predator fur knee wraps, studded leather greaves, and heavy
 *    iron-plated combat boots with sharp forged steel toe spikes.
 * 6. Brutal Spiked War Club / Mace featuring dark forged iron flanges, 8 deadly radiating conical spikes,
 *    carved glowing crimson blood runes (emissive), weathered spiral-wrapped leather grip, and skull pommel.
 * 7. Complete rigging & animation compatibility preserved in bandit.userData:
 *    { torso, head, armL, armR, legL, legR, weapon, helm, hornL, hornR }
 * 
 * @returns {THREE.Group}
 */
export function createBandit() {
  const bandit = new THREE.Group();
  bandit.name = 'Bandit';

  // --- 1. PBR Texture Sets & Material Helpers ---
  function createPBRMaterial(tex, opts = {}) {
    const matOpts = {
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.06,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 1.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    };

    if (tex.emissiveMap) {
      matOpts.emissiveMap = tex.emissiveMap;
      matOpts.emissive = opts.emissive || new THREE.Color(0xffffff);
      matOpts.emissiveIntensity = opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 1.0;
    }

    return new THREE.MeshStandardMaterial(matOpts);
  }

  // PBR Component Materials
  const faceMat = createPBRMaterial(getBanditFaceTextures(), { bumpScale: 0.08 });
  const helmetMat = createPBRMaterial(getBanditHelmetTextures(), { bumpScale: 0.07 });
  const hornMat = createPBRMaterial(getBanditHornTextures(), { bumpScale: 0.08 });
  const brigandineMat = createPBRMaterial(getBanditBrigandineTextures(), { bumpScale: 0.07 });
  const raggedClothMat = createPBRMaterial(getBanditRaggedClothTextures(), { bumpScale: 0.07 });
  const armsPauldronMat = createPBRMaterial(getBanditArmsPauldronTextures(), { bumpScale: 0.06 });
  const legsBootsMat = createPBRMaterial(getBanditLegsBootsTextures(), { bumpScale: 0.06 });
  const furMat = createPBRMaterial(getBanditFurTextures(), { bumpScale: 0.09 });
  const weaponMat = createPBRMaterial(getBanditWeaponTextures(), { bumpScale: 0.08 });

  // Accent & Trim Materials
  const darkIronAccentMat = new THREE.MeshStandardMaterial({
    color: 0x333d4b,
    roughness: 0.32,
    metalness: 0.86,
    flatShading: true
  });

  const steelSpikeMat = new THREE.MeshStandardMaterial({
    color: 0xa4b1c2,
    roughness: 0.25,
    metalness: 0.90,
    flatShading: true
  });

  const darkLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x271a14,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true
  });

  const raggedCrimsonMat = new THREE.MeshStandardMaterial({
    color: 0x881818,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: true
  });

  const barbarianSkinMat = new THREE.MeshStandardMaterial({
    color: 0xbe7952,
    roughness: 0.65,
    metalness: 0.0,
    flatShading: true
  });

  const beardHairMat = new THREE.MeshStandardMaterial({
    color: 0x1f140c,
    roughness: 0.90,
    metalness: 0.0,
    flatShading: true
  });

  const boneAccentMat = new THREE.MeshStandardMaterial({
    color: 0xdfd3bd,
    roughness: 0.58,
    metalness: 0.05,
    flatShading: true
  });

  const bloodGlowMat = new THREE.MeshStandardMaterial({
    color: 0xff1e1e,
    emissive: 0xef4444,
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.1
  });

  // --- 2. TORSO, BRIGANDINE, HARNESS & SPIKED BELT ---
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 1.05, 0);

  // Main Quilted Leather Brigandine Cuirass
  const chestGeo = new THREE.BoxGeometry(0.56, 0.48, 0.36);
  const chest = new THREE.Mesh(chestGeo, brigandineMat);
  chest.position.set(0, 0.14, 0);
  torso.add(chest);

  // Predator Fur Mantle Collar (Framing neck and shoulder base)
  const furMantle = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.38), furMat);
  furMantle.position.set(0, 0.36, 0);
  torso.add(furMantle);

  // Leather Gorget Collar Hem beneath fur
  const collarTrim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.36), darkLeatherMat);
  collarTrim.position.set(0, 0.38, 0);
  torso.add(collarTrim);

  // 3D Crossed Diagonal Leather Harness Straps with Rivets
  // Primary diagonal strap: right shoulder down to left hip
  const strap1Geo = new THREE.BoxGeometry(0.12, 0.54, 0.03);
  const strap1 = new THREE.Mesh(strap1Geo, darkLeatherMat);
  strap1.position.set(0, 0.14, 0.185);
  strap1.rotation.z = -0.52;
  torso.add(strap1);

  // Secondary diagonal strap: left shoulder down to right hip
  const strap2Geo = new THREE.BoxGeometry(0.10, 0.52, 0.03);
  const strap2 = new THREE.Mesh(strap2Geo, darkLeatherMat);
  strap2.position.set(0, 0.14, 0.19);
  strap2.rotation.z = 0.52;
  torso.add(strap2);

  // Metal studs along harness straps
  [-0.14, 0.14].forEach((sy, idx) => {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), darkIronAccentMat);
    rivet.position.set(idx === 0 ? 0.13 : -0.13, 0.14 + sy, 0.205);
    torso.add(rivet);
  });

  // Central 3D Carved Skull Medallion / Harness Buckle at Crossing
  const skullMedallion = new THREE.Group();
  skullMedallion.name = 'SkullMedallion';
  skullMedallion.position.set(0, 0.16, 0.21);

  const skullCranium = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), boneAccentMat);
  skullCranium.scale.set(1.0, 1.15, 0.6);
  skullMedallion.add(skullCranium);

  // Hollow angry eye sockets
  [-0.03, 0.03].forEach(ex => {
    const eyeCavity = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), darkLeatherMat);
    eyeCavity.position.set(ex, 0.015, 0.04);
    skullMedallion.add(eyeCavity);
  });

  // Skull upper jaw with fangs
  const skullJaw = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.035, 0.04), boneAccentMat);
  skullJaw.position.set(0, -0.05, 0.03);
  skullMedallion.add(skullJaw);

  torso.add(skullMedallion);

  // Heavy Studded Leather War Belt at Waist
  const beltGeo = new THREE.BoxGeometry(0.60, 0.15, 0.40);
  const belt = new THREE.Mesh(beltGeo, darkLeatherMat);
  belt.position.set(0, -0.14, 0);
  torso.add(belt);

  // Heavy Forged Iron Rectangular War Belt Buckle
  const buckleGeo = new THREE.BoxGeometry(0.18, 0.16, 0.05);
  const buckle = new THREE.Mesh(buckleGeo, darkIronAccentMat);
  buckle.position.set(0, -0.14, 0.22);
  torso.add(buckle);

  const buckleProng = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.03), steelSpikeMat);
  buckleProng.position.set(0, -0.14, 0.245);
  torso.add(buckleProng);

  // Forged Iron Pyramid Spikes projecting along the War Belt
  [-0.20, -0.12, 0.12, 0.20].forEach(sx => {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 4), steelSpikeMat);
    spike.position.set(sx, -0.14, 0.22);
    spike.rotation.x = Math.PI / 2;
    torso.add(spike);
  });

  // Side Belt Spikes
  [-0.31, 0.31].forEach((sx, idx) => {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 4), steelSpikeMat);
    spike.position.set(sx, -0.14, 0);
    spike.rotation.z = idx === 0 ? Math.PI / 2 : -Math.PI / 2;
    torso.add(spike);
  });

  // Ragged Torn Crimson Cloth Tunic Skirt Flaps (Front & Back)
  const flapFL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.03), raggedClothMat);
  flapFL.position.set(-0.14, -0.34, 0.185);
  flapFL.rotation.x = 0.10;
  torso.add(flapFL);

  const flapFR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.03), raggedClothMat);
  flapFR.position.set(0.14, -0.34, 0.185);
  flapFR.rotation.x = 0.10;
  torso.add(flapFR);

  // Crimson torn border hem trim
  const flapTrimL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.035), raggedCrimsonMat);
  flapTrimL.position.set(-0.14, -0.47, 0.195);
  torso.add(flapTrimL);

  const flapTrimR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.035), raggedCrimsonMat);
  flapTrimR.position.set(0.14, -0.47, 0.195);
  torso.add(flapTrimR);

  // Back Ragged Flap
  const flapBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.30, 0.03), raggedClothMat);
  flapBack.position.set(0, -0.35, -0.185);
  flapBack.rotation.x = -0.10;
  torso.add(flapBack);

  const flapBackTrim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.035), raggedCrimsonMat);
  flapBackTrim.position.set(0, -0.49, -0.195);
  torso.add(flapBackTrim);

  // Right Hip: Weathered Leather Utility Pouch
  const pouchR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.12), darkLeatherMat);
  pouchR.position.set(0.31, -0.16, 0.06);
  pouchR.rotation.z = -0.12;
  torso.add(pouchR);

  const pouchRFlap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.13), darkLeatherMat);
  pouchRFlap.position.set(0.31, -0.10, 0.06);
  pouchRFlap.rotation.z = -0.12;
  torso.add(pouchRFlap);

  const pouchRStud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), darkIronAccentMat);
  pouchRStud.position.set(0.31, -0.14, 0.13);
  torso.add(pouchRStud);

  // Left Hip: Dangling Trophy Skull / Bone Charm
  const trophyGroup = new THREE.Group();
  trophyGroup.position.set(-0.31, -0.24, 0.08);
  trophyGroup.rotation.z = 0.20;

  const trophyCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), darkLeatherMat);
  trophyCord.position.set(0, 0.06, 0);
  trophyGroup.add(trophyCord);

  const trophySkull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), boneAccentMat);
  trophySkull.position.set(0, -0.04, 0);
  trophySkull.scale.set(1.0, 1.1, 0.8);
  trophyGroup.add(trophySkull);

  torso.add(trophyGroup);
  bandit.add(torso);

  // --- 3. HEAD, IRON SPANGENHELM & CURVED BONE HORNS ---
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.60, 0);

  // Muscular Rugged Barbarian Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.14, 6), barbarianSkinMat);
  neck.position.set(0, -0.16, 0);
  head.add(neck);

  // Barbarian Cranium Base Box
  const headBaseGeo = new THREE.BoxGeometry(0.38, 0.38, 0.36);
  const headBase = new THREE.Mesh(headBaseGeo, barbarianSkinMat);
  head.add(headBase);

  // Front Faceplate with Hand-Painted Battle-Scarred Barbarian Face
  const faceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.32, 0.04), faceMat);
  faceMesh.position.set(0, 0.01, 0.185);
  head.add(faceMesh);

  // 3D Chiseled Barbarian Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), barbarianSkinMat);
  nose.position.set(0, 0.01, 0.22);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  // Subtle Recessed Glowing Angry Eye Spheres for extra 3D punch
  [-0.08, 0.08].forEach(ex => {
    const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), bloodGlowMat);
    eyeGlow.position.set(ex, 0.045, 0.198);
    head.add(eyeGlow);
  });

  // 3D Thick Ragged Barbarian Chin Beard
  const beardMain = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 5), beardHairMat);
  beardMain.position.set(0, -0.22, 0.14);
  beardMain.rotation.x = -0.35;
  head.add(beardMain);

  // Braided Beard Tail hanging down with Iron Binding Ring
  const beardBraid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.26, 5), beardHairMat);
  beardBraid.position.set(0, -0.36, 0.18);
  head.add(beardBraid);

  const beardRing = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.012, 4, 8), darkIronAccentMat);
  beardRing.position.set(0, -0.30, 0.18);
  beardRing.rotation.x = Math.PI / 2;
  head.add(beardRing);

  // Drooping Walrus / Horseshoe Barbarian Mustache
  [-1, 1].forEach((dir, idx) => {
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), beardHairMat);
    stache.position.set(dir * 0.07, -0.06, 0.205);
    stache.rotation.z = dir * -0.45;
    head.add(stache);
  });

  // --- IRON SPANGENHELM HELMET ---
  const helm = new THREE.Group();
  helm.name = 'Helm';

  // Segmented Conical/Domed Helmet Skull
  const helmDomeGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.30, 6);
  const helmDome = new THREE.Mesh(helmDomeGeo, helmetMat);
  helmDome.position.set(0, 0.22, 0);
  helm.add(helmDome);

  // Chamfered Crown Peak
  const helmPeakGeo = new THREE.ConeGeometry(0.25, 0.16, 6);
  const helmPeak = new THREE.Mesh(helmPeakGeo, helmetMat);
  helmPeak.position.set(0, 0.42, 0);
  helm.add(helmPeak);

  // Top Forged Iron Crest Spike / Finial
  const finialGeo = new THREE.ConeGeometry(0.04, 0.15, 4);
  const finial = new THREE.Mesh(finialGeo, steelSpikeMat);
  finial.position.set(0, 0.54, 0);
  helm.add(finial);

  // Heavy Brow Reinforcement Band
  const browBand = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.42), darkIronAccentMat);
  browBand.position.set(0, 0.15, 0);
  helm.add(browBand);

  // Nasal Guard Projecting Down Between Eyes
  const nasalGuard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.04), darkIronAccentMat);
  nasalGuard.position.set(0, 0.05, 0.22);
  helm.add(nasalGuard);

  // Flared Iron Cheek Guards on Left & Right
  [-1, 1].forEach((dir, idx) => {
    const cheekGuard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.20, 0.16), darkIronAccentMat);
    cheekGuard.position.set(dir * 0.20, -0.02, 0.10);
    cheekGuard.rotation.z = dir * -0.15;
    cheekGuard.rotation.y = dir * 0.12;
    helm.add(cheekGuard);
  });

  // Dome Rivets on Brow Band & Nasal Ridge
  [-0.15, -0.07, 0.07, 0.15].forEach(rx => {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), steelSpikeMat);
    r.position.set(rx, 0.15, 0.215);
    helm.add(r);
  });

  const nasalRivet = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), steelSpikeMat);
  nasalRivet.position.set(0, 0.11, 0.242);
  helm.add(nasalRivet);

  head.add(helm);

  // --- CURVED BONE HORNS ---
  function createCurvedHorn(isLeft = true) {
    const hornGroup = new THREE.Group();
    hornGroup.name = isLeft ? 'HornL' : 'HornR';
    const sign = isLeft ? -1 : 1;
    hornGroup.position.set(sign * 0.24, 0.25, 0.02);

    // Horn Mounting Socket (Forged Iron Ring with Rivets)
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.07, 6), darkIronAccentMat);
    socket.rotation.z = sign * -Math.PI / 2;
    hornGroup.add(socket);

    // Segment 1 (Base): Angled Outwards & Slightly Backwards
    const seg1Geo = new THREE.ConeGeometry(0.075, 0.20, 5);
    const seg1 = new THREE.Mesh(seg1Geo, hornMat);
    seg1.position.set(sign * 0.10, 0.02, -0.02);
    seg1.rotation.z = sign * -1.25;
    seg1.rotation.y = sign * 0.35;
    hornGroup.add(seg1);

    // Segment 2 (Mid): Curving Upwards and Forwards
    const seg2Geo = new THREE.ConeGeometry(0.060, 0.18, 5);
    const seg2 = new THREE.Mesh(seg2Geo, hornMat);
    seg2.position.set(sign * 0.20, 0.12, 0.03);
    seg2.rotation.z = sign * -0.65;
    seg2.rotation.x = -0.30;
    hornGroup.add(seg2);

    // Segment 3 (Tip): Sharp Charred Tip Curving Inwards & Up
    const seg3Geo = new THREE.ConeGeometry(0.045, 0.16, 4);
    const seg3 = new THREE.Mesh(seg3Geo, hornMat);
    seg3.position.set(sign * 0.23, 0.25, 0.08);
    seg3.rotation.z = sign * 0.25;
    seg3.rotation.x = -0.40;
    hornGroup.add(seg3);

    return hornGroup;
  }

  const hornL = createCurvedHorn(true);
  head.add(hornL);

  const hornR = createCurvedHorn(false);
  head.add(hornR);

  bandit.add(head);

  // --- 4. ARMS, SPIKED PAULDRON, VAMBRACES & COMBAT GLOVES ---
  // LEFT ARM (Features massive spiked iron pauldron!)
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(-0.38, 1.25, 0);

  // Massive Spiked Iron Pauldron (Left Shoulder)
  const pauldronL = new THREE.Group();
  pauldronL.name = 'PauldronL';
  pauldronL.position.set(0, 0.06, 0);

  // Leather & Fur base foundation
  const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.30), furMat);
  pauldronL.add(pBase);

  // Upper Curved Heavy Iron Plate
  const plateUpper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.28), armsPauldronMat);
  plateUpper.position.set(0, 0.06, 0);
  pauldronL.add(plateUpper);

  // Heavy Iron Rim with Rivets
  [-0.10, 0, 0.10].forEach(px => {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), steelSpikeMat);
    r.position.set(px, 0.06, 0.145);
    pauldronL.add(r);
  });

  // 3 FORGED IRON SPIKES ON PAULDRON:
  // Spike 1: Center Vertical Spike
  const pSpike1 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 5), steelSpikeMat);
  pSpike1.position.set(0, 0.20, 0);
  pauldronL.add(pSpike1);

  // Spike 2: Front-Angled Spike
  const pSpike2 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 5), steelSpikeMat);
  pSpike2.position.set(0, 0.16, 0.09);
  pSpike2.rotation.x = 0.45;
  pauldronL.add(pSpike2);

  // Spike 3: Outward-Angled Spike
  const pSpike3 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 5), steelSpikeMat);
  pSpike3.position.set(-0.09, 0.16, 0);
  pSpike3.rotation.z = 0.45;
  pauldronL.add(pSpike3);

  armL.add(pauldronL);

  // Muscular Scarred Barbarian Bicep / Upper Arm
  const bicepL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), armsPauldronMat);
  bicepL.position.set(0, -0.15, 0);
  armL.add(bicepL);

  // Elbow Couter Pad with Iron Stud
  const couterL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), darkLeatherMat);
  couterL.position.set(0, -0.28, -0.03);
  armL.add(couterL);

  const couterStudL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), darkIronAccentMat);
  couterStudL.position.set(0, -0.28, -0.12);
  armL.add(couterStudL);

  // Studded Leather Forearm Vambrace
  const foreArmL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.24, 0.17), armsPauldronMat);
  foreArmL.position.set(0, -0.42, 0.02);
  armL.add(foreArmL);

  // Iron Guard Plate on Forearm with Rivets
  const guardPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.14), darkIronAccentMat);
  guardPlateL.position.set(-0.08, -0.42, 0.02);
  armL.add(guardPlateL);

  // Fingerless Spiked Combat Glove
  const gloveL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), darkLeatherMat);
  gloveL.position.set(0, -0.56, 0.02);
  armL.add(gloveL);

  // 4 Knuckle Spikes on Glove
  [-0.045, -0.015, 0.015, 0.045].forEach(kx => {
    const kSpike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), steelSpikeMat);
    kSpike.position.set(kx, -0.57, 0.105);
    kSpike.rotation.x = Math.PI / 2;
    armL.add(kSpike);
  });

  // Bare Muscular Barbarian Fingers
  const fingersL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), barbarianSkinMat);
  fingersL.position.set(0, -0.63, 0.02);
  armL.add(fingersL);

  bandit.add(armL);

  // RIGHT ARM (Holding weapon / mobility shoulder pad)
  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.38, 1.25, 0);

  // Studded Leather Shoulder Guard (PauldronR)
  const pauldronR = new THREE.Group();
  pauldronR.name = 'PauldronR';
  pauldronR.position.set(0, 0.04, 0);

  const pRBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.24), darkLeatherMat);
  pauldronR.add(pRBase);

  const pRStud = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.10, 4), steelSpikeMat);
  pRStud.position.set(0.06, 0.07, 0);
  pRStud.rotation.z = -0.4;
  pauldronR.add(pRStud);

  armR.add(pauldronR);

  // Muscular Scarred Bicep
  const bicepR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), armsPauldronMat);
  bicepR.position.set(0, -0.15, 0);
  armR.add(bicepR);

  // Elbow Couter Pad
  const couterR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), darkLeatherMat);
  couterR.position.set(0, -0.28, -0.03);
  armR.add(couterR);

  const couterStudR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), darkIronAccentMat);
  couterStudR.position.set(0, -0.28, -0.12);
  armR.add(couterStudR);

  // Studded Forearm Vambrace
  const foreArmR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.24, 0.17), armsPauldronMat);
  foreArmR.position.set(0, -0.42, 0.02);
  armR.add(foreArmR);

  const guardPlateR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.14), darkIronAccentMat);
  guardPlateR.position.set(0.08, -0.42, 0.02);
  armR.add(guardPlateR);

  // Fingerless Spiked Glove
  const gloveR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), darkLeatherMat);
  gloveR.position.set(0, -0.56, 0.02);
  armR.add(gloveR);

  // Knuckle Spikes
  [-0.045, -0.015, 0.015, 0.045].forEach(kx => {
    const kSpike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), steelSpikeMat);
    kSpike.position.set(kx, -0.57, 0.105);
    kSpike.rotation.x = Math.PI / 2;
    armR.add(kSpike);
  });

  const fingersR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12), barbarianSkinMat);
  fingersR.position.set(0, -0.63, 0.02);
  armR.add(fingersR);

  bandit.add(armR);

  // --- 5. LEGS, SHAGGY FUR WRAPS & SPIKED COMBAT BOOTS ---
  function createLeg(isLeft = true) {
    const leg = new THREE.Group();
    leg.name = isLeft ? 'LegL' : 'LegR';
    leg.position.set(isLeft ? -0.16 : 0.16, 0.68, 0);

    // Thighs: Patched Coarse Raider Trousers
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.32, 0.22), legsBootsMat);
    thigh.position.set(0, -0.16, 0);
    leg.add(thigh);

    // Shaggy Predator Fur Knee Wraps
    const kneeFur = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.25), furMat);
    kneeFur.position.set(0, -0.32, 0);
    leg.add(kneeFur);

    // Forged Iron Knee Poleyn / Studded Cap Over Fur
    const poleyn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), darkIronAccentMat);
    poleyn.position.set(0, -0.32, 0.12);
    leg.add(poleyn);

    const poleynStud = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), steelSpikeMat);
    poleynStud.position.set(0, -0.32, 0.155);
    leg.add(poleynStud);

    // Lower Shin: Studded Leather Greaves
    const bootUpper = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.26, 0.20), legsBootsMat);
    bootUpper.position.set(0, -0.48, 0);
    leg.add(bootUpper);

    // Leather Ankle Cinch Strap with Buckle
    const ankleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.04, 0.22), darkLeatherMat);
    ankleStrap.position.set(0, -0.56, 0.01);
    leg.add(ankleStrap);

    const ankleBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.03), darkIronAccentMat);
    ankleBuckle.position.set(isLeft ? -0.11 : 0.11, -0.56, 0.01);
    leg.add(ankleBuckle);

    // Foot / Spiked Combat Boot Group
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.63, 0);

    // Heavy Leather Combat Boot Body
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.32), darkLeatherMat);
    foot.position.set(0, 0.02, 0.04);
    footGroup.add(foot);

    // Rugged Thick Lugged Tread Sole
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.04, 0.36), darkIronAccentMat);
    sole.position.set(0, -0.05, 0.06);
    footGroup.add(sole);

    // Reinforced Iron Shin & Heel Counter
    const heelPlate = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.11, 0.08), darkIronAccentMat);
    heelPlate.position.set(0, 0.03, -0.10);
    footGroup.add(heelPlate);

    // Reinforced Curved Steel Toe Cap
    const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.11, 0.13), darkIronAccentMat);
    toeCap.position.set(0, 0.03, 0.16);
    footGroup.add(toeCap);

    // SHARP FORGED STEEL TOE SPIKES (Projecting forward from toe cap!)
    [-0.05, 0.05].forEach(tx => {
      const toeSpike = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.10, 4), steelSpikeMat);
      toeSpike.position.set(tx, 0.03, 0.23);
      toeSpike.rotation.x = Math.PI / 2;
      footGroup.add(toeSpike);
    });

    leg.add(footGroup);
    return leg;
  }

  const legL = createLeg(true);
  bandit.add(legL);

  const legR = createLeg(false);
  bandit.add(legR);

  // --- 6. SPIKED WAR CLUB / MACE WITH GLOWING BLOOD RUNES & SKULL POMMEL ---
  const weapon = new THREE.Group();
  weapon.name = 'Weapon';

  // Weathered Wood & Iron Core Shaft with Spiral Leather Grip
  const handleGeo = new THREE.CylinderGeometry(0.042, 0.038, 0.96, 6);
  const handle = new THREE.Mesh(handleGeo, weaponMat);
  weapon.add(handle);

  // Forged Iron Grip Retainer Rings at Top & Bottom of Grip
  [-0.20, 0.15].forEach(gy => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 4, 12), darkIronAccentMat);
    ring.position.y = gy;
    ring.rotation.x = Math.PI / 2;
    weapon.add(ring);
  });

  // Massive Spiked Bludgeon Mace Head Core
  const headM = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.34, 6), weaponMat);
  headM.position.y = 0.42;
  weapon.add(headM);

  // 4 Forged Iron Striking Blade Flanges (At 0°, 90°, 180°, 270°)
  for (let f = 0; f < 4; f++) {
    const flangeAngle = (f * Math.PI) / 2;
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.30, 0.14), weaponMat);
    flange.position.set(
      Math.sin(flangeAngle) * 0.10,
      0.42,
      Math.cos(flangeAngle) * 0.10
    );
    flange.rotation.y = flangeAngle;
    weapon.add(flange);

    // Glowing Blood Runes Etched into each Flange!
    const runePlate = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.08), bloodGlowMat);
    runePlate.position.set(
      Math.sin(flangeAngle) * 0.12,
      0.42,
      Math.cos(flangeAngle) * 0.12
    );
    runePlate.rotation.y = flangeAngle;
    weapon.add(runePlate);
  }

  // 8 DEADLY FORGED IRON SPIKES:
  // 4 Horizontal radiating spikes
  for (let s = 0; s < 4; s++) {
    const angle = (s * Math.PI) / 2 + Math.PI / 4;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.15, 5), steelSpikeMat);
    spike.position.set(
      Math.sin(angle) * 0.12,
      0.42,
      Math.cos(angle) * 0.12
    );
    spike.rotation.y = angle;
    spike.rotation.x = Math.PI / 2;
    weapon.add(spike);
  }

  // 4 Upper diagonal spikes pointing outward and up
  for (let s = 0; s < 4; s++) {
    const angle = (s * Math.PI) / 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.13, 5), steelSpikeMat);
    spike.position.set(
      Math.sin(angle) * 0.11,
      0.52,
      Math.cos(angle) * 0.11
    );
    spike.rotation.y = angle;
    spike.rotation.x = Math.PI / 3;
    weapon.add(spike);
  }

  // Top Forged Crown Spike Capping the Mace Head
  const crownSpike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 5), steelSpikeMat);
  crownSpike.position.y = 0.62;
  weapon.add(crownSpike);

  // Carved Bone / Iron Menacing Skull Pommel at the Handle Base
  const skullPommel = new THREE.Group();
  skullPommel.position.y = -0.48;

  const pommelSkull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.065, 0), boneAccentMat);
  pommelSkull.scale.set(1.0, 1.15, 0.8);
  skullPommel.add(pommelSkull);

  // Recessed dark eye sockets
  [-0.025, 0.025].forEach(px => {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), darkLeatherMat);
    socket.position.set(px, 0.01, 0.045);
    skullPommel.add(socket);
  });

  // Forged iron butt spike beneath skull pommel
  const buttSpike = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.08, 4), steelSpikeMat);
  buttSpike.position.y = -0.08;
  buttSpike.rotation.x = Math.PI;
  skullPommel.add(buttSpike);

  weapon.add(skullPommel);

  // Position War Club in right hand / combat ready stance (Matches in-game animators & original anchor)
  weapon.position.set(0.48, 0.75, 0.25);
  weapon.rotation.x = 0.5;
  bandit.add(weapon);

  // --- 7. SAVE COMPLETE REFERENCES IN userData FOR RIGGING & ANIMATIONS ---
  bandit.userData = {
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    weapon,
    helm,
    hornL,
    hornR,
    pauldronL,
    pauldronR,
    skullMedallion
  };

  return enableShadows(bandit);
}
