/**
 * onlineMatch.js — F9-03: monta a `MatchConfig` de uma partida online a partir da mensagem `start`
 * do servidor de sinalização. Função PURA e determinística: todos os pares chamam com a mesma
 * entrada (`players`, `seed`, `config`) e obtêm a mesma configuração; só `isLocal` difere.
 *
 * - ids de rede (do servidor) ordenados viram playerIds de jogo 0..n-1 (mesmo mapeamento em todos);
 * - mapa: o da sala, ou — se não existir/não couber — um mapa GERADO pela seed da sala (8 jogadores);
 * - times: se todos escolheram o mesmo time (padrão do lobby), cada um joga por si (n times);
 * - cores: a escolhida quando livre, senão a primeira livre.
 */
import { PLAYER_COLORS, DEFAULT_DIFFICULTY, DEFAULT_VICTORY_MODE, normalizeVictoryMode, validateMatchConfig } from '../sim/MatchConfig.js';
import { getMap, peekMap, registerGeneratedMap, DEFAULT_MAP_ID } from '../data/maps/index.js';

export const MAX_ONLINE_PLAYERS = 8;

/**
 * @param {object} o
 * @param {{id: number, name?: string, faction?: string, color?: number, team?: number}[]} o.players  `players` do `start`
 * @param {number} o.seed
 * @param {{map?: string, victory?: string}} [o.config]  `config` da sala
 * @param {number|null} [o.localNetId]  id de rede do par local (null = nenhum local; usa o primeiro)
 * @param {boolean} [o.headless]
 * @returns {{config: object, playerIds: number[], toPlayerId: Map<number, number>, localPlayerId: number}}
 */
export function buildOnlineMatchConfig({ players, seed, config = {}, localNetId = null, headless = false }) {
  if (!Array.isArray(players) || players.length < 2 || players.length > MAX_ONLINE_PLAYERS) {
    throw new Error(`onlineMatch: de 2 a ${MAX_ONLINE_PLAYERS} jogadores`);
  }
  const sorted = [...players].sort((a, b) => a.id - b.id);
  const n = sorted.length;
  let mapId = config.map && peekMap(config.map) ? config.map : DEFAULT_MAP_ID;
  if (getMap(mapId).maxPlayers < n) mapId = registerGeneratedMap({ seed, players: Math.max(2, n), size: 128 }).id;

  const teams = new Set(sorted.map((p) => p.team ?? 0));
  const used = new Set();
  const toPlayerId = new Map();
  const list = sorted.map((p, i) => {
    toPlayerId.set(p.id, i);
    let c = Number.isInteger(p.color) ? p.color % PLAYER_COLORS.length : i;
    if (used.has(c)) c = PLAYER_COLORS.findIndex((_, k) => !used.has(k));
    used.add(c);
    return {
      id: i,
      name: String(p.name || `Jogador ${i + 1}`).slice(0, 24),
      factionId: p.faction === 'orc' ? 'orc' : 'human',
      team: teams.size > 1 ? (p.team ?? 0) : i,
      color: PLAYER_COLORS[c],
      isAI: false,
      isLocal: localNetId !== null ? p.id === localNetId : i === 0,
      startSlot: i
    };
  });
  const cfg = {
    mapId,
    seed,
    difficulty: DEFAULT_DIFFICULTY,
    victoryMode: normalizeVictoryMode(config.victory || DEFAULT_VICTORY_MODE),
    headless: !!headless,
    players: list
  };
  validateMatchConfig(cfg);
  const localPlayerId = list.find((p) => p.isLocal).id;
  return { config: cfg, playerIds: list.map((p) => p.id), toPlayerId, localPlayerId };
}
