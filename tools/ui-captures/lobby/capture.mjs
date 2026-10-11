#!/usr/bin/env node
/**
 * F9-02 — verificação em navegador do servidor de sinalização + lobby (`lobby.html`): sobe `npm run signaling` (porta padrão
 * 8787, ou SIGNAL_PORT) e o Vite, abre DUAS abas (contextos separados) e confere: criar sala (código + link), lista pública,
 * entrada pelo código (e pelo link, com uma terceira aba que sai), facção, mapa, chat, "iniciar" só com todos prontos e,
 * depois do `start`, o DataChannel WebRTC aberto entre as abas com mensagens trocadas nos dois sentidos.
 * Saída: capturas + `resultado.json` em tools/ui-captures/lobby/.
 *
 * NÃO rode direto: bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/lobby/capture.mjs
 * Variáveis: SIGNAL_PORT (padrão 8787), LOBBY_PORT (Vite, 5232), LOBBY_NO_MDNS=1 (liga o flag do Chromium que mostra o IP local
 * em vez do nome mDNS nos candidatos ICE; só para diagnóstico quando o canal não abre com os flags padrão).
 * Sobe/derruba o servidor e o Vite; GPU real obrigatória (assertGpu) mesmo sem usar WebGL.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'tools/ui-captures/lobby');
const SIG_PORT = Number(process.env.SIGNAL_PORT || 8787);
const PORT = Number(process.env.LOBBY_PORT || 5232);
const NO_MDNS = process.env.LOBBY_NO_MDNS === '1';
const BASE = `http://127.0.0.1:${PORT}`;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage', '--disable-extensions',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  ...(NO_MDNS ? ['--disable-features=WebRtcHideLocalIpsWithMdns'] : [])
];

const log = (...a) => console.log('[lobby]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (ok, label, extra = '') => {
  checks.push({ ok: !!ok, label, extra: String(extra) });
  log(ok ? 'OK  ' : 'FALHA', label, extra);
};

async function waitFor(page, fn, label, timeout = 30000, arg) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() - t0 > timeout) throw new Error(`tempo esgotado: ${label}`);
    await sleep(100);
  }
}
const rows = (p, sel) => p.$$eval(`${sel} tr`, (trs) => trs.map((r) => [...r.children].map((c) => c.textContent.trim())));

mkdirSync(OUT, { recursive: true });
let sig = null;
let vite = null;
let browser = null;
const errors = [];
let exitCode = 1;
const sigLog = [];

async function startSignaling() {
  // `npm run signaling` (node server/index.js) — porta padrão 8787; grupo de processos próprio para encerrar npm + node juntos
  sig = spawn('npm', ['run', 'signaling', '--silent'], { cwd: ROOT, env: { ...process.env, PORT: String(SIG_PORT) }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  sig.stdout.on('data', (d) => sigLog.push(String(d).trim()));
  sig.stderr.on('data', (d) => sigLog.push(String(d).trim()));
  for (let i = 0; i < 80; i++) {
    if (sigLog.some((l) => l.includes('ouvindo na porta'))) return;
    await sleep(100);
  }
  throw new Error(`servidor de sinalização não subiu: ${sigLog.join(' | ')}`);
}

function stopSignaling() {
  if (!sig) return;
  try { process.kill(-sig.pid, 'SIGTERM'); } catch { /* já encerrado */ }
}

