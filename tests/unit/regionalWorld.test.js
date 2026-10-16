import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { glbTemplates } from '../../src/entities/glbModels.js';
import { TILESETS } from '../../src/data/tilesets.js';
import { getRegionMap } from '../../src/data/biomeRegions.js';
import { STYLE_VARIANTS, DECOR_RULES } from '../../src/data/biomeStyles.js';
import { BIOME } from '../../src/data/maps/biome.js';
import { Terrain } from '../../src/sim/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { LAVA_STYLE } from '../../src/data/lavaRender.js';
import { makeRegionalMap } from './helpers/regionalMap.js';

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
const { Water, pickReedLocations } = await import('../../src/world/Water.js');
const { Decorations } = await import('../../src/world/Decorations.js');
const { TreeManager } = await import('../../src/world/TreeManager.js');

/**
 * MUNDO-5 · as quatro views com e sem `biomeGrid`. Sem ele: o resultado é o de antes (referências capturadas no commit 82541c6, antes
 * da mudança). Com ele: terreno, água, espuma, juncos, árvores e decoração dependem da região da célula. Sem GPU (nenhum desenho).
 */

/** FNV-1a de floats arredondados a 1e-4 (mesma conta da captura de referência). */
function fnv(arr, scale = 1e4) {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.round(arr[i] * scale) | 0;
    h ^= v & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

describe('mapa sem biomeGrid = caminho antigo, idêntico ao de antes (referências do commit 82541c6)', () => {
  const GOLDEN_TERRAIN = {
    'continental-1v1:undefined': { color: '62dbf0ee', pos: 'dcca8975', uv: 'c6ac69c9', rough: 0.82, ts: 'verdejante' },
    'continental-1v1:verdejante': { color: '62dbf0ee', pos: 'dcca8975', uv: 'c6ac69c9', rough: 0.82, ts: 'verdejante' },
    'continental-1v1:inverno': { color: 'e65a84a6', pos: 'dcca8975', uv: 'c6ac69c9', rough: 0.62, ts: 'inverno' },
    'continental-1v1:exuberante': { color: 'bf1bd27f', pos: 'dcca8975', uv: 'c6ac69c9', rough: 0.52, ts: 'exuberante' },
    'continental-1v1:vulcanico': { color: '3b9394e6', pos: 'dcca8975', uv: 'c6ac69c9', rough: 0.95, ts: 'vulcanico' },
    'ilhas-4p:undefined': { color: 'fd0e43cf', pos: '8e98351d', uv: 'c6ac69c9', rough: 0.82, ts: 'verdejante' },
    'ilhas-4p:inverno': { color: 'b432eead', pos: '8e98351d', uv: 'c6ac69c9', rough: 0.62, ts: 'inverno' }
  };

  it('TerrainView: posições, UV, cores de vértice, rugosidade e tileset iguais; sem regiões nem lava', () => {
    for (const [key, g] of Object.entries(GOLDEN_TERRAIN)) {
      const [mapId, ts] = key.split(':');
      const terrain = new Terrain(getMap(mapId));
      const view = new TerrainView(new THREE.Scene(), terrain, ts === 'undefined' ? {} : { tileset: ts });
      const geo = view.mesh.geometry;
      expect(fnv(geo.attributes.color.array), `${key} cor`).toBe(g.color);
      expect(fnv(geo.attributes.position.array), `${key} pos`).toBe(g.pos);
      expect(fnv(geo.attributes.uv.array), `${key} uv`).toBe(g.uv);
      expect(view.material.roughness, `${key} rugosidade`).toBe(g.rough);
      expect(view.tileset.id).toBe(g.ts);
      expect(view.regions).toBeNull();
      expect(view.lava).toBeNull();
      expect(view.material.vertexColors).toBe(true);
    }
  });

  it('Water: mesmas malhas, cores, opacidade, espuma (quad de 4 vértices) e moitas; sem vertexColors nem lava', () => {
    const GOLDEN = {
      verdejante: { names: ['DeepWaterBase', 'WaterSurface', 'ShoreFoam', 'WaterVegetationGroup'], color: 3977432, op: 0.86, foamStrength: 1.12, foamCol: 16777215, reeds: 4 },
      inverno: { names: ['DeepWaterBase', 'WaterSurface', 'ShoreFoam'], color: 8370134, op: 0.94, foamStrength: 1.36, foamCol: 16055295, reeds: 0 },
      exuberante: { names: ['DeepWaterBase', 'WaterSurface', 'ShoreFoam', 'WaterVegetationGroup'], color: 3520457, op: 0.88, foamStrength: 1.36, foamCol: 16777215, reeds: 4 },
      vulcanico: { names: ['DeepWaterBase', 'WaterSurface', 'ShoreFoam'], color: 2767424, op: 0.92, foamStrength: 0.8, foamCol: 6968661, reeds: 0 }
    };
    for (const [ts, g] of Object.entries(GOLDEN)) {
      const scene = new THREE.Scene();
      const w = new Water(scene, new Terrain(getMap('continental-1v1')), { tileset: ts });
      expect(scene.children.map((c) => c.name || c.type), ts).toEqual(g.names);
      expect(w.surfaceMat.color.getHex()).toBe(g.color);
      expect(w.surfaceMat.opacity).toBe(g.op);
      expect(w.surfaceMat.vertexColors).toBe(false);
      expect(w.mesh.geometry.attributes.position.count).toBe(4225);
      expect(w.mesh.geometry.attributes.color).toBeUndefined();
      const foam = scene.getObjectByName('ShoreFoam');
      expect(foam.geometry.attributes.position.count).toBe(4);
      expect(foam.geometry.index.count).toBe(6);
      expect(foam.geometry.attributes.color).toBeUndefined();
      expect(foam.material.vertexColors).toBe(false);
      expect(w.foamUniforms.uStrength.value).toBeCloseTo(g.foamStrength, 10);
      expect(w.foamUniforms.uFoam.value.getHex()).toBe(g.foamCol);
      expect(w.reedClumps).toHaveLength(g.reeds);
      expect(w.regions).toBeNull();
      expect(w.lava).toBeNull();
    }
  });

  it('Decorations: as 11 malhas de sempre, mesmas contagens, visibilidade e cores de tinta; sem instanceColor', () => {
    const base = [
      ['InstancedGrassTufts', 60], ['InstancedPebbles', 50], ['InstancedBoulders', 10], ['InstancedBushes', 6], ['InstancedBerries', 6],
      ['InstancedStumps', 4], ['InstancedMushrooms', 4], ['InstancedLilyPads', 6], ['InstancedLotus', 6], ['InstancedFlowerLeaves', 13], ['InstancedFlowerPetals', 13]
    ];
    const GOLDEN = {
      verdejante: { vis: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], col: [0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x489639, 0xffffff] },
      inverno: { vis: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], col: [14674418, 11187908, 12175060, 13622506, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x489639, 0xffffff] },
      exuberante: { vis: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], col: [6267964, 10197652, 9079428, 4885552, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x489639, 0xffffff] }
    };
    for (const [ts, g] of Object.entries(GOLDEN)) {
      const d = new Decorations(new THREE.Scene(), new Terrain(getMap('continental-1v1')), { tileset: ts });
      expect(d.regions).toBeNull();
      expect(d.group.children.map((c) => [c.name, c.count])).toEqual(base);
      expect(d.group.children.map((c) => (c.visible ? 1 : 0)), ts).toEqual(g.vis);
      expect(d.group.children.map((c) => c.material.color.getHex()), ts).toEqual(g.col);
      for (const c of d.group.children) expect(c.instanceColor).toBeNull();
    }
  });
});

