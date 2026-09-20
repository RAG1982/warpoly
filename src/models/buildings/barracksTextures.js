import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Barracks (Quartel Militar)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA Stylized Art (Valorant / Overwatch).
 * 
 * Generates high-resolution 2048x2048 procedural canvas textures:
 * 1. getBarracksStoneTimberTextures() - Fortified fieldstone ashlar masonry, dark oak timber framing, iron brackets & bolts.
 * 2. getBarracksRoofTextures() - Interlocking blue slate shingles with hand-painted edge wear, weathering, and metal ridge cap.
 * 3. getBarracksDoorWindowTextures() - Heavy iron-banded garrison double gates with crossed swords motif, barred arrow slit windows, armory door.
 * 4. getBarracksPropsTextures() - Wooden weapon racks with steel halberds/spears, painted royal lion heater shields, straw training dummy with patched burlap, iron braziers & embers, royal pennants.
 */

const textureCache = new Map();

function createCanvas(width = 2048, height = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return { canvas, ctx, width, height };
}

function toTexture(canvas, isSRGB = true, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Helper: draw stylized rivet/bolt with drop shadow and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  ctx.save();
  // Soft ambient drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius * 1.05, 0, Math.PI * 2);
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
    ringGrad.addColorStop(0.25, '#cbd5e1');
    ringGrad.addColorStop(0.7, '#475569');
    ringGrad.addColorStop(1, '#0f172a');
  }
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner specular dome
  const domeGrad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 1, cx, cy, radius * 0.85);
  if (isGold) {
    domeGrad.addColorStop(0, '#fffbeb');
    domeGrad.addColorStop(0.35, '#fbbf24');
    domeGrad.addColorStop(0.8, '#b45309');
    domeGrad.addColorStop(1, '#451a03');
  } else {
    domeGrad.addColorStop(0, '#ffffff');
    domeGrad.addColorStop(0.35, '#e2e8f0');
    domeGrad.addColorStop(0.75, '#64748b');
    domeGrad.addColorStop(1, '#1e293b');
  }
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper: draw stylized running stitch along a line
 */
function drawStitches(ctx, x1, y1, x2, y2, stitchLen = 14, gap = 8, color = '#fef3c7') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([stitchLen, gap]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Helper: draw stylized rampant lion coat of arms
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
    c.lineTo(-15, -112);
    c.lineTo(0, -135);
    c.lineTo(15, -112);
    c.lineTo(28, -125);
    c.lineTo(35, -100);
    c.closePath();

    // 2. Head & Roaring Jaws
    c.moveTo(-25, -95);
    c.lineTo(40, -95);
    c.bezierCurveTo(60, -95, 75, -80, 80, -65);
    c.lineTo(95, -60);
    c.lineTo(75, -45); // open mouth
    c.lineTo(85, -30); // lower jaw
    c.lineTo(55, -35);
    c.bezierCurveTo(45, -20, 25, -10, 10, -10);

    // 3. Mane & Arched Torso
    c.bezierCurveTo(20, 10, 35, 30, 45, 60);
    c.bezierCurveTo(55, 90, 45, 120, 30, 150);
    c.lineTo(-10, 150);
    c.bezierCurveTo(-25, 110, -25, 60, -35, 20);
    c.bezierCurveTo(-45, -20, -40, -60, -25, -95);

    // 4. Forepaws (Raised Claws)
    c.moveTo(40, -50);
    c.bezierCurveTo(70, -70, 110, -85, 140, -80);
    c.lineTo(155, -65);
    c.lineTo(135, -60);
    c.lineTo(150, -45);
    c.lineTo(110, -40);
    c.bezierCurveTo(85, -30, 60, -15, 35, 0);

    c.moveTo(30, -15);
    c.bezierCurveTo(60, -25, 100, -30, 125, -15);
    c.lineTo(135, -5);
    c.lineTo(115, 0);
    c.lineTo(125, 10);
    c.lineTo(95, 15);
    c.bezierCurveTo(70, 15, 45, 25, 25, 35);

    // 5. Hind Legs & Paws
    c.moveTo(15, 140);
    c.bezierCurveTo(35, 160, 65, 190, 95, 210);
    c.lineTo(115, 225);
    c.lineTo(85, 220);
    c.lineTo(95, 235);
    c.lineTo(60, 225);
    c.bezierCurveTo(40, 200, 20, 175, 5, 155);

    c.moveTo(-10, 145);
    c.bezierCurveTo(-20, 175, -15, 210, 10, 245);
    c.lineTo(25, 260);
    c.lineTo(0, 255);
    c.lineTo(5, 270);
    c.lineTo(-20, 260);
    c.bezierCurveTo(-40, 230, -45, 190, -30, 155);

    // 6. Heraldic S-Curve Tail with Flame Tufts
    c.moveTo(-28, 135);
    c.bezierCurveTo(-65, 120, -95, 75, -90, 25);
    c.bezierCurveTo(-85, -20, -120, -50, -145, -40);
    c.bezierCurveTo(-160, -30, -165, -10, -150, 15);
    c.bezierCurveTo(-140, 30, -135, 50, -145, 65); // flame tuft
    c.bezierCurveTo(-130, 60, -120, 45, -125, 25);
    c.bezierCurveTo(-115, 0, -85, 30, -80, 75);
    c.bezierCurveTo(-75, 115, -45, 145, -15, 150);
  }

  // Drop shadow
  ctx.save();
  ctx.translate(4, 6);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  renderLionPaths(ctx);
  ctx.fill();
  ctx.restore();

  // Fill
  if (fillOverride) {
    ctx.fillStyle = fillOverride;
  } else {
    const goldGrad = ctx.createLinearGradient(0, -135, 0, 270);
    goldGrad.addColorStop(0, '#fffbeb');
    goldGrad.addColorStop(0.2, '#fde047');
    goldGrad.addColorStop(0.5, '#f59e0b');
    goldGrad.addColorStop(0.8, '#d97706');
    goldGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = goldGrad;
  }
  renderLionPaths(ctx);
  ctx.fill();

  // Specular edge highlights
  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 3;
  renderLionPaths(ctx);
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper: draw crossed heraldic knight broadswords
 */
