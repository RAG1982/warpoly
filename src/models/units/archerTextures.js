import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Archer
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen Triple-A standards (Valorant / Overwatch / UE5).
 * 
 * Generates 2048x2048 high-resolution textures tailored to each component:
 * - getArcherHoodTextures(): Deep forest green woven cloth hood with gold border trim and seam stitches
 * - getArcherFaceTextures(): Heroic rugged face with trimmed beard, mustache, intense eyes, and brow
 * - getArcherFeatherTextures(): Golden feather vanes with luminous quill and barbs
 * - getArcherTunicTextures(): Emerald green tunic with golden embroidery, crossed leather harness & war belt
 * - getArcherBracersPauldronsTextures(): Studded steel pauldrons, forearm vambraces, and archer gloves
 * - getArcherLegsBootsTextures(): Olive trousers, steel knee poleyns, cuffed leather boots with steel toe caps
 * - getArcherBowTextures(): Golden aged oak recurve bow with elven runic carvings and leather grip
 * - getArcherQuiverTextures(): Hand-tooled leather quiver with gold filigree collar and emerald cabochon jewel
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

/**
 * Draw stylized rivet / bolt with drop shadow and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  ctx.save();
  // Drop shadow
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
 * Draw stylized running stitch along a line
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

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 + 1, y1 + 1.5);
  ctx.lineTo(x2 + 1, y2 + 1.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw elven gold filigree scrollwork motif
 */
function drawFiligree(ctx, cx, cy, w, h, goldColor = '#facc15') {
  ctx.save();
  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#78350f';
  ctx.shadowBlur = 4;

  ctx.beginPath();
  ctx.moveTo(cx - w * 0.45, cy);
  ctx.bezierCurveTo(cx - w * 0.2, cy - h * 0.4, cx - w * 0.1, cy + h * 0.4, cx, cy);
  ctx.bezierCurveTo(cx + w * 0.1, cy - h * 0.4, cx + w * 0.2, cy + h * 0.4, cx + w * 0.45, cy);
  ctx.stroke();

  [-0.25, 0, 0.25].forEach(offset => {
    ctx.beginPath();
    ctx.arc(cx + offset * w, cy - h * 0.15, 8, 0, Math.PI * 1.5);
    ctx.stroke();
  });
  ctx.restore();
}

/* ==========================================================================
   1. FOREST GREEN HOOD CLOTH TEXTURES
   ========================================================================== */
export function getArcherHoodTextures() {
  if (textureCache.has('hood')) return textureCache.get('hood');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Luminous Vibrant Emerald Green Gradient
  const hoodGrad = alb.createLinearGradient(0, 0, 0, H);
  hoodGrad.addColorStop(0.0, '#34d399');
  hoodGrad.addColorStop(0.3, '#10b981');
  hoodGrad.addColorStop(0.7, '#059669');
  hoodGrad.addColorStop(1.0, '#047857');
  alb.fillStyle = hoodGrad;
  alb.fillRect(0, 0, W, H);

  // Woven cloth micro-texture
  alb.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let x = 0; x < W; x += 10) {
    alb.fillRect(x, 0, 3, H);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = 0; y < H; y += 10) {
    alb.fillRect(0, y, W, 3);
  }

  // Hood Seam down center
  alb.strokeStyle = '#064e3b';
  alb.lineWidth = 10;
  alb.beginPath();
  alb.moveTo(W * 0.5, 0);
  alb.lineTo(W * 0.5, H);
  alb.stroke();

  drawStitches(alb, W * 0.48, 20, W * 0.48, H - 20, 18, 12, '#a3b18a');
  drawStitches(alb, W * 0.52, 20, W * 0.52, H - 20, 18, 12, '#a3b18a');

  // Gold Trim border along bottom edge
  const gGrad = alb.createLinearGradient(0, H - 120, 0, H);
  gGrad.addColorStop(0.0, '#fef08a');
  gGrad.addColorStop(0.3, '#f59e0b');
  gGrad.addColorStop(0.7, '#d97706');
  gGrad.addColorStop(1.0, '#78350f');
  alb.fillStyle = gGrad;
  alb.fillRect(0, H - 120, W, 120);

  // Roughness Map
  rgh.fillStyle = '#8c9ba5'; // Cloth ~ 0.55
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#3a3a3a'; // Gold rim ~ 0.22
  rgh.fillRect(0, H - 120, W, 120);

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e6e6e6'; // Gold rim ~ 0.90
  met.fillRect(0, H - 120, W, 120);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#505050';
  bmp.fillRect(W * 0.49, 0, W * 0.02, H);
  bmp.fillStyle = '#b0b0b0';
  bmp.fillRect(0, H - 120, W, 120);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('hood', set);
  return set;
}

