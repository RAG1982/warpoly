import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Castle / Town Center
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen Triple-A standards (Valorant / Overwatch / UE5).
 * 
 * Generates 2048x2048 high-resolution textures tailored to castle architectural components:
 * - getCastleStoneTextures(): Ashlar cut granite stone blocks with hand-painted bevel highlights, dark mortar joints, and crevice moss.
 * - getCastleRoofTextures(): Vibrant layered scalloped slate tiles with edge highlights, golden ridge cap trim, and weathered gradient.
 * - getCastleTimberTextures(): Dark weathered oak planks with rich grain, knot details, and iron studs.
 * - getCastleDoorTextures(): Heavy oak timber planks banded with black wrought iron straps, studs, and lion-head door knockers.
 * - getCastleBannerTextures(): Deep sapphire blue cloth with gold lion crest, golden fringe, and cloth folds.
 * - getCastleShieldTextures(): Heraldic battlement shield with royal cobalt field, gold lion crest, and steel studded rim.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, isRepeat = true) {
  return makeTexture(canvas, isSRGB, { wrapS: isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping });
}

/**
 * Draw stylized 3D rivet / bolt with drop shadow and specular dome
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
 * Draw stylized square pyramid forged iron stud
 */
function drawSquareStud(ctx, cx, cy, size = 16, isGold = false) {
  ctx.save();
  const half = size / 2;

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(cx - half + 2, cy - half + 3, size, size);

  // Facet 1: Top facet (brightest highlight)
  ctx.fillStyle = isGold ? '#fffbeb' : '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy - half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Facet 2: Left facet (mid-bright)
  ctx.fillStyle = isGold ? '#fde047' : '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx - half, cy + half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Facet 3: Right facet (shaded)
  ctx.fillStyle = isGold ? '#d97706' : '#64748b';
  ctx.beginPath();
  ctx.moveTo(cx + half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Facet 4: Bottom facet (deep shadow)
  ctx.fillStyle = isGold ? '#78350f' : '#1e293b';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy + half);
  ctx.lineTo(cx + half, cy + half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw stylized rampant lion coat of arms
 */
function drawRampantLion(ctx, cx, cy, scaleX = 1.0, scaleY = scaleX, fillOverride = null) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);

  function renderLionPaths(c) {
    // 1. Crown
    c.beginPath();
    c.moveTo(-35, -100);
    c.lineTo(-28, -125);
    c.lineTo(-12, -110);
    c.lineTo(0, -135);
    c.lineTo(12, -110);
    c.lineTo(28, -125);
    c.lineTo(35, -100);
    c.closePath();
    c.fill();

    // 2. Head, Snout, Open Roaring Jaw & Mane, Torso
    c.beginPath();
    c.moveTo(20, -95);
    c.bezierCurveTo(45, -90, 58, -75, 55, -55);
    c.bezierCurveTo(60, -45, 75, -42, 70, -28); // Snout
    c.lineTo(48, -25);
    c.lineTo(55, -8);  // Open lower jaw
    c.lineTo(38, -5);
    c.bezierCurveTo(42, 10, 30, 20, 18, 25); // Throat / beard
    c.bezierCurveTo(35, 45, 40, 70, 32, 95);
    c.lineTo(15, 115);
    c.bezierCurveTo(5, 105, -15, 105, -28, 120); // Flank
    c.bezierCurveTo(-25, 80, -32, 50, -26, 25);  // Back
    c.bezierCurveTo(-45, 10, -60, -15, -52, -45); // Mane back
    c.bezierCurveTo(-60, -70, -45, -95, -20, -100);
    c.closePath();
    c.fill();

    // 3. Front Rampant Paws with Sharp Claws
    c.beginPath();
    c.moveTo(32, -18);
    c.lineTo(75, -32);
    c.lineTo(84, -25);
    c.lineTo(70, -12);
    c.lineTo(38, -5);
    c.fill();

    c.beginPath();
    c.moveTo(26, 10);
    c.lineTo(88, 10);
    c.lineTo(96, 20);
    c.lineTo(78, 28);
    c.lineTo(32, 22);
    c.fill();

    // 4. Hind Powerful Legs
    c.beginPath();
    c.moveTo(20, 95);
    c.lineTo(60, 130);
    c.lineTo(52, 142);
    c.lineTo(12, 115);
    c.fill();

    c.beginPath();
    c.moveTo(-18, 95);
    c.lineTo(-42, 132);
    c.lineTo(-54, 128);
    c.lineTo(-26, 110);
    c.fill();

    // 5. Arched S-Curving Tufted Tail
    c.beginPath();
    c.moveTo(-28, 70);
    c.bezierCurveTo(-65, 60, -85, 20, -70, -15);
    c.bezierCurveTo(-60, -35, -75, -60, -55, -80);
    c.bezierCurveTo(-40, -95, -45, -68, -55, -40);
    c.bezierCurveTo(-60, -5, -50, 40, -22, 75);
    c.fill();

    // Tufted flame-like tail tip
    c.beginPath();
    c.moveTo(-55, -80);
    c.bezierCurveTo(-70, -100, -45, -115, -35, -95);
    c.bezierCurveTo(-28, -88, -42, -75, -55, -80);
    c.fill();
  }

  if (fillOverride) {
    ctx.fillStyle = fillOverride;
    renderLionPaths(ctx);
    ctx.restore();
    return;
  }

  // Outer dark drop-shadow & outline
  ctx.shadowColor = 'rgba(2, 6, 23, 0.95)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 12;

  ctx.strokeStyle = '#050a18';
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#050a18';

  // Silhouette pass for bold outline
  renderLionPaths(ctx);

  // Clear drop shadow for fill pass
  ctx.shadowColor = 'transparent';

  // Radiant Gold gradient fill (AAA stylized palette)
  const gold = ctx.createLinearGradient(-50, -135, 60, 135);
  gold.addColorStop(0, '#ffffff');    // Specular peak
  gold.addColorStop(0.12, '#fef9c3'); // Bright light gold
  gold.addColorStop(0.35, '#fde047'); // Vibrant royal gold
  gold.addColorStop(0.60, '#f59e0b'); // Classic amber gold
  gold.addColorStop(0.85, '#d97706'); // Deep warm gold
  gold.addColorStop(1, '#92400e');    // Rich shadow
  ctx.fillStyle = gold;
  renderLionPaths(ctx);

  // Clean edge highlight linework (Triple-A hand-painted look)
  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 3.5;

  // Crown highlight
  ctx.beginPath();
  ctx.moveTo(-32, -100);
  ctx.lineTo(-28, -120);
  ctx.lineTo(-12, -108);
  ctx.lineTo(0, -130);
  ctx.lineTo(12, -108);
  ctx.lineTo(28, -120);
  ctx.lineTo(32, -100);
  ctx.stroke();

  // Mane & brow highlight
  ctx.beginPath();
  ctx.moveTo(20, -90);
  ctx.bezierCurveTo(40, -85, 50, -70, 48, -52);
  ctx.stroke();

  // Back highlight
  ctx.beginPath();
  ctx.moveTo(-20, -95);
  ctx.bezierCurveTo(-40, -65, -50, -40, -45, -10);
  ctx.bezierCurveTo(-40, 20, -22, 50, -20, 80);
  ctx.stroke();

  // Tail highlight
  ctx.beginPath();
  ctx.moveTo(-28, 70);
  ctx.bezierCurveTo(-60, 60, -75, 20, -65, -15);
  ctx.stroke();

  // Chest muscle highlight
  ctx.beginPath();
  ctx.moveTo(25, 30);
  ctx.bezierCurveTo(30, 55, 28, 80, 18, 100);
  ctx.stroke();

  // Ruby Eye with white glint
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(38, -60, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(39.5, -61.5, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Sharp ivory fangs & claws
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(48, -25);
  ctx.lineTo(44, -18);
  ctx.lineTo(41, -25);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(49, -8);
  ctx.lineTo(45, -15);
  ctx.lineTo(42, -8);
  ctx.closePath();
  ctx.fill();

  // Forepaw claws
  [[84, -25], [96, 20]].forEach(([px, py]) => {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 8, py - 4);
    ctx.lineTo(px + 4, py + 5);
    ctx.closePath();
    ctx.fill();
  });

  // Red roaring tongue
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(44, -20);
  ctx.quadraticCurveTo(55, -18, 52, -12);
  ctx.lineTo(42, -12);
  ctx.closePath();
  ctx.fill();

  // Crown Rubies
  [-22, 0, 22].forEach(rx => {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(rx, -108, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.arc(rx - 1, -109, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Draw stylized sculpted Lion Head Door Knocker
 */
function drawLionDoorKnocker(ctx, cx, cy, scale = 1.0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // 1. Heavy Forged Iron Torc / Ring hanging from mouth
  const ringRadius = 75;
  const ringY = 50;

  // Ring drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.arc(4, ringY + 6, ringRadius, 0, Math.PI * 2);
  ctx.arc(4, ringY + 6, ringRadius - 22, 0, Math.PI * 2, true);
  ctx.fill();

  // Ring forged iron gradient
  const ringGrad = ctx.createLinearGradient(-ringRadius, ringY - ringRadius, ringRadius, ringY + ringRadius);
  ringGrad.addColorStop(0, '#f8fafc');
  ringGrad.addColorStop(0.3, '#94a3b8');
  ringGrad.addColorStop(0.7, '#475569');
  ringGrad.addColorStop(1, '#0f172a');

  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(0, ringY, ringRadius, 0, Math.PI * 2);
  ctx.arc(0, ringY, ringRadius - 22, 0, Math.PI * 2, true);
  ctx.fill();

  // Ring bottom strike stud on wood
  drawRivet(ctx, 0, ringY + ringRadius - 11, 16, false);

  // 2. Lion Head Sculpted Face (Golden Bronze / Brass)
  // Drop shadow behind head
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.arc(4, 6, 85, 0, Math.PI * 2);
  ctx.fill();

  // Radial Lion Mane
  const maneGrad = ctx.createRadialGradient(0, -20, 10, 0, 0, 95);
  maneGrad.addColorStop(0, '#fef08a');
  maneGrad.addColorStop(0.4, '#f59e0b');
  maneGrad.addColorStop(0.8, '#b45309');
  maneGrad.addColorStop(1, '#451a03');

  ctx.fillStyle = maneGrad;
  ctx.beginPath();
  // Sculpted radiating flame mane points
  const points = 16;
  for (let i = 0; i < points; i++) {
    const angle1 = (i / points) * Math.PI * 2;
    const angle2 = ((i + 0.5) / points) * Math.PI * 2;
    const rOuter = 88 + (i % 2 === 0 ? 12 : -4);
    const rInner = 68;
    if (i === 0) {
      ctx.moveTo(Math.cos(angle1) * rOuter, Math.sin(angle1) * rOuter);
    } else {
      ctx.lineTo(Math.cos(angle1) * rOuter, Math.sin(angle1) * rOuter);
    }
    ctx.lineTo(Math.cos(angle2) * rInner, Math.sin(angle2) * rInner);
  }
  ctx.closePath();
  ctx.fill();

  // Mane edge highlights
  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Sculpted Face Dome
  const faceGrad = ctx.createRadialGradient(-15, -25, 5, 0, -10, 60);
  faceGrad.addColorStop(0, '#ffffff');
  faceGrad.addColorStop(0.2, '#fde047');
  faceGrad.addColorStop(0.65, '#d97706');
  faceGrad.addColorStop(1, '#78350f');

  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(0, -10, 52, 60, 0, 0, Math.PI * 2);
  ctx.fill();

  // Brow & Snout Ridge
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-28, -38);
  ctx.quadraticCurveTo(0, -48, 28, -38);
  ctx.lineTo(16, -15);
  ctx.lineTo(0, 5);
  ctx.lineTo(-16, -15);
  ctx.closePath();
  ctx.fill();

  // Deep Eyes with Ruby Glint
  [-22, 22].forEach(ex => {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(ex, -28, 12, 7, ex > 0 ? 0.3 : -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ex, -28, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - 1.5, -29.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Black Nose & Whiskers pad
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.moveTo(-16, -12);
  ctx.lineTo(16, -12);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  // Open Roaring Mouth Cavity (Torc passes through here)
  ctx.fillStyle = '#05070b';
  ctx.beginPath();
  ctx.ellipse(0, 22, 28, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sharp fangs
  ctx.fillStyle = '#ffffff';
  [-16, 16].forEach(fx => {
    ctx.beginPath();
    ctx.moveTo(fx - 5, 8);
    ctx.lineTo(fx + 5, 8);
    ctx.lineTo(fx, 24);
    ctx.closePath();
    ctx.fill();
  });

  // Lower jaw chin
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.arc(0, 36, 18, 0, Math.PI);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw intricate gold embroidery filigree band
 */
function drawFiligreeBand(ctx, x, y, w, h) {
  ctx.save();
  const gold = ctx.createLinearGradient(x, y, x + w, y + h);
  gold.addColorStop(0, '#fffbeb');
  gold.addColorStop(0.25, '#fef08a');
  gold.addColorStop(0.5, '#f59e0b');
  gold.addColorStop(0.8, '#d97706');
  gold.addColorStop(1, '#78350f');

  ctx.fillStyle = gold;
  ctx.fillRect(x, y, w, h);

  // Deep engraved inner lines
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

  // Braided diamond knotwork
  const step = 64;
  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let px = x + 16; px < x + w - 16; px += step) {
    const midY = y + h / 2;
    ctx.moveTo(px, midY);
    ctx.lineTo(px + step / 2, y + 6);
    ctx.lineTo(px + step, midY);
    ctx.lineTo(px + step / 2, y + h - 6);
    ctx.closePath();

    ctx.fillStyle = '#fef08a';
    ctx.arc(px + step / 2, midY, 4, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

// =========================================================================
// 1. ASHLAR CUT GRANITE STONE MASONRY TEXTURE
// =========================================================================
export function getCastleStoneTextures() {
  if (textureCache.has('stone')) return textureCache.get('stone');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // Deep dark mortar background
  ctx.fillStyle = '#1b1e25';
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#dedede'; // Rough mortar ~ 0.87
  rCtx.fillRect(0, 0, width, height);

  mCtx.fillStyle = '#000000'; // Stone is non-metallic
  mCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#1c1c1c'; // Mortar recessed in bump map
  bCtx.fillRect(0, 0, width, height);

  // Seamless Tileable Ashlar Layout: 8 rows of blocks, 4 blocks wide
  const rows = 8;
  const cols = 4;
  const blockH = height / rows; // 256px
  const blockW = width / cols;  // 512px
  const gap = 16;               // Mortar joint gap

  const stonePalette = [
    { base: '#88939e', light: '#aab4be', dark: '#636e78' },
    { base: '#9aa3ad', light: '#bcc4cd', dark: '#737d88' },
    { base: '#7d8692', light: '#9fa8b3', dark: '#5b6571' },
    { base: '#8f9aa5', light: '#b1bbc5', dark: '#6d7782' },
    { base: '#949ea8', light: '#b6bfca', dark: '#717a85' },
    { base: '#78818c', light: '#9aa3ad', dark: '#57606b' }
  ];

  // Helper to draw a single stylized ashlar stone block
  function drawAshlarBlock(x, y, w, h, seed) {
    const pal = stonePalette[Math.abs(seed) % stonePalette.length];
    const bx = x + gap / 2;
    const by = y + gap / 2;
    const bw = w - gap;
    const bh = h - gap;
    const radius = 8;

    // Stone base volumetric gradient (lighting from top-left)
    const blockGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    blockGrad.addColorStop(0, pal.light);
    blockGrad.addColorStop(0.35, pal.base);
    blockGrad.addColorStop(0.85, pal.dark);
    blockGrad.addColorStop(1, '#3b434c');

    ctx.fillStyle = blockGrad;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, radius);
    ctx.fill();

    // Bump map for elevated stone face
    const bGrad = bCtx.createLinearGradient(bx, by, bx + bw, by + bh);
    bGrad.addColorStop(0, '#e5e5e5');
    bGrad.addColorStop(0.5, '#b0b0b0');
    bGrad.addColorStop(1, '#505050');
    bCtx.fillStyle = bGrad;
    bCtx.beginPath();
    bCtx.roundRect(bx, by, bw, bh, radius);
    bCtx.fill();

    // Roughness for stone face
    rCtx.fillStyle = '#b0b0b0'; // Stone surface ~ 0.69
    rCtx.beginPath();
    rCtx.roundRect(bx, by, bw, bh, radius);
    rCtx.fill();

    // Stylized hand-painted chisel striations
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 3;
    const lines = 4 + (seed % 4);
    for (let l = 0; l < lines; l++) {
      const lx = bx + 25 + l * (bw / (lines + 1));
      ctx.beginPath();
      ctx.moveTo(lx, by + 12);
      ctx.lineTo(lx + 35, by + bh - 12);
      ctx.stroke();
    }

    // Hand-painted chiseled bevel edge highlights (Top & Left edges)
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    // Top highlight
    ctx.moveTo(bx + radius, by + 2);
    ctx.lineTo(bx + bw - radius, by + 2);
    // Left highlight
    ctx.moveTo(bx + 2, by + radius);
    ctx.lineTo(bx + 2, by + bh - radius);
    ctx.stroke();

    // Ambient occlusion drop shadow along bottom & right inside mortar joint
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    // Bottom shadow
    ctx.moveTo(bx + radius, by + bh - 3);
    ctx.lineTo(bx + bw - radius, by + bh - 3);
    // Right shadow
    ctx.moveTo(bx + bw - 3, by + radius);
    ctx.lineTo(bx + bw - 3, by + bh - radius);
    ctx.stroke();

    // Bump edge highlights and shadows
    bCtx.strokeStyle = '#ffffff';
    bCtx.lineWidth = 4;
    bCtx.beginPath();
    bCtx.moveTo(bx + radius, by + 2);
    bCtx.lineTo(bx + bw - radius, by + 2);
    bCtx.moveTo(bx + 2, by + radius);
    bCtx.lineTo(bx + 2, by + bh - radius);
    bCtx.stroke();

    bCtx.strokeStyle = '#252525';
    bCtx.lineWidth = 5;
    bCtx.beginPath();
    bCtx.moveTo(bx + radius, by + bh - 3);
    bCtx.lineTo(bx + bw - radius, by + bh - 3);
    bCtx.moveTo(bx + bw - 3, by + radius);
    bCtx.lineTo(bx + bw - 3, by + bh - radius);
    bCtx.stroke();

    // Stylized Crevice Moss & Lichen (clusters in lower corners)
    if (seed % 3 === 0) {
      const mossX = bx + bw - 20;
      const mossY = by + bh - 12;
      const mossColors = ['#2d502a', '#4a7c3e', '#65a344', '#386634'];
      for (let m = 0; m < 8; m++) {
        const mx = mossX - (m * 8) + (Math.sin(m) * 6);
        const my = mossY - (m % 3) * 6;
        ctx.fillStyle = mossColors[m % mossColors.length];
        ctx.beginPath();
        ctx.arc(mx, my, 4 + (m % 3) * 2, 0, Math.PI * 2);
        ctx.fill();

        rCtx.fillStyle = '#c5c5c5';
        rCtx.beginPath();
        rCtx.arc(mx, my, 4 + (m % 3) * 2, 0, Math.PI * 2);
        rCtx.fill();
      }
    }
  }

  // Draw tileable rows with wrap support
  for (let r = 0; r < rows; r++) {
    const y = r * blockH;
    const isOdd = r % 2 === 1;
    const xOffset = isOdd ? blockW / 2 : 0;

    for (let c = -1; c <= cols; c++) {
      const x = c * blockW + xOffset;
      const seed = r * 13 + c * 7 + 19;
      // Draw stone
      drawAshlarBlock(x, y, blockW, blockH, seed);
      // Handle wrapping edges cleanly
      if (x < 0) {
        drawAshlarBlock(x + width, y, blockW, blockH, seed);
      }
      if (x + blockW > width) {
        drawAshlarBlock(x - width, y, blockW, blockH, seed);
      }
    }
  }

  const texSet = {
    map: toTexture(albedo, true, true),
    roughnessMap: toTexture(rough, false, true),
    metalnessMap: toTexture(metal, false, true),
    bumpMap: toTexture(bump, false, true)
  };

  textureCache.set('stone', texSet);
  return texSet;
}

// =========================================================================
// 2. ROYAL BLUE SCALLOPED SLATE SHINGLES & GOLD TRIM TEXTURE
// =========================================================================
export function getCastleRoofTextures() {
  if (textureCache.has('roof')) return textureCache.get('roof');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // Dark slate underlay
  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#8c8c8c'; // Polished slate roughness ~ 0.55
  rCtx.fillRect(0, 0, width, height);

  mCtx.fillStyle = '#000000'; // Slate is non-metallic
  mCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#404040';
  bCtx.fillRect(0, 0, width, height);

  // 12 Rows of Scalloped Slate Shingles
  const rows = 12;
  const cols = 10;
  const rowH = height / rows;     // ~170.6px
  const shingleW = width / cols;  // ~204.8px

  const blueShades = [
    { base: '#1d4ed8', light: '#3b82f6', dark: '#172554' },
    { base: '#2563eb', light: '#60a5fa', dark: '#1e3a8a' },
    { base: '#1e40af', light: '#3b82f6', dark: '#0f172a' },
    { base: '#0284c7', light: '#38bdf8', dark: '#0369a1' },
    { base: '#1e3a8a', light: '#2563eb', dark: '#0a0f1d' }
  ];

  function drawScallopShingle(x, y, w, h, seed) {
    const pal = blueShades[Math.abs(seed) % blueShades.length];
    const shingleH = h * 1.35; // Overlap factor

    // Shingle path: scalloped rounded shield curve
    ctx.save();
    bCtx.save();
    rCtx.save();

    function createScallopPath(c) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w, y + shingleH * 0.55);
      c.bezierCurveTo(x + w, y + shingleH, x + w * 0.5, y + shingleH, x + w * 0.5, y + shingleH);
      c.bezierCurveTo(x + w * 0.5, y + shingleH, x, y + shingleH, x, y + shingleH * 0.55);
      c.closePath();
    }

    // Ambient drop shadow under tile above
    ctx.fillStyle = 'rgba(5, 10, 25, 0.7)';
    createScallopPath(ctx);
    ctx.fill();

    // Vibrant royal sapphire gradient
    const tileGrad = ctx.createLinearGradient(x, y, x, y + shingleH);
    tileGrad.addColorStop(0, pal.dark);
    tileGrad.addColorStop(0.35, pal.base);
    tileGrad.addColorStop(0.85, pal.light);
    tileGrad.addColorStop(1, '#93c5fd');

    ctx.fillStyle = tileGrad;
    createScallopPath(ctx);
    ctx.fill();

    // Slate grain striations
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, y + 20);
    ctx.lineTo(x + w * 0.42, y + shingleH - 18);
    ctx.moveTo(x + w * 0.65, y + 25);
    ctx.lineTo(x + w * 0.58, y + shingleH - 22);
    ctx.stroke();

    // Beveled rim edge highlight along bottom curve
    ctx.strokeStyle = '#bfdbfe';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + w, y + shingleH * 0.6);
    ctx.bezierCurveTo(x + w, y + shingleH, x + w * 0.5, y + shingleH, x + w * 0.5, y + shingleH);
    ctx.bezierCurveTo(x + w * 0.5, y + shingleH, x, y + shingleH, x, y + shingleH * 0.6);
    ctx.stroke();

    // Bump Map
    const bGrad = bCtx.createLinearGradient(x, y, x, y + shingleH);
    bGrad.addColorStop(0, '#303030');
    bGrad.addColorStop(0.7, '#a0a0a0');
    bGrad.addColorStop(1, '#e0e0e0');
    bCtx.fillStyle = bGrad;
    createScallopPath(bCtx);
    bCtx.fill();

    bCtx.strokeStyle = '#ffffff';
    bCtx.lineWidth = 4;
    bCtx.beginPath();
    bCtx.moveTo(x + w, y + shingleH * 0.6);
    bCtx.bezierCurveTo(x + w, y + shingleH, x + w * 0.5, y + shingleH, x + w * 0.5, y + shingleH);
    bCtx.bezierCurveTo(x + w * 0.5, y + shingleH, x, y + shingleH, x, y + shingleH * 0.6);
    bCtx.stroke();

    // Roughness Map: smoother on edge highlight
    rCtx.fillStyle = '#808080';
    createScallopPath(rCtx);
    rCtx.fill();

    rCtx.strokeStyle = '#555555';
    rCtx.lineWidth = 4;
    rCtx.beginPath();
    rCtx.moveTo(x + w, y + shingleH * 0.6);
    rCtx.bezierCurveTo(x + w, y + shingleH, x + w * 0.5, y + shingleH, x + w * 0.5, y + shingleH);
    rCtx.bezierCurveTo(x + w * 0.5, y + shingleH, x, y + shingleH, x, y + shingleH * 0.6);
    rCtx.stroke();

    ctx.restore();
    bCtx.restore();
    rCtx.restore();
  }

  // Draw shingles from top to bottom so lower shingles overlap upper ones
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const xOffset = isOdd ? shingleW / 2 : 0;

    for (let c = -1; c <= cols; c++) {
      const x = c * shingleW + xOffset;
      const seed = r * 17 + c * 11 + 3;
      drawScallopShingle(x, y, shingleW, rowH, seed);
      if (x < 0) {
        drawScallopShingle(x + width, y, shingleW, rowH, seed);
      }
      if (x + shingleW > width) {
        drawScallopShingle(x - width, y, shingleW, rowH, seed);
      }
    }
  }

  // Golden Ridge Cap Trim along the very top (y = 0 to 180)
  drawFiligreeBand(ctx, 0, 10, width, 140);
  mCtx.fillStyle = '#d4d4d4'; // Gold metalness ~ 0.83
  mCtx.fillRect(0, 10, width, 140);
  rCtx.fillStyle = '#3a3a3a'; // Gold roughness ~ 0.23
  rCtx.fillRect(0, 10, width, 140);
  bCtx.fillStyle = '#b8b8b8';
  bCtx.fillRect(0, 10, width, 140);

  // Gold fleur-de-lis / studs along the cresting
  for (let gx = 64; gx < width; gx += 128) {
    drawRivet(ctx, gx, 80, 16, true);
    drawRivet(bCtx, gx, 80, 16, false);
  }

  const texSet = {
    map: toTexture(albedo, true, true),
    roughnessMap: toTexture(rough, false, true),
    metalnessMap: toTexture(metal, false, true),
    bumpMap: toTexture(bump, false, true)
  };

  textureCache.set('roof', texSet);
  return texSet;
}

// =========================================================================
// 3. WEATHERED TIMBER & BEAMS TEXTURE
// =========================================================================
export function getCastleTimberTextures() {
  if (textureCache.has('timber')) return textureCache.get('timber');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // Dark crevice background
  ctx.fillStyle = '#170e06';
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#bfbfbf'; // Oak roughness ~ 0.75
  rCtx.fillRect(0, 0, width, height);

  mCtx.fillStyle = '#000000'; // Non-metallic
  mCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#202020';
  bCtx.fillRect(0, 0, width, height);

  // 6 Vertical Oak Planks
  const plankCount = 6;
  const plankW = width / plankCount; // ~341.3px
  const grooveW = 14;

  const oakTones = [
    { base: '#5c381e', light: '#7c4d2b', dark: '#3b2210' },
    { base: '#684023', light: '#885631', dark: '#422714' },
    { base: '#54331a', light: '#724524', dark: '#351d0d' },
    { base: '#603c20', light: '#7e502c', dark: '#3d2512' },
    { base: '#58361c', light: '#784a27', dark: '#38200e' },
    { base: '#643e22', light: '#84532e', dark: '#402613' }
  ];

  for (let p = 0; p < plankCount; p++) {
    const px = p * plankW + grooveW / 2;
    const pw = plankW - grooveW;
    const pal = oakTones[p % oakTones.length];

    // Plank base gradient (horizontal curvature lighting)
    const plankGrad = ctx.createLinearGradient(px, 0, px + pw, 0);
    plankGrad.addColorStop(0, pal.dark);
    plankGrad.addColorStop(0.2, pal.light);
    plankGrad.addColorStop(0.65, pal.base);
    plankGrad.addColorStop(1, pal.dark);

    ctx.fillStyle = plankGrad;
    ctx.fillRect(px, 0, pw, height);

    // Bump base for plank
    const bGrad = bCtx.createLinearGradient(px, 0, px + pw, 0);
    bGrad.addColorStop(0, '#505050');
    bGrad.addColorStop(0.5, '#b0b0b0');
    bGrad.addColorStop(1, '#505050');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(px, 0, pw, height);

    // Flowing Stylized Wood Grain Lines
    const grainCount = 14;
    for (let g = 0; g < grainCount; g++) {
      const gx = px + 15 + g * (pw / grainCount);
      const isLight = g % 2 === 0;

      ctx.strokeStyle = isLight ? 'rgba(217, 164, 114, 0.18)' : 'rgba(30, 16, 8, 0.28)';
      ctx.lineWidth = 3 + (g % 3);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(
        gx + (Math.sin(p + g) * 28),
        height * 0.35,
        gx - (Math.cos(p + g) * 32),
        height * 0.7,
        gx + (Math.sin(g) * 16),
        height
      );
      ctx.stroke();
    }

    // Stylized Wood Knots
    const knotY1 = height * (0.25 + (p * 0.13) % 0.5);
    const knotX1 = px + pw * 0.45;
    const knotGrad = ctx.createRadialGradient(knotX1, knotY1, 4, knotX1, knotY1, 48);
    knotGrad.addColorStop(0, '#1c0c04');
    knotGrad.addColorStop(0.4, '#381807');
    knotGrad.addColorStop(0.8, pal.base);
    knotGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = knotGrad;
    ctx.beginPath();
    ctx.ellipse(knotX1, knotY1, 42, 54, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Knot concentric grain rings
    ctx.strokeStyle = '#c49363';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(knotX1, knotY1, 24, 32, 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(knotX1, knotY1, 38, 48, 0.2, 0, Math.PI * 2);
    ctx.stroke();

    // Plank Edge Highlights & Shadows
    ctx.strokeStyle = '#c49363';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(px + 2, 0);
    ctx.lineTo(px + 2, height);
    ctx.stroke();

    ctx.strokeStyle = '#120803';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(px + pw - 2, 0);
    ctx.lineTo(px + pw - 2, height);
    ctx.stroke();

    // Forged Iron Studs at Top, Middle, and Bottom
    [120, 680, 1360, 1920].forEach(sy => {
      drawSquareStud(ctx, px + pw * 0.5, sy, 22, false);
      drawSquareStud(bCtx, px + pw * 0.5, sy, 22, false);

      // Iron stud metalness
      mCtx.fillStyle = '#a0a0a0';
      mCtx.fillRect(px + pw * 0.5 - 11, sy - 11, 22, 22);
      rCtx.fillStyle = '#4a4a4a';
      rCtx.fillRect(px + pw * 0.5 - 11, sy - 11, 22, 22);
    });
  }

  const texSet = {
    map: toTexture(albedo, true, true),
    roughnessMap: toTexture(rough, false, true),
    metalnessMap: toTexture(metal, false, true),
    bumpMap: toTexture(bump, false, true)
  };

  textureCache.set('timber', texSet);
  return texSet;
}

// =========================================================================
// 4. FORTIFIED PORTCULLIS GRAND DOUBLE DOORS TEXTURE
// =========================================================================
export function getCastleDoorTextures() {
  if (textureCache.has('door')) return textureCache.get('door');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // Background heavy dark oak planks
  const doorWoodGrad = ctx.createLinearGradient(0, 0, 0, height);
  doorWoodGrad.addColorStop(0, '#351d0d');
  doorWoodGrad.addColorStop(0.3, '#543219');
  doorWoodGrad.addColorStop(0.7, '#422511');
  doorWoodGrad.addColorStop(1, '#241207');

  ctx.fillStyle = doorWoodGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#b0b0b0'; // Wood roughness ~ 0.69
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000'; // Wood non-metallic
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#606060';
  bCtx.fillRect(0, 0, width, height);

  // 10 Heavy Vertical Planks (5 on left leaf, 5 on right leaf)
  const plankW = width / 10;
  for (let i = 0; i < 10; i++) {
    const px = i * plankW;
    // Plank grooves
    ctx.fillStyle = 'rgba(10, 5, 2, 0.75)';
    ctx.fillRect(px, 0, 8, height);
    ctx.fillStyle = 'rgba(217, 164, 114, 0.2)';
    ctx.fillRect(px + 8, 0, 3, height);

    bCtx.fillStyle = '#202020';
    bCtx.fillRect(px, 0, 8, height);
    bCtx.fillStyle = '#909090';
    bCtx.fillRect(px + 8, 0, 3, height);
  }

  // Heavy Horizontal Black Wrought Iron Straps
  const strapYPositions = [260, 720, 1320, 1780];
  const strapH = 110;

  strapYPositions.forEach(sy => {
    // Strap shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(20, sy + strapH, width - 40, 16);

    // Wrought iron gunmetal gradient
    const ironGrad = ctx.createLinearGradient(0, sy, 0, sy + strapH);
    ironGrad.addColorStop(0, '#f1f5f9');
    ironGrad.addColorStop(0.25, '#94a3b8');
    ironGrad.addColorStop(0.7, '#475569');
    ironGrad.addColorStop(1, '#1e293b');

    ctx.fillStyle = ironGrad;
    ctx.fillRect(30, sy, width - 60, strapH);

    // Iron bevel highlights
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, sy + 2, width - 64, strapH - 4);

    // Metalness & roughness for iron strap
    mCtx.fillStyle = '#c5c5c5'; // Metalness ~ 0.77
    mCtx.fillRect(30, sy, width - 60, strapH);
    rCtx.fillStyle = '#4c4c4c'; // Roughness ~ 0.3
    rCtx.fillRect(30, sy, width - 60, strapH);
    bCtx.fillStyle = '#c0c0c0';
    bCtx.fillRect(30, sy, width - 60, strapH);

    // Forged Iron Studs along each strap
    for (let sx = 90; sx < width - 60; sx += 128) {
      if (Math.abs(sx - width / 2) > 60) {
        drawSquareStud(ctx, sx, sy + strapH / 2, 24, false);
        drawSquareStud(bCtx, sx, sy + strapH / 2, 24, false);
      }
    }
  });

  // Center Meeting Stile / Astragal Divider
  const midX = width / 2;
  const astragalW = 68;
  const astGrad = ctx.createLinearGradient(midX - astragalW / 2, 0, midX + astragalW / 2, 0);
  astGrad.addColorStop(0, '#0f172a');
  astGrad.addColorStop(0.3, '#94a3b8');
  astGrad.addColorStop(0.7, '#475569');
  astGrad.addColorStop(1, '#020617');

  ctx.fillStyle = astGrad;
  ctx.fillRect(midX - astragalW / 2, 0, astragalW, height);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(midX - astragalW / 2 + 2, 0, astragalW - 4, height);

  mCtx.fillStyle = '#cccccc';
  mCtx.fillRect(midX - astragalW / 2, 0, astragalW, height);
  rCtx.fillStyle = '#444444';
  rCtx.fillRect(midX - astragalW / 2, 0, astragalW, height);
  bCtx.fillStyle = '#d0d0d0';
  bCtx.fillRect(midX - astragalW / 2, 0, astragalW, height);

  // Studs along center astragal
  for (let ay = 120; ay < height; ay += 180) {
    drawRivet(ctx, midX, ay, 14, false);
    drawRivet(bCtx, midX, ay, 14, false);
  }

  // Gothic Keyhole Lock Plate on Center Astragal
  const lockY = 1040;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(midX, lockY - 14, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(midX - 10, lockY - 14);
  ctx.lineTo(midX + 10, lockY - 14);
  ctx.lineTo(midX + 14, lockY + 28);
  ctx.lineTo(midX - 14, lockY + 28);
  ctx.closePath();
  ctx.fill();

  // Grand Sculpted Lion Head Door Knockers on Left & Right Doors
  const knockerLeftX = width * 0.28;
  const knockerRightX = width * 0.72;
  const knockerY = 1040;

  drawLionDoorKnocker(ctx, knockerLeftX, knockerY, 1.35);
  drawLionDoorKnocker(ctx, knockerRightX, knockerY, 1.35);

  // Knocker metalness & roughness
  [knockerLeftX, knockerRightX].forEach(kx => {
    mCtx.fillStyle = '#e0e0e0'; // 0.88 metalness
    mCtx.beginPath();
    mCtx.arc(kx, knockerY, 130, 0, Math.PI * 2);
    mCtx.fill();

    rCtx.fillStyle = '#3a3a3a'; // 0.23 roughness
    rCtx.beginPath();
    rCtx.arc(kx, knockerY, 130, 0, Math.PI * 2);
    rCtx.fill();

    bCtx.fillStyle = '#e0e0e0';
    bCtx.beginPath();
    bCtx.arc(kx, knockerY, 110, 0, Math.PI * 2);
    bCtx.fill();
  });

  // Base Iron Kick Plate with Diagonal Reinforcement Crosses
  const kickY = height - 160;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(20, kickY, width - 40, 140);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 5;
  ctx.strokeRect(22, kickY + 2, width - 44, 136);

  mCtx.fillStyle = '#bfbfbf';
  mCtx.fillRect(20, kickY, width - 40, 140);
  rCtx.fillStyle = '#505050';
  rCtx.fillRect(20, kickY, width - 40, 140);

  const texSet = {
    map: toTexture(albedo, true, false),
    roughnessMap: toTexture(rough, false, false),
    metalnessMap: toTexture(metal, false, false),
    bumpMap: toTexture(bump, false, false)
  };

  textureCache.set('door', texSet);
  return texSet;
}

// =========================================================================
// 5. ROYAL LION HERALDIC BANNER TEXTURE
// =========================================================================
export function getCastleBannerTextures() {
  if (textureCache.has('banner')) return textureCache.get('banner');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // Deep Royal Sapphire Blue Velvet Fabric
  const blueGrad = ctx.createLinearGradient(0, 0, 0, height);
  blueGrad.addColorStop(0, '#1d4ed8');   // Radiant royal blue
  blueGrad.addColorStop(0.3, '#1e40af'); // Heraldic cobalt
  blueGrad.addColorStop(0.7, '#1e3a8a'); // Deep sapphire
  blueGrad.addColorStop(1, '#0f172a');   // Hem shade

  ctx.fillStyle = blueGrad;
  ctx.fillRect(0, 0, width, height);

  // Velvet cloth diffuse roughness: 0.90, metalness: 0.0
  rCtx.fillStyle = '#e6e6e6';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Vertical Flowing Satin Cloth Folds (Drape Shading)
  const foldCount = 8;
  const foldW = width / foldCount;
  for (let i = 0; i < foldCount; i++) {
    const fx = i * foldW;
    const foldGrad = ctx.createLinearGradient(fx, 0, fx + foldW, 0);
    foldGrad.addColorStop(0, 'rgba(8, 15, 35, 0.6)');
    foldGrad.addColorStop(0.45, 'rgba(96, 165, 250, 0.35)');
    foldGrad.addColorStop(0.55, 'rgba(147, 197, 253, 0.45)');
    foldGrad.addColorStop(1, 'rgba(15, 23, 42, 0.55)');

    ctx.fillStyle = foldGrad;
    ctx.fillRect(fx, 0, foldW, height);

    // Bump for cloth folds
    const bFold = bCtx.createLinearGradient(fx, 0, fx + foldW, 0);
    bFold.addColorStop(0, '#555555');
    bFold.addColorStop(0.5, '#a5a5a5');
    bFold.addColorStop(1, '#555555');
    bCtx.fillStyle = bFold;
    bCtx.fillRect(fx, 0, foldW, height);
  }

  // Micro-weave cloth texture
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let y = 0; y < height; y += 8) {
    ctx.fillRect(0, y, width, 4);
  }

  // Intricate Gold Filigree Borders (Left, Right, Top)
  const borderW = 80;
  drawFiligreeBand(ctx, 20, 20, width - 40, borderW);
  drawFiligreeBand(ctx, 20, 20, borderW, height - 260);
  drawFiligreeBand(ctx, width - 20 - borderW, 20, borderW, height - 260);

  // Bottom Golden Fringe / Tassels
  const fringeY = height - 200;
  const fringeH = 180;
  drawFiligreeBand(ctx, 20, fringeY - 60, width - 40, 60);

  // Golden Bullion Tassels along bottom hem
  const tasselW = 32;
  for (let tx = 30; tx < width - 40; tx += tasselW) {
    const tGrad = ctx.createLinearGradient(tx, fringeY, tx + tasselW, fringeY + fringeH);
    tGrad.addColorStop(0, '#fffbeb');
    tGrad.addColorStop(0.3, '#fde047');
    tGrad.addColorStop(0.7, '#d97706');
    tGrad.addColorStop(1, '#78350f');

    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.moveTo(tx + 4, fringeY);
    ctx.lineTo(tx + tasselW - 4, fringeY);
    ctx.lineTo(tx + tasselW / 2, fringeY + fringeH - (tx % 64 === 0 ? 0 : 25));
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fffbeb';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Gold PBR for borders & fringe
  mCtx.fillStyle = '#d9d9d9'; // Metalness ~ 0.85
  mCtx.fillRect(20, 20, width - 40, borderW);
  mCtx.fillRect(20, 20, borderW, height - 260);
  mCtx.fillRect(width - 20 - borderW, 20, borderW, height - 260);
  mCtx.fillRect(20, fringeY - 60, width - 40, 60 + fringeH);

  rCtx.fillStyle = '#404040'; // Roughness ~ 0.25
  rCtx.fillRect(20, 20, width - 40, borderW);
  rCtx.fillRect(20, 20, borderW, height - 260);
  rCtx.fillRect(width - 20 - borderW, 20, borderW, height - 260);
  rCtx.fillRect(20, fringeY - 60, width - 40, 60 + fringeH);

  bCtx.fillStyle = '#c5c5c5';
  bCtx.fillRect(20, 20, width - 40, borderW);
  bCtx.fillRect(20, 20, borderW, height - 260);
  bCtx.fillRect(width - 20 - borderW, 20, borderW, height - 260);
  bCtx.fillRect(20, fringeY - 60, width - 40, 60 + fringeH);

  // Grand Golden Rampant Lion Crest in Center
  const lionCenterX = width / 2;
  const lionCenterY = height * 0.44;
  const lionScale = 4.6;

  // Bump & Roughness pass for Lion
  drawRampantLion(bCtx, lionCenterX, lionCenterY, lionScale, lionScale, '#d5d5d5');
  drawRampantLion(rCtx, lionCenterX, lionCenterY, lionScale, lionScale, '#323232');
  drawRampantLion(mCtx, lionCenterX, lionCenterY, lionScale, lionScale, '#f0f0f0');

  // Albedo pass
  drawRampantLion(ctx, lionCenterX, lionCenterY, lionScale);

  const texSet = {
    map: toTexture(albedo, true, false),
    roughnessMap: toTexture(rough, false, false),
    metalnessMap: toTexture(metal, false, false),
    bumpMap: toTexture(bump, false, false)
  };

  textureCache.set('banner', texSet);
  return texSet;
}

// =========================================================================
// 6. HERALDIC BATTLEMENT SHIELD TEXTURE
// =========================================================================
export function getCastleShieldTextures() {
  if (textureCache.has('shield')) return textureCache.get('shield');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  const cx = width / 2;
  const cy = height * 0.42;

  // Deep royal cobalt blue radial gradient
  const blueGrad = ctx.createRadialGradient(cx, cy, 100, cx, cy, width * 0.7);
  blueGrad.addColorStop(0, '#3b82f6');
  blueGrad.addColorStop(0.35, '#2563eb');
  blueGrad.addColorStop(0.7, '#1d4ed8');
  blueGrad.addColorStop(1, '#0f172a');

  ctx.fillStyle = blueGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#666666';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Diagonal Quartering Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, height);
  ctx.moveTo(width, 0);
  ctx.lineTo(0, height);
  ctx.stroke();

  // Polished Steel Bevel Border with Gold Rivets
  const rimW = 110;
  const rimGrad = ctx.createLinearGradient(0, 0, width, height);
  rimGrad.addColorStop(0, '#ffffff');
  rimGrad.addColorStop(0.25, '#e2e8f0');
  rimGrad.addColorStop(0.65, '#94a3b8');
  rimGrad.addColorStop(1, '#334155');

  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = rimW;
  ctx.strokeRect(rimW / 2, rimW / 2, width - rimW, height - rimW);

  mCtx.fillStyle = '#bfbfbf';
  mCtx.fillRect(0, 0, width, rimW);
  mCtx.fillRect(0, height - rimW, width, rimW);
  mCtx.fillRect(0, 0, rimW, height);
  mCtx.fillRect(width - rimW, 0, rimW, height);

  rCtx.fillStyle = '#4a4a4a';
  rCtx.fillRect(0, 0, width, rimW);
  rCtx.fillRect(0, height - rimW, width, rimW);
  rCtx.fillRect(0, 0, rimW, height);
  rCtx.fillRect(width - rimW, 0, rimW, height);

  bCtx.fillStyle = '#c5c5c5';
  bCtx.fillRect(0, 0, width, rimW);
  bCtx.fillRect(0, height - rimW, width, rimW);
  bCtx.fillRect(0, 0, rimW, height);
  bCtx.fillRect(width - rimW, 0, rimW, height);

  // Gold Rivets along the Rim
  const rStep = 180;
  for (let rx = rimW / 2; rx <= width - rimW / 2; rx += rStep) {
    drawRivet(ctx, rx, rimW / 2, 22, true);
    drawRivet(ctx, rx, height - rimW / 2, 22, true);
  }
  for (let ry = rimW / 2 + rStep; ry < height - rimW / 2; ry += rStep) {
    drawRivet(ctx, rimW / 2, ry, 22, true);
    drawRivet(ctx, width - rimW / 2, ry, 22, true);
  }

  // Golden Rampant Lion in Center
  const lionScale = 4.0;
  drawRampantLion(bCtx, cx, cy, lionScale, lionScale, '#d0d0d0');
  drawRampantLion(rCtx, cx, cy, lionScale, lionScale, '#323232');
  drawRampantLion(mCtx, cx, cy, lionScale, lionScale, '#f0f0f0');
  drawRampantLion(ctx, cx, cy, lionScale);

  const texSet = {
    map: toTexture(albedo, true, false),
    roughnessMap: toTexture(rough, false, false),
    metalnessMap: toTexture(metal, false, false),
    bumpMap: toTexture(bump, false, false)
  };

  textureCache.set('shield', texSet);
  return texSet;
}
