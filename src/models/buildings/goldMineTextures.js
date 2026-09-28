import * as THREE from 'three';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for the Gold Mine (Mina de Ouro)
 * Inspired by Warcraft 2 hand-painted art style & Next-Gen AAA standards (Valorant / Overwatch / UE5).
 *
 * Generates 2048x2048 high-resolution textures tailored to subterranean mining components:
 * - getGoldMineRockTextures(): Dark granite mountain crags with chiseled facets, mossy crevices, and embedded crystalline veins.
 * - getGoldMineOreTextures(): Ultra-rich, shiny metallic gold veins and crystal clusters (metalness 0.88, roughness 0.20) with glistening facets and bright specular highlights.
 * - getGoldMineTimberTextures(): Heavy aged timber beams with dark iron straps, corner plates, and large forged square bolt heads.
 * - getGoldMineCartTracksTextures(): Rusted iron minecart wheels, chassis, wood plank bucket, steel rails, and creosote railroad cross-ties.
 * - getGoldMinePropsTextures(): Hanging iron mine lantern, glowing amber lens, mining pickaxes, and stenciled wooden ore crates.
 * - getGoldMineShaftTextures(): Deep cavern shaft darkness with depth occlusion.
 */

const textureCache = new Map();
const materialCache = new Map();

function createCanvas(width = 2048, height = 2048) {
  if (typeof document === 'undefined') {
    const dummyGradient = { addColorStop: () => {} };
    const dummyCtx = new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => dummyGradient;
        }
        return () => {};
      }
    });
    return {
      canvas: { width, height, nodeType: 1 },
      ctx: dummyCtx,
      width,
      height
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return { canvas, ctx, width, height };
}

