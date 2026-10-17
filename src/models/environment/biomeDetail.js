/**
 * src/models/environment/biomeDetail.js (M2-19) — textura de DETALHE procedural dos biomas fracos (rocha, vulcânico, pântano, gelo/neve).
 *
 * O splat do terreno (`splatPaint.js`) é UMA textura para o mapa inteiro (≈ 4,6 px/u num mapa de 224 u): só carrega a cor por bioma e fica
 * borrada de perto. O detalhe vive à parte, numa textura pequena que SE REPETE pelo mundo e é misturada no shader do terreno (sem nenhuma
 * malha ou chamada de desenho a mais):
 *   - o ATLAS (`paintDetailAtlas`): RGBA ladrilhável, um canal por padrão — R rocha (estratos, rachaduras, granulado), G vulcânico
 *     (fissuras largas, cinza, pontos de brasa fria), B pântano (manchas de lama, umidade), A gelo/neve (veios, rachaduras finas, grão);
 *   - os PESOS (`detailWeightsOfRegions`): uma textura n×n (um nó por célula do `biomeGrid`) que diz quanto de cada padrão vale em cada
 *     ponto (a interpolação bilinear da GPU suaviza a fronteira entre biomas).
 * O lado do atlas segue `?texq=` (low 256, med 512, high 1024, ultra limitado a 1024). Puro (sem three/DOM) e determinístico (sem
 * `Math.random`): `tests/unit/biomeDetail.test.js`.
 */

import { BIOME } from '../../data/maps/biome.js';

/** Canais do atlas e dos pesos. */
export const DETAIL_CHANNEL = Object.freeze({ ROCK: 0, VOLCANIC: 1, SWAMP: 2, ICE: 3 });

/**
 * Peso de cada padrão por estilo (tileset ou variante). Estilo fora da tabela = sem detalhe. A neve (`inverno`) leva o padrão de gelo a
 * 75 % (grão e veios sutis); o gelo (`inverno:gelo`) a 100 %.
 */
export const DETAIL_STYLE_WEIGHTS = Object.freeze({
  pedregoso: Object.freeze([1, 0, 0, 0]),
  vulcanico: Object.freeze([0, 1, 0, 0]),
  pantano: Object.freeze([0, 0, 1, 0]),
  inverno: Object.freeze([0, 0, 0, 0.75]),
  'inverno:gelo': Object.freeze([0, 0, 0, 1])
});

/** Lado do ladrilho do atlas no mundo (u) e do segundo ladrilho (quebra a repetição), em múltiplos do primeiro. */
export const DETAIL_TILE_WORLD = 14;

export const DETAIL_ATLAS_SIDES = Object.freeze({ low: 256, med: 512, high: 1024, ultra: 1024 });

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function hash(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tabelas de reticulado (valor por nó e ponto de Voronoi por célula), memorizadas por (período, semente): a pintura só consulta. */
const _lat = new Map();
function lattice(P, seed) {
  const key = P * 100003 + seed;
  let t = _lat.get(key);
  if (!t) {
    t = new Float32Array(P * P);
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) t[y * P + x] = hash(x, y, seed);
    _lat.set(key, t);
  }
  return t;
}

