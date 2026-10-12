#!/usr/bin/env node
/**
 * tools/proto/irregular-coast.mjs — PROTÓTIPO (spec docs/specs/MUNDO-TERRENO-MAPAS.md §2 e §B; não integrado ao jogo).
 *   node tools/proto/irregular-coast.mjs [--seeds 1,2,3] [--px 768] [--out docs/refs/mundo/previews]
 * Gera mapas (2 continentes + ilhas de tipos diferentes), grava PNGs de prévia (bioma + "mapa antigo"), PNGs de máscara dos
 * mapas ATUAIS do jogo (continental-1v1, ilhas-4p, arquipelago-naval-4p) e `metrics.json` com o índice de irregularidade
 * antes × depois. Node puro, sem GPU.
 */
import { register } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodePng } from '../lib/png.mjs';
import { generateIrregularCoast, lavaStats, irregularityIndex, outerIrregularity, coastFractalDimension, landMaskFromHeight, BIOME_NAMES } from '../lib/irregularCoast.mjs';
import { renderBiomePreview, renderParchmentPreview, renderMaskPreview, lavaIslandView } from '../lib/irregularCoastRender.mjs';

register('../lib/jsonImportLoader.mjs', import.meta.url);
console.warn = () => {};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seeds = opt('--seeds', '1,2,3').split(',').map(Number);
const px = Number(opt('--px', 768));
const out = resolve(opt('--out', 'docs/refs/mundo/previews'));
mkdirSync(out, { recursive: true });

const metrics = { generated: {}, current: {} };
for (const seed of seeds) {
  const t0 = performance.now();
  const map = generateIrregularCoast({ seed });
  const ms = Math.round(performance.now() - t0);
  writeFileSync(resolve(out, `seed-${seed}.png`), encodePng(renderBiomePreview(map, px)));
  const lview = lavaIslandView(map);
  if (lview) writeFileSync(resolve(out, `vulcanica-lava-seed-${seed}.png`), encodePng(renderBiomePreview(map, 640, lview)));
  if (seed === seeds[0]) writeFileSync(resolve(out, `mapa-antigo-seed-${seed}.png`), encodePng(renderParchmentPreview(map, px)));
  const s = map.stats;
  metrics.generated[seed] = {
    ms, landFraction: +s.landFraction.toFixed(3), landComponents: s.landComponents, lakes: s.lakes,
    irregularityAll: +s.irregularity.all.toFixed(3), irregularityWeighted: +s.irregularity.weighted.toFixed(3), irregularityLargest: +s.irregularity.largest.toFixed(3), fractalDim: +s.fractalDim.toFixed(3),
    lava: lavaStats(map),
    entities: s.perEntity.map((p) => `${p.id}[${p.biome}] ${Math.round(p.area)}u2 idx=${p.index.toFixed(2)}`)
  };
  console.log(`seed ${seed}: ${ms} ms, terra ${(s.landFraction * 100).toFixed(1)}%, componentes ${s.landComponents}, irregularidade ${s.irregularity.all.toFixed(2)} ponderada ${s.irregularity.weighted.toFixed(2)} (maior ${s.irregularity.largest.toFixed(2)}), D ${s.fractalDim.toFixed(3)}`);
}

const { getMap } = await import('../../src/data/maps/index.js');
const { getHeightForMap } = await import('../../src/sim/terrainGenerators.js');
for (const id of ['continental-1v1', 'ilhas-4p', 'arquipelago-naval-4p']) {
  const def = getMap(id);
  const mask = landMaskFromHeight(def, getHeightForMap, 256);
  const idx = irregularityIndex(mask, 256);
  const outer = outerIrregularity(mask, 256);
  metrics.current[id] = { irregularityAll: +idx.all.toFixed(3), irregularityWeighted: +idx.weighted.toFixed(3), irregularityLargest: +idx.largest.toFixed(3), outerWeighted: +outer.weighted.toFixed(3), fractalDim: +coastFractalDimension(mask, 256).toFixed(3) };
  writeFileSync(resolve(out, `atual-${id}.png`), encodePng(renderMaskPreview(mask, 256, 512)));
  console.log(`atual ${id}: irregularidade ${idx.all.toFixed(2)} ponderada ${idx.weighted.toFixed(2)} (maior ${idx.largest.toFixed(2)}), sem rio/canais ${outer.weighted.toFixed(2)}, D ${metrics.current[id].fractalDim}`);
}
metrics.legend = BIOME_NAMES;
writeFileSync(resolve(out, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
