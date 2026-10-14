#!/usr/bin/env node
/**
 * NEW-13 — chamas de construção inimiga sob a névoa. Duas partes:
 *  (1) uma construção inimiga em chamas (PV < 50 %) já vista e agora na MEMÓRIA da névoa (explorada, sem visão atual) não
 *      pode animar as chamas nem emitir fumaça; visível, anima normalmente. Mede `BuildingView.flameTime`, a escala de uma
 *      língua de fogo por quadro (rAF) e os eventos `BUILDING_VFX` da construção, nos dois estados.
 *  (2) o fundo além da borda do mapa (área não explorada) escurece com a névoa em vez de mostrar o azul do céu.
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-13.mjs
 * Saída: NEW-13-1-chamas.png (visível × memória), NEW-13-2-borda.png (borda do mapa) e NEW-13.json (o NEW-13.antes-da-correcao.json guarda a 1ª medição, antes das correções).
 */
import { execFileSync } from 'node:child_process';
import { startSession, shotTmp, cam, montage, finish, check } from './_common.mjs';

const ITEM = 'NEW-13';
const S = await startSession({
  port: 5413,
  url: '/?skipPreload&texq=low&play&map=continental-1v1&faction=human',
  freezeAi: true
});
const { page } = S;
const data = {};
let code = 1;
try {
  // ---------------------------------------------------------------- 1. alvo: Centro inimigo em chamas
  data.target = await page.evaluate(async () => {
    const gm = window.game.gameManager;
    const { EVT } = await import('/src/sim/events.js');
    const b = gm.buildings.find((x) => x.ownerId !== gm.localPlayerId && x.ownerId !== 99 && x.role === 'hq');
    window.__t = { b, emits: 0, other: 0 };
    gm.events.on(EVT.BUILDING_VFX, (p) => { if (p.buildingId === b.id) window.__t.emits++; else window.__t.other++; }, true);
    b.hp = b.maxHp * 0.3; // < 50 %: chamas de dano
    b.wasDamaged = true;
    return { id: b.id, type: b.type, owner: b.ownerId, x: b.mesh.position.x, z: b.mesh.position.z, hp: b.hp, maxHp: b.maxHp };
  });
  console.log('alvo', JSON.stringify(data.target));

  /** Amostra (rAF) por `ms`: flameTime, escala da 1ª língua de fogo, emissões de fumaça e estado da névoa. */
  const sample = (ms) => page.evaluate(async (ms) => {
    const gm = window.game.gameManager;
    const { b } = window.__t;
    const view = gm.entityViews.viewOf(b);
    const mem = gm.fogOfWar.buildingMemory;
    const out = { frames: 0, t0: view.flameTime ?? null, emits0: window.__t.emits, scales: [], rots: [] };
    const start = performance.now();
    await new Promise((res) => {
      const step = () => {
        out.frames++;
        const tg = view.flameTongues && view.flameTongues[0];
        if (tg) { out.scales.push(+tg.mesh.scale.y.toFixed(4)); out.rots.push(+tg.mesh.rotation.z.toFixed(4)); }
        if (performance.now() - start < ms) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    out.t1 = view.flameTime ?? null;
    out.emits1 = window.__t.emits;
    out.flamesVisible = !!(view.flamesGroup && view.flamesGroup.visible);
    out.scaleRange = out.scales.length ? +(Math.max(...out.scales) - Math.min(...out.scales)).toFixed(4) : null;
    out.rotRange = out.rots.length ? +(Math.max(...out.rots) - Math.min(...out.rots)).toFixed(4) : null;
    delete out.scales; delete out.rots;
    out.fog = { enabled: gm.fogOfWar.enabled, visibleNow: mem.isVisibleNow(b), known: mem.isKnown(b), fogHidden: !!view.fogHidden, fogMemory: view.fogMemory ?? null, rootVisible: view.root.visible };
    return out;
  }, ms);

  // ---------------------------------------------------------------- 2. fase A: visível (revelação temporária)
  await page.evaluate(([x, z]) => { window.game.gameManager.fogOfWar.revealArea(x, z, 16, 12); }, [data.target.x, data.target.z]);
  await cam(page, data.target.x, 3, data.target.z, 0.62, Math.PI / 4, 1800);
  data.visible = await sample(1500);
  console.log('A (visível)', JSON.stringify(data.visible));
  const imgA = await shotTmp(page, 'a.png');
  check('A: a construção está visível agora e as chamas existem', data.visible.fog.visibleNow && data.visible.flamesVisible);
  check('A: visível, as chamas animam (flameTime avança ≥ 1 s)', data.visible.t1 - (data.visible.t0 || 0) >= 1.0, `Δ=${(data.visible.t1 - (data.visible.t0 || 0)).toFixed(2)} s`);
  check('A: visível, a língua de fogo oscila (escala)', data.visible.scaleRange > 0.05, `faixa=${data.visible.scaleRange}`);

  // ---------------------------------------------------------------- 3. fase B: memória (sem visão atual)
  await page.waitForFunction(() => {
    const gm = window.game.gameManager;
    return !gm.fogOfWar.buildingMemory.isVisibleNow(window.__t.b);
  }, null, { timeout: 30000, polling: 250 });
  await page.waitForTimeout(500);
  data.memory = await sample(3000);
  console.log('B (memória)', JSON.stringify(data.memory));
  const imgB = await shotTmp(page, 'b.png');
  check('B: na memória da névoa (conhecida, não visível, view não escondida)', data.memory.fog.known && !data.memory.fog.visibleNow && !data.memory.fog.fogHidden);
  check('B: na memória, as chamas não animam (flameTime parado)', data.memory.t1 === data.memory.t0, `Δ=${((data.memory.t1 || 0) - (data.memory.t0 || 0)).toFixed(3)} s`);
  check('B: na memória, a língua de fogo não oscila', data.memory.scaleRange === 0 && data.memory.rotRange === 0, `faixa escala=${data.memory.scaleRange} rot=${data.memory.rotRange}`);
  check('B: na memória, nenhuma fumaça é emitida pela construção', data.memory.emits1 === data.memory.emits0, `emissões=${data.memory.emits1 - data.memory.emits0}`);

  montage(`${ITEM}-1-chamas.png`, [
    { file: imgA, label: `A: visivel  flameTime +${(data.visible.t1 - (data.visible.t0 || 0)).toFixed(2)} s`, crop: [240, 60, 1040, 510] },
    { file: imgB, label: `B: memoria  flameTime +${((data.memory.t1 || 0) - (data.memory.t0 || 0)).toFixed(2)} s`, crop: [240, 60, 1040, 510] }
  ], { cols: 2, panelW: 640 });

  // ---------------------------------------------------------------- 4. borda do mapa: fundo escurece com a névoa
  // Pixels "cor de céu" medidos na foto final (com o pós-processamento), nos 45 % de cima: azul claro (b > 150 e b − r > 50).
  const skyFraction = (file) => JSON.parse(execFileSync('python3', ['-I', '-c', `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
n = k = 0
for y in range(0, int(h * 0.45), 2):
    for x in range(0, w, 2):
        r, g, b = px[x, y]
        n += 1
        if b > 150 and b - r > 50:
            k += 1
print(json.dumps({'fraction': round(k / n, 5), 'pixels': k, 'sampled': n}))
`, file]).toString());
  await page.evaluate(() => { window.game.gameManager.fogOfWar.setEnabled(true); });
  data.edge = {};
  // (a) câmera realista: o alvo não passa de ±55 (SceneManager.panCamera) e o zoom máximo é 1,8
  await cam(page, -55, 0, -55, 1.8, Math.PI / 4, 1800);
  const imgE = await shotTmp(page, 'e.png');
  data.edge.realistic = { target: [-55, -55], zoom: 1.8, ...skyFraction(imgE) };
  // (b) extremo: alvo fora do que a câmera permite (-72), só para medir a folga
  await cam(page, -72, 0, -72, 1.8, Math.PI / 4, 1800);
  data.edge.extreme = { target: [-72, -72], zoom: 1.8, ...skyFraction(await shotTmp(page, 'e2.png')) };
  console.log('borda', JSON.stringify(data.edge));
  check('borda: com a névoa, o fundo além do mapa é escuro (câmera realista e extrema, ≤ 0,1 % de pixels cor-de-céu nos 45 % de cima)', data.edge.realistic.fraction <= 0.001 && data.edge.extreme.fraction <= 0.001, `fração=${data.edge.realistic.fraction} (extremo=${data.edge.extreme.fraction})`);
  montage(`${ITEM}-2-borda.png`, [{ file: imgE }], { cols: 1, panelW: 800 }); // sem rótulo: o céu aparece nos cantos de cima

  check('sem erros de console', S.errors.length === 0, S.errors.slice(0, 3).join(' / '));
} finally {
  await S.close();
}
code = finish(ITEM, data, S.errors, S.warnings);
process.exitCode = code;
