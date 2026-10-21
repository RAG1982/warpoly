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
import { DECOR_RULES, decorCountFor, PROP_RULES, propCountFor } from './biomeStyles.js';
import { BIOME, gridOfBiome } from './maps/biome.js';

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
// Props .glb por bioma (M2-12/14/15/17): rochas de arenito, arbusto rolante, props vulcânicos, de gelo e de pântano
// ---------------------------------------------------------------------------------------------

/** Folga (u) em volta de start slots, jazidas e lava para um prop .glb (maiores que seixos e tufos). */
const PROP_SLOT_CLEAR = 10;
const PROP_RESOURCE_CLEAR = 4.5;
const PROP_LAVA_CLEAR = 2.2;

/** Sondas (8 direções) para achar água/terra em volta de um ponto (props de costa, M2-16). */
const SHORE_PROBES = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

export const PROP_KEYS = Object.freeze(Object.keys(PROP_RULES));

/**
 * Props .glb por bioma (plano separado de `planDecorations`: mesma ideia, mas a unidade é o MODELO). Puro e determinístico (PRNG
 * semeado por id do mapa e chave do prop). Cada instância fica na célula do bioma certo (pesos de `PROP_RULES`), na faixa de altura
 * do prop, longe de lava, bases, jazidas e de outras instâncias do mesmo prop (`spacing`).
 * @returns {Record<string, Array<{x:number,y:number,z:number,rotY:number,scale:number,style:number}>>}  só chaves com ≥ 1 instância
 */
export function planProps({ regions, getHeight, mapDef, lava = null, waterLevel = 0.5 }) {
  const size = mapDef.size || regions.size;
  const half = Math.max(8, (mapDef.playable || size - 8) / 2 - 3);
  const slots = (mapDef.startSlots || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const resources = (mapDef.resources || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const plan = {};
  for (const key of PROP_KEYS) {
    const rule = PROP_RULES[key];
    const rng = mulberry32(fnv1a(`${mapDef.id || 'mapa'}|prop|${key}`));
    const target = propCountFor(key, size);
    const maxW = rule.water ? 1 : Math.max(...Object.values(rule.weights), 0.0001);
    const [s0, s1] = rule.scale || [1, 1];
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
      } else if (rule.offshore) {
        // M2-16 (naufragado): água rasa; o bioma é o da terra mais próxima à vista (sonda a 5 e 9 u) e tem de haver mar aberto por perto
        if (h < rule.minH || h > rule.maxH) continue;
        let b = null, openSea = 0;
        for (const [dx, dz] of SHORE_PROBES) {
          for (const r of [5, 9]) {
            const ph = getHeight(x + dx * r, z + dz * r);
            if (b === null && ph > waterLevel + 0.1 && ph < 2.2) {
              const pb = regions.biomeAt(x + dx * r, z + dz * r);
              if (pb !== null && rule.weights[pb]) b = pb;
            }
            if (ph < waterLevel - 0.6) openSea++;
          }
        }
        if (b === null || openSea < 3) continue;
        w = rule.weights[b];
      } else {
        if (h < rule.minH || h > rule.maxH) continue;
        const b = regions.biomeAt(x, z);
        if (b === null) continue;
        w = rule.weights[b] || 0;
        // M2-16 (costa): só colado à água (alguma sonda a `shore` u abaixo do nível d'água)
        if (rule.shore && !SHORE_PROBES.some(([dx, dz]) => getHeight(x + dx * rule.shore, z + dz * rule.shore) < waterLevel - 0.05)) continue;
      }
      if (w <= 0 || keep * maxW >= w) continue;
      const style = regions.styleAt(x, z);
      if (lava && lava.distAt(x, z) < PROP_LAVA_CLEAR + (rule.shore || rule.offshore ? 1.5 : 0)) continue;
      if (slots.some((p) => Math.hypot(p.x - x, p.z - z) < (rule.slotClear || PROP_SLOT_CLEAR))) continue;
      if (resources.some((p) => Math.hypot(p.x - x, p.z - z) < PROP_RESOURCE_CLEAR)) continue;
      if (rule.spacing && out.some((p) => Math.hypot(p.x - x, p.z - z) < rule.spacing)) continue;
      out.push({ x, y: rule.offshore ? Math.max(h, waterLevel - 0.35) + (rule.lift || 0) : (rule.water ? waterLevel : h) + (rule.lift || 0), z, rotY: spin, scale: sc, style });
    }
    if (out.length) plan[key] = out;
  }
  return plan;
}

/**
 * Chaves `GLB_MODELS` dos props que um mapa pode usar (biomas presentes no `biomeGrid` com peso > 0; props de água só se o mapa tem
 * mar ou pântano). Mapa sem `biomeGrid` = nenhum (o caminho antigo não coloca props). Para `ensureGlbKeys` antes da partida.
 */
export function propKeysOfMap(mapDef) {
  const bg = mapDef && mapDef.biomeGrid;
  if (!bg) return [];
  let grid = null;
  try { grid = gridOfBiome(bg); } catch (e) { grid = null; }
  if (!grid) return [];
  const present = new Set();
  for (let i = 0; i < grid.length; i++) present.add(grid[i]);
  return PROP_KEYS.filter((key) => {
    const rule = PROP_RULES[key];
    if (rule.water) return present.has(BIOME.SEA) || present.has(BIOME.SWAMP);
    return Object.keys(rule.weights).some((b) => present.has(Number(b)));
  });
}
