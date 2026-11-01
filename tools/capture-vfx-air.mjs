// VFX-AIR: captura o ataque à distância dos aéreos — Serpe de Guerra (bola de fogo) e Cavaleiro Grifo (raio).
// Inspetor (pose de ataque) + jogo em combate (projétil, rastro, impacto). Rodar via safe-run:
//   bash tools/safe-run.sh --timeout 300 -- node tools/capture-vfx-air.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5217);
const OUT = 'tools/ui-captures/VFX-AIR';
mkdirSync(OUT, { recursive: true });
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
    // inspetor: pose de ataque (fight) dos dois aéreos
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/inspector.html`);
    await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    for (const id of ['gryphon_rider_v2_glb', 'war_serpent_v2_glb']) {
      await page.evaluate((m) => window.inspectorApp.selectModel(m), id);
      await page.waitForTimeout(800);
      await page.evaluate(() => window.inspectorApp.setUnitAnimation('fight'));
      for (const [k, q] of [['a', 0.3], ['b', 0.55]]) {
        await page.evaluate((t) => { const an = window.inspectorApp.animator; if (an) { an.isPlaying = false; an.setTime(t, true); } }, q);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${OUT}/inspector-${id}-ataque-${k}.png` });
      }
    }
    await page.close();
  }

  {
    // jogo: um Grifo e uma Serpe atacam um grupo de grunts a alguns metros; captura o voo, o impacto e o rastro
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?skipPreload&texq=low&play&debug`);
    await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0 && (b.type === 'castle' || b.type === 'great_hall'));
      const x0 = hq.mesh.position.x - 6;
      const z0 = hq.mesh.position.z - 26;
      const grif = gm.spawnUnit('gryphon_rider', x0, z0 + 10, 0);
      const ser = gm.spawnUnit('war_serpent', x0 + 3, z0 + 10, 0);
      const foes = [0, 1, 2].map((i) => gm.spawnUnit('grunt', x0 + 9 + i * 1.6, z0 + 10 + (i % 2), 1));
      for (const f of foes) { f.hp = f.maxHp = 100000; f.speed = 0; }
      gm.issue({ type: 'attack', playerId: 0, unitIds: [grif.id], targetId: foes[0].id });
      gm.issue({ type: 'attack', playerId: 0, unitIds: [ser.id], targetId: foes[1].id });
      gm.sceneManager.cameraTarget.set(x0 + 6, 0, z0 + 10);
      gm.sceneManager.targetZoomLevel = 0.35;
      gm.sceneManager.zoomLevel = 0.35;
      window.__t = { grif, ser, foes };
      return { grif: grif.type, ser: ser.type };
    });
    console.log('jogo', JSON.stringify(info));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/jogo-1-voo.png` });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/jogo-2-disparo.png` });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/jogo-3-impacto.png` });
    const res = await page.evaluate(() => ({
      foesHp: window.__t.foes.map((u) => Math.round(u.hp)),
      kinds: window.game.gameManager.arrows.map((a) => a.kind)
    }));
    console.log('resultado', JSON.stringify(res));
    await page.close();
  }
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem pageerror');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