/* ==========================================================================
   2. HEROIC RUGGED FACE & BEARD TEXTURES
   ========================================================================== */
export function getArcherFaceTextures() {
  if (textureCache.has('face')) return textureCache.get('face');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Background: ambient shadow framing face under hood
  const bgGrad = alb.createRadialGradient(W * 0.5, H * 0.48, 400, W * 0.5, H * 0.48, 900);
  bgGrad.addColorStop(0, '#e5aa85');
  bgGrad.addColorStop(0.65, '#c9845d');
  bgGrad.addColorStop(0.9, '#8f5336');
  bgGrad.addColorStop(1.0, '#2d140a');
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Forehead & Face Core
  const faceGrad = alb.createRadialGradient(W * 0.5, H * 0.35, 100, W * 0.5, H * 0.45, 600);
  faceGrad.addColorStop(0.0, '#f5c6a5');
  faceGrad.addColorStop(0.4, '#e5aa85');
  faceGrad.addColorStop(0.8, '#c9845d');
  faceGrad.addColorStop(1.0, '#9e5837');
  alb.fillStyle = faceGrad;
  alb.beginPath();
  alb.ellipse(W * 0.5, H * 0.42, 620, 580, 0, 0, Math.PI * 2);
  alb.fill();

  // Forehead furrow wrinkles (rugged veteran expression)
  alb.strokeStyle = 'rgba(120, 50, 25, 0.4)';
  alb.lineWidth = 5;
  alb.beginPath();
  alb.arc(W * 0.5, H * 0.15, 240, Math.PI * 0.2, Math.PI * 0.8);
  alb.arc(W * 0.5, H * 0.18, 200, Math.PI * 0.2, Math.PI * 0.8);
  alb.stroke();

  // Intense Piercing Eyes & Bushy Sandy-Brown Brows
  const eyeY = H * 0.38;
  [-300, 300].forEach(eyeOffset => {
    const ex = W * 0.5 + eyeOffset;

    // Eyebrow (Bushy, determined archer brow angled down towards center)
    alb.fillStyle = '#6b4c28';
    alb.beginPath();
    alb.ellipse(ex, eyeY - 110, 170, 50, (eyeOffset > 0 ? 0.18 : -0.18), 0, Math.PI * 2);
    alb.fill();

    // Eye socket shadow
    alb.fillStyle = 'rgba(110, 45, 20, 0.45)';
    alb.beginPath();
    alb.ellipse(ex, eyeY, 130, 70, 0, 0, Math.PI * 2);
    alb.fill();

    // Sclera (Eye white)
    alb.fillStyle = '#f8fafc';
    alb.beginPath();
    alb.ellipse(ex, eyeY, 95, 50, 0, 0, Math.PI * 2);
    alb.fill();

    // Iris (Vibrant piercing emerald / hazel archer eyes)
    alb.fillStyle = '#1b4332';
    alb.beginPath();
    alb.arc(ex, eyeY, 44, 0, Math.PI * 2);
    alb.fill();

    alb.fillStyle = '#40916c';
    alb.beginPath();
    alb.arc(ex, eyeY, 32, 0, Math.PI * 2);
    alb.fill();

    // Pupil
    alb.fillStyle = '#090d16';
    alb.beginPath();
    alb.arc(ex, eyeY, 22, 0, Math.PI * 2);
    alb.fill();

    // Specular Catchlight
    alb.fillStyle = '#ffffff';
    alb.beginPath();
    alb.arc(ex - 10, eyeY - 10, 10, 0, Math.PI * 2);
    alb.fill();

    // Upper eyelid crease
    alb.strokeStyle = '#3b1c0b';
    alb.lineWidth = 8;
    alb.beginPath();
    alb.arc(ex, eyeY, 98, Math.PI * 1.15, Math.PI * 1.85);
    alb.stroke();
  });

  // Nose Bridge & Sculpted Tip
  const noseGrad = alb.createLinearGradient(W * 0.5 - 70, H * 0.35, W * 0.5 + 70, H * 0.58);
  noseGrad.addColorStop(0.0, '#e5aa85');
  noseGrad.addColorStop(0.5, '#f5c6a5');
  noseGrad.addColorStop(1.0, '#c9845d');
  alb.fillStyle = noseGrad;
  alb.beginPath();
  alb.moveTo(W * 0.5 - 50, H * 0.34);
  alb.lineTo(W * 0.5 + 50, H * 0.34);
  alb.lineTo(W * 0.5 + 80, H * 0.58);
  alb.lineTo(W * 0.5 - 80, H * 0.58);
  alb.closePath();
  alb.fill();

  // Nostril flares
  alb.fillStyle = '#783515';
  alb.beginPath();
  alb.ellipse(W * 0.5 - 55, H * 0.58, 26, 16, 0.2, 0, Math.PI * 2);
  alb.ellipse(W * 0.5 + 55, H * 0.58, 26, 16, -0.2, 0, Math.PI * 2);
  alb.fill();

  // Full Trimmed Beard & Heavy Mustache (Faithful to Warcraft 2 Turnaround Sheet)
  const beardGrad = alb.createLinearGradient(0, H * 0.55, 0, H);
  beardGrad.addColorStop(0.0, '#8c6d46');
  beardGrad.addColorStop(0.3, '#735432');
  beardGrad.addColorStop(0.7, '#573d22');
  beardGrad.addColorStop(1.0, '#362413');
  alb.fillStyle = beardGrad;

  // Massive heroic trimmed beard covering chin, jaw, and sideburns
  alb.beginPath();
  alb.moveTo(W * 0.08, H * 0.42);
  alb.quadraticCurveTo(W * 0.05, H * 0.75, W * 0.25, H * 0.95);
  alb.quadraticCurveTo(W * 0.50, H * 1.02, W * 0.75, H * 0.95);
  alb.quadraticCurveTo(W * 0.95, H * 0.75, W * 0.92, H * 0.42);
  alb.quadraticCurveTo(W * 0.82, H * 0.65, W * 0.50, H * 0.68);
  alb.quadraticCurveTo(W * 0.18, H * 0.65, W * 0.08, H * 0.42);
  alb.fill();

  // Heavy Ranger Mustache flowing over lips
  alb.beginPath();
  alb.moveTo(W * 0.5, H * 0.58);
  alb.quadraticCurveTo(W * 0.72, H * 0.60, W * 0.82, H * 0.72);
  alb.quadraticCurveTo(W * 0.65, H * 0.76, W * 0.50, H * 0.68);
  alb.quadraticCurveTo(W * 0.35, H * 0.76, W * 0.18, H * 0.72);
  alb.quadraticCurveTo(W * 0.28, H * 0.60, W * 0.5, H * 0.58);
  alb.fill();

  // Painted hair strands and highlights on beard and mustache
  alb.strokeStyle = '#bfa275';
  alb.lineWidth = 4;
  for (let x = W * 0.18; x <= W * 0.82; x += 32) {
    const dist = Math.abs(x - W * 0.5);
    alb.beginPath();
    alb.moveTo(x, H * 0.66 + dist * 0.15);
    alb.quadraticCurveTo(x + (x > W * 0.5 ? 25 : -25), H * 0.82, x, H * 0.94);
    alb.stroke();
  }

  // Roughness Map
  rgh.fillStyle = '#9e9e9e'; // Skin roughness ~ 0.62
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#d9d9d9'; // Beard roughness ~ 0.85
  rgh.beginPath();
  alb.ellipse(W * 0.5, H * 0.80, 500, 350, 0, 0, Math.PI * 2);
  rgh.fill();

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b5b5b5';
  bmp.beginPath();
  bmp.ellipse(W * 0.5, H * 0.80, 480, 320, 0, 0, Math.PI * 2);
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
   3. GOLDEN FEATHER PLUME TEXTURES
   ========================================================================== */
export function getArcherFeatherTextures() {
  if (textureCache.has('feather')) return textureCache.get('feather');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const featherGrad = alb.createLinearGradient(0, 0, 0, H);
  featherGrad.addColorStop(0.0, '#fef08a');
  featherGrad.addColorStop(0.25, '#fbbf24');
  featherGrad.addColorStop(0.65, '#d97706');
  featherGrad.addColorStop(1.0, '#854d0e');
  alb.fillStyle = featherGrad;
  alb.fillRect(0, 0, W, H);

  // Central quill
  alb.fillStyle = '#fffbeb';
  alb.fillRect(W * 0.48, 0, W * 0.04, H);

  // Feather vanes / barbs
  alb.strokeStyle = 'rgba(254, 240, 138, 0.55)';
  alb.lineWidth = 6;
  for (let y = 40; y < H; y += 28) {
    alb.beginPath();
    alb.moveTo(W * 0.5, y);
    alb.lineTo(W * 0.1, y + 140);
    alb.moveTo(W * 0.5, y);
    alb.lineTo(W * 0.9, y + 140);
    alb.stroke();
  }

  // Roughness Map
  rgh.fillStyle = '#666666'; // semi-gloss ~ 0.40
  rgh.fillRect(0, 0, W, H);

  // Metalness Map
  met.fillStyle = '#808080'; // subtle metallic gold shimmer ~ 0.50
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#e0e0e0';
  bmp.fillRect(W * 0.48, 0, W * 0.04, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('feather', set);
  return set;
}

/* ==========================================================================
   4. EMERALD TUNIC WITH GOLD EMBROIDERY & LEATHER HARNESS TEXTURES
   ========================================================================== */
export function getArcherTunicTextures() {
  if (textureCache.has('tunic')) return textureCache.get('tunic');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Luminous Vibrant Emerald Tunic Base
  const tunicGrad = alb.createLinearGradient(0, 0, 0, H);
  tunicGrad.addColorStop(0.0, '#34d399');
  tunicGrad.addColorStop(0.35, '#10b981');
  tunicGrad.addColorStop(0.70, '#059669');
  tunicGrad.addColorStop(1.0, '#047857');
  alb.fillStyle = tunicGrad;
  alb.fillRect(0, 0, W, H);

  // Cross-hatch fabric weave
  alb.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let x = 0; x < W; x += 12) alb.fillRect(x, 0, 4, H);
  alb.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let y = 0; y < H; y += 12) alb.fillRect(0, y, W, 4);

  // Golden Embroidered Hem Trims
  const goldEmbroidery = (yPos, height = 110) => {
    const gGrad = alb.createLinearGradient(0, yPos, 0, yPos + height);
    gGrad.addColorStop(0.0, '#fef08a');
    gGrad.addColorStop(0.3, '#facc15');
    gGrad.addColorStop(0.7, '#ca8a04');
    gGrad.addColorStop(1.0, '#78350f');
    alb.fillStyle = gGrad;
    alb.fillRect(0, yPos, W, height);

    for (let x = 140; x < W; x += 280) {
      drawFiligree(alb, x, yPos + height * 0.5, 220, height * 0.7, '#fffbeb');
    }

    alb.strokeStyle = '#451a03';
    alb.lineWidth = 6;
    alb.strokeRect(0, yPos, W, height);
  };

  goldEmbroidery(0, 100);
  goldEmbroidery(H - 140, 140);

  // Center vertical split piping
  const vGrad = alb.createLinearGradient(W * 0.46, 0, W * 0.54, 0);
  vGrad.addColorStop(0, '#ca8a04');
  vGrad.addColorStop(0.5, '#fef08a');
  vGrad.addColorStop(1, '#ca8a04');
  alb.fillStyle = vGrad;
  alb.fillRect(W * 0.48, 100, W * 0.04, H - 240);

  // Roughness Map
  rgh.fillStyle = '#8c9ba5'; // cloth ~ 0.55
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#3a3a3a'; // gold embroidery ~ 0.22
  rgh.fillRect(0, 0, W, 100);
  rgh.fillRect(0, H - 140, W, 140);

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e6e6e6'; // gold embroidery ~ 0.90
  met.fillRect(0, 0, W, 100);
  met.fillRect(0, H - 140, W, 140);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b0b0b0';
  bmp.fillRect(0, 0, W, 100);
  bmp.fillRect(0, H - 140, W, 140);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('tunic', set);
  return set;
}

