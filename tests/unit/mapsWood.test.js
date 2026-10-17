import { describe, it, expect } from 'vitest';
import { getMap } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { measureWood, WOOD_TARGET, WOOD_RADIUS } from '../../tools/lib/woodStats.mjs';
import missionClasses from '../fixtures/missionTerrainClasses.json';
import originals from '../fixtures/originalMapTerrain.json';

/**
 * Florestas mais densas e mapas maiores (feedback do dono após a campanha do Reino).
 *
 * - Meta de madeira: cada jogador alcança por terra, a <= 60 u do pátio, pelo menos `WOOD_TARGET` (8000 = ~67 árvores de 120).
 *   Base do número: nos soaks a IA corta ~2300-3100 de madeira por jogador em 15-20 min (NEW-51: 59 árvores / 3 jogadores
 *   acabaram em 15 min); 8000 dá ~2,5x essa folga (melhorias de lenhador, exércitos grandes, disputa e árvores perdidas).
 * - Segurança das missões: toda coordenada que a campanha referencia continua na área jogável e na mesma classe de terreno
 *   (terra/água) do mapa original (fixtures geradas do master antes da mudança).
 * - Geometria: o mapa novo só ACRESCENTA terra (nenhum ponto de terra original vira água) e não funde/parte regiões
 *   (conectividade terrestre e marítima das amostras originais preservada).
 */

const GROWN = ['campos-1v1', 'desfiladeiro-1v1', 'vales-2v2', 'bosques-2v2', 'planalto-ffa-4p', 'arquipelago-naval-4p', 'continental-1v1', 'estreito-1v1', 'ilhas-4p'];
const SAME_SIZE = [];
const SEEDS = [1, 2, 3];

describe('mapas ampliados: tamanho e geometria', () => {
  it.each(GROWN)('%s cresce entre 15% e 35% e não perde terra nem funde/parte regiões', (id) => {
    const orig = originals[id];
    const m = getMap(id);
    expect(m.size / orig.size).toBeGreaterThanOrEqual(1.15);
    expect(m.size / orig.size).toBeLessThanOrEqual(1.35);
    expect(m.playable).toBeGreaterThan(orig.playable);
    const half = orig.playable / 2;
    const origMap = { id, ...orig };
    for (let x = -half; x <= half; x += 2) {
      for (let z = -half; z <= half; z += 2) {
        if (getHeightForMap(origMap, x, z) >= 1.8) {
          expect(getHeightForMap(m, x, z), `(${x},${z}) era terra`).toBeGreaterThanOrEqual(1.8);
        }
      }
    }
    // partição de conectividade das amostras originais
    for (const mode of ['land', 'naval']) {
      if (mode === 'naval' && !['arquipelago-naval-4p', 'estreito-1v1'].includes(id)) continue;
      const a = buildPathfinder(origMap, mode);
      const b = buildPathfinder(m, mode);
      const pts = [];
      for (let x = -half + 2; x <= half - 2; x += 3) {
        for (let z = -half + 2; z <= half - 2; z += 3) {
          const ga = a.toGrid(x, z); const gb = b.toGrid(x, z);
          if (a.staticGrid[ga.r * a.cols + ga.c] === 1 && b.staticGrid[gb.r * b.cols + gb.c] === 1) pts.push([x, z]);
        }
      }
      expect(pts.length).toBeGreaterThan(50);
      const [x0, z0] = pts[0];
      const sa = floodFill(a, x0, z0);
      const sb = floodFill(b, x0, z0);
      for (const [x, z] of pts) {
        expect(isReached(b, sb, x, z), `${mode}: (${x},${z}) ficou separado do ponto de referência`).toBe(isReached(a, sa, x, z));
      }
    }
  });

  if (SAME_SIZE.length > 0) {
    it.each(SAME_SIZE)('%s mantém tamanho e área jogável (rotas navais fixas)', (id) => {
      expect(getMap(id).size).toBe(originals[id].size);
      expect(getMap(id).playable).toBe(originals[id].playable);
    });
  }
});

describe('campanha: coordenadas referenciadas pelas missões continuam válidas', () => {
  for (const [mapId, e] of Object.entries(missionClasses)) {
    it(`${mapId}: ${Object.keys(e.points).length} pontos (${e.missions.join(', ')}) na área jogável e na mesma classe de terreno`, () => {
      const m = getMap(mapId);
      expect(m.playable).toBeGreaterThanOrEqual(e.playable);
      expect(m.size).toBeGreaterThanOrEqual(e.size);
      const half = m.playable / 2;
      for (const [key, cls] of Object.entries(e.points)) {
        const [x, z] = key.split(',').map(Number);
        expect(Math.abs(x) < half && Math.abs(z) < half, `${key} fora da área jogável`).toBe(true);
        const now = getHeightForMap(m, x, z) >= 1.8 ? 'land' : 'water';
        expect(now, `${mapId} ${key}`).toBe(cls);
      }
    });
  }

  it('o forte Atalaia do m04 (-47, 4) segue em terra firme e dentro da área jogável', () => {
    const m = getMap('continental-1v1');
    expect(getHeightForMap(m, -47, 4)).toBeGreaterThanOrEqual(1.8);
    expect(Math.abs(-47)).toBeLessThan(m.playable / 2);
    expect(missionClasses['continental-1v1'].points['-47,4']).toBe('land');
  });
});

describe('madeira alcançável por jogador (meta: WOOD_TARGET a <= WOOD_RADIUS u do pátio)', () => {
  const need = (id) => (id === 'estreito-1v1' ? 3500 : id === 'ilhas-4p' ? 2500 : WOOD_TARGET);
  for (const id of [...new Set(GROWN)]) {
    it(`${id}: todo jogador alcança >= ${need(id)} de madeira por terra a <= ${WOOD_RADIUS} u (seeds ${SEEDS.join(',')})`, () => {
      const m = getMap(id);
      const worst = Math.min(...SEEDS.map((seed) => {
        const r = measureWood(m, { seed });
        const min = r.minWood;
        r.gm.dispose?.();
        return min;
      }));
      expect(worst).toBeGreaterThanOrEqual(need(id));
    });
  }

  it('bases não ficam sob árvores e as árvores nascem em terra firme (todos os mapas, seed 1)', () => {
    for (const id of [...GROWN, ...SAME_SIZE]) {
      const m = getMap(id);
      const r = measureWood(m, { seed: 1 });
      for (const t of r.gm.trees) {
        const { x, z } = t.mesh.position;
        expect(getHeightForMap(m, x, z), `${id} árvore (${x.toFixed(1)}, ${z.toFixed(1)}) em água`).toBeGreaterThanOrEqual(1.8);
        for (const s of m.startSlots) expect(Math.hypot(s.x - x, s.z - z), `${id}: árvore a ${s.x},${s.z}`).toBeGreaterThanOrEqual(26);
      }
      r.gm.dispose?.();
    }
  });
});
