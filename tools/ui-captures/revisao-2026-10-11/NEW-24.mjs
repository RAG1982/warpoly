#!/usr/bin/env node
/**
 * NEW-24 — portão visual (WallGate) nas lacunas entre segmentos consecutivos de uma muralha, e muralha no minimapa
 * (linhas/pontos finos em vez de quadrados de 6 px). Cenário (campos-1v1): três fileiras de 8 segmentos do jogador com uma lacuna de
 * 1 segmento (em X, em diagonal) e de 2 segmentos (em Z) e uma fileira inimiga (conhecida pela névoa) de 7 segmentos com lacuna.
 * Mede: nº de portões, posição/rotação de cada um, pixels do minimapa nas posições dos segmentos (cor do dono).
 * Uso: bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/revisao-2026-10-11/NEW-24.mjs
 * Saída: NEW-24-1-portoes.png, NEW-24-2-minimapa.png e NEW-24.json.
 */
import { startSession, shotTmp, cam, montage, finish, check, TMP } from './_common.mjs';
import path from 'node:path';
import fs from 'node:fs';

const ITEM = 'NEW-24';
const S = await startSession({
  port: 5424,
  url: '/?skipPreload&texq=low&play&map=campos-1v1&faction=human', // campos: terreno aberto (as fileiras cabem; a continental tem rio e floresta)
  freezeAi: true
});
const { page } = S;
const data = {};
let code = 1;
const STEP = 2.4;

