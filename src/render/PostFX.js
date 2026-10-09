/**
 * PostFX.js (F7-03) — pós-processamento opcional sobre o three/examples (EffectComposer):
 *   RenderPass → [GTAOPass (AO de tela)] → [UnrealBloomPass (limiar HDR; ver bloomTag.js)] → [contorno de seleção]
 *   → [color grading por tileset] → OutputPass (tone mapping + sRGB do renderer).
 * Cada etapa é opcional e escolhida por `selectEffects` (src/core/lighting.js). Sem nenhuma etapa não existe composer
 * (o SceneManager renderiza direto: custo zero, é o caminho de `?texq=low`).
 *
 * Contorno: as malhas selecionadas (camada OUTLINE_LAYER) são desenhadas brancas num alvo de meia resolução; o shader
 * de contorno pinta a borda externa (diferença da máscara com os vizinhos). Sem seleção, o alvo não é nem renderizado.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { anyEffect, bloomStrengthFor, NEUTRAL_GRADE } from '../core/lighting.js';
import { OUTLINE_LAYER, outlineCount } from './postfx/outlineLayer.js';
import { BloomTagger } from './postfx/bloomTag.js';

const BLOOM_BASE = { strength: 0.55, radius: 0.55, threshold: 1.15 };
const OUTLINE_COLOR = 0x7dffb0;

const GradeShader = {
  name: 'WarPolyGrade',
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    sat: { value: 1 },
    contrast: { value: 1 },
    brightness: { value: 1 },
    vignette: { value: 0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 tint; uniform float sat, contrast, brightness, vignette;
    varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb * tint * brightness;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = max((c - 0.18) * contrast + 0.18, 0.0);
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.75, dot(d, d) * 2.0);
      gl_FragColor = vec4(c, t.a);
    }`
};

const OutlineShader = {
  name: 'WarPolyOutline',
  uniforms: {
    tDiffuse: { value: null },
    tMask: { value: null },
    texel: { value: new THREE.Vector2(1, 1) },
    color: { value: new THREE.Color(OUTLINE_COLOR) }
  },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tMask; uniform vec2 texel; uniform vec3 color;
    varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      float c = texture2D(tMask, vUv).r;
      float n = max(max(texture2D(tMask, vUv + vec2(texel.x, 0.0)).r, texture2D(tMask, vUv - vec2(texel.x, 0.0)).r),
                    max(texture2D(tMask, vUv + vec2(0.0, texel.y)).r, texture2D(tMask, vUv - vec2(0.0, texel.y)).r));
      float e = clamp(n - c, 0.0, 1.0);
      gl_FragColor = vec4(mix(t.rgb, color * 1.6, e * 0.95), t.a);
    }`
};

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.effects = { bloom: false, ssao: false, colorGrading: false, selectionOutline: false };
    this.composer = null;
    this.tagger = new BloomTagger(scene);
    this.grade = NEUTRAL_GRADE;
    this.night = 0;
    this._key = '';
    this._maskRT = null;
    this._maskMat = null;
    this._passes = {};
    this._bg = new THREE.Color();
  }

  /** Há composer ativo (o SceneManager chama `render` em vez de `renderer.render`). */
  get active() { return !!this.composer; }

  /** Reconstrói os passes conforme os efeitos pedidos (idempotente). */
  configure(effects) {
    const next = { bloom: !!effects.bloom, ssao: !!effects.ssao, colorGrading: !!effects.colorGrading, selectionOutline: !!effects.selectionOutline };
    const same = Object.keys(next).every((k) => next[k] === this.effects[k]);
    if (same && (this.composer || !anyEffect(next))) return;
    this._disposeComposer();
    this.effects = next;
    this.tagger.setActive(next.bloom);
    if (!anyEffect(next)) return;

    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const w = Math.max(1, Math.floor(size.x * pr));
    const h = Math.max(1, Math.floor(size.y * pr));
    // MSAA no alvo HDR do composer quando o contexto foi criado com antialias (preset med+)
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: r.capabilities.isWebGL2 && r.getContext().getContextAttributes().antialias ? 4 : 0 });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));

    if (next.ssao) {
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 2, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
      this._passes.ao = ao;
      composer.addPass(ao);
    }
    if (next.bloom) {
      const b = new UnrealBloomPass(new THREE.Vector2(w, h), BLOOM_BASE.strength, BLOOM_BASE.radius, BLOOM_BASE.threshold);
      this._passes.bloom = b;
      composer.addPass(b);
    }
    if (next.selectionOutline) {
      this._maskRT = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), { type: THREE.UnsignedByteType });
      this._maskRT.texture.minFilter = this._maskRT.texture.magFilter = THREE.LinearFilter;
      this._maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
      const p = new ShaderPass(OutlineShader);
      p.uniforms.tMask.value = this._maskRT.texture;
      p.uniforms.texel.value.set(1 / this._maskRT.width, 1 / this._maskRT.height);
      this._passes.outline = p;
      composer.addPass(p);
    }
    if (next.colorGrading) {
      const g = new ShaderPass(GradeShader);
      this._passes.grade = g;
      composer.addPass(g);
      this.setGrade(this.grade);
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
    this._key = `${w}x${h}`;
  }

  /** Grade do tileset (ver `gradeOf`). */
  setGrade(g) {
    this.grade = g || NEUTRAL_GRADE;
    const p = this._passes.grade;
    if (!p) return;
    const u = p.uniforms;
    u.tint.value.set(this.grade.tint[0], this.grade.tint[1], this.grade.tint[2]);
    u.sat.value = this.grade.sat;
    u.contrast.value = this.grade.contrast;
    u.brightness.value = this.grade.brightness;
    u.vignette.value = this.grade.vignette;
  }

  /** `night` 0..1 (ciclo dia/noite): reforça o bloom à noite. */
  setNight(night) {
    this.night = night;
    if (this._passes.bloom) this._passes.bloom.strength = bloomStrengthFor(BLOOM_BASE.strength, night);
  }

  _syncSize() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const w = Math.max(1, Math.floor(size.x * pr));
    const h = Math.max(1, Math.floor(size.y * pr));
    const key = `${w}x${h}`;
    if (key === this._key) return;
    this._key = key;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);
    if (this._maskRT) {
      this._maskRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
      this._passes.outline.uniforms.texel.value.set(1 / this._maskRT.width, 1 / this._maskRT.height);
    }
  }

  _renderMask() {
    const r = this.renderer;
    const scene = this.scene;
    const cam = this.camera;
    const hasSel = outlineCount() > 0;
    this._passes.outline.enabled = hasSel;
    if (!hasSel) return;
    const prevBg = scene.background;
    const prevFog = scene.fog;
    const prevMask = cam.layers.mask;
    const prevTarget = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    const prevNeeds = r.shadowMap.needsUpdate;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this._maskMat;
    cam.layers.set(OUTLINE_LAYER);
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    r.setRenderTarget(this._maskRT);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevShadow;
    r.shadowMap.needsUpdate = prevNeeds;
    scene.overrideMaterial = null;
    cam.layers.mask = prevMask;
    scene.background = prevBg;
    scene.fog = prevFog;
  }

  render(delta) {
    this.tagger.tick();
    this._syncSize();
    if (this._passes.outline) this._renderMask();
    this.composer.render(delta);
  }

  _disposeComposer() {
    for (const k of Object.keys(this._passes)) this._passes[k].dispose?.();
    this._passes = {};
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
    if (this._maskRT) { this._maskRT.dispose(); this._maskRT = null; }
    if (this._maskMat) { this._maskMat.dispose(); this._maskMat = null; }
  }

  dispose() {
    this.tagger.setActive(false);
    this._disposeComposer();
  }
}
