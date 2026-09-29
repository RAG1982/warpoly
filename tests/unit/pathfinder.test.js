import { describe, it, expect } from 'vitest';
import { Pathfinder, MinHeap } from '../../src/core/Pathfinder.js';

const DRY = 1.0;
const WATER = 0.2;

/** Terreno todo seco. */
const dryTerrain = { getHeight: () => DRY };

/**
 * Terreno com um rio norte-sul (|x| < 3) cortando o mapa inteiro,
 * com uma única passagem seca (vau) em 20 <= z <= 26.
 */
const FORD_MIN_Z = 20;
const FORD_MAX_Z = 26;
const riverTerrain = {
  getHeight(x, z) {
    const inRiver = Math.abs(x) < 3;
    const inFord = z >= FORD_MIN_Z && z <= FORD_MAX_Z;
    return inRiver && !inFord ? WATER : DRY;
  }
};

/** Confere que cada trecho do caminho (a partir do início) fica em terra seca. */
function expectPathOnLand(pf, startX, startZ, path) {
  let px = startX;
  let pz = startZ;
  for (const wp of path) {
    expect(pf.hasLineOfSight(px, pz, wp.x, wp.z), `trecho (${px},${pz}) -> (${wp.x},${wp.z})`).toBe(true);
    px = wp.x;
    pz = wp.z;
  }
}

