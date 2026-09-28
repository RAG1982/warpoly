import * as THREE from 'three';
import { FloatingTextPool } from './FloatingTextPool.js';

// F1-08: capacidade dos pools (concurrent máximo antes de reciclar o item mais antigo).
const CHIP_POOL_SIZE = 140; // wood chips + leaves + gold glitter + stone dust + hit sparks (mesma geometria)
const SMOKE_POOL_SIZE = 28;

// F1-08: vetores/objetos de módulo reutilizados por chamada de spawn (nunca alocados por partícula/frame)
const _tmpOffset = new THREE.Vector3();

/** Pool genérico de meshes que compartilham geometria; material é reatribuído (referência), nunca clonado. */
class ChipPool {
  constructor(size, geometry) {
    this.entries = [];
    this._order = 0;
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(geometry, null);
      mesh.visible = false;
      this.entries.push({
        mesh,
        velocity: new THREE.Vector3(),
        gravity: 0,
        life: 0,
        maxLife: 0,
        isSmoke: false,
        active: false,
        order: 0
      });
    }
  }

  acquire() {
    let e = this.entries.find(x => !x.active);
    if (!e) {
      e = this.entries[0];
      for (const cand of this.entries) {
        if (cand.order < e.order) e = cand;
      }
    }
    e.active = true;
    e.order = ++this._order;
    e.mesh.visible = true;
    return e;
  }

  release(e) {
    e.active = false;
    e.mesh.visible = false;
  }
}

/** Pool de fumaça: cada slot tem seu próprio material (clonado 1x na criação do pool, nunca por spawn). */
class SmokePool {
  constructor(size, geometry, baseMaterial) {
    this.entries = [];
    this._order = 0;
    for (let i = 0; i < size; i++) {
      const mat = baseMaterial.clone();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.visible = false;
      this.entries.push({
        mesh,
        mat,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
        order: 0
      });
    }
  }

  acquire() {
    let e = this.entries.find(x => !x.active);
    if (!e) {
      e = this.entries[0];
      for (const cand of this.entries) {
        if (cand.order < e.order) e = cand;
      }
    }
    e.active = true;
    e.order = ++this._order;
    e.mesh.visible = true;
    return e;
  }

  release(e) {
    e.active = false;
    e.mesh.visible = false;
  }

