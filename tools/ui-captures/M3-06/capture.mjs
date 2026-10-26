#!/usr/bin/env node
/**
 * M3-06 — capturas NO JOGO da missão 5 "O Cerne Verde" (war-alliance, mapa camp-05-cerne-verde).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-06/capture.mjs
 * Vite na porta 5336 (PORT_VITE). Saída: esta pasta (PNG + resultado.json).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5336);
const ID = 'war-alliance-05-cerne-verde';
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
  // cutscene de abertura: um quadro por passo (0, 8, 16, 24, 31 s)
  await page.waitForTimeout(3500);
  await shot('02-cutscene-1-base-brann.png');
  await page.waitForTimeout(7000);
  await shot('03-cutscene-2-bosque-sagrado.png');
  await page.waitForTimeout(8000);
  await shot('04-cutscene-3-salao-do-bosque-vozgul.png');
  await page.waitForTimeout(8000);
  await shot('05-cutscene-4-ninho-de-grifos.png');
  await page.waitForTimeout(7000);
  await shot('06-cutscene-5-oren.png');
  await page.keyboard.press('Escape'); // pula a cutscene
  await page.waitForTimeout(1500);
  await page.waitForTimeout(5500); // aos 40 s a campanha eleva o Paço ao nível 3: aviso "Centro evoluído"
  await shot('06b-aviso-centro-evoluido.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await shot('07-inicio-objetivos-brann.png');
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
  await look('playerStart', '08-base-na-mata-densa.png', { zoom: 1.5, wait: 2500 });
  await look('lumberHall2', '09-salao-do-bosque-torres-e-guarda.png', { zoom: 1.0, wait: 3000 });
  // Brann: seleciona o herói
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const b = gm.entitiesById.get(gm.mission.tags.get('brann')[0]);
    window.game.inputManager.selectUnits([b], { additive: false });
    gm.events.emit('mission_camera', { x: b.mesh.position.x, z: b.mesh.position.z, zoom: 1.2 });
  });
  await page.waitForTimeout(2000);
  await shot('10-brann-heroi.png');
  // economia/tecnologia: Quartel, Fazenda, Torre Arcana, Aviário, Templo (via spawnBuilding da missão) + Serraria perto do bosque
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const put = (t, dx, dz) => runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: t, x: A.playerStart.x + dx, z: A.playerStart.z + dz });
    put('farm', 14, 4); put('barracks', 14, -8); put('arcane_tower', 26, 2); put('aviary', 26, -12); put('temple', 14, 16);
  });
  await look('playerStart', '11-torre-arcana-aviario-templo.png', { dx: 18, dz: 0, zoom: 1.1 });
  // Oren aos 240 s (aqui: dispara o gatilho) e os 2 Magos
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager;
    const trig = gm.mission.def.triggers.find((t) => t.id === 'oren-arrives');
    for (const a of trig.actions) runAction(gm.mission, a);
  });
  await page.waitForTimeout(2500);
  await look('playerStart', '12-oren-e-os-dois-magos.png', { dx: 10, dz: 9, zoom: 1.1, wait: 1500 });
  // lenhadores cativos e guardas; depois libertados (n/3)
  await look('clearing2', '13-lenhadores-cativos-guardados.png', { zoom: 1.1 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('wood_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(2500);
  await look('clearing2', '14-lenhadores-libertados-3de3.png', { zoom: 1.1, wait: 1500 });
  // Bosque Sagrado (oculto)
  await look('sacredGrove', '15-bosque-sagrado-escondido.png', { zoom: 1.0 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const a = gm.terrain.mapDef.anchors.sacredGrove;
    const k = gm.getUnitsOf(0).find((u) => u.type === 'knight');
    k.mesh.position.set(a.x, k.mesh.position.y, a.z);
    gm.unitGrid.update(k, a.x, a.z, k.collisionRadius || 0);
  });
  await page.waitForTimeout(2500);
  await shot('16-bosque-sagrado-achado.png');
  // 1ª leva: serpes e esqueletos chegando à base
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager;
    const trig = gm.mission.def.triggers.find((t) => t.id === 'raid-1');
    for (const a of trig.actions) runAction(gm.mission, a);
  });
  await page.waitForTimeout(7000);
  await look('playerStart', '17-leva-de-serpes-e-esqueletos.png', { dx: 16, dz: 4, zoom: 1.0, wait: 1500 });
  // ataque ao Salão do Bosque: tropa perto, Magos de Oren marcham
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const a = gm.terrain.mapDef.anchors.lumberHall2;
    for (const u of gm.getUnitsOf(0).filter((x) => !x.isDead && x.type !== 'villager' && x.type !== 'hero_brann').slice(0, 6)) {
      u.mesh.position.set(a.x - 24, u.mesh.position.y, a.z + 4);
      gm.unitGrid.update(u, a.x - 24, a.z + 4, u.collisionRadius || 0);
    }
  });
  await page.waitForTimeout(3000);
  await look('lumberHall2', '18-assalto-ao-salao-do-bosque.png', { dx: -10, zoom: 1.0, wait: 4000 });
  // fim: madeira + Salão destruído -> cutscene final -> vitória
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.mission.setObjectiveStatus('p-wood', 'completed');
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('grove_hall')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(5000);
  await shot('19-cutscene-final.png');
  await page.waitForFunction(() => window.game.gameManager.mission.outcome === 'victory', null, { timeout: 60000 });
  await page.waitForTimeout(3500);
  await shot('20-fim-vitoria.png');
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
