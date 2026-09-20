import * as THREE from 'three';

const textureCache = new Map();

/**
 * Generates next-gen stylized hand-painted PBR terrain textures for WarPoly.
 * Inspires by Warcraft 2 / Overwatch / Valorant art style:
 * - Lush stylized emerald grass with hand-painted clover, dandelions, and soft meadow patchiness.
 * - Warm packed-dirt cobblestone pathways with embedded river pebbles and organic grass edges.
 * - Rich dark tilled agricultural soil with furrow ridges around farm and camps.
 * - Golden sandy beaches with subtle tide ripples and wet-sand gradients.
 * - Granite cliff strata with mossy crevices on steeper slopes.
 */
export function getTerrainTextures(landmarks = null) {
  if (textureCache.has('master_terrain')) {
    return textureCache.get('master_terrain');
  }

  const width = 2048;
  const height = 2048;
  const worldSize = 140;
  const scale = width / worldSize; // ~14.63 px per world unit

  // Coordinates helper: world (x, z) -> canvas (cx, cy)
  function w2c(wx, wz) {
    return {
      x: (wx + 70) * scale,
      y: (wz + 70) * scale
    };
  }

  const defaultLandmarks = landmarks || {
    castle: { x: 0, z: -2 },
    lumberCamp: { x: -19, z: -4 },
    goldMine: { x: -11, z: 15 },
    cottage: { x: 19, z: -7 },
    barracks: { x: 16, z: 13 },
    banditCamp: { x: -36, z: 32 }
  };

  // --- 1. ALBEDO CANVAS ---
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const ctx = albedoCanvas.getContext('2d');

  // Background: Submerged Ocean Sand
  ctx.fillStyle = '#edd7a6';
  ctx.fillRect(0, 0, width, height);

  // Draw Islands (Beach & Grass foundations)
  // Main Island
  const mainCenter = w2c(0, -2);
  const mainR = 41 * scale;

  // Mini Island (Bandit Camp)
  const miniCenter = w2c(-36, 32);
  const miniR = 13 * scale;

  // Draw Beach Sand Rim (Main Island)
  const beachGrad = ctx.createRadialGradient(mainCenter.x, mainCenter.y, mainR * 0.70, mainCenter.x, mainCenter.y, mainR * 1.15);
  beachGrad.addColorStop(0, '#ebd49c');
  beachGrad.addColorStop(0.7, '#f4dfa8');
  beachGrad.addColorStop(0.9, '#ddc287'); // wet sand
  beachGrad.addColorStop(1, '#c9ae72');

  ctx.fillStyle = beachGrad;
  ctx.beginPath();
  ctx.arc(mainCenter.x, mainCenter.y, mainR * 1.12, 0, Math.PI * 2);
  ctx.fill();

  // Draw Beach Sand Rim (Mini Island)
  const miniBeachGrad = ctx.createRadialGradient(miniCenter.x, miniCenter.y, miniR * 0.65, miniCenter.x, miniCenter.y, miniR * 1.18);
  miniBeachGrad.addColorStop(0, '#ebd49c');
  miniBeachGrad.addColorStop(0.75, '#f4dfa8');
  miniBeachGrad.addColorStop(0.92, '#ddc287');
  miniBeachGrad.addColorStop(1, '#c9ae72');

  ctx.fillStyle = miniBeachGrad;
  ctx.beginPath();
  ctx.arc(miniCenter.x, miniCenter.y, miniR * 1.15, 0, Math.PI * 2);
  ctx.fill();

  // Draw Lush Grass Layer (Main Island)
  const grassGrad = ctx.createRadialGradient(mainCenter.x, mainCenter.y, 0, mainCenter.x, mainCenter.y, mainR * 0.85);
  grassGrad.addColorStop(0, '#75ca56');
  grassGrad.addColorStop(0.5, '#68be4a');
  grassGrad.addColorStop(0.85, '#5bb03f');
  grassGrad.addColorStop(1.0, '#4ea035');

  ctx.fillStyle = grassGrad;
  ctx.beginPath();
  ctx.arc(mainCenter.x, mainCenter.y, mainR * 0.82, 0, Math.PI * 2);
  ctx.fill();

  // Draw Lush Grass Layer (Mini Island)
  const miniGrassGrad = ctx.createRadialGradient(miniCenter.x, miniCenter.y, 0, miniCenter.x, miniCenter.y, miniR * 0.80);
  miniGrassGrad.addColorStop(0, '#72c753');
  miniGrassGrad.addColorStop(0.7, '#63b746');
  miniGrassGrad.addColorStop(1.0, '#509f36');

  ctx.fillStyle = miniGrassGrad;
  ctx.beginPath();
  ctx.arc(miniCenter.x, miniCenter.y, miniR * 0.80, 0, Math.PI * 2);
  ctx.fill();

  // Add Clean, Soft Lawn Ambient Variations (No dots or noise)
  ctx.save();
  for (let i = 0; i < 120; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * (mainR * 0.78);
    const gx = mainCenter.x + Math.cos(ang) * dist;
    const gy = mainCenter.y + Math.sin(ang) * dist;
    const rad = (5 + Math.random() * 9) * scale;

    const hueChoice = Math.random();
    if (hueChoice < 0.5) {
      ctx.fillStyle = 'rgba(145, 228, 110, 0.12)'; // gentle warm sunny wash
    } else {
      ctx.fillStyle = 'rgba(75, 155, 55, 0.10)'; // gentle soft green depth
    }

    ctx.beginPath();
    ctx.ellipse(gx, gy, rad, rad * 0.75, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Tilled Soil Clearings (Lumber Camp, Cottage/Farm, Castle courtyard, Bandit Camp)
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

  drawSoilPatch(defaultLandmarks.lumberCamp.x, defaultLandmarks.lumberCamp.z, 6.8);
  drawSoilPatch(defaultLandmarks.cottage.x, defaultLandmarks.cottage.y || defaultLandmarks.cottage.z, 6.2, true);
  drawSoilPatch(defaultLandmarks.barracks.x - 2, defaultLandmarks.barracks.z - 2, 5.2);
  drawSoilPatch(-2, 16, 4.8, true); // extra farm / garden clearing
  drawSoilPatch(defaultLandmarks.banditCamp.x, defaultLandmarks.banditCamp.z, 7.5);

  // --- 2. ROUGHNESS CANVAS ---
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d');

  // Base grass roughness (~0.85 -> #d9d9d9)
  rCtx.fillStyle = '#d9d9d9';
  rCtx.fillRect(0, 0, width, height);

  // Sand beach roughness (~0.72 -> #b8b8b8)
  rCtx.fillStyle = '#b8b8b8';
  rCtx.beginPath();
  rCtx.arc(mainCenter.x, mainCenter.y, mainR * 1.12, 0, Math.PI * 2);
  rCtx.fill();

  // Wet sand near water (~0.45 -> #737373)
  rCtx.fillStyle = '#737373';
  rCtx.beginPath();
  rCtx.arc(mainCenter.x, mainCenter.y, mainR * 1.12, 0, Math.PI * 2);
  rCtx.fill();
  rCtx.fillStyle = '#d9d9d9';
  rCtx.beginPath();
  rCtx.arc(mainCenter.x, mainCenter.y, mainR * 0.82, 0, Math.PI * 2);
  rCtx.fill();

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

  textureCache.set('master_terrain', result);
  return result;
}
