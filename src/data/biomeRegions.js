/**
 * src/data/biomeRegions.js (MUNDO-5 · MUNDO-TERRENO-MAPAS §3.3) — mapa de REGIÕES de bioma para o render.
 *
 * Puro (sem three/DOM): lê `mapDef.biomeGrid` (`src/data/maps/biome.js`) e devolve, por posição de mundo, o ESTILO visual
 * (`biomeStyles.js`: um tileset ou variante) e os PESOS de mistura entre estilos. O `mapDef.tileset` continua sendo o estilo BASE
 * (índice 0: água, céu, grade de cor, e o que herda: mar longe da costa); o `biomeGrid` escolhe a paleta/splat, as árvores, as
 * decorações e a cor da água por região. Mapa SEM `biomeGrid` ⇒ `getRegionMap` devolve `null` e todo o render segue o caminho antigo.
 *
 * Mistura (§3.3: "smoothstep + ruído na fronteira"): o indicador de cada estilo (1 nas células que votam nele) é suavizado por um
 * borrão de caixa; os pesos são normalizados entre os estilos que votam (mar e areia não votam: adotam o estilo da terra vizinha) e
 * o que fica sem voto por perto cai no estilo base (rampa de cobertura). O ruído de fronteira é aplicado por quem pinta (desloca a
 * posição consultada); `weightsAt` só afia a transição com um `smoothstep` por estilo.
 *
 * Não entra na sim nem no checksum (o `biomeGrid` é dado do mapa, só leitura).
 */
import { smoothstep, getTileset, getMapTileset, tilesetOverrideActive } from './tilesets.js';
import { BIOME, MAX_BIOME_ID, gridOfBiome } from './maps/biome.js';
import { paintedNodes } from './maps/painted.js';
import { chamferDistance } from './distanceField.js';
import { BIOME_TO_STYLE, getStyleDef, regionalBaseDef } from './biomeStyles.js';

const NONE = 255;
/** Mistura de terra: borrão com suporte ≈ ±2 células; a areia e o mar a até 6 células da terra adotam o estilo dela. */
const TIGHT = { r: 1, passes: 2, lo: 0.04, hi: 0.5, fill: 6 };
/**
 * Influência regional na água: distância (u) da costa de cada estilo em que ela ainda vale 100 % (`near`) e em que some (`far`);
 * a areia a até `fill` células de um bioma com estilo conta como a terra dele.
 */
const WATER_FADE = { near: 3, far: 14, fill: 6 };

/** `?regions=0` desliga o render regional (comparação A/B e medição de desempenho); no Node (sem `location`) fica ligado. */
export function regionsEnabled(search) {
  try {
    const s = search !== undefined ? search : (globalThis.location ? globalThis.location.search : '');
    return new URLSearchParams(s).get('regions') !== '0';
  } catch (e) {
    return true;
  }
}

/** Hash FNV-1a (32 bits, hex) de bytes e de um texto: chave de cache das texturas regionais. */
function fnv1a(bytes, seed = '') {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

/** Borrão de caixa separável (soma deslizante, borda replicada), `passes` vezes, no próprio vetor `a` (n × n). */
function boxBlur(a, n, r, passes) {
  const w = 2 * r + 1;
  const tmp = new Float32Array(n * n);
  const cl = (v) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      const o = j * n;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[o + cl(k)];
      for (let i = 0; i < n; i++) {
        tmp[o + i] = acc / w;
        acc += a[o + cl(i + r + 1)] - a[o + cl(i - r)];
      }
    }
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[cl(k) * n + i];
      for (let j = 0; j < n; j++) {
        a[j * n + i] = acc / w;
        acc += tmp[cl(j + r + 1) * n + i] - tmp[cl(j - r) * n + i];
      }
    }
  }
  return a;
}

/**
 * Voto de cada nó: índice do estilo do bioma (-1 = não vota: mar/areia). As células que não votam a até `maxDist` células (8-vizinhança)
 * de uma que vota adotam o voto da mais próxima (preenchimento por BFS multifonte): a praia de uma ilha vulcânica é areia escura.
 * `allow` (opcional): só os nós com `allow[i]` truthy podem ser preenchidos (a água não vira terra).
 */
