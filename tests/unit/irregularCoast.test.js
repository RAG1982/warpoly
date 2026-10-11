import { describe, it, expect } from 'vitest';
import {
  generateIrregularCoast, irregularityIndex, outerIrregularity, coastFractalDimension, landMaskFromHeight, labelComponents, LAND_HEIGHT
} from '../../tools/lib/irregularCoast.mjs';
import { renderBiomePreview, renderParchmentPreview } from '../../tools/lib/irregularCoastRender.mjs';
import { getMap } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/sim/terrainGenerators.js';

/**
 * Protótipo de contornos irregulares (docs/specs/MUNDO-TERRENO-MAPAS.md §B; só tools/ + este teste, nada em src/).
 * Cobre: determinismo, conectividade (cada continente/ilha = 1 massa de terra), proporção de terra, ausência de lagoas minúsculas,
 * rota naval, altura coerente com a máscara e irregularidade medida × mapas atuais (`ilhas-4p`, `continental-1v1`).
 */
const SEEDS = [1, 2, 3, 4, 5, 6];
const maps = new Map();
const gen = (seed, opts = {}) => {
  const key = `${seed}:${JSON.stringify(opts)}`;
  if (!maps.has(key)) maps.set(key, generateIrregularCoast({ seed, ...opts }));
  return maps.get(key);
};
const hashArr = (a) => { let h = 2166136261; for (let i = 0; i < a.length; i++) h = Math.imul(h ^ (a[i] * 1000 | 0), 16777619); return h >>> 0; };

describe('irregularCoast: determinismo', () => {
  it('mesma seed => mesma máscara, altura e bioma; seeds diferentes => mapas diferentes', () => {
    const a = generateIrregularCoast({ seed: 7 });
    const b = generateIrregularCoast({ seed: 7 });
    expect(hashArr(a.land)).toBe(hashArr(b.land));
    expect(hashArr(a.height)).toBe(hashArr(b.height));
    expect(hashArr(a.biome)).toBe(hashArr(b.biome));
    expect(hashArr(gen(1).land)).not.toBe(hashArr(gen(2).land));
  });

  it('as prévias em RGBA são determinísticas e têm o tamanho pedido', () => {
    const m = gen(1);
    const a = renderBiomePreview(m, 128), b = renderBiomePreview(m, 128);
    expect(a.width).toBe(128);
    expect(a.data.length).toBe(128 * 128 * 4);
    expect(hashArr(a.data)).toBe(hashArr(b.data));
    expect(renderParchmentPreview(m, 96).data.length).toBe(96 * 96 * 4);
  });
});

