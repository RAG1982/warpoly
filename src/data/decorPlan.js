/**
 * src/data/decorPlan.js (MUNDO-5 · MUNDO-TERRENO-MAPAS §3.1/§5) — onde cada decoração fica num mapa REGIONAL.
 *
 * Puro e determinístico (sem three/DOM; PRNG `mulberry32` semeado pelo id do mapa e pela categoria): para cada categoria de
 * `Decorations` (tufos de capim, seixos, pedras, arbustos, tocos+cogumelos, flores, vitórias-régias) sorteia posições em células
 * do bioma certo (pesos de `DECOR_RULES`), na faixa de altura da categoria, longe de lava, bases e jazidas, e respeitando as flags do
 * estilo da célula (`decor.flowers/mushrooms/lilies`, como no tileset). O caminho antigo (mapa sem `biomeGrid`) NÃO usa isto:
 * continua com as posições fixas/aleatórias de `Decorations`.
 */
import { mulberry32, fnv1a } from '../sim/rng.js';
import { DECOR_RULES, decorCountFor } from './biomeStyles.js';
import { BIOME } from './maps/biome.js';

/** Faixa de escala por categoria (como no caminho antigo). */
const SCALE = {
  grass: [0.85, 1.2], pebbles: [0.8, 1.2], boulders: [0.8, 1.8], bushes: [0.95, 1.25], stumps: [0.9, 1.15], flowers: [0.95, 1.3], lilies: [0.9, 1.1]
};
const SLOT_CLEAR = 9; // u em volta de cada start slot
const RESOURCE_CLEAR = 3.5; // u em volta de cada jazida
const LAVA_CLEAR = 1.6; // u da lava
const BOULDER_SPACING = 4;
/** Vitórias-régias só em água parada e rasa (lago/lagoa): se há mar fundo a 4 u, é costa aberta e não entra. */
const OPEN_SEA_PROBE = [[4, 0], [-4, 0], [0, 4], [0, -4]];
const OPEN_SEA_DEPTH = 0.9;

export const DECOR_CATEGORIES = Object.freeze(Object.keys(DECOR_RULES));

/**
 * @param {object} o
 * @param {import('./biomeRegions.js').RegionMap} o.regions
 * @param {(x:number,z:number)=>number} o.getHeight
 * @param {object} o.mapDef          `id`, `size`, `playable`, `startSlots`, `resources`
 * @param {import('./lavaRender.js').LavaInfo|null} [o.lava]
 * @param {number} [o.waterLevel=0.5]
 * @returns {Record<string, Array<{x:number,y:number,z:number,rotY:number,scale:number,style:number}>>}
 */
