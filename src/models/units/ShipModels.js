import * as THREE from 'three';
import { enableShadows } from '../materials.js';
import { NM, part, B, C } from '../naval/navalMaterials.js';

/**
 * F4-07b — navios de guerra PROCEDURAIS (fallback dos .glb do Blender; `?glb=0`). Aponta para +Z, base na linha d'água (y = 0).
 * Variante `orc`: casco de ferro enegrecido com ossos e velas de couro; humana: madeira clara e velas brancas.
 * Nós nomeados (iguais aos .glb, usados pelo `UnitAnimator`): `Hull` (balança), `Flag`, `Sail*`, `Turret*`/`Cannon*` (giro/recuo),
 * `Crane`/`Hook`/`Ramp` (barcaça), `Anim_Smoke`. Cada modelo ≤ 16 draw calls; cor de time em `NM.team`.
 */

const hullMat = (orc) => (orc ? NM.ironOrc : NM.hullWood);
const trimMat = (orc) => (orc ? NM.rust : NM.hullDark);
const sailMat = (orc) => (orc ? NM.rope : NM.sail);

function bareHull(hull, orc, len, wid, h = 0.55) {
  part(hull, B(wid, h, len), hullMat(orc), 0, 0.0, 0);
  part(hull, new THREE.ConeGeometry(wid * 0.72, len * 0.28, 4), hullMat(orc), 0, 0.0, len / 2 + len * 0.1, Math.PI / 2, Math.PI / 4, 0).scale.set(1, 1, 0.55); // proa
  part(hull, B(wid * 0.92, 0.07, len * 0.98), NM.deckWood, 0, h / 2, 0); // convés
  part(hull, B(wid * 1.04, 0.12, len * 0.8), trimMat(orc), 0, h / 2 - 0.12, 0); // cinta
}

function turret(hull, name, cannonName, orc, x, y, z, ry = 0) {
  const t = new THREE.Group();
  t.name = name;
  t.position.set(x, y, z);
  t.rotation.y = ry;
  hull.add(t);
  part(t, C(0.32, 0.38, 0.28, 8), NM.ironDark, 0, 0, 0);
  const cannon = part(t, C(0.09, 0.12, 1.0, 8), NM.cannon, 0, 0.18, 0.5, Math.PI / 2, 0, 0);
  cannon.name = cannonName;
  return t;
}

export function createFrigate(orc = false) {
  const root = new THREE.Group();
  root.name = orc ? 'OrcFrigate' : 'Frigate';
  const hull = new THREE.Group();
  hull.name = 'Hull';
  root.add(hull);
  bareHull(hull, orc, 5.6, 2.0);
  part(hull, C(0.07, 0.09, 4.4, 5), trimMat(orc), 0, 2.5, -0.3); // mastro
  const sail = part(hull, B(2.3, 2.4, 0.06), sailMat(orc), 0, 2.9, -0.2);
  sail.name = 'Sail';
  const flag = part(hull, B(0.9, 0.55, 0.04), NM.team, 0.45, 4.5, -0.3);
  flag.name = 'Flag';
  part(hull, B(1.1, 0.7, 1.0), trimMat(orc), 0, 0.85, -2.0); // castelo de popa
  turret(hull, 'Turret1', 'Cannon1', orc, 0, 0.45, 1.9);
  turret(hull, 'Turret2', 'Cannon2', orc, 0, 0.45, -2.6, Math.PI);
  const smoke = new THREE.Object3D();
  smoke.name = 'Anim_Smoke';
  smoke.position.set(0, 2.6, -0.95);
  hull.add(smoke);
  return enableShadows(root);
}

