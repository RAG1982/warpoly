#!/usr/bin/env node
/**
 * WarPoly — M1-03: medições de desempenho (baseline 2026-10).
 *
 * Roda SEMPRE via safe-run:
 *   bash tools/safe-run.sh --timeout 1500 -- node tools/bench/m1-03.mjs --part=A
 *
 * Partes:
 *   A  bench inicial|combate100|massa300 a 1280×720, preset high, com e sem ?lod=0 (resolução dinâmica DESLIGADA)
 *   B  idem combate100|massa300 com a resolução dinâmica padrão do preset (controle)
 *   C  SSAO a 1920×1080, texq=high: efeitos padrão × ?fx=-ssao × ?fx=0 (inicial e combate100)
 *   D  draw calls com a câmera sobre um acampamento neutro × sem neutros (NEW-27)
 *
 * Cada configuração: 1 execução descartada (aquecimento: cache do Vite, shaders, JIT) + N medidas (padrão 3);
 * dentro de cada execução ainda há `benchWarmup` s descartados pelo próprio bench.
 * Saída: tools/bench/results/m1-03-<parte>.json (a baseline.json de tests/perf NÃO é tocada).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const s = a.replace(/^--/, '');
    const i = s.indexOf('=');
    return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
  })
);
const PART = String(args.part || 'A').toUpperCase();
const PORT = Number(args.port || 5301);
const BASE = `http://localhost:${PORT}`;
const RUNS = Number(args.runs || 3);
const WARMUP = Number(args.warmup || 3);
const DURATION = Number(args.duration || 10);
const TIMEOUT_MS = 240000;

const GPU_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=vulkan',
  '--enable-features=Vulkan', '--disable-vulkan-surface', '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--autoplay-policy=no-user-gesture-required', '--js-flags=--max-old-space-size=2048',
];

const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

async function isUp(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

async function startVite() {
  if (await isUp(BASE)) throw new Error(`porta ${PORT} já em uso por outro servidor`);
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  proc.stderr.on('data', (d) => { const s = String(d); if (!s.includes('[console.warn]')) process.stderr.write(`[vite] ${s}`); });
  for (let i = 0; i < 80; i++) { if (await isUp(BASE)) return proc; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite não respondeu em 40 s');
}

async function launch(chromium, width, height) {
  const hasDisplay = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const attempts = hasDisplay ? [false, true] : [true];
  let lastErr;
  for (const headless of attempts) {
    try {
      const browser = await chromium.launch({ headless, args: [...GPU_ARGS, `--window-size=${width},${height + 120}`] });
      console.log(`[m1-03] navegador headless=${headless} ${browser.version()}`);
      return { browser, headless };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function newPage(browser, width, height, { dynRes }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (!dynRes) {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('warpoly.qualityOverrides', JSON.stringify({ dynamicResolution: false })); } catch { /* */ }
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors };
}

