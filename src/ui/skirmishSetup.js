/**
 * skirmishSetup.js (F6-02) — lógica pura da tela de configuração de partida (Escaramuça).
 *
 * Sem DOM nem three.js: o estado do formulário (`setup`) vira uma `MatchConfig` validada em
 * `buildMatchConfig`. Testável em Node (tests/unit/skirmishSetup.test.js).
 *
 *   setup = { mapId, localFaction, localColor, localTeam, localSlot,
 *             ai: [{ faction: 'human'|'orc'|'random', difficulty, team, color }],
 *             resources: 'low'|'standard'|'high'|'rich', victoryMode, seed: string }
 *
 * `color` é o índice em `PLAYER_COLORS` (sempre único entre os jogadores); `team` 0..7.
 */
import { getMap, listMaps, DEFAULT_MAP_ID } from '../data/maps/index.js';
import {
  PLAYER_COLORS, DIFFICULTIES, DEFAULT_DIFFICULTY, VICTORY_MODES, DEFAULT_VICTORY_MODE,
  normalizeDifficulty, normalizeVictoryMode, randomSeed, validateMatchConfig
} from '../sim/MatchConfig.js';
import { STARTING_RESOURCES } from '../data/factions.js';
import { fnv1a, mulberry32 } from '../sim/rng.js';
import { t } from '../i18n/index.js';

export const STORAGE_KEY = 'warpoly.skirmish';
export const MAX_TEAMS = 8;
export const FACTION_IDS = Object.freeze(['human', 'orc']);
export const AI_FACTION_CHOICES = Object.freeze(['human', 'orc', 'random']);
const SEED_MAX = 0x7fffffff;

const scale = (k) => ({
  wood: Math.round(STARTING_RESOURCES.wood * k),
  gold: Math.round(STARTING_RESOURCES.gold * k),
  stone: Math.round(STARTING_RESOURCES.stone * k)
});

/** Recursos iniciais por jogador (`standard` = `STARTING_RESOURCES`). */
export const RESOURCE_PRESETS = Object.freeze({
  low: Object.freeze({ id: 'low', labelKey: 'skirmish.res.low', amounts: Object.freeze(scale(0.5)) }),
  standard: Object.freeze({ id: 'standard', labelKey: 'skirmish.res.standard', amounts: Object.freeze(scale(1)) }),
  high: Object.freeze({ id: 'high', labelKey: 'skirmish.res.high', amounts: Object.freeze(scale(2)) }),
  rich: Object.freeze({ id: 'rich', labelKey: 'skirmish.res.rich', amounts: Object.freeze(scale(4)) })
});
export const DEFAULT_RESOURCES = 'standard';

export const otherFaction = (f) => (f === 'orc' ? 'human' : 'orc');

/** Máximo de IAs que o mapa comporta (`maxPlayers − 1`, limitado a 7). */
export function maxAIs(mapDef) {
  const mp = mapDef && Number.isInteger(mapDef.maxPlayers) ? mapDef.maxPlayers : 2;
  return Math.max(1, Math.min(7, mp - 1));
}

/** Converte o texto da semente em inteiro: vazio → null (aleatória); número → ele; texto → hash. */
export function parseSeed(text) {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  if (/^\d{1,15}$/.test(s)) return Number(s) % SEED_MAX;
  return fnv1a(s) % SEED_MAX;
}

function firstFreeColor(used, from = 0) {
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    const c = (from + i) % PLAYER_COLORS.length;
    if (!used.has(c)) return c;
  }
  return from % PLAYER_COLORS.length;
}

function firstFreeTeam(used) {
  for (let t = 0; t < MAX_TEAMS; t++) if (!used.has(t)) return t;
  return MAX_TEAMS - 1;
}

const clampInt = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

/** Configuração padrão: Reino Humano × 1 IA orc (Normal), mapa padrão, recursos padrão. */
export function createSetup(mapId = DEFAULT_MAP_ID) {
  return normalizeSetup({
    mapId,
    localFaction: 'human',
    localColor: 0,
    localTeam: 0,
    localSlot: 0,
    ai: [{ faction: 'orc', difficulty: DEFAULT_DIFFICULTY, team: 1, color: 1 }],
    resources: DEFAULT_RESOURCES,
    victoryMode: DEFAULT_VICTORY_MODE,
    seed: ''
  });
}

