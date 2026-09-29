import { describe, it, expect } from 'vitest';
import { computeUiScale } from '../../src/ui/uiScale.js';

describe('computeUiScale (F6-03)', () => {
  it('devolve 1 na resolução de referência (1920x1080, userScale=1)', () => {
    expect(computeUiScale(1920, 1080, 1)).toBeCloseTo(1, 5);
  });

  it('nunca fica abaixo do mínimo (0.75) em telas pequenas', () => {
    expect(computeUiScale(1024, 768, 1)).toBeGreaterThanOrEqual(0.75);
    expect(computeUiScale(320, 240, 1)).toBe(0.75);
  });

  it('nunca ultrapassa o máximo (1.5) em telas grandes ou com userScale alto', () => {
    expect(computeUiScale(3840, 2160, 1)).toBeLessThanOrEqual(1.5);
    expect(computeUiScale(1920, 1080, 3)).toBe(1.5);
  });

  it('usa o menor fator entre largura e altura (letterbox)', () => {
    // Largura generosa, altura apertada (mas dentro do clamp): o fator de altura deve dominar.
    const scale = computeUiScale(2560, 972, 1);
    expect(scale).toBeCloseTo(972 / 1080, 5);
  });

  it('userScale desloca a escala dentro dos limites', () => {
    const base = computeUiScale(1920, 1080, 1);
    const scaledDown = computeUiScale(1920, 1080, 0.8);
    expect(scaledDown).toBeCloseTo(base * 0.8, 5);
  });
});
