#!/usr/bin/env node
/**
 * F10-02 — soak test IA×IA headless (Node puro). Roda N partidas variando seed/mapa/facção/dificuldade
 * e detecta: exceções, partidas que não terminam, travamento sem progresso, divergência de
 * determinismo (re-roda uma amostra), NaN em recursos/posições e vazamento de entidades.
 *
 *   node tools/soak.mjs [--count 100] [--seed-start 1] [--maps a,b] [--max-ticks 72000]
 *                       [--recheck 3] [--faction human|orc] [--difficulty d] [--stall-ticks 2400] [--out tools/soak-report]
 *   npm run soak -- --count 20      (passa pela trava tools/safe-run.sh)
 *
 * Sai com 0 sem falhas, 3 se houve falhas. Relatório: <out>/soak-report.json e soak-report.md.
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { StallDetector, LeakDetector, hasNonFinite, determinismDiff } from './lib/soakDetector.mjs';

register('./lib/jsonImportLoader.mjs', import.meta.url);
const filt = (orig) => (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return;
  orig(...a);
};
console.warn = filt(console.warn.bind(console));
console.error = filt(console.error.bind(console));

function parseArgs(argv) {
  const o = { count: 100, seedStart: 1, maps: ['continental-1v1', 'estreito-1v1', 'ilhas-4p'], maxTicks: 72000, recheck: 3, faction: null, difficulty: null, stallTicks: 2400, out: 'tools/soak-report' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--count') o.count = Number(next());
    else if (a === '--seed-start') o.seedStart = Number(next());
    else if (a === '--maps') o.maps = next().split(',');
    else if (a === '--max-ticks') o.maxTicks = Number(next());
    else if (a === '--recheck') o.recheck = Number(next());
    else if (a === '--stall-ticks') o.stallTicks = Number(next());
    else if (a === '--faction') o.faction = next();
    else if (a === '--difficulty') o.difficulty = next();
    else if (a === '--out') o.out = next();
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  return o;
}

const DIFFS = ['easy', 'normal', 'hard', 'brutal'];

/** Variação determinística do caso i (seed, mapa, facção do slot 0, dificuldade). */
function caseFor(i, opts) {
  return {
    seed: opts.seedStart + i,
    map: opts.maps[i % opts.maps.length],
    faction: opts.faction || (Math.floor(i / opts.maps.length) % 2 ? 'orc' : 'human'),
    difficulty: opts.difficulty || DIFFS[Math.floor(i / 2) % DIFFS.length]
  };
}

let mods = null;
async function load() {
  if (mods) return mods;
  const THREE = await import('three');
  const { GameManager } = await import('../src/core/GameManager.js');
  await import('../src/ai/registerAI.js');
  const { Terrain } = await import('../src/world/Terrain.js');
  const { createMatchConfig, PLAYER_COLORS } = await import('../src/sim/MatchConfig.js');
  const { getMap } = await import('../src/data/maps/index.js');
  const { SIM_DT } = await import('../src/sim/constants.js');
  const { stateChecksum } = await import('../src/sim/checksum.js');
  mods = { THREE, GameManager, Terrain, createMatchConfig, PLAYER_COLORS, getMap, SIM_DT, stateChecksum };
  return mods;
}

