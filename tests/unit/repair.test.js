import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { CMD, validateCommand } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { repairCostFor, cancelRefundFor } from '../../src/sim/repair.js';
import { getBuildingDef } from '../../src/data/index.js';

function makeGm(seed = 7, keepAi = false) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);
  if (!keepAi) {
    gm.aiDirectors.forEach(d => d.dispose?.());
    gm.aiDirectors = [];
    gm.aiDirector = null;
  }
  const p = gm.getPlayer(0);
  p.resources.gold = 5000; p.resources.wood = 5000; p.resources.stone = 5000;
  return gm;
}

function freeSpot(gm, type, ownerId = 0) {
  const base = gm.getPlayer(ownerId).startPos;
  for (let dz = -40; dz <= 40; dz += 4) {
    for (let dx = -40; dx <= 40; dx += 4) {
      if (gm.canPlaceBuilding(type, base.x + dx, base.z + dz, null, ownerId)) return { x: base.x + dx, z: base.z + dz };
    }
  }
  throw new Error('sem espaço');
}

function workersAround(gm, b, n, ownerId = 0) {
  const p = b.mesh.position;
  const r = b.collisionRadius + 1.2;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return gm.spawnUnit(ownerId === 0 ? 'villager' : 'peon', p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, ownerId);
  });
}

function tick(gm, n) { for (let i = 0; i < n; i++) gm.simStep(SIM_DT); }

function addTower(gm, ownerId = 0, done = true) {
  const spot = freeSpot(gm, 'watchtower', ownerId);
  const t = gm.createBuilding('watchtower', spot.x, spot.z, done, ownerId);
  gm.buildings.push(t);
  return t;
}

describe('funções puras (F3-05)', () => {
  const def = { hp: 200, cost: { gold: 0, wood: 100, stone: 41 } };
  it('repairCostFor', () => {
    expect(repairCostFor(def, 0)).toEqual({ gold: 0, wood: 0, stone: 0 });
    expect(repairCostFor(def, 200)).toEqual({ gold: 0, wood: 50, stone: 21 }); // ceil(20,5)
    expect(repairCostFor(def, 10).wood).toBe(3); // ceil(2,5)
  });
  it('cancelRefundFor = floor(75 %)', () => {
    expect(cancelRefundFor({ gold: 0, wood: 10, stone: 25 })).toEqual({ gold: 0, wood: 7, stone: 18 });
  });
  it('comandos novos validam campos', () => {
    expect(validateCommand({ type: CMD.REPAIR, playerId: 0, unitIds: [1] }).ok).toBe(false);
    expect(validateCommand({ type: CMD.REPAIR, playerId: 0, unitIds: [1], buildingId: 2 }).ok).toBe(true);
    expect(validateCommand({ type: CMD.CANCEL_CONSTRUCTION, playerId: 0 }).ok).toBe(false);
    expect(validateCommand({ type: CMD.CANCEL_CONSTRUCTION, playerId: 0, buildingId: 2 }).ok).toBe(true);
  });
});

