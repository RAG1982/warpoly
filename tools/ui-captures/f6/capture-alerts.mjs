#!/usr/bin/env node
// F6-05 · capturas e checagens dos alertas. Uso:
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/f6/capture-alerts.mjs
import { OUT, SIZES, GAME_URL, startVite, withPage, waitGame } from './lib.mjs';

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); };
const banner = (page) => page.evaluate(() => { const b = document.getElementById('notification-box'); return { text: b.innerText, sev: b.dataset.severity, op: b.style.opacity }; });
const redPixels = (page) => page.evaluate(() => {
  const c = document.getElementById('minimap-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] < 90 && d[i + 2] < 80 && d[i + 3] > 200) n++;
  return n;
});

const vite = await startVite();
try {
  for (const s of SIZES) {
    await withPage({ width: s.w, height: s.h }, async (page, errors) => {
      await page.goto(GAME_URL, { waitUntil: 'load' });
      await waitGame(page);
      if (s.name === '1280x720') {
        const startBanner = await banner(page);
        check('sem banner espúrio no início da partida', startBanner.op !== '1' || startBanner.text === '', JSON.stringify(startBanner));

        // 1) cada tipo de alerta via eventos reais da simulação
        const emit = (code) => page.evaluate(code);
        const local = await page.evaluate(() => window.game.gameManager.localPlayerId);
        const hq = await page.evaluate(() => { const gm = window.game.gameManager; const b = gm.buildings.find((x) => x.ownerId === gm.localPlayerId && x.type !== 'cottage'); return { x: b.mesh.position.x, z: b.mesh.position.z }; });
        // ataque: 20 danos em 2 s no mesmo ponto -> 1 alerta
        const before = await page.evaluate(() => { window.__shown = []; const ui = window.game.uiManager; const orig = ui.showNotification.bind(ui); ui.showNotification = (m, d, s) => { window.__shown.push([m, s]); orig(m, d, s); }; return 0; });
        await page.evaluate(({ local, hq }) => { const gm = window.game.gameManager; for (let i = 0; i < 20; i++) gm.events.emit('unit_damaged', { unitId: 1, ownerId: local, pos: { x: hq.x + 30 + (i % 3), y: 0, z: hq.z + 25 }, amount: 5 }); }, { local, hq });
        await page.waitForTimeout(200);
        const att = await page.evaluate(() => window.__shown.filter((x) => x[0].includes('sob ataque')));
        check('20 danos seguidos => 1 alerta "Estamos sob ataque!" (severidade danger)', att.length === 1 && att[0][1] === 'danger', JSON.stringify(att));
        check('banner mostra o texto PT-BR', (await banner(page)).text.includes('Estamos sob ataque!'));
        await page.screenshot({ path: `${OUT}/alerta-ataque-${s.name}.png` });
        const red = await redPixels(page);
        check('ping vermelho aparece no minimapa', red > 10, `px=${red}`);
        await page.waitForTimeout(4600);
        const red2 = await redPixels(page);
        check('ping some do minimapa após 4 s', red2 < red * 0.2, `px=${red2}`);

        await page.evaluate(({ local, hq }) => { const gm = window.game.gameManager; window.__shown.length = 0;
          gm.events.emit('resource_depleted', { resourceId: 1, pos: { x: hq.x - 40, y: 0, z: hq.z + 10 }, resourceType: 'gold' });
          gm.events.emit('research_done', { ownerId: local, upgradeId: Object.keys(window.game.gameManager.getPlayer(local).researchedUpgrades || {}).length ? 'x' : 'melee_attack', level: 1, pos: { x: hq.x, y: 0, z: hq.z } });
          gm.events.emit('building_completed', { buildingId: 99999, ownerId: local, pos: { x: hq.x + 5, y: 0, z: hq.z + 5 }, buildingType: 'barracks' });
        }, { local, hq });
        await page.waitForTimeout(150);
        const texts = await page.evaluate(() => window.__shown.map((x) => x[0]));
        console.log('textos:', JSON.stringify(texts));
        check('Mina esgotada', texts.some((t) => t === '⛏️ Mina de ouro esgotada'));
        check('Pesquisa concluída', texts.some((t) => t.includes('Pesquisa concluída')));
        check('Construção concluída', texts.some((t) => t.startsWith('🏗️ Construção concluída: ')));

        // comida: UI de treino sem população
        await page.evaluate(() => {
          const gm = window.game.gameManager;
          const hqB = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && (b.type === 'castle' || b.type === 'great_hall'));
          gm.selectSingle(hqB);
        });
        await page.waitForTimeout(600);
        const food = await page.evaluate(() => {
          const gm = window.game.gameManager; window.__shown.length = 0;
          const p = gm.localPlayer; const save = p.maxPopulation; p.maxPopulation = p.population; // cheio
          const btn = document.querySelector('.bld-train-btn[data-train]');
          if (!btn) return { err: 'sem botão de treino' };
          btn.click(); btn.click();
          const out = window.__shown.map((x) => x[0]);
          p.maxPopulation = save;
          return { out };
        });
        console.log('comida:', JSON.stringify(food));
        check('Não há comida suficiente (1 banner em 2 cliques)', food.out && food.out.length === 1 && food.out[0].includes('Não há comida suficiente'), JSON.stringify(food));

        // Espaço vai ao alerta
        await page.evaluate(() => { window.game.sceneManager.cameraTarget.set(0, 0, 0); });
        await page.evaluate(({ local, hq }) => { window.game.gameManager.events.emit('unit_damaged', { unitId: 1, ownerId: local, pos: { x: hq.x + 60, y: 0, z: hq.z - 50 }, amount: 3 }); }, { local, hq });
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
        const cam = await page.evaluate(() => { const t = window.game.sceneManager.cameraTarget; return { x: t.x, z: t.z }; });
        const ring = await page.evaluate(() => window.game.uiManager.alerts.ring.map((a) => [a.kind, a.pos.x, a.pos.z]));
        console.log('cam', JSON.stringify(cam), 'ring0', JSON.stringify(ring[0]));
        check('Espaço centraliza a câmera no alerta mais novo (< 1 u)', Math.hypot(cam.x - ring[0][1], cam.z - ring[0][2]) < 1);
        await page.keyboard.press('Space');
        await page.waitForTimeout(100);
        const cam2 = await page.evaluate(() => { const t = window.game.sceneManager.cameraTarget; return { x: t.x, z: t.z }; });
        check('2º Espaço percorre o alerta anterior', Math.hypot(cam2.x - ring[1][1], cam2.z - ring[1][2]) < 1);
        await page.screenshot({ path: `${OUT}/alerta-espaco-${s.name}.png` });
      } else {
        const local = await page.evaluate(() => window.game.gameManager.localPlayerId);
        await page.evaluate((local) => { const gm = window.game.gameManager; gm.events.emit('unit_damaged', { unitId: 1, ownerId: local, pos: { x: 10, y: 0, z: 10 }, amount: 5 }); }, local);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/alerta-ataque-${s.name}.png` });
      }
      check(`${s.name}: sem erros de console`, errors.length === 0, errors.join(' | '));
    });
  }
} finally {
  await vite.close().catch(() => {});
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checagens OK`);
process.exit(failed.length ? 1 : 0);
