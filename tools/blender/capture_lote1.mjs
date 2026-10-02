#!/usr/bin/env node
/**
 * F7-00b lote 1 — capturas dos aéreos (Planador, Balão, Grifo, Serpe), Aviário/Ninho e das construções base
 * humanas/orcs migradas para Blender, no inspetor e no jogo. GPU real obrigatória (assertHardwareGpu).
 * Rode SOMENTE via safe-run:
 *   GROUP=1 bash tools/safe-run.sh --timeout 900 -- node tools/blender/capture_lote1.mjs
 * GROUP = 1 (aéreos + Aviário/Ninho), 2 (humanas base), 3 (orcs base). ONLY=insp|game filtra a etapa.
 * Sobe o Vite na porta 5271 (PORT_VITE) e o encerra no finally.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'renders');
const PORT = Number(process.env.PORT_VITE || 5271);
const GROUP = process.env.GROUP || '1';
const ONLY = process.env.ONLY || '';
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];

const CFG = {
  1: {
    insp: {
      glider_glb: ['idle', ['walk', 0.25]],
      war_balloon_glb: ['idle', ['walk', 0.25]],
      gryphon_rider_glb: ['idle', ['walk', 0.25], ['fight', 0.35]],
      war_serpent_glb: ['idle', ['walk', 0.25], ['fight', 0.35]],
      aviary_glb: ['idle'],
      serpent_nest_glb: ['idle']
    },
    human: { buildings: ['aviary'], units: ['glider', 'gryphon_rider'] },
    orc: { buildings: ['serpent_nest'], units: ['war_balloon', 'war_serpent'] }
  },
  2: {
    insp: { barracks_glb: ['idle'], forge_glb: ['idle'], cottage_glb: ['idle'], farm_glb: ['idle'], lumber_camp_glb: ['idle'], watchtower_glb: ['idle'] },
    human: { buildings: ['barracks', 'forge', 'cottage', 'farm', 'lumber_camp', 'watchtower'], units: [] },
    orc: null
  },
  3: {
    insp: { great_hall_glb: ['idle'], orc_barracks_glb: ['idle'], orc_forge_glb: ['idle'], orc_house_glb: ['idle'], pig_farm_glb: ['idle'], orc_lumber_mill_glb: ['idle'], orc_watchtower_glb: ['idle'] },
    human: null,
    orc: { buildings: ['great_hall', 'orc_barracks', 'orc_forge', 'orc_house', 'pig_farm', 'orc_lumber_mill', 'orc_watchtower'], units: [] }
  }
}[GROUP];

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

try {
  if (!ONLY || ONLY === 'insp') {
    const shots = [];
    for (const [m, list] of Object.entries(CFG.insp)) {
      for (const it of list) {
        const [anim, time] = Array.isArray(it) ? it : [it, null];
        shots.push([m, anim, time, `insp_${m.replace('_glb', '')}_${anim}${time != null ? '_' + String(time).replace('.', '') : ''}`]);
      }
    }
    for (const [model, anim, time, file] of shots) {
      const q = `/inspector.html?model=${model}&light=day&anim=${anim}${time != null ? `&time=${time}` : ''}`;
      const { page, errors } = await open(q, 'window.inspectorApp && window.inspectorApp.currentModelObject');
      await page.waitForTimeout(1800);
      if (time != null) await page.evaluate(t => { const a = window.inspectorApp.animator; if (a) { a.pause(); a.setTime(t); } }, time);
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => {
        let meshes = 0; const mats = new Set(); const names = [];
        window.inspectorApp.currentModelObject.traverse(o => { if (o.name && /^(Torso|Head|WingL|WingR|Rotor|Anim_|Static_Mesh|Socket_)/.test(o.name)) names.push(o.name); if (o.isMesh && o.visible) { meshes++; mats.add(o.material.uuid); } });
        return { meshes, mats: mats.size, names: names.join(',') };
      });
      await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `${file}.png`) });
      console.log(file, JSON.stringify(info), errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
      await close();
    }
  }

  if (!ONLY || ONLY === 'game') {
    for (const faction of ['human', 'orc']) {
      const cfg = CFG[faction];
      if (!cfg) continue;
      const { page, errors } = await open(`/?skipPreload&texq=low&play&faction=${faction}`, 'window.game');
      await page.waitForFunction(() => window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const res = await page.evaluate(([faction, cfg]) => {
        const gm = window.game.gameManager;
        const id = gm.localPlayerId;
        const p = gm.getPlayer(id);
        p.resources.gold = 9000; p.resources.wood = 9000; p.resources.stone = 9000; p.maxPopulation = 200;
        const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
        hq.tier = 3;
        const hp = hq.mesh.position;
        const mkAt = (type, x, z, done = true) => { const b = gm.createBuilding(type, x, z, done, id); gm.buildings.push(b); return b; };
        const built = {};
        cfg.buildings.forEach((t, i) => {
          const col = i % 3, row = Math.floor(i / 3);
          built[t] = mkAt(t, hp.x + 14 + col * 10, hp.z - 14 + row * 10);
        });
        const wip = cfg.buildings.length ? mkAt(cfg.buildings[0], hp.x - 16, hp.z + 4, false) : null;
        if (wip) { wip.buildProgress = 45; wip.updateConstructionState(); }
        const us = cfg.units.map((t, i) => gm.spawnUnit(t, hp.x + 8 + i * 4, hp.z + 8, id));
        us.forEach(u => u.orderMove && u.orderMove({ x: u.mesh.position.x + 6, y: 0, z: u.mesh.position.z + 6 }));
        window.__cap = { built, wip, us, hq };
        return { buildings: Object.keys(built), units: us.map(u => u.type) };
      }, [faction, cfg]);
      console.log(faction, JSON.stringify(res));
      await page.evaluate(() => { window.game.gameManager.sceneManager.targetZoomLevel = 0.5; return true; });
      for (const [i, t] of cfg.buildings.entries()) {
        await page.evaluate(([t]) => {
          const o = window.__cap.built[t]; const pos = o.mesh.position;
          window.game.gameManager.sceneManager.cameraTarget.set(pos.x, 2.0, pos.z + 3);
        }, [t]);
        await page.waitForTimeout(1400);
        await page.screenshot({ path: path.join(OUT, `game_${t}.png`) });
      }
      if (cfg.units.length) {
        await page.evaluate(() => { const c = window.__cap; const u = c.us[0].mesh.position; window.game.gameManager.sceneManager.targetZoomLevel = 0.3; window.game.gameManager.sceneManager.cameraTarget.set(u.x + 3, 3.0, u.z + 3); });
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `game_${faction}_air.png`) });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `game_${faction}_air2.png`) });
      }
      if (CFG[faction].buildings.length) {
        await page.evaluate(() => { const c = window.__cap; const w = c.wip; if (w) { window.game.gameManager.sceneManager.targetZoomLevel = 0.5; window.game.gameManager.sceneManager.cameraTarget.set(w.mesh.position.x, 2.0, w.mesh.position.z + 3); } });
        await page.waitForTimeout(1400);
        await page.screenshot({ path: path.join(OUT, `game_${faction}_obra_g${GROUP}.png`) });
      }
      console.log(`game_${faction}`, errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
      await close();
    }
  }
} finally {
  await close();
  await vite.close();
}
