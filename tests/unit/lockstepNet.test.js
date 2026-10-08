import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/sim/GameManager.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { CMD } from '../../src/sim/commands.js';
import { getBuildingDef } from '../../src/data/index.js';
import { getMap } from '../../src/data/maps/index.js';
import { createMemoryNetwork } from '../../src/net/MemoryTransport.js';
import { LockstepSession } from '../../src/net/LockstepSession.js';
import { createGameSimAdapter } from '../../src/net/GameSimAdapter.js';
import { buildOnlineMatchConfig } from '../../src/net/onlineMatch.js';

/**
 * F9-03 — lockstep com 2, 4 e 8 sims em memória (latência/jitter/perda reordenada diferentes por par):
 * mesmos checksums por 300 turnos, atraso adaptativo sobe e desce, desync forçado é detectado e
 * relatado (quem diverge, qual categoria/unidade) e um par lento não corrompe os demais.
 */
function makeGroup(n, net, { seed = 77, session = {} } = {}) {
  const roomPlayers = Array.from({ length: n }, (_, i) => ({ id: 100 + i * 7, name: `J${i}`, faction: i % 2 ? 'orc' : 'human', color: i, team: 0 }));
  const peers = [];
  for (let i = 0; i < n; i++) {
    const { config, playerIds } = buildOnlineMatchConfig({ players: roomPlayers, seed, localNetId: roomPlayers[i].id, headless: true });
    const gm = new GameManager(new Terrain(getMap(config.mapId)), null, null, config);
    const base = createGameSimAdapter(gm);
    const history = [];
    const sim = { ...base, detail: (w) => { const d = base.detail(w); history.push(d.total); return d; } };
    const events = { desync: null, detail: null, violations: [], delay: [] };
    const s = new LockstepSession({
      transport: net.transport(i),
      localId: i,
      playerIds,
      sim,
      now: () => net.now,
      onDesync: (d) => (events.desync = d),
      onDesyncDetail: (d) => (events.detail = d),
      onViolation: (v) => events.violations.push(v),
      onDelayChange: (c) => events.delay.push(c),
      ...session
    });
    peers.push({ gm, session: s, events, history, pid: i });
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

/** Avança a rede em passos de 25 ms e roda `pump` em cada par até todos chegarem a `turns` (ou estourar o tempo virtual). */
function runPump(peers, net, turns, { maxVirtualMs = 120000, onStep } = {}) {
  while (net.now < maxVirtualMs && peers.some((p) => p.session.turn < turns && !p.session.desync)) {
    net.advance(25);
    for (const p of peers) {
      if (p.session.turn >= turns) continue;
      script(p, p.session.turn);
      p.session.pump(25);
    }
    onStep?.();
  }
}

/** Variante sem ritmo de tempo real: executa o que estiver pronto (testa a corretude pura do protocolo). */
function runFree(peers, net, turns) {
  let guard = 0;
  while (peers.some((p) => p.session.turn < turns) && guard++ < turns * 400) {
    net.advance(25);
    for (const p of peers) {
      if (p.session.turn >= turns) continue;
      script(p, p.session.turn);
      p.session.update(turns - p.session.turn);
    }
  }
}

function expectSameHistory(peers, turns) {
  const ref = peers[0].history.slice(0, turns);
  expect(ref.length).toBe(turns);
  for (const p of peers) {
    expect(p.history.slice(0, turns)).toEqual(ref);
    expect(p.events.desync).toBeNull();
    expect(p.events.violations).toEqual([]);
    expect(p.gm.commands.log.length).toBe(peers[0].gm.commands.log.length);
  }
  expect(new Set(peers.map((p) => p.gm.currentTick)).size).toBe(1);
}

/** Enlaces distintos por par: latência/jitter/perda em função dos ids. */
function heterogeneousLinks(net, n) {
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      net.setLink(a, b, { latencyMs: 20 + ((a * 31 + b * 17) % 5) * 45, jitterMs: 10 + ((a + b) % 4) * 40, lossRate: (a + b) % 3 === 0 ? 0.08 : 0 });
    }
  }
}

