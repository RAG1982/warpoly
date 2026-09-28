#!/usr/bin/env node
/**
 * tools/check-data-parity.mjs — prova de paridade da F0-06.
 *
 * Compara as tabelas de balanceamento ANTIGAS (copiadas literalmente do commit 9f6cb7d,
 * antes da centralização) com o que o código NOVO devolve em runtime (métodos reais de
 * Unit, Building, InputManager, UIManager, AIDirector, GameManager lendo de src/data).
 *
 * Única diferença permitida: custos da IA (bug B3) — a IA agora usa os custos reais.
 *
 * Uso: node tools/check-data-parity.mjs   (precisa de node_modules com three)
 * Sai com código 1 se houver qualquer divergência não esperada.
 */
import { Unit } from '../src/entities/Unit.js';
import { Building, UNIT_TRAIN_CONFIG, BUILDING_BUILD_CONFIG, WORKER_BUILD_LIST } from '../src/entities/Building.js';
import { InputManager } from '../src/core/InputManager.js';
import { GameManager } from '../src/core/GameManager.js';
import { BUILDING_TRAINABLE_UNITS } from '../src/ui/UIManager.js';
import { AIDirector } from '../src/ai/AIDirector.js';
import { Player } from '../src/sim/Player.js';
import { UPGRADE_CONFIG, FORGE_UPGRADES } from '../src/core/UpgradeConfig.js';
import {
  getUnitDef, getBuildingDef, getCost, VISION_RADII, DEFAULT_UNIT, DEFAULT_BUILDING,
  STARTING_RESOURCES, WORKER_STATS
} from '../src/data/index.js';

// ===========================================================================
// TABELAS ANTIGAS (9f6cb7d) — cópia literal
// ===========================================================================

// src/entities/Unit.js @9f6cb7d
function OLD_getUnitStats(type) {
  switch (type) {
    case 'villager':
      return { name: 'Villager', hp: 85, speed: 4.5, attack: 7, attackRange: 1.8, attackCooldown: 1.0, collisionRadius: 0.66 };
    case 'knight':
      return { name: 'Knight', hp: 190, speed: 4.8, attack: 26, attackRange: 2.1, attackCooldown: 1.1, armor: 4, collisionRadius: 0.84 };
    case 'archer':
      return { name: 'Archer', hp: 95, speed: 4.3, attack: 18, attackRange: 14.0, attackCooldown: 1.4, collisionRadius: 0.66 };
    case 'bandit':
      return { name: 'Bandit Raider', hp: 125, speed: 4.4, attack: 16, attackRange: 2.1, attackCooldown: 1.2, armor: 1, collisionRadius: 0.84 };
    case 'peon':
      return { name: 'Orc Peon', hp: 90, speed: 4.5, attack: 8, attackRange: 1.8, attackCooldown: 1.0, collisionRadius: 0.66 };
    case 'grunt':
      return { name: 'Orc Grunt', hp: 205, speed: 4.7, attack: 28, attackRange: 2.1, attackCooldown: 1.15, armor: 4, collisionRadius: 0.86 };
    case 'axethrower':
      return { name: 'Troll Axethrower', hp: 100, speed: 4.4, attack: 19, attackRange: 13.5, attackCooldown: 1.35, collisionRadius: 0.66 };
    case 'ogre':
      return { name: 'Orc Ogre', hp: 320, speed: 4.0, attack: 42, attackRange: 2.5, attackCooldown: 1.5, armor: 5, collisionRadius: 1.08 };
    default:
      return { name: 'Unit', hp: 100, speed: 4.0, attack: 10, attackRange: 1.8, attackCooldown: 1.0, collisionRadius: 0.72 };
  }
}
const OLD_isCombatUnit = (t) => t === 'knight' || t === 'archer' || t === 'bandit' || t === 'grunt' || t === 'axethrower' || t === 'ogre';
const OLD_isWorker = (t) => t === 'villager' || t === 'peon';
function OLD_getHealthBarHeight(t) {
  switch (t) {
    case 'ogre': return 4.5;
    case 'knight':
    case 'grunt': return 3.9;
    case 'bandit': return 3.6;
    case 'archer':
    case 'axethrower': return 3.4;
    case 'villager':
    case 'peon': return 3.1;
    default: return 3.5;
  }
}
const OLD_isRanged = (t) => t === 'archer' || t === 'axethrower';
const OLD_aggroRange = (t) => (OLD_isRanged(t) ? 14 : 11);
const OLD_threatScanRange = (t) => (OLD_isRanged(t) ? 15 : 13);
const OLD_retargetRange = 16;
const OLD_helpRadius = 14;
const OLD_projectile = (t) => (t === 'axethrower' ? 'axe' : 'arrow'); // só usado se ranged
const OLD_carryMax = 15;

