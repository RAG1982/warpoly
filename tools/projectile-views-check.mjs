#!/usr/bin/env node
/**
 * F2-08: no navegador real, projéteis da simulação (src/sim/projectiles.js) ganham malha em
 * src/render/ProjectileViews.js e a perdem ao acertar. Rode via:
 *   bash tools/safe-run.sh --timeout 240 -- node tools/projectile-views-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5245;
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
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low`);
  await assertHardwareGpu(page);
  await page.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
  const res = await page.evaluate(async () => {
    const g = window.game.gameManager;
    const sess = window.game.session;
    // arena: arqueiro humano e ballista contra um grunt orc, longe das bases
    const hq = g.buildings.find(b => b.ownerId === g.localPlayerId && (b.type === 'castle' || b.type === 'great_hall'));
    const x = hq.mesh.position.x - 6, z = hq.mesh.position.z - 24;
    const archer = g.spawnUnit('archer', x, z, 0);
    const ballista = g.spawnUnit('ballista', x + 2, z + 2, 0);
    const grunt = g.spawnUnit('grunt', x + 12, z, 1);
    grunt.hp = grunt.maxHp = 100000; grunt.speed = 0;
    g.issue({ type: 'attack', playerId: 0, unitIds: [archer.id, ballista.id], targetId: grunt.id });
    let maxArrows = 0, maxViews = 0, kinds = new Set(), mismatch = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) {
      await new Promise(r => setTimeout(r, 50));
      const arrows = g.arrows.filter(a => !a.isDead);
      maxArrows = Math.max(maxArrows, arrows.length);
      arrows.forEach(a => kinds.add(a.kind));
      const views = sess.projectileViews ? sess.projectileViews.views.size : -1;
      maxViews = Math.max(maxViews, views);
      if (views > arrows.length + 1) mismatch++;
    }
    return { maxArrows, maxViews, kinds: [...kinds], mismatch, sceneProjectiles: sess.projectileViews.views.size, hp: grunt.hp < grunt.maxHp };
  });
  console.log(JSON.stringify(res));
  check('projéteis foram criados na simulação', res.maxArrows > 0);
  check('cada projétil tem malha (views criadas)', res.maxViews > 0);
  check('flecha e virote presentes', res.kinds.includes('arrow') && res.kinds.includes('bolt'), res.kinds.join(','));
  check('views não vazam (vistas ≈ projéteis vivos)', res.mismatch === 0);
  check('dano chegou ao alvo', res.hp);
  check('sem erros de página/console', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
