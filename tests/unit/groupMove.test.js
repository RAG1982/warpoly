import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { stateChecksum } from '../../src/sim/checksum.js';

/**
 * F3-02 — movimento em grupo: 40 unidades (mistura de ligeiras e cerco) atravessam o vau central do
 * mapa continental (entre dois lagos) sem travar; o grupo anda na velocidade do mais lento; a chegada
 * assenta sem "dança". Headless, determinístico (IAs desligadas; só as unidades do teste).
 */
const MIX = ['footman', 'footman', 'footman', 'archer', 'footman', 'knight', 'ballista'];

function makeGm(seed = 9) {
  const scene = new THREE.Scene();
  const gm = new GameManager(new Terrain(), null, null, createMatchConfig({ seed, headless: true }));
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  // campo limpo: nenhuma unidade inicial (de ninguém), só construções
  for (const u of [...gm.allUnits]) u.isDead = true;
  gm.simStep(SIM_DT);
  return gm;
}

function spawnGroup(gm, n, x0, z0, cols = 8, gap = 1.5, types = MIX) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const u = gm.spawnUnit(types[i % types.length], x0 + (i % cols) * gap, z0 - Math.floor(i / cols) * gap, 0);
    ids.push(u.id);
  }
  return ids;
}

const get = (gm, id) => gm.entitiesById.get(id);
const pos = (gm, id) => get(gm, id).mesh.position;

/** Roda até todas as unidades ficarem idle (ou `maxTicks`); devolve o tick de término. */
function runUntilIdle(gm, ids, maxTicks) {
  let t = 0;
  for (; t < maxTicks; t++) {
    gm.simStep(SIM_DT);
    if (ids.every(id => get(gm, id).state === 'idle')) break;
  }
  return t;
}

describe('movimento em grupo (F3-02)', () => {
  it('40 unidades atravessam o vau central sem travar (todas chegam, nenhuma na água)', () => {
    const gm = makeGm();
    const ids = spawnGroup(gm, 40, 8, -14);
    const dest = { x: -12, z: 12 };
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ids, x: dest.x, z: dest.z });
    const t = runUntilIdle(gm, ids, 1200); // 60 s
    const stillMoving = ids.filter(id => get(gm, id).state !== 'idle');
    expect(stillMoving).toEqual([]);
    for (const id of ids) {
      const p = pos(gm, id);
      expect(gm.terrain.getHeight(p.x, p.z)).toBeGreaterThanOrEqual(0.65); // ninguém na água
      expect(Math.hypot(p.x - dest.x, p.z - dest.z)).toBeLessThan(11); // dentro da formação (8 colunas × ~2 u)
    }
    console.log(`[groupMove] 40 unidades cruzaram o vau em ${(t * SIM_DT).toFixed(1)} s`);
    expect(t * SIM_DT).toBeLessThan(45);
  }, 60000);

  it('mesma travessia por outro lado do vau (margem do lago + mina) também completa', () => {
    const gm = makeGm(21);
    const ids = spawnGroup(gm, 40, 16, -16);
    const dest = { x: -9, z: 9 };
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ids, x: dest.x, z: dest.z });
    runUntilIdle(gm, ids, 1500);
    expect(ids.filter(id => get(gm, id).state !== 'idle')).toEqual([]);
    for (const id of ids) {
      const p = pos(gm, id);
      expect(Math.hypot(p.x - dest.x, p.z - dest.z)).toBeLessThan(11);
    }
  }, 60000);

  it('o grupo anda na velocidade do mais lento (cavalaria não se descola da balista)', () => {
    const gm = makeGm();
    const ids = spawnGroup(gm, 4, 20, -40, 4, 2, ['knight', 'knight', 'ballista', 'footman']);
    const start = ids.map(id => ({ x: pos(gm, id).x, z: pos(gm, id).z }));
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ids, x: 20, z: -10 });
    for (let i = 0; i < 100; i++) gm.simStep(SIM_DT); // 5 s
    const slowest = 3.0; // balista
    ids.forEach((id, i) => {
      const moved = Math.hypot(pos(gm, id).x - start[i].x, pos(gm, id).z - start[i].z);
      expect(moved).toBeLessThanOrEqual(slowest * 5 + 1.5); // + folga de formação/steering
    });
  }, 30000);

  it('chegada sem dança: depois de parar, as unidades não se mexem mais', () => {
    const gm = makeGm();
    const ids = spawnGroup(gm, 24, 20, -40, 6, 1.5, ['footman', 'archer', 'knight']);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ids, x: 20, z: -12 });
    runUntilIdle(gm, ids, 1200);
    expect(ids.every(id => get(gm, id).state === 'idle')).toBe(true);
    const before = ids.map(id => ({ x: pos(gm, id).x, z: pos(gm, id).z }));
    for (let i = 0; i < 200; i++) gm.simStep(SIM_DT); // 10 s parados
    ids.forEach((id, i) => {
      expect(Math.hypot(pos(gm, id).x - before[i].x, pos(gm, id).z - before[i].z)).toBeLessThan(0.5);
      expect(get(gm, id).state).toBe('idle');
    });
  }, 30000);

  it('formação preserva a ordem lateral: quem estava à esquerda termina à esquerda', () => {
    const gm = makeGm();
    // 3 colunas lado a lado marchando para o norte (+z): a ordem em x deve se manter nas linhas
    const ids = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        ids.push(gm.spawnUnit('footman', 14 + col * 1.8, -50 + row * 1.8, 0).id);
      }
    }
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ids, x: 20, z: -20 });
    runUntilIdle(gm, ids, 1200);
    // pares da mesma linha de partida: a ordem em x se mantém (ou inverte por inteiro, se o destino girar a
    // formação); tolera poucas trocas de vizinhos adjacentes causadas pelo steering.
    let same = 0;
    let flipped = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        for (let j = i + 1; j < 6; j++) {
          const dx = pos(gm, ids[row * 6 + j]).x - pos(gm, ids[row * 6 + i]).x;
          if (dx > 0) same++;
          else flipped++;
        }
      }
    }
    const kept = Math.max(same, flipped);
    expect(kept / (same + flipped)).toBeGreaterThanOrEqual(0.85);
  }, 30000);

  it('determinístico: duas execuções da travessia dão o mesmo checksum', () => {
    const run = () => {
      const gm = makeGm(5);
      const ids = spawnGroup(gm, 30, 10, -16);
      gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ids, x: -12, z: 12 });
      for (let i = 0; i < 400; i++) gm.simStep(SIM_DT);
      return stateChecksum(gm);
    };
    expect(run()).toBe(run());
  }, 60000);
});
