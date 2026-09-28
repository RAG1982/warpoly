import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Cottage
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen Triple-A standards (Valorant / Overwatch / UE5).
 *
 * Generates 2048x2048 high-resolution textures tailored to each component:
 * - getCottageTimberPlasterTextures(): Warm ochre/cream rustic stucco with dark hand-hewn oak half-timber framing (enxaimel) and wooden peg joints
 * - getCottageFoundationTextures(): River rock foundation with varied rock tones and mossy crevices
 * - getCottageRoofTextures(): Vibrant scalloped ceramic/slate tiles with individual shading, dormer eave trims, and roof moss
 * - getCottageDoorTextures(): Arched vertical wooden door planks with black iron strap hinges and ring latch
 * - getCottageWindowTextures(): Leaded diamond-lattice glass windows with warm glowing interior light and emissive map
 * - getCottageChimneyTextures(): Weathered cobblestone and terracotta bricks with soot gradient
 * - getCottageWoodTextures(): Hewn oak timbers, carved eaves, and firewood log ends with tree growth rings
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, repeatX = 1, repeatY = 1) {
  if (repeatX > 1 || repeatY > 1) {
    return makeTexture(canvas, isSRGB, { wrapS: THREE.RepeatWrapping, repeatX, repeatY });
  }
  return makeTexture(canvas, isSRGB, { wrapS: THREE.ClampToEdgeWrapping });
}

/**
 * Helper: draw stylized rivet/bolt with drop shadow and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

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
 * Helper: draw hand-carved wooden peg dowel with shadow and top highlight
 */
function drawWoodenPeg(ctx, cx, cy, radius = 14) {
  ctx.save();
  // Drop shadow
  ctx.fillStyle = 'rgba(15, 8, 4, 0.6)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  // Peg end face gradient
  const pegGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 2, cx, cy, radius);
  pegGrad.addColorStop(0.0, '#a8754b');
  pegGrad.addColorStop(0.5, '#855632');
  pegGrad.addColorStop(0.85, '#613c20');
  pegGrad.addColorStop(1.0, '#3d2310');
  ctx.fillStyle = pegGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Top-left rim highlight
  ctx.strokeStyle = 'rgba(255, 230, 195, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1.5, Math.PI * 0.9, Math.PI * 1.8);
  ctx.stroke();
  ctx.restore();
}

/* ==========================================================================
   1. HALF-TIMBER & PLASTER (ENXAIMEL) TEXTURES
   ========================================================================== */
