#!/usr/bin/env node
/**
 * Escala dos orcs (Guerreiro, Lanceiro-Machado e Peão lado a lado) (partida orc; um Guerreiro e um Lanceiro-Machado criados ao lado do Salão). Só mede e captura.
 *  C1  as views usam o grunt_v2 (Weapon filho de ArmR; animador `grunt`).
 *  C2  poses idle/walk/fight: as partes mexem e o machado não entra no chão.   C3  sem pageerror/console.error.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/orc-escala/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5538;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = []; let bad = false;
function rec(id, name, ok, d = '') { if (!ok) bad = true; console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${d}`); }
let vite = null; let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1&faction=orc`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(1500);
  const r = await page.evaluate(async () => {
    const gm = window.game.gameManager; const sm = window.game.sceneManager;
    gm.aiDirectors.forEach((d) => { d.update = () => {}; });
    const hq = gm.buildings.find((x) => x.ownerId === gm.localPlayerId && x.role === 'hq');
    const spot = { x: hq.mesh.position.x + 9, z: hq.mesh.position.z + 9 };
    const a = gm.spawnUnit('grunt', spot.x, spot.z, gm.localPlayerId);
    const b = gm.spawnUnit('axethrower', spot.x + 3, spot.z, gm.localPlayerId);
    gm.spawnUnit('peon', spot.x + 6, spot.z, gm.localPlayerId);
    sm.cameraTarget.set(spot.x + 3, 1.4, spot.z); sm.targetZoomLevel = 0.3; sm.zoomLevel = 0.3;
    let va = null; let vb = null;
    for (let i = 0; i < 40 && !(va && vb); i++) { await new Promise((res) => setTimeout(res, 250)); va = gm.entityViews.viewOf(a); vb = gm.entityViews.viewOf(b); }
    await new Promise((res) => setTimeout(res, 1200));
    const info = (v) => { const w = v.root.getObjectByName('Weapon'); return { unitType: v.animator.unitType, weaponParent: w && w.parent ? w.parent.name : null, hasV2: !!v.root.getObjectByName('Grunt') }; };
    const an = va.animator; const out = {};
    for (const [anim, t] of [['walk', 0.2], ['fight', 0.3], ['fight', 0.5]]) {
      an.setAnimation(anim, true); an.pause(); an.setTime(t, false);
      const P = an.meshParts; va.root.updateMatrixWorld(true);
      const V = va.root.position.constructor; const base = new V(); va.root.getWorldPosition(base);
      let minY = 1e9; const tmp = new V();
      P.weapon.traverse((c) => { if (c.isMesh && c.geometry) { const pos = c.geometry.attributes.position; for (let i = 0; i < pos.count; i += 5) { tmp.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld); minY = Math.min(minY, tmp.y - base.y); } } });
      out[anim + t] = { armR: P.armR.rotation.x, legL: P.legL.rotation.x, minY };
    }
    an.setAnimation('idle', true); an.play();
    return { a: info(va), b: info(vb), out };
  });
  rec('C1', 'grunt usa o v2 (Weapon filho de ArmR; animador grunt)', r.a.hasV2 && r.a.weaponParent === 'ArmR' && r.a.unitType === 'grunt', JSON.stringify({ a: r.a, b: r.b }));
  rec('C2', 'walk/fight mexem braço/perna; o machado não entra no chão', Math.abs(r.out['walk0.2'].legL) > 0.1 && Object.values(r.out).every((o) => o.minY >= -0.1), JSON.stringify(r.out));
  await page.screenshot({ path: path.join(HERE, 'game-orcs-escala.png') });
} catch (e) { console.error('ERRO fatal:', e); bad = true; } finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const real = errors.filter((e) => !/deprec/i.test(e));
rec('C3', 'sem pageerror nem console.error', real.length === 0, real.slice(0, 3).join(' | '));
process.exitCode = bad ? 1 : 0;
