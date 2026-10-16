import { splatWeights, smoothstep } from '../../data/tilesets.js';
import { LAVA_STYLE, LAVA_EMBER } from '../../data/lavaRender.js';

/**
 * Pintura PURA (sem three/DOM) do splat map do terreno: grama, terra, areia, pedra, neve e lama por altura, declive e ruído
 * (`splatWeights`) + máscaras do mapa. Foi extraída de `tilesetTextures.js` (F7-04) para ser testável em Node e para receber o
 * render regional (MUNDO-5). Determinística (sem Math.random).
 *
 * Dois caminhos, escolhidos por `regions`:
 * - `regions == null` (mapa sem `biomeGrid`): EXATAMENTE a conta da F7-04 (mesmas operações, mesma ordem ⇒ os mesmos bytes;
 *   `tests/unit/splatPaint.test.js` guarda hashes do resultado antigo). A base é sempre `palette.grass` (como sempre foi).
 * - `regions` (MUNDO-5): cada pixel mistura os estilos (tilesets/variantes) das regiões de bioma ao redor, com a fronteira
 *   deslocada por ruído; a base de cada estilo honra `rules.base` (areia no deserto, rocha na ilha pedregosa). Células de lava
 *   ganham borda incandescente no terreno vizinho (`lava`, vale também sem `regions`: um mapa só com `lavaGrid`).
 */

export const LOGICAL = 2048;
export const GRID = 256; // amostras de altura por lado

// ---- ruído de valor determinístico -------------------------------------------------------------
export function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Cor da paleta (`palette[key]`): com 2 tons = mistura claro/escuro por `tone`. */
export function pal(def, key, tone = 0.5) {
  const p = def.palette[key];
  return Array.isArray(p) ? mix3(rgb(p[1]), rgb(p[0]), tone) : rgb(p);
}

/** Deslocamento máximo (u) da fronteira entre regiões (ruído de domínio, §3.3). */
const BORDER_WARP = 2.2;

/**
 * Dados de um estilo que não mudam durante a pintura (o que a F7-04 calculava uma vez antes do laço de pixels).
 * `honorBase`: usa `rules.base` como cor de fundo (caminho regional); falso = sempre `palette.grass` (caminho antigo).
 */
function prepStyle(def, startSlots, masks, honorBase) {
  const rules = def.rules;
  const rockA = rgb(def.palette.rock);
  let baseKey = 'grass';
  if (honorBase && rules.base && rules.base !== 'grass' && def.palette[rules.base] !== undefined) baseKey = rules.base;
  const bp = def.palette[baseKey];
  let grass0, grass1;
  if (baseKey !== 'grass' && !Array.isArray(bp)) {
    // cor única (areia, rocha…): variação sutil de claro/escuro para não ficar chapada
    grass0 = mix3(rgb(bp), [0, 0, 0], 0.08);
    grass1 = mix3(rgb(bp), [255, 255, 255], 0.05);
  } else {
    grass0 = pal(def, baseKey, 0);
    grass1 = pal(def, baseKey, 1);
  }
  return {
    def,
    rules,
    grass0,
    grass1,
    C: {
      seabed: mix3(pal(def, rules.shore, 0.5), [0, 0, 0], 0.25),
      shore: pal(def, rules.shore),
      patch: pal(def, rules.patch),
      high: pal(def, rules.high)
    },
    rockDark: mix3(rockA, [0, 0, 0], 0.18),
    rockLight: mix3(rockA, [255, 255, 255], 0.12),
    crack: rules.crack || 0,
    maskList: [
      ...startSlots.map((s) => ({ layer: 'dirt', x: s.x, z: s.z, r: 6, strength: 0.85 })),
      ...masks
    ].filter((m) => def.palette[m.layer] !== undefined)
  };
}

/**
 * Cor (RGB 0..255, antes do grão) de UM estilo num ponto. Mesma conta, na mesma ordem, do laço de pixels da F7-04.
 * @returns {number[]}
 */
function styleColor(P, x, z, h, slope, nBig, nMid, waterLevel) {
  const w = splatWeights(P.rules, h, slope, nBig, waterLevel);
  const base = mix3(P.grass0, P.grass1, nMid);
  let c = base;
  let cr = 0;
  if (P.crack > 0) {
    const rdg = Math.abs(vnoise(x * 0.33, z * 0.33) - 0.5) + Math.abs(vnoise(x * 0.9 + 5, z * 0.9 + 9) - 0.5) * 0.35;
    cr = rdg < 0.03 ? (1 - rdg / 0.03) * P.crack : 0;
  }
  const rock = mix3(P.rockDark, P.rockLight, nMid);
  const rc = (a, b, t) => mix3(a, b, t);
  c = rc(c, P.C.patch, w.patch);
  c = rc(c, P.C.high, w.high);
  c = rc(c, P.C.shore, w.shore);
  c = rc(c, rock, w.rock);
  c = rc(c, P.C.seabed, w.seabed);
  // rachaduras só em terra seca (não na rocha/mar)
  if (cr > 0) c = mix3(c, [20, 14, 10], cr * 0.55 * (1 - w.rock) * (1 - w.seabed));

  for (let m = 0; m < P.maskList.length; m++) {
    const mk = P.maskList[m];
    const d = Math.hypot(x - mk.x, z - mk.z);
    if (d < mk.r) {
      const t = (1 - d / mk.r) * 1.6;
      const mm = Math.min(1, t) * (mk.strength ?? 1) * (0.75 + 0.25 * nMid);
      c = mix3(c, pal(P.def, mk.layer, nMid), mm);
    }
  }
  return c;
}