/* ==========================================================================
   5. STUDDED STEEL PAULDRONS & VAMBRACES TEXTURES
   ========================================================================== */
export function getArcherBracersPauldronsTextures() {
  if (textureCache.has('bracersPauldrons')) return textureCache.get('bracersPauldrons');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Steel plate gradient
  const steelGrad = alb.createLinearGradient(0, 0, W, H);
  steelGrad.addColorStop(0.0, '#cbd5e1');
  steelGrad.addColorStop(0.25, '#94a3b8');
  steelGrad.addColorStop(0.65, '#475569');
  steelGrad.addColorStop(0.90, '#334155');
  steelGrad.addColorStop(1.0, '#1e293b');
  alb.fillStyle = steelGrad;
  alb.fillRect(0, 0, W, H);

  // Bevel rim highlight
  alb.strokeStyle = '#f8fafc';
  alb.lineWidth = 12;
  alb.strokeRect(10, 10, W - 20, H - 20);

  // Rivets along borders
  for (let x = 160; x < W - 80; x += 280) {
    drawRivet(alb, x, 120, 26, false);
    drawRivet(alb, x, H - 120, 26, false);
  }

  // Scratches & battle wear
  alb.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  alb.lineWidth = 3;
  alb.beginPath();
  alb.moveTo(200, 300); alb.lineTo(600, 700);
  alb.moveTo(1100, 200); alb.lineTo(1500, 600);
  alb.moveTo(400, 1200); alb.lineTo(900, 1500);
  alb.stroke();

  // Roughness Map
  rgh.fillStyle = '#525252'; // smooth polished steel ~ 0.32
  rgh.fillRect(0, 0, W, H);

  // Metalness Map
  met.fillStyle = '#e6e6e6'; // metallic ~ 0.90
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b0b0b0';
  bmp.strokeRect(10, 10, W - 20, H - 20);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('bracersPauldrons', set);
  return set;
}

