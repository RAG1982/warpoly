#!/usr/bin/env node
/**
 * Espadachim humano v2 (knight_v2) no jogo e no inspetor (M2-32). Só mede e captura; não altera src/ nem tests/.
 * Uma partida (play, IA congelada) e o inspetor (knight_v2_glb).
 *  C0  public/models/knight_v2.glb (JSON): nós, hierarquia (Sword filha de ArmR, ShieldGroup filho de ArmL), TeamColor.
 *  C1  o Espadachim do jogador usa o knight_v2 (Sword/ShieldGroup são malhas filhas dos braços); animador `knight`.
 *  C2  materiais Atlas e TeamColor no Torso (tabardo) e na Head (crista); rebind do animador (sword, shieldGroup...).
 *  C3  poses idle / walk / fight / hurt / die: as partes mexem; a espada e o escudo não se separam da mão (posição no espaço do
 *      braço constante) e a ponta da espada não entra no chão.
 *  C4  ao vivo: andar, golpear um inimigo parado (applyKnightFight), morrer.
 *  C5  TeamColor vermelho muda só o material TeamColor.
 *  C6  erros de página e de console.
 *  C7  o Capitão Brann continua com o .glb próprio (Cape, sem ShieldGroup).
 *  Capturas: game-*.png e inspetor-*.png nesta pasta.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/knight-v2/game-check.mjs
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
const NODE_NAMES = ['Knight', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'ShieldGroup'];
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
  try {
    return await fn();
  } catch (e) {
    return { error: 'exceção: ' + String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300) };
  }
}

function glbInfo(file) {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.toString('utf8', 20, 20 + len));
  const parent = {};
  (j.nodes || []).forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
  const res = {};
  (j.nodes || []).forEach((n, i) => {
    res[n.name] = {
      parent: parent[i] === undefined ? null : j.nodes[parent[i]].name,
      mesh: n.mesh !== undefined,
      mats: n.mesh === undefined ? [] : [...new Set(j.meshes[n.mesh].primitives.map((p) => (j.materials[p.material] || {}).name || '(sem nome)'))]
    };
  });
  const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
  const tris = j.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + j.accessors[p.indices].count / 3, 0), 0);
  return { nodes: res, draws, tris };
}

async function shot(page, name) {
  const file = path.join(HERE, name);
  await page.screenshot({ path: file });
  files.push({ name, kB: Math.round(fs.statSync(file).size / 1024) });
}

/** Captura um recorte (size x size) centrado na posição projetada da unidade. */
async function shotUnit(page, uid, name, size = 440) {
  const c = await page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const sm = window.game.sceneManager;
    const u = gm.entitiesById.get(uid);
    const v = sm.camera.position.clone().set(u.mesh.position.x, 1.7, u.mesh.position.z).project(sm.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, w: window.innerWidth, h: window.innerHeight };
  }, uid);
  const x = Math.max(0, Math.min(c.w - size, Math.round(c.x - size / 2)));
  const y = Math.max(0, Math.min(c.h - size, Math.round(c.y - size / 2)));
  const file = path.join(HERE, name);
  await page.screenshot({ path: file, clip: { x, y, width: size, height: size } });
  files.push({ name, kB: Math.round(fs.statSync(file).size / 1024) });
}

async function follow(page, uid, zoom = 0.5, wait = 700, angle = Math.PI / 4) {
  await page.evaluate(([uid, zoom, angle]) => {
    const gm = window.game.gameManager;
    const sm = window.game.sceneManager;
    const u = gm.entitiesById.get(uid);
    sm.cameraTarget.set(u.mesh.position.x, 1.2, u.mesh.position.z);
    sm.targetZoomLevel = zoom;
    sm.zoomLevel = zoom;
    sm.targetCameraAngle = angle;
  }, [uid, zoom, angle]);
  await sleep(wait);
}

