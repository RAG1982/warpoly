import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/sim/EventBus.js';
import { EVT } from '../../src/sim/events.js';
import { PlayerRegistry } from '../../src/sim/PlayerRegistry.js';
import { Player } from '../../src/sim/Player.js';
import { MatchStats, computeScore } from '../../src/sim/MatchStats.js';

/** gm falso: só o contrato mínimo de MatchStats. Jogadores 0 e 2 são aliados (time 0); 1 é inimigo. */
function fake() {
  const events = new EventBus();
  const playerRegistry = new PlayerRegistry([
    { id: 0, team: 0 },
    { id: 1, team: 1 },
    { id: 2, team: 0 }
  ]);
  const gm = { events, playerRegistry, gameTime: 0, allUnits: [], buildings: [], matchConfig: { victoryMode: 'conquest' } };
  const stats = new MatchStats(gm);
  const emit = (t, p) => { events.emit(t, p); events.flush(); };
  return { gm, stats, emit, events };
}
const P = { x: 0, y: 0, z: 0 };
const me = (s, id) => s.snapshot().players.find(p => p.id === id);

describe('MatchStats (F3-09)', () => {
  it('conta treino, construção, coleta e gasto', () => {
    const { stats, emit } = fake();
    emit(EVT.UNIT_TRAINED, { unitId: 1, ownerId: 0, pos: P, unitType: 'x' });
    emit(EVT.BUILDING_COMPLETED, { buildingId: 2, ownerId: 0, pos: P, buildingType: 'house' });
    emit(EVT.RESOURCE_GATHERED, { type: 'gold', amount: 10, pos: P, ownerId: 0 });
    emit(EVT.RESOURCE_GATHERED, { type: 'wood', amount: 5, pos: P, ownerId: 0 });
    emit(EVT.RESOURCES_SPENT, { ownerId: 0, cost: { gold: 30, wood: 20, stone: 0 } });
    const p = me(stats, 0);
    expect(p.unitsTrained).toBe(1);
    expect(p.buildingsBuilt).toBe(1);
    expect(p.resources).toEqual({ gold: 10, wood: 5, stone: 0 });
    expect(p.spent).toEqual({ gold: 30, wood: 20, stone: 0 });
  });

  it('kills: com killer hostil conta; sem killer, aliado e neutro não contam', () => {
    const { stats, emit } = fake();
    emit(EVT.UNIT_DIED, { unitId: 1, ownerId: 1, pos: P, unitType: 'x', killerOwnerId: 0 });
    emit(EVT.UNIT_DIED, { unitId: 2, ownerId: 1, pos: P, unitType: 'x', killerOwnerId: null });
    emit(EVT.UNIT_DIED, { unitId: 3, ownerId: 1, pos: P, unitType: 'x' });
    emit(EVT.UNIT_DIED, { unitId: 4, ownerId: 2, pos: P, unitType: 'x', killerOwnerId: 0 }); // aliado
    emit(EVT.UNIT_DIED, { unitId: 5, ownerId: 0, pos: P, unitType: 'x', killerOwnerId: -1 }); // neutro
    emit(EVT.BUILDING_DESTROYED, { buildingId: 6, ownerId: 1, pos: P, buildingType: 'house', killerOwnerId: 0 });
    emit(EVT.BUILDING_DESTROYED, { buildingId: 7, ownerId: 1, pos: P, buildingType: 'house', killerOwnerId: null });
    const a = me(stats, 0);
    const e = me(stats, 1);
    expect(a.unitsKilled).toBe(1);
    expect(a.buildingsDestroyed).toBe(1);
    expect(a.unitsLost).toBe(1);
    expect(e.unitsLost).toBe(3);
    expect(e.buildingsLost).toBe(2);
    expect(me(stats, 2).unitsKilled).toBe(0);
  });

  it('computeScore', () => {
    const s = { unitsKilled: 3, buildingsDestroyed: 2, resources: { gold: 100, wood: 50, stone: 50 } };
    expect(computeScore(s)).toBe(30 + 40 + 20);
  });

  it('série a cada 10 s simulados e teto de 720 pontos', () => {
    const { gm, stats } = fake();
    gm.gameTime = 9.9;
    stats.update(gm.gameTime);
    expect(stats.series.length).toBe(0);
    gm.gameTime = 10;
    stats.update(gm.gameTime);
    gm.gameTime = 35;
    stats.update(gm.gameTime);
    expect(stats.series.map(s => s.t)).toEqual([10, 20, 30]);
    stats.update(1e6);
    expect(stats.series.length).toBe(720);
    expect(stats.series[0].players[0]).toEqual({ gold: 0, wood: 0, stone: 0, units: 0, buildings: 0, kills: 0 });
  });

  it('APM = comandos / minutos e snapshot serializável', () => {
    const { gm, stats } = fake();
    for (let i = 0; i < 120; i++) stats.countCommand(0);
    gm.gameTime = 120;
    const snap = stats.snapshot();
    expect(snap.players[0].apm).toBe(60);
    expect(snap.players[1].apm).toBe(0);
    expect(snap.elapsed).toBe(120);
    expect(snap.mode).toBe('conquest');
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('Player.deduct emite RESOURCES_SPENT quando há barramento', () => {
    const events = new EventBus();
    const got = [];
    events.on(EVT.RESOURCES_SPENT, e => got.push(e));
    const p = new Player({ id: 0, resources: { gold: 100, wood: 100, stone: 100 } });
    p.deduct({ gold: 5 }); // sem barramento: silencioso
    p.events = events;
    p.deduct({ gold: 10, wood: 3, time: 40 });
    events.flush();
    expect(got).toHaveLength(1);
    expect(got[0].cost).toEqual({ gold: 10, wood: 3, stone: 0 });
  });
});
