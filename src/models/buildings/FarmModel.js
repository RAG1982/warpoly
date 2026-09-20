import * as THREE from 'three';
import { materials, enableShadows } from '../materials.js';
import {
  getTilledSoilTextures,
  getWheatCropsTextures,
  getBarnTimberTextures,
  getThatchRoofTextures,
  getFenceWoodTextures,
  getStoneWellTextures,
  getBurlapPropsTextures
} from './farmTextures.js';

/**
 * Next-Gen Stylized Medieval Farmstead (Fazenda de Trigo)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 * 
 * Features:
 * - Multi-tier layout fitting the ~8.5 x 8.5 game grid.
 * - Rich furrowed crop field with dense golden ripe wheat stalks, drooping heads, and awns.
 * - Weathered rustic barn & farmhouse with timber framing, heavy double doors, hayloft hoist, and deep thatched roof.
 * - Attached open lean-to shed sheltering stacked firewood, cart wheel, and grain crates.
 * - Rustic stone water well with mortared river cobblestones, chiseled coping, timber winch, and suspended bucket.
 * - Split-rail cedar fence enclosing the perimeter with an inviting entrance gate opening.
 * - Detail props: Golden hay bales, burlap grain sacks with mill stamps, forged iron pitchfork & rake, warm lantern.
 */

// Helper to construct PBR materials from procedural texture maps
function createPBRMaterial(textures, options = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: textures.map,
    roughnessMap: textures.roughnessMap,
    metalnessMap: textures.metalnessMap,
    bumpMap: textures.bumpMap,
    bumpScale: options.bumpScale !== undefined ? options.bumpScale : 0.05,
    roughness: options.roughness !== undefined ? options.roughness : 1.0,
    metalness: options.metalness !== undefined ? options.metalness : 1.0,
    ...options
  });
  return mat;
}

