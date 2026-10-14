#!/usr/bin/env node
/**
 * tools/gen-world-map.mjs (MUNDO-TERRENO-MAPAS §2.5 e §7.2)
 *
 * Gera mapas costeiros irregulares assados em formato "painted" com suporte a lavaGrid:
 *   node tools/gen-world-map.mjs --seed 1 [--preset dois-continentes] [--size 192] [--out mapa.json]
 *
 * Sem `--out`, imprime o JSON resultante no stdout.
 */
import { writeFileSync } from 'node:fs';
import { generateIrregularCoast, bakeToMapDef } from './lib/irregularCoast.mjs';

const PRESETS = {
  'dois-continentes': {
    name: 'Guerra dos Dois Continentes',
    tileset: 'vulcanico',
    lava: true,
    islands: 6
  },
  'ilha-unica': {
    name: 'Ilha dos Estilhaços',
    tileset: 'exuberante',
    lava: false,
    islands: 1
  },
  'arquipelago-vivo': {
    name: 'Arquipélago do Mar Fendido',
    tileset: 'exuberante',
    lava: false,
    islands: 8
  }
};

const opts = {
  seed: 1,
  size: 192,
  preset: 'dois-continentes',
  id: null,
  name: null,
  tileset: null,
  out: null
};

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--seed') opts.seed = Number(args[++i]);
  else if (k === '--size') opts.size = Number(args[++i]);
  else if (k === '--preset') opts.preset = args[++i];
  else if (k === '--id') opts.id = args[++i];
  else if (k === '--name') opts.name = args[++i];
  else if (k === '--tileset') opts.tileset = args[++i];
  else if (k === '--out') opts.out = args[++i];
  else {
    console.error(`Opção desconhecida: ${k}`);
    process.exit(1);
  }
}

const presetConfig = PRESETS[opts.preset] || PRESETS['dois-continentes'];
const id = opts.id || `mundo-${opts.preset}-${opts.seed}`;
const name = opts.name || presetConfig.name;
const tileset = opts.tileset || presetConfig.tileset;

try {
  const coast = generateIrregularCoast({
    seed: opts.seed,
    size: opts.size,
    islands: presetConfig.islands,
    lava: presetConfig.lava
  });

  const mapDef = bakeToMapDef(coast, {
    id,
    name,
    tileset,
    playable: opts.size - 12
  });

  const json = JSON.stringify(mapDef, null, 2) + '\n';
  if (opts.out) {
    writeFileSync(opts.out, json);
    console.error(`Mapa gravado com sucesso em ${opts.out}`);
  } else {
    process.stdout.write(json);
  }
} catch (err) {
  console.error(`Erro ao gerar mapa:`, err.message);
  process.exit(1);
}
