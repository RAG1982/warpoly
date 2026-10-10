import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glbEnabled, glbTemplates } from '../entities/glbModels.js';
import { getTileset } from '../data/tilesets.js';

/** Instâncias por tipo de árvore (cada tipo é um InstancedMesh de capacidade fixa). */
const CAPACITY = 120;

/** Cor da árvore reserva por tipo (sem textura): usada só quando o .glb não carregou. */
const PLACEHOLDER_COLORS = { tree_oak: 0x3f7d3a, tree_pine: 0x2f6a44, tree_autumn: 0xd9791c, tree_birch: 0xb6d95a };

/** `?glbtrees=0` ignora os .glb das árvores mesmo com os demais ligados (cai na árvore reserva). */
function glbTreesEnabled() {
  try {
    return typeof window === 'undefined' || new URLSearchParams(window.location.search).get('glbtrees') !== '0';
  } catch (e) {
    return true;
  }
}

/**
 * F7-00b lote 2: geometria + material (atlas 512²) de uma árvore .glb (`tree_oak|tree_pine|tree_autumn|tree_birch`), com a
 * transformação do nó aplicada na cópia da geometria. `null` quando o .glb não está carregado (ou `?glb=0`).
 */
function getGlbTreeSource(key) {
  if (!glbEnabled || !glbTreesEnabled()) return null;
  const template = glbTemplates.get(key);
  if (!template) return null;
  template.updateMatrixWorld(true);
  let mesh = null;
  template.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) return null;
  return { geo: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mat: mesh.material };
}

/**
 * F7-00b (limpeza): as árvores procedurais (e as texturas de 2048² geradas no carregamento) foram removidas; se o .glb falta
 * (rede, `?glb=0`, `?glbtrees=0`), cada tipo vira um tronco com copa de uma cor só, numa geometria cada (sem texturas).
 */
function getPlaceholderTreeSource(key) {
  const pine = key === 'tree_pine';
  const trunk = new THREE.CylinderGeometry(0.4, 0.55, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  const crown = pine ? new THREE.ConeGeometry(2.1, 5.2, 7) : new THREE.SphereGeometry(1.9, 7, 5);
  crown.translate(0, pine ? 4.4 : 3.9, 0);
  const color = PLACEHOLDER_COLORS[key] || PLACEHOLDER_COLORS.tree_oak;
  return { geo: mergeGeometries([trunk, crown]), mat: new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }) };
}

/** Geometria + material de uma árvore: o .glb do Blender ou, sem ele, a árvore reserva. */
function getTreeSource(key) {
  return getGlbTreeSource(key) || getPlaceholderTreeSource(key);
}

/**
 * F7-04: variante de árvore por tileset. Clona o material (o original pode ser o atlas .glb compartilhado) e injeta no
 * shader: tinta (`color`), dessaturação (`desat`: árvores mortas/secas) e neve nas faces voltadas para cima (`snow`).
 */
