import { describe, it, expect, afterEach } from 'vitest';
import { TILESETS, TILESET_IDS } from '../../src/data/tilesets.js';
import { BIOME, MAX_BIOME_ID, encodeBiomeGrid, encodeRleBiomeGrid, paintedNodes } from '../../src/data/maps/biome.js';
import {
  BIOME_TO_STYLE, STYLE_VARIANTS, getStyleDef, styleKeyOfBiome, biomeHasStyle, regionalBaseDef, DECOR_RULES, decorCountFor
} from '../../src/data/biomeStyles.js';
import { getRegionMap, regionsEnabled, RegionMap } from '../../src/data/biomeRegions.js';
import { planDecorations, DECOR_CATEGORIES } from '../../src/data/decorPlan.js';
import { buildLavaInfo } from '../../src/data/lavaRender.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

/**
 * MUNDO-5 · lógica pura do render regional (sem GPU): bioma da célula → estilo → pesos de mistura (splat/água), plano de decoração.
 * Os mapas do jogo ainda não têm `biomeGrid`: os testes usam a fixture de `helpers/regionalMap.js` (mapa de 96 u montado no teste).
 */

const keyOf = (rm, x, z) => rm.styles[rm.styleAt(x, z)].key;
const weights = (rm, x, z, sharp = true) => { const w = new Float32Array(rm.styleCount); rm.weightsAt(x, z, w, sharp); return w; };
const wOf = (rm, w, key) => w[rm.styles.findIndex((s) => s.key === key)];

afterEach(() => { delete globalThis.location; });

describe('biomeStyles · bioma → estilo (tabela do §3.1)', () => {
  it('cobre os 13 biomas; mar e areia herdam, os demais mapeiam para um tileset ou variante existente e não legado', () => {
    expect(BIOME_TO_STYLE).toHaveLength(MAX_BIOME_ID + 1);
    expect(styleKeyOfBiome(BIOME.SEA)).toBeNull();
    expect(styleKeyOfBiome(BIOME.SAND)).toBeNull();
    expect(biomeHasStyle(BIOME.SEA)).toBe(false);
    expect(styleKeyOfBiome(99)).toBeNull();
    for (let id = 2; id <= MAX_BIOME_ID; id++) {
      const key = styleKeyOfBiome(id);
      expect(key, `bioma ${id}`).toBeTruthy();
      const def = getStyleDef(key);
      expect(def, key).toBeDefined();
      expect(def.legacy).toBe(false);
      for (const k of ['grass', 'dirt', 'sand', 'rock', 'snow', 'mud', 'road']) expect(def.palette[k], `${key}.${k}`).toBeDefined();
      expect(def.rules.rockSlope[1]).toBeGreaterThan(def.rules.rockSlope[0]);
      expect(def.surface.roughness).toBeGreaterThan(0);
      expect(def.water.color).toBeDefined();
      expect(def.decor).toBeDefined();
    }
  });

  it('segue a coluna "tileset" do §3.1', () => {
    expect(styleKeyOfBiome(BIOME.GRASS)).toBe('exuberante');
    expect(styleKeyOfBiome(BIOME.FOREST)).toBe('exuberante:floresta');
    expect(styleKeyOfBiome(BIOME.SAVANNA)).toBe('savana');
    expect(styleKeyOfBiome(BIOME.DESERT)).toBe('deserto');
    expect(styleKeyOfBiome(BIOME.STEPPE)).toBe('deserto:estepe');
    expect(styleKeyOfBiome(BIOME.ROCK)).toBe('pedregoso');
    expect(styleKeyOfBiome(BIOME.VOLCANIC)).toBe('vulcanico');
    expect(styleKeyOfBiome(BIOME.LAVA)).toBe('vulcanico'); // o chão sob o fluxo é basalto; a lava é o material de world/Lava.js
    expect(styleKeyOfBiome(BIOME.SNOW)).toBe('inverno');
    expect(styleKeyOfBiome(BIOME.ICE)).toBe('inverno:gelo');
    expect(styleKeyOfBiome(BIOME.SWAMP)).toBe('pantano');
  });

  it('variantes derivadas: mudam paleta/regras, não tocam o tileset de origem nem entram no registro de tilesets', () => {
    const steppe = STYLE_VARIANTS['deserto:estepe'];
    expect(steppe.baseId).toBe('deserto');
    expect(steppe.rules.base).toBe('grass');
    expect(TILESETS.deserto.rules.base).toBe('sand'); // origem intacta
    expect(steppe.palette.grass).not.toEqual(TILESETS.deserto.palette.grass);
    expect(steppe.water).toEqual(TILESETS.deserto.water);
    const forest = STYLE_VARIANTS['exuberante:floresta'];
    expect(forest.palette.grass[0]).toBeLessThan(TILESETS.exuberante.palette.grass[0]); // mais escura
    expect(forest.trees.tint.color).not.toBe(TILESETS.exuberante.trees.tint.color);
    expect(TILESET_IDS).toEqual(['verdejante', 'inverno', 'devastadas', 'pantano', 'exuberante', 'deserto', 'savana', 'vulcanico', 'pedregoso']);
    for (const key of Object.keys(STYLE_VARIANTS)) expect(TILESETS[key]).toBeUndefined();
  });

  it('tileset legado não vale como base regional (vira exuberante); os demais valem como são', () => {
    expect(regionalBaseDef(TILESETS.verdejante).id).toBe('exuberante');
    expect(regionalBaseDef(TILESETS.vulcanico)).toBe(TILESETS.vulcanico);
  });

  it('o verdejante legado continua byte-idêntico (não é tocado pelo render regional)', () => {
    const v = TILESETS.verdejante;
    expect(v.legacy).toBe(true);
    expect(v.palette.grass).toEqual([0x78d458, 0x66873c]);
    expect(v.trees.tint).toBeNull();
    expect(v.water.color).toBe(0x3cb0d8);
  });
});

