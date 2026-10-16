// Conferência do critter_boar.glb (ART-04) no three.js real, com a luz/exposição/câmera do jogo.
//
//   bash tools/safe-run.sh --timeout 300 --mem 8G -- node tools/ui-captures/art-p0/critter-boar-check.mjs [game] [poses] [close]
//
// Sobe um servidor estático mínimo (a página `critter-boar-check.html` + node_modules/three + src + public/models),
// abre o Chromium com GPU real (assertHardwareGpu aborta em SwiftShader/llvmpipe), confere o contrato do modelo
// (11 nós, <= 6 malhas, 1 material, <= 4000 tris, textura <= 512², sem cor de vértice, patas em y = 0, tamanho) e grava,
// nesta pasta (código de saída 1 se algo falhar):
//   critter_boar_game.png   javali .glb (escala 1.4 do CritterView) ao lado do procedural, da ovelha e de um humano
//   critter_boar_poses.png  poses de teste dos pivôs (repouso, andar A/B, correr, pastar)
//   critter_boar_close.png  close-up 3/4
//   critter_boar_check.json hierarquia, caixa, malhas, triângulos, materiais, texturas, atributos, tamanhos em jogo,
//                           GPU e versão do Chromium usados
// Não passa pelo jogo nem pelo inspetor: o registro em glbModels.js/inspector.js é feito na integração.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { assertHardwareGpu, readWebGLRenderer } from '../../lib/assertGpu.mjs';

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

const REQUIRED_NODES = ['CritterBoar', 'Body', 'Head', 'Snout', 'Tusk_L', 'Tusk_R', 'Leg_FL', 'Leg_FR', 'Leg_BL', 'Leg_BR', 'Tail'];

/** Contrato e orçamento da tarefa sobre o relatório da página; devolve a lista de problemas (vazia = passou). */
function verify(info) {
  const problems = [];
  const names = new Set(info.tree.map(n => n.name));
  for (const n of REQUIRED_NODES) if (!names.has(n)) problems.push(`nó ausente: ${n}`);
  if (info.meshes > 6) problems.push(`${info.meshes} malhas (> 6 draw calls)`);
  if (info.materials !== 1) problems.push(`${info.materials} materiais (esperado 1: Atlas)`);
  if (info.tris > 4000) problems.push(`${info.tris} triângulos (> 4000)`);
  if (info.textures.some(t => t.split('x').some(v => Number(v) > 512))) problems.push(`textura > 512²: ${info.textures}`);
  if (info.attributes.some(a => a.startsWith('color'))) problems.push('cor de vértice');
  const [w, h, l] = info.bbox.size;
  if (Math.abs(info.bbox.min[1]) > 0.005) problems.push(`patas fora do chão (y mín = ${info.bbox.min[1]})`);
  if (h < 0.55 || h > 0.65 || l < 1.1 || l > 1.4 || w > 0.5) problems.push(`tamanho fora do esperado (${w} × ${h} × ${l})`);
  return problems;
}

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
      // o Chromium devolve o nome da GPU com bytes UTF-8 lidos como Latin-1 (ex.: "Radeon™" vira lixo): só ASCII
      const renderer = (await readWebGLRenderer(page)).replace(/[^\x20-\x7e]+/g, '');
      report.meta = { gpu: renderer, chromium: browser.version() };
      console.log('GPU:', report.meta.gpu, '| Chromium', report.meta.chromium);
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
  const problems = MODES.flatMap(spec => verify(report[spec.split('?')[0]]).map(p => `${spec}: ${p}`));
  const first = report[MODES[0].split('?')[0]];
  console.log(problems.length
    ? `VERIFICACAO FALHOU: ${problems.join('; ')}`
    : `VERIFICACAO OK: ${first.meshes} malhas, ${first.materials} material, ${first.tris} tris, textura ${first.textures.join(',')}, atributos ${first.attributes.join('/')}, caixa ${first.bbox.size.join(' x ')}`);
  if (problems.length) process.exitCode = 1;
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
