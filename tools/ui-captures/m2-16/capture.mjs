#!/usr/bin/env node
/**
 * M2-16/M2-18 — capturas antes/depois e FPS/draw calls da água, costa e efeitos ambientais.
 *   bash tools/safe-run.sh --timeout 900 -- node tools/ui-captures/m2-16/capture.mjs <rótulo> [mapa,mapa...]
 * Rode no worktree da tarefa ("depois") e num worktree do master ("antes") com saída no mesmo diretório (M216_OUT): os pontos de
 * foco são sorteados da altura do terreno (iguais nos dois) e gravados em focus.json pelo primeiro que rodar. Porta 5321 (strictPort).
 * GPU real obrigatória. Variáveis: M216_PORT, M216_OUT, M216_QUERY (ex.: "&vfx=off"), M216_FX=1 (vistas de efeitos: foco nas fontes).
 * Saída: <mapa>-<rótulo>-<n>.jpg e resultado-<rótulo>.json
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const LABEL = process.argv[2] || 'depois';
const MAPS = (process.argv[3] || 'camp-04-baixio-do-breu,camp-07-brejo-mudo,camp-09-miragem,camp-06-a-geada,camp-08-fornalha').split(',');
const PORT = Number(process.env.M216_PORT || 5321);
const OUT = process.env.M216_OUT || HERE;
const FOCUS = path.join(OUT, 'focus.json');
const EXTRA = process.env.M216_QUERY || '';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage', '--disable-extensions'];

if (process.env.M216_UNCAP) ARGS.push('--disable-frame-rate-limit', '--disable-gpu-vsync'); // FPS sem teto de 60 (medição)

const focusDb = fs.existsSync(FOCUS) ? JSON.parse(fs.readFileSync(FOCUS, 'utf8')) : {};
const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser = null;
const result = { when: new Date().toISOString(), label: LABEL, maps: {} };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('about:blank');
  result.gpu = await assertHardwareGpu(page);
  for (const map of MAPS) {
    await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=${process.env.M216_TEXQ || 'low'}&map=${map}${EXTRA}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.game && window.game.fsm && window.game.fsm.is('InGame') && window.game.session, null, { timeout: 180000, polling: 500 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const gm = window.game.gameManager; if (gm.aiDirector) gm.aiDirector.update = () => {}; gm.fogOfWar.setEnabled(false); });
    if (!focusDb[map]) {
      focusDb[map] = await page.evaluate(() => {
        const t = window.game.session.terrain; const half = (t.mapDef.playable || t.mapDef.size - 8) / 2 - 8;
        const wl = 0.5, cand = [];
        for (let x = -half; x <= half; x += 3) for (let z = -half; z <= half; z += 3) {
          const h = t.getHeight(x, z);
          if (h < 0.55 || h > 0.85) continue;
          let wet = 0; for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (t.getHeight(x + dx, z + dz) < wl - 0.1) wet++;
          if (wet >= 1 && wet <= 2) cand.push([x, z]);
        }
        cand.sort((a, b) => (a[0] * 1.3 + a[1]) - (b[0] * 1.3 + b[1]));
        const pick = (f) => cand[Math.floor((cand.length - 1) * f)] || [0, 0];
        return { coast: [pick(0.2), pick(0.5), pick(0.8)], n: cand.length };
      });
      fs.writeFileSync(FOCUS, JSON.stringify(focusDb, null, 1));
    }
    const info = { errors: [], views: [] };
    let views = focusDb[map].coast;
    if (process.env.M216_FX) { // vistas de efeitos: o modo "fx" pergunta à própria página onde ficam as fontes (se o build as tiver)
      const src = await page.evaluate(() => (window.game.session.ambientFx && window.game.session.ambientFx.focusPoints) ? window.game.session.ambientFx.focusPoints(3) : null);
      if (src && src.length) views = src;
    }
    for (let i = 0; i < views.length; i++) {
      const [x, z] = views[i];
      await page.evaluate(([x, z]) => { const sm = window.game.sceneManager; sm.cameraTarget.set(x, 0.6, z); sm.updateCamera(0); }, [x, z]);
      await page.waitForTimeout(1500);
      if (i === 0) {
        info.perf = await page.evaluate(async () => {
          const r = window.game.sceneManager.renderer;
          const fps = await new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 >= 4000) res(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
          return { fps: Math.round(fps * 10) / 10, calls: r.info.render.calls, tris: r.info.render.triangles };
        });
      }
      const file = `${map}-${LABEL}-${i + 1}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 85 });
      info.views.push(file);
    }
    info.errors = errors.splice(0);
    result.maps[map] = info;
    console.log(map, JSON.stringify(info.perf), info.errors.length ? 'ERROS ' + info.errors[0] : '');
  }
} finally {
  fs.writeFileSync(path.join(OUT, `resultado-${LABEL}.json`), JSON.stringify(result, null, 1));
  if (browser) await browser.close();
  await vite.close();
}