describe('getRegionMap · quando existe e quando não', () => {
  it('mapa sem biomeGrid = null (caminho antigo); com biomeGrid = RegionMap memorizado', () => {
    const plain = makeRegionalMap({ withBiomes: false });
    expect(getRegionMap(plain)).toBeNull();
    const map = makeRegionalMap();
    const rm = getRegionMap(map);
    expect(rm).toBeInstanceOf(RegionMap);
    expect(getRegionMap(map)).toBe(rm); // mesma instância (terreno/água/decoração/árvores compartilham)
    expect(getRegionMap(map, 'vulcanico')).not.toBe(rm); // outro tileset base = outro mapa de regiões
    expect(getRegionMap(undefined)).toBeNull();
  });

  it('os mapas atuais do jogo (sem biomeGrid) não ganham regiões', async () => {
    const { listMaps } = await import('../../src/data/maps/index.js');
    for (const m of listMaps({ includeHidden: true })) expect(getRegionMap(m), m.id).toBeNull();
  });

  it('?regions=0 e ?tileset=<id> (tileset forçado) desligam o render regional', () => {
    const map = makeRegionalMap({ id: 'fixture-url' });
    expect(regionsEnabled('?regions=0')).toBe(false);
    expect(regionsEnabled('?skipPreload')).toBe(true);
    globalThis.location = { search: '?regions=0' };
    expect(getRegionMap(map)).toBeNull();
    globalThis.location = { search: '?tileset=inverno' };
    expect(getRegionMap(map)).toBeNull();
    globalThis.location = { search: '?texq=low' };
    expect(getRegionMap(map)).not.toBeNull();
  });

  it('biomeGrid inválido não derruba o jogo: devolve null', () => {
    const map = makeRegionalMap({ id: 'fixture-bad' });
    map.biomeGrid = { cell: 1, nodes: 50, data: encodeBiomeGrid(new Uint8Array(50 * 50)) }; // nós ≠ size
    expect(getRegionMap(map)).toBeNull();
    const map2 = makeRegionalMap({ id: 'fixture-bad2' });
    map2.biomeGrid = { cell: 1, nodes: paintedNodes(map2.size, 1), data: 'não-é-base64!@#' };
    expect(getRegionMap(map2)).toBeNull();
  });

  it('o estilo 0 é o tileset base; legado vira exuberante; estilos = os do mapa', () => {
    const rm = getRegionMap(makeRegionalMap({ id: 'fixture-styles' }));
    expect(rm.styles[0].key).toBe('exuberante');
    expect(rm.styles.map((s) => s.key).sort()).toEqual(
      ['deserto', 'deserto:estepe', 'exuberante', 'exuberante:floresta', 'inverno', 'pedregoso', 'vulcanico'].sort()
    );
    const legacy = getRegionMap(makeRegionalMap({ id: 'fixture-legacy', tileset: 'verdejante' }));
    expect(legacy.styles[0].key).toBe('exuberante');
    const volc = getRegionMap(makeRegionalMap({ id: 'fixture-volc', tileset: 'vulcanico' }));
    expect(volc.styles[0].key).toBe('vulcanico');
    expect(volc.styles.filter((s) => s.key === 'vulcanico')).toHaveLength(1); // VULCÂNICO e LAVA, e o base, são UM estilo só
  });
});