export function planDecorations({ regions, getHeight, mapDef, lava = null, waterLevel = 0.5 }) {
  const size = mapDef.size || regions.size;
  const half = Math.max(8, (mapDef.playable || size - 8) / 2 - 3);
  const slots = (mapDef.startSlots || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const resources = (mapDef.resources || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const plan = {};
  for (const category of DECOR_CATEGORIES) {
    const rule = DECOR_RULES[category];
    const rng = mulberry32(fnv1a(`${mapDef.id || 'mapa'}|decor|${category}`));
    const target = decorCountFor(category, size);
    const maxW = rule.water ? 1 : Math.max(...Object.values(rule.weights), 0.0001);
    const [s0, s1] = SCALE[category] || [1, 1];
    const out = [];
    for (let attempt = 0; out.length < target && attempt < target * 80; attempt++) {
      const x = (rng.next() * 2 - 1) * half;
      const z = (rng.next() * 2 - 1) * half;
      const keep = rng.next();
      const spin = rng.next() * Math.PI * 2;
      const sc = s0 + rng.next() * (s1 - s0);
      const h = getHeight(x, z);
      let w;
      if (rule.water) {
        const depth = waterLevel - h;
        if (depth < rule.minDepth || depth > rule.maxDepth) continue;
        if (OPEN_SEA_PROBE.some(([dx, dz]) => getHeight(x + dx, z + dz) < waterLevel - OPEN_SEA_DEPTH)) continue;
        w = 1;
      } else {
        if (h < rule.minH || h > rule.maxH) continue;
        const b = regions.biomeAt(x, z);
        if (b === null) continue;
        w = rule.weights[b] || 0;
      }
      if (w <= 0 || keep * maxW >= w) continue;
      const style = regions.styleAt(x, z);
      if (rule.flag && !regions.styles[style].def.decor[rule.flag]) continue;
      if (lava && lava.distAt(x, z) < LAVA_CLEAR) continue;
      if (slots.some((p) => Math.hypot(p.x - x, p.z - z) < SLOT_CLEAR)) continue;
      if (resources.some((p) => Math.hypot(p.x - x, p.z - z) < RESOURCE_CLEAR)) continue;
      if (category === 'boulders' && out.some((p) => Math.hypot(p.x - x, p.z - z) < BOULDER_SPACING)) continue;
      out.push({ x, y: rule.water ? waterLevel + 0.03 : category === 'pebbles' ? h + 0.05 : h, z, rotY: spin, scale: sc, style });
    }
    plan[category] = out;
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// M2-16 · props de costa e praia (conchas, estrelas-do-mar, caniço, barco naufragado)
// ---------------------------------------------------------------------------------------------

/** Tipos de prop de costa: chave do `.glb` (lazy), quantidade-base (escala com a área, como `decorCountFor`), faixa de altura e pesos por bioma. */
export const COAST_RULES = Object.freeze({
  shell: {
    key: 'coast_shell', base: 34, scale: [0.85, 1.25], minH: 0.52, maxH: 0.95, reach: 3.2,
    weights: { [BIOME.SAND]: 1, [BIOME.SAVANNA]: 0.45, [BIOME.DESERT]: 0.5, [BIOME.STEPPE]: 0.4, [BIOME.GRASS]: 0.3, [BIOME.ROCK]: 0.12, [BIOME.VOLCANIC]: 0.1 }
  },
  starfish: {
    key: 'coast_starfish', base: 20, scale: [0.85, 1.3], minH: 0.4, maxH: 0.66, reach: 2.2,
    weights: { [BIOME.SAND]: 1, [BIOME.GRASS]: 0.2, [BIOME.SAVANNA]: 0.3, [BIOME.DESERT]: 0.3, [BIOME.STEPPE]: 0.25, [BIOME.ROCK]: 0.2 }
  },
  reed: {
    key: 'coast_reed', base: 34, scale: [0.8, 1.25], minH: 0.2, maxH: 0.85, reach: 2.6,
    weights: { [BIOME.SWAMP]: 1.5, [BIOME.FOREST]: 0.55, [BIOME.GRASS]: 0.5, [BIOME.SAVANNA]: 0.25, [BIOME.STEPPE]: 0.15 }
  },
  wreck: {
    key: 'coast_wreck', base: 2, scale: [0.95, 1.3], minH: 0.1, maxH: 0.42, reach: 0,
    weights: { [BIOME.SAND]: 1, [BIOME.GRASS]: 0.6, [BIOME.SAVANNA]: 0.8, [BIOME.DESERT]: 0.8, [BIOME.STEPPE]: 0.6, [BIOME.SWAMP]: 0.4, [BIOME.ROCK]: 0.5 }
  }
});
export const COAST_KINDS = Object.freeze(Object.keys(COAST_RULES));

/** Chaves de `GLB_MODELS` dos props de costa que um mapa usa (todos, se for regional com `biomeGrid`; senão nenhum). */
export function coastKeysOfMap(mapDef) {
  return mapDef && mapDef.biomeGrid ? COAST_KINDS.map((k) => COAST_RULES[k].key) : [];
}

const COAST_PROBES = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
const WRECK_SPACING = 38;
const WRECK_SLOT_CLEAR = 16;

/**
 * Posições dos props de costa de um mapa REGIONAL (determinístico por mapa e tipo; mesmo molde de `planDecorations`, mas fora de
 * `DECOR_CATEGORIES`: nunca muda o plano das decorações existentes). Conchas/estrelas na areia e na costa seca de terra firme,
 * caniço na margem de pântano/mata/grama, barcos naufragados raros em água rasa com terra à vista; nada junto de lava, bases e jazidas.
 * @returns {Record<string, Array<{x:number,y:number,z:number,rotY:number,scale:number}>>}
 */
export function planCoastProps({ regions, getHeight, mapDef, lava = null, waterLevel = 0.5 }) {
  const size = mapDef.size || regions.size;
  const half = Math.max(8, (mapDef.playable || size - 8) / 2 - 3);
  const slots = (mapDef.startSlots || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const resources = (mapDef.resources || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const k = Math.max(1, Math.min(3.5, (size / 140) * (size / 140)));
  const plan = {};
  for (const kind of COAST_KINDS) {
    const rule = COAST_RULES[kind];
    const rng = mulberry32(fnv1a(`${mapDef.id || 'mapa'}|coast|${kind}`));
    const target = Math.max(rule.base, Math.round(rule.base * (kind === 'wreck' ? Math.min(k, 2) : k)));
    const maxW = Math.max(...Object.values(rule.weights));
    const [s0, s1] = rule.scale;
    const out = [];
    for (let attempt = 0; out.length < target && attempt < target * 400; attempt++) {
      const x = (rng.next() * 2 - 1) * half;
      const z = (rng.next() * 2 - 1) * half;
      const keep = rng.next();
      const spin = rng.next() * Math.PI * 2;
      const sc = s0 + rng.next() * (s1 - s0);
      const h = getHeight(x, z);
      if (h < rule.minH || h > rule.maxH) continue;
      if (lava && lava.distAt(x, z) < LAVA_CLEAR + 1.5) continue;
      let b = regions.biomeAt(x, z);
      if (kind === 'wreck') {
        // sobre água rasa: o bioma da célula é mar; vale o da terra mais próxima (sonda a 5–9 u)
        b = null;
        let openSea = 0;
        for (const [dx, dz] of COAST_PROBES) {
          for (const r of [5, 9]) {
            const px = x + dx * r, pz = z + dz * r;
            const ph = getHeight(px, pz);
            if (b === null && ph > waterLevel + 0.1 && ph < 2.2) {
              const pb = regions.biomeAt(px, pz);
              if (pb !== null && rule.weights[pb]) b = pb;
            }
            if (ph < waterLevel - 0.6) openSea++;
          }
        }
        if (b === null || openSea < 3) continue; // precisa de terra à vista e mar aberto por perto
      } else {
        if (b === null || !rule.weights[b]) continue;
        let near = false;
        for (const [dx, dz] of COAST_PROBES) {
          if (getHeight(x + dx * rule.reach, z + dz * rule.reach) < waterLevel - 0.05) { near = true; break; }
        }
        if (!near) continue;
      }
      const w = rule.weights[b] || 0;
      if (w <= 0 || keep * maxW >= w) continue;
      if (slots.some((p) => Math.hypot(p.x - x, p.z - z) < (kind === 'wreck' ? WRECK_SLOT_CLEAR : SLOT_CLEAR))) continue;
      if (resources.some((p) => Math.hypot(p.x - x, p.z - z) < RESOURCE_CLEAR)) continue;
      if (kind === 'wreck' && out.some((p) => Math.hypot(p.x - x, p.z - z) < WRECK_SPACING)) continue;
      const y = kind === 'wreck' ? Math.max(h, waterLevel - 0.35) - 0.12 : kind === 'starfish' ? h + 0.02 : h;
      out.push({ x, y, z, rotY: spin, scale: sc });
    }
    plan[kind] = out;
  }
  return plan;
}
