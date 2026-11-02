#!/usr/bin/env node
/**
 * FIX-VOLCANIC-DARK — capturas NO JOGO da missão 8 "A Fornalha" (mapa camp-08-fornalha, tileset vulcânico) para
 * comparar ANTES/DEPOIS da correção de iluminação. Molde: tools/ui-captures/M3-09/capture.mjs.
 * GPU real obrigatória. Rode SOMENTE via safe-run:
 *   bash tools/safe-run.sh --timeout 900 -- node tools/ui-captures/FIX-VOLCANIC-DARK/capture.mjs antes
 *   bash tools/safe-run.sh --timeout 900 -- node tools/ui-captures/FIX-VOLCANIC-DARK/capture.mjs depois
 * Argumento = fase (prefixo dos PNG: antes-*.png / depois-*.png). Saída: resultado-<fase>.json com a luminância média
 * (0..255, Rec.709 sobre o PNG inteiro) de cada captura.
 * A câmera é movida pelo evento `mission_camera` (como na M3-07/M3-09). Brann não morre (inimigos perto do Paço somem).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';
import { decodePng } from '../../lib/png.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.argv[2] === 'depois' ? 'depois' : 'antes';
const PORT = Number(process.env.PORT_VITE || 5341);
const ID = 'war-alliance-08-a-fornalha';
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

/** Luminância média Rec.709 (0..255) de um PNG. */
function meanLuma(file) {
  const img = decodePng(readFileSync(file));
  const { width, height, data } = img;
  let sum = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * (data.length / n);
    sum += 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  return +(sum / n).toFixed(2);
}

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;
const result = { phase: PHASE, shots: [], luma: {}, errors: [] };
try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
  result.gpu = await assertHardwareGpu(page);
  const shot = async (n) => {
    await page.screenshot({ path: path.join(OUT, `${PHASE}-${n}`) });
    result.shots.push(n);
    result.luma[n] = meanLuma(path.join(OUT, `${PHASE}-${n}`));
  };
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low&campaign=unlock`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('[data-action="campaign"]', { timeout: 60000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await page.waitForTimeout(600);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('[data-cs="pick"][data-id="war-alliance"]', { timeout: 30000 });
  await page.click('[data-cs="pick"][data-id="war-alliance"]');
  const skip = await page.waitForSelector('[data-story="skip"]', { timeout: 20000 }).catch(() => null);
  if (skip) { await skip.click(); await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {}); }
  await page.waitForSelector(`[data-cp="pick"][data-id="${ID}"]`, { timeout: 30000 });
  await page.click(`[data-cp="pick"][data-id="${ID}"]`);
  await page.waitForTimeout(500);
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game?.gameManager?.mission, null, { timeout: 90000 });
  // Brann não morre durante a captura (só a captura)
  await page.evaluate(() => {
    const gm = window.game.gameManager, A = gm.terrain.mapDef.anchors;
    setInterval(() => {
      const k = gm.getUnitsOf(0).find((u) => !u.isDead);
      for (const u of gm.allUnits) if (!u.isDead && gm.isHostile(0, u.ownerId) && Math.hypot(u.mesh.position.x - A.playerStart.x, u.mesh.position.z - A.playerStart.z) < 60) u.takeDamage(1e6, k);
    }, 1500);
  });
  // fecha a cutscene/avisos de abertura (a intro não interessa para a iluminação)
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Fechar' }).first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(400);
  const focus = async (anchor, zoom, name) => {
    await page.evaluate(([a, zm]) => {
      const gm = window.game.gameManager, p = gm.terrain.mapDef.anchors[a];
      gm.fogOfWar?.revealArea(p.x, p.z, 34, 0); // só para a captura: a névoa de guerra esconderia as unidades
      gm.events.emit('mission_camera', { x: p.x, z: p.z, zoom: zm });
    }, [anchor, zoom]);
    await page.waitForTimeout(4000); // a câmera desliza até o alvo
    await shot(name);
  };
  await focus('playerStart', 1.0, '01-base-unidades-no-chao-vulcanico.png');
  await focus('lavaPass1', 1.0, '02-passagem-rio-de-lava.png');
  await focus('sanctum', 1.2, '03-santuario-das-cinzas.png');
  await focus('shipyard1', 1.3, '04-estaleiro-costa.png');
  writeFileSync(path.join(OUT, `resultado-${PHASE}.json`), JSON.stringify(result, null, 2));
  console.log(PHASE, 'capturas:', result.shots.length, 'luma:', JSON.stringify(result.luma), 'erros de console:', result.errors.length);
} finally {
  if (browser) await browser.close();
  await vite.close();
}
