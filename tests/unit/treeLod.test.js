import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { glbTemplates } from '../../src/entities/glbModels.js';
import { TreeManager } from '../../src/world/TreeManager.js';
import { LOD_DISTANCES } from '../../src/render/lod.js';

let saved;
beforeEach(() => { saved = new Map(glbTemplates); glbTemplates.clear(); });
afterEach(() => { glbTemplates.clear(); for (const [k, v] of saved) glbTemplates.set(k, v); });

const reg = (tm, x, z, type = 'oak') => { const t = {}; tm.registerTree(t, x, 0, z, 0, 1, type); return t; };
const T = LOD_DISTANCES.tree;

describe('TreeManager.applyLod — impostor (F1-10 item 3)', () => {
  it('chunk longe usa o impostor e o perto usa o mesh normal', () => {
    const tm = new TreeManager(new THREE.Scene());
    const near = reg(tm, 5, 5);
    const far = reg(tm, 5 + 300, 5);
    tm.applyLod({ x: 0, z: 0 });
    expect(near.trunkMesh.visible).toBe(true);
    expect(near.trunkMesh.userData.lodImpostor).toBeNull(); // criado só sob demanda
    expect(far.trunkMesh.visible).toBe(false);
    const imp = far.trunkMesh.userData.lodImpostor;
    expect(imp.visible).toBe(true);
    expect(imp.castShadow).toBe(false);
    expect(imp.instanceMatrix).toBe(far.trunkMesh.instanceMatrix); // mesmo buffer
    expect(imp.count).toBe(far.trunkMesh.count);
    expect(imp.geometry.getAttribute('position').count).toBeLessThan(200);
    tm.applyLod({ x: 300, z: 0 }); // voltando para perto
    expect(far.trunkMesh.visible).toBe(true);
    expect(imp.visible).toBe(false);
    tm.dispose();
  });

  it('histerese: dentro da banda o nível não alterna', () => {
    const tm = new TreeManager(new THREE.Scene());
    const im = reg(tm, 0, 0).trunkMesh;
    const at = (d) => tm.applyLod({ x: im.userData.chunkX + d, z: im.userData.chunkZ });
    at(T * 1.05); expect(im.userData.lodLevel).toBe(0);
    at(T * 1.2); expect(im.userData.lodLevel).toBe(1);
    at(T * 0.95); expect(im.userData.lodLevel).toBe(1);
    at(T * 0.8); expect(im.userData.lodLevel).toBe(0);
    tm.dispose();
  });

  it('derrubar árvore atualiza os dois meshes e o crescimento do buffer é ressincronizado', () => {
    const tm = new TreeManager(new THREE.Scene());
    const trees = [];
    for (let i = 0; i < 3; i++) trees.push(reg(tm, 300 + i, 0));
    tm.applyLod({ x: 0, z: 0 });
    const im = trees[0].trunkMesh;
    const imp = im.userData.lodImpostor;
    tm.hideTree(trees[1]);
    const m = new THREE.Matrix4();
    imp.getMatrixAt(trees[1].instanceIndex, m);
    expect(m.elements[0]).toBe(0);
    for (let i = 3; i < 20; i++) trees.push(reg(tm, 300 + i, 0)); // força crescer a capacidade
    expect(imp.instanceMatrix).toBe(im.instanceMatrix);
    expect(imp.count).toBe(20);
    imp.getMatrixAt(trees[1].instanceIndex, m);
    expect(m.elements[0]).toBe(0);
    tm.dispose();
  });

  it('?lod=0 mantém tudo no nível normal', () => {
    const prev = globalThis.window;
    globalThis.window = { location: { search: '?lod=0' } };
    try {
      const tm = new TreeManager(new THREE.Scene());
      const far = reg(tm, 300, 0);
      tm.applyLod({ x: 0, z: 0 });
      expect(far.trunkMesh.visible).toBe(true);
      expect(far.trunkMesh.userData.lodImpostor).toBeNull();
      tm.dispose();
    } finally {
      if (prev === undefined) delete globalThis.window; else globalThis.window = prev;
    }
  });
});
