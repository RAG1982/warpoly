/**
 * src/data/maps/lava.js (MUNDO-TERRENO-MAPAS §3.5)
 *
 * Suporte a grade de lava (`lavaGrid`) em mapas:
 *   "lavaGrid": { "cell": 1, "nodes": N, "data": "<base64 de Uint8[nodes*nodes]>" }
 *
 * - 1 = lava, 0 = sem lava.
 * - A lava bloqueia movimento para unidades terrestres e navais (igual à água), mas aéreas atravessam.
 * - Não causa dano (decisão do dono em 2026-10-11).
 * - Não é água navegável: navios, estaleiros e plataformas não podem ser colocados nela.
 */
import { bytesToBase64, base64ToBytes, paintedNodes } from './painted.js';

export { paintedNodes };

export function encodeLavaGrid(u8) {
  return bytesToBase64(u8);
}

export function decodeLavaGrid(b64) {
  return base64ToBytes(b64);
}

const cache = new WeakMap();

export function gridOfLava(params) {
  let g = cache.get(params);
  if (!g) {
    g = decodeLavaGrid(params.data);
    cache.set(params, g);
  }
  return g;
}

/**
 * Verifica se (x, z) é lava segundo mapDef.lavaGrid.
 * @param {object} mapDef
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function isLavaAt(mapDef, x, z) {
  const p = mapDef?.lavaGrid;
  if (!p || !p.data) return false;
  const nodes = p.nodes;
  const cell = p.cell || 1;
  const grid = gridOfLava(p);
  const half = (mapDef.size || 192) / 2;
  const fx = (x + half) / cell;
  const fz = (z + half) / cell;
  if (fx < 0 || fz < 0 || fx >= nodes || fz >= nodes) return false;
  const c = Math.min(nodes - 1, Math.max(0, Math.round(fx)));
  const r = Math.min(nodes - 1, Math.max(0, Math.round(fz)));
  return grid[r * nodes + c] === 1;
}
