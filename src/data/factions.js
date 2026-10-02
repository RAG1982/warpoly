/**
 * factions.js — Facções jogáveis (F0-06).
 *
 * Nomes provisórios conforme a decisão D2 (docs/07_DECISOES.md) até o glossário da F3-00.
 * `buildList` é a ordem dos botões no painel de construção do trabalhador.
 * `units` mapeia papéis (usados pela IA) para tipos de unidade.
 * `startingBase` (F2-01) lista o que cada facção recebe no início da partida; as posições
 * saem do slot inicial (src/sim/MatchConfig.js → START_LAYOUT).
 */

export const FACTIONS = {
  human: {
    id: 'human',
    name: 'Reino Humano',
    worker: 'villager',
    hq: 'castle',
    barracks: 'barracks',
    house: 'cottage',
    farm: 'farm',
    lumber: 'lumber_camp',
    tower: 'watchtower',
    forge: 'forge',
    stable: 'stable',
    workshop: 'workshop',
    arcane: 'arcane_tower', // F4-04
    temple: 'temple', // F4-04b
    aerie: 'aviary', // F4-06
    shipyard: 'shipyard', // F4-07
    refinery: 'refinery',
    buildList: ['cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'stable', 'workshop', 'arcane_tower', 'temple', 'aviary', 'shipyard', 'refinery', 'watchtower', 'wall_human'],
    /** F4-07a: construções do Petroleiro (`WORKER_BUILD_LIST.tanker`). */
    tankerBuildList: ['oil_platform'],
    units: {
      worker: 'villager',
      melee: 'knight',
      ranged: 'archer',
      cavalry: 'cavalier',
      siege: 'ballista', // F4-02
      suicide: 'sapper', // F4-05
      caster: 'mage', // F4-04
      flyer: 'gryphon_rider', // F4-06
      scoutAir: 'glider',
      tanker: 'tanker' // F4-07
    },
    startingBase: {
      buildings: { hq: 'castle', lumber: 'lumber_camp', house: 'cottage' },
      units: { worker: 'villager', melee: 'knight', ranged: 'archer' }
    }
  },
  orc: {
    id: 'orc',
    name: 'Clãs Orcs',
    worker: 'peon',
    hq: 'great_hall',
    barracks: 'orc_barracks',
    house: 'orc_house',
    farm: 'pig_farm',
    lumber: 'orc_lumber_mill',
    tower: 'orc_watchtower',
    forge: 'orc_forge',
    stable: 'ogre_den',
    workshop: 'orc_workshop',
    arcane: 'ash_sanctum', // F4-04
    temple: 'storm_altar', // F4-04b
    aerie: 'serpent_nest', // F4-06
    shipyard: 'ship_dock', // F4-07
    refinery: 'ash_cauldron',
    buildList: ['orc_house', 'pig_farm', 'orc_lumber_mill', 'orc_barracks', 'orc_forge', 'ogre_den', 'orc_workshop', 'ash_sanctum', 'storm_altar', 'serpent_nest', 'ship_dock', 'ash_cauldron', 'orc_watchtower', 'wall_orc'],
    tankerBuildList: ['oil_platform'],
    units: {
      worker: 'peon',
      melee: 'grunt',
      ranged: 'axethrower',
      cavalry: 'ogre',
      siege: 'catapult', // F4-02
      suicide: 'arsonist', // F4-05
      caster: 'necromancer', // F4-04
      flyer: 'war_serpent', // F4-06
      scoutAir: 'war_balloon',
      tanker: 'tanker' // F4-07
    },
    startingBase: {
      buildings: { hq: 'great_hall', lumber: 'orc_lumber_mill', house: 'pig_farm' },
      units: { worker: 'peon', melee: 'grunt', ranged: 'axethrower' }
    }
  }
};

/** Recursos iniciais (jogador e IA). */
export const STARTING_RESOURCES = Object.freeze({ wood: 240, gold: 200, stone: 120 }); // petróleo inicial = 0 (D1; `Player` zera o 4º recurso)
