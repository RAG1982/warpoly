import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { getGoldMineMaterials } from './goldMineTextures.js';

/**
 * Next-Gen Stylized Low-Poly Gold Mine (Mina de Ouro)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch (UE5 Stylized AAA Quality).
 *
 * Comprehensive Subterranean Mining Operation:
 * 1. Mountainous rocky crags with jagged stylized dodecahedral formations and rich embedded gold veins.
 * 2. Fortified mine entrance (adit portal) built from heavy squared oak timbers with iron corner plates and roof canopy.
 * 3. Deep cavern shaft opening with multi-layered timber arches and depth occlusion.
 * 4. Wooden railway tracks with creosote cross ties, steel rails, and track bumper emerging from the shaft.
 * 5. Heavy wooden/iron minecart sitting on the tracks filled to overflowing with glittering gold nuggets.
 * 6. Hanging iron mine lantern casting a warm amber glow over the entrance.
 * 7. Environmental detail props: Mining pickaxes, stenciled wooden ore crates filled with gold, supply barrel, shovel, and spilled nuggets.
 *
 * @returns {THREE.Group}
 */
export function createGoldMine() {
  const mine = new THREE.Group();
  mine.name = 'GoldMine';

  // Get procedural hand-painted PBR materials
  const mats = getGoldMineMaterials();

  // ---------------------------------------------------------------------------
  // 1. MOUNTAIN CRAGS & EMBEDDED GOLD ORE FORMATIONS
  // ---------------------------------------------------------------------------
  const mountain = buildMountainCrags(mats);
  mine.add(mountain);

  // ---------------------------------------------------------------------------
  // 2. CAVERN SHAFT OPENING WITH DEPTH OCCLUSION
  // ---------------------------------------------------------------------------
  const cavern = buildCavernTunnel(mats);
  mine.add(cavern);

  // ---------------------------------------------------------------------------
  // 3. FORTIFIED ADIT PORTAL & PROTECTIVE ROOF CANOPY
  // ---------------------------------------------------------------------------
  const portal = buildAditPortal(mats);
  mine.add(portal);

  // ---------------------------------------------------------------------------
  // 4. WOODEN RAILWAY TRACKS & CROSS TIES
  // ---------------------------------------------------------------------------
  const tracks = buildRailwayTracks(mats);
  mine.add(tracks);

  // ---------------------------------------------------------------------------
  // 5. HEAVY WOODEN/IRON MINECART FILLED WITH GOLD NUGGETS
  // ---------------------------------------------------------------------------
  const cart = buildMinecart(mats);
  mine.add(cart);

  // ---------------------------------------------------------------------------
  // 6. DETAIL PROPS (LANTERN, PICKAXES, CRATES, BARREL, SHOVEL)
  // ---------------------------------------------------------------------------
  const props = buildMineProps(mats);
  mine.add(props);

  return enableShadows(mine);
}

/**
 * 1. Build massive mountain crags, jagged rock formations, and embedded gold veins
 */
