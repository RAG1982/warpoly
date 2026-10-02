#!/usr/bin/env node
// F2-08c: reinicia a partida 3x (pausa → restartMatch) e imprime objetos na cena / geometrias / texturas.
// Uso: bash tools/safe-run.sh --timeout 300 -- node tools/restart-leak-probe.mjs --root <dir> --port 5282
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { assertHardwareGpu } from './lib/assertGpu.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', process.cwd())); const PORT = Number(opt('port', 5282));
const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 640 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&seed=3`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game?.gameManager?.buildings?.length > 0, null, { timeout: 90000 });
  const snap = () => page.evaluate(() => {
    const g = window.game; const sm = g.sceneManager; let n = 0; sm.scene.traverse(() => n++);
    return { objs: n, geos: sm.renderer.info.memory.geometries, tex: sm.renderer.info.memory.textures, children: sm.scene.children.length };
  });
  console.log('inicio', JSON.stringify(await snap()));
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.game.pause(); window.game.restartMatch(); });
    await page.waitForFunction(() => window.game?.gameManager?.buildings?.length > 0 && window.game.fsm.is && !window.game.fsm.is('loading'), null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log('restart', i, JSON.stringify(await snap()));
  }
  console.log('erros:', JSON.stringify(errors));
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
