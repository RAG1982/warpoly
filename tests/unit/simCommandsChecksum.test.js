import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD, validateCommand, makeCommand } from '../../src/sim/commands.js';
import { CommandQueue } from '../../src/sim/CommandQueue.js';
import { stateChecksum, stateChecksumDetail } from '../../src/sim/checksum.js';
import { SIM_DT } from '../../src/sim/constants.js';

/** F10-01 — comandos inválidos, ordem de execução e checksum (sensibilidade/estabilidade). */

function makeGm(seed = 5) {
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}
const step = (gm, n = 1) => { for (let i = 0; i < n; i++) gm.simStep(SIM_DT); };
const arena = gm => { const p = gm.getPlayer(0).startPos; return { x: p.x - 6, z: p.z - 26 }; };

describe('comandos inválidos', () => {
  it('validateCommand rejeita: não-objeto, tipo desconhecido, playerId não numérico, campo faltando', () => {
    for (const bad of [null, undefined, 'move', 5]) expect(validateCommand(bad).ok).toBe(false);
    expect(validateCommand({ type: 'teleport', playerId: 0 }).ok).toBe(false);
    expect(validateCommand({ type: CMD.STOP, playerId: '0', unitIds: [] }).ok).toBe(false);
    const r = validateCommand({ type: CMD.MOVE, playerId: 0, unitIds: [1], x: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("'z'");
  });

  it('makeCommand devolve objeto congelado (imutável após criado)', () => {
    const c = makeCommand({ type: CMD.STOP, playerId: 0, unitIds: [1] });
    expect(Object.isFrozen(c)).toBe(true);
    expect(() => { 'use strict'; c.playerId = 9; }).toThrow();
  });

  it('gm.issue de comando malformado lança e não enfileira nada', () => {
    const gm = makeGm();
    const before = gm.commands.pending().length;
    expect(() => gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [1] })).toThrow(/obrigat/);
    expect(() => gm.issue({ type: 'xyz', playerId: 0 })).toThrow();
    expect(gm.commands.pending().length).toBe(before);
  });

  it('PLACE_WALL: pontos demais ou formato errado são rejeitados', () => {
    expect(validateCommand({ type: CMD.PLACE_WALL, playerId: 0, buildingType: 'wall_human', unitIds: [], points: [] }).ok).toBe(false);
    expect(validateCommand({ type: CMD.PLACE_WALL, playerId: 0, buildingType: 'wall_human', unitIds: [], points: [{ x: 1 }] }).ok).toBe(false);
    expect(validateCommand({ type: CMD.PLACE_WALL, playerId: 0, buildingType: 'wall_human', unitIds: [], points: [{ x: 1, z: 2 }] }).ok).toBe(true);
  });

  it('comando válido na forma mas inválido no jogo é ignorado sem mudar o estado (checksum igual)', () => {
    const gm = makeGm();
    const a = arena(gm);
    const mine = gm.spawnUnit('knight', a.x, a.z, 0);
    const hq1 = gm.buildings.find(b => b.ownerId === 1);
    gm.getPlayer(0).resources.gold = 0;
    gm.getPlayer(0).resources.wood = 0;
    gm.getPlayer(0).resources.stone = 0;
    step(gm, 1);
    const unitHash = () => stateChecksumDetail(gm, true).units.find(p => p[0] === mine.id)[1];
    const before = { unit: unitHash(), buildings: stateChecksumDetail(gm).parts.buildings };
    const bCount = gm.buildings.length;
    const origWarn = console.warn; console.warn = () => {};
    try {
      // jogador 1 tentando mandar unidade do jogador 0; treino em construção alheia; unidade inexistente
      gm.issue({ type: CMD.MOVE, playerId: 1, unitIds: [mine.id], x: a.x + 10, z: a.z });
      gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: hq1.id, unitType: 'villager' });
      gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [987654], x: 1, z: 1 });
      gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: 987654, unitType: 'villager' });
      // sem recursos
      const hq0 = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
      gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: hq0.id, unitType: 'villager' });
      gm.issue({ type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'barracks', x: a.x, z: a.z, unitIds: [mine.id] });
    } finally { console.warn = origWarn; }
    const tickBefore = gm.currentTick;
    step(gm, 1);
    expect(gm.currentTick).toBe(tickBefore + 1);
    expect(mine.state).toBe('idle');
    expect(gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle').queue).toHaveLength(0);
    // a unidade alvo dos comandos recusados, as construções e o ouro do jogador 0 seguem idênticos
    // (as demais unidades — operários ociosos da partida — podem se mover legitimamente)
    expect(unitHash()).toBe(before.unit);
    expect(stateChecksumDetail(gm).parts.buildings).toBe(before.buildings);
    expect(gm.buildings.length).toBe(bCount);
    expect(gm.getPlayer(0).resources.gold).toBe(0);
  });
});

