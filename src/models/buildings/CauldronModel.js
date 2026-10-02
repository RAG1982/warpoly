import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07a — Caldeirão de Óleo (orc, a "Refinaria" dos Clãs). PROCEDURAL provisório: um caldeirão de ferro negro sobre tripé com
 * óleo fervente e fogo embaixo, totens de osso e um píer de toras voltado para a água (+Z). Nós: `Hose` (calha do píer),
 * `Flag` (estandarte do clã, `TeamColor`). ≤ 20 draw calls.
 * @returns {THREE.Group}
 */
export function createCauldron() {
  const root = new THREE.Group();
  root.name = 'AshCauldron';
  part(root, C(3.4, 3.7, 0.4, 10), NM.ironOrc, 0, 0.2, -0.6); // base de pedra negra
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    part(root, C(0.18, 0.28, 2.4, 5), NM.ironDark, Math.sin(a) * 1.6, 1.4, -0.6 + Math.cos(a) * 1.6, Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); // pernas do tripé
  }
  part(root, new THREE.SphereGeometry(1.9, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), NM.ironOrc, 0, 3.0, -0.6); // bojo
  part(root, new THREE.TorusGeometry(1.9, 0.14, 5, 14), NM.iron, 0, 3.0, -0.6, Math.PI / 2); // borda
  part(root, new THREE.CircleGeometry(1.78, 12), NM.oil, 0, 3.02, -0.6, -Math.PI / 2); // óleo fervente
  part(root, new THREE.ConeGeometry(0.5, 1.4, 6), NM.glow, 0, 0.9, -0.6); // fogo
  for (const x of [-3.0, 3.0]) {
    part(root, C(0.14, 0.18, 3.0, 5), NM.bone, x, 1.5, -1.6);
    part(root, new THREE.SphereGeometry(0.34, 6, 5), NM.bone, x, 3.2, -1.6); // crânio
  }
  part(root, B(2.4, 0.22, 3.2), NM.hullWood, 0, 0.12, 3.9); // píer
  for (const x of [-1.1, 1.1]) part(root, C(0.16, 0.18, 1.4, 5), NM.bone, x, -0.2, 5.4);
  const hose = part(root, B(0.3, 0.2, 2.2), NM.ironDark, 0, 0.5, 2.4); // calha
  hose.name = 'Hose';
  const flag = part(root, B(0.9, 0.65, 0.04), NM.team, 2.9, 4.4, 1.4);
  flag.name = 'Flag';
  part(root, C(0.05, 0.05, 2.6, 4), NM.hullDark, 2.45, 3.4, 1.4);
  return enableShadows(root);
}
