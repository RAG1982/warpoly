import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Watchtower (Torre de Vigia)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates 2048x2048 crisp textures tailored to each component:
 * 1. Tower Stone:
 *    - Ashlar stone masonry with horizontal courses and staggered mortar joints
 *    - Hand-painted chisel bevels, micro-pitting, and stone fracture details
 *    - Vertical rain weathering / grime stains trailing down from stone courses
 *    - Lush stylized fantasy moss and lichen at the base with vibrant spores
 *    - Built-in chamfered arrow slits with deep interior shadow and iron crossbars
 * 2. Timber Bracing & Crow's Nest:
 *    - Dark heavy aged oak timbers and weathered deck planks
 *    - Organic wood grain striations, knots, and honey-amber bevel highlights
 *    - Heavy forged iron gusset plates, angled corner straps, and square bolt heads
 * 3. Conical Royal Blue Shingles:
 *    - Overlapping scalloped / fish-scale royal sapphire and cobalt roof shingles
 *    - Electric cerulean edge highlights and deep indigo shadow recesses
 *    - Ornate hand-painted golden frieze rim with medieval crown filigree and gold rivets
 * 4. Brazier & Glowing Embers:
 *    - Forged charcoal iron brazier cage with thermal heat patina
 *    - Fiery glowing embers with incandescent cracks, molten gold core, and emissive map
 * 5. Fluttering Royal Heraldic Pennant Ribbon:
 *    - Royal blue silk streamer with painted fabric wave folds
 *    - Golden Rampant Lion royal coat of arms with embroidered borders and fringed swallowtail
 * 6. Archer Parapet Shields:
 *    - Royal heraldic heater shields with cobalt field, gold chevron crest, and riveted iron rim
 */

const textureCache = new Map();
const materialCache = new Map();

function toTexture(canvas, isSRGB = true, wrapS = THREE.RepeatWrapping, wrapT = THREE.RepeatWrapping) {
  return makeTexture(canvas, isSRGB, { wrapS, wrapT });
}

/**
 * Draw stylized rivet / bolt with drop shadow and specular dome
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
 * Draw stylized square bolt head with drop shadow
 */
function drawSquareBolt(ctx, cx, cy, size = 18, isGold = false) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(cx - size / 2 + 3, cy - size / 2 + 3, size, size);

  const grad = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
  if (isGold) {
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.4, '#f59e0b');
    grad.addColorStop(1, '#78350f');
  } else {
    grad.addColorStop(0, '#e2e8f0');
    grad.addColorStop(0.4, '#64748b');
    grad.addColorStop(1, '#1e293b');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);

  // Inner highlight facet
  ctx.fillStyle = isGold ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(cx - size / 2 + 2, cy - size / 2 + 2, size - 4, 3);
  ctx.fillRect(cx - size / 2 + 2, cy - size / 2 + 2, 3, size - 4);
  ctx.restore();
}

/**
 * Draw stylized running stitch along a line
 */
function drawStitches(ctx, x1, y1, x2, y2, stitchLen = 14, gap = 8, color = '#facc15') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([stitchLen, gap]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 + 1, y1 + 1.5);
  ctx.lineTo(x2 + 1, y2 + 1.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw stylized royal rampant lion coat of arms
 */
function drawRampantLion(ctx, cx, cy, scaleX = 1.0, scaleY = scaleX, fillStyle = '#fbbf24') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);

  function renderLion(c) {
    // 1. Crown
    c.beginPath();
    c.moveTo(-25, -70);
    c.lineTo(-20, -90);
    c.lineTo(-10, -78);
    c.lineTo(0, -98);
    c.lineTo(10, -78);
    c.lineTo(20, -90);
    c.lineTo(25, -70);
    c.closePath();
    c.fill();

    // 2. Head, Snout, Open Roaring Jaw & Mane, Torso
    c.beginPath();
    c.moveTo(15, -65);
    c.bezierCurveTo(35, -60, 45, -50, 42, -35);
    c.bezierCurveTo(46, -30, 58, -28, 54, -18); // Snout
    c.lineTo(36, -16);
    c.lineTo(42, -5); // Open lower jaw
    c.lineTo(28, -3);
    c.bezierCurveTo(32, 8, 24, 15, 14, 18); // Throat
    c.bezierCurveTo(26, 32, 30, 50, 24, 70);
    c.lineTo(10, 85);
    c.bezierCurveTo(2, 78, -12, 78, -20, 90); // Flank
    c.bezierCurveTo(-18, 60, -24, 38, -20, 18); // Back
    c.bezierCurveTo(-34, 8, -45, -10, -38, -32); // Mane back
    c.bezierCurveTo(-45, -50, -34, -68, -15, -72);
    c.closePath();
    c.fill();

    // 3. Forepaws with sharp claws
    c.beginPath();
    c.moveTo(24, -12);
    c.lineTo(58, -22);
    c.lineTo(65, -17);
    c.lineTo(54, -7);
    c.lineTo(28, -3);
    c.fill();

    c.beginPath();
    c.moveTo(20, 8);
    c.lineTo(68, 8);
    c.lineTo(74, 16);
    c.lineTo(60, 22);
    c.lineTo(24, 17);
    c.fill();

    // 4. Hind legs
    c.beginPath();
    c.moveTo(15, 70);
    c.lineTo(45, 96);
    c.lineTo(38, 106);
    c.lineTo(8, 86);
    c.fill();

    c.beginPath();
    c.moveTo(-14, 70);
    c.lineTo(-32, 98);
    c.lineTo(-42, 94);
    c.lineTo(-20, 80);
    c.fill();

    // 5. Arched S-Curving Tufted Tail
    c.beginPath();
    c.moveTo(-16, 75);
    c.bezierCurveTo(-40, 55, -50, 20, -35, -5);
    c.bezierCurveTo(-25, -25, -45, -45, -60, -30);
    c.bezierCurveTo(-70, -15, -60, 5, -42, 35);
    c.bezierCurveTo(-35, 48, -28, 62, -18, 82);
    c.closePath();
    c.fill();

    // Tail tuft
    c.beginPath();
    c.moveTo(-60, -30);
    c.bezierCurveTo(-75, -45, -85, -25, -65, -15);
    c.closePath();
    c.fill();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.save();
  ctx.translate(4, 4);
  renderLion(ctx);
  ctx.restore();

  // Lion body
  ctx.fillStyle = fillStyle;
  renderLion(ctx);

  // Inner highlight streaks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, -50);
  ctx.lineTo(15, -40);
  ctx.moveTo(0, 5);
  ctx.lineTo(15, 35);
  ctx.stroke();

  ctx.restore();
}

