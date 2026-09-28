/**
 * upgrades.js — Pesquisas da Forja (F0-06: movido de src/core/UpgradeConfig.js).
 * Suporta ambas as facções: Reino Humano e Clãs Orcs.
 *
 * 4 Melhorias:
 * 1. infantry_attack: +5 Ataque para Infantaria (Knight / Grunt, Ogre)
 * 2. infantry_defense: +3 Armadura para Infantaria (Knight / Grunt, Ogre)
 * 3. ranged_attack: +4 Ataque para Unidades à Distância (Archer / Axethrower)
 * 4. ranged_defense: +2 Armadura para Unidades à Distância (Archer / Axethrower)
 */

export const UPGRADE_CONFIG = {
  infantry_attack: {
    id: 'infantry_attack',
    category: 'infantry',
    statType: 'attack',
    bonus: 5,
    name: {
      human: 'Lâminas Forjadas',
      orc: 'Machados de Ferro'
    },
    description: {
      human: '+5 Ataque para Cavaleiros',
      orc: '+5 Ataque para Grunts e Ogros'
    },
    icon: '/icoEspada.png',
    cost: { gold: 100, wood: 50, time: 14 },
    appliesTo: (unitType) => unitType === 'knight' || unitType === 'grunt' || unitType === 'ogre'
  },
  infantry_defense: {
    id: 'infantry_defense',
    category: 'infantry',
    statType: 'defense',
    bonus: 3,
    name: {
      human: 'Escudos de Aço',
      orc: 'Placas de Basalto'
    },
    description: {
      human: '+3 Armadura para Cavaleiros',
      orc: '+3 Armadura para Grunts e Ogros'
    },
    icon: '/icoEscudo.png',
    cost: { gold: 80, stone: 70, time: 14 },
    appliesTo: (unitType) => unitType === 'knight' || unitType === 'grunt' || unitType === 'ogre'
  },
  ranged_attack: {
    id: 'ranged_attack',
    category: 'ranged',
    statType: 'attack',
    bonus: 4,
    name: {
      human: 'Flechas Perfurantes',
      orc: 'Lâminas de Arremesso'
    },
    description: {
      human: '+4 Ataque para Arqueiros',
      orc: '+4 Ataque para Lançadores de Machado'
    },
    icon: '/icoArco.png',
    cost: { gold: 90, wood: 60, time: 14 },
    appliesTo: (unitType) => unitType === 'archer' || unitType === 'axethrower'
  },
  ranged_defense: {
    id: 'ranged_defense',
    category: 'ranged',
    statType: 'defense',
    bonus: 2,
    name: {
      human: 'Armadura de Couro',
      orc: 'Peles de Guerra'
    },
    description: {
      human: '+2 Armadura para Arqueiros',
      orc: '+2 Armadura para Lançadores de Machado'
    },
    icon: '/icoCouro.png',
    cost: { gold: 70, wood: 50, time: 14 },
    appliesTo: (unitType) => unitType === 'archer' || unitType === 'axethrower'
  }
};

export const FORGE_UPGRADES = [
  'infantry_attack',
  'infantry_defense',
  'ranged_attack',
  'ranged_defense'
];
