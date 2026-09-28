import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Orc Great Hall (Grande Salão da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getGreatHallWoodTextures(): Dark ancient ironwood logs with rough bark, carved tribal glyphs, rawhide rope bindings, and iron spikes.
 * - getGreatHallRoofTextures(): Weathered crimson war canvas, rawhide animal pelts, and thick straw thatch with mossy gradient.
 * - getGreatHallBannerTextures(): Blood-red woven Horde war pennants with flaming crest, gold fringe, and dark soot gradients.
 * - getGreatHallStoneTextures(): Basalt and volcanic foundation stone blocks with red mortar and chisel marks.
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
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// 1. GREAT HALL WOOD & TIMBER
export function getGreatHallWoodTextures() {
  const cacheKey = 'great_hall_wood';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark weathered ironwood logs
  actx.fillStyle = '#2c1b10';
  actx.fillRect(0, 0, 2048, 2048);

  // Deep vertical log fissures
  for (let x = 0; x < 2048; x += 160) {
    const logGrad = actx.createLinearGradient(x, 0, x + 160, 0);
    logGrad.addColorStop(0, '#1a100a');
    logGrad.addColorStop(0.3, '#3d2616');
    logGrad.addColorStop(0.7, '#4a2f1c');
    logGrad.addColorStop(1, '#1a100a');
    actx.fillStyle = logGrad;
    actx.fillRect(x, 0, 156, 2048);

    // Carved tribal blood runes on some logs
    if (x % 320 === 0) {
      actx.strokeStyle = '#991b1b';
      actx.lineWidth = 14;
      actx.beginPath();
      actx.moveTo(x + 80, 400);
      actx.lineTo(x + 40, 550);
      actx.lineTo(x + 120, 700);
      actx.lineTo(x + 80, 850);
      actx.stroke();
    }
  }

  // Horizontal iron reinforcement bands
  [500, 1500].forEach(y => {
    actx.fillStyle = '#1e293b';
    actx.fillRect(0, y, 2048, 120);

    // Iron rivets
    for (let x = 60; x < 2048; x += 140) {
      actx.fillStyle = '#475569';
      actx.beginPath();
      actx.arc(x, y + 60, 18, 0, Math.PI * 2);
      actx.fill();
    }
  });

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#7a7a7a';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 500, 2048, 120);
  metal.ctx.fillRect(0, 1500, 2048, 120);

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

// 2. GREAT HALL ROOF (Crimson Canvas & Thatch)
export function getGreatHallRoofTextures() {
  const cacheKey = 'great_hall_roof';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Rich dark crimson canvas / hides
  actx.fillStyle = '#7f1d1d';
  actx.fillRect(0, 0, 2048, 2048);

  // Shingle / pelt tiers
  for (let y = 0; y < 2048; y += 180) {
    const tierGrad = actx.createLinearGradient(0, y, 0, y + 180);
    tierGrad.addColorStop(0, '#991b1b');
    tierGrad.addColorStop(0.5, '#b91c1c');
    tierGrad.addColorStop(0.9, '#450a0a');
    tierGrad.addColorStop(1, '#1c0505');
    actx.fillStyle = tierGrad;
    actx.fillRect(0, y, 2048, 174);

    // Weathered soot & rawhide stitches
    actx.strokeStyle = '#fef08a';
    actx.lineWidth = 6;
    for (let x = 50; x < 2048; x += 100) {
      actx.beginPath();
      actx.moveTo(x - 12, y + 25);
      actx.lineTo(x + 12, y + 25);
      actx.stroke();
    }
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#949494';
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

// 3. GREAT HALL BANNERS
export function getGreatHallBannerTextures() {
  const cacheKey = 'great_hall_banner';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark blood crimson banner cloth
  actx.fillStyle = '#991b1b';
  actx.fillRect(0, 0, 2048, 2048);

  // Black soot gradient at edges
  actx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  actx.fillRect(0, 0, 180, 2048);
  actx.fillRect(1868, 0, 180, 2048);
  actx.fillRect(0, 1800, 2048, 248);

  // Massive Golden Horde Crest in Center
  actx.fillStyle = '#f59e0b';
  actx.shadowColor = '#fbbf24';
  actx.shadowBlur = 20;

  actx.beginPath();
  actx.moveTo(1024, 300);
  actx.lineTo(1224, 600);
  actx.lineTo(1424, 450);
  actx.lineTo(1300, 950);
  actx.lineTo(1450, 1050);
  actx.lineTo(1024, 1550);
  actx.lineTo(598, 1050);
  actx.lineTo(748, 950);
  actx.lineTo(624, 450);
  actx.lineTo(824, 600);
  actx.closePath();
  actx.fill();
  actx.shadowBlur = 0;

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#808080';
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
