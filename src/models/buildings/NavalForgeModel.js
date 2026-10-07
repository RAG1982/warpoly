import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07b — Fornalha Naval (orc, a "Fundição" dos Clãs). PROCEDURAL: forja de ferro negro com crânio de besta na entrada, duas
 * chaminés em brasa, correntes e âncoras de ferro, e um guindaste de ossos sobre o píer voltado para a água (+Z). Nós:
 * `Anim_Smoke`, `Anim_Crane`, `Flag` (`TeamColor`). ≤ 18 draw calls.
 * @returns {THREE.Group}
 */
export function createNavalForge() {
  const root = new THREE.Group();
  root.name = 'NavalForge';
  part(root, C(3.4, 3.7, 0.4, 8), NM.ironOrc, 0, 0.2, -0.5); // base
  part(root, B(4.4, 2.6, 3.2), NM.ironOrc, 0, 1.6, -1.2); // casco da forja
  part(root, B(4.8, 0.3, 3.6), NM.ironDark, 0, 3.05, -1.2); // teto
  for (const x of [-1.5, 1.5]) {
    part(root, C(0.42, 0.6, 3.8, 6), NM.ironDark, x, 3.8, -1.6); // chaminés
    part(root, new THREE.ConeGeometry(0.34, 0.9, 5), NM.glow, x, 5.9, -1.6); // brasa
  }
  const smoke = new THREE.Object3D();
  smoke.name = 'Anim_Smoke';
  smoke.position.set(-1.5, 6.6, -1.6);
  root.add(smoke);
  part(root, B(1.8, 1.4, 0.3), NM.glow, 0, 1.1, 0.5); // boca incandescente
  part(root, new THREE.SphereGeometry(0.55, 7, 5), NM.bone, 0, 2.5, 0.65); // crânio
  for (const x of [-2.6, 2.6]) part(root, C(0.1, 0.14, 2.4, 5), NM.bone, x, 1.2, 0.9); // presas
  part(root, B(2.4, 0.22, 3.0), NM.hullWood, 1.2, 0.12, 3.9); // píer
  for (const x of [0.2, 2.2]) part(root, C(0.16, 0.18, 1.4, 5), NM.bone, x, -0.2, 5.3);
  part(root, new THREE.TorusGeometry(0.5, 0.1, 5, 8), NM.iron, -2.2, 0.7, 2.6, Math.PI / 2); // âncora
  const crane = new THREE.Group();
  crane.name = 'Anim_Crane';
  crane.position.set(1.2, 0.3, 3.4);
  root.add(crane);
  part(crane, C(0.13, 0.18, 3.0, 5), NM.bone, 0, 1.5, 0);
  part(crane, B(0.12, 0.12, 2.4), NM.bone, 0, 3.0, 1.1);
  part(crane, B(0.06, 0.7, 0.06), NM.iron, 0, 2.6, 2.1);
  const flag = part(root, B(0.9, 0.65, 0.04), NM.team, 2.9, 4.2, -0.8);
  flag.name = 'Flag';
  part(root, C(0.05, 0.05, 2.6, 4), NM.hullDark, 2.5, 3.3, -0.8);
  return enableShadows(root);
}
