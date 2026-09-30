#!/usr/bin/env node
/**
 * F4-02 — capturas do cerco (inspetor + jogo) e medições: draw calls de Balista/Catapulta, arco do
 * projétil e tempo de Catapulta × Grande Salão (comparar com o Cavaleiro × Castelo de 290 s).
 * Rode SOMENTE via: bash tools/safe-run.sh --timeout 300 -- node tools/ui-captures/siege/capture.mjs
 * Sobe o Vite na porta 5208; uma página por vez; GPU real obrigatória (assertHardwareGpu).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5208;
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1',
  '--disable-dev-shm-usage', '--disable-extensions'
];

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;

async function open(url, ready) {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  await page.goto(base + url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(ready, null, { timeout: 90000 });
  return { page, errors };
}
async function close() { if (browser) await browser.close().catch(() => {}); browser = null; }

try {
  // --- Inspetor ---
  for (const [model, anim, time, file] of [
    ['ballista', 'idle', null, 'ballista_idle'],
    ['ballista', 'walk', 0.2, 'ballista_walk'],
    ['ballista', 'fight', 0.7, 'ballista_fight_recoil'],
    ['catapult', 'idle', null, 'catapult_idle'],
    ['catapult', 'fight', 0.55, 'catapult_fight_armed'],
    ['catapult', 'fight', 0.66, 'catapult_fight_release'],
    ['workshop', 'idle', null, 'workshop'],
    ['orc_workshop', 'idle', null, 'orc_workshop']
  ]) {
    const q = `/inspector.html?model=${model}&anim=${anim}${time != null ? `&time=${time}` : ''}`;
    const { page, errors } = await open(q, 'window.inspectorApp');
    await page.waitForTimeout(1500);
    if (time != null) await page.evaluate(t => { const a = window.inspectorApp.animator; if (a) { a.pause(); a.setTime(t); } }, time);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${file}.png`) });
    if (anim === 'idle' && (model === 'ballista' || model === 'catapult')) {
      const info = await page.evaluate(() => {
        let meshes = 0, skinned = 0;
        window.inspectorApp.currentModelObject.traverse(o => { if (o.isMesh && o.visible) { meshes++; if (o.isSkinnedMesh) skinned++; } });
        return { meshes, skinned };
      });
      console.log(model, 'draw calls (malhas visíveis):', JSON.stringify(info));
    }
    console.log(file, errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
    await close();
  }

  // --- Jogo: 3 balistas × 5 espadachins parados e depois em movimento ---
  {
    const { page, errors } = await open('/?skipPreload&texq=low&play&faction=human', 'window.game');
    await page.waitForFunction(() => window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const gm = window.game.gameManager;
      const id = gm.localPlayerId;
      const enemy = gm.players.find(p => p.id !== id).id;
      const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
      const cx = hq.mesh.position.x - 8, cz = hq.mesh.position.z - 28;
      window.__sg = { siege: [], targets: [], cx, cz, id, enemy };
      for (let i = 0; i < 3; i++) window.__sg.siege.push(gm.spawnUnit('ballista', cx - 4 + i * 4, cz + 14, id));
      for (let i = 0; i < 5; i++) {
        const t = gm.spawnUnit('knight', cx - 4 + i * 2, cz, enemy);
        t.hp = t.maxHp = 100000;
        t.speed = 0;
        window.__sg.targets.push(t);
      }
      gm.sceneManager.cameraTarget.set(cx, 2, cz + 7);
      gm.issue({ type: 'attack', playerId: id, unitIds: window.__sg.siege.map(s => s.id), targetId: window.__sg.targets[2].id });
    });
    // espera o primeiro projétil em voo para fotografar o arco
    await page.waitForFunction(() => window.game.gameManager.arrows.some(a => a.kind === 'bolt'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'game_ballista_arc.png') });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, 'game_ballista_area.png') });
    const stat = await page.evaluate(() => window.__sg.targets.map(t => Math.round(t.maxHp - t.hp)));
    console.log('dano acumulado por alvo (parados):', JSON.stringify(stat));
    // alvos em movimento: andam em linha; a mira preditiva deve acertar parte dos disparos
    const moving = await page.evaluate(async () => {
      const sg = window.__sg;
      sg.targets.forEach(t => { t.speed = 4.5; t.hp = t.maxHp; });
      const gm = window.game.gameManager;
      gm.issue({ type: 'move', playerId: sg.enemy, unitIds: sg.targets.map(t => t.id), x: sg.cx + 30, z: sg.cz });
      await new Promise(r => setTimeout(r, 9000));
      return sg.targets.map(t => Math.round(t.maxHp - t.hp));
    });
    console.log('dano acumulado por alvo (em movimento, 9 s):', JSON.stringify(moving));
    console.log('game_ballista', errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
    await close();
  }

  // --- Catapulta × Grande Salão: tempo para derrubar (simulação acelerada na página) ---
  {
    const { page, errors } = await open('/?skipPreload&texq=low&play&faction=orc', 'window.game');
    await page.waitForFunction(() => window.game.gameManager && window.game.gameManager.buildings.length > 0, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const res = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const id = gm.localPlayerId;
      const enemy = gm.players.find(p => p.id !== id).id;
      const hall = gm.buildings.find(b => b.ownerId === enemy && b.role === 'hq');
      const cat = gm.spawnUnit('catapult', hall.mesh.position.x + 14, hall.mesh.position.z + 10, id);
      gm.issue({ type: 'attack', playerId: id, unitIds: [cat.id], targetId: hall.id });
      let t = 0;
      const dt = 1 / 20;
      // isola o duelo: o jogador inimigo não reage (mantém as unidades dele paradas)
      gm.allUnits.forEach(u => { if (u.ownerId === enemy) u.speed = 0; });
      gm.buildings.filter(b => b.ownerId === enemy && b.tower).forEach(b => { b.hp = 0; });
      while (!hall.isDead && t < 600 && !cat.isDead) { gm.simStep(dt); t += dt; }
      return { seconds: Math.round(t), hallHpLeft: Math.round(hall.hp), hallMax: hall.maxHp, catDead: cat.isDead };
    });
    console.log('1 catapulta × Grande Salão:', JSON.stringify(res));
    console.log('catapulta', errors.length ? `ERROS: ${errors.join(' | ')}` : 'ok');
    await close();
  }
} finally {
  await close();
  await vite.close();
}
