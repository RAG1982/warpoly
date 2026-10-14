#!/usr/bin/env node
/**
 * NEW-26 — inspeção SOMENTE-LEITURA de unidades/construções neutras e inimigas visíveis (`gm.inspected` + card).
 * Cliques REAIS do mouse (Playwright) sobre: um bandido neutro, o Acampamento Bandido (construção neutra) e uma unidade da IA.
 * Confere: `gm.inspected` preenchido sem tocar em `selectedUnits`/`selectedBuilding`; card com nome + lado (NEUTRO/INIMIGO), PV,
 * dono e SEM botões de ação; nenhum comando emitido (`gm.issue` espionado) por cliques, teclas de comando e clique direito;
 * Esc limpa; a inspeção some quando a unidade sai da visão; com unidades próprias selecionadas o clique no neutro ATACA (não inspeciona).
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-26.mjs
 * Saída: NEW-26-1-cards.png (3 cards), NEW-26-2-cena.png (cena com o bandido inspecionado) e NEW-26.json.
 */
import { startSession, shotTmp, cam, screenOf, montage, finish, check, TMP } from './_common.mjs';
import path from 'node:path';

const ITEM = 'NEW-26';
const S = await startSession({
  port: 5426,
  url: '/?skipPreload&texq=low&play&map=continental-1v1&faction=human',
  freezeAi: true
});
const { page } = S;
const data = {};
let code = 1;

