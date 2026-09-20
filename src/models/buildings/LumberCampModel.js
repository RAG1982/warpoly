import * as THREE from 'three';
import { materials, enableShadows } from '../materials.js';
import {
  getLogBarkTextures,
  getLogEndTextures,
  getMilledTimberTextures,
  getRoofShingleTextures,
  getSawBladeTextures,
  getAxeAndToolsTextures,
  getSawdustTextures,
  getLanternTextures
} from './lumberCampTextures.js';

/**
 * Creates the Next-Gen Stylized Low-Poly Lumber Camp (Serraria) model
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Key features:
 * - Active medieval woodland logging mill on a raised timber staging platform
 * - Open-air heavy timber frame shelter with pitched cedar shake shingle roof & carved finials
 * - Mechanical saw trestle with giant toothed circular saw blade cutting through a master trunk
 * - Pyramidal stack of freshly harvested logs with detailed bark and end-grain growth rings
 * - Stacks of stickered planed yellow pine lumber boards seasoning in the finished depot
 * - Massive chopping block with embedded broad axe, split billets, and scattered wood chips
 * - Piles of golden pine sawdust, two-man crosscut saw, water quench tub, and glowing iron lantern
 * - Fits within ~7.5 x 7.2 game grid footprint with collision radius ~3.2
 *
 * @returns {THREE.Group}
 */
