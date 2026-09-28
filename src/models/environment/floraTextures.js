import * as THREE from 'three';
import { createScaledCanvas as createCanvas, createBumpCanvas, toTexture as makeTexture } from '../textureQuality.js';

/**
 * Procedural Hand-Painted Stylized PBR Texture Generator for Flora & Ground Foliage
 * Inspired by Warcraft 2 hand-painted art style, Valorant, and Overwatch.
 *
 * Generates 2048x2048 high-resolution procedural PBR textures:
 * 1. Flower Petals & Stamen (roses/pink, daisies/white, sunflowers/yellow, bluebells/blue)
 * 2. Bush Leaf & Berries (densely packed stylized leaves & glowing clusters of red/blue berries)
 * 3. Grass Blade (lush vertical gradient from dark moist soil-green at root to sunny lime-green at tip with central rib)
 * 4. Mushroom (Amanita fairy red cap with white spots / chanterelle caps, radiating gills & fibrous stipe)
 * 5. Tree Stump / Fallen Log (weathered bark on sides, annual growth rings with heartwood cracks & mossy patches on top)
 * 6. Water Lily (floating circular emerald lily pad with notch, floating pink/white lotus blossom with yellow stamen)
 */

const textureCache = new Map();

function toTexture(canvas, isSRGB = true, isRepeat = true) {
  return makeTexture(canvas, isSRGB, { wrapS: isRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping });
}

/* ==========================================================================
   1. FLOWER PETALS & STAMEN TEXTURES (2048x2048)
   ========================================================================== */
