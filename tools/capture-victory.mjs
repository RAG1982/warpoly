// F3-09: captura o modal de fim de jogo nos dois modos. Rodar via safe-run:
//   bash tools/safe-run.sh --timeout 240 -- node tools/capture-victory.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5205;
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
  });
  for (const mode of ['regicide', 'conquest']) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&victory=${mode}`);
    await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    const info = await page.evaluate((m) => {
      const gm = window.game.gameManager;
      const enemy = gm.buildings.filter((b) => b.ownerId === 1);
      const targets = m === 'regicide' ? enemy.slice(0, 1) : enemy;
      targets.forEach((b) => b.takeDamage(1e6, { ownerId: 0 }));
      return { mode: gm.matchConfig.victoryMode, enemyBuildings: enemy.length };
    }, mode);
    await page.waitForFunction('window.game.gameManager.isGameOver', null, { timeout: 20000 });
    await page.waitForTimeout(800);
    console.log(mode, JSON.stringify(info), (await page.innerText('#game-over-msg')).replace(/\n/g, ' | '));
    await page.screenshot({ path: `tools/ui-captures/victory/${mode}.png` });
    await page.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
