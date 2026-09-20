import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Lumber Camp (Serraria)
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates 2048x2048 crisp textures tailored to each logging camp component:
 * 1. Tree Bark (getLogBarkTextures): Rugged fir/oak bark with deep fissures, undulating furrow ridges, and forest moss.
 * 2. Log End-Grain (getLogEndTextures): Circular growth rings with heartwood/sapwood gradients, radial drying checks, and outer bark rim.
 * 3. Milled Timber & Planks (getMilledTimberTextures): Cleanly milled yellow pine lumber planks, directional wood grain, bevel highlights, seams, and forged iron nail heads.
 * 4. Cedar Shake Roof Shingles (getRoofShingleTextures): Overlapping wooden shingles with staggered rows, individual wood tone variations, drop shadows, and nail studs.
 * 5. Saw Blade & Steel Mechanism (getSawBladeTextures): Polished steel circular rip saw blade with razor teeth, radial machining grind marks, heat-treated temper ring, and heavy forged arbor hub.
 * 6. Axe & Woodcutter Tools (getAxeAndToolsTextures): Forged dark iron axe head with mirror-honed cutting bevel, stamped blacksmith pine guild touchmark, and ash wood handle with leather strapping.
 * 7. Golden Sawdust & Wood Chips (getSawdustTextures): Dense piles of fine golden pine sawdust, curled wood plane shavings, and angular split chips.
 * 8. Forged Iron Lantern (getLanternTextures): Blackened wrought iron cage with warm glowing amber glass panes and inner candle flame.
 */

const textureCache = new Map();

function createCanvas(width = 2048, height = 2048) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : { width, height, getContext: () => null };
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext ? canvas.getContext('2d', { willReadFrequently: false }) : null;
  return { canvas, ctx, width, height };
}

function toTexture(canvas, isSRGB = true, wrapRepeat = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (wrapRepeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Helper: draw stylized rivet / bolt head with drop shadow, outer bevel, and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 10, isGold = false) {
  ctx.save();
  // Soft ambient drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  // Outer bevel ring
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  if (isGold) {
    ringGrad.addColorStop(0, '#fff3b0');
    ringGrad.addColorStop(0.3, '#f59e0b');
    ringGrad.addColorStop(0.7, '#d97706');
    ringGrad.addColorStop(1, '#78350f');
  } else {
    ringGrad.addColorStop(0, '#e2e8f0');
    ringGrad.addColorStop(0.3, '#94a3b8');
    ringGrad.addColorStop(0.7, '#475569');
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
    domeGrad.addColorStop(0.35, '#cbd5e1');
    domeGrad.addColorStop(0.8, '#64748b');
    domeGrad.addColorStop(1, '#334155');
  }
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper: draw forged square nail / carpentry spike head
 */
function drawSquareNail(ctx, cx, cy, size = 12) {
  ctx.save();
  const half = size / 2;
  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(cx - half + 2, cy - half + 3, size, size);

  // Outer bevel rim
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - half, cy - half, size, size);

  // Raised pyramid facet highlight
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + half, cy - half);
  ctx.closePath();
  ctx.fill();

  // Top highlight
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - half, cy + half);
  ctx.closePath();
  ctx.fill();

  // Center point specular
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  ctx.restore();
}

/* ==========================================================================
   1. TREE BARK TEXTURES (getLogBarkTextures)
   Rugged fir / oak bark with deep fissures, undulating furrow ridges & moss
   ========================================================================== */
