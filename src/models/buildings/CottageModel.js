import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getCottageTimberPlasterTextures,
  getCottageFoundationTextures,
  getCottageRoofTextures,
  getCottageDoorTextures,
  getCottageWindowTextures,
  getCottageChimneyTextures,
  getCottageWoodTextures
} from './cottageTextures.js';

/**
 * Next-Gen Stylized Low-Poly Cottage (Casa Colonial / Residência)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Overwatch / Valorant / UE5).
 *
 * Features:
 * - Stepped river rock / cobblestone foundation plinth with mossy crevices & flagstone steps
 * - Warm ochre/cream rustic stucco with dark hand-hewn oak half-timber framing (enxaimel / fachwerk) & wooden pegs
 * - Asymmetrical steep pitched royal blue scalloped roof with overhanging carved eaves & exposed rafter tails
 * - Picturesque dormer window with timber framing and glowing leaded diamond-lattice glass
 * - Cobblestone and weathered terracotta brick chimney with tiered low-poly smoke puffs
 * - Arched oak entrance door with black iron strap hinges, ring latch, wooden awning, and hanging iron lantern
 * - Charming window flower box overflowing with lush foliage and vibrant colorful blooms
 * - Firewood log stack neatly arranged beside the wall, chopping block with embedded hand-axe, and water barrel
 *
 * @returns {THREE.Group}
 */
