import * as THREE from 'three';
import { Building } from '../../Building.js';

/**
 * OrcLumberMill — Serraria e Centro Madeireiro Industrial da Horda Orc
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Ponto de entrega de madeira para os Peons Orcs.
 * - VFX: Enorme serra circular dentada (Anim_SawBlade) que gira constantemente em torno do seu eixo no update().
 * - VFX: Aceleração da serra e jatos de cavacos de madeira quando toras são processadas.
 */
export class OrcLumberMill extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'orc_lumber_mill', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.sawSpeed = 6.0; // Velocidade base em radianos/segundo
    this.targetSawSpeed = 6.0;
    this.sawdustTimer = 0;

    // 1. Localiza ou constrói a serra circular dentada
    this.sawBlade = this.mesh.getObjectByName('Anim_SawBlade');

    if (!this.sawBlade) {
      this.sawBlade = this.createProceduralSawBlade();
      this.mesh.add(this.sawBlade);
    }

    // 2. Socket do bocal de serragem
    this.sawDustSocket = new THREE.Vector3(0.0, 0.4, 0.4);
  }

  createProceduralSawBlade() {
    const group = new THREE.Group();
    group.name = 'Anim_SawBlade';
    group.position.set(0.0, 1.6, 0.4);

    // Disco central de ferro fundido
    const discGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.08, 16);
    discGeo.rotateZ(Math.PI / 2);
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x3d434f,
      roughness: 0.35,
      metalness: 0.9,
      flatShading: true
    });
    const disc = new THREE.Mesh(discGeo, ironMat);
    group.add(disc);

    // Eixo central
    const axleGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8);
    axleGeo.rotateZ(Math.PI / 2);
    const axleMat = new THREE.MeshStandardMaterial({ color: 0x1f232b, roughness: 0.5, metalness: 0.8 });
    const axle = new THREE.Mesh(axleGeo, axleMat);
    group.add(axle);

    // Dentes afiados triangulares ao redor da borda
    const toothGeo = new THREE.ConeGeometry(0.18, 0.35, 3);
    toothGeo.rotateX(Math.PI / 2);
    const toothMat = new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.25, metalness: 0.95 });

    const numTeeth = 16;
    for (let i = 0; i < numTeeth; i++) {
      const ang = (i / numTeeth) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, toothMat);
      tooth.position.set(0, Math.cos(ang) * 1.25, Math.sin(ang) * 1.25);
      tooth.rotation.x = -ang + 0.3; // Dentes inclinados no sentido de rotação
      group.add(tooth);
    }

    return group;
  }

  /**
   * Acionado quando um Peon entrega um lote de madeira na serraria
   */
  processWoodDelivery(particleSystem) {
    this.targetSawSpeed = 22.0; // Acelera o giro da serra
    if (particleSystem) {
      const worldPos = this.mesh.position.clone().add(this.sawDustSocket);
      particleSystem.spawnWoodChips(worldPos);
    }
  }

  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {
    // 1. Interpolação suave da velocidade da serra
    this.sawSpeed = THREE.MathUtils.lerp(this.sawSpeed, this.targetSawSpeed, delta * 4.0);
    this.targetSawSpeed = THREE.MathUtils.lerp(this.targetSawSpeed, 6.0, delta * 1.5);

    // 2. Rotação contínua da serra dentada em torno do eixo X
    if (this.sawBlade) {
      this.sawBlade.rotation.x += this.sawSpeed * delta;
    }

    // 3. Emissão contínua de serragem sutil se a serra estiver em alta velocidade
    if (this.sawSpeed > 10.0 && particleSystem) {
      this.sawdustTimer += delta;
      if (this.sawdustTimer >= 0.2) {
        this.sawdustTimer = 0;
        const worldPos = this.mesh.position.clone().add(this.sawDustSocket);
        particleSystem.spawnWoodChips(worldPos);
      }
    }
  }

  cleanupCustomVFX() {
    this.sawBlade = null;
  }
}
