import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * F3-08 — Modelo procedural simples de um segmento de muralha (bloco ~2,2 × 2,4 × 2,2).
 *
 * A geometria é uma única BufferGeometry mesclada com cor por vértice, de modo que UM material
 * por facção cobre "pedra + detalhes" (1 draw call por facção quando usada em InstancedMesh —
 * ver `WallBatch`). Humano: pedra clara com base escura e coroa de ameia. Orc: madeira escura
 * com cintas e pontas de ferro. Sem malha de conexão (v2 = NEW-24).
 */

/** Altura total do bloco (usada por `healthBarHeight` em `src/data/buildings.js`). */
export const WALL_BLOCK_HEIGHT = 2.4;

function part(w, h, d, x, y, z, hex, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function build(parts) {
  const merged = mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

const _geoCache = new Map();

/**
 * @param {'human'|'orc'} faction
 * @returns {THREE.BufferGeometry} geometria compartilhada (não descarte)
 */
export function getWallGeometry(faction) {
  if (_geoCache.has(faction)) return _geoCache.get(faction);
  let geo;
  if (faction === 'orc') {
    const wood = 0x3b2a1e;
    const woodLight = 0x5a4029;
    const iron = 0x4b5563;
    geo = build([
      part(2.2, 2.0, 2.2, 0, 1.0, 0, wood),
      part(2.3, 0.18, 2.3, 0, 0.5, 0, iron),
      part(2.3, 0.18, 2.3, 0, 1.5, 0, iron),
      part(0.42, 0.5, 0.42, -0.8, 2.15, -0.8, woodLight),
      part(0.42, 0.5, 0.42, 0.8, 2.15, -0.8, woodLight),
      part(0.42, 0.5, 0.42, -0.8, 2.15, 0.8, woodLight),
      part(0.42, 0.5, 0.42, 0.8, 2.15, 0.8, woodLight),
      part(0.16, 0.4, 0.16, 0, 2.35, 0, iron)
    ]);
  } else {
    const stone = 0xb8c0c8;
    const stoneDark = 0x6b7280;
    const stoneLight = 0xd6dbe0;
    geo = build([
      part(2.2, 0.5, 2.2, 0, 0.25, 0, stoneDark),
      part(2.0, 1.5, 2.0, 0, 1.25, 0, stone),
      part(2.2, 0.25, 2.2, 0, 2.0, 0, stoneLight),
      part(0.6, 0.35, 0.6, -0.7, 2.27, -0.7, stoneLight),
      part(0.6, 0.35, 0.6, 0.7, 2.27, -0.7, stoneLight),
      part(0.6, 0.35, 0.6, -0.7, 2.27, 0.7, stoneLight),
      part(0.6, 0.35, 0.6, 0.7, 2.27, 0.7, stoneLight)
    ]);
  }
  _geoCache.set(faction, geo);
  return geo;
}

const _matCache = new Map();

/** Material (com cor por vértice) compartilhado por facção. */
export function getWallMaterial(faction) {
  if (_matCache.has(faction)) return _matCache.get(faction);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: faction === 'orc' ? 0.8 : 0.85
  });
  _matCache.set(faction, mat);
  return mat;
}

/** Segmento avulso (usado como fantasma de colocação e no inspetor). */
export function createWallSegment(faction = 'human') {
  const group = new THREE.Group();
  group.name = faction === 'orc' ? 'WallOrc' : 'WallHuman';
  const mesh = new THREE.Mesh(getWallGeometry(faction), getWallMaterial(faction));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
