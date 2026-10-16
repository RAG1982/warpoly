/**
 * src/data/lavaRender.js (MUNDO-5 · MUNDO-TERRENO-MAPAS §3.5, "Visual") — parte PURA do render da lava.
 *
 * A lava é só visual nesta etapa (decisão do dono, 2026-10-11): `Terrain.isLava` e o `Pathfinder` já a tratam como bloqueio sem
 * dano; aqui ficam os números do material emissivo, o campo de distância (brilho no terreno vizinho) e a máscara de células que
 * `world/Lava.js` desenha. Nada daqui entra na sim (a lava continua assada em `mapDef.lavaGrid`, bytes 0/1).
 *
 * Sem three/DOM (testável em Node). Só a `lavaGrid` manda: células de lava = `lavaGrid[...] === 1` (o id `BIOME.LAVA` do `biomeGrid`
 * é só pista de estilo: o chão sob o fluxo pinta como basalto).
 */
import { paintedNodes } from './maps/painted.js';
import { gridOfLava } from './maps/lava.js';
import { smoothstep } from './tilesets.js';
import { chamferDistance } from './distanceField.js';

/** Números do material de lava (§3.5: cor `ff5a1a`, núcleo `ffb347`, borda `8a1c0a`, crosta `2b2528`; `emissiveIntensity` 1,2–1,8 com pulso lento). */
export const LAVA_STYLE = Object.freeze({
  core: 0xffb347,
  mid: 0xff5a1a,
  edge: 0x8a1c0a,
  crust: 0x2b2528,
  /** Altura (y) do plano de lava: acima das ondas (nível d'água 0,5 ± 0,24) para a água, translúcida, nunca cobri-la; a lava assada tem altura 0,4. */
  surfaceY: 0.8,
  emissiveMin: 1.2,
  emissiveMax: 1.8,
  /** Período (s) do pulso lento do brilho. */
  pulsePeriod: 6,
  /** Raio (u) do brilho no terreno vizinho: cor de vértice quente (§3.5: "≤ 3 u da lava"). */
  glowRadius: 3,
  /** Raio (u) da borda incandescente pintada na textura do terreno. */
  rimRadius: 2.2,
  /** Lado (u de mundo) de uma repetição da textura de fluxo. */
  tileWorld: 22,
  /** Velocidade do fluxo em UV/s: as duas camadas correm em sentidos opostos (§3.5). */
  flowEmissive: Object.freeze([0.012, 0.007]),
  flowMap: Object.freeze([-0.007, 0.004])
});

/** Cor (0xRRGGBB) do ponto da borda incandescente no terreno vizinho, para `splatPaint`/`TerrainView`. */
export const LAVA_EMBER = Object.freeze({ rim: 0xd9481c, hot: 0xff7a2a, scorch: 0x3a1c14 });

/** `?lava=0` não desenha a lava emissiva (A/B de desempenho); no Node (sem `location`) fica ligada. */
export function lavaEnabled(search) {
  try {
    const s = search !== undefined ? search : (globalThis.location ? globalThis.location.search : '');
    return new URLSearchParams(s).get('lava') !== '0';
  } catch (e) {
    return true;
  }
}

/** Intensidade emissiva no instante `t` (s): pulso lento senoidal entre `emissiveMin` e `emissiveMax`. */
export function lavaPulse(t, style = LAVA_STYLE) {
  const k = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / style.pulsePeriod);
  return style.emissiveMin + (style.emissiveMax - style.emissiveMin) * k;
}

/** Deslocamento (offset UV, 0..1) das duas camadas de fluxo no instante `t` (s): sentidos opostos. */
export function lavaFlowOffsets(t, style = LAVA_STYLE) {
  const wrap = (v) => v - Math.floor(v);
  return {
    emissive: [wrap(t * style.flowEmissive[0]), wrap(t * style.flowEmissive[1])],
    map: [wrap(t * style.flowMap[0]), wrap(t * style.flowMap[1])]
  };
}

const CAP = 8; // u: acima disso a distância não importa

