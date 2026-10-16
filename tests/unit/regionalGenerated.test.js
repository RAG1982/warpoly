import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { glbTemplates } from '../../src/entities/glbModels.js';
import { generateIrregularCoast, bakeToMapDef } from '../../tools/lib/irregularCoast.mjs';
import { paintedNodes } from '../../src/data/maps/painted.js';
import { BIOME, encodeBiomeGrid } from '../../src/data/maps/biome.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { getRegionMap } from '../../src/data/biomeRegions.js';
import { buildLavaInfo } from '../../src/data/lavaRender.js';
import { DECOR_CATEGORIES } from '../../src/data/decorPlan.js';
import { Terrain } from '../../src/sim/Terrain.js';

// As texturas procedurais são pintadas em <canvas> (inexistente no Node): mapas vazios bastam.
vi.mock('../../src/models/environment/waterTextures.js', () => ({
  getWaterSurfaceTextures: () => ({ map: null, roughnessMap: null, bumpMap: null }),
  getCattailLotusTextures: () => ({
    cattailStemMap: null, cattailHeadMap: null, cattailHeadRoughness: null, lotusLeafMap: null, lotusPetalMap: null
  })
}));
const empty = () => ({ map: null, roughnessMap: null, bumpMap: null });
vi.mock('../../src/models/environment/rockTextures.js', () => ({ getGraniteBoulderTextures: empty, getRiverPebbleTextures: empty }));
vi.mock('../../src/models/environment/floraTextures.js', () => ({
  getFlowerTextures: empty, getFlowerCenterTextures: empty, getBerryBushTextures: empty, getBerryTextures: empty,
  getGrassBladeTextures: empty, getMushroomTextures: empty, getStumpBarkTextures: empty, getWaterLilyTextures: empty, getLotusTextures: empty
}));
const { TerrainView } = await import('../../src/render/TerrainView.js');
const { Water } = await import('../../src/world/Water.js');
const { Decorations } = await import('../../src/world/Decorations.js');
const { TreeManager } = await import('../../src/world/TreeManager.js');

/**
 * MUNDO-5 · o pipeline regional num mapa de forma real: o gerador de costa irregular (`tools/lib/irregularCoast.mjs`, 2 continentes —
 * exuberante a oeste, árido a leste — e 6 ilhas, uma vulcânica com córregos de lava) assado em `painted` + `lavaGrid` e com um
 * `biomeGrid` derivado dos biomas do próprio gerador. Sem GPU: só confere que tudo monta, com números plausíveis.
 */

/** Mapa assado (192 u, cell 1) + `biomeGrid` reamostrado dos biomas do gerador (grade 256² → 193² nós). */
function generatedRegionalMap(seed) {
  const coast = generateIrregularCoast({ seed, size: 192, islands: 6, lava: true });
  const mapDef = bakeToMapDef(coast, { id: `gen-regional-${seed}`, name: 'Gerado', tileset: 'exuberante', playable: 180 });
  const G = coast.grid, size = coast.size, nodes = paintedNodes(size, 1);
  const bio = new Uint8Array(nodes * nodes);
  for (let j = 0; j < nodes; j++) {
    for (let i = 0; i < nodes; i++) {
      const gi = Math.min(G - 1, Math.floor((i / size) * G));
      const gj = Math.min(G - 1, Math.floor((j / size) * G));
      bio[j * nodes + i] = coast.biome[gj * G + gi];
    }
  }
  mapDef.biomeGrid = { cell: 1, nodes, data: encodeBiomeGrid(bio) };
  return { mapDef, coast, bio };
}