function buildMountainCrags(mats) {
  const group = new THREE.Group();
  group.name = 'MountainCrags';

  // Natural foundation stone skirting (prevents ground seams on uneven terrain)
  const baseRockGeo = new THREE.CylinderGeometry(3.3, 3.6, 0.35, 14);
  const baseRock = new THREE.Mesh(baseRockGeo, mats.rockDark);
  baseRock.position.set(0, 0.12, -0.3);
  baseRock.rotation.y = 0.3;
  group.add(baseRock);

  // Primary mountain crag boulders (jagged stylized dodecahedrons forming the horseshoe mountain)
  const cragSpecs = [
    // --- Mountain Summit & Rear Wall ---
    { x: 0.0, y: 2.7, z: -1.3, s: 1.75, sy: 0.9, rx: 0.2, ry: 0.4, rz: -0.1 },
    { x: -1.1, y: 2.4, z: -1.7, s: 1.6, sy: 0.9, rx: -0.3, ry: 0.8, rz: 0.2 },
    { x: 1.2, y: 2.5, z: -1.5, s: 1.65, sy: 0.9, rx: 0.4, ry: -0.5, rz: -0.3 },
    { x: 0.2, y: 3.3, z: -1.9, s: 1.45, sy: 1.0, rx: 0.1, ry: 1.2, rz: 0.4 }, // Summit peak
    { x: -1.8, y: 1.9, z: -1.8, s: 1.4, sy: 0.9, rx: -0.2, ry: 0.3, rz: 0.5 },
    { x: 1.9, y: 2.0, z: -1.7, s: 1.4, sy: 0.9, rx: 0.3, ry: -0.7, rz: -0.2 },
    { x: -2.4, y: 1.4, z: -1.0, s: 1.3, sy: 0.85, rx: 0.5, ry: 0.6, rz: -0.4 },
    { x: 2.5, y: 1.4, z: -0.9, s: 1.3, sy: 0.85, rx: -0.4, ry: -0.8, rz: 0.3 },
    { x: 0.0, y: 1.5, z: -2.3, s: 1.35, sy: 0.85, rx: 0.2, ry: 0.1, rz: 0.6 },

    // --- Left Flank Escarpment ---
    { x: -2.1, y: 1.5, z: 0.1, s: 1.35, sy: 0.85, rx: 0.4, ry: 0.5, rz: -0.2 },
    { x: -2.3, y: 1.1, z: 1.0, s: 1.15, sy: 0.75, rx: -0.3, ry: 0.9, rz: 0.4 },
    { x: -1.8, y: 0.85, z: 1.9, s: 0.95, sy: 0.7, rx: 0.2, ry: 0.3, rz: -0.5 },
    { x: -2.5, y: 0.85, z: -0.2, s: 1.15, sy: 0.75, rx: 0.6, ry: -0.4, rz: 0.3 },
    { x: -1.3, y: 0.7, z: 2.3, s: 0.85, sy: 0.65, rx: -0.1, ry: 0.7, rz: 0.2 },

    // --- Right Flank Escarpment ---
    { x: 2.1, y: 1.5, z: 0.1, s: 1.3, sy: 0.85, rx: -0.3, ry: -0.6, rz: 0.3 },
    { x: 2.3, y: 1.1, z: 1.0, s: 1.1, sy: 0.75, rx: 0.4, ry: -0.9, rz: -0.2 },
    { x: 1.8, y: 0.85, z: 2.0, s: 0.9, sy: 0.7, rx: -0.2, ry: -0.4, rz: 0.5 },
    { x: 2.5, y: 0.85, z: -0.1, s: 1.1, sy: 0.75, rx: -0.5, ry: 0.5, rz: -0.3 },
    { x: 1.4, y: 0.7, z: 2.4, s: 0.8, sy: 0.65, rx: 0.3, ry: -0.8, rz: -0.1 },

    // --- Over-Portal Natural Rock Arch & Brow ---
    { x: 0.0, y: 2.6, z: 0.3, s: 1.5, sy: 0.85, rx: 0.3, ry: 0.2, rz: -0.1 },
    { x: -0.85, y: 2.3, z: 0.7, s: 1.2, sy: 0.85, rx: -0.2, ry: 0.6, rz: 0.3 },
    { x: 0.95, y: 2.4, z: 0.6, s: 1.2, sy: 0.85, rx: 0.4, ry: -0.7, rz: -0.2 }
  ];

  cragSpecs.forEach((c, idx) => {
    const geo = new THREE.DodecahedronGeometry(c.s, 0);
    if (c.sy && c.sy !== 1) geo.scale(1, c.sy, 1);
    const mat = (idx % 3 === 0) ? mats.rockDark : mats.rock;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.x, c.y, c.z);
    mesh.rotation.set(c.rx, c.ry, c.rz);
    group.add(mesh);
  });

  // ---------------------------------------------------------------------------
  // Embedded Sparkling Gold Ore Formations & Crystal Needles
  // ---------------------------------------------------------------------------
  const oreClusters = [
    // Summit rich gold vein
    { x: 0.3, y: 3.3, z: -1.2, s: 0.9, bright: true },
    { x: -0.4, y: 3.1, z: -1.4, s: 0.8, bright: false },
    { x: 0.9, y: 2.9, z: -1.1, s: 0.75, bright: true },
    { x: -0.1, y: 3.6, z: -1.7, s: 0.7, bright: true },

    // Left cliff face gold vein
    { x: -1.7, y: 1.9, z: 0.4, s: 0.95, bright: true },
    { x: -2.0, y: 1.3, z: 0.9, s: 0.8, bright: false },
    { x: -1.5, y: 0.9, z: 1.6, s: 0.7, bright: true },
    { x: -2.3, y: 2.1, z: -0.5, s: 0.85, bright: true },
    { x: -1.1, y: 0.55, z: 2.2, s: 0.55, bright: true },

    // Right cliff face gold vein
    { x: 1.7, y: 1.9, z: 0.3, s: 0.9, bright: true },
    { x: 2.0, y: 1.3, z: 1.0, s: 0.8, bright: false },
    { x: 1.5, y: 0.9, z: 1.7, s: 0.65, bright: true },
    { x: 2.3, y: 2.1, z: -0.6, s: 0.88, bright: true },
    { x: 1.2, y: 0.55, z: 2.3, s: 0.55, bright: true },

    // Portal brow & arch gold nuggets
    { x: -0.65, y: 2.6, z: 0.7, s: 0.65, bright: true },
    { x: 0.6, y: 2.5, z: 0.65, s: 0.7, bright: true },
    { x: 0.0, y: 2.9, z: 0.28, s: 0.8, bright: false }
  ];

  oreClusters.forEach(o => {
    const geo = new THREE.DodecahedronGeometry(o.s, 0);
    const mat = o.bright ? mats.goldOreBright : mats.goldOre;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(o.x, o.y, o.z);
    mesh.rotation.set(o.x * 0.7, o.y * 0.9, o.z * 0.5);
    group.add(mesh);
  });

  // Sharp faceted geometric gold crystal needle clusters protruding from fissures
  const needleGeo = new THREE.ConeGeometry(0.14, 0.55, 5);
  needleGeo.rotateX(Math.PI / 2);

  const crystalSpikeSpecs = [
    { x: -1.8, y: 2.1, z: 0.5, rx: 0.4, ry: 0.8, rz: 0.2, s: 1.1 },
    { x: -1.6, y: 2.2, z: 0.3, rx: 0.2, ry: 0.6, rz: -0.4, s: 0.85 },
    { x: -2.0, y: 1.9, z: 0.6, rx: 0.5, ry: 1.1, rz: 0.5, s: 0.95 },
    { x: 1.9, y: 2.0, z: 0.4, rx: 0.3, ry: -0.7, rz: -0.3, s: 1.1 },
    { x: 1.7, y: 2.1, z: 0.2, rx: 0.1, ry: -0.5, rz: 0.4, s: 0.85 },
    { x: 2.1, y: 1.9, z: 0.5, rx: 0.6, ry: -1.0, rz: -0.5, s: 0.95 },
    { x: 0.4, y: 3.5, z: -1.1, rx: -0.4, ry: 0.3, rz: 0.8, s: 1.1 },
    { x: 0.2, y: 3.6, z: -1.0, rx: -0.2, ry: 0.1, rz: 0.5, s: 0.9 }
  ];

  crystalSpikeSpecs.forEach(sp => {
    const spike = new THREE.Mesh(needleGeo, mats.goldOreBright);
    spike.position.set(sp.x, sp.y, sp.z);
    spike.rotation.set(sp.rx, sp.ry, sp.rz);
    spike.scale.setScalar(sp.s);
    group.add(spike);
  });

  return group;
}

