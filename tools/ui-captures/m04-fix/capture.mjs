#!/usr/bin/env node
/**
 * NEW-53 — capturas NO JOGO da missão m04 "A Ponte do Rio Turvo" corrigida: Forte Atalaia (castelo humano criado pela ação
 * `spawnBuilding`) depois do acampamento neutro, e anel de seleção ciano dos 4 carregadores (`spawn.markColor`).
 * Segue o caminho real do jogador: menu > Campanha > m04 > Iniciar (`?campaign=unlock` libera a missão 4) > cutscene > partida.
 * GPU real obrigatória (assertHardwareGpu). Rode SOMENTE via safe-run:
 *   bash /home/rafael/warpoly/tools/safe-run.sh --timeout 900 -- node tools/ui-captures/m04-fix/capture.mjs [m04|m02|all]
 * Sobe o Vite na porta 5321 (PORT_VITE) e o encerra no finally. Saída: esta pasta (PNG da página com HUD e PNG do canvas sem HUD).
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from '../../lib/assertGpu.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VITE || 5321);
const WHAT = process.argv[2] || 'all';
const ARGS = [
  '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist',
  '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage', '--disable-extensions'
];
const M04 = 'alliance-04-ponte-do-rio-turvo';
const M02 = 'alliance-02-cativos-da-garganta';
const written = [];
const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok: !!ok }); console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`); };

const vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
await vite.listen();
const base = `http://127.0.0.1:${PORT}`;
let browser;

async function openPage() {
  browser = await chromium.launch({ headless: true, args: ARGS });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await assertHardwareGpu(page);
  return { page, errors };
}
async function close() { if (browser) await browser.close().catch(() => {}); browser = null; }

/** Menu principal > Campanha > missão > Iniciar (o caminho do jogador). Devolve quando a partida (`gm.mission`) existe. */
async function startFromCampaign(page, missionId, shotBriefing) {
  await page.goto(`${base}/?texq=low&campaign=unlock`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('[data-action="campaign"]', { timeout: 60000 });
  await page.evaluate(() => { window.warpoly.skipPreload = true; });
  await page.waitForTimeout(600);
  await page.click('[data-action="campaign"]');
  await page.waitForSelector('.ms-brief-item', { timeout: 10000 });
  // a história da campanha padrão (war-alliance) abre sozinha na primeira vez e cobre o menu: pula-a pelo botão "Pular"
  const skipStory = await page.waitForSelector('[data-story="skip"]', { timeout: 5000 }).catch(() => null);
  if (skipStory) {
    await skipStory.click();
    await page.waitForSelector('.story-screen', { state: 'detached', timeout: 5000 }).catch(() => {});
  }
  // a missão m04 só existe na trilha 'alliance': abre essa aba antes de escolher a missão (a campanha padrão é a war-alliance)
  await page.waitForSelector('[data-cp="pickCamp"][data-id="alliance"]', { timeout: 10000 });
  await page.click('[data-cp="pickCamp"][data-id="alliance"]');
  await page.waitForTimeout(400);
  await page.click(`[data-cp="pick"][data-id="${missionId}"]`);
  await page.waitForTimeout(400);
  if (shotBriefing) await shot(page, shotBriefing);
  await page.click('[data-cp="start"]');
  await page.waitForFunction(() => window.game && window.game.gameManager && window.game.gameManager.mission, null, { timeout: 90000 });
  await page.waitForTimeout(800);
}

/** Força um quadro e grava o canvas do jogo (sem HUD). */
async function grab(page, name) {
  const b64 = await page.evaluate(() => {
    const sm = window.game.sceneManager;
    sm.renderer.render(sm.scene, sm.camera);
    return sm.renderer.domElement.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
  written.push(path.join(OUT, name));
}
/** Foto da página inteira (com HUD, letterbox e diálogos). */
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) });
  written.push(path.join(OUT, name));
}
/** Câmera: alvo, zoom (menor = mais perto) e giro (π/4 = padrão). */
async function cam(page, x, y, z, zoom, yaw = Math.PI / 4, wait = 1400) {
  await page.evaluate(([x, y, z, zoom, yaw]) => {
    const sm = window.game.sceneManager;
    sm.cameraTarget.set(x, y, z);
    sm.targetZoomLevel = zoom;
    sm.targetCameraAngle = yaw;
  }, [x, y, z, zoom, yaw]);
  await page.waitForTimeout(wait);
}
/** Seleciona as entidades (anéis visíveis) e atualiza a lista de seleção da HUD. */
async function select(page, ids, building = false) {
  await page.evaluate(([ids, building]) => {
    const gm = window.game.gameManager;
    for (const u of gm.selectedUnits) u.setSelected(false);
    if (gm.selectedBuilding) { gm.selectedBuilding.setSelected(false); gm.selectedBuilding = null; }
    const ents = ids.map((i) => gm.entitiesById.get(i)).filter(Boolean);
    ents.forEach((e) => e.setSelected(true));
    if (building) { gm.selectedBuilding = ents[0]; gm.selectedUnits = []; } else gm.selectedUnits = ents;
  }, [ids, building]);
  await page.waitForTimeout(500);
}
const ringHex = (page, ids) => page.evaluate((ids) => {
  const gm = window.game.gameManager;
  return ids.map((i) => { const v = gm.entityViews.viewOf(gm.entitiesById.get(i)); return v ? '#' + v.selectionRing.material.color.getHexString() : null; });
}, ids);

