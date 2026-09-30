#!/usr/bin/env node
/**
 * tools/balance-sim.mjs — F3-11: simulação IA×IA em lote para balanceamento.
 * Uso: node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs \
 *        --games 200 --map continental-1v1 --minutes 20 --out tools/balance-report/ [--tag nome]
 * Sem DOM/WebGL. Sequencial (1 processo). Ignora o jogador neutro (id 99, time 99).
 * Partidas ímpares (índice 1, 3, …) trocam as facções de slot (cancela viés de posição).
 */
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameManager } from '../src/core/GameManager.js';
import { Terrain } from '../src/world/Terrain.js';
import { createMatchConfig } from '../src/sim/MatchConfig.js';
import { SIM_DT } from '../src/sim/constants.js';
import { EVT } from '../src/sim/events.js';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const GAMES = Number(arg('games', 200));
const MAP = arg('map', 'continental-1v1');
const MINUTES = Number(arg('minutes', 20));
const OUT = arg('out', 'tools/balance-report/');
const TAG = arg('tag', '');
const SNAP_MIN = [8, 12, 16];
const FACTIONS = ['human', 'orc'];

const isNeutral = (p) => p.isNeutralHostile || p.team === 99 || p.id === 99;

/** Executa uma partida. Retorna resumo por facção (identificada por factionId). */
export function runMatch(seed, swap, minutes = MINUTES, mapId = MAP) {
  const scene = new THREE.Scene();
  const cfg = createMatchConfig({ seed, headless: true, mapId });
  cfg.players.forEach((p) => {
    p.isAI = true;
  });
  if (swap) {
    const a = cfg.players[0].startSlot;
    cfg.players[0].startSlot = cfg.players[1].startSlot;
    cfg.players[1].startSlot = a;
  }
  const gm = new GameManager(scene, new Terrain(scene), null, null, cfg);

  const research = { human: {}, orc: {} };
  const tiers = { human: {}, orc: {} };
  const trained = { human: {}, orc: {} };
  const lost = { human: {}, orc: {} };
  const facOf = (id) => {
    const p = gm.playerRegistry.getPlayer(id);
    return p && !isNeutral(p) ? p.factionId : null;
  };
  gm.events.on(EVT.RESEARCH_DONE, (e) => {
    const f = facOf(e.ownerId);
    if (!f) return;
    const k = `${e.upgradeId}#${e.level}`;
    research[f][k] = (research[f][k] || 0) + 1;
  });
  gm.events.on(EVT.HQ_TIER_CHANGED, (e) => {
    const f = facOf(e.ownerId);
    if (!f || tiers[f][e.tier] !== undefined) return;
    tiers[f][e.tier] = gm.gameTime;
  });
  gm.events.on(EVT.UNIT_TRAINED, (e) => {
    const f = facOf(e.ownerId);
    if (!f) return;
    const t = e.unitType || e.type || 'unit';
    trained[f][t] = (trained[f][t] || 0) + 1;
  });
  gm.events.on(EVT.UNIT_DIED, (e) => {
    const f = facOf(e.ownerId);
    if (!f) return;
    const t = e.unitType || e.type || 'unit';
    lost[f][t] = (lost[f][t] || 0) + 1;
  });

  const maxTicks = Math.round((minutes * 60) / SIM_DT);
  const snaps = {};
  const snapAt = new Map(SNAP_MIN.map((m) => [Math.round((m * 60) / SIM_DT), m]));
  let t = 0;
  while (!gm.isGameOver && t < maxTicks) {
    gm.simStep(SIM_DT);
    t++;
    const m = snapAt.get(t);
    if (m) {
      const s = { human: {}, orc: {} };
      for (const u of gm.allUnits) {
        if (u.isDead || u.isDying) continue;
        const f = facOf(u.ownerId);
        if (!f) continue;
        if (u.def && u.def.isWorker) continue;
        s[f][u.type] = (s[f][u.type] || 0) + 1;
      }
      snaps[m] = s;
    }
  }
  const r = gm.result || gm.matchStats.snapshot();
  const real = r.players.filter((p) => !isNeutral(p));
  const alive = real.filter((p) => !p.defeated);
  let winner = null;
  let winnerSlot = null;
  if (gm.isGameOver && alive.length === 1) {
    winner = alive[0].factionId;
    winnerSlot = gm.playerRegistry.getPlayer(alive[0].id).startSlot;
  }
  const per = {};
  for (const p of real) per[p.factionId] = { ...p, trained: trained[p.factionId], lost: lost[p.factionId] };
  const finalRes = gm.players.filter((p) => !isNeutral(p)).map((p) => ({ ...p.resources }));
  return { seed, swap, winner, winnerSlot, minutes: r.elapsed / 60, per, research, tiers, snaps, finalRes };
}

const q = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : 0);
const add = (dst, src) => {
  for (const [a, b] of Object.entries(src || {})) dst[a] = (dst[a] || 0) + b;
};

