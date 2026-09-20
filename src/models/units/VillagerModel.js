import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import {
  getVillagerFaceTextures,
  getVillagerCapTextures,
  getVillagerTunicApronTextures,
  getVillagerArmsGlovesTextures,
  getVillagerPantsBootsTextures,
  getVillagerAxeTextures,
  getVillagerPickaxeTextures,
  getVillagerHammerTextures,
  getVillagerBackpackTextures,
  getVillagerWoodBundleTextures,
  getVillagerGoldSackTextures
} from './villagerTextures.js';

/**
 * Next-Gen Stylized Low-Poly Villager / Worker (Aldeão)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Key Features:
 * 1. Expressive, hardworking peasant face:
 *    - Friendly amber-brown eyes with specular gleam, bushy eyebrows, ruddy blushing cheeks.
 *    - Warm peasant smile and rugged five-o'clock shadow / stubble along jaw and chin.
 * 2. Peasant cloth coif / felt flat cap with hand-stitched seams, leather brim band, and brass grommets.
 * 3. Rustic woolen tunic (earthy mustard/ochre) with V-neck collar, draped beneath a heavy weathered
 *    craftsman leather apron featuring contrast stitching, shoulder bib buckles, utility pocket, and tool loops.
 * 4. Sturdy waist belt with large brass buckle, prong, and notch eyelets.
 * 5. Muscular sun-tanned arms with rolled-up sleeves and heavy oiled cowhide work gloves.
 * 6. Homespun patchwork trousers with stitched knee reinforcement patches and rugged cuffed leather boots
 *    with thick lugged tread soles.
 * 7. Modular Interchangeable Tools (held in right hand toolGroup):
 *    - Craftsman Broadaxe: Curved ash haft with leather wrap, carbon steel blade with ground mirror bevel & nicks.
 *    - Miner's Pickaxe: Iron-reinforced hardwood haft, forged dark iron head with polished chisel/pick tips.
 *    - Builder's Hammer: Heavy beveled forged steel head with cross-peen wedge, octagonal haft & cheek plates.
 * 8. Dynamic Cargo Backpack (slung on back for resource return):
 *    - Wood-and-leather pack frame with canvas rucksack, straps, brass buckles, and rolled woolen bedroll.
 *    - Chopped Wood Logs Bundle: Stacked logs with deep fissured bark, end-grain growth rings, and tied hemp rope.
 *    - Heavy Burlap Gold Sack: Hessian burlap sack tied with cord, overflowing with faceted glittering raw gold nuggets.
 * 
 * Rigging / userData:
 * Contains { torso, head, armL, armR, legL, legR, toolGroup, axe, pickaxe, hammer, pack, woodBundle, goldSack, cap }
 * ensuring seamless in-game and inspector animations!
 * 
 * @returns {THREE.Group}
 */
