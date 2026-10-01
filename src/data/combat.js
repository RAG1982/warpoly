/**
 * combat.js — F3-03: constante de balanceamento do modelo de combate WC2.
 *
 * DAMAGE_SCALE  Multiplicador aplicado depois do multiplicador aleatório 0,5–1,0
 *               (`src/sim/combat.js`, `computeDamage`). Calibrado para manter o DPS médio
 *               próximo do modelo anterior (`max(2, ataque - armadura)`, sem variação) —
 *               o balanceamento fino é a F3-11.
 */
export const DAMAGE_SCALE = 1.333;

/** F4-04: segundos que o registro de cadáver (`GameManager.corpses`) fica disponível para Erguer Mortos. */
export const CORPSE_LIFETIME = 30;
/** F4-04: capacidade do pool fixo de cadáveres (FIFO: o mais antigo é sobrescrito). */
export const CORPSE_CAPACITY = 64;
/** F4-04: detecção de unidades invisíveis — raio de detectores (unidades `detector`, torre arcana/santuário) e de contato. */
export const DETECT_RADIUS = 12;
export const DETECT_CONTACT_RADIUS = 2;
/** F4-04: dano fixo do Escudo de Chamas por golpe corpo a corpo recebido. */
export const FLAMESHIELD_DAMAGE = 8;
