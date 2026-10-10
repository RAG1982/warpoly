#!/usr/bin/env node
/**
 * F7-00b (arte B) — capturas de revisão: bétula, Olho Vigia (tentáculos articulados), Ogro Feiticeiro (colar), Templário
 * (sol no escudo e no peitoral), Estábulo (cavalos de peito para cima), no inspetor e no jogo (com `?texq=low`).
 * GPU real obrigatória (`assertHardwareGpu`). Rode SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/art-b/capture.mjs
 * Sobe o Vite na porta 5293 (`PORT_VITE`) e encerra no `finally`. `ONLY=insp|game` limita; saída em tools/ui-captures/art-b/.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5293);
const ONLY = process.env.ONLY || '';
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;
const errors = [];

async function openPage() {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  console.log('GPU', await assertHardwareGpu(page));
  return page;
}
async function closeBrowser() { if (browser) await browser.close().catch(() => {}); browser = null; }

/** Abre o inspetor no modelo/animação e (opcional) reposiciona a câmera: cam = { pos: [x,y,z], target: [x,y,z] }. */
async function inspect(page, model, file, { anim = 'idle', time = null, cam = null, wait = 1500 } = {}) {
  const q = `/inspector.html?model=${model}&light=day&anim=${anim}${time != null ? `&time=${time}` : ''}&texq=low`;
  await page.goto(base + q, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction('window.inspectorApp && window.inspectorApp.currentModelObject', null, { timeout: 90000 });
  await page.waitForTimeout(wait);
  if (time != null) await page.evaluate((t) => { const a = window.inspectorApp.animator; if (a) { a.pause(); a.setTime(t); } }, time);
  if (cam) {
    await page.evaluate(({ pos, target }) => {
      const app = window.inspectorApp;
      app.camera.position.set(...pos);
      app.controls.target.set(...target);
      app.controls.update();
    }, cam);
  }
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    let meshes = 0; let tris = 0;
    window.inspectorApp.currentModelObject.traverse((o) => {
      if (o.isMesh && o.visible) { meshes++; const g = o.geometry; tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3; }
    });
    return { meshes, tris: Math.round(tris) };
  });
  await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `${file}.png`) });
  console.log(file, JSON.stringify(info));
}

