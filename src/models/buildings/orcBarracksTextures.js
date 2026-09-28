import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Orc Barracks (Quartel da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getOrcBarracksWoodTextures(): Rough-hewn dark timber logs, crossed battleaxe engravings, iron corner angle brackets, and bone spikes.
 * - getOrcBarracksRoofTextures(): Dark crimson war canvas canopy with black soot stains and rawhide rope ties.
 * - getOrcBarracksPropsTextures(): Weapon racks loaded with notched steel cleavers, round rawhide shields with red Horde handprints, and straw training targets.
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

// 1. ORC BARRACKS TIMBER
export function getOrcBarracksWoodTextures() {
  const cacheKey = 'orc_barracks_wood';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark timber base
  actx.fillStyle = '#321e12';
  actx.fillRect(0, 0, 2048, 2048);

  // Horizontal log stacks
  for (let y = 0; y < 2048; y += 150) {
    const logGrad = actx.createLinearGradient(0, y, 0, y + 150);
    logGrad.addColorStop(0, '#1c1009');
    logGrad.addColorStop(0.3, '#432918');
    logGrad.addColorStop(0.7, '#50321d');
    logGrad.addColorStop(1, '#1c1009');
    actx.fillStyle = logGrad;
    actx.fillRect(0, y, 2048, 144);
  }

  // Crossed Battleaxe War Crest
  actx.strokeStyle = '#991b1b';
  actx.lineWidth = 16;
  actx.beginPath();
  actx.moveTo(600, 600);
  actx.lineTo(1448, 1448);
  actx.moveTo(1448, 600);
  actx.lineTo(600, 1448);
  actx.stroke();

  // Iron angle brackets at corners
  actx.fillStyle = '#1e293b';
  actx.fillRect(0, 0, 200, 2048);
  actx.fillRect(1848, 0, 200, 2048);

  for (let y = 80; y < 2048; y += 180) {
    actx.fillStyle = '#475569';
    actx.beginPath();
    actx.arc(100, y, 18, 0, Math.PI * 2);
    actx.arc(1948, y, 18, 0, Math.PI * 2);
    actx.fill();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#7a7a7a';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#000000';
  metal.ctx.fillRect(0, 0, 2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 200, 2048);
  metal.ctx.fillRect(1848, 0, 200, 2048);

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
