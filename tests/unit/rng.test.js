import { describe, it, expect } from 'vitest';
import { mulberry32, createRng, fnv1a } from '../../src/sim/rng.js';

describe('rng (F2-03): mulberry32 determinístico', () => {
  it('mesma seed produz a mesma sequência', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('seeds diferentes produzem sequências diferentes', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() sempre em [0, 1)', () => {
    const r = mulberry32(999);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('distribuição razoável: média ~0.5 em 10k amostras', () => {
    const r = mulberry32(7);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) sum += r.next();
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('int(n) sempre em [0, n)', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('range(a,b) sempre em [a, b)', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('pick(arr) sempre devolve um elemento do array', () => {
    const r = mulberry32(3);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(r.pick(arr));
    }
  });

  it("fork('a') !== fork('b'): sequências diferentes para labels diferentes", () => {
    const root = mulberry32(42);
    const forkA = root.fork('a');
    const forkB = mulberry32(42).fork('b'); // mesma seed raiz, sem consumir next() do pai
    const seqA = Array.from({ length: 20 }, () => forkA.next());
    const seqB = Array.from({ length: 20 }, () => forkB.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('fork(label) é determinístico: mesma seed raiz + mesmo label → mesma sequência', () => {
    const forkA = mulberry32(42).fork('map');
    const forkB = mulberry32(42).fork('map');
    const seqA = Array.from({ length: 20 }, () => forkA.next());
    const seqB = Array.from({ length: 20 }, () => forkB.next());
    expect(seqA).toEqual(seqB);
  });

  it('fork() não consome a sequência do pai (chamar fork não muda o próximo next())', () => {
    const r1 = mulberry32(10);
    const r2 = mulberry32(10);
    r1.fork('x'); // não deve avançar o estado de r1
    const a = r1.next();
    const b = r2.next();
    expect(a).toBe(b);
  });

  it('createRng é um alias de mulberry32', () => {
    const a = createRng(55);
    const b = mulberry32(55);
    expect(a.next()).toBe(b.next());
  });

  it('fnv1a é determinístico e sensível ao conteúdo', () => {
    expect(fnv1a('ai:1')).toBe(fnv1a('ai:1'));
    expect(fnv1a('ai:1')).not.toBe(fnv1a('ai:2'));
  });
});