/** Uma execução do bench; devolve o `window.__bench` enxuto. */
async function benchOnce(browser, cfg) {
  const { ctx, page, errors } = await newPage(browser, cfg.width, cfg.height, { dynRes: cfg.dynRes });
  try {
    const url = `${BASE}/?bench=${cfg.scenario}&benchWarmup=${WARMUP}&benchDuration=${DURATION}&quality=high${cfg.query ? `&${cfg.query}` : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForFunction(() => window.__bench, null, { timeout: TIMEOUT_MS, polling: 500 });
    const r = await page.evaluate(() => window.__bench);
    if (!r.ok) throw new Error(r.error || 'bench falhou');
    if (cfg.checkGpu !== false) {
      const gpu = r.env.gpu.renderer || '';
      if (/swiftshader|llvmpipe|software|softpipe/i.test(gpu)) throw new Error(`GPU de software: ${gpu}`);
    }
    return {
      fps: r.fps.avg, p1: r.fps.p1Low, frameMs: r.frameTimeMs.avg, p99Ms: r.fps.p99FrameMs, simMs: r.gameUpdateMs.avg,
      calls: r.render.callsAvg, tris: r.render.trianglesAvg, heapMB: r.memory.jsHeapUsedMB, texs: r.memory.textures,
      geos: r.memory.geometries, loadMs: r.load.readyMs, frames: r.frames,
      pixelRatio: r.quality?.pixelRatioNow ?? r.env.rendererPixelRatio, preset: r.quality?.preset,
      effects: r.quality?.effects, dynRes: r.quality?.dynamicResolution, drawingBuffer: r.env.drawingBuffer,
      gpu: r.env.gpu.renderer, version: r.version, errors: errors.slice(0, 5),
    };
  } finally { await ctx.close().catch(() => {}); }
}

function summarize(runs) {
  const keys = ['fps', 'p1', 'frameMs', 'p99Ms', 'simMs', 'calls', 'tris', 'heapMB', 'texs', 'geos', 'loadMs', 'pixelRatio'];
  const out = {};
  for (const k of keys) {
    const v = runs.map((r) => r[k]).filter((x) => Number.isFinite(x));
    out[k] = { mean: round(mean(v), k === 'simMs' || k === 'pixelRatio' ? 3 : 1), min: round(Math.min(...v), 2), max: round(Math.max(...v), 2) };
  }
  return out;
}

async function runMatrix(browser, configs, results) {
  for (const cfg of configs) {
    const label = `${cfg.scenario} ${cfg.width}x${cfg.height} ${cfg.query || '(padrão)'} dynRes=${cfg.dynRes}`;
    console.log(`[m1-03] === ${label}`);
    let discarded;
    try {
      discarded = await benchOnce(browser, cfg);
      console.log(`[m1-03]   descartada: FPS ${discarded.fps} calls ${discarded.calls}`);
    } catch (e) { console.error(`[m1-03]   descartada falhou: ${e.message}`); }
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await benchOnce(browser, cfg);
        runs.push(r);
        console.log(`[m1-03]   run ${i + 1}: FPS ${r.fps} (p1 ${r.p1}) calls ${r.calls} tris ${r.tris} heap ${r.heapMB} load ${r.loadMs} pr ${r.pixelRatio} fx ${JSON.stringify(r.effects)}`);
      } catch (e) { console.error(`[m1-03]   run ${i + 1} falhou: ${e.message}`); }
    }
    results.push({ label, cfg, discarded, runs, summary: runs.length ? summarize(runs) : null });
  }
}

// ---------------------------------------------------------------- parte D: neutros
async function neutralsPart(browser, results) {
  for (const lod of [true, false]) {
    const { ctx, page, errors } = await newPage(browser, 1280, 720, { dynRes: false });
    try {
      await page.goto(`${BASE}/?skipPreload&quality=high${lod ? '' : '&lod=0'}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      await page.waitForFunction(() => window.game?.session?.entityViews && window.game.gameManager?.units?.length > 0, null, { timeout: TIMEOUT_MS, polling: 500 });
      await assertHardwareGpu(page);
      const setup = await page.evaluate(() => {
        const g = window.game; const gm = g.gameManager; const sm = g.sceneManager; const r = sm.renderer;
        if (gm.aiDirector) gm.aiDirector.update = () => {};
        gm.fogOfWar.setEnabled(false); // revela os neutros (a névoa esconde as views inimigas/neutras)
        const camps = (gm.terrain.mapDef.neutrals || []).filter((n) => n.kind === 'camp');
        const st = window.__neu = { acc: { calls: 0, tris: 0 }, hide: false, roots: [] };
        const collect = () => {
          const out = []; const cnt = { bandidos: 0, acampamentos: 0, critters: 0, jazidas: 0 };
          g.session.entityViews.views.forEach((v, e) => {
            const name = e.constructor?.name; const root = v.root; if (!root) return;
            const nearCamp = camps.some((c) => Math.hypot(root.position.x - c.x, root.position.z - c.z) < 13);
            if (e.ownerId === 99) { out.push(root); if (name === 'Unit') cnt.bandidos++; else cnt.acampamentos++; }
            else if (name === 'Critter') { out.push(root); cnt.critters++; }
            else if (name === 'ResourceDeposit' && nearCamp) { out.push(root); cnt.jazidas++; }
          });
          st.roots = out; return cnt;
        };
        st.collect = collect;
        const orig = r.render.bind(r);
        r.render = (...a) => {
          let saved = null;
          if (st.hide) { saved = st.roots.map((o) => o.visible); st.roots.forEach((o) => { o.visible = false; }); }
          orig(...a);
          if (saved) st.roots.forEach((o, i) => { o.visible = saved[i]; });
          st.acc.calls += r.info.render.calls; st.acc.tris += r.info.render.triangles;
        };
        return { camps: camps.map((c) => [c.x, c.z]), counts: collect(), pixelRatio: r.getPixelRatio(), effects: { ...sm.postfx.effects } };
      });
      console.log(`[m1-03] D lod=${lod}`, JSON.stringify(setup));
      const view = [
        { nome: 'acampamento neutro 1 (40,20)', x: 40, z: 20 },
        { nome: 'acampamento neutro 2 (-40,-20)', x: -40, z: -20 },
        { nome: 'controle: base do jogador (32,-30)', x: 32, z: -30 },
        { nome: 'controle: centro (0,0)', x: 0, z: 0 },
      ];
      const rows = [];
      for (const v of view) {
        for (const hide of [false, true]) {
          const samples = [];
          for (let k = 0; k < RUNS + 1; k++) { // 1ª amostra descartada
            const m = await page.evaluate(async ({ x, z, hide }) => {
              const g = window.game; const sm = g.sceneManager; const st = window.__neu;
              st.collect(); st.hide = hide;
              sm.cameraTarget.set(x, 2.5, z); sm.zoomLevel = sm.targetZoomLevel = 1.0; sm.cameraAngle = sm.targetCameraAngle = Math.PI / 4; sm.updateCamera(0);
              const frame = () => new Promise((res) => requestAnimationFrame(res));
              for (let i = 0; i < 90; i++) { sm.updateCamera(0); await frame(); }
              const calls = []; const tris = []; const ft = [];
              st.acc.calls = 0; st.acc.tris = 0; let last = performance.now();
              for (let i = 0; i < 180; i++) {
                await frame(); const now = performance.now(); ft.push(now - last); last = now;
                calls.push(st.acc.calls); tris.push(st.acc.tris); st.acc.calls = 0; st.acc.tris = 0;
              }
              const avg = (a) => a.reduce((s, q) => s + q, 0) / a.length;
              return { calls: avg(calls), callsMax: Math.max(...calls), tris: avg(tris), fps: 1000 / avg(ft) };
            }, { x: v.x, z: v.z, hide });
            if (k > 0) samples.push(m);
          }
          rows.push({ vista: v.nome, neutros: hide ? 'ocultos' : 'visíveis', calls: round(mean(samples.map((s) => s.calls)), 0), callsMin: round(Math.min(...samples.map((s) => s.calls)), 0), callsMax: round(Math.max(...samples.map((s) => s.calls)), 0), tris: round(mean(samples.map((s) => s.tris)), 0), fps: round(mean(samples.map((s) => s.fps)), 1) });
          console.log('[m1-03] D', lod ? 'lod' : 'sem-lod', JSON.stringify(rows[rows.length - 1]));
        }
      }
      results.push({ lod, setup, rows, errors: errors.slice(0, 5) });
    } finally { await ctx.close().catch(() => {}); }
  }
}