function toTexture(canvas, isSRGB = true, isRepeat = true) {
  if (typeof document === 'undefined') {
    const tex = new THREE.Texture();
    tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// =============================================================================
// PROCEDURAL DRAWING UTILITIES
// =============================================================================

/**
 * Draw a stylized circular rivet with drop shadow, outer metallic bevel, and specular dome
 */
function drawRivet(ctx, cx, cy, radius = 12, isGold = false) {
  ctx.save();
  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
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
 * Draw a forged square pyramid bolt head with faceted shading, drop shadow, and apex highlight
 */
function drawSquareBolt(ctx, cx, cy, size = 18, isGold = false) {
  ctx.save();
  const half = size / 2;

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(cx - half + 3, cy - half + 4, size, size);

  // Top facet (brightest)
  ctx.fillStyle = isGold ? '#fffbeb' : '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy - half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Left facet (mid-bright)
  ctx.fillStyle = isGold ? '#fbbf24' : '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx - half, cy + half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Right facet (shaded)
  ctx.fillStyle = isGold ? '#d97706' : '#475569';
  ctx.beginPath();
  ctx.moveTo(cx + half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Bottom facet (deep shadow)
  ctx.fillStyle = isGold ? '#78350f' : '#1e293b';
  ctx.beginPath();
  ctx.moveTo(cx - half, cy + half);
  ctx.lineTo(cx + half, cy + half);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  // Tiny apex specular spark
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a stylized diamond glint / 4-point star specular flare
 */
function drawCrystalGlint(ctx, cx, cy, radius = 24, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;

  ctx.beginPath();
  // 4-point star curve
  ctx.moveTo(cx, cy - radius);
  ctx.quadraticCurveTo(cx, cy, cx + radius, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + radius);
  ctx.quadraticCurveTo(cx, cy, cx - radius, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - radius);
  ctx.closePath();
  ctx.fill();

  // Core circle
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a stylized jagged rock fracture / crack
 */
function drawFractureLine(ctx, points, width = 6, color = '#111418', highlightColor = '#6c7787') {
  if (points.length < 2) return;
  ctx.save();

  // Sunlit edge highlight (offset slightly)
  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = width + 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0][0] - 2, points[0][1] - 2);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0] - 2, points[i][1] - 2);
  }
  ctx.stroke();

  // Deep crack void
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();

  ctx.restore();
}

// =============================================================================
// 1. DARK GRANITE ROCK TEXTURES
// =============================================================================
/**
 * Dark Granite Rock: Fractured mountain stone with chiseled facets,
 * mossy crevices, and embedded crystalline veins.
 */
export function getGoldMineRockTextures() {
  if (textureCache.has('rock')) return textureCache.get('rock');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 1. Base Mountain Granite Gradient
  const bgGrad = alb.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0.0, '#3a3f49');
  bgGrad.addColorStop(0.35, '#2e333c');
  bgGrad.addColorStop(0.7, '#242830');
  bgGrad.addColorStop(1.0, '#1c1f26');
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#d2d2d2'; // Roughness ~ 0.82
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000'; // Non-metallic rock
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // 2. Chiseled Polygonal Rock Facets (Warcraft 2 / Stylized Stone Planes)
  const facetPolys = [
    // Top-left sector
    [[60, 80], [380, 40], [480, 260], [220, 360], [80, 240]],
    [[380, 40], [740, 70], [820, 320], [480, 260]],
    [[80, 240], [220, 360], [160, 620], [40, 520]],
    [[220, 360], [540, 380], [440, 680], [160, 620]],
    [[480, 260], [820, 320], [860, 560], [540, 380]],

    // Top-right sector
    [[820, 80], [1280, 50], [1360, 340], [920, 380], [780, 200]],
    [[1280, 50], [1720, 90], [1820, 380], [1360, 340]],
    [[1720, 90], [1980, 140], [2000, 460], [1820, 380]],
    [[920, 380], [1360, 340], [1420, 640], [980, 680]],
    [[1360, 340], [1820, 380], [1780, 690], [1420, 640]],

    // Mid-left sector
    [[40, 520], [160, 620], [200, 980], [60, 920]],
    [[160, 620], [440, 680], [480, 1020], [200, 980]],
    [[440, 680], [860, 720], [820, 1060], [480, 1020]],
    [[860, 560], [1220, 600], [1180, 940], [860, 720]],

    // Center & Mid-right sector
    [[1220, 600], [1620, 580], [1580, 960], [1180, 940]],
    [[1580, 580], [1980, 520], [2010, 910], [1660, 940]],
    [[980, 680], [1420, 640], [1380, 1010], [940, 1040]],
    [[1420, 640], [1780, 690], [1750, 1050], [1380, 1010]],

    // Bottom-left sector
    [[60, 920], [200, 980], [220, 1420], [50, 1380]],
    [[200, 980], [480, 1020], [510, 1450], [220, 1420]],
    [[480, 1020], [820, 1060], [840, 1480], [510, 1450]],
    [[50, 1380], [220, 1420], [240, 1920], [70, 1960]],
    [[220, 1420], [510, 1450], [520, 1960], [240, 1920]],

    // Bottom-center & right sector
    [[820, 1060], [1260, 1040], [1280, 1490], [840, 1480]],
    [[1260, 1040], [1680, 1070], [1690, 1510], [1280, 1490]],
    [[1680, 1070], [2000, 1020], [2020, 1480], [1690, 1510]],
    [[840, 1480], [1280, 1490], [1260, 1980], [820, 1970]],
    [[1280, 1490], [1690, 1510], [1680, 1970], [1260, 1980]],
    [[1690, 1510], [2020, 1480], [2010, 1980], [1680, 1970]]
  ];

  const toneGradients = [
    { fill: '#4a515e', bump: '#a8a8a8', rgh: '#c0c0c0' }, // Sunlit plane
    { fill: '#3b414c', bump: '#8f8f8f', rgh: '#cecece' }, // Mid-tone plane
    { fill: '#30353f', bump: '#787878', rgh: '#d8d8d8' }, // Slight shade
    { fill: '#252932', bump: '#606060', rgh: '#e2e2e2' }, // Darker rock plane
    { fill: '#545d6d', bump: '#b8b8b8', rgh: '#b4b4b4' }  // Highlight facet
  ];

  facetPolys.forEach((poly, idx) => {
    const tone = toneGradients[idx % toneGradients.length];

    // Albedo facet fill
    alb.fillStyle = tone.fill;
    alb.beginPath();
    alb.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      alb.lineTo(poly[i][0], poly[i][1]);
    }
    alb.closePath();
    alb.fill();

    // Bump facet
    bmp.fillStyle = tone.bump;
    bmp.beginPath();
    bmp.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      bmp.lineTo(poly[i][0], poly[i][1]);
    }
    bmp.closePath();
    bmp.fill();

    // Roughness facet
    rgh.fillStyle = tone.rgh;
    rgh.beginPath();
    rgh.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      rgh.lineTo(poly[i][0], poly[i][1]);
    }
    rgh.closePath();
    rgh.fill();

    // Chiseled edge bevel highlight along top/left edges
    alb.strokeStyle = '#6f7b8f';
    alb.lineWidth = 5;
    alb.beginPath();
    alb.moveTo(poly[0][0], poly[0][1]);
    alb.lineTo(poly[1][0], poly[1][1]);
    if (poly.length > 2) alb.lineTo(poly[2][0], poly[2][1]);
    alb.stroke();

    // Deep shadow along bottom/right edges
    alb.strokeStyle = '#15171c';
    alb.lineWidth = 7;
    alb.beginPath();
    alb.moveTo(poly[poly.length - 2][0], poly[poly.length - 2][1]);
    alb.lineTo(poly[poly.length - 1][0], poly[poly.length - 1][1]);
    alb.stroke();
  });

  // 3. Deep Fractures & Jagged Crevices
  const cracks = [
    [[120, 220], [210, 350], [280, 420], [360, 520], [390, 680], [420, 840]],
    [[480, 260], [530, 360], [620, 480], [740, 590], [860, 710]],
    [[820, 310], [920, 410], [980, 540], [1090, 660], [1160, 820]],
    [[1360, 330], [1410, 450], [1480, 580], [1520, 740], [1560, 920]],
    [[1820, 370], [1860, 520], [1910, 710], [1940, 940]],
    [[440, 680], [460, 860], [490, 1020], [500, 1260], [510, 1450]],
    [[860, 720], [840, 920], [830, 1140], [840, 1340], [850, 1620]],
    [[1420, 640], [1390, 820], [1380, 1060], [1340, 1280], [1310, 1540]],
    [[1780, 690], [1760, 910], [1740, 1150], [1710, 1410], [1690, 1720]]
  ];

  cracks.forEach(pts => {
    drawFractureLine(alb, pts, 8, '#0f1114', '#758399');
    drawFractureLine(bmp, pts, 12, '#202020', '#a0a0a0');
    // Cracks are very rough
    rgh.strokeStyle = '#fafafa';
    rgh.lineWidth = 10;
    rgh.beginPath();
    rgh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) rgh.lineTo(pts[i][0], pts[i][1]);
    rgh.stroke();
  });

  // 4. Mossy Crevices & Lichen Undertones (Earthy stylized forest greens)
  const mossZones = [
    { x: 300, y: 720, rx: 160, ry: 90 },
    { x: 780, y: 640, rx: 190, ry: 110 },
    { x: 1220, y: 760, rx: 170, ry: 95 },
    { x: 1680, y: 820, rx: 180, ry: 100 },
    { x: 460, y: 1380, rx: 210, ry: 130 },
    { x: 920, y: 1420, rx: 230, ry: 140 },
    { x: 1420, y: 1460, rx: 220, ry: 125 },
    { x: 1840, y: 1480, rx: 180, ry: 110 },
    { x: 340, y: 1840, rx: 250, ry: 140 },
    { x: 1100, y: 1880, rx: 280, ry: 150 },
    { x: 1780, y: 1860, rx: 260, ry: 140 }
  ];

  mossZones.forEach(mz => {
    const mossGrad = alb.createRadialGradient(mz.x, mz.y, mz.rx * 0.1, mz.x, mz.y, mz.rx);
    mossGrad.addColorStop(0.0, '#5a7837'); // Vibrant stylized moss center
    mossGrad.addColorStop(0.45, '#425828');
    mossGrad.addColorStop(0.8, '#2d3b1b');
    mossGrad.addColorStop(1.0, 'rgba(34, 45, 20, 0)');

    alb.fillStyle = mossGrad;
    alb.beginPath();
    alb.ellipse(mz.x, mz.y, mz.rx, mz.ry, (mz.x % 5) * 0.2, 0, Math.PI * 2);
    alb.fill();

    // Moss clusters (stippled organic specs)
    alb.fillStyle = '#7a9e4b';
    for (let j = 0; j < 40; j++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * mz.rx * 0.7;
      const sx = mz.x + Math.cos(ang) * rad;
      const sy = mz.y + Math.sin(ang) * (rad * (mz.ry / mz.rx));
      alb.beginPath();
      alb.arc(sx, sy, 3 + Math.random() * 5, 0, Math.PI * 2);
      alb.fill();
    }

    // Moss roughness is velvety high
    rgh.fillStyle = '#ededed';
    rgh.beginPath();
    rgh.ellipse(mz.x, mz.y, mz.rx * 0.8, mz.ry * 0.8, 0, 0, Math.PI * 2);
    rgh.fill();
  });

  // 5. Embedded Crystalline Veins & Golden Pyrite Flecks in Rock Crevices
  const goldVeinPaths = [
    [[520, 360], [560, 420], [610, 490], [640, 540], [620, 620]],
    [[940, 420], [990, 500], [1050, 580], [1070, 650]],
    [[1430, 470], [1470, 550], [1500, 630], [1530, 720]],
    [[460, 880], [480, 960], [500, 1080], [520, 1180]],
    [[840, 940], [860, 1040], [890, 1180], [880, 1300]],
    [[1360, 860], [1380, 980], [1360, 1120], [1330, 1260]],
    [[1730, 940], [1750, 1060], [1730, 1200], [1700, 1360]]
  ];

  goldVeinPaths.forEach(vpts => {
    // Albedo: Glowing gold quartz ribbon
    alb.save();
    alb.strokeStyle = '#d97706';
    alb.lineWidth = 14;
    alb.lineCap = 'round';
    alb.lineJoin = 'round';
    alb.beginPath();
    alb.moveTo(vpts[0][0], vpts[0][1]);
    for (let i = 1; i < vpts.length; i++) alb.lineTo(vpts[i][0], vpts[i][1]);
    alb.stroke();

    alb.strokeStyle = '#fbbf24';
    alb.lineWidth = 8;
    alb.stroke();

    alb.strokeStyle = '#fffbeb';
    alb.lineWidth = 3;
    alb.stroke();
    alb.restore();

    // Bump: protruding crystal ridge
    bmp.strokeStyle = '#e0e0e0';
    bmp.lineWidth = 10;
    bmp.beginPath();
    bmp.moveTo(vpts[0][0], vpts[0][1]);
    for (let i = 1; i < vpts.length; i++) bmp.lineTo(vpts[i][0], vpts[i][1]);
    bmp.stroke();

    // Roughness: very smooth gold
    rgh.strokeStyle = '#383838'; // ~0.22 roughness
    rgh.lineWidth = 12;
    rgh.beginPath();
    rgh.moveTo(vpts[0][0], vpts[0][1]);
    for (let i = 1; i < vpts.length; i++) rgh.lineTo(vpts[i][0], vpts[i][1]);
    rgh.stroke();

    // Metalness: bright metallic gold
    met.strokeStyle = '#e6e6e6'; // ~0.90 metalness
    met.lineWidth = 14;
    met.beginPath();
    met.moveTo(vpts[0][0], vpts[0][1]);
    for (let i = 1; i < vpts.length; i++) met.lineTo(vpts[i][0], vpts[i][1]);
    met.stroke();

    // Scattered gold crystal clusters along vein
    vpts.forEach(([vx, vy], vi) => {
      if (vi % 2 === 1) {
        drawCrystalGlint(alb, vx, vy, 16, '#fff7b2');
        met.fillStyle = '#ffffff';
        met.beginPath();
        met.arc(vx, vy, 14, 0, Math.PI * 2);
        met.fill();
        rgh.fillStyle = '#222222';
        rgh.beginPath();
        rgh.arc(vx, vy, 14, 0, Math.PI * 2);
        rgh.fill();
      }
    });
  });

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('rock', texSet);
  return texSet;
}

