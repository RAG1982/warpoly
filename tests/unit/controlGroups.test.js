import { describe, it, expect } from 'vitest';
import { ControlGroups, DOUBLE_TAP_MS } from '../../src/core/ControlGroups.js';

describe('ControlGroups (F3-01)', () => {
  it('grava, seleciona e adiciona sem duplicar', () => {
    const cg = new ControlGroups();
    cg.set(1, [10, 11, 12]);
    expect(cg.get(1)).toEqual([10, 11, 12]);
    cg.add(1, [12, 13]);
    expect(cg.get(1)).toEqual([10, 11, 12, 13]);
    cg.set(1, [5]);
    expect(cg.get(1)).toEqual([5]);
    expect(cg.get(2)).toEqual([]);
  });

  it('unidade morta sai do grupo', () => {
    const cg = new ControlGroups();
    cg.set(3, [1, 2, 3]);
    const dead = new Set([2]);
    expect(cg.get(3, id => !dead.has(id))).toEqual([1, 3]);
    expect(cg.get(3)).toEqual([1, 3]); // podado de vez
  });

  it('duplo toque no mesmo número em < 350 ms centraliza', () => {
    const cg = new ControlGroups();
    cg.set(1, [1]);
    cg.set(2, [2]);
    expect(cg.recall(1, 1000).center).toBe(false);
    expect(cg.recall(1, 1000 + DOUBLE_TAP_MS - 1).center).toBe(true);
    expect(cg.recall(1, 1000 + DOUBLE_TAP_MS).center).toBe(false); // 3º toque não encadeia
    cg.recall(2, 5000);
    expect(cg.recall(1, 5100).center).toBe(false); // outro número zera
    expect(cg.recall(1, 6000).center).toBe(false);
    expect(cg.recall(1, 7000 + DOUBLE_TAP_MS).center).toBe(false); // lento demais
  });
});
