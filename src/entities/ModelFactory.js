import {
  materials,
  enableShadows,
  createCastle,
  createLumberCamp,
  createGoldMine,
  createStoneQuarry,
  createCottage,
  createBarracks,
  createWatchtower,
  createFarm,
  createTree,
  createKnight,
  createArcher,
  createVillager,
  createBandit,
  createBanditCamp,
  createArrow,
  createFlowerPatch,
  createPebbles,
  createGrassTuft,
  createBerryBush,
  createBoulder,
  createMushroomStump,
  createWaterLily
} from '../models/index.js';

export class ModelFactory {
  // Shared materials
  static materials = materials;

  // Helper to enable shadow casting & receiving on all child meshes
  static enableShadows(obj) {
    return enableShadows(obj);
  }

  // --- Buildings ---
  static createCastle() {
    return createCastle();
  }

  static createLumberCamp() {
    return createLumberCamp();
  }

  static createGoldMine() {
    return createGoldMine();
  }

  static createStoneQuarry() {
    return createStoneQuarry();
  }

  static createCottage() {
    return createCottage();
  }

  static createBarracks() {
    return createBarracks();
  }

  static createWatchtower() {
    return createWatchtower();
  }

  static createFarm() {
    return createFarm();
  }

  static createBanditCamp() {
    return createBanditCamp();
  }

  // --- Environment & Props ---
  static createTree(type = 'oak') {
    return createTree(type);
  }

  static createArrow() {
    return createArrow();
  }

  static createFlowerPatch(type) {
    return createFlowerPatch(type);
  }

  static createPebbles(count) {
    return createPebbles(count);
  }

  static createGrassTuft() {
    return createGrassTuft();
  }

  static createBerryBush(type = 'red') {
    return createBerryBush(type);
  }

  static createBoulder(size = 'large') {
    return createBoulder(size);
  }

  static createMushroomStump() {
    return createMushroomStump();
  }

  static createWaterLily() {
    return createWaterLily();
  }

  // --- Units ---
  static createKnight() {
    return createKnight();
  }

  static createArcher() {
    return createArcher();
  }

  static createVillager() {
    return createVillager();
  }

  static createBandit() {
    return createBandit();
  }
}
