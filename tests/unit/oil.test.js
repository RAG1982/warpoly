import { describe, it, expect } from 'vitest';
import { Player } from '../../src/sim/Player.js';
import { validateOilWells } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { missingRequirements } from '../../src/sim/requirements.js';
import { isPlatformOk } from './helpers/oilHelpers.js';
import { makeNavalGm, run, build, hqOf, coastSpots } from './helpers/navalWorld.js';
import { getMap } from '../../src/data/maps/index.js';
import { getBuildingDef, getUnitDef, getCost, isDropoffFor, UNIT_TRAIN_CONFIG, HQ_UPGRADE_COST, FACTIONS } from '../../src/data/index.js';
import { MatchStats } from '../../src/sim/MatchStats.js';

/**
 * oil.test.js — F4-07a: o 4º recurso (petróleo): Player, poço só em água, plataforma, petroleiro extrai e entrega na Refinaria,
 * o Centro não aceita óleo, poço esgota, Centro nível 3 cobra 200 de petróleo, D1 (nada de petróleo sem Centro nível 2).
 */

/** Prepara o jogador 0 (humano): Centro nível 2, recursos fartos, Refinaria + Estaleiro na costa do canal e 1 petroleiro no cais. */
function setup({ tier = 2 } = {}) {
  const gm = makeNavalGm();
  hqOf(gm, 0).tier = tier;
  const P = gm.getPlayer(0);
  Object.assign(P.resources, { gold: 8000, wood: 8000, stone: 8000 });
  const well = gm.resourceDeposits.find((d) => d.type === 'oil' && d.mesh.position.z < 0);
  const near = (s) => Math.hypot(s.x - well.mesh.position.x, s.z - well.mesh.position.z);
  const refSpot = coastSpots(gm, 'refinery', -1, 40).sort((a, b) => near(a) - near(b))[0];
  const yardSpot = coastSpots(gm, 'shipyard', -1, 40)
    .sort((a, b) => Math.hypot(a.x - refSpot.x, a.z - refSpot.z) - Math.hypot(b.x - refSpot.x, b.z - refSpot.z))
    .find((s) => Math.hypot(s.x - refSpot.x, s.z - refSpot.z) > 9);
  const yard = build(gm, 'shipyard', 0, yardSpot.x, yardSpot.z);
  const refinery = build(gm, 'refinery', 0, refSpot.x, refSpot.z);
  const dock = gm.getDockPoint(yard);
  const tanker = gm.spawnUnit('tanker', dock.x, dock.z, 0);
  return { gm, P, well, yard, refinery, tanker };
}

function buildPlatform(gm, tanker, well) {
  gm.issue({ type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [tanker.id] });
  gm.simStep(0.05);
  const plat = gm.buildings.find((b) => b.type === 'oil_platform');
  for (let s = 0; plat && !plat.isConstructed && s < 120; s++) run(gm, 1);
  return plat;
}

describe('petróleo no Player (F4-07a)', () => {
  it('RESOURCE: oil começa em 0; canAfford/deduct/add e reembolso consideram petróleo', () => {
    const p = new Player({ id: 0 });
    expect(p.resources.oil).toBe(0);
    expect(p.canAfford({ gold: 10, oil: 1 })).toBe(false);
    p.add('oil', 120);
    expect(p.canAfford({ oil: 120 })).toBe(true);
    p.deduct({ gold: 10, oil: 50, time: 3 });
    expect(p.resources.oil).toBe(70);
    p.add({ oil: 50, gold: 10 });
    expect(p.resources.oil).toBe(120);
  });

  it('custos {oil} e MatchStats (resources.oil / spent.oil)', () => {
    expect(getCost('tanker')).toEqual({ gold: 100, wood: 60 });
    const p = new Player({ id: 0 });
    const events = new (class { constructor() { this.l = new Map(); } on(t, f) { (this.l.get(t) || this.l.set(t, []).get(t)).push(f); return () => {}; } emit(t, e) { (this.l.get(t) || []).forEach((f) => f(e)); } })();
    p.events = events;
    const stats = new MatchStats({ events, playerRegistry: { players: [p], isHostile: () => true, getPlayer: () => p, aliveTeams: () => new Set([0]) }, gameTime: 0 });
    p.add('oil', 200);
    events.emit(EVT.RESOURCE_GATHERED, { ownerId: 0, type: 'oil', amount: 100 });
    p.deduct({ oil: 40 });
    expect(stats._get(0).resources.oil).toBe(100);
    expect(stats._get(0).spent.oil).toBe(40);
  });
});

