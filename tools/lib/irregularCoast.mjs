/**
 * tools/lib/irregularCoast.mjs — PROTÓTIPO (spec docs/specs/MUNDO-TERRENO-MAPAS.md §2; não integrado ao jogo).
 *
 * Gera, de forma determinística por semente, um mapa de altura + máscara terra/água com 2 continentes de contorno
 * irregular e várias ilhas de tipos diferentes entre eles. Módulo puro (sem DOM/three/Math.random), só Node/ESM.
 *
 * Algoritmo (resumo):
 *  1. Cada entidade (continente/ilha/ilhota) tem um campo escalar `f(x,z) = 1 - r/R(θ) + ruído + enseadas/penínsulas`:
 *     `r/R(θ)` é a distância elíptica normalizada pelo raio angular `R(θ)` (série de Fourier aleatória, k=2..6, quebra o círculo);
 *     o ruído é fBm de domínio deformado (domain warp) — dá baías, caps e fiordes; enseadas (gaussianas negativas
 *     alongadas para dentro) e penínsulas (positivas alongadas para fora) são explícitas.
 *  2. `terra = f > 0` (+ margem de oceano no contorno do mapa), filtro de maioria 3×3 (tira dentes de 1 célula),
 *     recorte por "folga" (distância mínima entre entidades = canal navegável) e fica só o MAIOR componente da entidade.
 *  3. Lagoas pequenas (< `minLake` células, água não ligada ao oceano) viram terra; as grandes ficam como lagos.
 *  4. Distância assinada à costa (transformada de distância em duas passadas) → altura (praia rasa, interior 2,6, fundo
 *     até −3,6 no mar, cone e cratera no vulcão, cordilheira no continente exuberante) e bioma por entidade.
 *
 * Convenções (iguais às do jogo): x/z em unidades de mundo, centro em (0,0), lado `size`; terra caminhável = altura ≥ 0,65
 * (`Terrain.isWalkable`); linha d'água 0,5. Índice de células `j * grid + i` (j = z, i = x).
 */
import { mulberry32 } from '../../src/sim/rng.js';
import { toH10, encodeHeights, paintedNodes } from '../../src/data/maps/painted.js';
import { encodeLavaGrid } from '../../src/data/maps/lava.js';

export const BIOME = Object.freeze({
  SEA: 0, SAND: 1, GRASS: 2, SAVANNA: 3, DESERT: 4, STEPPE: 5, ROCK: 6, VOLCANIC: 7, LAVA: 8, SNOW: 9, SWAMP: 10, ICE: 11, FOREST: 12
});
export const BIOME_NAMES = Object.freeze(['mar', 'areia', 'grama exuberante', 'savana', 'deserto', 'estepe', 'rocha', 'vulcânico', 'lava', 'neve', 'pântano', 'gelo', 'floresta densa']);

export const LAND_HEIGHT = 0.65; // `Terrain.isWalkable`

export const DEFAULT_OPTIONS = Object.freeze({
  seed: 1,
  size: 192, // lado do mundo (u)
  grid: 256, // células por lado (cell = size / grid)
  roughness: 1, // 0,4..1,6: rugosidade da costa (amplitude/ganho do ruído e da deformação de domínio)
  islands: 6, // ilhas "grandes" entre os continentes (≥ 5; os 6 primeiros tipos são distintos)
  islets: 5, // ilhotas do arquipélago ao redor de uma ilha
  bays: 3, // enseadas/baías por continente
  peninsulas: 3, // penínsulas por continente
  gap: 5, // canal mínimo entre entidades (u) — garante rota naval
  minLake: 60, // lagoa (água não ligada ao oceano) com menos células que isso vira terra
  symmetry: 'none', // 'none' | 'mirror' (o 2º continente espelha a forma-base do 1º, mas com outro ruído)
  continentSpacing: 0.29, // |cx| dos continentes, em frações de `size`
  lava: true, // córregos de lava na ilha vulcânica (Fornalha): divisor de áreas com passagens de rocha (spec §3.5)
  lavaStreams: 0, // 0 = auto (1 ou 2 córregos, por semente); 1 | 2 força
  lavaPassages: 0, // 0 = auto (1 ou 2 passagens por córrego, por semente); 1 | 2 força (por córrego)
  lavaWidth: [3, 4] // largura do córrego em células da grade (3–4 células = 2,25–3 u com grid 256 / size 192)
});

/** Altura assada das células de lava: abaixo de 0,65 (terrestre bloqueia) e acima de `NAVAL_MAX_HEIGHT` 0,1 (naval também bloqueia). */
export const LAVA_HEIGHT = 0.4;

// ---------------------------------------------------------------------------------------------
// Ruído de valor determinístico
// ---------------------------------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, seed, octaves = 4, gain = 0.5, lac = 2.03) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f + o * 31.7, y * f - o * 17.3, seed + o * 101);
    norm += amp; amp *= gain; f *= lac;
  }
  return sum / norm;
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------
// Grades: componentes, distância, filtros
// ---------------------------------------------------------------------------------------------
/** Rotula componentes 4-conexos de `mask[i] === value`. Devolve `{ labels (Int32, -1 = fora), sizes }`. */
export function labelComponents(mask, G, value = 1) {
  const N = G * G;
  const labels = new Int32Array(N).fill(-1);
  const sizes = [];
  const queue = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (mask[s] !== value || labels[s] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0, count = 0;
    queue[tail++] = s; labels[s] = id;
    while (head < tail) {
      const c = queue[head++]; count++;
      const i = c % G;
      if (i > 0 && mask[c - 1] === value && labels[c - 1] < 0) { labels[c - 1] = id; queue[tail++] = c - 1; }
      if (i < G - 1 && mask[c + 1] === value && labels[c + 1] < 0) { labels[c + 1] = id; queue[tail++] = c + 1; }
      if (c >= G && mask[c - G] === value && labels[c - G] < 0) { labels[c - G] = id; queue[tail++] = c - G; }
      if (c < N - G && mask[c + G] === value && labels[c + G] < 0) { labels[c + G] = id; queue[tail++] = c + G; }
    }
    sizes.push(count);
  }
  return { labels, sizes };
}

