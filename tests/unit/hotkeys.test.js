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
import { resolveKey, digitOf, letterOf } from '../../src/core/Hotkeys.js';

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

describe('resolveKey (F3-01)', () => {
  const units = { hasUnits: true, hasBuilding: false };
  it('S/H/A/P viram comandos com unidades e sem construção', () => {
    expect(resolveKey({ code: 'KeyS' }, units)).toEqual({ type: 'unit-command', command: 'stop' });
    expect(resolveKey({ code: 'KeyH' }, units)).toEqual({ type: 'unit-command', command: 'hold' });
    expect(resolveKey({ code: 'KeyA' }, units)).toEqual({ type: 'unit-command', command: 'attackMove' });
    expect(resolveKey({ code: 'KeyP' }, units)).toEqual({ type: 'unit-command', command: 'patrol' });
  });
  it('com construção selecionada, letras vão para o card', () => {
    expect(resolveKey({ code: 'KeyS' }, { hasUnits: false, hasBuilding: true })).toEqual({ type: 'card', letter: 'S' });
    expect(resolveKey({ code: 'KeyA' }, { hasUnits: true, hasBuilding: true })).toEqual({ type: 'card', letter: 'A' });
  });
  it('sem unidades, letras vão para o card; construir com trabalhador', () => {
    expect(resolveKey({ code: 'KeyQ' }, {})).toEqual({ type: 'card', letter: 'Q' });
    expect(resolveKey({ code: 'KeyB' }, units)).toEqual({ type: 'card', letter: 'B' });
  });
  it('modo alvo bloqueia letras; foco em texto bloqueia tudo', () => {
    expect(resolveKey({ code: 'KeyS' }, { ...units, targetMode: 'patrol' })).toBeNull();
    expect(resolveKey({ code: 'KeyS' }, { ...units, typing: true })).toBeNull();
    expect(resolveKey({ code: 'Digit1' }, { typing: true })).toBeNull();
  });
  it('dígitos: Ctrl grava, Shift adiciona, puro seleciona', () => {
    expect(resolveKey({ code: 'Digit3', ctrl: true }, {})).toEqual({ type: 'group-set', digit: 3 });
    expect(resolveKey({ code: 'Digit3', shift: true }, {})).toEqual({ type: 'group-add', digit: 3 });
    expect(resolveKey({ code: 'Digit3' }, {})).toEqual({ type: 'group-select', digit: 3 });
    expect(digitOf('Digit0')).toBeNull();
    expect(letterOf('Digit1')).toBeNull();
  });
  it('atalhos globais', () => {
    expect(resolveKey({ code: 'Period' }, {}).type).toBe('idle-worker');
    expect(resolveKey({ code: 'Space' }, {}).type).toBe('last-alert');
    expect(resolveKey({ code: 'Backspace' }, {}).type).toBe('go-hq');
  });
});
