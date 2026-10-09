// F7-06: capturas da animação de produção (inspetor: ataque v0/v1, idle variado, carga, morte por dano; jogo: partida curta).
//   bash tools/safe-run.sh --timeout 500 -- node tools/capture-anim.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5216);
const OUT = 'tools/ui-captures/anim';
mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
  });
  const base = `http://127.0.0.1:${PORT}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${base}/inspector.html?skipPreload&texq=low`);
  await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
  await assertHardwareGpu(page);
  const clip = { x: 340, y: 60, width: 640, height: 600 };
  const models = ['villager', 'peon', 'knight', 'grunt', 'archer', 'axethrower'];
  for (const id of models) {
    await page.evaluate((mid) => { window.inspectorApp.selectModel(mid); }, id);
    await page.waitForTimeout(900);
    const shot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${id}-${name}.png`, clip }); };
    const pose = (anim, t, opts = {}) => page.evaluate(([a, tt, o]) => {
      const an = window.inspectorApp.animator;
      an.pause();
      an.setAttackVariant(o.variant || 0);
      an.setCarrying(!!o.carry);
      an.setDeathStyle(o.death || 'cut', 1);
      an._idleVar = o.idle || 0;
      an.setAnimation(a, true);
      an._blendT = 99;
      an.setTime(tt);
    }, [anim, t, opts]);
    await pose('fight', 0.5, { variant: 0 }); await shot('ataque-v0');
    await pose('fight', 0.5, { variant: 1 }); await shot('ataque-v1');
    await pose('idle', 1.0, { idle: 1 }); await shot('idle-olhar');
    await pose('idle', 1.0, { idle: 2 }); await shot('idle-alongar');
    if (id === 'villager' || id === 'peon') {
      await page.evaluate(() => { const a = window.inspectorApp.animator; a.setVillagerCargo('gold'); });
      await pose('walk', 0.2, { carry: true }); await shot('carga-ouro');
      await page.evaluate(() => { window.inspectorApp.animator.setVillagerCargo('wood'); });
      await pose('walk', 0.2, { carry: true }); await shot('carga-madeira');
    }
    for (const d of ['cut', 'projectile', 'crush', 'magic']) {
      await pose('die', 1.4, { death: d }); await shot(`morte-${d}`);
    }
  }
  await page.close();

  // --- jogo: partida curta (combate, morte por tipo, carregadores) ---
  const game = await ctx.newPage();
  game.on('pageerror', (e) => errors.push(`jogo: ${e.message}`));
  await game.goto(`${base}/?skipPreload&texq=low&play`);
  await game.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
  await assertHardwareGpu(game);
  await game.evaluate(() => {
    const gm = window.game.gameManager;
    const hq = gm.buildings.find((b) => b.ownerId === 0);
    const cx = hq.mesh.position.x + 14, cz = hq.mesh.position.z + 14;
    gm.sceneManager.cameraTarget.set(cx, 0, cz);
    const hu = gm.playerFaction === 'orc' ? ['grunt', 'axethrower'] : ['knight', 'archer'];
    const en = gm.playerFaction === 'orc' ? ['knight', 'archer'] : ['grunt', 'axethrower'];
    const mine = [], theirs = [];
    for (let i = 0; i < 8; i++) {
      mine.push(gm.spawnUnit(hu[i % 2], cx - 2, cz - 6 + i * 1.6, 0).id);
      theirs.push(gm.spawnUnit(en[i % 2], cx + 2, cz - 6 + i * 1.6, 1).id);
    }
    gm.issue({ type: 'attackMove', playerId: 0, unitIds: mine, x: cx + 3, z: cz });
    gm.issue({ type: 'attackMove', playerId: 1, unitIds: theirs, x: cx - 3, z: cz });
  });
  await game.waitForTimeout(3500);
  await game.screenshot({ path: `${OUT}/jogo-1-combate.png` });
  await game.waitForTimeout(3500);
  await game.screenshot({ path: `${OUT}/jogo-2-mortes.png` });
  await game.close();
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
