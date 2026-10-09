#!/usr/bin/env node
/**
 * F9-01 — verificação em navegador da PoC lockstep (`net-poc.html`): DUAS abas do MESMO contexto (BroadcastChannel só cruza
 * abas da mesma origem e do mesmo perfil). Cria a sala numa aba, entra pela outra, move/treina nas duas, compara o checksum de
 * CADA turno entre as abas e força um desync (botão "Forçar desync") que as duas abas precisam detectar.
 * Saída: capturas + `resultado.json` em tools/ui-captures/net-poc/.
 *
 * NÃO rode direto: bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/net-poc/capture.mjs
 * (sobe o próprio Vite na porta 5231; um navegador; fecha tudo em `finally`; GPU real obrigatória).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'tools/ui-captures/net-poc');
const PORT = Number(process.env.NETPOC_PORT || 5231);
const BASE = `http://127.0.0.1:${PORT}`;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage', '--disable-extensions',
  // as duas abas precisam rodar o setInterval da sessão em tempo real mesmo sem foco
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'
];

const log = (...a) => console.log('[net-poc]', ...a);
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

mkdirSync(OUT, { recursive: true });
const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser = null;
const errors = [];
let exitCode = 1;
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 640 } });
  const blank = await ctx.newPage();
  await assertHardwareGpu(blank);
  await blank.close();

  // DUAS abas do MESMO contexto
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  for (const [n, p] of [['aba0', A], ['aba1', B]]) {
    p.on('pageerror', (e) => errors.push(`${n} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${n} console.error: ${m.text().slice(0, 300)}`); });
  }
  await A.goto(`${BASE}/net-poc.html`);
  await B.goto(`${BASE}/net-poc.html`);

  // 1. criar numa aba, entrar na outra
  await A.click('#host');
  await B.click('#join');
  for (const [n, p] of [['aba0 (jogador 0)', A], ['aba1 (jogador 1)', B]]) {
    await waitFor(p, () => !document.getElementById('game').hidden && !!window.lockstep, `partida iniciada em ${n}`, 20000);
  }
  const pids = await Promise.all([A, B].map((p) => p.evaluate(() => document.getElementById('pid').textContent)));
  check(pids[0] === '0' && pids[1] === '1', 'criar sala na aba 0 e entrar pela aba 1', `jogadores ${pids.join(' e ')}`);
  for (const p of [A, B]) await waitFor(p, () => window.lockstep.session.turn > 12, 'turnos avançando', 20000);

  // gravador de checksums por turno DENTRO de cada aba (a janela interna da sessão é curta): copia a cada 40 ms
  for (const p of [A, B]) {
    await p.evaluate(() => {
      const s = window.lockstep.session;
      window.__rec = new Map();
      window.__cmds = 0;
      setInterval(() => { for (const [t, h] of s._localSums) window.__rec.set(t, h); }, 40);
    });
  }

  // 2. mover/treinar nas DUAS abas por vários turnos
  const snapshot = (p) => p.evaluate(() => {
    const gm = window.lockstep.gm;
    return {
      gold: gm.players.map((q) => q.resources.gold),
      wood: gm.players.map((q) => q.resources.wood),
      units: gm.players.map((q, i) => gm.allUnits.filter((u) => u.ownerId === i && !u.isDead).length),
      queues: gm.buildings.filter((b) => b.queue && b.queue.length).map((b) => `${b.ownerId}:${b.type}:${b.queue.length}`).sort(),
      tick: gm.currentTick,
      turn: window.lockstep.session.turn
    };
  });
  const before = await Promise.all([A, B].map(snapshot));
  let cmdCount = 0;
  for (let round = 0; round < 8; round++) {
    for (const p of [A, B]) {
      await p.click('#move');
      cmdCount++;
      if (round % 2 === 0) { await p.click('#train'); cmdCount++; }
    }
    await sleep(600);
  }
  await sleep(2500);

  // 3. checksum de cada turno igual nas duas abas
  const recs = await Promise.all([A, B].map((p) => p.evaluate(() => ({ rec: [...window.__rec], turn: window.lockstep.session.turn, stalls: window.lockstep.session.stalls, desync: window.lockstep.session.desync, status: document.getElementById('status').textContent, statusClass: document.getElementById('status').className }))));
  const mapB = new Map(recs[1].rec);
  const common = recs[0].rec.filter(([t]) => mapB.has(t));
  const bad = common.filter(([t, h]) => mapB.get(t) !== h);
  const after = await Promise.all([A, B].map(snapshot));
  check(recs[0].turn > 60 && recs[1].turn > 60, 'as duas abas executaram dezenas de turnos', `turno aba0=${recs[0].turn}, aba1=${recs[1].turn}`);
  check(common.length >= 60 && bad.length === 0, 'checksums iguais em todos os turnos comuns', `${common.length} turnos comparados, ${bad.length} divergentes (turnos ${common[0]?.[0]}..${common[common.length - 1]?.[0]})`);
  check(recs.every((r) => !r.desync && r.status === 'em sincronia' && r.statusClass === 'ok'), 'as duas abas mostram "em sincronia"', recs.map((r) => r.status).join(' / '));
  check(JSON.stringify(after[0].gold) === JSON.stringify(after[1].gold) && JSON.stringify(after[0].units) === JSON.stringify(after[1].units) && JSON.stringify(after[0].queues) === JSON.stringify(after[1].queues),
    'estado das duas simulações idêntico (ouro, unidades e filas)', `ouro ${JSON.stringify(after[0].gold)} unidades ${JSON.stringify(after[0].units)} filas ${JSON.stringify(after[0].queues)}`);
  check(after[0].units[0] > before[0].units[0] || after[0].queues.length > 0 || JSON.stringify(after[0].gold) !== JSON.stringify(before[0].gold), 'treinar teve efeito na simulação (ouro gasto/fila/unidade nova)', `ouro ${JSON.stringify(before[0].gold)} -> ${JSON.stringify(after[0].gold)}`);

  // captura em sincronia: mesma linha "checksum do turno T" nas duas abas (T = último turno gravado em AMBAS)
  const T = Math.min(Math.max(...recs[0].rec.map((r) => r[0])), Math.max(...recs[1].rec.map((r) => r[0])));
  const stamp = async (p, label) => p.evaluate(([T0, lab]) => {
    let el = document.getElementById('cap');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cap';
      el.style.cssText = 'margin:8px 0;font:13px monospace;color:#ffd84d;white-space:pre';
      document.body.insertBefore(el, document.getElementById('log'));
    }
    el.textContent = `[captura ${lab}] checksum gravado do turno ${T0}: ${window.__rec.get(T0)}`;
  }, [T, label]);
  await stamp(A, 'aba 0'); await stamp(B, 'aba 1');
  await A.screenshot({ path: `${OUT}/aba0-sincronia.png` });
  await B.screenshot({ path: `${OUT}/aba1-sincronia.png` });
  const hashT = await Promise.all([A, B].map((p) => p.evaluate((t) => window.__rec.get(t), T)));
  check(hashT[0] !== undefined && hashT[0] === hashT[1], `captura: mesmo checksum no turno ${T} nas duas abas`, hashT.join(' = '));

  // 4. forçar desync na aba 1 (+1 de ouro só ali) -> as DUAS abas precisam detectar
  await B.click('#tamper');
  await waitFor(A, () => !!window.lockstep.session.desync, 'desync detectado na aba 0', 20000);
  await waitFor(B, () => !!window.lockstep.session.desync, 'desync detectado na aba 1', 20000);
  await sleep(700);
  const ds = await Promise.all([A, B].map((p) => p.evaluate(() => ({
    turn: window.lockstep.session.turn,
    desync: { turn: window.lockstep.session.desync.turn, local: window.lockstep.session.desync.local, remote: window.lockstep.session.desync.remote, playerId: window.lockstep.session.desync.playerId },
    status: document.getElementById('status').textContent,
    statusClass: document.getElementById('status').className,
    log: document.getElementById('log').textContent.split('\n').filter((l) => /DESYNC|adulterado/.test(l)).slice(0, 3)
  }))));
  check(ds.every((d) => d.status === 'DESYNC — sim congelada' && d.statusClass === 'bad'), 'forçar desync: as DUAS abas mostram "DESYNC — sim congelada"', ds.map((d) => `turno ${d.desync.turn}`).join(' / '));
  const frozen0 = ds.map((d) => d.turn);
  await sleep(1500);
  const frozen1 = await Promise.all([A, B].map((p) => p.evaluate(() => window.lockstep.session.turn)));
  check(frozen0[0] === frozen1[0] && frozen0[1] === frozen1[1], 'simulação congelada nas duas abas após o desync', `turnos ${frozen0.join('/')} -> ${frozen1.join('/')}`);
  const hashes = ds.map((d) => [d.desync.local, d.desync.remote]);
  check(hashes[0][0] === hashes[1][1] && hashes[0][1] === hashes[1][0] && hashes[0][0] !== hashes[0][1], 'os dois relatórios apontam hashes diferentes (local x remoto) cruzados entre as abas', JSON.stringify(hashes));
  await A.screenshot({ path: `${OUT}/aba0-desync.png` });
  await B.screenshot({ path: `${OUT}/aba1-desync.png` });

  const real = errors.filter((e) => !/DESYNC/.test(e));
  check(real.length === 0, 'sem erros de página/console (exceto o log de desync esperado)', real.slice(0, 3).join(' | '));

  const result = {
    quando: new Date().toISOString(),
    navegador: browser.version(),
    abas: 'duas abas do mesmo contexto (BroadcastChannel)',
    comandosEnviados: cmdCount,
    antes: before.map((s) => ({ ouro: s.gold, unidades: s.units, tick: s.tick, turno: s.turn })),
    depois: after.map((s) => ({ ouro: s.gold, unidades: s.units, filas: s.queues, tick: s.tick, turno: s.turn })),
    turnosComparados: common.length,
    divergentes: bad.length,
    primeiroTurno: common[0]?.[0],
    ultimoTurno: common[common.length - 1]?.[0],
    stalls: recs.map((r) => r.stalls),
    desync: ds.map((d) => ({ detectadoNoTurno: d.desync.turn, hashLocal: d.desync.local, hashRemoto: d.desync.remote, congeladoNoTurno: d.turn, log: d.log })),
    criterios: checks
  };
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(result, null, 2) + '\n');
  exitCode = checks.every((c) => c.ok) ? 0 : 1;
  log(exitCode === 0 ? 'TODOS OS CRITÉRIOS OK' : 'HÁ CRITÉRIOS COM FALHA');
} catch (err) {
  console.error('[net-poc] FALHA:', err);
  if (errors.length) console.error('[net-poc] erros de página:', errors.slice(0, 6));
} finally {
  await browser?.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(exitCode);
