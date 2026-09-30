import * as THREE from 'three';
import { FloatingTextPool } from './FloatingTextPool.js';

// F1-08: capacidade dos pools (concurrent máximo antes de reciclar o item mais antigo).
const CHIP_POOL_SIZE = 140; // wood chips + leaves + gold glitter + stone dust + hit sparks (mesma geometria)
const SMOKE_POOL_SIZE = 28;
const BLAST_POOL_SIZE = 6; // F4-05: clarão (esfera) + anel de choque das explosões
const BLAST_LIFE = 0.45;

// F1-08: vetores/objetos de módulo reutilizados por chamada de spawn (nunca alocados por partícula/frame)
const _tmpOffset = new THREE.Vector3();
const _fxA = new THREE.Vector3();
const _fxB = new THREE.Vector3();

// F4-03: efeitos de habilidade (anel no chão e raio/feixe), pools fixos com material próprio por slot.
const FX_POOL_SIZE = 8;
const FX_RING_LIFE = 0.6;
const FX_BEAM_LIFE = 0.25;

class FxPool {
  constructor(size, geometry, scene) {
    this.entries = [];
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.entries.push({ mesh, mat, life: 0, maxLife: 0, radius: 1, active: false, order: 0 });
    }
    this._order = 0;
  }

  acquire() {
    let e = this.entries.find(x => !x.active);
    if (!e) {
      e = this.entries[0];
      for (const c of this.entries) if (c.order < e.order) e = c;
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

    // F4-03: materiais de partícula por cor (cache; conjunto pequeno e fixo de cores de `vfx.color`),
    // anel expansivo no chão e feixe (pools fixos).
    this._colorMats = new Map();
    const ringGeo = new THREE.RingGeometry(0.85, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.fxRingGeo = ringGeo;
    this.fxBeamGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
    this.fxRings = new FxPool(FX_POOL_SIZE, this.fxRingGeo, this.scene);
    this.fxBeams = new FxPool(FX_POOL_SIZE, this.fxBeamGeo, this.scene);

    // F1-08: pool de sprites de texto flutuante + cache de textura por texto+cor (LRU, 128 entradas)
    this.floatingTextPool = new FloatingTextPool({
      poolSize: 64,
      cacheLimit: 128,
      createTexture: (text, color) => this._createTextTexture(text, color)
    });
    for (const slot of this.floatingTextPool.slots) this.scene.add(slot.sprite);

    // F4-05: explosões — partículas de fogo/cinza (chipPool) + clarão e anel (pool próprio de 6)
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a1f });
    this.ashMat = new THREE.MeshBasicMaterial({ color: 0x3a3430 });
    this.blastFlashGeo = new THREE.SphereGeometry(1, 10, 8);
    this.blastRingGeo = new THREE.RingGeometry(0.85, 1, 24);
    this.blasts = [];
    for (let i = 0; i < BLAST_POOL_SIZE; i++) {
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const flash = new THREE.Mesh(this.blastFlashGeo, flashMat);
      const ring = new THREE.Mesh(this.blastRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      flash.visible = false;
      ring.visible = false;
      this.scene.add(flash);
      this.scene.add(ring);
      this.blasts.push({ flash, ring, flashMat, ringMat, life: 0, radius: 1, active: false });
    }
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

  /**
   * F4-05: explosão de sapador — clarão + anel de choque (pool de 6), esfera de fagulhas/cinza
   * (chipPool) e fumaça. Sem alocação por chamada.
   */
  spawnExplosion(pos, radius = 2.2) {
    let b = this.blasts.find(x => !x.active);
    if (!b) {
      b = this.blasts[0];
      for (const c of this.blasts) if (c.life < b.life) b = c;
    }
    b.active = true;
    b.life = BLAST_LIFE;
    b.radius = radius;
    b.flash.position.set(pos.x, pos.y + 0.8, pos.z);
    b.ring.position.set(pos.x, pos.y + 0.15, pos.z);
    b.flash.visible = true;
    b.ring.visible = true;
    for (let i = 0; i < 14; i++) {
      // direção uniforme numa esfera (hemisfério superior favorecido)
      const a = Math.random() * Math.PI * 2;
      const up = 0.2 + Math.random() * 0.8;
      const h = Math.sqrt(1 - up * up);
      const sp = 3 + Math.random() * 4;
      this._spawnChip(
        pos, i % 3 === 0 ? this.ashMat : this.fireMat,
        0, 0.6, 0,
        Math.cos(a) * h * sp, up * sp, Math.sin(a) * h * sp,
        9.0, 0.35 + Math.random() * 0.3, 0.65
      );
    }
    for (let i = 0; i < 3; i++) this.spawnSmokePuff(pos);
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

  /** F4-03: material de partícula da cor `color` (CSS), criado uma vez por cor. */
  _colorMat(color) {
    let m = this._colorMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
      this._colorMats.set(color, m);
    }
    return m;
  }

  /** F4-03: explosão de partículas coloridas (`vfx.kind = 'burst'`). */
  spawnAbilityBurst(pos, color) {
    const mat = this._colorMat(color);
    for (let i = 0; i < 12; i++) {
      this._spawnChip(
        pos, mat,
        0, 0.9, 0,
        (Math.random() - 0.5) * 5, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 5,
        8.0, 0.4 + Math.random() * 0.3, 0.7
      );
    }
  }

  /** F4-03: partículas subindo em volta do alvo por `duration` s (`vfx.kind = 'aura'`). */
  spawnAbilityAura(pos, color, duration = 1) {
    const mat = this._colorMat(color);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      this._spawnChip(
        pos, mat,
        Math.cos(ang) * 0.7, 0.1 + Math.random() * 0.3, Math.sin(ang) * 0.7,
        0, 1.2 + Math.random() * 0.8, 0,
        0, duration * (0.6 + Math.random() * 0.4), duration
      );
    }
  }

  /** F4-03: anel que se expande no chão até `radius` (`vfx.kind = 'ring'`). */
  spawnAbilityRing(pos, color, radius = 2) {
    const e = this.fxRings.acquire();
    e.mat.color.set(color);
    e.radius = Math.max(0.5, radius);
    e.life = FX_RING_LIFE;
    e.maxLife = FX_RING_LIFE;
    e.mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    e.mesh.scale.set(0.3, 1, 0.3);
    e.mat.opacity = 0.9;
  }

  /** F4-03: feixe efêmero entre dois pontos (`vfx.kind = 'beam'`). */
  spawnAbilityBeam(from, to, color) {
    const e = this.fxBeams.acquire();
    e.mat.color.set(color);
    e.life = FX_BEAM_LIFE;
    e.maxLife = FX_BEAM_LIFE;
    _fxA.set(from.x, from.y + 1.6, from.z);
    _fxB.set(to.x, to.y + 1.2, to.z);
    const len = Math.max(0.01, _fxA.distanceTo(_fxB));
    e.mesh.position.copy(_fxA).lerp(_fxB, 0.5);
    e.mesh.lookAt(_fxB);
    e.mesh.scale.set(1, 1, len);
    e.mat.opacity = 0.95;
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

    // F4-05: clarões/anéis de explosão
    for (const b of this.blasts) {
      if (!b.active) continue;
      b.life -= delta;
      if (b.life <= 0) {
        b.active = false;
        b.flash.visible = false;
        b.ring.visible = false;
        continue;
      }
      const t = 1 - b.life / BLAST_LIFE;
      const fs = b.radius * (0.35 + 0.65 * t);
      b.flash.scale.set(fs, fs, fs);
      b.flashMat.opacity = 0.85 * (1 - t) * (1 - t);
      const rs = b.radius * (0.4 + 1.0 * t);
      b.ring.scale.set(rs, rs, rs);
      b.ringMat.opacity = 0.8 * (1 - t);
    }
    // F4-03: anéis e feixes de habilidade
    for (const e of this.fxRings.entries) {
      if (!e.active) continue;
      e.life -= delta;
      const t = 1 - Math.max(0, e.life) / e.maxLife;
      const r = 0.3 + (e.radius - 0.3) * t;
      e.mesh.scale.set(r, 1, r);
      e.mat.opacity = 0.9 * (1 - t);
      if (e.life <= 0) this.fxRings.release(e);
    }
    for (const e of this.fxBeams.entries) {
      if (!e.active) continue;
      e.life -= delta;
      e.mat.opacity = 0.95 * Math.max(0, e.life / e.maxLife);
      if (e.life <= 0) this.fxBeams.release(e);
    }

    // Update floating text sprites
    this.floatingTextPool.update(delta);
  }

  /** Remove da cena as partículas e os textos flutuantes vivos (fim da partida, F2-04). */
  clear() {
    for (const e of this.chipPool.entries) this.chipPool.release(e);
    for (const e of this.smokePool.entries) this.smokePool.release(e);
    this.floatingTextPool.clear();
    for (const b of this.blasts) {
      b.active = false;
      b.flash.visible = false;
      b.ring.visible = false;
    }
    for (const e of this.fxRings.entries) this.fxRings.release(e);
    for (const e of this.fxBeams.entries) this.fxBeams.release(e);
  }

  dispose() {
    this.clear();
    for (const e of this.chipPool.entries) this.scene.remove(e.mesh);
    for (const e of this.smokePool.entries) this.scene.remove(e.mesh);
    for (const slot of this.floatingTextPool.slots) this.scene.remove(slot.sprite);

    for (const b of this.blasts) {
      this.scene.remove(b.flash);
      this.scene.remove(b.ring);
      b.flashMat.dispose();
      b.ringMat.dispose();
    }
    this.blastFlashGeo.dispose();
    this.blastRingGeo.dispose();
    this.fireMat.dispose();
    this.ashMat.dispose();
    for (const e of this.fxRings.entries) { this.scene.remove(e.mesh); e.mat.dispose(); }
    for (const e of this.fxBeams.entries) { this.scene.remove(e.mesh); e.mat.dispose(); }
    this.fxRingGeo.dispose();
    this.fxBeamGeo.dispose();
    for (const m of this._colorMats.values()) m.dispose();
    this._colorMats.clear();

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
