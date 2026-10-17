#!/usr/bin/env node
/**
 * M1-01 — Verificação visual do Novo Mundo no jogo real (MUNDO-4/5/9, NEW-54, ART-P0).
 *
 *   bash tools/safe-run.sh --timeout 1500 -- node tools/ui-captures/novo-mundo/capture.mjs [fase ...]
 *
 * Fases (padrão = todas): menu | mapas | lava
 *   menu  : menu -> Campanha: seletor main x beta, tela de história (painéis, fallback de arte, Esc), rever história.
 *   mapas : os 6 mapas novos com `biomeGrid` (duelo-continental-1..3, ilha-unica-1..3): visão de cima, biomas em
 *           close, transições entre biomas, costa/água, minimapa, névoa, ovelha + javali, mina que desaba (NEW-54),
 *           props flutuantes (instâncias × altura do terreno), draw calls / FPS.
 *   lava  : a lava emissiva só existe nos mapas `pendentes/dois-continentes-*` (fora do registro); registra um deles em
 *           memória (rota do Vite) e fotografa.
 * GPU real obrigatória (assertHardwareGpu). 1920x1080, `?texq=low` (menu) e `?skipPreload&texq=low&play` (partidas). Sobe o próprio Vite (porta 5311,
 * `--strictPort`), UMA página por vez; browser e Vite fechados no `finally`.
 * Saída em tools/ui-captures/novo-mundo/: fichas JPEG (várias capturas por imagem) + resultado.json.
 * Variáveis: NM_PORT (porta), NM_ONLY_MAPS (lista separada por vírgula), CAPTURE_TMP (temporários).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '../../..');
const TMP = fs.mkdtempSync(path.join(process.env.CAPTURE_TMP || os.tmpdir(), 'novo-mundo-'));
const PORT = Number(process.env.NM_PORT || 5311);
const PHASES = process.argv.slice(2).length ? process.argv.slice(2) : ['menu', 'mapas', 'lava'];
const ALL_MAPS = ['duelo-continental-1', 'duelo-continental-2', 'duelo-continental-3', 'ilha-unica-1', 'ilha-unica-2', 'ilha-unica-3'];
const MAPS = process.env.NM_ONLY_MAPS ? process.env.NM_ONLY_MAPS.split(',') : ALL_MAPS;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const VIEWPORT = { width: 1920, height: 1080 };

const result = { when: new Date().toISOString(), viewport: VIEWPORT, renderer: null, phases: PHASES, menu: {}, maps: {}, lava: {}, checks: [], consoleErrors: [], files: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, extra = '') {
  result.checks.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`);
  return !!ok;
}

/** Monta uma ficha (JPEG) com várias capturas e rótulos; `panels`: { file, label, crop? }. */
function sheet(outName, panels, { cols = 2, panelW = 960, quality = 80 } = {}) {
  const out = path.join(OUT, outName);
  const spec = JSON.stringify({ out, cols, panelW, quality, panels });
  execFileSync('python3', ['-I', '-c', `
import sys, json
from PIL import Image, ImageDraw, ImageFont
s = json.loads(sys.argv[1])
try:
    font = ImageFont.load_default(size=16)
except Exception:
    font = ImageFont.load_default()
tiles = []
for p in s['panels']:
    im = Image.open(p['file']).convert('RGB')
    if p.get('crop'):
        im = im.crop(tuple(p['crop']))
    w = s['panelW']; h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    if p.get('label'):
        d = ImageDraw.Draw(im)
        tw = d.textlength(p['label'], font=font)
        d.rectangle([0, 0, tw + 12, 24], fill=(0, 0, 0))
        d.text((6, 3), p['label'], fill=(255, 255, 255), font=font)
    tiles.append(im)
cols = s['cols']; rows = (len(tiles) + cols - 1) // cols; gap = 4
cw = max(t.width for t in tiles); ch = max(t.height for t in tiles)
sh = Image.new('RGB', (cols * cw + (cols - 1) * gap, rows * ch + (rows - 1) * gap), (0, 0, 0))
for i, t in enumerate(tiles):
    sh.paste(t, ((i % cols) * (cw + gap), (i // cols) * (ch + gap)))
sh.save(s['out'], quality=s['quality'], optimize=True)
`, spec], { stdio: 'inherit' });
  result.files.push(path.basename(out));
  console.log('ficha:', path.relative(ROOT, out), `${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
}

let vite = null;
let browser = null;
let routeMaps = []; // mapas extras (pendentes) injetados em memória em `src/data/maps/index.js`

async function openPage(urlPath, { ready, extraMaps = [] } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  if (extraMaps.length) {
    // Registra mapas de `pendentes/` no registro do jogo SEM mexer no repositório: acrescenta ao fim do módulo servido.
    await page.route('**/src/data/maps/index.js*', async (route) => {
      const resp = await route.fetch();
      let body = await resp.text();
      for (const f of extraMaps) {
        const json = fs.readFileSync(path.join(ROOT, 'src/data/maps/pendentes', f), 'utf8');
        body += `\nregisterMap(${json});\n`;
      }
      await route.fulfill({ response: resp, body });
    });
  }
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}${urlPath}`, { waitUntil: 'load', timeout: 120000 });
  if (ready) await page.waitForFunction(ready, null, { timeout: 120000 });
  return { ctx, page, errors };
}

