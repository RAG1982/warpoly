import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { EVT } from '../../src/sim/events.js';
import { soundsForEvent } from '../../src/audio/audioMapping.js';
import { effectsForEvent } from '../../src/render/vfx/vfxMapping.js';

function makeGm(seed = 42) {
  const terrain = new Terrain();
  const cfg = createMatchConfig({ seed, headless: true });
  return new GameManager(terrain, null, null, cfg);
}

describe('Desabamento e desaparecimento de minas esgotadas', () => {
  it('mina de ouro esgotada desaba, emite RESOURCE_DEPLETED, é removida da lista e libera colisão/grade', () => {
    const gm = makeGm();
    const deposit = gm.resourceDeposits.find((d) => d.type === 'gold');
    expect(deposit).toBeTruthy();
    expect(deposit.isDead).toBe(false);

    const pos = { x: deposit.mesh.position.x, z: deposit.mesh.position.z };

    // Mina está no blockerGrid e em resourceDeposits
    expect(gm.resourceDeposits).toContain(deposit);
    expect(gm.blockerGrid.nearest(pos.x, pos.z, 5)).toBe(deposit);

    // Seleciona a mina
    gm.selectedResource = deposit;

    // Coloca 1 trabalhador na fila
    const worker = gm.spawnUnit('villager', pos.x, pos.y, 0);
    deposit.queue.push(worker);

    // Esgota a mina
    deposit.resourcesRemaining = 0;

    let depletedEvent = null;
    gm.events.on(EVT.RESOURCE_DEPLETED, (e) => { depletedEvent = e; });

    // Roda um passo de simulação para o GameManager limpar entidades mortas/esgotadas
    gm.simStep(SIM_DT);
    gm.events.flush();

    // 1. A mina agora está morta e descartada
    expect(deposit.isDead).toBe(true);
    expect(deposit.isDisposed).toBe(true);

    // 2. Foi removida de gm.resourceDeposits
    expect(gm.resourceDeposits).not.toContain(deposit);

    // 3. Foi removida do blockerGrid (não bloqueia mais o terreno)
    expect(gm.blockerGrid.nearest(pos.x, pos.z, 1)).toBeNull();

    // 4. Seleção foi limpa (card de inspeção fecha)
    expect(gm.selectedResource).toBeNull();

    // 5. Trabalhador na fila foi ejetado e está visível
    expect(deposit.queue.length).toBe(0);
    expect(worker.mesh.visible).toBe(true);

    // 6. EVT.RESOURCE_DEPLETED foi emitido com o tipo e posição da mina
    expect(depletedEvent).toBeTruthy();
    expect(depletedEvent.resourceType).toBe('gold');
    expect(depletedEvent.pos.x).toBeCloseTo(pos.x, 2);
  });

  it('pedreira de pedra esgotada desaba e é removida da simulação', () => {
    const gm = makeGm();
    const deposit = gm.resourceDeposits.find((d) => d.type === 'stone');
    expect(deposit).toBeTruthy();

    const initialCount = gm.resourceDeposits.length;
    deposit.resourcesRemaining = 0;

    gm.simStep(SIM_DT);

    expect(deposit.isDead).toBe(true);
    expect(gm.resourceDeposits.length).toBe(initialCount - 1);
    expect(gm.resourceDeposits).not.toContain(deposit);
  });

  it('evento RESOURCE_DEPLETED gera efeito sonoro de collapse (desabamento) para minas', () => {
    const pos = { x: 10, y: 0, z: 20 };
    const ctx = { own: true, visible: true };

    const goldSfx = soundsForEvent(EVT.RESOURCE_DEPLETED, { pos, resourceType: 'gold' }, ctx);
    expect(goldSfx.length).toBeGreaterThan(0);
    expect(goldSfx[0].sfx).toBe('collapse');

    const stoneSfx = soundsForEvent(EVT.RESOURCE_DEPLETED, { pos, resourceType: 'stone' }, ctx);
    expect(stoneSfx.length).toBeGreaterThan(0);
    expect(stoneSfx[0].sfx).toBe('collapse');

    // Árvores não tocam collapse aqui (tocam treeFall em WORKER_CHOP)
    const woodSfx = soundsForEvent(EVT.RESOURCE_DEPLETED, { pos, resourceType: 'wood' }, ctx);
    expect(woodSfx.length).toBe(0);
  });

  it('evento RESOURCE_DEPLETED gera efeito visual building_collapse para minas', () => {
    const pos = { x: 15, y: 0, z: 25 };

    const goldVfx = effectsForEvent(EVT.RESOURCE_DEPLETED, { pos, resourceType: 'gold' }, { radius: 3.4 });
    expect(goldVfx.length).toBe(1);
    expect(goldVfx[0].fx).toBe('building_collapse');
    expect(goldVfx[0].radius).toBe(3.4);

    const stoneVfx = effectsForEvent(EVT.RESOURCE_DEPLETED, { pos, resourceType: 'stone' }, { radius: 3.0 });
    expect(stoneVfx.length).toBe(1);
    expect(stoneVfx[0].fx).toBe('building_collapse');

    // Madeira não gera building_collapse
    const woodVfx = effectsForEvent(EVT.RESOURCE_DEPLETED, { pos, resourceType: 'wood' }, {});
    expect(woodVfx.length).toBe(0);
  });
});