/* ==========================================================================
   6. OLIVE TROUSERS, KNEE POLEYNS & CUFFED BOOTS TEXTURES
   ========================================================================== */
export function getArcherLegsBootsTextures() {
  if (textureCache.has('legsBoots')) return textureCache.get('legsBoots');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Top Half: Olive Trousers (0 to H * 0.48)
  const trouserGrad = alb.createLinearGradient(0, 0, 0, H * 0.48);
  trouserGrad.addColorStop(0.0, '#4a5b3a');
  trouserGrad.addColorStop(0.5, '#39472c');
  trouserGrad.addColorStop(1.0, '#26301d');
  alb.fillStyle = trouserGrad;
  alb.fillRect(0, 0, W, H * 0.48);

  drawStitches(alb, W * 0.5, 0, W * 0.5, H * 0.48, 18, 10, '#a3b18a');

  // Bottom Half: Heavy Cuffed Leather Boots (H * 0.48 to H)
  const bootY = H * 0.48;
  const bootH = H - bootY;

  const bootGrad = alb.createLinearGradient(0, bootY, 0, H);
  bootGrad.addColorStop(0.0, '#7c431d');
  bootGrad.addColorStop(0.3, '#572c11');
  bootGrad.addColorStop(0.7, '#3b1c09');
  bootGrad.addColorStop(1.0, '#210e04');
  alb.fillStyle = bootGrad;
  alb.fillRect(0, bootY, W, bootH);

  // Folded Boot Cuff
  const cuffGrad = alb.createLinearGradient(0, bootY, 0, bootY + 140);
  cuffGrad.addColorStop(0, '#8d4f24');
  cuffGrad.addColorStop(1, '#53290e');
  alb.fillStyle = cuffGrad;
  alb.fillRect(0, bootY, W, 140);

  drawStitches(alb, 0, bootY + 15, W, bootY + 15, 20, 12, '#fde68a');
  drawStitches(alb, 0, bootY + 125, W, bootY + 125, 20, 12, '#fde68a');

  // Roughness Map
  rgh.fillStyle = '#d5d5d5'; // cloth ~ 0.84
  rgh.fillRect(0, 0, W, H * 0.48);
  rgh.fillStyle = '#8f8f8f'; // leather ~ 0.56
  rgh.fillRect(0, bootY, W, bootH);

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('legsBoots', set);
  return set;
}

