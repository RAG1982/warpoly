import { describe, it, expect } from 'vitest';
import { ControlGroups, limitByBoxCenter, SELECTION_LIMIT, DOUBLE_TAP_MS } from '../../src/core/ControlGroups.js';

const unit = (id, extra = {}) => ({ id, isDead: false, isDying: false, state: 'idle', ...extra });

describe('ControlGroups (F3-01)', () => {
  it('grava, seleciona e adiciona sem duplicar', () => {
    const g = new ControlGroups();
    const all = { 1: unit(1), 2: unit(2), 3: unit(3) };
    const resolve = id => all[id] || null;
    g.set(1, [1, 2]);
    expect(g.select(1, resolve).map(u => u.id)).toEqual([1, 2]);
    g.add(1, [2, 3]);
    expect(g.get(1)).toEqual([1, 2, 3]);
  });

  it('unidade morta ou inexistente sai do grupo', () => {
    const g = new ControlGroups();
    const all = { 1: unit(1), 2: unit(2, { isDead: true }) };
    g.set(2, [1, 2, 9]);
    expect(g.select(2, id => all[id] || null).map(u => u.id)).toEqual([1]);
    expect(g.get(2)).toEqual([1]);
  });

  it('duplo toque só dentro de 350 ms e no mesmo dígito', () => {
    const g = new ControlGroups();
    expect(g.tap(1, 1000)).toBe(false);
    expect(g.tap(1, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
    expect(g.tap(1, 1100)).toBe(false); // consumiu o duplo: recomeça
    expect(g.tap(2, 1200)).toBe(false);
    expect(g.tap(1, 1300)).toBe(false); // dígito diferente
    expect(g.tap(1, 1300 + DOUBLE_TAP_MS)).toBe(false); // lento demais
  });
});

describe('limite de seleção', () => {
  it('30 unidades na caixa → as 24 mais próximas do centro', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ id: i, sx: 100 + i * 10, sy: 100 }));
    const rect = { x1: 100, y1: 50, x2: 400, y2: 150 }; // centro x=250
    const picked = limitByBoxCenter(items, rect);
    expect(picked).toHaveLength(SELECTION_LIMIT);
    const ids = new Set(picked.map(p => p.id));
    // as mais distantes do centro (extremos) ficam de fora
    expect(ids.has(0)).toBe(false);
    expect(ids.has(29)).toBe(false);
    expect(ids.has(15)).toBe(true);
  });

  it('até o limite devolve tudo', () => {
    const items = [{ sx: 0, sy: 0 }];
    expect(limitByBoxCenter(items, { x1: 0, y1: 0, x2: 1, y2: 1 })).toBe(items);
  });
});
