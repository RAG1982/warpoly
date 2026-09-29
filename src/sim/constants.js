/**
 * constants.js — constantes da simulação em tick fixo (F1-09).
 *
 * `SIM_DT`: passo fixo de simulação, em segundos (20 Hz). `MAX_STEPS`: número
 * máximo de passos de simulação executados por chamada de `GameManager.advance`
 * (evita espiral de morte quando o frame demora demais — o acumulador é zerado
 * se o limite for atingido).
 */
export const SIM_DT = 0.05;
export const MAX_STEPS = 8;

/**
 * Interpola o ângulo (radianos) de `a` para `b` pelo menor arco, com fator `t` ∈ [0,1].
 * Usado para suavizar `mesh.rotation.y` de unidades/projéteis entre passos de simulação.
 */
export function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  else if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
