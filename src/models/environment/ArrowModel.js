import * as THREE from 'three';
import { materials, enableShadows } from '../materials.js';

/**
 * Creates the Ballistic Arrow low-poly 3D mesh
 * @returns {THREE.Group}
 */
export function createArrow() {
  const arrow = new THREE.Group();
  arrow.name = 'Arrow';

  // Wooden shaft
  const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4);
  shaftGeo.rotateX(Math.PI / 2);
  const shaft = new THREE.Mesh(shaftGeo, materials.woodDark);
  arrow.add(shaft);

  // Iron tip
  const tipGeo = new THREE.ConeGeometry(0.06, 0.2, 4);
  tipGeo.rotateX(Math.PI / 2);
  const tip = new THREE.Mesh(tipGeo, materials.steelDark);
  tip.position.z = 0.45;
  arrow.add(tip);

  // White feather fletchings
  const fletchGeo = new THREE.BoxGeometry(0.12, 0.01, 0.2);
  const fletch1 = new THREE.Mesh(fletchGeo, materials.featherWhite);
  fletch1.position.z = -0.35;
  arrow.add(fletch1);

  const fletch2 = new THREE.Mesh(fletchGeo, materials.featherWhite);
  fletch2.position.z = -0.35;
  fletch2.rotateZ(Math.PI / 2);
  arrow.add(fletch2);

  arrow.userData = { shaft, tip, fletch1, fletch2 };

  return enableShadows(arrow);
}
