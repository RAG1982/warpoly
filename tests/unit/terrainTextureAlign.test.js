import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { TILESETS } from '../../src/data/tilesets.js';
import { getRegionMap } from '../../src/data/biomeRegions.js';
import { buildLavaInfo, LAVA_STYLE } from '../../src/data/lavaRender.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

/** Canvas de mentira 96 × 96 (1 px por u no mapa de 96 u): `putImageData` guarda os pixels para o teste. */
const N = 96;
const captured = new Map();
vi.mock('../../src/models/textureQuality.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    createScaledCanvas: () => {
      const ctx = {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (img) => { captured.set('last', img.data); }
      };
      return { canvas: { width: 96, height: 96, getContext: () => ctx }, ctx, width: 2048, height: 2048 };
    }
  };
});
const { getTilesetTerrainTexture } = await import('../../src/models/environment/tilesetTextures.js');
const { TerrainView } = await import('../../src/render/TerrainView.js');

afterEach(() => { vi.unstubAllGlobals(); captured.clear(); });

/**
 * Orientação da textura do terreno (MUNDO-5 achou; corrigido em 2026-10-16 para todos os mapas). O pintor grava a linha do canvas
 * crescendo com z; a malha usa v = (z + metade) / lado; a `CanvasTexture` nasce com flipY = true (linha 0 do canvas = v 1), o que
 * ESPELHAVA a imagem em z. flipY = false alinha: vale para o caminho regional, o da lava e o legado.
 */
describe('textura do terreno: orientação', () => {
  const map = makeRegionalMap({ id: 'align-fixture' });
  const terrain = new Terrain(map);
  const base = { def: TILESETS.exuberante, size: 96, getHeight: (x, z) => terrain.getHeight(x, z), waterLevel: 0.5, startSlots: map.startSlots };

  it('mapa sem biomeGrid nem lavaGrid: flipY = false (a imagem alinha com z; antes saía espelhada)', () => {
    vi.stubGlobal('document', {});
    const tex = getTilesetTerrainTexture({ ...base, id: 'align-legacy' });
    expect(tex.map).toBeTruthy();
    expect(tex.map.flipY).toBe(false);
  });

  it('com regiões (biomeGrid) ou com lava (lavaGrid): flipY = false', () => {
    vi.stubGlobal('document', {});
    expect(getTilesetTerrainTexture({ ...base, id: 'align-regions', regions: getRegionMap(map) }).map.flipY).toBe(false);
    expect(getTilesetTerrainTexture({ ...base, id: 'align-lava', lava: buildLavaInfo(map) }).map.flipY).toBe(false);
    expect(getTilesetTerrainTexture({ ...base, id: 'align-both', regions: getRegionMap(map), lava: buildLavaInfo(map) }).map.flipY).toBe(false);
  });

  it('a borda quente da lava cai na linha do canvas que, com a UV da malha e flipY = false, é a z da lava; com flipY = true cairia em -z', () => {
    vi.stubGlobal('document', {});
    const lava = buildLavaInfo(map);
    const tex = getTilesetTerrainTexture({ ...base, id: 'align-rim', regions: getRegionMap(map), lava });
    const data = captured.get('last');
    expect(data.length).toBe(N * N * 4);
    // linha do canvas com mais pixels de brasa (vermelho forte, verde baixo: a borda incandescente `d9481c`; o deserto é areia, R - G ≈ 25): a do córrego (z ≈ 30)
    const hotPerRow = new Array(N).fill(0);
    for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) { const o = (row * N + col) * 4; if (data[o] > 150 && data[o] - data[o + 1] > 90) hotPerRow[row]++; }
    const hotRow = hotPerRow.indexOf(Math.max(...hotPerRow));
    expect(Math.max(...hotPerRow)).toBeGreaterThan(8);
    // UV da malha: v = (z + 48) / 96. Textura: t = linha / N (flipY = false) ou 1 - linha / N (flipY = true).
    const tOfRow = (row, flipY) => (flipY ? 1 - (row + 0.5) / N : (row + 0.5) / N);
    const zOfT = (t) => t * 96 - 48;
    expect(zOfT(tOfRow(hotRow, tex.map.flipY))).toBeGreaterThan(27);
    expect(zOfT(tOfRow(hotRow, tex.map.flipY))).toBeLessThan(33); // o córrego está em z = 29..31: alinhado
    expect(zOfT(tOfRow(hotRow, true))).toBeLessThan(-27); // com a orientação histórica (flipY = true) cairia espelhado, em z ≈ -30
    expect(LAVA_STYLE.rimRadius).toBeGreaterThan(0);
  });

  it('a UV da malha do terreno é v = (z + metade) / lado (o que o alinhamento pressupõe)', () => {
    const view = new TerrainView(new THREE.Scene(), terrain);
    const pos = view.mesh.geometry.attributes.position, uv = view.mesh.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i += 997) {
      expect(uv.getX(i)).toBeCloseTo((pos.getX(i) + 48) / 96, 5);
      expect(uv.getY(i)).toBeCloseTo((pos.getZ(i) + 48) / 96, 5);
    }
  });

  it('o cache do caminho antigo e o do regional não se misturam (chaves diferentes, orientações diferentes)', () => {
    vi.stubGlobal('document', {});
    const a = getTilesetTerrainTexture({ ...base, id: 'align-cache' });
    const b = getTilesetTerrainTexture({ ...base, id: 'align-cache', regions: getRegionMap(map) });
    expect(a).not.toBe(b);
    expect(a.map.flipY).toBe(false);
    expect(b.map.flipY).toBe(false);
    expect(getTilesetTerrainTexture({ ...base, id: 'align-cache' })).toBe(a);
  });
});
