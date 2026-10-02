#!/usr/bin/env node
/**
 * F2-08c — capturas antes/depois (jogo + inspetor) para conferir que a separação sim/render não mudou o visual.
 * Uso (sempre via safe-run):
 *   bash tools/safe-run.sh --timeout 600 -- node tools/capture-f208c.mjs --root <worktree> --port 5281 --out <dir>
 * Gera <out>/game-*.png, <out>/inspector-*.png e <out>/stats.json (draw calls/triângulos/objetos por cena).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', process.cwd()));
const PORT = Number(opt('port', 5281));
const OUT = resolve(opt('out', '/tmp/claude-1000/f208c-cap'));
mkdirSync(OUT, { recursive: true });

const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const stats = {};
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);

  // ---------------- jogo ----------------
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&debug&seed=7`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  const setup = await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.aiDirectors.forEach(d => { d.update = () => {}; });
    const p0 = gm.getPlayer(0), p1 = gm.getPlayer(1);
    const a = p0.startPos, b = p1.startPos;
    const u = [];
    const hu = ['villager', 'villager', 'knight', 'archer', 'cavalier', 'ballista', 'mage', 'glider', 'ranger'];
    hu.forEach((t, i) => { try { u.push(gm.spawnUnit(t, a.x + 6 + (i % 5) * 2.2, a.z + 8 + Math.floor(i / 5) * 2.4, 0)); } catch (e) { u.push(null); } });
    const ou = ['grunt', 'axethrower', 'ogre', 'ogre_mage', 'catapult', 'peon', 'peon'];
    ou.forEach((t, i) => { try { u.push(gm.spawnUnit(t, b.x - 6 - (i % 5) * 2.2, b.z - 8 - Math.floor(i / 5) * 2.4, 1)); } catch (e) { u.push(null); } });
    const tree = gm.trees.find(t => !t.isDisposed);
    if (tree && u[0]) u[0].orderGather(tree);
    const wip = gm.createBuilding('barracks', a.x - 14, a.z + 4, false, 0);
    wip.buildProgress = 45;
    const forge = gm.createBuilding('forge', a.x - 14, a.z + 16, true, 0);
    forge.hp = forge.maxHp * 0.3;
    const smith = gm.createBuilding('orc_forge', b.x + 14, b.z - 4, true, 1);
    const mill = gm.createBuilding('orc_lumber_mill', b.x + 14, b.z - 16, true, 1);
    const w1 = gm.createBuilding('wall_human', a.x - 14, a.z - 8, true, 0);
    [wip, forge, smith, mill, w1].forEach(b => gm.buildings.push(b));
    const live = u.filter(Boolean);
    live[2].takeDamage(30, null);
    const sel = live.filter(x => x.ownerId === 0).slice(0, 5);
    sel.forEach(x => x.setSelected(true));
    gm.selectedUnits = sel;
    return { a, b, ids: { wip: wip.id, forge: forge.id, smith: smith.id, mill: mill.id, w1: w1.id }, n: live.length };
  });
  console.log('setup', JSON.stringify(setup));
  stats.entities = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const f = e => `${e.type}@${e.mesh.position.x.toFixed(1)},${e.mesh.position.z.toFixed(1)}#${e.ownerId}`;
    return { buildings: gm.buildings.map(f), units: gm.allUnits.map(f), trees: gm.trees.length, deposits: gm.resourceDeposits.length };
  });
  await page.waitForTimeout(2500);

  const shot = async (name, tx, tz, zoom = 1.0) => {
    await page.evaluate(([x, z, zm]) => {
      const sm = window.game.gameManager.sceneManager;
      sm.cameraTarget.set(x, 2.5, z);
      sm.zoomLevel = sm.targetZoomLevel = zm;
      sm.cameraAngle = sm.targetCameraAngle = Math.PI / 4;
      sm.updateCamera(0);
    }, [tx, tz, zoom]);
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager; const r = gm.sceneManager.renderer;
      let objs = 0; gm.sceneManager.scene.traverse(() => objs++);
      return { calls: r.info.render.calls, tris: r.info.render.triangles, objs, units: gm.allUnits.length, buildings: gm.buildings.length };
    });
    stats['game-' + name] = info;
    await page.screenshot({ path: `${OUT}/game-${name}.png` });
  };
  await shot('humanBase', setup.a.x + 2, setup.a.z + 8, 1.0);
  await shot('humanBaseClose', setup.a.x + 8, setup.a.z + 9, 2.0);
  await shot('humanBldgs', setup.a.x - 12, setup.a.z + 8, 1.2);
  await shot('orcBase', setup.b.x - 4, setup.b.z - 8, 1.0);
  await shot('orcBldgs', setup.b.x + 12, setup.b.z - 10, 1.4);

  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const hum = gm.allUnits.filter(u => u.ownerId === 0 && u.isCombatUnit());
    const orc = gm.allUnits.filter(u => u.ownerId === 1 && u.isCombatUnit());
    hum.forEach((u, i) => { if (orc.length) u.orderAttack(orc[i % orc.length]); });
    orc.forEach((u, i) => { if (hum.length) u.orderAttack(hum[i % hum.length]); });
  });
  await page.waitForTimeout(6000);
  await shot('combat', (setup.a.x + setup.b.x) / 2, (setup.a.z + setup.b.z) / 2, 1.0);

  // ---------------- inspetor ----------------
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.inspectorApp, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const ids = ['knight', 'villager', 'grunt', 'archer', 'great_hall', 'orc_forge', 'pig_farm', 'orc_house', 'orc_watchtower', 'orc_lumber_mill', 'orc_barracks', 'forge'];
  for (const id of ids) {
    const ok = await page.evaluate(async id => {
      try { await window.inspectorApp.selectModel(id); return true; } catch (e) { return String(e); }
    }, id);
    if (ok !== true) { console.log('inspetor', id, ok); continue; }
    await page.waitForTimeout(1800);
    stats['inspector-' + id] = await page.evaluate(() => { const r = window.inspectorApp.renderer; return r ? { calls: r.info.render.calls, tris: r.info.render.triangles } : null; });
    await page.screenshot({ path: `${OUT}/inspector-${id}.png` });
  }
  writeFileSync(`${OUT}/stats.json`, JSON.stringify(stats, null, 1));
  console.log('erros:', JSON.stringify(errors));
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
