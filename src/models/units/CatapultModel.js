import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-02 — Catapulta (cerco orc). Modelo PROCEDURAL provisório (Blender na F7): chassi tosco de
 * troncos escuros sobre 2 rodas, braço de arremesso com concha e pedra, peles e estandarte
 * vermelho. Sem operador visível. Aponta para +Z (a pedra sai pela frente).
 *
 * Nós nomeados lidos por `ModelFactory.rebindUserData` / `UnitAnimator`:
 * - `SiegeArm`  braço de arremesso (pivô na base): gira em X ao disparar (animação 'fight').
 * - `WheelL`/`WheelR`  pivôs das rodas (giram em X ao andar).
 * @returns {THREE.Group}
 */
export function createCatapult() {
  const root = new THREE.Group();
  root.name = 'Catapult';

  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Chassi: duas longarinas de tronco, travessas e eixo
  add(root, B(0.3, 0.3, 2.6), M.woodDark, -0.65, 0.95, 0);
  add(root, B(0.3, 0.3, 2.6), M.woodDark, 0.65, 0.95, 0);
  add(root, B(1.6, 0.26, 0.3), M.woodMedium, 0, 0.98, -1.05);
  add(root, B(1.6, 0.26, 0.3), M.woodMedium, 0, 0.98, 0.95);
  add(root, B(2.2, 0.16, 0.16), M.steelDark, 0, 0.62, 0.0); // eixo
  // Torres laterais de apoio do braço
  add(root, B(0.22, 1.3, 0.22), M.woodMedium, -0.7, 1.6, -0.1);
  add(root, B(0.22, 1.3, 0.22), M.woodMedium, 0.7, 1.6, -0.1);
  add(root, B(1.6, 0.2, 0.2), M.woodDark, 0, 2.2, -0.1); // viga do eixo do braço
  // Pele esticada nas laterais + tira de ferro
  add(root, B(0.06, 0.6, 1.4), M.leatherBrown, -0.78, 1.25, 0.4);
  add(root, B(0.06, 0.6, 1.4), M.leatherBrown, 0.78, 1.25, 0.4);
  add(root, B(1.5, 0.12, 0.12), M.steelDark, 0, 1.0, 1.2);
  // Estandarte vermelho na traseira
  add(root, B(0.08, 1.4, 0.08), M.woodDark, -0.5, 1.8, -1.2);
  add(root, B(0.05, 0.6, 0.5), M.bannerRed, -0.5, 2.25, -0.95);

  // Braço de arremesso: pivô no eixo da viga; repouso levantado/inclinado para trás (armado)
  const arm = new THREE.Group();
  arm.name = 'SiegeArm';
  arm.position.set(0, 2.2, -0.1);
  arm.rotation.x = 0; // repouso; a animação 'fight' arma para trás e dispara para a frente
  add(arm, B(0.26, 0.26, 2.6), M.woodLight, 0, 0.0, 0.7);
  add(arm, B(0.5, 0.5, 0.5), M.steelDark, 0, 0, -0.45); // contrapeso
  // Concha com a pedra na ponta (+Z)
  add(arm, B(0.8, 0.14, 0.7), M.leatherBrown, 0, 0.12, 1.95);
  add(arm, B(0.8, 0.3, 0.1), M.leatherBrown, 0, 0.25, 2.3);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), M.pebble);
  rock.position.set(0, 0.42, 1.95);
  arm.add(rock);
  root.add(arm);

  // Rodas: pivô no eixo, aro + raios
  const makeWheel = (name, x) => {
    const w = new THREE.Group();
    w.name = name;
    w.position.set(x, 0.62, 0.0);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.26, 8), M.woodDark);
    rim.rotation.z = Math.PI / 2;
    w.add(rim);
    add(w, B(0.3, 1.28, 0.12), M.woodMedium, 0, 0, 0);
    add(w, B(0.3, 0.12, 1.28), M.woodMedium, 0, 0, 0);
    add(w, B(0.34, 0.28, 0.28), M.steelDark, 0, 0, 0);
    root.add(w);
    return w;
  };
  const wheelL = makeWheel('WheelL', -1.1);
  const wheelR = makeWheel('WheelR', 1.1);

  root.userData = { siegeArm: arm, wheelL, wheelR };
  enableShadows(root);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}
