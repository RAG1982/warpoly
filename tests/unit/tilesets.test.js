import { describe, it, expect } from 'vitest';
import { TILESETS, TILESET_IDS, resolveTilesetId, getMapTileset, splatWeights, DEFAULT_TILESET } from '../../src/data/tilesets.js';
import { listMaps } from '../../src/data/maps/index.js';
import { generateMap, GEN_THEMES } from '../../src/data/maps/generator.js';

describe('F7-04 tilesets', () => {
  it('tem os tilesets com paleta, água, atmosfera e decoração completas', () => {
    expect(TILESET_IDS).toEqual([
      'verdejante', 'inverno', 'devastadas', 'pantano',
      'exuberante', 'deserto', 'savana', 'vulcanico', 'pedregoso'
    ]);
    for (const id of TILESET_IDS) {
      const t = TILESETS[id];
      for (const k of ['grass', 'dirt', 'sand', 'rock', 'snow', 'mud', 'road']) expect(t.palette[k]).toBeDefined();
      expect(typeof t.water.color).toBe('number');
      expect(t.atmosphere.fogFar).toBeGreaterThan(t.atmosphere.fogNear);
      expect(t.decor).toBeDefined();
      if (!t.legacy) {
        expect(t.rules.rockSlope[1]).toBeGreaterThan(t.rules.rockSlope[0]);
        expect(t.surface.roughness).toBeGreaterThan(0);
      }
    }
  });

  it('resolve aliases e desconhecidos para o tileset padrão; mapas atuais ficam em verdejante', () => {
    expect(resolveTilesetId('ilhas')).toBe('verdejante');
    expect(resolveTilesetId(undefined)).toBe(DEFAULT_TILESET);
    expect(resolveTilesetId('lava')).toBe(DEFAULT_TILESET);
    expect(resolveTilesetId('pantano')).toBe('pantano');
    for (const m of listMaps({ includeHidden: true })) expect(getMapTileset(m).id).toBe('verdejante');
  });

  it('generateMap aceita os temas novos e grava em tileset', () => {
    for (const theme of ['inverno', 'devastadas', 'pantano']) {
      expect(GEN_THEMES).toContain(theme);
      expect(generateMap({ seed: 5, players: 2, size: 128, theme }).tileset).toBe(theme);
    }
  });

  it('splatWeights soma 1 e classifica por altura/declive', () => {
    const rules = TILESETS.inverno.rules;
    const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);
    for (const [h, s, n] of [[0, 0, 0.5], [1, 0.1, 0.2], [2.6, 0.1, 0.9], [5, 0.2, 0.5], [3, 2, 0.5]]) {
      expect(sum(splatWeights(rules, h, s, n))).toBeCloseTo(1, 6);
    }
    expect(splatWeights(rules, 0, 0, 0.5).seabed).toBeGreaterThan(0.9);
    expect(splatWeights(rules, 3, 2, 0.5).rock).toBeGreaterThan(0.9);
    expect(splatWeights(rules, 2.6, 0.05, 0.1).base).toBeGreaterThan(0.9);
    expect(splatWeights(rules, 7, 0.05, 0.5).high).toBeGreaterThan(0.9);
  });
});
