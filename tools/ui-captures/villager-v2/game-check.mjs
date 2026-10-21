#!/usr/bin/env node
/**
 * Aldeão humano v2 (villager_v2) no jogo e no inspetor (M2-30). Só mede e captura; não altera src/ nem tests/.
 * Uma partida (play, IA congelada) e o inspetor (villager_v2_glb).
 *  C0  public/models/villager_v2.glb (JSON): nós, hierarquia (ToolGroup filho de ArmR, Pack > WoodBundle/GoldSack), TeamColor.
 *  C1  o Aldeão humano do jogador usa o villager_v2 (ToolGroup é malha filha de ArmR; sem Axe/Pickaxe/Hammer); animador `villager`.
 *  C2  materiais Atlas e TeamColor no Torso; ferramenta visível, mochila e cargas ocultas; rebind do animador (toolGroup, pack...).
 *  C3  poses idle / walk / fight (ataque fraco) / gather / hurt / die: as partes mexem; a picareta não entra no chão e não
 *      se separa da mão (distância mão-empunhadura constante em todas as poses).
 *  C4  ao vivo: andar até uma árvore, cortar (gather), carregar lenha andando (Pack/WoodBundle), carregar ouro (GoldSack),
 *      construir (casa), atacar um inimigo parado (golpe fraco), morrer.
 *  C5  TeamColor vermelho muda só o material TeamColor.
 *  C6  erros de página e de console.
 *  Capturas: game-*.png e inspetor-*.png nesta pasta.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/villager-v2/game-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = 5532;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const NODE_NAMES = ['Villager', 'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'ToolGroup', 'Pack', 'WoodBundle', 'GoldSack'];
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

/** Captura um recorte (size x size) centrado na posição projetada da unidade (a câmera suaviza e o recorte não depende dela). */
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
const glb = glbInfo(path.join(ROOT, 'public/models/villager_v2.glb'));
{
  const names = Object.keys(glb.nodes);
  const miss = NODE_NAMES.filter((n) => !names.includes(n));
  const velhos = ['Axe', 'Pickaxe', 'Hammer'].filter((n) => names.includes(n));
  const ok = miss.length === 0 && velhos.length === 0 && glb.nodes.ToolGroup.parent === 'ArmR' && glb.nodes.ToolGroup.mesh &&
    glb.nodes.WoodBundle.parent === 'Pack' && glb.nodes.GoldSack.parent === 'Pack' &&
    glb.nodes.Torso.mats.includes('TeamColor') && glb.nodes.Torso.mats.includes('Atlas') && glb.draws <= 20;
  rec('C0', 'villager_v2.glb: nós do villager, ToolGroup>ArmR (malha), Pack>WoodBundle/GoldSack, Torso com Atlas+TeamColor, <= 20 draw calls', ok ? 'PASS' : 'FAIL',
    `faltando=[${miss}] antigos=[${velhos}] pai(ToolGroup)=${glb.nodes.ToolGroup && glb.nodes.ToolGroup.parent} Torso=${glb.nodes.Torso.mats} draw calls=${glb.draws} triângulos=${glb.tris}`);
}

