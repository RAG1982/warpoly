// Capturas do Ogro e do Bandido (Blender) no inspetor e no jogo. GPU real obrigatória.
// Uso (vite em porta EXCLUSIVA 5218):  timeout 900 npx vite --port 5218 --strictPort &
//   tools/safe-run.sh --timeout 600 -- node tools/blender/capture_ogre_bandit.mjs
// Variáveis: ONLY=<trecho do nome> (só algumas capturas), SKIP_GAME=1.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'renders');
const BASE = process.env.BASE_URL || 'http://localhost:5218';
const shots = [];
for (const m of ['ogre', 'bandit']) {
  shots.push([`insp_${m}_old`, `model=${m}&light=day`]);
  shots.push([`insp_${m}_idle`, `model=${m}_glb&light=day`]);
  shots.push([`insp_${m}_side`, `model=${m}_glb&light=day&cam=side`]);
  shots.push([`insp_${m}_walk`, `model=${m}_glb&light=day&anim=walk&time=0.2`]);
  shots.push([`insp_${m}_fight1`, `model=${m}_glb&light=day&anim=fight&time=0.3`]);
  shots.push([`insp_${m}_fight2`, `model=${m}_glb&light=day&anim=fight&time=0.55`]);
  shots.push([`insp_${m}_hurt`, `model=${m}_glb&light=day&anim=hurt&time=0.15`]);
  shots.push([`insp_${m}_die`, `model=${m}_glb&light=day&anim=die&time=1.4`]);
}
const only = process.env.ONLY;
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
    if (only && !name.includes(only)) continue;
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
  if (!process.env.SKIP_GAME) {
    await page.goto(`${BASE}/?skipPreload&texq=low&play`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.allUnits.length > 0,
      null, { timeout: 240000, polling: 1000 });
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const c = gm.sceneManager.cameraTarget.clone();
      const list = [['ogre', 'player'], ['grunt', 'player'], ['knight', 'player'], ['bandit', 'player'], ['ogre', 'player']];
      const out = [];
      gm.sceneManager.cameraTarget.set(c.x - 3, 2.5, c.z + 16);
      gm.sceneManager.targetZoomLevel = 0.42;
      list.forEach(([t, o], i) => {
        const u = gm.spawnUnit(t, c.x - 11 + i * 5.5, c.z + 16, o);
        out.push({ t, glb: !!(u.mesh.getObjectByName('Weapon') || u.mesh.getObjectByName('Sword')), kids: u.mesh.children.length });
      });
      return out;
    });
    console.log('GAME', JSON.stringify(info));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'game_ogre_bandit.png') });
  }
} finally {
  await browser.close();
}
