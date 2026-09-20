import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { getWatchtowerMaterials } from './watchtowerTextures.js';

/**
 * Creates the Next-Gen Stylized Low-Poly Watchtower (Torre de Vigia)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Architectural Features:
 * 1. Heavy Stepped Stone Foundation with 45-degree corner buttress spurs and reinforced arched doorway.
 * 2. Tapering 8-sided Ashlar Stone Shaft with recessed arrow slits / embrasures on cardinal faces.
 * 3. Stepped Stone Machicolation Corbels supporting an elevated timber superstructure.
 * 4. Massive Cantilevered Timber Framing with heavy diagonal knee braces, iron gusset plates, and lag bolts.
 * 5. Overhanging 8-Sided Crow's Nest Gallery:
 *    - Weathered oak deck planks with exposed cantilever floor joists.
 *    - Notched timber parapet breastwork / crenellations for archer protection.
 *    - 4 Royal heraldic heater defense shields mounted outward on alternating parapet faces.
 *    - Interior archer amenities: ammunition arrow crate, supply barrel, and fletched arrows.
 * 6. Conical Peaked Royal Blue Shingled Roof:
 *    - Flared overhang shielding the gallery with exposed rafter tails.
 *    - Layered scalloped blue shingles with hand-painted highlights and ornate golden frieze eave rim.
 *    - Sculpted golden finial with turned base, golden sphere, and towering spire needle.
 * 7. Fluttering Royal Heraldic Ribbon Pennant:
 *    - Billowing double-tailed streamer with golden rampant lion coat of arms and embroidered borders.
 * 8. Forged Iron Brazier & Glowing Fire Embers:
 *    - Cantilevered wrought iron cage brazier hanging from the upper gallery.
 *    - Blazing volcanic embers with incandescent magma cracks and intense fiery emissive glow.
 * 9. Heavy Wooden Access Ladder:
 *    - Sturdy timber side rails and notched rungs running up the rear wall from foundation to gallery.
 *
 * Proportions:
 * - Base Footprint: ~4.0 x 4.0 units (fits RTS 4x4 tile grid, aligns with collision radius 2.0).
 * - Archer Platform / Crow's Nest: y = 5.8 to 6.8 (matches Building.js arrow firing origin at y = 6.8).
 * - Total Height: ~9.8 units to top of pennant staff (strong, visible silhouette in isometric RTS camera).
 *
 * @returns {THREE.Group}
 */