/** Roda uma partida; devolve resumo + `issues`. `detect=false` pula a amostragem (re-run de determinismo). */
async function runMatch(c, opts, detect = true) {
  const { GameManager, Terrain, createMatchConfig, PLAYER_COLORS, getMap, SIM_DT, stateChecksum } = await load();
  const cfg = createMatchConfig({ seed: c.seed, mapId: c.map, difficulty: c.difficulty, localFaction: c.faction, headless: true });
  const mapDef = getMap(c.map);
  const want = mapDef.maxPlayers || cfg.players.length;
  if (want > 2) {
    // Mapas com mais slots que jogadores (ilhas-4p): completa até maxPlayers, 2 times alternados.
    cfg.players = [];
    for (let k = 0; k < want; k++) {
      const orc = (k + (c.faction === 'orc' ? 1 : 0)) % 2 === 1;
      cfg.players.push({ id: k, name: `P${k}`, factionId: orc ? 'orc' : 'human', team: k % 2, color: PLAYER_COLORS[k], isAI: true, isLocal: k === 0, startSlot: k });
    }
  }
  cfg.players.forEach((p) => { p.isAI = true; });
  const issues = [];
  const note = (type, tick, detail) => { if (!issues.some((x) => x.type === type)) issues.push({ type, tick, detail }); };
  let gm = null;
  let tick = 0;
  const stall = new StallDetector(opts.stallTicks);
  const leak = new LeakDetector();
  let finished = false;
  let peak = 0;
  const t0 = Date.now();
  try {
    gm = new GameManager(new Terrain(mapDef), null, null, cfg);
    while (!gm.isGameOver && tick < opts.maxTicks) {
      gm.simStep(SIM_DT);
      tick++;
      if (detect && tick % 20 === 0) {
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
        if (hasNonFinite(nums)) note('nan', tick, 'NaN/Infinity em posição/HP/recurso');
        if (stall.observe(tick, sig.toFixed(3))) note('stall', tick, `sem progresso desde o tick ${stall.stalledAt}`);
        if (tick % 1200 === 0) {
          const n = units.length + gm.buildings.length + gm.arrows.length;
          peak = Math.max(peak, n);
          if (leak.observe(tick, n)) note('leak', tick, `entidades ${leak.leaked.from} → ${leak.leaked.to} em crescimento contínuo`);
        }
      }
    }
    finished = gm.isGameOver;
    if (!finished) note('no-end', tick, `não terminou em ${opts.maxTicks} ticks`);
  } catch (e) {
    note('exception', tick, String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  }
  let checksum = null;
  try { if (gm) checksum = stateChecksum(gm); } catch { /* já registrado */ }
  try { if (gm) gm.dispose(); } catch { /* ignora */ }
  return { ...c, finished, ticks: tick, checksum, peakEntities: peak, wallMs: Date.now() - t0, issues };
}

function report(results, opts, rechecks, wallMs) {
  const total = results.length;
  const endedList = results.filter((r) => r.finished);
  const failures = results.filter((r) => r.issues.length);
  const group = (key) => {
    const g = {};
    for (const r of results) {
      const k = r[key];
      g[k] ||= { n: 0, ended: 0, ticks: 0, fail: 0 };
      g[k].n++;
      if (r.finished) { g[k].ended++; g[k].ticks += r.ticks; }
      if (r.issues.length) g[k].fail++;
    }
    return g;
  };
  const table = (g) => [
    '| chave | partidas | terminaram | ticks médios (terminadas) | com falha |', '|---|---|---|---|---|',
    ...Object.entries(g).map(([k, v]) => `| ${k} | ${v.n} | ${v.ended} (${Math.round((100 * v.ended) / v.n)}%) | ${v.ended ? Math.round(v.ticks / v.ended) : '—'} | ${v.fail} |`)
  ].join('\n');
  const avgTicks = endedList.length ? Math.round(endedList.reduce((s, r) => s + r.ticks, 0) / endedList.length) : 0;
  const cmd = (r) => `node tools/soak.mjs --count 1 --recheck 0 --seed-start ${r.seed} --maps ${r.map} --faction ${r.faction} --difficulty ${r.difficulty} --out /tmp/soak-repro`;
  const badDet = rechecks.filter((x) => x.diff);
  return [
    '# Soak test IA×IA (F10-02)', '',
    `- Partidas: ${total} · terminaram: ${endedList.length} (${Math.round((100 * endedList.length) / Math.max(1, total))}%) · ticks médios até o fim: ${avgTicks} · com falha: ${failures.length}`,
    `- Limite: ${opts.maxTicks} ticks · seeds ${opts.seedStart}..${opts.seedStart + total - 1} · determinismo re-checado em ${rechecks.length} seeds (${badDet.length} divergentes)`,
    `- Tempo real: ${(wallMs / 1000).toFixed(0)} s`, '',
    '## Por mapa', table(group('map')), '', '## Por facção do slot 0', table(group('faction')), '', '## Por dificuldade', table(group('difficulty')), '',
    '## Falhas (reproduzir com o comando)', '',
    ...(failures.length || badDet.length ? [] : ['_nenhuma_']),
    ...failures.flatMap((r) => r.issues.map((i) => `- **${i.type}** seed ${r.seed} (${r.map}/${r.faction}/${r.difficulty}) tick ${i.tick}: ${i.detail}\n  - \`${cmd(r)}\``)),
    ...badDet.map((x) => `- **determinism** seed ${x.seed} (${x.map}): ${x.diff}\n  - \`${cmd(x)}\` (rodar duas vezes e comparar checksum)`), ''
  ].join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const results = [];
  for (let i = 0; i < opts.count; i++) {
    const c = caseFor(i, opts);
    const r = await runMatch(c, opts);
    results.push(r);
    console.log(`[${i + 1}/${opts.count}] seed ${c.seed} ${c.map} ${c.faction} ${c.difficulty}: ${r.finished ? 'fim' : 'NÃO terminou'} ${r.ticks} ticks ${(r.wallMs / 1000).toFixed(1)}s${r.issues.length ? ' ISSUES ' + r.issues.map((x) => x.type).join(',') : ''}`);
  }
  // Determinismo: re-roda partidas espalhadas (sem exceção) e compara checksum/ticks.
  const rechecks = [];
  const pool = results.filter((r) => !r.issues.some((x) => x.type === 'exception') && r.checksum !== null);
  const step = Math.max(1, Math.floor(pool.length / Math.max(1, opts.recheck)));
  for (let k = 0; k < opts.recheck && k * step < pool.length; k++) {
    const a = pool[k * step];
    const b = await runMatch(a, opts, false);
    const diff = determinismDiff(a, b);
    rechecks.push({ seed: a.seed, map: a.map, faction: a.faction, difficulty: a.difficulty, diff });
    console.log(`determinismo seed ${a.seed}: ${diff ? 'DIVERGIU ' + diff : 'ok'}`);
  }
  const wallMs = Date.now() - t0;
  fs.mkdirSync(opts.out, { recursive: true });
  fs.writeFileSync(path.join(opts.out, 'soak-report.json'), JSON.stringify({ opts, wallMs, results, rechecks }, null, 1));
  fs.writeFileSync(path.join(opts.out, 'soak-report.md'), report(results, opts, rechecks, wallMs));
  const bad = results.filter((r) => r.issues.length).length + rechecks.filter((x) => x.diff).length;
  console.log(`soak: ${results.length} partidas, ${results.filter((r) => r.finished).length} terminaram, ${bad} com falha -> ${opts.out}/soak-report.md`);
  return bad ? 3 : 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('soak falhou:', e); process.exit(1); });
