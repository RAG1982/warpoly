import { describe, it, expect } from 'vitest';
import { paintSplat } from '../../src/models/environment/splatPaint.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { BIOME, encodeBiomeGrid, paintedNodes } from '../../src/data/maps/biome.js';
import { getRegionMap } from '../../src/data/biomeRegions.js';
import { STYLE_VARIANTS } from '../../src/data/biomeStyles.js';
import { buildLavaInfo, LAVA_STYLE } from '../../src/data/lavaRender.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

/**
 * MUNDO-5 · pintura do splat do terreno (`splatPaint.js`, extraída de `tilesetTextures.js`).
 *
 * 1. Caminho ANTIGO (mapa sem `biomeGrid`): os hashes abaixo foram gerados com o código de `tilesetTextures.js` ANTERIOR à MUNDO-5
 *    (commit 82541c6), rodando o laço de pixels original num canvas de 96 × 96 e 64 × 64. O mesmo resultado, byte a byte, prova
 *    que o refatoramento não mudou nada para os mapas atuais.
 * 2. Caminho regional: mistura de estilos por região, fronteira, praia/mar herdando a terra vizinha, borda da lava.
 */

const heightA = (x, z) => 3.4 - (x * x + (z * 0.8) * (z * 0.8)) / 140 + (((x * 0.37 + z * 0.23) % 2) - 1) * 0.6;
const heightB = (x, z) => 2.2 + ((x * 0.11 - z * 0.07) % 3) * 0.9 - Math.max(0, 25 - Math.abs(x + 12) - Math.abs(z - 8)) * 0.18 * ((x > 0) ? 1 : -1) + (x * z) / 900;

