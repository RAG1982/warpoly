import { describe, it, expect } from 'vitest';
import '../../src/ai/registerAI.js';
import { GameManager } from '../../src/sim/GameManager.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { CMD } from '../../src/sim/commands.js';
import { mulberry32 } from '../../src/sim/rng.js';
import { getBuildingDef } from '../../src/data/index.js';
import { ABILITIES } from '../../src/data/abilities.js';
import { getMap } from '../../src/data/maps/index.js';
import { createMemoryNetwork } from '../../src/net/MemoryTransport.js';
import { LockstepSession } from '../../src/net/LockstepSession.js';
import { createGameSimAdapter } from '../../src/net/GameSimAdapter.js';
import { buildOnlineMatchConfig } from '../../src/net/onlineMatch.js';

/**
 * MP-01 — auditoria de desync do conteúdo novo (2, 4 e 8 jogadores, humanos + IA, 3+ tipos de mapa).
 *
 * Cada par humano roda a sim COMPLETA (IA de todos os jogadores inclusive) e troca só comandos pelo
 * `MemoryTransport`. Os comandos vêm de um "jogador robô" com RNG (mulberry32) de seed fixa FORA da sim:
 * treina, constrói, pede UPGRADE_HQ, funda um segundo Centro, ataca, move, lança magias de herói.
 * Critério: checksum (`detail().total`) igual entre todos os pares em todos os turnos, sem desync
 * reportado pelo protocolo e sem violação. `MP_AUDIT_LONG=1` roda partidas de 15 min de jogo.
 */

const CENTERS = ['castle', 'great_hall'];
const WORKERS = ['villager', 'peon'];
const CENTER_OF = { human: 'castle', orc: 'great_hall' };
const HERO_OF = { human: 'hero_brann', orc: 'hero_drogath' };
const NAVAL_OF = { human: 'frigate', orc: 'war_galley' };
const AIR_OF = { human: 'gryphon_rider', orc: 'war_balloon' };
const BUILD_LIST = {
  human: ['barracks', 'arcane_tower', 'workshop', 'stable', 'aviary', 'shipyard', 'watchtower', 'forge', 'temple', 'lumber_camp'],
  orc: ['orc_barracks', 'orc_workshop', 'ogre_den', 'serpent_nest', 'ship_dock', 'ash_sanctum', 'orc_forge', 'naval_forge', 'orc_watchtower', 'orc_lumber_mill']
};

/** Cobertura agregada das partidas (preenchida pelos testes; checada no fim). */
const coverage = { applied: {}, layers: new Set(), heroes: 0, matches: 0 };

/** Partida de N jogadores: `humans` (pares de rede) + IA para o resto. */
function buildPeers({ humans, ai = 0, map, seed, boost = true }) {
  const n = humans + ai;
  const roomPlayers = Array.from({ length: n }, (_, i) => ({ id: 100 + i * 7, name: `J${i}`, faction: i % 2 ? 'orc' : 'human', color: i, team: 0 }));
  const peers = [];
  for (let i = 0; i < humans; i++) {
    const { config, playerIds } = buildOnlineMatchConfig({ players: roomPlayers, seed, config: map ? { map } : {}, localNetId: roomPlayers[i].id, headless: true });
    config.players.forEach((p, k) => {
      p.isAI = k >= humans;
      p.isLocal = k === i;
    });
    peers.push({ pid: i, config, playerIds });
  }
  return peers;
}

/** Prepara o estado inicial IDENTICAMENTE em todos os pares (antes do primeiro tick). */
function prepareGame(gm, { boost }) {
  const players = Object.values(gm.players);
  if (boost) {
    for (const p of players) Object.assign(p.resources, { wood: 1500, gold: 1500, stone: 800, oil: 400 });
  }
  for (const p of players) {
    const c = gm.buildings.find((b) => b.ownerId === p.id && CENTERS.includes(b.type));
    if (!c) continue;
    const cx = c.mesh.position.x;
    const cz = c.mesh.position.z;
    gm.spawnUnit(HERO_OF[p.factionId] || 'hero_brann', cx + 4, cz + 4, p.id);
    gm.spawnUnit(AIR_OF[p.factionId] || 'gryphon_rider', cx - 5, cz - 5, p.id);
    // naval: primeiro ponto navegável num anel (varredura fixa, sem RNG)
    const npf = gm.navalPathfinder;
    spot: for (let d = 8; d <= 60; d += 3) {
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        if (npf && npf.isWalkableWorld(x, z)) {
          gm.spawnUnit(NAVAL_OF[p.factionId] || 'frigate', x, z, p.id);
          break spot;
        }
      }
    }
  }
}

