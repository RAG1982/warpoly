/**
 * src/data/missions/index.js (F8-04) — registro estático das missões em `src/data/missions/<id>.json` (formato em README.md).
 * Import estático (Vite e Node/Vitest/headless). Missões extras podem ser registradas em runtime (`registerMission`,
 * validadas) — usado por testes e, no futuro, pelo editor/campanhas (F8-05/06).
 */
import missionDemo from './mission-demo.json';
import { assertMission } from '../../sim/missions/schema.js';
import { localize } from '../../sim/missions/text.js';

const MISSIONS = new Map();
const BUILTIN = Object.freeze([missionDemo]);
for (const m of BUILTIN) MISSIONS.set(m.id, m);

/** Cores padrão por id de jogador (iguais às de `MatchConfig.PLAYER_COLORS`; cópia para evitar import circular). */
const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#eab308', '#9333ea', '#ea580c', '#0891b2', '#db2777'];

/** @returns {object|undefined} definição da missão (JSON) ou `undefined`. */
export function getMission(id) {
  return MISSIONS.get(id);
}

/** @returns {object[]} missões do menu "Missões" (ordem estável; as `hidden: true` ficam de fora). */
export function listMissions({ includeHidden = false } = {}) {
  return [...MISSIONS.values()].filter((m) => includeHidden || !m.hidden);
}

/** Valida e registra uma missão em runtime. Não sobrescreve as embutidas. */
export function registerMission(def) {
  assertMission(def);
  if (BUILTIN.some((m) => m.id === def.id)) throw new Error(`registerMission: "${def.id}" é uma missão embutida`);
  MISSIONS.set(def.id, def);
  return def;
}

export function unregisterMission(id) {
  if (BUILTIN.some((m) => m.id === id)) return false;
  return MISSIONS.delete(id);
}

/**
 * Definição da missão de uma MatchConfig: `cfg.mission` (inline, validada) ou `cfg.missionId` (registro).
 * @returns {object|null} `null` se a partida não é uma missão; lança se o id não existir ou a missão for inválida.
 */
export function resolveMissionDef(cfg) {
  if (!cfg) return null;
  if (cfg.mission) return assertMission(cfg.mission);
  if (cfg.missionId) {
    const def = getMission(cfg.missionId);
    if (!def) throw new Error(`MatchConfig: missão desconhecida "${cfg.missionId}"`);
    return def;
  }
  return null;
}

/**
 * MatchConfig de uma missão. `inline: true` embute a definição em `config.mission` (saves/replays autocontidos).
 * Nomes de jogador saem no idioma `lang`.
 */
export function createMissionConfig(missionOrId, { lang = 'pt-BR', seed = null, inline = false } = {}) {
  const def = typeof missionOrId === 'string' ? getMission(missionOrId) : missionOrId;
  if (!def) throw new Error(`createMissionConfig: missão desconhecida "${missionOrId}"`);
  const cfg = {
    mapId: def.mapId,
    seed: seed ?? def.seed,
    difficulty: 'normal',
    victoryMode: 'mission',
    headless: false,
    missionId: def.id,
    players: def.players.map((p) => ({
      id: p.id,
      name: localize(p.name, lang),
      factionId: p.factionId,
      team: p.team,
      color: p.color || PALETTE[p.id % PALETTE.length],
      isAI: !!p.isAI,
      isLocal: !!p.isLocal,
      startSlot: p.startSlot,
      ...(p.difficulty ? { difficulty: p.difficulty } : {})
    }))
  };
  if (def.startingResources) cfg.startingResources = { ...def.startingResources };
  if (inline) cfg.mission = JSON.parse(JSON.stringify(def));
  return cfg;
}
