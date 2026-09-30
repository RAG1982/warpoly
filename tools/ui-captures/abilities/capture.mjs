#!/usr/bin/env node
/**
 * F4-03 — capturas do sistema de mana/habilidades no jogo (debug_bolt/debug_heal num Espadachim):
 * barra de mana, card com recarga, modo-alvo, lançamento contra um inimigo, auto-cast.
 * Rode SOMENTE via: bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/abilities/capture.mjs
 * Sobe o Vite na porta 5209; uma página por vez; GPU real obrigatória (assertHardwareGpu).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5209;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1',
  '--disable-dev-shm-usage', '--disable-extensions'
];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
let browser;

try {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&debug`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const id = gm.localPlayerId;
    const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
    const cx = hq.mesh.position.x;
    const cz = hq.mesh.position.z + 14;
    const mk = (type, x, z, owner) => gm.spawnUnit(type, x, z, owner);
    const knight = mk('knight', cx, cz, id);
    knight.setupMana({ maxMana: 100, startMana: 60, abilities: ['debug_bolt', 'debug_heal'] });
    const hurt = mk('knight', cx + 3, cz, id);
    hurt.hp = 60;
    hurt.updateHealthBar();
    const enemyId = gm.players.find(p => p.id !== id).id;
    const foe = mk('knight', cx + 9, cz - 4, enemyId);
    foe.speed = 0; foe.hp = foe.maxHp = 2000; foe.updateHealthBar();
    hurt.isCombatUnit = () => false; knight.isCombatUnit = () => false;
    foe.isCombatUnit = () => false;
    gm.sceneManager.cameraTarget.set(cx + 4, 1, cz);
    gm.selectSingle(knight);
    window.__t = { knightId: knight.id, foeId: foe.id, hurtId: hurt.id };
    return window.__t;
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '1_selecionado_mana.png') });

  // Clique no botão do Raio de Teste -> modo-alvo
  await page.click('button[data-ability="debug_bolt"]');
  const mode = await page.evaluate(() => window.game.inputManager.targetMode);
  console.log('modo-alvo:', JSON.stringify(mode));
  await page.waitForTimeout(300);
  await page.hover('button[data-ability="debug_bolt"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '2_modo_alvo.png') });

  // Confirma no inimigo (pela API de entrada: hoveredEntity + clique esquerdo simulado)
  await page.evaluate(() => {
    const im = window.game.inputManager;
    const gm = window.game.gameManager;
    im.hoveredEntity = gm.getEntity(window.__t.foeId);
    im._handleTargetClick();
  });
  await page.mouse.move(640, 300);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(OUT, '3_lancando.png') });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '4_recarga_apos_cast.png') });
  const after = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const k = gm.getEntity(window.__t.knightId);
    const f = gm.getEntity(window.__t.foeId);
    return { mana: Math.round(k.mana), cd: Math.round((k.cooldowns.debug_bolt || 0) * 10) / 10, foeHp: f.hp, foeMax: f.maxHp, state: k.state };
  });
  console.log('apos cast:', JSON.stringify(after));

  // Auto-cast: botão direito no Cura de Teste
  await page.click('button[data-ability="debug_heal"]', { button: 'right' });
  await page.waitForTimeout(3500);
  const heal = await page.evaluate(() => {
    const gm = window.game.gameManager;
    return { hurtHp: gm.getEntity(window.__t.hurtId).hp, auto: gm.getEntity(window.__t.knightId).autocast };
  });
  console.log('auto-cast:', JSON.stringify(heal));
  await page.screenshot({ path: path.join(OUT, '5_autocast.png') });
  console.log(errors.length ? `ERROS: ${errors.join(' | ')}` : 'sem erros de console');
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close();
}
