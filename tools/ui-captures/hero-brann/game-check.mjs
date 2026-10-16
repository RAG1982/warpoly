#!/usr/bin/env node
/**
 * Capitão Brann (hero_brann) no jogo: o .glb carrega, o animador religa as partes e o golpe e a caminhada funcionam.
 * Só mede e registra; não altera src/ nem tests/. Uma partida (continental-1v1, humanos, IA congelada).
 *  C0  arquivo public/models/hero_brann.glb, lido do JSON do próprio .glb (sem navegador).
 *  C1  spawn de hero_brann perto do HQ; a view existe após 2 quadros.
 *  C2  malha da view com Knight, Torso, Head, ArmL, ArmR, LegL, LegR, Sword e Cape (e semelhança com os 3 .glb).
 *  C3  Cape com material TeamColor; Torso com material Atlas.
 *  C4  rebind: userData e meshParts do animador (torso, head, armL, armR, legL, legR, sword) não nulos.
 *  C5  golpe: setAnimation('fight') + pause; setTime 0,2 / 0,5 / 0,8; Sword muda > 0,05 rad.
 *  C6  caminhada: 'walk' ao vivo por 1 s (comando de movimento, destino a 12 u); sintético: setTime 0 / 0,2 / 0,4.
 *  C7  erros de página e de console (deprecações listadas à parte).
 *  C8  capturas: jogo com o Brann perto do HQ e close-up (zoom mínimo 0,5).
 *  C9  Brann x knight a 3 u: altura da Head acima da raiz de cada um; captura do par.
 * Uso: bash tools/safe-run.sh --timeout 400 -- node tools/ui-captures/hero-brann/game-check.mjs
 * Saída nesta pasta: game-brann-no-jogo.png, game-brann-closeup.png, game-brann-vs-cavaleiro.png, game-check.json
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5470;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const NODE_NAMES = ['Knight', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'Cape'];
const RIG_KEYS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'sword'];
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

/** Executa uma etapa e devolve `{ error }` em vez de lançar, para as demais checagens continuarem. */
async function attempt(fn) {
  try {
    return await fn();
  } catch (e) {
    return { error: 'exceção: ' + String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300) };
  }
}

/** Nome do nó -> materiais da malha do nó, lidos do JSON do .glb (cabeçalho glTF + primeiro chunk). */
function glbNodeMaterials(file) {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.toString('utf8', 20, 20 + len));
  const res = {};
  for (const n of j.nodes || []) {
    if (!n.name) continue;
    res[n.name] = n.mesh === undefined ? [] : [...new Set(j.meshes[n.mesh].primitives.map((p) =>
      (j.materials && j.materials[p.material] && j.materials[p.material].name) || '(sem nome)'))];
  }
  return res;
}

/** Maior diferença (rad) entre duas rotações [x, y, z]; null se alguma faltar. */
const maxDiff = (a, b) => (a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : null);

async function shot(page, name) {
  const file = path.join(HERE, name);
  await page.screenshot({ path: file });
  files.push({ name, kB: Math.round(fs.statSync(file).size / 1024) });
}

/** Alvo e zoom da câmera do jogo (zoom 0,5 = mais perto; 1,8 = mais longe) + espera para a câmera assentar. */
async function camTo(page, x, y, z, zoom, wait = 1400) {
  await page.evaluate(([x, y, z, zoom]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = Math.PI / 4;
  }, [x, y, z, zoom]);
  await sleep(wait);
}

/** Projeta pontos do mundo na tela (pixels) e diz se estão dentro do quadro. */
function projectPts(page, pts) {
  return page.evaluate((list) => {
    const sm = window.game.sceneManager;
    return list.map(([x, y, z]) => {
      const v = sm.camera.position.clone().set(x, y, z).project(sm.camera);
      return {
        px: Math.round(((v.x + 1) / 2) * window.innerWidth),
        py: Math.round(((1 - v.y) / 2) * window.innerHeight),
        inTela: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
      };
    });
  }, pts);
}

/** Posição da unidade (sim) e altura da raiz da view. */
function posOf(page, uid) {
  return page.evaluate((u) => {
    const gm = window.game.gameManager;
    const un = gm.entitiesById.get(u);
    return { x: un.mesh.position.x, y: gm.entityViews.viewOf(un).root.position.y, z: un.mesh.position.z };
  }, uid);
}

