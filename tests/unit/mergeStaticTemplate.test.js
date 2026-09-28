import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { mergeStaticTemplate } from '../../src/render/mergeStaticTemplate.js';
import { prepareStaticTemplate, setStaticMergeEnabled, getStaticMergeConfig } from '../../src/render/staticTemplates.js';

const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });

function countMeshes(obj) {
  let n = 0;
  obj.traverse(o => { if (o.isMesh) n++; });
  return n;
}

function worldBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

function buildModel() {
  const root = new THREE.Group();
  root.name = 'Model';
  const wing = new THREE.Group();
  wing.name = 'Wing';
  wing.position.set(3, 0, 0);
  wing.rotation.y = 0.7;
  root.add(wing);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), i % 2 ? matA : matB);
    m.position.set(i, i * 0.5, -i);
    m.castShadow = true;
    m.receiveShadow = true;
    wing.add(m);
  }
  // Não indexada, sem uv
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const triMesh = new THREE.Mesh(tri, matA);
  triMesh.castShadow = true;
  triMesh.receiveShadow = true;
  root.add(triMesh);
  // Espelhada
  const mirrored = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 5), matA);
  mirrored.scale.set(-1, 1, 1);
  mirrored.position.set(-4, 0, 0);
  mirrored.castShadow = true;
  mirrored.receiveShadow = true;
  root.add(mirrored);
  // Peça pequena sem sombra (regra da F1-04) — grupo separado
  const small = new THREE.Mesh(new THREE.SphereGeometry(0.1), matA);
  small.position.set(0, 3, 0);
  root.add(small);
  const small2 = small.clone();
  small2.position.set(0, 3.5, 0);
  root.add(small2);
  // Animado por nome
  const flag = new THREE.Group();
  flag.name = 'Anim_Flag';
  flag.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matB));
  flag.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matB));
  root.add(flag);
  const flame = new THREE.Group();
  flame.name = 'Flames';
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 5), matB));
  root.add(flame);
  // Luz dentro de um grupo
  const lampGroup = new THREE.Group();
  lampGroup.position.set(1, 2, 1);
  lampGroup.add(new THREE.PointLight(0xffaa00, 1, 5));
  lampGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), matA));
  root.add(lampGroup);
  // Transparentes e noMerge
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass));
  const nm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA);
  nm.userData.noMerge = true;
  root.add(nm);
  // Referência em userData
  const ref = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA);
  ref.name = 'Referenced';
  root.add(ref);
  root.userData.door = ref;
  return root;
}

describe('mergeStaticTemplate', () => {
  it('reduz as malhas mantendo a caixa envolvente', () => {
    const model = buildModel();
    const before = countMeshes(model);
    const boxBefore = worldBox(model);
    mergeStaticTemplate(model, { keep: ['Flames'] });
    const after = countMeshes(model);
    const boxAfter = worldBox(model);
    expect(after).toBeLessThan(before);
    expect(boxAfter.min.distanceTo(boxBefore.min)).toBeLessThan(1e-4);
    expect(boxAfter.max.distanceTo(boxBefore.max)).toBeLessThan(1e-4);
    expect(mergeStaticTemplate.lastStats.meshesBefore).toBe(before);
  });

  it('preserva nós animados, luzes, transparentes, noMerge e refs de userData', () => {
    const model = buildModel();
    mergeStaticTemplate(model, { keep: ['Flames'] });
    expect(model.getObjectByName('Anim_Flag').children.length).toBe(2);
    expect(model.getObjectByName('Flames').children[0].geometry.type).toBe('ConeGeometry');
    expect(model.getObjectByName('Referenced')).toBe(model.userData.door);
    let lights = 0;
    let glassMeshes = 0;
    let noMerge = 0;
    model.traverse(o => {
      if (o.isLight) lights++;
      if (o.isMesh && o.material === glass) glassMeshes++;
      if (o.isMesh && o.userData.noMerge) noMerge++;
    });
    expect(lights).toBe(1);
    expect(glassMeshes).toBe(2);
    expect(noMerge).toBe(1);
  });

  it('separa grupos por castShadow e normaliza atributos', () => {
    const model = buildModel();
    mergeStaticTemplate(model, { keep: ['Flames'] });
    const merged = model.children.filter(c => c.name.startsWith('Merged_'));
    // matA com sombra, matA sem sombra, matB com sombra
    expect(merged.length).toBe(3);
    const aNoShadow = merged.filter(m => m.material === matA && !m.castShadow);
    expect(aNoShadow.length).toBe(1);
    for (const m of merged) {
      expect(m.geometry.index).toBeTruthy();
      expect(Object.keys(m.geometry.attributes).sort()).toEqual(['normal', 'position', 'uv']);
    }
  });

  it('absorve peças minúsculas sem sombra no grupo com sombra do mesmo material', () => {
    const root = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const big = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2, 4, 4, 4), matA);
      big.position.x = i * 3;
      big.castShadow = true;
      root.add(big);
    }
    const tiny = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), matA);
    root.add(tiny);
    mergeStaticTemplate(root);
    expect(countMeshes(root)).toBe(1);
    expect(root.children[0].castShadow).toBe(true);
    expect(mergeStaticTemplate.lastStats.foldedNonCasters).toBe(1);

    const root2 = new THREE.Group();
    root2.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2, 4, 4, 4), matA), new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), matA));
    root2.children[0].castShadow = true;
    mergeStaticTemplate(root2, { foldNonCasters: 0 });
    expect(countMeshes(root2)).toBe(2);
  });

  it('corrige o sentido dos triângulos de peças espelhadas', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matA);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matA);
    b.scale.set(-1, 1, 1);
    b.position.x = 3;
    root.add(a, b);
    mergeStaticTemplate(root);
    const geo = root.children[0].geometry;
    const pos = geo.attributes.position;
    const idx = geo.index.array;
    const v = i => new THREE.Vector3().fromBufferAttribute(pos, idx[i]);
    // Normal geométrica de cada triângulo deve apontar para +Z (frente) nas duas cópias
    for (let t = 0; t < idx.length; t += 3) {
      const n = new THREE.Vector3().crossVectors(v(t + 1).sub(v(t)), v(t + 2).sub(v(t)));
      expect(n.z).toBeGreaterThan(0);
    }
  });
});

describe('prepareStaticTemplate', () => {
  afterEach(() => setStaticMergeEnabled(null));

  it('não mescla unidades nem árvores', () => {
    expect(getStaticMergeConfig('knight')).toBeNull();
    expect(getStaticMergeConfig('tree_oak')).toBeNull();
    expect(getStaticMergeConfig('castle')).toBeTruthy();
    expect(getStaticMergeConfig('bush_red')).toBeTruthy();
  });

  it('respeita a flag de desligar', () => {
    setStaticMergeEnabled(false);
    const model = buildModel();
    const before = countMeshes(model);
    prepareStaticTemplate('castle', model);
    expect(countMeshes(model)).toBe(before);
    setStaticMergeEnabled(true);
    prepareStaticTemplate('castle', model);
    expect(countMeshes(model)).toBeLessThan(before);
  });
});
