/**
 * src/data/maps/coast/noise.js (MUNDO-TERRENO-MAPAS §2.2 · MUNDO-1)
 *
 * Ruído de valor determinístico (hash inteiro, sem `Math.random`): `valueNoise` (2D, interpolação quíntica) e `fbm`
 * (soma de oitavas). Só funções puras, sem DOM nem three.js. O resultado depende apenas das entradas (x, y, seed).
 */

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Ruído de valor 2D em [0, 1). */
export function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Movimento browniano fracionário (`octaves` oitavas de `valueNoise`), normalizado para [0, 1). */
export function fbm(x, y, seed, octaves = 4, gain = 0.5, lac = 2.03) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f + o * 31.7, y * f - o * 17.3, seed + o * 101);
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
