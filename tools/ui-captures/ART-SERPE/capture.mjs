#!/usr/bin/env node
/**
 * Serpe de Guerra v2 (ART-SERPE) no inspetor e no jogo. Só captura e mede; não altera src/ nem tests/.
 *  Inspetor: idle (3 quadros do pairar), walk (voo), fight (golpe), die (queda), modelo antigo ao lado para comparar.
 *  Jogo: grifos avançando e atacando (ataque-mover), vista aproximada em voo e a morte de um deles.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/ART-SERPE/capture.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5394;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(HERE, name) });

let vite = null;
let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const base = `http://127.0.0.1:${PORT}`;

  // ---------------- inspetor ----------------
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    await assertHardwareGpu(page);
    await page.goto(`${base}/inspector.html?model=war_serpent_v2_glb&light=day&texq=low`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => {
      const a = window.inspectorApp;
      if (!a || !a.currentModelObject || !a.animator) return false;
      let n = 0;
      a.currentModelObject.traverse((o) => { if (o.isMesh) n++; });
      return n > 3;
    }, null, { timeout: 90000, polling: 300 });
    await sleep(1500);
    const info = await page.evaluate(() => {
      const a = window.inspectorApp;
      let tris = 0; const mats = new Set(); let meshes = 0;
      a.currentModelObject.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid));
      });
      const names = []; a.currentModelObject.traverse((o) => names.push(o.name));
      return { id: a.currentModelItem.id, meshes, tris: Math.round(tris), materials: mats.size, hasTips: names.includes('WingTipL'), hasTail: names.includes('Tail'), hasTailTip: names.includes('TailTip') };
    });
    console.log('inspetor', JSON.stringify(info));
    const pose = async (anim, t, name) => {
      await page.evaluate(([anim, t]) => {
        const a = window.inspectorApp;
        a.setUnitAnimation(anim);
        a.animator.pause();
        a.animator._blendT = 99;
        a.animator.setTime(t);
      }, [anim, t]);
      await sleep(350);
      await shot(page, name);
    };
    await pose('idle', 0.0, 'insp-idle-0.png');
    await pose('idle', 0.5, 'insp-idle-1.png');
    await pose('idle', 1.0, 'insp-idle-2.png');
    await pose('walk', 0.1, 'insp-voo-a.png');
    await pose('walk', 0.3, 'insp-voo-b.png');
    await pose('fight', 0.3, 'insp-ataque-a.png');
    await pose('fight', 0.6, 'insp-ataque-b.png');
    await pose('die', 0.4, 'insp-morte-a.png');
    await pose('die', 0.9, 'insp-morte-b.png');
    await pose('die', 1.4, 'insp-morte-c.png');
    await page.evaluate(() => window.inspectorApp.selectModel('war_serpent_glb'));
    await sleep(2500);
    await shot(page, 'insp-antigo.png');
    await page.close();
  }

  // ---------------- jogo ----------------
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
    await page.goto(`${base}/?skipPreload&texq=low&play&debug`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
    await assertHardwareGpu(page);
    await sleep(2500);
    const info = await page.evaluate(async () => {
      const gm = window.game.gameManager;
      // espera o .glb v2 (a fábrica cai no procedural/antigo se ele ainda não carregou)
      const glbs = await import('/src/entities/glbModels.js');
      await glbs.ensureGlbKeys(['war_serpent_v2']);
      const hq = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
      const x0 = hq.mesh.position.x - 6;
      const z0 = hq.mesh.position.z - 26;
      const grif = [0, 1, 2].map((i) => gm.spawnUnit('war_serpent', x0 - 10 + i * 6, z0 + 14, 0));
      const alvos = [0, 1, 2].map((i) => gm.spawnUnit('ogre', x0 + 2 + i * 2.2, z0, 1));
      gm.issue({ type: 'attackMove', playerId: 0, unitIds: grif.map((u) => u.id), x: x0 + 4, z: z0 + 2 });
      gm.sceneManager.cameraTarget.set(x0 - 3, 0, z0 + 8);
      gm.sceneManager.targetZoomLevel = 0.45;
      window.__t = { grif, alvos };
      const m = grif[0].mesh;
      await new Promise((r) => setTimeout(r, 400));
      return { v2: !!gm.sceneManager.scene.getObjectByName('WingTipL'), flyY: m.position.y };
    });
    console.log('jogo', JSON.stringify(info));
    const follow = (i, zoom = 0.3) => page.evaluate(([i, zoom]) => {
      const u = window.__t.grif[i];
      const sm = window.game.sceneManager;
      sm.cameraTarget.set(u.mesh.position.x, u.mesh.position.y, u.mesh.position.z);
      sm.targetZoomLevel = zoom;
    }, [i, zoom]);
    await follow(1, 0.35);
    await sleep(1200);
    await shot(page, 'jogo-voo-1.png');
    await follow(1, 0.3);
    await sleep(1500);
    await shot(page, 'jogo-voo-2.png');
    await follow(2, 0.3);
    await sleep(3200);
    await follow(2, 0.3);
    await sleep(300);
    await shot(page, 'jogo-ataque.png');
    await follow(0, 0.25);
    await sleep(500);
    // morte de um grifo
    await page.evaluate(() => {
      const u = window.__t.grif[0];
      window.__t.vitima = u;
      u.takeDamage(99999, window.__t.alvos[0]);
    });
    await sleep(350);
    await shot(page, 'jogo-morte-1.png');
    await sleep(450);
    await shot(page, 'jogo-morte-2.png');
    await sleep(500);
    await shot(page, 'jogo-morte-3.png');
    const res = await page.evaluate(() => ({
      hp: window.__t.grif.map((u) => Math.round(u.hp)),
      calls: window.game.sceneManager.renderer.info.render.calls,
      tris: window.game.sceneManager.renderer.info.render.triangles
    }));
    console.log('resultado', JSON.stringify(res));
    await page.close();
  }
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros de pagina/console');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
