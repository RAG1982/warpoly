/**
 * src/data/maps/painted.js (F8-03 · terreno pintado pelo editor de mapas)
 *
 * Gerador de altura `"painted"`: grade regular de alturas quantizadas em décimos (Int8) guardada em base64 no próprio
 * JSON do mapa — é o único formato que o editor consegue escrever sem perder informação (pincéis de altura/água/vau).
 *
 *   "terrain": { "generator": "painted", "params": { "cell": 2, "nodes": 81, "data": "<base64 de Int8[nodes*nodes]>" } }
 *
 * - Os nós ficam em x = -size/2 + i*cell (i = 0..nodes-1), `nodes = size/cell + 1`; linha = z, coluna = x (z-major).
 * - `data[k] / 10` é a altura do nó (faixa -12,8..12,7). A altura entre nós é interpolada bilinearmente (fora da grade: bordas).
 * - Puro e determinístico (sem DOM, sem RNG). Registrado em `TERRAIN_GENERATORS` (`src/sim/terrainGenerators.js`).
 */

export const PAINTED_SCALE = 10; // passos Int8 por unidade de mundo (décimos)
export const PAINTED_MIN = -12.8;
export const PAINTED_MAX = 12.7;

/** Número de nós por lado para `size` e `cell`. */
export function paintedNodes(size, cell) {
  return Math.round(size / cell) + 1;
}

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x2000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** `Int8Array` de décimos → base64. */
export function encodeHeights(h10) {
  return bytesToBase64(new Uint8Array(h10.buffer, h10.byteOffset, h10.length));
}

/** base64 → `Int8Array` de décimos. */
export function decodeHeights(b64) {
  const u8 = base64ToBytes(b64);
  return new Int8Array(u8.buffer, u8.byteOffset, u8.length);
}

/** Converte uma altura em unidades de mundo para o passo Int8 (saturando). */
export function toH10(height) {
  return Math.max(-128, Math.min(127, Math.round(height * PAINTED_SCALE)));
}

const cache = new WeakMap();
function gridOf(params) {
  let g = cache.get(params);
  if (!g) {
    g = decodeHeights(params.data);
    cache.set(params, g);
  }
  return g;
}

/** Altura (bilinear) de um mapa "painted" em (x, z). */
export function paintedHeight(mapDef, x, z) {
  const p = mapDef.terrain.params;
  const nodes = p.nodes;
  const grid = gridOf(p);
  const half = mapDef.size / 2;
  const fx = Math.max(0, Math.min(nodes - 1, (x + half) / p.cell));
  const fz = Math.max(0, Math.min(nodes - 1, (z + half) / p.cell));
  const i0 = Math.min(nodes - 2, Math.floor(fx));
  const j0 = Math.min(nodes - 2, Math.floor(fz));
  const tx = fx - i0;
  const tz = fz - j0;
  const a = grid[j0 * nodes + i0];
  const b = grid[j0 * nodes + i0 + 1];
  const c = grid[(j0 + 1) * nodes + i0];
  const d = grid[(j0 + 1) * nodes + i0 + 1];
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return (top + (bot - top) * tz) / PAINTED_SCALE;
}
