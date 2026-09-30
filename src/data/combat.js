/**
 * combat.js — F3-03: constante de balanceamento do modelo de combate WC2.
 *
 * DAMAGE_SCALE  Multiplicador aplicado depois do multiplicador aleatório 0,5–1,0
 *               (`src/sim/combat.js`, `computeDamage`). Calibrado para manter o DPS médio
 *               próximo do modelo anterior (`max(2, ataque - armadura)`, sem variação) —
 *               o balanceamento fino é a F3-11.
 */
export const DAMAGE_SCALE = 1.333;
