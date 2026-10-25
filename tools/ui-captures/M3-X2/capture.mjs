#!/usr/bin/env node
/**
 * M3-X2 — capturas NO JOGO das secundárias de exploração/resgate (m01 pescador cativo; m02 Ruínas Esquecidas com brilho).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/ui-captures/M3-X2/capture.mjs
 * Vite na porta 5342 (PORT_VITE). Saída: esta pasta. O atalho de tempo (sem esperar os 60 s do aviso do capitão) revela o objetivo
 * oculto direto pelo `revealObjective`; o resto segue as regras do jogo (gatilhos, recompensas, marco aceso).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5342);
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
  const startMission = async (id) => {
    await page.goto(`http://127.0.0.1:${PORT}/?texq=low&campaign=unlock`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('[data-action="campaign"]', { timeout: 60000 });
    await page.evaluate(() => { window.warpoly.skipPreload = true; }).catch(() => {});
    await page.waitForTimeout(600);
    await page.click('[data-action="campaign"]');
    await page.waitForSelector('[data-cs="pick"][data-id="war-alliance"]', { timeout: 30000 });
    await page.click('[data-cs="pick"][data-id="war-alliance"]');
    const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 20000 }).catch(() => null);
    if (skip) { await skip.click(); await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {}); }
    await page.waitForSelector(`[data-cp="pick"][data-id="${id}"]`, { timeout: 30000 });
    await page.click(`[data-cp="pick"][data-id="${id}"]`);
    await page.waitForTimeout(400);
    await page.click('[data-cp="start"]');
    await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
    // a cutscene de abertura dura ~21 s e toma a câmera: espera acabar (Escape pausava a sim; não usar)
    await page.waitForTimeout(24000);
    await page.evaluate(() => { window.game.gameManager.mission.dialogsHidden = true; }).catch(() => {});
  };
  // teleporte: posição da sim (`_simPos`/`_prevPos`) + mesh + grade
  const hop = (anchor, dx = 0, dz = 0) => page.evaluate(({ anchor, dx, dz }) => {
    const gm = window.game.gameManager;
    const a = gm.terrain.mapDef.anchors[anchor];
    const k = gm.getUnitsOf(0).find((u) => !u.isDead && u.type === 'knight') || gm.getUnitsOf(0).find((u) => !u.isDead);
    // a sim lê `_simPos` (o mesh é só a interpolação do render): move os três
    k._simPos.set(a.x + dx, k._simPos.y, a.z + dz);
    k._prevPos.copy(k._simPos);
    k.mesh.position.set(a.x + dx, k.mesh.position.y, a.z + dz);
    gm.unitGrid.update(k, a.x + dx, a.z + dz, k.collisionRadius || 0);
  }, { anchor, dx, dz });
  const look = (anchor, dz = 0) => page.evaluate(({ anchor, dz }) => {
    const gm = window.game.gameManager;
    const a = gm.terrain.mapDef.anchors[anchor];
    gm.fogOfWar?.revealArea(a.x, a.z + dz, 40, 60);
    gm.events.emit('mission_camera', { x: a.x, z: a.z + dz, zoom: 0.55 });
    // a cutscene/diálogo pode tomar a câmera: posiciona direto no gerenciador de cena (o alvo e o zoom ficam por cima)
    const sm = window.game.sceneManager;
    // trava o alvo: algo do jogo devolve a câmera à base logo depois (medido: em ~300 ms)
    clearInterval(window.__camLock);
    window.__camLock = setInterval(() => { if (sm?.cameraTarget) { sm.cameraTarget.set(a.x, 2.5, a.z + dz); sm.targetZoomLevel = 0.3; } }, 30);
  }, { anchor, dz });

  // ---- m01: pescador cativo resgatado ----
  await startMission('war-alliance-01-terra-a-vista');
  // atalho de tempo: o aviso do capitão (~60 s) revela as ruínas; aqui o objetivo oculto é revelado direto
  await page.evaluate(() => window.game.gameManager.mission.revealObjective('find-ruins'));
  await look('captive1', 4);
  await page.waitForTimeout(1500);
  await shot('01-m01-pescador-cativo-guardado.png');
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('fisher_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(600);
  await hop('captive1', 2, 2);
  await page.waitForTimeout(2000);
  await look('captive1', 2);
  await page.waitForTimeout(900);
  await shot('02-m01-cativo-resgatado.png');
  const m1 = await page.evaluate(() => { const gm = window.game.gameManager; return { owner: gm.mission.tags.get('fisher').map((id) => gm.entitiesById.get(id)?.ownerId), rescue: gm.mission.objectives.get('rescue-fisher').status, gold: gm.getPlayer(0).resources.gold }; });
  console.log('m01', JSON.stringify(m1));

  // ---- m02: ruínas achadas com brilho e Emissário com nome e cor ----
  await page.goto('about:blank');
  await startMission('war-alliance-02-pouso-do-encontro');
  // prisão 3 (atrás da base orc): os guardas dela caem antes, como no teste; só então o batedor é solto
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('prison_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
    gm.entitiesById.get(gm.mission.tags.get('prison3')[3])?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(2500);
  await hop('ruins1', 0, 0);
  await page.waitForTimeout(700);
  await look('ruins1', 0);
  await page.waitForTimeout(300);
  await shot('03-m02-ruinas-achadas-brilho.png');
  const m2 = await page.evaluate(() => { const gm = window.game.gameManager; return { find: gm.mission.objectives.get('find-ruins').status, lit: gm.mission.landmarks.find((l) => l.tag === 'ruins')?.lit, gold: gm.getPlayer(0).resources.gold, outcome: gm.mission.outcome }; });
  console.log('m02', JSON.stringify(m2));
  console.log(errors.length ? 'ERROS: ' + errors.join(' | ') : 'sem erros de console');
} catch (e) {
  console.log('FALHOU:', e.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
