#!/usr/bin/env node
// ENG-WALL · capturas: muro até a água e Centro extra. Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/ENG-WALL/capture.mjs
import { startVite, withPage, waitGame, GAME_URL } from '../f6b/lib.mjs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const OUT = dirname(fileURLToPath(import.meta.url));
const vite = await startVite();
try {
  await withPage({ width: 1280, height: 720 }, async (page, errors) => {
    await page.goto(GAME_URL, { waitUntil: 'load' });
    await waitGame(page);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      gm.fogOfWar.setEnabled(false);
      // acha uma praia: ponto de terra (h>=0.8) com água (h<0.65) a 1–5 u numa direção cardeal, sem construções por perto
      const T = gm.terrain;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = null;
      for (let x = -60; x <= 60 && !best; x += 2) for (let z = -60; z <= 60 && !best; z += 2) {
        if (T.getHeight(x, z) < 1.2 || T.getHeight(x, z) > 2.6) continue;
        for (const [dx, dz] of dirs) {
          for (let d = 1; d <= 6; d += 0.5) {
            if (T.getHeight(x + dx * d, z + dz * d) < 0.6) {
              // linha de muro perpendicular à direção da água, 6 pontos para cada lado
              const px = -dz, pz = dx;
              const okLine = [-3, -2, -1, 0, 1, 2, 3].every((k) => T.getHeight(x + px * k * 2.4, z + pz * k * 2.4) > 0.8);
              if (okLine) { best = { x, z, dx, dz, px, pz }; }
              break;
            }
          }
          if (best) break;
        }
      }
      return best;
    });
    console.log('praia', JSON.stringify(info));
    if (info) {
      const r = await page.evaluate((info) => {
        const gm = window.game.gameManager;
        const T = gm.terrain;
        const placed = []; gm.trees.forEach((t) => { if (Math.hypot(t.mesh.position.x - info.x, t.mesh.position.z - info.z) < 16) { t.woodRemaining = 0; t.mesh.visible = false; } });
        // desliza o ponto ao longo da direção da água até o limite da regra
        let { x, z } = info;
        for (let k = 0; k < 40; k++) { if (!gm.canPlaceBuilding('wall_human', x + info.dx * 0.3, z + info.dz * 0.3, null, 0)) break; x += info.dx * 0.3; z += info.dz * 0.3; }
        for (let k = -6; k <= 6; k++) {
          const wx = x + info.px * k * 2.4, wz = z + info.pz * k * 2.4;
          if (gm.canPlaceBuilding('wall_human', wx, wz, null, 0)) { const w = gm.createBuilding('wall_human', wx, wz, true, 0); gm.buildings.push(w); placed.push([wx, wz]); }
        }
        const sm = window.game.sceneManager;
        sm.cameraTarget.set(x, T.getHeight(x, z), z); sm.targetZoomLevel = 0.4;
        // unidade pequena e larga tentando passar entre o muro e a água
        const pf = gm.pathfinder;
        const a = { x: x + info.px * -14, z: z + info.pz * -14 }, b = { x: x + info.px * 14, z: z + info.pz * 14 };
        return { x, z, n: placed.length, small: !!pf.findPath(a.x, a.z, b.x, b.z, false).noPath, wide: !!pf.findPath(a.x, a.z, b.x, b.z, true).noPath };
      }, info);
      console.log('muro', JSON.stringify(r));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: OUT + '/muro-agua.png' });
    }
    // Centro extra: menu do aldeão + construção
    const hq = await page.evaluate(() => {
      const gm = window.game.gameManager;
      Object.assign(gm.getPlayer(0).resources, { gold: 5000, wood: 5000, stone: 5000 });
      const first = gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq');
      const v = gm.getUnitsOf(0).filter((u) => u.type === 'villager' || u.type === 'peon');
      gm.selectedUnits.length = 0; gm.selectedUnits.push(v[0]);
      window.game.uiManager?.updateSelection?.();
      const p = first.mesh.position;
      let spot = null;
      for (let r = 24; r < 60 && !spot; r += 3) for (let a = 0; a < 24 && !spot; a++) {
        const x = p.x + Math.cos(a / 24 * 6.283) * r, z = p.z + Math.sin(a / 24 * 6.283) * r;
        if (gm.canPlaceBuilding(first.type, x, z, null, 0)) spot = { x, z };
      }
      gm.issue({ type: 'placeBuilding', playerId: 0, buildingType: first.type, x: spot.x, z: spot.z, unitIds: v.slice(0, 3).map((u) => u.id) });
      window.game.sceneManager.cameraTarget.set(spot.x, 0, spot.z); window.game.sceneManager.targetZoomLevel = 0.6;
      return spot;
    });
    console.log('centro extra em', JSON.stringify(hq));
    await page.waitForTimeout(6000);
    await page.screenshot({ path: OUT + '/centro-obra.png' });
    await page.evaluate(() => { const gm = window.game.gameManager; gm.buildings.filter((b) => b.role === 'hq' && !b.isConstructed).forEach((b) => b.construct(100, gm)); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '/centro-pronto.png' });
    // menu de construção do aldeão (hint do botão do Centro)
    const btn = await page.$('[data-build="castle"], [data-build="great_hall"]');
    if (btn) { await btn.hover(); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/menu-hint.png' }); } else console.log('botão do Centro não encontrado');
    console.log('erros', JSON.stringify(errors.slice(0, 5)));
  });
} finally {
  await vite.close();
}