export function getCottageTimberPlasterTextures() {
  if (textureCache.has('timberPlaster')) return textureCache.get('timberPlaster');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // --- Base Plaster / Rustic Stucco ---
  // Warm ochre / cream plaster gradient
  const plasterGrad = alb.createLinearGradient(0, 0, 0, H);
  plasterGrad.addColorStop(0.0, '#f9edd8');
  plasterGrad.addColorStop(0.3, '#f2dec0');
  plasterGrad.addColorStop(0.7, '#e8caa1');
  plasterGrad.addColorStop(1.0, '#d8b584');
  alb.fillStyle = plasterGrad;
  alb.fillRect(0, 0, W, H);

  // Hand-painted trowel ridges & subtle stucco variation
  alb.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let y = 0; y < H; y += 36) {
    const shift = (y % 72 === 0) ? 40 : 0;
    for (let x = shift; x < W; x += 90) {
      alb.beginPath();
      alb.ellipse(x, y, 45, 14, 0.08, 0, Math.PI * 2);
      alb.fill();
    }
  }
  alb.fillStyle = 'rgba(140, 95, 45, 0.05)';
  for (let y = 18; y < H; y += 42) {
    for (let x = 20; x < W; x += 110) {
      alb.beginPath();
      alb.ellipse(x, y, 50, 16, -0.06, 0, Math.PI * 2);
      alb.fill();
    }
  }

  // Base Roughness (Plaster is matte ~0.86)
  rgh.fillStyle = '#dbdbdb';
  rgh.fillRect(0, 0, W, H);

  // Base Metalness (Non-metallic)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Base Bump (Neutral plaster ~0.50)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // --- Half-Timber Framing System (Enxaimel) ---
  const drawTimberBeam = (x1, y1, w, h, isVertical = false) => {
    // Drop shadow cast onto plaster
    alb.fillStyle = 'rgba(24, 12, 6, 0.42)';
    alb.fillRect(x1 + (isVertical ? 12 : 0), y1 + (isVertical ? 0 : 12), w + 4, h + 4);

    // Dark hewn oak base gradient
    const beamGrad = isVertical
      ? alb.createLinearGradient(x1, y1, x1 + w, y1)
      : alb.createLinearGradient(x1, y1, x1, y1 + h);
    beamGrad.addColorStop(0.0, '#382012');
    beamGrad.addColorStop(0.2, '#4d2d18');
    beamGrad.addColorStop(0.5, '#5c361e');
    beamGrad.addColorStop(0.8, '#462714');
    beamGrad.addColorStop(1.0, '#2b1609');
    alb.fillStyle = beamGrad;
    alb.fillRect(x1, y1, w, h);

    // Longitudinal wood grain fibers
    alb.fillStyle = 'rgba(230, 180, 130, 0.12)';
    const grainStep = isVertical ? 14 : 14;
    if (isVertical) {
      for (let x = x1 + 8; x < x1 + w - 8; x += grainStep) {
        alb.fillRect(x, y1, 3, h);
      }
    } else {
      for (let y = y1 + 8; y < y1 + h - 8; y += grainStep) {
        alb.fillRect(x1, y, w, 3);
      }
    }

    alb.fillStyle = 'rgba(20, 10, 5, 0.18)';
    if (isVertical) {
      for (let x = x1 + 14; x < x1 + w - 8; x += grainStep * 1.5) {
        alb.fillRect(x, y1, 4, h);
      }
    } else {
      for (let y = y1 + 14; y < y1 + h - 8; y += grainStep * 1.5) {
        alb.fillRect(x1, y, w, 4);
      }
    }

    // Top/Left Hand-painted bevel edge highlight
    alb.strokeStyle = '#8a5938';
    alb.lineWidth = 5;
    alb.beginPath();
    if (isVertical) {
      alb.moveTo(x1 + 3, y1);
      alb.lineTo(x1 + 3, y1 + h);
    } else {
      alb.moveTo(x1, y1 + 3);
      alb.lineTo(x1 + w, y1 + 3);
    }
    alb.stroke();

    // Inner bright highlight line
    alb.strokeStyle = '#a6724b';
    alb.lineWidth = 2.5;
    alb.beginPath();
    if (isVertical) {
      alb.moveTo(x1 + 6, y1 + 4);
      alb.lineTo(x1 + 6, y1 + h - 4);
    } else {
      alb.moveTo(x1 + 4, y1 + 6);
      alb.lineTo(x1 + w - 4, y1 + 6);
    }
    alb.stroke();

    // Bottom/Right Dark bevel edge
    alb.strokeStyle = '#1d0d05';
    alb.lineWidth = 4;
    alb.beginPath();
    if (isVertical) {
      alb.moveTo(x1 + w - 2, y1);
      alb.lineTo(x1 + w - 2, y1 + h);
    } else {
      alb.moveTo(x1, y1 + h - 2);
      alb.lineTo(x1 + w, y1 + h - 2);
    }
    alb.stroke();

    // Update Roughness for timber (satiny aged wood ~0.68)
    rgh.fillStyle = '#adadad';
    rgh.fillRect(x1, y1, w, h);

    // Update Bump for timber (raised ~0.76)
    bmp.fillStyle = '#c2c2c2';
    bmp.fillRect(x1, y1, w, h);
    bmp.strokeStyle = '#4a4a4a';
    bmp.lineWidth = 4;
    bmp.strokeRect(x1, y1, w, h);
  };

  const drawDiagonalBrace = (x1, y1, x2, y2, beamThick = 90) => {
    alb.save();
    // Drop shadow
    alb.strokeStyle = 'rgba(24, 12, 6, 0.42)';
    alb.lineWidth = beamThick + 8;
    alb.lineCap = 'butt';
    alb.beginPath();
    alb.moveTo(x1 + 8, y1 + 10);
    alb.lineTo(x2 + 8, y2 + 10);
    alb.stroke();

    // Wood base
    alb.strokeStyle = '#4e2d19';
    alb.lineWidth = beamThick;
    alb.beginPath();
    alb.moveTo(x1, y1);
    alb.lineTo(x2, y2);
    alb.stroke();

    // Inner highlight
    alb.strokeStyle = '#8a5938';
    alb.lineWidth = 6;
    alb.beginPath();
    alb.moveTo(x1 - 10, y1);
    alb.lineTo(x2 - 10, y2);
    alb.stroke();

    alb.restore();

    // Roughness & bump for diagonal brace
    rgh.save();
    rgh.strokeStyle = '#adadad';
    rgh.lineWidth = beamThick;
    rgh.beginPath();
    rgh.moveTo(x1, y1);
    rgh.lineTo(x2, y2);
    rgh.stroke();
    rgh.restore();

    bmp.save();
    bmp.strokeStyle = '#bfbfbf';
    bmp.lineWidth = beamThick;
    bmp.beginPath();
    bmp.moveTo(x1, y1);
    bmp.lineTo(x2, y2);
    bmp.stroke();
    bmp.restore();
  };

  // Outer Perimeter Frame Beams
  const B = 110; // beam thickness
  drawTimberBeam(0, 0, W, B, false);             // Top plate beam
  drawTimberBeam(0, H - B, W, B, false);         // Bottom sill beam
  drawTimberBeam(0, 0, B, H, true);              // Left corner post
  drawTimberBeam(W - B, 0, B, H, true);          // Right corner post

  // Middle Horizontal Girt Beam
  const midY = Math.floor(H * 0.5 - B * 0.5);
  drawTimberBeam(0, midY, W, B, false);

  // Vertical Stud Posts (at 1/3 and 2/3 width)
  const col1X = Math.floor(W * 0.33 - B * 0.5);
  const col2X = Math.floor(W * 0.67 - B * 0.5);
  drawTimberBeam(col1X, 0, B, H, true);
  drawTimberBeam(col2X, 0, B, H, true);

  // Diagonal Braces (Enxaimel K-braces & saltires)
  // Top left panel diagonal
  drawDiagonalBrace(B, midY, col1X, B, 75);
  // Top right panel diagonal
  drawDiagonalBrace(W - B, midY, col2X, B, 75);
  // Bottom center panel chevron braces (V-shape)
  drawDiagonalBrace(col1X + B * 0.5, H - B, (col1X + col2X + B) * 0.5, midY + B * 0.5, 75);
  drawDiagonalBrace(col2X + B * 0.5, H - B, (col1X + col2X + B) * 0.5, midY + B * 0.5, 75);

  // Wooden Peg Joints at beam intersections
  const pegCoords = [
    [B * 0.5, B * 0.5], [W - B * 0.5, B * 0.5],
    [B * 0.5, H - B * 0.5], [W - B * 0.5, H - B * 0.5],
    [B * 0.5, midY + B * 0.5], [W - B * 0.5, midY + B * 0.5],
    [col1X + B * 0.5, B * 0.5], [col2X + B * 0.5, B * 0.5],
    [col1X + B * 0.5, midY + B * 0.5], [col2X + B * 0.5, midY + B * 0.5],
    [col1X + B * 0.5, H - B * 0.5], [col2X + B * 0.5, H - B * 0.5]
  ];

  pegCoords.forEach(([px, py]) => {
    drawWoodenPeg(alb, px - 18, py, 14);
    drawWoodenPeg(alb, px + 18, py, 14);

    // Bump for pegs
    bmp.fillStyle = '#e0e0e0';
    bmp.beginPath();
    bmp.arc(px - 18, py, 14, 0, Math.PI * 2);
    bmp.arc(px + 18, py, 14, 0, Math.PI * 2);
    bmp.fill();
  });

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('timberPlaster', set);
  return set;
}

