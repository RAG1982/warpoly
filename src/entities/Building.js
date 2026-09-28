import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { Arrow } from './Arrow.js';
import { UPGRADE_CONFIG, FORGE_UPGRADES } from '../core/UpgradeConfig.js';
import { legacyOwnerId } from '../sim/EntityIds.js';

import {
  getBuildingDef,
  getBuildingStats as getBuildingStatsFromData,
  isWorkerType,
  UNIT_TRAIN_CONFIG,
  BUILDING_BUILD_CONFIG,
  WORKER_BUILD_LIST
} from '../data/index.js';

// Tabelas derivadas de src/data (F0-06). Reexportadas com os nomes legados porque
// UIManager, InputManager e outros módulos importam daqui.
export { UNIT_TRAIN_CONFIG, BUILDING_BUILD_CONFIG, WORKER_BUILD_LIST };

// Shared Ring Geometries by building radius
const bldRingGeoCastle = new THREE.RingGeometry(5.95, 6.2, 32);
bldRingGeoCastle.rotateX(-Math.PI / 2);
const bldRingGeoBarracks = new THREE.RingGeometry(4.25, 4.5, 32);
bldRingGeoBarracks.rotateX(-Math.PI / 2);
const bldRingGeoDefault = new THREE.RingGeometry(3.35, 3.6, 32);
bldRingGeoDefault.rotateX(-Math.PI / 2);

const bldRingMat = new THREE.MeshBasicMaterial({
  color: 0xdeb841,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});

// Shared Scaffold Geometries
const scafPoleGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 5);
const scafRailGeo = new THREE.BoxGeometry(4.2, 0.1, 0.1);

// Shared 3D Health Bar Geometries & Materials (Zero Canvas, zero texture uploads)
const bldHpBgGeo = new THREE.PlaneGeometry(2.46, 0.34);
const bldHpFillGeo = new THREE.PlaneGeometry(2.38, 0.26);
bldHpFillGeo.translate(1.19, 0, 0); // pivot left edge

const bldHpBgMat = new THREE.MeshBasicMaterial({
  color: 0x0f172a,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  transparent: false
});
const bldHpGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const bldHpYellowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const bldHpRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

// F1-08: vetores de módulo reutilizados por frame (evita alocação em update/VFX)
const _flameSmokePos = new THREE.Vector3();
const _chimneyPos = new THREE.Vector3();
const _chimneyOffsetGreatHall = new THREE.Vector3(-2.2, 9.8, -1.8);
const _chimneyOffsetCottage = new THREE.Vector3(-2.1, 4.4, -0.6);
const _towerArrowStart = new THREE.Vector3();

export class Building {
  /**
   * @param {number|'player'|'enemy'} [owner]  ownerId do Player dono (F2-01); aceita o lado legado.
   */
  constructor(scene, terrain, type, x, z, isConstructed = true, owner = 0) {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'castle', 'lumber_camp', 'cottage', 'barracks', 'watchtower', 'farm', 'bandit_camp'
    /** Id estável da entidade (atribuído por GameManager.registerEntity). */
    this.id = undefined;
    /** Id do Player dono (F2-01). */
    this.ownerId = legacyOwnerId(owner);
    /** Injetado pelo GameManager.createBuilding logo após a construção. */
    this.gameManager = null;
    this.isConstructed = isConstructed;
    this.buildProgress = isConstructed ? 100 : 0;
    this.maxBuildProgress = 100;

    // Stats config
    const stats = Building.getBuildingStats(type);
    this.name = stats.name;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.cost = stats.cost;
    this.popGranted = stats.popGranted || 0;
    this.attackRange = stats.attackRange || 0;
    this.attackDamage = stats.attackDamage || 0;
    this.collisionRadius = stats.collisionRadius || 3.0;
    this.attackCooldown = stats.attackCooldown;
    this.attackTimer = 0;

    // Training / Production queue & Research
    this.queue = [];
    this.currentResearch = null;
    this.researchSoundTimer = 0;
    const rallyDist = this.collisionRadius + 2.5;
    this.rallyPoint = new THREE.Vector3(x + (this.type === 'castle' ? 0 : 2.0), 0, z + rallyDist);
    this.rallyPoint.y = this.terrain.getHeight(this.rallyPoint.x, this.rallyPoint.z);

    // Smoke timer for cottage chimney
    this.smokeTimer = 0;
    this.passiveTimer = 0;

    // Create 3D Meshes
    this.fullMesh = this.createBuildingMesh(type);
    const h = this.terrain.getHeight(x, z);
    this.fullMesh.position.set(x, h, z);
    this.fullMesh.userData.entity = this;

    // Foundation scaffold mesh (shown when under construction)
    this.scaffoldMesh = this.createScaffoldMesh();
    this.scaffoldMesh.position.set(x, h, z);
    this.scaffoldMesh.userData.entity = this;

    this.mesh = new THREE.Group();
    this.mesh.position.set(x, h, z);
    this.fullMesh.position.set(0, 0, 0);
    this.scaffoldMesh.position.set(0, 0, 0);

    this.mesh.add(this.fullMesh);
    this.mesh.add(this.scaffoldMesh);
    this.mesh.userData.entity = this;

    this.isSelected = false;
    this.underAttackTimer = 0;
    this.flamesGroup = null;
    this.flameTongues = [];
    this.flameClusters = [];
    this.flameTime = 0;
    this.flameSmokeTimer = 0;

    this.updateConstructionState();
    this.createSelectionRing();
    this.createRallyFlag();
    this.createHealthBar();

    // Lifecycle hook for subclass VFX and animations
    this.initCustomVFX();

    if (this.scene) this.scene.add(this.mesh);
  }

