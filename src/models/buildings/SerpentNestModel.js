import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-06 — Ninho das Serpes (orc). PROCEDURAL provisório: montículo de rocha escura, anel de espinhos de osso,
 * covil aberto na frente (+Z), ovos verdes brilhantes no centro e estandartes rasgados.
 * @returns {THREE.Group}
 */
export function createSerpentNest() {
  const g = new THREE.Group();
  g.name = 'SerpentNest';
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const rock = new THREE.MeshStandardMaterial({ color: 0x3f3f46, flatShading: true, roughness: 0.95 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xe7e0c8, flatShading: true, roughness: 0.8 });
  const egg = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x16a34a, emissiveIntensity: 0.9, flatShading: true });
  add(new THREE.CylinderGeometry(3.3, 3.8, 0.6, 9), rock, 0, 0.3, 0);
  add(new THREE.CylinderGeometry(2.2, 3.1, 2.6, 8), rock, 0, 1.8, -0.2);
  add(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 8), M.soil, 0, 3.2, -0.2); // cratera
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    add(new THREE.ConeGeometry(0.28, 2.4, 4), bone, Math.cos(a) * 3.0, 1.4, Math.sin(a) * 3.0 - 0.2, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
  }
  for (const [x, z] of [[-0.5, -0.3], [0.5, 0], [0, -0.9]]) add(new THREE.IcosahedronGeometry(0.42, 0), egg, x, 3.7, z - 0.2);
  add(new THREE.BoxGeometry(1.4, 1.7, 0.3), M.tunnelBlack, 0, 1.2, 2.5); // covil (frente)
  add(new THREE.BoxGeometry(0.1, 2.2, 1.0), M.bannerRed, -2.6, 3.6, 1.6);
  add(new THREE.CylinderGeometry(0.1, 0.12, 3.0, 5), M.woodDark, -2.6, 2.2, 1.6);
  return enableShadows(g);
}