export function createLumberCamp() {
  const camp = new THREE.Group();
  camp.name = 'LumberCamp';

  // --- 1. PBR Material Helper & Initialization ---
  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 1.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const barkMat = createPBRMaterial(getLogBarkTextures(), { bumpScale: 0.08 });
  const logEndMat = createPBRMaterial(getLogEndTextures(), { bumpScale: 0.06 });
  const milledTimberMat = createPBRMaterial(getMilledTimberTextures(), { bumpScale: 0.05 });
  const roofShingleMat = createPBRMaterial(getRoofShingleTextures(), { bumpScale: 0.07 });
  const sawBladeMat = createPBRMaterial(getSawBladeTextures(), { bumpScale: 0.04 });
  const axeToolsMat = createPBRMaterial(getAxeAndToolsTextures(), { bumpScale: 0.05 });
  const sawdustMat = createPBRMaterial(getSawdustTextures(), { bumpScale: 0.04 });

  const lanternTex = getLanternTextures();
  const lanternMat = new THREE.MeshStandardMaterial({
    map: lanternTex.map,
    roughnessMap: lanternTex.roughnessMap,
    metalnessMap: lanternTex.metalnessMap,
    emissiveMap: lanternTex.emissiveMap,
    emissive: 0xffaa22,
    emissiveIntensity: 1.8,
    roughness: 0.35,
    metalness: 0.3
  });

  // Solid accent materials
  const forgedIronMat = new THREE.MeshStandardMaterial({
    color: 0x22262c,
    roughness: 0.45,
    metalness: 0.85,
    flatShading: true
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf5b81a,
    roughness: 0.25,
    metalness: 0.85,
    flatShading: true
  });

  const bannerClothMat = new THREE.MeshStandardMaterial({
    color: 0x2b5876,
    roughness: 0.65,
    flatShading: true
  });

  const stoneFootingMat = materials.stoneDark || new THREE.MeshStandardMaterial({
    color: 0x5a6065,
    roughness: 0.9,
    flatShading: true
  });

  // ==========================================================================
  // 2. RAISED TIMBER STAGING PLATFORM (MILL DECK)
  // ==========================================================================
  const platformGroup = new THREE.Group();
  platformGroup.name = 'StagingPlatform';

  const deckWidth = 4.8;
  const deckDepth = 4.2;
  const deckY = 0.38;
  const deckThickness = 0.16;
  const deckCenter = { x: -0.15, z: -0.15 };

  // A. Main Planking Deck
  const deckPlankGeo = new THREE.BoxGeometry(deckWidth, deckThickness, deckDepth);
  const deckMesh = new THREE.Mesh(deckPlankGeo, milledTimberMat);
  deckMesh.position.set(deckCenter.x, deckY, deckCenter.z);
  platformGroup.add(deckMesh);

  // Decorative plank divider grooves across deck
  const numGrooves = 9;
  for (let g = 0; g <= numGrooves; g++) {
    const gz = deckCenter.z - deckDepth * 0.5 + (g / numGrooves) * deckDepth;
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(deckWidth + 0.04, 0.02, 0.04),
      forgedIronMat
    );
    groove.position.set(deckCenter.x, deckY + deckThickness * 0.5 + 0.005, gz);
    platformGroup.add(groove);
  }

  // B. Longitudinal Heavy Support Girders (Floor Beams)
  const girderGeo = new THREE.BoxGeometry(deckWidth + 0.2, 0.22, 0.2);
  const girderFront = new THREE.Mesh(girderGeo, milledTimberMat);
  girderFront.position.set(deckCenter.x, deckY - 0.14, deckCenter.z + deckDepth * 0.46);
  platformGroup.add(girderFront);

  const girderMid = new THREE.Mesh(girderGeo, milledTimberMat);
  girderMid.position.set(deckCenter.x, deckY - 0.14, deckCenter.z);
  platformGroup.add(girderMid);

  const girderRear = new THREE.Mesh(girderGeo, milledTimberMat);
  girderRear.position.set(deckCenter.x, deckY - 0.14, deckCenter.z - deckDepth * 0.46);
  platformGroup.add(girderRear);

  // C. Sturdy Round Log Pilings / Footings
  const pileGeo = new THREE.CylinderGeometry(0.18, 0.2, deckY + 0.05, 8);
  const pilePositions = [
    [deckCenter.x - deckWidth * 0.46, deckCenter.z - deckDepth * 0.46],
    [deckCenter.x + deckWidth * 0.46, deckCenter.z - deckDepth * 0.46],
    [deckCenter.x - deckWidth * 0.46, deckCenter.z + deckDepth * 0.46],
    [deckCenter.x + deckWidth * 0.46, deckCenter.z + deckDepth * 0.46],
    [deckCenter.x - deckWidth * 0.46, deckCenter.z],
    [deckCenter.x + deckWidth * 0.46, deckCenter.z],
    [deckCenter.x, deckCenter.z - deckDepth * 0.46],
    [deckCenter.x, deckCenter.z + deckDepth * 0.46]
  ];

  pilePositions.forEach(([px, pz]) => {
    // Stone footing pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.12, 7), stoneFootingMat);
    pad.position.set(px, 0.06, pz);
    platformGroup.add(pad);

    // Wood piling
    const pile = new THREE.Mesh(pileGeo, barkMat);
    pile.position.set(px, (deckY + 0.05) * 0.5, pz);
    platformGroup.add(pile);

    // Iron collar band
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 8), forgedIronMat);
    collar.position.set(px, deckY - 0.04, pz);
    platformGroup.add(collar);
  });

  // D. Sturdy Stepped Timber Access Ramp (Front Entrance)
  const stepGeo1 = new THREE.BoxGeometry(1.6, 0.14, 0.45);
  const step1 = new THREE.Mesh(stepGeo1, milledTimberMat);
  step1.position.set(deckCenter.x, 0.14 * 0.5, deckCenter.z + deckDepth * 0.5 + 0.45 * 0.5);
  platformGroup.add(step1);

  const stepGeo2 = new THREE.BoxGeometry(1.6, 0.26, 0.45);
  const step2 = new THREE.Mesh(stepGeo2, milledTimberMat);
  step2.position.set(deckCenter.x, 0.26 * 0.5, deckCenter.z + deckDepth * 0.5 + 0.45 * 0.5 - 0.22);
  platformGroup.add(step2);

  camp.add(platformGroup);

  // ==========================================================================
  // 3. OPEN-AIR TIMBER FRAME SHELTER (SAW SHED)
  // ==========================================================================
  const shelterGroup = new THREE.Group();
  shelterGroup.name = 'ShelterFrame';

  const colH = 2.7;
  const colSize = 0.26;
  const colBaseY = deckY + deckThickness * 0.5;

  const colCoords = [
    { x: deckCenter.x - deckWidth * 0.44, z: deckCenter.z - deckDepth * 0.43 }, // Rear Left
    { x: deckCenter.x + deckWidth * 0.41, z: deckCenter.z - deckDepth * 0.43 }, // Rear Right
    { x: deckCenter.x - deckWidth * 0.44, z: deckCenter.z + deckDepth * 0.43 }, // Front Left
    { x: deckCenter.x + deckWidth * 0.41, z: deckCenter.z + deckDepth * 0.43 }  // Front Right
  ];

  const colGeo = new THREE.BoxGeometry(colSize, colH, colSize);
  const ironShoeGeo = new THREE.BoxGeometry(colSize + 0.06, 0.14, colSize + 0.06);

  colCoords.forEach(({ x, z }) => {
    // Timber column
    const col = new THREE.Mesh(colGeo, milledTimberMat);
    col.position.set(x, colBaseY + colH * 0.5, z);
    shelterGroup.add(col);

    // Forged iron base shoe
    const shoe = new THREE.Mesh(ironShoeGeo, forgedIronMat);
    shoe.position.set(x, colBaseY + 0.07, z);
    shelterGroup.add(shoe);

    // Iron capital bracket at top
    const cap = new THREE.Mesh(ironShoeGeo, forgedIronMat);
    cap.position.set(x, colBaseY + colH - 0.07, z);
    shelterGroup.add(cap);
  });

  // Longitudinal Tie Beams (running front-to-back atop columns)
  const longBeamLen = deckDepth + 0.4;
  const beamCross = 0.24;
  const beamY = colBaseY + colH;
  const beamGeoLong = new THREE.BoxGeometry(beamCross, beamCross, longBeamLen);

  const beamLeft = new THREE.Mesh(beamGeoLong, milledTimberMat);
  beamLeft.position.set(deckCenter.x - deckWidth * 0.44, beamY, deckCenter.z);
  shelterGroup.add(beamLeft);

  const beamRight = new THREE.Mesh(beamGeoLong, milledTimberMat);
  beamRight.position.set(deckCenter.x + deckWidth * 0.41, beamY, deckCenter.z);
  shelterGroup.add(beamRight);

  // Transverse Tie Beams (spanning left-to-right)
  const transBeamLen = deckWidth + 0.5;
  const beamGeoTrans = new THREE.BoxGeometry(transBeamLen, beamCross, beamCross);

  const beamRear = new THREE.Mesh(beamGeoTrans, milledTimberMat);
  beamRear.position.set(deckCenter.x - 0.015, beamY + 0.04, deckCenter.z - deckDepth * 0.43);
  shelterGroup.add(beamRear);

  const beamFront = new THREE.Mesh(beamGeoTrans, milledTimberMat);
  beamFront.position.set(deckCenter.x - 0.015, beamY + 0.04, deckCenter.z + deckDepth * 0.43);
  shelterGroup.add(beamFront);

  const beamCenter = new THREE.Mesh(beamGeoTrans, milledTimberMat);
  beamCenter.position.set(deckCenter.x - 0.015, beamY + 0.04, deckCenter.z);
  shelterGroup.add(beamCenter);

  // 8 Diagonal Knee Braces (Corbel timber struts)
  const braceGeo = new THREE.BoxGeometry(0.14, 0.65, 0.14);
  const braceDefs = [
    // Left side (longitudinal)
    { x: deckCenter.x - deckWidth * 0.44, y: beamY - 0.35, z: deckCenter.z - deckDepth * 0.43 + 0.35, rotX: Math.PI / 4, rotZ: 0 },
    { x: deckCenter.x - deckWidth * 0.44, y: beamY - 0.35, z: deckCenter.z + deckDepth * 0.43 - 0.35, rotX: -Math.PI / 4, rotZ: 0 },
    // Right side (longitudinal)
    { x: deckCenter.x + deckWidth * 0.41, y: beamY - 0.35, z: deckCenter.z - deckDepth * 0.43 + 0.35, rotX: Math.PI / 4, rotZ: 0 },
    { x: deckCenter.x + deckWidth * 0.41, y: beamY - 0.35, z: deckCenter.z + deckDepth * 0.43 - 0.35, rotX: -Math.PI / 4, rotZ: 0 },
    // Front side (transverse)
    { x: deckCenter.x - deckWidth * 0.44 + 0.35, y: beamY - 0.35, z: deckCenter.z + deckDepth * 0.43, rotX: 0, rotZ: -Math.PI / 4 },
    { x: deckCenter.x + deckWidth * 0.41 - 0.35, y: beamY - 0.35, z: deckCenter.z + deckDepth * 0.43, rotX: 0, rotZ: Math.PI / 4 },
    // Rear side (transverse)
    { x: deckCenter.x - deckWidth * 0.44 + 0.35, y: beamY - 0.35, z: deckCenter.z - deckDepth * 0.43, rotX: 0, rotZ: -Math.PI / 4 },
    { x: deckCenter.x + deckWidth * 0.41 - 0.35, y: beamY - 0.35, z: deckCenter.z - deckDepth * 0.43, rotX: 0, rotZ: Math.PI / 4 }
  ];

  braceDefs.forEach(({ x, y, z, rotX, rotZ }) => {
    const brace = new THREE.Mesh(braceGeo, milledTimberMat);
    brace.position.set(x, y, z);
    brace.rotation.x = rotX;
    brace.rotation.z = rotZ;
    shelterGroup.add(brace);
  });

  // King Posts rising to Roof Ridge
  const kingPostH = 1.35;
  const kingPostGeo = new THREE.BoxGeometry(0.2, kingPostH, 0.2);
  const ridgeY = beamY + kingPostH + 0.08;

  const kingFront = new THREE.Mesh(kingPostGeo, milledTimberMat);
  kingFront.position.set(deckCenter.x - 0.015, beamY + kingPostH * 0.5, deckCenter.z + deckDepth * 0.43);
  shelterGroup.add(kingFront);

  const kingRear = new THREE.Mesh(kingPostGeo, milledTimberMat);
  kingRear.position.set(deckCenter.x - 0.015, beamY + kingPostH * 0.5, deckCenter.z - deckDepth * 0.43);
  shelterGroup.add(kingRear);

  const kingMid = new THREE.Mesh(kingPostGeo, milledTimberMat);
  kingMid.position.set(deckCenter.x - 0.015, beamY + kingPostH * 0.5, deckCenter.z);
  shelterGroup.add(kingMid);

  // Longitudinal Ridge Beam
  const ridgeBeamGeo = new THREE.BoxGeometry(0.24, 0.24, deckDepth + 1.1);
  const ridgeBeam = new THREE.Mesh(ridgeBeamGeo, milledTimberMat);
  ridgeBeam.position.set(deckCenter.x - 0.015, ridgeY, deckCenter.z);
  shelterGroup.add(ridgeBeam);

  // Pitched Cedar Shake Shingle Roof (Left Slope & Right Slope)
  const roofSlopeWidth = 2.85;
  const roofLength = deckDepth + 1.0;
  const roofThick = 0.12;
  const roofAngle = 0.54; // ~31 degrees

  const roofGeo = new THREE.BoxGeometry(roofSlopeWidth, roofThick, roofLength);

  // Left Roof Slope
  const roofLeft = new THREE.Mesh(roofGeo, roofShingleMat);
  roofLeft.position.set(
    deckCenter.x - 0.015 - (roofSlopeWidth * 0.5 * Math.cos(roofAngle)) + 0.04,
    ridgeY - (roofSlopeWidth * 0.5 * Math.sin(roofAngle)) + 0.02,
    deckCenter.z
  );
  roofLeft.rotation.z = roofAngle;
  shelterGroup.add(roofLeft);

  // Right Roof Slope
  const roofRight = new THREE.Mesh(roofGeo, roofShingleMat);
  roofRight.position.set(
    deckCenter.x - 0.015 + (roofSlopeWidth * 0.5 * Math.cos(roofAngle)) - 0.04,
    ridgeY - (roofSlopeWidth * 0.5 * Math.sin(roofAngle)) + 0.02,
    deckCenter.z
  );
  roofRight.rotation.z = -roofAngle;
  shelterGroup.add(roofRight);

  // Ridge Cap Beam (protects the apex joint from rain)
  const ridgeCapGeo = new THREE.BoxGeometry(0.32, 0.16, roofLength + 0.08);
  const ridgeCap = new THREE.Mesh(ridgeCapGeo, milledTimberMat);
  ridgeCap.position.set(deckCenter.x - 0.015, ridgeY + 0.12, deckCenter.z);
  shelterGroup.add(ridgeCap);

  // Decorative Crossed Carved Wooden Finials on Gable Peaks
  function createGableFinial(fz) {
    const finialGroup = new THREE.Group();
    finialGroup.position.set(deckCenter.x - 0.015, ridgeY + 0.18, fz);

    const bladeGeo = new THREE.BoxGeometry(0.12, 0.75, 0.1);
    const blade1 = new THREE.Mesh(bladeGeo, milledTimberMat);
    blade1.rotation.z = 0.42;
    finialGroup.add(blade1);

    const blade2 = new THREE.Mesh(bladeGeo, milledTimberMat);
    blade2.rotation.z = -0.42;
    finialGroup.add(blade2);

    // Center iron boss / rivet
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6), forgedIronMat);
    boss.rotation.x = Math.PI / 2;
    finialGroup.add(boss);

    return finialGroup;
  }

  shelterGroup.add(createGableFinial(deckCenter.z + roofLength * 0.5));
  shelterGroup.add(createGableFinial(deckCenter.z - roofLength * 0.5));

  // Hanging Forged Iron Lantern on Front Post
  const lanternAnchor = {
    x: deckCenter.x + deckWidth * 0.41 + 0.05,
    y: colBaseY + colH - 0.35,
    z: deckCenter.z + deckDepth * 0.43 + 0.28
  };

  // Iron crane arm bracket
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.48), forgedIronMat);
  craneArm.position.set(lanternAnchor.x - 0.05, lanternAnchor.y + 0.2, lanternAnchor.z - 0.12);
  shelterGroup.add(craneArm);

  const craneBrace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), forgedIronMat);
  craneBrace.position.set(lanternAnchor.x - 0.05, lanternAnchor.y + 0.08, lanternAnchor.z - 0.18);
  craneBrace.rotation.x = -Math.PI / 4;
  shelterGroup.add(craneBrace);

  // Hanging forged chain
  const chainGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6);
  const chain = new THREE.Mesh(chainGeo, forgedIronMat);
  chain.position.set(lanternAnchor.x - 0.05, lanternAnchor.y + 0.08, lanternAnchor.z);
  shelterGroup.add(chain);

  // Hexagonal/cubical lantern body
  const lanternGeo = new THREE.BoxGeometry(0.3, 0.42, 0.3);
  const lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
  lanternMesh.position.set(lanternAnchor.x - 0.05, lanternAnchor.y - 0.2, lanternAnchor.z);
  shelterGroup.add(lanternMesh);

  // Lantern iron pyramid roof
  const lanternRoofGeo = new THREE.ConeGeometry(0.26, 0.18, 4);
  lanternRoofGeo.rotateY(Math.PI / 4);
  const lanternRoof = new THREE.Mesh(lanternRoofGeo, forgedIronMat);
  lanternRoof.position.set(lanternAnchor.x - 0.05, lanternAnchor.y + 0.06, lanternAnchor.z);
  shelterGroup.add(lanternRoof);

  // Warm atmospheric point light from the lantern
  const lanternLight = new THREE.PointLight(0xffaa33, 1.8, 7.5, 1.4);
  lanternLight.position.set(lanternAnchor.x - 0.05, lanternAnchor.y - 0.2, lanternAnchor.z);
  shelterGroup.add(lanternLight);

  // Woodcutter Guild Faction Banner (hanging from front tie-beam)
  const bannerGroup = new THREE.Group();
  bannerGroup.position.set(deckCenter.x - 1.1, beamY - 0.05, deckCenter.z + deckDepth * 0.43 + 0.06);

  // Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), milledTimberMat);
  pole.rotation.z = Math.PI / 2;
  bannerGroup.add(pole);

  // Banner cloth with swallowtail cutout
  const bannerGeo = new THREE.BoxGeometry(0.72, 1.2, 0.02);
  const bannerMesh = new THREE.Mesh(bannerGeo, bannerClothMat);
  bannerMesh.position.set(0, -0.65, 0);
  bannerGroup.add(bannerMesh);

  // Gold emblem / border strip on banner
  const bannerGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.04), goldTrimMat);
  bannerGoldTrim.position.set(0, -0.15, 0);
  bannerGroup.add(bannerGoldTrim);

  const bannerGoldTrim2 = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.04), goldTrimMat);
  bannerGoldTrim2.position.set(0, -1.15, 0);
  bannerGroup.add(bannerGoldTrim2);

  shelterGroup.add(bannerGroup);
  camp.add(shelterGroup);

  // ==========================================================================
  // 4. HEAVY SAWING TRESTLE & MECHANICAL SAW MECHANISM
  // ==========================================================================
  const sawMillGroup = new THREE.Group();
  sawMillGroup.name = 'SawMillTrestle';

  const millBaseX = deckCenter.x - 0.35;
  const millBaseZ = deckCenter.z;
  const millFloorY = deckY + deckThickness * 0.5;

  // A. Heavy Timber Sawing Trestle / Skid Bed
  const skidLen = 3.6;
  const skidWidth = 1.35;
  const trestleH = 0.62;

  // Skid rails (twin longitudinal beams)
  const skidRailGeo = new THREE.BoxGeometry(0.2, 0.22, skidLen);
  const railLeft = new THREE.Mesh(skidRailGeo, milledTimberMat);
  railLeft.position.set(millBaseX - skidWidth * 0.5, millFloorY + trestleH - 0.11, millBaseZ);
  sawMillGroup.add(railLeft);

  const railRight = new THREE.Mesh(skidRailGeo, milledTimberMat);
  railRight.position.set(millBaseX + skidWidth * 0.5, millFloorY + trestleH - 0.11, millBaseZ);
  sawMillGroup.add(railRight);

  // Steel top runner caps on skid rails
  const steelCapGeo = new THREE.BoxGeometry(0.1, 0.03, skidLen);
  const capL = new THREE.Mesh(steelCapGeo, forgedIronMat);
  capL.position.set(millBaseX - skidWidth * 0.5, millFloorY + trestleH + 0.015, millBaseZ);
  sawMillGroup.add(capL);

  const capR = new THREE.Mesh(steelCapGeo, forgedIronMat);
  capR.position.set(millBaseX + skidWidth * 0.5, millFloorY + trestleH + 0.015, millBaseZ);
  sawMillGroup.add(capR);

  // Sturdy A-frame trestle leg supports (Front, Mid, Rear)
  const legZOffsets = [-skidLen * 0.38, 0, skidLen * 0.38];
  legZOffsets.forEach((lz) => {
    // Left leg angled
    const legGeo = new THREE.BoxGeometry(0.16, trestleH + 0.05, 0.16);
    const legL = new THREE.Mesh(legGeo, milledTimberMat);
    legL.position.set(millBaseX - skidWidth * 0.5 - 0.06, millFloorY + trestleH * 0.5, millBaseZ + lz);
    legL.rotation.z = -0.15;
    sawMillGroup.add(legL);

    // Right leg angled
    const legR = new THREE.Mesh(legGeo, milledTimberMat);
    legR.position.set(millBaseX + skidWidth * 0.5 + 0.06, millFloorY + trestleH * 0.5, millBaseZ + lz);
    legR.rotation.z = 0.15;
    sawMillGroup.add(legR);

    // Horizontal spreader tie
    const tieGeo = new THREE.BoxGeometry(skidWidth + 0.32, 0.14, 0.14);
    const tie = new THREE.Mesh(tieGeo, milledTimberMat);
    tie.position.set(millBaseX, millFloorY + trestleH * 0.3, millBaseZ + lz);
    sawMillGroup.add(tie);
  });

  // B. Massive Master Timber Trunk Being Sawn
  const trunkR = 0.44;
  const trunkLen = 3.4;
  const trunkY = millFloorY + trestleH + trunkR * 0.92;

  // Sawn trunk split into two halves with visible saw kerf gap in between
  const halfLen = (trunkLen - 0.08) * 0.5;

  // Front Trunk Segment
  const trunkFrontGeo = new THREE.CylinderGeometry(trunkR, trunkR * 1.05, halfLen, 14, 1, true);
  trunkFrontGeo.rotateX(Math.PI / 2);
  const trunkFront = new THREE.Mesh(trunkFrontGeo, barkMat);
  trunkFront.position.set(millBaseX, trunkY, millBaseZ + halfLen * 0.5 + 0.04);
  sawMillGroup.add(trunkFront);

  // Front log end caps (outer cut end and inner sawn cut end)
  const capFrontOuter = new THREE.Mesh(new THREE.CircleGeometry(trunkR * 1.05, 14), logEndMat);
  capFrontOuter.position.set(millBaseX, trunkY, millBaseZ + halfLen + 0.041);
  sawMillGroup.add(capFrontOuter);

  const capFrontInner = new THREE.Mesh(new THREE.CircleGeometry(trunkR, 14), logEndMat);
  capFrontInner.position.set(millBaseX, trunkY, millBaseZ + 0.04);
  capFrontInner.rotation.y = Math.PI;
  sawMillGroup.add(capFrontInner);

  // Rear Trunk Segment
  const trunkRearGeo = new THREE.CylinderGeometry(trunkR * 0.96, trunkR, halfLen, 14, 1, true);
  trunkRearGeo.rotateX(Math.PI / 2);
  const trunkRear = new THREE.Mesh(trunkRearGeo, barkMat);
  trunkRear.position.set(millBaseX, trunkY, millBaseZ - halfLen * 0.5 - 0.04);
  sawMillGroup.add(trunkRear);

  // Rear log end caps
  const capRearOuter = new THREE.Mesh(new THREE.CircleGeometry(trunkR * 0.96, 14), logEndMat);
  capRearOuter.position.set(millBaseX, trunkY, millBaseZ - halfLen - 0.041);
  capRearOuter.rotation.y = Math.PI;
  sawMillGroup.add(capRearOuter);

  const capRearInner = new THREE.Mesh(new THREE.CircleGeometry(trunkR, 14), logEndMat);
  capRearInner.position.set(millBaseX, trunkY, millBaseZ - 0.04);
  sawMillGroup.add(capRearInner);

  // Heavy Forged Iron Log Dogs / Clamps securing the trunk
  const dogZ = [millBaseZ - 0.85, millBaseZ + 0.85];
  dogZ.forEach((dz) => {
    // Arch clamp over trunk
    const clampGeo = new THREE.BoxGeometry(skidWidth + 0.16, 0.08, 0.12);
    const clamp = new THREE.Mesh(clampGeo, forgedIronMat);
    clamp.position.set(millBaseX, trunkY + trunkR + 0.02, dz);
    sawMillGroup.add(clamp);

    // Left & Right bolt rods
    const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, trunkR * 2 + 0.3, 6);
    const rodL = new THREE.Mesh(rodGeo, forgedIronMat);
    rodL.position.set(millBaseX - skidWidth * 0.5 - 0.02, trunkY, dz);
    sawMillGroup.add(rodL);

    const rodR = new THREE.Mesh(rodGeo, forgedIronMat);
    rodR.position.set(millBaseX + skidWidth * 0.5 + 0.02, trunkY, dz);
    sawMillGroup.add(rodR);
  });

  // C. Giant Circular Saw Blade & Drive Axle Mechanism
  const bladeR = 0.92;
  const bladeThick = 0.04;
  const bladeCenter = { x: millBaseX, y: trunkY - 0.12, z: millBaseZ };

  // Circular saw blade (vertical disk slicing through the trunk kerf)
  const bladeGeo = new THREE.CylinderGeometry(bladeR, bladeR, bladeThick, 28);
  bladeGeo.rotateZ(Math.PI / 2);
  const sawBladeMesh = new THREE.Mesh(bladeGeo, sawBladeMat);
  sawBladeMesh.position.set(bladeCenter.x, bladeCenter.y, bladeCenter.z);
  sawMillGroup.add(sawBladeMesh);

  // Heavy Central Steel Axle Shaft
  const axleGeo = new THREE.CylinderGeometry(0.085, 0.085, 1.5, 8);
  axleGeo.rotateZ(Math.PI / 2);
  const axleMesh = new THREE.Mesh(axleGeo, forgedIronMat);
  axleMesh.position.set(bladeCenter.x, bladeCenter.y, bladeCenter.z);
  sawMillGroup.add(axleMesh);

  // Heavy Forged Cast-Iron Pillow Block Bearing Mounts
  const bearingGeo = new THREE.BoxGeometry(0.24, 0.34, 0.32);
  const bearingL = new THREE.Mesh(bearingGeo, forgedIronMat);
  bearingL.position.set(bladeCenter.x - 0.65, bladeCenter.y, bladeCenter.z);
  sawMillGroup.add(bearingL);

  const bearingR = new THREE.Mesh(bearingGeo, forgedIronMat);
  bearingR.position.set(bladeCenter.x + 0.65, bladeCenter.y, bladeCenter.z);
  sawMillGroup.add(bearingR);

  // Sturdy Stanchion Posts holding bearings up from deck
  const stanchionGeo = new THREE.BoxGeometry(0.24, bladeCenter.y - millFloorY, 0.32);
  const stanchionL = new THREE.Mesh(stanchionGeo, milledTimberMat);
  stanchionL.position.set(bladeCenter.x - 0.65, millFloorY + (bladeCenter.y - millFloorY) * 0.5, bladeCenter.z);
  sawMillGroup.add(stanchionL);

  const stanchionR = new THREE.Mesh(stanchionGeo, milledTimberMat);
  stanchionR.position.set(bladeCenter.x + 0.65, millFloorY + (bladeCenter.y - millFloorY) * 0.5, bladeCenter.z);
  sawMillGroup.add(stanchionR);

  // Wooden Drive Pulley Wheel & Leather Drive Belt (running down into subfloor power)
  const pulleyR = 0.52;
  const pulleyGeo = new THREE.CylinderGeometry(pulleyR, pulleyR, 0.16, 16);
  pulleyGeo.rotateZ(Math.PI / 2);
  const pulley = new THREE.Mesh(pulleyGeo, milledTimberMat);
  pulley.position.set(bladeCenter.x + 0.52, bladeCenter.y, bladeCenter.z);
  sawMillGroup.add(pulley);

  // Drive belt running downwards
  const beltGeo = new THREE.BoxGeometry(0.12, 1.2, 0.95);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x3d2212, roughness: 0.8, flatShading: true });
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.position.set(bladeCenter.x + 0.52, bladeCenter.y - 0.55, bladeCenter.z);
  sawMillGroup.add(belt);

  // Safety Timber Shroud Arch over upper quadrant of saw blade
  const shroudGeo = new THREE.BoxGeometry(0.14, 0.32, 1.1);
  const shroud = new THREE.Mesh(shroudGeo, milledTimberMat);
  shroud.position.set(bladeCenter.x, bladeCenter.y + bladeR * 0.95, bladeCenter.z - 0.25);
  sawMillGroup.add(shroud);

  // D. Sawdust Collection Chute & Large Sawdust Mound on Deck
  const chuteGeo = new THREE.BoxGeometry(0.65, 0.45, 0.65);
  const chute = new THREE.Mesh(chuteGeo, milledTimberMat);
  chute.position.set(bladeCenter.x, millFloorY + 0.22, bladeCenter.z);
  sawMillGroup.add(chute);

  // Prominent conical mound of golden sawdust under the saw cut
  const dustMoundGeo = new THREE.ConeGeometry(0.85, 0.42, 10);
  const dustMound = new THREE.Mesh(dustMoundGeo, sawdustMat);
  dustMound.position.set(bladeCenter.x + 0.12, millFloorY + 0.21, bladeCenter.z + 0.1);
  dustMound.scale.set(1.2, 1.0, 0.9);
  sawMillGroup.add(dustMound);

  // Second smaller sawdust drift
  const dustMound2 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.28, 8), sawdustMat);
  dustMound2.position.set(bladeCenter.x - 0.4, millFloorY + 0.14, bladeCenter.z + 0.35);
  sawMillGroup.add(dustMound2);

  camp.add(sawMillGroup);

  // ==========================================================================
  // 5. PYRAMIDAL STACKS OF HARVESTED ROUND LOGS (LOG YARD)
  // ==========================================================================
  const logYardGroup = new THREE.Group();
  logYardGroup.name = 'LogYard';

  const yardX = -3.2;
  const yardZ = -0.3;
  const logR = 0.33;
  const logL = 3.6;

  // Sturdy Upright Timber Retaining Stakes / Cradle Bolsters
  const stakeGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.8, 7);
  const stake1 = new THREE.Mesh(stakeGeo, barkMat);
  stake1.position.set(yardX - 0.72, 0.9, yardZ - logL * 0.38);
  logYardGroup.add(stake1);

  const stake2 = new THREE.Mesh(stakeGeo, barkMat);
  stake2.position.set(yardX + 0.72, 0.9, yardZ - logL * 0.38);
  logYardGroup.add(stake2);

  const stake3 = new THREE.Mesh(stakeGeo, barkMat);
  stake3.position.set(yardX - 0.72, 0.9, yardZ + logL * 0.38);
  logYardGroup.add(stake3);

  const stake4 = new THREE.Mesh(stakeGeo, barkMat);
  stake4.position.set(yardX + 0.72, 0.9, yardZ + logL * 0.38);
  logYardGroup.add(stake4);

  // Ground Dunnage Bearer Skids
  const dunnageGeo = new THREE.BoxGeometry(1.6, 0.15, 0.2);
  const dun1 = new THREE.Mesh(dunnageGeo, milledTimberMat);
  dun1.position.set(yardX, 0.08, yardZ - logL * 0.35);
  logYardGroup.add(dun1);

  const dun2 = new THREE.Mesh(dunnageGeo, milledTimberMat);
  dun2.position.set(yardX, 0.08, yardZ + logL * 0.35);
  logYardGroup.add(dun2);

  // Helper to create a realistic log with bark cylinder body and end-grain circular caps
  function createCutLog(length = logL, radius = logR) {
    const logGroup = new THREE.Group();

    // Body cylinder
    const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 12, 1, true);
    cylGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(cylGeo, barkMat);
    logGroup.add(body);

    // Front end cap
    const cap1 = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), logEndMat);
    cap1.position.set(0, 0, length * 0.5 + 0.005);
    logGroup.add(cap1);

    // Rear end cap
    const cap2 = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), logEndMat);
    cap2.position.set(0, 0, -length * 0.5 - 0.005);
    cap2.rotation.y = Math.PI;
    logGroup.add(cap2);

    return logGroup;
  }

  // Pyramidal 3-2-1 Log Stack Definition
  const pyramidLogs = [
    // Bottom Tier (3 logs)
    { x: yardX - logR * 1.95, y: 0.16 + logR, z: yardZ - 0.04, rotY: 0.02 },
    { x: yardX,              y: 0.16 + logR, z: yardZ + 0.03, rotY: -0.01 },
    { x: yardX + logR * 1.95, y: 0.16 + logR, z: yardZ - 0.02, rotY: 0.015 },
    // Middle Tier (2 logs)
    { x: yardX - logR * 0.98, y: 0.16 + logR + logR * 1.72, z: yardZ + 0.02, rotY: -0.02 },
    { x: yardX + logR * 0.98, y: 0.16 + logR + logR * 1.72, z: yardZ - 0.03, rotY: 0.025 },
    // Top Tier (1 log)
    { x: yardX,              y: 0.16 + logR + logR * 3.44, z: yardZ,        rotY: 0.01 }
  ];

  pyramidLogs.forEach((p) => {
    const log = createCutLog(logL, logR);
    log.position.set(p.x, p.y, p.z);
    log.rotation.y = p.rotY;
    logYardGroup.add(log);
  });

  // A couple of loose logs seasoned beside the main stack
  const loose1 = createCutLog(2.8, 0.28);
  loose1.position.set(yardX - 0.35, 0.28, yardZ + 2.1);
  loose1.rotation.y = 0.18;
  logYardGroup.add(loose1);

  const loose2 = createCutLog(2.6, 0.26);
  loose2.position.set(yardX + 0.25, 0.26, yardZ + 2.15);
  loose2.rotation.y = -0.12;
  logYardGroup.add(loose2);

  camp.add(logYardGroup);

  // ==========================================================================
  // 6. STACKS OF FRESHLY PLANED LUMBER (FINISHED GOODS DEPOT)
  // ==========================================================================
  const lumberDepotGroup = new THREE.Group();
  lumberDepotGroup.name = 'FinishedLumberDepot';

  const depotX = 2.85;
  const depotZ = -0.7;

  // Dunnage bearers
  const dunPlankGeo = new THREE.BoxGeometry(1.2, 0.12, 0.18);
  const dp1 = new THREE.Mesh(dunPlankGeo, milledTimberMat);
  dp1.position.set(depotX, 0.06, depotZ - 1.0);
  lumberDepotGroup.add(dp1);

  const dp2 = new THREE.Mesh(dunPlankGeo, milledTimberMat);
  dp2.position.set(depotX, 0.06, depotZ + 1.0);
  lumberDepotGroup.add(dp2);

  // Stickered Lumber Stacks (neat tiers separated by thin wooden stickers)
  const numTiers = 6;
  const boardW = 0.34;
  const boardH = 0.08;
  const boardL = 2.6;

  for (let t = 0; t < numTiers; t++) {
    const curY = 0.12 + t * (boardH + 0.035);

    // 3 boards side-by-side per tier
    for (let b = -1; b <= 1; b++) {
      const boardGeo = new THREE.BoxGeometry(boardW, boardH, boardL);
      const board = new THREE.Mesh(boardGeo, milledTimberMat);
      board.position.set(depotX + b * (boardW + 0.05), curY + boardH * 0.5, depotZ);
      lumberDepotGroup.add(board);
    }

    // Transverse sticker sticks between tiers
    if (t < numTiers - 1) {
      const stickGeo = new THREE.BoxGeometry(1.1, 0.03, 0.06);
      const st1 = new THREE.Mesh(stickGeo, milledTimberMat);
      st1.position.set(depotX, curY + boardH + 0.015, depotZ - 0.85);
      lumberDepotGroup.add(st1);

      const st2 = new THREE.Mesh(stickGeo, milledTimberMat);
      st2.position.set(depotX, curY + boardH + 0.015, depotZ + 0.85);
      lumberDepotGroup.add(st2);
    }
  }

  // Two long planed boards casually leaned against the shelter timber post
  const leanBoardGeo = new THREE.BoxGeometry(0.32, 0.08, 3.2);
  const lean1 = new THREE.Mesh(leanBoardGeo, milledTimberMat);
  lean1.position.set(deckCenter.x + deckWidth * 0.41 + 0.18, 1.4, deckCenter.z + 0.6);
  lean1.rotation.x = -0.32;
  lean1.rotation.y = 0.15;
  lumberDepotGroup.add(lean1);

  const lean2 = new THREE.Mesh(leanBoardGeo, milledTimberMat);
  lean2.position.set(deckCenter.x + deckWidth * 0.41 + 0.22, 1.35, deckCenter.z + 0.85);
  lean2.rotation.x = -0.36;
  lean2.rotation.y = 0.08;
  lumberDepotGroup.add(lean2);

  camp.add(lumberDepotGroup);

  // ==========================================================================
  // 7. WOODCUTTER'S CHOPPING BLOCK & TOOL STATION
  // ==========================================================================
  const toolStationGroup = new THREE.Group();
  toolStationGroup.name = 'ChoppingBlockAndTools';

  const blockX = 1.7;
  const blockZ = 2.15;
  const stumpR = 0.52;
  const stumpH = 0.74;

  // A. Massive Oak Chopping Stump
  const stumpGroup = new THREE.Group();
  stumpGroup.position.set(blockX, stumpH * 0.5, blockZ);

  const stumpGeo = new THREE.CylinderGeometry(stumpR * 0.9, stumpR * 1.08, stumpH, 10, 1, true);
  const stumpMesh = new THREE.Mesh(stumpGeo, barkMat);
  stumpGroup.add(stumpMesh);

  // End caps (top cutting surface and bottom)
  const stumpTop = new THREE.Mesh(new THREE.CircleGeometry(stumpR * 0.9, 10), logEndMat);
  stumpTop.position.set(0, stumpH * 0.5 + 0.005, 0);
  stumpTop.rotation.x = -Math.PI / 2;
  stumpGroup.add(stumpTop);

  toolStationGroup.add(stumpGroup);

  // B. Embedded Woodcutter's Broad Axe
  const axeGroup = new THREE.Group();
  axeGroup.position.set(blockX - 0.05, stumpH + 0.08, blockZ + 0.04);
  axeGroup.rotation.z = -0.42; // Wedged at dynamic working angle
  axeGroup.rotation.y = 0.2;

  // Ergonomic Ash Wood Handle
  const handleGeo = new THREE.CylinderGeometry(0.038, 0.045, 1.15, 6);
  const handleMesh = new THREE.Mesh(handleGeo, axeToolsMat);
  handleMesh.position.set(0, 0.35, 0);
  axeGroup.add(handleMesh);

  // Heavy Forged Carbon Steel Broad Axe Head
  const axeHeadGeo = new THREE.BoxGeometry(0.44, 0.24, 0.09);
  const axeHeadMesh = new THREE.Mesh(axeHeadGeo, axeToolsMat);
  axeHeadMesh.position.set(0.12, 0.76, 0);
  axeGroup.add(axeHeadMesh);

  // Sharp cutting bit wedge
  const wedgeGeo = new THREE.ConeGeometry(0.12, 0.24, 4);
  wedgeGeo.rotateZ(-Math.PI / 2);
  const wedgeMesh = new THREE.Mesh(wedgeGeo, axeToolsMat);
  wedgeMesh.position.set(0.34, 0.76, 0);
  axeGroup.add(wedgeMesh);

  toolStationGroup.add(axeGroup);

  // C. Split Firewood Billets & Scattered Wood Chips
  const billetGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.55, 6);
  billetGeo.rotateX(Math.PI / 2);

  const billet1 = new THREE.Mesh(billetGeo, barkMat);
  billet1.position.set(blockX + 0.58, 0.12, blockZ - 0.15);
  billet1.rotation.y = 0.45;
  toolStationGroup.add(billet1);

  const billet2 = new THREE.Mesh(billetGeo, barkMat);
  billet2.position.set(blockX + 0.48, 0.26, blockZ - 0.22);
  billet2.rotation.y = 0.2;
  toolStationGroup.add(billet2);

  const billet3 = new THREE.Mesh(billetGeo, barkMat);
  billet3.position.set(blockX - 0.52, 0.12, blockZ + 0.35);
  billet3.rotation.y = -0.65;
  toolStationGroup.add(billet3);

  // Scattered 3D Wood Chips around chopping block
  const chipGeo = new THREE.BoxGeometry(0.1, 0.03, 0.08);
  const chipOffsets = [
    [0.35, 0.38], [-0.42, 0.25], [0.55, -0.45], [-0.38, -0.32],
    [0.2, -0.55], [-0.22, 0.52], [0.65, 0.15], [-0.58, -0.12]
  ];

  chipOffsets.forEach(([cx, cz], idx) => {
    const chip = new THREE.Mesh(chipGeo, milledTimberMat);
    chip.position.set(blockX + cx, 0.02, blockZ + cz);
    chip.rotation.y = idx * 0.78;
    chip.rotation.z = (idx % 2 === 0 ? 0.1 : -0.1);
    toolStationGroup.add(chip);
  });

  // Sawdust ring around chopping block
  const stumpDust = new THREE.Mesh(new THREE.RingGeometry(0.48, 1.1, 10), sawdustMat);
  stumpDust.position.set(blockX, 0.015, blockZ);
  stumpDust.rotation.x = -Math.PI / 2;
  toolStationGroup.add(stumpDust);

  // D. Two-Man Crosscut Saw hanging on shelter frame post
  const twoManSawGroup = new THREE.Group();
  twoManSawGroup.position.set(
    deckCenter.x - deckWidth * 0.44 - 0.15,
    colBaseY + 1.2,
    deckCenter.z + 0.4
  );

  // Long toothed steel blade
  const sawBladeLongGeo = new THREE.BoxGeometry(0.03, 0.16, 1.8);
  const sawBladeLong = new THREE.Mesh(sawBladeLongGeo, sawBladeMat);
  twoManSawGroup.add(sawBladeLong);

  // Wooden handles at both ends
  const handleEndGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6);
  const handle1 = new THREE.Mesh(handleEndGeo, milledTimberMat);
  handle1.position.set(0, 0.04, -0.9);
  twoManSawGroup.add(handle1);

  const handle2 = new THREE.Mesh(handleEndGeo, milledTimberMat);
  handle2.position.set(0, 0.04, 0.9);
  twoManSawGroup.add(handle2);

  toolStationGroup.add(twoManSawGroup);

  // E. Coopered Water Quench Tub / Fire Safety Barrel
  const tubX = deckCenter.x + deckWidth * 0.38;
  const tubZ = deckCenter.z - deckDepth * 0.35;
  const tubGeo = new THREE.CylinderGeometry(0.38, 0.32, 0.62, 10);
  const tubMesh = new THREE.Mesh(tubGeo, barkMat);
  tubMesh.position.set(tubX, deckY + deckThickness * 0.5 + 0.31, tubZ);
  toolStationGroup.add(tubMesh);

  // Iron hoops on tub
  const hoopGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.04, 10);
  const hoop1 = new THREE.Mesh(hoopGeo, forgedIronMat);
  hoop1.position.set(tubX, deckY + deckThickness * 0.5 + 0.14, tubZ);
  toolStationGroup.add(hoop1);

  const hoop2 = new THREE.Mesh(hoopGeo, forgedIronMat);
  hoop2.position.set(tubX, deckY + deckThickness * 0.5 + 0.48, tubZ);
  toolStationGroup.add(hoop2);

  // Water plane inside tub
  const waterGeo = new THREE.CircleGeometry(0.35, 10);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x224455,
    roughness: 0.1,
    metalness: 0.2
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(tubX, deckY + deckThickness * 0.5 + 0.56, tubZ);
  waterMesh.rotation.x = -Math.PI / 2;
  toolStationGroup.add(waterMesh);

  camp.add(toolStationGroup);

  // ==========================================================================
  // 8. ENVIRONMENTAL GROUND SAWDUST PATCHES & BASE
  // ==========================================================================
  const groundSawdustGroup = new THREE.Group();
  groundSawdustGroup.name = 'GroundSawdust';

  // Ground sawdust ring near ramp / entrance
  const rampDust = new THREE.Mesh(new THREE.CircleGeometry(0.85, 10), sawdustMat);
  rampDust.position.set(deckCenter.x, 0.01, deckCenter.z + deckDepth * 0.5 + 0.7);
  rampDust.rotation.x = -Math.PI / 2;
  rampDust.scale.set(1.4, 0.8, 1.0);
  groundSawdustGroup.add(rampDust);

  // Log yard sawdust accumulation
  const yardDust = new THREE.Mesh(new THREE.CircleGeometry(1.2, 10), sawdustMat);
  yardDust.position.set(yardX, 0.01, yardZ);
  yardDust.rotation.x = -Math.PI / 2;
  yardDust.scale.set(0.9, 1.3, 1.0);
  groundSawdustGroup.add(yardDust);

  camp.add(groundSawdustGroup);

  return enableShadows(camp);
}
