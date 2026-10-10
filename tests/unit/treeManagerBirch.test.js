import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { glbTemplates } from '../../src/entities/glbModels.js';
import { TreeManager } from '../../src/world/TreeManager.js';
import { FOREST_SPECIES } from '../../src/data/maps/validate.js';
import { getMap } from '../../src/data/maps/index.js';

/** Modelo .glb falso (uma malha de 1 caixa por chave): o TreeManager extrai a primeira malha, como do .glb real. */
function fakeTree(name, color) {
  const root = new THREE.Group();
  root.name = name;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color }));
  mesh.name = 'Static_Mesh';
  mesh.position.y = 1;
  root.add(mesh);
  return root;
}

const KEYS = { tree_oak: 0x2f7d32, tree_pine: 0x1f5f3a, tree_autumn: 0xd9791c, tree_birch: 0xbcdc5e };
let saved;

beforeEach(() => {
  saved = new Map(glbTemplates);
  for (const [k, c] of Object.entries(KEYS)) glbTemplates.set(k, fakeTree(k, c));
});

afterEach(() => {
  glbTemplates.clear();
  for (const [k, v] of saved) glbTemplates.set(k, v);
});

const isInstanced = (o) => o.userData && o.userData.isTreeInstanced;

describe('TreeManager — bétula (F7-00b)', () => {
  it('sem árvore `birch` registrada não existe InstancedMesh da bétula (nenhuma chamada de desenho extra)', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    expect(scene.children.filter(isInstanced)).toHaveLength(3); // carvalho, pinheiro e outono (1 malha cada, do .glb)
    expect(tm.birchCount).toBe(0);
    tm.dispose();
  });

  it('a primeira bétula cria o InstancedMesh do tree_birch.glb; tronco e copa são a mesma malha', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const tree = {};
    tm.registerTree(tree, 3, 1.5, -4, 0, 1.2, 'birch');
    expect(tm.birchCount).toBe(1);
    expect(tm.oakCount).toBe(0);
    expect(scene.children.filter(isInstanced)).toHaveLength(4);
    expect(tree.trunkMesh).toBe(tree.foliageMesh);
    expect(tree.trunkMesh.isInstancedMesh).toBe(true);
    expect(tree.trunkMesh.material).toBe(glbTemplates.get('tree_birch').children[0].material);
    const m = new THREE.Matrix4();
    tree.trunkMesh.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect([p.x, p.y, p.z]).toEqual([3, 1.5, -4]);
    // segunda bétula reaproveita a mesma malha
    const t2 = {};
    tm.registerTree(t2, 0, 0, 0, 0, 1, 'birch');
    expect(t2.trunkMesh).toBe(tree.trunkMesh);
    expect(t2.instanceIndex).toBe(1);
    expect(tm.countOf('birch')).toBe(2);
    expect(tm.countOf('oak')).toBe(0);
    tm.dispose();
    expect(scene.children.filter(isInstanced)).toHaveLength(0);
  });

  it('abater a bétula zera a instância; sacudir e restaurar usam a matriz-base', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const tree = {};
    tm.registerTree(tree, 1, 0, 1, 0, 1, 'birch');
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

  it('sem o .glb da bétula (falha de carga) ela usa a árvore reserva, num InstancedMesh próprio (sem texturas de canvas)', () => {
    glbTemplates.delete('tree_birch');
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const tree = {};
    tm.registerTree(tree, 0, 0, 0, 0, 1, 'birch');
    expect(tm.birchCount).toBe(1);
    expect(tm.oakCount).toBe(0);
    expect(scene.children.filter(isInstanced)).toHaveLength(4);
    expect(tree.trunkMesh.material.map).toBeNull();
    expect(tree.trunkMesh.material.color.getHex()).toBe(0xb6d95a);
    tm.dispose();
  });

  it('sem nenhum .glb (rede/`?glb=0`) os quatro tipos viram árvores reservas de uma cor, sem DOM nem texturas', () => {
    glbTemplates.clear();
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const types = ['oak', 'pine', 'autumn', 'birch'];
    const trees = types.map((t, i) => { const tr = {}; tm.registerTree(tr, i, 0, 0, 0, 1, t); return tr; });
    expect(new Set(trees.map((t) => t.trunkMesh)).size).toBe(4);
    trees.forEach((t) => {
      expect(t.trunkMesh.geometry.attributes.position.count).toBeGreaterThan(40);
      expect(t.trunkMesh.material.map).toBeNull();
    });
    expect([tm.oakCount, tm.pineCount, tm.autumnCount, tm.birchCount]).toEqual([1, 1, 1, 1]);
    tm.dispose();
  });

  it('o tileset de inverno tinge também a bétula criada sob demanda (material clonado, shader com neve)', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene, { tileset: 'inverno' });
    const tree = {};
    tm.registerTree(tree, 0, 0, 0, 0, 1, 'birch');
    const src = glbTemplates.get('tree_birch').children[0].material;
    expect(tree.trunkMesh.material).not.toBe(src);
    expect(tree.trunkMesh.material.color.getHex()).toBe(src.color.getHex());
    expect(typeof tree.trunkMesh.material.onBeforeCompile).toBe('function');
    tm.dispose();
  });

  it('as demais espécies seguem nos seus InstancedMesh', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene);
    const a = {}; const b = {}; const c = {};
    tm.registerTree(a, 0, 0, 0, 0, 1, 'oak');
    tm.registerTree(b, 0, 0, 0, 0, 1, 'pine');
    tm.registerTree(c, 0, 0, 0, 0, 1, 'autumn');
    expect([tm.oakCount, tm.pineCount, tm.autumnCount, tm.birchCount]).toEqual([1, 1, 1, 0]);
    expect(new Set([a.trunkMesh, b.trunkMesh, c.trunkMesh]).size).toBe(3);
    tm.dispose();
  });
});

describe('espécie `birch` nos mapas (F7-00b)', () => {
  it('é uma espécie de floresta válida e o mapa-base tem bosques de bétula', () => {
    expect(FOREST_SPECIES).toContain('birch');
    const forests = getMap('continental-1v1').forests;
    expect(forests.filter((f) => f.species === 'birch').length).toBeGreaterThanOrEqual(2);
  });
});
