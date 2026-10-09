/**
 * audioEnv.js (F7-08) — lê do ambiente do navegador o que decide o nível de áudio (`?audio=`, automação, preset) e
 * devolve o nível efetivo. Fica separado de `audioConfig.js` (puro) por tocar `location`/`navigator` (injetáveis).
 */
import { selectAudioLevel, isAutomation } from './audioConfig.js';

/**
 * @param {{audio?:string}|null} preset  `QualitySettings.current` (campo `audio`)
 * @param {string} textureQuality        `getTextureQuality()`
 * @param {{location?:{search:string}, navigator?:object}} [win]  janela (padrão: globalThis); injetável nos testes
 * @returns {'off'|'low'|'med'|'high'}
 */
export function detectAudioLevel(preset, textureQuality, win = globalThis) {
  let param = null;
  try {
    param = new URLSearchParams((win.location && win.location.search) || '').get('audio');
  } catch { /* sem location */ }
  return selectAudioLevel(preset, textureQuality, param, { automation: isAutomation(win.navigator) });
}
