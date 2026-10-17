#!/usr/bin/env node
/**
 * NEW-35 — ataque no chão do cerco com CLIQUE DIREITO no chão (`CMD.ATTACK_GROUND`). Orcs × IA humana (frozen) em
 * `continental-1v1`: uma Catapulta do jogador a ~24 u de um ponto do chão, um alvo-boneco hostil colado ao ponto.
 *  - clique direito REAL do mouse no chão → comando `attackGround` (espionado em `gm.issue`), estado `attackingGround`,
 *    a catapulta se aproxima até o alcance (20), dispara em arco no ponto (sem alvo-entidade) e o impacto causa dano em área;
 *  - dentro do alcance mínimo (4) ela recua; seleção mista (catapulta + grunt) → ATTACK_GROUND só para o cerco, MOVE para o resto;
 *  - sincronia da animação do braço com o disparo (progresso 0,6): `attackingGround` × `attacking` (controle, ataque a entidade).
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-35.mjs
 * Saída: NEW-35-1-clique-direito.png (voo e impacto), NEW-35-2-braco-no-disparo.png (pose do braço no disparo) e NEW-35.json.
 */
import { startSession, shotTmp, cam, screenOf, montage, finish, check, sleep } from './_common.mjs';

const ITEM = 'NEW-35';
const S = await startSession({
  port: 5435,
  url: '/?skipPreload&texq=low&play&map=continental-1v1&faction=orc',
  freezeAi: true
});
const { page } = S;
const data = {};
let code = 1;

/** Distância circular entre dois progressos (0..1). */
const cdist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

/** Resume uma amostragem por quadro: sincronia da animação com o ciclo de ataque e relação braço × disparo. */
function summarize(w, stateName) {
  const fight = w.samples.filter((s) => s.st === stateName && s.anim === 'fight');
  const err = fight.map((s) => cdist(s.panim, s.ptimer));
  // "disparos do braço": passagens de rx ≥ 0,3 para ≤ -0,5 (a catapulta lança o braço para a frente)
  // M1-05: o lançamento dura ~0,12 do ciclo (dezenas de quadros): o detector antigo exigia a queda 0,3 → -0,5 entre DOIS quadros
  // consecutivos (nunca ocorre, nem no controle). Agora: arma quando rx ≥ 0,3 e conta ao chegar a rx ≤ -0,5 (borda).
  let releases = 0;
  let armed = false;
  for (let i = 0; i < w.samples.length; i++) {
    const b = w.samples[i].armRx;
    if (b === null) continue;
    if (b >= 0.3) armed = true;
    else if (b <= -0.5 && armed) { releases++; armed = false; }
  }
  return {
    state: stateName,
    seconds: +(w.samples.length ? (w.samples[w.samples.length - 1].t - w.samples[0].t) / 1000 : 0).toFixed(1),
    fightFrames: fight.length,
    phaseErrMean: err.length ? +(err.reduce((a, b) => a + b, 0) / err.length).toFixed(3) : null,
    phaseErrMax: err.length ? +Math.max(...err).toFixed(3) : null,
    framesWithErrOver0_1: err.length ? +(err.filter((e) => e > 0.1).length / err.length).toFixed(3) : null,
    projectiles: w.shots.length,
    armReleases: releases,
    shots: w.shots
  };
}

