/**
 * hqTierUnlocks.js (M3-03a) — o que o Centro libera ao chegar a um nível (`{hq: N}` nos requisitos de
 * `BUILDINGS`, `UNITS` e `RESEARCH`). Puro (sem DOM/three): tudo sai dos dados, nada fica fixo aqui.
 *
 * Saída no mesmo formato de `unlocks` da campanha (`techText.unlockNames` / `TECH_KINDS`), para o painel
 * reaproveitar a lista do briefing. Pesquisas usam o token `id` ou `id@nível` (ver `techRestriction.researchToken`).
 */
import { BUILDINGS, UNITS, RESEARCH } from '../data/index.js';
import { researchToken } from '../sim/techRestriction.js';

const requiresHq = (requires, tier) => Array.isArray(requires)
  && requires.some((r) => r && typeof r === 'object' && r.hq === tier);

/** Definição sem `faction` vale para as duas facções (padrão dos dados). */
const forFaction = (def, factionId) => !def.faction || def.faction === factionId;

/**
 * Itens que o nível `tier` do Centro libera para a facção `factionId` ('human' | 'orc').
 * @param {number} tier  nível alcançado (2 ou 3)
 * @param {string} factionId
 * @param {(kind: 'units'|'buildings'|'research', id: string, level?: number) => boolean} [isAllowed]
 *   filtro opcional (ex.: travas de campanha via `techLock`): `false` esconde o item.
 * @returns {{units: string[], buildings: string[], research: string[]}}
 */
export function hqTierUnlocks(tier, factionId = 'human', isAllowed = () => true) {
  const out = { units: [], buildings: [], research: [] };
  for (const [id, def] of Object.entries(BUILDINGS)) {
    if (forFaction(def, factionId) && requiresHq(def.requires, tier) && isAllowed('buildings', id)) out.buildings.push(id);
  }
  for (const [id, def] of Object.entries(UNITS)) {
    if (forFaction(def, factionId) && requiresHq(def.requires, tier) && isAllowed('units', id)) out.units.push(id);
  }
  for (const [id, def] of Object.entries(RESEARCH)) {
    if (!forFaction(def, factionId)) continue;
    (def.levels || []).forEach((lv, i) => {
      const level = i + 1;
      if (requiresHq(lv.requires, tier) && isAllowed('research', id, level)) out.research.push(researchToken(id, level));
    });
  }
  return out;
}

/** true se o nível `tier` libera pelo menos um item para a facção (o painel só aparece nesse caso). */
export function hasAnyUnlock(unlocks) {
  return !!unlocks && (unlocks.units.length + unlocks.buildings.length + unlocks.research.length) > 0;
}
