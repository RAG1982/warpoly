import { describe, it, expect } from 'vitest';
import {
  generateIrregularCoast, irregularityIndex, outerIrregularity, coastFractalDimension, landMaskFromHeight, labelComponents, labelComponents8, lavaWalkable, bfsReach, LAND_HEIGHT, LAVA_HEIGHT
} from '../../tools/lib/irregularCoast.mjs';
import { renderBiomePreview, renderParchmentPreview, lavaIslandView } from '../../tools/lib/irregularCoastRender.mjs';
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

    it(`seed ${seed}: altura coerente com a máscara (terra >= 0,65 caminhável, exceto lava; mar < 0,65) e oceano nas bordas`, () => {
      const m = gen(seed);
      const G = m.grid;
      for (let c = 0; c < G * G; c++) {
        if (m.land[c] && m.lava?.mask[c]) { expect(m.height[c]).toBeCloseTo(LAVA_HEIGHT, 5); expect(m.height[c]).toBeLessThan(LAND_HEIGHT); }
        else if (m.land[c]) expect(m.height[c]).toBeGreaterThanOrEqual(LAND_HEIGHT);
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

/**
 * Lava como divisor de áreas na ilha vulcânica (docs/specs/MUNDO-TERRENO-MAPAS.md §3.5). As verificações são recontagens
 * independentes sobre as máscaras (8-conexo, sem "cortar quina": a lava tem que vedar também na diagonal).
 */
describe('irregularCoast: lava divide a ilha vulcânica', () => {
  const NAVAL_MAX_HEIGHT = 0.1; // src/data/combat.js
  const variants = [
    ...SEEDS.map((seed) => ({ name: `seed ${seed} (auto)`, seed, opts: {} })),
    { name: 'seed 4, 1 córrego', seed: 4, opts: { lavaStreams: 1 } },
    { name: 'seed 4, 2 córregos', seed: 4, opts: { lavaStreams: 2 } },
    { name: 'seed 9, 2 córregos, 1 passagem cada', seed: 9, opts: { lavaStreams: 2, lavaPassages: 1 } },
    { name: 'seed 9, 1 córrego, 2 passagens', seed: 9, opts: { lavaStreams: 1, lavaPassages: 2 } }
  ];
  const volcanic = (m) => m.entities.find((e) => e.biome === 'volcanic');
  const ownMask = (m) => m.owner.map((o) => (o === volcanic(m).index ? 1 : 0));

  for (const v of variants) {
    it(`${v.name}: lava vai de costa a costa, divide a terra em >= 2 áreas e há exatamente N passagens`, () => {
      const m = gen(v.seed, v.opts);
      const lv = m.lava, G = m.grid, N = G * G;
      expect(lv).not.toBeNull();
      const S = lv.streams.length;
      expect(S).toBeGreaterThanOrEqual(1); expect(S).toBeLessThanOrEqual(2);
      if (v.opts.lavaStreams) expect(S).toBe(v.opts.lavaStreams);
      for (const st of lv.streams) { expect(st.width).toBeGreaterThanOrEqual(3); expect(st.width).toBeLessThanOrEqual(4); }
      // (1) costa a costa: cada córrego (leito = lava + passagens) é UM componente com células coladas na água em dois pontos separados por ~ um diâmetro
      const stream = lv.mask.map((v, c) => (v || lv.passage[c] ? 1 : 0)); // o leito do córrego = lava + passagens de rocha
      const lc = labelComponents8(stream, G, 1);
      expect(lc.sizes).toHaveLength(S);
      const R = Math.sqrt(volcanic(m).area / (m.cell * m.cell) / Math.PI);
      for (let id = 0; id < S; id++) {
        const pts = [];
        for (let c = 0; c < N; c++) {
          if (lc.labels[c] !== id) continue;
          const i = c % G, j = (c - i) / G;
          let touchesSea = false;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!m.land[(j + dj) * G + i + di]) touchesSea = true;
          if (touchesSea) pts.push([i, j]);
        }
        expect(pts.length).toBeGreaterThan(1);
        let far = 0;
        for (const a of pts) for (const b of pts) far = Math.max(far, Math.hypot(a[0] - b[0], a[1] - b[1]));
        expect(far).toBeGreaterThan(0.9 * R);
      }
      // (2) terra firme da ilha sem passagens = S+1 áreas (>= 2), cada uma com folga para uma base
      const own = ownMask(m);
      const closed = new Uint8Array(N), open = new Uint8Array(N);
      for (let c = 0; c < N; c++) { open[c] = own[c] && !lv.mask[c] ? 1 : 0; closed[c] = open[c] && !lv.passage[c] ? 1 : 0; }
      const areas = labelComponents8(closed, G, 1);
      expect(areas.sizes.length).toBe(S + 1);
      expect(areas.sizes.length).toBeGreaterThanOrEqual(2);
      for (const n of areas.sizes) expect(n).toBeGreaterThanOrEqual(60);
      expect(lv.areaCount).toBe(S + 1);
      // (3) com as passagens abertas é UMA massa só; as passagens são exatamente N, entre 1 e 2 por córrego
      expect(labelComponents8(open, G, 1).sizes).toHaveLength(1);
      const pass = labelComponents8(lv.passage, G, 1);
      const expected = lv.streams.reduce((n, st) => n + st.passages.length, 0);
      expect(pass.sizes).toHaveLength(expected);
      expect(lv.passageCount).toBe(expected);
      for (const st of lv.streams) { expect(st.passages.length).toBeGreaterThanOrEqual(1); expect(st.passages.length).toBeLessThanOrEqual(2); }
      if (v.opts.lavaPassages) for (const st of lv.streams) expect(st.passages).toHaveLength(v.opts.lavaPassages);
      // cada passagem tem >= 6 células (>= 3 u de largura útil) e nenhuma passagem é lava
      for (const n of pass.sizes) expect(n).toBeGreaterThanOrEqual(12);
      for (let c = 0; c < N; c++) if (lv.passage[c]) expect(lv.mask[c]).toBe(0);
    });

    it(`${v.name}: as bases de cada área só se alcançam pela passagem (BFS) e a lava bloqueia terrestres e navais`, () => {
      const m = gen(v.seed, v.opts);
      const lv = m.lava, G = m.grid;
      expect(lv.bases).toHaveLength(lv.areaCount);
      const walkOpen = lavaWalkable(m, true), walkClosed = lavaWalkable(m, false);
      const cells = lv.bases.map((b) => b.cell);
      expect(new Set(cells).size).toBe(cells.length);
      for (const b of lv.bases) expect(b.clearance).toBeGreaterThanOrEqual(2.5);
      for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
        expect(bfsReach(walkOpen, G, cells[a], cells[b])).toBe(true); // pela passagem
        expect(bfsReach(walkClosed, G, cells[a], cells[b])).toBe(false); // sem ela, ilhas separadas
      }
      // altura assada: lava < 0,65 (terrestre bloqueia) e > NAVAL_MAX_HEIGHT (naval também); passagem caminhável
      for (let c = 0; c < G * G; c++) {
        if (lv.mask[c]) { expect(m.height[c]).toBeLessThan(LAND_HEIGHT); expect(m.height[c]).toBeGreaterThan(NAVAL_MAX_HEIGHT); }
        if (lv.passage[c]) expect(m.height[c]).toBeGreaterThanOrEqual(LAND_HEIGHT);
      }
      // a lava não altera a máscara de terra: continua UMA massa por entidade e nenhuma lava fora da ilha vulcânica
      expect(m.stats.landComponents).toBe(m.entities.length);
      for (let c = 0; c < G * G; c++) if (lv.mask[c] || lv.passage[c]) expect(m.owner[c]).toBe(volcanic(m).index);
    });
  }

  it('determinismo: mesma seed => mesma lava, passagens e bases; seeds diferentes => córregos diferentes', () => {
    const a = generateIrregularCoast({ seed: 11 }), b = generateIrregularCoast({ seed: 11 });
    expect(hashArr(a.lava.mask)).toBe(hashArr(b.lava.mask));
    expect(hashArr(a.lava.passage)).toBe(hashArr(b.lava.passage));
    expect(a.lava.bases.map((x) => x.cell)).toEqual(b.lava.bases.map((x) => x.cell));
    expect(a.lava.streams.map((s) => s.passages.length)).toEqual(b.lava.streams.map((s) => s.passages.length));
    expect(hashArr(a.biome)).toBe(hashArr(b.biome));
    expect(hashArr(gen(1).lava.mask)).not.toBe(hashArr(gen(2).lava.mask));
  });

  it('seeds 1–40: sempre há lava válida (nenhuma semente cai no fallback sem divisor)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = generateIrregularCoast({ seed });
      expect(m.lava, `seed ${seed}`).not.toBeNull();
      expect(m.stats.lava.areas).toBeGreaterThanOrEqual(2);
    }
  });

  it('lava: false desliga o divisor; o bioma LAVA só existe onde há lava', () => {
    const m = generateIrregularCoast({ seed: 1, lava: false });
    expect(m.lava).toBeNull();
    expect(m.biome.every((b) => b !== 8)).toBe(true);
    const w = gen(1);
    for (let c = 0; c < w.biome.length; c++) expect(w.biome[c] === 8).toBe(w.lava.mask[c] === 1);
  });

  it('prévia ampliada da ilha vulcânica (lava incandescente) é determinística; recorte cobre a ilha', () => {
    const m = gen(1);
    const view = lavaIslandView(m);
    expect(view.u1 - view.u0).toBeLessThan(0.5);
    const a = renderBiomePreview(m, 96, view), b = renderBiomePreview(m, 96, view);
    expect(hashArr(a.data)).toBe(hashArr(b.data));
    let hot = 0; // pixels alaranjados/vermelhos fortes (lava)
    for (let k = 0; k < a.data.length; k += 4) if (a.data[k] > 200 && a.data[k + 1] > 60 && a.data[k + 1] < 215 && a.data[k + 2] < 90) hot++;
    expect(hot).toBeGreaterThan(20);
  });

  it('desempenho: mapa completo com lava em < 3 s (pior caso: 2 córregos, 2 passagens por córrego)', () => {
    const t0 = performance.now();
    const m = generateIrregularCoast({ seed: 77, lavaStreams: 2, lavaPassages: 2 });
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(m.lava.passageCount).toBe(4);
  });
});
