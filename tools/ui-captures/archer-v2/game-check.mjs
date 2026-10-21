#!/usr/bin/env node
/**
 * Arqueiro v2 (archer_v2) no jogo e no inspetor (M2-31). Só mede e captura; não altera src/ nem tests/.
 * Uma partida (continental-1v1, IA congelada) e o inspetor (archer_v2_glb).
 *  C0  public/models/archer_v2.glb (JSON do arquivo): nós, hierarquia (ForeArmL>ArmL, Bow>ForeArmL, ForeArmR>ArmR, cordas e flecha
 *      no Bow), TeamColor no Torso, <= 20 draw calls, textura <= 512².
 *  C1  spawn de archer e ranger perto do HQ; as duas views usam o archer_v2 (ForeArmL presente); animador no tipo `archer`.
 *  C2  nós na view; materiais Atlas e TeamColor.
 *  C3  rebind: userData e meshParts (bow, foreArmL, foreArmR, updateBowString, drawnArrow) não nulos.
 *  C4  poses do disparo: o arco fica em pé (eixo y local do Bow no mundo >= 0,95) e com a barriga para a frente do atirador; o braço
 *      do arco fica reto (ombro-cotovelo-arco quase colineares) com o arco levantado; a flecha encaixada aparece só enquanto a corda
 *      é puxada; a ponta dos dedos do ArmR/ForeArmR chega ao encaixe da corda (distância em m).
 *  C5  caminhada ao vivo por 1 s.
 *  C6  TeamColor: cor de time vermelha muda o material TeamColor (Torso) sem tocar no Atlas.
 *  C7  erros de página e de console (deprecações listadas à parte).
 *  C8  capturas: idle, andar, disparar (mira, corda puxada, flecha em voo), morrer, time vermelho, Arqueiro x Patrulheiro.
 *  C10 disparo ao vivo: a view entra em 'fight', a flecha (projétil da simulação) nasce NO ARCO (deslocamento visual) e volta à
 *      trajetória; o alvo perde PV.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/archer-v2/game-check.mjs
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
const PORT = 5481;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const NODE_NAMES = ['Archer', 'Torso', 'Head', 'ArmL', 'ForeArmL', 'ArmR', 'ForeArmR', 'LegL', 'LegR', 'Bow', 'BowTipTop', 'BowTipBottom',
  'BowStringTop', 'BowStringBottom', 'DrawnArrow'];
const PARENTS = { ForeArmL: 'ArmL', Bow: 'ForeArmL', ForeArmR: 'ArmR', BowStringTop: 'Bow', BowStringBottom: 'Bow', DrawnArrow: 'Bow',
  BowTipTop: 'Bow', BowTipBottom: 'Bow', ArmL: 'Archer', ArmR: 'Archer', Torso: 'Archer', Head: 'Archer' };
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

/** Lê o JSON de um .glb: nós (com pai e malha), materiais por nó, draw calls, imagens. */
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
      mats: n.mesh === undefined ? [] : [...new Set(j.meshes[n.mesh].primitives.map((p) => (j.materials[p.material] || {}).name || '(sem nome)'))]
    };
  });
  const draws = j.meshes.reduce((s, m) => s + m.primitives.length, 0);
  const tris = j.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + j.accessors[p.indices].count / 3, 0), 0);
  return { nodes: res, draws, tris, images: (j.images || []).length };
}

async function shot(page, name) {
  const file = path.join(HERE, name);
  await page.screenshot({ path: file });
  files.push({ name, kB: Math.round(fs.statSync(file).size / 1024) });
}

async function camTo(page, x, y, z, zoom, wait = 1400, angle = Math.PI / 4) {
  await page.evaluate(([x, y, z, zoom, angle]) => {
    const sm = window.game.sceneManager;
    sm.minZoom = 0.05;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = angle;
  }, [x, y, z, zoom, angle]);
  await sleep(wait);
}

