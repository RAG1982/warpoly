import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';
import { createSuicideBody } from './SapperModel.js';

/**
 * F4-04 — Esqueleto (invocado por Erguer Mortos). Procedural simples: ossos claros, espada enferrujada
 * (`Weapon`). Mesma rig humanoide plana. Rosto só em +Z. ≤ 10 draw calls.
 */
export function createSkeleton() {
  const bone = new THREE.MeshStandardMaterial({ color: 0xe5e0cf, flatShading: true, roughness: 0.8 });
  const { root } = createSuicideBody({ name: 'Skeleton', skin: bone, tunic: bone, pants: bone, hat: bone, strap: M.woodDark });
  const sword = new THREE.Group();
  sword.name = 'Weapon';
  sword.position.set(0.4, 0.75, 0.25);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.03), M.steelDark);
  blade.position.set(0, 0.35, 0);
  sword.add(blade);
  root.add(sword);
  enableShadows(root);
  return root;
}
