import { describe, it, expect } from 'vitest';
import { UNITS } from '../../src/data/units.js';
import { ABILITIES, ABILITY_TARGETS, EFFECT_KINDS } from '../../src/data/abilities.js';
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

  it('mana e habilidades (F4-03): campos opcionais válidos e ids existentes em ABILITIES', () => {
    for (const u of Object.values(UNITS)) {
      if (u.maxMana !== undefined) expect(u.maxMana >= 0 && u.maxMana <= 255, `${u.type}.maxMana`).toBe(true);
      if (u.startMana !== undefined) expect(u.startMana >= 0 && u.startMana <= (u.maxMana || 0), `${u.type}.startMana`).toBe(true);
      if (u.manaRegen !== undefined) expect(u.manaRegen >= 0, `${u.type}.manaRegen`).toBe(true);
      if (u.abilities !== undefined) {
        expect(Array.isArray(u.abilities) && u.abilities.length <= 9, `${u.type}.abilities`).toBe(true);
        for (const id of u.abilities) expect(ABILITIES[id], `${u.type}.abilities[${id}]`).toBeDefined();
        expect(u.maxMana > 0, `${u.type}: abilities exige maxMana`).toBe(true);
      }
    }
  });

  it('habilidades: schema válido (alvo, efeitos, custo, recarga)', () => {
    for (const a of Object.values(ABILITIES)) {
      expect(ABILITY_TARGETS, `${a.id}.target`).toContain(a.target);
      expect(a.manaCost >= 0 && a.cooldown >= 0 && a.range >= 0 && a.castTime >= 0, `${a.id} números`).toBe(true);
      expect(a.effects.length > 0, `${a.id}.effects`).toBe(true);
      for (const fx of a.effects) expect(EFFECT_KINDS, `${a.id} efeito`).toContain(fx.kind);
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
