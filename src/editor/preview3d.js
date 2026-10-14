/**
 * src/editor/preview3d.js (F8-03) — prévia 3D do editor. Dois modos:
 *  - "leve": malha da própria grade com cores por altura + marcadores simples (atualiza em tempo real, ~10k vértices);
 *  - "jogo": monta o terreno do jogo (`Terrain` + `TerrainView` + `Water` + `Decorations`) a partir do JSON exportado, com o
 *    tileset do mapa — mais pesado, só reconstruído sob demanda.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Terrain } from '../sim/Terrain.js';
import { TerrainView } from '../render/TerrainView.js';
import { Water } from '../world/Water.js';
import { Decorations } from '../world/Decorations.js';
import { TILESETS, resolveTilesetId } from '../data/tilesets.js';
import { heightAtNode, nodeToWorld, heightAt, exportMap } from './mapModel.js';
import { heightColor, startColor } from './view2d.js';

const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export class Preview3D {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1200);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.scene = new THREE.Scene();
    this.mode = 'light';
    this.dirty = true;
    this.itemsDirty = true;
    this.model = null;
    this.size = 0;
    this.stage = null; // cena do modo "jogo"
    this.lightScene = new THREE.Scene();
    this.lightScene.background = new THREE.Color(0x9ec9e8);
    this.lightScene.add(new THREE.HemisphereLight(0xe8f4ff, 0x445533, 1.3));
    const sun = new THREE.DirectionalLight(0xfffaee, 2.2);
    sun.position.set(-60, 90, -40);
    this.lightScene.add(sun);
    this.markers = new THREE.Group();
    this.lightScene.add(this.markers);
    this.terrainMesh = null;
    this.waterMesh = null;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  resetCamera(size) {
    this.camera.position.set(size * 0.7, size * 0.75, size * 0.7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** `items: false` = só o terreno mudou (pincelada em andamento): não reconstrói os marcadores. */
  markDirty(items = true) {
    this.dirty = true;
    this.itemsDirty = this.itemsDirty || items;
  }

  setMode(mode) {
    this.mode = mode;
    this.dirty = true;
  }

  // ---- modo leve ----
  buildLightTerrain(model) {
    if (this.terrainMesh) {
      this.lightScene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.material.dispose();
    }
    const n = model.nodes;
    const geo = new THREE.PlaneGeometry(model.size, model.size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.95 }));
    this.lightScene.add(this.terrainMesh);
    if (!this.waterMesh) {
      this.waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x2f7fc4, transparent: true, opacity: 0.55, depthWrite: false }));
      this.waterMesh.rotation.x = -Math.PI / 2;
      this.lightScene.add(this.waterMesh);
    }
    this.waterMesh.scale.set(model.size, model.size, 1);
    this.size = model.size;
    this.gridNodes = n;
  }

  updateLight(model) {
    if (!this.terrainMesh || this.gridNodes !== model.nodes || this.size !== model.size) this.buildLightTerrain(model);
    const n = model.nodes;
    const pos = this.terrainMesh.geometry.attributes.position;
    const col = this.terrainMesh.geometry.attributes.color;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const h = heightAtNode(model, i, j);
        pos.setXYZ(k, nodeToWorld(model, i), Math.max(h, -1.5), nodeToWorld(model, j));
        const c = heightColor(h);
        col.setXYZ(k, (c[0] / 255) ** 2.2, (c[1] / 255) ** 2.2, (c[2] / 255) ** 2.2);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.terrainMesh.geometry.computeVertexNormals();
    this.waterMesh.position.y = model.waterLevel;
    if (this.itemsDirty || this.model !== model) this.updateMarkers(model);
    this.itemsDirty = false;
  }

  updateMarkers(model) {
    for (const c of [...this.markers.children]) {
      this.markers.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
    const add = (geo, color, x, z, lift, scale = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      m.position.set(x, Math.max(heightAt(model, x, z), model.waterLevel) + lift, z);
      m.scale.setScalar(scale);
      this.markers.add(m);
      return m;
    };
    model.startSlots.forEach((s, i) => {
      add(new THREE.CylinderGeometry(3.2, 3.8, 1.2, 14), startColor(i), s.x, s.z, 0.6);
      add(new THREE.ConeGeometry(1.6, 4, 10), startColor(i), s.x, s.z, 3.2);
    });
    for (const r of model.resources) {
      if (r.type === 'gold') add(new THREE.BoxGeometry(3, 2.6, 3), 0xffd23a, r.x, r.z, 1.3);
      else if (r.type === 'stone') add(new THREE.DodecahedronGeometry(1.8), 0xbfc4cc, r.x, r.z, 1.2);
      else add(new THREE.CylinderGeometry(1.4, 1.8, 2.4, 10), 0x15151c, r.x, r.z, 1.2);
    }
    model.forests.forEach((f, fi) => {
      const trees = Math.min(f.count, 18);
      for (let t = 0; t < trees; t++) {
        const a = hash(fi * 97 + t * 3.1) * Math.PI * 2;
        const rr = Math.sqrt(hash(fi * 53 + t * 7.7)) * f.radius;
        const x = f.x + Math.cos(a) * rr;
        const z = f.z + Math.sin(a) * rr;
        if (heightAt(model, x, z) < 1.8) continue;
        add(new THREE.ConeGeometry(1.1, 3.6, 7), f.species === 'autumn' ? 0xc27a2a : f.species === 'oak' ? 0x3f9a3f : f.species === 'birch' ? 0xa6cf55 : 0x1f6a3a, x, z, 1.8);
      }
    });
    for (const n of model.neutrals) {
      if (n.kind === 'camp') add(new THREE.ConeGeometry(2.6, 3.4, 5), 0xff5a4a, n.x, n.z, 1.7);
      else {
        for (let t = 0; t < Math.min(n.count, 8); t++) {
          const a = hash(n.x + t) * 6.28;
          const col = (n.species === 'boar' || n.species === 'pig') ? 0x6b4c35 : 0xffffff;
          add(new THREE.SphereGeometry(0.7, 8, 6), col, n.x + Math.cos(a) * n.radius * 0.6, n.z + Math.sin(a) * n.radius * 0.6, 0.7);
        }
      }
    }
  }

  // ---- modo jogo ----
  buildGameStage(model) {
    this.disposeStage();
    const def = exportMap(model);
    const tilesetId = resolveTilesetId(def.tileset || 'verdejante');
    const t = TILESETS[tilesetId];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(t.atmosphere.sky);
    scene.fog = new THREE.Fog(t.atmosphere.sky, t.atmosphere.fogNear, t.atmosphere.fogFar);
    scene.add(new THREE.HemisphereLight(t.legacy ? 0xe8f4ff : t.atmosphere.hemiSky, t.atmosphere.hemiGround, t.legacy ? 1.2 : 1.05));
    const sun = new THREE.DirectionalLight(0xfffaee, 2.5);
    sun.position.set(-45, 75, -35);
    scene.add(sun);
    const terrain = new Terrain(def);
    const view = new TerrainView(scene, terrain, { tileset: tilesetId });
    const water = new Water(scene, terrain, { tileset: tilesetId });
    const deco = new Decorations(scene, terrain, { tileset: tilesetId });
    this.stage = { scene, view, water, deco };
  }

  disposeStage() {
    if (!this.stage) return;
    this.stage.scene.traverse((o) => o.geometry?.dispose?.());
    this.stage = null;
  }

  /** Reconstrói a prévia do jogo (pesada) com o estado atual do modelo. */
  refreshGame(model) {
    this.buildGameStage(model);
    this.dirty = true;
  }

  render(model, time = performance.now() / 1000) {
    this.controls.update();
    if (this.mode === 'game' && this.stage) {
      this.stage.water.update(time);
      this.renderer.render(this.stage.scene, this.camera);
      return;
    }
    if (this.dirty || this.model !== model) {
      this.updateLight(model);
      this.model = model;
      this.dirty = false;
    }
    this.renderer.render(this.lightScene, this.camera);
  }
}
