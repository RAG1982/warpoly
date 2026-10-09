import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { Player, RESOURCE_TYPES } from '../../src/sim/Player.js';
import { ResourceDeposit } from '../../src/sim/ResourceDeposit.js';
import { EventBus } from '../../src/sim/EventBus.js';
import { EVT } from '../../src/sim/events.js';
import { UNIT_TRAIN_CONFIG } from '../../src/data/index.js';
import { missingUnitRequirements } from '../../src/sim/requirements.js';
import { SIM_DT } from '../../src/sim/constants.js';

/** F10-01 — economia: Player (custo/reembolso), jazidas, fila de treino (custos, pop, requisitos). */

function makeGm(seed = 3) {
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}

function addBuilding(gm, type, dx, dz, ownerId = 0) {
  const pos = gm.getPlayer(ownerId).startPos;
  const b = gm.createBuilding(type, pos.x + dx, pos.z + dz, true, ownerId);
  gm.buildings.push(b);
  return b;
}

describe('Player: economia', () => {
  it('canAfford exige TODOS os recursos do custo; custo nulo/vazio é sempre pagável', () => {
    const p = new Player({ id: 0, resources: { wood: 10, gold: 10, stone: 0 } });
    expect(p.canAfford({ gold: 10, wood: 10 })).toBe(true);
    expect(p.canAfford({ gold: 10, wood: 11 })).toBe(false);
    expect(p.canAfford({ gold: 1, stone: 1 })).toBe(false);
    expect(p.canAfford({ oil: 1 })).toBe(false); // petróleo inicia em 0
    expect(p.canAfford(null)).toBe(true);
    expect(p.canAfford({})).toBe(true);
  });

  it('deduct debita só o que o custo cita e emite RESOURCES_SPENT com o custo normalizado', () => {
    const p = new Player({ id: 2, resources: { wood: 100, gold: 100, stone: 100 } });
    p.events = new EventBus();
    const seen = [];
    p.events.on(EVT.RESOURCES_SPENT, e => seen.push(e));
    p.deduct({ gold: 30, wood: 5 });
    expect(seen).toEqual([]); // eventos só saem no flush (nunca durante o passo)
    p.events.flush();
    expect(p.resources).toMatchObject({ gold: 70, wood: 95, stone: 100, oil: 0 });
    expect(seen).toEqual([{ ownerId: 2, cost: { gold: 30, wood: 5, stone: 0, oil: 0 } }]);
  });

  it('add aceita (tipo, quantidade) e objeto de custo; tipo desconhecido é ignorado', () => {
    const p = new Player({ id: 0, resources: { wood: 0, gold: 0, stone: 0 } });
    p.add('gold', 10);
    p.addResource('wood', 4);
    p.add({ gold: 5, stone: 2, oil: 1 });
    p.add('mithril', 99);
    expect(p.resources).toEqual({ wood: 4, gold: 15, stone: 2, oil: 1 });
    expect(Object.keys(p.resources).sort()).toEqual([...RESOURCE_TYPES].sort());
  });

  it('deduzir e depois adicionar o mesmo custo restitui o saldo (reembolso integral)', () => {
    const p = new Player({ id: 0, resources: { wood: 50, gold: 80, stone: 7 } });
    const before = { ...p.resources };
    const cost = { gold: 40, wood: 20, stone: 5 };
    p.deduct(cost);
    p.add(cost);
    expect(p.resources).toEqual(before);
  });

  it('níveis de pesquisa: setResearchLevel mantém researchedUpgrades derivado', () => {
    const p = new Player({ id: 0 });
    expect(p.getResearchLevel('melee_weapons')).toBe(0);
    p.setResearchLevel('melee_weapons', 1);
    p.setResearchLevel('melee_weapons', 2);
    expect(p.getResearchLevel('melee_weapons')).toBe(2);
    expect(p.researchedUpgrades.has('melee_weapons')).toBe(true);
    p.setResearchLevel('x', 0);
    expect(p.researchedUpgrades.has('x')).toBe(false);
  });

  it('Player sem id numérico lança', () => {
    expect(() => new Player({ id: 'a' })).toThrow();
  });
});

