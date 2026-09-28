// F1-03 — comparação com/sem mesclagem de unidades por osso (?merge=0).
// Rodar sob tools/safe-run.sh com o vite já de pé na porta da spec (5186):
//   bash tools/safe-run.sh --timeout 300 -- node tools/merge-compare/units/capture.mjs http://localhost:5186
// Saída: tools/merge-compare/units/<merge|nomerge>-<id>-<pose>.png e results.json (draw calls por unidade)
import fs from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5186'] = process.argv.slice(2);
const OUT = __dirname;

const GPU_ARGS = [
  '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
  '--disable-frame-rate-limit', '--disable-gpu-vsync',
  '--js-flags=--max-old-space-size=2048'
];

// Todas as unidades procedurais do orçamento da spec (medidas na tabela).
const UNIT_IDS = ['knight', 'archer', 'villager', 'bandit', 'peon', 'grunt', 'axethrower', 'ogre'];

// Poses com captura de tela (nome do arquivo: <merge>-<id>-<pose>.png).
const POSES = [
  { id: 'knight', pose: 'fight', anim: 'fight', time: 0.5 },
  { id: 'archer', pose: 'fight-tensioned', anim: 'fight', time: 0.6 },
  { id: 'villager', pose: 'gather-wood', anim: 'gather', time: 0.5, cargo: 'wood', tool: 'axe' },
  { id: 'grunt', pose: 'fight', anim: 'fight', time: 0.5 },
  { id: 'grunt', pose: 'hurt-flash', anim: 'hurt', time: 0.1 },
  { id: 'ogre', pose: 'fight', anim: 'fight', time: 0.5 },
  { id: 'ogre', pose: 'hurt-flash', anim: 'hurt', time: 0.1 },
  { id: 'peon', pose: 'idle-face', anim: 'idle', time: 0 }
];

function track(page, errors) {
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
}

async function measureUnit(page, id, merge) {
  await page.goto(`${base}/inspector.html?texq=low&merge=${merge}&model=${id}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.inspectorApp, null, { timeout: 90000 });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const app = window.inspectorApp;
    const model = app.currentModelObject;
    let meshes = 0, materials = new Set(), tris = 0;
    model.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      meshes++;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) materials.add(m.uuid);
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    return { meshes, materials: materials.size, tris: Math.round(tris) };
  });
}

async function capturePose(page, spec, merge) {
  const { id, pose, anim, time, cargo, tool } = spec;
  await page.goto(`${base}/inspector.html?texq=low&merge=${merge}&model=${id}&anim=${anim}&time=${time}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.inspectorApp && window.inspectorApp.animator, null, { timeout: 90000 });
  if (cargo || tool) {
    await page.evaluate(({ cargo, tool }) => {
      const app = window.inspectorApp;
      if (tool) { app.villagerTool = tool; app.animator.setVillagerTool(tool); }
      if (cargo) { app.villagerCargo = cargo; app.animator.setVillagerCargo(cargo); }
    }, { cargo, tool });
  }
  await page.waitForTimeout(150);
  const file = resolve(OUT, `${merge ? 'merge' : 'nomerge'}-${id}-${pose}.png`);
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
    results.units[id] = { antes: before, depois: after };
    console.log(`[unit] ${id}: antes=${JSON.stringify(before)} depois=${JSON.stringify(after)}`);
  }

  for (const spec of POSES) {
    const nomerge = await capturePose(page, spec, 0);
    const merge = await capturePose(page, spec, 1);
    console.log(`[pose] ${spec.id}/${spec.pose}: ${nomerge} , ${merge}`);
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