function makeSession(peer, net, { humans, delayTurns, adaptive }) {
  const gm = new GameManager(new Terrain(getMap(peer.config.mapId)), null, null, peer.config);
  prepareGame(gm, { boost: peer.boost });
  // regressão: derrota de um humano logo no início (todas as construções dele caem antes do tick 0 em todos os pares)
  if (peer.kill !== undefined) for (const b of gm.buildings) if (b.ownerId === peer.kill) b.isDead = true;
  const base = createGameSimAdapter(gm);
  const history = [];
  const sim = {
    ...base,
    detail: (w) => {
      const d = base.detail(w);
      history.push(d.total);
      return d;
    }
  };
  const events = { desync: null, violations: [] };
  const session = new LockstepSession({
    transport: net.transport(peer.pid),
    localId: peer.pid,
    playerIds: peer.playerIds.slice(0, humans),
    sim,
    delayTurns,
    adaptive,
    now: () => net.now,
    onDesync: (d) => (events.desync = d),
    onViolation: (v) => events.violations.push(v)
  });
  // partida online (como `MatchSession`): comandos da UI passam pela sessão e a sim sabe que é online
  gm.netIssue = (fields) => session.queueCommand(fields);
  return { ...peer, gm, session, history, events, rng: mulberry32(peer.seed) };
}

/** Jogador robô: chamado a cada iteração de 25 ms; age em ~35% delas, com ordem escolhida pelo RNG de seed fixa (fora da sim). */
function robot(peer) {
  const { gm, pid, session, rng } = peer;
  if (rng.next() > 0.35) return;
  const pick = (arr) => (arr.length ? arr[Math.floor(rng.next() * arr.length)] : null);
  const mine = gm.buildings.filter((b) => b.ownerId === pid && !b.isDead);
  const units = gm.allUnits.filter((u) => u.ownerId === pid && !u.isDead);
  const enemyUnits = gm.allUnits.filter((u) => u.ownerId !== pid && !u.isDead);
  const enemyCenters = gm.buildings.filter((b) => b.ownerId !== pid && !b.isDead && CENTERS.includes(b.type));
  const faction = gm.players[pid].factionId;
  const center = mine.find((b) => CENTERS.includes(b.type));
  const workers = units.filter((u) => WORKERS.includes(u.type));
  const army = units.filter((u) => !WORKERS.includes(u.type));
  const r = rng.next();
  const near = (c, lo, hi) => {
    const a = rng.next() * Math.PI * 2;
    const d = lo + rng.next() * (hi - lo);
    return { x: c.mesh.position.x + Math.cos(a) * d, z: c.mesh.position.z + Math.sin(a) * d };
  };
  if (r < 0.22) {
    // treinar: qualquer construção que treina (inclui aéreas/navais quando existirem)
    const b = pick(mine.filter((x) => (getBuildingDef(x.type).trains || []).length > 0));
    if (b) {
      const trains = getBuildingDef(b.type).trains;
      const military = trains.filter((t) => !WORKERS.includes(t));
      const unitType = military.length && rng.next() < 0.8 ? pick(military) : pick(trains);
      session.queueCommand({ type: CMD.TRAIN, buildingId: b.id, unitType });
    }
  } else if (r < 0.34) {
    // construir (com operário), ao redor do Centro
    const w = pick(workers);
    const t = pick(BUILD_LIST[faction] || BUILD_LIST.human);
    if (w && center && t) {
      const p = near(center, 6, 16);
      session.queueCommand({ type: CMD.PLACE_BUILDING, buildingType: t, x: p.x, z: p.z, unitIds: [w.id] });
    }
  } else if (r < 0.40) {
    // segundo Centro (mais longe da base)
    const w = pick(workers);
    if (w && center) {
      const p = near(center, 20, 30);
      session.queueCommand({ type: CMD.PLACE_BUILDING, buildingType: CENTER_OF[faction] || 'castle', x: p.x, z: p.z, unitIds: [w.id] });
    }
  } else if (r < 0.46) {
    // UPGRADE_HQ no Centro (e, às vezes, no segundo)
    const c = pick(mine.filter((b) => CENTERS.includes(b.type)));
    if (c) session.queueCommand({ type: CMD.UPGRADE_HQ, buildingId: c.id });
  } else if (r < 0.58) {
    // atacar-mover o exército até uma base inimiga (ou um ponto ao acaso)
    const ids = army.slice(0, 10).map((u) => u.id);
    const tgt = pick(enemyCenters) || center;
    if (ids.length && tgt) {
      const p = near(tgt, 0, 8);
      session.queueCommand({ type: CMD.ATTACK_MOVE, unitIds: ids, x: p.x, z: p.z });
    }
  } else if (r < 0.68) {
    // mover
    const ids = army.slice(0, 6).map((u) => u.id);
    if (ids.length && center) {
      const p = near(center, 4, 30);
      session.queueCommand({ type: CMD.MOVE, unitIds: ids, x: p.x, z: p.z });
    }
  } else if (r < 0.78) {
    // atacar uma unidade inimiga
    const ids = army.slice(0, 6).map((u) => u.id);
    const t = pick(enemyUnits);
    if (ids.length && t) session.queueCommand({ type: CMD.ATTACK, unitIds: ids, targetId: t.id });
  } else if (r < 0.90) {
    // magia: uma unidade com habilidades (heróis, magos, sacerdotes…)
    const caster = pick(units.filter((u) => (u.abilities || []).length > 0));
    if (caster) {
      const abId = pick(caster.abilities);
      const def = ABILITIES[abId];
      const cmd = { type: CMD.CAST, unitIds: [caster.id], abilityId: abId };
      const target = def?.target;
      if (target === 'enemy' && enemyUnits.length) cmd.targetId = pick(enemyUnits).id;
      else if (target === 'ally' || target === 'unit') cmd.targetId = pick(units).id;
      else if (target === 'self') cmd.targetId = caster.id;
      else if (target === 'ground') {
        const tgt = pick(enemyCenters) || center;
        if (tgt) Object.assign(cmd, near(tgt, 0, 10));
      }
      session.queueCommand(cmd);
    }
  } else if (r < 0.95) {
    // operários: reparar/voltar à base (comando de manutenção)
    const ids = workers.slice(0, 3).map((u) => u.id);
    if (ids.length && center) session.queueCommand({ type: CMD.STOP, unitIds: ids });
  } else {
    // patrulha do exército
    const ids = army.slice(0, 5).map((u) => u.id);
    if (ids.length && center) {
      const p = near(center, 10, 25);
      session.queueCommand({ type: CMD.PATROL, unitIds: ids, x: p.x, z: p.z });
    }
  }
}

