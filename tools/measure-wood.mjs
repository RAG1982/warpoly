#!/usr/bin/env node
/**
 * tools/measure-wood.mjs — mede a oferta de madeira de cada mapa (Node puro, sem navegador).
 *   node tools/measure-wood.mjs [--maps a,b] [--radius 60] [--seed 1] [--json]
 * Para cada mapa: size/playable, nº de árvores, madeira total (soma de `woodRemaining`) e, por jogador
 * (um por startSlot), a madeira ALCANÇÁVEL por terra (mesmo critério do `src/ai/AIWood.js`: região conexa da camada
 * estática do Pathfinder) a até R unidades do pátio. Árvores nascem de `spawnWoodlands` (seed-dependente).
 * A meta documentada (`WOOD_TARGET`, em tools/lib/woodStats.mjs) é conferida por tests/unit/mapsWood.test.js.
 */
import { register } from 'node:module';

register('./lib/jsonImportLoader.mjs', import.meta.url);
console.warn = () => {};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const R = Number(opt('--radius', 60));
const seed = Number(opt('--seed', 1));
const only = opt('--maps', null)?.split(',');

const { listMaps, loadAllCampaignMaps } = await import('../src/data/maps/index.js');
await loadAllCampaignMaps(); // M2-28: mapas de campanha carregam sob demanda
const { measureWood } = await import('./lib/woodStats.mjs');

const rows = [];
for (const m of listMaps({ includeHidden: true })) {
  if (only && !only.includes(m.id)) continue;
  const { gm, ...r } = measureWood(m, { radius: R, seed });
  gm.dispose?.();
  rows.push(r);
}
if (args.includes('--json')) console.log(JSON.stringify(rows));
else {
  console.log(`R=${R} seed=${seed}`);
  console.log('mapa | size/playable | jogadores | árvores | madeira total | total/jog | alcançável ≤R min / média | por slot');
  for (const r of rows) {
    console.log(`${r.id} | ${r.size}/${r.playable} | ${r.players} | ${r.trees} | ${r.total} | ${Math.round(r.total / r.players)} | ${r.minWood} / ${r.avgWood} | ${r.perPlayer.map((x) => x.wood).join(',')}`);
  }
}