export function createFarm() {
  const farm = new THREE.Group();
  farm.name = 'Farm';

  // Instantiate PBR Materials from cached canvas textures
  const soilMat = createPBRMaterial(getTilledSoilTextures(), { bumpScale: 0.08 });
  const wheatMat = createPBRMaterial(getWheatCropsTextures(), { bumpScale: 0.06 });
  const barnTimberMat = createPBRMaterial(getBarnTimberTextures(), { bumpScale: 0.06 });
  const thatchMat = createPBRMaterial(getThatchRoofTextures(), { bumpScale: 0.08 });
  const fenceWoodMat = createPBRMaterial(getFenceWoodTextures(), { bumpScale: 0.06 });
  const stoneWellMat = createPBRMaterial(getStoneWellTextures(), { bumpScale: 0.07 });
  const burlapPropsMat = createPBRMaterial(getBurlapPropsTextures(), { bumpScale: 0.06 });

  // Accent Materials
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x164e63,
    roughness: 0.08,
    metalness: 0.2,
    flatShading: false
  });

  const ironMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.85
  });

  const goldStrawMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.75,
    metalness: 0.0
  });

  const lanternGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffedd5,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
    roughness: 0.2
  });

  // =========================================================================
  // 1. BASE GROUND & PATHWAYS (8.6 x 8.6 footprint)
  // =========================================================================
  const groundGroup = new THREE.Group();
  groundGroup.name = 'BaseGround';

  // Main fertile soil foundation block
  const baseGeo = new THREE.BoxGeometry(8.6, 0.32, 8.6);
  const baseMesh = new THREE.Mesh(baseGeo, soilMat);
  baseMesh.position.set(0, 0.16, 0);
  groundGroup.add(baseMesh);

  // Stepped rustic stone curb along perimeter
  const curbMat = stoneWellMat;
  const curbH = 0.22;
  const curbThick = 0.28;
  const curbLength = 8.6;

  // Rear curb
  const curbBack = new THREE.Mesh(new THREE.BoxGeometry(curbLength, curbH, curbThick), curbMat);
  curbBack.position.set(0, 0.11, -4.2);
  groundGroup.add(curbBack);

  // Left curb
  const curbLeft = new THREE.Mesh(new THREE.BoxGeometry(curbThick, curbH, curbLength), curbMat);
  curbLeft.position.set(-4.2, 0.11, 0);
  groundGroup.add(curbLeft);

  // Right curb
  const curbRight = new THREE.Mesh(new THREE.BoxGeometry(curbThick, curbH, curbLength), curbMat);
  curbRight.position.set(4.2, 0.11, 0);
  groundGroup.add(curbRight);

  // Front curb (with gate gap between x = -0.2 and 1.6)
  const curbFrontL = new THREE.Mesh(new THREE.BoxGeometry(3.9, curbH, curbThick), curbMat);
  curbFrontL.position.set(-2.25, 0.11, 4.2);
  groundGroup.add(curbFrontL);

  const curbFrontR = new THREE.Mesh(new THREE.BoxGeometry(2.5, curbH, curbThick), curbMat);
  curbFrontR.position.set(2.95, 0.11, 4.2);
  groundGroup.add(curbFrontR);

  // Cobblestone stepping path leading from gate to barn and well
  const pathPositions = [
    [0.7, 0.33, 4.0, 0.55, 0.45],
    [0.6, 0.33, 3.3, 0.5, 0.6],
    [0.8, 0.33, 2.6, 0.6, 0.5],
    [1.1, 0.33, 1.9, 0.55, 0.55],
    [1.3, 0.33, 1.2, 0.65, 0.5],
    [1.6, 0.33, 0.5, 0.6, 0.6],
    [1.7, 0.33, -0.2, 0.7, 0.5],
    // Branch to barn door
    [1.9, 0.33, -0.8, 0.6, 0.6],
    [2.3, 0.33, -1.0, 0.7, 0.6],
    // Branch to well
    [1.6, 0.33, 2.0, 0.5, 0.5],
    [2.0, 0.33, 2.2, 0.55, 0.55]
  ];

  pathPositions.forEach(([px, py, pz, sx, sz]) => {
    const stoneGeo = new THREE.BoxGeometry(sx, 0.05, sz);
    const stoneMesh = new THREE.Mesh(stoneGeo, stoneWellMat);
    stoneMesh.position.set(px, py, pz);
    stoneMesh.rotation.y = (px + pz) * 0.7;
    groundGroup.add(stoneMesh);
  });

  farm.add(groundGroup);

  // =========================================================================
  // 2. TILLED FURROWED WHEAT FIELD & CROPS
  // =========================================================================
  const fieldGroup = new THREE.Group();
  fieldGroup.name = 'CropField';

  // Furrow ridges (raised mounds of tilled fertile soil)
  const furrowXs = [-3.5, -2.7, -1.9, -1.1, -0.3];
  const furrowLength = 7.0;

  furrowXs.forEach((fx, idx) => {
    // Raised soil ridge mound
    const ridgeGeo = new THREE.CylinderGeometry(0.32, 0.42, furrowLength, 6);
    ridgeGeo.rotateX(Math.PI / 2);
    const ridgeMesh = new THREE.Mesh(ridgeGeo, soilMat);
    ridgeMesh.position.set(fx, 0.38, 0);
    fieldGroup.add(ridgeMesh);

    // Irrigation / drainage trench shadow filler between ridges
    if (idx < furrowXs.length - 1) {
      const nextX = furrowXs[idx + 1];
      const trenchGeo = new THREE.BoxGeometry((nextX - fx) * 0.4, 0.08, furrowLength);
      const trenchMesh = new THREE.Mesh(trenchGeo, soilMat);
      trenchMesh.position.set((fx + nextX) * 0.5, 0.33, 0);
      fieldGroup.add(trenchMesh);
    }
  });

  // Stylized Golden Wheat Stalks & Ripe Ears
  const stalkGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.9, 4);
  const headGeo = new THREE.ConeGeometry(0.09, 0.36, 5);
  headGeo.rotateX(Math.PI); // Tip facing downward / weighted droop
  const awnGeo = new THREE.CylinderGeometry(0.006, 0.012, 0.22, 3);

  // Generate dense, lively rows of wheat along each furrow ridge
  furrowXs.forEach((fx, fIdx) => {
    const numStalksInRow = 11;
    for (let i = 0; i < numStalksInRow; i++) {
      const zPos = -3.0 + i * 0.6 + (Math.sin(i * 1.7 + fIdx) * 0.12);
      const xPos = fx + (Math.cos(i * 2.3 + fIdx * 1.5) * 0.14);

      const wheatCluster = new THREE.Group();
      wheatCluster.position.set(xPos, 0.48, zPos);

      // Organic tilt and rotation
      const swayAngleX = (Math.sin(i * 0.8 + fIdx) * 0.12);
      const swayAngleZ = (Math.cos(i * 0.7 + fIdx * 0.9) * 0.14);
      wheatCluster.rotation.set(swayAngleX, (i * 0.9 + fIdx), swayAngleZ);

      // Height scale variation for natural field look
      const heightScale = 0.85 + ((i + fIdx * 3) % 5) * 0.08;
      wheatCluster.scale.set(1.0, heightScale, 1.0);

      // 1. Wheat Stalk Stem
      const stalk = new THREE.Mesh(stalkGeo, wheatMat);
      stalk.position.y = 0.45;
      wheatCluster.add(stalk);

      // 2. Braided Wheat Head (Ear of wheat)
      const head = new THREE.Mesh(headGeo, wheatMat);
      head.position.set(0.03, 0.92, 0.02);
      head.rotation.x = 0.25; // Graceful droop under grain weight
      wheatCluster.add(head);

      // 3. Golden Awns (bristles / whiskers radiating from wheat head)
      const awn1 = new THREE.Mesh(awnGeo, wheatMat);
      awn1.position.set(0.02, 1.1, 0.01);
      awn1.rotation.set(0.2, 0.1, 0.15);
      wheatCluster.add(awn1);

      const awn2 = new THREE.Mesh(awnGeo, wheatMat);
      awn2.position.set(-0.02, 1.08, -0.01);
      awn2.rotation.set(-0.15, -0.3, -0.2);
      wheatCluster.add(awn2);

      // Secondary side shoot on every other stalk
      if ((i + fIdx) % 2 === 0) {
        const sideStalk = new THREE.Mesh(stalkGeo, wheatMat);
        sideStalk.scale.set(0.7, 0.65, 0.7);
        sideStalk.position.set(0.08, 0.25, 0.04);
        sideStalk.rotation.z = -0.3;
        wheatCluster.add(sideStalk);

        const sideHead = new THREE.Mesh(headGeo, wheatMat);
        sideHead.scale.set(0.75, 0.7, 0.75);
        sideHead.position.set(0.18, 0.55, 0.05);
        sideHead.rotation.z = -0.35;
        wheatCluster.add(sideHead);
      }

      fieldGroup.add(wheatCluster);
    }
  });

  farm.add(fieldGroup);

  // =========================================================================
  // 3. RUSTIC THATCHED STORAGE BARN & FARMHOUSE WITH LEAN-TO
  // =========================================================================
  const barnGroup = new THREE.Group();
  barnGroup.name = 'StorageBarn';
  // Positioned in rear right sector
  barnGroup.position.set(1.8, 0, -1.7);

  // A. Barn Stone Foundation Plinth
  const barnW = 2.4;
  const barnL = 2.8;
  const barnWallH = 2.0;

  const plinthGeo = new THREE.BoxGeometry(barnW + 0.15, 0.32, barnL + 0.15);
  const plinth = new THREE.Mesh(plinthGeo, stoneWellMat);
  plinth.position.set(0, 0.32 + 0.16, 0);
  barnGroup.add(plinth);

  // B. Barn Main Timber Walls
  const barnWallGeo = new THREE.BoxGeometry(barnW, barnWallH, barnL);
  const barnWalls = new THREE.Mesh(barnWallGeo, barnTimberMat);
  barnWalls.position.set(0, 0.48 + barnWallH * 0.5, 0);
  barnGroup.add(barnWalls);

  // C. Heavy Corner Timber Posts
  const postGeo = new THREE.BoxGeometry(0.22, barnWallH + 0.08, 0.22);
  const cornerOffsets = [
    [-barnW * 0.5, 0, -barnL * 0.5],
    [barnW * 0.5, 0, -barnL * 0.5],
    [-barnW * 0.5, 0, barnL * 0.5],
    [barnW * 0.5, 0, barnL * 0.5]
  ];
  cornerOffsets.forEach(([cx, cy, cz]) => {
    const post = new THREE.Mesh(postGeo, barnTimberMat);
    post.position.set(cx, 0.48 + barnWallH * 0.5, cz);
    barnGroup.add(post);
  });

  // D. Triangular Gable Walls using ShapeGeometry
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-barnW * 0.5, 0);
  gableShape.lineTo(0, 1.35);
  gableShape.lineTo(barnW * 0.5, 0);
  gableShape.closePath();

  const gableGeo = new THREE.ShapeGeometry(gableShape);

  // Front Gable
  const gableFront = new THREE.Mesh(gableGeo, barnTimberMat);
  gableFront.position.set(0, 0.48 + barnWallH, barnL * 0.5 + 0.01);
  barnGroup.add(gableFront);

  // Rear Gable
  const gableBack = new THREE.Mesh(gableGeo, barnTimberMat);
  gableBack.position.set(0, 0.48 + barnWallH, -barnL * 0.5 - 0.01);
  gableBack.rotation.y = Math.PI;
  barnGroup.add(gableBack);

  // E. Steep Double-Pitched Thatched Roof with Wide Eaves Overhang
  const roofSlopeGeo = new THREE.BoxGeometry(1.8, 0.24, barnL + 0.5);

  // Left Roof Slope
  const roofSlopeL = new THREE.Mesh(roofSlopeGeo, thatchMat);
  roofSlopeL.position.set(-0.78, 0.48 + barnWallH + 0.65, 0);
  roofSlopeL.rotation.z = 0.82;
  barnGroup.add(roofSlopeL);

  // Right Roof Slope
  const roofSlopeR = new THREE.Mesh(roofSlopeGeo, thatchMat);
  roofSlopeR.position.set(0.78, 0.48 + barnWallH + 0.65, 0);
  roofSlopeR.rotation.z = -0.82;
  barnGroup.add(roofSlopeR);

  // Roof Straw Ridge Comb
  const ridgeCombGeo = new THREE.CylinderGeometry(0.2, 0.28, barnL + 0.6, 6);
  ridgeCombGeo.rotateX(Math.PI / 2);
  const ridgeComb = new THREE.Mesh(ridgeCombGeo, thatchMat);
  ridgeComb.position.set(0, 0.48 + barnWallH + 1.4, 0);
  barnGroup.add(ridgeComb);

  // Crossed Timber Gable Finials / Bargeboards
  const bargeboardGeo = new THREE.BoxGeometry(0.12, 1.5, 0.08);
  [-barnL * 0.5 - 0.04, barnL * 0.5 + 0.04].forEach(gz => {
    const arm1 = new THREE.Mesh(bargeboardGeo, barnTimberMat);
    arm1.position.set(0, 0.48 + barnWallH + 1.15, gz);
    arm1.rotation.z = 0.55;
    barnGroup.add(arm1);

    const arm2 = new THREE.Mesh(bargeboardGeo, barnTimberMat);
    arm2.position.set(0, 0.48 + barnWallH + 1.15, gz);
    arm2.rotation.z = -0.55;
    barnGroup.add(arm2);
  });

  // F. Barn Front Double Doors (Facing Courtyard / +Z)
  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0.48, barnL * 0.5 + 0.04);

  // Frame trim
  const frameGeo = new THREE.BoxGeometry(1.4, 1.75, 0.1);
  const frame = new THREE.Mesh(frameGeo, barnTimberMat);
  frame.position.set(0, 0.875, 0);
  doorGroup.add(frame);

  // Left Door Leaf
  const doorLeafGeo = new THREE.BoxGeometry(0.58, 1.58, 0.07);
  const doorL = new THREE.Mesh(doorLeafGeo, barnTimberMat);
  doorL.position.set(-0.31, 0.83, 0.05);
  doorGroup.add(doorL);

  // Right Door Leaf
  const doorR = new THREE.Mesh(doorLeafGeo, barnTimberMat);
  doorR.position.set(0.31, 0.83, 0.05);
  doorGroup.add(doorR);

  // Forged Iron Strap Hinges on Doors
  const hingeGeo = new THREE.BoxGeometry(0.44, 0.07, 0.02);
  const hingePositions = [
    [-0.32, 1.38],
    [-0.32, 0.42],
    [0.32, 1.38],
    [0.32, 0.42]
  ];
  hingePositions.forEach(([hx, hy]) => {
    const hinge = new THREE.Mesh(hingeGeo, ironMetalMat);
    hinge.position.set(hx, hy, 0.1);
    doorGroup.add(hinge);
  });

  // Ring handles
  const ringGeo = new THREE.TorusGeometry(0.04, 0.012, 6, 12);
  const ringL = new THREE.Mesh(ringGeo, ironMetalMat);
  ringL.position.set(-0.1, 0.8, 0.11);
  doorGroup.add(ringL);

  const ringR = new THREE.Mesh(ringGeo, ironMetalMat);
  ringR.position.set(0.1, 0.8, 0.11);
  doorGroup.add(ringR);

  barnGroup.add(doorGroup);

  // G. Hayloft Loading Hatch & Hoist Beam (Upper Gable)
  const loftHatch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.06), barnTimberMat);
  loftHatch.position.set(0, 0.48 + barnWallH + 0.4, barnL * 0.5 + 0.06);
  barnGroup.add(loftHatch);

  // Protruding Hoist Timber Beam
  const hoistBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.95), barnTimberMat);
  hoistBeam.position.set(0, 0.48 + barnWallH + 0.9, barnL * 0.5 + 0.38);
  barnGroup.add(hoistBeam);

  // Hanging Pulley Rope & Iron Hook
  const ropeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.7, 4);
  const hoistRope = new THREE.Mesh(ropeGeo, burlapPropsMat);
  hoistRope.position.set(0, 0.48 + barnWallH + 0.48, barnL * 0.5 + 0.75);
  barnGroup.add(hoistRope);

  const hookGeo = new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI * 1.5);
  const hoistHook = new THREE.Mesh(hookGeo, ironMetalMat);
  hoistHook.position.set(0, 0.48 + barnWallH + 0.12, barnL * 0.5 + 0.75);
  barnGroup.add(hoistHook);

  // H. Attached Open Lean-To Shed (On Right side of Barn)
  const leanToGroup = new THREE.Group();
  leanToGroup.name = 'LeanToShed';

  // Timber Upright Posts for Lean-To (Width ~0.9m to the right)
  const leanPostGeo = new THREE.BoxGeometry(0.16, 1.7, 0.16);
  const leanPost1 = new THREE.Mesh(leanPostGeo, barnTimberMat);
  leanPost1.position.set(barnW * 0.5 + 0.85, 0.32 + 0.85, -barnL * 0.32);
  leanToGroup.add(leanPost1);

  const leanPost2 = new THREE.Mesh(leanPostGeo, barnTimberMat);
  leanPost2.position.set(barnW * 0.5 + 0.85, 0.32 + 0.85, barnL * 0.32);
  leanToGroup.add(leanPost2);

  // Lean-To Header Beam connecting posts
  const headerBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, barnL * 0.72), barnTimberMat);
  headerBeam.position.set(barnW * 0.5 + 0.85, 0.32 + 1.65, 0);
  leanToGroup.add(headerBeam);

  // Slanted Thatched Lean-To Roof
  const leanRoofGeo = new THREE.BoxGeometry(1.15, 0.14, barnL * 0.82);
  const leanRoof = new THREE.Mesh(leanRoofGeo, thatchMat);
  leanRoof.position.set(barnW * 0.5 + 0.45, 0.48 + barnWallH * 0.78, 0);
  leanRoof.rotation.z = -0.42;
  leanToGroup.add(leanRoof);

  // Stacked Chopped Firewood Logs under the lean-to
  const woodLogGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 7);
  woodLogGeo.rotateZ(Math.PI / 2);
  const logPositions = [
    [barnW * 0.5 + 0.25, 0.42, -0.4],
    [barnW * 0.5 + 0.46, 0.42, -0.4],
    [barnW * 0.5 + 0.67, 0.42, -0.4],
    [barnW * 0.5 + 0.35, 0.6, -0.4],
    [barnW * 0.5 + 0.56, 0.6, -0.4],
    [barnW * 0.5 + 0.46, 0.78, -0.4]
  ];
  logPositions.forEach(([lx, ly, lz]) => {
    const log = new THREE.Mesh(woodLogGeo, fenceWoodMat);
    log.position.set(lx, ly, lz);
    leanToGroup.add(log);
  });

  // Spare Wooden Wagon Wheel resting against lean-to post
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(barnW * 0.5 + 0.76, 0.68, 0.35);
  wheelGroup.rotation.y = 0.2;
  wheelGroup.rotation.z = 0.14;

  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 16), ironMetalMat);
  wheelGroup.add(wheelRim);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), barnTimberMat);
  wheelHub.rotateX(Math.PI / 2);
  wheelGroup.add(wheelHub);
  for (let sp = 0; sp < 6; sp++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 4), fenceWoodMat);
    spoke.rotation.z = sp * (Math.PI / 3);
    wheelGroup.add(spoke);
  }
  leanToGroup.add(wheelGroup);

  barnGroup.add(leanToGroup);

  // I. Warm Farmstead Lantern Hanging near Barn Door
  const lanternGroup = new THREE.Group();
  lanternGroup.position.set(-barnW * 0.5 - 0.1, 0.48 + 1.35, barnL * 0.5 - 0.18);

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.32), ironMetalMat);
  bracket.position.set(0, 0, 0.14);
  lanternGroup.add(bracket);

  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.07, 5), ironMetalMat);
  lanternCap.position.set(0, 0.07, 0.28);
  lanternGroup.add(lanternCap);

  const lanternBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.11), lanternGlowMat);
  lanternBody.position.set(0, -0.04, 0.28);
  lanternGroup.add(lanternBody);

  barnGroup.add(lanternGroup);

  farm.add(barnGroup);

  // =========================================================================
  // 4. MEDIEVAL STONE WATER WELL
  // =========================================================================
  const wellGroup = new THREE.Group();
  wellGroup.name = 'WaterWell';
  wellGroup.position.set(2.4, 0.32, 2.3);

  // A. Cobblestone Base Well Curb
  const wellOuterR = 0.72;
  const wellInnerR = 0.5;
  const wellH = 0.75;

  const wellBaseGeo = new THREE.CylinderGeometry(wellOuterR, wellOuterR * 1.05, wellH, 10);
  const wellBase = new THREE.Mesh(wellBaseGeo, stoneWellMat);
  wellBase.position.y = wellH * 0.5;
  wellGroup.add(wellBase);

  // Top Chiseled Stone Coping Ring
  const wellCopingGeo = new THREE.TorusGeometry((wellOuterR + wellInnerR) * 0.5, 0.11, 8, 12);
  wellCopingGeo.rotateX(Math.PI / 2);
  const wellCoping = new THREE.Mesh(wellCopingGeo, stoneWellMat);
  wellCoping.position.y = wellH;
  wellGroup.add(wellCoping);

  // B. Dark Well Interior & Reflective Water Surface
  const wellWaterGeo = new THREE.CircleGeometry(wellInnerR * 0.95, 10);
  wellWaterGeo.rotateX(-Math.PI / 2);
  const wellWater = new THREE.Mesh(wellWaterGeo, waterMat);
  wellWater.position.y = 0.25; // Inside well shaft
  wellGroup.add(wellWater);

  // C. Sturdy Twin Timber Uprights
  const uprightGeo = new THREE.BoxGeometry(0.15, 1.8, 0.15);
  const uprightL = new THREE.Mesh(uprightGeo, fenceWoodMat);
  uprightL.position.set(-wellOuterR * 0.78, 0.9, 0);
  wellGroup.add(uprightL);

  const uprightR = new THREE.Mesh(uprightGeo, fenceWoodMat);
  uprightR.position.set(wellOuterR * 0.78, 0.9, 0);
  wellGroup.add(uprightR);

  // Crossbeam Connecting Uprights
  const crossbeamGeo = new THREE.BoxGeometry(wellOuterR * 1.8, 0.14, 0.14);
  const crossbeam = new THREE.Mesh(crossbeamGeo, fenceWoodMat);
  crossbeam.position.set(0, 1.72, 0);
  wellGroup.add(crossbeam);

  // D. Timber Winch Axle Drum & Rope Coil
  const winchAxleGeo = new THREE.CylinderGeometry(0.08, 0.08, wellOuterR * 1.4, 8);
  winchAxleGeo.rotateZ(Math.PI / 2);
  const winchAxle = new THREE.Mesh(winchAxleGeo, fenceWoodMat);
  winchAxle.position.set(0, 1.35, 0);
  wellGroup.add(winchAxle);

  // Coiled Hemp Rope on Axle
  const ropeCoilGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8);
  ropeCoilGeo.rotateZ(Math.PI / 2);
  const ropeCoil = new THREE.Mesh(ropeCoilGeo, burlapPropsMat);
  ropeCoil.position.set(0, 1.35, 0);
  wellGroup.add(ropeCoil);

  // Suspended Rope Hanging to Bucket
  const hangingRopeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4);
  const hangingRope = new THREE.Mesh(hangingRopeGeo, burlapPropsMat);
  hangingRope.position.set(0, 1.05, 0);
  wellGroup.add(hangingRope);

  // Forged Iron Crank Handle with Wooden Grip
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), ironMetalMat);
  crankArm.position.set(wellOuterR * 0.85, 1.25, 0);
  wellGroup.add(crankArm);

  const crankHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), fenceWoodMat);
  crankHandle.rotateX(Math.PI / 2);
  crankHandle.position.set(wellOuterR * 0.85, 1.1, 0.08);
  wellGroup.add(crankHandle);

  // E. Wooden Water Bucket with Iron Hoops Suspended Over Well
  const bucketGroup = new THREE.Group();
  bucketGroup.position.set(0, 0.72, 0);

  const bucketBody = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.26, 8, 1, true), barnTimberMat);
  bucketGroup.add(bucketBody);

  const bucketBottom = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), barnTimberMat);
  bucketBottom.rotateX(Math.PI / 2);
  bucketBottom.position.y = -0.13;
  bucketGroup.add(bucketBottom);

  // Iron hoops on bucket
  const hoopTop = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 4, 12), ironMetalMat);
  hoopTop.rotateX(Math.PI / 2);
  hoopTop.position.y = 0.08;
  bucketGroup.add(hoopTop);

  const hoopBot = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.01, 4, 12), ironMetalMat);
  hoopBot.rotateX(Math.PI / 2);
  hoopBot.position.y = -0.08;
  bucketGroup.add(hoopBot);

  // Bucket wire bail handle
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 4, 10, Math.PI), ironMetalMat);
  bail.position.y = 0.12;
  bucketGroup.add(bail);

  wellGroup.add(bucketGroup);

  // F. Miniature Thatched / Shingled Canopy Roof over the Well
  const canopySlopeGeo = new THREE.BoxGeometry(0.9, 0.1, 1.15);

  const canopyL = new THREE.Mesh(canopySlopeGeo, thatchMat);
  canopyL.position.set(-0.4, 2.05, 0);
  canopyL.rotation.z = 0.72;
  wellGroup.add(canopyL);

  const canopyR = new THREE.Mesh(canopySlopeGeo, thatchMat);
  canopyR.position.set(0.4, 2.05, 0);
  canopyR.rotation.z = -0.72;
  wellGroup.add(canopyR);

  const canopyRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5), thatchMat);
  canopyRidge.rotateX(Math.PI / 2);
  canopyRidge.position.set(0, 2.38, 0);
  wellGroup.add(canopyRidge);

  farm.add(wellGroup);

  // =========================================================================
  // 5. SPLIT-RAIL RUSTIC WOODEN FENCES ENCLOSING CROP PERIMETER
  // =========================================================================
  const fenceGroup = new THREE.Group();
  fenceGroup.name = 'SplitRailFences';

  // Helper to place a fence section between two 2D points (x1, z1) -> (x2, z2)
  function addFenceSpan(x1, z1, x2, z2, hasStartPost = true) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const midX = (x1 + x2) * 0.5;
    const midZ = (z1 + z2) * 0.5;

    // Start Post
    if (hasStartPost) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), fenceWoodMat);
      post.position.set(x1, 0.32 + 0.5, z1);
      // Slight rustic tilt
      post.rotation.y = (x1 + z1) * 2;
      fenceGroup.add(post);
    }

    // Top Split Rail
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len + 0.1), fenceWoodMat);
    topRail.position.set(midX, 0.32 + 0.72, midZ);
    topRail.rotation.y = angle;
    fenceGroup.add(topRail);

    // Bottom Split Rail
    const botRail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len + 0.1), fenceWoodMat);
    botRail.position.set(midX, 0.32 + 0.38, midZ);
    botRail.rotation.y = angle;
    fenceGroup.add(botRail);
  }

  // Left perimeter fence segments
  addFenceSpan(-4.0, 4.0, -4.0, 2.0);
  addFenceSpan(-4.0, 2.0, -4.0, 0.0);
  addFenceSpan(-4.0, 0.0, -4.0, -2.0);
  addFenceSpan(-4.0, -2.0, -4.0, -4.0);

  // Rear perimeter fence segments (behind crop field up to barn)
  addFenceSpan(-4.0, -4.0, -2.0, -4.0);
  addFenceSpan(-2.0, -4.0, 0.0, -4.0);
  addFenceSpan(0.0, -4.0, 1.2, -4.0);

  // Front perimeter fence segments (with gate gap between -0.2 and 1.4)
  addFenceSpan(-4.0, 4.0, -2.1, 4.0);
  addFenceSpan(-2.1, 4.0, -0.2, 4.0);

  // Gate Posts at the entrance
  const gatePostGeo = new THREE.BoxGeometry(0.22, 1.25, 0.22);
  const gatePostL = new THREE.Mesh(gatePostGeo, fenceWoodMat);
  gatePostL.position.set(-0.2, 0.32 + 0.625, 4.0);
  fenceGroup.add(gatePostL);

  const gatePostR = new THREE.Mesh(gatePostGeo, fenceWoodMat);
  gatePostR.position.set(1.4, 0.32 + 0.625, 4.0);
  fenceGroup.add(gatePostR);

  // Front fence continuation to the right of the gate
  addFenceSpan(1.4, 4.0, 3.4, 4.0, false);
  addFenceSpan(3.4, 4.0, 4.0, 4.0, true);

  // Right side fence (from front to well area)
  addFenceSpan(4.0, 4.0, 4.0, 1.4, true);

  // End terminal post
  const endPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.18), fenceWoodMat);
  endPost.position.set(4.0, 0.32 + 0.5, 1.4);
  fenceGroup.add(endPost);

  farm.add(fenceGroup);

  // =========================================================================
  // 6. RICH DETAIL PROPS (Hay Bales, Grain Sacks, Pitchfork, Rake, Vegetation)
  // =========================================================================
  const propsGroup = new THREE.Group();
  propsGroup.name = 'DetailProps';

  // A. Golden Hay Bales (Stacked neatly near barn lean-to)
  const hayBaleGeo = new THREE.BoxGeometry(0.85, 0.55, 0.55);
  // Bale 1 (Bottom)
  const bale1 = new THREE.Mesh(hayBaleGeo, wheatMat);
  bale1.position.set(3.5, 0.32 + 0.275, -0.2);
  bale1.rotation.y = 0.1;
  propsGroup.add(bale1);

  // Bale 2 (Bottom adjacent)
  const bale2 = new THREE.Mesh(hayBaleGeo, wheatMat);
  bale2.position.set(3.4, 0.32 + 0.275, 0.45);
  bale2.rotation.y = -0.15;
  propsGroup.add(bale2);

  // Bale 3 (Perched on top)
  const bale3 = new THREE.Mesh(hayBaleGeo, wheatMat);
  bale3.position.set(3.45, 0.32 + 0.55 + 0.275, 0.1);
  bale3.rotation.y = 0.35;
  propsGroup.add(bale3);

  // B. Bulging Burlap Grain Sacks (Resting against barn wall)
  const sackPositions = [
    { x: 1.35, z: -0.65, rotY: 0.2, scaleY: 1.0 },
    { x: 1.25, z: -0.2, rotY: -0.4, scaleY: 0.9 },
    { x: 3.4, z: 1.2, rotY: 0.5, scaleY: 0.95 }
  ];

  sackPositions.forEach(sp => {
    const sackSub = new THREE.Group();
    sackSub.position.set(sp.x, 0.32, sp.z);
    sackSub.rotation.y = sp.rotY;

    // Sack lower plump body
    const sackBodyGeo = new THREE.SphereGeometry(0.28, 7, 6);
    sackBodyGeo.scale(1.0, 1.2 * sp.scaleY, 0.85);
    const sMesh = new THREE.Mesh(sackBodyGeo, burlapPropsMat);
    sMesh.position.y = 0.28 * sp.scaleY;
    sackSub.add(sMesh);

    // Sack tied neck
    const sNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.1, 6), burlapPropsMat);
    sNeck.position.y = 0.54 * sp.scaleY;
    sackSub.add(sNeck);

    // Hemp cord tie band
    const sTie = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 4, 8), fenceWoodMat);
    sTie.rotateX(Math.PI / 2);
    sTie.position.y = 0.52 * sp.scaleY;
    sackSub.add(sTie);

    // Flared top burlap hem
    const sTop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 6), burlapPropsMat);
    sTop.position.y = 0.62 * sp.scaleY;
    sackSub.add(sTop);

    propsGroup.add(sackSub);
  });

  // C. Forged Iron Pitchfork (Leaning realistically against the barn door frame)
  const pitchforkGroup = new THREE.Group();
  pitchforkGroup.position.set(1.45, 0.32, -0.45);
  pitchforkGroup.rotation.set(-0.25, 0.4, 0.15); // Leaning back against wall

  // Long wooden shaft
  const handleGeo = new THREE.CylinderGeometry(0.02, 0.025, 1.7, 5);
  const handle = new THREE.Mesh(handleGeo, fenceWoodMat);
  handle.position.y = 0.85;
  pitchforkGroup.add(handle);

  // Iron head socket & crossbar
  const forkCrossbar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.03), ironMetalMat);
  forkCrossbar.position.y = 1.7;
  pitchforkGroup.add(forkCrossbar);

  // 3 Curved forged steel tines
  [-0.11, 0.0, 0.11].forEach(tx => {
    const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.35, 4), ironMetalMat);
    tine.position.set(tx, 1.86, 0.04);
    tine.rotation.x = 0.22; // Slight forward curve
    pitchforkGroup.add(tine);
  });

  propsGroup.add(pitchforkGroup);

  // D. Garden Rake Resting beside Grain Sacks
  const rakeGroup = new THREE.Group();
  rakeGroup.position.set(1.05, 0.32, -0.65);
  rakeGroup.rotation.set(-0.35, -0.6, -0.1);

  const rakeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.5, 5), fenceWoodMat);
  rakeHandle.position.y = 0.75;
  rakeGroup.add(rakeHandle);

  const rakeHead = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.03), ironMetalMat);
  rakeHead.position.y = 1.5;
  rakeGroup.add(rakeHead);

  // 5 small rake teeth
  for (let rt = -0.14; rt <= 0.15; rt += 0.07) {
    const tooth = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.12, 3), ironMetalMat);
    tooth.position.set(rt, 1.56, 0.02);
    rakeGroup.add(tooth);
  }

  propsGroup.add(rakeGroup);

  // E. Stylized Grass Clumps and Wildflowers along fence perimeter
  const grassBladeGeo = new THREE.ConeGeometry(0.04, 0.3, 3);
  const grassMat = materials.leafGreen1;
  const flowerPetalMat = materials.featherWhite;
  const flowerCoreMat = materials.flowerCenter;

  const vegetationSpots = [
    [-3.8, 3.8],
    [-3.8, -3.8],
    [3.8, 3.8],
    [0.1, 3.9],
    [-0.5, 4.0],
    [1.7, 3.9],
    [-3.8, 0.5],
    [3.1, 1.8]
  ];

  vegetationSpots.forEach(([vx, vz], idx) => {
    const vegGroup = new THREE.Group();
    vegGroup.position.set(vx, 0.32, vz);

    // 3 blades of grass in fan rosette
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(grassBladeGeo, grassMat);
      blade.position.y = 0.15;
      blade.rotation.set((b - 1) * 0.25, b * 1.2, (b - 1) * 0.2);
      vegGroup.add(blade);
    }

    // Tiny daisy flower on some clumps
    if (idx % 2 === 0) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 3), grassMat);
      stem.position.set(0.05, 0.11, 0.05);
      vegGroup.add(stem);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), flowerCoreMat);
      core.position.set(0.05, 0.23, 0.05);
      vegGroup.add(core);

      const petalRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 4, 8), flowerPetalMat);
      petalRing.rotateX(Math.PI / 2);
      petalRing.position.set(0.05, 0.23, 0.05);
      vegGroup.add(petalRing);
    }

    propsGroup.add(vegGroup);
  });

  farm.add(propsGroup);

  return enableShadows(farm);
}