function createTintedMaterial(src, cfg) {
  const mat = src.clone();
  const snow = cfg.snow != null ? new THREE.Color(cfg.snow) : new THREE.Color(1, 1, 1);
  const uniforms = {
    uTreeTint: { value: new THREE.Color(cfg.color) },
    uTreeDesat: { value: cfg.desat },
    uTreeSnow: { value: snow },
    uTreeSnowAmt: { value: cfg.snowAmount || 0 }
  };
  const baseCompile = THREE.Material.prototype.onBeforeCompile; // com o patch da névoa de guerra
  mat.onBeforeCompile = function treeTintOnBeforeCompile(shader, renderer) {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uTreeTint; uniform float uTreeDesat; uniform vec3 uTreeSnow; uniform float uTreeSnowAmt;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float wpL = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  vec3 wpC = mix( diffuseColor.rgb, vec3( wpL ), uTreeDesat ) * uTreeTint;
  float wpUp = ( vec4( normal, 0.0 ) * viewMatrix ).y;
  float wpSnow = uTreeSnowAmt * smoothstep( 0.25, 0.75, wpUp );
  diffuseColor.rgb = mix( wpC, uTreeSnow, wpSnow );
}`);
    baseCompile.call(this, shader, renderer);
  };
  mat.customProgramCacheKey = function () {
    return 'wp-treetint' + THREE.Material.prototype.customProgramCacheKey.call(this);
  };
  mat.needsUpdate = true;
  return mat;
}

export class TreeManager {
  /** @param {{tileset?: string}} [options]  F7-04: variante (tinta/neve) por tileset; padrão: sem alteração */
  constructor(scene, options = {}) {
    this.scene = scene;
    this._tintedMats = [];
    this.trees = [];

    this.oakCount = 0;
    this.pineCount = 0;
    this.autumnCount = 0;

    // F7-00b: 4º tipo, a bétula (`tree_birch.glb`), criada sob demanda: nenhum mapa-base a usa por padrão, então sem árvore
    // `birch` registrada não existe InstancedMesh (nem chamada de desenho, nem vértices extras).
    this.birchCount = 0;
    this._birchMesh = null;

    // Cada tipo é 1 InstancedMesh com o .glb do Blender (tronco e copa na mesma malha e no mesmo atlas de 512²).
    this.oakMesh = this._createMesh('tree_oak');
    this.pineMesh = this._createMesh('tree_pine');
    this.autumnMesh = this._createMesh('tree_autumn');
    this.instancedMeshes = [this.oakMesh, this.pineMesh, this.autumnMesh];

    this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    if (options.tileset) this.applyTileset(getTileset(options.tileset));
  }

  _createMesh(key) {
    const src = getTreeSource(key);
    const im = new THREE.InstancedMesh(src.geo, src.mat, CAPACITY);
    im.castShadow = true;
    im.receiveShadow = true;
    im.userData.isTreeInstanced = true;
    im.userData.treeEntities = [];
    this.scene.add(im);
    return im;
  }

  /** F7-04: aplica a variante de árvore do tileset (`def.trees.tint`); `null` = material original. */
  applyTileset(def) {
    const cfg = def && def.trees && def.trees.tint;
    if (!cfg) return;
    this._tintCfg = cfg;
    this._tintBySource = new Map();
    for (const im of this.instancedMeshes) this._tintMesh(im);
  }

  /** Troca o material do InstancedMesh pela variante do tileset (um clone por material de origem; só se há tinta). */
  _tintMesh(im) {
    if (!this._tintCfg) return;
    if (!this._tintBySource.has(im.material)) {
      const t = createTintedMaterial(im.material, this._tintCfg);
      this._tintBySource.set(im.material, t);
      this._tintedMats.push(t);
    }
    im.material = this._tintBySource.get(im.material);
  }

  /** InstancedMesh da bétula, criado na primeira árvore `birch` (já com a tinta do tileset, se houver). */
  _ensureBirchMesh() {
    if (this._birchMesh) return this._birchMesh;
    const m = this._createMesh('tree_birch');
    this._tintMesh(m);
    this.instancedMeshes.push(m);
    this._birchMesh = m;
    return m;
  }

  /** Quantas árvores do tipo já foram registradas (a capacidade de cada InstancedMesh é de 120). */
  countOf(type) {
    if (type === 'pine') return this.pineCount;
    if (type === 'autumn') return this.autumnCount;
    if (type === 'birch') return this.birchCount;
    return this.oakCount;
  }

  registerTree(tree, x, y, z, rotY, scale, type) {
    let mesh, idx;
    if (type === 'pine') {
      mesh = this.pineMesh;
      idx = this.pineCount++;
    } else if (type === 'autumn') {
      mesh = this.autumnMesh;
      idx = this.autumnCount++;
    } else if (type === 'birch') {
      mesh = this._ensureBirchMesh();
      idx = this.birchCount++;
    } else {
      mesh = this.oakMesh;
      idx = this.oakCount++;
    }

    tree.instanceType = type;
    tree.instanceIndex = idx;
    tree.trunkMesh = mesh; // tronco e copa são a mesma malha desde o .glb (nomes mantidos por compatibilidade)
    tree.foliageMesh = mesh;

    // Build base matrix
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
    tree.baseMatrix = matrix.clone();

    mesh.setMatrixAt(idx, matrix);
    mesh.userData.treeEntities[idx] = tree;
    mesh.instanceMatrix.needsUpdate = true;

    this.trees.push(tree);
  }

  shakeTree(tree, angle) {
    if (tree.isDead || !tree.baseMatrix || !tree.trunkMesh) return;
    const tempMatrix = tree.baseMatrix.clone();
    const rotZ = new THREE.Matrix4().makeRotationZ(angle);
    tempMatrix.multiply(rotZ);

    tree.trunkMesh.setMatrixAt(tree.instanceIndex, tempMatrix);
    tree.trunkMesh.instanceMatrix.needsUpdate = true;
  }

  resetTreeMatrix(tree) {
    if (tree.isDead || !tree.baseMatrix || !tree.trunkMesh) return;
    tree.trunkMesh.setMatrixAt(tree.instanceIndex, tree.baseMatrix);
    tree.trunkMesh.instanceMatrix.needsUpdate = true;
  }

  hideTree(tree) {
    if (!tree.trunkMesh) return;
    tree.trunkMesh.setMatrixAt(tree.instanceIndex, this.zeroMatrix);
    tree.trunkMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.instancedMeshes.forEach(im => {
      this.scene.remove(im);
      if (im.geometry) im.geometry.dispose();
    });
    this._tintedMats.forEach(m => m.dispose());
    this._tintedMats = [];
    this.trees = [];
    this.oakCount = 0;
    this.pineCount = 0;
    this.autumnCount = 0;
    this.birchCount = 0;
    this._birchMesh = null;
  }
}