const GAME_READY = () => !!(window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0 && window.game.sceneManager);

async function shot(page, name, opts = {}) {
  const file = path.join(TMP, name);
  await page.screenshot({ path: file, ...opts });
  return file;
}

/** Canvas do WebGL sem HUD (re-renderiza e lê no mesmo quadro). */
async function grab(page, name) {
  const b64 = await page.evaluate(() => {
    const sm = window.game.sceneManager;
    sm.renderer.render(sm.scene, sm.camera);
    return sm.renderer.domElement.toDataURL('image/png').split(',')[1];
  });
  const file = path.join(TMP, name);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

async function cam(page, x, y, z, zoom, yaw = Math.PI / 4, wait = 1300) {
  await page.evaluate(([x, y, z, zoom, yaw]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = yaw;
  }, [x, y, z, zoom, yaw]);
  await page.waitForTimeout(wait);
}

/** Canvas "de cima" (câmera de produção trocada na hora de desenhar): +x à direita, -z para cima, mapa inteiro. */
async function grabTopDown(page, name, { fogOff = true } = {}) {
  const b64 = await page.evaluate(() => {
    const sm = window.game.sceneManager;
    const cam = sm.camera;
    const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone(), far: cam.far, fogFar: sm.scene.fog.far, fogNear: sm.scene.fog.near };
    const size = window.game.gameManager.terrain.mapDef.size;
    const h = (size * 0.5) / Math.tan((cam.fov * Math.PI) / 360) * 1.02;
    sm.scene.fog.near = 1e5; sm.scene.fog.far = 2e5;
    cam.far = 3000; cam.updateProjectionMatrix();
    cam.up.set(0, 0, -1);
    cam.position.set(0, h, 0.001);
    cam.lookAt(0, 0, 0);
    sm.renderer.render(sm.scene, cam);
    const data = sm.renderer.domElement.toDataURL('image/png').split(',')[1];
    cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.up.copy(saved.up); cam.far = saved.far; cam.updateProjectionMatrix();
    sm.scene.fog.near = saved.fogNear; sm.scene.fog.far = saved.fogFar;
    return data;
  });
  const file = path.join(TMP, name);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

/** Estatísticas de render/FPS no estado atual (rAF por `ms` ms). */
async function perf(page, ms = 4000) {
  return page.evaluate(async (ms) => {
    const info = window.game.sceneManager.renderer.info;
    const samples = [];
    let last = performance.now();
    const t0 = last;
    const calls = []; const tris = [];
    await new Promise((resolve) => {
      const tick = (t) => {
        samples.push(t - last); last = t;
        calls.push(info.render.calls); tris.push(info.render.triangles);
        if (t - t0 < ms) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    const s = samples.slice(5).sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    const p99 = s[Math.floor(s.length * 0.99)];
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return {
      fps: +(1000 / avg).toFixed(1), fpsP1: +(1000 / p99).toFixed(1), frames: s.length,
      drawCalls: Math.round(mean(calls.slice(5))), triangles: Math.round(mean(tris.slice(5))),
      geometries: info.memory.geometries, textures: info.memory.textures
    };
  }, ms);
}

/** Lê o `biomeGrid` e escolhe pontos de interesse (centro de cada bioma, fronteiras, costa). Roda na página. */
function pickSpots() {
  return import('/src/data/maps/biome.js').then(({ gridOfBiome }) => {
    const gm = window.game.gameManager;
    const def = gm.terrain.mapDef;
    const g = gridOfBiome(def.biomeGrid);
    const n = def.biomeGrid.nodes; const cell = def.biomeGrid.cell; const half = def.size / 2;
    const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : g[j * n + i]);
    const w = (i, j) => ({ x: +(i * cell - half).toFixed(1), z: +(j * cell - half).toFixed(1) });
    const NAMES = ['mar', 'areia', 'grama', 'savana', 'deserto', 'estepe', 'rocha', 'vulcânico', 'lava', 'neve', 'pântano', 'gelo', 'floresta'];
    const counts = {};
    for (let k = 0; k < g.length; k++) counts[g[k]] = (counts[g[k]] || 0) + 1;
    // profundidade (Chebyshev, máx 9) de cada célula dentro do próprio bioma
    const depth = (i, j, b) => { for (let r = 1; r <= 9; r++) { for (let a = -r; a <= r; a++) { if (at(i + a, j - r) !== b || at(i + a, j + r) !== b || at(i - r, j + a) !== b || at(i + r, j + a) !== b) return r - 1; } } return 9; };
    const centers = {};
    for (const b of Object.keys(counts).map(Number)) {
      if (b === 0) continue;
      let best = null;
      for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
        if (g[j * n + i] !== b) continue;
        const d = depth(i, j, b);
        // empate: mais perto do centro do mapa (mais fácil de achar nas capturas)
        const score = d * 1000 - Math.hypot(i - n / 2, j - n / 2);
        if (!best || score > best.score) best = { score, d, i, j };
      }
      if (best) centers[b] = { biome: b, name: NAMES[b], count: counts[b], depth: best.d, ...w(best.i, best.j) };
    }
    // fronteiras entre biomas terrestres (exclui mar 0 e areia 1): pares com mais células de contato
    const pairs = new Map();
    for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
      const a = g[j * n + i]; const b = g[j * n + i + 2];
      const c = g[(j + 2) * n + i];
      for (const o of [b, c]) {
        if (a === o || a < 2 || o < 2) continue;
        const key = a < o ? `${a}-${o}` : `${o}-${a}`;
        if (!pairs.has(key)) pairs.set(key, []);
        pairs.get(key).push([i, j]);
      }
    }
    const trans = [...pairs.entries()].map(([k, v]) => ({ k, count: v.length, cells: v })).sort((x, y) => y.count - x.count).slice(0, 3)
      .map((t) => { const m = t.cells[Math.floor(t.cells.length / 2)]; const [a, b] = t.k.split('-').map(Number); return { pair: `${NAMES[a]}/${NAMES[b]}`, contact: t.count, ...w(m[0], m[1]) }; });
    // costa: célula de areia (1) mais "central" na maior faixa, vizinha do mar
    let coast = null;
    for (let j = 3; j < n - 3; j++) for (let i = 3; i < n - 3; i++) {
      if (g[j * n + i] !== 1) continue;
      if (at(i + 2, j) !== 0 && at(i - 2, j) !== 0 && at(i, j + 2) !== 0 && at(i, j - 2) !== 0) continue;
      const land = [at(i + 4, j), at(i - 4, j), at(i, j + 4), at(i, j - 4)].filter((v) => v >= 2).length;
      const score = land * 100 - Math.hypot(i - n / 2, j - n / 2);
      if (land && (!coast || score > coast.score)) coast = { score, i, j };
    }
    return { counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [NAMES[k], v])), centers, transitions: trans, coast: coast ? w(coast.i, coast.j) : null, size: def.size, tileset: def.tileset };
  });
}

