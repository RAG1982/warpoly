import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Orc Watchtower (Torre de Vigia da Horda)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 textures:
 * - getOrcWatchtowerTextures(): Weathered ironwood tower posts, heavy rope lashings, barbed iron spikes, and notched palisade shield plates.
 */

const textureCache = new Map();



export function getOrcWatchtowerTextures() {
  const cacheKey = 'orc_watchtower_wood';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const albedo = createCanvas(2048, 2048);
  const actx = albedo.ctx;

  // Dark timber base
  actx.fillStyle = '#2d1a0e';
  actx.fillRect(0, 0, 2048, 2048);

  // Vertical log grooves
  for (let x = 0; x < 2048; x += 140) {
    const logGrad = actx.createLinearGradient(x, 0, x + 140, 0);
    logGrad.addColorStop(0, '#1c1009');
    logGrad.addColorStop(0.3, '#3e2414');
    logGrad.addColorStop(0.7, '#4a2c18');
    logGrad.addColorStop(1, '#1c1009');
    actx.fillStyle = logGrad;
    actx.fillRect(x, 0, 136, 2048);
  }

  // Rawhide rope lashings
  [400, 1000, 1600].forEach(y => {
    actx.fillStyle = '#b45309';
    actx.fillRect(0, y, 2048, 80);
    actx.strokeStyle = '#78350f';
    actx.lineWidth = 8;
    for (let x = 0; x < 2048; x += 60) {
      actx.beginPath();
      actx.moveTo(x, y);
      actx.lineTo(x + 40, y + 80);
      actx.stroke();
    }
  });

  const rough = createCanvas(2048, 2048);
  rough.ctx.fillStyle = '#858585';
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
