import * as THREE from 'three';
import { Building } from '../../Building.js';

/**
 * OrcForge — Forja de Guerra, Armaria e Fundição da Horda Orc
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Centro de aprimoramentos bélicos (+Dano de armas, +Armadura de placas).
 * - VFX: Fogo intenso na fornalha aberta com Shader/Malha de chamas animadas.
 * - VFX: PointLight incandescente de alta potência com cintilação de calor termodinâmico.
 * - VFX: Chaminé alta de basalto expelindo fumaça preta espessa de carvão.
 * - VFX: Faíscas brilhantes de metal incandescente na bigorna durante a forja.
 */
export class OrcForge extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'orc_forge', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.flickerTimer = Math.random() * 10;
    this.smokeTimer = 0;
    this.sparkTimer = 0;

    // 1. PointLight da Fornalha Incandescente
    this.furnaceLight = new THREE.PointLight(0xff4500, 3.2, 14, 1.4);
    this.furnaceLight.position.set(-1.4, 1.8, 0.7);
    this.mesh.add(this.furnaceLight);

    // 2. Chamas animadas no interior da fornalha
    this.furnaceFlames = this.createProceduralFlames();
    this.furnaceFlames.position.set(-1.4, 1.6, 0.6);
    this.mesh.add(this.furnaceFlames);

    // 3. Sockets para partículas
    this.chimneySocket = new THREE.Vector3(-1.8, 9.2, -1.4);
    this.anvilSocket = new THREE.Vector3(1.6, 1.35, 1.8);
  }

  createProceduralFlames() {
    const group = new THREE.Group();
    group.name = 'Mesh_FurnaceFlames';

    // Núcleo de brasa derretida
    const bedGeo = new THREE.BoxGeometry(1.2, 0.25, 0.8);
    const bedMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    group.add(bed);

    // 3 cones de chamas tremulantes
    const flameGeo = new THREE.ConeGeometry(0.28, 0.95, 5);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff3700,
      transparent: true,
      opacity: 0.9
    });

    const flame1 = new THREE.Mesh(flameGeo, flameMat);
    flame1.position.set(-0.35, 0.45, 0);
    group.add(flame1);

    const flame2 = new THREE.Mesh(flameGeo, flameMat);
    flame2.position.set(0.35, 0.45, 0);
    group.add(flame2);

    const flame3 = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.95 }));
    flame3.position.set(0.0, 0.55, 0.1);
    group.add(flame3);

    group.userData.flames = [flame1, flame2, flame3];
    return group;
  }

  /**
   * Acionado quando uma melhoria de ataque/defesa é forjada
   */

  strikeAnvil(particleSystem) {
    if (particleSystem) {
      const worldPos = this.mesh.position.clone().add(this.anvilSocket);
      particleSystem.spawnHitSparks(worldPos);
    }
  }

  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {
    this.flickerTimer += delta * 14.0;

    // 1. Cintilação termodinâmica da fornalha
    if (this.furnaceLight) {
      const noise = Math.sin(this.flickerTimer) * 0.7 + Math.sin(this.flickerTimer * 2.1) * 0.4;
      this.furnaceLight.intensity = Math.max(1.8, 3.2 + noise);
    }

    // 2. Animação das labaredas
    if (this.furnaceFlames && this.furnaceFlames.userData.flames) {
      this.furnaceFlames.userData.flames.forEach((flame, i) => {
        const offset = i * 1.8;
        flame.scale.y = 0.8 + Math.sin(this.flickerTimer + offset) * 0.35;
        flame.scale.x = 0.85 + Math.cos(this.flickerTimer * 1.3 + offset) * 0.2;
        flame.scale.z = flame.scale.x;
      });
    }

    // 3. Fumaça preta espessa de carvão saindo da chaminé alta
    if (particleSystem) {
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.45) {
        this.smokeTimer = 0;
        const worldPos = this.mesh.position.clone().add(this.chimneySocket);
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
    if (this.furnaceFlames) {
      this.mesh.remove(this.furnaceFlames);
      this.furnaceFlames = null;
    }
  }
}
