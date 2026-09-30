/**
 * requirements.js — F3-04: requisitos de construção (`BUILDINGS[type].requires`, ver
 * `src/data/buildings.js`). F3-06: generalizado para também cobrir treino de unidade
 * (`UNITS[type].requires`) e pesquisa (`UPGRADE_CONFIG[id].requires`), e para aceitar
 * `{hq: N}` (Centro do dono com `tier >= N`) além de ids de construção (string).
 * Módulo puro (sem three.js), testável em Node.
 *
 * `gm` só precisa expor `buildings` (array de instâncias com `ownerId`, `type`,
 * `isConstructed`, `isDead`, e para HQ `tier`) — o mesmo objeto que
 * `GameManager.placeBuilding`/`Building.queueUnit`/`Building.startResearch` já têm.
 */
import { getBuildingDef, getUnitDef, UPGRADE_CONFIG } from '../data/index.js';

/** Construção `type` concluída de `playerId` existe em `buildings`? */
function hasBuildingType(playerId, type, buildings) {
  return buildings.some(b => b.ownerId === playerId && b.type === type && b.isConstructed && !b.isDead);
}

/** Centro (`role: 'hq'`) de `playerId` com `tier >= tier` existe em `buildings`? */
function hasHqTier(playerId, tier, buildings) {
  return buildings.some(b =>
    b.ownerId === playerId && !b.isDead && getBuildingDef(b.type).role === 'hq' && (b.tier || 1) >= tier
  );
}

/**
 * Núcleo genérico: quais itens de `requires` (array de string=tipo de construção ou
 * `{hq:N}`) ainda faltam para `playerId`.
 * @param {Array<string|{hq:number}>} requires
 * @param {number} playerId
 * @param {{buildings: Array}} gm
 * @returns {Array<string|{hq:number}>}
 */
export function evalRequirements(requires, playerId, gm) {
  if (!requires || requires.length === 0) return [];
  const buildings = (gm && gm.buildings) || [];
  return requires.filter(req => {
    if (typeof req === 'string') return !hasBuildingType(playerId, req, buildings);
    if (req && typeof req.hq === 'number') return !hasHqTier(playerId, req.hq, buildings);
    return false;
  });
}

/** Texto amigável (PT-BR) de um requisito faltante — para tooltip da HUD. */
export function formatRequirement(req) {
  if (typeof req === 'string') return getBuildingDef(req).name;
  if (req && typeof req.hq === 'number') return `Centro nível ${req.hq}`;
  return String(req);
}

/** `[formatRequirement(r), ...]` já unido — atalho comum na HUD ("Requer: A, B"). */
export function formatRequirementList(missing) {
  return missing.map(formatRequirement).join(', ');
}

/**
 * Requisitos de `buildingType` ainda não satisfeitos por `playerId` (assinatura mantida da
 * F3-04; agora `requires` também aceita `{hq:N}`).
 * @param {number} playerId
 * @param {string} buildingType
 * @param {{buildings: Array}} gm
 * @returns {Array<string|{hq:number}>}
 */
export function missingRequirements(playerId, buildingType, gm) {
  return evalRequirements(getBuildingDef(buildingType).requires, playerId, gm);
}

/** F3-06: requisitos de treino de `unitType` (`UNITS[type].requires`) ainda não satisfeitos. */
export function missingUnitRequirements(playerId, unitType, gm) {
  return evalRequirements(getUnitDef(unitType).requires, playerId, gm);
}

/** F3-06: requisitos de pesquisa de `upgradeId` (`UPGRADE_CONFIG[id].requires`) ainda não satisfeitos. */
export function missingUpgradeRequirements(playerId, upgradeId, gm) {
  const cfg = UPGRADE_CONFIG[upgradeId];
  return evalRequirements(cfg && cfg.requires, playerId, gm);
}
