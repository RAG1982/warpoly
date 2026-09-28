import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcSplitRoofTextures,
  getOrcSpikedIronTextures,
  getOrcBoneTuskTextures,
  getOrcBasaltStoneTextures,
  getOrcBlazingFireTextures
} from './orcTextures.js';

/**
 * Next-Gen AAA Stylized Orc War Forge (Forja de Guerra e Fundição da Horda)
 * Faithfully matches the top left building in modeloorcs.png.
 *
 * Visual Features:
 * - Monumental soot-stained volcanic basalt stone blast furnace with iron reinforcement bands.
 * - Tall square stepped chimney tapering upwards, puffing dense black smoke.
 * - Arched furnace mouth with roaring yellow-orange molten flame bed and burning coals.
 * - Heavy cast-iron exhaust cowl and hood.
 * - Blacksmith courtyard with forged dark iron anvil on a carved tree-trunk block.
 * - Blacksmith forging hammer, tongs, and glowing red-hot iron weapon billet.
 * - Wooden water quenching barrel with metal hoops.
 * - Stacks of cooling iron ingots and rough steel weapon blanks (axe heads, sword blades).
 * - Timber lean-to shelter with riveted iron armor plating.
 *
 * @returns {THREE.Group}
 */
export function createOrcForge() {
  const forge = new THREE.Group();
  forge.name = 'OrcForge';

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

  const basaltMat = createPBRMaterial(getOrcBasaltStoneTextures(), { bumpScale: 0.08, roughness: 0.85 });
  const barkMat = createPBRMaterial(getOrcDarkLogBarkTextures(), { bumpScale: 0.08 });
  const logEndMat = createPBRMaterial(getOrcLogEndTextures(), { bumpScale: 0.06 });
  const ironRoofMat = createPBRMaterial(getOrcSplitRoofTextures(), { bumpScale: 0.08, metalness: 0.8 });
  const ironArmorMat = createPBRMaterial(getOrcSpikedIronTextures(), { bumpScale: 0.06, metalness: 0.92 });
  const boneMat = createPBRMaterial(getOrcBoneTuskTextures(), { bumpScale: 0.05, roughness: 0.45 });

  const fireTex = getOrcBlazingFireTextures();
  const fireMat = new THREE.MeshStandardMaterial({
    map: fireTex.map,
    emissiveMap: fireTex.emissiveMap,
    emissive: 0xff4400,
    emissiveIntensity: 2.8,
    roughness: 0.4,
    transparent: true,
    opacity: 0.95
  });

  const glowingBilletMat = new THREE.MeshStandardMaterial({
    color: 0xff3b00,
    emissive: 0xff6600,
    emissiveIntensity: 2.5,
    roughness: 0.3,
    metalness: 0.5
  });

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x3c4350,
    roughness: 0.35,
    metalness: 0.85,
    flatShading: true
  });

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x3b627a,
    roughness: 0.06,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85
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
  // 2. BASALT STONE & SLAG FOUNDATION
  // ==========================================================================
  const baseWidth = 8.6;
  const baseDepth = 8.0;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(baseWidth, 0.45, baseDepth), basaltMat);
  plinth.position.set(0, 0.22, 0);
  forge.add(plinth);

  // Cast iron bevel rim
  const rim = new THREE.Mesh(new THREE.BoxGeometry(baseWidth + 0.3, 0.15, baseDepth + 0.3), darkIronMat);
  rim.position.set(0, 0.4, 0);
  forge.add(rim);

  // ==========================================================================
  // 3. MONUMENTAL BLAST FURNACE & STEPPED BASALT CHIMNEY
  // ==========================================================================
  const furnaceGroup = new THREE.Group();
  furnaceGroup.name = 'BlastFurnace';
  furnaceGroup.position.set(-1.4, 0.45, -1.2);

  // Main Furnace Body (Thick basalt stone masonry block)
  const furnaceBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 3.8), basaltMat);
  furnaceBody.position.set(0, 1.8, 0);
  furnaceGroup.add(furnaceBody);

  // Cast Iron Reinforcement Straps around furnace body
  [0.8, 2.2, 3.4].forEach(fy => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.14, 3.95), darkIronMat);
    strap.position.set(0, fy, 0);
    furnaceGroup.add(strap);
  });

  // Arched Blast Furnace Mouth (Front opening at Z = 1.9)
  const archRim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 0.4), darkIronMat);
  archRim.position.set(0, 1.25, 1.9);
  furnaceGroup.add(archRim);

  const innerCavity = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 1.2), darkIronMat);
  innerCavity.position.set(0, 1.2, 1.3);
  furnaceGroup.add(innerCavity);

  // Roaring Molten Coal Bed & Fire
  const fireBed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.4), fireMat);
  fireBed.position.set(0, 0.45, 1.3);
  furnaceGroup.add(fireBed);

  // Flames rising inside furnace mouth
  for (let fx = -0.6; fx <= 0.6; fx += 0.4) {
    const fCone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.95, 5), fireMat);
    fCone.position.set(fx, 0.95, 1.3 + (Math.sin(fx * 4) * 0.2));
    furnaceGroup.add(fCone);
  }

  // Overhead Hammered Iron Exhaust Cowl & Hood
  const cowl = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 4), darkIronMat);
  cowl.position.set(0, 3.2, 1.4);
  cowl.rotation.y = Math.PI / 4;
  cowl.scale.set(1.4, 1.0, 0.8);
  furnaceGroup.add(cowl);

  // --- STEPPED BASALT CHIMNEY STACK (Rising to ~8.2m) ---
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'BasaltChimney';
  chimneyGroup.position.set(-0.4, 3.6, -0.2);

  // Tier 1: Lower chimney block
  const cT1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), basaltMat);
  cT1.position.y = 0.9;
  chimneyGroup.add(cT1);

  // Tier 2: Mid tapering stack
  const cT2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.8, 1.7), basaltMat);
  cT2.position.y = 2.7;
  chimneyGroup.add(cT2);

  // Tier 3: Upper tall stack
  const cT3 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 1.3), basaltMat);
  cT3.position.y = 4.5;
  chimneyGroup.add(cT3);

  // Top Flue Rim & Iron Cap
  const cTop = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.3, 1.45), darkIronMat);
  cTop.position.y = 5.5;
  chimneyGroup.add(cTop);

  // Iron Chimney Bands
  [1.8, 3.6, 5.2].forEach(by => {
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 1.85), darkIronMat);
    bMesh.position.y = by;
    chimneyGroup.add(bMesh);
  });

  furnaceGroup.add(chimneyGroup);
  forge.add(furnaceGroup);

  // ==========================================================================
  // 4. TIMBER LEAN-TO SHELTER WITH RIVETED IRON PLATING
  // ==========================================================================
  const shelterGroup = new THREE.Group();
  shelterGroup.name = 'ForgeShelter';
  shelterGroup.position.set(1.2, 0.45, 0);

  // Upright timber log pillars
  const colCoords = [
    [1.8, -3.2],
    [1.8, 3.0],
    [-1.0, 3.0]
  ];
  colCoords.forEach(([cx, cz]) => {
    const col = createDetailedLog(0.24, 3.8);
    col.position.set(cx, 1.9, cz);
    shelterGroup.add(col);
  });

  // Pitch Slanted Ironclad Roof
  const roofSlope = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 6.8), ironRoofMat);
  roofSlope.position.set(0.6, 4.0, 0);
  roofSlope.rotation.z = -0.28;
  shelterGroup.add(roofSlope);

  // Riveted dark iron armor plates on roof
  for (let p = 0; p < 3; p++) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 6.9), ironArmorMat);
    plate.position.set(p * 1.15 - 0.4, 4.08, 0);
    plate.rotation.z = -0.28;
    shelterGroup.add(plate);
  }

  forge.add(shelterGroup);

  // ==========================================================================
  // 5. BLACKSMITH ANVIL, STUMP & FORGING PROPS (Socket_Anvil)
  // ==========================================================================
  const anvilGroup = new THREE.Group();
  anvilGroup.name = 'AnvilStation';
  anvilGroup.position.set(1.6, 0.45, 1.8);

  // Carved Hardwood Tree-Trunk Base
  const stump = createDetailedLog(0.48, 0.75);
  stump.position.y = 0.375;
  anvilGroup.add(stump);

  // Iron Anvil Base Clamps
  const clampGeo = new THREE.BoxGeometry(1.1, 0.1, 0.9);
  const clamp = new THREE.Mesh(clampGeo, darkIronMat);
  clamp.position.y = 0.76;
  anvilGroup.add(clamp);

  // Heavy Forged Dark Iron Anvil
  const anvilBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.45), darkIronMat);
  anvilBody.position.y = 1.0;
  anvilGroup.add(anvilBody);

  // Tapered Round Horn (Bick)
  const hornGeo = new THREE.ConeGeometry(0.18, 0.65, 8);
  hornGeo.rotateZ(-Math.PI / 2);
  const horn = new THREE.Mesh(hornGeo, darkIronMat);
  horn.position.set(-0.65, 1.05, 0);
  anvilGroup.add(horn);

  // Flat Face / Heel of Anvil
  const faceGeo = new THREE.BoxGeometry(0.9, 0.12, 0.46);
  const face = new THREE.Mesh(faceGeo, ironArmorMat);
  face.position.set(-0.1, 1.25, 0);
  anvilGroup.add(face);

  // Glowing Red-Hot Iron Weapon Billet resting on anvil face
  const billet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.12), glowingBilletMat);
  billet.position.set(-0.1, 1.34, 0);
  billet.rotation.y = 0.2;
  anvilGroup.add(billet);

  // Blacksmith Forging Hammer
  const hammerGroup = new THREE.Group();
  hammerGroup.position.set(0.15, 1.35, 0.18);
  hammerGroup.rotation.y = -0.4;
  hammerGroup.rotation.z = -0.15;

  const hHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 5), barkMat);
  hHandle.position.x = 0.25;
  hHandle.rotation.z = Math.PI / 2;
  hammerGroup.add(hHandle);

  const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.14), darkIronMat);
  hammerGroup.add(hHead);
  anvilGroup.add(hammerGroup);

  // Forging Tongs gripping billet
  const tong1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), darkIronMat);
  tong1.position.set(-0.4, 1.32, 0.1);
  tong1.rotation.z = 1.2;
  anvilGroup.add(tong1);

  forge.add(anvilGroup);

  // ==========================================================================
  // 6. QUENCHING WATER BARREL & WEAPON BLANKS
  // ==========================================================================
  const quenchGroup = new THREE.Group();
  quenchGroup.name = 'QuenchingBarrel';
  quenchGroup.position.set(2.8, 0.45, 0.2);

  // Wooden Barrel with Iron Hoops
  const barrelGeo = new THREE.CylinderGeometry(0.48, 0.44, 0.95, 10);
  const barrel = new THREE.Mesh(barrelGeo, barkMat);
  barrel.position.y = 0.48;
  quenchGroup.add(barrel);

  [0.2, 0.5, 0.8].forEach(by => {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.08, 10, 1, true), darkIronMat);
    hoop.position.y = by;
    quenchGroup.add(hoop);
  });

  // Water Surface
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.44, 10), waterMat);
  water.position.y = 0.92;
  water.rotation.x = -Math.PI / 2;
  quenchGroup.add(water);

  forge.add(quenchGroup);

  // Stacks of Iron Ingots
  const ingotGroup = new THREE.Group();
  ingotGroup.position.set(1.4, 0.45, -1.8);

  const ingotGeo = new THREE.BoxGeometry(0.65, 0.16, 0.32);
  for (let i = 0; i < 4; i++) {
    const ingot = new THREE.Mesh(ingotGeo, darkIronMat);
    ingot.position.set((i % 2) * 0.35 - 0.2, Math.floor(i / 2) * 0.18 + 0.08, 0);
    ingotGroup.add(ingot);
  }
  forge.add(ingotGroup);

  // Finished Orc Weapon Blanks (Double Axe & Broadsword on rack)
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.25), barkMat);
  rack.position.set(3.4, 1.05, -2.2);
  rack.rotation.y = -0.35;
  forge.add(rack);

  const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.03), ironArmorMat);
  swordBlade.position.set(3.3, 1.4, -2.15);
  swordBlade.rotation.z = -0.15;
  forge.add(swordBlade);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(forge);
}
