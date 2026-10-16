import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glbEnabled, glbTemplates } from '../entities/glbModels.js';
import { getTileset } from '../data/tilesets.js';
import { LOD_DISTANCES, lodLevelForDistance, lodEnabled } from '../render/lod.js';

/** NEW-7: lado (unidades de mundo) do chunk espacial; cada tipo × chunk é um InstancedMesh com `boundingSphere` própria. */
const CHUNK_SIZE = 32;
/** Capacidade inicial de um chunk; dobra quando enche (a capacidade acompanha a contagem real, `mesh.count` = nº real). */
const CHUNK_INITIAL_CAPACITY = 8;

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

/** Quantos estilos (classes de tinta) cabem no shader regional (índices 0..15; `RegionMap.styleCount` ≤ 13). */
const REGIONAL_TINT_SLOTS = 16;

/**
 * MUNDO-5: variante REGIONAL da árvore: UM material para todas as regiões (zero malhas extras). O índice do estilo de cada instância
 * viaja no `instanceColor.r` (índice / 255; as .glb das árvores não têm cor de vértice, então `vColor` = cor da instância); o shader
 * lê o índice e escolhe, em vetores uniform, a tinta, a dessaturação e a neve da região (mesma conta de `createTintedMaterial`).
 * O `#include <color_fragment>` sai (senão a classe multiplicaria o albedo).
 * @param {import('three').Material} src
 * @param {Array<{color:number, desat:number, snow:number|null, snowAmount:number}|null>} tints  tinta de cada índice de estilo (`null` = sem tinta)
 */
function createRegionalTintMaterial(src, tints) {
  const mat = src.clone();
  const tint = [], desat = [], snow = [], snowAmt = [];
  for (let k = 0; k < REGIONAL_TINT_SLOTS; k++) {
    const cfg = tints[k] || null;
    tint.push(new THREE.Color(cfg ? cfg.color : 0xffffff));
    desat.push(cfg ? cfg.desat : 0);
    snow.push(cfg && cfg.snow != null ? new THREE.Color(cfg.snow) : new THREE.Color(1, 1, 1));
    snowAmt.push(cfg ? cfg.snowAmount || 0 : 0);
  }
  const uniforms = {
    uRegTint: { value: tint },
    uRegDesat: { value: desat },
    uRegSnow: { value: snow },
    uRegSnowAmt: { value: snowAmt }
  };
  const baseCompile = THREE.Material.prototype.onBeforeCompile; // com o patch da névoa de guerra
  mat.onBeforeCompile = function treeRegionalTintOnBeforeCompile(shader, renderer) {
    Object.assign(shader.uniforms, uniforms);
    const n = REGIONAL_TINT_SLOTS;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRegTint[${n}]; uniform float uRegDesat[${n}]; uniform vec3 uRegSnow[${n}]; uniform float uRegSnowAmt[${n}];`)
      .replace('#include <color_fragment>', '')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  int wpK = clamp( int( vColor.r * 255.0 + 0.5 ), 0, ${n - 1} );
  float wpL = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  vec3 wpC = mix( diffuseColor.rgb, vec3( wpL ), uRegDesat[ wpK ] ) * uRegTint[ wpK ];
  float wpUp = ( vec4( normal, 0.0 ) * viewMatrix ).y;
  float wpSnow = uRegSnowAmt[ wpK ] * smoothstep( 0.25, 0.75, wpUp );
  diffuseColor.rgb = mix( wpC, uRegSnow[ wpK ], wpSnow );
}`);
    baseCompile.call(this, shader, renderer);
  };
  mat.customProgramCacheKey = function () {
    return 'wp-treetint-reg' + THREE.Material.prototype.customProgramCacheKey.call(this);
  };
  mat.needsUpdate = true;
  return mat;
}

/**
 * F1-10 item 3: geometria simplificada do impostor (copa em cone de 6 lados + tronco em cilindro de 4 lados, cores nos
 * vértices), dimensionada pela caixa da geometria real do tipo. Gerada uma única vez por tipo.
 */
