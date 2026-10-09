// F8-03: capturas e checagem de UI do editor de mapas (editor.html). Rodar via safe-run:
//   bash tools/safe-run.sh --timeout 400 -- node tools/capture-editor.mjs
// Faz o fluxo real com o mouse (novo mapa → pintar rio/vau → bases/recursos/floresta/neutros → exportar → reimportar),
// confere que não houve erro de console e salva PNGs em tools/ui-captures/editor/.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5231);
const OUT = 'tools/ui-captures/editor';
mkdirSync(OUT, { recursive: true });
const TMP = process.env.EDITOR_TMP || '/tmp/claude-1000/warpoly-editor-capture';
mkdirSync(TMP, { recursive: true });

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const errors = [];
const fail = (m) => { throw new Error(m); };
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto('about:blank');
  await assertHardwareGpu(page);
  const base = `http://127.0.0.1:${PORT}`;
  await page.goto(`${base}/editor.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction('window.mapEditor');
  console.log('renderer ok; título:', await page.title());

  // --- novo mapa (UI) ---
  await page.click('#btn-new');
  await page.fill('#new-name', 'Rio de Teste');
  await page.selectOption('#new-size', '128');
  await page.selectOption('#new-fill', 'land');
  await page.click('#new-ok');
  await page.waitForTimeout(300);

  // helpers de mouse sobre o canvas 2D (mundo → tela)
  const toScreen = async (x, z) => page.evaluate(([x, z]) => {
    const e = window.mapEditor;
    const r = e.view.canvas.getBoundingClientRect();
    return [r.left + ((x + e.state.model.size / 2) / e.state.model.size) * r.width, r.top + ((z + e.state.model.size / 2) / e.state.model.size) * r.height];
  }, [x, z]);
  const tool = (id) => page.click(`#tools button[data-tool="${id}"]`);
  const clickAt = async (x, z, opts = {}) => { const [sx, sy] = await toScreen(x, z); await page.mouse.click(sx, sy, opts); };
  const dragAlong = async (pts) => {
    const [x0, y0] = await toScreen(...pts[0]);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (const p of pts.slice(1)) { const [sx, sy] = await toScreen(...p); await page.mouse.move(sx, sy, { steps: 6 }); }
    await page.mouse.up();
  };

  // rio sinuoso de norte a sul
  await tool('water');
  const river = [];
  for (let z = -62; z <= 62; z += 4) river.push([Math.sin(z * 0.08) * 8, z]);
  await dragAlong(river);
  // colinas
  await tool('raise');
  await dragAlong([[-45, 10], [-35, 18], [-28, 12]]);
  await dragAlong([[40, -10], [48, -18]]);
  // vau
  await tool('ford');
  await clickAt(Math.sin(0) * 8, 0);
  // bases, recursos, floresta, neutros
  await tool('start'); await clickAt(-40, -35); await clickAt(40, 35);
  await tool('gold'); await clickAt(-48, -46); await clickAt(48, 46);
  await tool('stone'); await clickAt(-30, -50);
  await tool('forest'); await clickAt(-30, 5); await clickAt(30, -5); await clickAt(-20, 40); await clickAt(20, -40);
  await tool('camp'); await clickAt(-25, 20); await clickAt(25, -20);
  await tool('critters'); await clickAt(-55, 20);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(900); // validação com debounce

  const stats = await page.evaluate(() => {
    const m = window.mapEditor.state.model;
    return { slots: m.startSlots.length, res: m.resources.length, forests: m.forests.length, neutrals: m.neutrals.length, fords: m.fords.length, canUndo: window.mapEditor.state.history.canUndo, issues: window.mapEditor.state.issues };
  });
  console.log('modelo:', JSON.stringify({ ...stats, issues: undefined }), 'erros:', stats.issues.errors.map((e) => e.code), 'avisos:', stats.issues.warnings.map((e) => e.code));
  if (stats.slots !== 2 || stats.res !== 3 || stats.forests !== 4 || stats.neutrals !== 3) fail('itens não foram colocados pelo mouse');
  await page.screenshot({ path: `${OUT}/1-editor-pt-BR.png` });

  // --- desfazer / refazer pela UI ---
  const before = await page.evaluate(() => window.mapEditor.state.model.neutrals.length);
  await page.click('#btn-undo');
  const undone = await page.evaluate(() => window.mapEditor.state.model.neutrals.length);
  await page.click('#btn-redo');
  const redone = await page.evaluate(() => window.mapEditor.state.model.neutrals.length);
  if (!(undone === before - 1 && redone === before)) fail(`undo/redo falhou ${before}/${undone}/${redone}`);

  // --- exportar (download real) ---
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const file = `${TMP}/${dl.suggestedFilename()}`;
  await dl.saveAs(file);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  console.log('exportado:', dl.suggestedFilename(), exported.terrain.generator, exported.startSlots.length, 'bases');

  // --- reimportar o arquivo e comparar (round-trip no navegador) ---
  await page.setInputFiles('#file-import', file);
  await page.waitForTimeout(400);
  const same = await page.evaluate(async (orig) => {
    const { exportMap } = await import('/src/editor/mapModel.js');
    return JSON.stringify(exportMap(window.mapEditor.state.model)) === JSON.stringify(orig);
  }, exported);
  if (!same) fail('round-trip no navegador diferente');
  console.log('round-trip no navegador: igual');

  // --- prévia 3D do jogo (tileset) ---
  await page.click('#pv-game');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/2-previa-jogo.png` });
  await page.click('#pv-light');

  // --- editar mapa do jogo ---
  await page.selectOption('#sel-game-map', 'continental-1v1');
  await page.waitForTimeout(1200);
  const gameId = await page.evaluate(() => window.mapEditor.state.model.id);
  console.log('mapa do jogo importado como:', gameId);
  await page.screenshot({ path: `${OUT}/3-mapa-do-jogo.png` });

  // --- erro de validação bloqueia exportação ---
  await page.evaluate(() => { window.mapEditor.state.model.id = 'continental-1v1'; });
  let gotDownload = false;
  const onDl = () => { gotDownload = true; };
  page.on('download', onDl);
  await page.click('#btn-export');
  await page.waitForTimeout(600);
  page.off('download', onDl);
  const blocked = !gotDownload;
  const codes = await page.evaluate(() => window.mapEditor.state.issues.errors.map((e) => e.code));
  console.log('com id repetido:', codes, 'bloqueado:', blocked && codes.includes('idTaken'));
  await page.screenshot({ path: `${OUT}/4-exportacao-bloqueada.png` });

  // --- salvar no navegador + lista ---
  await page.click('#btn-save');
  await page.click('#btn-saved');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-salvos.png` });
  await page.keyboard.press('Escape');

  // --- inglês ---
  await page.selectOption('#sel-lang', 'en');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/6-editor-en.png` });
  await page.selectOption('#sel-lang', 'pt-BR');

  // --- celular ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/7-editor-390x844.png`, fullPage: false });

  if (errors.length) fail(`erros de console:\n${errors.join('\n')}`);
  console.log('OK — sem erros de console');
} finally {
  if (browser) await browser.close();
  await vite.close();
}
