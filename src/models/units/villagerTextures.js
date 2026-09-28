import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Villager (Aldeão)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch).
 * 
 * Generates 2048x2048 high-resolution textures tailored to each component:
 * - getVillagerFaceTextures(): Expressive, hardworking peasant face with friendly eyes, bushy eyebrows, stubble, ruddy cheeks, smile
 * - getVillagerCapTextures(): Peasant cloth coif / felt flat cap with stitched seams, leather brim band & brass grommets
 * - getVillagerTunicApronTextures(): Rustic woolen tunic (earthy ochre), heavy craftsman leather apron with stitching, brass buckle, tool loops
 * - getVillagerArmsGlovesTextures(): Rolled up tunic sleeves, tanned muscular forearms, oiled leather work gloves with stitched seams
 * - getVillagerPantsBootsTextures(): Patchwork trousers with knee reinforcements & cross-stitches, rugged cuffed leather boots with lug soles
 * - getVillagerAxeTextures(): Heavy forged carbon steel axe head with mirror-beveled cutting edge & nick marks, aged wood handle & leather wrap
 * - getVillagerPickaxeTextures(): Forged dark iron pickaxe head with polished chisel/pick tips, reinforced wood haft with iron bands
 * - getVillagerHammerTextures(): Builder's square-head steel hammer with cross-peen, octagonal wooden haft & side reinforcement plates
 * - getVillagerBackpackTextures(): Sturdy wood-and-leather cargo pack frame with canvas pack, straps, brass buckles & rolled bedroll
 * - getVillagerWoodBundleTextures(): Chopped logs with deep fissured tree bark, concentric end-grain growth rings & hemp rope binding
 * - getVillagerGoldSackTextures(): Heavy coarse burlap/hessian sack tied with cord, filled with glittering faceted raw gold nuggets
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true) {
  return makeTexture(canvas, isSRGB, { wrapS: THREE.ClampToEdgeWrapping });
}

/**
 * Draw stylized rivet / bolt with drop shadow, outer ring, and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  ctx.save();
  // Ambient drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  // Outer bevel ring
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  if (isGold) {
    ringGrad.addColorStop(0, '#fff4b8');
    ringGrad.addColorStop(0.3, '#f59e0b');
    ringGrad.addColorStop(0.7, '#d97706');
    ringGrad.addColorStop(1, '#78350f');
  } else {
    ringGrad.addColorStop(0, '#ffffff');
    ringGrad.addColorStop(0.3, '#cbd5e1');
    ringGrad.addColorStop(0.7, '#64748b');
    ringGrad.addColorStop(1, '#1e293b');
  }
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner specular dome
  const domeGrad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 1, cx, cy, radius * 0.85);
  if (isGold) {
    domeGrad.addColorStop(0, '#fffbeb');
    domeGrad.addColorStop(0.4, '#fbbf24');
    domeGrad.addColorStop(0.8, '#b45309');
    domeGrad.addColorStop(1, '#451a03');
  } else {
    domeGrad.addColorStop(0, '#ffffff');
    domeGrad.addColorStop(0.4, '#e2e8f0');
    domeGrad.addColorStop(0.8, '#94a3b8');
    domeGrad.addColorStop(1, '#334155');
  }
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw stylized running stitches along a line
 */