function buildImpostorGeometry(key, srcGeo) {
  if (!srcGeo.boundingBox) srcGeo.computeBoundingBox();
  const bb = srcGeo.boundingBox;
  const h = Math.max(1, bb.max.y - Math.min(0, bb.min.y));
  const r = Math.max(0.8, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5);
  const trunk = new THREE.CylinderGeometry(r * 0.16, r * 0.22, h * 0.4, 4);
  trunk.translate(0, h * 0.2, 0);
  const crown = new THREE.ConeGeometry(r, h * 0.75, 6);
  crown.translate(0, h * 0.25 + h * 0.375, 0);
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  };
  paint(trunk, 0x5a3d26);
  paint(crown, PLACEHOLDER_COLORS[key] || PLACEHOLDER_COLORS.tree_oak);
  const geo = mergeGeometries([trunk.toNonIndexed(), crown.toNonIndexed()]);
  trunk.dispose();
  crown.dispose();
  return geo;
}

export class TreeManager {
  /**
   * @param {{tileset?: string, regions?: import('../data/biomeRegions.js').RegionMap|null}} [options]  F7-04: variante (tinta/neve) por
   *   tileset; padrão: sem alteração. MUNDO-5: `regions` (mapa com `biomeGrid`) escolhe a tinta pela célula de cada árvore (estilo da
   *   região: `def.trees.tint`) SEM malhas extras: os mesmos InstancedMesh (tipo × chunk) com um material regional e o índice do estilo de
   *   cada árvore em `instanceColor` (o shader escolhe a tinta em vetores uniform). Sem `regions`: o de sempre.
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this._tintedMats = [];
    this.trees = [];
    /** MUNDO-5: regiões de bioma (ou `null`). */
    this._regions = options.regions || null;
    this._regionalMats = new Map(); // material de origem → material regional (tinta por instância)
    this._impostorTints = new Map(); // classe de tinta → material do impostor tingido (impostor = tinta da classe dominante do chunk)
    this._classColor = new THREE.Color();

    this.oakCount = 0;
    this.pineCount = 0;
    this.autumnCount = 0;

    // F7-00b: 4º tipo, a bétula (`tree_birch.glb`), criada sob demanda: nenhum mapa-base a usa por padrão, então sem árvore
    // `birch` registrada não existe InstancedMesh (nem chamada de desenho, nem vértices extras).
    this.birchCount = 0;

    // NEW-7: cada tipo vira N InstancedMesh (um por chunk de ~32 u, criado na 1ª árvore do chunk), todos com a mesma geometria
    // e material do .glb do Blender (tronco e copa na mesma malha e no mesmo atlas de 512²). Frustum culling por chunk.
    this.instancedMeshes = [];
    this._sources = new Map(); // key do .glb → {geo, mat} (compartilhado entre os chunks do tipo)
    this._chunks = new Map(); // `${key}|${cx}|${cz}` → InstancedMesh
    // F1-10 item 3: impostores (criados sob demanda, compartilham instanceMatrix/instanceColor do chunk).
    this.lodMeshes = [];
    this._impostorGeo = new Map(); // key → geometria simplificada (uma por tipo)
    this._impostorMat = null;

