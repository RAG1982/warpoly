import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';

export class Tree {
  constructor(scene, terrain, x, z, type = 'oak') {
    this.scene = scene;
    this.terrain = terrain;
    this.type = 'tree';
    this.treeType = type;
    this.woodRemaining = 120;
    this.maxWood = 120;
    this.isDead = false;
    this.fallProgress = 0;
    this.fallDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();

    this.mesh = ModelFactory.createTree(type);
    const h = this.terrain.getHeight(x, z);
    this.mesh.position.set(x, h, z);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.85 + Math.random() * 0.35;
    this.mesh.scale.set(s, s, s);
    this.collisionRadius = 0.75 * s;

    // Attach entity reference for raycasting
    this.mesh.userData.entity = this;
    this.scene.add(this.mesh);

    // Initial position for shake effect
    this.basePos = this.mesh.position.clone();
    this.baseRot = this.mesh.rotation.clone();
    this.shakeTimer = 0;
  }

  chop(amount, particleSystem) {
    if (this.isDead) return 0;

    const harvested = Math.min(amount, this.woodRemaining);
    this.woodRemaining -= harvested;

    // Shake tree
    this.shakeTimer = 0.25;

    // Spawn chips & leaves
    if (particleSystem) {
      particleSystem.spawnWoodChips(this.mesh.position);
    }

    if (this.woodRemaining <= 0) {
      this.die(particleSystem);
    }

    return harvested;
  }

  die(particleSystem) {
    this.isDead = true;
    this.woodRemaining = 0;
    this.collisionRadius = 0;
  }

  update(delta, particleSystem) {
    // Shake effect when hit
    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      const angle = Math.sin(this.shakeTimer * 40) * 0.08;
      this.mesh.rotation.z = this.baseRot.z + angle;
      if (this.shakeTimer <= 0) {
        this.mesh.rotation.copy(this.baseRot);
      }
    }

    // Falling over animation when chopped down
    if (this.isDead && this.fallProgress < 1.0) {
      this.fallProgress += delta * 1.5;
      const tilt = (this.fallProgress * Math.PI) / 2;
      this.mesh.rotation.x = this.fallDir.z * tilt;
      this.mesh.rotation.z = -this.fallDir.x * tilt;
      this.mesh.position.y = this.basePos.y - this.fallProgress * 0.6;

      if (this.fallProgress >= 1.0) {
        // Leave stump, remove tree mesh
        this.createStump();
        this.scene.remove(this.mesh);
      }
    }
  }

  createStump() {
    const stumpMat = ModelFactory.materials.woodMedium;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 6), stumpMat);
    stump.position.set(this.basePos.x, this.basePos.y + 0.2, this.basePos.z);
    stump.castShadow = true;
    stump.receiveShadow = true;
    this.scene.add(stump);
  }
}
