/**
 * combat.js — F3-03: modelo de dano estilo WC2 (básico + perfurante, armadura, tipos de dano,
 * RNG determinístico). Módulo puro (sem three.js) — importável em Node (tools/combat-table.mjs)
 * e testável sem DOM/WebGL.
 *
 * `computeDamage(damage, target, rng)`:
 *   dano = max(0, basic − armor_alvo) + piercing
 *   MAGIC ignora armadura (armor tratada como 0).
 *   SIEGE: ×1,5 se o alvo é construção, ×0,5 se é unidade.
 *   Depois: × multiplicador aleatório uniforme 0,5–1,0 (`0,5 + 0,5·rng.next()`) × DAMAGE_SCALE.
 *   Resultado arredondado, mínimo 1.
 *
 * Contrato de RNG: consome **exatamente 1** valor de `rng.next()` por golpe — mudar isso
 * muda o checksum de determinismo (F2-03).
 *
 * `target` é qualquer objeto com `armor` (número) e, para construções, `fullMesh` ou
 * `isConstructed !== undefined` (mesma convenção usada em `Unit.js` para distinguir alvo
 * unidade vs. construção — ver `_isBuildingTarget`).
 */

export const DAMAGE_TYPES = {
  NORMAL: 'normal',
  PIERCING: 'piercing',
  SIEGE: 'siege',
  MAGIC: 'magic'
};

import { DAMAGE_SCALE } from '../data/combat.js';

/** Mesma convenção de `Unit.js` (`fullMesh` ou `isConstructed !== undefined`) para saber se o alvo é uma construção. */
function isBuildingTarget(target) {
  return !!(target && (target.fullMesh || target.isConstructed !== undefined));
}

/**
 * @param {{basic: number, piercing: number, type: string}} damage
 * @param {{armor?: number, fullMesh?: any, isConstructed?: boolean}} target
 * @param {{next: () => number}} rng
 * @returns {number} dano final, inteiro, mínimo 1
 */
export function computeDamage(damage, target, rng) {
  const basic = damage && damage.basic || 0;
  const piercing = damage && damage.piercing || 0;
  const type = (damage && damage.type) || DAMAGE_TYPES.NORMAL;

  const isMagic = type === DAMAGE_TYPES.MAGIC;
  const armor = isMagic ? 0 : (target && target.armor) || 0;

  let raw = Math.max(0, basic - armor) + piercing;

  if (type === DAMAGE_TYPES.SIEGE) {
    raw *= isBuildingTarget(target) ? 1.5 : 0.5;
  }

  const roll = 0.5 + 0.5 * rng.next();
  const final = raw * roll * DAMAGE_SCALE;

  return Math.max(1, Math.round(final));
}