/* ==========================================================================
   7. ORNATE CARVED RECURVE GOLDEN-OAK BOW TEXTURES
   ========================================================================== */
export function getArcherBowTextures() {
  if (textureCache.has('bow')) return textureCache.get('bow');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const woodGrad = alb.createLinearGradient(0, 0, 0, H);
  woodGrad.addColorStop(0.0, '#8c5324');
  woodGrad.addColorStop(0.3, '#bd7d3e');
  woodGrad.addColorStop(0.6, '#995c2b');
  woodGrad.addColorStop(1.0, '#663914');
  alb.fillStyle = woodGrad;
  alb.fillRect(0, 0, W, H);

  // Wood grain fibers
  alb.fillStyle = 'rgba(254, 215, 170, 0.08)';
  for (let x = 0; x < W; x += 14) alb.fillRect(x, 0, 5, H);
  alb.fillStyle = 'rgba(67, 31, 14, 0.12)';
  for (let x = 7; x < W; x += 14) alb.fillRect(x, 0, 4, H);

  // Golden Elven Filigree Scrollwork / Runes on Limbs
  for (let y = 160; y < H - 160; y += 220) {
    drawFiligree(alb, W * 0.5, y, 420, 110, '#fde047');
  }

  // Roughness Map
  rgh.fillStyle = '#666666'; // polished wood ~ 0.40
  rgh.fillRect(0, 0, W, H);

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('bow', set);
  return set;
}

