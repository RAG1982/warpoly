import { describe, it, expect, vi } from 'vitest';
import { AIEconomyManager } from '../../src/ai/AIEconomyManager.js';
import { createRng } from '../../src/sim/rng.js';

/**
 * NEW-2 (histórico): `placeBuilding` chegou a reembolsar pelo custo da fazenda
 * (`director.costs.farm`) em vez do custo real da construção, porque `costs` é indexado
 * por papel, não pelo tipo real.
 *
 * F2-02: `placeBuilding` não deduz/reembolsa mais nada localmente — a dedução (e a
 * validação de custo) só acontece no `CommandExecutor`, no tick de execução do comando
 * PLACE_BUILDING. Se nenhum local livre for encontrado, nada foi gasto ainda: não deve
 * emitir comando nenhum, e os recursos do director permanecem intocados (o bug do
 * reembolso errado não pode mais recorrer, porque não há mais reembolso aqui).
 */
function fakeDirector() {
  return {
    playerId: 1,
    costs: { farm: { wood: 999, stone: 999, gold: 999 } },
    resources: { wood: 0, stone: 0, gold: 0 },
    baseCenter: { x: 0, y: 0 },
    rng: createRng(1), // F2-03: placeBuilding sorteia ângulo/distância de tentativa via director.rng
    getOwnUnits: () => [],
    gm: { canPlaceBuilding: () => false, issue: vi.fn() }
  };
}

describe('AIEconomyManager.placeBuilding (F2-02): sem local livre não deduz/reembolsa nada', () => {
  it('não emite PLACE_BUILDING nem toca nos recursos quando nenhum spot é válido', () => {
    const director = fakeDirector();
    const eco = new AIEconomyManager(director);

    eco.placeBuilding('orc_barracks');

    expect(director.gm.issue).not.toHaveBeenCalled();
    expect(director.resources).toEqual({ wood: 0, stone: 0, gold: 0 });
  });

  it('com um spot válido, emite PLACE_BUILDING com o tipo/posição/construtor certos', () => {
    const director = fakeDirector();
    director.gm.canPlaceBuilding = () => true;
    director.getOwnUnits = () => [
      { id: 42, isDead: false, type: undefined, state: 'idle', mesh: { position: { x: 0, z: 0 } } }
    ];
    director.workerType = undefined; // o "peon" fake acima usa o mesmo type (undefined)
    const eco = new AIEconomyManager(director);

    eco.placeBuilding('orc_barracks');

    expect(director.gm.issue).toHaveBeenCalledTimes(1);
    const cmd = director.gm.issue.mock.calls[0][0];
    expect(cmd.type).toBe('placeBuilding');
    expect(cmd.playerId).toBe(1);
    expect(cmd.buildingType).toBe('orc_barracks');
    expect(cmd.unitIds).toEqual([42]);
  });
});
