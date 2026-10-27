#!/usr/bin/env node
/**
 * FIX-MAGE-TRAIN — Torre Arcana: treino de Mago + pesquisa, na missão 5 "O Cerne Verde" (war-alliance, mapa camp-05-cerne-verde).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/FIX-MAGE-TRAIN/capture.mjs <prefixo: antes|depois>
 * Vite na porta 5337 (PORT_VITE). Saída: esta pasta (PNG + resultado.json).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = process.argv[2] || 'depois';
const PORT = Number(process.env.PORT_VITE || 5337);
const ID = 'war-alliance-05-cerne-verde';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const result = { shots: [], errors: [], prefix: PREFIX };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  result.gpu = await assertHardwareGpu(page);
  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, `${PREFIX}-${n}`) }); result.shots.push(n); };
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
  // cutscene de abertura: um quadro por passo (0, 8, 16, 24, 31 s)
  await page.waitForTimeout(3500);
  
  await page.waitForTimeout(7000);
  
  await page.waitForTimeout(8000);
  
  await page.waitForTimeout(8000);
  
  await page.waitForTimeout(7000);
  
  await page.keyboard.press('Escape'); // pula a cutscene
  await page.waitForTimeout(1500);
  await page.waitForTimeout(5500); // aos 40 s a campanha eleva o Paço ao nível 3 (não aperte Esc de novo: pausa o jogo)
  await page.waitForTimeout(800);
  const R = {};
  result.dbg = await page.evaluate(() => { const gm = window.game.gameManager; return { tick: gm.mission.tick, paused: gm.paused, hq: gm.buildings.filter((b) => b.ownerId === gm.localPlayerId).map((b) => [b.type, b.tier]), cut: !!document.querySelector('.cutscene,.story-screen') }; });
  try {
    await page.waitForFunction(() => { const gm = window.game.gameManager; return gm.buildings.some((b) => b.ownerId === gm.localPlayerId && (b.tier || 1) >= 3); }, null, { timeout: 30000 });
  } catch (e) { await shot('dbg.png'); result.dbg2 = await page.evaluate(() => { const gm = window.game.gameManager; return { tick: gm.mission.tick, state: gm.state, paused: gm.isPaused ?? gm.paused, speed: gm.gameSpeed, tiers: gm.buildings.map((b) => [b.type, b.tier, b.ownerId]) }; }); throw e; }
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const put = (t, dx, dz) => runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: t, x: A.playerStart.x + dx, z: A.playerStart.z + dz });
    put('farm', 14, 4); put('barracks', 14, -8); put('arcane_tower', 26, 2); put('aviary', 26, -12); put('temple', 14, 16);
    gm.resources.gold += 5000; gm.resources.wood += 3000; gm.resources.stone += 1000;
  });
  await page.waitForTimeout(1500);
  const panel = (type) => page.evaluate((type) => {
    const gm = window.game.gameManager;
    const b = gm.buildings.find((x) => x.type === type && x.ownerId === gm.localPlayerId);
    gm.selectSingle(b);
    const a = gm.terrain.mapDef.anchors.playerStart;
    gm.events.emit('mission_camera', { x: b.mesh.position.x, z: b.mesh.position.z, zoom: 1.4 });
    return b.id;
  }, type);
  const dom = () => page.evaluate(() => ({
    label: document.querySelector('#bld-train-section .bld-section-label')?.innerText,
    trainVisible: getComputedStyle(document.getElementById('bld-train-section')).display,
    train: [...document.querySelectorAll('#bld-train-buttons [data-train]')].map((e) => ({ id: e.dataset.train, disabled: e.disabled, title: e.title })),
    upgrade: [...document.querySelectorAll('#bld-train-buttons [data-upgrade]')].map((e) => ({ id: e.dataset.upgrade, disabled: e.disabled }))
  }));
  for (const [type, shotName, trainId] of [['arcane_tower', 'torre-arcana', 'mage'], ['aviary', 'aviario', 'gryphon_rider'], ['temple', 'templo', null]]) {
    await panel(type);
    await page.waitForTimeout(1800);
    R[type] = await dom();
    await shot(`${shotName}.png`);
    if (trainId) {
      const sel = `#bld-train-buttons [data-train="${trainId}"]`;
      const n = await page.locator(sel).count();
      if (n > 0 && !(await page.locator(sel).first().isDisabled())) {
        for (let i = 0; i < (type === 'arcane_tower' ? 2 : 1); i++) await page.locator(sel).first().click();
        await page.waitForTimeout(800);
        R[type].queued = await page.evaluate((type) => {
          const gm = window.game.gameManager;
          const b = gm.buildings.find((x) => x.type === type && x.ownerId === gm.localPlayerId);
          return b.queue.map((q) => q.type);
        }, type);
        await shot(`${shotName}-fila.png`);
      }
    }
  }
  // acelera a fila da Torre Arcana até os Magos saírem e confere o objetivo
  R.objective = await page.evaluate(async () => {
    const gm = window.game.gameManager;
    const b = gm.buildings.find((x) => x.type === 'arcane_tower' && x.ownerId === gm.localPlayerId);
    for (let i = 0; i < 400 && b.queue.length; i++) { if (b.queue[0]) b.queue[0].progress = b.queue[0].totalTime; await new Promise((r) => setTimeout(r, 50)); }
    await new Promise((r) => setTimeout(r, 1000));
    const o = gm.mission.objectives.get('s-arcane');
    return { status: o.status, cur: o.cur, max: o.max, queueLeft: b.queue.length };
  });
  result.R = R;
  console.log(JSON.stringify(R, null, 1));
} catch (e) {
  result.errors.push('FATAL: ' + (e && e.stack || e));
} finally {
  writeFileSync(path.join(OUT, `resultado-${PREFIX}.json`), JSON.stringify(result, null, 2));
  if (browser) await browser.close();
  await vite.close();
}
