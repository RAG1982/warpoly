/**
 * ruinsLogic.js — NEW-19: lógica pura (sem three.js) das ruínas visuais.
 */
export const RUIN_HOLD = 45;
export const RUIN_FADE = 5;
export const RUIN_MAX = 24;
export const RUIN_MIN_RADIUS = 1.5;

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
