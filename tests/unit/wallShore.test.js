import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { WALL_STEP, WALL_MIN_HEIGHT, WALL_SEAL_GAP, getBuildingDef } from '../../src/data/index.js';

/**
 * ENG-WALL (A) — muro até a beira da água. Mapa sintético: faixa de terra plana (|z| <= SHORE0) com praia em rampa
 * (SLOPE por u) e mar dos dois lados (norte e sul); a muralha cruza a faixa em x = 0. Pathfinder/GameManager reais.
 */
const SHORE0 = 12;
function makeGm(slope = 0.3) {
  new THREE.Scene();
  const terrain = new Terrain();
  const cfg = createMatchConfig({ seed: 7, headless: true });
  const gm = new GameManager(terrain, null, null, cfg);
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  gm.terrain.mapDef = { ...gm.terrain.mapDef, fords: [] };
  gm.terrain.getHeight = (x, z) => {
    const a = Math.abs(z);
    return a <= SHORE0 ? 3 : Math.max(-2, 3 - (a - SHORE0) * slope);
  };
  gm.trees.forEach(t => { t.woodRemaining = 0; });
  const pf = gm.pathfinder;
  pf.buildGrid();
  pf.dynamicBlock.fill(0);
  pf.softBlock.fill(0);
  pf.version++;
  return gm;
}

/** Coloca a linha de muralha em x (z de -zMax a zMax, passo 2,4, deslocada por `off`); devolve os segmentos criados. */
function wallLine(gm, x = 0, off = 0, zMax = 30, type = 'wall_human') {
  const out = [];
  for (let z = -zMax + off; z <= zMax; z += WALL_STEP) {
    // faixa plana: coloca direto (jazidas/árvores do mapa real não interessam aqui); na praia vale a regra de colocação
    if (Math.abs(z) > SHORE0 - 1 && !gm.canPlaceBuilding(type, x, z, null, 0)) continue;
    const w = gm.createBuilding(type, x, z, true, 0);
    gm.buildings.push(w);
    out.push(w);
  }
  return out;
}

const blocked = (gm, wide) => gm.pathfinder.findPath(-25, 0, 25, 0, wide).noPath === true;

describe('muralha na praia (ENG-WALL)', () => {
  it('regra de colocação: aceita praia rasa, recusa água e terra abaixo do mínimo da pegada', () => {
    const gm = makeGm();
    const h = (z) => gm.terrain.getHeight(0, z);
    // z em que a altura do centro é exatamente WALL_MIN_HEIGHT
    const zMin = SHORE0 + (3 - WALL_MIN_HEIGHT) / 0.3;
    expect(h(zMin)).toBeCloseTo(WALL_MIN_HEIGHT, 5);
    expect(gm.canPlaceBuilding('wall_human', 0, SHORE0 + 2, null, 0)).toBe(true);
    // centro em praia rasa mas com amostra da pegada na água: recusado
    expect(gm.canPlaceBuilding('wall_human', 0, zMin - 0.1, null, 0)).toBe(false);
    // dentro d'água / abaixo do mínimo
    expect(gm.canPlaceBuilding('wall_human', 0, zMin + 0.5, null, 0)).toBe(false);
    expect(gm.canPlaceBuilding('wall_human', 0, SHORE0 + 12, null, 0)).toBe(false);
    expect(gm.canPlaceBuilding('wall_orc', 0, SHORE0 + 12, null, 0)).toBe(false);
    // construções comuns continuam exigindo terra firme (1,8)
    const zFirm = SHORE0 + (3 - 1.8) / 0.3;
    expect(gm.canPlaceBuilding('cottage', 0, zFirm + 2.0, null, 0)).toBe(false);
    expect(getBuildingDef('wall_human').role).toBe('wall');
  });

  for (const type of ['wall_human', 'wall_orc']) {
    it(`${type}: o muro junto à água fecha a passagem (unidade pequena e grande) e destruir um bloco reabre`, () => {
      const gm = makeGm();
      expect(blocked(gm, false)).toBe(false);
      expect(blocked(gm, true)).toBe(false);
      const walls = wallLine(gm, 0, 0, 30, type);
      expect(walls.length).toBeGreaterThan(8);
      // a linha chega até a praia (z além da faixa plana)
      expect(Math.max(...walls.map(w => Math.abs(w.mesh.position.z)))).toBeGreaterThan(SHORE0 + 2);
      expect(blocked(gm, false)).toBe(true);
      expect(blocked(gm, true)).toBe(true);
      // destruir o bloco central reabre
      const mid = walls.reduce((a, b) => (Math.abs(a.mesh.position.z) < Math.abs(b.mesh.position.z) ? a : b));
      gm.unregisterEntity(mid);
      expect(blocked(gm, false)).toBe(false);
      // destruir o último bloco da ponta NÃO deixa bloqueio fantasma e reabre: apaga tudo e confere que a grade volta a zero
      walls.forEach(w => { if (w !== mid) gm.unregisterEntity(w); });
      expect(gm.pathfinder.dynamicBlock.reduce((a, b) => a + b, 0)).toBe(0);
    });
  }

  it('varredura: a posição da ponta do muro (sub-célula) e a inclinação da praia nunca deixam vazar', () => {
    for (const slope of [0.2, 0.3, 0.5]) {
      for (let off = 0; off < WALL_STEP; off += 0.4) {
        const gm = makeGm(slope);
        wallLine(gm, 0.13 * off, off, 30);
        expect(blocked(gm, false), `slope ${slope} off ${off} pequena`).toBe(true);
        expect(blocked(gm, true), `slope ${slope} off ${off} grande`).toBe(true);
      }
    }
  });

  it('muro em diagonal (sem passar pelo meio da faixa) também fecha', () => {
    const gm = makeGm();
    for (let k = -14; k <= 14; k++) {
      const x = k * 1.7;
      const z = k * 1.7;
      if (Math.abs(z) < SHORE0 - 1 || gm.canPlaceBuilding('wall_human', x, z, null, 0)) gm.buildings.push(gm.createBuilding('wall_human', x, z, true, 0));
    }
    // a diagonal x = z separa (-25, 8) de (25, -8); a praia dos dois lados é selada também na diagonal
    for (const wide of [false, true]) expect(gm.pathfinder.findPath(-25, 8, 25, -8, wide).noPath, `wide ${wide}`).toBe(true);
  });

  it('muro afastado da água (vão > WALL_SEAL_GAP) não sela: ainda dá para passar pela praia', () => {
    const gm = makeGm();
    // muro só até z = +-8 (terra plana), a praia fica livre
    for (let z = -8; z <= 8; z += WALL_STEP) gm.buildings.push(gm.createBuilding('wall_human', 0, z, true, 0));
    expect(WALL_SEAL_GAP).toBeLessThan(6);
    expect(blocked(gm, false)).toBe(false);
  });
});
