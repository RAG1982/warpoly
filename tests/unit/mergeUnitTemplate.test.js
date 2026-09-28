import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeUnitTemplate } from '../../src/render/mergeUnitTemplate.js';

const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const arrayMats = [matA, matB, matA, matB, matA, matB];

function countMeshes(obj) {
  let n = 0;
  obj.traverse(o => { if (o.isMesh) n++; });
  return n;
}

function worldBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

/**
 * raiz → Torso → (ArmR → Weapon com 3 malhas; 4 malhas soltas no Torso)
 */
function buildSyntheticUnit() {
  const root = new THREE.Group();
  root.name = 'Unit';

  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 1, 0);
  root.add(torso);

  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), i % 2 ? matA : matB);
    m.position.set(i * 0.1, i * 0.05, 0);
    m.castShadow = true;
    torso.add(m);
  }

  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(0.4, 0.8, 0);
  armR.rotation.z = 0.3;
  torso.add(armR);

  const weapon = new THREE.Group();
  weapon.name = 'Weapon';
  weapon.position.set(0, -0.3, 0);
  weapon.rotation.x = 0.5;
  armR.add(weapon);

  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), matA);
    m.position.set(0, -i * 0.1, 0);
    m.castShadow = true;
    weapon.add(m);
  }

  const axe = new THREE.Group();
  axe.name = 'Axe';
  axe.visible = false;
  axe.position.set(0, -0.5, 0);
  const axeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), matB);
  axe.add(axeMesh);
  armR.add(axe);

  const bowTop = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1), matA);
  bowTop.name = 'BowStringTop';
  root.add(bowTop);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.6, 0);
  root.add(head);
  const faceGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  faceGeo.groups = [{ start: 0, count: 30, materialIndex: 0 }, { start: 30, count: 6, materialIndex: 1 }];
  const faceMesh = new THREE.Mesh(faceGeo, arrayMats.slice(0, 2));
  head.add(faceMesh);

  root.userData = { torso, armR, weapon, head };
  return { root, faceMesh, weapon };
}

describe('mergeUnitTemplate', () => {
  it('mescla malhas soltas por pivô (Torso e Weapon), preservando pivôs e caixa envolvente', () => {
    const { root } = buildSyntheticUnit();
    const boxBefore = worldBox(root);
    const before = countMeshes(root);
    mergeUnitTemplate(root);
    const boxAfter = worldBox(root);

    expect(countMeshes(root)).toBeLessThan(before);
    // Torso: 4 malhas soltas (2 matA + 2 matB) -> 2 malhas mescladas. Weapon: 3 malhas matA -> 1.
    expect(root.getObjectByName('Weapon')).toBeTruthy();
    expect(root.getObjectByName('Weapon').children.length).toBe(1);
    const torsoMerged = root.getObjectByName('Torso').children.filter(c => c.name.startsWith('Merged_'));
    expect(torsoMerged.length).toBe(2);

    expect(boxAfter.min.distanceTo(boxBefore.min)).toBeLessThan(1e-4);
    expect(boxAfter.max.distanceTo(boxBefore.max)).toBeLessThan(1e-4);
  });

  it('pivôs conservam position/rotation originais e os nós nomeados continuam existindo', () => {
    const { root } = buildSyntheticUnit();
    const armRBefore = root.getObjectByName('ArmR').position.clone();
    const weaponRotBefore = root.getObjectByName('Weapon').rotation.z;
    mergeUnitTemplate(root);
    expect(root.getObjectByName('ArmR').position.equals(armRBefore)).toBe(true);
    expect(root.getObjectByName('Weapon').rotation.z).toBeCloseTo(weaponRotBefore, 6);
    expect(root.getObjectByName('Weapon')).toBeTruthy();
  });

  it('nó Axe invisível continua existindo e invisível após a mescla', () => {
    const { root } = buildSyntheticUnit();
    mergeUnitTemplate(root);
    const axe = root.getObjectByName('Axe');
    expect(axe).toBeTruthy();
    expect(axe.visible).toBe(false);
  });

  it('BowStringTop nunca é mesclada', () => {
    const { root } = buildSyntheticUnit();
    mergeUnitTemplate(root);
    const bowString = root.getObjectByName('BowStringTop');
    expect(bowString).toBeTruthy();
    expect(bowString.isMesh).toBe(true);
  });

  it('malha com material em array preserva groups e o array de materiais', () => {
    const { root, faceMesh } = buildSyntheticUnit();
    mergeUnitTemplate(root);
    const head = root.getObjectByName('Head');
    const face = head.children.find(c => c.isMesh);
    expect(face).toBe(faceMesh);
    expect(Array.isArray(face.material)).toBe(true);
    expect(face.material.length).toBe(2);
    expect(face.geometry.groups.length).toBe(2);
  });

  it('posição de mundo de um vértice conhecido é idêntica antes/depois', () => {
    const { root, weapon } = buildSyntheticUnit();
    root.updateMatrixWorld(true);
    const knownMesh = weapon.children[0];
    const localVertex = new THREE.Vector3().fromBufferAttribute(knownMesh.geometry.attributes.position, 0);
    const worldBefore = localVertex.clone().applyMatrix4(knownMesh.matrixWorld);

    mergeUnitTemplate(root);
    root.updateMatrixWorld(true);

    const mergedWeaponMesh = root.getObjectByName('Weapon').children[0];
    let closest = Infinity;
    const pos = mergedWeaponMesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mergedWeaponMesh.matrixWorld);
      closest = Math.min(closest, v.distanceTo(worldBefore));
    }
    expect(closest).toBeLessThan(1e-5);
  });
});
