import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { getAxethrowerAxeTextures } from '../models/index.js';

export class Arrow {
  constructor(scene, startPos, target, damage, onHitCallback, projectileType = 'arrow') {
    this.scene = scene;
    this.startPos = startPos.clone();
    this.target = target;
    this.targetPos = target.mesh.position.clone();
    this.damage = damage;
    this.onHitCallback = onHitCallback;
    this.projectileType = projectileType;

    this.progress = 0;
    this.speed = projectileType === 'axe' ? 16 : 18; // units per second
    this.dist = this.startPos.distanceTo(this.targetPos);
    this.duration = Math.max(0.3, this.dist / this.speed);
    this.isDead = false;

    this.createProjectileMesh();
  }

  createProjectileMesh() {
    if (this.projectileType === 'axe') {
      const axeGrp = new THREE.Group();
      const axeMat = new THREE.MeshStandardMaterial({
        map: getAxethrowerAxeTextures().map,
        roughness: 0.4,
        metalness: 0.8
      });

      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6), axeMat);
      axeGrp.add(haft);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.32), axeMat);
      blade.position.set(0, 0.32, 0.12);
      axeGrp.add(blade);

      this.mesh = axeGrp;
      this.mesh.scale.set(1.1, 1.1, 1.1);
    } else {
      this.mesh = ModelFactory.createArrow();
    }

    this.mesh.position.copy(this.startPos);
    this.scene.add(this.mesh);
  }

  update(delta) {
    if (this.isDead) return;

    this.progress += delta / this.duration;

    // Track moving target slightly
    if (this.target && this.target.mesh && this.target.hp > 0) {
      this.targetPos.copy(this.target.mesh.position).add(new THREE.Vector3(0, 1.0, 0));
    }

    if (this.progress >= 1.0) {
      this.progress = 1.0;
      this.hit();
      return;
    }

    // Ballistic Arc (Parabola)
    const t = this.progress;
    const current = new THREE.Vector3().lerpVectors(this.startPos, this.targetPos, t);
    const arcHeight = Math.sin(t * Math.PI) * Math.min(4.5, this.dist * 0.25);
    current.y += arcHeight;

    // Calculate tangent for orientation
    const nextT = Math.min(1.0, t + 0.05);
    const nextPos = new THREE.Vector3().lerpVectors(this.startPos, this.targetPos, nextT);
    nextPos.y += Math.sin(nextT * Math.PI) * Math.min(4.5, this.dist * 0.25);

    this.mesh.position.copy(current);

    if (this.projectileType === 'axe') {
      // End-over-end aerodynamic rotation
      this.mesh.lookAt(nextPos);
      this.mesh.rotateX(this.progress * Math.PI * 8);
    } else {
      this.mesh.lookAt(nextPos);
    }
  }

  hit() {
    this.isDead = true;
    if (this.onHitCallback) {
      this.onHitCallback(this.target, this.damage, this.mesh.position);
    }
    this.scene.remove(this.mesh);
  }
}
