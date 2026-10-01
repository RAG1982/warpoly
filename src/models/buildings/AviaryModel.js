import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-06 — Aviário de Grifos (humano). PROCEDURAL provisório: base circular de pedra, torre cilíndrica alta com
 * plataforma de pouso, ninho de palha e poleiros de madeira, estandarte azul. Entrada na frente (+Z).
 * @returns {THREE.Group}
 */
export function createAviary() {
  const g = new THREE.Group();
  g.name = 'Aviary';
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(new THREE.CylinderGeometry(3.4, 3.7, 0.5, 12), M.stoneDark, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(1.7, 2.1, 4.6, 10), M.stoneLight, 0, 2.8, -0.4);
  add(new THREE.CylinderGeometry(2.6, 2.6, 0.35, 12), M.woodDark, 0, 5.2, -0.4); // plataforma de pouso
  add(new THREE.CylinderGeometry(1.1, 1.3, 0.5, 8), M.wheat, 0, 5.6, -0.4); // ninho de palha
  add(new THREE.CylinderGeometry(0.25, 0.3, 4.6, 6), M.woodMedium, 0, 5.4, -0.4); // mastro
  add(new THREE.BoxGeometry(0.1, 0.8, 1.2), M.bannerBlue, 0, 7.5, 0.2);
  add(new THREE.ConeGeometry(0.4, 0.7, 5), M.roofGold, 0, 8.15, -0.4);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.25, 1.8, 0.25), M.woodMedium, s * 2.3, 1.3, 2.0); // poleiros
    add(new THREE.BoxGeometry(1.6, 0.18, 0.18), M.woodDark, s * 2.3, 2.2, 2.0, 0, 0, 0);
  }
  add(new THREE.BoxGeometry(1.3, 1.9, 0.2), M.doorDark, 0, 1.45, 1.65);
  add(new THREE.BoxGeometry(5.4, 0.15, 0.4), M.stone, 0, 0.55, 2.7);
  return enableShadows(g);
}
