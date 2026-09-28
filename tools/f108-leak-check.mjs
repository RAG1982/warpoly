#!/usr/bin/env node
/**
 * WarPoly — verificação de alocações/vazamentos (F1-08).
 *
 * Sobe o dev server na porta 5190, abre `?skipPreload&texq=low&bench=combate100&benchDuration=<N>`
 * com GPU real (aborta em SwiftShader/llvmpipe, ver tools/lib/assertGpu.mjs) e amostra a cada 30 s:
 *   - performance.memory.usedJSHeapSize
 *   - renderer.info.memory.textures
 *   - renderer.info.memory.geometries
 *
 * Uso (sempre via safe-run, ver docs/specs/_COMUM.md):
 *   bash tools/safe-run.sh --timeout 700 -- node tools/f108-leak-check.mjs --duration=600
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const s = a.replace(/^--/, '');
    const i = s.indexOf('=');
    return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
  })
);

const PORT = args.port || '5190';
const BASE_URL = `http://localhost:${PORT}`;
const DURATION = Number(args.duration || 600); // s
const SAMPLE_EVERY = Number(args.sampleEvery || 30); // s

const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--use-angle=vulkan',
  '--enable-features=Vulkan',
  '--disable-vulkan-surface',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--autoplay-policy=no-user-gesture-required',
  '--js-flags=--max-old-space-size=2048',
];

async function isUp(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isUp(BASE_URL)) return null;
  console.log(`[f108] subindo dev server na porta ${PORT}...`);
  const proc = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  proc.stderr.on('data', (d) => {
    const s = String(d);
    if (!s.includes('[console.warn]')) process.stderr.write(`[vite] ${s}`);
  });
  for (let i = 0; i < 60; i++) {
    if (await isUp(BASE_URL)) return proc;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server não respondeu em 30 s');
}

function sample(page) {
  return page.evaluate(() => {
    const renderer = window.game?.sceneManager?.renderer;
    return {
      tMs: Math.round(performance.now()),
      heapMB: performance.memory ? Math.round((performance.memory.usedJSHeapSize / 1048576) * 10) / 10 : null,
      textures: renderer ? renderer.info.memory.textures : null,
      geometries: renderer ? renderer.info.memory.geometries : null,
    };
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('[f108] Playwright não instalado. Rode: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }

  const server = await ensureServer();
  let browser;
  try {
    browser = await chromium.launch({
      headless: !process.env.DISPLAY,
      args: [...GPU_ARGS, '--window-size=1280,840'],
    });

    const probeCtx = await browser.newContext();
    const probePage = await probeCtx.newPage();
    await assertHardwareGpu(probePage); // aborta se SwiftShader/llvmpipe (F0-08)
    await probeCtx.close();

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const url = `${BASE_URL}/?skipPreload&texq=low&bench=combate100&benchWarmup=2&benchDuration=${DURATION}`;
    console.log(`[f108] navegando para ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.game, null, { timeout: 60000 });

    const samples = [];
    const t0 = Date.now();
    const totalSamples = Math.floor(DURATION / SAMPLE_EVERY) + 1;
    for (let i = 0; i < totalSamples; i++) {
      const targetMs = i * SAMPLE_EVERY * 1000;
      const waitMs = targetMs - (Date.now() - t0);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      const s = await sample(page);
      s.elapsedS = Math.round((Date.now() - t0) / 1000);
      samples.push(s);
      console.log(
        `[f108] t=${s.elapsedS}s heap=${s.heapMB}MB textures=${s.textures} geometries=${s.geometries}`
      );
    }

    if (errors.length) {
      console.warn(`[f108] ${errors.length} erro(s) de página:`, errors.slice(0, 10));
    }

    console.log('\n[f108] tabela (t, heapMB, textures, geometries):');
    for (const s of samples) {
      console.log(`  ${s.elapsedS}s\t${s.heapMB}\t${s.textures}\t${s.geometries}`);
    }

    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        server.kill('SIGTERM');
      }
    }
  }
}

main().catch((err) => {
  console.error('[f108] erro:', err);
  process.exit(1);
});
