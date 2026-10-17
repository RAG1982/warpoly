import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { glbTemplates, GLB_MODELS, ensureGlbKeys } from '../../src/entities/glbModels.js';
import { TreeManager } from '../../src/world/TreeManager.js';
import { TreeView } from '../../src/render/TreeView.js';
import { Tree } from '../../src/sim/Tree.js';
import { createRng } from '../../src/sim/rng.js';
import {
  FOREST_SPECIES, TREE_SPECIES, TREE_MIX, DEFAULT_TREE_MIX, treeMixFor, treeKeyOf, speciesForBiome, lazyTreeKeys, lazyTreeKeysOfMap
} from '../../src/data/treeSpecies.js';
import { FOREST_SPECIES as VALIDATOR_SPECIES, validateMapDef } from '../../src/data/maps/validate.js';
import { getMap } from '../../src/data/maps/index.js';
import { generateMap } from '../../src/data/maps/generator.js';
import { buildCoastWorld } from '../../src/data/maps/coast/index.js';

/**
 * M2-10 (ART-02): `broad|palm|acacia` como espécies de árvore dos mapas (análogo a `treeManagerBirch.test.js`).
 * Modelo falso: a palmeira tem a copa deslocada 1,6 em +x (como o `tree_palm.glb` real); as demais são centradas.
 */
function fakeTree(name, color, crownDx = 0) {
  const root = new THREE.Group();
  root.name = name;
  const trunk = new THREE.BoxGeometry(0.6, 3, 0.6);
  trunk.translate(0, 1.5, 0);
  const crown = new THREE.BoxGeometry(3, 2.5, 3);
  crown.translate(crownDx, 6, 0);
  const geo = new THREE.BufferGeometry();
  const merged = [trunk, crown].map((g) => g.toNonIndexed());
  const pos = new Float32Array(merged.reduce((n, g) => n + g.attributes.position.array.length, 0));
  let o = 0;
  for (const g of merged) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
  mesh.name = 'Static_Mesh';
  root.add(mesh);
  return root;
}

const KEYS = {
  tree_oak: [0x2f7d32, 0], tree_pine: [0x1f5f3a, 0], tree_autumn: [0xd9791c, 0], tree_birch: [0xbcdc5e, 0],
  tree_broad: [0x2c6a31, 0], tree_palm: [0x4fa341, 1.6], tree_acacia: [0x9c9a3c, 0]
};
let saved;

beforeEach(() => {
  saved = new Map(glbTemplates);
  for (const [k, [c, dx]] of Object.entries(KEYS)) glbTemplates.set(k, fakeTree(k, c, dx));
});

afterEach(() => {
  glbTemplates.clear();
  for (const [k, v] of saved) glbTemplates.set(k, v);
});

const isInstanced = (o) => o.userData && o.userData.isTreeInstanced;

describe('espécies de árvore: tabela única (src/data/treeSpecies.js)', () => {
  it('o validador aceita as 7 espécies e usa a mesma lista da tabela; cada espécie aponta um .glb registrado', () => {
    expect(VALIDATOR_SPECIES).toBe(FOREST_SPECIES);
    for (const s of ['oak', 'pine', 'autumn', 'birch', 'broad', 'palm', 'acacia']) expect(FOREST_SPECIES).toContain(s);
    for (const s of FOREST_SPECIES) expect(GLB_MODELS[TREE_SPECIES[s].key], s).toBeDefined();
    expect(treeKeyOf('palm')).toBe('tree_palm');
    expect(treeKeyOf('desconhecida')).toBe('tree_oak');
  });

  it('só broad/palm/acacia são lazy (fora do boot) e é isso que o carregamento do mapa pede', () => {
    for (const s of ['oak', 'pine', 'autumn', 'birch']) expect(TREE_SPECIES[s].lazy).toBe(false);
    for (const s of ['broad', 'palm', 'acacia']) { expect(TREE_SPECIES[s].lazy).toBe(true); expect(GLB_MODELS[TREE_SPECIES[s].key].lazy).toBe(true); }
    expect(lazyTreeKeys(['oak', 'palm', 'palm', 'birch', 'acacia']).sort()).toEqual(['tree_acacia', 'tree_palm']);
    expect(lazyTreeKeysOfMap({ forests: [{ species: 'pine' }, { species: 'broad' }] })).toEqual(['tree_broad']);
    expect(lazyTreeKeysOfMap(getMap('continental-1v1'))).toEqual([]); // mapa-base: nada a mais para baixar
  });

  it('ensureGlbKeys ignora chaves desconhecidas e não falha sem rede (modelo já em glbTemplates)', async () => {
    await expect(ensureGlbKeys(['nao_existe'])).resolves.toBeDefined();
    await expect(ensureGlbKeys([])).resolves.toBeDefined();
  });

  it('a mistura do bosque: espécies antigas seguem na lista de sempre; as novas têm lista própria que inclui a própria espécie', () => {
    for (const s of ['oak', 'pine', 'autumn', 'birch']) expect(treeMixFor(s)).toBe(DEFAULT_TREE_MIX);
    expect([...DEFAULT_TREE_MIX]).toEqual(['oak', 'pine', 'autumn']);
    for (const s of Object.keys(TREE_MIX)) { expect(TREE_MIX[s]).toContain(s); for (const t of TREE_MIX[s]) expect(FOREST_SPECIES).toContain(t); }
  });

  it('speciesForBiome: palmeira na costa/deserto, acácia na savana, copa larga no exuberante; sempre uma espécie válida', () => {
    const all = (biome, coastal) => new Set(Array.from({ length: 60 }, (_, i) => speciesForBiome(biome, coastal, i / 60)));
    expect(all(4, true).has('palm')).toBe(true); // deserto
    expect(all(1, false).has('palm')).toBe(true); // areia
    expect(all(3, false).has('acacia')).toBe(true); // savana
    expect(all(2, false).has('broad')).toBe(true); // grama/exuberante
    expect(all(2, true).has('palm')).toBe(true); // costa exuberante
    expect(all(9, false)).toEqual(new Set(['pine', 'autumn'])); // neve segue com pinheiros
    for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) for (const c of [false, true]) for (const s of all(b, c)) expect(FOREST_SPECIES).toContain(s);
  });
});

