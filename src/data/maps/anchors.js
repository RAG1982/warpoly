/**
 * src/data/maps/anchors.js (M2-01 · âncoras: pontos nomeados do mapa)
 *
 * Âncora = ponto com nome estável (`landingZone`, `goldMine1`…) que missões usam no lugar de coordenadas
 * (`{ "anchor": "goldMine1", "dx": 4 }`). Formato no mapa (opcional): `anchors: { "<nome>": { x, z, water?: true } }`.
 * Mapa sem `anchors` continua válido e igual (as missões clássicas não usam âncoras).
 *
 * - `defaultAnchors(mapDef)`: nomes padrão derivados de `startSlots`, `resources`, `forests`, `neutrals` e `fords` (e
 *   `landingZone`, por heurística). Chamado pelo assador de costas (`buildCoastWorld`) e por `tools/add-map-anchors.mjs`.
 * - `checkAnchors(mapDef, add)`: usado por `validateMapDef` (nome, área jogável, terra/água).
 *
 * Puro (sem DOM/RNG): roda em Node. O resultado é gravado no JSON do mapa; o jogo só lê.
 */
import { getHeightForMap } from '../../sim/terrainGenerators.js';
import { isLavaAt } from './lava.js';
import { getBiomeAt, BIOME } from './biome.js';

/** Limiar de "terra seca" (igual ao de `GameManager.canPlaceBuilding`); `validate.js` reexporta. */
export const DRY = 1.8;
/** Nome de âncora: letras, dígitos, `_` e `-` (até 48). */
export const ANCHOR_NAME_RE = /^[a-zA-Z0-9_-]{1,48}$/;

const LANDING_MIN_FROM_START = 30; // praia de desembarque: pelo menos 30 u da base do jogador
const LANDING_SHORE_DIST = 4; // "praia" = terra seca com água a até 4 u
const LANDING_STEP = 2;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const lavaAt = (m, x, z) => isLavaAt(m, x, z) || (!!m.biomeGrid && getBiomeAt(m, x, z) === BIOME.LAVA);

/**
 * Âncoras padrão do mapa, na ordem estável dos arrays. Nomes:
 * `playerStart` (startSlots[0]) · `enemyStart` (startSlots[1]) · `ally1..n` (startSlots[2..]) · `goldMine1..n` ·
 * `stoneQuarry1..n` · `well1..n` (poços de petróleo; `water: true`) · `forest1..n` · `neutralCamp1..n` (neutros `kind: "camp"`) ·
 * `ford1..n` · `landingZone` (praia de desembarque: terra seca com água a ≤ 4 u, a ≥ 30 u de `playerStart` e a mais próxima dela;
 * ausente se o mapa não tem praia). Âncoras já existentes em `mapDef.anchors` (escritas à mão) NÃO são sobrescritas.
 * @returns {Record<string, {x:number, z:number, water?:true}>}
 */
export function defaultAnchors(mapDef) {
  const m = mapDef || {};
  const out = {};
  const put = (name, p, water = false) => {
    if (!isNum(p?.x) || !isNum(p?.z)) return;
    out[name] = water ? { x: p.x, z: p.z, water: true } : { x: p.x, z: p.z };
  };
  const slots = Array.isArray(m.startSlots) ? m.startSlots : [];
  slots.forEach((s, i) => put(i === 0 ? 'playerStart' : i === 1 ? 'enemyStart' : `ally${i - 1}`, s));
  let gold = 0, stone = 0, well = 0;
  for (const r of Array.isArray(m.resources) ? m.resources : []) {
    if (r.type === 'gold') put(`goldMine${++gold}`, r);
    else if (r.type === 'stone') put(`stoneQuarry${++stone}`, r);
    else if (r.type === 'oil') put(`well${++well}`, r, true);
  }
  (Array.isArray(m.forests) ? m.forests : []).forEach((f, i) => put(`forest${i + 1}`, f));
  let camp = 0;
  for (const n of Array.isArray(m.neutrals) ? m.neutrals : []) if (n && n.kind === 'camp') put(`neutralCamp${++camp}`, n);
  (Array.isArray(m.fords) ? m.fords : []).forEach((f, i) => put(`ford${i + 1}`, f));
  const landing = findLandingZone(m, slots[0]);
  if (landing) put('landingZone', landing);
  return { ...out, ...(m.anchors && typeof m.anchors === 'object' ? m.anchors : {}) };
}

/** Praia mais próxima de `from` (≥ 30 u), varrendo a área jogável em passo fixo (ordem estável: z, depois x). `null` se não há. */
function findLandingZone(m, from) {
  if (!from || !isNum(m.playable) || !m.terrain?.generator || !isNum(m.waterLevel)) return null;
  const half = m.playable / 2 - 2;
  const wet = (x, z) => getHeightForMap(m, x, z) < m.waterLevel;
  let best = null;
  let bestD = Infinity;
  for (let z = -half; z <= half; z += LANDING_STEP) {
    for (let x = -half; x <= half; x += LANDING_STEP) {
      const d = Math.hypot(x - from.x, z - from.z);
      if (d < LANDING_MIN_FROM_START || d >= bestD) continue;
      if (getHeightForMap(m, x, z) < DRY || lavaAt(m, x, z)) continue;
      let shore = false;
      for (let k = 0; k < 8 && !shore; k++) {
        const a = (k / 8) * Math.PI * 2;
        const sx = x + Math.cos(a) * LANDING_SHORE_DIST;
        const sz = z + Math.sin(a) * LANDING_SHORE_DIST;
        shore = Math.abs(sx) <= half && Math.abs(sz) <= half && wet(sx, sz);
      }
      if (!shore) continue;
      best = { x, z };
      bestD = d;
    }
  }
  return best;
}

/**
 * Confere `mapDef.anchors`. `add(code, params)` recebe cada problema (erro). Códigos: `anchorsBad` (não é objeto),
 * `anchorName`, `anchorBad` (x/z/water inválidos), `anchorOutside`, `anchorWet` (âncora de terra em água), `anchorLava`,
 * `anchorNotWater` (`water: true` fora da água).
 */
export function checkAnchors(m, add) {
  if (m.anchors === undefined) return;
  if (!m.anchors || typeof m.anchors !== 'object' || Array.isArray(m.anchors)) return add('anchorsBad', {});
  const half = m.playable / 2;
  for (const [name, a] of Object.entries(m.anchors)) {
    if (!ANCHOR_NAME_RE.test(name)) { add('anchorName', { name }); continue; }
    if (!a || !isNum(a.x) || !isNum(a.z) || (a.water !== undefined && typeof a.water !== 'boolean')) { add('anchorBad', { name }); continue; }
    if (!(Math.abs(a.x) < half && Math.abs(a.z) < half)) { add('anchorOutside', { name }); continue; }
    const h = getHeightForMap(m, a.x, a.z);
    if (a.water) {
      if (!(h < m.waterLevel)) add('anchorNotWater', { name });
    } else if (h < DRY) add('anchorWet', { name });
    else if (lavaAt(m, a.x, a.z)) add('anchorLava', { name });
  }
}