describe('render regional num mapa gerado (costa irregular + lava + biomas do gerador)', () => {
  let saved;
  beforeEach(() => { saved = new Map(glbTemplates); glbTemplates.clear(); });
  afterEach(() => { glbTemplates.clear(); for (const [k, v] of saved) glbTemplates.set(k, v); });

  const { mapDef, bio } = generatedRegionalMap(1);

  it('o mapa é válido (biomeGrid e lavaGrid passam no validateMapDef) e tem lava e vários biomas', () => {
    const res = validateMapDef(mapDef, { checkId: false, connectivity: false });
    expect(res.errors.filter((e) => ['biomeData', 'lavaData', 'terrainData'].includes(e.code))).toEqual([]);
    const ids = new Set(bio);
    for (const b of [BIOME.SEA, BIOME.GRASS, BIOME.DESERT, BIOME.VOLCANIC, BIOME.LAVA]) expect(ids.has(b), `bioma ${b}`).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(8);
    expect(buildLavaInfo(mapDef).count).toBeGreaterThan(30);
  });

  it('RegionMap: vários estilos, o continente oeste é exuberante e o leste é árido, a ilha vulcânica é vulcânica', () => {
    const rm = getRegionMap(mapDef);
    expect(rm.styleCount).toBeGreaterThanOrEqual(5);
    expect(rm.styleCount).toBeLessThanOrEqual(12);
    const keys = new Set(rm.styles.map((s) => s.key));
    for (const k of ['exuberante', 'deserto', 'vulcanico']) expect(keys.has(k), k).toBe(true);
    // contagem de células de terra por estilo: o oeste (x < 0) tem mais exuberante que deserto; o leste, o contrário
    const count = { west: {}, east: {} };
    const n = rm.nodes;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (bio[j * n + i] === BIOME.SEA) continue;
        const key = rm.styles[rm.dominant[j * n + i]].key;
        const side = i < n / 2 ? 'west' : 'east';
        count[side][key] = (count[side][key] || 0) + 1;
      }
    }
    expect(count.west.exuberante || 0).toBeGreaterThan(count.west.deserto || 0);
    expect(count.east.deserto || 0).toBeGreaterThan(count.east.exuberante || 0);
    // todas as células de lava têm bioma vulcânico (chão sob o fluxo)
    const lava = buildLavaInfo(mapDef);
    let lavaCells = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (lava.data[j * n + i] === 1) { lavaCells++; expect(rm.styles[rm.dominant[j * n + i]].key).toBe('vulcanico'); }
    expect(lavaCells).toBe(lava.count);
  });

  it('TerrainView, Water, Decorations e TreeManager montam sem erro, com a lava, as cores de água por região e a decoração por bioma', () => {
    const t0 = performance.now();
    const terrain = new Terrain(mapDef);
    const scene = new THREE.Scene();
    const view = new TerrainView(scene, terrain);
    const water = new Water(scene, terrain);
    const decor = new Decorations(scene, terrain);
    const rm = getRegionMap(mapDef, view.tileset);
    expect(view.regions).toBe(rm);
    expect(water.regions).toBe(rm);
    expect(decor.regions).toBe(rm);
    // lava
    expect(water.lava).toBeTruthy();
    const lavaMesh = scene.getObjectByName('LavaSurface');
    expect(lavaMesh).toBe(water.lava.mesh);
    const b = water.lava.info.bounds;
    expect(b.minX).toBeGreaterThanOrEqual(-96);
    expect(b.maxX).toBeLessThanOrEqual(96);
    // água: cores de vértice variam com a região (pelo menos 3 tons bem distintos entre o mar do oeste, o do leste e o da ilha vulcânica)
    const col = water.mesh.geometry.attributes.color;
    const tones = new Set();
    for (let i = 0; i < col.count; i++) tones.add(`${(col.getX(i) * 8) | 0},${(col.getY(i) * 8) | 0},${(col.getZ(i) * 8) | 0}`);
    expect(tones.size).toBeGreaterThanOrEqual(3);
    // decoração: toda categoria tem instâncias e nenhuma cai na lava
    for (const cat of DECOR_CATEGORIES) expect(decor.plan[cat].length, cat).toBeGreaterThan(0);
    for (const cat of DECOR_CATEGORIES) for (const it of decor.plan[cat]) expect(terrain.isLava(it.x, it.z), cat).toBe(false);
    // árvores nas florestas do mapa: cada uma pega a tinta da região dela
    const tm = new TreeManager(scene, { tileset: view.tileset.id, regions: rm });
    let planted = 0;
    for (const f of mapDef.forests) {
      for (let k = 0; k < 6; k++) {
        const x = f.x + (k - 3) * 1.5, z = f.z + ((k * 7) % 5 - 2) * 1.5;
        if (terrain.getHeight(x, z) < 1.8) continue;
        tm.registerTree({}, x, terrain.getHeight(x, z), z, 0, 1, f.species || 'oak');
        planted++;
      }
    }
    expect(planted).toBeGreaterThan(0);
    tm.dispose();
    expect(performance.now() - t0).toBeLessThan(15000);
  });

  it('orçamento de draw calls das árvores: espalhadas por TODA a terra (≈ 600, 4 tipos, 10 estilos) o regional tem as mesmas malhas que o caminho antigo', () => {
    const terrain = new Terrain(mapDef);
    const rm = getRegionMap(mapDef);
    const plain = new TreeManager(new THREE.Scene(), { tileset: 'exuberante' });
    const regional = new TreeManager(new THREE.Scene(), { tileset: 'exuberante', regions: rm });
    const types = ['oak', 'pine', 'autumn', 'birch'];
    let n = 0;
    for (let x = -90; x <= 90; x += 4) {
      for (let z = -90; z <= 90; z += 4) {
        const h = terrain.getHeight(x, z);
        if (h < 1.8 || terrain.isLava(x, z)) continue;
        const type = types[n++ % 4];
        plain.registerTree({}, x, h, z, 0, 1, type);
        regional.registerTree({}, x, h, z, 0, 1, type);
      }
    }
    expect(n).toBeGreaterThan(400);
    expect(regional.instancedMeshes.length).toBe(plain.instancedMeshes.length); // ZERO malhas extras (a classe de tinta vai por instância)
    expect(regional._regionalMats.size).toBe(types.length); // um material regional por tipo de árvore, não por região
    const classes = new Set();
    for (const im of regional.instancedMeshes) for (let i = 0; i < im.count; i++) classes.add(Math.round(im.instanceColor.array[i * 3] * 255));
    expect(classes.size).toBeGreaterThanOrEqual(4); // e a tinta varia pelo mapa
    plain.dispose(); regional.dispose();
  });

  it('o terreno e a água regionais NÃO mudam o resultado do mesmo mapa sem o biomeGrid onde a região é a do tileset base', () => {
    const plain = { ...mapDef, id: 'gen-regional-plain' };
    delete plain.biomeGrid;
    const regional = new TerrainView(new THREE.Scene(), new Terrain(mapDef));
    const old = new TerrainView(new THREE.Scene(), new Terrain(plain));
    expect(old.regions).toBeNull();
    expect(regional.regions).toBeTruthy();
    // mesma malha (posições e UV idênticas); só mudam as cores onde a região difere do base
    expect(Array.from(regional.mesh.geometry.attributes.position.array)).toEqual(Array.from(old.mesh.geometry.attributes.position.array));
    expect(regional.mesh.geometry.attributes.color.count).toBe(old.mesh.geometry.attributes.color.count);
    // a lava continua desenhada nos dois (vem do lavaGrid, não do biomeGrid)
    const wOld = new Water(new THREE.Scene(), new Terrain(plain));
    expect(wOld.lava).toBeTruthy();
    expect(wOld.regions).toBeNull();
  });

  it('é estável entre sementes (1–4): monta e tem lava em cada uma', () => {
    for (const seed of [2, 3, 4]) {
      const { mapDef: m } = generatedRegionalMap(seed);
      const rm = getRegionMap(m);
      expect(rm, `seed ${seed}`).toBeTruthy();
      expect(rm.styleCount).toBeGreaterThanOrEqual(4);
      const scene = new THREE.Scene();
      const terrain = new Terrain(m);
      const water = new Water(scene, terrain);
      expect(water.lava, `seed ${seed}`).toBeTruthy();
      water.update(1.5);
      expect(water.lava.pulse).toBeGreaterThanOrEqual(1.2);
    }
  });
});
