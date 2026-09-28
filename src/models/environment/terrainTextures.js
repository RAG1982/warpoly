import * as THREE from 'three';

const textureCache = new Map();

/**
 * Generates next-gen stylized hand-painted PBR terrain textures for WarPoly.
 * Supports the vast 320x320 continent with 6x more land area:
 * - Human Realm (Northeast): lush emerald green grass with sunny pasture clearings.
 * - Orc Realm (Southwest): rugged earthy reddish grass and charred dark soil.
 * - Central River Valley & Plains: lush riverbank meadows and stone crossings.
 * - Natural sandy beaches and coastlines wrapping the entire landmass.
 */
export function getTerrainTextures(landmarks = null, worldSize = 140) {
  const cacheKey = `master_terrain_${worldSize}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const width = 2048;
  const height = 2048;
  const scale = width / worldSize; // ~14.6 px per world unit

  // Coordinates helper: world (x, z) -> canvas (cx, cy)
  function w2c(wx, wz) {
    return {
      x: (wx + worldSize / 2) * scale,
      y: (wz + worldSize / 2) * scale
    };
  }

  // --- 1. ALBEDO CANVAS ---
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const ctx = albedoCanvas.getContext('2d');

  // Background: Deep Submerged Ocean/Coast Floor
  ctx.fillStyle = '#edd7a6';
  ctx.fillRect(0, 0, width, height);

  // 1. Continental Solid Land Coverage (>75% land, maxCoord <= 54)
  const landNW = w2c(-54, -54);
  const landSE = w2c(54, 54);
  const landW = landSE.x - landNW.x;
  const landH = landSE.y - landNW.y;

  // Draw Sandy Coastline Rim around the entire continent
  const sandBorderNW = w2c(-58, -58);
  const sandBorderSE = w2c(58, 58);
  ctx.fillStyle = '#e4ce95';
  ctx.beginPath();
  ctx.roundRect(sandBorderNW.x, sandBorderNW.y, sandBorderSE.x - sandBorderNW.x, sandBorderSE.y - sandBorderNW.y, 40 * scale);
  ctx.fill();

  // Draw Continental Grass Plateau
  const landGrad = ctx.createLinearGradient(w2c(-40, 40).x, w2c(-40, 40).y, w2c(40, -40).x, w2c(40, -40).y);
  landGrad.addColorStop(0.0, '#66873c'); // Orc side: warm earthy grass
  landGrad.addColorStop(0.35, '#6f9644');
  landGrad.addColorStop(0.5, '#6db84e'); // Central valley
  landGrad.addColorStop(0.7, '#72c852');
  landGrad.addColorStop(1.0, '#78d458'); // Human side: vivid royal emerald
  ctx.fillStyle = landGrad;
  ctx.beginPath();
  ctx.roundRect(landNW.x, landNW.y, landW, landH, 30 * scale);
  ctx.fill();

  // Natural Riverbed Channel (diagonal x - z = 0)
  ctx.save();
  ctx.strokeStyle = '#c6b07c';
  ctx.lineWidth = 6.2 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let t = -58; t <= 58; t += 2) {
    const bend = Math.sin(t * 0.16) * 5.5;
    const rx = t + bend / Math.SQRT2;
    const rz = t - bend / Math.SQRT2;
    const cp = w2c(rx, rz);
    if (t === -58) ctx.moveTo(cp.x, cp.y);
    else ctx.lineTo(cp.x, cp.y);
  }
  ctx.stroke();

  // Inner deeper riverbed
  ctx.strokeStyle = '#a89467';
  ctx.lineWidth = 3.6 * scale;
  ctx.stroke();
  ctx.restore();

  // Restore the 3 Walkable Fords / Land Bridges across the river
  const fords = [
    { x: -16, z: -16, r: 7.2 },
    { x: 0, z: 0, r: 8.2 },
    { x: 16, z: 16, r: 7.2 }
  ];

  fords.forEach(f => {
    const fc = w2c(f.x, f.y || f.z);
    const rad = f.r * scale;
    const fordGrad = ctx.createRadialGradient(fc.x, fc.y, rad * 0.2, fc.x, fc.y, rad);
    fordGrad.addColorStop(0, '#7eb65a');
    fordGrad.addColorStop(0.7, '#88a85f');
    fordGrad.addColorStop(1, '#ab9b71');
    ctx.fillStyle = fordGrad;
    ctx.beginPath();
    ctx.arc(fc.x, fc.y, rad, 0, Math.PI * 2);
    ctx.fill();
  });

  // Soft Organic Meadow Variations
  ctx.save();
  for (let i = 0; i < 220; i++) {
    const rx = (Math.random() - 0.5) * (worldSize * 0.76);
    const rz = (Math.random() - 0.5) * (worldSize * 0.76);
    const c = w2c(rx, rz);
    const rad = (4 + Math.random() * 8) * scale;

    const isOrcSide = (rx < 0 && rz > 0);
    if (isOrcSide) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(95, 75, 45, 0.08)' : 'rgba(85, 115, 45, 0.08)';
    } else {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(165, 238, 120, 0.11)' : 'rgba(75, 155, 55, 0.08)';
    }

    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rad, rad * 0.75, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Tilled Soil Clearings around bases
  function drawSoilPatch(wx, wz, wr, isAgriculture = false) {
    const c = w2c(wx, wz);
    const pr = wr * scale;

    const soilGrad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, pr);
    soilGrad.addColorStop(0, '#754a2b');
    soilGrad.addColorStop(0.65, '#855533');
    soilGrad.addColorStop(0.9, '#94613b');
    soilGrad.addColorStop(1.0, 'rgba(148, 97, 59, 0)');

    ctx.fillStyle = soilGrad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, pr, 0, Math.PI * 2);
    ctx.fill();

    // Furrows or mulch lines
    ctx.save();
    ctx.strokeStyle = isAgriculture ? 'rgba(85, 52, 28, 0.45)' : 'rgba(92, 58, 33, 0.35)';
    ctx.lineWidth = 2.5;
    const step = isAgriculture ? 5 : 8;
    for (let dy = -pr * 0.75; dy < pr * 0.75; dy += step) {
      ctx.beginPath();
      const halfW = Math.sqrt(Math.max(0, pr * pr * 0.55 - dy * dy));
      ctx.moveTo(c.x - halfW, c.y + dy);
      ctx.lineTo(c.x + halfW, c.y + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Human base clearings (140x140 world around 32, -30)
  drawSoilPatch(20, -34, 4.4); // Lumber Camp
  drawSoilPatch(44, -36, 4.2, true); // Cottage 1
  drawSoilPatch(44, -24, 4.2, true); // Cottage 2
  drawSoilPatch(32, -16, 4.4); // Barracks
  drawSoilPatch(32, -30, 6.0); // Castle Courtyard

  // Orc base clearings (140x140 world around -32, 30)
  drawSoilPatch(-20, 34, 4.4); // Orc Lumber Mill
  drawSoilPatch(-44, 36, 4.2, true); // Pig Farm 1
  drawSoilPatch(-44, 24, 4.2, true); // Pig Farm 2
  drawSoilPatch(-32, 16, 4.4); // Orc Barracks
  drawSoilPatch(-32, 30, 6.0); // Great Hall

  // --- 2. ROUGHNESS CANVAS ---
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d');

  // Base grass roughness (~0.85 -> #d9d9d9)
  rCtx.fillStyle = '#d9d9d9';
  rCtx.fillRect(0, 0, width, height);

  // Perimeter sand roughness (~0.72 -> #b8b8b8)
  rCtx.fillStyle = '#b8b8b8';
  rCtx.beginPath();
  rCtx.roundRect(sandBorderNW.x, sandBorderNW.y, sandBorderSE.x - sandBorderNW.x, sandBorderSE.y - sandBorderNW.y, 40 * scale);
  rCtx.fill();

  // Restore land roughness
  rCtx.fillStyle = '#d9d9d9';
  rCtx.beginPath();
  rCtx.roundRect(landNW.x, landNW.y, landW, landH, 30 * scale);
  rCtx.fill();

  // Riverbed roughness (~0.45 -> #737373)
  rCtx.strokeStyle = '#737373';
  rCtx.lineWidth = 6.2 * scale;
  rCtx.beginPath();
  for (let t = -58; t <= 58; t += 2) {
    const bend = Math.sin(t * 0.16) * 5.5;
    const rx = t + bend / Math.SQRT2;
    const rz = t - bend / Math.SQRT2;
    const cp = w2c(rx, rz);
    if (t === -58) rCtx.moveTo(cp.x, cp.y);
    else rCtx.lineTo(cp.x, cp.y);
  }
  rCtx.stroke();

  // Fords roughness (~0.75 -> #bfbfbf)
  fords.forEach(f => {
    const fc = w2c(f.x, f.y || f.z);
    rCtx.fillStyle = '#bfbfbf';
    rCtx.beginPath();
    rCtx.arc(fc.x, fc.y, f.r * scale, 0, Math.PI * 2);
    rCtx.fill();
  });

  // --- 3. BUMP / HEIGHT CANVAS ---
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d');

  // Uniform smooth matte terrain bump
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  // Convert canvases to Three.js textures
  const mapTex = new THREE.CanvasTexture(albedoCanvas);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.generateMipmaps = true;
  mapTex.wrapS = THREE.ClampToEdgeWrapping;
  mapTex.wrapT = THREE.ClampToEdgeWrapping;
  mapTex.minFilter = THREE.LinearMipmapLinearFilter;
  mapTex.magFilter = THREE.LinearFilter;

  const roughTex = new THREE.CanvasTexture(roughCanvas);
  roughTex.wrapS = THREE.ClampToEdgeWrapping;
  roughTex.wrapT = THREE.ClampToEdgeWrapping;
  roughTex.minFilter = THREE.LinearMipmapLinearFilter;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.ClampToEdgeWrapping;
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;
  bumpTex.minFilter = THREE.LinearMipmapLinearFilter;

  const result = {
    map: mapTex,
    roughnessMap: roughTex,
    bumpMap: bumpTex
  };

  textureCache.set(cacheKey, result);
  return result;
}
