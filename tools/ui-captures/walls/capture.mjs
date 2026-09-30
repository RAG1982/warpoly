// F3-08: captura de muralhas (arrasto, obra, unidade inimiga na parede) + draw calls com 40 segmentos.
// Rodar via: bash tools/safe-run.sh --timeout 240 -- node tools/ui-captures/walls/capture.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = 'tools/ui-captures/walls';
const vite = await createServer({ server: { port: 5203, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await assertHardwareGpu(page);
  await page.goto('http://127.0.0.1:5203/?skipPreload&texq=low' + (process.env.FACTION === 'orc' ? '&faction=orc' : ''), { waitUntil: 'load' });
  await page.waitForFunction('!!window.game', null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  const screen = (x, z) => page.evaluate(([x, z]) => {
    const g = window.game, gm = g.gameManager, cam = g.sceneManager.camera;
    const v = cam.position.clone(); v.set(x, gm.terrain.getHeight(x, z), z); v.project(cam);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }, [x, z]);

  const info = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const p = gm.localPlayer; p.resources.gold = 5000; p.resources.wood = 5000; p.resources.stone = 5000;
    const hq = gm.buildings.find(b => b.ownerId === p.id && b.role === 'hq');
    const worker = gm.getUnitsOf(p.id).find(u => u.type === 'villager' || u.type === 'peon');
    gm.selectSingle(worker);
    const sm = window.game.sceneManager;
    // Procura uma linha de 8 segmentos livre a partir do HQ.
    const wt = worker.type === 'villager' ? 'wall_human' : 'wall_orc';
    let found = null;
    for (let dz = -34; dz <= 34 && !found; dz += 2) for (let dx = -34; dx <= 30 && !found; dx += 2) {
      const pts = Array.from({ length: 8 }, (_, i) => ({ x: hq.mesh.position.x + dx + i * 2.4, z: hq.mesh.position.z + dz }));
      if (pts.every(q => gm.canPlaceBuilding(wt, q.x, q.z, null, p.id))) found = pts;
    }
    if (found) sm.cameraTarget.set(found[3].x, 2.5, found[3].z);
    return { wt, found, hq: { x: hq.mesh.position.x, z: hq.mesh.position.z } };
  });
  console.log('linha', JSON.stringify(info.found && [info.found[0], info.found[7]]));
  await page.waitForTimeout(1000);
  const calls0 = await page.evaluate(() => window.game.sceneManager.renderer.info.render.calls);

  // Arrasto real: clica no botão de construir da HUD e arrasta A→B.
  await page.click(`[data-build="${info.wt}"]`);
  const A = await screen(info.found[0].x, info.found[0].z);
  const B = await screen(info.found[7].x + 0.5, info.found[7].z);
  await page.mouse.move(A.x, A.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.move((A.x + B.x) / 2, (A.y + B.y) / 2, { steps: 6 });
  await page.mouse.move(B.x, B.y, { steps: 6 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${process.env.FACTION === 'orc' ? 'orc-' : ''}01-arrasto.png` });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const placed = await page.evaluate(() => window.game.gameManager.buildings.filter(b => b.role === 'wall').length);
  console.log('segmentos criados pelo arrasto', placed);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/${process.env.FACTION === 'orc' ? 'orc-' : ''}02-obra.png` });

  // 40 segmentos: draw calls antes/depois (e só dos muros: alterna a visibilidade dos InstancedMesh).
  const calls1 = await page.evaluate(() => window.game.sceneManager.renderer.info.render.calls);
  await page.evaluate(([f, wt]) => {
    const gm = window.game.gameManager, p = gm.localPlayer;
    let n = 0;
    for (let r = 1; n < 32 && r < 40; r++) {
      const pts = Array.from({ length: 8 }, (_, i) => ({ x: f[0].x + i * 2.4, z: f[0].z + (r % 2 ? 1 : -1) * Math.ceil(r / 2) * 3.4 }));
      n += gm.placeWall(wt, pts, [], p.id).length;
    }
    window.__walls = gm.buildings.filter(b => b.role === 'wall').length;
    gm.buildings.filter(b => b.role === 'wall').forEach(w => w.construct(100, gm));
  }, [info.found, info.wt]);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const r = window.game.sceneManager.renderer;
    const gm = window.game.gameManager;
    const calls = r.info.render.calls;
    const batches = Object.values(gm._wallBatches || {});
    batches.forEach(b => { b.mesh.visible = false; });
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const callsHidden = r.info.render.calls;
      batches.forEach(b => { b.mesh.visible = true; });
      res({ calls, callsHidden, walls: window.__walls, batches: batches.length });
    })));
  });
  console.log('draw calls sem muralhas (linha de base)', calls0, '| com 8 em obra', calls1, '| com', after.walls, 'segmentos', after.calls,
    '| instanced ocultos', after.callsHidden, '| batches', after.batches);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${process.env.FACTION === 'orc' ? 'orc-' : ''}03-40-segmentos.png` });

  // Card da muralha selecionada.
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const w = gm.buildings.find(b => b.role === 'wall');
    gm.selectSingle(w);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${process.env.FACTION === 'orc' ? 'orc-' : ''}04-card.png` });
  console.log('errors', errs);
} finally {
  await browser.close();
  await vite.close();
}
