import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-06 — Planador de Engenho (batedor aéreo humano). PROCEDURAL provisório (Blender na F7): fuselagem de madeira,
 * duas asas de pano azul com nervuras, leme em cauda e o piloto de capacete. Aponta para +Z. A altura de voo
 * (`flyHeight`) é aplicada pela simulação — o modelo fica com a base em y = 0.
 *
 * Nós nomeados (lidos por `ModelFactory.rebindUserData` / `UnitAnimator`):
 * - `Torso`  grupo inteiro do corpo (balança em y no voo); `Head` cabeça do piloto;
 * - `WingL`/`WingR`  pivôs das asas (balançam em z).
 * ≤ 14 draw calls.
 * @returns {THREE.Group}
 */
export function createGlider() {
  const root = new THREE.Group();
  root.name = 'Glider';
  const torso = new THREE.Group();
  torso.name = 'Torso';
  root.add(torso);

  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  add(torso, B(0.34, 0.3, 1.8), M.woodMedium, 0, 0.55, 0); // fuselagem
  add(torso, new THREE.ConeGeometry(0.17, 0.5, 5), M.woodDark, 0, 0.55, 1.1, Math.PI / 2); // bico
  add(torso, B(0.06, 0.4, 0.5), M.bannerBlue, 0, 0.8, -0.95); // leme vertical
  add(torso, B(0.9, 0.05, 0.36), M.bannerBlue, 0, 0.58, -0.95); // estabilizador
  add(torso, B(0.12, 0.8, 0.12), M.woodDark, 0, 0.9, 0.1, 0, 0, 0); // mastro central
  // piloto
  add(torso, B(0.28, 0.34, 0.24), M.tunicGreen, 0, 0.88, 0.25);
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.18, 0.25);
  torso.add(head);
  add(head, new THREE.SphereGeometry(0.15, 6, 5), M.skin, 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.17, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.steelArmor, 0, 0.03, 0);
  // asas (pivô na raiz, estendem-se para fora)
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'WingL' : 'WingR';
    wing.position.set(side * 0.2, 0.95, 0.1);
    torso.add(wing);
    add(wing, B(2.0, 0.04, 0.9), M.bannerBlue, side * 1.0, 0.0, 0);
    add(wing, B(2.0, 0.07, 0.07), M.woodDark, side * 1.0, 0.03, 0.4); // longarina
    add(wing, B(0.06, 0.05, 0.9), M.woodDark, side * 1.0, 0.03, 0); // nervura
  }
  return enableShadows(root);
}
