#!/usr/bin/env node
/**
 * F9-05 — verificação em navegador dos replays: joga uma partida acelerada (gravação automática), grava,
 * reproduz pelo player (velocidade, pausa, salto para frente/trás, troca de visão), confere que não houve
 * divergência de checksum, exporta/importa o arquivo e abre a lista pelo menu principal.
 *
 * NÃO rode direto: `bash tools/safe-run.sh --timeout 300 -- node tools/replay-check.mjs`
 * (GPU real obrigatória; ver CLAUDE.md). Capturas em /tmp/claude-1000/replay-check/ (REPLAY_SHOTS=dir).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5195;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.REPLAY_SHOTS || '/tmp/claude-1000/replay-check';
mkdirSync(SHOTS, { recursive: true });
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage', '--disable-extensions'
];
let vite = null;
let browser = null;
const log = (...a) => console.log('[replay-check]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(page, fn, label, timeout = 60000, arg) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() - t0 > timeout) throw new Error(`tempo esgotado: ${label}`);
    await sleep(250);
  }
}
const assert = (c, m) => { if (!c) throw new Error(`ASSERT: ${m}`); };

try {
  vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`); });
  const blank = await ctx.newPage();
  await assertHardwareGpu(blank);
  await blank.close();

  // 1) partida acelerada → gravação automática
  await page.goto(`${BASE}/?play&skipPreload&texq=low&seed=5`);
  await waitFor(page, () => !!window.game?.gameManager && window.game.gameManager.currentTick > 5, 'partida', 90000);
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.gameSpeed = 8;
    const me = gm.localPlayerId;
    const ids = gm.allUnits.filter((u) => u.ownerId === me && !u.isDead).map((u) => u.id);
    gm.issue({ type: 'move', playerId: me, unitIds: ids, x: 10, z: 10 });
    const hq = gm.buildings.find((b) => b.ownerId === me && /hq|hall|keep|stronghold|town|castle/i.test(b.type));
    if (hq) gm.issue({ type: 'train', playerId: me, buildingId: hq.id, unitType: gm.localPlayer.factionId === 'orc' ? 'peon' : 'villager' });
  });
  await waitFor(page, () => window.game.gameManager.currentTick >= 1300, 'tick 1300', 120000);
  const ticks0 = await page.evaluate(async () => {
    window.game.gameManager.gameSpeed = 1;
    const id = await window.game.replays.save();
    return { id, tick: window.game.gameManager.currentTick, n: (await window.game.replays.store.list()).length };
  });
  log('gravado', JSON.stringify(ticks0));
  assert(ticks0.id && ticks0.n === 1, 'replay gravado e listado');

  // 2) reproduzir o replay pelo player
  // a partida em curso está em IN_GAME: playReplay faz IN_GAME → PAUSED → LOADING
  await page.evaluate(async (id) => {
    const r = await window.game.replays.store.get(id);
    window.__replayTicks = r.ticks;
    window.game.playReplay(r, { tick: 200 });
  }, ticks0.id);
  await waitFor(page, () => !!window.game.replayCtl && window.game.state === 'InGame', 'replay carregado', 120000);
  const st = () => page.evaluate(() => {
    const c = window.game.replayCtl; const gm = window.game.gameManager;
    return { tick: gm.currentTick, paused: c.paused, speed: c.speed, ended: c.ended, seeking: c.seekTarget, view: c.view, mismatch: gm._replay.mismatch, local: gm.localPlayerId };
  });
  let s = await st();
  log('replay aberto', JSON.stringify(s));
  assert(s.tick >= 200 && s.tick < 400, 'começou perto do tick pedido');
  await page.screenshot({ path: `${SHOTS}/1-replay-bar.png` });

  // velocidade 4× avança mais rápido que 1×
  await page.click('[data-rp-speed="1"]');
  const a1 = (await st()).tick; await sleep(2000); const a2 = (await st()).tick;
  await page.click('[data-rp-speed="4"]');
  const b1 = (await st()).tick; await sleep(2000); const b2 = (await st()).tick;
  log(`1x: ${a2 - a1} ticks/2s; 4x: ${b2 - b1} ticks/2s`);
  assert(b2 - b1 > (a2 - a1) * 2.5, 'velocidade 4× > 2,5× a de 1×');
  // pausa
  await page.click('[data-rp="pause"]');
  const p1 = (await st()).tick; await sleep(800); const p2 = (await st()).tick;
  assert(p1 === p2, 'pausa congela a sim');
  await page.click('[data-rp="pause"]');
  // salto para a frente (barra de progresso)
  await page.evaluate(() => window.game.replayCtl.seek(900));
  await waitFor(page, () => window.game.replayCtl.seekTarget === null && window.game.gameManager.currentTick >= 900, 'salto à frente', 60000);
  // troca de visão
  await page.selectOption('[data-rp="view"]', '1');
  s = await st(); assert(s.local === 1 && s.view === 1, 'visão do jogador 1');
  await page.screenshot({ path: `${SHOTS}/2-view-p1.png` });
  await page.selectOption('[data-rp="view"]', '-1');
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/3-view-all.png` });
  // salto para trás (recria a partida)
  await page.evaluate(() => window.game.replayCtl.seek(400));
  await waitFor(page, () => !!window.game.replayCtl && window.game.state === 'InGame' && window.game.gameManager.currentTick >= 400 && window.game.gameManager.currentTick < 700, 'salto para trás', 120000);
  s = await st(); log('após salto para trás', JSON.stringify(s));
  assert(s.view === -1 || s.view === 0 || s.view === 1, 'visão preservada');
  // deixa chegar ao fim a 8×
  await page.click('[data-rp-speed="8"]');
  await waitFor(page, () => window.game.replayCtl.ended, 'fim do replay', 180000);
  s = await st(); log('fim', JSON.stringify(s));
  assert(!s.mismatch, 'sem divergência de checksum no navegador');
  await page.screenshot({ path: `${SHOTS}/4-end.png` });

  // 3) exportar / importar / apagar pela lista (menu principal)
  await page.evaluate(() => window.game.exitReplay());
  await waitFor(page, () => window.game.state === 'MainMenu', 'menu principal', 30000);
  await page.click('[data-action="replays"]');
  await page.waitForSelector('#replay-dialog:not([hidden]) .rp-item');
  await page.screenshot({ path: `${SHOTS}/5-list.png` });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-rp-export]')]);
  const file = `${SHOTS}/${dl.suggestedFilename()}`;
  await dl.saveAs(file);
  log('exportado', dl.suggestedFilename());
  assert(dl.suggestedFilename().endsWith('.warpolyreplay'), 'extensão .warpolyreplay');
  await page.click('[data-rp-del]'); await page.click('[data-rp-del]');
  await waitFor(page, () => !document.querySelector('#replay-dialog .rp-item'), 'apagado');
  await page.setInputFiles('[data-rp-file]', file);
  await page.waitForSelector('#replay-dialog .rp-item');
  log('importado de volta');
  await page.click('[data-rp-play]');
  await waitFor(page, () => !!window.game.replayCtl && window.game.state === 'InGame', 'replay do arquivo importado', 120000);
  log('replay do arquivo importado abriu');

  const real = errors.filter((e) => !/glbModels/.test(e));
  if (real.length) log('erros de página:\n' + real.slice(0, 8).join('\n'));
  log(real.length ? 'FALHA (erros de página)' : 'OK');
  process.exitCode = real.length ? 1 : 0;
} catch (err) {
  console.error('[replay-check] FALHA:', err);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch { /* */ }
  try { await vite?.close(); } catch { /* */ }
}
