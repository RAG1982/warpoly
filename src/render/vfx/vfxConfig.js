/**
 * vfxConfig.js (F7-05) — configuração PURA dos VFX de partículas GPU: níveis por preset, tetos dos pools,
 * densidade e RNG de render. Sem three, sem DOM, sem sim. Partículas são só apresentação: nunca entram no checksum
 * e nunca usam o RNG da simulação (nem Math.random/Date.now na sim).
 */

/** Níveis: 'off' (nada), 'low' (reduzido), 'med', 'high' (tudo). */
export const VFX_LEVELS = Object.freeze(['off', 'low', 'med', 'high']);

/** Tetos de cada pool por nível (partículas simultâneas por tipo = 1 draw call por tipo) e densidade dos efeitos. */
export const VFX_CAPS = Object.freeze({
  off: Object.freeze({ solid: 0, smoke: 0, glow: 0, corpses: 0, density: 0, constructionMarks: false }),
  low: Object.freeze({ solid: 160, smoke: 48, glow: 96, corpses: 0, density: 0.4, constructionMarks: false }),
  med: Object.freeze({ solid: 480, smoke: 160, glow: 320, corpses: 24, density: 0.7, constructionMarks: true }),
  high: Object.freeze({ solid: 1200, smoke: 400, glow: 800, corpses: 64, density: 1, constructionMarks: true })
});

/** `?vfx=` → nível válido ou `null` (ausente/inválido = usa o preset). Aceita 0/1/off/on. */
export function parseVfxParam(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'none') return 'off';
  if (s === '1' || s === 'true' || s === 'on' || s === 'all') return 'high';
  return VFX_LEVELS.includes(s) ? s : null;
}

/**
 * Nível efetivo: `?vfx=` força; senão `texq=low` reduz ('low'); senão o campo `vfx` do preset (padrão 'med').
 * @param {{vfx?:string}|null} preset
 * @param {string} textureQuality 'low'|'med'|'high'|'ultra'
 * @param {string|null} [param] valor cru de `?vfx=`
 */
export function selectVfxLevel(preset, textureQuality, param = null) {
  const forced = parseVfxParam(param);
  if (forced) return forced;
  if (textureQuality === 'low') return 'low';
  const lv = preset && preset.vfx;
  return VFX_LEVELS.includes(lv) ? lv : 'med';
}

/** Quantidade escalada pela densidade: 0 se densidade 0; senão ≥ 1. */
export function scaleCount(n, density) {
  if (!(density > 0) || !(n > 0)) return 0;
  return Math.max(1, Math.round(n * density));
}

/** mulberry32 — RNG de RENDER (independente da simulação; semente fixa => efeitos reproduzíveis nas capturas). */
export function createRenderRng(seed = 0x7f4a7c15) {
  let a = seed | 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.signed = (m = 1) => (next() * 2 - 1) * m;
  return next;
}
