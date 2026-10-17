import { describe, it, expect, vi } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { UNITS } from '../../src/data/units.js';
import { ABILITIES } from '../../src/data/abilities.js';
import { makeGm, place } from './helpers/aiWorld.js';

/** M2-11 — a IA usa as 18 habilidades dos 6 heróis (mundo sintético, Difícil = micro 2). */

const HEROES = Object.keys(UNITS).filter(t => UNITS[t].isHero);

describe('M2-11: IA lança habilidades de herói', () => {
  function arena(difficulty = 'hard') {
    const gm = makeGm({ difficulties: [difficulty, 'normal'] });
    const d = gm.aiDirectors[0];
    for (const u of gm.getUnitsOf(0).concat(gm.getUnitsOf(1))) place(gm, u, u.ownerId === 0 ? 30 : -30, u.ownerId === 0 ? -20 : 20);
    const spy = vi.spyOn(gm, 'issue');
    const spawn = (type, owner, x, z) => {
      const u = gm.spawnUnit(type, x, z, owner);
      place(gm, u, x, z);
      return u;
    };
    const casts = () => spy.mock.calls.map(c => c[0]).filter(c => c.type === CMD.CAST);
    /** um tique de micro com a percepção atualizada */
    const step = () => { d.perception.update(); d.microManager.update(); };
    return { gm, d, spawn, casts, step };
  }

  /** `n` grunts inimigos agrupados a partir de (x, 0) */
  const pack = (spawn, n, x = 8) => Array.from({ length: n }, (_, i) => spawn('grunt', 1, x + (i % 2), (i >> 1) * 1.2));
  /** zera as recargas das habilidades listadas (impede que a anterior da lista ganhe a vez) */
  const lock = (h, ...ids) => { for (const id of ids) h.cooldowns[id] = 99; };

  it('cobre os 6 heróis × 18 vagas de units.js (17 habilidades distintas) e as 22 hero_* do catálogo', () => {
    expect(HEROES.length).toBe(6);
    const ids = new Set(HEROES.flatMap(t => UNITS[t].abilities));
    expect(ids.size).toBe(17); // Grito de Guerra é de Brann e Drogath
    expect(Object.keys(ABILITIES).filter(k => k.startsWith('hero_')).length).toBe(22);
  });

  it('Brann: Grito de Guerra em combate; Postura Defensiva com corpo a corpo colado; Golpe Transpassante em aglomerado', () => {
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_brann', 0, 0, 0);
      h.state = 'attacking';
      spawn('grunt', 1, 5, 0);
      step();
      expect(casts().map(c => c.abilityId)).toEqual(['hero_war_cry']);
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_brann', 0, 0, 0);
      lock(h, 'hero_war_cry', 'hero_cleave_strike');
      spawn('grunt', 1, 4.5, 0);
      step();
      expect(casts().map(c => c.abilityId)).toEqual(['hero_defensive_stance']);
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_brann', 0, 0, 0);
      lock(h, 'hero_war_cry', 'hero_defensive_stance');
      pack(spawn, 3, 2.5);
      step();
      expect(casts().map(c => c.abilityId)).toEqual(['hero_cleave_strike']);
      gm.dispose();
    }
  });

  it('Drogath: Grito de Guerra, Golpe de Brasa (aglomerado) e Fogo do Clã (só ferido)', () => {
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_drogath', 0, 0, 0);
      h.state = 'attacking';
      spawn('grunt', 1, 3, 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_war_cry');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_drogath', 0, 0, 0);
      lock(h, 'hero_war_cry');
      pack(spawn, 2, 2.5);
      step();
      expect(casts()[0].abilityId).toBe('hero_ember_strike');
      expect(casts()[0].targetId).toBeDefined();
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_drogath', 0, 0, 0);
      lock(h, 'hero_war_cry', 'hero_ember_strike');
      spawn('grunt', 1, 8, 0);
      step();
      expect(casts().length).toBe(0); // inteiro: não cura
      h.hp = h.maxHp - 200;
      step();
      expect(casts()[0].abilityId).toBe('hero_clan_fire');
      gm.dispose();
    }
  });

  it('Oren: Raio Arcano em aglomerado, Restauro no aliado ferido e Tempestade só sem inimigo adjacente', () => {
    {
      const { gm, spawn, casts, step } = arena();
      spawn('hero_oren', 0, 0, 0);
      pack(spawn, 3, 10);
      step();
      expect(casts()[0].abilityId).toBe('hero_arcane_bolt');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_oren', 0, 0, 0);
      lock(h, 'hero_arcane_bolt');
      const kn = spawn('knight', 0, 4, 0);
      kn.hp = kn.maxHp * 0.3;
      spawn('grunt', 1, 14, 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_mend');
      expect(casts()[0].targetId).toBe(kn.id);
      gm.dispose();
    }
    {
      const { gm, d, spawn, casts, step } = arena();
      const h = spawn('hero_oren', 0, 0, 0);
      lock(h, 'hero_arcane_bolt');
      pack(spawn, 4, 9);
      const adjacent = spawn('grunt', 1, 1.5, 0);
      step();
      expect(casts().some(c => c.abilityId === 'hero_blizzard')).toBe(false); // inimigo adjacente: sem canalizar
      place(gm, adjacent, 60, 60); // sai do alcance
      d.simTime += 1;
      step();
      const c = casts().find(x => x.abilityId === 'hero_blizzard');
      expect(c).toBeTruthy();
      expect(c.x).toBeGreaterThan(5);
      gm.dispose();
    }
  });

  it('Dorian: Estandarte e Escudos Cerrados com ≥ 3 aliados em combate; Carga do Marechal em aglomerado', () => {
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_dorian', 0, 0, 0);
      lock(h, 'hero_marshal_charge');
      h.state = 'attacking';
      for (let i = 0; i < 3; i++) spawn('knight', 0, 1 + i, 1).state = 'attacking';
      spawn('grunt', 1, 9, 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_banner');
      lock(h, 'hero_banner');
      step();
      expect(casts()[1].abilityId).toBe('hero_shield_line');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      spawn('hero_dorian', 0, 0, 0);
      spawn('knight', 0, 1, 1).state = 'attacking'; // só 1 aliado em combate: sem buff em área
      pack(spawn, 2, 6);
      step();
      expect(casts()[0].abilityId).toBe('hero_marshal_charge');
      gm.dispose();
    }
  });

  it('Vozgul: Dreno de Alma, Chamado dos Ancestrais (≥ 2 cadáveres) e Véu de Cinzas (aliado < 40 % PV)', () => {
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_vozgul', 0, 0, 0);
      h.hp = h.maxHp * 0.6;
      spawn('grunt', 1, 7, 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_soul_drain');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_vozgul', 0, 0, 0);
      lock(h, 'hero_soul_drain');
      spawn('grunt', 1, 7, 0);
      gm.corpses.add(2, 0, 1, 'grunt', 0);
      step();
      expect(casts().length).toBe(0); // 1 cadáver só: poupa a mana
      gm.corpses.add(-2, 0, 1, 'grunt', 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_ancestors');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_vozgul', 0, 0, 0);
      lock(h, 'hero_soul_drain');
      const g = spawn('grunt', 0, 3, 0);
      g.state = 'attacking';
      g.hp = g.maxHp * 0.2;
      spawn('grunt', 1, 12, 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_ash_veil');
      expect(casts()[0].targetId).toBe(g.id);
      gm.dispose();
    }
  });

  it('Skarn: Rugido dos Clãs (≥ 3 aliados), Pacto de Sangue (< 50 % PV) e Impacto no Solo', () => {
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_skarn', 0, 0, 0);
      lock(h, 'hero_ground_slam');
      h.state = 'attacking';
      for (let i = 0; i < 3; i++) spawn('grunt', 0, 1 + i, 1).state = 'attacking';
      spawn('grunt', 1, 7, 0);
      step();
      expect(casts()[0].abilityId).toBe('hero_horde_roar');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_skarn', 0, 0, 0);
      lock(h, 'hero_horde_roar', 'hero_ground_slam');
      spawn('grunt', 1, 5, 0);
      step();
      expect(casts().length).toBe(0);
      h.hp = h.maxHp * 0.4;
      step();
      expect(casts()[0].abilityId).toBe('hero_blood_pact');
      gm.dispose();
    }
    {
      const { gm, spawn, casts, step } = arena();
      const h = spawn('hero_skarn', 0, 0, 0);
      lock(h, 'hero_horde_roar');
      pack(spawn, 3, 2.5);
      step();
      expect(casts()[0].abilityId).toBe('hero_ground_slam');
      gm.dispose();
    }
  });

  it('é determinístico: duas execuções idênticas emitem os mesmos comandos', () => {
    const run = () => {
      const { gm, spawn, casts, step } = arena();
      spawn('hero_oren', 0, 0, 0);
      pack(spawn, 4, 9);
      step();
      const out = JSON.stringify(casts());
      gm.dispose();
      return out;
    };
    expect(run()).toBe(run());
  });

  it('Fácil (micro 0) não lança habilidades de herói', () => {
    const { gm, spawn, step, casts } = arena('easy');
    const h = spawn('hero_brann', 0, 0, 0);
    h.state = 'attacking';
    spawn('grunt', 1, 3, 0);
    step();
    expect(casts().length).toBe(0);
    gm.dispose();
  });
});