try {
  // ---------------------------------------------------------------- 1. fileiras com lacuna (portão) + fileira inimiga
  data.setup = await page.evaluate(({ STEP }) => {
    const gm = window.game.gameManager;
    const me = gm.localPlayer; me.resources.gold = 9000; me.resources.wood = 9000; me.resources.stone = 9000;
    const foeId = gm.players.find((p) => p.id !== me.id && p.id !== 99).id;
    const foe = gm.getPlayer(foeId); foe.resources.wood = 9000; foe.resources.stone = 9000;
    const hq = gm.buildings.find((b) => b.ownerId === me.id && b.role === 'hq');
    const hp = hq.mesh.position;
    const wtMe = 'wall_human', wtFoe = 'wall_orc';
    const placed = [];
    const line = (x0, z0, dx, dz, n, skip) => Array.from({ length: n }, (_, i) => ({ x: x0 + dx * i * STEP, z: z0 + dz * i * STEP, i })).filter((p) => !skip.includes(p.i));
    const free = (pts, type, owner) => pts.every((q) => gm.canPlaceBuilding(type, q.x, q.z, null, owner));
    const find = (dx, dz, n, skip, from, type, owner) => {
      for (let r = 0; r < 60; r += 2) {
        for (let a = 0; a < 360; a += 20) {
          const x0 = hp.x + from.x + Math.cos((a * Math.PI) / 180) * r, z0 = hp.z + from.z + Math.sin((a * Math.PI) / 180) * r;
          const pts = line(x0, z0, dx, dz, n, skip);
          if (!free(pts, type, owner)) continue;
          if (placed.some((o) => o.some((q) => pts.some((w) => Math.hypot(q.x - w.x, q.z - w.z) < 10)))) continue;
          placed.push(pts);
          return { x0, z0, pts };
        }
      }
      return null;
    };
    const s2 = Math.SQRT1_2;
    const L = {
      x: find(1, 0, 8, [4], { x: 6, z: 14 }, wtMe, me.id), // lacuna de 1 segmento (4,8 entre centros) ao longo de X
      z: find(0, 1, 8, [3, 4], { x: -22, z: -6 }, wtMe, me.id), // lacuna de 2 segmentos (7,2) ao longo de Z
      d: find(s2, s2, 8, [4], { x: 20, z: -26 }, wtMe, me.id), // diagonal
      foe: find(1, 0, 7, [3], { x: -4, z: 30 }, wtFoe, foe.id) // fileira inimiga com lacuna, perto da base (conhecida pela névoa)
    };
    const made = {};
    for (const [k, v] of Object.entries(L)) {
      if (!v) continue;
      const owner = k === 'foe' ? foe.id : me.id;
      made[k] = gm.placeWall(k === 'foe' ? wtFoe : wtMe, v.pts, [], owner).length;
    }
    gm.buildings.filter((b) => b.role === 'wall').forEach((w) => w.construct(100, gm));
    // deixa os trabalhadores sem rumo longo (o aldeão/peão inimigo mais próximo recebeu a obra)
    gm.allUnits.filter((u) => u.ownerId === foe.id && (u.type === 'peon' || u.type === 'villager')).forEach((u) => u.stop());
    // áreas das fileiras exploradas e visíveis por um bom tempo (a névoa do minimapa cobriria linhas fora da visão)
    for (const v of Object.values(L)) if (v) gm.fogOfWar.revealArea(v.x0 + 10, v.z0 + 4, 30, 600);
    return {
      foeId, made,
      lines: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v && { x0: +v.x0.toFixed(2), z0: +v.z0.toFixed(2), n: v.pts.length, pts: v.pts.map((q) => ({ x: +q.x.toFixed(3), z: +q.z.toFixed(3) })) }]))
    };
  }, { STEP });
  console.log('muralhas', JSON.stringify(data.setup.made), JSON.stringify(Object.fromEntries(Object.entries(data.setup.lines).map(([k, v]) => [k, v && [v.x0, v.z0, v.n]]))));
  check('as 4 fileiras foram criadas (7, 6, 7 do jogador e 6 da IA)', data.setup.made.x === 7 && data.setup.made.z === 6 && data.setup.made.d === 7 && data.setup.made.foe === 6, JSON.stringify(data.setup.made));
  await page.waitForTimeout(1800); // WallGates.update roda a cada 15 quadros

  // portões construídos pelo render
  data.gates = await page.evaluate(() => {
    const g = window.game.gameManager.entityViews.wallGates.group.children;
    return g.map((m) => ({ x: +m.position.x.toFixed(2), z: +m.position.z.toFixed(2), rotY: +m.rotation.y.toFixed(3), tris: m.geometry.attributes.position.count / 3, color: '#' + m.material.color.getHexString() }));
  });
  console.log('portões', JSON.stringify(data.gates));
  // posição esperada = meio de cada lacuna (pares consecutivos de uma mesma fileira a mais de 1,25 passo e até 3 passos)
  const L = data.setup.lines;
  const expect = {};
  for (const [k, v] of Object.entries(L)) {
    for (let i = 1; i < v.pts.length; i++) {
      const a = v.pts[i - 1], b = v.pts[i];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > STEP * 1.25 && d <= STEP * 3 + 0.01) expect[k] = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, width: +d.toFixed(2) };
    }
  }
  console.log('portões esperados', JSON.stringify(expect));
  const near = (e) => data.gates.find((g) => Math.hypot(g.x - e.x, g.z - e.z) < 0.15);
  check('um portão no meio de cada lacuna (X, Z, diagonal e inimiga conhecida): 4 portões no total', data.gates.length === 4 && Object.values(expect).every((e) => !!near(e)), `portões=${data.gates.length}`);
  const rot = (e) => (near(e) ? near(e).rotY : NaN);
  check('rotações: X ≈ 0, Z ≈ -π/2 (eixo da muralha), diagonal ≈ -π/4', Math.abs(rot(expect.x)) < 0.02 && Math.abs(rot(expect.z) + Math.PI / 2) < 0.02 && Math.abs(rot(expect.d) + Math.PI / 4) < 0.02,
    `X=${rot(expect.x)} Z=${rot(expect.z)} D=${rot(expect.d)}`);

  // ---------------------------------------------------------------- 2. fotos dos portões
  const mx = expect.x, mz = expect.z, md = expect.d;
  const gh = (p) => page.evaluate(([x, z]) => window.game.gameManager.terrain.getHeight(x, z), [p.x, p.z]);
  // câmera: ângulo 0 = câmera em +X; π/2 = câmera em +Z; π/4 = padrão (+X,+Z); -π/4 = (+X,-Z)
  await cam(page, mx.x, (await gh(mx)) + 1.2, mx.z, 0.34, Math.PI / 2, 1800); // muralha em X vista de frente (de +Z)
  const imgX = await shotTmp(page, 'gx.png');
  await cam(page, mz.x, (await gh(mz)) + 1.2, mz.z, 0.34, Math.PI / 4, 1800); // muralha em Z na câmera padrão
  const imgZ = await shotTmp(page, 'gz.png');
  await cam(page, md.x, (await gh(md)) + 1.2, md.z, 0.34, -Math.PI / 4, 1800); // diagonal vista de frente
  const imgD = await shotTmp(page, 'gd.png');
  montage(`${ITEM}-1-portoes.png`, [
    { file: imgX, label: 'lacuna de 1 segmento em X (de frente)', crop: [240, 90, 1040, 540] },
    { file: imgZ, label: 'lacuna de 2 segmentos em Z (camera padrao)', crop: [240, 90, 1040, 540] },
    { file: imgD, label: 'diagonal, lacuna de 1 segmento (de frente)', crop: [240, 90, 1040, 540] }
  ], { cols: 3, panelW: 520 });

  // ---------------------------------------------------------------- 4. minimapa
  await cam(page, mx.x, (await gh(mx)) + 1.2, mx.z, 1.0, Math.PI / 4, 1200);
  data.minimap = await page.evaluate(async () => {
    const { worldToMinimap } = await import('/src/ui/minimapCoords.js');
    const gm = window.game.gameManager;
    const cv = document.getElementById('minimap-canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const size = gm.terrain.mapDef.size;
    const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const close = (p, c, tol = 30) => Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;
    const colorOf = (id) => rgb(gm.playerRegistry.getPlayer(id).color || '#888888');
    const out = { canvas: [cv.width, cv.height], mapSize: size, byOwner: {}, boxes: 0 };
    const walls = gm.buildings.filter((b) => b.role === 'wall' && !b.isDead);
    for (const w of walls) {
      const m = worldToMinimap(w.mesh.position.x, w.mesh.position.z, size, cv.width, cv.height);
      const px = ctx.getImageData(Math.max(0, Math.round(m.x) - 1), Math.max(0, Math.round(m.y) - 1), 3, 3).data;
      let hit = false;
      for (let i = 0; i < px.length; i += 4) if (close([px[i], px[i + 1], px[i + 2]], colorOf(w.ownerId))) hit = true;
      const o = (out.byOwner[w.ownerId] = out.byOwner[w.ownerId] || { segments: 0, drawn: 0, color: gm.playerRegistry.getPlayer(w.ownerId).color });
      o.segments++;
      if (hit) o.drawn++;
    }
    return out;
  });
  console.log('minimapa', JSON.stringify(data.minimap));
  const mm = Object.values(data.minimap.byOwner);
  check('minimapa: ≥ 70 % dos segmentos de cada dono aparecem na cor do dono', mm.length >= 2 && mm.every((o) => o.drawn / o.segments >= 0.7), JSON.stringify(data.minimap.byOwner));
  // PNG do minimapa em escala nativa (140²) ampliado 4× sem suavização
  const b64 = await page.evaluate(() => document.getElementById('minimap-canvas').toDataURL('image/png').split(',')[1]);
  const mmFile = path.join(TMP, 'minimapa.png');
  fs.writeFileSync(mmFile, Buffer.from(b64, 'base64'));
  const imgHud = await shotTmp(page, 'hud.png');
  montage(`${ITEM}-2-minimapa.png`, [
    { file: mmFile, label: 'minimapa 140x140 (4x): muralhas do jogador (azul) e da IA (vermelho)', nearest: true },
    { file: imgHud, label: 'HUD completa', crop: [0, 0, 1280, 720] }
  ], { cols: 2, panelW: 560 });

  check('sem erros de console', S.errors.length === 0, S.errors.slice(0, 3).join(' / '));
} catch (e) {
  console.error('ERRO no cenário:', e);
  S.errors.push('script: ' + e.message);
} finally {
  await S.close();
}
code = finish(ITEM, data, S.errors, S.warnings);
process.exitCode = code;
