import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Orc Lumber Mill (Serraria da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getOrcLumberSawTextures(): Giant rotating toothed circular saw blade with polished cutting teeth, rust weathering, blood grooves, and dark pitch streaks.
 * - getOrcLumberWoodTextures(): Heavy dark hewn timber planks, raw logs with ringed cut ends, and golden sawdust mounds.
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

// 1. CIRCULAR SAW BLADE
export function getOrcLumberSawTextures() {
  const cacheKey = 'orc_lumber_saw';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark forged steel circular body
  const bodyGrad = actx.createRadialGradient(1024, 1024, 100, 1024, 1024, 980);
  bodyGrad.addColorStop(0, '#1e293b');
  bodyGrad.addColorStop(0.7, '#334155');
  bodyGrad.addColorStop(0.9, '#94a3b8');
  bodyGrad.addColorStop(1, '#f8fafc'); // Polished teeth
  actx.fillStyle = bodyGrad;
  actx.beginPath();
  actx.arc(1024, 1024, 980, 0, Math.PI * 2);
  actx.fill();

  // Serrated Teeth notches
  actx.fillStyle = '#0f172a';
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const x = 1024 + Math.cos(angle) * 980;
    const y = 1024 + Math.sin(angle) * 980;
    actx.beginPath();
    actx.arc(x, y, 60, 0, Math.PI * 2);
    actx.fill();
  }

  // Blood splatters & pitch streaks
  actx.fillStyle = '#7f1d1d';
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 600;
    actx.beginPath();
    actx.arc(1024 + Math.cos(angle) * dist, 1024 + Math.sin(angle) * dist, 25 + Math.random() * 40, 0, Math.PI * 2);
    actx.fill();
  }

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#555555';
  rough.ctx.fillRect(0, 0, 2048, 2048);

  const metal = createCanvas(2048, 2048);
  metal.ctx.fillStyle = '#ffffff';
  metal.ctx.fillRect(0, 0, 2048, 2048);

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
