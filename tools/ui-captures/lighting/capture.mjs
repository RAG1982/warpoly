#!/usr/bin/env node
/**
 * Capturas de iluminação e pós-processamento (F7-03): jogo real com GPU real.
 *
 * NÃO rode direto: use
 *   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/lighting/capture.mjs
 * Sobe o próprio Vite (porta 5199), UM browser por vez, tudo fechado em `finally`.
 * Saídas em tools/ui-captures/lighting/: base (fx=0) × completo, contorno de seleção, bloom (chamas),
 * AO, 4 tilesets com grade e 4 horas do ciclo dia/noite. Também imprime fps/draw calls de cada configuração.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'tools/ui-captures/lighting');
const PORT = 5199;
const CHROMIUM_ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1',
  '--disable-dev-shm-usage', '--disable-extensions'
];

let server = null;
let browser = null;
const errors = [];

async function withPage(url, fn) {
  browser = await chromium.launch({ args: CHROMIUM_ARGS });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto('about:blank');
    await assertHardwareGpu(page);
    await page.goto(url);
    await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    await fn(page);
  } finally {
    await browser.close().catch(() => {});
    browser = null;
  }
}

/** Seleciona unidades do jogador perto do HQ, danifica um prédio (chamas) e enquadra a câmera. */
async function setupScene(page, { select = true, burn = true } = {}) {
  await page.evaluate(({ select, burn }) => {
    const g = window.game, gm = g.gameManager, p = gm.localPlayer;
    const hq = gm.buildings.find((b) => b.ownerId === p.id && b.role === 'hq');
    const units = gm.getUnitsOf(p.id).slice(0, 5);
    if (select) { gm.selectSingle(units[0]); for (const u of units.slice(1)) { u.isSelected = true; } }
    if (burn) {
      const other = gm.buildings.find((b) => b.ownerId === p.id && b !== hq && !b.isUnderConstruction) || hq;
      other.hp = Math.max(1, Math.floor(other.maxHp * 0.3));
    }
    const sm = g.sceneManager;
    sm.cameraTarget.set(hq.mesh.position.x, 2.5, hq.mesh.position.z);
    sm.targetZoomLevel = 0.7;
    window.__hq = hq;
  }, { select, burn });
  await page.waitForTimeout(1500);
}

async function measure(page, label, seconds = 4) {
  const r = await page.evaluate(async (sec) => {
    const info = window.game.sceneManager.renderer.info;
    let frames = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => { frames++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    return { fps: frames / ((performance.now() - t0) / 1000), calls: info.render.calls, pr: window.game.sceneManager.renderer.getPixelRatio() };
  }, seconds);
  console.log(`${label}: ${r.fps.toFixed(1)} fps, ${r.calls} calls, pr ${r.pr}`);
  return r;
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function main() {
  server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await server.listen();
  const BASE = `http://127.0.0.1:${PORT}/?skipPreload&texq=med&quality=high`;

  // 1. Sem efeitos × completo (cena com seleção e chamas)
  for (const [name, q] of [['01-base-fx0', '&fx=0'], ['02-completo', ''], ['03-sem-ssao', '&fx=-ssao'], ['04-so-ssao', '&fx=ssao'], ['05-so-bloom', '&fx=bloom'], ['06-so-outline', '&fx=outline']]) {
    await withPage(BASE + q, async (page) => {
      await setupScene(page);
      await shot(page, name);
      await measure(page, name, 3);
    });
  }

  // 2. Tilesets com grade (completo × sem grade)
  for (const id of ['verdejante', 'inverno', 'devastadas', 'pantano']) {
    await withPage(`${BASE}&tileset=${id}`, async (page) => {
      await setupScene(page, { select: false, burn: false });
      await shot(page, `10-tileset-${id}`);
    });
    await withPage(`${BASE}&tileset=${id}&fx=-grading`, async (page) => {
      await setupScene(page, { select: false, burn: false });
      await shot(page, `11-tileset-${id}-sem-grade`);
    });
  }

  // 3. Ciclo dia/noite (fase fixa por ?tod, ciclo longo para não andar durante a captura)
  for (const [tag, tod] of [['meia-noite', 0], ['alvorada', 0.25], ['meio-dia', 0.5], ['por-do-sol', 0.75]]) {
    await withPage(`${BASE}&daynight=7200&tod=${tod}`, async (page) => {
      await setupScene(page, { select: true, burn: true });
      await shot(page, `20-ciclo-${tag}`);
    });
  }

  // 4. Desempenho em texq=low (cena inicial): sem efeitos × padrão (deve ser idêntico) e high/texq=low
  for (const [label, q] of [['low fx=0', '&texq=low&fx=0'], ['low padrao', '&texq=low']]) {
    await withPage(`http://127.0.0.1:${PORT}/?skipPreload${q}`, async (page) => { await measure(page, label, 6); });
  }
  console.log(errors.length ? `ERROS:\n${errors.join('\n')}` : 'sem erros de console');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  });