export function getFlowerTextures(type = 'pink') {
  const key = `flower_petals_${type}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  const palettes = {
    pink: {
      deepCenter: '#831843',
      midPetal: '#db2777',
      edgeLight: '#f472b6',
      tipGlow: '#fdf2f8',
      veinCol: 'rgba(131, 24, 67, 0.55)',
      rimGlow: 'rgba(255, 241, 242, 0.7)'
    },
    white: {
      deepCenter: '#ccfbf1',
      midPetal: '#e2e8f0',
      edgeLight: '#f8fafc',
      tipGlow: '#ffffff',
      veinCol: 'rgba(148, 163, 184, 0.45)',
      rimGlow: 'rgba(255, 255, 255, 0.85)'
    },
    yellow: {
      deepCenter: '#9a3412',
      midPetal: '#ea580c',
      edgeLight: '#facc15',
      tipGlow: '#fef08a',
      veinCol: 'rgba(154, 52, 18, 0.5)',
      rimGlow: 'rgba(254, 240, 138, 0.8)'
    },
    blue: {
      deepCenter: '#1e1b4b',
      midPetal: '#2563eb',
      edgeLight: '#60a5fa',
      tipGlow: '#dbeafe',
      veinCol: 'rgba(30, 27, 75, 0.55)',
      rimGlow: 'rgba(219, 234, 254, 0.8)'
    }
  };

  const pal = palettes[type] || palettes.pink;

  // Longitudinal & Radial Petal Gradient (from base to tip)
  const petalGrad = alb.createLinearGradient(0, H, 0, 0);
  petalGrad.addColorStop(0.0, pal.deepCenter); // Calyx insertion point
  petalGrad.addColorStop(0.3, pal.midPetal);
  petalGrad.addColorStop(0.75, pal.edgeLight);
  petalGrad.addColorStop(1.0, pal.tipGlow); // Sunlit tip
  alb.fillStyle = petalGrad;
  alb.fillRect(0, 0, W, H);

  // Soft lateral edge shadow & curvature
  const sideGrad = alb.createLinearGradient(0, 0, W, 0);
  sideGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.22)');
  sideGrad.addColorStop(0.2, 'rgba(0, 0, 0, 0.0)');
  sideGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.0)');
  sideGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.22)');
  alb.fillStyle = sideGrad;
  alb.fillRect(0, 0, W, H);

  // Delicate Translucent Petal Vein Lines
  alb.save();
  alb.strokeStyle = pal.veinCol;
  alb.lineCap = 'round';

  const numMainVeins = 9;
  for (let v = 0; v < numMainVeins; v++) {
    const startX = W * 0.5 + (v - 4) * 45;
    const endX = W * 0.5 + (v - 4) * 220;
    alb.lineWidth = v === 4 ? 10 : 5;

    alb.beginPath();
    alb.moveTo(startX, H);
    alb.quadraticCurveTo(W * 0.5 + (v - 4) * 80, H * 0.5, endX, 0);
    alb.stroke();

    // Secondary vein forks
    for (let y = H - 250; y > 200; y -= 160) {
      const curX = W * 0.5 + (v - 4) * (80 + ((H - y) / H) * 140);
      const dir = v >= 4 ? 1 : -1;
      alb.lineWidth = 2.5;
      alb.beginPath();
      alb.moveTo(curX, y);
      alb.lineTo(curX + dir * 65, y - 90);
      alb.stroke();
    }
  }
  alb.restore();

  // Vibrant Tip Rim Glow
  alb.strokeStyle = pal.rimGlow;
  alb.lineWidth = 14;
  alb.beginPath();
  alb.moveTo(0, 10);
  alb.lineTo(W, 10);
  alb.stroke();

  // Roughness: Silky soft petal (~0.58)
  rgh.fillStyle = '#949494';
  rgh.fillRect(0, 0, W, H);

  // Bump: delicate vein relief
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.drawImage(albC, 0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set(key, set);
  return set;
}

export function getFlowerCenterTextures() {
  if (textureCache.has('flower_center')) return textureCache.get('flower_center');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(1024, 1024);

  const cx = W * 0.5;
  const cy = H * 0.5;
  const rad = W * 0.48;

  // Stamen core gradient
  const grad = alb.createRadialGradient(cx, cy, 30, cx, cy, rad);
  grad.addColorStop(0.0, '#78350f'); // Deep amber heart
  grad.addColorStop(0.35, '#b45309'); // Warm ochre
  grad.addColorStop(0.7, '#eab308'); // Golden pollen
  grad.addColorStop(0.92, '#fde047'); // Bright outer crown
  grad.addColorStop(1.0, '#ca8a04'); // Darker edge rim
  alb.fillStyle = grad;
  alb.fillRect(0, 0, W, H);

  // Concentric golden pollen granules (Fermat phyllotaxis spiral)
  const numPollen = 320;
  for (let p = 0; p < numPollen; p++) {
    const angle = p * 2.39996; // Golden angle
    const r = Math.sqrt(p / numPollen) * (rad * 0.95);
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;

    // Drop shadow under grain
    alb.fillStyle = 'rgba(69, 26, 3, 0.45)';
    alb.beginPath();
    alb.arc(px + 1.5, py + 2, 4.5, 0, Math.PI * 2);
    alb.fill();

    // Golden pollen dome
    alb.fillStyle = p % 3 === 0 ? '#fef08a' : (p % 2 === 0 ? '#facc15' : '#eab308');
    alb.beginPath();
    alb.arc(px, py, 4 + (p % 3), 0, Math.PI * 2);
    alb.fill();

    // Bump relief
    bmp.fillStyle = '#d8d8d8';
    bmp.beginPath();
    bmp.arc(px, py, 4, 0, Math.PI * 2);
    bmp.fill();
  }

  // Roughness: velvety powdery pollen (~0.82)
  rgh.fillStyle = '#d1d1d1';
  rgh.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('flower_center', set);
  return set;
}

/* ==========================================================================
   2. BERRY BUSH FOLIAGE & BERRIES TEXTURES (2048x2048)
   ========================================================================== */
export function getBerryBushTextures(type = 'red') {
  const key = `berry_bush_foliage_${type}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Background deep foliage gradient
  const bgGrad = alb.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.7);
  bgGrad.addColorStop(0.0, '#1e3a10'); // Deep shadow interior
  bgGrad.addColorStop(0.4, '#365314'); // Rich hedge green
  bgGrad.addColorStop(0.8, '#4d7c0f'); // Mid foliage
  bgGrad.addColorStop(1.0, '#65a30d'); // Sunlit outer leaves
  alb.fillStyle = bgGrad;
  alb.fillRect(0, 0, W, H);

  // Overlapping Stylized Shrub Leaf Blades
  const numLeaves = 260;
  for (let i = 0; i < numLeaves; i++) {
    const lx = Math.random() * W;
    const ly = Math.random() * H;
    const lAngle = Math.random() * Math.PI * 2;
    const lLen = 130 + Math.random() * 90;
    const lWidth = 50 + Math.random() * 30;

    alb.save();
    alb.translate(lx, ly);
    alb.rotate(lAngle);

    // Leaf drop shadow
    alb.fillStyle = 'rgba(10, 25, 8, 0.35)';
    alb.beginPath();
    alb.moveTo(3, -lLen * 0.5 + 4);
    alb.bezierCurveTo(lWidth + 3, -lLen * 0.2 + 4, lWidth + 3, lLen * 0.2 + 4, 3, lLen * 0.5 + 4);
    alb.bezierCurveTo(-lWidth + 3, lLen * 0.2 + 4, -lWidth + 3, -lLen * 0.2 + 4, 3, -lLen * 0.5 + 4);
    alb.fill();

    // Leaf body with sun gradient
    const leafGrad = alb.createLinearGradient(-lWidth, 0, lWidth, 0);
    leafGrad.addColorStop(0.0, '#3f6212');
    leafGrad.addColorStop(0.5, '#65a30d');
    leafGrad.addColorStop(1.0, '#4d7c0f');
    alb.fillStyle = leafGrad;
    alb.beginPath();
    alb.moveTo(0, -lLen * 0.5);
    alb.bezierCurveTo(lWidth, -lLen * 0.2, lWidth, lLen * 0.2, 0, lLen * 0.5);
    alb.bezierCurveTo(-lWidth, lLen * 0.2, -lWidth, -lLen * 0.2, 0, -lLen * 0.5);
    alb.fill();

    // Bright sunlit rim
    alb.strokeStyle = '#a3e635';
    alb.lineWidth = 4;
    alb.stroke();

    // Center vein
    alb.strokeStyle = '#bef264';
    alb.lineWidth = 3;
    alb.beginPath();
    alb.moveTo(0, -lLen * 0.45);
    alb.lineTo(0, lLen * 0.45);
    alb.stroke();

    alb.restore();
  }

  // Roughness: waxy leaves ~0.50
  rgh.fillStyle = '#808080';
  rgh.fillRect(0, 0, W, H);

  // Bump: leaf relief
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.drawImage(albC, 0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set(key, set);
  return set;
}

