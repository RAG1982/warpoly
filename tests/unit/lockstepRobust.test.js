import { describe, it, expect } from 'vitest';
import '../../src/ai/registerAI.js';
import { GameManager } from '../../src/sim/GameManager.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { CMD } from '../../src/sim/commands.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { getBuildingDef } from '../../src/data/index.js';
import { getMap } from '../../src/data/maps/index.js';
import { createMemoryNetwork } from '../../src/net/MemoryTransport.js';
import { LockstepSession } from '../../src/net/LockstepSession.js';
import { createGameSimAdapter } from '../../src/net/GameSimAdapter.js';
import { buildOnlineMatchConfig } from '../../src/net/onlineMatch.js';
import { RoomState, cleanRoomOps } from '../../src/net/RoomState.js';

/**
 * F9-04 — robustez do lockstep em Node com MemoryTransport: reenvio após perda, queda longa => IA e
 * retorno por snapshot validado por checksum, pausa votada, saída vira IA, chat/ping fora do checksum.
 */
function makeGroup(n, net, { seed = 91, session = {}, difficulty = 'easy' } = {}) {
  const roomPlayers = Array.from({ length: n }, (_, i) => ({ id: 100 + i * 7, name: `J${i}`, faction: i % 2 ? 'orc' : 'human', color: i, team: 0 }));
  const peers = [];
  for (let i = 0; i < n; i++) {
    const built = buildOnlineMatchConfig({ players: roomPlayers, seed, localNetId: roomPlayers[i].id, headless: true });
    built.config.difficulty = difficulty;
    const peer = { pid: i, config: built.config, events: { desync: null, violations: [], room: [], chat: [], pings: [] }, ticks: new Map() };
    peer.newGame = () => {
      peer.gm = new GameManager(new Terrain(getMap(peer.config.mapId)), null, null, peer.config);
      peer.adapter = createGameSimAdapter(peer.gm);
    };
    peer.newGame();
    const proxy = { target: peer.adapter };
    for (const fn of ['enqueue', 'step', 'checksum', 'detail', 'beginTurn', 'takeover', 'release', 'captureSnapshot', 'restoreSnapshot']) proxy[fn] = (...a) => proxy.target[fn](...a);
    proxy.ready = () => !!proxy.target;
    proxy.endTurn = () => proxy.target.endTurn?.();
    peer.proxy = proxy;
    peer.session = new LockstepSession({
      transport: net.transport(i),
      localId: i,
      playerIds: built.playerIds,
      sim: proxy,
      now: () => net.now,
      dropTimeoutMs: 1500,
      onDesync: (d) => (peer.events.desync = d),
      onViolation: (v) => peer.events.violations.push(v),
      onChat: (c) => peer.events.chat.push(c),
      onMapPing: (p) => peer.events.pings.push(p),
      onRoomEvent: (e) => {
        peer.events.room.push(e);
        // como a aplicação faz: ao ser removido, recria a partida local (nova GameManager) para receber o snapshot
        if ((e.type === 'removed' || e.type === 'resyncFailed') && peer.rebuildOnRemoved) {
          proxy.target = null;
          peer.newGame();
          proxy.target = peer.adapter;
        }
        if (e.type === 'resynced') peer.resyncedAt = e.turn;
      },
      ...session
    });
    const orig = peer.session._execute.bind(peer.session);
    peer.session._execute = (turn, box) => {
      orig(turn, box);
      peer.ticks.set(turn, peer.gm.currentTick);
    };
    peers.push(peer);
  }
  return peers;
}

function script(peer, turn) {
  const pid = peer.pid;
  const mine = peer.gm.allUnits.filter((u) => u.ownerId === pid && !u.isDead);
  const hq = peer.gm.buildings.find((b) => b.ownerId === pid && (getBuildingDef(b.type).trains || []).length > 0);
  const r = ((turn * 2654435761 + pid * 40503) >>> 0) % 7;
  if (r === 0 && mine.length) {
    peer.session.queueCommand({ type: CMD.MOVE, unitIds: [mine[turn % mine.length].id], x: ((turn * 37 + pid * 11) % 60) - 30, z: ((turn * 53 + pid * 5) % 60) - 30 });
  } else if (r === 3 && hq) {
    peer.session.queueCommand({ type: CMD.TRAIN, buildingId: hq.id, unitType: getBuildingDef(hq.type).trains[0] });
  }
}