function fillNearest(votes, n, maxDist, allow = null) {
  if (maxDist <= 0) return votes;
  const out = Int16Array.from(votes);
  const dist = new Uint8Array(n * n);
  const queue = new Int32Array(n * n);
  let head = 0, tail = 0;
  for (let i = 0; i < out.length; i++) if (out[i] >= 0) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= maxDist) continue;
    const x = i % n, y = (i - x) / n;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx;
        if (out[j] >= 0 || (allow && !allow[j])) continue;
        out[j] = out[i];
        dist[j] = d + 1;
        queue[tail++] = j;
      }
    }
  }
  return out;
}

/**
 * Campos de peso por estilo (K vetores n × n, soma 1 por célula): indicador borrado, normalizado entre os estilos que votam;
 * sem voto por perto (cobertura baixa) o peso vai para o estilo 0 (base).
 */
function weightFields(bio, n, K, styleOfBiome, { r, passes, lo, hi, fill }) {
  const n2 = n * n;
  const F = new Array(K);
  const used = new Uint8Array(K);
  for (let k = 0; k < K; k++) F[k] = new Float32Array(n2);
  const votes = new Int16Array(n2);
  for (let i = 0; i < n2; i++) { const s = styleOfBiome[bio[i]]; votes[i] = s === NONE ? -1 : s; }
  const filled = fillNearest(votes, n, fill);
  for (let i = 0; i < n2; i++) {
    const s = filled[i];
    if (s >= 0) { F[s][i] = 1; used[s] = 1; }
  }
  for (let k = 0; k < K; k++) if (used[k]) boxBlur(F[k], n, r, passes);
  for (let i = 0; i < n2; i++) {
    let S = 0;
    for (let k = 0; k < K; k++) S += F[k][i];
    if (S <= 1e-6) {
      for (let k = 0; k < K; k++) F[k][i] = 0;
      F[0][i] = 1;
      continue;
    }
    const c = smoothstep(lo, hi, S);
    const inv = c / S;
    for (let k = 0; k < K; k++) F[k][i] *= inv;
    F[0][i] += 1 - c;
  }
  return F;
}

/**
 * Campos de influência regional na ÁGUA (K vetores n × n, soma 1): para cada estilo, `1 − smoothstep(near, far, distância à COSTA
 * dele)`; a costa de um estilo são as células de terra dele (bioma com estilo, mais a areia que o contorna) vizinhas de água: só o que
 * toca o mar tinge o mar (um anel de rocha no meio da ilha não). Vários estilos se somam e, passando de 1, normalizam (sem emenda
 * entre duas zonas de influência); o que sobra vai para o estilo base (mar aberto).
 */
function waterFields(bio, n, K, styleOfBiome, cell, { near, far, fill }) {
  const n2 = n * n;
  const votes = new Int16Array(n2);
  const sandOnly = new Uint8Array(n2);
  for (let i = 0; i < n2; i++) {
    const s = styleOfBiome[bio[i]];
    votes[i] = s === NONE ? -1 : s;
    sandOnly[i] = bio[i] === BIOME.SAND ? 1 : 0;
  }
  const land = fillNearest(votes, n, fill, sandOnly);
  // costa: terra (com estilo) vizinha (8-vizinhança) de água
  const coast = new Uint8Array(n2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (land[k] < 0) continue;
      for (let dy = -1; dy <= 1 && !coast[k]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = i + dx, y = j + dy;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          if (bio[y * n + x] === BIOME.SEA) { coast[k] = 1; break; }
        }
      }
    }
  }
  const A = new Array(K);
  const mask = new Uint8Array(n2);
  for (let k = 0; k < K; k++) {
    A[k] = new Float32Array(n2);
    let any = false;
    for (let i = 0; i < n2; i++) { mask[i] = coast[i] && land[i] === k ? 1 : 0; if (mask[i]) any = true; }
    if (!any) continue;
    const d = chamferDistance(mask, n);
    for (let i = 0; i < n2; i++) A[k][i] = 1 - smoothstep(near, far, d[i] * cell);
  }
  for (let i = 0; i < n2; i++) {
    let sum = 0;
    for (let k = 0; k < K; k++) sum += A[k][i];
    if (sum > 1) { for (let k = 0; k < K; k++) A[k][i] /= sum; sum = 1; }
    A[0][i] += 1 - sum;
  }
  return A;
}

