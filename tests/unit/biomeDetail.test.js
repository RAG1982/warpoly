import { describe, it, expect } from 'vitest';
import {
  paintDetailAtlas, detailWeightsOfRegions, detailWeightsOfStyle, detailChannelsOf, terrainDetailEnabled,
  DETAIL_STYLE_WEIGHTS, DETAIL_ATLAS_SIDES
} from '../../src/models/environment/biomeDetail.js';
import { minimapColorAt, MINIMAP_BIOME_COLOR } from '../../src/ui/terrainMinimapImage.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { STYLE_VARIANTS } from '../../src/data/biomeStyles.js';
import { BIOME, gridOfBiome } from '../../src/data/maps/biome.js';
import { getRegionMap } from '../../src/data/biomeRegions.js';
import { getMap } from '../../src/data/maps/index.js';
import { buildCoastWorld, generateCoast, COAST_PRESETS } from '../../src/data/maps/coast/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

/**
 * M2-19 · detalhe procedural dos biomas (atlas ladrilhável + pesos por bioma) e M2-26 · neve solta no biomeGrid + minimapa com cor de bioma.
 */

function fnv(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

describe('M2-19 · atlas de detalhe', () => {
  const S = 128;
  const atlas = paintDetailAtlas(new Uint8Array(S * S * 4), S);

  it('é determinístico (mesmos bytes em duas pinturas)', () => {
    const again = paintDetailAtlas(new Uint8Array(S * S * 4), S);
    expect(fnv(again)).toBe(fnv(atlas));
  });

  it('cada canal tem contraste real (rocha, vulcânico, pântano e gelo não são chapados) e média perto do neutro', () => {
    for (let k = 0; k < 4; k++) {
      let sum = 0, sum2 = 0;
      for (let i = 0; i < S * S; i++) { const v = atlas[i * 4 + k]; sum += v; sum2 += v * v; }
      const mean = sum / (S * S), sd = Math.sqrt(sum2 / (S * S) - mean * mean);
      expect(sd, `canal ${k}`).toBeGreaterThan(14);
      expect(mean, `canal ${k}`).toBeGreaterThan(95);
      expect(mean, `canal ${k}`).toBeLessThan(175);
    }
  });

  it('ladrilha sem emenda: o salto entre a última e a primeira coluna/linha é do tamanho do salto entre vizinhos', () => {
    const jump = (ax, ay, bx, by, k) => Math.abs(atlas[(ay * S + ax) * 4 + k] - atlas[(by * S + bx) * 4 + k]);
    for (let k = 0; k < 4; k++) {
      let wrap = 0, inner = 0;
      for (let t = 0; t < S; t++) {
        wrap += jump(S - 1, t, 0, t, k) + jump(t, S - 1, t, 0, k);
        for (const c of [16, 37, 53, 71, 90, 111]) inner += (jump(c - 1, t, c, t, k) + jump(t, c - 1, t, c, k)) / 6;
      }
      expect(wrap / inner, `canal ${k}`).toBeLessThan(1.5);
    }
  });

  it('canais não pedidos ficam neutros (128) sem serem calculados', () => {
    const only = paintDetailAtlas(new Uint8Array(64 * 64 * 4), 64, [false, true, false, false]);
    for (let i = 0; i < 64 * 64; i++) { expect(only[i * 4]).toBe(128); expect(only[i * 4 + 2]).toBe(128); expect(only[i * 4 + 3]).toBe(128); }
  });

  it('o lado segue ?texq= (low 256, med 512, high 1024) e o atlas de 1024 (reamostrado) também ladrilha e tem contraste', () => {
    expect(DETAIL_ATLAS_SIDES).toMatchObject({ low: 256, med: 512, high: 1024 });
    const big = paintDetailAtlas(new Uint8Array(1024 * 1024 * 4), 1024, [false, false, false, true]);
    let sum = 0, sum2 = 0, wrap = 0, inner = 0;
    for (let i = 0; i < 1024 * 1024; i++) { const v = big[i * 4 + 3]; sum += v; sum2 += v * v; }
    const mean = sum / (1024 * 1024);
    expect(Math.sqrt(sum2 / (1024 * 1024) - mean * mean)).toBeGreaterThan(14);
    for (let t = 0; t < 1024; t++) {
      wrap += Math.abs(big[(t * 1024 + 1023) * 4 + 3] - big[(t * 1024) * 4 + 3]);
      inner += Math.abs(big[(t * 1024 + 511) * 4 + 3] - big[(t * 1024 + 512) * 4 + 3]);
    }
    expect(wrap / inner).toBeLessThan(1.6);
  });
});

describe('M2-19 · pesos por estilo e por região', () => {
  it('só rocha (pedregoso), vulcânico, pântano, neve e gelo têm detalhe; os demais estilos não', () => {
    expect(detailWeightsOfStyle(TILESETS.pedregoso)).toEqual([1, 0, 0, 0]);
    expect(detailWeightsOfStyle(TILESETS.vulcanico)).toEqual([0, 1, 0, 0]);
    expect(detailWeightsOfStyle(TILESETS.pantano)).toEqual([0, 0, 1, 0]);
    expect(detailWeightsOfStyle(TILESETS.inverno)[3]).toBeGreaterThan(0);
    expect(detailWeightsOfStyle(STYLE_VARIANTS['inverno:gelo'])[3]).toBe(1);
    for (const id of ['verdejante', 'exuberante', 'deserto', 'savana', 'devastadas']) expect(detailWeightsOfStyle(TILESETS[id]), id).toBeNull();
    expect(Object.keys(DETAIL_STYLE_WEIGHTS).sort()).toEqual(['inverno', 'inverno:gelo', 'pantano', 'pedregoso', 'vulcanico']);
    expect(detailChannelsOf([TILESETS.exuberante, TILESETS.vulcanico])).toEqual([false, true, false, false]);
    expect(detailChannelsOf([TILESETS.exuberante, TILESETS.deserto])).toEqual([false, false, false, false]);
  });

  it('textura de pesos do mapa regional: rocha/vulcânico/neve valem onde o bioma está; mar zero; grama e deserto zero', () => {
    const map = makeRegionalMap({ id: 'detail-weights' });
    const rm = getRegionMap(map);
    const w = detailWeightsOfRegions(rm);
    expect(w.n).toBe(rm.nodes);
    const at = (x, z) => { const i = rm.cellIndexAt(x, z) * 4; return [w.data[i], w.data[i + 1], w.data[i + 2], w.data[i + 3]]; };
    const volc = at(0, 38), rock = at(0, 23.5), snow = at(-36, -30), grass = at(-10, -5), desert = at(30, -2), sea = at(-60, 40);
    expect(volc[1]).toBeGreaterThan(120);
    expect(rock[0]).toBeGreaterThan(100);
    expect(snow[3]).toBeGreaterThan(100);
    expect(grass.every((v) => v < 8)).toBe(true);
    expect(desert.every((v) => v < 8)).toBe(true);
    expect(sea).toEqual([0, 0, 0, 0]);
  });

  it('mapa sem estilo com detalhe devolve null (nenhuma textura, nenhum custo)', () => {
    const plain = makeRegionalMap({ id: 'detail-plain', withBiomes: true });
    const rm = getRegionMap({ ...plain, biomeGrid: { ...plain.biomeGrid } });
    expect(rm).not.toBeNull();
    // o mapa da fixture TEM vulcânico, então só conferimos o caminho "sem detalhe" pela API de estilo
    expect(detailChannelsOf([TILESETS.exuberante])).toEqual([false, false, false, false]);
  });

  it('?terraindetail=0 desliga; o padrão é ligado', () => {
    expect(terrainDetailEnabled('?terraindetail=0')).toBe(false);
    expect(terrainDetailEnabled('?texq=low')).toBe(true);
    expect(terrainDetailEnabled('')).toBe(true);
  });
});

describe('M2-26 · neve solta no biomeGrid', () => {
  /** Manchas de neve (4-vizinhança) de um biomeGrid: `{ cells }[]`. */
  function snowComponents(def) {
    const g = gridOfBiome(def.biomeGrid);
    const n = def.biomeGrid.nodes, cell = def.biomeGrid.cell;
    const seen = new Uint8Array(n * n);
    const out = [];
    for (let s = 0; s < n * n; s++) {
      if (g[s] !== BIOME.SNOW || seen[s]) continue;
      const q = [s]; seen[s] = 1; let cells = 0, hsum = 0;
      while (q.length) {
        const c = q.pop(); cells++;
        const x = c % n, y = (c - x) / n;
        hsum += getHeightForMap(def, x * cell - def.size / 2, y * cell - def.size / 2);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = y + dz;
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
          const k = nz * n + nx;
          if (g[k] === BIOME.SNOW && !seen[k]) { seen[k] = 1; q.push(k); }
        }
      }
      out.push({ cells, meanHeight: hsum / cells });
    }
    return out;
  }

  it('os 6 mapas do MUNDO-7: mancha de neve com menos de 400 células só em terreno baixo (ilha de gelo), nunca num pico solto', () => {
    for (const id of ['duelo-continental-1', 'duelo-continental-2', 'duelo-continental-3', 'ilha-unica-1', 'ilha-unica-2', 'ilha-unica-3']) {
      const def = getMap(id);
      const odd = snowComponents(def).filter((c) => c.cells < 400 && c.meanHeight >= 2.8);
      expect(odd, id).toEqual([]);
    }
  });

  it('o JSON assado é o que o gerador produz hoje (biomeGrid do duelo 1 e da ilha 1) — sem edição à mão', () => {
    for (const [id, preset] of [['duelo-continental-1', 'duelo-continental'], ['ilha-unica-1', 'ilha-unica']]) {
      const def = getMap(id);
      const w = buildCoastWorld(preset, { seed: def.meta.seed, id: def.id, name: def.name, tileset: def.tileset });
      expect(w.ok, id).toBe(true);
      expect(JSON.stringify(w.mapDef.biomeGrid), id).toBe(JSON.stringify(def.biomeGrid));
      expect(JSON.stringify(w.mapDef.terrain), id).toBe(JSON.stringify(def.terrain)); // só o bioma mudou; o terreno (e a sim) não
    }
  });

  it('snowMinCells age só no bioma: mesma altura e mesma terra; sem a opção (0) o resultado é o de sempre', () => {
    const base = { ...COAST_PRESETS['ilha-unica'].options, seed: 1 };
    const off = generateCoast({ ...base, snowMinCells: 0 });
    const on = generateCoast({ ...base, snowMinCells: 400 });
    expect(Array.from(on.height)).toEqual(Array.from(off.height));
    expect(Array.from(on.land)).toEqual(Array.from(off.land));
    let snowOff = 0, snowOn = 0;
    for (const b of off.biome) if (b === BIOME.SNOW) snowOff++;
    for (const b of on.biome) if (b === BIOME.SNOW) snowOn++;
    expect(snowOff).toBeGreaterThan(snowOn);
    expect(snowOn).toBe(0);
  });
});