export class LavaInfo {
  /** @param {object} mapDef  mapa com `lavaGrid` válido */
  constructor(mapDef) {
    const lg = mapDef && mapDef.lavaGrid;
    if (!lg || !lg.data) throw new Error('LavaInfo: mapa sem lavaGrid');
    this.mapId = mapDef.id || '';
    this.size = mapDef.size || 192;
    this.half = this.size / 2;
    this.cell = lg.cell || 1;
    this.nodes = lg.nodes;
    if (!(this.cell > 0) || this.nodes !== paintedNodes(this.size, this.cell)) throw new Error('LavaInfo: lavaGrid com nós incompatíveis');
    const g = gridOfLava(lg);
    if (!g || g.length !== this.nodes * this.nodes) throw new Error('LavaInfo: lavaGrid com dados inválidos');
    this.data = g;
    let count = 0;
    let minI = this.nodes, maxI = -1, minJ = this.nodes, maxJ = -1;
    for (let j = 0; j < this.nodes; j++) {
      for (let i = 0; i < this.nodes; i++) {
        if (g[j * this.nodes + i] !== 1) continue;
        count++;
        if (i < minI) minI = i;
        if (i > maxI) maxI = i;
        if (j < minJ) minJ = j;
        if (j > maxJ) maxJ = j;
      }
    }
    /** Nº de células (nós) de lava. */
    this.count = count;
    /** Caixa (mundo) que contém toda a lava, com folga de uma célula. */
    this.bounds = count
      ? {
        minX: -this.half + (minI - 1) * this.cell, maxX: -this.half + (maxI + 1) * this.cell,
        minZ: -this.half + (minJ - 1) * this.cell, maxZ: -this.half + (maxJ + 1) * this.cell
      }
      : null;
    this._dist = null;
    let h = 0x811c9dc5;
    for (let i = 0; i < g.length; i++) { h ^= g[i]; h = Math.imul(h, 0x01000193); }
    /** Chave de cache das texturas que dependem da lava. */
    this.signature = (h >>> 0).toString(16);
  }

  /** (x, z) cai numa célula de lava? (mesma regra do nó mais próximo de `isLavaAt`) */
  isLavaAt(x, z) {
    const n = this.nodes;
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= n || fz >= n) return false;
    const c = Math.min(n - 1, Math.max(0, Math.round(fx)));
    const r = Math.min(n - 1, Math.max(0, Math.round(fz)));
    return this.data[r * n + c] === 1;
  }

  /** Distância (u) de cada nó à célula de lava mais próxima (0 na lava; chanfro 1/√2; limitada a `CAP`). Sob demanda. */
  _distance() {
    if (this._dist) return this._dist;
    const d = chamferDistance(this.data, this.nodes);
    for (let i = 0; i < d.length; i++) d[i] = Math.min(CAP, d[i] * this.cell);
    this._dist = d;
    return d;
  }

  /** Distância (u, interpolada) de (x, z) à borda visível da lava: 0 dentro dela. */
  distAt(x, z) {
    if (!this.count) return CAP;
    const n = this.nodes;
    const d = this._distance();
    let fx = (x + this.half) / this.cell;
    let fz = (z + this.half) / this.cell;
    fx = fx < 0 ? 0 : fx > n - 1 ? n - 1 : fx;
    fz = fz < 0 ? 0 : fz > n - 1 ? n - 1 : fz;
    const i0 = Math.min(n - 2, Math.floor(fx));
    const j0 = Math.min(n - 2, Math.floor(fz));
    const tx = fx - i0;
    const tz = fz - j0;
    const a = d[j0 * n + i0], b = d[j0 * n + i0 + 1], c = d[(j0 + 1) * n + i0], e = d[(j0 + 1) * n + i0 + 1];
    const top = a + (b - a) * tx;
    const bot = c + (e - c) * tx;
    // a borda visível da lava fica a meia célula do último nó de lava
    return Math.max(0, top + (bot - top) * tz - 0.5 * this.cell);
  }

  /** Calor 0..1 em (x, z): 1 na lava, cai suavemente até 0 a `radius` u dela. */
  heatAt(x, z, radius = LAVA_STYLE.glowRadius) {
    if (!this.count) return 0;
    return 1 - smoothstep(0, radius, this.distAt(x, z));
  }

  /** Máscara RGBA (nós × nós, 255 na lava) para a textura `alphaMap` do plano de lava (linhas na ordem de z crescente). */
  maskRGBA() {
    const n2 = this.nodes * this.nodes;
    const out = new Uint8Array(n2 * 4);
    for (let i = 0; i < n2; i++) {
      const v = this.data[i] === 1 ? 255 : 0;
      out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = v;
    }
    return out;
  }
}

const cache = new WeakMap(); // lavaGrid (objeto) → LavaInfo | null

/**
 * Informação de render da lava de um mapa, ou `null` (⇒ nada de lava é criado) quando não há `lavaGrid`, ela não tem células de lava,
 * está inválida ou `?lava=0`. Memorizada por `lavaGrid` (terreno, água e a malha de lava compartilham).
 * @returns {LavaInfo|null}
 */
export function buildLavaInfo(mapDef) {
  const lg = mapDef && mapDef.lavaGrid;
  if (!lg || !lavaEnabled()) return null;
  if (cache.has(lg)) return cache.get(lg);
  let info = null;
  try {
    info = new LavaInfo(mapDef);
    if (!info.count) info = null;
  } catch (e) {
    info = null;
  }
  cache.set(lg, info);
  return info;
}