export function aggregate(results) {
  const n = results.length;
  const decided = results.filter((r) => r.winner);
  const wins = { human: 0, orc: 0 };
  decided.forEach((r) => wins[r.winner]++);
  const bySlot = { 0: 0, 1: 0 };
  decided.forEach((r) => {
    bySlot[r.winnerSlot] = (bySlot[r.winnerSlot] || 0) + 1;
  });
  const durations = results.map((r) => r.minutes);
  const fac = {};
  for (const f of FACTIONS) {
    const trained = {};
    const lost = {};
    const res = {};
    const comp = { 8: {}, 12: {}, 16: {} };
    const compN = { 8: 0, 12: 0, 16: 0 };
    const gathered = { gold: 0, wood: 0, stone: 0 };
    const t2 = [];
    const t3 = [];
    for (const r of results) {
      const p = r.per[f];
      if (!p) continue;
      add(trained, p.trained);
      add(lost, p.lost);
      add(res, r.research[f]);
      add(gathered, p.resources);
      if (r.tiers[f][2] !== undefined) t2.push(r.tiers[f][2] / 60);
      if (r.tiers[f][3] !== undefined) t3.push(r.tiers[f][3] / 60);
      for (const m of SNAP_MIN)
        if (r.snaps[m]) {
          add(comp[m], r.snaps[m][f]);
          compN[m]++;
        }
    }
    const div = (o, d) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +(v / d).toFixed(2)]));
    fac[f] = {
      wins: wins[f],
      winPctDecided: pct(wins[f], decided.length),
      winPctAll: pct(wins[f], n),
      trainedAvg: div(trained, n),
      lostAvg: div(lost, n),
      gatheredAvg: div(gathered, n),
      researchAvg: div(res, n),
      tier2Avg: +avg(t2).toFixed(2),
      tier2Pct: pct(t2.length, n),
      tier3Avg: +avg(t3).toFixed(2),
      tier3Pct: pct(t3.length, n),
      composition: Object.fromEntries(SNAP_MIN.map((m) => [m, compN[m] ? div(comp[m], compN[m]) : {}]))
    };
  }
  return {
    games: n,
    decided: decided.length,
    draws: n - decided.length,
    drawPct: pct(n - decided.length, n),
    bySlotWins: bySlot,
    bySlotPct: { 0: pct(bySlot[0], decided.length), 1: pct(bySlot[1] || 0, decided.length) },
    duration: { mean: +avg(durations).toFixed(2), median: +q(durations, 0.5).toFixed(2), p90: +q(durations, 0.9).toFixed(2) },
    factions: fac
  };
}

function toMd(meta, agg) {
  const L = [];
  L.push(`# Balanceamento — ${meta.map} (${meta.tag || 'lote'})`, '');
  L.push(`- commit: \`${meta.commit}\` | partidas: ${agg.games} | limite: ${meta.minutes} min simulados | seeds ${meta.seeds}`);
  L.push(`- comando: \`${meta.cmd}\``, '');
  L.push('## Vitórias', '', '| facção | vitórias | % decididas | % total |', '|---|---|---|---|');
  for (const f of FACTIONS) L.push(`| ${f} | ${agg.factions[f].wins} | ${agg.factions[f].winPctDecided} | ${agg.factions[f].winPctAll} |`);
  L.push('', `Empates: ${agg.draws} (${agg.drawPct}%). Vitórias por slot 0 (NE) / 1 (SW): ${agg.bySlotPct[0]}% / ${agg.bySlotPct[1]}% (das decididas).`);
  L.push(`Duração (min simulados): média ${agg.duration.mean}, mediana ${agg.duration.median}, p90 ${agg.duration.p90}.`, '');
  for (const f of FACTIONS) {
    const d = agg.factions[f];
    L.push(`## ${f}`, '');
    L.push(`- Centro nível 2: ${d.tier2Pct}% das partidas, média ${d.tier2Avg} min; nível 3: ${d.tier3Pct}%, média ${d.tier3Avg} min`);
    L.push(`- Recursos coletados (média/partida): ${JSON.stringify(d.gatheredAvg)}`);
    L.push(`- Treinadas (média): ${JSON.stringify(d.trainedAvg)}`);
    L.push(`- Perdidas (média): ${JSON.stringify(d.lostAvg)}`);
    L.push(`- Pesquisas concluídas (média/partida): ${JSON.stringify(d.researchAvg)}`);
    for (const m of SNAP_MIN) L.push(`- Exército (não-trabalhadores) aos ${m} min: ${JSON.stringify(d.composition[m])}`);
    L.push('');
  }
  return L.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('balance-sim.mjs')) {
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  const results = [];
  const t0 = Date.now();
  for (let i = 0; i < GAMES; i++) {
    results.push(runMatch(i + 1, i % 2 === 1));
    if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${GAMES} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const agg = aggregate(results);
  const cmd =
    `node --import tools/lib/register-json-loader.mjs tools/balance-sim.mjs --games ${GAMES} --map ${MAP} --minutes ${MINUTES}` +
    (TAG ? ` --tag ${TAG}` : '');
  const meta = { commit, map: MAP, minutes: MINUTES, tag: TAG, cmd, seeds: `1..${GAMES}` };
  mkdirSync(OUT, { recursive: true });
  const base = join(OUT, `${new Date().toISOString().slice(0, 10)}-${MAP}${TAG ? '-' + TAG : ''}`);
  writeFileSync(base + '.json', JSON.stringify({ meta, agg }));
  writeFileSync(base + '.md', toMd(meta, agg));
  console.log(toMd(meta, agg));
  console.error(`tempo total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
