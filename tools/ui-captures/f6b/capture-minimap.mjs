#!/usr/bin/env node
// F6-04 · checagens e capturas do minimapa. Uso:
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/f6b/capture-minimap.mjs
import { OUT, SIZES, GAME_URL, startVite, withPage, waitGame } from './lib.mjs';

const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); if (!ok) process.exitCode = 1; };
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Conta pixels do minimapa próximos a uma cor. */
const countColor = (page, rgb, tol = 40) => page.evaluate(({ rgb, tol }) => {
  const c = document.getElementById('minimap-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) < tol && Math.abs(d[i + 1] - rgb[1]) < tol && Math.abs(d[i + 2] - rgb[2]) < tol) n++;
  return n;
}, { rgb, tol });
const goldPixels = (page) => countColor(page, [255, 215, 0], 30);

/** Posição de tela (clientX/Y) de um ponto do mundo no minimapa. */
const mapPoint = (page, x, z) => page.evaluate(({ x, z }) => {
  const gm = window.game.gameManager;
  const c = document.getElementById('minimap-canvas');
  const r = c.getBoundingClientRect();
  const s = gm.terrain.mapDef.size;
  return { x: r.left + (x / s + 0.5) * r.width, y: r.top + (z / s + 0.5) * r.height };
}, { x, z });

const spyIssue = (page) => page.evaluate(() => {
  const gm = window.game.gameManager;
  window.__cmds = [];
  if (!gm.__orig) { gm.__orig = gm.issue.bind(gm); gm.issue = (c) => { window.__cmds.push(c); return gm.__orig(c); }; }
});

const vite = await startVite();
try {
  for (const s of SIZES) {
    await withPage({ width: s.w, height: s.h }, async (page, errors) => {
      await page.goto(GAME_URL, { waitUntil: 'load' });
      await waitGame(page);
      await spyIssue(page);

      // 1) cores de jogador
      const players = await page.evaluate(() => window.game.gameManager.playerRegistry.players.filter((p) => !p.isNeutralHostile).map((p) => ({ id: p.id, color: p.color, isLocal: p.isLocal })));
      await page.evaluate(() => { const gm = window.game.gameManager; gm.fogOfWar.setEnabled(false); }); // enxergar as cores de todos
      await page.waitForTimeout(400);
      for (const p of players.slice(0, 2)) {
        const n = await countColor(page, hexToRgb(p.color), 25);
        check(`[${s.name}] pixels da cor do jogador ${p.id} (${p.color}) no minimapa`, n > 8, `px=${n}`);
      }
      await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(true); });

      // 2) trapézio muda com a câmera
      const g1 = await goldPixels(page);
      await page.evaluate(() => { window.game.sceneManager.targetZoomLevel = 1.8; window.game.sceneManager.zoomLevel = 1.8; });
      await page.waitForTimeout(500);
      const g2 = await goldPixels(page);
      check(`[${s.name}] trapézio do frustum muda ao afastar a câmera`, Math.abs(g2 - g1) > 5, `ouro ${g1} -> ${g2}`);
      await page.evaluate(() => { window.game.sceneManager.targetZoomLevel = 1; window.game.sceneManager.zoomLevel = 1; });

      if (s.name === '1280x720') {
        // 3) ordens por clique direito no minimapa
        const info = await page.evaluate(() => {
          const gm = window.game.gameManager;
          const local = gm.localPlayerId;
          const worker = gm.units.find((u) => u.type === 'villager' || u.type === 'peon');
          const mine = gm.resourceDeposits.find((d) => d.resourcesRemaining > 0);
          const fogEnabled = gm.fogOfWar.enabled;
          return { local, workerId: worker.id, mine: { id: mine.id, x: mine.mesh.position.x, z: mine.mesh.position.z }, fogEnabled };
        });
        await page.evaluate(() => { const gm = window.game.gameManager; const w = gm.units.find((u) => u.type === 'villager' || u.type === 'peon'); gm.selectSingle(w); gm.fogOfWar.revealArea?.(0, 0, 400); });
        await page.waitForTimeout(300);
        // mover num ponto vazio (centro-esquerda)
        const target = { x: -20, z: 5 };
        let p = await mapPoint(page, target.x, target.z);
        await page.evaluate(() => { window.__cmds.length = 0; });
        await page.mouse.click(p.x, p.y, { button: 'right' });
        await page.waitForTimeout(150);
        let cmds = await page.evaluate(() => window.__cmds.slice());
        const mv = cmds.find((c) => c.type === 'move' || c.type === 'MOVE');
        check('clique direito no minimapa emite MOVE no ponto', mv && Math.hypot(mv.x - target.x, mv.z - target.z) < 2, JSON.stringify(cmds[0]));
        // coletar: sobre uma mina
        p = await mapPoint(page, info.mine.x, info.mine.z);
        await page.evaluate(() => { window.__cmds.length = 0; });
        await page.mouse.click(p.x, p.y, { button: 'right' });
        await page.waitForTimeout(150);
        cmds = await page.evaluate(() => window.__cmds.slice());
        check('clique direito sobre mina emite GATHER', cmds.some((c) => /gather/i.test(c.type) && c.targetId === info.mine.id), JSON.stringify(cmds.map((c) => c.type)));
        // atacar: unidade inimiga visível (teleporta uma para perto do jogador e a revela)
        const en = await page.evaluate(() => {
          const gm = window.game.gameManager;
          const e = gm.enemies.find((u) => !u.isDead);
          return { id: e.id, x: e.mesh.position.x, z: e.mesh.position.z };
        });
        p = await mapPoint(page, en.x, en.z);
        await page.evaluate(() => { window.__cmds.length = 0; const gm = window.game.gameManager; gm.fogOfWar.isVisible = () => true; });
        await page.mouse.click(p.x, p.y, { button: 'right' });
        await page.waitForTimeout(150);
        cmds = await page.evaluate(() => window.__cmds.slice());
        check('clique direito sobre unidade inimiga visível emite ATTACK', cmds.some((c) => /attack/i.test(c.type) && c.targetId === en.id), JSON.stringify(cmds.map((c) => [c.type, c.targetId])));
        await page.screenshot({ path: `${OUT}/minimapa-ordem-${s.name}.png`, clip: { x: 0, y: s.h - 260, width: 420, height: 260 } });
      }

      // 4) escala de UI 1,5: clique no centro leva a câmera ao centro do mapa
      await page.evaluate(() => { localStorage.setItem('warpoly.uiScale', '1.5'); });
      await page.evaluate(async () => { const m = await import('/src/ui/uiScale.js'); m.applyUiScale(); });
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => { const r = document.getElementById('minimap-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
      await page.mouse.click(c.x, c.y, { button: 'left' });
      await page.waitForTimeout(150);
      const ct = await page.evaluate(() => window.game.sceneManager.cameraTarget.toArray());
      check(`[${s.name}] com uiScale 1,5 (canvas ${Math.round(c.w)} px) o clique no centro leva a câmera ao centro`, Math.hypot(ct[0], ct[2]) < 2, JSON.stringify(ct));
      await page.screenshot({ path: `${OUT}/minimapa-${s.name}.png` });
      check(`[${s.name}] sem erros de console`, errors.length === 0, errors.join(' | '));
    });
  }
} finally {
  await vite.close();
}
