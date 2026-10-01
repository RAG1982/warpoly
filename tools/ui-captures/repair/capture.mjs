#!/usr/bin/env node
/** NEW-28 — QA reparo (2 aldeões numa torre) e cancelar obra. bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/repair/capture.mjs (Vite 5231) */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, shutdown } from '../qa-common.mjs';
const OUT = path.dirname(fileURLToPath(import.meta.url));
let ctx;
try {
  ctx = await boot(5231);
  const { page, errors } = ctx;
  const j = async (label, fn, arg) => { const r = await page.evaluate(fn, arg); console.log(label, JSON.stringify(r)); return r; };
  await page.evaluate(() => {
    const gm = window.game.gameManager; const id = gm.localPlayerId; const P = gm.getPlayer(id);
    const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
    window.__w = { id, P, bx: hq.mesh.position.x + 12, bz: hq.mesh.position.z + 14 };
    window.__res = () => ({ ...P.resources });
    P.resources.wood = 1000; P.resources.stone = 1000; P.resources.gold = 1000;
    window.__vill = gm.allUnits.filter(u => u.ownerId === id && u.type === 'villager' && !u.isDead);
    gm.sceneManager.cameraTarget.set(window.__w.bx, 1, window.__w.bz);
  });
  await j('villagers', () => window.__vill.length);
  // ---- Cancelar obra (via UI) ----
  const r0 = await j('recursos antes', () => window.__res());
  const placed = await j('placeBuilding', () => {
    const gm = window.game.gameManager; const w = window.__w;
    const b = gm.placeBuilding('watchtower', w.bx, w.bz, [window.__vill[0].id], w.id);
    window.__cancelB = b ? b.id : null; return { ok: !!b, hp: b && b.hp, max: b && b.maxHp, constructed: b && b.isConstructed };
  });
  await page.waitForTimeout(2500);
  const rDed = await j('recursos apos colocar', () => window.__res());
  await j('selecionar obra', () => { const gm = window.game.gameManager; gm.selectedBuilding = null; const b = gm.getEntity(window.__cancelB); gm.selectBuilding ? gm.selectBuilding(b) : (gm.selectedBuilding = b); return { sel: !!gm.selectedBuilding, hp: b.hp, progress: b.constructionProgress, constructed: b.isConstructed }; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '1_obra_em_andamento_cancelar.png') });
  const btnVisible = await page.locator('#bld-cancel-construction-btn').isVisible();
  console.log('botao cancelar visivel:', btnVisible);
  if (btnVisible) await page.click('#bld-cancel-construction-btn');
  await page.waitForTimeout(800);
  const r1 = await j('recursos apos cancelar', () => ({ res: window.__res(), dead: window.game.gameManager.getEntity(window.__cancelB) ? window.game.gameManager.getEntity(window.__cancelB).isDead : 'removida', vstate: window.__vill[0].state }));
  await page.screenshot({ path: path.join(OUT, '2_apos_cancelar.png') });
  console.log(`esperado reembolso: wood +60 stone +30 sobre o deduzido (antes ${JSON.stringify(r0)}, deduzido ${JSON.stringify(rDed)}, final ${JSON.stringify(r1.res)})`);

  // ---- Reparo com 2 aldeões ----
  await j('constroi torre', () => {
    const gm = window.game.gameManager; const w = window.__w;
    const b = gm.placeBuilding('watchtower', w.bx + 4, w.bz, [window.__vill[0].id, window.__vill[1].id], w.id);
    window.__tower = b.id; return { ok: !!b };
  });
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => window.game.gameManager.getEntity(window.__tower).isConstructed);
    if (done) break; await page.waitForTimeout(1500);
  }
  await j('torre pronta', () => { const b = window.game.gameManager.getEntity(window.__tower); return { constructed: b.isConstructed, hp: b.hp, max: b.maxHp }; });
  await page.evaluate(() => { const b = window.game.gameManager.getEntity(window.__tower); b.hp = b.maxHp * 0.3; b.updateHealthBar(); b.updateDamageFlames && b.updateDamageFlames(); });
  await page.waitForTimeout(500);
  const rr0 = await j('recursos antes reparo', () => window.__res());
  await page.evaluate(() => { const gm = window.game.gameManager; const w = window.__w; gm.selectUnits ? gm.selectUnits([window.__vill[0], window.__vill[1]]) : null; gm.issue({ type: 'repair', playerId: w.id, unitIds: [window.__vill[0].id, window.__vill[1].id], buildingId: window.__tower }); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '3_reparando_2_aldeoes.png') });
  const mid = await j('meio do reparo', () => { const b = window.game.gameManager.getEntity(window.__tower); return { hp: Math.round(b.hp), max: b.maxHp, vill: window.__vill.slice(0, 2).map(v => ({ s: v.state, rt: v.repairTarget && v.repairTarget.id })), res: window.__res() }; });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '4_reparo_avancado.png') });
  const end = await j('fim', () => { const b = window.game.gameManager.getEntity(window.__tower); return { hp: Math.round(b.hp), max: b.maxHp, vill: window.__vill.slice(0, 2).map(v => v.state), res: window.__res() }; });
  // taxa: 2 aldeoes x 5%/0.8s
  console.log('PV por s medido (entre amostras 2s e 4s):', ((end.hp - mid.hp) / 2).toFixed(1), ' esperado 2 x 0.05 x', mid.max, '/ 0.8 =', (2 * 0.05 * mid.max / 0.8).toFixed(1));
  // 5o aldeão: limite de 4 trabalhadores por obra
  console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum');
} catch (e) { console.error('FALHA', e); process.exitCode = 1; } finally { if (ctx) await shutdown(ctx); }