try {
  // ---------------------------------------------------------------- 1. cenário
  data.setup = await page.evaluate(async () => {
    const { EVT } = await import('/src/sim/events.js');
    const gm = window.game.gameManager;
    const me = gm.localPlayerId;
    const foeId = gm.players.find((p) => p.id !== me && p.id !== 99).id;
    const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq').mesh.position;
    const free = (x, z) => gm.canPlaceBuilding('orc_house', x, z, null, me);
    let found = null;
    // busca ampla (antes r ≤ 44 e 20°: só 1 de 180 candidatos passava nas 4 condições neste mapa, e o setup ficava sem espaço)
    for (let r = 16; r <= 70 && !found; r += 3) {
      for (let a = 0; a < 360 && !found; a += 10) {
        const G = { x: hq.x + Math.cos((a * Math.PI) / 180) * r, z: hq.z + Math.sin((a * Math.PI) / 180) * r };
        const D = { x: G.x - 0.6, z: G.z - 0.6 }; // boneco do outro lado do ponto (o raio do clique não o atravessa)
        // M1-05: o lado da catapulta (a 17 u de G) tenta várias direções, começando pela diagonal original (-17,+17); a posição da base
        // varia entre execuções e só com essa diagonal às vezes nenhum ponto passava (rio/mar do mapa).
        for (const [ux, uz] of [[-1, 1], [1, -1], [-1, 0], [1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
          const k = 17 / Math.hypot(ux, uz);
          const Sp = { x: G.x + ux * k, z: G.z + uz * k };
          if (!found && free(G.x, G.z) && free(Sp.x, Sp.z) && free(D.x, D.z) && free(G.x + ux * k / 2, G.z + uz * k / 2)) found = { G, S: Sp, D };
        }
      }
    }
    if (!found) return null;
    const cat = gm.spawnUnit('catapult', found.S.x, found.S.z, me);
    const dummy = gm.spawnUnit('knight', found.D.x, found.D.z, foeId);
    dummy.hp = dummy.maxHp = 100000;
    dummy.speed = 0;
    gm.fogOfWar.revealArea(found.G.x, found.G.z, 24, 900);
    window.__issued = [];
    const orig = gm.issue.bind(gm);
    gm.issue = (c) => { window.__issued.push({ type: c.type, n: (c.unitIds || []).length, x: c.x !== undefined ? +c.x.toFixed(2) : undefined, z: c.z !== undefined ? +c.z.toFixed(2) : undefined }); return orig(c); };
    window.__hits = [];
    window.__fired = [];
    gm.events.on(EVT.PROJECTILE_HIT, (p) => window.__hits.push({ kind: p.kind, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), t: Math.round(performance.now()) }), true);
    gm.events.on(EVT.PROJECTILE_FIRED, (p) => window.__fired.push({ kind: p.kind, t: Math.round(performance.now()) }), true);
    // amostrador por quadro: estado da catapulta, ciclo de ataque, tempo da animação e rotação do braço
    window.__watch = (ms, id) => new Promise((resolve) => {
      const c = gm.entitiesById.get(id);
      const an = gm.entityViews.viewOf(c).animator;
      const arm = an.meshParts && an.meshParts.siegeArm;
      const out = { samples: [], shots: [] };
      let last = window.__fired.length;
      const t0 = performance.now();
      const step = () => {
        const t = performance.now() - t0;
        const s = {
          t: Math.round(t), st: c.state, anim: an.currentAnim, ptimer: +Math.min(1, c.attackTimer / c.effAttackCooldown).toFixed(3),
          panim: +(an.time / an.getDuration()).toFixed(3), armRx: arm ? +arm.rotation.x.toFixed(3) : null,
          x: +c.mesh.position.x.toFixed(2), z: +c.mesh.position.z.toFixed(2)
        };
        out.samples.push(s);
        if (window.__fired.length > last) out.shots.push({ t: s.t, panim: s.panim, ptimer: s.ptimer, armRx: s.armRx, st: s.st });
        last = window.__fired.length;
        if (t < ms) requestAnimationFrame(step); else resolve(out);
      };
      requestAnimationFrame(step);
    });
    gm.selectSingle(cat);
    return {
      me, foeId, G: found.G, S: found.S, D: found.D, catId: cat.id, dummyId: dummy.id, gy: gm.terrain.getHeight(found.G.x, found.G.z),
      range: cat.attackRange, minRange: cat.minAttackRange, cooldown: cat.effAttackCooldown, splash: cat.splashRadius,
      dummyHp: dummy.hp, selected: gm.selectedUnits.map((u) => u.type)
    };
  });
  if (!check('achou espaço aberto para o teste', !!data.setup)) throw new Error('sem espaço');
  console.log('cenário', JSON.stringify(data.setup));
  const M = { x: (data.setup.G.x + data.setup.S.x) / 2, z: (data.setup.G.z + data.setup.S.z) / 2 };
  await cam(page, M.x, 1.5, M.z, 0.85, Math.PI / 4, 2200);

  // ---------------------------------------------------------------- 2. clique direito REAL no chão (catapulta selecionada)
  const gp = await screenOf(page, data.setup.G.x, data.setup.gy, data.setup.G.z);
  console.log('clique em', JSON.stringify(gp));
  check('o ponto do chão está na tela, fora da HUD', gp.x > 100 && gp.x < 1180 && gp.y > 80 && gp.y < 520, JSON.stringify(gp));
  await page.mouse.move(gp.x, gp.y);
  await sleep(200);
  await page.evaluate(([ms, id]) => { window.__watchP = window.__watch(ms, id); }, [15000, data.setup.catId]);
  await page.mouse.click(gp.x, gp.y, { button: 'right' });
  await sleep(500);
  data.afterClick = await page.evaluate(() => {
    const gm = window.game.gameManager;
    const c = gm.entitiesById.get(gm.selectedUnits[0] ? gm.selectedUnits[0].id : -1) || [...gm.entitiesById.values()].find((e) => e.type === 'catapult');
    return { issued: window.__issued.slice(), state: c.state, groundTarget: c.groundTarget, targetEntity: c.targetEntity ? c.targetEntity.id : null, pos: [+c.mesh.position.x.toFixed(2), +c.mesh.position.z.toFixed(2)] };
  });
  console.log('após o clique', JSON.stringify(data.afterClick));
  check('clique direito no chão emitiu exatamente 1 comando attackGround (sem move)', data.afterClick.issued.length === 1 && data.afterClick.issued[0].type === 'attackGround' && data.afterClick.issued[0].n === 1, JSON.stringify(data.afterClick.issued));
  check('estado attackingGround com groundTarget no ponto clicado e sem alvo-entidade', data.afterClick.state === 'attackingGround' && !!data.afterClick.groundTarget && data.afterClick.targetEntity === null
    && Math.hypot(data.afterClick.groundTarget.x - data.afterClick.issued[0].x, data.afterClick.groundTarget.z - data.afterClick.issued[0].z) < 0.01, JSON.stringify(data.afterClick.groundTarget));

  // 1º projétil em voo e impacto
  await page.waitForFunction(() => window.__fired.length > 0, null, { timeout: 30000, polling: 'raf' });
  await sleep(350);
  const imgFlight = await shotTmp(page, 'voo.png');
  await page.waitForFunction(() => window.__hits.length > 0, null, { timeout: 15000, polling: 'raf' });
  await sleep(180);
  const imgImpact = await shotTmp(page, 'impacto.png');
  data.watchG = summarize(await page.evaluate(() => window.__watchP), 'attackingGround');
  console.log('ataque no chão (amostragem 15 s)', JSON.stringify({ ...data.watchG, shots: data.watchG.shots.length }));
  data.result = await page.evaluate((dummyId) => {
    const gm = window.game.gameManager;
    const c = [...gm.entitiesById.values()].find((e) => e.type === 'catapult');
    const d = gm.entitiesById.get(dummyId); // o boneco do setup (e não o primeiro cavaleiro inimigo do mapa)
    return {
      hits: window.__hits.map((h) => ({ x: h.x, z: h.z })), dummyDamage: Math.round(d.maxHp - d.hp), dummyHpPct: +(d.hp / d.maxHp).toFixed(4),
      catPos: [+c.mesh.position.x.toFixed(2), +c.mesh.position.z.toFixed(2)], fired: window.__fired.length
    };
  }, data.setup.dummyId);
  const G = data.setup.G;
  const hitD = data.result.hits.map((h) => Math.hypot(h.x - data.afterClick.issued[0].x, h.z - data.afterClick.issued[0].z));
  const catD = Math.hypot(data.result.catPos[0] - data.afterClick.issued[0].x, data.result.catPos[1] - data.afterClick.issued[0].z);
  console.log('resultado', JSON.stringify(data.result), 'distância da catapulta ao ponto', catD.toFixed(1), 'erro dos impactos', hitD.map((d) => d.toFixed(2)).join(','));
  check('a catapulta se aproximou até o alcance (≤ 20,5 e ≥ alcance mínimo 4) e disparou ≥ 3 vezes sem nova ordem', catD <= 20.5 && catD >= 4 && data.result.fired >= 3, `dist=${catD.toFixed(1)} disparos=${data.result.fired}`);
  check('os impactos caem no ponto clicado (erro ≤ 0,5 u)', hitD.length >= 3 && hitD.every((d) => d <= 0.5), hitD.map((d) => d.toFixed(2)).join(','));
  check('o impacto em área causa dano ao boneco hostil colado ao ponto', data.result.dummyDamage > 0, `dano total=${data.result.dummyDamage} (${(data.result.dummyHpPct * 100).toFixed(3)} % de PV restante)`);

  // ---------------------------------------------------------------- 3. pose do braço no disparo: ataque no chão × controle (ataque a entidade)
  const catNow = await page.evaluate((id) => { const c = window.game.gameManager.entitiesById.get(id); return { x: c.mesh.position.x, y: c.mesh.position.y, z: c.mesh.position.z }; }, data.setup.catId);
  await cam(page, catNow.x, catNow.y + 0.8, catNow.z, 0.42, Math.PI / 4, 1800);
  const nF0 = await page.evaluate(() => window.__fired.length);
  await page.waitForFunction((n) => window.__fired.length > n, nF0, { timeout: 20000, polling: 'raf' });
  const imgArmGround = await shotTmp(page, 'braco-chao.png');
  data.armGround = await page.evaluate((id) => { const c = window.game.gameManager.entitiesById.get(id); const an = window.game.gameManager.entityViews.viewOf(c).animator; return { st: c.state, ptimer: +(c.attackTimer / c.effAttackCooldown).toFixed(3), panim: +(an.time / an.getDuration()).toFixed(3), armRx: +an.meshParts.siegeArm.rotation.x.toFixed(3) }; }, data.setup.catId);

  // controle: ataque dirigido ao boneco (estado `attacking`, animação sincronizada em `UnitView`)
  await page.evaluate(([ms, id, tid, me]) => {
    window.game.gameManager.issue({ type: 'attack', playerId: me, unitIds: [id], targetId: tid });
    window.__watchP = window.__watch(ms, id);
  }, [11000, data.setup.catId, data.setup.dummyId, data.setup.me]);
  await sleep(1500);
  const nF1 = await page.evaluate(() => window.__fired.length);
  await page.waitForFunction((n) => window.__fired.length > n, nF1, { timeout: 20000, polling: 'raf' });
  const imgArmCtl = await shotTmp(page, 'braco-controle.png');
  data.armControl = await page.evaluate((id) => { const c = window.game.gameManager.entitiesById.get(id); const an = window.game.gameManager.entityViews.viewOf(c).animator; return { st: c.state, ptimer: +(c.attackTimer / c.effAttackCooldown).toFixed(3), panim: +(an.time / an.getDuration()).toFixed(3), armRx: +an.meshParts.siegeArm.rotation.x.toFixed(3) }; }, data.setup.catId);
  data.watchC = summarize(await page.evaluate(() => window.__watchP), 'attacking');
  console.log('controle (ataque a entidade)', JSON.stringify({ ...data.watchC, shots: data.watchC.shots.length }));
  console.log('braço no disparo — chão', JSON.stringify(data.armGround), '| controle', JSON.stringify(data.armControl));
  check('controle: com ataque a entidade a animação do braço acompanha o ciclo de ataque (erro médio ≤ 0,05)', data.watchC.phaseErrMean !== null && data.watchC.phaseErrMean <= 0.05, `erro médio=${data.watchC.phaseErrMean} máx=${data.watchC.phaseErrMax}`);
  check('ataque no chão: a animação do braço acompanha o ciclo de ataque (erro médio ≤ 0,05)', data.watchG.phaseErrMean !== null && data.watchG.phaseErrMean <= 0.05, `erro médio=${data.watchG.phaseErrMean} máx=${data.watchG.phaseErrMax} quadros com erro>0,1=${data.watchG.framesWithErrOver0_1}`);
  check('ataque no chão: 1 lançamento do braço por projétil', Math.abs(data.watchG.armReleases - data.watchG.projectiles) <= 1, `lançamentos do braço=${data.watchG.armReleases} projéteis=${data.watchG.projectiles}`);
  const meanRx = (w) => (w.shots.length ? w.shots.reduce((a, b) => a + b.armRx, 0) / w.shots.length : NaN);
  data.armAtShot = { ground: +meanRx(data.watchG).toFixed(3), control: +meanRx(data.watchC).toFixed(3) };
  check('no instante do disparo o braço está na mesma pose do controle (|Δ rx médio| ≤ 0,35)', Math.abs(data.armAtShot.ground - data.armAtShot.control) <= 0.35, `rx médio no disparo: chão=${data.armAtShot.ground} controle=${data.armAtShot.control}`);

  // ---------------------------------------------------------------- 4. alcance mínimo (ordem direta) e seleção mista (clique real)
  data.minRange = await page.evaluate(async ([id, me]) => {
    const gm = window.game.gameManager;
    const c = gm.entitiesById.get(id);
    const tx = c.mesh.position.x + 1.5, tz = c.mesh.position.z + 1.5; // a ~2,1 u: dentro do alcance mínimo
    gm.issue({ type: 'attackGround', playerId: me, unitIds: [id], x: tx, z: tz });
    const d0 = Math.hypot(c.mesh.position.x - tx, c.mesh.position.z - tz);
    await new Promise((r) => setTimeout(r, 6000));
    const d1 = Math.hypot(c.mesh.position.x - tx, c.mesh.position.z - tz);
    return { d0: +d0.toFixed(2), d1: +d1.toFixed(2), state: c.state, minRange: c.minAttackRange };
  }, [data.setup.catId, data.setup.me]);
  console.log('alcance mínimo', JSON.stringify(data.minRange));
  check('ponto dentro do alcance mínimo: a catapulta recua até ≥ 4 e segue atacando o chão', data.minRange.d0 < 4 && data.minRange.d1 >= 3.9 && data.minRange.state === 'attackingGround', JSON.stringify(data.minRange));

  const mixed = await page.evaluate(async ([id, me]) => {
    const gm = window.game.gameManager;
    const c = gm.entitiesById.get(id);
    const g = gm.spawnUnit('grunt', c.mesh.position.x - 2, c.mesh.position.z + 2, me);
    window.game.inputManager.selectUnits([c, g], { additive: false });
    // ponto livre ~13 u adiante (para a esquerda da tela)
    let P = null;
    for (let r = 10; r <= 18 && !P; r += 2) for (let a = 0; a < 360 && !P; a += 20) {
      const x = c.mesh.position.x - 7 + Math.cos((a * Math.PI) / 180) * r * 0.4, z = c.mesh.position.z + 7 + Math.sin((a * Math.PI) / 180) * r * 0.4;
      if (gm.canPlaceBuilding('orc_house', x, z, null, me)) P = { x, z, y: gm.terrain.getHeight(x, z) };
    }
    window.__issued.length = 0;
    window.__gruntId = g.id;
    return { P, catId: c.id, gruntId: g.id, selected: gm.selectedUnits.map((u) => u.type) };
  }, [data.setup.catId, data.setup.me]);
  data.mixedSetup = mixed;
  if (mixed.P) {
    await cam(page, mixed.P.x, 1.5, mixed.P.z, 0.9, Math.PI / 4, 1800);
    const pp = await screenOf(page, mixed.P.x, mixed.P.y, mixed.P.z);
    await page.mouse.move(pp.x, pp.y);
    await sleep(200);
    await page.mouse.click(pp.x, pp.y, { button: 'right' });
    await sleep(700);
    data.mixed = await page.evaluate(() => {
      const gm = window.game.gameManager;
      const c = [...gm.entitiesById.values()].find((e) => e.type === 'catapult');
      const g = gm.entitiesById.get(window.__gruntId);
      return { issued: window.__issued.slice(), catState: c.state, gruntState: g.state, gruntHasTarget: g.hasTargetPos };
    });
    console.log('seleção mista', JSON.stringify(data.mixed));
    check('seleção mista: attackGround só para o cerco e move para o grunt', data.mixed.issued.some((c) => c.type === 'attackGround' && c.n === 1) && data.mixed.issued.some((c) => c.type === 'move' && c.n === 1) && data.mixed.catState === 'attackingGround' && data.mixed.gruntState !== 'attackingGround', JSON.stringify(data.mixed));
  } else {
    check('seleção mista: ponto livre achado', false);
  }

  // ---------------------------------------------------------------- 5. PNGs
  montage(`${ITEM}-1-clique-direito.png`, [
    { file: imgFlight, label: 'clique direito no chao: projetil em voo', crop: [160, 60, 1120, 600] },
    { file: imgImpact, label: 'impacto no ponto (po e fagulhas)', crop: [160, 60, 1120, 600] }
  ], { cols: 2, panelW: 640 });
  montage(`${ITEM}-2-braco-no-disparo.png`, [
    { file: imgArmGround, label: `ataque no chao: no disparo ptimer=${data.armGround.ptimer} panim=${data.armGround.panim} rx=${data.armGround.armRx}`, crop: [240, 90, 1040, 540] },
    { file: imgArmCtl, label: `controle (ataque a entidade): ptimer=${data.armControl.ptimer} panim=${data.armControl.panim} rx=${data.armControl.armRx}`, crop: [240, 90, 1040, 540] }
  ], { cols: 2, panelW: 640 });

  check('sem erros de console', S.errors.length === 0, S.errors.slice(0, 3).join(' / '));
} catch (e) {
  console.error('ERRO no cenário:', e);
  S.errors.push('script: ' + e.message);
} finally {
  await S.close();
}
// o JSON guarda só um resumo dos disparos (as amostras por quadro ficam fora)
code = finish(ITEM, data, S.errors, S.warnings);
process.exitCode = code;
