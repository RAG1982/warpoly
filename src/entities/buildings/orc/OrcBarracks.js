import * as THREE from 'three';
import { Building } from '../../Building.js';
import { EVT } from '../../../sim/events.js';

/**
 * OrcBarracks — Quartel de Recrutamento e Treinamento Militar dos Orcs
 *
 * Arquitetura (Engine & Gameplay):
 * - Extende a classe base Building.
 * - Simula física pendular amortecida no boneco de treinamento suspenso (Anim_TrainingDummy).
 * - Ao treinar Grunts ou Axethrowers, aplica um impulso cinético no boneco simulando pancada de combate.
 */
export class OrcBarracks extends Building {
  constructor(scene, terrain, x, z, isConstructed = true, faction = 'enemy') {
    super(scene, terrain, 'orc_barracks', x, z, isConstructed, faction);
  }

  initCustomVFX() {
    this.ambientTime = Math.random() * 10;
    this.dummyAngle = 0;
    this.dummyVelocity = 0;

    // Localiza ou constrói o boneco de treino pendurado
    this.trainingDummy = this.mesh.getObjectByName('Anim_TrainingDummy');

    if (!this.trainingDummy) {
      this.trainingDummy = this.createProceduralDummy();
      this.mesh.add(this.trainingDummy);
    }
  }

  createProceduralDummy() {
    const group = new THREE.Group();
    group.name = 'Anim_TrainingDummy';
    // Pivô fixado na viga suspensa superior
    group.position.set(2.8, 3.8, 1.4);

    // Corda grossa
    const ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 4);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.9, flatShading: true });
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.y = -0.55;
    group.add(rope);

    // Corpo de estopa / palha
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.85, 6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa8875b, roughness: 0.85, flatShading: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -1.45;
    group.add(body);

    // Braços de madeira cruzados
    const armsGeo = new THREE.BoxGeometry(0.9, 0.12, 0.12);
    const armsMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.8, flatShading: true });
    const arms = new THREE.Mesh(armsGeo, armsMat);
    arms.position.y = -1.25;
    group.add(arms);

    // Elmo de ferro amassado com chifre quebrado
    const helmGeo = new THREE.ConeGeometry(0.24, 0.32, 5);
    const helmMat = new THREE.MeshStandardMaterial({ color: 0x2e333d, roughness: 0.45, metalness: 0.8, flatShading: true });
    const helm = new THREE.Mesh(helmGeo, helmMat);
    helm.position.y = -0.92;
    helm.rotation.z = 0.12;
    group.add(helm);

    return group;
  }

  /**
   * Dispara um golpe no boneco de treino quando um guerreiro é recrutado. `fx` é o
   * `ParticleSystem` (uso direto pelo inspetor, fora de uma partida — F2-07); dentro da
   * simulação o impulso roda em `updateCustomVFX` e o VFX sai como evento `BUILDING_VFX`.
   */
  hitDummy(fx) {
    this.dummyVelocity = 0.75; // Impulso angular
    if (fx) {
      const dummyWorld = this.trainingDummy.getWorldPosition(new THREE.Vector3());
      fx.spawnWoodChips(dummyWorld);
    }
  }

  updateCustomVFX(delta, gameManager) {
    this.ambientTime += delta;

    if (this.trainingDummy) {
      // 1. Simulação física de Pêndulo Harmônico Amortecido
      const springForce = -this.dummyAngle * 12.0; // Constante elástica da gravidade/corda
      this.dummyVelocity += springForce * delta;
      this.dummyVelocity *= Math.pow(0.93, delta * 60); // Amortecimento suave
      this.dummyAngle += this.dummyVelocity * delta;

      // 2. Balanço ambiente suave sobreposto
      const idleSway = Math.sin(this.ambientTime * 1.6) * 0.04;
      this.trainingDummy.rotation.z = this.dummyAngle + idleSway;
      this.trainingDummy.rotation.x = Math.cos(this.ambientTime * 1.2) * 0.02;
    }

    // Se estiver treinando tropas, há chance de pancadas periódicas
    if (this.queue.length > 0 && Math.random() < delta * 0.6) {
      this.dummyVelocity = 0.75; // Impulso angular (mesmo efeito de hitDummy, sem tocar particleSystem)
      const gmEvents = gameManager && gameManager.events;
      if (gmEvents && this.trainingDummy) {
        const dummyWorld = this.trainingDummy.getWorldPosition(new THREE.Vector3());
        gmEvents.emit(EVT.BUILDING_VFX, { buildingId: this.id, ownerId: this.ownerId, pos: { x: dummyWorld.x, y: dummyWorld.y, z: dummyWorld.z }, kind: 'dummy_hit' });
      }
    }
  }

  cleanupCustomVFX() {
    this.trainingDummy = null;
  }
}
