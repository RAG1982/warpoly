import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-04 — Torre Arcana (humano). Procedural low-poly: base de pedra, fuste esguio, anéis dourados,
 * telhado cônico azul e cristal azul flutuante acima do topo. Poucos materiais → poucos draw calls.
 * @returns {THREE.Group}
 */
export function createArcaneTower() {
  const g = new THREE.Group();
  g.name = 'ArcaneTower';
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CylinderGeometry(3.0, 3.3, 0.6, 8), M.stoneDark, 0, 0.3, 0);
  add(new THREE.CylinderGeometry(1.7, 2.3, 5.2, 8), M.stone, 0, 3.2, 0);
  add(new THREE.CylinderGeometry(2.1, 1.8, 0.5, 8), M.stoneLight, 0, 5.9, 0);
  for (const y of [1.6, 3.6]) add(new THREE.TorusGeometry(1.95 - y * 0.08, 0.1, 4, 12), M.roofGold, 0, y, 0).rotation.x = Math.PI / 2;
  add(new THREE.ConeGeometry(2.0, 2.4, 8), M.roofBlue, 0, 7.3, 0);
  add(new THREE.BoxGeometry(0.9, 1.3, 0.2), M.doorDark, 0, 1.2, 2.25);
  add(new THREE.BoxGeometry(0.4, 0.9, 0.2), M.windowDark, 0, 4.2, 1.75);
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.5, flatShading: true });
  add(new THREE.OctahedronGeometry(0.55, 0), crystalMat, 0, 9.0, 0);
  return enableShadows(g);
}
