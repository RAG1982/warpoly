/**
 * src/data/maps/validate.js (F8-03 · validador de mapa compartilhado)
 *
 * `validateMapDef(mapDef)` junta, num só lugar, o que o jogo exige de um mapa: as checagens de `tests/unit/maps.test.js`
 * (campos, slots/recursos/vaus/florestas em terra seca, poços em água navegável) + os validadores do `MatchConfig`
 * (`validateNeutrals`, `validateOilWells`) + avisos de jogabilidade (convenções do README: acampamentos ≥ 25 e florestas ≥ 27
 * das bases, uma mina de ouro por base, madeira suficiente, conectividade terrestre por flood fill no `Pathfinder`).
 *
 * Devolve `{ ok, errors, warnings }`; cada item é `{ level, code, params }` (o editor traduz `editor.issue.<code>`).
 * `ok` = nenhum erro. Um mapa sem erros carrega via `registerMap`/`getMap` e passa em `validateMatchConfig` sem edição manual.
 * Puro (sem DOM/RNG): roda em Node.
 */
import { getHeightForMap, TERRAIN_GENERATORS } from '../../sim/terrainGenerators.js';
import { validateNeutrals, validateOilWells } from '../../sim/MatchConfig.js';
import { NAVAL_MAX_HEIGHT } from '../combat.js';
import { TILESETS, TILESET_ALIASES } from '../tilesets.js';
import { buildPathfinder, floodFill, isReached } from './generator.js';
import { getMap } from './index.js';
import { decodeHeights, paintedNodes } from './painted.js';

export const DRY = 1.8; // limiar de "terra seca" (GameManager.canPlaceBuilding)
export const FOREST_SPECIES = Object.freeze(['oak', 'pine', 'autumn', 'birch']); // F7-00b: bétula (`tree_birch.glb`)
export const RESOURCE_TYPES = Object.freeze(['gold', 'stone', 'oil']);
export const MAP_ID_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
export const SIZE_LIMITS = Object.freeze({ min: 64, max: 256 });
const CAMP_MIN_SLOT_DIST = 25;
const FOREST_MIN_SLOT_DIST = 27;
const GOLD_NEAR_SLOT = 50;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {object} mapDef  mapa no formato de `src/data/maps/README.md`
 * @param {{connectivity?: boolean, checkId?: boolean}} [opts]  `connectivity: false` pula o flood fill; `checkId: false` não acusa id já registrado
 */
