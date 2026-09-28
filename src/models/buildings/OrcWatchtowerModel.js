import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcSplitRoofTextures,
  getOrcSpikedIronTextures,
  getOrcBoneTuskTextures,
  getOrcHordeBannerTextures,
  getOrcBasaltStoneTextures,
  getOrcBlazingFireTextures
} from './orcTextures.js';

/**
 * Next-Gen AAA Stylized Orc Watchtower (Torre de Vigia e Sentinela da Horda)
 * Faithfully matches the top right building in modeloorcs.png.
 *
 * Visual Features:
 * - Imposing 3-tier tapering timber tower built from massive round ironwood trunks.
 * - Heavy X-cross timber bracing on all 4 sides across all vertical tiers.
 * - Cantilevered overhanging lookout crow's nest with spiked palisade railing.
 * - Jutting mammoth bone tusks and spiked round war shields mounted on the parapet.
 * - Long wooden access ladder climbing the tower side.
 * - Crowning 4-legged forged iron fire brazier with roaring flames and glowing embers.
 * - Fluttering crimson Horde banner hanging from the observation deck.
 *
 * @returns {THREE.Group}
 */
export function createOrcWatchtower() {
  const tower = new THREE.Group();
  tower.name = 'OrcWatchtower';

  // --- 1. PBR Material Helper & Initialization ---
  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const barkMat = createPBRMaterial(getOrcDarkLogBarkTextures(), { bumpScale: 0.08 });
  const logEndMat = createPBRMaterial(getOrcLogEndTextures(), { bumpScale: 0.06 });
  const ironRoofMat = createPBRMaterial(getOrcSplitRoofTextures(), { bumpScale: 0.08, metalness: 0.8 });
  const ironArmorMat = createPBRMaterial(getOrcSpikedIronTextures(), { bumpScale: 0.06, metalness: 0.9 });
  const boneMat = createPBRMaterial(getOrcBoneTuskTextures(), { bumpScale: 0.05, roughness: 0.45 });
  const bannerMat = createPBRMaterial(getOrcHordeBannerTextures(), { bumpScale: 0.04, side: THREE.DoubleSide });
  const stoneMat = createPBRMaterial(getOrcBasaltStoneTextures(), { bumpScale: 0.08 });

  const fireTex = getOrcBlazingFireTextures();
  const fireMat = new THREE.MeshStandardMaterial({
    map: fireTex.map,
    emissiveMap: fireTex.emissiveMap,
    emissive: 0xff4400,
    emissiveIntensity: 2.8,
    roughness: 0.4,
    transparent: true,
    opacity: 0.95
  });

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x3c4350,
    roughness: 0.35,
    metalness: 0.85,
    flatShading: true
  });

  const bloodIronMat = new THREE.MeshStandardMaterial({
    color: 0xbd2020,
    roughness: 0.4,
    metalness: 0.75,
    flatShading: true
  });


  // Helper: create round log with caps
  function createDetailedLog(radius, length, isHorizontal = false) {
    const group = new THREE.Group();
    const cylinderGeo = new THREE.CylinderGeometry(radius, radius * 1.04, length, 8, 1, true);
    const body = new THREE.Mesh(cylinderGeo, barkMat);
    group.add(body);

    const capGeo = new THREE.CircleGeometry(radius, 8);
    const topCap = new THREE.Mesh(capGeo, logEndMat);
    topCap.position.y = length * 0.5;
    topCap.rotation.x = -Math.PI / 2;
    group.add(topCap);

    const bottomCap = new THREE.Mesh(capGeo, logEndMat);
    bottomCap.position.y = -length * 0.5;
    bottomCap.rotation.x = Math.PI / 2;
    group.add(bottomCap);

    if (isHorizontal) {
      group.rotation.z = Math.PI / 2;
    }
    return group;
  }

  // ==========================================================================
  // 2. STONE PLINTH FOUNDATION & DEFENSIVE BASE SPIKES
  // ==========================================================================
  const baseSpan = 4.8;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(baseSpan, 0.45, baseSpan), stoneMat);
  plinth.position.set(0, 0.22, 0);
  tower.add(plinth);

  // Spikes pointing outward around base
  for (let angle = 0; angle < Math.PI * 2; angle += 0.55) {
    const sx = Math.cos(angle) * (baseSpan * 0.5 + 0.3);
    const sz = Math.sin(angle) * (baseSpan * 0.5 + 0.3);
    // Leave front ladder approach clear (Z > 1.8 && Math.abs(sx) < 1.0)
    if (sz > 1.8 && Math.abs(sx) < 1.0) continue;

    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.2, 5), darkIronMat);
    spk.position.set(sx, 0.6, sz);
    spk.rotation.x = (sz / (baseSpan * 0.5)) * 0.7;
    spk.rotation.z = -(sx / (baseSpan * 0.5)) * 0.7;
    tower.add(spk);
  }

  // ==========================================================================
  // 3. THREE-TIER TAPERING TIMBER TOWER FRAME
  // ==========================================================================
  const towerHeight = 7.6;
  const baseCornerRadius = 1.9;
  const topCornerRadius = 1.3;

  // 4 Slanted Corner Pillar Trunks
  const cornerAngles = [
    Math.PI * 0.25,
    Math.PI * 0.75,
    Math.PI * 1.25,
    Math.PI * 1.75
  ];

  cornerAngles.forEach(ang => {
    const bx = Math.cos(ang) * baseCornerRadius;
    const bz = Math.sin(ang) * baseCornerRadius;
    const tx = Math.cos(ang) * topCornerRadius;
    const tz = Math.sin(ang) * topCornerRadius;

    const pillarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx, 0.45, bz),
      new THREE.Vector3((bx + tx) * 0.5, 0.45 + towerHeight * 0.5, (bz + tz) * 0.5),
      new THREE.Vector3(tx, 0.45 + towerHeight, tz)
    ]);
    const pillarGeo = new THREE.TubeGeometry(pillarCurve, 10, 0.22, 8, false);
    const pillar = new THREE.Mesh(pillarGeo, barkMat);
    tower.add(pillar);

    // Iron Base Gusset
    const gusset = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 5), darkIronMat);
    gusset.position.set(bx, 0.6, bz);
    tower.add(gusset);
  });

  // Tiers & Intermediate Cross-Beams
  const tierHeights = [2.6, 5.0, 7.6];
  tierHeights.forEach((ty, tIdx) => {
    const factor = ty / towerHeight;
    const span = (baseCornerRadius * (1 - factor) + topCornerRadius * factor) * 2 * Math.SQRT1_2 * 2;

    // Horizontal Ring of Cross-Beams
    const hLog1 = createDetailedLog(0.16, span, true);
    hLog1.position.set(0, ty, -span * 0.35);
    tower.add(hLog1);

    const hLog2 = createDetailedLog(0.16, span, true);
    hLog2.position.set(0, ty, span * 0.35);
    tower.add(hLog2);

    const hLog3 = createDetailedLog(0.16, span, true);
    hLog3.position.set(-span * 0.35, ty, 0);
    hLog3.rotation.y = Math.PI / 2;
    tower.add(hLog3);

    const hLog4 = createDetailedLog(0.16, span, true);
    hLog4.position.set(span * 0.35, ty, 0);
    hLog4.rotation.y = Math.PI / 2;
    tower.add(hLog4);

    // Intermediate Rest Deck at Tier 1 & 2
    if (tIdx < 2) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 0.7, 0.12, span * 0.7), barkMat);
      deck.position.set(0, ty + 0.06, 0);
      tower.add(deck);
    }
  });

  // Heavy X-Cross Timber Braces across tiers on all 4 faces
  for (let t = 0; t < 2; t++) {
    const yLow = tierHeights[t];
    const yHigh = tierHeights[t + 1];
    const midY = (yLow + yHigh) * 0.5;
    const fMid = midY / towerHeight;
    const spanMid = (baseCornerRadius * (1 - fMid) + topCornerRadius * fMid) * 1.4;
    const diagLen = Math.sqrt(Math.pow(spanMid, 2) + Math.pow(yHigh - yLow, 2));
    const diagAngle = Math.atan2(yHigh - yLow, spanMid);

    // Front, Back, Left, Right faces
    [
      { x: 0, z: -spanMid * 0.5, rotY: 0 },
      { x: 0, z: spanMid * 0.5, rotY: 0 },
      { x: -spanMid * 0.5, z: 0, rotY: Math.PI / 2 },
      { x: spanMid * 0.5, z: 0, rotY: Math.PI / 2 }
    ].forEach(face => {
      // Except front ground tier which has ladder
      if (t === 0 && face.z > 0 && face.rotY === 0) return;

      const xGroup = new THREE.Group();
      xGroup.position.set(face.x, midY, face.z);
      xGroup.rotation.y = face.rotY;

      const brace1 = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.12, 0.12), barkMat);
      brace1.rotation.z = diagAngle;
      xGroup.add(brace1);

      const brace2 = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.12, 0.12), barkMat);
      brace2.rotation.z = -diagAngle;
      xGroup.add(brace2);

      // Central iron stud
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), darkIronMat);
      xGroup.add(stud);

      tower.add(xGroup);
    });
  }

  // ==========================================================================
  // 4. OVERHANGING LOOKOUT CROW'S NEST & SPARRING PARAPET
  // ==========================================================================
  const nestGroup = new THREE.Group();
  nestGroup.name = 'LookoutPlatform';
  nestGroup.position.set(0, towerHeight, 0);

  const deckSpan = 3.6;
  const platformFloor = new THREE.Mesh(new THREE.BoxGeometry(deckSpan, 0.22, deckSpan), barkMat);
  nestGroup.add(platformFloor);

  // Cantilever Support Timbers radiating outward from underneath
  for (let i = 0; i < 4; i++) {
    const cAng = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, deckSpan * 0.7), barkMat);
    cBeam.position.set(Math.cos(cAng) * 0.8, -0.2, Math.sin(cAng) * 0.8);
    cBeam.rotation.y = cAng;
    cBeam.rotation.x = 0.45;
    nestGroup.add(cBeam);
  }

  // Spiked Palisade Parapet Railing around lookout
  const numPostsPerSide = 6;
  const halfSpan = deckSpan * 0.48;
  const pStep = deckSpan / (numPostsPerSide - 1);

  for (let side = 0; side < 4; side++) {
    const ang = side * (Math.PI / 2);
    for (let p = 0; p < numPostsPerSide; p++) {
      // Leave ladder hatch gap
      if (side === 0 && (p === 2 || p === 3)) continue;

      const px = -halfSpan + p * pStep;
      const ppost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.35, 6), barkMat);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 5), darkIronMat);
      tip.position.y = 0.8;
      ppost.add(tip);

      const pGroup = new THREE.Group();
      pGroup.rotation.y = ang;
      pGroup.position.set(0, 0.7, 0);
      ppost.position.set(px, 0, halfSpan);
      pGroup.add(ppost);
      nestGroup.add(pGroup);
    }
  }

  // Forward Jutting Mammoth Bone Tusks from parapet
  [-1, 1].forEach(side => {
    const tuskCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.3, 0.5),
      new THREE.Vector3(side * 0.3, 0.8, 1.2)
    ]);
    const tuskGeo = new THREE.TubeGeometry(tuskCurve, 8, 0.1, 6, false);
    const tusk = new THREE.Mesh(tuskGeo, boneMat);
    tusk.position.set(side * 1.3, 0.4, halfSpan);
    nestGroup.add(tusk);
  });

  // Spiked Round War Shields mounted on Parapet
  const shieldGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.08, 8);
  shieldGeo.rotateX(Math.PI / 2);
  [-0.9, 0.9].forEach(sx => {
    const shield = new THREE.Mesh(shieldGeo, bloodIronMat);
    shield.position.set(sx, 0.6, -halfSpan - 0.05);
    nestGroup.add(shield);

    const boss = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 6), darkIronMat);
    boss.position.set(sx, 0.6, -halfSpan - 0.12);
    boss.rotation.x = -Math.PI / 2;
    nestGroup.add(boss);
  });

  // ==========================================================================
  // 5. CROWNING 4-LEGGED FORGED IRON FIRE BRAZIER (Socket_Brazier)
  // ==========================================================================
  const brazierGroup = new THREE.Group();
  brazierGroup.name = 'Socket_Brazier';
  brazierGroup.position.set(0, 0.15, 0);

  // 4 Forged Iron Legs
  [
    [-0.4, -0.4], [0.4, -0.4],
    [-0.4, 0.4], [0.4, 0.4]
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 5), darkIronMat);
    leg.position.set(lx, 0.4, lz);
    leg.rotation.z = -lx * 0.35;
    leg.rotation.x = lz * 0.35;
    brazierGroup.add(leg);
  });

  // Iron Fire Basket / Bowl
  const bowlGeo = new THREE.CylinderGeometry(0.65, 0.38, 0.55, 8, 1, true);
  const bowl = new THREE.Mesh(bowlGeo, darkIronMat);
  bowl.position.y = 0.85;
  brazierGroup.add(bowl);

  // Upper Rim with Spikes
  for (let s = 0; s < 8; s++) {
    const sang = (s / 8) * Math.PI * 2;
    const bspk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), darkIronMat);
    bspk.position.set(Math.cos(sang) * 0.65, 1.25, Math.sin(sang) * 0.65);
    brazierGroup.add(bspk);
  }

  // Molten Glowing Coals
  const coals = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), fireMat);
  coals.position.y = 0.95;
  coals.scale.set(1.0, 0.45, 1.0);
  brazierGroup.add(coals);

  // Roaring Flames
  for (let f = 0; f < 3; f++) {
    const fang = (f / 3) * Math.PI * 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 5), fireMat);
    flame.position.set(Math.cos(fang) * 0.18, 1.35, Math.sin(fang) * 0.18);
    brazierGroup.add(flame);
  }

  nestGroup.add(brazierGroup);

  // Fluttering Crimson Horde Banner hung from platform deck
  const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.6, 4, 7), bannerMat);
  bannerMesh.position.set(halfSpan + 0.06, -0.6, 0);
  bannerMesh.rotation.y = Math.PI / 2;
  nestGroup.add(bannerMesh);

  tower.add(nestGroup);

  // ==========================================================================
  // 6. WOODEN ACCESS LADDER
  // ==========================================================================
  const ladderGroup = new THREE.Group();
  ladderGroup.name = 'AccessLadder';
  ladderGroup.position.set(0, 0.45, halfSpan * 0.92);

  // Left & Right Ladder Rails
  [-0.32, 0.32].forEach(lx => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, towerHeight + 0.6, 5), barkMat);
    rail.position.set(lx, (towerHeight + 0.6) * 0.5, 0);
    ladderGroup.add(rail);
  });

  // Notched Rungs
  const numRungs = 16;
  for (let r = 1; r <= numRungs; r++) {
    const ry = (r / (numRungs + 1)) * (towerHeight + 0.4);
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 5), barkMat);
    rung.position.set(0, ry, 0);
    rung.rotation.z = Math.PI / 2;
    ladderGroup.add(rung);
  }

  tower.add(ladderGroup);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(tower);
}
