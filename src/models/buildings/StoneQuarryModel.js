import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getQuarryRockTextures,
  getDressedStoneTextures,
  getCraneTimberRopeTextures,
  getQuarryToolsTextures
} from './stoneQuarryTextures.js';

/**
 * Next-Gen Stylized Low-Poly Stone Quarry (Pedreira)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Features:
 * - Multi-tiered stepped excavation pit carved into rocky limestone terrain with terraced benches.
 * - Heavy wooden derrick hoist / crane mechanism: tall timber mast, angled boom arm, rope rigging,
 *   winch drum with spoked crank wheels, and a suspended stone sling carrying a freshly-cut ashlar block.
 * - Neatly stacked pallets of dressed masonry blocks with drafted margins, bevels, and stonemason guild marks.
 * - Sturdy wooden access ladders connecting the quarry terraces.
 * - Detailed quarry worker tools: heavy iron sledgehammers, steel pry bars wedged in cleavage lines,
 *   stonecutter's splitting station with iron wedges, and a realistic wooden wheelbarrow loaded with stone rubble.
 * - Piles of fractured stone chips, measuring square, tool trestle, and warm illuminated iron lantern on a post.
 * - Scale fits WarPoly game standards (~8x8 to 9x9 footprint).
 *
 * @returns {THREE.Group}
 */
