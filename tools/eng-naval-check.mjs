#!/usr/bin/env node
/**
 * ENG-NAVAL: verificação no jogo REAL (GPU, render + HUD + entrada) do transporte, do combate naval e do petróleo.
 * Rodar: bash tools/safe-run.sh --timeout 420 -- node tools/eng-naval-check.mjs [--faction human|orc] [--only transport|combat|oil]
 * Capturas em tools/ui-captures/ENG-NAVAL/.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5233;
const OUT = 'tools/ui-captures/ENG-NAVAL';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const factions = arg('--faction') ? [arg('--faction')] : ['human', 'orc'];
const only = arg('--only', 'all');
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
});
let fail = false;
const log = (...a) => console.log(...a);
try {
  for (const faction of factions) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await assertHardwareGpu(page);
    await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=estreito-1v1&faction=${faction}`, { waitUntil: 'load' });
    await page.waitForFunction('!!(window.game && window.game.gameManager && window.game.gameManager.buildings && window.game.gameManager.buildings.length)', null, { timeout: 90000 });
    await page.waitForTimeout(2500);
    const cam = async (x, z, zoom = 0.4) => {
      await page.evaluate(([x, z, zoom]) => { const sm = window.game.sceneManager; sm.cameraTarget.set(x, 0, z); if (sm.targetZoomLevel !== undefined) sm.targetZoomLevel = zoom; }, [x, z, zoom]);
      await page.waitForTimeout(1200);
    };
    const shot = async (name) => { await page.screenshot({ path: `${OUT}/${faction}-${name}.png` }); };
    // projeta uma posição de mundo para a tela (para cliques reais)
    const toScreen = (x, z, y = 0) => page.evaluate(([x, z, y]) => {
      const sm = window.game.sceneManager; const V = sm.camera.position.constructor; const v = new V(x, y, z); v.project(sm.camera);
      const r = sm.renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    }, [x, z, y]);
    const side = await page.evaluate(() => { const hq = window.game.gameManager.buildings.find((b) => b.ownerId === 0 && ['castle', 'great_hall'].includes(b.type)); return hq.mesh.position.x < 0 ? -1 : 1; });
    const sx = side;
    const man = faction === 'orc' ? 'grunt' : 'knight';
    const foeShip = faction === 'orc' ? 'frigate' : 'war_galley';
    const myShip = faction === 'orc' ? 'war_galley' : 'frigate';
    const ev = (fn, arg) => page.evaluate(fn, arg);

    if (only === 'all' || only === 'transport') {
      // ---- transporte: embarca (clique direito real) na margem do jogador, atravessa o canal e desembarca na margem oposta (clique direito real em terra)
      const ids = await ev(([sx, man]) => {
        const gm = window.game.gameManager;
        const barge = gm.spawnUnit('barge', sx * 14, -20, 0);
        const men = [];
        for (let i = 0; i < 6; i++) men.push(gm.spawnUnit(man, sx * 17.5, -18 - i * 0.8, 0).id);
        return { barge: barge.id, men };
      }, [sx, man]);
      await cam(sx * 14, -20, 0.3);
      await shot('1-transport-antes');
      // seleciona as tropas por caixa de arrasto? usa selectSingle/ctrl: seleciona via API e dá o clique direito real na barcaça
      await ev((ids) => { const gm = window.game.gameManager; gm.clearSelection(); gm.selectedUnits = ids.men.map((i) => gm.entitiesById.get(i)); gm.selectedUnits.forEach((u) => u.setSelected(true)); }, ids);
      await page.waitForTimeout(300);
      const bs = await ev((id) => { const b = window.game.gameManager.entitiesById.get(id); return [b.mesh.position.x, b.mesh.position.z]; }, ids.barge);
      const p = await toScreen(bs[0], bs[1], 1);
      await page.mouse.click(p.x, p.y, { button: 'right' });
      await page.waitForTimeout(1500); await shot('2-transport-embarcando');
      await page.waitForTimeout(8000);
      const cargo = await ev((id) => window.game.gameManager.entitiesById.get(id).cargo.length, ids.barge);
      log(faction, 'carga após clique direito:', cargo);
      if (cargo !== 6) { fail = true; log(faction, 'FALHA: carga != 6'); }
      // seleciona a barcaça (clique esquerdo real) e mostra o HUD
      const bp = await ev((id) => { const b = window.game.gameManager.entitiesById.get(id); return [b.mesh.position.x, b.mesh.position.z]; }, ids.barge);
      const q = await toScreen(bp[0], bp[1], 1);
      await page.mouse.click(q.x, q.y);
      await page.waitForTimeout(700); await shot('3-transport-barcaca-selecionada-hud');
      const hud = await page.evaluate(() => document.body.innerText.match(/(Carga|Cargo)[^\n]*\n?[^\n]*/g));
      log(faction, 'HUD carga:', JSON.stringify(hud));
      // clique direito real na margem oposta (terra) → desembarque
      const target = { x: -sx * 17.5, z: -20 };
      await cam(0, -20, 0.55);
      const tp = await toScreen(target.x, target.z, 1);
      await page.mouse.click(tp.x, tp.y, { button: 'right' });
      await page.waitForTimeout(3500); await shot('4-transport-navegando');
      await page.waitForTimeout(9000); await shot('5-transport-desembarcando');
      await page.waitForTimeout(4000);
      const after = await ev((ids) => { const gm = window.game.gameManager; const b = gm.entitiesById.get(ids.barge); return { cargo: b.cargo.length, bx: b.mesh.position.x, men: ids.men.map((i) => { const u = gm.entitiesById.get(i); return [u.transportedBy, Math.round(u.mesh.position.x), Math.round(u.mesh.position.z), u.mesh.visible]; }) }; }, ids);
      log(faction, 'após desembarque:', JSON.stringify(after));
      if (after.cargo !== 0) { fail = true; log(faction, 'FALHA: ainda há carga'); }
      await cam(-sx * 17, -20, 0.3); await shot('6-transport-desembarcado');
    }

    if (only === 'all' || only === 'combat') {
      const ids = await ev(([myShip, foeShip]) => {
        const gm = window.game.gameManager;
        const a = gm.spawnUnit(myShip, -2, 20, 0); const b = gm.spawnUnit(myShip, -2, 26, 0);
        const e = gm.spawnUnit(foeShip, 14, 23, 1);
        return { mine: [a.id, b.id], foe: e.id };
      }, [myShip, foeShip]);
      await cam(4, 23, 0.4); await shot('7-combate-antes');
      await ev((ids) => { const gm = window.game.gameManager; gm.issue({ type: 'attack', playerId: 0, unitIds: ids.mine, targetId: ids.foe }); }, ids);
      await page.waitForTimeout(3500); await shot('8-combate-aproximando');
      await page.waitForTimeout(3500); await shot('9-combate-tiros');
      await page.waitForTimeout(7000); await shot('10-combate-afundando');
      await page.waitForTimeout(5000); await shot('11-combate-depois');
      const st = await ev((ids) => { const gm = window.game.gameManager; const e = gm.entitiesById.get(ids.foe); return { foeDead: !e || e.isDead, mine: ids.mine.map((i) => { const u = gm.entitiesById.get(i); return u ? u.hp : null; }) }; }, ids);
      log(faction, 'combate:', JSON.stringify(st));
      if (!st.foeDead) { fail = true; log(faction, 'FALHA: alvo não afundou'); }
    }


    if (only === 'all' || only === 'oil') {
      const info = await ev(() => {
        const gm = window.game.gameManager; const me = gm.getPlayer(0);
        const hq = gm.buildings.find((b) => b.ownerId === 0 && ['castle', 'great_hall'].includes(b.type)); hq.tier = 2;
        Object.assign(me.resources, { gold: 5000, wood: 5000, stone: 2000, oil: 0 });
        const F = me.factionId; const side = hq.mesh.position.x < 0 ? -1 : 1;
        const well = gm.resourceDeposits.filter((d) => d.type === 'oil').sort((a, b) => Math.hypot(a.mesh.position.x - hq.mesh.position.x, a.mesh.position.z - hq.mesh.position.z) - Math.hypot(b.mesh.position.x - hq.mesh.position.x, b.mesh.position.z - hq.mesh.position.z))[0];
        const spots = (type) => { const o = []; for (let x = side * 12; Math.abs(x) <= 56; x += side) for (let z = -44; z <= 44; z++) if (gm.canPlaceBuilding(type, x, z, 0)) o.push({ x, z }); return o.sort((a, b) => Math.hypot(a.x - well.mesh.position.x, a.z - well.mesh.position.z) - Math.hypot(b.x - well.mesh.position.x, b.z - well.mesh.position.z)); };
        const bar = F === 'orc' ? 'orc_barracks' : 'barracks'; const ys = F === 'orc' ? 'ship_dock' : 'shipyard'; const rf = F === 'orc' ? 'ash_cauldron' : 'refinery';
        const b0 = gm.createBuilding(bar, side * 30, 10, true, 0); gm.buildings.push(b0);
        const y = spots(ys)[0]; const yard = gm.createBuilding(ys, y.x, y.z, true, 0); gm.buildings.push(yard);
        const r = spots(rf).find((s) => Math.hypot(s.x - y.x, s.z - y.z) > 9); const ref = gm.createBuilding(rf, r.x, r.z, true, 0); gm.buildings.push(ref);
        gm.issue({ type: 'train', playerId: 0, buildingId: yard.id, unitType: 'tanker' });
        return { well: { x: well.mesh.position.x, z: well.mesh.position.z, id: well.id }, yard: y, ref: r };
      });
      await cam(info.well.x, info.well.z, 0.5);
      await page.waitForTimeout(14000);
      const tid = await ev(() => { const t = window.game.gameManager.allUnits.find((u) => u.type === 'tanker' && u.ownerId === 0); return t ? t.id : null; });
      log(faction, 'petroleiro treinado:', tid);
      if (tid === null) { fail = true; }
      else {
        await ev(([tid, w]) => window.game.gameManager.issue({ type: 'placeBuilding', playerId: 0, buildingType: 'oil_platform', x: w.x, z: w.z, unitIds: [tid] }), [tid, info.well]);
        await page.waitForTimeout(20000); await shot('12-petroleo-plataforma');
        await ev(([tid, w]) => window.game.gameManager.issue({ type: 'gather', playerId: 0, unitIds: [tid], targetId: w.id }), [tid, info.well]);
        await page.waitForTimeout(12000); await shot('13-petroleo-coletando');
        await cam(info.ref.x, info.ref.z, 0.5);
        await page.waitForTimeout(10000); await shot('14-petroleo-refinaria');
        const oil = await ev(() => window.game.gameManager.getPlayer(0).resources.oil);
        log(faction, 'petróleo na conta:', oil);
        if (!(oil > 0)) fail = true;
        await cam(info.well.x, info.well.z, 0.9); await shot('15-petroleo-hud-mapa');
      }
    }

    log(faction, 'erros de página/console:', errors.length, errors.slice(0, 5));
    if (errors.length) fail = true;
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(fail ? 1 : 0);
