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
 * - isWorker, isRanged, isCombat, projectile ('arrow' | 'axe' | 'bolt' | 'boulder' | null).
 * - minAttackRange  F4-02: alcance mínimo (distância de borda; 0/ausente = sem). Alvo mais perto que
 *   isso não pode ser atacado: a unidade recua até `minAttackRange + 0,5` (cerco).
 * - splashRadius    F4-02: raio de dano em área no impacto (0/ausente = sem). 100% no centro → 50%
 *   na borda; só entidades hostis ao dono (sem fogo amigo). Projéteis `bolt`/`boulder` são
 *   balísticos: não perseguem o alvo, miram a posição prevista (`src/entities/BallisticProjectile.js`).
 * - suicide        F4-05: unidade suicida (Sapadores/Incendiários). Ao entrar no `attackRange` do alvo
 *   detona (`Unit._detonate`): dano `damage` em área (`splashRadius`, queda 100% → 40% na borda, só
 *   hostis), morre sem cadáver. Não auto-adquire unidades (só construções/muralhas; em `hold` sim).
 * - maxMana, startMana, manaRegen, abilities   F4-03 (todos opcionais): `maxMana` 0/ausente = sem mana (design:
 *   máx. 255); `startMana` (padrão = maxMana); `manaRegen` mana/s (padrão 1); `abilities` ids de
 *   `src/data/abilities.js`, na ordem do card 3×3 (máx. 9). F4-04: Mago Arcano e Necromante das Cinzas usam isso.
 * - detector        F4-04: detecta unidades invisíveis num raio (`DETECT_RADIUS`). Nenhuma unidade tem ainda (F4-06: Planador).
 * - undead          F4-04: marcador de morto-vivo (esqueleto; alvo do Exorcismo na F4-04b).
 * - corpseless      F4-04: não deixa cadáver ao morrer (cerco, suicidas, esqueletos, ovelhas).
 * - isSiege         F4-04: unidade de cerco (imune à Transmutação). `isHero` idem (heróis na F4-08).
 */

// Raios de varredura compartilhados (antes hardcoded em Unit.js: 11/14, 13/15, 16, 14).
const MELEE_SCAN = { aggroRange: 11, threatScanRange: 13, retargetRange: 16, helpRadius: 14 };
const RANGED_SCAN = { aggroRange: 14, threatScanRange: 15, retargetRange: 16, helpRadius: 14 };

