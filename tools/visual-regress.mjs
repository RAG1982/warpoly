#!/usr/bin/env node
/**
 * F10-03 · Regressão visual: captura todos os modelos do inspetor (MODEL_CATALOG) e as telas
 * principais da HUD em 3 resoluções, compara com a baseline commitada e gera relatório.
 *
 *   npm run visual                      compara com a baseline; falha se algum diff > limiar
 *   npm run visual -- --update          regrava a baseline (só do estado atual do master)
 *   opções: --res 1280x720[,..]   --only <regex no nome do alvo>   --pixel-tol 24   --max-ratio 0.002
 *
 * Rode SOMENTE via safe-run (capturas são pesadas, ver CLAUDE.md):
 *   bash tools/safe-run.sh --timeout 1800 -- node tools/visual-regress.mjs --update
 * GPU real obrigatória: aborta se o WebGL for de software (assertHardwareGpu).
 *
 * Saídas:
 *   tests/visual/baseline/<res>/{inspector,hud}/<alvo>.png  + tests/visual/baseline/manifest.json
 *   tools/visual-report/index.html, report.json, <res>/<alvo>-actual.png, <res>/<alvo>-diff.png
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { assertHardwareGpu, readWebGLRenderer } from './lib/assertGpu.mjs';
import { decodePng, encodePng } from './lib/png.mjs';
import { compareImages, buildDiffImage, DEFAULT_PIXEL_TOLERANCE, DEFAULT_MAX_DIFF_RATIO } from './lib/visualCompare.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = resolve(ROOT, 'tests/visual/baseline');
const REPORT_DIR = resolve(ROOT, 'tools/visual-report');
const INSPECTOR_SRC = resolve(ROOT, 'src/inspector/inspector.js');
const PORT = 5311;
let BASE = '';

export const RESOLUTIONS = [
  { name: '1280x720', w: 1280, h: 720 },
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '390x844', w: 390, h: 844 }
];
export const HUD_TARGETS = ['hud-menu', 'hud-escaramuca', 'hud-partida-curta'];
export const LIVE_SCENE_TARGETS = new Set(['hud-partida-curta']);
export const LIVE_SCENE_MAX_RATIO = 0.01;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

/** Lê os ids de MODEL_CATALOG do código-fonte do inspetor (cada entrada começa com `    id: '...'`). */
export function readCatalogIds(source) {
  const start = source.indexOf('const MODEL_CATALOG = [');
  if (start < 0) throw new Error('MODEL_CATALOG não encontrado em inspector.js');
  const end = source.indexOf('\n];', start);
  const ids = [];
  for (const line of source.slice(start, end).split('\n')) {
    const m = /^ {4}id: '([^']+)'/.exec(line);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Lista de alvos: nome estável (usado como nome de arquivo) + como capturar. */
export function buildTargets(catalogIds) {
  return [
    ...catalogIds.map((id) => ({ name: `inspector/${id}`, kind: 'inspector', id })),
    ...HUD_TARGETS.map((name) => ({
      name: `hud/${name.slice(4)}`,
      kind: 'hud',
      id: name,
      // Partida em andamento: água, fogo e unidades continuam animando em tempo real. Limiar
      // próprio (1 %) para esta cena; as demais telas usam o limiar global (0,2 %).
      maxRatio: LIVE_SCENE_TARGETS.has(name) ? LIVE_SCENE_MAX_RATIO : undefined
    }))
  ];
}

/**
 * Determinismo: o jogo e o inspetor espalham props (flores, grama, pedras) com Math.random.
 * Este script roda antes de qualquer página e troca Math.random por um PRNG com semente fixa;
 * `window.__visualSeed(n)` reinicia a semente antes de cada alvo, então cada captura não depende
 * das anteriores (--only gera a mesma imagem que a rodada completa).
 */
const VISUAL_INIT = `(() => {
  let s = 0;
  window.__visualSeed = (n) => { s = n >>> 0; };
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__visualSeed(20261008);
})();`;
const TARGET_SEED = 20261008;

const parseArgs = (argv) => {
  const o = { update: false, res: null, only: null, pixelTol: DEFAULT_PIXEL_TOLERANCE, maxRatio: DEFAULT_MAX_DIFF_RATIO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update') o.update = true;
    else if (a === '--res') o.res = argv[++i].split(',');
    else if (a === '--only') o.only = new RegExp(argv[++i]);
    else if (a === '--pixel-tol') o.pixelTol = Number(argv[++i]);
    else if (a === '--max-ratio') o.maxRatio = Number(argv[++i]);
    else throw new Error(`opção desconhecida: ${a}`);
  }
  return o;
};

