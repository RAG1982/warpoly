import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getOrcDarkLogBarkTextures,
  getOrcLogEndTextures,
  getOrcSplitRoofTextures,
  getOrcBoneTuskTextures,
  getOrcBasaltStoneTextures,
  getOrcMudWaterTextures,
  getOrcPigSkinTextures
} from './orcTextures.js';

/**
 * Next-Gen AAA Stylized Orc Pig Farm (Criatório de Javalis da Horda)
 * Faithfully matches the bottom right building in modeloorcs.png.
 *
 * Visual Features:
 * - Rustic split-log post-and-rail fence enclosing an irregular mud yard.
 * - Deep dark churned mud base with a large glossy, highly reflective sky-mirror water puddle.
 * - Asymmetrical split-log lean-to shelter with curved bone ridge horns and straw bedding.
 * - Long hollowed-out log feeding trough filled with slop, swill, and vegetable scraps.
 * - Stacked feed sacks, cabbage crates, and a wooden water bucket.
 * - War pigs with mud splotches, tusks, floppy ears, and curly tails.
 *
 * @returns {THREE.Group}
 */
export function createPigFarm() {
  const farm = new THREE.Group();
  farm.name = 'PigFarm';

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

  const mudTex = getOrcMudWaterTextures();
  const mudMat = createPBRMaterial(mudTex, { bumpScale: 0.08, roughness: 0.8 });
  const barkMat = createPBRMaterial(getOrcDarkLogBarkTextures(), { bumpScale: 0.08 });
  const logEndMat = createPBRMaterial(getOrcLogEndTextures(), { bumpScale: 0.06 });
  const roofMat = createPBRMaterial(getOrcSplitRoofTextures(), { bumpScale: 0.08, metalness: 0.7 });
  const boneMat = createPBRMaterial(getOrcBoneTuskTextures(), { bumpScale: 0.05, roughness: 0.45 });
  const pigMat = createPBRMaterial(getOrcPigSkinTextures(), { roughness: 0.65 });

  // Ultra-glossy specular water puddle material
  const puddleWaterMat = new THREE.MeshStandardMaterial({
    color: 0x4a657a,
    roughness: 0.05,
    metalness: 0.2,
    flatShading: false
  });

  const strawMat = new THREE.MeshStandardMaterial({
    color: 0xebb856,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: true
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
  // 2. CHURNED MUD BASE & GLOSSY WATER PUDDLE
  // ==========================================================================
  const mudWidth = 8.2;
  const mudDepth = 8.0;

  // Raised mud basin
  const mudGround = new THREE.Mesh(new THREE.BoxGeometry(mudWidth, 0.4, mudDepth), mudMat);
  mudGround.position.set(0, 0.2, 0);
  farm.add(mudGround);

  // Large Glossy Reflective Water Puddle in center/foreground
  const puddleGeo = new THREE.CylinderGeometry(1.8, 2.2, 0.04, 16);
  puddleGeo.scale(1.3, 1.0, 0.9);
  const puddle = new THREE.Mesh(puddleGeo, puddleWaterMat);
  puddle.position.set(0.4, 0.42, 0.8);
  puddle.rotation.y = 0.25;
  farm.add(puddle);

  // Muddy rim bank around puddle
  const bankGeo = new THREE.RingGeometry(1.9, 2.5, 16);
  bankGeo.rotateX(-Math.PI / 2);
  const bank = new THREE.Mesh(bankGeo, mudMat);
  bank.position.set(0.4, 0.425, 0.8);
  bank.scale.set(1.3, 1.0, 0.9);
  farm.add(bank);

  // ==========================================================================
  // 3. RUSTIC POST-AND-RAIL SPLIT-LOG FENCE
  // ==========================================================================
  const fenceGroup = new THREE.Group();
  fenceGroup.name = 'Fence';

  const postCoords = [
    [-mudWidth * 0.46, -mudDepth * 0.46],
    [-mudWidth * 0.15, -mudDepth * 0.46],
    [mudWidth * 0.15, -mudDepth * 0.46],
    [mudWidth * 0.46, -mudDepth * 0.46],
    [mudWidth * 0.46, -mudDepth * 0.15],
    [mudWidth * 0.46, mudDepth * 0.15],
    [mudWidth * 0.46, mudDepth * 0.46],
    [mudWidth * 0.15, mudDepth * 0.46],
    [-mudWidth * 0.15, mudDepth * 0.46],
    [-mudWidth * 0.46, mudDepth * 0.46],
    [-mudWidth * 0.46, mudDepth * 0.15],
    [-mudWidth * 0.46, -mudDepth * 0.15]
  ];

  postCoords.forEach(([px, pz], idx) => {
    // Gate gap at front between X: -0.15 and +0.15
    if (pz > mudDepth * 0.4 && Math.abs(px) < 1.0) return;

    const postH = 1.6 + ((idx % 3) * 0.15);
    const post = createDetailedLog(0.14, postH);
    post.position.set(px, 0.4 + postH * 0.5, pz);
    post.rotation.z = (Math.sin(idx * 2) * 0.08);
    post.rotation.x = (Math.cos(idx * 2) * 0.08);
    fenceGroup.add(post);

    // Spiked top
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 5), darkIronMat);
    tip.position.set(px, 0.4 + postH + 0.16, pz);
    fenceGroup.add(tip);
  });

  // Horizontal Rails (2 tiers)
  [0.85, 1.35].forEach(ry => {
    // North rail
    const rN = new THREE.Mesh(new THREE.BoxGeometry(mudWidth * 0.9, 0.12, 0.12), barkMat);
    rN.position.set(0, ry, -mudDepth * 0.46);
    fenceGroup.add(rN);

    // South rail (left and right of gate)
    const rSL = new THREE.Mesh(new THREE.BoxGeometry(mudWidth * 0.35, 0.12, 0.12), barkMat);
    rSL.position.set(-mudWidth * 0.28, ry, mudDepth * 0.46);
    fenceGroup.add(rSL);

    const rSR = new THREE.Mesh(new THREE.BoxGeometry(mudWidth * 0.35, 0.12, 0.12), barkMat);
    rSR.position.set(mudWidth * 0.28, ry, mudDepth * 0.46);
    fenceGroup.add(rSR);

    // West rail
    const rW = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, mudDepth * 0.9), barkMat);
    rW.position.set(-mudWidth * 0.46, ry, 0);
    fenceGroup.add(rW);

    // East rail
    const rE = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, mudDepth * 0.9), barkMat);
    rE.position.set(mudWidth * 0.46, ry, 0);
    fenceGroup.add(rE);
  });

  farm.add(fenceGroup);

  // ==========================================================================
  // 4. PITCHED SPLIT-LOG LEAN-TO SHELTER WITH BONE RIDGE HORNS
  // ==========================================================================
  const shelterGroup = new THREE.Group();
  shelterGroup.name = 'PigShelter';
  shelterGroup.position.set(-1.8, 0.4, -1.8);

  // Support posts
  const sPosts = [
    [-1.6, -1.4, 2.6],
    [1.6, -1.4, 2.6],
    [-1.6, 1.2, 1.8],
    [1.6, 1.2, 1.8]
  ];
  sPosts.forEach(([sx, sz, sh]) => {
    const post = createDetailedLog(0.18, sh);
    post.position.set(sx, sh * 0.5, sz);
    shelterGroup.add(post);
  });

  // Pitch Slanted Split-Log Roof
  const roofGeo = new THREE.BoxGeometry(3.8, 0.18, 3.2);
  const shelterRoof = new THREE.Mesh(roofGeo, roofMat);
  shelterRoof.position.set(0, 2.4, -0.1);
  shelterRoof.rotation.x = 0.32;
  shelterGroup.add(shelterRoof);

  // Ridge beam
  const sRidge = createDetailedLog(0.2, 4.0, true);
  sRidge.position.set(0, 2.88, -1.35);
  shelterGroup.add(sRidge);

  // Curved Bone Tusks/Horns on Shelter Ridge Peak
  [-1.2, 0, 1.2].forEach(hx => {
    const hornGeo = new THREE.ConeGeometry(0.1, 0.7, 5);
    const horn = new THREE.Mesh(hornGeo, boneMat);
    horn.position.set(hx, 3.2, -1.35);
    horn.rotation.x = -0.3;
    shelterGroup.add(horn);
  });

  // Golden Straw Bedding inside shelter
  const strawBed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 2.4), strawMat);
  strawBed.position.set(0, 0.12, -0.1);
  shelterGroup.add(strawBed);

  farm.add(shelterGroup);

  // ==========================================================================
  // 5. HOLLOWED-OUT LOG FEEDING TROUGH & MICRO-PROPS
  // ==========================================================================
  const troughGroup = new THREE.Group();
  troughGroup.name = 'FeedingTrough';
  troughGroup.position.set(1.8, 0.4, -1.2);
  troughGroup.rotation.y = -0.35;

  // Outer hollowed log trough body
  const troughBody = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 0.9), barkMat);
  troughBody.position.y = 0.28;
  troughGroup.add(troughBody);

  // Hollow cavity
  const innerSlop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 0.65), strawMat);
  innerSlop.position.set(0, 0.45, 0);
  troughGroup.add(innerSlop);

  // Vegetable scraps / cabbage green meshes
  const vegMat = new THREE.MeshStandardMaterial({ color: 0x48bb78, roughness: 0.8, flatShading: true });
  for (let vx = -0.9; vx <= 0.9; vx += 0.45) {
    const veg = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), vegMat);
    veg.position.set(vx, 0.58, (Math.sin(vx * 4) * 0.15));
    troughGroup.add(veg);
  }

  // Trough end caps
  [-1.4, 1.4].forEach(ex => {
    const endCap = new THREE.Mesh(new THREE.CircleGeometry(0.38, 8), logEndMat);
    endCap.position.set(ex, 0.28, 0);
    endCap.rotation.y = ex > 0 ? Math.PI / 2 : -Math.PI / 2;
    troughGroup.add(endCap);
  });

  farm.add(troughGroup);

  // Stacked Feed Sacks & Wooden Bucket
  const sackMat = new THREE.MeshStandardMaterial({ color: 0xba8c59, roughness: 0.9, flatShading: true });
  const sack1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.6), sackMat);
  sack1.position.set(2.6, 0.6, -2.6);
  sack1.rotation.y = 0.2;
  farm.add(sack1);

  const sack2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.55), sackMat);
  sack2.position.set(2.55, 0.95, -2.6);
  sack2.rotation.y = -0.3;
  farm.add(sack2);

  // Water Bucket
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.42, 7), darkIronMat);
  bucket.position.set(0.6, 0.6, -2.4);
  farm.add(bucket);

  const bucketWater = new THREE.Mesh(new THREE.CircleGeometry(0.22, 7), puddleWaterMat);
  bucketWater.position.set(0.6, 0.78, -2.4);
  bucketWater.rotation.x = -Math.PI / 2;
  farm.add(bucketWater);

  // ==========================================================================
  // 6. DETAILED WAR PIGS IN PEN (WAR PIG CHARACTERS)
  // ==========================================================================
  function createDetailedWarPig(colorHex, scale = 1.0) {
    const pig = new THREE.Group();
    pig.scale.set(scale, scale, scale);

    const bodyMat = new THREE.MeshStandardMaterial({
      map: pigMat.map,
      roughness: 0.65,
      color: colorHex
    });

    // Barrel-shaped stout body
    const bodyGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.9, 8);
    bodyGeo.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.45;
    pig.add(body);

    // Rounded Pig Head
    const headGeo = new THREE.DodecahedronGeometry(0.32, 1);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0.55, 0.48, 0);
    head.scale.set(1.1, 0.95, 0.9);
    pig.add(head);

    // Snout / Disc
    const snoutGeo = new THREE.CylinderGeometry(0.14, 0.15, 0.18, 8);
    snoutGeo.rotateZ(Math.PI / 2);
    const snout = new THREE.Mesh(snoutGeo, bodyMat);
    snout.position.set(0.88, 0.42, 0);
    pig.add(snout);

    // Nostrils
    const nosMat = new THREE.MeshBasicMaterial({ color: 0x3d201c });
    [-0.05, 0.05].forEach(nz => {
      const nos = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), nosMat);
      nos.position.set(0.97, 0.42, nz);
      pig.add(nos);
    });

    // Tusks (Curving upward)
    [-0.14, 0.14].forEach(tz => {
      const tuskGeo = new THREE.ConeGeometry(0.045, 0.22, 5);
      const tusk = new THREE.Mesh(tuskGeo, boneMat);
      tusk.position.set(0.82, 0.46, tz);
      tusk.rotation.z = -0.7;
      tusk.rotation.x = tz > 0 ? 0.35 : -0.35;
      pig.add(tusk);
    });

    // Floppy triangular ears
    [-0.18, 0.18].forEach(ez => {
      const earGeo = new THREE.ConeGeometry(0.11, 0.26, 4);
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(0.58, 0.72, ez);
      ear.rotation.z = -0.3;
      ear.rotation.x = ez > 0 ? 0.6 : -0.6;
      pig.add(ear);
    });

    // 4 Chunky Legs
    const legGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.35, 6);
    const hoofMat = darkIronMat;
    const hoofGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.1, 6);

    const legOffsets = [
      [0.26, -0.22],
      [0.26, 0.22],
      [-0.26, -0.22],
      [-0.26, 0.22]
    ];
    legOffsets.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, 0.2, lz);
      pig.add(leg);

      const hoof = new THREE.Mesh(hoofGeo, hoofMat);
      hoof.position.set(lx, 0.05, lz);
      pig.add(hoof);
    });

    // Spiral curly tail
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.45, 0.52, 0),
      new THREE.Vector3(-0.56, 0.6, 0.06),
      new THREE.Vector3(-0.62, 0.54, 0.0),
      new THREE.Vector3(-0.58, 0.48, -0.05)
    ]);
    const tailGeo = new THREE.TubeGeometry(tailCurve, 8, 0.035, 5, false);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    pig.add(tail);

    return pig;
  }

  // Pig 1: Resting comfortably in the straw bedding under shelter
  const restingPig = createDetailedWarPig(0xf2a69b, 0.9);
  restingPig.position.set(-1.8, 0.38, -1.8);
  restingPig.rotation.y = 0.8;
  restingPig.rotation.z = 0.15; // slightly lounging
  farm.add(restingPig);

  // Pig 2: Wallowing in the glossy water puddle!
  const wallowingPig = createDetailedWarPig(0xd98277, 0.95);
  wallowingPig.position.set(0.4, 0.35, 0.8);
  wallowingPig.rotation.y = -0.6;
  farm.add(wallowingPig);

  // Enable shadow casting & receiving across all submeshes
  return enableShadows(farm);
}
