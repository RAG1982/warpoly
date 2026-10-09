import { describe, it, expect } from 'vitest';
import {
  STATUS_CAPACITY, STATUS_DEFS, createStatusSlots, createMods, addStatus, removeStatus,
  dispelStatuses, tickStatuses, hasStatus, clearStatuses, recalcMods
} from '../../src/sim/statuses.js';
import { canTarget, defaultCanHitAir, defaultCanHitNaval } from '../../src/sim/targeting.js';
import { splashFalloff } from '../../src/sim/splash.js';

/** F10-01 — lacunas: statuses (puros), regras de alvo por camada, queda do dano em área. */
const fakeUnit = () => ({ statuses: createStatusSlots(), mods: createMods() });

describe('statuses (F4-03)', () => {
  it('addStatus aplica multiplicadores e hasStatus enxerga o status', () => {
    const u = fakeUnit();
    expect(addStatus(u, 'haste', 10)).toBe(true);
    expect(hasStatus(u, 'haste')).toBe(true);
    expect(u.mods.speedMul).toBe(1.5);
    expect(u.mods.attackSpeedMul).toBe(1.5);
  });

  it('id desconhecido é recusado e não altera nada', () => {
    const u = fakeUnit();
    expect(addStatus(u, 'nao_existe', 5)).toBe(false);
    expect(u.statuses.every(s => s.id === null)).toBe(true);
  });

  it('multiplicadores se acumulam em produto (slow + bloodlust)', () => {
    const u = fakeUnit();
    addStatus(u, 'slow', 10);
    addStatus(u, 'bloodlust', 10);
    expect(u.mods.speedMul).toBeCloseTo(0.5 * 1.25, 10);
    expect(u.mods.damageMul).toBe(1.5);
    expect(u.mods.attackSpeedMul).toBe(1.5);
  });

  it('reaplicar mantém a MAIOR duração e não ocupa outro slot', () => {
    const u = fakeUnit();
    addStatus(u, 'slow', 10);
    addStatus(u, 'slow', 4);
    expect(u.statuses.filter(s => s.id === 'slow')).toHaveLength(1);
    expect(u.statuses.find(s => s.id === 'slow').remaining).toBe(10);
    addStatus(u, 'slow', 25);
    expect(u.statuses.find(s => s.id === 'slow').remaining).toBe(25);
  });

  it('tickStatuses expira no tempo certo, recalcula mods e chama onExpire uma vez', () => {
    const u = fakeUnit();
    addStatus(u, 'haste', 1);
    const expired = [];
    tickStatuses(u, 0.5, (_u, id) => expired.push(id));
    expect(hasStatus(u, 'haste')).toBe(true);
    expect(expired).toEqual([]);
    tickStatuses(u, 0.5, (_u, id) => expired.push(id));
    expect(hasStatus(u, 'haste')).toBe(false);
    expect(u.mods.speedMul).toBe(1);
    expect(expired).toEqual(['haste']);
    tickStatuses(u, 5, (_u, id) => expired.push(id));
    expect(expired).toEqual(['haste']);
  });

  it('dispel remove só os removíveis (invulnerable fica)', () => {
    const u = fakeUnit();
    addStatus(u, 'slow', 10);
    addStatus(u, 'invisible', 10);
    addStatus(u, 'invulnerable', 10);
    expect(dispelStatuses(u)).toBe(2);
    expect(hasStatus(u, 'invulnerable')).toBe(true);
    expect(u.mods.invulnerable).toBe(true);
    expect(u.mods.invisible).toBe(false);
    expect(u.mods.speedMul).toBe(1);
  });

  it('removeStatus devolve true só se estava ativo; clearStatuses zera tudo', () => {
    const u = fakeUnit();
    addStatus(u, 'shielded', 5);
    expect(removeStatus(u, 'shielded')).toBe(true);
    expect(removeStatus(u, 'shielded')).toBe(false);
    addStatus(u, 'slow', 5);
    addStatus(u, 'haste', 5);
    clearStatuses(u);
    expect(u.statuses.every(s => s.id === null && s.remaining === 0)).toBe(true);
    expect(u.mods.speedMul).toBe(1);
  });

  it('sem slot livre substitui o de menor duração restante', () => {
    const u = fakeUnit();
    const ids = Object.keys(STATUS_DEFS);
    expect(ids.length).toBeGreaterThan(STATUS_CAPACITY);
    for (let i = 0; i < STATUS_CAPACITY; i++) addStatus(u, ids[i], 10 + i); // ids[0] tem 10 s (o menor)
    addStatus(u, ids[STATUS_CAPACITY], 100);
    expect(hasStatus(u, ids[STATUS_CAPACITY])).toBe(true);
    expect(hasStatus(u, ids[0])).toBe(false);
    expect(u.statuses.filter(s => s.id !== null)).toHaveLength(STATUS_CAPACITY);
  });

  it('recalcMods é idempotente', () => {
    const u = fakeUnit();
    addStatus(u, 'bloodlust', 5);
    const snap = { ...u.mods };
    recalcMods(u); recalcMods(u);
    expect(u.mods).toEqual(snap);
  });
});

