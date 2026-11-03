// M2-08: tela de campanha com o mapa-múndi. Rodar:
//   bash tools/safe-run.sh --timeout 420 -- node tools/ui-captures/M2-08/capture.mjs
// Cenários: Aliança (4 concluídas) em 1024x768, 1920x1080 e 3840x2160 na base '/', Horda (?campaign=war-horde) em 1920x1080
// e Aliança em 1920x1080 sob a base '/warpoly/'. Confere 12 pinos, arte carregada, teclado e 0 erro de console.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = 'tools/ui-captures/M2-08';
const ALLIANCE_DONE = ['war-alliance-01-terra-a-vista', 'war-alliance-02-pouso-do-encontro', 'war-alliance-03-ouro-da-pedra-mae', 'war-alliance-04-baixio-do-breu'];
const seed = JSON.stringify({ version: 1, campaigns: { 'war-alliance': { current: 1, attempts: { 1: { startedAt: 1, completed: Object.fromEntries(ALLIANCE_DONE.map((id) => [id, { seconds: 300, resources: null, at: 1 }])) } } } } });
const errors = [];
let failed = false;
const check = (name, ok, extra = '') => { if (!ok) failed = true; console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`); };
let browser;
const servers = [];

async function serve(port, base) {
  const s = await createServer({ base, server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await s.listen();
  servers.push(s);
  return s;
}

async function shot({ name, base = '/', port, size, query = '', seeded = true, lang = null }) {
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`${name}: requestfailed ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  if (seeded) await ctx.addInitScript((v) => { try { localStorage.setItem('warpoly.campaign.v1', v); } catch { /* */ } }, seed);
  if (lang) await ctx.addInitScript((l) => { try { localStorage.setItem('warpoly.lang', l); } catch { /* */ } }, lang);
  await page.goto(`http://127.0.0.1:${port}${base}?texq=low${query}`);
  await page.waitForSelector('[data-action="campaign"]', { timeout: 90000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await assertHardwareGpu(page);
  await page.waitForTimeout(600);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('.cs-card');
  const card = query.includes('war-horde') ? '.cs-card[data-id="war-horde"]' : '.cs-card[data-id="war-alliance"]';
  await page.click(card);
  const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 3000 }).catch(() => null);
  if (skip) { await skip.click(); await page.waitForTimeout(500); }
  await page.waitForSelector('.wm-pin');
  await page.waitForFunction(() => { const i = document.querySelector('.wm-art'); return !i || (i.complete && i.naturalWidth > 0); }, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => {
    const pins = [...document.querySelectorAll('.wm-pin')];
    const art = document.querySelector('.wm-art');
    const dlg = document.querySelector('.ms-brief').getBoundingClientRect();
    return {
      n: pins.length, states: pins.map((p) => p.dataset.state).join(','), art: art && art.getAttribute('src'), artOk: !!art && art.naturalWidth > 0,
      tab0: pins.filter((p) => p.tabIndex === 0).length, labels: pins.map((p) => p.getAttribute('aria-label')),
      fits: dlg.top >= 0 && dlg.bottom <= innerHeight + 1 && dlg.left >= 0 && dlg.right <= innerWidth + 1,
      hscroll: document.documentElement.scrollWidth > innerWidth
    };
  });
  check(`${name}: 12 pinos`, info.n === 12, info.states);
  check(`${name}: arte carregada`, info.artOk, info.art);
  check(`${name}: 1 pino na ordem de tab`, info.tab0 === 1);
  check(`${name}: diálogo cabe na janela`, info.fits && !info.hscroll);
  if (name.startsWith('a-1920-base')) console.log(info.labels.join('\n'));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return { page, ctx };
}

fs.mkdirSync(OUT, { recursive: true });
try {
  await serve(5381, '/');
  await serve(5382, '/warpoly/');
  browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage'] });

  for (const [tag, w, h] of [['1024', 1024, 768], ['1920', 1920, 1080], ['3840', 3840, 2160]]) {
    const { ctx, page } = await shot({ name: `alianca-${tag}`, port: 5381, size: { width: w, height: h } });
    if (tag === '1920') {
      // teclado: Tab chega ao pino, setas movem o foco, Enter seleciona
      await page.focus('.wm-pin[tabindex="0"]');
      const first = await page.evaluate(() => document.activeElement.className + '|' + document.activeElement.dataset.id);
      check('foco no pino da ordem de tab', first.startsWith('wm-pin'), first);
      await page.keyboard.press('ArrowRight');
      const moved = await page.evaluate(() => document.activeElement.dataset.id);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const sel = await page.evaluate(() => document.querySelector('.wm-pin[aria-current="true"]').dataset.id + '|' + document.activeElement.dataset.id);
      check('Enter no pino selecionado e mantém o foco', sel === `${moved}|${moved}`, sel);
      await page.keyboard.press('End');
      await page.screenshot({ path: `${OUT}/alianca-1920-foco-final.png` });
      await page.screenshot({ path: `${OUT}/alianca-1920-teclado.png` });
    }
    await ctx.close();
  }
  { const { ctx } = await shot({ name: 'horda-1920', port: 5381, size: { width: 1920, height: 1080 }, query: '&campaign=war-horde', seeded: false }); await ctx.close(); }
  { const { ctx } = await shot({ name: 'a-1920-base-warpoly', base: '/warpoly/', port: 5382, size: { width: 1920, height: 1080 } }); await ctx.close(); }
  { const { ctx } = await shot({ name: 'alianca-en-1280', port: 5381, size: { width: 1280, height: 720 }, lang: 'en' }); await ctx.close(); }

  check('0 erros de console/rede', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const s of servers) await s.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