try {
  await startSignaling();
  log('servidor de sinalização no ar:', sigLog.join(' | '));
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });

  const newPage = async (name, perms = false) => {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 760 } });
    if (perms) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console.error: ${m.text().slice(0, 300)}`); });
    return { ctx, page };
  };
  const blank = await newPage('gpu');
  await assertHardwareGpu(blank.page);
  await blank.ctx.close();

  const a = await newPage('A (Alice)', true);
  const A = a.page;
  const connect = async (page, name) => {
    await page.goto(`${BASE}/lobby.html${page._query || ''}`);
    await page.fill('#server', `ws://localhost:${SIG_PORT}`);
    await page.fill('#name', name);
    await page.click('#btnConnect');
    await waitFor(page, () => document.getElementById('conn').textContent === 'conectado', `${name} conectado`, 15000);
  };

  // --- 1. criar sala (pública), obter código e link; "iniciar" sozinho é recusado ---
  await connect(A, 'Alice');
  await A.check('#pub');
  await A.click('#btnCreate');
  await waitFor(A, () => !document.getElementById('room').hidden && document.getElementById('rcode').textContent.length === 5, 'sala criada', 10000);
  const code = await A.textContent('#rcode');
  check(/^[A-HJ-NP-Z2-9]{5}$/.test(code), 'criar sala devolve um código de 5 caracteres', code);
  await A.click('#btnStart');
  await waitFor(A, () => document.getElementById('status').textContent.length > 0, 'erro ao iniciar sozinho', 5000);
  const soloErr = await A.textContent('#status');
  check(soloErr === 'São necessários pelo menos 2 jogadores.', 'iniciar com 1 jogador é recusado (need-players)', soloErr);
  await A.click('#btnCopy');
  await sleep(300);
  const link = await A.evaluate(() => navigator.clipboard.readText());
  check(link === `${BASE}/lobby.html?sala=${code}`, '"Copiar link" coloca o link da sala na área de transferência', link);
  await A.screenshot({ path: `${OUT}/A-1-sala-criada.png` });

  // --- 2. entrar pelo LINK (terceira aba, depois sai) ---
  const c = await newPage('C (Carla)');
  c.page._query = `?sala=${code}`;
  await connect(c.page, 'Carla');
  await waitFor(c.page, (cd) => !document.getElementById('room').hidden && document.getElementById('rcode').textContent === cd, 'Carla entrou pelo link', 10000, code);
  await waitFor(A, () => document.querySelectorAll('#players tr').length === 3, 'Alice vê Carla', 10000);
  check(true, 'entrar pelo link (?sala=CÓDIGO) leva direto à sala', `Carla na sala ${code}; Alice vê ${(await rows(A, '#players')).length - 1} jogadores`);
  await c.page.click('#btnLeave');
  await waitFor(A, () => document.querySelectorAll('#players tr').length === 2, 'Carla saiu', 10000);
  await c.ctx.close();

  // --- 3. a outra aba vê a sala na lista pública e entra pelo CÓDIGO ---
  const b = await newPage('B (Bruno)');
  const B = b.page;
  await connect(B, 'Bruno');
  await waitFor(B, () => document.querySelectorAll('#rooms tr').length >= 2, 'lista pública', 10000);
  const pub = await rows(B, '#rooms');
  const mine = pub.find((r) => r[0] === code);
  check(!!mine && mine[1] === 'Alice' && mine[2] === '1/8', 'lista pública mostra a sala (código, anfitrião, jogadores)', JSON.stringify(mine));
  await B.screenshot({ path: `${OUT}/B-1-lista-publica.png` });
  await B.fill('#code', code);
  await B.click('#btnJoin');
  await waitFor(B, (cd) => !document.getElementById('room').hidden && document.getElementById('rcode').textContent === cd, 'Bruno entrou pelo código', 10000, code);
  await waitFor(A, () => document.querySelectorAll('#players tr').length === 3, 'Alice vê Bruno', 10000);
  const playersA = await rows(A, '#players');
  check(playersA.length === 3 && playersA.some((r) => r[0] === 'Bruno') && playersA.some((r) => r[0].startsWith('Alice (anfitrião)')), 'entrar pelo código: Alice (anfitrião) e Bruno na sala', JSON.stringify(playersA.slice(1).map((r) => r.slice(0, 3))));

  // --- 4. facção, chat, mapa ---
  await B.selectOption('#faction', 'orc');
  await waitFor(A, () => [...document.querySelectorAll('#players tr')].some((r) => r.textContent.includes('Bruno') && r.textContent.includes('Horda')), 'facção de Bruno em A', 10000);
  check(true, 'facção: Bruno escolhe Horda e Alice vê');
  await A.fill('#msg', 'olá, Bruno');
  await A.click('#btnSend');
  await waitFor(B, () => document.getElementById('chat').textContent.includes('Alice: olá, Bruno'), 'chat em B', 10000);
  await B.fill('#msg', 'oi, Alice');
  await B.press('#msg', 'Enter');
  await waitFor(A, () => document.getElementById('chat').textContent.includes('Bruno: oi, Alice'), 'chat em A', 10000);
  check(true, 'chat nos dois sentidos (botão Enviar e tecla Enter)');
  const maps = await A.$$eval('#map option', (os) => os.map((o) => o.value));
  const cur = await A.inputValue('#map');
  const next = maps.find((m) => m !== cur);
  await A.selectOption('#map', next);
  await waitFor(B, (m) => document.getElementById('map').value === m, 'mapa em B', 10000, next);
  const bMapDisabled = await B.$eval('#map', (e) => e.disabled);
  check(bMapDisabled, 'mapa: só o anfitrião altera (seletor desabilitado para Bruno) e a troca chega a Bruno', `${cur} -> ${next}`);

  // --- 5. "iniciar" só funciona com todos prontos ---
  await A.click('#btnStart');
  await waitFor(A, () => document.getElementById('status').textContent === 'Nem todos estão prontos.', 'erro não-prontos', 5000);
  await sleep(500);
  const startedEarly = await Promise.all([A, B].map((p) => p.evaluate(() => !!window.lobby.start)));
  check(!startedEarly[0] && !startedEarly[1], 'iniciar com Bruno NÃO pronto é recusado ("Nem todos estão prontos.")', 'nenhuma aba recebeu start');
  await A.screenshot({ path: `${OUT}/A-2-nem-todos-prontos.png` });
  await B.check('#ready');
  await waitFor(A, () => [...document.querySelectorAll('#players tr')].some((r) => r.textContent.includes('Bruno') && r.textContent.includes('sim')), 'Bruno pronto em A', 10000);
  check(true, 'pronto: Bruno marca "Pronto" e Alice vê "sim"');
  await B.screenshot({ path: `${OUT}/B-2-pronto.png` });
  await A.click('#btnStart');
  for (const p of [A, B]) await waitFor(p, () => !!window.lobby.start && !!window.lobby.transport, 'start recebido', 10000);
  const starts = await Promise.all([A, B].map((p) => p.evaluate(() => ({ seed: window.lobby.start.seed, players: window.lobby.start.players.map((q) => q.name + ':' + q.faction), map: window.lobby.start.config.map, localId: window.lobby.localId }))));
  check(starts[0].seed === starts[1].seed && starts[0].players.length === 2 && starts[0].map === next, 'com todos prontos o iniciar funciona: as duas abas recebem o mesmo start (seed, jogadores, mapa)', JSON.stringify(starts[0]));

  // --- 6. WebRTC: DataChannel aberto entre as abas e mensagens trocadas ---
  const t0 = Date.now();
  let opened = true;
  try {
    for (const p of [A, B]) await waitFor(p, () => window.lobby.transport.allOpen() && window.lobby.transport.peers.size === 1, 'DataChannel aberto', 40000);
  } catch (e) {
    opened = false;
    log('DataChannel NÃO abriu:', e.message);
  }
  const rtcInfo = (p) => p.evaluate(async () => {
    const t = window.lobby.transport;
    const out = [];
    for (const [id, peer] of t.peers) {
      const pc = peer.pc;
      let pair = null;
      try {
        const stats = await pc.getStats();
        const byId = new Map();
        stats.forEach((r) => byId.set(r.id, r));
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') {
            const l = byId.get(r.localCandidateId);
            const rm = byId.get(r.remoteCandidateId);
            pair = { local: l && `${l.candidateType}/${l.protocol}`, remote: rm && `${rm.candidateType}/${rm.protocol}`, rttMs: r.currentRoundTripTime != null ? Math.round(r.currentRoundTripTime * 1000) : null };
          }
        });
      } catch { /* sem stats */ }
      out.push({ peer: id, dc: peer.dc && { label: peer.dc.label, readyState: peer.dc.readyState, ordered: peer.dc.ordered }, connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState, iceGatheringState: pc.iceGatheringState, signalingState: pc.signalingState, pair });
    }
    return out;
  });
  const infoA = await rtcInfo(A);
  const infoB = await rtcInfo(B);
  log('RTC A:', JSON.stringify(infoA));
  log('RTC B:', JSON.stringify(infoB));
  const openMs = Date.now() - t0;
  check(opened && infoA[0]?.dc?.readyState === 'open' && infoB[0]?.dc?.readyState === 'open', 'DataChannel "lockstep" aberto nas duas abas', `abriu em ~${openMs} ms após o start; ICE ${infoA[0]?.iceConnectionState}/${infoB[0]?.iceConnectionState}; par ${JSON.stringify(infoA[0]?.pair)}`);

  let msgOk = false;
  let msgInfo = {};
  if (opened) {
    for (const p of [A, B]) await p.evaluate(() => { window.__rx = []; window.lobby.transport.onMessage((m) => window.__rx.push({ ...m, rx: Date.now() })); });
    await A.evaluate(() => { for (let i = 0; i < 20; i++) window.lobby.transport.send({ k: 'teste', de: 'Alice', n: i, tx: Date.now() }); });
    await B.evaluate(() => { for (let i = 0; i < 20; i++) window.lobby.transport.send({ k: 'teste', de: 'Bruno', n: i, tx: Date.now() }); });
    for (const p of [A, B]) await waitFor(p, () => window.__rx.length >= 20, 'mensagens recebidas', 10000);
    const rxA = await A.evaluate(() => window.__rx);
    const rxB = await B.evaluate(() => window.__rx);
    const ordered = (rx, de) => rx.length === 20 && rx.every((m, i) => m.k === 'teste' && m.de === de && m.n === i);
    const lat = (rx) => rx.map((m) => m.rx - m.tx);
    msgOk = ordered(rxB, 'Alice') && ordered(rxA, 'Bruno');
    msgInfo = { deAliceParaBruno: rxB.length, deBrunoParaAlice: rxA.length, latenciaMs: { aliceParaBruno: [Math.min(...lat(rxB)), Math.max(...lat(rxB))], brunoParaAlice: [Math.min(...lat(rxA)), Math.max(...lat(rxA))] } };
  }
  check(msgOk, 'mensagens trocadas pelo DataChannel nos dois sentidos (20 + 20, íntegras e em ordem)', JSON.stringify(msgInfo));

  // o canal continua aberto alguns segundos depois
  await sleep(3000);
  const later = await Promise.all([A, B].map((p) => p.evaluate(() => [...window.lobby.transport.peers.values()].map((q) => q.dc && q.dc.readyState + '/' + q.pc.connectionState))));
  check(later.every((l) => l.length === 1 && l[0] === 'open/connected'), 'o canal continua aberto 3 s depois', JSON.stringify(later));

  const stamp = (p, text) => p.evaluate((t) => {
    let el = document.getElementById('cap');
    if (!el) {
      el = document.createElement('pre');
      el.id = 'cap';
      el.style.cssText = 'margin:8px 0;font:12px monospace;color:#ffd84d;white-space:pre-wrap';
      document.body.insertBefore(el, document.getElementById('status'));
    }
    el.textContent = t;
  }, text);
  await stamp(A, `[captura] WebRTC (Alice): DataChannel ${infoA[0]?.dc?.label} ${later[0]?.[0]}; ICE ${infoA[0]?.iceConnectionState}; par ${JSON.stringify(infoA[0]?.pair)}; 20 msgs enviadas + 20 recebidas`);
  await stamp(B, `[captura] WebRTC (Bruno): DataChannel ${infoB[0]?.dc?.label} ${later[1]?.[0]}; ICE ${infoB[0]?.iceConnectionState}; par ${JSON.stringify(infoB[0]?.pair)}; 20 msgs enviadas + 20 recebidas`);
  await A.screenshot({ path: `${OUT}/A-3-partida-iniciada-datachannel.png` });
  await B.screenshot({ path: `${OUT}/B-3-partida-iniciada-datachannel.png` });

  const real = errors.filter((e) => !/Failed to load resource/.test(e));
  check(real.length === 0, 'sem erros de página/console', real.slice(0, 3).join(' | '));

  const result = {
    quando: new Date().toISOString(),
    navegador: browser.version(),
    flagsMdns: NO_MDNS ? 'WebRtcHideLocalIpsWithMdns DESLIGADO (diagnóstico)' : 'padrão do Chromium (mDNS ligado)',
    servidor: `npm run signaling (porta ${SIG_PORT})`,
    sala: code,
    link,
    start: starts[0],
    webrtc: { abriuEmMs: openMs, a: infoA, b: infoB, mensagens: msgInfo },
    errosDePagina: errors.slice(0, 10),
    criterios: checks
  };
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(result, null, 2) + '\n');
  exitCode = checks.every((x) => x.ok) ? 0 : 1;
  log(exitCode === 0 ? 'TODOS OS CRITÉRIOS OK' : 'HÁ CRITÉRIOS COM FALHA');
} catch (err) {
  console.error('[lobby] FALHA:', err);
  if (errors.length) console.error('[lobby] erros de página:', errors.slice(0, 8));
} finally {
  await browser?.close().catch(() => {});
  await vite?.close().catch(() => {});
  stopSignaling();
  await sleep(500);
}
process.exit(exitCode);