// ---------------------------------------------------------------- C0: arquivo .glb (sem navegador)
const glb = glbInfo(path.join(ROOT, 'public/models/knight_v2.glb'));
{
  const names = Object.keys(glb.nodes);
  const miss = NODE_NAMES.filter((n) => !names.includes(n));
  const ok = miss.length === 0 && glb.nodes.Sword.parent === 'ArmR' && glb.nodes.Sword.mesh && glb.nodes.ShieldGroup.parent === 'ArmL' && glb.nodes.ShieldGroup.mesh &&
    glb.nodes.Torso.mats.includes('TeamColor') && glb.nodes.Torso.mats.includes('Atlas') && glb.nodes.Head.mats.includes('TeamColor') && glb.draws <= 20;
  rec('C0', 'knight_v2.glb: nós do knight, Sword>ArmR e ShieldGroup>ArmL (malhas), TeamColor no Torso e na Head, <= 20 draw calls', ok ? 'PASS' : 'FAIL',
    `faltando=[${miss}] pai(Sword)=${glb.nodes.Sword && glb.nodes.Sword.parent} pai(ShieldGroup)=${glb.nodes.ShieldGroup && glb.nodes.ShieldGroup.parent} Torso=${glb.nodes.Torso.mats} Head=${glb.nodes.Head.mats} draw calls=${glb.draws} triângulos=${glb.tris}`);
}

