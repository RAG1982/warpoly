#!/usr/bin/env node
/** F4-07b: confere navios de guerra, barcaça (LOAD/UNLOAD), submersível e Fundição no jogo. Rodar via tools/safe-run.sh. */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = 5215;
const OUT = 'tools/ui-captures/naval';
const glb = process.argv.includes('--noglb') ? '&glb=0' : '';
const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
});
let fail = false;
try {
  for (const faction of ['human', 'orc']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /glbModels/.test(m.text())) errors.push(m.text()); });
    await assertHardwareGpu(page);
    await page.goto(`http://127.0.0.1:${PORT}/?skipPreload&texq=low&play&map=estreito-1v1&faction=${faction}${glb}`, { waitUntil: 'load' });
    await page.waitForFunction('!!(window.game && window.game.gameManager && window.game.gameManager.buildings && window.game.gameManager.buildings.length)', null, { timeout: 90000 });
    await page.waitForTimeout(2500);
    const cam = async (x, z, zoom = 0.5) => {
      await page.evaluate(([x, z, zoom]) => { const sm = window.game.sceneManager; sm.cameraTarget.set(x, 0, z); if (sm.targetZoomLevel !== undefined) sm.targetZoomLevel = zoom; }, [x, z, zoom]);
      await page.waitForTimeout(1200);
    };
    const shot = async (name) => { await page.screenshot({ path: `${OUT}/${faction}-${name}${glb ? '-proc' : ''}.png` }); };
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const me = gm.getPlayer(0);
      const hq = gm.buildings.find(b => b.ownerId === 0 && ['castle', 'great_hall'].includes(b.type));
      hq.tier = 3;
      Object.assign(me.resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 });
      const side = hq.mesh.position.x < 0 ? -1 : 1; // -1 oeste, +1 leste
      const F = me.factionId;
      const spots = (type) => {
        const out = [];
        for (let x = side * 12; Math.abs(x) <= 56; x += side) for (let z = -44; z <= 44; z++) if (gm.canPlaceBuilding(type, x, z, 0)) out.push({ x, z });
        return out;
      };
      const ft = F === 'orc' ? 'naval_forge' : 'foundry';
      const ys = F === 'orc' ? 'ship_dock' : 'shipyard';
      const bar = F === 'orc' ? 'orc_barracks' : 'barracks';
      const b0 = gm.createBuilding(bar, side * 30, -side * 6, true, 0); gm.buildings.push(b0);
      const ysp = spots(ys)[0];
      const yard = gm.createBuilding(ys, ysp.x, ysp.z, true, 0); gm.buildings.push(yard);
      const fsp = spots(ft).find(s => Math.hypot(s.x - ysp.x, s.z - ysp.z) > 9);
      const foundry = gm.createBuilding(ft, fsp.x, fsp.z, true, 0); gm.buildings.push(foundry);
      const T = (f, a, b) => (F === 'orc' ? a : b); // tipos por facção do jogador 0
      const mine = { frigate: T(0, 'war_galley', 'frigate'), dread: T(0, 'iron_leviathan', 'dreadnought'), sub: T(0, 'colossal_turtle', 'submersible') };
      const foe = { frigate: F === 'orc' ? 'frigate' : 'war_galley', dread: F === 'orc' ? 'dreadnought' : 'iron_leviathan', sub: F === 'orc' ? 'submersible' : 'colossal_turtle' };
      const ids = {};
      const sx = side;
      ids.frig = [0, 1, 2].map(i => gm.spawnUnit(mine.frigate, sx * 4, -20 + sx * (i * 4 - 4), 0).id);
      ids.dread = gm.spawnUnit(mine.dread, sx * 8, -sx * 4, 0).id;
      ids.sub = gm.spawnUnit(mine.sub, sx * 6, sx * 12, 0).id;
      ids.foe = [0, 1].map(i => gm.spawnUnit(foe.frigate, -sx * 6, -20 + sx * (i * 4), 1).id);
      ids.foeSub = gm.spawnUnit(foe.sub, -sx * 4, 6, 1).id;
      ids.barge = gm.spawnUnit('barge', sx * 14, sx * 20, 0).id;
      const manType = F === 'orc' ? 'grunt' : 'knight';
      ids.men = [];
      for (let i = 0; i < 6; i++) ids.men.push(gm.spawnUnit(manType, sx * 17.5, sx * (18 + i * 0.8), 0).id);
      return { F, side, ysp, fsp, ids, mine, foe };
    });
    console.log(faction, JSON.stringify(info));
    const sx = info.side;
    // 1. foundry + estaleiro
    await cam(info.fsp.x, info.fsp.z, 0.45); await shot('foundry');
    // 2. frota parada
    await cam(sx * 5, -sx * 4 - 6, 0.55); await shot('fleet');
    // 3. barcaça: embarque
    await cam(sx * 15, sx * 20, 0.35);
    await page.evaluate((ids) => { const gm = window.game.gameManager; gm.issue({ type: 'load', playerId: 0, unitIds: ids.men, targetId: ids.barge }); }, info.ids);
    await page.waitForTimeout(1800); await shot('barge-loading');
    await page.waitForTimeout(9000);
    const loaded = await page.evaluate((ids) => { const gm = window.game.gameManager; const b = gm.entitiesById.get(ids.barge); gm.selectedUnits = [b]; b.setSelected && b.setSelected(true); return b.cargo.length; }, info.ids);
    console.log(faction, 'carga', loaded);
    await page.waitForTimeout(800); await shot('barge-loaded-hud');
    // desembarque na outra margem (frente da base inimiga mirror)
    await page.evaluate((ids) => { window.game.gameManager.issue({ type: 'unload', playerId: 0, unitId: ids.barge }); }, info.ids);
    await page.waitForTimeout(1500); await shot('barge-unloading');
    await page.waitForTimeout(3000);
    const after = await page.evaluate((ids) => { const gm = window.game.gameManager; return { cargo: gm.entitiesById.get(ids.barge).cargo.length, out: ids.men.filter(i => gm.entitiesById.get(i).transportedBy === null).length }; }, info.ids);
    console.log(faction, 'desembarque', JSON.stringify(after));
    await shot('barge-unloaded');
    // 4. batalha
    await page.evaluate((ids) => {
      const gm = window.game.gameManager;
      const alive = (i) => { const u = gm.entitiesById.get(i); return u && !u.isDead ? u : null; };
      const mine = [...ids.frig, ids.dread, ids.sub].filter(alive);
      for (const id of mine) gm.issue({ type: 'attackMove', playerId: 0, unitIds: [id], x: -gm.entitiesById.get(id).mesh.position.x, z: gm.entitiesById.get(id).mesh.position.z });
      for (const id of [...ids.foe, ids.foeSub].filter(alive)) gm.issue({ type: 'attackMove', playerId: 1, unitIds: [id], x: -gm.entitiesById.get(id).mesh.position.x, z: gm.entitiesById.get(id).mesh.position.z });
    }, info.ids);
    await cam(0, -14, 0.45);
    await page.waitForTimeout(3500); await shot('battle-1');
    await page.waitForTimeout(3500); await shot('battle-2');
    // 5. submersível revelado
    await page.evaluate((ids) => { const s = window.game.gameManager.entitiesById.get(ids.sub); s.breakInvisibility(); }, info.ids);
    const subPos = await page.evaluate((ids) => { const s = window.game.gameManager.entitiesById.get(ids.sub); return { x: s.mesh.position.x, z: s.mesh.position.z, hp: s.hp }; }, info.ids);
    await cam(subPos.x, subPos.z, 0.3); await shot('submersible');
    const res = await page.evaluate(() => { const gm = window.game.gameManager; return { tick: gm.currentTick, units: gm.allUnits.filter(u => u.layer === 'naval').length }; });
    console.log(faction, JSON.stringify(res));
    if (errors.length) { fail = true; console.error(faction, 'ERROS:', errors.slice(0, 8)); }
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}
process.exit(fail ? 1 : 0);
