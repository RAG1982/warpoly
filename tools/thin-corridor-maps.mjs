#!/usr/bin/env node
/**
 * tools/thin-corridor-maps.mjs (B-arvores-corredor) — "afinar corredor" para mapas FIXOS (não gerados por receita) e medição.
 *   node tools/thin-corridor-maps.mjs --apply campos-1v1,duelo-continental-1 [--seed 1]     reescreve src/data/maps/<id>.json
 *   node tools/thin-corridor-maps.mjs --measure <ids|all> [--base-dir <pasta com JSON antigos>] [--seed 1]
 * `--apply` é idempotente: usa os `count` originais gravados em `meta.corridorThin.original` (a primeira passada os guarda); roda a mesma
 * `thinCorridor` da receita (RNG determinístico por mapa) com a meta de madeira dos mapas de campanha. `--measure` sorteia as árvores
 * de verdade (GameManager, seed de partida) e conta as da faixa do corredor (largura de CORRIDOR_DEFAULTS) antes (`--base-dir`) e depois.
 */
import { register } from 'node:module';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

register('./lib/jsonImportLoader.mjs', import.meta.url);
console.warn = () => {};
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/data/maps');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('--seed', 1));
const W = Number(opt('--width', 0)) || null; // sobrepõe a largura da faixa (ajuste/medição)

const { thinCorridor, makeWoodFn, corridorSegments, distToSegment, CORRIDOR_DEFAULTS: CD } = await import('./lib/corridorThin.mjs');
const CORRIDOR_DEFAULTS = { ...CD, ...(W ? { width: W } : {}) };
const { layoutAt } = await import('../src/sim/MatchConfig.js');
const { buildPathfinder, floodFill, isReached } = await import('../src/data/maps/generator.js');
const { estimateWood } = await import('../src/data/maps/coast/layout.js');

const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const save = (f, m) => writeFileSync(f, JSON.stringify(m, null, 2) + '\n');

if (opt('--apply', null)) {
  for (const id of opt('--apply').split(',')) {
    const file = join(dir, `${id}.json`);
    const m = load(file);
    const orig = m.meta?.corridorThin?.original;
    if (orig) m.forests.forEach((f, i) => { f.count = orig[i]; });
    const original = m.forests.map((f) => f.count);
    const woodMin = 8000;
    const thin = thinCorridor(m, { ...CORRIDOR_DEFAULTS, seed, label: id, woodMin, woodFn: makeWoodFn(m, { buildPathfinder, floodFill, isReached, estimateWood }) });
    m.forests = thin.forests;
    m.meta = { ...(m.meta ?? {}), corridorThin: { width: CORRIDOR_DEFAULTS.width, keepFrac: Math.round(CORRIDOR_DEFAULTS.keepFrac * 100) / 100, clusters: thin.thinned.length, trees: [thin.before, thin.after], cut: thin.thinned, original } };
    if (!orig) m.meta.corridorThin.original = original;
    save(file, m);
    console.log(`${id}: ${thin.thinned.length} bosques afinados; count total ${thin.before} -> ${thin.after}`);
  }
}

const meas = opt('--measure', null);
if (meas) {
  const { loadAllCampaignMaps } = await import('../src/data/maps/index.js');
  await loadAllCampaignMaps();
  const { measureWood } = await import('./lib/woodStats.mjs');
  const ids = meas === 'all' ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')) : meas.split(',');
  const base = opt('--base-dir', null);
  const count = (m) => {
    const r = measureWood(m, { seed });
    const segs = corridorSegments(m);
    const hw = CORRIDOR_DEFAULTS.width / 2;
    const lumbers = m.startSlots.flatMap((s) => layoutAt(s).buildings.filter((b) => b.role === 'lumber'));
    let band = 0, bandOut = 0;
    for (const t of r.gm.trees) {
      const p = { x: t.mesh.position.x, z: t.mesh.position.z };
      if (!segs.some((s) => distToSegment(p, s.a, s.b) <= hw)) continue;
      band++;
      // faixa líquida: sem as árvores a < 30 u de uma base nem a < 26 u (= 14 + raio do bosque ~12) de uma serraria (floresta de coleta)
      if (!m.startSlots.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < CORRIDOR_DEFAULTS.keepRadius) && !lumbers.some((l) => Math.hypot(p.x - l.x, p.z - l.z) < CORRIDOR_DEFAULTS.lumberRadius + 12)) bandOut++;
    }
    r.gm.dispose?.();
    return { total: r.trees, band, bandOut, wood: r.perPlayer.map((x) => x.wood), trees: r.perPlayer.map((x) => x.trees) };
  };
  console.log('id | árvores antes→depois | faixa(28u) antes→depois | faixa líquida (sem bases/serrarias) antes→depois (-%) | madeira/base antes→depois');
  for (const id of ids) {
    const cur = load(join(dir, `${id}.json`));
    if (!cur.startSlots || cur.startSlots.length < 2) continue;
    const b = base ? count(load(join(base, `${id}.json`))) : null;
    const a = count(cur);
    const pct = b && b.bandOut ? Math.round((1 - a.bandOut / b.bandOut) * 100) : '?';
    console.log(`${id} | ${b?.total ?? '-'}→${a.total} | ${b?.band ?? '-'}→${a.band} | ${b?.bandOut ?? '-'}→${a.bandOut} (-${pct}%) | ${b?.wood.join('/') ?? '-'}→${a.wood.join('/')} | arv/base ${b?.trees.join('/') ?? '-'}→${a.trees.join('/')}`);
  }
}
