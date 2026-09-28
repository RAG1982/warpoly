// F1-04 — medição por preset. Rodar sob tools/safe-run.sh com vite na porta desejada:
//   node tools/shadow-compare/measure.mjs http://localhost:5179 after tools/shadow-compare low med high ultra
import fs from 'fs';
import { withBrowser } from './common.mjs';

const [base, label, outDir, ...presetsArg] = process.argv.slice(2);
const presets = presetsArg.length ? presetsArg : ['low', 'med', 'high', 'ultra'];

async function sample(page, ms) {
  return page.evaluate(async (ms) => {
    const sm = window.game.sceneManager;
    const r = sm.renderer;
    const shadowMap = r.shadowMap;
    let frames = 0, calls = 0, tris = 0, sCalls = 0, sTris = 0, sFrames = 0;
    const origShadow = shadowMap.render;
    shadowMap.render = function (...a) {
      const c0 = r.info.render.calls, t0 = r.info.render.triangles;
      origShadow.apply(this, a);
      const dc = r.info.render.calls - c0;
      if (dc > 0) { sCalls += dc; sTris += r.info.render.triangles - t0; sFrames++; }
    };
    const origRender = r.render;
    r.render = function (...a) {
      origRender.apply(this, a);
      frames++; calls += r.info.render.calls; tris += r.info.render.triangles;
    };
    const t0 = performance.now();
    await new Promise(res => setTimeout(res, ms));
    const dt = performance.now() - t0;
    shadowMap.render = origShadow;
    r.render = origRender;
    let meshes = 0, cast = 0, receive = 0;
    sm.scene.traverse(o => { if (o.isMesh) { meshes++; if (o.castShadow) cast++; if (o.receiveShadow) receive++; } });
    return {
      fps: +(frames * 1000 / dt).toFixed(1),
      callsPerFrame: Math.round(calls / frames),
      shadowCallsPerPass: sFrames ? Math.round(sCalls / sFrames) : 0,
      shadowPassesPerFrame: +(sFrames / frames).toFixed(2),
      trisPerFrame: Math.round(tris / frames),
      shadowTrisPerPass: sFrames ? Math.round(sTris / sFrames) : 0,
      meshes, cast, receive,
      pixelRatio: r.getPixelRatio(),
      mapSize: sm.sunLight.shadow.mapSize.x,
      shadowExtent: sm.sunLight.shadow.camera.right
    };
  }, ms);
}

const results = [];
await withBrowser(async (browser) => {
  for (const preset of presets) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      page.on('requestfailed', q => errors.push('failed ' + q.url()));
      page.on('response', resp => { if (resp.status() >= 400) errors.push(`${resp.status()} ${resp.url()}`); });
      await page.goto(`${base}/?skipPreload&quality=${preset}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.game && window.game.sceneManager, null, { timeout: 90000 });
      await page.waitForTimeout(2500);
      const gpu = await page.evaluate(() => {
        const gl = window.game.sceneManager.renderer.getContext();
        const d = gl.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '';
      });
      await page.screenshot({ path: `${outDir}/${label}-${preset}.png` });
      const initial = await sample(page, 3000);
      await page.evaluate(() => { window.game.sceneManager.targetZoomLevel = window.game.sceneManager.maxZoom; });
      await page.waitForTimeout(1200);
      const zoomOut = await sample(page, 3000);
      const quality = await page.evaluate(() => window.game.quality ? window.game.quality.name : null);
      const r = { label, preset, gpu, quality, initial, zoomOut, errors };
      results.push(r);
      console.log(JSON.stringify(r));
    } finally {
      await page.close().catch(() => {});
    }
  }
});
fs.writeFileSync(`${outDir}/${label}-results.json`, JSON.stringify(results, null, 2));
