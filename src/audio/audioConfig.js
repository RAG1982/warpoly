/**
 * audioConfig.js (F7-08) — configuração PURA do áudio de produção: níveis por preset, tetos de vozes, `?audio=`,
 * detecção de automação (testes/headless ficam mudos por padrão) e RNG de render. Sem three, sem DOM, sem sim.
 *
 * Áudio é só apresentação: nunca entra no checksum e nunca usa o RNG da simulação (nem Math.random/Date.now na sim).
 * Mesmo desenho do `vfxConfig.js` (F7-05): `selectAudioLevel` espelha `selectVfxLevel`.
 */
import { createRenderRng } from '../render/vfx/vfxConfig.js';

/** Níveis: 'off' (nada, nem AudioContext), 'low' (reduzido), 'med', 'high' (tudo). */
export const AUDIO_LEVELS = Object.freeze(['off', 'low', 'med', 'high']);

/**
 * Capacidades por nível.
 *  - maxVoices   efeitos simultâneos (música, ambiência e a fala atual não contam)
 *  - speech      falas de confirmação das unidades
 *  - music       'none' | 'lite' (só baixo, melodia e percussão) | 'full' (todas as camadas)
 *  - ambience    camadas de ambiência por tileset
 *  - positional  atenuação pela distância à câmera
 *  - pan         panorama estéreo por voz (um StereoPannerNode por efeito)
 */
export const AUDIO_CAPS = Object.freeze({
  off: Object.freeze({ maxVoices: 0, speech: false, music: 'none', ambience: false, positional: false, pan: false }),
  low: Object.freeze({ maxVoices: 8, speech: true, music: 'lite', ambience: false, positional: true, pan: false }),
  med: Object.freeze({ maxVoices: 14, speech: true, music: 'full', ambience: true, positional: true, pan: true }),
  high: Object.freeze({ maxVoices: 24, speech: true, music: 'full', ambience: true, positional: true, pan: true })
});

/** Canais de volume que o jogador controla (mais o geral). */
export const AUDIO_CHANNELS = Object.freeze(['music', 'sfx', 'voice']);

/** `?audio=` → nível válido ou `null` (ausente/inválido = usa o preset). Aceita 0/1/off/on. */
export function parseAudioParam(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'none' || s === 'mute' || s === 'off') return 'off';
  if (s === '1' || s === 'true' || s === 'on' || s === 'all') return 'high';
  return AUDIO_LEVELS.includes(s) ? s : null;
}

/** Navegador sob automação (Playwright/Selenium/Chromium headless): `navigator.webdriver === true`. */
export function isAutomation(nav) {
  try {
    return !!(nav && nav.webdriver === true);
  } catch {
    return false;
  }
}

/**
 * Nível efetivo, na ordem: `?audio=` força; automação (testes/headless) fica MUDA por padrão; `texq=low` reduz ('low');
 * senão o campo `audio` do preset de qualidade (padrão 'med').
 * @param {{audio?:string}|null} preset
 * @param {string} textureQuality 'low'|'med'|'high'|'ultra'
 * @param {string|null} [param] valor cru de `?audio=`
 * @param {{automation?:boolean}} [env]
 */
export function selectAudioLevel(preset, textureQuality, param = null, env = {}) {
  const forced = parseAudioParam(param);
  if (forced) return forced;
  if (env && env.automation) return 'off';
  if (textureQuality === 'low') return 'low';
  const lv = preset && preset.audio;
  return AUDIO_LEVELS.includes(lv) ? lv : 'med';
}

/** Capacidades de um nível (nível desconhecido = 'med'). */
export function capsFor(level) {
  return AUDIO_CAPS[level] || AUDIO_CAPS.med;
}

/** Limita um volume ao intervalo 0..1 (NaN/não numérico = `fallback`). */
export function clampVolume(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** RNG de RENDER do áudio (mulberry32; semente fixa => som reproduzível), independente do RNG da simulação. */
export const createAudioRng = createRenderRng;