describe('poços de petróleo no mapa (F4-07a)', () => {
  it('validateOilWells: poço em terra/fora da área jogável é rejeitado; em água aceito', () => {
    const base = getMap('estreito-1v1');
    const ok = { ...base, resources: [{ type: 'oil', x: 0, z: -26, amount: 5000 }] };
    expect(() => validateOilWells(ok)).not.toThrow();
    expect(() => validateOilWells({ ...base, resources: [{ type: 'oil', x: -34, z: -16 }] })).toThrow(/água/);
    expect(() => validateOilWells({ ...base, resources: [{ type: 'oil', x: 0, z: -90 }] })).toThrow(/jazida|jogável/);
    expect(() => validateOilWells({ ...base, resources: [{ type: 'oil', x: 0, z: -26, amount: 0 }] })).toThrow(/amount/);
  });

  it('o poço vira ResourceDeposit oil (5000), em água, sem bloquear a grade terrestre; bloqueia a naval', () => {
    const gm = makeNavalGm();
    const wells = gm.resourceDeposits.filter((d) => d.type === 'oil');
    expect(wells.length).toBe(2);
    for (const w of wells) {
      expect(w.resourcesRemaining).toBe(5000);
      expect(w.platform).toBeNull();
      expect(gm.terrain.getHeight(w.mesh.position.x, w.mesh.position.z)).toBeLessThan(0.5);
      expect(gm.navalPathfinder.isWalkableWorld(w.mesh.position.x, w.mesh.position.z)).toBe(false); // bloqueio naval
    }
    expect(wells[0].mesh.position.z).toBe(-wells[1].mesh.position.z); // simétrico
  });
});