export function getBerryTextures(type = 'red') {
  const key = `berry_gloss_${type}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(1024, 1024);

  const isRed = type === 'red';
  const pal = isRed
    ? { core: '#450a0a', mid: '#b91c1c', bright: '#ef4444', spec: '#fee2e2' }
    : { core: '#0f172a', mid: '#1e3a8a', bright: '#3b82f6', spec: '#dbeafe' };

  // Spherical juicy berry gradient
  const grad = alb.createRadialGradient(W * 0.35, H * 0.35, 40, W * 0.5, H * 0.5, W * 0.5);
  grad.addColorStop(0.0, pal.bright);
  grad.addColorStop(0.4, pal.mid);
  grad.addColorStop(0.85, pal.core);
  grad.addColorStop(1.0, '#09090b');
  alb.fillStyle = grad;
  alb.fillRect(0, 0, W, H);

  // Glossy high-specular dome highlight (Overwatch / Valorant style)
  alb.fillStyle = pal.spec;
  alb.beginPath();
  alb.ellipse(W * 0.35, H * 0.35, 90, 60, -Math.PI / 4, 0, Math.PI * 2);
  alb.fill();

  // Bottom star calyx scar
  alb.fillStyle = '#14532d';
  alb.beginPath();
  alb.arc(W * 0.65, H * 0.7, 24, 0, Math.PI * 2);
  alb.fill();

  // Roughness: very shiny juicy surface (~0.22)
  rgh.fillStyle = '#383838';
  rgh.fillRect(0, 0, W, H);
  // Mirror spec dot
  rgh.fillStyle = '#111111';
  rgh.beginPath();
  rgh.ellipse(W * 0.35, H * 0.35, 90, 60, -Math.PI / 4, 0, Math.PI * 2);
  rgh.fill();

  // Bump: smooth dome
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set(key, set);
  return set;
}

/* ==========================================================================
   3. GRASS BLADE TEXTURES (2048x2048)
   ========================================================================== */
export function getGrassBladeTextures() {
  if (textureCache.has('grass_blade')) return textureCache.get('grass_blade');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Vertical gradient from dark moist soil-green at root (bottom) to sunny lime-green at tip (top)
  const grassGrad = alb.createLinearGradient(0, H, 0, 0);
  grassGrad.addColorStop(0.0, '#14290b'); // Dark moist humus
  grassGrad.addColorStop(0.2, '#1f4510'); // Deep lush base
  grassGrad.addColorStop(0.5, '#3e7b1e'); // Meadow emerald
  grassGrad.addColorStop(0.75, '#68ab27'); // Sunlit lime
  grassGrad.addColorStop(0.94, '#9fe339'); // Bright apex
  grassGrad.addColorStop(1.0, '#d9fc85'); // Backlit glowing tip
  alb.fillStyle = grassGrad;
  alb.fillRect(0, 0, W, H);

  // Fine longitudinal fiber striations
  alb.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let x = 12; x < W; x += 18) {
    alb.fillRect(x, 0, 3 + (x % 3), H);
  }
  alb.fillStyle = 'rgba(0, 0, 0, 0.09)';
  for (let x = 20; x < W; x += 26) {
    alb.fillRect(x, 0, 3, H);
  }

  // Central prominent blade rib
  alb.strokeStyle = '#bbf7d0';
  alb.lineWidth = 16;
  alb.beginPath();
  alb.moveTo(W * 0.5, 0);
  alb.lineTo(W * 0.5, H);
  alb.stroke();

  // Shadow groove along side of the rib
  alb.strokeStyle = 'rgba(15, 45, 10, 0.5)';
  alb.lineWidth = 9;
  alb.beginPath();
  alb.moveTo(W * 0.5 + 9, 0);
  alb.lineTo(W * 0.5 + 9, H);
  alb.stroke();

  // Roughness: waxy blade surface (~0.42)
  const rghGrad = rgh.createLinearGradient(0, H, 0, 0);
  rghGrad.addColorStop(0.0, '#b8b8b8'); // Soil root matte
  rghGrad.addColorStop(0.5, '#6e6e6e'); // Waxy blade
  rghGrad.addColorStop(1.0, '#4a4a4a'); // Shiny tip
  rgh.fillStyle = rghGrad;
  rgh.fillRect(0, 0, W, H);

  // Bump: raised central rib
  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.strokeStyle = '#c0c0c0';
  bmp.lineWidth = 14;
  bmp.beginPath();
  bmp.moveTo(W * 0.5, 0);
  bmp.lineTo(W * 0.5, H);
  bmp.stroke();

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('grass_blade', set);
  return set;
}

/* ==========================================================================
   4. MUSHROOM TEXTURES (2048x2048)
   ========================================================================== */
export function getMushroomTextures(type = 'amanita') {
  const key = `mushroom_cap_${type}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  const isAmanita = type === 'amanita';
  const cx = W * 0.5;
  const cy = H * 0.5;
  const rad = W * 0.48;

  if (isAmanita) {
    // Vibrant fairy red Amanita cap
    const capGrad = alb.createRadialGradient(cx, cy * 0.8, 60, cx, cy, rad);
    capGrad.addColorStop(0.0, '#f87171'); // Highlight vermilion apex
    capGrad.addColorStop(0.35, '#ef4444'); // Saturated ruby red
    capGrad.addColorStop(0.75, '#b91c1c'); // Deep crimson
    capGrad.addColorStop(1.0, '#7f1d1d'); // Under-rim
    alb.fillStyle = capGrad;
    alb.fillRect(0, 0, W, H);

    // Iconic White Circular Raised Spots
    const spots = [
      { x: cx, y: cy * 0.7, r: 75 },
      { x: cx - 350, y: cy * 0.75, r: 65 },
      { x: cx + 380, y: cy * 0.72, r: 70 },
      { x: cx - 600, y: cy * 0.95, r: 55 },
      { x: cx + 620, y: cy * 0.92, r: 58 },
      { x: cx - 220, y: cy * 1.15, r: 68 },
      { x: cx + 240, y: cy * 1.12, r: 64 },
      { x: cx - 480, y: cy * 1.35, r: 52 },
      { x: cx + 460, y: cy * 1.38, r: 50 },
      { x: cx, y: cy * 1.45, r: 60 }
    ];

    spots.forEach(sp => {
      // Drop shadow around spot
      alb.fillStyle = 'rgba(70, 10, 10, 0.45)';
      alb.beginPath();
      alb.arc(sp.x + 5, sp.y + 6, sp.r + 4, 0, Math.PI * 2);
      alb.fill();

      // White spot body
      const spGrad = alb.createRadialGradient(sp.x - sp.r * 0.25, sp.y - sp.r * 0.25, 4, sp.x, sp.y, sp.r);
      spGrad.addColorStop(0.0, '#ffffff');
      spGrad.addColorStop(0.75, '#fef2f2');
      spGrad.addColorStop(1.0, '#fecaca');
      alb.fillStyle = spGrad;
      alb.beginPath();
      alb.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      alb.fill();

      // Bump raised relief
      bmp.fillStyle = '#e0e0e0';
      bmp.beginPath();
      bmp.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      bmp.fill();
    });

    // Roughness: silky smooth cap (~0.38)
    rgh.fillStyle = '#606060';
    rgh.fillRect(0, 0, W, H);
  } else {
    // Chanterelle / Boletus warm ochre-gold cap
    const capGrad = alb.createRadialGradient(cx, cy * 0.8, 50, cx, cy, rad);
    capGrad.addColorStop(0.0, '#fef08a'); // Warm buttery golden apex
    capGrad.addColorStop(0.35, '#f59e0b'); // Amber ochre
    capGrad.addColorStop(0.75, '#b45309'); // Earthy golden brown
    capGrad.addColorStop(1.0, '#78350f'); // Shadowed hem
    alb.fillStyle = capGrad;
    alb.fillRect(0, 0, W, H);

    // Roughness: velvety matte (~0.62)
    rgh.fillStyle = '#9e9e9e';
    rgh.fillRect(0, 0, W, H);
  }

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set(key, set);
  return set;
}

