import { describe, it, expect, vi } from 'vitest';
import { CommandExecutor } from '../../src/sim/CommandExecutor.js';
import { CommandQueue } from '../../src/sim/CommandQueue.js';
import { CMD, makeCommand } from '../../src/sim/commands.js';
import { Building } from '../../src/entities/Building.js';
import { PlayerRegistry } from '../../src/sim/PlayerRegistry.js';

/** gm headless mínimo: só `entitiesById` (+ o que cada teste precisar). */
function makeGm(entities = []) {
  const entitiesById = new Map();
  for (const e of entities) entitiesById.set(e.id, e);
  return { entitiesById, pathfinder: null, buildings: [] };
}

/** Unidade fake (sem three.js): só os métodos que `CommandExecutor` chama, como spies. */
function fakeUnit(id, ownerId, extra = {}) {
  return {
    id,
    ownerId,
    isDead: false,
    orderQueue: null,
    runQueuedOrder: vi.fn(),
    orderAttack: vi.fn(),
    orderPatrol: vi.fn(),
    stop: vi.fn(),
    hold: vi.fn(),
    ...extra
  };
}

describe('CommandExecutor (F2-02): autoria e resolução de ids', () => {
  it('comando de outro jogador é ignorado (unidade não é do playerId do comando)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unit = fakeUnit(1, 0); // pertence ao jogador 0
    const gm = makeGm([unit]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.STOP, playerId: 1, unitIds: [1], tick: 0 }));
    expect(unit.stop).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unidade morta é ignorada mesmo pertencendo ao dono certo', () => {
    const unit = fakeUnit(1, 0, { isDead: true });
    const gm = makeGm([unit]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.STOP, playerId: 0, unitIds: [1], tick: 0 }));
    expect(unit.stop).not.toHaveBeenCalled();
  });

  it('id inexistente é ignorado silenciosamente (sem lançar)', () => {
    const gm = makeGm([]);
    expect(() =>
      CommandExecutor.execute(gm, makeCommand({ type: CMD.STOP, playerId: 0, unitIds: [999], tick: 0 }))
    ).not.toThrow();
  });

  it('ATTACK com alvo morto é descartado', () => {
    const unit = fakeUnit(1, 0);
    const target = { id: 2, isDead: true };
    const gm = makeGm([unit, target]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.ATTACK, playerId: 0, unitIds: [1], targetId: 2, tick: 0 }));
    expect(unit.orderAttack).not.toHaveBeenCalled();
  });

  it('ATTACK válido chama orderAttack e limpa orderQueue', () => {
    const unit = fakeUnit(1, 0, { orderQueue: [{ type: CMD.MOVE, x: 1, z: 1 }] });
    const target = { id: 2, isDead: false };
    const gm = makeGm([unit, target]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.ATTACK, playerId: 0, unitIds: [1], targetId: 2, tick: 0 }));
    expect(unit.orderAttack).toHaveBeenCalledWith(target);
    expect(unit.orderQueue).toBeNull();
  });

  it('STOP chama stop() e limpa orderQueue', () => {
    const unit = fakeUnit(1, 0, { orderQueue: [{ type: CMD.MOVE, x: 1, z: 1 }] });
    const gm = makeGm([unit]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.STOP, playerId: 0, unitIds: [1], tick: 0 }));
    expect(unit.stop).toHaveBeenCalledTimes(1);
    expect(unit.orderQueue).toBeNull();
  });

  it('HOLD chama hold() e limpa orderQueue', () => {
    const unit = fakeUnit(1, 0, { orderQueue: [{ type: CMD.MOVE, x: 1, z: 1 }] });
    const gm = makeGm([unit]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.HOLD, playerId: 0, unitIds: [1], tick: 0 }));
    expect(unit.hold).toHaveBeenCalledTimes(1);
    expect(unit.orderQueue).toBeNull();
  });

  it('MOVE com várias unidades calcula formação (destinos diferentes por unidade)', () => {
    const u1 = fakeUnit(1, 0);
    const u2 = fakeUnit(2, 0);
    const gm = makeGm([u1, u2]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.MOVE, playerId: 0, unitIds: [1, 2], x: 10, z: 10, tick: 0 }));
    expect(u1.runQueuedOrder).toHaveBeenCalledTimes(1);
    expect(u2.runQueuedOrder).toHaveBeenCalledTimes(1);
    const order1 = u1.runQueuedOrder.mock.calls[0][0];
    const order2 = u2.runQueuedOrder.mock.calls[0][0];
    expect(order1.type).toBe(CMD.MOVE);
    expect(order1).not.toEqual(order2); // offsets de formação diferentes
  });

  it('MOVE com queued:true empilha em orderQueue em vez de executar imediatamente', () => {
    const unit = fakeUnit(1, 0);
    const gm = makeGm([unit]);
    CommandExecutor.execute(
      gm,
      makeCommand({ type: CMD.MOVE, playerId: 0, unitIds: [1], x: 5, z: 5, queued: true, tick: 0 })
    );
    expect(unit.runQueuedOrder).not.toHaveBeenCalled();
    expect(unit.orderQueue).toHaveLength(1);
    expect(unit.orderQueue[0].type).toBe(CMD.MOVE);
  });

  it('TRAIN sem recursos do dono é descartado (queueUnit real de Building)', () => {
    const registry = new PlayerRegistry([
      { id: 0, team: 0, isLocal: true, resources: { wood: 0, gold: 0, stone: 0 } }
    ]);
    registry.getPlayer(0).maxPopulation = 20;
    const building = Object.assign(Object.create(Building.prototype), {
      id: 5,
      type: 'barracks',
      ownerId: 0,
      queue: [],
      isDead: false,
      gameManager: null
    });
    const gm = makeGm([building]);
    gm.getPlayer = (id) => registry.getPlayer(id);
    gm.buildings = [building];

    CommandExecutor.execute(gm, makeCommand({ type: CMD.TRAIN, playerId: 0, buildingId: 5, unitType: 'knight', tick: 0 }));
    expect(building.queue).toHaveLength(0);
  });

  it('TRAIN de construção de outro dono é descartado', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const building = Object.assign(Object.create(Building.prototype), {
      id: 5,
      type: 'barracks',
      ownerId: 1,
      queue: [],
      isDead: false,
      queueUnit: vi.fn()
    });
    const gm = makeGm([building]);
    CommandExecutor.execute(gm, makeCommand({ type: CMD.TRAIN, playerId: 0, buildingId: 5, unitType: 'knight', tick: 0 }));
    expect(building.queueUnit).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Replay determinístico (F2-02)', () => {
  it('reaplicar o log de comandos num gm novo (mesmo estado inicial) produz a mesma sequência de chamadas', () => {
    const makeUnits = () => [fakeUnit(1, 0), fakeUnit(2, 0)];

    const queue = new CommandQueue();
    queue.enqueue(makeCommand({ type: CMD.MOVE, playerId: 0, unitIds: [1, 2], x: 3, z: 4, tick: 0 }));
    queue.enqueue(makeCommand({ type: CMD.STOP, playerId: 0, unitIds: [1], tick: 1 }));
    queue.enqueue(makeCommand({ type: CMD.HOLD, playerId: 0, unitIds: [2], tick: 1 }));

    // "Sessão original": drena tick a tick e executa num gm.
    const unitsA = makeUnits();
    const gmA = makeGm(unitsA);
    for (const tick of [0, 1, 2]) {
      for (const cmd of queue.drain(tick)) CommandExecutor.execute(gmA, cmd);
    }

    // "Replay": mesmo log, num gm novo com o mesmo estado inicial (unidades novas, mesmos ids).
    const unitsB = makeUnits();
    const gmB = makeGm(unitsB);
    for (const cmd of queue.log) CommandExecutor.execute(gmB, cmd);

    const callSummary = (units) =>
      units.map((u) => ({
        runQueuedOrder: u.runQueuedOrder.mock.calls.map((c) => JSON.stringify(c[0])),
        stop: u.stop.mock.calls.length,
        hold: u.hold.mock.calls.length
      }));

    expect(callSummary(unitsB)).toEqual(callSummary(unitsA));
  });
});
