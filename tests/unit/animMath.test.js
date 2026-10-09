import { describe, it, expect } from 'vitest';
import {
  stableVariant, blendWeight, BLEND_DURATION, attackProgress, deathStyleFor, idleInterval, pickIdleVariant,
  IDLE_INTERVAL, IDLE_VARIANTS, deathPhase, idleEnvelope
} from '../../src/animation/animMath.js';
import { hitTagFor } from '../../src/sim/hitTag.js';
import { createRenderRng } from '../../src/render/vfx/vfxConfig.js';

describe('F7-06 animMath', () => {
  it('variante estável por id: determinística e equilibrada', () => {
    for (let id = 0; id < 50; id++) expect(stableVariant(id, 2)).toBe(stableVariant(id, 2));
    let ones = 0;
    for (let id = 0; id < 1000; id++) { const v = stableVariant(id, 2); expect([0, 1]).toContain(v); ones += v; }
    expect(ones).toBeGreaterThan(400);
    expect(ones).toBeLessThan(600);
    expect(stableVariant(5, 1)).toBe(0);
  });

  it('curva de blend: 0 → 1, monotônica, presa', () => {
    expect(blendWeight(-1)).toBe(0);
    expect(blendWeight(0)).toBe(0);
    expect(blendWeight(BLEND_DURATION)).toBe(1);
    expect(blendWeight(10)).toBe(1);
    expect(blendWeight(BLEND_DURATION / 2)).toBeCloseTo(0.5, 5);
    let prev = 0;
    for (let i = 0; i <= 20; i++) { const w = blendWeight((i / 20) * BLEND_DURATION); expect(w).toBeGreaterThanOrEqual(prev); prev = w; }
    expect(blendWeight(1, 0)).toBe(1);
  });

  it('progresso do ataque: variante 0 linear, variante 1 mantém extremos', () => {
    expect(attackProgress(0.3, 0)).toBe(0.3);
    expect(attackProgress(0, 1)).toBe(0);
    expect(attackProgress(1, 1)).toBeCloseTo(1, 10);
    expect(attackProgress(0.5, 1)).toBeLessThan(0.5);
  });

  it('estilo de morte por tipo de dano', () => {
    const mk = (damage, extra = {}) => ({ damage: { type: damage }, ...extra });
    expect(hitTagFor(null)).toBe('cut');
    expect(hitTagFor(mk('normal'))).toBe('cut');
    expect(hitTagFor(mk('normal', { isRanged: true, projectileType: 'arrow' }))).toBe('projectile');
    expect(hitTagFor(mk('siege', { isRanged: true, projectileType: 'boulder' }))).toBe('crush');
    expect(hitTagFor(mk('normal', { isRanged: true, maxMana: 100 }))).toBe('magic');
    expect(hitTagFor(mk('magic'))).toBe('magic');
    expect(deathStyleFor('crush')).toBe('crush');
    expect(deathStyleFor('xyz')).toBe('cut');
    expect(deathStyleFor(undefined)).toBe('cut');
  });

  it('idle variado com rng injetado', () => {
    expect(idleInterval(() => 0)).toBe(IDLE_INTERVAL[0]);
    expect(idleInterval(() => 1)).toBe(IDLE_INTERVAL[1]);
    expect(pickIdleVariant(() => 0, 0)).toBe(1);
    expect(pickIdleVariant(() => 0.99, 0)).toBe(IDLE_VARIANTS - 1);
    expect(pickIdleVariant(() => 0, 1)).toBe(2); // evita repetir
    const a = createRenderRng(7);
    const b = createRenderRng(7);
    for (let i = 0; i < 10; i++) expect(pickIdleVariant(a, 0)).toBe(pickIdleVariant(b, 0));
    expect(idleEnvelope(0)).toBeCloseTo(0, 10);
    expect(idleEnvelope(0.5)).toBeCloseTo(1, 10);
    expect(idleEnvelope(1)).toBeCloseTo(0, 10);
  });

  it('fases da morte: monotônicas e terminam assentadas', () => {
    const a = deathPhase(0.1);
    const b = deathPhase(0.5);
    const c = deathPhase(1.05);
    expect(a.fall).toBe(0);
    expect(b.fall).toBeGreaterThan(0);
    expect(c.fall).toBe(1);
    expect(c.settle).toBe(1);
    expect(c.bounce).toBeCloseTo(0, 10);
  });
});