describe('reparo (F3-05)', () => {
  it('restaura 5 % por golpe, cobra por golpe e para no PV máximo', () => {
    const gm = makeGm();
    const tower = addTower(gm);
    tower.hp = tower.maxHp * 0.5;
    const [w] = workersAround(gm, tower, 1);
    const res0 = { ...gm.getPlayer(0).resources };
    gm.issue({ type: CMD.REPAIR, playerId: 0, unitIds: [w.id], buildingId: tower.id });
    tick(gm, 20);
    expect(w.state).toBe('repairing');
    expect(tower.hp).toBeGreaterThan(tower.maxHp * 0.5);
    tick(gm, 20 * 30);
    expect(tower.hp).toBe(tower.maxHp);
    expect(w.state).toBe('idle');
    const res1 = gm.getPlayer(0).resources;
    const spent = (res0.wood - res1.wood) + (res0.stone - res1.stone) + (res0.gold - res1.gold);
    const def = getBuildingDef('watchtower');
    const full = repairCostFor({ hp: tower.maxHp, cost: def.cost }, tower.maxHp * 0.5);
    expect(spent).toBeGreaterThanOrEqual(full.gold + full.wood + full.stone);
  });

  it('para sem recursos e avisa o dono local', () => {
    const gm = makeGm();
    const tower = addTower(gm);
    tower.hp = tower.maxHp * 0.5;
    const p = gm.getPlayer(0);
    p.resources.gold = 0; p.resources.wood = 0; p.resources.stone = 0;
    const msgs = [];
    gm.events.on(EVT.NOTIFY, e => msgs.push(e.text));
    const [w] = workersAround(gm, tower, 1);
    gm.issue({ type: CMD.REPAIR, playerId: 0, unitIds: [w.id], buildingId: tower.id });
    tick(gm, 60);
    gm.events.flush();
    expect(w.state).toBe('idle');
    expect(tower.hp).toBe(tower.maxHp * 0.5);
    expect(msgs.some(t => t.includes('Recursos insuficientes para reparar'))).toBe(true);
  });

  it('2 trabalhadores reparam ~2x a taxa de 1', () => {
    const rate = (n) => {
      const gm = makeGm();
      const tower = addTower(gm);
      tower.hp = tower.maxHp * 0.2;
      const ws = workersAround(gm, tower, n);
      gm.issue({ type: CMD.REPAIR, playerId: 0, unitIds: ws.map(w => w.id), buildingId: tower.id });
      tick(gm, 20 * 6);
      return tower.hp - tower.maxHp * 0.2;
    };
    const r1 = rate(1);
    const r2 = rate(2);
    expect(r2 / r1).toBeGreaterThan(1.6);
    expect(r2 / r1).toBeLessThan(2.4);
  });

  it('5º trabalhador é recusado (máx. 4 por construção)', () => {
    const gm = makeGm();
    const tower = addTower(gm);
    tower.hp = tower.maxHp * 0.2;
    const ws = workersAround(gm, tower, 5);
    gm.issue({ type: CMD.REPAIR, playerId: 0, unitIds: ws.map(w => w.id), buildingId: tower.id });
    tick(gm, 2);
    expect(ws.filter(w => w.state === 'repairing').length).toBe(4);
    expect(ws[4].state).toBe('idle');
    expect(tower.workerCount).toBe(4);
  });

  it('comando de outro dono é ignorado', () => {
    const gm = makeGm();
    const tower = addTower(gm);
    tower.hp = tower.maxHp * 0.5;
    const [w] = workersAround(gm, tower, 1, 1);
    gm.issue({ type: CMD.REPAIR, playerId: 1, unitIds: [w.id], buildingId: tower.id });
    tick(gm, 40);
    expect(tower.hp).toBe(tower.maxHp * 0.5);
  });

  it('muralha também pode ser reparada', () => {
    const gm = makeGm();
    const spot = freeSpot(gm, 'wall_human');
    const wall = gm.createBuilding('wall_human', spot.x, spot.z, true, 0);
    gm.buildings.push(wall);
    wall.hp = wall.maxHp * 0.5;
    const [w] = workersAround(gm, wall, 1);
    gm.issue({ type: CMD.REPAIR, playerId: 0, unitIds: [w.id], buildingId: wall.id });
    tick(gm, 20 * 5);
    expect(wall.hp).toBeGreaterThan(wall.maxHp * 0.5);
  });
});

