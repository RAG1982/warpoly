#!/usr/bin/env node
/**
 * Mestre Arcano Oren (hero_oren) no jogo e no inspetor (M2-21). Só mede e captura; não altera src/ nem tests/.
 * Uma partida (continental-1v1, IA congelada) e o inspetor (hero_oren_glb).
 *  C0  public/models/hero_oren.glb (JSON do arquivo): nós, hierarquia (Weapon filho de ArmR, Crystal filho de Weapon), TeamColor.
 *  C1  spawn de hero_oren perto do HQ; a view existe; o animador usa o tipo `mage`.
 *  C2  nós na view; materiais Atlas e TeamColor; sem escudo.
 *  C3  rebind: userData e meshParts (torso, head, armL, armR, legL, legR, weapon, crystal) não nulos.
 *  C4  idle / andar / ataque ('fight') / lançar ('cast') nos instantes 0,2 / 0,5 / 0,8: partes mexem; o cajado (Weapon) fica
 *      em pé (dot do eixo y local com o mundo >= 0,98) em todas as poses; o Crystal pulsa na cast.
 *  C5  caminhada ao vivo por 1 s (comando de movimento).
 *  C6  TeamColor: cor de time vermelha muda o material TeamColor (Torso) sem tocar no Atlas.
 *  C7  erros de página e de console (deprecações listadas à parte).
 *  C8  Oren x mago comum a 3 u (altura); capturas: jogo (zoom 1,0), close-up (0,5), cast ao vivo, time vermelho, Oren x mago, inspetor.
 *  C10 cast ao vivo: Raio Arcano (alvo) e Tempestade Arcana (chão): a view entra em 'cast', o cajado/Crystal respondem e o alvo perde PV.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/hero-oren/game-check.mjs
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
const PORT = 5471;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const NODE_NAMES = ['Mage', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal'];
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
const glb = glbInfo(path.join(ROOT, 'public/models/hero_oren.glb'));
{
  const names = Object.keys(glb.nodes);
  const miss = NODE_NAMES.filter((n) => !names.includes(n));
  const shield = names.filter((n) => /shield|escudo/i.test(n));
  const ok = miss.length === 0 && shield.length === 0 && glb.nodes.Weapon.parent === 'ArmR' && glb.nodes.Crystal.parent === 'Weapon' &&
    glb.nodes.Torso.mats.includes('TeamColor') && glb.nodes.Torso.mats.includes('Atlas') && glb.draws <= 20;
  rec('C0', 'hero_oren.glb: 9 nós, Weapon>ArmR, Crystal>Weapon, Torso com Atlas+TeamColor, <= 20 draw calls', ok ? 'PASS' : 'FAIL',
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
    const u = gm.spawnUnit('hero_oren', spot.x, spot.z, me);
    if (!u) return { error: 'spawnUnit(hero_oren) devolveu null' };
    await new Promise((resolve) => {
      let n = 0;
      const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
      setTimeout(resolve, 1500);
    });
    const view = gm.entityViews.viewOf(u);
    if (!view) return { error: 'sem view do Oren' };
    return {
      id: u.id, type: u.type, visualBase: u.visualBase, me, hq: { x: hx, z: hz }, spot,
      rootName: view.root.name, rootScale: view.root.scale.toArray().map((v) => +v.toFixed(3)),
      rootChildren: view.root.children.map((c) => c.name), animUnitType: view.animator.unitType
    };
  }));
  data.spawn = spawn;
  if (spawn.error) {
    rec('C1', 'spawn hero_oren perto do HQ', 'FAIL', spawn.error);
    return;
  }
  const id = spawn.id;
  rec('C1', 'spawn hero_oren perto do HQ; animador no tipo mage', spawn.animUnitType === 'mage' && spawn.rootName === 'Mage' ? 'PASS' : 'FAIL',
    `id=${id} tipo=${spawn.type} raiz=${spawn.rootName} escala=[${spawn.rootScale}] unitType=${spawn.animUnitType} filhos da raiz=[${spawn.rootChildren}] GET hero_oren.glb=${data.glbHttpStatus}`);

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
    for (const n of ['Mage', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Weapon', 'Crystal']) {
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
    return { found, all, userData, meshParts, shieldGroup: ud.shieldGroup ? ud.shieldGroup.name : null };
  }, id));
  data.inspect = insp;
  if (insp.error) {
    rec('C2', 'nós e materiais na view', 'FAIL', insp.error);
    rec('C3', 'rebind do animador', 'FAIL', 'não medido');
  } else {
    const miss = NODE_NAMES.filter((n) => !insp.found[n]);
    const okMat = insp.found.Torso && insp.found.Torso.mats.includes('Atlas') && insp.found.Torso.mats.includes('TeamColor');
    rec('C2', 'view com os 9 nós; Weapon>ArmR; Crystal>Weapon; Torso com Atlas+TeamColor; sem escudo',
      miss.length === 0 && okMat && insp.found.Weapon.parent === 'ArmR' && insp.found.Crystal.parent === 'Weapon' && !insp.shieldGroup ? 'PASS' : 'FAIL',
      `faltando=[${miss}] Torso=${insp.found.Torso && insp.found.Torso.mats} pai(Weapon)=${insp.found.Weapon && insp.found.Weapon.parent} pai(Crystal)=${insp.found.Crystal && insp.found.Crystal.parent} nós=${insp.all.length}`);
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
    const castUp = minUpOf('cast');        // o animador só contra-gira x e z (como no mago comum): na cast a haste se inclina
    rec('C4', 'idle/walk/fight/cast mexem as partes; cajado em pé (eixo y >= 0,98) em idle/walk/fight e >= 0,8 na cast; Crystal pulsa na cast',
      walkMove > 0.05 && castArm < -1.5 && pulse > 1.02 && minUp >= 0.98 && castUp >= 0.8 ? 'PASS' : 'FAIL',
      `walk dif máx=${walkMove.toFixed(3)} rad; cast armR.x mín=${castArm} rad; Crystal escala máx na cast=${pulse}; Weapon eixo y mundo mín idle/walk/fight=${minUp} cast=${castUp}; ` +
      `fight: armR 0,2=${JSON.stringify(poses.fight[0.2].armR)} 0,5=${JSON.stringify(poses.fight[0.5].armR)} (mage não tem golpe próprio: o ataque do mago é a cast); cast mov=${castMove.toFixed(3)}`);
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
    await attempt(() => shot(page, 'game-oren-no-jogo.png'));
    await camTo(page, bPost.x, bPost.y + 1.2, bPost.z, 0.5, 1600);
    data.pB = await attempt(() => projectPts(page, [[bPost.x, bPost.y + 1.2, bPost.z]]));
    await attempt(() => shot(page, 'game-oren-closeup.png'));
    // C10: cast ao vivo (Raio Arcano no alvo e Tempestade no chão): a view entra em 'cast', o cajado e o Crystal respondem
    const liveCast = await attempt(() => page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const u = gm.entitiesById.get(uid);
      const enemy = gm.players.find((p) => p.id !== me).id;
      const foe = gm.spawnUnit('knight', u.mesh.position.x + 7, u.mesh.position.z + 2, enemy);
      foe.speed = 0; foe.hp = foe.maxHp = 5000; foe.updateHealthBar();
      foe.isCombatUnit = () => false;
      u.mana = u.maxMana;
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
      gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_arcane_bolt', targetId: foe.id });
      const bolt = await sample('hero_arcane_bolt', 1600);
      const foeHp1 = foe.hp;
      gm.issue({ type: 'cast', playerId: me, unitIds: [uid], abilityId: 'hero_blizzard', x: foe.mesh.position.x, z: foe.mesh.position.z });
      const storm = await sample('hero_blizzard', 2200);
      return { bolt, storm, foeHpAfterBolt: foeHp1, foeHpAfterStorm: foe.hp, foeMax: foe.maxHp, mana: Math.round(u.mana), foeId: foe.id };
    }, id));
    data.liveCast = liveCast;
    if (liveCast.error) {
      rec('C10', 'cast ao vivo (Raio Arcano e Tempestade Arcana)', 'FAIL', liveCast.error);
    } else {
      const ok = liveCast.bolt.castFrames >= 3 && liveCast.storm.castFrames >= 3 && liveCast.foeHpAfterBolt < liveCast.foeMax && liveCast.foeHpAfterStorm < liveCast.foeHpAfterBolt;
      rec('C10', 'cast ao vivo: a view entra em cast (>= 3 quadros por magia) e as magias ferem o alvo', ok ? 'PASS' : 'FAIL',
        `Raio Arcano: quadros cast=${liveCast.bolt.castFrames}/${liveCast.bolt.frames} anims=[${liveCast.bolt.anims}] haste mín=${liveCast.bolt.minUp.toFixed(3)} Crystal máx=${liveCast.bolt.maxCrystal.toFixed(2)}; ` +
        `Tempestade: cast=${liveCast.storm.castFrames}/${liveCast.storm.frames} anims=[${liveCast.storm.anims}] haste mín=${liveCast.storm.minUp.toFixed(3)} Crystal máx=${liveCast.storm.maxCrystal.toFixed(2)}; ` +
        `PV do alvo ${liveCast.foeMax} -> ${liveCast.foeHpAfterBolt} (Raio) -> ${liveCast.foeHpAfterStorm} (Tempestade); mana restante=${liveCast.mana}`);
      // captura durante uma nova cast (câmera perto de Oren)
      const oPos = await attempt(() => posOf(page, id));
      await camTo(page, oPos.x + 1.5, oPos.y + 1.2, oPos.z, 0.5, 900);
      await page.evaluate(async ({ uid, fid }) => {
        const gm = window.game.gameManager;
        const u = gm.entitiesById.get(uid);
        u.mana = u.maxMana;
        u.cooldowns && (u.cooldowns.hero_arcane_bolt = 0);
        gm.issue({ type: 'cast', playerId: gm.localPlayerId, unitIds: [uid], abilityId: 'hero_arcane_bolt', targetId: fid });
      }, { uid: id, fid: liveCast.foeId });
      await sleep(550);
      await attempt(() => shot(page, 'game-oren-cast.png'));
      await sleep(1500);
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
    await attempt(() => shot(page, 'game-oren-time-vermelho.png'));
    rec('C6', 'TeamColor: cor de time vermelha muda o material TeamColor e não o Atlas',
      !team.error && team.antes.TeamColor !== team.depois.TeamColor && team.antes.Atlas === team.depois.Atlas ? 'PASS' : 'FAIL',
      team.error || `TeamColor ${team.antes.TeamColor} -> ${team.depois.TeamColor}; Atlas ${team.antes.Atlas} -> ${team.depois.Atlas}`);
    await page.evaluate((uid) => {
      const an = window.game.gameManager.entityViews.viewOf(window.game.gameManager.entitiesById.get(uid)).animator;
      an.setAnimation('idle', true); an.play();
    }, id);
  }

  // ---------------------------------------------------------------- C8b: Oren x mago comum a 3 u (altura relativa)
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
    const m = gm.spawnUnit('mage', spot.x, spot.z, me);
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
    return { dist: +Math.hypot(m.mesh.position.x - bx, m.mesh.position.z - bz).toFixed(2), oren: measure(b), mage: measure(m),
      orenPos: [bx, b.mesh.position.y, bz], magePos: [m.mesh.position.x, m.mesh.position.y, m.mesh.position.z] };
  }, id));
  data.cmp = cmp;
  if (cmp.error) {
    rec('C8', 'Oren x mago a 3 u', 'FAIL', cmp.error);
  } else {
    await camTo(page, (cmp.orenPos[0] + cmp.magePos[0]) / 2, 1.5, (cmp.orenPos[2] + cmp.magePos[2]) / 2, 0.7, 1600);
    const pC = await attempt(() => projectPts(page, [[cmp.orenPos[0], cmp.orenPos[1] + 1.2, cmp.orenPos[2]], [cmp.magePos[0], cmp.magePos[1] + 1.2, cmp.magePos[2]]]));
    await attempt(() => shot(page, 'game-oren-vs-mago.png'));
    const ok = Math.abs(cmp.dist - 3) <= 0.25 && Array.isArray(pC) && pC.every((p) => p.inTela);
    rec('C8', 'Oren x mago comum a 3 u (altura da cabeça e do topo, em unidades de mundo, escala da raiz incluída)', ok ? 'PASS' : 'FAIL',
      `distância=${cmp.dist}; Oren: raiz×${cmp.oren.rootScaleY} cabeça=${cmp.oren.headRel} topo=${cmp.oren.topRel}; mago: raiz×${cmp.mage.rootScaleY} cabeça=${cmp.mage.headRel} topo=${cmp.mage.topRel}; ambos na tela=${Array.isArray(pC) && pC.every((p) => p.inTela)}`);
  }
}

async function runInspector(page) {
  await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=hero_oren_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
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
  rec('C9', 'inspetor: hero_oren_glb carrega com os 9 nós', !info.error && NODE_NAMES.every((n) => info.names.includes(n)) ? 'PASS' : 'FAIL',
    info.error || `nós=[${info.names.join(',')}]`);
  await attempt(() => shot(page, 'inspetor-oren-idle.png'));
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; if (a) { a.setAnimation('cast', true); a.pause(); a.setTime(0.5, false); } }));
  await sleep(700);
  await attempt(() => shot(page, 'inspetor-oren-cast.png'));
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
  data.glbHttpStatus = await attempt(() => page.evaluate(async () => (await fetch('/models/hero_oren.glb')).status));
  console.log('renderer:', data.renderer, '| GET hero_oren.glb:', data.glbHttpStatus);
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
