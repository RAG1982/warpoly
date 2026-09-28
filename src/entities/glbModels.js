import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { enableShadows } from '../models/materials.js';

/**
 * Modelos .glb gerados pelo pipeline Blender (tools/blender/, tarefa F7-00).
 * No jogo são usados por padrão (desde F7-00c); use ?glb=0 para desligar (ver ModelFactory).
 * O inspetor sempre os carrega para comparar com os procedurais.
 * key -> { url, root: nome do nó raiz no .glb, type: tipo de unidade (ou null) }
 */
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
export const GLB_MODELS = {
  grunt: { url: `${BASE}models/grunt.glb`, root: 'Grunt', type: 'grunt' },
  castle: { url: `${BASE}models/castle.glb`, root: 'Castle', type: null }
};

export const glbEnabled = (() => {
  try {
    if (typeof window === 'undefined') return true;
    const param = new URLSearchParams(window.location.search).get('glb');
    // ?glb=0 desliga; ?glb=1 ativa (redundante, pois já está ativo por padrão)
    return param !== '0';
  } catch (e) {
    return true;
  }
})();

export const glbTemplates = new Map();
let loadPromise = null;

/**
 * Carrega (uma vez) todos os .glb de GLB_MODELS. Falhas individuais só geram
 * aviso: o modelo procedural continua sendo o fallback.
 */
export function loadGlbTemplates() {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = Object.entries(GLB_MODELS).map(([key, def]) =>
    loader.loadAsync(def.url).then(gltf => {
      const root = gltf.scene.getObjectByName(def.root) || gltf.scene;
      if (root.parent) root.parent.remove(root);
      root.position.set(0, 0, 0);
      enableShadows(root);
      glbTemplates.set(key, root);
    }).catch(err => {
      console.warn(`[glbModels] .glb indisponível (${def.url}), usando modelo procedural`, err);
    })
  );
  loadPromise = Promise.all(jobs).then(() => glbTemplates);
  return loadPromise;
}

/**
 * Garante que os .glb foram carregados, memoizando a promessa.
 * Chamada na preload (quando habilitada) e em caminhos com ?skipPreload.
 * Falhas são registradas (console.warn) mas não impedem continuação com modelos procedurais.
 */
export function ensureGlbLoaded() {
  return loadGlbTemplates();
}

/**
 * Cor de time: clona o material `TeamColor` da instância (a textura do atlas
 * continua compartilhada) e aplica a cor. Base para a F7-02.
 */
export function setTeamColor(obj, color) {
  const cache = new Map();
  obj.traverse(child => {
    if (!child.isMesh || !child.material || child.material.name !== 'TeamColor') return;
    const src = child.userData.origMaterial || child.material;
    if (!cache.has(src)) {
      const m = src.clone();
      m.color.set(color);
      cache.set(src, m);
    }
    child.material = cache.get(src);
    if (child.userData.origMaterial) child.userData.origMaterial = child.material;
  });
  return obj;
}

// Download começa já na importação (o AssetPreloader aguarda a promessa).
// Com ?glb=0 pode ser desligado; caso contrário ativa por padrão.
if (glbEnabled) loadGlbTemplates();