/* ==========================================================================
   1. TOWER STONE TEXTURES
   Ashlar stone blocks with vertical weathering, base moss, and arrow slits
   ========================================================================== */
export function getWatchtowerStoneTextures() {
  if (textureCache.has('stone')) return textureCache.get('stone');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Deep stone background / mortar base
  const bgGrad = alb.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0.0, '#3e444d');
  bgGrad.addColorStop(0.5, '#484e57');
  bgGrad.addColorStop(1.0, '#363c44');
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#f0f0f0'; // Rough mortar ~ 0.94
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000'; // 0.0 non-metallic
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#404040'; // Low mortar bed
  bmp.fillRect(0, 0, W, H);

  // Draw 10 horizontal stone courses
  const numRows = 10;
  const rowHeight = H / numRows;
  const mortarWidth = 14;

  const stonePalette = [
    { base: '#737b85', hi: '#9ba5b1', sh: '#484e56' },
    { base: '#7d858f', hi: '#a3adb8', sh: '#4c525b' },
    { base: '#68707a', hi: '#8e97a3', sh: '#3f444c' },
    { base: '#818992', hi: '#abb4be', sh: '#525861' },
    { base: '#707780', hi: '#959ea7', sh: '#444951' },
    { base: '#79808a', hi: '#a0a9b3', sh: '#4a5059' }
  ];

  // Pseudo-random deterministic generator for consistent texture layout
  let seed = 4289;
  function pseudoRandom() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let r = 0; r < numRows; r++) {
    const yTop = r * rowHeight + mortarWidth / 2;
    const yBottom = (r + 1) * rowHeight - mortarWidth / 2;
    const h = yBottom - yTop;

    // Stagger every other row
    const rowOffset = (r % 2 === 0) ? 0 : 160;
    let curX = -rowOffset;

    while (curX < W) {
      const blockW = 260 + Math.floor(pseudoRandom() * 140);
      const bx = curX;
      const bw = blockW - mortarWidth;

      const palIdx = Math.floor(pseudoRandom() * stonePalette.length);
      const stone = stonePalette[palIdx];

      // Stone block fill with subtle vertical gradient
      const sGrad = alb.createLinearGradient(bx, yTop, bx, yBottom);
      sGrad.addColorStop(0.0, stone.hi);
      sGrad.addColorStop(0.18, stone.base);
      sGrad.addColorStop(0.85, stone.base);
      sGrad.addColorStop(1.0, stone.sh);
      alb.fillStyle = sGrad;
      alb.fillRect(bx, yTop, bw, h);

      // Top/Left bright chiseling highlight bevel
      alb.fillStyle = 'rgba(255, 255, 255, 0.28)';
      alb.fillRect(bx, yTop, bw, 6);
      alb.fillRect(bx, yTop, 6, h);

      // Bottom/Right dark bevel shadow
      alb.fillStyle = 'rgba(0, 0, 0, 0.42)';
      alb.fillRect(bx, yBottom - 6, bw, 6);
      alb.fillRect(bx + bw - 6, yTop, 6, h);

      // Micro-texture: horizontal chiseling tool marks & surface variations
      const numLines = 3 + Math.floor(pseudoRandom() * 4);
      for (let l = 0; l < numLines; l++) {
        const ly = yTop + 15 + Math.floor(pseudoRandom() * (h - 30));
        const lx1 = bx + 15 + Math.floor(pseudoRandom() * 30);
        const lx2 = bx + bw - 15 - Math.floor(pseudoRandom() * 30);
        alb.strokeStyle = (pseudoRandom() > 0.5) ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.12)';
        alb.lineWidth = 2 + Math.floor(pseudoRandom() * 2);
        alb.beginPath();
        alb.moveTo(lx1, ly);
        alb.lineTo(lx2, ly + (pseudoRandom() * 4 - 2));
        alb.stroke();
      }

      // Small stone pitting / chips
      for (let p = 0; p < 4; p++) {
        const px = bx + 20 + Math.floor(pseudoRandom() * (bw - 40));
        const py = yTop + 20 + Math.floor(pseudoRandom() * (h - 40));
        alb.fillStyle = 'rgba(0, 0, 0, 0.22)';
        alb.beginPath();
        alb.arc(px, py, 3 + Math.floor(pseudoRandom() * 4), 0, Math.PI * 2);
        alb.fill();
        alb.fillStyle = 'rgba(255, 255, 255, 0.18)';
        alb.fillRect(px - 1, py + 3, 4, 2);
      }

      // Roughness Map for this stone: 0.78 (#c7c7c7)
      rgh.fillStyle = '#c7c7c7';
      rgh.fillRect(bx, yTop, bw, h);
      // Stone bevels slightly smoother
      rgh.fillStyle = '#a8a8a8';
      rgh.fillRect(bx, yTop, bw, 6);
      rgh.fillRect(bx, yTop, 6, h);

      // Bump Map for this stone: Raised plate #a0a0a0 with bevels
      bmp.fillStyle = '#a0a0a0';
      bmp.fillRect(bx, yTop, bw, h);
      bmp.fillStyle = '#d0d0d0'; // bright top/left
      bmp.fillRect(bx, yTop, bw, 6);
      bmp.fillRect(bx, yTop, 6, h);
      bmp.fillStyle = '#656565'; // dark bottom/right
      bmp.fillRect(bx, yBottom - 6, bw, 6);
      bmp.fillRect(bx + bw - 6, yTop, 6, h);

      curX += blockW;
    }
  }

  // --- Vertical Weathering & Rain Grime Streaks ---
  // Dark vertical drip stains trailing down from stone courses
  alb.save();
  for (let s = 0; s < 40; s++) {
    const sx = Math.floor(pseudoRandom() * W);
    const sy = Math.floor(pseudoRandom() * (H * 0.7));
    const slen = 150 + Math.floor(pseudoRandom() * 380);
    const sw = 8 + Math.floor(pseudoRandom() * 22);

    const wGrad = alb.createLinearGradient(sx, sy, sx, sy + slen);
    wGrad.addColorStop(0.0, 'rgba(28, 32, 38, 0.38)');
    wGrad.addColorStop(0.6, 'rgba(38, 43, 50, 0.22)');
    wGrad.addColorStop(1.0, 'rgba(45, 50, 58, 0.0)');

    alb.fillStyle = wGrad;
    alb.fillRect(sx - sw / 2, sy, sw, slen);
  }
  alb.restore();

  // --- Base Moss & Lichen (Bottom 28% of texture: y from 1470 to 2048) ---
  const mossTop = H * 0.72;
  for (let mx = 0; mx < W; mx += 14) {
    const wave = Math.sin(mx * 0.015) * 60 + Math.cos(mx * 0.04) * 35;
    const mHeight = (H - mossTop) + wave + (pseudoRandom() * 50 - 25);
    const startY = H - mHeight;

    // Organic moss gradient
    const mossGrad = alb.createLinearGradient(mx, startY, mx, H);
    mossGrad.addColorStop(0.0, 'rgba(74, 128, 46, 0.0)');
    mossGrad.addColorStop(0.2, '#5e9b3a'); // Emerald sage
    mossGrad.addColorStop(0.5, '#427429'); // Vibrant forest
    mossGrad.addColorStop(0.85, '#284819'); // Deep damp moss
    mossGrad.addColorStop(1.0, '#1a3010');

    alb.fillStyle = mossGrad;
    alb.fillRect(mx - 8, startY, 26, H - startY);

    // Moss spore highlights & clumping dots
    if (pseudoRandom() > 0.45) {
      const sporeY = startY + pseudoRandom() * 120;
      alb.fillStyle = (pseudoRandom() > 0.5) ? '#8ac349' : '#a3d95b';
      alb.beginPath();
      alb.arc(mx + pseudoRandom() * 10, sporeY, 5 + pseudoRandom() * 7, 0, Math.PI * 2);
      alb.fill();
    }

    // Roughness & Bump in moss area
    rgh.fillStyle = '#7a8570'; // Wet moss ~ 0.50
    rgh.fillRect(mx - 8, startY, 26, H - startY);

    bmp.fillStyle = '#b8c5a8';
    bmp.fillRect(mx - 8, startY, 26, H - startY);
  }

  // Creeping moss tendrils along mortar lines in lower half
  for (let r = 6; r < numRows; r++) {
    const my = r * rowHeight;
    for (let cx = 0; cx < W; cx += 50) {
      if (pseudoRandom() > 0.4) {
        const patchW = 40 + pseudoRandom() * 60;
        alb.fillStyle = '#487d2e';
        alb.beginPath();
        alb.ellipse(cx, my, patchW, 16 + pseudoRandom() * 10, 0, 0, Math.PI * 2);
        alb.fill();

        alb.fillStyle = '#8ec54c';
        alb.beginPath();
        alb.ellipse(cx + 4, my - 2, patchW * 0.6, 8, 0, 0, Math.PI * 2);
        alb.fill();
      }
    }
  }

  // --- Hand-Painted Chamfered Arrow Slits (Middle Row: r = 4, y = ~820) ---
  // Position 4 prominent arrow slits spaced evenly across the horizontal texture
  const slitY = 4 * rowHeight + 10;
  const slitH = rowHeight * 1.5;
  const slitPositions = [W * 0.125, W * 0.375, W * 0.625, W * 0.875];

  slitPositions.forEach(slitX => {
    const sWidth = 52;
    const chamferW = 100;

    // Outer beveled stone lintel surround
    const lintGrad = alb.createLinearGradient(slitX - chamferW / 2, slitY, slitX + chamferW / 2, slitY);
    lintGrad.addColorStop(0.0, '#4e545e');
    lintGrad.addColorStop(0.2, '#9aa5b2');
    lintGrad.addColorStop(0.8, '#59606a');
    lintGrad.addColorStop(1.0, '#363a40');
    alb.fillStyle = lintGrad;
    alb.beginPath();
    alb.roundRect(slitX - chamferW / 2, slitY - 16, chamferW, slitH + 32, 12);
    alb.fill();

    // Chamfered stone sill bevel
    alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
    alb.fillRect(slitX - chamferW / 2, slitY + slitH + 8, chamferW, 8);

    // Deep pitch-black interior aperture with ambient sky bounce
    const innerGrad = alb.createLinearGradient(slitX, slitY, slitX, slitY + slitH);
    innerGrad.addColorStop(0.0, '#0c0e12');
    innerGrad.addColorStop(0.5, '#12161c');
    innerGrad.addColorStop(0.8, '#0a0d10');
    innerGrad.addColorStop(1.0, '#060708');
    alb.fillStyle = innerGrad;
    alb.beginPath();
    alb.roundRect(slitX - sWidth / 2, slitY, sWidth, slitH, 8);
    alb.fill();

    // Arrow slit inner depth drop shadow
    alb.strokeStyle = '#050608';
    alb.lineWidth = 5;
    alb.stroke();

    // Iron cross-brace / arrow port reinforcement bar in the center
    const barY = slitY + slitH * 0.48;
    const barH = 16;
    const ironGrad = alb.createLinearGradient(slitX - sWidth / 2, barY, slitX + sWidth / 2, barY);
    ironGrad.addColorStop(0.0, '#1e232a');
    ironGrad.addColorStop(0.4, '#5e6b7d');
    ironGrad.addColorStop(0.8, '#2c333e');
    ironGrad.addColorStop(1.0, '#15191f');
    alb.fillStyle = ironGrad;
    alb.fillRect(slitX - sWidth / 2 - 8, barY, sWidth + 16, barH);

    // Center iron ring port
    alb.beginPath();
    alb.arc(slitX, barY + barH / 2, 18, 0, Math.PI * 2);
    alb.fill();
    alb.strokeStyle = '#8d9eb5';
    alb.lineWidth = 3;
    alb.stroke();

    // Central circular arrow aperture
    alb.fillStyle = '#050608';
    alb.beginPath();
    alb.arc(slitX, barY + barH / 2, 9, 0, Math.PI * 2);
    alb.fill();

    // Rivet on iron bar ends
    drawRivet(alb, slitX - sWidth / 2 - 4, barY + barH / 2, 5, false);
    drawRivet(alb, slitX + sWidth / 2 + 4, barY + barH / 2, 5, false);

    // Maps update for arrow slit
    // Roughness: Interior black hole is non-reflective (1.0), iron is smooth (0.35)
    rgh.fillStyle = '#ffffff';
    rgh.fillRect(slitX - sWidth / 2, slitY, sWidth, slitH);
    rgh.fillStyle = '#595959';
    rgh.fillRect(slitX - sWidth / 2 - 8, barY, sWidth + 16, barH);

    // Metalness: Iron bar is metallic (0.85), rest is 0
    met.fillStyle = '#d9d9d9';
    met.fillRect(slitX - sWidth / 2 - 8, barY, sWidth + 16, barH);
    met.beginPath();
    met.arc(slitX, barY + barH / 2, 18, 0, Math.PI * 2);
    met.fill();

    // Bump Map: Arrow slit is deeply recessed
    bmp.fillStyle = '#101010';
    bmp.fillRect(slitX - sWidth / 2, slitY, sWidth, slitH);
    bmp.fillStyle = '#909090';
    bmp.fillRect(slitX - sWidth / 2 - 8, barY, sWidth + 16, barH);
  });

  const set = {
    map: toTexture(albC, true, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping),
    roughnessMap: toTexture(rghC, false, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping),
    metalnessMap: toTexture(metC, false, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping),
    bumpMap: toTexture(bmpC, false, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping)
  };
  textureCache.set('stone', set);
  return set;
}

