import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-06 — Serpe de Guerra (ataque aéreo orc). PROCEDURAL provisório: corpo ondulado de 5 segmentos verde-escuros com
 * placas dorsais, cabeça de serpente com presas e olhos âmbar na face frontal (+Z), duas asas de membrana vermelha
 * e cauda com ferrão. A base do modelo fica em y = 0 (a simulação aplica `flyHeight`).
 * Nós: `Torso` (corpo todo), `Head`, `WingL`/`WingR`. ≤ 18 draw calls.
 * @returns {THREE.Group}
 */
export function createWarSerpent() {
  const root = new THREE.Group();
  root.name = 'WarSerpent';
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
  const scale = new THREE.MeshStandardMaterial({ color: 0x14532d, flatShading: true, roughness: 0.55 });
  const scaleLight = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, flatShading: true, roughness: 0.55 });
  const membrane = new THREE.MeshStandardMaterial({ color: 0x9f1239, flatShading: true, roughness: 0.6, side: THREE.DoubleSide });
  const amber = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xb45309, emissiveIntensity: 1.0, flatShading: true });

  const radii = [0.38, 0.45, 0.42, 0.32, 0.2];
  for (let i = 0; i < radii.length; i++) {
    const z = 0.7 - i * 0.62;
    const y = 1.1 + Math.sin(i * 1.4) * 0.18;
    add(torso, new THREE.IcosahedronGeometry(radii[i], 0), i % 2 ? scale : scaleLight, 0, y, z);
    add(torso, new THREE.ConeGeometry(radii[i] * 0.35, 0.3, 4), M.steelDark, 0, y + radii[i] * 0.9, z); // placa dorsal
  }
  add(torso, new THREE.ConeGeometry(0.16, 0.6, 4), M.steelDark, 0, 1.0, -2.0, -Math.PI / 2); // ferrão da cauda
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.3, 1.25);
  torso.add(head);
  add(head, B(0.42, 0.3, 0.6), scaleLight, 0, 0, 0.1);
  add(head, new THREE.ConeGeometry(0.06, 0.2, 4), M.logEnd, -0.12, -0.2, 0.32, Math.PI); // presas
  add(head, new THREE.ConeGeometry(0.06, 0.2, 4), M.logEnd, 0.12, -0.2, 0.32, Math.PI);
  add(head, B(0.1, 0.08, 0.04), amber, -0.14, 0.1, 0.4); // olhos (face frontal)
  add(head, B(0.1, 0.08, 0.04), amber, 0.14, 0.1, 0.4);
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = side < 0 ? 'WingL' : 'WingR';
    wing.position.set(side * 0.35, 1.45, 0.1);
    torso.add(wing);
    add(wing, B(1.9, 0.05, 1.1), membrane, side * 0.95, 0, -0.1);
    add(wing, B(1.9, 0.07, 0.07), M.steelDark, side * 0.95, 0.03, 0.4);
  }
  return enableShadows(root);
}
