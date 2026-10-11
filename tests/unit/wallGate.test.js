import { describe, it, expect } from 'vitest';
import { findWallGaps, getGateGeometry } from '../../src/render/WallGate.js';
import { wallMinimapShapes } from '../../src/ui/minimapView.js';
import { WALL_STEP } from '../../src/data/index.js';

const line = (n, x0, z0, dx, dz, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + dx * WALL_STEP * i, z: z0 + dz * WALL_STEP * i, ownerId: 1, type: 'wall_human', ...extra }));

describe('NEW-24 portão visual de muralha', () => {
  it('muralha contínua não tem lacuna', () => {
    expect(findWallGaps(line(8, 0, 0, 1, 0))).toEqual([]);
  });

  it('um segmento ausente gera portão no meio, alinhado à muralha', () => {
    // segmentos nos passos 0,1,2 e 4,5,6: falta o passo 3
    const segs = [...line(3, 0, 0, 1, 0), ...line(3, 4 * WALL_STEP, 0, 1, 0)];
    const gaps = findWallGaps(segs);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].x).toBeCloseTo(3 * WALL_STEP, 5);
    expect(gaps[0].z).toBeCloseTo(0, 5);
    expect(gaps[0].angle).toBeCloseTo(0, 5);
    expect(gaps[0].width).toBeCloseTo(2 * WALL_STEP, 5);
  });

  it('ângulo segue a direção (diagonal e vertical)', () => {
    const d = Math.SQRT1_2;
    const diag = [{ x: 0, z: 0, ownerId: 1, type: 't' }, { x: 2 * WALL_STEP * d, z: 2 * WALL_STEP * d, ownerId: 1, type: 't' }];
    expect(findWallGaps(diag)[0].angle).toBeCloseTo(Math.PI / 4, 5);
    const vert = [{ x: 0, z: 0, ownerId: 1, type: 't' }, { x: 0, z: 2 * WALL_STEP, ownerId: 1, type: 't' }];
    const g = findWallGaps(vert)[0];
    expect(g.angle).toBeCloseTo(Math.PI / 2, 5);
    expect(g.z).toBeCloseTo(WALL_STEP, 5);
  });

  it('ignora distâncias > 3 passos, donos diferentes e tipos diferentes', () => {
    const far = [{ x: 0, z: 0, ownerId: 1, type: 't' }, { x: 3.5 * WALL_STEP, z: 0, ownerId: 1, type: 't' }];
    expect(findWallGaps(far)).toEqual([]);
    const ok = [{ x: 0, z: 0, ownerId: 1, type: 't' }, { x: 3 * WALL_STEP, z: 0, ownerId: 1, type: 't' }];
    expect(findWallGaps(ok)).toHaveLength(1);
    expect(findWallGaps([{ x: 0, z: 0, ownerId: 1, type: 't' }, { x: 2 * WALL_STEP, z: 0, ownerId: 2, type: 't' }])).toEqual([]);
    expect(findWallGaps([{ x: 0, z: 0, ownerId: 1, type: 'a' }, { x: 2 * WALL_STEP, z: 0, ownerId: 1, type: 'b' }])).toEqual([]);
  });

  it('geometria do portão tem baixa contagem de triângulos', () => {
    const geo = getGateGeometry(2 * WALL_STEP);
    expect(geo.index.count / 3).toBeLessThanOrEqual(40);
  });
});

describe('NEW-24 muralha no minimapa', () => {
  const toMap = (x, z) => ({ x: x * 2, y: z * 2 });
  it('gera pontos e liga segmentos adjacentes do mesmo dono; lacuna quebra a linha', () => {
    const segs = [...line(3, 0, 0, 1, 0), ...line(2, 5 * WALL_STEP, 0, 1, 0)];
    const { points, lines } = wallMinimapShapes(segs, toMap);
    expect(points).toHaveLength(5);
    expect(lines).toHaveLength(3); // 2 + 1; a lacuna entre os grupos não liga
    expect(points[1]).toEqual({ x: WALL_STEP * 2, y: 0, ownerId: 1 });
  });
  it('omite segmentos não conhecidos pela névoa', () => {
    const segs = line(4, 0, 0, 1, 0);
    const { points, lines } = wallMinimapShapes(segs, toMap, (w) => w.x < 2 * WALL_STEP);
    expect(points).toHaveLength(2);
    expect(lines).toHaveLength(1);
  });
});