/* ==========================================================================
   2. TIMBER BRACING & CROW'S NEST TEXTURES
   Dark heavy timber frame, weathered deck planks, iron gusset plates & bolts
   ========================================================================== */
export function getWatchtowerTimberTextures() {
  if (textureCache.has('timber')) return textureCache.get('timber');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Background deep aged oak wood
  const woodBaseGrad = alb.createLinearGradient(0, 0, W, 0);
  woodBaseGrad.addColorStop(0.0, '#3a2213');
  woodBaseGrad.addColorStop(0.5, '#4a2c19');
  woodBaseGrad.addColorStop(1.0, '#361e10');
  alb.fillStyle = woodBaseGrad;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#c0c0c0'; // Wood roughness ~ 0.75
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000'; // Wood non-metal
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // Draw 8 vertical heavy timber planks / posts across the texture
  const numPlanks = 8;
  const plankW = W / numPlanks;
  const grooveW = 12;

  let seed = 8137;
  function pRand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let i = 0; i < numPlanks; i++) {
    const px = i * plankW;
    const pw = plankW - grooveW;

    // Plank color variation
    const toneBase = (i % 2 === 0) ? '#4e301d' : '#452917';
    const toneHi = (i % 2 === 0) ? '#69432a' : '#5c3922';
    const toneSh = '#28170b';

    const pGrad = alb.createLinearGradient(px, 0, px + pw, 0);
    pGrad.addColorStop(0.0, toneHi);
    pGrad.addColorStop(0.12, toneBase);
    pGrad.addColorStop(0.85, toneBase);
    pGrad.addColorStop(1.0, toneSh);
    alb.fillStyle = pGrad;
    alb.fillRect(px, 0, pw, H);

    // Left edge bright amber chamfer highlight
    alb.fillStyle = 'rgba(235, 175, 110, 0.25)';
    alb.fillRect(px, 0, 5, H);

    // Right edge deep groove shadow
    alb.fillStyle = 'rgba(15, 8, 3, 0.65)';
    alb.fillRect(px + pw - 6, 0, 6, H);

    // Organic longitudinal wood grain lines
    const numGrains = 20 + Math.floor(pRand() * 12);
    for (let g = 0; g < numGrains; g++) {
      const gx = px + 10 + pRand() * (pw - 20);
      alb.strokeStyle = (pRand() > 0.45) ? 'rgba(30, 15, 6, 0.35)' : 'rgba(135, 88, 55, 0.22)';
      alb.lineWidth = 1.5 + pRand() * 2.5;
      alb.beginPath();
      alb.moveTo(gx, 0);
      // Gentle wavy curve along the beam
      const waveAmp = 8 + pRand() * 15;
      alb.bezierCurveTo(
        gx + waveAmp, H * 0.33,
        gx - waveAmp, H * 0.66,
        gx + (pRand() * 10 - 5), H
      );
      alb.stroke();
    }

    // Wood knot detail on some planks
    if (pRand() > 0.4) {
      const knotY = 300 + pRand() * (H - 600);
      const knotX = px + pw * (0.3 + pRand() * 0.4);
      const knotR = 18 + pRand() * 16;

      alb.fillStyle = '#221107';
      alb.beginPath();
      alb.ellipse(knotX, knotY, knotR, knotR * 1.5, 0, 0, Math.PI * 2);
      alb.fill();

      alb.strokeStyle = '#754b2d';
      alb.lineWidth = 3;
      alb.beginPath();
      alb.ellipse(knotX, knotY, knotR + 8, (knotR + 8) * 1.4, 0, 0, Math.PI * 2);
      alb.stroke();
    }

    // Groove in roughness and bump
    rgh.fillStyle = '#e5e5e5';
    rgh.fillRect(px + pw, 0, grooveW, H);
    bmp.fillStyle = '#303030';
    bmp.fillRect(px + pw, 0, grooveW, H);
    bmp.fillStyle = '#a0a0a0';
    bmp.fillRect(px, 0, pw, H);
    bmp.fillStyle = '#c5c5c5';
    bmp.fillRect(px, 0, 5, H);
  }

  // --- Heavy Forged Iron Gusset Plates, Diagonal Straps & Bolt Bands ---
  // Horizontal iron reinforcement bands across beams (top, middle, bottom)
  const bandHeights = [120, 680, 1340, 1920];
  bandHeights.forEach((by, idx) => {
    const bh = (idx === 0 || idx === 3) ? 75 : 55;

    // Drop shadow under iron strap
    alb.fillStyle = 'rgba(0, 0, 0, 0.65)';
    alb.fillRect(0, by + bh, W, 10);

    // Iron strap gradient
    const ironGrad = alb.createLinearGradient(0, by, 0, by + bh);
    ironGrad.addColorStop(0.0, '#566170');
    ironGrad.addColorStop(0.2, '#373e48');
    ironGrad.addColorStop(0.8, '#262b32');
    ironGrad.addColorStop(1.0, '#191c21');
    alb.fillStyle = ironGrad;
    alb.fillRect(0, by, W, bh);

    // Top brushed bevel highlight
    alb.fillStyle = 'rgba(255, 255, 255, 0.45)';
    alb.fillRect(0, by, W, 3);

    // Bottom dark bevel
    alb.fillStyle = '#101317';
    alb.fillRect(0, by + bh - 3, W, 3);

    // Heavy forged square bolts and round rivets across the strap
    for (let bx = 45; bx < W; bx += 128) {
      if ((bx / 128) % 2 === 0) {
        drawSquareBolt(alb, bx, by + bh / 2, 16, false);
      } else {
        drawRivet(alb, bx, by + bh / 2, 9, false);
      }
    }

    // Maps update for iron bands
    rgh.fillStyle = '#666666'; // Smooth iron ~ 0.40
    rgh.fillRect(0, by, W, bh);
    met.fillStyle = '#dedede'; // Metallic iron ~ 0.87
    met.fillRect(0, by, W, bh);
    bmp.fillStyle = '#cccccc'; // Raised iron strap
    bmp.fillRect(0, by, W, bh);
  });

  // Diagonal iron brace gusset plates in specific plank zones
  [0, 2, 4, 6].forEach(pi => {
    const gx = pi * plankW + 20;
    const gy = 800;
    const gw = plankW * 1.7;
    const gh = 420;

    alb.save();
    alb.translate(gx + 30, gy);
    alb.rotate(0.25);

    // Drop shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.55)';
    alb.fillRect(4, 4, gw, 48);

    // Angled iron strap
    const diagGrad = alb.createLinearGradient(0, 0, 0, 48);
    diagGrad.addColorStop(0.0, '#626e7e');
    diagGrad.addColorStop(0.3, '#3b434e');
    diagGrad.addColorStop(1.0, '#1c2026');
    alb.fillStyle = diagGrad;
    alb.fillRect(0, 0, gw, 48);

    // Bevel highlights
    alb.fillStyle = 'rgba(255, 255, 255, 0.4)';
    alb.fillRect(0, 0, gw, 3);

    // Rivets
    for (let rx = 35; rx < gw; rx += 70) {
      drawSquareBolt(alb, rx, 24, 14, false);
    }
    alb.restore();
  });

  const set = {
    map: toTexture(albC, true, THREE.RepeatWrapping, THREE.RepeatWrapping),
    roughnessMap: toTexture(rghC, false, THREE.RepeatWrapping, THREE.RepeatWrapping),
    metalnessMap: toTexture(metC, false, THREE.RepeatWrapping, THREE.RepeatWrapping),
    bumpMap: toTexture(bmpC, false, THREE.RepeatWrapping, THREE.RepeatWrapping)
  };
  textureCache.set('timber', set);
  return set;
}