/** Executa até todos os `who` chegarem a `turns` (ou estourar `maxIter` iterações de 25 ms virtuais). */
function run(peers, net, turns, { who = peers, maxIter = 40000, onIter } = {}) {
  let guard = 0;
  while (who.some((p) => p.session.turn < turns) && guard++ < maxIter) {
    net.advance(25);
    for (const p of peers) {
      if (p.session.turn >= turns) {
        p.session.update(0);
        continue;
      }
      script(p, p.session.turn);
      p.session.update(turns - p.session.turn);
    }
    onIter?.();
  }
  expect(guard).toBeLessThan(maxIter);
}

const sums = (peers) => peers.map((p) => stateChecksum(p.gm));
const allEqual = (a) => new Set(a).size === 1;

describe('RoomState', () => {
  it('pausa: maioria estrita dos ativos aprova; recusa quando a maioria é impossível; validade e cooldown', () => {
    const r = new RoomState([0, 1, 2, 3], { voteTurns: 10, countdownTurns: 5, cooldownTurns: 20 });
    r.applyOps(0, 0, [{ op: 'propose', kind: 'pause' }]);
    expect(r.settle(0)).toBe(false);
    r.applyOps(1, 1, [{ op: 'vote', yes: true }]);
    expect(r.settle(1)).toBe(false); // 2 de 4 não é maioria
    r.applyOps(2, 2, [{ op: 'vote', yes: true }]);
    expect(r.settle(2)).toBe(true);
    expect(r.paused).toBe(true);
    // retomar: proposta + aprovação => contagem de 5 turnos ainda congelada
    r.applyOps(3, 3, [{ op: 'propose', kind: 'resume' }]);
    r.settle(3);
    r.applyOps(4, 0, [{ op: 'vote', yes: true }]);
    r.applyOps(4, 1, [{ op: 'vote', yes: true }]);
    expect(r.settle(4)).toBe(true);
    expect(r.info(4).resumeIn).toBe(5);
    expect(r.settle(8)).toBe(true);
    expect(r.settle(9)).toBe(false);
    expect(r.paused).toBe(false);

    // recusa: 2 "não" de 4 inviabilizam a maioria
    const q = new RoomState([0, 1, 2, 3], { voteTurns: 10, cooldownTurns: 20 });
    q.applyOps(0, 0, [{ op: 'propose', kind: 'pause' }]);
    q.applyOps(0, 1, [{ op: 'vote', yes: false }]);
    q.applyOps(0, 2, [{ op: 'vote', yes: false }]);
    expect(q.settle(0)).toBe(false);
    expect(q.vote).toBeNull();
    q.applyOps(5, 0, [{ op: 'propose', kind: 'pause' }]); // cooldown
    expect(q.vote).toBeNull();
    q.applyOps(25, 0, [{ op: 'propose', kind: 'pause' }]);
    expect(q.vote).not.toBeNull();
    q.settle(25 + 10); // expira
    expect(q.vote).toBeNull();
    expect(q.paused).toBe(false);
  });

  it('linha do tempo: saída, queda e retorno; ops inválidas são rejeitadas', () => {
    const r = new RoomState([0, 1, 2], { rejoinLead: 4 });
    expect(r.activeAt(2, 100)).toBe(true);
    r.applyOps(10, 2, [{ op: 'leave' }]);
    expect(r.activeAt(2, 10)).toBe(true);
    expect(r.activeAt(2, 11)).toBe(false);
    expect(r.actionsAt(11)).toEqual([{ pid: 2, active: false }]);
    r.applyOps(20, 0, [{ op: 'rejoin', pid: 2 }]);
    expect(r.activeAt(2, 23)).toBe(false);
    expect(r.activeAt(2, 24)).toBe(true);
    expect(r.addDrop(1, 30)).toBe(true);
    expect(r.activePlayers(30)).toEqual([0, 2]);
    expect(cleanRoomOps([{ op: 'vote', yes: 'x' }])).toBeNull();
    expect(cleanRoomOps([{ op: 'x' }])).toBeNull();
    expect(cleanRoomOps(undefined)).toEqual([]);
  });
});

