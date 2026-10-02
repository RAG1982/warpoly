import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07a — Refinaria (humana). PROCEDURAL provisório: três tanques cilíndricos de metal com tubulação, uma chaminé com chama
 * de queima e um pequeno píer de descarga voltado para a água (+Z). Origem = centro em terra, y = 0. Nós: `Hose` (mangueira do
 * píer), `Flag` (faixa do time, `TeamColor`). ≤ 20 draw calls.
 * @returns {THREE.Group}
 */
export function createRefinery() {
  const root = new THREE.Group();
  root.name = 'Refinery';
  part(root, B(6.2, 0.3, 5.0), NM.stone, 0, 0.15, -0.6); // base de pedra
  for (const [x, z, r] of [[-1.7, -1.4, 1.1], [0.2, -1.8, 0.9], [1.9, -1.0, 1.0]]) {
    part(root, C(r, r, 2.6, 12), NM.tank, x, 1.6, z);
    part(root, C(r * 0.9, r, 0.35, 12), NM.ironDark, x, 3.05, z);
  }
  part(root, C(0.1, 0.1, 5.6, 5), NM.iron, 0, 2.2, 0.2, 0, 0, Math.PI / 2); // tubulação
  part(root, C(0.1, 0.1, 3.2, 5), NM.iron, 0.6, 1.0, 0.9, Math.PI / 2, 0, 0);
  part(root, C(0.3, 0.45, 4.4, 8), NM.ironDark, -2.7, 2.5, 0.8); // chaminé
  part(root, new THREE.ConeGeometry(0.28, 0.9, 6), NM.glow, -2.7, 5.2, 0.8); // chama
  part(root, B(2.4, 0.2, 3.2), NM.deckWood, 0, 0.12, 3.9); // píer
  for (const x of [-1.1, 1.1]) part(root, C(0.15, 0.17, 1.4, 5), NM.hullDark, x, -0.2, 5.4);
  const hose = part(root, new THREE.TorusGeometry(0.4, 0.07, 5, 10), NM.ironDark, 0.6, 0.5, 3.6, Math.PI / 2);
  hose.name = 'Hose';
  const flag = part(root, B(0.8, 0.5, 0.04), NM.team, 2.9, 3.6, 1.2);
  flag.name = 'Flag';
  part(root, C(0.04, 0.04, 2.0, 4), NM.hullDark, 2.5, 2.9, 1.2);
  return enableShadows(root);
}
