import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Orc Peon (Trabalhador Orc)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getPeonFaceTextures(): Weathered mossy green orc skin, fierce glowing amber/red eyes, heavy lower jaw tusks, furrowed brow, dark battle stubble.
 * - getPeonCapHarnessTextures(): Rough stitched leather skullcap, rawhide shoulder harness with bone fasteners and iron rivets.
 * - getPeonTunicPantsTextures(): Heavy coarse dark burlap tunic with rope cinch, ragged patchwork rawhide trousers with cross-stitches and iron studs.
 * - getPeonArmsGlovesTextures(): Muscular mossy-green arms with dark veins, spiked leather wristbands and heavy rawhide work gloves.
 * - getPeonBootsTextures(): Heavy reinforced mud-stained leather work boots with fur trim and iron toe plates.
 * - getPeonAxeTextures(): Heavy crude orc lumberjack axe: chipped carbon steel cleaver blade with notch marks, rough timber haft bound in rawhide.
 * - getPeonPickaxeTextures(): Spiked orc mining pick: forged black iron chisel pick with blood-rune engravings, reinforced wooden handle.
 * - getPeonHammerTextures(): Heavy stone builder's mallet with iron reinforcing bands and rough wood haft.
 * - getPeonBackpackTextures(): Sturdy spiked wooden frame pack with burlap sacks and hemp rope bindings.
 * - getPeonWoodBundleTextures(): Freshly felled dark timber logs with rough bark and ringed ends bound in thick rope.
 * - getPeonGoldSackTextures(): Bulging coarse burlap sack tied with cord, filled with glittering golden ore nuggets.
 */

const textureCache = new Map();

function createCanvas(width = 2048, height = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return { canvas, ctx, width, height };
}

