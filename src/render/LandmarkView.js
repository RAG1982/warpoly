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
import { getLanguage, t } from '../i18n/index.js';
import { localize } from '../sim/missions/text.js';

const C = {
  stone: 0xa39b8e, stoneDark: 0x6e675d, wood: 0x7a5230, pole: 0x4a3322, cloth: 0xf4f4ee, table: 0x8b6239,
  pedestal: 0x8d8a96, crystal: 0x67e8f9, glow: 0xffd700,
  wellStone: 0xb9b2a4, wellWater: 0x2f9be0, puddle: 0x4fb6e8, grass: 0x5f9e45, trunk: 0x8a6a3c, leaf: 0x3f8f3a, bucket: 0x6b4a2b, rope: 0xd8c9a0
};
/** Anel de captura do poço por estado de ocupação: 0 neutro, 1 ocupado (jogador), 2 contestado. */
const WELL_RING = [0x38bdf8, 0x4ade80, 0xf87171];

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
  if (kind === 'water_well') {
    // poço de pedra: aro de 8 blocos + água, dois mastros com viga, polia e balde; poça/oásis de grama e uma palmeira
    const parts = [
      part(cyl(3.1, 3.1, 0.06, 18), C.grass, { y: 0.03 }), // tapete de grama (oásis)
      part(cyl(2.3, 2.3, 0.08, 18), C.puddle, { x: 3.4, y: 0.09, z: 1.8, sz: 0.7 }), // poça ao lado
      part(cyl(1.0, 1.0, 0.1, 14), C.wellWater, { y: 0.55 }) // água no fundo do aro
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(box(0.95, 0.9, 0.62), i % 2 ? C.stone : C.wellStone, { x: Math.cos(a) * 1.5, y: 0.45, z: Math.sin(a) * 1.5, ry: -a + Math.PI / 2 }));
    }
    parts.push(
      part(box(0.18, 3.2, 0.18), C.wood, { x: -1.55, y: 1.6, z: -0.4 }), part(box(0.18, 3.2, 0.18), C.wood, { x: 1.55, y: 1.6, z: -0.4 }),
      part(box(3.5, 0.2, 0.2), C.pole, { y: 3.2, z: -0.4 }),
      part(cyl(0.28, 0.28, 0.14, 8), C.stoneDark, { y: 3.0, z: -0.4, rz: Math.PI / 2 }),
      part(box(0.04, 1.6, 0.04), C.rope, { y: 2.2, z: -0.4 }),
      part(cyl(0.32, 0.26, 0.4, 8), C.bucket, { y: 1.3, z: -0.4 }),
      part(cyl(0.05, 0.1, 3.4, 5), C.trunk, { x: -3.6, y: 1.7, z: -1.6, rz: 0.12 }), // palmeira
      part(new THREE.ConeGeometry(1.3, 0.5, 6), C.leaf, { x: -3.2, y: 3.5, z: -1.6, sy: 0.6 }),
      part(new THREE.ConeGeometry(1.1, 0.4, 6), C.leaf, { x: -3.3, y: 3.2, z: -0.9, rx: 0.5, sy: 0.6 }),
      part(new THREE.ConeGeometry(1.1, 0.4, 6), C.leaf, { x: -3.3, y: 3.2, z: -2.3, rx: -0.5, sy: 0.6 })
    );
    return { body: mergeGeometries(parts) };
  }
  throw new Error(`LandmarkView: tipo de marco desconhecido "${kind}"`);
}

const GLOW_SECONDS = 3;