/** Roda até todos os pares humanos chegarem a `turns` (tempo virtual, sem relógio real). */
function runMatch(peers, net, turns, maxIter) {
  let guard = 0;
  while (peers.some((p) => p.session.turn < turns && !p.events.desync) && guard++ < maxIter) {
    net.advance(25);
    for (const p of peers) {
      if (p.session.turn >= turns || p.events.desync) {
        p.session.update(0);
        continue;
      }
      robot(p);
      p.session.update(turns - p.session.turn);
    }
  }
  return guard;
}

/** Cobertura: comandos aplicados (log da fila), unidades navais/aéreas e heróis presentes ao fim da partida. */
function collectCoverage(gm) {
  for (const c of gm.commands.log) coverage.applied[c.type] = (coverage.applied[c.type] || 0) + 1;
  for (const u of gm.allUnits) {
    if (u.layer === 'naval' || u.layer === 'air') coverage.layers.add(u.layer);
    if (u.type && u.type.startsWith('hero_')) coverage.heroes++;
  }
  coverage.matches++;
}

/**
 * Executa UMA partida e verifica o critério: sem desync, sem violação, mesmo histórico de checksums por turno.
 * @returns {{turns:number, ticks:number, cmds:number}}
 */
function audit(sc) {
  const net = createMemoryNetwork({ latencyMs: sc.latencyMs ?? 45, jitterMs: sc.jitterMs ?? 30, seed: sc.seed + 17, lossRate: sc.lossRate ?? 0.02 });
  const base = buildPeers(sc);
  base.forEach((p, i) => (p.seed = sc.seed * 101 + i * 13 + 5));
  base.forEach((p) => (p.boost = sc.boost !== false));
  const peers = base.map((p) => makeSession(p, net, { humans: sc.humans, delayTurns: 2, adaptive: sc.adaptive ?? true }));
  if (sc.latencyMs === undefined) {
    // enlaces heterogêneos entre pares (um pouco mais lentos para pares de ids altos)
    for (let a = 0; a < sc.humans; a++) {
      for (let b = a + 1; b < sc.humans; b++) net.setLink(a, b, { latencyMs: 30 + ((a * 31 + b * 17) % 5) * 25, jitterMs: 10 + ((a + b) % 4) * 25, lossRate: (a + b) % 3 === 0 ? 0.05 : 0 });
    }
  }
  const guard = runMatch(peers, net, sc.turns, sc.turns * 200 + 2000);
  for (const p of peers) {
    expect(p.events.desync, `${sc.name}: desync reportado pelo par ${p.pid}`).toBeNull();
    expect(p.events.violations, `${sc.name}: violação no par ${p.pid}`).toEqual([]);
    expect(p.session.turn, `${sc.name}: par ${p.pid} não chegou ao fim (guard ${guard})`).toBe(sc.turns);
  }
  const ref = peers[0].history.slice(0, sc.turns);
  expect(ref.length, `${sc.name}: histórico curto`).toBe(sc.turns);
  for (const p of peers) {
    expect(p.history.slice(0, sc.turns), `${sc.name}: checksums divergem no par ${p.pid}`).toEqual(ref);
    expect(p.gm.currentTick).toBe(peers[0].gm.currentTick);
  }
  collectCoverage(peers[0].gm);
  return { turns: sc.turns, ticks: peers[0].gm.currentTick, cmds: peers[0].gm.commands.log.length };
}

