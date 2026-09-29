// F1-05 — capturas da névoa de guerra (antes/depois).
// Rodar sob tools/safe-run.sh com o vite já de pé:
//   bash tools/safe-run.sh --timeout 300 -- node tools/fog-compare/capture.mjs http://localhost:5184 depois [query extra]
// Saída: tools/fog-compare/<prefixo>-<cena>.png e <prefixo>-results.json
import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5184', prefix = 'depois', extra = ''] = process.argv.slice(2);
const OUT = __dirname;

const GPU_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--js-flags=--max-old-space-size=2048'
];

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const results = { prefix, base, extra, shots: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { if (m.type() === 'error') results.errors.push(m.text()); });
  page.on('pageerror', e => results.errors.push(String(e)));
  await page.goto(`${base}/?skipPreload&texq=low${extra ? '&' + extra : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.gameManager, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  // Utilitários no contexto da página
  await page.evaluate(() => {
    const game = window.game;
    const gm = game.gameManager;
    const sm = game.sceneManager;
    if (gm.aiDirector) gm.aiDirector.update = () => {};
    window.__fog = {
      cam(x, z, zoom = 1, angle = Math.PI / 4) {
        sm.cameraTarget.set(x, 2.5, z);
        sm.zoomLevel = sm.targetZoomLevel = zoom;
        sm.cameraAngle = sm.targetCameraAngle = angle;
      },
      tp(u, x, z) {
        if (u.stop) u.stop();
        u.mesh.position.set(x, gm.terrain.getHeight(x, z), z);
      },
      scout() { return gm.units.find(u => !u.isDead && (u.type === 'knight' || u.type === 'grunt')) || gm.units[0]; },
      enemyUnit() { return gm.enemies.find(u => !u.isDead && (u.type === 'grunt' || u.type === 'knight')) || gm.enemies[0]; },
      calls() { return sm.renderer.info.render.calls; }
    };
  });
  const shot = async (name, note) => {
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => ({
      calls: window.game.sceneManager.renderer.info.render.calls,
      programs: window.game.sceneManager.renderer.info.programs?.length
    }));
    await page.screenshot({ path: resolve(OUT, `${prefix}-${name}.png`) });
    results.shots.push({ name, note, ...info });
  };

  // 1. Borda da névoa com árvores/construções (base do jogador ao fundo)
  await page.evaluate(() => window.__fog.cam(14, -16, 1.0));
  await shot('borda', 'borda da área explorada inicial');
  await page.evaluate(() => window.__fog.cam(40, -8, 0.7, Math.PI / 4 + 0.6));
  await shot('borda-perto', 'borda de perto, câmera girada');

  // 2. Memória: batedor explora o centro e volta à base
  await page.evaluate(async () => {
    const f = window.__fog;
    const s = f.scout();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const [x, z] of [[14, -10], [4, -2], [-4, 6], [6, 10]]) { f.tp(s, x, z); await wait(250); }
    f.tp(s, 30, -22);
    await wait(300);
    f.cam(10, -6, 1.1);
  });
  await shot('memoria', 'centro explorado e abandonado (memória)');

  // 3. Unidade inimiga: visível perto das tropas e sumindo na memória
  await page.evaluate(async () => {
    const f = window.__fog;
    const e = f.enemyUnit();
    window.__fog.enemy = e;
    f.tp(e, 24, -16);
    await new Promise(r => setTimeout(r, 300));
    f.cam(24, -16, 0.55);
  });
  await shot('inimigo-visivel', 'inimigo dentro da visão');
  await page.evaluate(async () => {
    const f = window.__fog;
    f.tp(f.enemy, 4, 0);
    await new Promise(r => setTimeout(r, 300));
    f.cam(6, -2, 0.55);
  });
  await shot('inimigo-memoria', 'o mesmo inimigo parado numa área de memória');

  // 4. Fantasma: batedor vê a base inimiga, volta, e uma construção inimiga é destruída fora da visão
  await page.evaluate(async () => {
    const f = window.__fog;
    const gm = window.game.gameManager;
    const s = f.scout();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const [x, z] of [[-20, 14], [-30, 20], [-42, 22]]) { f.tp(s, x, z); await wait(300); }
    f.tp(s, 30, -22);
    await wait(300);
    const enemyB = gm.buildings.filter(b => b.faction === 'enemy' && !b.isDead);
    // destrói a de maior |x| (fazenda/chiqueiro lateral)
    const target = enemyB.sort((a, b) => Math.abs(b.mesh.position.x) - Math.abs(a.mesh.position.x))[0];
    window.__fog.destroyed = { type: target.type, x: target.mesh.position.x, z: target.mesh.position.z };
    target.takeDamage(1e6); // F2-07: takeDamage não recebe mais particleSystem (evento BUILDING_DAMAGED)
    await wait(400);
    f.cam(-34, 26, 1.0);
  });
  await shot('fantasma', 'base inimiga na memória; construção lateral destruída fora da visão');
  await page.screenshot({ path: resolve(OUT, `${prefix}-minimapa.png`), clip: await page.evaluate(() => {
    const r = document.getElementById('minimap-wrapper').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }) });
  results.shots.push({ name: 'minimapa' });

  // 5. Revendo a área: o fantasma some
  await page.evaluate(async () => {
    const f = window.__fog;
    const d = window.__fog.destroyed;
    f.tp(f.scout(), d.x + 6, d.z - 6);
    await new Promise(r => setTimeout(r, 400));
  });
  await shot('fantasma-revisto', 'área revista: o fantasma some');

  results.destroyed = await page.evaluate(() => window.__fog.destroyed);
  results.groundMeshes = await page.evaluate(() => window.game.gameManager.fogOfWar.groundMeshes || null);
} finally {
  fs.writeFileSync(resolve(OUT, `${prefix}-results.json`), JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