export function getMushroomStemTextures() {
  if (textureCache.has('mushroom_stem')) return textureCache.get('mushroom_stem');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(1024, 1024);

  // Vertical fibrous stipe gradient
  const stemGrad = alb.createLinearGradient(0, 0, 0, H);
  stemGrad.addColorStop(0.0, '#fef9c3'); // Top collar
  stemGrad.addColorStop(0.2, '#fef08a');
  stemGrad.addColorStop(0.65, '#f1f5f9'); // Fibrous white stalk
  stemGrad.addColorStop(1.0, '#94a3b8'); // Soil base
  alb.fillStyle = stemGrad;
  alb.fillRect(0, 0, W, H);

  // Fibrous striations
  alb.fillStyle = 'rgba(148, 163, 184, 0.28)';
  for (let x = 10; x < W; x += 14) {
    alb.fillRect(x, 0, 3, H);
  }

  // Spore ring / collar (annulus)
  alb.fillStyle = '#ffffff';
  alb.fillRect(0, 160, W, 40);
  alb.fillStyle = 'rgba(100, 116, 139, 0.4)';
  alb.fillRect(0, 200, W, 16);

  // Roughness: fibrous matte (~0.75)
  rgh.fillStyle = '#bfbfbf';
  rgh.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.fillStyle = '#c0c0c0';
  bmp.fillRect(0, 160, W, 40);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('mushroom_stem', set);
  return set;
}