describe('Pathfinder', () => {
  describe('terreno seco', () => {
    const pf = new Pathfinder(dryTerrain);

    it('tem linha de visão direta entre dois pontos', () => {
      expect(pf.hasLineOfSight(-20, -20, 20, 20)).toBe(true);
    });

    it('findPath devolve um único waypoint no destino exato', () => {
      const path = pf.findPath(-20, -20, 20, 15);
      expect(path).toEqual([{ x: 20, z: 15 }]);
    });

    it('bordas do continente (|coord| >= 55) não são caminháveis', () => {
      const { c, r } = pf.toGrid(56, 0);
      expect(pf.isWalkable(c, r)).toBe(false);
      const center = pf.toGrid(0, 0);
      expect(pf.isWalkable(center.c, center.r)).toBe(true);
    });
  });

  describe('rio com uma passagem', () => {
    const pf = new Pathfinder(riverTerrain);

    it('não há linha de visão atravessando o rio fora do vau', () => {
      expect(pf.hasLineOfSight(-20, 0, 20, 0)).toBe(false);
    });

    it('há linha de visão atravessando pelo vau', () => {
      expect(pf.hasLineOfSight(-20, 23, 20, 23)).toBe(true);
    });

    it('contorna a água passando pelo vau', () => {
      const path = pf.findPath(-20, 0, 20, 0);

      expect(path.length).toBeGreaterThan(1);
      expect(path[path.length - 1]).toEqual({ x: 20, z: 0 });
      expectPathOnLand(pf, -20, 0, path);

      // Algum trecho precisa cruzar x = 0, e isso só é possível pela faixa do vau.
      let px = -20;
      let pz = 0;
      let crossedAtFord = false;
      for (const wp of path) {
        if (Math.sign(px) !== Math.sign(wp.x)) {
          const t = (0 - px) / (wp.x - px);
          const zAtCross = pz + (wp.z - pz) * t;
          if (zAtCross >= FORD_MIN_Z && zAtCross <= FORD_MAX_Z) crossedAtFord = true;
        }
        px = wp.x;
        pz = wp.z;
      }
      expect(crossedAtFord).toBe(true);
    });
  });

  describe('findNearestWalkable', () => {
    const pf = new Pathfinder(riverTerrain);

    it('devolve o próprio ponto quando já está em terra', () => {
      expect(pf.findNearestWalkable(-10, 5)).toEqual({ x: -10, z: 5 });
    });

    it('leva um ponto na água para a margem mais próxima', () => {
      const p = pf.findNearestWalkable(0, 0);
      expect(pf.isWater(p.x, p.z)).toBe(false);
      const { c, r } = pf.toGrid(p.x, p.z);
      expect(pf.isWalkable(c, r)).toBe(true);
      expect(Math.hypot(p.x, p.z)).toBeLessThan(5);
    });
  });

  describe('destino dentro da água', () => {
    const pf = new Pathfinder(riverTerrain);

    it('ajusta o destino para terra firme perto do clique', () => {
      const destX = -1;
      const destZ = -10;
      expect(pf.isWater(destX, destZ)).toBe(true);

      const path = pf.findPath(-20, -10, destX, destZ);
      const last = path[path.length - 1];

      expect(pf.isWater(last.x, last.z)).toBe(false);
      expect(Math.hypot(last.x - destX, last.z - destZ)).toBeLessThan(4);
      expectPathOnLand(pf, -20, -10, path);
    });
  });

  describe('hasLineOfSight com pontos idênticos (NEW-4)', () => {
    it('devolve true em terreno seco (dist=0 não gera NaN)', () => {
      const pf = new Pathfinder(dryTerrain);
      expect(pf.hasLineOfSight(5, 5, 5, 5)).toBe(true);
    });

    it('devolve false se o próprio ponto está na água', () => {
      const pf = new Pathfinder(riverTerrain);
      expect(pf.hasLineOfSight(0, 0, 0, 0)).toBe(false);
    });
  });

  describe('obstáculos dinâmicos (blockCircle, F1-07/B8)', () => {
    it('caminho contorna uma construção entre origem e destino; remover o bloqueio volta ao caminho reto', () => {
      const pf = new Pathfinder(dryTerrain);
      expect(pf.hasLineOfSight(-10, 0, 10, 0)).toBe(true);

      pf.blockCircle(0, 0, 3, +1);
      expect(pf.hasLineOfSight(-10, 0, 10, 0)).toBe(false);

      const path = pf.findPath(-10, 0, 10, 0);
      expect(path[path.length - 1]).toEqual({ x: 10, z: 0 });
      // Nenhum waypoint (nem o trecho até ele) cai dentro do círculo bloqueado.
      let px = -10, pz = 0;
      for (const wp of path) {
        const midX = (px + wp.x) / 2, midZ = (pz + wp.z) / 2;
        expect(Math.hypot(midX, midZ)).toBeGreaterThan(2.5);
        px = wp.x; pz = wp.z;
      }

      pf.blockCircle(0, 0, 3, -1);
      expect(pf.hasLineOfSight(-10, 0, 10, 0)).toBe(true);
      const straight = pf.findPath(-10, 0, 10, 0);
      expect(straight).toEqual([{ x: 10, z: 0 }]);
    });

    it('origem dentro de um bloqueio dinâmico ainda encontra caminho', () => {
      const pf = new Pathfinder(dryTerrain);
      pf.blockCircle(0, 0, 3, +1);
      const path = pf.findPath(0, 0, 15, 0);
      expect(path.length).toBeGreaterThan(0);
      expect(path[path.length - 1]).toEqual({ x: 15, z: 0 });
    });
  });

  describe('MinHeap (heap binário do A*)', () => {
    it('1000 inserções aleatórias saem ordenadas', () => {
      const heap = new MinHeap(1000);
      const priorities = [];
      for (let i = 0; i < 1000; i++) {
        const p = Math.random() * 100000;
        priorities.push(p);
        heap.push(i, p);
      }

      const sorted = [...priorities].sort((a, b) => a - b);
      const out = [];
      while (heap.size > 0) {
        const idx = heap.pop();
        out.push(priorities[idx]);
      }

      expect(out).toEqual(sorted);
    });
  });

  describe('requestPath / processQueue (orçamento por frame)', () => {
    function fakeUnit(x, z) {
      return { mesh: { position: { x, z } } };
    }

    it('resolve 200 pedidos ao longo de várias chamadas, sem perder nenhum callback', () => {
      const pf = new Pathfinder(dryTerrain);
      let resolved = 0;
      for (let i = 0; i < 200; i++) {
        pf.requestPath(fakeUnit(i * 0.01, 0), 20, 20, () => { resolved++; });
      }

      let guard = 0;
      while (resolved < 200 && guard < 10000) {
        pf.processQueue(2);
        guard++;
      }

      expect(resolved).toBe(200);
    });

    it('descarta pedidos de unidades mortas sem travar a fila', () => {
      const pf = new Pathfinder(dryTerrain);
      let resolved = 0;
      pf.requestPath({ mesh: { position: { x: 0, z: 0 } }, isDead: true }, 5, 5, () => { resolved++; });
      pf.requestPath(fakeUnit(0, 0), 5, 5, () => { resolved++; });
      pf.processQueue(50);
      expect(resolved).toBe(1);
    });
  });
});
