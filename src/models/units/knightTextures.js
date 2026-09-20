import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Knight
 * Valorant / Overwatch / Unreal Engine 5 Stylized Masterpiece Art Style.
 * 
 * Generates 2048x2048 crisp textures tailored to each component:
 * - Breastplate & Gorget (Sculpted steel, central keel, gold gorget, rivets)
 * - Royal Blue Tunic & Gambeson (Intricate golden embroidery, cloth weave, fold shading)
 * - War Belt & Pouch (Mahogany leather, gold lion buckle, brass eyelets, stitching)
 * - Helmet & Visor (Steel dome, brow reinforcement, glowing eye slit, breathing holes)
 * - Feather Plume (Vibrant multi-tone scarlet & crimson with soft strand highlights)
 * - Royal Kite Shield (Cobalt blue field, magnificent golden rampant lion, steel rim, rivets)
 * - Shield Back (Aged oak planks, padded tufted leather arm cushion, straps, buckles)
 * - Royal Broadsword (Fuller groove, mirror cutting edges, golden runic engravings, ruby gem)
 * - Pauldrons & Limbs (Tiered laminations, couters, poleyns with gold stars, sabatons)
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
 * Helper: draw stylized rivet/bolt with drop shadow and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  // Soft ambient drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
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
 * Helper: draw intricate gold embroidery filigree
 */
function drawFiligreeBand(ctx, x, y, w, h) {
  // Gold gradient background
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

  // Braided knotwork / diamond motifs
  const step = 60;
  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let px = x + 20; px < x + w - 20; px += step) {
    const midY = y + h / 2;
    ctx.moveTo(px, midY);
    ctx.lineTo(px + step / 2, y + 8);
    ctx.lineTo(px + step, midY);
    ctx.lineTo(px + step / 2, y + h - 8);
    ctx.closePath();

    // Center gold stud
    ctx.fillStyle = '#fef08a';
    ctx.arc(px + step / 2, midY, 4, 0, Math.PI * 2);
  }
  ctx.stroke();
}

// =========================================================================
// 1. BREASTPLATE & CUIRASS TEXTURE
// =========================================================================
export function getKnightCuirassTextures() {
  if (textureCache.has('cuirass')) return textureCache.get('cuirass');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Stylized Steel Gradient: Bright top-down lighting with warm bounce
  const steelGrad = ctx.createLinearGradient(0, 0, 0, height);
  steelGrad.addColorStop(0, '#f1f5f9');    // Shoulder highlight
  steelGrad.addColorStop(0.15, '#e2e8f0'); // Polished upper plate
  steelGrad.addColorStop(0.5, '#94a3b8');  // Mid steel body
  steelGrad.addColorStop(0.85, '#475569'); // Shaded lower ribs
  steelGrad.addColorStop(1, '#1e293b');    // Deep ambient occlusion waist

  ctx.fillStyle = steelGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle hand-painted brushed steel streaks
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  for (let i = 0; i < 50; i++) {
    const sy = Math.random() * height;
    ctx.fillRect(0, sy, width, 2 + Math.random() * 6);
  }

  // PBR Properties: Polished steel (roughness ~ 0.32, metalness ~ 0.68)
  rCtx.fillStyle = '#525252';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#b3b3b3'; // 0.70 metalness: permits bright albedo while reflecting key light
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Central Vertical Keel Ridge (Gothic Armor Feature)
  const cx = width / 2;
  const keelGrad = ctx.createLinearGradient(cx - 50, 0, cx + 50, 0);
  keelGrad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
  keelGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.75)');
  keelGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.95)');
  keelGrad.addColorStop(1, 'rgba(15, 23, 42, 0.45)');

  ctx.fillStyle = keelGrad;
  ctx.fillRect(cx - 45, 120, 90, height - 240);

  // Keel bump
  const bKeel = bCtx.createLinearGradient(cx - 45, 0, cx + 45, 0);
  bKeel.addColorStop(0, '#606060');
  bKeel.addColorStop(0.5, '#d0d0d0');
  bKeel.addColorStop(1, '#606060');
  bCtx.fillStyle = bKeel;
  bCtx.fillRect(cx - 45, 120, 90, height - 240);

  // Pectoral Plate Contour Lines & Ambient Occlusion
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  // Left pectoral arc
  ctx.moveTo(cx - 40, 650);
  ctx.bezierCurveTo(cx - 250, 680, cx - 600, 580, cx - 750, 420);
  // Right pectoral arc
  ctx.moveTo(cx + 40, 650);
  ctx.bezierCurveTo(cx + 250, 680, cx + 600, 580, cx + 750, 420);
  ctx.stroke();

  // Edge highlights on pectoral contours
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 40, 642);
  ctx.bezierCurveTo(cx - 250, 672, cx - 600, 572, cx - 750, 412);
  ctx.moveTo(cx + 40, 642);
  ctx.bezierCurveTo(cx + 250, 672, cx + 600, 572, cx + 750, 412);
  ctx.stroke();

  // Upper Gorget Plate (Neck Collar) with Gold Filigree Band
  drawFiligreeBand(ctx, 120, 40, width - 240, 140);
  mCtx.fillStyle = '#ffffff';
  mCtx.fillRect(120, 40, width - 240, 140);
  rCtx.fillStyle = '#3a3a3a';
  rCtx.fillRect(120, 40, width - 240, 140);
  bCtx.fillStyle = '#b0b0b0';
  bCtx.fillRect(120, 40, width - 240, 140);

  // Gold Rivets along Gorget
  for (let gx = 220; gx <= width - 220; gx += 200) {
    drawRivet(ctx, gx, 110, 14, true);
    drawRivet(bCtx, gx, 110, 14, false);
  }

  // Outer Border Bevels & Rivets
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('cuirass', texSet);
  return texSet;
}