const LONG = process.env.MP_AUDIT_LONG === '1';
const LONG_TURNS = 9000; // 15 min de jogo

// Mapas de tipos diferentes: ilhas (ilhas-4p), continental (continental-1v1), naval (arquipelago-naval-4p),
// gerado (desfiladeiro-1v1) e o padrão para 8 jogadores (mapa gerado pela seed).
const SCENARIOS = [];
// 4+ jogadores: 200 turnos (20 s de jogo); 2 jogadores: 300 (30 s). Dimensionado para a suíte rodar em < 90 s
const add = (name, o) => SCENARIOS.push({ name, turns: o.humans + o.ai >= 4 ? 200 : 300, ...o });
// 2 jogadores (humanos), 3 mapas
for (const [map, s] of [['continental-1v1', 1], ['desfiladeiro-1v1', 2], ['campos-1v1', 3]]) add(`2H ${map} (escaramuça Centro+UPGRADE) #${s}`, { humans: 2, ai: 0, map, seed: s });
// 2 humanos + 2 IA, naval e ilhas
for (const [map, s] of [['ilhas-4p', 4], ['arquipelago-naval-4p', 5], ['planalto-ffa-4p', 6]]) add(`2H+2IA ${map} #${s}`, { humans: 2, ai: 2, map, seed: s });
// 3 humanos + 1 IA, 4 humanos, 4 jogadores em 2 mapas diferentes
add('3H+1IA vales-2v2 #7', { humans: 3, ai: 1, map: 'vales-2v2', seed: 7 });
add('4H ilhas-4p #8', { humans: 4, ai: 0, map: 'ilhas-4p', seed: 8 });
add('4H arquipelago-naval-4p #9', { humans: 4, ai: 0, map: 'arquipelago-naval-4p', seed: 9 });
// 8 jogadores: 4H+4IA e 8H (mapa gerado pela seed da sala)
add('4H+4IA mapa gerado #10', { humans: 4, ai: 4, seed: 10 });
add('8H mapa gerado #11', { humans: 8, ai: 0, seed: 11 });
// Variações de seed (mais partidas curtas, sem perda de cobertura)
for (let s = 20; s < 24; s++) add(`2H continental-1v1 #${s}`, { humans: 2, ai: 0, map: 'continental-1v1', seed: s });
for (let s = 24; s < 28; s++) add(`2H+2IA ilhas-4p #${s}`, { humans: 2, ai: 2, map: 'ilhas-4p', seed: s });
for (let s = 28; s < 31; s++) add(`4H+4IA mapa gerado #${s}`, { humans: 4, ai: 4, seed: s });
// 2 jogadores em mais mapas (baratos) para chegar a 30+ partidas curtas
for (const [map, s] of [['desfiladeiro-1v1', 32], ['desfiladeiro-1v1', 33], ['desfiladeiro-1v1', 34], ['campos-1v1', 35], ['campos-1v1', 36], ['campos-1v1', 37], ['continental-1v1', 38], ['continental-1v1', 39], ['estreito-1v1', 40], ['estreito-1v1', 41]]) add(`2H ${map} #${s}`, { humans: 2, ai: 0, map, seed: s });
// Partidas longas (15 min de jogo): só com MP_AUDIT_LONG=1
if (LONG) {
  add('LONGA 2H continental-1v1 #101', { humans: 2, ai: 0, map: 'continental-1v1', seed: 101, turns: LONG_TURNS });
  add('LONGA 2H+2IA ilhas-4p #102', { humans: 2, ai: 2, map: 'ilhas-4p', seed: 102, turns: LONG_TURNS });
  add('LONGA 4H+4IA mapa gerado #103', { humans: 4, ai: 4, seed: 103, turns: LONG_TURNS });
  add('LONGA 4H arquipelago-naval-4p #104', { humans: 4, ai: 0, map: 'arquipelago-naval-4p', seed: 104, turns: LONG_TURNS });
  add('LONGA 8H mapa gerado #105', { humans: 8, ai: 0, seed: 105, turns: LONG_TURNS });
}

