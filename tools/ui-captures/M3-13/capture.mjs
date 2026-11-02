#!/usr/bin/env node
/**
 * M3-13 — capturas NO JOGO da missão 12 "O Bastião do Cabo Ferrugem" (war-alliance, mapa camp-12-cabo-ferrugem, deserto, 384, naval).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-13/capture.mjs
 * Vite na porta 5343 (PORT_VITE). Saída: esta pasta (PNG + resultado.json).
 * A câmera é movida pelo evento `mission_camera` (como na M3-07). Brann não morre na captura (inimigos perto do Paço são removidos).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5343);
const ID = 'war-alliance-12-bastiao-do-cabo-ferrugem';
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
  // Brann não morre durante a captura: qualquer inimigo que chegue perto do Paço é removido (só a captura)
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    setInterval(() => {
      const k = gm.getUnitsOf(0).find((u) => !u.isDead);
      for (const u of gm.allUnits) if (!u.isDead && gm.isHostile(0, u.ownerId) && Math.hypot(u.mesh.position.x - A.playerStart.x, u.mesh.position.z - A.playerStart.z) < 60) u.takeDamage(1e6, k);
    }, 1500);
  });
  // cutscene de abertura: um quadro por passo (0, 10, 20, 30, 40 s)
  await page.waitForTimeout(3500);
  await shot('02-cutscene-1-brann-cabo.png');
  await page.waitForTimeout(10000);
  await shot('03-cutscene-2-oren-estreito.png');
  await page.waitForTimeout(10000);
  await shot('04-cutscene-3-dorian-desfiladeiro.png');
  await page.waitForTimeout(10000);
  await shot('05-cutscene-4-skarn.png');
  await page.waitForTimeout(10000);
  await shot('06-cutscene-5-praia-barcaca.png');
  await page.waitForTimeout(8000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Fechar' }).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
  await shot('07-inicio-objetivos.png');
  const focus = async (anchor, zoom, name, r = 34) => {
    await page.evaluate(([a, zm, rr]) => {
      const gm = window.game.gameManager, p = gm.terrain.mapDef.anchors[a];
      gm.fogOfWar?.revealArea(p.x, p.z, rr, 0); // só para a captura: a névoa de guerra esconderia o resto do mapa
      gm.events.emit('mission_camera', { x: p.x, z: p.z, zoom: zm });
    }, [anchor, zoom, r]);
    await page.waitForTimeout(4000); // a câmera desliza até o alvo
    await shot(name);
  };
  await focus('passA', 1.1, '08-crista-de-falesia-desfiladeiro-A.png');
  await focus('passB', 1.1, '09-desfiladeiro-B-muralha-e-torres.png');
  await focus('strait', 0.9, '10-estreito-entre-o-cabo-e-a-ilha.png', 44);
  await focus('dock2', 1.1, '11-doca-orca-no-litoral-norte.png');
  await focus('assaultBeach', 1.1, '12-praia-do-assalto-anfibio.png');
  await focus('isletCaptive', 1.2, '13-ilhota-dos-naufragos.png');
  await focus('bastionHall', 1.0, '14-marco-do-bastiao.png');
  writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2));
  console.log('capturas:', result.shots.length, 'erros de console:', result.errors.length);
} finally {
  if (browser) await browser.close();
  await vite.close();
}