/* ==========================================================================
   2. RIVER ROCK FOUNDATION TEXTURES
   ========================================================================== */
export function getCottageFoundationTextures() {
  if (textureCache.has('foundation')) return textureCache.get('foundation');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Dark charcoal/slate mortar background
  const mortarGrad = alb.createLinearGradient(0, 0, 0, H);
  mortarGrad.addColorStop(0.0, '#30343a');
  mortarGrad.addColorStop(0.5, '#25282d');
  mortarGrad.addColorStop(1.0, '#1c1e22');
  alb.fillStyle = mortarGrad;
  alb.fillRect(0, 0, W, H);

  // Roughness: Mortar is very rough ~0.92
  rgh.fillStyle = '#ebebeb';
  rgh.fillRect(0, 0, W, H);

  // Metalness: 0
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump: Mortar joints are recessed ~0.24
  bmp.fillStyle = '#3d3d3d';
  bmp.fillRect(0, 0, W, H);

  // River rock palette (slate blue, granite gray, river sandstone ochre, limestone)
  const rockColors = [
    { base: '#707b89', light: '#99a6b8', dark: '#48505c' },
    { base: '#828991', light: '#adb5bf', dark: '#525860' },
    { base: '#94806a', light: '#bfab95', dark: '#5e4e3d' },
    { base: '#636c75', light: '#8b96a3', dark: '#3f454d' },
    { base: '#9fa8b3', light: '#cad4e0', dark: '#68727d' },
    { base: '#a89885', light: '#d1c2af', dark: '#6e6050' },
    { base: '#5c646e', light: '#828d9c', dark: '#3a4049' }
  ];

  // Draw 8 courses of irregular river cobblestones
  const numRows = 8;
  const rowHeight = H / numRows;

  for (let row = 0; row < numRows; row++) {
    const yCenter = row * rowHeight + rowHeight * 0.5;
    const isOdd = row % 2 === 1;
    const rowOffset = isOdd ? 80 : 0;
    let curX = -60 + rowOffset;

    while (curX < W + 80) {
      const rockW = 140 + ((curX * 13 + row * 37) % 90);
      const rockH = rowHeight * 0.76 + ((curX * 7 + row * 19) % 25);
      const colIdx = Math.abs((Math.floor(curX / 100) + row * 3) % rockColors.length);
      const col = rockColors[colIdx];

      // Draw 3D rounded cobblestone
      const cx = curX + rockW * 0.5;
      const cy = yCenter + ((curX * 3) % 18) - 9;
      const rx = rockW * 0.46;
      const ry = rockH * 0.46;

      // Drop shadow around stone
      alb.fillStyle = 'rgba(10, 12, 15, 0.65)';
      alb.beginPath();
      alb.ellipse(cx + 4, cy + 6, rx + 4, ry + 4, 0, 0, Math.PI * 2);
      alb.fill();

      // Stone body gradient (top-left highlight to bottom-right ambient shadow)
      const stoneGrad = alb.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, rx * 0.1, cx, cy, rx);
      stoneGrad.addColorStop(0.0, col.light);
      stoneGrad.addColorStop(0.45, col.base);
      stoneGrad.addColorStop(0.85, col.dark);
      stoneGrad.addColorStop(1.0, '#1c1f24');
      alb.fillStyle = stoneGrad;
      alb.beginPath();
      alb.ellipse(cx, cy, rx, ry, 0.04, 0, Math.PI * 2);
      alb.fill();

      // Top edge crescent highlight
      alb.strokeStyle = col.light;
      alb.lineWidth = 4.5;
      alb.beginPath();
      alb.arc(cx, cy, rx - 3, Math.PI * 0.95, Math.PI * 1.85);
      alb.stroke();

      // Cobblestone micro fissures / cracks
      if ((curX + row) % 5 === 0) {
        alb.strokeStyle = 'rgba(25, 28, 33, 0.5)';
        alb.lineWidth = 2.5;
        alb.beginPath();
        alb.moveTo(cx - rx * 0.4, cy - ry * 0.2);
        alb.lineTo(cx + rx * 0.2, cy + ry * 0.3);
        alb.stroke();
      }

      // Roughness for stone (smooth river rock ~0.72)
      rgh.fillStyle = '#b8b8b8';
      rgh.beginPath();
      rgh.ellipse(cx, cy, rx, ry, 0.04, 0, Math.PI * 2);
      rgh.fill();

      // Bump map for stone (raised ~0.85)
      bmp.fillStyle = '#d6d6d6';
      bmp.beginPath();
      bmp.ellipse(cx, cy, rx, ry, 0.04, 0, Math.PI * 2);
      bmp.fill();
      bmp.strokeStyle = '#f0f0f0';
      bmp.lineWidth = 4;
      bmp.beginPath();
      bmp.arc(cx, cy, rx - 3, Math.PI * 0.95, Math.PI * 1.85);
      bmp.stroke();

      curX += rockW + 28;
    }
  }

  // --- Moss & Lichen in lower crevices and mortar joints ---
  const drawMossCluster = (cx, cy, radius) => {
    const mossGrad = alb.createRadialGradient(cx, cy, 2, cx, cy, radius);
    mossGrad.addColorStop(0.0, '#5ea33c');
    mossGrad.addColorStop(0.4, '#447d2b');
    mossGrad.addColorStop(0.8, '#2d541b');
    mossGrad.addColorStop(1.0, 'rgba(30, 55, 18, 0)');
    alb.fillStyle = mossGrad;
    alb.beginPath();
    alb.arc(cx, cy, radius, 0, Math.PI * 2);
    alb.fill();

    // Moss spore stipples
    alb.fillStyle = '#78c24d';
    for (let i = 0; i < 6; i++) {
      const sx = cx + (Math.sin(i * 1.7) * radius * 0.6);
      const sy = cy + (Math.cos(i * 1.7) * radius * 0.6);
      alb.beginPath();
      alb.arc(sx, sy, 3, 0, Math.PI * 2);
      alb.fill();
    }

    // Moss is very matte ~0.94
    rgh.fillStyle = '#f0f0f0';
    rgh.beginPath();
    rgh.arc(cx, cy, radius, 0, Math.PI * 2);
    rgh.fill();
  };

  // Creeping moss along the bottom 35% of foundation
  for (let x = 40; x < W; x += 110) {
    const my = H - 60 - ((x * 11) % 450);
    drawMossCluster(x, my, 42 + ((x * 7) % 35));
    if (x % 220 === 0) {
      drawMossCluster(x + 50, my + 35, 30);
    }
  }

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('foundation', set);
  return set;
}