describe('plataforma e petroleiro (F4-07a)', () => {
  it('dados: Petroleiro (naval, 180 PV, não ataca, carga 100) e Plataforma (500 PV, role platform, Centro 2)', () => {
    const t = getUnitDef('tanker');
    expect(t).toMatchObject({ layer: 'naval', hp: 180, speed: 5.0, armor: 0, collisionRadius: 1.2, visionRadius: 16, trainTime: 12, isWorker: false, isTanker: true, carryCapacity: 100 });
    expect(t.cost).toEqual({ gold: 100, wood: 60, stone: 0 });
    expect(t.requires).toEqual([{ hq: 2 }]);
    expect(t.damage).toEqual({ basic: 0, piercing: 0, type: 'normal' });
    const pl = getBuildingDef('oil_platform');
    expect(pl).toMatchObject({ role: 'platform', hp: 500, armor: 10 });
    expect(pl.cost).toEqual({ gold: 180, wood: 60, stone: 0 });
    expect(pl.requires).toEqual([{ hq: 2 }]);
    expect(UNIT_TRAIN_CONFIG.tanker).toBeTruthy();
  });

  it('D1: sem Centro nível 2 nada de petróleo — Estaleiro, Refinaria, Plataforma e Petroleiro exigem {hq:2}', () => {
    const gm = makeNavalGm();
    for (const t of ['shipyard', 'refinery', 'ship_dock', 'ash_cauldron', 'oil_platform']) {
      expect(JSON.stringify(getBuildingDef(t).requires), t).toContain('"hq":2');
    }
    expect(JSON.stringify(getUnitDef('tanker').requires)).toContain('"hq":2');
    expect(missingRequirements(0, 'oil_platform', gm).length).toBe(1); // Centro nível 1
    hqOf(gm, 0).tier = 2;
    expect(missingRequirements(0, 'oil_platform', gm)).toEqual([]);
    expect(FACTIONS.human.buildList).toContain('shipyard');
    expect(FACTIONS.orc.buildList).toContain('ship_dock');
  });

  it('plataforma recusada com Centro nível 1 (nada cobrado) e aceita só sobre poço livre, com petroleiro', () => {
    const { gm, P, well, tanker } = setup({ tier: 1 });
    const gold = P.resources.gold;
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [tanker.id] });
    gm.simStep(0.05);
    expect(gm.buildings.some((b) => b.type === 'oil_platform')).toBe(false);
    expect(P.resources.gold).toBe(gold);
    hqOf(gm, 0).tier = 2;
    // fora de qualquer poço: inválido
    expect(gm.canPlaceBuilding('oil_platform', 20, -40)).toBe(false);
    expect(gm.canPlaceBuilding('oil_platform', -34, -16)).toBe(false); // em terra
    expect(gm.canPlaceBuilding('oil_platform', well.mesh.position.x, well.mesh.position.z)).toBe(true);
    const plat = buildPlatform(gm, tanker, well);
    expect(plat).toBeTruthy();
    expect(P.resources.gold).toBe(gold - 180);
    expect(plat.isConstructed).toBe(true);
    expect(well.platform).toBe(plat);
    // só uma plataforma por poço
    expect(gm.canPlaceBuilding('oil_platform', well.mesh.position.x, well.mesh.position.z)).toBe(false);
    expect(isPlatformOk(gm, well)).toBe(true);
  });

  it('sem petroleiro não há quem erga a plataforma (nada cobrado)', () => {
    const { gm, P, well, tanker } = setup();
    tanker.die();
    tanker.deathDuration = 0;
    run(gm, 0.2);
    const gold = P.resources.gold;
    gm.issue({ type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [] });
    gm.simStep(0.05);
    expect(gm.buildings.some((b) => b.type === 'oil_platform')).toBe(false);
    expect(P.resources.gold).toBe(gold);
  });

  it('o petroleiro extrai e entrega na Refinaria (EVT.RESOURCE_GATHERED oil, ~100 por viagem); o poço diminui', () => {
    const { gm, P, well, tanker } = setup();
    const plat = buildPlatform(gm, tanker, well);
    expect(plat.isConstructed).toBe(true);
    const got = [];
    gm.events.on(EVT.RESOURCE_GATHERED, (e) => { if (e.type === 'oil') got.push(e.amount); });
    gm.issue({ type: CMD.GATHER, playerId: 0, unitIds: [tanker.id], targetId: well.id });
    run(gm, 60);
    gm.events.flush();
    expect(got.length).toBeGreaterThanOrEqual(3);
    expect(got.every((a) => a === 100)).toBe(true);
    expect(P.resources.oil).toBe(got.reduce((a, b) => a + b, 0));
    expect(well.resourcesRemaining).toBe(5000 - P.resources.oil - tanker.carrying.amount);
  });

  it('o Centro NÃO aceita petróleo; só a Refinaria (sem Refinaria o petroleiro cheio para com aviso)', () => {
    expect(isDropoffFor('castle', 'oil')).toBe(false);
    expect(isDropoffFor('great_hall', 'oil')).toBe(false);
    expect(isDropoffFor('refinery', 'oil')).toBe(true);
    expect(isDropoffFor('ash_cauldron', 'oil')).toBe(true);
    expect(isDropoffFor('refinery', 'gold')).toBe(false);
    expect(isDropoffFor('castle', 'gold')).toBe(true);
    expect(isDropoffFor('castle', null)).toBe(true); // "aceita tudo" segue valendo para ouro/madeira/pedra
    const { gm, P, well, tanker, refinery } = setup();
    const plat = buildPlatform(gm, tanker, well);
    expect(plat.isConstructed).toBe(true);
    refinery.isDead = true; // sem Refinaria
    gm.simStep(0.05);
    const msgs = [];
    gm.events.on(EVT.NOTIFY, (e) => msgs.push(e.text));
    gm.issue({ type: CMD.GATHER, playerId: 0, unitIds: [tanker.id], targetId: well.id });
    run(gm, 40);
    gm.events.flush();
    expect(P.resources.oil).toBe(0);
    expect(tanker.carrying.amount).toBe(100);
    expect(tanker.state).toBe('idle');
    expect(msgs.some((m) => m.includes('Sem Refinaria'))).toBe(true);
  });

  it('o poço esgota (RESOURCE_DEPLETED) e a plataforma permanece como construção', () => {
    const { gm, P, well, tanker } = setup();
    const plat = buildPlatform(gm, tanker, well);
    well.resourcesRemaining = 150;
    const depleted = [];
    gm.events.on(EVT.RESOURCE_DEPLETED, (e) => depleted.push(e));
    gm.issue({ type: CMD.GATHER, playerId: 0, unitIds: [tanker.id], targetId: well.id });
    run(gm, 60);
    gm.events.flush();
    expect(P.resources.oil).toBe(150);
    expect(well.resourcesRemaining).toBe(0);
    expect(depleted.length).toBe(1);
    expect(depleted[0].resourceType).toBe('oil');
    expect(plat.isDead).toBe(false);
    expect(gm.buildings).toContain(plat);
    expect(tanker.state).toBe('idle');
  });

  it('plataforma destruída libera o poço; só o dono da plataforma coleta', () => {
    const { gm, well, tanker } = setup();
    const plat = buildPlatform(gm, tanker, well);
    expect(gm.platformReady(well, 0)).toBe(true);
    expect(gm.platformReady(well, 1)).toBe(false);
    // petroleiro inimigo não coleta
    const enemy = gm.spawnUnit('tanker', 0, -40, 1);
    enemy.orderGather(well);
    expect(enemy.state).not.toBe('gathering');
    plat.takeDamage(99999, null);
    run(gm, 0.2);
    expect(plat.isDead).toBe(true);
    expect(well.platform).toBeNull();
    expect(gm.canPlaceBuilding('oil_platform', well.mesh.position.x, well.mesh.position.z)).toBe(true);
  });
});

