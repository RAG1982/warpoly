import { describe, it, expect, beforeEach } from 'vitest';
import { createOptionsStore, OPTION_DEFS, runtime } from '../../src/ui/optionsStore.js';
import { sanitizeOverrides, mergePreset, QUALITY_PRESETS } from '../../src/core/QualitySettings.js';
import {
  resolveKey, setBindings, getBindings, DEFAULT_BINDINGS, findConflict, isReservedCode, codeLabel
} from '../../src/core/Hotkeys.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m
  };
}

describe('optionsStore (F6-08)', () => {
  let st;
  let store;
  beforeEach(() => { st = fakeStorage(); store = createOptionsStore(st); });

  it('devolve os padrões quando nada foi salvo', () => {
    expect(store.get('volumeMaster')).toBe(1);
    expect(store.get('panSpeed')).toBe(1);
    expect(store.get('edgePan')).toBe(true);
    expect(store.get('uiScale')).toBe(1);
    expect(store.get('colorblind')).toBe('off');
    expect(store.get('defaultSpeed')).toBe(1);
    expect(store.get('floatingText')).toBe(true);
    expect(store.get('keybinds')).toEqual({});
  });

  it('grava e lê de volta (chaves já existentes do jogo)', () => {
    store.set('uiScale', 1.25);
    store.set('edgePan', false);
    store.set('colorblind', 'deutan');
    expect(st._m.get('warpoly.uiScale')).toBe('1.25');
    expect(st._m.get('warpoly.edgePan')).toBe('0');
    expect(store.get('uiScale')).toBe(1.25);
    expect(store.get('edgePan')).toBe(false);
    expect(store.get('colorblind')).toBe('deutan');
  });

  it('valores inválidos no storage viram o padrão', () => {
    const bad = createOptionsStore(fakeStorage({
      'warpoly.volSfx': 'abc', 'warpoly.panSpeed': '', 'warpoly.edgePan': 'talvez', 'warpoly.colorblind': 'xyz',
      'warpoly.defaultSpeed': '7', 'warpoly.keybinds': '{quebrado', 'warpoly.uiScale': 'NaN'
    }));
    expect(bad.get('volumeSfx')).toBe(OPTION_DEFS.volumeSfx.def);
    expect(bad.get('panSpeed')).toBe(1);
    expect(bad.get('edgePan')).toBe(true);
    expect(bad.get('colorblind')).toBe('off');
    expect(bad.get('defaultSpeed')).toBe(1);
    expect(bad.get('keybinds')).toEqual({});
    expect(bad.get('uiScale')).toBe(1);
  });

  it('valores fora da faixa são limitados', () => {
    store.set('panSpeed', 9);
    store.set('uiScale', 0.1);
    store.set('volumeMusic', -3);
    expect(store.get('panSpeed')).toBe(2);
    expect(store.get('uiScale')).toBe(0.75);
    expect(store.get('volumeMusic')).toBe(0);
  });

  it('keybinds: só strings alfanuméricas', () => {
    store.set('keybinds', { stop: 'KeyX', hold: 5, bad: '<script>' });
    expect(store.get('keybinds')).toEqual({ stop: 'KeyX' });
  });

  it('restaurar padrão por aba remove as chaves e volta ao padrão', () => {
    store.set('volumeMaster', 0.2);
    store.set('volumeSfx', 0.1);
    store.set('uiScale', 1.4);
    store.resetTab('audio');
    expect(store.get('volumeMaster')).toBe(1);
    expect(store.get('volumeSfx')).toBe(OPTION_DEFS.volumeSfx.def);
    expect(st._m.has('warpoly.volMaster')).toBe(false);
    expect(store.get('uiScale')).toBe(1.4); // outra aba intacta
  });

  it('espelho `runtime` acompanha set/reset/loadRuntime', () => {
    store.set('panSpeed', 1.5);
    store.set('floatingText', false);
    expect(runtime.panSpeed).toBe(1.5);
    expect(runtime.floatingText).toBe(false);
    store.resetTab('controls');
    expect(runtime.panSpeed).toBe(1);
    const other = createOptionsStore(fakeStorage({ 'warpoly.floatingText': '0', 'warpoly.panSpeed': '0.7' }));
    other.loadRuntime();
    expect(runtime.floatingText).toBe(false);
    expect(runtime.panSpeed).toBe(0.7);
    store.resetTab('game');
    store.resetTab('controls');
  });

  it('opção desconhecida lança erro', () => {
    expect(() => store.get('nada')).toThrow();
  });
});

