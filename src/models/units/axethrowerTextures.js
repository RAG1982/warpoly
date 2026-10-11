import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Textura procedural do machado de arremesso (projétil, `ProjectileViews`): tomahawk de lâmina crescente de aço com canal de
 * sangue, cabo de freixo e tiras de couro vermelhas (2048x2048). F7-00b: o resto do arquivo (rosto, arnês e membros do troll)
 * serviu ao modelo procedural do Arremessador, removido; o modelo agora é o .glb do Blender.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true) {
  return makeTexture(canvas, isSRGB, { wrapS: THREE.ClampToEdgeWrapping });
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