describe('TreeManager — copa larga, palmeira e acácia (M2-10)', () => {
  it('sem árvores novas registradas não existe InstancedMesh delas (nenhuma chamada de desenho extra)', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const a = {}; tm.registerTree(a, 0, 0, 0, 0, 1, 'oak');
    expect(scene.children.filter(isInstanced)).toHaveLength(1);
    expect([tm.broadCount, tm.palmCount, tm.acaciaCount]).toEqual([0, 0, 0]);
    tm.dispose();
  });

  it.each([['broad', 'tree_broad'], ['palm', 'tree_palm'], ['acacia', 'tree_acacia']])('a 1ª árvore %s cria o InstancedMesh de %s (1 por tipo × chunk); a 2ª reaproveita', (type, key) => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const tree = {};
    tm.registerTree(tree, 3, 1.5, -4, 0, 1.2, type);
    expect(tm.countOf(type)).toBe(1);
    expect(tm.oakCount).toBe(0);
    expect(scene.children.filter(isInstanced)).toHaveLength(1);
    expect(tree.trunkMesh).toBe(tree.foliageMesh);
    expect(tree.trunkMesh.material).toBe(glbTemplates.get(key).children[0].material);
    const m = new THREE.Matrix4();
    tree.trunkMesh.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([3, 1.5, -4]);
    const t2 = {};
    tm.registerTree(t2, 4, 0, -5, 0, 1, type);
    expect(t2.trunkMesh).toBe(tree.trunkMesh);
    expect(t2.instanceIndex).toBe(1);
    expect(tm.countOf(type)).toBe(2);
    tm.dispose();
    expect(scene.children.filter(isInstanced)).toHaveLength(0);
    expect(tm.countOf(type)).toBe(0);
  });

  it('as 7 espécies viram 7 InstancedMesh distintos no mesmo chunk, cada uma com o próprio contador', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const types = ['oak', 'pine', 'autumn', 'birch', 'broad', 'palm', 'acacia'];
    const trees = types.map((t, i) => { const tr = {}; tm.registerTree(tr, i, 0, 0, 0, 1, t); return tr; });
    expect(new Set(trees.map((t) => t.trunkMesh)).size).toBe(7);
    expect(types.map((t) => tm.countOf(t))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    tm.dispose();
  });

  it('abater, sacudir e restaurar funcionam na palmeira (matriz-base)', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const tree = {};
    tm.registerTree(tree, 1, 0, 1, 0, 1, 'palm');
    tm.shakeTree(tree, 0.2);
    const m = new THREE.Matrix4();
    tree.trunkMesh.getMatrixAt(0, m);
    expect(m.equals(tree.baseMatrix)).toBe(false);
    tm.resetTreeMatrix(tree);
    tree.trunkMesh.getMatrixAt(0, m);
    expect(m.equals(tree.baseMatrix)).toBe(true);
    tm.hideTree(tree);
    tree.trunkMesh.getMatrixAt(0, m);
    expect(m.elements[0]).toBe(0);
    tm.dispose();
  });

  it('sem o .glb (lazy ainda não baixado ou falha) cada espécie nova usa a árvore reserva da própria cor, sem texturas', () => {
    glbTemplates.clear();
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const colors = { broad: 0x2c6a31, palm: 0x4fa341, acacia: 0x9c9a3c };
    for (const [type, hex] of Object.entries(colors)) {
      const tr = {};
      tm.registerTree(tr, 0, 0, 0, 0, 1, type);
      expect(tr.trunkMesh.material.map).toBeNull();
      expect(tr.trunkMesh.material.color.getHex()).toBe(hex);
    }
    expect(scene.children.filter(isInstanced)).toHaveLength(3);
    tm.dispose();
  });

  it('o tileset de inverno tinge também as espécies novas (material clonado, shader com neve)', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene, { tileset: 'inverno' });
    for (const type of ['broad', 'palm', 'acacia']) {
      const tree = {};
      tm.registerTree(tree, 0, 0, 0, 0, 1, type);
      const src = glbTemplates.get(`tree_${type}`).children[0].material;
      expect(tree.trunkMesh.material).not.toBe(src);
      expect(typeof tree.trunkMesh.material.onBeforeCompile).toBe('function');
    }
    tm.dispose();
  });

  it('LOD: o impostor da palmeira desloca a copa junto (~1,6 em +x); os das demais árvores seguem centrados no pé', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const palm = {}, oak = {}, acacia = {};
    tm.registerTree(palm, 5, 0, 5, 0, 1, 'palm');
    tm.registerTree(oak, 5, 0, 5, 0, 1, 'oak');
    tm.registerTree(acacia, 5, 0, 5, 0, 1, 'acacia');
    tm.applyLod({ x: 5000, z: 5000 }); // longe: todos os chunks viram impostor
    const centerX = (im) => { const g = im.userData.lodImpostor.geometry; g.computeBoundingBox(); return (g.boundingBox.min.x + g.boundingBox.max.x) / 2; };
    expect(centerX(palm.trunkMesh)).toBeGreaterThan(1.2);
    expect(Math.abs(centerX(oak.trunkMesh))).toBeLessThan(0.05);
    expect(Math.abs(centerX(acacia.trunkMesh))).toBeLessThan(0.05);
    tm.dispose();
  });
});

