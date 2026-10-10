#!/usr/bin/env node
/**
 * F7-00b arte A — capturas NO JOGO (?texq=low&skipPreload) do Acampamento Bandido, do Balão de Guerra em voo e das
 * fileiras de muralhas. GPU real obrigatória (assertHardwareGpu). Rode SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 900 -- node tools/ui-captures/art-a/capture.mjs [camp|balloon|walls|inspector|all]
 * Sobe o Vite na porta 5311 (PORT_VITE) e o encerra no finally. Saída: esta pasta (PNG do canvas, sem HUD).
 * Variáveis: OUT_SUFFIX (sufixo dos arquivos), NO_SHRINK=1 (não reduz para 256 cores no fim).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5311);
const WHAT = process.argv[2] || 'all';
const SUF = process.env.OUT_SUFFIX || '';
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const written = [];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;

async function open(url, ready) {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  await page.goto(base + url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(ready, null, { timeout: 90000 });
  return { page, errors };
}
async function close() { if (browser) await browser.close().catch(() => {}); browser = null; }

/** Força um quadro e lê o canvas do jogo (sem HUD). */
async function grab(page, name) {
  const b64 = await page.evaluate(() => {
    const sm = window.game.sceneManager;
    sm.renderer.render(sm.scene, sm.camera);
    return sm.renderer.domElement.toDataURL('image/png').split(',')[1];
  });
  const file = path.join(OUT, `${name}${SUF}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  written.push(file);
}

/** Câmera: alvo, zoom (menor = mais perto) e giro (π/4 = padrão, +x/+z; π/2 = de frente para um prédio com a frente em +Z). */
async function cam(page, x, y, z, zoom, yaw = Math.PI / 4, wait = 1500) {
  await page.evaluate(([x, y, z, zoom, yaw]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = yaw;
  }, [x, y, z, zoom, yaw]);
  await page.waitForTimeout(wait);
}

async function gameReady() {
  const r = await open(`/?skipPreload&texq=low&play&map=${MAP}&faction=${FACTION}`, 'window.game');
  await r.page.waitForFunction(() => window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 }).catch(() => {});
  await r.page.waitForTimeout(1500);
  await r.page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(false); });
  return r;
}
let MAP = 'continental-1v1';
let FACTION = 'human';

try {
  // ---------------------------------------------------------------- Acampamento Bandido (acampamento real do mapa, dono neutro)
  if (WHAT === 'all' || WHAT === 'camp') {
    MAP = 'continental-1v1'; FACTION = 'human';
    const { page, errors } = await gameReady();
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const c = gm.buildings.find(b => b.type === 'bandit_camp');
      return { x: c.mesh.position.x, z: c.mesh.position.z, owner: c.ownerId, camps: gm.buildings.filter(b => b.type === 'bandit_camp').length };
    });
    console.log('camp', JSON.stringify(info));
    await cam(page, info.x, 2.0, info.z + 2, 1.0);
    await grab(page, 'camp-jogo-padrao');
    await cam(page, info.x, 2.0, info.z + 2, 0.55);
    await grab(page, 'camp-jogo-perto');
    await cam(page, info.x, 2.2, info.z + 1, 0.55, Math.PI / 2);
    await grab(page, 'camp-jogo-frente');
    await cam(page, info.x, 2.2, info.z, 0.55, Math.PI * 0.75);
    await grab(page, 'camp-jogo-esquerda');
    await cam(page, info.x, 2.2, info.z, 0.55, Math.PI * 1.25);
    await grab(page, 'camp-jogo-fundos');
    const stats = await page.evaluate(() => { const r = window.game.sceneManager.renderer.info.render; return { calls: r.calls, triangles: r.triangles }; });
    console.log('camp render', JSON.stringify(stats), errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros');
    await close();
  }

  // ---------------------------------------------------------------- Balão de Guerra em voo (orcs)
  if (WHAT === 'all' || WHAT === 'balloon') {
    MAP = 'continental-1v1'; FACTION = 'orc';
    const { page, errors } = await gameReady();
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const id = gm.localPlayerId;
      const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
      const hp = hq.mesh.position;
      // voo em direção à câmera do jogo (+x, +z): a frente do balão (crânio) fica visível; longe da base inimiga
      const S = { x: hp.x - 4, z: hp.z - 38 }, T = { x: hp.x + 30, z: hp.z - 4 };
      const mk = (t, x, z) => gm.spawnUnit(t, x, z, id);
      const bs = [mk('war_balloon', S.x, S.z), mk('war_balloon', S.x + 9, S.z - 5)];
      const gs = [mk('grunt', S.x + 3, S.z + 3), mk('grunt', S.x + 5, S.z + 1), mk('grunt', S.x + 7, S.z + 4)];
      bs[0].moveTo(T.x, T.z, gm);
      bs[1].moveTo(T.x + 9, T.z - 5, gm);
      gs.forEach(g => g.moveTo(T.x + 4 * Math.sin(g.mesh.position.x), T.z + 3, gm));
      window.__cap = { bs, gs, hp: { x: hp.x, z: hp.z } };
      return { hp: { x: hp.x, z: hp.z }, fly: bs.map(b => b.flyHeight), pos: bs.map(b => [b.mesh.position.x, b.mesh.position.y, b.mesh.position.z]) };
    });
    console.log('balao', JSON.stringify(info));
    const follow = async (zoom, yaw, name, wait = 900) => {
      await page.evaluate(([zoom, yaw]) => {
        const sm = window.game.sceneManager; const u = window.__cap.bs[0].mesh.position;
        sm.cameraTarget.set(u.x, u.y + 2.0, u.z); sm.targetZoomLevel = zoom; sm.targetCameraAngle = yaw;
      }, [zoom, yaw]);
      await page.waitForTimeout(wait);
      // reaponta o alvo de novo (o balão andou) e captura
      await page.evaluate(() => { const sm = window.game.sceneManager; const u = window.__cap.bs[0].mesh.position; sm.cameraTarget.set(u.x, u.y + 2.0, u.z); });
      await page.waitForTimeout(250);
      await grab(page, name);
      return page.evaluate(() => { const u = window.__cap.bs[0]; return { x: +u.mesh.position.x.toFixed(1), y: +u.mesh.position.y.toFixed(2), z: +u.mesh.position.z.toFixed(1), moving: u.isMoving !== undefined ? u.isMoving : null }; });
    };
    console.log('t0', JSON.stringify(await follow(1.0, Math.PI / 4, 'balao-voo-padrao-1', 1500)));
    console.log('t1', JSON.stringify(await follow(0.6, Math.PI / 4, 'balao-voo-perto-1', 900)));
    console.log('t2', JSON.stringify(await follow(0.38, Math.PI / 4, 'balao-voo-perto-2', 900)));
    console.log('t3', JSON.stringify(await follow(0.5, Math.PI / 2, 'balao-voo-frente', 900)));
    console.log('t4', JSON.stringify(await follow(0.5, Math.PI * 1.25, 'balao-voo-fundos', 900)));
    console.log('t5', JSON.stringify(await follow(0.38, Math.PI * 0.8, 'balao-voo-lado', 900)));
    console.log('balao em voo', errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros');
    await close();
  }

  // ---------------------------------------------------------------- Muralhas em fileira (humana e orc)
  if (WHAT === 'all' || WHAT === 'walls') {
    for (const faction of ['human', 'orc']) {
      MAP = 'campos-1v1'; FACTION = faction;
      const { page, errors } = await gameReady();
      const res = await page.evaluate(() => {
        const gm = window.game.gameManager;
        const p = gm.localPlayer; p.resources.gold = 9000; p.resources.wood = 9000; p.resources.stone = 9000;
        const hq = gm.buildings.find(b => b.ownerId === p.id && b.role === 'hq');
        const hp = hq.mesh.position;
        const wt = p.factionId === 'orc' ? 'wall_orc' : 'wall_human';
        const STEP = 2.4;
        const line = (x0, z0, dx, dz, n) => Array.from({ length: n }, (_, i) => ({ x: x0 + dx * i * STEP, z: z0 + dz * i * STEP }));
        const free = pts => pts.every(q => gm.canPlaceBuilding(wt, q.x, q.z, null, p.id));
        const placed = [];   // fileiras já escolhidas: as demais ficam a ≥ 9 de distância, para cada fileira aparecer limpa
        const find = (dx, dz, n, from) => {
          for (let r = 0; r < 60; r += 2) for (let a = 0; a < 360; a += 20) {
            const x0 = hp.x + from.x + Math.cos(a * Math.PI / 180) * r, z0 = hp.z + from.z + Math.sin(a * Math.PI / 180) * r;
            const pts = line(x0, z0, dx, dz, n);
            if (!free(pts)) continue;
            if (placed.some(o => o.some(q => pts.some(w => Math.hypot(q.x - w.x, q.z - w.z) < 9)))) continue;
            placed.push(pts);
            return pts;
          }
          return null;
        };
        const s2 = Math.SQRT1_2;
        const rows = {
          x: find(1, 0, 5, { x: 6, z: 14 }),
          z: find(0, 1, 5, { x: -22, z: -6 }),
          diag: find(s2, s2, 5, { x: 20, z: -26 })
        };
        const made = {};
        for (const [k, pts] of Object.entries(rows)) {
          if (!pts) continue;
          made[k] = gm.placeWall(wt, pts, [], p.id).length;
        }
        gm.buildings.filter(b => b.role === 'wall').forEach(w => w.construct(100, gm));
        return { wt, rows, made };
      });
      console.log('muralhas', faction, JSON.stringify(res.made), JSON.stringify(res.rows.x && [res.rows.x[0], res.rows.x[4]]));
      await page.waitForTimeout(1500);
      const mid = pts => ({ x: (pts[0].x + pts[4].x) / 2, z: (pts[0].z + pts[4].z) / 2 });
      const tag = faction === 'orc' ? 'orc' : 'humana';
      if (res.rows.x) {
        const c = mid(res.rows.x);
        await cam(page, c.x, 1.2, c.z, 0.5);
        await grab(page, `muralha-${tag}-fileira-jogo`);
        await cam(page, c.x, 1.2, c.z, 0.5, Math.PI / 2);
        await grab(page, `muralha-${tag}-fileira-frente`);
        await cam(page, c.x, 1.2, c.z, 0.28, Math.PI / 4);
        await grab(page, `muralha-${tag}-fileira-perto`);
        await cam(page, c.x, 1.2, c.z, 1.0, Math.PI / 4);
        await grab(page, `muralha-${tag}-fileira-padrao`);
      }
      if (res.rows.z) {
        const c = mid(res.rows.z);
        await cam(page, c.x, 1.2, c.z, 0.5);
        await grab(page, `muralha-${tag}-fileira-z`);
      }
      if (res.rows.diag) {
        const c = mid(res.rows.diag);
        await cam(page, c.x, 1.2, c.z, 0.5);
        await grab(page, `muralha-${tag}-fileira-diagonal`);
      }
      console.log('muralhas', faction, errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros');
      await close();
    }
  }

  // ---------------------------------------------------------------- Inspetor (referência dos 3 modelos)
  if (WHAT === 'all' || WHAT === 'inspector') {
    for (const [model, anim, time, file] of [
      ['bandit_camp_glb', 'idle', null, 'inspetor-acampamento'],
      ['war_balloon_glb', 'idle', null, 'inspetor-balao-idle'],
      ['war_balloon_glb', 'walk', 0.25, 'inspetor-balao-voo'],
      ['wall_human_glb', 'idle', null, 'inspetor-muralha-humana'],
      ['wall_orc_glb', 'idle', null, 'inspetor-muralha-orc']
    ]) {
      const q = `/inspector.html?model=${model}&light=day&anim=${anim}${time != null ? `&time=${time}` : ''}`;
      const { page, errors } = await open(q, 'window.inspectorApp && window.inspectorApp.currentModelObject');
      await page.waitForTimeout(1800);
      if (time != null) await page.evaluate(t => { const a = window.inspectorApp.animator; if (a) { a.pause(); a.setTime(t); } }, time);
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => {
        let meshes = 0; const mats = new Set();
        window.inspectorApp.currentModelObject.traverse(o => { if (o.isMesh && o.visible) { meshes++; mats.add(o.material.uuid); } });
        return { meshes, mats: mats.size };
      });
      const f = path.join(OUT, `${file}${SUF}.png`);
      await page.locator('#canvas3d').screenshot({ path: f });
      written.push(f);
      console.log(file, JSON.stringify(info), errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros');
      await close();
    }
  }
} finally {
  await close();
  await vite.close();
}

// reduz o peso no repositório (256 cores com dithering; precisa do Pillow no Python do sistema)
if (!process.env.NO_SHRINK && written.length) {
  try {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB')
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(f, optimize=True)
`, ...written], { stdio: 'inherit' });
  } catch (e) { console.log('shrink ignorado:', e.message); }
}
console.log('arquivos:', written.length);
