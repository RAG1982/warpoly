/**
 * LandmarkView.js — M3-X1: desenha os marcos das missões (`spawnLandmark`: ruínas, posto de trégua, altar).
 *
 * Só apresentação: lê `gm.mission.landmarks` e a névoa (`isExplored`); nunca escreve na simulação. Cada marco é um
 * modelo procedural low-poly mesclado num único mesh (1 draw call), com material de vértices compartilhado pela view.
 * O altar tem o cristal em malha própria (animado) e todo marco tem um clarão (`glow`) que aparece quando é aceso
 * (`lit`, ação `lightLandmark`). Marcos sem `known` só aparecem depois de explorados pela névoa.
 * Descarte: `dispose()` remove tudo da cena e libera geometrias/materiais (a partida é descartada pela MatchSession).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { excludeFromFog } from './fogOfWarShader.js';

const C = {
  stone: 0xa39b8e, stoneDark: 0x6e675d, wood: 0x7a5230, pole: 0x4a3322, cloth: 0xf4f4ee, table: 0x8b6239,
  pedestal: 0x8d8a96, crystal: 0x67e8f9, glow: 0xffd700
};

/** Geometria não indexada com cor por vértice, transformada e pronta para mesclar. */
function part(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Modelos por tipo (origem no chão, frente para +Z). Retorna `{ body, crystal? }` — geometrias prontas. */
export function buildLandmarkGeometry(kind) {
  if (kind === 'ruins') {
    // colunas quebradas + arco + entulho
    const parts = [
      part(cyl(0.42, 0.48, 3.2), C.stone, { x: -1.6, y: 1.6, z: 0 }),
      part(cyl(0.42, 0.48, 1.9), C.stone, { x: 0.2, y: 0.95, z: 0.9, rz: 0.12 }),
      part(cyl(0.42, 0.48, 1.0), C.stoneDark, { x: -0.5, y: 0.5, z: -1.4 }),
      part(box(0.7, 0.5, 0.7), C.stone, { x: 1.9, y: 2.45, z: -0.4 }),
      part(box(0.5, 2.6, 0.5), C.stone, { x: 2.8, y: 1.3, z: -0.4 }),
      part(box(0.5, 2.6, 0.5), C.stoneDark, { x: 4.4, y: 1.3, z: -0.4 }),
      part(box(2.4, 0.4, 0.6), C.stone, { x: 3.6, y: 2.8, z: -0.4, rz: 0.04 }),
      part(new THREE.DodecahedronGeometry(0.45), C.stoneDark, { x: 0.9, y: 0.2, z: -1.2, sy: 0.5 }),
      part(new THREE.DodecahedronGeometry(0.32), C.stone, { x: 1.4, y: 0.12, z: 0.5, sy: 0.5 }),
      part(new THREE.DodecahedronGeometry(0.28), C.stoneDark, { x: -2.6, y: 0.1, z: 1.1, sy: 0.5 })
    ];
    return { body: mergeGeometries(parts) };
  }
  if (kind === 'truce_post') {
    // mastro com bandeira branca + tenda pequena + mesa
    const parts = [
      part(cyl(0.07, 0.09, 5.2, 6), C.pole, { y: 2.6 }),
      part(box(0.05, 1.3, 1.7), C.cloth, { x: 0.02, y: 4.0, z: 0.85 }),
      part(new THREE.ConeGeometry(1.2, 1.6, 4), C.cloth, { x: -1.9, y: 0.8, z: -1.3, ry: Math.PI / 4 }),
      part(box(1.4, 0.1, 0.8), C.table, { x: -1.9, y: 0.75, z: 0.6 }),
      part(box(0.1, 0.7, 0.1), C.wood, { x: -2.5, y: 0.35, z: 0.3 }),
      part(box(0.1, 0.7, 0.1), C.wood, { x: -1.3, y: 0.35, z: 0.9 })
    ];
    return { body: mergeGeometries(parts) };
  }
  if (kind === 'shrine') {
    // pedestal de pedra + cristal (cristal em malha própria, animada)
    const body = mergeGeometries([
      part(box(1.8, 0.9, 1.8), C.pedestal, { y: 0.45 }),
      part(box(2.1, 0.2, 2.1), C.stoneDark, { y: 1.0 }),
      part(box(0.3, 1.1, 0.3), C.stoneDark, { x: 0.8, y: 1.6, z: 0.8 }),
      part(box(0.3, 1.1, 0.3), C.stoneDark, { x: -0.8, y: 1.6, z: -0.8 })
    ]);
    const crystal = mergeGeometries([part(new THREE.OctahedronGeometry(0.7), C.crystal, { y: 2.3, sy: 1.4 })]);
    return { body, crystal };
  }
  throw new Error(`LandmarkView: tipo de marco desconhecido "${kind}"`);
}

const GLOW_SECONDS = 3;

export class LandmarkView {
  /**
   * @param {object} gm  GameManager (com `mission`, `terrain`, `fogOfWar`)
   * @param {import('three').Scene} scene
   */
  constructor(gm, scene) {
    this.gm = gm;
    this.scene = scene;
    this.t = 0;
    /** @type {Map<number, object>} id do marco → { root, body, crystal, glow, litSeen, flashT } */
    this.views = new Map();
    /** Materiais: `known` (visível sem exploração, fora da névoa) e os demais (escurecidos pela névoa até explorar). */
    this._matSets = new Map();
    this._geoCache = new Map();
  }

  _geometries(kind) {
    let g = this._geoCache.get(kind);
    if (!g) { g = buildLandmarkGeometry(kind); this._geoCache.set(kind, g); }
    return g;
  }

  _matSet(free) {
    let set = this._matSets.get(free);
    if (!set) {
      set = {
        body: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
        crystal: new THREE.MeshBasicMaterial({ color: C.crystal, transparent: true, opacity: 0.9 })
      };
      if (free) for (const m of Object.values(set)) excludeFromFog(m);
      this._matSets.set(free, set);
    }
    return set;
  }

  _create(lm) {
    const geo = this._geometries(lm.kind);
    const root = new THREE.Group();
    const y = this.gm.terrain ? this.gm.terrain.getHeight(lm.x, lm.z) : 0;
    root.position.set(lm.x, y, lm.z);
    root.rotation.y = (lm.facing * Math.PI) / 180;
    root.scale.setScalar(lm.scale);
    const mats = this._matSet(lm.known === true);
    const body = new THREE.Mesh(geo.body, mats.body);
    root.add(body);
    let crystal = null;
    if (geo.crystal) {
      crystal = new THREE.Mesh(geo.crystal, mats.crystal);
      root.add(crystal);
    }
    const glowGeo = new THREE.CircleGeometry(2.6, 24);
    glowGeo.rotateX(-Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    if (lm.known) excludeFromFog(glowMat);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 0.08;
    glow.visible = false;
    root.add(glow);
    this.scene.add(root);
    const view = { root, glow, glowGeo, glowMat, litSeen: 0, flashT: GLOW_SECONDS };
    this.views.set(lm.id, view);
    return view;
  }

  /** Quadro: cria/atualiza/remove os marcos conforme `gm.mission.landmarks`. */
  update(delta = 0) {
    this.t += delta;
    const list = this.gm.mission ? this.gm.mission.landmarks : [];
    const fog = this.gm.fogOfWar;
    const alive = new Set();
    for (const lm of list) {
      alive.add(lm.id);
      const v = this.views.get(lm.id) || this._create(lm);
      // visibilidade: `known` ou área explorada pela névoa (exploração é só presentação, não entra na sim)
      v.root.visible = lm.known || !fog || fog.isExplored(lm.x, lm.z);
      if (lm.lit && v.litSeen !== lm.lit) { v.litSeen = lm.lit; v.flashT = 0; }
      if (v.flashT < GLOW_SECONDS) {
        v.flashT += delta;
        const k = Math.min(1, v.flashT / GLOW_SECONDS);
        v.glow.visible = true;
        v.glowMat.opacity = (1 - k) * (0.55 + 0.25 * Math.sin(this.t * 6));
        v.glow.scale.setScalar(1 + k * 1.5);
      } else v.glow.visible = false;
      if (v.crystal) v.crystal.rotation.y = this.t * 0.8;
    }
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      this.scene.remove(v.root);
      v.glowGeo.dispose();
      v.glowMat.dispose();
      this.views.delete(id);
    }
  }

  dispose() {
    for (const v of this.views.values()) {
      this.scene.remove(v.root);
      v.glowGeo.dispose();
      v.glowMat.dispose();
    }
    this.views.clear();
    for (const g of this._geoCache.values()) for (const k of Object.keys(g)) g[k].dispose();
    this._geoCache.clear();
    for (const set of this._matSets.values()) for (const m of Object.values(set)) m.dispose();
    this._matSets.clear();
  }
}
