import * as THREE from 'three';
import { GameManager } from '../../../src/core/GameManager.js';
import { Terrain } from '../../../src/world/Terrain.js';
import { createMatchConfig } from '../../../src/sim/MatchConfig.js';
import { getMap } from '../../../src/data/maps/index.js';
import { SIM_DT } from '../../../src/sim/constants.js';
import { registerMap } from '../../../src/data/maps/index.js';

/**
 * F4-07: mundos reais para os testes de petróleo/navegação/navios — `estreito-1v1` (2 continentes, canal com 2 poços) headless,
 * IAs desligadas. Jogador 0 = humano (continente oeste), 1 = orc (leste).
 */
export function makeNavalGm({ seed = 3, mapId = 'estreito-1v1', ai = false } = {}) {
  const cfg = createMatchConfig({ seed, headless: true, mapId });
  const gm = new GameManager(new Terrain(getMap(mapId)), null, null, cfg);
  new THREE.Scene(); // (sem uso: mantém o import do three carregado como nos demais testes)
  if (!ai) {
    gm.aiDirectors.forEach((d) => d.dispose?.());
    gm.aiDirectors = [];
    gm.aiDirector = null;
  }
  return gm;
}

export function run(gm, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

export const hqOf = (gm, id) => gm.buildings.find((b) => b.ownerId === id && (b.type === 'castle' || b.type === 'great_hall'));

/** Constrói (já concluída) e registra uma construção, sem checar requisitos. */
export function build(gm, type, ownerId, x, z) {
  const b = gm.createBuilding(type, x, z, true, ownerId);
  gm.buildings.push(b);
  return b;
}

/** Teleporta uma unidade mantendo a grade espacial coerente. */
export function place(gm, unit, x, z) {
  unit.mesh.position.set(x, unit.mesh.position.y, z);
  unit._prevPos.copy(unit.mesh.position);
  unit._simPos.copy(unit.mesh.position);
  gm.unitGrid.update(unit, x, z, unit.collisionRadius || 0);
}

/**
 * Pontos de costa válidos (`canPlaceBuilding`) para `type` no continente de `side` (-1 = oeste, +1 = leste), do mais próximo
 * da base ao mais distante; `min` = distância mínima entre as construções já escolhidas.
 */
export function coastSpots(gm, type, side = -1, count = 3, min = 9) {
  const out = [];
  const cands = [];
  for (let x = side * 12; Math.abs(x) <= 56; x += side) {
    for (let z = -44; z <= 44; z += 1) cands.push({ x, z });
  }
  const base = side < 0 ? { x: -34, z: -16 } : { x: 34, z: 16 };
  cands.sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z));
  for (const c of cands) {
    if (!gm.canPlaceBuilding(type, c.x, c.z)) continue;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < min)) continue;
    out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

/** ENG-NAVAL: mundo a partir de uma definição de mapa qualquer (ex.: `pendentes/dois-continentes-1.json`, `camp-04`). IAs desligadas. */
export function makeMapGm(mapDef, { seed = 3 } = {}) {
  try { registerMap(mapDef); } catch { /* já registrado */ }
  const cfg = createMatchConfig({ seed, headless: true, mapId: mapDef.id });
  const gm = new GameManager(new Terrain(mapDef), null, null, cfg);
  gm.aiDirectors.forEach((d) => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}

/** Componentes conexos (4-vizinhos) da grade estática de um pathfinder: `{ comp: Int32Array, list: [{id,size,cx,cz}] }`. */
export function components(pf) {
  const comp = new Int32Array(pf.numCells).fill(-1);
  const list = [];
  for (let i = 0; i < pf.numCells; i++) {
    if (comp[i] !== -1 || !pf.staticGrid[i]) continue;
    const id = list.length;
    let s = 0; let sx = 0; let sz = 0;
    const st = [i];
    comp[i] = id;
    while (st.length) {
      const k = st.pop();
      s++;
      const c = k % pf.cols; const r = (k / pf.cols) | 0;
      const w = pf.toWorld(c, r); sx += w.x; sz += w.z;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc; const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= pf.cols || rr >= pf.rows) continue;
        const j = rr * pf.cols + cc;
        if (pf.staticGrid[j] && comp[j] === -1) { comp[j] = id; st.push(j); }
      }
    }
    list.push({ id, size: s, cx: sx / s, cz: sz / s });
  }
  return { comp, list };
}

export function compAt(pf, comps, x, z) {
  const { c, r } = pf.toGrid(x, z);
  return comps.comp[r * pf.cols + c];
}

/** Ponto de terra (do componente `landId`) à beira d'água, o mais próximo de (tx, tz). */
export function shoreNear(gm, comps, landId, tx, tz, margin = 2.5) {
  const lpf = gm.pathfinder; const npf = gm.navalPathfinder;
  let best = null; let bd = Infinity;
  for (let i = 0; i < lpf.numCells; i++) {
    if (comps.comp[i] !== landId) continue;
    const w = lpf.toWorld(i % lpf.cols, (i / lpf.cols) | 0);
    if (!lpf.isWalkableWorld(w.x, w.z) || !npf.nearNavigable(w.x, w.z, margin)) continue;
    const d = Math.hypot(w.x - tx, w.z - tz);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

/** Pontos onde `canPlaceBuilding(type)` vale, do mais próximo de (tx, tz) ao mais distante (mapa qualquer; passo 1,5 u); `min` = afastamento entre os escolhidos. */
export function spotsNear(gm, type, tx, tz, count = 3, min = 9) {
  const half = gm.terrain.mapDef.playable / 2;
  const cands = [];
  for (let x = -half; x <= half; x += 1.5) for (let z = -half; z <= half; z += 1.5) cands.push({ x, z, d: Math.hypot(x - tx, z - tz) });
  cands.sort((a, b) => a.d - b.d);
  const out = [];
  for (const c of cands) {
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < min)) continue;
    if (!gm.canPlaceBuilding(type, c.x, c.z)) continue;
    out.push({ x: c.x, z: c.z });
    if (out.length >= count) break;
  }
  return out;
}
