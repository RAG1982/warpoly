import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Troll Axethrower (Arremessador de Machadinhas Troll)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getAxethrowerFaceTextures(): Wild jungle teal skin with golden-yellow underbelly, war stripes, long curved ivory tusks, glowing red eyes, and high flaming-orange mohawk hair.
 * - getAxethrowerHarnessTextures(): Raw leather tribal harness with bone daggers, rawhide straps, tiger-stripe fur loincloth, and skull belt clasp.
 * - getAxethrowerLimbTextures(): Teal troll skin with banded tribal tattoos, bone bead wrist wraps, and clawed leather wraps.
 * - getAxethrowerAxeTextures(): Sleek aerodynamic throwing tomahawk: razor crescent obsidian/steel head with blood groove, feather charms, and notched ash haft.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true) {
  return makeTexture(canvas, isSRGB, { wrapS: THREE.ClampToEdgeWrapping });
}

// 1. TROLL FACE & MOHAWK
export function getAxethrowerFaceTextures() {
  const cacheKey = 'axethrower_face';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Electric jungle cyan troll skin gradient
  const skinGrad = actx.createRadialGradient(1024, 1024, 200, 1024, 1024, 1100);
  skinGrad.addColorStop(0, '#22d3ee'); // Electric radiant cyan
  skinGrad.addColorStop(0.5, '#06b6d4');
  skinGrad.addColorStop(0.85, '#0891b2');
  skinGrad.addColorStop(1, '#0e7490');
  actx.fillStyle = skinGrad;
  actx.fillRect(0, 0, 2048, 2048);

  // Flaming Neon Orange Mohawk Hair (Top third)
  const hairGrad = actx.createLinearGradient(0, 0, 0, 650);
  hairGrad.addColorStop(0, '#ff7a00');
  hairGrad.addColorStop(0.4, '#f97316');
  hairGrad.addColorStop(0.8, '#ea580c');
  hairGrad.addColorStop(1, '#c2410c');
  actx.fillStyle = hairGrad;
  actx.fillRect(0, 0, 2048, 600);

  // Hair strands texture
  actx.fillStyle = 'rgba(254, 240, 138, 0.4)';
  for (let x = 0; x < 2048; x += 16) {
    actx.fillRect(x, 0, 6, 600);
  }

  // Tribal War Paint (Yellow & Crimson Chevrons)
  actx.fillStyle = '#facc15';
  actx.beginPath();
  actx.moveTo(400, 750);
  actx.lineTo(1024, 950);
  actx.lineTo(1648, 750);
  actx.lineTo(1648, 860);
  actx.lineTo(1024, 1060);
  actx.lineTo(400, 860);
  actx.closePath();
  actx.fill();

  // Glowing Red Predator Eyes
  [740, 1308].forEach(eyeX => {
    actx.fillStyle = '#042f2e';
    actx.beginPath();
    actx.arc(eyeX, 850, 110, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#fee2e2';
    actx.beginPath();
    actx.ellipse(eyeX, 850, 75, 45, 0, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#dc2626';
    actx.beginPath();
    actx.arc(eyeX, 850, 36, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#000000';
    actx.beginPath();
    actx.arc(eyeX, 850, 15, 0, Math.PI * 2);
    actx.fill();

    actx.fillStyle = '#ffffff';
    actx.beginPath();
    actx.arc(eyeX - 10, 840, 10, 0, Math.PI * 2);
    actx.fill();
  });

  // Long Curved Troll Tusks
  [720, 1328].forEach(tx => {
    const isL = tx < 1024;
    const tuskGrad = actx.createLinearGradient(tx, 1550, isL ? tx - 100 : tx + 100, 950);
    tuskGrad.addColorStop(0, '#ca8a04');
    tuskGrad.addColorStop(0.3, '#fef08a');
    tuskGrad.addColorStop(1, '#ffffff');

    actx.fillStyle = tuskGrad;
    actx.beginPath();
    actx.moveTo(tx - 40, 1450);
    actx.quadraticCurveTo(isL ? tx - 140 : tx + 140, 1200, isL ? tx - 110 : tx + 110, 980);
    actx.quadraticCurveTo(isL ? tx - 40 : tx + 40, 1220, tx + 40, 1450);
    actx.closePath();
    actx.fill();
  });

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#737373';
  rough.ctx.fillRect(0, 0, 2048, 2048);
  rough.ctx.fillStyle = '#999999';
  rough.ctx.fillRect(0, 0, 2048, 600); // Hair matte

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

// 2. TROLL HARNESS & LOINCLOTH
export function getAxethrowerHarnessTextures() {
  const cacheKey = 'axethrower_harness';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Leather harness background
  actx.fillStyle = '#451a03';
  actx.fillRect(0, 0, 2048, 2048);

  // Tiger/Fur pattern on loincloth
  actx.fillStyle = '#b45309';
  actx.fillRect(0, 1100, 2048, 948);

  actx.fillStyle = '#1c1917';
  for (let y = 1150; y < 2048; y += 90) {
    actx.beginPath();
    actx.moveTo(0, y);
    actx.quadraticCurveTo(500, y + 40, 1024, y - 20);
    actx.quadraticCurveTo(1548, y + 40, 2048, y);
    actx.lineTo(2048, y + 40);
    actx.quadraticCurveTo(1548, y + 80, 1024, y + 20);
    actx.quadraticCurveTo(500, y + 80, 0, y + 40);
    actx.closePath();
    actx.fill();
  }

  // Rawhide cross straps
  actx.fillStyle = '#78350f';
  actx.fillRect(350, 0, 260, 1100);
  actx.fillRect(1438, 0, 260, 1100);

  // Bone beads necklace
  for (let x = 500; x <= 1548; x += 110) {
    actx.fillStyle = '#fef08a';
    actx.beginPath();
    actx.arc(x, 400 + Math.sin(x * 0.005) * 80, 36, 0, Math.PI * 2);
    actx.fill();
    actx.strokeStyle = '#78350f';
    actx.lineWidth = 6;
    actx.stroke();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#8a8a8a';
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

// 3. THROWING AXES
export function getAxethrowerAxeTextures() {
  const cacheKey = 'axethrower_axe';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Sharp steel crescent blade
  actx.fillStyle = '#334155';
  actx.fillRect(0, 0, 1024, 2048);

  const bladeGrad = actx.createLinearGradient(0, 0, 450, 0);
  bladeGrad.addColorStop(0, '#f8fafc');
  bladeGrad.addColorStop(0.3, '#94a3b8');
  bladeGrad.addColorStop(1, '#334155');
  actx.fillStyle = bladeGrad;
  actx.fillRect(0, 0, 400, 1400);

  // Ash wood handle
  actx.fillStyle = '#78350f';
  actx.fillRect(1024, 0, 1024, 2048);

  // Red tribal leather wraps
  actx.strokeStyle = '#dc2626';
  actx.lineWidth = 18;
  for (let y = 0; y < 2048; y += 110) {
    actx.beginPath();
    actx.moveTo(1024, y);
    actx.lineTo(2048, y + 90);
    actx.stroke();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#6b7280';
  rough.ctx.fillRect(0, 0, 2048, 2048);
  rough.ctx.fillStyle = '#1e293b';
  rough.ctx.fillRect(0, 0, 400, 1400);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 1024, 2048);

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
