import { describe, it, expect } from 'vitest';
import {
  BUILD_HOTKEY_BY_ROLE,
  TRAIN_SLOT_HOTKEYS,
  RESEARCH_SLOT_HOTKEYS,
  getBuildHotkey,
  getTrainHotkey,
  getResearchHotkey
} from '../../src/ui/hotkeys.js';
import { FACTIONS } from '../../src/data/index.js';

function hasDuplicates(arr) {
  return new Set(arr).size !== arr.length;
}

describe('hotkeys (F6-03)', () => {
  it('não tem teclas duplicadas por contexto (construir / treinar / pesquisa)', () => {
    expect(hasDuplicates(Object.values(BUILD_HOTKEY_BY_ROLE))).toBe(false);
    expect(hasDuplicates(TRAIN_SLOT_HOTKEYS)).toBe(false);
    expect(hasDuplicates(RESEARCH_SLOT_HOTKEYS)).toBe(false);
  });

  it('treinar e pesquisa não compartilham letra (evita ambiguidade se exibidos juntos)', () => {
    const overlap = TRAIN_SLOT_HOTKEYS.filter(k => RESEARCH_SLOT_HOTKEYS.includes(k));
    expect(overlap).toEqual([]);
  });

  it('resolve a tecla de construir pelo papel da construção, para as duas facções', () => {
    for (const faction of Object.values(FACTIONS)) {
      expect(getBuildHotkey(faction.house)).toBe('C');
      expect(getBuildHotkey(faction.lumber)).toBe('L');
      expect(getBuildHotkey(faction.farm)).toBe('F');
      expect(getBuildHotkey(faction.barracks)).toBe('B');
      expect(getBuildHotkey(faction.forge)).toBe('K');
      expect(getBuildHotkey(faction.tower)).toBe('T');
    }
  });

  it('todas as construções de buildList das duas facções têm tecla de atalho válida', () => {
    for (const faction of Object.values(FACTIONS)) {
      for (const buildingType of faction.buildList) {
        expect(getBuildHotkey(buildingType)).not.toBe('');
      }
    }
  });

  it('treinar/pesquisa são posicionais (0-based) e vazias fora do intervalo', () => {
    expect(getTrainHotkey(0)).toBe('Q');
    expect(getTrainHotkey(1)).toBe('W');
    expect(getTrainHotkey(2)).toBe('E');
    expect(getTrainHotkey(3)).toBe('');

    expect(getResearchHotkey(0)).toBe('R');
    expect(getResearchHotkey(3)).toBe('D');
    expect(getResearchHotkey(4)).toBe('');
  });
});

import { resolveKey, limitByDistance, SELECTION_LIMIT } from '../../src/core/Hotkeys.js';

describe('resolveKey (F3-01)', () => {
  const key = (code, extra = {}) => ({ code, ctrl: false, shift: false, alt: false, meta: false, ...extra });
  const units = { hasUnits: true, hasBuilding: false, targetMode: null, cardLetters: new Set(['C', 'L', 'R']) };
  const building = { hasUnits: false, hasBuilding: true, targetMode: null, cardLetters: new Set(['Q', 'W', 'R', 'A', 'S', 'D']) };

  it('grupos: Ctrl grava, Shift adiciona, número seleciona', () => {
    expect(resolveKey(key('Digit3', { ctrl: true }), units)).toEqual({ type: 'group', op: 'set', n: 3 });
    expect(resolveKey(key('Digit3', { shift: true }), units)).toEqual({ type: 'group', op: 'add', n: 3 });
    expect(resolveKey(key('Digit3'), units)).toEqual({ type: 'group', op: 'select', n: 3 });
  });

  it('unidades selecionadas: S/H/A/P são ordens; C vai ao card', () => {
    expect(resolveKey(key('KeyS'), units)).toEqual({ type: 'order', order: 'stop' });
    expect(resolveKey(key('KeyH'), units)).toEqual({ type: 'order', order: 'hold' });
    expect(resolveKey(key('KeyA'), units)).toEqual({ type: 'order', order: 'attackMove' });
    expect(resolveKey(key('KeyP'), units)).toEqual({ type: 'order', order: 'patrol' });
    expect(resolveKey(key('KeyC'), units)).toEqual({ type: 'card', letter: 'C' });
    expect(resolveKey(key('KeyZ'), units)).toBeNull();
  });

  it('construção selecionada: letras do card têm prioridade (A/S pesquisam, não ordenam)', () => {
    expect(resolveKey(key('KeyS'), building)).toEqual({ type: 'card', letter: 'S' });
    expect(resolveKey(key('KeyA'), building)).toEqual({ type: 'card', letter: 'A' });
    expect(resolveKey(key('KeyH'), building)).toBeNull();
  });

  it('modo-alvo bloqueia letras de ordem e card, mas não grupos nem Backspace', () => {
    const t = { ...units, targetMode: { kind: 'attackMove' } };
    expect(resolveKey(key('KeyS'), t)).toBeNull();
    expect(resolveKey(key('KeyC'), t)).toBeNull();
    expect(resolveKey(key('Backspace'), t)).toEqual({ type: 'hq' });
    expect(resolveKey(key('Digit1'), t)).toEqual({ type: 'group', op: 'select', n: 1 });
  });

  it('ponto, espaço e Backspace', () => {
    expect(resolveKey(key('Period'), units)).toEqual({ type: 'idleWorker' });
    expect(resolveKey(key('Space'), units)).toEqual({ type: 'lastAlert' });
    expect(resolveKey(key('Backspace'), units)).toEqual({ type: 'hq' });
  });
});

describe('limite de seleção (F3-01)', () => {
  it('30 unidades na caixa → as 24 mais próximas do centro', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ id: i, x: i * 10, y: 0 }));
    const picked = limitByDistance(items, { x: 0, y: 0 });
    expect(SELECTION_LIMIT).toBe(24);
    expect(picked).toHaveLength(24);
    expect(picked.map(p => p.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('até o limite devolve todas', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i, x: i, y: 0 }));
    expect(limitByDistance(items, { x: 0, y: 0 })).toHaveLength(5);
  });
});