try {
  if (WHAT === 'all' || WHAT === 'm04') {
    const { page, errors } = await openPage();
    await startFromCampaign(page, M04, '01-campanha-briefing-m04.png');

    // cutscene de abertura: vau > acampamento > forte (espera cada fala aparecer e fotografa a página com HUD)
    const saw = async (needle, file) => {
      await page.waitForFunction((t) => { const d = document.getElementById('mission-dialog'); return d && !d.hidden && d.innerText.includes(t); }, needle, { timeout: 30000 });
      await page.waitForTimeout(1300);
      await shot(page, file);
    };
    await saw('Aquele é o vau', '02-cutscene-1-vau.png');
    await saw('acampamento de saqueadores', '03-cutscene-2-acampamento.png');
    await saw('Forte Atalaia', '04-cutscene-3-forte.png');
    await page.keyboard.press('Escape'); // pula o resto
    await page.waitForTimeout(600);

    const info = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const tag = (t) => (gm.mission.tags.get(t) || []).map((i) => gm.entitiesById.get(i));
      const fort = tag('fort')[0];
      const camp = gm.buildings.find((b) => b.type === 'bandit_camp' && b.mesh.position.x < 0);
      const area = gm.mission.objectives.get('deliver').def.area;
      return {
        fort: { id: fort.id, type: fort.type, owner: fort.ownerId, x: fort.mesh.position.x, z: fort.mesh.position.z, hp: fort.hp, maxHp: fort.maxHp, built: fort.isConstructed, rotY: fort.mesh.rotation.y },
        camp: { x: camp.mesh.position.x, z: camp.mesh.position.z },
        area,
        convoy: tag('convoy').map((u) => u.id),
        convoyMark: tag('convoy').map((u) => u.markColor),
        soldiers: gm.getUnitsOf(0).filter((u) => (u.type === 'knight' || u.type === 'archer')).map((u) => u.id),
        villagers: gm.getUnitsOf(0).filter((u) => u.type === 'villager' && !tag('convoy').includes(u)).map((u) => u.id),
        guards: gm.allUnits.filter((u) => u.ownerId === 99 && u.mesh.position.x < 0).length,
        blockade: tag('blockade').length
      };
    });
    console.log(JSON.stringify(info));
    check('o forte é um castelo do jogador, concluído, com PV cheios', info.fort.type === 'castle' && info.fort.owner === 0 && info.fort.built && info.fort.hp === info.fort.maxHp);
    check('os 4 carregadores têm markColor ciano', info.convoyMark.length === 4 && info.convoyMark.every((c) => c === '#22d3ee'));
    check('área de entrega centrada no forte', info.area.x === info.fort.x && info.area.z === info.fort.z);

    // 1. o que o jogador vê ao começar (névoa ligada): forte já visível, depois do acampamento
    await cam(page, -44, 2, -6, 1.15);
    await grab(page, '05-jogo-forte-e-acampamento-nevoa.png');
    // 2. mesma vista com a névoa desligada (acampamento e arredores completos)
    await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(false); });
    await cam(page, -44, 2, -6, 1.15);
    await grab(page, '06-jogo-forte-e-acampamento.png');
    await cam(page, info.fort.x + 2, 2.5, info.fort.z, 0.6, Math.PI / 2 + 0.35); // forte de perto, frente (+X) voltada para a câmera
    await grab(page, '07-jogo-forte-perto.png');

    // 3. carregadores + soldados selecionados juntos na base: anel ciano dos carregadores x dourado dos demais
    await select(page, [...info.convoy, ...info.soldiers, ...info.villagers]);
    const hex = await ringHex(page, [...info.convoy, ...info.soldiers.slice(0, 2), ...info.villagers.slice(0, 1)]);
    console.log('aneis (carregadores x2, soldados, aldeao da base):', JSON.stringify(hex));
    check('anéis dos carregadores = ciano; soldados e aldeões da base = dourado',
      hex.slice(0, 4).every((h) => h === '#22d3ee') && hex.slice(4).every((h) => h === '#deb841'));
    await cam(page, 22, 1.2, -20, 0.5);
    await grab(page, '09-jogo-carregadores-aneis.png');
    await shot(page, '10-jogo-carregadores-hud.png');

    // 4. o forte selecionado (anel dourado padrão — sem markColor) com a HUD
    await select(page, [info.fort.id], true);
    await cam(page, info.fort.x + 2, 2.5, info.fort.z, 0.9, Math.PI / 4);
    await shot(page, '11-jogo-forte-selecionado-hud.png');

    // 5. chegada: carregadores diante do forte (selecionados) — entrega concluída pelo objetivo
    await page.evaluate(({ ids, fx, fz }) => {
      const gm = window.game.gameManager;
      ids.forEach((id, k) => {
        const u = gm.entitiesById.get(id);
        const x = fx + 7.5 + (k % 2) * 1.4, z = fz - 2.5 + k * 1.6;
        u.mesh.position.set(x, u.mesh.position.y, z);
        u._prevPos.set(x, u.mesh.position.y, z);
        u._simPos.set(x, u.mesh.position.y, z);
        gm.unitGrid.update(u, x, z, u.collisionRadius || 0);
      });
    }, { ids: info.convoy, fx: info.fort.x, fz: info.fort.z });
    await select(page, info.convoy);
    await cam(page, info.fort.x + 4, 2.2, info.fort.z, 0.6, Math.PI / 4 + 0.2);
    await grab(page, '12-jogo-carregadores-no-forte.png');
    // o bloqueio do vau central ainda existe, então a vitória só vem depois dele: confere o estado dos objetivos
    const st = await page.evaluate(() => Object.fromEntries([...window.game.gameManager.mission.objectives.values()].map((o) => [o.id, o.status])));
    console.log('objetivos', JSON.stringify(st));
    check('chegada ao forte conclui o objetivo "deliver"', st.deliver === 'completed');
    await shot(page, '13-jogo-entrega-hud.png');

    check('sem erros de console (m04)', errors.length === 0, errors.slice(0, 3).join(' / '));
    await close();
  }

  if (WHAT === 'all' || WHAT === 'm02') {
    // m02 (resgate): os cativos resgatados continuam com o anel VERMELHO de antes (sem markColor)
    const { page, errors } = await openPage();
    await startFromCampaign(page, M02, null);
    await page.keyboard.press('Escape'); // pula a cutscene
    await page.waitForTimeout(600);
    const caps = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const caps = (gm.mission.tags.get('captives') || []).map((i) => gm.entitiesById.get(i));
      const hero = gm.getUnitsOf(0).find((u) => !u.isDead);
      hero.mesh.position.set(-26, hero.mesh.position.y, 26); // chega junto dos cativos (como o teste da campanha)
      hero._prevPos.set(-26, hero.mesh.position.y, 26);
      hero._simPos.set(-26, hero.mesh.position.y, 26);
      gm.unitGrid.update(hero, -26, 26, hero.collisionRadius || 0);
      return caps.map((u) => ({ id: u.id, x: u.mesh.position.x, z: u.mesh.position.z }));
    });
    await page.waitForTimeout(1800);
    const owners = await page.evaluate((ids) => { const gm = window.game.gameManager; return ids.map((i) => gm.entitiesById.get(i).ownerId); }, caps.map((c) => c.id));
    console.log('cativos', JSON.stringify(caps), 'donos depois', JSON.stringify(owners));
    check('cativos resgatados passam a ser do jogador', owners.length > 0 && owners.every((o) => o === 0));
    await select(page, caps.map((c) => c.id));
    const hex = await ringHex(page, caps.map((c) => c.id));
    console.log('aneis dos resgatados', JSON.stringify(hex));
    check('anéis dos resgatados do m02 continuam vermelhos', hex.length > 0 && hex.every((h) => h === '#ef4444'));
    await cam(page, caps[0].x, 1.2, caps[0].z, 0.5);
    await grab(page, '14-m02-resgatados-aneis-vermelhos.png');
    check('sem erros de console (m02)', errors.length === 0, errors.slice(0, 3).join(' / '));
    await close();
  }
} finally {
  await close();
  await vite.close().catch(() => {});
}
// reduz o peso no repositório (256 cores com dithering; precisa do Pillow no Python do sistema; NO_SHRINK=1 desliga)
if (!process.env.NO_SHRINK && written.length) {
  try {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
for f in sys.argv[1:]:
    im = Image.open(f).convert('RGB')
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(f, optimize=True)
`, ...written], { stdio: 'inherit' });
  } catch (e) { console.log('shrink ignorado:', e.message); }
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} verificações OK`);
if (failed.length) { console.log('FALHAS:', failed.map((c) => c.name).join(' | ')); process.exitCode = 1; }
