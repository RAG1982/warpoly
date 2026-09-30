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
    buildList: ['cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'watchtower', 'wall_human'],
    units: {
      worker: 'villager',
      melee: 'knight',
      ranged: 'archer',
      siege: 'knight' // sem unidade de cerco humana ainda: a IA usa o Cavaleiro
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
    buildList: ['orc_house', 'pig_farm', 'orc_lumber_mill', 'orc_barracks', 'orc_forge', 'orc_watchtower', 'wall_orc'],
    units: {
      worker: 'peon',
      melee: 'grunt',
      ranged: 'axethrower',
      siege: 'ogre'
    },
    startingBase: {
      buildings: { hq: 'great_hall', lumber: 'orc_lumber_mill', house: 'pig_farm' },
      units: { worker: 'peon', melee: 'grunt', ranged: 'axethrower' }
    }
  }
};

/** Recursos iniciais (jogador e IA). */
export const STARTING_RESOURCES = Object.freeze({ wood: 240, gold: 200, stone: 120 });
