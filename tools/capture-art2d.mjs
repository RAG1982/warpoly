// F7-09: verificação em navegador dos sprites 2D (ícones, retratos animáveis e artes de menu/loading).
//   bash tools/safe-run.sh --mem 6G --timeout 420 -- node tools/capture-art2d.mjs
// Saída: tools/ui-captures/art-2d/*.png + resultado.json. Sai com código 1 se houver erro de console, imagem quebrada,
// requisição /ui/ com falha, emoji de fallback na HUD normal, ou se o fallback (sem sprites) não funcionar.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5232);
const OUT = process.env.ART2D_OUT || 'tools/ui-captures/art-2d';
// Capturas da HUD recortadas no card de seleção (+ minimapa), com DPR 2 (ícones nítidos); menu/loading em JPEG 1920x1080:
// poucos MB no repositório.
const HUD_CLIP = { x: 0, y: 395, width: 640, height: 325 };
mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;
const result = { errors: [], badUi: [], scenes: {}, fallback: {} };

/** Observa erros de console/página e respostas /ui/ com falha (exceto quando `expectFailures`). */
function watch(page, expectFailures = false) {
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expectFailures && /Failed to load resource|net::ERR/i.test(m.text())) return;
    result.errors.push('console: ' + m.text());
  });
  if (!expectFailures) {
    page.on('response', (r) => { if (r.url().includes('/ui/') && r.status() >= 400) result.badUi.push(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', (r) => { if (r.url().includes('/ui/')) result.badUi.push(`falhou ${r.url()}`); });
  }
}

/** Relatório de sprites na HUD (dentro da página). */
const hudReport = () => {
  const q = (s) => [...document.querySelectorAll(s)];
  const sprites = q('#bottom-bar img[data-ui-sprite]');
  const ok = (i) => i.complete && i.naturalWidth > 0;
  const portraitImgs = q('#selection-portrait-box img').filter((i) => i.getAttribute('src'));
  return {
    sprites: sprites.length,
    spriteOk: sprites.filter(ok).length,
    legacy: sprites.filter((i) => i.getAttribute('data-ui-sprite') === '').length,
    broken: sprites.filter((i) => i.complete && i.naturalWidth === 0).length,
    emojiFallbacks: q('#bottom-bar .ui-sprite-emoji').length,
    statIcons: q('#bottom-bar img.stat-ico').filter(ok).length,
    portraitBox: (() => { const b = document.getElementById('selection-portrait-box'); return b && b.style.display !== 'none' ? { cls: b.className, srcs: portraitImgs.map((i) => i.getAttribute('src')), ok: portraitImgs.every(ok) } : null; })(),
    firstSrcs: sprites.slice(0, 4).map((i) => i.getAttribute('src'))
  };
};

async function settle(page, ms = 450) {
  await page.waitForTimeout(ms);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function shot(page, name, clip = HUD_CLIP, settleMs = 450) {
  await settle(page, settleMs);
  const rep = await page.evaluate(hudReport);
  result.scenes[name] = rep;
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  console.log(name.padEnd(30), JSON.stringify({ s: rep.sprites, ok: rep.spriteOk, legacy: rep.legacy, broken: rep.broken, emoji: rep.emojiFallbacks, portrait: rep.portraitBox && rep.portraitBox.cls }));
  return rep;
}

try {
  browser = await chromium.launch({ headless: true, args: ARGS });

  // ------------------------------------------------------------------------------------------------ HUD humana
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    watch(page);
    await assertHardwareGpu(page);
    await page.goto(`${base}/?skipPreload&texq=low&play&debug`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    // trabalhador: construir + reparar + parar
    await page.evaluate(() => { const gm = window.game.gameManager; gm.getPlayer(0).add({ gold: 2000, wood: 2000, stone: 500 }); gm.selectSingle(gm.units.find((u) => u.type === 'villager')); });
    await shot(page, '01-hud-trabalhador');

    // castelo: treinar + fila + evoluir o Centro
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && b.type === 'castle');
      gm.issue({ type: 'train', playerId: gm.localPlayerId, buildingId: hq.id, unitType: 'villager' });
      gm.issue({ type: 'train', playerId: gm.localPlayerId, buildingId: hq.id, unitType: 'villager' });
      gm.selectSingle(hq);
    });
    await shot(page, '02-hud-castelo-fila');

    // quartel e forja construídos ao lado do castelo
    const ids = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && b.type === 'castle');
      const px = hq.mesh.position.x;
      const pz = hq.mesh.position.z;
      const mk = (type, dx, dz) => { const b = gm.createBuilding(type, px + dx, pz + dz, true, 'player'); b.isConstructed = true; b.buildProgress = 100; return b.id; };
      const out = { barracks: mk('barracks', 16, 4), forge: mk('forge', 16, -10), stable: mk('stable', -16, 6), workshop: mk('workshop', -16, -10), arcane: mk('arcane_tower', 2, 18), temple: mk('temple', -14, 18) };
      return { ...out, hq: hq.id, px, pz };
    });
    await page.waitForTimeout(600);
    await page.evaluate((id) => {
      const gm = window.game.gameManager;
      const b = gm.entitiesById.get(id);
      gm.issue({ type: 'train', playerId: gm.localPlayerId, buildingId: id, unitType: 'knight' });
      gm.issue({ type: 'train', playerId: gm.localPlayerId, buildingId: id, unitType: 'archer' });
      gm.selectSingle(b);
    }, ids.barracks);
    await shot(page, '03-hud-quartel-fila');
    await page.evaluate((id) => {
      const gm = window.game.gameManager;
      gm.issue({ type: 'research', playerId: gm.localPlayerId, buildingId: id, upgradeId: 'melee_weapons' });
      gm.selectSingle(gm.entitiesById.get(id));
    }, ids.forge);
    await shot(page, '04-hud-forja-pesquisa');
    for (const [key, name] of [['arcane', '05-hud-torre-arcana'], ['stable', '06-hud-estabulo'], ['workshop', '07-hud-oficina'], ['temple', '08-hud-templo']]) {
      await page.evaluate((id) => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(id)); }, ids[key]);
      await shot(page, name);
    }

    // unidades: cavaleiro (idle e em combate), mago (magias), seleção múltipla, herói
    const u = await page.evaluate((ids) => {
      const gm = window.game.gameManager;
      const x = ids.px - 6;
      const z = ids.pz + 14;
      const knight = gm.spawnUnit('knight', x, z, 'player');
      const archer = gm.spawnUnit('archer', x + 2, z + 1, 'player');
      const mage = gm.spawnUnit('mage', x - 2, z + 1, 'player');
      const cav = gm.spawnUnit('cavalier', x + 4, z - 1, 'player');
      const hero = gm.spawnUnit('hero_brann', x - 4, z - 1, 'player');
      gm.sceneManager.cameraTarget.set(x, 0, z - 4);
      window.__ids = { knight: knight.id, archer: archer.id, mage: mage.id, cav: cav.id, hero: hero.id, x, z };
      return window.__ids;
    }, ids);
    await page.waitForTimeout(500);
    await page.evaluate((i) => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(i.knight)); }, u);
    await shot(page, '09-hud-cavaleiro-retrato-idle');
    // inimigo encostado no cavaleiro: o combate real põe `Unit.anim` em 'fight' (o retrato troca para o quadro de ataque)
    await page.evaluate((i) => {
      const gm = window.game.gameManager;
      const k = gm.entitiesById.get(i.knight);
      const foe = gm.spawnUnit('grunt', k.mesh.position.x + 1.5, k.mesh.position.z, 'enemy');
      gm.issue({ type: 'attack', playerId: gm.localPlayerId, unitIds: [i.knight], targetId: foe.id });
    }, u);
    await page.waitForFunction((id) => window.game.gameManager.entitiesById.get(id).anim === 'fight', u.knight, { timeout: 15000, polling: 50 }).catch(() => {});
    await page.waitForFunction(() => document.getElementById('selection-portrait-box').classList.contains('is-attacking'), null, { timeout: 8000, polling: 50 }).catch(() => {});
    const fightRep = await shot(page, '10-hud-cavaleiro-retrato-ataque', undefined, 20); // sem espera: o quadro de ataque dura só enquanto há golpes
    result.fightAnim = await page.evaluate((id) => window.game.gameManager.entitiesById.get(id).anim, u.knight); // só informativo (alterna fight/hurt)
    result.fightPortraitClass = fightRep.portraitBox && fightRep.portraitBox.cls;
    await page.evaluate((i) => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(i.mage)); }, u);
    await shot(page, '11-hud-mago-magias');
    await page.evaluate((i) => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(i.hero)); }, u);
    await shot(page, '12-hud-heroi');
    await page.evaluate((i) => {
      const gm = window.game.gameManager;
      gm.clearSelection();
      for (const id of [i.knight, i.archer, i.mage, i.cav, i.hero]) { const e = gm.entitiesById.get(id); e.setSelected(true); gm.selectedUnits.push(e); }
    }, u);
    await shot(page, '13-hud-selecao-multipla');
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------ HUD orc (mapa naval)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${base}/?skipPreload&texq=low&play&debug&faction=orc&map=arquipelago-naval-4p`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const gm = window.game.gameManager; gm.getPlayer(0).add({ gold: 3000, wood: 3000, stone: 800, oil: 500 }); gm.selectSingle(gm.units.find((u) => u.type === 'peon')); });
    await shot(page, '14-hud-orc-lacaio');
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && b.type === 'great_hall');
      gm.selectSingle(hq);
    });
    await shot(page, '15-hud-orc-salao');
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && b.type === 'great_hall');
      const px = hq.mesh.position.x;
      const pz = hq.mesh.position.z;
      const f = gm.createBuilding('orc_forge', px + 14, pz - 8, true, 'player'); f.isConstructed = true;
      const ob = gm.createBuilding('orc_barracks', px + 14, pz + 6, true, 'player'); ob.isConstructed = true;
      gm.issue({ type: 'research', playerId: gm.localPlayerId, buildingId: f.id, upgradeId: 'melee_weapons' });
      gm.issue({ type: 'train', playerId: gm.localPlayerId, buildingId: ob.id, unitType: 'grunt' });
      window.__orc = { forge: f.id, barracks: ob.id, x: px, z: pz };
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(window.__orc.forge)); });
    await shot(page, '16-hud-orc-forja');
    await page.evaluate(() => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(window.__orc.barracks)); });
    await shot(page, '17-hud-orc-quartel');
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const o = window.__orc;
      const g = gm.spawnUnit('grunt', o.x + 6, o.z + 28, 'player');
      const n = gm.spawnUnit('necromancer', o.x + 8, o.z + 28, 'player');
      window.__orc.g = g.id;
      window.__orc.n = n.id;
      gm.selectSingle(n);
    });
    await shot(page, '18-hud-orc-necromante');
    await page.evaluate(() => { const gm = window.game.gameManager; gm.selectSingle(gm.entitiesById.get(window.__orc.g)); });
    await shot(page, '19-hud-orc-talhador-retrato');
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------ menu e loading
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    watch(page);
    const menuReqs = [];
    page.on('request', (r) => menuReqs.push(r.url()));
    await page.goto(`${base}/`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector('.mm-root.mm-ready', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('.mm-root')?.classList.contains('mm-has-art'), null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    result.menuFetchesLoadingArt = menuReqs.some((u) => u.includes('/art/loading.webp')); // a arte do loading é lazy: o menu não deve baixá-la
    result.menuArt = await page.evaluate(() => { const i = document.querySelector('.mm-art'); return i ? { w: i.naturalWidth, h: i.naturalHeight, hasArt: document.querySelector('.mm-root').classList.contains('mm-has-art') } : null; });
    await page.screenshot({ path: `${OUT}/20-menu-1920x1080.jpg`, type: 'jpeg', quality: 88 });
    console.log('menu'.padEnd(30), JSON.stringify(result.menuArt));
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page2 = await ctx2.newPage();
    watch(page2);
    await page2.goto(`${base}/?play&texq=low`, { waitUntil: 'commit', timeout: 90000 });
    await page2.waitForSelector('#loading-screen.has-art', { timeout: 20000 }).catch(() => {});
    await page2.waitForTimeout(500);
    result.loadingArt = await page2.evaluate(() => { const s = document.getElementById('loading-screen'); const i = s && s.querySelector('.loading-art-img'); const c = s && s.querySelector('.loading-crest'); return { shown: !!s && getComputedStyle(s).display !== 'none', hasArt: !!s && s.classList.contains('has-art'), artSize: i ? [i.naturalWidth, i.naturalHeight] : null, crestImg: !!c && c.classList.contains('has-img') }; });
    await page2.screenshot({ path: `${OUT}/21-loading-1920x1080.jpg`, type: 'jpeg', quality: 88 });
    console.log('loading'.padEnd(30), JSON.stringify(result.loadingArt));
    await ctx2.close();

    // menu e loading em tela pequena (a arte tem de cobrir sem cortar o painel)
    const ctx3 = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page3 = await ctx3.newPage();
    watch(page3);
    await page3.goto(`${base}/`, { waitUntil: 'load', timeout: 90000 });
    await page3.waitForSelector('.mm-root.mm-has-art', { timeout: 20000 }).catch(() => {});
    await page3.waitForTimeout(1200);
    await page3.screenshot({ path: `${OUT}/22-menu-1024x768.jpg`, type: 'jpeg', quality: 88 });
    await ctx3.close();
  }

  // ------------------------------------------------------------------------------------------------ fallback: sprites indisponíveis
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    // bloqueia só os sprites (icons/portraits/art/manifest.json); `src/ui/*.js` precisa continuar carregando
    await ctx.route((url) => /\/ui\/(icons|portraits|art)\//.test(url.pathname) || url.pathname.endsWith('/ui/manifest.json'), (route) => route.abort());
    const page = await ctx.newPage();
    watch(page, true);
    await page.goto(`${base}/?skipPreload&texq=low&play&debug`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      gm.getPlayer(0).add({ gold: 2000, wood: 2000 });
      const hq = gm.buildings.find((b) => b.ownerId === gm.localPlayerId && b.type === 'castle');
      gm.issue({ type: 'train', playerId: gm.localPlayerId, buildingId: hq.id, unitType: 'villager' });
      gm.selectSingle(hq);
    });
    await settle(page, 900);
    result.fallback.castle = await page.evaluate(hudReport);
    await page.screenshot({ path: `${OUT}/23-fallback-sem-sprites-castelo.png`, clip: HUD_CLIP });
    await page.evaluate(() => { const gm = window.game.gameManager; gm.selectSingle(gm.units.find((u) => u.type === 'villager')); });
    await settle(page, 900);
    result.fallback.villager = await page.evaluate(hudReport);
    result.fallback.buttons = await page.evaluate(() => document.querySelectorAll('#selection-actions button').length);
    await page.screenshot({ path: `${OUT}/24-fallback-sem-sprites-trabalhador.png`, clip: HUD_CLIP });
    console.log('fallback'.padEnd(30), JSON.stringify({ castle: result.fallback.castle, villager: result.fallback.villager, buttons: result.fallback.buttons }));
    await ctx.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await vite.close().catch(() => {});
}

// ---------------------------------------------------------------------------------------------------- veredito
const problems = [];
if (result.errors.length) problems.push(`erros de console/página: ${result.errors.slice(0, 5).join(' | ')}`);
if (result.badUi.length) problems.push(`requisições /ui/ com falha: ${result.badUi.slice(0, 5).join(' | ')}`);
for (const [name, r] of Object.entries(result.scenes)) {
  if (r.broken > 0) problems.push(`${name}: ${r.broken} imagem(ns) quebrada(s)`);
  if (r.emojiFallbacks > 0) problems.push(`${name}: ${r.emojiFallbacks} emoji de fallback com sprites disponíveis`);
  if (r.sprites > 0 && r.spriteOk !== r.sprites) problems.push(`${name}: ${r.sprites - r.spriteOk} sprite(s) não carregaram`);
  if (/^(09|10|11|12|18|19)-/.test(name) && r.statIcons < 3) problems.push(`${name}: ícones de atributo ausentes na linha de status (${r.statIcons})`);
}
if (!String(result.fightPortraitClass).includes('is-attacking')) problems.push(`retrato não trocou para o quadro de ataque durante o combate (anim=${result.fightAnim})`);
if (!result.menuArt || !result.menuArt.hasArt) problems.push('arte do menu não carregou');
if (result.menuFetchesLoadingArt) problems.push('o menu baixou a arte do loading (deveria ser lazy)');
if (!result.loadingArt || !result.loadingArt.hasArt) problems.push('arte do loading não carregou');
if (!(result.fallback.buttons > 0)) problems.push('fallback: o card não desenhou botões sem os sprites');
if (result.fallback.castle && result.fallback.castle.sprites - result.fallback.castle.legacy > 0 && result.fallback.castle.broken === 0 && result.fallback.castle.spriteOk > 0) {
  problems.push('fallback: ainda há sprites carregados com /ui/ bloqueado (rota não aplicada?)');
}
result.problems = problems;
writeFileSync(`${OUT}/resultado.json`, JSON.stringify(result, null, 2));
console.log(problems.length ? `PROBLEMAS:\n - ${problems.join('\n - ')}` : 'OK: sem erros de console, sprites carregados, retrato animado e fallback verificados');
process.exit(problems.length ? 1 : 0);
