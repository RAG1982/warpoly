#!/usr/bin/env node
/**
 * F3-01: verificação automática dos controles RTS no navegador (grupos, S/H/A/P, atalhos do card,
 * trabalhador ocioso, Backspace). Rode via: bash tools/safe-run.sh --timeout 240 -- node tools/controls-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5243;
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
});
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); if (!ok) failed++; };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low`);
  await assertHardwareGpu(page);
  await page.waitForFunction('window.game && window.game.gameManager && window.game.inputManager', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const q = (fn) => page.evaluate(fn);
  await q(() => {
    const g = window.game.gameManager;
    window.__cmds = [];
    const orig = g.issue.bind(g);
    g.issue = f => { window.__cmds.push(f); return orig(f); };
  });
  const press = async (code, mods = []) => { for (const m of mods) await page.keyboard.down(m); await page.keyboard.press(code); for (const m of mods) await page.keyboard.up(m); await page.waitForTimeout(80); };

  // Grupos
  const n = await q(() => {
    const g = window.game.gameManager, im = window.game.inputManager;
    const us = g.getUnitsOf(g.localPlayerId).slice(0, 3);
    im.selectUnits(us);
    return us.length;
  });
  await press('Digit1', ['Control']);
  await q(() => window.game.gameManager.clearSelection());
  await press('Digit1');
  check('grupo 1: grava e seleciona', (await q(() => window.game.gameManager.selectedUnits.length)) === n && n >= 3);

  // Ordens
  await press('KeyS');
  await press('KeyH');
  const cmds = await q(() => window.__cmds.map(c => c.type));
  check('S emite stop e H emite hold', cmds.includes('stop') && cmds.includes('hold'), JSON.stringify(cmds));
  await press('KeyA');
  check('A arma modo atacar-movendo', (await q(() => window.game.inputManager.targetMode?.kind)) === 'attackMove');
  await press('Escape');
  check('Esc cancela modo-alvo', (await q(() => window.game.inputManager.targetMode)) === null);
  await press('KeyP');
  check('P arma modo patrulhar', (await q(() => window.game.inputManager.targetMode?.kind)) === 'patrol');
  await press('Escape');

  // Atalho do card: trabalhador + C (casa)
  await q(() => {
    const g = window.game.gameManager, im = window.game.inputManager;
    const w = g.getUnitsOf(g.localPlayerId).find(u => u.type === 'villager' || u.type === 'peon');
    im.selectUnits([w]);
    g.uiManager.update(0.1);
  });
  await page.waitForTimeout(200);
  await press('KeyC');
  check('C (card do trabalhador) entra em colocação de construção', !!(await q(() => window.game.inputManager.placingBuildingType)));
  await press('Escape');

  // Atalho do card: construção + Q (treinar)
  await q(() => {
    const g = window.game.gameManager;
    g.localPlayer.resources.gold = 5000; g.localPlayer.resources.wood = 5000; g.localPlayer.resources.stone = 5000;
    g.selectSingle(g.buildings.find(b => b.ownerId === g.localPlayerId && (b.type === 'castle' || b.type === 'great_hall')));
    g.uiManager.update(0.1);
    window.__cmds.length = 0;
  });
  await page.waitForTimeout(200);
  await press('KeyQ');
  check('Q (card da construção) emite train', (await q(() => window.__cmds.some(c => c.type === 'train'))));

  // Backspace -> HQ; ponto -> ocioso
  await q(() => window.game.gameManager.clearSelection());
  await press('Backspace');
  check('Backspace seleciona o HQ', !!(await q(() => window.game.gameManager.selectedBuilding)));
  await q(() => { const g = window.game.gameManager; window.game.inputManager.selectUnits(g.getUnitsOf(g.localPlayerId)); });
  await press('KeyS');
  await page.waitForTimeout(600);
  await q(() => window.game.gameManager.clearSelection());
  await press('Period');
  const idleSel = await q(() => window.game.gameManager.selectedUnits.length);
  check('ponto seleciona trabalhador ocioso', idleSel === 1);

  // Shift+direito enfileira
  await q(() => { window.__cmds.length = 0; });
  await page.mouse.move(640, 300);
  await page.keyboard.down('Shift');
  await page.mouse.click(640, 300, { button: 'right' });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
  check('Shift+direito emite comando queued', await q(() => window.__cmds.some(c => c.queued === true)));

  check('sem pageerror', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
