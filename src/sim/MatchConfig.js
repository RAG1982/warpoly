/**
 * MatchConfig.js — Configuração de partida (F2-01).
 *
 *   { mapId, seed, difficulty, players: [{ id, name, factionId, team, color, isAI, isLocal, startSlot }] }
 *
 * O GameManager cria as bases a partir dos slots daqui (initMapEntities). Enquanto os
 * mapas não forem orientados a dados (F2-05), os slots do mapa continental vivem em
 * MAP_START_SLOTS abaixo. Sem three.js nem DOM: testável em Node.
 */

export const DEFAULT_MAP_ID = 'continental';

/** Cores de jogador (índice = id). Azul, vermelho, verde, amarelo, roxo, laranja, ciano, rosa. */
export const PLAYER_COLORS = Object.freeze([
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#eab308',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#db2777'
]);

/**
 * Slots iniciais por mapa. `fixed` são as bases históricas (slot 0 = NE, slot 1 = SW).
 * `extraCandidates` são posições tentadas, em ordem, para slots ≥ 2: o GameManager
 * usa a primeira em que a base inteira passa em `canPlaceBuilding`.
 * (As diagonais (−32,−30) e (32,30) caem sobre o rio x = z e são descartadas.)
 */
export const MAP_START_SLOTS = {
  continental: {
    fixed: [
      { x: 32, z: -30 }, // 0: NE (base humana histórica)
      { x: -32, z: 30 } // 1: SW (base orc histórica)
    ],
    extraCandidates: [
      { x: -32, z: -30 },
      { x: 32, z: 30 },
      { x: -14, z: -46 },
      { x: 14, z: 46 },
      { x: -44, z: -12 },
      { x: 44, z: 12 }
    ]
  }
};

/**
 * Layout da base inicial no referencial do slot NE (32, −30): offsets (dx, dz) em
 * relação ao HQ. Para outros slots os offsets são espelhados por `slotMirror` de modo
 * que as tropas fiquem sempre do lado do centro do mapa. Reproduz exatamente as
 * posições fixas que o GameManager usava antes da F2-01.
 */
export const START_LAYOUT = Object.freeze({
  buildings: [
    { role: 'hq', dx: 0, dz: 0, rotY: 0 },
    { role: 'lumber', dx: -12, dz: -4, rotY: Math.PI / 4 },
    { role: 'house', dx: 12, dz: 0, rotY: -Math.PI / 4 }
  ],
  units: [
    { role: 'worker', dx: -4, dz: 2 },
    { role: 'worker', dx: 4, dz: -2 },
    { role: 'melee', dx: -2, dz: 8 },
    { role: 'melee', dx: 2, dz: 8 },
    { role: 'ranged', dx: -8, dz: 10 }
  ]
});

/** Espelhamento do layout para um slot: NE → (1, 1), SW → (−1, −1), NW → (−1, 1), SE → (1, −1). */
export function slotMirror(pos) {
  return { mx: pos.x >= 0 ? 1 : -1, mz: pos.z <= 0 ? 1 : -1 };
}

/** Posições absolutas de construções e unidades iniciais para um slot. */
export function layoutAt(pos, layout = START_LAYOUT) {
  const { mx, mz } = slotMirror(pos);
  const place = (e) => ({ ...e, x: pos.x + e.dx * mx, z: pos.z + e.dz * mz });
  return { buildings: layout.buildings.map(place), units: layout.units.map(place) };
}

/** Dificuldades da IA escolhidas no menu (F6-01). */
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard', 'brutal']);
export const DEFAULT_DIFFICULTY = 'normal';

export function normalizeDifficulty(d) {
  return DIFFICULTIES.includes(d) ? d : DEFAULT_DIFFICULTY;
}

export function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

const otherFaction = (f) => (f === 'orc' ? 'human' : 'orc');
/** Slot histórico de cada facção no mapa continental (humano NE, orc SW). */
const homeSlot = (f) => (f === 'orc' ? 1 : 0);