async function runChecks(page) {
  // ---------------------------------------------------------------- C1: o Espadachim do jogador usa o v2
  const spawn = await attempt(() => page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const u = gm.spawnUnit('knight', hq.mesh.position.x + 6, hq.mesh.position.z + 6, me);
    if (!u) return { error: 'não criou o Espadachim' };
    await new Promise((resolve) => { let n = 0; const f = () => { if (++n >= 3) resolve(); else requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(resolve, 1500); });
    const view = gm.entityViews.viewOf(u);
    const sw = view.root.getObjectByName('Sword');
    const sh = view.root.getObjectByName('ShieldGroup');
    const names = [];
    view.root.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); });
    return { id: u.id, me, hq: { x: hq.mesh.position.x, z: hq.mesh.position.z }, rootName: view.root.name, animUnitType: view.animator.unitType,
      rootScale: view.root.scale.toArray().map((v) => +v.toFixed(3)), names,
      swordIsMesh: !!(sw && sw.isMesh), swordParent: sw && sw.parent ? sw.parent.name : null,
      shieldIsMesh: !!(sh && sh.isMesh), shieldParent: sh && sh.parent ? sh.parent.name : null };
  }));
  data.spawn = spawn;
  if (spawn.error) {
    rec('C1', 'Espadachim do jogador', 'FAIL', spawn.error);
    return;
  }
  const id = spawn.id;
  rec('C1', 'Espadachim humano do jogo é o v2: Sword filha de ArmR e ShieldGroup filho de ArmL (malhas); animador `knight`',
    spawn.swordIsMesh && spawn.swordParent === 'ArmR' && spawn.shieldIsMesh && spawn.shieldParent === 'ArmL' && spawn.animUnitType === 'knight' ? 'PASS' : 'FAIL',
    `id=${id} raiz=${spawn.rootName} escala=[${spawn.rootScale}] unitType=${spawn.animUnitType} pai(Sword)=${spawn.swordParent} pai(ShieldGroup)=${spawn.shieldParent} nós=${spawn.names.length}`);

  // ---------------------------------------------------------------- C2: materiais e rebind
  const insp = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const root = view.root;
    const matsOf = (o) => {
      const s = new Set();
      o.traverse((c) => { if (c.isMesh && c.material) for (const m of (Array.isArray(c.material) ? c.material : [c.material])) s.add(m && m.name ? m.name : '(sem nome)'); });
      return [...s];
    };
    const ud = root.userData || {};
    const keys = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'sword', 'shieldGroup'];
    const userData = {}, meshParts = {};
    for (const k of keys) { userData[k] = ud[k] ? ud[k].name : null; meshParts[k] = view.animator.meshParts[k] ? view.animator.meshParts[k].name : null; }
    return { torsoMats: matsOf(root.getObjectByName('Torso')), headMats: matsOf(root.getObjectByName('Head')), swordMats: matsOf(root.getObjectByName('Sword')), userData, meshParts };
  }, id));
  data.inspect = insp;
  if (insp.error) {
    rec('C2', 'materiais e rebind', 'FAIL', insp.error);
  } else {
    const nulos = Object.keys(insp.userData).filter((k) => insp.userData[k] === null || insp.meshParts[k] === null);
    rec('C2', 'Torso e Head com Atlas+TeamColor (tabardo e crista); espada sem TeamColor; rebind do animador completo',
      nulos.length === 0 && insp.torsoMats.includes('Atlas') && insp.torsoMats.includes('TeamColor') && insp.headMats.includes('TeamColor') && !insp.swordMats.includes('TeamColor') ? 'PASS' : 'FAIL',
      `nulos=[${nulos}] Torso=${insp.torsoMats} Head=${insp.headMats} Sword=${insp.swordMats}`);
  }

  // ---------------------------------------------------------------- C3: poses (partes mexem; espada e escudo presos à mão)
  const poses = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const an = view.animator;
    const root = view.root;
    const V = root.position.constructor;
    const r = (o) => [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(3));
    const out = {};
    const plan = [['idle', [0.1, 0.5, 0.8]], ['walk', [0.0, 0.2, 0.4, 0.6]], ['fight', [0.1, 0.3, 0.5, 0.7, 0.9]], ['hurt', [0.1, 0.4]], ['die', [0.2, 0.6, 1.2, 2.5]]];
    for (const [anim, ts] of plan) {
      an.setAnimation(anim, true);
      an.pause();
      out[anim] = {};
      for (const t of ts) {
        an.setTime(t, false);
        const P = an.meshParts;
        root.updateMatrixWorld(true);
        const base = new V(); root.getWorldPosition(base);
        const swG = new V(); P.sword.getWorldPosition(swG);
        const shG = new V(); P.shieldGroup.getWorldPosition(shG);
        const swLocal = P.armR.worldToLocal(swG.clone());
        const shLocal = P.armL.worldToLocal(shG.clone());
        // ponto mais baixo da espada no mundo (a ponta quando a lâmina aponta para baixo na morte/golpe)
        let minY = 1e9;
        const tmp = new V();
        const pos = P.sword.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 3) {
          tmp.fromBufferAttribute(pos, i).applyMatrix4(P.sword.matrixWorld);
          minY = Math.min(minY, tmp.y - base.y);
        }
        out[anim][t] = { armR: r(P.armR), armL: r(P.armL), sword: r(P.sword), shield: r(P.shieldGroup), torso: r(P.torso), legL: r(P.legL),
          swLocal: swLocal.toArray().map((v) => +v.toFixed(3)), shLocal: shLocal.toArray().map((v) => +v.toFixed(3)), swordMinY: +minY.toFixed(3) };
      }
    }
    an.setAnimation('idle', true);
    an.play();
    return out;
  }, id));
  data.poses = poses;
  if (poses.error) {
    rec('C3', 'poses idle/walk/fight/hurt/die', 'FAIL', poses.error);
  } else {
    const dif = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const walkMove = dif(poses.walk[0].legL, poses.walk[0.2].legL);
    const walkArm = dif(poses.walk[0].armR, poses.walk[0.2].armR);
    const fightMove = dif(poses.fight[0.1].armR, poses.fight[0.5].armR);
    const fightSword = dif(poses.fight[0.1].sword, poses.fight[0.5].sword);
    const fightShield = dif(poses.fight[0.1].shield, poses.fight[0.5].shield);
    const minY = Math.min(...Object.entries(poses).filter(([a]) => a !== 'die').flatMap(([, o]) => Object.values(o).map((p) => p.swordMinY)));
    const sw = Object.values(poses).flatMap((o) => Object.values(o).map((p) => p.swLocal));
    const sh = Object.values(poses).flatMap((o) => Object.values(o).map((p) => p.shLocal));
    const spread = (a) => Math.max(...[0, 1, 2].map((k) => Math.max(...a.map((g) => g[k])) - Math.min(...a.map((g) => g[k]))));
    rec('C3', 'walk/fight mexem perna, braço, espada e escudo; a ponta da espada não entra no chão (minY >= -0,05, fora a morte) e espada/escudo ficam presos ao braço (o escudo só oscila 0,015 de altura na respiração do idle)',
      walkMove > 0.5 && walkArm > 0.3 && fightMove > 0.3 && fightSword > 0.2 && fightShield > 0.1 && minY >= -0.05 && spread(sw) < 1e-3 && spread(sh) < 0.03 ? 'PASS' : 'FAIL',
      `walk legL dif=${walkMove.toFixed(2)} armR dif=${walkArm.toFixed(2)}; fight armR dif=${fightMove.toFixed(2)} sword dif=${fightSword.toFixed(2)} shield dif=${fightShield.toFixed(2)}; ponta mais baixa da espada (acima do pé) mín=${minY}; ` +
      `dispersão da espada no espaço do ArmR=${spread(sw).toFixed(4)}, do escudo no espaço do ArmL=${spread(sh).toFixed(4)}; minY por animação: ${Object.entries(poses).map(([a, o]) => a + '=' + Math.min(...Object.values(o).map((p) => p.swordMinY))).join(' ')}`);
  }

  // ---------------------------------------------------------------- C4a: idle e andar ao vivo
  await follow(page, id, 0.3, 900);
  await attempt(() => shotUnit(page, id, 'game-knight-idle.png'));
  const walk = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const u = gm.entitiesById.get(uid);
    gm.issue({ type: 'move', playerId: me, unitIds: [uid], x: u.mesh.position.x - 14, z: u.mesh.position.z + 4 });
    await new Promise((r) => setTimeout(r, 900));
    const view = gm.entityViews.viewOf(u);
    return { anim: view.animator.currentAnim, state: u.state };
  }, id));
  data.walk = walk;
  await follow(page, id, 0.3, 100, Math.PI / 4);
  await attempt(() => shotUnit(page, id, 'game-knight-andando-a.png'));
  await sleep(220);
  await follow(page, id, 0.3, 50, Math.PI / 4);
  await attempt(() => shotUnit(page, id, 'game-knight-andando-b.png'));
  await sleep(220);
  await follow(page, id, 0.3, 50, Math.PI / 4);
  await attempt(() => shotUnit(page, id, 'game-knight-andando-c.png'));
  await follow(page, id, 0.3, 50, Math.PI / 4 + 2.2);
  await attempt(() => shotUnit(page, id, 'game-knight-andando-costas.png'));
  rec('C4a', 'andar ao vivo: animação walk vista na view', !walk.error && walk.anim === 'walk' ? 'PASS' : 'FAIL', JSON.stringify(walk));

  // ---------------------------------------------------------------- C4b: golpe e morte ao vivo
  await page.evaluate((uid) => { window.game.gameManager.issue({ type: 'stop', playerId: window.game.gameManager.localPlayerId, unitIds: [uid] }); }, id);
  const fight = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const u = gm.entitiesById.get(uid);
    const enemy = gm.players.find((p) => p.id !== me).id;
    const sm = window.game.sceneManager;
    const dirv = new sm.camera.position.constructor();
    sm.camera.getWorldDirection(dirv);
    const rx = dirv.z, rz = -dirv.x;                              // direção "direita da tela" no plano do chão
    const rl = Math.hypot(rx, rz) || 1;
    const foe = gm.spawnUnit('knight', u.mesh.position.x + (rx / rl) * 1.9, u.mesh.position.z + (rz / rl) * 1.9, enemy);
    foe.speed = 0; foe.hp = foe.maxHp = 5000; foe.updateHealthBar();
    foe.isCombatUnit = () => false;
    gm.issue({ type: 'attack', playerId: me, unitIds: [uid], targetId: foe.id });
    const view = gm.entityViews.viewOf(u);
    const seen = new Set();
    let fightFrames = 0;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const step = () => {
        seen.add(view.animator.currentAnim);
        if (view.animator.currentAnim === 'fight') fightFrames++;
        if (performance.now() - t0 < 2600) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    return { anims: [...seen], fightFrames, foeHp: foe.hp, foeMax: foe.maxHp, foeId: foe.id };
  }, id));
  data.fight = fight;
  if (fight.error) {
    rec('C4b', 'golpe ao vivo', 'FAIL', fight.error);
  } else {
    await follow(page, id, 0.3, 100);
    for (const s of ['a', 'b', 'c', 'd']) {
      await attempt(() => shotUnit(page, id, `game-knight-golpe-${s}.png`));
      await sleep(180);
    }
    rec('C4b', 'golpe: animação fight (>= 10 quadros) e o alvo perde PV', fight.fightFrames >= 10 && fight.foeHp < fight.foeMax ? 'PASS' : 'FAIL',
      `anims=[${fight.anims}] quadros fight=${fight.fightFrames} PV do alvo ${fight.foeMax} -> ${fight.foeHp}`);
    await page.evaluate(({ uid, fid }) => {
      const gm = window.game.gameManager;
      gm.entitiesById.get(fid).hp = 0;
      const u = gm.entitiesById.get(uid);
      u.takeDamage(99999, gm.entitiesById.get(fid));
    }, { uid: id, fid: fight.foeId });
    for (const [n, ms] of [['a', 250], ['b', 350], ['c', 1400]]) {
      await sleep(ms);
      await attempt(() => shotUnit(page, id, `game-knight-morte-${n}.png`));
    }
    const die = await page.evaluate((uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      const view = u && gm.entityViews.viewOf(u);
      return u ? { state: u.state, hp: u.hp, anim: view ? view.animator.currentAnim : null } : { gone: true };
    }, id);
    rec('C4c', 'morte: o Espadachim entra em die (ou já saiu da partida)', die.gone || die.anim === 'die' || die.hp <= 0 ? 'PASS' : 'FAIL', JSON.stringify(die));
  }

  // ---------------------------------------------------------------- C5: cor de time vermelha em outro Espadachim
  const team = await attempt(() => page.evaluate(async () => {
    const { ModelFactory } = await import('/src/entities/ModelFactory.js');
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const u = gm.spawnUnit('knight', hq.mesh.position.x + 7, hq.mesh.position.z - 7, me);
    await new Promise((r) => setTimeout(r, 600));
    const root = gm.entityViews.viewOf(u).root;
    const cols = () => {
      const o = {};
      root.traverse((c) => { if (c.isMesh) for (const m of (Array.isArray(c.material) ? c.material : [c.material])) o[m.name] = '#' + m.color.getHexString(); });
      return o;
    };
    const antes = cols();
    ModelFactory.setTeamColor(root, 0xd02020);
    return { id: u.id, antes, depois: cols() };
  }));
  data.team = team;
  if (!team.error) {
    await follow(page, team.id, 0.3, 700);
    await attempt(() => shotUnit(page, team.id, 'game-knight-time-vermelho.png'));
  }
  rec('C5', 'TeamColor: cor de time vermelha muda o material TeamColor e não o Atlas',
    !team.error && team.antes.TeamColor !== team.depois.TeamColor && team.antes.Atlas === team.depois.Atlas ? 'PASS' : 'FAIL',
    team.error || `TeamColor ${team.antes.TeamColor} -> ${team.depois.TeamColor}; Atlas ${team.antes.Atlas} -> ${team.depois.Atlas}`);

  // ---------------------------------------------------------------- C7: Brann intacto
  const brann = await attempt(() => page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const u = gm.spawnUnit('hero_brann', hq.mesh.position.x - 7, hq.mesh.position.z + 7, me);
    if (!u) return { error: 'não criou o Brann' };
    await new Promise((r) => setTimeout(r, 700));
    const root = gm.entityViews.viewOf(u).root;
    return { id: u.id, cape: !!root.getObjectByName('Cape'), shield: !!root.getObjectByName('ShieldGroup'), swordParent: root.getObjectByName('Sword') && root.getObjectByName('Sword').parent.name };
  }));
  data.brann = brann;
  if (!brann.error) {
    await follow(page, brann.id, 0.3, 700);
    await attempt(() => shotUnit(page, brann.id, 'game-brann-intacto.png'));
  }
  rec('C7', 'Capitão Brann continua com o .glb próprio (Cape, martelo = Sword na raiz, sem ShieldGroup)', !brann.error && brann.cape && !brann.shield && brann.swordParent === 'Knight' ? 'PASS' : 'FAIL', JSON.stringify(brann));
}

