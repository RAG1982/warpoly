import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { EVT } from '../../src/sim/events.js';

/**
 * F2-07 — teste de integração headless: 2 000 ticks de IA×IA (sem sons/partículas/UI reais,
 * `soundManager`/`particleSystem` nulos) emitem `UNIT_TRAINED`, `RESOURCE_GATHERED` e
 * `BUILDING_COMPLETED` (contagem > 0) e as mesmas contagens entre duas execuções com a mesma
 * seed — prova que `gm.events` funciona sem DOM/WebGL/Web Audio e que os eventos são
 * deterministicamente reprodutíveis (mesma seed ⇒ mesmos eventos), tal como o checksum de estado.
 */
function runHeadlessCountingEvents(seed, ticks) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);

  const counts = {
    [EVT.UNIT_TRAINED]: 0,
    [EVT.RESOURCE_GATHERED]: 0,
    [EVT.BUILDING_COMPLETED]: 0
  };
  Object.keys(counts).forEach(type => {
    gm.events.on(type, () => { counts[type]++; });
  });

  for (let i = 0; i < ticks; i++) gm.simStep(SIM_DT);
  return counts;
}

describe('eventos da simulação em modo headless (F2-07)', () => {
  it('2000 ticks (IA×IA) emitem UNIT_TRAINED/RESOURCE_GATHERED/BUILDING_COMPLETED sem soundManager/particleSystem', () => {
    const counts = runHeadlessCountingEvents(42, 2000);
    expect(counts[EVT.UNIT_TRAINED]).toBeGreaterThan(0);
    expect(counts[EVT.RESOURCE_GATHERED]).toBeGreaterThan(0);
    expect(counts[EVT.BUILDING_COMPLETED]).toBeGreaterThan(0);
  }, 20000);

  it('mesma seed produz as mesmas contagens de evento entre duas execuções', () => {
    const a = runHeadlessCountingEvents(42, 2000);
    const b = runHeadlessCountingEvents(42, 2000);
    expect(a).toEqual(b);
  }, 20000);
});
