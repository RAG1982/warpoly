import { describe, it, expect } from 'vitest';
import { ruinAlpha, ruinRadius, pickSlot } from '../../src/render/ruinsLogic.js';

describe('ruinsLogic (NEW-19)', () => {
  it('ruinAlpha', () => {
    expect(ruinAlpha(0)).toBe(1);
    expect(ruinAlpha(45)).toBe(1);
    expect(ruinAlpha(47.5)).toBeCloseTo(0.5);
    expect(ruinAlpha(50)).toBe(0);
    expect(ruinAlpha(80)).toBe(0);
  });
  it('pickSlot prefere livre, senão o mais velho', () => {
    expect(pickSlot([{ state: 'active', age: 3 }, { state: 'free', age: 0 }])).toBe(1);
    expect(pickSlot([{ state: 'active', age: 3 }, { state: 'active', age: 9 }, { state: 'active', age: 1 }])).toBe(1);
  });
  it('ruinRadius proporcional com mínimo 1,5', () => {
    expect(ruinRadius(4)).toBeCloseTo(4.6);
    expect(ruinRadius(8)).toBeCloseTo(9.2);
    expect(ruinRadius(0.5)).toBe(1.5);
  });
});
