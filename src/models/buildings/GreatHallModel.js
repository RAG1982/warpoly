import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcSplitRoofTextures,
  getOrcSpikedIronTextures,
  getOrcBoneTuskTextures,
  getOrcHordeBannerTextures,
  getOrcGlowingWindowTextures,
  getOrcBasaltStoneTextures,
  getOrcBlazingFireTextures
} from './orcTextures.js';

/**
 * Next-Gen AAA Stylized Orc Great Hall (Grande Salão da Horda / Fortaleza Orc)
 * Rebuilt to faithfully replicate the center building of modeloorcs.png.
 *
 * Visual Features:
 * - Monumental fortified longhouse on a stone/earthen foundation base.
 * - Spiked timber palisade courtyard with 4 corner bastions bristling with iron spikes.
 * - Grand ceremonial gate flanked by two monumental curved mammoth tusks and a horned beast skull.
 * - Hanging forged iron lantern with warm glowing amber light.
 * - Multi-tier split-log roof clad in hammered, riveted dark iron armor plates.
 * - Curved ivory bone crest horns running along the roof ridge line.
 * - Two tall wooden spears flying tattered crimson Horde war banners.
 * - Glowing warm amber multi-pane windows with iron cross-grilles.
 * - Volcanic basalt stone chimney venting smoke from the central hearth fire.
 * - Courtyard weapon racks, spiked barricades, and iron braziers.
 *
 * @returns {THREE.Group}
 */