export function getMushroomGillsTextures() {
  if (textureCache.has('mushroom_gills')) return textureCache.get('mushroom_gills');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(1024, 1024);
  const { canvas: rghC, ctx: rgh } = createCanvas(1024, 1024);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(1024, 1024);

  const cx = W * 0.5;
  const cy = H * 0.5;
  const rad = W * 0.48;

  // Background creamy gills disc
  const grad = alb.createRadialGradient(cx, cy, 30, cx, cy, rad);
  grad.addColorStop(0.0, '#fef3c7');
  grad.addColorStop(0.65, '#fde68a');
  grad.addColorStop(1.0, '#d97706');
  alb.fillStyle = grad;
  alb.fillRect(0, 0, W, H);

  // Radiating accordion gill blades
  alb.save();
  const numGills = 80;
  for (let g = 0; g < numGills; g++) {
    const a = (g / numGills) * Math.PI * 2;
    const r1 = 40;
    const r2 = rad * 0.98;

    // Shadow groove
    alb.strokeStyle = 'rgba(120, 53, 15, 0.6)';
    alb.lineWidth = 4;
    alb.beginPath();
    alb.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    alb.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    alb.stroke();

    // Highlight blade edge
    alb.strokeStyle = '#fffbeb';
    alb.lineWidth = 2;
    alb.beginPath();
    alb.moveTo(cx + Math.cos(a + 0.02) * r1, cy + Math.sin(a + 0.02) * r1);
    alb.lineTo(cx + Math.cos(a + 0.02) * r2, cy + Math.sin(a + 0.02) * r2);
    alb.stroke();

    // Bump
    bmp.strokeStyle = '#303030';
    bmp.lineWidth = 4;
    bmp.beginPath();
    bmp.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    bmp.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    bmp.stroke();
  }
  alb.restore();

  rgh.fillStyle = '#b0b0b0';
  rgh.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('mushroom_gills', set);
  return set;
}

