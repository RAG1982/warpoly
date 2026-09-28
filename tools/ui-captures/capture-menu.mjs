#!/usr/bin/env node
/**
 * Capturas do menu principal (F6-01) em 1920×1080, 1024×768 e 390×844 + fluxo
 * menu → Iniciar → loading e regressões (?skipPreload, ?play, ?bench, inspetor).
 *
 * NÃO rode direto: use
 *   bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/capture-menu.mjs [menu|flow|regress]
 * Sobe o próprio Vite (porta 5181), abre UM browser por vez e fecha tudo em `finally`.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'tools/ui-captures/menu');
const PORT = 5181;
const only = process.argv[2];

const CHROMIUM_ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048',
  '--renderer-process-limit=1',
  '--disable-dev-shm-usage',
  '--disable-extensions',
];

const SIZES = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '1024x768', w: 1024, h: 768 },
  { name: '390x844', w: 390, h: 844, mobile: true },
];

let server = null;
let browser = null;
const errors = [];

async function withPage(opts, fn) {
  browser = await chromium.launch({ args: CHROMIUM_ARGS });
  try {
    const ctx = await browser.newContext(opts);
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

  if (!only || only === 'menu') {
    for (const s of SIZES) {
      await withPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: !!s.mobile, hasTouch: !!s.mobile }, async (page) => {
        // aquecimento (o Vite transforma os módulos na 1ª visita)
        await page.goto(BASE + '/');
        await page.waitForSelector('#main-menu.mm-ready');
        const t0 = Date.now();
        await page.goto(BASE + '/', { waitUntil: 'commit' });
        await page.waitForSelector('#main-menu.mm-ready');
        const perf = await page.evaluate(() => performance.now());
        console.log(`${s.name}: menu pronto em ${Date.now() - t0} ms (performance.now=${perf.toFixed(0)} ms)`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/menu-${s.name}.png` });
        await page.click('[data-action="new-game"]');
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/escaramuca-${s.name}.png` });
        if (s.w === 1920) {
          await page.keyboard.press('ArrowRight'); // facção pelo teclado
          await page.keyboard.press('Tab');
          await page.keyboard.press('ArrowRight'); // dificuldade pelo teclado
          await page.waitForTimeout(300);
          await page.screenshot({ path: `${OUT}/escaramuca-teclado-${s.name}.png` });
          await page.keyboard.press('Escape');
          await page.click('[data-action="options"]');
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${OUT}/opcoes-${s.name}.png` });
          await page.keyboard.press('Escape');
          await page.click('[data-action="credits"]');
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${OUT}/creditos-${s.name}.png` });
          await page.keyboard.press('Escape');
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(250);
          await page.screenshot({ path: `${OUT}/menu-foco-teclado-${s.name}.png` });
        }
      });
    }
  }

  if (!only || only === 'flow') {
    await withPage({ viewport: { width: 1920, height: 1080 } }, async (page) => {
      await page.goto(BASE + '/?texq=low');
      await page.waitForSelector('#main-menu.mm-ready');
      await page.click('[data-action="new-game"]');
      await page.click('.mm-faction--orc');
      await page.click('.mm-seg--hard');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/fluxo-1-escaramuca-orc.png` });
      await Promise.all([page.waitForURL(/play/), page.click('[data-action="start"]')]);
      console.log('URL após Iniciar:', page.url());
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/fluxo-2-carregando.png` });
      console.log('localStorage:', await page.evaluate(() => [localStorage.getItem('warpoly.difficulty'), localStorage.getItem('warpoly.faction')]));
      await page.waitForFunction(() => window.game && window.game.gameManager, null, { timeout: 120000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/fluxo-3-jogo-orc.png` });
      console.log('facção no jogo:', await page.evaluate(() => window.game.gameManager.playerFaction));
    });
  }

  if (!only || only === 'regress') {
    const cases = [
      { u: '/?skipPreload&texq=low', ready: 'window.game' },
      { u: '/?faction=orc&play&texq=low', ready: 'window.game' },
      { u: '/?skipMenu&skipPreload&texq=low', ready: 'window.game' },
      { u: '/inspector.html?texq=low', ready: 'window.inspectorApp' },
    ];
    for (const c of cases) {
      await withPage({ viewport: { width: 1024, height: 640 } }, async (page) => {
        await page.goto(BASE + c.u);
        await page.waitForFunction(c.ready, null, { timeout: 120000 });
        const r = await page.evaluate(() => ({ menu: !!document.getElementById('main-menu'), fac: window.game?.gameManager?.playerFaction }));
        console.log(c.u, 'OK', JSON.stringify(r));
      });
    }
    // ?bench: só confirma que o menu NÃO aparece (não roda o bench inteiro)
    await withPage({ viewport: { width: 1024, height: 640 } }, async (page) => {
      await page.goto(BASE + '/?bench&texq=low');
      await page.waitForTimeout(1500);
      console.log('/?bench menu?', await page.evaluate(() => !!document.getElementById('main-menu')));
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
