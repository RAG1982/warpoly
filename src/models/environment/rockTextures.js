import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Rocks & Stones
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates 2048x2048 crisp, hand-painted procedural PBR textures:
 * 1. getGraniteBoulderTextures(): Chiseled stone facets, sedimentary strata lines, sharp edge bevel highlights,
 *    velvety green moss on upper surfaces, dark crevices, micro-pitting, bump/roughness maps.
 * 2. getRiverPebbleTextures(): Smooth water-worn stones with subtle pebble speckles, quartz streaks,
 *    and polished specular finish.
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, isRepeat = true) {
  return makeTexture(canvas, isSRGB, { wrapS: isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping });
}

/* ==========================================================================
   1. GRANITE BOULDER TEXTURES (2048x2048)
   ========================================================================== */
export function getGraniteBoulderTextures() {
  if (textureCache.has('granite_boulder')) {
    return textureCache.get('granite_boulder');
  }

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // --- 1. Albedo: Base Geological Granite Foundation ---
  const baseGrad = alb.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0.0, '#757c85'); // Upper sun-exposed granite
  baseGrad.addColorStop(0.25, '#878c94'); // Light mineral facet
  baseGrad.addColorStop(0.5, '#686f78'); // Neutral slate granite
  baseGrad.addColorStop(0.75, '#565c64'); // Deep shadow cleft
  baseGrad.addColorStop(1.0, '#3f444c'); // Moist ground base
  alb.fillStyle = baseGrad;
  alb.fillRect(0, 0, W, H);

  // Roughness & Bump Base
  rgh.fillStyle = '#d4d4d4'; // ~0.83 roughness
  rgh.fillRect(0, 0, W, H);
  met.fillStyle = '#000000'; // 0.0 metalness
  met.fillRect(0, 0, W, H);
  bmp.fillStyle = '#808080'; // 128 mid-gray
  bmp.fillRect(0, 0, W, H);

  // --- 2. Sedimentary Geological Strata Lines & Banding ---
  const strataColors = [
    { col: '#9da3ab', w: 80, y: 160 },
    { col: '#5a6169', w: 110, y: 340 },
    { col: '#8d9299', w: 90, y: 560 },
    { col: '#626870', w: 140, y: 780 },
    { col: '#a3a9b0', w: 70, y: 1020 },
    { col: '#51575f', w: 130, y: 1250 },
    { col: '#7e838b', w: 95, y: 1480 },
    { col: '#454a52', w: 120, y: 1720 },
    { col: '#676d75', w: 100, y: 1930 }
  ];

  strataColors.forEach((s, idx) => {
    alb.fillStyle = s.col;
    alb.beginPath();
    alb.moveTo(0, s.y - s.w * 0.5);
    for (let x = 0; x <= W; x += 128) {
      const wave = Math.sin((x / W) * Math.PI * 4 + idx) * 30 + Math.cos((x / W) * Math.PI * 8) * 16;
      alb.lineTo(x, s.y - s.w * 0.5 + wave);
    }
    for (let x = W; x >= 0; x -= 128) {
      const wave = Math.sin((x / W) * Math.PI * 4 + idx) * 30 + Math.cos((x / W) * Math.PI * 8) * 16;
      alb.lineTo(x, s.y + s.w * 0.5 + wave);
    }
    alb.closePath();
    alb.fill();

    // Strata boundary fine groove
    bmp.strokeStyle = '#5a5a5a';
    bmp.lineWidth = 6;
    bmp.beginPath();
    bmp.moveTo(0, s.y + s.w * 0.5);
    for (let x = 0; x <= W; x += 128) {
      const wave = Math.sin((x / W) * Math.PI * 4 + idx) * 30 + Math.cos((x / W) * Math.PI * 8) * 16;
      bmp.lineTo(x, s.y + s.w * 0.5 + wave);
    }
    bmp.stroke();
  });

  // Fine sedimentary silt laminations
  alb.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 30; y < H; y += 45) {
    alb.fillRect(0, y, W, 3);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 50; y < H; y += 45) {
    alb.fillRect(0, y, W, 4);
  }

  // --- 3. Chiseled Stone Facets & Bevel Planes ---
  // Stylized polygonal facet planes simulating chiseled cliff rocks
  const facetRows = 6;
  const facetCols = 6;
  const cellW = W / facetCols;
  const cellH = H / facetRows;

  // Generate pseudo-random deterministic cell points
  const points = [];
  for (let r = 0; r <= facetRows; r++) {
    points[r] = [];
    for (let c = 0; c <= facetCols; c++) {
      const ox = (Math.sin(r * 3.7 + c * 5.2) * 0.35) * cellW;
      const oy = (Math.cos(r * 4.1 + c * 2.9) * 0.35) * cellH;
      points[r][c] = {
        x: Math.max(0, Math.min(W, c * cellW + ox)),
        y: Math.max(0, Math.min(H, r * cellH + oy))
      };
    }
  }

  // Draw triangular chiseled facets
  for (let r = 0; r < facetRows; r++) {
    for (let c = 0; c < facetCols; c++) {
      const p00 = points[r][c];
      const p10 = points[r][c + 1];
      const p11 = points[r + 1][c + 1];
      const p01 = points[r + 1][c];

      const drawFacet = (t1, t2, t3, seed) => {
        const cx = (t1.x + t2.x + t3.x) / 3;
        const cy = (t1.y + t2.y + t3.y) / 3;

        // Angle-based tonal lighting
        const shade = Math.sin(seed * 4.3);
        alb.save();
        if (shade > 0.3) {
          // Highlight facet
          const fGrad = alb.createLinearGradient(t1.x, t1.y, t3.x, t3.y);
          fGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
          fGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
          alb.fillStyle = fGrad;
        } else if (shade < -0.3) {
          // Shadow facet
          const fGrad = alb.createLinearGradient(t1.x, t1.y, t3.x, t3.y);
          fGrad.addColorStop(0, 'rgba(0, 0, 0, 0.04)');
          fGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
          alb.fillStyle = fGrad;
        } else {
          alb.fillStyle = 'rgba(255, 255, 255, 0.06)';
        }

        alb.beginPath();
        alb.moveTo(t1.x, t1.y);
        alb.lineTo(t2.x, t2.y);
        alb.lineTo(t3.x, t3.y);
        alb.closePath();
        alb.fill();
        alb.restore();

        // Edge highlights & bevel shadows (Warcraft / Valorant style chiseled edge)
        alb.save();
        alb.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        alb.lineWidth = 4;
        alb.beginPath();
        alb.moveTo(t1.x, t1.y);
        alb.lineTo(t2.x, t2.y);
        alb.stroke();

        alb.strokeStyle = 'rgba(15, 20, 25, 0.32)';
        alb.lineWidth = 5;
        alb.beginPath();
        alb.moveTo(t2.x, t2.y);
        alb.lineTo(t3.x, t3.y);
        alb.stroke();
        alb.restore();

        // Bump edge bevel
        bmp.save();
        bmp.strokeStyle = '#a8a8a8';
        bmp.lineWidth = 5;
        bmp.beginPath();
        bmp.moveTo(t1.x, t1.y);
        bmp.lineTo(t2.x, t2.y);
        bmp.stroke();

        bmp.strokeStyle = '#4e4e4e';
        bmp.lineWidth = 6;
        bmp.beginPath();
        bmp.moveTo(t2.x, t2.y);
        bmp.lineTo(t3.x, t3.y);
        bmp.stroke();
        bmp.restore();
      };

      drawFacet(p00, p10, p11, (r * 7 + c * 13) * 0.1);
      drawFacet(p00, p11, p01, (r * 11 + c * 17) * 0.1);
    }
  }

  // --- 4. Deep Crevices & Fractured Fissure Cracks ---
  const numCracks = 16;
  for (let i = 0; i < numCracks; i++) {
    let curX = ((i * 127 + 83) % W);
    let curY = ((i * 149 + 61) % (H - 400)) + 150;
    const len = 180 + (i % 5) * 80;
    const segments = 8;
    const path = [{ x: curX, y: curY }];

    for (let s = 0; s < segments; s++) {
      const angle = (Math.sin(i * 2 + s * 1.5) * 0.9) + 0.6; // downward diagonal
      curX += Math.cos(angle) * (len / segments);
      curY += Math.sin(angle) * (len / segments);
      path.push({ x: curX, y: curY });
    }

    // Shadow crevice in albedo
    alb.save();
    alb.strokeStyle = '#181b20';
    alb.lineWidth = 7;
    alb.lineCap = 'round';
    alb.lineJoin = 'round';
    alb.beginPath();
    alb.moveTo(path[0].x, path[0].y);
    for (let p = 1; p < path.length; p++) {
      alb.lineTo(path[p].x, path[p].y);
    }
    alb.stroke();

    // Sharp sunlit catch rim on top edge of crevice
    alb.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    alb.lineWidth = 2.5;
    alb.beginPath();
    alb.moveTo(path[0].x - 3, path[0].y - 3);
    for (let p = 1; p < path.length; p++) {
      alb.lineTo(path[p].x - 3, path[p].y - 3);
    }
    alb.stroke();
    alb.restore();

    // Deep groove in bump map
    bmp.save();
    bmp.strokeStyle = '#101010';
    bmp.lineWidth = 8;
    bmp.lineCap = 'round';
    bmp.beginPath();
    bmp.moveTo(path[0].x, path[0].y);
    for (let p = 1; p < path.length; p++) {
      bmp.lineTo(path[p].x, path[p].y);
    }
    bmp.stroke();

    bmp.strokeStyle = '#d0d0d0';
    bmp.lineWidth = 3;
    bmp.beginPath();
    bmp.moveTo(path[0].x - 3, path[0].y - 3);
    for (let p = 1; p < path.length; p++) {
      bmp.lineTo(path[p].x - 3, path[p].y - 3);
    }
    bmp.stroke();
    bmp.restore();

    // High roughness in cracks
    rgh.save();
    rgh.strokeStyle = '#fafafa';
    rgh.lineWidth = 8;
    rgh.beginPath();
    rgh.moveTo(path[0].x, path[0].y);
    for (let p = 1; p < path.length; p++) {
      rgh.lineTo(path[p].x, path[p].y);
    }
    rgh.stroke();
    rgh.restore();
  }

  // --- 5. Quartz Vein Inclusions ---
  const quartzVeins = [
    { start: { x: 120, y: 400 }, ctrl: { x: 700, y: 650 }, end: { x: 1300, y: 950 } },
    { start: { x: 800, y: 1100 }, ctrl: { x: 1400, y: 1350 }, end: { x: 1950, y: 1550 } },
    { start: { x: 300, y: 1500 }, ctrl: { x: 900, y: 1700 }, end: { x: 1700, y: 1850 } }
  ];

  quartzVeins.forEach(v => {
    // Outer translucent milk-quartz
    alb.save();
    alb.strokeStyle = 'rgba(235, 238, 242, 0.45)';
    alb.lineWidth = 18;
    alb.lineCap = 'round';
    alb.beginPath();
    alb.moveTo(v.start.x, v.start.y);
    alb.quadraticCurveTo(v.ctrl.x, v.ctrl.y, v.end.x, v.end.y);
    alb.stroke();

    // Core bright quartz core
    alb.strokeStyle = '#f8fafc';
    alb.lineWidth = 8;
    alb.beginPath();
    alb.moveTo(v.start.x, v.start.y);
    alb.quadraticCurveTo(v.ctrl.x, v.ctrl.y, v.end.x, v.end.y);
    alb.stroke();
    alb.restore();

    // Quartz is shiny/smoother (~0.25 roughness)
    rgh.save();
    rgh.strokeStyle = '#484848';
    rgh.lineWidth = 14;
    rgh.lineCap = 'round';
    rgh.beginPath();
    rgh.moveTo(v.start.x, v.start.y);
    rgh.quadraticCurveTo(v.ctrl.x, v.ctrl.y, v.end.x, v.end.y);
    rgh.stroke();
    rgh.restore();

    // Slightly raised bump
    bmp.save();
    bmp.strokeStyle = '#b0b0b0';
    bmp.lineWidth = 10;
    bmp.lineCap = 'round';
    bmp.beginPath();
    bmp.moveTo(v.start.x, v.start.y);
    bmp.quadraticCurveTo(v.ctrl.x, v.ctrl.y, v.end.x, v.end.y);
    bmp.stroke();
    bmp.restore();
  });

  // --- 6. Velvety Green Moss on Upper Surfaces & Crevices ---
  // Large organic patches predominantly in the upper half (y < 1100)
  const mossCenters = [
    { x: 350, y: 220, rx: 280, ry: 190 },
    { x: 950, y: 180, rx: 340, ry: 210 },
    { x: 1650, y: 260, rx: 320, ry: 200 },
    { x: 620, y: 480, rx: 240, ry: 160 },
    { x: 1350, y: 520, rx: 260, ry: 180 },
    { x: 250, y: 780, rx: 200, ry: 140 },
    { x: 1800, y: 820, rx: 220, ry: 150 },
    { x: 880, y: 920, rx: 250, ry: 160 },
    { x: 1450, y: 1250, rx: 190, ry: 130 }
  ];

  mossCenters.forEach(m => {
    // 1. Dark moss base shadow ring
    const radGrad = alb.createRadialGradient(m.x, m.y, m.rx * 0.15, m.x, m.y, m.rx);
    radGrad.addColorStop(0.0, '#42782b'); // Lush velvety green center
    radGrad.addColorStop(0.5, '#2e5b1d'); // Rich forest green
    radGrad.addColorStop(0.8, '#1e3c12'); // Dark shaded moss root
    radGrad.addColorStop(1.0, 'rgba(30, 60, 18, 0)'); // Dissolve into stone
    alb.fillStyle = radGrad;

    alb.beginPath();
    // Distort circle into organic moss clump
    const steps = 36;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const noise = 1.0 + Math.sin(a * 5 + m.x) * 0.18 + Math.cos(a * 9) * 0.12;
      const px = m.x + Math.cos(a) * m.rx * noise;
      const py = m.y + Math.sin(a) * m.ry * noise;
      if (s === 0) alb.moveTo(px, py);
      else alb.lineTo(px, py);
    }
    alb.closePath();
    alb.fill();

    // 2. Bright sunlit chartreuse/lime moss highlights
    const hiGrad = alb.createRadialGradient(m.x - m.rx * 0.25, m.y - m.ry * 0.25, 10, m.x, m.y, m.rx * 0.65);
    hiGrad.addColorStop(0.0, '#82c83c'); // Glowing lime
    hiGrad.addColorStop(0.4, '#5ea82e'); // Emerald
    hiGrad.addColorStop(1.0, 'rgba(94, 168, 46, 0)');
    alb.fillStyle = hiGrad;
    alb.beginPath();
    alb.ellipse(m.x - m.rx * 0.2, m.y - m.ry * 0.2, m.rx * 0.55, m.ry * 0.55, 0, 0, Math.PI * 2);
    alb.fill();

    // 3. Velvety stipple spores
    alb.fillStyle = '#9fe84b';
    for (let dot = 0; dot < 70; dot++) {
      const da = Math.random() * Math.PI * 2;
      const dr = Math.sqrt(Math.random()) * (m.rx * 0.7);
      const dx = m.x + Math.cos(da) * dr;
      const dy = m.y + Math.sin(da) * (dr * (m.ry / m.rx));
      const sz = 3 + Math.random() * 6;
      alb.beginPath();
      alb.arc(dx, dy, sz, 0, Math.PI * 2);
      alb.fill();
    }

    // Roughness for moss: very diffuse velvety ~0.94
    rgh.fillStyle = '#efefef';
    rgh.beginPath();
    rgh.ellipse(m.x, m.y, m.rx * 0.85, m.ry * 0.85, 0, 0, Math.PI * 2);
    rgh.fill();

    // Bump for moss: slightly raised spongy cushion
    bmp.fillStyle = '#9e9e9e';
    bmp.beginPath();
    bmp.ellipse(m.x, m.y, m.rx * 0.8, m.ry * 0.8, 0, 0, Math.PI * 2);
    bmp.fill();
  });

  // --- 7. Lichen Colonies & Golden Rosettes ---
  for (let l = 0; l < 24; l++) {
    const lx = (l * 181 + 97) % (W - 200) + 100;
    const ly = (l * 211 + 131) % (H - 200) + 100;
    const lrad = 18 + (l % 4) * 12;

    const isGold = l % 3 === 0;
    alb.fillStyle = isGold ? '#d99726' : '#9fc59f';
    alb.beginPath();
    alb.arc(lx, ly, lrad, 0, Math.PI * 2);
    alb.fill();

    alb.fillStyle = isGold ? '#f7cf68' : '#d2ebd2';
    alb.beginPath();
    alb.arc(lx - 2, ly - 2, lrad * 0.65, 0, Math.PI * 2);
    alb.fill();

    rgh.fillStyle = '#f0f0f0';
    rgh.fillRect(lx - lrad, ly - lrad, lrad * 2, lrad * 2);
  }

  // --- 8. Micro-Pitting & Mineral Speckles (Feldspar, Mica, Dark Minerals) ---
  // Dark pits
  alb.fillStyle = 'rgba(20, 24, 28, 0.4)';
  for (let p = 0; p < 800; p++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const ps = 2 + Math.random() * 3.5;
    alb.fillRect(px, py, ps, ps);
  }

  // Pink potassium feldspar crystals
  alb.fillStyle = 'rgba(224, 160, 142, 0.55)';
  for (let p = 0; p < 350; p++) {
    const px = Math.random() * W;
    const py = Math.random() * H;
    const ps = 3 + Math.random() * 4;
    alb.fillRect(px, py, ps, ps);
  }

  // Mica sparkling flakes (roughness low, slight metalness)
  for (let m = 0; m < 200; m++) {
    const mx = Math.random() * W;
    const my = Math.random() * H;
    const ms = 2.5 + Math.random() * 3;
    alb.fillStyle = 'rgba(255, 255, 255, 0.75)';
    alb.fillRect(mx, my, ms, ms);

    rgh.fillStyle = '#3a3a3a'; // shiny mica
    rgh.fillRect(mx, my, ms, ms);

    met.fillStyle = '#404040'; // slight metallic shimmer
    met.fillRect(mx, my, ms, ms);
  }

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('granite_boulder', set);
  return set;
}