try {
  if (!ONLY || ONLY === 'insp') {
    const page = await openPage();
    await inspect(page, 'tree_birch_glb', '01-betula-inspetor');
    await inspect(page, 'tree_birch_glb', '02-betula-tronco', { cam: { pos: [1.6, 2.2, 3.0], target: [0.1, 1.6, 0] } });
    await inspect(page, 'watching_eye_glb', '03-olho-idle', { anim: 'idle', time: 0.5 });
    await inspect(page, 'watching_eye_glb', '04-olho-walk-a', { anim: 'walk', time: 0.2 });
    await inspect(page, 'watching_eye_glb', '05-olho-walk-b', { anim: 'walk', time: 0.6 });
    await inspect(page, 'ogre_mage_glb', '06-ogro-feiticeiro');
    await inspect(page, 'ogre_mage_glb', '07-ogro-feiticeiro-peito', { cam: { pos: [1.6, 3.3, 4.6], target: [0, 2.6, 0.3] } });
    await inspect(page, 'templar_glb', '08-templario');
    await inspect(page, 'templar_glb', '09-templario-frente', { cam: { pos: [0.3, 3.6, 5.8], target: [0, 1.8, 0.4] } });
    await inspect(page, 'stable_glb', '10-estabulo', { cam: { pos: [3.5, 5.0, 12.5], target: [0, 2.2, 0] } });
    await inspect(page, 'stable_glb', '11-estabulo-baias', { cam: { pos: [0, 3.4, 7.5], target: [0, 2.3, 1.2] } });
    await closeBrowser();
  }

  if (!ONLY || ONLY === 'game') {
    for (const faction of ['human', 'orc']) {
      const page = await openPage();
      await page.goto(`${base}/?skipPreload&texq=low&play&faction=${faction}`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForFunction('window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0', null, { timeout: 90000 });
      await page.waitForTimeout(1500);
      const res = await page.evaluate((fac) => {
        const gm = window.game.gameManager;
        gm.fogOfWar.setEnabled(false);
        const id = gm.localPlayerId;
        const p = gm.getPlayer(id);
        p.resources.gold = 5000; p.resources.wood = 5000; p.resources.stone = 5000; p.maxPopulation = 100;
        const hq = gm.buildings.find((b) => b.ownerId === id && b.role === 'hq');
        hq.tier = 3;
        const hp = hq.mesh.position;
        const out = { hq: { x: hp.x, z: hp.z } };
        if (fac === 'human') {
          const mk = (type, x, z) => { const b = gm.createBuilding(type, x, z, true, id); gm.buildings.push(b); return b; };
          const st = mk('stable', hp.x + 15, hp.z + 4);
          const us = ['templar', 'cavalier'].map((t, i) => gm.spawnUnit(t, st.mesh.position.x - 6 + i * 3, st.mesh.position.z + 9, id));
          window.__cap = { st, us };
        } else {
          const us = ['ogre_mage', 'ogre', 'watching_eye'].map((t, i) => gm.spawnUnit(t, hp.x - 14 + i * 3, hp.z + 10, id));
          if (us[2].orderMove) us[2].orderMove({ x: hp.x - 4, y: 0, z: hp.z + 18 });
          window.__cap = { us };
        }
        out.trees = (gm.trees || []).reduce((acc, t) => { acc[t.treeType] = (acc[t.treeType] || 0) + 1; return acc; }, {});
        return out;
      }, faction);
      console.log(faction, JSON.stringify(res));
      const look = async (x, z, zoom, wait = 1500) => {
        await page.evaluate(([x, z, zm]) => {
          const sm = window.game.gameManager.sceneManager;
          sm.cameraTarget.set(x, 2.0, z);
          sm.targetZoomLevel = zm;
        }, [x, z, zoom]);
        await page.waitForTimeout(wait);
      };
      if (faction === 'human') {
        // bosque de bétulas do mapa-base (continental-1v1: (28, 26) e (-28, -26)), com a névoa desligada
        await look(28, 26, 0.55);
        await page.screenshot({ path: path.join(OUT, '12-jogo-betulas.png') });
        await look(28, 26, 0.28);
        await page.screenshot({ path: path.join(OUT, '13-jogo-betulas-perto.png') });
        const st = await page.evaluate(() => { const s = window.__cap.st.mesh.position; return { x: s.x, z: s.z }; });
        await look(st.x, st.z + 3, 0.34);
        await page.screenshot({ path: path.join(OUT, '14-jogo-estabulo.png') });
        const u = await page.evaluate(() => { const m = window.__cap.us[0].mesh.position; return { x: m.x, z: m.z }; });
        await look(u.x + 1.5, u.z, 0.22);
        await page.screenshot({ path: path.join(OUT, '15-jogo-templario.png') });
      } else {
        const u = await page.evaluate(() => { const m = window.__cap.us[0].mesh.position; return { x: m.x, z: m.z }; });
        await look(u.x + 3, u.z, 0.3);
        await page.screenshot({ path: path.join(OUT, '16-jogo-ogro-feiticeiro-olho.png') });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, '17-jogo-olho-vigia-andando.png') });
      }
      await closeBrowser();
    }
  }
  if (ONLY === 'reeds') {
    // plantas aquáticas (Water.createReeds): ONLY=reeds SUFFIX=antes|depois (o antes exige o Water.js antigo no lugar)
    const suffix = process.env.SUFFIX || 'depois';
    const page = await openPage();
    await page.goto(`${base}/?skipPreload&texq=low&play`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction('window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0', null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(false); });
    for (const [name, x, z, zoom] of [['juncos-largo', 11, 13.5, 0.5], ['juncos-perto', 11.2, 13.8, 0.22], ['juncos-2', -11, -13.5, 0.3]]) {
      await page.evaluate(([x, z, zm]) => {
        const sm = window.game.gameManager.sceneManager;
        sm.cameraTarget.set(x, 1.0, z);
        sm.targetZoomLevel = zm;
      }, [x, z, zoom]);
      await page.waitForTimeout(1800);
      const info = await page.evaluate(() => { const r = window.game.sceneManager.renderer; return { calls: r.info.render.calls, tris: r.info.render.triangles }; });
      console.log(name, suffix, JSON.stringify(info));
      await page.screenshot({ path: path.join(OUT, `18-jogo-${name}-${suffix}.png`) });
    }
    await closeBrowser();
  }
  console.log('erros de página/console:', errors.length ? errors.join(' | ') : 'nenhum');
} finally {
  await closeBrowser();
  await vite.close();
}