/**
 * 2. Build subterranean cavern shaft opening with depth occlusion
 */
function buildCavernTunnel(mats) {
  const cavern = new THREE.Group();
  cavern.name = 'CavernTunnel';

  // Tunnel interior geometry: receding dark corridor
  const tunnelFloor = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 3.4), mats.rockDark);
  tunnelFloor.position.set(0, 0.12, -0.3);
  cavern.add(tunnelFloor);

  // Left cavern rock wall
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 3.2), mats.rockDark);
  wallL.position.set(-1.15, 1.25, -0.3);
  cavern.add(wallL);

  // Right cavern rock wall
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 3.2), mats.rockDark);
  wallR.position.set(1.15, 1.25, -0.3);
  cavern.add(wallR);

  // Angled rock tunnel ceiling
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.45, 3.2), mats.rockDark);
  ceiling.position.set(0, 2.5, -0.3);
  cavern.add(ceiling);

  // Internal secondary timber arch rib (creates true 3D depth and parallax inside the shaft)
  const intArch = new THREE.Group();
  intArch.name = 'InternalTimberRib';

  const intPostGeo = new THREE.BoxGeometry(0.24, 2.3, 0.24);
  const intPostL = new THREE.Mesh(intPostGeo, mats.timberDark);
  intPostL.position.set(-0.92, 1.15, -0.6);
  intArch.add(intPostL);

  const intPostR = new THREE.Mesh(intPostGeo, mats.timberDark);
  intPostR.position.set(0.92, 1.15, -0.6);
  intArch.add(intPostR);

  const intLintel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.28), mats.timberDark);
  intLintel.position.set(0, 2.3, -0.6);
  intArch.add(intLintel);
  cavern.add(intArch);

  // Third rock arch rib even deeper in the shaft
  const deepPostL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.1, 0.22), mats.timberDark);
  deepPostL.position.set(-0.88, 1.05, -1.4);
  cavern.add(deepPostL);

  const deepPostR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.1, 0.22), mats.timberDark);
  deepPostR.position.set(0.88, 1.05, -1.4);
  cavern.add(deepPostR);

  const deepLintel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.24), mats.timberDark);
  deepLintel.position.set(0, 2.1, -1.4);
  cavern.add(deepLintel);

  // Pitch black depth occlusion back-wall
  const backOccluder = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), mats.tunnelBlack);
  backOccluder.position.set(0, 1.2, -1.95);
  cavern.add(backOccluder);

  return cavern;
}

/**
 * 3. Build fortified adit portal from heavy squared oak timbers with iron plates and roof canopy
 */
