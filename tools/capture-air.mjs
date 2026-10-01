// F4-06: captura as unidades aéreas (inspetor + grifos x arqueiros/cavaleiros no jogo). Rodar via safe-run:
//   bash tools/safe-run.sh --timeout 300 -- node tools/capture-air.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5213);
const OUT = 'tools/ui-captures/air';
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

  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/inspector.html`);
    await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    for (const id of ['glider', 'war_balloon', 'gryphon_rider', 'war_serpent', 'aviary', 'serpent_nest']) {
      await page.evaluate((m) => window.inspectorApp.selectModel(m), id);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/inspector-${id}.png` });
    }
    await page.close();
  }

  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?skipPreload&texq=low&play&debug`);
    await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
      const x0 = hq.mesh.position.x - 6;
      const z0 = hq.mesh.position.z - 26;
      const grif = [0, 1, 2].map((i) => gm.spawnUnit('gryphon_rider', x0 - 8 + i * 2.2, z0 + 14, 0));
      const arch = [0, 1, 2].map((i) => gm.spawnUnit('axethrower', x0 + 2 + i * 1.8, z0, 1));
      const cav = [0, 1].map((i) => gm.spawnUnit('ogre', x0 + 5 + i * 2.2, z0 + 4, 1));
      const ser = gm.spawnUnit('war_balloon', x0 - 2, z0 + 9, 1);
      gm.issue({ type: 'attackMove', playerId: 0, unitIds: grif.map((u) => u.id), x: x0 + 4, z: z0 + 2 });
      gm.sceneManager.cameraTarget.set(x0, 0, z0 + 6);
      window.__t = { grif, arch, cav, ser };
      return { grif: grif.length, arch: arch.length, cav: cav.length, h: grif[0].mesh.position.y };
    });
    console.log('jogo', JSON.stringify(info));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/jogo-1-avanco.png` });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/jogo-2-combate.png` });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/jogo-3-fim.png` });
    const res = await page.evaluate(() => ({
      grif: window.__t.grif.map((u) => Math.round(u.hp)),
      arch: window.__t.arch.map((u) => Math.round(u.hp)),
      cav: window.__t.cav.map((u) => Math.round(u.hp)),
      wings: !!window.__t.grif[0].mesh.userData.wingL && !!window.__t.ser.mesh.userData.rotor,
      ogreAttackedAir: window.__t.cav.some((u) => u.attackTarget && u.attackTarget.layer === 'air')
    }));
    console.log('resultado', JSON.stringify(res));
    await page.close();
  }
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem pageerror');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