  // Base virtual methods for custom VFX/animations
  initCustomVFX() {}
  updateCustomVFX(delta, gameManager, soundManager, particleSystem) {}
  cleanupCustomVFX() {}

  /**
   * Lado relativo ao jogador local ('player' | 'enemy').
   * DÍVIDA (F2-01): getter de compatibilidade para UI/InputManager/névoa; use ownerId + isHostile.
   */
  get faction() {
    const gm = this.gameManager;
    const localId = gm && typeof gm.localPlayerId === 'number' ? gm.localPlayerId : 0;
    return this.ownerId === localId ? 'player' : 'enemy';
  }

  /** Dono de `other` é hostil ao dono desta construção (por time). */
  isHostileTo(other) {
    if (!other) return false;
    const gm = this.gameManager;
    if (gm && gm.isHostile) return gm.isHostile(this.ownerId, other.ownerId);
    return other.ownerId !== this.ownerId;
  }

  /** Player dono (economia/pop/pesquisas), ou null fora de uma partida. */
  getOwner(gameManager = this.gameManager) {
    return gameManager && gameManager.getPlayer ? gameManager.getPlayer(this.ownerId) : null;
  }

  static getBuildingStats(type) {
    return getBuildingStatsFromData(type);
  }

  createBuildingMesh(type) {
    switch (type) {
      case 'castle': return ModelFactory.createCastle();
      case 'great_hall': return ModelFactory.createGreatHall();
      case 'lumber_camp': return ModelFactory.createLumberCamp();
      case 'orc_lumber_mill': return ModelFactory.createOrcLumberMill();
      case 'cottage': return ModelFactory.createCottage();
      case 'pig_farm': return ModelFactory.createPigFarm();
      case 'orc_house': return ModelFactory.createOrcHouse ? ModelFactory.createOrcHouse() : ModelFactory.createCottage();
      case 'orc_forge': return ModelFactory.createOrcForge ? ModelFactory.createOrcForge() : ModelFactory.createOrcBarracks();
      case 'forge': return ModelFactory.createHumanForge ? ModelFactory.createHumanForge() : ModelFactory.createBarracks();
      case 'barracks': return ModelFactory.createBarracks();
      case 'orc_barracks': return ModelFactory.createOrcBarracks();
      case 'watchtower': return ModelFactory.createWatchtower();
      case 'orc_watchtower': return ModelFactory.createOrcWatchtower();
      case 'farm': return ModelFactory.createFarm();
      case 'bandit_camp': return ModelFactory.createBanditCamp();
      default: return ModelFactory.createCottage();
    }
  }

