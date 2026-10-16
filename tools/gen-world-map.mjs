#!/usr/bin/env node
/**
 * tools/gen-world-map.mjs (MUNDO-TERRENO-MAPAS §2.5 e §7.2)
 *
 * Gera mapas costeiros irregulares assados em formato "painted" (com `lavaGrid`, `biomeGrid`, bases, jazidas, florestas, vaus e
 * poços) a partir dos presets de `src/data/maps/coast/presets.js`:
 *   node tools/gen-world-map.mjs --seed 1 [--preset dois-continentes] [--size 224] [--tries 10] [--out mapa.json]
 *   presets: dois-continentes · duelo-continental · arquipelago-vivo · ilha-unica · mundo-campanha
 *
 * A semente é rejeitada se a geografia, o layout (madeira ≥ 8000 por jogador) ou a conectividade falharem; o gerador tenta
 * `seed + 1 … seed + tries − 1` e o resumo (stderr) diz qual semente valeu. Sem `--out`, imprime o JSON no stdout.
 */
import { writeFileSync } from 'node:fs';
import { buildCoastWorld, getCoastPreset, COAST_PRESET_IDS } from '../src/data/maps/coast/index.js';

const opts = { seed: 1, size: null, preset: 'dois-continentes', tries: 10, id: null, name: null, tileset: null, out: null };

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--seed') opts.seed = Number(args[++i]);
  else if (k === '--size') opts.size = Number(args[++i]);
  else if (k === '--preset') opts.preset = args[++i];
  else if (k === '--tries') opts.tries = Number(args[++i]);
  else if (k === '--id') opts.id = args[++i];
  else if (k === '--name') opts.name = args[++i];
  else if (k === '--tileset') opts.tileset = args[++i];
  else if (k === '--out') opts.out = args[++i];
  else {
    console.error(`Opção desconhecida: ${k}`);
    process.exit(1);
  }
}

try {
  let preset = getCoastPreset(opts.preset);
  if (opts.size) preset = { ...preset, options: { ...preset.options, size: opts.size, grid: opts.size } };
  const t0 = performance.now();
  const world = buildCoastWorld(preset, { seed: opts.seed, tries: opts.tries, id: opts.id, name: opts.name, tileset: opts.tileset });
  const ms = Math.round(performance.now() - t0);
  if (!world.ok) {
    console.error(`Nenhuma das ${opts.tries} sementes (${opts.seed}…${opts.seed + opts.tries - 1}) passou na verificação do preset "${preset.id}":`);
    for (const a of world.attempts) console.error(`  semente ${a.seed} (${a.stage}): ${a.failures.slice(0, 2).join(' | ')}`);
    process.exit(1);
  }
  const json = JSON.stringify(world.mapDef, null, 2) + '\n';
  if (opts.out) {
    writeFileSync(opts.out, json);
    console.error(`Mapa gravado com sucesso em ${opts.out}`);
  } else {
    process.stdout.write(json);
  }
  const wood = world.verification.world.checks.wood.join(' / ');
  console.error(`preset ${world.preset}: semente ${world.requestedSeed}${world.seed !== world.requestedSeed ? ` (rejeitada; valeu ${world.seed})` : ''}, ${world.mapDef.startSlots.length} bases, madeira estimada ${wood}, ${ms} ms`);
} catch (err) {
  console.error('Erro ao gerar mapa:', err.message, `(presets: ${COAST_PRESET_IDS.join(', ')})`);
  process.exit(1);
}