export function createWatchtower() {
  const tower = new THREE.Group();
  tower.name = 'Watchtower';

  const mats = getWatchtowerMaterials();

  /* ========================================================================
     1. SOLID STONE FOUNDATION & BUTTRESSES (y: 0.0 to ~1.0)
     ======================================================================== */
  const foundationGroup = new THREE.Group();
  foundationGroup.name = 'Foundation';

  // Ground Plinth (Bottom slab directly on terrain)
  const plinthGeo = new THREE.BoxGeometry(4.1, 0.35, 4.1);
  const plinth = new THREE.Mesh(plinthGeo, mats.stoneFoundation);
  plinth.position.y = 0.175;
  foundationGroup.add(plinth);

  // Stepped Podium Tier
  const podiumGeo = new THREE.BoxGeometry(3.55, 0.4, 3.55);
  const podium = new THREE.Mesh(podiumGeo, mats.stoneFoundation);
  podium.position.y = 0.55;
  foundationGroup.add(podium);

  // Decorative Stone Belt Course / Cornice Lip
  const corniceGeo = new THREE.BoxGeometry(3.7, 0.14, 3.7);
  const cornice = new THREE.Mesh(corniceGeo, mats.stone);
  cornice.position.y = 0.82;
  foundationGroup.add(cornice);

  // 4 Angled Corner Buttress Spurs (flared outwards at 45 degrees)
  const buttressGeo = new THREE.BoxGeometry(0.7, 0.7, 0.9);
  const buttressOffsets = [
    { x: -1.72, z: -1.72, rot: Math.PI * 0.25 },
    { x: 1.72, z: -1.72, rot: -Math.PI * 0.25 },
    { x: -1.72, z: 1.72, rot: Math.PI * 0.75 },
    { x: 1.72, z: 1.72, rot: -Math.PI * 0.75 }
  ];

  buttressOffsets.forEach(b => {
    const buttress = new THREE.Mesh(buttressGeo, mats.stoneFoundation);
    buttress.position.set(b.x, 0.45, b.z);
    buttress.rotation.y = b.rot;
    buttress.rotation.x = 0.22; // Inward batter slope
    foundationGroup.add(buttress);

    // Buttress beveled footing cap
    const capGeo = new THREE.BoxGeometry(0.74, 0.12, 0.55);
    const cap = new THREE.Mesh(capGeo, mats.stone);
    cap.position.set(b.x * 0.92, 0.82, b.z * 0.92);
    cap.rotation.y = b.rot;
    foundationGroup.add(cap);
  });

  // Reinforced Arched Entryway (Front facade, z > 0)
  const doorGroup = new THREE.Group();
  doorGroup.name = 'Doorway';

  // Stone portal arch frame surround
  const portalFrameGeo = new THREE.BoxGeometry(1.2, 1.15, 0.22);
  const portalFrame = new THREE.Mesh(portalFrameGeo, mats.stone);
  portalFrame.position.set(0, 0.65, 1.84);
  doorGroup.add(portalFrame);

  // Portal arch lintel voussoir
  const archLintelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.24, 8, 1, false, 0, Math.PI);
  const archLintel = new THREE.Mesh(archLintelGeo, mats.stone);
  archLintel.position.set(0, 1.22, 1.84);
  archLintel.rotation.z = Math.PI;
  doorGroup.add(archLintel);

  // Heavy recessed oak plank door
  const doorPlankGeo = new THREE.BoxGeometry(0.82, 0.95, 0.12);
  const doorPlank = new THREE.Mesh(doorPlankGeo, mats.darkOak);
  doorPlank.position.set(0, 0.6, 1.88);
  doorGroup.add(doorPlank);

  // Arched upper door panel
  const doorArchGeo = new THREE.CylinderGeometry(0.41, 0.41, 0.12, 8, 1, false, 0, Math.PI);
  const doorArch = new THREE.Mesh(doorArchGeo, mats.darkOak);
  doorArch.position.set(0, 1.07, 1.88);
  doorArch.rotation.z = Math.PI;
  doorGroup.add(doorArch);

  // Forged iron door strap hinges
  [-0.22, 0.18].forEach(hy => {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.16), mats.ironSteel);
    hinge.position.set(0, 0.6 + hy, 1.89);
    doorGroup.add(hinge);

    // Hinge rivets
    [-0.28, 0.28].forEach(rx => {
      const riv = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 6), mats.ironSteel);
      riv.rotation.x = Math.PI / 2;
      riv.position.set(rx, 0.6 + hy, 1.97);
      doorGroup.add(riv);
    });
  });

  // Iron door knocker ring
  const knocker = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12), mats.ironSteel);
  knocker.position.set(0.18, 0.68, 1.95);
  doorGroup.add(knocker);

  // Stone threshold doorstep
  const stepGeo = new THREE.BoxGeometry(1.1, 0.15, 0.35);
  const step = new THREE.Mesh(stepGeo, mats.stoneFoundation);
  step.position.set(0, 0.1, 2.05);
  doorGroup.add(step);

  foundationGroup.add(doorGroup);
  tower.add(foundationGroup);

  /* ========================================================================
     2. OCTAGONAL ASHLAR STONE SHAFT & ARROW SLITS (y: 0.85 to ~4.5)
     ======================================================================== */
  const shaftGroup = new THREE.Group();
  shaftGroup.name = 'StoneShaft';

  // 8-sided tapered stone tower shaft
  // radiusTop: 1.30, radiusBottom: 1.52, height: 3.55, 8 segments
  const shaftGeo = new THREE.CylinderGeometry(1.30, 1.52, 3.55, 8);
  const shaft = new THREE.Mesh(shaftGeo, mats.stone);
  shaft.position.y = 0.85 + 3.55 / 2; // y = 2.625
  shaftGroup.add(shaft);

  // Mid-shaft decorative stone belt molding ring
  const shaftRingGeo = new THREE.CylinderGeometry(1.42, 1.45, 0.18, 8);
  const shaftRing = new THREE.Mesh(shaftRingGeo, mats.stone);
  shaftRing.position.y = 2.35;
  shaftGroup.add(shaftRing);

  // 4 Recessed 3D Arrow Slits / Loopholes at cardinal faces (N, S, E, W)
  const slitAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  slitAngles.forEach(angle => {
    // We place arrow slits on East, West, South, and North (omitting door overlap)
    if (Math.abs(angle - Math.PI * 0.5) > 0.1) {
      const slitDist = 1.38;
      const sx = Math.sin(angle) * slitDist;
      const sz = Math.cos(angle) * slitDist;

      const slitEmbrasure = new THREE.Group();
      slitEmbrasure.position.set(sx, 2.9, sz);
      slitEmbrasure.rotation.y = angle;

      // Stone chamfer frame
      const frameGeo = new THREE.BoxGeometry(0.44, 0.95, 0.14);
      const frame = new THREE.Mesh(frameGeo, mats.stone);
      slitEmbrasure.add(frame);

      // Deep dark aperture interior
      const slotGeo = new THREE.BoxGeometry(0.12, 0.75, 0.18);
      const slot = new THREE.Mesh(slotGeo, mats.darkOak);
      slot.position.z = 0.02;
      slitEmbrasure.add(slot);

      // Iron crossbar
      const barGeo = new THREE.BoxGeometry(0.32, 0.04, 0.19);
      const bar = new THREE.Mesh(barGeo, mats.ironSteel);
      bar.position.z = 0.02;
      slitEmbrasure.add(bar);

      shaftGroup.add(slitEmbrasure);
    }
  });

  // Top Machicolation / Stone Corbel Cornice (Transition to timber upper deck)
  // Stepped stone capital ring
  const collarGeo = new THREE.CylinderGeometry(1.58, 1.34, 0.42, 8);
  const collar = new THREE.Mesh(collarGeo, mats.stone);
  collar.position.y = 4.45;
  shaftGroup.add(collar);

  // 8 Stepped Stone Corbels under each facet corner
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    const cx = Math.sin(angle) * 1.48;
    const cz = Math.cos(angle) * 1.48;

    const corbelGeo = new THREE.BoxGeometry(0.24, 0.48, 0.42);
    const corbel = new THREE.Mesh(corbelGeo, mats.stone);
    corbel.position.set(cx, 4.35, cz);
    corbel.rotation.y = angle;
    shaftGroup.add(corbel);
  }

  tower.add(shaftGroup);

  /* ========================================================================
     3. ELEVATED TIMBER SUPERSTRUCTURE & KNEE BRACES (y: 4.4 to ~5.7)
     ======================================================================== */
  const timberFrameGroup = new THREE.Group();
  timberFrameGroup.name = 'TimberFraming';

  // Octagonal base timber sill plate collar
  const sillGeo = new THREE.CylinderGeometry(1.68, 1.68, 0.18, 8);
  const sill = new THREE.Mesh(sillGeo, mats.timber);
  sill.position.y = 4.72;
  timberFrameGroup.add(sill);

  // 8 Heavy Main Vertical Timber Posts
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const px = Math.sin(angle) * 1.55;
    const pz = Math.cos(angle) * 1.55;

    const postGeo = new THREE.BoxGeometry(0.22, 1.05, 0.22);
    const post = new THREE.Mesh(postGeo, mats.timber);
    post.position.set(px, 5.25, pz);
    post.rotation.y = angle;
    timberFrameGroup.add(post);

    // Iron gusset straps & bolt plates on post bases
    const ironGusset = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.26), mats.ironSteel);
    ironGusset.position.set(px, 4.82, pz);
    timberFrameGroup.add(ironGusset);
  }

  // 8 Heavy Angled Timber Knee Braces (Cantilever struts supporting crow's nest overhang)
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    const midR = 1.72;
    const kx = Math.sin(angle) * midR;
    const kz = Math.cos(angle) * midR;

    const strutGeo = new THREE.BoxGeometry(0.18, 0.95, 0.18);
    const strut = new THREE.Mesh(strutGeo, mats.timber);
    strut.position.set(kx, 5.18, kz);
    strut.rotation.y = angle;
    // Angle strut outwards towards perimeter
    strut.rotation.x = 0.46;
    timberFrameGroup.add(strut);

    // Iron reinforcement band on strut
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), mats.ironSteel);
    strap.position.set(kx, 5.18, kz);
    strap.rotation.y = angle;
    strap.rotation.x = 0.46;
    timberFrameGroup.add(strap);
  }

  // Horizontal timber girts / cross-tie beams between vertical posts
  for (let i = 0; i < 8; i++) {
    // Leave rear bay open for access ladder
    if (i !== 4) {
      const a1 = (i * Math.PI) / 4;
      const a2 = ((i + 1) * Math.PI) / 4;
      const x1 = Math.sin(a1) * 1.55;
      const z1 = Math.cos(a1) * 1.55;
      const x2 = Math.sin(a2) * 1.55;
      const z2 = Math.cos(a2) * 1.55;

      const midX = (x1 + x2) / 2;
      const midZ = (z1 + z2) / 2;
      const beamLen = Math.hypot(x2 - x1, z2 - z1);
      const beamAngle = Math.atan2(x2 - x1, z2 - z1);

      const girt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, beamLen), mats.timber);
      girt.position.set(midX, 5.25, midZ);
      girt.rotation.y = beamAngle;
      timberFrameGroup.add(girt);

      // Diagonal X-shear brace
      const diagBrace1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, beamLen * 1.15), mats.timber);
      diagBrace1.position.set(midX, 5.25, midZ);
      diagBrace1.rotation.y = beamAngle;
      diagBrace1.rotation.x = 0.38;
      timberFrameGroup.add(diagBrace1);
    }
  }

  tower.add(timberFrameGroup);

  /* ========================================================================
     4. OVERHANGING CROW'S NEST GALLERY (y: 5.6 to ~6.8)
     Planked floor deck, radiating floor joists, notched parapet & defense shields
     ======================================================================== */
  const galleryGroup = new THREE.Group();
  galleryGroup.name = 'CrowsNestGallery';

  // Radiating Cantilever Floor Joists underneath deck
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 4;
    const joistGeo = new THREE.BoxGeometry(0.24, 0.22, 4.25);
    const joist = new THREE.Mesh(joistGeo, mats.timber);
    joist.position.y = 5.68;
    joist.rotation.y = angle;
    galleryGroup.add(joist);

    // Beveled iron end caps on joist tips
    [-2.12, 2.12].forEach(jz => {
      const tipGeo = new THREE.BoxGeometry(0.26, 0.24, 0.08);
      const tip = new THREE.Mesh(tipGeo, mats.ironSteel);
      tip.position.set(
        Math.sin(angle + Math.PI / 2) * 0 + Math.sin(angle) * jz,
        5.68,
        Math.cos(angle + Math.PI / 2) * 0 + Math.cos(angle) * jz
      );
      tip.rotation.y = angle;
      galleryGroup.add(tip);
    });
  }

  // Octagonal Weathered Timber Deck
  // Radius: 2.12, Thickness: 0.18, centered at y = 5.82
  const deckGeo = new THREE.CylinderGeometry(2.12, 2.12, 0.18, 8);
  const deck = new THREE.Mesh(deckGeo, mats.timberDeck);
  deck.position.y = 5.82;
  galleryGroup.add(deck);

  // Deck perimeter fascia curb rim
  const curbGeo = new THREE.CylinderGeometry(2.18, 2.18, 0.08, 8);
  const curb = new THREE.Mesh(curbGeo, mats.timber);
  curb.position.y = 5.92;
  galleryGroup.add(curb);

  // Notched Parapet Breastwork / Archer Battlements (8 facets around perimeter)
  // Height from y = 5.92 to y = 6.75
  const parapetHeight = 0.82;
  const parapetRadius = 2.05;

  for (let i = 0; i < 8; i++) {
    const a1 = (i * Math.PI) / 4 - Math.PI / 8;
    const a2 = ((i + 1) * Math.PI) / 4 - Math.PI / 8;
    const x1 = Math.sin(a1) * parapetRadius;
    const z1 = Math.cos(a1) * parapetRadius;
    const x2 = Math.sin(a2) * parapetRadius;
    const z2 = Math.cos(a2) * parapetRadius;

    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const segLen = Math.hypot(x2 - x1, z2 - z1);
    const wallAngle = Math.atan2(x2 - x1, z2 - z1);

    const facetGroup = new THREE.Group();
    facetGroup.position.set(midX, 5.92, midZ);
    facetGroup.rotation.y = wallAngle;

    // Solid lower breastwork plank wall (up to waist height)
    const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, segLen), mats.timber);
    lowerWall.position.y = 0.26;
    facetGroup.add(lowerWall);

    // Upper merlons (left and right battlement teeth leaving center arrow notch)
    const merlonW = segLen * 0.32;
    const merlonH = 0.30;
    const merlonL = new THREE.Mesh(new THREE.BoxGeometry(0.15, merlonH, merlonW), mats.timber);
    merlonL.position.set(0, 0.52 + merlonH / 2, -segLen * 0.34);
    facetGroup.add(merlonL);

    const merlonR = new THREE.Mesh(new THREE.BoxGeometry(0.15, merlonH, merlonW), mats.timber);
    merlonR.position.set(0, 0.52 + merlonH / 2, segLen * 0.34);
    facetGroup.add(merlonR);

    // Top coping rail caps on merlons
    [-segLen * 0.34, segLen * 0.34].forEach(mz => {
      const capGeo = new THREE.BoxGeometry(0.19, 0.06, merlonW + 0.04);
      const cap = new THREE.Mesh(capGeo, mats.darkOak);
      cap.position.set(0, 0.52 + merlonH + 0.03, mz);
      facetGroup.add(cap);
    });

    // Arrow embrasure notch sill in the middle
    const sillNotch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, segLen * 0.36), mats.darkOak);
    sillNotch.position.set(0, 0.52, 0);
    facetGroup.add(sillNotch);

    galleryGroup.add(facetGroup);

    // 8 Corner Posts with pyramid chamfered caps
    const cornerPost = new THREE.Mesh(new THREE.BoxGeometry(0.20, parapetHeight + 0.12, 0.20), mats.timber);
    cornerPost.position.set(x1, 5.92 + (parapetHeight + 0.12) / 2, z1);
    galleryGroup.add(cornerPost);

    // Corner post gold / iron pyramid finial
    const postCapGeo = new THREE.ConeGeometry(0.14, 0.12, 4);
    const postCap = new THREE.Mesh(postCapGeo, mats.ironSteel);
    postCap.position.set(x1, 5.92 + parapetHeight + 0.16, z1);
    postCap.rotation.y = Math.PI / 4;
    galleryGroup.add(postCap);
  }

  // 4 Royal Heraldic Parapet Shields (Mounted outward on alternating breastwork faces)
  [0, 2, 4, 6].forEach(idx => {
    const angle = (idx * Math.PI) / 4;
    const sx = Math.sin(angle) * 2.14;
    const sz = Math.cos(angle) * 2.14;

    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(sx, 6.32, sz);
    shieldGroup.rotation.y = angle;

    // Heater shield body
    const shieldGeo = new THREE.BoxGeometry(0.06, 0.62, 0.52);
    const shield = new THREE.Mesh(shieldGeo, mats.shield);
    shieldGroup.add(shield);

    // Shield mounting iron bracket
    const mountGeo = new THREE.BoxGeometry(0.14, 0.08, 0.08);
    const mount = new THREE.Mesh(mountGeo, mats.ironSteel);
    mount.position.x = -0.07;
    shieldGroup.add(mount);

    galleryGroup.add(shieldGroup);
  });

  // Interior Archer Deck Amenities:
  // 1. Ammunition Supply Arrow Crate
  const crateGeo = new THREE.BoxGeometry(0.48, 0.38, 0.48);
  const crate = new THREE.Mesh(crateGeo, mats.timber);
  crate.position.set(0.85, 6.08, -0.75);
  crate.rotation.y = 0.35;
  galleryGroup.add(crate);

  // Crate iron corner brackets
  const crateIron = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 0.50), mats.ironSteel);
  crateIron.position.set(0.85, 6.08, -0.75);
  crateIron.rotation.y = 0.35;
  galleryGroup.add(crateIron);

  // 2. Oak Water / Arrow Barrel
  const barrelGeo = new THREE.CylinderGeometry(0.24, 0.22, 0.55, 8);
  const barrel = new THREE.Mesh(barrelGeo, mats.darkOak);
  barrel.position.set(-0.85, 6.16, -0.75);
  galleryGroup.add(barrel);

  // Barrel iron hoops
  [-0.18, 0.18].forEach(by => {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8), mats.ironSteel);
    hoop.position.set(-0.85, 6.16 + by, -0.75);
    galleryGroup.add(hoop);
  });

  // Quiver with fletched arrows resting inside barrel
  for (let a = 0; a < 5; a++) {
    const fAngle = a * 1.2;
    const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.65, 5), mats.timber);
    arrowShaft.position.set(
      -0.85 + Math.sin(fAngle) * 0.1,
      6.52,
      -0.75 + Math.cos(fAngle) * 0.1
    );
    arrowShaft.rotation.x = 0.2 + a * 0.05;
    arrowShaft.rotation.z = -0.15;
    galleryGroup.add(arrowShaft);

    // Arrow fletching vanes (white/gold feathers)
    const vaneGeo = new THREE.BoxGeometry(0.06, 0.12, 0.02);
    const vane = new THREE.Mesh(vaneGeo, mats.goldFinial);
    vane.position.set(
      -0.85 + Math.sin(fAngle) * 0.1,
      6.82,
      -0.75 + Math.cos(fAngle) * 0.1
    );
    vane.rotation.y = fAngle;
    galleryGroup.add(vane);
  }

  // 3. Trapdoor frame at ladder entrance (rear)
  const trapGeo = new THREE.BoxGeometry(0.55, 0.04, 0.55);
  const trap = new THREE.Mesh(trapGeo, mats.darkOak);
  trap.position.set(0, 5.92, -1.35);
  galleryGroup.add(trap);

  // Trapdoor iron pull ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 10), mats.ironSteel);
  ring.position.set(0.12, 5.95, -1.35);
  ring.rotation.x = Math.PI / 2;
  galleryGroup.add(ring);

  tower.add(galleryGroup);

  /* ========================================================================
     5. ROOF SUPPORT COLUMNS & CONICAL BLUE SHINGLED ROOF (y: 5.9 to ~9.4)
     ======================================================================== */
  const roofGroup = new THREE.Group();
  roofGroup.name = 'ConicalRoof';

  // 6 Sturdy Carved Roof Support Timber Columns (leaving wide open viewing arches)
  const numRoofCols = 6;
  for (let i = 0; i < numRoofCols; i++) {
    const angle = (i * Math.PI * 2) / numRoofCols;
    const cx = Math.sin(angle) * 1.80;
    const cz = Math.cos(angle) * 1.80;

    const colGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.25, 6);
    const col = new THREE.Mesh(colGeo, mats.timber);
    col.position.set(cx, 6.45, cz);
    roofGroup.add(col);

    // Top timber capital bracket / brace
    const capBracket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.24), mats.timber);
    capBracket.position.set(cx, 7.02, cz);
    roofGroup.add(capBracket);
  }

  // Under-eave Fascia Beam Ring (Octagonal ring under roof overhang)
  const eaveBeamGeo = new THREE.CylinderGeometry(2.38, 2.38, 0.14, 8);
  const eaveBeam = new THREE.Mesh(eaveBeamGeo, mats.timber);
  eaveBeam.position.y = 7.08;
  roofGroup.add(eaveBeam);

  // Exposed Rafter Tails protruding under eave
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    const rx = Math.sin(angle) * 2.32;
    const rz = Math.cos(angle) * 2.32;

    const rafterGeo = new THREE.BoxGeometry(0.10, 0.12, 0.32);
    const rafter = new THREE.Mesh(rafterGeo, mats.darkOak);
    rafter.position.set(rx, 7.02, rz);
    rafter.rotation.y = angle;
    roofGroup.add(rafter);
  }

  // Conical Peaked Roof (8-sided Cone Geometry)
  // Base radius: 2.38, Height: 2.15, 8 radial segments
  // Base sits at y = 7.10, Apex reaches y = 9.25
  const coneGeo = new THREE.ConeGeometry(2.38, 2.15, 8);
  const coneMesh = new THREE.Mesh(coneGeo, mats.roof);
  coneMesh.position.y = 7.10 + 2.15 / 2; // y = 8.175
  roofGroup.add(coneMesh);

  // Eave Drip Edge Trim Ring (Bottom lip)
  const eaveLipGeo = new THREE.CylinderGeometry(2.42, 2.42, 0.08, 8);
  const eaveLip = new THREE.Mesh(eaveLipGeo, mats.roof);
  eaveLip.position.y = 7.12;
  roofGroup.add(eaveLip);

  // Sculpted Golden Finial Spire at Apex (y: 9.15 to ~9.65)
  const finialGroup = new THREE.Group();
  finialGroup.name = 'GoldenFinial';
  finialGroup.position.y = 9.22;

  // Flared gold base collar
  const fCollarGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.16, 8);
  const fCollar = new THREE.Mesh(fCollarGeo, mats.goldFinial);
  fCollar.position.y = 0.08;
  finialGroup.add(fCollar);

  // Golden spherical orb
  const fSphereGeo = new THREE.SphereGeometry(0.18, 8, 8);
  const fSphere = new THREE.Mesh(fSphereGeo, mats.goldFinial);
  fSphere.position.y = 0.28;
  finialGroup.add(fSphere);

  // Golden turned neck ring
  const fRingGeo = new THREE.TorusGeometry(0.12, 0.04, 6, 8);
  const fRing = new THREE.Mesh(fRingGeo, mats.goldFinial);
  fRing.position.y = 0.42;
  fRing.rotation.x = Math.PI / 2;
  finialGroup.add(fRing);

  // Tapering sharp golden spire needle / finial tip
  const fSpireGeo = new THREE.ConeGeometry(0.09, 0.45, 8);
  const fSpire = new THREE.Mesh(fSpireGeo, mats.goldFinial);
  fSpire.position.y = 0.65;
  finialGroup.add(fSpire);

  roofGroup.add(finialGroup);
  tower.add(roofGroup);

  /* ========================================================================
     6. FLUTTERING ROYAL HERALDIC RIBBON PENNANT (y: ~9.2 to ~10.0)
     ======================================================================== */
  const pennantGroup = new THREE.Group();
  pennantGroup.name = 'RoyalPennant';

  // Forged iron pennant staff extending from spire apex
  const staffGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.15, 6);
  const staff = new THREE.Mesh(staffGeo, mats.ironSteel);
  staff.position.set(0, 9.75, 0);
  pennantGroup.add(staff);

  // Small golden spearhead finial on staff tip
  const spearGeo = new THREE.ConeGeometry(0.06, 0.16, 6);
  const spear = new THREE.Mesh(spearGeo, mats.goldFinial);
  spear.position.set(0, 10.35, 0);
  pennantGroup.add(spear);

  // Fluttering Streamer / Pennant Ribbon Geometry
  // Curved segmented ribbon fluttering towards (+X, +Z)
  const ribbonGroup = new THREE.Group();
  ribbonGroup.position.set(0, 9.95, 0);

  // Segment 1 (Near hoist, blowing out at an angle)
  const seg1Geo = new THREE.PlaneGeometry(0.55, 0.38, 1, 1);
  const seg1 = new THREE.Mesh(seg1Geo, mats.pennant);
  seg1.position.set(0.28, 0, 0.04);
  seg1.rotation.y = 0.22;
  ribbonGroup.add(seg1);

  // Segment 2 (Mid-flight wave trough)
  const seg2Geo = new THREE.PlaneGeometry(0.55, 0.34, 1, 1);
  const seg2 = new THREE.Mesh(seg2Geo, mats.pennant);
  seg2.position.set(0.78, 0.02, 0.18);
  seg2.rotation.y = -0.32;
  ribbonGroup.add(seg2);

  // Segment 3 (Tail wave crest)
  const seg3Geo = new THREE.PlaneGeometry(0.55, 0.30, 1, 1);
  const seg3 = new THREE.Mesh(seg3Geo, mats.pennant);
  seg3.position.set(1.26, -0.02, 0.06);
  seg3.rotation.y = 0.38;
  ribbonGroup.add(seg3);

  // Segment 4 (Swallowtail trailing tips)
  const seg4Geo = new THREE.PlaneGeometry(0.42, 0.26, 1, 1);
  const seg4 = new THREE.Mesh(seg4Geo, mats.pennant);
  seg4.position.set(1.68, -0.05, 0.22);
  seg4.rotation.y = -0.25;
  ribbonGroup.add(seg4);

  pennantGroup.add(ribbonGroup);
  tower.add(pennantGroup);

  /* ========================================================================
     7. FORGED IRON BRAZIER & GLOWING FIRE EMBERS (Upper Deck Signal Fire)
     ======================================================================== */
  const brazierGroup = new THREE.Group();
  brazierGroup.name = 'SignalBrazier';

  // Cantilever iron crane arm projecting out from front-right gallery post
  // Anchor at x = 1.60, z = 1.15, y = 6.45
  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), mats.ironSteel);
  craneBase.position.set(1.60, 6.45, 1.15);
  brazierGroup.add(craneBase);

  // Horizontal cantilever boom projecting out past parapet
  const boomGeo = new THREE.BoxGeometry(0.65, 0.08, 0.08);
  const boom = new THREE.Mesh(boomGeo, mats.ironSteel);
  boom.position.set(1.92, 6.55, 1.25);
  boom.rotation.y = 0.32;
  brazierGroup.add(boom);

  // Diagonal support strut under crane arm
  const armStrutGeo = new THREE.BoxGeometry(0.48, 0.06, 0.06);
  const armStrut = new THREE.Mesh(armStrutGeo, mats.ironSteel);
  armStrut.position.set(1.82, 6.36, 1.20);
  armStrut.rotation.y = 0.32;
  armStrut.rotation.z = -0.65;
  brazierGroup.add(armStrut);

  // Suspension chain ring & links hanging down
  const chainRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 8), mats.ironSteel);
  chainRing.position.set(2.20, 6.50, 1.34);
  brazierGroup.add(chainRing);

  // Brazier Assembly (Basket hanging at x = 2.20, y = 6.22, z = 1.34)
  const basketGroup = new THREE.Group();
  basketGroup.position.set(2.20, 6.22, 1.34);

  // Wrought iron bottom bowl
  const bowlGeo = new THREE.CylinderGeometry(0.32, 0.22, 0.16, 8);
  const bowl = new THREE.Mesh(bowlGeo, mats.brazier);
  basketGroup.add(bowl);

  // Flared top rim hoop
  const rimGeo = new THREE.TorusGeometry(0.33, 0.03, 6, 8);
  const bRim = new THREE.Mesh(rimGeo, mats.brazier);
  bRim.position.y = 0.14;
  bRim.rotation.x = Math.PI / 2;
  basketGroup.add(bRim);

  // 8 Vertical forged iron cage ribs
  for (let r = 0; r < 8; r++) {
    const angle = (r * Math.PI) / 4;
    const rx = Math.sin(angle) * 0.31;
    const rz = Math.cos(angle) * 0.31;

    const ribGeo = new THREE.BoxGeometry(0.04, 0.24, 0.04);
    const rib = new THREE.Mesh(ribGeo, mats.brazier);
    rib.position.set(rx, 0.08, rz);
    rib.rotation.y = angle;
    basketGroup.add(rib);

    // Decorative curled top finial prong
    const prongGeo = new THREE.ConeGeometry(0.03, 0.08, 4);
    const prong = new THREE.Mesh(prongGeo, mats.brazier);
    prong.position.set(rx, 0.24, rz);
    basketGroup.add(prong);
  }

  // Glowing Fire Embers Core (Incandescent burning coals)
  const embersGeo = new THREE.CylinderGeometry(0.28, 0.20, 0.14, 8);
  const embersMesh = new THREE.Mesh(embersGeo, mats.embers);
  embersMesh.position.y = 0.08;
  basketGroup.add(embersMesh);

  // Faceted burning coal chunks protruding from top
  const coalPositions = [
    { x: 0, y: 0.16, z: 0, s: 0.12 },
    { x: -0.10, y: 0.14, z: 0.08, s: 0.09 },
    { x: 0.11, y: 0.15, z: -0.06, s: 0.08 },
    { x: 0.07, y: 0.14, z: 0.10, s: 0.07 },
    { x: -0.08, y: 0.13, z: -0.09, s: 0.08 }
  ];

  coalPositions.forEach(c => {
    const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(c.s, 0), mats.embers);
    coal.position.set(c.x, c.y, c.z);
    basketGroup.add(coal);
  });

  // Stylized low-poly flame tongues
  const flame1 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), mats.embers);
  flame1.position.set(0.02, 0.25, 0.02);
  basketGroup.add(flame1);

  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), mats.embers);
  flame2.position.set(-0.08, 0.21, 0.05);
  flame2.rotation.z = -0.2;
  basketGroup.add(flame2);

  const flame3 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 4), mats.embers);
  flame3.position.set(0.07, 0.20, -0.05);
  flame3.rotation.z = 0.25;
  basketGroup.add(flame3);

  brazierGroup.add(basketGroup);
  tower.add(brazierGroup);

  /* ========================================================================
     8. WOODEN ACCESS LADDER (Rear Wall: z = -1.45 to -1.95)
     ======================================================================== */
  const ladderGroup = new THREE.Group();
  ladderGroup.name = 'AccessLadder';

  // Ladder geometry runs from foundation ledge y = 0.85 up to deck y = 5.85
  const ladderBottomY = 0.85;
  const ladderTopY = 5.85;
  const ladderHeight = ladderTopY - ladderBottomY; // 5.0 units
  const ladderMidY = (ladderBottomY + ladderTopY) / 2; // 3.35

  const ladderZ = -1.55;
  const ladderWidth = 0.52;

  // Left & Right Heavy Timber Side Rails
  [-ladderWidth / 2, ladderWidth / 2].forEach(rx => {
    const railGeo = new THREE.BoxGeometry(0.10, ladderHeight + 0.35, 0.12);
    const rail = new THREE.Mesh(railGeo, mats.timber);
    rail.position.set(rx, ladderMidY, ladderZ);
    ladderGroup.add(rail);

    // Top grab horn extensions above deck
    const hornGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.45, 6);
    const horn = new THREE.Mesh(hornGeo, mats.timber);
    horn.position.set(rx, ladderTopY + 0.25, ladderZ);
    ladderGroup.add(horn);
  });

  // 13 Evenly spaced wooden rungs
  const numRungs = 13;
  const rungStep = ladderHeight / (numRungs + 1);
  for (let r = 1; r <= numRungs; r++) {
    const ry = ladderBottomY + r * rungStep;
    const rungGeo = new THREE.CylinderGeometry(0.035, 0.035, ladderWidth - 0.04, 6);
    const rung = new THREE.Mesh(rungGeo, mats.darkOak);
    rung.position.set(0, ry, ladderZ);
    rung.rotation.z = Math.PI / 2;
    ladderGroup.add(rung);
  }

  // Forged Iron Wall Anchor Brackets clamping ladder to stone and timber
  const bracketLevels = [1.2, 2.7, 4.4];
  bracketLevels.forEach(by => {
    const bracketGeo = new THREE.BoxGeometry(ladderWidth + 0.16, 0.06, 0.24);
    const bracket = new THREE.Mesh(bracketGeo, mats.ironSteel);
    bracket.position.set(0, by, ladderZ + 0.06);
    ladderGroup.add(bracket);

    // Anchor wall pins
    [-ladderWidth / 2 - 0.04, ladderWidth / 2 + 0.04].forEach(bx => {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), mats.ironSteel);
      pin.position.set(bx, by, ladderZ + 0.12);
      pin.rotation.x = Math.PI / 2;
      ladderGroup.add(pin);
    });
  });

  tower.add(ladderGroup);

  return enableShadows(tower);
}