/** Transformada de distância (chanfro 1/√2) em células até a célula-fonte mais próxima (`source[i] === 1`). */
export function distanceTransform(source, G) {
  const INF = 1e9, R2 = Math.SQRT2;
  const d = new Float32Array(G * G);
  for (let i = 0; i < d.length; i++) d[i] = source[i] === 1 ? 0 : INF;
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const c = j * G + i;
      let v = d[c];
      if (i > 0) v = Math.min(v, d[c - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[c - G] + 1);
        if (i > 0) v = Math.min(v, d[c - G - 1] + R2);
        if (i < G - 1) v = Math.min(v, d[c - G + 1] + R2);
      }
      d[c] = v;
    }
  }
  for (let j = G - 1; j >= 0; j--) {
    for (let i = G - 1; i >= 0; i--) {
      const c = j * G + i;
      let v = d[c];
      if (i < G - 1) v = Math.min(v, d[c + 1] + 1);
      if (j < G - 1) {
        v = Math.min(v, d[c + G] + 1);
        if (i < G - 1) v = Math.min(v, d[c + G + 1] + R2);
        if (i > 0) v = Math.min(v, d[c + G - 1] + R2);
      }
      d[c] = v;
    }
  }
  return d;
}

function majorityFilter(mask, G, passes = 2) {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(cur);
    for (let j = 1; j < G - 1; j++) {
      for (let i = 1; i < G - 1; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += cur[(j + dj) * G + i + di];
        if (s >= 6) next[j * G + i] = 1; else if (s <= 3) next[j * G + i] = 0;
      }
    }
    cur = next;
  }
  return cur;
}

function keepLargest(mask, G) {
  const { labels, sizes } = labelComponents(mask, G, 1);
  if (sizes.length <= 1) return mask;
  let best = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (labels[i] === best) out[i] = 1;
  return out;
}

function boxBlur(src, G, passes = 2) {
  let a = src, b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj; if (jj < 0 || jj >= G) continue;
          for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= G) continue; s += a[jj * G + ii]; n++; }
        }
        b[j * G + i] = s / n;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

// ---------------------------------------------------------------------------------------------
// Entidades (continentes, ilhas, ilhotas) e seu campo escalar
// ---------------------------------------------------------------------------------------------
/** Tipos de ilha: ordem fixa (os 6 primeiros são distintos). `r` = raio-base em u; `stretch` = alongamento. */
const ISLAND_TYPES = Object.freeze([
  { biome: 'volcanic', r: [14, 16.5], stretch: 1.05, rough: 0.45, noise: 0.40 },
  { biome: 'rocky', r: [10, 12.5], stretch: 1.25, rough: 1.0, noise: 0.62, ridged: true },
  { biome: 'ice', r: [10, 12], stretch: 1.6, rough: 0.7, noise: 0.5 },
  { biome: 'swamp', r: [11, 13], stretch: 1.15, rough: 1.1, noise: 0.62 },
  { biome: 'tropical', r: [9, 11], stretch: 1.2, rough: 0.8, noise: 0.5 },
  { biome: 'atoll', r: [10, 11.5], stretch: 1.0, rough: 0.6, noise: 0.35, ring: true },
  { biome: 'rocky', r: [8, 10], stretch: 1.4, rough: 1.2, noise: 0.65, ridged: true },
  { biome: 'tropical', r: [8, 9.5], stretch: 1.3, rough: 0.9, noise: 0.55 },
  { biome: 'swamp', r: [8, 10], stretch: 1.2, rough: 1.0, noise: 0.6 }
]);

function makeHarmonics(rng, rough) {
  const h = [];
  for (let k = 2; k <= 6; k++) h.push({ k, a: rng.range(0.4, 1) * 0.24 * rough / Math.pow(k, 0.55), p: rng.range(0, Math.PI * 2) });
  return h;
}

function makeFeatures(rng, count, type) {
  const out = [];
  const used = [];
  for (let n = 0; n < count; n++) {
    let theta = 0;
    for (let t = 0; t < 30; t++) {
      theta = rng.range(0, Math.PI * 2);
      if (used.every((u) => Math.abs(Math.atan2(Math.sin(theta - u), Math.cos(theta - u))) > 0.7)) break;
    }
    used.push(theta);
    out.push(type === 'bay'
      ? { type, theta, c0: rng.range(0.62, 0.82), sa: rng.range(0.22, 0.34), sp: rng.range(0.06, 0.1), amp: rng.range(0.7, 1.0) }
      : { type, theta, c0: rng.range(1.02, 1.12), sa: rng.range(0.2, 0.32), sp: rng.range(0.06, 0.09), amp: rng.range(0.55, 0.8) });
  }
  return out;
}

/** Campo escalar de uma entidade: > 0 = terra, 0 = costa. */
function entityField(e, x, z, o) {
  const sx = e.flipX ? -1 : 1;
  const dx0 = (x - e.cx) * sx, dz0 = z - e.cz;
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const ex = (dx0 * c + dz0 * s) / e.rx, ez = (-dx0 * s + dz0 * c) / e.rz;
  const r = Math.hypot(ex, ez);
  const th = Math.atan2(ez, ex);
  let R = 1;
  for (const h of e.harmonics) R += h.a * Math.cos(h.k * th + h.p);
  R = Math.max(0.5, R);
  const base = e.ring ? 1 - Math.abs(r / R - 0.72) / 0.3 : 1 - r / R;
  // deformação de domínio + fBm (+ "ridged" para costa de rocha serrilhada)
  const Rw = Math.max(e.rx, e.rz);
  const wf = 1 / (1.3 * Rw), nf = 1 / (0.9 * Rw);
  const rough = o.roughness * e.rough;
  const wx = fbm(x * wf + 11.1, z * wf - 4.7, e.seed + 1, 3, 0.5) - 0.5;
  const wz = fbm(x * wf - 7.3, z * wf + 19.9, e.seed + 2, 3, 0.5) - 0.5;
  const q = e.warp * rough * Rw;
  let n = fbm((x + wx * q) * nf, (z + wz * q) * nf, e.seed + 3, 5, 0.42 + 0.16 * Math.min(1.5, rough)) - 0.5;
  if (e.ridged) n = (1 - Math.abs(n * 4)) * 0.5 - 0.25 + n * 0.5;
  let f = base + n * e.noise * (0.55 + 0.45 * rough) * 1.6;
  f += (fbm(x * 0.13 + 5.5, z * 0.13 - 2.2, e.seed + 9, 3, 0.55) - 0.5) * 0.2 * rough + (fbm(x * 0.26 - 3.1, z * 0.26 + 8.4, e.seed + 10, 2, 0.5) - 0.5) * 0.1 * rough; // detalhe fino: pontas e reentrâncias de ~4–8 u
  for (const b of e.features) {
    const ca = Math.cos(b.theta), sa = Math.sin(b.theta);
    const along = ex * ca + ez * sa, perp = -ex * sa + ez * ca;
    const g = Math.exp(-0.5 * (((along - b.c0) / b.sa) ** 2 + (perp / b.sp) ** 2));
    f += b.type === 'bay' ? -b.amp * g : b.amp * g;
  }
  return f;
}

