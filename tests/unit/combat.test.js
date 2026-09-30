import { describe, it, expect } from 'vitest';
import { computeDamage, DAMAGE_TYPES } from '../../src/sim/combat.js';
import { DAMAGE_SCALE } from '../../src/data/combat.js';
import { UNITS } from '../../src/data/units.js';
import { createRng } from '../../src/sim/rng.js';

/**
 * F3-03 — testes de `computeDamage` (src/sim/combat.js): fórmula WC2 (básico + perfurante,
 * armadura, tipos de dano, multiplicador aleatório determinístico). Ver docs/specs/F3-03-combate.md
 * (seção "Testes") e docs/08_GAME_DESIGN.md §6/§6.1 — a mesma fórmula alimenta tools/combat-table.mjs.
 */

/** RNG stub: sempre devolve o mesmo valor de `next()` (limites 0,5/1,0 do multiplicador). */
function stubRng(value) {
  return { next: () => value };
}

describe('computeDamage (F3-03)', () => {
  it('limite inferior do multiplicador (rng.next() = 0 → ×0,5)', () => {
    const dmg = computeDamage({ basic: 20, piercing: 0, type: DAMAGE_TYPES.NORMAL }, { armor: 0 }, stubRng(0));
    expect(dmg).toBe(Math.round(20 * 0.5 * DAMAGE_SCALE));
  });

  it('limite superior do multiplicador (rng.next() = 1 → ×1,0)', () => {
    const dmg = computeDamage({ basic: 20, piercing: 0, type: DAMAGE_TYPES.NORMAL }, { armor: 0 }, stubRng(1));
    expect(dmg).toBe(Math.round(20 * 1.0 * DAMAGE_SCALE));
  });

  it('armadura ≥ básico ainda causa dano perfurante (não zera o golpe)', () => {
    const dmg = computeDamage({ basic: 6, piercing: 12, type: DAMAGE_TYPES.PIERCING }, { armor: 15 }, stubRng(0));
    // max(0, 6 - 15) + 12 = 12 (a armadura anula só o componente básico)
    expect(dmg).toBe(Math.round(12 * 0.5 * DAMAGE_SCALE));
    expect(dmg).toBeGreaterThan(0);
  });

  it('MAGIC ignora armadura do alvo', () => {
    const dmgVsHighArmor = computeDamage({ basic: 20, piercing: 0, type: DAMAGE_TYPES.MAGIC }, { armor: 100 }, stubRng(1));
    expect(dmgVsHighArmor).toBe(Math.round(20 * 1.0 * DAMAGE_SCALE));
    // Sem MAGIC, a mesma armadura reduziria o dano ao mínimo 1
    const dmgNormal = computeDamage({ basic: 20, piercing: 0, type: DAMAGE_TYPES.NORMAL }, { armor: 100 }, stubRng(1));
    expect(dmgNormal).toBe(1);
  });

  it('SIEGE: ×1,5 contra construção, ×0,5 contra unidade', () => {
    const vsBuilding = computeDamage({ basic: 40, piercing: 0, type: DAMAGE_TYPES.SIEGE }, { armor: 0, isConstructed: true }, stubRng(1));
    const vsUnit = computeDamage({ basic: 40, piercing: 0, type: DAMAGE_TYPES.SIEGE }, { armor: 0 }, stubRng(1));
    expect(vsBuilding).toBe(Math.round(40 * 1.5 * 1.0 * DAMAGE_SCALE));
    expect(vsUnit).toBe(Math.round(40 * 0.5 * 1.0 * DAMAGE_SCALE));
  });

  it('mínimo 1 (armadura anula básico e perfurante é 0)', () => {
    const dmg = computeDamage({ basic: 5, piercing: 0, type: DAMAGE_TYPES.NORMAL }, { armor: 999 }, stubRng(0));
    expect(dmg).toBe(1);
  });

  it('consome exatamente 1 valor de rng.next() por golpe', () => {
    let calls = 0;
    const rng = { next: () => { calls++; return 0.5; } };
    computeDamage({ basic: 10, piercing: 2, type: DAMAGE_TYPES.NORMAL }, { armor: 0 }, rng);
    expect(calls).toBe(1);
  });

  it('mesma seed → mesma sequência de danos', () => {
    const damage = { basic: 20, piercing: 6, type: DAMAGE_TYPES.NORMAL };
    const target = { armor: 4 };
    const rngA = createRng(42).fork('combat');
    const rngB = createRng(42).fork('combat');
    const seqA = Array.from({ length: 20 }, () => computeDamage(damage, target, rngA));
    const seqB = Array.from({ length: 20 }, () => computeDamage(damage, target, rngB));
    expect(seqA).toEqual(seqB);
  });

  it('construção com armadura 15 recebendo archer (6/12 perfurante)', () => {
    const target = { armor: 15, isConstructed: true };
    const dmgLow = computeDamage({ basic: 6, piercing: 12, type: DAMAGE_TYPES.PIERCING }, target, stubRng(0));
    const dmgHigh = computeDamage({ basic: 6, piercing: 12, type: DAMAGE_TYPES.PIERCING }, target, stubRng(1));
    // max(0, 6-15) + 12 = 12, sem multiplicador de cerco (não é SIEGE)
    expect(dmgLow).toBe(Math.round(12 * 0.5 * DAMAGE_SCALE));
    expect(dmgHigh).toBe(Math.round(12 * 1.0 * DAMAGE_SCALE));
  });
});

describe('migração attack → damage (F3-03, item 2 da spec)', () => {
  const EXPECTED_ATTACK = {
    villager: 7, peon: 8,
    knight: 26, grunt: 28,
    archer: 18, axethrower: 19,
    ogre: 42,
    bandit: 16
  };

  Object.entries(EXPECTED_ATTACK).forEach(([type, attack]) => {
    it(`${type}: damage.basic + damage.piercing === ${attack} (attack antigo)`, () => {
      const d = UNITS[type].damage;
      expect(d.basic + d.piercing).toBe(attack);
    });
  });
});