  dispose() {
    for (const e of this.entries) e.mat.dispose();
  }
}

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // Shared simple geometries
    this.chipGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.smokeGeo = new THREE.DodecahedronGeometry(0.25, 0);

    // Reusable materials (referências reatribuídas aos meshes do pool, nunca clonadas por spawn)
    this.woodMat = new THREE.MeshBasicMaterial({ color: 0xc29b68 });
    this.leafMat = new THREE.MeshBasicMaterial({ color: 0x66bb55 });
    this.goldMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.stoneMat = new THREE.MeshBasicMaterial({ color: 0xa0a5a8 });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffea79 });
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0xe0e6ed, transparent: true, opacity: 0.65 });

    // F1-08: pools (substituem criação de Mesh/Vector3/Material por spawn)
    this.chipPool = new ChipPool(CHIP_POOL_SIZE, this.chipGeo);
    this.smokePool = new SmokePool(SMOKE_POOL_SIZE, this.smokeGeo, this.smokeMat);
    for (const e of this.chipPool.entries) this.scene.add(e.mesh);
    for (const e of this.smokePool.entries) this.scene.add(e.mesh);

    // F1-08: pool de sprites de texto flutuante + cache de textura por texto+cor (LRU, 128 entradas)
    this.floatingTextPool = new FloatingTextPool({
      poolSize: 64,
      cacheLimit: 128,
      createTexture: (text, color) => this._createTextTexture(text, color)
    });
    for (const slot of this.floatingTextPool.slots) this.scene.add(slot.sprite);
  }

  _createTextTexture(text, color) {
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

    return new THREE.CanvasTexture(canvas);
  }

  _spawnChip(pos, mat, offsetX, offsetY, offsetZ, velX, velY, velZ, gravity, life, maxLife) {
    const e = this.chipPool.acquire();
    e.mesh.material = mat;
    _tmpOffset.set(offsetX, offsetY, offsetZ);
    e.mesh.position.copy(pos).add(_tmpOffset);
    e.mesh.scale.set(1, 1, 1);
    e.velocity.set(velX, velY, velZ);
    e.gravity = gravity;
    e.life = life;
    e.maxLife = maxLife;
  }

  // Spawn wood chips and leaf bits when a tree is chopped
  spawnWoodChips(pos) {
    for (let i = 0; i < 7; i++) {
      const isLeaf = Math.random() > 0.6;
      this._spawnChip(
        pos, isLeaf ? this.leafMat : this.woodMat,
        (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 3.5, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5,
        9.8, 0.5 + Math.random() * 0.3, 0.8
      );
    }
  }

  // Spawn glittering gold dust when mining gold
  spawnGoldGlitter(pos) {
    for (let i = 0; i < 6; i++) {
      this._spawnChip(
        pos, this.goldMat,
        (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 2.2, 2.0 + Math.random() * 2.0, (Math.random() - 0.5) * 2.2,
        6.0, 0.45 + Math.random() * 0.25, 0.7
      );
    }
  }

  // Spawn stone fragments when quarrying
  spawnStoneDust(pos) {
    for (let i = 0; i < 6; i++) {
      this._spawnChip(
        pos, this.stoneMat,
        (Math.random() - 0.5) * 0.5, 0.6, (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 2.5, 2.2 + Math.random() * 2.0, (Math.random() - 0.5) * 2.5,
        8.5, 0.4 + Math.random() * 0.2, 0.6
      );
    }
  }

  // Combat sparks when weapons strike
  spawnHitSparks(pos) {
    for (let i = 0; i < 5; i++) {
      this._spawnChip(
        pos, this.sparkMat,
        0, 0.9, 0,
        (Math.random() - 0.5) * 4.0, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 4.0,
        8.0, 0.25 + Math.random() * 0.2, 0.45
      );
    }
  }

  // Chimney smoke puffs rising from cottages
  spawnSmokePuff(pos) {
    const e = this.smokePool.acquire();
    e.mesh.position.copy(pos);
    const s = 0.5 + Math.random() * 0.3;
    e.mesh.scale.set(s, s, s);
    e.mat.opacity = 0.65;

    e.velocity.set(
      0.15 + (Math.random() - 0.5) * 0.2,
      0.9 + Math.random() * 0.3,
      -0.2 + (Math.random() - 0.5) * 0.2
    );

    e.gravity = -0.1; // Floats upward
    e.life = 2.2;
    e.maxLife = 2.2;
  }

  // Floating 3D billboard text (+15 Wood, +10 Gold, -18)
  spawnFloatingText(text, pos, color = '#ffd700') {
    this.floatingTextPool.spawn(text, pos, color);
  }

  update(delta) {
    // Update physical particles (chips + sparks, shared geometry pool)
    for (const e of this.chipPool.entries) {
      if (!e.active) continue;
      e.life -= delta;
      e.mesh.position.addScaledVector(e.velocity, delta);
      e.velocity.y -= e.gravity * delta;
      if (e.life <= 0) this.chipPool.release(e);
    }

    // Update smoke puffs
    for (const e of this.smokePool.entries) {
      if (!e.active) continue;
      e.life -= delta;
      e.mesh.position.addScaledVector(e.velocity, delta);
      e.velocity.y -= e.gravity * delta;

      const factor = 1 - (e.life / e.maxLife);
      const s = 0.5 + factor * 1.5;
      e.mesh.scale.set(s, s, s);
      e.mat.opacity = 0.65 * (e.life / e.maxLife);

      if (e.life <= 0) this.smokePool.release(e);
    }

    // Update floating text sprites
    this.floatingTextPool.update(delta);
  }

  /** Remove da cena as partículas e os textos flutuantes vivos (fim da partida, F2-04). */
  clear() {
    for (const e of this.chipPool.entries) this.chipPool.release(e);
    for (const e of this.smokePool.entries) this.smokePool.release(e);
    this.floatingTextPool.clear();
  }

  dispose() {
    this.clear();
    for (const e of this.chipPool.entries) this.scene.remove(e.mesh);
    for (const e of this.smokePool.entries) this.scene.remove(e.mesh);
    for (const slot of this.floatingTextPool.slots) this.scene.remove(slot.sprite);

    this.smokePool.dispose();
    this.floatingTextPool.dispose();

    this.chipGeo?.dispose();
    this.smokeGeo?.dispose();
    this.woodMat?.dispose();
    this.leafMat?.dispose();
    this.goldMat?.dispose();
    this.stoneMat?.dispose();
    this.sparkMat?.dispose();
    this.smokeMat?.dispose();
  }
}
