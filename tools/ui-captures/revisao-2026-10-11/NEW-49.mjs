#!/usr/bin/env node
/**
 * NEW-49 — golpe do Arremessador de Machados (troll orc) sem saltos de pose.
 *  A) INSPETOR (`axethrower_glb`, GLB real, `animator.setTime(p)` para p = 0..1, passo 0,002, nas duas variantes de ataque):
 *     amplitude do salto máximo por quadro de cada parte (torso, cabeça, braços, `weaponR`) e a posição do machado em mundo;
 *     tira de 6 poses (0,30 / 0,50 / 0,59 / 0,61 / 0,70 / 0,79).
 *  B) JOGO (`?play&faction=orc`, animador e `UnitView` reais): 8 Arremessadores atacam um boneco hostil; amostra por quadro (rAF) as rotações
 *     das partes durante o `fight` já fora do cross-fade e procura saltos > 0,5 rad entre quadros (o defeito original: 2,3 rad em p = 0,60 e 0,78).
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-49.mjs
 * Saída: NEW-49-1-inspetor-tira.png, NEW-49-2-jogo.png e NEW-49.json.
 */
import { startSession, shotTmp, cam, montage, finish, check, sleep, TMP } from './_common.mjs';
import path from 'node:path';

const ITEM = 'NEW-49';
const data = {};
let code = 1;
const errors = [];
const warnings = [];

// ================================================================ A) inspetor
{
  const S = await startSession({
    port: 5449,
    url: '/inspector.html?model=axethrower_glb&light=day&anim=fight&cam=side',
    ready: () => !!(window.inspectorApp && window.inspectorApp.animator && window.inspectorApp.animator.meshParts && window.inspectorApp.animator.meshParts.weaponR)
  });
  const { page } = S;
  try {
    await page.waitForTimeout(2500); // a recarga do modelo .glb troca o animador: espera assentar
    data.inspector = await page.evaluate(() => {
      const app = window.inspectorApp;
      const an = app.animator;
      const P = an.meshParts;
      return {
        item: app.currentModelItem && app.currentModelItem.id, glb: !!(app.currentModelItem && app.currentModelItem.glb),
        parts: Object.fromEntries(['torso', 'head', 'armL', 'armR', 'weapon', 'weaponR', 'drawnAxe'].map((k) => [k, P[k] ? P[k].name || '(sem nome)' : null])),
        weaponIsSameNode: P.weapon === P.weaponR && P.weaponR === P.drawnAxe
      };
    });
    console.log('inspetor', JSON.stringify(data.inspector));
    check('o inspetor carregou o .glb real do Arremessador com weaponR ligado', data.inspector.item === 'axethrower_glb' && data.inspector.glb && !!data.inspector.parts.weaponR, JSON.stringify(data.inspector));

    // amostra a fase inteira
    data.sweep = await page.evaluate(() => {
      const app = window.inspectorApp;
      const an = app.animator;
      an.setAnimation('fight', true);
      an.pause();
      const P = an.meshParts;
      const parts = ['torso', 'head', 'armL', 'armR', 'weaponR'];
      const wp = new (P.weaponR.position.constructor)();
      const out = {};
      for (const variant of [0, 1]) {
        an.setAttackVariant(variant);
        let prev = null, prevW = null;
        const worst = Object.fromEntries(parts.map((k) => [k, { d: 0, at: 0 }]));
        let worldWorst = { d: 0, at: 0 };
        let window2 = { d: 0, at: 0 }; // salto máximo dentro de 0,55–0,82 (as fronteiras do defeito)
        for (let i = 0; i <= 500; i++) {
          const p = i / 500;
          an.setTime(p, false);
          app.currentModelObject.updateMatrixWorld(true);
          P.weaponR.getWorldPosition(wp);
          const cur = Object.fromEntries(parts.map((k) => [k, [P[k].rotation.x, P[k].rotation.y, P[k].rotation.z]]));
          const w = [wp.x, wp.y, wp.z];
          if (prev) {
            for (const k of parts) {
              const d = Math.max(Math.abs(cur[k][0] - prev[k][0]), Math.abs(cur[k][1] - prev[k][1]), Math.abs(cur[k][2] - prev[k][2]));
              if (d > worst[k].d) worst[k] = { d, at: p };
              if (p >= 0.55 && p <= 0.82 && d > window2.d) window2 = { d, at: p, part: k };
            }
            const wd = Math.hypot(w[0] - prevW[0], w[1] - prevW[1], w[2] - prevW[2]);
            if (wd > worldWorst.d) worldWorst = { d: wd, at: p };
          }
          prev = cur; prevW = w;
        }
        out[`variant${variant}`] = {
          worstRotationStep: Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, { rad: +v.d.toFixed(4), at: +v.at.toFixed(3) }])),
          worstWindow055_082: { rad: +window2.d.toFixed(4), at: +window2.at.toFixed(3), part: window2.part },
          worstWeaponWorldStep: { units: +worldWorst.d.toFixed(4), at: +worldWorst.at.toFixed(3) }
        };
      }
      return out;
    });
    console.log('varredura', JSON.stringify(data.sweep));
    for (const v of ['variant0', 'variant1']) {
      const w = data.sweep[v];
      const worstAll = Math.max(...Object.values(w.worstRotationStep).map((x) => x.rad));
      check(`inspetor (${v}): nenhuma parte salta entre amostras de 0,002 (maior passo ≤ 0,12 rad; o defeito era 2,3 rad)`, worstAll <= 0.12, `maior passo=${worstAll} rad`);
      check(`inspetor (${v}): o machado de mão não salta no espaço (passo ≤ 0,25 u/amostra)`, w.worstWeaponWorldStep.units <= 0.25, `${w.worstWeaponWorldStep.units} u em p=${w.worstWeaponWorldStep.at}`);
    }

    // tira de poses (variante 0)
    const files = [];
    const ps = [0.3, 0.5, 0.59, 0.61, 0.7, 0.79];
    for (const p of ps) {
      await page.evaluate((p) => { const an = window.inspectorApp.animator; an.setAttackVariant(0); an.setAnimation('fight', true); an.pause(); an.setTime(p, false); }, p);
      await page.waitForTimeout(250);
      const f = path.join(TMP, `pose-${p}.png`);
      await page.locator('#canvas3d').screenshot({ path: f });
      files.push({ file: f, label: `p = ${p.toFixed(2)}` });
    }
    montage(`${ITEM}-1-inspetor-tira.png`, files, { cols: 3, panelW: 420 });
    errors.push(...S.errors);
    warnings.push(...S.warnings);
  } catch (e) {
    console.error('ERRO no inspetor:', e);
    errors.push('script(inspetor): ' + e.message);
  } finally {
    await S.close();
  }
}