function buildAditPortal(mats) {
  const portal = new THREE.Group();
  portal.name = 'AditPortal';

  const portalZ = 1.35;
  const postW = 0.32;
  const postD = 0.32;
  const postH = 2.65;

  // Trapezoidal mine adit tilt: jambs slant slightly inward toward the top
  const postGeo = new THREE.BoxGeometry(postW, postH, postD);

  // Left jamb timber post
  const postL = new THREE.Mesh(postGeo, mats.timber);
  postL.position.set(-1.12, postH * 0.5, portalZ);
  postL.rotation.z = -0.06; // Authentic inward mine slant
  portal.add(postL);

  // Right jamb timber post
  const postR = new THREE.Mesh(postGeo, mats.timber);
  postR.position.set(1.12, postH * 0.5, portalZ);
  postR.rotation.z = 0.06; // Authentic inward mine slant
  portal.add(postR);

  // Base timber sill footing blocks
  const sillGeo = new THREE.BoxGeometry(0.44, 0.3, 0.44);
  const sillL = new THREE.Mesh(sillGeo, mats.timberDark);
  sillL.position.set(-1.16, 0.15, portalZ);
  portal.add(sillL);

  const sillR = new THREE.Mesh(sillGeo, mats.timberDark);
  sillR.position.set(1.16, 0.15, portalZ);
  portal.add(sillR);

  // Heavy top lintel beam spanning across posts with mortise overhangs
  const lintelGeo = new THREE.BoxGeometry(2.85, 0.38, 0.42);
  const lintel = new THREE.Mesh(lintelGeo, mats.timber);
  lintel.position.set(0, 2.58, portalZ);
  portal.add(lintel);

  // 45-degree angle knee-brace timber struts
  const braceGeo = new THREE.BoxGeometry(0.2, 0.72, 0.2);

  const braceL = new THREE.Mesh(braceGeo, mats.timberDark);
  braceL.position.set(-0.84, 2.24, portalZ);
  braceL.rotation.z = Math.PI / 4;
  portal.add(braceL);

  const braceR = new THREE.Mesh(braceGeo, mats.timberDark);
  braceR.position.set(0.84, 2.24, portalZ);
  braceR.rotation.z = -Math.PI / 4;
  portal.add(braceR);

  // Iron corner plates & forged bolt heads
  const plateGeo = new THREE.BoxGeometry(0.36, 0.36, 0.46);
  const plateL = new THREE.Mesh(plateGeo, mats.ironHardware);
  plateL.position.set(-1.05, 2.58, portalZ);
  portal.add(plateL);

  const plateR = new THREE.Mesh(plateGeo, mats.ironHardware);
  plateR.position.set(1.05, 2.58, portalZ);
  portal.add(plateR);

  // Forged square bolt heads on iron plates
  const boltGeo = new THREE.BoxGeometry(0.06, 0.06, 0.08);
  [-1.15, -0.95].forEach(bx => {
    [2.48, 2.68].forEach(by => {
      const bolt = new THREE.Mesh(boltGeo, mats.ironHardware);
      bolt.position.set(bx, by, portalZ + 0.24);
      portal.add(bolt);
    });
  });
  [0.95, 1.15].forEach(bx => {
    [2.48, 2.68].forEach(by => {
      const bolt = new THREE.Mesh(boltGeo, mats.ironHardware);
      bolt.position.set(bx, by, portalZ + 0.24);
      portal.add(bolt);
    });
  });

  // ---------------------------------------------------------------------------
  // Protective Timber Roof Canopy (Deflects falling rock)
  // ---------------------------------------------------------------------------
  const canopy = new THREE.Group();
  canopy.name = 'RoofCanopy';

  // 4 Cantilevered roof rafters extending forward
  const rafterGeo = new THREE.BoxGeometry(0.18, 0.18, 1.25);
  const rafterX = [-1.1, -0.38, 0.38, 1.1];
  rafterX.forEach(rx => {
    const rafter = new THREE.Mesh(rafterGeo, mats.timberDark);
    rafter.position.set(rx, 2.76, portalZ + 0.38);
    rafter.rotation.x = 0.18; // Downward pitch
    canopy.add(rafter);
  });

  // Overhanging timber shingle roof deck
  const deckGeo = new THREE.BoxGeometry(3.05, 0.1, 1.3);
  const deck = new THREE.Mesh(deckGeo, mats.timber);
  deck.position.set(0, 2.86, portalZ + 0.4);
  deck.rotation.x = 0.18;
  canopy.add(deck);

  // Dark iron front drip fascia trim
  const fasciaGeo = new THREE.BoxGeometry(3.1, 0.12, 0.08);
  const fascia = new THREE.Mesh(fasciaGeo, mats.ironHardware);
  fascia.position.set(0, 2.74, portalZ + 1.02);
  fascia.rotation.x = 0.18;
  canopy.add(fascia);

  // Carved wooden mine sign plaque ("MINA DE OURO") suspended above lintel
  const signGeo = new THREE.BoxGeometry(1.6, 0.4, 0.08);
  const sign = new THREE.Mesh(signGeo, mats.oreCrate);
  sign.position.set(0, 2.6, portalZ + 0.24);
  canopy.add(sign);

  portal.add(canopy);
  return portal;
}

/**
 * 4. Build wooden railway tracks with creosote cross ties, steel rails, and track bumper
 */
