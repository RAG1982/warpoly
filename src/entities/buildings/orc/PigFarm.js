import * as THREE from 'three';
import { Building } from '../../Building.js';

/**
 * PigFarm — Fazenda e Criatório de Javalis/Porcos da Horda Orc
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Gerencia 3 instâncias autônomas de Porcos Chunky Low-Poly (PigEntity).
 * - Os porcos vagam aleatoriamente dentro dos limites geométricos da cerca de lama,
 *   farejam o chão, comem no cocho e balançam os rabos em espiral.
 */
export class PigFarm extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'pig_farm', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.pigs = [];
    this.penBounds = {
      minX: -1.7,
      maxX: 2.1,
      minZ: -1.7,
      maxZ: 1.9
    };

    // Cria 3 porcos autônomos dentro do cercado
    const spawnOffsets = [
      { x: -0.6, z: -0.5, color: 0x9c6d53 },
      { x: 0.8, z: 0.6, color: 0xc48772 },
      { x: 0.1, z: 1.1, color: 0x7a523e }
    ];

    spawnOffsets.forEach((cfg, idx) => {
      const pig = this.createProceduralPig(cfg.color);
      pig.position.set(cfg.x, 0.05, cfg.z);
      this.mesh.add(pig);

      this.pigs.push({
        mesh: pig,
        snout: pig.userData.snout,
        tail: pig.userData.tail,
        targetX: cfg.x,
        targetZ: cfg.z,
        state: 'idle', // 'wandering', 'eating', 'idle'
        timer: 1.0 + Math.random() * 2.0,
        speed: 0.75 + Math.random() * 0.4,
        walkCycle: Math.random() * Math.PI * 2
      });
    });
  }

  createProceduralPig(bodyColorHex) {
    const pig = new THREE.Group();
    pig.name = 'Pig_Character';
    pig.scale.set(0.65, 0.65, 0.65);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColorHex,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: true
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x3d271d,
      roughness: 0.85,
      flatShading: true
    });

    // Corpo robusto/chunky
    const bodyGeo = new THREE.BoxGeometry(0.75, 0.55, 1.1);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.38;
    pig.add(body);

    // Cabeça
    const headGeo = new THREE.BoxGeometry(0.5, 0.45, 0.45);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.42, 0.65);
    pig.add(head);

    // Focinho móvel
    const snoutGeo = new THREE.BoxGeometry(0.28, 0.22, 0.18);
    const snout = new THREE.Mesh(snoutGeo, darkMat);
    snout.position.set(0, 0.35, 0.92);
    pig.add(snout);
    pig.userData.snout = snout;

    // Orelhas caídas
    const earGeo = new THREE.ConeGeometry(0.12, 0.25, 4);
    const ear1 = new THREE.Mesh(earGeo, darkMat);
    ear1.position.set(-0.25, 0.62, 0.62);
    ear1.rotation.z = -0.4;
    ear1.rotation.x = -0.2;
    pig.add(ear1);

    const ear2 = new THREE.Mesh(earGeo, darkMat);
    ear2.position.set(0.25, 0.62, 0.62);
    ear2.rotation.z = 0.4;
    ear2.rotation.x = -0.2;
    pig.add(ear2);

    // 4 Patas grossas
    const legGeo = new THREE.BoxGeometry(0.16, 0.26, 0.16);
    const legCoords = [[-0.26, -0.38], [0.26, -0.38], [-0.26, 0.38], [0.26, 0.38]];
    legCoords.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.position.set(lx, 0.13, lz);
      pig.add(leg);
    });

    // Rabo em espiral
    const tailGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4);
    const tail = new THREE.Mesh(tailGeo, darkMat);
    tail.position.set(0, 0.48, -0.62);
    tail.rotation.x = -0.8;
    pig.add(tail);
    pig.userData.tail = tail;

    return pig;
  }

  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {
    // Atualiza a IA e animação de cada porco no cercado
    this.pigs.forEach(p => {
      p.timer -= delta;

      if (p.timer <= 0) {
        // Alterna aleatoriamente entre vagar, comer no cocho e descansar
        const roll = Math.random();
        if (roll < 0.55) {
          p.state = 'wandering';
          p.targetX = THREE.MathUtils.lerp(this.penBounds.minX, this.penBounds.maxX, Math.random());
          p.targetZ = THREE.MathUtils.lerp(this.penBounds.minZ, this.penBounds.maxZ, Math.random());
          p.timer = 2.0 + Math.random() * 3.0;
        } else if (roll < 0.85) {
          p.state = 'eating';
          p.timer = 2.5 + Math.random() * 2.5;
        } else {
          p.state = 'idle';
          p.timer = 1.5 + Math.random() * 2.0;
        }
      }

      if (p.state === 'wandering') {
        const dx = p.targetX - p.mesh.position.x;
        const dz = p.targetZ - p.mesh.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.1) {
          // Rotação suave na direção do alvo
          const targetAngle = Math.atan2(dx, dz);
          p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, targetAngle, delta * 5.0);

          // Movimento para frente
          const step = Math.min(dist, p.speed * delta);
          p.mesh.position.x += Math.sin(p.mesh.rotation.y) * step;
          p.mesh.position.z += Math.cos(p.mesh.rotation.y) * step;

          // Animação de passo (balanço lateral)
          p.walkCycle += delta * 9.0;
          p.mesh.rotation.z = Math.sin(p.walkCycle) * 0.08;
          p.mesh.position.y = 0.05 + Math.abs(Math.sin(p.walkCycle)) * 0.04;
        } else {
          p.state = 'eating';
          p.timer = 2.0;
        }
      } else if (p.state === 'eating') {
        // Animação de farejar/comer a lama
        p.walkCycle += delta * 6.0;
        if (p.snout) {
          p.snout.position.y = 0.35 + Math.sin(p.walkCycle) * 0.04;
        }
        p.mesh.rotation.x = 0.12;
      } else {
        // Idle
        p.mesh.rotation.x = 0;
        p.mesh.rotation.z = 0;
      }

      // Garante que o porco nunca saia dos limites do cercado
      p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x, this.penBounds.minX, this.penBounds.maxX);
      p.mesh.position.z = THREE.MathUtils.clamp(p.mesh.position.z, this.penBounds.minZ, this.penBounds.maxZ);

      // Balanço sutil do rabinho
      if (p.tail) {
        p.tail.rotation.z = Math.sin(p.walkCycle * 2.0) * 0.25;
      }
    });
  }

  cleanupCustomVFX() {
    this.pigs.forEach(p => {
      this.mesh.remove(p.mesh);
    });
    this.pigs = [];
  }
}
