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
 * Next-Gen AAA Stylized Orc Barracks (Arena de Treinamento e Quartel da Horda)
 * Faithfully matches the bottom center-left building in modeloorcs.png.
 *
 * Visual Features:
 * - Fortified open-air combat training arena enclosed by heavy timber palisades with spiked logs.
 * - Corner guard platforms with notched log pilings and outward-angled iron spikes.
 * - Suspended sparring training dummy (Anim_TrainingDummy) with burlap body, horned helmet, and cross-arms.
 * - Interior weapon racks displaying polearms, halberds, spears, and double battleaxes.
 * - Sharpening grindstone on a heavy timber trestle with treadle.
 * - Chopping practice block with embedded heavy orc cleaver.
 * - Twin tall spear poles flying tattered crimson Horde war banners.
 * - Iron fire brazier with glowing embers.
 *
 * @returns {THREE.Group}
 */
export function createOrcBarracks() {
  const barracks = new THREE.Group();
  barracks.name = 'OrcBarracks';

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
  const boneTuskMat = createPBRMaterial(getOrcBoneTuskTextures(), { bumpScale: 0.05, roughness: 0.45 });
  const bannerMat = createPBRMaterial(getOrcHordeBannerTextures(), { bumpScale: 0.04, side: THREE.DoubleSide });
  const stoneMat = createPBRMaterial(getOrcBasaltStoneTextures(), { bumpScale: 0.08 });

  const fireTex = getOrcBlazingFireTextures();
  const fireMat = new THREE.MeshStandardMaterial({
    map: fireTex.map,
    emissiveMap: fireTex.emissiveMap,
    emissive: 0xff4400,
    emissiveIntensity: 2.6,
    roughness: 0.5,
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

  const burlapMat = new THREE.MeshStandardMaterial({
    color: 0xd4a572,
    roughness: 0.88,
    metalness: 0.0,
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
  // 2. STONE & CHURNED EARTH ARENA FOUNDATION
  // ==========================================================================
  const arenaWidth = 9.4;
  const arenaDepth = 8.6;

  // Raised earthen combat ring
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(arenaWidth, 0.4, arenaDepth), stoneMat);
  foundation.position.set(0, 0.2, 0);
  barracks.add(foundation);

  // Rim border
  const rim = new THREE.Mesh(new THREE.BoxGeometry(arenaWidth + 0.3, 0.15, arenaDepth + 0.3), darkIronMat);
  rim.position.set(0, 0.35, 0);
  barracks.add(rim);

  // ==========================================================================
  // 3. FORTIFIED PERIMETER PALISADE & CORNER BASTIONS
  // ==========================================================================
  const palisadeGroup = new THREE.Group();
  palisadeGroup.name = 'ArenaWalls';

  const logR = 0.22;
  const logH = 2.8;

  // Rear Wall (Z = -arenaDepth * 0.5)
  for (let x = -arenaWidth * 0.48; x <= arenaWidth * 0.48; x += 0.45) {
    const post = createDetailedLog(logR, logH);
    post.position.set(x, 0.4 + logH * 0.5, -arenaDepth * 0.48);
    palisadeGroup.add(post);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(logR, 0.5, 5), darkIronMat);
    tip.position.set(x, 0.4 + logH + 0.22, -arenaDepth * 0.48);
    palisadeGroup.add(tip);
  }

  // Left & Right Flank Walls
  [-arenaWidth * 0.48, arenaWidth * 0.48].forEach(x => {
    for (let z = -arenaDepth * 0.44; z <= arenaDepth * 0.44; z += 0.45) {
      const post = createDetailedLog(logR, logH);
      post.position.set(x, 0.4 + logH * 0.5, z);
      palisadeGroup.add(post);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(logR, 0.5, 5), darkIronMat);
      tip.position.set(x, 0.4 + logH + 0.22, z);
      palisadeGroup.add(tip);
    }
  });

  // Front Wall with Arena Entrance (Gap between -1.4 and +1.4)
  for (let x = -arenaWidth * 0.48; x <= -1.4; x += 0.45) {
    const post = createDetailedLog(logR, logH);
    post.position.set(x, 0.4 + logH * 0.5, arenaDepth * 0.48);
    palisadeGroup.add(post);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(logR, 0.5, 5), darkIronMat);
    tip.position.set(x, 0.4 + logH + 0.22, arenaDepth * 0.48);
    palisadeGroup.add(tip);
  }
  for (let x = 1.4; x <= arenaWidth * 0.48; x += 0.45) {
    const post = createDetailedLog(logR, logH);
    post.position.set(x, 0.4 + logH * 0.5, arenaDepth * 0.48);
    palisadeGroup.add(post);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(logR, 0.5, 5), darkIronMat);
    tip.position.set(x, 0.4 + logH + 0.22, arenaDepth * 0.48);
    palisadeGroup.add(tip);
  }

  // Horizontal Reinforcing Split Logs
  const railGeoX = new THREE.BoxGeometry(arenaWidth, 0.16, 0.2);
  const backRail = new THREE.Mesh(railGeoX, barkMat);
  backRail.position.set(0, 1.8, -arenaDepth * 0.48);
  palisadeGroup.add(backRail);

  // Outward Angled Perimeter Spikes
  for (let a = 0; a < Math.PI * 2; a += 0.6) {
    const sx = Math.cos(a) * (arenaWidth * 0.5 + 0.3);
    const sz = Math.sin(a) * (arenaDepth * 0.5 + 0.3);
    if (sz > arenaDepth * 0.4 && Math.abs(sx) < 1.8) continue;

    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.3, 5), darkIronMat);
    spk.position.set(sx, 1.1, sz);
    spk.rotation.x = (sz / (arenaDepth * 0.5)) * 0.65;
    spk.rotation.z = -(sx / (arenaWidth * 0.5)) * 0.65;
    palisadeGroup.add(spk);
  }

  barracks.add(palisadeGroup);

  // Corner Watch Bastions
  const corners = [
    [-arenaWidth * 0.48, -arenaDepth * 0.48],
    [arenaWidth * 0.48, -arenaDepth * 0.48],
    [-arenaWidth * 0.48, arenaDepth * 0.48],
    [arenaWidth * 0.48, arenaDepth * 0.48]
  ];

  corners.forEach(([cx, cz]) => {
    const cornerPillar = createDetailedLog(0.35, 3.8);
    cornerPillar.position.set(cx, 1.9, cz);
    barracks.add(cornerPillar);

    // Platform
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.5), barkMat);
    plat.position.set(cx, 3.6, cz);
    barracks.add(plat);

    // Spiked railing
    [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].forEach(([px, pz]) => {
      const spk = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 4), darkIronMat);
      spk.position.set(cx + px, 4.0, cz + pz);
      barracks.add(spk);
    });
  });

  // ==========================================================================
  // 4. REAR QUARTERMASTER'S SHELTER & LEAN-TO
  // ==========================================================================
  const shelterGroup = new THREE.Group();
  shelterGroup.name = 'ArmoryShelter';
  shelterGroup.position.set(0, 0.4, -arenaDepth * 0.28);

  // Split-log pitched lean-to roof
  const shelterRoofGeo = new THREE.BoxGeometry(6.6, 0.2, 3.2);
  const shelterRoof = new THREE.Mesh(shelterRoofGeo, ironRoofMat);
  shelterRoof.position.set(0, 3.2, 0);
  shelterRoof.rotation.x = 0.28;
  shelterGroup.add(shelterRoof);

  // Support posts
  [-2.8, 0, 2.8].forEach(x => {
    const post = createDetailedLog(0.2, 3.1);
    post.position.set(x, 1.55, 1.2);
    shelterGroup.add(post);
  });

  // Crossed logs at shelter peak
  const crossLog1 = createDetailedLog(0.18, 2.8);
  crossLog1.position.set(0, 3.6, 0);
  crossLog1.rotation.z = 0.65;
  shelterGroup.add(crossLog1);

  const crossLog2 = createDetailedLog(0.18, 2.8);
  crossLog2.position.set(0, 3.6, 0);
  crossLog2.rotation.z = -0.65;
  shelterGroup.add(crossLog2);

  barracks.add(shelterGroup);

  // ==========================================================================
  // 5. TRAINING GALLOWS & ANIMATED SPARRING DUMMY (Anim_TrainingDummy)
  // ==========================================================================
  const gallowsGroup = new THREE.Group();
  gallowsGroup.name = 'TrainingGallows';
  gallowsGroup.position.set(2.2, 0.4, 0.4);

  // Heavy timber vertical post
  const gallowsPost = createDetailedLog(0.24, 3.8);
  gallowsPost.position.set(0, 1.9, 0);
  gallowsGroup.add(gallowsPost);

  // Horizontal cantilever arm
  const armLog = createDetailedLog(0.18, 1.8, true);
  armLog.position.set(-0.7, 3.5, 0);
  gallowsGroup.add(armLog);

  // Diagonal timber brace
  const braceGeo = new THREE.BoxGeometry(0.14, 0.14, 1.2);
  braceGeo.rotateX(0.7);
  const gbrace = new THREE.Mesh(braceGeo, barkMat);
  gbrace.position.set(-0.4, 3.1, 0);
  gallowsGroup.add(gbrace);

  // --- THE TRAINING DUMMY GROUP (Anim_TrainingDummy) ---
  const dummyPivot = new THREE.Group();
  dummyPivot.name = 'Anim_TrainingDummy';
  dummyPivot.position.set(-1.2, 3.4, 0);

  // Hanging chain / rope
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), darkIronMat);
  rope.position.y = -0.45;
  dummyPivot.add(rope);

  // Dummy Torso (Burlap Sack stuffed with straw)
  const dummyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.95, 7), burlapMat);
  dummyBody.position.y = -1.25;
  dummyPivot.add(dummyBody);

  // Horizontal cross-arms (wooden pole)
  const crossArms = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.14), barkMat);
  crossArms.position.y = -1.05;
  dummyPivot.add(crossArms);

  // Spiked wooden training club in one hand
  const club = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.85, 5), barkMat);
  club.position.set(0.55, -0.9, 0.25);
  club.rotation.x = 0.4;
  dummyPivot.add(club);

  // Horned Skull / Damaged Spangenhelm Helmet
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 6), darkIronMat);
  helm.position.y = -0.62;
  dummyPivot.add(helm);

  // Curved horns on dummy helmet
  [-1, 1].forEach(side => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 4), boneTuskMat);
    horn.position.set(side * 0.22, -0.65, 0);
    horn.rotation.z = side * 0.65;
    dummyPivot.add(horn);
  });

  gallowsGroup.add(dummyPivot);
  barracks.add(gallowsGroup);

  // ==========================================================================
  // 6. ENTRANCE GATE & TWIN CRIMSON WAR BANNERS
  // ==========================================================================
  const gateGroup = new THREE.Group();
  gateGroup.name = 'BarracksGate';
  gateGroup.position.set(0, 0.4, arenaDepth * 0.48);

  // Twin Entrance Gateposts
  [-1.5, 1.5].forEach(gx => {
    const gPost = createDetailedLog(0.32, 4.2);
    gPost.position.set(gx, 2.1, 0);
    gateGroup.add(gPost);

    // Iron Band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.15, 8), darkIronMat);
    band.position.set(gx, 3.4, 0);
    gateGroup.add(band);
  });

  // Top Spiked Barricade Lintel
  const gateLintel = createDetailedLog(0.28, 3.4, true);
  gateLintel.position.set(0, 3.8, 0);
  gateGroup.add(gateLintel);

  // Twin Tall Spearpoles with Fluttering Crimson Horde Banners
  [
    { x: -1.7, rotZ: 0.12 },
    { x: 1.7, rotZ: -0.12 }
  ].forEach((bcfg, idx) => {
    const bannerPole = new THREE.Group();
    bannerPole.name = `Anim_WarBanner_${idx}`;
    bannerPole.position.set(bcfg.x, 3.8, 0);
    bannerPole.rotation.z = bcfg.rotZ;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.8, 6), darkIronMat);
    pole.position.y = 1.9;
    bannerPole.add(pole);

    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), darkIronMat);
    spearTip.position.y = 3.9;
    bannerPole.add(spearTip);

    const bannerCloth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0, 4, 6), bannerMat);
    bannerCloth.position.set(0.55, 2.7, 0.04);
    bannerPole.add(bannerCloth);

    bannerPole.userData.clothMesh = bannerCloth;
    gateGroup.add(bannerPole);
  });

  barracks.add(gateGroup);

  // ==========================================================================
  // 7. WEAPON RACKS, DOUBLE BATTLEAXES & TRAINING PROPS
  // ==========================================================================
  const propsGroup = new THREE.Group();
  propsGroup.name = 'TrainingProps';

  // A. Heavy Weapon Rack on Left Inner Wall
  const leftRack = new THREE.Group();
  leftRack.position.set(-arenaWidth * 0.42, 0.4, 0);
  leftRack.rotation.y = Math.PI / 2;

  const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 0.3), barkMat);
  rackFrame.position.y = 0.7;
  leftRack.add(rackFrame);

  // Spears & Polearms in Rack
  for (let x = -1.4; x <= 1.4; x += 0.45) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 5), darkIronMat);
    shaft.position.set(x, 1.2, 0.18);
    leftRack.add(shaft);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 4), darkIronMat);
    tip.position.set(x, 2.45, 0.18);
    leftRack.add(tip);
  }
  propsGroup.add(leftRack);

  // B. Double-Headed Orc Battleaxes hanging on rear wall
  for (let ax = -1.8; ax <= 1.8; ax += 1.8) {
    const axeGroup = new THREE.Group();
    axeGroup.position.set(ax, 2.2, -arenaDepth * 0.44);

    // Axe handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5), barkMat);
    axeGroup.add(handle);

    // Double curved blades
    [-1, 1].forEach(side => {
      const bladeGeo = new THREE.BoxGeometry(0.45, 0.4, 0.05);
      const blade = new THREE.Mesh(bladeGeo, ironArmorMat);
      blade.position.set(side * 0.24, 0.4, 0);
      axeGroup.add(blade);
    });

    propsGroup.add(axeGroup);
  }

  // C. Sharpening Grindstone on Wooden Trestle
  const grindstoneGroup = new THREE.Group();
  grindstoneGroup.position.set(-2.0, 0.4, 1.2);
  grindstoneGroup.rotation.y = 0.4;

  const trestle = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.2), barkMat);
  trestle.position.y = 0.35;
  grindstoneGroup.add(trestle);

  const stoneDiscGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 12);
  stoneDiscGeo.rotateZ(Math.PI / 2);
  const stoneDisc = new THREE.Mesh(stoneDiscGeo, stoneMat);
  stoneDisc.position.y = 0.85;
  grindstoneGroup.add(stoneDisc);

  propsGroup.add(grindstoneGroup);

  // D. Chopping Block with Embedded Cleaver
  const stump = createDetailedLog(0.38, 0.7);
  stump.position.set(-0.8, 0.75, 1.8);
  propsGroup.add(stump);

  const cleaverBlade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.04), darkIronMat);
  cleaverBlade.position.set(-0.8, 1.15, 1.8);
  cleaverBlade.rotation.z = -0.3;
  propsGroup.add(cleaverBlade);

  // E. Iron Fire Brazier with Glowing Embers
  const brazierGroup = new THREE.Group();
  brazierGroup.position.set(-2.6, 0.4, -1.8);

  const brazierBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.55, 6, 1, true), darkIronMat);
  brazierBowl.position.y = 0.55;
  brazierGroup.add(brazierBowl);

  const embers = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 5), fireMat);
  embers.position.y = 0.68;
  embers.scale.set(1, 0.55, 1);
  brazierGroup.add(embers);

  propsGroup.add(brazierGroup);

  // F. Spiked Round Iron Shields Mounted on Walls
  const shieldGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 8);
  shieldGeo.rotateX(Math.PI / 2);
  [-1.8, 1.8].forEach(sx => {
    const sMesh = new THREE.Mesh(shieldGeo, bloodIronMat);
    sMesh.position.set(sx, 1.8, arenaDepth * 0.46);
    propsGroup.add(sMesh);

    const sBoss = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 6), darkIronMat);
    sBoss.position.set(sx, 1.8, arenaDepth * 0.46 - 0.08);
    sBoss.rotation.x = -Math.PI / 2;
    propsGroup.add(sBoss);
  });

  barracks.add(propsGroup);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(barracks);
}