// ================================================================ B) jogo
{
  const S = await startSession({
    port: 5450,
    url: '/?skipPreload&texq=low&play&map=continental-1v1&faction=orc',
    freezeAi: true
  });
  const { page } = S;
  try {
    data.setup = await page.evaluate(async () => {
      const gm = window.game.gameManager;
      const me = gm.localPlayerId;
      const foeId = gm.players.find((p) => p.id !== me && p.id !== 99).id;
      const hq = gm.buildings.find((b) => b.ownerId === me && b.role === 'hq').mesh.position;
      const free = (x, z) => gm.canPlaceBuilding('orc_house', x, z, null, me);
      let spot = null;
      for (let r = 14; r <= 70 && !spot; r += 3) { // busca ampla (como no NEW-35): antes r <= 40 e 20 graus não achava espaço neste mapa
        for (let a = 0; a < 360 && !spot; a += 10) {
          const x = hq.x + Math.cos((a * Math.PI) / 180) * r, z = hq.z + Math.sin((a * Math.PI) / 180) * r;
          if (free(x, z) && free(x - 7, z + 7) && free(x + 5, z - 5) && free(x - 3.5, z + 3.5)) spot = { x, z };
        }
      }
      if (!spot) return null;
      const dummy = gm.spawnUnit('knight', spot.x + 5, spot.z - 5, foeId); // à direita (câmera padrão), a ~7 u dos arremessadores
      dummy.hp = dummy.maxHp = 100000;
      dummy.speed = 0;
      const axes = [];
      // M1-05: 8 Arremessadores (a variante de ataque vem do id; com 4 as duas variantes nem sempre apareciam e o check ficava instável)
      for (let i = 0; i < 8; i++) axes.push(gm.spawnUnit('axethrower', spot.x - 3.5 - (i % 2) * 2.2 + (i > 1 ? 1.5 : 0) - Math.floor(i / 4) * 1.4, spot.z + 3.5 + (i % 2) * 2.2 - (i > 1 ? 1.5 : 0) + Math.floor(i / 4) * 1.4, me));
      gm.fogOfWar.revealArea(spot.x, spot.z, 24, 900);
      gm.issue({ type: 'attack', playerId: me, unitIds: axes.map((u) => u.id), targetId: dummy.id });
      // a view (UnitView) só existe depois de um quadro de render: espera dois quadros antes de consultá-la
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const views = axes.map((u) => gm.entityViews.viewOf(u));
      window.__axes = axes.map((u) => u.id);
      return {
        spot, ids: window.__axes, variants: views.map((v) => v.animator.attackVariant), range: axes[0].attackRange, cooldown: axes[0].effAttackCooldown,
        weaponRFound: views.map((v) => !!v.animator.meshParts.weaponR), sameNode: views.map((v) => v.animator.meshParts.weapon === v.animator.meshParts.weaponR)
      };
    });
    if (!check('achou espaço aberto para o teste no jogo', !!data.setup)) throw new Error('sem espaço');
    console.log('cenário', JSON.stringify(data.setup));
    check('o animador do jogo tem weaponR ligado nos 8 Arremessadores (variantes 0 e 1 presentes)', data.setup.weaponRFound.every(Boolean) && data.setup.variants.includes(0) && data.setup.variants.includes(1), `variantes=${data.setup.variants}`);
    const C = { x: data.setup.spot.x - 1, z: data.setup.spot.z + 1 };
    await cam(page, C.x, 1.5, C.z, 0.5, Math.PI / 4, 2200);

    // amostrador por quadro
    await page.evaluate(() => {
      window.__axeWatch = (ms, ids) => new Promise((resolve) => {
        const gm = window.game.gameManager;
        const BLEND = 0.14;
        const items = ids.map((id) => {
          const u = gm.entitiesById.get(id);
          const an = gm.entityViews.viewOf(u).animator;
          const P = an.meshParts;
          return { id, u, an, nodes: { torso: P.torso, head: P.head, armL: P.armL, armR: P.armR, weaponR: P.weaponR }, prev: null };
        });
        const out = { frames: 0, perUnit: {}, frameDt: [] };
        const t0 = performance.now();
        let tPrev = t0;
        const step = () => {
          const now = performance.now();
          const dt = (now - tPrev) / 1000;
          tPrev = now;
          out.frames++;
          out.frameDt.push(dt);
          for (const x of items) {
            const cur = {};
            for (const k in x.nodes) { const n = x.nodes[k]; cur[k] = n ? [n.rotation.x, n.rotation.y, n.rotation.z] : null; }
            const rec = out.perUnit[x.id] || (out.perUnit[x.id] = { variant: x.an.attackVariant, fightFrames: 0, maxByPart: {}, maxAtP: {}, jumps: [], states: {} });
            rec.states[x.u.state + '/' + x.an.currentAnim] = (rec.states[x.u.state + '/' + x.an.currentAnim] || 0) + 1;
            if (x.prev && x.an.currentAnim === 'fight' && x.u.state === 'attacking' && x.an._blendT >= BLEND && dt > 0 && dt < 0.05) {
              rec.fightFrames++;
              const p = x.an.time / x.an.getDuration();
              for (const k in cur) {
                if (!cur[k] || !x.prev[k]) continue;
                const d = Math.max(Math.abs(cur[k][0] - x.prev[k][0]), Math.abs(cur[k][1] - x.prev[k][1]), Math.abs(cur[k][2] - x.prev[k][2]));
                if (d > (rec.maxByPart[k] || 0)) { rec.maxByPart[k] = d; rec.maxAtP[k] = p; }
                // salto = passo grande E velocidade angular acima do máximo legítimo da animação. M1-05: medido no jogo, o pico legítimo é ~25 rad/s
                // (variante 1, armR em p≈0,575 e weaponR em p≈0,87: 0,35 rad em 14 ms; = 34/cooldown de 1,35 s); o limiar antigo de 30/cooldown (22 rad/s)
                // reprovava na borda. Novo limiar 45/cooldown (33 rad/s, 1,3× o pico); o defeito (2,3 rad num quadro de 16 ms) dá ~140 rad/s.
                if (d > 0.3 && d / dt > 45 / x.u.effAttackCooldown) rec.jumps.push({ part: k, rad: +d.toFixed(3), p: +p.toFixed(3), dtMs: Math.round(dt * 1000) });
              }
            }
            x.prev = cur;
          }
          if (now - t0 < ms) requestAnimationFrame(step); else resolve(out);
        };
        requestAnimationFrame(step);
      });
      window.__axeWatchP = window.__axeWatch(14000, window.__axes);
    });

    // quadro no meio do arremesso (progresso 0,50–0,56 do 1º arremessador, depois de 3 s de combate)
    await sleep(3000);
    await cam(page, C.x - 2.2, 1.6, C.z + 2.2, 0.34, Math.PI / 4, 1500);
    const hP = await page.waitForFunction((id) => {
      const gm = window.game.gameManager;
      const an = gm.entityViews.viewOf(gm.entitiesById.get(id)).animator;
      const p = an.time / an.getDuration();
      return gm.entitiesById.get(id).state === 'attacking' && p >= 0.5 && p <= 0.56 ? p : false;
    }, data.setup.ids[0], { timeout: 20000, polling: 'raf' });
    const pAtPoll = +(await hP.jsonValue()).toFixed(3);
    const imgGame = await shotTmp(page, 'jogo.png');
    data.gameFrame = await page.evaluate((id) => {
      const gm = window.game.gameManager;
      const an = gm.entityViews.viewOf(gm.entitiesById.get(id)).animator;
      return { p: +(an.time / an.getDuration()).toFixed(3), weaponRx: +an.meshParts.weaponR.rotation.x.toFixed(3), armRx: +an.meshParts.armR.rotation.x.toFixed(3) };
    }, data.setup.ids[0]);

    data.watch = await page.evaluate(() => window.__axeWatchP);
    const dts = data.watch.frameDt.slice(1);
    data.frameStats = { frames: data.watch.frames, medianDtMs: +(dts.slice().sort((a, b) => a - b)[Math.floor(dts.length / 2)] * 1000).toFixed(1), over50ms: dts.filter((d) => d >= 0.05).length };
    delete data.watch.frameDt;
    for (const [id, rec] of Object.entries(data.watch.perUnit)) {
      rec.maxByPart = Object.fromEntries(Object.entries(rec.maxByPart).map(([k, v]) => [k, +v.toFixed(4)]));
      rec.maxAtP = Object.fromEntries(Object.entries(rec.maxAtP).map(([k, v]) => [k, +v.toFixed(3)]));
    }
    console.log('amostragem por quadro', JSON.stringify(data.watch), JSON.stringify(data.frameStats));
    const recs = Object.values(data.watch.perUnit);
    check('os 8 Arremessadores lutaram (≥ 150 quadros de `fight` fora do cross-fade cada)', recs.length === 8 && recs.every((r) => r.fightFrames >= 150), JSON.stringify(recs.map((r) => r.fightFrames)));
    check('nenhum salto de pose entre quadros em nenhuma parte (passo > 0,3 rad E velocidade acima do máximo legítimo; as duas variantes)', recs.every((r) => r.jumps.length === 0), JSON.stringify(recs.map((r) => r.jumps.slice(0, 3))));
    const worstGame = Math.max(...recs.flatMap((r) => Object.values(r.maxByPart)));
    check('maior passo por quadro no jogo ≤ 0,6 rad (arremesso é a fase mais rápida; o defeito era 2,3 rad)', worstGame <= 0.6, `maior passo=${worstGame.toFixed(3)} rad (quadros: mediana ${data.frameStats.medianDtMs} ms, ≥ 50 ms: ${data.frameStats.over50ms})`);

    montage(`${ITEM}-2-jogo.png`, [{ file: imgGame, label: `jogo: Arremessador no meio do arremesso (p=${pAtPoll} ao medir; disparo em 0,60)`, crop: [160, 40, 1120, 580] }], { cols: 1, panelW: 760 });
    errors.push(...S.errors);
    warnings.push(...S.warnings);
  } catch (e) {
    console.error('ERRO no jogo:', e);
    errors.push('script(jogo): ' + e.message);
  } finally {
    await S.close();
  }
}

check('sem erros de console', errors.length === 0, errors.slice(0, 3).join(' / '));
code = finish(ITEM, data, errors, warnings);
process.exitCode = code;