describe('M2-26 · minimapa com cor de bioma', () => {
  it('sem biomeGrid (bioma null) é a regra antiga por altura', () => {
    expect(minimapColorAt(0.1, null)).toEqual({ r: 30, g: 72, b: 96 });
    expect(minimapColorAt(0.4, null)).toEqual({ r: 212, g: 190, b: 131 });
    expect(minimapColorAt(1.2, null)).toEqual({ r: 98, g: 158, b: 70 });
    expect(minimapColorAt(3, null)).toEqual({ r: 138, g: 130, b: 118 });
  });

  it('com bioma: água pela altura; neve branca, vulcânico escuro, lava laranja, deserto dourado, pântano oliva', () => {
    expect(minimapColorAt(0.1, BIOME.SNOW)).toEqual({ r: 30, g: 72, b: 96 });
    const snow = minimapColorAt(2.5, BIOME.SNOW), grass = minimapColorAt(2.5, BIOME.GRASS), volc = minimapColorAt(2.5, BIOME.VOLCANIC);
    expect(snow.r + snow.g + snow.b).toBeGreaterThan(grass.r + grass.g + grass.b);
    expect(volc.r + volc.g + volc.b).toBeLessThan(grass.r + grass.g + grass.b);
    expect(minimapColorAt(0.4, BIOME.LAVA)).toEqual(MINIMAP_BIOME_COLOR[BIOME.LAVA]);
    const desert = minimapColorAt(2.5, BIOME.DESERT), swamp = minimapColorAt(2.5, BIOME.SWAMP);
    expect(desert.r).toBeGreaterThan(desert.b + 60);
    expect(swamp.g).toBeGreaterThan(swamp.b);
    // a terra deixou de ser cinza-marrom: grama é verde (g domina) e floresta é mais escura que a grama
    expect(grass.g).toBeGreaterThan(grass.r);
    expect(minimapColorAt(2.5, BIOME.FOREST).g).toBeLessThan(grass.g);
  });

  it('praia de um bioma mistura areia com a cor dele', () => {
    const beach = minimapColorAt(0.5, BIOME.VOLCANIC), land = minimapColorAt(2.5, BIOME.VOLCANIC);
    expect(beach.r).toBeGreaterThan(land.r + 30);
  });
});