// =============================================================================
// 2. SPARKLING GOLD ORE TEXTURES
// =============================================================================
/**
 * Sparkling Gold Ore: Ultra-rich, shiny metallic gold veins and crystal clusters
 * (high metalness 0.85-0.95, low roughness 0.15-0.25) with glistening facets
 * and bright specular highlights.
 */
export function getGoldMineOreTextures() {
  if (textureCache.has('goldOre')) return textureCache.get('goldOre');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 1. Radiant Pure Gold Base Gradient (Warm, brilliant and free of copper/brown tones)
  const oreGrad = alb.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, 1300);
  oreGrad.addColorStop(0.0, '#ffffff'); // Pure white-gold specular core
  oreGrad.addColorStop(0.2, '#fff59d'); // Brilliant sunshine yellow-gold
  oreGrad.addColorStop(0.45, '#ffd700'); // True royal vibrant gold
  oreGrad.addColorStop(0.75, '#ffb300'); // Radiant amber gold
  oreGrad.addColorStop(1.0, '#c68400'); // Deep golden shadow (warm gold, never copper)
  alb.fillStyle = oreGrad;
  alb.fillRect(0, 0, W, H);

  // Base Roughness ~ 0.16 (slick metallic sheen)
  rgh.fillStyle = '#292929';
  rgh.fillRect(0, 0, W, H);

  // Base Metalness ~ 0.94
  met.fillStyle = '#f0f0f0';
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // 2. Multi-faceted Crystalline Voronoi Planes (Stylized Gem Facets)
  const cellCols = 6;
  const cellRows = 6;
  const cw = W / cellCols;
  const ch = H / cellRows;

  const facetShades = [
    { fill: '#ffffff', bump: '#efefef', rgh: '#101010', met: '#fcfcfc' }, // Diamond specular reflection
    { fill: '#fff59d', bump: '#dedede', rgh: '#181818', met: '#f5f5f5' }, // Ultra-bright light gold
    { fill: '#ffd700', bump: '#c5c5c5', rgh: '#222222', met: '#ededed' }, // Pure sparkling 24k gold
    { fill: '#ffca28', bump: '#a5a5a5', rgh: '#2a2a2a', met: '#e2e2e2' }, // Radiant mid-gold facet
    { fill: '#f59e0b', bump: '#858585', rgh: '#333333', met: '#d8d8d8' }, // Rich warm gold facet
    { fill: '#d97706', bump: '#656565', rgh: '#3d3d3d', met: '#c8c8c8' }  // Deep golden seam
  ];

  // Grid points jittered for organic crystalline structure
  const gridPoints = [];
  for (let r = 0; r <= cellRows; r++) {
    gridPoints[r] = [];
    for (let c = 0; c <= cellCols; c++) {
      const jx = (Math.sin(r * 4.1 + c * 2.3) * 0.35) * cw;
      const jy = (Math.cos(r * 2.7 + c * 3.9) * 0.35) * ch;
      gridPoints[r][c] = [c * cw + jx, r * ch + jy];
    }
  }

  // Draw triangular crystal facets
  for (let r = 0; r < cellRows; r++) {
    for (let c = 0; c < cellCols; c++) {
      const p1 = gridPoints[r][c];
      const p2 = gridPoints[r][c + 1];
      const p3 = gridPoints[r + 1][c + 1];
      const p4 = gridPoints[r + 1][c];
      const center = [
        (p1[0] + p2[0] + p3[0] + p4[0]) / 4,
        (p1[1] + p2[1] + p3[1] + p4[1]) / 4
      ];

      // 4 triangles around center point
      const tris = [
        [p1, p2, center],
        [p2, p3, center],
        [p3, p4, center],
        [p4, p1, center]
      ];

      tris.forEach((tri, tIdx) => {
        const sIdx = (r * 3 + c * 2 + tIdx) % facetShades.length;
        const shade = facetShades[sIdx];

        // Albedo
        alb.fillStyle = shade.fill;
        alb.beginPath();
        alb.moveTo(tri[0][0], tri[0][1]);
        alb.lineTo(tri[1][0], tri[1][1]);
        alb.lineTo(tri[2][0], tri[2][1]);
        alb.closePath();
        alb.fill();

        // Bump
        bmp.fillStyle = shade.bump;
        bmp.beginPath();
        bmp.moveTo(tri[0][0], tri[0][1]);
        bmp.lineTo(tri[1][0], tri[1][1]);
        bmp.lineTo(tri[2][0], tri[2][1]);
        bmp.closePath();
        bmp.fill();

        // Roughness
        rgh.fillStyle = shade.rgh;
        rgh.beginPath();
        rgh.moveTo(tri[0][0], tri[0][1]);
        rgh.lineTo(tri[1][0], tri[1][1]);
        rgh.lineTo(tri[2][0], tri[2][1]);
        rgh.closePath();
        rgh.fill();

        // Metalness
        met.fillStyle = shade.met;
        met.beginPath();
        met.moveTo(tri[0][0], tri[0][1]);
        met.lineTo(tri[1][0], tri[1][1]);
        met.lineTo(tri[2][0], tri[2][1]);
        met.closePath();
        met.fill();

        // Sharp golden facet edge highlight
        alb.strokeStyle = '#ffffff';
        alb.lineWidth = 3;
        alb.beginPath();
        alb.moveTo(tri[0][0], tri[0][1]);
        alb.lineTo(tri[1][0], tri[1][1]);
        alb.stroke();

        // Warm golden amber occlusion between crystal planes (no dark copper)
        alb.strokeStyle = 'rgba(180, 115, 0, 0.35)';
        alb.lineWidth = 3;
        alb.beginPath();
        alb.moveTo(tri[1][0], tri[1][1]);
        alb.lineTo(tri[2][0], tri[2][1]);
        alb.stroke();
      });
    }
  }

  // 3. Bulging Golden Nugget Formations (Rounded Organic Clusters)
  const nuggetCenters = [
    { x: 380, y: 360, r: 160 },
    { x: 920, y: 280, r: 190 },
    { x: 1540, y: 340, r: 180 },
    { x: 320, y: 980, r: 210 },
    { x: 840, y: 920, r: 240 },
    { x: 1420, y: 880, r: 220 },
    { x: 1820, y: 1100, r: 170 },
    { x: 420, y: 1620, r: 200 },
    { x: 1060, y: 1580, r: 250 },
    { x: 1680, y: 1640, r: 220 }
  ];

  nuggetCenters.forEach(nc => {
    // Nugget ambient drop shadow (warm amber shadow)
    alb.fillStyle = 'rgba(120, 60, 0, 0.45)';
    alb.beginPath();
    alb.arc(nc.x + 8, nc.y + 12, nc.r, 0, Math.PI * 2);
    alb.fill();

    // Nugget radial dome (brilliant 24k radiant gold)
    const nugGrad = alb.createRadialGradient(
      nc.x - nc.r * 0.35, nc.y - nc.r * 0.35, 10,
      nc.x, nc.y, nc.r
    );
    nugGrad.addColorStop(0.0, '#ffffff'); // Center specular shine
    nugGrad.addColorStop(0.2, '#fff9c4'); // Pure sunshine light gold
    nugGrad.addColorStop(0.55, '#ffd700'); // True vibrant gold
    nugGrad.addColorStop(0.82, '#ffb300'); // Warm rich gold
    nugGrad.addColorStop(1.0, '#c68400');  // Gold rim (pure warm gold, zero copper)
    alb.fillStyle = nugGrad;
    alb.beginPath();
    alb.arc(nc.x, nc.y, nc.r, 0, Math.PI * 2);
    alb.fill();

    // Bump dome
    const bumpDome = bmp.createRadialGradient(
      nc.x - nc.r * 0.3, nc.y - nc.r * 0.3, 5,
      nc.x, nc.y, nc.r
    );
    bumpDome.addColorStop(0.0, '#f0f0f0');
    bumpDome.addColorStop(0.8, '#a0a0a0');
    bumpDome.addColorStop(1.0, '#404040');
    bmp.fillStyle = bumpDome;
    bmp.beginPath();
    bmp.arc(nc.x, nc.y, nc.r, 0, Math.PI * 2);
    bmp.fill();

    // Roughness dome (ultra-smooth core)
    const rghDome = rgh.createRadialGradient(
      nc.x - nc.r * 0.3, nc.y - nc.r * 0.3, 5,
      nc.x, nc.y, nc.r
    );
    rghDome.addColorStop(0.0, '#1a1a1a'); // ~ 0.10
    rghDome.addColorStop(0.7, '#2b2b2b'); // ~ 0.17
    rghDome.addColorStop(1.0, '#4d4d4d'); // ~ 0.30
    rgh.fillStyle = rghDome;
    rgh.beginPath();
    rgh.arc(nc.x, nc.y, nc.r, 0, Math.PI * 2);
    rgh.fill();

    // Metalness dome (super metallic)
    met.fillStyle = '#fafafa'; // ~ 0.98
    met.beginPath();
    met.arc(nc.x, nc.y, nc.r, 0, Math.PI * 2);
    met.fill();
  });

  // 4. Brilliant 4-Point Specular Star Glints (Overwatch / Valorant Diamond Flares)
  const glintPositions = [
    [320, 260, 48],
    [460, 410, 36],
    [880, 200, 52],
    [1040, 330, 40],
    [1480, 260, 46],
    [1620, 400, 34],
    [260, 890, 50],
    [780, 830, 60],
    [920, 990, 44],
    [1360, 790, 54],
    [1740, 1020, 42],
    [360, 1530, 52],
    [980, 1490, 64],
    [1140, 1660, 48],
    [1610, 1550, 56],
    [1790, 1720, 38],
    [1024, 1024, 68]
  ];

  glintPositions.forEach(([gx, gy, gr]) => {
    drawCrystalGlint(alb, gx, gy, gr, '#ffffff');

    // Make glint hot-spot roughness mirror smooth
    rgh.fillStyle = '#0f0f0f';
    rgh.beginPath();
    rgh.arc(gx, gy, gr * 0.4, 0, Math.PI * 2);
    rgh.fill();

    // Maximum metalness
    met.fillStyle = '#ffffff';
    met.beginPath();
    met.arc(gx, gy, gr * 0.4, 0, Math.PI * 2);
    met.fill();
  });

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('goldOre', texSet);
  return texSet;
}