export function validateMapDef(mapDef, { connectivity = true, checkId = true } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, params = {}) => errors.push({ level: 'error', code, params });
  const warn = (code, params = {}) => warnings.push({ level: 'warning', code, params });
  const m = mapDef || {};

  if (typeof m.id !== 'string' || !MAP_ID_RE.test(m.id)) err('idInvalid');
  else if (checkId && getMap(m.id)) err('idTaken', { id: m.id });
  if (typeof m.name !== 'string' || !m.name.trim()) err('nameEmpty');
  if (!isNum(m.size) || m.size < SIZE_LIMITS.min || m.size > SIZE_LIMITS.max) err('sizeRange', SIZE_LIMITS);
  if (!isNum(m.playable) || m.playable <= 0 || m.playable > m.size) err('playableRange');
  if (!isNum(m.waterLevel)) err('waterLevel');
  if (m.tileset !== undefined && !TILESETS[m.tileset] && !TILESET_ALIASES[m.tileset]) err('tilesetUnknown', { tileset: String(m.tileset) });

  const gen = m.terrain?.generator;
  if (!gen || !TERRAIN_GENERATORS[gen]) err('generator', { generator: String(gen) });
  else if (gen === 'painted') {
    const p = m.terrain.params;
    let okData = false;
    try {
      okData = !!p && p.nodes === paintedNodes(m.size, p.cell) && decodeHeights(p.data).length === p.nodes * p.nodes;
    } catch {
      okData = false;
    }
    if (!okData) err('terrainData');
  }
  if (errors.some((e) => ['sizeRange', 'playableRange', 'generator', 'terrainData', 'idInvalid'].includes(e.code))) {
    return { ok: false, errors, warnings };
  }

  const slots = Array.isArray(m.startSlots) ? m.startSlots : [];
  const resources = Array.isArray(m.resources) ? m.resources : [];
  const forests = Array.isArray(m.forests) ? m.forests : [];
  const fords = Array.isArray(m.fords) ? m.fords : [];
  const neutrals = Array.isArray(m.neutrals) ? m.neutrals : [];
  if (!Array.isArray(m.startSlots) || !Array.isArray(m.resources) || !Array.isArray(m.forests) || !Array.isArray(m.fords)) err('arrays');

  const half = m.playable / 2;
  const inside = (p) => isNum(p?.x) && isNum(p?.z) && Math.abs(p.x) < half && Math.abs(p.z) < half;
  const h = (p) => getHeightForMap(m, p.x, p.z);

  // --- jogadores ---
  if (slots.length < 2) err('slotsMin', { count: slots.length });
  if (!Number.isInteger(m.maxPlayers) || m.maxPlayers < 2 || m.maxPlayers > slots.length) err('maxPlayers', { maxPlayers: m.maxPlayers, slots: slots.length });
  slots.forEach((s, i) => {
    if (!inside(s)) err('slotOutside', { n: i + 1 });
    else if (h(s) < DRY) err('slotWet', { n: i + 1 });
  });

  // --- recursos ---
  resources.forEach((r, i) => {
    if (!RESOURCE_TYPES.includes(r.type)) return err('resourceType', { n: i + 1, type: String(r.type) });
    if (!inside(r)) return err('resourceOutside', { n: i + 1 });
    if (r.type === 'oil') {
      if (h(r) < m.waterLevel && h(r) > NAVAL_MAX_HEIGHT) err('oilShallow', { n: i + 1 });
    } else if (h(r) < DRY) err('resourceWet', { n: i + 1, type: r.type });
    if (r.amount !== undefined && !(r.amount > 0)) err('resourceAmount', { n: i + 1 });
  });

  // --- florestas ---
  forests.forEach((f, i) => {
    if (!inside(f) || !Number.isInteger(f.count) || f.count < 1 || !(f.radius > 0) || !FOREST_SPECIES.includes(f.species)) {
      return err('forestBad', { n: i + 1 });
    }
    let dry = false;
    for (let k = 0; k < 16 && !dry; k++) {
      const a = (k / 16) * Math.PI * 2;
      dry = h({ x: f.x + Math.cos(a) * f.radius * 0.6, z: f.z + Math.sin(a) * f.radius * 0.6 }) >= DRY;
    }
    if (!dry) err('forestNoLand', { n: i + 1 });
    if (Math.max(Math.abs(f.x), Math.abs(f.z)) + f.radius > half - 1) warn('forestEdge', { n: i + 1 });
    if (slots.some((s) => Math.hypot(f.x - s.x, f.z - s.z) < FOREST_MIN_SLOT_DIST)) warn('forestNearSlot', { n: i + 1, d: FOREST_MIN_SLOT_DIST });
  });

  // --- vaus ---
  fords.forEach((f, i) => {
    if (!isNum(f.x) || !isNum(f.z) || !(f.r > 0)) err('fordBad', { n: i + 1 });
    else if (h(f) < DRY) err('fordWet', { n: i + 1 });
  });

  // --- neutros e poços: os mesmos validadores do MatchConfig ---
  for (const check of [validateNeutrals, validateOilWells]) {
    try {
      check(m);
    } catch (e) {
      err('game', { msg: String(e.message).replace(/^MatchConfig:\s*/, '') });
    }
  }
  neutrals.forEach((n, i) => {
    if (n && n.kind === 'camp' && inside(n)) {
      if (h(n) < DRY) err('campWet', { n: i + 1 });
      if (slots.some((s) => Math.hypot(n.x - s.x, n.z - s.z) < CAMP_MIN_SLOT_DIST)) warn('campNearSlot', { n: i + 1, d: CAMP_MIN_SLOT_DIST });
    }
  });

  // --- jogabilidade (avisos) ---
  slots.forEach((s, i) => {
    if (!resources.some((r) => r.type === 'gold' && Math.hypot(r.x - s.x, r.z - s.z) <= GOLD_NEAR_SLOT)) warn('slotNoGold', { n: i + 1, d: GOLD_NEAR_SLOT });
  });
  const trees = forests.reduce((n, f) => n + (f.count || 0), 0);
  if (slots.length >= 2 && trees < 8 * slots.length) warn('woodLow', { trees, need: 8 * slots.length });

  if (connectivity && errors.length === 0 && slots.length >= 2) {
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, slots[0].x, slots[0].z);
    slots.forEach((s, i) => {
      if (i > 0 && !isReached(land, seen, s.x, s.z)) warn('slotsDisconnected', { n: i + 1 });
    });
    [...resources.filter((r) => r.type !== 'oil').map((r) => ['resource', r]), ...forests.map((f) => ['forest', f]), ...neutrals.filter((n) => n.kind === 'camp').map((n) => ['camp', n])].forEach(
      ([what, p], i) => {
        if (!isReached(land, seen, p.x, p.z)) warn('unreachable', { what, x: Math.round(p.x), z: Math.round(p.z), i });
      }
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
