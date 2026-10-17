#!/usr/bin/env node
/**
 * M1-04 — save/load e replay NO MEIO DE UMA MISSÃO DE CAMPANHA (alliance-03-muralhas-de-alvorada), pelo caminho real
 * do jogador (menu > Campanha > missão > Iniciar), em navegador com GPU real.
 *
 *   Cenário A (save/load): joga ~N ticks da missão, salva num slot, carrega e confere checksum (inclui o estado da
 *     missão: `parts.mission`), tick, unidades/construções, objetivos e que a missão continua jogando.
 *   Cenário B (replay): joga ~N ticks, grava o replay, reproduz até o fim pelo player e confere que não houve
 *     divergência dos checksums periódicos e que o checksum final bate com o gravado e com o da partida ao vivo.
 *
 * NÃO rode direto: `bash tools/safe-run.sh --timeout 600 -- node tools/mission-check.mjs [ticks=1500]`
 * Sobe o Vite na porta 5301 (PORT_VITE) e o encerra no finally.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.PORT_VITE || 5301);
const TICKS = Number(process.argv[2] || 1500);
const MISSION = 'alliance-03-muralhas-de-alvorada';
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`); if (!ok) failed++; };
const log = (...a) => console.log('[mission-check]', ...a);

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;

/** Menu principal > Campanha > trilha 'alliance' > missão > Iniciar. Volta quando `gm.mission` existe. */
async function startFromCampaign(page, missionId) {
  await page.goto(`${base}/?texq=low&campaign=unlock`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('[data-action="campaign"]', { timeout: 60000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await page.waitForTimeout(600);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('.ms-brief-item', { timeout: 10000 });
  const skipStory = await page.waitForSelector('[data-story="skip"]', { timeout: 5000 }).catch(() => null);
  if (skipStory) {
    await skipStory.click();
    await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {});
  }
  await page.waitForSelector('[data-cp="pickCamp"][data-id="alliance"]', { timeout: 10000 });
  await page.click('[data-cp="pickCamp"][data-id="alliance"]');
  await page.waitForTimeout(400);
  await page.click(`[data-cp="pick"][data-id="${missionId}"]`);
  await page.waitForTimeout(400);
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.mission, null, { timeout: 90000 });
  await page.waitForTimeout(800);
}

/** Dá algumas ordens humanas e avança a sim em lotes (mesmo caminho do jogo: advance + renderUpdate). */
async function play(page, target) {
  await page.evaluate(async (target) => {
    const g = window.game.gameManager;
    const me = g.localPlayerId;
    const mine = g.getUnitsOf(me).filter((u) => !u.isDead);
    const hq = g.buildings.find((b) => b.ownerId === me && b.type === 'castle');
    const w = mine.find((u) => u.type === 'villager');
    if (hq && w) g.issue({ type: 'train', playerId: me, buildingId: hq.id, unitType: w.type });
    if (mine.length) g.issue({ type: 'move', playerId: me, unitIds: mine.slice(0, 3).map((u) => u.id), x: mine[0].mesh.position.x + 5, z: mine[0].mesh.position.z + 5 });
    g.gameSpeed = 1;
    while (g.currentTick < target && !g.isGameOver) {
      for (let i = 0; i < 40 && g.currentTick < target && !g.isGameOver; i++) { const al = g.advance(0.05); g.renderUpdate(0.05, al); }
      await new Promise((r) => setTimeout(r, 0));
    }
  }, target);
}

/** Resumo comparável do estado da partida/missão. */
const snapshot = (page) => page.evaluate(async () => {
  const { stateChecksum } = await import('/src/sim/checksum.js');
  const g = window.game.gameManager;
  return {
    tick: g.currentTick,
    hash: stateChecksum(g),
    units: g.allUnits.length,
    buildings: g.buildings.length,
    over: g.isGameOver,
    objectives: g.mission ? Object.fromEntries([...g.mission.objectives.values()].map((o) => [o.id, o.status])) : null
  };
});

try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await assertHardwareGpu(page);

  // ---------------------------------------------------------------- Cenário A: save/load em missão
  log('A) save/load — iniciando', MISSION);
  await startFromCampaign(page, MISSION);
  const missionId = await page.evaluate(() => window.game.gameManager.mission.id);
  check('A: partida é a missão pedida', missionId === MISSION, String(missionId));
  await play(page, TICKS);
  await page.evaluate(() => window.game.pause());
  await page.waitForTimeout(300);
  const aBefore = await snapshot(page);
  await page.evaluate(async () => { window.__liveChecks = window.game.gameManager.checksums.map((c) => c.tick + ':' + c.hash); await window.game.saveToSlot('slot1'); });
  log('A) antes', JSON.stringify(aBefore));
  check('A: objetivos da missão presentes', aBefore.objectives && Object.keys(aBefore.objectives).length > 0);
  await page.evaluate(() => window.game.loadFromSlot('slot1'));
  await page.waitForFunction(() => window.game.state === 'InGame' && window.game.gameManager && window.game.gameManager.mission, null, { timeout: 180000 });
  const aAfter = await snapshot(page);
  const mismatch = await page.evaluate(() => window.game._saveMismatch);
  log('A) depois', JSON.stringify(aAfter));
  check('A: tick restaurado', aAfter.tick >= aBefore.tick && aAfter.tick <= aBefore.tick + 60, `${aBefore.tick} -> ${aAfter.tick}`);
  check('A: checksum do load confere (inclui o estado da missão)', mismatch === false && aAfter.hash === aBefore.hash, `${aBefore.hash} vs ${aAfter.hash}`);
  check('A: unidades/construções iguais', aAfter.units === aBefore.units && aAfter.buildings === aBefore.buildings);
  check('A: objetivos iguais', JSON.stringify(aAfter.objectives) === JSON.stringify(aBefore.objectives), JSON.stringify(aAfter.objectives));
  await page.evaluate(() => { window.game.gameManager.gameSpeed = 4; });
  await page.waitForTimeout(3000);
  const aCont = await page.evaluate(() => window.game.gameManager.currentTick);
  check('A: missão continua depois do load', aCont > aAfter.tick, `${aAfter.tick} -> ${aCont}`);

  // ---------------------------------------------------------------- Cenário B: replay de missão
  log('B) replay — iniciando', MISSION);
  await startFromCampaign(page, MISSION);
  await play(page, TICKS);
  const bLive = await page.evaluate(async () => {
    const { stateChecksum } = await import('/src/sim/checksum.js');
    const g = window.game.gameManager;
    window.game.pause();
    const id = await window.game.replays.save();
    const r = await window.game.replays.store.get(id);
    return { id, tick: g.currentTick, hash: stateChecksum(g), final: r.final, checks: r.checks.length, missionCfg: r.config?.missionId ?? null };
  });
  log('B) gravado', JSON.stringify(bLive));
  check('B: replay gravado com checksums periódicos', !!bLive.id && bLive.checks > 0, `${bLive.checks} checksums`);
  check('B: replay guarda a config da missão', bLive.missionCfg === MISSION, String(bLive.missionCfg));
  check('B: checksum final gravado = checksum ao vivo', bLive.final.tick === bLive.tick && bLive.final.hash === bLive.hash, `${bLive.final.hash} vs ${bLive.hash}`);
  await page.evaluate(async (id) => {
    const r = await window.game.replays.store.get(id);
    window.game.playReplay(r, { tick: 0 });
  }, bLive.id);
  await page.waitForFunction(() => !!window.game.replayCtl && window.game.state === 'InGame', null, { timeout: 180000 });
  await page.click('[data-rp-speed="8"]').catch(() => {});
  await page.waitForFunction(() => window.game.replayCtl.ended, null, { timeout: 240000 });
  const bRep = await page.evaluate(async () => {
    const { stateChecksum } = await import('/src/sim/checksum.js');
    const g = window.game.gameManager;
    return { tick: g.currentTick, hash: stateChecksum(g), mismatch: g._replay.mismatch, hasMission: !!g.mission };
  });
  log('B) reprodução', JSON.stringify(bRep));
  check('B: reprodução sem divergência de checksum', bRep.mismatch === null);
  check('B: tick final = tick gravado', bRep.tick === bLive.final.tick, `${bRep.tick} vs ${bLive.final.tick}`);
  check('B: checksum final da reprodução = o da partida ao vivo', bRep.hash === bLive.hash, `${bRep.hash} vs ${bLive.hash}`);
  check('B: reprodução tem a missão', bRep.hasMission);

  const real = errs.filter((e) => !/glbModels/.test(e));
  check('sem erros de página/console', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  console.error('[mission-check] FALHA:', err);
  failed++;
} finally {
  await browser?.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