/** Ruído de valor LADRILHÁVEL (período `P` células): coordenadas (u, v) em [0, 1). */
function tnoise(u, v, P, seed) {
  const T = lattice(P, seed);
  const x = u * P, y = v * P;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % P) + P) % P, x1 = x0 + 1 === P ? 0 : x0 + 1, y0 = ((iy % P) + P) % P, y1 = y0 + 1 === P ? 0 : y0 + 1;
  const a = T[y0 * P + x0], b = T[y0 * P + x1], c = T[y1 * P + x0], d = T[y1 * P + x1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Soma de oitavas (frequência ×2, amplitude ×0,5), normalizada em 0..1. */
function fbm(u, v, P, oct, seed) {
  let sum = 0, amp = 0.5, tot = 0, p = P;
  for (let o = 0; o < oct; o++) {
    sum += amp * tnoise(u, v, p, seed + o * 17);
    tot += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / tot;
}

/** Voronoi ladrilhável de `P × P` células: devolve `[F1, F2]` (distâncias, em células, aos dois pontos mais próximos). */
const _vpt = new Map();
function vpoints(P, seed) {
  const key = P * 100003 + seed;
  let t = _vpt.get(key);
  if (!t) {
    t = new Float32Array(P * P * 2);
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        t[(y * P + x) * 2] = 0.15 + 0.7 * hash(x, y, seed);
        t[(y * P + x) * 2 + 1] = 0.15 + 0.7 * hash(x, y, seed + 101);
      }
    }
    _vpt.set(key, t);
  }
  return t;
}
function voronoi(u, v, P, seed, out) {
  const T = vpoints(P, seed);
  const x = (u - Math.floor(u)) * P, y = (v - Math.floor(v)) * P;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let dy = -1; dy <= 1; dy++) {
    const cy = iy + dy;
    const wy = cy < 0 ? cy + P : cy >= P ? cy - P : cy;
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const wx = cx < 0 ? cx + P : cx >= P ? cx - P : cx;
      const o = (wy * P + wx) * 2;
      const ex = cx + T[o] - x, ey = cy + T[o + 1] - y;
      const d = Math.sqrt(ex * ex + ey * ey);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  out[0] = f1; out[1] = f2;
}

const _vor = [0, 0];

/** Rocha: estratos ondulados, rachaduras parciais (arestas de Voronoi em duas escalas), lascas e granulado. 0..1 (0,5 neutro; baixo = fresta). */
function rockPattern(u, v) {
  const warp = fbm(u, v, 3, 3, 11) - 0.5;
  const warp2 = fbm(u + 0.31, v + 0.17, 5, 3, 12) - 0.5;
  // estratos: faixas quase horizontais bem deformadas, de amplitude variável
  const band = Math.sin((v * 8 + warp * 2.4 + warp2 * 0.8) * Math.PI * 2) * 0.5 + 0.5;
  const strata = (band - 0.5) * 0.10 * (0.4 + fbm(u, v, 4, 2, 14)) + (fbm(u, v, 10, 3, 13) - 0.5) * 0.14;
  // blocos fraturados: duas escalas de rachadura, ambas PARCIAIS (máscara de ruído) para não virarem um ladrilho regular
  voronoi(u + warp * 0.14 + warp2 * 0.05, v + warp2 * 0.12, 5, 21, _vor);
  const edgeA = _vor[1] - _vor[0];
  voronoi(u + warp2 * 0.10, v + warp * 0.08, 12, 23, _vor);
  const edgeB = _vor[1] - _vor[0];
  const maskA = smooth(0.30, 0.62, fbm(u, v, 3, 3, 27));
  const maskB = smooth(0.42, 0.72, fbm(u, v, 5, 3, 29));
  const crack = (1 - smooth(0.0, 0.10, edgeA)) * (0.25 + 0.75 * maskA) * 0.9 + (1 - smooth(0.0, 0.07, edgeB)) * maskB * 0.55;
  // lascas: cada bloco com um tom próprio (usa a célula do Voronoi pela posição deformada)
  const slab = (tnoise(u + warp * 0.1, v, 14, 5) - 0.5) * 0.12;
  const mottle = (fbm(u, v, 7, 4, 15) - 0.5) * 0.22;
  const grain = (tnoise(u, v, 128, 31) - 0.5) * 0.14 + (tnoise(u, v, 48, 33) - 0.5) * 0.12;
  return clamp01(0.55 + strata + slab + mottle + grain - Math.min(1, crack) * 0.34);
}