export function getLogBarkTextures() {
  if (textureCache.has('logBark')) return textureCache.get('logBark');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Base deep bark gradient
  const baseGrad = alb.createLinearGradient(0, 0, W, 0);
  baseGrad.addColorStop(0.0, '#321c10');
  baseGrad.addColorStop(0.3, '#422718');
  baseGrad.addColorStop(0.6, '#4f301e');
  baseGrad.addColorStop(1.0, '#351e12');
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // Vertical undulating bark furrow ridges
  const numFurrows = 24;
  const colWidth = W / numFurrows;

  for (let i = 0; i < numFurrows; i++) {
    const baseX = i * colWidth;
    const ridgeWidth = colWidth * 0.82;

    // Deep fissure background on left/right edges
    alb.fillStyle = '#180c06';
    alb.fillRect(baseX + ridgeWidth, 0, colWidth - ridgeWidth, H);

    // Main ridge body with subtle vertical taper & wave
    const ridgeGrad = alb.createLinearGradient(baseX, 0, baseX + ridgeWidth, 0);
    ridgeGrad.addColorStop(0.0, '#2d180d');
    ridgeGrad.addColorStop(0.2, '#53321d');
    ridgeGrad.addColorStop(0.5, '#6a4227');
    ridgeGrad.addColorStop(0.8, '#57351f');
    ridgeGrad.addColorStop(1.0, '#261308');

    alb.fillStyle = ridgeGrad;
    alb.beginPath();
    alb.moveTo(baseX, 0);

    for (let y = 0; y <= H; y += 64) {
      const wave = Math.sin((y / 180) + i * 2.1) * 16 + Math.cos((y / 90) + i) * 8;
      alb.lineTo(baseX + wave, y);
    }
    for (let y = H; y >= 0; y -= 64) {
      const wave = Math.sin((y / 180) + i * 2.1) * 16 + Math.cos((y / 90) + i) * 8;
      alb.lineTo(baseX + ridgeWidth + wave, y);
    }
    alb.closePath();
    alb.fill();

    // Stylized horizontal bark plates and fissures across ridges
    alb.fillStyle = 'rgba(16, 7, 3, 0.45)';
    alb.lineWidth = 4;
    for (let y = (i % 3) * 40; y < H; y += 70 + (i % 5) * 15) {
      alb.beginPath();
      alb.moveTo(baseX + 6, y);
      alb.quadraticCurveTo(baseX + ridgeWidth * 0.5, y + 8, baseX + ridgeWidth - 6, y);
      alb.stroke();

      // Sharp warm highlight just below the fissure cut
      alb.strokeStyle = 'rgba(155, 102, 62, 0.35)';
      alb.lineWidth = 3;
      alb.beginPath();
      alb.moveTo(baseX + 10, y + 4);
      alb.lineTo(baseX + ridgeWidth - 10, y + 4);
      alb.stroke();
    }

    // High crest warm edge highlights
    alb.strokeStyle = 'rgba(175, 120, 78, 0.4)';
    alb.lineWidth = 5;
    alb.beginPath();
    alb.moveTo(baseX + ridgeWidth * 0.45, 0);
    for (let y = 0; y <= H; y += 96) {
      const wave = Math.sin((y / 180) + i * 2.1) * 16 + Math.cos((y / 90) + i) * 8;
      alb.lineTo(baseX + ridgeWidth * 0.45 + wave, y);
    }
    alb.stroke();
  }

  // Hand-painted forest moss & lichen patches in the crevices
  alb.fillStyle = '#4c6a28';
  for (let p = 0; p < 90; p++) {
    const px = ((p * 173) % (W - 120)) + 60;
    const py = ((p * 281) % (H - 120)) + 60;
    const pr = 16 + (p % 7) * 6;

    const mossGrad = alb.createRadialGradient(px, py, 2, px, py, pr);
    mossGrad.addColorStop(0.0, '#7ea63b');
    mossGrad.addColorStop(0.5, '#567929');
    mossGrad.addColorStop(0.9, '#364e18');
    mossGrad.addColorStop(1.0, 'rgba(54, 78, 24, 0)');
    alb.fillStyle = mossGrad;
    alb.beginPath();
    alb.arc(px, py, pr, 0, Math.PI * 2);
    alb.fill();

    // Speckles
    alb.fillStyle = 'rgba(170, 210, 80, 0.45)';
    alb.beginPath();
    alb.arc(px - 4, py - 4, pr * 0.35, 0, Math.PI * 2);
    alb.fill();
  }

  // Roughness Map (Bark is rough, fissures very matte, moss velvety)
  rgh.fillStyle = '#b8b8b8'; // ~0.72 base
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#e4e4e4'; // deep fissures matte
  for (let i = 0; i < numFurrows; i++) {
    rgh.fillRect(i * colWidth + colWidth * 0.78, 0, colWidth * 0.22, H);
  }
  rgh.fillStyle = '#9a9a9a'; // ridge crests slightly smoother
  for (let i = 0; i < numFurrows; i++) {
    rgh.fillRect(i * colWidth + colWidth * 0.25, 0, colWidth * 0.35, H);
  }

  // Metalness Map (Pure non-metal wood)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map (Mid-gray base, deep fissures carved down, ridge crests embossed)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#282828'; // deep valleys
  for (let i = 0; i < numFurrows; i++) {
    bmp.fillRect(i * colWidth + colWidth * 0.8, 0, colWidth * 0.2, H);
  }
  bmp.fillStyle = '#bbbbbb'; // raised ridges
  for (let i = 0; i < numFurrows; i++) {
    bmp.fillRect(i * colWidth + colWidth * 0.18, 0, colWidth * 0.5, H);
  }

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('logBark', set);
  return set;
}

/* ==========================================================================
   2. LOG END-GRAIN TEXTURES (getLogEndTextures)
   Concentric growth rings with heartwood/sapwood gradients, radial checks, bark rim
   ========================================================================== */