export function createCottage() {
  const cottage = new THREE.Group();
  cottage.name = 'Cottage';

  // --- 1. PBR Texture Sets & Dedicated Component Materials ---
  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale || 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 1.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const timberPlasterMat = createPBRMaterial(getCottageTimberPlasterTextures(), { bumpScale: 0.07 });
  const foundationMat = createPBRMaterial(getCottageFoundationTextures(), { bumpScale: 0.08 });
  const roofMat = createPBRMaterial(getCottageRoofTextures(), { bumpScale: 0.06 });
  const doorMat = createPBRMaterial(getCottageDoorTextures(), { bumpScale: 0.06 });
  const windowTex = getCottageWindowTextures();
  const windowMat = createPBRMaterial(windowTex, {
    bumpScale: 0.05,
    emissive: new THREE.Color(0xffaa33),
    emissiveIntensity: 0.85,
    emissiveMap: windowTex.emissiveMap
  });
  const chimneyMat = createPBRMaterial(getCottageChimneyTextures(), { bumpScale: 0.08 });
  const woodMat = createPBRMaterial(getCottageWoodTextures(), { bumpScale: 0.06 });

  // Accent & storybook prop materials
  const darkOakMat = new THREE.MeshStandardMaterial({
    color: 0x3d2313,
    roughness: 0.74,
    flatShading: true
  });

  const wroughtIronMat = new THREE.MeshStandardMaterial({
    color: 0x24262b,
    roughness: 0.38,
    metalness: 0.85,
    flatShading: true
  });

  const lanternGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xffaa22,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.1
  });

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xf5f7fa,
    roughness: 0.95,
    flatShading: true,
    transparent: true,
    opacity: 0.76
  });

  const soilMat = new THREE.MeshStandardMaterial({
    color: 0x3b2413,
    roughness: 0.92,
    flatShading: true
  });

  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x3e7a2b,
    roughness: 0.8,
    flatShading: true
  });

  const bloomRedMat = new THREE.MeshStandardMaterial({
    color: 0xd92638,
    roughness: 0.65,
    flatShading: true
  });

  const bloomGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.65,
    flatShading: true
  });

  const bloomVioletMat = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6,
    roughness: 0.65,
    flatShading: true
  });

  const stoneStepMat = new THREE.MeshStandardMaterial({
    color: 0x787f89,
    roughness: 0.85,
    flatShading: true
  });

  const axeSteelMat = new THREE.MeshStandardMaterial({
    color: 0xc8d2dc,
    roughness: 0.28,
    metalness: 0.8,
    flatShading: true
  });

  // --- 2. RIVER ROCK COBBLESTONE FOUNDATION PLINTH ---
  const foundationGroup = new THREE.Group();
  foundationGroup.name = 'Foundation';

  // Main foundation tier
  const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.44, 3.8), foundationMat);
  basePlinth.position.set(0, 0.22, 0);
  foundationGroup.add(basePlinth);

  // Upper bevel ledge (water table)
  const baseLedge = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 3.6), foundationMat);
  baseLedge.position.set(0, 0.48, 0);
  foundationGroup.add(baseLedge);

  // Irregular 3D river rock corner boulders
  const cornerBoulderPositions = [
    [-2.38, 0.18, -1.88, 0.38],
    [2.38, 0.18, -1.88, 0.36],
    [-2.38, 0.18, 1.88, 0.40],
    [2.38, 0.18, 1.88, 0.38],
    [0.0, 0.16, -1.90, 0.32],
    [-2.42, 0.16, 0.0, 0.34]
  ];
  cornerBoulderPositions.forEach(([bx, by, bz, s]) => {
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneStepMat);
    boulder.position.set(bx, by, bz);
    boulder.rotation.set(s * 2, s * 4, s * 6);
    foundationGroup.add(boulder);
  });

  // Front Stone Doorstep (Layered flagstone landing)
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.8), stoneStepMat);
  step1.position.set(0.5, 0.08, 2.15);
  foundationGroup.add(step1);

  const step2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.5), stoneStepMat);
  step2.position.set(0.5, 0.21, 2.0);
  foundationGroup.add(step2);

  // Irregular flagstone garden pavers leading from doorstep
  const paverPositions = [
    [0.5, 0.03, 2.75, 0.36, 0.28],
    [0.9, 0.03, 3.10, 0.30, 0.34],
    [0.3, 0.03, 3.35, 0.32, 0.26]
  ];
  paverPositions.forEach(([px, py, pz, sx, sz]) => {
    const paver = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), stoneStepMat);
    paver.position.set(px, py, pz);
    paver.rotation.y = px * 1.5;
    foundationGroup.add(paver);
  });

  cottage.add(foundationGroup);

  // --- 3. MAIN GROUND FLOOR & HALF-TIMBER WALLS (ENXAIMEL) ---
  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'Walls';

  // Ground Floor Plaster Core (Warm ochre rustic stucco)
  const wallH = 1.95;
  const wallY = 0.54 + wallH * 0.5;
  const plasterCore = new THREE.Mesh(new THREE.BoxGeometry(4.4, wallH, 3.4), timberPlasterMat);
  plasterCore.position.set(0, wallY, 0);
  wallsGroup.add(plasterCore);

  // Cantilevered Upper Gable Plaster Walls (Jetty overhang at y = 2.49 to 3.5)
  const upperH = 0.85;
  const upperCore = new THREE.Mesh(new THREE.BoxGeometry(4.55, upperH, 3.55), timberPlasterMat);
  upperCore.position.set(0, 0.54 + wallH + upperH * 0.5, 0);
  wallsGroup.add(upperCore);

  // 3D Dark Oak Timber Framing System
  const timberPosts = [
    // Corner posts
    [-2.22, wallY, -1.72],
    [2.22, wallY, -1.72],
    [-2.22, wallY, 1.72],
    [2.22, wallY, 1.72],
    // Intermediate facade posts
    [-0.5, wallY, 1.72],
    [1.4, wallY, 1.72],
    [0.0, wallY, -1.72]
  ];
  const postGeo = new THREE.BoxGeometry(0.18, wallH + 0.05, 0.18);
  timberPosts.forEach(([px, py, pz]) => {
    const post = new THREE.Mesh(postGeo, darkOakMat);
    post.position.set(px, py, pz);
    wallsGroup.add(post);
  });

  // Horizontal Sill Beams (bottom of ground floor)
  const sillFront = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.14, 0.14), darkOakMat);
  sillFront.position.set(0, 0.58, 1.73);
  wallsGroup.add(sillFront);

  const sillBack = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.14, 0.14), darkOakMat);
  sillBack.position.set(0, 0.58, -1.73);
  wallsGroup.add(sillBack);

  const sillLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.5), darkOakMat);
  sillLeft.position.set(-2.23, 0.58, 0);
  wallsGroup.add(sillLeft);

  const sillRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.5), darkOakMat);
  sillRight.position.set(2.23, 0.58, 0);
  wallsGroup.add(sillRight);

  // Horizontal Girt Beams (Jetty division beam between ground & upper floor)
  const girtFront = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.18, 0.22), darkOakMat);
  girtFront.position.set(0, 0.54 + wallH, 1.76);
  wallsGroup.add(girtFront);

  const girtBack = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.18, 0.22), darkOakMat);
  girtBack.position.set(0, 0.54 + wallH, -1.76);
  wallsGroup.add(girtBack);

  const girtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 3.65), darkOakMat);
  girtLeft.position.set(-2.28, 0.54 + wallH, 0);
  wallsGroup.add(girtLeft);

  const girtRight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 3.65), darkOakMat);
  girtRight.position.set(2.28, 0.54 + wallH, 0);
  wallsGroup.add(girtRight);

  // Carved wooden corbels supporting the upper floor jetty overhang
  const corbelGeo = new THREE.BoxGeometry(0.16, 0.24, 0.22);
  const corbelPositions = [
    [-2.1, 0.54 + wallH - 0.18, 1.75],
    [-0.5, 0.54 + wallH - 0.18, 1.75],
    [1.4, 0.54 + wallH - 0.18, 1.75],
    [2.1, 0.54 + wallH - 0.18, 1.75],
    [-2.25, 0.54 + wallH - 0.18, -1.0],
    [-2.25, 0.54 + wallH - 0.18, 0.8],
    [2.25, 0.54 + wallH - 0.18, -1.0],
    [2.25, 0.54 + wallH - 0.18, 0.8]
  ];
  corbelPositions.forEach(([cx, cy, cz]) => {
    const corbel = new THREE.Mesh(corbelGeo, darkOakMat);
    corbel.position.set(cx, cy, cz);
    wallsGroup.add(corbel);
  });

  // Diagonal Half-Timber Enxaimel Braces
  const braceGeo = new THREE.BoxGeometry(0.12, 1.3, 0.08);
  const leftBrace = new THREE.Mesh(braceGeo, darkOakMat);
  leftBrace.position.set(-1.35, wallY, 1.72);
  leftBrace.rotation.z = Math.PI / 4;
  wallsGroup.add(leftBrace);

  const rightBrace = new THREE.Mesh(braceGeo, darkOakMat);
  rightBrace.position.set(1.8, wallY, 1.72);
  rightBrace.rotation.z = -Math.PI / 4;
  wallsGroup.add(rightBrace);

  cottage.add(wallsGroup);

  // --- 4. ASYMMETRICAL STEEP PITCHED BLUE ROOF WITH OVERHANGING CARVED EAVES ---
  const roofGroup = new THREE.Group();
  roofGroup.name = 'Roof';

  // Gable Peak Walls (Plaster & timber triangle under gables)
  const gableH = 1.35;
  const gableGeo = new THREE.ConeGeometry(2.35, gableH, 4);
  gableGeo.rotateY(Math.PI / 4);
  gableGeo.scale(1.0, 1.0, 0.82);
  const gableFill = new THREE.Mesh(gableGeo, timberPlasterMat);
  gableFill.position.set(0, 0.54 + wallH + upperH + gableH * 0.45, 0);
  roofGroup.add(gableFill);

  // Steep Pitched Scalloped Blue Roof Slopes
  // Front slope (steep pitch ~55°)
  const roofW = 5.2;
  const roofSlopeL = 2.45;
  const roofThickness = 0.18;

  const frontSlopeGeo = new THREE.BoxGeometry(roofW, roofSlopeL, roofThickness);
  const frontSlope = new THREE.Mesh(frontSlopeGeo, roofMat);
  frontSlope.position.set(0, 3.82, 0.95);
  frontSlope.rotation.x = -0.85; // angled downward towards front eave
  roofGroup.add(frontSlope);

  // Back slope (steeper asymmetrical pitch)
  const backSlopeGeo = new THREE.BoxGeometry(roofW, roofSlopeL, roofThickness);
  const backSlope = new THREE.Mesh(backSlopeGeo, roofMat);
  backSlope.position.set(0, 3.82, -0.95);
  backSlope.rotation.x = 0.85; // angled downward towards back eave
  roofGroup.add(backSlope);

  // Decorative Ridge Beam & Finials
  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.3, 0.24, 0.26), woodMat);
  ridgeBeam.position.set(0, 4.62, 0);
  roofGroup.add(ridgeBeam);

  // Carved Ridge Spire Finials at roof gable peaks
  [-2.65, 2.65].forEach(fx => {
    const finialBase = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), darkOakMat);
    finialBase.position.set(fx, 4.88, 0);
    roofGroup.add(finialBase);

    const finialBall = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), darkOakMat);
    finialBall.position.set(fx, 5.15, 0);
    roofGroup.add(finialBall);
  });

  // Carved Bargeboards / Fascia on gable edges
  [-2.6, 2.6].forEach(gx => {
    const bargeL = new THREE.Mesh(new THREE.BoxGeometry(0.16, roofSlopeL + 0.1, 0.18), darkOakMat);
    bargeL.position.set(gx, 3.82, 0.95);
    bargeL.rotation.x = -0.85;
    roofGroup.add(bargeL);

    const bargeR = new THREE.Mesh(new THREE.BoxGeometry(0.16, roofSlopeL + 0.1, 0.18), darkOakMat);
    bargeR.position.set(gx, 3.82, -0.95);
    bargeR.rotation.x = 0.85;
    roofGroup.add(bargeR);
  });

  // Exposed Rafter Tails under front & back eaves
  for (let rx = -2.2; rx <= 2.2; rx += 0.55) {
    const rafterFront = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.38), darkOakMat);
    rafterFront.position.set(rx, 3.02, 1.88);
    roofGroup.add(rafterFront);

    const rafterBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.38), darkOakMat);
    rafterBack.position.set(rx, 3.02, -1.88);
    roofGroup.add(rafterBack);
  }

  // --- 5. PICTURESQUE DORMER WINDOW ---
  const dormerGroup = new THREE.Group();
  dormerGroup.name = 'Dormer';
  dormerGroup.position.set(-0.8, 3.3, 1.15);

  // Dormer Body Walls
  const dormerWalls = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 1.1), timberPlasterMat);
  dormerWalls.position.set(0, 0.45, 0.2);
  dormerGroup.add(dormerWalls);

  // Dormer Corner Timber Studs
  const dormerStudGeo = new THREE.BoxGeometry(0.1, 0.95, 0.1);
  [-0.58, 0.58].forEach(dx => {
    const stud = new THREE.Mesh(dormerStudGeo, darkOakMat);
    stud.position.set(dx, 0.45, 0.72);
    dormerGroup.add(stud);
  });

  // Dormer Peaked Roof
  const dormerRoofW = 1.45;
  const dormerRoofL = 0.95;
  const dormerSlopeL = new THREE.Mesh(new THREE.BoxGeometry(dormerRoofW, 0.12, dormerRoofL), roofMat);
  dormerSlopeL.position.set(-0.42, 1.05, 0.2);
  dormerSlopeL.rotation.z = 0.75;
  dormerGroup.add(dormerSlopeL);

  const dormerSlopeR = new THREE.Mesh(new THREE.BoxGeometry(dormerRoofW, 0.12, dormerRoofL), roofMat);
  dormerSlopeR.position.set(0.42, 1.05, 0.2);
  dormerSlopeR.rotation.z = -0.75;
  dormerGroup.add(dormerSlopeR);

  const dormerRidge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, dormerRoofL + 0.15), woodMat);
  dormerRidge.position.set(0, 1.36, 0.2);
  dormerGroup.add(dormerRidge);

  // Dormer Leaded Window with glowing diamond lattice
  const dormerWin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.58, 0.12), windowMat);
  dormerWin.position.set(0, 0.48, 0.76);
  dormerGroup.add(dormerWin);

  // Dormer Window Frame & Carved Sill
  const dormerSill = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.16), darkOakMat);
  dormerSill.position.set(0, 0.16, 0.82);
  dormerGroup.add(dormerSill);

  roofGroup.add(dormerGroup);
  cottage.add(roofGroup);

  // --- 6. COBBLESTONE CHIMNEY WITH BRICK TEXTURE & TIERED SMOKE PUFFS ---
  // Positioned at (-2.1, y, -0.6) to align with Building.js smoke particle emitter!
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'Chimney';
  chimneyGroup.position.set(-2.1, 0, -0.6);

  // Cobblestone Hearth Base (Ground to y = 1.6)
  const hearthBase = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.6, 1.05), foundationMat);
  hearthBase.position.set(0, 0.8, 0);
  chimneyGroup.add(hearthBase);

  // Sloped Weathering Shoulder Transition
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.35, 0.92), stoneStepMat);
  shoulder.position.set(0, 1.72, 0);
  chimneyGroup.add(shoulder);

  // Main Masonry Brick Shaft (y = 1.9 to 4.3)
  const shaftH = 2.45;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.74, shaftH, 0.74), chimneyMat);
  shaft.position.set(0, 1.88 + shaftH * 0.5, 0);
  chimneyGroup.add(shaft);

  // Flared Stone Cap at chimney top
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.16, 0.88), stoneStepMat);
  cap.position.set(0, 4.35, 0);
  chimneyGroup.add(cap);

  // Terracotta Flue Pot with dark iron collar
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.42, 8), chimneyMat);
  pot.position.set(0, 4.62, 0);
  chimneyGroup.add(pot);

  const potCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), wroughtIronMat);
  potCollar.position.set(0, 4.54, 0);
  chimneyGroup.add(potCollar);

  // Stylized Tiered Low-Poly Smoke Puffs Rising into the Air
  const smokePuffs = [
    { r: 0.18, x: 0.02, y: 4.95, z: 0.02, s: 1.0 },
    { r: 0.28, x: -0.06, y: 5.42, z: 0.08, s: 1.1 },
    { r: 0.40, x: -0.16, y: 6.05, z: 0.15, s: 1.2 },
    { r: 0.54, x: -0.30, y: 6.82, z: 0.24, s: 1.35 }
  ];
  smokePuffs.forEach(({ r, x, y, z, s }, idx) => {
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), smokeMat);
    puff.position.set(x, y, z);
    puff.scale.set(1.1, 0.9, 1.0);
    puff.rotation.set(idx * 0.8, idx * 1.2, idx * 0.5);
    chimneyGroup.add(puff);
  });

  cottage.add(chimneyGroup);

  // --- 7. ARCHED OAK ENTRANCE DOOR, STONE STEP, AWNING & HANGING LANTERN ---
  const entranceGroup = new THREE.Group();
  entranceGroup.name = 'Entrance';
  entranceGroup.position.set(0.5, 0, 1.72);

  // Arched Heavy Oak Door
  const doorW = 1.15;
  const doorH = 1.75;
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.14), doorMat);
  doorMesh.position.set(0, 0.54 + doorH * 0.5, 0.04);
  entranceGroup.add(doorMesh);

  // Carved Dark Oak Door Frame & Lintel
  const frameThick = 0.16;
  const postL = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH + 0.1, frameThick), darkOakMat);
  postL.position.set(-doorW * 0.5 - frameThick * 0.4, 0.54 + doorH * 0.5, 0.08);
  entranceGroup.add(postL);

  const postR = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH + 0.1, frameThick), darkOakMat);
  postR.position.set(doorW * 0.5 + frameThick * 0.4, 0.54 + doorH * 0.5, 0.08);
  entranceGroup.add(postR);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + frameThick * 2 + 0.1, frameThick, frameThick + 0.04), darkOakMat);
  lintel.position.set(0, 0.54 + doorH + frameThick * 0.4, 0.08);
  entranceGroup.add(lintel);

  // Wooden Awning (Porch Canopy with Blue Scalloped Shingles)
  const awningW = 1.6;
  const awningL = 0.75;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(awningW, 0.1, awningL), roofMat);
  awning.position.set(0, 2.58, 0.38);
  awning.rotation.x = 0.45;
  entranceGroup.add(awning);

  // Awning Angled Wooden Gallows Brackets / Corbels
  [-0.68, 0.68].forEach(bx => {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), darkOakMat);
    bracket.position.set(bx, 2.38, 0.22);
    bracket.rotation.x = -Math.PI / 4;
    entranceGroup.add(bracket);
  });

  // Hanging Wrought Iron Lantern with Glowing Core
  const lanternGroup = new THREE.Group();
  lanternGroup.name = 'Lantern';
  lanternGroup.position.set(0.92, 2.05, 0.2);

  // Curved iron wall bracket
  const bracketArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), wroughtIronMat);
  bracketArm.position.set(0, 0.12, 0.12);
  lanternGroup.add(bracketArm);

  const bracketStrut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), wroughtIronMat);
  bracketStrut.position.set(0, 0.04, 0.08);
  bracketStrut.rotation.x = -Math.PI / 4;
  lanternGroup.add(bracketStrut);

  // Lantern Top Hanging Ring & Cap
  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 4), wroughtIronMat);
  lanternCap.position.set(0, 0.1, 0.24);
  lanternCap.rotation.y = Math.PI / 4;
  lanternGroup.add(lanternCap);

  // Four-sided Lantern Glass Core with Glowing Candlelight
  const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), lanternGlassMat);
  lanternGlass.position.set(0, -0.06, 0.24);
  lanternGroup.add(lanternGlass);

  // Outer Iron Cage Ribs
  const cageRibGeo = new THREE.BoxGeometry(0.02, 0.26, 0.02);
  [
    [-0.09, -0.09], [0.09, -0.09],
    [-0.09, 0.09], [0.09, 0.09]
  ].forEach(([cx, cz]) => {
    const rib = new THREE.Mesh(cageRibGeo, wroughtIronMat);
    rib.position.set(cx, -0.06, 0.24 + cz);
    lanternGroup.add(rib);
  });

  // Bottom Spike Terminal
  const lanternBase = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.10, 4), wroughtIronMat);
  lanternBase.position.set(0, -0.21, 0.24);
  lanternBase.rotation.x = Math.PI;
  lanternGroup.add(lanternBase);

  entranceGroup.add(lanternGroup);
  cottage.add(entranceGroup);

  // --- 8. LEADED WINDOWS & CHARMING FLOWER BOX WITH BLOSSOMS ---
  // Front Main Ground Floor Window
  const frontWinGroup = new THREE.Group();
  frontWinGroup.name = 'FrontWindow';
  frontWinGroup.position.set(-1.15, 1.48, 1.72);

  // Leaded Window Pane with warm hearth glow
  const winPane = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.12), windowMat);
  winPane.position.set(0, 0, 0.02);
  frontWinGroup.add(winPane);

  // Carved Timber Frame & Chamfered Sill
  const winFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.08), darkOakMat);
  winFrame.position.set(0, 0, 0.0);
  frontWinGroup.add(winFrame);

  const winSill = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.22), darkOakMat);
  winSill.position.set(0, -0.52, 0.08);
  frontWinGroup.add(winSill);

  // Window Flower Box
  const boxW = 1.35;
  const boxH = 0.24;
  const boxD = 0.32;
  const flowerBox = new THREE.Mesh(new THREE.BoxGeometry(boxW, boxH, boxD), woodMat);
  flowerBox.position.set(0, -0.72, 0.18);
  frontWinGroup.add(flowerBox);

  // Rich potting soil
  const soil = new THREE.Mesh(new THREE.BoxGeometry(boxW - 0.08, 0.06, boxD - 0.08), soilMat);
  soil.position.set(0, -0.62, 0.18);
  frontWinGroup.add(soil);

  // Lush Stylized Foliage Clumps
  const foliageClumps = [
    [-0.45, -0.52, 0.18, 0.18],
    [-0.15, -0.48, 0.20, 0.22],
    [0.15, -0.50, 0.17, 0.20],
    [0.45, -0.53, 0.19, 0.18],
    [-0.30, -0.55, 0.28, 0.14],
    [0.30, -0.55, 0.28, 0.15]
  ];
  foliageClumps.forEach(([fx, fy, fz, fr]) => {
    const clump = new THREE.Mesh(new THREE.DodecahedronGeometry(fr, 0), foliageMat);
    clump.position.set(fx, fy, fz);
    clump.rotation.set(fx * 2, fy * 3, fz * 4);
    frontWinGroup.add(clump);
  });

  // Vibrant Colorful Fantasy Blooms (Geraniums, Marigolds, Lavender)
  const blooms = [
    // Red blooms
    { mat: bloomRedMat, x: -0.48, y: -0.42, z: 0.20, r: 0.065 },
    { mat: bloomRedMat, x: -0.10, y: -0.38, z: 0.24, r: 0.075 },
    { mat: bloomRedMat, x: 0.38, y: -0.42, z: 0.22, r: 0.070 },
    // Gold blooms
    { mat: bloomGoldMat, x: -0.28, y: -0.42, z: 0.25, r: 0.065 },
    { mat: bloomGoldMat, x: 0.14, y: -0.39, z: 0.23, r: 0.075 },
    { mat: bloomGoldMat, x: 0.50, y: -0.45, z: 0.20, r: 0.060 },
    // Violet blooms
    { mat: bloomVioletMat, x: -0.38, y: -0.44, z: 0.22, r: 0.060 },
    { mat: bloomVioletMat, x: -0.02, y: -0.43, z: 0.26, r: 0.070 },
    { mat: bloomVioletMat, x: 0.26, y: -0.44, z: 0.22, r: 0.065 }
  ];
  blooms.forEach(({ mat, x, y, z, r }) => {
    const flower = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    flower.position.set(x, y, z);
    frontWinGroup.add(flower);
  });

  cottage.add(frontWinGroup);

  // Side Window (Facing East on right wall)
  const sideWinGroup = new THREE.Group();
  sideWinGroup.name = 'SideWindow';
  const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.85), windowMat);
  sideWin.position.set(2.22, 1.48, 0);
  sideWinGroup.add(sideWin);

  const sideWinFrame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.95), darkOakMat);
  sideWinFrame.position.set(2.21, 1.48, 0);
  sideWinGroup.add(sideWinFrame);
  cottage.add(sideWinGroup);

  // --- 9. FIREWOOD LOG STACK & WOODCUTTER PROPS ---
  const woodpileGroup = new THREE.Group();
  woodpileGroup.name = 'Woodpile';
  woodpileGroup.position.set(2.25, 0.52, -0.4);

  // Two angled holding stakes
  const stakeGeo = new THREE.BoxGeometry(0.08, 0.85, 0.08);
  const stake1 = new THREE.Mesh(stakeGeo, darkOakMat);
  stake1.position.set(0.16, 0.38, -0.55);
  stake1.rotation.z = -0.15;
  woodpileGroup.add(stake1);

  const stake2 = new THREE.Mesh(stakeGeo, darkOakMat);
  stake2.position.set(0.16, 0.38, 0.55);
  stake2.rotation.z = -0.15;
  woodpileGroup.add(stake2);

  // Stack of chopped firewood logs with growth ring end texture
  const logGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.95, 6);
  logGeo.rotateX(Math.PI / 2);

  // Bottom row (4 logs)
  const logPositions = [
    // Layer 1 (bottom)
    [0.10, 0.12, -0.36],
    [0.10, 0.12, -0.12],
    [0.10, 0.12, 0.12],
    [0.10, 0.12, 0.36],
    // Layer 2 (mid)
    [0.10, 0.31, -0.24],
    [0.10, 0.31, 0.0],
    [0.10, 0.31, 0.24],
    // Layer 3 (top)
    [0.10, 0.49, -0.12],
    [0.10, 0.49, 0.12]
  ];
  logPositions.forEach(([lx, ly, lz]) => {
    const log = new THREE.Mesh(logGeo, woodMat);
    log.position.set(lx, ly, lz);
    log.rotation.z = 0.04;
    woodpileGroup.add(log);
  });

  cottage.add(woodpileGroup);

  // Chopping Stump with Embedded Hand-Axe
  const stumpGroup = new THREE.Group();
  stumpGroup.name = 'ChoppingStump';
  stumpGroup.position.set(2.4, 0, 0.85);

  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.48, 7), woodMat);
  stump.position.set(0, 0.24, 0);
  stumpGroup.add(stump);

  // Hand-axe embedded in the stump top
  const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5), darkOakMat);
  axeHandle.position.set(0.04, 0.62, 0.08);
  axeHandle.rotation.x = -0.45;
  stumpGroup.add(axeHandle);

  const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.18), axeSteelMat);
  axeBlade.position.set(0.04, 0.48, -0.04);
  axeBlade.rotation.x = -0.45;
  stumpGroup.add(axeBlade);

  cottage.add(stumpGroup);

  // --- 10. RUSTIC RAIN BARREL & SACK ---
  const barrelGroup = new THREE.Group();
  barrelGroup.name = 'RainBarrel';
  barrelGroup.position.set(-2.15, 0, 1.45);

  // Oak staves barrel body
  const barrelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.78, 8), woodMat);
  barrelBody.position.set(0, 0.39, 0);
  barrelGroup.add(barrelBody);

  // Black iron hoops
  const hoopGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.05, 8);
  const hoopTop = new THREE.Mesh(hoopGeo, wroughtIronMat);
  hoopTop.position.set(0, 0.64, 0);
  barrelGroup.add(hoopTop);

  const hoopMid = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.05, 8), wroughtIronMat);
  hoopMid.position.set(0, 0.39, 0);
  barrelGroup.add(hoopMid);

  const hoopBot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8), wroughtIronMat);
  hoopBot.position.set(0, 0.14, 0);
  barrelGroup.add(hoopBot);

  // Brass spigot
  const spigot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), wroughtIronMat);
  spigot.position.set(0, 0.22, 0.38);
  barrelGroup.add(spigot);

  // Burlap Grain Sack leaning against barrel
  const sackMat = new THREE.MeshStandardMaterial({
    color: 0xd9ba80,
    roughness: 0.9,
    flatShading: true
  });
  const sack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), sackMat);
  sack.position.set(0.52, 0.25, -0.15);
  sack.scale.set(1.1, 0.85, 0.95);
  sack.rotation.set(0.2, 0.4, -0.1);
  barrelGroup.add(sack);

  cottage.add(barrelGroup);

  return enableShadows(cottage);
}
