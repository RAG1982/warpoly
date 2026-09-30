import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-01 — Covil dos Ogros (orc). Procedural low-poly, sem texturas de canvas: base de basalto,
 * paliçada de troncos escuros, portão largo aberto na frente (+Z) com caveira, telhado de peles
 * sobre vigas, ossos/presas cravados e espetos. Poucos materiais → poucos draw calls após a mescla.
 * @returns {THREE.Group}
 */
export function createOgreDen() {
  const g = new THREE.Group();
  g.name = 'OgreDen';

  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 6), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  // Base de basalto
  box(7.2, 0.5, 6.4, M.stoneDark, 0, 0.25, 0);
  box(6.6, 0.2, 5.8, M.stone, 0, 0.6, 0);

  // Paliçada de troncos: fundo e laterais
  for (let i = 0; i < 7; i++) cyl(0.42, 0.46, 3.6, M.woodDark, -3.0 + i, 2.4, -2.8);
  for (let i = 0; i < 5; i++) {
    const z = -2.0 + i;
    cyl(0.42, 0.46, 3.4, M.woodDark, -3.2, 2.3, z);
    cyl(0.42, 0.46, 3.4, M.woodDark, 3.2, 2.3, z);
  }
  // Interior escuro
  box(5.6, 2.6, 0.1, M.tunnelBlack, 0, 2.0, -2.35);

  // Portão largo: dois mastros robustos e viga com ossos
  cyl(0.4, 0.5, 4.6, M.woodMedium, -2.3, 2.9, 3.0);
  cyl(0.4, 0.5, 4.6, M.woodMedium, 2.3, 2.9, 3.0);
  box(5.6, 0.5, 0.6, M.woodMedium, 0, 5.05, 3.0);
  // Presas/ossos cruzados sobre o portão + caveira de ogro
  box(0.25, 1.6, 0.25, M.logEnd, -0.9, 5.7, 3.1, 0, 0, 0.6);
  box(0.25, 1.6, 0.25, M.logEnd, 0.9, 5.7, 3.1, 0, 0, -0.6);
  box(0.9, 0.8, 0.8, M.logEnd, 0, 5.75, 3.3);
  box(0.2, 0.2, 0.05, M.tunnelBlack, -0.22, 5.85, 3.72);
  box(0.2, 0.2, 0.05, M.tunnelBlack, 0.22, 5.85, 3.72);

  // Telhado de peles: duas águas baixas sobre vigas
  const slope = 0.4;
  box(7.6, 0.3, 3.8, M.tentCrimson, 0, 4.7, -1.6, slope, 0, 0);
  box(7.6, 0.3, 3.8, M.leatherBrown, 0, 4.7, 1.6, -slope, 0, 0);
  [-2.4, 0, 2.4].forEach(x => box(0.3, 0.3, 6.2, M.woodDark, x, 4.1, 0));

  // Espetos nos cantos
  [[-3.4, 3.2], [3.4, 3.2], [-3.5, -3.0], [3.5, -3.0]].forEach(([x, z]) => {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 5), M.steelDark);
    s.position.set(x, 4.3, z);
    g.add(s);
  });

  // Ossos no chão, palha, estandarte de guerra
  box(1.0, 0.25, 0.25, M.logEnd, -3.8, 0.75, 4.0, 0, 0.5, 0);
  box(0.9, 0.22, 0.22, M.logEnd, -3.4, 0.7, 4.6, 0, -0.4, 0);
  box(1.6, 0.5, 1.2, M.wheat, 0, 0.95, -1.5);
  box(0.14, 3.2, 0.14, M.woodDark, -4.0, 1.9, 3.2);
  box(0.06, 1.3, 0.9, M.bannerRed, -4.0, 3.0, 3.65);

  return enableShadows(g);
}
