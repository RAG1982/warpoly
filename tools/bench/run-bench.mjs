#!/usr/bin/env node
/**
 * WarPoly — runner de benchmark (F0-04).
 *
 * Uso:
 *   npm run bench                         # todos os cenários, navegador com janela se houver display
 *   npm run bench -- --headless           # força headless (FPS NÃO representativo; draw calls/memória/load sim)
 *   npm run bench -- --scenarios=combate100,massa300
 *   npm run bench -- --url=http://localhost:5175 --width=1280 --height=720 --duration=10 --warmup=2
 *   npm run bench -- --query=merge=0&texq=low   # parâmetros extras na URL do jogo
 *
 * Se não houver servidor em --url, sobe `npx vite --port 5175 --strictPort` e derruba ao final.
 * Salva em tools/bench/results/<AAAA-MM-DD-HHMM>.json.
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

const BASE_URL = args.url || 'http://localhost:5175';
const SCENARIOS = (args.scenarios || 'inicial,combate100,massa300').split(',');
const WIDTH = Number(args.width || 1280);
const HEIGHT = Number(args.height || 720);
const WARMUP = Number(args.warmup || 2);
const DURATION = Number(args.duration || 10);
const TIMEOUT_MS = Number(args.timeout || 240000);
// Parâmetros extras da URL do jogo, ex.: --query=merge=0&texq=low
const EXTRA_QUERY = args.query ? `&${args.query}` : '';

// Flags para tentar usar a GPU real (ANGLE/Vulkan). Sem GPU, cai para SwiftShader.
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
  const port = new URL(BASE_URL).port || '5175';
  console.log(`[bench] subindo dev server na porta ${port}...`);
  const proc = spawn('npx', ['vite', '--port', port, '--strictPort'], {
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

async function launch(chromium) {
  const wantHeadless = args.headless === true || args.headless === 'true';
  const hasDisplay = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const attempts = [];
  if (!wantHeadless && hasDisplay) attempts.push({ headless: false, args: GPU_ARGS });
  attempts.push({ headless: true, args: GPU_ARGS });
  if (process.env.ALLOW_SOFTWARE_GL === '1') {
    attempts.push({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  }

  let lastErr;
  for (const opt of attempts) {
    try {
      const browser = await chromium.launch({
        headless: opt.headless,
        args: [...opt.args, `--window-size=${WIDTH},${HEIGHT + 120}`],
      });
      console.log(`[bench] navegador: headless=${opt.headless} args=${opt.args.join(' ')}`);
      return { browser, headless: opt.headless, args: opt.args };
    } catch (err) {
      lastErr = err;
      console.warn(`[bench] falha ao abrir (headless=${opt.headless}): ${String(err.message).split('\n')[0]}`);
    }
  }
  throw lastErr;
}

async function runScenario(browser, name) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const url = `${BASE_URL}/?bench=${name}&benchWarmup=${WARMUP}&benchDuration=${DURATION}${EXTRA_QUERY}`;
  console.log(`[bench] ${name}: ${url}`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => window.__bench, null, { timeout: TIMEOUT_MS, polling: 500 });
  const result = await page.evaluate(() => window.__bench);
  result.wallClockS = Math.round((Date.now() - t0) / 100) / 10;
  result.pageErrors = errors.slice(0, 20);
  if (args.screenshot) {
    mkdirSync(resolve(__dirname, 'results'), { recursive: true });
    await page.screenshot({ path: resolve(__dirname, 'results', `${name}.png`) });
  }
  await context.close();
  return result;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('[bench] Playwright não instalado. Rode: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }

  const server = await ensureServer();
  let browser;
  try {
    // Aquece o cache de transformação do Vite (primeira carga em dev é mais lenta).
    const launched = await launch(chromium);
    browser = launched.browser;
    {
      const ctx = await browser.newContext();
      const pg = await ctx.newPage();
      // Verifica GPU antes de navegar para o jogo (F0-08)
      await assertHardwareGpu(pg);
      await pg.goto(`${BASE_URL}/?skipPreload`, { waitUntil: 'load', timeout: TIMEOUT_MS }).catch(() => {});
      await pg.waitForFunction(() => window.game, null, { timeout: 60000 }).catch(() => {});
      await ctx.close();
    }

    const results = [];
    for (const name of SCENARIOS) {
      try {
        const r = await runScenario(browser, name);
        results.push(r);
        console.log(
          `[bench] ${name}: FPS ${r.fps?.avg} (1% low ${r.fps?.p1Low}) · calls ${r.render?.callsAvg} · ` +
            `tris ${r.render?.trianglesAvg} · load ${r.load?.readyMs} ms · sim ms/frame ${r.gameUpdateMs?.avg} ms`
        );
      } catch (err) {
        console.error(`[bench] ${name} falhou: ${err.message}`);
        results.push({ ok: false, scenario: name, error: String(err.message) });
      }
    }

    const out = {
      createdAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      headless: launched.headless,
      browserArgs: launched.args,
      browserVersion: browser.version(),
      viewport: [WIDTH, HEIGHT],
      warmupS: WARMUP,
      durationS: DURATION,
      note: launched.headless
        ? 'Headless: FPS/frame time não representativos; draw calls, triângulos, memória e load são.'
        : 'Com janela (headed).',
      results,
    };
    const dir = resolve(__dirname, 'results');
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, `${args.out || stamp()}.json`);
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`[bench] salvo em ${file}`);
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
  console.error('[bench] erro:', err);
  process.exit(1);
});
