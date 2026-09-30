/**
 * buildings.js — Fonte única de verdade das construções (F0-06).
 *
 * Campos:
 * - name          Nome PT-BR exibido no painel de construção do trabalhador (D2: provisório até a F3-00).
 * - entityName    Rótulo atual do card de seleção (legado; unificar com `name` na F3-00/F6-09).
 * - faction       'human' | 'orc' | 'neutral'.
 * - role          'hq' | 'house' | 'farm' | 'lumber' | 'barracks' | 'forge' | 'tower' | 'camp'.
 * - hp, cost {gold, wood, stone}, collisionRadius, popGranted.
 * - armor         F3-03: armadura da construção (corrige B5 — antes não existia). HQ/torres
 *                  20, muralhas 10 (quando existirem), demais 15 (design §6).
 * - visionRadius  Raio revelado na névoa de guerra.
 * - healthBarHeight  Altura do topo do modelo (a barra de vida fica 0,8 acima).
 * - tower         { range, damage: {basic, piercing, type}, cooldown, projectile,
 *                  projectileOriginY } ou null. F3-03: `damage` era um número plano.
 * - passiveIncome { resource, amount, interval } ou null (F3-04: sempre null — ouro só sai de
 *   mina/pedreira; campo mantido no schema para não quebrar `getBuildingDef`/`Building.simUpdate`).
 * - requires      Tipos de construção que o dono precisa ter concluída (≥1) para erguer esta
 *                  (F3-04, `src/sim/requirements.js`); [] ou ausente = sem requisito.
 * - trains        Tipos de unidade treináveis (ordem = ordem dos botões na HUD).
 * - dropoff       Recursos aceitos como ponto de entrega ([] = não é ponto de entrega).
 * - icon, description.
 */

const HQ_DROPOFF = ['wood', 'gold', 'stone'];
const LUMBER_DROPOFF = ['wood'];