// src/entities/Building.js @9f6cb7d
function OLD_getBuildingStats(type) {
  switch (type) {
    case 'castle':
      return { name: 'Castelo Real', hp: 1600, cost: { wood: 200, stone: 150 }, popGranted: 5, collisionRadius: 5.5 };
    case 'great_hall':
      return { name: 'Grande Salão Orc', hp: 1750, cost: { wood: 220, stone: 140 }, popGranted: 5, collisionRadius: 5.5 };
    case 'lumber_camp':
      return { name: 'Campo de Madeira', hp: 550, cost: { wood: 80, gold: 0, stone: 0 }, collisionRadius: 3.2 };
    case 'orc_lumber_mill':
      return { name: 'Serraria Orc', hp: 580, cost: { wood: 85, gold: 0, stone: 0 }, collisionRadius: 3.2 };
    case 'cottage':
      return { name: 'Chalé / Casa', hp: 400, cost: { wood: 50, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
    case 'pig_farm':
      return { name: 'Fazenda de Porcos', hp: 420, cost: { wood: 55, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
    case 'orc_house':
      return { name: 'Toca Orc', hp: 450, cost: { wood: 50, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
    case 'orc_forge':
      return { name: 'Forja Orc', hp: 850, cost: { wood: 100, stone: 70, gold: 50 }, collisionRadius: 3.4 };
    case 'forge':
      return { name: 'Forja Real', hp: 850, cost: { wood: 100, stone: 70, gold: 50 }, collisionRadius: 3.4 };
    case 'barracks':
      return { name: 'Quartel de Infantaria', hp: 850, cost: { wood: 120, stone: 60 }, collisionRadius: 3.5 };
    case 'orc_barracks':
      return { name: 'Quartel Orc', hp: 900, cost: { wood: 130, stone: 50 }, collisionRadius: 3.6 };
    case 'watchtower':
      return { name: 'Torre de Vigia', hp: 650, cost: { wood: 80, stone: 40 }, attackRange: 18, attackDamage: 18, collisionRadius: 2.0 };
    case 'orc_watchtower':
      return { name: 'Torre de Vigia Orc', hp: 700, cost: { wood: 85, stone: 40 }, attackRange: 18, attackDamage: 19, collisionRadius: 2.0 };
    case 'farm':
      return { name: 'Fazenda de Trigo', hp: 350, cost: { wood: 60, gold: 0, stone: 0 }, collisionRadius: 2.8 };
    case 'bandit_camp':
      return { name: 'Acampamento de Bandidos', hp: 1400, cost: {}, collisionRadius: 4.2 };
    default:
      return { name: 'Construção', hp: 500, cost: { wood: 50 }, collisionRadius: 3.0 };
  }
}
const OLD_buildingAttackCooldown = 1.4;
function OLD_getBuildingHeight(t) {
  switch (t) {
    case 'great_hall': return 10.5;
    case 'castle': return 9.5;
    case 'watchtower': return 9.5;
    case 'orc_watchtower': return 10.0;
    case 'barracks': return 7.0;
    case 'orc_barracks': return 7.5;
    case 'orc_forge': return 6.5;
    case 'forge': return 6.8;
    case 'cottage': return 5.4;
    case 'orc_house': return 5.2;
    case 'pig_farm': return 4.8;
    case 'farm': return 4.5;
    case 'lumber_camp': return 5.2;
    case 'orc_lumber_mill': return 5.4;
    case 'bandit_camp': return 7.0;
    default: return 6.0;
  }
}
const OLD_isTower = (t) => t === 'watchtower' || t === 'orc_watchtower';
const OLD_towerProjectile = (t) => (t === 'orc_watchtower' ? 'axe' : 'arrow');
const OLD_towerOriginY = (t) => (t === 'orc_watchtower' ? 8.2 : 6.8);
const OLD_passive = (t) => ((t === 'farm' || t === 'pig_farm') ? { resource: 'gold', amount: 3, interval: 6.0 } : null);
// queueUnit: HQ só treina trabalhador; quartel não treina trabalhador
function OLD_queueAllowed(bType, uType) {
  if ((bType === 'castle' || bType === 'great_hall') && uType !== 'villager' && uType !== 'peon') return false;
  if ((bType === 'barracks' || bType === 'orc_barracks') && (uType === 'villager' || uType === 'peon')) return false;
  return true;
}

const OLD_UNIT_TRAIN_CONFIG = {
  archer: { type: 'archer', name: 'Arqueiro', icon: '/icoArco.png', cost: { gold: 40, wood: 20, time: 9 }, description: 'Atirador de flechas à distância' },
  knight: { type: 'knight', name: 'Cavaleiro', icon: '/icoEspada.png', cost: { gold: 70, wood: 50, stone: 5, time: 11 }, description: 'Infantaria pesada com espada e armadura' },
  villager: { type: 'villager', name: 'Aldeão', icon: '/icopopulacao.png', cost: { gold: 50, time: 7 }, description: 'Trabalhador, coletor e construtor' },
  peon: { type: 'peon', name: 'Peão', icon: '/icopopulacao.png', cost: { gold: 50, time: 7 }, description: 'Trabalhador e construtor orc' },
  grunt: { type: 'grunt', name: 'Guerreiro Grunt', icon: '/icoEspada.png', cost: { gold: 70, wood: 50, stone: 5, time: 11 }, description: 'Guerreiro orc com espada' },
  axethrower: { type: 'axethrower', name: 'Lançador de Machado', icon: '/icoArco.png', cost: { gold: 40, wood: 20, time: 9 }, description: 'Atirador de machados à distância' },
  ogre: { type: 'ogre', name: 'Ogro', icon: '/icoEspada.png', cost: { gold: 75, wood: 100, stone: 35, time: 14 }, description: 'Bruto colossal com clava' }
};

const OLD_BUILDING_BUILD_CONFIG = {
  cottage: { type: 'cottage', name: 'Casa Residencial', icon: '/icoCasa.svg', cost: { wood: 50 }, description: 'Fornece +5 de capacidade populacional' },
  lumber_camp: { type: 'lumber_camp', name: 'Serraria Florestal', icon: '/icoSerraria.svg', cost: { wood: 80 }, description: 'Ponto de entrega de madeira' },
  farm: { type: 'farm', name: 'Fazenda de Trigo', icon: '/icoFazenda.svg', cost: { wood: 60 }, description: 'Produz colheita e sustento para o reino' },
  barracks: { type: 'barracks', name: 'Quartel de Infantaria', icon: '/icoQuartel.svg', cost: { wood: 120, stone: 60 }, description: 'Treina soldados, arqueiros e cavaleiros' },
  forge: { type: 'forge', name: 'Forja Real', icon: '/icoForja.svg', cost: { wood: 100, stone: 70, gold: 50 }, description: 'Pesquisa melhorias de armas e armaduras' },
  watchtower: { type: 'watchtower', name: 'Torre de Vigia', icon: '/icoTorre.svg', cost: { wood: 80, stone: 40 }, description: 'Torre defensiva com arqueiros' },
  orc_house: { type: 'orc_house', name: 'Toca Orc', icon: '/icoToca.svg', cost: { wood: 50 }, description: 'Fornece +5 de capacidade populacional' },
  pig_farm: { type: 'pig_farm', name: 'Chiqueiro de Porcos', icon: '/icoPorco.svg', cost: { wood: 55 }, description: 'Alimento e +5 de capacidade populacional' },
  orc_lumber_mill: { type: 'orc_lumber_mill', name: 'Serraria Mecânica', icon: '/icoSerrariaOrc.svg', cost: { wood: 85 }, description: 'Ponto de entrega de madeira da Horda' },
  orc_barracks: { type: 'orc_barracks', name: 'Quartel da Horda', icon: '/icoQuartelOrc.svg', cost: { wood: 130, stone: 50 }, description: 'Treina grunts, lanceiros e guerreiros orcs' },
  orc_forge: { type: 'orc_forge', name: 'Forja de Guerra Orc', icon: '/icoForjaOrc.svg', cost: { wood: 100, stone: 70, gold: 50 }, description: 'Forja melhorias de combate para a Horda' },
  orc_watchtower: { type: 'orc_watchtower', name: 'Torre de Vigia Orc', icon: '/icoTorreOrc.svg', cost: { wood: 85, stone: 40 }, description: 'Torre defensiva com arremesso de machados' }
};

const OLD_WORKER_BUILD_LIST = {
  villager: ['cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'watchtower'],
  peon: ['orc_house', 'pig_farm', 'orc_lumber_mill', 'orc_barracks', 'orc_forge', 'orc_watchtower']
};

// src/core/InputManager.js @9f6cb7d (fallback do switch)
function OLD_InputManager_getCost(type) {
  if (OLD_BUILDING_BUILD_CONFIG[type]?.cost) return { cost: OLD_BUILDING_BUILD_CONFIG[type].cost };
  switch (type) {
    case 'lumber_camp': return { cost: { wood: 80 } };
    case 'orc_lumber_mill': return { cost: { wood: 85 } };
    case 'cottage': return { cost: { wood: 50 } };
    case 'pig_farm': return { cost: { wood: 55 } };
    case 'orc_house': return { cost: { wood: 50 } };
    case 'orc_forge': return { cost: { wood: 100, stone: 70, gold: 50 } };
    case 'forge': return { cost: { wood: 100, stone: 70, gold: 50 } };
    case 'barracks': return { cost: { wood: 120, stone: 60 } };
    case 'orc_barracks': return { cost: { wood: 130, stone: 50 } };
    case 'watchtower': return { cost: { wood: 80, stone: 40 } };
    case 'orc_watchtower': return { cost: { wood: 85, stone: 40 } };
    case 'farm': return { cost: { wood: 60 } };
    default: return { cost: { wood: 50 } };
  }
}

// src/ui/UIManager.js @9f6cb7d
const OLD_BUILDING_TRAINABLE_UNITS = {
  barracks: ['archer', 'knight'],
  orc_barracks: ['grunt', 'axethrower', 'ogre'],
  castle: ['villager'],
  great_hall: ['peon']
};

// src/core/FogOfWar.js @9f6cb7d (+ fallbacks 20 unidade / 22 construção)
const OLD_visionRadii = {
  villager: 14, knight: 16, archer: 18,
  peon: 14, grunt: 16, axethrower: 18, ogre: 16,
  castle: 26, great_hall: 26, watchtower: 28, orc_watchtower: 28, barracks: 18, orc_barracks: 18,
  cottage: 14, pig_farm: 14, lumber_camp: 14, orc_lumber_mill: 14, farm: 14
};

// src/core/GameManager.js @9f6cb7d
function OLD_isDropoff(bType, resourceType) {
  if (bType === 'castle' || bType === 'great_hall') return true;
  if (resourceType === 'wood' && (bType === 'lumber_camp' || bType === 'orc_lumber_mill')) return true;
  return false;
}
const OLD_STARTING_RESOURCES = { wood: 240, gold: 200, stone: 120 };

// src/ai/AIDirector.js @9f6cb7d (valores divergentes = bug B3)
function OLD_aiDirector(faction) {
  return {
    workerType: faction === 'orc' ? 'peon' : 'villager',
    meleeType: faction === 'orc' ? 'grunt' : 'knight',
    rangedType: faction === 'orc' ? 'axethrower' : 'archer',
    siegeType: faction === 'orc' ? 'ogre' : 'knight',
    hqType: faction === 'orc' ? 'great_hall' : 'castle',
    barracksType: faction === 'orc' ? 'orc_barracks' : 'barracks',
    farmType: faction === 'orc' ? 'pig_farm' : 'cottage',
    houseType: faction === 'orc' ? 'orc_house' : 'cottage',
    lumberType: faction === 'orc' ? 'orc_lumber_mill' : 'lumber_camp',
    towerType: faction === 'orc' ? 'orc_watchtower' : 'watchtower',
    forgeType: faction === 'orc' ? 'orc_forge' : 'forge',
    costs: {
      worker: { gold: 50, time: 7 },
      melee: { gold: 70, wood: 50, stone: 5, time: 11 },
      ranged: { wood: 60, gold: 35, time: 9 },
      siege: { wood: 100, gold: 75, stone: 35, time: 14 },
      farm: { wood: 50 },
      house: { wood: 50 },
      barracks: { wood: 120, stone: 60 },
      lumber: { wood: 80 },
      tower: { wood: 80, stone: 40 },
      forge: { wood: 100, stone: 70, gold: 50 }
    },
    resources: { wood: 240, gold: 200, stone: 120 }
  };
}

// src/core/UpgradeConfig.js @9f6cb7d (números)
const OLD_UPGRADES = {
  infantry_attack: { statType: 'attack', bonus: 5, cost: { gold: 100, wood: 50, time: 14 }, appliesTo: ['knight', 'grunt', 'ogre'] },
  infantry_defense: { statType: 'defense', bonus: 3, cost: { gold: 80, stone: 70, time: 14 }, appliesTo: ['knight', 'grunt', 'ogre'] },
  ranged_attack: { statType: 'attack', bonus: 4, cost: { gold: 90, wood: 60, time: 14 }, appliesTo: ['archer', 'axethrower'] },
  ranged_defense: { statType: 'defense', bonus: 2, cost: { gold: 70, wood: 50, time: 14 }, appliesTo: ['archer', 'axethrower'] }
};
const OLD_FORGE_UPGRADES = ['infantry_attack', 'infantry_defense', 'ranged_attack', 'ranged_defense'];

// ===========================================================================
// Comparação
// ===========================================================================

const UNIT_TYPES = ['villager', 'knight', 'archer', 'bandit', 'peon', 'grunt', 'axethrower', 'ogre', '__desconhecido__'];
const BUILDING_TYPES = ['castle', 'great_hall', 'lumber_camp', 'orc_lumber_mill', 'cottage', 'pig_farm', 'orc_house',
  'orc_forge', 'forge', 'barracks', 'orc_barracks', 'watchtower', 'orc_watchtower', 'farm', 'bandit_camp', '__desconhecido__'];
const RESOURCES = [null, 'wood', 'gold', 'stone'];

/** Normaliza para comparação: ordena chaves e remove custos zerados (0 e ausente são equivalentes em canAfford/deduct/HUD). */
function norm(v) {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] === 0 && ['gold', 'wood', 'stone'].includes(k)) continue;
      out[k] = norm(v[k]);
    }
    return out;
  }
  return v;
}
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

let checks = 0;
const failures = [];
const expected = [];
function check(label, oldV, newV) {
  checks++;
  if (!same(oldV, newV)) failures.push({ label, old: oldV, new: newV });
}

// --- Unit ---
const fakeUnit = (type) => ({ type });
for (const t of UNIT_TYPES) {
  const o = OLD_getUnitStats(t);
  const n = Unit.prototype.getUnitStats.call({}, t);
  // o construtor aplica `armor || 0` e `collisionRadius || 0.6`
  check(`Unit.getUnitStats(${t})`, { ...o, armor: o.armor || 0 }, { ...n, armor: n.armor || 0 });
  check(`Unit.getHealthBarHeight(${t})`, OLD_getHealthBarHeight(t), Unit.prototype.getHealthBarHeight.call(fakeUnit(t)));
  check(`Unit.isCombatUnit(${t})`, OLD_isCombatUnit(t), Unit.prototype.isCombatUnit.call(fakeUnit(t)));
  check(`Unit.isWorker(${t})`, OLD_isWorker(t), Unit.prototype.isWorker.call(fakeUnit(t)));
  const d = getUnitDef(t);
  check(`Unit.isRanged(${t})`, OLD_isRanged(t), d.isRanged);
  if (OLD_isRanged(t)) check(`Unit.projectile(${t})`, OLD_projectile(t), d.projectile);
  if (OLD_isCombatUnit(t)) {
    check(`Unit.aggroRange(${t})`, OLD_aggroRange(t), d.aggroRange);
    check(`Unit.threatScanRange(${t})`, OLD_threatScanRange(t), d.threatScanRange);
  }
  check(`Unit.retargetRange(${t})`, OLD_retargetRange, d.retargetRange);
  check(`Unit.helpRadius(${t})`, OLD_helpRadius, d.helpRadius);
  check(`FogOfWar.vision(${t})`, OLD_visionRadii[t] || 20, VISION_RADII[t] || DEFAULT_UNIT.visionRadius);
}
check('Unit.carrying.max', OLD_carryMax, WORKER_STATS.carryCapacity);

// --- Building ---
for (const t of BUILDING_TYPES) {
  const o = OLD_getBuildingStats(t);
  const n = Building.getBuildingStats(t);
  // campos como o construtor os lê (com os mesmos fallbacks `|| 0`, `|| 3.0`)
  const asCtor = (s, cd) => ({
    name: s.name, hp: s.hp, cost: s.cost, popGranted: s.popGranted || 0,
    attackRange: s.attackRange || 0, attackDamage: s.attackDamage || 0,
    collisionRadius: s.collisionRadius || 3.0, attackCooldown: cd
  });
  check(`Building.getBuildingStats(${t})`, asCtor(o, OLD_buildingAttackCooldown), asCtor(n, n.attackCooldown));
  check(`Building.getBuildingHeight(${t})`, OLD_getBuildingHeight(t), Building.prototype.getBuildingHeight.call({ type: t }));
  const d = getBuildingDef(t);
  check(`Building.isTower(${t})`, OLD_isTower(t), !!d.tower);
  if (OLD_isTower(t)) {
    check(`Building.towerProjectile(${t})`, OLD_towerProjectile(t), d.tower.projectile);
    check(`Building.towerOriginY(${t})`, OLD_towerOriginY(t), d.tower.projectileOriginY);
  }
  check(`Building.passiveIncome(${t})`, OLD_passive(t), d.passiveIncome);
  check(`FogOfWar.vision(${t})`, OLD_visionRadii[t] || 22, VISION_RADII[t] || DEFAULT_BUILDING.visionRadius);
  // InputManager.getCost só é chamado para tipos do painel do trabalhador (UIManager -> startPlacement).
  // HQ/acampamento nunca são posicionados pelo jogador: antes caíam no default {wood:50}, agora
  // devolvem o custo real (inalcançável no jogo), então ficam fora da comparação.
  if (OLD_BUILDING_BUILD_CONFIG[t] || t === '__desconhecido__') {
    check(`InputManager.getCost(${t})`, OLD_InputManager_getCost(t), InputManager.prototype.getCost.call({}, t));
  }
  for (const r of RESOURCES) {
    check(`GameManager.dropoff(${t}, ${r})`, OLD_isDropoff(t, r), GameManager.prototype.findNearestDropoff.call(
      { buildings: [] },
      { distanceTo: () => 1 }, r,
      [{ type: t, isConstructed: true, ownerId: 0, isDead: false, mesh: { position: {} } }],
      0
    ) !== null);
  }
  for (const u of UNIT_TYPES) {
    // F2-01: queueUnit cobra do Player dono (gm.getPlayer(ownerId)), não mais do GameManager.
    const fakeBld = Object.assign(Object.create(Building.prototype), { type: t, queue: [], ownerId: 0, gameManager: null });
    const owner = { canAfford: () => true, deduct: () => {}, population: 0, maxPopulation: 99 };
    const gm = { buildings: [], getPlayer: () => owner };
    const oldOk = OLD_queueAllowed(t, u) && !!OLD_UNIT_TRAIN_CONFIG[u];
    check(`Building.queueUnit(${t}, ${u})`, oldOk, Building.prototype.queueUnit.call(fakeBld, u, gm));
  }
}

// --- Tabelas exportadas ---
check('UNIT_TRAIN_CONFIG', OLD_UNIT_TRAIN_CONFIG, UNIT_TRAIN_CONFIG);
check('BUILDING_BUILD_CONFIG', OLD_BUILDING_BUILD_CONFIG, BUILDING_BUILD_CONFIG);
check('WORKER_BUILD_LIST', OLD_WORKER_BUILD_LIST, WORKER_BUILD_LIST);
check('BUILDING_TRAINABLE_UNITS', OLD_BUILDING_TRAINABLE_UNITS, BUILDING_TRAINABLE_UNITS);
check('GameManager.resources iniciais', OLD_STARTING_RESOURCES, STARTING_RESOURCES);

// --- Pesquisas ---
check('FORGE_UPGRADES', OLD_FORGE_UPGRADES, FORGE_UPGRADES);
for (const [id, o] of Object.entries(OLD_UPGRADES)) {
  const n = UPGRADE_CONFIG[id];
  const applies = UNIT_TYPES.filter(t => n.appliesTo(t));
  check(`UPGRADE_CONFIG.${id}`, o, { statType: n.statType, bonus: n.bonus, cost: n.cost, appliesTo: applies });
}

// --- IA (B3: custos são a única diferença esperada) ---
for (const faction of ['orc', 'human']) {
  const o = OLD_aiDirector(faction);
  // F2-01: a IA recebe um playerId e lê a facção do Player.
  // Player real com os padrões (recursos iniciais de src/data) = o que o GameManager cria para a IA.
  const aiPlayer = new Player({ id: 1, factionId: faction, isAI: true });
  const ai = new AIDirector({ getPlayer: () => aiPlayer }, 1);
  for (const k of Object.keys(o)) {
    if (k === 'costs') continue;
    check(`AIDirector(${faction}).${k}`, o[k], ai[k]);
  }
  // Os custos novos têm que bater com a tabela real (o que Building.queueUnit / InputManager cobram)
  const real = {
    worker: UNIT_TRAIN_CONFIG[ai.workerType].cost,
    melee: UNIT_TRAIN_CONFIG[ai.meleeType].cost,
    ranged: UNIT_TRAIN_CONFIG[ai.rangedType].cost,
    siege: UNIT_TRAIN_CONFIG[ai.siegeType].cost,
    farm: getCost(ai.farmType),
    house: getCost(ai.houseType),
    barracks: getCost(ai.barracksType),
    lumber: getCost(ai.lumberType),
    tower: getCost(ai.towerType),
    forge: getCost(ai.forgeType)
  };
  for (const k of Object.keys(o.costs)) {
    check(`AIDirector(${faction}).costs.${k} == custo real`, real[k], ai.costs[k]);
    if (!same(o.costs[k], ai.costs[k])) {
      expected.push(`AIDirector(${faction}).costs.${k}: ${JSON.stringify(o.costs[k])} -> ${JSON.stringify(ai.costs[k])}`);
    }
  }
}

// ===========================================================================
console.log(`F0-06 paridade de dados: ${checks} checagens`);
if (expected.length) {
  console.log(`\nDiferenças esperadas (correção B3 — IA agora usa o custo real): ${expected.length}`);
  for (const e of expected) console.log('  ~ ' + e);
}
if (failures.length) {
  console.log(`\nDIVERGÊNCIAS NÃO ESPERADAS: ${failures.length}`);
  for (const f of failures) {
    console.log(`  x ${f.label}\n      antigo: ${JSON.stringify(norm(f.old))}\n      novo:   ${JSON.stringify(norm(f.new))}`);
  }
  process.exit(1);
}
console.log('\nOK: todos os valores antigos são idênticos aos novos (exceto B3).');