// =========================================================================
// 2. ROYAL BLUE EMBROIDERED TUNIC & GAMBESON TEXTURE
// =========================================================================
export function getKnightTunicTextures() {
  if (textureCache.has('tunic')) return textureCache.get('tunic');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Rich Royal Cobalt Blue Fabric
  const blueGrad = ctx.createLinearGradient(0, 0, 0, height);
  blueGrad.addColorStop(0, '#1d4ed8');   // Vibrant royal blue
  blueGrad.addColorStop(0.3, '#1e40af'); // Classic cobalt
  blueGrad.addColorStop(0.7, '#1e3a8a'); // Deep navy
  blueGrad.addColorStop(1, '#0f172a');   // Shadow hem

  ctx.fillStyle = blueGrad;
  ctx.fillRect(0, 0, width, height);

  // Pleated Fabric Folds (Vertical stylized shadow & highlight channels)
  const pleatW = width / 12;
  for (let i = 0; i < 12; i++) {
    const px = i * pleatW;
    const pleat = ctx.createLinearGradient(px, 0, px + pleatW, 0);
    pleat.addColorStop(0, 'rgba(10, 15, 35, 0.6)');
    pleat.addColorStop(0.4, 'rgba(96, 165, 250, 0.35)');
    pleat.addColorStop(0.6, 'rgba(147, 197, 253, 0.45)');
    pleat.addColorStop(1, 'rgba(15, 23, 42, 0.55)');

    ctx.fillStyle = pleat;
    ctx.fillRect(px, 0, pleatW, height);

    // Bump for cloth pleats
    const bPleat = bCtx.createLinearGradient(px, 0, px + pleatW, 0);
    bPleat.addColorStop(0, '#555555');
    bPleat.addColorStop(0.5, '#a5a5a5');
    bPleat.addColorStop(1, '#555555');
    bCtx.fillStyle = bPleat;
    bCtx.fillRect(px, 0, pleatW, height);
  }

  // Fabric Weave Noise (Micro-texture)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let y = 0; y < height; y += 8) {
    ctx.fillRect(0, y, width, 4);
  }

  // Tunic fabric roughness: 0.90 (matte diffuse), metalness: 0.0
  rCtx.fillStyle = '#e6e6e6';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);

  // Grand Golden Embroidered Border along Hem (Bottom 25%)
  const hemY = height - 360;
  const hemH = 360;
  drawFiligreeBand(ctx, 40, hemY, width - 80, 160);
  drawFiligreeBand(ctx, 40, hemY + 180, width - 80, 140);

  // Gold embroidery metalness: 0.85, roughness: 0.28
  mCtx.fillStyle = '#d9d9d9';
  mCtx.fillRect(40, hemY, width - 80, hemH);
  rCtx.fillStyle = '#474747';
  rCtx.fillRect(40, hemY, width - 80, hemH);
  bCtx.fillStyle = '#c5c5c5';
  bCtx.fillRect(40, hemY, width - 80, hemH);

  // Gold fleur-de-lis / diamond motifs along bottom edge
  for (let bx = 120; bx < width - 120; bx += 240) {
    drawRivet(ctx, bx, hemY + 80, 16, true);
    drawRivet(ctx, bx + 120, hemY + 250, 14, true);
  }

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('tunic', texSet);
  return texSet;
}

