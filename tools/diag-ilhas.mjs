#!/usr/bin/env node
/**
 * DIAG ilhas-4p (diagnóstico, só leitura): reproduz uma partida do soak (`tools/soak.mjs`, mesma configuração e
 * mesmo laço) e grava, a cada `--every` ticks (padrão 2400 = 2 min simulados), um registro por jogador:
 * recursos, população, unidades por tipo/estado, construções por tipo, filas, estado da IA (estratégia, utilidades,
 * onda, operação, percepção, oferta de madeira) e os últimos comandos emitidos. Também mede os trechos em que a
 * "assinatura de progresso" do soak fica constante e, no fim, o estado de cada jogador.
 *
 * Não altera a simulação: os ganchos só observam (envolvem `director.issue` e `CommandExecutor.execute`, sem mudar
 * argumentos nem retornos). A prova é o checksum final igual ao do `tools/soak.mjs` para a mesma seed.
 *
 *   node tools/diag-ilhas.mjs --seed 6 --faction orc --difficulty hard --out <arquivo.jsonl>
 *        [--map ilhas-4p] [--mapFile outro.json] [--max-ticks 72000] [--every 2400]
 *        [--dense DE:ATE:PASSO]   (amostras extras mais densas numa janela de ticks)
 *        [--stop-after N]         (para N ticks depois do 1º trecho constante longo; N=0 desliga)
 *        [--teams 0,1,1,0]        (time de cada jogador; padrão do soak = k % 2)
 *
 * Rodar sempre por `bash tools/safe-run.sh --timeout 3600 -- node tools/diag-ilhas.mjs …` (trava global).
 */
import { register } from 'node:module';
import fs from 'node:fs';
import { StallDetector } from './lib/soakDetector.mjs';

register('./lib/jsonImportLoader.mjs', import.meta.url);
const filt = (orig) => (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return;
  orig(...a);
};
console.warn = filt(console.warn.bind(console));
console.error = filt(console.error.bind(console));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const seed = Number(opt('--seed', 1));
const faction = opt('--faction', 'human');
const difficulty = opt('--difficulty', 'easy');
const mapId0 = opt('--map', 'ilhas-4p');
const mapFile = opt('--mapFile', null);
const maxTicks = Number(opt('--max-ticks', 72000));
const every = Number(opt('--every', 2400));
const outPath = opt('--out', null);
const dense = (opt('--dense', null) || '').split(':').map(Number);
const stopAfter = Number(opt('--stop-after', 0));
const label = opt('--label', '');
const teamsOverride = opt('--teams', null); // ex.: 0,1,1,0 (time de cada jogador k; padrão do soak = k % 2)

const { GameManager } = await import('../src/core/GameManager.js');
await import('../src/ai/registerAI.js');
const { Terrain } = await import('../src/world/Terrain.js');
const { createMatchConfig, PLAYER_COLORS } = await import('../src/sim/MatchConfig.js');
const { getMap, registerMap } = await import('../src/data/maps/index.js');
const { SIM_DT } = await import('../src/sim/constants.js');
const { stateChecksum } = await import('../src/sim/checksum.js');
const { CommandExecutor } = await import('../src/sim/CommandExecutor.js');
const { analyzeWood } = await import('../src/ai/AIWood.js');
const { CMD } = await import('../src/sim/commands.js');

let mapId = mapId0;
if (mapFile) {
  const obj = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  obj.id = `${obj.id}-diag`;
  registerMap(obj);
  mapId = obj.id;
}

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);
const out = [];
const emit = (rec) => {
  out.push(rec);
  if (outPath) fs.appendFileSync(outPath, JSON.stringify(rec) + '\n');
};
if (outPath) fs.writeFileSync(outPath, '');

// --- configuração idêntica à de tools/soak.mjs (runMatch) ---
const cfg = createMatchConfig({ seed, mapId, difficulty, localFaction: faction, headless: true });
const mapDef = getMap(mapId);
const want = mapDef.maxPlayers || cfg.players.length;
if (want > 2) {
  cfg.players = [];
  for (let k = 0; k < want; k++) {
    const orc = (k + (faction === 'orc' ? 1 : 0)) % 2 === 1;
    cfg.players.push({ id: k, name: `P${k}`, factionId: orc ? 'orc' : 'human', team: k % 2, color: PLAYER_COLORS[k], isAI: true, isLocal: k === 0, startSlot: k });
  }
}
cfg.players.forEach((p) => { p.isAI = true; });
if (teamsOverride) {
  const tt = teamsOverride.split(',').map(Number);
  cfg.players.forEach((p, k) => { p.team = tt[k]; });
}

