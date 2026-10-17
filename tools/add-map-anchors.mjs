#!/usr/bin/env node
/**
 * tools/add-map-anchors.mjs (M2-01) — grava as âncoras padrão (`defaultAnchors`, src/data/maps/anchors.js) em mapas JSON
 * que ainda não as têm, sem regenerar o terreno. Âncoras já escritas à mão são mantidas. Idempotente.
 *   node tools/add-map-anchors.mjs [arquivo.json …]        (sem argumentos: os mapas costeiros do MUNDO-7 e os de pendentes/)
 *   node tools/add-map-anchors.mjs --check [arquivo …]      (só confere; sai com 1 se algum mapa mudaria)
 * A chave `anchors` fica logo antes de `meta` (mesma ordem de `buildCoastWorld`), então regenerar o mapa dá o mesmo arquivo.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultAnchors } from '../src/data/maps/anchors.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/data/maps');
const args = process.argv.slice(2);
const check = args.includes('--check');
let files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  files = [
    ...readdirSync(dir).filter((f) => /^(duelo-continental|ilha-unica)-\d+\.json$/.test(f)).map((f) => join(dir, f)),
    ...readdirSync(join(dir, 'pendentes')).filter((f) => f.endsWith('.json')).map((f) => join(dir, 'pendentes', f))
  ];
}

let changed = 0;
for (const file of files) {
  const map = JSON.parse(readFileSync(file, 'utf8'));
  const anchors = defaultAnchors(map);
  if (JSON.stringify(map.anchors) === JSON.stringify(anchors)) continue;
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    if (k === 'anchors') continue;
    if (k === 'meta') out.anchors = anchors;
    out[k] = v;
  }
  if (!('anchors' in out)) out.anchors = anchors;
  changed++;
  console.error(`${check ? 'mudaria' : 'âncoras gravadas'}: ${file} (${Object.keys(anchors).length})`);
  if (!check) writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
}
if (check && changed) process.exit(1);
