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
import { ReplayRecorder, parseReplay, serializeReplay, playReplaySync } from '../../src/replay/Replay.js';

/**
 * F9-05b — replay de partida ONLINE: 3 pares via MemoryTransport, um cai (vira IA nos sobreviventes). O replay gravado
 * no adaptador (`humanLog` + `takeLog`) reproduz os checksums; sem as trocas humano→IA a reprodução diverge.
 */
function makeGroup(n, net, seed = 91) {
  const roomPlayers = Array.from({ length: n }, (_, i) => ({ id: 100 + i * 7, name: `J${i}`, faction: i % 2 ? 'orc' : 'human', color: i, team: 0 }));
  return Array.from({ length: n }, (_, i) => {
    const built = buildOnlineMatchConfig({ players: roomPlayers, seed, localNetId: roomPlayers[i].id, headless: true });
    built.config.difficulty = 'easy';
    const peer = { pid: i, config: built.config };
    peer.gm = new GameManager(new Terrain(getMap(peer.config.mapId)), null, null, peer.config);
    peer.adapter = createGameSimAdapter(peer.gm);
    peer.session = new LockstepSession({
      transport: net.transport(i),
      localId: i,
      playerIds: built.playerIds,
      sim: peer.adapter,
      now: () => net.now,
      dropTimeoutMs: 1500
    });
    return peer;
  });
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

function run(peers, net, turns, who = peers) {
  let guard = 0;
  while (who.some((p) => p.session.turn < turns) && guard++ < 40000) {
    net.advance(25);
    for (const p of peers) {
      if (p.session.turn >= turns) {
        p.session.update(0);
        continue;
      }
      script(p, p.session.turn);
      p.session.update(turns - p.session.turn);
    }
  }
  expect(guard).toBeLessThan(40000);
}

const freshGm = (replay) => new GameManager(new Terrain(getMap(replay.config.mapId)), null, null, JSON.parse(JSON.stringify(replay.config)));

describe('replay de partida online com queda (F9-05b)', () => {
  const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 20, seed: 6 });
  const peers = makeGroup(3, net);
  const [a, b, x] = peers;
  const rec = new ReplayRecorder(a.gm, { online: true, adapter: a.adapter, checkEvery: 20 });

  run(peers, net, 40);
  const downTurn = x.session.turn;
  net.setDown(2, true);
  run(peers, net, downTurn + 60, [a, b]);
  rec.poll();
  const replay = parseReplay(serializeReplay(rec.snapshot({ name: 'online' })));

  it('grava a queda como troca humano→IA e só os comandos dos humanos', () => {
    expect(a.gm.getPlayer(2).isAI).toBe(true);
    expect(replay.summary.online).toBe(true);
    expect(replay.takes.length).toBeGreaterThan(0);
    expect(replay.takes.every((t) => t.pid === 2 && t.ai === true)).toBe(true);
    expect(replay.cmds.length).toBe(a.adapter.humanLog.length);
    expect(replay.checks.length).toBeGreaterThan(3);
  });

  it('reproduz os checksums periódicos e o final (queda incluída)', () => {
    const gm = freshGm(replay);
    const res = playReplaySync(gm, replay);
    expect(res.mismatch).toBeNull();
    expect(res.ok).toBe(true);
    expect(res.finalOk).toBe(true);
    expect(res.tick).toBe(replay.ticks);
    expect(res.checksum).toBe(stateChecksum(a.gm));
  });

  it('sem as trocas humano→IA a reprodução diverge (prova de que `takes` importa)', () => {
    const gm = freshGm(replay);
    const res = playReplaySync(gm, { ...replay, takes: [] });
    expect(res.finalOk).toBe(false);
  });

  it('valida `takes` malformado e aceita replays antigos sem o campo', () => {
    const { takes: _t, ...old } = replay; // eslint-disable-line no-unused-vars
    expect(() => parseReplay(old)).not.toThrow();
    expect(() => parseReplay({ ...replay, takes: [{ tick: 'x' }] })).toThrow(/trocas/);
  });
});
