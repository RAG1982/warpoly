import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Bandit Camp
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 * 
 * Generates 2048x2048 high-detail textures:
 * 1. getCrimsonWarCanvasTextures(): Weathered dark crimson canvas with tribal slash runes, animal fur trims, bone stitching.
 * 2. getPalisadeStakeTextures(): Fire-hardened pointed log stakes with bark texture, dark charring at tips, rawhide bindings.
 * 3. getCampfireTextures(): Charred logs with glowing orange/yellow fire coals and grey ash gradient.
 * 4. getLootAndSkullsTextures(): Aged weathered bone skulls, iron-banded treasure chests spilling coins, barbaric iron spikes.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, isRepeat = false) {
  return makeTexture(canvas, isSRGB, { wrapS: isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping });
}

/**
 * Draw a stylized rivet or forged iron bolt with drop shadow and specular highlight
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  ctx.save();
  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  // Beveled outer ring
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  if (isGold) {
    ringGrad.addColorStop(0, '#fff4b8');
    ringGrad.addColorStop(0.3, '#f59e0b');
    ringGrad.addColorStop(0.7, '#b45309');
    ringGrad.addColorStop(1, '#451a03');
  } else {
    ringGrad.addColorStop(0, '#e2e8f0');
    ringGrad.addColorStop(0.3, '#94a3b8');
    ringGrad.addColorStop(0.7, '#334155');
    ringGrad.addColorStop(1, '#0f172a');
  }
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner dome
  const domeGrad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 1, cx, cy, radius * 0.8);
  if (isGold) {
    domeGrad.addColorStop(0, '#fffbeb');
    domeGrad.addColorStop(0.4, '#fbbf24');
    domeGrad.addColorStop(0.8, '#d97706');
    domeGrad.addColorStop(1, '#78350f');
  } else {
    domeGrad.addColorStop(0, '#f8fafc');
    domeGrad.addColorStop(0.35, '#cbd5e1');
    domeGrad.addColorStop(0.75, '#475569');
    domeGrad.addColorStop(1, '#1e293b');
  }
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw thick bone / rawhide stitches along a seam
 */