const gm = new GameManager(new Terrain(mapDef), null, null, cfg);

// --- ganchos de observação ---
const cmdLog = new Map(); // playerId -> {recent:[], counts:{}, accepted:{}, rejected:{}, lastTick:{}}
const logOf = (pid) => {
  let l = cmdLog.get(pid);
  if (!l) { l = { recent: [], counts: {}, executed: {}, rejected: {}, dropped: 0, lastTick: {}, winCounts: {} }; cmdLog.set(pid, l); }
  return l;
};
const brief = (f) => {
  const o = { type: f.type };
  if (f.unitIds) o.n = f.unitIds.length;
  if (f.unitType) o.unit = f.unitType;
  if (f.buildingType) o.bld = f.buildingType;
  if (f.upgradeId) o.up = f.upgradeId;
  if (typeof f.x === 'number') o.xz = [r1(f.x), r1(f.z)];
  if (f.targetId !== undefined) o.tgt = f.targetId;
  if (f.buildingId !== undefined) o.b = f.buildingId;
  return o;
};
for (const d of gm.aiDirectors) {
  const orig = d.issue.bind(d);
  d.issue = (fields) => {
    const r = orig(fields);
    const l = logOf(d.playerId);
    const t = fields.type;
    if (r === null) { l.dropped++; l.recent.push({ tick: gm.currentTick, ...brief(fields), dropped: true }); }
    else {
      l.counts[t] = (l.counts[t] || 0) + 1;
      l.winCounts[t] = (l.winCounts[t] || 0) + 1;
      l.lastTick[t] = gm.currentTick;
      l.recent.push({ tick: gm.currentTick, ...brief(fields) });
    }
    if (l.recent.length > 40) l.recent.shift();
    return r;
  };
}
const execOrig = CommandExecutor.execute;
const spendSum = (p) => p.resources.gold + p.resources.wood + p.resources.stone;
CommandExecutor.execute = function (g, cmd) {
  const watch = cmd.type === CMD.TRAIN || cmd.type === CMD.PLACE_BUILDING || cmd.type === CMD.RESEARCH || cmd.type === CMD.UPGRADE_HQ || cmd.type === CMD.PLACE_WALL;
  const p = watch ? g.getPlayer(cmd.playerId) : null;
  const before = p ? spendSum(p) : 0;
  const r = execOrig.call(this, g, cmd);
  if (p && p.isAI) {
    const l = logOf(cmd.playerId);
    const k = cmd.type;
    if (spendSum(p) < before) l.executed[k] = (l.executed[k] || 0) + 1;
    else l.rejected[k] = (l.rejected[k] || 0) + 1;
  }
  return r;
};

// combate jogador x jogador (exclui neutros): 1ª baixa/1ª construção destruída e contagem por janela de amostragem
const { EVT } = await import('../src/sim/events.js');
const pvp = { kills: 0, bKills: 0, firstKill: null, firstBld: null, firstContact: null, win: { kills: 0, bKills: 0 }, byPair: {} };
const hostileKill = (e) => {
  const k = e.killerOwnerId;
  if (k === null || k === undefined || k === e.ownerId) return false;
  const reg = gm.playerRegistry;
  if (!reg.isHostile(k, e.ownerId)) return false;
  const v = reg.getPlayer(e.ownerId);
  const kp = reg.getPlayer(k);
  return !(v && v.isNeutralHostile) && !(kp && kp.isNeutralHostile);
};
gm.events.on(EVT.UNIT_DIED, (e) => {
  if (e.expired || !hostileKill(e)) return;
  pvp.kills++; pvp.win.kills++;
  if (pvp.firstKill === null) pvp.firstKill = { tick: gm.currentTick, killer: e.killerOwnerId, victim: e.ownerId };
  const key = `${e.killerOwnerId}>${e.ownerId}`;
  pvp.byPair[key] = (pvp.byPair[key] || 0) + 1;
});
gm.events.on(EVT.BUILDING_DESTROYED, (e) => {
  if (!hostileKill(e)) return;
  pvp.bKills++; pvp.win.bKills++;
  if (pvp.firstBld === null) pvp.firstBld = { tick: gm.currentTick, killer: e.killerOwnerId, victim: e.ownerId, type: e.buildingType };
});

