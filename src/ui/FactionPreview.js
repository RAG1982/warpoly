/**
 * FactionPreview.js (F6-02) — prévia 3D leve da facção no painel de Escaramuça.
 *
 * Renderer próprio e minúsculo (sem SceneManager/ModelFactory): carrega só o .glb do QG e de uma
 * unidade da facção, enquadra e gira. Importado sob demanda pelo menu; `dispose()` libera o
 * contexto WebGL ao fechar o painel/iniciar a partida. Sem WebGL → `create()` devolve null e o
 * menu mostra o emblema da facção.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { setTeamColor } from '../entities/glbModels.js';

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const MODELS = {
  human: { hq: ['castle', 'Castle'], unit: ['knight', 'Knight'] },
  orc: { hq: ['great_hall', 'GreatHall'], unit: ['grunt', 'Grunt'] }
};

const cache = new Map(); // url → Promise<THREE.Object3D>
function loadModel(file, rootName) {
  const url = `${BASE}models/${file}.glb`;
  if (!cache.has(url)) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    cache.set(url, loader.loadAsync(url).then((g) => g.scene.getObjectByName(rootName) || g.scene));
  }
  return cache.get(url);
}

/** Escala `obj` para `height` de altura e apoia a base em y = 0, centrada em x/z. */
function normalize(obj, height) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const k = height / Math.max(size.y, 1e-3);
  obj.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= b2.min.y;
}

export class FactionPreview {
  /** @returns {FactionPreview|null} null se não houver WebGL */
  static create(canvas) {
    try {
      return new FactionPreview(canvas);
    } catch (err) {
      console.warn('[FactionPreview] WebGL indisponível:', err);
      return null;
    }
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 3.1, 9.2);
    this.camera.lookAt(0, 1.7, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff1d0, 0x2a2438, 1.35));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.4);
    sun.position.set(4, 7, 5);
    this.scene.add(sun);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.faction = null;
    this.color = '#2563eb';
    this._token = 0;
    this._raf = 0;
    this._last = performance.now();
    this._tick = this._tick.bind(this);
    this.resize();
    this._raf = requestAnimationFrame(this._tick);
  }

  resize() {
    const w = this.canvas.clientWidth || 240;
    const h = this.canvas.clientHeight || 240;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Mostra o QG + uma unidade da facção (`human` | `orc`). */
  async setFaction(faction) {
    if (!MODELS[faction] || faction === this.faction) return;
    this.faction = faction;
    const token = ++this._token;
    const def = MODELS[faction];
    const [hq, unit] = await Promise.all([loadModel(...def.hq), loadModel(...def.unit)]);
    if (token !== this._token || !this.renderer) return;
    this.pivot.clear();
    const hqObj = hq.clone(true);
    normalize(hqObj, 3.4);
    hqObj.position.z -= 0.6;
    const unitObj = unit.clone(true);
    normalize(unitObj, 1.9);
    unitObj.position.set(1.7, unitObj.position.y, 1.9);
    this.pivot.add(hqObj, unitObj);
    this.pivot.rotation.y = -0.5;
    this._applyColor();
  }

  setColor(color) {
    this.color = color;
    this._applyColor();
  }

  _applyColor() {
    if (this.pivot.children.length) setTeamColor(this.pivot, this.color);
  }

  _tick(now) {
    if (!this.renderer) return;
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (document.hidden) return;
    this.pivot.rotation.y += dt * 0.45;
    if (this.canvas.clientWidth && (this.canvas.width !== Math.round(this.canvas.clientWidth * this.renderer.getPixelRatio()))) this.resize();
    this.renderer.render(this.scene, this.camera);
  }

  /** true se o canvas já recebeu um quadro com algum conteúdo (para testes). */
  get hasModel() { return this.pivot.children.length > 0; }

  dispose() {
    if (!this.renderer) return;
    cancelAnimationFrame(this._raf);
    this._token++;
    this.pivot.clear(); // geometrias/texturas dos .glb ficam no cache compartilhado
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
  }
}