// ---------------------------------------------------------------- C0: arquivos .glb (sem navegador)
const heroNodes = glbNodeMaterials(path.join(ROOT, 'public/models/hero_brann.glb'));
const fileSets = {
  hero_brann: Object.keys(heroNodes),
  knight: Object.keys(glbNodeMaterials(path.join(ROOT, 'public/models/knight.glb'))),
  villager: Object.keys(glbNodeMaterials(path.join(ROOT, 'public/models/villager.glb')))
};
{
  const heroMissing = NODE_NAMES.filter((n) => !(n in heroNodes));
  const heroShield = Object.keys(heroNodes).filter((n) => /shield|escudo/i.test(n));
  const capeMats = (heroNodes.Cape || []).join('|');
  const torsoMats = (heroNodes.Torso || []).join('|');
  rec('C0', 'hero_brann.glb (JSON do arquivo): 9 nós, sem escudo, Cape=TeamColor, Torso=Atlas',
    heroMissing.length === 0 && heroShield.length === 0 && capeMats === 'TeamColor' && torsoMats.includes('Atlas') ? 'PASS' : 'FAIL',
    `nós=[${fileSets.hero_brann.join(',')}] faltando=[${heroMissing.join(',')}] escudo=[${heroShield.join(',')}] Cape=${capeMats} Torso=${torsoMats}`);
}