function continentEntity(id, biome, cx, cz, rng, o, seed) {
  const rx = 0.135 * o.size * rng.range(0.94, 1.08), rz = 0.34 * o.size * rng.range(0.9, 1.04);
  return {
    id, kind: 'continent', biome, cx, cz, rx, rz, rot: rng.range(-0.35, 0.35), seed, flipX: false,
    harmonics: makeHarmonics(rng, o.roughness), noise: 0.7, warp: 0.5, rough: 1,
    features: [...makeFeatures(rng, o.bays, 'bay'), ...makeFeatures(rng, o.peninsulas, 'peninsula')]
  };
}

function islandEntity(id, type, cx, cz, rng, o, seed) {
  const r = rng.range(type.r[0], type.r[1]);
  return {
    id, kind: 'island', biome: type.biome, cx, cz, rx: r * type.stretch, rz: r / Math.sqrt(type.stretch) * 1.0, rot: rng.range(0, Math.PI),
    seed, flipX: false, harmonics: makeHarmonics(rng, type.rough * o.roughness), noise: type.noise, warp: 0.3, rough: type.rough,
    ridged: !!type.ridged, ring: !!type.ring, features: [], r
  };
}

// ---------------------------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------------------------
/**
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @returns {object} mapa: `{ options, size, grid, cell, land, owner, sd, height, biome, entities, lakes, stats }`
 */
export function generateIrregularCoast(options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  o.seed = Number(o.seed) >>> 0;
  if (!(o.islands >= 5)) throw new Error('irregularCoast: islands deve ser >= 5');
  const G = o.grid, N = G * G, cell = o.size / G, half = o.size / 2;
  const root = mulberry32(o.seed ^ 0x51ed270b);
  const gapCells = Math.ceil(o.gap / cell);
  const toX = (i) => (i + 0.5) * cell - half;

  const land = new Uint8Array(N);
  const owner = new Int16Array(N).fill(-1);
  const entities = [];

  /** Constrói a máscara de uma entidade (campo → limiar → maioria → folga → maior componente). */
  function buildMask(e, occDist) {
    const R = Math.max(e.rx, e.rz) * 1.8;
    const i0 = Math.max(2, Math.floor((e.cx - R + half) / cell)), i1 = Math.min(G - 3, Math.ceil((e.cx + R + half) / cell));
    const j0 = Math.max(2, Math.floor((e.cz - R + half) / cell)), j1 = Math.min(G - 3, Math.ceil((e.cz + R + half) / cell));
    let mask = new Uint8Array(N);
    for (let j = j0; j <= j1; j++) {
      const z = toX(j);
      for (let i = i0; i <= i1; i++) {
        const x = toX(i);
        let f = entityField(e, x, z, o);
        const m = Math.max(Math.abs(x), Math.abs(z)) / half;
        f -= 3 * smoothstep(0.86, 0.97, m); // oceano garantido no contorno do mapa
        if (f > 0) mask[j * G + i] = 1;
      }
    }
    mask = majorityFilter(mask, G, 2);
    if (occDist) for (let c = 0; c < N; c++) if (mask[c] && occDist[c] < gapCells) mask[c] = 0;
    return keepLargest(mask, G);
  }

  function commit(e, mask) {
    let area = 0;
    for (let c = 0; c < N; c++) if (mask[c]) { land[c] = 1; owner[c] = e.index; area++; }
    e.area = area * cell * cell;
  }

  // 1. continentes
  const rngC = root.fork('continents');
  const sp = o.continentSpacing * o.size;
  const cA = continentEntity('continente-oeste', 'lush', -sp, rngC.range(-0.03, 0.03) * o.size, rngC, o, (o.seed ^ 0x1111) | 0);
  let cB;
  if (o.symmetry === 'mirror') {
    cB = { ...cA, id: 'continente-leste', biome: 'arid', cx: -cA.cx, cz: -cA.cz, flipX: true, rot: cA.rot, seed: (o.seed ^ 0x2222) | 0 };
  } else {
    cB = continentEntity('continente-leste', 'arid', sp, rngC.range(-0.03, 0.03) * o.size, rngC, o, (o.seed ^ 0x2222) | 0);
  }
  for (const e of [cA, cB]) {
    e.index = entities.length; entities.push(e);
    commit(e, buildMask(e, e.index === 0 ? null : distanceTransform(land, G)));
  }

  // 2. ilhas (posição por amostragem com rejeição; tentativas com novo sorteio se a máscara sair pequena)
  const rngI = root.fork('islands');
  const order = [];
  for (let k = 0; k < o.islands; k++) order.push(ISLAND_TYPES[k % ISLAND_TYPES.length]);
  const placed = []; // {x,z,r}
  const tryPlace = (type, rr, attempts, minAreaFrac, rngP, zone) => {
    const occ = distanceTransform(land, G);
    for (let a = 0; a < attempts; a++) {
      const r = rr ?? rngP.range(type.r[0], type.r[1]);
      const cx = rngP.range(-zone.x, zone.x) * o.size, cz = rngP.range(-zone.z, zone.z) * o.size;
      const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
      if (occ[jC * G + iC] * cell < r * 1.2 + o.gap) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + r * 1.2 + o.gap + 1)) continue;
      return { cx, cz, r, occ };
    }
    return null;
  };
  for (let k = 0; k < order.length; k++) {
    const type = order[k];
    let ok = false;
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const spot = tryPlace(type, null, 200, 0.5, rngI, { x: 0.16, z: 0.39 });
      if (!spot) continue;
      const e = islandEntity(`ilha-${k + 1}-${type.biome}`, type, spot.cx, spot.cz, rngI, o, (o.seed * 31 + k * 977 + attempt) | 0);
      e.rx = spot.r * type.stretch; e.rz = spot.r / Math.sqrt(type.stretch);
      const mask = buildMask(e, spot.occ);
      let area = 0; for (let c = 0; c < N; c++) area += mask[c];
      if (area * cell * cell < 0.45 * Math.PI * e.rx * e.rz) continue;
      e.index = entities.length; entities.push(e); commit(e, mask);
      placed.push({ x: e.cx, z: e.cz, r: Math.max(e.rx, e.rz) });
      ok = true;
    }
  }
  // 3. arquipélago: ilhotas ao redor da ilha "tropical" (ou da última)
  const host = entities.find((e) => e.biome === 'tropical') ?? entities[entities.length - 1];
  for (let k = 0; k < o.islets; k++) {
    let occ = distanceTransform(land, G);
    for (let attempt = 0; attempt < 120; attempt++) {
      const rr = rngI.range(2.8, 4.4);
      const ang = rngI.range(0, Math.PI * 2), dist = Math.max(host.rx, host.rz) * rngI.range(1.5, 2.6) + o.gap;
      const cx = host.cx + Math.cos(ang) * dist, cz = host.cz + Math.sin(ang) * dist;
      if (Math.abs(cx) > half * 0.8 || Math.abs(cz) > half * 0.8) continue;
      const iC = Math.floor((cx + half) / cell), jC = Math.floor((cz + half) / cell);
      if (occ[jC * G + iC] * cell < rr * 1.5 + o.gap) continue;
      if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + rr * 1.5 + o.gap)) continue;
      const e = {
        id: `ilhota-${k + 1}`, kind: 'islet', biome: 'islet', cx, cz, rx: rr, rz: rr * rngI.range(0.7, 1), rot: rngI.range(0, Math.PI), seed: (o.seed * 57 + k * 131) | 0,
        flipX: false, harmonics: makeHarmonics(rngI, 0.9), noise: 0.5, warp: 0.25, rough: 0.8, features: []
      };
      const mask = buildMask(e, occ);
      let area = 0; for (let c = 0; c < N; c++) area += mask[c];
      if (area * cell * cell < 12) continue;
      e.index = entities.length; entities.push(e); commit(e, mask);
      placed.push({ x: cx, z: cz, r: rr });
      break;
    }
  }

  // 4. lagoas: água não ligada ao oceano e pequena vira terra; grandes ficam como lagos
  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = land[c] ? 0 : 1;
  const wl = labelComponents(water, G, 1);
  const oceanId = wl.labels[0];
  const lakes = [];
  const fillList = new Map();
  for (let c = 0; c < N; c++) {
    const id = wl.labels[c];
    if (id < 0 || id === oceanId) continue;
    if (wl.sizes[id] < o.minLake) { if (!fillList.has(id)) fillList.set(id, []); fillList.get(id).push(c); }
  }
  for (const cells of fillList.values()) {
    let own = -1;
    for (const c of cells) {
      for (const n of [c - 1, c + 1, c - G, c + G]) if (n >= 0 && n < N && land[n] && owner[n] >= 0) { own = owner[n]; break; }
      if (own >= 0) break;
    }
    for (const c of cells) { land[c] = 1; owner[c] = own; }
  }
  for (let id = 0; id < wl.sizes.length; id++) if (id !== oceanId && wl.sizes[id] >= o.minLake) lakes.push(wl.sizes[id]);
  for (const e of entities) { let a = 0; for (let c = 0; c < N; c++) if (owner[c] === e.index) a++; e.area = a * cell * cell; }

  const map = { options: o, size: o.size, grid: G, cell, land, owner, entities, lakes };
  map.lava = o.lava ? generateLava(map, root) : null;
  finalizeSurface(map);
  map.stats = analyzeMap(map);
  return map;
}