// =============================================================================
// 3. MINE TIMBER & CANOPY TEXTURES
// =============================================================================
/**
 * Mine Timber & Canopy: Heavy aged timber beams with iron straps and large
 * square bolt heads; roof canopy planks and mortise braces.
 */
export function getGoldMineTimberTextures() {
  if (textureCache.has('timber')) return textureCache.get('timber');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // 1. Base Dark Oak Timber Gradient
  const woodGrad = alb.createLinearGradient(0, 0, 0, H);
  woodGrad.addColorStop(0.0, '#4a2c17');
  woodGrad.addColorStop(0.3, '#3c210f');
  woodGrad.addColorStop(0.7, '#482a15');
  woodGrad.addColorStop(1.0, '#2b1608');
  alb.fillStyle = woodGrad;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#cfcfcf'; // Wood Roughness ~ 0.81
  rgh.fillRect(0, 0, W, H);

  met.fillStyle = '#000000'; // Wood is non-metallic
  met.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // 2. Heavy Oak Planks / Beams (4 wide vertical timber faces)
  const beamWidth = W / 4;
  for (let b = 0; b < 4; b++) {
    const bx = b * beamWidth;

    // Beam edge shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.45)';
    alb.fillRect(bx + beamWidth - 14, 0, 14, H);

    // Beam edge highlight (chiseled corner bevel)
    alb.fillStyle = '#6f4526';
    alb.fillRect(bx, 0, 10, H);

    bmp.fillStyle = '#505050';
    bmp.fillRect(bx + beamWidth - 10, 0, 10, H);
    bmp.fillStyle = '#b0b0b0';
    bmp.fillRect(bx, 0, 10, H);

    // Longitudinal stylized wood grain lines & knot whorls
    for (let g = 20; g < beamWidth - 20; g += 18) {
      const gx = bx + g;
      alb.strokeStyle = (g % 36 === 0) ? '#261205' : 'rgba(92, 55, 29, 0.4)';
      alb.lineWidth = (g % 36 === 0) ? 5 : 2;
      alb.beginPath();
      alb.moveTo(gx, 0);
      alb.bezierCurveTo(
        gx + Math.sin(b + g) * 24, H * 0.33,
        gx - Math.sin(b + g * 2) * 24, H * 0.66,
        gx, H
      );
      alb.stroke();

      bmp.strokeStyle = (g % 36 === 0) ? '#404040' : '#707070';
      bmp.lineWidth = 3;
      bmp.stroke();
    }

    // Aged timber knot
    const knotY = (b * 470 + 350) % (H - 400);
    const knotX = bx + beamWidth * 0.5 + Math.sin(b) * 40;

    alb.fillStyle = '#1e0c03';
    alb.beginPath();
    alb.ellipse(knotX, knotY, 32, 54, 0.1, 0, Math.PI * 2);
    alb.fill();

    alb.strokeStyle = '#784724';
    alb.lineWidth = 6;
    alb.beginPath();
    alb.ellipse(knotX, knotY, 46, 76, 0.1, 0, Math.PI * 2);
    alb.stroke();

    bmp.fillStyle = '#303030';
    bmp.beginPath();
    bmp.ellipse(knotX, knotY, 32, 54, 0.1, 0, Math.PI * 2);
    bmp.fill();
  }

  // 3. Heavy Forged Iron Reinforcement Straps (Horizontal & Corner plates)
  const strapHeights = [180, 840, 1500];
  const strapThickness = 140;

  strapHeights.forEach(sy => {
    // Strap drop shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.65)';
    alb.fillRect(0, sy + strapThickness, W, 22);

    // Iron strap base gradient (dark hammered iron with edge rust)
    const strapGrad = alb.createLinearGradient(0, sy, 0, sy + strapThickness);
    strapGrad.addColorStop(0.0, '#545d6d'); // Top bevel
    strapGrad.addColorStop(0.15, '#383e4a'); // Base iron
    strapGrad.addColorStop(0.5, '#262a32');  // Hammered mid
    strapGrad.addColorStop(0.85, '#333842');
    strapGrad.addColorStop(0.95, '#5a301a'); // Warm rust line
    strapGrad.addColorStop(1.0, '#17191e');  // Deep shadow rim

    alb.fillStyle = strapGrad;
    alb.fillRect(0, sy, W, strapThickness);

    // Iron roughness ~ 0.42
    rgh.fillStyle = '#6b6b6b';
    rgh.fillRect(0, sy, W, strapThickness);

    // Iron metalness ~ 0.82
    met.fillStyle = '#d2d2d2';
    met.fillRect(0, sy, W, strapThickness);

    // Bump map: raised strap
    bmp.fillStyle = '#b8b8b8';
    bmp.fillRect(0, sy, W, strapThickness);
    bmp.fillStyle = '#303030';
    bmp.fillRect(0, sy + strapThickness, W, 12); // Recess shadow

    // Hammered iron texture marks
    alb.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let hx = 30; hx < W; hx += 70) {
      alb.fillRect(hx, sy + 25 + (hx % 40), 28, 16);
    }

    // 4. Large Forged Square Bolt Heads along each beam
    for (let b = 0; b < 4; b++) {
      const bx = b * beamWidth + beamWidth * 0.5;
      drawSquareBolt(alb, bx - 60, sy + strapThickness * 0.5, 36, false);
      drawSquareBolt(alb, bx + 60, sy + strapThickness * 0.5, 36, false);

      // Roughness & metalness for bolt heads
      [-60, 60].forEach(off => {
        rgh.fillStyle = '#444444'; // Smooth bolt
        rgh.beginPath();
        rgh.arc(bx + off, sy + strapThickness * 0.5, 22, 0, Math.PI * 2);
        rgh.fill();

        met.fillStyle = '#eeeeee'; // High metalness bolt
        met.beginPath();
        met.arc(bx + off, sy + strapThickness * 0.5, 22, 0, Math.PI * 2);
        met.fill();

        bmp.fillStyle = '#f0f0f0';
        bmp.beginPath();
        bmp.arc(bx + off, sy + strapThickness * 0.5, 22, 0, Math.PI * 2);
        bmp.fill();
      });
    }
  });

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('timber', texSet);
  return texSet;
}