describe('ResourceDeposit (jazidas)', () => {
  const terrain = { getHeight: () => 0 };

  it('mine devolve no máximo o restante e sinaliza o esgotamento uma única vez', () => {
    const d = new ResourceDeposit(terrain, 'gold', 0, 0, 25);
    expect(d.mine(10)).toBe(10);
    expect(d.resourcesRemaining).toBe(15);
    expect(d.consumeDepletedFlag()).toBe(false);
    expect(d.mine(100)).toBe(15);
    expect(d.resourcesRemaining).toBe(0);
    expect(d.consumeDepletedFlag()).toBe(true);
    expect(d.consumeDepletedFlag()).toBe(false);
    expect(d.mine(5)).toBe(0);
    expect(d.consumeDepletedFlag()).toBe(false);
  });

  it('padrões de quantidade por tipo', () => {
    expect(new ResourceDeposit(terrain, 'gold', 0, 0).maxResources).toBe(2500);
    expect(new ResourceDeposit(terrain, 'oil', 0, 0).maxResources).toBe(5000);
  });

  it('vagas dentro da mina: excedente espera em fila FIFO e entra ao liberar', () => {
    const d = new ResourceDeposit(terrain, 'gold', 0, 0);
    const workers = Array.from({ length: d.slots + 2 }, (_, i) => ({ id: i }));
    const results = workers.map(w => d.requestEnter(w));
    expect(results.filter(Boolean)).toHaveLength(d.slots);
    expect(d.queue).toEqual(workers.slice(d.slots));
    expect(d.requestEnter(workers[0])).toBe(true); // já dentro
    expect(d.requestEnter(workers[d.slots])).toBe(false); // ainda na fila, sem duplicar
    expect(d.queue).toHaveLength(2);
    d.release(workers[0]);
    expect(d.requestEnter(workers[d.slots + 1])).toBe(true); // furou a fila? entra pois há vaga
    expect(d.queue).toEqual([workers[d.slots]]);
  });
});