// ---------------------------------------------------------------------------------------------
// Lava como divisor de áreas (spec MUNDO-TERRENO-MAPAS §3.5)
// ---------------------------------------------------------------------------------------------
const NB8 = Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]);

/** Rotula componentes 8-conexos de `mask[i] === value` (sem regra de "corte de quina": a lava precisa vedar até na diagonal). */
export function labelComponents8(mask, G, value = 1) {
  const N = G * G;
  const labels = new Int32Array(N).fill(-1);
  const sizes = [];
  const queue = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (mask[s] !== value || labels[s] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = s; labels[s] = id;
    while (head < tail) {
      const c = queue[head++];
      const i = c % G, j = (c - i) / G;
      for (const [di, dj] of NB8) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
        const n = jj * G + ii;
        if (mask[n] === value && labels[n] < 0) { labels[n] = id; queue[tail++] = n; }
      }
    }
    sizes.push(tail);
  }
  return { labels, sizes };
}

/**
 * Máscara caminhável para a lava: terra firme (`land`) que não é lava. `openPassages=false` trata as passagens de rocha como
 * bloqueadas (mostra as ÁREAS separadas pelo córrego); `true` as inclui (mostra a conectividade real).
 */
export function lavaWalkable(map, openPassages = true) {
  const { land, lava } = map;
  const w = new Uint8Array(land.length);
  for (let c = 0; c < w.length; c++) w[c] = land[c] && !(lava && lava.mask[c]) && (openPassages || !(lava && lava.passage[c])) ? 1 : 0;
  return w;
}

