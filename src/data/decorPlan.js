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