function drawStitches(ctx, x1, y1, x2, y2, stitchLen = 14, gap = 8, color = '#e2d4b7') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([stitchLen, gap]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Shadow under stitch
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 + 1, y1 + 1.5);
  ctx.lineTo(x2 + 1, y2 + 1.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw cross-stitch (X-stitches) for patches
 */
function drawCrossStitches(ctx, x1, y1, x2, y2, spacing = 28, size = 10, color = '#fef08a') {
  ctx.save();
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(dist / spacing));
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;

    // First stroke \
    ctx.beginPath();
    ctx.moveTo(px - size, py - size);
    ctx.lineTo(px + size, py + size);
    ctx.stroke();

    // Second stroke /
    ctx.beginPath();
    ctx.moveTo(px + size, py - size);
    ctx.lineTo(px - size, py + size);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Helper to draw procedural wood grain
 */
function drawWoodGrainTexture(ctx, x, y, w, h, baseDark = '#5c3317', baseLight = '#9e6231', grainDark = '#3d1f0c') {
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0.0, baseDark);
  grad.addColorStop(0.25, baseLight);
  grad.addColorStop(0.5, baseDark);
  grad.addColorStop(0.75, baseLight);
  grad.addColorStop(1.0, baseDark);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Growth ring lines & fiber waves
  ctx.strokeStyle = grainDark;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55;
  for (let ly = y; ly < y + h; ly += 24) {
    ctx.beginPath();
    ctx.moveTo(x, ly);
    for (let lx = x; lx < x + w; lx += 40) {
      const wave = Math.sin((lx * 0.04) + (ly * 0.02)) * 8;
      ctx.lineTo(lx, ly + wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ==========================================================================
   1. EXPRESSIVE PEASANT FACE & HAIR TEXTURES
   ========================================================================== */
export function getVillagerFaceTextures() {
  if (textureCache.has('face')) return textureCache.get('face');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Background: warm ambient shadow framing face under hat/cap
  const bgGrad = alb.createRadialGradient(W * 0.5, H * 0.48, 400, W * 0.5, H * 0.48, 900);
  bgGrad.addColorStop(0, '#f2b591');
  bgGrad.addColorStop(0.65, '#d68b60');
  bgGrad.addColorStop(0.9, '#a25934');
  bgGrad.addColorStop(1.0, '#38160a');
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Forehead & Face Core: warm, healthy ruddy peasant skin
  const faceGrad = alb.createRadialGradient(W * 0.5, H * 0.38, 100, W * 0.5, H * 0.45, 620);
  faceGrad.addColorStop(0.0, '#ffd8bd');
  faceGrad.addColorStop(0.35, '#f5ba95');
  faceGrad.addColorStop(0.7, '#df8f63');
  faceGrad.addColorStop(1.0, '#a6542f');
  alb.fillStyle = faceGrad;
  alb.beginPath();
  alb.ellipse(W * 0.5, H * 0.44, 620, 580, 0, 0, Math.PI * 2);
  alb.fill();

  // Rosy, hardworking peasant cheek blush
  [-320, 320].forEach(cx => {
    const blushGrad = alb.createRadialGradient(W * 0.5 + cx, H * 0.52, 20, W * 0.5 + cx, H * 0.52, 200);
    blushGrad.addColorStop(0.0, 'rgba(235, 87, 87, 0.42)');
    blushGrad.addColorStop(0.6, 'rgba(217, 72, 72, 0.18)');
    blushGrad.addColorStop(1.0, 'rgba(217, 72, 72, 0.0)');
    alb.fillStyle = blushGrad;
    alb.beginPath();
    alb.arc(W * 0.5 + cx, H * 0.52, 200, 0, Math.PI * 2);
    alb.fill();
  });

  // Forehead worry / hardworking furrow lines
  alb.strokeStyle = 'rgba(125, 52, 22, 0.35)';
  alb.lineWidth = 5;
  alb.beginPath();
  alb.arc(W * 0.5, H * 0.18, 220, Math.PI * 0.22, Math.PI * 0.78);
  alb.stroke();
  alb.beginPath();
  alb.arc(W * 0.5, H * 0.22, 170, Math.PI * 0.25, Math.PI * 0.75);
  alb.stroke();

  // Friendly, expressive eyes & bushy peasant eyebrows
  const eyeY = H * 0.38;
  [-290, 290].forEach(eyeOffset => {
    const ex = W * 0.5 + eyeOffset;

    // Eyebrows (Thick, bushy, slightly arched, warm dark-brown)
    alb.fillStyle = '#4a2810';
    alb.beginPath();
    alb.ellipse(ex, eyeY - 110, 180, 55, eyeOffset > 0 ? 0.08 : -0.08, 0, Math.PI * 2);
    alb.fill();

    // Individual eyebrow hair strands
    alb.strokeStyle = '#6b3e1c';
    alb.lineWidth = 4;
    for (let s = -130; s <= 130; s += 25) {
      alb.beginPath();
      alb.moveTo(ex + s, eyeY - 100);
      alb.lineTo(ex + s + (eyeOffset > 0 ? 15 : -15), eyeY - 135);
      alb.stroke();
    }

    // Eye socket shadow
    alb.fillStyle = 'rgba(120, 50, 20, 0.4)';
    alb.beginPath();
    alb.ellipse(ex, eyeY, 130, 72, 0, 0, Math.PI * 2);
    alb.fill();

    // Sclera (Eye white with soft warm ambient tone)
    alb.fillStyle = '#fffbf5';
    alb.beginPath();
    alb.ellipse(ex, eyeY, 95, 52, 0, 0, Math.PI * 2);
    alb.fill();

    // Iris (Warm, friendly hazel / amber-brown eyes)
    alb.fillStyle = '#45220a';
    alb.beginPath();
    alb.arc(ex, eyeY, 46, 0, Math.PI * 2);
    alb.fill();

    alb.fillStyle = '#b45309';
    alb.beginPath();
    alb.arc(ex, eyeY, 34, 0, Math.PI * 2);
    alb.fill();

    alb.fillStyle = '#f59e0b';
    alb.beginPath();
    alb.arc(ex, eyeY, 20, 0, Math.PI * 2);
    alb.fill();

    // Pupil
    alb.fillStyle = '#110c08';
    alb.beginPath();
    alb.arc(ex, eyeY, 18, 0, Math.PI * 2);
    alb.fill();

    // Specular Catchlights (Crisp friendly gleam in eyes)
    alb.fillStyle = '#ffffff';
    alb.beginPath();
    alb.arc(ex - 12, eyeY - 12, 10, 0, Math.PI * 2);
    alb.fill();
    alb.beginPath();
    alb.arc(ex + 10, eyeY + 10, 5, 0, Math.PI * 2);
    alb.fill();

    // Upper eyelid crease
    alb.strokeStyle = '#381608';
    alb.lineWidth = 8;
    alb.beginPath();
    alb.arc(ex, eyeY, 98, Math.PI * 1.15, Math.PI * 1.85);
    alb.stroke();

    // Lower eyelid subtle line
    alb.strokeStyle = 'rgba(125, 50, 20, 0.4)';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.arc(ex, eyeY + 4, 95, Math.PI * 0.15, Math.PI * 0.85);
    alb.stroke();
  });

  // Nose Bridge & Tip with warm highlight
  const noseGrad = alb.createLinearGradient(W * 0.5 - 60, H * 0.35, W * 0.5 + 60, H * 0.60);
  noseGrad.addColorStop(0.0, '#f5ba95');
  noseGrad.addColorStop(0.5, '#ffd8bd');
  noseGrad.addColorStop(1.0, '#df8f63');
  alb.fillStyle = noseGrad;
  alb.beginPath();
  alb.moveTo(W * 0.5 - 45, H * 0.35);
  alb.lineTo(W * 0.5 + 45, H * 0.35);
  alb.lineTo(W * 0.5 + 75, H * 0.58);
  alb.lineTo(W * 0.5 - 75, H * 0.58);
  alb.closePath();
  alb.fill();

  // Bulbous, stylized nose tip & nostrils
  alb.fillStyle = '#ea8b60';
  alb.beginPath();
  alb.arc(W * 0.5, H * 0.58, 65, 0, Math.PI * 2);
  alb.fill();
  alb.fillStyle = '#ffffff';
  alb.globalAlpha = 0.35;
  alb.beginPath();
  alb.arc(W * 0.5 - 12, H * 0.57, 24, 0, Math.PI * 2);
  alb.fill();
  alb.globalAlpha = 1.0;

  // Nostrils
  [-45, 45].forEach(nx => {
    alb.fillStyle = '#4a1e0b';
    alb.beginPath();
    alb.ellipse(W * 0.5 + nx, H * 0.60, 22, 14, nx > 0 ? 0.3 : -0.3, 0, Math.PI * 2);
    alb.fill();
  });

  // Rugged Five-o'clock Shadow / Stubble along jaw and chin
  alb.fillStyle = 'rgba(60, 32, 18, 0.42)';
  alb.beginPath();
  alb.ellipse(W * 0.5, H * 0.76, 420, 210, 0, 0, Math.PI);
  alb.fill();

  // Stipple dots for stubble
  alb.fillStyle = 'rgba(40, 20, 10, 0.55)';
  for (let i = 0; i < 350; i++) {
    const rx = W * 0.5 + (Math.random() - 0.5) * 650;
    const ry = H * 0.67 + Math.random() * 260;
    alb.beginPath();
    alb.arc(rx, ry, 2.5 + Math.random() * 2.5, 0, Math.PI * 2);
    alb.fill();
  }

  // Friendly Peasant Smile & Warm Lips
  alb.strokeStyle = '#3a1306';
  alb.lineWidth = 9;
  alb.beginPath();
  alb.moveTo(W * 0.5 - 140, H * 0.72);
  alb.quadraticCurveTo(W * 0.5, H * 0.78, W * 0.5 + 140, H * 0.72);
  alb.stroke();

  // Dimples & laugh lines (Nasolabial folds)
  [-140, 140].forEach(dx => {
    alb.strokeStyle = 'rgba(110, 40, 15, 0.45)';
    alb.lineWidth = 6;
    alb.beginPath();
    alb.moveTo(W * 0.5 + dx, H * 0.71);
    alb.quadraticCurveTo(W * 0.5 + dx * 0.85, H * 0.65, W * 0.5 + dx * 0.6, H * 0.60);
    alb.stroke();
  });

  // Lower lip fullness
  alb.fillStyle = '#c7664c';
  alb.beginPath();
  alb.ellipse(W * 0.5, H * 0.74, 90, 28, 0, 0, Math.PI);
  alb.fill();

  // Hair peeking from sides
  alb.fillStyle = '#4a2810';
  alb.beginPath();
  alb.ellipse(W * 0.15, H * 0.5, 120, 240, 0, 0, Math.PI * 2);
  alb.ellipse(W * 0.85, H * 0.5, 120, 240, 0, 0, Math.PI * 2);
  alb.fill();

  // --- Roughness Map ---
  rgh.fillStyle = '#b0b0b0'; // skin roughness ~0.69
  rgh.fillRect(0, 0, W, H);
  // Cornea shiny ~0.10
  [-290, 290].forEach(eyeOffset => {
    rgh.fillStyle = '#1a1a1a';
    rgh.beginPath();
    rgh.arc(W * 0.5 + eyeOffset, eyeY, 46, 0, Math.PI * 2);
    rgh.fill();
  });
  // Lips smoother ~0.50
  rgh.fillStyle = '#808080';
  rgh.beginPath();
  rgh.ellipse(W * 0.5, H * 0.74, 100, 35, 0, 0, Math.PI * 2);
  rgh.fill();

  // --- Metalness Map (Skin is 0.0) ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  // Nose height
  bmp.fillStyle = '#c8c8c8';
  bmp.beginPath();
  bmp.arc(W * 0.5, H * 0.58, 65, 0, Math.PI * 2);
  bmp.fill();
  // Brow ridge
  bmp.fillStyle = '#a8a8a8';
  bmp.beginPath();
  bmp.ellipse(W * 0.5, eyeY - 110, 480, 50, 0, 0, Math.PI * 2);
  bmp.fill();
  // Smile depth
  bmp.fillStyle = '#454545';
  bmp.beginPath();
  bmp.ellipse(W * 0.5, H * 0.73, 110, 10, 0, 0, Math.PI * 2);
  bmp.fill();

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('face', set);
  return set;
}

/* ==========================================================================
   2. PEASANT CLOTH COIF / CAP TEXTURES
   ========================================================================== */
export function getVillagerCapTextures() {
  if (textureCache.has('cap')) return textureCache.get('cap');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Rustic burnt-umber / earthy woolen felt fabric
  const capGrad = alb.createLinearGradient(0, 0, 0, H);
  capGrad.addColorStop(0.0, '#78350f'); // warm russet brown
  capGrad.addColorStop(0.3, '#572608');
  capGrad.addColorStop(0.7, '#3d1a06');
  capGrad.addColorStop(1.0, '#261104');
  alb.fillStyle = capGrad;
  alb.fillRect(0, 0, W, H);

  // Woven fabric texture cross-hatching
  alb.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let x = 0; x < W; x += 12) {
    alb.fillRect(x, 0, 4, H);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let y = 0; y < H; y += 12) {
    alb.fillRect(0, y, W, 4);
  }

  // Peasant cap crown seams (quartering seams meeting at top center)
  alb.strokeStyle = '#1a0b03';
  alb.lineWidth = 12;
  alb.beginPath();
  alb.moveTo(W * 0.5, 0);
  alb.lineTo(W * 0.5, H);
  alb.moveTo(0, H * 0.5);
  alb.lineTo(W, H * 0.5);
  alb.stroke();

  // Hand-sewn hemp stitches along seams
  drawStitches(alb, W * 0.48, 40, W * 0.48, H - 40, 20, 14, '#e2d4b7');
  drawStitches(alb, W * 0.52, 40, W * 0.52, H - 40, 20, 14, '#e2d4b7');
  drawStitches(alb, 40, H * 0.48, W - 40, H * 0.48, 20, 14, '#e2d4b7');
  drawStitches(alb, 40, H * 0.52, W - 40, H * 0.52, 20, 14, '#e2d4b7');

  // Bottom folded leather brim band
  const brimGrad = alb.createLinearGradient(0, H - 220, 0, H);
  brimGrad.addColorStop(0.0, '#3d1e0c');
  brimGrad.addColorStop(0.5, '#5c3016');
  brimGrad.addColorStop(1.0, '#241005');
  alb.fillStyle = brimGrad;
  alb.fillRect(0, H - 220, W, 220);

  drawStitches(alb, 10, H - 200, W - 10, H - 200, 18, 10, '#d4a373');
  drawStitches(alb, 10, H - 25, W - 10, H - 25, 18, 10, '#d4a373');

  // Brass grommets / rivets around brim band
  for (let bx = 160; bx < W; bx += 280) {
    drawRivet(alb, bx, H - 110, 18, true);
  }

  // --- Roughness Map ---
  rgh.fillStyle = '#dedede'; // Felt cloth ~0.87
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#999999'; // Leather brim ~0.60
  rgh.fillRect(0, H - 220, W, 220);
  for (let bx = 160; bx < W; bx += 280) {
    rgh.fillStyle = '#404040'; // Brass ~0.25
    rgh.beginPath();
    rgh.arc(bx, H - 110, 18, 0, Math.PI * 2);
    rgh.fill();
  }

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  for (let bx = 160; bx < W; bx += 280) {
    met.fillStyle = '#e6e6e6'; // Brass ~0.90
    met.beginPath();
    met.arc(bx, H - 110, 18, 0, Math.PI * 2);
    met.fill();
  }

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#505050';
  bmp.fillRect(W * 0.49, 0, W * 0.02, H);
  bmp.fillRect(0, H * 0.49, W, H * 0.02);
  bmp.fillStyle = '#a8a8a8';
  bmp.fillRect(0, H - 220, W, 220);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('cap', set);
  return set;
}

/* ==========================================================================
   3. RUSTIC WOOLEN TUNIC & LEATHER CRAFTSMAN APRON TEXTURES
   ========================================================================== */
export function getVillagerTunicApronTextures() {
  if (textureCache.has('tunicApron')) return textureCache.get('tunicApron');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // 1. Tunic Foundation: Earthy mustard / ochre yellow woolen cloth
  const tunicGrad = alb.createLinearGradient(0, 0, 0, H);
  tunicGrad.addColorStop(0.0, '#d97706'); // warm golden amber
  tunicGrad.addColorStop(0.4, '#b45309'); // earthy rich ochre
  tunicGrad.addColorStop(0.8, '#92400e');
  tunicGrad.addColorStop(1.0, '#78350f');
  alb.fillStyle = tunicGrad;
  alb.fillRect(0, 0, W, H);

  // Woolen cross-weave micro-texture
  alb.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let x = 0; x < W; x += 10) {
    alb.fillRect(x, 0, 3, H);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = 0; y < H; y += 10) {
    alb.fillRect(0, y, W, 3);
  }

  // Tunic Open V-Neck Collar Hem at top center
  alb.fillStyle = '#ffd8bd'; // exposed neck skin peeking out
  alb.beginPath();
  alb.moveTo(W * 0.40, 0);
  alb.lineTo(W * 0.60, 0);
  alb.lineTo(W * 0.50, H * 0.16);
  alb.closePath();
  alb.fill();

  // Collar fabric trim borders
  alb.strokeStyle = '#451a03';
  alb.lineWidth = 14;
  alb.beginPath();
  alb.moveTo(W * 0.38, 0);
  alb.lineTo(W * 0.50, H * 0.17);
  alb.lineTo(W * 0.62, 0);
  alb.stroke();

  // 2. Leather Craftsman Apron: Covering front torso from chest to lower hem
  const apronX = W * 0.18;
  const apronW = W * 0.64;
  const apronY = H * 0.20;
  const apronH = H * 0.76;

  // Drop shadow of apron against tunic
  alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
  alb.fillRect(apronX - 12, apronY + 10, apronW + 24, apronH);

  // Apron leather gradient: rich, weathered saddle-brown cowhide
  const apronGrad = alb.createLinearGradient(apronX, apronY, apronX + apronW, apronY + apronH);
  apronGrad.addColorStop(0.0, '#5a2e14');
  apronGrad.addColorStop(0.2, '#703a19');
  apronGrad.addColorStop(0.6, '#4e250e');
  apronGrad.addColorStop(1.0, '#361808');
  alb.fillStyle = apronGrad;
  alb.fillRect(apronX, apronY, apronW, apronH);

  // Apron edge bevel highlights & shadow crevices
  alb.strokeStyle = '#935128'; // light top bevel highlight
  alb.lineWidth = 6;
  alb.strokeRect(apronX + 4, apronY + 4, apronW - 8, apronH - 8);

  alb.strokeStyle = '#1f0d05'; // dark inner shadow
  alb.lineWidth = 4;
  alb.strokeRect(apronX + 10, apronY + 10, apronW - 20, apronH - 20);

  // Contrast hand-stitched borders around apron perimeter
  drawStitches(alb, apronX + 16, apronY + 16, apronX + apronW - 16, apronY + 16, 20, 12, '#fde68a');
  drawStitches(alb, apronX + apronW - 16, apronY + 16, apronX + apronW - 16, apronY + apronH - 16, 20, 12, '#fde68a');
  drawStitches(alb, apronX + apronW - 16, apronY + apronH - 16, apronX + 16, apronY + apronH - 16, 20, 12, '#fde68a');
  drawStitches(alb, apronX + 16, apronY + apronH - 16, apronX + 16, apronY + 16, 20, 12, '#fde68a');

  // Apron Shoulder Straps with Brass Buckles & Rivets
  [-1, 1].forEach(dir => {
    const sx = dir === -1 ? apronX + 60 : apronX + apronW - 140;
    // Leather strap going up over shoulder
    alb.fillStyle = '#3a1a08';
    alb.fillRect(sx, 0, 80, apronY + 40);

    // Stitches on strap
    drawStitches(alb, sx + 8, 0, sx + 8, apronY + 30, 16, 10, '#fde68a');
    drawStitches(alb, sx + 72, 0, sx + 72, apronY + 30, 16, 10, '#fde68a');

    // Brass buckle connecting strap to bib
    alb.fillStyle = 'rgba(0, 0, 0, 0.4)';
    alb.fillRect(sx - 10, apronY - 10, 100, 50);

    const bGrad = alb.createLinearGradient(sx, apronY, sx + 80, apronY + 40);
    bGrad.addColorStop(0.0, '#fef08a');
    bGrad.addColorStop(0.4, '#f59e0b');
    bGrad.addColorStop(0.8, '#b45309');
    bGrad.addColorStop(1.0, '#78350f');
    alb.fillStyle = bGrad;
    alb.fillRect(sx - 8, apronY - 8, 96, 46);

    // Cutout in buckle
    alb.fillStyle = '#3a1a08';
    alb.fillRect(sx + 10, apronY + 2, 60, 26);

    // Center brass prong
    alb.fillStyle = '#fef08a';
    alb.fillRect(sx + 36, apronY - 6, 8, 42);

    // Rivet under buckle
    drawRivet(alb, sx + 40, apronY + 70, 14, true);
  });

  // Front Utility Craftsman Pocket on Apron
  const pockX = apronX + 120;
  const pockY = apronY + 280;
  const pockW = apronW - 240;
  const pockH = 260;

  alb.fillStyle = 'rgba(0, 0, 0, 0.4)';
  alb.fillRect(pockX - 6, pockY + 6, pockW + 12, pockH);

  alb.fillStyle = '#643214';
  alb.fillRect(pockX, pockY, pockW, pockH);
  alb.strokeStyle = '#8c4820';
  alb.lineWidth = 5;
  alb.strokeRect(pockX, pockY, pockW, pockH);

  // Pocket double stitching
  drawStitches(alb, pockX + 12, pockY + 12, pockX + pockW - 12, pockY + 12, 16, 10, '#fde68a');
  drawStitches(alb, pockX + pockW - 12, pockY + 12, pockX + pockW - 12, pockY + pockH - 12, 16, 10, '#fde68a');
  drawStitches(alb, pockX + pockW - 12, pockY + pockH - 12, pockX + 12, pockY + pockH - 12, 16, 10, '#fde68a');
  drawStitches(alb, pockX + 12, pockY + pockH - 12, pockX + 12, pockY + 12, 16, 10, '#fde68a');

  // Center seam dividing pocket into two tool slots
  drawStitches(alb, pockX + pockW * 0.5, pockY + 10, pockX + pockW * 0.5, pockY + pockH - 10, 16, 8, '#fde68a');
  drawRivet(alb, pockX + 14, pockY + 14, 10, true);
  drawRivet(alb, pockX + pockW - 14, pockY + 14, 10, true);
  drawRivet(alb, pockX + pockW * 0.5, pockY + 14, 10, true);

  // Craftsman Tool Loops on Apron Sides
  [-1, 1].forEach(dir => {
    const lx = dir === -1 ? apronX + 30 : apronX + apronW - 90;
    const ly = apronY + 340;
    alb.fillStyle = '#2c1205';
    alb.fillRect(lx, ly, 60, 140);
    alb.strokeStyle = '#854218';
    alb.lineWidth = 4;
    alb.strokeRect(lx, ly, 60, 140);
    drawRivet(alb, lx + 30, ly + 20, 10, true);
    drawRivet(alb, lx + 30, ly + 120, 10, true);
  });

  // Heavy Leather Waist Belt over Apron
  const beltY = H * 0.74;
  const beltH = 130;
  alb.fillStyle = 'rgba(0, 0, 0, 0.55)';
  alb.fillRect(0, beltY + 8, W, beltH);

  const beltGrad = alb.createLinearGradient(0, beltY, 0, beltY + beltH);
  beltGrad.addColorStop(0.0, '#2d1406');
  beltGrad.addColorStop(0.5, '#45200c');
  beltGrad.addColorStop(1.0, '#1c0c03');
  alb.fillStyle = beltGrad;
  alb.fillRect(0, beltY, W, beltH);

  drawStitches(alb, 10, beltY + 12, W - 10, beltY + 12, 18, 10, '#fde68a');
  drawStitches(alb, 10, beltY + beltH - 12, W - 10, beltY + beltH - 12, 18, 10, '#fde68a');

  // Large Heavy Brass Belt Buckle at Center
  const bkW = 240;
  const bkH = 170;
  const bkX = (W - bkW) * 0.5;
  const bkY = beltY - 20;

  alb.fillStyle = 'rgba(0, 0, 0, 0.6)';
  alb.fillRect(bkX - 10, bkY + 12, bkW + 20, bkH);

  const brassGrad = alb.createLinearGradient(bkX, bkY, bkX + bkW, bkY + bkH);
  brassGrad.addColorStop(0.0, '#fffbeb');
  brassGrad.addColorStop(0.3, '#f59e0b');
  brassGrad.addColorStop(0.7, '#d97706');
  brassGrad.addColorStop(1.0, '#78350f');
  alb.fillStyle = brassGrad;
  alb.fillRect(bkX, bkY, bkW, bkH);

  // Inner cutout of buckle
  alb.fillStyle = '#2d1406';
  alb.fillRect(bkX + 36, bkY + 32, bkW - 72, bkH - 64);

  // Buckle center prong
  alb.fillStyle = '#fff4b8';
  alb.fillRect(bkX + bkW * 0.5 - 10, bkY + 20, 20, bkH - 40);

  // Belt notch holes to right of buckle
  for (let hx = bkX + bkW + 50; hx < W - 80; hx += 90) {
    alb.fillStyle = '#0a0402';
    alb.beginPath();
    alb.arc(hx, beltY + beltH * 0.5, 12, 0, Math.PI * 2);
    alb.fill();
    alb.strokeStyle = '#d97706';
    alb.lineWidth = 4;
    alb.stroke();
  }

  // --- Roughness Map ---
  rgh.fillStyle = '#dcdcdc'; // Tunic cloth ~0.86
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#969696'; // Leather apron ~0.59
  rgh.fillRect(apronX, apronY, apronW, apronH);
  rgh.fillStyle = '#808080'; // Belt ~0.50
  rgh.fillRect(0, beltY, W, beltH);
  rgh.fillStyle = '#404040'; // Brass buckle ~0.25
  rgh.fillRect(bkX, bkY, bkW, bkH);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e6e6e6'; // Brass buckle ~0.90
  met.fillRect(bkX, bkY, bkW, bkH);
  [-1, 1].forEach(dir => {
    const sx = dir === -1 ? apronX + 60 : apronX + apronW - 140;
    met.fillRect(sx - 8, apronY - 8, 96, 46);
  });

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#a0a0a0';
  bmp.fillRect(apronX, apronY, apronW, apronH);
  bmp.fillStyle = '#b8b8b8';
  bmp.fillRect(pockX, pockY, pockW, pockH);
  bmp.fillStyle = '#b0b0b0';
  bmp.fillRect(0, beltY, W, beltH);
  bmp.fillStyle = '#e0e0e0';
  bmp.fillRect(bkX, bkY, bkW, bkH);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('tunicApron', set);
  return set;
}

/* ==========================================================================
   4. ROLLED SLEEVES, SKIN SHADING & LEATHER WORK GLOVES TEXTURES
   ========================================================================== */
export function getVillagerArmsGlovesTextures() {
  if (textureCache.has('armsGloves')) return textureCache.get('armsGloves');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Upper section: Rolled Up Tunic Sleeves (Earthy ochre woolen cloth)
  const rollH = H * 0.35;
  const sleeveGrad = alb.createLinearGradient(0, 0, 0, rollH);
  sleeveGrad.addColorStop(0.0, '#b45309');
  sleeveGrad.addColorStop(0.6, '#92400e');
  sleeveGrad.addColorStop(1.0, '#78350f');
  alb.fillStyle = sleeveGrad;
  alb.fillRect(0, 0, W, rollH);

  // Rolled cuff fold highlight & shadow
  alb.fillStyle = 'rgba(255, 255, 255, 0.12)';
  alb.fillRect(0, rollH - 90, W, 40);
  alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
  alb.fillRect(0, rollH - 20, W, 20);
  drawStitches(alb, 20, rollH - 60, W - 20, rollH - 60, 18, 12, '#fde68a');

  // Middle section: Weathered Muscular Bare Forearms (Tanned skin)
  const skinH = H * 0.30;
  const skinY = rollH;
  const armGrad = alb.createLinearGradient(0, skinY, 0, skinY + skinH);
  armGrad.addColorStop(0.0, '#d9885c');
  armGrad.addColorStop(0.4, '#ea9f77');
  armGrad.addColorStop(0.8, '#c9784c');
  armGrad.addColorStop(1.0, '#9e5630');
  alb.fillStyle = armGrad;
  alb.fillRect(0, skinY, W, skinH);

  // Muscle tendon & vein shading
  alb.strokeStyle = 'rgba(120, 50, 20, 0.35)';
  alb.lineWidth = 8;
  alb.beginPath();
  alb.moveTo(W * 0.45, skinY + 20);
  alb.lineTo(W * 0.48, skinY + skinH - 20);
  alb.stroke();

  // Fine arm hair stippling
  alb.fillStyle = 'rgba(60, 30, 15, 0.35)';
  for (let i = 0; i < 200; i++) {
    alb.fillRect(Math.random() * W, skinY + Math.random() * skinH, 2, 4);
  }

  // Lower section: Heavy Oiled Craftsman Leather Work Gloves
  const gloveY = skinY + skinH;
  const gloveH = H - gloveY;
  const gloveGrad = alb.createLinearGradient(0, gloveY, 0, H);
  gloveGrad.addColorStop(0.0, '#542a12');
  gloveGrad.addColorStop(0.3, '#6e3818');
  gloveGrad.addColorStop(0.7, '#44200d');
  gloveGrad.addColorStop(1.0, '#2b1206');
  alb.fillStyle = gloveGrad;
  alb.fillRect(0, gloveY, W, gloveH);

  // Glove folded cuff rim
  alb.fillStyle = '#7a3e1c';
  alb.fillRect(0, gloveY, W, 60);
  alb.strokeStyle = '#220d04';
  alb.lineWidth = 6;
  alb.strokeRect(0, gloveY, W, 60);
  drawStitches(alb, 10, gloveY + 30, W - 10, gloveY + 30, 16, 10, '#fef08a');

  // Reinforced cowhide palm & finger seams
  const palmW = W * 0.70;
  const palmX = (W - palmW) * 0.5;
  alb.fillStyle = '#48220c';
  alb.fillRect(palmX, gloveY + 120, palmW, gloveH - 180);
  alb.strokeStyle = '#8c4820';
  alb.lineWidth = 4;
  alb.strokeRect(palmX, gloveY + 120, palmW, gloveH - 180);
  drawStitches(alb, palmX + 8, gloveY + 130, palmX + palmW - 8, gloveY + 130, 16, 8, '#fef08a');
  drawStitches(alb, palmX + 8, H - 70, palmX + palmW - 8, H - 70, 16, 8, '#fef08a');

  // Finger separation seams
  for (let fx = palmX + palmW * 0.25; fx < palmX + palmW; fx += palmW * 0.25) {
    drawStitches(alb, fx, gloveY + 130, fx, H - 60, 18, 10, '#fde68a');
  }

  // Leather cinch strap with brass rivet at wrist
  alb.fillStyle = '#261005';
  alb.fillRect(0, gloveY + 70, W, 45);
  for (let rx = 150; rx < W; rx += 350) {
    drawRivet(alb, rx, gloveY + 92, 12, true);
  }

  // --- Roughness Map ---
  rgh.fillStyle = '#d5d5d5'; // Cloth sleeve ~0.84
  rgh.fillRect(0, 0, W, rollH);
  rgh.fillStyle = '#adadad'; // Skin ~0.68
  rgh.fillRect(0, skinY, W, skinH);
  rgh.fillStyle = '#8a8a8a'; // Leather gloves ~0.55
  rgh.fillRect(0, gloveY, W, gloveH);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  for (let rx = 150; rx < W; rx += 350) {
    met.fillStyle = '#e6e6e6';
    met.beginPath();
    met.arc(rx, gloveY + 92, 12, 0, Math.PI * 2);
    met.fill();
  }

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b0b0b0'; // Rolled sleeve cuff
  bmp.fillRect(0, rollH - 90, W, 70);
  bmp.fillStyle = '#a0a0a0'; // Glove palm reinforcement
  bmp.fillRect(palmX, gloveY + 120, palmW, gloveH - 180);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('armsGloves', set);
  return set;
}

/* ==========================================================================
   5. PATCHWORK TROUSERS & RUGGED CUFFED BOOTS TEXTURES
   ========================================================================== */
export function getVillagerPantsBootsTextures() {
  if (textureCache.has('pantsBoots')) return textureCache.get('pantsBoots');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Upper 55%: Patchwork Rustic Homespun Trousers (Earthy dark moss green / peat brown)
  const pantsH = H * 0.55;
  const pantsGrad = alb.createLinearGradient(0, 0, 0, pantsH);
  pantsGrad.addColorStop(0.0, '#363c27'); // dark moss / peat
  pantsGrad.addColorStop(0.5, '#282d1c');
  pantsGrad.addColorStop(1.0, '#1c2013');
  alb.fillStyle = pantsGrad;
  alb.fillRect(0, 0, W, pantsH);

  // Coarse fabric weave
  alb.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let x = 0; x < W; x += 12) {
    alb.fillRect(x, 0, 3, pantsH);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = 0; y < pantsH; y += 12) {
    alb.fillRect(0, y, W, 3);
  }

  // Knee Reinforcement Patches with Contrast Leather & Cross-Stitches
  [-1, 1].forEach((dir, idx) => {
    const pw = W * 0.38;
    const ph = pantsH * 0.36;
    const px = idx === 0 ? W * 0.08 : W * 0.54;
    const py = pantsH * 0.40;

    // Drop shadow under patch
    alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
    alb.fillRect(px - 6, py + 6, pw + 12, ph);

    // Leather / alternate fabric patch color
    const patchGrad = alb.createLinearGradient(px, py, px + pw, py + ph);
    patchGrad.addColorStop(0.0, '#664223');
    patchGrad.addColorStop(0.5, '#7d522c');
    patchGrad.addColorStop(1.0, '#4a2f17');
    alb.fillStyle = patchGrad;
    alb.fillRect(px, py, pw, ph);

    alb.strokeStyle = '#9c683b';
    alb.lineWidth = 4;
    alb.strokeRect(px, py, pw, ph);

    // Bold X cross-stitches along patch perimeter
    drawCrossStitches(alb, px + 12, py + 12, px + pw - 12, py + 12, 35, 8, '#fef08a');
    drawCrossStitches(alb, px + pw - 12, py + 12, px + pw - 12, py + ph - 12, 35, 8, '#fef08a');
    drawCrossStitches(alb, px + pw - 12, py + ph - 12, px + 12, py + ph - 12, 35, 8, '#fef08a');
    drawCrossStitches(alb, px + 12, py + ph - 12, px + 12, py + 12, 35, 8, '#fef08a');
  });

  // Lower 45%: Rugged Cuffed Leather Boots
  const bootY = pantsH;
  const bootH = H - bootY;

  // Turn-down leather boot cuff
  const cuffH = bootH * 0.28;
  const cuffGrad = alb.createLinearGradient(0, bootY, 0, bootY + cuffH);
  cuffGrad.addColorStop(0.0, '#5a2e14');
  cuffGrad.addColorStop(0.5, '#723a19');
  cuffGrad.addColorStop(1.0, '#381607');
  alb.fillStyle = cuffGrad;
  alb.fillRect(0, bootY, W, cuffH);

  alb.strokeStyle = '#1d0b04';
  alb.lineWidth = 8;
  alb.beginPath();
  alb.moveTo(0, bootY + cuffH);
  alb.lineTo(W, bootY + cuffH);
  alb.stroke();
  drawStitches(alb, 15, bootY + 25, W - 15, bootY + 25, 18, 12, '#fde68a');

  // Boot Shaft & Foot: Heavy oiled leather
  const shaftY = bootY + cuffH;
  const shaftH = bootH - cuffH - 120; // reserve 120px for thick lug sole
  const shaftGrad = alb.createLinearGradient(0, shaftY, 0, shaftY + shaftH);
  shaftGrad.addColorStop(0.0, '#421d0a');
  shaftGrad.addColorStop(0.4, '#592910');
  shaftGrad.addColorStop(1.0, '#240e04');
  alb.fillStyle = shaftGrad;
  alb.fillRect(0, shaftY, W, shaftH);

  // Ankle buckled strap across boot instep
  const strapY = shaftY + shaftH * 0.45;
  alb.fillStyle = '#1e0b04';
  alb.fillRect(0, strapY, W, 50);
  drawStitches(alb, 10, strapY + 12, W - 10, strapY + 12, 16, 8, '#fde68a');
  drawStitches(alb, 10, strapY + 38, W - 10, strapY + 38, 16, 8, '#fde68a');

  // Brass buckles on ankle straps
  [W * 0.28, W * 0.72].forEach(bx => {
    alb.fillStyle = '#f59e0b';
    alb.fillRect(bx - 30, strapY - 6, 60, 62);
    alb.fillStyle = '#1e0b04';
    alb.fillRect(bx - 16, strapY + 6, 32, 38);
    alb.fillStyle = '#fef08a';
    alb.fillRect(bx - 4, strapY - 2, 8, 54);
  });

  // Stitched welt seam above sole
  const soleY = H - 120;
  alb.fillStyle = '#120702';
  alb.fillRect(0, soleY - 20, W, 20);
  drawStitches(alb, 10, soleY - 10, W - 10, soleY - 10, 14, 8, '#d4a373');

  // Thick Rugged Lugged Tread Sole
  const soleGrad = alb.createLinearGradient(0, soleY, 0, H);
  soleGrad.addColorStop(0.0, '#1c1c1c');
  soleGrad.addColorStop(0.3, '#2a2a2a');
  soleGrad.addColorStop(1.0, '#141414');
  alb.fillStyle = soleGrad;
  alb.fillRect(0, soleY, W, 120);

  // Deep tread grooves
  alb.fillStyle = '#0a0a0a';
  for (let tx = 30; tx < W; tx += 90) {
    alb.fillRect(tx, soleY + 20, 45, 90);
  }

  // --- Roughness Map ---
  rgh.fillStyle = '#dedede'; // Trouser cloth ~0.87
  rgh.fillRect(0, 0, W, pantsH);
  rgh.fillStyle = '#999999'; // Patches ~0.60
  [-1, 1].forEach((dir, idx) => {
    const pw = W * 0.38;
    const ph = pantsH * 0.36;
    const px = idx === 0 ? W * 0.08 : W * 0.54;
    const py = pantsH * 0.40;
    rgh.fillRect(px, py, pw, ph);
  });
  rgh.fillStyle = '#8a8a8a'; // Boot leather ~0.55
  rgh.fillRect(0, bootY, W, bootH - 120);
  rgh.fillStyle = '#b0b0b0'; // Rubber lug sole ~0.70
  rgh.fillRect(0, soleY, W, 120);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  [W * 0.28, W * 0.72].forEach(bx => {
    met.fillStyle = '#e6e6e6'; // Brass buckles
    met.fillRect(bx - 30, strapY - 6, 60, 62);
  });

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  [-1, 1].forEach((dir, idx) => {
    const pw = W * 0.38;
    const ph = pantsH * 0.36;
    const px = idx === 0 ? W * 0.08 : W * 0.54;
    const py = pantsH * 0.40;
    bmp.fillStyle = '#a0a0a0'; // Knee patch height
    bmp.fillRect(px, py, pw, ph);
  });
  bmp.fillStyle = '#b0b0b0'; // Boot cuff height
  bmp.fillRect(0, bootY, W, cuffH);
  bmp.fillStyle = '#606060'; // Sole tread grooves
  for (let tx = 30; tx < W; tx += 90) {
    bmp.fillRect(tx, soleY + 20, 45, 90);
  }

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('pantsBoots', set);
  return set;
}

/* ==========================================================================
   6. CRAFTSMAN AXE TEXTURES
   ========================================================================== */
export function getVillagerAxeTextures() {
  if (textureCache.has('axe')) return textureCache.get('axe');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Left 50%: Wood Grain Handle with Leather Grip Wrap
  drawWoodGrainTexture(alb, 0, 0, W * 0.5, H, '#5c3317', '#9e6231', '#3d1f0c');

  // Criss-cross spiral leather wrap on lower half of handle
  const wrapY = H * 0.45;
  const wrapH = H * 0.55;
  const wrapW = W * 0.5;

  alb.fillStyle = '#3a1a08';
  alb.fillRect(0, wrapY, wrapW, wrapH);

  // Cross-laced leather cord pattern
  alb.strokeStyle = '#783812';
  alb.lineWidth = 14;
  for (let y = wrapY; y < H; y += 80) {
    alb.beginPath();
    alb.moveTo(0, y);
    alb.lineTo(wrapW, y + 60);
    alb.stroke();
    alb.beginPath();
    alb.moveTo(wrapW, y);
    alb.lineTo(0, y + 60);
    alb.stroke();
  }
  // Leather wrap seams & stitches
  drawStitches(alb, 10, wrapY + 10, wrapW - 10, wrapY + 10, 16, 8, '#fde68a');
  drawStitches(alb, 10, H - 20, wrapW - 10, H - 20, 16, 8, '#fde68a');

  // Right 50%: Forged Carbon Steel Axe Blade
  const bladeX = W * 0.5;
  const bladeW = W * 0.5;

  // Dark forged cast-iron body with hammer marks
  const ironGrad = alb.createLinearGradient(bladeX, 0, W, 0);
  ironGrad.addColorStop(0.0, '#1e293b'); // dark carbon iron socket
  ironGrad.addColorStop(0.3, '#334155');
  ironGrad.addColorStop(0.65, '#64748b'); // mid steel body
  ironGrad.addColorStop(0.85, '#cbd5e1'); // shiny bevel transition
  ironGrad.addColorStop(1.0, '#ffffff'); // razor mirror bevel
  alb.fillStyle = ironGrad;
  alb.fillRect(bladeX, 0, bladeW, H);

  // Hand-forged hammer marks
  alb.fillStyle = 'rgba(0, 0, 0, 0.25)';
  for (let i = 0; i < 60; i++) {
    const hx = bladeX + Math.random() * (bladeW * 0.6);
    const hy = Math.random() * H;
    alb.beginPath();
    alb.ellipse(hx, hy, 18, 12, Math.random() * Math.PI, 0, Math.PI * 2);
    alb.fill();
  }

  // Polished Razor Edge (Cutting bevel on rightmost rim)
  const edgeW = bladeW * 0.18;
  const edgeX = W - edgeW;
  const edgeGrad = alb.createLinearGradient(edgeX, 0, W, 0);
  edgeGrad.addColorStop(0.0, '#94a3b8');
  edgeGrad.addColorStop(0.4, '#e2e8f0');
  edgeGrad.addColorStop(0.7, '#ffffff');
  edgeGrad.addColorStop(1.0, '#f8fafc');
  alb.fillStyle = edgeGrad;
  alb.fillRect(edgeX, 0, edgeW, H);

  // Battle / Woodcraft Nick Marks on Cutting Edge
  alb.fillStyle = '#0f172a';
  [H * 0.2, H * 0.38, H * 0.55, H * 0.72, H * 0.88].forEach(ny => {
    alb.beginPath();
    alb.moveTo(W, ny);
    alb.lineTo(W - 25, ny + 8);
    alb.lineTo(W, ny + 16);
    alb.closePath();
    alb.fill();
  });

  // Top eye wedge & reinforcing steel band
  alb.fillStyle = '#475569';
  alb.fillRect(bladeX, 0, bladeW * 0.35, 80);
  drawRivet(alb, bladeX + 80, 40, 14, false);

  // --- Roughness Map ---
  rgh.fillStyle = '#a6a6a6'; // Wood handle ~0.65
  rgh.fillRect(0, 0, W * 0.5, H);
  rgh.fillStyle = '#999999'; // Leather wrap ~0.60
  rgh.fillRect(0, wrapY, wrapW, wrapH);
  rgh.fillStyle = '#6b6b6b'; // Forged iron ~0.42
  rgh.fillRect(bladeX, 0, bladeW, H);
  rgh.fillStyle = '#262626'; // Razor polished steel edge ~0.15
  rgh.fillRect(edgeX, 0, edgeW, H);

  // --- Metalness Map ---
  met.fillStyle = '#000000'; // Wood & leather non-metallic
  met.fillRect(0, 0, W * 0.5, H);
  met.fillStyle = '#e6e6e6'; // Forged steel ~0.90
  met.fillRect(bladeX, 0, bladeW, H);
  met.fillStyle = '#f5f5f5'; // Razor edge ~0.96
  met.fillRect(edgeX, 0, edgeW, H);

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#a0a0a0'; // Leather wrap relief
  bmp.fillRect(0, wrapY, wrapW, wrapH);
  bmp.fillStyle = '#b0b0b0'; // Blade bevel
  bmp.fillRect(bladeX, 0, bladeW, H);
  bmp.fillStyle = '#505050'; // Nicks
  [H * 0.2, H * 0.38, H * 0.55, H * 0.72, H * 0.88].forEach(ny => {
    bmp.beginPath();
    bmp.moveTo(W, ny);
    bmp.lineTo(W - 25, ny + 8);
    bmp.lineTo(W, ny + 16);
    bmp.closePath();
    bmp.fill();
  });

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('axe', set);
  return set;
}

/* ==========================================================================
   7. MINER'S PICKAXE TEXTURES
   ========================================================================== */
export function getVillagerPickaxeTextures() {
  if (textureCache.has('pickaxe')) return textureCache.get('pickaxe');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Left 40%: Hardwood Haft with Iron Collars
  drawWoodGrainTexture(alb, 0, 0, W * 0.4, H, '#4a2510', '#854b20', '#2d1406');

  // Iron reinforcing collar band near head
  alb.fillStyle = '#334155';
  alb.fillRect(0, 0, W * 0.4, 140);
  drawRivet(alb, W * 0.12, 70, 12, false);
  drawRivet(alb, W * 0.28, 70, 12, false);

  // Right 60%: Forged Dark Iron Pickaxe Head with Mirror Chisel Tips
  const headX = W * 0.4;
  const headW = W * 0.6;

  // Forged iron gradient
  const pGrad = alb.createLinearGradient(headX, 0, W, 0);
  pGrad.addColorStop(0.0, '#0f172a');
  pGrad.addColorStop(0.3, '#1e293b');
  pGrad.addColorStop(0.7, '#334155');
  pGrad.addColorStop(0.9, '#94a3b8');
  pGrad.addColorStop(1.0, '#ffffff'); // Chisel & spike tip
  alb.fillStyle = pGrad;
  alb.fillRect(headX, 0, headW, H);

  // Central forged socket eye
  alb.fillStyle = '#090d16';
  alb.fillRect(headX + 20, H * 0.4, 180, H * 0.2);
  drawRivet(alb, headX + 110, H * 0.35, 14, false);
  drawRivet(alb, headX + 110, H * 0.65, 14, false);

  // Chisel tip mirror highlights on ends
  const tipW = headW * 0.22;
  const tipX = W - tipW;
  const tGrad = alb.createLinearGradient(tipX, 0, W, 0);
  tGrad.addColorStop(0.0, '#64748b');
  tGrad.addColorStop(0.5, '#e2e8f0');
  tGrad.addColorStop(1.0, '#ffffff');
  alb.fillStyle = tGrad;
  alb.fillRect(tipX, 0, tipW, H);

  // --- Roughness Map ---
  rgh.fillStyle = '#a6a6a6'; // Wood ~0.65
  rgh.fillRect(0, 0, W * 0.4, H);
  rgh.fillStyle = '#6b6b6b'; // Forged iron ~0.42
  rgh.fillRect(headX, 0, headW, H);
  rgh.fillStyle = '#2b2b2b'; // Polished chisel tip ~0.17
  rgh.fillRect(tipX, 0, tipW, H);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W * 0.4, H);
  met.fillStyle = '#e6e6e6'; // Forged iron ~0.90
  met.fillRect(headX, 0, headW, H);
  met.fillStyle = '#ffffff'; // Chisel tip ~1.0
  met.fillRect(tipX, 0, tipW, H);

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b0b0b0';
  bmp.fillRect(headX, 0, headW, H);
  bmp.fillStyle = '#404040'; // Socket cutout
  bmp.fillRect(headX + 20, H * 0.4, 180, H * 0.2);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('pickaxe', set);
  return set;
}