/* ==========================================================================
   8. HAND-TOOLED LEATHER QUIVER WITH GOLD FILIGREE EMERALD COLLAR
   ========================================================================== */
export function getArcherQuiverTextures() {
  if (textureCache.has('quiver')) return textureCache.get('quiver');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Saddle Leather Gradient
  const qGrad = alb.createLinearGradient(0, 0, 0, H);
  qGrad.addColorStop(0.0, '#783d1c');
  qGrad.addColorStop(0.3, '#5c2d12');
  qGrad.addColorStop(0.7, '#421f0b');
  qGrad.addColorStop(1.0, '#271105');
  alb.fillStyle = qGrad;
  alb.fillRect(0, 0, W, H);

  // Diamond Embossed Tooling
  alb.strokeStyle = '#271105';
  alb.lineWidth = 8;
  for (let offset = -W; offset < W * 2; offset += 140) {
    alb.beginPath();
    alb.moveTo(offset, 220);
    alb.lineTo(offset + H - 320, H - 100);
    alb.stroke();

    alb.beginPath();
    alb.moveTo(offset + H - 320, 220);
    alb.lineTo(offset, H - 100);
    alb.stroke();
  }

  // Rivets at intersections
  for (let y = 300; y < H - 140; y += 180) {
    for (let x = 120; x < W; x += 220) {
      drawRivet(alb, x, y, 14, true);
    }
  }

  // Stitched vertical seams
  drawStitches(alb, 40, 220, 40, H - 100, 18, 10, '#fde68a');
  drawStitches(alb, W - 40, 220, W - 40, H - 100, 18, 10, '#fde68a');

  // Roughness Map
  rgh.fillStyle = '#949494'; // leather ~ 0.58
  rgh.fillRect(0, 0, W, H);

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('quiver', set);
  return set;
}