/* ==========================================================================
   3. SCALLOPED BLUE ROOF TEXTURES
   ========================================================================== */
export function getCottageRoofTextures() {
  if (textureCache.has('roof')) return textureCache.get('roof');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Background deep midnight blue base
  const bgGrad = alb.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0.0, '#152d54');
  bgGrad.addColorStop(0.5, '#1a3766');
  bgGrad.addColorStop(1.0, '#0f2240');
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Roughness: Smooth ceramic glaze / slate tile ~0.56
  rgh.fillStyle = '#8f8f8f';
  rgh.fillRect(0, 0, W, H);

  // Metalness: 0.10 for subtle slate sheen
  met.fillStyle = '#1a1a1a';
  met.fillRect(0, 0, W, H);

  // Bump: Neutral
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // Saturated Warcraft 2 style blue tile palette
  const tileShades = [
    { base: '#2b62ad', light: '#6ba8fa', dark: '#143463' },
    { base: '#3571c4', light: '#80b8ff', dark: '#1a3e75' },
    { base: '#225294', light: '#5b98ea', dark: '#10284d' },
    { base: '#3c7cd4', light: '#93c4ff', dark: '#1c4582' },
    { base: '#25599e', light: '#64a0f2', dark: '#122e57' }
  ];

  // Scallop tile geometry: 16 overlapping curved tiers
  const numTiers = 16;
  const tierH = (H - 180) / numTiers;
  const tileW = 160;

  for (let tier = 0; tier < numTiers; tier++) {
    const yTop = 160 + tier * tierH;
    const isOdd = tier % 2 === 1;
    const xOffset = isOdd ? tileW * 0.5 : 0;

    for (let x = -tileW * 0.5 + xOffset; x < W + tileW; x += tileW) {
      const shadeIdx = Math.abs((Math.floor(x / tileW) + tier * 5) % tileShades.length);
      const shade = tileShades[shadeIdx];

      // Scalloped bottom arc
      const cx = x + tileW * 0.5;
      const cy = yTop + tierH * 0.75;
      const r = tileW * 0.52;

      // Drop shadow cast onto the row below
      alb.fillStyle = 'rgba(5, 12, 28, 0.72)';
      alb.beginPath();
      alb.arc(cx, cy + 12, r + 4, 0, Math.PI);
      alb.fill();

      // Scallop tile body gradient
      const tileGrad = alb.createLinearGradient(cx, yTop, cx, cy + r);
      tileGrad.addColorStop(0.0, shade.dark);
      tileGrad.addColorStop(0.4, shade.base);
      tileGrad.addColorStop(0.85, shade.light);
      tileGrad.addColorStop(1.0, shade.base);
      alb.fillStyle = tileGrad;

      alb.beginPath();
      alb.moveTo(x, yTop);
      alb.lineTo(x + tileW, yTop);
      alb.lineTo(x + tileW, cy);
      alb.arc(cx, cy, r, 0, Math.PI, false);
      alb.lineTo(x, yTop);
      alb.closePath();
      alb.fill();

      // Hand-painted curved bottom edge highlight
      alb.strokeStyle = shade.light;
      alb.lineWidth = 5;
      alb.beginPath();
      alb.arc(cx, cy, r - 2, 0.1, Math.PI - 0.1, false);
      alb.stroke();

      // Specular crest pip
      alb.strokeStyle = '#dbeafe';
      alb.lineWidth = 2.5;
      alb.beginPath();
      alb.arc(cx, cy, r - 3, Math.PI * 0.35, Math.PI * 0.65, false);
      alb.stroke();

      // Central tile ridge seam
      alb.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      alb.lineWidth = 2;
      alb.beginPath();
      alb.moveTo(cx, yTop + 10);
      alb.lineTo(cx, cy + r - 8);
      alb.stroke();

      // Bump for scallop tile: raised bottom lip, recessed shadow
      bmp.fillStyle = '#b8b8b8';
      bmp.beginPath();
      bmp.arc(cx, cy, r, 0, Math.PI, false);
      bmp.fill();

      bmp.strokeStyle = '#f5f5f5';
      bmp.lineWidth = 5;
      bmp.beginPath();
      bmp.arc(cx, cy, r - 2, 0.1, Math.PI - 0.1, false);
      bmp.stroke();
    }
  }

  // --- Top Decorative Ridge Crest & Carved Fascia ---
  const ridgeGrad = alb.createLinearGradient(0, 0, 0, 160);
  ridgeGrad.addColorStop(0.0, '#3d2414');
  ridgeGrad.addColorStop(0.3, '#5c381f');
  ridgeGrad.addColorStop(0.7, '#482a16');
  ridgeGrad.addColorStop(1.0, '#24140a');
  alb.fillStyle = ridgeGrad;
  alb.fillRect(0, 0, W, 160);

  // Carved wooden ridge cresting pattern
  alb.fillStyle = '#caa368';
  for (let x = 30; x < W; x += 100) {
    alb.beginPath();
    alb.moveTo(x, 150);
    alb.lineTo(x + 50, 40);
    alb.lineTo(x + 100, 150);
    alb.closePath();
    alb.fill();

    drawRivet(alb, x + 50, 95, 10, true);
  }

  // --- Roof Moss Clusters in eaves and valleys ---
  const drawRoofMoss = (mx, my, radius) => {
    const mossGrad = alb.createRadialGradient(mx, my, 2, mx, my, radius);
    mossGrad.addColorStop(0.0, '#66a836');
    mossGrad.addColorStop(0.4, '#488022');
    mossGrad.addColorStop(0.8, '#2f5715');
    mossGrad.addColorStop(1.0, 'rgba(35, 65, 16, 0)');
    alb.fillStyle = mossGrad;
    alb.beginPath();
    alb.arc(mx, my, radius, 0, Math.PI * 2);
    alb.fill();

    alb.fillStyle = '#a3e635';
    for (let i = 0; i < 5; i++) {
      const sx = mx + Math.sin(i * 1.9) * radius * 0.55;
      const sy = my + Math.cos(i * 1.9) * radius * 0.55;
      alb.beginPath();
      alb.arc(sx, sy, 3, 0, Math.PI * 2);
      alb.fill();
    }

    rgh.fillStyle = '#ebebeb';
    rgh.beginPath();
    rgh.arc(mx, my, radius, 0, Math.PI * 2);
    rgh.fill();
  };

  // Weathered moss patches in corners and valleys
  const mossSpots = [
    [180, H - 240, 55], [260, H - 210, 45],
    [W - 220, H - 300, 60], [W - 320, H - 260, 40],
    [W * 0.45, H * 0.62, 50], [W * 0.52, H * 0.65, 38],
    [540, 420, 45], [W - 580, 480, 50]
  ];
  mossSpots.forEach(([mx, my, r]) => drawRoofMoss(mx, my, r));

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('roof', set);
  return set;
}

