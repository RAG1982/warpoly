import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';
import { createSuicideBody, createFuse } from './SapperModel.js';

/**
 * F4-05 — Incendiários (orc). Modelo PROCEDURAL provisório (Blender na F7): orc de pele verde com
 * botijas de óleo nas costas e um pavio aceso (`Fuse`). Mesma rig plana do Sapador.
 * Rosto só na face frontal (+Z). ≤ 12 draw calls.
 * @returns {THREE.Group}
 */
export function createArsonist() {
  const skin = new THREE.MeshStandardMaterial({ color: 0x5f9a3a, flatShading: true, roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8a2a1c, flatShading: true, roughness: 0.7 });
  const { root, torso } = createSuicideBody({
    name: 'Arsonist',
    skin,
    tunic: cloth,
    pants: M.woodDark,
    hat: M.steelDark,
    strap: M.leatherBrown
  });
  // Três botijas de óleo (vidro escuro) amarradas nas costas
  const oil = new THREE.MeshStandardMaterial({ color: 0x1f2a1a, flatShading: true, roughness: 0.35, metalness: 0.2 });
  for (const x of [-0.16, 0, 0.16]) {
    const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 6), oil);
    flask.position.set(x, 0.03, x === 0 ? -0.35 : -0.3);
    torso.add(flask);
  }
  createFuse(torso, 0, 0.3, -0.35);
  enableShadows(root);
  return root;
}
