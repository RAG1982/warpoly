#!/usr/bin/env node
/**
 * M3-07 — capturas NO JOGO da missão 6 "A Geada" (war-alliance, mapa camp-06-a-geada, Prova de Fogo).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-07/capture.mjs
 * Vite na porta 5337 (PORT_VITE). Saída: esta pasta (PNG + resultado.json).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5337);
const ID = 'war-alliance-06-a-geada';
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
  // a captura leva alguns minutos de relogio: a leva do Sal Cinzento (330 s) nao pode derrubar o Capitao. Qualquer orc que chegue perto do Paço morre (so a captura)
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    setInterval(() => {
      const k = gm.getUnitsOf(0).find((u) => !u.isDead);
      for (const u of gm.allUnits) if (!u.isDead && gm.isHostile(0, u.ownerId) && Math.hypot(u.mesh.position.x - A.playerStart.x, u.mesh.position.z - A.playerStart.z) < 70) u.takeDamage(1e6, k);
    }, 1500);
  });
  // cutscene de abertura: um quadro por passo (0, 9, 18, 27, 36 s)
  await page.waitForTimeout(3500);
  await shot('02-cutscene-1-base-brann.png');
  await page.waitForTimeout(9000);
  await shot('03-cutscene-2-forte-de-brumar-aurora.png');
  await page.waitForTimeout(9000);
  await shot('04-cutscene-3-farol-boreal.png');
  await page.waitForTimeout(9000);
  await shot('05-cutscene-4-forte-dos-lancas-drogath.png');
  await page.waitForTimeout(9000);
  await shot('06-cutscene-5-sal-cinzento-noroeste.png');
  await page.keyboard.press('Escape'); // pula a cutscene
  await page.waitForTimeout(1500);
  await page.waitForTimeout(5500); // aos 50 s a campanha eleva o Paço ao nível 3: aviso "Centro evoluído"
  await shot('06b-aviso-centro-evoluido.png');
  await page.getByRole('button', { name: 'Fechar' }).click({ timeout: 3000 }).catch(() => {}); // fecha o painel (sem Esc: fora da cutscene o Esc abre a pausa)
  await page.waitForTimeout(800);
  await shot('07-inicio-objetivos-brann.png');
  const look = async (anchor, name, { dx = 0, dz = 0, zoom = 1.0, wait = 2200, reveal = 46 } = {}) => {
    await page.evaluate(({ anchor, dx, dz, zoom, reveal }) => {
      const gm = window.game.gameManager;
      const a = gm.terrain.mapDef.anchors[anchor];
      gm.fogOfWar?.revealArea(a.x + dx, a.z + dz, reveal, 90);
      gm.events.emit('mission_camera', { x: a.x + dx, z: a.z + dz, zoom });
    }, { anchor, dx, dz, zoom, reveal });
    await page.waitForTimeout(wait);
    await shot(name);
  };
  const act = (trigId) => page.evaluate(async (id) => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager;
    for (const a of gm.mission.def.triggers.find((t) => t.id === id).actions) runAction(gm.mission, a);
  }, trigId);
  // base da Liga, neve, mina inicial (leste) e pedra (oeste)
  await look('playerStart', '08-base-da-liga-na-neve.png', { zoom: 1.5, wait: 2500 });
  await look('goldMine1', '09-mina-inicial-e-pedra.png', { dx: -14, zoom: 1.2, wait: 2200 });
  await look('expansion1', '10-mina-de-expansao-ao-norte.png', { zoom: 1.1, wait: 2200 });
  // Brann: seleciona o herói
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const b = gm.entitiesById.get(gm.mission.tags.get('brann')[0]);
    window.game.inputManager.selectUnits([b], { additive: false });
    gm.events.emit('mission_camera', { x: b.mesh.position.x, z: b.mesh.position.z, zoom: 1.2 });
  });
  await page.waitForTimeout(2000);
  await shot('11-brann-heroi.png');
  // arsenal completo: Quartel, Fazenda, Torre Arcana, Aviario, Estabulo, Oficina e Templo (via spawnBuilding da missao)
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const put = (t, dx, dz) => runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: t, x: A.playerStart.x + dx, z: A.playerStart.z + dz });
    put('farm', 14, 4); put('barracks', 14, -8); put('arcane_tower', 26, 2); put('aviary', 26, -12); put('stable', 14, 16); put('workshop', 28, 14); put('temple', 2, -20);
  });
  await look('playerStart', '12-arsenal-completo-na-base.png', { dx: 16, dz: -2, zoom: 1.1 });
  // Farol Boreal: posto avancado dos Lancas (2 torres + guarda) no cabo, com a lanterna apagada
  await look('lighthouse', '13-farol-boreal-posto-dos-lancas.png', { zoom: 0.9, wait: 3000 });
  await look('lightTower1', '14-torre-do-posto-avancado.png', { zoom: 1.3, wait: 2200 });
  // forte dos Lancas Quebradas: Salao, 4 torres, guarda e Drogath
  await look('enemy1Fort', '15-forte-dos-lancas-torres-e-guarda.png', { zoom: 0.9, wait: 3000 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const dg = gm.entitiesById.get(gm.mission.tags.get('drogath')[0]);
    window.game.inputManager.selectUnits([dg], { additive: false });
    gm.events.emit('mission_camera', { x: dg.mesh.position.x, z: dg.mesh.position.z, zoom: 1.3 });
  });
  await page.waitForTimeout(2200);
  await shot('16-drogath-chefe-do-forte.png');
  // forte de Brumar e a Dama Aurora (aliada de IA)
  await look('allyFort', '17-forte-de-brumar-centro-e-torres.png', { zoom: 0.9, wait: 3000 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const au = gm.entitiesById.get(gm.mission.tags.get('aurora')[0]);
    window.game.inputManager.selectUnits([au], { additive: false });
    gm.events.emit('mission_camera', { x: au.mesh.position.x, z: au.mesh.position.z, zoom: 1.4 });
  });
  await page.waitForTimeout(2200);
  await shot('18-dama-aurora.png');
  // recrutas presos e guardas; depois libertados (4/4)
  await look('captive1', '19-recrutas-presos-e-guardas.png', { zoom: 1.1 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('recruit_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(2500);
  await look('captive1', '20-recrutas-libertados-4de4.png', { zoom: 1.1, wait: 1500 });
  // lago congelado e banquisa; ruinas do Posto do Faroleiro; cais congelado
  await look('lake1', '21-lago-congelado.png', { zoom: 0.9, wait: 2400 });
  await look('ruins1', '22-ruinas-do-posto-do-faroleiro-ocultas.png', { zoom: 1.1, wait: 2400 });
  await look('iceDock', '23-cais-congelado-mar-do-norte.png', { zoom: 0.9, wait: 2400 });
  // desembarque do Sal Cinzento no cais (barcaca + escolta)
  await act('dock-landing');
  await page.waitForTimeout(6000);
  await look('iceDock', '24-barcaca-do-sal-cinzento-no-cais.png', { dz: -14, zoom: 0.8, wait: 1800 });
  // comboio de Brumar: 4 carregadores junto ao forte aliado; a emboscada a meio caminho
  await act('convoy-start');
  await page.waitForTimeout(2500);
  await look('convoyStart', '25-comboio-de-brumar-carregadores.png', { zoom: 1.2, wait: 1800 });
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const cv = gm.mission.tags.get('convoy').map((i) => gm.entitiesById.get(i));
    cv.forEach((u, i) => { const x = A.convoyAmbush.x + i, z = A.convoyAmbush.z + 2; u.mesh.position.set(x, u.mesh.position.y, z); gm.unitGrid.update(u, x, z, u.collisionRadius || 0); });
  });
  await page.waitForTimeout(3500);
  await look('convoyAmbush', '26-emboscada-do-sal-cinzento-no-comboio.png', { zoom: 1.0, wait: 1800 });
  // tomar o Farol: limpa a guarda do posto, 3 unidades no cabo, contador de 3 min e lanterna acesa
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('light_guard')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
    gm.getUnitsOf(0).filter((u) => !u.isDead && u.type !== 'villager' && u.type !== 'hero_brann').slice(0, 4).forEach((u, i) => { const x = A.lighthouse.x + i * 1.6, z = A.lighthouse.z + 5; u.mesh.position.set(x, u.mesh.position.y, z); gm.unitGrid.update(u, x, z, u.collisionRadius || 0); });
  });
  await page.waitForTimeout(8000);
  await look('lighthouse', '27-farol-tomado-lanterna-acesa-contador.png', { zoom: 1.0, wait: 2000 });
  // combate: 1a leva dos Lancas rumo ao Farol
  await act('raid-l1');
  await page.waitForTimeout(9000);
  await look('lighthouse', '28-leva-dos-lancas-no-cabo.png', { dx: -10, dz: 8, zoom: 1.0, wait: 1800 });
  // concluir o contador, ativar o forte e vitoria
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.mission.setObjectiveStatus('p-hold', 'completed');
  });
  await page.waitForTimeout(3500);
  await shot('29-farol-mantido-forte-revelado.png');
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getUnitsOf(0).find((u) => !u.isDead);
    for (const id of gm.mission.tags.get('fort_hall')) gm.entitiesById.get(id)?.takeDamage(1e6, k);
  });
  await page.waitForTimeout(5000);
  await shot('30-cutscene-final.png');
  await page.waitForFunction(() => window.game.gameManager.mission.outcome === 'victory', null, { timeout: 90000 });
  await page.waitForTimeout(3500);
  await shot('31-fim-vitoria.png');
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
