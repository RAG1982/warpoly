// F7-02: capturas de cor de time (inspetor com ?team=N e jogo).
// Uso: bash tools/safe-run.sh --mem 8G --timeout 300 -- node tools/capture-teamcolor.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5181;
const OUT = 'tools/ui-captures/teamcolor';
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
try {
  await new Promise((r) => setTimeout(r, 4000));
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-vulkan-surface']
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await assertHardwareGpu(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const base = `http://localhost:${PORT}`;
  for (const [model, team] of [['knight_glb', 0], ['knight_glb', 1], ['knight_glb', 3], ['temple_glb', 0], ['temple_glb', 5], ['ogre_den_glb', 1], ['frigate_glb', 3], ['mage_glb', 4]]) {
    await page.goto(`${base}/inspector.html?model=${model}&team=${team}&texq=low`);
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/inspetor-${model}-t${team}.png` });
  }
  // recolor em tempo real: clica numa amostra
  await page.goto(`${base}/inspector.html?model=knight_glb&texq=low`);
  await page.waitForTimeout(6000);
  await page.click('.team-swatch:nth-child(5)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/inspetor-knight_glb-clique-roxo.png` });
  const cm = await page.evaluate(() => {
    const app = window.inspectorApp;
    let c = null;
    app.currentModelObject.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'TeamColor') c = o.material.color.getHexString(); });
    return c;
  });
  console.log('cor TeamColor apos clique:', cm);
  await page.goto(`${base}/?skipPreload&texq=low`);
  await page.waitForFunction('window.game', null, { timeout: 90000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/jogo-inicial.png` });
  console.log('erros de pagina:', errs.length ? errs.join(' | ') : 'nenhum');
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid); } catch { /* ok */ }
}
