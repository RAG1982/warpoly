import * as THREE from 'three';
import { materials, enableShadows } from '../materials.js';
import {
  getBarracksMaterials,
  getBarracksStoneTimberTextures,
  getBarracksRoofTextures,
  getBarracksDoorWindowTextures,
  getBarracksPropsTextures
} from './barracksTextures.js';

/**
 * Helper to remap standard UV coordinates on a geometry to a specific rectangular sub-region.
 * UV coordinate system in Three.js: U ranges [0..1] (left to right), V ranges [0..1] (bottom to top).
 * Note: Canvas Y=0 is top, so Canvas Y_min corresponds to V_max = 1.0 - (Y_min / H).
 * 
 * @param {THREE.BufferGeometry} geometry 
 * @param {number} uMin 
 * @param {number} vMin 
 * @param {number} uMax 
 * @param {number} vMax 
 * @returns {THREE.BufferGeometry}
 */
function applySubUVs(geometry, uMin, vMin, uMax, vMax) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, uMin + u * (uMax - uMin), vMin + v * (vMax - vMin));
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Creates the Next-Gen Stylized Barracks (Quartel Militar) Low-Poly AAA Model
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen Triple-A standards (Valorant / Overwatch).
 * 
 * Architectural Features:
 * 1. Stepped Ashlar Fieldstone Foundation & Courtyard Drill Ground.
 * 2. Imposing Main Drill Hall:
 *    - Heavy fortified fieldstone ground floor with corner buttresses & water table trim.
 *    - Cantilevered dark oak timber-framed dormitory upper tier with exposed brackets & truss.
 *    - Steep blue slate shingle gable roof with carved bargeboards, rafter tails & iron ridge crest.
 *    - Stone chimney stack with iron spark arrester cowl.
 *    - Gabled roof dormer with miniature slate roof & barred arrow loop.
 * 3. Fortified Garrison Portal & Double Gates:
 *    - Massive iron-banded double doors with crossed longswords heraldic cartouche & ring knockers.
 *    - Deep stone arch portal & timber-framed entrance portico canopy.
 * 4. Fortified Armory Wing:
 *    - Stone bastion wing with iron-barred slit windows and glowing torchlit interior.
 *    - Reinforced iron armory door with diagonal straps, padlock hasp & peep grate.
 * 5. Defensive Roof Platform & Battlements:
 *    - Elevated timber walkway over armory with notched stone parapet merlons & timber handrails.
 *    - Covered archer's shelter with slate canopy.
 *    - Timber access ladder and stair treads leading up from the courtyard.
 * 6. Courtyard Training Equipment & Military Props:
 *    - Straw combat training dummy with patched burlap sack tunic, ropes & painted red bullseye target.
 *    - Wooden weapon racks beside entrance holding razor steel halberds and spears.
 *    - Royal heraldic heater shields displaying the magnificent golden rampant lion crest on royal blue field.
 *    - Wrought iron wall braziers with burning embers casting a warm ambient glow.
 *    - High timber flagpoles with golden finials and fluttering royal military pennants.
 * 
 * Footprint: ~8.8 x 7.6 x 9.8 (Fits the standard 8x7 to 9x8 game grid perfectly).
 * 
 * @returns {THREE.Group}
 */
