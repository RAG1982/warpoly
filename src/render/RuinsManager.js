/**
 * RuinsManager.js — NEW-19: ruínas/clareiras puramente visuais (construção destruída, mina
 * esgotada). Pool de slots reutilizáveis; 2 draw calls por ruína (decal + entulho mesclado).
 * Não toca a simulação: usa `Math.random` de apresentação e nunca `gm.rng`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EVT } from '../sim/events.js';
import { getBuildingDef } from '../data/index.js';
import { ruinAlpha, pickSlot, ruinRadius, RUIN_MAX, MINE_RUIN_RADIUS } from './ruinsLogic.js';

const SINK = 0.6;
/** Segmentos por lado do decal: ele acompanha o relevo (`_drape`). */
const DECAL_SEGS = 12;

function makeDecalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const blob = (col, r, n) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.55;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.25 + Math.random() * 0.3), 0, Math.PI * 2);
      g.fill();
    }
  };
  g.filter = 'blur(6px)';
  blob('#2b2118', 60, 14);
  blob('#3a3632', 50, 8);
  g.filter = 'blur(2px)';
  g.globalAlpha = 0.35;
  blob('#6b5a44', 40, 5); // cortes claros de terra
  g.globalAlpha = 1;
  const grad = g.createRadialGradient(0, 0, 20, 0, 0, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.filter = 'none';
  g.fillStyle = grad;
  g.fillRect(-64, -64, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class RuinsManager {
  /**
   * @param {import('../core/GameManager.js').GameManager} gm
   * @param {THREE.Scene} scene
   * @param {{current?:{name:string}}} quality  QualitySettings
   */
  constructor(gm, scene, quality) {
    this.gm = gm;
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'Ruins';
    scene.add(this.root);

    this.decalTex = makeDecalTexture();
    this.decalGeo = new THREE.PlaneGeometry(2, 2, DECAL_SEGS, DECAL_SEGS).rotateX(-Math.PI / 2); // molde; cada slot clona (o relevo é por ruína)
    this._tmpColor = new THREE.Color();

    this.slots = [];
    for (let i = 0; i < RUIN_MAX; i++) {
      const decalMat = new THREE.MeshBasicMaterial({
        map: this.decalTex, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
      const decal = new THREE.Mesh(this.decalGeo.clone(), decalMat);
      decal.renderOrder = 1;
      const debrisMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, transparent: true });
      const debris = new THREE.Mesh(undefined, debrisMat);
      debris.castShadow = false;
      const group = new THREE.Group();
      group.add(decal, debris);
      group.visible = false;
      this.root.add(group);
      this.slots.push({ group, decal, debris, age: 0, state: 'free', baseY: 0, x: 0, z: 0 });
    }
  }

  /** Assina os eventos da simulação. Devolve `off()`. */
  attach() {
    const offs = [];
    offs.push(this.gm.events.on(EVT.BUILDING_DESTROYED, ({ pos, buildingType }) => {
      let cr = 3;
      try { cr = getBuildingDef(buildingType)?.collisionRadius ?? 3; } catch { /* tipo desconhecido */ }
      this.spawn(pos, ruinRadius(cr), 'building');
    }));
    if (EVT.RESOURCE_DEPLETED) {
      offs.push(this.gm.events.on(EVT.RESOURCE_DEPLETED, ({ pos, resourceType }) => {
        if (resourceType === 'wood') return; // árvores não deixam ruína
        this.spawn(pos, MINE_RUIN_RADIUS, 'mine'); // a mina segue em pé: o decal tem de passar da pegada do modelo
      }));
    }
    this._offs = offs;
    return () => offs.forEach(off => off && off());
  }

  get _low() { return this.quality?.current?.name === 'low'; }

  _buildDebris(radius, kind, colors, pos, baseY) {
    const terrain = this.gm.terrain;
    const n = this._low ? 3 : 4 + Math.floor(Math.random() * 5);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const stone = kind === 'mine' ? i % 2 === 0 : i % 3 === 0;
      const s = (kind === 'mine' ? 4.4 : radius) * (0.12 + Math.random() * 0.14); // mina: peças de tamanho de prédio médio, não do raio do anel
      const geo = stone
        ? new THREE.DodecahedronGeometry(s * 0.7, 0).scale(1, 0.55, 1)
        : new THREE.BoxGeometry(s * (1.6 + Math.random()), s * 0.28, s * 0.4);
      geo.rotateY(Math.random() * Math.PI);
      if (!stone) { geo.rotateZ((Math.random() - 0.5) * 0.5); }
      const a = Math.random() * Math.PI * 2;
      // construção: o modelo sumiu, o entulho cai no miolo; mina: o modelo segue em pé, o entulho cai no anel fora da pegada (3,6–5,8 u)
      const d = kind === 'mine' ? radius * (0.5 + Math.random() * 0.3) : Math.random() * radius * 0.6;
      const gx = Math.cos(a) * d, gz = Math.sin(a) * d;
      const gy = terrain && terrain.getHeight ? terrain.getHeight(pos.x + gx, pos.z + gz) - baseY : 0; // cada peça assenta no relevo
      geo.translate(gx, s * 0.2 + gy, gz);
      const col = this._tmpColor.set(stone ? colors.stone : colors.wood);
      const arr = new Float32Array(geo.attributes.position.count * 3);
      for (let v = 0; v < arr.length; v += 3) { arr[v] = col.r; arr[v + 1] = col.g; arr[v + 2] = col.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geo.deleteAttribute('uv');
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    return merged;
  }

  /**
   * @param {{x:number,y?:number,z:number}} pos
   * @param {number} radius  raio final do decal
   * @param {'building'|'mine'} kind
   * @param {{wood:string|number, stone:string|number}} colors
   */
  spawn(pos, radius, kind = 'building', colors = { wood: 0x6b4a2b, stone: 0x77726a }) {
    const idx = pickSlot(this.slots);
    const s = this.slots[idx];
    s.x = pos.x; s.z = pos.z;
    s.baseY = this.gm.terrain?.getHeight?.(pos.x, pos.z) ?? 0;
    s.debris.geometry?.dispose();
    s.debris.geometry = this._buildDebris(radius, kind, colors, pos, s.baseY);
    s.decal.scale.set(radius, 1, radius);
    s.decal.material.opacity = 1;
    s.debris.material.opacity = 1;
    s.group.position.set(pos.x, 0, pos.z);
    s.decal.position.set(0, s.baseY, 0);
    this._drape(s, radius);
    s.debris.position.set(0, s.baseY, 0);
    s.age = 0;
    s.state = 'active';
    s.group.visible = true;
    this._applyFog(s);
  }

  /**
   * O decal acompanha o relevo em vez de ser um plano reto à altura do centro: minas ficam em morros (o terreno varia ±0,4 u em
   * 5 u do centro) e o plano reto ficava enterrado em metade do anel (captura de 2026-10-11). `+0,03` sobre o terreno + polygonOffset.
   */
  _drape(s, radius) {
    const terrain = this.gm.terrain;
    const pos = s.decal.geometry.attributes.position;
    const tpl = this.decalGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = terrain && terrain.getHeight ? terrain.getHeight(s.x + tpl.getX(i) * radius, s.z + tpl.getZ(i) * radius) : s.baseY;
      pos.setY(i, h - s.baseY + 0.03);
    }
    pos.needsUpdate = true;
  }

  _applyFog(s) {
    const fog = this.gm.fogOfWar;
    if (!fog || !fog.enabled) { s.group.visible = true; s.decal.material.color.setScalar(1); return; }
    if (!fog.isExplored(s.x, s.z)) { s.group.visible = false; return; }
    s.group.visible = true;
    s.decal.material.color.setScalar(fog.isVisible(s.x, s.z) ? 1 : 0.5);
  }

  update(dt) {
    const low = this._low;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.state === 'free') continue;
      s.age += dt;
      let a = ruinAlpha(s.age);
      if (s.age >= 50) {
        s.state = 'free';
        s.group.visible = false;
        continue;
      }
      if (low) a = a > 0 ? 1 : 0; // sem animação: troca direta
      s.decal.material.opacity = a;
      s.debris.material.opacity = a;
      s.debris.position.y = s.baseY - (1 - a) * SINK;
      s.debris.visible = a > 0.02;
      if (s.state === 'active') this._applyFog(s);
    }
  }

  clear() {
    for (const s of this.slots) { s.state = 'free'; s.age = 0; s.group.visible = false; }
  }

  dispose() {
    this._offs?.forEach(off => off && off());
    this.clear();
    this.scene.remove(this.root);
    for (const s of this.slots) { s.debris.geometry?.dispose(); s.decal.geometry.dispose(); s.decal.material.dispose(); s.debris.material.dispose(); }
    this.decalGeo.dispose();
    this.decalTex.dispose();
  }
}
