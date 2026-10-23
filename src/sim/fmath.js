/**
 * WarPoly — matemática determinística para a simulação (M6-01, docs/09_MULTIPLAYER.md §4).
 *
 * `Math.sin/cos/atan2/hypot` não são exigidos bit a bit idênticos entre motores (V8, SpiderMonkey,
 * JavaScriptCore), e um último bit de diferença vira desync no lockstep. Aqui cada função usa
 * SOMENTE `+ − × ÷`, `Math.sqrt`, `Math.abs` e `Math.round`, que são operações IEEE-754 exatas
 * (arredondamento correto): o mesmo código dá o mesmo resultado em qualquer motor.
 *
 * Método: redução de argumento + polinômio de Taylor (sin/cos) e redução por meio-ângulo + série
 * de Taylor (atan). Os coeficientes são frações exatas escritas como `n / d`. Erro medido < 1e-11
 * rad em todo o domínio útil (o teste exige < 1e-9; render/UI continuam com `Math.*`).
 *
 * Não usar em render, UI ou áudio: lá `Math.*` é suficiente e mais rápido.
 */

export const FM_PI = 3.141592653589793;
export const FM_HALF_PI = 1.5707963267948966;
export const FM_TWO_PI = 6.283185307179586;
const INV_TWO_PI = 1 / FM_TWO_PI;

// sin(r) = r * (1 + r² * SIN_C[0] + r⁴ * SIN_C[1] …) para |r| <= π/2 (termos -r³/3!, +r⁵/5!, …)
const SIN_C = [
  -1 / 6, 1 / 120, -1 / 5040, 1 / 362880,
  -1 / 39916800, 1 / 6227020800, -1 / 1307674368000, 1 / 355687428096000,
];
// cos(t) = 1 + t² * COS_C[0] + t⁴ * COS_C[1] …  para 0 <= t <= π/2
const COS_C = [
  -1 / 2, 1 / 24, -1 / 720, 1 / 40320,
  -1 / 3628800, 1 / 479001600, -1 / 87178291200, 1 / 20922789888000,
];
// atan(u) = u * (1 - u²/3 + u⁴/5 …) para |u| <= tan(π/32) (após 3 reduções)
const ATAN_C = [
  -1 / 3, 1 / 5, -1 / 7, 1 / 9, -1 / 11, 1 / 13, -1 / 15, 1 / 17,
];

/** Horner: c[0] + x*(c[1] + x*(…)). */
function horner(c, x) {
  let p = c[c.length - 1];
  for (let i = c.length - 2; i >= 0; i--) p = p * x + c[i];
  return p;
}

/** Reduz x a r em [-π, π] (k = arredondamento de x / 2π, exato). */
function reduceTurns(x) {
  const k = Math.round(x * INV_TWO_PI);
  return x - k * FM_TWO_PI;
}

/** Seno determinístico (erro < 1e-11 rad para |x| <= 1e6). */
export function fsin(x) {
  let r = reduceTurns(x);
  if (r > FM_HALF_PI) r = FM_PI - r;
  else if (r < -FM_HALF_PI) r = -FM_PI - r;
  const r2 = r * r;
  return r * (1 + r2 * horner(SIN_C, r2));
}

/** Cosseno determinístico (erro < 1e-11 rad para |x| <= 1e6). */
export function fcos(x) {
  const r = reduceTurns(x);
  const t = Math.abs(r);
  if (t > FM_HALF_PI) {
    const u = FM_PI - t;
    const u2 = u * u;
    return -(1 + u2 * horner(COS_C, u2));
  }
  const t2 = t * t;
  return 1 + t2 * horner(COS_C, t2);
}

/** atan(t) para 0 <= t <= 1. */
function atan01(t) {
  let u = t;
  // atan(u) = 2 · atan(u / (1 + √(1 + u²))); três passos: atan(t) = 8 · atan(u3).
  for (let i = 0; i < 3; i++) u = u / (1 + Math.sqrt(1 + u * u));
  const u2 = u * u;
  return 8 * (u * (1 + u2 * horner(ATAN_C, u2)));
}

/** atan2(y, x) determinístico, em (-π, π]. Casos (0, 0) devolvem 0. */
export function fatan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a = ay <= ax ? atan01(ay / ax) : FM_HALF_PI - atan01(ax / ay);
  if (x < 0) a = FM_PI - a;
  return y < 0 ? -a : a;
}

/** Distância euclidiana (2 ou 3 componentes) com `sqrt` exato. */
export function fhypot(a, b, c = 0) {
  return Math.sqrt(a * a + b * b + c * c);
}