export function createStoneQuarry() {
  const quarry = new THREE.Group();
  quarry.name = 'StoneQuarry';

  // =========================================================================
  // 1. PBR MATERIALS SETUP
  // =========================================================================
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

  const rockTex = getQuarryRockTextures();
  const stoneTex = getDressedStoneTextures();
  const timberRopeTex = getCraneTimberRopeTextures();
  const toolsTex = getQuarryToolsTextures();

  // Natural Limestone / Granite rock face & terraced benches
  const rockMat = createPBRMaterial(rockTex, {
    bumpScale: 0.08,
    roughness: 0.90,
    metalness: 0.0
  });

  // Squared Dressed Ashlar Blocks with Drafted Margins & Mason Guild Marks
  const dressedStoneMat = createPBRMaterial(stoneTex, {
    bumpScale: 0.06,
    roughness: 0.72,
    metalness: 0.0
  });

  // Crane Heavy Timber Beams, Mast & Ladders
  const craneTimberMat = createPBRMaterial(timberRopeTex, {
    bumpScale: 0.06,
    roughness: 0.76,
    metalness: 0.0
  });

  // Twisted Hemp Rope Rigging
  const ropeMat = createPBRMaterial(timberRopeTex, {
    bumpScale: 0.08,
    roughness: 0.88,
    metalness: 0.0
  });

  // Forged Wrought Iron Hardware, Straps, Bolts, Hooks & Pulley Sheaves
  const ironMat = new THREE.MeshStandardMaterial({
    map: timberRopeTex.map,
    roughnessMap: timberRopeTex.roughnessMap,
    metalnessMap: timberRopeTex.metalnessMap,
    bumpMap: timberRopeTex.bumpMap,
    bumpScale: 0.05,
    roughness: 0.38,
    metalness: 0.85,
    color: 0x5a626a
  });

  // Dark Hardened Steel for Sledgehammer Heads & Pry Bars
  const toolSteelMat = new THREE.MeshStandardMaterial({
    map: toolsTex.map,
    roughnessMap: toolsTex.roughnessMap,
    metalnessMap: toolsTex.metalnessMap,
    bumpMap: toolsTex.bumpMap,
    bumpScale: 0.05,
    roughness: 0.32,
    metalness: 0.88,
    color: 0x4a5158
  });

  // Wooden Pallets, Wheelbarrow & Tool Handles
  const woodPlanksMat = createPBRMaterial(toolsTex, {
    bumpScale: 0.06,
    roughness: 0.75,
    metalness: 0.0
  });

  // Fractured Stone Rubble & Gravel Chips
  const rubbleMat = createPBRMaterial(toolsTex, {
    bumpScale: 0.09,
    roughness: 0.92,
    metalness: 0.0
  });

  // Glowing Fantasy Lantern Core (Warcraft / Overwatch RTS warm ambient)
  const lanternGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffb74d,
    emissive: 0xff8f00,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.1
  });

  // =========================================================================
  // 2. BASE GROUND PLATFORM & QUARRY EXCAVATION PIT BEDROCK
  // =========================================================================
  const groundGroup = new THREE.Group();
  groundGroup.name = 'GroundBedrock';

  // Base foundation slab
  const baseSlab = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.4, 8.6),
    rockMat
  );
  baseSlab.position.y = 0.2;
  groundGroup.add(baseSlab);

  // Compacted gravel yard apron (front/southeast zone)
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.06, 4.2),
    rubbleMat
  );
  apron.position.set(1.5, 0.43, 1.8);
  groundGroup.add(apron);

  // Sunken bedrock extraction channels in quarry pit floor
  const pitFloor = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.08, 3.8),
    rockMat
  );
  pitFloor.position.set(-1.4, 0.44, -0.6);
  groundGroup.add(pitFloor);

  // Chiseled bedrock extraction grooves (grid where blocks were excavated)
  for (let gx = -3.0; gx <= 0.2; gx += 1.05) {
    const grooveX = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.4), rockMat);
    grooveX.position.set(gx, 0.48, -0.6);
    groundGroup.add(grooveX);
  }
  for (let gz = -2.0; gz <= 1.0; gz += 0.95) {
    const grooveZ = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.08), rockMat);
    grooveZ.position.set(-1.4, 0.48, gz);
    groundGroup.add(grooveZ);
  }

  quarry.add(groundGroup);

  // =========================================================================
  // 3. STEPPED TERRACED CLIFFS & EXCAVATION BENCHES
  // =========================================================================
  const terraceGroup = new THREE.Group();
  terraceGroup.name = 'TerracedCliffs';

  // --- Tier 1: Intermediate Working Bench (Y: 1.4 to 1.7) ---
  const bench1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 2.8), rockMat);
  bench1.position.set(-2.2, 1.0, -1.8);
  terraceGroup.add(bench1);

  const bench1Extension = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), rockMat);
  bench1Extension.position.set(-2.8, 1.0, 0.2);
  terraceGroup.add(bench1Extension);

  // Semi-extracted ashlar blocks still attached to rock wall on Tier 1
  const halfCut1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.8), dressedStoneMat);
  halfCut1.position.set(-3.2, 1.9, -1.2);
  terraceGroup.add(halfCut1);

  const halfCut2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.75), dressedStoneMat);
  halfCut2.position.set(-2.3, 1.9, -2.6);
  terraceGroup.add(halfCut2);

  // Split seam wedge line between rock wall and extraction block
  const wedgeSeam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.85), ironMat);
  wedgeSeam.position.set(-2.72, 1.9, -1.2);
  terraceGroup.add(wedgeSeam);

  // 3 Iron splitting wedges driven into the cleavage line
  for (let w = -0.3; w <= 0.3; w += 0.3) {
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), toolSteelMat);
    wedge.position.set(-2.72, 2.28, -1.2 + w);
    wedge.rotation.x = Math.PI;
    terraceGroup.add(wedge);
  }

  // --- Tier 2: High Cliff Escarpment (Y: 2.6 to 3.8) ---
  // North back wall
  const highCliffNorth = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.4, 2.0), rockMat);
  highCliffNorth.position.set(-1.0, 2.6, -3.2);
  terraceGroup.add(highCliffNorth);

  // Northwest corner bastion
  const highCliffNW = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 2.8), rockMat);
  highCliffNW.position.set(-3.0, 2.6, -2.8);
  terraceGroup.add(highCliffNW);

  // West cliff ridge
  const highCliffWest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 3.2), rockMat);
  highCliffWest.position.set(-3.4, 2.3, -0.2);
  terraceGroup.add(highCliffWest);

  // Low-poly natural rock crags along the upper ridge for silhouette
  const cragDefs = [
    { x: -3.4, y: 4.1, z: -2.8, s: 1.1, rot: [0.3, 0.5, 0.2] },
    { x: -2.2, y: 3.9, z: -3.5, s: 1.3, rot: [-0.2, 0.8, -0.3] },
    { x: -0.6, y: 4.0, z: -3.6, s: 1.4, rot: [0.4, 0.2, -0.4] },
    { x: 1.0, y: 3.6, z: -3.4, s: 1.2, rot: [-0.3, 0.6, 0.1] },
    { x: -3.8, y: 3.4, z: -0.8, s: 1.1, rot: [0.5, -0.4, 0.3] },
    { x: -3.6, y: 2.8, z: 1.2, s: 0.9, rot: [-0.2, 0.3, 0.5] }
  ];

  cragDefs.forEach(c => {
    const rockCrag = new THREE.Mesh(new THREE.DodecahedronGeometry(c.s, 0), rockMat);
    rockCrag.position.set(c.x, c.y, c.z);
    rockCrag.rotation.set(c.rot[0], c.rot[1], c.rot[2]);
    terraceGroup.add(rockCrag);
  });

  // Elevated Crane Bedrock Promontory (East / Northeast promontory)
  const cranePromontory = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 2.6), rockMat);
  cranePromontory.position.set(2.2, 1.1, -1.8);
  terraceGroup.add(cranePromontory);

  const craneBoulders = [
    { x: 3.4, y: 1.6, z: -2.6, s: 1.1 },
    { x: 3.3, y: 1.3, z: -0.8, s: 0.95 },
    { x: 1.1, y: 1.0, z: -2.8, s: 0.85 }
  ];
  craneBoulders.forEach(b => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(b.s, 0), rockMat);
    rock.position.set(b.x, b.y, b.z);
    rock.rotation.set(b.x * 0.4, b.y * 0.5, b.z * 0.3);
    terraceGroup.add(rock);
  });

  // Safety railing along upper cliff rim
  const fencePosts = [
    { x: -3.1, y: 3.8, z: -1.7 },
    { x: -2.0, y: 3.9, z: -2.2 },
    { x: -0.8, y: 3.9, z: -2.3 },
    { x: 0.4, y: 3.8, z: -2.4 }
  ];
  fencePosts.forEach(fp => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), craneTimberMat);
    post.position.set(fp.x, fp.y + 0.35, fp.z);
    terraceGroup.add(post);
  });
  // Warning rope strung between posts
  for (let i = 0; i < fencePosts.length - 1; i++) {
    const p1 = fencePosts[i];
    const p2 = fencePosts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ropeSegment = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 6), ropeMat);
    ropeSegment.position.set((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5 + 0.6, (p1.z + p2.z) * 0.5);
    ropeSegment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    terraceGroup.add(ropeSegment);
  }

  quarry.add(terraceGroup);

  // =========================================================================
  // 4. HEAVY WOODEN DERRICK HOIST / CRANE MECHANISM
  // =========================================================================
  const craneGroup = new THREE.Group();
  craneGroup.name = 'DerrickCrane';
  craneGroup.position.set(2.2, 1.8, -1.8);

  // 1. Foundation Base Sill Timbers (Sole Plates)
  const sill1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.28), craneTimberMat);
  sill1.position.set(0, 0.11, 0);
  craneGroup.add(sill1);

  const sill2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 2.2), craneTimberMat);
  sill2.position.set(0, 0.11, 0);
  craneGroup.add(sill2);

  // Iron base anchor plates and bolts
  for (let ax = -0.9; ax <= 0.9; ax += 1.8) {
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.32), ironMat);
    anchor.position.set(ax, 0.24, 0);
    craneGroup.add(anchor);
  }

  // 2. Vertical Timber Mast
  const mastHeight = 4.8;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.36, mastHeight, 0.36), craneTimberMat);
  mast.position.set(0, mastHeight * 0.5, 0);
  craneGroup.add(mast);

  // Masthead Cap & Iron Pulley Housing
  const mastCap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.32, 0.44), ironMat);
  mastCap.position.set(0, mastHeight, 0);
  craneGroup.add(mastCap);

  // Dual Crown Pulley Sheaves at Masthead
  const crownPulleyL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), ironMat);
  crownPulleyL.rotation.z = Math.PI * 0.5;
  crownPulleyL.position.set(-0.24, mastHeight + 0.1, 0);
  craneGroup.add(crownPulleyL);

  const crownPulleyR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), ironMat);
  crownPulleyR.rotation.z = Math.PI * 0.5;
  crownPulleyR.position.set(0.24, mastHeight + 0.1, 0);
  craneGroup.add(crownPulleyR);

  // 3. Diagonal Gallows Backstays & Mast Braces
  const braceAngle = 0.58;
  const braceLen = 2.8;

  // Backstay 1 (North-East direction)
  const backstay1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, braceLen, 0.2), craneTimberMat);
  backstay1.position.set(0.55, 1.25, -0.65);
  backstay1.rotation.set(-braceAngle, 0, -0.38);
  craneGroup.add(backstay1);

  // Backstay 2 (South-East direction)
  const backstay2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, braceLen, 0.2), craneTimberMat);
  backstay2.position.set(0.55, 1.25, 0.65);
  backstay2.rotation.set(braceAngle, 0, -0.38);
  craneGroup.add(backstay2);

  // Rear Anchor Tie-Down (deadman rope to rock)
  const deadmanRope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.8, 6), ropeMat);
  deadmanRope.position.set(0.8, 2.3, 0);
  deadmanRope.rotation.z = -0.36;
  craneGroup.add(deadmanRope);

  // 4. Heavy Angled Boom Arm (Jib)
  const boomLen = 4.6;
  const boomArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, boomLen, 0.28), craneTimberMat);
  // Pivot point at mast height = 1.0, angled out at ~50 deg toward excavation pit
  boomArm.position.set(-1.6, 2.3, 1.5);
  boomArm.rotation.set(0.58, 0.42, 0.72);
  craneGroup.add(boomArm);

  // Forged Iron Boom Pivot Knuckle on Mast
  const pivotKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.35, 0.42), ironMat);
  pivotKnuckle.position.set(0, 0.9, 0);
  craneGroup.add(pivotKnuckle);

  // Boom Tip Pulley Block & Shackle
  const boomTipPos = new THREE.Vector3(-2.8, 3.5, 2.6); // Relative to craneGroup
  const boomTipBlock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.32), ironMat);
  boomTipBlock.position.copy(boomTipPos);
  craneGroup.add(boomTipBlock);

  const boomTipSheave = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), ironMat);
  boomTipSheave.rotation.x = Math.PI * 0.5;
  boomTipSheave.position.copy(boomTipPos);
  craneGroup.add(boomTipSheave);

  // 5. Rigging Cables (Topping Lift & Tension Stays)
  // Topping lift cable from Masthead (0, mastHeight, 0) to Boom Tip
  const mastHeadPos = new THREE.Vector3(0, mastHeight, 0);
  const stayVec = new THREE.Vector3().subVectors(boomTipPos, mastHeadPos);
  const stayLen = stayVec.length();
  const toppingLift = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, stayLen, 6), ropeMat);
  toppingLift.position.copy(mastHeadPos).addScaledVector(stayVec, 0.5);
  toppingLift.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stayVec.normalize());
  craneGroup.add(toppingLift);

  // 6. Winch Drum & Cranking Gear Mechanism
  const winchFrame = new THREE.Group();
  winchFrame.position.set(0.1, 0.5, 0.5);

  // Upright timber posts
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), craneTimberMat);
  postL.position.set(-0.25, 0, 0);
  winchFrame.add(postL);

  const postR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), craneTimberMat);
  postR.position.set(0.25, 0, 0);
  winchFrame.add(postR);

  // Winch Drum with coiled rope
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.42, 12), ropeMat);
  drum.rotation.z = Math.PI * 0.5;
  winchFrame.add(drum);

  // Iron axle and ratchets
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 8), toolSteelMat);
  axle.rotation.z = Math.PI * 0.5;
  winchFrame.add(axle);

  const ratchetGear = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 8), ironMat);
  ratchetGear.rotation.z = Math.PI * 0.5;
  ratchetGear.position.set(-0.28, 0, 0);
  winchFrame.add(ratchetGear);

  // 4-Spoke Wooden Turning Wheels & Crank Handles on both sides
  for (let side = -1; side <= 1; side += 2) {
    const wheelX = side * 0.36;
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 6, 12), craneTimberMat);
    wheelRim.rotation.y = Math.PI * 0.5;
    wheelRim.position.set(wheelX, 0, 0);
    winchFrame.add(wheelRim);

    // Spokes
    const spoke1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), craneTimberMat);
    spoke1.position.set(wheelX, 0, 0);
    winchFrame.add(spoke1);

    const spoke2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), craneTimberMat);
    spoke2.rotation.x = Math.PI * 0.5;
    spoke2.position.set(wheelX, 0, 0);
    winchFrame.add(spoke2);

    // Crank handle peg
    const crankPeg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6), craneTimberMat);
    crankPeg.rotation.z = Math.PI * 0.5;
    crankPeg.position.set(wheelX + side * 0.09, 0.26, 0);
    winchFrame.add(crankPeg);
  }

  craneGroup.add(winchFrame);

  // 7. Hoist Cable Running to Suspended Load
  // Vertical hoist rope dropping from boom tip down to sling hook
  const dropHeight = 2.1;
  const hoistRope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, dropHeight, 6), ropeMat);
  hoistRope.position.set(boomTipPos.x, boomTipPos.y - dropHeight * 0.5, boomTipPos.z);
  craneGroup.add(hoistRope);

  // Heavy Forged Iron Hoist Hook & Quarry Lifting Tongs (Scissor Grab)
  const hookGroup = new THREE.Group();
  hookGroup.position.set(boomTipPos.x, boomTipPos.y - dropHeight, boomTipPos.z);

  const hookShackle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 8), ironMat);
  hookGroup.add(hookShackle);

  // Scissor grab arms
  const scissorArm1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), ironMat);
  scissorArm1.position.set(-0.25, -0.2, 0);
  scissorArm1.rotation.z = -0.35;
  hookGroup.add(scissorArm1);

  const scissorArm2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), ironMat);
  scissorArm2.position.set(0.25, -0.2, 0);
  scissorArm2.rotation.z = 0.35;
  hookGroup.add(scissorArm2);

  // 4-Part Rope Sling Cradle under the stone block
  const slingRope1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), ropeMat);
  slingRope1.position.set(-0.35, -0.4, -0.4);
  slingRope1.rotation.set(-0.4, 0, -0.5);
  hookGroup.add(slingRope1);

  const slingRope2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), ropeMat);
  slingRope2.position.set(0.35, -0.4, -0.4);
  slingRope2.rotation.set(-0.4, 0, 0.5);
  hookGroup.add(slingRope2);

  const slingRope3 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), ropeMat);
  slingRope3.position.set(-0.35, -0.4, 0.4);
  slingRope3.rotation.set(0.4, 0, -0.5);
  hookGroup.add(slingRope3);

  const slingRope4 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), ropeMat);
  slingRope4.position.set(0.35, -0.4, 0.4);
  slingRope4.rotation.set(0.4, 0, 0.5);
  hookGroup.add(slingRope4);

  // 8. The Suspended Cut Ashlar Stone Block (Hero centerpiece!)
  // Perfectly squared ashlar block with drafted margins and mason marks
  const suspendedBlock = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 0.95), dressedStoneMat);
  suspendedBlock.position.set(0, -0.65, 0);
  suspendedBlock.rotation.set(0.06, 0.22, -0.04); // Dynamic tilt in flight
  hookGroup.add(suspendedBlock);

  craneGroup.add(hookGroup);
  quarry.add(craneGroup);

  // =========================================================================
  // 5. NEATLY STACKED PALLETS OF CUT MASONRY BLOCKS READY FOR TRANSPORT
  // =========================================================================
  const stagingGroup = new THREE.Group();
  stagingGroup.name = 'MasonryStagingYard';

  /**
   * Helper: Create a sturdy heavy wooden transport pallet skid
   */
  function createPallet(width = 1.8, depth = 1.4) {
    const pallet = new THREE.Group();
    // 3 longitudinal runner beams
    for (let rx = -width * 0.42; rx <= width * 0.42; rx += width * 0.42) {
      const runner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, depth), woodPlanksMat);
      runner.position.set(rx, 0.07, 0);
      pallet.add(runner);
    }
    // Top cross planks
    for (let pz = -depth * 0.44; pz <= depth * 0.44; pz += 0.24) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.18), woodPlanksMat);
      plank.position.set(0, 0.16, pz);
      pallet.add(plank);
    }
    return pallet;
  }

  // --- Pallet A: Stack of 4 Dressed Wall Ashlars (2 bottom, 2 top) ---
  const palletA = new THREE.Group();
  palletA.position.set(2.4, 0.44, 2.2);
  palletA.rotation.y = -0.25;
  palletA.add(createPallet(1.8, 1.4));

  // Bottom layer blocks
  const pBlockA1 = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.58, 0.95), dressedStoneMat);
  pBlockA1.position.set(-0.42, 0.47, 0);
  palletA.add(pBlockA1);

  const pBlockA2 = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.58, 0.95), dressedStoneMat);
  pBlockA2.position.set(0.42, 0.47, 0);
  palletA.add(pBlockA2);

  // Top layer blocks
  const pBlockA3 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.54, 0.88), dressedStoneMat);
  pBlockA3.position.set(-0.38, 1.03, 0.02);
  palletA.add(pBlockA3);

  const pBlockA4 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.54, 0.88), dressedStoneMat);
  pBlockA4.position.set(0.38, 1.03, -0.02);
  palletA.add(pBlockA4);

  stagingGroup.add(palletA);

  // --- Pallet B: Massive Foundation Stones & Lintel Blocks ---
  const palletB = new THREE.Group();
  palletB.position.set(0.6, 0.44, 2.8);
  palletB.rotation.y = 0.32;
  palletB.add(createPallet(1.6, 1.2));

  // 2 Monumental foundation blocks
  const pBlockB1 = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 0.48), dressedStoneMat);
  pBlockB1.position.set(0, 0.49, -0.26);
  palletB.add(pBlockB1);

  const pBlockB2 = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 0.48), dressedStoneMat);
  pBlockB2.position.set(0, 0.49, 0.26);
  palletB.add(pBlockB2);

  stagingGroup.add(palletB);

  // --- Loose Staging Ashlar resting on dunnage sticks ---
  const looseBlockGroup = new THREE.Group();
  looseBlockGroup.position.set(-0.7, 0.44, 2.6);
  looseBlockGroup.rotation.y = -0.15;

  const dunnage1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.8), woodPlanksMat);
  dunnage1.position.set(-0.3, 0.03, 0);
  looseBlockGroup.add(dunnage1);

  const dunnage2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.8), woodPlanksMat);
  dunnage2.position.set(0.3, 0.03, 0);
  looseBlockGroup.add(dunnage2);

  const looseAshlar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.75), dressedStoneMat);
  looseAshlar.position.set(0, 0.38, 0);
  looseBlockGroup.add(looseAshlar);

  stagingGroup.add(looseBlockGroup);

  // Extra dressed blocks in pit floor ready for hoist sling
  const pitAshlar1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.82), dressedStoneMat);
  pitAshlar1.position.set(-0.8, 0.75, 0.6);
  pitAshlar1.rotation.y = 0.4;
  stagingGroup.add(pitAshlar1);

  const pitAshlar2 = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.58, 0.78), dressedStoneMat);
  pitAshlar2.position.set(0.2, 0.73, -0.4);
  pitAshlar2.rotation.y = -0.3;
  stagingGroup.add(pitAshlar2);

  quarry.add(stagingGroup);

  // =========================================================================
  // 6. WOODEN ACCESS LADDERS CONNECTING QUARRY TERRACES
  // =========================================================================
  const ladderGroup = new THREE.Group();
  ladderGroup.name = 'AccessLadders';

  /**
   * Helper: Build a sturdy wooden timber access ladder
   */
  function createLadder(length = 2.4, rungs = 7, width = 0.52) {
    const ladder = new THREE.Group();
    // Rails
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, length, 0.1), craneTimberMat);
    railL.position.x = -width * 0.5;
    ladder.add(railL);

    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.08, length, 0.1), craneTimberMat);
    railR.position.x = width * 0.5;
    ladder.add(railR);

    // Rungs
    const rungSpacing = (length - 0.4) / (rungs - 1);
    for (let r = 0; r < rungs; r++) {
      const rungY = -length * 0.5 + 0.2 + r * rungSpacing;
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, width - 0.04, 6), craneTimberMat);
      rung.rotation.z = Math.PI * 0.5;
      rung.position.y = rungY;
      ladder.add(rung);
    }
    return ladder;
  }

  // Ladder 1: Long main ladder from Pit Floor up to Intermediate Terrace (Tier 1)
  const ladder1 = createLadder(2.3, 7, 0.55);
  ladder1.position.set(-1.45, 1.25, 0.4);
  ladder1.rotation.set(-0.48, 0.25, -0.15);
  ladderGroup.add(ladder1);

  // Ladder 2: Intermediate Terrace up to High North Cliff Rim
  const ladder2 = createLadder(1.9, 6, 0.5);
  ladder2.position.set(-2.55, 2.3, -2.1);
  ladder2.rotation.set(0.42, 0.18, 0.12);
  ladderGroup.add(ladder2);

  // Ladder 3: Inspection access ladder on crane promontory
  const ladder3 = createLadder(1.5, 5, 0.45);
  ladder3.position.set(1.4, 1.1, -1.0);
  ladder3.rotation.set(0.35, -0.6, 0.15);
  ladderGroup.add(ladder3);

  quarry.add(ladderGroup);

  // =========================================================================
  // 7. QUARRY WORKER TOOLS, WHEELBARROW & DETAILED PROPS
  // =========================================================================
  const toolsGroup = new THREE.Group();
  toolsGroup.name = 'WorkerToolsAndProps';

  /**
   * Helper: Build a realistic medieval heavy iron sledgehammer
   */
  function createSledgehammer() {
    const hammer = new THREE.Group();
    // Ash wood handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.85, 8), woodPlanksMat);
    hammer.add(handle);

    // Hardened forged steel hammer head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.32), toolSteelMat);
    head.position.y = 0.36;
    hammer.add(head);

    // Striking face bevels
    const bevelL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), toolSteelMat);
    bevelL.position.set(0, 0.36, -0.18);
    hammer.add(bevelL);

    const bevelR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), toolSteelMat);
    bevelR.position.set(0, 0.36, 0.18);
    hammer.add(bevelR);

    return hammer;
  }

  // Sledgehammer 1: Leaning against Pallet A in transport yard
  const hammer1 = createSledgehammer();
  hammer1.position.set(1.55, 0.85, 2.1);
  hammer1.rotation.set(0.25, 0.3, 0.45);
  toolsGroup.add(hammer1);

  // Sledgehammer 2: Resting on Intermediate Bench near splitting line
  const hammer2 = createSledgehammer();
  hammer2.position.set(-1.8, 1.7, -1.2);
  hammer2.rotation.set(Math.PI * 0.5, 0, 0.65);
  toolsGroup.add(hammer2);

  // Steel Pry Bar 1: Wedged under extraction block on Tier 1
  const pryBar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.4, 8), toolSteelMat);
  pryBar1.position.set(-2.8, 2.05, -0.8);
  pryBar1.rotation.set(-0.65, 0.3, -0.45);
  toolsGroup.add(pryBar1);

  // Steel Pry Bar 2: Leaning against rock in pit floor
  const pryBar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.3, 8), toolSteelMat);
  pryBar2.position.set(-0.25, 0.95, -1.2);
  pryBar2.rotation.set(0.3, 0.1, 0.25);
  toolsGroup.add(pryBar2);

  // --- Medieval Quarry Worker Wheelbarrow ---
  const barrow = new THREE.Group();
  barrow.position.set(-2.1, 0.44, 2.4);
  barrow.rotation.y = -0.7;

  // Wheelbarrow chassis frame & handles
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), woodPlanksMat);
  frameL.position.set(-0.22, 0.25, 0);
  frameL.rotation.x = -0.12;
  barrow.add(frameL);

  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), woodPlanksMat);
  frameR.position.set(0.22, 0.25, 0);
  frameR.rotation.x = -0.12;
  barrow.add(frameR);

  // Solid wood wheel with iron tire rim at front
  const barrowWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), ironMat);
  barrowWheel.rotation.z = Math.PI * 0.5;
  barrowWheel.position.set(0, 0.22, -0.7);
  barrow.add(barrowWheel);

  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), toolSteelMat);
  wheelHub.rotation.z = Math.PI * 0.5;
  wheelHub.position.set(0, 0.22, -0.7);
  barrow.add(wheelHub);

  // Rear vertical rest legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), woodPlanksMat);
  legL.position.set(-0.22, 0.14, 0.45);
  barrow.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), woodPlanksMat);
  legR.position.set(0.22, 0.14, 0.45);
  barrow.add(legR);

  // Slanted timber hopper box
  const hopperBottom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.7), woodPlanksMat);
  hopperBottom.position.set(0, 0.34, -0.1);
  barrow.add(hopperBottom);

  const hopperFront = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), woodPlanksMat);
  hopperFront.position.set(0, 0.46, -0.44);
  hopperFront.rotation.x = -0.3;
  barrow.add(hopperFront);

  const hopperBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.04), woodPlanksMat);
  hopperBack.position.set(0, 0.46, 0.24);
  hopperBack.rotation.x = 0.25;
  barrow.add(hopperBack);

  const hopperSideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.72), woodPlanksMat);
  hopperSideL.position.set(-0.25, 0.46, -0.1);
  hopperSideL.rotation.z = -0.22;
  barrow.add(hopperSideL);

  const hopperSideR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.72), woodPlanksMat);
  hopperSideR.position.set(0.25, 0.46, -0.1);
  hopperSideR.rotation.z = 0.22;
  barrow.add(hopperSideR);

  // Fractured limestone rubble & stone chips filling the wheelbarrow
  const rubbleBarrow = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), rubbleMat);
  rubbleBarrow.position.set(0, 0.45, -0.1);
  rubbleBarrow.scale.set(1.4, 0.7, 1.2);
  barrow.add(rubbleBarrow);

  const chunk1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), rockMat);
  chunk1.position.set(-0.1, 0.58, -0.2);
  barrow.add(chunk1);

  const chunk2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), rockMat);
  chunk2.position.set(0.08, 0.59, 0.05);
  barrow.add(chunk2);

  toolsGroup.add(barrow);

  // --- Stonecutter's Tool Trestle Bench & Tools ---
  const benchGroup = new THREE.Group();
  benchGroup.position.set(-0.4, 0.44, -1.4);
  benchGroup.rotation.y = 0.2;

  // Heavy timber top slab
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.55), woodPlanksMat);
  benchTop.position.set(0, 0.65, 0);
  benchGroup.add(benchTop);

  // 4 Legs
  const legCoords = [
    [-0.5, 0.32, -0.2],
    [0.5, 0.32, -0.2],
    [-0.5, 0.32, 0.2],
    [0.5, 0.32, 0.2]
  ];
  legCoords.forEach(([lx, ly, lz]) => {
    const bLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.64, 0.1), woodPlanksMat);
    bLeg.position.set(lx, ly, lz);
    benchGroup.add(bLeg);
  });

  // Mason's steel chisel on bench
  const benchChisel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.28, 6), toolSteelMat);
  benchChisel.position.set(-0.25, 0.73, 0.05);
  benchChisel.rotation.set(Math.PI * 0.5, 0, 0.4);
  benchGroup.add(benchChisel);

  // Mason's wooden carving mallet
  const malletHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), woodPlanksMat);
  malletHandle.position.set(0.2, 0.74, 0);
  malletHandle.rotation.x = Math.PI * 0.5;
  benchGroup.add(malletHandle);

  const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8), woodPlanksMat);
  malletHead.position.set(0.2, 0.74, -0.14);
  malletHead.rotation.z = Math.PI * 0.5;
  benchGroup.add(malletHead);

  // Mason's L-shaped steel measuring square
  const squareArm1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.04), toolSteelMat);
  squareArm1.position.set(-0.05, 0.72, -0.05);
  benchGroup.add(squareArm1);

  const squareArm2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.25), toolSteelMat);
  squareArm2.position.set(0.08, 0.72, 0.055);
  benchGroup.add(squareArm2);

  toolsGroup.add(benchGroup);

  // --- Illuminated Iron Lantern on Timber Post ---
  const lanternPost = new THREE.Group();
  lanternPost.position.set(-1.4, 0.44, 1.8);

  const lPole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), craneTimberMat);
  lPole.position.y = 0.9;
  lanternPost.add(lPole);

  const lBracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.35), ironMat);
  lBracket.position.set(0, 1.7, 0.18);
  lanternPost.add(lBracket);

  // Iron lantern cage
  const lCage = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), ironMat);
  lCage.position.set(0, 1.55, 0.35);
  lanternPost.add(lCage);

  // Glowing amber fire core
  const lGlow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), lanternGlassMat);
  lGlow.position.set(0, 1.55, 0.35);
  lanternPost.add(lGlow);

  toolsGroup.add(lanternPost);

  // --- Piles of Fractured Stone Chips & Rubble ---
  const rubblePiles = [
    { x: -1.6, y: 0.44, z: -1.4, s: [1.2, 0.25, 0.9] },
    { x: -2.6, y: 1.6, z: -0.4, s: [0.9, 0.18, 0.8] },
    { x: 1.1, y: 0.44, z: 1.2, s: [1.1, 0.22, 1.0] },
    { x: -0.8, y: 0.44, z: 0.2, s: [0.8, 0.15, 0.7] }
  ];

  rubblePiles.forEach(rp => {
    const pile = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), rubbleMat);
    pile.position.set(rp.x, rp.y + rp.s[1] * 0.5, rp.z);
    pile.scale.set(rp.s[0], rp.s[1], rp.s[2]);
    toolsGroup.add(pile);

    // Scattered loose spall chunks
    for (let i = 0; i < 3; i++) {
      const spall = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + i * 0.04, 0), rockMat);
      spall.position.set(
        rp.x + (Math.random() - 0.5) * 0.7,
        rp.y + 0.1,
        rp.z + (Math.random() - 0.5) * 0.7
      );
      spall.rotation.set(Math.random(), Math.random(), Math.random());
      toolsGroup.add(spall);
    }
  });

  quarry.add(toolsGroup);

  // Scale to fit the game standards (~8x8 to 9x9 footprint)
  quarry.scale.set(0.85, 0.85, 0.85);

  // Enable dynamic shadows and return complete model
  return enableShadows(quarry);
}
