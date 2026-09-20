import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Bandit Raider (Bandido)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen Triple-A standards (Overwatch / Valorant).
 * 
 * Generates 2048x2048 ultra-crisp procedural PBR textures tailored to each component:
 * - getBanditFaceTextures(): Fierce battle-scarred barbarian face, red war paint, glowing angry eyes, thick wild beard
 * - getBanditHelmetTextures(): Dark iron spangenhelm plates, hammered mottling, cross-rib reinforcement bands, forged rivets
 * - getBanditFaceHelmetTextures(): Combined helper / fallback texture set
 * - getBanditHornTextures(): Aged bone horns with gradient shading from ivory base to charred blood-stained tips and growth rings
 * - getBanditBrigandineTextures(): Quilted dark leather cuirass with iron studs, crossed skull buckle harness
 * - getBanditRaggedClothTextures(): Ragged crimson cloth trim with frayed hems, loose threads, and dried blood grime
 * - getBanditArmsPauldronTextures(): Heavy spiked iron pauldron, scarred muscular barbarian arms, studded leather vambraces, spiked gloves
 * - getBanditLegsBootsTextures(): Patched raider trousers, shaggy fur knee wraps, studded leather greaves, combat boots with forged steel toe spikes
 * - getBanditFurTextures(): Shaggy layered predator fur with rich tuft strands, soft tips, and ambient root shadows
 * - getBanditWeaponTextures(): Spiked war club / mace with dark forged iron flanges, sharp iron spikes, carved glowing blood runes, spiral leather grip, and skull pommel
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
 * Draw stylized forged iron rivet with ambient drop shadow and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isDarkIron = true) {
  ctx.save();
  // Ambient drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
  ctx.fill();

  // Outer forged bevel ring
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  if (isDarkIron) {
    ringGrad.addColorStop(0, '#94a3b8');
    ringGrad.addColorStop(0.3, '#475569');
    ringGrad.addColorStop(0.7, '#1e293b');
    ringGrad.addColorStop(1.0, '#0f172a');
  } else {
    ringGrad.addColorStop(0, '#e2e8f0');
    ringGrad.addColorStop(0.3, '#94a3b8');
    ringGrad.addColorStop(0.7, '#475569');
    ringGrad.addColorStop(1.0, '#1e242c');
  }
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner specular dome
  const domeGrad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 1, cx, cy, radius * 0.82);
  if (isDarkIron) {
    domeGrad.addColorStop(0, '#cbd5e1');
    domeGrad.addColorStop(0.35, '#64748b');
    domeGrad.addColorStop(0.8, '#334155');
    domeGrad.addColorStop(1.0, '#0f172a');
  } else {
    domeGrad.addColorStop(0, '#ffffff');
    domeGrad.addColorStop(0.4, '#cbd5e1');
    domeGrad.addColorStop(0.8, '#64748b');
    domeGrad.addColorStop(1.0, '#1e293b');
  }
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw stylized square/pyramid forged iron stud with drop shadow
 */
function drawPyramidStud(ctx, cx, cy, size = 18) {
  ctx.save();
  const half = size * 0.5;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(cx - half + 2, cy - half + 3, size, size);

  // Top-left facet
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy - half);
  ctx.closePath();
  ctx.fill();

  // Top-right facet
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.closePath();
  ctx.fill();

  // Bottom-right facet
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + half, cy + half);
  ctx.lineTo(cx - half, cy + half);
  ctx.closePath();
  ctx.fill();

  // Bottom-left facet
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - half, cy + half);
  ctx.lineTo(cx - half, cy - half);
  ctx.closePath();
  ctx.fill();

  // Center apex spark
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  ctx.restore();
}

/**
 * Draw coarse leather sinew stitches along a line
 */
function drawStitches(ctx, x1, y1, x2, y2, stitchLen = 16, gap = 10, color = '#d4b896') {
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x1 + 1, y1 + 2);
  ctx.lineTo(x2 + 1, y2 + 2);
  ctx.stroke();

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
 * Draw a stylized menacing carved barbaric skull motif
 */
