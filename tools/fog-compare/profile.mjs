// Perfil F1-05: tempo de CPU da névoa por etapa num cenário do bench.
//   bash tools/safe-run.sh --timeout 200 -- node tools/fog-compare/profile.mjs http://localhost:5186 combate100
import { chromium } from 'playwright';
const [base = 'http://localhost:5186', scenario = 'combate100', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
    '--disable-frame-rate-limit', '--disable-gpu-vsync']
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', String(e)));
  await page.goto(`${base}/?bench=${scenario}&benchWarmup=2&benchDuration=6&texq=low${extra ? '&' + extra : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.fogOfWar, null, { timeout: 90000 });
  await page.evaluate(() => {
    const fog = window.game.gameManager.fogOfWar;
    const P = (window.__fogProf = { tick: [], cull: [], tex: [], mem: [], upd: [] });
    const wrap = (obj, name, arr) => {
      const orig = obj[name].bind(obj);
      obj[name] = (...a) => { const t = performance.now(); const r = orig(...a); arr.push(performance.now() - t); return r; };
    };
    wrap(fog, '_tickGrid', P.tick);
    wrap(fog, 'cullHiddenEnemies', P.cull);
    wrap(fog, '_uploadTexture', P.tex);
    wrap(fog.buildingMemory, 'update', P.mem);
    wrap(fog, 'update', P.upd);
  });
  await page.waitForFunction(() => window.__bench, null, { timeout: 120000, polling: 500 });
  const out = await page.evaluate(() => {
    const s = a => ({ n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(3), max: +Math.max(0, ...a).toFixed(3) });
    const P = window.__fogProf;
    const b = window.__bench;
    return { tick: s(P.tick), cull: s(P.cull), tex: s(P.tex), mem: s(P.mem), update: s(P.upd), fps: b.fps, gmUpdate: b.gameUpdateMs,
      quality: window.game.quality?.name, texSize: window.game.gameManager.fogOfWar.fogTexture.image.width };
  });
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
