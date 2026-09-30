import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-02 — Oficina dos Engenhoqueiros (orc). Procedural low-poly, sem texturas de canvas: base de
 * basalto, paliçada de troncos escuros com telhado de peles, portão aberto na frente (+Z),
 * engrenagem tosca de ferro, catapulta em montagem e pilha de pedras-munição.
 * @returns {THREE.Group}
 */
export function createOrcWorkshop() {
  const g = new THREE.Group();
  g.name = 'OrcWorkshop';

  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 6), mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    g.add(m);
    return m;
  };

  // Base de basalto
  box(7.2, 0.5, 6.4, M.stoneDark, 0, 0.25, 0);
  box(6.6, 0.2, 5.8, M.stone, 0, 0.6, 0);

  // Paliçada de troncos: fundo e laterais
  for (let i = 0; i < 7; i++) cyl(0.42, 0.46, 3.4, M.woodDark, -3.0 + i, 2.3, -2.8);
  for (let i = 0; i < 5; i++) {
    const z = -2.0 + i;
    cyl(0.42, 0.46, 3.2, M.woodDark, -3.2, 2.2, z);
    cyl(0.42, 0.46, 3.2, M.woodDark, 3.2, 2.2, z);
  }
  box(5.6, 2.4, 0.1, M.tunnelBlack, 0, 2.0, -2.35);

  // Mastros do portão + viga com caveira
  cyl(0.4, 0.5, 4.2, M.woodMedium, -2.3, 2.7, 3.0);
  cyl(0.4, 0.5, 4.2, M.woodMedium, 2.3, 2.7, 3.0);
  box(5.6, 0.5, 0.6, M.woodMedium, 0, 4.7, 3.0);
  box(0.8, 0.7, 0.7, M.logEnd, 0, 5.3, 3.3);

  // Telhado de peles
  const slope = 0.35;
  box(7.6, 0.3, 3.8, M.tentCrimson, 0, 4.5, -1.6, slope, 0, 0);
  box(7.6, 0.3, 3.8, M.leatherBrown, 0, 4.5, 1.6, -slope, 0, 0);
  [-2.4, 0, 2.4].forEach(x => box(0.3, 0.3, 6.2, M.woodDark, x, 3.9, 0));

  // Engrenagem tosca de ferro na lateral direita
  const gear = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.22, 5, 8), M.steelDark);
  gear.rotation.y = Math.PI / 2;
  gear.position.set(3.75, 2.5, 0.2);
  g.add(gear);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.26), M.steelDark);
    spoke.position.set(3.75, 2.5, 0.2);
    spoke.rotation.x = (i * Math.PI) / 3;
    g.add(spoke);
  }

  // Catapulta em montagem na frente: base, braço inclinado, rodas
  box(1.8, 0.25, 1.4, M.woodLight, -0.6, 0.95, 1.2);
  box(0.25, 1.8, 0.25, M.woodDark, -0.6, 1.8, 1.0, 0.5, 0, 0);
  box(0.7, 0.3, 0.7, M.steelDark, -0.6, 2.75, 1.5);
  [-1.6, 0.4].forEach(x => cyl(0.5, 0.5, 0.2, M.woodDark, x, 0.8, 0.6, Math.PI / 2));

  // Pilha de pedras-munição, osso e estandarte de guerra
  [[2.0, 1.0, 3.0], [2.7, 0.8, 3.4], [2.3, 1.5, 3.2]].forEach(([x, s, z]) => {
    box(s * 0.7, s * 0.7, s * 0.7, M.pebble, x, 0.6 + s * 0.35, z, 0.3, 0.5, 0.2);
  });
  box(1.0, 0.25, 0.25, M.logEnd, -3.9, 0.75, 4.0, 0, 0.5, 0);
  box(0.14, 3.2, 0.14, M.woodDark, -4.0, 1.9, 3.2);
  box(0.06, 1.3, 0.9, M.bannerRed, -4.0, 3.0, 3.65);

  return enableShadows(g);
}
