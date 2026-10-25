// RES-QUEUE: enfileira 3 pesquisas na Ferraria e captura a fila nos slots. Rodar via tools/safe-run.sh.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const out = path.join(here);

const vite = await createServer({ root, server: { port: 5203, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await assertHardwareGpu(page);
  await page.goto('http://127.0.0.1:5203/?skipPreload&texq=low', { waitUntil: 'load' });
  await page.waitForFunction('!!window.game', null, { timeout: 90000 });
  await page.waitForTimeout(1500);

  // Forja pronta, recursos de sobra; seleciona a Ferraria como o jogador faria.
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const p = gm.localPlayer;
    p.resources.gold = 5000; p.resources.wood = 5000; p.resources.stone = 5000;
    const hq = gm.buildings.find(b => b.ownerId === p.id && b.tier);
    const b = gm.createBuilding('forge', hq.mesh.position.x + 14, hq.mesh.position.z + 14, true, p.id);
    b.isConstructed = true;
    gm.buildings.push(b);
    gm.selectedBuilding = b; b.isSelected = true;
  });
  await page.waitForTimeout(500);

  const forgeId = await page.evaluate(() => window.game.gameManager.selectedBuilding.id);
  const enq = (id) => page.evaluate(([bid, up]) => {
    const gm = window.game.gameManager;
    gm.issue({ type: 'research', playerId: gm.localPlayerId, buildingId: bid, upgradeId: up });
  }, [forgeId, id]);
  for (const up of ['melee_weapons', 'melee_armor', 'siege_damage']) {
    if (up === 'siege_damage') {
      // Oficina necessária para siege_damage: constrói uma ao lado.
      await page.evaluate(() => {
        const gm = window.game.gameManager;
        const p = gm.localPlayer;
        const hq = gm.buildings.find(b => b.ownerId === p.id && b.tier);
        const w = gm.createBuilding('workshop', hq.mesh.position.x - 14, hq.mesh.position.z + 14, true, p.id);
        w.isConstructed = true;
        gm.buildings.push(w);
      });
      await page.waitForTimeout(300);
    }
    await enq(up);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);

  const slots = () => page.evaluate(() => [...document.querySelectorAll('#bld-queue-slots .bld-queue-slot')].map(s => ({
    cls: s.className, title: s.title, hasImg: !!s.querySelector('img, svg, canvas, span, i')
  })));
  const queued = await slots();
  console.log('slots (3 enfileiradas):', JSON.stringify(queued.slice(0, 4)));
  const queueLen = await page.evaluate((bid) => window.game.gameManager.buildings.find(b => b.id === bid).researchQueue.map(r => r.id), forgeId);
  console.log('researchQueue:', JSON.stringify(queueLen));
  const gold = await page.evaluate(() => window.game.gameManager.localPlayer.resources.gold);
  console.log('ouro após 3 enfileiradas (esperado 5000-650=4350):', gold);
  await page.screenshot({ path: path.join(out, '01-tres-na-fila.png') });

  // Espera a primeira concluir (~30 s de sim) e captura o avanço.
  await page.waitForTimeout(34000);
  const after = await page.evaluate((bid) => window.game.gameManager.buildings.find(b => b.id === bid).researchQueue.map(r => `${r.id}:${r.progress.toFixed(1)}`), forgeId);
  console.log('após ~34 s (cabeça andou, primeira concluída):', JSON.stringify(after));
  await page.screenshot({ path: path.join(out, '02-avancou.png') });

  // Cancela o slot 1 (2ª posição) pelo clique real no slot.
  const slot1 = page.locator('#bld-queue-slots .bld-queue-slot').nth(1);
  if (await slot1.count()) {
    await slot1.click({ force: true });
    await page.waitForTimeout(800);
  }
  const afterCancel = await page.evaluate((bid) => window.game.gameManager.buildings.find(b => b.id === bid).researchQueue.map(r => r.id), forgeId);
  console.log('após cancelar slot 2 pelo clique:', JSON.stringify(afterCancel));
  await page.screenshot({ path: path.join(out, '03-cancelou-slot2.png') });
  console.log('errors', errs);
} finally {
  await browser.close();
  await vite.close();
}