/**
 * Cria a configuração de partida.
 * - Padrão (1×1): jogador local (`localFaction`, humano por padrão) × 1 IA da outra facção,
 *   cada um no slot histórico da sua facção — idêntico ao comportamento anterior.
 * - `ffa: true`: jogador local × 2 IAs, cada um num time diferente (3 times).
 *   A 2ª IA usa a facção do jogador local e fica no slot 2.
 */
export function createMatchConfig({
  localFaction = 'human',
  ffa = false,
  seed = null,
  mapId = DEFAULT_MAP_ID,
  difficulty = DEFAULT_DIFFICULTY
} = {}) {
  const local = localFaction === 'orc' ? 'orc' : 'human';
  const ai = otherFaction(local);
  const players = [
    {
      id: 0,
      name: 'Você',
      factionId: local,
      team: 0,
      color: PLAYER_COLORS[0],
      isAI: false,
      isLocal: true,
      startSlot: homeSlot(local)
    },
    {
      id: 1,
      name: 'IA 1',
      factionId: ai,
      team: 1,
      color: PLAYER_COLORS[1],
      isAI: true,
      isLocal: false,
      startSlot: homeSlot(ai)
    }
  ];
  if (ffa) {
    players.push({
      id: 2,
      name: 'IA 2',
      factionId: local,
      team: 2,
      color: PLAYER_COLORS[2],
      isAI: true,
      isLocal: false,
      startSlot: 2
    });
  }
  return {
    mapId,
    seed: seed ?? randomSeed(),
    // F2-04: guardada na config; a IA ainda não lê a dificuldade (F5).
    difficulty: normalizeDifficulty(difficulty),
    players
  };
}

/**
 * Cópia da config com outra seed ("Jogar novamente", F2-04). Jogadores copiados
 * (a config nova não compartilha objetos com a antiga).
 */
export function withNewSeed(cfg, seed = null) {
  let next = seed ?? randomSeed();
  if (seed === null && next === cfg.seed) next = (next + 1) % 0x7fffffff;
  return { ...cfg, seed: next, players: cfg.players.map((p) => ({ ...p })) };
}

/** Lê `?faction=orc`, `?ffa=1`, `?seed=` e `?difficulty=` da query string. */
export function matchConfigFromSearch(search = '') {
  const params = new URLSearchParams(search);
  const seedParam = params.get('seed');
  const seed = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam)) ? Number(seedParam) : null;
  const ffa = params.get('ffa');
  return createMatchConfig({
    localFaction: params.get('faction') === 'orc' ? 'orc' : 'human',
    ffa: ffa === '1' || ffa === 'true',
    seed,
    difficulty: params.get('difficulty') || DEFAULT_DIFFICULTY
  });
}

/** Valida a config; lança Error com a primeira inconsistência encontrada. */
export function validateMatchConfig(cfg) {
  if (!cfg || !Array.isArray(cfg.players) || cfg.players.length < 2) {
    throw new Error('MatchConfig: pelo menos 2 jogadores');
  }
  const ids = new Set();
  const slots = new Set();
  let locals = 0;
  for (const p of cfg.players) {
    if (typeof p.id !== 'number' || p.id < 0) throw new Error(`MatchConfig: id inválido ${p.id}`);
    if (ids.has(p.id)) throw new Error(`MatchConfig: id duplicado ${p.id}`);
    ids.add(p.id);
    if (p.factionId !== 'human' && p.factionId !== 'orc')
      throw new Error(`MatchConfig: facção inválida ${p.factionId}`);
    if (slots.has(p.startSlot)) throw new Error(`MatchConfig: slot repetido ${p.startSlot}`);
    slots.add(p.startSlot);
    if (p.isLocal) locals++;
  }
  if (locals !== 1) throw new Error('MatchConfig: exatamente um jogador local');
  const teams = new Set(cfg.players.map((p) => p.team));
  if (teams.size < 2) throw new Error('MatchConfig: pelo menos 2 times');
  return cfg;
}