describe('targeting (F4-06)', () => {
  const melee = { canHitAir: false, canHitNaval: false };
  const archer = { canHitAir: true, canHitNaval: true };
  it('alvo terrestre: qualquer um, exceto canHitGround === false', () => {
    expect(canTarget(melee, { layer: 'ground' })).toBe(true);
    expect(canTarget({ canHitGround: false }, { layer: 'ground' })).toBe(false);
  });
  it('alvo aéreo exige canHitAir === true (estrito)', () => {
    expect(canTarget(melee, { layer: 'air' })).toBe(false);
    expect(canTarget({}, { layer: 'air' })).toBe(false);
    expect(canTarget(archer, { layer: 'air' })).toBe(true);
  });
  it('alvo naval exige canHitNaval === true', () => {
    expect(canTarget(melee, { layer: 'naval' })).toBe(false);
    expect(canTarget(archer, { layer: 'naval' })).toBe(true);
  });
  it('imune, nulo ou indefinido nunca é alvo', () => {
    expect(canTarget(archer, { layer: 'ground', immune: true })).toBe(false);
    expect(canTarget(archer, null)).toBe(false);
    expect(canTarget(null, { layer: 'ground' })).toBe(false);
  });
  it('defaultCanHitAir: explícito vence; atirador sim; cerco balístico e melee não', () => {
    expect(defaultCanHitAir({ canHitAir: false, isRanged: true })).toBe(false);
    expect(defaultCanHitAir({ isRanged: true, projectile: 'arrow' })).toBe(true);
    expect(defaultCanHitAir({ isRanged: true, projectile: 'boulder', splashRadius: 1.5 })).toBe(false);
    expect(defaultCanHitAir({ isRanged: false })).toBe(false);
  });
  it('defaultCanHitNaval: melee terrestre não; atirador e voador sim; canHitGround=false não', () => {
    expect(defaultCanHitNaval({ isRanged: false })).toBe(false);
    expect(defaultCanHitNaval({ isRanged: true })).toBe(true);
    expect(defaultCanHitNaval({ layer: 'air' })).toBe(true);
    expect(defaultCanHitNaval({ canHitGround: false, isRanged: true })).toBe(false);
    expect(defaultCanHitNaval({ canHitNaval: true })).toBe(true);
  });
});

describe('splashFalloff', () => {
  it('linear: 1 no centro, edge na borda, edge além da borda', () => {
    expect(splashFalloff(0, 2)).toBe(1);
    expect(splashFalloff(1, 2)).toBeCloseTo(0.75, 10);
    expect(splashFalloff(2, 2)).toBeCloseTo(0.5, 10);
    expect(splashFalloff(9, 2)).toBeCloseTo(0.5, 10);
    expect(splashFalloff(2, 2, 0.4)).toBeCloseTo(0.4, 10);
  });
  it('raio 0 não gera NaN', () => {
    expect(splashFalloff(1, 0)).toBe(1);
  });
});
