import { describe, it, expect } from 'vitest';
import { ruinAlpha, ruinRadius, pickSlot, MINE_RUIN_RADIUS } from '../../src/render/ruinsLogic.js';

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
  it('ruína de mina: o decal passa da pegada do modelo, que segue em pé (gold_mine.glb ≈ 3,56 de raio)', () => {
    const MODEL_FOOTPRINT_RADIUS = 3.56; // maior semi-eixo medido em public/models/gold_mine.glb (7,03 × 6,84)
    expect(MINE_RUIN_RADIUS).toBeGreaterThanOrEqual(MODEL_FOOTPRINT_RADIUS + 1.5);
    expect(0.5 * MINE_RUIN_RADIUS).toBeGreaterThanOrEqual(MODEL_FOOTPRINT_RADIUS); // o miolo escuro da textura (0,5–0,8 do raio) começa fora da pegada
    expect(MINE_RUIN_RADIUS).toBeGreaterThan(ruinRadius(3.4)); // o raio antigo (3,4) ficava todo debaixo do modelo
  });
});