describe('ordem de execução estável', () => {
  it('CommandQueue: mesmo tick ordena por (playerId, seqNo), independe da ordem de chegada', () => {
    const q = new CommandQueue();
    const mk = (playerId, tag) => makeCommand({ type: CMD.STOP, playerId, unitIds: [tag], tick: 7 });
    q.enqueue(mk(2, 1)); q.enqueue(mk(0, 2)); q.enqueue(mk(1, 3)); q.enqueue(mk(0, 4));
    const out = q.drain(7).map(c => [c.playerId, c.unitIds[0]]);
    expect(out).toEqual([[0, 2], [0, 4], [1, 3], [2, 1]]);
    expect(q.drain(7)).toEqual([]);
  });

  it('simStep executa os comandos do tick na ordem (playerId, seqNo) e registra no log', () => {
    const gm = makeGm();
    const a = arena(gm);
    const u0 = gm.spawnUnit('knight', a.x, a.z, 0);
    const u1 = gm.spawnUnit('grunt', a.x + 5, a.z, 1);
    // emitidos fora de ordem de jogador
    gm.issue({ type: CMD.STOP, playerId: 1, unitIds: [u1.id] });
    gm.issue({ type: CMD.HOLD, playerId: 0, unitIds: [u0.id] });
    gm.issue({ type: CMD.STOP, playerId: 0, unitIds: [u0.id] });
    const logStart = gm.commands.log.length;
    step(gm, 1);
    const executed = gm.commands.log.slice(logStart).map(c => `${c.playerId}:${c.type}`);
    expect(executed).toEqual(['0:hold', '0:stop', '1:stop']);
  });

  it('duas partidas com a mesma seed e o mesmo script de comandos terminam com o mesmo checksum', () => {
    const play = () => {
      const gm = makeGm(9);
      const a = arena(gm);
      const u = gm.spawnUnit('knight', a.x, a.z, 0);
      const e = gm.spawnUnit('grunt', a.x + 12, a.z, 1);
      gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [u.id], x: a.x + 6, z: a.z });
      step(gm, 20);
      gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [u.id], targetId: e.id });
      gm.issue({ type: CMD.ATTACK, playerId: 1, unitIds: [e.id], targetId: u.id });
      step(gm, 120);
      return stateChecksum(gm);
    };
    expect(play()).toBe(play());
  });
});

