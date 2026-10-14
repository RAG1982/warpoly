/**
 * ruinsLogic.js — NEW-19: lógica pura (sem three.js) das ruínas visuais.
 */
export const RUIN_HOLD = 45;
export const RUIN_FADE = 5;
export const RUIN_MAX = 24;
export const RUIN_MIN_RADIUS = 1.5;
/**
 * Raio do decal da ruína de MINA/pedreira. O modelo da mina continua em pé depois de esgotada e a pegada dele é de ~3,5 u
 * de raio (gold_mine.glb 7,0 × 6,8; stone_quarry.glb 6,4 × 6,2): com `ruinRadius(3,4)` o decal e o entulho ficavam
 * escondidos dentro do próprio modelo (captura de 2026-10-11) e, com 5,4, só a franja transparente do decal passava da pegada.
 * A textura do decal tem o miolo escuro entre ~0,5 e ~0,8 do raio (some na borda): com 7,2 esse anel cai em 3,6–5,8 u, fora da pegada.
 */
export const MINE_RUIN_RADIUS = 7.2;

/** Raio do decal: proporcional ao collisionRadius, com mínimo. */
export function ruinRadius(collisionRadius) {
  return Math.max(RUIN_MIN_RADIUS, (collisionRadius || 0) * 1.15);
}

/** Opacidade: 1 até 45 s, linear até 0 aos 50 s. */
export function ruinAlpha(age) {
  if (age <= RUIN_HOLD) return 1;
  if (age >= RUIN_HOLD + RUIN_FADE) return 0;
  return 1 - (age - RUIN_HOLD) / RUIN_FADE;
}

/** Slot livre (`state === 'free'`); senão o mais velho (maior `age`). */
export function pickSlot(slots) {
  let oldest = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].state === 'free') return i;
    if (slots[i].age > slots[oldest].age) oldest = i;
  }
  return oldest;
}