const EMBER = { hot: rgb(LAVA_EMBER.hot), rim: rgb(LAVA_EMBER.rim), scorch: rgb(LAVA_EMBER.scorch) };

/** Chamusca o terreno junto à lava: basalto queimado ao redor e borda incandescente no limiar. `heat` 0..1. */
function applyLavaRim(c, heat, nMid) {
  let r = mix3(c, EMBER.scorch, Math.min(1, heat * 1.2) * 0.55);
  r = mix3(r, EMBER.rim, smoothstep(0.55, 1, heat) * 0.75);
  return mix3(r, EMBER.hot, smoothstep(0.85, 1, heat) * 0.6 * (0.6 + 0.4 * nMid));
}

/**
 * Pinta o splat em `data` (RGBA, `pw × ph`; PRECISA ser `Uint8ClampedArray`, como o `ImageData`: arredonda e satura ao gravar).
 * A malha cobre `size × size` u centrada em (0, 0); a linha `py` do canvas é z crescente.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} pw
 * @param {number} ph
 * @param {object} o
 * @param {object} o.def              tileset do mapa (estilo único no caminho antigo; estilo base no regional)
 * @param {number} o.size
 * @param {(x:number,z:number)=>number} o.getHeight
 * @param {number} o.waterLevel
 * @param {Array} [o.startSlots]      manchas de terra batida sob as bases
 * @param {Array} [o.masks]           `splatMasks`
 * @param {import('../../data/biomeRegions.js').RegionMap|null} [o.regions]  regiões de bioma (mapa com `biomeGrid`)
 * @param {import('../../data/lavaRender.js').LavaInfo|null} [o.lava]  lava: borda incandescente no terreno vizinho (nos dois caminhos; sem lava = sem mudança)
 */
export function paintSplat(data, pw, ph, { def, size, getHeight, waterLevel, startSlots = [], masks = [], regions = null, lava = null }) {
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

  // estilos: um só (caminho antigo) ou um por região
  const prepped = regions
    ? regions.styles.map((s) => prepStyle(s.def, startSlots, masks, true))
    : [prepStyle(def, startSlots, masks, false)];
  const K = prepped.length;
  const W = regions ? new Float32Array(K) : null;

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

      let c;
      if (!regions) {
        c = styleColor(prepped[0], x, z, h, slope, nBig, nMid, waterLevel);
      } else if (regions.isInterior(x, z)) {
        // longe de qualquer fronteira entre estilos: um estilo só (sem ruído de fronteira nem mistura)
        c = styleColor(prepped[regions.styleAt(x, z)], x, z, h, slope, nBig, nMid, waterLevel);
      } else {
        const wx = x + (vnoise(x * 0.21 + 31, z * 0.21 + 17) - 0.5) * 2 * BORDER_WARP + (vnoise(x * 0.6, z * 0.6 + 5) - 0.5) * 0.8;
        const wz = z + (vnoise(x * 0.21 + 3, z * 0.21 + 59) - 0.5) * 2 * BORDER_WARP + (vnoise(x * 0.6 + 9, z * 0.6) - 0.5) * 0.8;
        regions.weightsAt(wx, wz, W);
        let r = 0, g = 0, b = 0, used = 0;
        for (let k = 0; k < K; k++) {
          const wk = W[k];
          if (wk < 0.004) continue;
          const ck = styleColor(prepped[k], x, z, h, slope, nBig, nMid, waterLevel);
          r += ck[0] * wk; g += ck[1] * wk; b += ck[2] * wk; used += wk;
        }
        c = used > 0 ? [r / used, g / used, b / used] : styleColor(prepped[0], x, z, h, slope, nBig, nMid, waterLevel);
      }
      if (lava) {
        const heat = lava.heatAt(x, z, LAVA_STYLE.rimRadius);
        if (heat > 0.001) c = applyLavaRim(c, heat, nMid);
      }

      const g = 0.94 + grain * 0.12;
      const o = (py * pw + px) * 4;
      data[o] = Math.min(255, c[0] * g);
      data[o + 1] = Math.min(255, c[1] * g);
      data[o + 2] = Math.min(255, c[2] * g);
      data[o + 3] = 255;
    }
  }
}
