import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../../src/sim/SpatialGrid.js';

/** Entidade mínima o suficiente para a grade (precisa só de `id`). */
function entity(id) {
  return { id };
}

describe('SpatialGrid: insert/queryRadius básico', () => {
  it('encontra uma entidade inserida dentro do raio', () => {
    const grid = new SpatialGrid();
    const e = entity(1);
    grid.insert(e, 0, 0);
    const out = grid.queryRadius(0, 0, 5);
    expect(out).toEqual([e]);
  });

  it('não encontra uma entidade fora do raio', () => {
    const grid = new SpatialGrid();
    const e = entity(1);
    grid.insert(e, 50, 50);
    const out = grid.queryRadius(0, 0, 5);
    expect(out).toEqual([]);
  });

  it('respeita o filtro opcional', () => {
    const grid = new SpatialGrid();
    const a = entity(1);
    const b = entity(2);
    grid.insert(a, 0, 0);
    grid.insert(b, 1, 0);
    const out = grid.queryRadius(0, 0, 5, e => e === a);
    expect(out).toEqual([a]);
  });
});

describe('SpatialGrid: entidade na borda de célula', () => {
  it('encontra entidades cujo centro fica bem na borda entre duas células', () => {
    const grid = new SpatialGrid({ minX: -8, minZ: -8, maxX: 8, maxZ: 8, cellSize: 4 });
    // x=0 é exatamente a borda entre a célula [-4,0) e [0,4).
    const onBorder = entity(1);
    grid.insert(onBorder, 0, 0);
    const out = grid.queryRadius(0, 0, 0.5);
    expect(out).toEqual([onBorder]);
  });
});

describe('SpatialGrid: update', () => {
  it('move a entidade entre células e a consulta reflete a nova posição', () => {
    const grid = new SpatialGrid({ minX: -20, minZ: -20, maxX: 20, maxZ: 20, cellSize: 4 });
    const e = entity(1);
    grid.insert(e, -10, -10, 0);
    expect(grid.queryRadius(-10, -10, 1)).toEqual([e]);
    expect(grid.queryRadius(10, 10, 1)).toEqual([]);

    grid.update(e, 10, 10, 0);
    expect(grid.queryRadius(10, 10, 1)).toEqual([e]);
    expect(grid.queryRadius(-10, -10, 1)).toEqual([]);
  });

  it('update sem insert anterior insere a entidade', () => {
    const grid = new SpatialGrid();
    const e = entity(1);
    grid.update(e, 3, 3, 0);
    expect(grid.queryRadius(3, 3, 1)).toEqual([e]);
  });
});

describe('SpatialGrid: remove', () => {
  it('remove a entidade da grade (consultas subsequentes não a encontram)', () => {
    const grid = new SpatialGrid();
    const e = entity(1);
    grid.insert(e, 0, 0);
    grid.remove(e);
    expect(grid.queryRadius(0, 0, 5)).toEqual([]);
  });

  it('remover uma entidade ausente é no-op (não lança)', () => {
    const grid = new SpatialGrid();
    expect(() => grid.remove(entity(99))).not.toThrow();
  });
});

describe('SpatialGrid: queryRadius com raio grande', () => {
  it('atravessa várias células e retorna todas as entidades no raio', () => {
    const grid = new SpatialGrid({ minX: -40, minZ: -40, maxX: 40, maxZ: 40, cellSize: 4 });
    const entities = [];
    for (let i = 0; i < 20; i++) {
      const e = entity(i + 1);
      // Espalhadas ao longo de várias células (cellSize=4), todas dentro de raio 30 do centro.
      grid.insert(e, i - 10, -i + 10);
      entities.push(e);
    }
    const out = grid.queryRadius(0, 0, 30);
    expect(out.length).toBe(20);
    for (const e of entities) {
      expect(out).toContain(e);
    }
  });
});

describe('SpatialGrid: ordenação por id', () => {
  it('queryRadius retorna sempre em ordem crescente de id, independente da ordem de inserção', () => {
    const grid = new SpatialGrid();
    const e5 = entity(5);
    const e1 = entity(1);
    const e3 = entity(3);
    grid.insert(e5, 0, 0);
    grid.insert(e1, 0.1, 0);
    grid.insert(e3, -0.1, 0);
    const out = grid.queryRadius(0, 0, 5);
    expect(out.map(e => e.id)).toEqual([1, 3, 5]);
  });

  it('queryRect também retorna em ordem crescente de id', () => {
    const grid = new SpatialGrid();
    grid.insert(entity(9), 1, 1);
    grid.insert(entity(2), -1, -1);
    grid.insert(entity(4), 0, 0);
    const out = grid.queryRect(-5, -5, 5, 5);
    expect(out.map(e => e.id)).toEqual([2, 4, 9]);
  });
});

describe('SpatialGrid: nearest', () => {
  it('retorna a entidade mais próxima dentro de maxR', () => {
    const grid = new SpatialGrid();
    const near = entity(1);
    const far = entity(2);
    grid.insert(near, 1, 0);
    grid.insert(far, 5, 0);
    expect(grid.nearest(0, 0, 10)).toBe(near);
  });

  it('em caso de empate de distância, retorna a de menor id', () => {
    const grid = new SpatialGrid();
    const idHigh = entity(7);
    const idLow = entity(2);
    grid.insert(idHigh, 3, 0);
    grid.insert(idLow, 0, 3);
    expect(grid.nearest(0, 0, 10)).toBe(idLow);
  });

  it('retorna null quando nenhuma entidade está dentro de maxR', () => {
    const grid = new SpatialGrid();
    grid.insert(entity(1), 100, 100);
    expect(grid.nearest(0, 0, 10)).toBeNull();
  });

  it('respeita o predicate', () => {
    const grid = new SpatialGrid();
    const a = entity(1);
    const b = entity(2);
    grid.insert(a, 1, 0);
    grid.insert(b, 2, 0);
    expect(grid.nearest(0, 0, 10, e => e === b)).toBe(b);
  });
});

describe('SpatialGrid: outArray reutilizado', () => {
  it('queryRadius devolve a mesma referência do array passado, com length ajustado', () => {
    const grid = new SpatialGrid();
    const buf = [];
    grid.insert(entity(1), 0, 0);
    const out1 = grid.queryRadius(0, 0, 5, null, buf);
    expect(out1).toBe(buf);
    expect(out1.length).toBe(1);

    grid.insert(entity(2), 100, 100);
    const out2 = grid.queryRadius(0, 0, 5, null, buf);
    expect(out2).toBe(buf);
    expect(out2.length).toBe(1);

    const out3 = grid.queryRadius(200, 200, 5, null, buf);
    expect(out3).toBe(buf);
    expect(out3.length).toBe(0);
  });
});

describe('SpatialGrid: entidade fora dos limites', () => {
  it('é clampada para a célula de borda e ainda é encontrável perto do limite', () => {
    const grid = new SpatialGrid({ minX: -10, minZ: -10, maxX: 10, maxZ: 10, cellSize: 4 });
    const outside = entity(1);
    // Bem fora dos limites da grade (x=1000): deve cair na célula de borda (canto maxX/maxZ).
    grid.insert(outside, 1000, 1000);
    // Consultar perto do canto onde a entidade foi clampada a encontra.
    const out = grid.queryRadius(10, 10, 5);
    expect(out).toEqual([outside]);
    // E não aparece em outro ponto qualquer da grade.
    expect(grid.queryRadius(-10, -10, 5)).toEqual([]);
  });
});