describe('Centro nível 3 cobra petróleo (F4-07a; resolve o pendente NEW-24 da F3-06)', () => {
  it('em mapa com poços: UPGRADE_HQ nível 3 cobra 133 de petróleo (e sem 133 não evolui)', () => {
    expect(HQ_UPGRADE_COST[3].oil).toBe(133);
    const gm = makeNavalGm();
    const hq = hqOf(gm, 0);
    hq.tier = 2;
    const P = gm.getPlayer(0);
    Object.assign(P.resources, { gold: 5000, wood: 5000, stone: 5000, oil: 132 });
    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(0.05);
    expect(hq.tierUpgrade).toBeNull();
    expect(P.resources.gold).toBe(5000);
    P.resources.oil = 260;
    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(0.05);
    expect(hq.tierUpgrade).toBeTruthy();
    expect(P.resources.oil).toBe(127);
    expect(P.resources.gold).toBe(3667);
    // cancelar devolve o petróleo
    gm.issue({ type: CMD.CANCEL_UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(0.05);
    expect(P.resources.oil).toBe(260);
  });

  it('em mapa SEM poços o petróleo é dispensado (senão o nível 3 seria inalcançável)', () => {
    const gm = makeNavalGm({ mapId: 'continental-1v1' });
    expect(gm.hasOilWells).toBe(false);
    expect(gm.hqUpgradeCost(3).oil).toBeUndefined();
    const hq = hqOf(gm, 0);
    hq.tier = 2;
    Object.assign(gm.getPlayer(0).resources, { gold: 5000, wood: 5000, stone: 5000 });
    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(0.05);
    expect(hq.tierUpgrade).toBeTruthy();
  });
});