function posOf(page, uid) {
  return page.evaluate((u) => {
    const gm = window.game.gameManager;
    const un = gm.entitiesById.get(u);
    return { x: un.mesh.position.x, y: gm.entityViews.viewOf(un).root.position.y, z: un.mesh.position.z };
  }, uid);
}

// ---------------------------------------------------------------- C0: arquivo .glb (sem navegador)
const glb = glbInfo(path.join(ROOT, 'public/models/archer_v2.glb'));
{
  const names = Object.keys(glb.nodes);
  const miss = NODE_NAMES.filter((n) => !names.includes(n));
  const badParent = Object.entries(PARENTS).filter(([n, p]) => !glb.nodes[n] || glb.nodes[n].parent !== p).map(([n, p]) => `${n}!=${p}`);
  const ok = miss.length === 0 && badParent.length === 0 && glb.nodes.Torso.mats.includes('TeamColor') && glb.nodes.Torso.mats.includes('Atlas') &&
    glb.draws <= 20 && glb.images === 1;
  rec('C0', 'archer_v2.glb: 15 nós com a hierarquia do arco, Torso com Atlas+TeamColor, <= 20 draw calls, 1 textura', ok ? 'PASS' : 'FAIL',
    `faltando=[${miss}] pais errados=[${badParent}] Torso=${glb.nodes.Torso.mats} draw calls=${glb.draws} triângulos=${glb.tris} imagens=${glb.images}`);
}

async function spawnNear(page, type, dist) {
  return page.evaluate(async ([type, dist]) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    if (!hq) return { error: 'sem HQ do jogador local' };
    const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
    let spot = null;
    for (let r = dist; r <= 40 && !spot; r += 3) {
      for (let a = 0; a < 360 && !spot; a += 30) {
        const x = hx + Math.cos((a * Math.PI) / 180) * r, z = hz + Math.sin((a * Math.PI) / 180) * r;
        if (!gm.pathfinder.isWater(x, z) && gm.canPlaceBuilding('orc_house', x, z, null, me)) spot = { x, z };
      }
    }
    if (!spot) return { error: 'sem ponto livre perto do HQ' };
    const u = gm.spawnUnit(type, spot.x, spot.z, me);
    if (!u) return { error: `spawnUnit(${type}) devolveu null` };
    await new Promise((resolve) => {
      let n = 0;
      const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
      setTimeout(resolve, 1500);
    });
    const view = gm.entityViews.viewOf(u);
    if (!view) return { error: `sem view de ${type}` };
    return {
      id: u.id, type: u.type, me, hq: { x: hx, z: hz }, spot, rootName: view.root.name,
      rootScale: view.root.scale.toArray().map((v) => +v.toFixed(3)), animUnitType: view.animator.unitType,
      hasForeArmL: !!view.root.getObjectByName('ForeArmL')
    };
  }, [type, dist]);
}