/**
 * Corrige qualquer entrada (storage antigo/corrompido): mapa válido, 1..maxAIs IAs, valores nos
 * conjuntos permitidos, cores únicas, slot dentro do mapa. Devolve uma cópia nova.
 */
export function normalizeSetup(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const maps = listMaps();
  const mapId = getMap(src.mapId) ? src.mapId : DEFAULT_MAP_ID;
  const mapDef = getMap(mapId) || maps[0];
  const nColors = PLAYER_COLORS.length;

  const localFaction = FACTION_IDS.includes(src.localFaction) ? src.localFaction : 'human';
  const slots = mapDef.startSlots.length;
  const localSlot = clampInt(src.localSlot, 0, slots - 1, 0);

  const limit = maxAIs(mapDef);
  const rawAi = Array.isArray(src.ai) && src.ai.length ? src.ai.slice(0, limit) : [{}];

  const used = new Set();
  const take = (c, fallbackFrom) => {
    let v = clampInt(c, 0, nColors - 1, -1);
    if (v < 0 || used.has(v)) v = firstFreeColor(used, fallbackFrom);
    used.add(v);
    return v;
  };
  const localColor = take(src.localColor, 0);
  const ai = rawAi.map((a, i) => {
    const o = a && typeof a === 'object' ? a : {};
    return {
      faction: AI_FACTION_CHOICES.includes(o.faction) ? o.faction : otherFaction(localFaction),
      difficulty: normalizeDifficulty(o.difficulty),
      team: clampInt(o.team, 0, MAX_TEAMS - 1, Math.min(MAX_TEAMS - 1, i + 1)),
      color: take(o.color, i + 1)
    };
  });

  return {
    mapId,
    localFaction,
    localColor,
    localTeam: clampInt(src.localTeam, 0, MAX_TEAMS - 1, 0),
    localSlot,
    ai,
    resources: RESOURCE_PRESETS[src.resources] ? src.resources : DEFAULT_RESOURCES,
    victoryMode: normalizeVictoryMode(src.victoryMode),
    seed: typeof src.seed === 'string' ? src.seed.slice(0, 24) : (Number.isFinite(src.seed) ? String(src.seed) : '')
  };
}

/** Troca de mapa: reaplica os limites (menos IAs, slot válido). */
export function setMap(setup, mapId) {
  return normalizeSetup({ ...setup, mapId });
}

/** Adiciona uma IA (se o mapa comportar): cor e time livres, facção oposta à do jogador. */
export function addAI(setup) {
  const mapDef = getMap(setup.mapId);
  if (setup.ai.length >= maxAIs(mapDef)) return setup;
  const usedTeams = new Set([setup.localTeam, ...setup.ai.map((a) => a.team)]);
  const usedColors = new Set([setup.localColor, ...setup.ai.map((a) => a.color)]);
  const last = setup.ai[setup.ai.length - 1];
  return {
    ...setup,
    ai: [...setup.ai, {
      faction: otherFaction(setup.localFaction),
      difficulty: last ? last.difficulty : DEFAULT_DIFFICULTY,
      team: firstFreeTeam(usedTeams),
      color: firstFreeColor(usedColors, setup.ai.length + 1)
    }]
  };
}

/** Remove a IA `index` (mantém pelo menos 1). */
export function removeAI(setup, index) {
  if (setup.ai.length <= 1) return setup;
  return { ...setup, ai: setup.ai.filter((_, i) => i !== index) };
}

/** Time seguinte (0..7, circular) do jogador (`who = -1`) ou da IA `who`. */
export function cycleTeam(setup, who) {
  if (who < 0) return { ...setup, localTeam: (setup.localTeam + 1) % MAX_TEAMS };
  return { ...setup, ai: setup.ai.map((a, i) => (i === who ? { ...a, team: (a.team + 1) % MAX_TEAMS } : a)) };
}

/** Define a cor de `who` (-1 = jogador); se outro jogador já a usa, as cores são trocadas (sempre únicas). */
export function pickColor(setup, who, color) {
  if (!Number.isInteger(color) || color < 0 || color >= PLAYER_COLORS.length) return setup;
  const colors = [setup.localColor, ...setup.ai.map((a) => a.color)];
  const idx = who + 1;
  const holder = colors.findIndex((c, i) => c === color && i !== idx);
  const old = colors[idx];
  colors[idx] = color;
  if (holder >= 0) colors[holder] = old;
  return { ...setup, localColor: colors[0], ai: setup.ai.map((a, i) => ({ ...a, color: colors[i + 1] })) };
}