function toTexture(canvas, isSRGB = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function drawRivet(ctx, cx, cy, radius = 12, isIron = true) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  if (isIron) {
    ringGrad.addColorStop(0, '#94a3b8');
    ringGrad.addColorStop(0.4, '#475569');
    ringGrad.addColorStop(0.8, '#1e293b');
    ringGrad.addColorStop(1, '#0f172a');
  } else {
    ringGrad.addColorStop(0, '#fcd34d');
    ringGrad.addColorStop(0.5, '#b45309');
    ringGrad.addColorStop(1, '#78350f');
  }
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isIron ? '#cbd5e1' : '#fef08a';
  ctx.beginPath();
  ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStitches(ctx, x1, y1, x2, y2, count = 12, threadColor = '#e2e8f0') {
  ctx.save();
  ctx.strokeStyle = threadColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const dx = (x2 - x1) / count;
  const dy = (y2 - y1) / count;
  const perpX = -dy * 0.45;
  const perpY = dx * 0.45;

  for (let i = 0; i <= count; i++) {
    const px = x1 + dx * i;
    const py = y1 + dy * i;
    ctx.beginPath();
    ctx.moveTo(px - perpX, py - perpY);
    ctx.lineTo(px + perpX, py + perpY);
    ctx.stroke();
  }
  ctx.restore();
}

// 1. PEON FACE
export function getPeonFaceTextures() {
  const cacheKey = 'peon_face';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Base vibrant green orc skin gradient
  const baseGrad = actx.createRadialGradient(1024, 1024, 200, 1024, 1024, 1100);
  baseGrad.addColorStop(0, '#84cc16'); // Bright lively lime/emerald
  baseGrad.addColorStop(0.5, '#65a30d');
  baseGrad.addColorStop(0.85, '#4d7c0f');
  baseGrad.addColorStop(1, '#365314');
  actx.fillStyle = baseGrad;
  actx.fillRect(0, 0, 2048, 2048);

  // Mottled skin spots & texture
  actx.fillStyle = 'rgba(35, 56, 22, 0.25)';
  for (let i = 0; i < 400; i++) {
    const rx = Math.random() * 2048;
    const ry = Math.random() * 2048;
    const r = 8 + Math.random() * 25;
    actx.beginPath();
    actx.arc(rx, ry, r, 0, Math.PI * 2);
    actx.fill();
  }

  // Furrowed brow / forehead wrinkles
  actx.strokeStyle = 'rgba(20, 32, 12, 0.7)';
  actx.lineWidth = 14;
  actx.lineCap = 'round';
  for (let y = 380; y <= 560; y += 45) {
    actx.beginPath();
    actx.moveTo(550, y + Math.sin(y * 0.05) * 20);
    actx.quadraticCurveTo(1024, y - 50, 1498, y + Math.sin(y * 0.05) * 20);
    actx.stroke();
  }

  // Piercing amber-yellow orc eyes with red veins
  [750, 1298].forEach(eyeX => {
    // Eye socket shadow
    actx.fillStyle = 'rgba(15, 25, 10, 0.75)';
    actx.beginPath();
    actx.arc(eyeX, 780, 130, 0, Math.PI * 2);
    actx.fill();

    // Sclera (yellowish red-rimmed)
    actx.fillStyle = '#fef08a';
    actx.beginPath();
    actx.ellipse(eyeX, 780, 85, 55, 0, 0, Math.PI * 2);
    actx.fill();

    // Iris (fiery orange amber)
    const irisGrad = actx.createRadialGradient(eyeX, 780, 10, eyeX, 780, 45);
    irisGrad.addColorStop(0, '#f97316');
    irisGrad.addColorStop(0.7, '#c2410c');
    irisGrad.addColorStop(1, '#7c2d12');
    actx.fillStyle = irisGrad;
    actx.beginPath();
    actx.arc(eyeX, 780, 42, 0, Math.PI * 2);
    actx.fill();

    // Slit/Punctured Pupil
    actx.fillStyle = '#0f172a';
    actx.beginPath();
    actx.ellipse(eyeX, 780, 16, 32, 0, 0, Math.PI * 2);
    actx.fill();

    // Specular shine
    actx.fillStyle = '#ffffff';
    actx.beginPath();
    actx.arc(eyeX - 14, 765, 12, 0, Math.PI * 2);
    actx.fill();
  });

  // Orc Nose (Broad, flared nostrils)
  actx.fillStyle = 'rgba(25, 40, 15, 0.6)';
  actx.beginPath();
  actx.arc(930, 980, 45, 0, Math.PI * 2);
  actx.arc(1118, 980, 45, 0, Math.PI * 2);
  actx.fill();

  // Fierce Lower Jaw & Tusks Area
  actx.fillStyle = 'rgba(18, 28, 12, 0.7)';
  actx.beginPath();
  actx.arc(1024, 1350, 240, 0, Math.PI);
  actx.fill();

  // Tusks (Ivory white with yellow gradient & dark base)
  [820, 1228].forEach(tuskX => {
    const isLeft = tuskX < 1024;
    const tuskGrad = actx.createLinearGradient(tuskX, 1500, isLeft ? tuskX - 60 : tuskX + 60, 1100);
    tuskGrad.addColorStop(0, '#a16207');
    tuskGrad.addColorStop(0.2, '#ca8a04');
    tuskGrad.addColorStop(0.6, '#fef08a');
    tuskGrad.addColorStop(1, '#ffffff');

    actx.fillStyle = tuskGrad;
    actx.beginPath();
    actx.moveTo(tuskX - 35, 1420);
    actx.lineTo(isLeft ? tuskX - 55 : tuskX + 55, 1140);
    actx.lineTo(tuskX + 35, 1420);
    actx.closePath();
    actx.fill();

    // Tusk shadow
    actx.strokeStyle = 'rgba(50, 40, 20, 0.6)';
    actx.lineWidth = 4;
    actx.stroke();
  });

  // Stubble & War Grimace
  actx.fillStyle = 'rgba(10, 20, 8, 0.35)';
  for (let i = 0; i < 500; i++) {
    const sx = 650 + Math.random() * 748;
    const sy = 1250 + Math.random() * 450;
    actx.fillRect(sx, sy, 4, 6);
  }

  // Roughness & Bump
  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#a3a3a3';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const bump = createCanvas(2048, 2048);
  bump.ctx.fillStyle = '#808080';
  bump.ctx.fillRect(0, 0, 2048, 2048);
  bump.ctx.drawImage(albedo.canvas, 0, 0);

  const tex = {
    map: toTexture(albedo.canvas, true),
    roughnessMap: toTexture(rough.canvas, false),
    bumpMap: toTexture(bump.canvas, false)
  };
  textureCache.set(cacheKey, tex);
  return tex;
}

// 2. PEON HARNESS & TUNIC
export function getPeonTunicHarnessTextures() {
  const cacheKey = 'peon_tunic_harness';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark coarse weathered burlap tunic
  actx.fillStyle = '#543d2b';
  actx.fillRect(0, 0, 2048, 2048);

  // Weave texture
  actx.fillStyle = 'rgba(40, 28, 18, 0.4)';
  for (let y = 0; y < 2048; y += 12) {
    actx.fillRect(0, y, 2048, 4);
  }
  for (let x = 0; x < 2048; x += 12) {
    actx.fillRect(x, 0, 4, 2048);
  }

  // Heavy raw leather shoulder straps (X-pattern harness)
  actx.fillStyle = '#3a2312';
  actx.fillRect(400, 0, 220, 2048);
  actx.fillRect(1428, 0, 220, 2048);

  // Harness borders & bevel
  actx.strokeStyle = '#22140a';
  actx.lineWidth = 10;
  actx.strokeRect(400, 0, 220, 2048);
  actx.strokeRect(1428, 0, 220, 2048);

  // Big heavy iron rivets on harness
  for (let y = 200; y < 2048; y += 350) {
    drawRivet(actx, 510, y, 22, true);
    drawRivet(actx, 1538, y, 22, true);
  }

  // Cross stitches on burlap
  drawStitches(actx, 200, 400, 200, 1600, 20, '#d1d5db');
  drawStitches(actx, 1848, 400, 1848, 1600, 20, '#d1d5db');

  // Heavy leather belt with rusted iron buckle
  actx.fillStyle = '#26180d';
  actx.fillRect(0, 1450, 2048, 300);
  actx.strokeStyle = '#120b06';
  actx.lineWidth = 14;
  actx.strokeRect(0, 1450, 2048, 300);

  // Iron buckle
  actx.fillStyle = '#475569';
  actx.fillRect(874, 1420, 300, 360);
  actx.fillStyle = '#1e293b';
  actx.fillRect(924, 1470, 200, 260);

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#94a3b8';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(874, 1420, 300, 360); // Iron buckle metallic

  const bump = createCanvas(2048, 2048);
  bump.ctx.fillStyle = '#808080';
  bump.ctx.fillRect(0, 0, 2048, 2048);
  bump.ctx.drawImage(albedo.canvas, 0, 0);

  const tex = {
    map: toTexture(albedo.canvas, true),
    roughnessMap: toTexture(rough.canvas, false),
    metalnessMap: toTexture(metal.canvas, false),
    bumpMap: toTexture(bump.canvas, false)
  };
  textureCache.set(cacheKey, tex);
  return tex;
}

// 3. PEON PANTS & BOOTS
export function getPeonPantsBootsTextures() {
  const cacheKey = 'peon_pants_boots';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Patchwork leather pants (upper half)
  actx.fillStyle = '#3f2d1e';
  actx.fillRect(0, 0, 2048, 1100);

  // Patches
  actx.fillStyle = '#5c3d24';
  actx.fillRect(250, 200, 450, 450);
  drawStitches(actx, 250, 200, 700, 200, 8, '#cbd5e1');
  drawStitches(actx, 700, 200, 700, 650, 8, '#cbd5e1');
  drawStitches(actx, 700, 650, 250, 650, 8, '#cbd5e1');
  drawStitches(actx, 250, 650, 250, 200, 8, '#cbd5e1');

  actx.fillStyle = '#2d1e13';
  actx.fillRect(1350, 350, 480, 500);
  drawStitches(actx, 1350, 350, 1830, 350, 9, '#cbd5e1');
  drawStitches(actx, 1830, 350, 1830, 850, 9, '#cbd5e1');
  drawStitches(actx, 1830, 850, 1350, 850, 9, '#cbd5e1');
  drawStitches(actx, 1350, 850, 1350, 350, 9, '#cbd5e1');

  // Boots (lower half)
  actx.fillStyle = '#1c130c';
  actx.fillRect(0, 1100, 2048, 948);

  // Fur cuffs
  actx.fillStyle = '#524538';
  actx.fillRect(0, 1100, 2048, 200);
  actx.fillStyle = 'rgba(20, 16, 12, 0.4)';
  for (let i = 0; i < 400; i++) {
    actx.fillRect(Math.random() * 2048, 1100 + Math.random() * 200, 6, 14);
  }

  // Iron toe caps
  actx.fillStyle = '#475569';
  actx.fillRect(200, 1750, 600, 298);
  actx.fillRect(1248, 1750, 600, 298);
  drawRivet(actx, 300, 1820, 18, true);
  drawRivet(actx, 700, 1820, 18, true);
  drawRivet(actx, 1348, 1820, 18, true);
  drawRivet(actx, 1748, 1820, 18, true);

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#858585';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#e2e8f0';
  metal.ctx.fillRect(200, 1750, 600, 298);
  metal.ctx.fillRect(1248, 1750, 600, 298);

  const bump = createCanvas(2048, 2048);
  bump.ctx.fillStyle = '#808080';
  bump.ctx.fillRect(0, 0, 2048, 2048);
  bump.ctx.drawImage(albedo.canvas, 0, 0);

  const tex = {
    map: toTexture(albedo.canvas, true),
    roughnessMap: toTexture(rough.canvas, false),
    metalnessMap: toTexture(metal.canvas, false),
    bumpMap: toTexture(bump.canvas, false)
  };
  textureCache.set(cacheKey, tex);
  return tex;
}

// 4. PEON TOOLS (Axe, Pickaxe, Hammer)
export function getPeonToolTextures() {
  const cacheKey = 'peon_tools';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Crude dark iron & chipped steel
  actx.fillStyle = '#334155';
  actx.fillRect(0, 0, 1024, 2048);

  // Sharp cutting bevel
  const bladeGrad = actx.createLinearGradient(0, 0, 600, 0);
  bladeGrad.addColorStop(0, '#e2e8f0');
  bladeGrad.addColorStop(0.3, '#94a3b8');
  bladeGrad.addColorStop(1, '#1e293b');
  actx.fillStyle = bladeGrad;
  actx.fillRect(0, 0, 450, 1200);

  // Wood handle with rawhide wrap (right half)
  actx.fillStyle = '#452a16';
  actx.fillRect(1024, 0, 1024, 2048);
  actx.fillStyle = '#6b4226';
  for (let y = 0; y < 2048; y += 40) {
    actx.fillRect(1024, y, 1024, 18);
  }

  // Criss-cross leather bindings
  actx.strokeStyle = '#29180b';
  actx.lineWidth = 14;
  for (let y = 0; y < 2048; y += 120) {
    actx.beginPath();
    actx.moveTo(1024, y);
    actx.lineTo(2048, y + 100);
    actx.moveTo(2048, y);
    actx.lineTo(1024, y + 100);
    actx.stroke();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#808080';
  rough.ctx.fillRect(0, 0, 2048, 2048);
  rough.ctx.fillStyle = '#333333';
  rough.ctx.fillRect(0, 0, 450, 1200); // Polished edge

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 1024, 2048); // Iron head is metal

  const bump = createCanvas(2048, 2048);
  bump.ctx.fillStyle = '#808080';
  bump.ctx.fillRect(0, 0, 2048, 2048);
  bump.ctx.drawImage(albedo.canvas, 0, 0);

  const tex = {
    map: toTexture(albedo.canvas, true),
    roughnessMap: toTexture(rough.canvas, false),
    metalnessMap: toTexture(metal.canvas, false),
    bumpMap: toTexture(bump.canvas, false)
  };
  textureCache.set(cacheKey, tex);
  return tex;
}
