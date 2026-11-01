#!/usr/bin/env node
/**
 * Refinaria, Fundição (humanas), Fornalha Naval e Caldeirão de Cinzas (orcs) (M5-04) no jogo e no inspetor. Só mede e captura.
 *  G1 view de cada edifício usa o modelo novo (raiz Refinery/Foundry/NavalForge/AshCauldron), terminado, com Static_Mesh.
 *  G2 draw calls <= 20 (orçamento) e tris por edifício.
 *  G3 nós animados: Anim_Crane oscila (rotação Y muda entre quadros) e Anim_Smoke emite BUILDING_VFX chimney_smoke.
 *  G4 a cor de time (material TeamColor) existe no modelo.
 *  G5 erros de página/console.
 * Uso: bash tools/safe-run.sh --timeout 900 -- node tools/ui-captures/M5-04/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
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
const SETS = [
  { faction: 'human', types: ['refinery', 'foundry'], roots: { refinery: 'Refinery', foundry: 'Foundry' } },
  { faction: 'orc', types: ['naval_forge', 'ash_cauldron'], roots: { naval_forge: 'NavalForge', ash_cauldron: 'AshCauldron' } }
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const data = {};
const rows = [];
function rec(id, name, ok, detail = '') { rows.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail }); console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`); }
async function shot(page, name) { await page.screenshot({ path: path.join(HERE, name) }); }
async function camTo(page, x, z, zoom, angle = Math.PI / 4, wait = 1400) {
  await page.evaluate(([x, z, zoom, angle]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, 0, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = angle;
  }, [x, z, zoom, angle]);
  await sleep(wait);
}

let vite = null;
let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  for (const set of SETS) {
    browser = await chromium.launch({ headless: true, args: ARGS });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
    await assertHardwareGpu(page);
    await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1&faction=${set.faction}`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
    await sleep(2500);
    await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
    const setup = await page.evaluate(async (types) => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
      const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
      const res = {};
      types.forEach((type, i) => {
        const x = hx + 18, z = hz + (i === 0 ? -8 : 8);
        const b = gm.createBuilding(type, x, z, true, me);
        gm.buildings.push(b);
        res[type] = { id: b.id, x, z };
      });
      for (let i = 0; i < 3; i++) gm.simStep(0.05);
      await new Promise((r) => requestAnimationFrame(r));
      return { hx, hz, res, faction: gm.getPlayer(me).faction };
    }, set.types);
    data['setup_' + set.faction] = setup;
    await sleep(1500);
    const info = await page.evaluate((ids) => {
      const gm = window.game.gameManager;
      const out = {};
      for (const b of gm.buildings) {
        if (!ids.includes(b.id)) continue;
        const v = gm.entityViews.viewOf(b);
        const names = [];
        const mats = new Set();
        v.mesh.traverse((o) => { names.push(o.name); if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.name)); });
        let tris = 0, meshes = 0, draws = 0;
        (v.fullMesh || v.mesh).traverse((o) => { if (o.isMesh && o.visible) { meshes++; draws += Array.isArray(o.material) ? o.material.length : 1; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
        out[b.type] = { id: b.id, model: v.fullMesh && v.fullMesh.name, constructed: b.isConstructed, meshes, draws, tris: Math.round(tris), hasStatic: names.includes('Static_Mesh'), anim: names.filter((n) => n.startsWith('Anim_')), hasTeamColor: [...mats].some((n) => /TeamColor/i.test(n)), collisionRadius: b.collisionRadius };
      }
      return out;
    }, Object.values(setup.res).map((r) => r.id));
    Object.assign(data, { ['info_' + set.faction]: info });
    for (const type of set.types) {
      const i = info[type] || {};
      rec(`G1-${type}`, `${type}: modelo novo (${set.roots[type]}) com Static_Mesh, terminado`, i.hasStatic && i.constructed && !!i.model, JSON.stringify(i));
      rec(`G2-${type}`, `${type}: draw calls <= 20`, i.draws > 0 && i.draws <= 20, `${i.draws} draws, ${i.tris} tris`);
      rec(`G4-${type}`, `${type}: material TeamColor`, !!i.hasTeamColor, '');
    }
    for (const [type, p] of Object.entries(setup.res)) {
      for (const [tag, ang, zoom] of [['34', Math.PI / 4, 0.45], ['frente', 0, 0.45], ['perto', Math.PI / 4, 0.28]]) {
        await camTo(page, p.x, p.z, zoom, ang);
        await shot(page, `jogo-${type}-${tag}.png`);
      }
    }
    await camTo(page, setup.hx + 18, setup.hz, 0.9, Math.PI / 4, 1600);
    await shot(page, `jogo-grupo-${set.faction}.png`);
    // G3: nós animados
    const g3 = await page.evaluate(async (ids) => {
      const gm = window.game.gameManager;
      const out = {};
      const evs = {};
      const off = gm.events.on('building_vfx', (e) => { if (e.kind === 'chimney_smoke') evs[e.buildingId] = (evs[e.buildingId] || 0) + 1; });
      const cranes = {};
      for (const b of gm.buildings) {
        if (!ids.includes(b.id)) continue;
        const v = gm.entityViews.viewOf(b);
        const c = v.mesh.getObjectByName('Anim_Crane');
        cranes[b.type] = { node: c, y0: c ? c.rotation.y : null, id: b.id };
      }
      const seen = {};
      for (let i = 0; i < 160; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        for (const [t, c] of Object.entries(cranes)) if (c.node) { seen[t] = seen[t] || { min: 9, max: -9 }; seen[t].min = Math.min(seen[t].min, c.node.rotation.y); seen[t].max = Math.max(seen[t].max, c.node.rotation.y); }
      }
      if (typeof off === 'function') off();
      for (const [t, c] of Object.entries(cranes)) out[t] = { crane: c.node ? +(seen[t].max - seen[t].min).toFixed(3) : null, smokeEvents: evs[c.id] || 0 };
      return out;
    }, Object.values(setup.res).map((r) => r.id));
    data['g3_' + set.faction] = g3;
    for (const type of set.types) rec(`G3-${type}`, `${type}: Anim_Crane oscila e Anim_Smoke emite fumaça`, g3[type].crane > 0.03 && g3[type].smokeEvents > 0, JSON.stringify(g3[type]));
    await browser.close(); browser = null;
  }
  const rec2 = errors.filter((e) => !/deprec/i.test(e));
  rec('G5', 'sem erros de página/console', rec2.length === 0, rec2.slice(0, 5).join(' | ') || 'nenhum');
  // inspetor
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await assertHardwareGpu(page);
  for (const id of ['refinery_glb', 'foundry_glb', 'naval_forge_glb', 'ash_cauldron_glb']) {
    await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=${id}&texq=low&light=day`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction('window.inspectorApp && window.inspectorApp.currentModelObject', null, { timeout: 90000 });
    await sleep(3500);
    const nodes = await page.evaluate(() => { const n = []; window.inspectorApp.currentModelObject.traverse((o) => { if (/^(Anim_|Static_Mesh|Socket_)/.test(o.name)) n.push(o.name); }); return n; });
    rec(`INSP-${id}`, `inspetor mostra ${id}`, nodes.includes('Static_Mesh'), nodes.join(','));
    await shot(page, `inspetor-${id}.png`);
  }
  await browser.close(); browser = null;
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', false, String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify({ rows, data, errors: errors.slice(0, 20) }, null, 2));
process.exit(rows.some((r) => r.status === 'FAIL') ? 1 : 0);
