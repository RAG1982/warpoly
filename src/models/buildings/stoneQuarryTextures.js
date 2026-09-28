import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Stone Quarry (Pedreira)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates 2048x2048 crisp, hand-painted procedural PBR textures:
 * 1. getQuarryRockTextures(): Multi-toned sedimentary limestone & granite strata, chisel gouges, fracture planes, dust & moss
 * 2. getDressedStoneTextures(): Perfectly squared ashlar building blocks with drafted chisel margins, bevels & stonemason guild marks
 * 3. getCraneTimberRopeTextures(): Weathered mountain oak boom poles, twisted hemp rope rigging & forged iron hoist pulleys
 * 4. getQuarryToolsTextures(): Wooden pallets, wheelbarrow planks, iron sledgehammers, pry bars & stone chips
 */

const textureCache = new Map();



/**
 * Helper: Draw a stylized hand-forged square iron bolt / rivet
 */
function drawSquareBolt(ctx, cx, cy, size = 16, isIron = true) {
  ctx.save();
  // Ambient drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.rect(cx - size * 0.5 + 3, cy - size * 0.5 + 4, size, size);
  ctx.fill();

  // Outer beveled iron body
  const grad = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
  if (isIron) {
    grad.addColorStop(0, '#737a82');
    grad.addColorStop(0.3, '#50565e');
    grad.addColorStop(0.7, '#2b3036');
    grad.addColorStop(1, '#15171a');
  } else {
    grad.addColorStop(0, '#fde68a');
    grad.addColorStop(0.4, '#d97706');
    grad.addColorStop(1, '#78350f');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.rect(cx - size * 0.5, cy - size * 0.5, size, size);
  ctx.fill();

  // Top highlight rim
  ctx.fillStyle = isIron ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.rect(cx - size * 0.5, cy - size * 0.5, size, 2.5);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(cx - size * 0.5, cy - size * 0.5, 2.5, size);
  ctx.fill();

  // Center specular dome / pin
  ctx.fillStyle = isIron ? '#9ca3af' : '#fef08a';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Helper: Draw a medieval stonemason guild symbol / mason mark
 */
function drawMasonMark(ctx, cx, cy, size = 90, type = 'crossed_chisels', color = '#27231f', highlightColor = '#ded7c8') {
  ctx.save();
  ctx.translate(cx, cy);

  function strokeMark(drawFn, strokeWidth = 8, strokeStyle = color) {
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeStyle;
    ctx.beginPath();
    drawFn();
    ctx.stroke();
  }

  // Draw highlight offset first (gives engraved 3D relief)
  ctx.save();
  ctx.translate(2, 2.5);
  renderGlyph(highlightColor, 6);
  ctx.restore();

  // Draw main engraved cut
  renderGlyph(color, 7);

  function renderGlyph(col, w) {
    if (type === 'crossed_chisels') {
      strokeMark(() => {
        // Chisel 1
        ctx.moveTo(-size * 0.45, -size * 0.45);
        ctx.lineTo(size * 0.45, size * 0.45);
        // Chisel head & bevel blade
        ctx.moveTo(-size * 0.45 - 6, -size * 0.45 + 6);
        ctx.lineTo(-size * 0.45 + 6, -size * 0.45 - 6);
        ctx.moveTo(size * 0.45 - 8, size * 0.45 + 8);
        ctx.lineTo(size * 0.45 + 8, size * 0.45 - 8);

        // Chisel 2
        ctx.moveTo(size * 0.45, -size * 0.45);
        ctx.lineTo(-size * 0.45, size * 0.45);
        ctx.moveTo(size * 0.45 - 6, -size * 0.45 - 6);
        ctx.lineTo(size * 0.45 + 6, -size * 0.45 + 6);
        ctx.moveTo(-size * 0.45 - 8, size * 0.45 - 8);
        ctx.lineTo(-size * 0.45 + 8, size * 0.45 + 8);
      }, w, col);
    } else if (type === 'hourglass_quarry') {
      strokeMark(() => {
        ctx.moveTo(-size * 0.35, -size * 0.45);
        ctx.lineTo(size * 0.35, -size * 0.45);
        ctx.lineTo(-size * 0.35, size * 0.45);
        ctx.lineTo(size * 0.35, size * 0.45);
        ctx.lineTo(-size * 0.35, -size * 0.45);
        ctx.moveTo(-size * 0.2, 0);
        ctx.lineTo(size * 0.2, 0);
      }, w, col);
    } else if (type === 'crowned_chevron') {
      strokeMark(() => {
        // Chevron
        ctx.moveTo(-size * 0.4, size * 0.35);
        ctx.lineTo(0, -size * 0.25);
        ctx.lineTo(size * 0.4, size * 0.35);
        // Crown cross on top
        ctx.moveTo(0, -size * 0.25);
        ctx.lineTo(0, -size * 0.5);
        ctx.moveTo(-size * 0.15, -size * 0.4);
        ctx.lineTo(size * 0.15, -size * 0.4);
      }, w, col);
    } else if (type === 'roman_numerals') {
      strokeMark(() => {
        // VII mark
        ctx.moveTo(-size * 0.35, -size * 0.35);
        ctx.lineTo(-size * 0.15, size * 0.35);
        ctx.lineTo(0.05, -size * 0.35);
        // I
        ctx.moveTo(size * 0.22, -size * 0.35);
        ctx.lineTo(size * 0.22, size * 0.35);
        // II
        ctx.moveTo(size * 0.38, -size * 0.35);
        ctx.lineTo(size * 0.38, size * 0.35);
      }, w, col);
    }
  }

  ctx.restore();
}

/* ==========================================================================
   1. QUARRY LIMESTONE & GRANITE STRATA TEXTURES (2048x2048)
   ========================================================================== */
export function getQuarryRockTextures() {
  if (textureCache.has('quarry_rock')) return textureCache.get('quarry_rock');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // 1. Sedimentary Geological Strata Layers (Albedo)
  // Base backdrop gradient
  const bgGrad = alb.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0.0, '#a39c8e'); // Upper weathered limestone
  bgGrad.addColorStop(0.2, '#c0b8a8'); // Warm calcitic buff
  bgGrad.addColorStop(0.4, '#878c90'); // Slate shale band
  bgGrad.addColorStop(0.65, '#aba292'); // Honey limestone
  bgGrad.addColorStop(0.85, '#757067'); // Dark dense granite bed
  bgGrad.addColorStop(1.0, '#59564f'); // Deep foundation rock
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Layered sedimentary strata ribbons with subtle sinusoidal undulations
  const strataColors = [
    '#beb6a4', '#999487', '#d0c8b6', '#7f8386',
    '#b49a79', '#c5bdad', '#6f7377', '#8e7960',
    '#dcd5c3', '#a7a091', '#5a5e62', '#b9ad9b'
  ];

  for (let i = 0; i < strataColors.length; i++) {
    const yCenter = (H / strataColors.length) * (i + 0.5);
    const bandH = (H / strataColors.length) * 0.9;
    alb.fillStyle = strataColors[i];

    alb.beginPath();
    alb.moveTo(0, yCenter - bandH * 0.5);
    for (let x = 0; x <= W; x += 128) {
      const wave = Math.sin((x / W) * Math.PI * 4 + i * 1.5) * 35 + Math.cos((x / W) * Math.PI * 7) * 18;
      alb.lineTo(x, yCenter - bandH * 0.5 + wave);
    }
    for (let x = W; x >= 0; x -= 128) {
      const wave = Math.sin((x / W) * Math.PI * 4 + i * 1.5) * 35 + Math.cos((x / W) * Math.PI * 7) * 18;
      alb.lineTo(x, yCenter + bandH * 0.5 + wave);
    }
    alb.closePath();
    alb.fill();
  }

  // Sedimentary micro-stripes and siltstone laminations
  alb.fillStyle = 'rgba(0, 0, 0, 0.07)';
  for (let y = 10; y < H; y += 22) {
    const thickness = 2 + (y % 5);
    alb.fillRect(0, y, W, thickness);
  }
  alb.fillStyle = 'rgba(255, 255, 255, 0.09)';
  for (let y = 22; y < H; y += 38) {
    alb.fillRect(0, y, W, 3);
  }

  // 2. Chisel Fracture Marks & Pickaxe Excavation Scars
  // Hand-hewn strike marks grouped in stepped rhythm
  for (let col = 0; col < 6; col++) {
    const startX = col * 340 + 60;
    for (let row = 0; row < 10; row++) {
      const startY = row * 200 + 40 + (col % 2) * 50;
      const numStrikes = 6 + (row % 4);
      for (let s = 0; s < numStrikes; s++) {
        const sx = startX + (s % 3) * 35 + (Math.random() - 0.5) * 15;
        const sy = startY + Math.floor(s / 3) * 45 + (Math.random() - 0.5) * 15;
        const angle = -0.4 + (s % 2) * 0.8;
        const len = 40 + Math.random() * 25;

        // Shadow groove
        alb.save();
        alb.translate(sx, sy);
        alb.rotate(angle);
        alb.strokeStyle = 'rgba(35, 32, 28, 0.55)';
        alb.lineWidth = 6;
        alb.lineCap = 'round';
        alb.beginPath();
        alb.moveTo(0, 0);
        alb.lineTo(len, 0);
        alb.stroke();

        // Chipped white chalky rim
        alb.strokeStyle = 'rgba(255, 255, 245, 0.65)';
        alb.lineWidth = 3;
        alb.beginPath();
        alb.moveTo(1, -2.5);
        alb.lineTo(len - 2, -2.5);
        alb.stroke();
        alb.restore();
      }
    }
  }

  // 3. Angular Fracture Planes & Rock Cleavage Facets
  const cleavagePoints = [
    { x: 300, y: 400, r: 220 },
    { x: 950, y: 300, r: 280 },
    { x: 1650, y: 550, r: 240 },
    { x: 450, y: 1100, r: 310 },
    { x: 1200, y: 1250, r: 260 },
    { x: 1800, y: 1400, r: 290 },
    { x: 800, y: 1800, r: 320 }
  ];

  cleavagePoints.forEach(cp => {
    alb.save();
    // Drop shadow under fracture cliff
    alb.fillStyle = 'rgba(25, 23, 20, 0.35)';
    alb.beginPath();
    alb.ellipse(cp.x + 8, cp.y + 12, cp.r, cp.r * 0.65, 0.3, 0, Math.PI * 2);
    alb.fill();

    // Sharp polygonal rock facet
    const facetGrad = alb.createLinearGradient(cp.x - cp.r, cp.y - cp.r * 0.5, cp.x + cp.r, cp.y + cp.r * 0.5);
    facetGrad.addColorStop(0, '#dbd4c3');
    facetGrad.addColorStop(0.5, '#b5ad9e');
    facetGrad.addColorStop(1, '#8e8677');
    alb.fillStyle = facetGrad;
    alb.beginPath();
    alb.moveTo(cp.x - cp.r * 0.8, cp.y - cp.r * 0.3);
    alb.lineTo(cp.x - cp.r * 0.2, cp.y - cp.r * 0.6);
    alb.lineTo(cp.x + cp.r * 0.6, cp.y - cp.r * 0.4);
    alb.lineTo(cp.x + cp.r * 0.9, cp.y + cp.r * 0.2);
    alb.lineTo(cp.x + cp.r * 0.3, cp.y + cp.r * 0.6);
    alb.lineTo(cp.x - cp.r * 0.5, cp.y + cp.r * 0.4);
    alb.closePath();
    alb.fill();

    // Sharp beveled highlight edges
    alb.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    alb.lineWidth = 5;
    alb.beginPath();
    alb.moveTo(cp.x - cp.r * 0.8, cp.y - cp.r * 0.3);
    alb.lineTo(cp.x - cp.r * 0.2, cp.y - cp.r * 0.6);
    alb.lineTo(cp.x + cp.r * 0.6, cp.y - cp.r * 0.4);
    alb.stroke();
    alb.restore();
  });

  // 4. Calcite Crystalline Veins (pale luminous cracks)
  alb.strokeStyle = 'rgba(248, 246, 235, 0.75)';
  alb.lineWidth = 4;
  alb.lineCap = 'round';
  for (let v = 0; v < 8; v++) {
    let vx = (v * 260 + 120) % W;
    let vy = (v * 310 + 80) % H;
    alb.beginPath();
    alb.moveTo(vx, vy);
    for (let seg = 0; seg < 9; seg++) {
      vx += 35 + Math.random() * 30;
      vy += (Math.random() - 0.4) * 45;
      alb.lineTo(vx, vy);
    }
    alb.stroke();
  }

  // 5. Stylized Sage Lichen Rosettes (Warcraft 2 / fantasy color pop)
  const lichenSpots = [
    { x: 180, y: 220, r: 45 },
    { x: 230, y: 240, r: 35 },
    { x: 820, y: 780, r: 50 },
    { x: 1450, y: 920, r: 60 },
    { x: 1520, y: 960, r: 40 },
    { x: 620, y: 1650, r: 55 },
    { x: 1720, y: 1780, r: 65 }
  ];
  lichenSpots.forEach(l => {
    const lGrad = alb.createRadialGradient(l.x, l.y, l.r * 0.1, l.x, l.y, l.r);
    lGrad.addColorStop(0, '#97ab73');
    lGrad.addColorStop(0.6, '#728854');
    lGrad.addColorStop(0.9, '#4c5d37');
    lGrad.addColorStop(1, 'rgba(45, 58, 30, 0)');
    alb.fillStyle = lGrad;
    alb.beginPath();
    alb.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    alb.fill();
  });

  // 6. Gravel Dust Accumulation & Powder Drift
  const dustGrad = alb.createLinearGradient(0, H - 400, 0, H);
  dustGrad.addColorStop(0, 'rgba(215, 209, 195, 0)');
  dustGrad.addColorStop(1, 'rgba(215, 209, 195, 0.45)');
  alb.fillStyle = dustGrad;
  alb.fillRect(0, H - 400, W, 400);

  // Fine stone powder specks
  alb.fillStyle = 'rgba(255, 255, 250, 0.15)';
  for (let p = 0; p < 800; p++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const pr = 1 + Math.random() * 3.5;
    alb.fillRect(px, py, pr, pr);
  }

  // --- Roughness Map (Matte raw rock: ~ 0.86 - 0.94) ---
  rgh.fillStyle = '#dbdbdb'; // ~ 0.86 base
  rgh.fillRect(0, 0, W, H);
  // Cleavage facets smoother (~ 0.65)
  cleavagePoints.forEach(cp => {
    rgh.fillStyle = '#a6a6a6';
    rgh.beginPath();
    rgh.ellipse(cp.x, cp.y, cp.r * 0.7, cp.r * 0.4, 0.3, 0, Math.PI * 2);
    rgh.fill();
  });
  // Dust areas ultra matte (~ 0.98)
  rgh.fillStyle = '#f5f5f5';
  rgh.fillRect(0, H - 350, W, 350);

  // --- Metalness Map (Pure Dielectric = 0.0) ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // --- Bump Map (High relief strata, fractures, veins) ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  // Strata ribs
  bmp.fillStyle = '#9c9c9c';
  for (let y = 10; y < H; y += 44) {
    bmp.fillRect(0, y, W, 8);
  }
  bmp.fillStyle = '#585858';
  for (let y = 30; y < H; y += 44) {
    bmp.fillRect(0, y, W, 6);
  }
  // Cleavage edges
  cleavagePoints.forEach(cp => {
    bmp.fillStyle = '#c0c0c0';
    bmp.beginPath();
    bmp.ellipse(cp.x, cp.y, cp.r * 0.6, cp.r * 0.35, 0.3, 0, Math.PI * 2);
    bmp.fill();
  });

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('quarry_rock', set);
  return set;
}

/* ==========================================================================
   2. DRESSED STONE BLOCKS & ASHLAR MASONRY (2048x2048)
   ========================================================================== */
export function getDressedStoneTextures() {
  if (textureCache.has('dressed_stone')) return textureCache.get('dressed_stone');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // We organize the canvas into 4 large ashlar blocks (2x2 grid) with drafted margins
  const blockW = W / 2;
  const blockH = H / 2;
  const marginSize = 90; // Medieval drafted margin border width

  for (let bx = 0; bx < 2; bx++) {
    for (let by = 0; by < 2; by++) {
      const x0 = bx * blockW;
      const y0 = by * blockH;
      const x1 = x0 + blockW;
      const y1 = y0 + blockH;

      // 1. Mortar Joint / Seam Border (Dark perimeter shadow)
      alb.fillStyle = '#3a3630';
      alb.fillRect(x0, y0, blockW, blockH);

      // 2. Drafted Margin (Chiseled perimeter bevel border)
      const marginPad = 12;
      const mGrad = alb.createLinearGradient(x0 + marginPad, y0 + marginPad, x1 - marginPad, y1 - marginPad);
      mGrad.addColorStop(0, '#d8d1bf');
      mGrad.addColorStop(0.5, '#bfb8a6');
      mGrad.addColorStop(1, '#9e9786');
      alb.fillStyle = mGrad;
      alb.fillRect(x0 + marginPad, y0 + marginPad, blockW - marginPad * 2, blockH - marginPad * 2);

      // Fine chisel combing in margin (fine perpendicular strokes)
      alb.fillStyle = 'rgba(70, 65, 58, 0.18)';
      // Top & bottom margin combing
      for (let mx = x0 + marginPad; mx < x1 - marginPad; mx += 14) {
        alb.fillRect(mx, y0 + marginPad, 3, marginSize);
        alb.fillRect(mx, y1 - marginPad - marginSize, 3, marginSize);
      }
      // Left & right margin combing
      for (let my = y0 + marginPad; my < y1 - marginPad; my += 14) {
        alb.fillRect(x0 + marginPad, my, marginSize, 3);
        alb.fillRect(x1 - marginPad - marginSize, my, marginSize, 3);
      }

      // 3. Central Pick-Dressed Sunken Panel
      const pX = x0 + marginPad + marginSize;
      const pY = y0 + marginPad + marginSize;
      const pW = blockW - (marginPad + marginSize) * 2;
      const pH = blockH - (marginPad + marginSize) * 2;

      // Drop shadow around sunken panel
      alb.fillStyle = 'rgba(30, 27, 23, 0.42)';
      alb.fillRect(pX - 6, pY - 6, pW + 12, pH + 12);

      // Center panel limestone base
      const pGrad = alb.createRadialGradient(pX + pW * 0.45, pY + pH * 0.4, pW * 0.1, pX + pW * 0.5, pY + pH * 0.5, pW * 0.7);
      pGrad.addColorStop(0, '#f2ece0'); // Bright limestone face
      pGrad.addColorStop(0.5, '#ded7c7');
      pGrad.addColorStop(0.85, '#c7bea9');
      pGrad.addColorStop(1.0, '#a89e8b');
      alb.fillStyle = pGrad;
      alb.fillRect(pX, pY, pW, pH);

      // Fine stippled pick dressing marks
      alb.fillStyle = 'rgba(60, 54, 46, 0.12)';
      for (let st = 0; st < 300; st++) {
        const sx = pX + Math.random() * pW;
        const sy = pY + Math.random() * pH;
        alb.fillRect(sx, sy, 4 + Math.random() * 3, 3 + Math.random() * 2);
      }

      // Sunlit top-left beveled highlight
      alb.strokeStyle = '#fffaf0';
      alb.lineWidth = 6;
      alb.beginPath();
      alb.moveTo(pX, pY + pH);
      alb.lineTo(pX, pY);
      alb.lineTo(pX + pW, pY);
      alb.stroke();

      // Shadowed bottom-right beveled edge
      alb.strokeStyle = 'rgba(50, 44, 38, 0.55)';
      alb.lineWidth = 6;
      alb.beginPath();
      alb.moveTo(pX + pW, pY);
      alb.lineTo(pX + pW, pY + pH);
      alb.lineTo(pX, pY + pH);
      alb.stroke();

      // 4. Distinct Stonemason Guild Marks in the 4 block centers
      const centerX = pX + pW * 0.5;
      const centerY = pY + pH * 0.5;
      if (bx === 0 && by === 0) {
        drawMasonMark(alb, centerX, centerY, 140, 'crossed_chisels');
      } else if (bx === 1 && by === 0) {
        drawMasonMark(alb, centerX, centerY, 130, 'hourglass_quarry');
      } else if (bx === 0 && by === 1) {
        drawMasonMark(alb, centerX, centerY, 130, 'crowned_chevron');
      } else {
        drawMasonMark(alb, centerX, centerY, 120, 'roman_numerals');
      }

      // Roughness Map
      // Perimeter margin: ~ 0.82
      rgh.fillStyle = '#d1d1d1';
      rgh.fillRect(x0, y0, blockW, blockH);
      // Center panel (honed stone): ~ 0.68
      rgh.fillStyle = '#adadad';
      rgh.fillRect(pX, pY, pW, pH);
      // Mason mark cuts: ~ 0.90
      rgh.fillStyle = '#e6e6e6';
      rgh.beginPath();
      rgh.arc(centerX, centerY, 70, 0, Math.PI * 2);
      rgh.fill();

      // Bump Map
      // Recessed mortar seam: dark
      bmp.fillStyle = '#404040';
      bmp.fillRect(x0, y0, blockW, blockH);
      // Raised drafted margin
      bmp.fillStyle = '#9e9e9e';
      bmp.fillRect(x0 + marginPad, y0 + marginPad, blockW - marginPad * 2, blockH - marginPad * 2);
      // Sunken center panel
      bmp.fillStyle = '#b0b0b0';
      bmp.fillRect(pX, pY, pW, pH);
      // Mason mark groove
      bmp.fillStyle = '#505050';
      bmp.beginPath();
      bmp.arc(centerX, centerY, 60, 0, Math.PI * 2);
      bmp.fill();
    }
  }

  // Metalness Map (Pure Dielectric = 0.0)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('dressed_stone', set);
  return set;
}

/* ==========================================================================
   3. CRANE TIMBER, TWISTED ROPES & IRON HOIST PULLEYS (2048x2048)
   ========================================================================== */
export function getCraneTimberRopeTextures() {
  if (textureCache.has('crane_timber_rope')) return textureCache.get('crane_timber_rope');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Layout:
  // Left 50% (x: 0 .. 1024): Heavy weathered mountain pine timber boom pole
  // Right 50% Top (x: 1024 .. 2048, y: 0 .. 1024): Twisted hemp rope wraps & coils
  // Right 50% Bottom (x: 1024 .. 2048, y: 1024 .. 2048): Forged iron straps, brackets & hoist pulley wheel

  // --- 1. Weathered Timber Boom Pole (Left Half) ---
  const tW = W * 0.5;
  const woodGrad = alb.createLinearGradient(0, 0, tW, 0);
  woodGrad.addColorStop(0.0, '#53341b');
  woodGrad.addColorStop(0.2, '#7b522e');
  woodGrad.addColorStop(0.5, '#99673b');
  woodGrad.addColorStop(0.8, '#6d4524');
  woodGrad.addColorStop(1.0, '#452b14');
  alb.fillStyle = woodGrad;
  alb.fillRect(0, 0, tW, H);

  // Vertical wood grain lines
  alb.fillStyle = 'rgba(255, 230, 195, 0.11)';
  for (let x = 6; x < tW; x += 16) {
    alb.fillRect(x, 0, 4 + (x % 3), H);
  }
  alb.fillStyle = 'rgba(40, 22, 10, 0.22)';
  for (let x = 14; x < tW; x += 22) {
    alb.fillRect(x, 0, 3 + (x % 4), H);
  }

  // Timber knots & drying splits (checks)
  const knots = [
    { x: tW * 0.35, y: 350, rx: 65, ry: 45 },
    { x: tW * 0.65, y: 920, rx: 75, ry: 50 },
    { x: tW * 0.4, y: 1550, rx: 80, ry: 55 }
  ];
  knots.forEach(k => {
    // Knot rings
    for (let ring = 4; ring >= 1; ring--) {
      alb.fillStyle = ring % 2 === 0 ? '#381c08' : '#7a4922';
      alb.beginPath();
      alb.ellipse(k.x, k.y, k.rx * (ring / 4), k.ry * (ring / 4), 0.2, 0, Math.PI * 2);
      alb.fill();
    }
    // Radial drying split
    alb.strokeStyle = '#200e04';
    alb.lineWidth = 6;
    alb.beginPath();
    alb.moveTo(k.x, k.y - k.ry * 1.4);
    alb.lineTo(k.x, k.y + k.ry * 1.5);
    alb.stroke();
  });

  // Heavy Iron Reinforcement Straps across timber (at y: 200, 750, 1300, 1850)
  const strapYList = [180, 720, 1260, 1800];
  strapYList.forEach(sy => {
    // Strap shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.6)';
    alb.fillRect(0, sy - 6, tW, 92);

    // Iron plate body
    const sGrad = alb.createLinearGradient(0, sy, 0, sy + 80);
    sGrad.addColorStop(0, '#5f6770');
    sGrad.addColorStop(0.3, '#3f454c');
    sGrad.addColorStop(0.7, '#282c31');
    sGrad.addColorStop(1, '#191b1e');
    alb.fillStyle = sGrad;
    alb.fillRect(0, sy, tW, 80);

    // Plate highlight rim
    alb.fillStyle = 'rgba(255, 255, 255, 0.4)';
    alb.fillRect(0, sy, tW, 3.5);
    alb.fillStyle = 'rgba(0, 0, 0, 0.7)';
    alb.fillRect(0, sy + 77, tW, 3);

    // Square forged bolts across strap
    for (let bx = 90; bx < tW - 40; bx += 140) {
      drawSquareBolt(alb, bx, sy + 40, 22, true);
    }
  });

  // --- 2. Twisted Hemp Rope Rigging (Right Top Quadrant) ---
  const rX = W * 0.5;
  const rW = W * 0.5;
  const rH = H * 0.5;

  // Base rope core
  const ropeBaseGrad = alb.createLinearGradient(rX, 0, rX + rW, 0);
  ropeBaseGrad.addColorStop(0.0, '#785329');
  ropeBaseGrad.addColorStop(0.5, '#ad804b');
  ropeBaseGrad.addColorStop(1.0, '#593a18');
  alb.fillStyle = ropeBaseGrad;
  alb.fillRect(rX, 0, rW, rH);

  // Repeating diagonal helical rope coils
  const strandPitch = 55;
  for (let offset = -rH; offset < rW + rH; offset += strandPitch) {
    // Deep groove between twists
    alb.strokeStyle = '#321f0b';
    alb.lineWidth = 14;
    alb.beginPath();
    alb.moveTo(rX + offset, 0);
    alb.lineTo(rX + offset + rH * 0.75, rH);
    alb.stroke();

    // Cylindrical strand highlight
    const strandGrad = alb.createLinearGradient(rX + offset + 8, 0, rX + offset + 35, 0);
    strandGrad.addColorStop(0, '#be945b');
    strandGrad.addColorStop(0.4, '#e5c48b');
    strandGrad.addColorStop(0.8, '#d4ae72');
    strandGrad.addColorStop(1, '#946c37');
    alb.strokeStyle = strandGrad;
    alb.lineWidth = 26;
    alb.beginPath();
    alb.moveTo(rX + offset + 22, 0);
    alb.lineTo(rX + offset + rH * 0.75 + 22, rH);
    alb.stroke();

    // Fine hemp fibers
    alb.strokeStyle = 'rgba(255, 248, 230, 0.4)';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(rX + offset + 24, 0);
    alb.lineTo(rX + offset + rH * 0.75 + 24, rH);
    alb.stroke();
  }

  // --- 3. Forged Iron Hoist Pulley & Hardware (Right Bottom Quadrant) ---
  const pX = W * 0.5;
  const pY = H * 0.5;
  const pW = W * 0.5;
  const pH = H * 0.5;

  // Iron plate backdrop
  const ironBgGrad = alb.createRadialGradient(pX + pW * 0.5, pY + pH * 0.5, 80, pX + pW * 0.5, pY + pH * 0.5, pW * 0.65);
  ironBgGrad.addColorStop(0, '#535b63');
  ironBgGrad.addColorStop(0.5, '#383e44');
  ironBgGrad.addColorStop(0.85, '#22262a');
  ironBgGrad.addColorStop(1, '#131517');
  alb.fillStyle = ironBgGrad;
  alb.fillRect(pX, pY, pW, pH);

  // Cast Iron Hoist Pulley Wheel
  const wheelCX = pX + pW * 0.5;
  const wheelCY = pY + pH * 0.5;
  const wheelR = pW * 0.38;

  // Outer groove rim
  alb.fillStyle = 'rgba(0, 0, 0, 0.6)';
  alb.beginPath();
  alb.arc(wheelCX + 6, wheelCY + 8, wheelR, 0, Math.PI * 2);
  alb.fill();

  const wheelGrad = alb.createRadialGradient(wheelCX - wheelR * 0.3, wheelCY - wheelR * 0.3, 20, wheelCX, wheelCY, wheelR);
  wheelGrad.addColorStop(0, '#8d959e');
  wheelGrad.addColorStop(0.4, '#575f68');
  wheelGrad.addColorStop(0.7, '#353a40');
  wheelGrad.addColorStop(1, '#1b1d20');
  alb.fillStyle = wheelGrad;
  alb.beginPath();
  alb.arc(wheelCX, wheelCY, wheelR, 0, Math.PI * 2);
  alb.fill();

  // Pulley rope groove ring
  alb.strokeStyle = '#121416';
  alb.lineWidth = 18;
  alb.beginPath();
  alb.arc(wheelCX, wheelCY, wheelR * 0.85, 0, Math.PI * 2);
  alb.stroke();

  // Spoke cutouts (4 industrial forged spokes)
  alb.fillStyle = '#1e2124';
  for (let sp = 0; sp < 4; sp++) {
    const angle = (sp * Math.PI) / 2 + Math.PI / 4;
    const sx = wheelCX + Math.cos(angle) * wheelR * 0.5;
    const sy = wheelCY + Math.sin(angle) * wheelR * 0.5;
    alb.beginPath();
    alb.arc(sx, sy, wheelR * 0.2, 0, Math.PI * 2);
    alb.fill();
  }

  // Golden Brass Center Axle Bushing & Heavy Nut
  const hubGrad = alb.createRadialGradient(wheelCX - 15, wheelCY - 15, 5, wheelCX, wheelCY, 65);
  hubGrad.addColorStop(0, '#fef08a');
  hubGrad.addColorStop(0.3, '#f59e0b');
  hubGrad.addColorStop(0.7, '#b45309');
  hubGrad.addColorStop(1, '#78350f');
  alb.fillStyle = hubGrad;
  alb.beginPath();
  alb.arc(wheelCX, wheelCY, 65, 0, Math.PI * 2);
  alb.fill();

  // Center axle pin
  alb.fillStyle = '#1c1917';
  alb.beginPath();
  alb.arc(wheelCX, wheelCY, 24, 0, Math.PI * 2);
  alb.fill();

  // --- Roughness Map ---
  // Timber: ~ 0.76
  rgh.fillStyle = '#c2c2c2';
  rgh.fillRect(0, 0, tW, H);
  // Rope: ~ 0.86
  rgh.fillStyle = '#dbdbdb';
  rgh.fillRect(rX, 0, rW, rH);
  // Iron plates & pulley: ~ 0.38
  rgh.fillStyle = '#616161';
  rgh.fillRect(pX, pY, pW, pH);
  // Iron straps on timber
  strapYList.forEach(sy => {
    rgh.fillStyle = '#5c5c5c';
    rgh.fillRect(0, sy, tW, 80);
  });
  // Brass bushing: ~ 0.30
  rgh.fillStyle = '#4d4d4d';
  rgh.beginPath();
  rgh.arc(wheelCX, wheelCY, 65, 0, Math.PI * 2);
  rgh.fill();

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  // Iron straps on timber: ~ 0.82
  strapYList.forEach(sy => {
    met.fillStyle = '#d1d1d1';
    met.fillRect(0, sy, tW, 80);
  });
  // Iron hardware quadrant: ~ 0.85
  met.fillStyle = '#d9d9d9';
  met.fillRect(pX, pY, pW, pH);
  // Brass bushing: ~ 0.92
  met.fillStyle = '#ebebeb';
  met.beginPath();
  met.arc(wheelCX, wheelCY, 65, 0, Math.PI * 2);
  met.fill();

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  // Wood grain ridges
  bmp.fillStyle = '#8f8f8f';
  for (let x = 6; x < tW; x += 32) bmp.fillRect(x, 0, 8, H);
  // Straps raised
  strapYList.forEach(sy => {
    bmp.fillStyle = '#b5b5b5';
    bmp.fillRect(0, sy, tW, 80);
    for (let bx = 90; bx < tW - 40; bx += 140) {
      bmp.fillStyle = '#e0e0e0';
      bmp.fillRect(bx - 12, sy + 28, 24, 24);
    }
  });
  // Rope spiral relief
  for (let offset = -rH; offset < rW + rH; offset += strandPitch) {
    bmp.fillStyle = '#adadad';
    bmp.fillRect(rX + offset + 12, 0, 20, rH);
  }
  // Pulley hub
  bmp.fillStyle = '#dcdcdc';
  bmp.beginPath();
  bmp.arc(wheelCX, wheelCY, 65, 0, Math.PI * 2);
  bmp.fill();

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('crane_timber_rope', set);
  return set;
}

/* ==========================================================================
   4. QUARRY WORKER TOOLS, PALLETS & RUBBLE (2048x2048)
   ========================================================================== */
export function getQuarryToolsTextures() {
  if (textureCache.has('quarry_tools')) return textureCache.get('quarry_tools');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Layout:
  // Top Half (y: 0 .. 1024): Wooden Pallet Slats & Wheelbarrow Planks with Iron Nails
  // Bottom Half (y: 1024 .. 2048): Forged Steel Tool Heads (Sledgehammer, Pry Bars) & Rubble Stone

  // --- 1. Pallet & Wheelbarrow Planks (Top Half) ---
  const plankH = 170;
  for (let y = 0; y < 1024; y += plankH) {
    // Plank seam / gap
    alb.fillStyle = '#2d1e12';
    alb.fillRect(0, y, W, plankH);

    // Wood plank body
    const pGrad = alb.createLinearGradient(0, y + 6, 0, y + plankH - 6);
    pGrad.addColorStop(0, '#9c7349');
    pGrad.addColorStop(0.3, '#bd9164');
    pGrad.addColorStop(0.7, '#8f653b');
    pGrad.addColorStop(1, '#664221');
    alb.fillStyle = pGrad;
    alb.fillRect(0, y + 6, W, plankH - 12);

    // Wood grain lines
    alb.fillStyle = 'rgba(255, 235, 205, 0.12)';
    for (let x = 8; x < W; x += 18) {
      alb.fillRect(x, y + 6, 3, plankH - 12);
    }
    alb.fillStyle = 'rgba(35, 20, 10, 0.15)';
    for (let x = 16; x < W; x += 26) {
      alb.fillRect(x, y + 6, 4, plankH - 12);
    }

    // Hand-forged iron nails along plank ends and joists
    for (let nx = 70; nx < W; nx += 220) {
      drawSquareBolt(alb, nx, y + plankH * 0.5, 15, true);
    }

    // Stone dust accumulation scuffs on wood
    alb.fillStyle = 'rgba(230, 225, 215, 0.22)';
    for (let s = 0; s < 12; s++) {
      const sx = Math.random() * W;
      const sy = y + 15 + Math.random() * (plankH - 30);
      alb.fillRect(sx, sy, 35 + Math.random() * 50, 8 + Math.random() * 12);
    }
  }

  // --- 2. Forged Steel Tool Heads & Dark Iron (Bottom Half Left: x 0..1024, y 1024..2048) ---
  const toolGrad = alb.createLinearGradient(0, 1024, 1024, 2048);
  toolGrad.addColorStop(0, '#5f6770');
  toolGrad.addColorStop(0.3, '#434950');
  toolGrad.addColorStop(0.7, '#2a2f34');
  toolGrad.addColorStop(1, '#181b1e');
  alb.fillStyle = toolGrad;
  alb.fillRect(0, 1024, 1024, 1024);

  // Hammer face strike gouges & chipped metal highlights
  alb.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let i = 0; i < 40; i++) {
    const gx = Math.random() * 1024;
    const gy = 1024 + Math.random() * 1024;
    alb.fillRect(gx, gy, 12 + Math.random() * 20, 3);
  }
  // Beveled edge highlights
  alb.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  alb.lineWidth = 5;
  alb.strokeRect(30, 1054, 964, 964);

  // --- 3. Crushed Limestone Rubble & Stone Chips (Bottom Half Right: x 1024..2048, y 1024..2048) ---
  const rubbleGrad = alb.createRadialGradient(1536, 1536, 100, 1536, 1536, 600);
  rubbleGrad.addColorStop(0, '#ded7c8');
  rubbleGrad.addColorStop(0.5, '#b8b09f');
  rubbleGrad.addColorStop(1, '#7a756b');
  alb.fillStyle = rubbleGrad;
  alb.fillRect(1024, 1024, 1024, 1024);

  // Individual sharp angular stone chips
  for (let c = 0; c < 120; c++) {
    const cx = 1050 + Math.random() * 940;
    const cy = 1050 + Math.random() * 940;
    const sz = 15 + Math.random() * 35;

    alb.fillStyle = 'rgba(30, 27, 24, 0.45)';
    alb.fillRect(cx + 3, cy + 4, sz, sz);

    alb.fillStyle = c % 2 === 0 ? '#ebe4d5' : '#a39b8c';
    alb.beginPath();
    alb.moveTo(cx, cy);
    alb.lineTo(cx + sz, cy + sz * 0.2);
    alb.lineTo(cx + sz * 0.7, cy + sz);
    alb.lineTo(cx - sz * 0.2, cy + sz * 0.8);
    alb.closePath();
    alb.fill();

    alb.strokeStyle = '#ffffff';
    alb.lineWidth = 2.5;
    alb.stroke();
  }

  // --- Roughness Map ---
  // Wood: ~ 0.74
  rgh.fillStyle = '#bdbdbd';
  rgh.fillRect(0, 0, W, 1024);
  // Tool steel: ~ 0.36
  rgh.fillStyle = '#5c5c5c';
  rgh.fillRect(0, 1024, 1024, 1024);
  // Rubble chips: ~ 0.90
  rgh.fillStyle = '#e6e6e6';
  rgh.fillRect(1024, 1024, 1024, 1024);

  // --- Metalness Map ---
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  // Steel tool heads: ~ 0.85
  met.fillStyle = '#d9d9d9';
  met.fillRect(0, 1024, 1024, 1024);
  // Nail heads on planks
  for (let y = 0; y < 1024; y += plankH) {
    for (let nx = 70; nx < W; nx += 220) {
      met.fillRect(nx - 10, y + plankH * 0.5 - 10, 20, 20);
    }
  }

  // --- Bump Map ---
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  // Plank relief
  for (let y = 0; y < 1024; y += plankH) {
    bmp.fillStyle = '#505050';
    bmp.fillRect(0, y, W, 8);
    bmp.fillStyle = '#9e9e9e';
    bmp.fillRect(0, y + 8, W, plankH - 16);
  }
  // Tool bevels
  bmp.fillStyle = '#a6a6a6';
  bmp.fillRect(0, 1024, 1024, 1024);
  // Rubble bumps
  bmp.fillStyle = '#cccccc';
  for (let c = 0; c < 60; c++) {
    const rx = 1060 + Math.random() * 920;
    const ry = 1060 + Math.random() * 920;
    bmp.fillRect(rx, ry, 25, 25);
  }

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('quarry_tools', set);
  return set;
}

/**
 * Clear procedural texture cache
 */
export function clearStoneQuarryTextureCache() {
  textureCache.clear();
}