function fnv(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

function paint(N, s) {
  const data = new Uint8ClampedArray(N * N * 4);
  paintSplat(data, N, N, {
    def: TILESETS[s.tileset], size: s.size, getHeight: s.h === 'A' ? heightA : heightB, waterLevel: 0.5,
    startSlots: s.startSlots || [], masks: s.masks || []
  });
  return data;
}

const SCENARIOS = {
  inverno_A: { tileset: 'inverno', size: 96, h: 'A' },
  exuberante_A_slots_masks: { tileset: 'exuberante', size: 96, h: 'A', startSlots: [{ x: -20, z: -10 }, { x: 22, z: 14 }], masks: [{ layer: 'sand', x: 5, z: 5, r: 9, strength: 0.8 }, { layer: 'dirt', x: -8, z: 12, r: 6 }] },
  deserto_B: { tileset: 'deserto', size: 120, h: 'B', startSlots: [{ x: 0, z: 0 }] },
  vulcanico_A_masks: { tileset: 'vulcanico', size: 96, h: 'A', masks: [{ layer: 'rock', x: 0, z: 0, r: 14 }, { layer: 'mud', x: 15, z: -15, r: 7, strength: 0.6 }] },
  pedregoso_B: { tileset: 'pedregoso', size: 96, h: 'B' },
  pantano_A: { tileset: 'pantano', size: 140, h: 'A', startSlots: [{ x: 10, z: 10 }] },
  devastadas_B_masks: { tileset: 'devastadas', size: 96, h: 'B', masks: [{ layer: 'snow', x: -20, z: 20, r: 10 }, { layer: 'invalida', x: 0, z: 0, r: 30 }] },
  savana_A: { tileset: 'savana', size: 96, h: 'A', startSlots: [{ x: -30, z: 0 }] }
};

/** FNV-1a dos bytes RGBA do código antigo (commit 82541c6): 96 × 96 e 64 × 64 px. */
const GOLDEN_96 = {
  inverno_A: '669faf6', exuberante_A_slots_masks: '51329e97', deserto_B: 'beeab268', vulcanico_A_masks: '5aa89b1a',
  pedregoso_B: 'c26512ac', pantano_A: '7115addb', devastadas_B_masks: 'be2c00c5', savana_A: '816b98f1'
};
const GOLDEN_64 = {
  inverno_A: 'd799676b', exuberante_A_slots_masks: '3aaccb01', deserto_B: '96e96e9f', vulcanico_A_masks: '679ae8c4',
  pedregoso_B: '340c0742', pantano_A: '676cb462', devastadas_B_masks: '137bc832', savana_A: '90d26f38'
};

describe('splat do terreno · caminho antigo (mapa sem biomeGrid) = mesmos bytes de antes da MUNDO-5', () => {
  for (const [name, s] of Object.entries(SCENARIOS)) {
    it(`${name}: 96×96 e 64×64`, () => {
      expect(fnv(paint(96, s))).toBe(GOLDEN_96[name]);
      expect(fnv(paint(64, s))).toBe(GOLDEN_64[name]);
    });
  }

  it('é determinístico (duas pinturas = mesmos bytes)', () => {
    const a = paint(48, SCENARIOS.exuberante_A_slots_masks);
    const b = paint(48, SCENARIOS.exuberante_A_slots_masks);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

// ---------------------------------------------------------------------------------------------
// Caminho regional (MUNDO-5)
// ---------------------------------------------------------------------------------------------

/** Mapa 96 × 96 todo de terra (h = 2,6), com um `biomeGrid` decidido por `biomeAt(x, z)`; sem mar para os testes de mistura. */
function flatLandMap(id, biomeAt, tileset = 'exuberante') {
  const size = 96, nodes = paintedNodes(size, 1);
  const bio = new Uint8Array(nodes * nodes);
  for (let j = 0; j < nodes; j++) for (let i = 0; i < nodes; i++) bio[j * nodes + i] = biomeAt(-size / 2 + i, -size / 2 + j);
  return { id, size, tileset, biomeGrid: { cell: 1, nodes, data: encodeBiomeGrid(bio) } };
}
const flat = () => 2.6;
const NPX = 96; // 1 px por u
const worldOf = (px) => -48 + (px + 0.5);

function paintFlat(def, regions = null, lava = null, extra = {}) {
  const data = new Uint8ClampedArray(NPX * NPX * 4);
  paintSplat(data, NPX, NPX, { def, size: 96, getHeight: flat, waterLevel: 0.5, regions, lava, ...extra });
  return data;
}
const at = (data, px, py) => { const o = (py * NPX + px) * 4; return [data[o], data[o + 1], data[o + 2]]; };

describe('splat do terreno · caminho regional', () => {
  it('biomeGrid uniforme no bioma do tileset base = os mesmos bytes do caminho antigo (inclusive bases e máscaras)', () => {
    const map = flatLandMap('splat-uniforme', () => BIOME.GRASS);
    const rm = getRegionMap(map);
    expect(rm.styleCount).toBe(1);
    const extra = { startSlots: [{ x: -20, z: -10 }, { x: 22, z: 14 }], masks: [{ layer: 'sand', x: 5, z: 5, r: 9, strength: 0.8 }] };
    const legacy = paintFlat(TILESETS.exuberante, null, null, extra);
    const regional = paintFlat(TILESETS.exuberante, rm, null, extra);
    expect(fnv(regional)).toBe(fnv(legacy));
  });

  it('biomeGrid todo de FLORESTA = a variante "floresta" aplicada ao mapa inteiro (e diferente do tileset base)', () => {
    const map = flatLandMap('splat-floresta', () => BIOME.FOREST);
    const rm = getRegionMap(map);
    const forest = paintFlat(STYLE_VARIANTS['exuberante:floresta'], null);
    const regional = paintFlat(TILESETS.exuberante, rm);
    expect(fnv(regional)).toBe(fnv(forest));
    expect(fnv(regional)).not.toBe(fnv(paintFlat(TILESETS.exuberante, null)));
  });

  it('dois biomas lado a lado: longe da fronteira cada lado é o estilo puro; na fronteira há mistura entre os dois', () => {
    const map = flatLandMap('splat-fronteira', (x) => (x < 0 ? BIOME.GRASS : BIOME.SAVANNA));
    const rm = getRegionMap(map);
    expect(rm.styles.map((s) => s.key)).toEqual(['exuberante', 'savana']);
    const regional = paintFlat(TILESETS.exuberante, rm);
    const grass = paintFlat(TILESETS.exuberante, null);
    const savanna = paintFlat(TILESETS.savana, null);
    let pureWest = 0, pureEast = 0, blended = 0;
    for (let py = 8; py < NPX - 8; py += 3) {
      for (let px = 0; px < NPX; px++) {
        const x = worldOf(px);
        const r = at(regional, px, py), a = at(grass, px, py), b = at(savanna, px, py);
        if (x < -8) { expect(r, `oeste ${px},${py}`).toEqual(a); pureWest++; }
        else if (x > 8) { expect(r, `leste ${px},${py}`).toEqual(b); pureEast++; }
        else {
          for (let k = 0; k < 3; k++) { // combinação convexa dos dois estilos (±2 de arredondamento)
            expect(r[k]).toBeGreaterThanOrEqual(Math.min(a[k], b[k]) - 2);
            expect(r[k]).toBeLessThanOrEqual(Math.max(a[k], b[k]) + 2);
          }
          if (r.some((v, k) => Math.abs(v - a[k]) > 2) && r.some((v, k) => Math.abs(v - b[k]) > 2)) blended++;
        }
      }
    }
    expect(pureWest).toBeGreaterThan(500);
    expect(pureEast).toBeGreaterThan(500);
    expect(blended).toBeGreaterThan(20); // a faixa de mistura existe
  });

  it('a faixa de mistura é estreita (poucas colunas) e a fronteira é irregular (ruído de domínio), não uma reta', () => {
    const map = flatLandMap('splat-irregular', (x) => (x < 0 ? BIOME.GRASS : BIOME.SAVANNA));
    const rm = getRegionMap(map);
    const regional = paintFlat(TILESETS.exuberante, rm);
    const grass = paintFlat(TILESETS.exuberante, null);
    const savanna = paintFlat(TILESETS.savana, null);
    const dist = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]);
    const firstEast = []; // por linha: primeira coluna em que o pixel já é o do estilo leste
    for (let py = 8; py < NPX - 8; py += 2) {
      let col = -1;
      for (let px = 40; px < 60; px++) if (dist(at(regional, px, py), at(savanna, px, py)) <= 4 && dist(at(regional, px, py), at(grass, px, py)) > 4) { col = px; break; }
      if (col >= 0) firstEast.push(col);
    }
    expect(firstEast.length).toBeGreaterThan(10);
    expect(Math.max(...firstEast) - Math.min(...firstEast)).toBeGreaterThanOrEqual(2); // ondula (não é uma coluna fixa)
    expect(Math.max(...firstEast) - Math.min(...firstEast)).toBeLessThanOrEqual(12); // mas sem sair da faixa da fronteira
  });

  it('rules.base só vale no caminho regional: o deserto fica de areia (e o antigo continua como era, capim seco)', () => {
    const map = flatLandMap('splat-deserto', () => BIOME.DESERT, 'deserto');
    const rm = getRegionMap(map);
    const legacy = paintFlat(TILESETS.deserto, null);
    const regional = paintFlat(TILESETS.deserto, rm);
    const sand = [0xe6, 0xcf, 0x9c];
    const meanDist = (data) => {
      let d = 0;
      for (let i = 0; i < data.length; i += 4) d += Math.hypot(data[i] - sand[0], data[i + 1] - sand[1], data[i + 2] - sand[2]);
      return d / (data.length / 4);
    };
    expect(fnv(regional)).not.toBe(fnv(legacy));
    expect(meanDist(regional)).toBeLessThan(meanDist(legacy)); // mais perto da areia clara
  });

  it('o terreno do mapa de fixture: mar longe da costa = estilo base; dentro de cada região a cor é a do estilo dela', () => {
    const map = makeRegionalMap({ id: 'splat-fixture' });
    const terrain = new Terrain(map);
    const rm = getRegionMap(map);
    const N = 192;
    const paintFull = (def, regions, lava) => {
      const data = new Uint8ClampedArray(N * N * 4);
      paintSplat(data, N, N, { def, size: 96, getHeight: (x, z) => terrain.getHeight(x, z), waterLevel: 0.5, startSlots: map.startSlots, regions, lava });
      return data;
    };
    const px = (x) => Math.floor(((x + 48) / 96) * N);
    const reg = paintFull(TILESETS.exuberante, rm, null);
    const base = paintFull(TILESETS.exuberante, null, null);
    const get = (data, x, z) => { const o = (px(z) * N + px(x)) * 4; return [data[o], data[o + 1], data[o + 2]]; };
    // mar aberto (canto sudoeste): estilo base = idêntico ao caminho antigo
    expect(get(reg, -44, 44)).toEqual(get(base, -44, 44));
    // miolo do deserto: igual ao pintado com o tileset deserto... e diferente do base
    expect(get(reg, 30, -2)).not.toEqual(get(base, 30, -2));
  });

  it('a lava ganha borda incandescente no terreno vizinho; longe dela nada muda; sem lava = sem mudança', () => {
    const map = makeRegionalMap({ id: 'splat-lava' });
    const terrain = new Terrain(map);
    const rm = getRegionMap(map);
    const lava = buildLavaInfo(map);
    const N = 192;
    const paintFull = (lv) => {
      const data = new Uint8ClampedArray(N * N * 4);
      paintSplat(data, N, N, { def: TILESETS.exuberante, size: 96, getHeight: (x, z) => terrain.getHeight(x, z), waterLevel: 0.5, regions: rm, lava: lv });
      return data;
    };
    const cold = paintFull(null);
    const hot = paintFull(lava);
    let warmer = 0, changedFar = 0, checked = 0;
    for (let py = 0; py < N; py++) {
      for (let pxl = 0; pxl < N; pxl++) {
        const x = -48 + (pxl + 0.5) * (96 / N), z = -48 + (py + 0.5) * (96 / N);
        const o = (py * N + pxl) * 4;
        const d = lava.distAt(x, z);
        if (d > LAVA_STYLE.rimRadius + 0.5) {
          if (hot[o] !== cold[o] || hot[o + 1] !== cold[o + 1] || hot[o + 2] !== cold[o + 2]) changedFar++;
          checked++;
        } else if (d < 0.6 && (hot[o] - hot[o + 2]) > (cold[o] - cold[o + 2]) + 20) warmer++;
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(changedFar).toBe(0);
    expect(warmer).toBeGreaterThan(50); // o córrego e as margens ficaram quentes (vermelho >> azul)
  });

  it('um mapa SÓ com lavaGrid (sem biomeGrid) também ganha a borda quente (caminho antigo + lava)', () => {
    const map = makeRegionalMap({ id: 'splat-so-lava', withBiomes: false });
    const terrain = new Terrain(map);
    const lava = buildLavaInfo(map);
    const N = 96;
    const run = (lv) => {
      const data = new Uint8ClampedArray(N * N * 4);
      paintSplat(data, N, N, { def: TILESETS.vulcanico, size: 96, getHeight: (x, z) => terrain.getHeight(x, z), waterLevel: 0.5, lava: lv });
      return data;
    };
    expect(fnv(run(lava))).not.toBe(fnv(run(null)));
    expect(fnv(run(null))).toBe(fnv(run(undefined === 1 ? null : null))); // sem lava é estável
  });
});
