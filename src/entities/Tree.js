import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';

// Shared invisible material for tree raycast/hit proxies
const hitProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });

export class Tree {
  /**
   * @param {object|null} [rng]  F2-03: RNG de simulação (`gm.rngMap`) usado para `rotY`/escala,
   *   para o mapa ficar idêntico entre execuções da mesma seed (visual, mas assim evita divergir
   *   entre replays/testes de determinismo). `fallDir` continua em `Math.random` (puramente
   *   visual — não afeta posição/colisão). Sem `rng` (compatibilidade), cai em `Math.random`.
   */
  constructor(scene, terrain, x, z, type = 'oak', treeManager = null, rng = null) {
    this.scene = scene;
    this.terrain = terrain;
    this.type = 'tree';
    this.treeType = type;
    this.woodRemaining = 120;
    this.maxWood = 120;
    this.isDead = false;
    this.fallProgress = 0;
    this.fallDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(); // visual: não afeta o estado
    this.treeManager = treeManager;

    const h = this.terrain.getHeight(x, z);
    const rotY = (rng ? rng.next() : Math.random()) * Math.PI * 2;
    const s = 0.85 + (rng ? rng.next() : Math.random()) * 0.35;
    this.scale = s;
    this.collisionRadius = 0.75 * s;

    if (this.treeManager) {
      // 1. Instanced Rendering Mode (Single draw call via TreeManager)
      this.treeManager.registerTree(this, x, h, z, rotY, s, type);

      // Lightweight hit proxy for raycasting and position tracking
      const hitGeo = new THREE.CylinderGeometry(0.85 * s, 1.1 * s, 4.5 * s, 6);
      hitGeo.translate(0, 2.25 * s, 0);
      this.mesh = new THREE.Mesh(hitGeo, hitProxyMaterial);
      this.mesh.position.set(x, h, z);
      this.mesh.userData.entity = this;
      this.scene.add(this.mesh);
    } else {
      // Standalone Fallback Mode
      this.mesh = ModelFactory.createTree(type);
      this.mesh.position.set(x, h, z);
      this.mesh.rotation.y = rotY;
      this.mesh.scale.set(s, s, s);
      this.mesh.userData.entity = this;
      this.scene.add(this.mesh);
    }

    // Initial position for shake & fall effects
    this.basePos = this.mesh.position.clone();
    this.baseRotY = rotY;
    this.shakeTimer = 0;
    this.fallingMesh = null;
    this.stumpMesh = null;
  }

  chop(amount, particleSystem) {
    if (this.isDead) return 0;

    const harvested = Math.min(amount, this.woodRemaining);
    this.woodRemaining -= harvested;

    // Spawn chips & leaves
    if (particleSystem) {
      particleSystem.spawnWoodChips(this.mesh.position);
    }

    if (this.woodRemaining <= 0) {
      this.shakeTimer = 0;
      this.die(particleSystem);
    } else {
      // Shake tree only while living
      this.shakeTimer = 0.25;
    }

    return harvested;
  }

  die(particleSystem) {
    if (this.isDead) return;
    this.isDead = true;
    this.woodRemaining = 0;
    this.collisionRadius = 0;
    this.shakeTimer = 0;

    if (this.treeManager) {
      // Permanently hide instanced tree
      this.treeManager.hideTree(this);
      this.fallingMesh = ModelFactory.createTree(this.treeType);
      this.fallingMesh.position.copy(this.basePos);
      this.fallingMesh.rotation.y = this.baseRotY;
      this.fallingMesh.scale.set(this.scale, this.scale, this.scale);
      this.scene.add(this.fallingMesh);
    }
  }

  update(delta, particleSystem) {
    // Shake effect when hit (only active on living standing trees)
    if (!this.isDead && this.shakeTimer > 0) {
      this.shakeTimer -= delta;
      const angle = Math.sin(this.shakeTimer * 40) * 0.08;

      if (this.treeManager) {
        this.treeManager.shakeTree(this, angle);
      } else {
        this.mesh.rotation.z = angle;
      }

      if (this.shakeTimer <= 0) {
        if (this.treeManager) {
          this.treeManager.resetTreeMatrix(this);
        } else {
          this.mesh.rotation.z = 0;
        }
      }
    }

    // Falling over animation when chopped down
    if (this.isDead && this.fallProgress < 1.0) {
      this.fallProgress += delta * 1.5;
      const tilt = (this.fallProgress * Math.PI) / 2;
      const targetMesh = this.fallingMesh || this.mesh;

      targetMesh.rotation.x = this.fallDir.z * tilt;
      targetMesh.rotation.z = -this.fallDir.x * tilt;
      targetMesh.position.y = this.basePos.y - this.fallProgress * 0.6;

      if (this.fallProgress >= 1.0) {
        // Leave cut trunk with mushrooms, remove falling tree mesh
        this.createStump();
        if (this.fallingMesh) {
          this.scene.remove(this.fallingMesh);
          this.fallingMesh = null;
        }
        if (!this.treeManager && this.mesh && this.mesh !== this.stumpMesh) {
          this.scene.remove(this.mesh);
        }
        if (particleSystem) {
          particleSystem.spawnWoodChips(this.basePos);
        }
      }
    }
  }

  createStump() {
    if (this.stumpMesh) return;

    // Cut tree trunk with mushrooms model (same as ambient decoration mushroom stump)
    this.stumpMesh = ModelFactory.createMushroomStump();
    this.stumpMesh.position.copy(this.basePos);
    this.stumpMesh.rotation.y = this.baseRotY;
    this.stumpMesh.scale.set(this.scale, this.scale, this.scale);
    this.stumpMesh.userData.entity = this;

    this.stumpMesh.traverse(child => {
      if (child.isMesh) {
        child.userData.entity = this;
      }
    });

    this.scene.add(this.stumpMesh);

    // Update hit proxy so clicking the stump has an accurate low bounding cylinder
    if (this.mesh) {
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      const stumpHitGeo = new THREE.CylinderGeometry(0.85 * this.scale, 0.95 * this.scale, 1.0 * this.scale, 6);
      stumpHitGeo.translate(0, 0.5 * this.scale, 0);
      this.mesh.geometry = stumpHitGeo;
      this.mesh.position.copy(this.basePos);
    }
  }

  dispose() {
    if (this.treeManager) {
      this.treeManager.hideTree(this);
    }
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
    }
    if (this.fallingMesh) {
      this.scene.remove(this.fallingMesh);
      this.fallingMesh = null;
    }
    if (this.stumpMesh) {
      this.scene.remove(this.stumpMesh);
      this.stumpMesh = null;
    }
  }
}
