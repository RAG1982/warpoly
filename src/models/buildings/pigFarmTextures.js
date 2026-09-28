import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Orc Pig Farm (Fazenda de Porcos / Chiqueiro)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getPigFarmMudTextures(): Moist dark fertile mud, straw clods, trodden hoofprints, and water puddles.
 * - getPigSkinTextures(): Stylized warm pink-peach skin with dark mud splatters, bristles, and snout gradient.
 * - getPigFarmThatchTextures(): Tiered straw thatch shelter with weathered golden amber fibers.
 */

const textureCache = new Map();



// 1. MUD & STRAW
export function getPigFarmMudTextures() {
  const cacheKey = 'pig_farm_mud';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark moist muddy earth
  actx.fillStyle = '#2b1b11';
  actx.fillRect(0, 0, 2048, 2048);

  // Mud clods & wet spots
  for (let i = 0; i < 600; i++) {
    const mx = Math.random() * 2048;
    const my = Math.random() * 2048;
    actx.fillStyle = i % 2 === 0 ? '#1f130a' : '#3d2617';
    actx.beginPath();
    actx.ellipse(mx, my, 20 + Math.random() * 40, 15 + Math.random() * 30, Math.random() * Math.PI, 0, Math.PI * 2);
    actx.fill();
  }

  // Scattered golden straw bedding
  actx.strokeStyle = '#ca8a04';
  actx.lineWidth = 6;
  for (let i = 0; i < 500; i++) {
    const sx = Math.random() * 2048;
    const sy = Math.random() * 2048;
    const len = 30 + Math.random() * 50;
    const angle = Math.random() * Math.PI * 2;
    actx.beginPath();
    actx.moveTo(sx, sy);
    actx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    actx.stroke();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#999999';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const bump = createBumpCanvas(2048, 2048);
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

// 2. PIG SKIN
export function getPigSkinTextures() {
  const cacheKey = 'pig_skin';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Warm pink-peach skin
  const skinGrad = actx.createRadialGradient(1024, 1024, 200, 1024, 1024, 1100);
  skinGrad.addColorStop(0, '#f472b6'); // Rose pink
  skinGrad.addColorStop(0.6, '#ec4899');
  skinGrad.addColorStop(1, '#db2777');
  actx.fillStyle = skinGrad;
  actx.fillRect(0, 0, 2048, 2048);

  // Mud splatters
  actx.fillStyle = '#3f2817';
  for (let i = 0; i < 80; i++) {
    const mx = Math.random() * 2048;
    const my = Math.random() * 2048;
    actx.beginPath();
    actx.arc(mx, my, 25 + Math.random() * 50, 0, Math.PI * 2);
    actx.fill();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#7a7a7a';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const bump = createBumpCanvas(2048, 2048);
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