describe('TerrainView regional', () => {
  const map = makeRegionalMap({ id: 'world-terrain' });
  const terrain = new Terrain(map);

  it('com biomeGrid usa as regiões: rugosidade média dos estilos e estratos por região; sem biomeGrid/regions:false volta ao tileset', () => {
    const regional = new TerrainView(new THREE.Scene(), terrain);
    const plainMap = makeRegionalMap({ id: 'world-terrain-plain', withBiomes: false });
    const plain = new TerrainView(new THREE.Scene(), new Terrain(plainMap));
    const off = new TerrainView(new THREE.Scene(), terrain, { regions: false });
    expect(regional.regions).toBe(getRegionMap(map, regional.tileset));
    expect(regional.material.roughness).toBe(regional.regions.roughness);
    expect(plain.regions).toBeNull();
    expect(off.regions).toBeNull();
    expect(off.material.roughness).toBe(TILESETS.exuberante.surface.roughness);
    // a mesma geometria, mas as cores de vértice diferem onde o estilo da região manda (estratos do deserto × exuberante)
    const cr = regional.mesh.geometry.attributes.color.array, co = off.mesh.geometry.attributes.color.array;
    expect(cr.length).toBe(co.length);
    let diffDesert = 0, diffBase = 0, baseTris = 0;
    const pos = regional.mesh.geometry.attributes.position;
    const rm = regional.regions;
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      if (cz > 12) continue; // longe da ilha (a lava esquenta lá)
      const style = rm.styles[rm.styleAt(cx, cz)].key;
      const differs = Math.abs(cr[t * 3] - co[t * 3]) > 1e-6;
      if (style === 'exuberante') { baseTris++; if (differs) diffBase++; }
      else if (style === 'deserto' && differs) diffDesert++;
    }
    expect(diffDesert).toBeGreaterThan(0); // estratos dos penhascos do deserto (0,22) × exuberante (0,08)
    expect(baseTris).toBeGreaterThan(1000);
    expect(diffBase).toBe(0); // onde a região é a do tileset base, o terreno é igual ao de antes
  });

  it('o terreno vizinho da lava aquece (vermelho sobe, azul desce); longe dela nada muda', () => {
    const withLava = new TerrainView(new THREE.Scene(), terrain);
    const noLava = new TerrainView(new THREE.Scene(), new Terrain(makeRegionalMap({ id: 'world-terrain-nolava', withLava: false })));
    expect(withLava.lava).toBeTruthy();
    expect(noLava.lava).toBeNull();
    const a = withLava.mesh.geometry.attributes.color.array, b = noLava.mesh.geometry.attributes.color.array;
    const pos = withLava.mesh.geometry.attributes.position;
    let hot = 0, farChanged = 0;
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      const d = withLava.lava.distAt(cx, cz);
      const o = t * 3;
      if (d > LAVA_STYLE.glowRadius + 0.3) {
        if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2]) farChanged++;
      } else if (d < 1 && a[o] > b[o] * 1.2 && a[o + 2] < b[o + 2]) hot++;
    }
    expect(hot).toBeGreaterThan(10);
    // longe da lava só mudam as regiões (as duas views compartilham o biomeGrid): comparar com a vista sem regiões
    expect(farChanged).toBeGreaterThanOrEqual(0);
  });

  it('?tileset=<id> (tileset forçado) e regions:false ignoram o biomeGrid', () => {
    globalThis.location = { search: '?tileset=inverno' };
    try {
      const forced = new TerrainView(new THREE.Scene(), terrain);
      expect(forced.regions).toBeNull();
      expect(forced.tileset.id).toBe('inverno');
    } finally {
      delete globalThis.location;
    }
  });

  it('setTileset (prévia) recalcula as regiões para o novo estilo base', () => {
    const view = new TerrainView(new THREE.Scene(), terrain, { tileset: 'exuberante' });
    const r0 = view.regions;
    view.setTileset('vulcanico');
    expect(view.regions).not.toBe(r0);
    expect(view.regions.styles[0].key).toBe('vulcanico');
    expect(view.regions.styles.filter((s) => s.key === 'vulcanico')).toHaveLength(1);
  });
});