function drawCrossedSwords(ctx, cx, cy, size = 320) {
  ctx.save();
  ctx.translate(cx, cy);

  function drawSingleSword() {
    const halfL = size * 0.7;
    const bladeW = size * 0.08;

    // Drop shadow
    ctx.save();
    ctx.translate(3, 5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.moveTo(-bladeW * 0.5, -halfL);
    ctx.lineTo(0, -halfL - bladeW * 1.4);
    ctx.lineTo(bladeW * 0.5, -halfL);
    ctx.lineTo(bladeW * 0.6, halfL * 0.3);
    ctx.lineTo(-bladeW * 0.6, halfL * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Steel Blade Left Half
    const bladeGradL = ctx.createLinearGradient(-bladeW * 0.5, 0, 0, 0);
    bladeGradL.addColorStop(0, '#f8fafc');
    bladeGradL.addColorStop(0.7, '#cbd5e1');
    bladeGradL.addColorStop(1, '#64748b');
    ctx.fillStyle = bladeGradL;
    ctx.beginPath();
    ctx.moveTo(-bladeW * 0.5, -halfL);
    ctx.lineTo(0, -halfL - bladeW * 1.4);
    ctx.lineTo(0, halfL * 0.3);
    ctx.lineTo(-bladeW * 0.6, halfL * 0.3);
    ctx.closePath();
    ctx.fill();

    // Steel Blade Right Half
    const bladeGradR = ctx.createLinearGradient(0, 0, bladeW * 0.5, 0);
    bladeGradR.addColorStop(0, '#475569');
    bladeGradR.addColorStop(0.3, '#94a3b8');
    bladeGradR.addColorStop(1, '#ffffff');
    ctx.fillStyle = bladeGradR;
    ctx.beginPath();
    ctx.moveTo(0, -halfL - bladeW * 1.4);
    ctx.lineTo(bladeW * 0.5, -halfL);
    ctx.lineTo(bladeW * 0.6, halfL * 0.3);
    ctx.lineTo(0, halfL * 0.3);
    ctx.closePath();
    ctx.fill();

    // Center fuller line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -halfL * 0.9);
    ctx.lineTo(0, halfL * 0.25);
    ctx.stroke();

    // Golden Crossguard
    const guardW = size * 0.32;
    const guardH = size * 0.07;
    const guardGrad = ctx.createLinearGradient(-guardW * 0.5, 0, guardW * 0.5, 0);
    guardGrad.addColorStop(0, '#78350f');
    guardGrad.addColorStop(0.2, '#f59e0b');
    guardGrad.addColorStop(0.5, '#fef08a');
    guardGrad.addColorStop(0.8, '#f59e0b');
    guardGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = guardGrad;
    ctx.beginPath();
    ctx.roundRect(-guardW * 0.5, halfL * 0.3, guardW, guardH, 4);
    ctx.fill();
    ctx.strokeStyle = '#fffbeb';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Grip (leather wrapped)
    const gripW = bladeW * 0.5;
    const gripH = size * 0.24;
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-gripW * 0.5, halfL * 0.3 + guardH, gripW, gripH);

    // Gold wire cross-wrap on grip
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    for (let gy = halfL * 0.3 + guardH + 4; gy < halfL * 0.3 + guardH + gripH; gy += 10) {
      ctx.beginPath();
      ctx.moveTo(-gripW * 0.5, gy);
      ctx.lineTo(gripW * 0.5, gy + 5);
      ctx.stroke();
    }

    // Golden Pommel with red jewel
    const pommelR = size * 0.055;
    const py = halfL * 0.3 + guardH + gripH + pommelR;
    const pomGrad = ctx.createRadialGradient(0, py - 2, 1, 0, py, pommelR);
    pomGrad.addColorStop(0, '#fffbeb');
    pomGrad.addColorStop(0.4, '#fbbf24');
    pomGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = pomGrad;
    ctx.beginPath();
    ctx.arc(0, py, pommelR, 0, Math.PI * 2);
    ctx.fill();

    // Ruby cabochon
    const rubyGrad = ctx.createRadialGradient(0, py - 1, 0.5, 0, py, pommelR * 0.5);
    rubyGrad.addColorStop(0, '#fca5a5');
    rubyGrad.addColorStop(0.4, '#ef4444');
    rubyGrad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = rubyGrad;
    ctx.beginPath();
    ctx.arc(0, py, pommelR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sword 1 (rotated -45 deg)
  ctx.save();
  ctx.rotate(-Math.PI / 4);
  drawSingleSword();
  ctx.restore();

  // Sword 2 (rotated +45 deg)
  ctx.save();
  ctx.rotate(Math.PI / 4);
  drawSingleSword();
  ctx.restore();

  ctx.restore();
}

// =========================================================================
// 1. FORTIFIED FIELDSTONE & TIMBER TEXTURES
// =========================================================================
/**
 * Procedural Hand-Painted Ashlar Fieldstone, Dark Oak Framing & Iron Brackets
 * @returns {{map: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, metalnessMap: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture}}
 */
export function getBarracksStoneTimberTextures() {
  if (textureCache.has('stoneTimber')) return textureCache.get('stoneTimber');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Background deep mortar
  alb.fillStyle = '#22262d';
  alb.fillRect(0, 0, W, H);
  rgh.fillStyle = '#ededed'; // mortar roughness ~ 0.93
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#505050'; // mortar deep recessed ~ 80
  bmp.fillRect(0, 0, W, H);

  // Ashlar Fieldstone courses (16 staggered horizontal courses)
  const rows = 16;
  const rowHeight = H / rows;
  const stoneColors = [
    { base: '#5a626c', light: '#7e8794', dark: '#3b4149' }, // granite grey
    { base: '#4b535d', light: '#6c7582', dark: '#2e343b' }, // cool slate
    { base: '#635e58', light: '#868078', dark: '#423d38' }, // warm limestone
    { base: '#6d737b', light: '#9198a2', dark: '#484e56' }, // light ashlar
    { base: '#3f454d', light: '#5b626d', dark: '#262a30' }  // dark basalt
  ];

  for (let r = 0; r < rows; r++) {
    const y = r * rowHeight;
    const h = rowHeight - 8; // 8px mortar joint
    const isEven = r % 2 === 0;
    const offset = isEven ? 0 : 90;

    let x = -offset;
    while (x < W + 120) {
      // Randomized block width
      const stoneSeed = Math.sin(r * 37 + x * 13) * 10000;
      const wRand = Math.floor((stoneSeed - Math.floor(stoneSeed)) * 80);
      const w = 220 + wRand;

      const colIdx = Math.abs(Math.floor(stoneSeed * 10)) % stoneColors.length;
      const col = stoneColors[colIdx];

      // Albedo block fill with top-down gradient
      const grad = alb.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, col.light);
      grad.addColorStop(0.4, col.base);
      grad.addColorStop(1, col.dark);
      alb.fillStyle = grad;
      alb.fillRect(x + 4, y + 4, w - 8, h - 8);

      // Stylized hand-painted edge highlights (top & left)
      alb.strokeStyle = '#9fb0c4';
      alb.lineWidth = 3.5;
      alb.beginPath();
      alb.moveTo(x + 4, y + h - 4);
      alb.lineTo(x + 4, y + 4);
      alb.lineTo(x + w - 4, y + 4);
      alb.stroke();

      // Deep shadow bevel (bottom & right)
      alb.strokeStyle = '#1b1f24';
      alb.lineWidth = 4;
      alb.beginPath();
      alb.moveTo(x + w - 4, y + 4);
      alb.lineTo(x + w - 4, y + h - 4);
      alb.lineTo(x + 4, y + h - 4);
      alb.stroke();

      // Subtle chisel fissures on stones
      if ((r + Math.floor(x)) % 3 === 0) {
        alb.strokeStyle = '#2d333b';
        alb.lineWidth = 2;
        alb.beginPath();
        alb.moveTo(x + 20, y + 25);
        alb.lineTo(x + 55, y + 40);
        alb.stroke();

        alb.strokeStyle = '#b0bec5';
        alb.lineWidth = 1.5;
        alb.beginPath();
        alb.moveTo(x + 21, y + 27);
        alb.lineTo(x + 56, y + 42);
        alb.stroke();
      }

      // Creeping damp moss on bottom 4 courses
      if (r >= 12 && (r + Math.floor(x)) % 2 === 0) {
        const mossGrad = alb.createLinearGradient(x, y + h - 25, x, y + h);
        mossGrad.addColorStop(0, 'rgba(54, 83, 20, 0)');
        mossGrad.addColorStop(1, 'rgba(77, 124, 15, 0.75)');
        alb.fillStyle = mossGrad;
        alb.fillRect(x + 4, y + h - 25, w - 8, 21);
      }

      // Roughness map (stone ~ 0.82)
      rgh.fillStyle = '#d1d1d1';
      rgh.fillRect(x + 4, y + 4, w - 8, h - 8);
      // Highlight edge slightly smoother
      rgh.strokeStyle = '#9e9e9e';
      rgh.lineWidth = 3;
      rgh.strokeRect(x + 4, y + 4, w - 8, h - 8);

      // Bump map (stone face 150, top-bevel 180, edge shadow 95)
      bmp.fillStyle = '#969696';
      bmp.fillRect(x + 4, y + 4, w - 8, h - 8);
      bmp.strokeStyle = '#b4b4b4';
      bmp.lineWidth = 3;
      bmp.strokeRect(x + 4, y + 4, w - 8, h - 8);

      x += w;
    }
  }

  // --- Dark Oak Timber Framing & Iron Corner Reinforcements ---
  // Vertical posts on edges
  const postWidth = 140;
  const drawTimberPost = (px) => {
    // Drop shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
    alb.fillRect(px === 0 ? postWidth : px - 15, 0, 15, H);

    // Timber base
    const timberGrad = alb.createLinearGradient(px, 0, px + postWidth, 0);
    timberGrad.addColorStop(0, '#26160c');
    timberGrad.addColorStop(0.25, '#452917');
    timberGrad.addColorStop(0.7, '#382012');
    timberGrad.addColorStop(1, '#1e1109');
    alb.fillStyle = timberGrad;
    alb.fillRect(px, 0, postWidth, H);

    // Wood grain fibers
    alb.strokeStyle = '#180d07';
    alb.lineWidth = 3;
    for (let gx = px + 15; gx < px + postWidth - 10; gx += 16) {
      alb.beginPath();
      alb.moveTo(gx, 0);
      for (let gy = 0; gy < H; gy += 180) {
        const offset = Math.sin(gy * 0.01 + gx) * 8;
        alb.lineTo(gx + offset, gy + 90);
      }
      alb.stroke();
    }

    // Amber edge highlights
    alb.strokeStyle = '#784b2c';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(px + 4, 0);
    alb.lineTo(px + 4, H);
    alb.moveTo(px + postWidth - 4, 0);
    alb.lineTo(px + postWidth - 4, H);
    alb.stroke();

    // Roughness & bump for timber
    rgh.fillStyle = '#ababa'; // ~0.67
    rgh.fillRect(px, 0, postWidth, H);
    bmp.fillStyle = '#a6a6a6'; // raised ~166
    bmp.fillRect(px, 0, postWidth, H);
  };

  drawTimberPost(0);
  drawTimberPost(W - postWidth);

  // Horizontal Girt Timber Beam through middle (Y: 960 to 1100)
  const beamY = 960;
  const beamH = 140;
  alb.fillStyle = 'rgba(0, 0, 0, 0.5)';
  alb.fillRect(0, beamY + beamH, W, 16);

  const beamGrad = alb.createLinearGradient(0, beamY, 0, beamY + beamH);
  beamGrad.addColorStop(0, '#54321d');
  beamGrad.addColorStop(0.4, '#3f2515');
  beamGrad.addColorStop(1, '#23140a');
  alb.fillStyle = beamGrad;
  alb.fillRect(0, beamY, W, beamH);

  // Horizontal wood fibers
  alb.strokeStyle = '#1d1009';
  alb.lineWidth = 3;
  for (let gy = beamY + 16; gy < beamY + beamH - 10; gy += 18) {
    alb.beginPath();
    alb.moveTo(0, gy);
    alb.lineTo(W, gy + (Math.sin(gy) * 6));
    alb.stroke();
  }

  // Top highlight on beam
  alb.strokeStyle = '#855331';
  alb.lineWidth = 4;
  alb.beginPath();
  alb.moveTo(0, beamY + 3);
  alb.lineTo(W, beamY + 3);
  alb.stroke();

  rgh.fillStyle = '#ababa';
  rgh.fillRect(0, beamY, W, beamH);
  bmp.fillStyle = '#a8a8a8';
  bmp.fillRect(0, beamY, W, beamH);

  // --- Heavy Forged Iron Corner L-Brackets with Hex Rivets ---
  const drawIronBracket = (bx, by, bw, bh) => {
    // Drop shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.7)';
    alb.fillRect(bx + 4, by + 5, bw, bh);

    // Forged iron gradient
    const ironGrad = alb.createLinearGradient(bx, by, bx + bw, by + bh);
    ironGrad.addColorStop(0, '#475569');
    ironGrad.addColorStop(0.3, '#1e293b');
    ironGrad.addColorStop(0.8, '#0f172a');
    ironGrad.addColorStop(1, '#020617');
    alb.fillStyle = ironGrad;
    alb.fillRect(bx, by, bw, bh);

    // Beveled highlight rim
    alb.strokeStyle = '#94a3b8';
    alb.lineWidth = 3;
    alb.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);

    // Roughness, Metalness, Bump
    rgh.fillStyle = '#545454'; // 0.33
    rgh.fillRect(bx, by, bw, bh);
    met.fillStyle = '#ededed'; // 0.93
    met.fillRect(bx, by, bw, bh);
    bmp.fillStyle = '#dcdcdc'; // 220
    bmp.fillRect(bx, by, bw, bh);

    // Rivets
    const rR = 14;
    drawRivet(alb, bx + 28, by + 28, rR, false);
    drawRivet(alb, bx + bw - 28, by + 28, rR, false);
    drawRivet(alb, bx + 28, by + bh - 28, rR, false);
    drawRivet(alb, bx + bw - 28, by + bh - 28, rR, false);
  };

  // 4 corner brackets at timber intersections
  drawIronBracket(12, beamY - 40, 160, 220);
  drawIronBracket(W - 172, beamY - 40, 160, 220);
  drawIronBracket(12, 12, 160, 120);
  drawIronBracket(W - 172, 12, 160, 120);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('stoneTimber', set);
  return set;
}

// =========================================================================
// 2. MILITARY ROOF SHINGLES TEXTURES
// =========================================================================
/**
 * Procedural Hand-Painted Blue Slate Shingles with Chipped Edges & Ridge Capping
 * @returns {{map: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, metalnessMap: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture}}
 */
export function getBarracksRoofTextures() {
  if (textureCache.has('roofShingles')) return textureCache.get('roofShingles');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Deep slate background
  alb.fillStyle = '#101d2d';
  alb.fillRect(0, 0, W, H);
  rgh.fillStyle = '#9e9e9e'; // slate roughness ~ 0.62
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#646464'; // 100
  bmp.fillRect(0, 0, W, H);

  // 18 overlapping horizontal slate courses
  const courses = 18;
  const courseHeight = H / courses;
  const tileWidth = 120;

  // Warcraft 2 Alliance slate blue color palette
  const slateTones = [
    { base: '#254e7d', top: '#142c47', bottom: '#31639c', highlight: '#93c5fd' },
    { base: '#1d416b', top: '#0f2238', bottom: '#265387', highlight: '#60a5fa' },
    { base: '#2d588a', top: '#183454', bottom: '#3b70ad', highlight: '#bfdbfe' },
    { base: '#1a375a', top: '#0d1d30', bottom: '#234976', highlight: '#60a5fa' },
    { base: '#345579', top: '#1c3045', bottom: '#416a96', highlight: '#93c5fd' }
  ];

  for (let c = 0; c < courses; c++) {
    const y = c * courseHeight;
    const h = courseHeight + 18; // slight overlap over row below
    const isOdd = c % 2 !== 0;
    const xStart = isOdd ? -tileWidth * 0.5 : 0;

    for (let x = xStart; x < W + tileWidth; x += tileWidth) {
      const tileSeed = Math.sin(c * 43 + x * 17) * 10000;
      const paletteIdx = Math.abs(Math.floor(tileSeed)) % slateTones.length;
      const tone = slateTones[paletteIdx];
      const actualW = tileWidth - 4;

      // Drop shadow underneath top overlap
      alb.fillStyle = 'rgba(0, 0, 0, 0.65)';
      alb.fillRect(x, y + h - 14, actualW + 4, 14);

      // Tile face gradient
      const tileGrad = alb.createLinearGradient(x, y, x, y + h);
      tileGrad.addColorStop(0, tone.top);
      tileGrad.addColorStop(0.3, tone.base);
      tileGrad.addColorStop(0.85, tone.bottom);
      tileGrad.addColorStop(1, tone.base);

      alb.fillStyle = tileGrad;
      alb.beginPath();
      // Stylized chiseled slate with clipped bottom corners
      alb.moveTo(x, y);
      alb.lineTo(x + actualW, y);
      alb.lineTo(x + actualW, y + h - 10);
      alb.lineTo(x + actualW - 10, y + h);
      alb.lineTo(x + 10, y + h);
      alb.lineTo(x, y + h - 10);
      alb.closePath();
      alb.fill();

      // Vertical side seams shadow
      alb.strokeStyle = '#08111a';
      alb.lineWidth = 3;
      alb.beginPath();
      alb.moveTo(x, y);
      alb.lineTo(x, y + h - 10);
      alb.stroke();

      // Hand-painted crisp bottom edge specular highlight (chiseled stone lip)
      alb.strokeStyle = tone.highlight;
      alb.lineWidth = 3.5;
      alb.beginPath();
      alb.moveTo(x + 10, y + h - 2);
      alb.lineTo(x + actualW - 10, y + h - 2);
      alb.stroke();

      // Chipped slate corner on 25% of tiles
      if ((c + Math.floor(x)) % 4 === 0) {
        alb.fillStyle = '#94a3b8'; // exposed grey stone under chip
        alb.beginPath();
        alb.moveTo(x + actualW - 16, y + h);
        alb.lineTo(x + actualW, y + h - 16);
        alb.lineTo(x + actualW - 8, y + h - 8);
        alb.closePath();
        alb.fill();
      }

      // Vertical cleavage grain in slate
      alb.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      alb.lineWidth = 1.5;
      alb.beginPath();
      alb.moveTo(x + 35, y + 15);
      alb.lineTo(x + 35, y + h - 15);
      alb.moveTo(x + 80, y + 20);
      alb.lineTo(x + 80, y + h - 20);
      alb.stroke();

      // Roughness (slate body ~0.58, bottom lip ~0.44)
      rgh.fillStyle = '#949494';
      rgh.fillRect(x, y, actualW, h - 8);
      rgh.strokeStyle = '#6e6e6e';
      rgh.lineWidth = 3;
      rgh.strokeRect(x, y + h - 6, actualW, 4);

      // Bump (stepped sawtooth profile: low at top, elevated at bottom edge)
      const bumpGrad = bmp.createLinearGradient(x, y, x, y + h);
      bumpGrad.addColorStop(0, '#5a5a5a');
      bumpGrad.addColorStop(0.9, '#b4b4b4');
      bumpGrad.addColorStop(1, '#646464');
      bmp.fillStyle = bumpGrad;
      bmp.fillRect(x, y, actualW, h);
    }
  }

  // --- Decorative Wrought Iron Ridge Cap Trim (Top 160px) ---
  const ridgeH = 160;
  alb.fillStyle = 'rgba(0, 0, 0, 0.7)';
  alb.fillRect(0, ridgeH, W, 18);

  const ridgeGrad = alb.createLinearGradient(0, 0, 0, ridgeH);
  ridgeGrad.addColorStop(0, '#475569');
  ridgeGrad.addColorStop(0.3, '#1e293b');
  ridgeGrad.addColorStop(0.8, '#0f172a');
  ridgeGrad.addColorStop(1, '#334155');
  alb.fillStyle = ridgeGrad;
  alb.fillRect(0, 0, W, ridgeH);

  // Decorative triangular teeth along bottom of ridge cap
  alb.beginPath();
  for (let tx = 0; tx < W; tx += 60) {
    alb.moveTo(tx, ridgeH);
    alb.lineTo(tx + 30, ridgeH + 35);
    alb.lineTo(tx + 60, ridgeH);
  }
  alb.fill();

  // Edge gleams & rivets along ridge cap
  alb.strokeStyle = '#94a3b8';
  alb.lineWidth = 3.5;
  alb.beginPath();
  alb.moveTo(0, 10);
  alb.lineTo(W, 10);
  alb.moveTo(0, ridgeH - 6);
  alb.lineTo(W, ridgeH - 6);
  alb.stroke();

  // Rivets spaced every 120px
  for (let rx = 50; rx < W; rx += 120) {
    drawRivet(alb, rx, ridgeH * 0.5, 14, false);
  }

  // Roughness & Metalness for Ridge Cap
  rgh.fillStyle = '#545454';
  rgh.fillRect(0, 0, W, ridgeH + 35);
  met.fillStyle = '#dedede'; // metalness 0.87
  met.fillRect(0, 0, W, ridgeH + 35);
  bmp.fillStyle = '#dcdcdc';
  bmp.fillRect(0, 0, W, ridgeH + 35);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('roofShingles', set);
  return set;
}

// =========================================================================
// 3. GARRISON DOORS & FORTIFIED WINDOWS TEXTURES
// =========================================================================
/**
 * Procedural Hand-Painted Double Garrison Gate with Crossed Swords & Iron Slit Windows
 * @returns {{map: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, metalnessMap: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture}}
 */
export function getBarracksDoorWindowTextures() {
  if (textureCache.has('doorWindow')) return textureCache.get('doorWindow');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Default stone background
  alb.fillStyle = '#374151';
  alb.fillRect(0, 0, W, H);
  rgh.fillStyle = '#c7c7c7';
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // =======================================================================
  // REGION A: Main Double Fortified Garrison Gate (Top half, Y: 0 to 1250)
  // =======================================================================
  const gateX = 60;
  const gateY = 60;
  const gateW = W - 120;
  const gateH = 1140;
  const midX = gateX + gateW / 2;

  // Dark stone portal arch frame surround
  alb.fillStyle = '#1e2530';
  alb.fillRect(gateX - 20, gateY - 20, gateW + 40, gateH + 40);

  // Vertical dark oak timbers on Left & Right door leaves
  const drawDoorTimbers = (dx, dw) => {
    const plankW = dw / 6;
    for (let i = 0; i < 6; i++) {
      const px = dx + i * plankW;
      const pGrad = alb.createLinearGradient(px, gateY, px + plankW, gateY);
      pGrad.addColorStop(0, '#1a0f08');
      pGrad.addColorStop(0.2, '#381f12');
      pGrad.addColorStop(0.8, '#2b170c');
      pGrad.addColorStop(1, '#150c06');

      alb.fillStyle = pGrad;
      alb.fillRect(px + 2, gateY, plankW - 4, gateH);

      // Vertical fiber grain
      alb.strokeStyle = '#120a05';
      alb.lineWidth = 2.5;
      for (let fx = px + 12; fx < px + plankW - 6; fx += 14) {
        alb.beginPath();
        alb.moveTo(fx, gateY);
        alb.lineTo(fx + (Math.sin(fx) * 5), gateY + gateH);
        alb.stroke();
      }

      // Plank chamfer highlight
      alb.strokeStyle = '#5a331c';
      alb.lineWidth = 2;
      alb.strokeRect(px + 2, gateY, plankW - 4, gateH);

      // Roughness for wood
      rgh.fillStyle = '#b8b8b8'; // 0.72
      rgh.fillRect(px + 2, gateY, plankW - 4, gateH);
      bmp.fillStyle = '#9e9e9e';
      bmp.fillRect(px + 2, gateY, plankW - 4, gateH);
    }
  };

  drawDoorTimbers(gateX + 6, gateW * 0.5 - 12);
  drawDoorTimbers(midX + 6, gateW * 0.5 - 12);

  // Meeting stile center divide line
  alb.fillStyle = '#0f172a';
  alb.fillRect(midX - 6, gateY, 12, gateH);

  // --- Massive Horizontal & Diagonal Forged Iron Bands ---
  const drawIronStrap = (sy, sh) => {
    // Drop shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.7)';
    alb.fillRect(gateX, sy + 5, gateW, sh);

    // Iron gradient
    const ironGrad = alb.createLinearGradient(gateX, sy, gateX, sy + sh);
    ironGrad.addColorStop(0, '#64748b');
    ironGrad.addColorStop(0.25, '#334155');
    ironGrad.addColorStop(0.75, '#1e293b');
    ironGrad.addColorStop(1, '#0f172a');
    alb.fillStyle = ironGrad;
    alb.fillRect(gateX, sy, gateW, sh);

    // Edge gleams
    alb.strokeStyle = '#cbd5e1';
    alb.lineWidth = 3;
    alb.strokeRect(gateX + 2, sy + 2, gateW - 4, sh - 4);

    // Metalness & Roughness & Bump
    rgh.fillStyle = '#545454'; // 0.33
    rgh.fillRect(gateX, sy, gateW, sh);
    met.fillStyle = '#ededed'; // 0.93
    met.fillRect(gateX, sy, gateW, sh);
    bmp.fillStyle = '#e1e1e1'; // 225
    bmp.fillRect(gateX, sy, gateW, sh);

    // Carriage bolt rivets
    for (let rx = gateX + 60; rx < gateX + gateW - 30; rx += 90) {
      if (Math.abs(rx - midX) > 40) {
        drawRivet(alb, rx, sy + sh * 0.5, 15, false);
      }
    }
  };

  drawIronStrap(gateY + 80, 90);   // Top band
  drawIronStrap(gateY + 540, 100); // Middle band
  drawIronStrap(gateY + 980, 90);  // Bottom band

  // --- Centered Royal Crossed Longswords Cartouche ---
  const bossRadius = 240;
  const bossCY = gateY + 590;

  // Cartouche shadow
  alb.fillStyle = 'rgba(0, 0, 0, 0.8)';
  alb.beginPath();
  alb.arc(midX + 4, bossCY + 6, bossRadius + 10, 0, Math.PI * 2);
  alb.fill();

  // Iron Boss Roundel Outer Ring
  const bossGrad = alb.createRadialGradient(midX - 40, bossCY - 40, 10, midX, bossCY, bossRadius);
  bossGrad.addColorStop(0, '#64748b');
  bossGrad.addColorStop(0.5, '#1e293b');
  bossGrad.addColorStop(0.85, '#0f172a');
  bossGrad.addColorStop(1, '#020617');
  alb.fillStyle = bossGrad;
  alb.beginPath();
  alb.arc(midX, bossCY, bossRadius, 0, Math.PI * 2);
  alb.fill();

  // Polished steel rim on roundel
  alb.strokeStyle = '#f8fafc';
  alb.lineWidth = 6;
  alb.beginPath();
  alb.arc(midX, bossCY, bossRadius - 6, 0, Math.PI * 2);
  alb.stroke();

  // Studded rivets around circular boss rim
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const rx = midX + Math.cos(a) * (bossRadius - 30);
    const ry = bossCY + Math.sin(a) * (bossRadius - 30);
    drawRivet(alb, rx, ry, 12, true); // golden brass rivets
  }

  // Draw Crossed Swords inside roundel
  drawCrossedSwords(alb, midX, bossCY, 360);

  // Cartouche PBR properties
  rgh.fillStyle = '#474747'; // 0.28
  rgh.beginPath();
  rgh.arc(midX, bossCY, bossRadius, 0, Math.PI * 2);
  rgh.fill();

  met.fillStyle = '#f5f5f5'; // 0.96
  met.beginPath();
  met.arc(midX, bossCY, bossRadius, 0, Math.PI * 2);
  met.fill();

  bmp.fillStyle = '#f0f0f0'; // 240
  bmp.beginPath();
  bmp.arc(midX, bossCY, bossRadius, 0, Math.PI * 2);
  bmp.fill();

  // Heavy Iron Ring Door Knockers on each leaf
  const drawRingKnocker = (kx, ky) => {
    // Mounting boss
    drawRivet(alb, kx, ky, 24, false);
    // Ring
    alb.strokeStyle = '#94a3b8';
    alb.lineWidth = 14;
    alb.beginPath();
    alb.arc(kx, ky + 45, 45, 0, Math.PI * 2);
    alb.stroke();
    alb.strokeStyle = '#1e293b';
    alb.lineWidth = 6;
    alb.stroke();
  };

  drawRingKnocker(gateX + gateW * 0.25, bossCY + 180);
  drawRingKnocker(gateX + gateW * 0.75, bossCY + 180);

  // =======================================================================
  // REGION B: Defensive Arrow Slit Windows with Security Bars (Bottom Left)
  // =======================================================================
  const winX = 100;
  const winY = 1360;
  const winW = 840;
  const winH = 620;

  // Heavy ashlar stone surround
  alb.fillStyle = '#374151';
  alb.fillRect(winX - 20, winY - 20, winW + 40, winH + 40);

  // 2 Arched Arrow Slit Windows
  const drawSlitWindow = (sx, sy, sw, sh) => {
    // Outer stone splay
    const splayGrad = alb.createLinearGradient(sx, sy, sx, sy + sh);
    splayGrad.addColorStop(0, '#4b5563');
    splayGrad.addColorStop(1, '#1f2937');
    alb.fillStyle = splayGrad;
    alb.beginPath();
    alb.roundRect(sx, sy, sw, sh, [sw * 0.5, sw * 0.5, 0, 0]);
    alb.fill();

    // Deep black interior recess
    const innerW = sw * 0.65;
    const innerH = sh * 0.85;
    const ix = sx + (sw - innerW) * 0.5;
    const iy = sy + (sh - innerH) * 0.5;

    alb.fillStyle = '#05070a';
    alb.beginPath();
    alb.roundRect(ix, iy, innerW, innerH, [innerW * 0.5, innerW * 0.5, 0, 0]);
    alb.fill();

    // Warm amber torchlight glow inside
    const glowGrad = alb.createRadialGradient(ix + innerW * 0.5, iy + innerH * 0.6, 5, ix + innerW * 0.5, iy + innerH * 0.6, innerW);
    glowGrad.addColorStop(0, 'rgba(255, 170, 0, 0.75)');
    glowGrad.addColorStop(0.5, 'rgba(234, 88, 12, 0.45)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    alb.fillStyle = glowGrad;
    alb.beginPath();
    alb.roundRect(ix, iy, innerW, innerH, [innerW * 0.5, innerW * 0.5, 0, 0]);
    alb.fill();

    // Heavy Forged Iron Vertical & Horizontal Security Bars
    alb.fillStyle = '#1e293b';
    alb.strokeStyle = '#64748b';
    alb.lineWidth = 3;

    // Vertical bars
    const barSpacing = innerW / 3;
    for (let b = 1; b <= 2; b++) {
      const bx = ix + b * barSpacing;
      alb.fillRect(bx - 6, iy, 12, innerH);
      alb.strokeRect(bx - 6, iy, 12, innerH);
    }
    // Horizontal bars
    const hSpacing = innerH / 4;
    for (let h = 1; h <= 3; h++) {
      const by = iy + h * hSpacing;
      alb.fillRect(ix, by - 6, innerW, 12);
      alb.strokeRect(ix, by - 6, innerW, 12);
    }

    // Roughness & bump for window
    rgh.fillStyle = '#f0f0f0'; // void is rough/matte
    rgh.fillRect(ix, iy, innerW, innerH);
    met.fillStyle = '#000000';
    met.fillRect(ix, iy, innerW, innerH);
    bmp.fillStyle = '#202020'; // deep recessed window void ~ 32
    bmp.fillRect(ix, iy, innerW, innerH);
  };

  drawSlitWindow(winX + 60, winY + 40, 300, 520);
  drawSlitWindow(winX + 460, winY + 40, 300, 520);

  // =======================================================================
  // REGION C: Reinforced Armory Wing Door (Bottom Right)
  // =======================================================================
  const armX = 1100;
  const armY = 1360;
  const armW = 840;
  const armH = 620;

  // Plated iron door background
  const armGrad = alb.createLinearGradient(armX, armY, armX + armW, armY + armH);
  armGrad.addColorStop(0, '#334155');
  armGrad.addColorStop(0.5, '#1e293b');
  armGrad.addColorStop(1, '#0f172a');
  alb.fillStyle = armGrad;
  alb.fillRect(armX, armY, armW, armH);

  // Riveted Iron Sheet Panels
  alb.strokeStyle = '#64748b';
  alb.lineWidth = 4;
  alb.strokeRect(armX + 10, armY + 10, armW - 20, armH - 20);
  alb.strokeRect(armX + armW * 0.5 - 2, armY + 10, 4, armH - 20);

  // Diagonal bracing straps
  alb.beginPath();
  alb.moveTo(armX + 10, armY + 10);
  alb.lineTo(armX + armW - 10, armY + armH - 10);
  alb.moveTo(armX + armW - 10, armY + 10);
  alb.lineTo(armX + 10, armY + armH - 10);
  alb.stroke();

  // Heavy rivets along perimeter and diagonals
  for (let px = armX + 40; px < armX + armW - 20; px += 80) {
    drawRivet(alb, px, armY + 30, 14, false);
    drawRivet(alb, px, armY + armH - 30, 14, false);
  }

  // Peep hole with sliding metal grate
  const peepX = armX + armW * 0.5 - 60;
  const peepY = armY + 140;
  alb.fillStyle = '#05070a';
  alb.fillRect(peepX, peepY, 120, 60);
  alb.strokeStyle = '#94a3b8';
  alb.lineWidth = 4;
  alb.strokeRect(peepX, peepY, 120, 60);
  // Grate bars
  for (let gx = peepX + 24; gx < peepX + 120; gx += 24) {
    alb.beginPath();
    alb.moveTo(gx, peepY);
    alb.lineTo(gx, peepY + 60);
    alb.stroke();
  }

  // Heavy sliding padlock hasp
  alb.fillStyle = '#0f172a';
  alb.fillRect(armX + armW * 0.5 - 70, armY + 320, 140, 50);
  alb.strokeStyle = '#cbd5e1';
  alb.strokeRect(armX + armW * 0.5 - 70, armY + 320, 140, 50);
  // Heavy brass padlock
  alb.fillStyle = '#f59e0b';
  alb.fillRect(armX + armW * 0.5 - 25, armY + 380, 50, 60);
  alb.strokeStyle = '#fffbeb';
  alb.strokeRect(armX + armW * 0.5 - 25, armY + 380, 50, 60);

  // Armory door PBR
  rgh.fillStyle = '#545454';
  rgh.fillRect(armX, armY, armW, armH);
  met.fillStyle = '#e8e8e8'; // metalness 0.91
  met.fillRect(armX, armY, armW, armH);
  bmp.fillStyle = '#cccccc';
  bmp.fillRect(armX, armY, armW, armH);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('doorWindow', set);
  return set;
}

// =========================================================================
// 4. MILITARY PROPS TEXTURES (Shields, Weapons, Straw Dummy, Braziers, Banners)
// =========================================================================
/**
 * Procedural Hand-Painted Military Props Texture Atlas:
 * - Royal Lion Heater Shield (Top Left)
 * - Steel Halberds, Spears & Wooden Weapon Rack (Top Right)
 * - Straw Training Dummy with Patched Burlap & Target (Bottom Left)
 * - Iron Wall Brazier, Burning Embers & Silk Royal Pennants (Bottom Right)
 * @returns {{map: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, metalnessMap: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture}}
 */
export function getBarracksPropsTextures() {
  if (textureCache.has('props')) return textureCache.get('props');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Background
  alb.fillStyle = '#1e293b';
  alb.fillRect(0, 0, W, H);
  rgh.fillStyle = '#8f8f8f';
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // =======================================================================
  // QUADRANT 1: Royal Heraldic Heater Shield (Top-Left, X: 0..1024, Y: 0..1024)
  // =======================================================================
  const shX = 512;
  const shY = 512;
  const shW = 420;
  const shH = 500;

  function renderShieldPath(c) {
    c.beginPath();
    c.moveTo(shX - shW * 0.5, shY - shH * 0.5);
    c.lineTo(shX + shW * 0.5, shY - shH * 0.5);
    c.lineTo(shX + shW * 0.5, shY);
    c.bezierCurveTo(shX + shW * 0.5, shY + shH * 0.35, shX + shW * 0.25, shY + shH * 0.45, shX, shY + shH * 0.52);
    c.bezierCurveTo(shX - shW * 0.25, shY + shH * 0.45, shX - shW * 0.5, shY + shH * 0.35, shX - shW * 0.5, shY);
    c.closePath();
  }

  // Shield drop shadow
  alb.save();
  alb.translate(8, 12);
  alb.fillStyle = 'rgba(0, 0, 0, 0.75)';
  renderShieldPath(alb);
  alb.fill();
  alb.restore();

  // Royal Cobalt Blue field gradient
  const shieldGrad = alb.createRadialGradient(shX, shY - 100, 20, shX, shY, shH * 0.6);
  shieldGrad.addColorStop(0, '#3b82f6');
  shieldGrad.addColorStop(0.4, '#1d4ed8');
  shieldGrad.addColorStop(0.85, '#1e3a8a');
  shieldGrad.addColorStop(1, '#0f172a');
  alb.fillStyle = shieldGrad;
  renderShieldPath(alb);
  alb.fill();

  // Rampant Golden Lion Crest in center of shield
  drawRampantLion(alb, shX, shY + 20, 1.2, 1.2);

  // Polished Steel Rim framing shield
  alb.strokeStyle = '#e2e8f0';
  alb.lineWidth = 26;
  renderShieldPath(alb);
  alb.stroke();

  alb.strokeStyle = '#64748b';
  alb.lineWidth = 14;
  renderShieldPath(alb);
  alb.stroke();

  // Shield rim rivets
  const rimRivets = [
    [shX - shW * 0.45, shY - shH * 0.45],
    [shX - shW * 0.2, shY - shH * 0.45],
    [shX, shY - shH * 0.45],
    [shX + shW * 0.2, shY - shH * 0.45],
    [shX + shW * 0.45, shY - shH * 0.45],
    [shX + shW * 0.45, shY - shH * 0.2],
    [shX + shW * 0.45, shY + 10],
    [shX + shW * 0.35, shY + shH * 0.25],
    [shX + shW * 0.15, shY + shH * 0.42],
    [shX, shY + shH * 0.49],
    [shX - shW * 0.15, shY + shH * 0.42],
    [shX - shW * 0.35, shY + shH * 0.25],
    [shX - shW * 0.45, shY + 10],
    [shX - shW * 0.45, shY - shH * 0.2]
  ];
  rimRivets.forEach(([rx, ry]) => drawRivet(alb, rx, ry, 12, false));

  // Shield Boss (central steel umbo)
  drawRivet(alb, shX, shY - 140, 26, false);

  // Shield PBR properties
  rgh.fillStyle = '#6e6e6e'; // ~0.43
  renderShieldPath(rgh);
  rgh.fill();
  met.fillStyle = '#1f1f1f'; // painted surface has subtle sheen
  renderShieldPath(met);
  met.fill();
  bmp.fillStyle = '#a0a0a0';
  renderShieldPath(bmp);
  bmp.fill();

  // Rim metalness
  met.strokeStyle = '#f5f5f5'; // 0.96
  met.lineWidth = 26;
  renderShieldPath(met);
  met.stroke();

  // =======================================================================
  // QUADRANT 2: Weapon Rack & Steel Halberds / Spears (Top-Right, X: 1024..2048, Y: 0..1024)
  // =======================================================================
  // 1. Broad Steel Halberd Axe Head (X: 1100 to 1600, Y: 80 to 520)
  const drawHalberdHead = (hx, hy, scale = 1.0) => {
    alb.save();
    alb.translate(hx, hy);
    alb.scale(scale, scale);

    // Drop shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.7)';
    alb.beginPath();
    alb.moveTo(6, -180);
    alb.lineTo(30, -80);
    alb.lineTo(170, -20);
    alb.bezierCurveTo(210, 50, 190, 130, 130, 180);
    alb.lineTo(30, 90);
    alb.lineTo(-40, 110);
    alb.lineTo(-110, 40); // rear armor beak
    alb.lineTo(-30, 20);
    alb.closePath();
    alb.fill();

    // Steel blade face gradient
    const bladeGrad = alb.createLinearGradient(-100, -100, 200, 150);
    bladeGrad.addColorStop(0, '#f8fafc');
    bladeGrad.addColorStop(0.3, '#cbd5e1');
    bladeGrad.addColorStop(0.65, '#64748b');
    bladeGrad.addColorStop(1, '#334155');
    alb.fillStyle = bladeGrad;
    alb.beginPath();
    alb.moveTo(0, -190); // top spike
    alb.lineTo(25, -90);
    alb.lineTo(165, -30);
    alb.bezierCurveTo(205, 40, 185, 120, 125, 170); // crescent axe blade
    alb.lineTo(25, 80);
    alb.lineTo(-45, 100);
    alb.lineTo(-120, 30); // sharp armor-piercing rear beak
    alb.lineTo(-35, 10);
    alb.closePath();
    alb.fill();

    // Razor-sharp cutting edge bevel highlight
    alb.strokeStyle = '#ffffff';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(165, -30);
    alb.bezierCurveTo(205, 40, 185, 120, 125, 170);
    alb.stroke();

    // Golden socket collar
    const sockGrad = alb.createLinearGradient(-30, 50, 30, 120);
    sockGrad.addColorStop(0, '#fffbeb');
    sockGrad.addColorStop(0.5, '#f59e0b');
    sockGrad.addColorStop(1, '#78350f');
    alb.fillStyle = sockGrad;
    alb.fillRect(-25, 70, 50, 70);
    alb.strokeStyle = '#fde047';
    alb.lineWidth = 2.5;
    alb.strokeRect(-25, 70, 50, 70);
    drawRivet(alb, 0, 105, 10, true);

    alb.restore();
  };

  drawHalberdHead(1360, 260, 1.25);

  // 2. Leaf-Shaped Spear Heads
  const drawSpearHead = (sx, sy, scale = 1.0) => {
    alb.save();
    alb.translate(sx, sy);
    alb.scale(scale, scale);

    // Spear blade
    const spGrad = alb.createLinearGradient(-30, -100, 30, 100);
    spGrad.addColorStop(0, '#ffffff');
    spGrad.addColorStop(0.5, '#cbd5e1');
    spGrad.addColorStop(1, '#475569');
    alb.fillStyle = spGrad;
    alb.beginPath();
    alb.moveTo(0, -140);
    alb.bezierCurveTo(45, -70, 45, 10, 15, 60);
    alb.lineTo(15, 110);
    alb.lineTo(-15, 110);
    alb.lineTo(-15, 60);
    alb.bezierCurveTo(-45, 10, -45, -70, 0, -140);
    alb.closePath();
    alb.fill();

    // Center spine ridge
    alb.strokeStyle = '#334155';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(0, -135);
    alb.lineTo(0, 110);
    alb.stroke();

    // Brass collar
    alb.fillStyle = '#f59e0b';
    alb.fillRect(-18, 100, 36, 40);
    drawRivet(alb, 0, 120, 8, true);

    alb.restore();
  };

  drawSpearHead(1850, 240, 1.3);

  // Weapon metalness in Quadrant 2
  met.fillStyle = '#f0f0f0'; // high metalness 0.94
  met.fillRect(1080, 50, 920, 460);
  rgh.fillStyle = '#424242'; // smooth steel 0.26
  rgh.fillRect(1080, 50, 920, 460);
  bmp.fillStyle = '#e8e8e8';
  bmp.fillRect(1080, 50, 920, 460);

  // 3. Wooden Weapon Rack Beams (Bottom half of Q2, Y: 560 to 1000)
  const rackY = 560;
  const rackH = 420;
  // Weathered oak rack planks
  const rackGrad = alb.createLinearGradient(1040, rackY, 1040, rackY + rackH);
  rackGrad.addColorStop(0, '#54341e');
  rackGrad.addColorStop(0.5, '#3b2314');
  rackGrad.addColorStop(1, '#23140a');
  alb.fillStyle = rackGrad;
  alb.fillRect(1060, rackY, 940, rackH);

  // Horizontal shelf planks with cradle notches
  alb.fillStyle = '#26150b';
  alb.fillRect(1060, rackY + 120, 940, 60);
  alb.fillRect(1060, rackY + 280, 940, 60);

  // Dowel pegs and wood grain
  for (let px = 1140; px < 1960; px += 140) {
    drawRivet(alb, px, rackY + 150, 18, true); // brass pins
    drawRivet(alb, px, rackY + 310, 18, true);
  }

  // Rack wood PBR
  rgh.fillStyle = '#b8b8b8';
  rgh.fillRect(1060, rackY, 940, rackH);
  met.fillStyle = '#000000';
  met.fillRect(1060, rackY, 940, rackH);
  bmp.fillStyle = '#9c9c9c';
  bmp.fillRect(1060, rackY, 940, rackH);

  // =======================================================================
  // QUADRANT 3: Straw Training Dummy & Patched Burlap (Bottom-Left, X: 0..1024, Y: 1024..2048)
  // =======================================================================
  const dumX = 50;
  const dumY = 1080;
  const dumW = 920;
  const dumH = 900;

  // 1. Straw bundle weave texture (Left side of Q3)
  const strawGrad = alb.createLinearGradient(dumX, dumY, dumX + 440, dumY);
  strawGrad.addColorStop(0, '#ca8a04');
  strawGrad.addColorStop(0.3, '#eab308');
  strawGrad.addColorStop(0.7, '#fef08a');
  strawGrad.addColorStop(1, '#a16207');
  alb.fillStyle = strawGrad;
  alb.fillRect(dumX, dumY, 440, dumH);

  // Procedural individual straw stalks & fibers
  for (let sy = dumY; sy < dumY + dumH; sy += 10) {
    alb.strokeStyle = (sy % 20 === 0) ? '#854d0e' : '#fef9c3';
    alb.lineWidth = 2.5;
    alb.beginPath();
    alb.moveTo(dumX, sy);
    alb.lineTo(dumX + 440, sy + (Math.sin(sy * 0.2) * 8));
    alb.stroke();
  }

  // Thick hemp binding ropes wrapped around straw bundle
  const drawRopeWrap = (ry) => {
    alb.fillStyle = '#78350f';
    alb.fillRect(dumX, ry, 440, 36);
    // Twisted rope strands
    for (let rx = dumX; rx < dumX + 440; rx += 22) {
      alb.strokeStyle = '#fef08a';
      alb.lineWidth = 4;
      alb.beginPath();
      alb.moveTo(rx, ry + 32);
      alb.lineTo(rx + 16, ry + 4);
      alb.stroke();
    }
  };

  drawRopeWrap(dumY + 120);
  drawRopeWrap(dumY + 360);
  drawRopeWrap(dumY + 680);

  // 2. Patched Burlap Sack Tunic & Bullseye Target (Right side of Q3)
  const burX = dumX + 460;
  const burW = 460;
  const burlapGrad = alb.createLinearGradient(burX, dumY, burX + burW, dumY + dumH);
  burlapGrad.addColorStop(0, '#92400e');
  burlapGrad.addColorStop(0.5, '#b45309');
  burlapGrad.addColorStop(1, '#78350f');
  alb.fillStyle = burlapGrad;
  alb.fillRect(burX, dumY, burW, dumH);

  // Burlap woven cross-hatch pattern
  alb.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  alb.lineWidth = 2;
  for (let bx = burX; bx < burX + burW; bx += 14) {
    alb.beginPath();
    alb.moveTo(bx, dumY);
    alb.lineTo(bx, dumY + dumH);
    alb.stroke();
  }
  for (let by = dumY; by < dumY + dumH; by += 14) {
    alb.beginPath();
    alb.moveTo(burX, by);
    alb.lineTo(burX + burW, by);
    alb.stroke();
  }

  // Painted Red Bullseye Target on burlap chest
  const tX = burX + burW * 0.5;
  const tY = dumY + 340;

  // Outer white target ring
  alb.strokeStyle = '#fef3c7';
  alb.lineWidth = 26;
  alb.beginPath();
  alb.arc(tX, tY, 150, 0, Math.PI * 2);
  alb.stroke();

  // Middle red ring
  alb.strokeStyle = '#dc2626';
  alb.lineWidth = 32;
  alb.beginPath();
  alb.arc(tX, tY, 110, 0, Math.PI * 2);
  alb.stroke();

  // Inner white ring
  alb.strokeStyle = '#ffffff';
  alb.lineWidth = 22;
  alb.beginPath();
  alb.arc(tX, tY, 65, 0, Math.PI * 2);
  alb.stroke();

  // Solid Red Bullseye Center
  alb.fillStyle = '#b91c1c';
  alb.beginPath();
  alb.arc(tX, tY, 40, 0, Math.PI * 2);
  alb.fill();

  // Piercing weapon cuts and slashes across target
  alb.strokeStyle = '#1c1917';
  alb.lineWidth = 4;
  alb.beginPath();
  alb.moveTo(tX - 80, tY - 60);
  alb.lineTo(tX + 90, tY + 40);
  alb.moveTo(tX + 30, tY - 70);
  alb.lineTo(tX - 40, tY + 80);
  alb.stroke();

  // Patched Leather Corner with White Thread Stitches
  alb.fillStyle = '#451a03';
  alb.fillRect(burX + 20, dumY + 680, 200, 160);
  drawStitches(alb, burX + 25, dumY + 685, burX + 215, dumY + 685, 16, 10, '#fef08a');
  drawStitches(alb, burX + 215, dumY + 685, burX + 215, dumY + 835, 16, 10, '#fef08a');
  drawStitches(alb, burX + 215, dumY + 835, burX + 25, dumY + 835, 16, 10, '#fef08a');
  drawStitches(alb, burX + 25, dumY + 835, burX + 25, dumY + 685, 16, 10, '#fef08a');

  // Straw & Burlap PBR (rough & non-metallic)
  rgh.fillStyle = '#e8e8e8'; // very rough 0.91
  rgh.fillRect(dumX, dumY, dumW, dumH);
  met.fillStyle = '#000000';
  met.fillRect(dumX, dumY, dumW, dumH);
  bmp.fillStyle = '#949494';
  bmp.fillRect(dumX, dumY, dumW, dumH);

  // =======================================================================
  // QUADRANT 4: Iron Wall Brazier, Burning Embers & Royal Pennants (Bottom-Right)
  // =======================================================================
  // 1. Glowing Hot Embers & Coals (X: 1100 to 1550, Y: 1100 to 1550)
  const embX = 1100;
  const embY = 1100;
  const embSize = 450;
  const eCX = embX + embSize * 0.5;
  const eCY = embY + embSize * 0.5;

  const emberGrad = alb.createRadialGradient(eCX, eCY, 20, eCX, eCY, embSize * 0.5);
  emberGrad.addColorStop(0, '#ffffff'); // blinding white-yellow core
  emberGrad.addColorStop(0.2, '#fef08a');
  emberGrad.addColorStop(0.45, '#f97316'); // radiant flame orange
  emberGrad.addColorStop(0.75, '#dc2626'); // fiery red
  emberGrad.addColorStop(0.92, '#7f1d1d');
  emberGrad.addColorStop(1, '#18181b'); // charred charcoal rim
  alb.fillStyle = emberGrad;
  alb.fillRect(embX, embY, embSize, embSize);

  // Dark jagged charcoal chunks floating in incandescent lava coals
  alb.fillStyle = '#18181b';
  for (let c = 0; c < 24; c++) {
    const ca = (c / 24) * Math.PI * 2;
    const cr = 40 + (c % 5) * 35;
    const cx = eCX + Math.cos(ca) * cr;
    const cy = eCY + Math.sin(ca) * cr;
    alb.beginPath();
    alb.arc(cx, cy, 14 + (c % 4) * 6, 0, Math.PI * 2);
    alb.fill();
  }

  // 2. Iron Wall Brazier Basket & Corbel Bracket (X: 1600 to 2000, Y: 1100 to 1550)
  const brX = 1600;
  const brY = 1100;
  const brW = 400;
  const brH = 450;
  const brGrad = alb.createLinearGradient(brX, brY, brX + brW, brY + brH);
  brGrad.addColorStop(0, '#475569');
  brGrad.addColorStop(0.35, '#1e293b');
  brGrad.addColorStop(0.85, '#0f172a');
  brGrad.addColorStop(1, '#020617');
  alb.fillStyle = brGrad;
  alb.fillRect(brX, brY, brW, brH);

  // Hammered curved ribs of brazier
  alb.strokeStyle = '#94a3b8';
  alb.lineWidth = 6;
  for (let rx = brX + 40; rx < brX + brW; rx += 60) {
    alb.beginPath();
    alb.moveTo(rx, brY);
    alb.quadraticCurveTo(rx - 20, brY + brH * 0.5, rx + 15, brY + brH);
    alb.stroke();
    drawRivet(alb, rx, brY + 30, 12, false);
    drawRivet(alb, rx + 15, brY + brH - 30, 12, false);
  }

  // 3. Fluttering Royal Military Pennants & Banners (X: 1100 to 2000, Y: 1600 to 2000)
  const penX = 1100;
  const penY = 1600;
  const penW = 900;
  const penH = 400;

  // Royal Cobalt Blue Silk field
  const penGrad = alb.createLinearGradient(penX, penY, penX + penW, penY);
  penGrad.addColorStop(0, '#1d4ed8');
  penGrad.addColorStop(0.4, '#2563eb');
  penGrad.addColorStop(0.8, '#1e40af');
  penGrad.addColorStop(1, '#1e3a8a');
  alb.fillStyle = penGrad;
  alb.fillRect(penX, penY, penW, penH);

  // Gold Embroidered Border & Chevron Stripes
  alb.strokeStyle = '#fbbf24';
  alb.lineWidth = 14;
  alb.strokeRect(penX + 10, penY + 10, penW - 20, penH - 20);

  // Chevron heraldic stripes
  alb.fillStyle = '#f59e0b';
  for (let chX = penX + 80; chX < penX + penW - 100; chX += 220) {
    alb.beginPath();
    alb.moveTo(chX, penY + 20);
    alb.lineTo(chX + 60, penY + penH * 0.5);
    alb.lineTo(chX, penY + penH - 20);
    alb.lineTo(chX + 40, penY + penH - 20);
    alb.lineTo(chX + 100, penY + penH * 0.5);
    alb.lineTo(chX + 40, penY + 20);
    alb.closePath();
    alb.fill();
  }

  // Gold fringe along swallowtail edges
  alb.strokeStyle = '#fde047';
  alb.lineWidth = 4;
  for (let fx = penX + 20; fx < penX + penW - 20; fx += 8) {
    alb.beginPath();
    alb.moveTo(fx, penY + penH - 20);
    alb.lineTo(fx, penY + penH);
    alb.stroke();
  }

  // Brazier & banner PBR
  rgh.fillStyle = '#646464';
  rgh.fillRect(penX, penY, penW, penH);
  met.fillStyle = '#101010'; // cloth
  met.fillRect(penX, penY, penW, penH);

  // Brazier iron PBR
  met.fillStyle = '#e5e5e5'; // metalness 0.90
  met.fillRect(brX, brY, brW, brH);
  rgh.fillStyle = '#545454';
  rgh.fillRect(brX, brY, brW, brH);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('props', set);
  return set;
}

// =========================================================================
// HIGH-LEVEL MATERIAL BUILDER FOR THE BARRACKS
// =========================================================================
/**
 * Helper to build a complete suite of configured PBR materials for the Barracks model.
 * @returns {Object.<string, THREE.MeshStandardMaterial>}
 */
export function getBarracksMaterials() {
  const stoneTimberTex = getBarracksStoneTimberTextures();
  const roofTex = getBarracksRoofTextures();
  const doorWinTex = getBarracksDoorWindowTextures();
  const propsTex = getBarracksPropsTextures();

  function makeMat(tex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      metalnessMap: tex.metalnessMap,
      bumpMap: tex.bumpMap,
      bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : 0.05,
      roughness: opts.roughness !== undefined ? opts.roughness : 1.0,
      metalness: opts.metalness !== undefined ? opts.metalness : 1.0,
      flatShading: opts.flatShading !== undefined ? opts.flatShading : false,
      ...opts
    });
  }

  return {
    stoneTimber: makeMat(stoneTimberTex, { bumpScale: 0.06 }),
    stoneWalls: makeMat(stoneTimberTex, { bumpScale: 0.07 }),
    roofShingles: makeMat(roofTex, { bumpScale: 0.08 }),
    doorsAndWindows: makeMat(doorWinTex, { bumpScale: 0.07 }),
    gateDoors: makeMat(doorWinTex, { bumpScale: 0.08 }),
    props: makeMat(propsTex, { bumpScale: 0.06 }),
    // Dedicated brazier coals with warm self-illumination
    emberCoals: new THREE.MeshStandardMaterial({
      map: propsTex.map,
      roughness: 0.7,
      metalness: 0.1,
      emissive: new THREE.Color(0xff4500),
      emissiveIntensity: 0.85,
      emissiveMap: propsTex.map
    }),
    // Royal military pennants with vibrant silk sheen
    pennantBanner: new THREE.MeshStandardMaterial({
      map: propsTex.map,
      roughness: 0.6,
      metalness: 0.08,
      side: THREE.DoubleSide
    })
  };
}