export function getLogEndTextures() {
  if (textureCache.has('logEnd')) return textureCache.get('logEnd');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const cx = W / 2;
  const cy = H / 2;
  const maxR = W * 0.48;

  // Background clear
  alb.fillStyle = '#1e1107';
  alb.fillRect(0, 0, W, H);

  // Radial wood gradient: Heartwood core -> Golden sapwood -> Outer bark rim
  const woodGrad = alb.createRadialGradient(cx, cy, 20, cx, cy, maxR);
  woodGrad.addColorStop(0.0, '#5a2e12'); // Dark central pith
  woodGrad.addColorStop(0.15, '#7c431d'); // Rich heartwood core
  woodGrad.addColorStop(0.38, '#a66230'); // Mid heartwood
  woodGrad.addColorStop(0.65, '#cb944f'); // Sapwood transition
  woodGrad.addColorStop(0.85, '#e4ba78'); // Light outer sapwood
  woodGrad.addColorStop(0.92, '#edd39c'); // Cream cambium ring
  woodGrad.addColorStop(0.95, '#5c3319'); // Inner bark
  woodGrad.addColorStop(1.0, '#241208'); // Rough outer bark
  alb.fillStyle = woodGrad;
  alb.beginPath();
  alb.arc(cx, cy, maxR, 0, Math.PI * 2);
  alb.fill();

  // Concentric annual growth rings with organic wavy perturbation
  const numRings = 36;
  for (let r = 1; r <= numRings; r++) {
    const ringRadius = (r / numRings) * (maxR * 0.91);
    const ringColor = r < 14 ? 'rgba(84, 38, 12, 0.45)' : 'rgba(125, 75, 28, 0.38)';
    alb.strokeStyle = ringColor;
    alb.lineWidth = 3 + (r % 3);

    alb.beginPath();
    const segments = 90;
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const wobble = Math.sin(angle * 6 + r * 1.3) * (3.5 + r * 0.15) +
                    Math.cos(angle * 3 + r * 0.7) * 2.5;
      const x = cx + Math.cos(angle) * (ringRadius + wobble);
      const y = cy + Math.sin(angle) * (ringRadius + wobble);
      if (s === 0) alb.moveTo(x, y);
      else alb.lineTo(x, y);
    }
    alb.closePath();
    alb.stroke();

    // Subtle fine micro-rings
    if (r % 2 === 0) {
      alb.strokeStyle = 'rgba(235, 195, 135, 0.22)';
      alb.lineWidth = 1.5;
      alb.beginPath();
      alb.arc(cx, cy, ringRadius + 6, 0, Math.PI * 2);
      alb.stroke();
    }
  }

  // Fine medullary rays radiating from center to perimeter
  alb.strokeStyle = 'rgba(92, 48, 18, 0.12)';
  alb.lineWidth = 2;
  for (let a = 0; a < 64; a++) {
    const angle = (a / 64) * Math.PI * 2 + (a % 3) * 0.02;
    alb.beginPath();
    alb.moveTo(cx + Math.cos(angle) * 40, cy + Math.sin(angle) * 40);
    alb.lineTo(cx + Math.cos(angle) * (maxR * 0.9), cy + Math.sin(angle) * (maxR * 0.9));
    alb.stroke();
  }

  // Authentic radial drying checks / micro-cracks radiating outwards
  const crackAngles = [0.4, 1.35, 2.2, 3.6, 4.8, 5.7];
  crackAngles.forEach((angle, idx) => {
    const len = maxR * (0.65 + (idx % 3) * 0.12);
    alb.save();
    alb.translate(cx, cy);
    alb.rotate(angle);

    // Dark fissure crevice
    alb.strokeStyle = '#120803';
    alb.lineWidth = 10;
    alb.lineCap = 'round';
    alb.beginPath();
    alb.moveTo(15, 0);
    let currX = 15;
    let currY = 0;
    for (let step = 0; step < 7; step++) {
      currX += len / 7;
      currY += (step % 2 === 0 ? 5 : -5);
      alb.lineTo(currX, currY);
    }
    alb.stroke();

    // Inner core black void
    alb.strokeStyle = '#050201';
    alb.lineWidth = 5;
    alb.stroke();

    // Sharp specular edge highlight on one rim of the crack
    alb.strokeStyle = '#f8e6c4';
    alb.lineWidth = 3;
    alb.beginPath();
    alb.moveTo(25, -5);
    currX = 25;
    currY = -5;
    for (let step = 0; step < 7; step++) {
      currX += len / 7;
      currY += (step % 2 === 0 ? 5 : -5);
      alb.lineTo(currX, currY);
    }
    alb.stroke();
    alb.restore();
  });

  // Dark central pith core dot
  const pithGrad = alb.createRadialGradient(cx, cy, 2, cx, cy, 28);
  pithGrad.addColorStop(0.0, '#261005');
  pithGrad.addColorStop(0.7, '#48220c');
  pithGrad.addColorStop(1.0, 'rgba(72, 34, 12, 0)');
  alb.fillStyle = pithGrad;
  alb.beginPath();
  alb.arc(cx, cy, 28, 0, Math.PI * 2);
  alb.fill();

  // Outer rugged bark rim ring
  alb.strokeStyle = '#231207';
  alb.lineWidth = 42;
  alb.beginPath();
  alb.arc(cx, cy, maxR - 15, 0, Math.PI * 2);
  alb.stroke();

  // Bark rim texture facets
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const bx = cx + Math.cos(angle) * (maxR - 15);
    const by = cy + Math.sin(angle) * (maxR - 15);
    alb.fillStyle = i % 2 === 0 ? '#452814' : '#311b0c';
    alb.beginPath();
    alb.arc(bx, by, 18, 0, Math.PI * 2);
    alb.fill();
  }

  // Roughness Map
  rgh.fillStyle = '#8e8e8e'; // cut wood ~0.55
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#d0d0d0'; // bark is rougher
  rgh.beginPath();
  rgh.arc(cx, cy, maxR, 0, Math.PI * 2);
  rgh.arc(cx, cy, maxR * 0.9, 0, Math.PI * 2, true);
  rgh.fill();

  // Metalness Map (Non-metal)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // Crack crevices carved deep
  bmp.fillStyle = '#101010';
  crackAngles.forEach((angle) => {
    bmp.save();
    bmp.translate(cx, cy);
    bmp.rotate(angle);
    bmp.fillRect(20, -5, maxR * 0.7, 10);
    bmp.restore();
  });

  const set = {
    map: toTexture(albC, true, false),
    roughnessMap: toTexture(rghC, false, false),
    metalnessMap: toTexture(metC, false, false),
    bumpMap: toTexture(bmpC, false, false)
  };
  textureCache.set('logEnd', set);
  return set;
}

/* ==========================================================================
   3. MILLED TIMBER & PLANKS TEXTURES (getMilledTimberTextures)
   Cleanly milled yellow pine lumber planks, grain, seams, bevels & nails
   ========================================================================== */
