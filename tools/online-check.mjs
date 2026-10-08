#!/usr/bin/env node
/**
 * F9-03 — verificação em navegador do lockstep online: sobe o servidor de sinalização (porta
 * 8791) e o Vite (5191), abre DUAS partidas (contextos separados) em `/?online=1`, cria/entra numa
 * sala pela UI, inicia, comanda unidades dos dois lados, compara os checksums por turno e, no
 * fim, adultera o ouro de um lado para ver o aviso de desync nos dois.
 *
 * NÃO rode direto: `bash tools/safe-run.sh --timeout 300 -- node tools/online-check.mjs`
 * (GPU real obrigatória; ver CLAUDE.md). Variável: ONLINE_ROUNDS (padrão 2 jogadores).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const VITE_PORT = 5191;
const SIG_PORT = 8791;
const BASE = `http://127.0.0.1:${VITE_PORT}`;
const qs = (name) => `online=1&skipPreload&texq=low&stun=0&autoconnect=1&signal=ws://127.0.0.1:${SIG_PORT}&nome=${name}`;

const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage', '--disable-extensions',
  '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'
];

let sig = null;
let vite = null;
let browser = null;
const log = (...a) => console.log('[online-check]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanup() {
  try { await browser?.close(); } catch { /* */ }
  try { await vite?.close(); } catch { /* */ }
  try { sig?.kill('SIGTERM'); } catch { /* */ }
}

async function waitFor(page, fn, label, timeout = 60000) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn)) return;
    if (Date.now() - t0 > timeout) throw new Error(`tempo esgotado: ${label}`);
    await sleep(250);
  }
}

try {
  sig = spawn('node', ['server/index.js', '--port', String(SIG_PORT), '--host', '127.0.0.1'], { stdio: 'inherit' });
  vite = await createServer({ server: { port: VITE_PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });

  const ctxA = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const ctxB = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errors = [];
  for (const [n, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', (e) => errors.push(`${n} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${n} console.error: ${m.text().slice(0, 300)}`); });
  }
  const blank = await ctxA.newPage();
  await assertHardwareGpu(blank);
  await blank.close();

  await A.goto(`${BASE}/?${qs('Alice')}`);
  await B.goto(`${BASE}/?${qs('Bruno')}`);
  await A.waitForSelector('#ol-create:not([hidden])', { timeout: 30000 });
  await waitFor(A, () => !document.querySelector('#ol-create')?.parentElement?.hidden, 'menu A');
  await A.click('#ol-create');
  await waitFor(A, () => (document.querySelector('#ol-roomcode')?.textContent || '').length >= 4, 'código da sala');
  const code = await A.evaluate(() => document.querySelector('#ol-roomcode').textContent);
  log('sala', code);
  await waitFor(B, () => !document.querySelector('#ol-create')?.parentElement?.hidden, 'menu B');
  await B.fill('#ol-code', code);
  await B.click('#ol-join');
  await waitFor(B, () => !!document.querySelector('#ol-ready'), 'sala B');
  await B.selectOption('#ol-faction', 'orc');
  await B.check('#ol-ready');
  await waitFor(A, () => document.querySelectorAll('#ol-players li').length === 2, 'dois jogadores');
  await sleep(500);
  await A.click('#ol-start');
  log('partida iniciada; aguardando carregar…');

  for (const p of [A, B]) await waitFor(p, () => !!window.game?.session?.online && window.game.gameManager?.currentTick > 20, 'sim rodando', 90000);
  log('sim rodando nos dois');

  // comandos reais pela API da UI (gm.issue → sessão), nos dois lados
  for (let round = 0; round < 6; round++) {
    for (const [p, sign] of [[A, 1], [B, -1]]) {
      await p.evaluate(([round, sign]) => {
        const gm = window.game.gameManager;
        const me = gm.localPlayerId;
        const units = gm.allUnits.filter((u) => u.ownerId === me && !u.isDead && !/villager|peon|worker/i.test(u.type)).slice(0, 3);
        const ids = (units.length ? units : gm.allUnits.filter((u) => u.ownerId === me && !u.isDead)).map((u) => u.id);
        gm.issue({ type: 'move', playerId: me, unitIds: ids, x: sign * (10 + round * 4), z: sign * (round * 3) });
        const hq = gm.buildings.find((b) => b.ownerId === me && b.isConstructed && b.queue.length < 3 && /hq|hall|keep|stronghold|town/i.test(b.type));
        if (hq && round % 2 === 0) {
          gm.issue({ type: 'train', playerId: me, buildingId: hq.id, unitType: gm.localPlayer.factionId === 'orc' ? 'peon' : 'villager' });
        }
      }, [round, sign]);
    }
    await sleep(1500);
  }
  await sleep(4000);

  const grab = (p) => p.evaluate(() => {
    const s = window.game.session.online.session;
    return { turn: s.turn, delay: s.delayTurns, sums: [...s._localSums].map(([t, h]) => [t, h]), st: s.status(), desync: !!s.desync, tick: window.game.gameManager.currentTick, hud: document.getElementById('online-hud')?.textContent || '' };
  });
  const a = await grab(A);
  const b = await grab(B);
  const mb = new Map(b.sums);
  const common = a.sums.filter(([t]) => mb.has(t));
  const bad = common.filter(([t, h]) => mb.get(t) !== h);
  log(`turnos A=${a.turn} B=${b.turn}; checksums comuns=${common.length}; divergentes=${bad.length}; atraso A=${a.delay} B=${b.delay}; RTT A=${a.st.maxRtt}ms`);
  log('HUD A:', a.hud);
  if (a.turn < 60 || b.turn < 60) throw new Error('poucos turnos executados');
  if (common.length < 5) throw new Error('poucos checksums comuns');
  if (bad.length > 0 || a.desync || b.desync) throw new Error(`desync inesperado: ${JSON.stringify(bad.slice(0, 3))}`);

  // desync forçado: +1 de ouro só em B
  await B.evaluate(() => { window.game.gameManager.players[1].resources.gold += 1; });
  await waitFor(A, () => !!window.game.session.online.session.desync, 'desync em A', 30000);
  await waitFor(B, () => !!window.game.session.online.session.desync, 'desync em B', 30000);
  await sleep(1500);
  const ra = await A.evaluate(() => ({ ...window.game.session.online.session.desync, hud: document.getElementById('online-hud').textContent }));
  log('desync em A:', JSON.stringify({ turn: ra.turn, divergent: ra.divergent, partsDiff: ra.partsDiff }), '|', ra.hud);
  if (!ra.hud.includes('DESSINCRONIA')) throw new Error('HUD sem aviso de desync');

  // o `console.error` do dump de desync é ESPERADO (desync forçado acima)
  const real = errors.filter((e) => !e.includes('[WarPoly online] DESYNC'));
  if (real.length) log('erros de página:\n' + real.slice(0, 8).join('\n'));
  log(real.length ? 'FALHA (erros de página)' : 'OK');
  process.exitCode = real.length ? 1 : 0;
} catch (err) {
  console.error('[online-check] FALHA:', err);
  process.exitCode = 1;
} finally {
  await cleanup();
}