function buildRailwayTracks(mats) {
  const tracks = new THREE.Group();
  tracks.name = 'RailwayTracks';

  // Crushed gravel / ballast rock foundation under tracks
  const ballastGeo = new THREE.BoxGeometry(1.6, 0.08, 4.8);
  const ballast = new THREE.Mesh(ballastGeo, mats.rockDark);
  ballast.position.set(0, 0.04, 1.4);
  tracks.add(ballast);

  // Railway gauge and dimensions
  const trackStartZ = -0.8; // Deep within cavern tunnel
  const trackEndZ = 3.6;    // Extends forward into mine yard
  const trackLen = trackEndZ - trackStartZ;
  const railGauge = 0.76;   // Distance between rails

  // Weathered creosote wooden cross ties (sleepers)
  const tieCount = 11;
  const tieStep = trackLen / (tieCount - 1);
  const tieGeo = new THREE.BoxGeometry(1.3, 0.09, 0.22);
  const plateGeo = new THREE.BoxGeometry(0.18, 0.03, 0.18);

  for (let i = 0; i < tieCount; i++) {
    const tz = trackStartZ + i * tieStep;
    const tie = new THREE.Mesh(tieGeo, mats.ties);
    tie.position.set(0, 0.08, tz);
    // Slight random rotation for aged handmade rustic look
    tie.rotation.y = (Math.sin(i * 1.7) * 0.02);
    tracks.add(tie);

    // Cast iron tie plates under left and right rails
    const plateL = new THREE.Mesh(plateGeo, mats.ironHardware);
    plateL.position.set(-railGauge * 0.5, 0.13, tz);
    tracks.add(plateL);

    const plateR = new THREE.Mesh(plateGeo, mats.ironHardware);
    plateR.position.set(railGauge * 0.5, 0.13, tz);
    tracks.add(plateR);
  }

  // Two parallel steel rails
  const railGeo = new THREE.BoxGeometry(0.08, 0.12, trackLen);

  const railL = new THREE.Mesh(railGeo, mats.rails);
  railL.position.set(-railGauge * 0.5, 0.19, (trackStartZ + trackEndZ) * 0.5);
  tracks.add(railL);

  const railR = new THREE.Mesh(railGeo, mats.rails);
  railR.position.set(railGauge * 0.5, 0.19, (trackStartZ + trackEndZ) * 0.5);
  tracks.add(railR);

  // End-of-line wooden track bumper block with iron braces at track terminus
  const bumper = new THREE.Group();
  bumper.name = 'TrackBumper';

  const bumpWood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.28), mats.timber);
  bumpWood.position.set(0, 0.26, trackEndZ + 0.05);
  bumper.add(bumpWood);

  // Left and right iron stop posts
  const stopGeo = new THREE.BoxGeometry(0.12, 0.35, 0.12);
  const stopL = new THREE.Mesh(stopGeo, mats.ironHardware);
  stopL.position.set(-railGauge * 0.5, 0.2, trackEndZ);
  bumper.add(stopL);

  const stopR = new THREE.Mesh(stopGeo, mats.ironHardware);
  stopR.position.set(railGauge * 0.5, 0.2, trackEndZ);
  bumper.add(stopR);

  tracks.add(bumper);
  return tracks;
}

/**
 * 5. Build heavy wooden/iron minecart sitting on tracks filled to the brim with gold nuggets
 */