export function createVillager() {
  const villager = new THREE.Group();
  villager.name = 'Villager';

  // --- 1. PBR Texture Sets & Material Helpers ---
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

  const faceMat = createPBRMaterial(getVillagerFaceTextures(), { bumpScale: 0.05 });
  const capMat = createPBRMaterial(getVillagerCapTextures(), { bumpScale: 0.06 });
  const tunicApronMat = createPBRMaterial(getVillagerTunicApronTextures(), { bumpScale: 0.07 });
  const armsGlovesMat = createPBRMaterial(getVillagerArmsGlovesTextures(), { bumpScale: 0.06 });
  const pantsBootsMat = createPBRMaterial(getVillagerPantsBootsTextures(), { bumpScale: 0.06 });
  const axeMat = createPBRMaterial(getVillagerAxeTextures(), { bumpScale: 0.06 });
  const pickaxeMat = createPBRMaterial(getVillagerPickaxeTextures(), { bumpScale: 0.06 });
  const hammerMat = createPBRMaterial(getVillagerHammerTextures(), { bumpScale: 0.06 });
  const backpackMat = createPBRMaterial(getVillagerBackpackTextures(), { bumpScale: 0.06 });
  const woodBundleMat = createPBRMaterial(getVillagerWoodBundleTextures(), { bumpScale: 0.08 });
  const goldSackMat = createPBRMaterial(getVillagerGoldSackTextures(), { bumpScale: 0.07 });

  // Accent & Trim Materials
  const brassAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.88,
    flatShading: true
  });

  const steelAccentMat = new THREE.MeshStandardMaterial({
    color: 0xc4cbd4,
    roughness: 0.28,
    metalness: 0.85,
    flatShading: true
  });

  const darkIronAccentMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.80,
    flatShading: true
  });

  const leatherAccentMat = new THREE.MeshStandardMaterial({
    color: 0x4a2511,
    roughness: 0.65,
    metalness: 0.05,
    flatShading: true
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf5ba95,
    roughness: 0.65,
    metalness: 0.0,
    flatShading: true
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x4a2810,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: true
  });

  const goldNuggetMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0x78350f,
    emissiveIntensity: 0.25,
    roughness: 0.18,
    metalness: 0.95,
    flatShading: true
  });

  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0xd4a373,
    roughness: 0.82,
    metalness: 0.0,
    flatShading: true
  });

  // --- 2. TORSO, TUNIC & CRAFTSMAN APRON ---
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 1.0, 0);

  // Main Tunic & Torso Block (broad, hardworking peasant build)
  const chestGeo = new THREE.BoxGeometry(0.52, 0.58, 0.34);
  const chest = new THREE.Mesh(chestGeo, tunicApronMat);
  torso.add(chest);

  // Tunic Open V-Neck Collar Flaps
  const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), tunicApronMat);
  collarL.position.set(-0.13, 0.28, 0.175);
  collarL.rotation.z = -0.35;
  collarL.rotation.y = 0.10;
  torso.add(collarL);

  const collarR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), tunicApronMat);
  collarR.position.set(0.13, 0.28, 0.175);
  collarR.rotation.z = 0.35;
  collarR.rotation.y = -0.10;
  torso.add(collarR);

  // Exposed Neck Skin
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 6), skinMat);
  neck.position.set(0, 0.28, 0.04);
  torso.add(neck);

  // Craftsman Leather Apron 3D Bib (Over chest)
  const apronBib = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.035), tunicApronMat);
  apronBib.position.set(0, 0.04, 0.18);
  torso.add(apronBib);

  // Apron Shoulder Straps
  [-0.14, 0.14].forEach(sx => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.30, 0.03), leatherAccentMat);
    strap.position.set(sx, 0.18, 0.185);
    torso.add(strap);

    // Brass Buckle connecting strap to bib
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.04), brassAccentMat);
    buckle.position.set(sx, 0.14, 0.20);
    torso.add(buckle);

    // Rivet under buckle
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), brassAccentMat);
    r.position.set(sx, 0.09, 0.205);
    torso.add(r);
  });

  // Front Utility Pocket on Apron
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.03), leatherAccentMat);
  pocket.position.set(0, -0.04, 0.20);
  torso.add(pocket);

  // Pencil / Wood Scribe in pocket
  const pencil = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), brassAccentMat);
  pencil.position.set(0.08, 0.04, 0.215);
  pencil.rotation.z = 0.15;
  torso.add(pencil);

  // Heavy Leather Waist Belt
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.38), leatherAccentMat);
  belt.position.set(0, -0.16, 0);
  torso.add(belt);

  // Large Heavy Brass Belt Buckle
  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.05), brassAccentMat);
  beltBuckle.position.set(0, -0.16, 0.21);
  torso.add(beltBuckle);

  const buckleProng = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.02), brassAccentMat);
  buckleProng.position.set(0, -0.16, 0.235);
  torso.add(buckleProng);

  // Apron Lower Skirt (Hanging below belt over upper thighs)
  const apronSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.035), tunicApronMat);
  apronSkirt.position.set(0, -0.31, 0.185);
  apronSkirt.rotation.x = 0.08;
  torso.add(apronSkirt);

  // Split in center of apron skirt
  const splitL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.036), tunicApronMat);
  splitL.position.set(-0.11, -0.31, 0.186);
  splitL.rotation.x = 0.08;
  splitL.rotation.y = 0.04;
  torso.add(splitL);

  const splitR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.036), tunicApronMat);
  splitR.position.set(0.11, -0.31, 0.186);
  splitR.rotation.x = 0.08;
  splitR.rotation.y = -0.04;
  torso.add(splitR);

  // Right Hip: Leather Utility Pouch with Brass Button Stud
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.10), leatherAccentMat);
  pouch.position.set(0.30, -0.18, 0.06);
  pouch.rotation.z = -0.12;
  torso.add(pouch);

  const pouchFlap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.11), leatherAccentMat);
  pouchFlap.position.set(0.30, -0.12, 0.06);
  pouchFlap.rotation.z = -0.12;
  torso.add(pouchFlap);

  const pouchStud = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), brassAccentMat);
  pouchStud.position.set(0.30, -0.16, 0.12);
  torso.add(pouchStud);

  // Left Hip: Craftsman Leather Tool Loop with Hanging Timber Wedge
  const toolLoop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.06), leatherAccentMat);
  toolLoop.position.set(-0.29, -0.18, 0.05);
  toolLoop.rotation.z = 0.12;
  torso.add(toolLoop);

  const timberWedge = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), darkIronAccentMat);
  timberWedge.position.set(-0.29, -0.24, 0.05);
  timberWedge.rotation.z = 0.12;
  torso.add(timberWedge);

  villager.add(torso);

  // --- 3. HEAD, EXPRESSIVE FACE & PEASANT CAP ---
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.55, 0);

  // Low-Poly Stylized Head Core
  const headGeo = new THREE.BoxGeometry(0.36, 0.38, 0.36);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  head.add(headMesh);

  // Front Faceplate with Hand-Painted Expressive Face Texture
  const faceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 0.03), faceMat);
  faceMesh.position.set(0, 0.0, 0.175);
  head.add(faceMesh);

  // Sculpted 3D Stylized Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), skinMat);
  nose.position.set(0, 0.01, 0.205);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  // Stylized Ears
  [-0.19, 0.19].forEach((ex, idx) => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.06), skinMat);
    ear.position.set(ex, 0.01, 0.02);
    ear.rotation.y = idx === 0 ? -0.2 : 0.2;
    head.add(ear);
  });

  // Messy Stylized Peasant Hair Tufts Peeking Out from under Cap
  [-0.17, 0.17].forEach((hx, idx) => {
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.12), hairMat);
    tuft.position.set(hx, 0.14, 0.08);
    tuft.rotation.z = idx === 0 ? 0.3 : -0.3;
    head.add(tuft);
  });

  const napeHair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.06), hairMat);
  napeHair.position.set(0, -0.12, -0.17);
  head.add(napeHair);

  // Peasant Cloth Coif / Cap (Added to head so it animates with head motion!)
  const cap = new THREE.Group();
  cap.name = 'Cap';
  cap.position.set(0, 0.21, 0);
  cap.rotation.x = -0.08;
  cap.rotation.z = 0.06;

  // Cap Rounded Crown Dome
  const capDome = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 8), capMat);
  cap.add(capDome);

  // Slanted / Floppy Cap Peak
  const capPeak = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.14, 8), capMat);
  capPeak.position.set(-0.04, 0.10, -0.06);
  capPeak.rotation.z = -0.3;
  capPeak.rotation.x = -0.2;
  cap.add(capPeak);

  // Leather Trim Brim Band with Brass Grommets
  const capBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.05, 8), leatherAccentMat);
  capBrim.position.set(0, -0.07, 0);
  cap.add(capBrim);

  // Decorative brass grommets / pin on cap brim
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), brassAccentMat);
    pin.position.set(Math.cos(a) * 0.25, -0.07, Math.sin(a) * 0.25);
    cap.add(pin);
  }

  head.add(cap);
  villager.add(head);

  // --- 4. ARMS, ROLLED SLEEVES & WORK GLOVES ---
  function createArm(isLeft = true) {
    const arm = new THREE.Group();
    arm.name = isLeft ? 'ArmL' : 'ArmR';
    arm.position.set(isLeft ? -0.35 : 0.35, 1.18, 0);

    // Shoulder & Rolled-Up Woolen Tunic Sleeve
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.115, 0.16, 6), tunicApronMat);
    sleeve.position.set(0, -0.06, 0);
    arm.add(sleeve);

    // Rolled Sleeve Fold Rim (bulging ring around elbow)
    const cuffRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.126, 0.05, 6), tunicApronMat);
    cuffRoll.position.set(0, -0.13, 0);
    arm.add(cuffRoll);

    // Muscular Bare Forearm (Tanned skin)
    const bicep = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.082, 0.16, 6), skinMat);
    bicep.position.set(0, -0.22, 0);
    arm.add(bicep);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.078, 0.16, 6), armsGlovesMat);
    forearm.position.set(0, -0.34, 0.01);
    arm.add(forearm);

    // Heavy Oiled Leather Work Glove Gauntlet Cuff
    const gloveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.07, 6), leatherAccentMat);
    gloveCuff.position.set(0, -0.42, 0.015);
    arm.add(gloveCuff);

    // Leather Cinch Strap & Brass Stud on Glove Wrist
    const gloveStud = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), brassAccentMat);
    gloveStud.position.set(isLeft ? -0.09 : 0.09, -0.42, 0.015);
    arm.add(gloveStud);

    // Work Glove Hand (Gripping forward)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.12), armsGlovesMat);
    hand.position.set(0, -0.50, 0.02);
    arm.add(hand);

    // Glove Thumb
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.05), armsGlovesMat);
    thumb.position.set(isLeft ? 0.06 : -0.06, -0.48, 0.05);
    thumb.rotation.y = isLeft ? 0.3 : -0.3;
    arm.add(thumb);

    return arm;
  }

  const armL = createArm(true);
  villager.add(armL);

  const armR = createArm(false);
  villager.add(armR);

  // --- 5. PATCHWORK TROUSERS & CUFFED BOOTS ---
  function createLeg(isLeft = true) {
    const leg = new THREE.Group();
    leg.name = isLeft ? 'LegL' : 'LegR';
    leg.position.set(isLeft ? -0.15 : 0.15, 0.65, 0);

    // Upper Thigh: Patchwork Homespun Trousers
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.32, 0.21), pantsBootsMat);
    thigh.position.set(0, -0.15, 0);
    leg.add(thigh);

    // Knee Reinforcement Patch (Layered 3D patch with stitched border)
    const kneePatch = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.035), leatherAccentMat);
    kneePatch.position.set(0, -0.28, 0.10);
    leg.add(kneePatch);

    // Lower Shin / Boot Upper
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.20), pantsBootsMat);
    shin.position.set(0, -0.42, 0);
    leg.add(shin);

    // Folded-Over Leather Boot Cuff
    const bootCuff = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.09, 0.23), leatherAccentMat);
    bootCuff.position.set(0, -0.36, 0);
    leg.add(bootCuff);

    // Ankle Strap & Brass Buckle
    const ankleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.22), leatherAccentMat);
    ankleStrap.position.set(0, -0.50, 0.01);
    leg.add(ankleStrap);

    const ankleBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.025), brassAccentMat);
    ankleBuckle.position.set(isLeft ? -0.10 : 0.10, -0.50, 0.01);
    leg.add(ankleBuckle);

    // Foot Group & Heavy Lugged Work Boot
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.58, 0);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.28), pantsBootsMat);
    foot.position.set(0, 0.02, 0.04);
    footGroup.add(foot);

    // Rounded Sturdy Leather Toe Cap
    const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.10), leatherAccentMat);
    toeCap.position.set(0, 0.02, 0.14);
    footGroup.add(toeCap);

    // Thick Rugged Sole
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.32), pantsBootsMat);
    sole.position.set(0, -0.05, 0.05);
    footGroup.add(sole);

    leg.add(footGroup);
    return leg;
  }

  const legL = createLeg(true);
  villager.add(legL);

  const legR = createLeg(false);
  villager.add(legR);

  // --- 6. TOOL ATTACHMENTS (AXE, PICKAXE, HAMMER) ---
  const toolGroup = new THREE.Group();
  toolGroup.name = 'ToolGroup';
  toolGroup.position.set(0.35, 0.75, 0.2);

  // ==========================================
  // 1. CRAFTSMAN BROADAXE
  // ==========================================
  const axe = new THREE.Group();
  axe.name = 'Axe';

  // Curved Carved Ash Wood Handle
  const axeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.42, -0.04), // handle base pommel
    new THREE.Vector3(0, -0.20, 0.01),  // lower shaft
    new THREE.Vector3(0, 0.05, 0.02),   // grip center (held in hand)
    new THREE.Vector3(0, 0.25, 0.00),   // upper neck
    new THREE.Vector3(0, 0.40, -0.02)   // eye under axe head
  ]);
  const aHaftGeo = new THREE.TubeGeometry(axeCurve, 14, 0.028, 6, false);
  const aHaft = new THREE.Mesh(aHaftGeo, axeMat);
  axe.add(aHaft);

  // Pommel Swell at Handle Base
  const aPommel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.030, 0.06, 6), leatherAccentMat);
  aPommel.position.set(0, -0.42, -0.04);
  axe.add(aPommel);

  // Criss-Cross Leather Wrap Grip around Hand Placement
  const aWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.24, 6), axeMat);
  aWrap.position.set(0, -0.02, 0.02);
  axe.add(aWrap);

  // Steel Reinforcing Collar under Axe Head
  const aCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.08, 6), steelAccentMat);
  aCollar.position.set(0, 0.32, -0.01);
  axe.add(aCollar);

  // Forged Carbon Steel Broadaxe Head Group
  const aHeadGroup = new THREE.Group();
  aHeadGroup.position.set(0, 0.36, -0.02);

  // Socket Eye Block
  const aSocket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.10), axeMat);
  aHeadGroup.add(aSocket);

  // Top Wood Wedge Pin
  const aWedge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), steelAccentMat);
  aWedge.position.set(0, 0.065, 0);
  aHeadGroup.add(aWedge);

  // Flaring Broadaxe Blade Body
  const aBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.042), axeMat);
  aBody.position.set(0.12, 0.0, 0);
  aHeadGroup.add(aBody);

  // Curved Razor Sharp Cutting Edge Bevel
  const aBevel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.02), steelAccentMat);
  aBevel.position.set(0.26, 0.0, 0);
  aBevel.rotation.z = -0.08;
  aHeadGroup.add(aBevel);

  // Rear Hammer Poll / Butt on back of axe head
  const aPoll = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), darkIronAccentMat);
  aPoll.position.set(-0.06, 0, 0);
  aHeadGroup.add(aPoll);

  axe.add(aHeadGroup);
  axe.rotation.x = 0.5;
  axe.visible = true; // default visible tool
  toolGroup.add(axe);

  // ==========================================
  // 2. MINER'S FORGED PICKAXE
  // ==========================================
  const pickaxe = new THREE.Group();
  pickaxe.name = 'Pickaxe';

  // Sturdy Hardwood Haft
  const pHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.86, 6), pickaxeMat);
  pickaxe.add(pHaft);

  // Lower Grip Swell
  const pGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), leatherAccentMat);
  pGrip.position.set(0, -0.04, 0);
  pickaxe.add(pGrip);

  // Iron Collar Band with Rivets under Head
  const pCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.10, 6), darkIronAccentMat);
  pCollar.position.set(0, 0.32, 0);
  pickaxe.add(pCollar);

  // Forged Dark Iron Pickaxe Head Group
  const pHeadGroup = new THREE.Group();
  pHeadGroup.position.set(0, 0.36, 0);

  // Central Forged Socket Eye
  const pSocket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.09), pickaxeMat);
  pHeadGroup.add(pSocket);

  // Front Curved Chisel Blade Arm
  const pFrontArm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05), pickaxeMat);
  pFrontArm.position.set(0.16, -0.02, 0);
  pFrontArm.rotation.z = -0.15;
  pHeadGroup.add(pFrontArm);

  const pChiselTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), steelAccentMat);
  pChiselTip.position.set(0.31, -0.05, 0);
  pChiselTip.rotation.z = -0.15;
  pHeadGroup.add(pChiselTip);

  // Rear Pointed Pick Spike Arm
  const pRearArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), pickaxeMat);
  pRearArm.position.set(-0.15, -0.02, 0);
  pRearArm.rotation.z = 0.15;
  pHeadGroup.add(pRearArm);

  const pSpikeTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 4), steelAccentMat);
  pSpikeTip.position.set(-0.30, -0.05, 0);
  pSpikeTip.rotation.z = Math.PI / 2 + 0.15;
  pHeadGroup.add(pSpikeTip);

  pickaxe.add(pHeadGroup);
  pickaxe.rotation.x = 0.5;
  pickaxe.visible = false;
  toolGroup.add(pickaxe);

  // ==========================================
  // 3. BUILDER'S SLEDGEHAMMER
  // ==========================================
  const hammer = new THREE.Group();
  hammer.name = 'Hammer';

  // Octagonal Wooden Haft
  const hHaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.030, 0.76, 8), hammerMat);
  hammer.add(hHaft);

  // Handle Grip Wrap
  const hWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.22, 6), leatherAccentMat);
  hWrap.position.set(0, -0.02, 0);
  hammer.add(hWrap);

  // Hammer Head Group
  const hHeadGroup = new THREE.Group();
  hHeadGroup.position.set(0, 0.30, 0);

  // Heavy Central Forged Steel Block
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.13), hammerMat);
  hHeadGroup.add(hBody);

  // Front Square Striking Face
  const hFace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.14), steelAccentMat);
  hFace.position.set(0.12, 0, 0);
  hHeadGroup.add(hFace);

  // Rear Cross-Peen Wedge
  const hPeen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), darkIronAccentMat);
  hPeen.position.set(-0.13, 0, 0);
  hHeadGroup.add(hPeen);

  // Side Steel Reinforcing Plates with Rivets
  [-0.068, 0.068].forEach(pz => {
    const sPlate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.015), steelAccentMat);
    sPlate.position.set(0, 0, pz);
    hHeadGroup.add(sPlate);

    const r1 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), steelAccentMat);
    r1.position.set(-0.04, 0, pz > 0 ? pz + 0.01 : pz - 0.01);
    hHeadGroup.add(r1);

    const r2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), steelAccentMat);
    r2.position.set(0.04, 0, pz > 0 ? pz + 0.01 : pz - 0.01);
    hHeadGroup.add(r2);
  });

  hammer.add(hHeadGroup);
  hammer.rotation.x = 0.5;
  hammer.visible = false;
  toolGroup.add(hammer);

  villager.add(toolGroup);

  // --- 7. BACKPACK CARGO GROUP (PACK, WOOD BUNDLE, GOLD SACK) ---
  const pack = new THREE.Group();
  pack.name = 'Pack';
  pack.position.set(0, 1.05, -0.28);
  pack.visible = false; // Toggled when villager is carrying resources

  // Backpack Base Structure: Wood Frame & Canvas Rucksack
  const packFrame = new THREE.Group();
  packFrame.name = 'PackFrame';

  // Wooden Upright Stays
  [-0.18, 0.18].forEach(fx => {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), backpackMat);
    upright.position.set(fx, 0, 0.04);
    packFrame.add(upright);
  });

  // Wooden Crossbars
  [-0.22, 0, 0.22].forEach(fy => {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.03), backpackMat);
    cross.position.set(0, fy, 0.04);
    packFrame.add(cross);
  });

  // Canvas Rucksack Body
  const rucksack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.40, 0.20), backpackMat);
  rucksack.position.set(0, -0.06, -0.06);
  packFrame.add(rucksack);

  // Rucksack Leather Flap & Straps
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.22), leatherAccentMat);
  flap.position.set(0, 0.10, -0.06);
  packFrame.add(flap);

  // Rolled Woolen Bedroll on Top of Frame
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.46, 8), backpackMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.26, -0.02);
  packFrame.add(bedroll);

  // Leather Straps holding Bedroll
  [-0.14, 0.14].forEach(bx => {
    const bStrap = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.010, 4, 12), leatherAccentMat);
    bStrap.position.set(bx, 0.26, -0.02);
    bStrap.rotation.y = Math.PI / 2;
    packFrame.add(bStrap);
  });

  pack.add(packFrame);

  // ==========================================
  // CARGO 1: CHOPPED WOOD LOGS BUNDLE
  // ==========================================
  const woodBundle = new THREE.Group();
  woodBundle.name = 'WoodBundle';

  // 3-Log Stack in a Stable Triangular Pyramid
  const logConfigs = [
    { x: -0.11, y: -0.10, z: -0.16, rz: Math.PI / 2 + 0.03 },
    { x: 0.11, y: -0.10, z: -0.16, rz: Math.PI / 2 - 0.03 },
    { x: 0.00, y: 0.08, z: -0.18, rz: Math.PI / 2 }
  ];

  logConfigs.forEach(cfg => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.84, 8), woodBundleMat);
    log.rotation.z = cfg.rz;
    log.position.set(cfg.x, cfg.y, cfg.z);
    woodBundle.add(log);
  });

  // Coiled Hemp Rope Binding around the Wood Bundle
  [-0.24, 0.24].forEach(rx => {
    const ropeLoop = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 6, 16), ropeMat);
    ropeLoop.position.set(rx, -0.01, -0.17);
    ropeLoop.rotation.y = Math.PI / 2;
    woodBundle.add(ropeLoop);

    // Tied Rope Knot & Tassel
    const knot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.038, 0), ropeMat);
    knot.position.set(rx, 0.22, -0.17);
    woodBundle.add(knot);
  });

  woodBundle.visible = true; // Shown when returning wood
  pack.add(woodBundle);

  // ==========================================
  // CARGO 2: HEAVY BURLAP SACK & GLITTERING GOLD NUGGETS
  // ==========================================
  const goldSack = new THREE.Group();
  goldSack.name = 'GoldSack';

  // Bulging Burlap Sack Body
  const sackBody = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 1), goldSackMat);
  sackBody.scale.set(1.0, 1.15, 0.95);
  sackBody.position.set(0, -0.02, -0.15);
  goldSack.add(sackBody);

  // Tied Cord Rope at Sack Neck
  const sackNeck = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 12), ropeMat);
  sackNeck.position.set(0, 0.18, -0.15);
  sackNeck.rotation.x = Math.PI / 2;
  goldSack.add(sackNeck);

  // Overflowing Faceted Glittering Gold Nuggets
  const nuggetPositions = [
    { x: 0.00, y: 0.22, z: -0.15, s: 0.10 },
    { x: -0.08, y: 0.20, z: -0.11, s: 0.08 },
    { x: 0.08, y: 0.19, z: -0.12, s: 0.09 },
    { x: -0.04, y: 0.26, z: -0.16, s: 0.07 },
    { x: 0.05, y: 0.25, z: -0.17, s: 0.075 },
    { x: 0.00, y: 0.18, z: -0.21, s: 0.085 }
  ];

  nuggetPositions.forEach((pos, idx) => {
    const nugget = new THREE.Mesh(new THREE.DodecahedronGeometry(pos.s, 0), goldNuggetMat);
    nugget.position.set(pos.x, pos.y, pos.z);
    nugget.rotation.set(idx * 0.7, idx * 1.1, idx * 0.4);
    goldSack.add(nugget);
  });

  goldSack.visible = false; // Shown when returning gold/stone
  pack.add(goldSack);

  villager.add(pack);

  // --- 8. RIGGING & userData FOR IN-GAME & INSPECTOR ANIMATIONS ---
  villager.userData = {
    torso,
    head,
    cap,
    armL,
    armR,
    legL,
    legR,
    toolGroup,
    axe,
    pickaxe,
    hammer,
    pack,
    woodBundle,
    goldSack
  };

  return enableShadows(villager);
}
