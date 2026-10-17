#!/usr/bin/env node
/**
 * M1-08 (NEW-9) — "jogador parado": uma IA (P0, dificuldade D) ataca um jogador humano que não emite comando algum (P1).
 * Mede, por dificuldade, o tempo (segundos simulados) até a PRIMEIRA construção do parado cair, até o Centro (HQ) cair
 * e até ele ser derrotado (Destruir tudo). Node puro, determinístico (mesma seed ⇒ mesmos números).
 *
 *   node tools/idle-hq-check.mjs [--seeds 6] [--first 1] [--maps continental-1v1,estreito-1v1] [--diffs easy,normal,hard,brutal]
 *                                [--max-minutes 15] [--goal 360] [--json out.json]
 *
 * Sai com 0 se Fácil e Normal não derrubam o HQ antes de --goal segundos (padrão 360 = 6 min); 4 caso contrário.
 */
import { register } from 'node:module';
import fs from 'node:fs';

register('./lib/jsonImportLoader.mjs', import.meta.url);
const filt = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
console.warn = filt(console.warn.bind(console));
console.error = filt(console.error.bind(console));

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const seeds = Number(opt('--seeds', 6));
const first = Number(opt('--first', 1));
const maps = opt('--maps', 'continental-1v1,estreito-1v1,campos-1v1,desfiladeiro-1v1').split(',');
const diffs = opt('--diffs', 'easy,normal,hard,brutal').split(',');
const maxMinutes = Number(opt('--max-minutes', 15));
const goal = Number(opt('--goal', 360));
const jsonOut = opt('--json', null);

const { GameManager } = await import('../src/core/GameManager.js');
await import('../src/ai/registerAI.js');
const { Terrain } = await import('../src/world/Terrain.js');
const { createMatchConfig } = await import('../src/sim/MatchConfig.js');
const { getMap } = await import('../src/data/maps/index.js');
const { SIM_DT } = await import('../src/sim/constants.js');
const { getBuildingDef } = await import('../src/data/index.js');

const isHq = (b) => getBuildingDef(b.type).role === 'hq';

function run(seed, map, diff, faction) {
  const cfg = createMatchConfig({ seed, mapId: map, difficulty: diff, localFaction: faction, headless: true });
  cfg.players = cfg.players.slice(0, 2);
  cfg.players.forEach((p, i) => { p.isAI = i === 0; p.difficulty = diff; p.isLocal = i === 0; });
  const gm = new GameManager(new Terrain(getMap(map)), null, null, cfg);
  const maxTicks = Math.round((maxMinutes * 60) / SIM_DT);
  let tick = 0;
  let firstBuilding = null;
  let hq = null;
  let initial = null;
  while (!gm.isGameOver && tick < maxTicks) {
    gm.simStep(SIM_DT);
    tick++;
    const mine = gm.buildings.filter((b) => b.ownerId === 1);
    if (initial === null) initial = mine.length;
    const dead = mine.some((b) => b.isDead) || mine.length < initial;
    if (firstBuilding === null && dead) firstBuilding = tick * SIM_DT;
    if (hq === null && mine.length && !mine.some((b) => isHq(b) && !b.isDead)) hq = tick * SIM_DT;
    if (hq !== null) break; // o que interessa já foi medido
  }
  const out = { seed, map, diff, faction, firstBuilding, hq, defeated: !!gm.players[1].defeated, end: tick * SIM_DT };
  gm.dispose();
  return out;
}

const rows = [];
for (const diff of diffs) {
  for (const map of maps) {
    for (let s = first; s < first + seeds; s++) {
      const faction = s % 2 ? 'human' : 'orc';
      const r = run(s, map, diff, faction);
      rows.push(r);
      console.log(`${diff} ${map} seed ${s} ${faction}: 1ª construção ${r.firstBuilding ?? '—'} s · HQ ${r.hq ?? '—'} s · derrota ${r.defeated ? r.end : '—'} s`);
    }
  }
}
const fmt = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} s`);
console.log('\n| dificuldade | partidas | 1ª construção caiu (mín / mediana) | HQ caiu (mín / mediana) | HQ caiu antes de ' + goal + ' s |\n|---|---|---|---|---|');
let bad = 0;
for (const diff of diffs) {
  const g = rows.filter((r) => r.diff === diff);
  const stat = (k) => { const v = g.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? `${fmt(v[0])} / ${fmt(v[Math.floor(v.length / 2)])}` : '— / —'; };
  const early = g.filter((r) => r.hq !== null && r.hq < goal).length;
  if ((diff === 'easy' || diff === 'normal') && early) bad++;
  console.log(`| ${diff} | ${g.length} | ${stat('firstBuilding')} | ${stat('hq')} | ${early} |`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ goal, rows }, null, 1));
process.exit(bad ? 4 : 0);
