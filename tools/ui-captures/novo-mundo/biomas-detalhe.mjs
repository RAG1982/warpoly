#!/usr/bin/env node
/**
 * M2-19 — capturas rápidas dos biomas fracos (rocha, vulcânico, pântano, gelo, neve) em close, para o antes/depois do detalhe de terreno.
 *
 *   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/novo-mundo/biomas-detalhe.mjs <saida.jpg> [mapa] [?query extra]
 *
 * Variáveis: BD_PORT (padrão 5331), BD_ZOOM (padrão 0.45), BD_QUERY (ex.: `terraindetail=0` para o "antes"), BD_BIOMES (ex.: `6,7,10,11,9`).
 * GPU real obrigatória (assertHardwareGpu). Sobe o próprio Vite (`--strictPort`), uma página, fecha tudo no `finally`.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'biomas-detalhe.jpg'));
const MAP = process.argv[3] || 'duelo-continental-1';
const PORT = Number(process.env.BD_PORT || 5331);
const ZOOM = Number(process.env.BD_ZOOM || 0.45);
const QUERY = process.env.BD_QUERY || 'texq=low';
const BIOMES = (process.env.BD_BIOMES || '6,7,10,11,9').split(',').map(Number);
const TMP = fs.mkdtempSync(path.join(process.env.CAPTURE_TMP || os.tmpdir(), 'biomas-detalhe-'));
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

let vite = null, browser = null;
try {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&play&map=${MAP}&faction=human&${QUERY}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!(window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0 && window.game.sceneManager), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.game.gameManager.fogOfWar.setEnabled(false));
  await page.waitForTimeout(800);
  // centro (mais profundo) de cada bioma pedido, direto do biomeGrid
  const spots = await page.evaluate(async (biomes) => {
    const { gridOfBiome } = await import('/src/data/maps/biome.js');
    const def = window.game.gameManager.terrain.mapDef;
    const g = gridOfBiome(def.biomeGrid);
    const n = def.biomeGrid.nodes, cell = def.biomeGrid.cell, half = def.size / 2;
    const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : g[j * n + i]);
    const depth = (i, j, b) => { for (let r = 1; r <= 9; r++) for (let a = -r; a <= r; a++) if (at(i + a, j - r) !== b || at(i + a, j + r) !== b || at(i - r, j + a) !== b || at(i + r, j + a) !== b) return r - 1; return 9; };
    const out = {};
    for (const b of biomes) {
      let best = null;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (g[j * n + i] !== b) continue;
        const d = depth(i, j, b);
        const score = d * 1000 - Math.hypot(i - n / 2, j - n / 2);
        if (!best || score > best.score) best = { score, d, i, j };
      }
      if (best) out[b] = { x: +(best.i * cell - half).toFixed(1), z: +(best.j * cell - half).toFixed(1), depth: best.d };
    }
    return out;
  }, BIOMES);
  const NAMES = { 6: 'rocha', 7: 'vulcânico', 9: 'neve', 10: 'pântano', 11: 'gelo', 3: 'savana', 4: 'deserto', 2: 'grama' };
  const panels = [];
  for (const b of BIOMES) {
    const s = spots[b];
    if (!s) continue;
    await page.evaluate(([x, z, zoom]) => { const sm = window.game.sceneManager; sm.cameraTarget.set(x, 0, z); sm.targetZoomLevel = zoom; sm.targetCameraAngle = Math.PI / 4; }, [s.x, s.z, ZOOM]);
    await page.waitForTimeout(1200);
    const b64 = await page.evaluate(() => { const sm = window.game.sceneManager; sm.renderer.render(sm.scene, sm.camera); return sm.renderer.domElement.toDataURL('image/png').split(',')[1]; });
    const f = path.join(TMP, `b${b}.png`);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    panels.push({ file: f, label: `${NAMES[b] || b} (${s.x}, ${s.z}) prof. ${s.depth} | ${MAP} | ${QUERY}` });
  }
  const spec = JSON.stringify({ out: OUT, panels });
  execFileSync('python3', ['-I', '-c', `
import sys, json
from PIL import Image, ImageDraw, ImageFont
s = json.loads(sys.argv[1])
font = ImageFont.load_default(size=16)
tiles = []
for p in s['panels']:
    im = Image.open(p['file']).convert('RGB')
    w = 960; h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    tw = d.textlength(p['label'], font=font)
    d.rectangle([0, 0, tw + 12, 24], fill=(0, 0, 0))
    d.text((6, 3), p['label'], fill=(255, 255, 255), font=font)
    tiles.append(im)
cols = 2; rows = (len(tiles) + cols - 1) // cols; gap = 4
cw = max(t.width for t in tiles); ch = max(t.height for t in tiles)
sh = Image.new('RGB', (cols * cw + gap, rows * ch + (rows - 1) * gap), (0, 0, 0))
for i, t in enumerate(tiles):
    sh.paste(t, ((i % cols) * (cw + gap), (i // cols) * (ch + gap)))
sh.save(s['out'], quality=85, optimize=True)
`, spec], { stdio: 'inherit' });
  console.log('ficha:', OUT, '| erros de console:', errors.length ? errors.join(' || ') : 'nenhum');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
  fs.rmSync(TMP, { recursive: true, force: true });
}
