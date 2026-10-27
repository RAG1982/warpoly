import { describe, it, expect } from 'vitest';
import { UIManager } from '../../src/ui/UIManager.js';

/**
 * FIX-MAGE-TRAIN — a Torre Arcana (role 'arcane') abre o painel de PESQUISA, mas também treina o Mago
 * (e o Santuário das Cinzas treina o Necromante). O painel precisa listar as duas coisas.
 */
function fakeUi(faction) {
  const ui = Object.create(UIManager.prototype);
  ui.bldTrainButtons = { innerHTML: '', querySelector: () => null };
  ui.bldTrainLabel = { innerText: '' };
  ui.bldQueueLabel = { innerText: '' };
  ui.bldTrainSection = { style: {} };
  ui.bldQueueSection = { style: {} };
  ui._icon = () => '<i></i>';
  ui._unitIcon = () => '<i></i>';
  ui._faction = () => faction;
  ui._stat = () => '';
  ui.updateBuildingCosts = () => {};
  ui.gm = {
    playerFaction: faction,
    resolveTrainType: (t) => t,
    isUpgradeResearched: () => false,
    isUpgradeResearching: () => false,
    getResearchLevel: () => 0,
    resources: {}
  };
  return ui;
}

describe('painel de construção com pesquisa + treino', () => {
  for (const [faction, type, unit] of [['human', 'arcane_tower', 'mage'], ['orc', 'ash_sanctum', 'necromancer']]) {
    it(`${type}: botões de pesquisa E de treino (${unit})`, () => {
      const ui = fakeUi(faction);
      ui.renderBuildingTrainButtons({ type, faction: 'player', isConstructed: true, ownerId: 0 });
      const html = ui.bldTrainButtons.innerHTML;
      expect(html).toContain(`data-train="${unit}"`);
      expect(html).toContain('data-upgrade=');
      expect(ui.bldTrainLabel.innerText).toMatch(/TREINAR/);
    });
  }
  it('forja (sem treino) segue só com pesquisas', () => {
    const ui = fakeUi('human');
    ui.renderBuildingTrainButtons({ type: 'forge', faction: 'player', isConstructed: true, ownerId: 0 });
    expect(ui.bldTrainButtons.innerHTML).not.toContain('data-train=');
    expect(ui.bldTrainButtons.innerHTML).toContain('data-upgrade=');
  });
});
