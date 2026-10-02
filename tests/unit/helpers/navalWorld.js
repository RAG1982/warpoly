import * as THREE from 'three';
import { GameManager } from '../../../src/core/GameManager.js';
import { Terrain } from '../../../src/world/Terrain.js';
import { createMatchConfig } from '../../../src/sim/MatchConfig.js';
import { getMap } from '../../../src/data/maps/index.js';
import { SIM_DT } from '../../../src/sim/constants.js';

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