/** Estado de inspeção/seleção e do card, lido do jogo e do DOM. */
const state = () => page.evaluate(() => {
  const gm = window.game.gameManager;
  const el = (id) => document.getElementById(id);
  const card = el('selection-card');
  const insp = gm.inspected;
  const view = insp ? gm.entityViews.viewOf(insp) : null;
  return {
    inspected: insp ? { id: insp.id, type: insp.type, owner: insp.ownerId, hp: Math.round(insp.hp), maxHp: insp.maxHp } : null,
    ringVisible: view && view.selectionRing ? !!view.selectionRing.visible : null,
    selectedUnits: gm.selectedUnits.length,
    selectedBuilding: gm.selectedBuilding ? gm.selectedBuilding.id : null,
    selectedResource: gm.selectedResource ? gm.selectedResource.id : null,
    cardDisplay: getComputedStyle(card).display,
    standardDisplay: el('standard-selection-view') ? el('standard-selection-view').style.display : null,
    buildingViewDisplay: el('building-selection-view') ? el('building-selection-view').style.display : null,
    title: (el('selection-title') || {}).innerText || '',
    hp: (el('selection-hp') || {}).innerText || '',
    stats: ((el('selection-stats') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
    actionButtons: el('selection-actions') ? el('selection-actions').querySelectorAll('button').length : null,
    issued: window.__issued.slice()
  };
});

/** Clique real do mouse sobre um ponto do mundo. */
async function click(x, y, z, button = 'left') {
  const p = await screenOf(page, x, y, z);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y, { button });
  await page.waitForTimeout(600);
  return p;
}
const cardShot = async (name) => {
  const file = path.join(TMP, name);
  try {
    await page.locator('#selection-card').screenshot({ path: file, timeout: 4000 });
  } catch (e) {
    console.log('card não visível; foto da página no lugar:', e.message.split('\n')[0]);
    await page.screenshot({ path: file });
  }
  return file;
};

try {
  // ---------------------------------------------------------------- 1. acampamento neutro mais próximo da base, revelado
  data.setup = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const foeId = gm.players.find((p) => p.id !== me && p.id !== 99).id;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq').mesh.position;
    const camps = gm.buildings.filter((b) => b.ownerId === 99 && b.type === 'bandit_camp');
    camps.sort((a, b) => Math.hypot(a.mesh.position.x - hq.x, a.mesh.position.z - hq.z) - Math.hypot(b.mesh.position.x - hq.x, b.mesh.position.z - hq.z));
    const camp = camps[0];
    const cp = camp.mesh.position;
    const guards = gm.allUnits.filter((u) => u.ownerId === 99 && !u.isDead && Math.hypot(u.mesh.position.x - cp.x, u.mesh.position.z - cp.z) < 14);
    window.__issued = [];
    const orig = gm.issue.bind(gm);
    gm.issue = (c) => { window.__issued.push(c.type); return orig(c); };
    gm.fogOfWar.revealArea(cp.x, cp.z, 26, 600);
    return { me, foeId, camp: { id: camp.id, x: cp.x, z: cp.z, hp: camp.hp }, guards: guards.map((g) => ({ id: g.id, type: g.type })), campsOnMap: camps.length };
  });
  console.log('setup', JSON.stringify(data.setup));
  check('há acampamento neutro com guardas no mapa', data.setup.guards.length > 0, JSON.stringify(data.setup.guards));
  await cam(page, data.setup.camp.x, 1.5, data.setup.camp.z, 0.7, Math.PI / 4, 2200);

  // ---------------------------------------------------------------- 2. clique real num bandido neutro
  const guardPos = await page.evaluate((id) => { const u = window.game.gameManager.entitiesById.get(id); return { x: u.mesh.position.x, y: u.mesh.position.y, z: u.mesh.position.z }; }, data.setup.guards[0].id);
  data.clickGuard = await click(guardPos.x, guardPos.y + 1.0, guardPos.z);
  data.A = await state();
  console.log('A (bandido)', JSON.stringify(data.A));
  check('A: clique no bandido neutro inspeciona (gm.inspected) sem selecionar', !!data.A.inspected && data.A.inspected.owner === 99 && data.A.selectedUnits === 0 && data.A.selectedBuilding === null, JSON.stringify(data.A.inspected));
  check('A: card visível com nome + lado NEUTRO, PV e dono; anel de seleção ligado', data.A.cardDisplay !== 'none' && /NEUTRO/i.test(data.A.title) && /HP/.test(data.A.hp) && data.A.stats.length > 0 && data.A.ringVisible === true, `${data.A.title} | ${data.A.hp} | ${data.A.stats}`);
  check('A: card sem botões de ação (somente leitura)', data.A.actionButtons === 0, `botões=${data.A.actionButtons}`);
  const cardA = await cardShot('cardA.png');
  const pageA = await shotTmp(page, 'paginaA.png');

  // teclas de comando e clique direito com a inspeção ativa não emitem nada
  for (const key of ['KeyS', 'KeyH', 'KeyA', 'KeyP', 'Digit1', 'KeyQ', 'KeyB']) { await page.keyboard.press(key); await page.waitForTimeout(80); }
  await page.mouse.click(640, 250, { button: 'right' });
  await page.waitForTimeout(500);
  data.A2 = await state();
  check('A: teclas S/H/A/P/1/Q/B e clique direito no chão não emitem comando e mantêm a inspeção', data.A2.issued.length === 0 && !!data.A2.inspected, `comandos=${JSON.stringify(data.A2.issued)}`);

  // Esc limpa
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  data.Aesc = await state();
  check('Esc limpa a inspeção e esconde o card', data.Aesc.inspected === null && data.Aesc.cardDisplay === 'none', JSON.stringify({ i: data.Aesc.inspected, card: data.Aesc.cardDisplay }));

  // ---------------------------------------------------------------- 3. clique real no Acampamento Bandido (construção neutra)
  const campPos = await page.evaluate((id) => { const b = window.game.gameManager.entitiesById.get(id); return { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z }; }, data.setup.camp.id);
  data.clickCamp = await click(campPos.x, campPos.y + 2.0, campPos.z);
  data.B = await state();
  console.log('B (acampamento)', JSON.stringify(data.B));
  check('B: clique no acampamento neutro inspeciona a construção (sem selectedBuilding)', !!data.B.inspected && data.B.inspected.type === 'bandit_camp' && data.B.selectedBuilding === null && data.B.selectedUnits === 0, JSON.stringify(data.B.inspected));
  check('B: card com lado NEUTRO, sem botões e sem o painel de construção', data.B.cardDisplay !== 'none' && /NEUTRO/i.test(data.B.title) && data.B.actionButtons === 0 && data.B.buildingViewDisplay === 'none', `${data.B.title} | ${data.B.hp} | bldView=${data.B.buildingViewDisplay}`);
  const cardB = await cardShot('cardB.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------- 4. unidade inimiga (IA) visível
  const foe = await page.evaluate((foeId) => {
    const gm = window.game.gameManager;
    const u = gm.allUnits.find((q) => q.ownerId === foeId && !q.isDead && q.type !== 'peon') || gm.allUnits.find((q) => q.ownerId === foeId && !q.isDead);
    const p = u.mesh.position;
    gm.fogOfWar.revealArea(p.x, p.z, 24, 600);
    return { id: u.id, type: u.type, x: p.x, y: p.y, z: p.z };
  }, data.setup.foeId);
  await cam(page, foe.x, 1.5, foe.z, 0.7, Math.PI / 4, 2200);
  const foeNow = await page.evaluate((id) => { const u = window.game.gameManager.entitiesById.get(id); return { x: u.mesh.position.x, y: u.mesh.position.y, z: u.mesh.position.z }; }, foe.id);
  data.clickFoe = await click(foeNow.x, foeNow.y + 1.0, foeNow.z);
  data.C = await state();
  console.log('C (inimigo)', JSON.stringify(data.C));
  check('C: unidade inimiga visível é inspecionada (card INIMIGO, sem botões)', !!data.C.inspected && data.C.inspected.owner === data.setup.foeId && /INIMIGO|ENEMY/i.test(data.C.title) && data.C.actionButtons === 0 && data.C.selectedUnits === 0, `${data.C.title} | ${data.C.hp}`);
  const cardC = await cardShot('cardC.png');

  // some quando sai da visão: cancela as revelações temporárias e espera a névoa recalcular
  await page.evaluate(() => { window.game.gameManager.fogOfWar._timedReveals.forEach((t) => { t.ttl = 0; }); window.game.gameManager.fogOfWar.grid.needsUpdate = true; });
  await page.waitForTimeout(1500);
  data.Cgone = await state();
  check('a inspeção some quando a unidade sai da visão', data.Cgone.inspected === null && data.Cgone.cardDisplay === 'none', JSON.stringify({ i: data.Cgone.inspected, card: data.Cgone.cardDisplay }));

  // ---------------------------------------------------------------- 5. com unidades próprias selecionadas, o clique no neutro ATACA
  await page.evaluate(({ x, z }) => {
    const gm = window.game.gameManager;
    gm.fogOfWar.revealArea(x, z, 26, 600);
    const k = gm.spawnUnit('knight', x - 16, z + 16, gm.localPlayerId);
    gm.selectSingle(k);
    window.__issued.length = 0;
    window.__knight = k.id;
  }, data.setup.camp);
  await cam(page, data.setup.camp.x, 1.5, data.setup.camp.z, 0.7, Math.PI / 4, 2000);
  const gp = await page.evaluate((id) => { const u = window.game.gameManager.entitiesById.get(id); return u && !u.isDead ? { x: u.mesh.position.x, y: u.mesh.position.y, z: u.mesh.position.z } : null; }, data.setup.guards[0].id);
  if (gp) {
    await click(gp.x, gp.y + 1.0, gp.z);
    data.D = await state();
    check('com unidade própria selecionada, o clique no neutro dá ATAQUE (não vira inspeção)', data.D.inspected === null && data.D.issued.includes('attack'), JSON.stringify({ i: data.D.inspected, issued: data.D.issued }));
  }
  await page.evaluate(() => { const gm = window.game.gameManager; const k = gm.entitiesById.get(window.__knight); if (k) { k.stop(); k.takeDamage(1e6); } });

  // ---------------------------------------------------------------- 6. PNGs
  montage(`${ITEM}-1-cards.png`, [
    { file: cardA, label: 'A: bandido neutro (clique real)' },
    { file: cardB, label: 'B: Acampamento Bandido (construcao neutra)' },
    { file: cardC, label: 'C: unidade inimiga visivel' }
  ], { cols: 1, panelW: 640 });
  montage(`${ITEM}-2-cena.png`, [{ file: pageA, label: 'A: cena + HUD com o bandido inspecionado (anel e card)' }], { cols: 1, panelW: 800 });

  check('sem erros de console', S.errors.length === 0, S.errors.slice(0, 3).join(' / '));
} catch (e) {
  console.error('ERRO no cenário:', e);
  S.errors.push('script: ' + e.message);
} finally {
  await S.close();
}
code = finish(ITEM, data, S.errors, S.warnings);
process.exitCode = code;