  createScaffoldMesh() {
    const scaf = new THREE.Group();
    scaf.name = 'Scaffold';
    const mat = ModelFactory.materials.woodMedium;

    // Corner timber poles (shared geometry)
    const coords = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
    coords.forEach(([cx, cz]) => {
      const p = new THREE.Mesh(scafPoleGeo, mat);
      p.position.set(cx, 1.25, cz);
      scaf.add(p);
    });

    // Horizontal rails (shared geometry)
    const r1 = new THREE.Mesh(scafRailGeo, mat);
    r1.position.set(0, 1.8, -2);
    scaf.add(r1);
    const r2 = new THREE.Mesh(scafRailGeo, mat);
    r2.position.set(0, 1.8, 2);
    scaf.add(r2);

    return ModelFactory.enableShadows(scaf);
  }

  createSelectionRing() {
    const ringGeo = (this.type === 'castle' || this.type === 'great_hall')
      ? bldRingGeoCastle
      : (this.type === 'barracks' || this.type === 'orc_barracks')
      ? bldRingGeoBarracks
      : bldRingGeoDefault;

    this.selectionRing = new THREE.Mesh(ringGeo, bldRingMat);
    this.selectionRing.name = 'SelectionRing';
    this.selectionRing.position.y = 0.08;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }

