import * as THREE from 'three';
import { materials, enableShadows } from '../materials.js';
import {
  getCrimsonWarCanvasTextures,
  getPalisadeStakeTextures,
  getCampfireTextures,
  getLootAndSkullsTextures
} from './banditCampTextures.js';

/**
 * Next-Gen Stylized Low-Poly Bandit Camp Outpost (Acampamento Bandido)
 * Inspired by Warcraft 2 Hand-Painted Art Style, Valorant, and Overwatch.
 * 
 * Key Features:
 * 1. Spiked wooden palisade perimeter with fire-hardened logs & outward-angled defensive stakes.
 * 2. Large central Warlord war pavilion tent of weathered crimson cloth with horned bone finial.
 * 3. Secondary scouts' lean-to shelter with hide canopy and animal bedroll.
 * 4. Central stone-ringed campfire with charred logs, glowing coal bed, and dynamically animated flames.
 * 5. Barbaric totems: tall skull stakes with sweeping ox horns flanking the entrance.
 * 6. Plundered loot: opened iron-banded wooden chest overflowing with glistening gold coins & stolen weapon rack.
 * 7. Forged iron cooking spit with iron cauldron suspended over glowing coals.
 * 8. Scale fits game layout (approx 8.5 x 8.5, matching 4.2 collision radius).
 * 
 * @returns {THREE.Group}
 */
