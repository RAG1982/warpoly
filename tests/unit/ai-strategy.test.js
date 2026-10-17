import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/sim/rng.js';
import { DIFFICULTY_PROFILES } from '../../src/ai/AIProfile.js';
import { STRATEGIES, AI_FEATURES, pickStrategy, adaptMix, availableStrategies } from '../../src/ai/AIStrategy.js';
import { unitClassOf } from '../../src/ai/AIPerception.js';
import { makeGm } from './helpers/aiWorld.js';

/** F5-04 — estratégias por seed, flag aérea, contra-unidades. */

describe('F5-04: estratégias', () => {
  it('escolha determinística por seed e a flag aérea desligada nunca sorteia "air"', () => {
    const pick = (seed, d) => pickStrategy(createRng(seed).fork('ai:' + d), DIFFICULTY_PROFILES.hard).id;
    for (let s = 1; s <= 40; s++) expect(pick(s, 1)).toBe(pick(s, 1));
    const set = new Set();
    for (let s = 1; s <= 200; s++) set.add(pick(s, 1));
    expect(set.has('air')).toBe(false);
    expect(set.size).toBeGreaterThanOrEqual(3);
    expect(availableStrategies(DIFFICULTY_PROFILES.hard).map(x => x.id)).not.toContain('air');
    expect(availableStrategies(DIFFICULTY_PROFILES.hard, { air: true }).map(x => x.id)).toContain('air');
    expect(AI_FEATURES.air).toBe(false);
    const withAir = new Set();
    for (let s = 1; s <= 200; s++) withAir.add(pickStrategy(createRng(s), DIFFICULTY_PROFILES.hard, { air: true }).id);
    expect(withAir.has('air')).toBe(true);
    // Fácil nunca faz rush
    for (let s = 1; s <= 100; s++) expect(pickStrategy(createRng(s), DIFFICULTY_PROFILES.easy).id).not.toBe('rush');
  });

  it('o diretor guarda a estratégia sorteada; mesma seed => mesma estratégia', () => {
    const a = makeGm({ seed: 11, difficulties: ['hard', 'hard'] });
    const b = makeGm({ seed: 11, difficulties: ['hard', 'hard'] });
    expect(a.aiDirectors.map(d => d.strategy.id)).toEqual(b.aiDirectors.map(d => d.strategy.id));
    a.dispose(); b.dispose();
  });

  it('rush sai antes que turtle: limite da 1ª onda e atraso inicial', () => {
    const gm = makeGm({ difficulties: ['hard', 'hard'] });
    const mm = gm.aiDirectors[0].militaryManager;
    const d = gm.aiDirectors[0];
    d.strategy = STRATEGIES.rush;
    const rush = mm.computeThreshold();
    const rushAllowed = d.profile.startDelay * 0.4;
    d.strategy = STRATEGIES.turtle;
    expect(rush).toBeLessThan(mm.computeThreshold());
    expect(rushAllowed).toBeLessThan(d.profile.startDelay);
    d.simTime = rushAllowed + 1;
    d.strategy = STRATEGIES.rush;
    expect(mm.expeditionAllowed()).toBe(true);
    d.strategy = STRATEGIES.turtle;
    expect(mm.expeditionAllowed()).toBe(false);
    gm.dispose();
  });

  it('M1-08/NEW-9: no Normal (e no Fácil) a expedição não abre antes do atraso inicial do perfil (>= 5 min), nem no rush', () => {
    const gm = makeGm({ difficulties: ['normal', 'easy'] });
    for (const d of gm.aiDirectors) {
      const prof = d.profile;
      if (prof.id === 'normal') expect(prof.startDelay * (prof.rushDelayScale ?? 0.4)).toBeGreaterThanOrEqual(300);
      else expect(prof.startDelay).toBeGreaterThanOrEqual(300); // Fácil nunca sorteia rush
      d.strategy = STRATEGIES.rush;
      d.simTime = prof.startDelay - 1;
      expect(d.militaryManager.expeditionAllowed()).toBe(false);
    }
    gm.dispose();
  });

  it('contra-unidades: atiradores contra corpo a corpo; montarias/corpo a corpo contra atiradores; cerco contra defesas', () => {
    const base = adaptMix(STRATEGIES.boom, 'human', null);
    const vsMelee = adaptMix(STRATEGIES.boom, 'human', { total: 10, melee: 8, cavalry: 0, ranged: 2, caster: 0, towers: 0, walls: 0, hqTier2: false });
    const vsRanged = adaptMix(STRATEGIES.boom, 'human', { total: 10, melee: 2, cavalry: 0, ranged: 8, caster: 0, towers: 0, walls: 0, hqTier2: false });
    const fort = adaptMix(STRATEGIES.boom, 'human', { total: 0, melee: 0, cavalry: 0, ranged: 0, caster: 0, towers: 3, walls: 0, hqTier2: false });
    expect(vsMelee.ranged).toBeGreaterThan(base.ranged);
    expect(vsRanged.ranged).toBeLessThan(base.ranged);
    expect(vsRanged.cavalryRatio).toBeLessThanOrEqual(base.cavalryRatio);
    expect(fort.siegeBonus).toBe(1);
    expect(base.siegeBonus).toBe(0);
    // facções diferem
    expect(adaptMix(STRATEGIES.boom, 'orc', null).ranged).toBeLessThan(adaptMix(STRATEGIES.boom, 'human', null).ranged);
  });

  it('classificação tática dos tipos', () => {
    expect(unitClassOf('villager')).toBe('worker');
    expect(unitClassOf('knight')).toBe('melee');
    expect(unitClassOf('archer')).toBe('ranged');
    expect(unitClassOf('cavalier')).toBe('cavalry');
    expect(unitClassOf('ogre')).toBe('cavalry');
    expect(unitClassOf('ballista')).toBe('siege');
    expect(unitClassOf('mage')).toBe('caster');
    expect(unitClassOf('sapper')).toBe('suicide');
  });
});

