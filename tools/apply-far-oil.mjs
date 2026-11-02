#!/usr/bin/env node
/**
 * tools/apply-far-oil.mjs (OIL-FAR) — aplica a receita de poços longe da costa (`FAR_OIL` em tools/lib/farOil.mjs) num mapa JÁ GRAVADO,
 * mexendo SÓ em `resources` (poços de petróleo) e nas âncoras `well1..n`; o resto do JSON fica byte a byte igual. Para mapas cujo JSON
 * divergiu da receita por ajustes manuais antigos (ex.: camp-04, `outpost1`), onde regerar mexeria em mais coisas.
 *   node tools/apply-far-oil.mjs --id camp-04-baixio-do-breu [--write]
 */
import { register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
register('./lib/jsonImportLoader.mjs', import.meta.url);
console.warn = () => {};
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { makeCtx } = await import('./lib/campaignMaps.mjs');
const { applyFarOil } = await import('./lib/farOil.mjs');
const args = process.argv.slice(2);
const id = args[args.indexOf('--id') + 1];
const file = join(root, 'src/data/maps', `${id}.json`);
const m = JSON.parse(readFileSync(file, 'utf8'));
const ctx = makeCtx(m);
const rep = applyFarOil(id, ctx, m.anchors);
if (!rep) { console.error(`sem receita FAR_OIL para ${id}`); process.exit(1); }
let n = 0;
for (const r of m.resources) if (r.type === 'oil') { n++; const a = m.anchors[`well${n}`]; if (a) { a.x = r.x; a.z = r.z; } }
console.log(rep.map((r) => `#${r.index} -> (${r.x}, ${r.z}) nav ${r.nav}`).join('\n'));
if (args.includes('--write')) { writeFileSync(file, JSON.stringify(m, null, 2) + '\n'); console.log('gravado: ' + file); }
