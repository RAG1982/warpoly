#!/usr/bin/env node
/**
 * NEW-19 — ruínas/clareira ao destruir uma construção e ao esgotar uma mina (RuinsManager, só apresentação).
 *  - Destrói uma Caserna e uma Casa do jogador (`takeDamage`) e fotografa antes/depois (tamanho proporcional ao tipo).
 *  - Esgota a mina de ouro mais próxima pelo caminho real (um aldeão minera os últimos 30 de ouro → `RESOURCE_DEPLETED`).
 *  - Mede o ciclo de vida (45 s de permanência, 5 s de desvanecimento, slot liberado aos 50 s), a névoa (ruína em área não
 *    explorada fica oculta; explorada sem visão fica esmaecida) e que a ruína não entra no `blockerGrid`.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-19.mjs
 * Saída: NEW-19-1-construcao.png, NEW-19-2-mina-e-desvanecimento.png e NEW-19.json.
 */
import { startSession, shotTmp, cam, montage, finish, check } from './_common.mjs';

const ITEM = 'NEW-19';
const S = await startSession({
  port: 5419,
  url: '/?skipPreload&texq=low&play&map=continental-1v1&faction=human',
  freezeAi: true
});
const { page } = S;
const data = {};
let code = 1;

/** Estado das ruínas ativas (slots não livres). */
const ruinState = () => page.evaluate(() => {
  const r = window.game.session.ruins;
  return r.slots.map((s, i) => ({
    i, state: s.state, age: +s.age.toFixed(2), x: +s.x.toFixed(2), z: +s.z.toFixed(2), visible: s.group.visible,
    opacity: +s.decal.material.opacity.toFixed(3), debrisOpacity: +s.debris.material.opacity.toFixed(3), debrisVisible: s.debris.visible,
    debrisY: +s.debris.position.y.toFixed(3), baseY: +s.baseY.toFixed(3), decalScale: +s.decal.scale.x.toFixed(2),
    decalColor: +s.decal.material.color.r.toFixed(2), tris: s.debris.geometry && s.debris.geometry.attributes.position ? Math.round(s.debris.geometry.attributes.position.count / 3) : 0
  })).filter((s) => s.state !== 'free');
});

/**
 * A ruína é VISÍVEL? Compara, no mesmo quadro, a cor do canvas em `n` pontos de um anel (raio `R` em volta de `(cx,cz)`) com o
 * grupo da ruína ligado e desligado (soma das 3 diferenças de canal, 0–765; média dos 3×3 pixels de cada ponto).
 */
const ruinVisibility = (slotIdx, cx, cz, R, n = 16) => page.evaluate(([slotIdx, cx, cz, R, n]) => {
  const sm = window.game.sceneManager;
  const gm = window.game.gameManager;
  const slot = window.game.session.ruins.slots[slotIdx];
  const src = sm.renderer.domElement;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  const read = () => { sm.renderer.render(sm.scene, sm.camera); g.drawImage(src, 0, 0); };
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const v = sm.camera.position.clone().set(x, gm.terrain.getHeight(x, z), z).project(sm.camera);
    pts.push({ px: Math.round(((v.x + 1) / 2) * c.width), py: Math.round(((1 - v.y) / 2) * c.height) });
  }
  const sample = () => pts.map((p) => {
    const d = g.getImageData(Math.max(0, p.px - 1), Math.max(0, p.py - 1), 3, 3).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    return [r / 9, gg / 9, b / 9];
  });
  read();
  const withRuin = sample();
  const was = slot.group.visible;
  slot.group.visible = false;
  read();
  const without = sample();
  slot.group.visible = was;
  const diffs = withRuin.map((a, i) => Math.abs(a[0] - without[i][0]) + Math.abs(a[1] - without[i][1]) + Math.abs(a[2] - without[i][2]));
  return { R, n, meanDiff: +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1), maxDiff: +Math.max(...diffs).toFixed(1), pointsChanged: diffs.filter((d) => d > 24).length };
}, [slotIdx, cx, cz, R, n]);

