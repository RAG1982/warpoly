/**
 * src/data/maps/biome.js (MUNDO-TERRENO-MAPAS §3.1, §3.3 e §7 Passo 4)
 *
 * Suporte a grade de biomas (`biomeGrid`) em mapas:
 *   "biomeGrid": { "cell": 1, "nodes": N, "data": "<base64 de Uint8[nodes*nodes]>" }
 *   ou com codificação RLE:
 *   "biomeGrid": { "cell": 1, "nodes": N, "encoding": "rle", "data": [[count, biomeId], ...] }
 *
 * Ids canônicos de célula (BIOME):
 *   0: mar, 1: areia, 2: grama, 3: savana, 4: deserto, 5: estepe,
 *   6: rocha, 7: vulcânico, 8: lava, 9: neve, 10: pântano, 11: gelo, 12: floresta
 */
import { bytesToBase64, base64ToBytes, paintedNodes } from './painted.js';

export { paintedNodes };

export const BIOME = Object.freeze({
  SEA: 0,
  SAND: 1,
  GRASS: 2,
  SAVANNA: 3,
  DESERT: 4,
  STEPPE: 5,
  ROCK: 6,
  VOLCANIC: 7,
  LAVA: 8,
  SNOW: 9,
  SWAMP: 10,
  ICE: 11,
  FOREST: 12
});

export const BIOME_IDS = BIOME;

export const BIOME_NAMES = Object.freeze([
  'mar',
  'areia',
  'grama',
  'savana',
  'deserto',
  'estepe',
  'rocha',
  'vulcânico',
  'lava',
  'neve',
  'pântano',
  'gelo',
  'floresta'
]);

export const BIOME_KEYS = Object.freeze([
  'sea',
  'sand',
  'grass',
  'savanna',
  'desert',
  'steppe',
  'rock',
  'volcanic',
  'lava',
  'snow',
  'swamp',
  'ice',
  'forest'
]);

export const MIN_BIOME_ID = 0;
export const MAX_BIOME_ID = 12;

/** Uint8Array -> base64 */
export function encodeBiomeGrid(u8) {
  return bytesToBase64(u8);
}

/**
 * Codifica Uint8Array em formato Run-Length Encoding (RLE).
 * @param {Uint8Array} u8
 * @param {{flat?: boolean}} [opts] `flat: true` produz `[count1, val1, count2, val2, ...]`
 * @returns {Array<[number, number]>|number[]}
 */
export function encodeRleBiomeGrid(u8, { flat = false } = {}) {
  if (!u8 || u8.length === 0) return [];
  const runs = [];
  let curVal = u8[0];
  let curCount = 1;
  for (let i = 1; i < u8.length; i++) {
    if (u8[i] === curVal) {
      curCount++;
    } else {
      if (flat) runs.push(curCount, curVal);
      else runs.push([curCount, curVal]);
      curVal = u8[i];
      curCount = 1;
    }
  }
  if (flat) runs.push(curCount, curVal);
  else runs.push([curCount, curVal]);
  return runs;
}

/**
 * Decodifica qualquer representação válida de biomeGrid para Uint8Array.
 * Suporta:
 * - base64 string
 * - Uint8Array ou Array numérico plano
 * - RLE em array de pares `[[count, val], ...]`
 * - RLE em array plano `[count, val, count, val, ...]`
 * - objeto com campo `data`, `runs` ou `rle`
 * @param {string|Uint8Array|number[]|object} bg
 * @returns {Uint8Array|null}
 */
export function decodeBiomeGrid(bg) {
  if (!bg) return null;
  if (typeof bg === 'string') {
    return base64ToBytes(bg);
  }
  if (bg instanceof Uint8Array) {
    return bg;
  }
  if (Array.isArray(bg)) {
    return _decodeRleOrFlatArray(bg);
  }
  if (typeof bg === 'object') {
    if (bg.encoding === 'rle' || bg.rle || Array.isArray(bg.runs)) {
      const runs = bg.runs || bg.rle || bg.data;
      if (Array.isArray(runs)) return decodeRleBiomeGrid(runs);
    }
    if (bg.data) {
      if (typeof bg.data === 'string') return base64ToBytes(bg.data);
      if (bg.data instanceof Uint8Array) return bg.data;
      if (Array.isArray(bg.data)) return _decodeRleOrFlatArray(bg.data);
    }
  }
  return null;
}