function buildMinecart(mats) {
  const cart = new THREE.Group();
  cart.name = 'Minecart';

  const cartZ = 2.4; // Positioned comfortably on the tracks outside the tunnel
  const cartY = 0.19; // Sits on top of the rails
  cart.position.set(0, cartY, cartZ);

  // ---------------------------------------------------------------------------
  // Undercarriage Chassis & Flanged Cast Iron Wheels
  // ---------------------------------------------------------------------------
  const chassisGeo = new THREE.BoxGeometry(0.82, 0.1, 1.45);
  const chassis = new THREE.Mesh(chassisGeo, mats.cartIron);
  chassis.position.y = 0.15;
  cart.add(chassis);

  // Axles & 4 Flanged Wheels
  const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.94, 8);
  axleGeo.rotateZ(Math.PI / 2);

  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.07, 12);
  wheelGeo.rotateZ(Math.PI / 2);

  const flangeGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12);
  flangeGeo.rotateZ(Math.PI / 2);

  const axleZPositions = [-0.45, 0.45];
  axleZPositions.forEach(az => {
    // Axle rod
    const axle = new THREE.Mesh(axleGeo, mats.cartIron);
    axle.position.set(0, 0.1, az);
    cart.add(axle);

    // Left Wheel (Wheel tread + inner guide flange)
    const wheelL = new THREE.Mesh(wheelGeo, mats.cartIron);
    wheelL.position.set(-0.38, 0.1, az);
    cart.add(wheelL);

    const flangeL = new THREE.Mesh(flangeGeo, mats.cartIron);
    flangeL.position.set(-0.34, 0.1, az);
    cart.add(flangeL);

    // Right Wheel
    const wheelR = new THREE.Mesh(wheelGeo, mats.cartIron);
    wheelR.position.set(0.38, 0.1, az);
    cart.add(wheelR);

    const flangeR = new THREE.Mesh(flangeGeo, mats.cartIron);
    flangeR.position.set(0.34, 0.1, az);
    cart.add(flangeR);
  });

  // Front iron towing hitch coupling
  const hitchGeo = new THREE.TorusGeometry(0.08, 0.025, 6, 12);
  hitchGeo.rotateX(Math.PI / 2);
  const hitch = new THREE.Mesh(hitchGeo, mats.ironHardware);
  hitch.position.set(0, 0.16, 0.78);
  cart.add(hitch);

  // Hand brake lever on the side
  const leverGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.65, 6);
  const lever = new THREE.Mesh(leverGeo, mats.ironHardware);
  lever.position.set(0.48, 0.42, -0.3);
  lever.rotation.z = -0.35;
  cart.add(lever);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mats.timberDark);
  knob.position.set(0.6, 0.68, -0.3);
  cart.add(knob);

  // ---------------------------------------------------------------------------
  // Wooden Hopper Bucket (Angled Flared Walls)
  // ---------------------------------------------------------------------------
  const hopper = new THREE.Group();
  hopper.name = 'HopperBucket';

  // Bottom floor
  const floorGeo = new THREE.BoxGeometry(0.92, 0.08, 1.4);
  const floor = new THREE.Mesh(floorGeo, mats.cartWood);
  floor.position.y = 0.22;
  hopper.add(floor);

  // Left wall (angled slightly outward)
  const wallLGeo = new THREE.BoxGeometry(0.08, 0.7, 1.48);
  const wallL = new THREE.Mesh(wallLGeo, mats.cartWood);
  wallL.position.set(-0.52, 0.54, 0);
  wallL.rotation.z = 0.14;
  hopper.add(wallL);

  // Right wall (angled slightly outward)
  const wallR = new THREE.Mesh(wallLGeo, mats.cartWood);
  wallR.position.set(0.52, 0.54, 0);
  wallR.rotation.z = -0.14;
  hopper.add(wallR);

  // Front wall
  const wallFGeo = new THREE.BoxGeometry(1.08, 0.7, 0.08);
  const wallF = new THREE.Mesh(wallFGeo, mats.cartWood);
  wallF.position.set(0, 0.54, 0.72);
  wallF.rotation.x = -0.12;
  hopper.add(wallF);

  // Back wall
  const wallB = new THREE.Mesh(wallFGeo, mats.cartWood);
  wallB.position.set(0, 0.54, -0.72);
  wallB.rotation.x = 0.12;
  hopper.add(wallB);

  // Iron corner bracket reinforcements
  const cornerGeo = new THREE.BoxGeometry(0.08, 0.72, 0.08);
  const corners = [
    [-0.54, 0.74],
    [0.54, 0.74],
    [-0.54, -0.74],
    [0.54, -0.74]
  ];
  corners.forEach(([cx, cz]) => {
    const cBracket = new THREE.Mesh(cornerGeo, mats.ironHardware);
    cBracket.position.set(cx, 0.54, cz);
    hopper.add(cBracket);
  });

  // Iron top rim banding
  const rimXGeo = new THREE.BoxGeometry(1.2, 0.06, 0.08);
  const rimFront = new THREE.Mesh(rimXGeo, mats.ironHardware);
  rimFront.position.set(0, 0.88, 0.76);
  hopper.add(rimFront);

  const rimBack = new THREE.Mesh(rimXGeo, mats.ironHardware);
  rimBack.position.set(0, 0.88, -0.76);
  hopper.add(rimBack);

  const rimZGeo = new THREE.BoxGeometry(0.08, 0.06, 1.54);
  const rimL = new THREE.Mesh(rimZGeo, mats.ironHardware);
  rimL.position.set(-0.58, 0.88, 0);
  hopper.add(rimL);

  const rimR = new THREE.Mesh(rimZGeo, mats.ironHardware);
  rimR.position.set(0.58, 0.88, 0);
  hopper.add(rimR);

  cart.add(hopper);

  // ---------------------------------------------------------------------------
  // Overflowing Mounded Sparkling Gold Ore & Golden Nuggets
  // ---------------------------------------------------------------------------
  const oreMound = new THREE.Group();
  oreMound.name = 'GoldOreMound';

  // Base mounded mass of ore inside the cart
  const baseOreGeo = new THREE.DodecahedronGeometry(0.58, 0);
  baseOreGeo.scale(1.4, 0.8, 2.0);
  const baseOre = new THREE.Mesh(baseOreGeo, mats.goldOre);
  baseOre.position.set(0, 0.65, 0);
  oreMound.add(baseOre);

  // 22 individual sparkling gold nuggets overflowing over the top and rims
  const nuggetPositions = [
    // High central heap
    { x: 0.0, y: 0.98, z: 0.0, s: 0.28, bright: true },
    { x: -0.22, y: 0.94, z: 0.25, s: 0.24, bright: true },
    { x: 0.24, y: 0.96, z: -0.2, s: 0.25, bright: true },
    { x: -0.15, y: 0.92, z: -0.38, s: 0.22, bright: false },
    { x: 0.18, y: 0.95, z: 0.35, s: 0.23, bright: true },
    { x: 0.0, y: 1.08, z: -0.05, s: 0.22, bright: true }, // Apex peak

    // Front overflow spill
    { x: -0.28, y: 0.88, z: 0.58, s: 0.22, bright: true },
    { x: 0.05, y: 0.86, z: 0.68, s: 0.24, bright: true },
    { x: 0.32, y: 0.85, z: 0.55, s: 0.21, bright: false },
    { x: -0.12, y: 0.82, z: 0.75, s: 0.18, bright: true }, // Hanging on front rim

    // Back overflow spill
    { x: -0.25, y: 0.87, z: -0.58, s: 0.22, bright: false },
    { x: 0.08, y: 0.86, z: -0.66, s: 0.23, bright: true },
    { x: 0.28, y: 0.84, z: -0.54, s: 0.20, bright: true },

    // Left rim overhang
    { x: -0.48, y: 0.88, z: 0.1, s: 0.23, bright: true },
    { x: -0.45, y: 0.85, z: -0.25, s: 0.21, bright: true },
    { x: -0.42, y: 0.86, z: 0.38, s: 0.20, bright: false },

    // Right rim overhang
    { x: 0.48, y: 0.88, z: 0.12, s: 0.22, bright: true },
    { x: 0.44, y: 0.85, z: -0.28, s: 0.21, bright: false },
    { x: 0.46, y: 0.86, z: 0.36, s: 0.22, bright: true }
  ];

  nuggetPositions.forEach((n, idx) => {
    const geo = new THREE.DodecahedronGeometry(n.s, 0);
    const mat = n.bright ? mats.goldOreBright : mats.goldOre;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n.x, n.y, n.z);
    mesh.rotation.set(idx * 0.5, idx * 0.8, idx * 0.3);
    oreMound.add(mesh);
  });

  cart.add(oreMound);
  return cart;
}

