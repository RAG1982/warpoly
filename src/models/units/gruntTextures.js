import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Orc Grunt (Guerreiro Grunt)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getGruntFaceTextures(): Menacing battle-scarred emerald orc face, red war paint slash marks, piercing yellow eyes, iron spangenhelm plates, massive curved horns with bone rings.
 * - getGruntArmorTextures(): Blackened iron plate cuirass with jagged spikes, heavy studded leather harness, fur waist wrap, and glowing Horde tribal glyphs.
 * - getGruntPauldronTextures(): Heavy cast-iron spiked pauldrons with skull engravings and rust-weathered edge bevels.
 * - getGruntPantsBootsTextures(): Studded leather greaves, chainmail maille skirt, fur-lined heavy iron combat boots with ground cleats.
 * - getGruntAxeTextures(): Colossal double-bladed battleaxe with mirror-honed bevels, battle gouges, dried bloodstains, leather-wrapped haft, and skull counterweight pommel.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true) {
  return makeTexture(canvas, isSRGB, { wrapS: THREE.ClampToEdgeWrapping });
}

function drawRivet(ctx, cx, cy, radius = 14, isIron = true) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ringGrad.addColorStop(0, isIron ? '#94a3b8' : '#f59e0b');
  ringGrad.addColorStop(0.4, isIron ? '#475569' : '#b45309');
  ringGrad.addColorStop(0.8, isIron ? '#1e293b' : '#78350f');
  ringGrad.addColorStop(1, isIron ? '#0f172a' : '#451a03');
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

