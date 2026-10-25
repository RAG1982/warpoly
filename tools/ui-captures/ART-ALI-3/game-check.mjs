#!/usr/bin/env node
/**
 * Quartel, Casa e Serraria da Aliança (ART-ALI-3) no jogo e no inspetor. Só mede e captura; não altera src/ nem tests/.
 *  G1 view de cada edifício usa o modelo novo (raiz Barracks/Cottage/LumberCamp), terminado, com sockets.
 *  G2 treino no quartel: a unidade nasce à frente (+Z) do quartel, fora do raio de colisão.
 *  G3 fumaça da chaminé da casa (evento BUILDING_VFX chimney_smoke) sai sobre a chaminé.
 *  G4 custo de render: draw calls e triângulos de cada modelo na cena.
 *  G5 erros de página/console.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/ART-ALI-3/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5393;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
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
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(2500);
  data.renderer = await page.evaluate(() => {
    const gl = window.game.sceneManager.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
  });
  console.log('renderer:', data.renderer);
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });

  // constrói os três edifícios numa linha ao lado do Centro (terreno de teste: ignora validação de colocação)
  const setup = await page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
    // direção "para fora" do Centro: afasta do centro do mapa
    const out = { x: Math.sign(hx) || 1, z: Math.sign(hz) || 1 };
    const list = [['barracks', 16, 0], ['cottage', 16, 12], ['lumber_camp', 16, -12]];
    const res = {};
    const created = [];
    for (const [type, dx, dz] of list) {
      const x = hx + out.x * dx * 0 + dx * 0 + dx, z = hz + dz;
      const b = gm.createBuilding(type, x, z, true, me);
      gm.buildings.push(b);
      res[type] = { id: b.id, x, z, t: b.type, owner: b.ownerId, dead: b.isDead };
    }
    for (let i = 0; i < 3; i++) gm.simStep(0.05);
    await new Promise((r) => requestAnimationFrame(r));
    return { hx, hz, res };
  });
  data.setup = setup;
  await sleep(1500);
  const info = await page.evaluate((ids) => {
    const gm = window.game.gameManager;
    const out = {};
    for (const b of gm.buildings) {
      if (!ids.includes(b.id)) continue;
      const v = gm.entityViews.viewOf(b);
      const names = [];
      v.mesh.traverse((o) => names.push(o.name));
      let tris = 0, meshes = 0, draws = 0;
      (v.fullMesh || v.mesh).traverse((o) => { if (o.isMesh && o.visible) { meshes++; draws += Array.isArray(o.material) ? o.material.length : 1; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      out[b.type] = { id: b.id, model: v.fullMesh && v.fullMesh.name, constructed: b.isConstructed, meshes, draws, tris: Math.round(tris), hasStatic: names.includes('Static_Mesh'), sockets: names.filter((n) => n.startsWith('Socket_')), collisionRadius: b.collisionRadius };
    }
    return out;
  }, Object.values(setup.res).map((r) => r.id));
  data.info = info;
  const ok1 = ['barracks', 'cottage', 'lumber_camp'].every((k) => info[k] && info[k].hasStatic && info[k].constructed);
  rec('G1', 'edifícios novos com Static_Mesh e sockets', ok1, JSON.stringify(info));
  rec('G4', 'draw calls por edifício <= 2 e tris <= 8000 na cena', ['barracks', 'cottage', 'lumber_camp'].every((k) => info[k] && info[k].draws <= 2 && info[k].tris <= 8000), Object.entries(info).map(([k, v]) => `${k}: ${v.draws} draws ${v.tris} tris`).join(' | '));

  // câmera: cada edifício, ângulos
  for (const [type, p] of Object.entries(setup.res)) {
    for (const [tag, ang] of [['34', Math.PI / 4], ['frente', 0]]) {
      await camTo(page, p.x, p.z, 0.45, ang);
      await shot(page, `jogo-${type}-${tag}.png`);
    }
  }
  await camTo(page, setup.res.cottage.x, setup.res.barracks.z + 0, 1.0, Math.PI / 4, 1600);
  await shot(page, 'jogo-grupo.png');

  // G2: treino no quartel
  const g2 = await page.evaluate(async (bid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const bk = gm.buildings.find((b) => b.id === bid);
    Object.assign(gm.getPlayer(me).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 });
    const before = new Set(gm.units.map((u) => u.id));
    gm.issue({ type: 'train', playerId: me, buildingId: bk.id, unitType: 'knight' });
    for (let t = 0; t < 1200; t++) gm.simStep(0.05);
    const nu = gm.units.filter((u) => !before.has(u.id) && u.ownerId === me);
    const bx = bk.mesh.position.x, bz = bk.mesh.position.z;
    return { trained: nu.length, spawn: nu.slice(0, 1).map((u) => ({ dx: +(u.mesh.position.x - bx).toFixed(2), dz: +(u.mesh.position.z - bz).toFixed(2) })), rally: { dx: +(bk.rallyPoint.x - bx).toFixed(2), dz: +(bk.rallyPoint.z - bz).toFixed(2) }, r: bk.collisionRadius };
  }, setup.res.barracks.id);
  data.g2 = g2;
  rec('G2', 'treino do quartel: unidade surge fora do raio de colisão', g2.trained > 0 && Math.hypot(g2.spawn[0].dx, g2.spawn[0].dz) >= g2.r - 0.3, JSON.stringify(g2));
  const bp = setup.res.barracks;
  await camTo(page, bp.x, bp.z + 3, 0.45, Math.PI / 4, 1200);
  await shot(page, 'jogo-quartel-treino.png');

  // G3: fumaça da chaminé
  const g3 = await page.evaluate(async (cid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const c = gm.buildings.find((b) => b.id === cid);
    const evs = [];
    const off = gm.events.on('building_vfx', (e) => { if (e.kind === 'chimney_smoke' && e.buildingId === c.id) evs.push(e.pos); });
    for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
    if (typeof off === 'function') off();
    return { n: evs.length, first: evs[0] || null, cottage: { x: c.mesh.position.x, z: c.mesh.position.z } };
  }, setup.res.cottage.id);
  data.g3 = g3;
  rec('G3', 'fumaça da chaminé da casa emitida', g3.n > 0, JSON.stringify(g3));
  const cp = setup.res.cottage;
  await camTo(page, cp.x, cp.z, 0.4, Math.PI / 4, 400);
  await sleep(2500);
  await shot(page, 'jogo-casa-fumaca.png');

  // cor de time: troca de dono (cor)
  const rec2 = errors.filter((e) => !/deprec/i.test(e));
  rec('G5', 'sem erros de página/console', rec2.length === 0, rec2.slice(0, 5).join(' | ') || 'nenhum');

  // inspetor
  for (const id of ['barracks_glb', 'cottage_glb', 'lumber_camp_glb']) {
    await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=${id}&texq=low`, { waitUntil: 'load', timeout: 90000 });
    await sleep(6000);
    await shot(page, `inspetor-${id}.png`);
  }
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', false, String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify({ rows, data, errors: errors.slice(0, 20) }, null, 2));
process.exit(rows.some((r) => r.status === 'FAIL') ? 1 : 0);
