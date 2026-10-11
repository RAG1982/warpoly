import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { getMap } from '../../src/data/maps/index.js';
import { NEUTRAL_HOSTILE_ID } from '../../src/sim/EntityIds.js';

/** NEW-26 — inspeção somente-leitura de neutros/inimigos: nunca vira seleção própria nem emite comandos. */
function makeGm() {
  const cfg = createMatchConfig({ seed: 42, headless: true, mapId: 'continental-1v1' });
  return new GameManager(new Terrain(getMap('continental-1v1')), null, null, cfg);
}
const setup = () => {
  const gm = makeGm();
  const bandit = gm.allUnits.find((u) => u.type === 'bandit');
  const camp = gm.buildings.find((b) => b.ownerId === NEUTRAL_HOSTILE_ID);
  const own = gm.getUnitsOf(0)[0];
  return { gm, bandit, camp, own };
};
const reveal = (gm, e) => gm.fogOfWar.revealArea(e.mesh.position.x, e.mesh.position.z, 6);

describe('inspeção de entidades não-locais (NEW-26)', () => {
  it('inspecionar bandido e acampamento não altera a seleção nem enfileira comandos', () => {
    const { gm, bandit, camp } = setup();
    expect(bandit && camp).toBeTruthy();
    for (const e of [bandit, camp]) {
      reveal(gm, e);
      gm.selectSingle(e);
      expect(gm.inspected).toBe(e);
      expect(gm.selectedUnits).toEqual([]);
      expect(gm.selectedBuilding).toBeNull();
    }
    expect(gm.commands.pending().length).toBe(0);
  });

  it('seleção própria continua igual; inspect() separado não a toca', () => {
    const { gm, bandit, own } = setup();
    gm.selectSingle(own);
    reveal(gm, bandit);
    expect(gm.inspect(bandit)).toBe(true);
    expect(gm.selectedUnits).toEqual([own]);
    expect(gm.commands.pending().length).toBe(0);
  });

  it('limpar a seleção limpa a inspeção; selecionar algo próprio também', () => {
    const { gm, bandit, own } = setup();
    reveal(gm, bandit);
    gm.selectSingle(bandit);
    gm.clearSelection();
    expect(gm.inspected).toBeNull();
    gm.selectSingle(bandit);
    gm.selectSingle(own);
    expect(gm.inspected).toBeNull();
    expect(gm.selectedUnits).toEqual([own]);
  });

  it('entidade fora da visão ou morta não é inspecionável', () => {
    const { gm, bandit } = setup();
    gm.fogOfWar.setEnabled(true);
    const p = bandit.mesh.position;
    expect(gm.fogOfWar.isVisible(p.x, p.z)).toBe(false); // bandidos começam longe do jogador
    expect(gm.inspect(bandit)).toBe(false);
    expect(gm.inspected).toBeNull();
    reveal(gm, bandit);
    expect(gm.isInspectable(bandit)).toBe(true);
    bandit.isDead = true;
    expect(gm.isInspectable(bandit)).toBe(false);
  });
});