export const UNITS = {
  // --- Reino Humano ---
  villager: {
    type: 'villager',
    name: 'Camponês',
    entityName: 'Camponês',
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
    name: 'Espadachim',
    entityName: 'Espadachim',
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
  cavalier: {
    type: 'cavalier',
    name: 'Cavaleiro',
    entityName: 'Cavaleiro',
    faction: 'human',
    requires: [{ hq: 2 }], // F4-01: cavalaria, treinada no Estábulo Real (Centro nível 2)
    hp: 300, speed: 6.2, damage: { basic: 26, piercing: 8, type: 'normal' }, attackRange: 2.3, attackCooldown: 1.2, armor: 4,
    collisionRadius: 1.0,
    visionRadius: 18,
    ...MELEE_SCAN,
    healthBarHeight: 4.6,
    cost: { gold: 120, wood: 60, stone: 20 },
    trainTime: 14,
    icon: '/icoEspada.png',
    description: 'Cavalaria pesada: rápida e mortal em campo aberto',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  },
  archer: {
    type: 'archer',
    name: 'Arqueiro',
    entityName: 'Arqueiro',
    faction: 'human',
    hp: 97, speed: 4.3, damage: { basic: 6, piercing: 12, type: 'piercing' }, attackRange: 14.0, attackCooldown: 1.4, armor: 0,
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

  // F4-02: cerco humano, treinado na Oficina de Engenharia (Centro nível 2). Dano 'siege':
  // ×1,5 contra construções e ×0,5 contra unidades (`src/sim/combat.js`).
  ballista: {
    type: 'ballista',
    name: 'Balista',
    entityName: 'Balista',
    faction: 'human',
    requires: [{ hq: 2 }],
    hp: 220, speed: 3.0, damage: { basic: 80, piercing: 0, type: 'siege' }, attackRange: 20, attackCooldown: 3.2, armor: 0,
    minAttackRange: 4, splashRadius: 1.5,
    collisionRadius: 1.3,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.6,
    cost: { gold: 90, wood: 200, stone: 40 },
    trainTime: 18,
    icon: '/icoArco.png',
    description: 'Cerco: besta gigante de longo alcance com dano em área (alcance mínimo 4)',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'bolt',
    isSiege: true, corpseless: true
  },

  // --- Clãs Orcs ---
  peon: {
    type: 'peon',
    name: 'Lacaio',
    entityName: 'Lacaio',
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
    name: 'Talhador',
    entityName: 'Talhador',
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
    name: 'Lanceiro-Machado',
    entityName: 'Lanceiro-Machado',
    faction: 'orc',
    hp: 100, speed: 4.4, damage: { basic: 7, piercing: 12, type: 'piercing' }, attackRange: 13.5, attackCooldown: 1.35, armor: 0,
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
    requires: [{ hq: 2 }], // F4-01: cavalaria orc, treinada no Covil dos Ogros (Centro nível 2)
    hp: 320, speed: 5.4, damage: { basic: 32, piercing: 10, type: 'normal' }, attackRange: 2.5, attackCooldown: 1.5, armor: 5,
    collisionRadius: 1.08,
    visionRadius: 16,
    ...MELEE_SCAN,
    healthBarHeight: 4.5,
    cost: { gold: 75, wood: 100, stone: 35 },
    trainTime: 14,
    icon: '/icoEspada.png',
    description: 'Cavalaria orc: bruto colossal veloz com clava',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  },

  // F4-02: cerco orc, treinado na Oficina dos Engenhoqueiros (Centro nível 2). Mesmos números
  // da Balista; só o projétil muda (pedra em arco alto e lento).
  catapult: {
    type: 'catapult',
    name: 'Catapulta',
    entityName: 'Catapulta',
    faction: 'orc',
    requires: [{ hq: 2 }],
    hp: 220, speed: 3.0, damage: { basic: 80, piercing: 0, type: 'siege' }, attackRange: 20, attackCooldown: 3.2, armor: 0,
    minAttackRange: 4, splashRadius: 1.5,
    collisionRadius: 1.3,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.6,
    cost: { gold: 90, wood: 200, stone: 40 },
    trainTime: 18,
    icon: '/icoArco.png',
    description: 'Cerco: lança pedras em arco alto com dano em área (alcance mínimo 4)',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'boulder',
    isSiege: true, corpseless: true
  },

  // F4-05: unidades suicidas (Oficina, Centro nível 2). Detonam ao chegar ao alvo: `damage` siege em
  // área (`splashRadius`, 100% → 40% na borda), ×1,5 contra construções e ×0,5 contra unidades.
  sapper: {
    type: 'sapper',
    name: 'Sapadores de Pólvora',
    entityName: 'Sapadores de Pólvora',
    faction: 'human',
    requires: [{ hq: 2 }],
    hp: 60, speed: 5.0, damage: { basic: 400, piercing: 0, type: 'siege' }, attackRange: 1.2, attackCooldown: 0.1, armor: 0,
    splashRadius: 2.2, suicide: true, corpseless: true,
    collisionRadius: 0.7,
    visionRadius: 16,
    ...MELEE_SCAN,
    healthBarHeight: 3.4,
    cost: { gold: 70, wood: 25, stone: 0 },
    trainTime: 10,
    icon: '/icoEspada.png', // provisório
    description: 'Suicida: corre até uma construção e explode em área (forte contra muralhas)',
    isWorker: false, isRanged: false, isCombat: true, projectile: null
  },
  arsonist: {
    type: 'arsonist',
    name: 'Incendiários',
    entityName: 'Incendiários',
    faction: 'orc',
    requires: [{ hq: 2 }],
    hp: 60, speed: 5.0, damage: { basic: 400, piercing: 0, type: 'siege' }, attackRange: 1.2, attackCooldown: 0.1, armor: 0,
    splashRadius: 2.2, suicide: true, corpseless: true,
    collisionRadius: 0.7,
    visionRadius: 16,
    ...MELEE_SCAN,
    healthBarHeight: 3.4,
    cost: { gold: 70, wood: 25, stone: 0 },
    trainTime: 10,
    icon: '/icoEspada.png', // provisório
    description: 'Suicida: corre até uma construção e explode em área (forte contra muralhas)',
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
    hp: 106, speed: 4.3, damage: { basic: 6, piercing: 13, type: 'piercing' }, attackRange: 14.0, attackCooldown: 1.4, armor: 0,
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
    hp: 108, speed: 4.4, damage: { basic: 7, piercing: 13, type: 'piercing' }, attackRange: 13.5, attackCooldown: 1.35, armor: 0,
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

  // --- F4-04: conjuradores (Torre Arcana / Santuário das Cinzas; Centro nível 3) ---
  mage: {
    type: 'mage',
    name: 'Mago Arcano',
    entityName: 'Mago Arcano',
    faction: 'human',
    requires: [{ hq: 3 }],
    hp: 60, speed: 4.2, damage: { basic: 0, piercing: 20, type: 'magic' }, attackRange: 8, attackCooldown: 1.8, armor: 0,
    collisionRadius: 0.7,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.5,
    cost: { gold: 120, wood: 0, stone: 0 },
    trainTime: 12,
    icon: '/icoEscudo.png', // provisório (ícone novo na F7)
    description: 'Conjurador: bola de fogo, lentidão, escudo de chamas, invisibilidade, transmutação e nevasca',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'bolt',
    maxMana: 255, startMana: 85, manaRegen: 1,
    abilities: ['fireball', 'slow', 'flameshield', 'invisibility', 'polymorph', 'blizzard']
  },
  necromancer: {
    type: 'necromancer',
    name: 'Necromante das Cinzas',
    entityName: 'Necromante das Cinzas',
    faction: 'orc',
    requires: [{ hq: 3 }],
    hp: 60, speed: 4.2, damage: { basic: 0, piercing: 20, type: 'magic' }, attackRange: 8, attackCooldown: 1.8, armor: 0,
    collisionRadius: 0.7,
    visionRadius: 18,
    ...RANGED_SCAN,
    healthBarHeight: 3.5,
    cost: { gold: 120, wood: 0, stone: 0 },
    trainTime: 12,
    icon: '/icoEscudo.png', // provisório (ícone novo na F7)
    description: 'Conjurador: toque da morte, pressa, erguer mortos, armadura profana e nuvem de cinzas',
    isWorker: false, isRanged: true, isCombat: true, projectile: 'bolt',
    maxMana: 255, startMana: 85, manaRegen: 1,
    abilities: ['death_touch', 'haste_spell', 'raise_dead', 'unholy_armor', 'ash_cloud']
  },
  // Invocado por Erguer Mortos (não treinável, não consome suprimento... ver `lifetime`); morto-vivo.
  skeleton: {
    type: 'skeleton',
    name: 'Esqueleto',
    entityName: 'Esqueleto',
    faction: 'orc',
    hp: 60, speed: 4.5, damage: { basic: 8, piercing: 2, type: 'normal' }, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
    collisionRadius: 0.66,
    visionRadius: 14,
    ...MELEE_SCAN,
    healthBarHeight: 3.2,
    cost: null,
    trainTime: null,
    icon: '/icoEspada.png',
    description: 'Morto-vivo invocado (dura 60 s)',
    isWorker: false, isRanged: false, isCombat: true, projectile: null,
    undead: true, corpseless: true
  },
  // Resultado da Transmutação: a unidade vira ovelha (modelo do critter da F3-10 em escala de unidade).
  sheep: {
    type: 'sheep',
    name: 'Ovelha',
    entityName: 'Ovelha',
    faction: 'neutral',
    hp: 20, speed: 3.0, damage: { basic: 0, piercing: 0, type: 'normal' }, attackRange: 1.8, attackCooldown: 1.0, armor: 0,
    collisionRadius: 0.6,
    visionRadius: 10,
    ...MELEE_SCAN,
    healthBarHeight: 2.4,
    cost: null,
    trainTime: null,
    icon: '/icopopulacao.png',
    description: 'Vítima de Transmutação',
    isWorker: false, isRanged: false, isCombat: false, projectile: null,
    corpseless: true
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
