/**
 * tools/lib/woodStats.mjs — medição da oferta de madeira de um mapa (usada por `tools/measure-wood.mjs` e por
 * `tests/unit/mapsWood.test.js`). Não registra loader de JSON: no Node puro quem importa precisa registrar antes
 * (ver `tools/measure-wood.mjs`); no Vitest já funciona.
 */
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig, PLAYER_COLORS } from '../../src/sim/MatchConfig.js';
import { regionAt, pointReachable } from '../../src/ai/AIWood.js';

/** Raio (u) em que a madeira conta como "perto da base" e meta (madeira alcançável por jogador) — ver src/data/maps/README.md. */
export const WOOD_RADIUS = 60;
export const WOOD_TARGET = 8000;

/**
 * Cria a partida headless do mapa (um jogador por startSlot) e mede as árvores. `perPlayer[i].wood` = madeira (soma de
 * `woodRemaining`) das árvores a ≤ `radius` do pátio do jogador E alcançáveis por terra a partir dele (mesma região
 * conexa do Pathfinder que a IA usa em `AIWood`).
 * @param {object} mapDef  definição do mapa (precisa estar registrada em `getMap(mapDef.id)` para a MatchConfig)
 */
export function measureWood(mapDef, { radius = WOOD_RADIUS, seed = 1 } = {}) {
  const cfg = createMatchConfig({ seed, mapId: mapDef.id, headless: true });
  const want = mapDef.maxPlayers || cfg.players.length;
  if (want > 2) {
    cfg.players = [];
    for (let k = 0; k < want; k++) {
      cfg.players.push({ id: k, name: `P${k}`, factionId: k % 2 ? 'orc' : 'human', team: k % 2, color: PLAYER_COLORS[k], isAI: false, isLocal: k === 0, startSlot: k });
    }
  }
  const gm = new GameManager(new Terrain(mapDef), null, null, cfg);
  const pf = gm.pathfinder;
  const trees = gm.trees.filter((t) => t.woodRemaining > 0);
  const total = trees.reduce((s, t) => s + t.woodRemaining, 0);
  const perPlayer = gm.players.map((p) => {
    const reg = regionAt(pf, p.startPos.x, p.startPos.z);
    let wood = 0;
    let n = 0;
    for (const t of trees) {
      const q = t.mesh.position;
      if (Math.hypot(q.x - p.startPos.x, q.z - p.startPos.z) > radius) continue;
      if (!pointReachable(pf, reg, q.x, q.z)) continue;
      wood += t.woodRemaining;
      n++;
    }
    return { slot: p.startSlot, trees: n, wood };
  });
  const minWood = Math.min(...perPlayer.map((x) => x.wood));
  const result = {
    id: mapDef.id, size: mapDef.size, playable: mapDef.playable, players: gm.players.length, trees: trees.length, total, perPlayer, minWood,
    avgWood: Math.round(perPlayer.reduce((s, x) => s + x.wood, 0) / perPlayer.length), gm
  };
  return result;
}
