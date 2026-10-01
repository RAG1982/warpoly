import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
export async function boot(port) {
  const ctx = {};
  ctx.vite = await createServer({ server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await ctx.vite.listen();
  ctx.browser = await chromium.launch({ headless: true, args: ARGS });
  ctx.page = await (await ctx.browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  ctx.errors = [];
  ctx.page.on('pageerror', e => ctx.errors.push('pageerror: ' + e.message));
  ctx.page.on('console', m => { if (m.type() === 'error') ctx.errors.push(m.text()); });
  await assertHardwareGpu(ctx.page);
  await ctx.page.goto(`http://127.0.0.1:${port}/?skipPreload&texq=low&play&debug`, { waitUntil: 'load', timeout: 90000 });
  await ctx.page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await ctx.page.waitForTimeout(1500);
  return ctx;
}
export async function shutdown(ctx) {
  if (ctx.browser) await ctx.browser.close().catch(() => {});
  if (ctx.vite) await ctx.vite.close().catch(() => {});
}