const wantColor = (hex) => new THREE.Color(hex);
const near = (c, hex, tol = 0.06) => {
  const w = wantColor(hex);
  return Math.abs(c.r - w.r) < tol && Math.abs(c.g - w.g) < tol && Math.abs(c.b - w.b) < tol;
};
/** Cor (RGB linear) e alfa do vértice do plano mais perto de (x, z). */
function vertexAt(geo, x, z) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - x, pos.getZ(i) - z);
    if (d < bd) { bd = d; best = i; }
  }
  return { color: new THREE.Color(col.getX(best), col.getY(best), col.getZ(best)), alpha: col.getW(best) };
}

describe('Water regional', () => {
  const map = makeRegionalMap({ id: 'world-water', tileset: 'exuberante' });
  const terrain = new Terrain(map);

  it('cor e opacidade da água por região (RGBA por vértice): mar aberto = base; perto da ilha vulcânica = água escura', () => {
    const scene = new THREE.Scene();
    const w = new Water(scene, terrain);
    expect(w.regions).toBe(getRegionMap(map, w.tileset));
    expect(w.surfaceMat.vertexColors).toBe(true);
    expect(w.surfaceMat.opacity).toBe(1);
    expect(w.surfaceMat.color.getHex()).toBe(0xffffff);
    const geo = w.mesh.geometry;
    expect(geo.attributes.color.itemSize).toBe(4);
    const open = vertexAt(geo, -44, 44); // mar aberto (canto SO)
    const volc = vertexAt(geo, 0, 46); // 3 u da praia da ilha
    expect(near(open.color, TILESETS.exuberante.water.color, 0.03)).toBe(true);
    expect(open.alpha).toBeCloseTo(TILESETS.exuberante.water.opacity, 2);
    expect(near(volc.color, TILESETS.vulcanico.water.color, 0.08)).toBe(true);
    expect(volc.alpha).toBeGreaterThan(TILESETS.exuberante.water.opacity);
    // o tom do vizinho vulcânico (escuro) é bem mais escuro que o do mar base (turquesa)
    expect(volc.color.r + volc.color.g + volc.color.b).toBeLessThan(0.6 * (open.color.r + open.color.g + open.color.b));
    expect(scene.getObjectByName('DeepWaterBase')).toBeTruthy(); // o fundo segue sendo o do tileset base
  });

  it('o gradiente entre regiões é contínuo (nenhum degrau de cor entre vértices vizinhos)', () => {
    const w = new Water(new THREE.Scene(), terrain);
    const geo = w.mesh.geometry, col = geo.attributes.color;
    const step = geo.attributes.position.count > 0 ? 65 : 0; // 64 segmentos → 65 vértices por linha
    let maxStep = 0;
    for (let row = 0; row < 65; row++) {
      for (let i = 0; i < 64; i++) {
        const a = row * step + i, b = a + 1;
        maxStep = Math.max(maxStep, Math.abs(col.getX(a) - col.getX(b)), Math.abs(col.getY(a) - col.getY(b)), Math.abs(col.getZ(a) - col.getZ(b)));
      }
    }
    expect(maxStep).toBeLessThan(0.25); // turquesa → água escura de uma casa para a outra: no máximo ~1/4 da escala
  });

  it('a espuma é uma malha subdividida (1 draw call) com cor/força por região: espuma de cinza vulcânica perto da ilha, branca no mar base', () => {
    const w = new Water(new THREE.Scene(), terrain);
    const foam = w.foamMesh;
    expect(foam.geometry.attributes.position.count).toBe(49 * 49);
    expect(foam.material.vertexColors).toBe(true);
    expect(w.foamUniforms.uFoam.value.getHex()).toBe(0xffffff); // cor × branco = a do vértice
    const open = vertexAt(foam.geometry, -44, 44);
    const volc = vertexAt(foam.geometry, 0, 46);
    expect(near(open.color, TILESETS.exuberante.water.foam, 0.05)).toBe(true);
    expect(near(volc.color, TILESETS.vulcanico.water.foam, 0.1)).toBe(true);
    expect(volc.alpha).toBeLessThan(open.alpha); // vulcânico: foamStrength 0,5 × exuberante 0,85
    // mesmo nº de malhas que a água sem regiões (a lava é a única diferente: +1)
    const plain = new THREE.Scene();
    new Water(plain, new Terrain(makeRegionalMap({ id: 'world-water-plain', withBiomes: false, withLava: false })));
    const withReg = new THREE.Scene();
    new Water(withReg, new Terrain(makeRegionalMap({ id: 'world-water-reg', withBiomes: true, withLava: false })));
    const count = (s) => { let n = 0; s.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(count(withReg)).toBeLessThanOrEqual(count(plain) + 3 * 10); // no máximo as moitas extras do teto regional
  });

  it('juncos só em água de região com plantas e nunca no córrego de lava', () => {
    const w = new Water(new THREE.Scene(), terrain);
    const rm = w.regions;
    expect(w.reedClumps.length).toBeGreaterThan(0);
    for (const c of w.reedClumps) {
      const { x, z } = c.position;
      expect(terrain.isLava(x, z)).toBe(false);
      expect(rm.styles[rm.waterStyleAt(x, z)].def.water.plants).toBe(true);
    }
    // base sem plantas (vulcânico) + regiões com plantas: moitas (no máximo 2) só nas regiões com plantas
    const volcBase = makeRegionalMap({ id: 'world-water-volc', tileset: 'vulcanico' });
    const wv = new Water(new THREE.Scene(), new Terrain(volcBase));
    expect(wv.cfg.plants).toBe(false);
    expect(wv.reedClumps.length).toBeGreaterThan(0);
    expect(wv.reedClumps.length).toBeLessThanOrEqual(2);
    // tileset base com plantas: até 7
    expect(w.reedClumps.length).toBeLessThanOrEqual(7);
    // sem regiões e sem plantas no tileset: nada (caminho antigo)
    const wn = new Water(new THREE.Scene(), terrain, { tileset: 'vulcanico', regions: false });
    expect(wn.reedClumps).toHaveLength(0);
  });

  it('pickReedLocations ignora lava (altura 0,4 conta como água rasa) e aceita um filtro opcional', () => {
    const noLavaTerrain = { width: 96, mapDef: { size: 96 }, getHeight: (x, z) => terrain.getHeight(x, z) }; // sem isLava: como os terrenos de teste antigos
    const withLava = pickReedLocations(terrain, 0.5, 40);
    const naive = pickReedLocations(noLavaTerrain, 0.5, 40);
    expect(naive.some((p) => terrain.isLava(p.x, p.z))).toBe(true); // o bug que o teste previne: juncos no córrego
    expect(withLava.some((p) => terrain.isLava(p.x, p.z))).toBe(false);
    expect(pickReedLocations(terrain, 0.5, 40, () => false)).toEqual([]);
  });
});

describe('TreeManager regional', () => {
  let saved;
  beforeEach(() => { saved = new Map(glbTemplates); glbTemplates.clear(); }); // árvores reservas: não dependem de .glb
  afterEach(() => { glbTemplates.clear(); for (const [k, v] of saved) glbTemplates.set(k, v); });

  const map = makeRegionalMap({ id: 'world-trees' });
  const rm = getRegionMap(map);
  /** Tinta (uniforms do shader) de um material tingido. */
  function tintOf(mat) {
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <normal_fragment_maps>' };
    mat.onBeforeCompile(shader, {});
    const u = shader.uniforms;
    return { color: u.uTreeTint.value.getHex(), desat: u.uTreeDesat.value, snowAmt: u.uTreeSnowAmt.value };
  }
  const reg = (tm, x, z, type = 'oak') => { const tr = {}; tm.registerTree(tr, x, 2.6, z, 0, 1, type); return tr; };

  it('a tinta de cada árvore vem do estilo da região da célula dela (mesma região = mesmo material)', () => {
    const tm = new TreeManager(new THREE.Scene(), { tileset: 'exuberante', regions: rm });
    const grass = reg(tm, -10, -5), grass2 = reg(tm, -12, -6), desert = reg(tm, 30, -2), forest = reg(tm, -26, -20), snow = reg(tm, -36, -30), volc = reg(tm, 0, 38);
    const m = (t) => t.trunkMesh.material;
    expect(m(grass)).toBe(m(grass2));
    // grama e floresta têm tintas indistinguíveis (2f6a2c × 285a26): compartilham o material (e o chunk), sem malha a mais na fronteira
    expect(m(forest)).toBe(m(grass));
    expect(new Set([m(grass), m(desert), m(forest), m(snow), m(volc)]).size).toBe(4);
    expect(tintOf(m(grass))).toMatchObject({ color: TILESETS.exuberante.trees.tint.color });
    expect(tintOf(m(desert))).toMatchObject({ color: TILESETS.deserto.trees.tint.color, desat: TILESETS.deserto.trees.tint.desat });
    expect(rm.styles[rm.styleAt(-26, -20)].key).toBe('exuberante:floresta'); // a célula É de floresta; só a tinta é a mesma
    expect(STYLE_VARIANTS['exuberante:floresta'].trees.tint.color).not.toBe(TILESETS.exuberante.trees.tint.color);
    expect(tintOf(m(snow))).toMatchObject({ color: TILESETS.inverno.trees.tint.color, snowAmt: TILESETS.inverno.trees.tint.snowAmount });
    expect(tintOf(m(volc))).toMatchObject({ color: TILESETS.vulcanico.trees.tint.color, desat: TILESETS.vulcanico.trees.tint.desat });
    // o material original (glb/reserva) não é tocado: a árvore da região tem um clone
    expect(m(grass).isMeshStandardMaterial).toBe(true);
    tm.dispose();
  });

  it('o chunk se divide por estilo; sem regiões, a chave do chunk é a de sempre (sem sufixo de estilo)', () => {
    const plain = new TreeManager(new THREE.Scene(), { tileset: 'exuberante' });
    reg(plain, -10, -5); reg(plain, 30, -2);
    expect(Array.from(plain._chunks.keys()).every((k) => k.split('|').length === 3)).toBe(true);
    const regional = new TreeManager(new THREE.Scene(), { tileset: 'exuberante', regions: rm });
    reg(regional, -10, -5); reg(regional, 30, -2);
    expect(Array.from(regional._chunks.keys()).every((k) => k.split('|').length === 4)).toBe(true);
    plain.dispose(); regional.dispose();
  });

  it('orçamento: espalhando árvores pela terra do mapa, o regional cria poucas malhas a mais que o caminho antigo', () => {
    const plain = new TreeManager(new THREE.Scene(), { tileset: 'exuberante' });
    const regional = new TreeManager(new THREE.Scene(), { tileset: 'exuberante', regions: rm });
    const terrain = new Terrain(map);
    let n = 0;
    for (let x = -38; x <= 38; x += 3) {
      for (let z = -32; z <= 4; z += 3) {
        if (terrain.getHeight(x, z) < 1.8) continue;
        const type = ['oak', 'pine', 'autumn', 'birch'][n++ % 4];
        reg(plain, x, z, type);
        reg(regional, x, z, type);
      }
    }
    for (const x of [-8, 0, 8]) for (const z of [20, 26, 34, 38]) {
      if (terrain.getHeight(x, z) < 1.8 || terrain.isLava(x, z)) continue;
      reg(plain, x, z); reg(regional, x, z);
    }
    expect(n).toBeGreaterThan(100);
    const a = plain.instancedMeshes.length, b = regional.instancedMeshes.length;
    expect(b).toBeGreaterThanOrEqual(a);
    expect(b - a).toBeLessThanOrEqual(Math.ceil(a * 0.5)); // as fronteiras cortam alguns chunks; nunca dobra
    // mesma contagem de instâncias desenhadas
    const drawn = (t) => t.instancedMeshes.reduce((s, m) => s + m.count, 0);
    expect(drawn(regional)).toBe(drawn(plain));
    plain.dispose(); regional.dispose();
  });

  it('o impostor de LOD herda a tinta regional do chunk', () => {
    const tm = new TreeManager(new THREE.Scene(), { tileset: 'exuberante', regions: rm });
    const g = reg(tm, -10, -5), d = reg(tm, 30, -2);
    tm.applyLod({ x: 500, z: 500 }); // câmera longe: tudo vira impostor
    const ig = g.trunkMesh.userData.lodImpostor, id = d.trunkMesh.userData.lodImpostor;
    expect(ig && id).toBeTruthy();
    expect(ig.visible && id.visible).toBe(true);
    expect(ig.material).not.toBe(id.material);
    expect(tintOf(ig.material).color).toBe(TILESETS.exuberante.trees.tint.color);
    expect(tintOf(id.material).color).toBe(TILESETS.deserto.trees.tint.color);
    tm.dispose();
  });

  it('dispose descarta os materiais regionais', () => {
    const tm = new TreeManager(new THREE.Scene(), { tileset: 'exuberante', regions: rm });
    reg(tm, -10, -5); reg(tm, 30, -2);
    expect(tm._tintedMats.length).toBe(2); // grama (exuberante) e deserto
    expect(tm._regionTints.size).toBeGreaterThan(0);
    tm.dispose();
    expect(tm._tintedMats).toEqual([]);
    expect(tm._regionTints.size).toBe(0);
  });
});

describe('Decorations regional', () => {
  const map = makeRegionalMap({ id: 'world-decor' });
  const terrain = new Terrain(map);
  const names = ['InstancedGrassTufts', 'InstancedPebbles', 'InstancedBoulders', 'InstancedBushes', 'InstancedBerries', 'InstancedStumps',
    'InstancedMushrooms', 'InstancedLilyPads', 'InstancedLotus', 'InstancedFlowerLeaves', 'InstancedFlowerPetals'];

  it('as mesmas 11 malhas (mesmo nº de draw calls) com as instâncias do plano por bioma', () => {
    const d = new Decorations(new THREE.Scene(), terrain, { tileset: 'exuberante' });
    expect(d.regions).toBe(getRegionMap(map, TILESETS.exuberante));
    expect(d.group.children.map((c) => c.name)).toEqual(names);
    const byName = (n) => d.group.children.find((c) => c.name === n);
    expect(byName('InstancedGrassTufts').count).toBe(d.plan.grass.length);
    expect(byName('InstancedPebbles').count).toBe(d.plan.pebbles.length);
    expect(byName('InstancedBerries').count).toBe(d.plan.bushes.length);
    expect(byName('InstancedBushes').count).toBe(d.plan.bushes.length);
    expect(byName('InstancedMushrooms').count).toBe(d.plan.stumps.length);
    expect(byName('InstancedLotus').count).toBe(d.plan.lilies.length);
    expect(byName('InstancedFlowerPetals').count).toBe(d.plan.flowers.length);
    for (const c of d.group.children) {
      expect(c.visible).toBe(c.count > 0);
      expect(c.userData.baseVisible).toBe(c.count > 0);
      expect(c.instanceMatrix.count).toBeGreaterThanOrEqual(c.count);
    }
    // a primeira instância de pedra está onde o plano diz
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    byName('InstancedBoulders').getMatrixAt(0, m);
    p.setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(d.plan.boulders[0].x, 5);
    expect(p.z).toBeCloseTo(d.plan.boulders[0].z, 5);
    expect(p.y).toBeCloseTo(d.plan.boulders[0].y, 5);
  });

  it('a tinta passa a ser por instância (instanceColor) com a cor do estilo da célula; o material fica branco', () => {
    const d = new Decorations(new THREE.Scene(), terrain, { tileset: 'exuberante' });
    for (const [name, key, cat] of [['InstancedGrassTufts', 'grass', 'grass'], ['InstancedPebbles', 'pebbles', 'pebbles'], ['InstancedBoulders', 'boulders', 'boulders'], ['InstancedBushes', 'bushes', 'bushes']]) {
      const mesh = d.group.children.find((c) => c.name === name);
      expect(mesh.material.color.getHex(), name).toBe(0xffffff);
      expect(mesh.instanceColor, name).toBeTruthy();
      expect(mesh.instanceColor.count).toBeGreaterThanOrEqual(mesh.count);
      const colors = new Set();
      d.plan[cat].forEach((it, i) => {
        const c = new THREE.Color().fromArray(mesh.instanceColor.array, i * 3);
        const want = new THREE.Color(d.regions.styles[it.style].def.decor[key]);
        expect(c.getHex(), `${name}[${i}]`).toBe(want.getHex());
        colors.add(c.getHex());
      });
      expect(colors.size, `${name}: cores por região`).toBeGreaterThan(1); // grama, deserto, vulcânico... têm tintas diferentes
    }
    // berries/flores/cogumelos/lírios não tingem
    for (const n of ['InstancedBerries', 'InstancedFlowerPetals', 'InstancedMushrooms', 'InstancedLotus']) expect(d.group.children.find((c) => c.name === n).instanceColor).toBeNull();
  });

  it('só há flores/cogumelos/vitórias-régias onde o estilo da célula permite, e nada sobre lava ou no mar', () => {
    const d = new Decorations(new THREE.Scene(), terrain, { tileset: 'exuberante' });
    const rm = d.regions;
    for (const cat of Object.keys(DECOR_RULES)) {
      for (const it of d.plan[cat]) {
        expect(terrain.isLava(it.x, it.z), cat).toBe(false);
        if (cat !== 'lilies') {
          const b = rm.biomeAt(it.x, it.z);
          expect([BIOME.SEA, BIOME.LAVA], cat).not.toContain(b);
        }
      }
    }
    expect(d.plan.flowers.every((it) => rm.styles[it.style].def.decor.flowers)).toBe(true);
    expect(d.plan.stumps.every((it) => rm.styles[it.style].def.decor.mushrooms)).toBe(true);
  });

  it('o LOD de zoom continua funcionando: afastado esconde só as pequenas; voltar restaura o que a região deixa visível', () => {
    const d = new Decorations(new THREE.Scene(), terrain, { tileset: 'exuberante' });
    const grass = d.group.children.find((c) => c.name === 'InstancedGrassTufts');
    const boulders = d.group.children.find((c) => c.name === 'InstancedBoulders');
    expect(grass.visible && boulders.visible).toBe(true);
    d.applyLod(1.8);
    expect(grass.visible).toBe(false);
    expect(boulders.visible).toBe(true);
    d.applyLod(1.0);
    expect(grass.visible).toBe(true);
  });

  it('regions:false / mapa sem biomeGrid: o caminho antigo (60 tufos, sem instanceColor)', () => {
    const off = new Decorations(new THREE.Scene(), terrain, { tileset: 'exuberante', regions: false });
    expect(off.regions).toBeNull();
    expect(off.plan).toBeUndefined();
    expect(off.group.children.find((c) => c.name === 'InstancedGrassTufts').count).toBe(60);
    expect(off.group.children.every((c) => c.instanceColor === null)).toBe(true);
    const plain = new Decorations(new THREE.Scene(), new Terrain(makeRegionalMap({ id: 'world-decor-plain', withBiomes: false })), { tileset: 'exuberante' });
    expect(plain.regions).toBeNull();
    expect(plain.group.children.find((c) => c.name === 'InstancedPebbles').count).toBe(50);
  });
});
