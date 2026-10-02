import * as THREE from 'three';
import { GameManager } from '../../../src/core/GameManager.js';
import { Terrain } from '../../../src/world/Terrain.js';
import { createMatchConfig } from '../../../src/sim/MatchConfig.js';
import { getMap } from '../../../src/data/maps/index.js';
import { SIM_DT } from '../../../src/sim/constants.js';

/** Mundos reais em Node puro para os testes da IA (F5): GameManager headless, sem mocks de simulação. */
export function makeGm({ seed = 1, ffa = false, difficulties = [], allAI = true, mapId } = {}) {
  const spec = { seed, headless: true, ffa };
  if (mapId) spec.mapId = mapId;
  const cfg = createMatchConfig(spec);
  cfg.players.forEach((p, i) => {
    if (allAI) p.isAI = true;
    if (difficulties[i]) p.difficulty = difficulties[i];
  });
  const scene = new THREE.Scene();
  return new GameManager(scene, new Terrain(scene, getMap(cfg.mapId)), null, null, cfg);
}

export function run(gm, ticks) {
  for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT);
}

/** Posiciona uma unidade (teleporte de teste) mantendo a grade espacial coerente. */
export function place(gm, unit, x, z) {
  unit.mesh.position.set(x, unit.mesh.position.y, z);
  gm.unitGrid.update(unit, x, z, unit.collisionRadius || 0);
}

