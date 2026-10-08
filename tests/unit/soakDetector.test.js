import { describe, it, expect } from 'vitest';
import { StallDetector, LeakDetector, hasNonFinite, determinismDiff } from '../../tools/lib/soakDetector.mjs';

describe('soakDetector (F10-02)', () => {
  it('hasNonFinite detecta NaN e Infinity', () => {
    expect(hasNonFinite([1, 2, 3])).toBe(false);
    expect(hasNonFinite([1, NaN])).toBe(true);
    expect(hasNonFinite([Infinity])).toBe(true);
  });

  it('StallDetector dispara só após assinatura constante por stallTicks', () => {
    const d = new StallDetector(100);
    expect(d.observe(0, 'a')).toBe(false);
    expect(d.observe(50, 'a')).toBe(false);
    expect(d.observe(60, 'b')).toBe(false);
    expect(d.observe(150, 'b')).toBe(false);
    expect(d.observe(160, 'b')).toBe(true);
    expect(d.stalledAt).toBe(60);
  });

  it('LeakDetector só acusa crescimento contínuo grande', () => {
    const d = new LeakDetector({ window: 4, minCount: 100, ratio: 2 });
    [50, 60, 55, 70, 65].forEach((n, i) => d.observe(i, n));
    expect(d.leaked).toBeNull();
    const e = new LeakDetector({ window: 4, minCount: 100, ratio: 2 });
    [50, 80, 120, 200].forEach((n, i) => e.observe(i, n));
    expect(e.leaked).toEqual({ tick: 3, from: 50, to: 200 });
  });

  it('determinismDiff compara checksum e ticks', () => {
    expect(determinismDiff({ checksum: 1, ticks: 5 }, { checksum: 1, ticks: 5 })).toBeNull();
    expect(determinismDiff({ checksum: 1, ticks: 5 }, { checksum: 2, ticks: 5 })).toContain('checksum');
  });
});