describe('obra: PV, cooperação e cancelamento (F3-05)', () => {
  it('PV da obra sobe com o progresso', () => {
    const gm = makeGm();
    const b = addTower(gm, 0, false);
    expect(b.hp).toBeCloseTo(b.maxHp * 0.1, 0);
    b.construct(50, gm);
    expect(b.hp).toBeCloseTo(b.maxHp * 0.55, 0);
    b.construct(50, gm);
    expect(b.isConstructed).toBe(true);
    expect(b.hp).toBeCloseTo(b.maxHp, 5);
  });

  it('obra cooperativa é linear: 4 trabalhadores ~4x mais rápido que 1', () => {
    const progress = (n) => {
      const gm = makeGm();
      const b = addTower(gm, 0, false);
      const ws = workersAround(gm, b, n);
      gm.issue({ type: CMD.BUILD, playerId: 0, unitIds: ws.map(w => w.id), buildingId: b.id });
      tick(gm, 44);
      return b.buildProgress;
    };
    const p1 = progress(1);
    const p4 = progress(4);
    expect(p4 / p1).toBeGreaterThanOrEqual(2.5);
    expect(p4 / p1).toBeLessThan(4.5);
  });

  it('CANCEL_CONSTRUCTION devolve 75 %, libera pop/bloqueio, para trabalhadores e emite evento', () => {
    const gm = makeGm();
    const spot = freeSpot(gm, 'cottage');
    const b = gm.placeBuilding('cottage', spot.x, spot.z, [], 0);
    expect(b).toBeTruthy();
    const afterPay = { ...gm.getPlayer(0).resources };
    const cost = getBuildingDef('cottage').cost;
    const [w] = workersAround(gm, b, 1);
    gm.issue({ type: CMD.BUILD, playerId: 0, unitIds: [w.id], buildingId: b.id });
    tick(gm, 5);
    expect(w.state).toBe('building');
    const events = [];
    const destroyed = [];
    gm.events.on(EVT.BUILDING_CANCELLED, e => events.push(e));
    gm.events.on(EVT.BUILDING_DESTROYED, e => destroyed.push(e));
    gm.issue({ type: CMD.CANCEL_CONSTRUCTION, playerId: 0, buildingId: b.id });
    tick(gm, 3);
    gm.events.flush();
    const res = gm.getPlayer(0).resources;
    const refund = cancelRefundFor(cost);
    expect(res.wood - afterPay.wood).toBe(refund.wood);
    expect(res.gold - afterPay.gold).toBe(refund.gold);
    expect(b.isDead).toBe(true);
    expect(gm.buildings.includes(b)).toBe(false);
    expect(w.state).toBe('idle');
    expect(events.length).toBe(1);
    expect(events[0].buildingId).toBe(b.id);
    expect(destroyed.length).toBe(0);
    // o local volta a ser construível
    expect(gm.canPlaceBuilding('cottage', spot.x, spot.z, null, 0)).toBe(true);
  });

  it('cancelar construção concluída é ignorado; comando de outro dono também', () => {
    const gm = makeGm();
    const done = addTower(gm);
    gm.issue({ type: CMD.CANCEL_CONSTRUCTION, playerId: 0, buildingId: done.id });
    tick(gm, 2);
    expect(done.isDead).toBeFalsy();

    const spot2 = freeSpot(gm, 'cottage');
    const wip = gm.placeBuilding('cottage', spot2.x, spot2.z, [], 0);
    gm.issue({ type: CMD.CANCEL_CONSTRUCTION, playerId: 1, buildingId: wip.id });
    tick(gm, 2);
    expect(wip.isDead).toBeFalsy();
  });
});

describe('IA repara (F3-05)', () => {
  it('trabalhador ocioso da IA repara construção com PV < 70 %', () => {
    const gm = makeGm(7, true);
    const dir = gm.aiDirectors[0];
    const pid = dir.playerId;
    const tower = addTower(gm, pid);
    tower.hp = tower.maxHp * 0.4;
    tower.underAttackTimer = 0;
    const p = gm.getPlayer(pid);
    p.resources.gold = 3000; p.resources.wood = 3000; p.resources.stone = 3000;
    workersAround(gm, tower, 1, pid);
    dir.economyManager.considerRepair();
    tick(gm, 2);
    expect(gm.countWorkersOn(tower)).toBeGreaterThanOrEqual(1);
    tick(gm, 20 * 25);
    expect(tower.hp).toBeGreaterThan(tower.maxHp * 0.4);
  });
});
