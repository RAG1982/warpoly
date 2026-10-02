// Utilitários das capturas F6b (minimapa, cursores, pós-jogo). NÃO rode direto: use tools/safe-run.sh.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const OUT = resolve(ROOT, 'tools/ui-captures/f6b');
export const PORT = 5311;
export const SIZES = [
  { name: '1280x720', w: 1280, h: 720 },
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '1100x800', w: 1100, h: 800 }
];
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

export async function startVite() {
  const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  return vite;
}

/** Abre um browser, roda `fn(page, errors)` e fecha sempre. */
export async function withPage(viewport, fn, { gpu = true } = {}) {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (gpu) await assertHardwareGpu(page);
    return await fn(page, errors);
  } finally {
    await browser.close().catch(() => {});
  }
}

export const URL_BASE = `http://127.0.0.1:${PORT}`;
export const GAME_URL = `${URL_BASE}/?skipPreload&texq=low&play`;
export async function waitGame(page) {
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
}
