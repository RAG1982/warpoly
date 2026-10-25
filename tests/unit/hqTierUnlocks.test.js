import { describe, it, expect } from 'vitest';
import { hqTierUnlocks, hasAnyUnlock } from '../../src/ui/hqTierUnlocks.js';
import { effectsForEvent } from '../../src/render/vfx/vfxMapping.js';
import { EVT } from '../../src/sim/events.js';
import { BUILDINGS, UNITS, RESEARCH } from '../../src/data/index.js';
import { researchToken } from '../../src/sim/techRestriction.js';

describe('M3-03a: o que o Centro libera por nível (derivado de requires {hq:N})', () => {
  it('nível 1 não libera nada (nenhum requisito é {hq:1})', () => {
    expect(hasAnyUnlock(hqTierUnlocks(1, 'human'))).toBe(false);
    expect(hasAnyUnlock(hqTierUnlocks(1, 'orc'))).toBe(false);
  });

  it('nível 2 humano: Estábulo, Cavaleiro e a pesquisa de nível 2 (token id@2)', () => {
    const u = hqTierUnlocks(2, 'human');
    expect(u.buildings).toContain('stable');
    expect(u.units).toContain('cavalier');
    expect(u.research).toContain(researchToken('melee_weapons', 2));
    expect(u.research).not.toContain('melee_weapons'); // o nível 1 já existia antes
  });

  it('nível 3 humano traz o que exige hq 3 e não repete o de nível 2', () => {
    const u3 = hqTierUnlocks(3, 'human');
    const u2 = hqTierUnlocks(2, 'human');
    const hq3Buildings = Object.keys(BUILDINGS).filter((id) => BUILDINGS[id].faction !== 'orc' && (BUILDINGS[id].requires || []).some((r) => r && r.hq === 3));
    expect(hq3Buildings.length).toBeGreaterThan(0);
    for (const id of hq3Buildings) expect(u3.buildings).toContain(id);
    for (const id of u2.buildings) expect(u3.buildings).not.toContain(id);
  });

  it('separa as facções (nada de tropa orc para humano e vice-versa)', () => {
    const humanUnits = hqTierUnlocks(2, 'human').units;
    const orcUnits = hqTierUnlocks(2, 'orc').units;
    expect(humanUnits.every((id) => !UNITS[id].faction || UNITS[id].faction === 'human')).toBe(true);
    expect(orcUnits.every((id) => !UNITS[id].faction || UNITS[id].faction === 'orc')).toBe(true);
    expect(orcUnits).not.toContain('cavalier');
  });

  it('pesquisa sem `faction` vale para as duas facções', () => {
    const neutral = Object.keys(RESEARCH).filter((id) => !RESEARCH[id].faction && RESEARCH[id].levels.some((lv) => (lv.requires || []).some((r) => r && r.hq === 2)));
    expect(neutral.length).toBeGreaterThan(0);
    for (const f of ['human', 'orc']) {
      const tokens = hqTierUnlocks(2, f).research;
      for (const id of neutral) expect(tokens).toContain(researchToken(id, RESEARCH[id].levels.findIndex((lv) => (lv.requires || []).some((r) => r && r.hq === 2)) + 1));
    }
  });

  it('isAllowed (travas da campanha) esconde o item bloqueado', () => {
    const u = hqTierUnlocks(2, 'human', (kind, id) => !(kind === 'units' && id === 'cavalier'));
    expect(u.units).not.toContain('cavalier');
    expect(u.buildings).toContain('stable');
  });
});

describe('M3-03a: evento HQ_TIER_CHANGED -> descritor de fogos de artifício', () => {
  it('gera o efeito "fireworks" sobre o Centro com a altura do modelo do nível', () => {
    const fx = effectsForEvent(EVT.HQ_TIER_CHANGED, { buildingId: 1, ownerId: 1, pos: { x: 3, y: 0, z: -2 }, tier: 2 });
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ fx: 'fireworks', pos: { x: 3, y: 0, z: -2 }, height: 12.5 });
  });

  it('nível desconhecido cai no modelo do nível 1 (nunca quebra)', () => {
    const fx = effectsForEvent(EVT.HQ_TIER_CHANGED, { pos: { x: 0, y: 0, z: 0 }, tier: 9 });
    expect(fx[0].height).toBe(9.0);
  });
});
