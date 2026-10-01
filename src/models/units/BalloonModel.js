import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-06 — Balão de Guerra (batedor aéreo orc). PROCEDURAL provisório: envelope de couro remendado com faixas,
 * cesta de madeira com braseiro aceso, cordas e um orc vigia (cabeça `Head`). A base do modelo fica em y = 0
 * (a simulação aplica `flyHeight`). Nós: `Torso` (corpo todo, balança), `Head` (vigia), `Rotor` (hélice de popa).
 * ≤ 12 draw calls.
 * @returns {THREE.Group}
 */
export function createWarBalloon() {
  const root = new THREE.Group();
  root.name = 'WarBalloon';
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
  const hide = new THREE.MeshStandardMaterial({ color: 0xa16207, flatShading: true, roughness: 0.8 });
  const fire = new THREE.MeshStandardMaterial({ color: 0xfb923c, emissive: 0xea580c, emissiveIntensity: 1.5, flatShading: true });
  const orcSkin = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, flatShading: true, roughness: 0.6 });

  add(torso, B(1.0, 0.7, 1.0), M.woodDark, 0, 0.45, 0); // cesta
  add(torso, B(1.1, 0.1, 1.1), M.woodMedium, 0, 0.82, 0); // borda
  add(torso, new THREE.IcosahedronGeometry(1.45, 1), hide, 0, 3.4, 0); // envelope
  add(torso, new THREE.TorusGeometry(1.2, 0.09, 4, 10), M.bannerRed, 0, 3.4, 0, Math.PI / 2); // faixa equatorial
  add(torso, new THREE.ConeGeometry(0.4, 0.6, 5), M.steelDark, 0, 4.95, 0); // ponteira de ferro
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    add(torso, new THREE.CylinderGeometry(0.025, 0.025, 1.9, 3), M.steelDark, x, 1.8, z, 0, 0, -x * 0.35); // cordas
  }
  add(torso, new THREE.IcosahedronGeometry(0.2, 0), fire, 0, 1.05, 0); // braseiro
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.05, 0.38);
  torso.add(head);
  add(head, new THREE.SphereGeometry(0.2, 6, 5), orcSkin, 0, 0, 0);
  add(head, new THREE.ConeGeometry(0.05, 0.14, 4), M.logEnd, -0.1, -0.1, 0.16, Math.PI);
  add(head, new THREE.ConeGeometry(0.05, 0.14, 4), M.logEnd, 0.1, -0.1, 0.16, Math.PI);
  const rotor = new THREE.Group();
  rotor.name = 'Rotor';
  rotor.position.set(0, 0.5, -0.65);
  torso.add(rotor);
  add(rotor, B(0.7, 0.07, 0.04), M.woodMedium, 0, 0, 0);
  add(rotor, B(0.07, 0.7, 0.04), M.woodMedium, 0, 0, 0);
  return enableShadows(root);
}
