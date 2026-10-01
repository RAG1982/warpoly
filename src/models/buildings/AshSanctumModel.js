import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-04 — Santuário das Cinzas (orc). Procedural low-poly: plataforma de basalto, quatro pilares com
 * espetos e crânios, braseiro central com chama verde-ácido e estandarte vermelho.
 * @returns {THREE.Group}
 */
export function createAshSanctum() {
  const g = new THREE.Group();
  g.name = 'AshSanctum';
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const dark = new THREE.MeshStandardMaterial({ color: 0x26262c, flatShading: true, roughness: 0.9 });
  add(new THREE.CylinderGeometry(3.3, 3.5, 0.7, 6), dark, 0, 0.35, 0);
  add(new THREE.CylinderGeometry(2.6, 2.8, 0.4, 6), M.stoneDark, 0, 0.9, 0);
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    add(new THREE.BoxGeometry(0.7, 4.2, 0.7), dark, x, 3.1, z);
    add(new THREE.ConeGeometry(0.45, 1.2, 4), M.steelDark, x, 5.8, z);
    add(new THREE.BoxGeometry(0.35, 0.35, 0.35), M.featherWhite, x, 2.2, z + (z > 0 ? 0.4 : -0.4));
  }
  add(new THREE.CylinderGeometry(1.0, 0.7, 0.9, 6), M.woodDark, 0, 1.6, 0);
  const fire = new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0x65a30d, emissiveIntensity: 1.6, flatShading: true });
  add(new THREE.ConeGeometry(0.7, 2.2, 5), fire, 0, 3.1, 0);
  add(new THREE.BoxGeometry(0.1, 3.4, 0.1), M.woodDark, 3.4, 2.5, 3.2);
  add(new THREE.BoxGeometry(0.06, 1.3, 0.8), M.bannerRed, 3.4, 3.2, 3.6);
  return enableShadows(g);
}
