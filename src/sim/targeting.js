/**
 * targeting.js — F4-06: regras de alvo por camada (puro, sem three.js/DOM).
 *
 * `canTarget(attacker, target)` decide se `attacker` pode ser ordenado/auto-adquirir `target`:
 *  - alvo `immune` (Olho Vigia) nunca;
 *  - alvo aéreo (`layer === 'air'`) só por atacante com `canHitAir === true`;
 *  - alvo terrestre (unidade ou construção) só por atacante com `canHitGround !== false`.
 * `attacker` é qualquer objeto com esses campos (Unit, Building ou literal de teste). Em `Unit`,
 * `canHitAir` vem da definição (`units.js`) ou, se omitido, vale "é atirador não-cerco"; em `Building`,
 * de `tower.hitsAir`. Melee e cerco, portanto, nunca atingem aéreos (cerco: `isBallistic`).
 */

/**
 * Valor padrão de `canHitAir` para uma definição de unidade (`units.js`): o campo explícito, ou
 * "ataca à distância e não é cerco balístico" (arqueiros, lançadores, magos/necromantes).
 * @param {{canHitAir?: boolean, isRanged?: boolean, projectile?: string|null, splashRadius?: number}} def
 */
export function defaultCanHitAir(def) {
  if (typeof def.canHitAir === 'boolean') return def.canHitAir;
  const ballistic = (def.projectile === 'bolt' || def.projectile === 'boulder') && (def.splashRadius || 0) > 0;
  return !!def.isRanged && !ballistic;
}

/** @returns {boolean} */
export function canTarget(attacker, target) {
  if (!attacker || !target || target.immune) return false;
  if (target.layer === 'air') return attacker.canHitAir === true;
  return attacker.canHitGround !== false;
}
