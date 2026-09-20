import * as THREE from 'three';
import {
  createKnight,
  createArcher,
  createVillager,
  createBandit,
  createCastle,
  createBarracks,
  createCottage,
  createFarm,
  createLumberCamp,
  createWatchtower,
  createGoldMine,
  createStoneQuarry,
  createBanditCamp,
  createTree,
  createArrow,
  createBerryBush,
  createBoulder,
  createMushroomStump,
  createWaterLily,
  createFlowerPatch
} from '../models/index.js';
import { getTerrainTextures } from '../models/environment/terrainTextures.js';

/**
 * AssetPreloader - Preloads and warms all 3D models and procedural canvas textures
 * at startup to eliminate in-game construction stutters and lag.
 */
export class AssetPreloader {
  /**
   * Preload all game assets sequentially while reporting progress
   * @param {THREE.WebGLRenderer} renderer - Optional renderer to pre-compile materials
   * @param {Function} onProgress - Callback with { percent, current, total, name, estSeconds }
   */
  static async preloadAll(renderer = null, onProgress = null) {
    const assets = [
      { name: 'Aldeão Construtor', fn: () => createVillager() },
      { name: 'Cavaleiro Real', fn: () => createKnight() },
      { name: 'Arqueiro de Precisão', fn: () => createArcher() },
      { name: 'Saqueador Bandido', fn: () => createBandit() },
      { name: 'Castelo da Fortaleza', fn: () => createCastle() },
      { name: 'Quartel Militar', fn: () => createBarracks() },
      { name: 'Casa Residencial', fn: () => createCottage() },
      { name: 'Fazenda de Trigo', fn: () => createFarm() },
      { name: 'Serraria Florestal', fn: () => createLumberCamp() },
      { name: 'Torre de Vigia', fn: () => createWatchtower() },
      { name: 'Mina de Ouro', fn: () => createGoldMine() },
      { name: 'Pedreira Imperial', fn: () => createStoneQuarry() },
      { name: 'Acampamento Bandido', fn: () => createBanditCamp() },
      { name: 'Floresta de Carvalhos', fn: () => createTree('oak') },
      { name: 'Pinheiros da Montanha', fn: () => createTree('pine') },
      { name: 'Carvalho Dourado de Outono', fn: () => createTree('autumn') },
      { name: 'Bétula Prateada Imperial', fn: () => createTree('birch') },
      { name: 'Arbustos com Frutas Silvestres', fn: () => createBerryBush('red') },
      { name: 'Rochas & Boulders Graníticos', fn: () => createBoulder('large') },
      { name: 'Troncos & Cogumelos Silvestres', fn: () => createMushroomStump() },
      { name: 'Vitórias-Régias & Lótus Aquáticas', fn: () => createWaterLily() },
      { name: 'Canteiros de Flores Campestres', fn: () => createFlowerPatch('mixed') },
      { name: 'Texturas do Terreno do Reino', fn: () => getTerrainTextures() },
      { name: 'Projéteis e Munições', fn: () => createArrow() }
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
      await new Promise(resolve => setTimeout(resolve, 25));

      try {
        const model = asset.fn();
        if (model && renderer) {
          tempScene.add(model);
          renderer.compile(tempScene, tempCamera);
          tempScene.remove(model);
        }
      } catch (err) {
        console.warn(`[AssetPreloader] Warning warming ${asset.name}:`, err);
      }
    }

    if (onProgress) {
      onProgress({
        percent: 100,
        current: total,
        total,
        name: 'Pronto!',
        estSeconds: 0
      });
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