/* ==========================================================================
   5. TREE STUMP & FALLEN LOG TEXTURES (2048x2048)
   ========================================================================== */
export function getStumpBarkTextures() {
  if (textureCache.has('stump_bark')) return textureCache.get('stump_bark');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Weathered vertical cork oak bark
  const barkGrad = alb.createLinearGradient(0, 0, 0, H);
  barkGrad.addColorStop(0.0, '#593d28'); // Top rim
  barkGrad.addColorStop(0.5, '#3b2516'); // Aged oak trunk
  barkGrad.addColorStop(1.0, '#24160c'); // Moist ground base
  alb.fillStyle = barkGrad;
  alb.fillRect(0, 0, W, H);

  // Vertical ridges & deep furrow crevices
  for (let x = 0; x < W; x += 40) {
    const w = 22 + (x % 28);
    // Dark furrow
    alb.fillStyle = '#180e07';
    alb.fillRect(x, 0, 10, H);

    // Bark ridge
    const rGrad = alb.createLinearGradient(x + 10, 0, x + 10 + w, 0);
    rGrad.addColorStop(0.0, '#784a28');
    rGrad.addColorStop(0.5, '#9a6237');
    rGrad.addColorStop(1.0, '#5c351b');
    alb.fillStyle = rGrad;
    alb.fillRect(x + 10, 0, w, H);

    // Bump
    bmp.fillStyle = '#202020';
    bmp.fillRect(x, 0, 10, H);
    bmp.fillStyle = '#b5b5b5';
    bmp.fillRect(x + 10, 0, w, H);
  }

  // Velvety green moss climbing up the shaded bark
  alb.fillStyle = '#4d7c0f';
  for (let m = 0; m < 50; m++) {
    const mx = Math.random() * W;
    const my = 800 + Math.random() * 1200;
    const mr = 50 + Math.random() * 80;
    alb.beginPath();
    alb.arc(mx, my, mr, 0, Math.PI * 2);
    alb.fill();
  }

  // Roughness: coarse bark (~0.88)
  rgh.fillStyle = '#e0e0e0';
  rgh.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('stump_bark', set);
  return set;
}

