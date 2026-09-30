// Capturas do Arqueiro e do Lanceiro-Machado (procedural × Blender) no inspetor e no jogo. GPU real obrigatória.
// Uso (vite em :5217):  timeout 900 npx vite --port 5217 --strictPort &
//   tools/safe-run.sh --timeout 600 -- node tools/blender/capture_ranged.mjs [archer|axethrower|game]
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'renders');
const BASE = process.env.BASE_URL || 'http://localhost:5217';
const which = process.argv[2] || 'all';
const A = 'light=day';
const archer = [
  ['insp_archer_old', `model=archer&${A}`],
  ['insp_archer_new', `model=archer_glb&${A}`],
  ['insp_archer_new_walk', `model=archer_glb&${A}&anim=walk&time=0.2`],
  ['insp_archer_new_raise', `model=archer_glb&${A}&anim=fight&time=0.25`],
  ['insp_archer_new_draw', `model=archer_glb&${A}&anim=fight&time=0.62`],
  ['insp_archer_new_draw_side', `model=archer_glb&${A}&anim=fight&time=0.62&cam=side`],
  ['insp_archer_new_release', `model=archer_glb&${A}&anim=fight&time=0.8`],
  ['insp_archer_new_die', `model=archer_glb&${A}&anim=die&time=1.4`]
];
const axe = [
  ['insp_axe_old', `model=axethrower&${A}`],
  ['insp_axe_new', `model=axethrower_glb&${A}`],
  ['insp_axe_new_walk', `model=axethrower_glb&${A}&anim=walk&time=0.2`],
  ['insp_axe_new_windup', `model=axethrower_glb&${A}&anim=fight&time=0.35`],
  ['insp_axe_new_throw', `model=axethrower_glb&${A}&anim=fight&time=0.55`],
  ['insp_axe_new_follow', `model=axethrower_glb&${A}&anim=fight&time=0.75`],
  ['insp_axe_new_side', `model=axethrower_glb&${A}&anim=fight&time=0.35&cam=side`],
  ['insp_axe_new_die', `model=axethrower_glb&${A}&anim=die&time=1.4`]
];
const shots = which === 'archer' ? archer : which === 'axethrower' ? axe : which === 'game' || which === 'fight' ? [] : [...archer, ...axe];
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
  if (which === 'fight') {
    // Arqueiro (jogador) e Lanceiro-Machado (inimigo) frente a frente: projéteis saindo, no zoom de jogo.
    await page.goto(`${BASE}/?skipPreload&texq=low&play`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.allUnits.length > 0,
      null, { timeout: 240000, polling: 1000 });
    await page.waitForTimeout(2000);
    const setup = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const a = gm.allUnits.find(u => u.type === 'archer');
      const x = gm.allUnits.find(u => u.type === 'axethrower');
      const H = a.terrain && a.terrain.getHeightAt ? (px, pz) => a.terrain.getHeightAt(px, pz) : () => a.mesh.position.y;
      a.mesh.position.set(a.mesh.position.x + 22, H(a.mesh.position.x + 22, a.mesh.position.z + 30), a.mesh.position.z + 30);
      const b = a.mesh.position;
      x.mesh.position.set(b.x + 5.5, H(b.x + 5.5, b.z - 1.0), b.z - 1.0);
      x.mesh.userData.__t = 1;
      for (const u of [a, x]) { u.moveTarget = null; u.path = null; if (u._simPos) u._simPos.copy(u.mesh.position); if (u._prevPos) u._prevPos.copy(u.mesh.position); }
      a.orderAttack(x); x.orderAttack(a);
      const sm = window.game.sceneManager;
      sm.cameraTarget.set(b.x + 2.7, b.y + 1.2, b.z - 0.5);
      sm.targetZoomLevel = 0.32; sm.zoomLevel = 0.32;
      return { a: a.mesh.position.toArray(), x: x.mesh.position.toArray() };
    });
    console.log('SETUP', JSON.stringify(setup));
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `game_fight_${i}.png`) });
    }
  }
  if (which === 'game' || which === 'all') {
    await page.goto(`${BASE}/?skipPreload&texq=low&play`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.allUnits.length > 0,
      null, { timeout: 240000, polling: 1000 });
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const types = {};
      for (const u of gm.allUnits) types[u.type] = (types[u.type] || 0) + 1;
      const a = gm.allUnits.find(u => u.type === 'archer');
      const x = gm.allUnits.find(u => u.type === 'axethrower');
      return { types, archerGlb: a ? !!a.mesh.getObjectByName('BowTipTop') : null, axeGlb: x ? !!x.mesh.getObjectByName('WeaponR') : null };
    });
    console.log('GAME', JSON.stringify(info));
    await page.screenshot({ path: path.join(OUT, 'game_ranged.png') });
  }
} finally {
  await browser.close();
}
