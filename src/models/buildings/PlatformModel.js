import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07a — Plataforma de Petróleo (construída sobre o poço, no mar). PROCEDURAL provisório. Quatro pernas de madeira/ferro
 * afundam no mar, convés quadrado com uma torre de perfuração, tanque e sinaleiro/faixa na cor do time. Origem = nível da
 * água (y = 0); as pernas descem até y = −3. Nós: `Derrick` (torre), `Flag` (faixa do time, `TeamColor`). ≤ 12 draw calls.
 * @returns {THREE.Group}
 */
export function createPlatform() {
  const root = new THREE.Group();
  root.name = 'OilPlatform';
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) part(root, C(0.22, 0.28, 6.0, 6), NM.hullDark, x, -0.2, z); // pernas
  part(root, B(0.1, 0.1, 3.4), NM.hullWood, 1.5, 0.9, 0); // travessas
  part(root, B(0.1, 0.1, 3.4), NM.hullWood, -1.5, 0.9, 0);
  part(root, B(4.0, 0.35, 4.0), NM.deckWood, 0, 2.5, 0); // convés
  part(root, B(4.2, 0.12, 4.2), NM.hullDark, 0, 2.3, 0);
  const derrick = new THREE.Group();
  derrick.name = 'Derrick';
  root.add(derrick);
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    part(derrick, C(0.05, 0.05, 4.2, 4), NM.iron, x * 1.2, 4.7, z * 1.2, 0, 0, x * 0.18).rotation.x = -z * 0.18;
  }
  part(derrick, B(1.0, 0.12, 1.0), NM.iron, 0, 6.0, 0);
  part(derrick, C(0.1, 0.1, 5.0, 5), NM.ironDark, 0, 5.0, 0); // broca
  part(root, C(0.55, 0.55, 1.0, 10), NM.tank, -1.2, 3.2, 1.0); // tanque
  part(root, B(1.0, 0.8, 0.9), NM.hullDark, 1.2, 3.0, -1.0); // casinha
  const flag = part(root, B(0.9, 0.5, 0.04), NM.team, 0.5, 4.2, 1.7); // faixa do time
  flag.name = 'Flag';
  part(root, C(0.04, 0.04, 1.9, 4), NM.hullDark, 0.05, 3.5, 1.7);
  return enableShadows(root);
}
