#!/usr/bin/env node
/**
 * M2-12/14/15/17 — captura e medição dos props .glb de bioma (`PROP_RULES`) no jogo.
 *
 * NÃO rode direto: `bash tools/safe-run.sh --timeout 400 -- node tools/m2-props-capture.mjs <mapId> <chave[,chave...]> [prefixo]`
 * (GPU real; usa tools/lib/assertGpu.mjs). Sobe o próprio Vite em 127.0.0.1:5311 (strictPort), abre a partida, reinicia pelo mapa
 * pedido, confere que os props foram colocados (`session.decorations.propPlan`) e, por chave: aponta a câmera para uma instância,
 * capta (zoom do jogo e zoom aproximado) e mede os draw calls com e sem a malha do prop (delta).
 * Saída: tools/ui-captures/m2-props/<prefixo>-<chave>[-perto].jpg e <prefixo>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const [mapId, keysArg, prefixArg] = process.argv.slice(2);
if (!mapId || !keysArg) {
  console.error('uso: m2-props-capture.mjs <mapId> <chave[,chave...]> [prefixo]');
  process.exit(2);
}
const KEYS = keysArg.split(',');
const PREFIX = prefixArg || mapId;
const PORT = 5311;
const OUT = 'tools/ui-captures/m2-props';
mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage'];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser = null;
const result = { when: new Date().toISOString(), mapId, perProp: {} };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || /\[glbModels\]|erro ao carregar/.test(m.text())) errors.push(m.text()); });
  await page.goto('about:blank');
  result.gpu = await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const inGame = () => page.waitForFunction(() => window.game && window.game.fsm && window.game.fsm.is('InGame') && window.game.session, null, { timeout: 120000, polling: 500 });
  await inGame();
  await page.evaluate((id) => {
    window.game.fsm.transition('Paused');
    window.game.fsm.transition('Loading', { config: { ...window.game.matchConfig, mapId: id } });
  }, mapId);
  await page.waitForTimeout(2000);
  await inGame();
  result.mapIdAtivo = await page.evaluate(() => window.game.matchConfig.mapId);
  await page.evaluate(() => {
    if (window.game.gameManager.aiDirector) window.game.gameManager.aiDirector.update = () => {};
    window.game.gameManager.fogOfWar.setEnabled(false);
  });

  const measure = (frames = 40) => page.evaluate(async (n) => {
    const r = window.game.sceneManager.renderer;
    let acc = 0, cnt = 0, frameCalls = 0, tris = 0;
    const orig = r.render.bind(r);
    r.render = (...a) => { orig(...a); frameCalls += r.info.render.calls; tris += r.info.render.triangles; };
    await new Promise((res) => {
      const tick = () => {
        if (cnt > 0) acc += frameCalls;
        frameCalls = 0;
        if (++cnt > n) { r.render = orig; res(); } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return Math.round(acc / n);
  }, frames);

  const plan = await page.evaluate(() => {
    const d = window.game.session.decorations;
    const p = d.propPlan || {};
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { count: v.length, first: v.slice(0, 3) }]));
  });
  result.plan = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.count]));
  result.meshesNoJogo = await page.evaluate(() => (window.game.session.decorations.propMeshes || []).map((m) => `${m.name}:${m.count}`));

  for (const key of KEYS) {
    const p = plan[key];
    if (!p) { result.perProp[key] = { colocado: false }; continue; }
    // escolhe a instância mais "central" entre as 3 primeiras (a primeira basta; as demais só como reserva)
    const at = p.first[0];
    const shot = async (zoom, suffix) => {
      await page.evaluate(({ x, y, z, zoom }) => {
        const sm = window.game.sceneManager;
        sm.cameraTarget.set(x, y, z);
        if (zoom != null) sm.zoomLevel = sm.targetZoomLevel = zoom;
        sm.updateCamera(0);
      }, { ...at, zoom });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${PREFIX}-${key}${suffix}.jpg`, type: 'jpeg', quality: 88 });
    };
    await shot(null, '');
    // "perto": zoom aproximado e SEM árvores (que escondem o prop na floresta); as demais decorações ficam
    await page.evaluate(() => { const tm = window.game.session.entityViews.treeManager; window.__hid = [...tm.instancedMeshes, ...tm.lodMeshes].filter((m) => m.visible); window.__hid.forEach((m) => { m.visible = false; }); });
    await shot(0.6, '-perto');
    await page.evaluate(() => { (window.__hid || []).forEach((m) => { m.visible = true; }); });
    const withP = await measure();
    await page.evaluate((k) => { for (const m of window.game.session.decorations.propMeshes) if (m.name === `InstancedProp_${k}`) m.visible = false; }, key);
    const without = await measure();
    await page.evaluate((k) => { for (const m of window.game.session.decorations.propMeshes) if (m.name === `InstancedProp_${k}`) m.visible = true; }, key);
    result.perProp[key] = { colocado: true, instancias: p.count, drawCallsCom: withP, drawCallsSem: without, delta: withP - without };
  }
  result.drawCallsTotal = await measure();
  result.errors = errors;
} catch (err) {
  result.fatal = String(err && err.stack || err);
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}/${PREFIX}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
