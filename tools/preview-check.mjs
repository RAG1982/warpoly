// F10-05: valida o build de produção servido por `vite preview` (opcionalmente numa subpasta).
// Uso: BASE=/warpoly/ npm run build && bash tools/safe-run.sh --mem 6G --timeout 240 -- node tools/preview-check.mjs [/warpoly/]
// Confere: jogo abre com ?skipPreload sem erros no console, ícones/GLB com base certa, service worker ativo.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const BASE = process.argv[2] || '/';
const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--base', BASE], { stdio: 'ignore', detached: true });
let browser;
const errors = [];
try {
  await new Promise((r) => setTimeout(r, 2500));
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  });
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 640 } })).newPage();
  await assertHardwareGpu(page);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.goto(`http://localhost:${PORT}${BASE}?skipPreload&texq=low`);
  await page.waitForFunction('window.game', null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active, caches: await caches.keys() };
  });
  console.log('SW:', JSON.stringify(sw));
} catch (e) {
  errors.push(`falha: ${e.message}`);
} finally {
  if (browser) await browser.close();
  try {
    process.kill(-server.pid); // mata o grupo (npx + vite), sem deixar órfão
  } catch {
    /* já encerrado */
  }
}
console.log(errors.length ? `ERROS (${errors.length}):\n${errors.join('\n')}` : 'OK: sem erros');
process.exit(errors.length ? 1 : 0);