/** Rótulo do marco em textura de canvas (sprite sem profundidade: legível sempre). */
function labelTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(8,12,24,0.9)'; g.strokeText(text, 128, 34);
  g.fillStyle = '#e0f2fe'; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
    const view = { root, glow, glowGeo, glowMat, litSeen: 0, flashT: GLOW_SECONDS, extras: [] };
    if (lm.kind === 'water_well') this._addWellExtras(lm, view);
    this.scene.add(root);
    this.views.set(lm.id, view);
    return view;
  }

  /** Poço: anel + disco de captura no chão (raio real de ocupação) e rótulo; cor = estado (`wellStates`). */
  _addWellExtras(lm, view) {
    const r = (lm.radius ?? 9) / lm.scale;
    const terrain = this.gm.terrain;
    let top = 0;
    if (terrain) { // o anel fica acima do ponto mais alto do círculo (evita afundar no relevo)
      const y0 = terrain.getHeight(lm.x, lm.z);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        top = Math.max(top, terrain.getHeight(lm.x + Math.cos(a) * lm.radius, lm.z + Math.sin(a) * lm.radius) - y0);
      }
    }
    const y = Math.max(0.12, top + 0.12) / lm.scale;
    const ringGeo = new THREE.RingGeometry(r - 0.28, r, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(r - 0.28, 48);
    fillGeo.rotateX(-Math.PI / 2);
    const mk = (opacity) => {
      const m = new THREE.MeshBasicMaterial({ color: WELL_RING[0], transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      if (lm.known) excludeFromFog(m);
      return m;
    };
    const ringMat = mk(0.95), fillMat = mk(0.14);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    ring.position.y = y; fill.position.y = y - 0.02;
    ring.renderOrder = 2; fill.renderOrder = 1;
    view.root.add(ring, fill);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    sprite.scale.set(6.4 / lm.scale, 1.6 / lm.scale, 1);
    sprite.position.y = 5.2 / lm.scale;
    sprite.renderOrder = 10;
    view.root.add(sprite);
    Object.assign(view, { ringMat, fillMat, sprite, wellState: -1, labelLang: null, geos: [ringGeo, fillGeo] });
  }

  _updateWell(lm, v, states) {
    const st = states.get(lm.id) ?? 0;
    if (st !== v.wellState) {
      v.wellState = st;
      v.ringMat.color.setHex(WELL_RING[st]);
      v.fillMat.color.setHex(WELL_RING[st]);
      v.fillMat.opacity = st === 0 ? 0.1 : 0.2;
    }
    const pulse = st === 2 ? 0.65 + 0.3 * Math.sin(this.t * 8) : 0.95;
    v.ringMat.opacity = pulse;
    const lang = getLanguage();
    if (v.labelLang !== lang) {
      v.labelLang = lang;
      v.sprite.material.map?.dispose();
      v.sprite.material.map = labelTexture(lm.label ? localize(lm.label, lang) : t('landmark.well'));
      v.sprite.material.needsUpdate = true;
    }
  }

  /** Quadro: cria/atualiza/remove os marcos conforme `gm.mission.landmarks`. */
  update(delta = 0) {
    this.t += delta;
    const list = this.gm.mission ? this.gm.mission.landmarks : [];
    const fog = this.gm.fogOfWar;
    const alive = new Set();
    const wellStates = list.some((l) => l.kind === 'water_well') ? this.gm.mission.wellStates() : null;
    for (const lm of list) {
      alive.add(lm.id);
      const v = this.views.get(lm.id) || this._create(lm);
      // visibilidade: `known` ou área explorada pela névoa (exploração é só presentação, não entra na sim)
      v.root.visible = lm.known || !fog || fog.isExplored(lm.x, lm.z);
      if (wellStates && lm.kind === 'water_well') this._updateWell(lm, v, wellStates);
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
      this._disposeView(v);
      this.views.delete(id);
    }
  }

  _disposeView(v) {
    this.scene.remove(v.root);
    v.glowGeo.dispose();
    v.glowMat.dispose();
    if (v.geos) for (const g of v.geos) g.dispose();
    v.ringMat?.dispose();
    v.fillMat?.dispose();
    if (v.sprite) { v.sprite.material.map?.dispose(); v.sprite.material.dispose(); }
  }

  dispose() {
    for (const v of this.views.values()) this._disposeView(v);
    this.views.clear();
    for (const g of this._geoCache.values()) for (const k of Object.keys(g)) g[k].dispose();
    this._geoCache.clear();
    for (const set of this._matSets.values()) for (const m of Object.values(set)) m.dispose();
    this._matSets.clear();
  }
}
