#!/usr/bin/env node
/**
 * Smoke test (F0-05): sobe o Vite na porta 5176 (ou usa SMOKE_URL), abre o jogo e o
 * inspetor num Chromium headless (uma página por vez) e falha se houver `pageerror` ou
 * `console.error`, ou se `window.game` / `window.inspectorApp` não aparecerem a tempo.
 *
 * NÃO rode direto: use `npm run smoke`, que passa por `tools/safe-run.sh` (trava global,
 * teto de memória de 6G sem swap, timeout de 240 s). Em 2026-09-28 um chrome-headless
 * chegou a 10,8 GB e travou a máquina.
 *
 * Variáveis:
 *   SMOKE_URL=http://localhost:4173   reaproveita um servidor (ex.: `vite preview`)
 *   SMOKE_TIMEOUT_MS=90000            tempo limite por página
 *   SMOKE_HEADED=1                    com janela visível
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5176;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 90000);

const PAGES = [
  { path: '/?skipPreload', ready: 'window.game', label: 'jogo' },
  { path: '/inspector.html', ready: 'window.inspectorApp', label: 'inspetor' }
];

// SMOKE_GL=gpu (padrão): tenta a GPU real (texturas ficam na VRAM). Sem GPU, o Chromium
// cai para SwiftShader. SMOKE_GL=swiftshader força WebGL por software, e aí as texturas
// procedurais do jogo vão para a RAM: pode passar de 6 GB e ser morto pelo safe-run.
const GL_MODE = process.env.SMOKE_GL || 'gpu';
const GL_ARGS =
  GL_MODE === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader'];

const CHROMIUM_ARGS = [
  ...GL_ARGS,
  '--ignore-gpu-blocklist',
  // Limites de memória (ver incidente de OOM acima).
  '--js-flags=--max-old-space-size=2048',
  '--renderer-process-limit=1',
  '--disable-dev-shm-usage',
  '--disable-extensions'
];

let server = null;
let browser = null;

async function startServer() {
  if (process.env.SMOKE_URL) {
    return { baseUrl: process.env.SMOKE_URL.replace(/\/$/, ''), close: async () => {} };
  }
  const vite = await createServer({
    server: { port: PORT, strictPort: true, host: '127.0.0.1' },
    logLevel: 'warn',
    clearScreen: false
  });
  await vite.listen();
  return { baseUrl: `http://127.0.0.1:${PORT}`, close: () => vite.close() };
}

async function cleanup() {
  const b = browser;
  const s = server;
  browser = null;
  server = null;
  if (b) await b.close().catch(() => {});
  if (s) await s.close().catch(() => {});
}

async function checkPage(baseUrl, { path, ready, label }) {
  // Browser novo por página: o anterior é fechado antes, para a memória do jogo
  // (texturas procedurais + WebGL por software) não somar à do inspetor.
  browser = await chromium.launch({ headless: !process.env.SMOKE_HEADED, args: CHROMIUM_ARGS });
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const errors = [];
  const url = baseUrl + path;
  const t0 = Date.now();
  let gpu = '?';
  // Falha rápido se a aba ou o browser morrerem (ex.: OOM no teto do safe-run),
  // em vez de ficar esperando o timeout.
  let abort;
  const aborted = new Promise((_, reject) => (abort = reject));
  aborted.catch(() => {});
  browser.on('disconnected', () => abort(new Error('browser desconectou (morto por OOM?)')));
  try {
    const page = await context.newPage();
    page.on('crash', () => abort(new Error('aba travou/crashou (memória?)')));
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    // Verifica GPU antes de navegar para o jogo (F0-08)
    await assertHardwareGpu(page);
    const run = async () => {
      await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS });
      await page.waitForFunction(`!!(${ready})`, null, { timeout: TIMEOUT_MS });
      gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
      });
      // Deixa alguns quadros rodarem para pegar erros do loop de render.
      await page.waitForTimeout(1500);
    };
    await Promise.race([run(), aborted]);
  } catch (err) {
    errors.push(`timeout/navegação: ${err.message.split('\n')[0]}`);
  } finally {
    await context.close().catch(() => {});
    const b = browser;
    browser = null;
    await b.close().catch(() => {});
  }
  return { label, url, ms: Date.now() - t0, errors, gpu };
}

async function main() {
  let failed = false;
  try {
    server = await startServer();

    // Uma página por vez, nunca em paralelo.
    for (const spec of PAGES) {
      const res = await checkPage(server.baseUrl, spec);
      if (res.errors.length) {
        failed = true;
        console.error(`FALHOU  ${res.label} (${res.url}) em ${res.ms} ms`);
        for (const e of res.errors) console.error(`   - ${e}`);
      } else {
        console.log(`OK      ${res.label} (${res.url}) em ${res.ms} ms · WebGL: ${res.gpu}`);
      }
    }
  } finally {
    await cleanup();
  }

  if (failed) {
    console.error('\nSmoke test falhou.');
    process.exit(1);
  }
  console.log('\nSmoke test passou.');
}

// Timeout do safe-run (SIGTERM) ou Ctrl+C: fecha browser e vite antes de sair.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.error(`\n[smoke] ${sig} recebido, encerrando browser e vite…`);
    cleanup().finally(() => process.exit(130));
  });
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  process.exit(1);
});
