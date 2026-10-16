import * as THREE from 'three';
import { smoothstep } from '../../data/tilesets.js';
import { LAVA_STYLE } from '../../data/lavaRender.js';
import { hash2, rgb, mix3 } from './splatPaint.js';
import { getTextureQuality } from '../textureQuality.js';

/**
 * Texturas procedurais da lava (MUNDO-5 · §3.5): duas camadas TILEÁVEIS de 256² (128² em `?texq=low`) que `world/Lava.js` rola em
 * sentidos opostos (fluxo):
 * - `emissive`: rede de rachaduras incandescentes (célula de Worley: laranja `ff5a1a`, núcleo `ffb347` nos cruzamentos) sobre
 *   placas de crosta que ainda brilham de leve (`8a1c0a`), mais uma variação lenta de calor;
 * - `albedo`: crosta de basalto `2b2528` com mosqueado e as rachaduras avermelhadas.
 * Os pixels vêm de `generateLavaPixels` (pura, determinística, sem DOM: testada em Node); as texturas são `DataTexture` (sem canvas).
 */

// ---- ruído tileável (período inteiro: a borda esquerda continua na direita) ------------------------
function tnoise(u, v, P, seed) {
  const x = u * P, y = v * P;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash2((((a % P) + P) % P) + seed * 101, (((b % P) + P) % P) + seed * 57);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Distâncias F1/F2 (em células) ao ponto-semente mais próximo/segundo mais próximo, com `G` células por lado e semente repetida (tileável). */
function worley(u, v, G, seed, out) {
  const x = u * G, y = v * G;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy;
      const wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G;
      const px = cx + 0.12 + 0.76 * hash2(wx + seed * 17, wy + seed * 31);
      const py = cy + 0.12 + 0.76 * hash2(wy + seed * 13 + 99, wx + seed * 7);
      const d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  out[0] = f1;
  out[1] = f2;
  return out;
}

const PLATE_GLOW = rgb(0x8a1c0a);
const CRACK_MID = rgb(LAVA_STYLE.mid);
const CRACK_CORE = rgb(LAVA_STYLE.core);
const CRUST = rgb(LAVA_STYLE.crust);

/**
 * Pixels RGBA (`size × size`) das camadas de fluxo da lava. Tileável e determinística.
 * @param {number} [size=256]
 * @returns {{ size: number, emissive: Uint8ClampedArray, albedo: Uint8ClampedArray }}
 */
export function generateLavaPixels(size = 256) {
  const emissive = new Uint8ClampedArray(size * size * 4);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const f = [0, 0];
  const g = [0, 0];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // placas de crosta (Worley com a fronteira deformada) e rachaduras finas por cima
      const wu = u + 0.05 * (tnoise(u, v, 4, 1) - 0.5) * 2;
      const wv = v + 0.05 * (tnoise(u, v, 4, 2) - 0.5) * 2;
      worley(wu, wv, 7, 3, f);
      worley(u + 0.31, v + 0.17, 13, 11, g);
      const crack = 1 - smoothstep(0, 0.22, f[1] - f[0]);
      const fine = 1 - smoothstep(0, 0.12, g[1] - g[0]);
      const heat = tnoise(u, v, 3, 5) * 0.6 + tnoise(u, v, 6, 8) * 0.4;
      const c = Math.min(1, crack * (0.55 + 0.45 * heat) + fine * 0.35);

      // emissivo: placas brilham de leve; rachaduras vão de laranja ao núcleo claro
      const plate = mix3(PLATE_GLOW, CRACK_MID, 0.12 + 0.22 * heat);
      const col = c < 0.5 ? mix3(plate, CRACK_MID, c * 2) : mix3(CRACK_MID, CRACK_CORE, (c - 0.5) * 2);
      const dim = 0.28 + 0.72 * smoothstep(0, 0.5, c); // placas escuras, rachaduras plenas
      const o = (y * size + x) * 4;
      emissive[o] = col[0] * dim;
      emissive[o + 1] = col[1] * dim;
      emissive[o + 2] = col[2] * dim;
      emissive[o + 3] = 255;

      // albedo: basalto mosqueado, avermelhado perto das rachaduras
      const mott = 0.78 + 0.5 * tnoise(u, v, 8, 4);
      const a = mix3([CRUST[0] * mott, CRUST[1] * mott, CRUST[2] * mott], [138, 28, 10], Math.min(1, c * 0.7));
      albedo[o] = a[0];
      albedo[o + 1] = a[1];
      albedo[o + 2] = a[2];
      albedo[o + 3] = 255;
    }
  }
  return { size, emissive, albedo };
}

const cache = new Map();

function makeTexture(pixels, size) {
  // DataTexture UnsignedByte pede Uint8Array (a geração usa Uint8ClampedArray só pelo arredondamento/saturação)
  const tex = new THREE.DataTexture(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length), size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Texturas de fluxo da lava. Os pixels são gerados uma vez (cache por tamanho); cada chamada devolve CÓPIAS das texturas (mesma imagem,
 * mesma textura na GPU), então cada malha de lava tem o próprio `repeat`/`offset` (o fluxo) e as descarta com `dispose()`.
 * @returns {{ emissiveMap: THREE.DataTexture, map: THREE.DataTexture, size: number }}
 */
export function getLavaTextures() {
  const size = getTextureQuality() === 'low' ? 128 : 256;
  let base = cache.get(size);
  if (!base) {
    const px = generateLavaPixels(size);
    base = { emissiveMap: makeTexture(px.emissive, size), map: makeTexture(px.albedo, size), size };
    cache.set(size, base);
  }
  const emissiveMap = base.emissiveMap.clone();
  const map = base.map.clone();
  emissiveMap.needsUpdate = true;
  map.needsUpdate = true;
  return { emissiveMap, map, size };
}
