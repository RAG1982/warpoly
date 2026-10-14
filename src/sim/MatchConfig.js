/**
 * MatchConfig.js — Configuração de partida (F2-01).
 *
 *   { mapId, seed, difficulty, players: [{ id, name, factionId, team, color, isAI, isLocal, startSlot }] }
 *
 * O GameManager cria as bases a partir dos slots do mapa (`initMapEntities`, `startSlots` de
 * `src/data/maps/<mapId>.json` — F2-05). Sem three.js nem DOM: testável em Node.
 */
import { getMap, DEFAULT_MAP_ID } from '../data/maps/index.js';
import { getHeightForMap } from './terrainGenerators.js';
import { resolveMissionDef } from '../data/missions/index.js';
import { validateTechRestriction } from './techRestriction.js';

export { DEFAULT_MAP_ID };

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
    { role: 'worker', dx: -3, dz: 6 },
    { role: 'worker', dx: 3, dz: 6 },
    { role: 'melee', dx: -2, dz: 9 },
    { role: 'melee', dx: 2, dz: 9 },
    { role: 'ranged', dx: -6, dz: 11 }
  ]
});

/** Espelhamento do layout para um slot: NE → (1, 1), SW → (−1, −1), NW → (−1, 1), SE → (1, −1). */
export function slotMirror(pos) {
  return { mx: pos.x >= 0 ? 1 : -1, mz: pos.z <= 0 ? 1 : -1 };
}

/**
 * Posições absolutas de construções e unidades iniciais para um slot. `pos.mirror: [mx, mz]`
 * (F2-05, `startSlots` do mapa) tem prioridade; sem ele, o espelhamento é calculado por `slotMirror`.
 * Suporta `pos.layout` para layouts específicos de slot/mapa.
 */
export function layoutAt(pos, layout = START_LAYOUT) {
  const activeLayout = pos?.layout || layout;
  const { mx, mz } = pos.mirror ? { mx: pos.mirror[0], mz: pos.mirror[1] } : slotMirror(pos);
  const place = (e) => ({ ...e, x: pos.x + e.dx * mx, z: pos.z + e.dz * mz });
  return { buildings: activeLayout.buildings.map(place), units: activeLayout.units.map(place) };
}

/** Dificuldades da IA escolhidas no menu (F6-01). */
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard', 'brutal']);
export const DEFAULT_DIFFICULTY = 'normal';

export function normalizeDifficulty(d) {
  return DIFFICULTIES.includes(d) ? d : DEFAULT_DIFFICULTY;
}

/** F5-03: dificuldade da IA do jogador `playerId` — `players[i].difficulty` sobrepõe `cfg.difficulty`. */
export function difficultyOf(cfg, playerId) {
  const p = cfg && cfg.players ? cfg.players.find((q) => q.id === playerId) : null;
  return normalizeDifficulty(p && p.difficulty ? p.difficulty : cfg && cfg.difficulty);
}

/** F3-09: modos de vitória — 'conquest' (destruir tudo, padrão) e 'regicide' (derrubar o Centro). */
export const VICTORY_MODES = Object.freeze(['conquest', 'regicide']);
export const DEFAULT_VICTORY_MODE = 'conquest';

/** F8-04: modo de vitória de missões (`MatchConfig.missionId`/`mission`): o `MissionRuntime` decide vitória e derrota. Não aparece na Escaramuça. */
export const MISSION_VICTORY_MODE = 'mission';

