import * as THREE from 'three';
import { createScaledCanvas, toTexture } from '../textureQuality.js';
import { splatWeights } from '../../data/tilesets.js';

/**
 * F7-04 · textura de terreno por splat map (grama, terra, areia, pedra, neve, lama) para os tilesets não-legados.
 * UMA textura (≤ 2048² lógicos; o preset `?texq=` reduz o canvas físico: low 256, med 512…) cobre o mapa inteiro e é
 * pintada pixel a pixel a partir de altura/declive/ruído (`splatWeights`, puro e testado) + máscaras opcionais do mapa
 * (`splatMasks`, bases em `startSlots`) + estradas (`roads`). Determinística (sem Math.random).
 */

const LOGICAL = 2048;
const GRID = 256; // amostras de altura por lado
const cache = new Map();

// ---- ruído de valor determinístico -------------------------------------------------------------
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function pal(def, key, tone = 0.5) {
  const p = def.palette[key];
  return Array.isArray(p) ? mix3(rgb(p[1]), rgb(p[0]), tone) : rgb(p);
}

/**
 * Estradas/trilhas: `roads = [{ points: [[x, z], ...], width?: 2.2 }]` (coordenadas de mundo). Desenha no contexto lógico 2048².
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} roads
 * @param {number} size  lado do mundo
 * @param {number} hex   cor base da estrada
 */
