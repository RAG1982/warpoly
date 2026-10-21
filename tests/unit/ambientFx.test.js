import { describe, it, expect } from 'vitest';
import { AmbientFx, ambientKinds, AMBIENT_RADIUS } from '../../src/render/vfx/ambientFx.js';
import { ParticleRing } from '../../src/render/vfx/ParticleRing.js';
import { BIOME } from '../../src/data/maps/biome.js';
import { ambienceMix, AMBIENCE_LAYERS } from '../../src/audio/ambience.js';
import { minimapColorAt, MINIMAP_BIOME_COLOR } from '../../src/ui/terrainMinimapImage.js';

function fakeLayer(density = 0.7) {
  const mk = (cap) => ({ ring: new ParticleRing(cap) });
  return { enabled: true, density, time: 0, solid: mk(480), smoke: mk(160), glow: mk(320) };
}

const flat = (h = 1.2) => ({ mapDef: { size: 100, playable: 90 }, getHeight: () => h });
const regionsOf = (biome) => ({ biomeAt: () => biome });
const lavaEverywhere = { isLavaAt: () => true };

describe('efeitos ambientais (M2-18)', () => {
  it('só liga os efeitos que o mapa pode ter', () => {
    expect(ambientKinds({ biomes: new Set([BIOME.GRASS]) })).toEqual({ dust: false, ash: false, snow: false, lava: false, steam: false });
    expect(ambientKinds({ biomes: new Set([BIOME.DESERT, BIOME.ICE]), hasLava: true, fumaroles: 2 })).toEqual({ dust: true, ash: false, snow: true, lava: true, steam: true });
    const fx = new AmbientFx(fakeLayer(), { terrain: flat(), regions: regionsOf(BIOME.GRASS), biomes: new Set([BIOME.GRASS]) });
    expect(fx.active).toBe(false);
  });

  it('cada bioma gera as suas partículas nos pools certos, perto da câmera', () => {
    const cases = [
      [BIOME.DESERT, 'smoke'], [BIOME.VOLCANIC, 'solid'], [BIOME.VOLCANIC, 'glow'], [BIOME.ICE, 'solid'], [BIOME.SNOW, 'solid']
    ];
    for (const [biome, pool] of cases) {
      const layer = fakeLayer(1);
      const fx = new AmbientFx(layer, { terrain: flat(), regions: regionsOf(biome), biomes: new Set([biome]) });
      expect(fx.active).toBe(true);
      for (let i = 0; i < 120; i++) { layer.time += 0.05; fx.update(0.05, { x: 5, z: -5 }); }
      const ring = layer[pool].ring;
      expect(ring.totalSpawned, `${biome}/${pool}`).toBeGreaterThan(0);
      for (let i = 0; i < ring.used; i++) {
        expect(Math.hypot(ring.start[i * 3] - 5, ring.start[i * 3 + 2] + 5)).toBeLessThanOrEqual(AMBIENT_RADIUS + 0.01);
      }
    }
  });

  it('lava gera vapor, brasas e halos; fumarola gera vapor; densidade 0 não gera nada', () => {
    const layer = fakeLayer(1);
    const fx = new AmbientFx(layer, { terrain: flat(), regions: null, lava: lavaEverywhere, fumaroles: [{ x: 3, y: 1, z: 3 }], biomes: new Set() });
    for (let i = 0; i < 200; i++) { layer.time += 0.05; fx.update(0.05, { x: 0, z: 0 }); }
    expect(layer.smoke.ring.totalSpawned).toBeGreaterThan(0);
    expect(layer.glow.ring.totalSpawned).toBeGreaterThan(0);
    const off = fakeLayer(0);
    const fx0 = new AmbientFx(off, { terrain: flat(), regions: regionsOf(BIOME.DESERT), biomes: new Set([BIOME.DESERT]) });
    fx0.update(1, { x: 0, z: 0 });
    expect(off.smoke.ring.totalSpawned).toBe(0);
  });

  it('é determinístico e dá pontos de foco', () => {
    const run = () => {
      const layer = fakeLayer(1);
      const fx = new AmbientFx(layer, { terrain: flat(), regions: regionsOf(BIOME.ICE), biomes: new Set([BIOME.ICE]) });
      for (let i = 0; i < 40; i++) { layer.time += 0.05; fx.update(0.05, { x: 0, z: 0 }); }
      return Array.from(layer.solid.ring.start.slice(0, 30));
    };
    expect(run()).toEqual(run());
    const fx = new AmbientFx(fakeLayer(), { terrain: flat(), regions: regionsOf(BIOME.ICE), biomes: new Set([BIOME.ICE]) });
    expect(fx.focusPoints(2).length).toBe(1);
  });

  it('ambiência: a camada de lava só toca em mapa com lava', () => {
    expect(AMBIENCE_LAYERS).toContain('lava');
    expect(ambienceMix('vulcanico').lava).toBe(0);
    expect(ambienceMix('vulcanico', { lava: true }).lava).toBeGreaterThan(0);
  });

  it('minimapa: a lava é laranja', () => {
    const c = MINIMAP_BIOME_COLOR[BIOME.LAVA];
    expect(c.r).toBeGreaterThan(180);
    expect(c.b).toBeLessThan(60);
    expect(minimapColorAt(0.4, BIOME.LAVA)).toEqual(c);
  });
});
