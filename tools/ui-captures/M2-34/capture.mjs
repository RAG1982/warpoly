// M2-34: captura a tela de escolha de campanha. Rodar:
//   bash tools/safe-run.sh --timeout 240 -- node tools/ui-captures/M2-34/capture.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const PORT = 5334;
const OUT = 'tools/ui-captures/M2-34';
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage'] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low`);
  await page.waitForSelector('[data-action="campaign"]', { timeout: 90000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await assertHardwareGpu(page);
  await page.waitForTimeout(800);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('.cs-card');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/select.png` });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  console.log('foco apos seta:', await page.evaluate(() => document.activeElement.dataset.id));
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/select-focus.png` });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ms-brief-item');
  const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 4000 }).catch(() => null);
  if (skip) { await skip.click(); await page.waitForTimeout(600); }
  await page.waitForSelector('.ms-brief-switch');
  await page.screenshot({ path: `${OUT}/missions.png` });
  await page.click('.ms-brief-switch');
  await page.waitForSelector('.cs-card');
  console.log('trocar campanha volta:', await page.locator('.cs-card').count(), 'cartoes');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('Esc fecha:', await page.locator('.cs-overlay').count());
  console.log('erros:', JSON.stringify(errs));
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
