// M3-03a: verifica o "Centro evoluído" (fogos de artifício + painel) no jogo real.
// Uso (pela trava de recursos): bash /home/rafael/warpoly/tools/safe-run.sh --timeout 600 -- node tools/ui-captures/M3-03a/capture.mjs
// Força o upgrade pelo console (window.game): troca o nível do Centro local e despacha 'hq_tier_changed' pela
// fila de eventos da simulação, como a conclusão real faria. Não pausa; o painel fecha com Esc e com clique.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, shutdown } from '../qa-common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5193;
const results = {};

const ctx = await boot(PORT);
const { page } = ctx;
try {
  // Centraliza a câmera no Centro local (tecla H).
  await page.evaluate(() => window.game.inputManager.centerOnHq());
  await page.waitForTimeout(800);

  const fire = (tier) => page.evaluate((tier) => {
    const gm = window.game.gameManager;
    const hq = gm.buildings.find((b) => (b.type === 'castle' || b.type === 'great_hall') && b.ownerId === gm.localPlayerId && !b.isDead);
    const p = hq.mesh.position;
    hq.tier = tier;
    gm.events.emit('hq_tier_changed', { buildingId: hq.id, ownerId: hq.ownerId, pos: { x: p.x, y: p.y, z: p.z }, tier });
    gm.events.flush();
    return { type: hq.type, tick: gm.currentTick, paused: !!gm.isPaused };
  }, tier);

  const panelState = () => page.evaluate(() => {
    const ov = document.querySelector('[aria-labelledby="hq-tier-title"]');
    return { open: !!ov, title: ov?.querySelector('h3')?.textContent || null, list: ov ? ov.innerText.replace(/\s+/g, ' ').slice(0, 600) : null };
  });

  // --- Nível 2 (Fortaleza) ---
  results.tier2Fire = await fire(2);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(HERE, 'tier2-foguetes-0.35s.png') });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(HERE, 'tier2-fogos-0.7s.png') });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(HERE, 'tier2-fogos-1.2s.png') });
  results.tier2Panel = await panelState();
  // Não pausa: o tick da simulação precisa andar com o painel aberto.
  const t1 = await page.evaluate(() => window.game.gameManager.currentTick);
  await page.waitForTimeout(800);
  const t2 = await page.evaluate(() => window.game.gameManager.currentTick);
  results.tier2TicksWhileOpen = [t1, t2, t2 > t1];
  results.vfxStats = await page.evaluate(() => window.game.session?.vfx?.stats?.() ?? null);
  await page.screenshot({ path: path.join(HERE, 'tier2-painel.png') });

  // Esc fecha sem abrir o menu de pausa.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  results.afterEsc = { panelOpen: (await panelState()).open, pauseMenuOpen: await page.evaluate(() => !!document.querySelector('#pause-menu:not([hidden])')) };

  // --- Nível 3 (Castelo) fechado por clique ---
  results.tier3Fire = await fire(3);
  await page.waitForTimeout(900);
  results.tier3Panel = await panelState();
  await page.screenshot({ path: path.join(HERE, 'tier3-painel.png') });
  await page.locator('[role="dialog"][aria-labelledby="hq-tier-title"]').click();
  await page.waitForTimeout(300);
  results.afterClick = { panelOpen: (await panelState()).open };

  // Carregar/ler um save não dispara: a presentation muted ja cobre (verificado em código); aqui só o erro.
  results.pageErrors = ctx.errors.filter((e) => !/favicon|DevTools/i.test(e));
} finally {
  console.log(JSON.stringify(results, null, 2));
  await shutdown(ctx);
}