/* ==========================================================================
   8. BUILDER'S SLEDGEHAMMER TEXTURES
   ========================================================================== */
export function getVillagerHammerTextures() {
  if (textureCache.has('hammer')) return textureCache.get('hammer');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Left 40%: Smooth Ash Wood Haft
  drawWoodGrainTexture(alb, 0, 0, W * 0.4, H, '#69411f', '#aa723e', '#3d200a');

  // Grip leather cord ring at lower haft
  alb.fillStyle = '#2b1206';
  alb.fillRect(0, H * 0.65, W * 0.4, 220);
  drawStitches(alb, 10, H * 0.68, W * 0.4 - 10, H * 0.68, 16, 8, '#fde68a');
  drawStitches(alb, 10, H * 0.65 + 200, W * 0.4 - 10, H * 0.65 + 200, 16, 8, '#fde68a');

  // Right 60%: Beveled Forged Steel Hammer Head
  const headX = W * 0.4;
  const headW = W * 0.6;

  const hGrad = alb.createLinearGradient(headX, 0, W, 0);
  hGrad.addColorStop(0.0, '#1e293b');
  hGrad.addColorStop(0.4, '#475569');
  hGrad.addColorStop(0.7, '#64748b');
  hGrad.addColorStop(0.9, '#cbd5e1');
  hGrad.addColorStop(1.0, '#ffffff'); // Striking face
  alb.fillStyle = hGrad;
  alb.fillRect(headX, 0, headW, H);

  // Chamfered octagon bevels on top and bottom
  alb.fillStyle = 'rgba(255, 255, 255, 0.2)';
  alb.fillRect(headX, 0, headW, 80);
  alb.fillStyle = 'rgba(0, 0, 0, 0.4)';
  alb.fillRect(headX, H - 80, headW, 80);

  // Steel cheek plates & side rivets
  const plateX = headX + 60;
  const plateY = H * 0.25;
  const plateW = headW * 0.45;
  const plateH = H * 0.50;
  alb.fillStyle = '#334155';
  alb.fillRect(plateX, plateY, plateW, plateH);
  alb.strokeStyle = '#94a3b8';
  alb.lineWidth = 4;
  alb.strokeRect(plateX, plateY, plateW, plateH);
  drawRivet(alb, plateX + 40, plateY + 40, 14, false);
  drawRivet(alb, plateX + plateW - 40, plateY + 40, 14, false);
  drawRivet(alb, plateX + 40, plateY + plateH - 40, 14, false);
  drawRivet(alb, plateX + plateW - 40, plateY + plateH - 40, 14, false);

  // Mirror striking face on right
  const faceW = headW * 0.20;
  const faceX = W - faceW;
  const fGrad = alb.createLinearGradient(faceX, 0, W, 0);
  fGrad.addColorStop(0.0, '#94a3b8');
  fGrad.addColorStop(0.6, '#e2e8f0');
  fGrad.addColorStop(1.0, '#ffffff');
  alb.fillStyle = fGrad;
  alb.fillRect(faceX, 0, faceW, H);

  // --- Roughness Map ---
  rgh.fillStyle = '#a6a6a6'; // Wood ~0.65
  rgh.fillRect(0, 0, W * 0.4, H);
  rgh.fillStyle = '#5c5c5c'; // Steel ~0.36
  rgh.fillRect(headX, 0, headW, H);
  rgh.fillStyle = '#242424'; // Striking face ~0.14
  rgh.fillRect(faceX, 0, faceW, H);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W * 0.4, H);
  met.fillStyle = '#e6e6e6';
  met.fillRect(headX, 0, headW, H);
  met.fillStyle = '#ffffff';
  met.fillRect(faceX, 0, faceW, H);

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#a8a8a8';
  bmp.fillRect(plateX, plateY, plateW, plateH);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('hammer', set);
  return set;
}

