#!/usr/bin/env node
/**
 * F4-01 — capturas da cavalaria (inspetor + jogo humano/orc) e contagem de draw calls do cavaleiro.
 * Rode SOMENTE via: bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/cavalry/capture.mjs
 * Sobe o Vite na porta 5207; uma página por vez; GPU real obrigatória (assertHardwareGpu).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5207;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1',
  '--disable-dev-shm-usage', '--disable-extensions'
];

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
  // --- Inspetor: cavaleiro (idle, walk em 2 tempos) e as duas construções ---
  for (const [model, anim, time, file] of [
    ['cavalier', 'idle', null, 'cavalier_idle'],
    ['cavalier', 'walk', 0.1, 'cavalier_walk_a'],
    ['cavalier', 'walk', 0.3, 'cavalier_walk_b'],
    ['cavalier', 'fight', 0.35, 'cavalier_fight'],
    ['stable', 'idle', null, 'stable'],
    ['ogre_den', 'idle', null, 'ogre_den']
  ]) {
    const q = `/inspector.html?model=${model}&anim=${anim}${time != null ? `&time=${time}` : ''}`;
    const { page, errors } = await open(q, 'window.inspectorApp');
    await page.waitForTimeout(1500);
    if (time != null) await page.evaluate(t => { const a = window.inspectorApp.animator; if (a) { a.pause(); a.setTime(t); } }, time);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${file}.png`) });
    if (model === 'cavalier' && anim === 'idle') {
      const info = await page.evaluate(() => {
        let meshes = 0, skinned = 0;
        window.inspectorApp.currentModelObject.traverse(o => { if (o.isMesh && o.visible) { meshes++; if (o.isSkinnedMesh) skinned++; } });
        return { meshes, skinned };
      });
      console.log('cavalier draw calls (malhas visíveis):', JSON.stringify(info));
    }
    console.log(file, errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
    await close();
  }

  // --- Jogo: humano e orc ---
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
      hq.tier = 2; // atalho do teste: equivale ao UPGRADE_HQ concluído
      const at = (dx, dz) => ({ x: hq.mesh.position.x + dx, z: hq.mesh.position.z + dz });
      const mk = (type, dx, dz) => { const c = at(dx, dz); const b = gm.createBuilding(type, c.x, c.z, true, id); b.isConstructed = true; gm.buildings.push(b); return b; };
      const barracks = mk(faction === 'orc' ? 'orc_barracks' : 'barracks', -14, 4);
      const stable = mk(faction === 'orc' ? 'ogre_den' : 'stable', 14, 4);
      const unitType = faction === 'orc' ? 'ogre' : 'cavalier';
      gm.issue({ type: 'train', playerId: id, buildingId: stable.id, unitType });
      const c = at(0, 12);
      const u = gm.spawnUnit(unitType, c.x, c.z, id);
      const u2 = gm.spawnUnit(unitType, c.x + 3, c.z, id);
      u2.orderMove && u2.orderMove({ x: c.x + 3, y: 0, z: c.z + 14 });
      gm.sceneManager.cameraTarget.set(hq.mesh.position.x, 2.5, hq.mesh.position.z + 8);
      gm.selectedBuilding = stable;
      return { queue: stable.queue.length, unitType, stableType: stable.type, barracksTrains: barracks.type };
    }, faction);
    console.log(faction, JSON.stringify(res));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `game_${faction}.png`) });
    console.log(`game_${faction}`, errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
    await close();
  }
} finally {
  await close();
  await vite.close();
}