export function createBanditCamp() {
  const camp = new THREE.Group();
  camp.name = 'BanditCamp';

  // =========================================================================
  // 1. PBR MATERIALS SETUP
  // =========================================================================
  const warCanvasTex = getCrimsonWarCanvasTextures();
  const palisadeTex = getPalisadeStakeTextures();
  const campfireTex = getCampfireTextures();
  const lootTex = getLootAndSkullsTextures();

  // Weathered Crimson War Canvas & Hides
  const warCanvasMat = new THREE.MeshStandardMaterial({
    map: warCanvasTex.map,
    roughnessMap: warCanvasTex.roughnessMap,
    metalnessMap: warCanvasTex.metalnessMap,
    bumpMap: warCanvasTex.bumpMap,
    bumpScale: 0.06,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  // Sharpened Palisade Timber & Rawhide Ropes
  const palisadeTimberMat = new THREE.MeshStandardMaterial({
    map: palisadeTex.map,
    roughnessMap: palisadeTex.roughnessMap,
    metalnessMap: palisadeTex.metalnessMap,
    bumpMap: palisadeTex.bumpMap,
    bumpScale: 0.08,
    roughness: 0.85,
    metalness: 0.0
  });

  // Burning Campfire Ash & Coals
  const campfireBedMat = new THREE.MeshStandardMaterial({
    map: campfireTex.map,
    emissiveMap: campfireTex.emissiveMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.4,
    roughnessMap: campfireTex.roughnessMap,
    bumpMap: campfireTex.bumpMap,
    bumpScale: 0.08,
    roughness: 0.9
  });

  // Weathered Bone & Skulls
  const boneSkullMat = new THREE.MeshStandardMaterial({
    map: lootTex.map,
    roughnessMap: lootTex.roughnessMap,
    bumpMap: lootTex.bumpMap,
    bumpScale: 0.05,
    roughness: 0.72,
    metalness: 0.0
  });

  // Dark Forged Iron
  const forgedIronMat = new THREE.MeshStandardMaterial({
    color: 0x2b333e,
    roughness: 0.35,
    metalness: 0.85,
    bumpMap: lootTex.bumpMap,
    bumpScale: 0.04
  });

  // Plundered Glistening Gold
  const plunderedGoldMat = new THREE.MeshStandardMaterial({
    color: 0xf5b81a,
    roughness: 0.22,
    metalness: 0.95,
    bumpMap: lootTex.bumpMap,
    bumpScale: 0.05
  });

  // Aged Wood Planks (Chest, weapon rack, furniture)
  const agedWoodMat = new THREE.MeshStandardMaterial({
    map: lootTex.map,
    roughness: 0.75,
    metalness: 0.0
  });

  // Trampled Camp Earth & Mud
  const trampledEarthMat = new THREE.MeshStandardMaterial({
    color: 0x3d2719,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true
  });

  // Dark scorched ash dirt
  const scorchedDirtMat = new THREE.MeshStandardMaterial({
    color: 0x1f1712,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true
  });

  // =========================================================================
  // 2. CAMP BASE MOUND & TRAMPLED GROUND (Radius ~ 4.2, Diameter ~ 8.4)
  // =========================================================================
  const groundGroup = new THREE.Group();

  // Raised earthen mound base
  const baseMoundGeo = new THREE.CylinderGeometry(4.2, 4.4, 0.22, 18);
  const baseMound = new THREE.Mesh(baseMoundGeo, trampledEarthMat);
  baseMound.position.y = 0.11;
  groundGroup.add(baseMound);

  // Inner trampled clearing with organic dirt patches
  const clearingGeo = new THREE.CylinderGeometry(3.85, 4.05, 0.08, 14);
  const clearing = new THREE.Mesh(clearingGeo, materials.soil);
  clearing.position.y = 0.24;
  groundGroup.add(clearing);

  // Scorched earth patch beneath the central fire
  const firePatchGeo = new THREE.CylinderGeometry(1.4, 1.5, 0.04, 10);
  const firePatch = new THREE.Mesh(firePatchGeo, scorchedDirtMat);
  firePatch.position.set(0.15, 0.28, 0.6);
  groundGroup.add(firePatch);

  // Stepping stones through entrance
  const stonePositions = [
    [0.4, 3.2, 0.35],
    [-0.3, 2.7, 0.4],
    [0.2, 2.1, 0.32],
    [-0.1, 1.5, 0.38]
  ];
  stonePositions.forEach(([sx, sz, sr]) => {
    const sGeo = new THREE.DodecahedronGeometry(sr, 0);
    const stone = new THREE.Mesh(sGeo, materials.stoneDark);
    stone.scale.set(1.2, 0.35, 1.0);
    stone.position.set(sx, 0.26, sz);
    stone.rotation.y = sx * 3;
    groundGroup.add(stone);
  });

  camp.add(groundGroup);

  // =========================================================================
  // 3. HELPER: SCULPTED HORNED SKULL
  // =========================================================================
  function createHornedSkull(scale = 1.0) {
    const skull = new THREE.Group();
    skull.scale.set(scale, scale, scale);

    // Cranium
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.32), boneSkullMat);
    cranium.position.y = 0.08;
    skull.add(cranium);

    // Brow ridge
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.14), boneSkullMat);
    brow.position.set(0, 0.12, 0.14);
    skull.add(brow);

    // Snout / Maxilla
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), boneSkullMat);
    snout.position.set(0, -0.09, 0.1);
    skull.add(snout);

    // Dark sunken eye sockets
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f0e0d });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), eyeMat);
    eyeL.position.set(-0.09, 0.05, 0.18);
    skull.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), eyeMat);
    eyeR.position.set(0.09, 0.05, 0.18);
    skull.add(eyeR);

    // Sweeping Ox / Bull Horns
    for (const side of [-1, 1]) {
      // Base horn segment (curving out)
      const horn1 = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.4, 5), boneSkullMat);
      horn1.position.set(side * 0.24, 0.16, -0.02);
      horn1.rotation.z = -side * 1.15;
      horn1.rotation.x = -0.22;
      skull.add(horn1);

      // Tip horn segment (curving up and inwards)
      const horn2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 4), boneSkullMat);
      horn2.position.set(side * 0.46, 0.35, -0.06);
      horn2.rotation.z = -side * 0.45;
      horn2.rotation.x = 0.2;
      skull.add(horn2);
    }

    return skull;
  }

  // =========================================================================
  // 4. SPIKED WOODEN PALISADE PERIMETER (Upright logs & angled defense stakes)
  // =========================================================================
  const palisadeGroup = new THREE.Group();
  palisadeGroup.name = 'PalisadePerimeter';

  const palisadeRadius = 3.9;
  const numVerticalLogs = 22;
  // Entrance opening between approx 65 deg and 115 deg (angle ~ 1.15 to 2.0 rad)
  const entranceStartAngle = 0.38;
  const entranceEndAngle = Math.PI * 2 - 0.38;

  for (let i = 0; i < numVerticalLogs; i++) {
    const t = i / (numVerticalLogs - 1);
    const angle = entranceStartAngle + t * (entranceEndAngle - entranceStartAngle);

    const px = Math.sin(angle) * palisadeRadius;
    const pz = Math.cos(angle) * palisadeRadius;

    // Organic height and tilt variations
    const logH = 2.5 + Math.sin(i * 1.7) * 0.35;
    const logR = 0.22 + (i % 3) * 0.02;

    const postGroup = new THREE.Group();
    postGroup.position.set(px, 0.2, pz);

    // Log cylinder body
    const postBody = new THREE.Mesh(
      new THREE.CylinderGeometry(logR * 0.9, logR, logH * 0.75, 6),
      palisadeTimberMat
    );
    postBody.position.y = (logH * 0.75) / 2;
    postGroup.add(postBody);

    // Fire-hardened sharpened cone tip
    const postTip = new THREE.Mesh(
      new THREE.ConeGeometry(logR * 0.9, logH * 0.25, 6),
      palisadeTimberMat
    );
    postTip.position.y = logH * 0.75 + (logH * 0.25) / 2;
    postGroup.add(postTip);

    // Slight organic inward/outward tilt
    postGroup.rotation.y = angle + Math.PI / 2 + (i % 2 === 0 ? 0.3 : -0.3);
    postGroup.rotation.z = Math.sin(angle) * (0.04 + (i % 4) * 0.02);
    postGroup.rotation.x = Math.cos(angle) * (0.04 + (i % 3) * 0.02);

    // Severed skull trophies mounted atop select palisade posts
    if (i === 4 || i === 11 || i === 18) {
      const spikeSkull = createHornedSkull(0.65);
      spikeSkull.position.set(0, logH + 0.12, 0);
      spikeSkull.rotation.y = angle;
      postGroup.add(spikeSkull);
    }

    palisadeGroup.add(postGroup);

    // Outward-Angled Impaling Stakes (Chevron / Caltrops to deter assault)
    if (i % 2 === 0 && i > 0 && i < numVerticalLogs - 1) {
      const stakeLen = 2.2;
      const stakeR = 0.16;
      const stake = new THREE.Group();
      stake.position.set(px, 0.35, pz);

      const stakeBody = new THREE.Mesh(
        new THREE.CylinderGeometry(stakeR * 0.8, stakeR, stakeLen * 0.7, 5),
        palisadeTimberMat
      );
      stakeBody.position.y = (stakeLen * 0.7) / 2;
      stake.add(stakeBody);

      const stakeTip = new THREE.Mesh(
        new THREE.ConeGeometry(stakeR * 0.8, stakeLen * 0.3, 5),
        palisadeTimberMat
      );
      stakeTip.position.y = stakeLen * 0.7 + (stakeLen * 0.3) / 2;
      stake.add(stakeTip);

      // Angled outwards 42 degrees pointing away from camp center
      stake.rotation.y = angle;
      stake.rotation.x = -0.72; // pitch outward
      palisadeGroup.add(stake);
    }
  }

  // Horizontal timber cross-runners lashing the palisade together
  const numRunners = 8;
  for (let r = 0; r < numRunners; r++) {
    const a1 = entranceStartAngle + (r / numRunners) * (entranceEndAngle - entranceStartAngle);
    const a2 = entranceStartAngle + ((r + 1) / numRunners) * (entranceEndAngle - entranceStartAngle);
    const midA = (a1 + a2) / 2;
    const chordLen = 2 * palisadeRadius * Math.sin((a2 - a1) / 2);

    // Lower runner
    const lowRunner = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, chordLen * 1.05), palisadeTimberMat);
    lowRunner.position.set(Math.sin(midA) * 3.72, 0.9, Math.cos(midA) * 3.72);
    lowRunner.rotation.y = midA + Math.PI / 2;
    palisadeGroup.add(lowRunner);

    // Upper runner
    const highRunner = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, chordLen * 1.05), palisadeTimberMat);
    highRunner.position.set(Math.sin(midA) * 3.72, 1.85, Math.cos(midA) * 3.72);
    highRunner.rotation.y = midA + Math.PI / 2;
    palisadeGroup.add(highRunner);
  }

  camp.add(palisadeGroup);

  // =========================================================================
  // 5. BARBARIC TOTEMS (Skull stakes with sweeping ox horns at the entrance)
  // =========================================================================
  const totemsGroup = new THREE.Group();
  totemsGroup.name = 'EntranceTotems';

  function createTotemPost(x, z, rotY) {
    const totem = new THREE.Group();
    totem.position.set(x, 0.2, z);
    totem.rotation.y = rotY;

    // Heavy carved timber pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.6, 6), palisadeTimberMat);
    pole.position.y = 1.8;
    totem.add(pole);

    // Rawhide bindings at mid-height
    const bindGeo = new THREE.TorusGeometry(0.24, 0.05, 4, 8);
    const bind1 = new THREE.Mesh(bindGeo, materials.leatherBrown);
    bind1.position.y = 1.2;
    bind1.rotation.x = Math.PI / 2;
    totem.add(bind1);

    const bind2 = new THREE.Mesh(bindGeo, materials.leatherBrown);
    bind2.position.y = 2.4;
    bind2.rotation.x = Math.PI / 2;
    totem.add(bind2);

    // Cross timber arm holding trophies
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), palisadeTimberMat);
    arm.position.y = 2.9;
    totem.add(arm);

    // Dangling trophy skulls on arm ends
    const trophyL = createHornedSkull(0.5);
    trophyL.position.set(-0.55, 2.7, 0.05);
    totem.add(trophyL);

    const trophyR = createHornedSkull(0.5);
    trophyR.position.set(0.55, 2.7, 0.05);
    totem.add(trophyR);

    // Master Great Horned Skull atop pole
    const masterSkull = createHornedSkull(1.15);
    masterSkull.position.set(0, 3.85, 0.05);
    totem.add(masterSkull);

    return totem;
  }

  const totemLeft = createTotemPost(-1.6, 3.75, 0.25);
  const totemRight = createTotemPost(1.6, 3.75, -0.25);
  totemsGroup.add(totemLeft);
  totemsGroup.add(totemRight);
  camp.add(totemsGroup);

  // =========================================================================
  // 6. LARGE CENTRAL WARLORD TENT (Conical War Pavilion with bone finial)
  // =========================================================================
  const tentGroup = new THREE.Group();
  tentGroup.name = 'WarlordTent';
  tentGroup.position.set(-1.1, 0.2, -1.1);
  tentGroup.rotation.y = 0.45;

  // Main conical canvas pavilion (8 facets for stylized silhouette)
  const pavilionR = 2.05;
  const pavilionH = 3.3;
  const pavilionGeo = new THREE.ConeGeometry(pavilionR, pavilionH, 8, 1, true);
  const pavilion = new THREE.Mesh(pavilionGeo, warCanvasMat);
  pavilion.position.y = pavilionH / 2;
  tentGroup.add(pavilion);

  // Dark interior void behind open flaps
  const interiorVoid = new THREE.Mesh(
    new THREE.CylinderGeometry(pavilionR * 0.85, pavilionR * 0.95, pavilionH * 0.7, 8),
    materials.tunnelBlack
  );
  interiorVoid.position.y = (pavilionH * 0.7) / 2;
  tentGroup.add(interiorVoid);

  // Entrance flap folds tied back
  const flapGeo = new THREE.BoxGeometry(0.55, 1.4, 0.06);
  const flapL = new THREE.Mesh(flapGeo, warCanvasMat);
  flapL.position.set(-0.65, 0.75, pavilionR * 0.82);
  flapL.rotation.y = 0.7;
  tentGroup.add(flapL);

  const flapR = new THREE.Mesh(flapGeo, warCanvasMat);
  flapR.position.set(0.65, 0.75, pavilionR * 0.82);
  flapR.rotation.y = -0.7;
  tentGroup.add(flapR);

  // Center mast timber pole protruding through the top
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 6), palisadeTimberMat);
  mast.position.y = 2.2;
  tentGroup.add(mast);

  // Rugged animal fur collar around tent apex
  const furCollarGeo = new THREE.TorusGeometry(0.55, 0.16, 5, 8);
  const furCollar = new THREE.Mesh(furCollarGeo, materials.leatherBrown);
  furCollar.rotation.x = Math.PI / 2;
  furCollar.position.y = pavilionH - 0.2;
  tentGroup.add(furCollar);

  // Massive horned beast skull finial atop the mast
  const tentFinial = createHornedSkull(1.25);
  tentFinial.position.set(0, 4.3, 0);
  tentGroup.add(tentFinial);

  // Guy ropes & wooden tent stakes
  const ropeCoords = [
    [-2.2, 0.8],
    [2.2, 0.8],
    [-1.8, -1.8],
    [1.8, -1.8]
  ];
  ropeCoords.forEach(([rx, rz]) => {
    // Wooden stake driven in dirt
    const peg = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 4), materials.woodDark);
    peg.position.set(rx, 0.15, rz);
    peg.rotation.x = 0.3;
    tentGroup.add(peg);

    // Taut rawhide rope from peg to tent eaves
    const ropeLen = Math.hypot(rx, rz);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ropeLen * 1.05, 3), materials.leatherBrown);
    rope.position.set(rx * 0.5, 0.9, rz * 0.5);
    rope.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-rx, 1.4, -rz).normalize()
    );
    tentGroup.add(rope);
  });

  // Hanging War Banner on tent entrance
  const bannerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), materials.woodDark);
  bannerPole.rotation.z = Math.PI / 2;
  bannerPole.position.set(0, 2.2, pavilionR * 0.88);
  tentGroup.add(bannerPole);

  const bannerCloth = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.03), warCanvasMat);
  bannerCloth.position.set(0, 1.6, pavilionR * 0.88);
  tentGroup.add(bannerCloth);

  camp.add(tentGroup);

  // =========================================================================
  // 7. SECONDARY SCOUTS' SHELTER / LEAN-TO (A-Frame Timber & Hide Canopy)
  // =========================================================================
  const shelterGroup = new THREE.Group();
  shelterGroup.name = 'ScoutsShelter';
  shelterGroup.position.set(2.1, 0.2, -1.3);
  shelterGroup.rotation.y = -0.55;

  // Forked timber upright branch posts
  const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.1, 5), palisadeTimberMat);
  postA.position.set(-1.1, 1.05, 0.7);
  shelterGroup.add(postA);

  const postB = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.1, 5), palisadeTimberMat);
  postB.position.set(1.1, 1.05, 0.7);
  shelterGroup.add(postB);

  // Horizontal ridge pole
  const ridgeBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 5), palisadeTimberMat);
  ridgeBeam.rotation.z = Math.PI / 2;
  ridgeBeam.position.set(0, 2.05, 0.7);
  shelterGroup.add(ridgeBeam);

  // Angled rafter poles sloping back
  for (let s = -1; s <= 1; s++) {
    const rafter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.3, 4), palisadeTimberMat);
    rafter.position.set(s * 0.95, 1.05, -0.15);
    rafter.rotation.x = -0.65;
    shelterGroup.add(rafter);
  }

  // Weathered crimson war canvas & hide canopy stretched over rafters
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.2, 0.05), warCanvasMat);
  canopy.position.set(0, 1.15, -0.15);
  canopy.rotation.x = -0.65;
  shelterGroup.add(canopy);

  // Scouts' straw bedroll & animal furs inside shelter
  const bedroll = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.85), materials.wheat);
  bedroll.position.set(0, 0.1, 0.1);
  shelterGroup.add(bedroll);

  const peltBlanket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.65), materials.leatherBrown);
  peltBlanket.position.set(0.1, 0.2, 0.1);
  shelterGroup.add(peltBlanket);

  // Carved wood log stool & drink horn flask
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.35, 6), materials.woodDark);
  stool.position.set(-0.85, 0.18, 0.7);
  shelterGroup.add(stool);

  const hornFlask = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), materials.woodLight);
  hornFlask.position.set(-0.85, 0.42, 0.7);
  hornFlask.rotation.z = 0.8;
  shelterGroup.add(hornFlask);

  camp.add(shelterGroup);

  // =========================================================================
  // 8. CENTRAL CAMPFIRE, CHARRED LOGS, ANIMATED FLAME & IRON COOKING SPIT
  // =========================================================================
  const campfireGroup = new THREE.Group();
  campfireGroup.name = 'CampfireArea';
  campfireGroup.position.set(0.15, 0.2, 0.6);

  // Rugged River Stones Ring
  const numStones = 13;
  const stoneRingR = 0.92;
  for (let st = 0; st < numStones; st++) {
    const a = (st / numStones) * Math.PI * 2;
    const sx = Math.cos(a) * stoneRingR + (Math.sin(st * 3) * 0.05);
    const sz = Math.sin(a) * stoneRingR + (Math.cos(st * 4) * 0.05);
    const sr = 0.18 + (st % 3) * 0.04;

    const sMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(sr, 0), materials.stoneDark);
    sMesh.scale.set(1.2, 0.8, 1.1);
    sMesh.position.set(sx, sr * 0.5, sz);
    sMesh.rotation.set(st * 0.4, st * 0.6, 0);
    campfireGroup.add(sMesh);
  }

  // Ash & Glowing Coal Bed Disc
  const ashBed = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.88, 0.06, 12), campfireBedMat);
  ashBed.position.y = 0.04;
  campfireGroup.add(ashBed);

  // Charred Firewood Logs (criss-crossed tepee formation)
  const numFireLogs = 7;
  for (let fl = 0; fl < numFireLogs; fl++) {
    const fa = (fl / numFireLogs) * Math.PI * 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.82, 5), palisadeTimberMat);
    log.position.set(Math.cos(fa) * 0.28, 0.18, Math.sin(fa) * 0.28);
    log.rotation.z = Math.cos(fa) * 0.55;
    log.rotation.x = Math.sin(fa) * 0.55;
    log.rotation.y = fa;
    campfireGroup.add(log);
  }

  // --- STYLIZED MULTI-TIERED FLAME GEOMETRY ---
  const flameGroup = new THREE.Group();
  flameGroup.position.set(0, 0.18, 0);

  // 1. Inner blazing yellow core
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xfff08a,
    emissive: new THREE.Color(0xffd54f),
    emissiveIntensity: 2.8,
    roughness: 0.1,
    flatShading: true
  });
  const coreFlame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 5), coreMat);
  coreFlame.position.y = 0.32;
  flameGroup.add(coreFlame);

  // 2. Middle vibrant amber flame tongues
  const midMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: new THREE.Color(0xf97316),
    emissiveIntensity: 2.3,
    roughness: 0.2,
    flatShading: true
  });
  const midFlame1 = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.85, 6), midMat);
  midFlame1.position.y = 0.42;
  flameGroup.add(midFlame1);

  const midFlame2 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.78, 5), midMat);
  midFlame2.position.set(0.08, 0.38, -0.06);
  midFlame2.rotation.y = 1.2;
  flameGroup.add(midFlame2);

  // 3. Outer licking fiery crimson flame petals
  const outerMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 1.9,
    roughness: 0.3,
    transparent: true,
    opacity: 0.88,
    flatShading: true
  });
  const outerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.05, 6), outerMat);
  outerFlame.position.y = 0.52;
  flameGroup.add(outerFlame);

  // 4. Floating glowing ember sparks
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xffbb33 });
  const embers = [];
  for (let eb = 0; eb < 5; eb++) {
    const ember = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025, 0), emberMat);
    const ea = (eb / 5) * Math.PI * 2;
    ember.position.set(Math.cos(ea) * 0.15, 0.75 + eb * 0.15, Math.sin(ea) * 0.15);
    flameGroup.add(ember);
    embers.push(ember);
  }

  // Prevent flames from casting dark shadows on the coals
  coreFlame.castShadow = false;
  midFlame1.castShadow = false;
  midFlame2.castShadow = false;
  outerFlame.castShadow = false;
  embers.forEach(e => { e.castShadow = false; });

  // Stylized Warm Campfire Light
  const fireLight = new THREE.PointLight(0xff7700, 2.2, 11, 2);
  fireLight.position.set(0, 0.85, 0);
  campfireGroup.add(fireLight);

  // Automatic Dynamic Organic Flame Animation Loop via onBeforeRender
  flameGroup.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    // Multi-frequency organic breathing and flicker
    const scaleY = 1.0 + Math.sin(t * 11) * 0.1 + Math.cos(t * 17) * 0.06;
    const scaleXZ = 1.0 + Math.cos(t * 9) * 0.08 + Math.sin(t * 21) * 0.04;
    flameGroup.scale.set(scaleXZ, scaleY, scaleXZ);
    flameGroup.rotation.y = Math.sin(t * 2.5) * 0.18;

    // Modulate light flicker
    fireLight.intensity = 2.0 + Math.sin(t * 13) * 0.4 + Math.cos(t * 27) * 0.25;

    // Orbit and bob floating embers
    embers.forEach((emb, idx) => {
      emb.position.y = 0.7 + Math.sin(t * 4 + idx * 1.5) * 0.18 + (idx * 0.12);
      emb.position.x = Math.cos(t * 2 + idx * 1.2) * (0.12 + idx * 0.04);
      emb.position.z = Math.sin(t * 2 + idx * 1.2) * (0.12 + idx * 0.04);
    });
  };

  campfireGroup.add(flameGroup);

  // --- FORGED IRON COOKING SPIT & CAULDRON ---
  const spitGroup = new THREE.Group();

  // Two vertical iron fork posts driven on either side of the pit
  const forkPostGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.45, 4);
  const postL = new THREE.Mesh(forkPostGeo, forgedIronMat);
  postL.position.set(-0.78, 0.72, 0);
  spitGroup.add(postL);

  const postR = new THREE.Mesh(forkPostGeo, forgedIronMat);
  postR.position.set(0.78, 0.72, 0);
  spitGroup.add(postR);

  // Fork tips at tops of posts
  for (const px of [-0.78, 0.78]) {
    const f1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 3), forgedIronMat);
    f1.position.set(px - 0.05, 1.45, 0);
    f1.rotation.z = 0.35;
    spitGroup.add(f1);

    const f2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 3), forgedIronMat);
    f2.position.set(px + 0.05, 1.45, 0);
    f2.rotation.z = -0.35;
    spitGroup.add(f2);
  }

  // Horizontal iron crossbar
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 4), forgedIronMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, 1.42, 0);
  spitGroup.add(crossbar);

  // Hanging forged iron chain
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 3), forgedIronMat);
  chain.position.set(0, 1.15, 0);
  spitGroup.add(chain);

  // Iron Cooking Pot / Cauldron
  const cauldron = new THREE.Group();
  cauldron.position.set(0, 0.82, 0);

  // Cauldron belly bowl
  const potBelly = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 7, 0, Math.PI * 2, Math.PI * 0.2, Math.PI * 0.8),
    forgedIronMat
  );
  cauldron.add(potBelly);

  // Pot rim
  const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 4, 8), forgedIronMat);
  potRim.rotation.x = Math.PI / 2;
  potRim.position.y = 0.18;
  cauldron.add(potRim);

  // Cauldron handle hoop
  const handleHoop = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.02, 3, 8, Math.PI), forgedIronMat);
  handleHoop.position.y = 0.18;
  cauldron.add(handleHoop);

  // Simmering meat stew inside
  const stewMat = new THREE.MeshStandardMaterial({
    color: 0x4a2711,
    roughness: 0.35,
    flatShading: true
  });
  const stew = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.21, 0.04, 8), stewMat);
  stew.position.y = 0.14;
  cauldron.add(stew);

  // Wooden ladle handle
  const ladle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.38, 4), materials.woodLight);
  ladle.position.set(0.08, 0.26, 0.06);
  ladle.rotation.z = 0.45;
  cauldron.add(ladle);

  spitGroup.add(cauldron);
  campfireGroup.add(spitGroup);

  camp.add(campfireGroup);

  // =========================================================================
  // 9. PLUNDERED LOOT: OPENED TREASURE CHEST SPILLING COINS & SUPPLY SACKS
  // =========================================================================
  const lootGroup = new THREE.Group();
  lootGroup.name = 'PlunderedLoot';
  lootGroup.position.set(-2.2, 0.2, 0.65);
  lootGroup.rotation.y = 0.4;

  // Chest body
  const chestBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.46, 0.54), agedWoodMat);
  chestBody.position.y = 0.23;
  lootGroup.add(chestBody);

  // Iron reinforcement bands
  const bandL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.56), forgedIronMat);
  bandL.position.set(-0.3, 0.23, 0);
  lootGroup.add(bandL);

  const bandR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.56), forgedIronMat);
  bandR.position.set(0.3, 0.23, 0);
  lootGroup.add(bandR);

  // Front lock clasp
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.05), forgedIronMat);
  clasp.position.set(0, 0.28, 0.28);
  lootGroup.add(clasp);

  // Open Chest Lid (tilted back at 65 degrees)
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, 0.46, -0.27);
  lidGroup.rotation.x = -1.15;

  const lidArch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.87, 8, 1, false, 0, Math.PI),
    agedWoodMat
  );
  lidArch.rotation.z = Math.PI / 2;
  lidArch.position.set(0, 0, 0.27);
  lidGroup.add(lidArch);

  const lidBandL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.56), forgedIronMat);
  lidBandL.position.set(-0.3, 0.08, 0.27);
  lidGroup.add(lidBandL);

  const lidBandR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.56), forgedIronMat);
  lidBandR.position.set(0.3, 0.08, 0.27);
  lidGroup.add(lidBandR);

  lootGroup.add(lidGroup);

  // Overflowing mound of glistening gold inside chest
  const goldMound = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 1), plunderedGoldMat);
  goldMound.scale.set(1.5, 0.7, 1.1);
  goldMound.position.set(0, 0.44, 0);
  lootGroup.add(goldMound);

  // Coins cascading down the front of the chest onto the dirt
  const coinSpill = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.26, 6), plunderedGoldMat);
  coinSpill.position.set(0.12, 0.12, 0.38);
  coinSpill.rotation.x = 0.4;
  lootGroup.add(coinSpill);

  // Plundered golden goblet / chalice
  const goblet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.22, 5), plunderedGoldMat);
  goblet.position.set(-0.24, 0.54, 0.06);
  goblet.rotation.z = 0.6;
  lootGroup.add(goblet);

  // Nearby plundered ale barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.75, 8), materials.woodDark);
  barrel.position.set(0.68, 0.38, -0.2);
  lootGroup.add(barrel);

  const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 3, 8), forgedIronMat);
  hoop1.rotation.x = Math.PI / 2;
  hoop1.position.set(0.68, 0.6, -0.2);
  lootGroup.add(hoop1);

  const hoop2 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 3, 8), forgedIronMat);
  hoop2.rotation.x = Math.PI / 2;
  hoop2.position.set(0.68, 0.16, -0.2);
  lootGroup.add(hoop2);

  // Plundered tied burlap grain/coin sack
  const sack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 1), materials.wheat);
  sack.scale.set(1.0, 1.3, 1.0);
  sack.position.set(0.6, 0.28, 0.35);
  lootGroup.add(sack);

  camp.add(lootGroup);

  // =========================================================================
  // 10. STOLEN WEAPONRY RACKS (Swords, battleaxe, spear, soldier shield)
  // =========================================================================
  const weaponRackGroup = new THREE.Group();
  weaponRackGroup.name = 'WeaponRack';
  weaponRackGroup.position.set(2.25, 0.2, 0.7);
  weaponRackGroup.rotation.y = -0.45;

  // Sturdy A-frame timber weapon stand
  const timberPostGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.5, 4);
  const postL1 = new THREE.Mesh(timberPostGeo, palisadeTimberMat);
  postL1.position.set(-0.75, 0.75, -0.18);
  postL1.rotation.x = 0.22;
  weaponRackGroup.add(postL1);

  const postL2 = new THREE.Mesh(timberPostGeo, palisadeTimberMat);
  postL2.position.set(-0.75, 0.75, 0.18);
  postL2.rotation.x = -0.22;
  weaponRackGroup.add(postL2);

  const postR1 = new THREE.Mesh(timberPostGeo, palisadeTimberMat);
  postR1.position.set(0.75, 0.75, -0.18);
  postR1.rotation.x = 0.22;
  weaponRackGroup.add(postR1);

  const postR2 = new THREE.Mesh(timberPostGeo, palisadeTimberMat);
  postR2.position.set(0.75, 0.75, 0.18);
  postR2.rotation.x = -0.22;
  weaponRackGroup.add(postR2);

  // Horizontal weapon support cross-rails
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.09, 0.09), palisadeTimberMat);
  topRail.position.set(0, 1.1, 0);
  weaponRackGroup.add(topRail);

  const botRail = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.09, 0.09), palisadeTimberMat);
  botRail.position.set(0, 0.22, 0);
  weaponRackGroup.add(botRail);

  // Stolen Knight Broadsword propped against rack
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.02), materials.steelArmor);
  blade.position.y = 0.48;
  sword.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.04), forgedIronMat);
  guard.position.y = 0.02;
  sword.add(guard);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 4), materials.woodDark);
  hilt.position.y = -0.11;
  sword.add(hilt);
  sword.position.set(-0.35, 0.2, 0.12);
  sword.rotation.x = -0.32;
  sword.rotation.z = 0.08;
  weaponRackGroup.add(sword);

  // Stolen Barbarian Battleaxe
  const axe = new THREE.Group();
  const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 4), materials.woodDark);
  axeHandle.position.y = 0.62;
  axe.add(axeHandle);
  const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.04), materials.steelDark);
  axeBlade.position.set(0.12, 1.1, 0);
  axe.add(axeBlade);
  axe.position.set(0.06, 0.16, 0.14);
  axe.rotation.x = -0.28;
  axe.rotation.z = -0.06;
  weaponRackGroup.add(axe);

  // Stolen Iron-Tipped Spear planted upright next to rack
  const spear = new THREE.Group();
  const spearShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.05, 4), materials.woodMedium);
  spearShaft.position.y = 1.02;
  spear.add(spearShaft);
  const spearHead = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 4), materials.steelArmor);
  spearHead.position.y = 2.18;
  spear.add(spearHead);
  spear.position.set(0.52, 0, 0.12);
  spear.rotation.x = -0.24;
  spear.rotation.z = -0.12;
  weaponRackGroup.add(spear);

  // Plundered Soldier Round Shield resting against the frame
  const shield = new THREE.Group();
  const shieldDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 8), materials.bannerRed);
  shieldDisc.rotation.x = Math.PI / 2;
  shield.add(shieldDisc);
  const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), forgedIronMat);
  shieldBoss.position.z = 0.035;
  shield.add(shieldBoss);
  const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 4, 8), forgedIronMat);
  shield.add(shieldRim);
  shield.position.set(-0.62, 0.36, 0.32);
  shield.rotation.y = 0.32;
  shield.rotation.x = -0.32;
  weaponRackGroup.add(shield);

  camp.add(weaponRackGroup);

  // =========================================================================
  // 11. SAVE REFERENCES IN USERDATA & ENABLE SHADOWS
  // =========================================================================
  camp.userData = {
    flame: flameGroup,
    fireLight: fireLight,
    tent: tentGroup,
    shelter: shelterGroup,
    campfire: campfireGroup,
    lootChest: lootGroup,
    weaponRack: weaponRackGroup,
    totemL: totemLeft,
    totemR: totemRight
  };

  return enableShadows(camp);
}
