// MP-02: captura e verifica a tela Multiplayer do menu principal. Rodar:
//   bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/MP-02/capture.mjs
// Cenários: (A) sinalizador fora do ar -> mensagem + "Tentar de novo"; (B) sinalizador no ar com uma sala
// pública -> lista, entrada por código inválido, entrar pela lista, "Voltar ao menu", Esc; (C) `?online=1`
// continua abrindo o lobby direto (sem "Voltar ao menu").
import { chromium } from 'playwright';
import { createServer } from 'vite';
import WebSocket from 'ws';
import fs from 'node:fs';
import { createSignalingServer } from '../../../server/signaling.js';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const PORT = 5342;
const OUT = 'tools/ui-captures/MP-02';
fs.mkdirSync(OUT, { recursive: true });
const results = {};
const check = (name, ok, extra = '') => {
  results[name] = { ok: !!ok, extra };
  console.log(`${ok ? 'OK ' : 'FALHA'} ${name}${extra ? ` (${extra})` : ''}`);
};

const sig = createSignalingServer({ port: 0, host: '127.0.0.1' });
await sig.ready;
const SIG_URL = `ws://127.0.0.1:${sig.port}`;

// Sala pública criada por um anfitrião (cliente ws simples).
const host = new WebSocket(SIG_URL);
await new Promise((res, rej) => { host.on('open', res); host.on('error', rej); });
const hostMsgs = [];
host.on('message', (d) => hostMsgs.push(JSON.parse(d.toString())));
const waitFor = (pred, ms = 3000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const m = hostMsgs.find(pred);
    if (m) { clearInterval(iv); res(m); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); }
  }, 20);
});
host.send(JSON.stringify({ t: 'create', name: 'Ana', public: true, config: { map: 'vale-do-rio' } }));
const joined = await waitFor((m) => m.t === 'joined');
const ROOM_CODE = joined.room.code;

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // ---------------- A: sinalizador fora do ar
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low&signal=ws://127.0.0.1:1`);
  await page.waitForSelector('[data-action="multiplayer"]', { timeout: 90000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await assertHardwareGpu(page);
  await page.waitForTimeout(600);
  check('menu: sem "Em breve" no Multiplayer', (await page.locator('[data-action="multiplayer"] .mm-badge').count()) === 0
    && (await page.locator('[data-action="multiplayer"]').isEnabled()));
  await page.click('[data-action="multiplayer"]');
  await page.waitForSelector('.mp-screen');
  await page.waitForSelector('.mp-alert', { timeout: 12000 });
  const alertText = (await page.textContent('.mp-alert')).trim();
  check('A: mensagem de servidor indisponível', alertText.startsWith('Servidor de partidas indisponível. Tente novamente.'), alertText);
  check('A: criar/entrar desabilitados', await page.isDisabled('[data-mp="create"]') && await page.isDisabled('[data-mp="join"]'));
  await page.waitForTimeout(500); // fim da animação de entrada do overlay (0,35 s)
  await page.screenshot({ path: `${OUT}/A-1-indisponivel.png` });
  await page.click('[data-mp="retry"]');
  await page.waitForSelector('.mp-alert', { timeout: 12000 });
  check('A: "Tentar de novo" refaz a conexão e mostra a mensagem outra vez', true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('A: Esc fecha a tela e volta ao menu', (await page.locator('.mp-overlay').count()) === 0 && (await page.locator('[data-action="multiplayer"]').count()) === 1);

  // ---------------- B: sinalizador no ar com sala pública
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low&signal=${encodeURIComponent(SIG_URL)}`);
  await page.waitForSelector('[data-action="multiplayer"]', { timeout: 90000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await page.waitForTimeout(400);
  await page.click('[data-action="multiplayer"]');
  await page.waitForSelector('.mp-room', { timeout: 12000 });
  const rowText = (await page.textContent('.mp-room')).replace(/\s+/g, ' ').trim();
  check('B: lista mostra a sala pública', rowText.includes(ROOM_CODE) && rowText.includes('Ana'), rowText);
  check('B: sem mensagem de erro com o servidor no ar', (await page.locator('.mp-alert').count()) === 0);
  await page.fill('#mp-name', 'Bia da Silva Costa Pereira Nunes Lima Fernandes');
  check('B: nome limitado a 24 caracteres', ((await page.inputValue('#mp-name')).length) === 24, await page.inputValue('#mp-name'));
  await page.fill('#mp-name', 'Bia');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/B-1-salas-publicas.png` });
  await page.fill('#mp-code', 'ab');
  await page.click('[data-mp="join"]');
  await page.waitForSelector('#mp-code-err:not([hidden])');
  check('B: código curto mostra erro sem sair da tela', (await page.locator('.mp-screen').count()) === 1
    && (await page.textContent('#mp-code-err')).includes('código válido'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/B-2-codigo-invalido.png` });
  await page.focus('.mp-room');
  await page.keyboard.press('ArrowDown');
  check('B: setas na lista de salas mantêm o foco válido', await page.evaluate(() => document.activeElement?.classList.contains('mp-room')));
  await page.click('.mp-room');
  await page.waitForSelector('#online-lobby', { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector('#ol-roomcode')?.textContent ?? '').length > 0, null, { timeout: 15000 }).catch(() => {});
  check('B: entrar pela lista abre o lobby com a sala', (await page.textContent('#ol-roomcode').catch(() => '')).trim() === ROOM_CODE,
    await page.textContent('#ol-roomcode').catch(() => ''));
  check('B: lobby de menu tem "Voltar ao menu" e esconde o campo de servidor', await page.isVisible('#ol-back') && !(await page.isVisible('#ol-server')));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/B-3-lobby-entrou.png` });
  await page.click('#ol-back');
  await page.waitForSelector('.mp-screen', { timeout: 10000 });
  check('B: "Voltar ao menu" no lobby reabre a tela Multiplayer', (await page.locator('#online-lobby').count()) === 0);
  await page.waitForSelector('.mp-room', { timeout: 12000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('B: Esc fecha e volta ao menu', (await page.locator('.mp-overlay').count()) === 0);

  // ---------------- C: ?online=1 continua direto
  await page.goto(`http://127.0.0.1:${PORT}/?online=1&signal=${encodeURIComponent(SIG_URL)}`);
  await page.waitForSelector('#ol-create', { timeout: 60000 });
  await page.waitForTimeout(400);
  check('C: ?online=1 abre o lobby sem "Voltar ao menu" e com o campo de servidor', !(await page.isVisible('#ol-back')) && (await page.isVisible('#ol-server')));
  check('C: ?online=1 conecta sozinho ao sinalizador', (await page.textContent('#ol-status')).includes('Conectado'), await page.textContent('#ol-status'));

  check('erros de página', errs.length === 0, JSON.stringify(errs));
} finally {
  host.close();
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
  await sig.close().catch(() => {});
}
const failed = Object.entries(results).filter(([, r]) => !r.ok).map(([k]) => k);
fs.writeFileSync(`${OUT}/resultado.json`, JSON.stringify({ when: new Date().toISOString(), results, failed }, null, 2));
console.log(failed.length ? `FALHAS: ${failed.join(' | ')}` : 'TODOS OS CHECKS OK');
process.exitCode = failed.length ? 1 : 0;
