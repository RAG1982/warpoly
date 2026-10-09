// F7-05: capturas dos VFX (destruição, morte/sangue/corpos, magia, obra) em `?texq=low` e `?texq=high`. Rodar via safe-run:
//   bash tools/safe-run.sh --timeout 400 -- node tools/capture-vfx.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5214);
const OUT = 'tools/ui-captures/vfx';
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
  for (const q of ['low', 'high']) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(`${q}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${q} console: ${m.text()}`); });
    await page.goto(`${base}/?skipPreload&texq=${q}&play`);
    await page.waitForFunction('window.game && window.game.gameManager && window.game.vfx', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0);
      const cx = hq.mesh.position.x + 14, cz = hq.mesh.position.z + 14;
      gm.sceneManager.cameraTarget.set(cx, 0, cz);
      window.__c = { cx, cz, cy: hq.mesh.position.y };
      return { level: window.game.vfx.level, caps: window.game.vfx.layer.caps };
    });
    console.log(q, JSON.stringify(info));
    await page.waitForTimeout(2500); // a câmera desliza até o alvo
    const shot = async (name) => { await page.screenshot({ path: `${OUT}/${q}-${name}.png` }); };

    // --- magia (4 tipos) ---
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const { cx, cz, cy } = window.__c;
      const ids = ['fireball', 'heal', 'blizzard', 'slow'];
      ids.forEach((id, i) => gm.events.emit('ability_effect', { abilityId: id, ownerId: 0, pos: { x: cx - 4.5 + i * 3, y: cy, z: cz }, radius: 2.5 }));
    });
    await page.waitForTimeout(350);
    await shot('1-magia');

    // --- obra por estágio ---
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const { cx, cz } = window.__c;
      const b = gm.createBuilding('barracks', cx + 8, cz - 6, false, 0);
      gm.buildings.push(b);
      window.__site = b;
      gm.events.emit('building_placed', { buildingId: b.id, ownerId: 0, pos: { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z }, buildingType: 'barracks' });
      gm.sceneManager.cameraTarget.set(cx + 8, 0, cz - 6);
    });
    await page.waitForTimeout(2500);
    for (const p of [30, 55, 80]) {
      await page.evaluate((v) => { window.__site.buildProgress = v; }, p);
      await page.waitForTimeout(700);
    }
    await shot('2-obra-estagio3');

    // --- destruição da construção ---
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const b = window.__site;
      b.isConstructed = true; b.buildProgress = 100;
      b.die();
    });
    await page.waitForTimeout(500);
    await shot('3-destruicao-0.5s');
    await page.waitForTimeout(1800);
    await shot('4-destruicao-2.3s');

    // --- combate: sangue + corpos ---
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const { cx, cz } = window.__c;
      gm.sceneManager.cameraTarget.set(cx, 0, cz);
      const mine = [], theirs = [];
      const hu = gm.playerFaction === 'orc' ? ['grunt', 'axethrower'] : ['knight', 'archer'];
      const en = gm.playerFaction === 'orc' ? ['knight', 'archer'] : ['grunt', 'axethrower'];
      for (let i = 0; i < 8; i++) {
        mine.push(gm.spawnUnit(hu[i % 2], cx - 2, cz - 6 + i * 1.6, 0).id);
        theirs.push(gm.spawnUnit(en[i % 2], cx + 2, cz - 6 + i * 1.6, 1).id);
      }
      window.__mine = mine; window.__theirs = theirs;
      gm.issue({ type: 'attackMove', playerId: 0, unitIds: mine, x: cx + 3, z: cz });
      gm.issue({ type: 'attackMove', playerId: 1, unitIds: theirs, x: cx - 3, z: cz });
    });
    await page.waitForTimeout(4500);
    await shot('5-combate-sangue');
    await page.waitForTimeout(5000);
    await shot('6-corpos');
    const stats = await page.evaluate(() => window.game.vfx.stats());
    console.log(q, 'stats', JSON.stringify(stats));
    await page.close();
  }
  // --- inspetor: efeito de teste (botão "Efeito VFX") ---
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push(`inspetor: ${e.message}`));
    await page.goto(`${base}/inspector.html`);
    await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    await page.evaluate(() => window.inspectorApp.testVfx('building_collapse'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/inspetor-destruicao.png` });
    await page.evaluate(() => window.inspectorApp.testVfx('magic'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/inspetor-magia.png` });
    await page.close();
  }
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
