import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getCastleStoneTextures,
  getCastleRoofTextures,
  getCastleTimberTextures,
  getCastleDoorTextures,
  getCastleBannerTextures,
  getCastleShieldTextures
} from './castleTextures.js';

/**
 * Creates the upgraded next-gen AAA stylized Castle / Town Center (Castelo Real)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch / UE5).
 * 
 * Features:
 * - Multi-tiered royal keep citadel with stepped granite foundations and corner buttresses
 * - 4 grand corner turrets with machicolations, arrow slits, and conical royal blue scalloped roofs with gold finials
 * - Sturdy curtain walls with chemin de ronde wooden walkways, corbels, and detailed merlon crenellations
 * - Grand arched gatehouse with heavy wrought-iron banded double doors, sculpted keystone, and portcullis
 * - Decorative royal props: heraldic lion banners, forged iron wall sconces with glowing flames, and battle shields
 * - Multi-tier central citadel (Great Hall, Upper Solar with corner bartizans and royal balcony, and Grand Royal Spire)
 * 
 * @returns {THREE.Group}
 */
export function createCastle() {
  const castle = new THREE.Group();
  castle.name = 'Castle';

  // --- 1. Material Initializations & Helpers ---
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

  // Helper for tiled stone materials with specific UV repeats
  function getTiledStoneMaterial(repeatX = 1, repeatY = 1, bumpScale = 0.06) {
    const base = getCastleStoneTextures();
    const map = base.map.clone();
    map.repeat.set(repeatX, repeatY);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;

    const rMap = base.roughnessMap.clone();
    rMap.repeat.set(repeatX, repeatY);
    rMap.wrapS = THREE.RepeatWrapping;
    rMap.wrapT = THREE.RepeatWrapping;
    rMap.needsUpdate = true;

    const bMap = base.bumpMap.clone();
    bMap.repeat.set(repeatX, repeatY);
    bMap.wrapS = THREE.RepeatWrapping;
    bMap.wrapT = THREE.RepeatWrapping;
    bMap.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rMap,
      metalnessMap: base.metalnessMap,
      bumpMap: bMap,
      bumpScale,
      roughness: 1.0,
      metalness: 0.0
    });
  }

  // Helper for tiled timber materials with specific UV repeats
  function getTiledTimberMaterial(repeatX = 1, repeatY = 1, bumpScale = 0.06) {
    const base = getCastleTimberTextures();
    const map = base.map.clone();
    map.repeat.set(repeatX, repeatY);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;

    const rMap = base.roughnessMap.clone();
    rMap.repeat.set(repeatX, repeatY);
    rMap.wrapS = THREE.RepeatWrapping;
    rMap.wrapT = THREE.RepeatWrapping;
    rMap.needsUpdate = true;

    const bMap = base.bumpMap.clone();
    bMap.repeat.set(repeatX, repeatY);
    bMap.wrapS = THREE.RepeatWrapping;
    bMap.wrapT = THREE.RepeatWrapping;
    bMap.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rMap,
      metalnessMap: base.metalnessMap,
      bumpMap: bMap,
      bumpScale,
      roughness: 1.0,
      metalness: 0.0
    });
  }

  // Base materials
  const stoneMat = createPBRMaterial(getCastleStoneTextures(), { bumpScale: 0.06 });
  const stoneWallMat = getTiledStoneMaterial(3, 1, 0.06);
  const stoneTowerMat = getTiledStoneMaterial(2, 2, 0.06);
  const roofMat = createPBRMaterial(getCastleRoofTextures(), { bumpScale: 0.07 });
  const timberMat = createPBRMaterial(getCastleTimberTextures(), { bumpScale: 0.06 });
  const walkwayMat = getTiledTimberMaterial(4, 1, 0.06);
  const doorMat = createPBRMaterial(getCastleDoorTextures(), { bumpScale: 0.07 });
  const bannerMat = createPBRMaterial(getCastleBannerTextures(), { bumpScale: 0.05, side: THREE.DoubleSide });
  const shieldMat = createPBRMaterial(getCastleShieldTextures(), { bumpScale: 0.06 });

  // Accent & Decorative Materials
  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf5b81a,
    roughness: 0.22,
    metalness: 0.85,
    bumpScale: 0.02
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x242e3d,
    roughness: 0.42,
    metalness: 0.78
  });

  const windowGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xff8c00,
    emissiveIntensity: 0.85,
    roughness: 0.3
  });

  const windowDarkMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.45,
    metalness: 0.2
  });

  const torchFlameMat = new THREE.MeshStandardMaterial({
    color: 0xfff066,
    emissive: 0xff5500,
    emissiveIntensity: 2.2,
    roughness: 0.15
  });

  // =========================================================================
  // 2. FOUNDATIONS & STEPPED PLINTHS (Footprint ~ 11.6 x 11.6)
  // =========================================================================
  // Level 0: Chamfered lower stone footing
  const basePlinth0 = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.35, 11.8), stoneMat);
  basePlinth0.position.set(0, 0.175, 0);
  castle.add(basePlinth0);

  // Level 1: Stepped terrace courtyard
  const basePlinth1 = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.45, 11.0), stoneMat);
  basePlinth1.position.set(0, 0.35 + 0.225, 0);
  castle.add(basePlinth1);

  // 4 Stepped Corner Foundation Buttresses
  const cornerButtressCoords = [
    [-5.2, -5.2, Math.PI * 0.25],
    [5.2, -5.2, -Math.PI * 0.25],
    [-5.2, 5.2, Math.PI * 0.75],
    [5.2, 5.2, -Math.PI * 0.75]
  ];

  cornerButtressCoords.forEach(([bx, bz, rot]) => {
    const buttressGroup = new THREE.Group();
    buttressGroup.position.set(bx, 0.35, bz);
    buttressGroup.rotation.y = rot;

    // Stepped bottom block
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.4), stoneMat);
    b1.position.set(0, 0.25, 0);
    buttressGroup.add(b1);

    // Stepped upper slope wedge
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.1), stoneMat);
    b2.position.set(0, 0.5 + 0.3, -0.1);
    buttressGroup.add(b2);

    castle.add(buttressGroup);
  });

  // =========================================================================
  // 3. FOUR GRAND CORNER TURRETS
  // =========================================================================
  const turretRadius = 1.35;
  const turretHeight = 4.2;
  const cornerPositions = [
    [-4.5, -4.5],
    [4.5, -4.5],
    [-4.5, 4.5],
    [4.5, 4.5]
  ];

  cornerPositions.forEach(([cx, cz], index) => {
    const turretGroup = new THREE.Group();
    turretGroup.position.set(cx, 0.8, cz);

    // Flared stone footing
    const footGeo = new THREE.CylinderGeometry(turretRadius + 0.15, turretRadius + 0.35, 0.7, 12);
    const footing = new THREE.Mesh(footGeo, stoneMat);
    footing.position.set(0, 0.35, 0);
    turretGroup.add(footing);

    // Main tower shaft
    const shaftGeo = new THREE.CylinderGeometry(turretRadius, turretRadius + 0.15, turretHeight, 12);
    const shaft = new THREE.Mesh(shaftGeo, stoneTowerMat);
    shaft.position.set(0, 0.7 + turretHeight / 2, 0);
    turretGroup.add(shaft);

    // Arrow slit windows around turret
    const slitAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    slitAngles.forEach(ang => {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.1), windowDarkMat);
      slit.position.set(Math.sin(ang) * (turretRadius + 0.02), 0.7 + turretHeight * 0.55, Math.cos(ang) * (turretRadius + 0.02));
      slit.rotation.y = ang;
      turretGroup.add(slit);

      // Stone sill under slit
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.14), stoneMat);
      sill.position.set(Math.sin(ang) * (turretRadius + 0.04), 0.7 + turretHeight * 0.55 - 0.35, Math.cos(ang) * (turretRadius + 0.04));
      sill.rotation.y = ang;
      turretGroup.add(sill);
    });

    // Corbel machicolation ring under parapet
    const corbelRingY = 0.7 + turretHeight;
    const corbelCount = 12;
    for (let i = 0; i < corbelCount; i++) {
      const cAng = (i / corbelCount) * Math.PI * 2;
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.32), stoneMat);
      corbel.position.set(Math.sin(cAng) * (turretRadius + 0.12), corbelRingY - 0.15, Math.cos(cAng) * (turretRadius + 0.12));
      corbel.rotation.y = cAng;
      turretGroup.add(corbel);
    }

    // Extended parapet platform & walkway
    const parapetPlatform = new THREE.Mesh(new THREE.CylinderGeometry(turretRadius + 0.28, turretRadius, 0.4, 12), stoneMat);
    parapetPlatform.position.set(0, corbelRingY + 0.2, 0);
    turretGroup.add(parapetPlatform);

    // Turret wooden walkway floor
    const walkFloor = new THREE.Mesh(new THREE.CylinderGeometry(turretRadius + 0.15, turretRadius + 0.15, 0.08, 12), timberMat);
    walkFloor.position.set(0, corbelRingY + 0.35, 0);
    turretGroup.add(walkFloor);

    // Crenellated battlements (6 merlons around circumference)
    const merlonCount = 6;
    for (let m = 0; m < merlonCount; m++) {
      const mAng = (m / merlonCount) * Math.PI * 2;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.24), stoneMat);
      merlon.position.set(Math.sin(mAng) * (turretRadius + 0.2), corbelRingY + 0.4 + 0.32, Math.cos(mAng) * (turretRadius + 0.2));
      merlon.rotation.y = mAng;
      turretGroup.add(merlon);

      // Arrow slit on outward facing merlons
      const slitM = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.06), windowDarkMat);
      slitM.position.set(Math.sin(mAng) * (turretRadius + 0.32), corbelRingY + 0.4 + 0.32, Math.cos(mAng) * (turretRadius + 0.32));
      slitM.rotation.y = mAng;
      turretGroup.add(slitM);
    }

    // Conical Royal Blue Slate Roof
    const roofBaseY = corbelRingY + 0.4;
    const roofConeGeo = new THREE.ConeGeometry(turretRadius + 0.38, 2.7, 12);
    const roof = new THREE.Mesh(roofConeGeo, roofMat);
    roof.position.set(0, roofBaseY + 1.35, 0);
    turretGroup.add(roof);

    // Gilded golden eaves trim ring
    const eaveRing = new THREE.Mesh(new THREE.CylinderGeometry(turretRadius + 0.42, turretRadius + 0.42, 0.12, 12), goldAccentMat);
    eaveRing.position.set(0, roofBaseY + 0.06, 0);
    turretGroup.add(eaveRing);

    // Golden Roof Finial (Spire & Orb)
    const finialOrb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), goldAccentMat);
    finialOrb.position.set(0, roofBaseY + 2.7 + 0.08, 0);
    turretGroup.add(finialOrb);

    const finialSpike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 8), goldAccentMat);
    finialSpike.position.set(0, roofBaseY + 2.7 + 0.35, 0);
    turretGroup.add(finialSpike);

    // Wooden Flagpole & Fluttering Royal Pennant
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.4, 6), timberMat);
    pole.position.set(0, roofBaseY + 2.7 + 0.7, 0);
    turretGroup.add(pole);

    // Golden pole finial spearhead
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), goldAccentMat);
    spear.position.set(0, roofBaseY + 2.7 + 1.45, 0);
    turretGroup.add(spear);

    // Fluttering Swallowtail Pennant Flag (facing outward/windward)
    const flagGeo = new THREE.BoxGeometry(0.75, 0.38, 0.03);
    const flag = new THREE.Mesh(flagGeo, bannerMat);
    flag.position.set(0.4, roofBaseY + 2.7 + 1.15, 0);
    flag.rotation.y = (index % 2 === 0 ? 0.2 : -0.2);
    turretGroup.add(flag);

    castle.add(turretGroup);
  });

  // =========================================================================
  // 4. PERIMETER CURTAIN WALLS & BATTLEMENTS
  // =========================================================================
  const wallH = 3.2;
  const wallThick = 1.3;
  const wallSpan = 6.4; // Distance between corner turrets

  // Helper to create a curtain wall section with chemin de ronde & battlements
  function createCurtainWall(x, z, rotY, hasGate = false) {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(x, 0.8, z);
    wallGroup.rotation.y = rotY;

    if (!hasGate) {
      // Solid curtain wall
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(wallSpan, wallH, wallThick), stoneWallMat);
      wallMesh.position.set(0, wallH / 2, 0);
      wallGroup.add(wallMesh);

      // Machicolation corbel brackets along exterior edge
      const corbels = 7;
      for (let c = 0; c < corbels; c++) {
        const cx = -wallSpan / 2 + 0.5 + c * ((wallSpan - 1.0) / (corbels - 1));
        const corb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.32), stoneMat);
        corb.position.set(cx, wallH - 0.15, wallThick / 2 + 0.1);
        wallGroup.add(corb);
      }

      // Parapet outer stone wall
      const parapetOuter = new THREE.Mesh(new THREE.BoxGeometry(wallSpan, 0.3, 0.3), stoneMat);
      parapetOuter.position.set(0, wallH + 0.15, wallThick / 2 - 0.05);
      wallGroup.add(parapetOuter);

      // Merlon crenellations along exterior
      const merlons = 5;
      for (let m = 0; m < merlons; m++) {
        const mx = -wallSpan / 2 + 0.65 + m * ((wallSpan - 1.3) / (merlons - 1));
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.32), stoneMat);
        merlon.position.set(mx, wallH + 0.3 + 0.32, wallThick / 2 - 0.05);
        wallGroup.add(merlon);

        // Arrow slit on merlon
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.06), windowDarkMat);
        slit.position.set(mx, wallH + 0.3 + 0.32, wallThick / 2 + 0.12);
        wallGroup.add(slit);

        // Heraldic battle shield mounted on alternating merlons
        if (m % 2 === 0) {
          const shield = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.06), shieldMat);
          shield.position.set(mx, wallH + 0.3 + 0.3, wallThick / 2 + 0.18);
          wallGroup.add(shield);
        }
      }

      // Wooden Chemin de Ronde walkway (interior platform)
      const walk = new THREE.Mesh(new THREE.BoxGeometry(wallSpan, 0.15, 0.85), walkwayMat);
      walk.position.set(0, wallH - 0.1, -wallThick / 2 + 0.45);
      wallGroup.add(walk);

      // Wooden timber support corbels under walkway on courtyard side
      for (let w = 0; w < 4; w++) {
        const wx = -wallSpan / 2 + 1.0 + w * ((wallSpan - 2.0) / 3);
        const wCorb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.5), timberMat);
        wCorb.position.set(wx, wallH - 0.35, -wallThick / 2 + 0.15);
        wallGroup.add(wCorb);

        // Wood railing post
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.08), timberMat);
        post.position.set(wx, wallH + 0.25, -wallThick / 2 + 0.05);
        wallGroup.add(post);
      }

      // Wooden safety handrail along walkway edge
      const rail = new THREE.Mesh(new THREE.BoxGeometry(wallSpan, 0.08, 0.08), timberMat);
      rail.position.set(0, wallH + 0.55, -wallThick / 2 + 0.05);
      wallGroup.add(rail);

    } else {
      // --- FRONT GATEHOUSE WALL (South facade with grand portal) ---
      // Left Wall Wing
      const leftWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, wallH, wallThick), stoneWallMat);
      leftWing.position.set(-2.3, wallH / 2, 0);
      wallGroup.add(leftWing);

      // Right Wall Wing
      const rightWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, wallH, wallThick), stoneWallMat);
      rightWing.position.set(2.3, wallH / 2, 0);
      wallGroup.add(rightWing);

      // Twin Gatehouse Bastions projecting forward
      [-1.6, 1.6].forEach(gx => {
        const bastion = new THREE.Mesh(new THREE.BoxGeometry(1.4, wallH + 0.6, wallThick + 0.8), stoneMat);
        bastion.position.set(gx, (wallH + 0.6) / 2, 0.35);
        wallGroup.add(bastion);

        // Bastion stone plinth
        const bPlinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, wallThick + 1.0), stoneMat);
        bPlinth.position.set(gx, 0.2, 0.35);
        wallGroup.add(bPlinth);

        // Bastion crenellations
        const bMerlon = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.3), stoneMat);
        bMerlon.position.set(gx, wallH + 0.6 + 0.32, wallThick / 2 + 0.6);
        wallGroup.add(bMerlon);

        // Bastion arrow slit
        const bSlit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), windowDarkMat);
        bSlit.position.set(gx, wallH * 0.55, wallThick / 2 + 0.76);
        wallGroup.add(bSlit);
      });

      // Grand Gatehouse Arch Lintel Beam
      const archLintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, wallThick + 0.4), stoneMat);
      archLintel.position.set(0, wallH - 0.2, 0.15);
      wallGroup.add(archLintel);

      // Sculpted Keystone protruding forward at apex of arch
      const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.35), stoneMat);
      keystone.position.set(0, wallH + 0.15, wallThick / 2 + 0.35);
      wallGroup.add(keystone);

      // Heraldic Lion Crest mounted directly above gate keystone
      const gateShield = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.08), shieldMat);
      gateShield.position.set(0, wallH + 0.8, wallThick / 2 + 0.32);
      wallGroup.add(gateShield);

      // Fortified Grand Double Doors
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.5, 0.22), doorMat);
      doorMesh.position.set(0, 1.25, 0.15);
      wallGroup.add(doorMesh);

      // Recessed Heavy Black Wrought Iron Portcullis Grille
      const portcullisGroup = new THREE.Group();
      portcullisGroup.position.set(0, 2.0, 0.02);
      // Vertical iron bars
      for (let b = -3; b <= 3; b++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), ironMat);
        bar.position.set(b * 0.28, 0, 0);
        portcullisGroup.add(bar);
        // Spike tip at bottom
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), ironMat);
        tip.position.set(b * 0.28, -0.65, 0);
        tip.rotation.x = Math.PI;
        portcullisGroup.add(tip);
      }
      // Horizontal crossbars
      [-0.35, 0, 0.35].forEach(hy => {
        const hbar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.05), ironMat);
        hbar.position.set(0, hy, 0);
        portcullisGroup.add(hbar);
      });
      wallGroup.add(portcullisGroup);

      // Stone Threshold Step Ramp
      const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.9), stoneMat);
      threshold.position.set(0, 0.09, wallThick / 2 + 0.4);
      wallGroup.add(threshold);

      // --- Decorative Props flanking the Gate ---
      // 1. Two Royal Lion Banners
      [-2.6, 2.6].forEach(bx => {
        const bannerGroup = new THREE.Group();
        bannerGroup.position.set(bx, 2.4, wallThick / 2 + 0.85);

        // Horizontal carved timber mounting arm
        const bArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), timberMat);
        bArm.rotation.z = Math.PI / 2;
        bannerGroup.add(bArm);

        // Gold spearhead finials on both ends of the arm
        [-0.55, 0.55].forEach(sx => {
          const spear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), goldAccentMat);
          spear.position.set(sx, 0, 0);
          spear.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
          bannerGroup.add(spear);
        });

        // Wrought iron wall bracket
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.35), ironMat);
        bracket.position.set(0, 0, -0.15);
        bannerGroup.add(bracket);

        // Grand Royal Velvet Banner Cloth
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.2, 0.02), bannerMat);
        cloth.position.set(0, -1.05, 0.02);
        bannerGroup.add(cloth);

        wallGroup.add(bannerGroup);
      });

      // 2. Two Forged Iron Torch Sconces with warm flame glow
      [-1.0, 1.0].forEach(tx => {
        const torchGroup = new THREE.Group();
        torchGroup.position.set(tx, 2.1, wallThick / 2 + 0.8);

        // Wall mounting backplate
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.04), ironMat);
        torchGroup.add(plate);

        // Curved forged iron support arm
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.32), ironMat);
        arm.position.set(0, -0.05, 0.16);
        torchGroup.add(arm);

        // Open iron brazier basket
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.22, 6), ironMat);
        basket.position.set(0, 0.1, 0.3);
        torchGroup.add(basket);

        // Stylized faceted flame cluster with warm glow
        const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), torchFlameMat);
        flameCore.position.set(0, 0.28, 0.3);
        torchGroup.add(flameCore);

        const flameInner = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), torchFlameMat);
        flameInner.position.set(0, 0.18, 0.3);
        torchGroup.add(flameInner);

        wallGroup.add(torchGroup);
      });
    }

    return wallGroup;
  }

  // Back (North) Wall
  castle.add(createCurtainWall(0, -4.5, 0, false));
  // Left (West) Wall
  castle.add(createCurtainWall(-4.5, 0, Math.PI / 2, false));
  // Right (East) Wall
  castle.add(createCurtainWall(4.5, 0, -Math.PI / 2, false));
  // Front (South) Gatehouse Wall
  castle.add(createCurtainWall(0, 4.5, Math.PI, true));

  // =========================================================================
  // 5. THE CENTRAL ROYAL CITADEL & KEEP (DONJON)
  // =========================================================================
  const keepGroup = new THREE.Group();
  keepGroup.position.set(0, 0.8, 0);

  // --- TIER 1: THE GREAT ROYAL HALL ---
  const hallW = 5.4;
  const hallH = 3.6;
  const hallD = 5.4;

  // Hall stone base plinth
  const hallPlinth = new THREE.Mesh(new THREE.BoxGeometry(hallW + 0.4, 0.4, hallD + 0.4), stoneMat);
  hallPlinth.position.set(0, 0.2, 0);
  keepGroup.add(hallPlinth);

  // Hall main body
  const hallBody = new THREE.Mesh(new THREE.BoxGeometry(hallW, hallH, hallD), stoneWallMat);
  hallBody.position.set(0, 0.4 + hallH / 2, 0);
  keepGroup.add(hallBody);

  // 4 Sturdy Corner Buttresses on the Hall
  const hallButtresses = [
    [-hallW / 2, -hallD / 2],
    [hallW / 2, -hallD / 2],
    [-hallW / 2, hallD / 2],
    [hallW / 2, hallD / 2]
  ];

  hallButtresses.forEach(([hx, hz]) => {
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.65, hallH, 0.65), stoneMat);
    butt.position.set(hx, 0.4 + hallH / 2, hz);
    keepGroup.add(butt);

    // Stepped cap on buttress
    const bCap = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.2, 0.75), stoneMat);
    bCap.position.set(hx, 0.4 + hallH + 0.1, hz);
    keepGroup.add(bCap);
  });

  // Keep Entrance Portal (South facade of Hall facing courtyard)
  const portalArch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.3), stoneMat);
  portalArch.position.set(0, 0.4 + 1.15, hallD / 2 + 0.12);
  keepGroup.add(portalArch);

  const keepDoor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.0, 0.15), doorMat);
  keepDoor.position.set(0, 0.4 + 1.0, hallD / 2 + 0.18);
  keepGroup.add(keepDoor);

  // Stepped Stone Entrance Stairs leading down to courtyard
  [
    { w: 2.2, h: 0.14, d: 0.8, y: 0.07, z: hallD / 2 + 0.55 },
    { w: 2.0, h: 0.14, d: 0.6, y: 0.21, z: hallD / 2 + 0.35 },
    { w: 1.8, h: 0.14, d: 0.4, y: 0.35, z: hallD / 2 + 0.18 }
  ].forEach(st => {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), stoneMat);
    stair.position.set(0, st.y, st.z);
    keepGroup.add(stair);
  });

  // Torches flanking the Keep entrance
  [-1.0, 1.0].forEach(kx => {
    const kTorch = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 5), torchFlameMat);
    kTorch.position.set(kx, 0.4 + 1.6, hallD / 2 + 0.32);
    keepGroup.add(kTorch);
    const kBracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), ironMat);
    kBracket.position.set(kx, 0.4 + 1.45, hallD / 2 + 0.22);
    keepGroup.add(kBracket);
  });

  // Arched Gothic Windows on East, West, and North of Hall
  const hallWindowSpecs = [
    { x: -hallW / 2 - 0.02, z: 0, rotY: Math.PI / 2 },
    { x: hallW / 2 + 0.02, z: 0, rotY: -Math.PI / 2 },
    { x: -1.4, z: -hallD / 2 - 0.02, rotY: 0 },
    { x: 1.4, z: -hallD / 2 - 0.02, rotY: 0 }
  ];

  hallWindowSpecs.forEach(win => {
    const wGroup = new THREE.Group();
    wGroup.position.set(win.x, 0.4 + 1.9, win.z);
    wGroup.rotation.y = win.rotY;

    // Stone window frame & sill
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.15), stoneMat);
    wGroup.add(frame);

    // Glowing stained window glass
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.88, 0.18), windowGlowMat);
    wGroup.add(glass);

    // Iron cross mullion bars
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.88, 0.2), ironMat);
    wGroup.add(mullionV);
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.2), ironMat);
    wGroup.add(mullionH);

    keepGroup.add(wGroup);
  });

  // Tier 1 Corbelled Overhang & Crenellated Parapet
  const t1TopY = 0.4 + hallH;
  const t1Corbels = 6;
  for (let c = 0; c < t1Corbels; c++) {
    const cx = -hallW / 2 + 0.6 + c * ((hallW - 1.2) / (t1Corbels - 1));
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.35), stoneMat);
    c1.position.set(cx, t1TopY - 0.15, hallD / 2 + 0.15);
    keepGroup.add(c1);

    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.35), stoneMat);
    c2.position.set(cx, t1TopY - 0.15, -hallD / 2 - 0.15);
    keepGroup.add(c2);
  }

  // Tier 1 Parapet Walkway Platform
  const t1Walkway = new THREE.Mesh(new THREE.BoxGeometry(hallW + 0.5, 0.3, hallD + 0.5), stoneMat);
  t1Walkway.position.set(0, t1TopY + 0.15, 0);
  keepGroup.add(t1Walkway);

  // Merlons around Tier 1 battlements
  const merlonOffsets = [
    // Front edge
    [-2.2, 2.8], [-1.1, 2.8], [1.1, 2.8], [2.2, 2.8],
    // Back edge
    [-2.2, -2.8], [-1.1, -2.8], [1.1, -2.8], [2.2, -2.8],
    // Left edge
    [-2.8, -1.1], [-2.8, 1.1],
    // Right edge
    [2.8, -1.1], [2.8, 1.1]
  ];

  merlonOffsets.forEach(([mx, mz]) => {
    const isLR = Math.abs(mx) > 2.5;
    const merlon = new THREE.Mesh(
      new THREE.BoxGeometry(isLR ? 0.32 : 0.65, 0.65, isLR ? 0.65 : 0.32),
      stoneMat
    );
    merlon.position.set(mx, t1TopY + 0.3 + 0.32, mz);
    keepGroup.add(merlon);
  });

  // Keep Stone Chimney on East side of Hall
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), stoneMat);
  chimney.position.set(hallW / 2 + 0.15, t1TopY + 0.8, -1.0);
  keepGroup.add(chimney);

  const chimneyCrown = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.85), stoneMat);
  chimneyCrown.position.set(hallW / 2 + 0.15, t1TopY + 1.9, -1.0);
  keepGroup.add(chimneyCrown);

  // --- TIER 2: THE ROYAL SOLAR / UPPER CITADEL ---
  const solarW = 3.8;
  const solarH = 2.8;
  const solarD = 3.8;
  const t2BaseY = t1TopY + 0.3;

  const solarBody = new THREE.Mesh(new THREE.BoxGeometry(solarW, solarH, solarD), stoneWallMat);
  solarBody.position.set(0, t2BaseY + solarH / 2, 0);
  keepGroup.add(solarBody);

  // 4 Corner Bartizans (Hanging Echo Turrets on Tier 2 corners)
  const bartizanCoords = [
    [-solarW / 2 - 0.1, -solarD / 2 - 0.1],
    [solarW / 2 + 0.1, -solarD / 2 - 0.1],
    [-solarW / 2 - 0.1, solarD / 2 + 0.1],
    [solarW / 2 + 0.1, solarD / 2 + 0.1]
  ];

  bartizanCoords.forEach(([bx, bz]) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, t2BaseY + solarH * 0.4, bz);

    // Corbel support cone
    const cCone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.6, 8), stoneMat);
    cCone.position.set(0, -0.3, 0);
    cCone.rotation.x = Math.PI;
    bGroup.add(cCone);

    // Turret cylinder shaft
    const bShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 1.6, 8), stoneMat);
    bShaft.position.set(0, 0.8, 0);
    bGroup.add(bShaft);

    // Arrow slit in bartizan
    const bSlit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), windowDarkMat);
    bSlit.position.set(0, 0.8, 0.44);
    bGroup.add(bSlit);

    // Conical royal blue roof
    const bRoof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8), roofMat);
    bRoof.position.set(0, 1.6 + 0.55, 0);
    bGroup.add(bRoof);

    // Gold finial spike
    const bFinial = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), goldAccentMat);
    bFinial.position.set(0, 1.6 + 1.1 + 0.15, 0);
    bGroup.add(bFinial);

    keepGroup.add(bGroup);
  });

  // Royal Balcony on the South Facade of Tier 2
  const balconyGroup = new THREE.Group();
  balconyGroup.position.set(0, t2BaseY + 1.0, solarD / 2 + 0.1);

  // Projecting stone balcony slab
  const balcSlab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.75), stoneMat);
  balcSlab.position.set(0, 0, 0.375);
  balconyGroup.add(balcSlab);

  // 2 Stone Corbel Brackets supporting balcony slab
  [-0.6, 0.6].forEach(cx => {
    const bCorb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.55), stoneMat);
    bCorb.position.set(cx, -0.25, 0.25);
    balconyGroup.add(bCorb);
  });

  // Forged Wrought Iron Railing around Balcony
  const railFront = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.06), ironMat);
  railFront.position.set(0, 0.55, 0.72);
  balconyGroup.add(railFront);

  const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), ironMat);
  railLeft.position.set(-0.87, 0.55, 0.37);
  balconyGroup.add(railLeft);

  const railRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), ironMat);
  railRight.position.set(0.87, 0.55, 0.37);
  balconyGroup.add(railRight);

  // Iron vertical balusters
  for (let b = -3; b <= 3; b++) {
    const balust = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 5), ironMat);
    balust.position.set(b * 0.26, 0.28, 0.72);
    balconyGroup.add(balust);
  }

  // Arched Double French Doors onto Balcony
  const frenchDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.1), windowGlowMat);
  frenchDoor.position.set(0, 0.95, -0.02);
  balconyGroup.add(frenchDoor);

  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 0.08), stoneMat);
  doorFrame.position.set(0, 0.95, -0.06);
  balconyGroup.add(doorFrame);

  keepGroup.add(balconyGroup);

  // Tier 2 Parapet Platform & Merlons
  const t2TopY = t2BaseY + solarH;
  const t2Walkway = new THREE.Mesh(new THREE.BoxGeometry(solarW + 0.4, 0.25, solarD + 0.4), stoneMat);
  t2Walkway.position.set(0, t2TopY + 0.125, 0);
  keepGroup.add(t2Walkway);

  // Merlons around Tier 2
  [-1.2, 0, 1.2].forEach(ox => {
    const mFront = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.25), stoneMat);
    mFront.position.set(ox, t2TopY + 0.25 + 0.275, solarD / 2 + 0.18);
    keepGroup.add(mFront);

    const mBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.25), stoneMat);
    mBack.position.set(ox, t2TopY + 0.25 + 0.275, -solarD / 2 - 0.18);
    keepGroup.add(mBack);
  });

  // --- TIER 3: THE GRAND ROYAL SPIRE & HIGH WATCHTOWER ---
  const spireBaseY = t2TopY + 0.25;
  const spireRadius = 1.5;
  const spireH = 3.6;

  // High octagonal watchtower shaft
  const spireShaft = new THREE.Mesh(new THREE.CylinderGeometry(spireRadius, spireRadius + 0.15, spireH, 8), stoneTowerMat);
  spireShaft.position.set(0, spireBaseY + spireH / 2, 0);
  keepGroup.add(spireShaft);

  // Arched High Lookout Windows on watchtower
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(ang => {
    const lookout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.1), windowGlowMat);
    lookout.position.set(Math.sin(ang) * (spireRadius + 0.02), spireBaseY + spireH * 0.65, Math.cos(ang) * (spireRadius + 0.02));
    lookout.rotation.y = ang;
    keepGroup.add(lookout);

    // Stone arched lintel over lookout
    const lArch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.15), stoneMat);
    lArch.position.set(Math.sin(ang) * (spireRadius + 0.04), spireBaseY + spireH * 0.65 + 0.45, Math.cos(ang) * (spireRadius + 0.04));
    lArch.rotation.y = ang;
    keepGroup.add(lArch);
  });

  // Spire corbels under crown parapet
  const crownCorbelY = spireBaseY + spireH;
  for (let sc = 0; sc < 8; sc++) {
    const scAng = (sc / 8) * Math.PI * 2;
    const sCorb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.28), stoneMat);
    sCorb.position.set(Math.sin(scAng) * (spireRadius + 0.1), crownCorbelY - 0.15, Math.cos(scAng) * (spireRadius + 0.1));
    sCorb.rotation.y = scAng;
    keepGroup.add(sCorb);
  }

  // Crown Parapet Platform
  const crownPlatform = new THREE.Mesh(new THREE.CylinderGeometry(spireRadius + 0.3, spireRadius, 0.35, 8), stoneMat);
  crownPlatform.position.set(0, crownCorbelY + 0.175, 0);
  keepGroup.add(crownPlatform);

  // Crown Merlons (8 around watchtower crown)
  for (let cm = 0; cm < 8; cm++) {
    const cmAng = (cm / 8) * Math.PI * 2;
    const cMerlon = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.22), stoneMat);
    cMerlon.position.set(Math.sin(cmAng) * (spireRadius + 0.22), crownCorbelY + 0.35 + 0.275, Math.cos(cmAng) * (spireRadius + 0.22));
    cMerlon.rotation.y = cmAng;
    keepGroup.add(cMerlon);
  }

  // THE MAJESTIC GRAND CONICAL ROYAL BLUE SLATE ROOF
  const roofH = 3.8;
  const roofRadius = spireRadius + 0.45; // ~1.95
  const roofY = crownCorbelY + 0.35;

  const spireRoofGeo = new THREE.ConeGeometry(roofRadius, roofH, 8);
  const spireRoof = new THREE.Mesh(spireRoofGeo, roofMat);
  spireRoof.position.set(0, roofY + roofH / 2, 0);
  spireRoof.rotation.y = Math.PI / 8; // Align octagonal facets cleanly
  keepGroup.add(spireRoof);

  // Golden eaves trim ring around spire roof base
  const spireEaveRing = new THREE.Mesh(new THREE.CylinderGeometry(roofRadius + 0.06, roofRadius + 0.06, 0.14, 8), goldAccentMat);
  spireEaveRing.position.set(0, roofY + 0.07, 0);
  spireEaveRing.rotation.y = Math.PI / 8;
  keepGroup.add(spireEaveRing);

  // 4 Golden Dormer Windows set into cardinal faces of the Grand Roof
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(dang => {
    const dormerGroup = new THREE.Group();
    dormerGroup.position.set(Math.sin(dang) * (roofRadius * 0.65), roofY + 1.2, Math.cos(dang) * (roofRadius * 0.65));
    dormerGroup.rotation.y = dang;

    // Dormer walls
    const dWalls = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), stoneMat);
    dormerGroup.add(dWalls);

    // Glowing arched window in dormer
    const dGlass = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.45, 0.42), windowGlowMat);
    dormerGroup.add(dGlass);

    // Pitched golden dormer roof
    const dRoof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.45, 4), goldAccentMat);
    dRoof.position.set(0, 0.45, 0);
    dRoof.rotation.y = Math.PI / 4;
    dormerGroup.add(dRoof);

    keepGroup.add(dormerGroup);
  });

  // TOWERING GILDED GOLDEN FINIAL SPIRE
  const finialBaseY = roofY + roofH;

  const grandOrb1 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), goldAccentMat);
  grandOrb1.position.set(0, finialBaseY + 0.16, 0);
  keepGroup.add(grandOrb1);

  const finialNeedle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 8), goldAccentMat);
  finialNeedle.position.set(0, finialBaseY + 0.65, 0);
  keepGroup.add(finialNeedle);

  const grandOrb2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), goldAccentMat);
  grandOrb2.position.set(0, finialBaseY + 1.15, 0);
  keepGroup.add(grandOrb2);

  // Towering Royal Lion Pennant & Flagpole
  const mainPole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.6, 6), timberMat);
  mainPole.position.set(0, finialBaseY + 2.1, 0);
  keepGroup.add(mainPole);

  const poleTopFinial = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), goldAccentMat);
  poleTopFinial.position.set(0, finialBaseY + 3.45, 0);
  keepGroup.add(poleTopFinial);

  // Magnificent Grand Royal Lion Banner (1.8m x 1.0m cloth flying high in the wind)
  const grandBanner = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.03), bannerMat);
  grandBanner.position.set(0.95, finialBaseY + 2.7, 0);
  grandBanner.rotation.y = 0.12; // Dynamic stylized flutter angle
  keepGroup.add(grandBanner);

  // --- CONNECTING WOODEN WALKWAY BRIDGES (Connecting Keep to Outer Walls) ---
  // East Bridge
  const bridgeE = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.9), timberMat);
  bridgeE.position.set(hallW / 2 + 0.8, t1TopY + 0.15, 0);
  keepGroup.add(bridgeE);
  // East Bridge Handrails
  [-0.4, 0.4].forEach(bz => {
    const bRail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.06), timberMat);
    bRail.position.set(hallW / 2 + 0.8, t1TopY + 0.65, bz);
    keepGroup.add(bRail);
  });

  // West Bridge
  const bridgeW = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.9), timberMat);
  bridgeW.position.set(-hallW / 2 - 0.8, t1TopY + 0.15, 0);
  keepGroup.add(bridgeW);
  // West Bridge Handrails
  [-0.4, 0.4].forEach(bz => {
    const bRail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.06), timberMat);
    bRail.position.set(-hallW / 2 - 0.8, t1TopY + 0.65, bz);
    keepGroup.add(bRail);
  });

  castle.add(keepGroup);

  // Apply shadow casting & receiving to all child meshes
  return enableShadows(castle);
}