function _decodeRleOrFlatArray(arr) {
  if (!arr || arr.length === 0) return new Uint8Array(0);
  // Se for array de pares [count, val]
  if (Array.isArray(arr[0])) {
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i][0];
      if (typeof c !== 'number' || c <= 0) return null;
      total += c;
    }
    const out = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < arr.length; i++) {
      const [count, val] = arr[i];
      out.fill(val, pos, pos + count);
      pos += count;
    }
    return out;
  }
  // Se for array plano de números
  return new Uint8Array(arr);
}

/**
 * Decodifica especificamente um array RLE (seja em pares ou plano [count, val]).
 * @param {Array} runs
 * @returns {Uint8Array|null}
 */
export function decodeRleBiomeGrid(runs) {
  if (!Array.isArray(runs)) return null;
  if (runs.length === 0) return new Uint8Array(0);
  if (Array.isArray(runs[0])) {
    return _decodeRleOrFlatArray(runs);
  }
  if (runs.length % 2 !== 0) return null;
  let total = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const c = runs[i];
    if (typeof c !== 'number' || c <= 0) return null;
    total += c;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const count = runs[i];
    const val = runs[i + 1];
    out.fill(val, pos, pos + count);
    pos += count;
  }
  return out;
}

const cache = new WeakMap();

export function gridOfBiome(bg) {
  let g = cache.get(bg);
  if (!g) {
    g = decodeBiomeGrid(bg);
    if (g) cache.set(bg, g);
  }
  return g;
}

/**
 * Obtém o ID do bioma em (x, z) segundo mapDef.biomeGrid.
 * Retorna null se não houver biomeGrid ou se (x, z) estiver fora da grade.
 * @param {object} mapDef
 * @param {number} x
 * @param {number} z
 * @returns {number|null}
 */
export function getBiomeAt(mapDef, x, z) {
  const bg = mapDef?.biomeGrid;
  if (!bg) return null;
  const nodes = bg.nodes;
  const cell = bg.cell || 1;
  const grid = gridOfBiome(bg);
  if (!grid) return null;
  const half = (mapDef.size || 192) / 2;
  const fx = (x + half) / cell;
  const fz = (z + half) / cell;
  if (fx < 0 || fz < 0 || fx >= nodes || fz >= nodes) return null;
  const c = Math.min(nodes - 1, Math.max(0, Math.round(fx)));
  const r = Math.min(nodes - 1, Math.max(0, Math.round(fz)));
  return grid[r * nodes + c];
}

/**
 * Validador direto de uma definição de biomeGrid.
 * @param {object} bg
 * @param {number} mapSize
 * @returns {{ok: boolean, error?: string}}
 */
export function validateBiomeGrid(bg, mapSize) {
  if (!bg || typeof bg !== 'object') return { ok: false, error: 'biomeGridMissing' };
  const cell = bg.cell || 1;
  if (typeof cell !== 'number' || cell <= 0) return { ok: false, error: 'invalidCell' };
  const expectedNodes = paintedNodes(mapSize, cell);
  if (bg.nodes !== expectedNodes) return { ok: false, error: 'nodesMismatch' };
  const decoded = decodeBiomeGrid(bg);
  if (!decoded || decoded.length !== expectedNodes * expectedNodes) return { ok: false, error: 'lengthMismatch' };
  for (let i = 0; i < decoded.length; i++) {
    const v = decoded[i];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < MIN_BIOME_ID || v > MAX_BIOME_ID) {
      return { ok: false, error: 'invalidBiomeId' };
    }
  }
  return { ok: true };
}
