import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07b — Fundição (humana). PROCEDURAL: oficina de pedra com fornalha e chaminé fumegante, bigorna, estaleiro de âncoras e
 * um guindaste sobre o píer voltado para a água (+Z). Origem = centro em terra, y = 0. Nós: `Anim_Smoke` (fumaça da chaminé),
 * `Anim_Crane` (guindaste), `Flag` (faixa do time, `TeamColor`). ≤ 18 draw calls.
 * @returns {THREE.Group}
 */
export function createFoundry() {
  const root = new THREE.Group();
  root.name = 'Foundry';
  part(root, B(6.0, 0.3, 5.2), NM.stone, 0, 0.15, -0.5); // base
  part(root, B(4.6, 2.4, 3.4), NM.hullWood, 0, 1.5, -1.2); // oficina
  part(root, B(5.0, 0.3, 3.8), NM.hullDark, 0, 2.85, -1.2); // telhado
  part(root, new THREE.ConeGeometry(2.9, 1.1, 4), NM.hullDark, 0, 3.6, -1.2, 0, Math.PI / 4, 0); // cumeeira
  part(root, B(1.6, 1.6, 1.4), NM.stone, -1.9, 1.1, 1.0); // fornalha
  part(root, B(1.0, 0.8, 0.1), NM.glow, -1.9, 0.9, 1.72); // boca da fornalha
  part(root, C(0.4, 0.55, 3.6, 8), NM.stone, -1.9, 3.1, 1.0); // chaminé
  const smoke = new THREE.Object3D();
  smoke.name = 'Anim_Smoke';
  smoke.position.set(-1.9, 5.1, 1.0);
  root.add(smoke);
  part(root, B(0.9, 0.5, 0.5), NM.ironDark, 1.2, 0.55, 1.4); // bigorna
  part(root, C(0.18, 0.22, 0.4, 6), NM.ironDark, 1.2, 0.25, 1.4);
  part(root, B(2.6, 0.22, 3.0), NM.deckWood, 1.3, 0.12, 3.9); // píer
  for (const x of [0.3, 2.3]) part(root, C(0.15, 0.17, 1.4, 5), NM.hullDark, x, -0.2, 5.3);
  const crane = new THREE.Group();
  crane.name = 'Anim_Crane';
  crane.position.set(1.3, 0.3, 3.4);
  root.add(crane);
  part(crane, C(0.12, 0.16, 3.0, 5), NM.hullDark, 0, 1.5, 0);
  part(crane, B(0.12, 0.12, 2.4), NM.hullDark, 0, 3.0, 1.1);
  part(crane, B(0.06, 0.7, 0.06), NM.rope, 0, 2.6, 2.1);
  const flag = part(root, B(0.9, 0.6, 0.04), NM.team, 2.6, 3.8, -0.8);
  flag.name = 'Flag';
  part(root, C(0.05, 0.05, 2.4, 4), NM.hullDark, 2.2, 2.9, -0.8);
  return enableShadows(root);
}
