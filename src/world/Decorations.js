import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';

export class Decorations {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();

    this.createFlowerPatches();
    this.createPebbles();
    this.createGrassTufts();
    this.createBoulders();
    this.createBerryBushes();
    this.createMushroomStumps();
    this.createWaterLilies();

    this.scene.add(this.group);
  }

  createFlowerPatches() {
    // Distinct flower bed locations inspired by modelo.png
    const patchPositions = [
      { x: -8, z: -10, type: 'pink' },
      { x: -14, z: 2, type: 'pink' },
      { x: 14, z: -12, type: 'white' },
      { x: 19, z: 2, type: 'pink' },
      { x: 4, z: 18, type: 'pink' },
      { x: -2, z: 24, type: 'mixed' },
      { x: 28, z: -2, type: 'white' },
      { x: -28, z: -8, type: 'yellow' },
      { x: -22, z: 20, type: 'blue' },
      { x: 9, z: -4, type: 'white' }
    ];

    patchPositions.forEach(patch => {
      const h = this.terrain.getHeight(patch.x, patch.z);
      if (h < 1.8) return;

      const patchGroup = ModelFactory.createFlowerPatch(patch.type);
      patchGroup.position.set(patch.x, h, patch.z);
      this.group.add(patchGroup);
    });
  }

  createPebbles() {
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 32;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const h = this.terrain.getHeight(x, z);

      if (h > 0.4 && h < 3.2) {
        const mesh = ModelFactory.createPebbles(1);
        mesh.position.set(x, h + 0.1, z);
        this.group.add(mesh);
      }
    }
  }

  createGrassTufts() {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 8 + Math.random() * 28;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const h = this.terrain.getHeight(x, z);

      if (h > 1.8) {
        const tuft = ModelFactory.createGrassTuft();
        tuft.position.set(x, h, z);
        this.group.add(tuft);
      }
    }
  }

  createBoulders() {
    const boulderPositions = [
      { x: -24, z: -18, size: 'large' },
      { x: 26, z: 14, size: 'large' },
      { x: -12, z: 28, size: 'medium' },
      { x: 30, z: -18, size: 'medium' },
      { x: -32, z: 8, size: 'small' },
      { x: 8, z: -26, size: 'small' }
    ];

    boulderPositions.forEach(bp => {
      const h = this.terrain.getHeight(bp.x, bp.z);
      if (h < 1.0) return;
      const boulder = ModelFactory.createBoulder(bp.size);
      boulder.position.set(bp.x, h, bp.z);
      boulder.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(boulder);
    });
  }

  createBerryBushes() {
    const bushPositions = [
      { x: -16, z: -12, type: 'red' },
      { x: 12, z: 8, type: 'blue' },
      { x: -6, z: 22, type: 'red' },
      { x: 22, z: -16, type: 'blue' },
      { x: -26, z: -4, type: 'red' },
      { x: 18, z: 22, type: 'red' }
    ];

    bushPositions.forEach(bp => {
      const h = this.terrain.getHeight(bp.x, bp.z);
      if (h < 1.8) return;
      const bush = ModelFactory.createBerryBush(bp.type);
      bush.position.set(bp.x, h, bp.z);
      bush.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(bush);
    });
  }

  createMushroomStumps() {
    const stumpPositions = [
      { x: -22, z: 12 },
      { x: 14, z: -20 },
      { x: -8, z: -24 },
      { x: 24, z: 6 }
    ];

    stumpPositions.forEach(sp => {
      const h = this.terrain.getHeight(sp.x, sp.z);
      if (h < 1.8) return;
      const stump = ModelFactory.createMushroomStump();
      stump.position.set(sp.x, h, sp.z);
      stump.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(stump);
    });
  }

  createWaterLilies() {
    const lilyPositions = [
      { x: -38, z: 18 },
      { x: -35, z: 12 },
      { x: 38, z: -28 },
      { x: 42, z: -22 },
      { x: -32, z: -35 },
      { x: -28, z: -40 },
      { x: 35, z: 32 },
      { x: 30, z: 38 }
    ];

    lilyPositions.forEach(lp => {
      const h = this.terrain.getHeight(lp.x, lp.z);
      if (h > 0.6) return; // In shallow water/shore
      const lily = ModelFactory.createWaterLily();
      lily.position.set(lp.x, 0.05, lp.z);
      lily.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(lily);
    });
  }
}

