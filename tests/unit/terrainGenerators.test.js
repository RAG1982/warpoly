import { describe, it, expect } from 'vitest';
import { continentalHeight, islandsHeight, getHeightForMap, TERRAIN_GENERATORS } from '../../src/world/terrainGenerators.js';
import { getMap } from '../../src/data/maps/index.js';

/** Réplica literal do `Terrain.getHeight` anterior à F2-05 (números fixos do mapa continental). */
function oldContinentalHeight(x, z) {
  const maxCoord = Math.max(Math.abs(x), Math.abs(z));
  const bumps = Math.sin(x * 0.3) * 0.2 + Math.cos(z * 0.3) * 0.2 + Math.sin((x + z) * 0.14) * 0.12;
  let height = 2.6 + bumps;
  if (maxCoord > 54) {
    const t = Math.min(1, Math.max(0, (maxCoord - 54) / 12));
    const falloff = t * t * (3 - 2 * t);
    height = 2.6 - falloff * 4.4;
  }
  const riverBend = Math.sin((x + z) * 0.08) * 5.5;
  const distToRiverLine = Math.abs(x - z - riverBend) / Math.SQRT2;
  if (distToRiverLine < 6.0 && maxCoord < 56) {
    const dNorthFord = Math.hypot(x - -16, z - -16);
    const dSouthFord = Math.hypot(x - 16, z - 16);
    const dCenterFord = Math.hypot(x - 0, z - 0);
    const isFord = dNorthFord < 7.5 || dSouthFord < 7.5 || dCenterFord < 8.5;
    if (isFord) {
      height = Math.max(height, 2.35 + Math.sin(x * 0.5) * 0.1);
    } else {
      const riverDepthFactor = 1 - distToRiverLine / 6.0;
      const channelHeight = -0.6 - riverDepthFactor * 1.4;
      height = Math.min(height, channelHeight);
    }
  }
  return height;
}

describe('terrainGenerators', () => {
  it('continentalHeight(continental-1v1) reproduz o Terrain.getHeight anterior à F2-05 em 2000 pontos aleatórios', () => {
    const mapDef = getMap('continental-1v1');
    let maxDiff = 0;
    for (let i = 0; i < 2000; i++) {
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      const a = continentalHeight(mapDef, x, z);
      const b = oldContinentalHeight(x, z);
      maxDiff = Math.max(maxDiff, Math.abs(a - b));
    }
    expect(maxDiff).toBeLessThan(1e-9);
  });

  it('getHeightForMap delega para o gerador registrado em mapDef.terrain.generator', () => {
    const mapDef = getMap('continental-1v1');
    expect(getHeightForMap(mapDef, 0, 0)).toBeCloseTo(continentalHeight(mapDef, 0, 0), 9);
    expect(TERRAIN_GENERATORS.continental).toBe(continentalHeight);
    expect(TERRAIN_GENERATORS.islands).toBe(islandsHeight);
  });

  it('getHeightForMap lança para gerador desconhecido', () => {
    expect(() => getHeightForMap({ terrain: { generator: 'nope' } }, 0, 0)).toThrow();
  });

  describe('islandsHeight (ilhas-4p)', () => {
    const mapDef = getMap('ilhas-4p');

    it('centro de cada ilha é terra seca (caminhável)', () => {
      for (const island of mapDef.terrain.params.islands) {
        expect(islandsHeight(mapDef, island.x, island.z)).toBeGreaterThanOrEqual(1.9);
      }
    });

    it('as pontes ligam as duas ilhas com terra seca', () => {
      for (const bridge of mapDef.terrain.params.bridges) {
        const mx = (bridge.x1 + bridge.x2) / 2;
        const mz = (bridge.z1 + bridge.z2) / 2;
        expect(islandsHeight(mapDef, mx, mz)).toBeGreaterThanOrEqual(1.9);
      }
    });

    it('bem longe de ilhas e pontes é água', () => {
      expect(islandsHeight(mapDef, 0, 60)).toBeLessThan(0.2);
    });

    it('é determinística (mesma entrada → mesma saída)', () => {
      const a = islandsHeight(mapDef, 5.5, -12.25);
      const b = islandsHeight(mapDef, 5.5, -12.25);
      expect(a).toBe(b);
    });
  });
});