/* ==========================================================================
   9. CARGO BACKPACK & BEDROLL TEXTURES
   ========================================================================== */
export function getVillagerBackpackTextures() {
  if (textureCache.has('backpack')) return textureCache.get('backpack');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Upper 40%: Rolled Wool Bedroll with Tie Straps
  const bedY = 0;
  const bedH = H * 0.38;
  const bedGrad = alb.createLinearGradient(0, 0, 0, bedH);
  bedGrad.addColorStop(0.0, '#3f3f46'); // charcoal wool blanket
  bedGrad.addColorStop(0.5, '#52525b');
  bedGrad.addColorStop(1.0, '#27272a');
  alb.fillStyle = bedGrad;
  alb.fillRect(0, bedY, W, bedH);

  // Herringbone woolen weave
  alb.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  alb.lineWidth = 4;
  for (let bx = 0; bx < W; bx += 30) {
    alb.beginPath();
    alb.moveTo(bx, 0);
    alb.lineTo(bx + 15, bedH * 0.5);
    alb.lineTo(bx, bedH);
    alb.stroke();
  }

  // Bedroll dual leather buckled tie straps
  [W * 0.28, W * 0.72].forEach(bx => {
    alb.fillStyle = '#2e1507';
    alb.fillRect(bx - 35, 0, 70, bedH);
    drawStitches(alb, bx - 25, 10, bx - 25, bedH - 10, 16, 8, '#fde68a');
    drawStitches(alb, bx + 25, 10, bx + 25, bedH - 10, 16, 8, '#fde68a');
    drawRivet(alb, bx, bedH * 0.5, 12, true);
  });

  // Lower 60%: Heavy Canvas Pack Body & Wood Frame
  const packY = bedH;
  const packH = H - packY;
  const packGrad = alb.createLinearGradient(0, packY, 0, H);
  packGrad.addColorStop(0.0, '#854d0e'); // warm khaki/canvas
  packGrad.addColorStop(0.5, '#a16207');
  packGrad.addColorStop(1.0, '#713f12');
  alb.fillStyle = packGrad;
  alb.fillRect(0, packY, W, packH);

  // Heavy canvas cross weave
  alb.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = packY; y < H; y += 14) {
    alb.fillRect(0, y, W, 4);
  }
  for (let x = 0; x < W; x += 14) {
    alb.fillRect(x, packY, 4, packH);
  }

  // Reinforced leather pack flaps & pockets
  alb.fillStyle = '#45220c';
  alb.fillRect(W * 0.15, packY + 80, W * 0.70, packH * 0.65);
  alb.strokeStyle = '#854218';
  alb.lineWidth = 6;
  alb.strokeRect(W * 0.15, packY + 80, W * 0.70, packH * 0.65);
  drawStitches(alb, W * 0.18, packY + 100, W * 0.82, packY + 100, 18, 10, '#fde68a');
  drawStitches(alb, W * 0.18, packY + packH * 0.65 + 60, W * 0.82, packY + packH * 0.65 + 60, 18, 10, '#fde68a');

  // Brass buckles and center strap
  alb.fillStyle = '#261005';
  alb.fillRect(W * 0.45, packY + 40, W * 0.10, packH * 0.75);
  drawRivet(alb, W * 0.5, packY + 120, 14, true);
  drawRivet(alb, W * 0.5, packY + packH * 0.6, 14, true);

  // --- Roughness Map ---
  rgh.fillStyle = '#e0e0e0'; // Wool bedroll ~0.88
  rgh.fillRect(0, 0, W, bedH);
  rgh.fillStyle = '#d0d0d0'; // Canvas ~0.82
  rgh.fillRect(0, packY, W, packH);
  rgh.fillStyle = '#8a8a8a'; // Leather straps ~0.55
  rgh.fillRect(W * 0.15, packY + 80, W * 0.70, packH * 0.65);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e6e6e6'; // Rivets
  [W * 0.28, W * 0.72].forEach(bx => {
    met.beginPath();
    met.arc(bx, bedH * 0.5, 12, 0, Math.PI * 2);
    met.fill();
  });

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#a8a8a8';
  bmp.fillRect(W * 0.15, packY + 80, W * 0.70, packH * 0.65);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('backpack', set);
  return set;
}