async function runChecks(page) {
  // ---------------------------------------------------------------- C1: o Aldeão do jogador usa o v2
  const spawn = await attempt(() => page.evaluate(async () => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const u = gm.allUnits.find((x) => x.type === 'villager' && x.ownerId === me);
    if (!u) return { error: 'sem Aldeão do jogador local' };
    await new Promise((resolve) => { let n = 0; const f = () => { if (++n >= 2) resolve(); else requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(resolve, 1500); });
    const view = gm.entityViews.viewOf(u);
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq');
    const tg = view.root.getObjectByName('ToolGroup');
    const names = [];
    view.root.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); });
    return { id: u.id, me, hq: { x: hq.mesh.position.x, z: hq.mesh.position.z }, rootName: view.root.name, animUnitType: view.animator.unitType,
      rootScale: view.root.scale.toArray().map((v) => +v.toFixed(3)), names,
      toolIsMesh: !!(tg && tg.isMesh), toolParent: tg && tg.parent ? tg.parent.name : null,
      legacy: ['Axe', 'Pickaxe', 'Hammer'].filter((n) => view.root.getObjectByName(n)) };
  }));
  data.spawn = spawn;
  if (spawn.error) {
    rec('C1', 'Aldeão do jogador', 'FAIL', spawn.error);
    return;
  }
  const id = spawn.id;
  rec('C1', 'Aldeão humano do jogo é o v2: ToolGroup malha filha de ArmR, sem Axe/Pickaxe/Hammer; animador `villager`',
    spawn.toolIsMesh && spawn.toolParent === 'ArmR' && spawn.legacy.length === 0 && spawn.animUnitType === 'villager' ? 'PASS' : 'FAIL',
    `id=${id} raiz=${spawn.rootName} escala=[${spawn.rootScale}] unitType=${spawn.animUnitType} pai(ToolGroup)=${spawn.toolParent} antigos=[${spawn.legacy}] nós=${spawn.names.length}`);

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
    const keys = ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'toolGroup', 'pack', 'woodBundle', 'goldSack'];
    const userData = {}, meshParts = {};
    for (const k of keys) { userData[k] = ud[k] ? ud[k].name : null; meshParts[k] = view.animator.meshParts[k] ? view.animator.meshParts[k].name : null; }
    return { torsoMats: matsOf(root.getObjectByName('Torso')), userData, meshParts,
      vis: { tool: ud.toolGroup.visible, pack: ud.pack.visible, wood: ud.woodBundle.visible, gold: ud.goldSack.visible } };
  }, id));
  data.inspect = insp;
  if (insp.error) {
    rec('C2', 'materiais e rebind', 'FAIL', insp.error);
  } else {
    const nulos = Object.keys(insp.userData).filter((k) => insp.userData[k] === null || insp.meshParts[k] === null);
    rec('C2', 'Torso com Atlas+TeamColor; ferramenta visível, mochila/cargas ocultas; rebind do animador completo',
      nulos.length === 0 && insp.torsoMats.includes('Atlas') && insp.torsoMats.includes('TeamColor') && insp.vis.tool && !insp.vis.pack && !insp.vis.wood && !insp.vis.gold ? 'PASS' : 'FAIL',
      `nulos=[${nulos}] Torso=${insp.torsoMats} visível=${JSON.stringify(insp.vis)}`);
  }

  // ---------------------------------------------------------------- C3: poses (partes mexem; picareta fora do chão e presa à mão)
  const poses = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const view = gm.entityViews.viewOf(gm.entitiesById.get(uid));
    const an = view.animator;
    const root = view.root;
    const V = root.position.constructor;
    const r = (o) => [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => +v.toFixed(3));
    const out = {};
    const plan = [['idle', [0.1, 0.5, 0.8]], ['walk', [0.0, 0.2, 0.4, 0.6]], ['fight', [0.1, 0.3, 0.5, 0.7, 0.9]],
      ['gather', [0.0, 0.3, 0.6, 0.9, 1.2]], ['hurt', [0.1, 0.4]], ['die', [0.2, 0.6, 1.2, 2.5]]];
    // posição da empunhadura no mundo (origem do nó ToolGroup) relativa à mão: o ToolGroup é filho de ArmR, então a distância
    // entre a origem do ToolGroup e a origem do ArmR no espaço do ArmR tem que ser constante (rigidez)
    for (const [anim, ts] of plan) {
      an.setAnimation(anim, true);
      an.pause();
      out[anim] = {};
      for (const t of ts) {
        an.setTime(t, false);
        const P = an.meshParts;
        root.updateMatrixWorld(true);
        const base = new V(); root.getWorldPosition(base);
        const grip = new V(); P.toolGroup.getWorldPosition(grip);
        const local = P.armR.worldToLocal(grip.clone());
        // ponto mais baixo da ferramenta no mundo (vértices da malha)
        let minY = 1e9, maxFwd = -1e9;
        const tmp = new V();
        const pos = P.toolGroup.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 7) {
          tmp.fromBufferAttribute(pos, i).applyMatrix4(P.toolGroup.matrixWorld);
          minY = Math.min(minY, tmp.y - base.y);
        }
        out[anim][t] = { armR: r(P.armR), armL: r(P.armL), tool: r(P.toolGroup), torso: r(P.torso), legL: r(P.legL),
          gripLocal: local.toArray().map((v) => +v.toFixed(3)), toolMinY: +minY.toFixed(3) };
      }
    }
    an.setAnimation('idle', true);
    an.play();
    return out;
  }, id));
  data.poses = poses;
  if (poses.error) {
    rec('C3', 'poses idle/walk/fight/gather/hurt/die', 'FAIL', poses.error);
  } else {
    const dif = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const walkMove = dif(poses.walk[0].legL, poses.walk[0.2].legL);
    const gatherMove = dif(poses.gather[0].armR, poses.gather[0.3].armR);
    const fightMove = dif(poses.fight[0.1].armR, poses.fight[0.5].armR);
    const minY = Math.min(...Object.values(poses).flatMap((o) => Object.values(o).map((p) => p.toolMinY)));
    const grips = Object.values(poses).flatMap((o) => Object.values(o).map((p) => p.gripLocal));
    const gripSpread = Math.max(...[0, 1, 2].map((k) => Math.max(...grips.map((g) => g[k])) - Math.min(...grips.map((g) => g[k]))));
    rec('C3', 'walk/gather/fight mexem braço e perna; a picareta não entra no chão (minY >= -0,05) e a empunhadura fica presa ao ArmR',
      walkMove > 0.5 && gatherMove > 0.3 && fightMove > 0.3 && minY >= -0.05 && gripSpread < 1e-3 ? 'PASS' : 'FAIL',
      `walk legL dif=${walkMove.toFixed(2)} gather armR dif=${gatherMove.toFixed(2)} fight armR dif=${fightMove.toFixed(2)} ponto mais baixo da picareta (acima do pé) mín=${minY} ` +
      `dispersão da empunhadura no espaço do ArmR=${gripSpread.toFixed(4)}; gather tool.x em 0/0,3/0,6/0,9 = ${[0, 0.3, 0.6, 0.9].map((t) => poses.gather[t].tool[0])}; ` +
      `minY por animação: ${Object.entries(poses).map(([a, o]) => a + '=' + Math.min(...Object.values(o).map((p) => p.toolMinY))).join(' ')}`);
  }

  // ---------------------------------------------------------------- C4a: andar e cortar madeira ao vivo
  await follow(page, id, 0.5, 800);
  const live = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const u = gm.entitiesById.get(uid);
    const tree = gm.trees.filter((x) => !x.isDead).sort((a, b) =>
      Math.hypot(a.mesh.position.x - u.mesh.position.x, a.mesh.position.z - u.mesh.position.z) -
      Math.hypot(b.mesh.position.x - u.mesh.position.x, b.mesh.position.z - u.mesh.position.z))[0];
    if (!tree) return { error: 'sem árvore' };
    u.orderGather(tree);
    return { tree: { x: tree.mesh.position.x, z: tree.mesh.position.z } };
  }, id));
  data.live = live;
  if (live.error) {
    rec('C4', 'ordem de cortar madeira', 'FAIL', live.error);
  } else {
    await follow(page, id, 0.3, 1200);
    await attempt(() => shotUnit(page, id, 'game-villager-andando.png'));
    let st = 'moving';
    let seenGather = false;
    for (let i = 0; i < 60 && st !== 'gather'; i++) {
      st = await page.evaluate((uid) => { const g = window.game.gameManager; return g.entityViews.viewOf(g.entitiesById.get(uid)).animator.currentAnim === 'gather' ? 'gather' : 'x'; }, id);
      await follow(page, id, 0.3, 500);
    }
    seenGather = st === 'gather';
    data.cortando = [];
    // câmera de lado em relação à árvore (a árvore não tapa o Aldeão): ângulo = direção árvore -> Aldeão ± 0,9 rad
    const base = await page.evaluate(([uid, t]) => {
      const u = window.game.gameManager.entitiesById.get(uid);
      return Math.atan2(u.mesh.position.z - t.z, u.mesh.position.x - t.x);
    }, [id, live.tree]);
    const angulos = [base + 0.9, base - 0.9];
    for (let k = 0; k < angulos.length; k++) {
      await follow(page, id, 0.3, 250, angulos[k]);
      for (const f of ['a', 'b', 'c', 'd']) {
        const an = await page.evaluate((uid) => { const g = window.game.gameManager; return g.entityViews.viewOf(g.entitiesById.get(uid)).animator.currentAnim; }, id);
        data.cortando.push(`${k}${f}:${an}`);
        await attempt(() => shotUnit(page, id, `game-villager-cortando-${k}${f}.png`));
        await sleep(240);
      }
    }
    await follow(page, id, 0.3, 200, Math.PI / 4);
    const cut = await page.evaluate((uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      const view = gm.entityViews.viewOf(u);
      return { state: u.state, anim: view.animator.currentAnim, toolVisible: view.root.userData.toolGroup.visible };
    }, id);
    rec('C4a', 'andou até a árvore e cortou (animação gather vista na view, picareta visível)', seenGather && cut.toolVisible ? 'PASS' : 'FAIL', JSON.stringify({ seenGather, ...cut }));

    // carregar lenha: Pack + WoodBundle e o gesto de andar com carga
    const carry = await page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      u.carrying = { type: 'wood', amount: 10 };
      u.updateCarryingVisuals(true);
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && b.role === 'hq');
      gm.issue({ type: 'move', playerId: gm.localPlayerId, unitIds: [uid], x: hq.mesh.position.x + 6, z: hq.mesh.position.z + 6 });
      await new Promise((r) => setTimeout(r, 900));
      const view = gm.entityViews.viewOf(u);
      const ud = view.root.userData;
      return { pack: ud.pack.visible, wood: ud.woodBundle.visible, gold: ud.goldSack.visible, anim: view.animator.currentAnim, carrying: view.animator.carrying };
    }, id);
    await follow(page, id, 0.3, 100);
    await attempt(() => shotUnit(page, id, 'game-villager-carrega-lenha.png'));
    data.carryWood = carry;
    rec('C4b', 'carregando lenha: Pack e WoodBundle visíveis, sem GoldSack; animador em carga andando', carry.pack && carry.wood && !carry.gold && carry.carrying && carry.anim === 'walk' ? 'PASS' : 'FAIL', JSON.stringify(carry));
    await sleep(500);
    await follow(page, id, 0.3, 100);
    await attempt(() => shotUnit(page, id, 'game-villager-carrega-lenha-b.png'));
    const gold = await page.evaluate(async (uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      u.carrying = { type: 'gold', amount: 10 };
      u.updateCarryingVisuals(true);
      await new Promise((r) => setTimeout(r, 500));
      const ud = gm.entityViews.viewOf(u).root.userData;
      return { pack: ud.pack.visible, wood: ud.woodBundle.visible, gold: ud.goldSack.visible };
    }, id);
    await follow(page, id, 0.3, 100);
    await attempt(() => shotUnit(page, id, 'game-villager-carrega-ouro.png'));
    data.carryGold = gold;
    rec('C4c', 'carregando ouro: Pack e GoldSack visíveis, sem WoodBundle', gold.pack && gold.gold && !gold.wood ? 'PASS' : 'FAIL', JSON.stringify(gold));
    await page.evaluate((uid) => {
      const u = window.game.gameManager.entitiesById.get(uid);
      u.carrying = { type: null, amount: 0 };
      u.updateCarryingVisuals(false);
    }, id);
  }

  // ---------------------------------------------------------------- C4d: construir uma casa
  const build = await attempt(() => page.evaluate(async (uid) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const u = gm.entitiesById.get(uid);
    const hx = u.mesh.position.x, hz = u.mesh.position.z;
    let spot = null;
    for (let r = 6; r <= 24 && !spot; r += 3) {
      for (let a = 0; a < 360 && !spot; a += 30) {
        const x = hx + Math.cos((a * Math.PI) / 180) * r, z = hz + Math.sin((a * Math.PI) / 180) * r;
        if (!gm.pathfinder.isWater(x, z) && gm.canPlaceBuilding('cottage', x, z, null, me)) spot = { x, z };
      }
    }
    if (!spot) return { error: 'sem ponto livre para a casa' };
    gm.players.find((p) => p.id === me).resources && Object.assign(gm.players.find((p) => p.id === me).resources, { gold: 5000, wood: 5000, stone: 5000 });
    gm.issue({ type: 'placeBuilding', playerId: me, buildingType: 'cottage', x: spot.x, z: spot.z, unitIds: [uid] });
    return { spot };
  }, id));
  data.build = build;
  if (build.error) {
    rec('C4d', 'construir uma casa', 'FAIL', build.error);
  } else {
    let st = '';
    for (let i = 0; i < 40 && st !== 'building'; i++) {
      st = await page.evaluate((uid) => window.game.gameManager.entitiesById.get(uid).state, id);
      await follow(page, id, 0.5, 600);
    }
    await sleep(400);
    await follow(page, id, 0.3, 100);
    await attempt(() => shotUnit(page, id, 'game-villager-construindo-a.png'));
    await sleep(300);
    await attempt(() => shotUnit(page, id, 'game-villager-construindo-b.png'));
    const b = await page.evaluate((uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      return { state: u.state, anim: gm.entityViews.viewOf(u).animator.currentAnim };
    }, id);
    rec('C4d', 'construiu: estado building com a animação gather (martelada com a picareta)', b.state === 'building' && b.anim === 'gather' ? 'PASS' : 'FAIL', JSON.stringify(b));
  }

  // ---------------------------------------------------------------- C4e: ataque fraco e morte ao vivo
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
    const foe = gm.spawnUnit('knight', u.mesh.position.x + (rx / rl) * 1.7, u.mesh.position.z + (rz / rl) * 1.7, enemy);
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
    return { anims: [...seen], fightFrames, foeHp: foe.hp, foeMax: foe.maxHp, foeId: foe.id, ux: u.mesh.position.x, uz: u.mesh.position.z };
  }, id));
  data.fight = fight;
  if (fight.error) {
    rec('C4e', 'ataque fraco ao vivo', 'FAIL', fight.error);
  } else {
    await follow(page, id, 0.3, 100);
    for (const s of ['a', 'b', 'c']) {
      await attempt(() => shotUnit(page, id, `game-villager-ataque-${s}.png`));
      await sleep(260);
    }
    rec('C4e', 'ataque fraco: animação fight (>= 10 quadros) e o alvo perde PV', fight.fightFrames >= 10 && fight.foeHp < fight.foeMax ? 'PASS' : 'FAIL',
      `anims=[${fight.anims}] quadros fight=${fight.fightFrames} PV do alvo ${fight.foeMax} -> ${fight.foeHp}`);
    // morte: o animador em 'die' por 2,5 s, capturas em 0,25 / 0,6 / 2,0 s
    await page.evaluate(({ uid, fid }) => {
      const gm = window.game.gameManager;
      gm.entitiesById.get(fid).hp = 0;
      const u = gm.entitiesById.get(uid);
      u.takeDamage(99999, gm.entitiesById.get(fid));
    }, { uid: id, fid: fight.foeId });
    for (const [n, ms] of [['a', 250], ['b', 350], ['c', 1400]]) {
      await sleep(ms);
      await attempt(() => shotUnit(page, id, `game-villager-morte-${n}.png`));
    }
    const die = await page.evaluate((uid) => {
      const gm = window.game.gameManager;
      const u = gm.entitiesById.get(uid);
      const view = u && gm.entityViews.viewOf(u);
      return u ? { state: u.state, hp: u.hp, anim: view ? view.animator.currentAnim : null } : { gone: true };
    }, id);
    rec('C4f', 'morte: o Aldeão entra em die (ou já saiu da partida)', die.gone || die.anim === 'die' || die.hp <= 0 ? 'PASS' : 'FAIL', JSON.stringify(die));
  }

  // ---------------------------------------------------------------- C5: cor de time vermelha em outro Aldeão
  const team = await attempt(() => page.evaluate(async () => {
    const { ModelFactory } = await import('/src/entities/ModelFactory.js');
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const u = gm.allUnits.find((x) => x.type === 'villager' && x.ownerId === me && x.hp > 0);
    if (!u) return { error: 'sem outro Aldeão vivo' };
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
    await follow(page, team.id, 0.4, 700);
    await attempt(() => shotUnit(page, team.id, 'game-villager-time-vermelho.png'));
  }
  rec('C5', 'TeamColor: cor de time vermelha muda o material TeamColor e não o Atlas',
    !team.error && team.antes.TeamColor !== team.depois.TeamColor && team.antes.Atlas === team.depois.Atlas ? 'PASS' : 'FAIL',
    team.error || `TeamColor ${team.antes.TeamColor} -> ${team.depois.TeamColor}; Atlas ${team.antes.Atlas} -> ${team.depois.Atlas}`);
}

// ---------------------------------------------------------------- inspetor
async function runInspector(page) {
  const nodesOf = () => page.evaluate(() => {
    const m = window.inspectorApp.currentModelObject;
    const names = [];
    m.traverse((c) => { if (c.name && !names.includes(c.name)) names.push(c.name); });
    return names;
  });
  const r = await attempt(async () => {
    await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=villager_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
    await sleep(1200);
    const antigo = await nodesOf();
    await page.goto(`http://127.0.0.1:${PORT}/inspector.html?model=villager_v2_glb&anim=idle`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.currentModelObject, null, { timeout: 90000 });
    await sleep(1200);
    const novo = await nodesOf();
    return { antigoPickaxe: antigo.includes('Pickaxe'), novoTool: novo.includes('ToolGroup'), novoPack: novo.includes('Pack'), novoPickaxe: novo.includes('Pickaxe'), nodes: novo.length };
  });
  data.inspector = r;
  rec('I0', 'inspetor: villager_glb (antigo, com Pickaxe) e villager_v2_glb (novo) carregam', !r.error && r.antigoPickaxe && r.novoTool && r.novoPack && !r.novoPickaxe ? 'PASS' : 'FAIL', JSON.stringify(r));
  if (r.error) return;
  for (const [anim, t, name] of [['idle', 0.3, 'idle'], ['walk', 0.2, 'andar'], ['gather', 0.2, 'coleta-a'], ['gather', 0.8, 'coleta-b'], ['fight', 0.55, 'ataque']]) {
    await attempt(() => page.evaluate(([anim, t]) => { const a = window.inspectorApp.animator; a.setAnimation(anim, true); a.pause(); a.setTime(t, false); }, [anim, t]));
    await sleep(500);
    await attempt(() => shot(page, `inspetor-villager-v2-${name}.png`));
  }
  // carga e cor de time no inspetor
  await attempt(() => page.evaluate(() => { const a = window.inspectorApp.animator; a.setAnimation('walk', true); a.pause(); a.setTime(0.2, false); a.setVillagerCargo('wood'); }));
  await sleep(400);
  await attempt(() => shot(page, 'inspetor-villager-v2-carga-lenha.png'));
  await attempt(() => page.evaluate(() => { window.inspectorApp.animator.setVillagerCargo('gold'); }));
  await sleep(400);
  await attempt(() => shot(page, 'inspetor-villager-v2-carga-ouro.png'));
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