/** Captura um alvo; devolve o PNG (Buffer). Espera a cena estabilizar antes do screenshot. */
async function captureTarget(page, target) {
  if (target.kind === 'inspector') {
    const q = `/inspector.html?model=${target.id}&anim=idle`;
    if (!page.url().includes('/inspector.html')) {
      await page.goto(`${BASE}${q}`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
      await page.waitForTimeout(1500); // glb/texturas do modelo inicial
    }
    const sel = await page.evaluate(async ({ id, seed }) => {
      const app = window.inspectorApp;
      window.__visualSeed(seed);
      app.selectModel(id);
      if (app.animator) { app.animator.pause(); app.animator.setTime(0); }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { ok: app.currentModelItem?.id === id && !!app.currentModelObject, glb: !!app.currentModelItem?.glb };
    }, { id: target.id, seed: TARGET_SEED });
    if (!sel.ok) throw new Error(`inspetor não selecionou o modelo ${target.id}`);
    await page.waitForTimeout(300);
  } else if (target.id === 'hud-menu') {
    await page.goto(`${BASE}/?texq=low`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('#main-menu.mm-ready', { timeout: 60000 });
    await page.waitForTimeout(1000);
  } else if (target.id === 'hud-escaramuca') {
    await page.goto(`${BASE}/?texq=low`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('#main-menu.mm-ready', { timeout: 60000 });
    await page.click('[data-action="new-game"]');
    await page.waitForSelector('#mm-skirmish:not([hidden])', { timeout: 15000 });
    // Prévia 3D do humano gira por rAF: para o laço e fixa a pose para o screenshot.
    await page.evaluate(() => {
      const pv = window.warpoly?.menu?.preview;
      if (!pv || !pv.renderer) return;
      cancelAnimationFrame(pv._raf);
      pv.pivot.rotation.y = -0.5;
      pv.renderer.render(pv.scene, pv.camera);
    });
    await page.waitForTimeout(500);
  } else if (target.id === 'hud-partida-curta') {
    await page.goto(`${BASE}/?skipPreload&texq=low&play`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
  } else {
    throw new Error(`alvo desconhecido: ${target.id}`);
  }
  return page.screenshot({ type: 'png', animations: 'disabled' });
}


const writeFileDeep = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };

/** Acumula resultados no report.json (lotes podem rodar em sequência) e regera o index.html. */
function writeReport(entries, reset) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = join(REPORT_DIR, 'report.json');
  const prev = !reset && existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')).results : [];
  const byKey = new Map(prev.map((r) => [`${r.res}/${r.name}`, r]));
  for (const e of entries) byKey.set(`${e.res}/${e.name}`, e);
  const results = [...byKey.values()].sort((a, b) => `${a.res}/${a.name}`.localeCompare(`${b.res}/${b.name}`));
  writeFileSync(jsonPath, JSON.stringify({ updatedAt: new Date().toISOString(), results }, null, 2));
  const fails = results.filter((r) => !r.pass);
  const rows = results.map((r) => {
    const img = r.diff ? `<a href="${r.res}/${r.name}-diff.png"><img src="${r.res}/${r.name}-diff.png" width="180"></a>
      <a href="${r.res}/${r.name}-actual.png"><img src="${r.res}/${r.name}-actual.png" width="180"></a>` : '';
    return `<tr class="${r.pass ? 'ok' : 'fail'}"><td>${r.res}</td><td>${r.name}</td><td>${r.pass ? 'OK' : 'FALHA'}</td>
      <td>${r.note ?? ''}</td><td>${(r.ratio * 100).toFixed(3)} %</td><td>${r.maxDelta ?? ''}</td><td>${img}</td></tr>`;
  }).join('\n');
  writeFileSync(join(REPORT_DIR, 'index.html'), `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>Regressão visual WarPoly</title>
<style>body{font:14px system-ui;margin:16px;background:#111;color:#eee}table{border-collapse:collapse}
td,th{border:1px solid #333;padding:4px 8px;vertical-align:top}tr.fail{background:#3a1010}tr.ok td:nth-child(3){color:#7f7}
tr.fail td:nth-child(3){color:#f77;font-weight:bold}img{image-rendering:pixelated;margin-right:4px}</style>
<h1>Regressão visual</h1><p>${results.length} comparações · ${fails.length} falha(s) · atualizado ${new Date().toLocaleString('pt-BR')}</p>
<p>Diff: magenta = pixels acima da tolerância; cinza = referência. Esquerda: diff; direita: captura atual.</p>
<table><tr><th>Resolução</th><th>Alvo</th><th>Status</th><th>Obs.</th><th>Pixels diferentes</th><th>Maior delta</th><th>Imagens</th></tr>
${rows}</table></html>`);
  return entries.filter((e) => !e.pass).length; // falhas desta rodada
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalogIds = readCatalogIds(readFileSync(INSPECTOR_SRC, 'utf8'));
  let targets = buildTargets(catalogIds);
  if (opts.only) targets = targets.filter((t) => opts.only.test(t.name));
  const resolutions = RESOLUTIONS.filter((r) => !opts.res || opts.res.includes(r.name));
  console.log(`[visual] ${catalogIds.length} modelos no catálogo, ${targets.length} alvos × ${resolutions.length} resolução(ões) (${opts.update ? 'ATUALIZAR baseline' : 'comparar'})`);

  if (!opts.update && !existsSync(join(BASE_DIR, RESOLUTIONS[0].name))) {
    console.error('[visual] baseline ausente: os PNGs ficam fora do git (~109 MB). Gere-a no estado validado do master com:\n  bash tools/safe-run.sh --timeout 1800 -- node tools/visual-regress.mjs --update');
    process.exit(2);
  }
  BASE = `http://127.0.0.1:${PORT}`;
  const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const started = Date.now();
  const entries = [];
  let renderer = '';
  let browserVersion = '';
  let failedCount = 0;
  try {
    browserVersion = browser.version();
    for (const res of resolutions) {
      const ctx = await browser.newContext({ viewport: { width: res.w, height: res.h }, deviceScaleFactor: 1 });
      await ctx.addInitScript(VISUAL_INIT);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto('about:blank');
      await assertHardwareGpu(page); // aborta em SwiftShader/llvmpipe
      renderer = await readWebGLRenderer(page);
      const t0 = Date.now();
      console.log(`\n[visual] ${res.name} · GPU: ${renderer}`);
      for (const target of targets) {
        const key = `${res.name}/${target.name}`;
        const errBefore = errors.length;
        let png;
        try {
          png = await captureTarget(page, target);
        } catch (e) {
          // Recupera a página para o próximo alvo; a falha de captura conta como FALHA.
          console.log(`FALHA ${key}: ${e.message}`);
          entries.push({ res: res.name, name: target.name, pass: false, note: 'captura falhou: ' + e.message, ratio: 1 });
          failedCount++;
          await page.goto('about:blank');
          continue;
        }
        const basePath = join(BASE_DIR, res.name, `${target.name}.png`);
        const newErrors = errors.length - errBefore;
        if (opts.update) {
          writeFileDeep(basePath, png);
          console.log(`ok   ${key} (${(png.length / 1024).toFixed(0)} kB)${newErrors ? ` · ${newErrors} erro(s) de console` : ''}`);
          continue;
        }
        if (!existsSync(basePath)) {
          const reportDir = join(REPORT_DIR, res.name);
          writeFileDeep(join(reportDir, `${target.name}-actual.png`), png);
          console.log(`FALHA ${key}: sem baseline`);
          entries.push({ res: res.name, name: target.name, pass: false, note: 'sem baseline', ratio: 1 });
          failedCount++;
          continue;
        }
        const r = compareImages(decodePng(readFileSync(basePath)), decodePng(png), { pixelTolerance: opts.pixelTol, maxDiffRatio: target.maxRatio ?? opts.maxRatio });
        const entry = { res: res.name, name: target.name, pass: r.pass, ratio: r.ratio, maxDelta: r.maxDelta, diff: false,
          note: r.sizeMismatch ? 'dimensões diferentes' : (newErrors ? `${newErrors} erro(s) de console` : '') };
        if (!r.sizeMismatch && r.diffPixels > 0) {
          const reportDir = join(REPORT_DIR, res.name);
          const base = decodePng(readFileSync(basePath));
          const actual = decodePng(png);
          writeFileDeep(join(reportDir, `${target.name}-actual.png`), png);
          writeFileDeep(join(reportDir, `${target.name}-diff.png`), encodePng(buildDiffImage(base, actual, opts.pixelTol)));
          entry.diff = true;
        } else if (r.sizeMismatch) {
          writeFileDeep(join(REPORT_DIR, res.name, `${target.name}-actual.png`), png);
        }
        entries.push(entry);
        if (!r.pass) failedCount++;
        console.log(`${r.pass ? 'ok  ' : 'FALHA'} ${key} · ${(r.ratio * 100).toFixed(3)} % pixels · maior delta ${r.maxDelta}`);
      }
      console.log(`[visual] ${res.name} concluído em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (opts.update) {
    // manifesto: versão do navegador e renderer da GPU usados na baseline
    const manifestPath = join(BASE_DIR, 'manifest.json');
    const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    const manifest = {
      ...prev,
      updatedAt: new Date().toISOString(),
      chromium: browserVersion,
      gpu: renderer,
      resolutions: [...new Set([...(prev.resolutions ?? []), ...resolutions.map((r) => r.name)])],
      targets: catalogIds.length + HUD_TARGETS.length,
      notes: 'PNGs da baseline NAO ficam no git (gitignore); dependem de GPU real + Chromium acima. Regerar com npm run visual -- --update.'
    };
    writeFileDeep(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\n[visual] baseline gravada em ${secs} s · ${failedCount} falha(s) de captura`);
    process.exitCode = failedCount ? 1 : 0;
    return;
  }
  // Rodada sem filtro reinicia o relatório; com --res/--only acrescenta às entradas anteriores.
  const fails = writeReport(entries, !opts.res && !opts.only);
  const manifestPath = join(BASE_DIR, 'manifest.json');
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (m.gpu && renderer && m.gpu !== renderer) console.log(`[visual] aviso: GPU diferente da baseline (${renderer} ≠ ${m.gpu})`);
  }
  console.log(`\n[visual] ${entries.length} comparação(ões) em ${secs} s · ${fails} falha(s) · relatório: tools/visual-report/index.html`);
  process.exitCode = fails ? 1 : 0;
}

// Só executa quando chamado diretamente (os testes importam as funções acima).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
