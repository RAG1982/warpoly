// F3-07: captura da HUD de pesquisas (Forja e Serraria). Rodar via tools/safe-run.sh.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const vite = await createServer({ server: { port: 5202, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await assertHardwareGpu(page);
  await page.goto('http://127.0.0.1:5202/?skipPreload&texq=low', { waitUntil: 'load' });
  await page.waitForFunction('!!window.game', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const p = gm.localPlayer; p.resources.gold = 5000; p.resources.wood = 5000; p.resources.stone = 5000;
    const hq = gm.buildings.find(b => b.ownerId === p.id && b.tier);
    for (const [t, dx] of [['forge', 14], ['lumber_camp', -14]]) {
      const b = gm.createBuilding(t, hq.mesh.position.x + dx, hq.mesh.position.z + 14, true, p.id);
      gm.buildings.push(b);
    }
  });
  for (const type of ['forge', 'lumber_camp']) {
    await page.evaluate((t) => {
      const gm = window.game.gameManager;
      const b = gm.buildings.find(x => x.type === t && x.ownerId === gm.localPlayerId);
      gm.selectedBuilding = b; b.isSelected = true;
      gm.issue({ type: 'research', playerId: gm.localPlayerId, buildingId: b.id, upgradeId: t === 'forge' ? 'melee_weapons' : 'ranged_ammo' });
    }, type);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `tools/ui-captures/research/${type}.png` });
    const txt = await page.evaluate(() => (document.getElementById('bld-train-buttons') || {}).innerText || '');
    console.log(type, txt.replace(/\s+/g, ' ').slice(0, 500));
  }
  console.log('errors', errs);
} finally {
  await browser.close();
  await vite.close();
}
