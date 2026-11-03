import { describe, it, expect, beforeAll } from 'vitest';
import { getMap, loadAllCampaignMaps } from '../../src/data/maps/index.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { makeCtx } from '../../tools/lib/campaignMaps.mjs';
import { navDist, dockOf, FAR_OIL } from '../../tools/lib/farOil.mjs';

/**
 * OIL-FAR: os poços de petróleo dos mapas navais não ficam mais colados à costa da base. Distância real de NAVEGAÇÃO (Dijkstra na grade
 * naval do Pathfinder) da doca de cada jogador (água do Estaleiro ou o mar mais perto do Paço): 1 poço seguro-ish (>= 25 u) e os demais
 * dos poços do jogador longe (>= 50 u); todos ligados ao oceano, 10.000 cada e a mesma quantidade de antes.
 */
beforeAll(async () => { await loadAllCampaignMaps(); });

/** [índices do poço seguro-ish por jogador, índices dos poços longe por jogador, quantidade de poços] */
const SPEC = {
  'camp-04-baixio-do-breu': { safe: [[0, 0], [2, 1]], far: [[1, 0], [3, 1]], total: 6, farMin: 55 },
  'camp-08-fornalha': { safe: [[0, 0]], far: [[1, 0]], total: 4, farMin: 55 },
  'camp-09-miragem': { safe: [[0, 0]], far: [[1, 0]], total: 4, farMin: 55 },
  'estreito-naval-1v1': { safe: [[0, 0], [2, 1]], far: [[1, 0], [3, 1]], total: 6, farMin: 50 },
  'arquipelago-pontes-4p': { safe: [[0, 0], [2, 1], [4, 2]], far: [[1, 0], [3, 1], [5, 2], [7, 3]], total: 12, farMin: 50 }
};

describe('OIL-FAR · poços longe da costa', () => {
  for (const [id, spec] of Object.entries(SPEC)) {
    it(`${id}: ${spec.total} poços de 10.000, todos no mar ligado ao oceano; 1 seguro-ish (>= 25 u) e os outros do jogador longe (>= ${spec.farMin} u de navegação da doca)`, () => {
      const m = getMap(id);
      expect(FAR_OIL[id], 'receita FAR_OIL').toBeTypeOf('function');
      const oil = m.resources.filter((r) => r.type === 'oil');
      expect(oil).toHaveLength(spec.total);
      for (const w of oil) expect(w.amount).toBe(10000);
      const ctx = makeCtx(m);
      const docks = m.startSlots.map((s, i) => dockOf(ctx, s, m.anchors[`shipyard${i + 1}Water`] ?? null, id === 'arquipelago-pontes-4p' ? { x: -20, z: 20, maxNav: 130 } : null));
      const fields = docks.map((d) => navDist(ctx.sea, d.x, d.z));
      const sea = buildPathfinder(m, 'naval');
      for (const w of oil) expect(isReached(sea, floodFill(sea, oil[0].x, oil[0].z), w.x, w.z), `poço ${w.x},${w.z} no mesmo mar`).toBe(true);
      for (const [wi, p] of spec.safe) {
        const d = fields[p].at(oil[wi].x, oil[wi].z);
        expect(d, `poço ${wi} do jogador ${p}`).toBeGreaterThanOrEqual(25);
        expect(d).toBeLessThanOrEqual(60);
      }
      for (const [wi, p] of spec.far) {
        const d = fields[p].at(oil[wi].x, oil[wi].z);
        expect(d, `poço ${wi} do jogador ${p}`).toBeGreaterThanOrEqual(spec.farMin);
        expect(Number.isFinite(d)).toBe(true);
      }
    });
  }
});
