import * as THREE from 'three';
import { enableShadows } from '../materials.js';

/**
 * F4-04b — Olho Vigia (orc). Procedural simples: globo ocular violeta flutuando a ~2,4 u do chão, íris dourada
 * com pupila na face frontal (+Z), três tentáculos curtos atrás. Sem rig humanoide. ≤ 7 draw calls.
 */
export function createWatchingEye() {
  const g = new THREE.Group();
  g.name = 'WatchingEye';
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const flesh = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x4c1d95, emissiveIntensity: 0.6, flatShading: true, roughness: 0.5 });
  const iris = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 1.2, flatShading: true });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x0b0b10, flatShading: true });
  const y = 2.4;
  add(new THREE.IcosahedronGeometry(0.6, 0), flesh, 0, y, 0);
  add(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 8), iris, 0, y, 0.56).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 6), pupil, 0, y, 0.6).rotation.x = Math.PI / 2;
  for (const x of [-0.25, 0, 0.25]) add(new THREE.ConeGeometry(0.09, 0.9, 4), flesh, x, y - 0.1 - Math.abs(x) * 0.4, -0.55).rotation.x = -Math.PI / 2.4;
  return enableShadows(g);
}