// --- amostragem ---
function workerRole(u, workerType) {
  if (u.state === 'building') return 'building';
  if (u.state === 'repairing') return 'repairing';
  if (u.state === 'idle') return 'idle';
  const gt = u.gatherTarget;
  if (gt && !gt.isDead) return `${gt.type === 'tree' || gt.type === 'wood' ? 'wood' : gt.type}:${u.state}`;
  if (u.carrying && u.carrying.amount > 0) return `carry-${u.carrying.type}:${u.state}`;
  return `other:${u.state}`;
}

function snapshotPlayers(gm, tick) {
  const res = [];
  for (const p of gm.players) {
    if (p.isNeutralHostile) continue;
    const dir = gm.aiDirectors.find((d) => d.playerId === p.id) || null;
    const units = gm.getUnitsOf(p.id).filter((u) => !u.isDead);
    const workerType = dir ? dir.workerType : null;
    const byType = {};
    const armyStates = {};
    const workerRoles = {};
    let armyHpFrac = 0; let armyN = 0;
    for (const u of units) {
      byType[u.type] = (byType[u.type] || 0) + 1;
      if (u.type === workerType) {
        const r = workerRole(u, workerType);
        workerRoles[r] = (workerRoles[r] || 0) + 1;
      } else {
        armyStates[u.state] = (armyStates[u.state] || 0) + 1;
        armyHpFrac += u.hp / u.maxHp; armyN++;
      }
    }
    const blds = gm.buildings.filter((b) => b.ownerId === p.id && !b.isDead);
    const bTypes = {};
    const queues = [];
    for (const b of blds) {
      const e = bTypes[b.type] || (bTypes[b.type] = { done: 0, wip: 0, minHpFrac: 1 });
      if (b.isConstructed) e.done++; else e.wip++;
      e.minHpFrac = Math.min(e.minHpFrac, r1(b.hp / b.maxHp));
      if (b.queue && b.queue.length) queues.push({ b: b.type, id: b.id, q: b.queue.map((it) => it.type), prog: r1(b.queue[0].progress) });
      if (b.currentResearch) queues.push({ b: b.type, id: b.id, research: b.currentResearch.id, prog: r1(b.currentResearch.progress) });
      if (b.tierUpgrade) queues.push({ b: b.type, id: b.id, tierUpgrade: true });
    }
    const ms = gm.matchStats.byPlayer.get(p.id);
    const rec = {
      id: p.id, faction: p.factionId, team: p.team, defeated: !!p.defeated, slot: p.startSlot,
      res: { gold: Math.floor(p.resources.gold), wood: Math.floor(p.resources.wood), stone: Math.floor(p.resources.stone), oil: Math.floor(p.resources.oil || 0) },
      pop: `${p.population}/${p.maxPopulation}`,
      units: byType, workers: workerRoles, army: armyStates, armyAvgHp: armyN ? r1(armyHpFrac / armyN) : null,
      buildings: bTypes, queues,
      stats: ms ? {
        trained: ms.unitsTrained, lost: ms.unitsLost, killed: ms.unitsKilled, built: ms.buildingsBuilt, bLost: ms.buildingsLost, bDestroyed: ms.buildingsDestroyed,
        gathered: { gold: Math.floor(ms.resources.gold), wood: Math.floor(ms.resources.wood), stone: Math.floor(ms.resources.stone) },
        spent: { gold: Math.floor(ms.spent.gold), wood: Math.floor(ms.spent.wood), stone: Math.floor(ms.spent.stone) }
      } : null
    };
    if (dir) {
      const mm = dir.militaryManager;
      const em = dir.economyManager;
      const w = analyzeWood(dir);
      const per = dir.perception;
      let target = null;
      try { const t = mm.selectExpeditionTarget(); if (t) target = { id: t.id, owner: t.ownerId, role: t.role || t.cls || null, type: t.type, xz: [r1(t.x), r1(t.z)] }; } catch { /* ignora */ }
      let ready = 0;
      for (const u of units) if (u.type !== workerType && !dir.isReserved(u.id) && (u.state === 'idle' || u.state === 'moving') && u.hp >= u.maxHp * 0.35) ready++;
      const l = logOf(p.id);
      rec.ai = {
        strategy: dir.strategy.id, goal: em.currentGoal,
        util: { eco: r1(dir.utilities.eco), housing: r1(dir.utilities.housing), def: r1(dir.utilities.def), mil: r1(dir.utilities.mil) },
        wave: mm.strikeWaveNumber, threshold: mm.attackThreshold, waveIds: mm.waveIds.size, readyArmy: ready,
        op: mm._op ? mm._op.phase : null, campOp: mm._campOp ? true : false, lastMarch: mm._lastMarch || null,
        expeditionAllowed: mm.expeditionAllowed(), reinforcementsBlocked: mm.reinforcementsBlocked(),
        target,
        known: { bld: per.buildings.size, units: per.units.size, explored: per.exploredCount, resets: per.resets || 0, scout: per.scoutId },
        wood: { count: w.count, wood: Math.floor(w.wood), nearest: r1(w.nearest), none: w.none, far: w.far, low: w.low, region: w.region },
        camp: { hold: em._campHold, tries: em._campTries, cooldownUntil: r1(em._campCooldownUntil), wallLine: em._wallLineDone },
        apm: { issued: dir.commandsIssued, dropped: dir.commandsDropped, tokens: r1(dir._apmTokens) },
        cmdWindow: l.winCounts,
        cmdTotals: l.counts, executed: l.executed, rejected: l.rejected,
        lastCmdTick: l.lastTick,
        lastCmds: l.recent.slice(-10)
      };
      l.winCounts = {};
    }
    res.push(rec);
  }
  return res;
}