/**
 * 6. Build detail environmental props (lantern with amber point light, pickaxes, crates, barrel, shovel)
 */
function buildMineProps(mats) {
  const props = new THREE.Group();
  props.name = 'DetailProps';

  // ---------------------------------------------------------------------------
  // A. Hanging Iron Mine Lantern with Glowing Amber Light
  // ---------------------------------------------------------------------------
  const lantern = new THREE.Group();
  lantern.name = 'HangingLantern';

  // Position: Hanging under the portal entrance canopy on the right side
  const lanternPos = new THREE.Vector3(0.88, 2.35, 1.72);
  lantern.position.copy(lanternPos);

  // Forged iron support bracket from timber post
  const bracketGeo = new THREE.BoxGeometry(0.05, 0.05, 0.45);
  const bracket = new THREE.Mesh(bracketGeo, mats.ironHardware);
  bracket.position.set(0, 0.22, -0.15);
  lantern.add(bracket);

  // Miniature iron chain links
  const chainLinkGeo = new THREE.TorusGeometry(0.03, 0.01, 4, 8);
  [-0.04, -0.09].forEach(cy => {
    const link = new THREE.Mesh(chainLinkGeo, mats.ironHardware);
    link.position.set(0, cy + 0.18, 0);
    lantern.add(link);
  });

  // Faceted top hood / cap
  const capGeo = new THREE.ConeGeometry(0.18, 0.12, 6);
  const cap = new THREE.Mesh(capGeo, mats.lanternIron);
  cap.position.y = 0.06;
  lantern.add(cap);

  // Glowing amber glass core
  const glassGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.22, 6);
  const glass = new THREE.Mesh(glassGeo, mats.lanternGlass);
  glass.position.y = -0.08;
  lantern.add(glass);

  // Iron cage bars framing the glass
  const cageBarGeo = new THREE.BoxGeometry(0.02, 0.24, 0.02);
  for (let b = 0; b < 4; b++) {
    const ang = (b / 4) * Math.PI * 2;
    const bar = new THREE.Mesh(cageBarGeo, mats.lanternIron);
    bar.position.set(Math.cos(ang) * 0.11, -0.08, Math.sin(ang) * 0.11);
    lantern.add(bar);
  }

  // Bottom oil reservoir base
  const baseReservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 6), mats.lanternIron);
  baseReservoir.position.y = -0.22;
  lantern.add(baseReservoir);

  // Soft Amber Subterranean PointLight
  // Warm golden amber glow illuminating the timbers, tracks, and gold nuggets
  const lanternLight = new THREE.PointLight(0xffaa33, 2.0, 8.0, 1.2);
  lanternLight.position.set(0, -0.08, 0);
  lanternLight.castShadow = true;
  lanternLight.shadow.bias = -0.002;
  lanternLight.shadow.mapSize.width = 1024;
  lanternLight.shadow.mapSize.height = 1024;
  lantern.add(lanternLight);

  props.add(lantern);

  // ---------------------------------------------------------------------------
  // B. Mining Pickaxes
  // ---------------------------------------------------------------------------
  function createPickaxe() {
    const pick = new THREE.Group();
    pick.name = 'Pickaxe';

    // Ash wood handle
    const handleGeo = new THREE.CylinderGeometry(0.026, 0.032, 0.96, 6);
    const handle = new THREE.Mesh(handleGeo, mats.pickaxeWood);
    handle.position.y = 0.48;
    pick.add(handle);

    // Leather hand grip wrap
    const gripGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.28, 6);
    const grip = new THREE.Mesh(gripGeo, mats.timberDark);
    grip.position.y = 0.24;
    pick.add(grip);

    // Forged steel curved double pick head
    const headGeo = new THREE.BoxGeometry(0.06, 0.08, 0.48);
    const head = new THREE.Mesh(headGeo, mats.pickaxeSteel);
    head.position.y = 0.94;
    pick.add(head);

    // Pointed pick tip on one end
    const tipPoint = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), mats.pickaxeSteel);
    tipPoint.position.set(0, 0.94, 0.32);
    tipPoint.rotation.x = Math.PI / 2;
    pick.add(tipPoint);

    // Chisel blade edge on other end
    const chisel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.12), mats.pickaxeSteel);
    chisel.position.set(0, 0.94, -0.3);
    pick.add(chisel);

    return pick;
  }

  // Pickaxe 1: Leaning against the left timber post
  const pick1 = createPickaxe();
  pick1.position.set(-1.3, 0.05, 1.6);
  pick1.rotation.set(0.2, 0.4, 0.28);
  props.add(pick1);

  // Pickaxe 2: Leaning against the ore crate
  const pick2 = createPickaxe();
  pick2.position.set(1.4, 0.05, 2.3);
  pick2.rotation.set(-0.3, -0.6, -0.32);
  props.add(pick2);

  // ---------------------------------------------------------------------------
  // C. Stenciled Wooden Ore Crates Filled with Gold Nuggets
  // ---------------------------------------------------------------------------
  function createOreCrate(w = 0.8, h = 0.55, d = 0.75) {
    const crate = new THREE.Group();
    crate.name = 'OreCrate';

    // Crate body
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const body = new THREE.Mesh(bodyGeo, mats.oreCrate);
    body.position.y = h * 0.5;
    crate.add(body);

    // Gold ore filling the crate
    const crateMound = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.15, d * 0.85), mats.goldOre);
    crateMound.position.y = h + 0.04;
    crate.add(crateMound);

    // Scattered gold nuggets in the crate
    for (let i = 0; i < 5; i++) {
      const nug = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.08, 0),
        mats.goldOreBright
      );
      nug.position.set(
        (Math.random() - 0.5) * (w * 0.7),
        h + 0.1 + Math.random() * 0.06,
        (Math.random() - 0.5) * (d * 0.7)
      );
      nug.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      crate.add(nug);
    }

    return crate;
  }

  // Crate 1: Sitting near the right side of the tracks
  const crate1 = createOreCrate(0.85, 0.55, 0.75);
  crate1.position.set(1.75, 0, 1.95);
  crate1.rotation.y = -0.22;
  props.add(crate1);

  // Crate 2: Second smaller crate stacked or placed nearby
  const crate2 = createOreCrate(0.7, 0.48, 0.65);
  crate2.position.set(2.25, 0, 1.15);
  crate2.rotation.y = 0.35;
  props.add(crate2);

  // ---------------------------------------------------------------------------
  // D. Water / Black Powder Supply Barrel
  // ---------------------------------------------------------------------------
  const barrel = new THREE.Group();
  barrel.name = 'SupplyBarrel';

  const barrelStaves = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.85, 12),
    mats.timberDark
  );
  barrelStaves.position.y = 0.425;
  barrel.add(barrelStaves);

  // Iron barrel hoops
  const hoopGeo = new THREE.CylinderGeometry(0.375, 0.375, 0.06, 12);
  [-0.24, -0.08, 0.08, 0.24].forEach(hy => {
    const hoop = new THREE.Mesh(hoopGeo, mats.ironHardware);
    hoop.position.y = 0.425 + hy;
    barrel.add(hoop);
  });

  barrel.position.set(-1.95, 0, 1.9);
  props.add(barrel);

  // ---------------------------------------------------------------------------
  // E. Mining Shovel Leaning Against Barrel
  // ---------------------------------------------------------------------------
  const shovel = new THREE.Group();
  shovel.name = 'MiningShovel';

  const shovelHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 1.05, 6),
    mats.pickaxeWood
  );
  shovelHandle.position.y = 0.525;
  shovel.add(shovelHandle);

  const shovelGripT = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), mats.pickaxeWood);
  shovelGripT.position.y = 1.04;
  shovel.add(shovelGripT);

  const bladeGeo = new THREE.BoxGeometry(0.24, 0.32, 0.04);
  const blade = new THREE.Mesh(bladeGeo, mats.pickaxeSteel);
  blade.position.y = 0.14;
  shovel.add(blade);

  shovel.position.set(-1.72, 0.02, 2.25);
  shovel.rotation.set(-0.35, 0.2, 0.25);
  props.add(shovel);

  // ---------------------------------------------------------------------------
  // F. Spilled Raw Gold Nuggets & Ore Chunks on the Ground
  // ---------------------------------------------------------------------------
  const groundNuggets = [
    { x: -0.65, y: 0.08, z: 2.1, s: 0.16, bright: true },
    { x: -0.85, y: 0.07, z: 2.4, s: 0.14, bright: true },
    { x: -0.5, y: 0.09, z: 2.7, s: 0.18, bright: false },
    { x: 0.72, y: 0.08, z: 2.1, s: 0.15, bright: true },
    { x: 0.95, y: 0.07, z: 2.5, s: 0.17, bright: true },
    { x: 0.6, y: 0.08, z: 3.1, s: 0.15, bright: true },
    { x: 1.25, y: 0.09, z: 1.6, s: 0.18, bright: false },
    { x: -0.2, y: 0.06, z: 3.4, s: 0.12, bright: true },
    { x: 0.25, y: 0.07, z: 3.5, s: 0.14, bright: true },
    { x: 1.45, y: 0.08, z: 2.7, s: 0.16, bright: true }
  ];

  groundNuggets.forEach((gn, idx) => {
    const geo = new THREE.DodecahedronGeometry(gn.s, 0);
    const mat = gn.bright ? mats.goldOreBright : mats.goldOre;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(gn.x, gn.y, gn.z);
    mesh.rotation.set(idx * 0.4, idx * 0.7, idx * 0.3);
    props.add(mesh);
  });

  return props;
}
