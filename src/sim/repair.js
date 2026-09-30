/**
 * repair.js — F3-05: regras puras de reparo/cancelamento de obra (sem three.js/DOM).
 */

/** Intervalo entre golpes de reparo (s) — igual ao do golpe de construção. */
export const REPAIR_INTERVAL = 0.8;
/** Fração do PV máximo restaurada por golpe (20 golpes = 100 %). */
export const REPAIR_HP_FRACTION = 0.05;
/** Reparar 100 % do PV custa esta fração do custo original. */
export const REPAIR_COST_FRACTION = 0.5;
/** Cancelar obra devolve esta fração do custo total (independe do progresso). */
export const CANCEL_REFUND_FRACTION = 0.75;
/** Máximo de trabalhadores simultâneos por construção (obra ou reparo). */
export const MAX_WORKERS_PER_BUILDING = 4;
/** PV inicial de uma obra, como fração de hpMax (sobe com o progresso até 100 %). */
export const CONSTRUCTION_MIN_HP_FRACTION = 0.1;

const RES = ['gold', 'wood', 'stone'];

/**
 * Custo de restaurar `hpRestored` PV de uma construção de custo `cost` e PV máx. `hpMax`:
 * `ceil(cost[r] × 0,5 × hpRestored/hpMax)` para cada recurso.
 * @returns {{gold:number,wood:number,stone:number}}
 */
export function repairCostFor(def, hpRestored) {
  const out = { gold: 0, wood: 0, stone: 0 };
  const hpMax = def && def.hp ? def.hp : 0;
  if (!def || !def.cost || hpMax <= 0 || hpRestored <= 0) return out;
  for (const r of RES) {
    const c = def.cost[r] || 0;
    if (c > 0) out[r] = Math.ceil(c * REPAIR_COST_FRACTION * (hpRestored / hpMax));
  }
  return out;
}

/** Reembolso ao cancelar uma obra: `floor(custo × 0,75)` por recurso. */
export function cancelRefundFor(cost) {
  const out = { gold: 0, wood: 0, stone: 0 };
  if (!cost) return out;
  for (const r of RES) out[r] = Math.floor((cost[r] || 0) * CANCEL_REFUND_FRACTION);
  return out;
}
