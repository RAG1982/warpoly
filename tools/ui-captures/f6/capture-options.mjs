#!/usr/bin/env node
// F6-08 · capturas e checagens das Opções. Uso:
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/f6/capture-options.mjs
import { OUT, SIZES, URL_BASE, GAME_URL, startVite, withPage, waitGame } from './lib.mjs';

const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); };

const vite = await startVite();
try {
  // 1) Menu principal: abrir Opções em 3 resoluções, abas Gráficos/Controles
  for (const s of SIZES) {
    await withPage({ width: s.w, height: s.h }, async (page, errors) => {
      await page.goto(`${URL_BASE}/?texq=low`, { waitUntil: 'load' });
      await page.waitForSelector('#main-menu.mm-ready');
      await page.click('[data-action="options"]');
      await page.waitForSelector('#options-panel:not([hidden])');
      await page.waitForTimeout(300);
      for (const tab of ['graphics', 'audio', 'controls', 'interface', 'game']) {
        if (s.name !== '1280x720' && !['graphics', 'controls'].includes(tab)) continue;
        await page.click(`#op-tab-${tab}`);
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${OUT}/opcoes-${tab}-${s.name}.png` });
      }
      // sem overflow horizontal do cartão
      const overflow = await page.evaluate(() => { const c = document.querySelector('.op-card'); return c.scrollWidth > c.clientWidth + 1; });
      check(`menu ${s.name}: cartão sem overflow horizontal`, !overflow);
      check(`menu ${s.name}: sem erros de console`, errors.length === 0, errors.join(' | '));
    }, { gpu: false });
  }

  // 2) Persistência e aplicação (menu): sliders, toggles, recarregar
  await withPage({ width: 1280, height: 720 }, async (page, errors) => {
    await page.goto(`${URL_BASE}/?texq=low`, { waitUntil: 'load' });
    await page.waitForSelector('#main-menu.mm-ready');
    await page.click('[data-action="options"]');
    await page.waitForSelector('#options-panel:not([hidden])');
    // Gráficos: preset Médio, sombras off, FPS 60, textura alta
    await page.click('label.op-seg__item:has(input[name="op-preset"][value="med"])');
    await page.click('label.op-seg__item:has(input[name="op-texture"][value="high"])');
    await page.waitForSelector('.op-notice:not([hidden])');
    check('aviso "recarregar" aparece ao mudar textura', (await page.textContent('.op-notice')).includes('recarregar'));
    await page.click('.op-toggle:has(input[data-opt="shadows"])');
    await page.click('label.op-seg__item:has(input[name="op-fps"][value="60"])');
    const q = await page.evaluate(() => ({
      preset: localStorage.getItem('warpoly.quality'),
      ov: localStorage.getItem('warpoly.qualityOverrides'),
      tex: localStorage.getItem('warpoly.textureQuality')
    }));
    check('preset salvo = med', q.preset === 'med');
    const ov = JSON.parse(q.ov);
    check('overrides salvos (sombra off, textura high, FPS 60)', ov.shadows === false && ov.textureQuality === 'high' && ov.fpsCap === 60 && ov.targetFps === 60, q.ov);
    // Áudio
    await page.click('#op-tab-audio');
    await page.fill('input[data-opt="volumeMaster"]', '0.4');
    await page.fill('input[data-opt="volumeMusic"]', '0.1');
    // Controles
    await page.click('#op-tab-controls');
    await page.fill('input[data-opt="panSpeed"]', '1.5');
    await page.click('.op-toggle:has(input[data-opt="edgePan"])');
    await page.click('[data-rebind="stop"]');
    await page.keyboard.press('KeyH'); // conflito
    await page.waitForTimeout(100);
    check('conflito de tecla é recusado com aviso', (await page.textContent('.op-notice')).includes('já é usada'));
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/opcoes-controles-remapeado-1280x720.png` });
    // Interface
    await page.click('#op-tab-interface');
    await page.fill('input[data-opt="uiScale"]', '1.2');
    await page.click('label.op-seg__item:has(input[name="op-colorblind"][value="deutan"])');
    // Jogo
    await page.click('#op-tab-game');
    await page.click('label.op-seg__item:has(input[name="op-speed"][value="2"])');
    await page.click('.op-toggle:has(input[data-opt="floatingText"])');
    // Esc fecha
    await page.keyboard.press('Escape');
    check('Esc fecha as opções', await page.evaluate(() => document.getElementById('options-panel').hidden));
    const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('warpoly.'))));
    console.log('localStorage:', JSON.stringify(stored));
    check('persistência: vol/pan/edge/uiScale/cb/speed/floating/keybinds',
      stored['warpoly.volMaster'] === '0.4' && stored['warpoly.panSpeed'] === '1.5' && stored['warpoly.edgePan'] === '0' &&
      stored['warpoly.uiScale'] === '1.2' && stored['warpoly.colorblind'] === 'deutan' && stored['warpoly.defaultSpeed'] === '2' &&
      stored['warpoly.floatingText'] === '0' && stored['warpoly.keybinds'] === '{"stop":"KeyX"}');
    // Recarrega o jogo: opções aplicadas
    await page.goto(GAME_URL, { waitUntil: 'load' });
    await waitGame(page);
    const applied = await page.evaluate(() => ({
      speed: window.game.gameManager.gameSpeed,
      scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),
      cb: document.documentElement.dataset.colorblind,
      sfx: window.game.sound.sfxVolume, music: window.game.sound.musicVolume,
      shadows: window.game.sceneManager.renderer.shadowMap.enabled,
      fpsCap: window.game.sceneManager.quality.current.fpsCap
    }));
    console.log('aplicado:', JSON.stringify(applied));
    check('após recarregar: velocidade 2×', applied.speed === 2);
    check('após recarregar: --ui-scale com ×1,2', Math.abs(parseFloat(applied.scale) - Math.min(1.5, Math.max(0.75, Math.min(1280 / 1920, 720 / 1080) * 1.2))) < 1e-6);
    check('após recarregar: daltônico + volumes (geral×canal) + sombras off + cap 60',
      applied.cb === 'deutan' && Math.abs(applied.sfx - 0.5 * 0.4) < 1e-6 && Math.abs(applied.music - 0.1 * 0.4) < 1e-6 && applied.shadows === false && applied.fpsCap === 60);
    // Remapeamento no jogo: X = parar, S não
    const stopTest = await page.evaluate(async () => {
      const gm = window.game.gameManager;
      const u = gm.units.find((x) => x.ownerId === gm.localPlayerId && !x.isDead && x.type !== 'worker') || gm.units.find((x) => x.ownerId === gm.localPlayerId);
      gm.selectSingle(u);
      let calls = [];
      const im = window.game.inputManager;
      const orig = im._orderAction.bind(im);
      im._orderAction = (o) => { calls.push(o); orig(o); };
      const fire = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      fire('KeyS'); fire('KeyX');
      return calls;
    });
    check('remapeamento no jogo: X executa "stop", S não', stopTest.length === 1 && stopTest[0] === 'stop', JSON.stringify(stopTest));
    // Engrenagem abre o painel; Esc fecha só o painel (não pausa)
    await page.click('#btn-config');
    await page.waitForSelector('#options-panel:not([hidden])');
    await page.click('#op-tab-graphics');
    await page.screenshot({ path: `${OUT}/opcoes-jogo-engrenagem-1280x720.png` });
    await page.keyboard.press('Escape');
    check('engrenagem: Esc fecha opções e NÃO pausa', await page.evaluate(() => document.getElementById('options-panel').hidden && window.warpoly.fsm.state === 'InGame'));
    check('jogo: sem erros de console', errors.length === 0, errors.join(' | '));
    // Restaurar padrão (controles)
    await page.click('#btn-config');
    await page.click('#op-tab-controls');
    await page.click('[data-op="reset"]');
    const afterReset = await page.evaluate(() => [localStorage.getItem('warpoly.keybinds'), localStorage.getItem('warpoly.panSpeed')]);
    check('restaurar padrão (controles) limpa teclas e rolagem', afterReset[0] === null && afterReset[1] === null);
  });
} finally {
  await vite.close().catch(() => {});
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checagens OK`);
process.exit(failed.length ? 1 : 0);