/* ==========================================================================
   3. CONICAL ROYAL BLUE SHINGLES TEXTURES
   Overlapping scalloped royal sapphire shingles with gold frieze rim & rivets
   ========================================================================== */
export function getWatchtowerRoofTextures() {
  if (textureCache.has('roof')) return textureCache.get('roof');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Deep midnight sapphire base
  const roofBg = alb.createLinearGradient(0, 0, 0, H);
  roofBg.addColorStop(0.0, '#0f1d3b');
  roofBg.addColorStop(0.5, '#172554');
  roofBg.addColorStop(1.0, '#091024');
  alb.fillStyle = roofBg;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#8c8c8c'; // Silky slate ~ 0.55
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000'; // Slate non-metal
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // 12 overlapping tiers of scalloped royal blue roof shingles
  const rimHeight = 280; // Bottom gold rim
  const shinglesAreaH = H - rimHeight;
  const numTiers = 12;
  const tierH = shinglesAreaH / numTiers;

  for (let t = 0; t < numTiers; t++) {
    const tierY = t * tierH;
    const numShingles = 14 + t * 2; // Radiate outward: more shingles per tier towards base!
    const shingleW = W / numShingles;
    const shingleH = tierH * 1.55; // Overlap next tier
    const isOdd = (t % 2 === 1);
    const xOffset = isOdd ? shingleW * 0.5 : 0;

    for (let s = -1; s <= numShingles + 1; s++) {
      const sx = s * shingleW + xOffset;

      // Drop shadow underneath overlapping shingle tip
      alb.fillStyle = 'rgba(5, 10, 25, 0.65)';
      alb.beginPath();
      alb.arc(sx + shingleW / 2, tierY + shingleH, shingleW * 0.52, 0, Math.PI);
      alb.fill();

      // Shingle body gradient (Royal Blue / Cobalt)
      const sGrad = alb.createLinearGradient(sx, tierY, sx, tierY + shingleH);
      sGrad.addColorStop(0.0, '#1e3a8a'); // Deep royal blue top
      sGrad.addColorStop(0.35, '#2563eb'); // Rich royal cobalt
      sGrad.addColorStop(0.75, '#3b82f6'); // Vibrant cerulean
      sGrad.addColorStop(0.92, '#60a5fa'); // Glowing light blue edge
      sGrad.addColorStop(1.0, '#1d4ed8'); // Rim bevel return
      alb.fillStyle = sGrad;

      // Scalloped / Fish-scale shingle geometry
      alb.beginPath();
      alb.moveTo(sx, tierY);
      alb.lineTo(sx + shingleW, tierY);
      alb.lineTo(sx + shingleW, tierY + shingleH * 0.6);
      alb.bezierCurveTo(
        sx + shingleW, tierY + shingleH,
        sx, tierY + shingleH,
        sx, tierY + shingleH * 0.6
      );
      alb.closePath();
      alb.fill();

      // Bottom curved bright edge highlight
      alb.strokeStyle = '#93c5fd';
      alb.lineWidth = 4.5;
      alb.beginPath();
      alb.arc(sx + shingleW / 2, tierY + shingleH * 0.72, shingleW * 0.44, 0.25 * Math.PI, 0.75 * Math.PI);
      alb.stroke();

      // Central slate ridge cleft line
      alb.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      alb.lineWidth = 2.5;
      alb.beginPath();
      alb.moveTo(sx + shingleW / 2, tierY + 10);
      alb.lineTo(sx + shingleW / 2, tierY + shingleH * 0.75);
      alb.stroke();

      // Bump map for shingle overlap
      bmp.fillStyle = '#b0b0b0';
      bmp.beginPath();
      bmp.arc(sx + shingleW / 2, tierY + shingleH * 0.7, shingleW * 0.48, 0, Math.PI);
      bmp.fill();
    }
  }

  // --- Ornate Golden Frieze Rim & Eave Trim (Bottom 280px: y = H - rimHeight to H) ---
  const gy = H - rimHeight;

  // Drop shadow above the gold rim
  alb.fillStyle = 'rgba(5, 10, 20, 0.75)';
  alb.fillRect(0, gy - 16, W, 16);

  // Gold base bar gradient
  const goldGrad = alb.createLinearGradient(0, gy, 0, H);
  goldGrad.addColorStop(0.0, '#fef08a'); // Bright gold top rim highlight
  goldGrad.addColorStop(0.12, '#f59e0b'); // Radiant gold
  goldGrad.addColorStop(0.45, '#fbbf24'); // Luminous amber
  goldGrad.addColorStop(0.8, '#d97706'); // Deep warm gold
  goldGrad.addColorStop(1.0, '#78350f'); // Shadow bottom lip
  alb.fillStyle = goldGrad;
  alb.fillRect(0, gy, W, rimHeight);

  // Top and bottom crisp gold lip bars
  alb.fillStyle = '#fffbeb';
  alb.fillRect(0, gy, W, 8);
  alb.fillStyle = '#451a03';
  alb.fillRect(0, gy + 12, W, 4);

  alb.fillStyle = '#78350f';
  alb.fillRect(0, H - 12, W, 12);
  alb.fillStyle = '#fef08a';
  alb.fillRect(0, H - 20, W, 6);

  // Intricate medieval crown / diamond scroll filigree along gold band
  alb.save();
  const filigreeStep = 100;
  for (let fx = 0; fx < W; fx += filigreeStep) {
    // Diamond motif
    alb.fillStyle = '#92400e';
    alb.beginPath();
    alb.moveTo(fx + filigreeStep / 2, gy + 35);
    alb.lineTo(fx + filigreeStep - 15, gy + rimHeight / 2);
    alb.lineTo(fx + filigreeStep / 2, gy + rimHeight - 45);
    alb.lineTo(fx + 15, gy + rimHeight / 2);
    alb.closePath();
    alb.fill();

    alb.strokeStyle = '#fffbeb';
    alb.lineWidth = 4;
    alb.stroke();

    // Central fleur-de-lis / diamond stud
    alb.fillStyle = '#fef08a';
    alb.beginPath();
    alb.arc(fx + filigreeStep / 2, gy + rimHeight / 2, 10, 0, Math.PI * 2);
    alb.fill();

    // Upper and lower gold rivets
    drawRivet(alb, fx + filigreeStep / 2, gy + 22, 9, true);
    drawRivet(alb, fx + filigreeStep / 2, gy + rimHeight - 22, 9, true);
  }
  alb.restore();

  // Maps for Gold Rim:
  // Roughness: Polished gold ~ 0.28 (#474747)
  rgh.fillStyle = '#474747';
  rgh.fillRect(0, gy, W, rimHeight);

  // Metalness: Gold is metallic ~ 0.92 (#ebebeb)
  met.fillStyle = '#ebebeb';
  met.fillRect(0, gy, W, rimHeight);

  // Bump Map: Raised gold band with embossed diamonds
  bmp.fillStyle = '#d5d5d5';
  bmp.fillRect(0, gy, W, rimHeight);
  bmp.fillStyle = '#f0f0f0';
  bmp.fillRect(0, gy, W, 8);

  const set = {
    map: toTexture(albC, true, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping),
    roughnessMap: toTexture(rghC, false, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping),
    metalnessMap: toTexture(metC, false, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping),
    bumpMap: toTexture(bmpC, false, THREE.RepeatWrapping, THREE.ClampToEdgeWrapping)
  };
  textureCache.set('roof', set);
  return set;
}

