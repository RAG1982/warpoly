/**
 * optionsApply.js (F6-08) — aplica as opções salvas aos serviços vivos (áudio, teclas, UI).
 * Chamado no boot (main.js) e a cada mudança na tela de Opções.
 */
import { options } from './optionsStore.js';
import { setBindings } from '../core/Hotkeys.js';
import { applyUiScale } from './uiScale.js';

/** Volume geral multiplica efeitos e música (`SoundManager.setSfxVolume/setMusicVolume`). */
export function applyAudio(sound, store = options) {
  if (!sound) return;
  const master = store.get('volumeMaster');
  sound.setSfxVolume(store.get('volumeSfx') * master);
  sound.setMusicVolume(store.get('volumeMusic') * master);
}

export function applyKeybinds(store = options) {
  return setBindings(store.get('keybinds'));
}

/** Modo daltônico: só marca `data-colorblind` no <html> (cores de time: F7-02). */
export function applyColorblind(store = options) {
  const v = store.get('colorblind');
  if (typeof document !== 'undefined') document.documentElement.dataset.colorblind = v;
  return v;
}

/** Boot: preenche o espelho em memória e aplica teclas/daltonismo/escala (o áudio vai com `applyAudio`). */
export function bootOptions(store = options) {
  store.loadRuntime();
  applyKeybinds(store);
  applyColorblind(store);
  if (typeof document !== 'undefined') applyUiScale();
}
