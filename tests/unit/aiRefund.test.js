import { describe, it, expect } from 'vitest';
import { AIEconomyManager } from '../../src/ai/AIEconomyManager.js';
import { getCost } from '../../src/data/index.js';

/**
 * NEW-2: `placeBuilding` reembolsava pelo custo da fazenda (`director.costs.farm`)
 * porque `costs` é indexado por papel, não pelo tipo real da construção.
 */
function fakeDirector() {
  return {
    // Custo da "farm" deliberadamente diferente do custo real do quartel orc,
    // para expor o bug caso o reembolso volte a usar `costs[type]`/`costs.farm`.
    costs: { farm: { wood: 999, stone: 999, gold: 999 } },
    resources: { wood: 0, stone: 0, gold: 0 },
    baseCenter: { x: 0, y: 0 },
    gm: { canPlaceBuilding: () => false }
  };
}

describe('AIEconomyManager.placeBuilding: reembolso (NEW-2)', () => {
  it('reembolsa o custo real da construção (orc_barracks), não o da fazenda', () => {
    const director = fakeDirector();
    const eco = new AIEconomyManager(director);

    eco.placeBuilding('orc_barracks');

    const realCost = getCost('orc_barracks');
    expect(director.resources.wood).toBe(realCost.wood || 0);
    expect(director.resources.stone).toBe(realCost.stone || 0);
    expect(director.resources.gold).toBe(realCost.gold || 0);
  });
});
