#!/usr/bin/env node
/**
 * Vozgul, a Profetisa (hero_vozgul) no jogo e no inspetor (M2-23). Só mede e captura; não altera src/ nem tests/.
 * Uma partida (continental-1v1, IA congelada) e o inspetor (hero_vozgul_glb).
 *  C0  public/models/hero_vozgul.glb (JSON do arquivo): nós, hierarquia (Weapon filho de ArmR, Crystal = chama filho de Weapon com material
 *      `Flame`), TeamColor no Torso, <= 20 draw calls.
 *  C1  spawn de hero_vozgul perto do HQ; a view existe; o animador usa o tipo `necromancer`.
 *  C2  nós na view; materiais Atlas, TeamColor e Flame (emissivo); sem escudo.
 *  C3  rebind: userData e meshParts (torso, head, armL, armR, legL, legR, weapon, crystal) não nulos.
 *  C4  idle / andar / ataque ('fight') / lançar ('cast'): partes mexem; o cajado fica em pé; a chama pulsa na cast.
 *  C5  caminhada ao vivo por 1 s (comando de movimento).
 *  C6  TeamColor: cor de time vermelha muda o material TeamColor (Torso) sem tocar no Atlas nem na chama.
 *  C7  erros de página e de console (deprecações listadas à parte).
 *  C8  Vozgul x necromante comum a 3 u (altura).
 *  C9  inspetor.
 *  C10 cast ao vivo: Dreno de Alma (alvo inimigo: ela se cura), Véu de Cinzas (aliado fica invisível) e Chamado dos Ancestrais (sobre
 *      cadáveres: esqueletos aparecem); a view entra em 'cast' e a chama/cajado respondem.
 * Capturas: idle (zoom 1,0 e close-up), andar, as três magias, time vermelho, Vozgul x necromante, inspetor.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/hero-vozgul/game-check.mjs
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
const PORT = 5485;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const NODE_NAMES = ['Necromancer', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal'];
const RIG_KEYS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'weapon', 'crystal'];
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

/** Lê o JSON de um .glb: nós (com pai e malha) e materiais por nó. */
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
  return { nodes: res, draws, tris };
}

async function shot(page, name) {
  const file = path.join(HERE, name);
  await page.screenshot({ path: file });
  files.push({ name, kB: Math.round(fs.statSync(file).size / 1024) });
}

async function camTo(page, x, y, z, zoom, wait = 1400) {
  await page.evaluate(([x, y, z, zoom]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = Math.PI / 4;
  }, [x, y, z, zoom]);
  await sleep(wait);
}