/** BFS 8-conexo (só pela máscara caminhável `walk`) de `from` a `to` (índices de célula). */
export function bfsReach(walk, G, from, to) {
  if (!walk[from] || !walk[to]) return false;
  const seen = new Uint8Array(walk.length), q = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === to) return true;
    const i = c % G, j = (c - i) / G;
    for (const [di, dj] of NB8) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
      const n = jj * G + ii;
      if (walk[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return false;
}

/**
 * Córregos de lava na ilha vulcânica: 1–2 caminhos sinuosos (deslocamento por fBm em torno de uma corda costa a costa) de
 * 3–4 células de largura que dividem a ilha em `streams + 1` áreas; 1–2 passagens de rocha resfriada por córrego (única
 * ligação entre as áreas) e uma base (`start slot`) por área. Tenta até 80 vezes (deslocamento cada vez menor) até validar.
 * @returns {null | { mask, passage, soft, glow, streams, areas, bases, passageCount, areaCount, attempts }}
 */
function generateLava(map, root) {
  const o = map.options;
  const e = map.entities.find((x) => x.biome === 'volcanic');
  if (!e) return null;
  const { grid: G, land, owner } = map;
  const N = G * G;
  const own = new Uint8Array(N);
  let area = 0, ci = 0, cj = 0;
  for (let c = 0; c < N; c++) if (land[c] && owner[c] === e.index) { own[c] = 1; area++; ci += c % G; cj += (c - (c % G)) / G; }
  if (area < 200) return null;
  ci /= area; cj /= area;
  const R = Math.sqrt(area / Math.PI);
  const rng = root.fork('lava');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sliverMin = 30, areaMin = 60, clearMin = 2.5;

  for (let attempt = 0; attempt < 80; attempt++) {
    const wig = attempt < 40 ? 1 : attempt < 65 ? 0.5 : 0;
    const S = o.lavaStreams > 0 ? o.lavaStreams : (rng.next() < 0.45 ? 2 : 1);
    const theta = rng.range(0, Math.PI);
    const offs = S === 1 ? [rng.range(-0.15, 0.15) * R] : (() => { const s = rng.range(0.28, 0.36) * R; return [-s, s]; })();
    const mask = new Uint8Array(N), passage = new Uint8Array(N);
    const streams = [];
    let bad = false;
    for (let k = 0; k < S && !bad; k++) {
      const th = theta + (S === 2 ? rng.range(-0.1, 0.1) : 0);
      const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
      const px0 = ci + nx * offs[k], py0 = cj + ny * offs[k];
      const march = (sgn) => {
        let t = 0;
        while (t < 4 * R) {
          const i = Math.round(px0 + dx * sgn * t), j = Math.round(py0 + dy * sgn * t);
          if (i < 0 || j < 0 || i >= G || j >= G || !own[j * G + i]) return t;
          t += 0.5;
        }
        return t;
      };
      if (!own[Math.round(py0) * G + Math.round(px0)]) { bad = true; break; }
      const lNeg = march(-1) + 3, lPos = march(1) + 3;
      const A = [px0 - dx * lNeg, py0 - dy * lNeg], B = [px0 + dx * lPos, py0 + dy * lPos];
      const L = lNeg + lPos;
      const steps = Math.ceil(L * 1.6);
      const w0 = rng.range(o.lavaWidth[0], o.lavaWidth[1]);
      const amp = 0.22 * R * rng.range(0.6, 1) * wig, phase = rng.range(0, 50), ws = rng.range(0, 1000) | 0;
      const path = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const disp = amp * (fbm(t * 2.4 + phase, 3.7, ws, 3) - 0.5) * 2 * Math.pow(Math.sin(Math.PI * t), 0.5);
        const rad = Math.max(1.5, (w0 / 2) * (0.92 + 0.16 * fbm(t * 5 + 7, 1.3, ws + 5, 2)));
        path.push({ t, i: A[0] + (B[0] - A[0]) * t + nx * disp, j: A[1] + (B[1] - A[1]) * t + ny * disp, rad });
      }
      streams.push({ path, width: w0, passages: [] });
      for (const p of path) {
        const r = p.rad + 0.35, i0 = Math.floor(p.i - r), i1 = Math.ceil(p.i + r), j0 = Math.floor(p.j - r), j1 = Math.ceil(p.j + r);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          if (i < 0 || j < 0 || i >= G || j >= G) continue;
          if (Math.hypot(i - p.i, j - p.j) <= r && own[j * G + i]) mask[j * G + i] = 1;
        }
      }
    }
    if (bad) continue;
    // 1. cada córrego é UM componente (8-conexo), os córregos não se fundem e cada um vai de costa a costa
    const lc = labelComponents8(mask, G, 1);
    if (lc.sizes.length !== S) continue;
    if (!lavaSpansIsland(mask, land, G, lc, R)) continue;
    // 2. fatias minúsculas (< sliverMin células) entre a lava e a costa são absorvidas pela lava
    const walk = new Uint8Array(N);
    for (let c = 0; c < N; c++) walk[c] = own[c] && !mask[c] ? 1 : 0;
    let al = labelComponents8(walk, G, 1);
    for (let c = 0; c < N; c++) if (walk[c] && al.sizes[al.labels[c]] < sliverMin) { mask[c] = 1; walk[c] = 0; }
    al = labelComponents8(walk, G, 1);
    if (al.sizes.length !== S + 1 || al.sizes.some((n) => n < areaMin)) continue;
    // 3. passagens de rocha resfriada: 1–2 por córrego, ~6 células ao longo do fluxo (>= 4,5 u: cabem 3 células de 1,5 u do pathfinder)
    const passInfo = [];
    for (let k = 0; k < S; k++) {
      const n = o.lavaPassages > 0 ? o.lavaPassages : (rng.next() < 0.5 ? 1 : 2);
      const path = streams[k].path, last = path.length - 1;
      const centers = n === 1 ? [rng.range(0.38, 0.62)] : [rng.range(0.2, 0.36), rng.range(0.64, 0.8)];
      for (const tc of centers) {
        const half = 0.5 / (last / 1.6); // ±0,5 célula ao longo do fluxo + raio do disco => ~5–6 células de passagem (>= 3 u)
        const s0 = Math.max(0, Math.round((tc - half) * last)), s1 = Math.min(last, Math.round((tc + half) * last));
        let removed = 0;
        for (let s = s0; s <= s1; s++) {
          const p = path[s], r = p.rad + 0.4;
          for (let j = Math.floor(p.j - r); j <= Math.ceil(p.j + r); j++) for (let i = Math.floor(p.i - r); i <= Math.ceil(p.i + r); i++) {
            if (i < 0 || j < 0 || i >= G || j >= G) continue;
            const c = j * G + i;
            if (mask[c] && Math.hypot(i - p.i, j - p.j) <= r) { mask[c] = 0; passage[c] = 1; removed++; }
          }
        }
        const mid = path[Math.round(tc * last)];
        streams[k].passages.push({ t: tc, i: mid.i, j: mid.j, cells: removed });
        passInfo.push(removed);
      }
    }
    if (passInfo.some((n) => n < 12)) continue;
    // 4. validação: com as passagens FECHADAS as áreas continuam S+1; ABERTAS formam 1 só; cada passagem toca >= 2 áreas
    const closed = new Uint8Array(N), open = new Uint8Array(N);
    for (let c = 0; c < N; c++) { open[c] = own[c] && !mask[c] ? 1 : 0; closed[c] = open[c] && !passage[c] ? 1 : 0; }
    const cl = labelComponents8(closed, G, 1);
    if (cl.sizes.length !== S + 1 || cl.sizes.some((n) => n < areaMin)) continue;
    if (labelComponents8(open, G, 1).sizes.length !== 1) continue;
    const pl = labelComponents8(passage, G, 1);
    let passOk = pl.sizes.length === passInfo.length;
    for (let id = 0; id < pl.sizes.length && passOk; id++) {
      const touch = new Set();
      for (let c = 0; c < N; c++) {
        if (pl.labels[c] !== id) continue;
        const i = c % G, j = (c - i) / G;
        for (const [di, dj] of NB8) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < G && jj < G && closed[jj * G + ii]) touch.add(cl.labels[jj * G + ii]); }
      }
      if (touch.size < 2) passOk = false;
    }
    if (!passOk) continue;
    // 5. uma base por área: célula de maior folga, longe do cone do vulcão
    const nonWalk = new Uint8Array(N);
    for (let c = 0; c < N; c++) nonWalk[c] = closed[c] ? 0 : 1;
    const clr = distanceTransform(nonWalk, G);
    const areas = cl.sizes.map((size, id) => ({ id, size, base: null }));
    const bestScore = areas.map(() => -1);
    for (let c = 0; c < N; c++) {
      const id = cl.labels[c];
      if (id < 0) continue;
      const i = c % G, j = (c - i) / G;
      const rc = Math.hypot(i - ci, j - cj) / R;
      const score = clr[c] * (0.35 + 0.65 * clamp((rc - 0.25) / 0.35, 0, 1));
      if (score > bestScore[id]) { bestScore[id] = score; areas[id].base = { cell: c, i, j, clearance: clr[c] }; }
    }
    if (areas.some((a) => !a.base || a.base.clearance < clearMin)) continue;
    const cellSize = map.cell, half = map.size / 2;
    for (const a of areas) { a.base.x = (a.base.i + 0.5) * cellSize - half; a.base.z = (a.base.j + 0.5) * cellSize - half; a.areaUnits = a.size * cellSize * cellSize; }
    const maskF = Float32Array.from(mask); // boxBlur reaproveita o buffer de entrada: não passar a máscara original
    const soft = boxBlur(maskF, G, 1), glow = boxBlur(Float32Array.from(mask), G, 5);
    return { entity: e.index, mask, passage, soft, glow, streams, areas, bases: areas.map((a) => a.base), passageCount: passInfo.length, areaCount: S + 1, attempts: attempt + 1 };
  }
  return null;
}

