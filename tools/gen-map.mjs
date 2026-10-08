#!/usr/bin/env node
/**
 * F8-02 — gerador procedural de mapas (CLI). Mesma seed ⇒ mesmo JSON.
 *
 *   node tools/gen-map.mjs --seed 7 --players 4 --size 128 [--naval] [--theme verdejante|ilhas]
 *                          [--forest 1.0] [--symmetry rotational|mirror] --out mapa.json
 *
 * Sem `--out` imprime o JSON em stdout. Ver `src/data/maps/generator.js`.
 */
import { writeFileSync } from 'node:fs';
import { generateMap } from '../src/data/maps/generator.js';

const o = { seed: 1, players: 2, size: 128, naval: false };
let out = null;
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) {
  const k = a[i];
  if (k === '--seed') o.seed = Number(a[++i]);
  else if (k === '--players') o.players = Number(a[++i]);
  else if (k === '--size') o.size = Number(a[++i]);
  else if (k === '--naval') o.naval = true;
  else if (k === '--theme') o.theme = a[++i];
  else if (k === '--forest') o.forestDensity = Number(a[++i]);
  else if (k === '--symmetry') o.symmetry = a[++i];
  else if (k === '--out') out = a[++i];
  else { console.error(`opção desconhecida: ${k}`); process.exit(1); }
}
try {
  const json = JSON.stringify(generateMap(o), null, 2) + '\n';
  if (out) { writeFileSync(out, json); console.error(`mapa gravado em ${out}`); } else process.stdout.write(json);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
