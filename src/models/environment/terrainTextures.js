import * as THREE from 'three';
import { createScaledCanvas, toTexture } from '../textureQuality.js';

// O terreno é uma única textura que cobre o mapa inteiro: resolução maior que a
// dos modelos (2× o lado do preset, mínimo 1024, máximo 2048).
const TERRAIN_CANVAS_OPTIONS = { sideMultiplier: 2, minSide: 1024, maxSide: 2048 };

const textureCache = new Map();

/**
 * Função pura que retorna a cor (hex) baseada na faixa de altura.
 * @param {number} h - altura do terreno
 * @param {number} waterLevel - nível da água
 * @param {number} x - coordenada x (para ruído determinístico na grama)
 * @param {number} z - coordenada z (para ruído determinístico na grama)
 * @returns {string} cor em hex (#rrggbb)
 */
export function terrainBandColor(h, waterLevel, x, z) {
  if (h < waterLevel - 0.3) {
    // Fundo marinho
    return '#c9b27a';
  } else if (h < 1.4) {
    // Areia
    return '#e4ce95';
  } else if (h < 3.2) {
    // Grama com variação determinística
    const noise = (Math.sin(x * 0.37) + Math.cos(z * 0.29)) * 0.5;
    const t = 0.5 + noise * 0.5; // interpola entre 0 e 1
    const color1 = [0x66, 0x87, 0x3c]; // #66873c
    const color2 = [0x78, 0xd4, 0x58]; // #78d458
    const r = Math.round(color1[0] + (color2[0] - color1[0]) * t);
    const g = Math.round(color1[1] + (color2[1] - color1[1]) * t);
    const b = Math.round(color1[2] + (color2[2] - color1[2]) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } else {
    // Rocha/relva alta
    return '#8a8f6a';
  }
}

/**
 * Gera textura de terreno pintada pela altura do mapa (para geradores não-continentais).
 * @param {Object} config - configuração
 * @param {string} config.id - ID do mapa (para cache)
 * @param {number} config.size - tamanho do mapa
 * @param {Function} config.getHeight - função que retorna altura em (x, z)
 * @param {number} config.waterLevel - nível da água
 * @param {Array} config.startSlots - posições das bases (para manchas de solo)
 * @returns {Object} { map, roughnessMap, bumpMap }
 */
export function getTerrainTexturesFromHeight({ id, size, getHeight, waterLevel, startSlots = [] }) {
  const cacheKey = `terrain_h_${id}_${size}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const width = 2048;
  const height = 2048;

  // --- 1. ALBEDO CANVAS ---
  const { canvas: albedoCanvas, ctx } = createScaledCanvas(width, height, TERRAIN_CANVAS_OPTIONS);

  // Grade de 256×256: amostrar altura e pintar
  const gridSize = 256;
  const cellWidth = width / gridSize;
  const cellHeight = height / gridSize;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Coordenada do mundo no centro da célula
      const x = -size / 2 + (col + 0.5) * (size / gridSize);
      const z = -size / 2 + (row + 0.5) * (size / gridSize);
      const h = getHeight(x, z);

      const color = terrainBandColor(h, waterLevel, x, z);
      ctx.fillStyle = color;
      ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
    }
  }

  // Blur leve para suavizar os degraus (6px)
  // Apenas em ambiente de navegador (document.createElement disponível)
  if (typeof document !== 'undefined') {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.filter = 'blur(6px)';
    tempCtx.drawImage(albedoCanvas, 0, 0);

    ctx.filter = 'blur(6px)';
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.filter = 'none';
  }

  // Manchas de solo em cada startSlot
  function drawSoilPatch(wx, wz, wr, isAgriculture = false) {
    const scale = width / size;
    const c = {
      x: (wx + size / 2) * scale,
      y: (wz + size / 2) * scale
    };
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

    // Furrows
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

  // Manchas em cada startSlot
  startSlots.forEach((slot, i) => {
    drawSoilPatch(slot.x, slot.z, 6.0, i % 2 === 1);
  });

  // --- 2. ROUGHNESS CANVAS ---
  const { canvas: roughCanvas, ctx: rCtx } = createScaledCanvas(width, height, TERRAIN_CANVAS_OPTIONS);

  // Preencher por faixa de altura
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = -size / 2 + (col + 0.5) * (size / gridSize);
      const z = -size / 2 + (row + 0.5) * (size / gridSize);
      const h = getHeight(x, z);

      let roughness;
      if (h < waterLevel - 0.3) {
        // Fundo marinho: 0.9 -> #e6e6e6
        roughness = '#e6e6e6';
      } else if (h < 1.4) {
        // Areia: 0.9 -> #e6e6e6
        roughness = '#e6e6e6';
      } else if (h < 3.2) {
        // Grama: 0.8 -> #cccccc
        roughness = '#cccccc';
      } else {
        // Rocha: 0.7 -> #b3b3b3
        roughness = '#b3b3b3';
      }

      rCtx.fillStyle = roughness;
      rCtx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
    }
  }

  // Converter para texturas Three.js
  const mapTex = toTexture(albedoCanvas, true, { wrapS: THREE.ClampToEdgeWrapping });
  const roughTex = toTexture(roughCanvas, false, { wrapS: THREE.ClampToEdgeWrapping });

  const result = {
    map: mapTex,
    roughnessMap: roughTex,
    bumpMap: null
  };

  textureCache.set(cacheKey, result);
  return result;
}

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
  const { canvas: albedoCanvas, ctx } = createScaledCanvas(width, height, TERRAIN_CANVAS_OPTIONS);

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
  const { canvas: roughCanvas, ctx: rCtx } = createScaledCanvas(width, height, TERRAIN_CANVAS_OPTIONS);

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

  // --- 3. BUMP ---
  // O bump antigo era um canvas 2048² uniforme (#808080): gradiente zero, ou seja,
  // nenhum efeito no sombreamento. Removido em todas as qualidades (−21 MB de VRAM).

  // Convert canvases to Three.js textures
  const mapTex = toTexture(albedoCanvas, true, { wrapS: THREE.ClampToEdgeWrapping });
  const roughTex = toTexture(roughCanvas, false, { wrapS: THREE.ClampToEdgeWrapping });

  const result = {
    map: mapTex,
    roughnessMap: roughTex,
    bumpMap: null
  };

  textureCache.set(cacheKey, result);
  return result;
}