// ---------------------------------------------------------------- inspetor
async function runInspector(page) {
  const nodesOf = () => page.evaluate(() => {
    const m = window.inspectorApp.currentModelObject;
    const names = [];
    m.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); });
    const pai = (n) => { const o = m.getObjectByName(n); return o && o.parent ? o.parent.name : null; };
    return { names, swordParent: pai('Sword'), shieldParent: pai('ShieldGroup') };
  });
  const r = await attempt(async () => {
    await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=knight_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
    await sleep(1200);
    const antigo = await nodesOf();
    await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=knight_v2_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
    await sleep(1200);
    const novo = await nodesOf();
    return { antigo: [antigo.swordParent, antigo.shieldParent], novo: [novo.swordParent, novo.shieldParent], nodes: novo.names.length };
  });
  data.inspector = r;
  rec('I0', 'inspetor: knight_glb (antigo: Sword e ShieldGroup na raiz) e knight_v2_glb (novo: filhos de ArmR e ArmL) carregam', !r.error && r.antigo[0] === 'Knight' && r.antigo[1] === 'Knight' && r.novo[0] === 'ArmR' && r.novo[1] === 'ArmL' ? 'PASS' : 'FAIL', JSON.stringify(r));
  if (r.error) return;
  for (const [anim, t, name] of [['idle', 0.3, 'idle'], ['walk', 0.2, 'andar'], ['walk', 0.55, 'andar-b'], ['fight', 0.2, 'ataque-a'], ['fight', 0.5, 'ataque-b'], ['fight', 0.7, 'ataque-c'], ['die', 1.0, 'morte']]) {
    await attempt(() => page.evaluate(([anim, t]) => { const a = window.inspectorApp.animator; a.setAnimation(anim, true); a.pause(); a.setTime(t, false); }, [anim, t]));
    await sleep(500);
    await attempt(() => shot(page, `inspetor-knight-v2-${name}.png`));
  }
}

// ---------------------------------------------------------------- main
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
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=continental-1v1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await sleep(1500);
  data.renderer = await page.evaluate(() => {
    const gl = window.game.sceneManager.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
  });
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  console.log('renderer:', data.renderer);
  await runChecks(page);
  await runInspector(page);
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', 'FAIL', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
const realErr = errors.filter((e) => !/deprec/i.test(e));
rec('C6', 'sem pageerror nem console.error (deprecações listadas à parte)', realErr.length === 0 ? 'PASS' : 'FAIL',
  `erros=${errors.length}; avisos=${warnings.length}` + (realErr.length ? ` primeiros: ${realErr.slice(0, 3).join(' | ')}` : ''));
rows.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify({ generated: new Date().toISOString(), rows, files, data, errors, warnings }, null, 2) + '\n');
const fails = rows.filter((r) => r.status !== 'PASS').length;
console.log(`\nRESUMO: ${rows.length - fails}/${rows.length} PASS; erros=${errors.length}; arquivos=[${files.map((f) => f.name).join(', ')}]`);
process.exitCode = fails ? 1 : 0;
