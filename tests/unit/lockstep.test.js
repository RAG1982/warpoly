import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/sim/GameManager.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { getBuildingDef } from '../../src/data/index.js';
import { createMemoryNetwork } from '../../src/net/MemoryTransport.js';
import { LockstepSession } from '../../src/net/LockstepSession.js';
import { createGameSimAdapter } from '../../src/net/GameSimAdapter.js';

/**
 * F9-01 — lockstep 1v1 em memória: duas sims independentes (mesma seed), cada uma só recebe
 * comandos pelo `LockstepSession` via rede simulada (latência + jitter, com reordenação).
 */
function makePeer(net, localId, seed, opts = {}) {
  const cfg = createMatchConfig({ seed, headless: true });
  cfg.players.forEach((p) => {
    p.isAI = false; // dois humanos: nenhuma IA gera comandos fora da sessão
    p.isLocal = p.id === localId;
  });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  const events = { desync: null, violations: [] };
  const session = new LockstepSession({
    transport: net.transport(localId),
    localId,
    playerIds: [0, 1],
    sim: createGameSimAdapter(gm),
    onDesync: (d) => (events.desync = d),
    onViolation: (v) => events.violations.push(v),
    ...opts
  });
  return { gm, session, events };
}

/** Script de comandos pseudoaleatório (seed própria) por jogador: mover unidades e treinar. */
function scriptedCommands(peer, pid, turn) {
  const mine = peer.gm.allUnits.filter((u) => u.ownerId === pid && !u.isDead);
  const hq = peer.gm.buildings.find((b) => b.ownerId === pid && (getBuildingDef(b.type).trains || []).length > 0);
  const r = ((turn * 2654435761 + pid * 40503) >>> 0) % 7;
  if (r === 0 && mine.length) {
    const u = mine[turn % mine.length];
    peer.session.queueCommand({ type: CMD.MOVE, unitIds: [u.id], x: ((turn * 37) % 60) - 30, z: ((turn * 53) % 60) - 30 });
  } else if (r === 3 && hq) {
    peer.session.queueCommand({ type: CMD.TRAIN, buildingId: hq.id, unitType: getBuildingDef(hq.type).trains[0] });
  }
}

function run(a, b, net, turns, { onTurn } = {}) {
  let guard = 0;
  while ((a.session.turn < turns || b.session.turn < turns) && guard++ < turns * 200) {
    net.advance(25);
    if (a.session.turn < turns) {
      scriptedCommands(a, 0, a.session.turn);
      a.session.update(turns - a.session.turn);
    }
    if (b.session.turn < turns) {
      scriptedCommands(b, 1, b.session.turn);
      b.session.update(turns - b.session.turn);
    }
    if (onTurn) onTurn();
  }
}

describe('lockstep (F9-01)', () => {
  it('duas sims com os mesmos comandos por turno chegam ao mesmo checksum (latência 120 ms ± 90 ms)', () => {
    const net = createMemoryNetwork({ latencyMs: 120, jitterMs: 90, seed: 5 });
    const a = makePeer(net, 0, 11);
    const b = makePeer(net, 1, 11);
    const sumsA = [];
    const sumsB = [];
    run(a, b, net, 150, {
      onTurn: () => {
        sumsA.push(a.session.turn);
        sumsB.push(b.session.turn);
      }
    });

    expect(a.session.turn).toBe(150);
    expect(b.session.turn).toBe(150);
    expect(a.gm.currentTick).toBe(300);
    expect(a.events.desync).toBeNull();
    expect(b.events.desync).toBeNull();
    expect(a.events.violations).toEqual([]);
    expect(stateChecksum(a.gm)).toBe(stateChecksum(b.gm));
    // houve comandos de verdade e a rede teve que esperar (stall) em algum momento
    expect(a.gm.commands.log.length).toBeGreaterThan(10);
    expect(a.gm.commands.log.map((c) => c.type + c.playerId + c.tick)).toEqual(
      b.gm.commands.log.map((c) => c.type + c.playerId + c.tick)
    );
    expect(a.session.stalls + b.session.stalls).toBeGreaterThan(0);
  }, 30000);

  it('comandos efetivamente mudam o estado (checksum difere de uma sim sem comandos)', () => {
    const net = createMemoryNetwork({ latencyMs: 0 });
    const a = makePeer(net, 0, 11);
    const b = makePeer(net, 1, 11);
    run(a, b, net, 60);
    const idle = createMatchConfig({ seed: 11, headless: true });
    idle.players.forEach((p) => (p.isAI = false));
    const gm = new GameManager(new Terrain(), null, null, idle);
    for (let i = 0; i < 120; i++) gm.simStep(0.05);
    expect(stateChecksum(gm)).not.toBe(stateChecksum(a.gm));
  }, 30000);

  it('um desync (estado local adulterado) é detectado pelos dois pares em poucos turnos', () => {
    const net = createMemoryNetwork({ latencyMs: 60, jitterMs: 40, seed: 9 });
    const a = makePeer(net, 0, 21);
    const b = makePeer(net, 1, 21);
    let tampered = false;
    run(a, b, net, 80, {
      onTurn: () => {
        if (!tampered && b.session.turn >= 20) {
          b.gm.players[0].resources.gold += 1; // só na sim de B
          tampered = true;
        }
      }
    });
    expect(tampered).toBe(true);
    expect(a.events.desync).not.toBeNull();
    expect(b.events.desync).not.toBeNull();
    expect(a.events.desync.local).not.toBe(a.events.desync.remote);
    expect(a.events.desync.turn).toBeGreaterThanOrEqual(20);
    expect(a.events.desync.turn).toBeLessThan(30);
    // a sim congela ao detectar
    expect(a.session.turn).toBeLessThan(40);
  }, 30000);

  it('pacote com comando em nome de outro jogador é rejeitado (violação) e não executa', () => {
    const net = createMemoryNetwork({ latencyMs: 0 });
    net.tamper = (from, to, msg) => {
      if (from === 1 && msg.cmds && msg.cmds.length) msg.cmds.forEach((c) => (c.playerId = 0));
      return msg;
    };
    const a = makePeer(net, 0, 31);
    const b = makePeer(net, 1, 31);
    // B emite um comando; o pacote de B chega a A forjado → A nunca recebe aquele turno e fica em stall
    b.session.queueCommand({ type: CMD.STOP, unitIds: [] });
    for (let i = 0; i < 40; i++) {
      net.advance(50);
      a.session.update();
      b.session.update();
    }
    expect(a.events.violations.length).toBeGreaterThan(0);
    expect(a.events.violations[0].reason).toMatch(/outro jogador/);
    expect(a.session.turn).toBeLessThan(10); // travado esperando o turno de B
  });
});
