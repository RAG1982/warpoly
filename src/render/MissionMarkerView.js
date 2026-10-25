/**
 * MissionMarkerView.js — M3-X1: marcadores de objetivo no mundo e losangos sobre as unidades de objetivo.
 *
 * - Marcadores (`gm.mission.markers()`): anel pulsante no chão + coluna de luz fina aditiva na área do objetivo.
 *   Estilo `goal` dourado; `discover` ciano. Somem quando o objetivo termina ou falha.
 * - Unidades de objetivo (`escort`/`rescue` ativos): losango flutuante sobre cada unidade viva VISÍVEL pela névoa
 *   (depthTest off, para aparecer através de árvores). Cor = `markColor` da unidade (ou dourado).
 * Só apresentação: lê a missão e a névoa; nunca escreve na simulação. `dispose()` libera tudo (sprites/materiais).
 */
import * as THREE from 'three';
import { isAlive } from '../sim/missions/selectors.js';
import { excludeFromFog } from './fogOfWarShader.js';

const STYLE_COLOR = { goal: 0xffd700, discover: 0x67e8f9 };
const DEFAULT_ICON = '#ffd700';

/** Textura de losango (canvas), uma por cor. */
function diamondTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(32, 4); g.lineTo(60, 32); g.lineTo(32, 60); g.lineTo(4, 32); g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(15,10,0,0.85)';
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MissionMarkerView {
  /**
   * @param {object} gm  GameManager (com `mission`, `terrain`, `fogOfWar`, `entitiesById`)
   * @param {import('three').Scene} scene
   */
  constructor(gm, scene) {
    this.gm = gm;
    this.scene = scene;
    this.t = 0;
    /** @type {Map<string, {root:THREE.Group, ring:THREE.Mesh, column:THREE.Mesh, style:string, r:number}>} */
    this.markers = new Map();
    this.ringMats = new Map(); // style → material (um por estilo)
    this.columnMats = new Map();
    /** @type {Map<object, THREE.Sprite>} unidade → losango */
    this.icons = new Map();
    this.iconMats = new Map(); // cor → SpriteMaterial
    this.iconTextures = [];
  }

  _mat(map, style, make) {
    let m = map.get(style);
    if (!m) { m = make(STYLE_COLOR[style] ?? STYLE_COLOR.goal); excludeFromFog(m); map.set(style, m); } // marcadores são guias: sem névoa
    return m;
  }

  _createMarker(mk) {
    const root = new THREE.Group();
    const y = this.gm.terrain ? this.gm.terrain.getHeight(mk.area.x, mk.area.z) : 0;
    root.position.set(mk.area.x, y, mk.area.z);
    const ringGeo = new THREE.RingGeometry(mk.area.r * 0.82, mk.area.r, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, this._mat(this.ringMats, mk.style, (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })));
    ring.position.y = 0.12;
    const columnGeo = new THREE.CylinderGeometry(0.22, 0.22, 14, 8, 1, true);
    columnGeo.translate(0, 7, 0);
    const column = new THREE.Mesh(columnGeo, this._mat(this.columnMats, mk.style, (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
    root.add(ring, column);
    this.scene.add(root);
    const rec = { root, ring, column, style: mk.style, r: mk.area.r, ringGeo, columnGeo };
    this.markers.set(mk.id, rec);
    return rec;
  }

  _removeMarker(rec) {
    this.scene.remove(rec.root);
    rec.ringGeo.dispose();
    rec.columnGeo.dispose();
  }

  /** Objetivos ativos de escolta/resgate → unidades vivas com a tag (ordem de inserção). */
  _objectiveUnits() {
    const out = [];
    const rt = this.gm.mission;
    for (const o of rt.objectives.values()) {
      if (o.status !== 'active' || !o.def.tag || (o.def.type !== 'escort' && o.def.type !== 'rescue')) continue;
      for (const id of rt.tags.get(o.def.tag) || []) {
        const e = this.gm.entitiesById.get(id);
        if (isAlive(e) && !out.includes(e)) out.push(e);
      }
    }
    return out;
  }

  _iconMaterial(color) {
    const key = color || DEFAULT_ICON;
    let m = this.iconMats.get(key);
    if (!m) {
      const tex = diamondTexture(key);
      this.iconTextures.push(tex);
      m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      excludeFromFog(m);
      this.iconMats.set(key, m);
    }
    return m;
  }

  update(delta = 0) {
    this.t += delta;
    const rt = this.gm.mission;
    if (!rt) return;

    // 1. Marcadores de objetivo
    const wanted = rt.markers();
    const seen = new Set();
    for (const mk of wanted) {
      seen.add(mk.id);
      let rec = this.markers.get(mk.id);
      if (rec && (rec.style !== mk.style || rec.r !== mk.area.r)) { this._removeMarker(rec); this.markers.delete(mk.id); rec = null; }
      if (!rec) rec = this._createMarker(mk);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      rec.ring.material.opacity = 0.45 + 0.35 * pulse;
      rec.ring.scale.setScalar(1 + 0.02 * pulse);
      rec.column.material.opacity = 0.2 + 0.2 * pulse;
    }
    for (const [id, rec] of this.markers) {
      if (seen.has(id)) continue;
      this._removeMarker(rec);
      this.markers.delete(id);
    }

    // 2. Losangos sobre as unidades de objetivo visíveis pela névoa
    const fog = this.gm.fogOfWar;
    const units = this._objectiveUnits();
    const live = new Set(units);
    for (const u of units) {
      const p = u.mesh.position;
      const visible = !fog || fog.isVisible(p.x, p.z);
      let sprite = this.icons.get(u);
      if (!sprite) {
        sprite = new THREE.Sprite(this._iconMaterial(u.markColor));
        sprite.renderOrder = 999;
        sprite.scale.set(1.1, 1.1, 1);
        this.scene.add(sprite);
        this.icons.set(u, sprite);
      }
      sprite.visible = visible;
      sprite.position.set(p.x, p.y + 3.4 + 0.25 * Math.sin(this.t * 3), p.z);
    }
    for (const [u, sprite] of this.icons) {
      if (live.has(u)) continue;
      this.scene.remove(sprite);
      this.icons.delete(u);
    }
  }

  dispose() {
    for (const rec of this.markers.values()) this._removeMarker(rec);
    this.markers.clear();
    for (const sprite of this.icons.values()) this.scene.remove(sprite);
    this.icons.clear();
    for (const m of [...this.ringMats.values(), ...this.columnMats.values(), ...this.iconMats.values()]) m.dispose();
    this.ringMats.clear(); this.columnMats.clear(); this.iconMats.clear();
    for (const tex of this.iconTextures) tex.dispose();
    this.iconTextures = [];
  }
}
