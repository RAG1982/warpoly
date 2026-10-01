import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { getTerrainTextures } from '../models/environment/terrainTextures.js';

/**
 * AssetPreloader - Preloads and warms all 3D models and procedural canvas textures
 * at startup to eliminate in-game construction stutters and lag.
 * Populates ModelFactory templates so in-game instantiation is an instant zero-cost clone.
 */
export class AssetPreloader {
  /**
   * Preload all game assets sequentially while reporting progress
   * @param {THREE.WebGLRenderer} renderer - Optional renderer to pre-compile materials
   * @param {Function} onProgress - Callback with { percent, current, total, name, estSeconds }
   */
  static async preloadAll(renderer = null, onProgress = null) {
    // Pipeline Blender (?glb=1): aguarda os .glb antes de aquecer os modelos
    if (ModelFactory.glbEnabled) {
      if (onProgress) onProgress({ percent: 0, current: 0, total: 1, name: 'Modelos 3D (.glb)', estSeconds: 1 });
      await ModelFactory.loadGlbModels();
    }
    const assets = [
      { name: 'Aldeão Construtor', fn: () => ModelFactory.createVillager() },
      { name: 'Cavaleiro Real', fn: () => ModelFactory.createKnight() },
      { name: 'Cavaleiro Montado', fn: () => ModelFactory.createCavalier() },
      { name: 'Balista de Cerco', fn: () => ModelFactory.createBallista() },
      { name: 'Catapulta da Horda', fn: () => ModelFactory.createCatapult() },
      { name: 'Mago Arcano', fn: () => ModelFactory.createUnit('mage') },
      { name: 'Necromante das Cinzas', fn: () => ModelFactory.createUnit('necromancer') },
      { name: 'Esqueleto', fn: () => ModelFactory.createUnit('skeleton') },
      { name: 'Olho Vigia', fn: () => ModelFactory.createUnit('watching_eye') },
      { name: 'Sapador de Pólvora', fn: () => ModelFactory.createSapper() },
      { name: 'Incendiário da Horda', fn: () => ModelFactory.createArsonist() },
      { name: 'Arqueiro de Precisão', fn: () => ModelFactory.createArcher() },
      { name: 'Saqueador Bandido', fn: () => ModelFactory.createBandit() },
      { name: 'Peon Trabalhador da Horda', fn: () => ModelFactory.createPeon() },
      { name: 'Grunt Guerreiro Orc', fn: () => ModelFactory.createGrunt() },
      { name: 'Arremessador Troll da Horda', fn: () => ModelFactory.createAxethrower() },
      { name: 'Ogro Campeão da Horda', fn: () => ModelFactory.createOgre() },
      { name: 'Castelo da Fortaleza', fn: () => ModelFactory.createCastle() },
      { name: 'Quartel Militar', fn: () => ModelFactory.createBarracks() },
      { name: 'Casa Residencial', fn: () => ModelFactory.createCottage() },
      { name: 'Fazenda de Trigo', fn: () => ModelFactory.createFarm() },
      { name: 'Serraria Florestal', fn: () => ModelFactory.createLumberCamp() },
      { name: 'Torre de Vigia', fn: () => ModelFactory.createWatchtower() },
      { name: 'Mina de Ouro', fn: () => ModelFactory.createGoldMine() },
      { name: 'Pedreira Imperial', fn: () => ModelFactory.createStoneQuarry() },
      { name: 'Grande Salão da Horda', fn: () => ModelFactory.createGreatHall() },
      { name: 'Quartel dos Orcs', fn: () => ModelFactory.createOrcBarracks() },
      { name: 'Chiqueiro & Fazenda de Porcos', fn: () => ModelFactory.createPigFarm() },
      { name: 'Serraria Mecânica da Horda', fn: () => ModelFactory.createOrcLumberMill() },
      { name: 'Torre de Vigia da Horda', fn: () => ModelFactory.createOrcWatchtower() },
      { name: 'Forja Real dos Humanos', fn: () => ModelFactory.createHumanForge() },
      { name: 'Forja de Guerra dos Orcs', fn: () => ModelFactory.createOrcForge() },
      { name: 'Acampamento Bárbaro', fn: () => ModelFactory.createBanditCamp() },
      { name: 'Floresta de Carvalhos', fn: () => ModelFactory.createTree('oak') },
      { name: 'Pinheiros da Montanha', fn: () => ModelFactory.createTree('pine') },
      { name: 'Carvalho Dourado de Outono', fn: () => ModelFactory.createTree('autumn') },
      { name: 'Bétula Prateada Imperial', fn: () => ModelFactory.createTree('birch') },
      { name: 'Arbustos com Frutas Silvestres', fn: () => ModelFactory.createBerryBush('red') },
      { name: 'Rochas & Boulders Graníticos', fn: () => ModelFactory.createBoulder('large') },
      { name: 'Troncos & Cogumelos Silvestres', fn: () => ModelFactory.createMushroomStump() },
      { name: 'Vitórias-Régias & Lótus Aquáticas', fn: () => ModelFactory.createWaterLily() },
      { name: 'Canteiros de Flores Campestres', fn: () => ModelFactory.createFlowerPatch('mixed') },
      { name: 'Texturas do Terreno do Reino', fn: () => getTerrainTextures() },
      { name: 'Projéteis e Munições', fn: () => ModelFactory.createArrow() }
    ];

    const total = assets.length;
    const tempScene = new THREE.Scene();
    const tempCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    tempCamera.position.set(0, 5, 10);
    tempCamera.lookAt(0, 0, 0);

    const startTime = performance.now();

    for (let i = 0; i < total; i++) {
      const asset = assets[i];
      const elapsedSec = (performance.now() - startTime) / 1000;
      const avgPerItem = i > 0 ? elapsedSec / i : 0.25;
      const remainingItems = total - i;
      const estRemainingSec = Math.max(0, Math.ceil(remainingItems * avgPerItem));

      if (onProgress) {
        const pct = Math.round((i / total) * 100);
        onProgress({
          percent: pct,
          current: i + 1,
          total,
          name: asset.name,
          estSeconds: estRemainingSec
        });
      }

      // Yield frame to render UI updates smoothly
      await new Promise(resolve => setTimeout(resolve, 20));

      try {
        const model = asset.fn();
        if (model && renderer && model instanceof THREE.Object3D) {
          tempScene.add(model);
          renderer.compile(tempScene, tempCamera);
          tempScene.remove(model);
        }
      } catch (err) {
        console.warn(`[AssetPreloader] Warning warming ${asset.name}:`, err);
      }
    }

    // Pre-warm building ghost previews (zero lag during in-game placement)
    const placeableGhosts = [
      'cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'watchtower',
      'orc_house', 'pig_farm', 'orc_lumber_mill', 'orc_barracks', 'orc_forge', 'orc_watchtower',
      'stable', 'ogre_den', 'workshop', 'orc_workshop', 'arcane_tower', 'ash_sanctum', 'temple', 'storm_altar'
    ];
    placeableGhosts.forEach(bType => {
      try {
        const ghost = ModelFactory.getGhost(bType);
        if (ghost && renderer) {
          tempScene.add(ghost);
          renderer.compile(tempScene, tempCamera);
          tempScene.remove(ghost);
        }
      } catch (e) {}
    });

    if (onProgress) {
      onProgress({
        percent: 100,
        current: total,
        total,
        name: 'Pronto!',
        estSeconds: 0
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