/** Duas tintas de árvore indistinguíveis (RGB a < 20 de distância, mesma dessaturação ±0,05, mesma neve) compartilham material. */
function sameTreeTint(a, b) {
  const ta = a.trees && a.trees.tint, tb = b.trees && b.trees.tint;
  if (!ta || !tb) return !ta && !tb;
  const ca = [(ta.color >> 16) & 255, (ta.color >> 8) & 255, ta.color & 255];
  const cb = [(tb.color >> 16) & 255, (tb.color >> 8) & 255, tb.color & 255];
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) < 20
    && Math.abs((ta.desat || 0) - (tb.desat || 0)) < 0.05
    && (ta.snow || 0) === (tb.snow || 0) && Math.abs((ta.snowAmount || 0) - (tb.snowAmount || 0)) < 0.05;
}

export class RegionMap {
  /**
   * @param {object} mapDef  mapa com `biomeGrid` válido
   * @param {object} baseDef tileset base (não legado) — estilo 0
   */
  constructor(mapDef, baseDef) {
    const bg = mapDef && mapDef.biomeGrid;
    if (!bg) throw new Error('RegionMap: mapa sem biomeGrid');
    this.mapId = mapDef.id || '';
    this.size = mapDef.size || 192;
    this.half = this.size / 2;
    this.cell = bg.cell || 1;
    this.nodes = bg.nodes;
    if (!(this.cell > 0) || this.nodes !== paintedNodes(this.size, this.cell)) throw new Error('RegionMap: biomeGrid com nós incompatíveis');
    const grid = gridOfBiome(bg);
    if (!grid || grid.length !== this.nodes * this.nodes) throw new Error('RegionMap: biomeGrid com dados inválidos');
    this.biome = grid;

    const bio = this._clampedBiomes();
    const present = new Uint8Array(MAX_BIOME_ID + 1);
    for (let i = 0; i < bio.length; i++) present[bio[i]] = 1;

    // Estilos usados no mapa: [0] = base (tileset do mapa; também o estilo do que o `biomeGrid` mapeia para a mesma chave).
    // Só entram os estilos dos biomas que aparecem no grid (poucos: o custo cresce com eles).
    this.styles = [{ key: baseDef.id, def: baseDef, index: 0, area: 0 }];
    const indexOfKey = new Map([[baseDef.id, 0]]);
    this.styleOfBiome = new Uint8Array(MAX_BIOME_ID + 1).fill(NONE);
    for (let id = 0; id <= MAX_BIOME_ID; id++) {
      const key = BIOME_TO_STYLE[id];
      if (key == null || !present[id]) continue;
      const def = getStyleDef(key);
      if (!def) continue;
      let idx = indexOfKey.get(key);
      if (idx === undefined) {
        idx = this.styles.length;
        this.styles.push({ key, def, index: idx, area: 0 });
        indexOfKey.set(key, idx);
      }
      this.styleOfBiome[id] = idx;
    }
    this.styleCount = this.styles.length;
    this.signature = fnv1a(grid, `${baseDef.id}|${this.size}|${this.cell}`);
    /**
     * Classe de tinta de árvore de cada estilo: estilos com tintas indistinguíveis (grama × floresta) compartilham a classe do primeiro,
     * então o `TreeManager` não divide chunks nem cria materiais à toa nas fronteiras entre eles.
     */
    this.treeClass = [];
    for (let k = 0; k < this.styleCount; k++) {
      let cls = k;
      for (let j = 0; j < k; j++) if (this.treeClass[j] === j && sameTreeTint(this.styles[j].def, this.styles[k].def)) { cls = j; break; }
      this.treeClass.push(cls);
    }

    const K = this.styleCount;
    this._tight = weightFields(bio, this.nodes, K, this.styleOfBiome, TIGHT);
    this._wide = null; // sob demanda (só a água usa)

    // Estilo dominante por célula (terra e mar) e área de terra por estilo (para a rugosidade média do material do terreno).
    const n2 = this.nodes * this.nodes;
    this.dominant = new Uint8Array(n2);
    for (let i = 0; i < n2; i++) {
      let best = 0, bw = this._tight[0][i];
      for (let k = 1; k < K; k++) { const w = this._tight[k][i]; if (w > bw) { bw = w; best = k; } }
      this.dominant[i] = best;
      if (bio[i] !== BIOME.SEA) this.styles[best].area++;
    }
    let landArea = 0, rough = 0;
    for (const s of this.styles) { landArea += s.area; rough += s.area * ((s.def.surface && s.def.surface.roughness) || 0.8); }
    /** Rugosidade média (por área de terra) dos estilos: o terreno é UM material, então usa a média. */
    this.roughness = landArea > 0 ? rough / landArea : (baseDef.surface ? baseDef.surface.roughness : 0.8);
    this.landArea = landArea;
  }