describe('célula → bioma → estilo → peso de splat', () => {
  const map = makeRegionalMap({ id: 'fixture-weights' });
  const rm = getRegionMap(map);

  it('biomeAt lê o biomeGrid (mesma regra de getBiomeAt) e styleAt dá o estilo da região', () => {
    const cases = [
      [-10, -5, BIOME.GRASS, 'exuberante'], [30, -2, BIOME.DESERT, 'deserto'], [10, -10, BIOME.STEPPE, 'deserto:estepe'],
      [-26, -20, BIOME.FOREST, 'exuberante:floresta'], [-36, -30, BIOME.SNOW, 'inverno'], [0, 23.5, BIOME.ROCK, 'pedregoso'],
      [0, 42, BIOME.SAND, null], [-40, 40, BIOME.SEA, null]
    ];
    for (const [x, z, biome, style] of cases) {
      expect(rm.biomeAt(x, z), `${x},${z}`).toBe(biome);
      if (style) expect(keyOf(rm, x, z), `${x},${z}`).toBe(style);
    }
    expect(rm.biomeAt(500, 0)).toBeNull(); // fora da grade
    expect(rm.biomeAt(-20, 20)).toBe(BIOME.SEA);
  });

  it('miolo de uma região = peso 1 do estilo dela; a soma dos pesos é sempre 1', () => {
    let w = weights(rm, -10, -5);
    expect(wOf(rm, w, 'exuberante')).toBeCloseTo(1, 5);
    w = weights(rm, 30, -2);
    expect(wOf(rm, w, 'deserto')).toBeCloseTo(1, 5);
    expect(rm.isInterior(30, -2)).toBe(true);
    for (let x = -46; x <= 46; x += 3.7) {
      for (let z = -46; z <= 46; z += 4.1) {
        const ws = weights(rm, x, z);
        const sum = Array.from(ws).reduce((a, b) => a + b, 0);
        expect(sum, `${x},${z}`).toBeCloseTo(1, 5);
        for (const v of ws) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1 + 1e-6); }
      }
    }
  });

  it('na fronteira grama × deserto (x = 0) os dois estilos se misturam; o peso muda monotonicamente de lado a lado', () => {
    const wd = [];
    for (let x = -6; x <= 6; x += 0.5) wd.push(wOf(rm, weights(rm, x, 2), 'deserto'));
    expect(wd[0]).toBeLessThan(0.05); // 6 u a oeste: grama pura
    expect(wd[wd.length - 1]).toBeGreaterThan(0.95); // 6 u a leste: deserto puro
    for (let i = 1; i < wd.length; i++) expect(wd[i]).toBeGreaterThanOrEqual(wd[i - 1] - 1e-6); // monotônico
    const mid = wOf(rm, weights(rm, -0.5, 2), 'deserto'); // a fronteira fica entre os nós x = -1 (grama) e x = 0 (deserto)
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(rm.isInterior(-0.5, 2)).toBe(false); // fronteira: precisa misturar
    // a mistura é uma faixa estreita (≈ 3–4 u), não um gradiente de metade do mapa
    expect(wOf(rm, weights(rm, -4, 2), 'deserto')).toBeLessThan(0.02);
    expect(wOf(rm, weights(rm, 4, 2), 'deserto')).toBeGreaterThan(0.98);
  });

  it('sharp afia a transição sem mudar de lado (mais perto de 0/1 que o bruto)', () => {
    const raw = wOf(rm, weights(rm, 1.2, 2, false), 'deserto');
    const sharp = wOf(rm, weights(rm, 1.2, 2, true), 'deserto');
    expect(raw).toBeGreaterThan(0.5);
    expect(sharp).toBeGreaterThanOrEqual(raw - 1e-6);
  });

  it('a praia (areia) e o mar perto da costa adotam o estilo da terra vizinha; longe dela, o tileset base', () => {
    // praia fora do retângulo, no lado do deserto: x = 20, z = 7 (SAND) → deserto
    expect(rm.biomeAt(20, 7)).toBe(BIOME.SAND);
    expect(keyOf(rm, 20, 7)).toBe('deserto');
    // praia da ilha vulcânica: (0, 17.5) → SAND da ilha, colada ao VULCÂNICO → vulcanico
    expect(keyOf(rm, 0, 17.5)).toBe('vulcanico');
    // mar aberto longe de tudo → base (exuberante)
    expect(keyOf(rm, -44, 44)).toBe('exuberante');
    expect(wOf(rm, weights(rm, -44, 44), 'exuberante')).toBeCloseTo(1, 5);
    // lago dentro do deserto (água): o estilo é o do deserto
    expect(rm.biomeAt(24, -14)).toBe(BIOME.SEA);
    expect(keyOf(rm, 24, -14)).toBe('deserto');
  });

  it('é determinístico e não depende de quantas vezes se consulta', () => {
    const a = weights(rm, 1.3, -7.7);
    const b = weights(rm, 1.3, -7.7);
    expect(Array.from(a)).toEqual(Array.from(b));
    const rm2 = new RegionMap(map, TILESETS.exuberante);
    expect(Array.from(weights(rm2, 1.3, -7.7))).toEqual(Array.from(a));
    expect(rm2.signature).toBe(rm.signature);
  });

  it('rugosidade média e áreas por estilo fazem sentido', () => {
    expect(rm.roughness).toBeGreaterThan(0.3);
    expect(rm.roughness).toBeLessThan(1);
    expect(rm.landArea).toBeGreaterThan(0);
    const total = rm.styles.reduce((s, st) => s + st.area, 0);
    expect(total).toBe(rm.landArea);
  });
});