/* ==========================================================================
   4. FORGED IRON BRAZIER & GLOWING EMBERS TEXTURES
   Wrought iron fire cage and incandescent burning coals
   ========================================================================== */
export function getWatchtowerBrazierTextures() {
  if (textureCache.has('brazier')) return textureCache.get('brazier');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: metC, ctx: met } = createCanvas(1024, 1024);

  // Charred black blacksmith iron with thermal oxidation patina
  const ironGrad = alb.createLinearGradient(0, 0, 0, H);
  ironGrad.addColorStop(0.0, '#383e47');
  ironGrad.addColorStop(0.3, '#242930');
  ironGrad.addColorStop(0.6, '#181b20');
  ironGrad.addColorStop(0.85, '#28201a'); // Warm heat soot
  ironGrad.addColorStop(1.0, '#131518');
  alb.fillStyle = ironGrad;
  alb.fillRect(0, 0, W, H);

  // Hammered facets
  alb.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let x = 0; x < W; x += 40) {
    for (let y = 0; y < H; y += 40) {
      if ((x + y) % 80 === 0) {
        alb.beginPath();
        alb.ellipse(x + 20, y + 20, 22, 14, 0.4, 0, Math.PI * 2);
        alb.fill();
      }
    }
  }

  // Vertical iron bars / ribs pattern
  for (let x = 0; x < W; x += 64) {
    alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
    alb.fillRect(x + 40, 0, 8, H);
    alb.fillStyle = 'rgba(255, 255, 255, 0.15)';
    alb.fillRect(x, 0, 4, H);
    drawRivet(alb, x + 24, 80, 7, false);
    drawRivet(alb, x + 24, H - 80, 7, false);
  }

  rgh.fillStyle = '#555555'; // Roughness ~ 0.33
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#e0e0e0'; // Metalness ~ 0.88
  met.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false)
  };
  textureCache.set('brazier', set);
  return set;
}

