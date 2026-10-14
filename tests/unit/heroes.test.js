import { describe, it, expect } from 'vitest';
import { UNITS, ABILITIES, getAbility } from '../../src/data/index.js';
import { HEROES, HERO_TYPES, isHeroType, isUniqueType } from '../../src/data/heroes.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { canPolymorph } from '../../src/sim/abilities.js';
import { baseMission, makeMissionGm, runTicks, statusOf, teleport } from './helpers/missionWorld.js';

/** F4-08 — heróis de campanha: stats, unicidade, morte, missão e determinismo. */
const heroMission = (over = {}) => baseMission({
  setup: [{ type: 'spawn', owner: 'player', unitType: 'hero_brann', x: -20, z: 8, tag: 'hero' }],
  objectives: [{ id: 'esc', type: 'escort', priority: 'primary', tag: 'hero', area: { x: 10, z: 10, r: 4 }, title: 'Escoltar o herói' }],
  ...over
});
const heroOf = (gm) => gm.entitiesById.get(gm.mission.tags.get('hero')[0]);

describe('heróis (F4-08)', () => {
  it('há 2 a 6 heróis, únicos, não treináveis, com nome PT-BR e modelo de uma unidade existente', () => {
    expect(HERO_TYPES.length).toBeGreaterThanOrEqual(2);
    expect(HERO_TYPES.length).toBeLessThanOrEqual(6);
    for (const type of HERO_TYPES) {
      const d = UNITS[type];
      expect(d.unique && d.isHero).toBe(true);
      expect(d.cost).toBeNull();
      expect(isHeroType(type) && isUniqueType(type)).toBe(true);
      expect(UNITS[d.modelOf]).toBeTruthy();
      expect(typeof d.name).toBe('string');
      for (const id of d.abilities) expect(getAbility(id)).toBeTruthy();
    }
  });

  it('stats acima da unidade base equivalente', () => {
    for (const type of HERO_TYPES) {
      const h = UNITS[type];
      const b = UNITS[HEROES[type].base];
      expect(h.hp).toBeGreaterThan(b.hp * 1.5);
      expect(h.damage.basic + h.damage.piercing).toBeGreaterThan(b.damage.basic + b.damage.piercing);
      expect(h.armor).toBeGreaterThanOrEqual(b.armor);
      expect(h.scaleMul).toBeGreaterThan(1);
    }
  });

  it('as habilidades dos heróis não exigem pesquisa', () => {
    for (const id of Object.keys(ABILITIES).filter(k => k.startsWith('hero_'))) expect(ABILITIES[id].requires).toEqual([]);
  });

  it('spawn cria o herói com os stats; o 2º spawn do mesmo tipo é recusado', () => {
    const gm = makeMissionGm(heroMission({ autoVictory: false }));
    const hero = heroOf(gm);
    expect(hero.type).toBe('hero_brann');
    expect(hero.maxHp).toBe(UNITS.hero_brann.hp);
    expect(hero.mesh.scale.x).toBeCloseTo(1.62 * UNITS.hero_brann.scaleMul, 5);
    expect(gm.spawnUnit('hero_brann', 0, 0, 0)).toBeNull();
    expect(gm.getUnitsOf(0).filter(u => u.type === 'hero_brann').length).toBe(1);
    expect(gm.spawnUnit('hero_drogath', 0, 0, 1)).toBeTruthy(); // outro herói é outro tipo
  });

  it('morte remove o herói e ele não pode ser recriado', () => {
    const gm = makeMissionGm(heroMission({ autoVictory: false, objectives: [{ id: 'o', type: 'survive', priority: 'secondary', seconds: 500, title: 's' }] }));
    const hero = heroOf(gm);
    hero.takeDamage(1e6, null);
    runTicks(gm, 80);
    expect(gm.entitiesById.get(hero.id)).toBeUndefined();
    expect(gm.getUnitsOf(0).some(u => u.type === 'hero_brann')).toBe(false);
    expect(gm.spawnUnit('hero_brann', 0, 0, 0)).toBeNull();
  });

  it('spawn via ação de gatilho depois de já existir: recusado sem quebrar a missão', () => {
    const gm = makeMissionGm(heroMission({
      autoVictory: false,
      triggers: [{ id: 'again', when: { type: 'time', at: 1 }, actions: [{ type: 'spawn', owner: 'player', unitType: 'hero_brann', x: -10, z: 8 }] }]
    }));
    runTicks(gm, 40);
    expect(gm.getUnitsOf(0).filter(u => u.type === 'hero_brann').length).toBe(1);
  });

  it('missão com herói: escoltar até a área vence; herói morto derrota', () => {
    const win = makeMissionGm(heroMission());
    runTicks(win, 25);
    expect(statusOf(win, 'esc')).toBe('active');
    teleport(win, heroOf(win), 10, 10);
    runTicks(win, 10);
    expect(statusOf(win, 'esc')).toBe('completed');
    expect(win.isGameOver).toBe(true);

    const lose = makeMissionGm(heroMission());
    heroOf(lose).takeDamage(1e6, null);
    runTicks(lose, 10);
    expect(statusOf(lose, 'esc')).toBe('failed');
    expect(lose.isGameOver).toBe(true);
  });

  it('herói é imune à Transmutação e tem habilidade própria', () => {
    const gm = makeMissionGm(heroMission({ autoVictory: false }));
    const hero = heroOf(gm);
    expect(canPolymorph(hero)).toBe(false);
    expect(hero.abilities).toEqual(['hero_war_cry', 'hero_cleave_strike', 'hero_defensive_stance']);
    expect(hero.maxMana).toBe(150);
  });

  it('checksum determinístico (duas execuções idênticas)', () => {
    const run = () => {
      const gm = makeMissionGm(heroMission({ autoVictory: false }), { seed: 7 });
      runTicks(gm, 200);
      return stateChecksum(gm).total;
    };
    expect(run()).toBe(run());
  });
});
