import * as THREE from 'three';
import { NM } from '../naval/navalMaterials.js';

/**
 * F4-07a — Poço de petróleo no mar (jazida `oil`): mancha escura e brilhante sobre a água, com algumas bolhas de óleo.
 * Origem = nível da água (y = 0). ≤ 2 draw calls (mancha + bolhas mescladas em instâncias de 1 material).
 * @returns {THREE.Group}
 */
export function createOilWell() {
  const root = new THREE.Group();
  root.name = 'OilWell';
  const slick = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), NM.slick);
  slick.rotation.x = -Math.PI / 2;
  slick.position.y = 0.04;
  slick.renderOrder = 2;
  root.add(slick);
  const blobs = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), NM.slick);
  blobs.rotation.x = -Math.PI / 2;
  blobs.position.set(1.6, 0.05, -1.4);
  blobs.renderOrder = 2;
  root.add(blobs);
  return root;
}