export function createBarge(orc = false) {
  const root = new THREE.Group();
  root.name = orc ? 'OrcBarge' : 'Barge';
  const hull = new THREE.Group();
  hull.name = 'Hull';
  root.add(hull);
  bareHull(hull, orc, 5.4, 3.0, 0.7);
  part(hull, B(2.5, 0.5, 3.2), NM.plank, 0, 0.55, -0.3); // carga
  part(hull, B(2.6, 0.08, 0.2), trimMat(orc), 0, 0.85, 1.4); // amurada de proa
  const crane = new THREE.Group();
  crane.name = 'Crane';
  crane.position.set(-0.5, 0.6, 1.5);
  hull.add(crane);
  part(crane, C(0.08, 0.1, 2.0, 5), trimMat(orc), 0, 1.0, 0);
  part(crane, B(0.08, 0.08, 1.6), trimMat(orc), 0.7, 2.0, 0);
  const hook = part(crane, B(0.1, 0.4, 0.1), NM.ironDark, 1.4, 1.5, 0);
  hook.name = 'Hook';
  const ramp = part(hull, B(2.2, 0.08, 1.2), NM.deckWood, 0, 0.7, 3.0);
  ramp.name = 'Ramp';
  const flag = part(hull, B(0.7, 0.45, 0.04), NM.team, 0, 2.2, -2.4);
  flag.name = 'Flag';
  part(hull, C(0.05, 0.06, 2.0, 5), trimMat(orc), 0, 1.4, -2.4);
  return enableShadows(root);
}

export function createDreadnought(orc = false) {
  const root = new THREE.Group();
  root.name = orc ? 'OrcDreadnought' : 'Dreadnought';
  const hull = new THREE.Group();
  hull.name = 'Hull';
  root.add(hull);
  bareHull(hull, orc, 8.4, 3.4, 0.9);
  part(hull, B(2.6, 0.7, 5.8), NM.iron, 0, 0.8, 0); // casamata blindada
  for (let i = 0; i < 3; i++) {
    part(hull, C(0.06, 0.08, 5.0, 5), trimMat(orc), 0, 3.0, 2.6 - i * 1.8);
    const s = part(hull, B(2.2, 1.7, 0.06), sailMat(orc), 0, 4.6, 2.6 - i * 1.8);
    s.name = `Sail${i + 1}`;
  }
  const flag = part(hull, B(1.0, 0.6, 0.04), NM.team, -0.6, 5.2, -4.4);
  flag.name = 'Flag';
  turret(hull, 'Turret1', 'Cannon1', orc, 0, 1.3, 3.7);
  turret(hull, 'Turret2', 'Cannon2', orc, 0, 1.3, 1.3);
  const aft = turret(hull, 'Turret3', 'Cannon3', orc, 0, 1.3, -3.6, Math.PI);
  aft.scale.setScalar(0.9);
  return enableShadows(root);
}

export function createSubmersible(orc = false) {
  const root = new THREE.Group();
  root.name = orc ? 'ColossalTurtle' : 'Submersible';
  const hull = new THREE.Group();
  hull.name = 'Hull';
  root.add(hull);
  if (orc) {
    const shell = part(hull, new THREE.SphereGeometry(1.2, 10, 6), NM.ironOrc, 0, 0.1, 0);
    shell.scale.set(1.1, 0.7, 1.5);
    part(hull, new THREE.SphereGeometry(0.42, 8, 6), NM.bone, 0, 0.2, 1.9); // cabeça
    for (const [x, z] of [[-1.0, 0.9], [1.0, 0.9], [-1.0, -0.9], [1.0, -0.9]]) part(hull, B(0.7, 0.12, 0.4), NM.bone, x, -0.05, z);
    for (const [x, z] of [[-0.5, 0.2], [0.5, 0.2], [0, -0.7]]) part(hull, new THREE.ConeGeometry(0.2, 0.5, 5), NM.bone, x, 0.85, z); // espinhos
  } else {
    const body = part(hull, C(0.8, 0.8, 4.0, 10), NM.iron, 0, 0.1, 0, Math.PI / 2, 0, 0);
    body.scale.set(1, 1, 0.9);
    part(hull, new THREE.SphereGeometry(0.8, 10, 6), NM.iron, 0, 0.1, 2.0).scale.set(1, 0.9, 1);
    part(hull, new THREE.SphereGeometry(0.8, 10, 6), NM.ironDark, 0, 0.1, -2.0).scale.set(1, 0.9, 1);
    part(hull, C(0.35, 0.4, 0.7, 8), NM.ironDark, 0, 0.9, 0.3); // torre de comando
    part(hull, C(0.03, 0.03, 0.9, 4), NM.rust, 0.15, 1.6, 0.3); // periscópio
    part(hull, B(1.5, 0.08, 0.5), NM.ironDark, 0, 0.1, -2.1); // leme
  }
  const flag = part(hull, B(0.4, 0.25, 0.04), NM.team, 0, 1.45, orc ? -0.6 : -0.1);
  flag.name = 'Flag';
  return enableShadows(root);
}
