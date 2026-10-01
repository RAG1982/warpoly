import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-04b — Altar das Tempestades (orc). Procedural low-poly: plataforma de pedra escura, altar central com
 * esferas de relâmpago estáticas, quatro totens com chifres, estandarte vermelho. Poucos materiais.
 * @returns {THREE.Group}
 */
export function createStormAltar() {
  const g = new THREE.Group();
  g.name = 'StormAltar';
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b33, flatShading: true, roughness: 0.9 });
  const bolt = new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x60a5fa, emissiveIntensity: 1.8, flatShading: true });
  add(new THREE.CylinderGeometry(3.5, 3.8, 0.6, 7), dark, 0, 0.3, 0);
  add(new THREE.CylinderGeometry(2.4, 2.7, 0.5, 7), M.stoneDark, 0, 0.85, 0);
  add(new THREE.BoxGeometry(1.8, 1.0, 1.1), M.stone, 0, 1.6, 0);
  add(new THREE.IcosahedronGeometry(0.5, 0), bolt, 0, 3.0, 0);
  add(new THREE.ConeGeometry(0.16, 1.8, 4), bolt, 0, 4.2, 0);
  for (const [x, z] of [[-2.5, -2.2], [2.5, -2.2], [-2.5, 2.2], [2.5, 2.2]]) {
    add(new THREE.CylinderGeometry(0.28, 0.36, 3.6, 5), M.woodDark, x, 2.4, z);
    add(new THREE.BoxGeometry(0.7, 0.7, 0.7), M.stoneLight, x, 4.5, z);
    add(new THREE.ConeGeometry(0.14, 0.8, 4), M.logEnd, x - 0.45, 4.8, z).rotation.z = 0.7;
    add(new THREE.ConeGeometry(0.14, 0.8, 4), M.logEnd, x + 0.45, 4.8, z).rotation.z = -0.7;
    add(new THREE.OctahedronGeometry(0.22, 0), bolt, x, 5.2, z);
  }
  add(new THREE.BoxGeometry(0.1, 3.4, 0.1), M.woodDark, 0, 2.5, 3.4);
  add(new THREE.BoxGeometry(0.06, 1.3, 0.8), M.bannerRed, 0, 3.2, 3.8);
  return enableShadows(g);
}