/** O córrego (componente de lava) vai de costa a costa: tem células coladas na água em dois pontos separados por >= 0,9·R. */
function lavaSpansIsland(mask, land, G, lc, R) {
  for (let id = 0; id < lc.sizes.length; id++) {
    const pts = [];
    for (let c = 0; c < mask.length; c++) {
      if (lc.labels[c] !== id) continue;
      const i = c % G, j = (c - i) / G;
      for (const [di, dj] of NB8) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= G || jj >= G || !land[jj * G + ii]) { pts.push([i, j]); break; }
      }
    }
    let far = 0;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) far = Math.max(far, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]));
    if (far < 0.9 * R) return false;
  }
  return true;
}

/** Métricas independentes do gerador (usadas pelo teste e pelo `metrics.json`). */
export function lavaStats(map) {
  const lv = map.lava;
  if (!lv) return null;
  let lavaCells = 0, passageCells = 0;
  for (let c = 0; c < lv.mask.length; c++) { lavaCells += lv.mask[c]; passageCells += lv.passage[c]; }
  return {
    streams: lv.streams.length, areas: lv.areaCount, passages: lv.passageCount, lavaCells, passageCells, attempts: lv.attempts,
    lavaAreaUnits: +(lavaCells * map.cell * map.cell).toFixed(1), widthCells: lv.streams.map((s) => +s.width.toFixed(2)),
    areaUnits: lv.areas.map((a) => +a.areaUnits.toFixed(1))
  };
}

// ---------------------------------------------------------------------------------------------
// Altura e bioma
// ---------------------------------------------------------------------------------------------
function finalizeSurface(map) {
  const { grid: G, cell, land, owner, entities, size } = map;
  const N = G * G, half = size / 2;
  const water = new Uint8Array(N);
  for (let c = 0; c < N; c++) water[c] = land[c] ? 0 : 1;
  const dLand = distanceTransform(land, G); // em água: distância à terra
  const dWater = distanceTransform(water, G); // em terra: distância à água
  const sdRaw = new Float32Array(N);
  for (let c = 0; c < N; c++) sdRaw[c] = land[c] ? (dWater[c] - 0.5) * cell : -(dLand[c] - 0.5) * cell;
  const sd = boxBlur(sdRaw, G, 2); // costa suave para a amostragem bilinear
  const height = new Float32Array(N);
  const biome = new Uint8Array(N);
  const seed = map.options.seed | 0;
  const lv = map.lava;
  const dLava = lv ? distanceTransform(lv.mask, G) : null;
  for (let j = 0; j < G; j++) {
    const z = (j + 0.5) * cell - half;
    for (let i = 0; i < G; i++) {
      const c = j * G + i, x = (i + 0.5) * cell - half;
      const d = sd[c];
      if (!land[c]) {
        height[c] = 0.55 - Math.min(4.1, Math.max(0, -d) * 0.32);
        biome[c] = BIOME.SEA;
        continue;
      }
      const e = entities[owner[c]] ?? entities[0];
      const dd = Math.max(0, d);
      let h = 0.72 + Math.min(1.88, dd * 0.42);
      h += (fbm(x * 0.09, z * 0.09, seed + 7, 3) - 0.5) * 0.35 * smoothstep(1, 5, dd);
      let b = BIOME.GRASS;
      const beach = e.kind === 'continent' ? 1.7 : e.biome === 'tropical' || e.biome === 'atoll' || e.kind === 'islet' ? 2.4 : 1.2;
      const nz = fbm(x * 0.05, z * 0.05, seed + 21, 4);
      const nz2 = fbm(x * 0.11 + 40, z * 0.11 - 9, seed + 33, 3);
      const zn = (z - e.cz) / (e.rz || 1);
      if (e.biome === 'lush') {
        const ridge = 1 - Math.abs(fbm(x * 0.035, z * 0.035, seed + 41, 4) * 2 - 1);
        const north = smoothstep(0.05, -0.45, zn);
        const mount = smoothstep(0.62, 0.86, ridge) * smoothstep(7, 18, dd) * north;
        h += mount * 3.4;
        b = h > 4.0 ? BIOME.SNOW : h > 3.35 ? BIOME.ROCK : (zn > 0.12 && nz > 0.5) ? BIOME.SAVANNA : nz2 > 0.56 && dd > 4 ? BIOME.FOREST : BIOME.GRASS;
      } else if (e.biome === 'arid') {
        const dune = Math.sin((x * 0.9 + z * 0.35) * 0.22 + nz * 6) * 0.5 + 0.5;
        h += dune * 0.25 * smoothstep(2, 8, dd);
        const rockN = fbm(x * 0.07 - 31, z * 0.07 + 12, seed + 55, 3);
        if (rockN > 0.66 && dd > 6) { b = BIOME.ROCK; h += (rockN - 0.66) * 6; }
        else if (nz2 > 0.64 && dd < 16) b = BIOME.SWAMP;
        else if (nz > 0.55) b = BIOME.STEPPE;
        else b = BIOME.DESERT;
      } else if (e.biome === 'volcanic') {
        const rc = Math.hypot(x - e.cx, z - e.cz) / Math.max(e.rx, e.rz);
        h += 3.4 * Math.pow(Math.max(0, 1 - rc * 1.15), 1.3) - 1.2 * smoothstep(0.2, 0, rc);
        b = rc < 0.62 || nz > 0.62 ? BIOME.VOLCANIC : BIOME.ROCK;
      } else if (e.biome === 'rocky') {
        b = nz > 0.64 && dd > 3 ? BIOME.GRASS : BIOME.ROCK;
        h += (fbm(x * 0.12, z * 0.12, seed + 63, 3) - 0.4) * 2 * smoothstep(2, 7, dd);
      } else if (e.biome === 'ice') {
        b = dd < 2.2 ? BIOME.ICE : nz > 0.62 ? BIOME.ROCK : BIOME.SNOW;
      } else if (e.biome === 'swamp') {
        b = nz > 0.6 ? BIOME.GRASS : BIOME.SWAMP;
      } else if (e.biome === 'atoll') {
        b = dd > 3.4 && nz > 0.45 ? BIOME.GRASS : BIOME.SAND;
      } else { // tropical, islet
        b = dd > 3.2 ? BIOME.GRASS : BIOME.SAND;
      }
      if (dd < beach && b !== BIOME.LAVA) b = e.biome === 'ice' ? BIOME.ICE : e.biome === 'swamp' && nz2 > 0.5 ? BIOME.SWAMP : BIOME.SAND;
      if (lv) {
        if (lv.mask[c]) { h = LAVA_HEIGHT; b = BIOME.LAVA; } // lava: nem terrestre (< 0,65) nem naval (> 0,1)
        else if (lv.passage[c]) { h = Math.max(h, 1.05); b = BIOME.ROCK; } // passagem = rocha resfriada, caminhável
        else if (dLava[c] <= 3 && b !== BIOME.SAND) b = BIOME.VOLCANIC; // cinza/basalto ao redor do fluxo
      }
      height[c] = h;
      biome[c] = b;
    }
  }
  map.sd = sd; map.height = height; map.biome = biome;
}

