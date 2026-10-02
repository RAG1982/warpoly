#!/usr/bin/env node
// F6-02 · capturas e checagens da tela de Escaramuça. Uso:
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/f6/capture-skirmish.mjs
import { OUT, SIZES, URL_BASE, startVite, withPage } from './lib.mjs';

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); };

const openSkirmish = async (page) => {
  await page.goto(`${URL_BASE}/?texq=low`, { waitUntil: 'load' });
  await page.waitForSelector('#main-menu.mm-ready');
  await page.click('[data-action="new-game"]');
  await page.waitForSelector('#mm-skirmish:not([hidden])');
};
const previewPixels = (page) => page.evaluate(async () => {
  const pv = window.warpoly.menu.preview;
  if (!pv) return -1;
  const t0 = performance.now();
  while (!pv.hasModel && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 400));
  const c = document.getElementById('mm-preview-canvas');
  const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
  const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
  const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return n;
});

const vite = await startVite();
try {
  for (const s of SIZES) {
    await withPage({ width: s.w, height: s.h }, async (page, errors) => {
      await openSkirmish(page);
      const px = await previewPixels(page);
      check(`${s.name}: prévia 3D (humano) renderiza pixels`, px > 2000, `px=${px}`);
      await page.screenshot({ path: `${OUT}/skirmish-1v1-${s.name}.png` });
      // mapa de 4 jogadores + 3 IAs
      await page.click('label.mm-map-card:has(input[value="ilhas-4p"])');
      await page.click('[data-action="add-ai"]'); await page.click('[data-action="add-ai"]');
      await page.waitForTimeout(150);
      check(`${s.name}: 3 IAs no mapa de 4 jogadores; botão adicionar desabilita`, (await page.locator('.mm-player').count()) === 4 && await page.locator('#mm-sk-add-ai').isDisabled());
      await page.click('label.mm-faction--orc');
      const px2 = await previewPixels(page);
      check(`${s.name}: prévia 3D (orc) renderiza pixels`, px2 > 2000, `px=${px2}`);
      await page.screenshot({ path: `${OUT}/skirmish-4p-${s.name}.png` });
      const overflow = await page.evaluate(() => { const p = document.querySelector('.mm-panel--skirmish .mm-panel__scroll'); return p.scrollWidth > p.clientWidth + 1; });
      check(`${s.name}: sem overflow horizontal`, !overflow);
      check(`${s.name}: sem erros de console`, errors.length === 0, errors.join(' | '));
    });
  }

  // Fluxo completo: configura e inicia
  await withPage({ width: 1280, height: 720 }, async (page, errors) => {
    await openSkirmish(page);
    await page.click('label.mm-faction--orc');
    await page.click('label.mm-map-card:has(input[value="ilhas-4p"])');
    await page.click('[data-action="add-ai"]'); await page.click('[data-action="add-ai"]');
    // dificuldades: IA1 fácil, IA2 difícil, IA3 brutal
    const diffs = page.locator('select[data-sk="ai-diff"]');
    await diffs.nth(0).selectOption('easy'); await diffs.nth(1).selectOption('hard'); await diffs.nth(2).selectOption('brutal');
    // facções: IA1 orc, IA2 humano, IA3 aleatória
    const facs = page.locator('select[data-sk="ai-faction"]');
    await facs.nth(0).selectOption('orc'); await facs.nth(1).selectOption('human'); await facs.nth(2).selectOption('random');
    // times: você=1 e IA1=1 (aliados); IA2=3; IA3=4
    const teams = page.locator('select[data-sk="team"]');
    await teams.nth(0).selectOption('0'); await teams.nth(1).selectOption('0'); await teams.nth(2).selectOption('2'); await teams.nth(3).selectOption('3');
    // cor do jogador = amarelo (4ª); recursos Muitos; vitória regicídio; seed texto
    await page.click('.mm-player--you .mm-swatch[data-color="3"]');
    await page.click('label.mm-seg:has(input[value="high"])');
    await page.click('label.mm-seg:has(input[value="regicide"])');
    await page.fill('#mm-seed', 'valedosreis');
    await page.screenshot({ path: `${OUT}/skirmish-configurada-1280x720.png` });
    // todos no mesmo time → erro e Iniciar desabilitado
    await teams.nth(2).selectOption('0'); await teams.nth(3).selectOption('0');
    check('todos no mesmo time: aviso e Iniciar desabilitado', (await page.textContent('#mm-sk-error')).includes('dois times') && await page.locator('.mm-btn--start').isDisabled());
    await page.screenshot({ path: `${OUT}/skirmish-erro-times-1280x720.png` });
    await teams.nth(2).selectOption('2'); await teams.nth(3).selectOption('3');
    // persistência: recarrega o menu e confere
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#main-menu.mm-ready');
    await page.click('[data-action="new-game"]');
    const kept = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('warpoly.skirmish')); return [s.mapId, s.localFaction, s.ai.length, s.resources, s.victoryMode, s.seed, s.ai[2].difficulty]; });
    check('setup persistido e restaurado', JSON.stringify(kept) === JSON.stringify(['ilhas-4p', 'orc', 3, 'high', 'regicide', 'valedosreis', 'brutal']), JSON.stringify(kept));
    await page.click('.mm-btn--start');
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const cfg = gm.matchConfig;
      const players = cfg.players.map((p) => { const pl = gm.getPlayer(p.id); return { id: p.id, f: pl.factionId, team: pl.team, color: pl.color, ai: pl.isAI, diff: p.difficulty, slot: p.startSlot, res: { ...pl.resources } }; });
      return { map: cfg.mapId, seed: cfg.seed, victory: cfg.victoryMode, startingResources: cfg.startingResources, players, mapDef: gm.terrain.mapDef.id, localRes: { ...gm.localPlayer.resources } };
    });
    console.log(JSON.stringify(info));
    check('partida iniciada no mapa e com 4 jogadores', info.mapDef === 'ilhas-4p' && info.players.length === 4);
    check('times escolhidos aplicados (0,0,2,3)', info.players.map((p) => p.team).join() === '0,0,2,3');
    check('dificuldades (easy,hard,brutal) por IA', info.players.slice(1).map((p) => p.diff).join() === 'easy,hard,brutal');
    check('facção local orc; IA2 humana', info.players[0].f === 'orc' && info.players[2].f === 'human');
    check('cor escolhida (amarelo) aplicada ao jogador', info.players[0].color === '#eab308');
    check('vitória regicídio + seed por texto', info.victory === 'regicide' && Number.isInteger(info.seed) && info.seed > 0);
    check('recursos iniciais "Muitos" (2×) no jogador local', info.startingResources.gold === 400 && info.players.every((p) => p.res.gold === 400 && p.res.wood === 480 && p.res.stone === 240), JSON.stringify(info.players[0].res));
    check('sem erros de console no fluxo', errors.length === 0, errors.join(' | '));
  });
} finally {
  await vite.close().catch(() => {});
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checagens OK`);
process.exit(failed.length ? 1 : 0);
