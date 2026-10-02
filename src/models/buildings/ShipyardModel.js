import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07a — Estaleiro (humano). PROCEDURAL provisório: galpão de madeira com telhado em duas águas, cais de tábuas voltado para
 * a água (frente = +Z) e o casco de um navio em construção (costelas) ao lado, com guindaste. Origem = centro em terra, y = 0.
 * Nós: `Crane` (guindaste), `Flag` (faixa do time, `TeamColor`). ≤ 20 draw calls.
 * @returns {THREE.Group}
 */
export function createShipyard() {
  const root = new THREE.Group();
  root.name = 'Shipyard';
  part(root, B(5.0, 2.2, 3.4), NM.plank, -0.8, 1.1, -1.4); // galpão
  const roof = part(root, new THREE.CylinderGeometry(0.01, 2.9, 1.3, 4, 1), NM.hullDark, -0.8, 2.85, -1.4, 0, Math.PI / 4, 0); // telhado
  roof.scale.set(1.2, 1, 0.78);
  part(root, B(1.1, 1.5, 0.12), NM.hullDark, -0.8, 0.8, 0.33); // portão
  part(root, B(7.2, 0.28, 2.6), NM.deckWood, 0, 0.14, 3.6); // cais
  for (const [x, z] of [[-3.3, 4.8], [3.3, 4.8], [-3.3, 2.4], [3.3, 2.4]]) part(root, C(0.18, 0.2, 1.6, 6), NM.hullDark, x, -0.2, z); // estacas
  part(root, B(0.5, 0.5, 0.5), NM.hullWood, 3.0, 0.5, 4.5); // caixote
  // casco em construção (costelas) ao lado do galpão
  part(root, B(1.0, 0.18, 4.6), NM.hullDark, 3.2, 0.4, -0.6); // quilha
  for (let i = 0; i < 5; i++) {
    const z = -2.4 + i * 1.0;
    part(root, B(0.12, 1.3, 0.12), NM.hullWood, 2.7, 1.0, z, 0, 0, -0.5);
    part(root, B(0.12, 1.3, 0.12), NM.hullWood, 3.7, 1.0, z, 0, 0, 0.5);
  }
  const crane = new THREE.Group();
  crane.name = 'Crane';
  crane.position.set(-3.8, 0, 0.4);
  root.add(crane);
  part(crane, C(0.12, 0.16, 3.6, 5), NM.hullDark, 0, 1.8, 0);
  part(crane, B(0.1, 0.1, 2.4), NM.hullDark, 0, 3.5, 1.0);
  part(crane, C(0.02, 0.02, 1.2, 3), NM.rope, 0, 2.9, 2.0);
  const flag = part(root, B(0.9, 0.55, 0.04), NM.team, -2.6, 4.0, -1.4); // faixa do time
  flag.name = 'Flag';
  part(root, C(0.05, 0.05, 2.4, 4), NM.hullDark, -3.05, 3.2, -1.4);
  return enableShadows(root);
}
