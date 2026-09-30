import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { EVT } from '../../src/sim/events.js';
import { CARRY, MINE_ENTER_TIME, MINE_SLOTS } from '../../src/data/index.js';

/**
 * economy-mine.test.js — F3-04: mina/pedreira como gargalo (1 ou 2 dentro por vez, fila
 * determinística por ordem de chegada), carga por viagem (`CARRY`) e evento único de
 * esgotamento (`RESOURCE_DEPLETED`). Testes headless (`GameManager` + `Terrain` reais, sem
 * DOM/WebGL — `ModelFactory.headless`), sem passar pelo `CommandExecutor`/pathfinder: as
 * unidades são criadas já em contato com a jazida e recebem a ordem direto via
 * `Unit.orderGather`.
 */
function makeGm(seed = 7) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  return new GameManager(scene, terrain, null, null, cfg);
}

function tick(gm, workers, n = 1) {
  for (let i = 0; i < n; i++) {
    workers.forEach(w => w.update(SIM_DT, gm, gm.arrows, gm.allUnits, gm.buildings));
  }
}

function spawnWorkersAt(gm, deposit, count) {
  const { x, z } = deposit.mesh.position;
  return Array.from({ length: count }, () => gm.spawnUnit('villager', x, z, 0));
}

describe('F3-04: mina/pedreira com fila (ResourceDeposit + Unit)', () => {
  it('mina de ouro: só 1 trabalhador dentro por vez, fila por ordem de chegada, 10 de ouro por viagem', () => {
    const gm = makeGm();
    const deposit = gm.resourceDeposits.find(d => d.type === 'gold');
    expect(deposit).toBeTruthy();
    expect(deposit.slots).toBe(MINE_SLOTS.gold);

    const workers = spawnWorkersAt(gm, deposit, 3);
    workers.forEach(w => w.orderGather(deposit));

    // Contato imediato (spawn na posição da mina) → todos tentam entrar; só 1 consegue.
    tick(gm, workers, 3);

    expect(workers.filter(w => w.state === 'insideMine').length).toBe(1);
    expect(deposit.inside.length).toBe(1);
    expect(deposit.queue.length).toBe(2);
    expect(deposit.inside[0]).toBe(workers[0]); // ordem de chegada: o 1º a pedir entra 1º

    // Avança até o primeiro completar MINE_ENTER_TIME e sair com a carga.
    const ticksToExit = Math.ceil(MINE_ENTER_TIME / SIM_DT) + 2;
    tick(gm, workers, ticksToExit);

    expect(workers[0].state).toBe('returning');
    expect(workers[0].carrying.type).toBe('gold');
    expect(workers[0].carrying.amount).toBe(CARRY.gold);
    expect(workers[0].mesh.visible).toBe(true);

    // Slot liberado: o próximo da fila (ordem de chegada) entra.
    expect(deposit.inside.length).toBe(1);
    expect(deposit.inside[0]).toBe(workers[1]);
    expect(deposit.queue).toEqual([workers[2]]);
  });

  it('pedreira: aceita 2 trabalhadores simultâneos e entrega 8 de pedra por viagem', () => {
    const gm = makeGm();
    const deposit = gm.resourceDeposits.find(d => d.type === 'stone');
    expect(deposit).toBeTruthy();
    expect(deposit.slots).toBe(MINE_SLOTS.stone);

    const workers = spawnWorkersAt(gm, deposit, 3);
    workers.forEach(w => w.orderGather(deposit));

    tick(gm, workers, 3);
    expect(deposit.inside.length).toBe(2);
    expect(deposit.queue.length).toBe(1);

    const ticksToExit = Math.ceil(MINE_ENTER_TIME / SIM_DT) + 2;
    tick(gm, workers, ticksToExit);

    const returned = workers.filter(w => w.state === 'returning');
    expect(returned.length).toBe(2);
    returned.forEach(w => {
      expect(w.carrying.type).toBe('stone');
      expect(w.carrying.amount).toBe(CARRY.stone);
    });
  });

  it('esgotamento emite RESOURCE_DEPLETED uma única vez', () => {
    const gm = makeGm();
    const deposit = gm.resourceDeposits.find(d => d.type === 'gold');
    deposit.resourcesRemaining = CARRY.gold; // exatamente 1 viagem até esgotar

    const worker = spawnWorkersAt(gm, deposit, 1)[0];
    worker.orderGather(deposit);

    let depletedCount = 0;
    const payloads = [];
    gm.events.on(EVT.RESOURCE_DEPLETED, (payload) => {
      depletedCount++;
      payloads.push(payload);
    });

    const ticks = Math.ceil(MINE_ENTER_TIME / SIM_DT) + 5;
    for (let i = 0; i < ticks; i++) {
      worker.update(SIM_DT, gm, gm.arrows, gm.allUnits, gm.buildings);
      gm.events.flush();
    }

    expect(deposit.resourcesRemaining).toBe(0);
    expect(depletedCount).toBe(1);
    expect(payloads[0].resourceType).toBe('gold');
    expect(worker.carrying.amount).toBe(CARRY.gold);
  });
});
