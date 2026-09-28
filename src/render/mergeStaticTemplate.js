import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * F1-02 — Mesclagem de geometrias estáticas de um template.
 *
 * Junta as malhas estáticas de um modelo (construções, depósitos, decorações) em UMA malha por
 * combinação (material × castShadow × renderOrder), com a transformação de cada
 * peça "assada" nos vértices (relativa à raiz). O template passa de centenas de draw calls para
 * ~1 por material.
 *
 * Ficam intactos (com toda a subárvore):
 * - nós listados em `keep` (nome exato, RegExp ou predicado) e nós cujo nome começa com um dos
 *   `keepPrefixes` (padrão `Anim_`, convenção do GLTFBuildingLoader);
 * - nós referenciados por `userData` de qualquer nó (referências de animação);
 * - nós com `onBeforeRender`/`onAfterRender` próprios (animação por callback);
 * - luzes, sprites, linhas, pontos, InstancedMesh, SkinnedMesh (não entram na mescla);
 * - malhas com `userData.noMerge`, material em array, morph targets, invisíveis;
 * - malhas transparentes (a ordenação por objeto se perderia), salvo `mergeTransparent: true`.
 *
 * As sombras são decididas ANTES (o `enableShadows` da F1-04 roda no gerador do modelo) e a
 * mescla separa os grupos por castShadow, então a regra por tamanho é preservada; a malha mesclada
 * recebe sombra se qualquer peça do grupo recebia.
 *
 * @param {THREE.Object3D} root
 * @param {object} [options]
 * @param {Array<string|RegExp|((o: THREE.Object3D) => boolean)>|((o: THREE.Object3D) => boolean)} [options.keep]
 * @param {string[]} [options.keepPrefixes] prefixos de nome preservados (padrão ['Anim_'])
 * @param {boolean|string[]} [options.userDataRefs] true (padrão) = toda referência em userData
 *   preserva o nó; array = só as chaves listadas; false = ignora userData
 * @param {boolean} [options.mergeTransparent] mescla também materiais transparentes (padrão false)
 * @param {number} [options.foldNonCasters] fração máx. de triângulos (vs. o grupo com sombra do mesmo
 *   material) para as peças sem sombra entrarem no grupo com sombra (padrão 0,25; 0 desliga)
 * @returns {THREE.Object3D} a mesma raiz, modificada
 */
export function mergeStaticTemplate(root, options = {}) {
  const keepMatchers = normalizeKeep(options.keep);
  const keepPrefixes = options.keepPrefixes ?? ['Anim_'];
  const userDataRefs = options.userDataRefs ?? true;
  const mergeTransparent = !!options.mergeTransparent;
  const foldNonCasters = options.foldNonCasters ?? 0.25;

  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // 1. Nós protegidos (a subárvore inteira fica como está)
  const protectedRoots = new Set();
  root.traverse(node => {
    if (node === root) return;
    const name = node.name || '';
    if (keepMatchers.some(m => m(node))) protectedRoots.add(node);
    else if (name && keepPrefixes.some(p => name.startsWith(p))) protectedRoots.add(node);
    else if (hasOwnRenderHook(node)) protectedRoots.add(node);
  });
  if (userDataRefs) {
    root.traverse(node => collectUserDataRefs(node, userDataRefs, protectedRoots, root));
  }

  // 2. Candidatas: malhas estáticas fora das subárvores protegidas
  let meshesBefore = 0;
  const buckets = new Map();
  const visit = (node, visible) => {
    const isVisible = visible && node.visible;
    if (node.isMesh) meshesBefore++;
    if (protectedRoots.has(node)) {
      node.traverse(n => { if (n !== node && n.isMesh) meshesBefore++; });
      return;
    }
    if (node !== root && isMergeable(node, isVisible, mergeTransparent)) {
      const m = node.material;
      // receiveShadow NÃO separa grupos: só as peças minúsculas ficavam sem receber (F1-04, para
      // economizar), e recebê-la numa malha já mesclada não custa draw call nem muda o visual.
      const key = `${m.uuid}|${node.castShadow ? 1 : 0}|${node.renderOrder}|${node.frustumCulled ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = []));
      bucket.push(node);
    }
    for (const child of node.children) visit(child, isVisible);
  };
  visit(root, true);

  // 2b. Peças pequenas sem sombra do mesmo material de um grupo que projeta sombra: se somam no
  //     máximo `foldNonCasters` (fração) dos triângulos do grupo com sombra, entram nele. A F1-04
  //     tirava a sombra dessas peças para economizar draw calls do passe de sombra; mescladas, elas
  //     não custam draw call nenhum e o passe principal ganha 1 chamada a menos por material.
  let folded = 0;
  if (foldNonCasters > 0) {
    for (const [key, bucket] of buckets) {
      if (bucket[0].castShadow) continue;
      const castKey = key.replace(/^([^|]+)\|0\|/, '$1|1|');
      const castBucket = buckets.get(castKey);
      if (!castBucket) continue;
      if (triangles(bucket) <= triangles(castBucket) * foldNonCasters) {
        castBucket.push(...bucket);
        folded += bucket.length;
        buckets.delete(key);
      }
    }
  }

  // 3. Mescla cada grupo (≥ 2 malhas) em uma malha filha da raiz
  const rel = new THREE.Matrix4();
  const merged = [];
  let mergedSources = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const material = bucket[0].material;
    const geos = bucket.map(mesh => {
      rel.multiplyMatrices(rootInv, mesh.matrixWorld);
      return bakeGeometry(mesh.geometry, rel);
    });
    const unified = unifyAttributes(geos, material);
    const geometry = unified && mergeGeometries(unified, false);
    unified?.forEach(g => g.dispose());
    if (!geometry) continue; // incompatível: deixa as peças como estavam

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const src = bucket[0];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Merged_${material.name || material.type}_${merged.length}`;
    mesh.castShadow = bucket.some(part => part.castShadow);
    mesh.receiveShadow = bucket.some(part => part.receiveShadow);
    mesh.renderOrder = src.renderOrder;
    mesh.frustumCulled = src.frustumCulled;
    mesh.userData.mergedFrom = bucket.length;
    for (const part of bucket) part.parent?.remove(part);
    merged.push(mesh);
    mergedSources += bucket.length;
  }

  // 4. Poda grupos que ficaram vazios (preserva protegidos e luzes)
  pruneEmpty(root, protectedRoots);
  for (const mesh of merged) root.add(mesh);
  root.updateMatrixWorld(true);

  let meshesAfter = 0;
  root.traverse(n => { if (n.isMesh) meshesAfter++; });
  mergeStaticTemplate.lastStats = {
    meshesBefore,
    meshesAfter,
    mergedMeshes: merged.length,
    mergedSources,
    foldedNonCasters: folded,
    protected: [...protectedRoots].map(n => n.name || n.type)
  };
  return root;
}

/** Estatísticas da última chamada (para depuração/testes). */
mergeStaticTemplate.lastStats = null;

function triangles(meshes) {
  let n = 0;
  for (const m of meshes) {
    const g = m.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  return n;
}

function normalizeKeep(keep) {
  if (!keep) return [];
  const list = typeof keep === 'function' ? [keep] : keep;
  return list.map(k => {
    if (typeof k === 'function') return k;
    if (k instanceof RegExp) return n => !!n.name && k.test(n.name);
    return n => n.name === k;
  });
}

function hasOwnRenderHook(node) {
  const proto = THREE.Object3D.prototype;
  return (
    (Object.prototype.hasOwnProperty.call(node, 'onBeforeRender') && node.onBeforeRender !== proto.onBeforeRender) ||
    (Object.prototype.hasOwnProperty.call(node, 'onAfterRender') && node.onAfterRender !== proto.onAfterRender)
  );
}

function collectUserDataRefs(node, keys, out, root) {
  const ud = node.userData;
  if (!ud || typeof ud !== 'object') return;
  const entries = Array.isArray(keys) ? keys.map(k => ud[k]) : Object.values(ud);
  for (const value of entries) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v && v.isObject3D && v !== root) out.add(v);
    }
  }
}