function drawSkullMotif(ctx, cx, cy, w = 180, h = 200, isBone = true) {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.ellipse(3, 5, w * 0.48, h * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();

  const skullGrad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
  if (isBone) {
    skullGrad.addColorStop(0.0, '#f5efe6');
    skullGrad.addColorStop(0.3, '#dfd2be');
    skullGrad.addColorStop(0.7, '#bda88e');
    skullGrad.addColorStop(1.0, '#735f49');
  } else {
    skullGrad.addColorStop(0.0, '#94a3b8');
    skullGrad.addColorStop(0.3, '#475569');
    skullGrad.addColorStop(0.7, '#1e293b');
    skullGrad.addColorStop(1.0, '#0f172a');
  }
  ctx.fillStyle = skullGrad;

  // Cranium dome & cheekbones
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h * 0.1);
  ctx.bezierCurveTo(-w * 0.5, -h * 0.45, w * 0.5, -h * 0.45, w * 0.42, -h * 0.1);
  ctx.bezierCurveTo(w * 0.48, 0, w * 0.38, h * 0.18, w * 0.28, h * 0.22);
  ctx.bezierCurveTo(w * 0.26, h * 0.35, w * 0.20, h * 0.46, 0, h * 0.47);
  ctx.bezierCurveTo(-w * 0.20, h * 0.47, -w * 0.26, h * 0.35, -w * 0.28, h * 0.22);
  ctx.bezierCurveTo(-w * 0.38, h * 0.18, -w * 0.48, 0, -w * 0.42, -h * 0.1);
  ctx.closePath();
  ctx.fill();

  // Heavy Angled Brow Ridge
  ctx.fillStyle = isBone ? '#7a644e' : '#1e293b';
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, -h * 0.12);
  ctx.lineTo(-w * 0.05, -h * 0.05);
  ctx.lineTo(0, -h * 0.08);
  ctx.lineTo(w * 0.05, -h * 0.05);
  ctx.lineTo(w * 0.36, -h * 0.12);
  ctx.lineTo(w * 0.28, -h * 0.18);
  ctx.lineTo(0, -h * 0.14);
  ctx.lineTo(-w * 0.28, -h * 0.18);
  ctx.closePath();
  ctx.fill();

  // Eye Sockets
  ctx.fillStyle = '#0a0806';
  ctx.beginPath();
  ctx.moveTo(-w * 0.30, -h * 0.08);
  ctx.lineTo(-w * 0.08, -h * 0.04);
  ctx.lineTo(-w * 0.12, h * 0.12);
  ctx.lineTo(-w * 0.28, h * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w * 0.30, -h * 0.08);
  ctx.lineTo(w * 0.08, -h * 0.04);
  ctx.lineTo(w * 0.12, h * 0.12);
  ctx.lineTo(w * 0.28, h * 0.08);
  ctx.closePath();
  ctx.fill();

  // Nasal Cavity
  ctx.beginPath();
  ctx.moveTo(0, h * 0.04);
  ctx.lineTo(-w * 0.06, h * 0.18);
  ctx.lineTo(0, h * 0.22);
  ctx.lineTo(w * 0.06, h * 0.18);
  ctx.closePath();
  ctx.fill();

  // Snarling Teeth with Sharp Fangs
  const toothW = w * 0.07;
  const toothH = h * 0.14;
  const toothY = h * 0.28;
  [-2.2, -1.1, 0, 1.1, 2.2].forEach((ox, idx) => {
    const isFang = idx === 0 || idx === 4;
    ctx.fillStyle = isBone ? (isFang ? '#fffbe8' : '#e6dac8') : '#cbd5e1';
    ctx.beginPath();
    const tx = ox * toothW;
    ctx.moveTo(tx - toothW * 0.4, toothY);
    ctx.lineTo(tx + toothW * 0.4, toothY);
    ctx.lineTo(tx, toothY + (isFang ? toothH * 1.35 : toothH));
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Bone Cracks
  ctx.strokeStyle = isBone ? '#5c4632' : '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -h * 0.38);
  ctx.lineTo(-w * 0.12, -h * 0.28);
  ctx.lineTo(-w * 0.20, -h * 0.20);
  ctx.lineTo(-w * 0.14, -h * 0.14);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw ancient carved barbarian / Norse blood runes with glowing channel
 */
function drawBloodRune(ctx, runeChar, cx, cy, size = 110, glowColor = '#ef4444', coreColor = '#ff8888') {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = '#2b0000';
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;

  ctx.font = `bold ${size}px "Courier New", monospace, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(runeChar, 0, 0);

  ctx.fillStyle = glowColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 24;
  ctx.fillText(runeChar, 0, 0);

  ctx.fillStyle = coreColor;
  ctx.shadowBlur = 6;
  ctx.fillText(runeChar, 0, 0);

  ctx.restore();
}

/**
 * Draw procedural scratches and weapon gouges
 */
function drawScratches(ctx, count, minX, minY, maxX, maxY, color = 'rgba(255, 255, 255, 0.22)') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const sx = minX + Math.random() * (maxX - minX);
    const sy = minY + Math.random() * (maxY - minY);
    const len = 20 + Math.random() * 45;
    const angle = (Math.random() - 0.5) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/* ==========================================================================
   1. DEDICATED FIERCE BATTLE-SCARRED BARBARIAN FACE TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditFaceTextures() {
  if (textureCache.has('faceDedicated')) return textureCache.get('faceDedicated');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);
  const { canvas: emiC, ctx: emi } = createCanvas(2048, 2048);

  // Background tanned skin with ambient vignette
  const bgGrad = alb.createRadialGradient(W * 0.5, H * 0.45, 200, W * 0.5, H * 0.45, 950);
  bgGrad.addColorStop(0.0, '#cf855d');
  bgGrad.addColorStop(0.5, '#ba744e');
  bgGrad.addColorStop(0.8, '#9c5936');
  bgGrad.addColorStop(1.0, '#381c10');
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Forehead furrow wrinkles & scowl
  alb.strokeStyle = '#4e2413';
  alb.lineWidth = 8;
  alb.beginPath();
  alb.arc(W * 0.5, H * 0.12, 280, Math.PI * 0.25, Math.PI * 0.75);
  alb.arc(W * 0.5, H * 0.17, 240, Math.PI * 0.25, Math.PI * 0.75);
  alb.stroke();

  // Heavy Brow Ridges (Angled fiercely downwards towards nose bridge)
  const browY = H * 0.28;
  alb.fillStyle = '#2b140a';
  // Left brow
  alb.beginPath();
  alb.moveTo(W * 0.18, browY - 30);
  alb.lineTo(W * 0.46, browY + 45);
  alb.lineTo(W * 0.44, browY + 85);
  alb.lineTo(W * 0.16, browY + 10);
  alb.closePath();
  alb.fill();

  // Right brow
  alb.beginPath();
  alb.moveTo(W * 0.82, browY - 30);
  alb.lineTo(W * 0.54, browY + 45);
  alb.lineTo(W * 0.56, browY + 85);
  alb.lineTo(W * 0.84, browY + 10);
  alb.closePath();
  alb.fill();

  // Smudged Charcoal / Kohl War Pigment around Eyes
  [-1, 1].forEach(dir => {
    const ex = W * 0.5 + dir * W * 0.20;
    const ey = H * 0.40;
    const kohlGrad = alb.createRadialGradient(ex, ey, 20, ex, ey, 140);
    kohlGrad.addColorStop(0.0, '#100a06');
    kohlGrad.addColorStop(0.6, 'rgba(30, 16, 10, 0.85)');
    kohlGrad.addColorStop(1.0, 'transparent');
    alb.fillStyle = kohlGrad;
    alb.beginPath();
    alb.arc(ex, ey, 140, 0, Math.PI * 2);
    alb.fill();
  });

  // Glowing Fierce Angry Eyes (Fiery Amber & Molten Orange)
  [-1, 1].forEach(dir => {
    const ex = W * 0.5 + dir * W * 0.20;
    const ey = H * 0.40;

    // Sclera
    alb.fillStyle = '#ecd3c2';
    alb.beginPath();
    alb.ellipse(ex, ey, 60, 30, dir * 0.15, 0, Math.PI * 2);
    alb.fill();

    // Fiery Iris
    const irisGrad = alb.createRadialGradient(ex, ey, 2, ex, ey, 26);
    irisGrad.addColorStop(0.0, '#fffbeb');
    irisGrad.addColorStop(0.3, '#f59e0b');
    irisGrad.addColorStop(0.7, '#ea580c');
    irisGrad.addColorStop(1.0, '#7c2d12');
    alb.fillStyle = irisGrad;
    alb.beginPath();
    alb.arc(ex, ey, 26, 0, Math.PI * 2);
    alb.fill();

    // Pupil
    alb.fillStyle = '#0a0301';
    alb.beginPath();
    alb.ellipse(ex, ey, 8, 22, 0, 0, Math.PI * 2);
    alb.fill();

    // Specular spark
    alb.fillStyle = '#ffffff';
    alb.beginPath();
    alb.arc(ex - 8, ey - 8, 6, 0, Math.PI * 2);
    alb.fill();

    // Emissive Glow Map
    const emiGrad = emi.createRadialGradient(ex, ey, 4, ex, ey, 80);
    emiGrad.addColorStop(0.0, '#ff6600');
    emiGrad.addColorStop(0.4, '#ea580c');
    emiGrad.addColorStop(0.8, 'rgba(220, 38, 38, 0.45)');
    emiGrad.addColorStop(1.0, 'transparent');
    emi.fillStyle = emiGrad;
    emi.beginPath();
    emi.arc(ex, ey, 80, 0, Math.PI * 2);
    emi.fill();
  });

  // Aggressive Red Tribal War Paint Streaks (Slashing diagonally across face)
  alb.save();
  alb.fillStyle = '#b91c1c';
  // Primary broad war paint slash across eyes & nose bridge
  alb.beginPath();
  alb.moveTo(W * 0.08, H * 0.32);
  alb.lineTo(W * 0.92, H * 0.46);
  alb.lineTo(W * 0.90, H * 0.54);
  alb.lineTo(W * 0.06, H * 0.40);
  alb.closePath();
  alb.fill();

  // Secondary slash across left cheek
  alb.beginPath();
  alb.moveTo(W * 0.12, H * 0.45);
  alb.lineTo(W * 0.48, H * 0.56);
  alb.lineTo(W * 0.46, H * 0.62);
  alb.lineTo(W * 0.10, H * 0.51);
  alb.closePath();
  alb.fill();

  // Emissive war paint glow (subtle incandescent red)
  emi.fillStyle = 'rgba(220, 38, 38, 0.5)';
  emi.beginPath();
  emi.moveTo(W * 0.08, H * 0.32);
  emi.lineTo(W * 0.92, H * 0.46);
  emi.lineTo(W * 0.90, H * 0.54);
  emi.lineTo(W * 0.06, H * 0.40);
  emi.closePath();
  emi.fill();
  alb.restore();

  // Battle Scar across Left Brow down to Cheek
  alb.save();
  alb.strokeStyle = '#450a0a';
  alb.lineWidth = 10;
  alb.beginPath();
  alb.moveTo(W * 0.28, H * 0.20);
  alb.lineTo(W * 0.33, H * 0.36);
  alb.lineTo(W * 0.26, H * 0.52);
  alb.stroke();

  alb.strokeStyle = '#e7a99b';
  alb.lineWidth = 4.5;
  alb.beginPath();
  alb.moveTo(W * 0.28, H * 0.20);
  alb.lineTo(W * 0.33, H * 0.36);
  alb.lineTo(W * 0.26, H * 0.52);
  alb.stroke();

  // Cross stitch marks along scar
  [0.24, 0.30, 0.38, 0.46].forEach(fy => {
    drawStitches(alb, W * 0.26, H * fy - 10, W * 0.34, H * fy + 10, 10, 3, '#3b0808');
  });
  alb.restore();

  // Drooping Barbarian Walrus Mustache (H * 0.56 -> H * 0.72)
  alb.fillStyle = '#20120a';
  alb.beginPath();
  alb.moveTo(W * 0.22, H * 0.62);
  alb.quadraticCurveTo(W * 0.50, H * 0.54, W * 0.78, H * 0.62);
  alb.quadraticCurveTo(W * 0.85, H * 0.76, W * 0.68, H * 0.78);
  alb.quadraticCurveTo(W * 0.50, H * 0.65, W * 0.32, H * 0.78);
  alb.quadraticCurveTo(W * 0.15, H * 0.76, W * 0.22, H * 0.62);
  alb.fill();

  // Snarling Gritted Teeth beneath Mustache
  alb.fillStyle = '#100503';
  alb.fillRect(W * 0.35, H * 0.66, W * 0.30, 35);
  alb.fillStyle = '#e5d7ba';
  for (let t = -4; t <= 4; t++) {
    alb.fillRect(W * 0.5 + t * 24 - 10, H * 0.66, 20, 30);
  }

  // Thick Wild Barbarian Beard (H * 0.68 -> H)
  const beardGrad = alb.createLinearGradient(0, H * 0.68, 0, H);
  beardGrad.addColorStop(0.0, '#321c10');
  beardGrad.addColorStop(0.4, '#20120a');
  beardGrad.addColorStop(0.8, '#140a05');
  beardGrad.addColorStop(1.0, '#0a0502');
  alb.fillStyle = beardGrad;

  alb.beginPath();
  alb.moveTo(W * 0.08, H * 0.62);
  alb.bezierCurveTo(W * 0.25, H * 0.70, W * 0.35, H * 0.74, W * 0.50, H * 0.75);
  alb.bezierCurveTo(W * 0.65, H * 0.74, W * 0.75, H * 0.70, W * 0.92, H * 0.62);
  alb.lineTo(W, H);
  alb.lineTo(0, H);
  alb.closePath();
  alb.fill();

  // Individual beard hair strands and highlights
  alb.strokeStyle = 'rgba(195, 135, 90, 0.3)';
  alb.lineWidth = 3;
  for (let i = 0; i < 350; i++) {
    const hx = W * 0.10 + Math.random() * W * 0.8;
    const hy = H * 0.64 + Math.random() * (H * 0.34);
    const hlen = 35 + Math.random() * 65;
    alb.beginPath();
    alb.moveTo(hx, hy);
    alb.quadraticCurveTo(hx + (Math.random() - 0.5) * 25, hy + hlen * 0.5, hx + (Math.random() - 0.5) * 45, hy + hlen);
    alb.stroke();
  }

  // Maps
  rgh.fillStyle = '#b8b8b8'; // Skin ~ 0.72
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#151515'; // Eyes ~ 0.08
  rgh.beginPath();
  rgh.arc(W * 0.30, H * 0.40, 30, 0, Math.PI * 2);
  rgh.arc(W * 0.70, H * 0.40, 30, 0, Math.PI * 2);
  rgh.fill();
  rgh.fillStyle = '#dcdcdc'; // Beard ~ 0.86
  rgh.fillRect(0, H * 0.68, W, H * 0.32);

  met.fillStyle = '#000000'; // All skin/hair non-metallic
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#404040'; // Eye cavities
  bmp.beginPath();
  bmp.arc(W * 0.30, H * 0.40, 45, 0, Math.PI * 2);
  bmp.arc(W * 0.70, H * 0.40, 45, 0, Math.PI * 2);
  bmp.fill();
  bmp.fillStyle = '#b5b5b5'; // Raised scar tissue
  bmp.beginPath();
  bmp.moveTo(W * 0.28, H * 0.20);
  bmp.lineTo(W * 0.33, H * 0.36);
  bmp.lineTo(W * 0.26, H * 0.52);
  bmp.stroke();

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false),
    emissiveMap: toTexture(emiC, false)
  };
  textureCache.set('faceDedicated', set);
  return set;
}

/* ==========================================================================
   2. DEDICATED IRON SPANGENHELM TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditHelmetTextures() {
  if (textureCache.has('helmetDedicated')) return textureCache.get('helmetDedicated');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Dark Forged Iron Base
  const helmGrad = alb.createLinearGradient(0, 0, 0, H);
  helmGrad.addColorStop(0.0, '#3f4958');
  helmGrad.addColorStop(0.3, '#2a313d');
  helmGrad.addColorStop(0.7, '#1b2028');
  helmGrad.addColorStop(1.0, '#0f1318');
  alb.fillStyle = helmGrad;
  alb.fillRect(0, 0, W, H);

  // Hammered dimple texture
  alb.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let i = 0; i < 500; i++) {
    const rx = Math.random() * W;
    const ry = Math.random() * H;
    alb.beginPath();
    alb.arc(rx, ry, 8 + Math.random() * 22, 0, Math.PI * 2);
    alb.fill();
  }

  // Cross-Rib Reinforcement Bands (Spangenhelm construction)
  // Horizontal Brow Band along middle/bottom
  const browH = 260;
  const browY = H - browH - 80;
  const browGrad = alb.createLinearGradient(0, browY, 0, browY + browH);
  browGrad.addColorStop(0.0, '#4b5563');
  browGrad.addColorStop(0.3, '#374151');
  browGrad.addColorStop(0.7, '#1f2937');
  browGrad.addColorStop(1.0, '#111827');
  alb.fillStyle = browGrad;
  alb.fillRect(0, browY, W, browH);

  // Heavy Forged Iron Rivets along Brow Band
  for (let x = 80; x < W; x += 160) {
    drawRivet(alb, x, browY + browH * 0.5, 24, true);
  }

  // Vertical Reinforcement Ribs (4 ribs at 0, 90, 180, 270)
  [W * 0.25, W * 0.50, W * 0.75].forEach(rx => {
    const ribW = 160;
    const ribGrad = alb.createLinearGradient(rx - ribW * 0.5, 0, rx + ribW * 0.5, 0);
    ribGrad.addColorStop(0.0, '#1f2937');
    ribGrad.addColorStop(0.25, '#4b5563');
    ribGrad.addColorStop(0.75, '#374151');
    ribGrad.addColorStop(1.0, '#111827');
    alb.fillStyle = ribGrad;
    alb.fillRect(rx - ribW * 0.5, 0, ribW, browY);

    for (let y = 80; y < browY; y += 140) {
      drawRivet(alb, rx, y, 20, true);
    }
  });

  // Battle Scratches & Weapon Gouges
  drawScratches(alb, 60, 20, 20, W - 20, H - 20, 'rgba(255, 255, 255, 0.35)');

  // Maps
  rgh.fillStyle = '#555555'; // Metal ~ 0.33
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#3a3a3a'; // Rivets ~ 0.23
  for (let x = 80; x < W; x += 160) {
    rgh.beginPath();
    rgh.arc(x, browY + browH * 0.5, 24, 0, Math.PI * 2);
    rgh.fill();
  }

  met.fillStyle = '#d6d6d6'; // Metal plates ~ 0.84
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#ebebeb'; // Rivets ~ 0.92
  for (let x = 80; x < W; x += 160) {
    met.beginPath();
    met.arc(x, browY + browH * 0.5, 24, 0, Math.PI * 2);
    met.fill();
  }

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#a5a5a5';
  bmp.fillRect(0, browY, W, browH);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('helmetDedicated', set);
  return set;
}

// Backwards-compatible alias for Face & Helmet
export function getBanditFaceHelmetTextures() {
  return getBanditFaceTextures();
}

/* ==========================================================================
   3. AGED BONE HORNS TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditHornTextures() {
  if (textureCache.has('horn')) return textureCache.get('horn');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const hornGrad = alb.createLinearGradient(0, H, 0, 0);
  hornGrad.addColorStop(0.0, '#4a331e');
  hornGrad.addColorStop(0.12, '#dfd2be');
  hornGrad.addColorStop(0.35, '#cbb89a');
  hornGrad.addColorStop(0.60, '#9a754e');
  hornGrad.addColorStop(0.82, '#481d13');
  hornGrad.addColorStop(1.0, '#100603');
  alb.fillStyle = hornGrad;
  alb.fillRect(0, 0, W, H);

  // Longitudinal bone fibers
  alb.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  alb.lineWidth = 3;
  for (let x = 0; x < W; x += 14) {
    alb.beginPath();
    alb.moveTo(x + (Math.random() - 0.5) * 8, 0);
    alb.lineTo(x + (Math.random() - 0.5) * 16, H);
    alb.stroke();
  }

  // Concentric Growth Rings
  for (let y = 100; y < H - 80; y += 75) {
    const ringDark = alb.createLinearGradient(0, y - 10, 0, y + 10);
    ringDark.addColorStop(0.0, 'rgba(0, 0, 0, 0.35)');
    ringDark.addColorStop(0.5, 'rgba(0, 0, 0, 0.15)');
    ringDark.addColorStop(1.0, 'rgba(255, 255, 255, 0.15)');
    alb.fillStyle = ringDark;
    alb.fillRect(0, y - 6, W, 12);
  }

  // Dried Blood Splatter Wash near the tip
  alb.fillStyle = 'rgba(120, 15, 15, 0.35)';
  for (let i = 0; i < 80; i++) {
    const bx = Math.random() * W;
    const by = Math.random() * (H * 0.45);
    const brad = 6 + Math.random() * 22;
    alb.beginPath();
    alb.arc(bx, by, brad, 0, Math.PI * 2);
    alb.fill();
  }

  // Weathered bone cracks
  alb.strokeStyle = '#321d10';
  alb.lineWidth = 3;
  for (let i = 0; i < 15; i++) {
    let cx = Math.random() * W;
    let cy = H * 0.2 + Math.random() * (H * 0.6);
    alb.beginPath();
    alb.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) {
      cx += (Math.random() - 0.5) * 40;
      cy += 20 + Math.random() * 30;
      alb.lineTo(cx, cy);
    }
    alb.stroke();
  }

  const rghGrad = rgh.createLinearGradient(0, H, 0, 0);
  rghGrad.addColorStop(0.0, '#a0a0a0');
  rghGrad.addColorStop(0.5, '#909090');
  rghGrad.addColorStop(1.0, '#505050');
  rgh.fillStyle = rghGrad;
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  for (let y = 100; y < H - 80; y += 75) {
    bmp.fillStyle = '#a5a5a5';
    bmp.fillRect(0, y - 4, W, 8);
  }

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('horn', set);
  return set;
}

/* ==========================================================================
   4. QUILTED BRIGANDINE CUIRASS & HARNESS TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditBrigandineTextures() {
  if (textureCache.has('brigandine')) return textureCache.get('brigandine');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Dark weathered leather base
  const cuirassGrad = alb.createLinearGradient(0, 0, 0, H);
  cuirassGrad.addColorStop(0.0, '#2c221d');
  cuirassGrad.addColorStop(0.5, '#1e1713');
  cuirassGrad.addColorStop(1.0, '#130d0a');
  alb.fillStyle = cuirassGrad;
  alb.fillRect(0, 0, W, H);

  // Leather grain micro-texture
  alb.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let y = 0; y < H; y += 6) {
    alb.fillRect(0, y, W, 2);
  }

  // Diamond Quilted Brigandine Seams across entire cuirass
  const step = 200;
  alb.strokeStyle = '#0a0705';
  alb.lineWidth = 8;
  alb.beginPath();
  for (let d = -W; d < W * 2; d += step) {
    alb.moveTo(d, 0);
    alb.lineTo(d + H, H);
    alb.moveTo(d, H);
    alb.lineTo(d + H, 0);
  }
  alb.stroke();

  alb.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  alb.lineWidth = 2.5;
  alb.beginPath();
  for (let d = -W; d < W * 2; d += step) {
    alb.moveTo(d + 4, 0);
    alb.lineTo(d + H + 4, H);
  }
  alb.stroke();

  // Heavy Forged Iron Studs at Diamond Grid Intersections
  for (let y = 100; y < H; y += step * 0.5) {
    for (let x = 100; x < W; x += step * 0.5) {
      drawRivet(alb, x, y, 18, true);
    }
  }

  // Crossed Heavy Leather Harness Straps
  const strapW = 160;
  [-1, 1].forEach(dir => {
    alb.save();
    alb.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    alb.lineWidth = strapW + 16;
    alb.beginPath();
    alb.moveTo(dir === 1 ? 0 : W, 0);
    alb.lineTo(dir === 1 ? W : 0, H);
    alb.stroke();

    const strapGrad = alb.createLinearGradient(0, 0, W, H);
    strapGrad.addColorStop(0.0, '#3e2316');
    strapGrad.addColorStop(0.5, '#2b170e');
    strapGrad.addColorStop(1.0, '#1c0f09');
    alb.strokeStyle = strapGrad;
    alb.lineWidth = strapW;
    alb.beginPath();
    alb.moveTo(dir === 1 ? 0 : W, 0);
    alb.lineTo(dir === 1 ? W : 0, H);
    alb.stroke();

    drawStitches(alb, dir === 1 ? 25 : W - 25, 0, dir === 1 ? W - 25 : 25, H, 18, 12, '#c7a982');
    alb.restore();
  });

  // Central Carved Bone Skull Medallion at Harness Crossing!
  drawSkullMotif(alb, W * 0.5, H * 0.50, 320, 350, true);

  // Maps
  rgh.fillStyle = '#bebebe'; // Leather ~ 0.75
  rgh.fillRect(0, 0, W, H);
  rgh.fillStyle = '#444444'; // Studs ~ 0.27
  for (let y = 100; y < H; y += step * 0.5) {
    for (let x = 100; x < W; x += step * 0.5) {
      rgh.beginPath();
      rgh.arc(x, y, 18, 0, Math.PI * 2);
      rgh.fill();
    }
  }
  rgh.fillStyle = '#8a8a8a'; // Skull medallion ~ 0.55
  rgh.fillRect(W * 0.5 - 160, H * 0.50 - 175, 320, 350);

  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  met.fillStyle = '#e0e0e0';
  for (let y = 100; y < H; y += step * 0.5) {
    for (let x = 100; x < W; x += step * 0.5) {
      met.beginPath();
      met.arc(x, y, 18, 0, Math.PI * 2);
      met.fill();
    }
  }

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#b0b0b0';
  for (let y = 100; y < H; y += step * 0.5) {
    for (let x = 100; x < W; x += step * 0.5) {
      bmp.beginPath();
      bmp.arc(x, y, 18, 0, Math.PI * 2);
      bmp.fill();
    }
  }

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('brigandine', set);
  return set;
}

/* ==========================================================================
   5. RAGGED CRIMSON CLOTH TRIM TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditRaggedClothTextures() {
  if (textureCache.has('raggedCloth')) return textureCache.get('raggedCloth');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const clothGrad = alb.createLinearGradient(0, 0, 0, H);
  clothGrad.addColorStop(0.0, '#991b1b');
  clothGrad.addColorStop(0.4, '#7f1d1d');
  clothGrad.addColorStop(0.8, '#450a0a');
  clothGrad.addColorStop(1.0, '#1c0404');
  alb.fillStyle = clothGrad;
  alb.fillRect(0, 0, W, H);

  // Woven cloth micro-texture
  alb.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let x = 0; x < W; x += 8) {
    alb.fillRect(x, 0, 2, H);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let y = 0; y < H; y += 8) {
    alb.fillRect(0, y, W, 2);
  }

  // Frayed & Torn Ragged Hem
  alb.fillStyle = '#110303';
  alb.beginPath();
  alb.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) {
    const jaggedH = 40 + Math.random() * 85;
    alb.lineTo(x, H - jaggedH);
  }
  alb.lineTo(W, H);
  alb.closePath();
  alb.fill();

  // Loose frayed thread strands
  alb.strokeStyle = '#fca5a5';
  alb.lineWidth = 2.5;
  for (let x = 10; x < W; x += 25) {
    alb.beginPath();
    alb.moveTo(x, H - 65);
    alb.lineTo(x + (Math.random() - 0.5) * 25, H - 5 + Math.random() * 15);
    alb.stroke();
  }

  // Dried Blood Splatters
  alb.fillStyle = 'rgba(69, 10, 10, 0.65)';
  for (let i = 0; i < 80; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    alb.beginPath();
    alb.arc(sx, sy, 6 + Math.random() * 24, 0, Math.PI * 2);
    alb.fill();
  }

  rgh.fillStyle = '#dcdcdc'; // Rough cloth ~ 0.86
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('raggedCloth', set);
  return set;
}

/* ==========================================================================
   6. SPIKED PAULDRON, ARMS & STUDDED VAMBRACES TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditArmsPauldronTextures() {
  if (textureCache.has('armsPauldron')) return textureCache.get('armsPauldron');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const pauldronGrad = alb.createLinearGradient(0, 0, 0, H);
  pauldronGrad.addColorStop(0.0, '#3f4958');
  pauldronGrad.addColorStop(0.3, '#2b323d');
  pauldronGrad.addColorStop(0.7, '#1c212a');
  pauldronGrad.addColorStop(1.0, '#10141a');
  alb.fillStyle = pauldronGrad;
  alb.fillRect(0, 0, W, H);

  alb.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let i = 0; i < 300; i++) {
    const rx = Math.random() * W;
    const ry = Math.random() * H;
    alb.beginPath();
    alb.arc(rx, ry, 10 + Math.random() * 20, 0, Math.PI * 2);
    alb.fill();
  }

  // Plate Lamination Bevels
  alb.strokeStyle = '#475569';
  alb.lineWidth = 16;
  alb.beginPath();
  alb.moveTo(0, H * 0.35);
  alb.lineTo(W, H * 0.35);
  alb.moveTo(0, H * 0.70);
  alb.lineTo(W, H * 0.70);
  alb.stroke();

  // Iron Rim Rivets
  for (let x = 80; x < W; x += 160) {
    drawRivet(alb, x, H * 0.35, 22, true);
    drawRivet(alb, x, H * 0.70, 22, true);
  }

  drawScratches(alb, 55, 20, 20, W - 20, H - 20, 'rgba(255, 255, 255, 0.35)');

  rgh.fillStyle = '#555555';
  rgh.fillRect(0, 0, W, H);
  for (let x = 80; x < W; x += 160) {
    rgh.beginPath();
    rgh.arc(x, H * 0.35, 22, 0, Math.PI * 2);
    rgh.arc(x, H * 0.70, 22, 0, Math.PI * 2);
    rgh.fill();
  }

  met.fillStyle = '#d6d6d6';
  met.fillRect(0, 0, W, H);
  for (let x = 80; x < W; x += 160) {
    met.beginPath();
    met.arc(x, H * 0.35, 22, 0, Math.PI * 2);
    met.arc(x, H * 0.70, 22, 0, Math.PI * 2);
    met.fill();
  }

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('armsPauldron', set);
  return set;
}

/* ==========================================================================
   7. RAIDER TROUSERS & SPIKED BOOTS TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditLegsBootsTextures() {
  if (textureCache.has('legsBoots')) return textureCache.get('legsBoots');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const trouserGrad = alb.createLinearGradient(0, 0, 0, H);
  trouserGrad.addColorStop(0.0, '#312b27');
  trouserGrad.addColorStop(0.5, '#241f1c');
  trouserGrad.addColorStop(1.0, '#161311');
  alb.fillStyle = trouserGrad;
  alb.fillRect(0, 0, W, H);

  // Rough burlap micro-texture
  alb.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let x = 0; x < W; x += 10) {
    alb.fillRect(x, 0, 3, H);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = 0; y < H; y += 10) {
    alb.fillRect(0, y, W, 3);
  }

  // Stitched Leather Patches
  const patches = [
    { x: W * 0.15, y: H * 0.20, w: 320, h: 260, color: '#3f2b1d' },
    { x: W * 0.58, y: H * 0.45, w: 360, h: 280, color: '#2b211a' },
    { x: W * 0.30, y: H * 0.70, w: 300, h: 240, color: '#4a3726' }
  ];

  patches.forEach(p => {
    alb.fillStyle = 'rgba(0, 0, 0, 0.5)';
    alb.fillRect(p.x + 4, p.y + 4, p.w, p.h);

    alb.fillStyle = p.color;
    alb.fillRect(p.x, p.y, p.w, p.h);

    drawStitches(alb, p.x, p.y, p.x + p.w, p.y, 14, 8, '#d5c4a1');
    drawStitches(alb, p.x + p.w, p.y, p.x + p.w, p.y + p.h, 14, 8, '#d5c4a1');
    drawStitches(alb, p.x + p.w, p.y + p.h, p.x, p.y + p.h, 14, 8, '#d5c4a1');
    drawStitches(alb, p.x, p.y + p.h, p.x, p.y, 14, 8, '#d5c4a1');
  });

  rgh.fillStyle = '#dcdcdc'; // Trouser cloth ~ 0.86
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

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
   8. PROCEDURAL SHAGGY PREDATOR FUR TEXTURES (2048x2048)
   ========================================================================== */
export function getBanditFurTextures() {
  if (textureCache.has('fur')) return textureCache.get('fur');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  const fGrad = alb.createLinearGradient(0, 0, 0, H);
  fGrad.addColorStop(0.0, '#36281e');
  fGrad.addColorStop(0.3, '#261b13');
  fGrad.addColorStop(0.7, '#18100b');
  fGrad.addColorStop(1.0, '#0f0906');
  alb.fillStyle = fGrad;
  alb.fillRect(0, 0, W, H);

  for (let row = 0; row < 12; row++) {
    const ry = (row / 12) * H;
    for (let col = 0; col < 20; col++) {
      const rx = (col / 20) * W + (row % 2 === 0 ? 30 : -30);
      const tuftW = 40 + Math.random() * 50;
      const tuftH = 80 + Math.random() * 120;

      alb.fillStyle = 'rgba(10, 5, 2, 0.6)';
      alb.beginPath();
      alb.moveTo(rx - tuftW * 0.5 + 4, ry + 4);
      alb.lineTo(rx + 4, ry + tuftH + 4);
      alb.lineTo(rx + tuftW * 0.5 + 4, ry + 4);
      alb.closePath();
      alb.fill();

      const tGrad = alb.createLinearGradient(rx, ry, rx, ry + tuftH);
      tGrad.addColorStop(0.0, '#4e3828');
      tGrad.addColorStop(0.5, '#6a4f3a');
      tGrad.addColorStop(1.0, '#917154');
      alb.fillStyle = tGrad;
      alb.beginPath();
      alb.moveTo(rx - tuftW * 0.5, ry);
      alb.lineTo(rx, ry + tuftH);
      alb.lineTo(rx + tuftW * 0.5, ry);
      alb.closePath();
      alb.fill();
    }
  }

  alb.strokeStyle = 'rgba(230, 205, 175, 0.45)';
  alb.lineWidth = 2;
  for (let i = 0; i < 500; i++) {
    const hx = Math.random() * W;
    const hy = Math.random() * H;
    alb.beginPath();
    alb.moveTo(hx, hy);
    alb.lineTo(hx + (Math.random() - 0.5) * 15, hy + 30 + Math.random() * 40);
    alb.stroke();
  }

  rgh.fillStyle = '#e6e6e6';
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false)
  };
  textureCache.set('fur', set);
  return set;
}

/* ==========================================================================
   9. SPIKED WAR CLUB / MACE TEXTURES (WITH GLOWING BLOOD RUNES & SKULL POMMEL)
   ========================================================================== */
export function getBanditWeaponTextures() {
  if (textureCache.has('weapon')) return textureCache.get('weapon');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);
  const { canvas: emiC, ctx: emi } = createCanvas(2048, 2048);

  const maceGrad = alb.createLinearGradient(0, 0, 0, H * 0.45);
  maceGrad.addColorStop(0.0, '#424d5d');
  maceGrad.addColorStop(0.3, '#2a323d');
  maceGrad.addColorStop(0.7, '#1b2028');
  maceGrad.addColorStop(1.0, '#10141a');
  alb.fillStyle = maceGrad;
  alb.fillRect(0, 0, W, H * 0.45);

  alb.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let i = 0; i < 300; i++) {
    const rx = Math.random() * W;
    const ry = Math.random() * (H * 0.45);
    alb.beginPath();
    alb.arc(rx, ry, 8 + Math.random() * 20, 0, Math.PI * 2);
    alb.fill();
  }

  // Striking blade edges
  alb.strokeStyle = '#94a3b8';
  alb.lineWidth = 14;
  for (let x = W * 0.2; x < W; x += W * 0.25) {
    alb.beginPath();
    alb.moveTo(x, 0);
    alb.lineTo(x, H * 0.45);
    alb.stroke();
  }

  // Spikes
  for (let y = 100; y < H * 0.42; y += 140) {
    for (let x = 120; x < W; x += 220) {
      drawPyramidStud(alb, x, y, 42);
    }
  }

  drawScratches(alb, 40, 20, 20, W - 20, H * 0.43, 'rgba(255, 255, 255, 0.4)');

  // Ancient Carved Barbarian Blood Runes (ᛏ, ᚱ, ᚲ, ᛉ, ᛋ, ᛟ, ᚦ)
  const runes = ['ᛏ', 'ᚱ', 'ᚲ', 'ᛉ', 'ᛋ', 'ᛟ', 'ᚦ'];
  runes.forEach((r, idx) => {
    const rx = 140 + idx * 260;
    const ry = H * 0.22;
    if (rx < W - 100) {
      drawBloodRune(alb, r, rx, ry, 130, '#dc2626', '#fca5a5');
      drawBloodRune(emi, r, rx, ry, 130, '#ff1a1a', '#ffffff');
    }
  });

  // Leather Grip
  const gripGrad = alb.createLinearGradient(0, H * 0.45, 0, H * 0.80);
  gripGrad.addColorStop(0.0, '#2e1f16');
  gripGrad.addColorStop(0.5, '#1e140e');
  gripGrad.addColorStop(1.0, '#120b07');
  alb.fillStyle = gripGrad;
  alb.fillRect(0, H * 0.45, W, H * 0.35);

  const bandStep = 90;
  alb.strokeStyle = '#0a0604';
  alb.lineWidth = 14;
  alb.beginPath();
  for (let y = H * 0.45 - 200; y < H * 0.80 + 200; y += bandStep) {
    alb.moveTo(0, y);
    alb.lineTo(W, y + 260);
  }
  alb.stroke();

  alb.strokeStyle = '#4e3626';
  alb.lineWidth = 5;
  alb.beginPath();
  for (let y = H * 0.45 - 200; y < H * 0.80 + 200; y += bandStep) {
    alb.moveTo(0, y - 6);
    alb.lineTo(W, y + 254);
  }
  alb.stroke();

  for (let y = H * 0.45 - 200; y < H * 0.80 + 200; y += bandStep) {
    drawStitches(alb, 20, y + 10, W - 20, y + 270, 14, 10, '#cbb28d');
  }

  [H * 0.45, H * 0.80].forEach(ry => {
    const ringGrad = alb.createLinearGradient(0, ry - 25, 0, ry + 25);
    ringGrad.addColorStop(0.0, '#94a3b8');
    ringGrad.addColorStop(0.3, '#475569');
    ringGrad.addColorStop(0.7, '#1e293b');
    ringGrad.addColorStop(1.0, '#0f172a');
    alb.fillStyle = ringGrad;
    alb.fillRect(0, ry - 20, W, 40);

    for (let x = 60; x < W; x += 120) {
      drawRivet(alb, x, ry, 12, true);
    }
  });

  // Skull Pommel
  const pommelGrad = alb.createLinearGradient(0, H * 0.80, 0, H);
  pommelGrad.addColorStop(0.0, '#382b22');
  pommelGrad.addColorStop(0.5, '#261b14');
  pommelGrad.addColorStop(1.0, '#100a06');
  alb.fillStyle = pommelGrad;
  alb.fillRect(0, H * 0.80, W, H * 0.20);

  drawSkullMotif(alb, W * 0.5, H * 0.90, 260, 240, true);

  // Maps
  rgh.fillStyle = '#505050';
  rgh.fillRect(0, 0, W, H * 0.45);
  rgh.fillStyle = '#b8b8b8';
  rgh.fillRect(0, H * 0.45, W, H * 0.35);
  rgh.fillStyle = '#3a3a3a';
  [H * 0.45, H * 0.80].forEach(ry => {
    rgh.fillRect(0, ry - 20, W, 40);
  });
  rgh.fillStyle = '#909090';
  rgh.fillRect(0, H * 0.80, W, H * 0.20);

  met.fillStyle = '#dbdbdb';
  met.fillRect(0, 0, W, H * 0.45);
  met.fillStyle = '#000000';
  met.fillRect(0, H * 0.45, W, H * 0.35);
  met.fillStyle = '#ebebeb';
  [H * 0.45, H * 0.80].forEach(ry => {
    met.fillRect(0, ry - 20, W, 40);
  });
  met.fillStyle = '#000000';
  met.fillRect(0, H * 0.80, W, H * 0.20);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true),
    roughnessMap: toTexture(rghC, false),
    metalnessMap: toTexture(metC, false),
    bumpMap: toTexture(bmpC, false),
    emissiveMap: toTexture(emiC, false)
  };
  textureCache.set('weapon', set);
  return set;
}
