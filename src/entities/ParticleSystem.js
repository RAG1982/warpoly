import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.floatingTexts = [];

    // Shared simple geometries
    this.chipGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.smokeGeo = new THREE.DodecahedronGeometry(0.25, 0);

    // Reusable materials
    this.woodMat = new THREE.MeshBasicMaterial({ color: 0xc29b68 });
    this.leafMat = new THREE.MeshBasicMaterial({ color: 0x66bb55 });
    this.goldMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.stoneMat = new THREE.MeshBasicMaterial({ color: 0xa0a5a8 });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffea79 });
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0xe0e6ed, transparent: true, opacity: 0.65 });
  }

  // Spawn wood chips and leaf bits when a tree is chopped
  spawnWoodChips(pos) {
    for (let i = 0; i < 7; i++) {
      const isLeaf = Math.random() > 0.6;
      const mesh = new THREE.Mesh(this.chipGeo, isLeaf ? this.leafMat : this.woodMat);
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.8 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.4
      ));

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        2.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 3.5
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        gravity: 9.8,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8
      });
    }
  }

  // Spawn glittering gold dust when mining gold
  spawnGoldGlitter(pos) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.chipGeo, this.goldMat);
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0.5 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.6
      ));

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        2.0 + Math.random() * 2.0,
        (Math.random() - 0.5) * 2.2
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        gravity: 6.0,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7
      });
    }
  }

  // Spawn stone fragments when quarrying
  spawnStoneDust(pos) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.chipGeo, this.stoneMat);
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.6,
        (Math.random() - 0.5) * 0.5
      ));

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        2.2 + Math.random() * 2.0,
        (Math.random() - 0.5) * 2.5
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        gravity: 8.5,
        life: 0.4 + Math.random() * 0.2,
        maxLife: 0.6
      });
    }
  }

  // Combat sparks when weapons strike
  spawnHitSparks(pos) {
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(this.chipGeo, this.sparkMat);
      mesh.position.copy(pos).add(new THREE.Vector3(0, 0.9, 0));

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.0,
        1.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 4.0
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        gravity: 8.0,
        life: 0.25 + Math.random() * 0.2,
        maxLife: 0.45
      });
    }
  }

  // Chimney smoke puffs rising from cottages
  spawnSmokePuff(pos) {
    const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
    mesh.position.copy(pos);
    const s = 0.5 + Math.random() * 0.3;
    mesh.scale.set(s, s, s);

    const vel = new THREE.Vector3(
      0.15 + (Math.random() - 0.5) * 0.2,
      0.9 + Math.random() * 0.3,
      -0.2 + (Math.random() - 0.5) * 0.2
    );

    this.scene.add(mesh);
    this.particles.push({
      mesh,
      velocity: vel,
      gravity: -0.1, // Floats upward
      life: 2.2,
      maxLife: 2.2,
      isSmoke: true
    });
  }

  // Floating 3D billboard text (+15 Wood, +10 Gold, -18)
  spawnFloatingText(text, pos, color = '#ffd700') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.font = 'bold 32px "Cinzel", "Cinzel Decorative", "Trajan Pro", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Dark drop shadow outline
    ctx.fillStyle = '#1c150c';
    ctx.fillText(text, 128 + 2, 32 + 2);
    ctx.fillText(text, 128 - 2, 32 - 2);
    ctx.fillText(text, 128 + 2, 32 - 2);
    ctx.fillText(text, 128 - 2, 32 + 2);

    // Text color
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 0.8, 1);
    sprite.position.copy(pos).add(new THREE.Vector3(0, 1.8, 0));

    this.scene.add(sprite);
    this.floatingTexts.push({
      sprite,
      life: 1.4,
      maxLife: 1.4
    });
  }

  update(delta) {
    // Update physical particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;

      p.mesh.position.addScaledVector(p.velocity, delta);
      p.velocity.y -= p.gravity * delta;

      if (p.isSmoke) {
        // Expand and fade out
        const factor = 1 - (p.life / p.maxLife);
        const s = 0.5 + factor * 1.5;
        p.mesh.scale.set(s, s, s);
        if (p.mesh.material) {
          p.mesh.material.opacity = 0.65 * (p.life / p.maxLife);
        }
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry?.dispose();
        if (p.isSmoke && p.mesh.material) p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= delta;
      ft.sprite.position.y += delta * 1.2; // Float upwards
      ft.sprite.material.opacity = Math.min(1.0, ft.life / 0.5);

      if (ft.life <= 0) {
        this.scene.remove(ft.sprite);
        ft.sprite.material.map?.dispose();
        ft.sprite.material.dispose();
        this.floatingTexts.splice(i, 1);
      }
    }
  }
}
