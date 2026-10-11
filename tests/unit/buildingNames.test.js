import { describe, it, expect } from 'vitest';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';
import { BUILDINGS, TIER_NAMES } from '../../src/data/index.js';

/** NEW-29: nomes das construções seguem os nomes de nível (tiers.js) e do design D7. */
describe('nomes de construções (NEW-29)', () => {
  it('o nível 1 de cada Centro (tiers.js) é o nome da construção HQ da facção', () => {
    for (const faction of ['human', 'orc']) {
      const hq = Object.values(BUILDINGS).find((b) => b.role === 'hq' && b.faction === faction);
      expect(hq, `HQ de ${faction}`).toBeTruthy();
      // Níveis 2 e 3 (Fortaleza/Castelo, Bastião/Cidadela) são upgrades da mesma construção:
      // não têm entrada própria em buildings.js, por isso só o nível 1 é comparado aqui.
      expect(hq.name, `${faction} nível 1`).toBe(TIER_NAMES[faction][1]);
      expect(hq.entityName, `${faction} entityName`).toBe(TIER_NAMES[faction][1]);
    }
  });

  it('todo nome de nível de tiers.js é texto não vazio', () => {
    for (const names of Object.values(TIER_NAMES)) {
      for (const n of Object.values(names)) expect(typeof n === 'string' && n.trim().length > 0).toBe(true);
    }
  });

  it('toda construção tem chave i18n de nome em pt-BR e en, com as mesmas chaves nos dois idiomas', () => {
    for (const id of Object.keys(BUILDINGS)) {
      const key = `building.${id}.name`;
      expect(key in ptBR, `pt-BR ausente: ${key}`).toBe(true);
      expect(key in en, `en ausente: ${key}`).toBe(true);
      expect(ptBR[key].trim(), key).not.toBe('');
      expect(en[key].trim(), key).not.toBe('');
    }
    const buildingKeys = (dict) => Object.keys(dict).filter((k) => /^building\..+\.name$/.test(k)).sort();
    expect(buildingKeys(en)).toEqual(buildingKeys(ptBR));
  });

  it('o nome pt-BR de cada construção espelha o nome dos dados', () => {
    for (const [id, b] of Object.entries(BUILDINGS)) {
      expect(ptBR[`building.${id}.name`], id).toBe(b.entityName || b.name);
    }
  });
});
