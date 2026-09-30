import { describe, it, expect } from 'vitest';
import { UNITS } from '../../src/data/units.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { runMatch } from '../../tools/balance-sim.mjs';

/** F3-11 — guarda-corpos de balanceamento: invariantes dos dados e sanidade de partidas curtas IA×IA. */
const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;

describe('invariantes de dados (F3-11)', () => {
  it('unidades: PV/armadura/dano/custo válidos, trainTime > 0 quando treinável', () => {
    for (const u of Object.values(UNITS)) {
      expect(Number.isFinite(u.hp) && u.hp > 0, `${u.type}.hp`).toBe(true);
      expect(u.armor, `${u.type}.armor definido`).toBeDefined();
      expect(isNonNegInt(u.armor), `${u.type}.armor`).toBe(true);
      expect(isNonNegInt(u.damage.basic), `${u.type}.damage.basic`).toBe(true);
      expect(isNonNegInt(u.damage.piercing), `${u.type}.damage.piercing`).toBe(true);
      if (u.cost) {
        for (const k of ['gold', 'wood', 'stone']) expect(isNonNegInt(u.cost[k]), `${u.type}.cost.${k}`).toBe(true);
        expect(u.trainTime > 0, `${u.type}.trainTime`).toBe(true);
      }
    }
  });

  it('construções: PV/armadura/custo válidos', () => {
    for (const b of Object.values(BUILDINGS)) {
      expect(Number.isFinite(b.hp) && b.hp > 0, `${b.type}.hp`).toBe(true);
      expect(isNonNegInt(b.armor), `${b.type}.armor`).toBe(true);
      for (const k of ['gold', 'wood', 'stone']) expect(isNonNegInt(b.cost[k]), `${b.type}.cost.${k}`).toBe(true);
    }
  });
});

describe('sanidade de equilíbrio rápido (F3-11)', () => {
  it('6 partidas IA×IA de 3 min sem exceção e sem NaN em recursos', { timeout: 120000 }, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const r = runMatch(seed, seed % 2 === 0, 3);
      expect(r.minutes).toBeGreaterThan(0);
      for (const res of r.finalRes) {
        for (const k of ['gold', 'wood', 'stone']) expect(Number.isFinite(res[k]), `seed ${seed} ${k}`).toBe(true);
      }
    }
  });
});