function worldSummary(gm) {
  let treesAlive = 0; let treeWood = 0;
  for (const t of gm.trees) if (!t.isDead && t.woodRemaining > 0) { treesAlive++; treeWood += t.woodRemaining; }
  const dep = {};
  for (const r of gm.resourceDeposits) {
    if (r.resourcesRemaining > 0) {
      const e = dep[r.type] || (dep[r.type] = { n: 0, left: 0 });
      e.n++; e.left += Math.floor(r.resourcesRemaining);
    }
  }
  let bandits = 0;
  for (const u of gm.allUnits) if (u.ownerId === 99 && !u.isDead) bandits++;
  return { treesAlive, treeWood: Math.floor(treeWood), deposits: dep, bandits, entities: gm.allUnits.length + gm.buildings.length };
}

// --- laço (idêntico ao do soak) ---
const stall = new StallDetector(2400);
let tick = 0;
let prevSnap = null;
let lastSig = null;
let runStart = 0;
const constRuns = [];
let firstLongRunAt = null;
const denseOn = (t) => dense.length === 3 && dense.every(Number.isFinite) && t >= dense[0] && t <= dense[1] && (t - dense[0]) % dense[2] === 0;
const t0 = Date.now();

emit({ kind: 'header', label, seed, faction, difficulty, mapId, mapFile, size: mapDef.size, playable: mapDef.playable, trees: gm.trees.length, plannedTrees: (mapDef.forests || []).reduce((s, f) => s + f.count, 0), players: gm.players.filter((p) => !p.isNeutralHostile).map((p) => ({ id: p.id, faction: p.factionId, team: p.team, slot: p.startSlot, pos: p.startPos })) });