describe('robustez do lockstep (F9-04)', () => {
  it('perda curta de pacotes: reenvio/NACK converge sem virar IA', () => {
    const net = createMemoryNetwork({ latencyMs: 40, jitterMs: 30, seed: 5 });
    const peers = makeGroup(3, net, { session: { dropTimeoutMs: 60000 } });
    run(peers, net, 30);
    net.setDown(1, true);
    for (let i = 0; i < 40; i++) {
      net.advance(25);
      for (const p of peers) p.session.update(1);
    }
    net.setDown(1, false);
    run(peers, net, 120);
    expect(allEqual(sums(peers))).toBe(true);
    for (const p of peers) {
      expect(p.events.desync).toBeNull();
      expect(p.gm.players.every((pl) => !pl.isAI)).toBe(true);
    }
    expect(new Set(peers.map((p) => p.gm.currentTick)).size).toBe(1);
  }, 120000);

  it('partição parcial (enlace 0-1 cortado por 30+ turnos): o par 2 retransmite e ninguém vira IA', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 20, seed: 14 });
    const peers = makeGroup(3, net, { session: { dropTimeoutMs: 60000 } });
    run(peers, net, 20);
    net.setLink(0, 1, { down: true });
    run(peers, net, 80);
    net.setLink(0, 1, null);
    run(peers, net, 120);
    expect(allEqual(sums(peers))).toBe(true);
    for (const p of peers) {
      expect(p.events.desync).toBeNull();
      expect(p.events.violations).toEqual([]);
      expect(p.gm.players.every((pl) => !pl.isAI)).toBe(true);
    }
  }, 120000);

  it('queda longa vira IA e o retorno por snapshot reconverge (perda de 20+ turnos)', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 20, seed: 6 });
    const peers = makeGroup(3, net);
    const [a, b, x] = peers;
    x.rebuildOnRemoved = true;
    run(peers, net, 40);
    const downTurn = x.session.turn;
    net.setDown(2, true);
    // sobreviventes seguem sozinhos (X vira IA após o timeout) por pelo menos 20 turnos
    run(peers, net, downTurn + 60, { who: [a, b] });
    expect(a.gm.getPlayer(2).isAI).toBe(true);
    expect(b.gm.getPlayer(2).isAI).toBe(true);
    expect(a.gm.aiDirectors.some((d) => d.playerId === 2)).toBe(true);
    expect(a.session.status().dropped).toEqual([2]);
    expect(a.session.turn - downTurn).toBeGreaterThanOrEqual(20);
    run([a, b], net, Math.min(a.session.turn, b.session.turn) + 1);
    expect(stateChecksum(a.gm)).toBe(stateChecksum(b.gm));

    net.setDown(2, false);
    const oldGm = x.gm;
    run(peers, net, a.session.turn + 80);
    expect(x.gm).not.toBe(oldGm); // partida local recriada para receber o snapshot
    expect(x.resyncedAt).toBeGreaterThan(downTurn);
    expect(x.events.violations).toEqual([]);
    // X voltou a ser humano em todos
    for (const p of peers) {
      expect(p.gm.getPlayer(2).isAI).toBe(false);
      expect(p.gm.aiDirectors.some((d) => d.playerId === 2)).toBe(false);
      expect(p.events.desync).toBeNull();
    }
    // e converge: mesmos ticks e checksum quando todos chegam ao mesmo turno
    const target = Math.max(...peers.map((p) => p.session.turn)) + 30;
    run(peers, net, target);
    const t = Math.min(...peers.map((p) => p.session.turn));
    expect(t).toBe(target);
    expect(allEqual(sums(peers))).toBe(true);
    expect(new Set(peers.map((p) => p.gm.currentTick)).size).toBe(1);
    // comandos de X voltaram a valer depois do retorno
    const lastX = a.gm.commands.log.filter((c) => c.playerId === 2 && c.tick > a.session.status().turn * 2 - 80);
    expect(lastX.length).toBeGreaterThan(0);
  }, 240000);

  it('pausa votada congela todos nos mesmos ticks e retoma com contagem', () => {
    const net = createMemoryNetwork({ latencyMs: 40, jitterMs: 25, seed: 7 });
    const peers = makeGroup(4, net, { session: { room: { countdownTurns: 12 } } });
    run(peers, net, 30);
    peers[1].session.proposePause();
    run(peers, net, 34);
    peers[0].session.vote(true);
    peers[3].session.vote(true);
    run(peers, net, 70);
    for (const p of peers) expect(p.session.status().pause.paused).toBe(true);
    const frozenTick = peers[0].gm.currentTick;
    for (const p of peers) expect(p.gm.currentTick).toBe(frozenTick);
    // retomada por votação
    peers[2].session.proposePause(); // "pause" vira "resume" quando já pausado
    run(peers, net, 72);
    peers[0].session.vote(true);
    peers[1].session.vote(true);
    run(peers, net, 100);
    for (const p of peers) expect(p.session.status().pause.paused).toBe(false);
    run(peers, net, 130);
    // turno -> tick idêntico em todos (inclui os turnos congelados)
    const ref = peers[0].ticks;
    for (const p of peers) for (const [turn, tick] of ref) if (p.ticks.has(turn)) expect(p.ticks.get(turn)).toBe(tick);
    // houve turnos congelados (tick repetido) e o jogo andou de novo depois
    const list = [...ref.entries()].sort((q, w) => q[0] - w[0]).map(([, t]) => t);
    const repeats = list.filter((t, i) => i > 0 && t === list[i - 1]).length;
    expect(repeats).toBeGreaterThanOrEqual(12);
    expect(list[list.length - 1]).toBeGreaterThan(frozenTick);
    expect(allEqual(sums(peers))).toBe(true);
    expect(peers[0].events.room.some((e) => e.type === 'resuming')).toBe(true);
    for (const p of peers) expect(p.events.desync).toBeNull();
  }, 120000);

  it('proposta recusada não pausa ninguém', () => {
    const net = createMemoryNetwork({ latencyMs: 20, jitterMs: 10, seed: 8 });
    const peers = makeGroup(2, net);
    run(peers, net, 20);
    peers[0].session.proposePause();
    run(peers, net, 24);
    peers[1].session.vote(false);
    run(peers, net, 60);
    for (const p of peers) {
      expect(p.session.status().pause.paused).toBe(false);
      expect(p.events.room.some((e) => e.type === 'voteFailed')).toBe(true);
    }
    expect(allEqual(sums(peers))).toBe(true);
  }, 60000);

  it('saída voluntária vira IA no mesmo tick e as sims continuam iguais', () => {
    const net = createMemoryNetwork({ latencyMs: 40, jitterMs: 30, seed: 9 });
    const peers = makeGroup(3, net);
    run(peers, net, 25);
    peers[2].session.leave();
    run(peers, net, 150, { who: [peers[0], peers[1]] });
    const [a, b] = peers;
    expect(a.gm.getPlayer(2).isAI).toBe(true);
    expect(b.gm.getPlayer(2).isAI).toBe(true);
    expect(a.adapter.takeLog).toEqual(b.adapter.takeLog);
    expect(a.adapter.takeLog.length).toBe(1);
    const t = Math.min(a.session.turn, b.session.turn);
    run([a, b], net, t + 1);
    expect(allEqual(sums([a, b]))).toBe(true);
    expect(a.gm.currentTick).toBe(b.gm.currentTick);
    // a IA realmente joga o lugar de X (emite comandos depois do ponto de troca)
    const tk = a.adapter.takeLog[0].tick;
    expect(a.gm.commands.log.some((c) => c.playerId === 2 && c.tick > tk)).toBe(true);
    expect(a.events.desync).toBeNull();
    expect(b.events.desync).toBeNull();
  }, 120000);

  it('aviso `bye` pula o timeout: a IA assume sem esperar dropTimeoutMs', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 10, seed: 15 });
    const peers = makeGroup(3, net, { session: { dropTimeoutMs: 600000 } });
    run(peers, net, 25);
    peers[2].session.bye();
    net.setDown(2, true);
    const alive = peers.slice(0, 2);
    run(peers, net, 90, { who: alive, maxIter: 2000 }); // 600 s de timeout nunca chegaria
    for (const p of alive) expect(p.gm.getPlayer(2).isAI).toBe(true);
    const t = Math.min(...alive.map((p) => p.session.turn));
    run(alive, net, t + 10);
    expect(allEqual(sums(alive))).toBe(true);
  }, 60000);

  it('snapshot adulterado é recusado pelo checksum (e não vira estado)', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 20, seed: 16 });
    const peers = makeGroup(3, net);
    const [a, b, x] = peers;
    x.rebuildOnRemoved = true;
    run(peers, net, 30);
    net.setDown(2, true);
    run(peers, net, 100, { who: [a, b] });
    // adultera o checksum dentro do JSON do snapshot (campo "checksum" do dado capturado)
    net.tamper = (from, to, msg) => (msg.k === 'snap' ? { ...msg, d: msg.d.replace(/"checksum":(\d+)/, (m0, n) => `"checksum":${Number(n) + 1}`) } : msg);
    net.setDown(2, false);
    run(peers, net, a.session.turn + 40, { who: [a, b] });
    expect(x.events.violations.some((v) => /checksum/.test(v.reason))).toBe(true);
    expect(x.session.status().removed).not.toBeNull();
    expect(x.session.turn).toBeLessThan(a.session.turn);
    // sem adulteração, o mesmo par se recupera
    net.tamper = null;
    run(peers, net, a.session.turn + 150);
    expect(x.session.status().removed).toBeNull();
    expect(x.gm.getPlayer(2).isAI).toBe(false);
  }, 120000);

  it('4 jogadores, 1 cai por timeout: os 3 restantes seguem iguais e o ponto de troca é o mesmo', () => {
    const net = createMemoryNetwork({ latencyMs: 40, jitterMs: 30, seed: 10 });
    const peers = makeGroup(4, net);
    heterogeneous(net, 4);
    run(peers, net, 30);
    net.setDown(3, true);
    const alive = peers.slice(0, 3);
    run(peers, net, 200, { who: alive });
    for (const p of alive) {
      expect(p.gm.getPlayer(3).isAI).toBe(true);
      expect(p.events.desync).toBeNull();
      expect(p.session.status().dropped).toEqual([3]);
    }
    const takes = alive.map((p) => JSON.stringify(p.adapter.takeLog));
    expect(new Set(takes).size).toBe(1);
    const t = Math.min(...alive.map((p) => p.session.turn));
    run(alive, net, t + 20);
    expect(allEqual(sums(alive))).toBe(true);
    expect(new Set(alive.map((p) => p.gm.currentTick)).size).toBe(1);
  }, 240000);

  it('chat e pings de mapa não alteram o checksum nem o estado da sim', () => {
    const runOnce = (withChatter) => {
      const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 20, seed: 12 });
      const peers = makeGroup(3, net, { session: { isAlly: (pid) => pid !== 2 } });
      for (let turn = 0; turn < 80; turn++) {
        if (withChatter && turn % 5 === 0) {
          peers[0].session.sendChat(`olá ${turn}`);
          peers[1].session.sendChat('só aliados', { team: true });
          peers[2].session.sendMapPing(10 + turn, -5, { kind: 'attack', team: true });
          peers[0].session.sendMapPing(1, 2, { team: false });
        }
        run(peers, net, turn + 1);
      }
      return peers;
    };
    const quiet = runOnce(false);
    const noisy = runOnce(true);
    expect(sums(noisy)).toEqual(sums(quiet));
    expect(noisy[0].gm.commands.log.length).toBe(quiet[0].gm.commands.log.length);
    // entrega: o remetente recebe eco local, os demais recebem; "team" filtra por aliança
    expect(noisy[1].events.chat.some((c) => c.from === 0 && c.text === 'olá 0')).toBe(true);
    expect(noisy[0].events.chat.some((c) => c.local && c.text === 'olá 0')).toBe(true);
    expect(noisy[0].events.chat.some((c) => c.from === 1 && c.team && c.text === 'só aliados')).toBe(true);
    expect(noisy[1].events.pings.some((p) => p.from === 0 && !p.team)).toBe(true);
    expect(noisy.some((p) => p.events.pings.some((q) => q.from === 2 && !q.local))).toBe(false); // isAlly(2) é falso para todos
    expect(noisy[2].events.pings.some((q) => q.local && q.kind === 'attack')).toBe(true);
  }, 120000);
});

function heterogeneous(net, n) {
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) net.setLink(a, b, { latencyMs: 20 + ((a * 31 + b * 17) % 5) * 30, jitterMs: 10 + ((a + b) % 4) * 25 });
}
