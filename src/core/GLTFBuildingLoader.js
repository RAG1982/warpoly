import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enableShadows } from '../models/materials.js';

/**
 * GLTFBuildingLoader — Carregador Central Otimizado de Modelos 3D (glTF/GLB)
 * Projetado pelo Arquiteto de Engine para o WarPoly RTS.
 *
 * Recursos:
 * 1. Singleton Cache: Reutiliza buffers geométricos e materiais em memória para múltiplos edifícios.
 * 2. Node Binding Automático: Mapeia nós com prefixos 'Anim_' e 'Socket_' para fácil manipulação no Three.js.
 * 3. Fallback Procedural Imediato: Se o arquivo .glb não estiver presente em /assets/models/,
 *    aciona o gerador procedural estilizado correspondente, garantindo 100% de jogabilidade contínua.
 */
export class GLTFBuildingLoader {
  static loader = new GLTFLoader();
  static modelCache = new Map();
  static proceduralGenerators = new Map();

  /**
   * Registra uma função geradora procedural fallback para um determinado tipo de edifício
   */
  static registerProceduralGenerator(buildingType, generatorFn) {
    this.proceduralGenerators.set(buildingType, generatorFn);
  }

  /**
   * Carrega um modelo .glb de forma assíncrona ou retorna o modelo procedural de fallback
   * @param {string} buildingType - Identificador (ex: 'great_hall', 'orc_barracks')
   * @param {string} [modelUrl] - Caminho opcional do arquivo .glb
   * @returns {Promise<{ mesh: THREE.Group, animNodes: Map<string, THREE.Object3D>, sockets: Map<string, THREE.Vector3> }>}
   */
  static async loadBuilding(buildingType, modelUrl = null) {
    const url = modelUrl || `/assets/models/buildings/orc/${buildingType}.glb`;

    // 1. Tenta carregar do cache de arquivos GLB
    if (this.modelCache.has(url)) {
      const cachedScene = this.modelCache.get(url);
      return this.instantiateModel(cachedScene.clone(true));
    }

    // 2. Tenta fazer o fetch do arquivo .glb
    try {
      const gltf = await this.loadGLTFPromise(url);
      this.modelCache.set(url, gltf.scene);
      return this.instantiateModel(gltf.scene.clone(true));
    } catch (err) {
      // 3. Fallback para Gerador Procedural AAA
      const fallbackGen = this.proceduralGenerators.get(buildingType);
      if (fallbackGen) {
        const proceduralMesh = fallbackGen();
        return this.instantiateModel(proceduralMesh);
      }
      throw new Error(`[GLTFBuildingLoader] Nenhum modelo ou gerador procedural encontrado para: ${buildingType}`);
    }
  }

  /**
   * Helper Promise-based para o Three.js GLTFLoader
   */
  static loadGLTFPromise(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        gltf => resolve(gltf),
        undefined,
        error => reject(error)
      );
    });
  }

  /**
   * Analisa a hierarquia do modelo e mapeia nós de animação ('Anim_') e sockets ('Socket_')
   */
  static instantiateModel(rootMesh) {
    const animNodes = new Map();
    const sockets = new Map();

    // Sombras seletivas (F1-04): só peças com volume relevante projetam sombra
    enableShadows(rootMesh);

    rootMesh.traverse(child => {
      // Mapeia nós animados
      if (child.name && child.name.startsWith('Anim_')) {
        animNodes.set(child.name, child);
      }

      // Mapeia sockets de posicionamento
      if (child.name && child.name.startsWith('Socket_')) {
        sockets.set(child.name, child.position.clone());
      }
    });

    return {
      mesh: rootMesh,
      animNodes,
      sockets
    };
  }
}
