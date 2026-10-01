#!/usr/bin/env node
/**
 * F2-08 — partida IA×IA headless em Node puro (sem Vite, navegador, DOM ou WebGL).
 *
 *   node tools/headless-match.js --seed 1
 *   node tools/headless-match.js --seed 7 --map ilhas-4p --difficulty hard --victory regicide --max-minutes 45
 *   node tools/headless-match.js --seed 3 --ffa --json
 *
 * Todos os jogadores viram IA (inclusive o "local"), a simulação roda em passos fixos de SIM_DT (20 Hz)
 * até alguém vencer (`gm.isGameOver`) ou estourar `--max-minutes` (padrão 60 min simulados). Sai com
 * código 0 se a partida terminou, 2 se estourou o limite, 1 em erro. O checksum final
 * (`src/sim/checksum.js`) permite comparar execuções (determinismo: mesma seed ⇒ mesma saída).
 *
 * Opções: --seed N (1)  --map <id>  --difficulty easy|normal|hard  --victory conquest|regicide  --ffa
 *         --max-minutes N (60)  --json (uma linha JSON)  --quiet (só o resumo final)
 */
import { register } from 'node:module';

// `src/data/maps/index.js` importa .json sem atributo (Vite/Vitest aceitam, Node 22 puro não).
register('./lib/jsonImportLoader.mjs', import.meta.url);

// Ruído conhecido em Node: o carregador de modelos .glb tenta buscar URLs relativas do navegador.
const warn = console.warn.bind(console);
console.warn = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; warn(...a); };
const err = console.error.bind(console);
console.error = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; err(...a); };

function parseArgs(argv) {
  const o = { seed: 1, map: null, difficulty: null, victory: null, ffa: false, maxMinutes: 60, json: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--seed') o.seed = Number(next());
    else if (a === '--map') o.map = next();
    else if (a === '--difficulty') o.difficulty = next();
    else if (a === '--victory') o.victory = next();
    else if (a === '--ffa') o.ffa = true;
    else if (a === '--max-minutes') o.maxMinutes = Number(next());
    else if (a === '--json') o.json = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!Number.isFinite(o.seed)) throw new Error('--seed precisa ser um número');
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('uso: node tools/headless-match.js --seed N [--map id] [--difficulty d] [--victory modo] [--ffa] [--max-minutes N] [--json] [--quiet]');
    return 0;
  }

  const THREE = await import('three');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { Terrain } = await import('../src/world/Terrain.js');
  const { createMatchConfig } = await import('../src/sim/MatchConfig.js');
  const { getMap } = await import('../src/data/maps/index.js');
  const { SIM_DT } = await import('../src/sim/constants.js');
  const { stateChecksum } = await import('../src/sim/checksum.js');

  const spec = { seed: opts.seed, headless: true, ffa: opts.ffa };
  if (opts.map) spec.mapId = opts.map;
  if (opts.difficulty) spec.difficulty = opts.difficulty;
  if (opts.victory) spec.victoryMode = opts.victory;
  const cfg = createMatchConfig(spec);
  cfg.players.forEach((p) => { p.isAI = true; });

  const scene = new THREE.Scene();
  const gm = new GameManager(scene, new Terrain(scene, getMap(cfg.mapId)), null, null, cfg);

  const maxTicks = Math.round((opts.maxMinutes * 60) / SIM_DT);
  const t0 = Date.now();
  let tick = 0;
  while (!gm.isGameOver && tick < maxTicks) {
    gm.simStep(SIM_DT);
    tick++;
    if (!opts.quiet && !opts.json && tick % 6000 === 0) {
      const alive = gm.players.filter(p => !p.defeated).length;
      console.log(`  ... ${(tick * SIM_DT / 60).toFixed(0)} min simulados, ${gm.allUnits.length} unidades, ${gm.buildings.length} construções, ${alive} jogadores vivos`);
    }
  }
  const wallMs = Date.now() - t0;

  const finished = gm.isGameOver;
  const snap = gm.result || gm.matchStats.snapshot();
  const summary = {
    seed: opts.seed,
    map: cfg.mapId,
    difficulty: cfg.difficulty,
    victoryMode: cfg.victoryMode,
    players: cfg.players.length,
    finished,
    ticks: tick,
    simMinutes: Math.round((tick * SIM_DT / 60) * 10) / 10,
    wallMs,
    ticksPerSecond: Math.round(tick / Math.max(0.001, wallMs / 1000)),
    winnerTeam: snap.winnerTeam ?? null,
    checksum: stateChecksum(gm),
    perPlayer: snap.players.map(p => ({ id: p.id, name: p.name, faction: p.factionId, defeated: !!p.defeated, kills: p.unitsKilled, lost: p.unitsLost, buildingsDestroyed: p.buildingsDestroyed, buildingsLost: p.buildingsLost, score: Math.round(p.score) }))
  };

  if (opts.json) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(`Partida IA×IA ${finished ? 'terminou' : 'NÃO terminou (limite de tempo)'} — seed ${summary.seed}, mapa ${summary.map}, ${summary.players} jogadores`);
    console.log(`  ${summary.ticks} ticks = ${summary.simMinutes} min simulados em ${(wallMs / 1000).toFixed(1)} s (${summary.ticksPerSecond} ticks/s)`);
    console.log(`  vencedor: time ${summary.winnerTeam === null ? '—' : summary.winnerTeam} · checksum ${summary.checksum}`);
    for (const p of summary.perPlayer) {
      console.log(`  P${p.id} ${p.name} (${p.faction})${p.defeated ? ' [derrotado]' : ''}: ${p.kills} abates / ${p.lost} baixas, ${p.buildingsDestroyed} destruídas / ${p.buildingsLost} perdidas, pontos ${p.score}`);
    }
  }
  gm.dispose();
  return finished ? 0 : 2;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('headless-match falhou:', e);
  process.exit(1);
});