describe('TreeView — hit-proxy da palmeira (M2-10)', () => {
  const terrain = { getHeight: () => 2 };
  const proxyBox = (type, rotY) => {
    const rng = createRng(7);
    const t = new Tree(terrain, 0, 0, type, rng);
    t.baseRotY = rotY;
    t.scale = 1;
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const view = new TreeView(t, scene, tm);
    view.root.geometry.computeBoundingBox();
    const box = view.root.geometry.boundingBox.clone();
    view.root.geometry.dispose();
    tm.dispose();
    return box;
  };

  it('a palmeira ganha um cilindro extra na copa (acima de 6 e ao lado do pé, girado com a árvore); o carvalho não', () => {
    const oak = proxyBox('oak', 0);
    expect(oak.max.y).toBeCloseTo(4.5, 1);
    const palm = proxyBox('palm', 0);
    expect(palm.max.y).toBeGreaterThan(7);
    expect(palm.max.x).toBeGreaterThan(3.5); // 1,6 + raio da copa
    const turned = proxyBox('palm', Math.PI / 2); // +x do modelo vira -z no mundo
    expect(turned.min.z).toBeLessThan(-3.5);
    expect(turned.max.x).toBeLessThan(2.5);
  });
});

describe('espécies novas nos mapas e nos geradores (M2-10)', () => {
  it('o validador aceita palm/acacia/broad num mapa e recusa espécie inexistente', () => {
    const base = JSON.parse(JSON.stringify(getMap('continental-1v1')));
    const bad = (m) => validateMapDef(m).errors.some((e) => e.code === 'forestBad');
    for (const s of ['broad', 'palm', 'acacia']) {
      const m = JSON.parse(JSON.stringify(base));
      m.forests[0].species = s;
      expect(bad(m), s).toBe(false);
    }
    const m = JSON.parse(JSON.stringify(base));
    m.forests[0].species = 'baobab';
    expect(bad(m)).toBe(true);
  });

  it('o gerador procedural usa as espécies novas por tema e as demais seguem como antes', () => {
    const species = (theme, naval = false) => new Set([1, 2, 3, 4].flatMap((seed) => generateMap({ seed, players: 4, size: 160, theme, naval }).forests.map((f) => f.species)));
    expect(species('verdejante').has('broad')).toBe(true);
    expect(species('ilhas').has('palm')).toBe(true);
    expect([...species('devastadas')].every((s) => ['acacia', 'autumn', 'palm'].includes(s))).toBe(true);
    expect([...species('inverno')].every((s) => ['oak', 'pine', 'autumn'].includes(s))).toBe(true);
    for (const th of ['verdejante', 'ilhas', 'devastadas', 'inverno', 'pantano']) for (const s of species(th)) expect(FOREST_SPECIES).toContain(s);
  });

  it('o planejador de costa (mapas de bioma) escolhe espécies pelo bioma e só devolve espécies válidas', () => {
    const w = buildCoastWorld('duelo-continental', { seed: 1 });
    expect(w.ok).toBe(true);
    const sp = new Set(w.mapDef.forests.map((f) => f.species));
    for (const s of sp) expect(FOREST_SPECIES).toContain(s);
    expect(validateMapDef(w.mapDef).errors.filter((e) => e.code === 'forestBad')).toEqual([]);
    // o resultado não depende de quantas espécies existem: duas execuções iguais
    expect(buildCoastWorld('duelo-continental', { seed: 1 }).mapDef.forests).toEqual(w.mapDef.forests);
  });
});