/* ==========================================================================
   4. OAK PLANK DOOR TEXTURES
   ========================================================================== */
export function getCottageDoorTextures() {
  if (textureCache.has('door')) return textureCache.get('door');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Outer carved timber doorframe
  const frameGrad = alb.createLinearGradient(0, 0, W, 0);
  frameGrad.addColorStop(0.0, '#361e0e');
  frameGrad.addColorStop(0.08, '#54321b');
  frameGrad.addColorStop(0.92, '#54321b');
  frameGrad.addColorStop(1.0, '#361e0e');
  alb.fillStyle = frameGrad;
  alb.fillRect(0, 0, W, H);

  // Door recess shadow
  alb.fillStyle = 'rgba(12, 6, 2, 0.7)';
  alb.fillRect(100, 100, W - 200, H - 100);

  // Vertical Hand-Hewn Oak Planks (6 heavy vertical planks)
  const numPlanks = 6;
  const doorX = 120;
  const doorY = 120;
  const doorW = W - 240;
  const doorH = H - 120;
  const plankW = doorW / numPlanks;

  const plankShades = ['#5a341b', '#6b3e20', '#522f18', '#633a1e', '#5e371c', '#4d2a15'];

  for (let i = 0; i < numPlanks; i++) {
    const px = doorX + i * plankW;

    // Plank base gradient
    const pGrad = alb.createLinearGradient(px, doorY, px + plankW, doorY);
    pGrad.addColorStop(0.0, '#3d2210');
    pGrad.addColorStop(0.2, plankShades[i]);
    pGrad.addColorStop(0.7, plankShades[(i + 1) % plankShades.length]);
    pGrad.addColorStop(1.0, '#2d160a');
    alb.fillStyle = pGrad;
    alb.fillRect(px + 4, doorY, plankW - 8, doorH);

    // Wood grain fibers
    alb.fillStyle = 'rgba(240, 190, 140, 0.12)';
    for (let x = px + 12; x < px + plankW - 12; x += 16) {
      alb.fillRect(x, doorY, 3, doorH);
    }
    alb.fillStyle = 'rgba(20, 10, 5, 0.2)';
    for (let x = px + 20; x < px + plankW - 12; x += 22) {
      alb.fillRect(x, doorY, 4, doorH);
    }

    // Hand-hewn bevel highlight on plank edge
    alb.strokeStyle = '#965f37';
    alb.lineWidth = 3.5;
    alb.beginPath();
    alb.moveTo(px + 6, doorY);
    alb.lineTo(px + 6, doorY + doorH);
    alb.stroke();

    // Dark seam between planks
    alb.strokeStyle = '#140903';
    alb.lineWidth = 6;
    alb.beginPath();
    alb.moveTo(px, doorY);
    alb.lineTo(px, doorY + doorH);
    alb.stroke();
  }

  // Roughness: Wood planks ~0.72
  rgh.fillStyle = '#b8b8b8';
  rgh.fillRect(0, 0, W, H);

  // Metalness: Base is 0
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump: Plank seams recessed
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  for (let i = 0; i <= numPlanks; i++) {
    const px = doorX + i * plankW;
    bmp.fillStyle = '#262626';
    bmp.fillRect(px - 4, doorY, 8, doorH);
  }

  // --- Black Wrought Iron Strap Hinges (Top, Middle, Bottom) ---
  const drawIronStrap = (sy) => {
    const strapH = 85;
    const strapW = doorW * 0.82;

    // Drop shadow under strap
    alb.fillStyle = 'rgba(10, 5, 2, 0.65)';
    alb.fillRect(doorX + 15, sy + 6, strapW + 10, strapH + 10);

    // Iron gradient
    const ironGrad = alb.createLinearGradient(doorX + 20, sy, doorX + 20, sy + strapH);
    ironGrad.addColorStop(0.0, '#595f69');
    ironGrad.addColorStop(0.2, '#353940');
    ironGrad.addColorStop(0.7, '#24262b');
    ironGrad.addColorStop(1.0, '#16181b');
    alb.fillStyle = ironGrad;

    // Strap with decorative fleur-de-lis / arrowhead terminal point
    alb.beginPath();
    alb.moveTo(doorX + 20, sy);
    alb.lineTo(doorX + 20 + strapW - 60, sy);
    alb.lineTo(doorX + 20 + strapW, sy + strapH * 0.5);
    alb.lineTo(doorX + 20 + strapW - 60, sy + strapH);
    alb.lineTo(doorX + 20, sy + strapH);
    alb.closePath();
    alb.fill();

    // Metallic bevel edge highlight
    alb.strokeStyle = '#9ca3af';
    alb.lineWidth = 3;
    alb.stroke();

    // Forged rivets along strap
    for (let rx = doorX + 90; rx < doorX + strapW - 60; rx += 160) {
      drawRivet(alb, rx, sy + strapH * 0.5, 15, false);

      // Metalness for rivet
      met.fillStyle = '#e0e0e0';
      met.beginPath();
      met.arc(rx, sy + strapH * 0.5, 15, 0, Math.PI * 2);
      met.fill();

      // Bump for rivet
      bmp.fillStyle = '#f5f5f5';
      bmp.beginPath();
      bmp.arc(rx, sy + strapH * 0.5, 15, 0, Math.PI * 2);
      bmp.fill();
    }

    // Roughness for iron ~0.38
    rgh.fillStyle = '#616161';
    rgh.fillRect(doorX + 20, sy, strapW, strapH);

    // Metalness for iron ~0.85
    met.fillStyle = '#d9d9d9';
    met.fillRect(doorX + 20, sy, strapW, strapH);

    // Bump for iron
    bmp.fillStyle = '#c4c4c4';
    bmp.fillRect(doorX + 20, sy, strapW, strapH);
  };

  drawIronStrap(doorY + 220);
  drawIronStrap(doorY + doorH * 0.5 - 42);
  drawIronStrap(doorY + doorH - 300);

  // --- Wrought Iron Ring Latch & Escutcheon ---
  const handleX = doorX + doorW * 0.76;
  const handleY = doorY + doorH * 0.56;

  // Escutcheon plate
  alb.fillStyle = '#22252a';
  alb.beginPath();
  alb.ellipse(handleX, handleY, 48, 68, 0, 0, Math.PI * 2);
  alb.fill();
  alb.strokeStyle = '#828a96';
  alb.lineWidth = 3.5;
  alb.stroke();

  // Hanging Iron Ring
  alb.strokeStyle = 'rgba(8, 4, 2, 0.65)';
  alb.lineWidth = 26;
  alb.beginPath();
  alb.arc(handleX + 3, handleY + 54, 52, 0, Math.PI * 2);
  alb.stroke();

  const ringGrad = alb.createLinearGradient(handleX - 52, handleY + 50, handleX + 52, handleY + 50);
  ringGrad.addColorStop(0.0, '#666e7a');
  ringGrad.addColorStop(0.5, '#2b2e34');
  ringGrad.addColorStop(1.0, '#545b66');
  alb.strokeStyle = ringGrad;
  alb.lineWidth = 22;
  alb.beginPath();
  alb.arc(handleX, handleY + 50, 52, 0, Math.PI * 2);
  alb.stroke();

  // Specular ring highlight
  alb.strokeStyle = '#cbd5e1';
  alb.lineWidth = 4;
  alb.beginPath();
  alb.arc(handleX, handleY + 50, 58, Math.PI * 1.1, Math.PI * 1.55);
  alb.stroke();

  // Metalness and roughness for latch
  met.fillStyle = '#d9d9d9';
  met.beginPath();
  met.arc(handleX, handleY + 50, 68, 0, Math.PI * 2);
  met.fill();

  rgh.fillStyle = '#555555';
  rgh.beginPath();
  rgh.arc(handleX, handleY + 50, 68, 0, Math.PI * 2);
  rgh.fill();

  // Bump for latch
  bmp.fillStyle = '#e8e8e8';
  bmp.beginPath();
  bmp.arc(handleX, handleY + 50, 68, 0, Math.PI * 2);
  bmp.fill();

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('door', set);
  return set;
}

