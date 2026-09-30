#!/usr/bin/env node
/**
 * NEW-33 — capturas do Cavaleiro / Estábulo Real / Covil dos Ogros (Blender) no inspetor e no jogo.
 * GPU real obrigatória (assertHardwareGpu). Rode SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 600 -- node tools/blender/capture_cavalry.mjs
 * Sobe o Vite na porta EXCLUSIVA 5220 (encerrado no finally).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'renders');
const PORT = 5220;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const ONLY = process.env.ONLY || '';
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;

async function open(url, ready) {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  await page.goto(base + url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(ready, null, { timeout: 90000 });
  return { page, errors };
}
async function close() { if (browser) await browser.close().catch(() => {}); browser = null; }

try {
  if (!ONLY || ONLY === 'insp') {
    const shots = [
      ['cavalier_glb', 'idle', null, 'insp_cavalier_idle'],
      ['cavalier_glb', 'walk', 0.1, 'insp_cavalier_walk_a'],
      ['cavalier_glb', 'walk', 0.3, 'insp_cavalier_walk_b'],
      ['cavalier_glb', 'fight', 0.35, 'insp_cavalier_fight'],
      ['cavalier_glb', 'die', 1.4, 'insp_cavalier_die'],
      ['stable_glb', 'idle', null, 'insp_stable'],
      ['ogre_den_glb', 'idle', null, 'insp_ogre_den']
    ];
    for (const [model, anim, time, file] of shots) {
      const q = `/inspector.html?model=${model}&light=day&anim=${anim}${time != null ? `&time=${time}` : ''}`;
      const { page, errors } = await open(q, 'window.inspectorApp && window.inspectorApp.currentModelObject');
      await page.waitForTimeout(1800);
      if (time != null) await page.evaluate(t => { const a = window.inspectorApp.animator; if (a) { a.pause(); a.setTime(t); } }, time);
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => {
        let meshes = 0; const mats = new Set();
        window.inspectorApp.currentModelObject.traverse(o => { if (o.isMesh && o.visible) { meshes++; mats.add(o.material.uuid); } });
        return { meshes };
      });
      await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `${file}.png`) });
      console.log(file, JSON.stringify(info), errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
      await close();
    }
  }

  if (!ONLY || ONLY === 'game') {
    for (const faction of ['human', 'orc']) {
      const { page, errors } = await open(`/?skipPreload&texq=low&play&faction=${faction}`, 'window.game');
      await page.waitForFunction(() => window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const res = await page.evaluate(faction => {
        const gm = window.game.gameManager;
        const id = gm.localPlayerId;
        const p = gm.getPlayer(id);
        p.resources.gold = 5000; p.resources.wood = 5000; p.resources.stone = 5000; p.maxPopulation = 100;
        const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
        hq.tier = 2; // equivale ao UPGRADE_HQ concluído
        const at = (dx, dz) => ({ x: hq.mesh.position.x + dx, z: hq.mesh.position.z + dz });
        const mk = (type, dx, dz, done = true) => {
          const c = at(dx, dz); const b = gm.createBuilding(type, c.x, c.z, done, id); gm.buildings.push(b); return b;
        };
        mk(faction === 'orc' ? 'orc_barracks' : 'barracks', -14, 4);
        const stable = mk(faction === 'orc' ? 'ogre_den' : 'stable', 14, 4);
        const wip = mk(faction === 'orc' ? 'ogre_den' : 'stable', 14, -12, false);
        wip.buildProgress = 45; wip.updateConstructionState();
        const unitType = faction === 'orc' ? 'ogre' : 'cavalier';
        gm.issue({ type: 'train', playerId: id, buildingId: stable.id, unitType });
        const c = at(0, 12);
        const us = [0, 3, 6].map(i => gm.spawnUnit(unitType, c.x + i * 2.2, c.z, id));
        us[1].orderMove && us[1].orderMove({ x: c.x + 4.4, y: 0, z: c.z + 14 });
        window.__cap = { stable, wip, us, hq };
        gm.selectedBuilding = stable;
        return { queue: stable.queue.length, unitType, stableType: stable.type };
      }, faction);
      console.log(faction, JSON.stringify(res));
      const sm = await page.evaluate(() => { window.game.gameManager.sceneManager.targetZoomLevel = 0.42; return true; });
      const look = async (key, dx = 0, dz = 0) => {
        await page.evaluate(([k, dx, dz]) => {
          const o = window.__cap[k]; const pos = o.mesh.position;
          window.game.gameManager.sceneManager.cameraTarget.set(pos.x + dx, 2.0, pos.z + dz);
        }, [key, dx, dz]);
        await page.waitForTimeout(1600);
      };
      await look('stable', 0, 4);
      await page.screenshot({ path: path.join(OUT, `game_${faction}_stable.png`) });
      await look('wip', 0, 2);
      await page.screenshot({ path: path.join(OUT, `game_${faction}_obra.png`) });
      await page.evaluate(() => { window.game.gameManager.sceneManager.targetZoomLevel = 0.3; });
      await page.evaluate(() => { const c = window.__cap; window.game.gameManager.sceneManager.cameraTarget.set(c.us[1].mesh.position.x, 1.5, c.us[1].mesh.position.z); });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `game_${faction}_units.png`) });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `game_${faction}_units2.png`) });
      await page.evaluate(() => { window.game.gameManager.sceneManager.targetZoomLevel = 1.0; });
      await look('hq', 6, 6);
      await page.screenshot({ path: path.join(OUT, `game_${faction}_base.png`) });
      console.log(`game_${faction}`, errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
      await close();
    }
  }
} finally {
  await close();
  await vite.close();
}
