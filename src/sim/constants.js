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

/**
 * LOD de animação (F1-09 item 4): decide, para uma unidade dentro do frustum e visível, se ela
 * anima neste frame renderizado. `frameIndex` é o contador de frames de `GameManager.renderUpdate`
 * e `id` o id estável da unidade — juntos espalham a carga entre unidades em vez de todas
 * animarem/pausarem no mesmo frame. Retorna `1` (anima este frame) ou `0` (pula).
 * Unidades fora do frustum/invisíveis são tratadas separadamente por `GameManager.renderUpdate`
 * (acumulam o delta perdido em `_animAcc` em vez de usar esta função).
 */
export function animationLodStep(distance, frameIndex, id) {
  if (distance <= 60) return 1;
  if (distance <= 100) return (frameIndex + id) % 2 === 0 ? 1 : 0;
  return (frameIndex + id) % 4 === 0 ? 1 : 0;
}