async function runChecks(page) {
  // ---------------------------------------------------------------- C1: spawn perto do HQ
  const spawn = await attempt(() => page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    if (!hq) return { error: 'sem HQ do jogador local' };
    const hx = hq.mesh.position.x, hz = hq.mesh.position.z;
    let spot = null;
    for (let r = 9; r <= 30 && !spot; r += 3) {
      for (let a = 0; a < 360 && !spot; a += 30) {
        const x = hx + Math.cos((a * Math.PI) / 180) * r, z = hz + Math.sin((a * Math.PI) / 180) * r;
        if (!gm.pathfinder.isWater(x, z) && gm.canPlaceBuilding('orc_house', x, z, null, me)) spot = { x, z };
      }
    }
    if (!spot) return { error: 'sem ponto livre perto do HQ (raio 9 a 30 u)' };
    const u = gm.spawnUnit('hero_brann', spot.x, spot.z, me);
    if (!u) return { error: 'spawnUnit(hero_brann) devolveu null (herói único já criado na partida?)' };
    const twoFrames = () => new Promise((resolve) => {
      let n = 0;
      const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
      setTimeout(resolve, 1500);
    });
    await twoFrames();
    const view = gm.entityViews.viewOf(u);
    if (!view) return { error: 'sem view do Brann após 2 quadros' };
    return {
      id: u.id, type: u.type, visualBase: u.visualBase, owner: u.ownerId, me,
      hq: { x: hx, z: hz }, spot: { x: spot.x, z: spot.z },
      rootName: view.root.name, rootScale: view.root.scale.toArray().map((v) => +v.toFixed(3)),
      rootChildren: view.root.children.map((c) => c.name), animUnitType: view.animator.unitType, anim: view.animator.currentAnim
    };
  }));
  data.spawn = spawn;
  if (spawn.error) {
    rec('C1', 'spawn hero_brann perto do HQ; view existe após 2 quadros', 'FAIL', spawn.error);
    return;
  }
  const id = spawn.id;
  rec('C1', 'spawn hero_brann perto do HQ; view existe após 2 quadros', 'PASS',
    `id=${id} tipo=${spawn.type} raiz=${spawn.rootName} escala=[${spawn.rootScale}] unitType=${spawn.animUnitType} ` +
    `filhos da raiz=[${spawn.rootChildren.slice(0, 12).join(',')}] GET /models/hero_brann.glb=${data.glbHttpStatus}`);

  // ---------------------------------------------------------------- C2, C3, C4: nós, materiais e rebind
  const insp = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const root = view.root;
    const NAMES = ['Knight', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'Cape'];
    const matsOf = (o) => {
      const s = new Set();
      o.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        for (const m of (Array.isArray(c.material) ? c.material : [c.material])) s.add(m && m.name ? m.name : '(sem nome)');
      });
      return [...s];
    };
    const nodeFound = {};
    for (const n of NAMES) {
      const o = root.getObjectByName(n);
      nodeFound[n] = o ? { type: o.type, mats: matsOf(o) } : null;
    }
    const allNodeNames = [];
    root.traverse((c) => { if (c.name && !allNodeNames.includes(c.name)) allNodeNames.push(c.name); });
    const KEYS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'sword', 'shieldGroup'];
    const an = view.animator;
    const ud = root.userData || {};
    const userData = {}, meshParts = {}, sameObj = {};
    for (const k of KEYS) {
      userData[k] = ud[k] ? (ud[k].name || '(sem nome)') : null;
      meshParts[k] = an.meshParts[k] ? (an.meshParts[k].name || '(sem nome)') : null;
      sameObj[k] = !!(ud[k] && an.meshParts[k] && ud[k] === an.meshParts[k]);
    }
    return {
      rootName: root.name, allNodeNames, nodeFound, userData, meshParts, sameObj,
      unitType: an.unitType, anim: an.currentAnim, rootScale: root.scale.toArray().map((v) => +v.toFixed(3))
    };
  }, id));
  data.inspect = insp;
  if (insp.error) {
    rec('C2', 'malha com Knight/Torso/Head/ArmL/ArmR/LegL/LegR/Sword/Cape', 'FAIL', insp.error);
    rec('C3', 'Cape com material TeamColor; Torso com material Atlas', 'FAIL', 'não medido');
    rec('C4', 'rebind de userData e meshParts do animador', 'FAIL', 'não medido');
  } else {
    const missing = NODE_NAMES.filter((n) => !insp.nodeFound[n]);
    const viewSet = new Set(insp.allNodeNames);
    const jacc = {};
    for (const [k, arr] of Object.entries(fileSets)) {
      const s = new Set(arr);
      const inter = [...viewSet].filter((n) => s.has(n)).length;
      const uni = new Set([...viewSet, ...arr]).size;
      jacc[k] = +(inter / uni).toFixed(2);
    }
    const best = Object.entries(jacc).sort((a, b) => b[1] - a[1])[0][0];
    const heroOnly = fileSets.hero_brann.filter((n) => !viewSet.has(n));
    const viewOnly = insp.allNodeNames.filter((n) => !fileSets.hero_brann.includes(n));
    rec('C2', 'malha com Knight/Torso/Head/ArmL/ArmR/LegL/LegR/Sword/Cape', missing.length === 0 ? 'PASS' : 'FAIL',
      `achou ${NODE_NAMES.length - missing.length}/9; faltando=[${missing.join(',')}]; raiz=${insp.rootName}; ` +
      `nós no jogo=${insp.allNodeNames.length}; do hero_brann.glb ausentes no jogo=[${heroOnly.join(',')}]; ` +
      `só no jogo=[${viewOnly.slice(0, 15).join(',')}]; escudo no jogo=[${insp.allNodeNames.filter((n) => /shield|escudo/i.test(n)).join(',')}]; ` +
      `Jaccard=${JSON.stringify(jacc)} -> parecido com ${best}`);

    const capeMats = insp.nodeFound.Cape ? insp.nodeFound.Cape.mats : null;
    const torsoMats = insp.nodeFound.Torso ? insp.nodeFound.Torso.mats : null;
    rec('C3', 'Cape com material TeamColor; Torso com material Atlas',
      capeMats && capeMats.includes('TeamColor') && torsoMats && torsoMats.includes('Atlas') ? 'PASS' : 'FAIL',
      `Cape=${capeMats ? '[' + capeMats + ']' : 'ausente'}; Torso=${torsoMats ? '[' + torsoMats + ']' : 'ausente'}`);

    const udNull = RIG_KEYS.filter((k) => insp.userData[k] === null);
    const pmNull = RIG_KEYS.filter((k) => insp.meshParts[k] === null);
    rec('C4', 'rebind de userData e meshParts do animador (torso, head, armL, armR, legL, legR, sword)',
      udNull.length === 0 && pmNull.length === 0 ? 'PASS' : 'FAIL',
      `userData nulos=[${udNull}]; meshParts nulos=[${pmNull}]; mesmo nó em userData e meshParts=${RIG_KEYS.filter((k) => insp.sameObj[k]).length}/7; ` +
      `userData.shieldGroup=${insp.userData.shieldGroup} (esperado: sem escudo); unitType do animador=${insp.unitType}`);
  }

  // ---------------------------------------------------------------- C5: golpe (fight), fases 0,2 / 0,5 / 0,8
  const fight = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const an = gm.entityViews.viewOf(gm.entitiesById.get(uid)).animator;
    an.setAnimation('fight', true);
    an.pause();
    const r = (o) => (o ? [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(4)) : null);
    const phases = {};
    for (const p of [0.2, 0.5, 0.8]) {
      an.setTime(p, false);
      const P = an.meshParts;
      phases[String(p)] = { sword: r(P.sword), armR: r(P.armR), torso: r(P.torso) };
    }
    an.play();
    return { anim: 'fight', dur: an.getDuration(), phases };
  }, id));
  data.fight = fight;
  if (fight.error) {
    rec('C5', 'golpe (fight): Sword muda > 0,05 rad entre as fases', 'FAIL', fight.error);
  } else {
    const fp = fight.phases;
    const swordD = [['0.2', '0.5'], ['0.5', '0.8'], ['0.2', '0.8']].map(([a, b]) => maxDiff(fp[a].sword, fp[b].sword));
    const swordMax = Math.max(...swordD.map((v) => (v === null ? -1 : v)));
    rec('C5', 'golpe (fight): Sword muda > 0,05 rad entre as fases', swordMax > 0.05 ? 'PASS' : 'FAIL',
      `dif. máx. Sword por par (0,2-0,5 | 0,5-0,8 | 0,2-0,8)=${JSON.stringify(swordD)}; Sword 0,2=${JSON.stringify(fp['0.2'].sword)} ` +
      `0,8=${JSON.stringify(fp['0.8'].sword)}; armR 0,2-0,8=${maxDiff(fp['0.2'].armR, fp['0.8'].armR)}`);
  }

  // ---------------------------------------------------------------- C6: caminhada (sintético e ao vivo)
  const wsw = await attempt(() => page.evaluate((uid) => {
    const gm = window.game.gameManager;
    const an = gm.entityViews.viewOf(gm.entitiesById.get(uid)).animator;
    an.setAnimation('walk', true);
    an.pause();
    const r = (o) => (o ? [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(4)) : null);
    const phases = {};
    for (const t of [0, 0.2, 0.4]) {
      an.setTime(t, false);
      const P = an.meshParts;
      phases[String(t)] = { legL: r(P.legL), legR: r(P.legR), torso: r(P.torso) };
    }
    an.play();
    return { dur: an.getDuration(), phases };
  }, id));
  data.walkSweep = wsw;
  const wSynth = wsw.error ? wsw.error
    : `setTime 0/0,2/0,4: dif. máx. LegL=${maxDiff(wsw.phases['0'].legL, wsw.phases['0.2'].legL)} ` +
      `torso=${maxDiff(wsw.phases['0'].torso, wsw.phases['0.2'].torso)}`;

  let walk = { error: 'não executado (sem posição do Brann)' };
  const bPre = await attempt(() => posOf(page, id));
  if (!bPre.error) {
    await camTo(page, bPre.x, bPre.y + 1.2, bPre.z, 0.9, 1200); // câmera sobre o Brann: a animação só avança com a unidade em tela
    walk = await attempt(() => page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      let tgt = null;
      for (let a = 0; a < 360 && !tgt; a += 30) {
        const x = u.mesh.position.x + Math.cos((a * Math.PI) / 180) * 12;
        const z = u.mesh.position.z + Math.sin((a * Math.PI) / 180) * 12;
        if (!gm.pathfinder.isWater(x, z)) tgt = gm.pathfinder.findNearestWalkable(x, z);
      }
      if (!tgt) return { error: 'sem destino caminhável a 12 u' };
      const p0 = { x: u.mesh.position.x, z: u.mesh.position.z };
      gm.issue({ type: 'move', playerId: gm.localPlayerId, unitIds: [uid], x: tgt.x, z: tgt.z });
      const samples = [];
      const t0 = performance.now();
      await new Promise((resolve) => {
        const finish = () => resolve();
        setTimeout(finish, 2500);
        const step = () => {
          const an = gm.entityViews.viewOf(u).animator;
          const P = an.meshParts;
          const r = (o) => (o ? [o.rotation.x, o.rotation.y, o.rotation.z] : null);
          samples.push({ t: Math.round(performance.now() - t0), anim: an.currentAnim, state: u.state, legL: r(P.legL), legR: r(P.legR), torso: r(P.torso) });
          if (performance.now() - t0 < 1000) requestAnimationFrame(step); else finish();
        };
        requestAnimationFrame(step);
      });
      const walking = samples.filter((s) => s.anim === 'walk');
      const ranges = {};
      let maxRange = -1;
      for (const part of ['legL', 'legR', 'torso']) {
        ranges[part] = [0, 1, 2].map((ax) => {
          const vals = walking.map((s) => (s[part] ? s[part][ax] : null)).filter((v) => v !== null);
          return vals.length ? +(Math.max(...vals) - Math.min(...vals)).toFixed(4) : null;
        });
        for (const v of ranges[part]) if (v !== null && v > maxRange) maxRange = v;
      }
      return {
        frames: samples.length, walkFrames: walking.length, animsSeen: [...new Set(samples.map((s) => s.anim))],
        statesSeen: [...new Set(samples.map((s) => s.state))], ranges, maxRange,
        movedUnits: +Math.hypot(u.mesh.position.x - p0.x, u.mesh.position.z - p0.z).toFixed(2),
        target: { x: +tgt.x.toFixed(2), z: +tgt.z.toFixed(2) }
      };
    }, id));
  }
  data.walk = walk;
  const walkOk = !walk.error && walk.walkFrames >= 10 && walk.maxRange > 0.05;
  rec('C6', 'caminhada: walk ao vivo por 1 s muda pernas ou tronco', walkOk ? 'PASS' : 'FAIL',
    walk.error ? walk.error
      : `quadros=${walk.frames} com walk=${walk.walkFrames} anims=[${walk.animsSeen}] estados=[${walk.statesSeen}] ` +
        `maior faixa=${walk.maxRange} rad; LegL=${JSON.stringify(walk.ranges.legL)} torso=${JSON.stringify(walk.ranges.torso)} ` +
        `deslocou=${walk.movedUnits} u; sintético: ${wSynth}`);

  // ---------------------------------------------------------------- C8: capturas (jogo e close-up)
  const bPost = await attempt(() => posOf(page, id));
  let pA = null, pB = null, zoomNow = null;
  if (!bPost.error) {
    const mid = { x: (spawn.hq.x + bPost.x) / 2, z: (spawn.hq.z + bPost.z) / 2 };
    await camTo(page, mid.x, 1.5, mid.z, 1.0, 1600);
    pA = await attempt(() => projectPts(page, [[bPost.x, bPost.y + 1.2, bPost.z], [spawn.hq.x, 1.5, spawn.hq.z]]));
    await attempt(() => shot(page, 'game-brann-no-jogo.png'));
    await camTo(page, bPost.x, bPost.y + 1.2, bPost.z, 0.5, 1600);
    zoomNow = await attempt(() => page.evaluate(() => window.game.sceneManager.zoomLevel));
    pB = await attempt(() => projectPts(page, [[bPost.x, bPost.y + 1.2, bPost.z]]));
    await attempt(() => shot(page, 'game-brann-closeup.png'));
  }
  const onA = Array.isArray(pA) ? pA[0] : null;
  const onB = Array.isArray(pB) ? pB[0] : null;
  const haveA = files.some((f) => f.name === 'game-brann-no-jogo.png');
  const haveB = files.some((f) => f.name === 'game-brann-closeup.png');
  rec('C8', 'capturas: jogo com o Brann perto do HQ e close-up (API: sceneManager.cameraTarget e targetZoomLevel)',
    haveA && haveB && onA && onA.inTela && onB && onB.inTela ? 'PASS' : 'FAIL',
    `(a) PNG=${haveA} Brann na tela=${onA ? onA.inTela : '?'} px=(${onA ? onA.px : '?'},${onA ? onA.py : '?'}) HQ na tela=${Array.isArray(pA) && pA[1] ? pA[1].inTela : '?'}; ` +
    `(b) PNG=${haveB} zoomLevel=${typeof zoomNow === 'number' ? zoomNow.toFixed(3) : 'n/d'} Brann na tela=${onB ? onB.inTela : '?'} px=(${onB ? onB.px : '?'},${onB ? onB.py : '?'})`);

  // ---------------------------------------------------------------- C9: Brann x knight a 3 u
  const kn = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const b = gm.entitiesById.get(uid);
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    let spot = null;
    for (let a = 0; a < 360 && !spot; a += 30) {
      const x = bx + Math.cos((a * Math.PI) / 180) * 3, z = bz + Math.sin((a * Math.PI) / 180) * 3;
      if (!gm.pathfinder.isWater(x, z)) spot = { x, z };
    }
    if (!spot) return { error: 'sem ponto livre a 3 u do Brann' };
    const k = gm.spawnUnit('knight', spot.x, spot.z, me);
    if (!k) return { error: 'spawnUnit(knight) devolveu null' };
    await new Promise((resolve) => {
      let n = 0;
      const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
      setTimeout(resolve, 1500);
    });
    const V = window.game.sceneManager.camera.position.constructor;
    const measure = (un) => {
      const view = gm.entityViews.viewOf(un);
      if (!view) return { error: 'sem view' };
      view.root.updateMatrixWorld(true);
      const rp = view.root.getWorldPosition(new V());
      const h = view.root.getObjectByName('Head');
      const m = { rootName: view.root.name, rootScaleY: +view.root.scale.y.toFixed(3), headRel: null, headWorldY: null, rootWorldY: +rp.y.toFixed(3) };
      if (h) {
        const hp = h.getWorldPosition(new V());
        m.headWorldY = +hp.y.toFixed(3);
        m.headRel = +(hp.y - rp.y).toFixed(3);
      }
      return m;
    };
    return {
      dist: +Math.hypot(k.mesh.position.x - bx, k.mesh.position.z - bz).toFixed(2),
      brann: measure(b), knight: measure(k), knightType: k.type,
      brannPos: [bx, b.mesh.position.y, bz], knightPos: [k.mesh.position.x, k.mesh.position.y, k.mesh.position.z]
    };
  }, id));
  data.knightCmp = kn;
  if (kn.error) {
    rec('C9', 'Brann x knight a 3 u: altura da Head acima da raiz', 'FAIL', kn.error);
  } else {
    const mid2 = { x: (kn.brannPos[0] + kn.knightPos[0]) / 2, z: (kn.brannPos[2] + kn.knightPos[2]) / 2 };
    await camTo(page, mid2.x, 1.5, mid2.z, 0.7, 1600);
    const pC = await attempt(() => projectPts(page, [
      [kn.brannPos[0], kn.brannPos[1] + 1.2, kn.brannPos[2]],
      [kn.knightPos[0], kn.knightPos[1] + 1.2, kn.knightPos[2]]
    ]));
    await attempt(() => shot(page, 'game-brann-vs-cavaleiro.png'));
    data.c9Screen = pC;
    const ratio = kn.brann.headRel && kn.knight.headRel ? +(kn.brann.headRel / kn.knight.headRel).toFixed(3) : null;
    const screenOk = Array.isArray(pC) && pC.every((p) => p.inTela);
    const ok = ratio !== null && Math.abs(kn.dist - 3) <= 0.25 && files.some((f) => f.name === 'game-brann-vs-cavaleiro.png');
    rec('C9', 'Brann x knight a 3 u: altura da Head acima da raiz (altura relativa)', ok ? 'PASS' : 'FAIL',
      `distância=${kn.dist} u; Brann: Head acima da raiz=${kn.brann.headRel} u (escala ${kn.brann.rootScaleY}, raiz ${kn.brann.rootName}); ` +
      `knight: Head=${kn.knight.headRel} u (escala ${kn.knight.rootScaleY}, raiz ${kn.knight.rootName}); razão Brann/knight=${ratio}; ` +
      `ambos na tela=${screenOk}`);
  }
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
  data.glbHttpStatus = await attempt(() => page.evaluate(async () => (await fetch('/models/hero_brann.glb')).status));
  console.log('renderer:', data.renderer, '| GET hero_brann.glb:', data.glbHttpStatus);
  await runChecks(page);
} catch (e) {
  console.error('ERRO fatal:', e);
  rec('FATAL', 'execução interrompida', 'FAIL', String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}

// ---------------------------------------------------------------- C7: erros (deprecações listadas à parte)
const realErr = errors.filter((e) => !/deprec/i.test(e));
const depErr = errors.filter((e) => /deprec/i.test(e));
const depWarn = warnings.filter((w) => /deprec/i.test(w));
rec('C7', 'sem pageerror nem console.error (deprecações listadas à parte)', realErr.length === 0 ? 'PASS' : 'FAIL',
  `erros=${errors.length} (deprecação=${depErr.length}); avisos=${warnings.length} (deprecação=${depWarn.length})` +
  (realErr.length ? ` primeiros: ${realErr.slice(0, 3).join(' | ')}` : ''));

rows.sort((a, b) => a.id.localeCompare(b.id));
data.deprecations = { errors: depErr, warnings: depWarn };
data.otherWarnings = warnings.filter((w) => !/deprec/i.test(w));
const report = { generated: new Date().toISOString(), rows, files, data, errors, warnings };
fs.writeFileSync(path.join(HERE, 'game-check.json'), JSON.stringify(report, null, 2) + '\n');
const fails = rows.filter((r) => r.status !== 'PASS').length;
console.log(`\nRESUMO: ${rows.length - fails}/${rows.length} PASS; erros=${errors.length}; avisos=${warnings.length}; ` +
  `arquivos=[${files.map((f) => f.name).join(', ')}]`);
process.exitCode = fails ? 1 : 0;