/* ==========================================================================
   5. LEADED DIAMOND-LATTICE WINDOW TEXTURES (WITH EMISSIVE HEARTH GLOW)
   ========================================================================== */
export function getCottageWindowTextures() {
  if (textureCache.has('window')) return textureCache.get('window');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);
  const { canvas: emiC, ctx: emi } = createCanvas(2048, 2048);

  // Outer carved wooden frame
  const frameGrad = alb.createLinearGradient(0, 0, W, H);
  frameGrad.addColorStop(0.0, '#3d2414');
  frameGrad.addColorStop(0.3, '#5c3920');
  frameGrad.addColorStop(0.7, '#442816');
  frameGrad.addColorStop(1.0, '#261408');
  alb.fillStyle = frameGrad;
  alb.fillRect(0, 0, W, H);

  // Frame bevel highlights
  alb.strokeStyle = '#8f5c35';
  alb.lineWidth = 8;
  alb.strokeRect(16, 16, W - 32, H - 32);

  // Roughness: Frame ~0.76
  rgh.fillStyle = '#c2c2c2';
  rgh.fillRect(0, 0, W, H);

  // Metalness: 0
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump: Frame raised
  bmp.fillStyle = '#a6a6a6';
  bmp.fillRect(0, 0, W, H);

  // Emissive default: Black
  emi.fillStyle = '#000000';
  emi.fillRect(0, 0, W, H);

  // Glass Window Pane Inset
  const inset = 160;
  const gW = W - inset * 2;
  const gH = H - inset * 2;

  // Warm glowing interior candlelight / hearth gradient inside window
  const glowGrad = alb.createRadialGradient(W * 0.5, H * 0.5, 80, W * 0.5, H * 0.5, gW * 0.7);
  glowGrad.addColorStop(0.0, '#fff4cc');
  glowGrad.addColorStop(0.25, '#ffd269');
  glowGrad.addColorStop(0.60, '#ff9e2b');
  glowGrad.addColorStop(0.85, '#d96414');
  glowGrad.addColorStop(1.0, '#782d08');
  alb.fillStyle = glowGrad;
  alb.fillRect(inset, inset, gW, gH);

  // Emissive map (Warm golden amber radiation)
  const emiGrad = emi.createRadialGradient(W * 0.5, H * 0.5, 60, W * 0.5, H * 0.5, gW * 0.75);
  emiGrad.addColorStop(0.0, '#ffea9f');
  emiGrad.addColorStop(0.3, '#ffaa33');
  emiGrad.addColorStop(0.7, '#d95a00');
  emiGrad.addColorStop(1.0, '#4d1a00');
  emi.fillStyle = emiGrad;
  emi.fillRect(inset, inset, gW, gH);

  // Glass Roughness: Very smooth/reflective ~0.18
  rgh.fillStyle = '#2e2e2e';
  rgh.fillRect(inset, inset, gW, gH);

  // Glass Bump: Smooth
  bmp.fillStyle = '#737373';
  bmp.fillRect(inset, inset, gW, gH);

  // --- Medieval Leaded Diamond-Lattice Matrix (Cames) ---
  const diamondW = 120;
  const diamondH = 170;

  alb.save();
  emi.save();
  rgh.save();
  bmp.save();
  met.save();

  // Dark lead came diagonal lattice lines
  const drawCameLine = (x1, y1, x2, y2) => {
    // Albedo lead came
    alb.strokeStyle = '#22252a';
    alb.lineWidth = 12;
    alb.beginPath();
    alb.moveTo(x1, y1);
    alb.lineTo(x2, y2);
    alb.stroke();

    // Lead came bevel highlight
    alb.strokeStyle = '#616773';
    alb.lineWidth = 3;
    alb.beginPath();
    alb.moveTo(x1 - 1, y1 - 1);
    alb.lineTo(x2 - 1, y2 - 1);
    alb.stroke();

    // Black on emissive map so came lines block the light
    emi.strokeStyle = '#000000';
    emi.lineWidth = 14;
    emi.beginPath();
    emi.moveTo(x1, y1);
    emi.lineTo(x2, y2);
    emi.stroke();

    // Roughness for lead ~0.45
    rgh.strokeStyle = '#737373';
    rgh.lineWidth = 12;
    rgh.beginPath();
    rgh.moveTo(x1, y1);
    rgh.lineTo(x2, y2);
    rgh.stroke();

    // Metalness for lead ~0.75
    met.strokeStyle = '#bfbfbf';
    met.lineWidth = 12;
    met.beginPath();
    met.moveTo(x1, y1);
    met.lineTo(x2, y2);
    met.stroke();

    // Bump: Lead came raised above glass
    bmp.strokeStyle = '#a6a6a6';
    bmp.lineWidth = 12;
    bmp.beginPath();
    bmp.moveTo(x1, y1);
    bmp.lineTo(x2, y2);
    bmp.stroke();
  };

  // Diagonal mesh criss-crossing inside glass area
  for (let offset = -H; offset < W + H; offset += diamondW) {
    // Down-right diagonal
    drawCameLine(offset, inset, offset + gH * (diamondW / diamondH), inset + gH);
    // Down-left diagonal
    drawCameLine(offset, inset, offset - gH * (diamondW / diamondH), inset + gH);
  }

  // Window frame inner border
  alb.strokeStyle = '#181a1e';
  alb.lineWidth = 16;
  alb.strokeRect(inset, inset, gW, gH);

  emi.strokeStyle = '#000000';
  emi.lineWidth = 18;
  emi.strokeRect(inset, inset, gW, gH);

  alb.restore();
  emi.restore();
  rgh.restore();
  bmp.restore();
  met.restore();

  // Glass specular reflection slash
  alb.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  alb.lineWidth = 18;
  alb.beginPath();
  alb.moveTo(inset + gW * 0.25, inset + gH * 0.1);
  alb.lineTo(inset + gW * 0.1, inset + gH * 0.45);
  alb.moveTo(inset + gW * 0.55, inset + gH * 0.1);
  alb.lineTo(inset + gW * 0.2, inset + gH * 0.75);
  alb.stroke();

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false),
    emissiveMap: toTexture(emiC, true)
  };
  textureCache.set('window', set);
  return set;
}