/* ==========================================================================
   10. CHOPPED WOOD LOGS BUNDLE & HEMP ROPE TEXTURES
   ========================================================================== */
export function getVillagerWoodBundleTextures() {
  if (textureCache.has('woodBundle')) return textureCache.get('woodBundle');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Left 65%: Deep Fissured Oak Tree Bark Texture
  const barkW = W * 0.65;
  const barkGrad = alb.createLinearGradient(0, 0, barkW, 0);
  barkGrad.addColorStop(0.0, '#2c1809');
  barkGrad.addColorStop(0.3, '#4a2b13');
  barkGrad.addColorStop(0.65, '#381e0b');
  barkGrad.addColorStop(1.0, '#1f0f04');
  alb.fillStyle = barkGrad;
  alb.fillRect(0, 0, barkW, H);

  // Deep vertical bark fissures & ridges
  alb.strokeStyle = '#120802';
  alb.lineWidth = 12;
  for (let bx = 30; bx < barkW; bx += 55) {
    alb.beginPath();
    alb.moveTo(bx, 0);
    for (let by = 0; by < H; by += 80) {
      const wiggle = Math.sin((by * 0.03) + bx) * 16;
      alb.lineTo(bx + wiggle, by);
    }
    alb.stroke();
  }

  // Bark highlight edges
  alb.strokeStyle = '#6e4420';
  alb.lineWidth = 6;
  for (let bx = 36; bx < barkW; bx += 55) {
    alb.beginPath();
    alb.moveTo(bx, 0);
    for (let by = 0; by < H; by += 80) {
      const wiggle = Math.sin((by * 0.03) + bx) * 16;
      alb.lineTo(bx + wiggle + 5, by);
    }
    alb.stroke();
  }

  // Lichen moss spots on bark
  alb.fillStyle = 'rgba(74, 114, 61, 0.45)';
  for (let i = 0; i < 70; i++) {
    const lx = Math.random() * (barkW - 40);
    const ly = Math.random() * H;
    alb.beginPath();
    alb.arc(lx, ly, 15 + Math.random() * 25, 0, Math.PI * 2);
    alb.fill();
  }

  // Right 35% Top Half: Concentric Tree End-Grain Rings & Sapwood
  const endX = barkW;
  const endW = W - barkW;
  const endH = H * 0.60;

  alb.fillStyle = '#78431b';
  alb.fillRect(endX, 0, endW, endH);

  // Concentric growth rings
  const ringCX = endX + endW * 0.5;
  const ringCY = endH * 0.5;
  const maxR = Math.min(endW, endH) * 0.46;

  for (let r = maxR; r > 10; r -= 18) {
    const rg = alb.createRadialGradient(ringCX, ringCY, r - 12, ringCX, ringCY, r);
    rg.addColorStop(0.0, '#c48957');
    rg.addColorStop(0.5, '#e0aa79');
    rg.addColorStop(1.0, '#6e3c16');
    alb.fillStyle = rg;
    alb.beginPath();
    alb.arc(ringCX, ringCY, r, 0, Math.PI * 2);
    alb.fill();
  }

  // Heartwood dark center & sap core
  alb.fillStyle = '#421f08';
  alb.beginPath();
  alb.arc(ringCX, ringCY, 22, 0, Math.PI * 2);
  alb.fill();

  // Radial shrinkage check cracks
  alb.strokeStyle = '#240f04';
  alb.lineWidth = 5;
  [0, 0.45, 1.1, 1.8, 2.5, 3.2, 4.0, 4.9, 5.6].forEach(ang => {
    alb.beginPath();
    alb.moveTo(ringCX + Math.cos(ang) * 15, ringCY + Math.sin(ang) * 15);
    alb.lineTo(ringCX + Math.cos(ang) * maxR * 0.95, ringCY + Math.sin(ang) * maxR * 0.95);
    alb.stroke();
  });

  // Right 35% Bottom Half: Coiled Hemp Rope Binding
  const ropeY = endH;
  const ropeH = H - ropeY;
  const ropeGrad = alb.createLinearGradient(endX, ropeY, W, ropeY + ropeH);
  ropeGrad.addColorStop(0.0, '#b8864a');
  ropeGrad.addColorStop(0.5, '#d4a373');
  ropeGrad.addColorStop(1.0, '#8c5d2c');
  alb.fillStyle = ropeGrad;
  alb.fillRect(endX, ropeY, endW, ropeH);

  // Twisted hemp fiber coils
  alb.strokeStyle = '#5a3816';
  alb.lineWidth = 8;
  for (let rx = endX; rx < W; rx += 40) {
    alb.beginPath();
    alb.moveTo(rx, ropeY);
    alb.lineTo(rx + 25, H);
    alb.stroke();
  }

  // --- Roughness Map ---
  rgh.fillStyle = '#dedede'; // Bark ~0.87
  rgh.fillRect(0, 0, barkW, H);
  rgh.fillStyle = '#a6a6a6'; // End-grain ~0.65
  rgh.fillRect(endX, 0, endW, endH);
  rgh.fillStyle = '#c7c7c7'; // Rope ~0.78
  rgh.fillRect(endX, ropeY, endW, ropeH);

  // --- Metalness Map (0.0 everywhere) ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  // Bark deep grooves
  bmp.fillStyle = '#404040';
  for (let bx = 30; bx < barkW; bx += 55) {
    bmp.fillRect(bx, 0, 10, H);
  }
  // Rope coils
  bmp.fillStyle = '#a8a8a8';
  for (let rx = endX; rx < W; rx += 40) {
    bmp.fillRect(rx, ropeY, 20, ropeH);
  }

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('woodBundle', set);
  return set;
}

