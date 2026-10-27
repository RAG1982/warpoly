#!/usr/bin/env node
/**
 * M3-08 — capturas NO JOGO da missão 7 "O Brejo Mudo" (war-alliance, mapa camp-07-brejo-mudo, pântano de 320).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-08/capture.mjs
 * Vite na porta 5338 (PORT_VITE). Saída: esta pasta (PNG + resultado.json).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5338);
const ID = 'war-alliance-07-brejo-mudo';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const result = { shots: [], errors: [] };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  result.gpu = await assertHardwareGpu(page);
  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n) }); result.shots.push(n); };
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
  await shot('01-briefing.png');
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
  // cutscene de abertura (4 quadros em 0, 8, 16 e 25 s): pulamos e olhamos cada ponto pela câmera
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const look = async (anchor, name, { dx = 0, dz = 0, zoom = 1.0, wait = 2500, reveal = 46 } = {}) => {
    await page.evaluate(({ anchor, dx, dz, zoom, reveal }) => {
      const gm = window.game.gameManager;
      const a = gm.terrain.mapDef.anchors[anchor];
      gm.fogOfWar?.revealArea(a.x + dx, a.z + dz, reveal, 90);
      gm.events.emit('mission_camera', { x: a.x + dx, z: a.z + dz, zoom });
    }, { anchor, dx, dz, zoom, reveal });
    await page.waitForTimeout(wait);
    await shot(name);
  };
  await look('playerStart', '02-base-da-liga.png', { zoom: 1.4 });
  await look('allyStart', '03-paco-de-mervane.png', { zoom: 1.4 });
  await look('brakkaHall', '04-salao-de-brakka.png', { zoom: 1.0, wait: 3000 });
  await look('boarPen1', '05-cercado-de-javalis.png', { zoom: 1.0 });
  await look('ironDepot', '06-ferraria-de-contrabando.png', { zoom: 1.0 });
  // mapa inteiro: revela tudo e afasta a câmera
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.fogOfWar?.revealArea(0, 0, 260, 90);
    gm.events.emit('mission_camera', { x: 0, z: 0, zoom: 0.25 });
  });
  await page.waitForTimeout(3500);
  await shot('07-mapa-inteiro-camera-alta.png');
  result.map = await page.evaluate(() => {
    const m = window.game.gameManager.terrain.mapDef;
    const A = m.anchors;
    return { size: m.size, playable: m.playable, bases: Math.hypot(A.playerStart.x - A.enemyStart.x, A.playerStart.z - A.enemyStart.z), hall: [Math.hypot(A.brakkaHall.x - A.playerStart.x, A.brakkaHall.z - A.playerStart.z), Math.hypot(A.brakkaHall.x - A.enemyStart.x, A.brakkaHall.z - A.enemyStart.z)] };
  });
  await page.evaluate(() => { for (const id of ['minimap', 'mini-map', 'minimapCanvas']) { const e = document.getElementById(id); if (e) { e.dataset.cap = '1'; } } });
  await page.screenshot({ path: path.join(OUT, '08-minimapa.png'), clip: { x: 0, y: 420, width: 330, height: 300 } });
  result.shots.push('08-minimapa.png');
} catch (e) {
  result.errors.push('FALHA: ' + (e.stack || e.message));
} finally {
  writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2));
  await browser?.close();
  await vite.close();
}
console.log(JSON.stringify(result, null, 2));