/** Vulcânico: fissuras largas e ramificadas, cinza em manchas, crosta escura e pontos claros de cinza fina. */
function volcanicPattern(u, v) {
  const warp = fbm(u, v, 4, 3, 41) - 0.5;
  const warp2 = fbm(u + 0.2, v + 0.6, 7, 3, 42) - 0.5;
  voronoi(u + warp * 0.18 + warp2 * 0.05, v + warp * 0.12 + warp2 * 0.05, 4, 43, _vor);
  const edgeA = _vor[1] - _vor[0] + (tnoise(u, v, 40, 47) - 0.5) * 0.08;
  voronoi(u + warp2 * 0.12, v + warp * 0.06, 9, 44, _vor);
  const edgeB = _vor[1] - _vor[0];
  const maskA = smooth(0.34, 0.60, fbm(u, v, 3, 3, 46));
  const maskB = smooth(0.46, 0.72, fbm(u, v, 5, 3, 48));
  const fissure = (1 - smooth(0.0, 0.17, edgeA)) * (0.3 + 0.7 * maskA) + (1 - smooth(0.0, 0.09, edgeB)) * maskB * 0.5;
  const core = (1 - smooth(0.0, 0.05, edgeA)) * (0.3 + 0.7 * maskA);
  const ash = (fbm(u, v, 6, 4, 45) - 0.5) * 0.46;
  const crust = (tnoise(u, v, 64, 49) - 0.5) * 0.20 + (tnoise(u, v, 160, 51) - 0.5) * 0.14;
  const speck = smooth(0.80, 0.95, fbm(u, v, 90, 2, 53)) * 0.30; // cinza clara
  return clamp01(0.52 + ash + crust + speck - Math.min(1, fissure) * 0.24 - core * 0.20);
}

/** Pântano: manchas de lama escuras de borda mole, tufos escuros, poças e umidade irregular. */
function swampPattern(u, v) {
  const blob = fbm(u, v, 5, 4, 61);
  const mud = smooth(0.44, 0.60, blob); // 0 = relva úmida, 1 = lama
  const puddle = smooth(0.68, 0.76, fbm(u, v, 9, 3, 63)); // poça rasa (um pouco mais clara)
  const wet = (fbm(u, v, 24, 3, 65) - 0.5) * 0.46;
  const fine = (tnoise(u, v, 110, 67) - 0.5) * 0.20;
  const ring = smooth(0.38, 0.44, blob) * (1 - smooth(0.44, 0.50, blob)) * 0.14; // borda úmida mais escura
  const tuft = smooth(0.66, 0.80, fbm(u, v, 40, 2, 69)) * 0.22; // tufos de capim morto: pontos escuros
  return clamp01(0.55 + wet + fine - mud * 0.30 - ring - tuft + puddle * 0.12);
}

/** Gelo/neve: veios claros (ruído em crista), rachaduras finas escuras e parciais, grão de neve. */
function icePattern(u, v) {
  const warp = fbm(u, v, 3, 3, 81) - 0.5;
  const r1 = Math.abs(fbm(u + warp * 0.12, v, 5, 3, 83) - 0.5);
  const vein = 1 - smooth(0.0, 0.035, r1);
  voronoi(u + warp * 0.12, v + warp * 0.08, 5, 85, _vor);
  const edge = _vor[1] - _vor[0];
  const mask = smooth(0.40, 0.66, fbm(u, v, 4, 3, 86));
  const crack = (1 - smooth(0.0, 0.05, edge)) * (0.2 + 0.8 * mask);
  const frost = (fbm(u, v, 10, 3, 87) - 0.5) * 0.18;
  const grain = (tnoise(u, v, 150, 89) - 0.5) * 0.16 + (tnoise(u, v, 60, 91) - 0.5) * 0.08;
  return clamp01(0.58 + frost * 1.3 + grain * 1.3 + vein * 0.20 - crack * 0.34);
}

const PATTERNS = [rockPattern, volcanicPattern, swampPattern, icePattern];

/** Lado máximo em que os padrões são CALCULADOS; acima disso (high) o atlas é reamostrado e ganha só grão fino (load barato). */
const COMPUTE_SIDE = 512;

function paintDirect(data, side, channels) {
  for (let py = 0; py < side; py++) {
    const v = (py + 0.5) / side;
    for (let px = 0; px < side; px++) {
      const u = (px + 0.5) / side;
      const o = (py * side + px) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = channels[k] ? Math.round(PATTERNS[k](u, v) * 255) : 128;
    }
  }
}

/**
 * Pinta o atlas de detalhe (RGBA, `side × side`, ladrilhável). `channels[k]` falso = canal `k` neutro (128, não calculado).
 * Até 512 px os padrões são calculados pixel a pixel; em 1024 (high) calcula-se em 512, reamostra-se (bilinear, com volta) e soma-se
 * grão fino por texel (o custo de load fica ≈ o do med).
 * @param {Uint8Array|Uint8ClampedArray} data  `side * side * 4` bytes
 * @param {number} side
 * @param {boolean[]} [channels]
 */