describe('QualitySettings: ajustes avançados (F6-08)', () => {
  it('sanitizeOverrides descarta lixo e limita faixas', () => {
    expect(sanitizeOverrides({ shadows: 'sim', maxPixelRatio: 9, targetFps: 1, textureQuality: 'x', fpsCap: 0, ruim: 1 }))
      .toEqual({ maxPixelRatio: 2, targetFps: 15, fpsCap: 0 });
    expect(sanitizeOverrides(null)).toEqual({});
    expect(sanitizeOverrides([1])).toEqual({});
  });

  it('mergePreset aplica ajustes sobre o preset sem alterá-lo', () => {
    const m = mergePreset(QUALITY_PRESETS.high, { shadows: false, maxPixelRatio: 0.5, textureQuality: 'low' });
    expect(m.shadows).toBe(false);
    expect(m.textureQuality).toBe('low');
    expect(m.minPixelRatio).toBeLessThanOrEqual(m.maxPixelRatio);
    expect(m.name).toBe('high');
    expect(m.fpsCap).toBe(0);
    expect(QUALITY_PRESETS.high.shadows).toBe(true);
  });
});

describe('Hotkeys: remapeamento (F6-08)', () => {
  const key = (code) => ({ code, ctrl: false, shift: false, alt: false, meta: false });
  const units = { hasUnits: true, hasBuilding: false, targetMode: null, cardLetters: new Set() };
  beforeEach(() => { setBindings({}); });

  it('padrão equivale ao comportamento antigo', () => {
    expect(getBindings()).toEqual(DEFAULT_BINDINGS);
    expect(resolveKey(key('KeyS'), units)).toEqual({ type: 'order', order: 'stop' });
    expect(resolveKey(key('Space'), units)).toEqual({ type: 'lastAlert' });
  });

  it('tecla remapeada passa a valer e a antiga deixa de valer', () => {
    setBindings({ stop: 'KeyX', lastAlert: 'KeyZ' });
    expect(resolveKey(key('KeyX'), units)).toEqual({ type: 'order', order: 'stop' });
    expect(resolveKey(key('KeyS'), units)).toBeNull();
    expect(resolveKey(key('KeyZ'), units)).toEqual({ type: 'lastAlert' });
    expect(resolveKey(key('Space'), units)).toBeNull();
  });

  it('ordens continuam bloqueadas em modo-alvo e com construção selecionada', () => {
    setBindings({ stop: 'KeyX' });
    expect(resolveKey(key('KeyX'), { ...units, targetMode: { kind: 'repair' } })).toBeNull();
    expect(resolveKey(key('KeyX'), { ...units, hasBuilding: true })).toBeNull();
  });

  it('atribuições duplicadas ou reservadas são ignoradas', () => {
    setBindings({ stop: 'KeyH', hold: 'KeyH', patrol: 'Escape', attackMove: 'Digit1' });
    const b = getBindings();
    expect(b.stop).toBe('KeyH');
    expect(new Set(Object.values(b).filter(Boolean)).size).toBe(Object.values(b).filter(Boolean).length);
    expect(b.patrol).toBe('KeyP');
    expect(b.attackMove).toBe('KeyA');
    expect(b.hold).toBeNull(); // o padrão (H) foi tomado por "stop"
  });

  it('findConflict, isReservedCode e codeLabel', () => {
    expect(findConflict('KeyS', 'hold')).toBe('stop');
    expect(findConflict('KeyS', 'stop')).toBeNull();
    expect(isReservedCode('Escape')).toBe(true);
    expect(isReservedCode('Digit5')).toBe(true);
    expect(isReservedCode('KeyW')).toBe(true);
    expect(isReservedCode('KeyQ')).toBe(false);
    expect(codeLabel('KeyS')).toBe('S');
    expect(codeLabel('Space')).toBe('Espaço');
  });
});
