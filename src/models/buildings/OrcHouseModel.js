import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcAnimalFurTextures,
  getOrcSpikedIronTextures,
  getOrcBoneTuskTextures,
  getOrcGlowingWindowTextures,
  getOrcBasaltStoneTextures
} from './orcTextures.js';

/**
 * Next-Gen AAA Stylized Orc House / Burrow (Cabana dos Peons / Toca Orc)
 * Faithfully matches the bottom left building in modeloorcs.png.
 *
 * Visual Features:
 * - Stout round/polygonal cabin built from heavy interlocking dark ironwood logs.
 * - Basalt stone masonry foundation base.
 * - Heavy timber plank door with iron straps and curved mammoth bone handle.
 * - Glowing warm amber multi-pane windows with timber frames and iron grilles.
 * - Conical pitched roof draped in thick stitched animal fur pelts and patchwork fleece.
 * - Mammoth bone tusks and wooden battens weighting down the pelts against harsh winds.
 * - Stone masonry chimney stack with iron cap.
 * - Front yard props: mammoth rib archway, firewood stack with splitting axe, and hunting skull trophy.
 *
 * @returns {THREE.Group}
 */
export function createOrcHouse() {
  const house = new THREE.Group();
  house.name = 'OrcHouse';

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
  const furMat = createPBRMaterial(getOrcAnimalFurTextures(), { bumpScale: 0.08, roughness: 0.85 });
  const stoneMat = createPBRMaterial(getOrcBasaltStoneTextures(), { bumpScale: 0.08 });
  const boneMat = createPBRMaterial(getOrcBoneTuskTextures(), { bumpScale: 0.05, roughness: 0.45 });
  const ironMat = createPBRMaterial(getOrcSpikedIronTextures(), { bumpScale: 0.06, metalness: 0.9 });

  const winTex = getOrcGlowingWindowTextures();
  const winMat = new THREE.MeshStandardMaterial({
    map: winTex.map,
    emissiveMap: winTex.emissiveMap,
    emissive: 0xff8811,
    emissiveIntensity: 2.2,
    roughness: 0.35,
    metalness: 0.1
  });

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x3c4350,
    roughness: 0.35,
    metalness: 0.85,
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
  // 2. FOUNDATION PLINTH
  // ==========================================================================
  const baseRadius = 2.9;
  const plinthGeo = new THREE.CylinderGeometry(baseRadius, baseRadius + 0.3, 0.5, 10);
  const plinth = new THREE.Mesh(plinthGeo, stoneMat);
  plinth.position.y = 0.25;
  house.add(plinth);

  // ==========================================================================
  // 3. ROUND CABIN LOG WALLS
  // ==========================================================================
  const cabinGroup = new THREE.Group();
  cabinGroup.name = 'CabinWalls';
  cabinGroup.position.set(0, 0.5, 0);

  // Polygonal stacked log rings
  const numLayers = 6;
  const wallH = 2.4;
  const layerH = wallH / numLayers;
  const numSides = 8;

  for (let l = 0; l < numLayers; l++) {
    const ly = (l + 0.5) * layerH;
    for (let s = 0; s < numSides; s++) {
      // Leave entrance opening on front side (s == 0)
      if (s === 0 && l < 4) continue;

      const angle = (s / numSides) * Math.PI * 2 + (l % 2 === 0 ? 0 : Math.PI / numSides);
      const nextAngle = ((s + 1) / numSides) * Math.PI * 2 + (l % 2 === 0 ? 0 : Math.PI / numSides);

      const mx = (Math.cos(angle) + Math.cos(nextAngle)) * 0.5 * 2.4;
      const mz = (Math.sin(angle) + Math.sin(nextAngle)) * 0.5 * 2.4;
      const segLen = 2.4 * Math.sin(Math.PI / numSides) * 2.15;

      const log = createDetailedLog(0.18, segLen, true);
      log.position.set(mx, ly, mz);
      log.rotation.y = -Math.atan2(Math.sin(nextAngle) - Math.sin(angle), Math.cos(nextAngle) - Math.cos(angle));
      cabinGroup.add(log);
    }
  }

  // Vertical Corner Posts at Vertices
  for (let s = 0; s < numSides; s++) {
    const angle = (s / numSides) * Math.PI * 2;
    const px = Math.cos(angle) * 2.45;
    const pz = Math.sin(angle) * 2.45;
    const post = createDetailedLog(0.22, wallH + 0.3);
    post.position.set(px, (wallH + 0.3) * 0.5, pz);
    cabinGroup.add(post);
  }

  // ==========================================================================
  // 4. FRONT ENTRANCE & TIMBER DOOR
  // ==========================================================================
  const porchGroup = new THREE.Group();
  porchGroup.position.set(0, 0, 2.4);

  // Door Frame
  const frameGeo = new THREE.BoxGeometry(1.6, 2.1, 0.25);
  const frame = new THREE.Mesh(frameGeo, darkIronMat);
  frame.position.set(0, 1.05, 0);
  porchGroup.add(frame);

  // Timber Door Panel
  const doorGeo = new THREE.BoxGeometry(1.35, 1.95, 0.12);
  const door = new THREE.Mesh(doorGeo, barkMat);
  door.position.set(0, 1.05, 0.04);
  porchGroup.add(door);

  // Iron Hinge Straps
  [-0.6, 0.4].forEach(hy => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.16), ironMat);
    strap.position.set(-0.1, 1.05 + hy, 0.06);
    porchGroup.add(strap);
  });

  // Curved Mammoth Bone Door Handle
  const handleGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.42, 0.85, 0.12),
      new THREE.Vector3(0.44, 0.95, 0.22),
      new THREE.Vector3(0.42, 1.05, 0.12)
    ]),
    6,
    0.035,
    5,
    false
  );
  const handle = new THREE.Mesh(handleGeo, boneMat);
  porchGroup.add(handle);

  cabinGroup.add(porchGroup);

  // ==========================================================================
  // 5. GLOWING MULTI-PANE WINDOWS
  // ==========================================================================
  const winFrameGeo = new THREE.BoxGeometry(0.85, 0.95, 0.16);
  const winGlassGeo = new THREE.BoxGeometry(0.72, 0.82, 0.12);

  // Window Left Flank
  const winL = new THREE.Group();
  winL.position.set(-2.4, 1.35, 0.5);
  winL.rotation.y = -Math.PI / 2 + 0.2;
  winL.add(new THREE.Mesh(winFrameGeo, darkIronMat));
  winL.add(new THREE.Mesh(winGlassGeo, winMat));
  cabinGroup.add(winL);

  // Window Right Flank
  const winR = new THREE.Group();
  winR.position.set(2.4, 1.35, 0.5);
  winR.rotation.y = Math.PI / 2 - 0.2;
  winR.add(new THREE.Mesh(winFrameGeo, darkIronMat));
  winR.add(new THREE.Mesh(winGlassGeo, winMat));
  cabinGroup.add(winR);

  house.add(cabinGroup);

  // ==========================================================================
  // 6. CONICAL PELT-STITCHED ROOF WITH BONE WEIGHT TUSKS
  // ==========================================================================
  const roofGroup = new THREE.Group();
  roofGroup.name = 'PeltRoof';
  roofGroup.position.set(0, 0.5 + wallH, 0);

  // Steep Asymmetrical Conical Roof of Stitched Animal Pelts
  const roofGeo = new THREE.ConeGeometry(3.2, 2.9, 9, 2);
  const roofMesh = new THREE.Mesh(roofGeo, furMat);
  roofMesh.position.y = 1.45;
  roofGroup.add(roofMesh);

  // Wooden Battens / Slats pressing down the hides
  for (let b = 0; b < 6; b++) {
    const angle = (b / 6) * Math.PI * 2;
    const slatGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.8, 5);
    const slat = new THREE.Mesh(slatGeo, barkMat);
    slat.position.set(Math.cos(angle) * 1.5, 1.35, Math.sin(angle) * 1.5);
    slat.rotation.z = Math.cos(angle) * -0.55;
    slat.rotation.x = Math.sin(angle) * 0.55;
    roofGroup.add(slat);
  }

  // Curved Mammoth Bone Tusks projecting from the roof edges
  for (let t = 0; t < 5; t++) {
    const angle = (t / 5) * Math.PI * 2 + 0.3;
    const tuskCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.4, 0.3),
      new THREE.Vector3(0, 0.9, 0.7)
    ]);
    const tuskGeo = new THREE.TubeGeometry(tuskCurve, 8, 0.11, 6, false);
    const tusk = new THREE.Mesh(tuskGeo, boneMat);
    tusk.position.set(Math.cos(angle) * 2.3, 0.3, Math.sin(angle) * 2.3);
    tusk.rotation.y = angle;
    roofGroup.add(tusk);
  }

  // Apex Smoke Vent Tripod
  const apexRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.08, 6, 8), darkIronMat);
  apexRing.position.y = 2.9;
  apexRing.rotation.x = Math.PI / 2;
  roofGroup.add(apexRing);

  house.add(roofGroup);

  // ==========================================================================
  // 7. STONE MASONRY CHIMNEY STACK
  // ==========================================================================
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'StoneChimney';
  chimneyGroup.position.set(-1.6, 0.5, -1.5);

  const chBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.9), stoneMat);
  chBase.position.y = 1.3;
  chimneyGroup.add(chBase);

  const chUpper = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.2, 0.75), stoneMat);
  chUpper.position.y = 3.6;
  chimneyGroup.add(chUpper);

  // Iron Chimney Cap
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.4, 4), darkIronMat);
  cap.position.y = 4.85;
  chimneyGroup.add(cap);

  house.add(chimneyGroup);

  // ==========================================================================
  // 8. FRONT YARD MICRO-PROPS (RIB ARCH, FIREWOOD, HUNTING SKULL)
  // ==========================================================================
  const propsGroup = new THREE.Group();
  propsGroup.name = 'YardProps';

  // Mammoth Ribcage Arch at Entrance
  [-0.9, 0.9].forEach(rx => {
    const ribCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(rx, 0, 2.6),
      new THREE.Vector3(rx * 0.8, 1.2, 2.5),
      new THREE.Vector3(0, 2.0, 2.4)
    ]);
    const ribGeo = new THREE.TubeGeometry(ribCurve, 8, 0.08, 5, false);
    const rib = new THREE.Mesh(ribGeo, boneMat);
    propsGroup.add(rib);
  });

  // Firewood Stack & Chopping Stump with Broadaxe
  const woodStack = new THREE.Group();
  woodStack.position.set(1.9, 0.5, 1.8);
  for (let y = 0; y < 3; y++) {
    for (let z = 0; z < 3 - y; z++) {
      const fLog = createDetailedLog(0.1, 0.9, false);
      fLog.position.set(0, y * 0.18 + 0.1, z * 0.22 - 0.2);
      fLog.rotation.x = Math.PI / 2;
      woodStack.add(fLog);
    }
  }
  propsGroup.add(woodStack);

  // Chopping Block with Broadaxe
  const stump = createDetailedLog(0.28, 0.55);
  stump.position.set(2.4, 0.77, 1.0);
  propsGroup.add(stump);

  const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.03), darkIronMat);
  axeBlade.position.set(2.4, 1.1, 1.0);
  axeBlade.rotation.z = 0.25;
  propsGroup.add(axeBlade);

  // Hunting Skull on Timber Stake
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 5), darkIronMat);
  stake.position.set(-2.1, 1.1, 2.0);
  propsGroup.add(stake);

  const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), boneMat);
  skull.position.set(-2.1, 2.0, 2.0);
  skull.scale.set(0.9, 0.8, 1.1);
  propsGroup.add(skull);

  const skullHorn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 4), boneMat);
  skullHorn.position.set(-2.25, 2.15, 2.0);
  skullHorn.rotation.z = 0.6;
  propsGroup.add(skullHorn);

  house.add(propsGroup);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(house);
}