export function getMilledTimberTextures() {
  if (textureCache.has('milledTimber')) return textureCache.get('milledTimber');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const numPlanks = 8;
  const plankH = H / numPlanks;

  for (let i = 0; i < numPlanks; i++) {
    const y0 = i * plankH;

    // Individual plank warm yellow-pine base gradient
    const pGrad = alb.createLinearGradient(0, y0, 0, y0 + plankH);
    const toneVariation = (i % 3) * 8;
    pGrad.addColorStop(0.0, `rgb(${218 + toneVariation}, ${170 + toneVariation}, ${105 + toneVariation})`);
    pGrad.addColorStop(0.5, `rgb(${202 + toneVariation}, ${150 + toneVariation}, ${86 + toneVariation})`);
    pGrad.addColorStop(1.0, `rgb(${184 + toneVariation}, ${134 + toneVariation}, ${70 + toneVariation})`);
    alb.fillStyle = pGrad;
    alb.fillRect(0, y0, W, plankH);

    // Directional wood grain streaks running horizontally
    alb.fillStyle = 'rgba(118, 70, 24, 0.12)';
    for (let gy = y0 + 10; gy < y0 + plankH - 10; gy += 14) {
      const gHeight = 3 + ((gy * 7) % 5);
      alb.fillRect(0, gy, W, gHeight);
    }

    // Occasional wood knot on planks
    if (i % 2 === 1) {
      const kx = ((i * 543) % (W - 300)) + 150;
      const ky = y0 + plankH * 0.48;
      const kw = 55;
      const kh = 26;

      // Swirling elliptical grain around knot
      alb.strokeStyle = 'rgba(105, 55, 18, 0.35)';
      alb.lineWidth = 3;
      for (let s = 1; s <= 4; s++) {
        alb.beginPath();
        alb.ellipse(kx, ky, kw + s * 16, kh + s * 10, 0, 0, Math.PI * 2);
        alb.stroke();
      }

      // Knot core
      const knotGrad = alb.createRadialGradient(kx, ky, 2, kx, ky, kw * 0.7);
      knotGrad.addColorStop(0.0, '#421f07');
      knotGrad.addColorStop(0.7, '#6f3912');
      knotGrad.addColorStop(1.0, '#9c5924');
      alb.fillStyle = knotGrad;
      alb.beginPath();
      alb.ellipse(kx, ky, kw * 0.6, kh * 0.7, 0, 0, Math.PI * 2);
      alb.fill();
    }

    // Top edge crisp bevel highlight
    alb.fillStyle = 'rgba(255, 235, 185, 0.55)';
    alb.fillRect(0, y0 + 1, W, 5);

    // Bottom edge drop shadow
    alb.fillStyle = 'rgba(38, 18, 7, 0.5)';
    alb.fillRect(0, y0 + plankH - 12, W, 12);

    // Deep plank seam
    alb.fillStyle = '#1e0c04';
    alb.fillRect(0, y0 + plankH - 4, W, 6);

    // Forged carpentry iron nails / spikes along plank lines
    const nailX = [96, 520, 1024, 1536, 1952];
    nailX.forEach((nx) => {
      drawSquareNail(alb, nx, y0 + plankH * 0.28, 14);
      drawSquareNail(alb, nx, y0 + plankH * 0.72, 14);
    });
  }

  // Roughness Map (Smooth planed pine ~0.48, seams rougher ~0.8)
  rgh.fillStyle = '#7a7a7a';
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#c0c0c0'; // seams
  for (let i = 0; i < numPlanks; i++) {
    rgh.fillRect(0, i * plankH + plankH - 8, W, 10);
  }

  // Metalness Map (Nails are forged iron, wood is zero)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#cccccc'; // iron nails
  for (let i = 0; i < numPlanks; i++) {
    const y0 = i * plankH;
    const nailX = [96, 520, 1024, 1536, 1952];
    nailX.forEach((nx) => {
      met.fillRect(nx - 7, y0 + plankH * 0.28 - 7, 14, 14);
      met.fillRect(nx - 7, y0 + plankH * 0.72 - 7, 14, 14);
    });
  }

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#262626'; // seam groove
  for (let i = 0; i < numPlanks; i++) {
    bmp.fillRect(0, i * plankH + plankH - 6, W, 8);
  }
  bmp.fillStyle = '#b4b4b4'; // bevel highlights
  for (let i = 0; i < numPlanks; i++) {
    bmp.fillRect(0, i * plankH, W, 4);
  }

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('milledTimber', set);
  return set;
}

/* ==========================================================================
   4. CEDAR SHAKE ROOF SHINGLE TEXTURES (getRoofShingleTextures)
   Overlapping wooden shingles, staggered rows, weathered cedar tones & shadows
   ========================================================================== */
