import * as THREE from 'three';
import { Building } from '../../Building.js';

/**
 * OrcWatchtower — Torre de Vigia, Sentinela e Baluarte Defensivo da Horda
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Concede raio de visão amplo (28m) através da Névoa de Guerra.
 * - Auto-ataque: dispara machados de arremesso rotativos contra inimigos no raio de 18m.
 * - VFX: Braseiro de ferro suspenso no cume ardendo com PointLight dinâmica e partículas de fogo.
 */
export class OrcWatchtower extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'orc_watchtower', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.fireTimer = 0;
    this.flickerTimer = Math.random() * 10;

    // 1. PointLight do Braseiro no topo da torre
    this.brazierLight = new THREE.PointLight(0xff5511, 2.4, 16, 1.5);
    this.brazierLight.position.set(0.0, 8.6, 0.0);
    this.mesh.add(this.brazierLight);

    // 2. Chamas procedurais no topo do braseiro
    this.flameMesh = this.createProceduralFlame();
    this.flameMesh.position.set(0.0, 8.4, 0.0);
    this.mesh.add(this.flameMesh);

    // 3. Socket para ejeção de fagulhas e fumaça
    this.brazierSocket = new THREE.Vector3(0.0, 8.5, 0.0);
  }

  createProceduralFlame() {
    const flameGroup = new THREE.Group();

    // Núcleo de brasa incandescente
    const emberGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
    const ember = new THREE.Mesh(emberGeo, emberMat);
    flameGroup.add(ember);

    // Chamas cônicas transparentes
    const flameGeo = new THREE.ConeGeometry(0.4, 0.9, 5);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff3b00,
      transparent: true,
      opacity: 0.85
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.35;
    flameGroup.add(flame);

    flameGroup.userData.flameCone = flame;
    return flameGroup;
  }

  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {
    this.flickerTimer += delta * 12.0;

    // 1. Cintilação realista da luz de fogo
    if (this.brazierLight) {
      const noise = Math.sin(this.flickerTimer) * 0.45 + Math.cos(this.flickerTimer * 1.7) * 0.25;
      this.brazierLight.intensity = Math.max(1.4, 2.2 + noise);
    }

    // 2. Animação de escala e rotação da chama 3D
    if (this.flameMesh && this.flameMesh.userData.flameCone) {
      const cone = this.flameMesh.userData.flameCone;
      cone.scale.y = 0.85 + Math.sin(this.flickerTimer * 1.4) * 0.25;
      cone.scale.x = 0.9 + Math.cos(this.flickerTimer * 1.8) * 0.15;
      cone.scale.z = cone.scale.x;
      cone.rotation.y += delta * 4.0;
    }

    // 3. Emissão de fagulhas/brasas e fumaça ao ar livre
    if (particleSystem) {
      this.fireTimer += delta;
      if (this.fireTimer >= 0.5) {
        this.fireTimer = 0;
        const sparkPos = this.mesh.position.clone().add(this.brazierSocket);
        particleSystem.spawnHitSparks(sparkPos);
      }
    }
  }

  cleanupCustomVFX() {
    if (this.brazierLight) {
      this.mesh.remove(this.brazierLight);
      this.brazierLight.dispose();
      this.brazierLight = null;
    }
    if (this.flameMesh) {
      this.mesh.remove(this.flameMesh);
      this.flameMesh = null;
    }
  }
}