export function createBarracks() {
  const barracks = new THREE.Group();
  barracks.name = 'Barracks';

  // Load configured PBR material suite
  const mats = getBarracksMaterials();

  // Reusable utility geometry helpers
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
  const plane = (w, h) => new THREE.PlaneGeometry(w, h);

  // =========================================================================
  // 1. FOUNDATION & DRILL COURTYARD SKIRT
  // =========================================================================
  const foundationGroup = new THREE.Group();
  foundationGroup.name = 'Foundation';

  // Outer primary stone plinth
  const baseSlab = new THREE.Mesh(box(8.8, 0.35, 7.6), mats.stoneWalls);
  baseSlab.position.set(0, 0.175, 0);
  foundationGroup.add(baseSlab);

  // Upper stepped masonry curb
  const upperPlinth = new THREE.Mesh(box(8.4, 0.2, 7.2), mats.stoneTimber);
  upperPlinth.position.set(0, 0.45, 0);
  foundationGroup.add(upperPlinth);

  // Courtyard training ground soil / cobblestone ring (Front-Right)
  const courtSoil = new THREE.Mesh(box(3.6, 0.08, 3.2), materials.soil);
  courtSoil.position.set(2.2, 0.58, 1.8);
  foundationGroup.add(courtSoil);

  // Courtyard timber retaining border logs
  const curbMat = materials.woodDark;
  const logFront = new THREE.Mesh(box(3.8, 0.15, 0.18), curbMat);
  logFront.position.set(2.2, 0.62, 3.45);
  foundationGroup.add(logFront);

  const logSide = new THREE.Mesh(box(0.18, 0.15, 3.4), curbMat);
  logSide.position.set(4.05, 0.62, 1.8);
  foundationGroup.add(logSide);

  // Stone approach steps to main gate portal
  const stepMat = mats.stoneWalls;
  const step1 = new THREE.Mesh(box(2.6, 0.15, 0.7), stepMat);
  step1.position.set(-1.6, 0.25, 2.75);
  foundationGroup.add(step1);

  const step2 = new THREE.Mesh(box(2.3, 0.15, 0.6), stepMat);
  step2.position.set(-1.6, 0.4, 2.45);
  foundationGroup.add(step2);

  barracks.add(foundationGroup);

  // =========================================================================
  // 2. MAIN DRILL HALL (Center-Left Stronghold)
  // Center: X = -1.6, Z = -0.7. Width: 4.6, Depth: 5.2.
  // =========================================================================
  const drillHall = new THREE.Group();
  drillHall.name = 'MainDrillHall';
  const hallCX = -1.6;
  const hallCZ = -0.7;

  // Ground Floor: Heavy Fortified Fieldstone Base
  const hallBase = new THREE.Mesh(box(4.6, 2.8, 5.2), mats.stoneWalls);
  hallBase.position.set(hallCX, 0.55 + 1.4, hallCZ);
  drillHall.add(hallBase);

  // Corner Buttresses on Stone Base (4 corners)
  const buttressMat = mats.stoneTimber;
  const bW = 0.55;
  const bH = 2.9;
  const bOffsets = [
    [-2.3, -2.6], [2.3, -2.6],
    [-2.3, 2.6],  [0.8, 2.6] // right front transitions to courtyard
  ];
  bOffsets.forEach(([bx, bz]) => {
    const butt = new THREE.Mesh(box(bW, bH, bW), buttressMat);
    butt.position.set(hallCX + bx, 0.55 + bH * 0.5, hallCZ + bz);
    drillHall.add(butt);

    // Sloped stone buttress cap
    const capGeo = new THREE.ConeGeometry(bW * 0.75, 0.4, 4);
    const cap = new THREE.Mesh(capGeo, buttressMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(hallCX + bx, 0.55 + bH + 0.2, hallCZ + bz);
    drillHall.add(cap);
  });

  // Stepped Stone Water Table / Belt Course Trim (Y: 3.3 to 3.5)
  const beltCourse = new THREE.Mesh(box(4.8, 0.2, 5.4), mats.stoneTimber);
  beltCourse.position.set(hallCX, 3.4, hallCZ);
  drillHall.add(beltCourse);

  // Upper Floor: Dark Oak Timber-Framed Garrison Quarters (Y: 3.5 to 5.6)
  const upperHall = new THREE.Mesh(box(4.5, 2.1, 5.1), mats.stoneTimber);
  upperHall.position.set(hallCX, 4.55, hallCZ);
  drillHall.add(upperHall);

  // Timber cantilever floor joist corbels supporting upper overhang
  const corbelMat = materials.woodDark;
  for (let zOffset = -2.2; zOffset <= 2.2; zOffset += 0.88) {
    const corbelL = new THREE.Mesh(box(0.35, 0.25, 0.2), corbelMat);
    corbelL.position.set(hallCX - 2.35, 3.42, hallCZ + zOffset);
    drillHall.add(corbelL);
  }

  // Front & Back Gable Triangles
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-2.3, 0);
  gableShape.lineTo(0, 2.7);
  gableShape.lineTo(2.3, 0);
  gableShape.closePath();

  const gableExtrudeSettings = { depth: 0.3, bevelEnabled: false };
  const frontGableGeo = new THREE.ExtrudeGeometry(gableShape, gableExtrudeSettings);
  const frontGable = new THREE.Mesh(frontGableGeo, mats.stoneTimber);
  frontGable.position.set(hallCX, 5.6, hallCZ + 2.5);
  drillHall.add(frontGable);

  const backGableGeo = new THREE.ExtrudeGeometry(gableShape, gableExtrudeSettings);
  const backGable = new THREE.Mesh(backGableGeo, mats.stoneTimber);
  backGable.position.set(hallCX, 5.6, hallCZ - 2.8);
  drillHall.add(backGable);

  // Carved Timber King-Post Truss on Front Gable Face
  const kingPost = new THREE.Mesh(box(0.18, 2.6, 0.15), materials.woodDark);
  kingPost.position.set(hallCX, 6.9, hallCZ + 2.82);
  drillHall.add(kingPost);

  const collarTie = new THREE.Mesh(box(2.8, 0.16, 0.15), materials.woodDark);
  collarTie.position.set(hallCX, 6.4, hallCZ + 2.82);
  drillHall.add(collarTie);

  // Diagonal struts on truss
  const strutL = new THREE.Mesh(box(0.14, 1.4, 0.12), materials.woodDark);
  strutL.rotation.z = Math.PI / 4;
  strutL.position.set(hallCX - 0.7, 6.6, hallCZ + 2.82);
  drillHall.add(strutL);

  const strutR = new THREE.Mesh(box(0.14, 1.4, 0.12), materials.woodDark);
  strutR.rotation.z = -Math.PI / 4;
  strutR.position.set(hallCX + 0.7, 6.6, hallCZ + 2.82);
  drillHall.add(strutR);

  // --- Main Roof: Double-Pitched Blue Slate Gable Roof ---
  const roofGroup = new THREE.Group();
  roofGroup.name = 'MainRoof';

  const roofLength = 5.8;
  const roofSlopeW = 3.5;
  const roofThickness = 0.16;
  const roofAngle = 0.86; // ~49 degrees

  // Left Roof Pitch
  const roofLGeo = box(roofSlopeW, roofThickness, roofLength);
  const roofL = new THREE.Mesh(roofLGeo, mats.roofShingles);
  roofL.position.set(hallCX - 1.25, 7.0, hallCZ);
  roofL.rotation.z = roofAngle;
  roofGroup.add(roofL);

  // Right Roof Pitch
  const roofRGeo = box(roofSlopeW, roofThickness, roofLength);
  const roofR = new THREE.Mesh(roofRGeo, mats.roofShingles);
  roofR.position.set(hallCX + 1.25, 7.0, hallCZ);
  roofR.rotation.z = -roofAngle;
  roofGroup.add(roofR);

  // Decorative Ridge Crest Capping (Forged iron peak beam with spikes)
  const ridgeBeam = new THREE.Mesh(box(0.22, 0.22, roofLength + 0.2), materials.steelDark);
  ridgeBeam.position.set(hallCX, 8.35, hallCZ);
  roofGroup.add(ridgeBeam);

  for (let rz = -2.5; rz <= 2.5; rz += 0.7) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), materials.steelDark);
    spike.position.set(hallCX, 8.52, hallCZ + rz);
    roofGroup.add(spike);
  }

  // Timber Bargeboards along Gable Rakes
  const bargeL1 = new THREE.Mesh(box(roofSlopeW + 0.1, 0.22, 0.14), materials.woodDark);
  bargeL1.position.set(hallCX - 1.25, 7.02, hallCZ + 2.85);
  bargeL1.rotation.z = roofAngle;
  roofGroup.add(bargeL1);

  const bargeR1 = new THREE.Mesh(box(roofSlopeW + 0.1, 0.22, 0.14), materials.woodDark);
  bargeR1.position.set(hallCX + 1.25, 7.02, hallCZ + 2.85);
  bargeR1.rotation.z = -roofAngle;
  roofGroup.add(bargeR1);

  // Gabled Dormer Window on Left Roof Slope
  const dormerGroup = new THREE.Group();
  dormerGroup.position.set(hallCX - 2.1, 6.2, hallCZ);

  const dormerWalls = new THREE.Mesh(box(0.9, 1.1, 1.2), mats.stoneTimber);
  dormerGroup.add(dormerWalls);

  const dRoofL = new THREE.Mesh(box(0.8, 0.1, 1.4), mats.roofShingles);
  dRoofL.position.set(-0.3, 0.75, 0);
  dRoofL.rotation.z = 0.7;
  dormerGroup.add(dRoofL);

  const dRoofR = new THREE.Mesh(box(0.8, 0.1, 1.4), mats.roofShingles);
  dRoofR.position.set(0.3, 0.75, 0);
  dRoofR.rotation.z = -0.7;
  dormerGroup.add(dRoofR);

  // Dormer barred slit window
  const dormerWinGeo = applySubUVs(plane(0.45, 0.65), 0.05, 0.03, 0.46, 0.33);
  const dormerWin = new THREE.Mesh(dormerWinGeo, mats.doorsAndWindows);
  dormerWin.rotation.y = -Math.PI / 2;
  dormerWin.position.set(-0.46, 0.05, 0);
  dormerGroup.add(dormerWin);

  roofGroup.add(dormerGroup);

  // Fortified Stone Chimney Stack (Back-Left)
  const chimneyGroup = new THREE.Group();
  chimneyGroup.position.set(hallCX - 2.0, 5.5, hallCZ - 2.0);

  const chimneyShaft = new THREE.Mesh(box(0.85, 4.4, 0.85), mats.stoneWalls);
  chimneyGroup.add(chimneyShaft);

  const chimneyCornice = new THREE.Mesh(box(1.05, 0.22, 1.05), mats.stoneTimber);
  chimneyCornice.position.y = 2.25;
  chimneyGroup.add(chimneyCornice);

  // Chimney iron cowl & spark arrester
  const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 4), materials.steelDark);
  cowl.rotation.y = Math.PI / 4;
  cowl.position.y = 2.65;
  chimneyGroup.add(cowl);

  roofGroup.add(chimneyGroup);
  drillHall.add(roofGroup);

  // =========================================================================
  // 3. FORTIFIED GARRISON PORTAL & DOUBLE ENTRANCE GATES
  // =========================================================================
  const portalGroup = new THREE.Group();
  portalGroup.name = 'EntrancePortal';
  const portalZ = hallCZ + 2.62;

  // Massive Ashlar Stone Arch Surround
  const archL = new THREE.Mesh(box(0.45, 2.5, 0.5), mats.stoneWalls);
  archL.position.set(hallCX - 1.2, 1.8, portalZ);
  portalGroup.add(archL);

  const archR = new THREE.Mesh(box(0.45, 2.5, 0.5), mats.stoneWalls);
  archR.position.set(hallCX + 1.2, 1.8, portalZ);
  portalGroup.add(archR);

  const archLintel = new THREE.Mesh(box(2.85, 0.5, 0.6), mats.stoneTimber);
  archLintel.position.set(hallCX, 3.1, portalZ);
  portalGroup.add(archLintel);

  // Prominent Chiseled Keystone
  const keystone = new THREE.Mesh(box(0.5, 0.65, 0.68), mats.stoneWalls);
  keystone.position.set(hallCX, 3.15, portalZ + 0.05);
  portalGroup.add(keystone);

  // Double Garrison Gate Doors (UV-mapped to Crossed Swords & Iron Bands)
  // Region A in Canvas: Y 0..1250 (Three.js V: 0.39 to 1.0), X: 60..1988 (U: 0.03 to 0.97)
  const gateGeo = applySubUVs(plane(2.0, 2.4), 0.03, 0.39, 0.97, 1.0);
  const gateMesh = new THREE.Mesh(gateGeo, mats.gateDoors);
  gateMesh.position.set(hallCX, 1.75, portalZ + 0.06);
  portalGroup.add(gateMesh);

  // Portico Overhanging Timber Canopy
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(hallCX, 3.35, portalZ + 0.4);

  const porticoRoof = new THREE.Mesh(box(2.7, 0.12, 1.2), mats.roofShingles);
  porticoRoof.rotation.x = 0.28;
  canopyGroup.add(porticoRoof);

  // Diagonal timber knee-braces
  const braceL = new THREE.Mesh(box(0.12, 0.8, 0.12), materials.woodDark);
  braceL.position.set(-1.15, -0.4, -0.2);
  braceL.rotation.x = -Math.PI / 4;
  canopyGroup.add(braceL);

  const braceR = new THREE.Mesh(box(0.12, 0.8, 0.12), materials.woodDark);
  braceR.position.set(1.15, -0.4, -0.2);
  braceR.rotation.x = -Math.PI / 4;
  canopyGroup.add(braceR);

  portalGroup.add(canopyGroup);
  drillHall.add(portalGroup);

  // Slit arrow windows on the main drill hall sides
  const makeSlitWindowMesh = () => {
    const winGeo = applySubUVs(plane(0.55, 0.9), 0.05, 0.03, 0.46, 0.33);
    return new THREE.Mesh(winGeo, mats.doorsAndWindows);
  };

  const hallWinL = makeSlitWindowMesh();
  hallWinL.rotation.y = -Math.PI / 2;
  hallWinL.position.set(hallCX - 2.32, 2.0, hallCZ);
  drillHall.add(hallWinL);

  const hallWinRear = makeSlitWindowMesh();
  hallWinRear.rotation.y = Math.PI;
  hallWinRear.position.set(hallCX, 2.0, hallCZ - 2.62);
  drillHall.add(hallWinRear);

  barracks.add(drillHall);

  // =========================================================================
  // 4. ARMORY WING & FORGE FLUE (Right Side Fortified Bastion)
  // Center: X = +2.0, Z = -1.2. Width: 3.2, Depth: 4.2.
  // =========================================================================
  const armoryWing = new THREE.Group();
  armoryWing.name = 'ArmoryWing';
  const armCX = 2.0;
  const armCZ = -1.2;

  // Heavy Ashlar Stone Bastion Body
  const armoryWalls = new THREE.Mesh(box(3.2, 2.8, 4.2), mats.stoneWalls);
  armoryWalls.position.set(armCX, 0.55 + 1.4, armCZ);
  armoryWing.add(armoryWalls);

  // Corner Stone Buttresses
  const armButtress1 = new THREE.Mesh(box(0.5, 2.9, 0.5), mats.stoneTimber);
  armButtress1.position.set(armCX + 1.6, 0.55 + 1.45, armCZ + 2.1);
  armoryWing.add(armButtress1);

  const armButtress2 = new THREE.Mesh(box(0.5, 2.9, 0.5), mats.stoneTimber);
  armButtress2.position.set(armCX + 1.6, 0.55 + 1.45, armCZ - 2.1);
  armoryWing.add(armButtress2);

  // Fortified Iron Armory Door facing Courtyard
  // Region C in Canvas: Y 1360..1980 (Three.js V: 0.03 to 0.33), X: 1100..1940 (U: 0.54 to 0.95)
  const armDoorGeo = applySubUVs(plane(1.2, 2.1), 0.54, 0.03, 0.95, 0.33);
  const armDoor = new THREE.Mesh(armDoorGeo, mats.doorsAndWindows);
  armDoor.position.set(armCX - 0.5, 1.6, armCZ + 2.12);
  armoryWing.add(armDoor);

  // Exterior iron-barred slit window on right wall
  const armWinSide = makeSlitWindowMesh();
  armWinSide.rotation.y = Math.PI / 2;
  armWinSide.position.set(armCX + 1.62, 1.9, armCZ);
  armoryWing.add(armWinSide);

  // Armorer's Forge Chimney Flue with soot cowl
  const forgeFlue = new THREE.Mesh(cyl(0.25, 0.3, 2.2, 6), materials.stoneDark);
  forgeFlue.position.set(armCX + 1.4, 3.8, armCZ - 1.4);
  armoryWing.add(forgeFlue);

  const forgeCowl = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.35, 6), materials.steelDark);
  forgeCowl.position.set(armCX + 1.4, 5.0, armCZ - 1.4);
  armoryWing.add(forgeCowl);

  barracks.add(armoryWing);

  // =========================================================================
  // 5. DEFENSIVE ROOF PLATFORM & BATTLEMENTS
  // Situated atop the Armory Wing (Y: 3.35).
  // =========================================================================
  const parapetGroup = new THREE.Group();
  parapetGroup.name = 'DefensiveRoofPlatform';

  // Heavy Timber Plank Walkway Platform
  const platformPlanks = new THREE.Mesh(box(3.3, 0.22, 4.3), mats.stoneTimber);
  platformPlanks.position.set(armCX, 3.46, armCZ);
  parapetGroup.add(platformPlanks);

  // Floor Joist Beams visible underneath perimeter
  const joistMat = materials.woodDark;
  const joistFront = new THREE.Mesh(box(3.4, 0.2, 0.2), joistMat);
  joistFront.position.set(armCX, 3.32, armCZ + 2.15);
  parapetGroup.add(joistFront);

  const joistSide = new THREE.Mesh(box(0.2, 0.2, 4.4), joistMat);
  joistSide.position.set(armCX + 1.65, 3.32, armCZ);
  parapetGroup.add(joistSide);

  // Stepped Stone Crenellations / Merlons along exposed edges (East, North, South)
  const merlonMat = mats.stoneWalls;
  const merlonGeo = box(0.65, 0.65, 0.35);
  const merlonSideGeo = box(0.35, 0.65, 0.65);

  // Front parapet (Facing courtyard +Z)
  const merlonF1 = new THREE.Mesh(merlonGeo, merlonMat);
  merlonF1.position.set(armCX + 0.4, 3.85, armCZ + 2.1);
  parapetGroup.add(merlonF1);

  const merlonF2 = new THREE.Mesh(merlonGeo, merlonMat);
  merlonF2.position.set(armCX + 1.4, 3.85, armCZ + 2.1);
  parapetGroup.add(merlonF2);

  // East side parapet (Facing right +X)
  const merlonOffsetsZ = [-1.5, -0.5, 0.5, 1.5];
  merlonOffsetsZ.forEach(mz => {
    const merlon = new THREE.Mesh(merlonSideGeo, merlonMat);
    merlon.position.set(armCX + 1.58, 3.85, armCZ + mz);
    parapetGroup.add(merlon);
  });

  // Rear parapet (Facing -Z)
  const merlonR1 = new THREE.Mesh(merlonGeo, merlonMat);
  merlonR1.position.set(armCX + 0.4, 3.85, armCZ - 2.1);
  parapetGroup.add(merlonR1);

  const merlonR2 = new THREE.Mesh(merlonGeo, merlonMat);
  merlonR2.position.set(armCX + 1.4, 3.85, armCZ - 2.1);
  parapetGroup.add(merlonR2);

  // Wooden Parapet Handrail Caps
  const railFront = new THREE.Mesh(box(3.2, 0.08, 0.15), materials.woodDark);
  railFront.position.set(armCX + 0.2, 4.22, armCZ + 2.1);
  parapetGroup.add(railFront);

  const railSide = new THREE.Mesh(box(0.15, 0.08, 4.2), materials.woodDark);
  railSide.position.set(armCX + 1.58, 4.22, armCZ);
  parapetGroup.add(railSide);

  // Archer's Lookout Shelter (Back-Right Corner of Platform)
  const shelterGroup = new THREE.Group();
  shelterGroup.position.set(armCX + 0.8, 3.55, armCZ - 1.2);

  // 4 timber corner support posts
  const postCoords = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]];
  postCoords.forEach(([px, pz]) => {
    const sp = new THREE.Mesh(box(0.12, 1.5, 0.12), materials.woodDark);
    sp.position.set(px, 0.75, pz);
    shelterGroup.add(sp);
  });

  // Pitched blue slate canopy roof
  const sRoofGeo = new THREE.ConeGeometry(1.2, 0.7, 4);
  const sRoof = new THREE.Mesh(sRoofGeo, mats.roofShingles);
  sRoof.rotation.y = Math.PI / 4;
  sRoof.position.y = 1.75;
  shelterGroup.add(sRoof);

  parapetGroup.add(shelterGroup);

  // Sturdy Timber Access Ladder (Courtyard ground up to parapet platform)
  const ladderGroup = new THREE.Group();
  ladderGroup.position.set(armCX - 1.45, 0.5, armCZ + 2.3);

  // Angled side rails
  const ladderLen = 3.6;
  const railGeo = box(0.1, 0.12, ladderLen);
  const railL = new THREE.Mesh(railGeo, materials.woodDark);
  railL.position.set(-0.35, 1.55, -0.65);
  railL.rotation.x = -0.58;
  ladderGroup.add(railL);

  const railR = new THREE.Mesh(railGeo, materials.woodDark);
  railR.position.set(0.35, 1.55, -0.65);
  railR.rotation.x = -0.58;
  ladderGroup.add(railR);

  // Notched rungs
  for (let r = 0; r < 9; r++) {
    const t = (r + 0.5) / 9;
    const rung = new THREE.Mesh(cyl(0.035, 0.035, 0.7, 5), materials.woodMedium);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, 0.3 + t * 2.5, 0.2 - t * 1.7);
    ladderGroup.add(rung);
  }

  parapetGroup.add(ladderGroup);
  barracks.add(parapetGroup);

  // =========================================================================
  // 6. COURTYARD MILITARY PROPS: STRAW DUMMY, WEAPON RACKS, HALBERDS, SHIELDS
  // =========================================================================
  const propsGroup = new THREE.Group();
  propsGroup.name = 'CourtyardProps';

  // -------------------------------------------------------------------------
  // A. STRAW COMBAT TRAINING DUMMY (Boneco de Treino de Burlap e Palha)
  // Located at X = +2.6, Z = +2.2.
  // -------------------------------------------------------------------------
  const dummyGroup = new THREE.Group();
  dummyGroup.name = 'TrainingDummy';
  dummyGroup.position.set(2.6, 0.55, 2.2);

  // Heavy timber cross-base stand
  const dummyBase1 = new THREE.Mesh(box(1.0, 0.12, 0.18), materials.woodDark);
  dummyGroup.add(dummyBase1);
  const dummyBase2 = new THREE.Mesh(box(0.18, 0.12, 1.0), materials.woodDark);
  dummyGroup.add(dummyBase2);

  // Vertical spine timber post
  const dummyPost = new THREE.Mesh(cyl(0.08, 0.09, 2.2, 6), materials.woodDark);
  dummyPost.position.y = 1.1;
  dummyGroup.add(dummyPost);

  // Crossbar shoulder beam
  const dummyCrossbar = new THREE.Mesh(cyl(0.065, 0.065, 1.3, 5), materials.woodMedium);
  dummyCrossbar.rotation.z = Math.PI / 2;
  dummyCrossbar.position.y = 1.6;
  dummyGroup.add(dummyCrossbar);

  // Straw Bundle Body (wrapped cylinder)
  const dummyStrawBody = new THREE.Mesh(cyl(0.36, 0.32, 1.05, 8), mats.props);
  dummyStrawBody.position.y = 1.15;
  dummyGroup.add(dummyStrawBody);

  // Patched Burlap Sack Tunic with Painted Red Bullseye Target
  // Quadrant 3: Burlap target at Canvas X: 460..920 (U: 0.23 to 0.48), Y: 1080..1980 (Three.js V: 0.03 to 0.47)
  const targetGeo = applySubUVs(plane(0.68, 0.85), 0.23, 0.03, 0.48, 0.47);
  const targetChest = new THREE.Mesh(targetGeo, mats.props);
  targetChest.position.set(0, 1.18, 0.36);
  dummyGroup.add(targetChest);

  // Hemp Rope Binding Rings around torso & neck
  const ropeMat = materials.leatherBrown;
  const rope1 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 5, 10), ropeMat);
  rope1.rotation.x = Math.PI / 2;
  rope1.position.y = 0.85;
  dummyGroup.add(rope1);

  const rope2 = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.04, 5, 10), ropeMat);
  rope2.rotation.x = Math.PI / 2;
  rope2.position.y = 1.45;
  dummyGroup.add(rope2);

  // Straw / Burlap Head with rope neck knot
  const dummyHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), mats.props);
  dummyHead.position.y = 1.88;
  dummyHead.scale.set(1.0, 1.25, 0.95);
  dummyGroup.add(dummyHead);

  // Tufts of straw poking out of the head peak
  const headTuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 5), materials.wheat);
  headTuft.position.y = 2.12;
  dummyGroup.add(headTuft);

  // Wooden practice broadsword strapped to dummy arm
  const pracSword = new THREE.Mesh(box(0.08, 0.8, 0.04), materials.woodLight);
  pracSword.position.set(0.65, 1.2, 0.1);
  pracSword.rotation.z = -0.3;
  dummyGroup.add(pracSword);

  propsGroup.add(dummyGroup);

  // -------------------------------------------------------------------------
  // B. MILITARY WEAPON RACKS WITH HALBERDS & ROYAL LION HEATER SHIELD
  // Rack 1: Beside Main Portal (X = -0.3, Z = 2.45, angled -12°)
  // -------------------------------------------------------------------------
  const rack1 = new THREE.Group();
  rack1.name = 'EntranceWeaponRack';
  rack1.position.set(-0.3, 0.55, 2.45);
  rack1.rotation.y = -0.22;

  // Sturdy A-Frame Oak Timber Stand
  const rackFrameMat = materials.woodDark;
  const legL = new THREE.Mesh(box(0.12, 1.25, 0.12), rackFrameMat);
  legL.position.set(-0.75, 0.6, 0);
  rack1.add(legL);

  const legR = new THREE.Mesh(box(0.12, 1.25, 0.12), rackFrameMat);
  legR.position.set(0.75, 0.6, 0);
  rack1.add(legR);

  const crossbarTop = new THREE.Mesh(box(1.7, 0.14, 0.12), rackFrameMat);
  crossbarTop.position.set(0, 1.05, 0);
  rack1.add(crossbarTop);

  const crossbarBottom = new THREE.Mesh(box(1.7, 0.14, 0.12), rackFrameMat);
  crossbarBottom.position.set(0, 0.35, 0);
  rack1.add(crossbarBottom);

  // --- Steel Halberds (Alabardas) resting in the rack ---
  const makeHalberd = (rotZ = 0) => {
    const halb = new THREE.Group();

    // Dark ash polearm shaft with leather grip
    const shaft = new THREE.Mesh(cyl(0.035, 0.035, 2.2, 5), materials.woodDark);
    halb.add(shaft);

    const grip = new THREE.Mesh(cyl(0.042, 0.042, 0.5, 5), materials.leatherBrown);
    grip.position.y = -0.2;
    halb.add(grip);

    // Crescent Axe Cutting Blade
    const axeHead = new THREE.Mesh(box(0.35, 0.42, 0.03), materials.steelArmor);
    axeHead.position.set(0.16, 0.95, 0);
    halb.add(axeHead);

    // Armor-piercing rear beak
    const rearBeak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), materials.steelDark);
    rearBeak.rotation.z = Math.PI / 2;
    rearBeak.position.set(-0.16, 0.95, 0);
    halb.add(rearBeak);

    // Top thrusting spear spike
    const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 4), materials.steelArmor);
    topSpike.position.y = 1.32;
    halb.add(topSpike);

    // Brass socket collar
    const collar = new THREE.Mesh(cyl(0.05, 0.045, 0.15, 6), materials.roofGold);
    collar.position.y = 0.85;
    halb.add(collar);

    halb.rotation.z = rotZ;
    return halb;
  };

  const halberd1 = makeHalberd(0.12);
  halberd1.position.set(-0.4, 0.85, 0.1);
  rack1.add(halberd1);

  const halberd2 = makeHalberd(-0.08);
  halberd2.position.set(0.4, 0.85, 0.1);
  rack1.add(halberd2);

  // Longspear resting in center
  const spearShaft = new THREE.Mesh(cyl(0.03, 0.03, 2.4, 5), materials.woodMedium);
  spearShaft.position.set(0.05, 0.95, 0.1);
  spearShaft.rotation.z = 0.05;
  const spearHead = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.42, 4), materials.steelArmor);
  spearHead.position.set(0.05, 2.2, 0.1);
  spearHead.rotation.z = 0.05;
  rack1.add(spearShaft);
  rack1.add(spearHead);

  // --- Royal Heraldic Heater Shield with Golden Rampant Lion Crest ---
  // Quadrant 1 in Canvas: X 0..1024 (U: 0.0 to 0.5), Y 0..1024 (Three.js V: 0.5 to 1.0)
  const shieldGroup = new THREE.Group();
  shieldGroup.name = 'RoyalLionShield';
  shieldGroup.position.set(-0.25, 0.48, 0.22);
  shieldGroup.rotation.x = -0.18; // Leaning against weapon rack
  shieldGroup.rotation.y = 0.15;

  // Front face with rampant lion texture
  const shieldFaceGeo = applySubUVs(plane(0.72, 0.92), 0.0, 0.5, 0.5, 1.0);
  const shieldFront = new THREE.Mesh(shieldFaceGeo, mats.props);
  shieldGroup.add(shieldFront);

  // Back backing oak board
  const shieldBack = new THREE.Mesh(box(0.72, 0.92, 0.06), materials.woodDark);
  shieldBack.position.z = -0.035;
  shieldGroup.add(shieldBack);

  // Polished steel rim bevel around shield
  const shieldRimMat = materials.steelArmor;
  const rimTop = new THREE.Mesh(box(0.76, 0.06, 0.08), shieldRimMat);
  rimTop.position.set(0, 0.44, 0);
  shieldGroup.add(rimTop);

  // Central steel boss (Umbo)
  const boss = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.08, 6), shieldRimMat);
  boss.rotation.x = Math.PI / 2;
  boss.position.set(0, 0.1, 0.04);
  shieldGroup.add(boss);

  rack1.add(shieldGroup);
  propsGroup.add(rack1);

  // -------------------------------------------------------------------------
  // C. SECONDARY SHIELD & SUPPLY CRATE (Beside Armory Entrance)
  // Located at X = +3.5, Z = +1.4.
  // -------------------------------------------------------------------------
  const armorySupplies = new THREE.Group();
  armorySupplies.position.set(3.5, 0.55, 1.4);

  // Heavy timber supply crate
  const crate = new THREE.Mesh(box(0.8, 0.65, 0.8), mats.stoneTimber);
  crate.position.y = 0.325;
  armorySupplies.add(crate);

  // Additional Royal Heater Shield leaning against the crate
  const shield2 = shieldGroup.clone();
  shield2.position.set(-0.35, 0.38, 0.35);
  shield2.rotation.set(-0.25, -0.4, 0);
  armorySupplies.add(shield2);

  propsGroup.add(armorySupplies);

  // -------------------------------------------------------------------------
  // D. IRON WALL BRAZIERS WITH BURNING COALS & WARM AMBIENT GLOW
  // -------------------------------------------------------------------------
  const makeBrazier = (bx, by, bz, hasLight = false) => {
    const brazier = new THREE.Group();
    brazier.position.set(bx, by, bz);

    // Wall corbel mounting plate
    const plate = new THREE.Mesh(box(0.18, 0.45, 0.25), materials.steelDark);
    brazier.add(plate);

    // Hammered iron bowl basket
    const bowl = new THREE.Mesh(cyl(0.28, 0.18, 0.28, 6), materials.steelDark);
    bowl.position.set(0, 0.18, 0.22);
    brazier.add(bowl);

    // Glowing incandescent coals / embers (Warm emissive shader)
    const embers = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), mats.emberCoals);
    embers.scale.set(1.0, 0.55, 1.0);
    embers.position.set(0, 0.3, 0.22);
    brazier.add(embers);

    // Dynamic fire embers point light
    if (hasLight) {
      const fireLight = new THREE.PointLight(0xff6a00, 1.4, 5.0, 1.8);
      fireLight.position.set(0, 0.4, 0.25);
      brazier.add(fireLight);
    }

    return brazier;
  };

  // Brazier 1: Left of Main Gate (X = -2.8, Y = 2.1, Z = 2.7)
  const brazierLeft = makeBrazier(-2.8, 2.1, portalZ + 0.05, true);
  propsGroup.add(brazierLeft);

  // Brazier 2: Right of Main Gate (X = -0.4, Y = 2.1, Z = 2.7)
  const brazierRight = makeBrazier(-0.4, 2.1, portalZ + 0.05, true);
  propsGroup.add(brazierRight);

  // Brazier 3: Elevated on Parapet Corner Merlon (X = +3.6, Y = 4.2, Z = +0.8)
  const brazierParapet = makeBrazier(armCX + 1.6, 4.1, armCZ + 2.0, false);
  brazierParapet.rotation.y = -Math.PI / 2;
  propsGroup.add(brazierParapet);

  // -------------------------------------------------------------------------
  // E. FLUTTERING ROYAL MILITARY PENNANTS & GARRISON BANNERS
  // -------------------------------------------------------------------------
  // 1. Grand Mast Flagpole on Main Roof Peak (X = -1.6, Z = 1.8, Y = 7.0 to 10.2)
  const mainFlagGroup = new THREE.Group();
  mainFlagGroup.position.set(hallCX, 8.2, hallCZ + 2.4);

  // Timber mast
  const mast = new THREE.Mesh(cyl(0.065, 0.08, 2.6, 6), materials.woodDark);
  mast.position.y = 1.3;
  mainFlagGroup.add(mast);

  // Golden Acorn Finial
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), materials.roofGold);
  finial.position.y = 2.65;
  mainFlagGroup.add(finial);

  // Fluttering Royal Cobalt Blue Swallowtail Pennant
  // Quadrant 4 in Canvas: Pennant at X: 1100..2000 (U: 0.54 to 0.98), Y: 1600..2000 (Three.js V: 0.02 to 0.22)
  const pennantGeo = applySubUVs(plane(2.2, 0.8), 0.54, 0.02, 0.98, 0.22);
  const pennant = new THREE.Mesh(pennantGeo, mats.pennantBanner);
  pennant.position.set(1.15, 2.05, 0);
  pennant.rotation.y = 0.25; // caught in the wind
  pennant.rotation.z = -0.06;
  mainFlagGroup.add(pennant);

  propsGroup.add(mainFlagGroup);

  // 2. Parapet Corner Banner (East Battlements)
  const parapetFlagGroup = new THREE.Group();
  parapetFlagGroup.position.set(armCX + 1.55, 4.2, armCZ - 1.8);

  const paraMast = new THREE.Mesh(cyl(0.045, 0.055, 2.2, 5), materials.woodDark);
  paraMast.position.y = 1.1;
  parapetFlagGroup.add(paraMast);

  const paraFinial = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), materials.roofGold);
  paraFinial.position.y = 2.25;
  parapetFlagGroup.add(paraFinial);

  const paraPennantGeo = applySubUVs(plane(1.4, 0.55), 0.54, 0.02, 0.98, 0.22);
  const paraPennant = new THREE.Mesh(paraPennantGeo, mats.pennantBanner);
  paraPennant.position.set(0.75, 1.7, 0);
  paraPennant.rotation.y = 0.35;
  parapetFlagGroup.add(paraPennant);

  propsGroup.add(parapetFlagGroup);

  barracks.add(propsGroup);

  // Enable comprehensive shadow casting & receiving across all submeshes
  return enableShadows(barracks);
}
