import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../../src/sim/SpatialGrid.js';
import { readFileSync } from 'node:fs';

describe('grades espaciais do GameManager acompanham o tamanho do mapa', () => {
  it('grade fixa ±70 perde entidade em x=-95 (motivo da correção)', () => {
    const g = new SpatialGrid();
    const e = { id: 1 };
    g.insert(e, -95, 0, 3);
    expect(g.queryRadius(-95, 0, 6)).not.toContain(e);
  });
  it('grade com limites maiores acha a entidade', () => {
    const g = new SpatialGrid({ minX: -138, minZ: -138, maxX: 138, maxZ: 138 });
    const e = { id: 1 };
    g.insert(e, -95, 0, 3);
    expect(g.queryRadius(-95, 0, 6)).toContain(e);
  });
  it('GameManager dimensiona unitGrid/blockerGrid pelo mapDef.size', () => {
    const src = readFileSync('src/sim/GameManager.js', 'utf8');
    expect(src).toMatch(/new SpatialGrid\(gridBounds\)/g);
    expect(src).toMatch(/mapDef\.size/);
  });
});