describe('irregularCoast: estrutura', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: 2 continentes + >= 5 ilhas de tipos diferentes, cada entidade é UMA massa de terra`, () => {
      const m = gen(seed);
      const continents = m.entities.filter((e) => e.kind === 'continent');
      const islands = m.entities.filter((e) => e.kind === 'island');
      expect(continents).toHaveLength(2);
      expect(islands.length).toBeGreaterThanOrEqual(5);
      expect(new Set(islands.map((e) => e.biome)).size).toBeGreaterThanOrEqual(5);
      expect(m.stats.entityComponents.every((n) => n === 1)).toBe(true);
      expect(m.stats.landComponents).toBe(m.entities.length); // nenhuma entidade fundida/partida, nenhum fragmento solto
      for (const e of m.entities) expect(e.area).toBeGreaterThan(10);
    });

    it(`seed ${seed}: proporção de terra entre 25% e 50%`, () => {
      const f = gen(seed).stats.landFraction;
      expect(f).toBeGreaterThan(0.25);
      expect(f).toBeLessThan(0.5);
    });

    it(`seed ${seed}: sem lagoas < minLake células; água do mar toda ligada (rota naval a todas as entidades)`, () => {
      const m = gen(seed);
      expect(m.stats.smallestLake).toBeGreaterThanOrEqual(m.options.minLake);
      // recontagem independente: todo componente de água que não é o oceano tem >= minLake células
      const water = new Uint8Array(m.land.length).map((_, i) => (m.land[i] ? 0 : 1));
      const wl = labelComponents(water, m.grid, 1);
      const ocean = wl.labels[0];
      wl.sizes.forEach((n, id) => { if (id !== ocean) expect(n).toBeGreaterThanOrEqual(m.options.minLake); });
      expect(m.stats.seaMainFraction).toBeGreaterThan(0.95);
      expect(m.stats.allEntitiesReachableBySea).toBe(true);
    });

    it(`seed ${seed}: altura coerente com a máscara (terra >= 0,65 caminhável; mar < 0,65) e oceano nas bordas`, () => {
      const m = gen(seed);
      const G = m.grid;
      for (let c = 0; c < G * G; c++) {
        if (m.land[c]) expect(m.height[c]).toBeGreaterThanOrEqual(LAND_HEIGHT);
        else expect(m.height[c]).toBeLessThan(LAND_HEIGHT);
      }
      for (let i = 0; i < G; i++) {
        expect(m.land[i]).toBe(0); expect(m.land[(G - 1) * G + i]).toBe(0); expect(m.land[i * G]).toBe(0); expect(m.land[i * G + G - 1]).toBe(0);
      }
    });
  }

  it('o 1º continente é "exuberante" (lush) e o 2º "árido"; as ilhas incluem vulcânica, rochosa, gelo e pântano', () => {
    const m = gen(1);
    expect(m.entities[0].biome).toBe('lush');
    expect(m.entities[1].biome).toBe('arid');
    const biomes = new Set(m.entities.map((e) => e.biome));
    for (const b of ['volcanic', 'rocky', 'ice', 'swamp']) expect(biomes.has(b)).toBe(true);
  });

  it('parâmetros: mais ilhas e simetria "mirror" funcionam; islands < 5 é rejeitado', () => {
    expect(gen(2, { islands: 8 }).entities.filter((e) => e.kind === 'island').length).toBeGreaterThanOrEqual(6);
    const mir = gen(3, { symmetry: 'mirror' });
    const [a, b] = mir.entities;
    expect(Math.abs(a.area - b.area) / a.area).toBeLessThan(0.45); // espelho com ruído próprio: áreas parecidas, contornos não idênticos
    expect(mir.stats.landComponents).toBe(mir.entities.length);
    expect(() => generateIrregularCoast({ seed: 1, islands: 3 })).toThrow();
  });

  it('desempenho: um mapa 256x256 em menos de 3 s', () => {
    const t0 = performance.now();
    generateIrregularCoast({ seed: 99 });
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('irregularCoast: irregularidade medida x mapas atuais', () => {
  const G = 256;
  const current = (id) => landMaskFromHeight(getMap(id), getHeightForMap, G);

  it('o estimador (Crofton) dá ~1 para um disco e ~1,13 para um quadrado', () => {
    const disc = new Uint8Array(G * G), sq = new Uint8Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      if (Math.hypot(i - 128, j - 128) < 80) disc[j * G + i] = 1;
      if (Math.abs(i - 128) < 70 && Math.abs(j - 128) < 70) sq[j * G + i] = 1;
    }
    expect(irregularityIndex(disc, G).largest).toBeGreaterThan(0.95);
    expect(irregularityIndex(disc, G).largest).toBeLessThan(1.08);
    expect(irregularityIndex(sq, G).largest).toBeGreaterThan(1.05);
    expect(irregularityIndex(sq, G).largest).toBeLessThan(1.22);
  });

  it('os mapas novos têm perímetro/√área bem acima de ilhas-4p e do contorno externo do continental-1v1', () => {
    const ilhas = irregularityIndex(current('ilhas-4p'), G).weighted;
    const continentalOuter = outerIrregularity(current('continental-1v1'), G).weighted; // rio fechado: só o contorno externo
    expect(ilhas).toBeLessThan(1.3); // discos + pontes
    expect(continentalOuter).toBeLessThan(1.3); // quase um quadrado
    for (const seed of SEEDS) {
      const idx = gen(seed).stats.irregularity.weighted;
      expect(idx).toBeGreaterThan(1.45);
      expect(idx).toBeGreaterThan(ilhas * 1.25);
      expect(idx).toBeGreaterThan(continentalOuter * 1.25);
    }
  });

  it('dimensão fractal da costa: novos > 1,08; mapas atuais ≈ 1,0', () => {
    const olds = ['continental-1v1', 'ilhas-4p', 'arquipelago-naval-4p'].map((id) => coastFractalDimension(current(id), G));
    for (const d of olds) expect(d).toBeLessThan(1.08);
    for (const seed of SEEDS) expect(gen(seed).stats.fractalDim).toBeGreaterThan(Math.max(...olds) + 0.03);
  });
});
