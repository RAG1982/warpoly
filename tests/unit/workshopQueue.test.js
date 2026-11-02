import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { UIManager } from '../../src/ui/UIManager.js';
import { UNIT_TRAIN_CONFIG } from '../../src/data/index.js';

/**
 * FIX-WORKSHOP-QUEUE — a Oficina de Engenharia (`workshop`, humana) e a dos Engenhoqueiros
 * (`orc_workshop`) enfileiram treino como Quartel/Estábulo (até BUILDING_QUEUE_MAX = 6), com custo
 * debitado ao enfileirar, reembolso ao cancelar e um slot por unidade na HUD.
 */
function makeGm(faction = 'human') {
  const cfg = createMatchConfig({ seed: 5, headless: true });
  if (faction === 'orc') cfg.players[0].factionId = 'orc';
  const gm = new GameManager(new Terrain(), null, null, cfg);
  gm.aiDirectors.forEach((d) => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}
const isHq = (b) => b.type === 'castle' || b.type === 'great_hall';

/** Oficina construída e concluída perto do Centro do jogador 0 (Centro nível 2, exigido pelos cercos). */
function makeWorkshop(gm, type) {
  const hq = gm.buildings.find((b) => b.ownerId === 0 && isHq(b));
  hq.tier = 2;
  const b = gm.createBuilding(type, hq.mesh.position.x + 12, hq.mesh.position.z + 12, true, 0);
  b.isConstructed = true;
  gm.buildings.push(b);
  return b;
}

const train = (gm, b, unitType) => {
  gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: b.id, unitType });
  gm.simStep(SIM_DT);
};

const CASES = [
  ['workshop', 'human', 'ballista'],
  ['orc_workshop', 'orc', 'catapult']
];

describe('Oficina: fila de treino (FIX-WORKSHOP-QUEUE)', () => {
  for (const [type, faction, unit] of CASES) {
    it(`${type}: enfileira 3 unidades e debita o custo de cada uma`, () => {
      const gm = makeGm(faction);
      const b = makeWorkshop(gm, type);
      const p = gm.getPlayer(0);
      Object.assign(p.resources, { gold: 99999, wood: 99999, stone: 99999 });
      const before = { ...p.resources };
      for (let i = 1; i <= 3; i++) {
        train(gm, b, unit);
        expect(b.queue).toHaveLength(i);
      }
      const cost = UNIT_TRAIN_CONFIG[unit].cost;
      for (const r of ['gold', 'wood', 'stone']) {
        expect(p.resources[r]).toBe(before[r] - 3 * (cost[r] || 0));
      }
    });

    it(`${type}: cancelar um slot devolve o custo integral`, () => {
      const gm = makeGm(faction);
      const b = makeWorkshop(gm, type);
      const p = gm.getPlayer(0);
      Object.assign(p.resources, { gold: 99999, wood: 99999, stone: 99999 });
      train(gm, b, unit);
      train(gm, b, unit);
      const afterTwo = { ...p.resources };
      expect(b.cancelQueuedUnit(1, gm)).toBe(true);
      expect(b.queue).toHaveLength(1);
      const cost = UNIT_TRAIN_CONFIG[unit].cost;
      for (const r of ['gold', 'wood', 'stone']) {
        expect(p.resources[r]).toBe(afterTwo[r] + (cost[r] || 0));
      }
    });

    it(`${type}: sem recursos para a 2ª, a fila recusa sem debitar (causa do "uma por vez" com a economia inicial)`, () => {
      const gm = makeGm(faction);
      const b = makeWorkshop(gm, type);
      const p = gm.getPlayer(0);
      const cost = UNIT_TRAIN_CONFIG[unit].cost;
      // Recursos para exatamente uma unidade.
      Object.assign(p.resources, { gold: cost.gold || 0, wood: cost.wood || 0, stone: cost.stone || 0 });
      train(gm, b, unit);
      expect(b.queue).toHaveLength(1);
      const left = { ...p.resources };
      train(gm, b, unit);
      expect(b.queue).toHaveLength(1);
      expect(p.resources).toEqual(left);
    });

    it(`${type}: a HUD mostra os botões de treino e 3 slots de fila`, () => {
      const gm = makeGm(faction);
      const b = makeWorkshop(gm, type);
      const p = gm.getPlayer(0);
      Object.assign(p.resources, { gold: 99999, wood: 99999, stone: 99999 });
      for (let i = 0; i < 3; i++) train(gm, b, unit);

      const slots = Array.from({ length: 6 }, () => ({ className: '', title: '', innerHTML: '' }));
      const ui = Object.create(UIManager.prototype);
      ui.bldTrainButtons = { innerHTML: '', querySelector: () => null };
      ui.bldTrainLabel = { innerText: '' };
      ui.bldQueueLabel = { innerText: '' };
      ui.bldTrainSection = { style: {} };
      ui.bldQueueSection = { style: {} };
      ui.bldQueueSlots = slots;
      ui.bldQueueProgressBar = { style: {} };
      ui.bldQueueProgressTrack = { style: {} };
      ui._icon = () => '<i></i>';
      ui._unitIcon = () => '<i></i>';
      ui._stat = () => '';
      ui.updateBuildingCosts = () => {};
      ui.gm = { playerFaction: faction, resolveTrainType: (t) => t, resources: p.resources };

      ui.renderBuildingTrainButtons(b);
      expect(ui.bldTrainButtons.innerHTML).toContain(`data-train="${unit}"`);
      ui.updateBuildingQueue(b);
      expect(slots.slice(0, 3).every((s) => s.className.includes('filled'))).toBe(true);
      expect(slots[3].className).toContain('empty');
    });
  }
});
