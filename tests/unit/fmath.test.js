import { describe, it, expect } from 'vitest';
import { fsin, fcos, fatan2, fhypot, ftan, FM_PI, FM_HALF_PI } from '../../src/sim/fmath.js';

const TOL = 1e-9; // exigência do M6-01 é < 1e-3 rad; a implementação fica bem abaixo disso.

describe('fmath: erro contra Math.*', () => {
  it('sin e cos batem com Math.* em [-40, 40] (passo irregular)', () => {
    let maxS = 0;
    let maxC = 0;
    for (let x = -40; x <= 40; x += 0.00037) {
      maxS = Math.max(maxS, Math.abs(fsin(x) - Math.sin(x)));
      maxC = Math.max(maxC, Math.abs(fcos(x) - Math.cos(x)));
    }
    expect(maxS).toBeLessThan(TOL);
    expect(maxC).toBeLessThan(TOL);
  });

  it('sin e cos em argumentos grandes (voltas de jogo, ~1e5 rad)', () => {
    for (const x of [1e3, -2.5e3, 3e4, -1e5]) {
      expect(Math.abs(fsin(x) - Math.sin(x))).toBeLessThan(1e-9);
      expect(Math.abs(fcos(x) - Math.cos(x))).toBeLessThan(1e-9);
    }
  });

  it('atan2 bate com Math.atan2 em pontos aleatórios de todos os quadrantes', () => {
    // PRNG determinístico (LCG) para o teste ser reproduzível.
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    let max = 0;
    for (let i = 0; i < 20000; i++) {
      const y = rnd() * 1000;
      const x = rnd() * 1000;
      max = Math.max(max, Math.abs(fatan2(y, x) - Math.atan2(y, x)));
    }
    expect(max).toBeLessThan(TOL);
  });

  it('hypot (2 e 3 componentes) bate com Math.hypot com erro relativo ~1e-15', () => {
    for (const [a, b] of [[3, 4], [-0.5, 1e-3], [1e6, -2e6], [0, 7]]) {
      expect(Math.abs(fhypot(a, b) - Math.hypot(a, b))).toBeLessThanOrEqual(Math.hypot(a, b) * 1e-15);
    }
    expect(fhypot(1, 2, 2)).toBe(3);
    expect(fhypot(1, 2, 2)).toBe(Math.hypot(1, 2, 2));
  });
});

describe('fmath: quadrantes e casos extremos', () => {
  it('atan2 nos quatro quadrantes e eixos', () => {
    expect(fatan2(1, 1)).toBeCloseTo(FM_PI / 4, 12);
    expect(fatan2(1, -1)).toBeCloseTo((3 * FM_PI) / 4, 12);
    expect(fatan2(-1, -1)).toBeCloseTo((-3 * FM_PI) / 4, 12);
    expect(fatan2(-1, 1)).toBeCloseTo(-FM_PI / 4, 12);
    expect(fatan2(0, 1)).toBeCloseTo(0, 12);
    expect(fatan2(0, -1)).toBeCloseTo(FM_PI, 12);
    expect(fatan2(-1, 0)).toBeCloseTo(-FM_HALF_PI, 12);
    expect(fatan2(1, 0)).toBeCloseTo(FM_HALF_PI, 12);
  });

  it('atan2(0, 0) = 0 e atan2 com valores minúsculos não quebra', () => {
    expect(fatan2(0, 0)).toBe(0);
    expect(fatan2(1e-300, 1)).toBeCloseTo(1e-300, 12);
    expect(Number.isFinite(fatan2(1e-300, 1e-300))).toBe(true);
  });

  it('sin/cos em múltiplos de π/2 e nos limites da redução', () => {
    expect(Math.abs(fsin(0))).toBe(0);
    expect(fcos(0)).toBe(1);
    expect(Math.abs(fsin(FM_PI))).toBeLessThan(TOL);
    expect(Math.abs(fsin(FM_HALF_PI) - 1)).toBeLessThan(TOL);
    expect(Math.abs(fcos(FM_PI) + 1)).toBeLessThan(TOL);
    expect(Math.abs(fcos(FM_HALF_PI))).toBeLessThan(TOL);
    expect(Math.abs(fsin(-FM_HALF_PI) + 1)).toBeLessThan(TOL);
    // Pitágoras
    for (const x of [0.1, 1.2, 2.9, -3.3, 7.7, 100.25]) {
      expect(Math.abs(fsin(x) ** 2 + fcos(x) ** 2 - 1)).toBeLessThan(TOL);
    }
  });

  it('valores de referência fixos (fixam o algoritmo: a mesma saída em qualquer motor)', () => {
    expect(fsin(1)).toBe(0.8414709848078965);
    expect(fcos(1)).toBe(0.5403023058681399);
    expect(fatan2(3, 4)).toBe(0.6435011087932844);
    expect(fhypot(3, 4)).toBe(5);
  });
});

describe('fmath: determinismo', () => {
  it('mesma entrada => mesma saída (bit a bit) em chamadas repetidas', () => {
    for (const x of [0.3, -2.2, 17.5, 1e4]) {
      expect(Object.is(fsin(x), fsin(x))).toBe(true);
      expect(Object.is(fcos(x), fcos(x))).toBe(true);
    }
    expect(Object.is(fatan2(-3.1, 2.7), fatan2(-3.1, 2.7))).toBe(true);
  });

  it('não depende de estado global: chamar outras funções não altera resultados', () => {
    const before = fsin(0.777);
    fcos(9.1); fatan2(5, -2); fhypot(9, 9);
    expect(Object.is(fsin(0.777), before)).toBe(true);
  });
});

describe('fmath: tangente (geração de mapas, M6-04b)', () => {
  it('ftan bate com Math.tan em [-1.4, 1.4] (erro < 1e-11)', () => {
    let max = 0;
    for (let x = -1.4; x <= 1.4; x += 0.00041) max = Math.max(max, Math.abs(ftan(x) - Math.tan(x)));
    expect(max).toBeLessThan(1e-11);
  });

  it('ftan nos valores usados pelo gerador (π/N limitado a 1.2) e tan(0) = 0', () => {
    expect(ftan(0)).toBe(0);
    expect(Math.abs(ftan(1.2) - Math.tan(1.2))).toBeLessThan(1e-11);
    expect(Math.abs(ftan(FM_PI / 3) - Math.tan(FM_PI / 3))).toBeLessThan(1e-11);
  });

  it('ftan = fsin / fcos (mesmas operações IEEE, sem estado)', () => {
    for (const x of [0.2, -0.9, 1.1]) expect(Object.is(ftan(x), fsin(x) / fcos(x))).toBe(true);
  });
});
