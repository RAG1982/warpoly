#!/usr/bin/env node
/**
 * tools/measure-oil.mjs (OIL-FAR) — distância de NAVEGAÇÃO (u) da doca de cada jogador até cada poço de petróleo de um mapa gravado.
 *   node tools/measure-oil.mjs camp-04-baixio-do-breu [estreito-naval-1v1 ...]
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
register('./lib/jsonImportLoader.mjs', import.meta.url);
console.warn = () => {};
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { makeCtx } = await import('./lib/campaignMaps.mjs');
const { navDist, dockOf } = await import('./lib/farOil.mjs');

for (const id of process.argv.slice(2)) {
  const m = JSON.parse(readFileSync(join(root, 'src/data/maps', `${id}.json`), 'utf8'));
  const ctx = makeCtx(m);
  const docks = m.startSlots.map((s, i) => dockOf(ctx, s, m.anchors?.[`shipyard${i + 1}Water`] ?? null));
  const fields = docks.map((d) => navDist(ctx.sea, d.x, d.z));
  console.log(`== ${id} (size ${m.size}) docks: ${docks.map((d) => `(${Math.round(d.x)},${Math.round(d.z)})`).join(' ')}`);
  m.resources.filter((r) => r.type === 'oil').forEach((w, i) => {
    console.log(`  #${i} (${w.x}, ${w.z}) x${w.amount}  nav: ${fields.map((f) => Math.round(f.at(w.x, w.z))).join(' / ')}`);
  });
}
