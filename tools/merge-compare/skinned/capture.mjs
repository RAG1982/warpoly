// F1-03b — comparação com/sem skinning rígido (?skin=0 volta à mescla por osso da F1-03).
// Rodar sob tools/safe-run.sh com o vite já de pé na porta da spec (5188):
//   bash tools/safe-run.sh --timeout 300 -- node tools/merge-compare/skinned/capture.mjs http://localhost:5188
// Saída: tools/merge-compare/skinned/<skin|noskin>-<id>-<pose>.png e results.json (draw calls por unidade)
import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5188'] = process.argv.slice(2);
const OUT = __dirname;

const GPU_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--js-flags=--max-old-space-size=2048'
];

// Todas as unidades procedurais do orçamento da spec (medidas na tabela).
const UNIT_IDS = ['knight', 'archer', 'villager', 'bandit', 'peon', 'grunt', 'axethrower', 'ogre'];

// Poses pedidas na verificação da spec F1-03b (nome do arquivo: <skin|noskin>-<id>-<pose>.png).
const POSES = [
  { id: 'knight', pose: 'fight', anim: 'fight', time: 0.5 },
  { id: 'archer', pose: 'fight-tensioned', anim: 'fight', time: 0.6 },
  { id: 'villager', pose: 'gather-wood', anim: 'gather', time: 0.5, cargo: 'wood', tool: 'axe' },
  { id: 'peon', pose: 'idle-face', anim: 'idle', time: 0 },
  { id: 'ogre', pose: 'hurt-flash', anim: 'hurt', time: 0.1 },
  { id: 'knight', pose: 'die', anim: 'die', time: 1.0 }
];

function track(page, errors) {
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
}

async function measureUnit(page, id, skin) {
  await page.goto(`${base}/inspector.html?texq=low&skin=${skin}&model=${id}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.inspectorApp, null, { timeout: 90000 });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const app = window.inspectorApp;
    const model = app.currentModelObject;
    let meshes = 0, materials = new Set(), tris = 0, skinnedMeshes = 0;
    model.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      meshes++;
      if (o.isSkinnedMesh) skinnedMeshes++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) materials.add(m.uuid);
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    return { meshes, skinnedMeshes, materials: materials.size, tris: Math.round(tris) };
  });
}

async function capturePose(page, spec, skin) {
  const { id, pose, anim, time, cargo, tool } = spec;
  await page.goto(`${base}/inspector.html?texq=low&skin=${skin}&model=${id}&anim=${anim}&time=${time}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.animator, null, { timeout: 90000 });
  if (cargo || tool) {
    await page.evaluate(({ cargo, tool }) => {
      const app = window.inspectorApp;
      if (tool) { app.villagerTool = tool; app.animator.setVillagerTool(tool); }
      if (cargo) { app.villagerCargo = cargo; app.animator.setVillagerCargo(cargo); }
    }, { cargo, tool });
  }
  await page.waitForTimeout(150);
  const file = resolve(OUT, `${skin ? 'skin' : 'noskin'}-${id}-${pose}.png`);
  await page.screenshot({ path: file });
  return file;
}

const resultsFile = resolve(OUT, 'results.json');
const results = { units: {} };
const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  track(page, errors);

  for (const id of UNIT_IDS) {
    const before = await measureUnit(page, id, 0);
    const after = await measureUnit(page, id, 1);
    results.units[id] = { skin0_f103: before, skin1_f103b: after };
    console.log(`[unit] ${id}: skin=0=${JSON.stringify(before)} skin=1=${JSON.stringify(after)}`);
  }

  for (const spec of POSES) {
    const noskin = await capturePose(page, spec, 0);
    const skin = await capturePose(page, spec, 1);
    console.log(`[pose] ${spec.id}/${spec.pose}: ${noskin} , ${skin}`);
  }

  await page.close();
} finally {
  await browser.close().catch(() => {});
}
results.errors = errors;
fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
console.log(`salvo em ${resultsFile}`);
if (errors.length) {
  console.error('Erros de console/página detectados:', errors);
  process.exit(1);
}
