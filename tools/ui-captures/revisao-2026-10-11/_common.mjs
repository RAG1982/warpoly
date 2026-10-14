/**
 * Revisão visual de 2026-10-11 (NEW-13/19/24/26/35/49/52) — utilitários comuns dos cenários de captura.
 * GPU real obrigatória (assertHardwareGpu). Rode cada cenário SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/<item>.mjs
 * Cada cenário sobe o Vite numa porta própria, abre UMA página (jogo `?skipPreload&texq=low&play` ou inspetor), mede,
 * grava até 2 PNGs reduzidos + um JSON de medidas ao lado e encerra o navegador e o Vite no `finally`.
 * Variáveis: CAPTURE_TMP (pasta de temporários; use o scratchpad), NO_SHRINK=1 (não quantiza os PNGs).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

export const OUT = path.dirname(fileURLToPath(import.meta.url));
export const TMP = fs.mkdtempSync(path.join(process.env.CAPTURE_TMP || os.tmpdir(), 'revisao-'));
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const written = [];
export const checks = [];
/** Registra e imprime uma verificação (nome, ok, detalhe). */
export function check(name, ok, extra = '') {
  checks.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`);
  return !!ok;
}

/**
 * Sobe o Vite e abre a página. `url` é o caminho + query (`/?skipPreload&texq=low&play&map=...`).
 * `ready` é avaliado na página (padrão: partida criada com construções).
 */
export async function startSession({ port, url, ready, viewport = { width: 1280, height: 720 }, freezeAi = false }) {
  const vite = await createServer({ server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  const base = `http://127.0.0.1:${port}`;
  const S = { vite, base, browser: null, page: null, errors: [], warnings: [] };
  S.close = async () => {
    if (S.browser) await S.browser.close().catch(() => {});
    S.browser = null;
    await vite.close().catch(() => {});
  };
  try {
    S.browser = await chromium.launch({ headless: true, args: ARGS });
    S.page = await (await S.browser.newContext({ viewport })).newPage();
    S.page.on('pageerror', (e) => S.errors.push('pageerror: ' + e.message));
    S.page.on('console', (m) => {
      if (m.type() === 'error') S.errors.push(m.text());
      else if (m.type() === 'warning') S.warnings.push(m.text());
    });
    S.page.on('requestfailed', (r) => S.errors.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
    await assertHardwareGpu(S.page);
    await S.page.goto(base + url, { waitUntil: 'load', timeout: 90000 });
    await S.page.waitForFunction(
      ready || (() => !!(window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0)),
      null, { timeout: 90000 }
    );
    await S.page.waitForTimeout(1500);
    if (freezeAi) {
      await S.page.evaluate(() => { window.game.gameManager.aiDirectors.forEach((d) => { d.update = () => {}; }); });
    }
    S.renderer = await S.page.evaluate(() => {
      const gl = window.game && window.game.sceneManager ? window.game.sceneManager.renderer.getContext() : null;
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
    });
    console.log('renderer:', S.renderer);
  } catch (e) {
    await S.close();
    throw e;
  }
  return S;
}

/** Foto da página inteira (com HUD) em arquivo temporário; devolve o caminho. */
export async function shotTmp(page, name, opts = {}) {
  const file = path.join(TMP, name);
  await page.screenshot({ path: file, ...opts });
  return file;
}

/** Canvas do jogo (sem HUD, sem pós-processamento) em arquivo temporário. */
export async function grabTmp(page, name) {
  const b64 = await page.evaluate(() => {
    const sm = window.game.sceneManager;
    sm.renderer.render(sm.scene, sm.camera);
    return sm.renderer.domElement.toDataURL('image/png').split(',')[1];
  });
  const file = path.join(TMP, name);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

/** Câmera: alvo, zoom (menor = mais perto) e giro (π/4 = padrão). Espera `wait` ms para a câmera assentar. */
export async function cam(page, x, y, z, zoom, yaw = Math.PI / 4, wait = 1400) {
  await page.evaluate(([x, y, z, zoom, yaw]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = yaw;
  }, [x, y, z, zoom, yaw]);
  await page.waitForTimeout(wait);
}

/** Coordenadas de tela (px CSS) de um ponto do mundo. */
export function screenOf(page, x, y, z) {
  return page.evaluate(([x, y, z]) => {
    const cam = window.game.sceneManager.camera;
    const v = cam.position.clone().set(x, y, z);
    v.project(cam);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, behind: v.z > 1 };
  }, [x, y, z]);
}

/**
 * Monta painéis (arquivos PNG temporários) numa grade, reduz para `panelW` de largura, escreve o rótulo no canto e grava
 * `outName` (256 cores, otimizado) em OUT. Painéis: { file, label?, crop?: [x0,y0,x1,y1], nearest?: true }.
 */
export function montage(outName, panels, { cols = panels.length, panelW = 640, quantize = true } = {}) {
  const out = path.join(OUT, outName);
  const spec = JSON.stringify({ out, cols, panelW, panels, quantize: quantize && !process.env.NO_SHRINK });
  execFileSync('python3', ['-I', '-c', `
import sys, json
from PIL import Image, ImageDraw, ImageFont
spec = json.loads(sys.argv[1])
try:
    font = ImageFont.load_default(size=15)
except Exception:
    font = ImageFont.load_default()
tiles = []
for p in spec['panels']:
    im = Image.open(p['file']).convert('RGB')
    if p.get('crop'):
        im = im.crop(tuple(p['crop']))
    w = spec['panelW']
    h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.NEAREST if p.get('nearest') else Image.LANCZOS)
    if p.get('label'):
        d = ImageDraw.Draw(im)
        tw = d.textlength(p['label'], font=font)
        d.rectangle([0, 0, tw + 12, 22], fill=(0, 0, 0))
        d.text((6, 3), p['label'], fill=(255, 255, 255), font=font)
    tiles.append(im)
cols = spec['cols']
rows = (len(tiles) + cols - 1) // cols
gap = 4
cw = max(t.width for t in tiles)
ch = max(t.height for t in tiles)
sheet = Image.new('RGB', (cols * cw + (cols - 1) * gap, rows * ch + (rows - 1) * gap), (0, 0, 0))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * (cw + gap), (i // cols) * (ch + gap)))
if spec['quantize']:
    sheet = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
sheet.save(spec['out'], optimize=True)
`, spec], { stdio: 'inherit' });
  written.push(out);
  console.log('PNG:', path.relative(process.cwd(), out), `${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
  return out;
}

/** Grava o JSON de medidas ao lado dos PNGs e imprime o resumo final. Devolve o código de saída. */
export function finish(item, data, errors, warnings = []) {
  const failed = checks.filter((c) => !c.ok);
  const result = { item, data, consoleErrors: errors, consoleErrorCount: errors.length, consoleWarningCount: warnings.length, checks, pngs: written.map((f) => path.basename(f)) };
  const file = path.join(OUT, `${item}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  console.log(`\n${item}: ${checks.length - failed.length}/${checks.length} verificações OK; erros de console: ${errors.length}`);
  if (errors.length) console.log('ERROS:', errors.slice(0, 8).join(' | '));
  if (failed.length) console.log('FALHAS:', failed.map((c) => c.name).join(' | '));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temporários */ }
  return failed.length ? 1 : 0;
}