describe('formatos do biomeGrid: célula de 2 u e RLE', () => {
  /** Mapa 96 u: oeste GRAMA, leste DESERTO; mar numa faixa de 8 u ao sul. `cell` 2 → 49 nós. */
  function halfHalf(cell, encode) {
    const size = 96, nodes = paintedNodes(size, cell);
    const bio = new Uint8Array(nodes * nodes);
    for (let j = 0; j < nodes; j++) for (let i = 0; i < nodes; i++) {
      const x = -48 + i * cell, z = -48 + j * cell;
      bio[j * nodes + i] = z > 40 ? BIOME.SEA : x < 0 ? BIOME.GRASS : BIOME.DESERT;
    }
    return { id: `fixture-cell${cell}-${encode}`, size, tileset: 'exuberante', biomeGrid: { cell, nodes, ...encode(bio) } };
  }
  const base64 = (bio) => ({ data: encodeBiomeGrid(bio) });
  const rle = (bio) => ({ encoding: 'rle', data: encodeRleBiomeGrid(bio) });

  for (const [label, enc] of [['base64', base64], ['RLE em pares', rle]]) {
    it(`cell = 2 em ${label}: biomeAt, estilo, fronteira em x ≈ 0 e mar ao sul`, () => {
      const rm = getRegionMap(halfHalf(2, enc));
      expect(rm.cell).toBe(2);
      expect(rm.nodes).toBe(49);
      expect(rm.biomeAt(-20, 0)).toBe(BIOME.GRASS);
      expect(rm.biomeAt(20, 0)).toBe(BIOME.DESERT);
      expect(rm.biomeAt(0, 44)).toBe(BIOME.SEA);
      expect(keyOf(rm, -20, 0)).toBe('exuberante');
      expect(keyOf(rm, 20, 0)).toBe('deserto');
      const w = (x) => wOf(rm, weights(rm, x, 0), 'deserto');
      expect(w(-10)).toBeLessThan(0.02);
      expect(w(10)).toBeGreaterThan(0.98);
      expect(w(-1)).toBeGreaterThan(0.2);
      expect(w(-1)).toBeLessThan(0.8);
      expect(rm.isInterior(0, 0)).toBe(false);
      expect(rm.isInterior(-30, 0)).toBe(true);
    });
  }

  it('o mesmo mapa em base64 e em RLE dá o mesmo RegionMap (assinatura e pesos)', () => {
    const a = getRegionMap(halfHalf(2, base64)), b = getRegionMap(halfHalf(2, rle));
    expect(a.signature).toBe(b.signature);
    expect(Array.from(weights(a, -0.7, 3.3))).toEqual(Array.from(weights(b, -0.7, 3.3)));
  });
});

