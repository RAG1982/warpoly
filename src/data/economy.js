/**
 * economy.js — F3-04: multiplicadores/constantes da economia estilo WC2 (mina com fila,
 * sem ouro passivo). Módulo puro (sem three.js), fonte única destes números (F0-06).
 *
 * - CARRY            Capacidade de carga por viagem, por recurso (substitui
 *                     `WORKER_STATS.carryCapacity`, que deixou de ser lido).
 * - MINE_ENTER_TIME  Segundos que o trabalhador passa "dentro" da mina/pedreira por viagem
 *                     (mesh invisível, sem colisão/seleção — ver `Unit.js` estado `insideMine`).
 * - MINE_SLOTS       Nº máximo de trabalhadores simultaneamente dentro, por tipo de jazida
 *                     (`ResourceDeposit`). Madeira não usa slot: o corte continua fora da árvore.
 * - RATE_BONUS       Multiplicadores por melhoria; `gatherMultiplier` já liga `hq_lv2`/`hq_lv3`
 *                     (via `HQ_TIER_GOLD_MULT`, F3-06). Madeira (Serraria nv2) e pedra
 *                     (Pedreira) continuam só declarados, sem ligação ainda.
 */
import { BUILDINGS } from './buildings.js';
import { HQ_TIER_GOLD_MULT } from './tiers.js';

export const CARRY = { gold: 10, wood: 10, stone: 8 };

export const MINE_ENTER_TIME = 1.5;

export const MINE_SLOTS = { gold: 1, stone: 2 };

export const RATE_BONUS = {
  wood: { lumber_lv2: 1.25 },
  gold: { hq_lv2: 1.10, hq_lv3: 1.20 },
  stone: { quarry: 1.20 }
};

/**
 * Multiplicador de coleta de `resource` para `playerId`. F3-06: ouro usa o nível do Centro
 * do dono (`HQ_TIER_GOLD_MULT`, `src/data/tiers.js`) — 1.0/1.10/1.20 nos níveis 1/2/3.
 * Madeira/pedra continuam em 1 (Serraria nível 2/Pedreira chegam depois — RATE_BONUS só
 * declarado, sem ligação ainda).
 * @param {number} playerId
 * @param {'gold'|'wood'|'stone'} resource
 * @param {import('../core/GameManager.js').GameManager} gm
 * @returns {number}
 */
export function gatherMultiplier(playerId, resource, gm) {
  if (resource !== 'gold' || !gm || !gm.buildings) return 1;
  let tier = 1;
  for (let i = 0; i < gm.buildings.length; i++) {
    const b = gm.buildings[i];
    const def = BUILDINGS[b.type];
    if (b.ownerId === playerId && !b.isDead && b.tier > 0 && def && def.role === 'hq') {
      tier = Math.max(tier, b.tier);
    }
  }
  return HQ_TIER_GOLD_MULT[tier] || 1;
}