export function getWatchtowerEmbersTextures() {
  if (textureCache.has('embers')) return textureCache.get('embers');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: emsC, ctx: ems } = createCanvas(1024, 1024);

  // Burning charcoal bed with incandescent magma fissures
  alb.fillStyle = '#18181b';
  alb.fillRect(0, 0, W, H);
  ems.fillStyle = '#000000';
  ems.fillRect(0, 0, W, H);

  // Swirling glowing core
  const coreGrad = ems.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.48);
  coreGrad.addColorStop(0.0, '#ffffff'); // Pure white heat
  coreGrad.addColorStop(0.2, '#fef08a'); // Intense yellow
  coreGrad.addColorStop(0.45, '#f97316'); // Blazing orange
  coreGrad.addColorStop(0.75, '#dc2626'); // Red heat
  coreGrad.addColorStop(1.0, '#000000');
  ems.fillStyle = coreGrad;
  ems.fillRect(0, 0, W, H);

  // Albedo matches the glowing gradient
  alb.fillStyle = coreGrad;
  alb.fillRect(0, 0, W, H);

  // Overlaid charred coal briquette crusts
  let seed = 3912;
  function pRand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let i = 0; i < 90; i++) {
    const cx = pRand() * W;
    const cy = pRand() * H;
    const cr = 24 + pRand() * 45;

    alb.fillStyle = '#1c1917';
    alb.beginPath();
    alb.ellipse(cx, cy, cr, cr * (0.6 + pRand() * 0.6), pRand() * Math.PI, 0, Math.PI * 2);
    alb.fill();

    // Edge glowing ash rim
    alb.strokeStyle = '#ea580c';
    alb.lineWidth = 3;
    alb.stroke();

    // Darken emissive on coal crust tops
    ems.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ems.beginPath();
    ems.ellipse(cx, cy, cr * 0.7, cr * 0.5, 0, 0, Math.PI * 2);
    ems.fill();
  }

  const set = {
    map: toTexture(albC, true),
    emissiveMap: toTexture(emsC, true)
  };
  textureCache.set('embers', set);
  return set;
}

