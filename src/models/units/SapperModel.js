import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-05 — Sapadores de Pólvora (humano) e base do Incendiário (orc). Modelo PROCEDURAL provisório
 * (Blender na F7): humanoide de rig plana (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`) com um
 * barril/carga nas costas e um pavio aceso (`Fuse`, pisca na animação 'fight'/'walk').
 * Rosto só na face frontal (+Z): dois olhos escuros; laterais/nuca lisas. ≤ 12 draw calls.
 *
 * `createSuicideBody` é compartilhado com `ArsonistModel.js`.
 * @returns {THREE.Group}
 */

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function add(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/**
 * Corpo base. `o`: { name, skin, tunic, pants, hat, strap } (materiais).
 * Retorna { root, torso } para o chamador pendurar a carga nas costas e o pavio.
 */
export function createSuicideBody(o) {
  const root = new THREE.Group();
  root.name = o.name;
  const eye = new THREE.MeshStandardMaterial({ color: 0x140f09, flatShading: true });

  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 1.05, 0);
  add(torso, B(0.5, 0.52, 0.3), o.tunic, 0, 0, 0);
  add(torso, B(0.54, 0.1, 0.34), o.strap, 0, -0.22, 0); // cinto
  add(torso, B(0.1, 0.56, 0.32), o.strap, 0.12, 0.0, 0); // bandoleira
  root.add(torso);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 1.56, 0);
  add(head, B(0.3, 0.3, 0.3), o.skin, 0, 0.12, 0);
  add(head, B(0.34, 0.12, 0.34), o.hat, 0, 0.3, 0); // capuz/chapéu liso
  add(head, B(0.06, 0.05, 0.02), eye, -0.07, 0.14, 0.152); // rosto: só na face frontal (+Z)
  add(head, B(0.06, 0.05, 0.02), eye, 0.07, 0.14, 0.152);
  root.add(head);

  const makeArm = (name, x) => {
    const a = new THREE.Group();
    a.name = name;
    a.position.set(x, 1.27, 0);
    add(a, B(0.17, 0.5, 0.17), o.tunic, 0, -0.22, 0);
    add(a, B(0.15, 0.14, 0.15), o.skin, 0, -0.5, 0);
    root.add(a);
  };
  makeArm('ArmL', -0.35);
  makeArm('ArmR', 0.35);

  const makeLeg = (name, x) => {
    const l = new THREE.Group();
    l.name = name;
    l.position.set(x, 0.66, 0);
    add(l, B(0.2, 0.6, 0.22), o.pants, 0, -0.3, 0);
    add(l, B(0.22, 0.14, 0.3), o.strap, 0, -0.62, 0.04); // bota
    root.add(l);
  };
  makeLeg('LegL', -0.14);
  makeLeg('LegR', 0.14);

  return { root, torso };
}

/** Pavio: grupo `Fuse` (cordão + faísca emissiva) no topo da carga. */
export function createFuse(parent, x, y, z) {
  const fuse = new THREE.Group();
  fuse.name = 'Fuse';
  fuse.position.set(x, y, z);
  add(fuse, B(0.04, 0.22, 0.04), M.leatherBrown, 0, 0.11, 0, 0.2, 0, 0);
  const spark = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff7a00, emissiveIntensity: 1.6, flatShading: true });
  add(fuse, new THREE.OctahedronGeometry(0.09, 0), spark, 0, 0.25, 0.04);
  parent.add(fuse);
  return fuse;
}

export function createSapper() {
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3b5fa8, flatShading: true, roughness: 0.6 });
  const { root, torso } = createSuicideBody({
    name: 'Sapper',
    skin: M.skin,
    tunic: cloth,
    pants: M.woodDark,
    hat: M.leatherBrown,
    strap: M.leatherBrown
  });
  // Barril de pólvora nas costas (-Z) com duas cintas de aço
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.46, 8), M.woodMedium);
  barrel.position.set(0, 0.05, -0.36);
  torso.add(barrel);
  add(torso, new THREE.CylinderGeometry(0.235, 0.235, 0.06, 8), M.steelDark, 0, -0.08, -0.36);
  add(torso, new THREE.CylinderGeometry(0.235, 0.235, 0.06, 8), M.steelDark, 0, 0.18, -0.36);
  createFuse(torso, 0, 0.28, -0.36);
  enableShadows(root);
  return root;
}