async function runChecks(page) {
  // ---------------------------------------------------------------- C1: spawn
  const spawn = await attempt(() => spawnNear(page, 'archer', 9));
  data.spawn = spawn;
  if (spawn.error) {
    rec('C1', 'spawn archer perto do HQ', 'FAIL', spawn.error);
    return;
  }
  const id = spawn.id;
  const rg = await attempt(() => spawnNear(page, 'ranger', 12));
  data.rangerSpawn = rg;
  rec('C1', 'archer e ranger usam o archer_v2 (ForeArmL na view); animador no tipo archer; raiz Archer',
    spawn.animUnitType === 'archer' && spawn.rootName === 'Archer' && spawn.hasForeArmL && !rg.error && rg.hasForeArmL && rg.animUnitType === 'archer' ? 'PASS' : 'FAIL',
    `archer: raiz=${spawn.rootName} escala=[${spawn.rootScale}] unitType=${spawn.animUnitType} ForeArmL=${spawn.hasForeArmL}; ranger: ${rg.error || `raiz=${rg.rootName} unitType=${rg.animUnitType} ForeArmL=${rg.hasForeArmL}`}; GET archer_v2.glb=${data.glbHttpStatus}`);

  // ---------------------------------------------------------------- C2, C3: nós, materiais, rebind
  const insp = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const root = view.root;
    const matsOf = (o) => {
      const s = new Set();
      o.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        for (const m of (Array.isArray(c.material) ? c.material : [c.material])) s.add(m && m.name ? m.name : '(sem nome)');
      });
      return [...s];
    };
    const found = {};
    for (const n of ['Archer', 'Torso', 'Head', 'ArmL', 'ForeArmL', 'ArmR', 'ForeArmR', 'LegL', 'LegR', 'Bow', 'BowStringTop', 'BowStringBottom', 'DrawnArrow']) {
      const o = root.getObjectByName(n);
      found[n] = o ? { parent: o.parent ? o.parent.name : null, mats: matsOf(o) } : null;
    }
    const an = view.animator;
    const ud = root.userData || {};
    const userData = {}, meshParts = {};
    for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'bow', 'foreArmL', 'foreArmR', 'drawnArrow']) {
      userData[k] = ud[k] ? ud[k].name : null;
      meshParts[k] = an.meshParts[k] ? an.meshParts[k].name : null;
    }
    userData.updateBowString = typeof ud.updateBowString;
    meshParts.updateBowString = typeof an.meshParts.updateBowString;
    return { found, userData, meshParts };
  }, id));
  data.inspect = insp;
  if (insp.error) {
    rec('C2', 'nós e materiais na view', 'FAIL', insp.error);
    rec('C3', 'rebind do animador', 'FAIL', 'não medido');
  } else {
    const f = insp.found;
    const miss = Object.keys(f).filter((n) => !f[n]);
    const okMat = f.Torso && f.Torso.mats.includes('Atlas') && f.Torso.mats.includes('TeamColor');
    rec('C2', 'view com os nós do arco e dos cotovelos; Torso com Atlas+TeamColor',
      miss.length === 0 && okMat && f.ForeArmL.parent === 'ArmL' && f.Bow.parent === 'ForeArmL' && f.ForeArmR.parent === 'ArmR' ? 'PASS' : 'FAIL',
      `faltando=[${miss}] Torso=${f.Torso && f.Torso.mats} pai(Bow)=${f.Bow && f.Bow.parent} pai(ForeArmL)=${f.ForeArmL && f.ForeArmL.parent} pai(ForeArmR)=${f.ForeArmR && f.ForeArmR.parent}`);
    const nulos = Object.keys(insp.meshParts).filter((k) => !insp.meshParts[k] || insp.meshParts[k] === 'undefined') .concat(Object.keys(insp.userData).filter((k) => !insp.userData[k] || insp.userData[k] === 'undefined'));
    rec('C3', 'rebind: userData e meshParts do animador (torso..legR, bow, foreArmL, foreArmR, drawnArrow, updateBowString)', nulos.length === 0 ? 'PASS' : 'FAIL',
      `nulos=[${nulos}] userData=${JSON.stringify(insp.userData)}`);
  }

  // ---------------------------------------------------------------- C4: poses de disparo (geometria no mundo)
  const poses = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const u = gm.entitiesById.get(uid);
    const view = gm.entityViews.viewOf(u);
    const an = view.animator;
    const root = view.root;
    const V = root.position.constructor;
    const P = an.meshParts;
    const wpos = (o, lx = 0, ly = 0, lz = 0) => { o.updateWorldMatrix(true, false); return new V(lx, ly, lz).applyMatrix4(o.matrixWorld); };
    const wdir = (o, x, y, z) => { o.updateWorldMatrix(true, false); return new V(x, y, z).transformDirection(o.matrixWorld); };
    const out = {};
    const variantAntes = an.attackVariant;
    an.setAttackVariant(0);                      // progresso linear: os instantes abaixo viram as fases do disparo
    for (const [anim, ts] of [['idle', [0.1, 0.5, 0.8]], ['walk', [0.0, 0.2, 0.4]], ['fight', [0.1, 0.2, 0.3, 0.4, 0.5, 0.62, 0.7, 0.85]]]) {
      an.setAnimation(anim, true);
      an.pause();
      out[anim] = {};
      for (const t of ts) {
        an.setTime(t, false);
        root.updateMatrixWorld(true);
        const bowUp = wdir(P.bow, 0, 1, 0);
        const bowFwd = wdir(P.bow, 0, 0, 1);             // barriga do arco
        const rootFwd = wdir(root, 0, 0, 1);
        const sh = wpos(P.armL), el = wpos(P.foreArmL), bw = wpos(P.bow);
        const a = el.clone().sub(sh), b = bw.clone().sub(el);
        const straight = Math.acos(Math.min(1, Math.max(-1, a.normalize().dot(b.normalize())))) * 180 / Math.PI;
        const draw = P.drawnArrow ? { vis: P.drawnArrow.visible, z: +P.drawnArrow.position.z.toFixed(3) } : null;
        const nock = wpos(P.bow, 0, 0, draw && draw.vis ? draw.z : 0);
        const tip = wpos(P.foreArmR, 0.012, -0.62, 0.01);        // ponta dos dedos (local do ForeArmR, vinda do Blender)
        out[anim][t] = {
          bowUpY: +bowUp.y.toFixed(3), bellyDotFwd: +bowFwd.dot(rootFwd).toFixed(3), elbowAngleDeg: +straight.toFixed(1),
          armLx: +P.armL.rotation.x.toFixed(3), foreRx: +P.foreArmR.rotation.x.toFixed(3),
          arrow: draw, handToNock: +tip.distanceTo(nock).toFixed(3), bowHeight: +(bw.y - root.position.y).toFixed(3)
        };
      }
    }
    an.setAttackVariant(variantAntes);
    an.setAnimation('idle', true);
    an.play();
    return out;
  }, id));
  data.poses = poses;
  if (poses.error) {
    rec('C4', 'poses idle/walk/fight', 'FAIL', poses.error);
  } else {
    const f = poses.fight;
    const aim = [0.3, 0.4, 0.5, 0.62].map((t) => f[t]);
    const upMin = Math.min(...Object.values(poses.idle).map((p) => p.bowUpY), ...Object.values(poses.walk).map((p) => p.bowUpY));
    const aimUp = Math.min(...aim.map((p) => p.bowUpY));
    const straightMax = Math.max(...aim.map((p) => p.elbowAngleDeg));
    const arrowOnlyDraw = [0.4, 0.5, 0.62].every((t) => f[t].arrow && f[t].arrow.vis) && [0.1, 0.2, 0.7, 0.85].every((t) => f[t].arrow && !f[t].arrow.vis) &&
      poses.idle[0.5].arrow && !poses.idle[0.5].arrow.vis;
    const reach = Math.max(f[0.4].handToNock, f[0.5].handToNock, f[0.62].handToNock);
    rec('C4', 'disparo: arco em pé (eixo y >= 0,95), braço do arco reto (< 25°) e levantado, flecha só enquanto puxa, dedos no encaixe (<= 0,12 m)',
      aimUp >= 0.95 && upMin >= 0.7 && straightMax < 25 && arrowOnlyDraw && reach <= 0.12 ? 'PASS' : 'FAIL',
      `bow eixo y: repouso/andar mín=${upMin} mira mín=${aimUp}; ângulo ombro-cotovelo-arco máx na mira=${straightMax}°; flecha=${arrowOnlyDraw}; dedos-encaixe t0,4=${f[0.4].handToNock} t0,5=${f[0.5].handToNock} t0,62=${f[0.62].handToNock} m; ` +
      `barriga·frente t0,5=${f[0.5].bellyDotFwd}; armL.x t0,5=${f[0.5].armLx}; ForeArmR.x t0,5=${f[0.5].foreRx}; altura do arco t0,5=${f[0.5].bowHeight}`);
  }

  // ---------------------------------------------------------------- C5: caminhada ao vivo
  const bPre = await attempt(() => posOf(page, id));
  let walk = { error: 'sem posição' };
  if (!bPre.error) {
    await camTo(page, bPre.x, bPre.y + 1.2, bPre.z, 0.9, 1200);
    walk = await attempt(() => page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      let tgt = null;
      for (let a = 0; a < 360 && !tgt; a += 30) {
        const x = u.mesh.position.x + Math.cos((a * Math.PI) / 180) * 12;
        const z = u.mesh.position.z + Math.sin((a * Math.PI) / 180) * 12;
        if (!gm.pathfinder.isWater(x, z)) tgt = gm.pathfinder.findNearestWalkable(x, z);
      }
      if (!tgt) return { error: 'sem destino a 12 u' };
      const p0 = { x: u.mesh.position.x, z: u.mesh.position.z };
      gm.issue({ type: 'move', playerId: gm.localPlayerId, unitIds: [uid], x: tgt.x, z: tgt.z });
      const samples = [];
      const t0 = performance.now();
      await new Promise((resolve) => {
        setTimeout(resolve, 2500);
        const step = () => {
          const an = gm.entityViews.viewOf(u).animator;
          const P = an.meshParts;
          samples.push({ anim: an.currentAnim, legL: P.legL.rotation.x, armR: P.armR.rotation.x });
          if (performance.now() - t0 < 1000) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      const w = samples.filter((s) => s.anim === 'walk');
      const rng = (k) => (w.length ? Math.max(...w.map((s) => s[k])) - Math.min(...w.map((s) => s[k])) : 0);
      return { frames: samples.length, walkFrames: w.length, legRange: +rng('legL').toFixed(3), armRange: +rng('armR').toFixed(3),
        moved: +Math.hypot(u.mesh.position.x - p0.x, u.mesh.position.z - p0.z).toFixed(2) };
    }, id));
  }
  data.walk = walk;
  rec('C5', 'caminhada ao vivo por 1 s: pernas e braço balançam', !walk.error && walk.walkFrames >= 10 && walk.legRange > 0.5 ? 'PASS' : 'FAIL',
    walk.error || `quadros=${walk.frames} com walk=${walk.walkFrames} faixa legL.x=${walk.legRange} rad armR.x=${walk.armRange} rad deslocou=${walk.moved} u`);

  // ---------------------------------------------------------------- C10 (primeiro, para o arqueiro ficar de frente para o alvo) e capturas
  const bPost = await attempt(() => posOf(page, id));
  if (!bPost.error) {
    // a view chama setAnimation/update/setTime a cada quadro: para posar o arqueiro, os métodos da instância são trocados por vazios e
    // as poses usam os originais (guardados em an._orig). `release` devolve o animador ao normal.
    const setPose = (anim, t) => page.evaluate(([uid, anim, t]) => {
      const gm = window.game.gameManager;
      const an = gm.entityViews.viewOf(gm.entitiesById.get(uid)).animator;
      if (!an._orig) {
        an._orig = { setAnimation: an.setAnimation, update: an.update, setTime: an.setTime, advanceBlend: an.advanceBlend };
        an.setAnimation = () => {}; an.update = () => {}; an.setTime = () => {}; an.advanceBlend = () => {};
      }
      an._orig.setAnimation.call(an, anim, true);
      an.pause();
      an._orig.setTime.call(an, t, false);
    }, [id, anim, t]);
    const release = () => page.evaluate((uid) => {
      const gm = window.game.gameManager;
      const an = gm.entityViews.viewOf(gm.entitiesById.get(uid)).animator;
      if (an._orig) {
        an.setAnimation = an._orig.setAnimation; an.update = an._orig.update; an.setTime = an._orig.setTime; an.advanceBlend = an._orig.advanceBlend;
        delete an._orig;
      }
      an.setAnimation('idle', true); an.play();
    }, id);
    const mid = { x: (spawn.hq.x + bPost.x) / 2, z: (spawn.hq.z + bPost.z) / 2 };
    await camTo(page, mid.x, 1.5, mid.z, 1.0, 1600);
    await attempt(() => shot(page, 'game-archer-no-jogo.png'));

    // C10: disparo ao vivo contra um alvo parado a ~7 u
    const live = await attempt(() => page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const sess = window.game.session;
      const me = gm.localPlayerId;
      const u = gm.entitiesById.get(uid);
      const enemy = gm.players.find((p) => p.id !== me).id;
      const foe = gm.spawnUnit('knight', u.mesh.position.x + 7, u.mesh.position.z + 2, enemy);
      foe.speed = 0; foe.hp = foe.maxHp = 5000; foe.updateHealthBar();
      foe.isCombatUnit = () => false;
      const view = gm.entityViews.viewOf(u);
      const V = view.root.position.constructor;
      const P = view.animator.meshParts;
      gm.issue({ type: 'attack', playerId: me, unitIds: [uid], targetId: foe.id });
      const out = { fightFrames: 0, frames: 0, anims: new Set(), arrows: 0, firstDistToBow: null, simStartToBow: null, laterOffset: null };
      const t0 = performance.now();
      let tracked = null;
      const segDist = (m, a) => {   // distância da malha ao segmento prev -> pos (a malha usa a interpolação do tick)
        const ab = new V(a.pos.x - a.prev.x, a.pos.y - a.prev.y, a.pos.z - a.prev.z);
        const am = new V(m.x - a.prev.x, m.y - a.prev.y, m.z - a.prev.z);
        const t = ab.lengthSq() > 1e-12 ? Math.min(1, Math.max(0, am.dot(ab) / ab.lengthSq())) : 0;
        return am.sub(ab.multiplyScalar(t)).length();
      };
      await new Promise((resolve) => {
        const seen = new Set();
        const step = () => {
          out.frames++;
          out.anims.add(view.animator.currentAnim);
          if (view.animator.currentAnim === 'fight') out.fightFrames++;
          for (const a of gm.arrows) {
            if (a.isDead) continue;
            const v = sess.projectileViews.views.get(a);
            if (!v) continue;
            if (!seen.has(a)) {
              seen.add(a);
              out.arrows++;
              if (tracked === null) {
                tracked = a;
                P.bow.updateWorldMatrix(true, false);
                const bow = new V(0.05, 0, 0.3).applyMatrix4(P.bow.matrixWorld);
                out.firstDistToBow = +bow.distanceTo(v.mesh.position).toFixed(3);
                out.simStartToBow = +bow.distanceTo(new V(a.start.x, a.start.y, a.start.z)).toFixed(3);
              }
            }
            if (a === tracked && a.progress > 0.3 && out.laterOffset === null) out.laterOffset = +segDist(v.mesh.position, a).toFixed(3);
          }
          if (performance.now() - t0 < 4500) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      out.anims = [...out.anims];
      out.foeHp = foe.hp; out.foeMax = foe.maxHp; out.foeId = foe.id;
      return out;
    }, id));
    data.live = live;
    if (live.error) {
      rec('C10', 'disparo ao vivo', 'FAIL', live.error);
    } else {
      const ok = live.fightFrames >= 5 && live.arrows >= 1 && live.firstDistToBow !== null && live.firstDistToBow < 0.3 && live.simStartToBow > 0.25 &&
        live.laterOffset !== null && live.laterOffset < 0.05 && live.foeHp < live.foeMax;
      rec('C10', 'disparo ao vivo: a view entra em fight, a flecha nasce no arco (< 0,3 m do ponto do arco; a origem da sim fica a > 0,25 m) e volta à trajetória; o alvo perde PV', ok ? 'PASS' : 'FAIL',
        `quadros fight=${live.fightFrames}/${live.frames} anims=[${live.anims}] flechas=${live.arrows}; 1º quadro: malha a ${live.firstDistToBow} m do arco (origem da sim a ${live.simStartToBow} m); ` +
        `desvio da malha à trajetória em progress > 0,3 = ${live.laterOffset} m; PV do alvo ${live.foeMax} -> ${live.foeHp}`);
      // capturas da flecha saindo do arco (lado, câmera perto): novo disparo
      const oPos = await attempt(() => posOf(page, id));
      await camTo(page, oPos.x + 1.5, oPos.y + 1.4, oPos.z + 0.3, 0.15, 1400, Math.PI / 2);
      await attempt(() => page.evaluate(({ uid, fid }) => {
        const gm = window.game.gameManager;
        gm.issue({ type: 'attack', playerId: gm.localPlayerId, unitIds: [uid], targetId: fid });
      }, { uid: id, fid: live.foeId }));
      const caught = await attempt(() => page.evaluate(async () => {
        const gm = window.game.gameManager;
        const sess = window.game.session;
        return await new Promise((resolve) => {
          const t0 = performance.now();
          const step = () => {
            const alive = gm.arrows.filter((a) => !a.isDead && sess.projectileViews.views.has(a));
            if (alive.length) { resolve({ progress: alive[0].progress }); return; }
            if (performance.now() - t0 > 4000) resolve({ error: 'sem flecha' }); else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      }));
      await attempt(() => shot(page, 'game-archer-flecha-no-arco.png'));
      data.caught = caught;
      await sleep(180);
      await attempt(() => shot(page, 'game-archer-flecha-em-voo.png'));
      // o alvo sai de perto (senão o arqueiro continua atirando sozinho); o arqueiro fica de frente para onde o alvo estava
      await attempt(() => page.evaluate((fid) => {
        const gm = window.game.gameManager;
        const f = gm.entitiesById.get(fid);
        if (f) { f.mesh.position.x += 90; f.mesh.position.z += 90; }
      }, live.foeId));
      await sleep(600);
    }

    // poses estáticas de perto (o arqueiro está de frente para o alvo, em +x): frente = câmera em +x (ângulo 0), lado = ângulo pi/2
    await attempt(() => page.evaluate((uid) => {
      const gm = window.game.gameManager;
      gm.issue({ type: 'stop', playerId: gm.localPlayerId, unitIds: [uid] });
    }, id));
    await sleep(1500);
    const bNow = await attempt(() => posOf(page, id));
    const near = (zoom = 0.13) => camTo(page, bNow.x, bNow.y + 1.3, bNow.z, zoom, 1500, Math.PI / 2);
    await near();
    await attempt(() => release());
    await sleep(400);
    await attempt(() => shot(page, 'game-archer-idle.png'));
    await attempt(() => setPose('walk', 0.2));
    await sleep(500);
    await attempt(() => shot(page, 'game-archer-andar.png'));
    for (const [t, nome] of [[0.2, 'mira'], [0.5, 'corda-puxada'], [0.68, 'solta']]) {
      await attempt(() => setPose('fight', t));
      await sleep(500);
      await attempt(() => shot(page, `game-archer-disparo-${nome}.png`));
    }
    await attempt(() => setPose('fight', 0.5));
    await camTo(page, bNow.x, bNow.y + 1.3, bNow.z, 0.13, 1400, Math.PI / 2);
    await attempt(() => shot(page, 'game-archer-disparo-lado.png'));
    await camTo(page, bNow.x, bNow.y + 1.3, bNow.z, 0.13, 1400, 0);
    await attempt(() => shot(page, 'game-archer-disparo-frente.png'));
    await near();
    for (const [t, nome] of [[0.3, 'inicio'], [0.8, 'meio'], [1.35, 'fim']]) {
      await attempt(() => setPose('die', t));
      await sleep(500);
      await attempt(() => shot(page, `game-archer-morrer-${nome}.png`));
    }
    await attempt(() => release());
    await sleep(300);

    // C6: cor de time vermelha (só o material TeamColor muda)
    const team = await attempt(() => page.evaluate(async (uid) => {
      const { ModelFactory } = await import('/src/entities/ModelFactory.js');
      const gm = window.game.gameManager;
      const root = gm.entityViews.viewOf(gm.entitiesById.get(uid)).root;
      const cols = () => {
        const o = {};
        root.traverse((c) => {
          if (!c.isMesh) return;
          for (const m of (Array.isArray(c.material) ? c.material : [c.material])) o[m.name] = '#' + m.color.getHexString();
        });
        return o;
      };
      const antes = cols();
      ModelFactory.setTeamColor(root, 0xd02020);
      const depois = cols();
      return { antes, depois };
    }, id));
    data.team = team;
    await sleep(400);
    await attempt(() => shot(page, 'game-archer-time-vermelho.png'));
    rec('C6', 'TeamColor: cor de time vermelha muda o material TeamColor e não o Atlas',
      !team.error && team.antes.TeamColor !== team.depois.TeamColor && team.antes.Atlas === team.depois.Atlas ? 'PASS' : 'FAIL',
      team.error || `TeamColor ${team.antes.TeamColor} -> ${team.depois.TeamColor}; Atlas ${team.antes.Atlas} -> ${team.depois.Atlas}`);
  }

  // ---------------------------------------------------------------- C8b: Arqueiro x Patrulheiro lado a lado
  const rid = rg && rg.id;
  if (rid) {
    const rp = await attempt(() => posOf(page, rid));
    if (!rp.error) {
      await camTo(page, rp.x, rp.y + 1.2, rp.z, 0.5, 1500);
      await attempt(() => shot(page, 'game-ranger-idle.png'));
    }
  }
}

async function runInspector(page) {
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=archer_v2_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
  await sleep(2500);
  const info = await attempt(() => page.evaluate(() => {
    const app = window.inspectorApp;
    const o = app.currentModelObject;
    const names = [];
    o.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); });
    return { names, model: app.currentModelId || null };
  }));
  data.inspector = info;
  rec('C9', 'inspetor: archer_v2_glb carrega com os nós do arco', !info.error && NODE_NAMES.every((n) => info.names.includes(n)) ? 'PASS' : 'FAIL',
    info.error || `nós=[${info.names.join(',')}]`);
  await attempt(() => shot(page, 'inspetor-archer-v2-idle.png'));
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; if (a) { a.setAnimation('fight', true); a.pause(); a.setTime(0.5, false); } }));
  await sleep(700);
  await attempt(() => shot(page, 'inspetor-archer-v2-fight.png'));
  // o modelo antigo continua no inspetor
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=archer_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
  await sleep(1500);
  const old = await attempt(() => page.evaluate(() => {
    const o = window.inspectorApp.currentModelObject;
    const names = [];
    o.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); });
    return { names };
  }));
  data.inspectorOld = old;
  rec('C9b', 'inspetor: o archer_glb antigo continua carregando (Bow, sem ForeArmL)', !old.error && old.names.includes('Bow') && !old.names.includes('ForeArmL') ? 'PASS' : 'FAIL',
    old.error || `nós=[${old.names.join(',')}]`);
  await attempt(() => shot(page, 'inspetor-archer-antigo.png'));
}

// ---------------------------------------------------------------- execução
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
  await sleep(1500);
  data.renderer = await page.evaluate(() => {
    const gl = window.game.sceneManager.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
  });
  await page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
  data.glbHttpStatus = await attempt(() => page.evaluate(async () => (await fetch('/models/archer_v2.glb')).status));
  console.log('renderer:', data.renderer, '| GET archer_v2.glb:', data.glbHttpStatus);
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
const depErr = errors.filter((e) => /deprec/i.test(e));
rec('C7', 'sem pageerror nem console.error (deprecações listadas à parte)', realErr.length === 0 ? 'PASS' : 'FAIL',
  `erros=${errors.length} (deprecação=${depErr.length}); avisos=${warnings.length}` + (realErr.length ? ` primeiros: ${realErr.slice(0, 3).join(' | ')}` : ''));

rows.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify({ generated: new Date().toISOString(), rows, files, data, errors, warnings }, null, 2) + '\n');
const fails = rows.filter((r) => r.status !== 'PASS').length;
console.log(`\nRESUMO: ${rows.length - fails}/${rows.length} PASS; erros=${errors.length}; avisos=${warnings.length}; arquivos=[${files.map((f) => f.name).join(', ')}]`);
process.exitCode = fails ? 1 : 0;
