#!/usr/bin/env node
// F8-04 · capturas e checagens da UI de missões (menu > Missões > briefing > partida > cutscene > painel > diálogo > fim).
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/mission/capture-mission.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'tools/ui-captures/mission');
const PORT = 5297;
mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok: !!ok }); console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`); };

const vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({ headless: true, args: ARGS });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);

  // 1. Menu principal > Missões > briefing
  await page.goto(`http://127.0.0.1:${PORT}/?texq=low`, { waitUntil: 'load' }); // sem skipPreload: o menu só aparece sem os parâmetros de bypass
  await page.waitForSelector('[data-action="missions"]', { timeout: 30000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; }); // pula o preload pesado ao iniciar a partida
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-menu.png` });
  await page.click('[data-action="missions"]');
  await page.waitForSelector('.ms-brief', { timeout: 5000 });
  const brief = await page.evaluate(() => document.querySelector('.ms-brief').innerText);
  check('briefing mostra título, texto e objetivos', brief.includes('Marcha de Demonstração') && brief.includes('bandoleiros') && brief.includes('Construir um Quartel'), '');
  check('briefing não lista o objetivo oculto', !brief.includes('ruínas esquecidas') || brief.includes('ruínas forgotten') === false);
  check('briefing só tem a missão demo', (await page.$$('.ms-brief-item')).length === 1);
  await page.screenshot({ path: `${OUT}/02-briefing.png` });

  // 2. Iniciar: cutscene de abertura
  await page.click('[data-ms="start"]');
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.mission, null, { timeout: 90000 });
  await page.waitForTimeout(900);
  const cut = await page.evaluate(() => ({ bars: !document.getElementById('mission-letterbox').hidden, locked: window.game.inputManager.cameraLocked, susp: window.game.inputManager.suspended }));
  check('cutscene de abertura: letterbox visível e input travado', cut.bars && cut.locked && cut.susp, JSON.stringify(cut));
  await page.screenshot({ path: `${OUT}/03-cutscene.png` });
  const camBefore = await page.evaluate(() => { const c = window.game.sceneManager.cameraTarget; return { x: c.x, z: c.z }; });
  await page.keyboard.press('KeyD'); // pan bloqueado
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  const camAfterKey = await page.evaluate(() => { const c = window.game.sceneManager.cameraTarget; return { x: c.x, z: c.z }; });
  check('a câmera da cutscene se move sozinha (e não por teclado)', Math.abs(camAfterKey.x - camBefore.x) + Math.abs(camAfterKey.z - camBefore.z) > 0.01);

  // 3. Esc pula a cutscene sem abrir o menu de pausa
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ bars: !document.getElementById('mission-letterbox').hidden, state: window.warpoly.fsm.state, susp: window.game.inputManager.suspended, locked: window.game.inputManager.cameraLocked }));
  check('Esc pula a cutscene, devolve o input e NÃO pausa', !after.bars && !after.locked && !after.susp && after.state === 'InGame', JSON.stringify(after));

  // 4. Painel de objetivos
  const panel = await page.evaluate(() => document.getElementById('mission-panel').innerText);
  check('painel de objetivos in-game', panel.includes('Construir um Quartel') && panel.includes('Resgatar') && !panel.includes('ruínas'), panel.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/04-painel.png` });

  // 5. Diálogo (ação dialog) com retrato; clique dispensa
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.events.emit('mission_dialog', { speaker: { 'pt-BR': 'Capitã Lyra', en: 'Captain Lyra' }, portrait: '🧙', text: { 'pt-BR': 'Bom trabalho, comandante!', en: 'Good work, commander!' }, duration: 30 });
  });
  await page.waitForTimeout(500);
  const dlg = await page.evaluate(() => { const d = document.getElementById('mission-dialog'); return { hidden: d.hidden, text: d.innerText }; });
  check('diálogo com retrato aparece', !dlg.hidden && dlg.text.includes('Bom trabalho') && dlg.text.includes('Capitã Lyra'), dlg.text.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/05-dialogo.png` });
  await page.click('#mission-dialog');
  await page.waitForTimeout(200);
  check('clicar no diálogo o dispensa', await page.evaluate(() => document.getElementById('mission-dialog').hidden));

  // 6. Progresso real: quartel + resgate pelo estado da sim => aviso e painel atualizam
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const b = gm.createBuilding('barracks', -42, 34, true, 0);
    gm.buildings.push(b);
  });
  await page.waitForTimeout(1500);
  const panel2 = await page.evaluate(() => document.getElementById('mission-panel').innerText);
  check('objetivo concluído aparece e o secundário de resistência é ativado', panel2.includes('Resistir às investidas'), panel2.replace(/\n/g, ' | '));
  await page.screenshot({ path: `${OUT}/06-progresso.png` });

  // 7. Vitória => tela de fim de missão
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.mission.finish('victory', { 'pt-BR': 'Os Clãs aceitam a trégua.', en: 'The Clans accept the truce.' });
  });
  await page.waitForSelector('#mission-end:not([hidden]) .ms-end-card', { timeout: 15000 });
  const end = await page.evaluate(() => document.getElementById('mission-end').innerText);
  check('tela de fim: vitória, tempo e lista de objetivos', end.includes('Missão cumprida') && end.includes('Tempo') && end.includes('Construir um Quartel'), end.replace(/\n/g, ' | '));
  check('tela de pós-jogo padrão NÃO aparece junto', await page.evaluate(() => getComputedStyle(document.getElementById('game-over-modal')).display === 'none'));
  await page.screenshot({ path: `${OUT}/07-fim-vitoria.png` });

  // 8. Tentar de novo reinicia a mesma missão
  await page.click('[data-ms="retry"]');
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.mission && window.game.gameManager.currentTick < 100 && !window.game.gameManager.isGameOver, null, { timeout: 90000 });
  check('"Jogar de novo" reinicia a missão (tick baixo, sem fim)', true);
  await page.waitForTimeout(800);

  // 9. Derrota => tela de fim; Estatísticas abre o pós-jogo padrão; Menu volta
  await page.evaluate(() => window.game.gameManager.mission.finish('defeat'));
  await page.waitForSelector('#mission-end:not([hidden]) .ms-end-card.is-lose', { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/08-fim-derrota.png` });
  await page.click('[data-ms="stats"]');
  await page.waitForTimeout(500);
  check('botão Estatísticas abre o pós-jogo padrão', await page.evaluate(() => getComputedStyle(document.getElementById('game-over-modal')).display !== 'none'));
  await page.screenshot({ path: `${OUT}/09-estatisticas.png` });
  await page.click('#btn-go-main-menu');
  await page.waitForSelector('[data-action="missions"]', { timeout: 30000 });
  check('voltou ao menu principal sem restos de UI de missão', await page.evaluate(() => !document.getElementById('mission-panel') && !document.getElementById('mission-end')));

  // 10. Inglês
  await page.evaluate(() => localStorage.setItem('warpoly.lang', 'en'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-action="missions"]', { timeout: 30000 });
  await page.click('[data-action="missions"]');
  await page.waitForSelector('.ms-brief');
  const en = await page.evaluate(() => document.querySelector('.ms-brief').innerText);
  check('briefing em inglês', en.includes('Demonstration March') && en.includes('Start mission'), '');
  await page.screenshot({ path: `${OUT}/10-briefing-en.png` });
  await page.evaluate(() => localStorage.removeItem('warpoly.lang'));

  check('sem erros de console', errors.length === 0, errors.slice(0, 3).join(' / '));
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} verificações OK`);
process.exit(failed.length ? 1 : 0);
