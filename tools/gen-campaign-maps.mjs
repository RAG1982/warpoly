#!/usr/bin/env node
/**
 * tools/gen-campaign-maps.mjs (M2-03 · mapas de campanha)
 *
 * Gera os mapas de campanha do lote M2-03 (1 Baía de Aurelan, 2 Pouso do Encontro, 3 Pedra-Mãe) com o assador de costas e a receita de
 * `tools/lib/campaignMaps.mjs`, e grava a prévia PNG (relevo, bases, jazidas, bosques, acampamentos e âncoras numeradas).
 *   node tools/gen-campaign-maps.mjs --id camp-01-baia-de-aurelan --seed 1 [--tries 12] [--px 768]
 *        [--preview docs/refs/mundo/previews/campanha/<id>.png] [--write]      (--write grava src/data/maps/<id>.json)
 *   node tools/gen-campaign-maps.mjs --id camp-03-pedra-mae --scan 1-8 --preview-dir /tmp/prev     (uma prévia por semente; sem gravar)
 * Sem `--write`, nada em src/ é alterado.
 */
import { register } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

register('./lib/jsonImportLoader.mjs', import.meta.url);
console.warn = () => {};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { buildCampaignMap, CAMPAIGN_IDS, CAMPAIGN_PRESETS } = await import('./lib/campaignMaps.mjs');
const { renderBiomePreview } = await import('./lib/irregularCoastRender.mjs');
const { encodePng } = await import('./lib/png.mjs');
const { validateMapDef } = await import('../src/data/maps/validate.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const id = opt('--id', null);
const px = Number(opt('--px', 768));
const tries = Number(opt('--tries', 12));
if (!id || !CAMPAIGN_PRESETS[id]) { console.error(`--id obrigatório (${CAMPAIGN_IDS.join(', ')})`); process.exit(1); }

// ---- desenho das marcações sobre a prévia ----
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function put(img, x, y, rgb, a = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4;
  for (let c = 0; c < 3; c++) img.data[o + c] = img.data[o + c] * (1 - a) + rgb[c] * a;
}
const disc = (img, cx, cy, r, rgb, a = 1) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(img, cx + x, cy + y, rgb, a); };
const ring = (img, cx, cy, r, rgb, a = 1) => { for (let k = 0; k < 120; k++) { const t = (k / 120) * Math.PI * 2; put(img, cx + Math.cos(t) * r, cy + Math.sin(t) * r, rgb, a); put(img, cx + Math.cos(t) * (r - 1), cy + Math.sin(t) * (r - 1), rgb, a); } };
function number(img, x, y, n, rgb) {
  const s = String(n);
  const sc = 2;
  s.split('').forEach((ch, i) => {
    const g = DIGITS[+ch];
    for (let k = 0; k < 15; k++) if (g[k] === '1') for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) put(img, x + i * 4 * sc + (k % 3) * sc + a, y + Math.floor(k / 3) * sc + b, rgb, 1);
  });
}
function overlay(img, m, anchorNames) {
  const W = img.width, k = W / m.size;
  const P = (p) => [(p.x + m.size / 2) * k, (p.z + m.size / 2) * k];
  const half = m.playable / 2;
  // área jogável
  for (let t = -half; t <= half; t += 0.5) for (const [x, z] of [[t, -half], [t, half], [-half, t], [half, t]]) { const [a, b] = P({ x, z }); put(img, a, b, [255, 255, 255], 0.25); }
  for (const f of m.forests) { const [a, b] = P(f); ring(img, a, b, f.radius * k, [20, 90, 30], 0.7); }
  for (const f of m.fords) { const [a, b] = P(f); ring(img, a, b, Math.max(3, f.r * k), [255, 160, 40], 0.9); }
  for (const r of m.resources) {
    const [a, b] = P(r);
    const col = r.type === 'gold' ? [255, 215, 0] : r.type === 'stone' ? [200, 200, 205] : [20, 20, 20];
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) put(img, a + x, b + y, [0, 0, 0], 0.9);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) put(img, a + x, b + y, col, 1);
  }
  for (const n of m.neutrals) {
    if (n.kind !== 'camp') continue;
    const [a, b] = P(n);
    ring(img, a, b, 9, [230, 30, 30], 1); disc(img, a, b, 4, [230, 30, 30], 1);
  }
  m.startSlots.forEach((s, i) => {
    const [a, b] = P(s);
    const col = [[60, 120, 255], [235, 60, 50], [60, 200, 90], [240, 200, 40]][i % 4];
    ring(img, a, b, 13, [255, 255, 255], 1); disc(img, a, b, 8, col, 1); ring(img, a, b, 8, [0, 0, 0], 1);
    number(img, a - 3, b - 5, i, [255, 255, 255]);
  });
  anchorNames.forEach((name, i) => {
    const an = m.anchors[name];
    const [a, b] = P(an);
    const col = an.water ? [160, 235, 255] : [255, 90, 220];
    for (let d = -4; d <= 4; d++) { put(img, a + d, b, col, 1); put(img, a, b + d, col, 1); }
    disc(img, a, b, 2, [0, 0, 0], 1);
    number(img, a + 6, b - 4, i + 1, [255, 255, 255]);
  });
}

