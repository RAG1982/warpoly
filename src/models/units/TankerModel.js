import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07a — Petroleiro (naval; o MESMO tipo para as duas facções). PROCEDURAL provisório (Blender: F7). Casco tosco
 * de tábuas com dois tanques horizontais, cabine, mastro com vela/faixa na cor do time e uma mangueira enrolada.
 * Aponta para +Z, base na linha d'água (y = 0).
 *
 * Nós nomeados (para o encaixe do .glb e o `UnitAnimator`): `Hull` (balança/inclina nas ondas), `Flag` (faixa/vela
 * do time — material `TeamColor`), `Hose` (mangueira de carga). ≤ 14 draw calls.
 * @returns {THREE.Group}
 */
export function createTanker() {
  const root = new THREE.Group();
  root.name = 'Tanker';
  const hull = new THREE.Group();
  hull.name = 'Hull';
  root.add(hull);

  part(hull, B(0.95, 0.5, 2.1), NM.hullWood, 0, 0.0, -0.1); // casco
  part(hull, new THREE.ConeGeometry(0.67, 0.9, 4), NM.hullWood, 0, 0.0, 1.45, Math.PI / 2, Math.PI / 4, 0).scale.set(1, 1, 0.55); // proa
  part(hull, B(0.85, 0.06, 2.0), NM.deckWood, 0, 0.27, -0.1); // convés
  part(hull, B(1.0, 0.1, 0.12), NM.hullDark, 0, 0.2, 0.6); // cinta
  part(hull, B(1.0, 0.1, 0.12), NM.hullDark, 0, 0.2, -0.8);
  for (const z of [0.35, -0.55]) part(hull, C(0.26, 0.26, 0.9, 10), NM.tank, 0, 0.58, z, 0, 0, Math.PI / 2); // tanques (horizontais)
  part(hull, B(0.6, 0.55, 0.5), NM.hullDark, 0, 0.58, -1.0); // cabine
  part(hull, B(0.7, 0.07, 0.6), NM.deckWood, 0, 0.88, -1.0); // teto
  const mast = part(hull, C(0.04, 0.05, 1.9, 5), NM.hullDark, 0, 1.15, 0.9); // mastro
  mast.name = 'Mast';
  const flag = part(hull, B(0.62, 0.5, 0.03), NM.team, 0.34, 1.7, 0.9); // vela/faixa na cor do time
  flag.name = 'Flag';
  const hose = part(hull, new THREE.TorusGeometry(0.2, 0.05, 5, 10), NM.ironDark, 0, 0.36, 1.0, Math.PI / 2, 0, 0); // mangueira enrolada
  hose.name = 'Hose';
  part(hull, B(0.1, 0.1, 0.5), NM.iron, 0, 0.45, 0.55); // tubo de carga
  return enableShadows(root);
}