export function paintDetailAtlas(data, side, channels = [true, true, true, true]) {
  if (side <= COMPUTE_SIDE) {
    paintDirect(data, side, channels);
    return data;
  }
  const S = COMPUTE_SIDE;
  const src = new Uint8Array(S * S * 4);
  paintDirect(src, S, channels);
  const k = S / side;
  for (let py = 0; py < side; py++) {
    const fy = (py + 0.5) * k - 0.5;
    const y0 = Math.floor(fy), ty = fy - y0;
    const ya = ((y0 % S) + S) % S, yb = (ya + 1) % S;
    for (let px = 0; px < side; px++) {
      const fx = (px + 0.5) * k - 0.5;
      const x0 = Math.floor(fx), tx = fx - x0;
      const xa = ((x0 % S) + S) % S, xb = (xa + 1) % S;
      const o = (py * side + px) * 4;
      const u = (px + 0.5) / side, v = (py + 0.5) / side;
      const g = (tnoise(u, v, 256, 97) - 0.5) * 22;
      for (let c = 0; c < 4; c++) {
        if (!channels[c]) { data[o + c] = 128; continue; }
        const a = src[(ya * S + xa) * 4 + c], b = src[(ya * S + xb) * 4 + c];
        const cc = src[(yb * S + xa) * 4 + c], d = src[(yb * S + xb) * 4 + c];
        const top = a + (b - a) * tx, bot = cc + (d - cc) * tx;
        const val = top + (bot - top) * ty + g;
        data[o + c] = val < 0 ? 0 : val > 255 ? 255 : Math.round(val);
      }
    }
  }
  return data;
}

/** Pesos de detalhe do estilo (4 números 0..1) ou `null` sem detalhe. */
export function detailWeightsOfStyle(def) {
  if (!def) return null;
  return DETAIL_STYLE_WEIGHTS[def.id] || null;
}

/** Canais que algum estilo da lista usa (para pintar só o necessário). */
export function detailChannelsOf(defs) {
  const ch = [false, false, false, false];
  for (const d of defs) {
    const w = detailWeightsOfStyle(d);
    if (w) for (let k = 0; k < 4; k++) if (w[k] > 0) ch[k] = true;
  }
  return ch;
}

/**
 * Textura de pesos de um mapa regional: um nó do `biomeGrid` = um texel RGBA (peso × 255). Usa os campos de peso por estilo do
 * `RegionMap` (`_tight`, soma 1, o mesmo que o splat usa), então a transição de bioma acompanha a do chão.
 * @param {import('../../data/biomeRegions.js').RegionMap} regions
 * @returns {{ n: number, data: Uint8Array }|null}  `null` se nenhum estilo do mapa tem detalhe
 */
export function detailWeightsOfRegions(regions) {
  const K = regions.styleCount;
  const sw = regions.styles.map((s) => detailWeightsOfStyle(s.def));
  if (!sw.some(Boolean)) return null;
  const n = regions.nodes;
  const F = regions._tight;
  const bio = regions.biome;
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    // mar sem detalhe; areia (praia que herdou o estilo da terra vizinha) com 40 %: rachaduras de rocha não cortam a praia
    const base = bio[i] === BIOME.SEA ? 0 : bio[i] === BIOME.SAND ? 0.4 : 1;
    if (base === 0) continue;
    let r = 0, g = 0, b = 0, a = 0;
    for (let k = 0; k < K; k++) {
      const w = sw[k];
      if (!w) continue;
      const f = F[k][i];
      r += f * w[0] * base; g += f * w[1] * base; b += f * w[2] * base; a += f * w[3] * base;
    }
    const o = i * 4;
    data[o] = Math.round(clamp01(r) * 255);
    data[o + 1] = Math.round(clamp01(g) * 255);
    data[o + 2] = Math.round(clamp01(b) * 255);
    data[o + 3] = Math.round(clamp01(a) * 255);
  }
  return { n, data };
}

/** `?terraindetail=0` desliga o detalhe (comparação A/B e medição); no Node (sem `location`) fica ligado. */
export function terrainDetailEnabled(search) {
  try {
    const s = search !== undefined ? search : (globalThis.location ? globalThis.location.search : '');
    return new URLSearchParams(s).get('terraindetail') !== '0';
  } catch (e) {
    return true;
  }
}
