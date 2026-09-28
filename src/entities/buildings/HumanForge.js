import * as THREE from 'three';
import { Building } from '../Building.js';

/**
 * HumanForge — Forja Real, Armaria e Fundição da Aliança Humana
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Centro de pesquisas e aprimoramentos bélicos (+Ataque, +Defesa para Infantaria e Arqueiros).
 * - Visual fiel a forjaHumanos.png:
 *   - Fornalha semicircular de pedra com lareira aberta e braseiro ardente.
 *   - Chaminé alta de alvenaria com colar chanfrado expelindo fumaça.
 *   - Bigorna em bloco de tora com chamas ativas de forjamento e fumaça na face da bigorna.
 *   - Martelo de forja pesado (marreta) apoiado na parede e cepo de madeira ao lado.
 *   - Ferramentas de ferreiro no chão (tenazes, martelo de mão, tarugos de aço).
 * - VFX: PointLight incandescente da fornalha com cintilação térmica.
 * - VFX: PointLight de calor sobre a bigorna.
 * - VFX: Chamas procedurais animadas no interior da lareira e sobre a bigorna.
 * - VFX: Fumaça subindo da chaminé e faíscas brilhantes ao forjar melhorias.
 */
export class HumanForge extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'player') {
    super(scene, terrain, 'forge', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.flickerTimer = Math.random() * 10;
    this.smokeTimer = 0;
    this.anvilSmokeTimer = 0;
    this.sparkTimer = 0;

    // 1. PointLight da Fornalha Incandescente
    this.furnaceLight = new THREE.PointLight(0xff6600, 2.8, 12, 1.3);
    this.furnaceLight.position.set(0.4, 1.6, 0.4);
    this.mesh.add(this.furnaceLight);

    // 2. PointLight da Bigorna com chamas
    this.anvilLight = new THREE.PointLight(0xff4500, 1.5, 6, 1.5);
    this.anvilLight.position.set(-2.2, 1.6, 0.8);
    this.mesh.add(this.anvilLight);

    // 3. Identifica as labaredas animadas na malha
    this.furnaceFlameMeshes = [];
    this.anvilFlameMeshes = [];

    this.mesh.traverse((child) => {
      if (child.isMesh && child.geometry && child.geometry.type === 'ConeGeometry') {
        const parentName = child.parent ? child.parent.name : '';
        if (parentName === 'FurnaceFlames') {
          this.furnaceFlameMeshes.push(child);
        } else if (parentName === 'AnvilFlames') {
          this.anvilFlameMeshes.push(child);
        }
      }
    });

    // 4. Sockets para partículas
    this.chimneySocket = new THREE.Vector3(0.4, 6.7, -0.3);
    this.anvilSocket = new THREE.Vector3(-2.2, 1.5, 0.8);
  }

  /**
   * Acionado quando uma melhoria é forjada ou a bigorna é golpeada
   */
  strikeAnvil(particleSystem) {
    if (particleSystem) {
      const worldPos = this.mesh.position.clone().add(this.anvilSocket);
      particleSystem.spawnHitSparks(worldPos);
    }
  }

  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {
    this.flickerTimer += delta * 12.0;

    // 1. Cintilação térmica da luz da fornalha
    if (this.furnaceLight) {
      const noise = Math.sin(this.flickerTimer) * 0.6 + Math.sin(this.flickerTimer * 2.3) * 0.35;
      this.furnaceLight.intensity = Math.max(1.6, 2.8 + noise);
    }

    // 2. Cintilação da chama na bigorna
    if (this.anvilLight) {
      const aNoise = Math.sin(this.flickerTimer * 1.5 + 1.2) * 0.4;
      this.anvilLight.intensity = Math.max(0.9, 1.5 + aNoise);
    }

    // 3. Animação das labaredas da fornalha
    if (this.furnaceFlameMeshes.length > 0) {
      this.furnaceFlameMeshes.forEach((flame, i) => {
        const offset = i * 1.7;
        flame.scale.y = 0.85 + Math.sin(this.flickerTimer + offset) * 0.3;
        flame.scale.x = 0.9 + Math.cos(this.flickerTimer * 1.2 + offset) * 0.18;
        flame.scale.z = flame.scale.x;
      });
    }

    // 4. Animação das labaredas da bigorna
    if (this.anvilFlameMeshes.length > 0) {
      this.anvilFlameMeshes.forEach((flame, i) => {
        const offset = i * 2.1;
        flame.scale.y = 0.8 + Math.sin(this.flickerTimer * 1.3 + offset) * 0.35;
        flame.scale.x = 0.85 + Math.cos(this.flickerTimer + offset) * 0.2;
        flame.scale.z = flame.scale.x;
      });
    }

    // 5. Fumaça cinza subindo da chaminé
    if (particleSystem) {
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.5) {
        this.smokeTimer = 0;
        const worldPos = this.mesh.position.clone().add(this.chimneySocket);
        particleSystem.spawnSmokePuff(worldPos);
      }

      // Fumaça sutil da bigorna
      this.anvilSmokeTimer += delta;
      if (this.anvilSmokeTimer >= 1.2) {
        this.anvilSmokeTimer = 0;
        const worldPos = this.mesh.position.clone().add(this.anvilSocket);
        particleSystem.spawnSmokePuff(worldPos);
      }
    }
  }

  cleanupCustomVFX() {
    if (this.furnaceLight) {
      this.mesh.remove(this.furnaceLight);
      this.furnaceLight.dispose();
      this.furnaceLight = null;
    }
    if (this.anvilLight) {
      this.mesh.remove(this.anvilLight);
      this.anvilLight.dispose();
      this.anvilLight = null;
    }
    this.furnaceFlameMeshes = [];
    this.anvilFlameMeshes = [];
  }
}