describe('influência regional na água (campo largo)', () => {
  const rm = getRegionMap(makeRegionalMap({ id: 'fixture-water' }));
  const waterKey = (x, z) => rm.styles[rm.waterStyleAt(x, z)].key;

  it('o mar perto da ilha vulcânica é vulcânico, perto do deserto é deserto, longe de tudo é o base', () => {
    expect(waterKey(0, 46)).toBe('vulcanico'); // 3 u ao sul da praia da ilha
    expect(waterKey(35, 10)).toBe('deserto'); // 2 u ao sul da praia do deserto
    expect(waterKey(-44, 44)).toBe('exuberante');
    expect(waterKey(24, -14)).toBe('deserto'); // lago no deserto
  });

  it('a influência da costa decai com a distância: o peso do estilo base só cresce (transição suave, sem salto)', () => {
    const w = new Float32Array(rm.styleCount);
    let prev = -1, maxJump = 0;
    for (let x = 14; x <= 40; x += 1) { // ilha: costa em x = 13 (z = 30)
      rm.waterWeightsAt(x, 30, w);
      expect(w[0]).toBeGreaterThanOrEqual(prev - 1e-6);
      maxJump = Math.max(maxJump, w[0] - Math.max(prev, 0));
      prev = w[0];
    }
    rm.waterWeightsAt(14, 30, w);
    expect(w[0]).toBeLessThan(0.05); // colado à costa: só a ilha
    expect(prev).toBeGreaterThan(0.95); // 27 u adiante: de volta ao base
    expect(maxJump).toBeLessThan(0.45); // nenhum degrau de uma casa para a outra
  });
});

