// F4-05: captura os Sapadores (inspetor + 3 sapadores x linha de muralha no jogo). Rodar via safe-run:
//   bash tools/safe-run.sh --timeout 240 -- node tools/capture-sappers.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5212);
const OUT = 'tools/ui-captures/sappers';
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
  });
  const base = `http://127.0.0.1:${PORT}`;
  const errors = [];

  // --- inspetor ---
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/inspector.html`);
    await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    for (const id of ['sapper', 'arsonist']) {
      await page.evaluate((m) => window.inspectorApp.selectModel(m), id);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/inspector-${id}.png` });
    }
    await page.close();
  }

  // --- jogo: 3 sapadores x linha de 6 muralhas ---
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?skipPreload&texq=low&play`);
    await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
      const x0 = hq.mesh.position.x - 6;
      const z0 = hq.mesh.position.z - 26;
      const walls = [];
      for (let i = 0; i < 6; i++) {
        const w = gm.createBuilding('wall_orc', x0 + i * 2.4, z0, true, 1);
        w.isConstructed = true;
        gm.buildings.push(w);
        walls.push(w);
      }
      const ids = [];
      [1, 4, 3].forEach((wi, i) => {
        const s = gm.spawnUnit('sapper', x0 + wi * 2.4 + (i - 1) * 0.6, z0 + 10 + i * 1.5, 0);
        ids.push(s.id);
        gm.issue({ type: 'attack', playerId: 0, unitIds: [s.id], targetId: walls[wi].id });
      });
      gm.sceneManager.cameraTarget.set(x0 + 6, 0, z0 + 4);
      window.__walls = walls;
      return { walls: walls.length, sappers: ids.length };
    });
    console.log('jogo', JSON.stringify(info));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/jogo-1-avanco.png` });
    await page.waitForFunction('window.__walls.some(w => w.isDead)', null, { timeout: 30000 });
    await page.screenshot({ path: `${OUT}/jogo-2-explosao.png` });
    await page.waitForTimeout(1500);
    const dead = await page.evaluate(() => window.__walls.filter((w) => w.isDead).length);
    console.log('muralhas destruidas', dead);
    await page.screenshot({ path: `${OUT}/jogo-3-brecha.png` });
    await page.close();
  }
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem pageerror');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
