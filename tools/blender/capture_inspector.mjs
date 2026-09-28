// Capturas do inspetor (antigo × novo) e do jogo com ?glb=1 via Playwright.
// Uso (com o vite rodando em :5180):
//   /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/blender/capture_inspector.mjs
// Saída: tools/blender/renders/insp_*.png e game_*.png
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'renders');
const BASE = process.env.BASE_URL || 'http://localhost:5180';

const shots = [
  // [arquivo, query do inspetor]
  ['insp_grunt_old', 'model=grunt&light=day'],
  ['insp_grunt_new', 'model=grunt_glb&light=day'],
  ['insp_grunt_old_side', 'model=grunt&light=day&cam=side'],
  ['insp_grunt_new_side', 'model=grunt_glb&light=day&cam=side'],
  ['insp_grunt_old_fight', 'model=grunt&light=day&anim=fight&time=0.3'],
  ['insp_grunt_new_fight', 'model=grunt_glb&light=day&anim=fight&time=0.3'],
  ['insp_grunt_old_strike', 'model=grunt&light=day&anim=fight&time=0.55'],
  ['insp_grunt_new_strike', 'model=grunt_glb&light=day&anim=fight&time=0.55'],
  ['insp_grunt_new_walk', 'model=grunt_glb&light=day&anim=walk&time=0.2'],
  ['insp_grunt_new_die', 'model=grunt_glb&light=day&anim=die&time=1.4'],
  ['insp_castle_old', 'model=castle&light=day'],
  ['insp_castle_new', 'model=castle_glb&light=day'],
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
const only = process.argv.slice(2);

for (const [name, q] of shots) {
  if (only.length && !only.includes(name)) continue;
  await page.goto(`${BASE}/inspector.html?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const app = window.inspectorApp;
    if (!app || !app.currentModelObject) return false;
    let meshes = 0;
    app.currentModelObject.traverse(o => { if (o.isMesh) meshes++; });
    return meshes > 0;
  }, null, { timeout: 120000, polling: 250 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const app = window.inspectorApp;
    let meshes = 0, tris = 0;
    const mats = new Set();
    app.currentModelObject.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m.uuid));
    });
    return { meshes, tris: Math.round(tris), materials: mats.size };
  });
  await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(name, JSON.stringify(info));
}

// Jogo completo: pesado em SwiftShader (texturas procedurais 2048²); só com o argumento 'game'.
if (only.includes('game')) {
  for (const [name, q] of [['game_glb', '?glb=1'], ['game_old', '?']]) {
    await page.goto(`${BASE}/${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0,
      null, { timeout: 240000, polling: 1000 });
    await page.waitForTimeout(4000);
    const calls = await page.evaluate(() => {
      const r = window.game.sceneManager.renderer.info.render;
      const castle = window.game.gameManager.buildings.find(b => b.type === 'castle');
      return { calls: r.calls, triangles: r.triangles,
        castleGlb: !!(castle && castle.mesh && castle.mesh.getObjectByName('Static_Mesh')) };
    });
    // lê o canvas logo após um render (o screenshot da página trava com o jogo
    // rodando em SwiftShader); a HUD em HTML não aparece nesta captura
    const url = await page.evaluate(() => {
      const sm = window.game.sceneManager;
      sm.renderer.render(sm.scene, sm.camera);
      return sm.renderer.domElement.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(name, JSON.stringify(calls));
  }
}
await browser.close();