/* ==========================================================================
   11. BURLAP SACK & GLITTERING GOLD NUGGETS TEXTURES
   ========================================================================== */
export function getVillagerGoldSackTextures() {
  if (textureCache.has('goldSack')) return textureCache.get('goldSack');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Upper 55%: Heavy Coarse Burlap / Hessian Sack Fabric
  const burlapH = H * 0.55;
  const sackGrad = alb.createLinearGradient(0, 0, 0, burlapH);
  sackGrad.addColorStop(0.0, '#a37039'); // warm hemp burlap
  sackGrad.addColorStop(0.4, '#bc8a4b');
  sackGrad.addColorStop(0.8, '#875626');
  sackGrad.addColorStop(1.0, '#633d17');
  alb.fillStyle = sackGrad;
  alb.fillRect(0, 0, W, burlapH);

  // Heavy coarse cross-weave grid
  alb.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let y = 0; y < burlapH; y += 12) {
    alb.fillRect(0, y, W, 4);
  }
  for (let x = 0; x < W; x += 12) {
    alb.fillRect(x, 0, 4, burlapH);
  }

  // Sack cinch cord rope at top mouth
  alb.fillStyle = '#fde68a';
  alb.fillRect(0, 50, W, 60);
  alb.strokeStyle = '#92400e';
  alb.lineWidth = 6;
  for (let rx = 10; rx < W; rx += 40) {
    alb.beginPath();
    alb.moveTo(rx, 50);
    alb.lineTo(rx + 20, 110);
    alb.stroke();
  }

  // Stitched linen patch on sack with X-stitches
  const pw = 340;
  const ph = 240;
  const px = W * 0.5 - pw * 0.5;
  const py = burlapH * 0.4;
  alb.fillStyle = '#d4a373';
  alb.fillRect(px, py, pw, ph);
  drawCrossStitches(alb, px + 10, py + 10, px + pw - 10, py + 10, 30, 8, '#451a03');
  drawCrossStitches(alb, px + pw - 10, py + 10, px + pw - 10, py + ph - 10, 30, 8, '#451a03');
  drawCrossStitches(alb, px + pw - 10, py + ph - 10, px + 10, py + ph - 10, 30, 8, '#451a03');
  drawCrossStitches(alb, px + 10, py + ph - 10, px + 10, py + 10, 30, 8, '#451a03');

  // Lower 45%: Glittering Faceted Raw Gold Nuggets
  const goldY = burlapH;
  const goldH = H - goldY;

  // Base raw gold field
  const goldGrad = alb.createLinearGradient(0, goldY, W, H);
  goldGrad.addColorStop(0.0, '#78350f'); // deep amber gold shadow
  goldGrad.addColorStop(0.3, '#d97706');
  goldGrad.addColorStop(0.6, '#fbbf24'); // radiant 24k gold
  goldGrad.addColorStop(0.85, '#fef08a'); // sparkling facet highlight
  goldGrad.addColorStop(1.0, '#ffffff');
  alb.fillStyle = goldGrad;
  alb.fillRect(0, goldY, W, goldH);

  // Faceted polygonal gold crystalline clusters
  for (let gy = goldY + 40; gy < H - 40; gy += 140) {
    for (let gx = 40; gx < W - 40; gx += 160) {
      alb.save();
      alb.translate(gx + (Math.random() - 0.5) * 30, gy + (Math.random() - 0.5) * 30);
      const rad = 50 + Math.random() * 45;

      // Draw multifaceted polygon
      const points = [];
      const numPts = 6 + Math.floor(Math.random() * 3);
      for (let p = 0; p < numPts; p++) {
        const ang = (p / numPts) * Math.PI * 2;
        const dist = rad * (0.7 + Math.random() * 0.4);
        points.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist });
      }

      // Facet shading
      for (let p = 0; p < numPts; p++) {
        const next = (p + 1) % numPts;
        const fGrad = alb.createLinearGradient(0, 0, points[p].x, points[p].y);
        if (p % 2 === 0) {
          fGrad.addColorStop(0.0, '#fef08a');
          fGrad.addColorStop(1.0, '#b45309');
        } else {
          fGrad.addColorStop(0.0, '#ffffff');
          fGrad.addColorStop(1.0, '#f59e0b');
        }
        alb.fillStyle = fGrad;
        alb.beginPath();
        alb.moveTo(0, 0);
        alb.lineTo(points[p].x, points[p].y);
        alb.lineTo(points[next].x, points[next].y);
        alb.closePath();
        alb.fill();

        alb.strokeStyle = '#451a03';
        alb.lineWidth = 3;
        alb.stroke();
      }

      // Diamond sparkle catchlight
      alb.fillStyle = '#ffffff';
      alb.beginPath();
      alb.arc(0, 0, 7, 0, Math.PI * 2);
      alb.fill();

      alb.restore();
    }
  }

  // --- Roughness Map ---
  rgh.fillStyle = '#e3e3e3'; // Burlap sack ~0.89
  rgh.fillRect(0, 0, W, burlapH);
  rgh.fillStyle = '#2d2d2d'; // High metallic shine on gold ~0.18
  rgh.fillRect(0, goldY, W, goldH);

  // --- Metalness Map ---
  met.fillStyle = '#000000'; // Burlap cloth non-metallic
  met.fillRect(0, 0, W, burlapH);
  met.fillStyle = '#f0f0f0'; // Gold ore ~0.94
  met.fillRect(0, goldY, W, goldH);

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#a0a0a0'; // Sack patch
  bmp.fillRect(px, py, pw, ph);
  bmp.fillStyle = '#d0d0d0'; // Gold facets
  bmp.fillRect(0, goldY, W, goldH);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('goldSack', set);
  return set;
}
