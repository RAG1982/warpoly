/**
 * CorpseDecals.js (F7-05) — corpos que decaem após a morte: um único InstancedMesh (1 draw call) de "corpos"
 * achatados. Aparecem quando a animação de morte da unidade termina (`CORPSE.delay`), permanecem `linger` s e depois
 * afundam/encolhem até sumir (`corpseDecay`, função pura). Pool fixo com teto (sem alocação por frame); ao lotar,
 * recicla o mais antigo. Só apresentação (não é o `CorpsePool` da sim, que alimenta Erguer Mortos).
 */
import * as THREE from 'three';
import { corpseDecay, CORPSE } from './vfxMapping.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _col = new THREE.Color();
const BLOOD = new THREE.Color('#4a1014');

export class CorpseDecals {
  /** @param {THREE.Scene} scene @param {number} cap 0 = desligado */
  constructor(scene, cap) {
    this.scene = scene;
    this.cap = Math.max(0, cap | 0);
    this.count = 0;
    this.mesh = null;
    if (this.cap === 0) return;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.z = new Float32Array(cap);
    this.rot = new Float32Array(cap); this.age = new Float32Array(cap);
    this.seq = new Uint32Array(cap);
    this._seq = 0;
    const geo = new THREE.BoxGeometry(0.95, 0.16, 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.name = 'vfx-corpses';
    // instanceColor pré-alocado (evita realocar ao primeiro setColorAt)
    this.mesh.setColorAt(0, _col.set(0xffffff));
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Registra um cadáver visual em (x,y,z) com a cor do time. Sem alocação além de reaproveitar o slot mais antigo. */
  add(x, y, z, rot, hexColor) {
    if (!this.mesh) return;
    let i;
    if (this.count < this.cap) i = this.count++;
    else { // recicla o mais antigo
      i = 0;
      for (let j = 1; j < this.cap; j++) if (this.seq[j] < this.seq[i]) i = j;
    }
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.rot[i] = rot; this.age[i] = 0;
    this.seq[i] = ++this._seq;
    _col.set(hexColor || '#6b7280').lerp(BLOOD, 0.55);
    this.mesh.setColorAt(i, _col);
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.count;
    this.mesh.visible = true;
  }

  update(delta) {
    if (!this.mesh || this.count === 0) return;
    let i = 0;
    while (i < this.count) {
      this.age[i] += delta;
      const st = corpseDecay(this.age[i], CORPSE);
      if (st.done) { // swap-remove com o último
        const l = --this.count;
        if (i !== l) {
          this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l];
          this.rot[i] = this.rot[l]; this.age[i] = this.age[l]; this.seq[i] = this.seq[l];
          this.mesh.getColorAt(l, _col);
          this.mesh.setColorAt(i, _col);
          this.mesh.instanceColor.needsUpdate = true;
        }
        continue;
      }
      const sc = st.visible ? st.scale : 0;
      _p.set(this.x[i], this.y[i] + 0.06 - st.sink, this.z[i]);
      _e.set(0, this.rot[i], 0);
      _q.setFromEuler(_e);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.count === 0) this.mesh.visible = false;
  }

  clear() {
    this.count = 0;
    if (this.mesh) { this.mesh.count = 0; this.mesh.visible = false; }
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.mesh = null;
  }
}