/** Instâncias (árvores, decoração) vs altura do terreno: procura props flutuando ou enterrados/na água. */
function propAudit() {
  const sm = window.game.sceneManager;
  const gm = window.game.gameManager;
  const terrain = gm.terrain;
  const water = window.game.water ? window.game.water.waterLevel : 0.5;
  const out = [];
  const m4 = { elements: null };
  const tmp = { x: 0, y: 0, z: 0 };
  sm.scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count) return;
    let floatN = 0; let sunkN = 0; let wetN = 0; let maxF = 0; let minS = 0; const n = o.count;
    const e = o.instanceMatrix.array;
    // posição de mundo = matrixWorld do mesh x matriz da instância (translação)
    const mw = o.matrixWorld.elements;
    const world = (ix, iy, iz) => ({
      x: mw[0] * ix + mw[4] * iy + mw[8] * iz + mw[12], y: mw[1] * ix + mw[5] * iy + mw[9] * iz + mw[13], z: mw[2] * ix + mw[6] * iy + mw[10] * iz + mw[14]
    });
    for (let k = 0; k < n; k++) {
      const p = world(e[k * 16 + 12], e[k * 16 + 13], e[k * 16 + 14]);
      const h = terrain.getHeight(p.x, p.z);
      const d = p.y - h;
      if (d > 0.9) { floatN++; if (d > maxF) maxF = d; }
      if (d < -0.9) { sunkN++; if (d < minS) minS = d; }
      if (h < water - 0.05) wetN++;
    }
    out.push({ name: o.name || (o.geometry && o.geometry.name) || o.uuid.slice(0, 6), n, floatN, maxFloat: +maxF.toFixed(2), sunkN, minSunk: +minS.toFixed(2), underwater: wetN });
  });
  return out;
}