function isMergeable(node, visible, mergeTransparent) {
  if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh) return false;
  if (!visible) return false;
  if (node.userData && node.userData.noMerge) return false;
  const geo = node.geometry;
  const mat = node.material;
  if (!geo || !geo.isBufferGeometry || !geo.attributes.position) return false;
  if (!mat || Array.isArray(mat)) return false;
  if (geo.morphAttributes && Object.keys(geo.morphAttributes).length > 0) return false;
  if (node.morphTargetInfluences && node.morphTargetInfluences.length) return false;
  if (mat.transparent && !mergeTransparent) return false;
  if (hasOwnRenderHook(node)) return false;
  return true;
}

/** Cópia da geometria já no espaço da raiz, indexada e com o sentido dos triângulos correto. */
function bakeGeometry(source, matrix) {
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    geo.setAttribute(name, toPlainFloat(attr));
  }
  if (source.index) {
    geo.setIndex(new THREE.BufferAttribute(source.index.array.slice(), 1));
  } else {
    const n = geo.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  // Faixa de desenho parcial: só respeita drawRange (grupos são ignorados com material único)
  const dr = source.drawRange;
  if (dr && (dr.start > 0 || dr.count !== Infinity)) {
    const full = geo.index.array;
    const end = Math.min(full.length, dr.start + dr.count);
    geo.setIndex(new THREE.BufferAttribute(full.slice(dr.start, end), 1));
  }

  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.applyMatrix4(matrix);
  // applyMatrix4 já transforma normal/tangente; espelhamento (det < 0) inverte o sentido dos triângulos
  if (matrix.determinant() < 0) {
    const a = geo.index.array;
    for (let i = 0; i + 2 < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  }
  return geo;
}

/** Converte (inclusive intercalado/normalizado) para Float32 simples. */
function toPlainFloat(attr) {
  const n = attr.count;
  const size = attr.itemSize;
  const out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < size; c++) out[i * size + c] = attr.getComponent(i, c);
  }
  return new THREE.BufferAttribute(out, size);
}

/**
 * Deixa todas as geometrias do grupo com o mesmo conjunto de atributos:
 * position/normal/uv sempre (uv gerado com zeros se faltar), `color` só se o material usa
 * vertexColors e todas têm; demais atributos só se comuns a todas com o mesmo itemSize.
 */
function unifyAttributes(geos, material) {
  for (const g of geos) {
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
  }
  const names = Object.keys(geos[0].attributes).filter(name =>
    geos.every(g => g.attributes[name] && g.attributes[name].itemSize === geos[0].attributes[name].itemSize)
  );
  const keep = new Set(names.filter(name => name !== 'color' || material.vertexColors));
  for (const g of geos) {
    for (const name of Object.keys(g.attributes)) {
      if (!keep.has(name)) g.deleteAttribute(name);
    }
    g.clearGroups();
    g.morphAttributes = {};
  }
  return keep.has('position') ? geos : null;
}

function pruneEmpty(node, protectedRoots) {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (protectedRoots.has(child)) continue;
    pruneEmpty(child, protectedRoots);
    const plain = child.type === 'Group' || child.type === 'Object3D';
    if (plain && child.children.length === 0 && !hasOwnRenderHook(child)) node.remove(child);
  }
}
