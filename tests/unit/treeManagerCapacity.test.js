import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { glbTemplates } from '../../src/entities/glbModels.js';
import { TreeManager } from '../../src/world/TreeManager.js';

const isInstanced = (o) => o.userData && o.userData.isTreeInstanced;
let saved;

beforeEach(() => {
  saved = new Map(glbTemplates);
  glbTemplates.clear(); // árvores reservas: não dependem de .glb
});

afterEach(() => {
  glbTemplates.clear();
  for (const [k, v] of saved) glbTemplates.set(k, v);
});

/** Espalha `n` árvores sobre um mapa de 256 × 256 (centro em 0). */
function fill(tm, n, type) {
  const trees = [];
  for (let i = 0; i < n; i++) {
    const tr = {};
    tm.registerTree(tr, ((i * 37) % 256) - 128, 0, ((i * 91) % 256) - 128, 0, 1, type);
    trees.push(tr);
  }
  return trees;
}

const drawn = (tm) => tm.instancedMeshes.reduce((s, m) => s + m.count, 0);

describe('TreeManager — capacidade e chunks (NEW-7)', () => {
  it('instâncias desenhadas = nº real de árvores (sem vagas extras de escala 0)', () => {
    const tm = new TreeManager(new THREE.Scene());
    fill(tm, 50, 'oak');
    fill(tm, 7, 'pine');
    expect(drawn(tm)).toBe(57);
    tm.dispose();
  });

  it('passa de 120 árvores do mesmo tipo (antigo teto) sem perder instâncias', () => {
    const tm = new TreeManager(new THREE.Scene());
    const trees = fill(tm, 300, 'oak');
    expect(tm.oakCount).toBe(300);
    expect(drawn(tm)).toBe(300);
    const m = new THREE.Matrix4();
    for (const tr of trees) {
      tr.trunkMesh.getMatrixAt(tr.instanceIndex, m);
      expect(m.equals(tr.baseMatrix)).toBe(true);
    }
    tm.dispose();
  });

  it('cada chunk tem boundingSphere própria, menor que a do conjunto', () => {
    const tm = new TreeManager(new THREE.Scene());
    fill(tm, 200, 'oak');
    expect(tm.instancedMeshes.length).toBeGreaterThan(8);
    const box = new THREE.Box3();
    for (const im of tm.instancedMeshes) {
      im.computeBoundingSphere();
      box.expandByPoint(im.boundingSphere.center);
    }
    const whole = box.getBoundingSphere(new THREE.Sphere());
    for (const im of tm.instancedMeshes) {
      expect(im.boundingSphere.radius).toBeLessThan(whole.radius);
      expect(im.boundingSphere.radius).toBeLessThan(40);
    }
    tm.dispose();
  });

  it('derrubar (hideTree) zera só aquela instância; contagem desenhada não muda', () => {
    const tm = new TreeManager(new THREE.Scene());
    const trees = fill(tm, 30, 'autumn');
    const victim = trees[10];
    tm.hideTree(victim);
    const m = new THREE.Matrix4();
    victim.trunkMesh.getMatrixAt(victim.instanceIndex, m);
    expect(m.elements[0]).toBe(0);
    trees[11].trunkMesh.getMatrixAt(trees[11].instanceIndex, m);
    expect(m.elements[0]).toBe(1);
    expect(drawn(tm)).toBe(30);
    tm.dispose();
    expect(tm.instancedMeshes).toHaveLength(0);
  });

  it('a tinta do tileset vale para todos os chunks (um material clonado por tipo)', () => {
    const scene = new THREE.Scene();
    const tm = new TreeManager(scene, { tileset: 'inverno' });
    fill(tm, 100, 'oak');
    expect(tm.instancedMeshes.length).toBeGreaterThan(1);
    expect(new Set(tm.instancedMeshes.map((m) => m.material)).size).toBe(1);
    expect(scene.children.filter(isInstanced)).toHaveLength(tm.instancedMeshes.length);
    tm.dispose();
  });
});
