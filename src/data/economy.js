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
 * - RATE_BONUS       Multiplicadores por melhoria (chegam na F3-06/F3-04-forge); hoje só
 *                     declarados e lidos por `gatherMultiplier`, que devolve 1 sempre.
 */

export const CARRY = { gold: 10, wood: 10, stone: 8 };

export const MINE_ENTER_TIME = 1.5;

export const MINE_SLOTS = { gold: 1, stone: 2 };

export const RATE_BONUS = {
  wood: { lumber_lv2: 1.25 },
  gold: { hq_lv2: 1.10, hq_lv3: 1.20 },
  stone: { quarry: 1.20 }
};

/**
 * Multiplicador de coleta de `resource` para `playerId` (níveis de construção chegam na
 * F3-06: por ora não há melhoria nenhuma aplicada, então devolve sempre 1).
 * @param {number} playerId
 * @param {'gold'|'wood'|'stone'} resource
 * @param {import('../core/GameManager.js').GameManager} gm
 * @returns {number}
 */
export function gatherMultiplier(playerId, resource, gm) {
  return 1;
}
