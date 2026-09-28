import * as THREE from 'three';
import { Building } from '../../Building.js';

/**
 * OrcHouse — Toca e Habitação dos Peons Orcs (Orc Burrow)
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Concede +5 de população máxima com custo reduzido de madeira.
 * - VFX: Fumaça suave e esgalhada saindo pelo respiradouro do teto cônico de peles.
 * - VFX: Brilho de fogueira interna (PointLight) escapando pelo vão da porta.
 */
export class OrcHouse extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'orc_house', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.smokeTimer = Math.random() * 0.5;
    this.flickerTimer = 0;

    // 1. Luz de fogueira interna da cabana
    this.hearthLight = new THREE.PointLight(0xff8c2b, 1.2, 7.0, 1.5);
    this.hearthLight.position.set(0.0, 1.4, 1.6);
    this.mesh.add(this.hearthLight);

    // 2. Socket do respiradouro da chaminé de pedra
    this.roofSmokeSocket = new THREE.Vector3(-1.6, 5.2, -1.5);
  }

  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {
    this.flickerTimer += delta * 6.0;

    // 1. Cintilação suave da fogueira interna
    if (this.hearthLight) {
      this.hearthLight.intensity = 1.1 + Math.sin(this.flickerTimer) * 0.25;
    }

    // 2. Fumaça saindo pela chaminé de pedra
    if (particleSystem) {
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.85) {
        this.smokeTimer = 0;
        const worldPos = this.mesh.position.clone().add(this.roofSmokeSocket);
        particleSystem.spawnSmokePuff(worldPos);
      }
    }
  }

  cleanupCustomVFX() {
    if (this.hearthLight) {
      this.mesh.remove(this.hearthLight);
      this.hearthLight.dispose();
      this.hearthLight = null;
    }
  }
}

