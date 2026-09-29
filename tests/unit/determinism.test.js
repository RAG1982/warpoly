import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';

/**
 * F2-03 — "Pronto": duas execuções headless com a mesma seed e o mesmo log de comandos (aqui,
 * nenhum comando manual — só a IA×IA jogando sozinha) produzem o mesmo checksum a cada 20 ticks
 * durante 12 000 ticks (10 min simulados). Visual (partículas, sons, decoração, animação) pode
 * continuar aleatório — o checksum não inclui nada disso (ver src/sim/checksum.js).
 *
 * `headless: true` (MatchConfig): nenhuma malha/textura procedural é criada (sem DOM/WebGL em
 * Node) — ver ModelFactory.headless / ModelFactory.getOrCreateModel.
 */
function runHeadless(seed, ticks) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);
  for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT);
  return gm.checksums.map(c => c.hash);
}

const TICKS = 12000; // 10 min simulados a 20 Hz

describe('determinismo (F2-03, headless)', () => {
  it(
    `seed 42: duas execuções de ${TICKS} ticks produzem checksums idênticos a cada 20 ticks`,
    () => {
      const t0 = Date.now();
      const a = runHeadless(42, TICKS);
      const b = runHeadless(42, TICKS);
      const elapsedMs = Date.now() - t0;

      expect(a.length).toBeGreaterThan(0);
      expect(a).toEqual(b);

      console.log(`[determinism.test] ${2 * TICKS} ticks (2 execuções) em ${elapsedMs}ms`);
      expect(elapsedMs).toBeLessThan(60000);
    },
    65000
  );

  it('seed 43 diverge da seed 42 (RNG de simulação realmente influencia o estado)', () => {
    const a = runHeadless(42, 2000);
    const c = runHeadless(43, 2000);
    expect(a).not.toEqual(c);
  }, 20000);
});
