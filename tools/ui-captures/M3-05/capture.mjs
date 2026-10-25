#!/usr/bin/env node
/**
 * M3-05 — capturas NO JOGO da missão 4 "O Baixio do Breu" (war-alliance, mapa camp-04-baixio-do-breu).
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M3-05/capture.mjs
 * Vite na porta 5335. Saída: esta pasta (PNG + resultado.json). A sim avança em blocos (`ff`) dentro da página; ordens por `gm.issue` (comandos reais).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5335);
const ID = 'war-alliance-04-baixio-do-breu';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const result = { shots: [], errors: [], notes: [] };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  result.gpu = await assertHardwareGpu(page);
  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n) }); result.shots.push(n); };
  const dismiss = async () => { const b = await page.$('button:has-text("Fechar")'); if (b) await b.click().catch(() => {}); }; // fecha o painel "Novo nesta missão" (Esc sem painel abriria o menu de pausa)
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
  // cutscene de abertura: um quadro por passo (0, 9, 17, 25, 33, 41 s)
  await page.waitForTimeout(3500); await shot('02-cutscene-1-base-brann.png');
  await page.waitForTimeout(8000); await shot('03-cutscene-2-costa-estaleiro.png');
  await page.waitForTimeout(8000); await shot('04-cutscene-3-pocos-do-meio.png');
  await page.waitForTimeout(8000); await shot('05-cutscene-4-ilhotas.png');
  await page.waitForTimeout(8000); await shot('06-cutscene-5-costa-orc-doca.png');
  await page.waitForTimeout(8000); await shot('07-cutscene-6-posto-do-cabo.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3500); // aos 45 s o Paço sobe ao nível 3: aviso "Centro evoluído" (o painel "Novo nesta missão" fecha com Esc)
  await shot('07b-aviso-centro-evoluido.png');
  await dismiss();
  await page.waitForTimeout(800);
  await shot('08-inicio-objetivos.png');

  const look = async (anchor, name, { dx = 0, dz = 0, zoom = 1.0, wait = 2200, reveal = 48 } = {}) => {
    await page.evaluate(({ anchor, dx, dz, zoom, reveal }) => {
      const gm = window.game.gameManager;
      const a = gm.terrain.mapDef.anchors[anchor];
      if (reveal) gm.fogOfWar?.revealArea(a.x + dx, a.z + dz, reveal, 90);
      gm.events.emit('mission_camera', { x: a.x + dx, z: a.z + dz, zoom });
    }, { anchor, dx, dz, zoom, reveal });
    await dismiss();
    await page.waitForTimeout(wait);
    if (name) await shot(name);
  };
  const ff = (seconds) => page.evaluate((s) => { const gm = window.game.gameManager; for (let i = 0; i < Math.round(s * 20); i++) gm.simStep(1 / 20); }, seconds);
  // mapa: os dois biomas e o mar entre eles
  await page.evaluate(() => { const gm = window.game.gameManager; gm.fogOfWar?.revealArea(0, 0, 400, 600); });
  await look('wellMid1', '09-mapa-dois-continentes-mar-e-ilhotas.png', { zoom: 3.4, wait: 3000, reveal: 0 });
  await look('playerStart', '10-bioma-liga-grama.png', { dx: 18, zoom: 1.5, wait: 2500, reveal: 0 });
  await look('enemyStart', '11-bioma-cla-deserto-basalto.png', { dx: -14, zoom: 1.5, wait: 2500, reveal: 0 });
  await look('wellMid1', '12-pocos-do-meio-e-patrulha.png', { dx: 14, zoom: 1.1, wait: 2500, reveal: 0 });
  await look('islet1', '13-ilhota-norte-madeira-e-torres.png', { zoom: 1.0, wait: 2200, reveal: 0 });
  // Estaleiro e Refinaria (pontos livres perto das âncoras), Petroleiro, Plataforma, coleta
  const setup = await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors, P = gm.getPlayer(0);
    Object.assign(P.resources, { gold: 4000, wood: 2500, stone: 800, oil: 400 });
    gm.getUnitsOf(0).forEach(() => {});
    const spot = (t, k) => { for (let r = 0; r < 13; r += 1.5) for (let q = 0; q < 12; q++) { const x = A[k].x + Math.cos(q) * r, z = A[k].z + Math.sin(q) * r; if (gm.canPlaceBuilding(t, x, z, null, 0)) return { x, z }; } return null; };
    const sy = spot('shipyard', 'shipyard1'); runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'shipyard', ...sy, tag: 'yard' });
    const rf = spot('refinery', 'refinery1'); runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'refinery', ...rf, tag: 'refinery' });
    return { sy, rf };
  });
  result.notes.push('Estaleiro/Refinaria: ' + JSON.stringify(setup));
  await look('shipyard1', '14-estaleiro-e-refinaria.png', { zoom: 0.9, wait: 2500 });
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const yard = gm.buildings.find((b) => b.type === 'shipyard' && b.ownerId === 0);
    gm.issue({ playerId: 0, type: 'train', buildingId: yard.id, unitType: 'tanker' });
    gm.issue({ playerId: 0, type: 'train', buildingId: yard.id, unitType: 'tanker' });
    gm.issue({ playerId: 0, type: 'train', buildingId: yard.id, unitType: 'frigate' });
  });
  await ff(45);
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const ts = gm.getUnitsOf(0).filter((u) => u.type === 'tanker');
    const wells = ['well1', 'well2'].map((n) => gm.resourceDeposits.find((r) => r.type === 'oil' && Math.hypot(r.mesh.position.x - A[n].x, r.mesh.position.z - A[n].z) < 2));
    ts.forEach((t, i) => gm.issue({ playerId: 0, type: 'placeBuilding', buildingType: 'oil_platform', x: wells[i % 2].mesh.position.x, z: wells[i % 2].mesh.position.z, unitIds: [t.id] }));
  });
  await ff(35);
  await look('well1', '15-plataformas-sendo-erguidas.png', { dx: 14, zoom: 0.9, wait: 1500 });
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    const ts = gm.getUnitsOf(0).filter((u) => u.type === 'tanker');
    ts.forEach((t, i) => { const w = gm.resourceDeposits.find((r) => r.type === 'oil' && Math.hypot(r.mesh.position.x - A[['well1', 'well2'][i % 2]].x, r.mesh.position.z - A[['well1', 'well2'][i % 2]].z) < 2); gm.issue({ playerId: 0, type: 'gather', unitIds: [t.id], targetId: w.id }); });
  });
  await ff(30);
  const oil = await page.evaluate(() => window.game.gameManager.getPlayer(0).resources.oil);
  result.notes.push('petróleo após 30 s de coleta: ' + oil);
  await look('well2', '16-petroleiro-entregando-na-refinaria.png', { dx: -12, dz: -6, zoom: 0.8, wait: 1800 });
  // Barcaça transportando tropas: 6 Espadachins na praia da Liga -> ilhota 2
  const bargeInfo = await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors, pf = gm.pathfinder, npf = gm.navalPathfinder;
    // praia = ponto de terra do continente oeste perto de `beach1` com água navegável a ≤ 2,5 u
    let best = null, bd = 1e9;
    for (let i = 0; i < pf.numCells; i++) { const w = pf.toWorld(i % pf.cols, (i / pf.cols) | 0); if (!pf.isWalkableWorld(w.x, w.z) || !npf.nearNavigable(w.x, w.z, 2.5)) continue; const d = Math.hypot(w.x - A.beach1.x, w.z - A.beach1.z); if (d < bd) { bd = d; best = w; } }
    const men = []; for (let i = 0; i < 6; i++) men.push(gm.spawnUnit('knight', best.x - 1.2 - i * 0.6, best.z + 0.5 * i, 0));
    const barge = gm.spawnUnit('barge', A.shipyard1Water.x - 4, A.shipyard1Water.z + 6, 0);
    gm.issue({ playerId: 0, type: 'move', unitIds: [barge.id], x: best.x + 2, z: best.z });
    window.__t = { shore: best, barge, men };
    return { shore: best };
  });
  result.notes.push('praia de embarque: ' + JSON.stringify(bargeInfo));
  await ff(30);
  await page.evaluate(() => { const { barge, men, shore } = window.__t; window.game.gameManager.issue({ playerId: 0, type: 'load', unitIds: men.map((m) => m.id), targetId: barge.id }); });
  await ff(6);
  await page.evaluate(() => { const { barge } = window.__t; window.game.inputManager.selectUnits([barge], { additive: false }); const p = barge.mesh.position; window.game.gameManager.events.emit('mission_camera', { x: p.x, z: p.z, zoom: 1.0 }); });
  await page.waitForTimeout(1800); await shot('17-barcaca-embarcou-6-tropas.png');
  const cargo = await page.evaluate(() => window.__t.barge.cargo.length);
  result.notes.push('carga da Barcaça: ' + cargo);
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors, pf = gm.pathfinder, npf = gm.navalPathfinder, { barge } = window.__t;
    let best = null, bd = 1e9;
    for (let i = 0; i < pf.numCells; i++) { const w = pf.toWorld(i % pf.cols, (i / pf.cols) | 0); if (!pf.isWalkableWorld(w.x, w.z) || !npf.nearNavigable(w.x, w.z, 2.5)) continue; const d = Math.hypot(w.x - A.islet2.x, w.z - A.islet2.z) + 0.4 * Math.hypot(w.x - A.captive1.x, w.z - A.captive1.z); if (Math.hypot(w.x - A.islet2.x, w.z - A.islet2.z) > 25) continue; if (d < bd) { bd = d; best = w; } }
    gm.issue({ playerId: 0, type: 'unload', unitId: barge.id, x: best.x, z: best.z });
    window.__t.landing = best;
  });
  await ff(20);
  await page.evaluate(() => { const p = window.__t.barge.mesh.position; window.game.gameManager.events.emit('mission_camera', { x: p.x, z: p.z, zoom: 1.0 }); });
  await page.waitForTimeout(1800); await shot('18-barcaca-no-meio-do-canal.png');
  await ff(40);
  await look('islet2', '19-desembarque-na-ilhota-sul-bandidos.png', { zoom: 1.0, wait: 2000 });
  const onIslet = await page.evaluate(() => { const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors; return window.__t.men.filter((m) => Math.hypot(m.mesh.position.x - A.islet2.x, m.mesh.position.z - A.islet2.z) < 20).length; });
  result.notes.push('Espadachins na ilhota: ' + onIslet + '/6');
  // resgate: tropa derrota os bandidos
  await page.evaluate(() => { const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors; gm.issue({ playerId: 0, type: 'attackMove', unitIds: window.__t.men.map((m) => m.id), x: A.isletTower2b.x, z: A.isletTower2b.z }); });
  await ff(25);
  await look('islet2', '20-naufragos-resgatados.png', { zoom: 1.0, wait: 1500 });
  result.notes.push('resgate: ' + await page.evaluate(() => JSON.stringify([...window.game.gameManager.mission.objectives.values()].filter((o) => o.id === 's-rescue' || o.id === 'h-ruins').map((o) => [o.id, o.status, o.cur]))));
  // batalha naval: 5 Fragatas da Liga x 4 Galés orcas perto dos poços do lado da Liga
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    runAction(gm.mission, { type: 'spawn', owner: 'player', unitType: 'frigate', count: 5, x: A.well2.x - 4, z: A.well2.z + 4, spread: 3.5, tag: 'myfleet', order: { kind: 'attackMove', x: A.wellMid1.x, z: A.wellMid1.z } });
    runAction(gm.mission, { type: 'spawn', owner: 'enemy', units: [{ type: 'war_galley', count: 4 }, { type: 'iron_leviathan', count: 1 }], x: A.wellMid1.x + 16, z: A.wellMid1.z, spread: 4, tag: 'orc_fleet', order: { kind: 'attackMove', x: A.well2.x, z: A.well2.z } });
  });
  await look('wellMid1', null, { dx: -10, zoom: 0.8, wait: 100, reveal: 40 });
  await ff(6); await page.waitForTimeout(1200); await shot('21-batalha-naval-1.png');
  await ff(5); await page.waitForTimeout(1200); await shot('22-batalha-naval-2.png');
  await ff(20); await page.waitForTimeout(1200); await shot('23-batalha-naval-fim.png');
  const left = await page.evaluate(() => ({ mine: window.__t && window.game.gameManager.getUnitsOf(0).filter((u) => u.type === 'frigate' && !u.isDead).length, orc: window.game.gameManager.allUnits.filter((u) => u.ownerId === 1 && u.layer === 'naval' && !u.isDead).length }));
  result.notes.push('após a batalha: ' + JSON.stringify(left));
  // Centro extra no Cabo e ruínas
  await page.evaluate(async () => {
    const { runAction } = await import('/src/sim/missions/actions.js');
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'castle', x: A.outpost1.x, z: A.outpost1.z });
  });
  await look('outpost1', '24-posto-do-cabo-centro-extra-e-mina.png', { dz: -6, zoom: 1.0, wait: 2200 });
  await look('ruins1', '25-ruinas-do-farol-velho.png', { zoom: 1.0, wait: 2200 });
  await look('shipyard2', '26-doca-do-cla.png', { zoom: 1.0, wait: 2200 });
  await page.evaluate(() => { const gm = window.game.gameManager; for (const i of ['p-yard', 'p-platforms', 'p-oil', 'p-patrol', 'p-fleet']) gm.mission.setObjectiveStatus(i, 'completed'); });
  await page.waitForTimeout(3000);
  await shot('27-cutscene-final.png');
  await page.waitForFunction(() => window.game.gameManager.mission.outcome === 'victory', null, { timeout: 60000 });
  await page.waitForTimeout(3500);
  await shot('28-fim-vitoria.png');
  console.log(result.errors.length ? 'ERROS: ' + result.errors.join(' | ') : 'sem erros de console');
  console.log(result.notes.join('\n'));
} catch (e) {
  console.log('FALHOU:', e.message.split('\n')[0]);
  result.failed = e.message.split('\n')[0];
  process.exitCode = 1;
} finally {
  writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2));
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