function drawBoneStitches(ctx, bCtx, x1, y1, x2, y2, stitchCount = 12, stitchW = 28, angle = 0.5) {
  const dx = (x2 - x1) / (stitchCount - 1);
  const dy = (y2 - y1) / (stitchCount - 1);

  for (let i = 0; i < stitchCount; i++) {
    const px = x1 + dx * i;
    const py = y1 + dy * i;
    const sa = (i % 2 === 0 ? angle : -angle);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(sa);

    // Dark punched hole punctures
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(-stitchW * 0.5, 0, 5, 0, Math.PI * 2);
    ctx.arc(stitchW * 0.5, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Drop shadow under stitch
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(-stitchW * 0.5 + 2, 2, stitchW, 8);

    // Bone stitch body
    const boneGrad = ctx.createLinearGradient(-stitchW * 0.5, -4, stitchW * 0.5, 4);
    boneGrad.addColorStop(0, '#d6d3d1');
    boneGrad.addColorStop(0.3, '#f5f5f4');
    boneGrad.addColorStop(0.7, '#e7e5e4');
    boneGrad.addColorStop(1, '#a8a29e');
    ctx.fillStyle = boneGrad;
    ctx.beginPath();
    ctx.roundRect(-stitchW * 0.5, -4, stitchW, 8, 4);
    ctx.fill();

    // Top highlight line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-stitchW * 0.4, -2);
    ctx.lineTo(stitchW * 0.4, -2);
    ctx.stroke();

    ctx.restore();

    if (bCtx) {
      bCtx.save();
      bCtx.translate(px, py);
      bCtx.rotate(sa);
      bCtx.fillStyle = '#ffffff';
      bCtx.fillRect(-stitchW * 0.5, -4, stitchW, 8);
      bCtx.fillStyle = '#000000';
      bCtx.beginPath();
      bCtx.arc(-stitchW * 0.5, 0, 5, 0, Math.PI * 2);
      bCtx.arc(stitchW * 0.5, 0, 5, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.restore();
    }
  }
}

/**
 * Draw savage tribal slash runes / claw marks
 */
function drawClawSlashes(ctx, cx, cy, size = 120, color = '#fef3c7') {
  ctx.save();
  ctx.translate(cx, cy);

  const clawOffsets = [-size * 0.35, 0, size * 0.35];
  clawOffsets.forEach((ox, idx) => {
    const curLen = size * (1.1 - Math.abs(idx - 1) * 0.2);
    // Shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox + 4, -curLen * 0.5 + 4);
    ctx.quadraticCurveTo(ox + 25 + 4, 0, ox - 10 + 4, curLen * 0.5 + 4);
    ctx.stroke();

    // Color slash
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox, -curLen * 0.5);
    ctx.quadraticCurveTo(ox + 25, 0, ox - 10, curLen * 0.5);
    ctx.stroke();

    // Inner sharp highlight core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ox + 2, -curLen * 0.4);
    ctx.quadraticCurveTo(ox + 22, 0, ox - 6, curLen * 0.4);
    ctx.stroke();
  });

  // Random paint spatters
  ctx.fillStyle = color;
  for (let s = 0; s < 6; s++) {
    const sx = (Math.random() - 0.5) * size * 1.2;
    const sy = (Math.random() - 0.5) * size * 1.2;
    const sr = 3 + Math.random() * 5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw a stylized savage horned skull sigil
 */
function drawTribalSkull(ctx, cx, cy, scale = 1.0, boneColor = '#fef3c7') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Shadow
  ctx.save();
  ctx.translate(6, 8);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  renderSkullPaths(ctx);
  ctx.fill();
  ctx.restore();

  // Bone Skull fill
  ctx.fillStyle = boneColor;
  renderSkullPaths(ctx);
  ctx.fill();

  // Eye sockets & nasal cavity (dark cavities)
  ctx.fillStyle = '#1c1917';
  // Left eye
  ctx.beginPath();
  ctx.moveTo(-38, -15);
  ctx.lineTo(-14, -20);
  ctx.lineTo(-18, 5);
  ctx.lineTo(-42, 2);
  ctx.closePath();
  ctx.fill();

  // Right eye
  ctx.beginPath();
  ctx.moveTo(38, -15);
  ctx.lineTo(14, -20);
  ctx.lineTo(18, 5);
  ctx.lineTo(42, 2);
  ctx.closePath();
  ctx.fill();

  // Nasal triangular hole
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(10, 22);
  ctx.lineTo(-10, 22);
  ctx.closePath();
  ctx.fill();

  // Upper teeth notches
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-28, 48);
  ctx.lineTo(28, 48);
  ctx.stroke();

  for (let tx = -20; tx <= 20; tx += 10) {
    ctx.beginPath();
    ctx.moveTo(tx, 38);
    ctx.lineTo(tx, 56);
    ctx.stroke();
  }

  // Blood war paint markings across forehead
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.moveTo(-50, -35);
  ctx.lineTo(50, -35);
  ctx.lineTo(45, -22);
  ctx.lineTo(-45, -22);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function renderSkullPaths(c) {
  c.beginPath();
  // Cranium dome
  c.moveTo(-55, -20);
  c.bezierCurveTo(-65, -75, 65, -75, 55, -20);
  // Cheekbones
  c.lineTo(60, 15);
  c.lineTo(35, 25);
  // Maxilla / teeth snout
  c.lineTo(32, 58);
  c.lineTo(-32, 58);
  c.lineTo(-35, 25);
  c.lineTo(-60, 15);
  c.closePath();

  // Bull Horns sweeping outwards
  // Left Horn
  c.moveTo(-45, -45);
  c.bezierCurveTo(-110, -70, -135, -20, -115, 35);
  c.bezierCurveTo(-110, 0, -85, -25, -40, -30);
  c.closePath();

  // Right Horn
  c.moveTo(45, -45);
  c.bezierCurveTo(110, -70, 135, -20, 115, 35);
  c.bezierCurveTo(110, 0, 85, -25, 40, -30);
  c.closePath();
}

/* ==========================================================================
   1. CRIMSON WAR CANVAS & HIDES (Tents, Canopies, War Flags)
   ========================================================================== */
export function getCrimsonWarCanvasTextures() {
  if (textureCache.has('crimsonWarCanvas')) {
    return textureCache.get('crimsonWarCanvas');
  }

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // --- Base Canvas Fill: Deep Weathered War Crimson ---
  const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
  baseGrad.addColorStop(0, '#5a0f0f');
  baseGrad.addColorStop(0.3, '#7d1818');
  baseGrad.addColorStop(0.65, '#991b1b');
  baseGrad.addColorStop(0.9, '#631010');
  baseGrad.addColorStop(1, '#3b0a0a');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // Roughness & Metalness defaults
  rCtx.fillStyle = '#dcdcdc'; // ~0.86 matte cloth
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000'; // 0.0 non-metal
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080'; // neutral bump
  bCtx.fillRect(0, 0, width, height);

  // --- Procedural Canvas Weave Texture ---
  const weavePattern = ctx.createLinearGradient(0, 0, 8, 8);
  weavePattern.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  weavePattern.addColorStop(0.5, 'rgba(0, 0, 0, 0.06)');
  weavePattern.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  ctx.fillStyle = weavePattern;
  ctx.fillRect(0, 0, width, height);

  // Fine fabric grain speckles
  for (let i = 0; i < 60000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const lum = Math.random() > 0.5 ? 255 : 0;
    const alpha = Math.random() * 0.04;
    ctx.fillStyle = `rgba(${lum},${lum},${lum},${alpha})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // --- Large Diagonal Tension Folds / Creases ---
  for (let f = 0; f < 8; f++) {
    const startX = (f / 8) * width;
    const foldGrad = ctx.createLinearGradient(startX, 0, startX + 300, height);
    foldGrad.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
    foldGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.12)');
    foldGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    foldGrad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = foldGrad;
    ctx.beginPath();
    ctx.moveTo(startX - 80, 0);
    ctx.lineTo(startX + 180, 0);
    ctx.lineTo(startX + 400, height);
    ctx.lineTo(startX + 120, height);
    ctx.closePath();
    ctx.fill();

    bCtx.fillStyle = '#a0a0a0';
    bCtx.beginPath();
    bCtx.moveTo(startX, 0);
    bCtx.lineTo(startX + 50, 0);
    bCtx.lineTo(startX + 250, height);
    bCtx.lineTo(startX + 200, height);
    bCtx.closePath();
    bCtx.fill();
  }

  // --- Vertical Stitched Canvas Panels ---
  const panelColumns = [512, 1024, 1536];
  panelColumns.forEach(px => {
    // Drop shadow seam
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(px - 10, 0, 20, height);

    // Beveled highlight line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px + 8, 0);
    ctx.lineTo(px + 8, height);
    ctx.stroke();

    // Dark seam line
    ctx.strokeStyle = '#270808';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();

    // Draw thick rawhide / bone sinew stitches along seam
    drawBoneStitches(ctx, bCtx, px, 40, px, height - 200, 36, 32, 0.45);
  });

  // --- Weathering / Ground Dirt Gradients at Bottom ---
  const dirtGrad = ctx.createLinearGradient(0, height - 450, 0, height);
  dirtGrad.addColorStop(0, 'rgba(40, 24, 16, 0.0)');
  dirtGrad.addColorStop(0.5, 'rgba(40, 24, 16, 0.45)');
  dirtGrad.addColorStop(1, 'rgba(25, 14, 8, 0.85)');
  ctx.fillStyle = dirtGrad;
  ctx.fillRect(0, height - 450, width, 450);

  // --- Tribal War Slash Runes & Barbarian Sigils ---
  // Large Central Savage Skull Crest
  drawTribalSkull(ctx, 1024, 680, 2.2, '#fef3c7');
  bCtx.fillStyle = '#dcdcdc';
  bCtx.beginPath();
  bCtx.arc(1024, 680, 200, 0, Math.PI * 2);
  bCtx.fill();

  // Secondary Clan Skulls on flanking panels
  drawTribalSkull(ctx, 512, 1050, 1.3, '#f5f5f4');
  drawTribalSkull(ctx, 1536, 1050, 1.3, '#f5f5f4');

  // Claw marks / slash runes
  drawClawSlashes(ctx, 320, 480, 160, '#fef08a');
  drawClawSlashes(ctx, 1720, 520, 170, '#fef08a');
  drawClawSlashes(ctx, 768, 1350, 140, '#fef3c7');
  drawClawSlashes(ctx, 1280, 1350, 140, '#fef3c7');

  // Blood-red painted chevrons and tribal war slashes
  for (let c = 0; c < 3; c++) {
    const cx = 400 + c * 600;
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 100, 280);
    ctx.lineTo(cx, 360);
    ctx.lineTo(cx + 100, 280);
    ctx.stroke();

    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(cx - 100, 280);
    ctx.lineTo(cx, 360);
    ctx.lineTo(cx + 100, 280);
    ctx.stroke();
  }

  // --- Heavy Leather Reinforcement Patches on Upper Edges ---
  const patchCoords = [
    { x: 120, y: 140, w: 220, h: 140 },
    { x: 800, y: 120, w: 240, h: 120 },
    { x: 1680, y: 140, w: 220, h: 140 }
  ];
  patchCoords.forEach(p => {
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(p.x + 4, p.y + 6, p.w, p.h);

    // Leather fill
    const lGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    lGrad.addColorStop(0, '#5c3a21');
    lGrad.addColorStop(0.5, '#784c2b');
    lGrad.addColorStop(1, '#3e2312');
    ctx.fillStyle = lGrad;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    // Leather rim highlight
    ctx.strokeStyle = '#9a643b';
    ctx.lineWidth = 4;
    ctx.strokeRect(p.x, p.y, p.w, p.h);

    rCtx.fillStyle = '#969696'; // leather roughness ~0.59
    rCtx.fillRect(p.x, p.y, p.w, p.h);

    // Corner forged rivets
    drawRivet(ctx, p.x + 20, p.y + 20, 12, false);
    drawRivet(ctx, p.x + p.w - 20, p.y + 20, 12, false);
    drawRivet(ctx, p.x + 20, p.y + p.h - 20, 12, false);
    drawRivet(ctx, p.x + p.w - 20, p.y + p.h - 20, 12, false);

    mCtx.fillStyle = '#dcdcdc';
    mCtx.fillRect(p.x + 10, p.y + 10, 20, 20);
    mCtx.fillRect(p.x + p.w - 30, p.y + 10, 20, 20);
    mCtx.fillRect(p.x + 10, p.y + p.h - 30, 20, 20);
    mCtx.fillRect(p.x + p.w - 30, p.y + p.h - 30, 20, 20);
  });

  // --- Layered Ragged Animal Fur Trim at Bottom (Wolf / Bear Pelts) ---
  const furStartY = height - 260;
  // Fur dark undercoat
  ctx.fillStyle = '#261a12';
  ctx.fillRect(0, furStartY, width, 260);

  // Jagged fur clumps
  const furColors = ['#3d281a', '#543825', '#6b4932', '#855c3f', '#a67752', '#d4aa82'];
  for (let layer = 0; layer < 5; layer++) {
    const ly = furStartY + layer * 45;
    ctx.fillStyle = furColors[layer];
    ctx.beginPath();
    ctx.moveTo(0, ly);

    for (let x = 0; x <= width; x += 40) {
      const spikeH = 35 + Math.sin(x * 0.05 + layer * 2) * 25 + Math.random() * 20;
      ctx.lineTo(x + 20, ly + spikeH);
      ctx.lineTo(x + 40, ly);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }

  // Fur roughness
  rCtx.fillStyle = '#f0f0f0'; // very soft diffuse fur
  rCtx.fillRect(0, furStartY, width, 260);

  const texSet = {
    map: toTexture(albedo, true, true),
    roughnessMap: toTexture(rough, false, true),
    metalnessMap: toTexture(metal, false, true),
    bumpMap: toTexture(bump, false, true)
  };

  textureCache.set('crimsonWarCanvas', texSet);
  return texSet;
}

/* ==========================================================================
   2. SHARPENED PALISADE STAKES (Pointed logs, wood bark, charring, rawhide)
   ========================================================================== */
export function getPalisadeStakeTextures() {
  if (textureCache.has('palisadeStake')) {
    return textureCache.get('palisadeStake');
  }

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // --- Base Rough Bark Fill ---
  const barkBase = ctx.createLinearGradient(0, 0, width, 0);
  barkBase.addColorStop(0, '#311b10');
  barkBase.addColorStop(0.2, '#4d2d1b');
  barkBase.addColorStop(0.5, '#613922');
  barkBase.addColorStop(0.8, '#442617');
  barkBase.addColorStop(1, '#2c170d');
  ctx.fillStyle = barkBase;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#dedede'; // wood bark roughness ~0.87
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // --- Vertical Rough Bark Fissures & Grooves ---
  for (let bx = 0; bx < width; bx += 24) {
    const grooveW = 4 + Math.random() * 10;
    const grooveOffset = (Math.random() - 0.5) * 15;

    // Dark crevice
    ctx.strokeStyle = '#180c06';
    ctx.lineWidth = grooveW;
    ctx.beginPath();
    ctx.moveTo(bx + grooveOffset, 0);
    for (let by = 0; by <= height; by += 200) {
      const wiggle = (Math.random() - 0.5) * 20;
      ctx.lineTo(bx + grooveOffset + wiggle, by);
    }
    ctx.stroke();

    // Specular edge highlight along ridge
    ctx.strokeStyle = '#7c4d30';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx + grooveOffset + grooveW, 0);
    for (let by = 0; by <= height; by += 200) {
      const wiggle = (Math.random() - 0.5) * 15;
      ctx.lineTo(bx + grooveOffset + grooveW + wiggle, by);
    }
    ctx.stroke();

    // Bump representation
    bCtx.strokeStyle = '#202020';
    bCtx.lineWidth = grooveW;
    bCtx.beginPath();
    bCtx.moveTo(bx + grooveOffset, 0);
    bCtx.lineTo(bx + grooveOffset, height);
    bCtx.stroke();
  }

  // --- Stylized Knotholes in Timber ---
  const knotholes = [
    { x: 450, y: 700, r: 45 },
    { x: 1200, y: 1100, r: 60 },
    { x: 800, y: 1550, r: 50 },
    { x: 1650, y: 850, r: 40 }
  ];
  knotholes.forEach(k => {
    // Dark hollow
    ctx.fillStyle = '#120804';
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, k.r * 0.7, k.r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Concentric grain rings around knot
    for (let kr = k.r * 0.8; kr <= k.r * 2.2; kr += 16) {
      ctx.strokeStyle = kr % 32 === 0 ? '#6e4126' : '#2a150b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(k.x, k.y, kr * 0.75, kr, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // --- Sharpened Pointed Stake Section (Top 0 - 650px) ---
  // Hewn heartwood facets where bark was sliced off by raider axes
  const hewnGrad = ctx.createLinearGradient(0, 0, 0, 650);
  hewnGrad.addColorStop(0, '#24130d'); // Charred tip
  hewnGrad.addColorStop(0.35, '#a36737'); // Warm cut heartwood
  hewnGrad.addColorStop(0.7, '#c98a50'); // Fresh pine chips
  hewnGrad.addColorStop(1, 'transparent'); // Blend into bark

  ctx.fillStyle = hewnGrad;
  ctx.fillRect(0, 0, width, 650);

  // Axe chip facets (angled cuts)
  for (let f = 0; f < 14; f++) {
    const fx = (f / 14) * width;
    ctx.fillStyle = f % 2 === 0 ? 'rgba(215, 155, 95, 0.35)' : 'rgba(80, 45, 25, 0.4)';
    ctx.beginPath();
    ctx.moveTo(fx, 650);
    ctx.lineTo(fx + width / 14, 650);
    ctx.lineTo(fx + width / 28, 150);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 230, 190, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(fx, 650);
    ctx.lineTo(fx + width / 28, 150);
    ctx.stroke();
  }

  // --- Fire-Hardened Charred Soot Tip (0 - 320px) ---
  const charGrad = ctx.createLinearGradient(0, 0, 0, 360);
  charGrad.addColorStop(0, '#0a0807');
  charGrad.addColorStop(0.5, '#181210');
  charGrad.addColorStop(0.85, '#2e1c14');
  charGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = charGrad;
  ctx.fillRect(0, 0, width, 360);

  // White ash crust along charred border
  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let ax = 0; ax <= width; ax += 30) {
    const ay = 280 + Math.sin(ax * 0.04) * 25 + Math.random() * 15;
    if (ax === 0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
  }
  ctx.stroke();

  // Micro glowing orange ember sparks in the charcoal tip
  for (let e = 0; e < 35; e++) {
    const ex = Math.random() * width;
    const ey = Math.random() * 260;
    ctx.fillStyle = Math.random() > 0.4 ? '#f97316' : '#ea580c';
    ctx.beginPath();
    ctx.arc(ex, ey, 2 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Rawhide Lashings / Ropes (Mid Bands at y: 850-1050 and y: 1550-1750) ---
  const ropeBands = [950, 1650];
  ropeBands.forEach(by => {
    // Drop shadow under rope band
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, by - 60, width, 120);

    // Criss-crossing rawhide cords
    for (let dir of [-1, 1]) {
      for (let rx = 0; rx <= width; rx += 140) {
        ctx.save();
        ctx.strokeStyle = '#b88656';
        ctx.lineWidth = 22;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(rx, by - 50);
        ctx.lineTo(rx + dir * 180, by + 50);
        ctx.stroke();

        // Cord highlight
        ctx.strokeStyle = '#e6be91';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(rx, by - 50);
        ctx.lineTo(rx + dir * 180, by + 50);
        ctx.stroke();

        // Dark twist fibers
        ctx.strokeStyle = '#633e1f';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(rx + 4, by - 50);
        ctx.lineTo(rx + dir * 180 + 4, by + 50);
        ctx.stroke();
        ctx.restore();

        // Bump for rope
        bCtx.fillStyle = '#d0d0d0';
        bCtx.fillRect(rx - 10, by - 40, 20, 80);
      }
    }
  });

  const texSet = {
    map: toTexture(albedo, true, true),
    roughnessMap: toTexture(rough, false, true),
    metalnessMap: toTexture(metal, false, true),
    bumpMap: toTexture(bump, false, true)
  };

  textureCache.set('palisadeStake', texSet);
  return texSet;
}

/* ==========================================================================
   3. BURNING CAMPFIRE & ASH (Ash bed, glowing coals, charred logs)
   ========================================================================== */
export function getCampfireTextures() {
  if (textureCache.has('campfire')) {
    return textureCache.get('campfire');
  }

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);
  const { canvas: emissive, ctx: eCtx } = createCanvas(2048, 2048);

  const cx = width / 2;
  const cy = height / 2;

  // --- Outer Burnt Soil & Ash Gradient ---
  const ashGrad = ctx.createRadialGradient(cx, cy, 100, cx, cy, 950);
  ashGrad.addColorStop(0, '#f5f5f4'); // Powdery white ash center
  ashGrad.addColorStop(0.2, '#d6d3d1');
  ashGrad.addColorStop(0.45, '#78716c'); // Cool grey ash
  ashGrad.addColorStop(0.7, '#292524'); // Charcoal flakes
  ashGrad.addColorStop(0.88, '#1c1917'); // Burnt soot ring
  ashGrad.addColorStop(1, '#27170c'); // Scorched earth edge
  ctx.fillStyle = ashGrad;
  ctx.fillRect(0, 0, width, height);

  // Roughness: very high matte for powdery ash
  rCtx.fillStyle = '#f5f5f5'; // 0.96 roughness
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);
  eCtx.fillStyle = '#000000'; // pure black default
  eCtx.fillRect(0, 0, width, height);

  // Charcoal flecks & ash powder speckles
  for (let i = 0; i < 40000; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * 920;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    const isDark = Math.random() > 0.45;
    ctx.fillStyle = isDark ? '#1c1917' : '#e7e5e4';
    ctx.fillRect(px, py, 3, 3);
  }

  // --- Central Molten Glowing Ember Bed (Radius 0 - 580px) ---
  // Intense radial glowing heat gradient
  const heatGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 540);
  heatGrad.addColorStop(0, '#ffffff'); // Blazing white-hot center
  heatGrad.addColorStop(0.18, '#fef08a'); // Warm canary yellow
  heatGrad.addColorStop(0.45, '#f59e0b'); // Blazing amber
  heatGrad.addColorStop(0.75, '#dc2626'); // Fiery deep scarlet
  heatGrad.addColorStop(1, 'rgba(127, 29, 29, 0)');
  ctx.fillStyle = heatGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 540, 0, Math.PI * 2);
  ctx.fill();

  // Emissive map heat gradient
  const emissiveGrad = eCtx.createRadialGradient(cx, cy, 40, cx, cy, 520);
  emissiveGrad.addColorStop(0, '#ffffff');
  emissiveGrad.addColorStop(0.2, '#ffcc00');
  emissiveGrad.addColorStop(0.5, '#ff5500');
  emissiveGrad.addColorStop(0.8, '#cc1100');
  emissiveGrad.addColorStop(1, '#000000');
  eCtx.fillStyle = emissiveGrad;
  eCtx.beginPath();
  eCtx.arc(cx, cy, 520, 0, Math.PI * 2);
  eCtx.fill();

  // Hot glowing coal fissures (cellular cracked glowing veins)
  for (let ring = 80; ring <= 480; ring += 70) {
    const count = Math.floor((ring * Math.PI * 2) / 65);
    for (let c = 0; c < count; c++) {
      const a = (c / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      const cr = ring + (Math.random() - 0.5) * 35;
      const px = cx + Math.cos(a) * cr;
      const py = cy + Math.sin(a) * cr;
      const coalSize = 25 + Math.random() * 35;

      // Dark charred coal chunk on top of the magma
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.ellipse(px, py, coalSize * 0.8, coalSize, a, 0, Math.PI * 2);
      ctx.fill();

      // Coal rim highlight / glowing orange edge
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 4;
      ctx.stroke();

      // High bump for coal chunks
      bCtx.fillStyle = '#b0b0b0';
      bCtx.beginPath();
      bCtx.ellipse(px, py, coalSize * 0.8, coalSize, a, 0, Math.PI * 2);
      bCtx.fill();

      // Mask out emissive slightly on cold coal centers
      eCtx.fillStyle = '#441100';
      eCtx.beginPath();
      eCtx.ellipse(px, py, coalSize * 0.45, coalSize * 0.55, a, 0, Math.PI * 2);
      eCtx.fill();
    }
  }

  // Blazing molten cracks criss-crossing the coals
  for (let cr = 0; cr < 20; cr++) {
    const startA = Math.random() * Math.PI * 2;
    const startR = 40 + Math.random() * 120;
    const endA = startA + (Math.random() - 0.5) * 1.5;
    const endR = 250 + Math.random() * 220;

    const x1 = cx + Math.cos(startA) * startR;
    const y1 = cy + Math.sin(startA) * startR;
    const x2 = cx + Math.cos(endA) * endR;
    const y2 = cy + Math.sin(endA) * endR;

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    eCtx.strokeStyle = '#ffffff';
    eCtx.lineWidth = 6;
    eCtx.lineCap = 'round';
    eCtx.beginPath();
    eCtx.moveTo(x1, y1);
    eCtx.lineTo(x2, y2);
    eCtx.stroke();
  }

  const texSet = {
    map: toTexture(albedo, true, false),
    emissiveMap: toTexture(emissive, false, false),
    roughnessMap: toTexture(rough, false, false),
    metalnessMap: toTexture(metal, false, false),
    bumpMap: toTexture(bump, false, false)
  };

  textureCache.set('campfire', texSet);
  return texSet;
}

/* ==========================================================================
   4. PLUNDERED LOOT, SKULLS & BARBARIC IRON (Treasure, weapons, trophies)
   ========================================================================== */
export function getLootAndSkullsTextures() {
  if (textureCache.has('lootAndSkulls')) {
    return textureCache.get('lootAndSkulls');
  }

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createBumpCanvas(2048, 2048);

  // Background neutral fill
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, width, height);
  rCtx.fillStyle = '#808080';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // --- QUADRANT 1: Weathered Ivory Skulls & Bone (x: 0-1024, y: 0-1024) ---
  const boneGrad = ctx.createRadialGradient(512, 512, 50, 512, 512, 480);
  boneGrad.addColorStop(0, '#f5f5f4');
  boneGrad.addColorStop(0.5, '#e7e5e4');
  boneGrad.addColorStop(0.85, '#d6d3d1');
  boneGrad.addColorStop(1, '#a8a29e');
  ctx.fillStyle = boneGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Bone cracks and suture lines
  for (let c = 0; c < 15; c++) {
    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(100 + Math.random() * 824, 100 + Math.random() * 824);
    for (let seg = 0; seg < 4; seg++) {
      ctx.lineTo(100 + Math.random() * 824, 100 + Math.random() * 824);
    }
    ctx.stroke();
  }

  // Draw full decorative trophy skulls in quadrant 1
  drawTribalSkull(ctx, 512, 450, 3.2, '#f5f5f4');
  // Ox horns texture gradient at top
  const hornGrad = ctx.createLinearGradient(0, 0, 1024, 250);
  hornGrad.addColorStop(0, '#26150e');
  hornGrad.addColorStop(0.3, '#57331c');
  hornGrad.addColorStop(0.65, '#85522e');
  hornGrad.addColorStop(1, '#e5d5be');
  ctx.fillStyle = hornGrad;
  ctx.fillRect(0, 0, 1024, 220);

  // Blood war paint streak
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.moveTo(180, 240);
  ctx.lineTo(840, 340);
  ctx.lineTo(820, 420);
  ctx.lineTo(160, 320);
  ctx.closePath();
  ctx.fill();

  rCtx.fillStyle = '#b8b8b8'; // bone roughness ~0.72
  rCtx.fillRect(0, 0, 1024, 1024);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, 1024, 1024);

  // --- QUADRANT 2: Plundered Gold Coins & Gems (x: 1024-2048, y: 0-1024) ---
  // Rich golden field
  const goldGrad = ctx.createRadialGradient(1536, 512, 100, 1536, 512, 500);
  goldGrad.addColorStop(0, '#fef08a');
  goldGrad.addColorStop(0.35, '#facc15');
  goldGrad.addColorStop(0.7, '#ca8a04');
  goldGrad.addColorStop(1, '#854d0e');
  ctx.fillStyle = goldGrad;
  ctx.fillRect(1024, 0, 1024, 1024);

  // Dense overflowing gold coins
  for (let gy = 80; gy < 960; gy += 70) {
    for (let gx = 1100; gx < 1980; gx += 70) {
      const ox = gx + (Math.random() - 0.5) * 30;
      const oy = gy + (Math.random() - 0.5) * 30;
      const coinR = 30 + Math.random() * 8;

      // Drop shadow
      ctx.fillStyle = 'rgba(60, 30, 0, 0.6)';
      ctx.beginPath();
      ctx.arc(ox + 3, oy + 4, coinR, 0, Math.PI * 2);
      ctx.fill();

      // Coin base
      const cGrad = ctx.createRadialGradient(ox - coinR * 0.3, oy - coinR * 0.3, 2, ox, oy, coinR);
      cGrad.addColorStop(0, '#fef9c3');
      cGrad.addColorStop(0.4, '#facc15');
      cGrad.addColorStop(0.8, '#eab308');
      cGrad.addColorStop(1, '#a16207');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(ox, oy, coinR, 0, Math.PI * 2);
      ctx.fill();

      // Coin rim bevel
      ctx.strokeStyle = '#fffbeb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox, oy, coinR * 0.85, 0, Math.PI * 2);
      ctx.stroke();

      // Stamped symbol in coin (crown / star / skull)
      ctx.fillStyle = '#78350f';
      ctx.fillRect(ox - 6, oy - 6, 12, 12);

      // Bump
      bCtx.fillStyle = '#ffffff';
      bCtx.beginPath();
      bCtx.arc(ox, oy, coinR, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  rCtx.fillStyle = '#333333'; // shiny metallic gold ~0.2 roughness
  rCtx.fillRect(1024, 0, 1024, 1024);
  mCtx.fillStyle = '#f2f2f2'; // highly metallic ~0.95
  mCtx.fillRect(1024, 0, 1024, 1024);

  // --- QUADRANT 3: Barbaric Forged Iron & Spikes (x: 0-1024, y: 1024-2048) ---
  const ironGrad = ctx.createLinearGradient(0, 1024, 1024, 2048);
  ironGrad.addColorStop(0, '#475569');
  ironGrad.addColorStop(0.4, '#334155');
  ironGrad.addColorStop(0.8, '#1e293b');
  ironGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = ironGrad;
  ctx.fillRect(0, 1024, 1024, 1024);

  // Hammered metal texture indentations
  for (let i = 0; i < 250; i++) {
    const ix = Math.random() * 1024;
    const iy = 1024 + Math.random() * 1024;
    const ir = 15 + Math.random() * 25;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forged iron plate seams and rivets
  for (let iy = 1150; iy < 2000; iy += 250) {
    // Plate divider line
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, iy, 1024, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, iy - 4, 1024, 4);

    for (let rx = 80; rx < 1000; rx += 140) {
      drawRivet(ctx, rx, iy - 35, 18, false);
    }
  }

  rCtx.fillStyle = '#555555'; // rough forged iron ~0.35
  rCtx.fillRect(0, 1024, 1024, 1024);
  mCtx.fillStyle = '#dedede'; // metallic iron ~0.88
  mCtx.fillRect(0, 1024, 1024, 1024);

  // --- QUADRANT 4: Aged Oak Planks for Treasure Chest (x: 1024-2048, y: 1024-2048) ---
  const chestWoodGrad = ctx.createLinearGradient(1024, 1024, 2048, 2048);
  chestWoodGrad.addColorStop(0, '#422818');
  chestWoodGrad.addColorStop(0.5, '#5a3821');
  chestWoodGrad.addColorStop(1, '#2c180e');
  ctx.fillStyle = chestWoodGrad;
  ctx.fillRect(1024, 1024, 1024, 1024);

  // Wood planks
  for (let py = 1024; py < 2048; py += 150) {
    // Planks seam
    ctx.fillStyle = '#150a04';
    ctx.fillRect(1024, py, 1024, 10);
    ctx.fillStyle = '#7a4f32';
    ctx.fillRect(1024, py + 10, 1024, 4);

    // Grain lines
    for (let gy = py + 15; gy < py + 140; gy += 25) {
      ctx.strokeStyle = '#351d0f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(1024, gy);
      ctx.lineTo(2048, gy);
      ctx.stroke();
    }
  }

  // Heavy dark iron bracket straps across chest wood
  const strapX = [1200, 1850];
  strapX.forEach(sx => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(sx - 45, 1024, 90, 1024);

    const sGrad = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
    sGrad.addColorStop(0, '#475569');
    sGrad.addColorStop(0.5, '#1e293b');
    sGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = sGrad;
    ctx.fillRect(sx - 40, 1024, 80, 1024);

    for (let sy = 1080; sy < 2048; sy += 120) {
      drawRivet(ctx, sx, sy, 14, false);
    }
  });

  rCtx.fillStyle = '#b8b8b8'; // wood roughness ~0.72
  rCtx.fillRect(1024, 1024, 1024, 1024);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(1024, 1024, 1024, 1024);

  // Metalness for iron straps in Quadrant 4
  strapX.forEach(sx => {
    mCtx.fillStyle = '#dcdcdc';
    mCtx.fillRect(sx - 40, 1024, 80, 1024);
    rCtx.fillStyle = '#555555';
    rCtx.fillRect(sx - 40, 1024, 80, 1024);
  });

  const texSet = {
    map: toTexture(albedo, true, true),
    roughnessMap: toTexture(rough, false, true),
    metalnessMap: toTexture(metal, false, true),
    bumpMap: toTexture(bump, false, true)
  };

  textureCache.set('lootAndSkulls', texSet);
  return texSet;
}
