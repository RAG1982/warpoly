#!/usr/bin/env node
/**
 * M2-10 — medição e captura das espécies de árvore novas (`broad|palm|acacia`) no jogo.
 *
 * NÃO rode direto: `bash tools/safe-run.sh --timeout 300 -- node tools/m2-10-trees.mjs` (GPU real; usa tools/lib/assertGpu.mjs).
 * Sobe o próprio Vite em 127.0.0.1:5301 (strictPort). Fluxo:
 *   1. abre o jogo (mapa-base) e mede os draw calls "inicial" (nenhuma espécie lazy carregada);
 *   2. enquanto os JSON dos mapas de bioma não foram reassados com as espécies novas (M2-03), reatribui em memória as espécies dos
 *      bosques de `duelo-continental-1` (rodízio broad/palm/acacia/oak) e reinicia a partida por esse mapa (o carregamento sob demanda
 *      dos .glb lazy é o do jogo: `lazyTreeKeysOfMap` em `_loadMatch`);
 *   3. por espécie: aponta a câmera para um bosque dela, mede os draw calls com e sem os InstancedMesh daquela espécie (delta) e capta.
 * Saída: tools/ui-captures/m2-10/{resultado.json,*.jpg}.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5301;
const OUT = 'tools/ui-captures/m2-10';
mkdirSync(OUT, { recursive: true });

const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--disable-dev-shm-usage'];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser = null;
const result = { when: new Date().toISOString() };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('about:blank');
  result.gpu = await assertHardwareGpu(page);

  await page.goto(`${base}/?skipPreload&texq=low`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const inGame = () => page.waitForFunction(() => window.game && window.game.fsm && window.game.fsm.is('InGame') && window.game.session, null, { timeout: 120000, polling: 500 });
  await inGame();

  // média de draw calls por quadro (soma das passadas de renderer.render, como o bench), N quadros
  const measure = (frames = 40) => page.evaluate(async (n) => {
    const r = window.game.sceneManager.renderer;
    let acc = 0, cnt = 0;
    const orig = r.render.bind(r);
    let frameCalls = 0;
    r.render = (...a) => { orig(...a); frameCalls += r.info.render.calls; };
    await new Promise((res) => {
      const tick = () => {
        if (cnt > 0) acc += frameCalls; // descarta o 1º quadro (aquecimento)
        frameCalls = 0;
        if (++cnt > n) { r.render = orig; res(); } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return Math.round(acc / n);
  }, frames);

  result.baseMap = { mapId: await page.evaluate(() => window.game.matchConfig.mapId), drawCalls: await measure(), lazyKeysLoaded: await page.evaluate(async () => { const m = await import('/src/entities/glbModels.js'); return ['tree_broad', 'tree_palm', 'tree_acacia'].filter((k) => m.glbTemplates.has(k)); }) };

  // 2. reatribui as espécies dos bosques do mapa de bioma e reinicia por ele
  const assigned = await page.evaluate(async () => {
    const { getMap } = await import('/src/data/maps/index.js');
    const m = getMap('duelo-continental-1');
    // bosques vizinhos ficam com a mesma espécie (como no reasse por bioma: costa → palmeira, savana → acácia, exuberante → copa larga)
    const order = m.forests.map((f, i) => i).sort((a, b) => (m.forests[a].x + m.forests[a].z) - (m.forests[b].x + m.forests[b].z));
    const cycle = ['palm', 'acacia', 'broad', 'oak'];
    order.forEach((idx, k) => { m.forests[idx].species = cycle[Math.min(cycle.length - 1, Math.floor((k * cycle.length) / order.length))]; });
    window.game.fsm.transition('Paused');
    window.game.fsm.transition('Loading', { config: { ...window.game.matchConfig, mapId: 'duelo-continental-1' } });
    return m.forests.map((f) => ({ x: f.x, z: f.z, species: f.species }));
  });
  await page.waitForTimeout(1500);
  await inGame();
  result.biomeMap = { mapId: await page.evaluate(() => window.game.matchConfig.mapId), forests: assigned.length };
  result.biomeMap.lazyKeysLoaded = await page.evaluate(async () => { const m = await import('/src/entities/glbModels.js'); return ['tree_broad', 'tree_palm', 'tree_acacia'].filter((k) => m.glbTemplates.has(k)); });
  await page.evaluate(() => { if (window.game.gameManager.aiDirector) window.game.gameManager.aiDirector.update = () => {}; window.game.gameManager.fogOfWar.setEnabled(false); }); // sem névoa: as capturas mostram os bosques

  // 3. por espécie
  result.perSpecies = {};
  for (const species of ['broad', 'palm', 'acacia', 'oak']) {
    const f = assigned.find((q) => q.species === species);
    await page.evaluate(({ x, z }) => {
      const sm = window.game.sceneManager;
      sm.cameraTarget.set(x, 2, z);
      sm.updateCamera(0); // zoom padrão do jogo
    }, f);
    await page.waitForTimeout(600);
    const withSp = await measure();
    const info = await page.evaluate(async (sp) => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const tm = window.game.session.entityViews.treeManager;
      const key = 'tree_' + sp;
      const meshes = tm.instancedMeshes.filter((m) => m.userData.lodKey === key);
      const imps = meshes.map((m) => m.userData.lodImpostor).filter(Boolean);
      const all = [...meshes, ...imps];
      const camx = window.game.sceneManager.camera;
      camx.updateMatrixWorld(true);
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().fromArray(camx.projectionMatrix.elements), new THREE.Matrix4().fromArray(camx.matrixWorldInverse.elements)));
      const inView = meshes.filter((m) => { if (!m.boundingSphere) m.computeBoundingSphere(); return fr.intersectsSphere(m.boundingSphere); }).length;
      window.__saved = all.map((m) => m.visible);
      all.forEach((m) => { m.visible = false; });
      const cam = window.game.sceneManager.camera;
      return { chunks: meshes.length, chunksNoFrustum: inView, trees: tm.countOf(sp), material: meshes[0]?.material?.map ? 'atlas' : 'cor-reserva', camera: cam.position.toArray().map((v) => Math.round(v)) };
    }, species);
    const without = await measure();
    await page.evaluate((sp) => {
      const tm = window.game.session.entityViews.treeManager;
      const key = 'tree_' + sp;
      const all = tm.instancedMeshes.filter((m) => m.userData.lodKey === key);
      const imps = all.map((m) => m.userData.lodImpostor).filter(Boolean);
      [...all, ...imps].forEach((m, i) => { m.visible = window.__saved[i]; });
    }, species);
    await page.waitForTimeout(300);
    // captura só com a espécie (as outras árvores escondidas por um instante) e outra com todas
    await page.screenshot({ path: `${OUT}/${species}-todas.jpg` });
    const hidden = await page.evaluate((sp) => {
      const tm = window.game.session.entityViews.treeManager;
      const others = [...tm.instancedMeshes, ...tm.lodMeshes].filter((m) => m.visible && (m.userData.lodKey ?? '') !== 'tree_' + sp && !(m.userData.isTreeImpostor && m.userData.lodKey === 'tree_' + sp));
      window.__others = others;
      others.forEach((m) => { m.visible = false; });
      return others.length;
    }, species);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${species}.jpg` });
    await page.evaluate(() => { (window.__others || []).forEach((m) => { m.visible = true; }); });
    void hidden;
    result.perSpecies[species] = { ...info, drawCallsWith: withSp, drawCallsWithout: without, delta: withSp - without };
  }

  // 4. clique na copa da palmeira (hit-proxy): raycast do centro da copa projetada
  result.palmPick = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const gm = window.game.gameManager;
    const sm = window.game.sceneManager;
    const palm = gm.trees.find((t) => t.treeType === 'palm' && !t.isDead);
    if (!palm) return { ok: false, reason: 'sem palmeira' };
    const a = palm.baseRotY, s = palm.scale;
    const view = window.game.session.entityViews._trees.views.find((v) => v.tree === palm);
    sm.cameraTarget.set(palm.basePos.x, 2, palm.basePos.z);
    sm.zoomLevel = sm.targetZoomLevel = 0.6;
    sm.updateCamera(0);
    sm.camera.updateMatrixWorld(true);
    const pick = (sign) => {
      const p = new THREE.Vector3(palm.basePos.x + sign * Math.cos(a) * 1.6 * s, palm.basePos.y + 6.2 * s, palm.basePos.z - sign * Math.sin(a) * 1.6 * s);
      const ray = new THREE.Raycaster(p.clone().setY(p.y + 30), new THREE.Vector3(0, -1, 0)); // raio vertical sobre o ponto
      return ray.intersectObject(view.root, false).length > 0;
    };
    // centro da copa acerta o hit-proxy da palmeira; o ponto espelhado (do outro lado do pé, mesma altura; raios verticais) não
    return { ok: true, crownHit: pick(1), mirroredHit: pick(-1) };
  });

  result.pageErrors = errors.slice(0, 10);
  writeFileSync(`${OUT}/resultado.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await vite.close();
}
