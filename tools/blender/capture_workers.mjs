// Capturas do Camponês e do Lacaio (procedural × Blender) no inspetor e no jogo. GPU real obrigatória.
// Uso (vite em porta EXCLUSIVA, ex. 5216):  timeout 900 npx vite --port 5216 --strictPort &
//   tools/safe-run.sh --timeout 600 -- node tools/blender/capture_workers.mjs [villager|peon|all]
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../lib/assertGpu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'renders');
const BASE = process.env.BASE_URL || 'http://localhost:5216';
const which = process.argv[2] || 'all';

// [arquivo, modelo, anim, tempo, ferramenta, carga]
function shotsFor(id, procId) {
  return [
    [`insp_${id}_old`, procId, 'idle', null, 'axe', 'none'],
    [`insp_${id}_new`, `${procId}_glb`, 'idle', null, 'axe', 'none'],
    [`insp_${id}_new_walk`, `${procId}_glb`, 'walk', 0.2, 'axe', 'none'],
    [`insp_${id}_new_walk_wood`, `${procId}_glb`, 'walk', 0.45, 'axe', 'wood'],
    [`insp_${id}_new_axe`, `${procId}_glb`, 'gather', 0.55, 'axe', 'none'],
    [`insp_${id}_new_pick`, `${procId}_glb`, 'gather', 0.55, 'pickaxe', 'gold'],
    [`insp_${id}_new_hammer`, `${procId}_glb`, 'fight', 0.55, 'hammer', 'none'],
    [`insp_${id}_new_fight`, `${procId}_glb`, 'fight', 0.3, 'axe', 'none'],
    [`insp_${id}_new_hurt`, `${procId}_glb`, 'hurt', 0.12, 'axe', 'none'],
    [`insp_${id}_new_die`, `${procId}_glb`, 'die', 1.4, 'axe', 'none'],
    [`insp_${id}_old_axe`, procId, 'gather', 0.55, 'axe', 'none']
  ];
}

const browser = await chromium.launch({
  args: ['--use-angle=vulkan', '--enable-gpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=2048']
});
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto('about:blank');
  console.log('GPU', await assertHardwareGpu(page));
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });

  const jobs = [];
  if (!process.env.NO_INSP && (which === 'all' || which === 'villager')) jobs.push(...shotsFor('villager', 'villager'));
  if (!process.env.NO_INSP && (which === 'all' || which === 'peon')) jobs.push(...shotsFor('peon', 'peon'));
  for (const [name, model, anim, time, tool, cargo] of jobs) {
    const q = `model=${model}&light=day&anim=${anim}` + (time !== null ? `&time=${time}` : '');
    await page.goto(`${BASE}/inspector.html?${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const app = window.inspectorApp;
      if (!app || !app.currentModelObject) return false;
      let m = 0; app.currentModelObject.traverse(o => { if (o.isMesh) m++; });
      return m > 0;
    }, null, { timeout: 120000, polling: 250 });
    await page.evaluate(([t, c]) => {
      const app = window.inspectorApp;
      if (app.animator && app.animator.setVillagerTool) {
        app.villagerTool = t; app.villagerCargo = c;
        app.animator.setVillagerTool(t); app.animator.setVillagerCargo(c);
      }
    }, [tool, cargo]);
    await page.waitForTimeout(900);
    await page.locator('#canvas3d').screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(name);
  }

  // No jogo: cada trabalhador coleta madeira/ouro e constrói
  const games = [];
  if (which === 'all' || which === 'villager') games.push(['villager', '']);
  if (which === 'all' || which === 'peon') games.push(['peon', '&faction=orc']);
  for (const [type, extra] of games) {
    await page.goto(`${BASE}/?skipPreload&texq=low&play${extra}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.allUnits.length > 0,
      null, { timeout: 240000, polling: 1000 });
    await page.waitForTimeout(2500);
    const setup = await page.evaluate(t => {
      const gm = window.game.gameManager;
      const u = gm.allUnits.find(x => x.type === t && x.ownerId === 0);
      if (!u) return null;
      const tree = gm.trees.filter(x => !x.isDead).sort((a, b) =>
        Math.hypot(a.mesh.position.x - u.mesh.position.x, a.mesh.position.z - u.mesh.position.z) -
        Math.hypot(b.mesh.position.x - u.mesh.position.x, b.mesh.position.z - u.mesh.position.z))[0];
      window.__u = u;
      u.orderGather(tree);
      const ud = u.mesh.userData;
      return { glb: !!u.mesh.getObjectByName('ToolGroup'), axe: ud.axe && ud.axe.visible, pick: ud.pickaxe && ud.pickaxe.visible,
        pack: ud.pack && ud.pack.visible, tool: !!ud.toolGroup };
    }, type);
    console.log('GAME', type, JSON.stringify(setup));
    const follow = async (file, ms) => {
      await page.evaluate(() => {
        const sm = window.game.sceneManager, u = window.__u;
        sm.cameraTarget.set(u.mesh.position.x, 1.2, u.mesh.position.z);
        sm.targetZoomLevel = 0.5; sm.zoomLevel = 0.5;
      });
      await page.waitForTimeout(ms);
      await page.screenshot({ path: path.join(OUT, file) });
    };
    await follow(`game_${type}_walk.png`, 1200);
    // espera chegar e coletar
    for (let i = 0; i < 40; i++) {
      const st = await page.evaluate(() => window.__u.state);
      if (st === 'gathering') break;
      await page.evaluate(() => { const sm = window.game.sceneManager, u = window.__u; sm.cameraTarget.set(u.mesh.position.x, 1.2, u.mesh.position.z); });
      await page.waitForTimeout(1000);
    }
    await follow(`game_${type}_gather.png`, 700);
    const carry = await page.evaluate(() => {
      const u = window.__u, ud = u.mesh.userData;
      u.carrying = { type: 'wood', amount: 10 };
      u.updateCarryingVisuals(true);
      return { axe: ud.axe.visible, pick: ud.pickaxe.visible, hammer: ud.hammer.visible, pack: ud.pack.visible, wood: ud.woodBundle.visible, gold: ud.goldSack.visible };
    });
    console.log('CARRY wood', JSON.stringify(carry));
    await follow(`game_${type}_wood.png`, 700);
    const gold = await page.evaluate(() => {
      const u = window.__u, ud = u.mesh.userData;
      u.carrying = { type: 'gold', amount: 10 };
      u.updateCarryingVisuals(true);
      ud.axe.visible = false; ud.pickaxe.visible = true;
      return { axe: ud.axe.visible, pick: ud.pickaxe.visible, pack: ud.pack.visible, wood: ud.woodBundle.visible, gold: ud.goldSack.visible };
    });
    console.log('CARRY gold', JSON.stringify(gold));
    await follow(`game_${type}_gold.png`, 700);
  }
} finally {
  await browser.close();
}
