/**
 * src/data — fonte única de verdade de balanceamento e conteúdo (F0-06).
 *
 * Os módulos de jogo devem importar daqui (ou dos arquivos irmãos) em vez de
 * repetir números. As tabelas derivadas abaixo (UNIT_TRAIN_CONFIG etc.) mantêm o
 * formato legado que Building/UIManager/InputManager já consumiam.
 *
 * Módulo puro: sem three.js nem DOM, importável em Node (ver tools/check-data-parity.mjs).
 */
import { UNITS, DEFAULT_UNIT, WORKER_STATS } from './units.js';
import { BUILDINGS, DEFAULT_BUILDING, DEFAULT_BUILDING_ATTACK_COOLDOWN, WALL_STEP, WALL_MAX_POINTS } from './buildings.js';
import {
  UPGRADE_CONFIG, FORGE_UPGRADES, RESEARCH, researchIdsFor, getMaxResearchLevel, researchName,
  researchEffect, promotedType, describeLevel
} from './upgrades.js';
import { FACTIONS, STARTING_RESOURCES } from './factions.js';
import { CARRY, MINE_ENTER_TIME, MINE_SLOTS, RATE_BONUS, gatherMultiplier } from './economy.js';
import {
  TIER_NAMES, HQ_TIER_HP, HQ_TIER_ARMOR, HQ_TIER_GOLD_MULT, HQ_UPGRADE_COST, HQ_TIER_MODEL,
  getTierName, getHqUpgradeCost
} from './tiers.js';
import { RESOURCE_NAMES, getResourceName } from './names.js';
import { ABILITIES, getAbility, abilityName, isDebugUrl } from './abilities.js';

export {
  UNITS, DEFAULT_UNIT, WORKER_STATS,
  BUILDINGS, DEFAULT_BUILDING, DEFAULT_BUILDING_ATTACK_COOLDOWN, WALL_STEP, WALL_MAX_POINTS,
  UPGRADE_CONFIG, FORGE_UPGRADES, RESEARCH, researchIdsFor, getMaxResearchLevel, researchName,
  researchEffect, promotedType, describeLevel,
  FACTIONS, STARTING_RESOURCES,
  CARRY, MINE_ENTER_TIME, MINE_SLOTS, RATE_BONUS, gatherMultiplier,
  TIER_NAMES, HQ_TIER_HP, HQ_TIER_ARMOR, HQ_TIER_GOLD_MULT, HQ_UPGRADE_COST, HQ_TIER_MODEL,
  getTierName, getHqUpgradeCost,
  RESOURCE_NAMES, getResourceName,
  ABILITIES, getAbility, abilityName, isDebugUrl
};

export const RESOURCE_TYPES = ['gold', 'wood', 'stone'];

// ---------------------------------------------------------------------------
// Helpers de consulta
// ---------------------------------------------------------------------------

/** Definição completa da unidade (ou DEFAULT_UNIT para tipos desconhecidos). */
export function getUnitDef(type) {
  return UNITS[type] || DEFAULT_UNIT;
}

/** Definição completa da construção (ou DEFAULT_BUILDING para tipos desconhecidos). */
export function getBuildingDef(type) {
  return BUILDINGS[type] || DEFAULT_BUILDING;
}

/** Definição da facção ('human' | 'orc'). */
export function getFactionDef(factionId) {
  return FACTIONS[factionId] || null;
}

/** Copia um custo removendo as chaves zeradas (formato legado: só recursos cobrados). */
function compactCost(cost) {
  const out = {};
  if (!cost) return out;
  for (const r of RESOURCE_TYPES) {
    if (cost[r]) out[r] = cost[r];
  }
  return out;
}

/**
 * Custo {gold?, wood?, stone?} de uma unidade ou construção (sem o tempo).
 * Unidades não treináveis retornam null; construções desconhecidas usam DEFAULT_BUILDING.
 */
export function getCost(type) {
  if (UNITS[type]) {
    return UNITS[type].cost ? compactCost(UNITS[type].cost) : null;
  }
  return compactCost(getBuildingDef(type).cost);
}

/** Custo de treino no formato legado {gold?, wood?, stone?, time}. */
export function getTrainCost(unitType) {
  const def = UNITS[unitType];
  if (!def || !def.cost) return null;
  return { ...compactCost(def.cost), time: def.trainTime };
}

