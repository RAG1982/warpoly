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
 * - hp, speed, attackRange, attackCooldown, armor, collisionRadius.
 * - damage {basic, piercing, type}  F3-03: substitui o antigo campo `attack` plano. `type` é
 *   um de `DAMAGE_TYPES` (`src/sim/combat.js`): 'normal' | 'piercing' | 'siege' | 'magic'.
 *   `getUnitStats` (`src/data/index.js`) deriva `attack = basic + piercing` para leitura
 *   legada (AI/HUD) — nenhum código novo lê `attack` para calcular dano.
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
    entityName: 'Aldeão',
    faction: 'human',
    hp: 85, speed: 4.5, damage: { basic: 5, piercing: 2, type: 'normal' }, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
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
    entityName: 'Cavaleiro',
    faction: 'human',
    hp: 200, speed: 4.8, damage: { basic: 20, piercing: 7, type: 'normal' }, attackRange: 2.1, attackCooldown: 1.1, armor: 4,
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
    entityName: 'Arqueiro',
    faction: 'human',
    hp: 102, speed: 4.3, damage: { basic: 6, piercing: 12, type: 'piercing' }, attackRange: 14.0, attackCooldown: 1.4, armor: 0,
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
    entityName: 'Peão',
    faction: 'orc',
    hp: 90, speed: 4.5, damage: { basic: 6, piercing: 2, type: 'normal' }, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
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
    entityName: 'Guerreiro Grunt',
    faction: 'orc',
    hp: 198, speed: 4.7, damage: { basic: 22, piercing: 6, type: 'normal' }, attackRange: 2.1, attackCooldown: 1.15, armor: 4,
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
    entityName: 'Lançador de Machado',
    faction: 'orc',
    hp: 96, speed: 4.4, damage: { basic: 7, piercing: 12, type: 'piercing' }, attackRange: 13.5, attackCooldown: 1.35, armor: 0,
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
    entityName: 'Ogro',
    faction: 'orc',
    hp: 320, speed: 4.0, damage: { basic: 32, piercing: 10, type: 'normal' }, attackRange: 2.5, attackCooldown: 1.5, armor: 5,
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

  // --- Classe avançada do atirador (F3-07): só via pesquisa `ranged_class`; modelo 3D do
  // arqueiro/lançador (`modelOf`) até a arte nova (F7). Base = atirador +10% PV, +1 perfurante.
  ranger: {
    type: 'ranger',
    modelOf: 'archer',
    requires: [{ research: 'ranged_class' }],
    name: 'Patrulheiro',
    entityName: 'Patrulheiro',
    faction: 'human',
    hp: 112, speed: 4.3, damage: { basic: 6, piercing: 13, type: 'piercing' }, attackRange: 14.0, attackCooldown: 1.4, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.4,
    cost: { gold: 40, wood: 20, stone: 0 },
    trainTime: 9,
    icon: '/icoArco.png',
    description: 'Arqueiro de elite, mais resistente e certeiro',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'arrow'
  },
  berserker: {
    type: 'berserker',
    modelOf: 'axethrower',
    requires: [{ research: 'ranged_class' }],
    name: 'Enfurecido',
    entityName: 'Enfurecido',
    faction: 'orc',
    hp: 105, speed: 4.4, damage: { basic: 7, piercing: 13, type: 'piercing' }, attackRange: 13.5, attackCooldown: 1.35, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.4,
    cost: { gold: 40, wood: 20, stone: 0 },
    trainTime: 9,
    icon: '/icoArco.png',
    description: 'Lançador de machados em fúria, mais resistente e certeiro',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'axe'
  },

  // --- Neutro ---
  bandit: {
    type: 'bandit',
    name: 'Bandido',
    entityName: 'Bandido',
    faction: 'neutral',
    hp: 125, speed: 4.4, damage: { basic: 12, piercing: 4, type: 'normal' }, attackRange: 2.1, attackCooldown: 1.2, armor: 1,
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
  entityName: 'Unidade',
  faction: 'neutral',
  hp: 100, speed: 4.0, damage: { basic: 10, piercing: 0, type: 'normal' }, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
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
