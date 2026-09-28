import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcSplitRoofTextures,
  getOrcSpikedIronTextures
} from './orcTextures.js';

/**
 * Next-Gen AAA Stylized Orc Lumber Mill (Serraria Industrial da Horda)
 * Faithfully matches the middle right building in modeloorcs.png.
 *
 * Visual Features:
 * - Heavy timber staging platform raised on round log pilings with forged iron brackets.
 * - Open A-frame split-log shelter clad in riveted dark iron armor plates with outward spikes.
 * - Giant spinning vertical circular saw blade (Anim_SawBlade) with jagged teeth on an iron axle.
 * - Heavy cutting carriage trestle slicing a master hardwood tree trunk.
 * - Mounds of golden sawdust, shavings, and flying wood chips.
 * - Heavy timber derrick boom crane on the right with iron pulleys, tension cables, and grapple hook.
 * - Pyramidal stack of freshly felled logs with bark and cut end-grain growth rings.
 * - Tree stump chopping block with embedded broadaxe and split firewood billets.
 *
 * @returns {THREE.Group}
 */
export function createOrcLumberMill() {
  const mill = new THREE.Group();
  mill.name = 'OrcLumberMill';

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

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x3c4350,
    roughness: 0.35,
    metalness: 0.85,
    flatShading: true
  });

  const sawSteelMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    roughness: 0.2,
    metalness: 0.95,
    flatShading: true
  });

  const sawdustMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.9,
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
  // 2. RAISED TIMBER STAGING PLATFORM
  // ==========================================================================
  const platWidth = 8.4;
  const platDepth = 7.8;
  const platH = 0.45;

  const platform = new THREE.Mesh(new THREE.BoxGeometry(platWidth, platH, platDepth), barkMat);
  platform.position.set(0, platH * 0.5, 0);
  mill.add(platform);

  // Decorative iron deck straps with rivets
  [-platWidth * 0.35, 0, platWidth * 0.35].forEach(sx => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, platDepth + 0.1), darkIronMat);
    strap.position.set(sx, platH + 0.02, 0);
    mill.add(strap);
  });

  // Log Support Pilings around perimeter
  const pilingCoords = [
    [-platWidth * 0.46, -platDepth * 0.46],
    [platWidth * 0.46, -platDepth * 0.46],
    [-platWidth * 0.46, platDepth * 0.46],
    [platWidth * 0.46, platDepth * 0.46],
    [-platWidth * 0.46, 0],
    [platWidth * 0.46, 0]
  ];

  pilingCoords.forEach(([px, pz]) => {
    const post = createDetailedLog(0.24, 0.9);
    post.position.set(px, 0.25, pz);
    mill.add(post);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 8), darkIronMat);
    band.position.set(px, 0.35, pz);
    mill.add(band);
  });

  // ==========================================================================
  // 3. OPEN A-FRAME SPLIT-LOG SHELTER WITH IRON ARMOR
  // ==========================================================================
  const shelterGroup = new THREE.Group();
  shelterGroup.name = 'SawmillShelter';
  shelterGroup.position.set(-1.2, platH, 0);

  // 4 Massive Upright Log Columns
  const colCoords = [
    [-1.8, -2.4],
    [1.8, -2.4],
    [-1.8, 2.4],
    [1.8, 2.4]
  ];

  colCoords.forEach(([cx, cz]) => {
    const col = createDetailedLog(0.26, 3.6);
    col.position.set(cx, 1.8, cz);
    shelterGroup.add(col);

    // Iron Base Gussets
    const gusset = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 4), darkIronMat);
    gusset.position.set(cx, 0.25, cz);
    shelterGroup.add(gusset);
  });

  // Horizontal Cross-Beams
  const b1 = createDetailedLog(0.22, 3.8, true);
  b1.position.set(0, 3.4, -2.4);
  shelterGroup.add(b1);

  const b2 = createDetailedLog(0.22, 3.8, true);
  b2.position.set(0, 3.4, 2.4);
  shelterGroup.add(b2);

  // Pitched Slanted Roof Decks (A-Frame)
  const roofSlopeLen = 3.6;
  const roofDepth = 5.6;
  const pitchAngle = 0.62; // ~35.5 degrees

  [-1, 1].forEach(side => {
    const slope = new THREE.Group();
    slope.position.set(side * 1.46, 4.27, 0);
    slope.rotation.z = -side * pitchAngle;

    // Split-log deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(roofSlopeLen, 0.18, roofDepth), ironRoofMat);
    slope.add(deck);

    // Riveted dark iron armor plates
    for (let p = 0; p < 3; p++) {
      const px = -roofSlopeLen * 0.4 + p * (roofSlopeLen * 0.4);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(roofSlopeLen * 0.35, 0.05, roofDepth + 0.15), ironArmorMat);
      plate.position.set(px, 0.12, 0);
      slope.add(plate);
    }

    shelterGroup.add(slope);
  });

  // Roof Ridge Beam & Protruding Spikes
  const ridge = createDetailedLog(0.26, roofDepth + 0.6);
  ridge.position.set(0, 4.85, 0);
  ridge.rotation.x = Math.PI / 2;
  shelterGroup.add(ridge);

  // Spikes on Roof Ridge
  for (let rz = -2.2; rz <= 2.2; rz += 0.8) {
    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 4), darkIronMat);
    spk.position.set(0, 5.25, rz);
    shelterGroup.add(spk);
  }


  mill.add(shelterGroup);

  // ==========================================================================
  // 4. CUTTING TRESTLE & ANIMATED SAW BLADE (Anim_SawBlade)
  // ==========================================================================
  const trestleGroup = new THREE.Group();
  trestleGroup.name = 'SawTrestle';
  trestleGroup.position.set(-1.2, platH, 0);

  // Heavy Trestle Timber Bed
  const bedGeo = new THREE.BoxGeometry(1.6, 0.6, 4.6);
  const bed = new THREE.Mesh(bedGeo, barkMat);
  bed.position.set(0, 0.3, 0);
  trestleGroup.add(bed);

  // Iron Guide Rails
  [-0.6, 0.6].forEach(gx => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 4.6), darkIronMat);
    rail.position.set(gx, 0.65, 0);
    trestleGroup.add(rail);
  });

  // Master Hardwood Trunk being sliced
  const masterLog = createDetailedLog(0.38, 4.2);
  masterLog.position.set(0, 0.88, 0);
  masterLog.rotation.x = Math.PI / 2;
  trestleGroup.add(masterLog);

  // Slice Cut Groove in Log
  const cutGroove = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 1.2), darkIronMat);
  cutGroove.position.set(0, 0.88, 0.4);
  trestleGroup.add(cutGroove);

  // Iron Axle Mounting Blocks
  [-0.65, 0.65].forEach(ax => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.5), darkIronMat);
    block.position.set(ax, 0.7, 0.4);
    trestleGroup.add(block);
  });

  // --- THE GIANT SPINNING CIRCULAR SAW BLADE (Anim_SawBlade) ---
  const sawGroup = new THREE.Group();
  sawGroup.name = 'Anim_SawBlade';
  sawGroup.position.set(0, 1.6, 0.4);

  // Central Iron Axle
  const axleGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8);
  axleGeo.rotateZ(Math.PI / 2);
  const axle = new THREE.Mesh(axleGeo, darkIronMat);
  sawGroup.add(axle);

  // Heavy Saw Blade Disc (Perpendicular to Z axis, rotates on X)
  // We orient the disc geometry in YZ plane (normal pointing along X)
  const discGeo = new THREE.CylinderGeometry(1.35, 1.35, 0.06, 24);
  discGeo.rotateZ(Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, sawSteelMat);
  sawGroup.add(disc);

  // Secondary Reinforcing Hub Plate
  const hubGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, darkIronMat);
  sawGroup.add(hub);

  // Jagged Triangular Cutting Teeth around blade circumference
  const numTeeth = 18;
  for (let t = 0; t < numTeeth; t++) {
    const angle = (t / numTeeth) * Math.PI * 2;
    const toothGeo = new THREE.ConeGeometry(0.16, 0.38, 3);
    const tooth = new THREE.Mesh(toothGeo, sawSteelMat);
    tooth.position.set(0, Math.sin(angle) * 1.35, Math.cos(angle) * 1.35);
    tooth.rotation.x = -angle + Math.PI * 0.5 + 0.35; // aggressive rake angle
    sawGroup.add(tooth);
  }

  trestleGroup.add(sawGroup);

  // Piles of Sawdust underneath saw
  const dust1 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.45, 8), sawdustMat);
  dust1.position.set(0.2, 0.1, 0.4);
  trestleGroup.add(dust1);

  const dust2 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.35, 7), sawdustMat);
  dust2.position.set(-0.3, 0.08, 0.8);
  trestleGroup.add(dust2);

  mill.add(trestleGroup);

  // ==========================================================================
  // 5. TIMBER DERRICK BOOM CRANE (RIGHT SIDE)
  // ==========================================================================
  const craneGroup = new THREE.Group();
  craneGroup.name = 'DerrickCrane';
  craneGroup.position.set(2.6, platH, -1.2);

  // Iron Turntable Base
  const basePivot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.35, 8), darkIronMat);
  basePivot.position.y = 0.18;
  craneGroup.add(basePivot);

  // Vertical Mast Log
  const mast = createDetailedLog(0.22, 3.4);
  mast.position.y = 1.7;
  craneGroup.add(mast);

  // Angled Boom Pole
  const boom = createDetailedLog(0.18, 3.8);
  boom.position.set(0.9, 2.6, 0.6);
  boom.rotation.z = -0.65;
  boom.rotation.y = 0.35;
  craneGroup.add(boom);

  // Rigging Tension Cables & Pulley
  const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4);
  const cable = new THREE.Mesh(cableGeo, darkIronMat);
  cable.position.set(0.75, 3.4, 0.4);
  cable.rotation.z = 0.75;
  craneGroup.add(cable);

  // Crane Pulley Wheel & Grapple Hook
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), darkIronMat);
  pulley.position.set(2.1, 3.7, 1.2);
  pulley.rotation.x = Math.PI / 2;
  craneGroup.add(pulley);

  // Hanging Iron Hook
  const hookChain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4), darkIronMat);
  hookChain.position.set(2.1, 2.8, 1.2);
  craneGroup.add(hookChain);

  const hookGeo = new THREE.TorusGeometry(0.22, 0.06, 6, 8, Math.PI * 1.3);
  const hook = new THREE.Mesh(hookGeo, darkIronMat);
  hook.position.set(2.1, 2.0, 1.2);
  hook.rotation.z = Math.PI * 0.8;
  craneGroup.add(hook);

  mill.add(craneGroup);

  // ==========================================================================
  // 6. PYRAMIDAL LOG STACK & CHOPPING STUMP
  // ==========================================================================
  const yardGroup = new THREE.Group();
  yardGroup.name = 'LogYard';
  yardGroup.position.set(2.4, platH, 1.4);

  // Pyramidal Log Stack (Harvested Timber)
  const logLen = 3.2;
  const logRadius = 0.22;

  // Base tier: 3 logs
  for (let i = 0; i < 3; i++) {
    const l = createDetailedLog(logRadius, logLen);
    l.position.set(0, logRadius, (i - 1) * logRadius * 2.1);
    l.rotation.x = Math.PI / 2;
    yardGroup.add(l);
  }
  // Second tier: 2 logs
  for (let i = 0; i < 2; i++) {
    const l = createDetailedLog(logRadius, logLen);
    l.position.set(0, logRadius * 2.8, (i - 0.5) * logRadius * 2.1);
    l.rotation.x = Math.PI / 2;
    yardGroup.add(l);
  }
  // Top tier: 1 log
  const topLog = createDetailedLog(logRadius, logLen);
  topLog.position.set(0, logRadius * 4.6, 0);
  topLog.rotation.x = Math.PI / 2;
  yardGroup.add(topLog);

  // Tree Stump Chopping Block with Broadaxe
  const stump = createDetailedLog(0.36, 0.65);
  stump.position.set(-0.2, 0.32, 1.8);
  yardGroup.add(stump);

  const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.04), darkIronMat);
  axeBlade.position.set(-0.2, 0.72, 1.8);
  axeBlade.rotation.z = 0.25;
  yardGroup.add(axeBlade);

  const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 5), barkMat);
  axeHandle.position.set(-0.1, 0.95, 1.8);
  axeHandle.rotation.z = 0.7;
  yardGroup.add(axeHandle);

  mill.add(yardGroup);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(mill);
}