describe('plano de decoração por bioma (planDecorations)', () => {
  const map = makeRegionalMap({ id: 'fixture-decor' });
  const rm = getRegionMap(map);
  const terrain = new Terrain(map);
  const lava = buildLavaInfo(map);
  const plan = planDecorations({ regions: rm, getHeight: (x, z) => terrain.getHeight(x, z), mapDef: map, lava, waterLevel: 0.5 });

  it('é determinístico (mesmo mapa = mesmo plano) e devolve todas as categorias', () => {
    const again = planDecorations({ regions: rm, getHeight: (x, z) => terrain.getHeight(x, z), mapDef: map, lava, waterLevel: 0.5 });
    expect(again).toEqual(plan);
    expect(Object.keys(plan).sort()).toEqual([...DECOR_CATEGORIES].sort());
    for (const c of DECOR_CATEGORIES) expect(plan[c].length, c).toBeGreaterThan(0);
  });

  it('cada instância fica em terra do bioma permitido, na faixa de altura da categoria, fora de lava/bases/jazidas', () => {
    for (const cat of DECOR_CATEGORIES) {
      const rule = DECOR_RULES[cat];
      for (const it of plan[cat]) {
        const h = terrain.getHeight(it.x, it.z);
        if (rule.water) {
          expect(0.5 - h, `${cat} profundidade`).toBeGreaterThanOrEqual(rule.minDepth);
          expect(0.5 - h).toBeLessThanOrEqual(rule.maxDepth);
          expect(it.y).toBeGreaterThan(0.5);
        } else {
          const b = rm.biomeAt(it.x, it.z);
          expect(rule.weights[b] || 0, `${cat} em bioma ${b}`).toBeGreaterThan(0);
          expect(h).toBeGreaterThanOrEqual(rule.minH);
          expect(h).toBeLessThanOrEqual(rule.maxH);
        }
        expect(lava.distAt(it.x, it.z), `${cat} perto da lava`).toBeGreaterThanOrEqual(1.6);
        for (const s of map.startSlots) expect(Math.hypot(s.x - it.x, s.z - it.z)).toBeGreaterThanOrEqual(9);
        for (const r of map.resources) expect(Math.hypot(r.x - it.x, r.z - it.z)).toBeGreaterThanOrEqual(3.5);
        expect(rm.styleAt(it.x, it.z)).toBe(it.style);
      }
    }
  });

  it('respeita as flags do estilo da célula: flores só onde o estilo tem flores, cogumelos/tocos só onde tem cogumelos', () => {
    for (const it of plan.flowers) expect(rm.styles[it.style].def.decor.flowers).toBe(true);
    for (const it of plan.stumps) expect(rm.styles[it.style].def.decor.mushrooms).toBe(true);
    for (const it of plan.lilies) expect(rm.styles[it.style].def.decor.lilies).toBe(true);
    // deserto puro (sem flores no tileset): nenhuma flor em célula de DESERTO
    expect(plan.flowers.some((it) => rm.biomeAt(it.x, it.z) === BIOME.DESERT)).toBe(false);
    // neve/vulcânico não têm grama de verdade: nada de tufos de grama em lava/rocha/vulcânico
    expect(plan.grass.some((it) => [BIOME.VOLCANIC, BIOME.ROCK, BIOME.LAVA, BIOME.SAND, BIOME.SEA].includes(rm.biomeAt(it.x, it.z)))).toBe(false);
  });

  it('pedras e seixos vão onde há rocha/areia/deserto; vitórias-régias só no lago', () => {
    expect(plan.boulders.some((it) => [BIOME.ROCK, BIOME.DESERT, BIOME.STEPPE, BIOME.VOLCANIC, BIOME.GRASS, BIOME.FOREST, BIOME.SNOW].includes(rm.biomeAt(it.x, it.z)))).toBe(true);
    for (const it of plan.lilies) {
      expect(Math.hypot(it.x - 24, it.z + 14)).toBeLessThanOrEqual(5.7); // lago (r = 5)
    }
  });

  it('a contagem cresce com a área do mapa, nunca abaixo da antiga', () => {
    for (const cat of DECOR_CATEGORIES) {
      expect(decorCountFor(cat, 140)).toBe(DECOR_RULES[cat].legacyCount);
      expect(decorCountFor(cat, 192)).toBeGreaterThan(DECOR_RULES[cat].legacyCount);
      expect(decorCountFor(cat, 96)).toBe(DECOR_RULES[cat].legacyCount);
    }
    expect(decorCountFor('inexistente', 192)).toBe(0);
  });
});
