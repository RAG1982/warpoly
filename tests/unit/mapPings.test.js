import { describe, it, expect } from 'vitest';
import { MapPings } from '../../src/net/MapPings.js';

describe('MapPings (F9-04)', () => {
  it('expira, limita por jogador e normaliza o tipo', () => {
    const p = new MapPings({ lifeMs: 1000, maxPerPlayer: 2 });
    p.add({ x: 1, z: 1, from: 0 }, 0);
    p.add({ x: 2, z: 2, from: 0, kind: 'attack' }, 100);
    p.add({ x: 3, z: 3, from: 0, kind: 'zzz' }, 200);
    p.add({ x: 9, z: 9, from: 1 }, 300);
    let a = p.active(400);
    expect(a.filter((q) => q.from === 0).map((q) => q.x)).toEqual([2, 3]);
    expect(a.find((q) => q.x === 3).kind).toBe('attention');
    expect(a.find((q) => q.x === 9).age).toBeCloseTo(0.1);
    a = p.active(1250); // os de t0=0..200 expiraram; o de 300 vive
    expect(a.map((q) => q.x)).toEqual([9]);
    expect(p.active(5000)).toEqual([]);
  });
});