/* ==========================================================================
   2. RIVER PEBBLE TEXTURES (2048x2048)
   ========================================================================== */
export function getRiverPebbleTextures() {
  if (textureCache.has('river_pebble')) {
    return textureCache.get('river_pebble');
  }

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: metC, ctx: met } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // --- 1. Albedo: Water-Tumbled Silt & Multi-Hued River Stone Palette ---
  // Silky water-worn stone gradient
  const bgGrad = alb.createRadialGradient(W * 0.45, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.75);
  bgGrad.addColorStop(0.0, '#a6b0b8'); // Polished cool slate quartz
  bgGrad.addColorStop(0.3, '#8b969e'); // Medium river blue-gray
  bgGrad.addColorStop(0.65, '#6f7980'); // Deep river stone gray
  bgGrad.addColorStop(0.85, '#5c646b'); // Basalt rim
  bgGrad.addColorStop(1.0, '#4a5056'); // Shaded water line
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Roughness: Smooth polished water-washed finish (~0.32-0.38)
  rgh.fillStyle = '#595959';
  rgh.fillRect(0, 0, W, H);

  // Metalness: pure dielectric non-metal
  met.fillStyle = '#000000';
  met.fillRect(0, 0, W, H);

  // Bump: gentle undulating smooth surface
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  // --- 2. Fluid Water-Eroded Swirls & Marbling Contours ---
  const marblingBands = [
    { col: 'rgba(215, 222, 228, 0.22)', w: 180, offset: 200 },
    { col: 'rgba(110, 125, 138, 0.28)', w: 220, offset: 550 },
    { col: 'rgba(180, 168, 154, 0.25)', w: 160, offset: 900 }, // Warm jasper silt ribbon
    { col: 'rgba(230, 235, 240, 0.20)', w: 140, offset: 1250 },
    { col: 'rgba(92, 102, 110, 0.24)', w: 200, offset: 1600 }
  ];

  marblingBands.forEach((b, idx) => {
    alb.fillStyle = b.col;
    alb.beginPath();
    alb.moveTo(0, b.offset);
    for (let x = 0; x <= W; x += 64) {
      const y = b.offset + Math.sin((x / W) * Math.PI * 3 + idx * 1.8) * 120 + Math.cos((x / W) * Math.PI * 6) * 45;
      alb.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 64) {
      const y = b.offset + b.w + Math.sin((x / W) * Math.PI * 3 + idx * 1.8) * 120 + Math.cos((x / W) * Math.PI * 6) * 45;
      alb.lineTo(x, y);
    }
    alb.closePath();
    alb.fill();
  });

  // --- 3. Crisp Quartz Streaks & Veins ---
  const pebbleVeins = [
    {
      p0: { x: 0, y: 450 },
      c1: { x: 600, y: 380 },
      c2: { x: 1300, y: 720 },
      p1: { x: 2048, y: 680 },
      w: 22
    },
    {
      p0: { x: 300, y: 0 },
      c1: { x: 750, y: 700 },
      c2: { x: 1100, y: 1400 },
      p1: { x: 1750, y: 2048 },
      w: 16
    },
    {
      p0: { x: 0, y: 1650 },
      c1: { x: 800, y: 1480 },
      c2: { x: 1450, y: 1720 },
      p1: { x: 2048, y: 1580 },
      w: 26
    }
  ];

  pebbleVeins.forEach(v => {
    // Diffuse translucent quartz halo
    alb.save();
    alb.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    alb.lineWidth = v.w * 1.8;
    alb.lineCap = 'round';
    alb.beginPath();
    alb.moveTo(v.p0.x, v.p0.y);
    alb.bezierCurveTo(v.c1.x, v.c1.y, v.c2.x, v.c2.y, v.p1.x, v.p1.y);
    alb.stroke();

    // Vibrant milky white core
    alb.strokeStyle = '#ffffff';
    alb.lineWidth = v.w * 0.7;
    alb.beginPath();
    alb.moveTo(v.p0.x, v.p0.y);
    alb.bezierCurveTo(v.c1.x, v.c1.y, v.c2.x, v.c2.y, v.p1.x, v.p1.y);
    alb.stroke();

    // Edge highlight rim
    alb.strokeStyle = 'rgba(255, 255, 230, 0.7)';
    alb.lineWidth = 3;
    alb.beginPath();
    alb.moveTo(v.p0.x, v.p0.y - 2);
    alb.bezierCurveTo(v.c1.x, v.c1.y - 2, v.c2.x, v.c2.y - 2, v.p1.x, v.p1.y - 2);
    alb.stroke();
    alb.restore();

    // Smooth glossy quartz: roughness ~0.20
    rgh.save();
    rgh.strokeStyle = '#333333';
    rgh.lineWidth = v.w * 1.4;
    rgh.lineCap = 'round';
    rgh.beginPath();
    rgh.moveTo(v.p0.x, v.p0.y);
    rgh.bezierCurveTo(v.c1.x, v.c1.y, v.c2.x, v.c2.y, v.p1.x, v.p1.y);
    rgh.stroke();
    rgh.restore();

    // Subtle quartz relief in bump
    bmp.save();
    bmp.strokeStyle = '#999999';
    bmp.lineWidth = v.w * 0.8;
    bmp.lineCap = 'round';
    bmp.beginPath();
    bmp.moveTo(v.p0.x, v.p0.y);
    bmp.bezierCurveTo(v.c1.x, v.c1.y, v.c2.x, v.c2.y, v.p1.x, v.p1.y);
    bmp.stroke();
    bmp.restore();
  });

  // --- 4. River Pebble Speckles & Mineral Inclusions ---
  // Dark amphibole / basalt speckles
  alb.fillStyle = 'rgba(35, 40, 45, 0.55)';
  for (let i = 0; i < 900; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    const sr = 1.5 + Math.random() * 3.5;
    alb.beginPath();
    alb.arc(sx, sy, sr, 0, Math.PI * 2);
    alb.fill();
  }

  // Terracotta jasper speckles
  alb.fillStyle = 'rgba(186, 92, 70, 0.45)';
  for (let i = 0; i < 400; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    const sr = 2 + Math.random() * 4;
    alb.beginPath();
    alb.arc(sx, sy, sr, 0, Math.PI * 2);
    alb.fill();
  }

  // Golden pyrite specks with metallic glint
  for (let i = 0; i < 180; i++) {
    const sx = Math.random() * W;
    const sy = Math.random() * H;
    const sr = 2 + Math.random() * 3;
    alb.fillStyle = '#fce788';
    alb.beginPath();
    alb.arc(sx, sy, sr, 0, Math.PI * 2);
    alb.fill();

    rgh.fillStyle = '#222222'; // mirror gloss
    rgh.beginPath();
    rgh.arc(sx, sy, sr, 0, Math.PI * 2);
    rgh.fill();

    met.fillStyle = '#777777'; // metallic
    met.beginPath();
    met.arc(sx, sy, sr, 0, Math.PI * 2);
    met.fill();
  }

  // Soft specular sheen highlight overlay for the polished water-worn surface
  const sheenGrad = alb.createRadialGradient(W * 0.4, H * 0.35, 50, W * 0.45, H * 0.4, W * 0.55);
  sheenGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.18)');
  sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
  sheenGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  alb.fillStyle = sheenGrad;
  alb.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    metalnessMap: toTexture(metC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('river_pebble', set);
  return set;
}

/**
 * Clear procedural rock texture cache
 */
export function clearRockTextureCache() {
  textureCache.clear();
}
