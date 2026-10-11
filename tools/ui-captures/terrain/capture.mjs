#!/usr/bin/env node
/**
 * Capturas de terreno e tilesets (F7-04): página de prévia (4 tilesets + comparação) e jogo real com `?tileset=`.
 *
 * NÃO rode direto: use
 *   bash tools/safe-run.sh --timeout 400 -- node tools/ui-captures/terrain/capture.mjs
 * Sobe o próprio Vite (porta 5197), abre UM browser por vez e fecha tudo em `finally`. GPU real obrigatória.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = process.env.TERRAIN_OUT ? resolve(process.env.TERRAIN_OUT) : resolve(ROOT, 'tools/ui-captures/terrain'); // TERRAIN_OUT: pasta alternativa (conferência sem sujar o repositório)
const PORT = 5197;
const IDS = ['verdejante', 'inverno', 'devastadas', 'pantano'];

const CHROMIUM_ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1',
  '--disable-dev-shm-usage', '--disable-extensions'
];

let server = null;
let browser = null;
const errors = [];

async function withPage(fn) {
  browser = await chromium.launch({ args: CHROMIUM_ARGS });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto('about:blank');
    await assertHardwareGpu(page);
    await fn(page);
  } finally {
    await browser.close().catch(() => {});
    browser = null;
  }
}

async function main() {
  server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await server.listen();
  const BASE = `http://127.0.0.1:${PORT}`;

  // 1. Prévia: cada tileset sozinho (continental) + comparação 2x2 + ilhas
  await withPage(async (page) => {
    await page.goto(`${BASE}/terrain-preview.html?texq=low&ui=0`);
    await page.waitForFunction('window.terrainPreview', null, { timeout: 120000 });
    for (const id of IDS) {
      await page.evaluate((t) => { window.terrainPreview.setTileset(t); }, id);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/preview-${id}.png` });
    }
    // Costa com espuma (close-up)
    for (const id of ['verdejante', 'pantano']) {
      await page.evaluate((t) => {
        const p = window.terrainPreview;
        p.setTileset(t);
        p.controls.target.set(50, 0.5, 0);
        p.camera.position.set(64, 9, 14);
        p.controls.update();
      }, id);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/foam-${id}.png` });
    }
    await page.evaluate(() => { window.terrainPreview.setMap('ilhas-4p'); window.terrainPreview.setCompare(true); });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/preview-compare-ilhas.png` });
    await page.evaluate(() => { window.terrainPreview.setMap('continental-1v1'); window.terrainPreview.setCompare(true); });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/preview-compare-continental.png` });
  });

  // 2. Jogo real com o tileset forçado por URL
  for (const id of IDS) {
    await withPage(async (page) => {
      await page.goto(`${BASE}/?skipPreload&texq=low&tileset=${id}`);
      await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 120000 });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/game-${id}.png` });
    });
  }
  console.log(errors.length ? `ERROS:\n${errors.join('\n')}` : 'sem erros de console');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  });