export const BUILDINGS = {
  // --- Reino Humano ---
  castle: {
    type: 'castle',
    name: 'Castelo Real',
    entityName: 'Castelo Real',
    faction: 'human',
    role: 'hq',
    hp: 1600,
    armor: 20,
    cost: { gold: 0, wood: 200, stone: 150 },
    collisionRadius: 5.5,
    popGranted: 5,
    visionRadius: 26,
    healthBarHeight: 9.5,
    tower: null,
    passiveIncome: null,
    trains: ['villager'],
    dropoff: HQ_DROPOFF,
    icon: '/icoCasa.svg',
    description: 'Centro do reino: treina aldeões e recebe todos os recursos'
  },
  cottage: {
    type: 'cottage',
    name: 'Casa Residencial',
    entityName: 'Chalé / Casa',
    faction: 'human',
    role: 'house',
    hp: 400,
    armor: 15,
    cost: { gold: 0, wood: 50, stone: 0 },
    collisionRadius: 2.8,
    popGranted: 5,
    visionRadius: 14,
    healthBarHeight: 5.4,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoCasa.svg',
    description: 'Fornece +5 de capacidade populacional'
  },
  lumber_camp: {
    type: 'lumber_camp',
    name: 'Serraria Florestal',
    entityName: 'Campo de Madeira',
    faction: 'human',
    role: 'lumber',
    hp: 550,
    armor: 15,
    cost: { gold: 0, wood: 80, stone: 0 },
    collisionRadius: 3.2,
    popGranted: 0,
    visionRadius: 14,
    healthBarHeight: 5.2,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: LUMBER_DROPOFF,
    icon: '/icoSerraria.svg',
    description: 'Ponto de entrega de madeira'
  },
  farm: {
    type: 'farm',
    name: 'Fazenda de Trigo',
    entityName: 'Fazenda de Trigo',
    faction: 'human',
    role: 'farm',
    hp: 350,
    armor: 15,
    cost: { gold: 0, wood: 60, stone: 0 },
    collisionRadius: 2.8,
    popGranted: 0,
    visionRadius: 14,
    healthBarHeight: 4.5,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoFazenda.svg',
    description: 'Produz colheita e sustento para o reino'
  },
  barracks: {
    type: 'barracks',
    name: 'Quartel de Infantaria',
    entityName: 'Quartel de Infantaria',
    faction: 'human',
    role: 'barracks',
    hp: 850,
    armor: 15,
    cost: { gold: 0, wood: 120, stone: 60 },
    collisionRadius: 3.5,
    popGranted: 0,
    visionRadius: 18,
    healthBarHeight: 7.0,
    tower: null,
    passiveIncome: null,
    requires: ['farm'],
    trains: ['archer', 'knight'],
    dropoff: [],
    icon: '/icoQuartel.svg',
    description: 'Treina soldados, arqueiros e cavaleiros'
  },
  forge: {
    type: 'forge',
    name: 'Forja Real',
    entityName: 'Forja Real',
    faction: 'human',
    role: 'forge',
    hp: 850,
    armor: 15,
    cost: { gold: 50, wood: 100, stone: 70 },
    collisionRadius: 3.4,
    popGranted: 0,
    visionRadius: 22,
    healthBarHeight: 6.8,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoForja.svg',
    description: 'Pesquisa melhorias de armas e armaduras'
  },
  watchtower: {
    type: 'watchtower',
    name: 'Torre de Vigia',
    entityName: 'Torre de Vigia',
    faction: 'human',
    role: 'tower',
    hp: 650,
    armor: 20,
    cost: { gold: 0, wood: 80, stone: 40 },
    collisionRadius: 2.0,
    popGranted: 0,
    visionRadius: 28,
    healthBarHeight: 9.5,
    tower: { range: 18, damage: { basic: 6, piercing: 12, type: 'piercing' }, cooldown: 1.4, projectile: 'arrow', projectileOriginY: 6.8 },
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoTorre.svg',
    description: 'Torre defensiva com arqueiros'
  },

  // --- Clãs Orcs ---
  great_hall: {
    type: 'great_hall',
    name: 'Grande Salão Orc',
    entityName: 'Grande Salão Orc',
    faction: 'orc',
    role: 'hq',
    hp: 1600, // F3-06 NEW-24: alinhado a HQ_TIER_HP[1] (src/data/tiers.js) — antes 1750.
    armor: 20,
    cost: { gold: 0, wood: 220, stone: 140 },
    collisionRadius: 5.5,
    popGranted: 5,
    visionRadius: 26,
    healthBarHeight: 10.5,
    tower: null,
    passiveIncome: null,
    trains: ['peon'],
    dropoff: HQ_DROPOFF,
    icon: '/icoToca.svg',
    description: 'Centro do clã: treina peões e recebe todos os recursos'
  },
  orc_house: {
    type: 'orc_house',
    name: 'Toca Orc',
    entityName: 'Toca Orc',
    faction: 'orc',
    role: 'house',
    hp: 450,
    armor: 15,
    cost: { gold: 0, wood: 50, stone: 0 },
    collisionRadius: 2.8,
    popGranted: 5,
    visionRadius: 22,
    healthBarHeight: 5.2,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoToca.svg',
    description: 'Fornece +5 de capacidade populacional'
  },
  pig_farm: {
    type: 'pig_farm',
    name: 'Chiqueiro de Porcos',
    entityName: 'Fazenda de Porcos',
    faction: 'orc',
    role: 'farm',
    hp: 420,
    armor: 15,
    cost: { gold: 0, wood: 55, stone: 0 },
    collisionRadius: 2.8,
    popGranted: 5,
    visionRadius: 14,
    healthBarHeight: 4.8,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoPorco.svg',
    description: 'Alimento e +5 de capacidade populacional'
  },
  orc_lumber_mill: {
    type: 'orc_lumber_mill',
    name: 'Serraria Mecânica',
    entityName: 'Serraria Orc',
    faction: 'orc',
    role: 'lumber',
    hp: 580,
    armor: 15,
    cost: { gold: 0, wood: 85, stone: 0 },
    collisionRadius: 3.2,
    popGranted: 0,
    visionRadius: 14,
    healthBarHeight: 5.4,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: LUMBER_DROPOFF,
    icon: '/icoSerrariaOrc.svg',
    description: 'Ponto de entrega de madeira da Horda'
  },
  orc_barracks: {
    type: 'orc_barracks',
    name: 'Quartel da Horda',
    entityName: 'Quartel Orc',
    faction: 'orc',
    role: 'barracks',
    hp: 900,
    armor: 15,
    cost: { gold: 0, wood: 130, stone: 50 },
    collisionRadius: 3.6,
    popGranted: 0,
    visionRadius: 18,
    healthBarHeight: 7.5,
    tower: null,
    passiveIncome: null,
    requires: ['pig_farm'],
    trains: ['grunt', 'axethrower', 'ogre'],
    dropoff: [],
    icon: '/icoQuartelOrc.svg',
    description: 'Treina grunts, lanceiros e guerreiros orcs'
  },
  orc_forge: {
    type: 'orc_forge',
    name: 'Forja de Guerra Orc',
    entityName: 'Forja Orc',
    faction: 'orc',
    role: 'forge',
    hp: 850,
    armor: 15,
    cost: { gold: 50, wood: 100, stone: 70 },
    collisionRadius: 3.4,
    popGranted: 0,
    visionRadius: 22,
    healthBarHeight: 6.5,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoForjaOrc.svg',
    description: 'Forja melhorias de combate para a Horda'
  },
  orc_watchtower: {
    type: 'orc_watchtower',
    name: 'Torre de Vigia Orc',
    entityName: 'Torre de Vigia Orc',
    faction: 'orc',
    role: 'tower',
    hp: 700,
    armor: 20,
    cost: { gold: 0, wood: 85, stone: 40 },
    collisionRadius: 2.0,
    popGranted: 0,
    visionRadius: 28,
    healthBarHeight: 10.0,
    tower: { range: 18, damage: { basic: 7, piercing: 12, type: 'piercing' }, cooldown: 1.4, projectile: 'axe', projectileOriginY: 8.2 },
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoTorreOrc.svg',
    description: 'Torre defensiva com arremesso de machados'
  },

  // --- Neutro ---
  bandit_camp: {
    type: 'bandit_camp',
    name: 'Acampamento de Bandidos',
    entityName: 'Acampamento de Bandidos',
    faction: 'neutral',
    role: 'camp',
    hp: 1400,
    armor: 15,
    cost: { gold: 0, wood: 0, stone: 0 },
    collisionRadius: 4.2,
    popGranted: 0,
    visionRadius: 22,
    healthBarHeight: 7.0,
    tower: null,
    passiveIncome: null,
    trains: [],
    dropoff: [],
    icon: '/icoTorre.svg',
    description: 'Covil de saqueadores neutros'
  }
};

/** Valores usados quando o tipo não está em BUILDINGS (mesmos fallbacks de antes da F0-06). */
export const DEFAULT_BUILDING = {
  type: 'building',
  name: 'Construção',
  entityName: 'Construção',
  faction: 'neutral',
  role: null,
  hp: 500,
  armor: 15,
  cost: { gold: 0, wood: 50, stone: 0 },
  collisionRadius: 3.0,
  popGranted: 0,
  visionRadius: 22,
  healthBarHeight: 6.0,
  tower: null,
  passiveIncome: null,
  trains: [],
  dropoff: [],
  icon: '/icoCasa.svg',
  description: ''
};

/** Cooldown de ataque atribuído a construções sem `tower` (não é usado, mas preserva o campo). */
export const DEFAULT_BUILDING_ATTACK_COOLDOWN = 1.4;