function summarize(res) {
  const m = res.mapDef;
  const s = m.startSlots;
  const lines = [];
  lines.push(`${m.id}: semente pedida ${res.seed}, valeu ${res.seedUsed}; tamanho ${m.size} (jogável ${m.playable}); ${s.length} bases`);
  lines.push(`  distância entre bases: ${Math.round(Math.hypot(s[0].x - s[1].x, s[0].z - s[1].z))} u; madeira estimada por base: ${res.verification.checks.wood.join(' / ')}`);
  const gold = m.resources.filter((r) => r.type === 'gold').length, stone = m.resources.filter((r) => r.type === 'stone').length;
  lines.push(`  recursos: ${gold} minas de ouro (${m.resources.find((r) => r.type === 'gold')?.amount} cada), ${stone} pedreiras, ${m.forests.length} bosques, ${m.neutrals.filter((n) => n.kind === 'camp').length} acampamento(s), ${m.fords.length} vaus`);
  return lines.join('\n');
}

function renderPreview(res, outPath) {
  const img = renderBiomePreview(res.world.map, px);
  const names = Object.keys(res.mapDef.anchors).filter((n) => !/^(forest|ford|stoneQuarry)\d+$/.test(n));
  overlay(img, res.mapDef, names);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePng(img));
  return names;
}

const scan = opt('--scan', null);
if (scan) {
  const [a, b] = scan.split('-').map(Number);
  const dir = resolve(opt('--preview-dir', '/tmp/camp-prev'));
  for (let s = a; s <= b; s++) {
    const t0 = performance.now();
    const res = buildCampaignMap(id, { seed: s, tries: 1 });
    if (!res.ok) { console.log(`semente ${s}: rejeitada (${res.attempts.map((x) => x.stage + ': ' + x.failures[0]).join(' | ')})`); continue; }
    renderPreview(res, join(dir, `${id}-s${s}.png`));
    console.log(summarize(res) + `  [${Math.round(performance.now() - t0)} ms]`);
  }
  process.exit(0);
}

const seed = Number(opt('--seed', 1));
const res = buildCampaignMap(id, { seed, tries });
if (!res.ok) {
  console.error(`Nenhuma semente ${seed}…${seed + tries - 1} serve:`);
  for (const a of res.attempts) console.error(`  ${a.seed} (${a.stage}): ${a.failures.slice(0, 2).join(' | ')}`);
  process.exit(1);
}
console.log(summarize(res));
const v = validateMapDef(res.mapDef, { checkId: false });
console.log(`validateMapDef: ${v.errors.length} erros, ${v.warnings.length} avisos`);
for (const e of [...v.errors, ...v.warnings]) console.log(`  ${e.level} ${e.code} ${JSON.stringify(e.params)}`);
const prev = opt('--preview', null);
if (prev) {
  const names = renderPreview(res, resolve(prev));
  console.log(`prévia: ${prev}`);
  names.forEach((n, i) => console.log(`  ${i + 1} ${n} (${res.mapDef.anchors[n].x}, ${res.mapDef.anchors[n].z})${res.mapDef.anchors[n].water ? ' [água]' : ''}`));
}
if (args.includes('--write')) {
  const file = join(root, 'src/data/maps', `${id}.json`);
  writeFileSync(file, JSON.stringify(res.mapDef, null, 2) + '\n');
  console.log(`gravado: ${file}`);
}
