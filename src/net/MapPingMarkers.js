/**
 * MapPingMarkers.js — F9-04: marcas 3D dos pings de aliados no terreno (anel que pulsa + coluna de luz).
 * Só apresentação: lê `MapPings.active(now)` a cada quadro; nada aqui toca a simulação. Um conjunto fixo de
 * malhas é reutilizado (no máx. 8 jogadores x 3 pings = 24).
 */
import * as THREE from 'three';

const POOL = 24;
const TYPE_COLORS = { attention: '#ffd700', attack: '#ff3b30', defend: '#38bdf8', help: '#a3e635' };

export class MapPingMarkers {
  /** @param {THREE.Scene} scene @param {{getHeight: (x: number, z: number) => number}} terrain */
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'MapPingMarkers';
    scene.add(this.group);
    const ringGeo = new THREE.RingGeometry(0.8, 1.1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 9, 8, 1, true);
    beamGeo.translate(0, 4.5, 0);
    this.slots = [];
    for (let i = 0; i < POOL; i++) {
      const mk = () => {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
        mat.userData.noFog = true;
        return mat;
      };
      const ring = new THREE.Mesh(ringGeo, mk());
      const beam = new THREE.Mesh(beamGeo, mk());
      ring.visible = beam.visible = false;
      this.group.add(ring, beam);
      this.slots.push({ ring, beam });
    }
  }

  /** @param {{x: number, z: number, kind: string, color: string|null, age: number}[]} pings */
  update(pings) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const p = pings[i];
      if (!p) {
        s.ring.visible = s.beam.visible = false;
        continue;
      }
      const y = this.terrain.getHeight(p.x, p.z) + 0.15;
      const col = p.color || TYPE_COLORS[p.kind] || TYPE_COLORS.attention;
      const fade = Math.max(0, 1 - p.age);
      const pulse = (p.age * 6) % 1;
      s.ring.visible = s.beam.visible = true;
      s.ring.position.set(p.x, y, p.z);
      s.beam.position.set(p.x, y, p.z);
      s.ring.scale.setScalar(1 + pulse * 2.2);
      s.ring.material.color.set(col);
      s.beam.material.color.set(col);
      s.ring.material.opacity = 0.9 * fade * (1 - pulse * 0.6);
      s.beam.material.opacity = 0.35 * fade;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    const geos = new Set();
    for (const s of this.slots) {
      geos.add(s.ring.geometry);
      geos.add(s.beam.geometry);
      s.ring.material.dispose();
      s.beam.material.dispose();
    }
    geos.forEach((g) => g.dispose());
    this.slots = [];
  }
}
