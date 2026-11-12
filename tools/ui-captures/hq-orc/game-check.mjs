#!/usr/bin/env node
/**
 * Centro orc em 3 níveis no jogo. Só mede e captura; não altera src/ nem tests/.
 *  C1  o Salão do Clã usa hq_orc_1/2/3 conforme `entity.tier` (a view troca de modelo sozinha).
 *  C2  sem pageerror nem console.error.
 * Capturas: game-nivelN.png. Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/hq-orc/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5534;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = []; let bad = false;
function rec(id, name, ok, d = '') { if (!ok) bad = true; console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${d}`); }
let vite = null; let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1&faction=orc`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(1500);
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  for (const tier of [1, 2, 3]) {
    const r = await page.evaluate(async (tier) => {
      const gm = window.game.gameManager; const sm = window.game.sceneManager;
      const b = gm.buildings.find((x) => x.ownerId === gm.localPlayerId && x.role === 'hq');
      b.tier = tier;
      sm.cameraTarget.set(b.mesh.position.x, 3, b.mesh.position.z); sm.targetZoomLevel = 0.6; sm.zoomLevel = 0.6;
      await new Promise((res) => setTimeout(res, 1800));
      const v = gm.entityViews.viewOf(b);
      let name = null; v.fullMesh.traverse((c) => { if (c.name && /^HqOrc/.test(c.name)) name = c.name; });
      return { type: b.type, tier: v._tier, name };
    }, tier);
    rec('C1', `nível ${tier}: modelo HqOrc${tier}`, r.type === 'great_hall' && r.tier === tier && r.name === `HqOrc${tier}`, JSON.stringify(r));
    await page.screenshot({ path: path.join(HERE, `game-nivel${tier}.png`) });
  }
} catch (e) { console.error('ERRO fatal:', e); bad = true; } finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const real = errors.filter((e) => !/deprec/i.test(e));
rec('C2', 'sem pageerror nem console.error', real.length === 0, real.slice(0, 3).join(' | '));
process.exitCode = bad ? 1 : 0;
