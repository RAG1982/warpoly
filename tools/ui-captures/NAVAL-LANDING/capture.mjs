#!/usr/bin/env node
/**
 * NAVAL-LANDING — captura NO JOGO do desembarque anfíbio orc na m04 (barcaça + escolta chegando à praia e soltando a tropa).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/ui-captures/NAVAL-LANDING/capture.mjs
 * Vite na porta 5336. Saída: esta pasta (PNG + resultado.json).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5336);
const ID = 'war-alliance-04-baixio-do-breu';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const result = { shots: [], errors: [], notes: [] };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  result.gpu = await assertHardwareGpu(page);
  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n) }); result.shots.push(n); };
  const dismiss = async () => { const b = await page.$('button:has-text("Fechar")'); if (b) await b.click().catch(() => {}); };
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low&campaign=unlock`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('[data-action="campaign"]', { timeout: 60000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await page.waitForTimeout(600);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('[data-cs="pick"][data-id="war-alliance"]', { timeout: 30000 });
  await page.click('[data-cs="pick"][data-id="war-alliance"]');
  const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 20000 }).catch(() => null);
  if (skip) { await skip.click(); await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {}); }
  await page.waitForSelector(`[data-cp="pick"][data-id="${ID}"]`, { timeout: 30000 });
  await page.click(`[data-cp="pick"][data-id="${ID}"]`);
  await page.waitForTimeout(500);
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await dismiss();
  await page.evaluate(() => { window.game.gameManager.fogOfWar?.revealArea(0, 0, 400, 600); });
  const ff = (s) => page.evaluate((t) => { const gm = window.game.gameManager; for (let i = 0; i < Math.round(t * 20); i++) gm.simStep(1 / 20); }, s);
  const follow = async (name, zoom = 1.0) => {
    await page.evaluate((z) => {
      const gm = window.game.gameManager, p = window.__barge.mesh.position;
      gm.events.emit('mission_camera', { x: p.x, z: p.z, zoom: z });
    }, zoom);
    await dismiss();
    await page.waitForTimeout(1800);
    await shot(name);
  };
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager;
    const act = gm.mission.def.triggers.find((t) => t.id === 'landing').actions.find((a) => a.type === 'spawnLanding');
    runAction(gm.mission, act);
    window.__barge = gm.entitiesById.get(gm.mission.tags.get('landing_barge')[0]);
  });
  await follow('01-barcaca-nasce-com-escolta.png', 0.9);
  await ff(25); await follow('02-a-caminho.png', 0.8);
  await ff(25); await follow('03-chegando-na-praia.png', 0.9);
  for (let i = 0; i < 20; i++) {
    const n = await page.evaluate(() => window.__barge.cargo.length);
    if (!n) break;
    await ff(3);
  }
  await page.evaluate(() => window.game.gameManager.events.emit('mission_camera', { x: window.__barge.mesh.position.x - 4, z: window.__barge.mesh.position.z, zoom: 1.2 }));
  await page.waitForTimeout(1500); await shot('04-desembarque-na-praia.png');
  await ff(6); await page.waitForTimeout(800); await shot('05-tropa-ataca.png');
  result.notes.push('carga restante: ' + await page.evaluate(() => window.__barge.cargo.length));
} catch (e) {
  result.errors.push('fatal: ' + ((e && e.stack) || e));
} finally {
  writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2));
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
console.log(JSON.stringify(result, null, 2));
