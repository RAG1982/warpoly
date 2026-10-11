import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL_STEP } from '../data/buildings.js';

/**
 * NEW-24 — portão VISUAL de muralha. Não existe portão na simulação (F3-08): onde o jogador deixou uma lacuna
 * intencional entre dois segmentos consecutivos da mesma muralha, o render desenha dois pilares + uma travessa.
 * Só leitura da sim; nenhum comando nem estado novo.
 */

/** Distância máxima entre centros considerada "contínua" (passo normal + folga de arredondamento). */
export const WALL_CONTINUOUS_MAX = WALL_STEP * 1.25;
/** Lacuna máxima: 3 passos entre centros (2 segmentos ausentes). */
export const WALL_GAP_MAX = WALL_STEP * 3 + 0.01;

/**
 * Detecta lacunas entre segmentos consecutivos de uma mesma polilinha (mesmo dono e tipo, em ordem de criação).
 * Lacuna = distância entre centros > passo normal e <= 3 passos.
 * @param {{x:number,z:number,ownerId?:number,type?:string}[]} segments  na ordem de criação
 * @returns {{x:number,z:number,angle:number,width:number,ownerId:number|undefined,type:string|undefined,a:object,b:object}[]}
 *   `x,z` = meio da lacuna; `angle` = direção da muralha (atan2(dz, dx)); `width` = distância entre os centros vizinhos
 */
export function findWallGaps(segments) {
  const gaps = [];
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1];
    const b = segments[i];
    if (a.ownerId !== b.ownerId || a.type !== b.type) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d <= WALL_CONTINUOUS_MAX || d > WALL_GAP_MAX) continue;
    gaps.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      angle: Math.atan2(dz, dx),
      width: d,
      ownerId: a.ownerId,
      type: a.type,
      a,
      b
    });
  }
  return gaps;
}

const _geoCache = new Map();

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Geometria do portão (eixo X = direção da muralha), 3 caixas (36 triângulos). Cache por largura. */
export function getGateGeometry(width) {
  const key = Math.round(width * 10);
  if (_geoCache.has(key)) return _geoCache.get(key);
  const open = Math.max(0.8, width - 2.2); // vão livre entre as bordas dos blocos vizinhos
  const px = open / 2 + 0.2;
  const geo = mergeGeometries([
    box(0.5, 2.6, 0.7, -px, 1.3, 0),
    box(0.5, 2.6, 0.7, px, 1.3, 0),
    box(open + 1.2, 0.45, 0.8, 0, 2.55, 0)
  ], false);
  _geoCache.set(key, geo);
  return geo;
}

const _matCache = new Map();
function gateMaterial(color) {
  if (!_matCache.has(color)) {
    _matCache.set(color, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), flatShading: true, roughness: 0.8 }));
  }
  return _matCache.get(color);
}

/** Gerencia as malhas de portão de uma partida (reconstrói só quando a lista de lacunas muda). */
export class WallGates {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'WallGates';
    if (scene) scene.add(this.group);
    this._key = '';
    this._tick = 0;
  }

  /**
   * @param {object} gm  GameManager (buildings, terrain, fogOfWar, localPlayerId, isHostile)
   * @param {(ownerId:number)=>string} colorOf  cor CSS do dono
   */
  update(gm, colorOf) {
    if ((this._tick++ % 15) !== 0) return;
    const fog = gm.fogOfWar;
    const walls = gm.buildings
      .filter(b => b.role === 'wall' && !b.isDead && b.isConstructed
        && (!gm.isHostile(gm.localPlayerId, b.ownerId) || !fog || fog.isBuildingKnown(b)))
      .map(b => ({ x: b.mesh.position.x, z: b.mesh.position.z, ownerId: b.ownerId, type: b.type }));
    const gaps = findWallGaps(walls);
    const key = gaps.map(g => `${g.x.toFixed(2)},${g.z.toFixed(2)},${g.ownerId}`).join('|');
    if (key === this._key) return;
    this._key = key;
    this.clear();
    for (const g of gaps) {
      const mesh = new THREE.Mesh(getGateGeometry(g.width), gateMaterial(colorOf(g.ownerId)));
      mesh.name = 'WallGate';
      const ground = gm.terrain && gm.terrain.getHeight ? gm.terrain.getHeight(g.x, g.z) : 0;
      mesh.position.set(g.x, ground, g.z);
      mesh.rotation.y = -g.angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  clear() {
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }

  dispose() {
    this.clear();
    if (this.scene) this.scene.remove(this.group);
  }
}
