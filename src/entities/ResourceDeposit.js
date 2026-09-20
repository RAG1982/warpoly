import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';

export class ResourceDeposit {
  constructor(scene, terrain, type, x, z) {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'gold' or 'stone'
    this.resourcesRemaining = 2500;
    this.maxResources = 2500;

    if (type === 'gold') {
      this.name = 'Gold Mine';
      this.mesh = ModelFactory.createGoldMine();
    } else {
      this.name = 'Stone Quarry';
      this.mesh = ModelFactory.createStoneQuarry();
    }

    this.collisionRadius = type === 'gold' ? 3.4 : 3.0;

    const h = this.terrain.getHeight(x, z);
    this.mesh.position.set(x, h, z);
    this.mesh.userData.entity = this;
    this.scene.add(this.mesh);
  }

  createQuarryMesh() {
    return ModelFactory.createStoneQuarry();
  }

  mine(amount, particleSystem) {
    const harvested = Math.min(amount, this.resourcesRemaining);
    this.resourcesRemaining -= harvested;

    if (particleSystem) {
      if (this.type === 'gold') {
        particleSystem.spawnGoldGlitter(this.mesh.position);
      } else {
        particleSystem.spawnStoneDust(this.mesh.position);
      }
    }

    return harvested;
  }
}