export function getRoofShingleTextures() {
  if (textureCache.has('roofShingle')) return textureCache.get('roofShingle');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const numTiers = 8;
  const tierH = H / numTiers;

  for (let t = 0; t < numTiers; t++) {
    const y0 = t * tierH;
    const shinglesInTier = 9;
    const shingleW = W / shinglesInTier;
    const xOffset = (t % 2 === 0 ? 0 : shingleW * 0.5);

    // Deep ambient drop shadow beneath the tier above
    alb.fillStyle = 'rgba(18, 9, 4, 0.75)';
    alb.fillRect(0, y0, W, 22);

    for (let s = -1; s <= shinglesInTier + 1; s++) {
      const sx = s * shingleW + xOffset;
      const sw = shingleW - 6;

      // Color variation per individual shingle
      const seed = (t * 17 + s * 31) % 5;
      let sColorTop, sColorBot;
      if (seed === 0) {
        sColorTop = '#7d4d29'; // warm cedar
        sColorBot = '#5c3519';
      } else if (seed === 1) {
        sColorTop = '#6a4325'; // weathered chestnut
        sColorBot = '#4c2e17';
      } else if (seed === 2) {
        sColorTop = '#8c5932'; // golden cedar
        sColorBot = '#663e21';
      } else if (seed === 3) {
        sColorTop = '#5e432a'; // moss-tinted aged oak
        sColorBot = '#44301d';
      } else {
        sColorTop = '#754b2d';
        sColorBot = '#55341c';
      }

      const sGrad = alb.createLinearGradient(sx, y0, sx, y0 + tierH);
      sGrad.addColorStop(0.0, sColorTop);
      sGrad.addColorStop(0.85, sColorBot);
      sGrad.addColorStop(1.0, '#361d0d');
      alb.fillStyle = sGrad;
      alb.fillRect(sx, y0 + 6, sw, tierH - 6);

      // Vertical wood grain fibers on each shingle
      alb.fillStyle = 'rgba(25, 12, 5, 0.18)';
      for (let gx = sx + 8; gx < sx + sw - 8; gx += 12) {
        alb.fillRect(gx, y0 + 10, 3, tierH - 18);
      }

      // Vertical dark notch slit between adjacent shingles
      alb.fillStyle = '#140803';
      alb.fillRect(sx + sw, y0 + 4, 6, tierH);

      // Bottom lip sharp highlight for 3D thickness
      alb.fillStyle = 'rgba(224, 178, 126, 0.55)';
      alb.fillRect(sx, y0 + tierH - 5, sw, 5);

      // Wooden peg / forged nail in top center
      drawSquareNail(alb, sx + sw * 0.5, y0 + tierH * 0.26, 9);
    }
  }

  // Roughness Map (~0.75 weathered timber)
  rgh.fillStyle = '#bebebe';
  rgh.fillRect(0, 0, W, H);

  // Metalness Map (Pure non-metal wood)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map (Tier steps and vertical slits)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  for (let t = 0; t < numTiers; t++) {
    const y0 = t * tierH;
    bmp.fillStyle = '#303030'; // tier overlap under-shadow
    bmp.fillRect(0, y0, W, 14);
    bmp.fillStyle = '#b8b8b8'; // shingle bottom lip raised
    bmp.fillRect(0, y0 + tierH - 6, W, 6);
  }

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('roofShingle', set);
  return set;
}

/* ==========================================================================
   5. STEEL SAW BLADE TEXTURES (getSawBladeTextures)
   Circular rip saw with aggressive teeth, radial grinding, heat ring, arbor hub
   ========================================================================== */
