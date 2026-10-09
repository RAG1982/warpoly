/**
 * src/core/lighting.js (F7-03) — funções PURAS de iluminação/pós-processamento (sem three, sem DOM, sem sim):
 * curva de dia/noite, seleção de efeitos por qualidade e parse dos parâmetros de URL.
 * O `SceneManager` aplica o resultado às luzes; o `PostFX` monta os passes.
 *
 * Nada aqui roda dentro da simulação: o ciclo dia/noite é só visual (relógio de render), então não afeta
 * determinismo, replays nem partidas em rede.
 */

/** Efeitos de pós-processamento desligáveis individualmente. */
export const FX_KEYS = Object.freeze(['bloom', 'ssao', 'colorGrading', 'selectionOutline']);

/**
 * Efeitos efetivos a partir do preset de qualidade.
 * - `texq=low` (textura 'low') desliga TUDO (sem EffectComposer: caminho de render direto, custo zero).
 * - Caso contrário vale o que o preset (`bloom`, `ssao`, `colorGrading`, `selectionOutline`) pede.
 * - `fx` (parâmetro de URL já interpretado por `parseFxParam`) força: true/false por chave.
 * @param {Object} preset  QualityPreset (campos ausentes = desligado)
 * @param {string} textureQuality  'low'|'med'|'high'|'ultra' (efetivo, incl. ?texq=)
 * @param {Object<string, boolean>} [fx]
 */
export function selectEffects(preset, textureQuality, fx = {}) {
  const out = {};
  const cheap = textureQuality === 'low';
  for (const k of FX_KEYS) {
    let v = !cheap && !!(preset && preset[k]);
    if (typeof fx[k] === 'boolean') v = fx[k];
    out[k] = v;
  }
  return out;
}

/** Algum efeito ligado (precisa de EffectComposer). */
export function anyEffect(effects) {
  return FX_KEYS.some((k) => !!effects[k]);
}

const FX_ALIASES = { ao: 'ssao', outline: 'selectionoutline', grade: 'colorgrading', grading: 'colorgrading', sel: 'selectionoutline' };

/**
 * `?fx=` → mapa de forçamentos. `0|off|none` desliga tudo; `1|on|all` liga tudo;
 * lista `bloom,ssao,-outline` (prefixo `-` desliga). Inválido → `{}` (usa o preset).
 */
export function parseFxParam(value) {
  const out = {};
  if (value === null || value === undefined) return out;
  const s = String(value).trim().toLowerCase();
  if (!s) return out;
  if (s === '0' || s === 'off' || s === 'none') { for (const k of FX_KEYS) out[k] = false; return out; }
  if (s === '1' || s === 'on' || s === 'all') { for (const k of FX_KEYS) out[k] = true; return out; }
  for (const part of s.split(',')) {
    let name = part.trim();
    let on = true;
    if (name.startsWith('-')) { on = false; name = name.slice(1); }
    name = FX_ALIASES[name] || name;
    const key = FX_KEYS.find((k) => k.toLowerCase() === name);
    if (key) out[key] = on;
  }
  return out;
}

export function wrap01(x) { return x - Math.floor(x); }
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * `?daynight=` → { enabled, period (s), phase (0..1) }. `1`/`on` = 240 s; número ≥ 20 = período em segundos;
 * `?tod=` (0..1) fixa a fase inicial (0 = meia-noite, 0,5 = meio-dia). Ausente = desligado (partidas inalteradas).
 */
export function parseDayNightParam(daynight, tod) {
  const off = { enabled: false, period: 240, phase: 0.4 };
  if (daynight === null || daynight === undefined) return off;
  const s = String(daynight).trim().toLowerCase();
  if (!s || s === '0' || s === 'off' || s === 'false') return off;
  let period = 240;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 20) period = Math.min(n, 7200);
  else if (!(s === '1' || s === 'on' || s === 'true')) return off;
  const t = Number(tod);
  const phase = tod !== null && tod !== undefined && tod !== '' && Number.isFinite(t) ? wrap01(t) : 0.4;
  return { enabled: true, period, phase };
}

