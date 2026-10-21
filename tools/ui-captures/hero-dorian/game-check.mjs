#!/usr/bin/env node
/**
 * Marechal Dorian Vasques (hero_dorian) no jogo e no inspetor (M2-20). Só mede e captura; não altera src/ nem tests/.
 *  C0 glb (JSON): nós, Banner>Torso, TeamColor em Horse/Torso/Banner, <= 20 draw calls.
 *  C1 spawn perto do HQ; animador no tipo cavalier.   C2 rebind (torso, head, armL, armR, sword, banner, 4 patas).
 *  C3 poses idle/walk/fight/cast: partes mexem (patas em diagonal, Torso torce no golpe, braços sobem na cast, Banner balança).
 *  C4 andar ao vivo.   C5 golpe, Estandarte de Aurelan, Escudos Cerrados e Carga do Marechal ao vivo (view entra em fight/cast; o alvo perde PV).
 *  C6 TeamColor azul muda só o material TeamColor.   C7 inspetor.   C8 sem erros de página/console.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/hero-dorian/game-check.mjs
 * Saída nesta pasta: game-*.png, inspetor-*.png, game-check.json
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5487;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const NODES = ['Cavalier', 'Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'Torso', 'Head', 'ArmL', 'ArmR', 'Sword', 'Banner'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [], files = [], errors = [], data = {};
const rec = (id, name, ok, detail = '') => { rows.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail }); console.log(`[${id}] ${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`); };
const attempt = async (fn) => { try { return await fn(); } catch (e) { return { error: String((e && e.message) || e).split('\n')[0].slice(0, 300) }; } };

function glbInfo(file) {
  const b = fs.readFileSync(file);
  const j = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
  const parent = {};
  j.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const nodes = {};
  j.nodes.forEach((n, i) => {
    nodes[n.name] = { parent: parent[i] === undefined ? null : j.nodes[parent[i]].name,
      mats: n.mesh === undefined ? [] : [...new Set(j.meshes[n.mesh].primitives.map((p) => j.materials[p.material].name))] };
  });
  return { nodes, draws: j.meshes.reduce((s, m) => s + m.primitives.length, 0),
    tris: j.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + j.accessors[p.indices].count / 3, 0), 0) };
}
async function shot(page, name) { const f = path.join(HERE, name); await page.screenshot({ path: f }); files.push(name); }
async function camTo(page, x, y, z, zoom, wait = 1400) {
  await page.evaluate(([x, y, z, zoom]) => { const sm = window.game.sceneManager; sm.cameraTarget.set(x, y, z); sm.targetZoomLevel = zoom; sm.targetCameraAngle = Math.PI / 4; }, [x, y, z, zoom]);
  await sleep(wait);
}

const glb = glbInfo(path.join(ROOT, 'public/models/hero_dorian.glb'));
{
  const g = glb.nodes;
  const ok = NODES.every((n) => g[n]) && g.Banner.parent === 'Torso' && ['Horse', 'Torso', 'Banner'].every((n) => g[n].mats.includes('TeamColor')) && glb.draws <= 20;
  rec('C0', 'hero_dorian.glb: nós, Banner>Torso, TeamColor em Horse/Torso/Banner, <= 20 draw calls', ok,
    `draw calls=${glb.draws} triângulos=${glb.tris} Horse=${g.Horse.mats} Torso=${g.Torso.mats} Banner=${g.Banner.mats}`);
}

async function castAndWatch(page, uid, abilityId, foeId, ms) {
  return page.evaluate(async ({ uid, abilityId, foeId, ms }) => {
    const gm = window.game.gameManager;
    const u = gm.entitiesById.get(uid);
    u.mana = u.maxMana; u.cooldowns = {};
    const view = gm.entityViews.viewOf(u);
    const seen = {}; const t0 = performance.now();
    const cmd = { type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId };
    if (foeId) cmd.targetId = foeId;
    gm.issue(cmd);
    await new Promise((res) => { const step = () => { const a = view.animator.currentAnim; seen[a] = (seen[a] || 0) + 1; if (performance.now() - t0 < ms) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    return seen;
  }, { uid, abilityId, foeId, ms });
}

async function runChecks(page) {
  const sp = await attempt(() => page.evaluate(async () => {
    const gm = window.game.gameManager, me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
    let spot = null;
    for (let r = 9; r <= 30 && !spot; r += 3) {
      for (let a = 0; a < 360 && !spot; a += 30) {
        const x = hx + Math.cos(a * Math.PI / 180) * r, z = hz + Math.sin(a * Math.PI / 180) * r;
        if (!gm.pathfinder.isWater(x, z) && gm.canPlaceBuilding('cottage', x, z, null, me)) spot = { x, z };
      }
    }
    const u = gm.spawnUnit('hero_dorian', spot.x, spot.z, me);
    await new Promise((res) => { let n = 0; const f = () => (++n >= 2 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); setTimeout(res, 1500); });
    const view = gm.entityViews.viewOf(u);
    const root = view.root, ud = root.userData || {};
    const nodes = {};
    for (const n of ['Cavalier', 'Horse', 'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR', 'Torso', 'Head', 'ArmL', 'ArmR', 'Sword', 'Banner']) { const o = root.getObjectByName(n); nodes[n] = o ? (o.parent ? o.parent.name : null) : 'AUSENTE'; }
    const keys = ['torso', 'head', 'armL', 'armR', 'sword', 'banner', 'horseLegFL', 'horseLegFR', 'horseLegBL', 'horseLegBR'];
    return { id: u.id, me, rootName: root.name, scale: root.scale.y, anim: view.animator.unitType, nodes,
      nulos: keys.filter((k) => !view.animator.meshParts[k]), semUd: ['torso', 'head', 'armL', 'armR', 'sword', 'banner'].filter((k) => !ud[k]) };
  }));
  data.spawn = sp;
  if (sp.error) { rec('C1', 'spawn', false, sp.error); return; }
  rec('C1', 'spawn hero_dorian; raiz Cavalier; animador cavalier', sp.rootName === 'Cavalier' && sp.anim === 'cavalier', `id=${sp.id} escala=${sp.scale} nós=${JSON.stringify(sp.nodes)}`);
  rec('C2', 'rebind: userData e meshParts sem nulos (torso, head, braços, sword, banner, 4 patas)', sp.nulos.length === 0 && sp.semUd.length === 0, `meshParts nulos=[${sp.nulos}] userData ausentes=[${sp.semUd}]`);
  const id = sp.id;
  const poses = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const an = view.animator, root = view.root;
    const out = {};
    for (const [anim, ts] of [['idle', [0.25, 1.0]], ['walk', [0, 0.2, 0.4]], ['fight', [0.2, 0.5, 0.8]], ['cast', [0.5]]]) {
      an.setAnimation(anim, true); an.pause(); out[anim] = {};
      for (const t of ts) {
        an.setTime(t, false); root.updateMatrixWorld(true);
        const P = an.meshParts;
        out[anim][t] = { armR: P.armR.rotation.x, legFL: P.horseLegFL.rotation.x, legFR: P.horseLegFR.rotation.x, legBR: P.horseLegBR.rotation.x,
          torsoY: P.torso.rotation.y, swordX: P.sword.rotation.x, bannerX: P.banner.rotation.x, bannerZ: P.banner.rotation.z };
      }
    }
    an.setAnimation('idle', true); an.play();
    return out;
  }, id));
  data.poses = poses;
  if (poses.error) rec('C3', 'poses', false, poses.error);
  else {
    const legs = Object.values(poses.walk).map((p) => p.legFL);
    const range = Math.max(...legs) - Math.min(...legs);
    const diag = Object.values(poses.walk).every((p) => Math.abs(p.legFL - p.legBR) < 1e-6 && Math.abs(p.legFL + p.legFR) < 1e-6);
    const fightTorso = Math.max(...Object.values(poses.fight).map((p) => Math.abs(p.torsoY)));
    const bn = Math.max(...Object.values(poses.idle).map((p) => Math.abs(p.bannerX) + Math.abs(p.bannerZ)));
    const ok = range > 0.5 && diag && fightTorso > 0.15 && Math.abs(poses.cast[0.5].armR + 2.3) < 0.7 && bn > 0.01;
    rec('C3', 'idle/walk/fight/cast mexem as partes (patas em diagonal, Torso torce no golpe, braços sobem na cast, Banner balança)', ok,
      `walk legFL faixa=${range.toFixed(2)} diagonais=${diag}; fight |torso.y| máx=${fightTorso.toFixed(2)}; cast armR.x=${poses.cast[0.5].armR.toFixed(2)}; Sword idle x=${poses.idle[0.25].swordX.toFixed(3)}; Banner idle |x|+|z|=${bn.toFixed(3)}`);
  }
  const bp = await attempt(() => page.evaluate((uid) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); return { x: u.mesh.position.x, z: u.mesh.position.z, y: gm.entityViews.viewOf(u).root.position.y }; }, id));
  await camTo(page, bp.x, bp.y + 1.7, bp.z, 0.3, 1600);
  await attempt(() => shot(page, 'game-dorian-idle.png'));
  await camTo(page, bp.x, bp.y + 1.3, bp.z, 1.0, 1400);
  await attempt(() => shot(page, 'game-dorian-no-jogo.png'));
  const walk = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); let tgt = null;
    for (let a = 0; a < 360 && !tgt; a += 30) {
      const x = u.mesh.position.x + Math.cos(a * Math.PI / 180) * 12, z = u.mesh.position.z + Math.sin(a * Math.PI / 180) * 12;
      if (!gm.pathfinder.isWater(x, z)) tgt = gm.pathfinder.findNearestWalkable(x, z);
    }
    gm.issue({ type: 'move', playerId: gm.localPlayerId, unitIds: [uid], x: tgt.x, z: tgt.z });
    await new Promise((r) => setTimeout(r, 900));
    return { anim: gm.entityViews.viewOf(u).animator.currentAnim };
  }, id));
  await attempt(() => shot(page, 'game-dorian-andar.png'));
  rec('C4', 'andar ao vivo: animador em walk', walk.anim === 'walk', JSON.stringify(walk));
  const live = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager, me = gm.localPlayerId; const u = gm.entitiesById.get(uid);
    const enemy = gm.players.find((p) => p.id !== me).id;
    const foe = gm.spawnUnit('knight', u.mesh.position.x + 2.2, u.mesh.position.z, enemy);
    foe.speed = 0; foe.hp = foe.maxHp = 6000; foe.updateHealthBar(); foe.isCombatUnit = () => false;
    u.mana = u.maxMana;
    const view = gm.entityViews.viewOf(u);
    const watch = (ms) => new Promise((res) => {
      const seen = {}; const t0 = performance.now();
      const step = () => { const a = view.animator.currentAnim; seen[a] = (seen[a] || 0) + 1; if (performance.now() - t0 < ms) requestAnimationFrame(step); else res(seen); };
      requestAnimationFrame(step);
    });
    gm.issue({ type: 'attack', playerId: me, unitIds: [uid], targetId: foe.id });
    const hit = await watch(2500); const hp1 = foe.hp;
    return { hit, hp: [foe.maxHp, hp1, foe.hp], foeId: foe.id };
  }, id));
  data.live = live;
  if (live.error) { rec('C5', 'golpe e habilidades ao vivo', false, live.error); return; }
  const banner = await attempt(() => castAndWatch(page, id, 'hero_banner', null, 1500));
  const shield = await attempt(() => castAndWatch(page, id, 'hero_shield_line', null, 1500));
  const charge = await attempt(() => castAndWatch(page, id, 'hero_marshal_charge', live.foeId, 1800));
  const hpEnd = await attempt(() => page.evaluate((fid) => window.game.gameManager.entitiesById.get(fid).hp, live.foeId));
  data.casts = { banner, shield, charge, hpEnd };
  rec('C5', 'golpe (fight), Estandarte de Aurelan, Escudos Cerrados e Carga do Marechal (cast) entram nas animações; a Carga fere o alvo',
    (live.hit.fight || 0) >= 3 && (banner.cast || 0) >= 2 && (shield.cast || 0) >= 2 && (charge.cast || 0) >= 2 && hpEnd < live.hp[1],
    `golpe=${JSON.stringify(live.hit)} estandarte=${JSON.stringify(banner)} escudos=${JSON.stringify(shield)} carga=${JSON.stringify(charge)} PV alvo ${live.hp.join(' -> ')} -> ${hpEnd}`);
  const p2 = await attempt(() => page.evaluate((uid) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); return { x: u.mesh.position.x, z: u.mesh.position.z }; }, id));
  await camTo(page, p2.x + 1, 2.0, p2.z, 0.3, 900);
  await page.evaluate(({ uid, fid }) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); gm.entitiesById.get(fid).hp = 6000; u.cooldowns = {}; u.mana = u.maxMana; gm.issue({ type: 'attack', playerId: gm.localPlayerId, unitIds: [uid], targetId: fid }); }, { uid: id, fid: live.foeId });
  await sleep(500); await attempt(() => shot(page, 'game-dorian-golpe.png'));
  for (const [ab, file] of [['hero_banner', 'game-dorian-estandarte.png'], ['hero_shield_line', 'game-dorian-escudos.png'], ['hero_marshal_charge', 'game-dorian-carga.png']]) {
    await sleep(1800);
    await page.evaluate(({ uid, ab, fid }) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); u.mana = u.maxMana; u.cooldowns = {}; gm.entitiesById.get(fid).hp = 6000; const c = { type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId: ab }; if (ab === 'hero_marshal_charge') c.targetId = fid; gm.issue(c); }, { uid: id, ab, fid: live.foeId });
    await sleep(600); await attempt(() => shot(page, file));
  }
  const team = await attempt(() => page.evaluate(async (uid) => {
    const { ModelFactory } = await import('/src/entities/ModelFactory.js');
    const gm = window.game.gameManager; const root = gm.entityViews.viewOf(gm.entitiesById.get(uid)).root;
    const cols = () => { const o = {}; root.traverse((c) => { if (!c.isMesh) return; for (const m of (Array.isArray(c.material) ? c.material : [c.material])) o[m.name] = '#' + m.color.getHexString(); }); return o; };
    const a = cols(); ModelFactory.setTeamColor(root, 0xd02020); return { a, d: cols() };
  }, id));
  await sleep(2500);
  await attempt(() => shot(page, 'game-dorian-time-vermelho.png'));
  rec('C6', 'TeamColor (vermelho, Horda) muda só o material TeamColor', !team.error && team.a.TeamColor !== team.d.TeamColor && team.a.Atlas === team.d.Atlas,
    team.error || `TeamColor ${team.a.TeamColor} -> ${team.d.TeamColor}; Atlas ${team.a.Atlas} -> ${team.d.Atlas}`);
}

async function runInspector(page) {
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=hero_dorian_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
  await sleep(2500);
  const info = await attempt(() => page.evaluate(() => { const names = []; window.inspectorApp.currentModelObject.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); }); return names; }));
  rec('C7', 'inspetor: hero_dorian_glb carrega com os nós', Array.isArray(info) && NODES.every((n) => info.includes(n)), Array.isArray(info) ? info.join(',') : info.error);
  await attempt(() => shot(page, 'inspetor-dorian-idle.png'));
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; if (a) { a.setAnimation('walk', true); a.pause(); a.setTime(0.2, false); } }));
  await sleep(700);
  await attempt(() => shot(page, 'inspetor-dorian-andar.png'));
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; if (a) { a.setAnimation('fight', true); a.pause(); a.setTime(0.5, false); } }));
  await sleep(700);
  await attempt(() => shot(page, 'inspetor-dorian-golpe.png'));
}

let vite = null, browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(1500);
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  await runChecks(page);
  await runInspector(page);
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', false, String((e && e.message) || e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const real = errors.filter((e) => !/deprec/i.test(e));
rec('C8', 'sem pageerror nem console.error', real.length === 0, `erros=${errors.length}` + (real.length ? ' ' + real.slice(0, 3).join(' | ') : ''));
rows.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify({ generated: new Date().toISOString(), rows, files, data, errors }, null, 2) + '\n');
const fails = rows.filter((r) => r.status !== 'PASS').length;
console.log(`\nRESUMO: ${rows.length - fails}/${rows.length} PASS; arquivos=[${files.join(', ')}]`);
process.exitCode = fails ? 1 : 0;
