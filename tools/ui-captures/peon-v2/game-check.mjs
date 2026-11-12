#!/usr/bin/env node
/**
 * Lacaio orc v2 (peon_v2) no jogo. Só mede e captura; não altera src/ nem tests/.
 *  C1  o Lacaio do jogador usa o peon_v2 (ToolGroup é malha filha de ArmR; sem Axe/Pickaxe/Hammer); animador `peon`.
 *  C2  poses idle/walk/fight/gather: as partes mexem; a picareta não entra no chão e a empunhadura fica presa ao ArmR.
 *  C3  erros de página e de console.
 * Capturas: game-*.png nesta pasta.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/peon-v2/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5533;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const rows = [];
function rec(id, name, ok, detail = '') { rows.push({ id, name, ok }); console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`); }

async function shotUnit(page, uid, name, size = 360) {
  const c = await page.evaluate((uid) => {
    const gm = window.game.gameManager; const sm = window.game.sceneManager;
    const u = gm.entitiesById.get(uid);
    const v = sm.camera.position.clone().set(u.mesh.position.x, 1.7, u.mesh.position.z).project(sm.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, w: innerWidth, h: innerHeight };
  }, uid);
  const x = Math.max(0, Math.min(c.w - size, Math.round(c.x - size / 2)));
  const y = Math.max(0, Math.min(c.h - size, Math.round(c.y - size / 2)));
  await page.screenshot({ path: path.join(HERE, name), clip: { x, y, width: size, height: size } });
}

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
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  const spawn = await page.evaluate(async () => {
    const gm = window.game.gameManager; const sm = window.game.sceneManager;
    const u = gm.allUnits.find((x) => x.type === 'peon' && x.ownerId === gm.localPlayerId);
    if (!u) return { error: 'sem Lacaio do jogador' };
    const view = gm.entityViews.viewOf(u);
    const tg = view.root.getObjectByName('ToolGroup');
    sm.cameraTarget.set(u.mesh.position.x, 1.2, u.mesh.position.z);
    sm.targetZoomLevel = 0.5; sm.zoomLevel = 0.5; sm.cameraTarget.y = 0; 
    return { id: u.id, unitType: view.animator.unitType, toolIsMesh: !!(tg && tg.isMesh), toolParent: tg && tg.parent ? tg.parent.name : null,
      legacy: ['Axe', 'Pickaxe', 'Hammer'].filter((n) => view.root.getObjectByName(n)), root: view.root.name };
  });
  if (spawn.error) { rec('C1', 'Lacaio do jogador', false, spawn.error); } else {
    rec('C1', 'Lacaio do jogo é o v2 (ToolGroup malha filha de ArmR, sem Axe/Pickaxe/Hammer; animador peon)',
      spawn.toolIsMesh && spawn.toolParent === 'ArmR' && spawn.legacy.length === 0 && spawn.unitType === 'peon', JSON.stringify(spawn));
    await sleep(1200);
    const id = spawn.id;
    await shotUnit(page, id, 'game-idle.png');
    const out = {};
    for (const [anim, t] of [['walk', 0.2], ['fight', 0.5], ['gather', 0.3]]) {
      const r = await page.evaluate(async ([uid, anim, t]) => {
        const gm = window.game.gameManager;
        const view = gm.entityViews.viewOf(gm.entitiesById.get(uid)); const an = view.animator;
        an.setAnimation(anim, true); an.pause(); an.setTime(t, false);
        const P = an.meshParts; view.root.updateMatrixWorld(true);
        const V = view.root.position.constructor;
        const base = new V(); view.root.getWorldPosition(base);
        let minY = 1e9; const tmp = new V(); const pos = P.toolGroup.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 7) { tmp.fromBufferAttribute(pos, i).applyMatrix4(P.toolGroup.matrixWorld); minY = Math.min(minY, tmp.y - base.y); }
        return { armR: P.armR.rotation.x, legL: P.legL.rotation.x, minY };
      }, [id, anim, t]);
      out[anim] = r;
      await shotUnit(page, id, `game-${anim}.png`);
    }
    await page.evaluate((uid) => { const an = window.game.gameManager.entityViews.viewOf(window.game.gameManager.entitiesById.get(uid)).animator; an.setAnimation('idle', true); an.play(); }, id);
    // ao vivo: cortar madeira (andar -> gather), com a câmera de lado em relação à árvore
    const live = await page.evaluate((uid) => {
      const gm = window.game.gameManager; const u = gm.entitiesById.get(uid);
      const tree = gm.trees.filter((x) => !x.isDead).sort((a, b) =>
        Math.hypot(a.mesh.position.x - u.mesh.position.x, a.mesh.position.z - u.mesh.position.z) -
        Math.hypot(b.mesh.position.x - u.mesh.position.x, b.mesh.position.z - u.mesh.position.z))[0];
      if (!tree) return { error: 'sem árvore' };
      u.orderGather(tree);
      return { x: tree.mesh.position.x, z: tree.mesh.position.z };
    }, id);
    const follow = (zoom, wait, ang) => page.evaluate(async ([uid, zoom, ang, wait]) => {
      const gm = window.game.gameManager; const sm = window.game.sceneManager; const u = gm.entitiesById.get(uid);
      sm.cameraTarget.set(u.mesh.position.x, 1.2, u.mesh.position.z); sm.targetZoomLevel = zoom; sm.zoomLevel = zoom;
      if (ang !== null) { sm.targetCameraAngle = ang; }
      await new Promise((r) => setTimeout(r, wait));
    }, [id, zoom, ang, wait]);
    if (!live.error) {
      const ang = await page.evaluate(([uid, t]) => { const u = window.game.gameManager.entitiesById.get(uid); return Math.atan2(u.mesh.position.z - t.z, u.mesh.position.x - t.x) + 0.9; }, [id, live]);
      await follow(0.3, 1200, ang);
      await shotUnit(page, id, 'game-andando.png');
      let st = 'x';
      for (let i = 0; i < 60 && st !== 'gather'; i++) {
        st = await page.evaluate((uid) => { const g = window.game.gameManager; return g.entityViews.viewOf(g.entitiesById.get(uid)).animator.currentAnim === 'gather' ? 'gather' : 'x'; }, id);
        await follow(0.3, 500, ang);
      }
      for (const k of [0, 1, 2]) { await follow(0.3, 350, ang); await shotUnit(page, id, `game-cortando-${k}.png`); }
      rec('C4', 'ordem de cortar madeira: o Lacaio anda e entra em gather', st === 'gather', st);
    }
    rec('C2', 'walk/fight/gather mexem braço e perna; a picareta não entra no chão (minY >= -0,05)',
      Math.abs(out.walk.legL) > 0.1 && Math.abs(out.gather.armR) > 0.1 && Math.abs(out.fight.armR) > 0.1 && Object.values(out).every((o) => o.minY >= -0.05), JSON.stringify(out));
  }
} catch (e) {
  console.error('ERRO fatal:', e); rec('FATAL', 'execução interrompida', false, String(e.message || e).split('\n')[0]);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const real = errors.filter((e) => !/deprec/i.test(e));
rec('C3', 'sem pageerror nem console.error', real.length === 0, real.slice(0, 3).join(' | '));
process.exitCode = rows.some((r) => !r.ok) ? 1 : 0;