function projectPts(page, pts) {
  return page.evaluate((list) => {
    const sm = window.game.sceneManager;
    return list.map(([x, y, z]) => {
      const v = sm.camera.position.clone().set(x, y, z).project(sm.camera);
      return { px: Math.round(((v.x + 1) / 2) * window.innerWidth), py: Math.round(((1 - v.y) / 2) * window.innerHeight), inTela: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    });
  }, pts);
}

function posOf(page, uid) {
  return page.evaluate((u) => {
    const gm = window.game.gameManager;
    const un = gm.entitiesById.get(u);
    return { x: un.mesh.position.x, y: gm.entityViews.viewOf(un).root.position.y, z: un.mesh.position.z };
  }, uid);
}

// ---------------------------------------------------------------- C0: arquivo .glb (sem navegador)
const glb = glbInfo(path.join(ROOT, 'public/models/hero_vozgul.glb'));
{
  const names = Object.keys(glb.nodes);
  const miss = NODE_NAMES.filter((n) => !names.includes(n));
  const shield = names.filter((n) => /shield|escudo/i.test(n));
  const ok = miss.length === 0 && shield.length === 0 && glb.nodes.Weapon.parent === 'ArmR' && glb.nodes.Crystal.parent === 'Weapon' &&
    glb.nodes.Torso.mats.includes('TeamColor') && glb.nodes.Torso.mats.includes('Atlas') && glb.nodes.Crystal.mats.join() === 'Flame' && glb.draws <= 20;
  rec('C0', 'hero_vozgul.glb: 9 nós, Weapon>ArmR, Crystal>Weapon com material Flame, Torso com Atlas+TeamColor, <= 20 draw calls', ok ? 'PASS' : 'FAIL',
    `nós=[${names.join(',')}] faltando=[${miss}] escudo=[${shield}] pai(Weapon)=${glb.nodes.Weapon.parent} pai(Crystal)=${glb.nodes.Crystal.parent} ` +
    `Torso=${glb.nodes.Torso.mats} draw calls=${glb.draws} triângulos=${glb.tris}`);
}

async function runChecks(page) {
  // ---------------------------------------------------------------- C1: spawn
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
    if (!spot) return { error: 'sem ponto livre perto do HQ' };
    const u = gm.spawnUnit('hero_vozgul', spot.x, spot.z, me);
    if (!u) return { error: 'spawnUnit(hero_vozgul) devolveu null' };
    await new Promise((resolve) => {
      let n = 0;
      const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
      setTimeout(resolve, 1500);
    });
    const view = gm.entityViews.viewOf(u);
    if (!view) return { error: 'sem view da Vozgul' };
    return {
      id: u.id, type: u.type, visualBase: u.visualBase, me, hq: { x: hx, z: hz }, spot,
      rootName: view.root.name, rootScale: view.root.scale.toArray().map((v) => +v.toFixed(3)),
      rootChildren: view.root.children.map((c) => c.name), animUnitType: view.animator.unitType
    };
  }));
  data.spawn = spawn;
  if (spawn.error) {
    rec('C1', 'spawn hero_vozgul perto do HQ', 'FAIL', spawn.error);
    return;
  }
  const id = spawn.id;
  rec('C1', 'spawn hero_vozgul perto do HQ; animador no tipo necromancer', spawn.animUnitType === 'necromancer' && spawn.rootName === 'Necromancer' ? 'PASS' : 'FAIL',
    `id=${id} tipo=${spawn.type} raiz=${spawn.rootName} escala=[${spawn.rootScale}] unitType=${spawn.animUnitType} filhos da raiz=[${spawn.rootChildren}] GET hero_vozgul.glb=${data.glbHttpStatus}`);

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
    for (const n of ['Necromancer', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal']) {
      const o = root.getObjectByName(n);
      found[n] = o ? { parent: o.parent ? o.parent.name : null, mats: matsOf(o) } : null;
    }
    const all = [];
    root.traverse((c) => { if (c.name && !all.includes(c.name)) all.push(c.name); });
    const an = view.animator;
    const ud = root.userData || {};
    const keys = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'weapon', 'crystal'];
    const userData = {}, meshParts = {};
    for (const k of keys) {
      userData[k] = ud[k] ? ud[k].name : null;
      meshParts[k] = an.meshParts[k] ? an.meshParts[k].name : null;
    }
    let flame = null;
    root.getObjectByName('Crystal').traverse((c) => { if (c.isMesh && !flame) flame = { name: c.material.name, emissive: '#' + c.material.emissive.getHexString(), intensity: c.material.emissiveIntensity }; });
    return { found, all, userData, meshParts, flame, shieldGroup: ud.shieldGroup ? ud.shieldGroup.name : null };
  }, id));
  data.inspect = insp;
  if (insp.error) {
    rec('C2', 'nós e materiais na view', 'FAIL', insp.error);
    rec('C3', 'rebind do animador', 'FAIL', 'não medido');
  } else {
    const miss = NODE_NAMES.filter((n) => !insp.found[n]);
    const okMat = insp.found.Torso && insp.found.Torso.mats.includes('Atlas') && insp.found.Torso.mats.includes('TeamColor') &&
      insp.found.Crystal && insp.found.Crystal.mats.join() === 'Flame' && insp.flame && insp.flame.emissive !== '#000000';
    rec('C2', 'view com os 9 nós; Weapon>ArmR; Crystal>Weapon; Torso com Atlas+TeamColor; chama com material Flame emissivo; sem escudo',
      miss.length === 0 && okMat && insp.found.Weapon.parent === 'ArmR' && insp.found.Crystal.parent === 'Weapon' && !insp.shieldGroup ? 'PASS' : 'FAIL',
      `faltando=[${miss}] Torso=${insp.found.Torso && insp.found.Torso.mats} pai(Weapon)=${insp.found.Weapon && insp.found.Weapon.parent} pai(Crystal)=${insp.found.Crystal && insp.found.Crystal.parent} Crystal=${insp.found.Crystal && insp.found.Crystal.mats} chama=${JSON.stringify(insp.flame)} nós=${insp.all.length}`);
    const nulos = RIG_KEYS.filter((k) => insp.userData[k] === null || insp.meshParts[k] === null);
    rec('C3', 'rebind: userData e meshParts do animador (torso, head, armL, armR, legL, legR, weapon, crystal)', nulos.length === 0 ? 'PASS' : 'FAIL',
      `nulos=[${nulos}] userData=${JSON.stringify(insp.userData)}`);
  }

  // ---------------------------------------------------------------- C4: poses (idle, walk, fight, cast): partes e cajado em pé
  const poses = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const an = view.animator;
    const root = view.root;
    const V = root.position.constructor;
    const r = (o) => (o ? [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(3)) : null);
    const up = (o) => {
      o.updateWorldMatrix(true, false);
      const v = new V(0, 1, 0).transformDirection(o.matrixWorld);       // eixo y local da haste no mundo (vetor unitário)
      return +v.y.toFixed(4);
    };
    const out = {};
    for (const [anim, ts] of [['idle', [0.1, 0.5, 0.8]], ['walk', [0.0, 0.2, 0.4]], ['fight', [0.2, 0.5, 0.8]], ['cast', [0.2, 0.5, 0.8]]]) {
      an.setAnimation(anim, true);
      an.pause();
      out[anim] = {};
      for (const t of ts) {
        an.setTime(t, false);
        const P = an.meshParts;
        root.updateMatrixWorld(true);
        out[anim][t] = {
          armL: r(P.armL), armR: r(P.armR), legL: r(P.legL), torso: r(P.torso), head: r(P.head), weapon: r(P.weapon),
          weaponUp: up(P.weapon), crystalScale: +P.crystal.scale.x.toFixed(3)
        };
      }
    }
    an.setAnimation('idle', true);
    an.play();
    return out;
  }, id));
  data.poses = poses;
  if (poses.error) {
    rec('C4', 'poses idle/walk/fight/cast', 'FAIL', poses.error);
  } else {
    const dif = (a, b) => (a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : 0);
    const walkMove = Math.max(dif(poses.walk[0].legL, poses.walk[0.2].legL), dif(poses.walk[0].armR, poses.walk[0.2].armR));
    const castMove = dif(poses.cast[0.2].armL, poses.cast[0.8].armL) + dif(poses.cast[0.5].armR, poses.cast[0.2].armR);
    const castArm = Math.min(...[0.2, 0.5, 0.8].map((t) => poses.cast[t].armR[0]));
    const pulse = Math.max(...[0.2, 0.5, 0.8].map((t) => poses.cast[t].crystalScale));
    const minUpOf = (anim) => Math.min(...Object.values(poses[anim]).map((p) => p.weaponUp));
    const minUp = Math.min(minUpOf('idle'), minUpOf('walk'), minUpOf('fight'));
    const castUp = minUpOf('cast');        // o animador só contra-gira x e z (como no necromante comum): na cast a haste se inclina
    rec('C4', 'idle/walk/fight/cast mexem as partes; cajado em pé (eixo y >= 0,98) em idle/walk/fight e >= 0,8 na cast; Crystal pulsa na cast',
      walkMove > 0.05 && castArm < -1.5 && pulse > 1.02 && minUp >= 0.98 && castUp >= 0.8 ? 'PASS' : 'FAIL',
      `walk dif máx=${walkMove.toFixed(3)} rad; cast armR.x mín=${castArm} rad; Crystal escala máx na cast=${pulse}; Weapon eixo y mundo mín idle/walk/fight=${minUp} cast=${castUp}; ` +
      `fight: armR 0,2=${JSON.stringify(poses.fight[0.2].armR)} 0,5=${JSON.stringify(poses.fight[0.5].armR)} (necromante não tem golpe próprio: o ataque é a cast); cast mov=${castMove.toFixed(3)}`);
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

  // ---------------------------------------------------------------- C8a: capturas do jogo
  const bPost = await attempt(() => posOf(page, id));
  if (!bPost.error) {
    const mid = { x: (spawn.hq.x + bPost.x) / 2, z: (spawn.hq.z + bPost.z) / 2 };
    await camTo(page, mid.x, 1.5, mid.z, 1.0, 1600);
    data.pA = await attempt(() => projectPts(page, [[bPost.x, bPost.y + 1.2, bPost.z]]));
    await attempt(() => shot(page, 'game-vozgul-no-jogo.png'));
    await camTo(page, bPost.x, bPost.y + 1.2, bPost.z, 0.5, 1600);
    data.pB = await attempt(() => projectPts(page, [[bPost.x, bPost.y + 1.2, bPost.z]]));
    await attempt(() => shot(page, 'game-vozgul-closeup.png'));
    // C10: cast ao vivo: Dreno de Alma (alvo), Véu de Cinzas (aliado) e Chamado dos Ancestrais (cadáveres)
    const liveCast = await attempt(() => page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const u = gm.entitiesById.get(uid);
      const enemy = gm.players.find((p) => p.id !== me).id;
      const foe = gm.spawnUnit('knight', u.mesh.position.x + 7, u.mesh.position.z + 2, enemy);
      foe.speed = 0; foe.hp = foe.maxHp = 5000; foe.updateHealthBar();
      foe.isCombatUnit = () => false;
      const ally = gm.spawnUnit('grunt', u.mesh.position.x - 3, u.mesh.position.z + 3, me);
      u.mana = u.maxMana;
      u.hp = u.maxHp - 60;
      const view = gm.entityViews.viewOf(u);
      const V = view.root.position.constructor;
      const sample = (label, ms) => new Promise((resolve) => {
        const out = { label, frames: 0, castFrames: 0, minUp: 1, maxCrystal: 1, anims: new Set() };
        const t0 = performance.now();
        const step = () => {
          const an = view.animator;
          out.frames++;
          out.anims.add(an.currentAnim);
          if (an.currentAnim === 'cast') {
            out.castFrames++;
            const w = an.meshParts.weapon;
            w.updateWorldMatrix(true, false);
            out.minUp = Math.min(out.minUp, new V(0, 1, 0).transformDirection(w.matrixWorld).y);
            out.maxCrystal = Math.max(out.maxCrystal, an.meshParts.crystal.scale.x);
          }
          if (performance.now() - t0 < ms) requestAnimationFrame(step); else { out.anims = [...out.anims]; resolve(out); }
        };
        requestAnimationFrame(step);
      });
      const hp0 = u.hp;
      gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_soul_drain', targetId: foe.id });
      const drain = await sample('hero_soul_drain', 1800);
      const foeHp = foe.hp, selfHp = u.hp;
      gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_ash_veil', targetId: ally.id });
      const veil = await sample('hero_ash_veil', 1600);
      const { hasStatus } = await import('/src/sim/statuses.js');
      const invisible = hasStatus(ally, 'invisible');
      for (let i = 0; i < 3; i++) gm.corpses.add(u.mesh.position.x + 2 + i * 0.6, u.mesh.position.z - 1);
      const sk0 = gm.allUnits.filter((x) => x.type === 'skeleton' && x.ownerId === me).length;
      gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_ancestors' });
      const raise = await sample('hero_ancestors', 2000);
      const sk1 = gm.allUnits.filter((x) => x.type === 'skeleton' && x.ownerId === me).length;
      return { drain, veil, raise, hp0, selfHp, foeHp, foeMax: foe.maxHp, invisible, sk0, sk1, mana: Math.round(u.mana), foeId: foe.id, allyId: ally.id };
    }, id));
    data.liveCast = liveCast;
    if (liveCast.error) {
      rec('C10', 'cast ao vivo (Dreno de Alma, Véu de Cinzas, Chamado dos Ancestrais)', 'FAIL', liveCast.error);
    } else {
      const castOk = ['drain', 'veil', 'raise'].every((k) => liveCast[k].castFrames >= 3);
      const ok = castOk && liveCast.invisible && liveCast.foeHp < liveCast.foeMax && liveCast.selfHp > liveCast.hp0 && liveCast.sk1 > liveCast.sk0;
      rec('C10', 'cast ao vivo: a view entra em cast (>= 3 quadros por magia); Dreno fere o alvo e cura a heroína; Véu deixa o aliado invisível; Ancestrais erguem esqueletos', ok ? 'PASS' : 'FAIL',
        ['drain', 'veil', 'raise'].map((k) => `${liveCast[k].label}: cast=${liveCast[k].castFrames}/${liveCast[k].frames} anims=[${liveCast[k].anims}] haste mín=${liveCast[k].minUp.toFixed(3)} chama máx=${liveCast[k].maxCrystal.toFixed(2)}`).join('; ') +
        `; PV do alvo ${liveCast.foeMax} -> ${liveCast.foeHp}; PV dela ${liveCast.hp0} -> ${liveCast.selfHp}; aliado invisível=${liveCast.invisible}; esqueletos ${liveCast.sk0} -> ${liveCast.sk1}; mana restante=${liveCast.mana}`);
      // capturas: uma cast de cada magia (câmera perto de Vozgul)
      const shotCast = async (ability, extra, name, wait) => {
        const oPos = await attempt(() => posOf(page, id));
        await camTo(page, oPos.x + 1.0, oPos.y + 1.4, oPos.z, 0.5, 900);
        await page.evaluate(async ({ uid, ability, extra }) => {
          const gm = window.game.gameManager;
          const u = gm.entitiesById.get(uid);
          u.mana = u.maxMana;
          u.hp = Math.max(1, u.maxHp - 80);
          if (u.cooldowns) u.cooldowns[ability] = 0;
          if (ability === 'hero_ancestors') for (let i = 0; i < 4; i++) gm.corpses.add(u.mesh.position.x + 1.5 + i * 0.7, u.mesh.position.z - 1.5);
          gm.issue({ type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId: ability, ...extra });
        }, { uid: id, ability, extra });
        await sleep(wait);
        await attempt(() => shot(page, name));
        await sleep(1400);
      };
      await shotCast('hero_soul_drain', { targetId: liveCast.foeId }, 'game-vozgul-dreno-de-alma.png', 500);
      await shotCast('hero_ancestors', {}, 'game-vozgul-ancestrais.png', 900);
      await shotCast('hero_ash_veil', { targetId: liveCast.allyId }, 'game-vozgul-veu-de-cinzas.png', 500);
    }
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
    await sleep(600);
    await attempt(() => shot(page, 'game-vozgul-time-vermelho.png'));
    rec('C6', 'TeamColor: cor de time vermelha muda o material TeamColor e não o Atlas',
      !team.error && team.antes.TeamColor !== team.depois.TeamColor && team.antes.Atlas === team.depois.Atlas ? 'PASS' : 'FAIL',
      team.error || `TeamColor ${team.antes.TeamColor} -> ${team.depois.TeamColor}; Atlas ${team.antes.Atlas} -> ${team.depois.Atlas}`);
    await page.evaluate((uid) => {
      const an = window.game.gameManager.entityViews.viewOf(window.game.gameManager.entitiesById.get(uid)).animator;
      an.setAnimation('idle', true); an.play();
    }, id);
  }

  // ---------------------------------------------------------------- C8b: Vozgul x necromante comum a 3 u (altura relativa)
  const cmp = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const b = gm.entitiesById.get(uid);
    const bx = b.mesh.position.x, bz = b.mesh.position.z;
    let spot = null;
    for (let a = 0; a < 360 && !spot; a += 30) {
      const x = bx + Math.cos((a * Math.PI) / 180) * 3, z = bz + Math.sin((a * Math.PI) / 180) * 3;
      if (!gm.pathfinder.isWater(x, z)) spot = { x, z };
    }
    if (!spot) return { error: 'sem ponto livre' };
    const m = gm.spawnUnit('necromancer', spot.x, spot.z, me);
    if (!m) return { error: 'spawnUnit(mage) devolveu null' };
    await new Promise((resolve) => {
      let n = 0;
      const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
      setTimeout(resolve, 1500);
    });
    const V = window.game.sceneManager.camera.position.constructor;
    const measure = (un) => {
      const view = gm.entityViews.viewOf(un);
      view.root.updateMatrixWorld(true);
      let top = -1e9;
      const rp = view.root.getWorldPosition(new V());
      view.root.traverse((c) => {
        if (!c.isMesh) return;
        c.geometry.computeBoundingBox();
        const box = c.geometry.boundingBox;
        for (const y of [box.min.y, box.max.y]) for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
          const p = new V(x, y, z).applyMatrix4(c.matrixWorld);
          if (p.y > top) top = p.y;
        }
      });
      const h = view.root.getObjectByName('Head');
      const hp = h.getWorldPosition(new V());
      return { rootScaleY: +view.root.scale.y.toFixed(3), headRel: +(hp.y - rp.y).toFixed(3), topRel: +(top - rp.y).toFixed(3) };
    };
    return { dist: +Math.hypot(m.mesh.position.x - bx, m.mesh.position.z - bz).toFixed(2), vozgul: measure(b), mage: measure(m),
      vozgulPos: [bx, b.mesh.position.y, bz], magePos: [m.mesh.position.x, m.mesh.position.y, m.mesh.position.z] };
  }, id));
  data.cmp = cmp;
  if (cmp.error) {
    rec('C8', 'Vozgul x necromante a 3 u', 'FAIL', cmp.error);
  } else {
    await camTo(page, (cmp.vozgulPos[0] + cmp.magePos[0]) / 2, 1.5, (cmp.vozgulPos[2] + cmp.magePos[2]) / 2, 0.7, 1600);
    const pC = await attempt(() => projectPts(page, [[cmp.vozgulPos[0], cmp.vozgulPos[1] + 1.2, cmp.vozgulPos[2]], [cmp.magePos[0], cmp.magePos[1] + 1.2, cmp.magePos[2]]]));
    await attempt(() => shot(page, 'game-vozgul-vs-necromante.png'));
    const ok = Math.abs(cmp.dist - 3) <= 0.25 && Array.isArray(pC) && pC.every((p) => p.inTela);
    rec('C8', 'Vozgul x necromante comum a 3 u (altura da cabeça e do topo, em unidades de mundo, escala da raiz incluída)', ok ? 'PASS' : 'FAIL',
      `distância=${cmp.dist}; Vozgul: raiz×${cmp.vozgul.rootScaleY} cabeça=${cmp.vozgul.headRel} topo=${cmp.vozgul.topRel}; necromante: raiz×${cmp.mage.rootScaleY} cabeça=${cmp.mage.headRel} topo=${cmp.mage.topRel}; ambos na tela=${Array.isArray(pC) && pC.every((p) => p.inTela)}`);
  }
}

async function runInspector(page) {
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=hero_vozgul_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
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
  rec('C9', 'inspetor: hero_vozgul_glb carrega com os 9 nós', !info.error && NODE_NAMES.every((n) => info.names.includes(n)) ? 'PASS' : 'FAIL',
    info.error || `nós=[${info.names.join(',')}]`);
  await attempt(() => shot(page, 'inspetor-vozgul-idle.png'));
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; if (a) { a.setAnimation('cast', true); a.pause(); a.setTime(0.5, false); } }));
  await sleep(700);
  await attempt(() => shot(page, 'inspetor-vozgul-cast.png'));
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
  data.glbHttpStatus = await attempt(() => page.evaluate(async () => (await fetch('/models/hero_vozgul.glb')).status));
  console.log('renderer:', data.renderer, '| GET hero_vozgul.glb:', data.glbHttpStatus);
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
