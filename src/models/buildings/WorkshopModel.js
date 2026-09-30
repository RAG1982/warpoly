import * as THREE from 'three';
import { materials as M, enableShadows } from '../materials.js';

/**
 * F4-02 — Oficina de Engenharia (humana). Procedural low-poly, sem texturas de canvas: base de
 * pedra, galpão de madeira aberto na frente (+Z), telhado azul de uma água com chaminé, engrenagem
 * grande na lateral, bancada com bigorna, rodas e tábuas de balista em montagem. ≤ 10 materiais.
 * @returns {THREE.Group}
 */
export function createWorkshop() {
  const g = new THREE.Group();
  g.name = 'Workshop';

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

  // Paredes (fundo + laterais; frente aberta)
  box(6.2, 3.0, 0.3, M.woodMedium, 0, 2.0, -2.6);
  box(0.3, 3.0, 4.6, M.woodMedium, -3.0, 2.0, -0.3);
  box(0.3, 3.0, 4.6, M.woodMedium, 3.0, 2.0, -0.3);
  box(5.6, 2.4, 0.1, M.doorDark, 0, 1.9, -2.42);
  [-3.0, 3.0].forEach(x => box(0.3, 3.3, 0.3, M.woodDark, x, 2.15, 2.4));
  box(6.6, 0.35, 0.4, M.woodDark, 0, 3.75, 2.4);

  // Telhado de uma água (mais alto ao fundo) + faixa dourada
  box(7.6, 0.25, 6.4, M.roofBlue, 0, 4.25, 0, 0.18, 0, 0);
  box(7.7, 0.22, 0.4, M.roofGold, 0, 4.6, -3.1);

  // Chaminé de pedra
  box(1.0, 2.6, 1.0, M.stoneDark, 2.2, 5.0, -1.8);
  box(1.2, 0.25, 1.2, M.stone, 2.2, 6.4, -1.8);

  // Engrenagem grande na lateral esquerda (anel + raios + miolo)
  const gear = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.2, 5, 10), M.steelDark);
  gear.rotation.y = Math.PI / 2;
  gear.position.set(-3.35, 2.6, 0.4);
  g.add(gear);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.22), M.steelDark);
    spoke.position.set(-3.35, 2.6, 0.4);
    spoke.rotation.x = (i * Math.PI) / 4;
    g.add(spoke);
  }
  box(0.3, 0.5, 0.5, M.roofGold, -3.35, 2.6, 0.4);

  // Bancada, bigorna e ferramentas
  box(2.6, 0.2, 1.0, M.woodLight, 1.0, 1.25, -1.8);
  box(0.25, 0.8, 0.25, M.woodDark, -0.2, 0.9, -1.8);
  box(0.25, 0.8, 0.25, M.woodDark, 2.2, 0.9, -1.8);
  box(0.9, 0.3, 0.5, M.steelDark, 0.6, 1.5, -1.8);
  box(0.6, 0.5, 0.4, M.steelDark, 1.9, 1.6, -1.8, 0, 0.4, 0);

  // Balista em montagem na frente: base, braço, rodas
  box(1.8, 0.25, 1.2, M.woodLight, -0.6, 0.85, 1.0);
  box(0.25, 0.25, 2.2, M.woodDark, -0.6, 1.1, 1.0);
  box(2.0, 0.18, 0.18, M.woodDark, -0.6, 1.3, 1.9);
  [-1.5, 0.3].forEach(x => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 8), M.woodDark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.7, 0.3);
    g.add(w);
  });

  // Tábuas empilhadas + estandarte
  box(1.8, 0.2, 0.5, M.woodLight, 2.3, 0.65, 2.2);
  box(1.8, 0.2, 0.5, M.woodLight, 2.3, 0.85, 2.2, 0, 0.1, 0);
  box(0.12, 2.6, 0.12, M.woodDark, 3.6, 1.9, 3.2);
  box(0.06, 1.1, 0.8, M.bannerBlue, 3.6, 2.6, 3.6);

  return enableShadows(g);
}
