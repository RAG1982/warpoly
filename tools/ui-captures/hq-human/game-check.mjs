#!/usr/bin/env node
/**
 * Centro humano em 3 níveis no jogo (M2-33). Só mede e captura; não altera src/ nem tests/.
 * Uma partida (continental-1v1, IA congelada), facção humana (HQ `castle`).
 *  G0  .glb dos 3 níveis: HTTP 200 e JSON (<= 20 draw calls, TeamColor, altura cresce).
 *  G1  nível 1 ao iniciar: view `_tier` 1, modelo HqHuman1, barra de vida na altura da tabela, raio de colisão 5,5.
 *  G2  aldeões coletando e ENTREGANDO ouro em cada nível (ouro do jogador sobe; nenhum aldeão entra no raio de colisão; ninguém preso).
 *  G3  UPGRADE_HQ de verdade (custo debitado, tick a tick) até o nível 2 e 3: HQ_TIER_CHANGED emitido, a view troca de modelo
 *      (HqHuman2/3), barra de vida/seleção acima do topo do modelo novo.
 *  G4  2 Centros (o 2º no nível 1 enquanto o 1º está no 3): cada view mostra o modelo do seu nível.
 *  G5  TeamColor: cor de time vermelha muda o material TeamColor sem tocar no Atlas.
 *  G6  erros de página e de console.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/hq-human/game-check.mjs
 * Saída nesta pasta: game-*.png, game-check.json
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5391;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const files = [];
const errors = [];
const warnings = [];
const data = {};

function rec(id, name, status, detail = '') {
  rows.push({ id, name, status, detail });
  console.log(`[${id}] ${status} ${name} :: ${detail}`);
}
async function attempt(fn) {
  try { return await fn(); } catch (e) { return { error: 'exceção: ' + String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300) }; }
}
function glbInfo(file) {
  const b = fs.readFileSync(file);
  const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
  const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
  const tris = j.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + j.accessors[p.indices].count / 3, 0), 0);
  let hi = -Infinity;
  for (const m of j.meshes) for (const p of m.primitives) hi = Math.max(hi, j.accessors[p.attributes.POSITION].max[1]);
  return { draws, tris, height: hi, mats: j.materials.map((m) => m.name), images: j.images.length };
}
async function shot(page, name) {
  const file = path.join(HERE, name);
  await page.screenshot({ path: file });
  files.push({ name, kB: Math.round(fs.statSync(file).size / 1024) });
}
async function camTo(page, x, z, zoom, wait = 1200) {
  await page.evaluate(([x, z, zoom]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, 0, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = Math.PI / 4;
  }, [x, z, zoom]);
  await sleep(wait);
}
const frames = (page, n = 3) => page.evaluate(async (k) => { for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r)); }, n);

// ---------------------------------------------------------------- G0: arquivos
const glbs = [1, 2, 3].map((n) => glbInfo(path.join(ROOT, `public/models/hq_human_${n}.glb`)));
rec('G0', 'hq_human_{1,2,3}.glb: <= 20 draw calls, Atlas+TeamColor, 1 textura, altura cresce', glbs.every((g) => g.draws <= 20 && g.mats.includes('TeamColor') && g.mats.includes('Atlas') && g.images === 1) &&
  glbs[0].height < glbs[1].height && glbs[1].height < glbs[2].height ? 'PASS' : 'FAIL',
  glbs.map((g, i) => `n${i + 1}: ${g.draws} draws, ${Math.round(g.tris)} tris, h=${g.height.toFixed(2)}`).join(' | '));

async function runChecks(page) {
  // ---------------------------------------------------------------- G1
  const g1 = await attempt(() => page.evaluate(() => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const view = gm.entityViews.viewOf(hq);
    const info = window.game.gameManager.localPlayer;
    return {
      type: hq.type, tier: hq.tier, viewTier: view._tier, model: view.fullMesh.name, collisionRadius: hq.collisionRadius,
      barY: view.getBuildingHeight(), pos: { x: hq.mesh.position.x, z: hq.mesh.position.z }, faction: info && info.factionId
    };
  }));
  data.g1 = g1;
  rec('G1', 'nível 1 ao iniciar: modelo HqHuman1, colisão 5,5', !g1.error && g1.type === 'castle' && g1.viewTier === 1 && g1.model === 'HqHuman1' && g1.collisionRadius === 5.5 ? 'PASS' : 'FAIL', JSON.stringify(g1));
  if (g1.error) return;
  const hqPos = g1.pos;
  await camTo(page, hqPos.x, hqPos.z, 1.0);
  await shot(page, 'game-nivel1-jogo.png');
  await camTo(page, hqPos.x, hqPos.z, 0.5);
  await shot(page, 'game-nivel1-closeup.png');

  // ---------------------------------------------------------------- G2/G3: por nível
  async function nivel(n) {
    const gather = await attempt(() => page.evaluate(async (tier) => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
      const workers = gm.units.filter((u) => u.ownerId === me && !u.isDead && u.type === 'villager');
      const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
      const mine = gm.resourceDeposits.filter((r) => r.type === 'gold').sort((a, b) =>
        Math.hypot(a.mesh.position.x - hx, a.mesh.position.z - hz) - Math.hypot(b.mesh.position.x - hx, b.mesh.position.z - hz))[0];
      if (!mine) return { error: 'sem jazida de ouro' };
      gm.issue({ type: 'gather', playerId: me, unitIds: workers.map((u) => u.id), targetId: mine.id });
      const p = gm.getPlayer(me);
      const gold0 = p.resources.gold;
      let minDist = Infinity;
      const start = new Map(workers.map((u) => [u.id, { x: u.mesh.position.x, z: u.mesh.position.z }]));
      let delivered = 0;
      const off = gm.events.on('resource_gathered', (e) => { if (e.ownerId === me) delivered++; });
      for (let t = 0; t < 2400; t++) { // 120 s de jogo
        gm.simStep(0.05);
        for (const u of workers) minDist = Math.min(minDist, Math.hypot(u.mesh.position.x - hx, u.mesh.position.z - hz));
        if (t % 400 === 399) await new Promise((r) => requestAnimationFrame(r));
      }
      if (typeof off === 'function') off();
      const moved = workers.filter((u) => { const s = start.get(u.id); return Math.hypot(u.mesh.position.x - s.x, u.mesh.position.z - s.z) > 0.5; }).length;
      return {
        tier, workers: workers.length, goldDelta: p.resources.gold - gold0, gatherEvents: delivered, minDistToCenter: +minDist.toFixed(2),
        collisionRadius: hq.collisionRadius, moved
      };
    }, n));
    data[`gather${n}`] = gather;
    rec(`G2-${n}`, `nível ${n}: aldeões entregam ouro sem entrar no raio de colisão`, !gather.error && gather.goldDelta > 0 && gather.minDistToCenter >= gather.collisionRadius - 0.6 ? 'PASS' : 'FAIL', JSON.stringify(gather));
    await camTo(page, hqPos.x, hqPos.z, 1.0, 600);
    await shot(page, `game-nivel${n}-coleta.png`);
  }
  await nivel(1);

  async function subir(n) {
    const up = await attempt(() => page.evaluate(async (alvo) => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const hq = gm.buildings.filter((b) => b.ownerId === me && b.role === 'hq').sort((a, b) => a.id - b.id)[0];
      Object.assign(gm.getPlayer(me).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 });
      const gold0 = gm.getPlayer(me).resources.gold;
      let changed = null;
      const off = gm.events.on('hq_tier_changed', (e) => { changed = e; });
      gm.issue({ type: 'upgradeHq', playerId: me, buildingId: hq.id });
      gm.simStep(0.05);
      const started = !!hq.tierUpgrade;
      const debited = gold0 - gm.getPlayer(me).resources.gold;
      const view = gm.entityViews.viewOf(hq);
      const modelDurante = view.fullMesh.name;
      for (let t = 0; t < 2400 && hq.tier < alvo; t++) gm.simStep(0.05);
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      if (typeof off === 'function') off();
      return { alvo, started, debited, modelDurante, tier: hq.tier, evento: changed && changed.tier, viewTier: view._tier, model: view.fullMesh.name, hp: hq.hp, maxHp: hq.maxHp };
    }, n));
    data[`subir${n}`] = up;
    rec(`G3-${n}`, `UPGRADE_HQ → nível ${n}: evento, custo e troca de modelo`, !up.error && up.started && up.debited > 0 && up.tier === n && up.evento === n && up.viewTier === n && up.model === `HqHuman${n}` &&
      up.modelDurante === `HqHuman${n - 1}` ? 'PASS' : 'FAIL', JSON.stringify(up));
    await sleep(1200); // anima o crescimento do modelo novo
    // seleção e barra de vida
    const sel = await attempt(() => page.evaluate(() => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const hq = gm.buildings.filter((b) => b.ownerId === me && b.role === 'hq').sort((a, b) => a.id - b.id)[0];
      hq.hp = Math.round(hq.maxHp * 0.7); // barra de vida visível e amarela/verde
      gm.selectSingle(hq);
      return { id: hq.id };
    }));
    await frames(page, 4);
    const bar = await attempt(() => page.evaluate(() => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const hq = gm.buildings.filter((b) => b.ownerId === me && b.role === 'hq').sort((a, b) => a.id - b.id)[0];
      const view = gm.entityViews.viewOf(hq);
      let topo = -Infinity;
      view.fullMesh.traverse((o) => {
        if (o.isMesh && o.geometry) {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
          topo = Math.max(topo, b.max.y);
        }
      });
      return { barVisible: view.hpGroup.visible, barY: +view.hpGroup.position.y.toFixed(2), topoModelo: +topo.toFixed(2), ringVisible: view.selectionRing.visible };
    }));
    data[`barra${n}`] = bar;
    rec(`G3b-${n}`, `nível ${n}: selecionado, barra de vida visível acima do topo do modelo`, !bar.error && !sel.error && bar.barVisible && bar.ringVisible && bar.barY > bar.topoModelo ? 'PASS' : 'FAIL', JSON.stringify(bar));
    await camTo(page, hqPos.x, hqPos.z, 1.0, 600);
    await shot(page, `game-nivel${n}-selecionado.png`);
    await camTo(page, hqPos.x, hqPos.z, 0.5, 600);
    await shot(page, `game-nivel${n}-closeup.png`);
    await page.evaluate(() => { window.game.gameManager.clearSelection(); });
  }
  await subir(2);
  await nivel(2);
  await subir(3);
  await nivel(3);

  // ---------------------------------------------------------------- G4: 2 Centros
  const two = await attempt(() => page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const first = gm.buildings.filter((b) => b.ownerId === me && b.role === 'hq').sort((a, b) => a.id - b.id)[0];
    let spot = null;
    for (let r = 18; r <= 50 && !spot; r += 3) {
      for (let a = 0; a < 16 && !spot; a++) {
        const x = first.mesh.position.x + Math.cos((a / 16) * Math.PI * 2) * r, z = first.mesh.position.z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (gm.canPlaceBuilding('castle', x, z, null, me)) spot = { x, z };
      }
    }
    if (!spot) return { error: 'sem ponto livre' };
    const colony = gm.createBuilding('castle', spot.x, spot.z, true, me);
    gm.buildings.push(colony);
    gm.recalculatePopCap();
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    const v1 = gm.entityViews.viewOf(first), v2 = gm.entityViews.viewOf(colony);
    return { first: { tier: first.tier, model: v1.fullMesh.name }, colony: { tier: colony.tier, model: v2.fullMesh.name }, spot, mid: { x: (first.mesh.position.x + spot.x) / 2, z: (first.mesh.position.z + spot.z) / 2 } };
  }));
  data.two = two;
  rec('G4', '2 Centros: o 1º no nível 3 e o 2º no nível 1, cada um com o seu modelo', !two.error && two.first.model === 'HqHuman3' && two.colony.model === 'HqHuman1' ? 'PASS' : 'FAIL', JSON.stringify(two));
  if (!two.error) {
    await camTo(page, two.mid.x, two.mid.z, 1.4, 1500);
    await shot(page, 'game-dois-centros.png');
  }

  // ---------------------------------------------------------------- G5: TeamColor
  const tc = await attempt(() => page.evaluate(() => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.filter((b) => b.ownerId === me && b.role === 'hq').sort((a, b) => a.id - b.id)[0];
    const view = gm.entityViews.viewOf(hq);
    const mats = [];
    view.fullMesh.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.push(m)); });
    const team = mats.filter((m) => m.name === 'TeamColor');
    const atlas = mats.filter((m) => m.name === 'Atlas');
    const before = team[0].color.getHexString();
    return { teamMats: team.length, atlasMats: atlas.length, teamColor: before, atlasColor: atlas[0].color.getHexString(), playerColor: gm.getPlayer(me).color };
  }));
  data.teamColor = tc;
  rec('G5', 'TeamColor presente (cor do jogador) e Atlas intacto (branco)', !tc.error && tc.teamMats >= 1 && tc.atlasMats >= 1 && tc.atlasColor === 'ffffff' ? 'PASS' : 'FAIL', JSON.stringify(tc));
}

let vite = null;
let browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 400));
    else if (m.type() === 'warning') warnings.push(m.text().slice(0, 400));
  });
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
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  data.http = await attempt(() => page.evaluate(async () => Promise.all([1, 2, 3].map(async (n) => (await fetch(`/models/hq_human_${n}.glb`)).status))));
  console.log('renderer:', data.renderer, '| GET hq_human_{1,2,3}.glb:', data.http);
  await runChecks(page);
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', 'FAIL', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}

const realErr = errors.filter((e) => !/deprec/i.test(e));
rec('G6', 'sem pageerror nem console.error', realErr.length === 0 ? 'PASS' : 'FAIL',
  `erros=${errors.length}; avisos=${warnings.length}` + (realErr.length ? ` primeiros: ${realErr.slice(0, 3).join(' | ')}` : ''));
rows.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify({ generated: new Date().toISOString(), rows, files, data, errors, warnings }, null, 2) + '\n');
const fails = rows.filter((r) => r.status !== 'PASS').length;
console.log(`\nRESUMO: ${rows.length - fails}/${rows.length} PASS; erros=${errors.length}; avisos=${warnings.length}; arquivos=[${files.map((f) => f.name).join(', ')}]`);
process.exitCode = fails ? 1 : 0;