// =============================================================================
// 4. MINECART & RAILWAY TRACKS TEXTURES
// =============================================================================
/**
 * Minecart & Railway Tracks:
 * - Rusted iron minecart wheels and chassis with wood plank bucket
 * - Steel railway tracks and creosoted wooden cross-ties with iron tie-plates
 */
export function getGoldMineCartTracksTextures() {
  if (textureCache.has('cartTracks')) return textureCache.get('cartTracks');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);

  // Background
  alb.fillStyle = '#22252c';
  alb.fillRect(0, 0, W, H);
  rgh.fillStyle = '#808080';
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // ---------------------------------------------------------------------------
  // REGION A (Top Half, Y: 0 to 1024): Minecart Wooden Planks & Iron Corner Brackets
  // ---------------------------------------------------------------------------
  const cartH = 1024;
  const plankH = cartH / 5;

  for (let p = 0; p < 5; p++) {
    const py = p * plankH;
    const pGrad = alb.createLinearGradient(0, py, 0, py + plankH);
    pGrad.addColorStop(0.0, '#5c3820');
    pGrad.addColorStop(0.5, '#442612');
    pGrad.addColorStop(1.0, '#2d180a');
    alb.fillStyle = pGrad;
    alb.fillRect(0, py, W, plankH);

    // Plank seam shadow
    alb.fillStyle = 'rgba(0, 0, 0, 0.6)';
    alb.fillRect(0, py + plankH - 8, W, 8);
    // Plank bevel highlight
    alb.fillStyle = '#7a4d2c';
    alb.fillRect(0, py, W, 4);

    rgh.fillStyle = '#c5c5c5'; // Wood plank roughness
    rgh.fillRect(0, py, W, plankH);
    met.fillStyle = '#000000';
    met.fillRect(0, py, W, plankH);

    bmp.fillStyle = '#404040';
    bmp.fillRect(0, py + plankH - 8, W, 8);
    bmp.fillStyle = '#b0b0b0';
    bmp.fillRect(0, py, W, 4);

    // Wood grain lines
    for (let gy = py + 15; gy < py + plankH - 15; gy += 16) {
      alb.strokeStyle = 'rgba(25, 12, 5, 0.35)';
      alb.lineWidth = 3;
      alb.beginPath();
      alb.moveTo(0, gy);
      alb.bezierCurveTo(W * 0.3, gy + 10, W * 0.7, gy - 10, W, gy);
      alb.stroke();
    }
  }

  // Minecart Iron Corner Brackets & Rim Banding
  const rimHeight = 90;
  const rimGrad = alb.createLinearGradient(0, 0, 0, rimHeight);
  rimGrad.addColorStop(0.0, '#667082');
  rimGrad.addColorStop(0.3, '#434b58');
  rimGrad.addColorStop(0.8, '#262a32');
  rimGrad.addColorStop(1.0, '#5a2d18'); // Rust edge
  alb.fillStyle = rimGrad;
  alb.fillRect(0, 0, W, rimHeight);

  rgh.fillStyle = '#606060';
  rgh.fillRect(0, 0, W, rimHeight);
  met.fillStyle = '#d0d0d0';
  met.fillRect(0, 0, W, rimHeight);
  bmp.fillStyle = '#c0c0c0';
  bmp.fillRect(0, 0, W, rimHeight);

  // Rivets along minecart top rim
  for (let rx = 60; rx < W; rx += 140) {
    drawRivet(alb, rx, rimHeight * 0.5, 18, false);
    rgh.fillStyle = '#3a3a3a';
    rgh.beginPath();
    rgh.arc(rx, rimHeight * 0.5, 18, 0, Math.PI * 2);
    rgh.fill();
    met.fillStyle = '#f0f0f0';
    met.beginPath();
    met.arc(rx, rimHeight * 0.5, 18, 0, Math.PI * 2);
    met.fill();
  }

  // Vertical iron corner brackets (Left and Right borders of bucket)
  [0, W - 140].forEach(bx => {
    alb.fillStyle = rimGrad;
    alb.fillRect(bx, 0, 140, cartH);
    rgh.fillStyle = '#606060';
    rgh.fillRect(bx, 0, 140, cartH);
    met.fillStyle = '#d0d0d0';
    met.fillRect(bx, 0, 140, cartH);

    for (let by = 160; by < cartH - 60; by += 160) {
      drawSquareBolt(alb, bx + 70, by, 30, false);
    }
  });

  // ---------------------------------------------------------------------------
  // REGION B (Bottom Half, Y: 1024 to 2048): Steel Rails, Wheels, and Ties
  // ---------------------------------------------------------------------------

  // 1. Railroad Ties / Cross Sleepers (Y: 1024 to 1480)
  const tiesY = 1024;
  const tiesH = 456;
  const tieCount = 4;
  const tieW = W / tieCount;

  for (let t = 0; t < tieCount; t++) {
    const tx = t * tieW;
    const tieGrad = alb.createLinearGradient(tx, 0, tx + tieW, 0);
    tieGrad.addColorStop(0.0, '#2e1c11');
    tieGrad.addColorStop(0.4, '#3d2516');
    tieGrad.addColorStop(0.8, '#26160c');
    tieGrad.addColorStop(1.0, '#170b05');
    alb.fillStyle = tieGrad;
    alb.fillRect(tx + 12, tiesY, tieW - 24, tiesH);

    rgh.fillStyle = '#c0c0c0'; // Weathered creosote wood
    rgh.fillRect(tx + 12, tiesY, tieW - 24, tiesH);
    met.fillStyle = '#000000';
    met.fillRect(tx + 12, tiesY, tieW - 24, tiesH);

    // Cast iron tie plates & track spikes
    [tiesY + 100, tiesY + tiesH - 140].forEach(py => {
      alb.fillStyle = '#2f343e';
      alb.fillRect(tx + 30, py, tieW - 60, 48);

      rgh.fillStyle = '#555555';
      rgh.fillRect(tx + 30, py, tieW - 60, 48);
      met.fillStyle = '#cccccc';
      met.fillRect(tx + 30, py, tieW - 60, 48);

      // Track spikes
      drawSquareBolt(alb, tx + 60, py + 24, 20, false);
      drawSquareBolt(alb, tx + tieW - 60, py + 24, 20, false);
    });
  }

  // 2. Steel Railway Rails (Y: 1480 to 1760)
  const railY = 1480;
  const railH = 280;

  // Rail Base & Web (Oxidized dark rust steel)
  const webGrad = alb.createLinearGradient(0, railY, 0, railY + railH);
  webGrad.addColorStop(0.0, '#ffffff'); // Polished mirror contact head
  webGrad.addColorStop(0.18, '#cbd5e1'); // Silver steel
  webGrad.addColorStop(0.35, '#64748b'); // Steel transition
  webGrad.addColorStop(0.55, '#523420'); // Rust orange web
  webGrad.addColorStop(0.85, '#352114'); // Dark rust base
  webGrad.addColorStop(1.0, '#1c120a');

  alb.fillStyle = webGrad;
  alb.fillRect(0, railY, W, railH);

  // Rail roughness: mirror polished head on top (0.12), rough rust bottom (0.75)
  const railRgh = rgh.createLinearGradient(0, railY, 0, railY + railH);
  railRgh.addColorStop(0.0, '#202020'); // ~0.12 polished top
  railRgh.addColorStop(0.2, '#353535');
  railRgh.addColorStop(0.6, '#909090');
  railRgh.addColorStop(1.0, '#b8b8b8');
  rgh.fillStyle = railRgh;
  rgh.fillRect(0, railY, W, railH);

  // Rail metalness: high metallic head (0.95), medium rust (0.65)
  const railMet = met.createLinearGradient(0, railY, 0, railY + railH);
  railMet.addColorStop(0.0, '#f2f2f2'); // ~0.95
  railMet.addColorStop(0.3, '#d0d0d0');
  railMet.addColorStop(0.7, '#909090');
  railMet.addColorStop(1.0, '#606060');
  met.fillStyle = railMet;
  met.fillRect(0, railY, W, railH);

  // Bump: raised rail head
  bmp.fillStyle = '#dedede';
  bmp.fillRect(0, railY, W, 80);
  bmp.fillStyle = '#606060';
  bmp.fillRect(0, railY + 80, W, railH - 80);

  // 3. Cast Iron Minecart Wheel Hub & Rim Flange (Y: 1760 to 2048)
  const wheelY = 1760;
  const wheelH = 288;
  const wheelCX = W * 0.5;
  const wheelCY = wheelY + wheelH * 0.5;
  const wheelR = wheelH * 0.46;

  // Outer flanged wheel tread
  const whGrad = alb.createRadialGradient(wheelCX, wheelCY, wheelR * 0.4, wheelCX, wheelCY, wheelR);
  whGrad.addColorStop(0.0, '#2b303a');
  whGrad.addColorStop(0.6, '#1d2128');
  whGrad.addColorStop(0.85, '#cbd5e1'); // Shiny tread
  whGrad.addColorStop(1.0, '#424855');  // Flange edge
  alb.fillStyle = whGrad;
  alb.beginPath();
  alb.arc(wheelCX, wheelCY, wheelR, 0, Math.PI * 2);
  alb.fill();

  // Spoked cutout
  alb.strokeStyle = '#5a2d18'; // Rust ring
  alb.lineWidth = 10;
  alb.stroke();

  // 6 Wheel spokes
  for (let s = 0; s < 6; s++) {
    const ang = (s / 6) * Math.PI * 2;
    alb.strokeStyle = '#434a57';
    alb.lineWidth = 20;
    alb.beginPath();
    alb.moveTo(wheelCX, wheelCY);
    alb.lineTo(wheelCX + Math.cos(ang) * (wheelR * 0.75), wheelCY + Math.sin(ang) * (wheelR * 0.75));
    alb.stroke();
  }

  // Central heavy axle hub with square bolt
  drawRivet(alb, wheelCX, wheelCY, 42, false);
  drawSquareBolt(alb, wheelCX, wheelCY, 32, false);

  rgh.fillStyle = '#484848';
  rgh.beginPath();
  rgh.arc(wheelCX, wheelCY, wheelR, 0, Math.PI * 2);
  rgh.fill();

  met.fillStyle = '#dddddd';
  met.beginPath();
  met.arc(wheelCX, wheelCY, wheelR, 0, Math.PI * 2);
  met.fill();

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('cartTracks', texSet);
  return texSet;
}

