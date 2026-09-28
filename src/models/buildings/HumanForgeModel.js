import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getHumanForgeStoneTextures,
  getHumanForgeWoodTextures,
  getHumanForgeIronTextures,
  getHumanForgeFireTextures
} from './humanForgeTextures.js';

/**
 * Next-Gen AAA Stylized Human Forge (Forja dos Humanos)
 * Faithfully matches forjaHumanos.png:
 * - Rustic chiseled stone hearth & furnace on a curved semicircular base.
 * - Lower arched ash pit / vent with glowing embers at ground level.
 * - Main open arched hearth cavity with glowing coals and roaring fire.
 * - Stone work ledge with blacksmith tongs / poker resting in the embers.
 * - Tapered stone mantle / hood leading into a tall stone chimney stack with flared top rim.
 * - Heavy blacksmith anvil on a dark timber foundation to the left, with active forging flames on the anvil face.
 * - Tall blacksmith sledgehammer leaning against the furnace on the right side.
 * - Wooden log chopping block / tree stump beside the sledgehammer.
 * - Blacksmith hand tools, tongs, and iron billets on the ground in front.
 *
 * @returns {THREE.Group}
 */
export function createHumanForge() {
  const forge = new THREE.Group();
  forge.name = 'HumanForge';

  // --- 1. Materials Initialization ---
  function createPBRMaterial(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.85,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.1,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  const stoneTex = getHumanForgeStoneTextures();
  const stoneMat = createPBRMaterial(stoneTex, { bumpScale: 0.07, roughness: 0.88 });

  const woodTex = getHumanForgeWoodTextures();
  const woodMat = createPBRMaterial(woodTex, { bumpScale: 0.06, roughness: 0.82 });

  const ironTex = getHumanForgeIronTextures();
  const ironMat = createPBRMaterial(ironTex, { roughness: 0.38, metalness: 0.88 });

  const fireTex = getHumanForgeFireTextures();
  const fireMat = new THREE.MeshStandardMaterial({
    map: fireTex.map,
    emissiveMap: fireTex.emissiveMap,
    emissive: 0xff3b00,
    emissiveIntensity: 2.6,
    roughness: 0.35,
    transparent: true,
    opacity: 0.95
  });

  const glowingSteelMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: 0xff6600,
    emissiveIntensity: 2.8,
    roughness: 0.25,
    metalness: 0.6
  });

  const darkSootMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true
  });

  // --- 2. Ground Base Plinth (Rustic Flagstone Foundation) ---
  const groundPlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.8, 0.25, 16),
    stoneMat
  );
  groundPlinth.position.set(0, 0.125, 0);
  groundPlinth.scale.set(1.15, 1.0, 0.95);
  forge.add(groundPlinth);

  // ==========================================================================
  // 3. MAIN STONE FURNACE / HEARTH (matching forjaHumanos.png)
  // ==========================================================================
  const furnaceGroup = new THREE.Group();
  furnaceGroup.name = 'StoneFurnace';
  furnaceGroup.position.set(0.4, 0.25, -0.2);

  // 3A. Semicircular / Horseshoe Lower Stone Base
  const baseOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.3, 1.35, 14, 1, false, 0, Math.PI * 1.35),
    stoneMat
  );
  baseOuter.position.set(0, 0.675, 0);
  baseOuter.rotation.y = -Math.PI * 0.675;
  furnaceGroup.add(baseOuter);

  // Rear stone backing wall
  const rearWall = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 1.35, 1.6),
    stoneMat
  );
  rearWall.position.set(0, 0.675, -0.9);
  furnaceGroup.add(rearWall);

  // 3B. Lower Ash Pit / Draft Vent at ground level
  const ashPitFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.5, 0.3),
    darkSootMat
  );
  ashPitFrame.position.set(0, 0.25, 1.95);
  furnaceGroup.add(ashPitFrame);

  const ashPitEmbers = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.25, 0.6),
    fireMat
  );
  ashPitEmbers.position.set(0, 0.15, 1.7);
  furnaceGroup.add(ashPitEmbers);

  // 3C. Curved Stone Work Ledge / Hearth Bench
  const stoneLedge = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.2, 14, 1, false, 0, Math.PI * 1.3),
    stoneMat
  );
  stoneLedge.position.set(0, 1.38, 0);
  stoneLedge.rotation.y = -Math.PI * 0.65;
  furnaceGroup.add(stoneLedge);

  // 3D. Open Arched Hearth Chamber
  // Inner soot-stained chamber
  const cavity = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.5, 1.2, 10),
    darkSootMat
  );
  cavity.position.set(0, 1.2, 0.2);
  furnaceGroup.add(cavity);

  // Glowing Roaring Molten Coal Bed inside Hearth
  const coalBed = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.35, 0.32, 10),
    fireMat
  );
  coalBed.position.set(0, 0.95, 0.35);
  furnaceGroup.add(coalBed);

  // Dancing Flame Meshes inside Hearth
  const flameGroup = new THREE.Group();
  flameGroup.name = 'FurnaceFlames';
  const flamePositions = [
    { x: -0.35, y: 1.35, z: 0.35, scale: 0.35, h: 0.95 },
    { x: 0.25, y: 1.45, z: 0.45, scale: 0.4, h: 1.15 },
    { x: -0.05, y: 1.55, z: 0.25, scale: 0.45, h: 1.3 },
    { x: 0.4, y: 1.3, z: 0.2, scale: 0.32, h: 0.85 }
  ];
  flamePositions.forEach((fp) => {
    const fCone = new THREE.Mesh(new THREE.ConeGeometry(fp.scale, fp.h, 6), fireMat);
    fCone.position.set(fp.x, fp.y, fp.z);
    flameGroup.add(fCone);
  });
  furnaceGroup.add(flameGroup);

  // Stone Hearth Arch Ring / Voussoirs
  const archRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.26, 7, 10, Math.PI),
    stoneMat
  );
  archRing.position.set(0, 1.75, 1.4);
  archRing.rotation.y = 0;
  furnaceGroup.add(archRing);

  // Left & Right arch jamb pillars
  [-1.25, 1.25].forEach((px) => {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.1, 0.55), stoneMat);
    jamb.position.set(px, 1.2, 1.4);
    furnaceGroup.add(jamb);
  });

  // Hot iron tongs / poker resting on the ledge with tip in the fire
  const poker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6),
    ironMat
  );
  poker.position.set(-0.35, 1.48, 1.2);
  poker.rotation.x = 0.28;
  poker.rotation.z = -0.22;
  furnaceGroup.add(poker);

  // Glowing orange tip of the poker in the coals
  const pokerTip = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.22, 0.06),
    glowingSteelMat
  );
  pokerTip.position.set(-0.55, 1.32, 0.6);
  furnaceGroup.add(pokerTip);

  // 3E. Stone Hood / Chimney Mantle (tapering upwards)
  const mantle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 2.15, 1.8, 12, 1, false, 0, Math.PI * 1.3),
    stoneMat
  );
  mantle.position.set(0, 2.35, 0);
  mantle.rotation.y = -Math.PI * 0.65;
  furnaceGroup.add(mantle);

  const mantleBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 1.8, 1.5),
    stoneMat
  );
  mantleBack.position.set(0, 2.35, -0.7);
  furnaceGroup.add(mantleBack);

  // 3F. Tall Stone Chimney Stack (Square/Octagonal with rim)
  const chimneyStack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.05, 3.2, 8),
    stoneMat
  );
  chimneyStack.position.set(0, 4.8, -0.1);
  furnaceGroup.add(chimneyStack);

  // Decorative flared stone collar / chimney cap rim (as seen clearly in the image)
  const chimneyCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 0.88, 0.35, 8),
    stoneMat
  );
  chimneyCollar.position.set(0, 6.35, -0.1);
  furnaceGroup.add(chimneyCollar);

  const flueHole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.65, 0.4, 8),
    darkSootMat
  );
  flueHole.position.set(0, 6.45, -0.1);
  furnaceGroup.add(flueHole);

  forge.add(furnaceGroup);

  // ==========================================================================
  // 4. BLACKSMITH ANVIL STATION (Left Side, with Forging Fire on Top)
  // ==========================================================================
  const anvilStation = new THREE.Group();
  anvilStation.name = 'AnvilStation';
  anvilStation.position.set(-2.2, 0.25, 0.8);

  // 4A. Solid Dark Timber Beam Block Foundation
  const timberBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.72, 1.3),
    woodMat
  );
  timberBase.position.set(0, 0.36, 0);
  anvilStation.add(timberBase);

  // Iron base mounting clamps / brackets
  [-0.6, 0.6].forEach((cx) => {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.35), ironMat);
    clamp.position.set(cx, 0.35, 0);
    anvilStation.add(clamp);
  });

  // 4B. Forged Cast Iron Anvil
  const anvilBody = new THREE.Group();
  anvilBody.position.set(0, 0.72, 0);

  // Wide flared foot base
  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.16, 0.85),
    ironMat
  );
  foot.position.y = 0.08;
  anvilBody.add(foot);

  // Curved narrow waist
  const waist = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.38, 0.52),
    ironMat
  );
  waist.position.y = 0.35;
  anvilBody.add(waist);

  // Flat working face & stepped table
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.22, 0.58),
    ironMat
  );
  face.position.set(-0.08, 0.65, 0);
  anvilBody.add(face);

  // Tapered round horn (bick) pointing forward-right
  const hornGeo = new THREE.ConeGeometry(0.24, 0.75, 8);
  hornGeo.rotateZ(-Math.PI / 2);
  const horn = new THREE.Mesh(hornGeo, ironMat);
  horn.position.set(0.85, 0.66, 0);
  horn.rotation.y = 0.35; // angled toward front-right
  anvilBody.add(horn);

  // Square heel on the opposite end
  const heel = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.2, 0.54),
    ironMat
  );
  heel.position.set(-0.72, 0.64, 0);
  anvilBody.add(heel);

  // 4C. Red-Hot Glowing Steel Workpiece / Ingot on Anvil Face
  const hotBillet = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.1, 0.22),
    glowingSteelMat
  );
  hotBillet.position.set(-0.05, 0.81, 0);
  hotBillet.rotation.y = 0.25;
  anvilBody.add(hotBillet);

  // 4D. ACTIVE FORGING FIRE BLAZING ON ANVIL (prominent feature in forjaHumanos.png!)
  const anvilFlames = new THREE.Group();
  anvilFlames.name = 'AnvilFlames';
  const afPositions = [
    { x: -0.1, y: 1.15, z: 0.02, scale: 0.24, h: 0.75 },
    { x: 0.06, y: 1.25, z: -0.04, scale: 0.28, h: 0.9 },
    { x: 0.18, y: 1.1, z: 0.05, scale: 0.22, h: 0.65 }
  ];
  afPositions.forEach((af) => {
    const aCone = new THREE.Mesh(new THREE.ConeGeometry(af.scale, af.h, 5), fireMat);
    aCone.position.set(af.x, af.y, af.z);
    anvilFlames.add(aCone);
  });
  anvilBody.add(anvilFlames);

  anvilStation.add(anvilBody);
  forge.add(anvilStation);

  // ==========================================================================
  // 5. BLACKSMITH TOOLS & SCENERY PROPS (matching forjaHumanos.png)
  // ==========================================================================

  // 5A. Tall Blacksmith Sledgehammer leaning against furnace on the right side
  const sledgeHammerGroup = new THREE.Group();
  sledgeHammerGroup.name = 'SledgeHammer';
  sledgeHammerGroup.position.set(2.4, 0.25, 0.95);
  sledgeHammerGroup.rotation.z = -0.22; // leaning against furnace
  sledgeHammerGroup.rotation.x = -0.12;

  // Long wooden shaft/handle
  const hHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.045, 2.4, 6),
    woodMat
  );
  hHandle.position.y = 1.2;
  sledgeHammerGroup.add(hHandle);

  // Heavy rectangular forged steel hammerhead
  const hHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.44, 0.28),
    ironMat
  );
  hHead.position.y = 1.95;
  sledgeHammerGroup.add(hHead);

  forge.add(sledgeHammerGroup);

  // 5B. Chopped Tree Stump / Log Block beside the hammer
  const stumpGroup = new THREE.Group();
  stumpGroup.name = 'LogStump';
  stumpGroup.position.set(2.9, 0.25, 0.65);

  const stumpBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.48, 0.85, 10),
    woodMat
  );
  stumpBody.position.y = 0.425;
  stumpGroup.add(stumpBody);

  forge.add(stumpGroup);

  // 5C. Long Forging Tongs leaning against left side of furnace
  const leftTongsGroup = new THREE.Group();
  leftTongsGroup.name = 'LeftTongs';
  leftTongsGroup.position.set(-1.15, 0.25, -0.6);
  leftTongsGroup.rotation.z = 0.24;

  const tongArm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5), ironMat);
  tongArm1.position.set(-0.04, 0.9, 0);
  leftTongsGroup.add(tongArm1);

  const tongArm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5), ironMat);
  tongArm2.position.set(0.04, 0.9, 0);
  leftTongsGroup.add(tongArm2);

  const tongPivot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), ironMat);
  tongPivot.position.set(0, 1.45, 0);
  tongPivot.rotation.x = Math.PI / 2;
  leftTongsGroup.add(tongPivot);

  forge.add(leftTongsGroup);

  // 5D. Hand Tools on Ground in Front (hand hammer, small tongs, cooling steel billets)
  const groundTools = new THREE.Group();
  groundTools.name = 'GroundTools';
  groundTools.position.set(0.3, 0.25, 1.6);

  // Hand hammer on ground
  const handHammer = new THREE.Group();
  handHammer.position.set(0.2, 0.06, 0.3);
  handHammer.rotation.y = 0.5;

  const hhHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.6, 5), woodMat);
  hhHandle.rotation.z = Math.PI / 2;
  handHammer.add(hhHandle);

  const hhHead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), ironMat);
  hhHead.position.x = -0.3;
  handHammer.add(hhHead);
  groundTools.add(handHammer);

  // Small tongs on ground
  const smallTongs = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.04, 0.12),
    ironMat
  );
  smallTongs.position.set(-0.35, 0.04, 0.1);
  smallTongs.rotation.y = -0.6;
  groundTools.add(smallTongs);

  // Cooling steel bar billets
  for (let b = 0; b < 2; b++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.16), ironMat);
    bar.position.set(b * 0.22 - 0.1, 0.04 + b * 0.06, -0.2);
    bar.rotation.y = b * 0.35 + 0.1;
    groundTools.add(bar);
  }

  forge.add(groundTools);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(forge);
}