export function isWorkerType(type) {
  return getUnitDef(type).isWorker;
}

export function isCombatType(type) {
  return getUnitDef(type).isCombat;
}

export function isRangedType(type) {
  return getUnitDef(type).isRanged;
}

/**
 * A construção aceita entrega deste recurso?
 * Sem recurso definido, só pontos que aceitam todos os recursos (HQ) contam.
 */
export function isDropoffFor(buildingType, resourceType) {
  const accepted = getBuildingDef(buildingType).dropoff;
  if (!accepted || accepted.length === 0) return false;
  if (!resourceType) return RESOURCE_TYPES.every(r => accepted.includes(r));
  return accepted.includes(resourceType);
}

/**
 * Stats no formato legado de Unit.getUnitStats(). F3-03: `damage` (objeto {basic, piercing,
 * type}) é a fonte real do dano; `attack` continua aqui só como soma derivada, para leitura
 * legada (AI/HUD) — nenhum código novo lê `attack` para calcular dano (ver `Unit.attack`, getter).
 */
export function getUnitStats(type) {
  const d = getUnitDef(type);
  return {
    name: d.entityName,
    hp: d.hp,
    speed: d.speed,
    damage: { ...d.damage },
    attack: d.damage.basic + d.damage.piercing,
    attackRange: d.attackRange,
    attackCooldown: d.attackCooldown,
    armor: d.armor,
    collisionRadius: d.collisionRadius
  };
}

/**
 * Stats no formato legado de Building.getBuildingStats(). F3-03: construções ganham `armor`
 * (corrige B5) e `towerDamage` (objeto {basic, piercing, type}); `attackDamage` continua como
 * soma derivada para leitura legada (HUD).
 */
export function getBuildingStats(type) {
  const d = getBuildingDef(type);
  const towerDamage = d.tower ? d.tower.damage : null;
  return {
    name: d.entityName,
    hp: d.hp,
    armor: d.armor || 0,
    cost: compactCost(d.cost),
    popGranted: d.popGranted,
    collisionRadius: d.collisionRadius,
    attackRange: d.tower ? d.tower.range : 0,
    towerDamage: towerDamage ? { ...towerDamage } : null,
    attackDamage: towerDamage ? towerDamage.basic + towerDamage.piercing : 0,
    attackCooldown: d.tower ? d.tower.cooldown : DEFAULT_BUILDING_ATTACK_COOLDOWN
  };
}

// ---------------------------------------------------------------------------
// Tabelas derivadas (formato legado)
// ---------------------------------------------------------------------------

/** Unidades treináveis: { type, name, icon, cost: {gold?, wood?, stone?, time}, description } */
export const UNIT_TRAIN_CONFIG = Object.fromEntries(
  Object.values(UNITS)
    .filter(u => u.cost)
    .map(u => [u.type, {
      type: u.type,
      name: u.name,
      icon: u.icon,
      cost: getTrainCost(u.type),
      description: u.description,
      // F3-06: requisitos generalizados (src/sim/requirements.js) — [] quando a unidade não
      // declara `requires` em src/data/units.js.
      requires: u.requires || []
    }])
);

/** Lista de construção por tipo de trabalhador: { villager: [...], peon: [...] } */
export const WORKER_BUILD_LIST = Object.fromEntries(
  Object.values(FACTIONS).map(f => [f.worker, [...f.buildList]])
);

/** Construções que um trabalhador pode erguer: { type, name, icon, cost, description } */
export const BUILDING_BUILD_CONFIG = Object.fromEntries(
  Object.values(FACTIONS)
    .flatMap(f => f.buildList)
    .map(t => {
      const b = BUILDINGS[t];
      return [t, { type: t, name: b.name, icon: b.icon, cost: compactCost(b.cost), description: b.description }];
    })
);

/** Quem treina o quê: { barracks: ['archer', 'knight'], ... } (só construções que treinam). */
export const BUILDING_TRAINABLE_UNITS = Object.fromEntries(
  Object.values(BUILDINGS)
    .filter(b => b.trains.length > 0)
    .map(b => [b.type, [...b.trains]])
);

/** Raio de visão por tipo (unidades + construções) para a névoa de guerra. */
export const VISION_RADII = Object.fromEntries([
  ...Object.values(UNITS).map(u => [u.type, u.visionRadius]),
  ...Object.values(BUILDINGS).map(b => [b.type, b.visionRadius])
]);
