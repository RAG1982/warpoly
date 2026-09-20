import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Farm (Fazenda de Trigo)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 * 
 * Generates high-resolution (2048x2048) PBR texture sets (albedo, roughness, metalness, bump):
 * 1. getTilledSoilTextures(): Rich dark moist fertile earth with plowed furrow ridges, mulch, soil clods & weed sprouts.
 * 2. getWheatCropsTextures(): Stylized golden ripe wheat ears with sunny rim highlights, wheat sheaves & hay bales with hemp ties.
 * 3. getBarnTimberTextures(): Weathered rustic oak/pine planks with knots, iron strap hinges, Z-braces, nails & timber beams.
 * 4. getThatchRoofTextures(): Layered straw/reed thatch with stepped echelons, reed fibers, and cross-spar ridge comb.
 * 5. getFenceWoodTextures(): Rough-hewn cedar split rails, mortised timber posts, axe facets, and polished tool handles.
 * 6. getStoneWellTextures(): Rounded river cobblestones with sandy mortar, chiseled rim cap, deep well water & iron crank.
 * 7. getBurlapPropsTextures(): Heavy woven burlap grain sacks with stitched seams, stamped wheat mill emblem & forged iron tools.
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

// Pseudo-random deterministic generator for consistent painterly variation
function pseudoRandom(seed) {
  let s = Math.sin(seed) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Helper: Safe roundRect with fallback for environments lacking native ctx.roundRect
 */
function drawRoundRect(ctx, x, y, w, h, r = 8) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
}


/**
 * Helper: Draw stylized iron square nail or rivet with drop shadow and specular dome
 */
