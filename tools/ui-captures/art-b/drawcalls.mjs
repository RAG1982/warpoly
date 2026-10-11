#!/usr/bin/env node
/**
 * F7-00b (arte B) — de onde vêm os draw calls da cena inicial. Abre o jogo (`?skipPreload&texq=low`, câmera do bench `inicial`),
 * agrupa os filhos diretos da cena e mede, para cada grupo, quantas chamadas somem ao escondê-lo (`renderer.info.render.calls`,
 * que soma o passe principal e o de sombras). Também mede com as sombras desligadas.
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/art-b/drawcalls.mjs [query extra, ex.: glb=0]
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const PORT = Number(process.env.PORT_VITE || 5294);
const EXTRA = process.argv[2] ? `&${process.argv[2]}` : '';
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048']
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  console.log('GPU', await assertHardwareGpu(page));
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play${EXTRA}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0', null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const res = await page.evaluate(() => {
    const sm = window.game.sceneManager;
    const { renderer, scene, camera } = sm;
    const gm = window.game.gameManager;
    gm.sceneManager.cameraTarget.set(32, 2.5, -30);
    gm.sceneManager.targetZoomLevel = 1.0;
    const measure = () => { renderer.render(scene, camera); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
    const out = { total: measure() };
    // grupos: filhos diretos da cena, por tipo/nome
    const groups = new Map();
    for (const ch of scene.children) {
      let n = 0; let meshes = 0; let inst = 0; let casters = 0;
      ch.traverse((o) => {
        n++;
        if (o.isMesh || o.isLine || o.isPoints || o.isSprite) { meshes++; if (o.isInstancedMesh) inst++; if (o.castShadow) casters++; }
      });
      const key = `${ch.constructor.name}:${ch.name || (ch.userData && ch.userData.entity ? 'entity:' + (ch.userData.entity.type || '') : '')}`;
      const g = groups.get(key) || { key, count: 0, objs: 0, meshes: 0, inst: 0, casters: 0, items: [] };
      g.count++; g.objs += n; g.meshes += meshes; g.inst += inst; g.casters += casters; g.items.push(ch);
      groups.set(key, g);
    }
    const rows = [];
    for (const g of groups.values()) {
      const prev = g.items.map((o) => o.visible);
      g.items.forEach((o) => { o.visible = false; });
      const m = measure();
      g.items.forEach((o, i) => { o.visible = prev[i]; });
      rows.push({ grupo: g.key, filhos: g.count, objs: g.objs, malhas: g.meshes, inst: g.inst, casters: g.casters, deltaCalls: out.total.calls - m.calls, deltaTris: out.total.tris - m.tris });
    }
    rows.sort((a, b) => b.deltaCalls - a.deltaCalls);
    out.rows = rows.slice(0, 40);
    // sombras desligadas
    const sunLights = [];
    scene.traverse((o) => { if (o.isLight && o.castShadow) sunLights.push(o); });
    sunLights.forEach((l) => { l.castShadow = false; });
    out.noShadowLights = sunLights.length;
    out.noShadow = measure();
    sunLights.forEach((l) => { l.castShadow = true; });
    out.noShadowMap = (() => { const e = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false; const m = measure(); renderer.shadowMap.enabled = e; return m; })();
    out.sceneChildren = scene.children.length;
    out.quality = sm.quality ? { shadows: sm.quality.shadows, shadowSize: sm.quality.shadowMapSize } : null;
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  console.log('erros:', errs.length ? errs.join(' | ') : 'nenhum');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