export function getSawBladeTextures() {
  if (textureCache.has('sawBlade')) return textureCache.get('sawBlade');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const cx = W / 2;
  const cy = H / 2;
  const bladeR = W * 0.46;
  const arborR = bladeR * 0.32;

  // Clear background
  alb.fillStyle = '#0f172a';
  alb.fillRect(0, 0, W, H);

  // Radial brushed steel blade face gradient
  const bladeGrad = alb.createRadialGradient(cx, cy, arborR, cx, cy, bladeR);
  bladeGrad.addColorStop(0.0, '#64748b'); // Arbor junction
  bladeGrad.addColorStop(0.35, '#94a3b8'); // Polished body
  bladeGrad.addColorStop(0.7, '#cbd5e1'); // Bright blade expanse
  bladeGrad.addColorStop(0.85, '#475569'); // Blue temper zone
  bladeGrad.addColorStop(0.96, '#e2e8f0'); // Outer rim
  bladeGrad.addColorStop(1.0, '#ffffff'); // Mirror tooth tips
  alb.fillStyle = bladeGrad;
  alb.beginPath();
  alb.arc(cx, cy, bladeR, 0, Math.PI * 2);
  alb.fill();

  // Fine radial machining grind marks
  alb.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  alb.lineWidth = 1.5;
  for (let a = 0; a < 256; a++) {
    const angle = (a / 256) * Math.PI * 2;
    alb.beginPath();
    alb.moveTo(cx + Math.cos(angle) * arborR, cy + Math.sin(angle) * arborR);
    alb.lineTo(cx + Math.cos(angle) * (bladeR - 20), cy + Math.sin(angle) * (bladeR - 20));
    alb.stroke();
  }

  // Iridescent heat-treated temper ring (friction blue & straw gold)
  const temperGrad = alb.createRadialGradient(cx, cy, bladeR * 0.78, cx, cy, bladeR * 0.92);
  temperGrad.addColorStop(0.0, 'rgba(56, 189, 248, 0)');
  temperGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.35)'); // peacock cyan/blue
  temperGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.25)'); // purple temper
  temperGrad.addColorStop(0.9, 'rgba(234, 179, 8, 0.35)'); // straw bronze
  temperGrad.addColorStop(1.0, 'rgba(234, 179, 8, 0)');
  alb.fillStyle = temperGrad;
  alb.beginPath();
  alb.arc(cx, cy, bladeR * 0.92, 0, Math.PI * 2);
  alb.fill();

  // Aggressive ripping saw teeth around perimeter
  const numTeeth = 36;
  alb.save();
  for (let t = 0; t < numTeeth; t++) {
    const angle = (t / numTeeth) * Math.PI * 2;
    const nextAngle = ((t + 1) / numTeeth) * Math.PI * 2;

    const tX1 = cx + Math.cos(angle) * (bladeR * 0.92);
    const tY1 = cy + Math.sin(angle) * (bladeR * 0.92);

    const tipX = cx + Math.cos(angle + 0.05) * bladeR;
    const tipY = cy + Math.sin(angle + 0.05) * bladeR;

    const tX2 = cx + Math.cos(nextAngle) * (bladeR * 0.92);
    const tY2 = cy + Math.sin(nextAngle) * (bladeR * 0.92);

    // Gullet dark shadow
    alb.fillStyle = '#1e293b';
    alb.beginPath();
    alb.moveTo(tX1, tY1);
    alb.lineTo(tipX, tipY);
    alb.lineTo(tX2, tY2);
    alb.closePath();
    alb.fill();

    // Razor-sharp cutting edge highlight
    alb.strokeStyle = '#ffffff';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(tX1, tY1);
    alb.lineTo(tipX, tipY);
    alb.stroke();
  }
  alb.restore();

  // Radial expansion slots (prevent blade warping from heat)
  const numSlots = 4;
  alb.fillStyle = '#0f172a';
  for (let s = 0; s < numSlots; s++) {
    const angle = (s / numSlots) * Math.PI * 2 + 0.3;
    alb.save();
    alb.translate(cx, cy);
    alb.rotate(angle);
    alb.fillRect(bladeR * 0.72, -3, bladeR * 0.18, 6);
    alb.beginPath();
    alb.arc(bladeR * 0.72, 0, 7, 0, Math.PI * 2);
    alb.fill();
    alb.restore();
  }

  // Central heavy forged steel arbor hub collar
  const hubGrad = alb.createRadialGradient(cx, cy, 10, cx, cy, arborR);
  hubGrad.addColorStop(0.0, '#0f172a'); // Center spindle hole
  hubGrad.addColorStop(0.28, '#0f172a');
  hubGrad.addColorStop(0.32, '#e2e8f0'); // Inner hole rim
  hubGrad.addColorStop(0.45, '#475569'); // Flange plate
  hubGrad.addColorStop(0.85, '#334155');
  hubGrad.addColorStop(0.95, '#1e293b');
  hubGrad.addColorStop(1.0, '#64748b'); // Outer flange bevel
  alb.fillStyle = hubGrad;
  alb.beginPath();
  alb.arc(cx, cy, arborR, 0, Math.PI * 2);
  alb.fill();

  // 6 heavy forged clamping bolts on hub collar
  const boltR = arborR * 0.65;
  for (let b = 0; b < 6; b++) {
    const angle = (b / 6) * Math.PI * 2;
    const bx = cx + Math.cos(angle) * boltR;
    const by = cy + Math.sin(angle) * boltR;
    drawRivet(alb, bx, by, 14, false);
  }

  // Roughness Map (Polished steel blade: very glossy ~0.15 - 0.25; hub ~0.4)
  rgh.fillStyle = '#303030';
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#181818'; // razor cutting edge
  rgh.beginPath();
  rgh.arc(cx, cy, bladeR, 0, Math.PI * 2);
  rgh.arc(cx, cy, bladeR * 0.88, 0, Math.PI * 2, true);
  rgh.fill();
  rgh.fillStyle = '#555555'; // arbor flange
  rgh.beginPath();
  rgh.arc(cx, cy, arborR, 0, Math.PI * 2);
  rgh.fill();

  // Metalness Map (Full metallic steel)
  met.fillStyle = '#f8f8f8';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#000000'; // center spindle bore void
  met.beginPath();
  met.arc(cx, cy, arborR * 0.28, 0, Math.PI * 2);
  met.fill();

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b0b0b0'; // hub collar raised
  bmp.beginPath();
  bmp.arc(cx, cy, arborR, 0, Math.PI * 2);
  bmp.fill();
  bmp.fillStyle = '#303030'; // center bore
  bmp.beginPath();
  bmp.arc(cx, cy, arborR * 0.28, 0, Math.PI * 2);
  bmp.fill();

  const set = {
    map: toTexture(albC, true, false),
    roughnessMap: toTexture(rghC, false, false),
    metalnessMap: toTexture(metC, false, false),
    bumpMap: toTexture(bmpC, false, false)
  };
  textureCache.set('sawBlade', set);
  return set;
}

/* ==========================================================================
   6. AXE & WOODCUTTER TOOLS TEXTURES (getAxeAndToolsTextures)
   Forged dark iron head, mirror cutting bevel, stamped guild touchmark, ash handle
   ========================================================================== */
