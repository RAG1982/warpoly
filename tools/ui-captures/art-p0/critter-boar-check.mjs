// Conferência do critter_boar.glb (ART-04) no three.js real, com a luz/exposição/câmera do jogo.
//
//   bash tools/safe-run.sh --timeout 300 --mem 8G -- node tools/ui-captures/art-p0/critter-boar-check.mjs [game] [poses] [close]
//
// Sobe um servidor estático mínimo (a página `critter-boar-check.html` + node_modules/three + src + public/models),
// abre o Chromium com GPU real (assertHardwareGpu aborta em SwiftShader/llvmpipe) e grava, nesta pasta:
//   critter_boar_game.png   javali .glb (escala 1.4 do CritterView) ao lado do procedural, da ovelha e de um humano
//   critter_boar_poses.png  poses de teste dos pivôs (repouso, andar A/B, correr, pastar)
//   critter_boar_close.png  close-up 3/4
//   critter_boar_check.json hierarquia, caixa, malhas, triângulos, materiais, texturas, atributos e tamanhos em jogo
// Não passa pelo jogo nem pelo inspetor: o registro em glbModels.js/inspector.js é feito na integração.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const MODES = process.argv.slice(2).length ? process.argv.slice(2) : ['game', 'poses', 'close'];

// viewport e fator de escala por modo (as poses saem em 2x para ver as patas)
const VIEWPORT = { game: { width: 1280, height: 720 }, poses: { width: 1280, height: 320 }, close: { width: 960, height: 640 } };
const SCALE = { game: 1, poses: 2, close: 1 };
const MIME = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.html': 'text/html', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png' };
const ROOTS = [
  ['/three/', path.join(REPO, 'node_modules', 'three') + path.sep],
  ['/src/', path.join(REPO, 'src') + path.sep],
  ['/models/', path.join(REPO, 'public', 'models') + path.sep],
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = null;
  if (url.pathname === '/') file = path.join(HERE, 'critter-boar-check.html');
  else {
    for (const [prefix, dir] of ROOTS) {
      if (!url.pathname.startsWith(prefix)) continue;
      const candidate = path.join(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
      if (candidate.startsWith(dir)) file = candidate; // sem sair da raiz mapeada
      break;
    }
  }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];
const browser = await chromium.launch({ headless: true, args: ARGS });
const report = {};
try {
  const errors = [];
  const newPage = async mode => {
    const ctx = await browser.newContext({ viewport: VIEWPORT[mode] || VIEWPORT.game, deviceScaleFactor: SCALE[mode] || 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    return pg;
  };
  let gpuChecked = false;
  for (const spec of MODES) {
    const [mode, query = ''] = spec.split('?');
    const page = await newPage(mode);
    if (!gpuChecked) {
      await assertHardwareGpu(page);
      gpuChecked = true;
    }
    await page.goto(`http://127.0.0.1:${port}/?mode=${mode}${query ? `&${query}` : ''}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    report[mode] = await page.evaluate(() => window.__info);
    await page.screenshot({ path: path.join(HERE, `critter_boar_${mode}.png`) });
    await page.context().close();
    console.log(mode, JSON.stringify({ meshes: report[mode].meshes, tris: report[mode].tris, materials: report[mode].materials, textures: report[mode].textures, attributes: report[mode].attributes, bbox: report[mode].bbox.size, sizes_in_game: report[mode].sizes_in_game }));
  }
  // junta com o relatório anterior: rodar só um modo não apaga os outros
  const jsonPath = path.join(HERE, 'critter_boar_check.json');
  const previous = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : {};
  fs.writeFileSync(jsonPath, JSON.stringify({ ...previous, ...report }, null, 1) + '\n');
  if (errors.length) {
    console.log('ERROS NA PÁGINA:', JSON.stringify(errors.slice(0, 10)));
    process.exitCode = 1;
  }
} finally {
  await browser.close().catch(() => {});
  server.close();
}
