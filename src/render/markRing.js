/**
 * markRing.js — material do anel de seleção com cor própria (`unit.markColor` / `building.markColor`, ações de missão
 * `spawn` e `spawnBuilding`). Um material por cor, criado sob demanda e compartilhado por todas as views (nunca por
 * quadro); mesmas propriedades dos anéis padrão do `UnitView`/`BuildingView` (translúcido, dois lados).
 * Só render: a cor não faz parte do estado de simulação nem do checksum.
 */
import * as THREE from 'three';

/** @type {Map<string, THREE.MeshBasicMaterial>} */
const cache = new Map();

/** @param {string} hex  `#rrggbb` (já validado pelo schema da missão) */
export function markRingMaterial(hex) {
  const key = String(hex).toLowerCase();
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(key), side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    cache.set(key, mat);
  }
  return mat;
}

/** Quantas cores distintas já têm material (diagnóstico/testes). */
export function markRingMaterialCount() {
  return cache.size;
}
