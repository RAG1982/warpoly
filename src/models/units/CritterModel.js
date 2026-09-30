import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { materials, enableShadows } from '../materials.js';

/**
 * F3-10: modelos procedurais mínimos dos critters (ovelha e porco) — caixas low-poly.
 * Até 3 draw calls por bicho: corpo, cabeça e pernas (1 material cada). Compartilha
 * `materials.js` (sem texturas). Nós nomeados: `Body`, `Head`, `Legs`.
 */
const SPECIES = {
  sheep: { body: [1.0, 0.8, 1.5], head: [0.5, 0.5, 0.55], bodyMat: 'critterWool', headMat: 'critterDark', legMat: 'critterDark', legH: 0.4 },
  pig: { body: [0.9, 0.7, 1.3], head: [0.5, 0.5, 0.5], bodyMat: 'critterPink', headMat: 'critterPink', legMat: 'critterPinkDark', legH: 0.3 }
};

/** @param {'sheep'|'pig'} species @returns {THREE.Group} */
export function createCritter(species = 'sheep') {
  const s = SPECIES[species] || SPECIES.sheep;
  const g = new THREE.Group();
  g.name = species === 'pig' ? 'Pig' : 'Sheep';

  const body = new THREE.Mesh(new THREE.BoxGeometry(...s.body), materials[s.bodyMat]);
  body.name = 'Body';
  body.position.set(0, s.legH + s.body[1] / 2, 0);
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(...s.head), materials[s.headMat]);
  head.name = 'Head';
  head.position.set(0, s.legH + s.body[1] * 0.75, s.body[2] / 2 + s.head[2] * 0.4);
  g.add(head);

  // Quatro pernas numa só geometria (1 draw call).
  const legGeos = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const geo = new THREE.BoxGeometry(0.18, s.legH, 0.18);
      geo.translate(sx * s.body[0] * 0.32, s.legH / 2, sz * s.body[2] * 0.32);
      legGeos.push(geo);
    }
  }
  const legs = new THREE.Mesh(mergeGeometries(legGeos), materials[s.legMat]);
  legs.name = 'Legs';
  g.add(legs);

  enableShadows(g);
  return g;
}
