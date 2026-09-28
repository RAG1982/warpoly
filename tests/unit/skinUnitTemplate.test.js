import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { skinUnitTemplate } from '../../src/render/skinUnitTemplate.js';

const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
// Materiais próprios (não reaproveitam matA/matB) para o teste de material em array: 6 materiais.
const arrayMats = Array.from({ length: 6 }, (_, i) => new THREE.MeshStandardMaterial({ color: 0x100000 * (i + 1) }));

/**
 * raiz (Unit) → Torso → (4 malhas soltas, 2 matA + 2 matB) → ArmR → (Axe invisível, toggle)
 *                              → Weapon (3 malhas matA)
 *              → Head (malha com 6 materiais em array, 1 grupo de 2 triângulos por material)
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
  armR.rotation.z = 0.1;
  torso.add(armR);

  const weapon = new THREE.Group();
  weapon.name = 'Weapon';
  weapon.position.set(0, -0.3, 0);
  weapon.rotation.x = 0.2;
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

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.6, 0);
  root.add(head);
  const faceGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3); // 36 índices (12 triângulos, 6 faces)
  faceGeo.groups = Array.from({ length: 6 }, (_, i) => ({ start: i * 6, count: 6, materialIndex: i }));
  const faceMesh = new THREE.Mesh(faceGeo, arrayMats);
  head.add(faceMesh);

  root.userData = { torso, armR, weapon, head };
  return { root, faceMesh, weapon, armR, torso, axe };
}

function findSkinned(root, material) {
  let found = null;
  root.traverse(n => {
    if (!found && n.isSkinnedMesh && n.material === material) found = n;
  });
  return found;
}

describe('skinUnitTemplate', () => {
  it('malhas soltas (Torso+Weapon, mesmo material) viram 2 SkinnedMesh; skeleton.bones inclui Torso/ArmR/Weapon', () => {
    const { root } = buildSyntheticUnit();
    skinUnitTemplate(root);

    const skinned = [];
    root.traverse(n => { if (n.isSkinnedMesh) skinned.push(n); });
    // matA (Torso 2 peças + Weapon 3 peças) e matB (Torso 2 peças) -> 2 SkinnedMesh (a malha da
    // cabeça, com 6 materiais próprios, soma mais 6 -- filtra pelas duas do corpo).
    const bodySkinned = skinned.filter(n => n.material === matA || n.material === matB);
    expect(bodySkinned.length).toBe(2);

    const names = bodySkinned[0].skeleton.bones.map(b => b.name);
    expect(names).toContain('Torso');
    expect(names).toContain('ArmR');
    expect(names).toContain('Weapon');
  });

  it('rotação do ArmR: vértice skinado bate com a posição não-skinada equivalente (tolerância 1e-4)', () => {
    const { root: rootA, weapon: weaponA } = buildSyntheticUnit();
    const { root: rootB, weapon: weaponB } = buildSyntheticUnit(); // referência nunca skinada

    rootA.updateMatrixWorld(true);
    const knownMesh = weaponA.children[0]; // malha da "mão"/arma, filha de Weapon (que é filho de ArmR)
    const localVertex = new THREE.Vector3().fromBufferAttribute(knownMesh.geometry.attributes.position, 0);
    const bakedRefPos = localVertex.clone().applyMatrix4(knownMesh.matrixWorld);

    skinUnitTemplate(rootA);

    // Acha o vértice mais próximo (mesma posição assada) na SkinnedMesh de matA.
    const targetMesh = findSkinned(rootA, matA);
    expect(targetMesh).toBeTruthy();
    const pos = targetMesh.geometry.attributes.position;
    let closest = Infinity;
    let closestIdx = -1;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.distanceTo(bakedRefPos);
      if (d < closest) { closest = d; closestIdx = i; }
    }
    expect(closest).toBeLessThan(1e-5);

    rootA.getObjectByName('ArmR').rotation.z = Math.PI / 2;
    rootB.getObjectByName('ArmR').rotation.z = Math.PI / 2;
    rootA.updateMatrixWorld(true);
    rootB.updateMatrixWorld(true);

    const expectedWorld = localVertex.clone().applyMatrix4(weaponB.children[0].matrixWorld);

    const skinLocal = new THREE.Vector3().fromBufferAttribute(targetMesh.geometry.attributes.position, closestIdx);
    targetMesh.applyBoneTransform(closestIdx, skinLocal);
    const actualWorld = skinLocal.applyMatrix4(targetMesh.matrixWorld);

    expect(actualWorld.distanceTo(expectedWorld)).toBeLessThan(1e-4);
  });

  it('nó Axe (toggle) permanece Mesh normal (não SkinnedMesh) e continua alternando visible', () => {
    const { root } = buildSyntheticUnit();
    skinUnitTemplate(root);

    const axeNode = root.getObjectByName('Axe');
    expect(axeNode).toBeTruthy();
    expect(axeNode.visible).toBe(false);

    const axeMesh = axeNode.children.find(c => c.isMesh);
    expect(axeMesh).toBeTruthy();
    expect(axeMesh.isSkinnedMesh).toBeFalsy();

    axeNode.visible = true;
    expect(axeNode.visible).toBe(true);
  });

  it('clone via SkeletonUtils.clone (caminho do ModelFactory): girar o osso do clone move o clone e não o template', () => {
    const { root } = buildSyntheticUnit();
    skinUnitTemplate(root);
    root.updateMatrixWorld(true);

    const clone = skeletonClone(root);
    clone.updateMatrixWorld(true);

    const templateMesh = findSkinned(root, matA);
    const cloneMesh = findSkinned(clone, matA);
    expect(cloneMesh).toBeTruthy();
    expect(cloneMesh.skeleton).not.toBe(templateMesh.skeleton);
    expect(cloneMesh.skeleton.bones[0]).not.toBe(templateMesh.skeleton.bones[0]);

    // Precisa de um vértice cujo osso seja Weapon/ArmR (não Torso), para que a rotação do ArmR o afete.
    const weaponBoneIdx = templateMesh.skeleton.bones.findIndex(b => b.name === 'Weapon');
    const skinIndexAttr = templateMesh.geometry.attributes.skinIndex;
    let idx = -1;
    for (let i = 0; i < skinIndexAttr.count; i++) {
      if (skinIndexAttr.getX(i) === weaponBoneIdx) { idx = i; break; }
    }
    expect(idx).toBeGreaterThanOrEqual(0);

    const templateBefore = new THREE.Vector3().fromBufferAttribute(templateMesh.geometry.attributes.position, idx);
    templateMesh.applyBoneTransform(idx, templateBefore);
    templateBefore.applyMatrix4(templateMesh.matrixWorld);

    // Gira só o osso do CLONE.
    clone.getObjectByName('ArmR').rotation.z = Math.PI / 2;
    clone.updateMatrixWorld(true);
    root.updateMatrixWorld(true);

    const templateAfter = new THREE.Vector3().fromBufferAttribute(templateMesh.geometry.attributes.position, idx);
    templateMesh.applyBoneTransform(idx, templateAfter);
    templateAfter.applyMatrix4(templateMesh.matrixWorld);
    expect(templateAfter.distanceTo(templateBefore)).toBeLessThan(1e-6); // template não mudou

    const cloneAfter = new THREE.Vector3().fromBufferAttribute(cloneMesh.geometry.attributes.position, idx);
    cloneMesh.applyBoneTransform(idx, cloneAfter);
    cloneAfter.applyMatrix4(cloneMesh.matrixWorld);
    expect(cloneAfter.distanceTo(templateBefore)).toBeGreaterThan(0.05); // clone moveu
  });

  it('malha com material em array (6 materiais): triângulos separados por material, sem mistura entre grupos', () => {
    const { root, faceMesh } = buildSyntheticUnit();
    const totalIndicesBefore = faceMesh.geometry.index ? faceMesh.geometry.index.count : faceMesh.geometry.attributes.position.count;
    expect(totalIndicesBefore).toBe(36);

    skinUnitTemplate(root);

    let totalAfter = 0;
    for (const mat of arrayMats) {
      const mesh = findSkinned(root, mat);
      expect(mesh).toBeTruthy();
      expect(mesh.geometry.index.count).toBe(6); // 1 grupo de 2 triângulos por material
      totalAfter += mesh.geometry.index.count;
    }
    expect(totalAfter).toBe(totalIndicesBefore);

    // A malha original (material em array) não continua solta em Head.
    const head = root.getObjectByName('Head');
    expect(head.children.some(c => c.isMesh && !c.isSkinnedMesh)).toBe(false);
  });
});