// =========================================================================
// 3. WAR BELT & POUCH TEXTURE
// =========================================================================
export function getKnightBeltTextures() {
  if (textureCache.has('belt')) return textureCache.get('belt');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Deep Mahogany Stitched Leather
  const leatherGrad = ctx.createLinearGradient(0, 0, 0, height);
  leatherGrad.addColorStop(0, '#3f1d0b');
  leatherGrad.addColorStop(0.2, '#78350f');
  leatherGrad.addColorStop(0.5, '#92400e');
  leatherGrad.addColorStop(0.8, '#78350f');
  leatherGrad.addColorStop(1, '#271105');

  ctx.fillStyle = leatherGrad;
  ctx.fillRect(0, 0, width, height);

  // Leather PBR: roughness = 0.78, metalness = 0.0
  rCtx.fillStyle = '#c7c7c7';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Yellow/cream double edge stitching
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 6;
  ctx.setLineDash([24, 20]);
  ctx.strokeRect(30, 40, width - 60, height - 80);
  ctx.strokeRect(60, 70, width - 120, height - 140);
  ctx.setLineDash([]);

  // Giant Golden Lion Head Buckle in Center
  const cx = width / 2;
  const cy = height / 2;
  drawRampantLion(bCtx, cx, cy, 3.2, 3.2, '#c8c8c8');
  drawRampantLion(rCtx, cx, cy, 3.2, 3.2, '#383838');
  drawRampantLion(ctx, cx, cy, 3.2);

  // Brass eyelets along belt
  for (let bx = 160; bx < width - 160; bx += 280) {
    if (Math.abs(bx - cx) > 480) {
      drawRivet(ctx, bx, cy, 26, true);
      drawRivet(bCtx, bx, cy, 26, false);
      mCtx.fillStyle = '#ffffff';
      mCtx.beginPath();
      mCtx.arc(bx, cy, 26, 0, Math.PI * 2);
      mCtx.fill();
    }
  }

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('belt', texSet);
  return texSet;
}