async function main() {
  const { chromium } = await import('playwright');
  const server = await startVite();
  let browser;
  const results = [];
  const meta = { part: PART, createdAt: new Date().toISOString(), runs: RUNS, warmupS: WARMUP, durationS: DURATION };
  try {
    const W = PART === 'C' ? 1920 : 1280; const H = PART === 'C' ? 1080 : 720;
    const launched = await launch(chromium, W, H);
    browser = launched.browser; meta.headless = launched.headless; meta.browser = browser.version();
    { // GPU real?
      const { ctx, page } = await newPage(browser, W, H, { dynRes: true });
      await page.goto('about:blank'); await assertHardwareGpu(page); await ctx.close();
    }
    if (PART === 'A' || PART === 'B') {
      const scen = PART === 'A' ? ['inicial', 'combate100', 'massa300'] : ['combate100', 'massa300'];
      const cfgs = [];
      for (const s of scen) for (const lod of PART === 'A' ? [true, false] : [true]) {
        cfgs.push({ scenario: s, width: 1280, height: 720, query: lod ? '' : 'lod=0', dynRes: PART === 'B' });
      }
      await runMatrix(browser, cfgs, results);
    } else if (PART === 'C') {
      const cfgs = [];
      for (const s of ['inicial', 'combate100']) for (const q of ['texq=high', 'texq=high&fx=-ssao', 'texq=high&fx=0']) {
        cfgs.push({ scenario: s, width: 1920, height: 1080, query: q, dynRes: false });
      }
      await runMatrix(browser, cfgs, results);
    } else if (PART === 'D') {
      await neutralsPart(browser, results);
    } else throw new Error(`parte desconhecida: ${PART}`);
  } finally {
    const dir = resolve(__dirname, 'results'); mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `m1-03-${PART}.json`);
    writeFileSync(file, JSON.stringify({ meta, results }, null, 2));
    console.log(`[m1-03] salvo em ${file}`);
    if (browser) await browser.close().catch(() => {});
    try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
  }
}
main().catch((e) => { console.error('[m1-03] erro:', e); process.exit(1); });
