import { describe, it, expect } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import pen1 from '../../src/data/maps/pendentes/dois-continentes-1.json';
import { makeMapGm, run, build, hqOf, spotsNear } from './helpers/navalWorld.js';

/**
 * oilFlow.test.js — ENG-NAVAL: economia do petróleo do ponto de vista do jogador, nas DUAS facções, num mapa de dois continentes
 * (`pendentes/dois-continentes-1`: poços no canal, 30–40 u das bases). Tudo por `gm.issue` (TRAIN, PLACE_BUILDING, GATHER).
 */
const FACTIONS = [
  { name: 'humano', id: 0, yard: 'shipyard', refinery: 'refinery', near: { x: -36, z: 16 } },
  { name: 'orc', id: 1, yard: 'ship_dock', refinery: 'ash_cauldron', near: { x: 32, z: 6 } }
];

function setup(f) {
  const gm = makeMapGm(pen1);
  hqOf(gm, f.id).tier = 2;
  Object.assign(gm.getPlayer(f.id).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 0 });
  const well = gm.resourceDeposits.filter((d) => d.type === 'oil').sort((a, b) => Math.hypot(a.mesh.position.x - f.near.x, a.mesh.position.z - f.near.z) - Math.hypot(b.mesh.position.x - f.near.x, b.mesh.position.z - f.near.z))[0];
  build(gm, f.id === 0 ? 'barracks' : 'orc_barracks', f.id, hqOf(gm, f.id).mesh.position.x + (f.id === 0 ? 10 : -10), hqOf(gm, f.id).mesh.position.z + 14);
  const wp = well.mesh.position;
  const [ys] = spotsNear(gm, f.yard, wp.x, wp.z, 1);
  const yard = build(gm, f.yard, f.id, ys.x, ys.z);
  const rs = spotsNear(gm, f.refinery, wp.x, wp.z, 3, 8).find((s) => Math.hypot(s.x - ys.x, s.z - ys.z) > 9);
  const refinery = build(gm, f.refinery, f.id, rs.x, rs.z);
  return { gm, P: gm.getPlayer(f.id), well, yard, refinery };
}

describe.each(FACTIONS)('petróleo de ponta a ponta — $name', (f) => {
  it('treina o petroleiro no estaleiro, ergue a plataforma no poço, coleta e entrega à refinaria; o contador de óleo sobe', () => {
    const { gm, P, well, yard, refinery } = setup(f);
    gm.issue({ type: CMD.TRAIN, playerId: f.id, buildingId: yard.id, unitType: 'tanker' });
    gm.simStep(0.05);
    expect(yard.queue.length).toBeGreaterThan(0);
    run(gm, 14);
    const tanker = gm.allUnits.find((u) => u.type === 'tanker' && u.ownerId === f.id);
    expect(tanker, 'petroleiro treinado').toBeTruthy();
    expect(gm.terrain.getHeight(tanker.mesh.position.x, tanker.mesh.position.z)).toBeLessThan(0.2);
    // plataforma
    const gold0 = P.resources.gold;
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: f.id, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [tanker.id] });
    run(gm, 60);
    expect(well.platform && well.platform.isConstructed, 'plataforma pronta').toBe(true);
    expect(P.resources.gold).toBe(gold0 - 180);
    expect(well.platform.ownerId).toBe(f.id);
    // coleta
    const got = [];
    gm.events.on(EVT.RESOURCE_GATHERED, (e) => { if (e.type === 'oil') got.push(e.amount); });
    gm.issue({ type: CMD.GATHER, playerId: f.id, unitIds: [tanker.id], targetId: well.id });
    run(gm, 90);
    gm.events.flush();
    expect(got.length).toBeGreaterThanOrEqual(3);
    expect(P.resources.oil).toBeGreaterThanOrEqual(300);
    expect(refinery.isDead).toBe(false);
  });

  it('2 petroleiros na mesma plataforma não se travam: a produção sobe com o 2º', () => {
    const one = (() => {
      const { gm, P, well } = setup(f);
      const t = gm.spawnUnit('tanker', well.mesh.position.x + 6, well.mesh.position.z, f.id);
      gm.issue({ type: CMD.PLACE_BUILDING, playerId: f.id, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [t.id] });
      run(gm, 60);
      gm.issue({ type: CMD.GATHER, playerId: f.id, unitIds: [t.id], targetId: well.id });
      run(gm, 100);
      return P.resources.oil;
    })();
    const { gm, P, well } = setup(f);
    const a = gm.spawnUnit('tanker', well.mesh.position.x + 6, well.mesh.position.z, f.id);
    const b = gm.spawnUnit('tanker', well.mesh.position.x + 6, well.mesh.position.z + 4, f.id);
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: f.id, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [a.id, b.id] });
    run(gm, 60);
    gm.issue({ type: CMD.GATHER, playerId: f.id, unitIds: [a.id, b.id], targetId: well.id });
    run(gm, 100);
    expect(P.resources.oil).toBeGreaterThan(one * 1.4);
  });

  it('refinaria destruída com o tanque cheio: avisa e para; ao erguer outra, o petroleiro volta a entregar', () => {
    const { gm, P, well, refinery } = setup(f);
    const t = gm.spawnUnit('tanker', well.mesh.position.x + 6, well.mesh.position.z, f.id);
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: f.id, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [t.id] });
    run(gm, 60);
    refinery.takeDamage(99999, null);
    run(gm, 1);
    gm.issue({ type: CMD.GATHER, playerId: f.id, unitIds: [t.id], targetId: well.id });
    run(gm, 20);
    expect(P.resources.oil).toBe(0);
    expect(t.carrying.amount).toBe(100);
    const wp = well.mesh.position;
    const rs = spotsNear(gm, f.refinery, wp.x, wp.z, 1)[0];
    build(gm, f.refinery, f.id, rs.x, rs.z);
    gm.issue({ type: CMD.GATHER, playerId: f.id, unitIds: [t.id], targetId: well.id });
    run(gm, 40);
    expect(P.resources.oil).toBeGreaterThanOrEqual(100);
  });
});