export function getAxeAndToolsTextures() {
  if (textureCache.has('axeTools')) return textureCache.get('axeTools');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Background clear
  alb.fillStyle = '#1e293b';
  alb.fillRect(0, 0, W, H);

  // TOP HALF: FORGED STEEL AXE HEAD (Y: 0 to 1024)
  const headGrad = alb.createLinearGradient(0, 0, W, 0);
  headGrad.addColorStop(0.0, '#1e242d'); // Poll / butt
  headGrad.addColorStop(0.35, '#333b47'); // Forged iron cheek
  headGrad.addColorStop(0.7, '#4c586a');
  headGrad.addColorStop(0.88, '#94a3b8'); // Bevel transition
  headGrad.addColorStop(1.0, '#ffffff'); // Razor cutting edge
  alb.fillStyle = headGrad;
  alb.fillRect(0, 0, W, 1024);

  // Hand-forged hammer marks & planar facets
  for (let f = 0; f < 32; f++) {
    const fx = ((f * 137) % (W * 0.7)) + 40;
    const fy = ((f * 241) % 900) + 60;
    const fr = 24 + (f % 5) * 8;

    const facetGrad = alb.createRadialGradient(fx - 4, fy - 4, 2, fx, fy, fr);
    facetGrad.addColorStop(0.0, 'rgba(148, 163, 184, 0.25)');
    facetGrad.addColorStop(0.7, 'rgba(30, 41, 59, 0.35)');
    facetGrad.addColorStop(1.0, 'rgba(15, 23, 42, 0)');
    alb.fillStyle = facetGrad;
    alb.beginPath();
    alb.arc(fx, fy, fr, 0, Math.PI * 2);
    alb.fill();
  }

  // Stamped Golden Blacksmith Pine Guild Touchmark on axe cheek
  alb.save();
  const markX = W * 0.42;
  const markY = 512;
  alb.translate(markX, markY);

  // Golden medallion border
  alb.strokeStyle = '#f59e0b';
  alb.lineWidth = 10;
  alb.beginPath();
  alb.arc(0, 0, 110, 0, Math.PI * 2);
  alb.stroke();

  alb.fillStyle = 'rgba(245, 158, 11, 0.15)';
  alb.fill();

  // Stylized pine tree emblem in gold
  alb.fillStyle = '#fde047';
  alb.beginPath();
  // Tree tiers
  alb.moveTo(0, -75);
  alb.lineTo(35, -30);
  alb.lineTo(15, -30);
  alb.lineTo(50, 18);
  alb.lineTo(25, 18);
  alb.lineTo(65, 65);
  alb.lineTo(-65, 65);
  alb.lineTo(-25, 18);
  alb.lineTo(-50, 18);
  alb.lineTo(-15, -30);
  alb.lineTo(-35, -30);
  alb.closePath();
  alb.fill();

  // Tree trunk
  alb.fillStyle = '#b45309';
  alb.fillRect(-12, 65, 24, 25);
  alb.restore();

  // Razor edge vertical highlight line
  alb.fillStyle = '#ffffff';
  alb.fillRect(W - 24, 0, 24, 1024);

  // BOTTOM HALF: ASH WOOD HANDLE & LEATHER STRAPPING (Y: 1024 to 2048)
  const woodGrad = alb.createLinearGradient(0, 1024, W, 1024);
  woodGrad.addColorStop(0.0, '#a36735');
  woodGrad.addColorStop(0.4, '#c2854e');
  woodGrad.addColorStop(0.7, '#d69e64');
  woodGrad.addColorStop(1.0, '#985d2d');
  alb.fillStyle = woodGrad;
  alb.fillRect(0, 1024, W, 1024);

  // Fine longitudinal ash grain
  alb.fillStyle = 'rgba(88, 48, 18, 0.22)';
  for (let y = 1030; y < 2040; y += 16) {
    alb.fillRect(0, y, W, 3);
  }

  // Cross-hatched leather grip strapping (Y: 1300 to 1800)
  alb.fillStyle = '#5a2d16';
  alb.fillRect(0, 1320, W, 480);

  alb.strokeStyle = '#381a0b';
  alb.lineWidth = 8;
  for (let x = -W; x < W * 2; x += 90) {
    alb.beginPath();
    alb.moveTo(x, 1320);
    alb.lineTo(x + 480, 1800);
    alb.stroke();

    alb.beginPath();
    alb.moveTo(x + 480, 1320);
    alb.lineTo(x, 1800);
    alb.stroke();
  }

  // Studded copper rivets at strap edges
  for (let x = 60; x < W; x += 140) {
    drawRivet(alb, x, 1340, 9, true);
    drawRivet(alb, x, 1780, 9, true);
  }

  // Roughness Map
  rgh.fillStyle = '#404040'; // Forged steel ~0.35
  rgh.fillRect(0, 0, W, 1024);
  rgh.fillStyle = '#151515'; // mirror razor bevel
  rgh.fillRect(W - 120, 0, 120, 1024);
  rgh.fillStyle = '#787878'; // ash handle ~0.55
  rgh.fillRect(0, 1024, W, 1024);
  rgh.fillStyle = '#949494'; // leather grip ~0.65
  rgh.fillRect(0, 1320, W, 480);

  // Metalness Map (Axe head = high metal, handle = non-metal)
  met.fillStyle = '#f0f0f0';
  met.fillRect(0, 0, W, 1024);
  met.fillStyle = '#000000';
  met.fillRect(0, 1024, W, 1024);

  // Bump Map
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b8b8b8'; // touchmark raised
  bmp.beginPath();
  bmp.arc(markX, markY, 110, 0, Math.PI * 2);
  bmp.fill();

  const set = {
    map: toTexture(albC, true, false),
    roughnessMap: toTexture(rghC, false, false),
    metalnessMap: toTexture(metC, false, false),
    bumpMap: toTexture(bmpC, false, false)
  };
  textureCache.set('axeTools', set);
  return set;
}

/* ==========================================================================
   7. GOLDEN SAWDUST & WOOD CHIPS TEXTURES (getSawdustTextures)
   Dense golden pine sawdust, curled plane shavings & scattered wood chips
   ========================================================================== */
