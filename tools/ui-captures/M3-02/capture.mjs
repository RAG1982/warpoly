#!/usr/bin/env node
/**
 * M3-02 — capturas NO JOGO da missão 1 "Terra à Vista" (war-alliance, mapa camp-01-baia-de-aurelan).
 * Caminho do jogador: menu > Campanha > m01 > Iniciar (`?campaign=unlock`). GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/ui-captures/M3-02/capture.mjs
 * Vite na porta 5331 (PORT_VITE). Saída: esta pasta.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5331);
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
  const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 5000 }).catch(() => null);
  if (skip) { await skip.click(); await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {}); }
  await page.waitForSelector('[data-cp="pick"][data-id="war-alliance-01-terra-a-vista"]', { timeout: 10000 });
  await page.click('[data-cp="pick"][data-id="war-alliance-01-terra-a-vista"]');
  await page.waitForTimeout(500);
  await shot('01-briefing.png');
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await shot('02-cutscene-abertura.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  await shot('03-inicio-objetivo-quartel.png');
  // Quartel concluído de verdade (sim) + 3 soldados treinados de verdade -> contador n/7 no painel
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const hq = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
    const b = gm.createBuilding('barracks', hq.mesh.position.x + 12, hq.mesh.position.z - 12, true, 0);
    gm.buildings.push(b);
    gm.recalculatePopCap();
    const r = gm.getPlayer(0).resources; r.gold = 1500; r.wood = 1500; r.stone = 500;
    for (const t of ['knight', 'knight', 'archer', 'archer']) gm.issue({ type: 'train', playerId: 0, buildingId: b.id, unitType: t });
  });
  await page.waitForFunction(() => window.game.gameManager.mission.trainedCount(0, 'knight') + window.game.gameManager.mission.trainedCount(0, 'archer') >= 3, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await shot('04-objetivo-treino-contador.png');
  // acampamento destruído -> cutscene da vela -> fim
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.mission.setObjectiveStatus('train-troops', 'completed');
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('smuggler_camp')) gm.entitiesById.get(id).takeDamage(1e6, k);
  });
  await page.waitForTimeout(7500);
  await shot('05-cutscene-da-vela.png');
  await page.waitForFunction(() => window.game.gameManager.mission.outcome === 'victory', null, { timeout: 60000 });
  await page.waitForTimeout(3500);
  await shot('06-fim-vitoria.png');
  console.log(errors.length ? 'ERROS: ' + errors.join(' | ') : 'sem erros de console');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
