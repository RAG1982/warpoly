#!/usr/bin/env node
/**
 * M3-04 — capturas NO JOGO da missão 3 "Ouro da Pedra-Mãe" (war-alliance, mapa camp-03-pedra-mae).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-04/capture.mjs
 * Vite na porta 5334 (PORT_VITE). Saída: esta pasta (PNG + resultado.json).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5334);
const ID = 'war-alliance-03-ouro-da-pedra-mae';
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
  // cutscene de abertura: um quadro por passo (0, 8, 15, 23, 31 s)
  await page.waitForTimeout(3500);
  await shot('02-cutscene-1-colonia-brann.png');
  await page.waitForTimeout(7000);
  await shot('03-cutscene-2-veio.png');
  await page.waitForTimeout(7000);
  await shot('04-cutscene-3-desfiladeiro.png');
  await page.waitForTimeout(8000);
  await shot('05-cutscene-4-acampamento-orc.png');
  await page.waitForTimeout(8000);
  await shot('06-cutscene-5-mervane.png');
  await page.keyboard.press('Escape'); // pula a cutscene
  await page.waitForTimeout(1500);
  await page.waitForTimeout(5500); // aos 40 s a campanha eleva o Paço ao nível 2 (Estábulo/Cavaleiro): aviso "Centro evoluído"
  await shot('06b-aviso-centro-evoluido.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await shot('07-inicio-objetivos-brann.png');
  // câmera do jogo até uma âncora (revela a névoa na área para a captura)
  const look = async (anchor, name, { dx = 0, dz = 0, zoom = 1.0, wait = 2200 } = {}) => {
    await page.evaluate(({ anchor, dx, dz, zoom }) => {
      const gm = window.game.gameManager;
      const a = gm.terrain.mapDef.anchors[anchor];
      gm.fogOfWar?.revealArea(a.x + dx, a.z + dz, 46, 90);
      gm.events.emit('mission_camera', { x: a.x + dx, z: a.z + dz, zoom });
    }, { anchor, dx, dz, zoom });
    await page.waitForTimeout(wait);
    await shot(name);
  };
  await look('ridgeMidPlayer', '08-mapa-crista-e-desfiladeiros.png', { dx: 4, zoom: 1.8, wait: 3000 });
  // Brann: seleciona o herói (painel com mana e as 3 habilidades)
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const b = gm.entitiesById.get(gm.mission.tags.get('brann')[0]);
    window.game.inputManager.selectUnits([b], { additive: false });
    gm.events.emit('mission_camera', { x: b.mesh.position.x, z: b.mesh.position.z, zoom: 1.2 });
  });
  await page.waitForTimeout(2000);
  await shot('09-brann-heroi.png');
  // muralhas e torres nos dois desfiladeiros (as mesmas posições das âncoras, via a ação `spawnBuilding` da missão)
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    for (const L of 'AB') for (let k = 1; k <= 3; k++) runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'wall_human', x: A[`wall${L}${k}`].x, z: A[`wall${L}${k}`].z });
    for (const n of ['towerA1', 'towerB2']) runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'watchtower', x: A[n].x, z: A[n].z });
  });
  await look('passA', '10-desfiladeiro-A-fechado.png', { dx: -4, zoom: 0.85 });
  await look('passB', '11-desfiladeiro-B-fechado.png', { dx: -4, zoom: 0.85 });
  // ondas: a 1ª onda e um trecho da Catapulta chegando aos desfiladeiros fechados
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    runAction(gm.mission, { type: 'spawn', owner: 'enemy', units: [{ type: 'grunt', count: 4 }, { type: 'axethrower', count: 2 }, { type: 'catapult', count: 1 }], x: A.passAEnemy.x + 14, z: A.passAEnemy.z, spread: 3, tag: 'wave', order: { kind: 'attackMove', x: A.playerStart.x, z: A.playerStart.z } });
  });
  await page.waitForTimeout(6000);
  await look('passA', '12-onda-no-desfiladeiro-com-cerco.png', { dx: 4, zoom: 0.95, wait: 1500 });
  // secundárias: mineiros cativos e guardas; depois libertados (n/3) e o Santuário
  await look('captive1', '13-mineiros-cativos-guardados.png', { zoom: 1.1 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('miner_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(2500);
  await look('captive1', '14-mineiros-libertados-3de3.png', { zoom: 1.1, wait: 1500 });
  await look('shrine1', '15-santuario-escondido.png', { zoom: 1.0 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const a = gm.terrain.mapDef.anchors.shrine1;
    const k = gm.getUnitsOf(0).find((u) => u.type === 'knight');
    k.mesh.position.set(a.x, k.mesh.position.y, a.z);
    gm.unitGrid.update(k, a.x, a.z, k.collisionRadius || 0);
  });
  await page.waitForTimeout(2500);
  await shot('16-santuario-achado-ouro.png');
  // fim: sobreviveu + ouro -> cutscene final -> vitória
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.mission.setObjectiveStatus('p-gold', 'completed');
    gm.mission.setObjectiveStatus('p-survive', 'completed');
  });
  await page.waitForTimeout(5000);
  await shot('17-cutscene-final.png');
  await page.waitForFunction(() => window.game.gameManager.mission.outcome === 'victory', null, { timeout: 60000 });
  await page.waitForTimeout(3500);
  await shot('18-fim-vitoria.png');
  console.log(result.errors.length ? 'ERROS: ' + result.errors.join(' | ') : 'sem erros de console');
} catch (e) {
  console.log('FALHOU:', e.message.split('\n')[0]);
  result.failed = e.message.split('\n')[0];
  process.exitCode = 1;
} finally {
  writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2));
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
