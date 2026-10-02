#!/usr/bin/env node
/**
 * F6-09 — verificação em navegador real (GPU) de i18n pt-BR/en e do tutorial.
 *
 * NÃO rode direto: use
 *   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/i18n/capture-i18n.mjs
 * Sobe o próprio Vite (porta 5321), abre UM Chromium com GPU real (assertHardwareGpu), percorre:
 *   1. menu / Escaramuça / Opções (aba Interface: seletor de idioma) em pt-BR e en;
 *   2. tutorial completo pelo menu (carga → 8 passos por comandos da simulação, painel e setas em cada passo),
 *      trocando para en no meio; HUD, pausa e diálogo de saves em en;
 *   3. varredura de texto PT-BR visível em en (acentos/palavras PT) e 0 erros de console.
 * Capturas em tools/ui-captures/i18n/*.png; relatório em tools/ui-captures/i18n/report.json.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'tools/ui-captures/i18n');
const PORT = 5321;
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

const PT_ACCENT = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
const PT_WORDS = /\b(não|para|uma|você|seu|sua|clique|ouro|madeira|pedra|vida|jogo|partida|opções|voltar|fechar|iniciar|cancelar|salvar|carregar|sair|recursos|construção|unidades|treinar|nível|vitória|derrota|requer|custo|alcance|ataque|defesa)\b/i;
const report = { checks: [], steps: [], errors: [] };
const log = (...a) => console.log('[i18n]', ...a);
const check = (name, ok, extra = '') => { report.checks.push({ name, ok: !!ok, extra }); log(ok ? 'OK  ' : 'FAIL', name, extra); };

let vite = null; let browser = null;
const shot = async (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withoutLangNames = (s) => s.replace(/Português \(Brasil\)/g, '');
/** Texto visível/DOM (inclui balões ocultos) de seletores; devolve trechos que parecem PT-BR. */
async function ptLeaks(page, selectors) {
  const texts = await page.evaluate((sels) => sels.map((s) => [...document.querySelectorAll(s)].map((e) => e.textContent + ' ' + (e.getAttribute('title') || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + [...e.querySelectorAll('[title],[aria-label],img[alt]')].map((c) => `${c.getAttribute('title') || ''} ${c.getAttribute('aria-label') || ''} ${c.getAttribute('alt') || ''}`).join(' ')).join(' | ')), selectors);
  return texts.flatMap((t) => withoutLangNames(t).split('|').filter((c) => PT_ACCENT.test(c) || PT_WORDS.test(c)).map((c) => c.trim().slice(0, 80)));
}

async function main() {
  vite = await createServer({ root: ROOT, server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'pt-BR' });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  await assertHardwareGpu(page);
  // Semeia o idioma uma única vez (primeiro uso: detecção do navegador deve dar pt-BR com locale pt-BR).
  const base = `http://127.0.0.1:${PORT}`;

  // ============================ 1. Menu ============================
  await page.goto(`${base}/?texq=low`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#main-menu.mm-ready', { timeout: 30000 });
  check('detecção do navegador (locale pt-BR) → pt-BR', (await page.evaluate(() => document.documentElement.lang)) === 'pt-BR');
  check('menu em pt-BR tem "Novo Jogo" e "Tutorial"', /Novo Jogo/.test(await page.textContent('.mm-nav')) && /Tutorial/.test(await page.textContent('.mm-nav')));
  await shot(page, 'menu-pt-BR');
  await page.click('[data-action="new-game"]');
  await sleep(600);
  await shot(page, 'skirmish-pt-BR');
  await page.click('.mm-panel [data-action="close"]');
  await page.click('[data-action="options"]');
  await page.click('#op-tab-interface');
  await sleep(200);
  await shot(page, 'options-interface-pt-BR');
  await page.click('[data-seg="lang"] input[value="en"]');
  await sleep(400);
  check('trocar idioma em Opções reflete na hora (aba "Interface")', /Interface/.test(await page.textContent('#op-tab-interface')) && /Restore defaults/.test(await page.textContent('.op-foot')));
  await shot(page, 'options-interface-en');
  for (const tab of ['graphics', 'audio', 'controls', 'interface', 'game']) {
    await page.click(`#op-tab-${tab}`);
    const leaks = await ptLeaks(page, ['#options-panel']);
    check(`opções/${tab} sem PT em en`, leaks.length === 0, leaks.join(' ; '));
    if (tab === 'controls') await shot(page, 'options-controls-en');
  }
  await page.click('.op-foot [data-op="close"]');
  await sleep(400);
  check('idioma salvo em localStorage', (await page.evaluate(() => localStorage.getItem('warpoly.lang'))) === 'en');
  check('menu refeito em en', /New Game/.test(await page.textContent('.mm-nav')) && /Tutorial/.test(await page.textContent('.mm-nav')));
  await shot(page, 'menu-en');
  await page.click('[data-action="new-game"]');
  await sleep(700);
  await shot(page, 'skirmish-en');
  check('menu + Escaramuça sem PT em en', (await ptLeaks(page, ['#main-menu'])).length === 0, (await ptLeaks(page, ['#main-menu'])).join(' ; '));
  await page.click('.mm-panel [data-action="close"]');
  // volta ao pt-BR para jogar o tutorial em português
  await page.click('[data-action="lang"]');
  await sleep(400);
  check('botão do rodapé alterna o idioma', (await page.evaluate(() => document.documentElement.lang)) === 'pt-BR');

  // ============================ 2. Tutorial ============================
  await page.click('[data-action="tutorial"]');
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.session && window.game.session.tutorialController, null, { timeout: 180000 });
  await sleep(1500);
  await page.evaluate(() => { window.game.gameManager.gameSpeed = 3; });
  const state = () => page.evaluate(() => { const c = window.game.session.tutorialController; return c ? c.tutorial.state() : null; });
  const marker = () => page.evaluate(() => {
    const m = document.getElementById('tutorial-marker'); const r = document.getElementById('tutorial-ring');
    return { marker: m && m.style.display, markerText: m && m.textContent, ring: r && r.style.display };
  });
  const panelText = () => page.textContent('#tutorial-panel');
  const stepShot = async (id, lang) => {
    await sleep(500);
    const mk = await marker();
    const entry = { id, lang, marker: mk, panel: (await panelText()).replace(/\s+/g, ' ').trim().slice(0, 120) };
    report.steps.push(entry);
    log('passo', id, JSON.stringify(mk));
    await shot(page, `tutorial-${String(report.steps.length).padStart(2, '0')}-${id}-${lang}`);
    return mk;
  };
  const waitStep = async (id, max = 150000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      if (!s || s.stepId !== id) return true;
      if (Date.now() - t0 > max) return false;
      await sleep(250);
    }
  };

  check('tutorial iniciou no passo "select" com painel visível', (await state()).stepId === 'select' && /Selecione um trabalhador/.test(await panelText()));
  let mk = await stepShot('select', 'pt-BR');
  check('seta de mundo no trabalhador (select)', mk.marker === 'block');
  // seleciona um trabalhador de verdade
  await page.evaluate(() => { const gm = window.game.gameManager; gm.selectSingle(gm.units.find((u) => u.ownerId === gm.localPlayerId && u.type === 'villager')); });
  check('select → wood', await waitStep('select', 5000) && (await state()).stepId === 'wood');
  mk = await stepShot('wood', 'pt-BR');
  check('seta de mundo na árvore (wood)', mk.marker === 'block');

  // Funções do jogador roteirizado (mesmo roteiro do teste headless), dentro da página.
  await page.evaluate(() => {
    const gm = window.game.gameManager; const ME = gm.localPlayerId; const home = gm.localPlayer.startPos;
    const d = (p) => Math.hypot(p.mesh.position.x - home.x, p.mesh.position.z - home.z);
    window.__tut = {
      workers: () => gm.units.filter((u) => u.ownerId === ME && !u.isDead && u.type === 'villager'),
      soldiers: () => gm.units.filter((u) => u.ownerId === ME && !u.isDead && ['knight', 'archer'].includes(u.type)),
      gather(kind) {
        const list = kind === 'wood' ? gm.trees.filter((t) => !t.isDead) : gm.resourceDeposits.filter((r) => r.type === 'gold');
        const t = list.sort((a, b) => d(a) - d(b))[0];
        gm.issue({ type: 'gather', playerId: ME, unitIds: this.workers().map((u) => u.id), targetId: t.id });
      },
      place(type) {
        for (let r = 8; r < 40; r += 3) for (let a = 0; a < 16; a++) {
          const x = home.x + Math.cos(a * Math.PI / 8) * r; const z = home.z + Math.sin(a * Math.PI / 8) * r;
          if (gm.canPlaceBuilding(type, x, z, null, ME)) { gm.issue({ type: 'placeBuilding', playerId: ME, buildingType: type, x, z, unitIds: this.workers().map((u) => u.id) }); return true; }
        }
        return false;
      },
      selectWorker() { gm.selectSingle(this.workers()[0]); },
      selectBarracks() { gm.selectSingle(gm.buildings.find((b) => b.ownerId === ME && b.type === 'barracks' && b.isConstructed)); },
      train() { const b = gm.buildings.find((x) => x.ownerId === ME && x.type === 'barracks' && x.isConstructed); for (let i = 0; i < 2; i++) gm.issue({ type: 'train', playerId: ME, buildingId: b.id, unitType: 'knight' }); },
      attackCamp() {
        const camp = gm.buildings.find((b) => b.type === 'bandit_camp' && !b.isDead);
        if (!camp) return;
        const ids = this.soldiers().map((u) => u.id);
        gm.issue({ type: 'attack', playerId: ME, unitIds: ids, targetId: camp.id });
        gm.selectedUnits.forEach((u) => u.setSelected(false)); gm.selectedUnits = this.soldiers(); gm.selectedUnits.forEach((u) => u.setSelected(true));
      }
    };
    window.__tut.gather('wood');
  });
  check('wood concluído', await waitStep('wood'));
  mk = await stepShot('gold', 'pt-BR');
  check('seta de mundo na mina (gold)', mk.marker === 'block');
  await page.evaluate(() => window.__tut.gather('gold'));
  check('gold concluído', await waitStep('gold'));

  // troca para en no meio do tutorial (HUD/painel refeitos)
  await page.click('#btn-config');
  await page.waitForSelector('#options-panel:not([hidden])');
  await page.click('#op-tab-interface');
  await page.click('[data-seg="lang"] input[value="en"]');
  await sleep(300);
  await page.click('.op-foot [data-op="close"]');
  await sleep(300);
  check('painel do tutorial trocou para en na hora', /Build a house/.test(await panelText()));

  for (const [id, type] of [['house', 'cottage'], ['farm', 'farm'], ['barracks', 'barracks']]) {
    await page.evaluate(() => window.__tut.selectWorker());
    mk = await stepShot(id, 'en');
    check(`destaque da HUD no botão de construir (${id})`, mk.ring === 'block', JSON.stringify(mk));
    if (id === 'house') {
      check('HUD (selecionado: trabalhador) sem PT em en', (await ptLeaks(page, ['#selection-card', '#bottom-bar', '#top-bar-container'])).length === 0, (await ptLeaks(page, ['#selection-card', '#bottom-bar', '#top-bar-container'])).join(' ; '));
    }
    check(`${type} posicionado`, await page.evaluate((t) => window.__tut.place(t), type));
    check(`${id} concluído`, await waitStep(id, 200000));
  }
  await page.evaluate(() => window.__tut.selectBarracks());
  mk = await stepShot('train', 'en');
  check('destaque da HUD no botão de treino (train)', mk.ring === 'block', JSON.stringify(mk));
  check('HUD (selecionado: quartel) sem PT em en', (await ptLeaks(page, ['#selection-card'])).length === 0, (await ptLeaks(page, ['#selection-card'])).join(' ; '));
  await page.evaluate(() => window.__tut.train());
  check('train concluído', await waitStep('train', 200000));
  await page.evaluate(() => { window.__tut.attackCamp(); });
  mk = await stepShot('attack', 'en');
  check('seta de mundo no acampamento (attack)', mk.marker === 'block');
  check('HUD (selecionado: soldados) sem PT em en', (await ptLeaks(page, ['#selection-card'])).length === 0, (await ptLeaks(page, ['#selection-card'])).join(' ; '));
  await shot(page, 'hud-soldiers-en');
  // reforça o ataque até cair o acampamento
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (s.finished) break;
    if (Date.now() - t0 > 240000) break;
    await page.evaluate(() => window.__tut.attackCamp());
    await sleep(1500);
  }
  const fin = await state();
  check('tutorial concluído', fin.finished === true);
  await sleep(500);
  check('tela de conclusão com "Keep playing"', /Tutorial complete/.test(await panelText()) && /Keep playing/.test(await panelText()));
  await shot(page, 'tutorial-done-en');
  const simTime = await page.evaluate(() => window.game.gameManager.currentTick * 0.05);
  report.tutorialSimSeconds = simTime;
  check('tutorial ≤ 8 min de jogo', simTime <= 480, `${Math.round(simTime)} s`);

  // alertas/sim traduzidos em en
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    gm.events.emit('notify', { ownerId: gm.localPlayerId, text: '⚠️ Recursos insuficientes!' });
    gm.events.flush();
  });
  await sleep(300);
  check('mensagem da simulação traduzida (en)', /Not enough resources/.test(await page.textContent('#notification-box')));
  const over = await page.evaluate(() => window.game.uiManager._gameOverText(true));
  check('texto de fim de jogo em en', /Match time/.test(over) && /Units:/.test(over), over.replace(/\n/g, ' / '));

  // pausa / saves em en
  await page.evaluate(() => window.game.pause());
  await sleep(400);
  await shot(page, 'pause-en');
  check('pausa sem PT em en', (await ptLeaks(page, ['#pause-menu'])).length === 0, (await ptLeaks(page, ['#pause-menu'])).join(' ; '));
  await page.click('[data-pause-action="save"]');
  await sleep(500);
  await shot(page, 'save-dialog-en');
  check('diálogo de saves sem PT em en', (await ptLeaks(page, ['#save-dialog'])).length === 0, (await ptLeaks(page, ['#save-dialog'])).join(' ; '));
  await page.click('[data-save-close]');
  // volta ao menu, tutorial de novo fica disponível
  await page.click('[data-pause-action="main-menu"]');
  await page.waitForSelector('#main-menu.mm-ready', { timeout: 30000 });
  check('volta ao menu principal depois do tutorial', true);

  report.errors = report.errors.filter((e) => !/favicon|Download the React/i.test(e));
  check('0 erros de console', report.errors.length === 0, report.errors.slice(0, 5).join(' ; '));
}

try {
  await main();
} catch (err) {
  report.fatal = String(err && err.stack || err);
  log('FATAL', report.fatal);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
if (report.checks.some((c) => !c.ok)) process.exitCode = 1;
