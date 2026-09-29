#!/usr/bin/env node
/**
 * Capturas dos mapas orientados a dados (F2-05): jogo + minimapa de `continental-1v1`
 * (padrão, deve ficar igual ao master) e `ilhas-4p` (novo, `?ffa=1`).
 *
 * NÃO rode direto: use
 *   bash tools/safe-run.sh --timeout 240 -- node tools/ui-captures/maps/capture-maps.mjs
 * Sobe o próprio Vite (porta 5195, da spec F2-05), abre UM browser por vez e fecha tudo em `finally`.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'tools/ui-captures/maps');
const PORT = 5195;

const CHROMIUM_ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048',
  '--renderer-process-limit=1',
  '--disable-dev-shm-usage',
  '--disable-extensions',
];

const CASES = [
  { name: 'continental-1v1', url: '/?skipPreload&texq=low' },
  { name: 'ilhas-4p', url: '/?skipPreload&texq=low&map=ilhas-4p&ffa=1' },
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

  for (const c of CASES) {
    await withPage(async (page) => {
      await page.goto(BASE + c.url);
      await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 120000 });
      const info = await page.evaluate(() => {
        const gm = window.game.gameManager;
        return {
          mapId: gm.matchConfig.mapId,
          players: gm.matchConfig.players.length,
          webgl: window.game.sceneManager.renderer.getContext().getParameter(window.game.sceneManager.renderer.getContext().RENDERER)
        };
      });
      console.log(c.name, 'OK', JSON.stringify(info));
      await page.waitForTimeout(2500); // câmera/água/névoa assentarem
      await page.screenshot({ path: `${OUT}/${c.name}-jogo.png` });

      const minimap = page.locator('#minimap-canvas');
      await minimap.screenshot({ path: `${OUT}/${c.name}-minimapa.png` });
    });
  }
}

try {
  await main();
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  console.log('ERROS:', errors.length ? '\n' + errors.join('\n') : 'nenhum');
}
