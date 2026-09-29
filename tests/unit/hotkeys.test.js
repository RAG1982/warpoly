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
