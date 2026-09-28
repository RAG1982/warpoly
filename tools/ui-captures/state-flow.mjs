#!/usr/bin/env node
/**
 * F2-04 · Fluxo da máquina de estados + teste de vazamento entre partidas + capturas.
 *
 *   menu → Iniciar (humano) → 20 s → Esc (pausa) → Menu Principal → Iniciar (orc) → 20 s
 *   → pausa → Reiniciar → 20 s → vitória forçada (modal) → Jogar novamente → 20 s
 *   → Menu Principal → Iniciar (humano) → 20 s → Menu Principal
 *
 * Em cada partida registra renderer.info.memory (geometrias/texturas), programas, heap JS
 * (após gc forçado) e a contagem de objetos da cena, logo após o início e aos 20 s; e o
 * mesmo no menu, depois do dispose. Falha se houver erro de console/pageerror ou se as
 * contagens saírem de ±5% do patamar (ver comentário da verificação no fim de main()).
 * Capturas em tools/ui-captures/state/.
 *
 * Requer um dev server já rodando (padrão http://127.0.0.1:5185). NÃO rode direto:
 *   bash tools/safe-run.sh --timeout 400 -- node tools/ui-captures/state-flow.mjs [--url=...]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'tools/ui-captures/state');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const s = a.replace(/^--/, '');
  const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const BASE = (args.url || 'http://127.0.0.1:5185').replace(/\/$/, '');
const PLAY_S = Number(args.play || 20);
const TOL = 0.05;

// GPU real (ANGLE/Vulkan), como tools/bench/run-bench.mjs; limites de memória do smoke.
const CHROMIUM_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  '--js-flags=--max-old-space-size=2048 --expose-gc', '--enable-precise-memory-info',
  '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions',
  '--autoplay-policy=no-user-gesture-required'
];

let browser = null;
const errors = [];
const rows = [];

async function stats(page, label) {
  const s = await page.evaluate(async () => {
    const app = window.warpoly;
    for (let i = 0; i < 3; i++) { window.gc?.(); await new Promise((r) => setTimeout(r, 120)); }
    const sm = app.sceneManager;
    const info = sm.renderer.info;
    let objects = 0;
    sm.scene.traverse(() => objects++);
    const gm = app.gameManager;
    return {
      state: app.state,
      match: app.matchCount,
      faction: gm ? gm.playerFaction : '-',
      seed: app.matchConfig ? app.matchConfig.seed : null,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : null,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      sceneObjects: objects,
      sceneChildren: sm.scene.children.length,
      units: gm ? gm.allUnits.length : 0,
      buildings: gm ? gm.buildings.length : 0,
      trees: gm ? gm.trees.length : 0,
      fx: app.particleSystem ? app.particleSystem.particles.length + app.particleSystem.floatingTexts.length : 0,
      gameTime: gm ? +gm.gameTime.toFixed(1) : 0
    };
  });
  const row = { label, ...s };
  rows.push(row);
  console.log(`${label.padEnd(28)} ${JSON.stringify(s)}`);
  return row;
}

const waitState = (page, st, timeout = 180000) =>
  page.waitForFunction((x) => window.warpoly && window.warpoly.state === x, st, { timeout, polling: 100 });

async function play(page, seconds) {
  // Um pouco de entrada real: seleção em caixa, ordem de movimento, pan de câmera.
  await page.mouse.move(300, 250);
  await page.mouse.down();
  await page.mouse.move(980, 560, { steps: 8 });
  await page.mouse.up();
  await page.mouse.click(640, 300, { button: 'right' });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(Math.max(0, seconds * 1000 - 800));
  // Limpa a seleção para o Esc abrir a pausa.
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.warpoly.gameManager.clearSelection());
}

async function startFromMenu(page, faction) {
  await page.waitForSelector('#main-menu.mm-ready');
  await page.click('[data-action="new-game"]');
  await waitState(page, 'MatchSetup', 5000);
  await page.click(`.mm-faction--${faction}`);
  await page.click('[data-action="start"]');
  await waitState(page, 'InGame');
  await page.waitForTimeout(1500);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${BASE}/?texq=low`, { waitUntil: 'load' });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?';
  });
  console.log(`WebGL: ${gpu}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/00-menu.png` });

  // --- Partida 1: humano, pelo menu (preload roda aqui, uma vez só)
  const t0 = Date.now();
  await startFromMenu(page, 'human');
  console.log(`partida 1 pronta em ${Date.now() - t0} ms (com preload)`);
  const p1s = await stats(page, 'P1 humano · início');
  await play(page, PLAY_S);
  const p1 = await stats(page, 'P1 humano · 20 s');

  // Pausa por Esc, captura, fecha com Esc, reabre pelo botão da HUD
  await page.keyboard.press('Escape');
  await waitState(page, 'Paused', 5000);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/01-pausa.png` });
  const frozen = await page.evaluate(async () => {
    const gm = window.warpoly.gameManager;
    const a = gm.gameTime;
    await new Promise((r) => setTimeout(r, 600));
    return { a, b: gm.gameTime };
  });
  if (frozen.a !== frozen.b) errors.push(`simulação andou durante a pausa: ${frozen.a} → ${frozen.b}`);
  await page.keyboard.press('Escape');
  await waitState(page, 'InGame', 5000);
  await page.click('#btn-pause-menu');
  await waitState(page, 'Paused', 5000);
  await page.click('[data-pause-action="main-menu"]');
  await waitState(page, 'MainMenu', 10000);
  await page.waitForTimeout(500);
  const m1 = await stats(page, 'Menu após P1 (dispose)');

  // --- Partida 2: orc, pelo menu (sem novo preload)
  const t2 = Date.now();
  await startFromMenu(page, 'orc');
  console.log(`partida 2 pronta em ${Date.now() - t2} ms (sem preload)`);
  await stats(page, 'P2 orc · início');
  await play(page, PLAY_S);
  const p2 = await stats(page, 'P2 orc · 20 s');

  // --- Partida 3: Reiniciar pelo menu de pausa
  await page.keyboard.press('Escape');
  await waitState(page, 'Paused', 5000);
  await page.click('[data-pause-action="restart"]');
  await page.waitForFunction(() => window.warpoly.state === 'InGame' && window.warpoly.matchCount === 3, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await stats(page, 'P3 orc reinício · início');
  await play(page, PLAY_S);
  const p3 = await stats(page, 'P3 orc reinício · 20 s');

  // --- Fim de jogo: vitória forçada (derruba os HQs inimigos) e captura do modal
  await page.evaluate(() => {
    const gm = window.warpoly.gameManager;
    gm.buildings
      .filter((b) => gm.isHostile(gm.localPlayerId, b.ownerId) && ['great_hall', 'castle'].includes(b.type))
      .forEach((b) => { b.hp = 0; b.die(); });
  });
  await waitState(page, 'PostGame', 10000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-fim-de-jogo.png` });
  const seedBefore = await page.evaluate(() => window.warpoly.matchConfig.seed);
  await page.click('#btn-play-again');
  await page.waitForFunction(() => window.warpoly.state === 'InGame' && window.warpoly.matchCount === 4, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const seedAfter = await page.evaluate(() => window.warpoly.matchConfig.seed);
  if (seedAfter === seedBefore) errors.push('Jogar novamente não trocou a seed');
  const modalHidden = await page.evaluate(() => document.getElementById('game-over-modal').style.display === 'none');
  if (!modalHidden) errors.push('modal de fim de jogo continuou aberto na nova partida');
  await stats(page, 'P4 jogar novamente · início');
  await play(page, PLAY_S);
  const p4 = await stats(page, 'P4 jogar novamente · 20 s');
  await page.screenshot({ path: `${OUT}/03-partida-4.png` });

  // Volta ao menu pela pausa e mede o patamar pós-dispose
  await page.keyboard.press('Escape');
  await waitState(page, 'Paused', 5000);
  await page.click('[data-pause-action="main-menu"]');
  await waitState(page, 'MainMenu', 10000);
  await page.waitForTimeout(500);
  const m4 = await stats(page, 'Menu após P4 (dispose)');

  // --- Partida 5: humano de novo (mesma facção da P1, com os caches já aquecidos)
  await startFromMenu(page, 'human');
  const p5s = await stats(page, 'P5 humano · início');
  await play(page, PLAY_S);
  const p5 = await stats(page, 'P5 humano · 20 s');
  await page.keyboard.press('Escape');
  await waitState(page, 'Paused', 5000);
  await page.click('[data-pause-action="main-menu"]');
  await waitState(page, 'MainMenu', 10000);
  await page.waitForTimeout(500);
  const m5 = await stats(page, 'Menu após P5 (dispose)');

  // Verificação (±5%).
  // - GPU (geometrias/texturas) e heap: cada template/textura em cache sobe para a GPU na 1ª vez
  //   em que aparece na tela e fica lá (é compartilhado). A 1ª partida humana nunca mostra a base
  //   orc de perto (névoa), então o patamar "quente" só existe a partir da P2. Comparação:
  //   P3/P4/P5 vs P2 aos 20 s, e menu pós-dispose M5 vs M4.
  // - Objetos da cena no início da partida (estrutura, sem efeito do jogo): P5 vs P1 (humano).
  const pct = (a, b) => (a ? (b - a) / a : 0);
  const report = [];
  const check = (name, base, row, keys) => {
    const diffs = {};
    for (const k of keys) {
      const d = pct(base[k], row[k]);
      diffs[k] = +(d * 100).toFixed(1);
      if (Math.abs(d) > TOL) errors.push(`${name}: ${k} fora de ±5% (${(d * 100).toFixed(1)}%)`);
    }
    report.push({ name, diffs });
  };
  const gpuKeys = ['geometries', 'textures', 'heapMB'];
  // Vazamento (estrito): o patamar pós-dispose não pode subir de uma volta ao menu para outra.
  check('Menu M5 vs M4 (pós-dispose)', m4, m5, ['geometries', 'textures', 'sceneObjects', 'heapMB']);
  check('Menu M5 vs M1 (objetos da cena, heap)', m1, m5, ['sceneObjects', 'heapMB']);
  // Mesma config (orc) e caches quentes: Reiniciar e Jogar novamente vs a P2.
  check('P3 vs P2 (20 s)', p2, p3, gpuKeys);
  check('P4 vs P2 (20 s)', p2, p4, gpuKeys);
  // Humano de novo vs a 1ª partida humana: heap aos 20 s; texturas vs o patamar quente (P2).
  check('P5 vs P1 (20 s, heap)', p1, p5, ['heapMB']);
  check('P5 vs P2 (20 s, texturas)', p2, p5, ['textures']);
  // Informativo (não reprova): a posição/quantidade de árvores e efeitos é aleatória por partida.
  const info = (name, a, b) => report.push({ name: `${name} [info]`, diffs: Object.fromEntries(
    ['geometries', 'sceneObjects', 'trees', 'fx'].map((k) => [k, +(pct(a[k], b[k]) * 100).toFixed(1)])) });
  info('P5 vs P1 início', p1s, p5s);
  info('P5 vs P1 20 s', p1, p5);
  // Geometrias da própria partida = em jogo − patamar do menu antes dela.
  report.push({ name: 'geometrias da partida (20 s − menu) [info]', diffs: {
    P1: p1.geometries - m1.geometries, P2: p2.geometries - m4.geometries, P3: p3.geometries - m4.geometries,
    P4: p4.geometries - m4.geometries, P5: p5.geometries - m4.geometries } });

  writeFileSync(`${OUT}/leak-report.json`, JSON.stringify({ gpu, rows, report, errors }, null, 2));
  console.log('\nDiferenças (%):');
  report.forEach((r) => console.log(`  ${r.name.padEnd(42)} ${JSON.stringify(r.diffs)}`));
  await ctx.close();
}

async function cleanup() {
  const b = browser;
  browser = null;
  if (b) await b.close().catch(() => {});
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { cleanup().finally(() => process.exit(130)); });
}

main()
  .catch((err) => { errors.push(`falha: ${err.message.split('\n')[0]}`); })
  .finally(async () => {
    await cleanup();
    if (errors.length) {
      console.error('\nFALHOU:');
      errors.forEach((e) => console.error(' - ' + e));
      process.exit(1);
    }
    console.log('\nOK: fluxo sem reload, sem erros de console e sem vazamento (±5%).');
  });