export function getStumpTopTextures() {
  if (textureCache.has('stump_top')) return textureCache.get('stump_top');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  const cx = W * 0.5;
  const cy = H * 0.5;
  const rad = W * 0.48;

  // Base wood cross-section gradient
  const heartGrad = alb.createRadialGradient(cx, cy, 30, cx, cy, rad);
  heartGrad.addColorStop(0.0, '#6d4021'); // Deep heartwood
  heartGrad.addColorStop(0.3, '#8d5530'); // Warm sapwood
  heartGrad.addColorStop(0.7, '#ab7347'); // Annual growth rings
  heartGrad.addColorStop(0.92, '#7a4724'); // Cambium
  heartGrad.addColorStop(1.0, '#2d180c'); // Outer bark collar
  alb.fillStyle = heartGrad;
  alb.fillRect(0, 0, W, H);

  // Concentric undulating annual growth rings
  const numRings = 28;
  for (let r = 1; r <= numRings; r++) {
    const curR = (rad / numRings) * r;
    alb.strokeStyle = r % 2 === 0 ? 'rgba(64, 32, 14, 0.65)' : 'rgba(194, 139, 93, 0.45)';
    alb.lineWidth = 5 + (r % 3);

    alb.beginPath();
    const steps = 72;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const wave = Math.sin(a * 7 + r) * 7 + Math.cos(a * 11) * 5;
      const px = cx + Math.cos(a) * (curR + wave);
      const py = cy + Math.sin(a) * (curR + wave);
      if (s === 0) alb.moveTo(px, py);
      else alb.lineTo(px, py);
    }
    alb.closePath();
    alb.stroke();
  }

  // Radial shrinkage drying cracks
  alb.strokeStyle = '#1a0d06';
  alb.lineWidth = 7;
  alb.lineCap = 'round';
  const numCracks = 8;
  for (let c = 0; c < numCracks; c++) {
    const angle = (c / numCracks) * Math.PI * 2 + 0.3;
    const crackLen = 300 + (c % 3) * 120;
    alb.beginPath();
    alb.moveTo(cx, cy);
    alb.lineTo(cx + Math.cos(angle) * crackLen, cy + Math.sin(angle) * crackLen);
    alb.stroke();

    // Bump
    bmp.strokeStyle = '#101010';
    bmp.lineWidth = 9;
    bmp.beginPath();
    bmp.moveTo(cx, cy);
    bmp.lineTo(cx + Math.cos(angle) * crackLen, cy + Math.sin(angle) * crackLen);
    bmp.stroke();
  }

  // Moss on outer perimeter rim
  alb.fillStyle = 'rgba(77, 124, 15, 0.75)';
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    const mx = cx + Math.cos(a) * (rad * 0.93);
    const my = cy + Math.sin(a) * (rad * 0.93);
    alb.beginPath();
    alb.arc(mx, my, 28 + Math.sin(a * 5) * 12, 0, Math.PI * 2);
    alb.fill();
  }

  // Roughness: cut wood face (~0.70)
  rgh.fillStyle = '#b3b3b3';
  rgh.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('stump_top', set);
  return set;
}

export function getStumpTextures() {
  return getStumpBarkTextures();
}

/* ==========================================================================
   6. WATER LILY & LOTUS TEXTURES (2048x2048)
   ========================================================================== */
