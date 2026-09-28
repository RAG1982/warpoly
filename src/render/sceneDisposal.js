/**
 * sceneDisposal.js — descarte de objetos de uma partida (F2-04).
 *
 * `collectSharedResources()` lista geometrias, materiais e texturas que pertencem aos
 * caches da aplicação (templates e fantasmas do ModelFactory, materiais compartilhados).
 * `disposeObjectTree(root, shared)` remove `root` do pai e descarta as geometrias e os
 * materiais das malhas que NÃO estão nesse conjunto. Texturas não são descartadas aqui:
 * quase todas vêm de caches por módulo (terreno, árvores, flora, água) e devem sobreviver
 * à partida; as poucas texturas por partida (névoa, textos flutuantes) são descartadas por
 * quem as cria (GameManager.dispose, ParticleSystem.dispose).
 *
 * Geometrias/materiais em nível de módulo (anéis de seleção, barras de vida…) também
 * são descartados: o three.js recria os buffers/programas no próximo uso, então isso só
 * custa um re-upload e mantém `renderer.info.memory` estável entre partidas.
 */

/** Adiciona a `out` as geometrias, materiais e texturas usados sob `root`. */
export function collectObjectResources(root, out = { geometries: new Set(), materials: new Set(), textures: new Set() }) {
  if (!root || typeof root.traverse !== 'function') return out;
  root.traverse((obj) => {
    if (obj.geometry) out.geometries.add(obj.geometry);
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) addMaterial(m, out);
  });
  return out;
}

function addMaterial(m, out) {
  if (!m || out.materials.has(m)) return;
  out.materials.add(m);
  for (const key in m) {
    const v = m[key];
    if (v && v.isTexture) out.textures.add(v);
  }
  if (m.uniforms) {
    for (const key in m.uniforms) {
      const v = m.uniforms[key]?.value;
      if (v && v.isTexture) out.textures.add(v);
    }
  }
}

/**
 * Recursos que ficam vivos entre partidas.
 * @param {object} factory  o ModelFactory (templates, ghostCache, materials, ghost*Mat)
 * @param {Array<object>} [extra]  objetos/materiais adicionais a preservar
 */
export function collectSharedResources(factory, extra = []) {
  const out = { geometries: new Set(), materials: new Set(), textures: new Set() };
  if (factory) {
    factory.templates?.forEach((t) => collectObjectResources(t, out));
    factory.ghostCache?.forEach((g) => collectObjectResources(g, out));
    if (factory.materials) Object.values(factory.materials).forEach((m) => addMaterial(m, out));
    addMaterial(factory.ghostValidMat, out);
    addMaterial(factory.ghostInvalidMat, out);
  }
  for (const e of extra) {
    if (!e) continue;
    if (e.isMaterial) addMaterial(e, out);
    else if (e.isBufferGeometry) out.geometries.add(e);
    else if (e.isTexture) out.textures.add(e);
    else collectObjectResources(e, out);
  }
  return out;
}

/**
 * Remove `root` do pai e descarta as geometrias/materiais não compartilhados da subárvore.
 * InstancedMesh também libera seus buffers de instância.
 * @returns {{ geometries: number, materials: number }} quantos recursos foram descartados
 */
export function disposeObjectTree(root, shared, disposed = { geometries: new Set(), materials: new Set() }) {
  if (!root) return { geometries: 0, materials: 0 };
  root.removeFromParent?.();
  const sharedGeo = shared?.geometries;
  const sharedMat = shared?.materials;
  root.traverse((obj) => {
    const g = obj.geometry;
    if (g && !(sharedGeo && sharedGeo.has(g)) && !disposed.geometries.has(g)) {
      disposed.geometries.add(g);
      g.dispose();
    }
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (m && !(sharedMat && sharedMat.has(m)) && !disposed.materials.has(m)) {
        disposed.materials.add(m);
        m.dispose();
      }
    }
    if (obj.isInstancedMesh && typeof obj.dispose === 'function') obj.dispose();
  });
  return { geometries: disposed.geometries.size, materials: disposed.materials.size };
}
