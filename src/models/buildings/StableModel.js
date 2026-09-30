import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-01 — Estábulo Real (humano). Modelo procedural low-poly, sem texturas de canvas:
 * base de pedra, galpão de madeira aberto na frente (+Z), telhado de duas águas azul, cocheiras
 * com feno, cerca de madeira e estandarte. Poucos materiais (≤ 10) → poucos draw calls após a mescla.
 * @returns {THREE.Group}
 */
export function createStable() {
  const g = new THREE.Group();
  g.name = 'Stable';

  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  // Base de pedra
  box(7.0, 0.4, 6.2, M.stoneDark, 0, 0.2, 0);
  box(6.6, 0.15, 5.8, M.stone, 0, 0.47, 0);

  // Paredes: fundo e laterais (frente aberta)
  box(6.2, 3.0, 0.3, M.woodMedium, 0, 2.0, -2.6);
  box(0.3, 3.0, 4.6, M.woodMedium, -3.0, 2.0, -0.3);
  box(0.3, 3.0, 4.6, M.woodMedium, 3.0, 2.0, -0.3);
  // Interior escuro (fundo das baias)
  box(5.6, 2.4, 0.1, M.doorDark, 0, 1.9, -2.42);

  // Pilares frontais e viga
  [-3.0, -1.0, 1.0, 3.0].forEach(x => box(0.3, 3.3, 0.3, M.woodDark, x, 2.15, 2.4));
  box(6.6, 0.35, 0.4, M.woodDark, 0, 3.75, 2.4);
  // Divisórias das baias
  [-1.0, 1.0].forEach(x => box(0.15, 1.3, 3.4, M.woodLight, x, 1.2, 0.5));

  // Feno nas baias e fardos fora
  [-2.0, 0, 2.0].forEach(x => box(1.6, 0.35, 1.2, M.wheat, x, 0.75, -1.6));
  box(1.0, 0.7, 0.8, M.wheat, 4.0, 0.75, 1.6);
  box(0.9, 0.6, 0.8, M.wheat, 4.1, 1.4, 1.5, 0, 0.3, 0);

  // Telhado de duas águas (cumeeira ao longo de X)
  const slope = 0.62;
  box(7.6, 0.25, 3.6, M.roofBlue, 0, 4.75, 1.3, slope, 0, 0);
  box(7.6, 0.25, 3.6, M.roofBlue, 0, 4.75, -1.3, -slope, 0, 0);
  box(7.7, 0.3, 0.35, M.roofGold, 0, 5.55, 0);
  // Empenas (triângulos de madeira nas laterais)
  [-3.1, 3.1].forEach(x => {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.9, 4), M.woodMedium);
    tri.rotation.y = Math.PI / 4;
    tri.scale.set(0.12, 1.0, 1.0);
    tri.position.set(x, 4.6, 0);
    g.add(tri);
  });

  // Cerca e cocho na frente
  box(0.2, 1.0, 0.2, M.woodDark, -4.2, 0.9, 3.0);
  box(0.2, 1.0, 0.2, M.woodDark, -2.4, 0.9, 3.0);
  box(2.1, 0.15, 0.12, M.woodLight, -3.3, 1.15, 3.0);
  box(2.1, 0.15, 0.12, M.woodLight, -3.3, 0.75, 3.0);
  box(1.6, 0.35, 0.6, M.woodLight, -3.2, 0.7, 4.0);

  // Estandarte azul na frente + ferradura dourada
  box(0.12, 2.6, 0.12, M.woodDark, 3.6, 1.9, 3.2);
  box(0.06, 1.1, 0.8, M.bannerBlue, 3.6, 2.6, 3.6);
  const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.07, 4, 8, Math.PI * 1.5), M.roofGold);
  shoe.position.set(0, 3.3, 2.65);
  shoe.rotation.z = Math.PI * 0.75;
  g.add(shoe);

  return enableShadows(g);
}
