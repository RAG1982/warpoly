import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeGeometry, unifyAttributes, pruneEmpty, mergeStaticTemplate } from './mergeStaticTemplate.js';
import { ANIMATED_NODE_NAMES } from './mergeUnitTemplate.js';

/**
 * F1-03b — Skinning rígido das unidades: todas as malhas que compartilham material (e castShadow)
 * viram UMA `THREE.SkinnedMesh` por combinação, cujos "ossos" são os próprios nós-pivô já usados
 * pelo `UnitAnimator`/`ModelFactory.rebindUserData` (mesmos critérios de pivô da F1-03, ver
 * `mergeUnitTemplate.js`). Cada vértice tem peso 1,0 no seu pivô (skinning rígido, sem blend), então
 * a animação por rotação dos nós-pivô continua idêntica — só o desenho passa a ser 1 draw call por
 * material da unidade inteira, em vez de 1 por (osso × material).
 *
 * Excluídos do skinning (continuam `Mesh` normal, filhos do seu nó, alternando `visible` como antes):
 * subárvores de `Axe, Pickaxe, Hammer, Pack, WoodBundle, GoldSack, DrawnArrow, DrawnAxe`,
 * `BowStringTop`/`BowStringBottom` (reposicionadas por `updateBowString` a cada quadro),
 * malhas transparentes, `SelectionRing`/`HealthBar*` (adicionadas na instância, não no template).
 *
 * Malhas com material em array (cabeças orc: rosto só na face frontal) são separadas por
 * `geometry.groups` em uma peça por material ANTES de agrupar — cada peça entra no grupo do seu
 * material como qualquer outra malha, preservando o rosto só nos triângulos corretos.
 *
 * @param {THREE.Object3D} root
 * @param {object} [options]
 * @param {string[]} [options.protectedNames] nomes extra tratados como pivô/osso.
 * @returns {THREE.Object3D} a mesma raiz, modificada
 */

/** Subárvores nunca skinadas (visibilidade alternada por `Unit.js`/`UnitAnimator`). */
const TOGGLE_NAMES = new Set([
  'Axe', 'Pickaxe', 'Hammer', 'Pack', 'WoodBundle', 'GoldSack', 'DrawnArrow', 'DrawnAxe'
]);

/** Malhas nomeadas nunca skinadas (reposicionadas a cada quadro ou adicionadas na instância). */
const NEVER_SKIN_NAMES = new Set(['BowStringTop', 'BowStringBottom']);