export function paintRoads(ctx, roads, size, hex) {
  if (!roads || !roads.length) return;
  const k = LOGICAL / size;
  const [r, g, b] = rgb(hex);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const road of roads) {
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const w = (road.width ?? 2.2) * k;
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = (p[0] + size / 2) * k, y = (p[1] + size / 2) * k;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    };
    // borda suave escura, miolo claro e sulcos de roda
    trace(); ctx.strokeStyle = `rgba(${r * 0.6 | 0}, ${g * 0.6 | 0}, ${b * 0.6 | 0}, 0.35)`; ctx.lineWidth = w * 1.35; ctx.stroke();
    trace(); ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.92)`; ctx.lineWidth = w; ctx.stroke();
    trace(); ctx.strokeStyle = `rgba(${r * 0.72 | 0}, ${g * 0.72 | 0}, ${b * 0.72 | 0}, 0.30)`; ctx.lineWidth = w * 0.12;
    ctx.save(); ctx.translate(-w * 0.2, 0); ctx.stroke(); ctx.translate(w * 0.4, 0); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

/**
 * Copia a textura legada (cacheada, compartilhada) e pinta estradas por cima. Devolve `{ map, roughnessMap, bumpMap }` novo.
 */
export function withRoads(baseTex, roads, size, roadHex) {
  const src = baseTex.map && baseTex.map.image;
  if (typeof document === 'undefined' || !src || !roads || !roads.length) return baseTex;
  const { canvas, ctx } = createScaledCanvas(LOGICAL, LOGICAL, { sideMultiplier: 2, minSide: 1024, maxSide: 2048 });
  ctx.drawImage(src, 0, 0);
  paintRoads(ctx, roads, size, roadHex);
  return { map: toTexture(canvas, true, { wrapS: THREE.ClampToEdgeWrapping }), roughnessMap: baseTex.roughnessMap, bumpMap: baseTex.bumpMap };
}

/**
 * @param {object} cfg
 * @param {object} cfg.def         tileset (`src/data/tilesets.js`)
 * @param {string} cfg.id          id do mapa (cache)
 * @param {number} cfg.size
 * @param {(x:number,z:number)=>number} cfg.getHeight
 * @param {number} cfg.waterLevel
 * @param {Array}  [cfg.startSlots]  manchas de terra batida sob as bases
 * @param {Array}  [cfg.roads]
 * @param {Array}  [cfg.masks]       `splatMasks`: `{ layer: 'dirt'|'sand'|'rock'|'snow'|'mud'|'grass'|'road', x, z, r, strength? }`
 * @returns {{map: THREE.Texture|null, roughnessMap: null, bumpMap: null}}
 */
export function getTilesetTerrainTexture({ def, id, size, getHeight, waterLevel, startSlots = [], roads = [], masks = [] }) {
  const key = `tileset_${def.id}_${id}_${size}`;
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return { map: null, roughnessMap: null, bumpMap: null };

  const { canvas, ctx } = createScaledCanvas(LOGICAL, LOGICAL, { sideMultiplier: 2, minSide: 1024, maxSide: 2048 });
  const pw = canvas.width, ph = canvas.height;

  // alturas e declives em grade
  const G1 = GRID + 1;
  const hs = new Float32Array(G1 * G1);
  const cell = size / GRID;
  for (let j = 0; j < G1; j++) for (let i = 0; i < G1; i++) hs[j * G1 + i] = getHeight(-size / 2 + i * cell, -size / 2 + j * cell);
  const slopes = new Float32Array(G1 * G1);
  for (let j = 0; j < G1; j++) {
    for (let i = 0; i < G1; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(GRID, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(GRID, j + 1);
      const dx = (hs[j * G1 + i1] - hs[j * G1 + i0]) / ((i1 - i0) * cell);
      const dz = (hs[j1 * G1 + i] - hs[j0 * G1 + i]) / ((j1 - j0) * cell);
      slopes[j * G1 + i] = Math.hypot(dx, dz);
    }
  }
  const sample = (arr, gx, gz) => {
    const x0 = Math.min(GRID - 1, Math.floor(gx)), z0 = Math.min(GRID - 1, Math.floor(gz));
    const fx = gx - x0, fz = gz - z0;
    const a = arr[z0 * G1 + x0], b = arr[z0 * G1 + x0 + 1], c = arr[(z0 + 1) * G1 + x0], d = arr[(z0 + 1) * G1 + x0 + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };

  const rules = def.rules;
  const C = {
    seabed: mix3(pal(def, rules.shore, 0.5), [0, 0, 0], 0.25),
    shore: pal(def, rules.shore), patch: pal(def, rules.patch), high: pal(def, rules.high)
  };
  const rockA = rgb(def.palette.rock);
  const maskList = [
    ...startSlots.map((s) => ({ layer: 'dirt', x: s.x, z: s.z, r: 6, strength: 0.85 })),
    ...masks
  ].filter((m) => def.palette[m.layer] !== undefined);

  const img = ctx.createImageData(pw, ph);
  const data = img.data;
  const crack = rules.crack || 0;
  for (let py = 0; py < ph; py++) {
    const z = -size / 2 + ((py + 0.5) / ph) * size;
    const gz = ((py + 0.5) / ph) * GRID;
    for (let px = 0; px < pw; px++) {
      const x = -size / 2 + ((px + 0.5) / pw) * size;
      const gx = ((px + 0.5) / pw) * GRID;
      const h = sample(hs, gx, gz);
      const slope = sample(slopes, gx, gz);
      const nBig = vnoise(x * 0.07, z * 0.07) * 0.65 + vnoise(x * 0.17 + 40, z * 0.17 + 40) * 0.35;
      const nMid = vnoise(x * 0.45 + 11, z * 0.45 + 7);
      const grain = vnoise(x * 2.4, z * 2.4);
      const w = splatWeights(rules, h, slope, nBig, waterLevel);

      const base = mix3(pal(def, 'grass', 0), pal(def, 'grass', 1), nMid);
      let c = base;
      let cr = 0;
      if (crack > 0) {
        const rdg = Math.abs(vnoise(x * 0.33, z * 0.33) - 0.5) + Math.abs(vnoise(x * 0.9 + 5, z * 0.9 + 9) - 0.5) * 0.35;
        cr = rdg < 0.03 ? (1 - rdg / 0.03) * crack : 0;
      }
      const rock = mix3(mix3(rockA, [0, 0, 0], 0.18), mix3(rockA, [255, 255, 255], 0.12), nMid);
      const rc = (a, b, t) => mix3(a, b, t);
      c = rc(c, C.patch, w.patch);
      c = rc(c, C.high, w.high);
      c = rc(c, C.shore, w.shore);
      c = rc(c, rock, w.rock);
      c = rc(c, C.seabed, w.seabed);
      // rachaduras só em terra seca (não na rocha/mar)
      if (cr > 0) c = mix3(c, [20, 14, 10], cr * 0.55 * (1 - w.rock) * (1 - w.seabed));

      for (let m = 0; m < maskList.length; m++) {
        const mk = maskList[m];
        const d = Math.hypot(x - mk.x, z - mk.z);
        if (d < mk.r) {
          const t = (1 - d / mk.r) * 1.6;
          const mm = Math.min(1, t) * (mk.strength ?? 1) * (0.75 + 0.25 * nMid);
          c = mix3(c, pal(def, mk.layer, nMid), mm);
        }
      }

      const g = 0.94 + grain * 0.12;
      const o = (py * pw + px) * 4;
      data[o] = Math.min(255, c[0] * g);
      data[o + 1] = Math.min(255, c[1] * g);
      data[o + 2] = Math.min(255, c[2] * g);
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  paintRoads(ctx, roads, size, def.palette.road);

  const result = { map: toTexture(canvas, true, { wrapS: THREE.ClampToEdgeWrapping }), roughnessMap: null, bumpMap: null };
  cache.set(key, result);
  return result;
}
