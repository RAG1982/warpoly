import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';
import { createKnight } from './KnightModel.js';

/**
 * F4-01 — Cavaleiro (cavalaria pesada humana). Modelo PROCEDURAL provisório (o modelo final do
 * Blender vem na F7): corpo de cavalo em caixas low-poly + o tronco do Espadachim (`createKnight`)
 * montado na sela. Os nós nomeados do cavaleiro (`Torso`, `Head`, `ArmL`, `ArmR`, `Sword`,
 * `ShieldGroup`, `Plume`…) são preservados para o `UnitAnimator` (que trata 'cavalier' como
 * 'knight'); as pernas do Espadachim são removidas e o cavalo ganha `HorseLegFL/FR/BL/BR`
 * (balançam em fase alternada no ramo `horseLegs` do `UnitAnimator`).
 * Regras do CLAUDE.md: rosto só na face frontal (viseira do elmo, herdada) e gume da espada em +Z.
 * @returns {THREE.Group}
 */

/** Altura com que o tronco do cavaleiro sobe para sentar na sela. */
const RIDER_LIFT = 0.45;

export function createCavalier() {
  const root = createKnight();
  root.name = 'Cavalier';

  // --- Cavaleiro: sem pernas próprias, tudo sobe para a sela ---
  const rider = root.userData;
  for (const leg of [rider.legL, rider.legR]) {
    if (leg && leg.parent) leg.parent.remove(leg);
  }
  for (const child of root.children) child.position.y += RIDER_LIFT;

  // --- Materiais do cavalo (poucos, compartilhados) ---
  const coat = new THREE.MeshStandardMaterial({ color: 0x7a4a2b, flatShading: true, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24170f, flatShading: true, roughness: 0.85 });

  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Tronco do cavalo
  add(root, B(0.78, 0.74, 1.05), coat, 0, 1.0, 0.22); // peito/cernelha
  add(root, B(0.72, 0.68, 0.85), coat, 0, 0.98, -0.45); // garupa
  // Pescoço (inclinado para a frente, +Z) e cabeça
  add(root, B(0.36, 0.78, 0.42), coat, 0, 1.45, 0.82, 0.55, 0, 0);
  add(root, B(0.34, 0.34, 0.62), coat, 0, 1.78, 1.22, 0.25, 0, 0); // cabeça (focinho longo, sem textura)
  add(root, B(0.26, 0.24, 0.26), dark, 0, 1.68, 1.55, 0.25, 0, 0); // focinho escuro
  add(root, B(0.08, 0.18, 0.08), coat, -0.11, 2.02, 1.02); // orelhas
  add(root, B(0.08, 0.18, 0.08), coat, 0.11, 2.02, 1.02);
  // Crina e cauda
  add(root, B(0.1, 0.62, 0.22), dark, 0, 1.6, 0.66, 0.55, 0, 0);
  add(root, B(0.14, 0.7, 0.14), dark, 0, 0.92, -0.98, -0.35, 0, 0);
  // Sela e manta azul do reino
  add(root, B(0.86, 0.06, 0.62), M.bannerBlue, 0, 1.38, 0.0);
  add(root, B(0.52, 0.1, 0.42), M.leatherBrown, 0, 1.44, -0.05);
  // Rédeas douradas
  add(root, B(0.05, 0.05, 0.5), M.roofGold, 0, 1.62, 1.1, 0.3, 0, 0);

  // Pernas do cavalo (pivô no quadril; balançam em X)
  const legNames = [
    ['HorseLegFL', -0.23, 0.6], ['HorseLegFR', 0.23, 0.6],
    ['HorseLegBL', -0.23, -0.62], ['HorseLegBR', 0.23, -0.62]
  ];
  const horseLegs = legNames.map(([name, x, z]) => {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, 0.85, z);
    add(leg, B(0.2, 0.46, 0.24), coat, 0, -0.2, 0);
    add(leg, B(0.14, 0.42, 0.16), coat, 0, -0.6, 0.01);
    add(leg, B(0.18, 0.12, 0.22), dark, 0, -0.81, 0.02);
    root.add(leg);
    return leg;
  });

  // Pernas do cavaleiro penduradas nos flancos (fixas; não animadas)
  add(root, B(0.16, 0.5, 0.22), M.steelDark, -0.43, 1.12, 0.05, 0, 0, 0.12);
  add(root, B(0.16, 0.5, 0.22), M.steelDark, 0.43, 1.12, 0.05, 0, 0, -0.12);

  root.userData = { ...rider, legL: null, legR: null, horseLegs };
  return enableShadows(root);
}