function hexToRgb(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
function rgbToHex(r, g, b) { return ((Math.round(r) & 255) << 16) | ((Math.round(g) & 255) << 8) | (Math.round(b) & 255); }

/** Mistura linear de duas cores 0xRRGGBB. */
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

/** Atmosfera de "dia" padrão (a mesma de `SceneManager.setTimeOfDay('day')`); o tileset sobrepõe céu e hemisfério. */
export const DEFAULT_DAY_BASE = Object.freeze({ sky: 0x85c8ec, hemiSky: 0xcde6ff, hemiGround: 0x567848 });

/**
 * Chaves da curva (fase 0..1: 0 = meia-noite, 0,25 = nascer do sol, 0,5 = meio-dia, 0,75 = pôr do sol).
 * `day` é montada a partir do tileset (céu/hemisfério). Valores de dusk/night = os de `setTimeOfDay`.
 */
function keyframes(base) {
  const night = {
    sky: 0x121b2d, sunColor: 0x89aee6, sunI: 0.7, sunPos: [-30, 60, -30],
    hemiSky: 0x283b5e, hemiGround: 0x111e15, hemiI: 0.45, fillColor: 0x19273c, fillI: 0.2, exposure: 0.92, night: 1
  };
  const dawn = {
    sky: 0xd99a74, sunColor: 0xffb067, sunI: 2.2, sunPos: [60, 38, -50],
    hemiSky: 0xffc9a0, hemiGround: 0x563829, hemiI: 0.7, fillColor: 0x6a5078, fillI: 0.4, exposure: 0.97, night: 0.35
  };
  const day = {
    sky: base.sky, sunColor: 0xfffaec, sunI: 2.45, sunPos: [-45, 75, -35],
    hemiSky: base.hemiSky, hemiGround: base.hemiGround, hemiI: 1.05, fillColor: 0x9fc3e7, fillI: 0.55, exposure: 1, night: 0
  };
  const dusk = {
    sky: 0xdf8458, sunColor: 0xff9d47, sunI: 2.4, sunPos: [-60, 38, -50],
    hemiSky: 0xffb785, hemiGround: 0x563829, hemiI: 0.7, fillColor: 0x5c3d6c, fillI: 0.4, exposure: 0.97, night: 0.35
  };
  return [[0, night], [0.18, night], [0.25, dawn], [0.33, day], [0.67, day], [0.75, dusk], [0.82, night], [1, night]];
}

/**
 * Estado de iluminação na fase `phase` (0..1, cíclica). Interpolação suave entre as chaves.
 * @param {number} phase
 * @param {{sky:number, hemiSky:number, hemiGround:number}} [base]  atmosfera do dia (tileset)
 */
export function sampleDayNight(phase, base = DEFAULT_DAY_BASE) {
  const p = wrap01(phase);
  const keys = keyframes(base);
  let i = 0;
  while (i < keys.length - 2 && p >= keys[i + 1][0]) i++;
  const [t0, a] = keys[i];
  const [t1, b] = keys[i + 1];
  const t = t1 > t0 ? smooth(Math.min(1, Math.max(0, (p - t0) / (t1 - t0)))) : 0;
  return {
    sky: mixHex(a.sky, b.sky, t),
    sunColor: mixHex(a.sunColor, b.sunColor, t),
    sunI: lerp(a.sunI, b.sunI, t),
    sunPos: [lerp(a.sunPos[0], b.sunPos[0], t), lerp(a.sunPos[1], b.sunPos[1], t), lerp(a.sunPos[2], b.sunPos[2], t)],
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiI: lerp(a.hemiI, b.hemiI, t),
    fillColor: mixHex(a.fillColor, b.fillColor, t),
    fillI: lerp(a.fillI, b.fillI, t),
    exposure: lerp(a.exposure, b.exposure, t),
    night: lerp(a.night, b.night, t)
  };
}

/** Avança a fase: `delta` s de relógio, `period` s por ciclo completo. */
export function advancePhase(phase, delta, period) {
  return wrap01(phase + (period > 0 ? delta / period : 0));
}

/** Correção de cor neutra (não altera a imagem). */
export const NEUTRAL_GRADE = Object.freeze({ tint: [1, 1, 1], sat: 1, contrast: 1, brightness: 1, vignette: 0 });

/** Grade do tileset (`def.grade`) completada com padrões neutros e limitada a faixas seguras. */
export function gradeOf(def) {
  const g = (def && def.grade) || {};
  const num = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const tint = Array.isArray(g.tint) && g.tint.length === 3 ? g.tint.map((x) => num(x, 1, 0.5, 1.5)) : [1, 1, 1];
  return {
    tint,
    sat: num(g.sat, 1, 0, 2),
    contrast: num(g.contrast, 1, 0.5, 1.5),
    brightness: num(g.brightness, 1, 0.5, 1.5),
    vignette: num(g.vignette, 0, 0, 0.6)
  };
}

/** Intensidade de brilho do bloom ao longo do dia: mais forte à noite (fogo/magias se destacam). */
export function bloomStrengthFor(base, night) {
  return base * (1 + 0.6 * Math.min(1, Math.max(0, night)));
}
