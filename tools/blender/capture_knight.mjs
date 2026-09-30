// Capturas do Espadachim (procedural × Blender) no inspetor e no jogo. GPU real obrigatória.
// Uso (vite em :5197):  timeout 900 npx vite --port 5197 --strictPort &
//   tools/safe-run.sh --timeout 600 -- node tools/blender/capture_knight.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'renders');
const BASE = process.env.BASE_URL || 'http://localhost:5197';
const shots = [
  ['insp_knight_old', 'model=knight&light=day'],
  ['insp_knight_new', 'model=knight_glb&light=day'],
  ['insp_knight_new_side', 'model=knight_glb&light=day&cam=side'],
  ['insp_knight_new_walk', 'model=knight_glb&light=day&anim=walk&time=0.2'],
  ['insp_knight_new_fight', 'model=knight_glb&light=day&anim=fight&time=0.3'],
  ['insp_knight_new_strike', 'model=knight_glb&light=day&anim=fight&time=0.55'],
  ['insp_knight_new_gather_die', 'model=knight_glb&light=day&anim=die&time=1.4']
];
const browser = await chromium.launch({
  args: ['--use-angle=vulkan', '--enable-gpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=2048']
});
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto('about:blank');
  console.log('GPU', await assertHardwareGpu(page));
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  for (const [name, q] of shots) {
    await page.goto(`${BASE}/inspector.html?${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const app = window.inspectorApp;
      if (!app || !app.currentModelObject) return false;
      let m = 0; app.currentModelObject.traverse(o => { if (o.isMesh) m++; });
      return m > 0;
    }, null, { timeout: 120000, polling: 250 });
    await page.waitForTimeout(1200);
    await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(name);
  }
  await page.goto(`${BASE}/?skipPreload&texq=low&play`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.allUnits.length > 0,
    null, { timeout: 240000, polling: 1000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.allUnits.find(u => u.type === 'knight' && u.ownerId === 0);
    return k ? { glb: !!k.mesh.getObjectByName('Sword'), children: k.mesh.children.length } : null;
  });
  console.log('GAME', JSON.stringify(info));
  await page.screenshot({ path: path.join(OUT, 'game_knight.png') });
} finally {
  await browser.close();
}
