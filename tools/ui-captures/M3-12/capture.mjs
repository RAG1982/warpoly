#!/usr/bin/env node
/**
 * M3-12 — capturas NO JOGO da missão 11 "Porto Albor" (war-alliance, mapa camp-11-estepe-do-vento, savana, 352, naval).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-12/capture.mjs
 * Vite na porta 5352 (PORT_VITE). Saída: esta pasta (PNG + resultado.json com tempo de carregamento e FPS aproximado).
 * A câmera é movida pelo evento `mission_camera` (como na M3-10). Brann e o Marco não morrem na captura (inimigos perto do Paço e do
 * Marco são removidos; só a captura).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5352);
const ID = 'war-alliance-11-porto-albor';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const result = { shots: [], errors: [], perf: {} };
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
  const t0 = Date.now();
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
  result.perf.loadMs = Date.now() - t0; // do clique em "começar" até a partida existir (sem o pré-carregamento)
  // Brann e o Marco não morrem durante a captura: inimigos que chegam perto do Paço ou do Marco são removidos (só a captura)
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    setInterval(() => {
      const k = gm.getUnitsOf(0).find((u) => !u.isDead);
      for (const u of gm.allUnits) {
        if (u.isDead || !gm.isHostile(0, u.ownerId)) continue;
        const near = (p) => Math.hypot(u.mesh.position.x - p.x, u.mesh.position.z - p.z) < 45;
        if (near(A.playerStart) || near(A.colonyMark)) u.takeDamage(1e6, k);
      }
    }, 1500);
  });
  // FPS aproximado (requestAnimationFrame durante 3 s, com a cena já montada)
  await page.waitForTimeout(3500);
  result.perf.fps = await page.evaluate(() => new Promise((resolve) => {
    let n = 0; const t = performance.now();
    const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else resolve(Math.round((n * 1000) / (performance.now() - t))); };
    requestAnimationFrame(f);
  }));
  result.perf.renderer = await page.evaluate(() => {
    const info = window.game.gameManager.sceneManager?.renderer?.info;
    return info ? { calls: info.render.calls, triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries } : null;
  });
  await shot('02-cutscene-1-brann-base.png');
  await page.waitForTimeout(9000);
  await shot('03-cutscene-2-oren-marco.png');
  await page.waitForTimeout(9000);
  await shot('04-cutscene-3-skarn-voz.png');
  await page.waitForTimeout(9000);
  await shot('05-cutscene-4-landing.png');
  await page.waitForTimeout(3000);
  // os avisos de 0 s cobrem a cena: fecha antes das fotos
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Fechar' }).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
  await shot('06-inicio-objetivos.png');
  const focus = async (anchor, zoom, name) => {
    await page.evaluate(([a, zm]) => {
      const gm = window.game.gameManager, p = gm.terrain.mapDef.anchors[a];
      gm.fogOfWar?.revealArea(p.x, p.z, 34, 0); // só para a captura: a névoa de guerra esconderia o alvo
      gm.events.emit('mission_camera', { x: p.x, z: p.z, zoom: zm });
    }, [anchor, zoom]);
    await page.waitForTimeout(4000); // a câmera desliza até o alvo
    await shot(name);
  };
  await focus('colonyMark', 1.2, '07-marco-porto-albor-praia.png');
  await focus('landingZone', 1.2, '08-enseada-dos-reforcos.png');
  await focus('expansion1', 1.2, '09-mina-do-interior-sob-incursao.png');
  await focus('siegeFleetStart', 1.1, '10-mar-ao-sul-esquadra-de-cerco.png');
  await focus('dissidentClan', 1.0, '11-acampamento-de-hurgan.png');
  writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2));
  console.log('capturas:', result.shots.length, 'erros de console:', result.errors.length, 'perf:', JSON.stringify(result.perf));
} finally {
  if (browser) await browser.close();
  await vite.close();
}
