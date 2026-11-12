#!/usr/bin/env node
/**
 * Ferraria Real v2 no jogo (partida humana, uma Ferraria criada ao lado do Centro). Só mede e captura.
 *  C1  a view usa o forge_v2 (nó Forge com Static_Mesh e malha TeamColor).  C2  sem pageerror/console.error.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/forge-v2/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5535;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = []; let bad = false;
function rec(id, name, ok, d = '') { if (!ok) bad = true; console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${d}`); }
let vite = null; let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(1500);
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  const r = await page.evaluate(async () => {
    const gm = window.game.gameManager; const sm = window.game.sceneManager;
    const hq = gm.buildings.find((x) => x.ownerId === gm.localPlayerId && x.role === 'hq');
    const f = gm.createBuilding('forge', hq.mesh.position.x + 11, hq.mesh.position.z + 4, true, gm.localPlayerId);
    sm.cameraTarget.set(f.mesh.position.x, 2, f.mesh.position.z); sm.targetZoomLevel = 0.5; sm.zoomLevel = 0.5;
    gm.buildings.push(f);
    let v = null;
    for (let i = 0; i < 40 && !v; i++) { await new Promise((res) => setTimeout(res, 250)); v = gm.entityViews.viewOf(f); }
    await new Promise((res) => setTimeout(res, 1500));
    let root = null; const mats = new Set();
    v.fullMesh.traverse((c) => { if (c.name === 'Forge') root = c.name; if (c.isMesh) [].concat(c.material).forEach((m) => mats.add(m.name)); });
    return { root, mats: [...mats] };
  });
  rec('C1', 'view usa o forge_v2 (Forge, materiais Atlas/TeamColor)', r.root === 'Forge' && r.mats.includes('TeamColor'), JSON.stringify(r));
  await page.screenshot({ path: path.join(HERE, 'game-forja.png') });
} catch (e) { console.error('ERRO fatal:', e); bad = true; } finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const real = errors.filter((e) => !/deprec/i.test(e));
rec('C2', 'sem pageerror nem console.error', real.length === 0, real.slice(0, 3).join(' | '));
process.exitCode = bad ? 1 : 0;