/* ==========================================================================
   5. FLUTTERING ROYAL HERALDIC PENNANT RIBBON TEXTURES
   Royal blue silk streamer with golden lion crest, borders, and swallowtail fringe
   ========================================================================== */
export function getWatchtowerPennantTextures() {
  if (textureCache.has('pennant')) return textureCache.get('pennant');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 1024);
  const { canvas: metC, ctx: met } = createCanvas(2048, 1024);

  // Royal Cobalt Blue Silk Base
  const silkGrad = alb.createLinearGradient(0, 0, 0, H);
  silkGrad.addColorStop(0.0, '#1d4ed8');
  silkGrad.addColorStop(0.3, '#2563eb');
  silkGrad.addColorStop(0.7, '#1e40af');
  silkGrad.addColorStop(1.0, '#172554');
  alb.fillStyle = silkGrad;
  alb.fillRect(0, 0, W, H);

  // Painterly wind-flutter folds (diagonal waves of light & shadow across streamer)
  for (let wx = 0; wx < W; wx += 260) {
    // Shadow trough
    const shGrad = alb.createLinearGradient(wx, 0, wx + 180, 0);
    shGrad.addColorStop(0.0, 'rgba(10, 20, 50, 0.55)');
    shGrad.addColorStop(0.5, 'rgba(10, 20, 50, 0.0)');
    shGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.28)'); // Crest highlight
    alb.fillStyle = shGrad;
    alb.fillRect(wx, 0, 220, H);
  }

  // Woven silk fabric micro-grain
  alb.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let x = 0; x < W; x += 8) {
    alb.fillRect(x, 0, 2, H);
  }

  // Top & Bottom Gold Embroidered Border Bands
  const bHeight = 48;
  const bGrad = alb.createLinearGradient(0, 0, 0, bHeight);
  bGrad.addColorStop(0.0, '#fef08a');
  bGrad.addColorStop(0.3, '#f59e0b');
  bGrad.addColorStop(0.8, '#d97706');
  bGrad.addColorStop(1.0, '#78350f');

  alb.fillStyle = bGrad;
  alb.fillRect(0, 0, W, bHeight);
  alb.fillRect(0, H - bHeight, W, bHeight);

  // Running gold embroidery stitches
  drawStitches(alb, 20, bHeight / 2, W - 20, bHeight / 2, 16, 10, '#fffbeb');
  drawStitches(alb, 20, H - bHeight / 2, W - 20, H - bHeight / 2, 16, 10, '#fffbeb');

  // Left hoist reinforcement leather sleeve
  alb.fillStyle = '#653a1a';
  alb.fillRect(0, 0, 60, H);
  alb.fillStyle = 'rgba(255, 255, 255, 0.25)';
  alb.fillRect(55, 0, 5, H);
  drawStitches(alb, 30, 20, 30, H - 20, 14, 8, '#fef08a');
  drawRivet(alb, 30, 80, 10, false);
  drawRivet(alb, 30, H / 2, 10, false);
  drawRivet(alb, 30, H - 80, 10, false);

  // Emblazon Golden Rampant Lion in the forward half of pennant (centered around x = 520, y = H / 2)
  drawRampantLion(alb, 520, H / 2, 3.2, 3.2, '#fbbf24');

  // Second smaller heraldic lion motif downstream for length balance
  drawRampantLion(alb, 1280, H / 2, 2.2, 2.2, '#f59e0b');

  // Swallowtail trailing fringe on the right edge
  alb.fillStyle = '#fbbf24';
  for (let fy = 0; fy < H; fy += 18) {
    alb.fillRect(W - 45, fy, 45, 9);
    alb.fillStyle = '#fef08a';
    alb.fillRect(W - 45, fy, 45, 3);
    alb.fillStyle = '#fbbf24';
  }

  // Roughness Map
  rgh.fillStyle = '#b3b3b3'; // Silk ~ 0.70
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#4a4a4a'; // Gold embroidery ~ 0.29
  rgh.fillRect(0, 0, W, bHeight);
  rgh.fillRect(0, H - bHeight, W, bHeight);

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e6e6e6'; // Gold embroidery is metallic ~ 0.90
  met.fillRect(0, 0, W, bHeight);
  met.fillRect(0, H - bHeight, W, bHeight);

  const set = {
    map: toTexture(albC, true, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping),
    roughnessMap: toTexture(rghC, false, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping),
    metalnessMap: toTexture(metC, false, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping)
  };
  textureCache.set('pennant', set);
  return set;
}

/* ==========================================================================
   6. ARCHER PARAPET SHIELDS TEXTURES
   Heraldic heater shield with royal blue field, gold chevron, and riveted rim
   ========================================================================== */
