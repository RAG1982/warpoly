import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-06 — Cavaleiro Grifo (ataque aéreo humano). PROCEDURAL provisório: corpo de leão (dourado), cabeça de águia
 * branca com bico, duas asas de penas e um cavaleiro de armadura azul com elmo. Aponta para +Z. A base do modelo fica
 * em y = 0 (a simulação aplica `flyHeight`). Nós: `Torso` (corpo todo), `Head` (cabeça do grifo), `WingL`/`WingR`.
 * ≤ 18 draw calls.
 * @returns {THREE.Group}
 */
export function createGryphonRider() {
  const root = new THREE.Group();
  root.name = 'GryphonRider';
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
  const fur = new THREE.MeshStandardMaterial({ color: 0xc08a3e, flatShading: true, roughness: 0.7 });
  const feather = new THREE.MeshStandardMaterial({ color: 0xf5f0e1, flatShading: true, roughness: 0.6 });
  const beak = new THREE.MeshStandardMaterial({ color: 0xfacc15, flatShading: true, roughness: 0.5 });

  add(torso, new THREE.IcosahedronGeometry(0.62, 0), fur, 0, 0.9, -0.1).scale.set(0.8, 0.75, 1.5); // tronco
  add(torso, new THREE.CylinderGeometry(0.1, 0.22, 0.7, 5), fur, 0, 1.1, 0.7, 0.5); // pescoço
  add(torso, B(0.16, 0.5, 0.16), fur, -0.22, 0.4, 0.25); // patas dianteiras (garras)
  add(torso, B(0.16, 0.5, 0.16), fur, 0.22, 0.4, 0.25);
  add(torso, B(0.18, 0.5, 0.18), fur, -0.22, 0.4, -0.65);
  add(torso, B(0.18, 0.5, 0.18), fur, 0.22, 0.4, -0.65);
  add(torso, new THREE.ConeGeometry(0.12, 0.8, 4), fur, 0, 0.85, -1.35, -Math.PI / 2 - 0.3); // cauda
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.4, 1.0);
  torso.add(head);
  add(head, new THREE.SphereGeometry(0.26, 6, 5), feather, 0, 0, 0);
  add(head, new THREE.ConeGeometry(0.12, 0.4, 4), beak, 0, -0.04, 0.34, Math.PI / 2); // bico (+Z)
  // cavaleiro
  add(torso, B(0.34, 0.5, 0.28), M.bannerBlue, 0, 1.55, -0.1);
  add(torso, new THREE.SphereGeometry(0.17, 6, 5), M.steelArmor, 0, 1.97, -0.1);
  add(torso, B(0.05, 1.3, 0.05), M.woodDark, 0.3, 1.7, 0.25, 0.25); // lança
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'WingL' : 'WingR';
    wing.position.set(side * 0.35, 1.05, -0.1);
    torso.add(wing);
    add(wing, B(1.7, 0.06, 0.9), feather, side * 0.85, 0.0, 0);
    add(wing, B(1.2, 0.05, 0.6), fur, side * 1.3, 0.0, -0.45);
  }
  return enableShadows(root);
}
