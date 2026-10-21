#!/usr/bin/env node
/**
 * M2-13: javali .glb animado no jogo e no inspetor + Cercado de Javalis. Só mede e captura (não altera src/).
 *  G1  mapa com javalis (camp-09-miragem): o .glb é pedido (rede) e os CritterView dos javalis usam o modelo .glb com animador válido.
 *  G2  mapa só com ovelhas (tutorial): o .glb do javali NÃO é pedido; ovelha segue procedural.
 *  G3  estados forçados na sim (idle / walking / fleeing / dead): pernas e cabeça mexem; capturas.
 *  G4  Cercado de Javalis em jogo (pig_farm, orc): draw calls (malhas visíveis) <= 20; captura.
 *  G5  fallback: com ?glb=0 o javali é o procedural (sem animador).
 *  I1  inspetor: critter_boar_glb (?critter=walk|graze|run) e pig_farm_glb.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/m2-13/check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5391;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const errors = [];
const rec = (id, name, ok, detail = '') => { rows.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail }); console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`); };
const shot = (page, name) => page.screenshot({ path: path.join(HERE, name) });

async function openGame(browser, query, glbRequests) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('request', (r) => { if (/critter_boar\.glb/.test(r.url())) glbRequests.push(r.url()); });
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&${query}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(1200);
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  return page;
}

const critterInfo = (page) => page.evaluate(() => {
  const gm = window.game.gameManager;
  return gm.critters.map((c) => {
    const v = gm.entityViews.viewOf(c);
    return { id: c.id, species: c.species, hasView: !!v, glb: !!(v && v.root.userData.glbCritter), animator: !!(v && v.animator && v.animator.valid), state: c.state };
  });
});

async function camTo(page, x, z, zoom) {
  await page.evaluate(([x, z, zoom]) => {
    const sm = window.game.sceneManager;
    const gm = window.game.gameManager;
    sm.cameraTarget.set(x, gm.terrain.getHeight(x, z), z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = Math.PI / 4;
  }, [x, z, zoom]);
  await sleep(1400);
}

let vite = null;
let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });

  // ---- G1/G3/G4: mapa com javalis
  const req1 = [];
  let page = await openGame(browser, 'map=camp-09-miragem', req1);
  await assertHardwareGpu(page);
  let list = await critterInfo(page);
  const boars = list.filter((c) => c.species === 'boar');
  rec('G1', 'camp-09-miragem: .glb pedido pela rede; todo javali usa o .glb com animador válido', req1.length >= 1 && boars.length > 0 && boars.every((b) => b.glb && b.animator),
    `pedidos=${req1.length} javalis=${boars.length} ovelhas=${list.length - boars.length} detalhe=${JSON.stringify(list.slice(0, 4))}`);

  if (boars.length) {
    const target = boars[0];
    const pos = await page.evaluate((id) => { const c = window.game.gameManager.entitiesById.get(id); return { x: c.mesh.position.x, z: c.mesh.position.z }; }, target.id);
    await camTo(page, pos.x, pos.z, 0.25);
    // idle
    const sample = async (state, ms) => page.evaluate(async ({ id, state, ms }) => {
      const gm = window.game.gameManager;
      const c = gm.entitiesById.get(id);
      const v = gm.entityViews.viewOf(c);
      c.mesh.visible = true;
      if (state === 'fleeing') { c.state = 'fleeing'; c.fleeTimer = 30; c._fleeDx = 0; c._fleeDz = 0; }
      else if (state === 'idle') { c.state = 'idle'; c.stepTimer = 99; }
      else if (state === 'walking') { c.state = 'walking'; c.targetX = c.mesh.position.x + 0.01; c.targetZ = c.mesh.position.z + 0.01; }
      const names = ['Leg_FL', 'Leg_FR', 'Leg_BL', 'Leg_BR', 'Head'];
      const range = {};
      names.forEach((n) => { range[n] = [9, -9]; });
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r));
        if (state === 'walking') { c.state = 'walking'; c.targetX = c.mesh.position.x + 5; c.targetZ = c.mesh.position.z; c.mesh.visible = true; }
        names.forEach((n) => { const x = v.root.getObjectByName(n).rotation.x; range[n][0] = Math.min(range[n][0], x); range[n][1] = Math.max(range[n][1], x); });
      }
      return Object.fromEntries(Object.entries(range).map(([k, [a, b]]) => [k, +(b - a).toFixed(2)]));
    }, { id: target.id, state, ms });

    const idle = await sample('idle', 4000);
    await shot(page, 'game-javali-pastando.png');
    const walk = await sample('walking', 1500);
    await shot(page, 'game-javali-andando.png');
    const run = await sample('fleeing', 1500);
    await shot(page, 'game-javali-correndo.png');
    rec('G3', 'estados: pernas mexem andando e correndo (amplitude maior ao correr); cabeça baixa ao pastar',
      walk.Leg_FL > 0.3 && run.Leg_FL > walk.Leg_FL && idle.Leg_FL < 0.05 && idle.Head > 0.5,
      `amplitude (max-min, rad) parado=${JSON.stringify(idle)} andando=${JSON.stringify(walk)} correndo=${JSON.stringify(run)}`);
    await page.evaluate((id) => { const c = window.game.gameManager.entitiesById.get(id); c.state = 'idle'; c.stepTimer = 99; }, target.id);
    // morte
    await page.evaluate((id) => { window.game.gameManager.entitiesById.get(id).takeDamage(99); }, target.id);
    await sleep(500);
    await shot(page, 'game-javali-morto.png');
    const dead = await page.evaluate((id) => { const gm = window.game.gameManager; const c = gm.entitiesById.get(id); const v = gm.entityViews.viewOf(c); return { y: v.root.position.y, ground: gm.terrain.getHeight(c.mesh.position.x, c.mesh.position.z), rotZ: v.root.rotation.z }; }, target.id);
    rec('G3b', 'carcaça: tombada (rot z ~ 90 graus) e acima do chão', Math.abs(dead.rotZ) > 1.2 && dead.y >= dead.ground, JSON.stringify(dead));
  }

  // vista ampla dos critters do mapa
  if (list.length) {
    const p = await page.evaluate(() => { const c = window.game.gameManager.critters.find((k) => k.species === 'boar' && !k.isDead) || window.game.gameManager.critters[0]; return { x: c.mesh.position.x, z: c.mesh.position.z }; });
    await camTo(page, p.x, p.z, 0.6);
    await shot(page, 'game-javalis-campo.png');
  }

  // G4: cercado
  const pen = await page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
    let spot = null;
    for (let r = 10; r <= 32 && !spot; r += 3) {
      for (let a = 0; a < 360 && !spot; a += 30) {
        const x = hx + Math.cos((a * Math.PI) / 180) * r, z = hz + Math.sin((a * Math.PI) / 180) * r;
        if (!gm.pathfinder.isWater(x, z) && gm.canPlaceBuilding('pig_farm', x, z, null, me)) spot = { x, z };
      }
    }
    if (!spot) return { error: 'sem ponto' };
    const b = gm.createBuilding('pig_farm', spot.x, spot.z, true, me);
    gm.buildings.push(b);
    await new Promise((r) => setTimeout(r, 1200));
    const v = gm.entityViews.viewOf(b) || gm.buildingViews?.get?.(b);
    return { spot, hasView: !!v, name: b.name };
  });
  if (!pen.error) {
    await camTo(page, pen.spot.x, pen.spot.z, 0.35);
    await sleep(800);
    const dc = await page.evaluate(() => {
      const sm = window.game.sceneManager;
      const gm = window.game.gameManager;
      const b = gm.buildings.find((x) => x.type === 'pig_farm');
      const v = gm.entityViews.viewOf(b);
      let meshes = 0;
      const mats = new Set();
      v.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid)); } });
      const parts = {};
      const walk = (o, top) => { if (o.isMesh && o.visible) parts[top] = (parts[top] || 0) + 1; o.children.forEach((c) => walk(c, top)); };
      v.root.children.forEach((c) => walk(c, c.name || c.type));
      return { meshes, materials: mats.size, name: b.name, entityName: b.entityName, parts };
    });
    await shot(page, 'game-cercado-javalis.png');
    rec('G4', 'Cercado de Javalis em jogo: malhas visíveis (draw calls) <= 20', dc.meshes <= 20, JSON.stringify(dc));
  } else rec('G4', 'Cercado de Javalis em jogo', false, pen.error);
  await page.context().close();

  // ---- G2: mapa só com ovelhas
  const req2 = [];
  page = await openGame(browser, 'map=tutorial', req2);
  list = await critterInfo(page);
  rec('G2', 'tutorial (só ovelhas): o .glb do javali NÃO é pedido', req2.length === 0 && !list.some((c) => c.species === 'boar'), `pedidos=${req2.length} critters=${JSON.stringify(list)}`);
  await page.context().close();

  // ---- G5: ?glb=0 -> procedural
  const req3 = [];
  page = await openGame(browser, 'map=camp-09-miragem&glb=0', req3);
  list = await critterInfo(page);
  const b5 = list.filter((c) => c.species === 'boar');
  rec('G5', '?glb=0: javali procedural (sem .glb, sem animador)', req3.length === 0 && b5.length > 0 && b5.every((b) => !b.glb && !b.animator), `pedidos=${req3.length} ${JSON.stringify(b5.slice(0, 3))}`);
  await camTo(page, ...(await page.evaluate(() => { const c = window.game.gameManager.critters.find((k) => k.species === 'boar'); return [c.mesh.position.x, c.mesh.position.z, 0.25]; })));
  await shot(page, 'game-javali-procedural-reserva.png');
  await page.context().close();

  // ---- I1: inspetor
  const ip = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  ip.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  ip.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  for (const st of ['walk', 'graze', 'run']) {
    await ip.goto(`http://127.0.0.1:${PORT}/inspector.html?model=critter_boar_glb&critter=${st}&cam=side`, { waitUntil: 'load', timeout: 90000 });
    await ip.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject && window.inspectorApp.critterAnimator && window.inspectorApp.critterAnimator.valid, null, { timeout: 90000 });
    await sleep(2200);
    const info = await ip.evaluate(() => { const a = window.inspectorApp.critterAnimator; return { valid: a.valid, state: a.state, head: +a.head.rotation.x.toFixed(2), legFL: +a.legs.fl.rotation.x.toFixed(2) }; });
    rec(`I1-${st}`, `inspetor critter_boar_glb ?critter=${st}`, info.valid && info.state === st, JSON.stringify(info));
    await shot(ip, `inspetor-javali-${st}.png`);
  }
  await ip.goto(`http://127.0.0.1:${PORT}/inspector.html?model=pig_farm_glb`, { waitUntil: 'load', timeout: 90000 });
  await ip.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
  await sleep(2500);
  const pg = await ip.evaluate(() => { let n = 0; window.inspectorApp.currentModelObject.traverse((o) => { if (o.isMesh) n++; }); return { meshes: n, badge: document.getElementById('current-model-badge').textContent.trim() }; });
  rec('I2', 'inspetor pig_farm_glb: nome Cercado de Javalis, <= 20 malhas', /Cercado de Javalis/.test(pg.badge) && pg.meshes <= 20, JSON.stringify(pg));
  await shot(ip, 'inspetor-cercado-javalis.png');
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', false, String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const real = errors.filter((e) => !/deprec/i.test(e));
rec('C7', 'sem pageerror nem console.error', real.length === 0, real.slice(0, 3).join(' | '));
fs.writeFileSync(path.join(HERE, 'check.json'), JSON.stringify({ generated: new Date().toISOString(), rows, errors }, null, 2) + '\n');
const fails = rows.filter((r) => r.status !== 'PASS').length;
console.log(`RESUMO: ${rows.length - fails}/${rows.length} PASS`);
process.exitCode = fails ? 1 : 0;