    this.zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    if (options.tileset) this.applyTileset(getTileset(options.tileset));
  }

  /** InstancedMesh do chunk (tipo × célula de 32 u), criado sob demanda já com a tinta do tileset (ou o material regional), se houver. */
  _getChunkMesh(key, x, z) {
    const id = `${key}|${Math.floor(x / CHUNK_SIZE)}|${Math.floor(z / CHUNK_SIZE)}`;
    let im = this._chunks.get(id);
    if (im) return im;
    let src = this._sources.get(key);
    if (!src) this._sources.set(key, src = getTreeSource(key));
    im = new THREE.InstancedMesh(src.geo, src.mat, CHUNK_INITIAL_CAPACITY);
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    im.userData.isTreeInstanced = true;
    im.userData.treeEntities = [];
    im.userData.lodLevel = 0;
    im.userData.lodImpostor = null;
    im.userData.chunkX = (Math.floor(x / CHUNK_SIZE) + 0.5) * CHUNK_SIZE; // centro do chunk (XZ) p/ o LOD
    im.userData.chunkZ = (Math.floor(z / CHUNK_SIZE) + 0.5) * CHUNK_SIZE;
    this._tintMesh(im);
    this.scene.add(im);
    this.instancedMeshes.push(im);
    im.userData.lodKey = key;
    this._chunks.set(id, im);
    return im;
  }

  /** Garante vaga para mais uma instância (dobra a capacidade do buffer quando enche) e devolve o índice dela. */
  _allocInstance(im) {
    const idx = im.count;
    if (idx >= im.instanceMatrix.count) {
      const old = im.instanceMatrix;
      const next = new THREE.InstancedBufferAttribute(new Float32Array(old.count * 2 * 16), 16);
      next.array.set(old.array);
      next.setUsage(old.usage);
      im.instanceMatrix = next;
      if (im.instanceColor) { // MUNDO-5: a classe de tinta de cada instância cresce junto com as matrizes
        const oc = im.instanceColor;
        const nc = new THREE.InstancedBufferAttribute(new Float32Array(next.count * 3).fill(1), 3);
        nc.array.set(oc.array);
        im.instanceColor = nc;
      }
    }
    im.count = idx + 1;
    const imp = im.userData.lodImpostor;
    if (imp) this._syncImpostor(im, imp);
    return idx;
  }

  /** F7-04: aplica a variante de árvore do tileset (`def.trees.tint`); `null` = material original. */
  applyTileset(def) {
    const cfg = def && def.trees && def.trees.tint;
    if (!cfg) return;
    this._tintCfg = cfg;
    this._tintBySource = new Map();
    for (const im of this.instancedMeshes) this._tintMesh(im);
    for (const imp of this.lodMeshes) this._tintMesh(imp);
  }

  /**
   * Impostor do chunk usa os MESMOS buffers de matriz/cor e a mesma contagem do mesh normal. MUNDO-5: no modo regional o `instanceColor`
   * do chunk carrega a classe de tinta (não é cor), então o impostor não o herda; ele tem uma tinta só (a classe dominante do chunk).
   */
  _syncImpostor(im, imp) {
    imp.instanceMatrix = im.instanceMatrix;
    if (!this._regions) imp.instanceColor = im.instanceColor;
    imp.count = im.count;
    imp.boundingSphere = null;
  }

  _getImpostor(im, key) {
    let imp = im.userData.lodImpostor;
    if (imp) return imp;
    let geo = this._impostorGeo.get(key);
    if (!geo) this._impostorGeo.set(key, geo = buildImpostorGeometry(key, this._sources.get(key).geo));
    if (!this._impostorMat) this._impostorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    imp = new THREE.InstancedMesh(geo, this._impostorMat, 1);
    imp.castShadow = false;
    imp.receiveShadow = false;
    imp.userData.isTreeImpostor = true;
    imp.userData.treeStyle = this._dominantClass(im); // MUNDO-5: tinta da classe dominante do chunk (impostor = 1 tinta só)
    this._tintMesh(imp);
    this._syncImpostor(im, imp);
    imp.visible = false;
    this.scene.add(imp);
    this.lodMeshes.push(imp);
    im.userData.lodImpostor = imp;
    return imp;
  }

  /**
   * F1-10 item 3: 1×/quadro. Chunks mais longe que `LOD_DISTANCES.tree` (com histerese) trocam o mesh normal pelo impostor
   * simplificado; só `visible` muda (nenhuma matriz é regravada). `?lod=0` mantém tudo no nível 0.
   * @param {{x:number,z:number}} cameraTarget  alvo da câmera (mundo)
   */
  applyLod(cameraTarget) {
    if (!cameraTarget) return;
    const enabled = lodEnabled();
    const ims = this.instancedMeshes;
    for (let i = 0; i < ims.length; i++) {
      const im = ims[i];
      const ud = im.userData;
      const dx = ud.chunkX - cameraTarget.x;
      const dz = ud.chunkZ - cameraTarget.z;
      const level = enabled ? lodLevelForDistance(Math.sqrt(dx * dx + dz * dz), LOD_DISTANCES.tree, ud.lodLevel) : 0;
      if (level === ud.lodLevel) continue;
      ud.lodLevel = level;
      if (level === 1) {
        const imp = this._getImpostor(im, ud.lodKey);
        this._syncImpostor(im, imp);
        imp.visible = true;
        im.visible = false;
      } else {
        im.visible = true;
        if (ud.lodImpostor) ud.lodImpostor.visible = false;
      }
    }
  }

  /** MUNDO-5: estilo (classe de tinta) que mais aparece entre as árvores do chunk (empate: o de menor índice). */
  _dominantClass(im) {
    const counts = im.userData.classCount;
    let best = 0, bn = -1;
    if (counts) for (const [k, n] of counts) if (n > bn || (n === bn && k < best)) { best = k; bn = n; }
    return best;
  }

  /** Tinta (`def.trees.tint`) de cada índice de estilo; `null` = sem tinta. */
  _regionalTints() {
    return this._regions.styles.map((st) => (st.def.trees && st.def.trees.tint) || null);
  }

  /**
   * MUNDO-5: tinta regional. Chunk normal: UM material regional por material de origem (tinta por instância, zero malhas extras) e o
   * `instanceColor` alocado desde já (o programa do shader depende dele). Impostor: material tingido pela classe dominante do chunk
   * (`userData.treeStyle`), um por classe. `userData.baseMaterial` guarda o original (reaplicar não tinge duas vezes).
   */
  _tintMeshRegional(im) {
    const src = im.userData.baseMaterial || (im.userData.baseMaterial = im.material);
    if (im.userData.isTreeImpostor) {
      const cls = im.userData.treeStyle || 0;
      const cfg = this._regionalTints()[cls];
      if (!cfg) return;
      let tinted = this._impostorTints.get(cls);
      if (!tinted) {
        tinted = createTintedMaterial(src, cfg);
        this._impostorTints.set(cls, tinted);
        this._tintedMats.push(tinted);
      }
      im.material = tinted;
      return;
    }
    let mat = this._regionalMats.get(src);
    if (!mat) {
      mat = createRegionalTintMaterial(src, this._regionalTints());
      this._regionalMats.set(src, mat);
      this._tintedMats.push(mat);
    }
    im.material = mat;
    if (!im.instanceColor) im.setColorAt(0, this._classColor.setRGB(0, 1, 1)); // classe 0; cada `registerTree` regrava a da árvore
  }

  /** Troca o material do InstancedMesh pela variante do tileset (um clone por material de origem; só se há tinta). */
  _tintMesh(im) {
    if (this._regions) { this._tintMeshRegional(im); return; }
    if (!this._tintCfg) return;
    if (!this._tintBySource.has(im.material)) {
      const t = createTintedMaterial(im.material, this._tintCfg);
      this._tintBySource.set(im.material, t);
      this._tintedMats.push(t);
    }
    im.material = this._tintBySource.get(im.material);
  }

  /** Quantas árvores do tipo já foram registradas. */
  countOf(type) {
    if (type === 'pine') return this.pineCount;
    if (type === 'autumn') return this.autumnCount;
    if (type === 'birch') return this.birchCount;
    return this.oakCount;
  }

  registerTree(tree, x, y, z, rotY, scale, type) {
    let key;
    if (type === 'pine') {
      key = 'tree_pine';
      this.pineCount++;
    } else if (type === 'autumn') {
      key = 'tree_autumn';
      this.autumnCount++;
    } else if (type === 'birch') {
      key = 'tree_birch';
      this.birchCount++;
    } else {
      key = 'tree_oak';
      this.oakCount++;
    }
    const mesh = this._getChunkMesh(key, x, z);
    const idx = this._allocInstance(mesh); // índice local ao chunk
    if (this._regions) { // MUNDO-5: estilo da região desta árvore (instanceColor.r = índice do estilo / 255)
      const cls = this._regions.styleAt(x, z);
      mesh.setColorAt(idx, this._classColor.setRGB(cls / 255, 1, 1));
      mesh.instanceColor.needsUpdate = true;
      const counts = mesh.userData.classCount || (mesh.userData.classCount = new Map());
      counts.set(cls, (counts.get(cls) || 0) + 1);
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
    mesh.boundingSphere = null; // recalculada (só deste chunk) no próximo culling

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
    });
    this.lodMeshes.forEach(im => this.scene.remove(im));
    this.lodMeshes = [];
    this._impostorGeo.forEach(g => g.dispose());
    this._impostorGeo.clear();
    if (this._impostorMat) { this._impostorMat.dispose(); this._impostorMat = null; }
    this._sources.forEach(src => { if (src.geo) src.geo.dispose(); });
    this._sources.clear();
    this._chunks.clear();
    this.instancedMeshes = [];
    this._tintedMats.forEach(m => m.dispose());
    this._tintedMats = [];
    this._regionalMats.clear();
    this._impostorTints.clear();
    this.trees = [];
    this.oakCount = 0;
    this.pineCount = 0;
    this.autumnCount = 0;
    this.birchCount = 0;
  }
}