describe('checksum', () => {
  it('estados iguais (mesma seed, mesmos ticks) → mesmo hash e mesmas partes', () => {
    const a = makeGm(5), b = makeGm(5);
    step(a, 50); step(b, 50);
    expect(stateChecksum(a)).toBe(stateChecksum(b));
    expect(stateChecksumDetail(a).parts).toEqual(stateChecksumDetail(b).parts);
  });

  it('chamar duas vezes seguidas não altera o estado nem o hash (função pura)', () => {
    const gm = makeGm();
    step(gm, 5);
    const h = stateChecksum(gm);
    expect(stateChecksum(gm)).toBe(h);
    expect(stateChecksum(gm)).toBe(h);
  });

  it('seeds diferentes → hash diferente', () => {
    expect(stateChecksum(makeGm(1))).not.toBe(stateChecksum(makeGm(2)));
  });

  it('muda quando o tick avança', () => {
    const gm = makeGm();
    const h = stateChecksum(gm);
    step(gm, 1);
    expect(stateChecksum(gm)).not.toBe(h);
  });

  it('PV de unidade muda só a categoria "units"; recurso muda só "players"', () => {
    const gm = makeGm();
    step(gm, 2);
    const base = stateChecksumDetail(gm);
    const u = gm.allUnits.find(x => x.ownerId === 0);
    u.hp -= 1;
    const afterHp = stateChecksumDetail(gm);
    expect(afterHp.total).not.toBe(base.total);
    expect(afterHp.parts.units).not.toBe(base.parts.units);
    expect(afterHp.parts.players).toBe(base.parts.players);
    expect(afterHp.parts.buildings).toBe(base.parts.buildings);
    u.hp += 1;
    expect(stateChecksum(gm)).toBe(base.total);
    gm.getPlayer(0).resources.gold += 1;
    const afterGold = stateChecksumDetail(gm);
    expect(afterGold.parts.players).not.toBe(base.parts.players);
    expect(afterGold.parts.units).toBe(base.parts.units);
  });

  it('posição da unidade: deslocamento ≥ 0,01 muda; ruído < 1e-4 não muda', () => {
    const gm = makeGm();
    const u = gm.allUnits.find(x => x.ownerId === 0);
    const x0 = u.mesh.position.x;
    u.mesh.position.x = Math.round(x0 * 1000) / 1000 + 1e-5; // dentro do mesmo balde de 1e-3
    const h0 = stateChecksum(gm);
    u.mesh.position.x += 1e-5;
    expect(stateChecksum(gm)).toBe(h0);
    u.mesh.position.x += 0.01;
    expect(stateChecksum(gm)).not.toBe(h0);
  });

  it('PV de construção e fila de treino mudam "buildings"', () => {
    const gm = makeGm();
    const hq = gm.buildings.find(b => b.ownerId === 0 && b.type === 'castle');
    const base = stateChecksumDetail(gm);
    hq.hp -= 5;
    expect(stateChecksumDetail(gm).parts.buildings).not.toBe(base.parts.buildings);
    hq.hp += 5;
    expect(stateChecksum(gm)).toBe(base.total);
    gm.getPlayer(0).maxPopulation = 50;
    expect(hq.queueUnit('villager', gm)).toBe(true);
    expect(stateChecksumDetail(gm).parts.buildings).not.toBe(base.parts.buildings);
  });

  it('não depende de estado puramente visual (rotação/visibilidade da malha)', () => {
    const gm = makeGm();
    step(gm, 3);
    const h = stateChecksum(gm);
    const u = gm.allUnits.find(x => x.ownerId === 0);
    u.mesh.rotation.y += 1.234;
    u.mesh.visible = !u.mesh.visible;
    expect(stateChecksum(gm)).toBe(h);
  });

  it('wantUnits devolve [id, hash] por unidade, em ordem de id, e aponta a unidade alterada', () => {
    const gm = makeGm();
    const d0 = stateChecksumDetail(gm, true);
    expect(d0.units.length).toBe(gm.allUnits.length);
    const ids = d0.units.map(p => p[0]);
    expect(ids).toEqual([...ids].sort((p, q) => p - q));
    const target = gm.allUnits[2];
    target.hp -= 3;
    const d1 = stateChecksumDetail(gm, true);
    const changed = d1.units.filter((p, i) => p[1] !== d0.units[i][1]).map(p => p[0]);
    expect(changed).toEqual([target.id]);
  });

  it('gm.checksums registra um hash a cada 20 ticks', () => {
    const gm = makeGm();
    step(gm, 61);
    const ticks = gm.checksums.map(c => c.tick);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBe(20);
  });
});