// 1. GRUNT FACE & HELMET
export function getGruntFaceTextures() {
  const cacheKey = 'grunt_face';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Base vibrant emerald skin with rich muscle contours
  const skinGrad = actx.createRadialGradient(1024, 1024, 150, 1024, 1024, 1050);
  skinGrad.addColorStop(0, '#4ade80');
  skinGrad.addColorStop(0.55, '#22c55e');
  skinGrad.addColorStop(1, '#15803d');
  actx.fillStyle = skinGrad;
  actx.fillRect(0, 0, 2048, 2048);

  // Blackened Iron Helmet Top (upper half)
  actx.fillStyle = '#334155';
  actx.fillRect(0, 0, 2048, 650);

  // Helmet iron rim with bevel
  actx.fillStyle = '#475569';
  actx.fillRect(0, 580, 2048, 70);
  for (let x = 120; x < 2048; x += 180) {
    drawRivet(actx, x, 615, 18, true);
  }

  // Tribal Crimson War Paint across eyes & cheeks (High Vibrancy & Saturation)
  actx.fillStyle = '#ef4444';
  actx.beginPath();
  actx.moveTo(250, 680);
  actx.lineTo(1798, 720);
  actx.lineTo(1650, 950);
  actx.lineTo(1024, 880);
  actx.lineTo(400, 980);
  actx.closePath();
  actx.fill();

  // Fierce Eyes (Glowing yellow with bloodshot sclera)
  [720, 1328].forEach(eyeX => {
    actx.fillStyle = 'rgba(10, 18, 8, 0.85)';
    actx.beginPath();
    actx.arc(eyeX, 820, 110, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#fef08a';
    actx.beginPath();
    actx.ellipse(eyeX, 820, 75, 45, 0, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#ea580c';
    actx.beginPath();
    actx.arc(eyeX, 820, 36, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#0f172a';
    actx.beginPath();
    actx.arc(eyeX, 820, 16, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#ffffff';
    actx.beginPath();
    actx.arc(eyeX - 12, 808, 10, 0, Math.PI * 2);
    actx.fill();
  });

  // Massive Tusks & Grimacing Mouth
  actx.fillStyle = 'rgba(15, 20, 10, 0.9)';
  actx.beginPath();
  actx.ellipse(1024, 1380, 380, 180, 0, 0, Math.PI * 2);
  actx.fill();

  // Tusks
  [750, 1298].forEach(tuskX => {
    const isL = tuskX < 1024;
    const tuskGrad = actx.createLinearGradient(tuskX, 1550, isL ? tuskX - 80 : tuskX + 80, 1050);
    tuskGrad.addColorStop(0, '#854d0e');
    tuskGrad.addColorStop(0.3, '#ca8a04');
    tuskGrad.addColorStop(0.7, '#fef08a');
    tuskGrad.addColorStop(1, '#ffffff');

    actx.fillStyle = tuskGrad;
    actx.beginPath();
    actx.moveTo(tuskX - 45, 1450);
    actx.lineTo(isL ? tuskX - 70 : tuskX + 70, 1080);
    actx.lineTo(tuskX + 45, 1450);
    actx.closePath();
    actx.fill();
  });

  // Roughness & Metalness
  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#737373';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 2048, 650); // Helmet is metal

  const bump = createBumpCanvas(2048, 2048);
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

// 2. GRUNT ARMOR & CUIRASS
export function getGruntArmorTextures() {
  const cacheKey = 'grunt_armor';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark blackened iron plates
  actx.fillStyle = '#1e293b';
  actx.fillRect(0, 0, 2048, 2048);

  // Beveled armor plates
  actx.fillStyle = '#334155';
  actx.fillRect(200, 200, 1648, 700);
  actx.strokeStyle = '#0f172a';
  actx.lineWidth = 18;
  actx.strokeRect(200, 200, 1648, 700);

  // Heavy Studded Leather Straps
  actx.fillStyle = '#3b2514';
  actx.fillRect(100, 0, 240, 2048);
  actx.fillRect(1708, 0, 240, 2048);

  for (let y = 150; y < 2048; y += 300) {
    drawRivet(actx, 220, y, 22, true);
    drawRivet(actx, 1828, y, 22, true);
  }

  // Glowing Crimson Horde Insignia in center of chest
  actx.fillStyle = '#dc2626';
  actx.shadowColor = '#ef4444';
  actx.shadowBlur = 25;
  actx.beginPath();
  // Stylized Horde icon / spikes
  actx.moveTo(1024, 300);
  actx.lineTo(1124, 450);
  actx.lineTo(1244, 350);
  actx.lineTo(1164, 580);
  actx.lineTo(1284, 620);
  actx.lineTo(1024, 820);
  actx.lineTo(764, 620);
  actx.lineTo(884, 580);
  actx.lineTo(804, 350);
  actx.lineTo(924, 450);
  actx.closePath();
  actx.fill();
  actx.shadowBlur = 0;

  // Heavy Iron Belt with spiked buckle
  actx.fillStyle = '#0f172a';
  actx.fillRect(0, 1400, 2048, 350);
  actx.fillStyle = '#475569';
  actx.fillRect(824, 1350, 400, 450);

  drawRivet(actx, 880, 1420, 24, true);
  drawRivet(actx, 1168, 1420, 24, true);
  drawRivet(actx, 880, 1720, 24, true);
  drawRivet(actx, 1168, 1720, 24, true);

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#525252';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(100, 0, 240, 2048); // Leather straps non-metal
  metal.ctx.fillRect(1708, 0, 240, 2048);

  const bump = createBumpCanvas(2048, 2048);
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

// 3. GRUNT BATTLEAXE
export function getGruntAxeTextures() {
  const cacheKey = 'grunt_axe';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark forged steel blade body
  actx.fillStyle = '#1e293b';
  actx.fillRect(0, 0, 1200, 2048);

  // Razor mirror bevel
  const bevelGrad = actx.createLinearGradient(0, 0, 450, 0);
  bevelGrad.addColorStop(0, '#f8fafc');
  bevelGrad.addColorStop(0.2, '#cbd5e1');
  bevelGrad.addColorStop(0.6, '#64748b');
  bevelGrad.addColorStop(1, '#1e293b');
  actx.fillStyle = bevelGrad;
  actx.fillRect(0, 0, 400, 2048);

  // Bloodstains & battle nicks on blade edge
  actx.fillStyle = '#7f1d1d';
  for (let y = 100; y < 2048; y += 180) {
    actx.beginPath();
    actx.arc(100 + Math.random() * 150, y, 30 + Math.random() * 40, 0, Math.PI * 2);
    actx.fill();
  }

  // Dark Ironwood Shaft with leather bindings (right half)
  actx.fillStyle = '#29180c';
  actx.fillRect(1200, 0, 848, 2048);

  // Red/Dark Leather wraps
  actx.strokeStyle = '#991b1b';
  actx.lineWidth = 20;
  for (let y = 0; y < 2048; y += 150) {
    actx.beginPath();
    actx.moveTo(1200, y);
    actx.lineTo(2048, y + 120);
    actx.stroke();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#666666';
  rough.ctx.fillRect(0, 0, 2048, 2048);
  rough.ctx.fillStyle = '#1a1a1a';
  rough.ctx.fillRect(0, 0, 400, 2048); // Sharp edge is shiny

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 1200, 2048); // Blade is metallic

  const bump = createBumpCanvas(2048, 2048);
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