describe('lockstep multi-jogador (F9-03)', () => {
  for (const n of [2, 4, 8]) {
    it(`${n} sims, enlaces diferentes por par: mesmos checksums por 300 turnos`, () => {
      const net = createMemoryNetwork({ latencyMs: 40, jitterMs: 30, seed: 3 + n });
      const peers = makeGroup(n, net, { session: { delayTurns: 3 } });
      heterogeneousLinks(net, n);
      runFree(peers, net, 300);
      expectSameHistory(peers, 300);
      expect(peers[0].gm.commands.log.length).toBeGreaterThan(20);
    }, 120000);
  }

  it('ritmo em tempo real (pump) com adaptativo: 4 sims ficam em sincronia', () => {
    const net = createMemoryNetwork({ latencyMs: 60, jitterMs: 30, seed: 4 });
    const peers = makeGroup(4, net, { session: { adaptive: true } });
    heterogeneousLinks(net, 4);
    runPump(peers, net, 150);
    expectSameHistory(peers, 150);
  }, 120000);

  it('atraso adaptativo sobe com a latência e desce quando ela cai', () => {
    const net = createMemoryNetwork({ latencyMs: 20, jitterMs: 5, seed: 8 });
    const peers = makeGroup(2, net, { session: { adaptive: true, lowerAfter: 10, pingEveryMs: 200 } });
    const [a, b] = peers;
    runPump(peers, net, 60);
    expect(a.session.delayTurns).toBe(2);

    net.setLink(0, 1, { latencyMs: 320, jitterMs: 20 });
    runPump(peers, net, 140);
    const high = Math.max(a.session.delayTurns, b.session.delayTurns);
    expect(high).toBeGreaterThanOrEqual(5);
    expect(a.session.status().maxRtt).toBeGreaterThan(500);
    expect(a.session.delayTurns).toBeLessThanOrEqual(a.session.maxDelay);
    expect(a.events.delay.some((c) => c.to > c.from)).toBe(true);

    net.setLink(0, 1, { latencyMs: 20, jitterMs: 5 });
    runPump(peers, net, 330);
    expect(a.session.delayTurns).toBe(2);
    expect(b.session.delayTurns).toBe(2);
    expect(a.events.delay.some((c) => c.to < c.from)).toBe(true);
    expectSameHistory(peers, 330);
  }, 120000);

  it('janela configurável: nunca sai de [minDelay, maxDelay]', () => {
    const net = createMemoryNetwork({ latencyMs: 900, jitterMs: 100, seed: 2 });
    const peers = makeGroup(2, net, { session: { adaptive: true, minDelay: 3, maxDelay: 4, delayTurns: 2, pingEveryMs: 200 } });
    runPump(peers, net, 40);
    for (const p of peers) {
      expect(p.session.delayTurns).toBeGreaterThanOrEqual(3);
      expect(p.session.delayTurns).toBeLessThanOrEqual(4);
    }
  }, 60000);

  it('jogador lento (um par com 350 ms e 3% de perda) não corrompe nem trava os demais', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 10, seed: 6 });
    const peers = makeGroup(4, net, { session: { adaptive: true, pingEveryMs: 250 } });
    for (const other of [0, 1, 2]) net.setLink(3, other, { latencyMs: 350, jitterMs: 80, lossRate: 0.03 });
    runPump(peers, net, 200);
    expectSameHistory(peers, 200);
    // o jogo andou: 200 turnos de 100 ms em bem menos que o dobro do tempo real
    expect(net.now).toBeLessThan(200 * 100 * 2.2);
    // o par lento enxerga o RTT alto e subiu o atraso; os rápidos (0-1-2) também respondem ao RTT medido até ele
    expect(peers[3].session.delayTurns).toBeGreaterThanOrEqual(5);
  }, 120000);

  it('status() informa quem estamos aguardando e há quanto tempo', () => {
    const net = createMemoryNetwork({ latencyMs: 0 });
    const peers = makeGroup(3, net);
    const [a] = peers;
    // só A e B andam; C nunca responde
    for (let i = 0; i < 30; i++) {
      net.advance(100);
      peers[0].session.update();
      peers[1].session.update();
    }
    const st = a.session.status();
    expect(st.waiting).toEqual([2]);
    expect(st.stalledMs).toBeGreaterThan(1000);
    expect(st.turn).toBeLessThan(5);
  });

  describe('desync', () => {
    it('4 sims: gold adulterado em C é detectado por todos, C é apontado como divergente e a categoria é "players"', () => {
      const net = createMemoryNetwork({ latencyMs: 50, jitterMs: 20, seed: 12 });
      const peers = makeGroup(4, net);
      let tampered = false;
      let guard = 0;
      while (peers.some((p) => !p.events.desync) && guard++ < 4000) {
        net.advance(25);
        for (const p of peers) {
          script(p, p.session.turn);
          p.session.update(2);
        }
        if (!tampered && peers[2].session.turn >= 20) {
          peers[2].gm.players[1].resources.gold += 1;
          tampered = true;
        }
      }
      expect(tampered).toBe(true);
      for (const p of peers) {
        expect(p.events.desync).not.toBeNull();
        expect(p.events.desync.turn).toBeGreaterThanOrEqual(20);
        expect(p.events.desync.turn).toBeLessThan(40);
      }
      // deixa chegarem os relatórios
      for (let i = 0; i < 40; i++) net.advance(25);
      const r = peers[0].events.desync;
      expect(r.divergent).toEqual([2]);
      expect(r.majority).not.toBeNull();
      expect(Object.keys(r.hashes).length).toBeGreaterThanOrEqual(3);
      expect(r.partsDiff[2]).toEqual(['players']);
      // a sim congela
      const frozenAt = peers[0].session.turn;
      for (let i = 0; i < 20; i++) {
        net.advance(100);
        peers[0].session.update();
      }
      expect(peers[0].session.turn).toBe(frozenAt);
      const dump = peers[0].session.desyncDump();
      expect(JSON.parse(JSON.stringify(dump)).report.turn).toBe(r.turn);
    }, 60000);

    it('unidade com hp adulterado: o relatório lista a unidade divergente', () => {
      const net = createMemoryNetwork({ latencyMs: 40, jitterMs: 10, seed: 13 });
      const peers = makeGroup(2, net);
      let victim = null;
      let guard = 0;
      while (peers.some((p) => !p.events.desync) && guard++ < 4000) {
        net.advance(25);
        for (const p of peers) p.session.update(1);
        if (!victim && peers[1].session.turn >= 15) {
          victim = peers[1].gm.allUnits.find((u) => u.ownerId === 1 && !u.isDead);
          victim.hp -= 3;
        }
      }
      for (let i = 0; i < 20; i++) net.advance(25);
      const r = peers[0].events.desync;
      expect(r).not.toBeNull();
      expect(r.divergent).toEqual([1]); // 2 jogadores: sem maioria, "o outro"
      expect(r.majority).toBeNull();
      expect(r.partsDiff[1]).toContain('units');
      expect(r.diffUnits[1]).toContain(victim.id);
    });
  });

  it('pacote de turno muito à frente é violação', () => {
    const net = createMemoryNetwork({ latencyMs: 0 });
    const peers = makeGroup(2, net);
    net.tamper = (from, to, msg) => {
      if (msg.k === 'turn' && msg.turn === 3) msg.turn = 100000;
      return msg;
    };
    for (let i = 0; i < 20; i++) {
      net.advance(50);
      peers[0].session.update();
      peers[1].session.update();
    }
    expect(peers[0].events.violations.some((v) => /à frente/.test(v.reason))).toBe(true);
  });
});
