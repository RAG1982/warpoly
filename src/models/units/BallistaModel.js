import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-02 — Balista (cerco humano). Modelo PROCEDURAL provisório (Blender na F7): chassi de
 * madeira sobre 2 rodas, trilho central e besta gigante de aço/madeira com virote, estandarte azul.
 * Sem operador visível. Aponta para +Z (a flecha sai pela frente).
 *
 * Nós nomeados lidos por `ModelFactory.rebindUserData` / `UnitAnimator`:
 * - `SiegeArm`  grupo da besta + virote: recua ao disparar (animação 'fight').
 * - `WheelL`/`WheelR`  pivôs das rodas (giram em X ao andar).
 * @returns {THREE.Group}
 */
export function createBallista() {
  const root = new THREE.Group();
  root.name = 'Ballista';

  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Chassi: duas longarinas, travessas e eixo
  add(root, B(0.22, 0.24, 2.4), M.woodMedium, -0.55, 0.9, 0);
  add(root, B(0.22, 0.24, 2.4), M.woodMedium, 0.55, 0.9, 0);
  add(root, B(1.4, 0.2, 0.26), M.woodDark, 0, 0.92, -1.0);
  add(root, B(1.4, 0.2, 0.26), M.woodDark, 0, 0.92, 0.9);
  add(root, B(2.0, 0.16, 0.16), M.steelDark, 0, 0.62, 0.05); // eixo
  // Cavalete central e trilho da besta
  add(root, B(0.18, 0.7, 0.18), M.woodDark, 0, 1.3, 0.1);
  add(root, B(0.26, 0.2, 2.0), M.woodLight, 0, 1.68, 0.2);
  // Escudo frontal de madeira reforçado
  add(root, B(1.3, 0.75, 0.1), M.woodMedium, 0, 1.25, 1.12, -0.15, 0, 0);
  add(root, B(1.3, 0.1, 0.12), M.steelDark, 0, 1.6, 1.15);
  // Estandarte azul na traseira
  add(root, B(0.08, 1.5, 0.08), M.woodDark, 0.5, 1.75, -1.05);
  add(root, B(0.05, 0.6, 0.5), M.bannerBlue, 0.5, 2.2, -0.78);

  // Braço da besta (recua ao disparar): arcos, corda e virote
  const arm = new THREE.Group();
  arm.name = 'SiegeArm';
  arm.position.set(0, 1.82, 0.85);
  add(arm, B(0.3, 0.3, 0.4), M.steelDark, 0, 0, 0.0);
  // Arcos (madeira) curvos para a frente nas pontas
  add(arm, B(1.35, 0.16, 0.16), M.woodLight, -0.75, 0, 0.12, 0, -0.35, 0);
  add(arm, B(1.35, 0.16, 0.16), M.woodLight, 0.75, 0, 0.12, 0, 0.35, 0);
  add(arm, B(0.2, 0.2, 0.3), M.steelDark, -1.38, 0, 0.42);
  add(arm, B(0.2, 0.2, 0.3), M.steelDark, 1.38, 0, 0.42);
  // Corda em "V" até a coronha
  add(arm, B(1.45, 0.05, 0.05), M.leatherBrown, -0.72, 0, -0.1, 0, 0.36, 0);
  add(arm, B(1.45, 0.05, 0.05), M.leatherBrown, 0.72, 0, -0.1, 0, -0.36, 0);
  // Virote (seta gigante) apontando para +Z
  add(arm, B(0.08, 0.08, 1.7), M.woodDark, 0, 0.14, 0.35);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 4), M.steelDark);
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.14, 1.3);
  arm.add(tip);
  root.add(arm);

  // Rodas: pivô no eixo, aro + 2 raios cruzados
  const makeWheel = (name, x) => {
    const w = new THREE.Group();
    w.name = name;
    w.position.set(x, 0.62, 0.05);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 10), M.woodDark);
    rim.rotation.z = Math.PI / 2;
    w.add(rim);
    add(w, B(0.26, 1.2, 0.1), M.woodLight, 0, 0, 0);
    add(w, B(0.26, 0.1, 1.2), M.woodLight, 0, 0, 0);
    add(w, B(0.3, 0.26, 0.26), M.steelDark, 0, 0, 0);
    root.add(w);
    return w;
  };
  const wheelL = makeWheel('WheelL', -1.0);
  const wheelR = makeWheel('WheelR', 1.0);

  root.userData = { siegeArm: arm, wheelL, wheelR };
  enableShadows(root);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}
