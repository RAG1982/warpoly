#!/usr/bin/env node
/**
 * Skarn, chefe-de-brasa (hero_skarn) no jogo e no inspetor (M2-24). Só mede e captura; não altera src/ nem tests/.
 *  C0 glb (JSON): nós, Weapon>ArmR, Head/ArmL/ArmR>Torso, TeamColor, <= 20 draw calls.
 *  C1 spawn perto do HQ; animador no tipo ogre.   C2 rebind (torso, head, armL, armR, legL, legR, weapon).
 *  C3 poses idle/walk/fight/cast: partes mexem (perna balança, Torso inclina no golpe, braços sobem na cast).
 *  C4 andar ao vivo.   C5 golpe, Rugido dos Clãs, Pacto de Sangue e Impacto no Solo ao vivo (view entra em fight/cast; o alvo perde PV).
 *  C6 TeamColor azul muda só o material TeamColor.   C7 inspetor.   C8 sem erros de página/console.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/hero-skarn/game-check.mjs
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
const PORT = 5484;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const NODES = ['Ogre', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon'];
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

const glb = glbInfo(path.join(ROOT, 'public/models/hero_skarn.glb'));
{
  const g = glb.nodes;
  const ok = NODES.every((n) => g[n]) && g.Weapon.parent === 'ArmR' && ['Head', 'ArmL', 'ArmR'].every((n) => g[n].parent === 'Torso') &&
    g.Torso.mats.includes('TeamColor') && glb.draws <= 20;
  rec('C0', 'hero_skarn.glb: nós, Weapon>ArmR, Head/ArmL/ArmR>Torso, TeamColor, <= 20 draw calls', ok, `draw calls=${glb.draws} triângulos=${glb.tris} Torso=${g.Torso.mats}`);
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
        if (!gm.pathfinder.isWater(x, z) && gm.canPlaceBuilding('orc_house', x, z, null, me)) spot = { x, z };
      }
    }
    const u = gm.spawnUnit('hero_skarn', spot.x, spot.z, me);
    await new Promise((res) => { let n = 0; const f = () => (++n >= 2 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); setTimeout(res, 1500); });
    const view = gm.entityViews.viewOf(u);
    const root = view.root, ud = root.userData || {};
    const nodes = {};
    for (const n of ['Ogre', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon']) { const o = root.getObjectByName(n); nodes[n] = o ? (o.parent ? o.parent.name : null) : 'AUSENTE'; }
    const keys = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'weapon'];
    return { id: u.id, me, rootName: root.name, scale: root.scale.y, anim: view.animator.unitType, nodes,
      nulos: keys.filter((k) => !ud[k] || !view.animator.meshParts[k]) };
  }));
  data.spawn = sp;
  if (sp.error) { rec('C1', 'spawn', false, sp.error); return; }
  rec('C1', 'spawn hero_skarn; raiz Ogre; animador ogre', sp.rootName === 'Ogre' && sp.anim === 'ogre', `id=${sp.id} escala=${sp.scale} nós=${JSON.stringify(sp.nodes)}`);
  rec('C2', 'rebind: userData e meshParts sem nulos', sp.nulos.length === 0, `nulos=[${sp.nulos}]`);
  const id = sp.id;
  const poses = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const an = view.animator, root = view.root;
    const out = {};
    for (const [anim, ts] of [['idle', [0.25]], ['walk', [0, 0.2, 0.4]], ['fight', [0.2, 0.5, 0.8]], ['cast', [0.5]]]) {
      an.setAnimation(anim, true); an.pause(); out[anim] = {};
      for (const t of ts) {
        an.setTime(t, false); root.updateMatrixWorld(true);
        const P = an.meshParts;
        out[anim][t] = { armR: P.armR.rotation.x, legL: P.legL.rotation.x, torsoY: P.torso.rotation.y, torsoX: P.torso.rotation.x, weaponX: P.weapon.rotation.x };
      }
    }
    an.setAnimation('idle', true); an.play();
    return out;
  }, id));
  data.poses = poses;
  if (poses.error) rec('C3', 'poses', false, poses.error);
  else {
    const legs = Object.values(poses.walk).map((p) => p.legL);
    const range = Math.max(...legs) - Math.min(...legs);
    const ok = range > 0.5 && Math.max(...Object.values(poses.fight).map((q) => Math.abs(q.torsoX))) > 0.15 && Math.abs(poses.cast[0.5].armR + 2.3) < 0.7;
    rec('C3', 'idle/walk/fight/cast mexem as partes (perna balança, Torso inclina no golpe, braços sobem na cast)', ok,
      `walk legL faixa=${range.toFixed(2)}; fight torso.x(0,2/0,5/0,8)=${Object.values(poses.fight).map((q) => q.torsoX.toFixed(2)).join('/')}; cast armR.x=${poses.cast[0.5].armR.toFixed(2)}; Weapon idle x=${poses.idle[0.25].weaponX.toFixed(3)}`);
  }
  const bp = await attempt(() => page.evaluate((uid) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); return { x: u.mesh.position.x, z: u.mesh.position.z, y: gm.entityViews.viewOf(u).root.position.y }; }, id));
  await camTo(page, bp.x, bp.y + 1.5, bp.z, 0.5, 1600);
  await attempt(() => shot(page, 'game-skarn-idle.png'));
  await camTo(page, bp.x, bp.y + 1.2, bp.z, 1.0, 1400);
  await attempt(() => shot(page, 'game-skarn-no-jogo.png'));
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
  await attempt(() => shot(page, 'game-skarn-andar.png'));
  rec('C4', 'andar ao vivo: animador em walk', walk.anim === 'walk', JSON.stringify(walk));
  const live = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager, me = gm.localPlayerId; const u = gm.entitiesById.get(uid);
    const enemy = gm.players.find((p) => p.id !== me).id;
    const foe = gm.spawnUnit('knight', u.mesh.position.x + 2.0, u.mesh.position.z, enemy);
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
    gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_horde_roar' });
    const cry = await watch(1500);
    u.mana = u.maxMana;
    gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_blood_pact' });
    const pact = await watch(1200);
    const pactStatus = Array.isArray(u.statuses) ? u.statuses.map((x) => x.type || x.id || x.name) : (u.statuses ? [...(u.statuses.keys ? u.statuses.keys() : Object.keys(u.statuses))] : null);
    u.mana = u.maxMana;
    gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_ground_slam', targetId: foe.id });
    const ember = await watch(1800);
    return { hit, cry, pact, pactStatus, ember, hp: [foe.maxHp, hp1, foe.hp], foeId: foe.id };
  }, id));
  data.live = live;
  if (live.error) { rec('C5', 'golpe/Rugido/Pacto/Impacto ao vivo', false, live.error); return; }
  rec('C5', 'golpe (fight), Rugido dos Clãs, Pacto de Sangue e Impacto no Solo (cast) entram nas animações e ferem o alvo',
    (live.hit.fight || 0) >= 3 && (live.cry.cast || 0) >= 2 && (live.pact.cast || 0) >= 1 && (live.ember.cast || 0) >= 2 && live.hp[2] < live.hp[0],
    `golpe=${JSON.stringify(live.hit)} rugido=${JSON.stringify(live.cry)} pacto=${JSON.stringify(live.pact)} (${JSON.stringify(live.pactStatus)}) impacto=${JSON.stringify(live.ember)} PV alvo ${live.hp.join(' -> ')}`);
  const p2 = await attempt(() => page.evaluate((uid) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); return { x: u.mesh.position.x, z: u.mesh.position.z }; }, id));
  await camTo(page, p2.x + 1, 1.8, p2.z, 0.45, 900);
  await page.evaluate(({ uid, fid }) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); gm.entitiesById.get(fid).hp = 6000; u.cooldowns = {}; u.mana = u.maxMana; gm.issue({ type: 'attack', playerId: gm.localPlayerId, unitIds: [uid], targetId: fid }); }, { uid: id, fid: live.foeId });
  await sleep(500); await attempt(() => shot(page, 'game-skarn-golpe.png'));
  await page.evaluate(({ uid }) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); u.mana = u.maxMana; u.cooldowns = {}; gm.issue({ type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId: 'hero_horde_roar' }); }, { uid: id });
  await sleep(500); await attempt(() => shot(page, 'game-skarn-rugido.png'));
  await sleep(1800);
  await page.evaluate(({ uid }) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); u.mana = u.maxMana; u.cooldowns = {}; gm.issue({ type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId: 'hero_blood_pact' }); }, { uid: id });
  await sleep(600); await attempt(() => shot(page, 'game-skarn-pacto.png'));
  await sleep(1200);
  await page.evaluate(({ uid, fid }) => { const gm = window.game.gameManager; const u = gm.entitiesById.get(uid); u.mana = u.maxMana; u.cooldowns = {}; gm.issue({ type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId: 'hero_ground_slam', targetId: fid }); }, { uid: id, fid: live.foeId });
  await sleep(600); await attempt(() => shot(page, 'game-skarn-impacto.png'));
  const team = await attempt(() => page.evaluate(async (uid) => {
    const { ModelFactory } = await import('/src/entities/ModelFactory.js');
    const gm = window.game.gameManager; const root = gm.entityViews.viewOf(gm.entitiesById.get(uid)).root;
    const cols = () => { const o = {}; root.traverse((c) => { if (!c.isMesh) return; for (const m of (Array.isArray(c.material) ? c.material : [c.material])) o[m.name] = '#' + m.color.getHexString(); }); return o; };
    const a = cols(); ModelFactory.setTeamColor(root, 0x2060d0); return { a, d: cols() };
  }, id));
  await sleep(2500);
  await attempt(() => shot(page, 'game-skarn-time-azul.png'));
  rec('C6', 'TeamColor azul muda só o material TeamColor', !team.error && team.a.TeamColor !== team.d.TeamColor && team.a.Atlas === team.d.Atlas,
    team.error || `TeamColor ${team.a.TeamColor} -> ${team.d.TeamColor}; Atlas ${team.a.Atlas} -> ${team.d.Atlas}`);
}

async function runInspector(page) {
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=hero_skarn_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
  await sleep(2500);
  const info = await attempt(() => page.evaluate(() => { const names = []; window.inspectorApp.currentModelObject.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); }); return names; }));
  rec('C7', 'inspetor: hero_skarn_glb carrega com os nós', Array.isArray(info) && NODES.every((n) => info.includes(n)), Array.isArray(info) ? info.join(',') : info.error);
  await attempt(() => shot(page, 'inspetor-skarn-idle.png'));
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; if (a) { a.setAnimation('fight', true); a.pause(); a.setTime(0.5, false); } }));
  await sleep(700);
  await attempt(() => shot(page, 'inspetor-skarn-golpe.png'));
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