describe('Building.queueUnit / cancelQueuedUnit (custos, população, requisitos)', () => {
  it('treino válido debita exatamente o custo e enfileira; cancelar reembolsa integral', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.maxPopulation = 50;
    owner.population = 0;
    const cost = UNIT_TRAIN_CONFIG.villager.cost;
    owner.resources.gold = 1000; owner.resources.wood = 1000; owner.resources.stone = 1000;
    const before = { ...owner.resources };

    expect(hq.queueUnit('villager', gm)).toBe(true);
    expect(hq.queue).toHaveLength(1);
    expect(owner.resources.gold).toBe(before.gold - (cost.gold || 0));
    expect(owner.resources.wood).toBe(before.wood - (cost.wood || 0));

    expect(hq.cancelQueuedUnit(0, gm)).toBe(true);
    expect(hq.queue).toHaveLength(0);
    expect(owner.resources).toEqual(before);
  });

  it('cancelar índice inválido não mexe na fila nem nos recursos', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.maxPopulation = 50;
    hq.queueUnit('villager', gm);
    const res = { ...owner.resources };
    expect(hq.cancelQueuedUnit(5, gm)).toBe(false);
    expect(hq.cancelQueuedUnit(-1, gm)).toBe(false);
    expect(hq.queue).toHaveLength(1);
    expect(owner.resources).toEqual(res);
  });

  it('sem recursos: recusa e não debita nada', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.maxPopulation = 50;
    owner.resources.gold = 0; owner.resources.wood = 0; owner.resources.stone = 0;
    expect(hq.queueUnit('villager', gm)).toBe(false);
    expect(hq.queue).toHaveLength(0);
    expect(owner.resources).toMatchObject({ gold: 0, wood: 0, stone: 0 });
  });

  it('teto de população conta as unidades já em filas de TODAS as construções', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.resources.gold = 9999; owner.resources.wood = 9999; owner.resources.stone = 9999;
    owner.population = 10;
    owner.maxPopulation = 12;
    expect(hq.queueUnit('villager', gm)).toBe(true); // 10 + 0 < 12
    expect(hq.queueUnit('villager', gm)).toBe(true); // 10 + 1 < 12
    const gold = owner.resources.gold;
    expect(hq.queueUnit('villager', gm)).toBe(false); // 10 + 2 >= 12
    expect(owner.resources.gold).toBe(gold);
    expect(hq.queue).toHaveLength(2);
  });

  it('fila máxima de 6 itens', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.resources.gold = 9999; owner.resources.wood = 9999; owner.resources.stone = 9999;
    owner.maxPopulation = 100;
    for (let i = 0; i < 6; i++) expect(hq.queueUnit('villager', gm)).toBe(true);
    expect(hq.queueUnit('villager', gm)).toBe(false);
    expect(hq.queue).toHaveLength(6);
  });

  it('Centro só treina trabalhadores; Quartel não treina trabalhador', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.resources.gold = 9999; owner.resources.wood = 9999; owner.resources.stone = 9999;
    owner.maxPopulation = 100;
    addBuilding(gm, 'farm', 10, 10);
    const barracks = addBuilding(gm, 'barracks', 20, 20);
    expect(hq.queueUnit('knight', gm)).toBe(false);
    expect(barracks.queueUnit('villager', gm)).toBe(false);
  });

  it('requisito {hq:2}: Estábulo não treina Cavaleiro com Centro nível 1 (sem debitar); com nível 2 treina', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 9999; owner.resources.wood = 9999; owner.resources.stone = 9999;
    owner.maxPopulation = 100;
    owner.population = 0;
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const stable = addBuilding(gm, 'stable', 20, 20); // createBuilding não valida requisitos de obra
    const res = { ...owner.resources };
    expect(missingUnitRequirements(0, 'cavalier', gm)).toEqual([{ hq: 2 }]);
    expect(stable.queueUnit('cavalier', gm)).toBe(false);
    expect(owner.resources).toEqual(res);
    hq.tier = 2;
    expect(missingUnitRequirements(0, 'cavalier', gm)).toEqual([]);
    expect(stable.queueUnit('cavalier', gm)).toBe(true);
    expect(owner.resources.gold).toBe(res.gold - UNIT_TRAIN_CONFIG.cavalier.cost.gold);
  });

  it('unidade de outra facção não é treinável no Quartel humano (sem debitar)', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 9999; owner.resources.wood = 9999; owner.resources.stone = 9999;
    owner.maxPopulation = 100;
    const barracks = addBuilding(gm, 'barracks', 20, 20);
    const res = { ...owner.resources };
    expect(barracks.queueUnit('grunt', gm)).toBe(false);
    expect(owner.resources).toEqual(res);
    expect(barracks.queueUnit('knight', gm)).toBe(true);
  });

  it('construção em obra não treina', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 9999; owner.resources.wood = 9999; owner.resources.stone = 9999;
    owner.maxPopulation = 100;
    const pos = owner.startPos;
    const b = gm.createBuilding('barracks', pos.x + 20, pos.z + 20, false, 0);
    gm.buildings.push(b);
    const res = { ...owner.resources };
    expect(b.queueUnit('knight', gm)).toBe(false);
    expect(owner.resources).toEqual(res);
  });

  it('o treino progride com o tempo e, ao concluir, entrega a unidade e libera a fila', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const owner = gm.getPlayer(0);
    owner.maxPopulation = 50;
    const n0 = gm.allUnits.filter(u => u.ownerId === 0 && !u.isDead).length;
    expect(hq.queueUnit('villager', gm)).toBe(true);
    const ticks = Math.ceil(hq.queue[0].totalTime / SIM_DT) + 40;
    for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT);
    expect(hq.queue).toHaveLength(0);
    expect(gm.allUnits.filter(u => u.ownerId === 0 && !u.isDead).length).toBe(n0 + 1);
  });
});