try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  console.log('Vite na porta', PORT, '; temporários em', TMP);

  // =================================================================================================== MENU / HISTÓRIA
  if (PHASES.includes('menu')) {
    const { ctx, page, errors } = await openPage('/?texq=low', { ready: () => !!document.querySelector('#main-menu.mm-ready') });
    result.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/d'; });
    console.log('renderer:', result.renderer);
    await page.waitForTimeout(800);
    const m = result.menu;
    const f0 = await shot(page, 'menu-0-principal.png');
    await page.click('[data-action="campaign"]');
    await page.waitForSelector('.story-screen', { timeout: 15000 }).catch(() => {});
    m.storyOpenedOnFirstVisit = await page.evaluate(() => !!document.querySelector('.story-screen'));
    check('história abre sozinha na 1a visita à campanha principal', m.storyOpenedOnFirstVisit);

    const panels = [];
    const files = [];
    for (let step = 0; step < 12; step++) {
      if (!(await page.evaluate(() => !!document.querySelector('.story-screen')))) break;
      // espera a arte: imagem carregada OU 3 s (então é fallback)
      await page.waitForFunction(() => !!document.querySelector('.story-screen #story-art-container img.story-art'), null, { timeout: 3500 }).catch(() => {});
      await page.waitForTimeout(500);
      const st = await page.evaluate(() => {
        const root = document.querySelector('.story-screen');
        const img = root.querySelector('#story-art-container img.story-art');
        const fb = root.querySelector('#story-art-fallback');
        const dots = [...root.querySelectorAll('.story-dot')];
        return {
          dotActive: dots.findIndex((d) => d.classList.contains('is-active')), dots: dots.length,
          art: img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight, complete: img.complete } : null,
          fallbackVisible: !!fb && getComputedStyle(fb).display !== 'none',
          caption: (root.querySelector('.story-caption-text') || {}).textContent || null,
          title: (root.querySelector('.story-main-title') || {}).textContent || null
        };
      });
      st.step = step;
      panels.push(st);
      files.push({ file: await shot(page, `hist-${step}.png`), label: `painel ${step}: ${st.title || (st.caption || '').slice(0, 70)} | ${st.art ? st.art.src.split('/').slice(-2).join('/') : 'FALLBACK'}` });
      await page.keyboard.press('ArrowRight');
    }
    m.panels = panels;
    const narrative = panels.filter((p) => !p.title);
    check('7 painéis narrativos visitados', narrative.length === 7, `narrativos=${narrative.length}, total=${panels.length}`);
    check('nenhum painel caiu no fallback de imagem', panels.every((p) => p.art && p.art.w > 0 && !p.fallbackVisible), panels.map((p) => (p.art ? `${p.art.w}x${p.art.h}` : 'FALLBACK')).join(' '));
    check('história terminou sozinha após o último painel (sem travar)', !(await page.evaluate(() => !!document.querySelector('.story-screen'))));
    sheet('historia-painel-a-painel.jpg', files, { cols: 3, panelW: 640 });

    // tela de campanha: abas main x beta
    const f1 = await shot(page, 'camp-0-main.png');
    m.tabs = await page.evaluate(() => [...document.querySelectorAll('.ms-brief-camp-tab')].map((b) => ({ text: b.textContent.trim(), selected: b.getAttribute('aria-selected') })));
    check('seletor main x beta presente (2+ abas)', m.tabs.length >= 2, JSON.stringify(m.tabs));
    const tabFiles = [{ file: f0, label: 'menu principal' }, { file: f1, label: `campanha: aba "${(m.tabs[0] || {}).text}"` }];
    for (let t = 1; t < m.tabs.length; t++) {
      await page.locator('.ms-brief-camp-tab').nth(t).click();
      await page.waitForTimeout(500);
      tabFiles.push({ file: await shot(page, `camp-${t}.png`), label: `campanha: aba "${m.tabs[t].text}"` });
      m[`tab${t}`] = await page.evaluate(() => ({ hasReviewStory: !!document.querySelector('[data-cp="reviewStory"]'), items: document.querySelectorAll('.ms-brief-item').length, provisional: !!document.querySelector('.ms-badge-prov') }));
    }
    const betaIdx = m.tabs.findIndex((tb) => /beta/i.test(tb.text));
    check('aba beta (Campanha Clássica) não mostra "Rever história"', betaIdx > 0 && !m[`tab${betaIdx}`].hasReviewStory, JSON.stringify(m[`tab${betaIdx}`]));
    check('abas main (Aliança/Horda) mostram "Rever história"', m.tab1 && m.tab1.hasReviewStory, JSON.stringify(m.tab1));
    await page.locator('.ms-brief-camp-tab').nth(0).click();
    await page.waitForTimeout(400);
    // rever história e sair com Esc
    await page.click('[data-cp="reviewStory"]');
    await page.waitForSelector('.story-screen', { timeout: 5000 }).catch(() => {});
    const reopened = await page.evaluate(() => !!document.querySelector('.story-screen'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ story: !!document.querySelector('.story-screen'), campaign: !!document.querySelector('.ms-brief'), mainMenu: !!document.querySelector('#main-menu'), inGame: !!(window.game && window.game.gameManager && window.game.gameManager.buildings.length) }));
    m.esc = { reopened, after };
    check('"Rever história" reabre e Esc volta à lista de campanha (sem iniciar partida)', reopened && !after.story && after.campaign && !after.inGame, JSON.stringify(after));
    sheet('campanha-menu-abas.jpg', tabFiles, { cols: 2, panelW: 960 });

    // mapa-mundi (MUNDO-9): o componente ainda tem tela?
    m.worldMapInDom = await page.evaluate(() => !!document.querySelector('.world-map, #world-map, [class*="worldmap"]'));
    console.log(`INFO  MUNDO-9: mapa-múndi montado em alguma tela do fluxo de campanha = ${m.worldMapInDom} (pendência conhecida: worldMap.js só é importado por testes)`);
    result.consoleErrors.push(...errors.map((e) => `menu: ${e}`));
    await ctx.close();

    // 1a visita (contexto novo, sem progresso gravado): Esc na história pula só a história e fica na lista da campanha
    {
      const o = await openPage('/?texq=low', { ready: () => !!document.querySelector('#main-menu.mm-ready') });
      await o.page.waitForTimeout(600);
      await o.page.click('[data-action="campaign"]');
      await o.page.waitForSelector('.story-screen', { timeout: 15000 }).catch(() => {});
      await o.page.waitForTimeout(800);
      await o.page.keyboard.press('Escape');
      await o.page.waitForTimeout(600);
      m.escFirstVisit = await o.page.evaluate(() => ({ story: !!document.querySelector('.story-screen'), campaign: !!document.querySelector('.ms-brief') }));
      check('1a visita: Esc na história pula a história e deixa a lista da campanha aberta', !m.escFirstVisit.story && m.escFirstVisit.campaign, JSON.stringify(m.escFirstVisit));
      result.consoleErrors.push(...o.errors.map((e) => `menu(1a visita): ${e}`));
      await o.ctx.close();
    }
  }

  // =================================================================================================== MAPAS
  if (PHASES.includes('mapas')) {
    for (const mapId of MAPS) {
      console.log(`\n=== ${mapId}`);
      const { ctx, page, errors } = await openPage(`/?skipPreload&texq=low&play&map=${mapId}&faction=human`, { ready: GAME_READY });
      await page.waitForTimeout(2500);
      const M = (result.maps[mapId] = { errors: [] });
      try {
        M.start = await page.evaluate(() => {
          const gm = window.game.gameManager;
          const def = gm.terrain.mapDef;
          const me = gm.players.find((p) => !p.isAI) || gm.players[0];
          const hq = gm.buildings.find((b) => b.ownerId === me.id && /hq|townhall|castle/i.test(b.type || b.typeId || ''));
          return { mapId: gm.matchConfig.mapId, tileset: def.tileset, size: def.size, hasBiomeGrid: !!def.biomeGrid, regions: !!(window.game.terrainView && window.game.terrainView.regions), styles: window.game.terrainView && window.game.terrainView.regions ? window.game.terrainView.regions.styles.map((s) => s.key) : null, hq: hq ? { x: hq.mesh.position.x, z: hq.mesh.position.z } : null };
        });
        check(`${mapId}: partida carregou o mapa certo e o render é regional`, M.start.mapId === mapId && M.start.hasBiomeGrid && M.start.regions, JSON.stringify({ styles: M.start.styles }));

        // (1) início como o jogador vê (névoa ligada, HUD, minimapa)
        const fInicio = await shot(page, 'inicio.png');
        const fMini = await shot(page, 'mini-nevoa.png', { clip: await page.evaluate(() => { const r = document.querySelector('#minimap-canvas').getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) }; }) }).catch(() => null);
        M.perfStart = await perf(page, 4000);
        console.log('perf (início, névoa ligada):', JSON.stringify(M.perfStart));

        // (2) névoa desligada + visão de cima do mapa todo
        await page.evaluate(() => window.game.gameManager.fogOfWar.setEnabled(false));
        await page.waitForTimeout(1200);
        const spots = (M.spots = await page.evaluate(pickSpots));
        console.log('biomas:', JSON.stringify(spots.counts), '| transições:', spots.transitions.map((t) => t.pair).join(', '));
        const fTop = await grabTopDown(page, 'topo.png');
        const fMini2 = await shot(page, 'mini-aberto.png', { clip: await page.evaluate(() => { const r = document.querySelector('#minimap-canvas').getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) }; }) }).catch(() => null);
        // câmera padrão de jogo, afastada, no centro do mapa e na base do jogador
        const hq = M.start.hq || { x: 0, z: 0 };
        await cam(page, hq.x, 0, hq.z, 1.0, Math.PI / 4, 1500);
        const fBase = await grab(page, 'base.png');
        await cam(page, 0, 0, 0, 1.8, Math.PI / 4, 1800);
        const fWide = await grab(page, 'amplo.png');
        sheet(`${mapId}-1-visao.jpg`, [
          { file: fTop, label: `${mapId}: visão de cima (névoa off)`, crop: [420, 0, 1500, 1080] },
          { file: fInicio, label: 'início do jogador (névoa on, HUD)' },
          { file: fBase, label: 'base do jogador (zoom 1.0)' },
          { file: fWide, label: 'afastado (zoom 1.8), centro' }
        ], { cols: 2, panelW: 960 });
        if (fMini && fMini2) {
          sheet(`${mapId}-2-minimapa.jpg`, [{ file: fMini, label: 'minimapa com névoa' }, { file: fMini2, label: 'minimapa sem névoa' }], { cols: 2, panelW: 400 });
        }

        // (3) cada bioma em close
        const biomeFiles = [];
        for (const c of Object.values(spots.centers).filter((c) => c.biome !== 1)) {
          await cam(page, c.x, 0, c.z, 0.62, Math.PI / 4, 1100);
          biomeFiles.push({ file: await grab(page, `bioma-${c.biome}.png`), label: `${c.name} (${c.x}, ${c.z}) profundidade ${c.depth}, ${c.count} células` });
        }
        sheet(`${mapId}-3-biomas.jpg`, biomeFiles, { cols: 2, panelW: 960 });

        // (4) transições e costa
        const trFiles = [];
        for (const t of spots.transitions.slice(0, 3)) {
          await cam(page, t.x, 0, t.z, 0.55, Math.PI / 4, 1000);
          trFiles.push({ file: await grab(page, `trans-${trFiles.length}.png`), label: `fronteira ${t.pair} (${t.x}, ${t.z}) contato ${t.contact}` });
        }
        if (spots.coast) {
          await cam(page, spots.coast.x, 0, spots.coast.z, 0.6, Math.PI / 4, 1100);
          trFiles.push({ file: await grab(page, 'costa.png'), label: `costa/água (${spots.coast.x}, ${spots.coast.z})` });
          await cam(page, spots.coast.x, 0, spots.coast.z, 0.6, Math.PI * 0.75, 900);
          trFiles.push({ file: await grab(page, 'costa2.png'), label: 'costa, câmera girada 90 graus' });
        }
        sheet(`${mapId}-4-transicoes-e-costa.jpg`, trFiles, { cols: 2, panelW: 960 });

        // (5) props flutuando / enterrados
        M.props = await page.evaluate(propAudit);
        const bad = M.props.filter((p) => p.floatN > 0 || p.sunkN > 0);
        console.log('props:', M.props.map((p) => `${p.name}:${p.n}`).join(' '), '| ruins:', JSON.stringify(bad));
        M.scene = await page.evaluate(() => {
          const sm = window.game.sceneManager; const gm = window.game.gameManager;
          return { trees: gm.trees ? gm.trees.length : null, deposits: gm.resourceDeposits.length, critters: gm.critters.length };
        });
        check(`${mapId}: props (instâncias) a no máximo 0,9 u de altura do terreno`, bad.every((p) => p.floatN === 0), JSON.stringify(bad.map((p) => [p.name, p.floatN, p.maxFloat])));
        check(`${mapId}: props (instâncias) não afundados > 0,9 u`, bad.every((p) => p.sunkN === 0), JSON.stringify(bad.map((p) => [p.name, p.sunkN, p.minSunk])));
        const wet = M.props.filter((p) => p.underwater > 0);
        check(`${mapId}: nenhuma árvore/decoração debaixo d'água`, wet.length === 0, JSON.stringify(wet.map((p) => [p.name, p.underwater])));

        // (6) ovelha (do mapa) + javali (inserido) em campo
        const critterInfo = await page.evaluate(async () => {
          const gm = window.game.gameManager;
          const { Critter } = await import('/src/sim/Critter.js');
          const { NEUTRAL_OWNER_ID } = await import('/src/sim/EntityIds.js');
          const sheep = gm.critters.filter((c) => c.species === 'sheep' || /sheep/.test(c.kind || ''));
          const ref = sheep[0] || gm.critters[0];
          const bx = ref ? ref.mesh.position.x : 0; const bz = ref ? ref.mesh.position.z : 0;
          const rng = gm.rng.fork('m1-01-boars');
          for (let i = 0; i < 3; i++) {
            const x = bx + 3 + i * 1.6; const z = bz + 2 + (i % 2) * 1.5;
            const c = new Critter(gm, 'boar', x, z, rng.fork(`b${i}`), 4);
            gm.registerEntity(c, NEUTRAL_OWNER_ID);
            gm.critters.push(c);
          }
          return { ref: ref ? { x: bx, z: bz, species: ref.species } : null, total: gm.critters.length };
        });
        M.critters = critterInfo;
        const critFiles = [];
        if (critterInfo.ref) {
          await cam(page, critterInfo.ref.x + 3, 0, critterInfo.ref.z + 2, 0.5, Math.PI / 4, 2200);
          critFiles.push({ file: await grab(page, 'crit-0.png'), label: 'ovelha(s) + 3 javalis' });
          await cam(page, critterInfo.ref.x + 3, 0, critterInfo.ref.z + 2, 0.5, Math.PI / 4, 2500);
          critFiles.push({ file: await grab(page, 'crit-1.png'), label: '+2,5 s (andando)' });
          M.critterY = await page.evaluate(() => {
            const gm = window.game.gameManager;
            return gm.critters.map((c) => ({ sp: c.species, y: +c.mesh.position.y.toFixed(2), h: +gm.terrain.getHeight(c.mesh.position.x, c.mesh.position.z).toFixed(2), root: (() => { const r = gm.entityViews && gm.entityViews.rootOf ? gm.entityViews.rootOf(c) : null; return r ? +r.position.y.toFixed(2) : null; })() }));
          });
          const off = M.critterY.filter((c) => Math.abs((c.root ?? c.y) - c.h) > 0.8);
          check(`${mapId}: critters pousados no terreno (|y - altura| <= 0,8)`, off.length === 0, JSON.stringify(off));
          sheet(`${mapId}-5-critters.jpg`, critFiles, { cols: 2, panelW: 960 });
        }

        // (7) mina que desaba (NEW-54): só no 1o mapa de cada família, para poupar tempo
        if (mapId === 'duelo-continental-1' || mapId === 'ilha-unica-1') {
          const mine = await page.evaluate(() => {
            const gm = window.game.gameManager;
            const me = gm.players.find((p) => !p.isAI) || gm.players[0];
            const hq = gm.buildings.find((b) => b.ownerId === me.id);
            const deps = gm.resourceDeposits.filter((d) => d.type === 'gold');
            deps.sort((a, b) => Math.hypot(a.mesh.position.x - hq.mesh.position.x, a.mesh.position.z - hq.mesh.position.z) - Math.hypot(b.mesh.position.x - hq.mesh.position.x, b.mesh.position.z - hq.mesh.position.z));
            const d = deps[0];
            window.__mine54 = { dep: d, depleted: 0 };
            import('/src/sim/events.js').then(({ EVT }) => gm.events.on(EVT.RESOURCE_DEPLETED, () => { window.__mine54.depleted++; }, true));
            return { x: d.mesh.position.x, z: d.mesh.position.z, before: gm.resourceDeposits.length, ruins: window.game.session.ruins ? window.game.session.ruins.slots.filter((s) => s.state !== 'free').length : null };
          });
          await cam(page, mine.x, 0, mine.z, 0.5, Math.PI / 4, 1500);
          const mFiles = [{ file: await grab(page, 'mina-0.png'), label: 'mina de ouro intacta' }];
          await page.evaluate(() => { window.__mine54.dep.resourcesRemaining = 0; window.__mine54.dep.isDead = true; });
          await page.waitForTimeout(450);
          mFiles.push({ file: await grab(page, 'mina-1.png'), label: 'logo após esgotar (+0,45 s)' });
          await page.waitForTimeout(1400);
          mFiles.push({ file: await grab(page, 'mina-2.png'), label: '+1,9 s' });
          await page.waitForTimeout(3500);
          mFiles.push({ file: await grab(page, 'mina-3.png'), label: '+5,4 s (ruína)' });
          const after = await page.evaluate(() => {
            const gm = window.game.gameManager;
            return { deposits: gm.resourceDeposits.length, depleted: window.__mine54.depleted, disposed: !!window.__mine54.dep.isDisposed, ruins: window.game.session.ruins ? window.game.session.ruins.slots.filter((s) => s.state !== 'free').length : null };
          });
          M.mine = { ...mine, after };
          check(`${mapId}: mina esgotada some da simulação e deixa ruína`, after.deposits === mine.before - 1 && after.depleted === 1 && after.disposed && (after.ruins === null || after.ruins > (mine.ruins || 0)), JSON.stringify({ antes: mine.before, depois: after }));
          sheet(`${mapId}-6-mina-desaba.jpg`, mFiles, { cols: 2, panelW: 960 });
        }

        // (8) desempenho nas duas câmeras (névoa ligada, como o jogador): base e panorama
        await page.evaluate(() => window.game.gameManager.fogOfWar.setEnabled(true));
        await cam(page, hq.x, 0, hq.z, 1.0, Math.PI / 4, 1500);
        M.perfBase = await perf(page, 3500);
        await cam(page, 0, 0, 0, 1.8, Math.PI / 4, 1500);
        M.perfWide = await perf(page, 3500);
        console.log('perf base:', JSON.stringify(M.perfBase), '\nperf amplo:', JSON.stringify(M.perfWide));
      } catch (e) {
        M.errors.push(String(e && e.stack || e));
        console.log('ERRO no mapa', mapId, e);
        check(`${mapId}: captura completa sem exceção`, false, String(e.message || e));
      }
      M.consoleErrors = errors;
      check(`${mapId}: 0 erros de console/página/rede`, errors.length === 0, errors.slice(0, 3).join(' | '));
      result.consoleErrors.push(...errors.map((e) => `${mapId}: ${e}`));
      await ctx.close();
      await sleep(500);
    }
  }

  // =================================================================================================== LAVA (pendentes)
  if (PHASES.includes('lava')) {
    const extra = 'dois-continentes-1.json';
    const id = 'dois-continentes-1';
    console.log(`\n=== lava em ${id} (mapa de pendentes/, registrado em memória)`);
    const { ctx, page, errors } = await openPage(`/?skipPreload&texq=low&play&map=${id}&faction=human`, { ready: GAME_READY, extraMaps: [extra] });
    const L = result.lava;
    try {
      await page.waitForTimeout(2500);
      L.start = await page.evaluate(() => { const gm = window.game.gameManager; return { mapId: gm.matchConfig.mapId, lavaGrid: !!gm.terrain.mapDef.lavaGrid, biomeGrid: !!gm.terrain.mapDef.biomeGrid, lavaObj: !!window.game.lava || !!(window.game.session && window.game.session.lava) }; });
      check('mapa com lava carregou (id certo, lavaGrid)', L.start.mapId === id && L.start.lavaGrid, JSON.stringify(L.start));
      await page.evaluate(() => window.game.gameManager.fogOfWar.setEnabled(false));
      await page.waitForTimeout(800);
      const spot = await page.evaluate(() => import('/src/data/maps/lava.js').then((lv) => {
        const gm = window.game.gameManager; const def = gm.terrain.mapDef; const half = def.size / 2;
        let best = null; let count = 0;
        for (let z = -half; z <= half; z += 1) for (let x = -half; x <= half; x += 1) {
          if (!lv.isLavaAt(def, x, z)) continue;
          count++;
          let d = 9; for (let r = 1; r <= 9 && d === 9; r++) for (let a = -r; a <= r; a += 2) if (!lv.isLavaAt(def, x + a, z - r) || !lv.isLavaAt(def, x + a, z + r) || !lv.isLavaAt(def, x - r, z + a) || !lv.isLavaAt(def, x + r, z + a)) { d = r - 1; break; }
          const sc = d * 1000 - Math.hypot(x, z);
          if (!best || sc > best.sc) best = { sc, x, z, d };
        }
        return { cells: count, ...best };
      }));
      L.spot = spot;
      console.log('lava:', JSON.stringify(spot));
      const lf = [];
      lf.push({ file: await grabTopDown(page, 'lava-topo.png'), label: `${id}: visão de cima`, crop: [420, 0, 1500, 1080] });
      await cam(page, spot.x, 0, spot.z, 0.6, Math.PI / 4, 1500);
      lf.push({ file: await grab(page, 'lava-0.png'), label: `lava (${spot.x}, ${spot.z}) profundidade ${spot.d}` });
      await cam(page, spot.x, 0, spot.z, 0.6, Math.PI / 4, 1000);
      lf.push({ file: await grab(page, 'lava-1.png'), label: '+1 s (animação/brilho)' });
      await cam(page, spot.x + spot.d, 0, spot.z, 0.45, Math.PI * 0.75, 1200);
      lf.push({ file: await grab(page, 'lava-2.png'), label: 'borda da lava, câmera girada' });
      // brilho: razão laranja/vermelho do canal R em pixels laranja (emissivo = fica vivo mesmo à sombra); luminância média da lava
      L.glow = await page.evaluate(() => {
        const c = document.createElement('canvas'); const src = window.game.sceneManager.renderer.domElement;
        const sm = window.game.sceneManager; sm.renderer.render(sm.scene, sm.camera);
        c.width = src.width; c.height = src.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let hot = 0; let n = 0; let maxLum = 0;
        for (let i = 0; i < d.length; i += 16) { const r = d[i], gg = d[i + 1], b = d[i + 2]; n++; if (r > 200 && gg > 70 && gg < 190 && b < 90) hot++; maxLum = Math.max(maxLum, 0.3 * r + 0.6 * gg + 0.1 * b); }
        return { hotFraction: +(hot / n).toFixed(3), maxLum };
      });
      check('lava tem pixels laranja vivos no quadro (emissiva)', L.glow.hotFraction > 0.01, JSON.stringify(L.glow));
      sheet('lava-dois-continentes-1.jpg', lf, { cols: 2, panelW: 960 });
      L.perf = await perf(page, 3500);
      console.log('perf lava:', JSON.stringify(L.perf));
    } catch (e) {
      L.error = String(e && e.stack || e);
      console.log('ERRO na lava', e);
      check('lava: captura completa sem exceção', false, String(e.message || e));
    }
    check('lava: 0 erros de console/página/rede', errors.length === 0, errors.slice(0, 3).join(' | '));
    result.consoleErrors.push(...errors.map((e) => `lava: ${e}`));
    await ctx.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
  result.consoleErrorCount = result.consoleErrors.length;
  fs.writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(result, null, 2) + '\n');
  const failed = result.checks.filter((c) => !c.ok);
  console.log(`\nM1-01: ${result.checks.length - failed.length}/${result.checks.length} verificações OK; erros de console: ${result.consoleErrors.length}`);
  if (failed.length) console.log('FALHAS:\n - ' + failed.map((c) => `${c.name} ${c.extra}`).join('\n - '));
  console.log('temporários (capturas inteiras) em', TMP);
  process.exitCode = failed.length ? 1 : 0;
}