// =========================================================================
// 4. HELMET & VISOR TEXTURE
// =========================================================================
export function getKnightHelmetFaceTextures() {
  if (textureCache.has('helmFace')) return textureCache.get('helmFace');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Polished Steel Faceplate
  const steelGrad = ctx.createLinearGradient(0, 0, 0, height);
  steelGrad.addColorStop(0, '#f8fafc');
  steelGrad.addColorStop(0.2, '#e2e8f0');
  steelGrad.addColorStop(0.6, '#94a3b8');
  steelGrad.addColorStop(1, '#334155');

  ctx.fillStyle = steelGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#4c4c4c';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#b8b8b8'; // 0.72 metalness
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Golden Brow Reinforcement Band
  const browY = 320;
  const browH = 240;
  drawFiligreeBand(ctx, 60, browY, width - 120, browH);
  mCtx.fillStyle = '#ffffff';
  mCtx.fillRect(60, browY, width - 120, browH);
  rCtx.fillStyle = '#3a3a3a';
  rCtx.fillRect(60, browY, width - 120, browH);

  // Brow rivets
  for (let rx = 160; rx <= width - 160; rx += 220) {
    drawRivet(ctx, rx, browY + browH / 2, 22, true);
  }

  // The Glowing Dark Eye Visor Slit
  const slitY = browY + browH + 80;
  const slitH = 140;
  const slitW = width - 360;
  const slitX = 180;

  // Deep shadow inside visor
  ctx.fillStyle = '#05070a';
  ctx.beginPath();
  ctx.roundRect(slitX, slitY, slitW, slitH, 28);
  ctx.fill();

  // Stylized cyan / white eye reflection glint
  const slitGlint = ctx.createLinearGradient(slitX, slitY, slitX + slitW, slitY);
  slitGlint.addColorStop(0, 'rgba(0, 0, 0, 1)');
  slitGlint.addColorStop(0.3, 'rgba(56, 189, 248, 0.6)');
  slitGlint.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  slitGlint.addColorStop(0.7, 'rgba(56, 189, 248, 0.6)');
  slitGlint.addColorStop(1, 'rgba(0, 0, 0, 1)');

  ctx.fillStyle = slitGlint;
  ctx.fillRect(slitX + 60, slitY + 45, slitW - 120, 40);

  // Visor slit inner depth in PBR
  rCtx.fillStyle = '#101010';
  rCtx.fillRect(slitX, slitY, slitW, slitH);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(slitX, slitY, slitW, slitH);
  bCtx.fillStyle = '#202020';
  bCtx.fillRect(slitX, slitY, slitW, slitH);

  // Lower Bevor Breathing Perforations (Cross and circle vent array)
  const ventY = slitY + slitH + 120;
  for (let col = -3; col <= 3; col++) {
    for (let row = 0; row < 3; row++) {
      const vx = width / 2 + col * 140;
      const vy = ventY + row * 110;
      drawRivet(ctx, vx, vy, 16, false);
      bCtx.fillStyle = '#303030';
      bCtx.beginPath();
      bCtx.arc(vx, vy, 16, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('helmFace', texSet);
  return texSet;
}

// =========================================================================
// 5. FLOWING CRIMSON FEATHER PLUME TEXTURE
// =========================================================================
export function getKnightPlumeTextures() {
  if (textureCache.has('plume')) return textureCache.get('plume');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Rich cadmium red / scarlet / crimson gradient
  const plumeGrad = ctx.createLinearGradient(0, 0, width, height);
  plumeGrad.addColorStop(0, '#ff4757');   // Bright scarlet feather tips
  plumeGrad.addColorStop(0.3, '#ee1133');  // Vibrant ruby red
  plumeGrad.addColorStop(0.65, '#b71540'); // Deep crimson core
  plumeGrad.addColorStop(0.9, '#780c28');  // Wine shadow
  plumeGrad.addColorStop(1, '#450414');    // Deep root shadow

  ctx.fillStyle = plumeGrad;
  ctx.fillRect(0, 0, width, height);

  // Hand-Painted Stylized Feather Strands & Vanes
  for (let i = 0; i < 350; i++) {
    const fx = Math.random() * width;
    const fy = Math.random() * height;
    const len = 80 + Math.random() * 220;
    const angle = 0.4 + (Math.random() - 0.5) * 0.45;

    const strandGrad = ctx.createLinearGradient(fx, fy, fx + Math.cos(angle) * len, fy + Math.sin(angle) * len);
    strandGrad.addColorStop(0, 'rgba(255, 190, 205, 0.75)');
    strandGrad.addColorStop(0.5, 'rgba(255, 90, 110, 0.85)');
    strandGrad.addColorStop(1, 'rgba(120, 12, 40, 0.35)');

    ctx.strokeStyle = strandGrad;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + len * 0.4, fy + 30, fx + Math.cos(angle) * len, fy + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Feather PBR: velvet soft diffuse (roughness: 0.88, metalness: 0.0)
  rCtx.fillStyle = '#e0e0e0';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('plume', texSet);
  return texSet;
}

// =========================================================================
// 6. ROYAL KITE SHIELD FRONT (Heraldic Cobalt & Golden Lion)
// =========================================================================
export function getKnightShieldFrontTextures() {
  if (textureCache.has('shieldFront')) return textureCache.get('shieldFront');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Deep Royal Cobalt Blue Radial Field (bright vibrant heraldry)
  const cx = width / 2;
  const cy = 760; // Upper center of the shield (broadest area)
  const blueGrad = ctx.createRadialGradient(cx, cy, 120, cx, cy, width * 0.72);
  blueGrad.addColorStop(0, '#3b82f6');    // Radiant electric royal blue
  blueGrad.addColorStop(0.32, '#2563eb'); // Classic royal blue
  blueGrad.addColorStop(0.65, '#1d4ed8'); // Heraldic cobalt
  blueGrad.addColorStop(0.88, '#1e3a8a'); // Deep cobalt
  blueGrad.addColorStop(1, '#0b132b');    // Deep navy rim
  ctx.fillStyle = blueGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle Diamond quartering heraldic pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 5;
  for (let d = -height; d < height + width; d += 130) {
    ctx.beginPath();
    ctx.moveTo(0, d);
    ctx.lineTo(width, d + width);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width, d);
    ctx.lineTo(0, d + width);
    ctx.stroke();
  }

  // Base Shield PBR: lacquered wood/canvas (roughness: 0.44, metalness: 0.0 - ensures 100% vibrant colors!)
  rCtx.fillStyle = '#707070';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Helper to trace the kite shield contour (matching 3D geometry shape)
  function traceKiteShield(c, inset) {
    c.beginPath();
    c.moveTo(inset, inset);
    c.lineTo(width - inset, inset);
    c.lineTo(width - inset, 820);
    c.quadraticCurveTo(width - inset * 1.25, 1460, width / 2, height - inset);
    c.quadraticCurveTo(inset * 1.25, 1460, inset, 820);
    c.closePath();
  }

  // Steel Outer Bevel Rim along shield silhouette
  traceKiteShield(ctx, 45);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 36;
  ctx.stroke();

  // Gold Filigree Inner Border along shield silhouette
  traceKiteShield(ctx, 95);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 14;
  ctx.stroke();

  traceKiteShield(ctx, 110);
  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Corner Gold Reinforcing Brackets at top corners
  drawFiligreeBand(ctx, 120, 120, 240, 50);
  drawFiligreeBand(ctx, width - 360, 120, 240, 50);

  // The Masterpiece Golden Rampant Lion Crest
  const lionScale = 3.6;
  const lionScaleX = lionScale * 1.52; // Compensate for 3D shield mesh aspect ratio
  const lionScaleY = lionScale;

  // Emboss lion on bump map (bright relief)
  drawRampantLion(bCtx, cx, cy, lionScaleX, lionScaleY, '#dedede');

  // Polish lion on roughness map (smooth glossy gold)
  drawRampantLion(rCtx, cx, cy, lionScaleX, lionScaleY, '#303030');

  // Draw full vibrant hand-painted Golden Lion on albedo
  drawRampantLion(ctx, cx, cy, lionScaleX, lionScaleY);

  // Rim Rivets along the top and side borders
  for (let x = 140; x < width - 100; x += 180) {
    drawRivet(ctx, x, 55, 18, true);
  }
  for (let y = 140; y <= 820; y += 170) {
    drawRivet(ctx, 55, y, 18, true);
    drawRivet(ctx, width - 55, y, 18, true);
  }
  // Rivets along the lower curved edge
  [[120, 1020], [240, 1260], [420, 1530], [680, 1790], [1024, 1960],
   [1368, 1790], [1628, 1530], [1808, 1260], [1928, 1020]].forEach(([rx, ry]) => {
    drawRivet(ctx, rx, ry, 18, true);
  });

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('shieldFront', texSet);
  return texSet;
}

// =========================================================================
// 7. SHIELD BACK TEXTURE (Aged Oak Planks & Arm Strap Pad)
// =========================================================================
export function getKnightShieldBackTextures() {
  if (textureCache.has('shieldBack')) return textureCache.get('shieldBack');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Vertical Aged Oak Wood Planks
  const woodGrad = ctx.createLinearGradient(0, 0, width, 0);
  woodGrad.addColorStop(0, '#3e2723');
  woodGrad.addColorStop(0.5, '#5d4037');
  woodGrad.addColorStop(1, '#271710');

  ctx.fillStyle = woodGrad;
  ctx.fillRect(0, 0, width, height);

  // Plank Seams
  const numPlanks = 6;
  const pw = width / numPlanks;
  for (let i = 1; i < numPlanks; i++) {
    const px = i * pw;
    ctx.fillStyle = '#1c100b';
    ctx.fillRect(px - 6, 0, 12, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(px + 6, 0, 4, height);

    bCtx.fillStyle = '#202020';
    bCtx.fillRect(px - 6, 0, 12, height);
  }

  // Wood Grain
  ctx.strokeStyle = 'rgba(20, 10, 5, 0.4)';
  ctx.lineWidth = 3;
  for (let j = 0; j < 120; j++) {
    const gx = Math.random() * width;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.bezierCurveTo(gx + 30, height * 0.3, gx - 30, height * 0.7, gx, height);
    ctx.stroke();
  }

  // Wood PBR: roughness = 0.85, metalness = 0.0
  rCtx.fillStyle = '#d9d9d9';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Padded Leather Cushion in Center
  const cx = width / 2;
  const cy = height / 2;
  const padW = width * 0.65;
  const padH = height * 0.35;
  const padX = cx - padW / 2;
  const padY = cy - padH / 2;

  ctx.fillStyle = '#542b10';
  ctx.beginPath();
  ctx.roundRect(padX, padY, padW, padH, 30);
  ctx.fill();

  // Diamond Quilted Stitching
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 5;
  for (let d = -padH; d < padH + padW; d += 80) {
    ctx.beginPath();
    ctx.moveTo(padX, padY + d);
    ctx.lineTo(padX + padW, padY + d + padW);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padX, padY + padH - d);
    ctx.lineTo(padX + padW, padY - d);
    ctx.stroke();
  }

  // Leather Straps
  ctx.fillStyle = '#3a1805';
  ctx.fillRect(padX - 80, padY + 60, padW + 160, 90);
  ctx.fillRect(padX - 80, padY + padH - 150, padW + 160, 90);

  // Brass Buckles
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(padX - 60, padY + 45, 60, 120);
  ctx.fillRect(padX - 60, padY + padH - 165, 60, 120);

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('shieldBack', texSet);
  return texSet;
}

// =========================================================================
// 8. ROYAL BROADSWORD BLADE TEXTURE
// =========================================================================
export function getKnightSwordBladeTextures() {
  if (textureCache.has('swordBlade')) return textureCache.get('swordBlade');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Polished Steel Blade with Fuller Groove
  const cx = width / 2;
  const bladeGrad = ctx.createLinearGradient(0, 0, width, 0);
  bladeGrad.addColorStop(0, '#ffffff');    // Sharpened razor left edge
  bladeGrad.addColorStop(0.12, '#e2e8f0');
  bladeGrad.addColorStop(0.38, '#94a3b8');
  bladeGrad.addColorStop(0.48, '#334155'); // Fuller shadow
  bladeGrad.addColorStop(0.5, '#0f172a');  // Central Blood Groove (Fuller)
  bladeGrad.addColorStop(0.52, '#334155');
  bladeGrad.addColorStop(0.62, '#94a3b8');
  bladeGrad.addColorStop(0.88, '#e2e8f0');
  bladeGrad.addColorStop(1, '#ffffff');    // Sharpened razor right edge

  ctx.fillStyle = bladeGrad;
  ctx.fillRect(0, 0, width, height);

  // Blade PBR: mirror steel (metalness: 0.88, roughness: 0.22)
  mCtx.fillStyle = '#e0e0e0';
  mCtx.fillRect(0, 0, width, height);

  const rBlade = rCtx.createLinearGradient(0, 0, width, 0);
  rBlade.addColorStop(0, '#2e2e2e'); // Razor edge specular glint
  rBlade.addColorStop(0.5, '#595959'); // Brushed fuller
  rBlade.addColorStop(1, '#2e2e2e');
  rCtx.fillStyle = rBlade;
  rCtx.fillRect(0, 0, width, height);

  // Fuller Bump Groove
  const bFuller = bCtx.createLinearGradient(0, 0, width, 0);
  bFuller.addColorStop(0, '#a0a0a0');
  bFuller.addColorStop(0.46, '#909090');
  bFuller.addColorStop(0.5, '#202020'); // deep recess
  bFuller.addColorStop(0.54, '#909090');
  bFuller.addColorStop(1, '#a0a0a0');
  bCtx.fillStyle = bFuller;
  bCtx.fillRect(0, 0, width, height);

  // Golden Runic Engravings along Ricasso Base (Bottom 30%)
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 8;
  for (let ry = height - 600; ry < height - 100; ry += 120) {
    ctx.beginPath();
    ctx.arc(cx, ry, 28, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(cx, ry - 40);
    ctx.lineTo(cx + 20, ry);
    ctx.lineTo(cx, ry + 40);
    ctx.lineTo(cx - 20, ry);
    ctx.closePath();
    ctx.fill();

    drawRivet(ctx, cx, ry, 12, true);
  }

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('swordBlade', texSet);
  return texSet;
}

// =========================================================================
// 9. PAULDRONS & LIMBS TEXTURE (Pauldrons, Couters, Poleyns, Sabatons)
// =========================================================================
export function getKnightLimbsTextures() {
  if (textureCache.has('limbsMaster')) return textureCache.get('limbsMaster');

  const { canvas: albedo, ctx, width, height } = createCanvas(2048, 2048);
  const { canvas: rough, ctx: rCtx } = createCanvas(2048, 2048);
  const { canvas: metal, ctx: mCtx } = createCanvas(2048, 2048);
  const { canvas: bump, ctx: bCtx } = createCanvas(2048, 2048);

  // Stylized Steel Plate Gradient
  const steelGrad = ctx.createLinearGradient(0, 0, 0, height);
  steelGrad.addColorStop(0, '#f8fafc');
  steelGrad.addColorStop(0.2, '#e2e8f0');
  steelGrad.addColorStop(0.55, '#94a3b8');
  steelGrad.addColorStop(0.85, '#475569');
  steelGrad.addColorStop(1, '#1e293b');

  ctx.fillStyle = steelGrad;
  ctx.fillRect(0, 0, width, height);

  rCtx.fillStyle = '#525252';
  rCtx.fillRect(0, 0, width, height);
  mCtx.fillStyle = '#b3b3b3'; // 0.70 metalness
  mCtx.fillRect(0, 0, width, height);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Overlapping Plate Seams with Gold Rivets
  for (let y = 240; y < height; y += 450) {
    // Upper specular highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Lower drop shadow
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, y + 14);
    ctx.lineTo(width, y + 14);
    ctx.stroke();

    // Seam bump
    bCtx.fillStyle = '#d0d0d0';
    bCtx.fillRect(0, y, width, 10);
    bCtx.fillStyle = '#303030';
    bCtx.fillRect(0, y + 10, width, 14);

    // Gold Rivets along lamination
    for (let rx = 140; rx < width; rx += 280) {
      drawRivet(ctx, rx, y - 40, 16, true);
    }
  }

  // Golden Rampant Lion Motif on Pauldrons
  drawRampantLion(ctx, width * 0.25, 680, 1.2);
  drawRampantLion(ctx, width * 0.75, 680, 1.2);

  // Calf / Forearm Leather Straps in Center Column
  const strapW = 220;
  const strapX = width / 2 - strapW / 2;
  ctx.fillStyle = '#451a03';
  ctx.fillRect(strapX, 0, strapW, height);

  rCtx.fillStyle = '#c7c7c7';
  rCtx.fillRect(strapX, 0, strapW, height);
  mCtx.fillStyle = '#000000';
  mCtx.fillRect(strapX, 0, strapW, height);

  // Brass Buckles along strap
  for (let by = 200; by < height; by += 400) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(strapX - 20, by, strapW + 40, 60);
    ctx.strokeStyle = '#fffbeb';
    ctx.lineWidth = 4;
    ctx.strokeRect(strapX - 20, by, strapW + 40, 60);
  }

  const texSet = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    metalnessMap: toTexture(metal, false),
    bumpMap: toTexture(bump, false)
  };

  textureCache.set('limbsMaster', texSet);
  return texSet;
}