export function createGreatHall() {
  const hall = new THREE.Group();
  hall.name = 'GreatHall';

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

  const windowTex = getOrcGlowingWindowTextures();
  const windowMat = new THREE.MeshStandardMaterial({
    map: windowTex.map,
    emissiveMap: windowTex.emissiveMap,
    emissive: 0xff8811,
    emissiveIntensity: 2.2,
    roughness: 0.35,
    metalness: 0.1
  });

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

  // Solid accent materials
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


  // Helper: add rivets along a beam
  function addRivetLine(parent, start, end, count = 4, radius = 0.045) {
    const rivetGeo = new THREE.SphereGeometry(radius, 6, 5);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const rx = start.x + (end.x - start.x) * t;
      const ry = start.y + (end.y - start.y) * t;
      const rz = start.z + (end.z - start.z) * t;
      const rivet = new THREE.Mesh(rivetGeo, darkIronMat);
      rivet.position.set(rx, ry, rz);
      parent.add(rivet);
    }
  }

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

  // Helper: create smooth curved mammoth ivory tusk
  function createCurvedTusk(height = 3.2, curveForward = 1.1, curveInward = 0.35, baseRadius = 0.22) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(curveInward * 0.3, height * 0.35, curveForward * 0.25),
      new THREE.Vector3(curveInward * 0.7, height * 0.7, curveForward * 0.65),
      new THREE.Vector3(curveInward, height, curveForward)
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 14, baseRadius, 8, false);

    // Scale tapering from base to tip
    const pos = tubeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const normalizedY = Math.max(0, Math.min(1, y / height));
      const factor = Math.max(0.12, 1.0 - Math.pow(normalizedY, 1.15) * 0.88);
      pos.setX(i, pos.getX(i) * factor);
      pos.setZ(i, pos.getZ(i) * factor);
    }
    pos.needsUpdate = true;
    tubeGeo.computeVertexNormals();

    const tuskMesh = new THREE.Mesh(tubeGeo, boneTuskMat);
    return tuskMesh;
  }

  // Helper: create horned skull trophy
  function createHornedSkull() {
    const skullGroup = new THREE.Group();
    skullGroup.name = 'SkullTrophy';

    // Cranium
    const craniumGeo = new THREE.DodecahedronGeometry(0.38, 1);
    const cranium = new THREE.Mesh(craniumGeo, boneTuskMat);
    cranium.scale.set(1.0, 0.85, 1.2);
    skullGroup.add(cranium);

    // Snout / Maxilla
    const snoutGeo = new THREE.BoxGeometry(0.32, 0.24, 0.45);
    const snout = new THREE.Mesh(snoutGeo, boneTuskMat);
    snout.position.set(0, -0.15, 0.4);
    skullGroup.add(snout);

    // Eye sockets (dark hollows)
    const eyeGeo = new THREE.SphereGeometry(0.09, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.16, 0.05, 0.38);
    skullGroup.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.16, 0.05, 0.38);
    skullGroup.add(rightEye);

    // Curved Horns (Left and Right)
    [-1, 1].forEach(side => {
      const hornCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.35, 0.2, -0.05),
        new THREE.Vector3(side * 0.65, 0.45, -0.15),
        new THREE.Vector3(side * 0.85, 0.8, -0.05)
      ]);
      const hornGeo = new THREE.TubeGeometry(hornCurve, 10, 0.1, 7, false);
      const hornMesh = new THREE.Mesh(hornGeo, boneTuskMat);
      hornMesh.position.set(side * 0.2, 0.18, -0.05);
      skullGroup.add(hornMesh);
    });

    return skullGroup;
  }

  // ==========================================================================
  // 2. FOUNDATION & PALISADE COURTYARD
  // ==========================================================================
  const courtyardGroup = new THREE.Group();
  courtyardGroup.name = 'Courtyard';

  // A. Raised Basalt Foundation Plinth
  const plinthGeo = new THREE.BoxGeometry(11.2, 0.5, 11.2);
  const plinth = new THREE.Mesh(plinthGeo, stoneMat);
  plinth.position.set(0, 0.25, 0);
  courtyardGroup.add(plinth);

  // Beveled stone plinth rim
  const plinthRimGeo = new THREE.BoxGeometry(11.6, 0.15, 11.6);
  const plinthRim = new THREE.Mesh(plinthRimGeo, darkIronMat);
  plinthRim.position.set(0, 0.45, 0);
  courtyardGroup.add(plinthRim);

  // B. Palisade Walls with Sharpened Logs
  // Wall boundaries: X ~ ±5.2, Z ~ ±5.2. Front entrance gap at Z = +5.2 between X = -1.6 and +1.6
  const palisadeGroup = new THREE.Group();
  palisadeGroup.name = 'PalisadeWalls';

  const logRadius = 0.2;
  const logHeight = 2.4;

  // Rear Wall (Z = -5.1)
  for (let x = -5.0; x <= 5.0; x += 0.42) {
    const h = logHeight + (Math.sin(x * 3.5) * 0.25);
    const post = createDetailedLog(logRadius, h);
    post.position.set(x, 0.5 + h * 0.5, -5.1);
    palisadeGroup.add(post);

    // Sharpened cone top
    const tip = new THREE.Mesh(new THREE.ConeGeometry(logRadius, 0.45, 6), darkIronMat);
    tip.position.set(x, 0.5 + h + 0.2, -5.1);
    palisadeGroup.add(tip);
  }

  // Left & Right Flank Walls (X = -5.1 and +5.1)
  [-5.1, 5.1].forEach(x => {
    for (let z = -4.8; z <= 4.8; z += 0.42) {
      const h = logHeight + (Math.cos(z * 4.1) * 0.25);
      const post = createDetailedLog(logRadius, h);
      post.position.set(x, 0.5 + h * 0.5, z);
      palisadeGroup.add(post);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(logRadius, 0.45, 6), darkIronMat);
      tip.position.set(x, 0.5 + h + 0.2, z);
      palisadeGroup.add(tip);
    }
  });

  // Front Wall with Gate Opening (Z = +5.1, X from -5.0 to -1.5 and +1.5 to +5.0)
  for (let x = -5.0; x <= -1.6; x += 0.42) {
    const h = logHeight + (Math.sin(x * 2.5) * 0.2);
    const post = createDetailedLog(logRadius, h);
    post.position.set(x, 0.5 + h * 0.5, 5.1);
    palisadeGroup.add(post);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(logRadius, 0.45, 6), darkIronMat);
    tip.position.set(x, 0.5 + h + 0.2, 5.1);
    palisadeGroup.add(tip);
  }
  for (let x = 1.6; x <= 5.0; x += 0.42) {
    const h = logHeight + (Math.sin(x * 2.5) * 0.2);
    const post = createDetailedLog(logRadius, h);
    post.position.set(x, 0.5 + h * 0.5, 5.1);
    palisadeGroup.add(post);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(logRadius, 0.45, 6), darkIronMat);
    tip.position.set(x, 0.5 + h + 0.2, 5.1);
    palisadeGroup.add(tip);
  }

  // Horizontal Reinforcing Split Logs and Spikes pointing outward
  const railMat = barkMat;
  const railGeo = new THREE.BoxGeometry(10.6, 0.18, 0.22);
  const backRail = new THREE.Mesh(railGeo, railMat);
  backRail.position.set(0, 1.6, -5.25);
  palisadeGroup.add(backRail);

  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 10.6), railMat);
  leftRail.position.set(-5.25, 1.6, 0);
  palisadeGroup.add(leftRail);

  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 10.6), railMat);
  rightRail.position.set(5.25, 1.6, 0);
  palisadeGroup.add(rightRail);

  // Outward Angled Spikes (Anti-cavalry chevaux de frise spikes)
  for (let angle = 0; angle < Math.PI * 2; angle += 0.55) {
    const sx = Math.cos(angle) * 5.6;
    const sz = Math.sin(angle) * 5.6;
    // Don't block front gate opening
    if (sz > 4.5 && Math.abs(sx) < 2.0) continue;

    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 5), darkIronMat);
    spike.position.set(sx, 1.1, sz);
    spike.rotation.x = (sz / 5.6) * 0.75;
    spike.rotation.z = -(sx / 5.6) * 0.75;
    palisadeGroup.add(spike);
  }

  courtyardGroup.add(palisadeGroup);

  // C. 4 Fortified Corner Bastions
  const cornerCoords = [
    [-5.0, -5.0],
    [5.0, -5.0],
    [-5.0, 5.0],
    [5.0, 5.0]
  ];

  cornerCoords.forEach(([cx, cz]) => {
    const bastionGroup = new THREE.Group();
    bastionGroup.position.set(cx, 0.5, cz);

    // Heavy corner pillar log
    const cornerPillar = createDetailedLog(0.36, 3.4);
    cornerPillar.position.y = 1.7;
    bastionGroup.add(cornerPillar);

    // Iron reinforcement bands with rivets
    const bandGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.14, 8);
    [1.0, 2.2, 3.2].forEach(by => {
      const band = new THREE.Mesh(bandGeo, darkIronMat);
      band.position.y = by;
      bastionGroup.add(band);
    });

    // Lookout crow's platform
    const platformGeo = new THREE.BoxGeometry(1.6, 0.18, 1.6);
    const platform = new THREE.Mesh(platformGeo, barkMat);
    platform.position.y = 3.3;
    bastionGroup.add(platform);

    // Spiked parapet rails
    const parapetPostGeo = new THREE.ConeGeometry(0.12, 0.8, 4);
    [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(([px, pz]) => {
      const ppost = new THREE.Mesh(parapetPostGeo, darkIronMat);
      ppost.position.set(px, 3.7, pz);
      bastionGroup.add(ppost);
    });

    // Bastion Iron Fire Brazier
    const brazierLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.5, 5, 1, true), darkIronMat);
    brazierLegs.position.y = 3.65;
    bastionGroup.add(brazierLegs);

    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 5), fireMat);
    coals.position.y = 3.75;
    coals.scale.set(1, 0.55, 1);
    bastionGroup.add(coals);

    courtyardGroup.add(bastionGroup);
  });

  // ==========================================================================
  // 3. MONUMENTAL ENTRANCE GATEWAY
  // ==========================================================================
  const gateGroup = new THREE.Group();
  gateGroup.name = 'EntranceGate';
  gateGroup.position.set(0, 0.5, 5.1);

  // Left & Right Monumental Gateposts
  const leftPost = createDetailedLog(0.38, 4.4);
  leftPost.position.set(-1.65, 2.2, 0);
  gateGroup.add(leftPost);

  const rightPost = createDetailedLog(0.38, 4.4);
  rightPost.position.set(1.65, 2.2, 0);
  gateGroup.add(rightPost);

  // Overhead Heavy Cross-Beam / Lintel
  const lintelLog = createDetailedLog(0.34, 4.2, true);
  lintelLog.position.set(0, 3.8, 0);
  gateGroup.add(lintelLog);

  // Top Spiked Barricade on Lintel
  for (let sx = -1.5; sx <= 1.5; sx += 0.5) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 4), darkIronMat);
    spike.position.set(sx, 4.2, 0);
    gateGroup.add(spike);
  }

  // --- TWO MONUMENTAL CURVED MAMMOTH TUSKS FLANKING GATE ---
  const leftTusk = createCurvedTusk(4.0, 1.4, 0.5, 0.26);
  leftTusk.position.set(-1.85, 0.2, 0.15);
  leftTusk.rotation.y = 0.35;
  gateGroup.add(leftTusk);

  const rightTusk = createCurvedTusk(4.0, 1.4, -0.5, 0.26);
  rightTusk.position.set(1.85, 0.2, 0.15);
  rightTusk.rotation.y = -0.35;
  gateGroup.add(rightTusk);

  // Tusk Iron Base Sockets
  const tuskSocketGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.6, 7);
  const leftSocket = new THREE.Mesh(tuskSocketGeo, darkIronMat);
  leftSocket.position.set(-1.85, 0.3, 0.15);
  gateGroup.add(leftSocket);

  const rightSocket = new THREE.Mesh(tuskSocketGeo, darkIronMat);
  rightSocket.position.set(1.85, 0.3, 0.15);
  gateGroup.add(rightSocket);

  // Horned Beast Skull Trophy mounted on lintel
  const gateSkull = createHornedSkull();
  gateSkull.position.set(0, 4.15, 0.35);
  gateSkull.scale.set(1.3, 1.3, 1.3);
  gateGroup.add(gateSkull);

  // Heavy Timber Double Gate Doors (Ajar)
  const doorPanelGeo = new THREE.BoxGeometry(1.45, 3.1, 0.16);
  const leftDoor = new THREE.Mesh(doorPanelGeo, barkMat);
  leftDoor.position.set(-0.85, 1.6, -0.15);
  leftDoor.rotation.y = 0.25;
  gateGroup.add(leftDoor);

  const rightDoor = new THREE.Mesh(doorPanelGeo, barkMat);
  rightDoor.position.set(0.85, 1.6, -0.15);
  rightDoor.rotation.y = -0.25;
  gateGroup.add(rightDoor);

  // Iron Studded Diagonal Braces on Doors
  const ironStrapGeo = new THREE.BoxGeometry(1.4, 0.12, 0.2);
  [-0.85, 0.85].forEach((dx, idx) => {
    const rot = idx === 0 ? 0.25 : -0.25;
    [0.6, 1.6, 2.6].forEach(sy => {
      const strap = new THREE.Mesh(ironStrapGeo, ironArmorMat);
      strap.position.set(dx, sy, -0.15);
      strap.rotation.y = rot;
      gateGroup.add(strap);
    });
  });

  // Hanging Forged Iron Lantern over Gate
  const lanternArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4), darkIronMat);
  lanternArm.position.set(0, 3.4, 0.5);
  lanternArm.rotation.x = Math.PI / 2;
  gateGroup.add(lanternArm);

  const lanternFrameGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.45, 6);
  const lanternGlass = new THREE.Mesh(lanternFrameGeo, windowMat);
  lanternGlass.position.set(0, 2.85, 0.9);
  gateGroup.add(lanternGlass);

  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.25, 6), darkIronMat);
  lanternCap.position.set(0, 3.15, 0.9);
  gateGroup.add(lanternCap);

  courtyardGroup.add(gateGroup);
  hall.add(courtyardGroup);

  // ==========================================================================
  // 4. MAIN LONGHOUSE STRONGHOLD (TWO TIER FORTRESS)
  // ==========================================================================
  const strongholdGroup = new THREE.Group();
  strongholdGroup.name = 'LonghouseStronghold';
  strongholdGroup.position.set(0, 0.5, -0.6);

  // --- Tier 1: Ground Floor Stronghold ---
  const t1Width = 8.2;
  const t1Depth = 7.4;
  const t1Height = 3.6;

  // Outer Log Walls (Notched Horizontal Logs)
  const numLogs = 8;
  const logLayerHeight = t1Height / numLogs;
  for (let i = 0; i < numLogs; i++) {
    const ly = (i + 0.5) * logLayerHeight;
    const isOdd = i % 2 === 0;

    // Front and Back horizontal logs
    const fbLog = createDetailedLog(0.24, t1Width + 0.6, true);
    fbLog.position.set(0, ly, t1Depth * 0.5);
    strongholdGroup.add(fbLog);

    const bbLog = createDetailedLog(0.24, t1Width + 0.6, true);
    bbLog.position.set(0, ly, -t1Depth * 0.5);
    strongholdGroup.add(bbLog);

    // Left and Right horizontal logs
    const lrGeo = new THREE.CylinderGeometry(0.24, 0.24, t1Depth + 0.6, 7);
    lrGeo.rotateX(Math.PI / 2);
    const lLog = new THREE.Mesh(lrGeo, barkMat);
    lLog.position.set(-t1Width * 0.5, ly, 0);
    strongholdGroup.add(lLog);

    const rLog = new THREE.Mesh(lrGeo, barkMat);
    rLog.position.set(t1Width * 0.5, ly, 0);
    strongholdGroup.add(rLog);
  }

  // Corner Joint Protruding Log Ends
  const cornerLogs = [
    [-t1Width * 0.5, -t1Depth * 0.5],
    [t1Width * 0.5, -t1Depth * 0.5],
    [-t1Width * 0.5, t1Depth * 0.5],
    [t1Width * 0.5, t1Depth * 0.5]
  ];
  cornerLogs.forEach(([cx, cz]) => {
    const post = createDetailedLog(0.34, t1Height + 0.4);
    post.position.set(cx, (t1Height + 0.4) * 0.5, cz);
    strongholdGroup.add(post);

    // Iron corner angle plate
    const anglePlate = new THREE.Mesh(new THREE.BoxGeometry(0.75, t1Height, 0.75), ironArmorMat);
    anglePlate.position.set(cx, t1Height * 0.5, cz);
    strongholdGroup.add(anglePlate);
  });

  // Glowing Multi-Pane Windows (Front and Sides)
  const windowGeo = new THREE.BoxGeometry(0.9, 1.1, 0.15);
  const winFrameGeo = new THREE.BoxGeometry(1.05, 1.25, 0.18);

  // Front Windows (Flanking Longhouse Entrance)
  [-2.2, 2.2].forEach(wx => {
    const wFrame = new THREE.Mesh(winFrameGeo, darkIronMat);
    wFrame.position.set(wx, 2.1, t1Depth * 0.5 + 0.08);
    strongholdGroup.add(wFrame);

    const win = new THREE.Mesh(windowGeo, windowMat);
    win.position.set(wx, 2.1, t1Depth * 0.5 + 0.1);
    strongholdGroup.add(win);

    // Iron cross grille
    const vGrille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.22), darkIronMat);
    vGrille.position.set(wx, 2.1, t1Depth * 0.5 + 0.1);
    strongholdGroup.add(vGrille);
    const hGrille = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.22), darkIronMat);
    hGrille.position.set(wx, 2.1, t1Depth * 0.5 + 0.1);
    strongholdGroup.add(hGrille);
  });

  // Flank Windows (Left & Right Walls)
  [-t1Width * 0.5 - 0.08, t1Width * 0.5 + 0.08].forEach((wx, idx) => {
    const rotY = Math.PI / 2;
    [-1.2, 1.2].forEach(wz => {
      const wFrame = new THREE.Mesh(winFrameGeo, darkIronMat);
      wFrame.position.set(wx, 2.1, wz);
      wFrame.rotation.y = rotY;
      strongholdGroup.add(wFrame);

      const win = new THREE.Mesh(windowGeo, windowMat);
      win.position.set(wx, 2.1, wz);
      win.rotation.y = rotY;
      strongholdGroup.add(win);
    });
  });

  // Ground Floor Entrance Arch & Doorway
  const doorHole = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 0.3), darkIronMat);
  doorHole.position.set(0, 1.3, t1Depth * 0.5 + 0.05);
  strongholdGroup.add(doorHole);

  const doorPlanks = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.4, 0.18), barkMat);
  doorPlanks.position.set(0, 1.3, t1Depth * 0.5 + 0.1);
  strongholdGroup.add(doorPlanks);

  // Door Tusks
  [-0.9, 0.9].forEach(tx => {
    const smallTusk = createCurvedTusk(1.8, 0.6, tx > 0 ? -0.2 : 0.2, 0.14);
    smallTusk.position.set(tx, 0.2, t1Depth * 0.5 + 0.2);
    strongholdGroup.add(smallTusk);
  });

  // --- Tier 2: Recessed Upper Fortress & Mezzanine ---
  const t2Width = 6.4;
  const t2Depth = 5.8;
  const t2Height = 2.4;
  const t2BaseY = t1Height;

  const upperWalls = new THREE.Mesh(new THREE.BoxGeometry(t2Width, t2Height, t2Depth), barkMat);
  upperWalls.position.set(0, t2BaseY + t2Height * 0.5, 0);
  strongholdGroup.add(upperWalls);

  // Cross-Timber Bracing on Upper Story
  [-t2Width * 0.5, t2Width * 0.5].forEach(x => {
    const braceGeo = new THREE.BoxGeometry(0.18, 0.18, t2Depth * 1.1);
    braceGeo.rotateX(0.45);
    const brace = new THREE.Mesh(braceGeo, darkIronMat);
    brace.position.set(x, t2BaseY + t2Height * 0.5, 0);
    strongholdGroup.add(brace);
  });

  // Upper Mezzanine Front Balcony & Lookout
  const balconyFloor = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 1.4), barkMat);
  balconyFloor.position.set(0, t2BaseY + 0.1, t2Depth * 0.5 + 0.6);
  strongholdGroup.add(balconyFloor);

  // Spiked balcony railing
  for (let bx = -1.6; bx <= 1.6; bx += 0.4) {
    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 4), darkIronMat);
    spk.position.set(bx, t2BaseY + 0.55, t2Depth * 0.5 + 1.25);
    strongholdGroup.add(spk);
  }

  // Upper Story Glowing Window
  const upperWin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.1), windowMat);
  upperWin.position.set(0, t2BaseY + 1.4, t2Depth * 0.5 + 0.05);
  strongholdGroup.add(upperWin);

  // ==========================================================================
  // 5. PITCHED SPLIT-LOG ROOF WITH RIVETED IRON ARMOR PLATES
  // ==========================================================================
  const roofGroup = new THREE.Group();
  roofGroup.name = 'IroncladRoof';
  roofGroup.position.set(0, t2BaseY + t2Height, 0);

  const roofPitchAngle = 0.65; // ~37 degrees
  const roofSlopeLength = 4.8;
  const roofWidth = t2Depth + 1.6;

  // Left & Right Sloping Roof Decks (True A-Frame Pitched Roof)
  [-1, 1].forEach(side => {
    const slopeGroup = new THREE.Group();
    slopeGroup.position.set(side * 1.85, 1.45, 0);
    slopeGroup.rotation.z = -side * roofPitchAngle;

    // Timber underlayment
    const deck = new THREE.Mesh(new THREE.BoxGeometry(roofSlopeLength, 0.22, roofWidth), ironRoofMat);
    slopeGroup.add(deck);

    // Overlapping riveted iron armor plates
    const numPlates = 4;
    for (let p = 0; p < numPlates; p++) {
      const px = -roofSlopeLength * 0.5 + (p + 0.5) * (roofSlopeLength / numPlates);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(roofSlopeLength / numPlates * 0.96, 0.06, roofWidth + 0.1), ironArmorMat);
      plate.position.set(px, 0.14, 0);
      slopeGroup.add(plate);

      // Rivet rows on armor plates
      addRivetLine(
        slopeGroup,
        new THREE.Vector3(px, 0.18, -roofWidth * 0.45),
        new THREE.Vector3(px, 0.18, roofWidth * 0.45),
        5,
        0.04
      );
    }

    roofGroup.add(slopeGroup);
  });

  // Heavy Timber Ridge Beam sitting at the apex
  const ridgeLog = createDetailedLog(0.34, roofWidth + 0.4);
  ridgeLog.position.set(0, 2.45, 0);
  ridgeLog.rotation.x = Math.PI / 2;
  roofGroup.add(ridgeLog);

  // --- FRONT & REAR TIMBER GABLE WALLS (CLOSING ROOF A-FRAME TRIANGLE) ---
  function createGableWall(zPos, isFront) {
    const gableGroup = new THREE.Group();
    gableGroup.name = isFront ? 'FrontGableWall' : 'RearGableWall';
    gableGroup.position.set(0, 0, zPos);
    if (!isFront) {
      gableGroup.rotation.y = Math.PI;
    }

    // 1. Solid timber backing shape (closes triangle completely with zero gaps)
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-3.20, -0.05);
    gableShape.lineTo(3.20, -0.05);
    gableShape.lineTo(3.20, 0.35);
    gableShape.lineTo(0, 2.72);
    gableShape.lineTo(-3.20, 0.35);
    gableShape.closePath();

    const extrudeSettings = {
      depth: 0.22,
      bevelEnabled: false
    };
    const backingGeo = new THREE.ExtrudeGeometry(gableShape, extrudeSettings);
    const backingMesh = new THREE.Mesh(backingGeo, barkMat);
    backingMesh.position.z = -0.22;
    gableGroup.add(backingMesh);

    // 2. Stacked horizontal round logs for rich 3D relief
    const logLevels = [
      { y: 0.25, w: 6.1 },
      { y: 0.65, w: 5.1 },
      { y: 1.05, w: 4.1 },
      { y: 1.45, w: 3.1 },
      { y: 1.85, w: 2.1 },
      { y: 2.25, w: 1.1 }
    ];

    logLevels.forEach(lvl => {
      const hLog = createDetailedLog(0.16, lvl.w, true);
      hLog.position.set(0, lvl.y, 0.08);
      gableGroup.add(hLog);
    });

    // 3. Heavy timber diagonal bargeboards / rafter trims along the roof slope
    [-1, 1].forEach(side => {
      const trimGeo = new THREE.BoxGeometry(3.9, 0.18, 0.28);
      const trimMesh = new THREE.Mesh(trimGeo, barkMat);
      trimMesh.position.set(side * 1.60, 1.54, 0.12);
      trimMesh.rotation.z = -side * roofPitchAngle;
      gableGroup.add(trimMesh);

      // Iron strapping on bargeboards
      const strapGeo = new THREE.BoxGeometry(0.45, 0.22, 0.30);
      [-1.2, 0.1, 1.3].forEach(tPos => {
        const strap = new THREE.Mesh(strapGeo, ironArmorMat);
        strap.position.set(
          side * 1.60 + (tPos * Math.cos(roofPitchAngle) * side),
          1.54 - tPos * Math.sin(roofPitchAngle),
          0.12
        );
        strap.rotation.z = -side * roofPitchAngle;
        gableGroup.add(strap);
      });
    });

    // 4. Center vertical king post & reinforcements
    const kingPost = createDetailedLog(0.18, 2.45);
    kingPost.position.set(0, 1.25, 0.14);
    gableGroup.add(kingPost);

    if (isFront) {
      // Front Attic Vent / Horde Iron Boss
      const ventFrame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.18), darkIronMat);
      ventFrame.position.set(0, 1.35, 0.22);
      ventFrame.rotation.z = Math.PI / 4; // Diamond
      gableGroup.add(ventFrame);

      const ventGlow = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.54, 0.12), windowMat);
      ventGlow.position.set(0, 1.35, 0.24);
      ventGlow.rotation.z = Math.PI / 4;
      gableGroup.add(ventGlow);

      // Iron grate cross bars
      const gBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.65, 0.22), darkIronMat);
      gBar1.position.set(0, 1.35, 0.25);
      gableGroup.add(gBar1);
      const gBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 0.22), darkIronMat);
      gBar2.position.set(0, 1.35, 0.25);
      gableGroup.add(gBar2);
    } else {
      // Rear Iron Cross Bracing
      const rStrap1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.14), darkIronMat);
      rStrap1.position.set(0, 1.25, 0.15);
      rStrap1.rotation.z = 0.52;
      gableGroup.add(rStrap1);
      const rStrap2 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.14), darkIronMat);
      rStrap2.position.set(0, 1.25, 0.15);
      rStrap2.rotation.z = -0.52;
      gableGroup.add(rStrap2);
    }

    return gableGroup;
  }

  const frontGable = createGableWall(t2Depth * 0.5, true);
  roofGroup.add(frontGable);

  const rearGable = createGableWall(-t2Depth * 0.5, false);
  roofGroup.add(rearGable);

  // --- CURVED BONE HORNS ALONG ROOF RIDGE (DRAGON SPINE) ---
  const numSpineHorns = 7;
  for (let h = 0; h < numSpineHorns; h++) {
    const hz = -roofWidth * 0.42 + (h / (numSpineHorns - 1)) * roofWidth * 0.84;
    const hornH = 1.1 + (Math.sin(h / (numSpineHorns - 1) * Math.PI) * 0.6);
    const horn = createCurvedTusk(hornH, 0.4, (h % 2 === 0 ? 0.2 : -0.2), 0.14);
    horn.position.set(0, 2.65, hz);
    roofGroup.add(horn);
  }


  // --- 2 TALL SPEAR FLAGPOLES WITH CRIMSON HORDE WAR BANNERS ---
  const bannerGroup = new THREE.Group();
  bannerGroup.name = 'Anim_WarBanners';

  [
    { x: -1.8, z: roofWidth * 0.42, angle: 0.15 },
    { x: 1.8, z: roofWidth * 0.42, angle: -0.15 }
  ].forEach((cfg, idx) => {
    const poleGroup = new THREE.Group();
    poleGroup.name = `Anim_WarBanner_${idx}`;
    poleGroup.position.set(cfg.x, 2.6, cfg.z);
    poleGroup.rotation.z = cfg.angle;

    // Tall spear pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.8, 6), darkIronMat);
    pole.position.y = 2.4;
    poleGroup.add(pole);

    // Spearhead tip
    const spearHead = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.65, 4), darkIronMat);
    spearHead.position.y = 4.8 + 0.3;
    poleGroup.add(spearHead);

    // Tattered crimson war banner cloth
    const bannerGeo = new THREE.PlaneGeometry(1.2, 2.4, 5, 8);
    const cloth = new THREE.Mesh(bannerGeo, bannerMat);
    cloth.position.set(0.65, 3.4, 0.05);
    poleGroup.add(cloth);

    poleGroup.userData.clothMesh = cloth;
    bannerGroup.add(poleGroup);
  });

  roofGroup.add(bannerGroup);
  strongholdGroup.add(roofGroup);

  // ==========================================================================
  // 6. VOLCANIC BASALT STONE CHIMNEY STACK (REAR / FLANK)
  // ==========================================================================
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'BasaltChimney';
  chimneyGroup.position.set(-3.2, 0, -2.4);

  // Stepped square stone chimney stack
  const chBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.0, 1.5), stoneMat);
  chBase.position.y = 2.0;
  chimneyGroup.add(chBase);

  const chMid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 3.6, 1.25), stoneMat);
  chMid.position.y = 5.6;
  chimneyGroup.add(chMid);

  const chTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.4, 1.0), stoneMat);
  chTop.position.y = 8.2;
  chimneyGroup.add(chTop);

  // Iron Chimney Bands
  [3.8, 6.8, 9.1].forEach(cy => {
    const cBand = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 1.35), darkIronMat);
    cBand.position.y = cy;
    chimneyGroup.add(cBand);
  });

  // Exhaust flue opening & iron cowl
  const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), darkIronMat);
  cowl.position.y = 9.7;
  chimneyGroup.add(cowl);

  strongholdGroup.add(chimneyGroup);

  // ==========================================================================
  // 7. COURTYARD MICRO-PROPS (WEAPONS, SHIELDS, SPARK BARRELS)
  // ==========================================================================
  const propsGroup = new THREE.Group();
  propsGroup.name = 'MicroProps';

  // Weapon Rack (Left Courtyard)
  const rackGroup = new THREE.Group();
  rackGroup.position.set(-3.8, 0, 2.6);
  rackGroup.rotation.y = 0.45;

  const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.25), barkMat);
  rackFrame.position.y = 0.7;
  rackGroup.add(rackFrame);

  // Racked Spears and Halberds
  for (let rx = -0.8; rx <= 0.8; rx += 0.4) {
    const spearShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), darkIronMat);
    spearShaft.position.set(rx, 1.1, 0.15);
    spearShaft.rotation.z = -0.08;
    rackGroup.add(spearShaft);

    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), darkIronMat);
    spearTip.position.set(rx - 0.08, 2.3, 0.15);
    rackGroup.add(spearTip);
  }
  propsGroup.add(rackGroup);

  // Spiked Round War Shields Leaning on Wall
  const shieldGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.1, 8);
  shieldGeo.rotateX(Math.PI / 2);
  const bossGeo = new THREE.ConeGeometry(0.2, 0.3, 6);
  bossGeo.rotateX(Math.PI / 2);

  [
    { x: 3.8, z: 2.8, rotY: -0.35 },
    { x: 4.4, z: 2.2, rotY: -0.7 }
  ].forEach(scfg => {
    const sGroup = new THREE.Group();
    sGroup.position.set(scfg.x, 0.55, scfg.z);
    sGroup.rotation.y = scfg.rotY;
    sGroup.rotation.x = -0.15;

    const shieldBody = new THREE.Mesh(shieldGeo, bloodIronMat);
    sGroup.add(shieldBody);

    const boss = new THREE.Mesh(bossGeo, darkIronMat);
    boss.position.z = 0.12;
    sGroup.add(boss);

    propsGroup.add(sGroup);
  });

  strongholdGroup.add(propsGroup);
  hall.add(strongholdGroup);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(hall);
}
