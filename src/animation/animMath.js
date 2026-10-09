/**
 * animMath.js (F7-06) — funções PURAS da animação de produção (sem three, sem DOM, sem sim):
 * variante estável por id, curva de blend entre estados, estilo de morte por tipo de dano, idle variado com rng injetado.
 * Só apresentação: nada daqui entra no checksum nem usa o RNG da simulação / Math.random.
 */

/** Duração do cross-fade entre estados (s). */
export const BLEND_DURATION = 0.14;

/** Estilos de morte. */
export const DEATH_STYLES = Object.freeze(['cut', 'crush', 'magic', 'projectile']);

/** Variantes de idle (0 = respiração padrão). */
export const IDLE_VARIANTS = 3;
/** Intervalo (s) entre trocas de idle: [min, max]. */
export const IDLE_INTERVAL = Object.freeze([3.5, 8]);

/** Variante estável (0..count-1) a partir de um id inteiro: mesmo id => mesma variante, sempre. */
export function stableVariant(id, count = 2, salt = 0) {
  let h = ((id | 0) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h % Math.max(1, count | 0);
}

/** Peso do cross-fade (0 = pose antiga, 1 = nova): smoothstep de t/dur, preso a [0,1]. */
export function blendWeight(t, dur = BLEND_DURATION) {
  if (!(dur > 0)) return 1;
  const x = Math.min(1, Math.max(0, t / dur));
  return x * x * (3 - 2 * x);
}

/** Remapeia o progresso do ataque: a variante 1 tem preparo mais lento e golpe mais seco. */
export function attackProgress(p, variant) {
  const x = Math.min(1, Math.max(0, p));
  return variant === 1 ? x * x * (1.6 - 0.6 * x) : x;
}

/** Estilo de morte a partir de `Unit.lastHitTag` (dica de render da sim); desconhecido => 'cut'. */
export function deathStyleFor(tag) {
  return DEATH_STYLES.includes(tag) ? tag : 'cut';
}

/** Próximo intervalo de idle em segundos (rng injetado: () => [0,1)). */
export function idleInterval(rng) {
  return IDLE_INTERVAL[0] + (IDLE_INTERVAL[1] - IDLE_INTERVAL[0]) * rng();
}

/** Escolhe a variante de idle extra (1..count-1), diferente da atual quando possível. */
export function pickIdleVariant(rng, current = 0, count = IDLE_VARIANTS) {
  const n = count - 1;
  if (n <= 1) return 1;
  let v = 1 + Math.min(n - 1, Math.floor(rng() * n));
  if (v === current) v = 1 + (v % n);
  return v;
}

/** Envelope 0→1→0 de uma variante de idle ao longo de um ciclo (p em 0..1). */
export function idleEnvelope(p) {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
}

/** Amortecimento dos braços ao andar carregando recurso e inclinação do tronco. */
export const CARRY_ARM_DAMP = 0.45;
export const CARRY_LEAN = 0.16;

/** Curvas da morte (progress 0..1.05+): agachar, cair e assentar — compartilhadas pelos estilos. */
export function deathPhase(progress) {
  const crouch = Math.min(1, progress / 0.25);
  const fall = progress < 0.25 ? 0 : Math.min(1, (progress - 0.25) / 0.55);
  const settle = progress < 0.8 ? 0 : Math.min(1, (progress - 0.8) / 0.25);
  return { crouch: crouch * crouch, fall: fall * fall, settle, bounce: Math.sin(settle * Math.PI) * 0.05 * (1 - settle) };
}