describe('MP-01 auditoria online do conteúdo novo (lockstep em memória)', () => {
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      const r = audit(sc);
      expect(r.cmds).toBeGreaterThan(0);
    }, sc.turns > 1000 ? 1800000 : 120000);
  }

  it('regressão: comando local com coordenada NaN não diverge (o par local vê o mesmo que o fio entrega)', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 10, seed: 9 });
    const base = buildPeers({ humans: 2, ai: 0, map: 'continental-1v1', seed: 9 });
    base.forEach((p, i) => {
      p.seed = 9 + i;
      p.boost = true;
    });
    const peers = base.map((p) => makeSession(p, net, { humans: 2, delayTurns: 2, adaptive: false }));
    let injected = false;
    let guard = 0;
    while (peers.some((p) => p.session.turn < 40 && !p.events.desync) && guard++ < 20000) {
      net.advance(25);
      for (const p of peers) {
        if (!injected && p.pid === 0 && p.session.turn >= 3) {
          const u = p.gm.allUnits.find((x) => x.ownerId === 0 && !x.isDead);
          p.session.queueCommand({ type: CMD.MOVE, unitIds: [u.id], x: NaN, z: 5 });
          injected = true;
        }
        p.session.update(Math.max(0, 40 - p.session.turn));
      }
    }
    expect(injected).toBe(true);
    for (const p of peers) expect(p.events.desync).toBeNull();
    expect(peers[0].history.slice(0, 40)).toEqual(peers[1].history.slice(0, 40));
  }, 60000);

  it('regressão: jogador humano derrotado (sem construções) não congela a sim dos demais pares', () => {
    const net = createMemoryNetwork({ latencyMs: 30, jitterMs: 10, seed: 21 });
    const base = buildPeers({ humans: 2, ai: 1, map: 'ilhas-4p', seed: 40 });
    base.forEach((p, i) => {
      p.seed = 40 + i;
      p.boost = true;
      p.kill = 1;
    });
    const peers = base.map((p) => makeSession(p, net, { humans: 2, delayTurns: 2, adaptive: false }));
    runMatch(peers, net, 80, 80 * 200 + 2000);
    for (const p of peers) {
      expect(p.gm.players[1].defeated, `par ${p.pid}: o humano 1 deveria estar derrotado`).toBe(true);
      expect(p.events.desync).toBeNull();
      expect(p.session.turn).toBe(80);
    }
    expect(peers[0].history.slice(0, 80)).toEqual(peers[1].history.slice(0, 80));
  }, 120000);

  it('cobertura: as partidas exercitaram o conteúdo pedido', () => {
    expect(coverage.matches).toBe(SCENARIOS.length);
    for (const t of ['train', 'placeBuilding', 'upgradeHq', 'attackMove', 'move', 'cast']) {
      expect(coverage.applied[t] || 0, `comando "${t}" nunca aplicado`).toBeGreaterThan(0);
    }
    expect(coverage.layers.has('naval') || coverage.layers.has('air'), 'nenhuma unidade naval/aérea').toBe(true);
  });
});