// ---------------------------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------------------------
/**
 * Perímetro (em células) pela fórmula de Cauchy–Crofton com 4 direções (0°, 90°, 45°, 135°): `P = π/8 · Σ dᵢ·Nᵢ`.
 * Fora da grade conta como água. Estimador sem o viés de "escada" da contagem de arestas.
 */
export function crofton(mask, G, value = 1) {
  const at = (i, j) => (i < 0 || j < 0 || i >= G || j >= G ? 0 : mask[j * G + i] === value ? 1 : 0);
  let n0 = 0, n90 = 0, n45 = 0, n135 = 0;
  for (let j = -1; j < G; j++) {
    for (let i = -1; i < G; i++) {
      const a = at(i, j);
      if (a !== at(i + 1, j)) n0++;
      if (a !== at(i, j + 1)) n90++;
      if (a !== at(i + 1, j + 1)) n45++;
      if (at(i + 1, j) !== at(i, j + 1)) n135++;
    }
  }
  return (Math.PI / 8) * (n0 + n90 + (n45 + n135) / Math.SQRT2);
}

/**
 * Índice de irregularidade = perímetro / perímetro de um disco de mesma área (1 = círculo; quadrado ≈ 1,13; costa natural ≳ 1,6).
 * `perimetro/√área` normalizado por `2√π`, o que o torna independente de escala. Por componente; devolve o agregado.
 * @returns {{ all: number, weighted: number, largest: number, components: {area:number, perimeter:number, index:number}[] }} áreas/perímetros em células
 */
export function irregularityIndex(mask, G) {
  const { labels, sizes } = labelComponents(mask, G, 1);
  const comps = [];
  for (let id = 0; id < sizes.length; id++) {
    const m = new Uint8Array(G * G);
    for (let c = 0; c < m.length; c++) if (labels[c] === id) m[c] = 1;
    const perimeter = crofton(m, G, 1);
    comps.push({ area: sizes[id], perimeter, index: perimeter / (2 * Math.sqrt(Math.PI * sizes[id])) });
  }
  const real = comps.filter((c) => c.area >= 20);
  const sumP = real.reduce((s, c) => s + c.perimeter, 0);
  const sumD = real.reduce((s, c) => s + 2 * Math.sqrt(Math.PI * c.area), 0);
  const largest = comps.reduce((b, c) => (c.area > (b?.area ?? 0) ? c : b), null);
  const big = comps.filter((c) => c.area >= 150);
  const bigArea = big.reduce((s2, c) => s2 + c.area, 0);
  const weighted = bigArea ? big.reduce((s2, c) => s2 + c.index * c.area, 0) / bigArea : 0; // ponderado por área (ignora ilhotas < 150 células)
  return { all: sumD ? sumP / sumD : 0, weighted, largest: largest?.index ?? 0, components: comps };
}

/** Fechamento morfológico (dilata `r` células e erode `r`): funde canais/rios estreitos e ilhotas coladas → contorno EXTERNO da massa de terra. */
export function closeMask(mask, G, r = 6) {
  const dl = distanceTransform(mask, G);
  const dil = new Uint8Array(mask.length);
  for (let c = 0; c < dil.length; c++) dil[c] = dl[c] <= r ? 1 : 0;
  const inv = new Uint8Array(mask.length);
  for (let c = 0; c < inv.length; c++) inv[c] = dil[c] ? 0 : 1;
  // fora da grade conta como água: borda é "não-dilatado"
  for (let i = 0; i < G; i++) { inv[i] = 1; inv[(G - 1) * G + i] = 1; inv[i * G] = 1; inv[i * G + G - 1] = 1; }
  const de = distanceTransform(inv, G);
  const out = new Uint8Array(mask.length);
  for (let c = 0; c < out.length; c++) out[c] = dil[c] && de[c] > r ? 1 : 0;
  return out;
}

/**
 * Índice "externo" (só para os mapas ATUAIS): irregularidade do contorno da massa de terra depois de fechar rios/canais (raio `r`
 * células) e de descartar componentes com menos de `minCells`; ponderado pela ÁREA. Serve para tirar o rio do `continental-1v1`
 * da conta (o rio inflava o perímetro). NÃO usar nos mapas novos: o fechamento fundiria ilhas separadas por canais estreitos.
 */
export function outerIrregularity(mask, G, { r = 10, minCells = 150 } = {}) {
  const closed = closeMask(mask, G, r);
  const idx = irregularityIndex(closed, G);
  const real = idx.components.filter((c) => c.area >= minCells);
  const area = real.reduce((s, c) => s + c.area, 0);
  return { weighted: area ? real.reduce((s, c) => s + c.index * c.area, 0) / area : 0, components: real.length, largest: idx.largest };
}

/**
 * Dimensão fractal da costa por contagem de caixas (box-counting) em escalas 2..32 células: curvas lisas/polígonos ≈ 1,0;
 * costas naturais ≈ 1,1–1,3. Insensível a rios e canais lisos (que inflam o índice perímetro/área), por isso é a 2ª métrica.
 */
export function coastFractalDimension(mask, G, scales = [2, 3, 4, 6, 8, 12, 16, 24, 32]) {
  const edge = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const c = j * G + i;
    if (!mask[c]) continue;
    if (i === 0 || j === 0 || i === G - 1 || j === G - 1 || !mask[c - 1] || !mask[c + 1] || !mask[c - G] || !mask[c + G]) edge.push(i, j);
  }
  const xs = [], ys = [];
  for (const sc of scales) {
    const seen = new Set();
    for (let k = 0; k < edge.length; k += 2) seen.add(Math.floor(edge[k + 1] / sc) * 4096 + Math.floor(edge[k] / sc));
    xs.push(Math.log(1 / sc)); ys.push(Math.log(seen.size));
  }
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let k = 0; k < n; k++) { num += (xs[k] - mx) * (ys[k] - my); den += (xs[k] - mx) ** 2; }
  return den ? num / den : 0;
}

