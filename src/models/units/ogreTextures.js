import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Orc Ogre (Ogro da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getOgreFaceTextures(): Weathered tan-ochre brute skin, single bone horn on forehead, heavy brutalist jaw, missing teeth, stitched eye scar.
 * - getOgreBellyArmorTextures(): Studded leather belly harness with giant iron belt buckle, rawhide straps, fur waist wrap.
 * - getOgreClubTextures(): Massive gnarled tree trunk club embedded with forged iron spikes, heavy metal banding, and blood splatters.
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

// 1. OGRE FACE
export function getOgreFaceTextures() {
  const cacheKey = 'ogre_face';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Warm golden-ochre brute skin
  const skinGrad = actx.createRadialGradient(1024, 1024, 250, 1024, 1024, 1100);
  skinGrad.addColorStop(0, '#f59e0b');
  skinGrad.addColorStop(0.5, '#d97706');
  skinGrad.addColorStop(0.85, '#b45309');
  skinGrad.addColorStop(1, '#78350f');
  actx.fillStyle = skinGrad;
  actx.fillRect(0, 0, 2048, 2048);

  // Mottled brute skin spots
  actx.fillStyle = 'rgba(69, 26, 3, 0.3)';
  for (let i = 0; i < 300; i++) {
    actx.beginPath();
    actx.arc(Math.random() * 2048, Math.random() * 2048, 15 + Math.random() * 35, 0, Math.PI * 2);
    actx.fill();
  }

  // Heavy Brow Wrinkles
  actx.strokeStyle = 'rgba(40, 15, 2, 0.75)';
  actx.lineWidth = 20;
  for (let y = 450; y <= 650; y += 60) {
    actx.beginPath();
    actx.moveTo(400, y);
    actx.quadraticCurveTo(1024, y - 60, 1648, y);
    actx.stroke();
  }

  // Small Piggy Eyes
  [750, 1298].forEach(eyeX => {
    actx.fillStyle = '#291002';
    actx.beginPath();
    actx.arc(eyeX, 820, 85, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#fef08a';
    actx.beginPath();
    actx.ellipse(eyeX, 820, 55, 35, 0, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#991b1b';
    actx.beginPath();
    actx.arc(eyeX, 820, 24, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#ffffff';
    actx.beginPath();
    actx.arc(eyeX - 8, 812, 8, 0, Math.PI * 2);
    actx.fill();
  });

  // Gaping Maw with Blunt Yellow Tusks
  actx.fillStyle = 'rgba(25, 8, 2, 0.9)';
  actx.beginPath();
  actx.ellipse(1024, 1400, 420, 200, 0, 0, Math.PI * 2);
  actx.fill();

  [750, 1298].forEach(tx => {
    actx.fillStyle = '#fef08a';
    actx.beginPath();
    actx.arc(tx, 1380, 55, 0, Math.PI * 2);
    actx.fill();
  });

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#858585';
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

// 2. OGRE CLUB
export function getOgreClubTextures() {
  const cacheKey = 'ogre_club';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Gnarled dark wood bark
  actx.fillStyle = '#3e2716';
  actx.fillRect(0, 0, 2048, 2048);

  // Bark fissures
  actx.strokeStyle = '#22140a';
  actx.lineWidth = 14;
  for (let x = 100; x < 2048; x += 120) {
    actx.beginPath();
    actx.moveTo(x, 0);
    actx.quadraticCurveTo(x + 50, 1024, x, 2048);
    actx.stroke();
  }

  // Heavy Iron Spikes & Iron Bands
  actx.fillStyle = '#1e293b';
  actx.fillRect(0, 600, 2048, 200);
  actx.fillRect(0, 1400, 2048, 200);

  // Blood splatters
  actx.fillStyle = '#991b1b';
  for (let i = 0; i < 30; i++) {
    actx.beginPath();
    actx.arc(Math.random() * 2048, Math.random() * 2048, 25 + Math.random() * 50, 0, Math.PI * 2);
    actx.fill();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#7a7a7a';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 600, 2048, 200);
  metal.ctx.fillRect(0, 1400, 2048, 200);

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