  createRallyFlag() {
    this.rallyGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 4), ModelFactory.materials.woodDark);
    pole.position.y = 0.9;
    this.rallyGroup.add(pole);

    const bannerMat = (this.type === 'great_hall' || this.type === 'orc_barracks') ? ModelFactory.materials.redPlume : ModelFactory.materials.bannerBlue;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.04), bannerMat);
    banner.position.set(0.3, 1.45, 0);
    this.rallyGroup.add(banner);

    this.rallyGroup.position.copy(this.rallyPoint);
    this.rallyGroup.visible = false;
    if (this.scene) this.scene.add(this.rallyGroup);
  }

  getBuildingHeight() {
    return getBuildingDef(this.type).healthBarHeight;
  }

  createHealthBar() {
    this.hpGroup = new THREE.Group();
    this.hpGroup.name = 'HealthBar';
    this.hpGroup.position.set(this.mesh.position.x, this.mesh.position.y + this.getBuildingHeight() + 0.8, this.mesh.position.z);

    const bgMesh = new THREE.Mesh(bldHpBgGeo, bldHpBgMat);
    bgMesh.name = 'HealthBg';
    bgMesh.renderOrder = 1100;
    this.hpGroup.add(bgMesh);

    this.hpFillMesh = new THREE.Mesh(bldHpFillGeo, bldHpGreenMat);
    this.hpFillMesh.name = 'HealthFill';
    this.hpFillMesh.position.set(-1.19, 0, 0.005);
    this.hpFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.hpFillMesh);

    const barScale = Math.max(1.0, (this.collisionRadius * 0.95) / 2.4);
    this.hpGroup.scale.set(barScale, 1.0, 1.0);

    this.hpGroup.visible = false;
    this.hpSprite = this.hpGroup; // backward compatibility alias
    if (this.scene) this.scene.add(this.hpGroup);
    this.updateHealthBar();
  }

  updateHealthBar() {
    if (!this.hpFillMesh) return;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFillMesh.scale.x = Math.max(0.001, pct);
    this.hpFillMesh.material = pct > 0.5 ? bldHpGreenMat : (pct > 0.25 ? bldHpYellowMat : bldHpRedMat);
  }

  createDamageFlames() {
    if (this.flamesGroup) return;

    this.flamesGroup = new THREE.Group();
    this.flameTongues = [];
    this.flameClusters = [];

    const fireOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xff3b00,
      emissive: 0xff2200,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      flatShading: true
    });
    const fireYellowMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      emissive: 0xffcc00,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      flatShading: true
    });
    const charcoalMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.9,
      flatShading: true
    });

    const h = this.getBuildingHeight();
    const r = this.collisionRadius * 0.55;

    // 3 prominent flame cluster positions across building roofs and facades
    const clusterPositions = [
      new THREE.Vector3(-r * 0.1, h * 0.78, -r * 0.1),
      new THREE.Vector3(r * 0.5, h * 0.52, r * 0.25),
      new THREE.Vector3(-r * 0.35, h * 0.38, r * 0.55)
    ];

    clusterPositions.forEach((pos, cIdx) => {
      const cluster = new THREE.Group();
      cluster.position.copy(pos);
      const clusterScale = cIdx === 0 ? 1.3 : cIdx === 1 ? 1.15 : 1.0;
      cluster.scale.set(clusterScale, clusterScale, clusterScale);

      // Charred ember base
      const baseGeo = new THREE.CylinderGeometry(0.45, 0.58, 0.1, 5);
      const baseMesh = new THREE.Mesh(baseGeo, charcoalMat);
      baseMesh.position.y = 0.05;
      cluster.add(baseMesh);

      // Main center flame
      const mainGeo = new THREE.ConeGeometry(0.42, 1.45, 5);
      const mainMesh = new THREE.Mesh(mainGeo, fireOrangeMat);
      mainMesh.position.y = 0.72;
      cluster.add(mainMesh);
      this.flameTongues.push({
        mesh: mainMesh,
        baseScaleX: 1,
        baseScaleY: 1,
        baseRotZ: 0,
        offset: cIdx * 1.5
      });

      // Inner glowing core
      const coreGeo = new THREE.ConeGeometry(0.24, 0.9, 5);
      const coreMesh = new THREE.Mesh(coreGeo, fireYellowMat);
      coreMesh.position.y = 0.48;
      cluster.add(coreMesh);
      this.flameTongues.push({
        mesh: coreMesh,
        baseScaleX: 1,
        baseScaleY: 1,
        baseRotZ: 0,
        offset: cIdx * 1.5 + 0.8
      });

      // Side flame 1
      const side1Geo = new THREE.ConeGeometry(0.3, 1.1, 5);
      const side1Mesh = new THREE.Mesh(side1Geo, fireOrangeMat);
      side1Mesh.position.set(0.22, 0.52, 0.12);
      side1Mesh.rotation.z = -0.25;
      cluster.add(side1Mesh);
      this.flameTongues.push({
        mesh: side1Mesh,
        baseScaleX: 0.85,
        baseScaleY: 0.85,
        baseRotZ: -0.25,
        offset: cIdx * 1.5 + 1.6
      });

      // Side flame 2
      const side2Geo = new THREE.ConeGeometry(0.24, 0.85, 5);
      const side2Mesh = new THREE.Mesh(side2Geo, fireOrangeMat);
      side2Mesh.position.set(-0.18, 0.42, -0.15);
      side2Mesh.rotation.z = 0.28;
      cluster.add(side2Mesh);
      this.flameTongues.push({
        mesh: side2Mesh,
        baseScaleX: 0.7,
        baseScaleY: 0.7,
        baseRotZ: 0.28,
        offset: cIdx * 1.5 + 2.4
      });

      this.flamesGroup.add(cluster);
      this.flameClusters.push(cluster);
    });

    // Flickering warm fire light on building
    const fireLight = new THREE.PointLight(0xff5500, 1.8, 12.0);
    fireLight.position.set(0, h * 0.6, 0);
    this.flamesGroup.add(fireLight);
    this.flamesGroup.userData.fireLight = fireLight;

    this.flamesGroup.visible = false;
    this.mesh.add(this.flamesGroup);
  }

  updateDamageFlames() {
    const isDamagedOver50 = this.hp < this.maxHp * 0.5 && !this.isDead;
    if (isDamagedOver50) {
      if (!this.flamesGroup) {
        this.createDamageFlames();
      }
      this.flamesGroup.visible = true;
    } else if (this.flamesGroup) {
      this.flamesGroup.visible = false;
    }
  }

  setSelected(selected) {
    this.isSelected = selected;
    this.selectionRing.visible = selected;
    if (this.hpGroup) {
      this.hpGroup.visible = (this.mesh ? this.mesh.visible : true) && !this.isDead && (selected || this.hp < this.maxHp || (this.underAttackTimer && this.underAttackTimer > 0));
    }
    if (this.rallyGroup) {
      this.rallyGroup.visible = selected && (this.type === 'castle' || this.type === 'barracks' || this.type === 'great_hall' || this.type === 'orc_barracks');
    }
  }

  setRallyPoint(pos) {
    this.rallyPoint.copy(pos);
    this.rallyPoint.y = this.terrain.getHeight(pos.x, pos.z);
    if (this.rallyGroup) {
      this.rallyGroup.position.copy(this.rallyPoint);
      this.rallyGroup.visible = true;
    }
  }

  updateConstructionState() {
    if (this.isConstructed) {
      this.fullMesh.visible = true;
      this.scaffoldMesh.visible = false;
      this.fullMesh.scale.set(1, 1, 1);
    } else {
      this.fullMesh.visible = true;
      this.scaffoldMesh.visible = true;
      // Rising building height based on progress
      const factor = Math.max(0.1, this.buildProgress / 100);
      this.fullMesh.scale.set(1, factor, 1);
    }
  }

  construct(amount, soundManager, particleSystem, gameManager) {
    if (this.isConstructed) return;
    const gm = gameManager || this.gameManager;
    this.buildProgress += amount;
    if (particleSystem) {
      particleSystem.spawnWoodChips(this.mesh.position);
    }
    if (this.buildProgress >= 100) {
      this.buildProgress = 100;
      this.isConstructed = true;
      this.updateConstructionState();
      this.updateHealthBar();
      this.updateDamageFlames();
      if (soundManager) soundManager.playBuildComplete();
      if (particleSystem) {
        particleSystem.spawnFloatingText('Constructed!', this.mesh.position, '#ffd700');
      }
      const owner = this.getOwner(gm);
      if (owner) owner.recalculatePop(gm);
    } else {
      this.updateConstructionState();
    }
  }

  takeDamage(amount, particleSystem, attacker = null) {
    this.hp -= amount;
    this.underAttackTimer = 6.0;
    this.updateHealthBar();
    if (this.hpGroup) {
      this.hpGroup.visible = (this.mesh ? this.mesh.visible : true) && !this.isDead && (this.isSelected || this.hp < this.maxHp || this.underAttackTimer > 0);
    }
    this.updateDamageFlames();

    if (particleSystem) {
      particleSystem.spawnFloatingText(`-${Math.round(amount)}`, this.mesh.position, '#ff4d4d');
      particleSystem.spawnHitSparks(this.mesh.position);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  die() {
    this.isDead = true;
    if (this.hpGroup) this.hpGroup.visible = false;
    if (this.flamesGroup) this.flamesGroup.visible = false;
    this.dispose();
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.cleanupCustomVFX();
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
    if (this.rallyGroup && this.scene) {
      this.scene.remove(this.rallyGroup);
    }
    if (this.hpGroup && this.scene) {
      this.scene.remove(this.hpGroup);
    }
  }

  queueUnit(unitType, gameManager) {
    // Maximum 6 slots in the training queue
    if (this.queue.length >= 6) {
      return false;
    }

    // Only workers can be trained at Town Centers (Castle / Great Hall)
    const role = getBuildingDef(this.type).role;
    if (role === 'hq' && !isWorkerType(unitType)) {
      return false;
    }
    // Only military units can be trained at Barracks
    if (role === 'barracks' && isWorkerType(unitType)) {
      return false;
    }

    const cfg = UNIT_TRAIN_CONFIG[unitType];
    if (!cfg) return false;
    const c = cfg.cost;

    const gm = gameManager || this.gameManager;
    const owner = this.getOwner(gm);
    if (!owner) return false;

    // Unidades já na fila de QUALQUER construção do mesmo dono contam para o teto de população
    let queuedCount = 0;
    if (gm.buildings) {
      gm.buildings.forEach(bld => {
        if (bld.ownerId === this.ownerId && bld.queue) {
          queuedCount += bld.queue.length;
        }
      });
    }

    if (!owner.canAfford(c)) return false;
    if (owner.population + queuedCount >= owner.maxPopulation) return false;

    owner.deduct(c);
    this.queue.push({
      type: unitType,
      progress: 0,
      totalTime: c.time
    });
    return true;
  }

  cancelQueuedUnit(index, gameManager) {
    if (index < 0 || index >= this.queue.length) return false;
    const item = this.queue[index];
    const cfg = UNIT_TRAIN_CONFIG[item.type];
    const owner = this.getOwner(gameManager || this.gameManager);
    if (cfg && owner) {
      // Reembolso integral ao dono (antes só o jogador era reembolsado; a IA nunca cancela)
      owner.add(cfg.cost);
    }
    this.queue.splice(index, 1);
    return true;
  }

  startResearch(upgradeId, gameManager) {
    if (this.type !== 'forge' && this.type !== 'orc_forge') return false;
    if (!this.isConstructed || this.isDead) return false;
    if (this.currentResearch) return false;

    const cfg = UPGRADE_CONFIG[upgradeId];
    if (!cfg) return false;

    const gm = gameManager || this.gameManager;
    if (!gm) return false;

    // Check if already researched
    if (gm.isUpgradeResearched(upgradeId, this.ownerId)) return false;

    // Check if another forge is already researching this
    if (gm.isUpgradeResearching(upgradeId, this.ownerId)) return false;

    const owner = this.getOwner(gm);
    if (!owner || !owner.canAfford(cfg.cost)) return false;
    owner.deduct(cfg.cost);

    this.currentResearch = {
      id: upgradeId,
      progress: 0,
      totalTime: cfg.cost.time,
      cfg: cfg
    };
    this.researchSoundTimer = 0;
    return true;
  }

  cancelResearch(gameManager) {
    if (!this.currentResearch) return false;
    const cfg = this.currentResearch.cfg;
    const owner = this.getOwner(gameManager || this.gameManager);
    if (cfg && owner) {
      owner.add(cfg.cost);
    }
    this.currentResearch = null;
    return true;
  }

  /**
   * @param {Array} targets   não usado desde a F1-06 (alvo das torres vem de `gm.unitGrid.nearest`);
   *                          mantido por compatibilidade com o chamador (`GameManager.update`)
   * @param {Array} allUnits  todas as unidades (repassado ao dano para retaliação/ajuda)
   */
  update(delta, gameManager, soundManager, particleSystem, arrows, targets, allUnits = []) {
    if (this.isDead) return;
    if (gameManager) this.gameManager = gameManager;

    // Billboard 3D health bar to face camera and maintain world position
    if (this.hpGroup && this.scene) {
      if (this.isDead || (this.mesh && !this.mesh.visible)) {
        this.hpGroup.visible = false;
      } else {
        const isVisible = this.isSelected || this.hp < this.maxHp || (this.underAttackTimer && this.underAttackTimer > 0);
        this.hpGroup.visible = isVisible;
        if (isVisible && gameManager && gameManager.sceneManager) {
          this.hpGroup.position.set(this.mesh.position.x, this.mesh.position.y + this.getBuildingHeight() + 0.8, this.mesh.position.z);
          this.hpGroup.quaternion.copy(gameManager.sceneManager.camera.quaternion);
        }
      }
    }

    // Under attack timer
    if (this.underAttackTimer > 0) {
      this.underAttackTimer -= delta;
    }

    // Animate damage flames and smoke if active
    if (this.flamesGroup && this.flamesGroup.visible) {
      this.flameTime = (this.flameTime || 0) + delta;
      const t = this.flameTime;
      for (let i = 0; i < this.flameTongues.length; i++) {
        const tongue = this.flameTongues[i];
        const f = Math.sin(t * 14 + tongue.offset);
        const f2 = Math.cos(t * 11 + tongue.offset);
        tongue.mesh.scale.y = tongue.baseScaleY * (0.8 + 0.35 * f);
        tongue.mesh.scale.x = tongue.baseScaleX * (0.9 + 0.2 * f2);
        tongue.mesh.rotation.z = tongue.baseRotZ + f * 0.12;
      }

      if (this.flamesGroup.userData && this.flamesGroup.userData.fireLight) {
        this.flamesGroup.userData.fireLight.intensity = 1.3 + 0.5 * Math.sin(t * 18);
      }

      this.flameSmokeTimer = (this.flameSmokeTimer || 0) + delta;
      if (this.flameSmokeTimer >= 0.7) {
        this.flameSmokeTimer = 0;
        if (particleSystem && this.flameClusters.length > 0) {
          const cluster = this.flameClusters[Math.floor(Math.random() * this.flameClusters.length)];
          cluster.getWorldPosition(_flameSmokePos);
          _flameSmokePos.y += 0.5;
          particleSystem.spawnSmokePuff(_flameSmokePos);
        }
      }
    }

    // Subclass custom procedural animation and VFX update
    if (this.isConstructed) {
      this.updateCustomVFX(delta, gameManager, soundManager, particleSystem);
    }

    // Passive production (Farm / Pig Farm gives +3 food/gold) — valores em src/data/buildings.js
    const passive = getBuildingDef(this.type).passiveIncome;
    if (this.isConstructed && passive) {
      this.passiveTimer += delta;
      if (this.passiveTimer >= passive.interval) {
        this.passiveTimer = 0;
        const owner = this.getOwner(gameManager);
        if (owner) owner.add(passive.resource, passive.amount);
        if (particleSystem) {
          particleSystem.spawnFloatingText(`+${passive.amount} Gold`, this.mesh.position, '#ffd700');
        }
      }
    }

    // Cottage & Great Hall chimney smoke
    if (this.isConstructed && (this.type === 'cottage' || this.type === 'great_hall') && particleSystem) {
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.8) {
        this.smokeTimer = 0;
        const chimneyOffset = this.type === 'great_hall' ? _chimneyOffsetGreatHall : _chimneyOffsetCottage;
        _chimneyPos.copy(this.mesh.position).add(chimneyOffset);
        particleSystem.spawnSmokePuff(_chimneyPos);
      }
    }

    // Watchtower & Orc Watchtower auto-attack (F1-06: gm.unitGrid.nearest no lugar de varrer
    // `targets`; o parâmetro é mantido por compatibilidade com o chamador, mas não é mais usado)
    const towerDef = getBuildingDef(this.type).tower;
    if (this.isConstructed && towerDef && this.attackRange > 0) {
      this.attackTimer += delta;
      if (this.attackTimer >= this.attackCooldown) {
        const gm = gameManager || this.gameManager;
        const pos = this.mesh.position;
        const self = this;
        const closest = gm && gm.unitGrid
          ? gm.unitGrid.nearest(pos.x, pos.z, this.attackRange, u => !u.isDead && self.isHostileTo(u))
          : null;

        if (closest) {
          this.attackTimer = 0;
          if (soundManager) {
            if (towerDef.projectile === 'axe') soundManager.playSword();
            else soundManager.playBow();
          }
          _towerArrowStart.copy(this.mesh.position);
          _towerArrowStart.y += towerDef.projectileOriginY;
          const projType = towerDef.projectile;
          const arrow = new Arrow(this.scene, _towerArrowStart, closest, this.attackDamage, (target, dmg, hitPos) => {
            target.takeDamage(dmg, particleSystem, this, allUnits);
            if (soundManager) soundManager.playArrowHit();
          }, projType);
          arrows.push(arrow);
          if (gameManager && gameManager.registerEntity) gameManager.registerEntity(arrow, this.ownerId);
        }
      }
    }

    // Training Queue processing
    if (this.isConstructed && this.queue.length > 0) {
      const current = this.queue[0];
      current.progress += delta;
      if (current.progress >= current.totalTime) {
        // Spawn Unit outside building walls
        this.queue.shift();
        const spawnDist = this.collisionRadius + 1.2;
        const spawnX = this.mesh.position.x + (Math.random() - 0.5) * 1.5;
        const spawnZ = this.mesh.position.z + spawnDist;
        gameManager.spawnUnit(current.type, spawnX, spawnZ, this.ownerId, this.rallyPoint);
        if (soundManager) soundManager.playOrder();
      }
    }

    // Forge Research processing
    if (this.isConstructed && this.currentResearch) {
      const r = this.currentResearch;
      r.progress += delta;

      // Periodic anvil strikes and hammer clangs while researching
      this.researchSoundTimer = (this.researchSoundTimer || 0) + delta;
      if (this.researchSoundTimer >= 2.2) {
        this.researchSoundTimer = 0;
        if (this.strikeAnvil) this.strikeAnvil(particleSystem);
        if (soundManager) soundManager.playHammer();
      }

      if (r.progress >= r.totalTime) {
        const completedId = r.id;
        this.currentResearch = null;
        const gm = gameManager || this.gameManager;
        if (gm) {
          gm.completeUpgrade(completedId, this.ownerId);
        }
        if (this.strikeAnvil) this.strikeAnvil(particleSystem);
        if (soundManager) soundManager.playBuildComplete();
        if (particleSystem) {
          particleSystem.spawnFloatingText('Melhoria Forjada!', this.mesh.position, '#ffd700');
        }
      }
    }
  }
}
