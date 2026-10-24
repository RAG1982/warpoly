import { describe, it, expect } from 'vitest';
import { thinCorridor, corridorSegments, distToSegment, CORRIDOR_DEFAULTS } from '../../tools/lib/corridorThin.mjs';
import { getMap, loadAllCampaignMaps } from '../../src/data/maps/index.js';

const mk = () => ({
  id: 't', startSlots: [{ x: -60, z: 0, mirror: [-1, 1] }, { x: 60, z: 0, mirror: [1, 1] }], neutrals: [],
  forests: [
    { x: -40, z: 0, count: 14, radius: 10, species: 'oak' }, // grove da serraria do slot 0 (dx -12 → x = -48): intocado
    { x: -10, z: 2, count: 14, radius: 10, species: 'pine' },
    { x: 10, z: -3, count: 14, radius: 10, species: 'pine' },
    { x: 0, z: 40, count: 14, radius: 10, species: 'oak' } // longe do corredor
  ]
});

describe('B-arvores-corredor · afinar corredor', () => {
  it('só baixa o count dos bosques do corredor; posição, ordem e bosques da serraria/fora da faixa não mudam', () => {
    const m = mk();
    const r = thinCorridor(m, { seed: 1, label: 't' });
    expect(r.forests.map((f) => [f.x, f.z, f.species])).toEqual(m.forests.map((f) => [f.x, f.z, f.species]));
    expect(r.forests[0].count).toBe(14);
    expect(r.forests[3].count).toBe(14);
    expect(r.forests[1].count).toBeLessThan(14);
    expect(r.forests[2].count).toBeLessThan(14);
    expect(r.forests[1].count + r.forests[2].count).toBeLessThanOrEqual(Math.ceil(28 * CORRIDOR_DEFAULTS.keepFrac) + 2);
    expect(m.forests[1].count).toBe(14); // entrada não é alterada
  });

  it('é determinístico (mesma semente ⇒ mesmo resultado) e a semente muda a distribuição', () => {
    const a = thinCorridor(mk(), { seed: 7, label: 't' }), b = thinCorridor(mk(), { seed: 7, label: 't' });
    expect(a.forests).toEqual(b.forests);
  });

  it('a garantia de madeira devolve árvores ao bosque deficitário mais próximo', () => {
    const woodFn = (forests) => [forests[1].count >= 10 ? 9000 : 100, 9000];
    const r = thinCorridor(mk(), { seed: 1, label: 't', woodFn, woodMin: 8000 });
    expect(r.forests[1].count).toBeGreaterThanOrEqual(10);
  });

  it('distToSegment', () => {
    expect(distToSegment({ x: 5, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(3);
    expect(distToSegment({ x: -4, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(5);
    expect(corridorSegments(mk())).toHaveLength(1);
  });

  it('mapas gravados trazem meta.corridorThin e nenhum bosque some (âncoras forestN seguem válidas)', async () => {
    await loadAllCampaignMaps();
    for (const id of ['camp-01-baia-de-aurelan', 'camp-05-cerne-verde', 'campos-1v1', 'duelo-continental-2']) {
      const m = getMap(id);
      expect(m.meta.corridorThin.clusters, id).toBeGreaterThan(0);
      expect(m.forests.every((f) => f.count >= 1), id).toBe(true);
    }
  });
});
