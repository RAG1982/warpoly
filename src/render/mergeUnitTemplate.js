import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeGeometry, unifyAttributes, pruneEmpty } from './mergeStaticTemplate.js';

/**
 * F1-03 — Mesclagem de partes rígidas das unidades, relativa a cada "osso" (nó animado).
 *
 * `mergeStaticTemplate` mescla tudo relativo à RAIZ do objeto, o que não serve para unidades:
 * braços, cabeça, pernas e armas se movem de forma independente (via `UnitAnimator` /
 * `Unit.js`), então cada peça rígida tem que continuar filha do nó que a anima.
 *
 * Nós-pivô (nunca mesclados, preservam nome/transform): a raiz + todo nó cujo nome esteja em
 * `ANIMATED_NODE_NAMES` (usados por `unitAnimator.bindModel` / `ModelFactory.rebindUserData`) +
 * qualquer nó referenciado em `root.userData` (mesmas referências que os dois lugares acima leem).
 * Isso inclui os nós de visibilidade alternada (`Axe`, `Pickaxe`, `Hammer`, `Pack`, `WoodBundle`,
 * `GoldSack`, `Plume`, `DrawnArrow`, `DrawnAxe`): eles continuam existindo (só `visible` muda) e a
 * mescla interna deles vira filha do próprio nó, então o toggle continua funcionando.
 *
 * Para cada malha candidata, o pivô usado é o ancestral mais próximo que seja pivô (a raiz serve de
 * pivô "catch-all" para peças soltas fora de qualquer osso nomeado). Dentro de cada pivô, as malhas
 * são agrupadas por material × castShadow e mescladas com a matriz relativa ao pivô
 * (`pivot.matrixWorld⁻¹ × mesh.matrixWorld`), igual à técnica de `mergeStaticTemplate`.
 *
 * Malhas com material em array (cabeças dos orcs: rosto só na face frontal) já são o mínimo
 * possível (1 draw call por material do array) — ficam como grupo próprio, sem tentar mesclar com
 * mais nada, para não perder o rosto só na frente. `BowStringTop`/`BowStringBottom` nunca entram na
 * mescla (são reposicionadas por `updateBowString`). Malhas com `visible === false` próprio (não o
 * nó-pivô) também ficam como estão.
 *
 * @param {THREE.Object3D} root
 * @param {object} [options]
 * @param {string[]} [options.protectedNames] nomes extra tratados como pivô (além de
 *   `ANIMATED_NODE_NAMES`); a subárvore desses nós vira filha deles como qualquer outro pivô.
 * @returns {THREE.Object3D} a mesma raiz, modificada
 */

/** Nós nomeados lidos por `unitAnimator.bindModel` e `ModelFactory.rebindUserData` (F1-03 doc). */
export const ANIMATED_NODE_NAMES = [
  'Torso', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Sword', 'ShieldGroup', 'Bow', 'Weapon',
  'ToolGroup', 'Axe', 'Pickaxe', 'Hammer', 'Pack', 'WoodBundle', 'GoldSack', 'Plume', 'DrawnArrow',
  'WeaponL', 'WeaponR', 'DrawnAxe', 'Horn', 'Mohawk',
  'HorseLegFL', 'HorseLegFR', 'HorseLegBL', 'HorseLegBR',
  'SiegeArm', 'WheelL', 'WheelR',
  'Fuse'
];

/** Nunca mesclar: reposicionadas por `updateBowString` a cada quadro. */
const NEVER_MERGE_NAMES = new Set(['BowStringTop', 'BowStringBottom']);

export function mergeUnitTemplate(root, options = {}) {
  const nameSet = new Set([...ANIMATED_NODE_NAMES, ...(options.protectedNames || [])]);

  root.updateMatrixWorld(true);

  // 1. Nós-pivô: raiz + nós nomeados + referências em root.userData.
  const pivots = new Set([root]);
  root.traverse(node => {
    if (node !== root && node.name && nameSet.has(node.name)) pivots.add(node);
  });
  collectRootUserDataRefs(root, pivots);

  const pivotInvWorld = new Map();
  for (const p of pivots) {
    pivotInvWorld.set(p, new THREE.Matrix4().copy(p.matrixWorld).invert());
  }

  // 2. Malhas candidatas, agrupadas pelo pivô mais próximo acima.
  let meshesBefore = 0;
  const byPivot = new Map();
  for (const p of pivots) byPivot.set(p, new Map()); // pivot -> key -> mesh[]

  const visit = (node, currentPivot) => {
    if (node.isMesh) meshesBefore++;
    const nextPivot = pivots.has(node) ? node : currentPivot;
    if (node !== root && !pivots.has(node) && isMergeableUnitMesh(node)) {
      const m = node.material;
      const key = `${m.uuid}|${node.castShadow ? 1 : 0}|${node.renderOrder}|${node.frustumCulled ? 1 : 0}`;
      const buckets = byPivot.get(currentPivot);
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = []));
      bucket.push(node);
    }
    for (const child of node.children) visit(child, nextPivot);
  };
  visit(root, root);

  // 3. Mescla cada grupo (≥ 2 malhas) relativo ao seu pivô.
  const rel = new THREE.Matrix4();
  let mergedMeshes = 0;
  let mergedSources = 0;
  for (const [pivot, buckets] of byPivot) {
    const pivotInv = pivotInvWorld.get(pivot);
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      const material = bucket[0].material;
      const geos = bucket.map(mesh => {
        rel.multiplyMatrices(pivotInv, mesh.matrixWorld);
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
      mesh.name = `Merged_${material.name || material.type}_${mergedMeshes}`;
      mesh.castShadow = bucket.some(part => part.castShadow);
      mesh.receiveShadow = bucket.some(part => part.receiveShadow);
      mesh.renderOrder = src.renderOrder;
      mesh.frustumCulled = src.frustumCulled;
      mesh.userData.mergedFrom = bucket.length;
      for (const part of bucket) part.parent?.remove(part);
      pivot.add(mesh);
      mergedMeshes++;
      mergedSources += bucket.length;
    }
  }

  // 4. Poda grupos que ficaram vazios dentro (e entre) os pivôs, sem remover os próprios pivôs.
  for (const pivot of pivots) pruneEmpty(pivot, pivots);
  root.updateMatrixWorld(true);

  let meshesAfter = 0;
  root.traverse(n => { if (n.isMesh) meshesAfter++; });
  mergeUnitTemplate.lastStats = {
    meshesBefore,
    meshesAfter,
    mergedMeshes,
    mergedSources,
    pivots: [...pivots].map(n => n.name || n.type)
  };
  return root;
}

/** Estatísticas da última chamada (para depuração/testes). */
mergeUnitTemplate.lastStats = null;

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

function isMergeableUnitMesh(node) {
  if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh) return false;
  if (node.visible === false) return false;
  if (NEVER_MERGE_NAMES.has(node.name || '')) return false;
  if (node.userData && node.userData.noMerge) return false;
  const geo = node.geometry;
  const mat = node.material;
  if (!geo || !geo.isBufferGeometry || !geo.attributes.position) return false;
  // Material em array: já é o mínimo possível (1 draw call por material) — fica como grupo próprio.
  if (!mat || Array.isArray(mat)) return false;
  if (geo.morphAttributes && Object.keys(geo.morphAttributes).length > 0) return false;
  if (node.morphTargetInfluences && node.morphTargetInfluences.length) return false;
  if (mat.transparent) return false;
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
