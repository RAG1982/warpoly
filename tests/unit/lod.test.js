import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { LOD_DISTANCES, lodLevelForDistance, zoomHidesDecorations, lodEnabled, DECORATION_HIDE_ZOOM } from '../../src/render/lod.js';

// As texturas de decoração são pintadas em <canvas> (inexistente no Node): mapas vazios bastam para o `Decorations`.
const empty = () => ({ map: null, roughnessMap: null, bumpMap: null });
vi.mock('../../src/models/environment/rockTextures.js', () => ({ getGraniteBoulderTextures: empty, getRiverPebbleTextures: empty }));
vi.mock('../../src/models/environment/floraTextures.js', () => ({
  getFlowerTextures: empty, getFlowerCenterTextures: empty, getBerryBushTextures: empty, getBerryTextures: empty,
  getGrassBladeTextures: empty, getMushroomTextures: empty, getStumpBarkTextures: empty, getWaterLilyTextures: empty, getLotusTextures: empty
}));
const { Decorations } = await import('../../src/world/Decorations.js');

describe('lodLevelForDistance (F1-10)', () => {
  const t = LOD_DISTANCES.unit;
  it('perto = 0, longe = 1', () => {
    expect(lodLevelForDistance(10, t)).toBe(0);
    expect(lodLevelForDistance(t * 2, t)).toBe(1);
  });
  it('histerese: dentro da banda o nível não alterna', () => {
    const inBand = t * 1.04;
    expect(lodLevelForDistance(inBand, t, 0)).toBe(0); // vindo de perto, ainda não passou t·1,08
    expect(lodLevelForDistance(inBand, t, 1)).toBe(1); // vindo de longe, ainda não caiu abaixo de t·0,92
    expect(lodLevelForDistance(t * 1.1, t, 0)).toBe(1);
    expect(lodLevelForDistance(t * 0.9, t, 1)).toBe(0);
  });
});

describe('decorações e zoom (F1-10)', () => {
  it('limiar de zoom', () => {
    expect(zoomHidesDecorations(DECORATION_HIDE_ZOOM)).toBe(false);
    expect(zoomHidesDecorations(1.8)).toBe(true);
    expect(zoomHidesDecorations(1.0)).toBe(false);
  });

  it('?lod=0 desliga o LOD', () => {
    expect(lodEnabled('?lod=0')).toBe(false);
    expect(lodEnabled('?skipPreload')).toBe(true);
  });

  it('applyLod: zoom afastado esconde só as pequenas; voltar ao zoom normal restaura o que o tileset deixa visível', () => {
    const terrain = { width: 140, getHeight: () => 2.5, mapDef: { tileset: 'verdejante', size: 140 } };
    const deco = new Decorations(new THREE.Scene(), terrain, { tileset: 'verdejante' });
    const byName = (n) => deco.group.children.find((c) => c.name === n);
    const grass = byName('InstancedGrassTufts');
    const boulders = byName('InstancedBoulders');
    const mush = byName('InstancedMushrooms');
    expect(grass && boulders && mush).toBeTruthy();
    const mushBase = mush.visible; // o tileset pode ter desligado cogumelos

    deco.applyLod(1.8);
    expect(grass.visible).toBe(false);
    expect(mush.visible).toBe(false);
    expect(boulders.visible).toBe(true); // pedra grande é referência de navegação

    deco.applyLod(1.0);
    expect(grass.visible).toBe(true);
    expect(mush.visible).toBe(mushBase);
  });
});
