import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';
import { createCasterBody } from './MageModel.js';

/**
 * F4-04 — Necromante das Cinzas (orc). Procedural provisório: manto cinza-escuro, capuz, cajado com
 * cristal verde-ácido (`Crystal`) e crânio (cubo claro) no topo. Mesma rig do Mago. Rosto só em +Z.
 */
export function createNecromancer() {
  const robe = new THREE.MeshStandardMaterial({ color: 0x2b2b33, flatShading: true, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x5f9a3a, flatShading: true, roughness: 0.6 });
  const crystal = new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0x65a30d, emissiveIntensity: 1.4, flatShading: true });
  const root = createCasterBody({ name: 'Necromancer', skin, robe, hood: robe, trim: M.steelDark, crystal });
  const weapon = root.getObjectByName('Weapon');
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), M.featherWhite);
  skull.position.y = 0.95;
  weapon.add(skull);
  enableShadows(root);
  return root;
}