/** Slots de cada participante: o jogador no `localSlot`, as IAs nos demais, em ordem crescente. */
export function assignSlots(setup) {
  const mapDef = getMap(setup.mapId);
  const total = mapDef.startSlots.length;
  const rest = [];
  for (let s = 0; s < total; s++) if (s !== setup.localSlot) rest.push(s);
  return { local: setup.localSlot, ai: setup.ai.map((_, i) => rest[i]) };
}

/** Erros (localizados) que impedem iniciar (lista vazia = ok). */
export function validateSetup(setup) {
  const errors = [];
  const mapDef = getMap(setup.mapId);
  if (!mapDef) return [t('skirmish.err.map')];
  if (setup.ai.length < 1) errors.push(t('skirmish.err.noOpponent'));
  if (setup.ai.length > maxAIs(mapDef)) errors.push(t('skirmish.err.tooMany', { count: maxAIs(mapDef) }));
  const teams = new Set([setup.localTeam, ...setup.ai.map((a) => a.team)]);
  if (teams.size < 2) errors.push(t('skirmish.err.teams'));
  return errors;
}

/**
 * Setup → `MatchConfig` validada. `opts.seed` (número) sobrepõe o texto da semente; se ambos
 * faltam, sorteia. Facção "aleatória" das IAs é resolvida pela semente (determinística).
 * @throws {Error} se a configuração for inválida
 */
export function buildMatchConfig(setupIn, { seed = null, headless = false } = {}) {
  const setup = normalizeSetup(setupIn);
  const problems = validateSetup(setup);
  if (problems.length) throw new Error(problems[0]);
  const finalSeed = seed ?? parseSeed(setup.seed) ?? randomSeed();
  const rng = mulberry32(fnv1a(`skirmish:${finalSeed}`));
  const slots = assignSlots(setup);

  const players = [{
    id: 0,
    name: t('player.you'),
    factionId: setup.localFaction,
    team: setup.localTeam,
    color: PLAYER_COLORS[setup.localColor],
    isAI: false,
    isLocal: true,
    startSlot: slots.local
  }];
  setup.ai.forEach((a, i) => {
    players.push({
      id: i + 1,
      name: t('player.ai', { n: i + 1 }),
      factionId: a.faction === 'random' ? FACTION_IDS[rng.int(FACTION_IDS.length)] : a.faction,
      team: a.team,
      color: PLAYER_COLORS[a.color],
      isAI: true,
      isLocal: false,
      startSlot: slots.ai[i],
      difficulty: a.difficulty
    });
  });

  return validateMatchConfig({
    mapId: setup.mapId,
    seed: finalSeed,
    difficulty: setup.ai[0].difficulty,
    victoryMode: setup.victoryMode,
    startingResources: { ...RESOURCE_PRESETS[setup.resources].amounts },
    headless: !!headless,
    players
  });
}

// ---------------------------------------------------------------- persistência
function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** Lê o setup salvo (ou o padrão); chaves legadas do menu (`warpoly.faction/difficulty/map/victory`) valem de base. */
export function loadSetup(storage = safeStorage()) {
  const get = (k) => { try { return storage ? storage.getItem(k) : null; } catch { return null; } };
  const base = createSetup(getMap(get('warpoly.map')) ? get('warpoly.map') : DEFAULT_MAP_ID);
  const legacy = {
    ...base,
    localFaction: get('warpoly.faction') === 'orc' ? 'orc' : base.localFaction,
    victoryMode: get('warpoly.victory') || base.victoryMode,
    ai: base.ai.map((a) => ({ ...a, difficulty: DIFFICULTIES.includes(get('warpoly.difficulty')) ? get('warpoly.difficulty') : a.difficulty }))
  };
  legacy.ai = legacy.ai.map((a) => ({ ...a, faction: otherFaction(legacy.localFaction) }));
  const raw = get(STORAGE_KEY);
  if (!raw) return normalizeSetup(legacy);
  try {
    return normalizeSetup(JSON.parse(raw));
  } catch {
    return normalizeSetup(legacy);
  }
}

export function saveSetup(setup, storage = safeStorage()) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeSetup(setup))); } catch { /* storage bloqueado */ }
}

export { VICTORY_MODES, DIFFICULTIES };
