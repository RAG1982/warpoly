#!/usr/bin/env node
// F6-06 · checagens e capturas de cursores contextuais e contorno sob o mouse. Uso:
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/f6b/capture-cursors.mjs
import { OUT, SIZES, GAME_URL, startVite, withPage, waitGame } from './lib.mjs';

const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); if (!ok) process.exitCode = 1; };

/** Leva a câmera à entidade e devolve a posição de tela (px) do seu centro. */
const focus = async (page, id) => {
  await page.evaluate((id) => {
    const g = window.game, gm = g.gameManager, sm = g.sceneManager;
    const e = gm.getEntity(id);
    const p = e.mesh ? e.mesh.position : e.position;
    sm.cameraTarget.set(p.x, p.y, p.z);
  }, id);
  await page.waitForTimeout(800);
  return page.evaluate((id) => {
  const g = window.game, gm = g.gameManager, sm = g.sceneManager;
  const e = gm.getEntity(id);
  const p = e.mesh ? e.mesh.position : e.position;
  const v = new sm.camera.position.constructor(p.x, p.y + 1.5, p.z); v.project(sm.camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }, id);
};
const hoverEntity = async (page, id) => {
  await page.mouse.move(90, 300); await page.waitForTimeout(80);
  const s = await focus(page, id);
  await page.waitForTimeout(150);
  await page.mouse.move(s.x - 30, s.y - 30); await page.mouse.move(s.x, s.y, { steps: 3 });
  await page.waitForTimeout(250);
  return s;
};
const state = (page) => page.evaluate(async () => {
  const { CURSOR_STYLES } = await import('/src/ui/cursors.js');
  const im = window.game.inputManager || window.game.session.inputManager;
  const css = im.sm.renderer.domElement.style.cursor;
  const kind = css === '' ? 'default' : (Object.entries(CURSOR_STYLES).find(([, v]) => v === css) || ['crosshair'])[0];
  return { kind, css: css.slice(0, 30), outline: im.hoverOutline.visible, overUi: im._overUi, mouse: im.currentMousePos, sel: window.game.gameManager.selectedUnits.length, hovered: im.hoveredEntity ? (im.hoveredEntity.type || im.hoveredEntity.constructor.name) : null };
});
const calls = (page) => page.evaluate(async () => {
  const r = window.game.sceneManager.renderer;
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return r.info.render.calls;
});

const vite = await startVite();
try {
  for (const s of SIZES.filter((z) => !process.env.ONLY || z.name === process.env.ONLY)) {
    await withPage({ width: s.w, height: s.h }, async (page, errors) => {
      await page.goto(GAME_URL, { waitUntil: 'load' });
      await waitGame(page);
      const ids = await page.evaluate(() => {
        const gm = window.game.gameManager, loc = gm.localPlayerId;
        gm.fogOfWar.setEnabled(false);
        const worker = gm.units.find((u) => u.type === 'villager' || u.type === 'peon');
        const enemyHq = gm.buildings.find((b) => gm.isHostile(loc, b.ownerId) && b.role !== 'wall');
        const ownB = gm.buildings.find((b) => b.ownerId === loc && b.isConstructed);
        const dist = (d) => Math.min(...gm.buildings.map((b) => Math.hypot(b.mesh.position.x - d.mesh.position.x, b.mesh.position.z - d.mesh.position.z)));
        const mine = gm.resourceDeposits.filter((d) => d.resourcesRemaining > 0).sort((a, b) => dist(b) - dist(a))[0];
        gm.selectSingle(worker);
        return { worker: worker.id, enemy: enemyHq.id, own: ownB.id, mine: mine.id };
      });

      let st;
      await hoverEntity(page, ids.enemy); st = await state(page);
      check(`[${s.name}] inimigo com aldeão selecionado => cursor de atacar`, st.kind === 'attack' && st.css.startsWith('url('), JSON.stringify(st));
      check(`[${s.name}] contorno visível sobre o inimigo`, st.outline === true);
      if (s.name === '1280x720') await page.screenshot({ path: `${OUT}/contorno-inimigo-${s.name}.png` });
      await hoverEntity(page, ids.mine); st = await state(page);
      check(`[${s.name}] mina => cursor de coletar`, st.kind === 'gather', JSON.stringify(st));
      if (s.name === '1280x720') await page.screenshot({ path: `${OUT}/contorno-mina-${s.name}.png` });

      // própria: construção danificada => reparar; em obra => construir
      await page.evaluate((id) => { const b = window.game.gameManager.getEntity(id); b.__hp = b.hp; b.hp = b.maxHp - 20; }, ids.own);
      await hoverEntity(page, ids.own); st = await state(page);
      check(`[${s.name}] construção própria danificada => reparar`, st.kind === 'repair', JSON.stringify(st));
      await page.evaluate((id) => { const b = window.game.gameManager.getEntity(id); b.__c = b.isConstructed; b.isConstructed = false; }, ids.own);
      await page.mouse.move(90, 300); await hoverEntity(page, ids.own); st = await state(page);
      check(`[${s.name}] construção própria em obra => construir`, st.kind === 'build', JSON.stringify(st));
      await page.evaluate((id) => { const b = window.game.gameManager.getEntity(id); b.isConstructed = b.__c; b.hp = b.__hp; }, ids.own);

      // modo reparar sobre construção íntegra => inválido; patrulhar => alvo (spell)
      await page.evaluate(() => { const im = window.game.inputManager || window.game.session.inputManager; im.setTargetMode({ kind: 'repair' }); });
      await page.mouse.move(90, 300); await hoverEntity(page, ids.own); st = await state(page);
      check(`[${s.name}] modo reparar sobre construção íntegra => inválido`, st.kind === 'invalid', JSON.stringify(st));
      await page.evaluate(() => { const im = window.game.inputManager || window.game.session.inputManager; im.setTargetMode({ kind: 'patrol' }); });
      await page.waitForTimeout(150); st = await state(page);
      check(`[${s.name}] modo patrulhar => alvo (spell)`, st.kind === 'spell', JSON.stringify(st));
      await page.evaluate(() => { const im = window.game.inputManager || window.game.session.inputManager; im.setTargetMode(null); });

      // posicionamento: sobre o QG inimigo (inválido) e no chão livre ao lado da base (válido)
      const placing = await page.evaluate(async () => {
        const { WORKER_BUILD_LIST } = await import('/src/data/index.js');
        const im = window.game.inputManager || window.game.session.inputManager;
        const first = (WORKER_BUILD_LIST.villager || WORKER_BUILD_LIST.peon)[0]; const t = first.type || first;
        im.startPlacement(t);
        return t;
      });
      await hoverEntity(page, ids.enemy); await page.mouse.move(200, 400); await page.mouse.move(210, 410);
      await hoverEntity(page, ids.enemy); st = await state(page);
      check(`[${s.name}] posicionar ${placing} sobre o QG inimigo => inválido`, st.kind === 'invalid', JSON.stringify(st));
      await page.evaluate(() => { const im = window.game.inputManager || window.game.session.inputManager; im.cancelPlacement(); });

      // opções: contorno e cursores desligados
      await page.mouse.move(90, 300);
      await page.evaluate(async () => {
        const { QualitySettings } = await import('/src/core/QualitySettings.js');
        QualitySettings.setOverride('hoverOutline', true);
      });
      await hoverEntity(page, ids.enemy);
      // mede o custo isolando o contorno: força visível/oculto no mesmo estado de câmera
      const cost = await page.evaluate(async () => {
        const im = window.game.inputManager, r = window.game.sceneManager.renderer;
        const ho = im.hoverOutline;
        const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const keep = { show: ho.show.bind(ho), hide: ho.hide.bind(ho) };
        ho.show = (root, rel) => { keep.show(root, rel); };
        const measure = async (vis) => {
          ho.show = () => { ho.lines.visible = vis; }; ho.hide = () => { ho.lines.visible = vis; };
          await frame(); await frame();
          return r.info.render.calls;
        };
        const diffs = [];
        let on = 0, off = 0;
        for (let i = 0; i < 6; i++) { on = await measure(true); off = await measure(false); diffs.push(on - off); }
        ho.show = keep.show; ho.hide = keep.hide;
        diffs.sort((a, b) => a - b);
        return { on, off, diff: diffs[Math.floor(diffs.length / 2)] };
      });
      await page.evaluate(async () => { const { QualitySettings } = await import('/src/core/QualitySettings.js'); QualitySettings.setOverride('hoverOutline', false); });
      await page.waitForTimeout(250);
      st = await state(page);
      check(`[${s.name}] contorno desligado nas opções => oculto`, st.outline === false, JSON.stringify(st));
      check(`[${s.name}] contorno custa <= 1 draw call`, cost.diff <= 1 && cost.diff >= 0, `mediana(ligado-desligado)=${cost.diff} (último par ${cost.on}/${cost.off})`);
      await page.evaluate(async () => { const { options } = await import('/src/ui/optionsStore.js'); options.set('contextCursors', false); });
      await page.waitForTimeout(250); st = await state(page);
      check(`[${s.name}] cursores contextuais desligados => cursor padrão`, st.kind === 'default', JSON.stringify(st));
      await page.evaluate(async () => { const { options } = await import('/src/ui/optionsStore.js'); options.reset('contextCursors'); const { QualitySettings } = await import('/src/core/QualitySettings.js'); QualitySettings.setOverride('hoverOutline', undefined); });

      // sai do inimigo: contorno some
      await page.mouse.move(90, 300); await page.mouse.move(96, 304);
      await page.waitForTimeout(250); st = await state(page);
      check(`[${s.name}] fora de qualquer entidade => sem contorno`, st.hovered === null || st.outline === false, JSON.stringify(st));
      check(`[${s.name}] sem erros de console`, errors.length === 0, errors.join(' | '));
    });
  }
} finally {
  await vite.close();
}
