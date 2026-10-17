#!/usr/bin/env node
/**
 * tools/regen-biomegrid.mjs (M2-26) — regenera SÓ o `biomeGrid` de mapas costeiros já assados (src/data/maps/<id>.json), pelo gerador
 * (`buildCoastWorld` com o preset e a semente gravados em `meta`), sem tocar em terreno, bases, jazidas, florestas, âncoras, vaus nem lava.
 *
 *   node tools/regen-biomegrid.mjs [id … | arquivo.json …]     (sem argumentos: os 6 mapas do MUNDO-7)
 *   node tools/regen-biomegrid.mjs --check [id …]               (só confere; sai com 1 se algum mapa mudaria)
 *
 * Segurança: o mapa regenerado precisa ter `terrain`, `startSlots`, `resources` (tipo e posição; a quantidade de ouro foi ajustada à mão), `fords`, `neutrals`, `anchors`, `lavaGrid` e as
 * POSIÇÕES das florestas IDÊNTICOS aos do arquivo (as espécies das florestas mudaram depois e não entram na conta); senão o arquivo
 * não é alterado e o script falha. O `biomeGrid` não entra na sim nem no checksum (render e decoração apenas).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoastWorld } from '../src/data/maps/coast/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/data/maps');
const args = process.argv.slice(2);
const check = args.includes('--check');
const ids = args.filter((a) => !a.startsWith('--'));
const DEFAULT = ['duelo-continental-1', 'duelo-continental-2', 'duelo-continental-3', 'ilha-unica-1', 'ilha-unica-2', 'ilha-unica-3'];
const files = (ids.length ? ids : DEFAULT).map((a) => (a.endsWith('.json') ? a : join(dir, `${a}.json`)));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const resPos = (m) => (m.resources || []).map(({ amount, ...r }) => r); // a quantidade de ouro foi ajustada à mão (7.500) depois da geração
const forestPos = (m) => (m.forests || []).map((f) => [f.x, f.z, f.count, f.radius]);
let changed = 0, failed = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const map = JSON.parse(text);
  const meta = map.meta || {};
  if (meta.generator !== 'coast') { console.error(`${basename(file)}: não é um mapa do gerador costeiro (meta.generator)`); failed++; continue; }
  const w = buildCoastWorld(meta.preset, { seed: meta.seed, tries: 10, id: map.id, name: map.name, tileset: map.tileset });
  if (!w.ok || w.seed !== meta.seedUsed) { console.error(`${basename(file)}: o gerador não reproduz a semente (${meta.preset} ${meta.seed} → usada ${w.seed})`); failed++; continue; }
  const g = w.mapDef;
  const bad = ['terrain', 'startSlots', 'fords', 'neutrals', 'anchors', 'lavaGrid'].filter((k) => !same(g[k], map[k]));
  if (!same(resPos(g), resPos(map))) bad.push('resources(tipo/posição)');
  if (!same(forestPos(g), forestPos(map))) bad.push('forests(posições)');
  if (bad.length) { console.error(`${basename(file)}: o gerador atual difere do arquivo em ${bad.join(', ')}; nada gravado`); failed++; continue; }
  if (same(g.biomeGrid, map.biomeGrid)) { console.error(`${basename(file)}: biomeGrid já está atualizado`); continue; }
  const out = {};
  for (const [k, v] of Object.entries(map)) out[k] = k === 'biomeGrid' ? g.biomeGrid : v;
  if (JSON.stringify(map, null, 2) + '\n' !== text) { console.error(`${basename(file)}: formatação do arquivo difere da canônica; nada gravado`); failed++; continue; }
  changed++;
  console.error(`${check ? 'mudaria' : 'biomeGrid regenerado'}: ${basename(file)}`);
  if (!check) writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
}
if (failed || (check && changed)) process.exit(1);
