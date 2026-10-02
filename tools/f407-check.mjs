#!/usr/bin/env node
/** F4-07a: confere Estaleiro/Plataforma/Petroleiro/Refinaria no jogo (GLB por facção). Rodar via tools/safe-run.sh. */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5214;
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
});
let fail = false;
try {
  for (const faction of ['human', 'orc']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /glbModels/.test(m.text())) errors.push(m.text()); });
    await assertHardwareGpu(page);
    await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=estreito-1v1&faction=${faction}`, { waitUntil: 'load' });
    await page.waitForFunction('!!(window.game && window.game.gameManager && window.game.gameManager.buildings && window.game.gameManager.buildings.length)', null, { timeout: 90000 });
    await page.waitForTimeout(2500);
    const info = await page.evaluate(async () => {
      const gm = window.game.gameManager;
      const me = gm.getPlayer(0);
      const hq = gm.buildings.find(b => b.ownerId === 0 && ['castle', 'great_hall'].includes(b.type));
      hq.tier = 2;
      Object.assign(me.resources, { gold: 5000, wood: 5000, stone: 5000 });
      const side = hq.mesh.position.x < 0 ? -1 : 1;
      const spots = (type) => {
        const out = [];
        for (let x = side * 12; Math.abs(x) <= 56; x += side) for (let z = -44; z <= 44; z++) if (gm.canPlaceBuilding(type, x, z, 0)) out.push({ x, z });
        return out;
      };
      const F = me.factionId;
      const yt = F === 'orc' ? 'ship_dock' : 'shipyard';
      const rt = F === 'orc' ? 'ash_cauldron' : 'refinery';
      const ys = spots(yt)[0];
      const yard = gm.createBuilding(yt, ys.x, ys.z, true, 0); gm.buildings.push(yard);
      const rs = spots(rt).find(s => Math.hypot(s.x - ys.x, s.z - ys.z) > 9);
      const ref = rs ? gm.createBuilding(rt, rs.x, rs.z, true, 0) : null; if (ref) gm.buildings.push(ref);
      const well = gm.resourceDeposits.find(d => d.type === 'oil');
      const plat = gm.createBuilding('oil_platform', well.mesh.position.x, well.mesh.position.z, true, 0); gm.buildings.push(plat);
      const dock = gm.getDockPoint(yard);
      const tanker = gm.spawnUnit('tanker', dock.x, dock.z, 0);
      return { F, yt, rt, ys, rs, well: { x: well.mesh.position.x, z: well.mesh.position.z }, tanker: tanker && tanker.id };
    });
    console.log(faction, JSON.stringify(info));
    await page.waitForTimeout(1500);
    for (const [name, x, z] of [['yard', info.ys.x, info.ys.z], ['platform', info.well.x, info.well.z]]) {
      await page.evaluate(([x, z]) => { const sm = window.game.sceneManager; sm.cameraTarget.set(x, 0, z); if (sm.targetZoomLevel !== undefined) sm.targetZoomLevel = 0.5; }, [x, z]);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `tools/ui-captures/oil/${faction}-${name}.png` });
    }
    if (errors.length) { fail = true; console.error(faction, 'ERROS:', errors.slice(0, 8)); }
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(fail ? 1 : 0);
