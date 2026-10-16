import { describe, it, expect, vi } from 'vitest';
import { listMaps } from '../../src/data/maps/index.js';
import { Terrain } from '../../src/sim/Terrain.js';

/**
 * Orientação das texturas pintadas pela altura (mapas não continentais e continental). O pintor grava a linha do canvas
 * crescendo com z e a malha usa v = (z + metade) / lado: a textura tem de sair com flipY = false, senão a imagem espelha em z
 * (NEW-57, achado do MUNDO-5). O contexto 2D é de mentira: o teste só confere a orientação das texturas geradas.
 */
vi.mock('../../src/models/textureQuality.js', async (importOriginal) => {
  const o = await importOriginal();
  const makeCtx = () => {
    const st = { fillStyle: '' };
    return new Proxy(st, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        if (String(p).includes('Gradient') || String(p).includes('Pattern')) return () => ({ addColorStop() {} });
        return () => undefined;
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  return {
    ...o,
    createScaledCanvas: (w, h) => ({ canvas: { width: w, height: h }, ctx: makeCtx(), width: w, height: h }),
    toTexture: (canvas) => ({ image: canvas, flipY: true })
  };
});
const { getTerrainTexturesFromHeight, getTerrainTextures } = await import('../../src/models/environment/terrainTextures.js');

describe('textura do terreno: orientação dos pintores por altura e continental', () => {
  const map = listMaps({ includeHidden: true }).find((x) => x.id === 'estreito-1v1');
  const terrain = new Terrain(map);
  const getHeight = (x, z) => terrain.getHeight(x, z);

  it('mapas não continentais: mapa e rugosidade com flipY = false', () => {
    const tex = getTerrainTexturesFromHeight({ id: 'orient-height', size: map.size, getHeight, waterLevel: 0.5, startSlots: map.startSlots });
    expect(tex.map.flipY).toBe(false);
    expect(tex.roughnessMap.flipY).toBe(false);
  });

  it('continental: mapa e rugosidade com flipY = false', () => {
    const tex = getTerrainTextures(null, 168);
    expect(tex.map.flipY).toBe(false);
    expect(tex.roughnessMap.flipY).toBe(false);
  });
});
