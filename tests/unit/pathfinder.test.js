import { describe, it, expect } from 'vitest';
import { Pathfinder } from '../../src/core/Pathfinder.js';

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
});
