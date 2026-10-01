import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';
import { createSuicideBody } from './SapperModel.js';

/**
 * F4-04 — Mago Arcano (humano) e base do Necromante. Modelo PROCEDURAL provisório (Blender na F7):
 * rig plana (`Torso`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`) com túnica longa, capuz e cajado (`Weapon`)
 * com cristal pulsante (`Crystal`, animado na 'cast'). Rosto só na face frontal (+Z). ≤ 12 draw calls.
 * `createCasterBody` é compartilhado com `NecromancerModel.js`.
 */
export function createCasterBody(o) {
  const { root, torso } = createSuicideBody({ name: o.name, skin: o.skin, tunic: o.robe, pants: o.robe, hat: o.hood, strap: o.trim });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.36), o.robe);
  skirt.position.set(0, -0.5, 0);
  torso.add(skirt);
  const weapon = new THREE.Group();
  weapon.name = 'Weapon';
  weapon.position.set(0.38, 0.95, 0.12);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.7, 5), M.woodDark);
  shaft.position.y = 0.2;
  weapon.add(shaft);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), o.crystal);
  crystal.name = 'Crystal';
  crystal.position.y = 1.15;
  weapon.add(crystal);
  root.add(weapon);
  return root;
}

export function createMage() {
  const robe = new THREE.MeshStandardMaterial({ color: 0x1e2a5a, flatShading: true, roughness: 0.6 });
  const crystal = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.4, flatShading: true });
  const root = createCasterBody({ name: 'Mage', skin: M.skin, robe, hood: robe, trim: M.roofGold, crystal });
  enableShadows(root);
  return root;
}