export function skinUnitTemplate(root, options = {}) {
  const nameSet = new Set([...ANIMATED_NODE_NAMES, ...(options.protectedNames || [])]);

  root.updateMatrixWorld(true);

  // 1. Ossos: raiz + nós-pivô nomeados + referências em userData, raiz primeiro, depois ordem de traverse.
  const pivotSet = new Set([root]);
  root.traverse(node => {
    if (node !== root && node.name && nameSet.has(node.name)) pivotSet.add(node);
  });
  collectRootUserDataRefs(root, pivotSet);

  const bones = [root];
  root.traverse(node => {
    if (node !== root && pivotSet.has(node)) bones.push(node);
  });
  const boneIndex = new Map(bones.map((b, i) => [b, i]));

  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // 2. Nós de toggle: a subárvore inteira fica de fora do skinning (malhas normais). Continuam
  // recebendo a mescla rígida comum (não-skinada) da F1-03 internamente — senão unidades com várias
  // ferramentas/cargas (villager, peon) regredem em draw calls (eram mescladas dentro do próprio nó).
  const toggleRoots = new Set();
  root.traverse(node => {
    if (node !== root && node.name && TOGGLE_NAMES.has(node.name)) toggleRoots.add(node);
  });
  for (const toggleNode of toggleRoots) {
    mergeStaticTemplate(toggleNode, { keep: [], keepPrefixes: [] });
  }
  const isInsideToggle = node => {
    for (let n = node; n && n !== root; n = n.parent) {
      if (toggleRoots.has(n)) return true;
    }
    return false;
  };

  // 3. Percorre a árvore agrupando as malhas candidatas por material × castShadow.
  let meshesBefore = 0;
  const buckets = new Map(); // key -> { material, castShadow, receiveShadow, geos: BufferGeometry[] }
  const toRemove = [];
  const relMatrix = new THREE.Matrix4();

  const addBakedToBucket = (geo, material, srcMesh, pivotIdx) => {
    setSkinAttributes(geo, pivotIdx);
    const key = `${material.uuid}|${srcMesh.castShadow ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { material, castShadow: srcMesh.castShadow, receiveShadow: false, geos: [] }));
    if (srcMesh.receiveShadow) bucket.receiveShadow = true;
    bucket.geos.push(geo);
  };

  const addMeshToBuckets = (mesh, pivot) => {
    const pivotIdx = boneIndex.get(pivot);
    relMatrix.multiplyMatrices(rootInv, mesh.matrixWorld);
    const baked = bakeGeometry(mesh.geometry, relMatrix);
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      // `bakeGeometry` não copia `groups`: usa os do original (mesmos índices, geometria só
      // ganhou a transformação assada nos vértices, a topologia/ordem dos triângulos é a mesma).
      const groups = mesh.geometry.groups && mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: baked.index.count, materialIndex: 0 }];
      for (const g of groups) {
        const sub = sliceGeometryByGroup(baked, g);
        addBakedToBucket(sub, mat[g.materialIndex] || mat[0], mesh, pivotIdx);
      }
      baked.dispose();
    } else {
      addBakedToBucket(baked, mat, mesh, pivotIdx);
    }
    toRemove.push(mesh);
  };

  const visit = (node, currentPivot) => {
    if (node.isMesh) meshesBefore++;
    const nextPivot = pivotSet.has(node) ? node : currentPivot;
    if (node !== root && isSkinnableUnitMesh(node) && !isInsideToggle(node)) {
      addMeshToBuckets(node, currentPivot);
    }
    for (const child of node.children.slice()) visit(child, nextPivot);
  };
  visit(root, root);

  // 4. Mescla cada grupo em uma SkinnedMesh, adicionada diretamente à raiz.
  // Um único Skeleton COMPARTILHADO por todas as SkinnedMesh da unidade (mesmos ossos): senão
  // cada material recalcularia/reenviaria sua própria bone texture por quadro (custo ~Nx sem
  // ganho nenhum de draw calls — Skeleton.update() já é chamado 1x por mesh pelo WebGLRenderer,
  // então compartilhar o objeto evita N cópias de boneMatrices/boneTexture por unidade).
  root.updateMatrixWorld(true); // ossos já na pose atual; garante boneInverses corretos no bind
  const skeleton = new THREE.Skeleton(bones);
  let mergedMeshes = 0;
  let mergedSources = 0;
  for (const bucket of buckets.values()) {
    const unified = unifyAttributes(bucket.geos, bucket.material);
    const geometry = unified && mergeGeometries(unified, false);
    unified?.forEach(g => g.dispose());
    if (!geometry) continue; // incompatível: não deveria ocorrer (todas as peças têm skinIndex/skinWeight)

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    // Bind pose não acompanha a animação: raio ampliado em vez de desligar o frustum culling.
    if (geometry.boundingSphere) geometry.boundingSphere.radius *= 1.3;

    const mesh = new THREE.SkinnedMesh(geometry, bucket.material);
    mesh.name = `Skinned_${bucket.material.name || bucket.material.type}_${mergedMeshes}`;
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());

    mesh.userData.mergedFrom = bucket.geos.length;
    mergedMeshes++;
    mergedSources += bucket.geos.length;
  }

  for (const part of toRemove) part.parent?.remove(part);

  // 5. Poda grupos vazios dentro de cada osso (nunca remove os próprios ossos).
  for (const pivot of pivotSet) pruneEmpty(pivot, pivotSet);
  root.updateMatrixWorld(true);

  let meshesAfter = 0;
  root.traverse(n => { if (n.isMesh) meshesAfter++; });
  skinUnitTemplate.lastStats = {
    meshesBefore,
    meshesAfter,
    mergedMeshes,
    mergedSources,
    bones: bones.map(n => n.name || n.type)
  };
  return root;
}

/** Estatísticas da última chamada (para depuração/testes). */
skinUnitTemplate.lastStats = null;

let skinEnabledOverride = null;

/** Flag global: `?skin=0` na URL volta ao comportamento da F1-03 (mescla por osso, sem skinning). */
export function isSkinEnabled() {
  if (skinEnabledOverride !== null) return skinEnabledOverride;
  try {
    const search = globalThis.location?.search;
    if (search) {
      const v = new URLSearchParams(search).get('skin');
      if (v !== null && ['0', 'false', 'off', 'no'].includes(v.toLowerCase())) return false;
    }
  } catch {
    // sem location (testes em Node): usa o padrão
  }
  return true;
}

/** Força liga/desliga (testes); `null` volta a ler a URL. */
export function setSkinEnabled(value) {
  skinEnabledOverride = value === null ? null : !!value;
}

function collectRootUserDataRefs(root, out) {
  const ud = root.userData;
  if (!ud || typeof ud !== 'object') return;
  for (const value of Object.values(ud)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v && v.isObject3D && v !== root) out.add(v);
    }
  }
}

function setSkinAttributes(geo, pivotIdx) {
  const n = geo.attributes.position.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    skinIndex[v * 4] = pivotIdx;
    skinWeight[v * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

/** Cópia indexada de `baked` contendo só os triângulos do grupo (mesmos atributos por vértice). */
function sliceGeometryByGroup(baked, group) {
  const geo = baked.clone();
  const full = baked.index.array;
  const end = Math.min(full.length, group.start + group.count);
  geo.setIndex(new THREE.BufferAttribute(full.slice(group.start, end), 1));
  geo.clearGroups();
  return geo;
}

function isSkinnableUnitMesh(node) {
  if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh) return false;
  if (node.visible === false) return false;
  const name = node.name || '';
  if (NEVER_SKIN_NAMES.has(name)) return false;
  if (name === 'SelectionRing' || name.startsWith('Health')) return false;
  if (node.userData && node.userData.noMerge) return false;
  const geo = node.geometry;
  const mat = node.material;
  if (!geo || !geo.isBufferGeometry || !geo.attributes.position) return false;
  if (!mat) return false;
  const mats = Array.isArray(mat) ? mat : [mat];
  if (mats.some(m => m.transparent)) return false;
  if (geo.morphAttributes && Object.keys(geo.morphAttributes).length > 0) return false;
  if (node.morphTargetInfluences && node.morphTargetInfluences.length) return false;
  if (hasOwnRenderHook(node)) return false;
  return true;
}

function hasOwnRenderHook(node) {
  const proto = THREE.Object3D.prototype;
  return (
    (Object.prototype.hasOwnProperty.call(node, 'onBeforeRender') && node.onBeforeRender !== proto.onBeforeRender) ||
    (Object.prototype.hasOwnProperty.call(node, 'onAfterRender') && node.onAfterRender !== proto.onAfterRender)
  );
}
