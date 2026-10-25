#!/usr/bin/env node
/**
 * M3-03 — capturas NO JOGO da missão 2 "O Pouso do Encontro" (war-alliance, mapa camp-02-pouso-do-encontro).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/ui-captures/M3-03/capture.mjs
 * Vite na porta 5333 (PORT_VITE). Saída: esta pasta.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5333);
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low&campaign=unlock`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('[data-action="campaign"]', { timeout: 60000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await page.waitForTimeout(600);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('[data-cs="pick"][data-id="war-alliance"]', { timeout: 30000 });
  await page.click('[data-cs="pick"][data-id="war-alliance"]');
  const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 20000 }).catch(() => null);
  if (skip) { await skip.click(); await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {}); }
  await page.waitForSelector('[data-cp="pick"][data-id="war-alliance-02-pouso-do-encontro"]', { timeout: 30000 });
  await page.click('[data-cp="pick"][data-id="war-alliance-02-pouso-do-encontro"]');
  await page.waitForTimeout(500);
  await shot('01-briefing.png');
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
  // cutscene de abertura: um quadro por passo (0, 7, 14, 20 s)
  await page.waitForTimeout(3000);
  await shot('02-cutscene-1-desembarque.png');
  await page.waitForTimeout(6000);
  await shot('03-cutscene-2-bandidos-sudoeste.png');
  await page.waitForTimeout(7000);
  await shot('04-cutscene-3-bandidos-norte.png');
  await page.waitForTimeout(6500);
  await shot('05-cutscene-4-base-orc.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await shot('06-inicio-objetivos.png');
  // vistas das prisões: a câmera do jogo vai até cada âncora (revela a névoa na área para a captura)
  const look = async (anchor, name, dz = 0) => {
    await page.evaluate(({ anchor, dz }) => {
      const gm = window.game.gameManager;
      const a = gm.terrain.mapDef.anchors[anchor];
      gm.fogOfWar?.revealArea(a.x, a.z + dz, 40, 60);
      gm.events.emit('mission_camera', { x: a.x, z: a.z + dz, zoom: 1.0 });
    }, { anchor, dz });
    await page.waitForTimeout(2200);
    await shot(name);
  };
  await look('scoutPrison1', '07-prisao-1-perto-dos-bandidos.png');
  await look('scoutPrison4', '08-prisao-4-atras-da-base-orc.png');
  // resgate: derruba um trecho da muralha da prisão 1 e mostra o contador 1/6
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    gm.entitiesById.get(gm.mission.tags.get('prison1')[3])?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(2500);
  await look('scoutPrison1', '09-batedor-libertado-1de6.png');
  // fim: Ferraria + pesquisa + 6 resgatados -> cutscene final -> vitória
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    gm.mission.setObjectiveStatus('build-forge', 'completed');
    for (const id of gm.mission.tags.get('prison_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
    for (let n = 2; n <= 6; n++) gm.entitiesById.get(gm.mission.tags.get(`prison${n}`)[3])?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.game.gameManager.mission.setObjectiveStatus('research-weapons', 'completed'));
  await page.waitForTimeout(6000);
  await shot('10-cutscene-final.png');
  await page.waitForFunction(() => window.game.gameManager.mission.outcome === 'victory', null, { timeout: 60000 });
  await page.waitForTimeout(3500);
  await shot('11-fim-vitoria.png');
  console.log(errors.length ? 'ERROS: ' + errors.join(' | ') : 'sem erros de console');
} catch (e) {
  console.log('FALHOU:', e.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
