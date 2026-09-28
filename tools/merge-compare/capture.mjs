// F1-02 — comparação com/sem mesclagem estática (?merge=0).
// Rodar sob tools/safe-run.sh com o vite já de pé:
//   bash tools/safe-run.sh --timeout 300 -- node tools/merge-compare/capture.mjs http://localhost:5182 [inspector|game|all]
// Saída: tools/merge-compare/<modo>-<merge>-<alvo>.png e results.json
import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5182', what = 'all'] = process.argv.slice(2);
const OUT = __dirname;

const GPU_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--js-flags=--max-old-space-size=2048'
];

const INSPECTOR_MODELS = [
  'castle', 'great_hall', 'farm', 'orc_forge', 'forge', 'barracks', 'cottage', 'lumber_camp',
  'watchtower', 'gold_mine', 'stone_quarry', 'bandit_camp', 'orc_barracks', 'pig_farm',
  'orc_house', 'orc_lumber_mill', 'orc_watchtower', 'berry_bush', 'boulder', 'mushroom_stump',
  'water_lily', 'flower_patch', 'grass_tuft'
];
const SHOTS = new Set(['castle', 'great_hall', 'farm', 'orc_forge', 'forge', 'orc_lumber_mill', 'orc_barracks', 'pig_farm', 'bandit_camp']);

function track(page, errors) {
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
}

async function inspector(browser, merge) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  track(page, errors);
  await page.goto(`${base}/inspector.html?texq=low&merge=${merge}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.inspectorApp, null, { timeout: 90000 });
  const rows = {};
  for (const id of INSPECTOR_MODELS) {
    await page.evaluate(id => window.inspectorApp.selectModel(id), id);
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const app = window.inspectorApp;
      const model = app.currentModelObject;
      const b = app.currentBuildingInstance;
      let meshes = 0, lights = 0, tris = 0;
      const mats = new Set();
      // Só a construção (sem anel de seleção/andaime/bandeira de rally)
      const target = b ? b.fullMesh : model;
      target.traverse(o => {
        if (o.isLight) lights++;
        if (!o.isMesh || !o.visible) return;
        meshes++;
        mats.add(o.material.uuid);
        const g = o.geometry;
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      });
      const vfx = {};
      if (b) {
        vfx.furnaceFlames = b.furnaceFlameMeshes ? b.furnaceFlameMeshes.length : undefined;
        vfx.anvilFlames = b.anvilFlameMeshes ? b.anvilFlameMeshes.length : undefined;
        vfx.banners = b.banners ? b.banners.length : undefined;
        vfx.bannersFromTemplate = b.banners ? b.banners.filter(x => x.name !== 'Anim_WarBanner_Procedural').length : undefined;
        vfx.dummyFromTemplate = b.trainingDummy ? b.trainingDummy.parent !== b.mesh : undefined;
        vfx.sawFromTemplate = b.sawBlade ? b.sawBlade.parent !== b.mesh : undefined;
        vfx.sawRotX = b.sawBlade ? +b.sawBlade.rotation.x.toFixed(3) : undefined;
        vfx.pigs = b.pigs ? b.pigs.length : undefined;
        vfx.furnaceLight = b.furnaceLight ? +b.furnaceLight.intensity.toFixed(3) : undefined;
      }
      return {
        components: Number(document.getElementById('stat-components').textContent),
        buildingMeshes: meshes, lights, materials: mats.size, tris: Math.round(tris),
        calls: app.renderer.info.render.calls, vfx
      };
    });
    if (SHOTS.has(id)) {
      await page.screenshot({ path: resolve(OUT, `inspector-${merge ? 'merge' : 'nomerge'}-${id}.png`) });
      // Segunda amostra para confirmar que a animação avançou (serra/chamas)
      await page.waitForTimeout(400);
      r.vfx2 = await page.evaluate(() => {
        const b = window.inspectorApp.currentBuildingInstance;
        return b ? {
          sawRotX: b.sawBlade ? +b.sawBlade.rotation.x.toFixed(3) : undefined,
          furnaceLight: b.furnaceLight ? +b.furnaceLight.intensity.toFixed(3) : undefined,
          flameScaleY: b.furnaceFlameMeshes?.[0] ? +b.furnaceFlameMeshes[0].scale.y.toFixed(3) : undefined
        } : null;
      });
    }
    rows[id] = r;
    console.log(`[inspector merge=${merge}] ${id}: ${JSON.stringify(r)}`);
  }
  await page.close();
  return { rows, errors };
}

async function sampleGame(page, ms) {
  return page.evaluate(async (ms) => {
    const sm = window.game.sceneManager;
    const r = sm.renderer;
    const shadowMap = r.shadowMap;
    let frames = 0, calls = 0, sCalls = 0, sFrames = 0;
    const origShadow = shadowMap.render;
    shadowMap.render = function (...a) {
      const c0 = r.info.render.calls;
      origShadow.apply(this, a);
      const dc = r.info.render.calls - c0;
      if (dc > 0) { sCalls += dc; sFrames++; }
    };
    const origRender = r.render;
    r.render = function (...a) { origRender.apply(this, a); frames++; calls += r.info.render.calls; };
    const t0 = performance.now();
    await new Promise(res => setTimeout(res, ms));
    const dt = performance.now() - t0;
    shadowMap.render = origShadow;
    r.render = origRender;
    let meshes = 0;
    sm.scene.traverse(o => { if (o.isMesh) meshes++; });
    const total = Math.round(calls / frames);
    const shadowAvg = Math.round(sCalls / frames);
    return {
      fps: +(frames * 1000 / dt).toFixed(1),
      callsPerFrame: total,
      shadowCallsPerFrame: shadowAvg,
      mainPassCallsPerFrame: total - shadowAvg,
      shadowCallsPerPass: sFrames ? Math.round(sCalls / sFrames) : 0,
      sceneMeshes: meshes,
      geometries: r.info.memory.geometries
    };
  }, ms);
}

async function game(browser, merge, faction) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  track(page, errors);
  const f = faction === 'orc' ? '&faction=orc' : '';
  await page.goto(`${base}/?skipPreload&texq=low&merge=${merge}${f}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && window.game.sceneManager, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: resolve(OUT, `game-${merge ? 'merge' : 'nomerge'}-${faction}.png`) });
  const s = await sampleGame(page, 4000);
  console.log(`[game merge=${merge} ${faction}] ${JSON.stringify(s)}`);
  await page.close();
  return { ...s, errors };
}

const resultsFile = resolve(OUT, 'results.json');
const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : {};
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
try {
  results.gpu = await (async () => {
    const p = await browser.newPage();
    await p.goto(`${base}/inspector.html?texq=low`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.inspectorApp, null, { timeout: 90000 });
    const g = await p.evaluate(() => {
      const gl = window.inspectorApp.renderer.getContext();
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '';
    });
    await p.close();
    return g;
  })();
  if (what === 'all' || what === 'inspector') {
    results.inspector = { merge: await inspector(browser, 1), nomerge: await inspector(browser, 0) };
  }
  if (what === 'all' || what === 'game') {
    results.game = {
      merge: { human: await game(browser, 1, 'human'), orc: await game(browser, 1, 'orc') },
      nomerge: { human: await game(browser, 0, 'human'), orc: await game(browser, 0, 'orc') }
    };
  }
} finally {
  await browser.close().catch(() => {});
}
fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
console.log(`salvo em ${resultsFile}`);
