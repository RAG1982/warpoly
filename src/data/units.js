/**
 * units.js — Fonte única de verdade das unidades (F0-06).
 *
 * Todo número de balanceamento de unidade vive aqui. `Unit`, `Building`,
 * `FogOfWar`, `UIManager` e a IA leem destes registros (direto ou via
 * helpers de `src/data/index.js`). Não duplique estes valores em outro lugar.
 *
 * Campos:
 * - name          Nome PT-BR exibido nos menus de treino (ver D2: será trocado pelo glossário da F3-00).
 * - entityName    Rótulo atual do card de seleção (legado; unificar com `name` na F3-00/F6-09).
 * - faction       'human' | 'orc' | 'neutral'.
 * - hp, speed, attack, attackRange, attackCooldown, armor, collisionRadius.
 * - visionRadius  Raio revelado na névoa de guerra.
 * - aggroRange    Raio de auto-aggro quando ocioso (unidades de combate).
 * - threatScanRange  Raio de reescaneamento de ameaças ao atacar construção/trabalhador.
 * - retargetRange Raio de busca de novo alvo após matar o atual.
 * - helpRadius    Raio em que aliados de combate ociosos acodem quando esta unidade é atingida.
 * - healthBarHeight  Altura da barra de vida 3D acima do pé do modelo.
 * - cost {gold, wood, stone}, trainTime (s). `null` = não treinável.
 * - icon, description.
 * - isWorker, isRanged, isCombat, projectile ('arrow' | 'axe' | null).
 */

// Raios de varredura compartilhados (antes hardcoded em Unit.js: 11/14, 13/15, 16, 14).
const MELEE_SCAN = { aggroRange: 11, threatScanRange: 13, retargetRange: 16, helpRadius: 14 };
const RANGED_SCAN = { aggroRange: 14, threatScanRange: 15, retargetRange: 16, helpRadius: 14 };

export const UNITS = {
  // --- Reino Humano ---
  villager: {
    type: 'villager',
    name: 'Aldeão',
    entityName: 'Villager',
    faction: 'human',
    hp: 85, speed: 4.5, attack: 7, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 14,
    ...MELEE_SCAN,
    healthBarHeight: 3.1,
    cost: { gold: 50, wood: 0, stone: 0 },
    trainTime: 7,
    icon: '/icopopulacao.png',
    description: 'Trabalhador, coletor e construtor',
    isWorker: true, isRanged: false, isCombat: false, projectile: null
  },
  knight: {
    type: 'knight',
    name: 'Cavaleiro',
    entityName: 'Knight',
    faction: 'human',
    hp: 190, speed: 4.8, attack: 26, attackRange: 2.1, attackCooldown: 1.1, armor: 4,
    collisionRadius: 0.84,
    visionRadius: 16,
    ...MELEE_SCAN,
    healthBarHeight: 3.9,
    cost: { gold: 70, wood: 50, stone: 5 },
    trainTime: 11,
    icon: '/icoEspada.png',
    description: 'Infantaria pesada com espada e armadura',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  },
  archer: {
    type: 'archer',
    name: 'Arqueiro',
    entityName: 'Archer',
    faction: 'human',
    hp: 95, speed: 4.3, attack: 18, attackRange: 14.0, attackCooldown: 1.4, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.4,
    cost: { gold: 40, wood: 20, stone: 0 },
    trainTime: 9,
    icon: '/icoArco.png',
    description: 'Atirador de flechas à distância',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'arrow'
  },

  // --- Clãs Orcs ---
  peon: {
    type: 'peon',
    name: 'Peão',
    entityName: 'Orc Peon',
    faction: 'orc',
    hp: 90, speed: 4.5, attack: 8, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 14,
    ...MELEE_SCAN,
    healthBarHeight: 3.1,
    cost: { gold: 50, wood: 0, stone: 0 },
    trainTime: 7,
    icon: '/icopopulacao.png',
    description: 'Trabalhador e construtor orc',
    isWorker: true, isRanged: false, isCombat: false, projectile: null
  },
  grunt: {
    type: 'grunt',
    name: 'Guerreiro Grunt',
    entityName: 'Orc Grunt',
    faction: 'orc',
    hp: 205, speed: 4.7, attack: 28, attackRange: 2.1, attackCooldown: 1.15, armor: 4,
    collisionRadius: 0.86,
    visionRadius: 16,
    ...MELEE_SCAN,
    healthBarHeight: 3.9,
    cost: { gold: 70, wood: 50, stone: 5 },
    trainTime: 11,
    icon: '/icoEspada.png',
    description: 'Guerreiro orc com espada',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  },
  axethrower: {
    type: 'axethrower',
    name: 'Lançador de Machado',
    entityName: 'Troll Axethrower',
    faction: 'orc',
    hp: 100, speed: 4.4, attack: 19, attackRange: 13.5, attackCooldown: 1.35, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.4,
    cost: { gold: 40, wood: 20, stone: 0 },
    trainTime: 9,
    icon: '/icoArco.png',
    description: 'Atirador de machados à distância',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'axe'
  },
  ogre: {
    type: 'ogre',
    name: 'Ogro',
    entityName: 'Orc Ogre',
    faction: 'orc',
    hp: 320, speed: 4.0, attack: 42, attackRange: 2.5, attackCooldown: 1.5, armor: 5,
    collisionRadius: 1.08,
    visionRadius: 16,
    ...MELEE_SCAN,
    healthBarHeight: 4.5,
    cost: { gold: 75, wood: 100, stone: 35 },
    trainTime: 14,
    icon: '/icoEspada.png',
    description: 'Bruto colossal com clava',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  },

  // --- Neutro ---
  bandit: {
    type: 'bandit',
    name: 'Bandido',
    entityName: 'Bandit Raider',
    faction: 'neutral',
    hp: 125, speed: 4.4, attack: 16, attackRange: 2.1, attackCooldown: 1.2, armor: 1,
    collisionRadius: 0.84,
    visionRadius: 20,
    ...MELEE_SCAN,
    healthBarHeight: 3.6,
    cost: null,
    trainTime: null,
    icon: '/icoEspada.png',
    description: 'Saqueador neutro',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  }
};

/** Valores usados quando o tipo não está em UNITS (mesmos fallbacks de antes da F0-06). */
export const DEFAULT_UNIT = {
  type: 'unit',
  name: 'Unidade',
  entityName: 'Unit',
  faction: 'neutral',
  hp: 100, speed: 4.0, attack: 10, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
  collisionRadius: 0.72,
  visionRadius: 20,
  ...MELEE_SCAN,
  healthBarHeight: 3.5,
  cost: null,
  trainTime: null,
  icon: '/icopopulacao.png',
  description: '',
  isWorker: false, isRanged: false, isCombat: false, projectile: null
};

/** Parâmetros do trabalhador (capacidade de carga). */
export const WORKER_STATS = {
  carryCapacity: 15
};