export function getWatchtowerShieldTextures() {
  if (textureCache.has('shield')) return textureCache.get('shield');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: metC, ctx: met } = createCanvas(1024, 1024);

  // Cobalt blue shield field
  const sGrad = alb.createRadialGradient(W / 2, H * 0.4, 80, W / 2, H * 0.5, W * 0.48);
  sGrad.addColorStop(0.0, '#3b82f6');
  sGrad.addColorStop(0.6, '#1d4ed8');
  sGrad.addColorStop(1.0, '#0f172a');
  alb.fillStyle = sGrad;
  alb.fillRect(0, 0, W, H);

  // Bold Golden Chevron / V-Stripe
  alb.fillStyle = '#f59e0b';
  alb.beginPath();
  alb.moveTo(0, H * 0.35);
  alb.lineTo(W / 2, H * 0.65);
  alb.lineTo(W, H * 0.35);
  alb.lineTo(W, H * 0.52);
  alb.lineTo(W / 2, H * 0.82);
  alb.lineTo(0, H * 0.52);
  alb.closePath();
  alb.fill();

  // Golden chevron highlight edge
  alb.strokeStyle = '#fef08a';
  alb.lineWidth = 8;
  alb.stroke();

  // Small royal lion in upper chief
  drawRampantLion(alb, W / 2, H * 0.3, 1.4, 1.4, '#fef08a');

  // Outer Steel Reinforcement Rim with Rivets
  const rimW = 42;
  const rimGrad = alb.createLinearGradient(0, 0, rimW, 0);
  rimGrad.addColorStop(0.0, '#cbd5e1');
  rimGrad.addColorStop(0.5, '#64748b');
  rimGrad.addColorStop(1.0, '#1e293b');

  alb.strokeStyle = rimGrad;
  alb.lineWidth = rimW;
  alb.strokeRect(rimW / 2, rimW / 2, W - rimW, H - rimW);

  // Steel rivets around rim
  for (let rx = 35; rx < W; rx += 90) {
    drawRivet(alb, rx, rimW / 2, 8, false);
    drawRivet(alb, rx, H - rimW / 2, 8, false);
  }
  for (let ry = 35; ry < H; ry += 90) {
    drawRivet(alb, rimW / 2, ry, 8, false);
    drawRivet(alb, W - rimW / 2, ry, 8, false);
  }

  // Central round steel boss / umbo
  const bossGrad = alb.createRadialGradient(W / 2 - 15, H / 2 - 15, 5, W / 2, H / 2, 90);
  bossGrad.addColorStop(0.0, '#ffffff');
  bossGrad.addColorStop(0.4, '#94a3b8');
  bossGrad.addColorStop(0.8, '#475569');
  bossGrad.addColorStop(1.0, '#0f172a');
  alb.fillStyle = bossGrad;
  alb.beginPath();
  alb.arc(W / 2, H / 2, 85, 0, Math.PI * 2);
  alb.fill();
  alb.strokeStyle = '#e2e8f0';
  alb.lineWidth = 6;
  alb.stroke();

  // Boss perimeter rivets
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    drawRivet(alb, W / 2 + Math.cos(a) * 65, H / 2 + Math.sin(a) * 65, 7, false);
  }

  // Roughness Map
  rgh.fillStyle = '#8c8c8c'; // Painted wood field ~ 0.55
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#4a4a4a'; // Steel rim and boss ~ 0.29
  rgh.strokeRect(rimW / 2, rimW / 2, W - rimW, H - rimW);
  rgh.beginPath();
  rgh.arc(W / 2, H / 2, 85, 0, Math.PI * 2);
  rgh.fill();

  // Metalness Map
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e0e0e0'; // Steel is metallic ~ 0.88
  met.strokeRect(rimW / 2, rimW / 2, W - rimW, H - rimW);
  met.beginPath();
  met.arc(W / 2, H / 2, 85, 0, Math.PI * 2);
  met.fill();

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false)
  };
  textureCache.set('shield', set);
  return set;
}

/* ==========================================================================
   CACHED MATERIAL GETTERS
   ========================================================================== */

/**
 * Returns a cached set of all ready-to-use PBR materials for the Watchtower
 */
export function getWatchtowerMaterials() {
  if (materialCache.has('all')) return materialCache.get('all');

  const stoneTex = getWatchtowerStoneTextures();
  const timberTex = getWatchtowerTimberTextures();
  const roofTex = getWatchtowerRoofTextures();
  const brazierTex = getWatchtowerBrazierTextures();
  const embersTex = getWatchtowerEmbersTextures();
  const pennantTex = getWatchtowerPennantTextures();
  const shieldTex = getWatchtowerShieldTextures();

  const mats = {
    stone: new THREE.MeshStandardMaterial({
      map: stoneTex.map,
      roughnessMap: stoneTex.roughnessMap,
      metalnessMap: stoneTex.metalnessMap,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.06,
      roughness: 0.9,
      metalness: 0.1
    }),

    stoneFoundation: new THREE.MeshStandardMaterial({
      map: stoneTex.map,
      roughnessMap: stoneTex.roughnessMap,
      metalnessMap: stoneTex.metalnessMap,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.95,
      metalness: 0.05
    }),

    timber: new THREE.MeshStandardMaterial({
      map: timberTex.map,
      roughnessMap: timberTex.roughnessMap,
      metalnessMap: timberTex.metalnessMap,
      bumpMap: timberTex.bumpMap,
      bumpScale: 0.05,
      roughness: 0.85,
      metalness: 0.2
    }),

    timberDeck: new THREE.MeshStandardMaterial({
      map: timberTex.map,
      roughnessMap: timberTex.roughnessMap,
      metalnessMap: timberTex.metalnessMap,
      bumpMap: timberTex.bumpMap,
      bumpScale: 0.06,
      roughness: 0.8,
      metalness: 0.15
    }),

    roof: new THREE.MeshStandardMaterial({
      map: roofTex.map,
      roughnessMap: roofTex.roughnessMap,
      metalnessMap: roofTex.metalnessMap,
      bumpMap: roofTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.55,
      metalness: 0.4
    }),

    brazier: new THREE.MeshStandardMaterial({
      map: brazierTex.map,
      roughnessMap: brazierTex.roughnessMap,
      metalnessMap: brazierTex.metalnessMap,
      roughness: 0.45,
      metalness: 0.8
    }),

    embers: new THREE.MeshStandardMaterial({
      map: embersTex.map,
      emissiveMap: embersTex.emissiveMap,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 1.8,
      roughness: 0.9,
      metalness: 0.0
    }),

    pennant: new THREE.MeshStandardMaterial({
      map: pennantTex.map,
      roughnessMap: pennantTex.roughnessMap,
      metalnessMap: pennantTex.metalnessMap,
      roughness: 0.65,
      metalness: 0.25,
      side: THREE.DoubleSide
    }),

    shield: new THREE.MeshStandardMaterial({
      map: shieldTex.map,
      roughnessMap: shieldTex.roughnessMap,
      metalnessMap: shieldTex.metalnessMap,
      roughness: 0.55,
      metalness: 0.45
    }),

    goldFinial: new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.92
    }),

    ironSteel: new THREE.MeshStandardMaterial({
      color: 0x333b45,
      roughness: 0.35,
      metalness: 0.85
    }),

    darkOak: new THREE.MeshStandardMaterial({
      color: 0x382012,
      roughness: 0.85,
      metalness: 0.05
    })
  };

  materialCache.set('all', mats);
  return mats;
}