/** Máscara terra/água de um mapa do jogo (`mapDef`) amostrando `heightFn(mapDef, x, z) >= 0,65` numa grade `G × G` sobre `size`. */
export function landMaskFromHeight(mapDef, heightFn, G = 256) {
  const mask = new Uint8Array(G * G);
  const cell = mapDef.size / G;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    if (heightFn(mapDef, (i + 0.5) * cell - mapDef.size / 2, (j + 0.5) * cell - mapDef.size / 2) >= LAND_HEIGHT) mask[j * G + i] = 1;
  }
  return mask;
}

/** Estatísticas do mapa gerado (usadas pelo teste e pelo relatório). */
export function analyzeMap(map) {
  const { grid: G, cell, land, owner, entities } = map;
  const N = G * G;
  const cells = land.reduce((s, v) => s + v, 0);
  const comp = labelComponents(land, G, 1);
  const perEntity = entities.map((e) => {
    const ids = new Set();
    for (let c = 0; c < N; c++) if (owner[c] === e.index && land[c]) ids.add(comp.labels[c]);
    const m = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (owner[c] === e.index) m[c] = 1;
    return { id: e.id, kind: e.kind, biome: e.biome, components: ids.size, area: e.area, index: irregularityIndex(m, G).largest };
  });
  // rota naval: água com ≥ 2 células da terra deve formar (quase) um só componente ligado ao oceano
  const dLand = distanceTransform(land, G);
  const nav = new Uint8Array(N);
  for (let c = 0; c < N; c++) nav[c] = !land[c] && dLand[c] >= 2 ? 1 : 0;
  const nl = labelComponents(nav, G, 1);
  const navTotal = nl.sizes.reduce((s, v) => s + v, 0);
  const mainNav = nl.sizes.indexOf(Math.max(...nl.sizes));
  const reach = (e) => {
    for (let c = 0; c < N; c++) {
      if (owner[c] !== e.index || !land[c]) continue;
      const i = c % G, j = (c - i) / G;
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < G && jj < G && nl.labels[jj * G + ii] === mainNav) return true;
      }
    }
    return false;
  };
  return {
    landFraction: cells / N,
    landComponents: comp.sizes.length,
    entityComponents: perEntity.map((p) => p.components),
    perEntity,
    lakes: map.lakes,
    smallestLake: map.lakes.length ? Math.min(...map.lakes) : Infinity,
    seaMainFraction: navTotal ? nl.sizes[mainNav] / navTotal : 0,
    allEntitiesReachableBySea: entities.every(reach),
    irregularity: irregularityIndex(land, G),
    fractalDim: coastFractalDimension(land, G),
    lava: lavaStats(map),
    cell
  };
}

/**
 * Converte o mapa gerado pelo irregularCoast em uma definição de mapa jogável ("painted") com suporte a lavaGrid.
 * @param {object} map  resultado de generateIrregularCoast
 * @param {object} [opts]  configurações do mapa (id, name, tileset, startSlots, resources, etc.)
 * @returns {object} mapDef completo no formato aceito pelo jogo
 */
export function bakeToMapDef(map, {
  id = 'costa-irregular-1',
  name = 'Costa Irregular',
  tileset = 'vulcanico',
  cell = 1,
  playable = 180,
  maxPlayers = 2,
  startSlots = null,
  resources = null,
  forests = null,
  fords = [],
  neutrals = []
} = {}) {
  const size = map.size;
  const G = map.grid;
  const nodes = paintedNodes(size, cell);
  const heights = new Int8Array(nodes * nodes);
  const lavaData = map.lava ? new Uint8Array(nodes * nodes) : null;

  for (let j = 0; j < nodes; j++) {
    const z = -size / 2 + j * cell;
    const gz = Math.max(0, Math.min(G - 1, ((z + size / 2) / size) * (G - 1)));
    const j0 = Math.floor(gz);
    const j1 = Math.min(G - 1, j0 + 1);
    const tz = gz - j0;

    for (let i = 0; i < nodes; i++) {
      const x = -size / 2 + i * cell;
      const gx = Math.max(0, Math.min(G - 1, ((x + size / 2) / size) * (G - 1)));
      const i0 = Math.floor(gx);
      const i1 = Math.min(G - 1, i0 + 1);
      const tx = gx - i0;

      const h00 = map.height[j0 * G + i0];
      const h10 = map.height[j0 * G + i1];
      const h01 = map.height[j1 * G + i0];
      const h11 = map.height[j1 * G + i1];
      const top = h00 + (h10 - h00) * tx;
      const bot = h01 + (h11 - h01) * tx;
      const h = top + (bot - top) * tz;

      const gi = Math.round(gx);
      const gj = Math.round(gz);
      const isLava = map.lava ? map.lava.mask[gj * G + gi] === 1 : false;

      if (isLava) {
        if (lavaData) lavaData[j * nodes + i] = 1;
        heights[j * nodes + i] = toH10(LAVA_HEIGHT);
      } else {
        heights[j * nodes + i] = toH10(h);
      }
    }
  }

  // Se startSlots não foram fornecidos, deriva 2 slots nos continentes/áreas habitáveis
  const slots = startSlots || [
    { x: Math.round(-size * 0.28), z: 0 },
    { x: Math.round(size * 0.28), z: 0 }
  ];

  const res = resources || [
    { type: 'gold', x: slots[0].x + 10, z: slots[0].z + 6, amount: 20000 },
    { type: 'gold', x: slots[1].x - 10, z: slots[1].z - 6, amount: 20000 }
  ];

  const forst = forests || [
    { species: 'oak', x: slots[0].x - 6, z: slots[0].z - 12, count: 24, radius: 8 },
    { species: 'oak', x: slots[1].x + 6, z: slots[1].z + 12, count: 24, radius: 8 }
  ];

  return {
    id,
    name,
    size,
    playable,
    waterLevel: 0.5,
    tileset,
    maxPlayers,
    terrain: {
      generator: 'painted',
      params: {
        cell,
        nodes,
        data: encodeHeights(heights)
      }
    },
    ...(lavaData ? {
      lavaGrid: {
        cell,
        nodes,
        data: encodeLavaGrid(lavaData)
      }
    } : {}),
    startSlots: slots,
    resources: res,
    forests: forst,
    fords,
    neutrals
  };
}