export function normalizeVictoryMode(m) {
  return VICTORY_MODES.includes(m) || m === MISSION_VICTORY_MODE ? m : DEFAULT_VICTORY_MODE;
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
 * - `headless: true` (F2-03): partida sem DOM/WebGL (testes de determinismo em Node) — o
 *   GameManager liga `ModelFactory.headless`, que devolve `THREE.Group()` vazio em vez de gerar
 *   malhas/texturas procedurais. Não afeta a simulação (posição/estado/colisão).
 */
export function createMatchConfig({
  localFaction = 'human',
  ffa = false,
  seed = null,
  mapId = DEFAULT_MAP_ID,
  difficulty = DEFAULT_DIFFICULTY,
  victoryMode = DEFAULT_VICTORY_MODE,
  headless = false
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
    // F2-04/F5-03: dificuldade padrão das IAs (cada jogador pode sobrepor com `players[i].difficulty`).
    difficulty: normalizeDifficulty(difficulty),
    victoryMode: normalizeVictoryMode(victoryMode),
    headless: !!headless,
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

/** Lê `?faction=orc`, `?ffa=1`, `?seed=`, `?difficulty=`, `?victory=` e `?map=` da query string. */
export function matchConfigFromSearch(search = '') {
  const params = new URLSearchParams(search);
  const seedParam = params.get('seed');
  const seed = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam)) ? Number(seedParam) : null;
  const ffa = params.get('ffa');
  const mapParam = params.get('map');
  return createMatchConfig({
    localFaction: params.get('faction') === 'orc' ? 'orc' : 'human',
    ffa: ffa === '1' || ffa === 'true',
    seed,
    mapId: mapParam && getMap(mapParam) ? mapParam : DEFAULT_MAP_ID,
    difficulty: params.get('difficulty') || DEFAULT_DIFFICULTY,
    victoryMode: params.get('victory') || DEFAULT_VICTORY_MODE
  });
}

/** F3-10 / MUNDO-TERRENO-MAPAS §5: espécies de critters e tipos de jazida aceitos em `neutrals`. */
export const CRITTER_SPECIES = Object.freeze(['sheep', 'boar', 'pig']);
const DEPOSIT_TYPES = Object.freeze(['gold', 'stone']);

/**
 * F3-10: valida `mapDef.neutrals` (kind ∈ {camp, critters}, coordenadas dentro de `playable`,
 * `guards` 1..8, espécie/contagem de critters). Lança Error com a primeira inconsistência.
 */
export function validateNeutrals(mapDef) {
  const list = mapDef.neutrals || [];
  const half = (mapDef.playable ?? mapDef.size) / 2;
  const inside = (x, z) => typeof x === 'number' && typeof z === 'number' && Math.abs(x) <= half && Math.abs(z) <= half;
  list.forEach((n, i) => {
    const tag = `MatchConfig: neutrals[${i}] do mapa "${mapDef.id}"`;
    if (!n || (n.kind !== 'camp' && n.kind !== 'critters')) throw new Error(`${tag}: kind inválido "${n && n.kind}"`);
    if (!inside(n.x, n.z)) throw new Error(`${tag}: fora da área jogável`);
    if (n.kind === 'camp') {
      if (!Number.isInteger(n.guards) || n.guards < 1 || n.guards > 8) throw new Error(`${tag}: guards deve ser 1..8`);
      if (n.deposit) {
        if (!DEPOSIT_TYPES.includes(n.deposit.type)) throw new Error(`${tag}: deposit.type inválido`);
        if (!(n.deposit.amount > 0)) throw new Error(`${tag}: deposit.amount inválido`);
      }
    } else {
      if (!CRITTER_SPECIES.includes(n.species)) throw new Error(`${tag}: espécie inválida "${n.species}"`);
      if (!Number.isInteger(n.count) || n.count < 1 || n.count > 40) throw new Error(`${tag}: count deve ser 1..40`);
    }
  });
  const total = list.reduce((s, n) => s + (n.kind === 'critters' ? n.count : 0), 0);
  if (total > 40) throw new Error(`MatchConfig: mapa "${mapDef.id}" tem mais de 40 critters`);
  return mapDef;
}

/**
 * F4-07a: valida `mapDef.resources` — `oil` (poço de petróleo) só em ÁGUA (`altura < waterLevel`), dentro de `playable`, com `amount`
 * > 0 opcional; `gold`/`stone` não são checados aqui (cobertos por `maps.test.js`). Lança Error com a primeira inconsistência.
 */
export function validateOilWells(mapDef) {
  const half = (mapDef.playable ?? mapDef.size) / 2;
  (mapDef.resources || []).forEach((r, i) => {
    if (r.type !== 'oil') return;
    const tag = `MatchConfig: resources[${i}] (oil) do mapa "${mapDef.id}"`;
    if (typeof r.x !== 'number' || typeof r.z !== 'number' || Math.abs(r.x) >= half || Math.abs(r.z) >= half) throw new Error(`${tag}: fora da área jogável`);
    if (r.amount !== undefined && !(r.amount > 0)) throw new Error(`${tag}: amount inválido`);
    const h = getHeightForMap(mapDef, r.x, r.z);
    if (!(h < mapDef.waterLevel)) throw new Error(`${tag}: o poço precisa ficar em água (altura ${h.toFixed(2)} ≥ nível da água)`);
  });
  return mapDef;
}

/**
 * Valida a config; lança Error com a primeira inconsistência encontrada.
 * F2-05: também valida contra o mapa (`cfg.mapId`) — jogadores demais ou `startSlot` fora do
 * array `startSlots` do mapa.
 */
export function validateMatchConfig(cfg) {
  // F8-04: partida de missão — a missão (registro `missionId` ou `mission` inline) é validada e pode ter 1 só time.
  const isMission = !!(cfg && (cfg.missionId || cfg.mission));
  if (isMission) {
    resolveMissionDef(cfg);
    if (cfg.victoryMode !== MISSION_VICTORY_MODE) throw new Error('MatchConfig: missão exige victoryMode "mission"');
  } else if (cfg && cfg.victoryMode === MISSION_VICTORY_MODE) {
    throw new Error('MatchConfig: victoryMode "mission" exige missionId');
  }
  if (!cfg || !Array.isArray(cfg.players) || cfg.players.length < (isMission ? 1 : 2)) {
    throw new Error(`MatchConfig: pelo menos ${isMission ? 1 : 2} jogador${isMission ? '' : 'es'}`);
  }
  const mapDef = getMap(cfg.mapId);
  if (!mapDef) throw new Error(`MatchConfig: mapa desconhecido "${cfg.mapId}"`);
  if (cfg.players.length > mapDef.maxPlayers) {
    throw new Error(`MatchConfig: mapa "${cfg.mapId}" aceita no máximo ${mapDef.maxPlayers} jogadores`);
  }
  validateNeutrals(mapDef);
  validateOilWells(mapDef);
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
    if (!mapDef.startSlots[p.startSlot]) {
      throw new Error(`MatchConfig: slot ${p.startSlot} não existe no mapa "${cfg.mapId}"`);
    }
    if (p.difficulty !== undefined && !DIFFICULTIES.includes(p.difficulty)) {
      throw new Error(`MatchConfig: dificuldade inválida ${p.difficulty}`);
    }
    if (p.isLocal) locals++;
  }
  if (locals !== 1) throw new Error('MatchConfig: exatamente um jogador local');
  if (cfg.startingResources !== undefined) {
    const r = cfg.startingResources;
    for (const k of ['wood', 'gold', 'stone']) {
      if (!r || typeof r[k] !== 'number' || !(r[k] >= 0) || !Number.isFinite(r[k])) {
        throw new Error(`MatchConfig: startingResources.${k} inválido`);
      }
    }
  }
  // F8-05b: restrição de árvore tecnológica (campanha) — só jogadores existentes, itens que existem em src/data.
  if (cfg.techRestriction !== undefined) {
    const v = validateTechRestriction(cfg.techRestriction);
    if (!v.ok) throw new Error(`MatchConfig: techRestriction inválida: ${v.errors.join('; ')}`);
    for (const pid of cfg.techRestriction.players) {
      if (!ids.has(pid)) throw new Error(`MatchConfig: techRestriction cita o jogador ${pid}, que não existe`);
    }
  }
  const teams = new Set(cfg.players.map((p) => p.team));
  if (teams.size < 2 && !isMission) throw new Error('MatchConfig: pelo menos 2 times');
  return cfg;
}