function drawNail(ctx, cx, cy, size = 10, isSquare = true) {
  ctx.save();
  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  if (isSquare) {
    ctx.fillRect(cx - size / 2 + 2, cy - size / 2 + 2, size, size);
  } else {
    ctx.arc(cx + 2, cy + 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Base metal
  ctx.fillStyle = '#1e242d';
  if (isSquare) {
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Specular facet highlight
  ctx.fillStyle = '#64748b';
  if (isSquare) {
    ctx.beginPath();
    ctx.moveTo(cx - size / 2, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy - size / 2);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(cx - size * 0.15, cy - size * 0.15, size * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle rust halo
  ctx.fillStyle = 'rgba(120, 53, 15, 0.25)';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * ----------------------------------------------------------------------------
 * 1. TILLED SOIL & FURROWS TEXTURE (Planted crop field & farm base)
 * ----------------------------------------------------------------------------
 */
export function getTilledSoilTextures() {
  if (textureCache.has('tilledSoil')) return textureCache.get('tilledSoil');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Metalness is completely zero for organic soil
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // 1. Deep fertile loam base gradient
  const soilBaseGrad = ctx.createLinearGradient(0, 0, width, height);
  soilBaseGrad.addColorStop(0, '#2d180c');
  soilBaseGrad.addColorStop(0.5, '#3b2214');
  soilBaseGrad.addColorStop(1, '#27150a');
  ctx.fillStyle = soilBaseGrad;
  ctx.fillRect(0, 0, width, height);

  // Roughness: very rough matte earth (0.85 - 0.95)
  rCtx.fillStyle = '#dcdcdc';
  rCtx.fillRect(0, 0, width, height);

  // Bump neutral base
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // 2. Organic earth grain & mottled soil patches
  for (let i = 0; i < 400; i++) {
    const rx = (pseudoRandom(i * 1.1) * width) | 0;
    const ry = (pseudoRandom(i * 2.3) * height) | 0;
    const rad = 25 + pseudoRandom(i * 3.7) * 75;
    const alpha = 0.12 + pseudoRandom(i * 4.2) * 0.18;
    const isDark = pseudoRandom(i * 5.9) > 0.45;

    ctx.save();
    ctx.fillStyle = isDark ? `rgba(22, 11, 5, ${alpha})` : `rgba(88, 54, 32, ${alpha})`;
    ctx.beginPath();
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Plowed furrows (horizontal parallel wavy ridges and dark moisture trenches)
  const furrowSpacing = 128;
  const numFurrows = (height / furrowSpacing) | 0;

  for (let f = 0; f < numFurrows; f++) {
    const yBase = f * furrowSpacing + furrowSpacing * 0.5;

    // A. Trench shadow trough (recessed, moist, darker)
    ctx.save();
    ctx.fillStyle = '#180c05';
    ctx.beginPath();
    ctx.moveTo(0, yBase - 25);
    for (let x = 0; x <= width; x += 64) {
      const wave = Math.sin(x * 0.02 + f) * 6 + Math.cos(x * 0.05) * 4;
      ctx.lineTo(x, yBase - 15 + wave);
    }
    ctx.lineTo(width, yBase + 25);
    ctx.lineTo(0, yBase + 25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Bump for trench
    bCtx.fillStyle = '#404040';
    bCtx.fillRect(0, yBase - 18, width, 36);

    // Roughness for trench bottom (moister, slightly shinier = 0.65)
    rCtx.fillStyle = '#a0a0a0';
    rCtx.fillRect(0, yBase - 15, width, 30);

    // B. Raised Furrow Mound Ridge (warm sun-kissed soil)
    const ridgeY = yBase + furrowSpacing * 0.5;
    const ridgeGrad = ctx.createLinearGradient(0, ridgeY - 35, 0, ridgeY + 35);
    ridgeGrad.addColorStop(0, '#4a2c18');
    ridgeGrad.addColorStop(0.35, '#6a4327');
    ridgeGrad.addColorStop(0.5, '#7c5030'); // Crest highlight
    ridgeGrad.addColorStop(0.7, '#59361e');
    ridgeGrad.addColorStop(1, '#331d0f');

    ctx.save();
    ctx.fillStyle = ridgeGrad;
    ctx.beginPath();
    ctx.moveTo(0, ridgeY - 35);
    for (let x = 0; x <= width; x += 48) {
      const wave = Math.sin(x * 0.015 + f * 2.1) * 8 + Math.cos(x * 0.04) * 5;
      ctx.lineTo(x, ridgeY + wave);
    }
    ctx.lineTo(width, ridgeY + 35);
    ctx.lineTo(0, ridgeY + 35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Crest highlight line
    ctx.save();
    ctx.strokeStyle = '#8d5d39';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 32) {
      const wave = Math.sin(x * 0.015 + f * 2.1) * 8 + Math.cos(x * 0.04) * 5;
      if (x === 0) ctx.moveTo(x, ridgeY + wave - 4);
      else ctx.lineTo(x, ridgeY + wave - 4);
    }
    ctx.stroke();
    ctx.restore();

    // Ridge bump
    bCtx.fillStyle = '#c0c0c0';
    bCtx.fillRect(0, ridgeY - 14, width, 28);
  }

  // 4. Stylized Soil Clods, Mulch Stems, and Tiny Green Sprouts
  for (let k = 0; k < 600; k++) {
    const cx = (pseudoRandom(k * 4.3) * width) | 0;
    const cy = (pseudoRandom(k * 7.1) * height) | 0;
    const cSize = 6 + (pseudoRandom(k * 1.9) * 16) | 0;

    // Soil Clod with shadow & light rim
    ctx.save();
    ctx.fillStyle = 'rgba(18, 9, 4, 0.7)';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 4, cSize, cSize * 0.75, pseudoRandom(k) * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pseudoRandom(k) > 0.5 ? '#57341e' : '#6f4528';
    ctx.beginPath();
    ctx.ellipse(cx, cy, cSize, cSize * 0.75, pseudoRandom(k) * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    // Specular top highlight on clod
    ctx.fillStyle = '#8f5c38';
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy - 2, cSize * 0.5, cSize * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bump for clod
    bCtx.fillStyle = '#e8e8e8';
    bCtx.fillRect(cx - cSize / 2, cy - cSize / 2, cSize, cSize);
  }

  // 5. Scattered golden straw mulch fragments
  for (let m = 0; m < 250; m++) {
    const mx = (pseudoRandom(m * 8.2) * width) | 0;
    const my = (pseudoRandom(m * 3.4) * height) | 0;
    const mLen = 15 + pseudoRandom(m * 5.1) * 30;
    const mAngle = pseudoRandom(m * 9.7) * Math.PI;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(mAngle);
    ctx.fillStyle = 'rgba(15, 8, 3, 0.5)';
    ctx.fillRect(2, 2, mLen, 3);
    ctx.fillStyle = pseudoRandom(m) > 0.5 ? '#d97706' : '#f59e0b';
    ctx.fillRect(0, 0, mLen, 3);
    ctx.restore();
  }

  // 6. Tiny fresh green weed sprouts / clover seedlings
  for (let s = 0; s < 120; s++) {
    const sx = (pseudoRandom(s * 11.2) * width) | 0;
    const sy = (pseudoRandom(s * 13.9) * height) | 0;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = '#3f7823';
    ctx.beginPath();
    ctx.ellipse(-3, -3, 5, 3, -0.4, 0, Math.PI * 2);
    ctx.ellipse(3, -3, 5, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.ellipse(-3, -3, 3, 2, -0.4, 0, Math.PI * 2);
    ctx.ellipse(3, -3, 3, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const texSet = {
    map: toTexture(albedo, true, 2, 2),
    roughnessMap: toTexture(rough, false, 2, 2),
    metalnessMap: toTexture(metal, false, 2, 2),
    bumpMap: toTexture(bump, false, 2, 2)
  };

  textureCache.set('tilledSoil', texSet);
  return texSet;
}

/**
 * ----------------------------------------------------------------------------
 * 2. GOLDEN RIPE WHEAT TEXTURE (Stalks, ears, sheaves & hay bales)
 * ----------------------------------------------------------------------------
 */
export function getWheatCropsTextures() {
  if (textureCache.has('wheatCrops')) return textureCache.get('wheatCrops');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // Warm sun-gilded golden gradient base
  const wheatGrad = ctx.createLinearGradient(0, 0, width, height);
  wheatGrad.addColorStop(0, '#b45309');
  wheatGrad.addColorStop(0.3, '#d97706');
  wheatGrad.addColorStop(0.7, '#f59e0b');
  wheatGrad.addColorStop(1, '#eab308');
  ctx.fillStyle = wheatGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#b8b8b8'; // 0.72 roughness
  rCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Dense vertical straw fiber striations
  for (let x = 0; x < width; x += 4) {
    const toneRand = pseudoRandom(x * 3.7);
    ctx.fillStyle = toneRand > 0.6 ? '#fef08a' : (toneRand > 0.3 ? '#fbbf24' : '#b45309');
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, 0, 2, height);
    ctx.globalAlpha = 1.0;
  }

  // Wheat Ear Braids (Hand-painted kernel tiers in column panels)
  const numColumns = 6;
  const colW = width / numColumns;

  for (let c = 0; c < numColumns; c++) {
    const cx = c * colW + colW / 2;

    // Central stalk stem
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx - 3, 0, 6, height);

    // Overlapping braided kernels alternating left & right
    const kernelHeight = 64;
    const numKernels = (height / kernelHeight) | 0;

    for (let k = 0; k < numKernels; k++) {
      const ky = k * kernelHeight + 20;
      const isLeft = k % 2 === 0;
      const kx = isLeft ? cx - 35 : cx + 5;
      const kAngle = isLeft ? -0.35 : 0.35;

      ctx.save();
      ctx.translate(kx + 20, ky + 15);
      ctx.rotate(kAngle);

      // Kernel shadow
      ctx.fillStyle = 'rgba(120, 53, 15, 0.65)';
      ctx.beginPath();
      ctx.ellipse(3, 4, 32, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Golden kernel body
      const kernGrad = ctx.createLinearGradient(-30, -15, 30, 15);
      kernGrad.addColorStop(0, '#fef08a');
      kernGrad.addColorStop(0.4, '#fbbf24');
      kernGrad.addColorStop(0.8, '#d97706');
      kernGrad.addColorStop(1, '#92400e');
      ctx.fillStyle = kernGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Top edge sun highlight
      ctx.strokeStyle = '#fffbeb';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -5, 20, Math.PI, Math.PI * 2);
      ctx.stroke();

      // Long fine golden awn (wheat bristle) shooting upwards
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(15, -5);
      ctx.quadraticCurveTo(35, -35, 45, -70);
      ctx.stroke();

      ctx.restore();

      // Bump for kernel
      bCtx.fillStyle = '#dcdcdc';
      bCtx.fillRect(cx - 40, ky, 80, kernelHeight - 10);
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(cx - 40, ky + kernelHeight - 12, 80, 8);
    }
  }

  // Hemp/Twine Sheaf Tie Bands (wrapped cross bands for hay bales & sheaves)
  const tieBands = [height * 0.28, height * 0.72];
  tieBands.forEach(by => {
    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, by + 28, width, 14);

    // Hemp rope base
    const ropeGrad = ctx.createLinearGradient(0, by, 0, by + 28);
    ropeGrad.addColorStop(0, '#d6be96');
    ropeGrad.addColorStop(0.5, '#a47e52');
    ropeGrad.addColorStop(1, '#654425');
    ctx.fillStyle = ropeGrad;
    ctx.fillRect(0, by, width, 28);

    // Twisted rope strands
    for (let rx = 0; rx < width; rx += 18) {
      ctx.strokeStyle = '#e7d8bc';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(rx, by + 26);
      ctx.lineTo(rx + 12, by + 2);
      ctx.stroke();

      ctx.strokeStyle = '#4e3318';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx + 14, by + 28);
      ctx.lineTo(rx + 26, by + 4);
      ctx.stroke();
    }

    // Knot and dangling rope ends in middle
    const kx = width * 0.5;
    ctx.fillStyle = '#946f45';
    ctx.beginPath();
    ctx.arc(kx, by + 14, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f2e4cb';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.restore();

    bCtx.fillStyle = '#f0f0f0';
    bCtx.fillRect(0, by, width, 28);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(0, by + 28, width, 14);
  });

  const texSet = {
    map: toTexture(albedo, true, 1, 1),
    roughnessMap: toTexture(rough, false, 1, 1),
    metalnessMap: toTexture(metal, false, 1, 1),
    bumpMap: toTexture(bump, false, 1, 1)
  };

  textureCache.set('wheatCrops', texSet);
  return texSet;
}

/**
 * ----------------------------------------------------------------------------
 * 3. BARN TIMBER & WEATHERED PLANKS TEXTURE (Walls, doors, beams & lean-to)
 * ----------------------------------------------------------------------------
 */
export function getBarnTimberTextures() {
  if (textureCache.has('barnTimber')) return textureCache.get('barnTimber');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Warm rich rustic timber base
  ctx.fillStyle = '#53341e';
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#c0c0c0'; // ~0.75 roughness
  rCtx.fillRect(0, 0, width, height);

  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Vertical Planks
  const plankW = 160;
  const numPlanks = (width / plankW) | 0;

  for (let p = 0; p < numPlanks; p++) {
    const px = p * plankW;
    const toneOffset = (pseudoRandom(p * 2.8) - 0.5) * 30;

    // Plank base gradient (subtle bevel and individual hue variation)
    const pGrad = ctx.createLinearGradient(px, 0, px + plankW, 0);
    const rBase = Math.min(255, Math.max(0, 95 + toneOffset));
    const gBase = Math.min(255, Math.max(0, 60 + toneOffset * 0.7));
    const bBase = Math.min(255, Math.max(0, 36 + toneOffset * 0.4));

    pGrad.addColorStop(0, `rgb(${rBase - 25}, ${gBase - 18}, ${bBase - 12})`);
    pGrad.addColorStop(0.08, `rgb(${rBase + 20}, ${gBase + 16}, ${bBase + 10})`); // Left bevel highlight
    pGrad.addColorStop(0.5, `rgb(${rBase}, ${gBase}, ${bBase})`);
    pGrad.addColorStop(0.92, `rgb(${rBase - 10}, ${gBase - 8}, ${bBase - 6})`);
    pGrad.addColorStop(1, `rgb(${rBase - 35}, ${gBase - 25}, ${bBase - 18})`); // Right recessed shadow

    ctx.fillStyle = pGrad;
    ctx.fillRect(px, 0, plankW, height);

    // Hand-painted fine wood grain lines
    const numGrains = 20;
    for (let g = 0; g < numGrains; g++) {
      const gx = px + (g / numGrains) * plankW;
      const grainDark = pseudoRandom(p * 10 + g) > 0.5;

      ctx.save();
      ctx.strokeStyle = grainDark ? 'rgba(35, 18, 9, 0.35)' : 'rgba(165, 115, 75, 0.28)';
      ctx.lineWidth = 1.5 + pseudoRandom(g) * 2;
      ctx.beginPath();
      ctx.moveTo(gx, 0);

      // Wavy natural grain path with occasional knot deflection
      const knotY = 300 + pseudoRandom(p * 7 + g) * (height - 600);
      const hasKnot = g % 7 === 3;

      for (let y = 0; y <= height; y += 80) {
        let xDisp = Math.sin(y * 0.015 + p) * 5;
        if (hasKnot && Math.abs(y - knotY) < 180) {
          const dist = (y - knotY) / 180;
          xDisp += (1 - dist * dist) * (g % 2 === 0 ? 30 : -30);
        }
        ctx.lineTo(gx + xDisp, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Knothole with concentric grain rings
    if (p % 2 === 1) {
      const ky = 400 + pseudoRandom(p * 5.7) * 1200;
      const kx = px + plankW * 0.5 + (pseudoRandom(p * 3.3) - 0.5) * 40;
      const kRad = 18 + pseudoRandom(p) * 14;

      // Knot shadow halo
      ctx.fillStyle = '#231207';
      ctx.beginPath();
      ctx.ellipse(kx, ky, kRad, kRad * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Knot core
      ctx.fillStyle = '#140a04';
      ctx.beginPath();
      ctx.ellipse(kx, ky, kRad * 0.6, kRad * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Outer rings
      ctx.strokeStyle = '#82522e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kRad * 1.5, kRad * 1.9, 0, 0, Math.PI * 2);
      ctx.stroke();

      bCtx.fillStyle = '#202020';
      bCtx.fillRect(kx - kRad, ky - kRad, kRad * 2, kRad * 2);
    }

    // Plank edge bevel highlights and recessed seam gap
    // Left edge highlight
    ctx.fillStyle = 'rgba(195, 145, 100, 0.45)';
    ctx.fillRect(px + 1, 0, 3, height);

    // Deep plank joint groove
    ctx.fillStyle = '#180c05';
    ctx.fillRect(px + plankW - 4, 0, 5, height);

    bCtx.fillStyle = '#d0d0d0';
    bCtx.fillRect(px + 1, 0, 4, height);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(px + plankW - 4, 0, 5, height);

    // Hand-forged iron nails along top, middle, and bottom beams
    const nailYs = [70, height * 0.35, height * 0.65, height - 70];
    nailYs.forEach(ny => {
      drawNail(ctx, px + plankW * 0.28, ny, 10, true);
      drawNail(ctx, px + plankW * 0.72, ny, 10, true);

      // Metallic nail heads
      mCtx.fillStyle = '#d0d0d0';
      mCtx.fillRect(px + plankW * 0.28 - 5, ny - 5, 10, 10);
      mCtx.fillRect(px + plankW * 0.72 - 5, ny - 5, 10, 10);
      rCtx.fillStyle = '#606060';
      rCtx.fillRect(px + plankW * 0.28 - 5, ny - 5, 10, 10);
      rCtx.fillRect(px + plankW * 0.72 - 5, ny - 5, 10, 10);
    });
  }

  // Heavy Forged Iron Door Strap Hinges in lower portion of texture
  const hingeYs = [height * 0.42, height * 0.88];
  hingeYs.forEach(hy => {
    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(40, hy + 6, 750, 48);

    // Forged iron strap
    const hGrad = ctx.createLinearGradient(0, hy, 0, hy + 48);
    hGrad.addColorStop(0, '#475569');
    hGrad.addColorStop(0.3, '#1e293b');
    hGrad.addColorStop(0.8, '#0f172a');
    hGrad.addColorStop(1, '#020617');
    ctx.fillStyle = hGrad;
    ctx.fillRect(40, hy, 700, 44);

    // Spearhead / fleur finial at strap end
    ctx.beginPath();
    ctx.moveTo(740, hy - 14);
    ctx.lineTo(820, hy + 22);
    ctx.lineTo(740, hy + 58);
    ctx.closePath();
    ctx.fill();

    // Specular edge highlights on hinge
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, hy, 700, 44);

    // Heavy iron dome rivets along hinge
    for (let rx = 90; rx <= 680; rx += 140) {
      drawNail(ctx, rx, hy + 22, 18, false);
      mCtx.fillStyle = '#e2e8f0';
      mCtx.beginPath();
      mCtx.arc(rx, hy + 22, 9, 0, Math.PI * 2);
      mCtx.fill();
    }

    // Metalness & Roughness for hinge
    mCtx.fillStyle = '#d0d0d0';
    mCtx.fillRect(40, hy - 14, 780, 72);
    rCtx.fillStyle = '#505050';
    rCtx.fillRect(40, hy - 14, 780, 72);

    bCtx.fillStyle = '#e0e0e0';
    bCtx.fillRect(40, hy, 750, 44);

    ctx.restore();
  });

  const texSet = {
    map: toTexture(albedo, true, 1, 1),
    roughnessMap: toTexture(rough, false, 1, 1),
    metalnessMap: toTexture(metal, false, 1, 1),
    bumpMap: toTexture(bump, false, 1, 1)
  };

  textureCache.set('barnTimber', texSet);
  return texSet;
}

/**
 * ----------------------------------------------------------------------------
 * 4. THATCH ROOF TEXTURE (Layered golden straw/reed thatch with ridge comb)
 * ----------------------------------------------------------------------------
 */
export function getThatchRoofTextures() {
  if (textureCache.has('thatchRoof')) return textureCache.get('thatchRoof');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // Warm amber straw foundation
  const baseGrad = ctx.createLinearGradient(0, 0, 0, height);
  baseGrad.addColorStop(0, '#a16207');
  baseGrad.addColorStop(0.5, '#ca8a04');
  baseGrad.addColorStop(1, '#854d0e');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#d0d0d0'; // ~0.82 roughness
  rCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Multi-tier layered thatch echelons stepping down
  const echelonH = 140;
  const numEchelons = (height / echelonH) | 0;

  for (let e = 0; e < numEchelons; e++) {
    const ey = e * echelonH;

    // A. Deep under-eaves drop shadow beneath previous tier
    ctx.fillStyle = '#3f2208';
    ctx.fillRect(0, ey, width, 24);

    bCtx.fillStyle = '#202020';
    bCtx.fillRect(0, ey, width, 24);

    // B. Main thatch tier body gradient
    const tGrad = ctx.createLinearGradient(0, ey + 20, 0, ey + echelonH);
    tGrad.addColorStop(0, '#854d0e');
    tGrad.addColorStop(0.3, '#ca8a04');
    tGrad.addColorStop(0.7, '#eab308');
    tGrad.addColorStop(0.92, '#fde047'); // Fringe highlight
    tGrad.addColorStop(1, '#713f12');    // Tip shadow

    ctx.fillStyle = tGrad;
    ctx.fillRect(0, ey + 20, width, echelonH - 20);

    bCtx.fillStyle = '#c0c0c0';
    bCtx.fillRect(0, ey + 20, width, echelonH - 20);

    // C. Fine directional straw reed fibers
    for (let x = 0; x < width; x += 3) {
      const fiberTone = pseudoRandom(e * 50 + x);
      ctx.fillStyle = fiberTone > 0.65 ? '#fef9c3' : (fiberTone > 0.3 ? '#facc15' : '#78350f');
      ctx.globalAlpha = 0.35;
      const strandLen = echelonH * (0.6 + pseudoRandom(x) * 0.4);
      ctx.fillRect(x, ey + 15, 2, strandLen);
      ctx.globalAlpha = 1.0;
    }

    // D. Jagged fringe tips at bottom edge of echelon
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(0, ey + echelonH - 12);
    for (let x = 0; x <= width; x += 12) {
      const jag = (pseudoRandom(e * 30 + x) - 0.5) * 16;
      ctx.lineTo(x, ey + echelonH - 10 + jag);
    }
    ctx.lineTo(width, ey + echelonH - 25);
    ctx.lineTo(0, ey + echelonH - 25);
    ctx.closePath();
    ctx.fill();

    // Fringe edge drop shadow
    ctx.fillStyle = '#422006';
    ctx.fillRect(0, ey + echelonH - 4, width, 8);
  }

  // Traditional medieval criss-cross hazel sways / thatch ligatures in top echelon (ridge roll)
  const ridgeY = 70;
  ctx.save();
  ctx.fillStyle = '#533010';
  ctx.fillRect(0, 0, width, 140);

  // Cross ligatures
  for (let rx = 0; rx < width; rx += 70) {
    // Cross sway 1
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(rx, 10);
    ctx.lineTo(rx + 60, 120);
    ctx.stroke();

    // Cross sway 2
    ctx.beginPath();
    ctx.moveTo(rx + 60, 10);
    ctx.lineTo(rx, 120);
    ctx.stroke();

    // Spar pins
    drawNail(ctx, rx + 30, 65, 12, false);
  }
  ctx.restore();

  const texSet = {
    map: toTexture(albedo, true, 2, 2),
    roughnessMap: toTexture(rough, false, 2, 2),
    metalnessMap: toTexture(metal, false, 2, 2),
    bumpMap: toTexture(bump, false, 2, 2)
  };

  textureCache.set('thatchRoof', texSet);
  return texSet;
}

/**
 * ----------------------------------------------------------------------------
 * 5. SPLIT-RAIL FENCE & POST WOOD TEXTURE (Cedar rails, posts, tool handles)
 * ----------------------------------------------------------------------------
 */
export function getFenceWoodTextures() {
  if (textureCache.has('fenceWood')) return textureCache.get('fenceWood');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // Weathered rough cedar base
  const cedarGrad = ctx.createLinearGradient(0, 0, width, height);
  cedarGrad.addColorStop(0, '#593922');
  cedarGrad.addColorStop(0.4, '#6b452a');
  cedarGrad.addColorStop(0.7, '#855938');
  cedarGrad.addColorStop(1, '#50321d');
  ctx.fillStyle = cedarGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#c8c8c8'; // 0.78 roughness
  rCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Horizontal rough-hewn rail panels
  const railH = 256;
  const numRails = (height / railH) | 0;

  for (let r = 0; r < numRails; r++) {
    const ry = r * railH;

    // Rail boundary shadow
    ctx.fillStyle = '#221208';
    ctx.fillRect(0, ry, width, 12);
    bCtx.fillStyle = '#202020';
    bCtx.fillRect(0, ry, width, 12);

    // Axe-hewn facet planes
    for (let f = 0; f < 3; f++) {
      const fy = ry + 12 + f * 78;
      const facetLight = pseudoRandom(r * 5 + f) > 0.5;

      const fGrad = ctx.createLinearGradient(0, fy, 0, fy + 78);
      fGrad.addColorStop(0, facetLight ? '#986b45' : '#6b452a');
      fGrad.addColorStop(0.8, facetLight ? '#7b5333' : '#55341c');
      fGrad.addColorStop(1, '#3b2212');
      ctx.fillStyle = fGrad;
      ctx.fillRect(0, fy, width, 78);

      bCtx.fillStyle = facetLight ? '#b8b8b8' : '#707070';
      bCtx.fillRect(0, fy, width, 78);
    }

    // Split grain longitudinal cracks / checking fissures
    for (let c = 0; c < 8; c++) {
      const cy = ry + 30 + pseudoRandom(r * 10 + c) * 190;
      const startX = (pseudoRandom(r * 8 + c) * width * 0.4) | 0;
      const splitLen = 200 + pseudoRandom(c * 3.1) * 600;

      ctx.save();
      ctx.strokeStyle = '#180a04';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(startX, cy);
      for (let x = startX; x <= startX + splitLen && x < width; x += 30) {
        ctx.lineTo(x, cy + (pseudoRandom(x) - 0.5) * 6);
      }
      ctx.stroke();

      // Bright edge on top of fissure
      ctx.strokeStyle = '#ba8b62';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, cy - 2);
      for (let x = startX; x <= startX + splitLen && x < width; x += 30) {
        ctx.lineTo(x, cy - 2 + (pseudoRandom(x) - 0.5) * 6);
      }
      ctx.stroke();
      ctx.restore();

      bCtx.fillStyle = '#101010';
      bCtx.fillRect(startX, cy - 2, splitLen, 4);
    }

    // Wooden dowel pins / mortise peg details
    const pegXs = [180, width * 0.5, width - 180];
    pegXs.forEach(px => {
      ctx.save();
      ctx.fillStyle = '#2b1609';
      ctx.beginPath();
      ctx.arc(px + 2, ry + 128 + 2, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a6774e';
      ctx.beginPath();
      ctx.arc(px, ry + 128, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5c3519';
      ctx.beginPath();
      ctx.arc(px, ry + 128, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  const texSet = {
    map: toTexture(albedo, true, 2, 1),
    roughnessMap: toTexture(rough, false, 2, 1),
    metalnessMap: toTexture(metal, false, 2, 1),
    bumpMap: toTexture(bump, false, 2, 1)
  };

  textureCache.set('fenceWood', texSet);
  return texSet;
}

/**
 * ----------------------------------------------------------------------------
 * 6. STONE WELL & COBBLESTONE TEXTURE (River stones, mortar, water & iron)
 * ----------------------------------------------------------------------------
 */
export function getStoneWellTextures() {
  if (textureCache.has('stoneWell')) return textureCache.get('stoneWell');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // Recessed sandy lime mortar base
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#e0e0e0'; // 0.88 matte mortar
  rCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#303030'; // Mortar is deeply recessed
  bCtx.fillRect(0, 0, width, height);

  // Rounded River Stones & Fieldstones in courses
  const stoneColors = [
    { base: '#64748b', hi: '#94a3b8', lo: '#334155' }, // Slate gray
    { base: '#78716c', hi: '#a8a29e', lo: '#44403c' }, // Warm granite
    { base: '#57534e', hi: '#8a837c', lo: '#292524' }, // Dark river basalt
    { base: '#606e57', hi: '#86997a', lo: '#374231' }, // Mossy green stone
    { base: '#857564', hi: '#b0a08e', lo: '#4e4336' }  // Earthy sandstone
  ];

  const stoneRows = 12;
  const rowH = height / stoneRows;

  for (let r = 0; r < stoneRows; r++) {
    const ry = r * rowH;
    const isOdd = r % 2 === 1;
    const stoneW = 190;
    const numStones = (width / stoneW) + 2;

    for (let s = -1; s < numStones; s++) {
      const sx = s * stoneW + (isOdd ? stoneW * 0.5 : 0) + (pseudoRandom(r * 20 + s) - 0.5) * 35;
      const sy = ry + (pseudoRandom(r * 30 + s) - 0.5) * 20;
      const sw = stoneW * (0.8 + pseudoRandom(r * 15 + s) * 0.35);
      const sh = rowH * (0.75 + pseudoRandom(r * 17 + s) * 0.3);
      const colorScheme = stoneColors[(Math.abs(r * 7 + s)) % stoneColors.length];

      ctx.save();
      // Drop shadow around stone
      ctx.fillStyle = 'rgba(15, 12, 10, 0.85)';
      ctx.beginPath();
      drawRoundRect(ctx, sx - sw / 2 + 5, sy - sh / 2 + 7, sw, sh, 24);
      ctx.fill();

      // Rounded stone body with 3D gradient dome
      const sGrad = ctx.createRadialGradient(
        sx - sw * 0.18, sy - sh * 0.22, 10,
        sx, sy, sw * 0.6
      );
      sGrad.addColorStop(0, colorScheme.hi);
      sGrad.addColorStop(0.5, colorScheme.base);
      sGrad.addColorStop(0.85, colorScheme.lo);
      sGrad.addColorStop(1, '#1c1917');

      ctx.fillStyle = sGrad;
      ctx.beginPath();
      drawRoundRect(ctx, sx - sw / 2, sy - sh / 2, sw, sh, 22);
      ctx.fill();

      // Chiseled edge highlight on top rim
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      drawRoundRect(ctx, sx - sw / 2 + 2, sy - sh / 2 + 2, sw - 4, sh * 0.5, 18);
      ctx.stroke();

      // Mossy speckles on selected stones
      if (pseudoRandom(r * 9 + s) > 0.65) {
        ctx.fillStyle = 'rgba(77, 124, 15, 0.45)';
        ctx.beginPath();
        ctx.arc(sx + sw * 0.15, sy + sh * 0.15, sw * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Bump map for protruding stone
      bCtx.fillStyle = '#d0d0d0';
      bCtx.beginPath();
      drawRoundRect(bCtx, sx - sw / 2, sy - sh / 2, sw, sh, 22);
      bCtx.fill();

      // Roughness variation (mossier/smoother = 0.65)
      rCtx.fillStyle = '#9e9e9e';
      rCtx.beginPath();
      drawRoundRect(rCtx, sx - sw / 2, sy - sh / 2, sw, sh, 22);
      rCtx.fill();
    }
  }

  // Smooth Chiseled Stone Coping Rim (Top of well) in dedicated texture region
  const rimY = height - 260;
  ctx.save();
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, rimY - 10, width, 14);

  const rimGrad = ctx.createLinearGradient(0, rimY, 0, height);
  rimGrad.addColorStop(0, '#94a3b8');
  rimGrad.addColorStop(0.2, '#cbd5e1'); // Top bevel highlight
  rimGrad.addColorStop(0.6, '#64748b');
  rimGrad.addColorStop(1, '#334155');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, rimY, width, 260);

  // Chisel tool marks
  for (let cx = 0; cx < width; cx += 22) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, rimY + 10);
    ctx.lineTo(cx + 8, rimY + 250);
    ctx.stroke();
  }
  ctx.restore();

  bCtx.fillStyle = '#e8e8e8';
  bCtx.fillRect(0, rimY, width, 260);

  const texSet = {
    map: toTexture(albedo, true, 2, 2),
    roughnessMap: toTexture(rough, false, 2, 2),
    metalnessMap: toTexture(metal, false, 2, 2),
    bumpMap: toTexture(bump, false, 2, 2)
  };

  textureCache.set('stoneWell', texSet);
  return texSet;
}

/**
 * ----------------------------------------------------------------------------
 * 7. BURLAP SACKS & FARM PROPS TEXTURE (Grain sacks, iron pitchfork & bucket)
 * ----------------------------------------------------------------------------
 */
export function getBurlapPropsTextures() {
  if (textureCache.has('burlapProps')) return textureCache.get('burlapProps');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // Heavy burlap hessian canvas base
  const sackGrad = ctx.createLinearGradient(0, 0, width, height);
  sackGrad.addColorStop(0, '#a88052');
  sackGrad.addColorStop(0.5, '#c29b68');
  sackGrad.addColorStop(1, '#8e6638');
  ctx.fillStyle = sackGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#e8e8e8'; // 0.91 rough cloth
  rCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Coarse fabric cross-weave (horizontal & vertical warp/weft threads)
  for (let x = 0; x < width; x += 6) {
    ctx.fillStyle = pseudoRandom(x * 1.7) > 0.5 ? 'rgba(235, 215, 180, 0.3)' : 'rgba(75, 45, 20, 0.3)';
    ctx.fillRect(x, 0, 3, height);
  }
  for (let y = 0; y < height; y += 6) {
    ctx.fillStyle = pseudoRandom(y * 2.3) > 0.5 ? 'rgba(235, 215, 180, 0.3)' : 'rgba(75, 45, 20, 0.3)';
    ctx.fillRect(0, y, width, 3);
  }

  // Organic cloth wrinkles & sack sag shadows
  for (let w = 0; w < 16; w++) {
    const wy = 200 + w * 105;
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 35, 15, 0.4)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, wy);
    ctx.bezierCurveTo(width * 0.3, wy + 40, width * 0.7, wy - 30, width, wy + 20);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 245, 220, 0.35)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, wy - 10);
    ctx.bezierCurveTo(width * 0.3, wy + 30, width * 0.7, wy - 40, width, wy + 10);
    ctx.stroke();
    ctx.restore();
  }

  // Stenciled Black Charcoal Wheat Mill Emblem on Sack Front
  const emblemX = width * 0.5;
  const emblemY = height * 0.48;

  ctx.save();
  ctx.fillStyle = 'rgba(30, 20, 15, 0.75)';

  // Stylized Wheat Sheaf Icon
  ctx.beginPath();
  // Central stalk & ear
  ctx.ellipse(emblemX, emblemY - 40, 24, 75, 0, 0, Math.PI * 2);
  // Left ear
  ctx.ellipse(emblemX - 38, emblemY - 20, 22, 65, -0.35, 0, Math.PI * 2);
  // Right ear
  ctx.ellipse(emblemX + 38, emblemY - 20, 22, 65, 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Tie ribbon on stencil
  ctx.fillRect(emblemX - 55, emblemY + 45, 110, 18);

  // Spread base stalks
  ctx.beginPath();
  ctx.moveTo(emblemX - 50, emblemY + 65);
  ctx.lineTo(emblemX - 70, emblemY + 140);
  ctx.lineTo(emblemX - 25, emblemY + 140);
  ctx.lineTo(emblemX - 10, emblemY + 65);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(emblemX + 10, emblemY + 65);
  ctx.lineTo(emblemX + 25, emblemY + 140);
  ctx.lineTo(emblemX + 70, emblemY + 140);
  ctx.lineTo(emblemX + 50, emblemY + 65);
  ctx.closePath();
  ctx.fill();

  // Stencil circular border ring
  ctx.strokeStyle = 'rgba(30, 20, 15, 0.65)';
  ctx.lineWidth = 10;
  ctx.setLineDash([25, 12]);
  ctx.beginPath();
  ctx.arc(emblemX, emblemY + 20, 165, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // Forged Wrought Iron Tools Texture Region (Right side strip)
  const ironX = width - 400;
  ctx.save();
  const ironGrad = ctx.createLinearGradient(ironX, 0, width, 0);
  ironGrad.addColorStop(0, '#334155');
  ironGrad.addColorStop(0.25, '#64748b'); // Steel bevel
  ironGrad.addColorStop(0.6, '#1e293b');
  ironGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = ironGrad;
  ctx.fillRect(ironX, 0, 400, height);

  // Sharp forged specular highlight line
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ironX + 100, 0);
  ctx.lineTo(ironX + 100, height);
  ctx.stroke();

  mCtx.fillStyle = '#e2e8f0'; // High metalness (0.88)
  mCtx.fillRect(ironX, 0, 400, height);

  rCtx.fillStyle = '#555555'; // 0.33 smooth forged iron
  rCtx.fillRect(ironX, 0, 400, height);

  bCtx.fillStyle = '#d0d0d0';
  bCtx.fillRect(ironX, 0, 400, height);
  ctx.restore();

  const texSet = {
    map: toTexture(albedo, true, 1, 1),
    roughnessMap: toTexture(rough, false, 1, 1),
    metalnessMap: toTexture(metal, false, 1, 1),
    bumpMap: toTexture(bump, false, 1, 1)
  };

  textureCache.set('burlapProps', texSet);
  return texSet;
}