try {
  data.quality = await page.evaluate(() => ({ preset: window.game.quality.current && window.game.quality.current.name, ruinsAttached: !!window.game.session.ruins }));
  console.log('qualidade', JSON.stringify(data.quality));

  // ---------------------------------------------------------------- 1. dois prédios do jogador (Caserna + Casa) perto do Centro
  const site = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const id = gm.localPlayerId;
    const hq = gm.buildings.find((b) => b.ownerId === id && b.role === 'hq');
    const hp = hq.mesh.position;
    const R = [Math.SQRT1_2, -Math.SQRT1_2]; // direção "para a direita" da tela com a câmera padrão
    for (let r = 14; r <= 40; r += 2) {
      for (let a = 0; a < 360; a += 15) {
        const cx = hp.x + Math.cos((a * Math.PI) / 180) * r, cz = hp.z + Math.sin((a * Math.PI) / 180) * r;
        const bx = cx - 5.5 * R[0], bz = cz - 5.5 * R[1], hx = cx + 5.5 * R[0], hz = cz + 5.5 * R[1];
        if (gm.canPlaceBuilding('barracks', bx, bz, null, id) && gm.canPlaceBuilding('cottage', hx, hz, null, id)) {
          const mk = (type, x, z) => { const b = gm._createPlacedBuilding(type, x, z, id); b.construct(100, gm); return b; };
          const a1 = mk('barracks', bx, bz), a2 = mk('cottage', hx, hz);
          window.__ruinTargets = [a1, a2];
          return { cx, cz, barracks: { id: a1.id, x: bx, z: bz, r: a1.collisionRadius }, cottage: { id: a2.id, x: hx, z: hz, r: a2.collisionRadius } };
        }
      }
    }
    return null;
  });
  data.site = site;
  if (!check('achou espaço para Caserna + Casa perto do Centro', !!site)) throw new Error('sem espaço para as construções');
  await cam(page, site.cx, 1, site.cz, 0.62, Math.PI / 4, 1800);
  const imgBefore = await shotTmp(page, 'antes.png');
  const nBefore = (await ruinState()).length;

  // destrói as duas (caminho real: Building.takeDamage → die → BUILDING_DESTROYED → RuinsManager) e liga o amostrador de idade/opacidade
  await page.evaluate(() => {
    window.__samples = [];
    window.__ruinTargets.forEach((b) => b.takeDamage(1e6));
    const ruins = window.game.session.ruins;
    window.__sampler = setInterval(() => {
      ruins.slots.forEach((s, i) => {
        if (s.state === 'free' && !s.__was) return;
        s.__was = s.state !== 'free';
        if (s.age > 38) window.__samples.push({ i, age: +s.age.toFixed(2), state: s.state, opacity: +s.decal.material.opacity.toFixed(3), visible: s.group.visible, debrisY: +(s.debris.position.y - s.baseY).toFixed(3) });
      });
    }, 250);
  });
  await page.waitForTimeout(1600);
  const afterBuild = await ruinState();
  data.afterBuildings = afterBuild;
  console.log('ruínas após destruir:', JSON.stringify(afterBuild));
  const imgAfter = await shotTmp(page, 'depois.png');
  const rB0 = afterBuild.find((q) => Math.hypot(q.x - site.barracks.x, q.z - site.barracks.z) < 0.5);
  if (rB0) data.visibleBuilding = await ruinVisibility(rB0.i, site.barracks.x, site.barracks.z, 2.2);
  console.log('visibilidade da ruína da Caserna (anel 2,2 u)', JSON.stringify(data.visibleBuilding));
  check('ruína da Caserna visível (diferença média de cor ≥ 30 no anel de 2,2 u, ligada × desligada)', !!data.visibleBuilding && data.visibleBuilding.meanDiff >= 30, JSON.stringify(data.visibleBuilding));
  check('2 ruínas surgiram (uma por construção destruída)', afterBuild.length === nBefore + 2, `ativas=${afterBuild.length}`);
  const rB = afterBuild.find((s) => Math.hypot(s.x - site.barracks.x, s.z - site.barracks.z) < 0.5);
  const rC = afterBuild.find((s) => Math.hypot(s.x - site.cottage.x, s.z - site.cottage.z) < 0.5);
  check('ruína no local da Caserna e da Casa', !!rB && !!rC);
  check('raio do decal = collisionRadius × 1,15 (Caserna 3,5 → 4,03; Casa 2,8 → 3,22)', rB && rC && Math.abs(rB.decalScale - 4.03) < 0.05 && Math.abs(rC.decalScale - 3.22) < 0.05, `Caserna=${rB && rB.decalScale} Casa=${rC && rC.decalScale}`);
  check('entulho de 4–8 peças mescladas numa geometria por ruína (≥ 12 triângulos)', afterBuild.every((s) => s.tris >= 12), `tris=${afterBuild.map((s) => s.tris)}`);
  check('ruína em área visível não é esmaecida (decal cor 1)', !!rB && rB.decalColor === 1 && rB.visible);
  montage(`${ITEM}-1-construcao.png`, [
    { file: imgBefore, label: 'antes: Caserna e Casa', crop: [200, 40, 1080, 535] },
    { file: imgAfter, label: 'depois: takeDamage(1e6)  (+1,6 s)', crop: [200, 40, 1080, 535] }
  ], { cols: 2, panelW: 640 });

  // a ruína não é obstáculo: nada do blockerGrid no local; uma unidade atravessa o terreno da Caserna destruída
  data.passthrough = await page.evaluate(async (s) => {
    const gm = window.game.gameManager;
    const buf = [];
    gm.blockerGrid.queryRadius(s.barracks.x, s.barracks.z, 3, null, buf);
    const blockers = buf.filter((e) => e && !e.isDead).map((e) => `${e.constructor.name}:${e.type || ''}`);
    const u = gm.spawnUnit('knight', s.barracks.x - 7, s.barracks.z - 7, gm.localPlayerId);
    const tx = s.barracks.x + 7, tz = s.barracks.z + 7;
    u.moveTo(tx, tz, gm);
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) {
      await new Promise((r) => setTimeout(r, 200));
      if (Math.hypot(u.mesh.position.x - tx, u.mesh.position.z - tz) < 2) break;
    }
    const res = { blockers, arrived: Math.hypot(u.mesh.position.x - tx, u.mesh.position.z - tz) < 2, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
    u.takeDamage(1e6);
    return res;
  }, site);
  console.log('atravessar a ruína', JSON.stringify(data.passthrough));
  check('a ruína não bloqueia: blockerGrid vazio no local e a unidade atravessa', data.passthrough.blockers.length === 0 && data.passthrough.arrived, JSON.stringify(data.passthrough));

  // ---------------------------------------------------------------- 2. névoa: ruína de prédio inimigo (nunca visto × lembrado)
  data.fog = await page.evaluate(async () => {
    const gm = window.game.gameManager;
    const ruins = window.game.session.ruins;
    const fog = gm.fogOfWar;
    const enemyB = gm.buildings.filter((b) => gm.isHostile(gm.localPlayerId, b.ownerId) && b.ownerId !== 99 && b.role !== 'hq' && !b.isDead);
    const [e1, e2] = [enemyB[0], enemyB[1]];
    const slotAt = (b) => ruins.slots.find((s) => s.state !== 'free' && Math.hypot(s.x - b.mesh.position.x, s.z - b.mesh.position.z) < 0.5);
    const out = { e1: { type: e1.type, explored: fog.isExplored(e1.mesh.position.x, e1.mesh.position.z) } };
    e1.takeDamage(1e6); // nunca visto
    await new Promise((r) => setTimeout(r, 500));
    const s1 = slotAt(e1);
    out.e1.groupVisible = s1 ? s1.group.visible : null;
    if (e2) { // explorado e depois sem visão (memória)
      const p = e2.mesh.position;
      fog.revealArea(p.x, p.z, 14, 2);
      await new Promise((r) => setTimeout(r, 4500)); // 2 s de visão + folga: fica na memória
      out.e2 = { type: e2.type, explored: fog.isExplored(p.x, p.z), visibleNow: fog.isVisible(p.x, p.z) };
      e2.takeDamage(1e6);
      await new Promise((r) => setTimeout(r, 500));
      const s2 = slotAt(e2);
      out.e2.groupVisible = s2 ? s2.group.visible : null;
      out.e2.decalColor = s2 ? +s2.decal.material.color.r.toFixed(2) : null;
    }
    return out;
  });
  console.log('névoa', JSON.stringify(data.fog));
  check('ruína em área nunca explorada fica oculta', data.fog.e1.explored || data.fog.e1.groupVisible === false, JSON.stringify(data.fog.e1));
  check('ruína em área explorada sem visão aparece esmaecida (cor 0,5)', !data.fog.e2 || !data.fog.e2.explored || data.fog.e2.visibleNow || (data.fog.e2.groupVisible === true && data.fog.e2.decalColor === 0.5), JSON.stringify(data.fog.e2));

  // ---------------------------------------------------------------- 3. mina esgotada pelo caminho real (aldeão minera os últimos 30)
  data.mine = await page.evaluate(async () => {
    const { EVT } = await import('/src/sim/events.js');
    const gm = window.game.gameManager;
    const id = gm.localPlayerId;
    const hp = gm.buildings.find((b) => b.ownerId === id && b.role === 'hq').mesh.position;
    const d2 = (r) => Math.hypot(r.mesh.position.x - hp.x, r.mesh.position.z - hp.z);
    const dep = gm.resourceDeposits.filter((r) => r.type === 'gold').sort((a, b) => d2(a) - d2(b))[0];
    dep.resourcesRemaining = 30;
    const w = gm.getUnitsOf(id).find((u) => u.type === 'villager' && !u.isDead);
    window.__mine = { depleted: [] };
    gm.events.on(EVT.RESOURCE_DEPLETED, (p) => window.__mine.depleted.push({ type: p.resourceType, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) }), true);
    gm.gameSpeed = 4;
    gm.issue({ type: 'gather', playerId: id, unitIds: [w.id], targetId: dep.id });
    return { x: dep.mesh.position.x, z: dep.mesh.position.z, remaining: dep.resourcesRemaining, dist: +d2(dep).toFixed(1), radius: dep.collisionRadius };
  });
  console.log('mina', JSON.stringify(data.mine));
  await page.waitForFunction(() => window.__mine.depleted.length > 0, null, { timeout: 90000, polling: 250 });
  await page.evaluate(() => { window.game.gameManager.gameSpeed = 1; });
  await cam(page, data.mine.x, 1, data.mine.z, 0.45, Math.PI / 4, 1600);
  data.mineEvent = await page.evaluate(() => window.__mine.depleted);
  const mineRuins = (await ruinState()).filter((s) => Math.hypot(s.x - data.mine.x, s.z - data.mine.z) < 0.6);
  data.mineRuin = mineRuins[0] || null;
  console.log('ruína da mina', JSON.stringify(data.mineRuin));
  const imgMine = await shotTmp(page, 'mina.png');
  if (data.mineRuin) {
    data.mineDrape = await page.evaluate((i) => {
      const r = window.game.session.ruins;
      const sl = r.slots[i];
      const t = window.game.gameManager.terrain;
      const pos = sl.decal.geometry.attributes.position;
      const rad = sl.decal.scale.x;
      const tpl = r.decalGeo.attributes.position;
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < pos.count; k++) {
        const wx = sl.x + tpl.getX(k) * rad, wz = sl.z + tpl.getZ(k) * rad;
        const d = sl.baseY + pos.getY(k) - t.getHeight(wx, wz);
        lo = Math.min(lo, d); hi = Math.max(hi, d);
      }
      return { vertices: pos.count, aboveTerrainMin: +lo.toFixed(3), aboveTerrainMax: +hi.toFixed(3) };
    }, data.mineRuin.i);
    console.log('decal da mina sobre o relevo', JSON.stringify(data.mineDrape));
    check('o decal da mina acompanha o relevo (todos os vértices 0,01–0,06 u acima do terreno; plano reto ficava até 0,4 u dentro/fora)', data.mineDrape.aboveTerrainMin >= 0.01 && data.mineDrape.aboveTerrainMax <= 0.06, JSON.stringify(data.mineDrape));
  }
  if (data.mineRuin) data.visibleMine = await ruinVisibility(data.mineRuin.i, data.mine.x, data.mine.z, 4.4);
  console.log('visibilidade da ruína da mina (anel 4,4 u, fora da pegada do modelo de ~3,5 u)', JSON.stringify(data.visibleMine));
  check('ruína da mina VISÍVEL fora da pegada do modelo (diferença média de cor ≥ 30 no anel de 4,4 u, ligada × desligada)', !!data.visibleMine && data.visibleMine.meanDiff >= 30, JSON.stringify(data.visibleMine));
  check('RESOURCE_DEPLETED emitido uma vez para o ouro', data.mineEvent.length === 1 && data.mineEvent[0].type === 'gold', JSON.stringify(data.mineEvent));
  check('ruína da mina no local, com raio de decal maior que a pegada do modelo (> 3,6)', !!data.mineRuin && data.mineRuin.decalScale > 3.6, JSON.stringify(data.mineRuin));

  // ---------------------------------------------------------------- 4. desvanecimento: espera a ruína da Caserna chegar a ~47,5 s
  await cam(page, site.cx, 1, site.cz, 0.62, Math.PI / 4, 1200);
  await page.waitForFunction((s) => {
    const r = window.game.session.ruins;
    const sl = r.slots.find((q) => q.state !== 'free' && Math.hypot(q.x - s.barracks.x, q.z - s.barracks.z) < 0.5);
    return !sl || sl.age >= 47.4;
  }, site, { timeout: 120000, polling: 100 });
  const fadeState = (await ruinState()).find((s) => Math.hypot(s.x - site.barracks.x, s.z - site.barracks.z) < 0.5) || null;
  data.fade = fadeState;
  console.log('desvanecendo', JSON.stringify(fadeState));
  const imgFade = await shotTmp(page, 'fade.png');
  check('aos ~47,5 s a opacidade está em ~0,5 e o entulho afunda', !!fadeState && fadeState.opacity > 0.35 && fadeState.opacity < 0.65 && fadeState.debrisY < fadeState.baseY, JSON.stringify(fadeState));
  montage(`${ITEM}-2-mina-e-desvanecimento.png`, [
    { file: imgMine, label: 'mina de ouro esgotada (ruina colapsada)', crop: [200, 40, 1080, 535] },
    { file: imgFade, label: `Caserna/Casa aos ${fadeState ? fadeState.age.toFixed(1) : '?'} s (desvanecendo)`, crop: [200, 40, 1080, 535] }
  ], { cols: 2, panelW: 640 });

  // aguarda passar dos 50 s: o slot deve ser liberado e o grupo ocultado
  await page.waitForFunction((s) => {
    const r = window.game.session.ruins;
    return !r.slots.some((q) => q.state !== 'free' && Math.hypot(q.x - s.barracks.x, q.z - s.barracks.z) < 0.5);
  }, site, { timeout: 30000, polling: 200 });
  data.samples = await page.evaluate(() => { clearInterval(window.__sampler); return window.__samples; });
  const bs = data.samples.filter((q) => q.i === (fadeState && fadeState.i));
  const alphaOf = (age) => (age <= 45 ? 1 : age >= 50 ? 0 : 1 - (age - 45) / 5);
  const worst = Math.max(0, ...bs.filter((q) => q.state === 'active').map((q) => Math.abs(q.opacity - alphaOf(q.age))));
  const last = bs[bs.length - 1];
  console.log('amostras da ruína da Caserna (idade → opacidade):', bs.map((q) => `${q.age}→${q.opacity}`).join(' '));
  check('opacidade segue ruinAlpha(idade) (45 s plena, linear até 0 aos 50 s)', bs.length > 10 && worst < 0.12, `maior desvio=${worst.toFixed(3)} amostras=${bs.length}`);
  data.freed = await page.evaluate((i) => { const q = window.game.session.ruins.slots[i]; return { state: q.state, groupVisible: q.group.visible, age: +q.age.toFixed(2) }; }, fadeState ? fadeState.i : 0);
  check('depois dos 50 s a ruína é removida (slot livre, grupo oculto)', data.freed.state === 'free' && data.freed.groupVisible === false && data.freed.age >= 50, JSON.stringify(data.freed) + (last ? ` | última amostra: idade=${last.age} estado=${last.state}` : ''));
  check('sem erros de console', S.errors.length === 0, S.errors.slice(0, 3).join(' / '));
} catch (e) {
  console.error('ERRO no cenário:', e);
  S.errors.push('script: ' + e.message);
} finally {
  await S.close();
}
code = finish(ITEM, data, S.errors, S.warnings);
process.exitCode = code;