  /** Ids de bioma saneados (fora de 0..12 vira mar). */
  _clampedBiomes() {
    const src = this.biome;
    let bad = false;
    for (let i = 0; i < src.length; i++) if (src[i] > MAX_BIOME_ID) { bad = true; break; }
    if (!bad) return src;
    const out = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = src[i] > MAX_BIOME_ID ? 0 : src[i];
    return out;
  }

  _wideFields() {
    if (!this._wide) this._wide = waterFields(this._clampedBiomes(), this.nodes, this.styleCount, this.styleOfBiome, this.cell, WATER_FADE);
    return this._wide;
  }

  /** Índice (linha × nós + coluna) do nó mais próximo de (x, z), preso à grade. */
  cellIndexAt(x, z) {
    const n = this.nodes;
    let i = Math.round((x + this.half) / this.cell);
    let j = Math.round((z + this.half) / this.cell);
    i = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    j = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    return j * n + i;
  }

  /** Id do bioma (`BIOME`) na célula de (x, z), ou `null` fora da grade (mesma regra de `getBiomeAt`). */
  biomeAt(x, z) {
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.nodes || fz >= this.nodes) return null;
    return this.biome[this.cellIndexAt(x, z)];
  }

  /** Índice do estilo dominante em (x, z). */
  styleAt(x, z) {
    return this.dominant[this.cellIndexAt(x, z)];
  }

  /** Classe de tinta de árvore (índice do estilo representante) na célula de (x, z): o que o `TreeManager` usa para dividir chunks/materiais. */
  treeClassAt(x, z) {
    return this.treeClass[this.dominant[this.cellIndexAt(x, z)]];
  }

  /** Definição (tileset/variante) do estilo dominante em (x, z). */
  styleDefAt(x, z) {
    return this.styles[this.dominant[this.cellIndexAt(x, z)]].def;
  }

  /** O estilo `index` é o base (o do tileset do mapa)? */
  isBase(index) {
    return index === 0;
  }

  /**
   * `true` quando (x, z) está longe (≥ ~3 u) de qualquer fronteira entre estilos: ali um estilo só vale, e quem pinta pode pular a
   * mistura e o ruído de fronteira (a maior parte do mapa). Calculado uma vez, sob demanda.
   */
  isInterior(x, z) {
    if (!this._interior) this._interior = this._computeInterior();
    return this._interior[this.cellIndexAt(x, z)] === 1;
  }

  _computeInterior() {
    const n = this.nodes, n2 = n * n, K = this.styleCount, F = this._tight;
    const mixed = new Uint8Array(n2);
    for (let i = 0; i < n2; i++) {
      let mx = 0;
      for (let k = 0; k < K; k++) if (F[k][i] > mx) mx = F[k][i];
      mixed[i] = mx < 0.999 ? 1 : 0;
    }
    const r = Math.ceil(2.6 / this.cell) + 2; // ruído de fronteira (≈ 2,6 u) + bilinear + arredondamento do nó
    const P = new Int32Array(n + 1);
    const horiz = new Uint8Array(n2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) P[i + 1] = P[i] + mixed[j * n + i];
      for (let i = 0; i < n; i++) horiz[j * n + i] = P[Math.min(n - 1, i + r) + 1] - P[Math.max(0, i - r)] > 0 ? 1 : 0;
    }
    const out = new Uint8Array(n2);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) P[j + 1] = P[j] + horiz[j * n + i];
      for (let j = 0; j < n; j++) out[j * n + i] = P[Math.min(n - 1, j + r) + 1] - P[Math.max(0, j - r)] > 0 ? 0 : 1;
    }
    return out;
  }

  /**
   * Pesos de mistura dos estilos em (x, z) (interpolação bilinear dos campos nos nós). Soma 1. Devolve o índice do dominante.
   * @param {number} x
   * @param {number} z
   * @param {Float32Array|number[]} out  tamanho ≥ `styleCount`
   * @param {boolean} [sharp=true]  afia a transição (smoothstep por estilo + renormalização): fronteira firme, não borrada
   * @returns {number} índice do estilo de maior peso
   */
  weightsAt(x, z, out, sharp = true) {
    return this._sample(this._tight, x, z, out, sharp);
  }

  /** Influência regional na ÁGUA (campo largo: o mar adota o estilo da costa vizinha e volta ao base longe dela). */
  waterWeightsAt(x, z, out) {
    return this._sample(this._wideFields(), x, z, out, false);
  }

  /** Índice do estilo que domina a influência na ÁGUA em (x, z) (campo largo): o do vizinho de costa, ou o base longe da terra. */
  waterStyleAt(x, z) {
    if (!this._scratch) this._scratch = new Float32Array(this.styleCount);
    return this._sample(this._wideFields(), x, z, this._scratch, false);
  }

  _sample(F, x, z, out, sharp) {
    const n = this.nodes;
    const K = this.styleCount;
    let fx = (x + this.half) / this.cell;
    let fz = (z + this.half) / this.cell;
    fx = fx < 0 ? 0 : fx > n - 1 ? n - 1 : fx;
    fz = fz < 0 ? 0 : fz > n - 1 ? n - 1 : fz;
    const i0 = Math.min(n - 2, Math.floor(fx));
    const j0 = Math.min(n - 2, Math.floor(fz));
    const tx = fx - i0;
    const tz = fz - j0;
    const o00 = j0 * n + i0, o10 = o00 + 1, o01 = o00 + n, o11 = o01 + 1;
    let best = 0, bw = -1, sum = 0;
    for (let k = 0; k < K; k++) {
      const f = F[k];
      const top = f[o00] + (f[o10] - f[o00]) * tx;
      const bot = f[o01] + (f[o11] - f[o01]) * tx;
      let w = top + (bot - top) * tz;
      if (sharp) w = smoothstep(0.12, 0.88, w);
      out[k] = w;
      sum += w;
      if (w > bw) { bw = w; best = k; }
    }
    if (sum <= 1e-9) {
      for (let k = 0; k < K; k++) out[k] = 0;
      out[0] = 1;
      return 0;
    }
    const inv = 1 / sum;
    for (let k = 0; k < K; k++) out[k] *= inv;
    return best;
  }

  /** Resumo legível (depuração/testes): estilos, área de terra de cada um. */
  describe() {
    return this.styles.map((s) => ({ key: s.key, area: s.area }));
  }
}