/* ==========================================================================
   6. COBBLESTONE & BRICK CHIMNEY TEXTURES
   ========================================================================== */
export function getCottageChimneyTextures() {
  if (textureCache.has('chimney')) return textureCache.get('chimney');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Weathered lime mortar base
  const mortarGrad = alb.createLinearGradient(0, 0, 0, H);
  mortarGrad.addColorStop(0.0, '#383431');
  mortarGrad.addColorStop(0.5, '#4a443f');
  mortarGrad.addColorStop(1.0, '#302b28');
  alb.fillStyle = mortarGrad;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#ededed';
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#404040';
  bmp.fillRect(0, 0, W, H);

  // Terracotta and stone brick palette
  const brickShades = [
    { base: '#a84c36', light: '#d46d55', dark: '#6e2b1c' },
    { base: '#b55841', light: '#de7a62', dark: '#7a3423' },
    { base: '#94402d', light: '#bf5d47', dark: '#5e2417' },
    { base: '#85786f', light: '#aca096', dark: '#524840' }, // gray fieldstone brick
    { base: '#ba644c', light: '#e5856b', dark: '#803c2a' }
  ];

  const numRows = 24;
  const rowH = H / numRows;
  const brickW = 200;

  for (let r = 0; r < numRows; r++) {
    const y = r * rowH;
    const isOdd = r % 2 === 1;
    const xOffset = isOdd ? brickW * 0.5 : 0;

    for (let x = -brickW + xOffset; x < W + brickW; x += brickW + 16) {
      const shadeIdx = Math.abs((Math.floor(x / 180) + r * 4) % brickShades.length);
      const shade = brickShades[shadeIdx];

      const bw = brickW;
      const bh = rowH - 12;

      // Drop shadow
      alb.fillStyle = 'rgba(15, 12, 10, 0.6)';
      alb.fillRect(x + 4, y + 4, bw, bh);

      // Brick body gradient
      const bGrad = alb.createLinearGradient(x, y, x + bw, y + bh);
      bGrad.addColorStop(0.0, shade.light);
      bGrad.addColorStop(0.3, shade.base);
      bGrad.addColorStop(0.85, shade.dark);
      bGrad.addColorStop(1.0, '#2e140d');
      alb.fillStyle = bGrad;
      alb.fillRect(x, y, bw, bh);

      // Edge highlight
      alb.strokeStyle = shade.light;
      alb.lineWidth = 3;
      alb.strokeRect(x + 1, y + 1, bw - 2, bh - 2);

      // Roughness & Bump for bricks
      rgh.fillStyle = '#c7c7c7';
      rgh.fillRect(x, y, bw, bh);

      bmp.fillStyle = '#bfbfbf';
      bmp.fillRect(x, y, bw, bh);
    }
  }

  // Top Chimney Pot Soot Smudge (Top 18% darkened with black carbon soot)
  const sootGrad = alb.createLinearGradient(0, 0, 0, H * 0.22);
  sootGrad.addColorStop(0.0, 'rgba(15, 12, 10, 0.92)');
  sootGrad.addColorStop(0.6, 'rgba(25, 20, 18, 0.65)');
  sootGrad.addColorStop(1.0, 'rgba(40, 32, 28, 0)');
  alb.fillStyle = sootGrad;
  alb.fillRect(0, 0, W, H * 0.22);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('chimney', set);
  return set;
}

