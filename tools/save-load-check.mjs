#!/usr/bin/env node
/**
 * F2-06: round-trip no navegador real (IndexedDB): joga ~N ticks, salva num slot, pausa, carrega o slot
 * e confere checksum/tick/unidades. Rode via:
 *   bash tools/safe-run.sh --timeout 300 -- node tools/save-load-check.mjs [ticks=3000] (a IA mata o humano ocioso por volta do tick 3600; o minuto 5 é coberto por tests/unit/saveGame.test.js)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5244;
const TICKS = Number(process.argv[2] || 3000);
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
});
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); if (!ok) failed++; };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&seed=7`);
  await assertHardwareGpu(page);
  await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });

  // joga rápido até TICKS e dá algumas ordens humanas pelo caminho
  await page.evaluate(async () => {
    const g = window.game.gameManager;
    const me = g.localPlayerId;
    const ids = g.getUnitsOf(me).map(u => u.id);
    const hq = g.buildings.find(b => b.ownerId === me && (b.type === 'castle' || b.type === 'great_hall'));
    g.issue({ type: 'move', playerId: me, unitIds: ids, x: hq.mesh.position.x + 6, z: hq.mesh.position.z + 6 });
    const w = g.getUnitsOf(me).find(u => u.type === 'villager' || u.type === 'peon');
    g.issue({ type: 'train', playerId: me, buildingId: hq.id, unitType: w.type });
  });
  // avança em lotes pelo mesmo caminho do jogo (advance + renderUpdate), sem depender da taxa de quadros
  await page.evaluate(async (target) => {
    const g = window.game.gameManager;
    g.gameSpeed = 1;
    while (g.currentTick < target && !g.isGameOver) {
      for (let i = 0; i < 40 && g.currentTick < target && !g.isGameOver; i++) { const al = g.advance(0.05); g.renderUpdate(0.05, al); }
      await new Promise(r => setTimeout(r, 0));
    }
  }, TICKS);
  console.log('tick alcançado:', await page.evaluate(() => [window.game.gameManager.currentTick, window.game.gameManager.isGameOver, window.game.gameManager.gameWon, window.game.gameManager.players.map(p => p.id + ':' + p.defeated)]));
  await page.evaluate(() => { window.game.pause(); });
  await page.waitForTimeout(300);

  const before = await page.evaluate(async () => {
    const { stateChecksum } = await import('/src/sim/checksum.js');
    const g = window.game.gameManager;
    window.__liveChecks = g.checksums.map(c => c.tick + ':' + c.hash);
    await window.game.saveToSlot('slot1');
    return { tick: g.currentTick, hash: stateChecksum(g), units: g.allUnits.length, buildings: g.buildings.length, fogExplored: g.fogOfWar.explored.reduce((a, b) => a + (b ? 1 : 0), 0) };
  });
  console.log('antes', JSON.stringify(before));
  const list = await page.evaluate(async () => (await window.game.saves.list()).map(s => s.slot + ':' + s.summary.seconds + 's'));
  check('slot1 listado no IndexedDB', list.includes(`slot1:${Math.round(before.tick * 0.05)}s`), JSON.stringify(list));

  const t0 = Date.now();
  await page.evaluate(() => window.game.loadFromSlot('slot1'));
  await page.waitForFunction(() => window.game.state === 'InGame' && window.game.gameManager, null, { timeout: 120000 });
  const loadMs = Date.now() - t0;
  const after = await page.evaluate(async () => {
    const { stateChecksum } = await import('/src/sim/checksum.js');
    const g = window.game.gameManager;
    return { tick: g.currentTick, hash: stateChecksum(g), units: g.allUnits.length, buildings: g.buildings.length, mismatch: window.game._saveMismatch, speed: g.gameSpeed, fogExplored: g.fogOfWar.explored.reduce((a, b) => a + (b ? 1 : 0), 0) };
  });
  if (after.mismatch) {
    const div = await page.evaluate(() => {
      const re = window.game.gameManager.checksums.map(c => c.tick + ':' + c.hash);
      const live = window.__liveChecks;
      const rm = new Map(re.map(x => x.split(':')));
      for (const x of live) { const [t, h] = x.split(':'); if (rm.has(t) && rm.get(t) !== h) return `primeira divergência no tick ${t} (live ${h} vs replay ${rm.get(t)})`; }
      return 'sem divergência nos ticks comparáveis';
    });
    console.log(div);
  }
  console.log('depois', JSON.stringify(after), `carga ${loadMs} ms`);
  check('tick restaurado', after.tick >= before.tick && after.tick <= before.tick + 60);
  check('checksum do load confere (sem aviso de versão)', after.mismatch === false);
  check('unidades/construções iguais', after.units === before.units && after.buildings === before.buildings);
  check('névoa explorada igual', Math.abs(after.fogExplored - before.fogExplored) <= 0, `${before.fogExplored} vs ${after.fogExplored}`);

  // continua jogando depois do load
  await page.evaluate(() => { window.game.gameManager.gameSpeed = 4; });
  await page.waitForTimeout(3000);
  const cont = await page.evaluate(() => window.game.gameManager.currentTick);
  check('partida continua depois do load', cont > after.tick);
  check('sem erros de página/console', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