const cache = new WeakMap(); // biomeGrid (objeto) → Map(`${base}|${size}` → RegionMap | null)

/**
 * Mapa de regiões de um mapa, ou `null` (⇒ caminho antigo de render) quando: não há `biomeGrid`; `?regions=0`; o tileset foi
 * forçado por `?tileset=`; ou o `biomeGrid` é inválido. Memorizado por `biomeGrid` (todas as views do mesmo mapa compartilham).
 * @param {object} mapDef
 * @param {object|string} [base]  tileset base (definição ou id); padrão: `getMapTileset(mapDef)`. Legado ⇒ vira `exuberante`.
 * @returns {RegionMap|null}
 */
export function getRegionMap(mapDef, base) {
  const bg = mapDef && mapDef.biomeGrid;
  if (!bg || !regionsEnabled() || tilesetOverrideActive()) return null;
  const baseDef = regionalBaseDef(typeof base === 'string' ? getTileset(base) : (base || getMapTileset(mapDef)));
  let per = cache.get(bg);
  if (!per) cache.set(bg, per = new Map());
  const key = `${baseDef.id}|${mapDef.size}`;
  if (per.has(key)) return per.get(key);
  let rm = null;
  try { rm = new RegionMap(mapDef, baseDef); } catch (e) { rm = null; }
  per.set(key, rm);
  return rm;
}
