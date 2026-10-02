import * as THREE from 'three';

/**
 * F4-07 — materiais compartilhados dos modelos NAVAIS procedurais (provisórios; os .glb do Blender os substituem via
 * `ModelFactory._glbOr`). Só cores lisas (sem texturas): o orçamento é de ≤ 16/20 draw calls por modelo.
 * `team` / `teamOrc` se chamam `TeamColor` — `setTeamColor` (glbModels.js) os troca pela cor do dono em cada instância.
 */
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });

export const NM = {
  hullWood: flat(0x7c4a1e),
  hullDark: flat(0x4a2c12),
  deckWood: flat(0xb07a3a),
  plank: flat(0xc98f4a),
  sail: flat(0xf1ead8, { roughness: 0.9, side: THREE.DoubleSide }),
  rope: flat(0xb99b6b),
  iron: flat(0x5b6470, { roughness: 0.4, metalness: 0.7 }),
  ironDark: flat(0x2e3238, { roughness: 0.5, metalness: 0.6 }),
  ironOrc: flat(0x3a3a3f, { roughness: 0.55, metalness: 0.55 }),
  rust: flat(0x8a4b2c, { roughness: 0.8 }),
  bone: flat(0xe3dcc6, { roughness: 0.85 }),
  stone: flat(0x8d949c),
  tank: flat(0x8a5a3c, { roughness: 0.55, metalness: 0.35 }),
  oil: flat(0x14110f, { roughness: 0.25, metalness: 0.2 }),
  glow: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.4, flatShading: true }),
  cannon: flat(0x23262b, { roughness: 0.35, metalness: 0.8 }),
  team: Object.assign(flat(0x2563eb, { roughness: 0.55, side: THREE.DoubleSide }), { name: 'TeamColor' }),
  slick: new THREE.MeshBasicMaterial({ color: 0x0b0a09, transparent: true, opacity: 0.88, depthWrite: false })
};

/** Atalho: adiciona uma malha a `parent` (posição + rotação opcional) e devolve-a. */
export function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

export const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const C = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