export function getSawdustTextures() {
  if (textureCache.has('sawdust')) return textureCache.get('sawdust');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Base golden sawdust gradient
  const dustGrad = alb.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.5);
  dustGrad.addColorStop(0.0, '#f2ca6b'); // Warm bright core
  dustGrad.addColorStop(0.4, '#e1b04c'); // Honey pine
  dustGrad.addColorStop(0.75, '#c59235'); // Amber fringe
  dustGrad.addColorStop(1.0, '#8c5e1c'); // Earthy dropoff
  alb.fillStyle = dustGrad;
  alb.fillRect(0, 0, W, H);

  // Dense particulate speckles of sawdust
  for (let s = 0; s < 450; s++) {
    const sx = (s * 419) % W;
    const sy = (s * 613) % H;
    const sr = 3 + (s % 6);

    alb.fillStyle = s % 3 === 0 ? '#fff3ba' : (s % 3 === 1 ? '#deb152' : '#9c661d');
    alb.beginPath();
    alb.arc(sx, sy, sr, 0, Math.PI * 2);
    alb.fill();
  }

  // Curled ribbons of wood plane shavings
  alb.lineWidth = 5;
  alb.lineCap = 'round';
  for (let c = 0; c < 80; c++) {
    const cx = ((c * 277) % (W - 200)) + 100;
    const cy = ((c * 383) % (H - 200)) + 100;
    const angle = (c * 1.37) % (Math.PI * 2);

    alb.save();
    alb.translate(cx, cy);
    alb.rotate(angle);

    // Shaving drop shadow
    alb.strokeStyle = 'rgba(74, 43, 11, 0.45)';
    alb.beginPath();
    alb.arc(3, 4, 22, 0, Math.PI * 1.3);
    alb.stroke();

    // Bright cream curled shaving body
    alb.strokeStyle = '#fae5ba';
    alb.beginPath();
    alb.arc(0, 0, 22, 0, Math.PI * 1.3);
    alb.stroke();
    alb.restore();
  }

  // Angular wood chips and bark flakes
  for (let k = 0; k < 60; k++) {
    const kx = ((k * 311) % (W - 140)) + 70;
    const ky = ((k * 487) % (H - 140)) + 70;

    alb.fillStyle = k % 2 === 0 ? '#633917' : '#cf9e53';
    alb.beginPath();
    alb.moveTo(kx, ky);
    alb.lineTo(kx + 16, ky + 4);
    alb.lineTo(kx + 10, ky + 22);
    alb.lineTo(kx - 4, ky + 14);
    alb.closePath();
    alb.fill();
  }

  // Roughness Map (Very matte powdery wood dust ~0.88)
  rgh.fillStyle = '#dedede';
  rgh.fillRect(0, 0, W, H);

  // Metalness Map (Pure non-metal)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump Map (Particulate noise)
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };
  textureCache.set('sawdust', set);
  return set;
}

/* ==========================================================================
   8. FORGED IRON LANTERN TEXTURES (getLanternTextures)
   Blackened wrought iron cage with glowing warm amber glass and candle flame
   ========================================================================== */
export function getLanternTextures() {
  if (textureCache.has('lantern')) return textureCache.get('lantern');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: metC, ctx: met } = createCanvas(1024, 1024);
  const { canvas: emiC, ctx: emi } = createCanvas(1024, 1024);

  // Glowing warm amber glass background
  const glassGrad = alb.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.45);
  glassGrad.addColorStop(0.0, '#fffbeb'); // Candle flame core
  glassGrad.addColorStop(0.25, '#fef08a');
  glassGrad.addColorStop(0.55, '#f59e0b'); // Golden amber
  glassGrad.addColorStop(0.85, '#d97706');
  glassGrad.addColorStop(1.0, '#78350f');
  alb.fillStyle = glassGrad;
  alb.fillRect(0, 0, W, H);

  // Emissive Map for glowing night light
  const emiGrad = emi.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.45);
  emiGrad.addColorStop(0.0, '#fff4cc');
  emiGrad.addColorStop(0.3, '#f59e0b');
  emiGrad.addColorStop(0.7, '#b45309');
  emiGrad.addColorStop(1.0, '#000000');
  emi.fillStyle = emiGrad;
  emi.fillRect(0, 0, W, H);

  // Blackened wrought iron frame borders & cross bars
  alb.fillStyle = '#1e293b';
  const borderThick = 64;
  alb.fillRect(0, 0, W, borderThick); // Top rim
  alb.fillRect(0, H - borderThick, W, borderThick); // Bottom rim
  alb.fillRect(0, 0, borderThick, H); // Left post
  alb.fillRect(W - borderThick, 0, borderThick, H); // Right post

  // Diagonal iron lattice bars
  alb.lineWidth = 24;
  alb.strokeStyle = '#1e293b';
  alb.beginPath();
  alb.moveTo(0, 0);
  alb.lineTo(W, H);
  alb.moveTo(W, 0);
  alb.lineTo(0, H);
  alb.stroke();

  // Rivets at intersections
  drawRivet(alb, borderThick * 0.5, borderThick * 0.5, 12, false);
  drawRivet(alb, W - borderThick * 0.5, borderThick * 0.5, 12, false);
  drawRivet(alb, borderThick * 0.5, H - borderThick * 0.5, 12, false);
  drawRivet(alb, W - borderThick * 0.5, H - borderThick * 0.5, 12, false);
  drawRivet(alb, W * 0.5, H * 0.5, 14, false);

  // Roughness Map (Glass shiny ~0.15, iron satin ~0.4)
  rgh.fillStyle = '#262626';
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#646464';
  rgh.fillRect(0, 0, W, borderThick);
  rgh.fillRect(0, H - borderThick, W, borderThick);
  rgh.fillRect(0, 0, borderThick, H);
  rgh.fillRect(W - borderThick, 0, borderThick, H);

  // Metalness Map (Iron bars are metal, glass is non-metal)
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#cccccc';
  met.fillRect(0, 0, W, borderThick);
  met.fillRect(0, H - borderThick, W, borderThick);
  met.fillRect(0, 0, borderThick, H);
  met.fillRect(W - borderThick, 0, borderThick, H);

  const set = {
    map: toTexture(albC, true, false),
    roughnessMap: toTexture(rghC, false, false),
    metalnessMap: toTexture(metC, false, false),
    emissiveMap: toTexture(emiC, true, false)
  };
  textureCache.set('lantern', set);
  return set;
}
