#!/usr/bin/env node
/**
 * ART-naval-buildings — capturas do Estaleiro e da Plataforma de Petróleo no inspetor (GPU real obrigatória).
 * Rode SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 900 -- node tools/blender/capture_naval_buildings.mjs
 * Sobe o Vite na porta 5342 (PORT_VITE) e o encerra no finally. Imprime os nós `Anim_*` encontrados, gira o guindaste /
 * move a haste e a fumaça para provar que os nós respondem.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'renders');
const PORT = Number(process.env.PORT_VITE || 5342);
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const MODELS = ['shipyard_glb', 'oil_platform_glb'];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;
try {
  for (const model of MODELS) {
    browser = await chromium.launch({ headless: true, args: ARGS });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await assertHardwareGpu(page);
    await page.goto(`${base}/inspector.html?model=${model}&light=day&anim=idle`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction('window.inspectorApp && window.inspectorApp.currentModelObject', null, { timeout: 90000 });
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() => {
      const names = []; let meshes = 0; const mats = new Set(); let tris = 0;
      window.inspectorApp.currentModelObject.traverse(o => {
        if (o.name && /^(Anim_|Static_Mesh|Socket_|Shipyard|OilPlatform)/.test(o.name)) names.push(o.name + (o.isMesh ? `[${Array.isArray(o.material) ? o.material.map(m => m.name) : o.material.name}]` : ''));
        if (o.isMesh && o.visible) { meshes++; mats.add(o.material.uuid); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }
      });
      return { meshes, mats: mats.size, tris: Math.round(tris), names: names.join(', ') };
    });
    await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `insp_${model.replace('_glb', '')}.png`) });
    // anima nós: gira guindastes, sobe a haste, estica a fumaça
    const anim = await page.evaluate(() => {
      const root = window.inspectorApp.currentModelObject; const res = {};
      root.traverse(o => {
        if (/^Anim_Crane/.test(o.name)) { o.rotation.y += 0.35; res[o.name] = o.rotation.y; }
        if (o.name === 'Anim_Drill') { o.position.y += 0.4; res[o.name] = o.position.y; }
        if (o.name === 'Anim_Smoke') { o.scale.setScalar(1.15); res[o.name] = o.scale.x; }
      });
      return res;
    });
    await page.waitForTimeout(600);
    await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `insp_${model.replace('_glb', '')}_anim.png`) });
    console.log(model, JSON.stringify(info), JSON.stringify(anim), errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
    await browser.close(); browser = null;
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