/* ==========================================================================
   7. HEWN OAK WOOD & FIREWOOD LOGS TEXTURES
   ========================================================================== */
export function getCottageWoodTextures() {
  if (textureCache.has('wood')) return textureCache.get('wood');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Left half: Hewn oak planks with wood grain (0 to W * 0.5)
  const woodGrad = alb.createLinearGradient(0, 0, 0, H);
  woodGrad.addColorStop(0.0, '#663c1e');
  woodGrad.addColorStop(0.3, '#7d4c28');
  woodGrad.addColorStop(0.7, '#593418');
  woodGrad.addColorStop(1.0, '#3d210d');
  alb.fillStyle = woodGrad;
  alb.fillRect(0, 0, W * 0.5, H);

  // Wood grain fibers
  alb.fillStyle = 'rgba(240, 195, 145, 0.12)';
  for (let x = 12; x < W * 0.5; x += 18) {
    alb.fillRect(x, 0, 4, H);
  }
  alb.fillStyle = 'rgba(25, 12, 5, 0.18)';
  for (let x = 24; x < W * 0.5; x += 26) {
    alb.fillRect(x, 0, 4, H);
  }

  // Right half: Firewood log cut ends with radial growth rings
  const bgBark = alb.createLinearGradient(W * 0.5, 0, W, H);
  bgBark.addColorStop(0.0, '#362112');
  bgBark.addColorStop(1.0, '#211309');
  alb.fillStyle = bgBark;
  alb.fillRect(W * 0.5, 0, W * 0.5, H);

  // Draw circular log cut ends
  const drawLogEnd = (cx, cy, radius) => {
    // Outer rough bark ring
    alb.fillStyle = '#261509';
    alb.beginPath();
    alb.arc(cx, cy, radius, 0, Math.PI * 2);
    alb.fill();

    // Sapwood / Heartwood inner disc
    const heartGrad = alb.createRadialGradient(cx, cy, 5, cx, cy, radius - 16);
    heartGrad.addColorStop(0.0, '#8f5c35');
    heartGrad.addColorStop(0.4, '#c2905d');
    heartGrad.addColorStop(0.8, '#d9aa75');
    heartGrad.addColorStop(1.0, '#9c663b');
    alb.fillStyle = heartGrad;
    alb.beginPath();
    alb.arc(cx, cy, radius - 16, 0, Math.PI * 2);
    alb.fill();

    // Concentric growth rings
    alb.strokeStyle = 'rgba(75, 42, 18, 0.45)';
    alb.lineWidth = 3;
    for (let r = 24; r < radius - 20; r += 20) {
      alb.beginPath();
      alb.arc(cx, cy, r, 0, Math.PI * 2);
      alb.stroke();
    }

    // Radial drying checks / cracks
    alb.strokeStyle = '#261509';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(cx, cy);
    alb.lineTo(cx + radius * 0.8, cy + radius * 0.2);
    alb.moveTo(cx, cy);
    alb.lineTo(cx - radius * 0.6, cy + radius * 0.7);
    alb.stroke();

    // Central pith dot
    alb.fillStyle = '#42240f';
    alb.beginPath();
    alb.arc(cx, cy, 7, 0, Math.PI * 2);
    alb.fill();
  };

  drawLogEnd(W * 0.75, H * 0.25, 340);
  drawLogEnd(W * 0.75, H * 0.75, 340);

  // Roughness: Wood ~0.72
  rgh.fillStyle = '#b8b8b8';
  rgh.fillRect(0, 0, W, H);

  // Metalness: 0
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump: Grain & bark
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('wood', set);
  return set;
}
