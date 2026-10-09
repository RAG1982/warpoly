/**
 * VfxLayer.js (F7-05) — partículas GPU em pool. Três tipos = três draw calls novos no total:
 *   - `solid`  escombros, lascas, sangue, ossos (opaco, encolhe no fim da vida)
 *   - `smoke`  fumaça/poeira (translúcido, cresce e some)
 *   - `glow`   faíscas, brasas, magia (aditivo; `material.userData.bloom = true` => entra no bloom do PostFX)
 * Cada partícula é escrita uma vez (ParticleRing, arrays tipados) e a trajetória roda no vertex shader
 * (posição = início + vel·t, gravidade, parada no chão, fade/encolhimento por curva do tipo). Por frame a CPU só
 * avança `uTime` e (se houve spawn) reenvia os buffers: sem alocação.
 * Só apresentação: não entra no checksum, usa RNG de render (`createRenderRng`).
 */
import * as THREE from 'three';
import { ParticleRing } from './ParticleRing.js';
import { VFX_CAPS } from './vfxConfig.js';

const TIME_REBASE = 3000; // s de render; abaixo da perda de precisão de float no shader

const CURVES = {
  solid: { size: '1.0 - smoothstep(0.78, 1.0, k)', alpha: '1.0' },
  smoke: { size: 'mix(0.45, 1.7, sqrt(k))', alpha: 'smoothstep(0.0, 0.12, k) * (1.0 - k) * 0.6' },
  glow: { size: '(1.0 - k * 0.65) * smoothstep(0.0, 0.04, k + 0.04)', alpha: 'smoothstep(0.0, 0.05, k) * pow(1.0 - k, 1.4)' }
};

function makeMaterial(kind, uTime) {
  const additive = kind === 'glow';
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: kind !== 'solid',
    depthWrite: kind === 'solid',
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false
  });
  // Convenção do bloom (postfx/bloomTag.js): material com userData.bloom é elevado acima do limiar HDR.
  if (additive) m.userData.bloom = true;
  const curve = CURVES[kind];
  m.customProgramCacheKey = () => `warpoly-vfx-${kind}`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aStart; attribute vec3 aVel; attribute vec4 aPar; attribute vec4 aCg;
        uniform float uTime; varying float vVfxAlpha; varying vec3 vVfxCol;`)
      .replace('#include <begin_vertex>', `
        float age = uTime - aPar.x;
        float life = max(aPar.y, 0.0001);
        float k = clamp(age / life, 0.0, 1.0);
        float on = step(0.0, age) * step(age, aPar.y) * step(0.0002, aPar.y);
        float g = aPar.w;
        float ageH = age;
        if (g > 0.0) {
          float h = aStart.y - aCg.w;
          float tl = (aVel.y + sqrt(max(aVel.y * aVel.y + 2.0 * g * h, 0.0))) / g;
          ageH = min(age, tl);
        }
        vec3 off = aStart;
        off.xz += aVel.xz * ageH;
        off.y += aVel.y * age - 0.5 * g * age * age;
        if (g > 0.0) off.y = max(off.y, aCg.w + 0.03);
        float sc = aPar.z * (${curve.size}) * on;
        vVfxAlpha = ${curve.alpha};
        vVfxCol = aCg.rgb;
        vec3 transformed = position * sc + off;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n varying float vVfxAlpha; varying vec3 vVfxCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vVfxCol; diffuseColor.a *= vVfxAlpha;');
  };
  return m;
}

function baseGeometry(kind) {
  if (kind === 'solid') return new THREE.BoxGeometry(1, 1, 1);
  if (kind === 'smoke') return new THREE.IcosahedronGeometry(0.5, 0);
  return new THREE.OctahedronGeometry(0.5, 0);
}

class Layer {
  constructor(scene, kind, cap, uTime) {
    this.kind = kind;
    this.ring = new ParticleRing(cap);
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    if (cap <= 0) return;
    const base = baseGeometry(kind);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    if (base.getAttribute('normal')) g.setAttribute('normal', base.getAttribute('normal'));
    if (base.getAttribute('uv')) g.setAttribute('uv', base.getAttribute('uv'));
    const mk = (arr, n) => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    g.setAttribute('aStart', mk(this.ring.start, 3));
    g.setAttribute('aVel', mk(this.ring.vel, 3));
    g.setAttribute('aPar', mk(this.ring.par, 4));
    g.setAttribute('aCg', mk(this.ring.cg, 4));
    g.instanceCount = 0;
    this.geometry = g;
    this.material = makeMaterial(kind, uTime);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.name = `vfx-${kind}`;
    scene.add(this.mesh);
  }

  /** Reenvia os buffers se houve spawn; esconde o mesh (0 draw calls) quando nada foi escrito ainda. */
  sync() {
    if (!this.mesh) return;
    if (this.ring.dirty) {
      const g = this.geometry;
      g.getAttribute('aStart').needsUpdate = true;
      g.getAttribute('aVel').needsUpdate = true;
      g.getAttribute('aPar').needsUpdate = true;
      g.getAttribute('aCg').needsUpdate = true;
      g.instanceCount = this.ring.used;
      this.mesh.visible = this.ring.used > 0;
      this.ring.dirty = false;
    }
  }

  dispose(scene) {
    if (!this.mesh) return;
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.mesh = null;
  }
}

export class VfxLayer {
  /**
   * @param {THREE.Scene} scene
   * @param {'off'|'low'|'med'|'high'} level
   * @param {{caps?: object}} [opts] `caps` sobrescreve os tetos (testes/inspetor)
   */
  constructor(scene, level, opts = {}) {
    this.scene = scene;
    this.level = level;
    this.caps = opts.caps || VFX_CAPS[level] || VFX_CAPS.off;
    this.density = this.caps.density;
    this.time = 0;
    this._uTime = { value: 0 };
    this.solid = new Layer(scene, 'solid', this.caps.solid, this._uTime);
    this.smoke = new Layer(scene, 'smoke', this.caps.smoke, this._uTime);
    this.glow = new Layer(scene, 'glow', this.caps.glow, this._uTime);
    this.layers = [this.solid, this.smoke, this.glow];
  }

  get enabled() { return this.caps.density > 0; }

  /** Avança o relógio de render (pausado = não chamar). */
  update(delta) {
    if (!this.enabled) return;
    this.time += delta;
    if (this.time > TIME_REBASE) {
      for (const l of this.layers) l.ring.rebase(TIME_REBASE);
      this.time -= TIME_REBASE;
    }
    this._uTime.value = this.time;
    for (const l of this.layers) l.sync();
  }

  /** Estatísticas para testes/bench: vivas por tipo e draw calls potenciais. */
  stats() {
    const out = { level: this.level, drawCalls: 0 };
    for (const l of this.layers) {
      out[l.kind] = l.ring.aliveCount(this.time);
      if (l.mesh && l.mesh.visible) out.drawCalls++;
    }
    return out;
  }

  clear() {
    for (const l of this.layers) { l.ring.clear(); l.sync(); }
  }

  dispose() {
    for (const l of this.layers) l.dispose(this.scene);
  }
}