export function getWaterLilyTextures() {
  if (textureCache.has('lily_pad')) return textureCache.get('lily_pad');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  const cx = W * 0.5;
  const cy = H * 0.5;
  const rad = W * 0.48;

  // Emerald circular lily pad gradient with waxy bloom
  const padGrad = alb.createRadialGradient(cx, cy, 50, cx, cy, rad);
  padGrad.addColorStop(0.0, '#86efac'); // Light central stem insertion
  padGrad.addColorStop(0.3, '#22c55e'); // Vibrant emerald pad
  padGrad.addColorStop(0.75, '#15803d'); // Deep aquatic green
  padGrad.addColorStop(0.95, '#14532d'); // Outer boundary
  padGrad.addColorStop(1.0, '#a3e635'); // Upturned sunlit rim
  alb.fillStyle = padGrad;
  alb.fillRect(0, 0, W, H);

  // Radiating palmate leaf veins
  alb.save();
  const numVeins = 28;
  for (let i = 0; i < numVeins; i++) {
    const a = (i / numVeins) * Math.PI * 2;
    // Skip notch
    if (Math.abs(a - Math.PI * 0.5) < 0.28) continue;

    alb.strokeStyle = '#86efac';
    alb.lineWidth = 5;
    alb.beginPath();
    alb.moveTo(cx, cy);
    alb.lineTo(cx + Math.cos(a) * (rad * 0.94), cy + Math.sin(a) * (rad * 0.94));
    alb.stroke();

    // Secondary forks
    const midX = cx + Math.cos(a) * (rad * 0.5);
    const midY = cy + Math.sin(a) * (rad * 0.5);
    alb.strokeStyle = 'rgba(134, 239, 172, 0.45)';
    alb.lineWidth = 3;
    alb.beginPath();
    alb.moveTo(midX, midY);
    alb.lineTo(midX + Math.cos(a + 0.18) * (rad * 0.35), midY + Math.sin(a + 0.18) * (rad * 0.35));
    alb.moveTo(midX, midY);
    alb.lineTo(midX + Math.cos(a - 0.18) * (rad * 0.35), midY + Math.sin(a - 0.18) * (rad * 0.35));
    alb.stroke();
  }
  alb.restore();

  // Resting water droplets on the waxy surface
  const drops = [
    { x: cx - 260, y: cy - 220, r: 42 },
    { x: cx + 320, y: cy - 140, r: 35 },
    { x: cx - 180, y: cy + 280, r: 38 },
    { x: cx + 240, y: cy + 260, r: 48 },
    { x: cx + 80, y: cy - 350, r: 28 }
  ];

  drops.forEach(d => {
    // Drop shadow
    alb.fillStyle = 'rgba(10, 35, 15, 0.45)';
    alb.beginPath();
    alb.arc(d.x + 3, d.y + 4, d.r, 0, Math.PI * 2);
    alb.fill();

    // Refraction dome
    const dGrad = alb.createRadialGradient(d.x - d.r * 0.35, d.y - d.r * 0.35, 3, d.x, d.y, d.r);
    dGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    dGrad.addColorStop(0.4, 'rgba(187, 247, 208, 0.45)');
    dGrad.addColorStop(1.0, 'rgba(21, 128, 61, 0.7)');
    alb.fillStyle = dGrad;
    alb.beginPath();
    alb.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    alb.fill();

    // Glossy specular highlight
    rgh.fillStyle = '#0f0f0f';
    rgh.beginPath();
    rgh.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    rgh.fill();
  });

  // Roughness: waxy water-repellent leaf (~0.32)
  rgh.fillStyle = '#525252';
  rgh.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);
  bmp.drawImage(albC, 0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('lily_pad', set);
  return set;
}

export function getLotusTextures() {
  if (textureCache.has('lotus_blossom')) return textureCache.get('lotus_blossom');

  const { canvas: albC, ctx: alb, width: W, height: H } = createCanvas(2048, 2048);
  const { canvas: rghC, ctx: rgh } = createCanvas(2048, 2048);
  const { canvas: bmpC, ctx: bmp } = createBumpCanvas(2048, 2048);

  // Radiant lotus petals: pristine white tip to vibrant lotus pink/magenta base
  const petalGrad = alb.createLinearGradient(0, H, 0, 0);
  petalGrad.addColorStop(0.0, '#9d174d'); // Deep receptacle
  petalGrad.addColorStop(0.25, '#db2777'); // Saturated lotus magenta
  petalGrad.addColorStop(0.65, '#f472b6'); // Radiant blossom pink
  petalGrad.addColorStop(0.9, '#fdf2f8'); // Translucent white petal
  petalGrad.addColorStop(1.0, '#ffffff'); // Pure white sunlit tip
  alb.fillStyle = petalGrad;
  alb.fillRect(0, 0, W, H);

  // Delicate petal veins
  alb.strokeStyle = 'rgba(157, 23, 77, 0.4)';
  alb.lineWidth = 4;
  for (let v = 0; v < 9; v++) {
    const x = W * 0.5 + (v - 4) * 80;
    alb.beginPath();
    alb.moveTo(W * 0.5 + (v - 4) * 20, H);
    alb.quadraticCurveTo(W * 0.5 + (v - 4) * 60, H * 0.5, x, 0);
    alb.stroke();
  }

  // Roughness: silky petal (~0.52)
  rgh.fillStyle = '#858585';
  rgh.fillRect(0, 0, W, H);

  bmp.fillStyle = '#808080';
  bmp.fillRect(0, 0, W, H);

  const set = {
    map: toTexture(albC, true, true),
    roughnessMap: toTexture(rghC, false, true),
    bumpMap: toTexture(bmpC, false, true)
  };

  textureCache.set('lotus_blossom', set);
  return set;
}

/**
 * Clear procedural flora texture cache
 */
export function clearFloraTextureCache() {
  textureCache.clear();
}
