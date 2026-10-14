import { describe, it, expect } from 'vitest';
import {
  TILESETS,
  TILESET_IDS,
  DEFAULT_TILESET,
  resolveTilesetId,
  getTileset,
  splatWeights
} from '../../src/data/tilesets.js';
import {
  BIOME,
  BIOME_IDS,
  BIOME_NAMES,
  MAX_BIOME_ID,
  encodeBiomeGrid,
  decodeBiomeGrid,
  encodeRleBiomeGrid,
  decodeRleBiomeGrid,
  getBiomeAt,
  validateBiomeGrid,
  paintedNodes
} from '../../src/data/maps/biome.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { listMaps, getMap } from '../../src/data/maps/index.js';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';

describe('Novo Mundo: Tilesets e Biomas (MUNDO-TERRENO-MAPAS §3.1, §3.3 e §7 Passo 4)', () => {
  const NEW_BIOMES = ['exuberante', 'deserto', 'savana', 'vulcanico', 'pedregoso'];
  const LEGACY_BIOMES = ['verdejante', 'inverno', 'devastadas', 'pantano'];

  describe('1. Existência e completude dos novos biomas', () => {
    it('contém todos os 5 novos biomas além dos já existentes', () => {
      for (const id of NEW_BIOMES) {
        expect(TILESETS[id]).toBeDefined();
        expect(TILESET_IDS).toContain(id);
        expect(getTileset(id)).toBe(TILESETS[id]);
      }
      expect(BIOME_IDS.LAVA).toBe(8);
      expect(BIOME_NAMES.length).toBe(13);
      expect(decodeBiomeGrid(encodeBiomeGrid(new Uint8Array([BIOME.GRASS])))[0]).toBe(BIOME.GRASS);
    });

    it('cada novo bioma possui paleta de cores completa', () => {
      const requiredKeys = ['grass', 'dirt', 'sand', 'rock', 'snow', 'mud', 'road'];
      for (const id of NEW_BIOMES) {
        const b = TILESETS[id];
        expect(b.palette).toBeDefined();
        for (const k of requiredKeys) {
          expect(b.palette[k]).toBeDefined();
          if (k === 'grass') {
            expect(Array.isArray(b.palette[k])).toBe(true);
            expect(b.palette[k].length).toBe(2);
            expect(typeof b.palette[k][0]).toBe('number');
            expect(typeof b.palette[k][1]).toBe('number');
          } else {
            expect(typeof b.palette[k]).toBe('number');
          }
        }
      }
    });

    it('cada novo bioma possui configurações de textura procedural válidas (rules e surface)', () => {
      for (const id of NEW_BIOMES) {
        const b = TILESETS[id];
        expect(b.legacy).toBe(false);

        // Rules
        expect(b.rules).toBeDefined();
        expect(typeof b.rules.base).toBe('string');
        expect(typeof b.rules.patch).toBe('string');
        expect(typeof b.rules.high).toBe('string');
        expect(typeof b.rules.shore).toBe('string');
        expect(b.rules.patchAmount).toBeGreaterThan(0);
        expect(b.rules.patchAmount).toBeLessThanOrEqual(1);
        expect(b.rules.shoreTop).toBeGreaterThan(0);
        expect(b.rules.highStart).toBeGreaterThan(0);
        expect(Array.isArray(b.rules.rockSlope)).toBe(true);
        expect(b.rules.rockSlope[1]).toBeGreaterThan(b.rules.rockSlope[0]);

        // Surface
        expect(b.surface).toBeDefined();
        expect(b.surface.roughness).toBeGreaterThan(0);
        expect(typeof b.surface.cliff).toBe('number');
        expect(b.surface.strata).toBeGreaterThanOrEqual(0);

        // Splat weights computation succeeds and sums to 1
        const weights = splatWeights(b.rules, 2.5, 0.2, 0.5);
        const sum = Object.values(weights).reduce((acc, v) => acc + v, 0);
        expect(sum).toBeCloseTo(1, 6);
      }
    });

    it('cada novo bioma possui tint de árvores (trees.tint) configurado', () => {
      for (const id of NEW_BIOMES) {
        const b = TILESETS[id];
        expect(b.trees).toBeDefined();
        expect(b.trees.tint).toBeDefined();
        expect(typeof b.trees.tint.color).toBe('number');
        expect(b.trees.tint.desat).toBeGreaterThanOrEqual(0);
        expect(b.trees.tint.desat).toBeLessThanOrEqual(1);
        expect(typeof b.trees.tint.snowAmount).toBe('number');
      }
    });

    it('cada novo bioma possui iluminação e atmosfera completas (fog, ambient, sun)', () => {
      for (const id of NEW_BIOMES) {
        const b = TILESETS[id];
        expect(b.atmosphere).toBeDefined();
        expect(typeof b.atmosphere.sky).toBe('number');
        expect(b.atmosphere.fogFar).toBeGreaterThan(b.atmosphere.fogNear);
        expect(typeof b.atmosphere.hemiSky).toBe('number');
        expect(typeof b.atmosphere.hemiGround).toBe('number');

        // Fog
        expect(b.atmosphere.fog).toBeDefined();
        expect(b.fog).toBeDefined();
        expect(typeof b.fog.color).toBe('number');
        expect(b.fog.far).toBeGreaterThan(b.fog.near);

        // Ambient
        expect(b.atmosphere.ambient).toBeDefined();
        expect(b.ambient).toBeDefined();
        expect(typeof b.ambient.sky).toBe('number');
        expect(typeof b.ambient.ground).toBe('number');

        // Sun
        expect(b.atmosphere.sun).toBeDefined();
        expect(b.sun).toBeDefined();
        expect(typeof b.sun.color).toBe('number');
        expect(b.sun.intensity).toBeGreaterThan(0);

        // Post-processing color grade & water
        expect(b.grade).toBeDefined();
        expect(b.water).toBeDefined();
        expect(typeof b.water.color).toBe('number');
        expect(typeof b.water.deep).toBe('number');
      }
    });
  });

  describe('2. Validação de mapas com e sem biomeGrid', () => {
    function createBaseMap(extra = {}) {
      const base = JSON.parse(JSON.stringify(getMap('continental-1v1')));
      return {
        ...base,
        id: 'teste-biome-map',
        tileset: 'exuberante',
        ...extra
      };
    }

    it('valida com sucesso mapas sem biomeGrid (retrocompatibilidade)', () => {
      const map = createBaseMap();
      const res = validateMapDef(map, { checkId: false, connectivity: false });
      expect(res.ok).toBe(true);
      expect(res.errors).toEqual([]);
    });

    it('valida com sucesso mapas com biomeGrid válido em base64', () => {
      const map = createBaseMap();
      const size = map.size;
      const cell = 1;
      const nodes = paintedNodes(size, cell);
      const total = nodes * nodes;
      const data = new Uint8Array(total);
      data.fill(BIOME.GRASS);
      for (let i = 0; i < Math.floor(total / 2); i++) data[i] = BIOME.DESERT;

      map.biomeGrid = {
        cell,
        nodes,
        data: encodeBiomeGrid(data)
      };

      const res = validateMapDef(map, { checkId: false, connectivity: false });
      expect(res.ok).toBe(true);
      expect(res.errors).toEqual([]);

      // getBiomeAt sample check
      const sampleBiome = getBiomeAt(map, 0, 0);
      expect(typeof sampleBiome).toBe('number');
      expect(sampleBiome).toBeGreaterThanOrEqual(0);
      expect(sampleBiome).toBeLessThanOrEqual(MAX_BIOME_ID);
    });

    it('valida com sucesso mapas com biomeGrid em formato RLE (pares e plano)', () => {
      const map = createBaseMap();
      const size = map.size;
      const cell = 1;
      const nodes = paintedNodes(size, cell);
      const total = nodes * nodes;

      const u8 = new Uint8Array(total);
      u8.fill(BIOME.SAVANNA, 0, 500);
      u8.fill(BIOME.VOLCANIC, 500, 1000);
      u8.fill(BIOME.GRASS, 1000, total);

      // 1. RLE em pares [[count, val], ...]
      const rlePairs = encodeRleBiomeGrid(u8, { flat: false });
      const decodedPairs = decodeRleBiomeGrid(rlePairs);
      expect(decodedPairs.length).toBe(total);
      expect(decodedPairs[0]).toBe(BIOME.SAVANNA);
      expect(decodedPairs[600]).toBe(BIOME.VOLCANIC);
      expect(decodedPairs[1200]).toBe(BIOME.GRASS);

      const mapPairs = createBaseMap({
        biomeGrid: {
          cell,
          nodes,
          encoding: 'rle',
          data: rlePairs
        }
      });
      const resPairs = validateMapDef(mapPairs, { checkId: false, connectivity: false });
      expect(resPairs.ok).toBe(true);

      // 2. RLE plano [count, val, count, val]
      const rleFlat = encodeRleBiomeGrid(u8, { flat: true });
      const decodedFlat = decodeRleBiomeGrid(rleFlat);
      expect(decodedFlat.length).toBe(total);

      const mapFlat = createBaseMap({
        biomeGrid: {
          cell,
          nodes,
          encoding: 'rle',
          data: rleFlat
        }
      });
      const resFlat = validateMapDef(mapFlat, { checkId: false, connectivity: false });
      expect(resFlat.ok).toBe(true);
    });

    it('rejeita biomeGrid com contagem de nós divergente do tamanho do mapa', () => {
      const map = createBaseMap({
        biomeGrid: {
          cell: 1,
          nodes: 50, // errado para size do mapa
          data: encodeBiomeGrid(new Uint8Array(50 * 50))
        }
      });
      const res = validateMapDef(map, { checkId: false, connectivity: false });
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === 'biomeData')).toBe(true);
    });

    it('rejeita biomeGrid com dados truncados ou inválidos', () => {
      const map = createBaseMap();
      const nodes = paintedNodes(map.size, 1);
      map.biomeGrid = {
        cell: 1,
        nodes,
        data: 'base64_invalido_corrompido!@#'
      };
      const res = validateMapDef(map, { checkId: false, connectivity: false });
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === 'biomeData')).toBe(true);
    });

    it('rejeita biomeGrid com IDs de bioma fora do intervalo permitido (0..12)', () => {
      const map = createBaseMap();
      const nodes = paintedNodes(map.size, 1);
      const data = new Uint8Array(nodes * nodes);
      data[42] = 99; // ID inválido
      map.biomeGrid = {
        cell: 1,
        nodes,
        data: encodeBiomeGrid(data)
      };
      const res = validateMapDef(map, { checkId: false, connectivity: false });
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === 'biomeData')).toBe(true);
    });

    it('rejeita base (startSlot) ou recurso sobre célula de lava (ID 8) no biomeGrid', () => {
      const map = createBaseMap();
      const size = map.size;
      const cell = 1;
      const nodes = paintedNodes(size, cell);
      const data = new Uint8Array(nodes * nodes);
      data.fill(BIOME.GRASS);

      const s0 = map.startSlots[0];
      const half = size / 2;
      const c = Math.min(nodes - 1, Math.max(0, Math.round((s0.x + half) / cell)));
      const r = Math.min(nodes - 1, Math.max(0, Math.round((s0.z + half) / cell)));
      data[r * nodes + c] = BIOME.LAVA;

      map.biomeGrid = {
        cell,
        nodes,
        data: encodeBiomeGrid(data)
      };

      const res = validateMapDef(map, { checkId: false, connectivity: false });
      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.code === 'slotLava')).toBe(true);
    });

    it('validador direto validateBiomeGrid opera corretamente', () => {
      const valid = { cell: 1, nodes: 97, data: encodeBiomeGrid(new Uint8Array(97 * 97)) };
      expect(validateBiomeGrid(valid, 96).ok).toBe(true);

      const invalidNodes = { cell: 1, nodes: 90, data: encodeBiomeGrid(new Uint8Array(90 * 90)) };
      expect(validateBiomeGrid(invalidNodes, 96).ok).toBe(false);

      const invalidCell = { cell: -1, nodes: 97, data: '' };
      expect(validateBiomeGrid(invalidCell, 96).ok).toBe(false);
    });
  });

  describe('3. Preservação estrita dos tilesets legados', () => {
    it('o tileset padrão continua sendo verdejante', () => {
      expect(DEFAULT_TILESET).toBe('verdejante');
    });

    it('verdejante preserva a flag legacy: true e trees.tint: null', () => {
      const v = TILESETS.verdejante;
      expect(v.legacy).toBe(true);
      expect(v.trees.tint).toBeNull();
      expect(v.id).toBe('verdejante');
      expect(v.palette.grass).toEqual([0x78d458, 0x66873c]);
      expect(v.palette.dirt).toBe(0x855533);
      expect(v.palette.sand).toBe(0xe4ce95);
    });

    it('resolveTilesetId preserva aliases legados e fallback para verdejante', () => {
      expect(resolveTilesetId('ilhas')).toBe('verdejante');
      expect(resolveTilesetId('floresta')).toBe('verdejante');
      expect(resolveTilesetId(undefined)).toBe('verdejante');
      expect(resolveTilesetId(null)).toBe('verdejante');
      expect(resolveTilesetId('tileset_inexistente')).toBe('verdejante');

      // Novos biomas e aliases
      for (const id of NEW_BIOMES) {
        expect(resolveTilesetId(id)).toBe(id);
      }
      expect(resolveTilesetId('desert')).toBe('deserto');
      expect(resolveTilesetId('lush')).toBe('exuberante');
      expect(resolveTilesetId('savanna')).toBe('savana');
      expect(resolveTilesetId('volcanic')).toBe('vulcanico');
      expect(resolveTilesetId('rocky')).toBe('pedregoso');
    });

    it('todos os mapas legados registrados continuam passando na validação sem erros', () => {
      const maps = listMaps({ includeHidden: true });
      expect(maps.length).toBeGreaterThan(0);
      for (const m of maps) {
        const res = validateMapDef(m, { checkId: false, connectivity: false });
        expect(res.ok).toBe(true);
        expect(res.errors).toEqual([]);
      }
    });
  });

  describe('4. Internacionalização (i18n)', () => {
    it('todas as chaves biome.<id> existem em pt-BR e en', () => {
      const allBiomes = [...LEGACY_BIOMES, ...NEW_BIOMES];
      for (const id of allBiomes) {
        const key = `biome.${id}`;
        expect(ptBR[key]).toBeDefined();
        expect(typeof ptBR[key]).toBe('string');
        expect(ptBR[key].length).toBeGreaterThan(0);

        expect(en[key]).toBeDefined();
        expect(typeof en[key]).toBe('string');
        expect(en[key].length).toBeGreaterThan(0);
      }
    });

    it('traduções em inglês não utilizam nomes próprios ou marcas restritas da Blizzard', () => {
      const blizzardRestrictedWords = [
        'warcraft', 'azeroth', 'lordaeron', 'barrens', 'durotar',
        'ashenvale', 'mulgore', 'northrend', 'kalimdor', 'scourge',
        'stratholme', 'hillsbrad', 'dalaran', 'tirisfal'
      ];
      for (const [key, val] of Object.entries(en)) {
        if (key.startsWith('biome.')) {
          const lower = val.toLowerCase();
          for (const restricted of blizzardRestrictedWords) {
            expect(lower).not.toContain(restricted);
          }
        }
      }
    });
  });
});
