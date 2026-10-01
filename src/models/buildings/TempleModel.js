import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-04b — Templo da Luz (humano). Procedural low-poly: base escalonada de pedra clara, 8 colunas em anel, friso,
 * cúpula dourada com lanterna e esfera de luz no topo, portal na frente (+Z). Poucos materiais → poucos draw calls.
 * @returns {THREE.Group}
 */
export function createTemple() {
  const g = new THREE.Group();
  g.name = 'Temple';
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CylinderGeometry(3.6, 3.9, 0.5, 12), M.stoneDark, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(3.2, 3.4, 0.4, 12), M.stoneLight, 0, 0.7, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(new THREE.CylinderGeometry(0.3, 0.34, 3.4, 6), M.stoneLight, Math.cos(a) * 2.6, 2.6, Math.sin(a) * 2.6);
  }
  add(new THREE.CylinderGeometry(3.1, 3.1, 0.45, 12), M.stone, 0, 4.5, 0);
  add(new THREE.CylinderGeometry(2.3, 2.5, 2.2, 12), M.plasterYellow, 0, 3.0, 0);
  add(new THREE.SphereGeometry(2.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.roofGold, 0, 4.7, 0);
  add(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 6), M.roofGold, 0, 7.0, 0);
  const light = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.6, flatShading: true });
  add(new THREE.IcosahedronGeometry(0.42, 0), light, 0, 7.8, 0);
  add(new THREE.BoxGeometry(1.1, 1.7, 0.2), M.doorDark, 0, 1.55, 2.35);
  return enableShadows(g);
}
