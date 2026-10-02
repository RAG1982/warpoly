import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07a — Doca do Clã (orc). PROCEDURAL provisório: cais de ossos e ferro negro, galpão tosco de peles/toras com presas, o
 * casco de uma galé em construção e um guindaste de correntes. Frente = +Z (água). Nós: `Crane`, `Flag` (`TeamColor`).
 * ≤ 20 draw calls.
 * @returns {THREE.Group}
 */
export function createShipDock() {
  const root = new THREE.Group();
  root.name = 'ShipDock';
  part(root, B(4.8, 2.0, 3.2), NM.hullDark, -0.8, 1.0, -1.4); // galpão de toras escuras
  const roof = part(root, new THREE.CylinderGeometry(0.01, 2.8, 1.5, 4, 1), NM.ironOrc, -0.8, 2.7, -1.4, 0, Math.PI / 4, 0);
  roof.scale.set(1.2, 1, 0.78);
  for (const x of [-2.6, 1.0]) part(root, new THREE.ConeGeometry(0.22, 1.1, 5), NM.bone, x, 3.4, -2.8, -0.35); // presas
  part(root, B(1.2, 1.4, 0.12), NM.ironDark, -0.8, 0.75, 0.33); // portão de ferro
  part(root, B(7.2, 0.3, 2.6), NM.hullWood, 0, 0.15, 3.6); // cais
  for (const [x, z] of [[-3.3, 4.8], [3.3, 4.8], [-3.3, 2.4], [3.3, 2.4]]) part(root, C(0.2, 0.22, 1.7, 5), NM.bone, x, -0.2, z); // estacas de osso
  part(root, B(1.0, 0.2, 4.6), NM.ironDark, 3.2, 0.4, -0.6); // quilha
  for (let i = 0; i < 5; i++) {
    const z = -2.4 + i * 1.0;
    part(root, new THREE.ConeGeometry(0.1, 1.5, 4), NM.bone, 2.7, 1.1, z, 0, 0, -0.5); // costelas de osso
    part(root, new THREE.ConeGeometry(0.1, 1.5, 4), NM.bone, 3.7, 1.1, z, 0, 0, 0.5);
  }
  const crane = new THREE.Group();
  crane.name = 'Crane';
  crane.position.set(-3.8, 0, 0.4);
  root.add(crane);
  part(crane, C(0.14, 0.18, 3.6, 5), NM.ironDark, 0, 1.8, 0);
  part(crane, B(0.12, 0.12, 2.4), NM.ironDark, 0, 3.5, 1.0);
  part(crane, C(0.03, 0.03, 1.2, 3), NM.iron, 0, 2.9, 2.0); // corrente
  const flag = part(root, B(0.9, 0.6, 0.04), NM.team, -2.6, 3.9, -1.4);
  flag.name = 'Flag';
  part(root, C(0.05, 0.05, 2.3, 4), NM.ironDark, -3.05, 3.1, -1.4);
  return enableShadows(root);
}
