#!/usr/bin/env node
/**
 * NEW-52 — juncos/vitórias-régias (`Water.createReeds` → `pickReedLocations`) só em água rasa do mapa, em `continental-1v1`.
 * Mede cada moita criada (altura do terreno no centro e em 16 pontos ao redor, quantos ficam acima da água), compara com as 7
 * posições fixas antigas (`(10,12)`, `(12,15)`…), confere se alguma moita cai dentro da área jogável e quanto custa em draw calls.
 * Fotografa cada moita de perto (névoa desligada) e a vista que o jogador realmente teria no canto do mapa (névoa ligada × desligada).
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-52.mjs
 * Saída: NEW-52-1-moitas.png (cada moita de perto), NEW-52-2-vista-do-jogador.png (canto do mapa, névoa ligada × desligada) e NEW-52.json.
 */
import { startSession, shotTmp, cam, montage, finish, check } from './_common.mjs';

const ITEM = 'NEW-52';
const S = await startSession({
  port: 5452,
  url: '/?skipPreload&texq=low&play&map=continental-1v1&faction=human',
  freezeAi: true
});
const { page } = S;
const data = {};
let code = 1;

try {
  // ---------------------------------------------------------------- 1. onde ficaram as moitas
  data.reeds = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const water = window.game.water;
    const t = gm.terrain;
    const WL = water.waterLevel;
    const stats = (x, z) => {
      const pts = [[0, 0]];
      for (const r of [0.8, 1.4]) for (let k = 0; k < 8; k++) pts.push([Math.cos((k * Math.PI) / 4) * r, Math.sin((k * Math.PI) / 4) * r]);
      const hs = pts.map(([dx, dz]) => t.getHeight(x + dx, z + dz));
      return { x, z, center: +hs[0].toFixed(2), min: +Math.min(...hs).toFixed(2), max: +Math.max(...hs).toFixed(2), dry: hs.filter((h) => h > WL).length, samples: hs.length };
    };
    const clumps = water.reedClumps.map((c) => stats(c.position.x, c.position.z));
    const old = [[10, 12], [12, 15], [-10, -12], [-12, -15], [-15, 18], [15, -18], [-20, 12]].map(([x, z]) => stats(x, z));
    return {
      waterLevel: WL, tileset: t.mapDef.tileset, size: t.mapDef.size, playable: t.mapDef.playable,
      clumps, old, lotusEntities: water.lotusEntities.length, groupChildren: window.game.sceneManager.scene.getObjectByName('WaterVegetationGroup').children.length
    };
  });
  const R = data.reeds;
  console.log('moitas', JSON.stringify(R.clumps));
  console.log('posições antigas', JSON.stringify(R.old));
  const halfPlayable = R.playable / 2;
  R.inPlayable = R.clumps.filter((c) => Math.abs(c.x) <= halfPlayable && Math.abs(c.z) <= halfPlayable).length;
  check('há moitas (1..7) e uma por moita no grupo de vegetação', R.clumps.length >= 1 && R.clumps.length <= 7 && R.groupChildren === R.clumps.length, `moitas=${R.clumps.length}`);
  check('cada moita está em água rasa (centro 0,05–0,6 abaixo do nível d\'água) e nenhum dos 16 pontos em volta fica em terra seca', R.clumps.every((c) => c.center <= R.waterLevel - 0.05 && c.center >= R.waterLevel - 0.6 && c.dry === 0), JSON.stringify(R.clumps.map((c) => [c.center, c.dry])));
  check('as 7 posições fixas antigas eram terra seca neste mapa (o defeito original)', R.old.every((c) => c.center > R.waterLevel), JSON.stringify(R.old.map((c) => c.center)));
  console.log(`moitas dentro da área jogável (±${halfPlayable}): ${R.inPlayable} de ${R.clumps.length}`);

  // ---------------------------------------------------------------- 2. fotos de cada moita (névoa desligada)
  await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(false); });
  const files = [];
  for (const [i, c] of R.clumps.slice(0, 4).entries()) {
    await cam(page, c.x, R.waterLevel, c.z, 0.4, Math.PI / 4, 1700);
    files.push({ file: await shotTmp(page, `moita${i}.png`), label: `moita ${i}: (${c.x}, ${c.z}) h=${c.center}  secos=${c.dry}/${c.samples}`, crop: [240, 90, 1040, 540] });
  }
  montage(`${ITEM}-1-moitas.png`, files, { cols: 2, panelW: 560 });

  // custo em draw calls do grupo de vegetação (visível × oculto) com a 1ª moita no quadro
  await cam(page, R.clumps[0].x, R.waterLevel, R.clumps[0].z, 0.8, Math.PI / 4, 1500);
  data.drawCalls = await page.evaluate(() => new Promise((res) => {
    const sm = window.game.sceneManager;
    const g = sm.scene.getObjectByName('WaterVegetationGroup');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const withGroup = sm.renderer.info.render.calls;
      g.visible = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const without = sm.renderer.info.render.calls;
        g.visible = true;
        res({ with: withGroup, without, delta: withGroup - without });
      }));
    }));
  }));
  console.log('draw calls (1 moita no quadro)', JSON.stringify(data.drawCalls));

  // ---------------------------------------------------------------- 3. o que o jogador vê no canto do mapa (câmera limitada a ±55)
  const c0 = R.clumps.reduce((best, c) => (c.x + c.z > best.x + best.z ? c : best), R.clumps[0]); // o canto +X+Z
  const tx = Math.sign(c0.x) * 55, tz = Math.sign(c0.z) * 55;
  await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(true); });
  await cam(page, tx, 2, tz, 0.9, Math.PI / 4, 1800);
  const imgFogOn = await shotTmp(page, 'canto-nevoa.png');
  data.cornerView = await page.evaluate(([x, z]) => {
    const sm = window.game.sceneManager;
    const v = sm.camera.position.clone().set(x, 0.5, z).project(sm.camera);
    return { screen: [Math.round(((v.x + 1) / 2) * window.innerWidth), Math.round(((1 - v.y) / 2) * window.innerHeight)], inFrustum: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1, explored: window.game.gameManager.fogOfWar.isExplored(x, z) };
  }, [c0.x, c0.z]);
  console.log('moita do canto na tela', JSON.stringify(data.cornerView));
  await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(false); });
  await page.waitForTimeout(500);
  const imgFogOff = await shotTmp(page, 'canto-aberto.png');
  montage(`${ITEM}-2-vista-do-jogador.png`, [
    { file: imgFogOn, label: `camera do jogo (alvo ${tx},${tz}), nevoa LIGADA: moita (${c0.x},${c0.z}) em ${data.cornerView.screen}`, crop: [0, 0, 1280, 720] },
    { file: imgFogOff, label: 'mesma vista, nevoa desligada', crop: [0, 0, 1280, 720] }
  ], { cols: 2, panelW: 640 });
  check('observação: a moita do canto está no quadro da câmera do jogo mas fica na névoa (área não explorada)', true, `no quadro=${data.cornerView.inFrustum} explorada=${data.cornerView.explored} dentro da área jogável=${R.inPlayable}/${R.clumps.length}`);

  check('sem erros de console', S.errors.length === 0, S.errors.slice(0, 3).join(' / '));
} catch (e) {
  console.error('ERRO no cenário:', e);
  S.errors.push('script: ' + e.message);
} finally {
  await S.close();
}
code = finish(ITEM, data, S.errors, S.warnings);
process.exitCode = code;