while (!gm.isGameOver && tick < maxTicks) {
  gm.simStep(SIM_DT);
  tick++;
  if (tick % 20 === 0) {
    const nums = [];
    let sig = 0;
    const units = gm.allUnits;
    for (let k = 0; k < units.length; k++) {
      const p = units[k].mesh.position;
      nums.push(p.x, p.z, units[k].hp);
      sig += p.x * 3.1 + p.z * 1.7 + units[k].hp;
    }
    for (const b of gm.buildings) {
      nums.push(b.hp);
      sig += b.hp + (b.buildProgress || 0) + (b.queue ? b.queue.length : 0);
    }
    for (const pl of gm.players) {
      for (const r of Object.keys(pl.resources)) {
        nums.push(pl.resources[r]);
        sig += pl.resources[r];
      }
    }
    const s = sig.toFixed(3);
    if (stall.observe(tick, s) && stall.stalledAt !== null && firstLongRunAt === null) firstLongRunAt = tick;
    // trechos de assinatura constante >= 600 ticks
    if (lastSig === null) { lastSig = s; runStart = tick; }
    else if (s !== lastSig) {
      if (tick - 20 - runStart >= 600) constRuns.push({ from: runStart, to: tick - 20, len: tick - 20 - runStart });
      lastSig = s; runStart = tick;
    }
    // atividade nos 20 ticks anteriores a uma amostra
    if ((tick + 20) % every === 0 || denseOn(tick + 20)) {
      prevSnap = { pos: new Map(), res: {} };
      for (const u of gm.allUnits) prevSnap.pos.set(u.id, [u.mesh.position.x, u.mesh.position.z, u.hp]);
      for (const pl of gm.players) prevSnap.res[pl.id] = { ...pl.resources };
    }
  }
  if (tick % every === 0 || denseOn(tick)) {
    const players = snapshotPlayers(gm, tick);
    let activity = null;
    if (prevSnap) {
      const movers = {}; const hpChanged = {};
      for (const u of gm.allUnits) {
        const pv = prevSnap.pos.get(u.id);
        if (!pv) { movers[u.ownerId] = (movers[u.ownerId] || 0) + 1; continue; }
        if (Math.abs(pv[0] - u.mesh.position.x) > 1e-6 || Math.abs(pv[1] - u.mesh.position.z) > 1e-6) movers[u.ownerId] = (movers[u.ownerId] || 0) + 1;
        if (Math.abs(pv[2] - u.hp) > 1e-6) hpChanged[u.ownerId] = (hpChanged[u.ownerId] || 0) + 1;
      }
      const resDelta = {};
      for (const pl of gm.players) {
        const pr = prevSnap.res[pl.id];
        if (!pr) continue;
        const d = {};
        for (const k of Object.keys(pl.resources)) { const v = pl.resources[k] - (pr[k] || 0); if (v !== 0) d[k] = r1(v); }
        if (Object.keys(d).length) resDelta[pl.id] = d;
      }
      activity = { movers, hpChanged, resDelta };
    }
    emit({ kind: 'sample', tick, min: r1(tick / 1200), world: worldSummary(gm), activity, pvp: { win: { ...pvp.win }, total: { kills: pvp.kills, bKills: pvp.bKills }, firstKill: pvp.firstKill, firstBld: pvp.firstBld }, constRunNow: lastSig !== null ? tick - runStart : 0, players });
    pvp.win.kills = 0; pvp.win.bKills = 0;
    prevSnap = null;
    if (stopAfter > 0 && firstLongRunAt !== null && tick >= firstLongRunAt + stopAfter) break;
  }
}
if (lastSig !== null && tick - runStart >= 600) constRuns.push({ from: runStart, to: tick, len: tick - runStart, open: true });
const finished = gm.isGameOver;
let checksum = null;
try { checksum = stateChecksum(gm); } catch { /* ignora */ }
const finalPlayers = snapshotPlayers(gm, tick);
emit({
  kind: 'final', label, seed, faction, difficulty, mapId, finished, ticks: tick, checksum, stalledAt: stall.stalledAt, firstStallDetectedAt: firstLongRunAt,
  gameWon: gm.gameWon, wallS: r1((Date.now() - t0) / 1000), constRuns, pvp: { total: { kills: pvp.kills, bKills: pvp.bKills }, firstKill: pvp.firstKill, firstBld: pvp.firstBld, byPair: pvp.byPair }, world: worldSummary(gm), players: finalPlayers
});
try { gm.dispose(); } catch { /* ignora */ }
console.log(`[diag] ${label ? label + ' ' : ''}seed ${seed} ${mapId} ${faction} ${difficulty}: ${finished ? 'fim' : 'NÃO terminou'} ${tick} ticks checksum ${checksum} stall@${stall.stalledAt} (${r1((Date.now() - t0) / 1000)}s)`);
process.exit(0);