// =============================================================================
// 5. MINE PROPS TEXTURES (LANTERN, CRATES, PICKAXES)
// =============================================================================
/**
 * Detail Props:
 * - Hanging iron mine lantern with glowing amber lens
 * - Stenciled wooden ore crates with iron corner reinforcements
 * - Mining pickaxes with forged steel head and leather-wrapped ash handle
 */
export function getGoldMinePropsTextures() {
  if (textureCache.has('props')) return textureCache.get('props');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createCanvas(2048, 2048);
  const { canvas: emiC, ctx: emi } = createCanvas(2048, 2048);

  // Background
  alb.fillStyle = '#282b32';
  alb.fillRect(0, 0, W, H);
  rgh.fillStyle = '#808080';
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  emi.fillStyle = '#000000';
  emi.fillRect(0, 0, W, H);

  // ---------------------------------------------------------------------------
  // 1. LANTERN AMBER GLOWING LENS (Quadrant 1: Top-Left 0..1024, 0..1024)
  // ---------------------------------------------------------------------------
  const lGrad = alb.createRadialGradient(512, 512, 60, 512, 512, 480);
  lGrad.addColorStop(0.0, '#ffffff'); // Core white flame
  lGrad.addColorStop(0.25, '#fff3b0'); // Warm sunny yellow
  lGrad.addColorStop(0.55, '#ff9800'); // Saturated amber
  lGrad.addColorStop(0.85, '#e65100'); // Deep glowing orange
  lGrad.addColorStop(1.0, '#3e1700');  // Darkened glass border
  alb.fillStyle = lGrad;
  alb.fillRect(0, 0, 1024, 1024);

  // Emissive map for lantern glow
  const eGrad = emi.createRadialGradient(512, 512, 60, 512, 512, 480);
  eGrad.addColorStop(0.0, '#ffffff');
  eGrad.addColorStop(0.3, '#ffaa00');
  eGrad.addColorStop(0.7, '#ff5500');
  eGrad.addColorStop(1.0, '#000000');
  emi.fillStyle = eGrad;
  emi.fillRect(0, 0, 1024, 1024);

  // Wrought iron cage bars across lantern glass
  alb.strokeStyle = '#22252c';
  alb.lineWidth = 40;
  alb.strokeRect(40, 40, 944, 944);
  alb.beginPath();
  alb.moveTo(512, 40);
  alb.lineTo(512, 984);
  alb.moveTo(40, 512);
  alb.lineTo(984, 512);
  alb.stroke();

  // Glass smoothness
  rgh.fillStyle = '#1a1a1a'; // Glass roughness ~ 0.1
  rgh.fillRect(0, 0, 1024, 1024);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, 1024, 1024);

  // ---------------------------------------------------------------------------
  // 2. WOODEN ORE CRATE WITH ROYAL / MINING STENCIL (Quadrant 2: Top-Right 1024..2048, 0..1024)
  // ---------------------------------------------------------------------------
  const crateX = 1024;
  const crateY = 0;
  const crateW = 1024;
  const crateH = 1024;

  // Pine / oak crate planks
  const cPlankH = crateH / 4;
  for (let cp = 0; cp < 4; cp++) {
    const cpy = crateY + cp * cPlankH;
    const cpGrad = alb.createLinearGradient(crateX, cpy, crateX, cpy + cPlankH);
    cpGrad.addColorStop(0.0, '#7c5332');
    cpGrad.addColorStop(0.5, '#5c3a21');
    cpGrad.addColorStop(1.0, '#422814');
    alb.fillStyle = cpGrad;
    alb.fillRect(crateX, cpy, crateW, cPlankH);

    alb.fillStyle = 'rgba(0, 0, 0, 0.5)';
    alb.fillRect(crateX, cpy + cPlankH - 6, crateW, 6);

    rgh.fillStyle = '#c8c8c8';
    rgh.fillRect(crateX, cpy, crateW, cPlankH);
  }

  // Crossed Pickaxes Stencil on Crate
  alb.save();
  alb.translate(crateX + crateW * 0.5, crateY + crateH * 0.5);
  alb.strokeStyle = '#1d1209'; // Stenciled black ink
  alb.lineWidth = 26;
  alb.lineCap = 'round';

  // Crossed handles
  alb.beginPath();
  alb.moveTo(-180, -180);
  alb.lineTo(180, 180);
  alb.moveTo(180, -180);
  alb.lineTo(-180, 180);
  alb.stroke();

  // Curved pickaxe heads
  alb.lineWidth = 36;
  alb.beginPath();
  alb.arc(-130, -130, 90, -Math.PI * 0.7, -Math.PI * 0.1);
  alb.stroke();
  alb.beginPath();
  alb.arc(130, -130, 90, -Math.PI * 0.9, -Math.PI * 0.3);
  alb.stroke();

  // Gold Ore Inscription: "GOLD 100KG"
  alb.fillStyle = '#1d1209';
  alb.font = 'bold 54px sans-serif';
  alb.textAlign = 'center';
  alb.fillText('MINA DE OURO', 0, 260);
  alb.restore();

  // Iron corner braces on crate
  const braceW = 100;
  alb.fillStyle = '#2d333e';
  alb.fillRect(crateX, crateY, crateW, braceW);
  alb.fillRect(crateX, crateY + crateH - braceW, crateW, braceW);
  alb.fillRect(crateX, crateY, braceW, crateH);
  alb.fillRect(crateX + crateW - braceW, crateY, braceW, crateH);

  rgh.fillStyle = '#555555';
  rgh.fillRect(crateX, crateY, crateW, braceW);
  rgh.fillRect(crateX, crateY + crateH - braceW, crateW, braceW);
  rgh.fillRect(crateX, crateY, braceW, crateH);
  rgh.fillRect(crateX + crateW - braceW, crateY, braceW, crateH);

  met.fillStyle = '#cccccc';
  met.fillRect(crateX, crateY, crateW, braceW);
  met.fillRect(crateX, crateY + crateH - braceW, crateW, braceW);
  met.fillRect(crateX, crateY, braceW, crateH);
  met.fillRect(crateX + crateW - braceW, crateY, braceW, crateH);

  // Studs on crate braces
  [crateX + 50, crateX + crateW - 50].forEach(sx => {
    [crateY + 50, crateY + crateH - 50].forEach(sy => {
      drawSquareBolt(alb, sx, sy, 28, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MINING PICKAXES & TOOLS (Bottom Half: 0..2048, 1024..2048)
  // ---------------------------------------------------------------------------
  // Forged Steel Pickaxe Head
  const pHeadY = 1080;
  const pHeadH = 340;
  const pSteelGrad = alb.createLinearGradient(0, pHeadY, 0, pHeadY + pHeadH);
  pSteelGrad.addColorStop(0.0, '#ffffff'); // Honed cutting edge
  pSteelGrad.addColorStop(0.2, '#cbd5e1'); // Tempered steel
  pSteelGrad.addColorStop(0.5, '#64748b'); // Steel body
  pSteelGrad.addColorStop(0.8, '#334155'); // Shadow bevel
  pSteelGrad.addColorStop(1.0, '#1e293b');
  alb.fillStyle = pSteelGrad;
  alb.fillRect(0, pHeadY, W, pHeadH);

  rgh.fillStyle = '#3a3a3a'; // Polished steel ~ 0.23
  rgh.fillRect(0, pHeadY, W, pHeadH);
  met.fillStyle = '#e8e8e8'; // High metalness steel ~ 0.91
  met.fillRect(0, pHeadY, W, pHeadH);
  bmp.fillStyle = '#c5c5c5';
  bmp.fillRect(0, pHeadY, W, pHeadH);

  // Ash wood handle with cross leather wraps
  const pHandleY = 1480;
  const pHandleH = 520;
  const ashGrad = alb.createLinearGradient(0, pHandleY, 0, pHandleY + pHandleH);
  ashGrad.addColorStop(0.0, '#b5926b');
  ashGrad.addColorStop(0.5, '#96734c');
  ashGrad.addColorStop(1.0, '#755431');
  alb.fillStyle = ashGrad;
  alb.fillRect(0, pHandleY, W, pHandleH);

  rgh.fillStyle = '#bcbcbc';
  rgh.fillRect(0, pHandleY, W, pHandleH);
  met.fillStyle = '#000000';
  met.fillRect(0, pHandleY, W, pHandleH);

  // Criss-cross leather grip wraps
  alb.strokeStyle = '#4e2a14';
  alb.lineWidth = 18;
  for (let wx = -500; wx < W + 500; wx += 140) {
    alb.beginPath();
    alb.moveTo(wx, pHandleY);
    alb.lineTo(wx + 400, pHandleY + pHandleH);
    alb.stroke();

    alb.beginPath();
    alb.moveTo(wx + 400, pHandleY);
    alb.lineTo(wx, pHandleY + pHandleH);
    alb.stroke();
  }

  const texSet = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true),
    emissiveMap: toTexture(emiC, true, true)
  };

  textureCache.set('props', texSet);
  return texSet;
}

// =============================================================================
// 6. CAVERN SHAFT OCCLUSION TEXTURE
// =============================================================================
/**
 * Cavern Shaft: Deep subterranean gradient into pitch darkness with subtle
 * atmospheric depth and rock framing.
 */
export function getGoldMineShaftTextures() {
  if (textureCache.has('shaft')) return textureCache.get('shaft');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: metC, ctx: met } = createCanvas(1024, 1024);

  // Deep cavern black gradient
  const shaftGrad = alb.createRadialGradient(W * 0.5, H * 0.65, 50, W * 0.5, H * 0.5, 600);
  shaftGrad.addColorStop(0.0, '#020202'); // Pitch darkness center
  shaftGrad.addColorStop(0.5, '#0b0c10');
  shaftGrad.addColorStop(0.85, '#15171d');
  shaftGrad.addColorStop(1.0, '#1c1f26');  // Tunnel mouth rim
  alb.fillStyle = shaftGrad;
  alb.fillRect(0, 0, W, H);

  rgh.fillStyle = '#f5f5f5'; // High roughness
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  const texSet = {
    map: toTexture(albC, true, false),
    roughnessMap: toTexture(rghC, false, false),
    metalnessMap: toTexture(metC, false, false)
  };

  textureCache.set('shaft', texSet);
  return texSet;
}

// =============================================================================
// MATERIAL FACTORY & CACHE
// =============================================================================
/**
 * Creates and returns cached high-detail PBR materials for the Gold Mine model
 * @returns {Object<string, THREE.MeshStandardMaterial>}
 */
export function getGoldMineMaterials() {
  if (materialCache.has('materials')) {
    return materialCache.get('materials');
  }

  const rockTex = getGoldMineRockTextures();
  const oreTex = getGoldMineOreTextures();
  const timberTex = getGoldMineTimberTextures();
  const cartTex = getGoldMineCartTracksTextures();
  const propsTex = getGoldMinePropsTextures();
  const shaftTex = getGoldMineShaftTextures();

  const mats = {
    // Dark Granite Mountain Rock
    rock: new THREE.MeshStandardMaterial({
      map: rockTex.map,
      roughnessMap: rockTex.roughnessMap,
      metalnessMap: rockTex.metalnessMap,
      bumpMap: rockTex.bumpMap,
      bumpScale: 0.12,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true
    }),

    // Deep subterranean rock face / foundation
    rockDark: new THREE.MeshStandardMaterial({
      color: 0x22262e,
      map: rockTex.map,
      roughnessMap: rockTex.roughnessMap,
      bumpMap: rockTex.bumpMap,
      bumpScale: 0.14,
      roughness: 0.90,
      metalness: 0.10,
      flatShading: true
    }),

    // Sparkling Gold Ore (Ultra-rich vibrant 24k metallic gold)
    goldOre: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fff9b0'),
      emissive: new THREE.Color('#423002'),
      map: oreTex.map,
      roughnessMap: oreTex.roughnessMap,
      metalnessMap: oreTex.metalnessMap,
      bumpMap: oreTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.14,
      metalness: 0.94,
      flatShading: true
    }),

    // Brilliant sparkling gold ore crystal clusters & nuggets
    goldOreBright: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffffff'),
      emissive: new THREE.Color('#5c4404'),
      map: oreTex.map,
      roughnessMap: oreTex.roughnessMap,
      metalnessMap: oreTex.metalnessMap,
      bumpMap: oreTex.bumpMap,
      bumpScale: 0.09,
      roughness: 0.08,
      metalness: 0.98,
      flatShading: true
    }),

    // Heavy Squared Mine Timber Beams & Canopy
    timber: new THREE.MeshStandardMaterial({
      map: timberTex.map,
      roughnessMap: timberTex.roughnessMap,
      metalnessMap: timberTex.metalnessMap,
      bumpMap: timberTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.80,
      metalness: 0.20,
      flatShading: false
    }),

    // Darker Timber Struts & Lintel
    timberDark: new THREE.MeshStandardMaterial({
      color: 0x3d2413,
      map: timberTex.map,
      roughnessMap: timberTex.roughnessMap,
      bumpMap: timberTex.bumpMap,
      bumpScale: 0.07,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: false
    }),

    // Minecart Plank Bucket
    cartWood: new THREE.MeshStandardMaterial({
      map: cartTex.map,
      roughnessMap: cartTex.roughnessMap,
      metalnessMap: cartTex.metalnessMap,
      bumpMap: cartTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.78,
      metalness: 0.25,
      flatShading: false
    }),

    // Minecart Cast Iron Wheels & Undercarriage
    cartIron: new THREE.MeshStandardMaterial({
      color: 0x3a404c,
      roughnessMap: cartTex.roughnessMap,
      metalnessMap: cartTex.metalnessMap,
      bumpMap: cartTex.bumpMap,
      bumpScale: 0.06,
      roughness: 0.35,
      metalness: 0.85,
      flatShading: false
    }),

    // Steel Railway Rails
    rails: new THREE.MeshStandardMaterial({
      map: cartTex.map,
      roughnessMap: cartTex.roughnessMap,
      metalnessMap: cartTex.metalnessMap,
      bumpMap: cartTex.bumpMap,
      bumpScale: 0.06,
      roughness: 0.25,
      metalness: 0.90,
      flatShading: false
    }),

    // Railway Wooden Cross-Ties (Sleepers)
    ties: new THREE.MeshStandardMaterial({
      color: 0x332015,
      map: cartTex.map,
      roughnessMap: cartTex.roughnessMap,
      bumpMap: cartTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.88,
      metalness: 0.10,
      flatShading: false
    }),

    // Forged Iron Hardware (Braces, Chains, Straps, Bolts)
    ironHardware: new THREE.MeshStandardMaterial({
      color: 0x2e333d,
      roughness: 0.40,
      metalness: 0.85,
      flatShading: false
    }),

    // Hanging Iron Mine Lantern Glass (Glowing Amber Core)
    lanternGlass: new THREE.MeshStandardMaterial({
      map: propsTex.map,
      emissiveMap: propsTex.emissiveMap,
      emissive: new THREE.Color(0xff8c00),
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.10,
      flatShading: false
    }),

    // Lantern Iron Hood & Cage Frame
    lanternIron: new THREE.MeshStandardMaterial({
      color: 0x1f232b,
      roughness: 0.42,
      metalness: 0.82,
      flatShading: false
    }),

    // Stenciled Wooden Ore Crate
    oreCrate: new THREE.MeshStandardMaterial({
      map: propsTex.map,
      roughnessMap: propsTex.roughnessMap,
      metalnessMap: propsTex.metalnessMap,
      bumpMap: propsTex.bumpMap,
      bumpScale: 0.07,
      roughness: 0.80,
      metalness: 0.20,
      flatShading: false
    }),

    // Pickaxe Steel Blade
    pickaxeSteel: new THREE.MeshStandardMaterial({
      color: 0xb0bcc9,
      roughness: 0.25,
      metalness: 0.88,
      flatShading: false
    }),

    // Pickaxe Ash Wood Shaft
    pickaxeWood: new THREE.MeshStandardMaterial({
      color: 0x8a623e,
      roughness: 0.78,
      metalness: 0.05,
      flatShading: false
    }),

    // Pitch Cavern Dark Tunnel Interior (Depth Occlusion)
    tunnelBlack: new THREE.MeshStandardMaterial({
      map: shaftTex.map,
      roughnessMap: shaftTex.roughnessMap,
      roughness: 0.98,
      metalness: 0.0,
      color: 0x050403
    })
  };

  materialCache.set('materials', mats);
  return mats;
}
