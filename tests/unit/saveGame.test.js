import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { CMD } from '../../src/sim/commands.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { captureSave, serializeSave, parseSave, restoreSync, humanCommands, SAVE_VERSION } from '../../src/sim/SaveGame.js';
import { EventBus } from '../../src/sim/EventBus.js';
import { CommandQueue } from '../../src/sim/CommandQueue.js';
import { SaveStore, createMemoryBackend } from '../../src/core/SaveStore.js';

/**
 * F2-06 — round-trip: salvar no minuto 5 (6000 ticks), recarregar numa partida nova e continuar
 * produz exatamente o mesmo estado (checksums a cada 20 ticks) que a partida que nunca parou.
 * O "jogador humano" é um script de comandos fixos (a IA joga sozinha o resto).
 */
function newGm(seed = 7) {
  const scene = new THREE.Scene();
  const terrain = new Terrain();
  return new GameManager(terrain, null, null, createMatchConfig({ seed, headless: true }));
}

/** Script do jogador local: depende só do estado e do tick (reprodutível em qualquer instância). */
function humanScript(gm) {
  const t = gm.currentTick;
  const me = gm.localPlayerId;
  const mine = gm.getUnitsOf(me);
  const ids = mine.map(u => u.id);
  const hq = gm.buildings.find(b => b.ownerId === me && (b.type === 'castle' || b.type === 'great_hall'));
  const worker = mine.find(u => u.type === 'villager' || u.type === 'peon');
  if (t === 20) gm.issue({ type: CMD.MOVE, playerId: me, unitIds: ids, x: hq.mesh.position.x + 8, z: hq.mesh.position.z + 8 });
  if (t === 200 && worker) gm.issue({ type: CMD.TRAIN, playerId: me, buildingId: hq.id, unitType: worker.type });
  if (t === 400 && worker) gm.issue({ type: CMD.GATHER, playerId: me, unitIds: [worker.id], targetId: gm.trees[0].id, queued: true });
  if (t === 3000) gm.issue({ type: CMD.ATTACK_MOVE, playerId: me, unitIds: ids, x: 0, z: 0 });
  if (t === 6200) gm.issue({ type: CMD.STOP, playerId: me, unitIds: gm.getUnitsOf(me).map(u => u.id) });
}

function run(gm, untilTick) {
  while (gm.currentTick < untilTick) {
    humanScript(gm);
    gm.simStep(SIM_DT);
  }
}

const hashesAfter = (gm, tick) => gm.checksums.filter(c => c.tick > tick).map(c => `${c.tick}:${c.hash}`);

describe('save/load (F2-06)', () => {
  const SAVE_TICK = 6000; // minuto 5

  it('salvar no minuto 5, carregar e continuar = mesma partida (checksum idêntico)', () => {
    const a = newGm();
    run(a, SAVE_TICK);
    const save = parseSave(serializeSave(captureSave(a, { name: 'teste' })));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.tick).toBe(SAVE_TICK);
    expect(save.commands.length).toBeGreaterThan(0);
    expect(save.commands.every(c => c.playerId === 0)).toBe(true); // só humano; a IA se regenera
    expect(serializeSave(save).length).toBeLessThan(20000); // JSON compacto

    run(a, SAVE_TICK + 1000);

    // restaura numa partida nova criada a partir da config do save
    const scene = new THREE.Scene();
    const gm = new GameManager(new Terrain(), null, null, { ...save.config, headless: true });
    const res = restoreSync(gm, save);
    expect(res.ok).toBe(true);
    expect(stateChecksum(gm)).toBe(save.checksum);
    expect(gm.currentTick).toBe(SAVE_TICK);

    run(gm, SAVE_TICK + 1000);
    expect(hashesAfter(gm, SAVE_TICK)).toEqual(hashesAfter(a, SAVE_TICK));
    expect(stateChecksum(gm)).toBe(stateChecksum(a));
  }, 120000);

  it('um save feito de uma partida restaurada reproduz de novo (encadeamento)', () => {
    const a = newGm(11);
    run(a, 1500);
    const s1 = captureSave(a);
    const scene = new THREE.Scene();
    const b = new GameManager(new Terrain(), null, null, { ...s1.config, headless: true });
    expect(restoreSync(b, s1).ok).toBe(true);
    run(b, 2500);
    const s2 = captureSave(b);
    expect(s2.commands.length).toBeGreaterThanOrEqual(s1.commands.length);
    const scene2 = new THREE.Scene();
    const c = new GameManager(new Terrain(), null, null, { ...s2.config, headless: true });
    expect(restoreSync(c, s2).ok).toBe(true);
  }, 60000);

  it('comandos da IA não entram no log do save', () => {
    const a = newGm(3);
    run(a, 1200);
    const all = a.commands.log.length;
    const human = humanCommands(a).length;
    expect(all).toBeGreaterThan(human); // a IA emitiu comandos próprios
    expect(human).toBeGreaterThan(0);
  }, 30000);

  it('detecta divergência (checksum diferente) e rejeita saves inválidos', () => {
    const a = newGm(5);
    run(a, 400);
    const save = captureSave(a);
    const scene = new THREE.Scene();
    const gm = new GameManager(new Terrain(), null, null, { ...save.config, headless: true });
    expect(restoreSync(gm, { ...save, checksum: save.checksum ^ 1 }).ok).toBe(false);
    expect(() => parseSave('{não é json')).toThrow(/corrompido/);
    expect(() => parseSave({ ...save, version: 999 })).toThrow(/incompatível/);
    expect(() => parseSave({ ...save, commands: [{ type: 'x', playerId: 0, tick: 1 }] })).toThrow(/inválido/);
  }, 30000);

  it('SaveStore: grava, lista (mais novo primeiro), lê e remove slots', async () => {
    const store = new SaveStore(createMemoryBackend());
    const a = newGm(2);
    run(a, 100);
    await store.put('slot1', captureSave(a, { name: 'um', now: 1000 }));
    run(a, 200);
    await store.put('slot2', captureSave(a, { name: 'dois', now: 2000 }));
    expect((await store.list()).map(s => s.slot)).toEqual(['slot2', 'slot1']);
    const back = await store.get('slot2');
    expect(back.tick).toBe(200);
    expect(await store.get('slot3')).toBeNull();
    await store.remove('slot1');
    expect((await store.list()).length).toBe(1);
  }, 30000);

  it('EventBus.presentationMuted silencia só ouvintes de apresentação', () => {
    const bus = new EventBus();
    const calls = [];
    bus.on('x', () => calls.push('sim'));
    bus.on('x', () => calls.push('vfx'), true);
    bus.presentationMuted = true;
    bus.emit('x', { a: 1 });
    bus.flush();
    expect(calls).toEqual(['sim']);
    bus.presentationMuted = false;
    bus.emit('x', { a: 2 });
    bus.flush();
    expect(calls).toEqual(['sim', 'sim', 'vfx']);
  });

  it('CommandQueue.pending lista os comandos agendados por tick/seqNo', () => {
    const q = new CommandQueue();
    q.enqueue({ type: 'stop', playerId: 0, unitIds: [], tick: 5 });
    q.enqueue({ type: 'stop', playerId: 0, unitIds: [], tick: 3 });
    expect(q.pending().map(c => c.tick)).toEqual([3, 5]);
    q.drain(3);
    expect(q.pending().map(c => c.tick)).toEqual([5]);
  });
});
