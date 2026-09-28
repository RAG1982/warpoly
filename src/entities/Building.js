import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { Arrow } from './Arrow.js';
import { UPGRADE_CONFIG, FORGE_UPGRADES } from '../core/UpgradeConfig.js';

export const UNIT_TRAIN_CONFIG = {
  archer: {
    type: 'archer',
    name: 'Arqueiro',
    icon: '/icoArco.png',
    cost: { gold: 40, wood: 20, time: 9 },
    description: 'Atirador de flechas à distância'
  },
  knight: {
    type: 'knight',
    name: 'Cavaleiro',
    icon: '/icoEspada.png',
    cost: { gold: 70, wood: 50, stone: 5, time: 11 },
    description: 'Infantaria pesada com espada e armadura'
  },
  villager: {
    type: 'villager',
    name: 'Aldeão',
    icon: '/icopopulacao.png',
    cost: { gold: 50, time: 7 },
    description: 'Trabalhador, coletor e construtor'
  },
  peon: {
    type: 'peon',
    name: 'Peão',
    icon: '/icopopulacao.png',
    cost: { gold: 50, time: 7 },
    description: 'Trabalhador e construtor orc'
  },
  grunt: {
    type: 'grunt',
    name: 'Guerreiro Grunt',
    icon: '/icoEspada.png',
    cost: { gold: 70, wood: 50, stone: 5, time: 11 },
    description: 'Guerreiro orc com espada'
  },
  axethrower: {
    type: 'axethrower',
    name: 'Lançador de Machado',
    icon: '/icoArco.png',
    cost: { gold: 40, wood: 20, time: 9 },
    description: 'Atirador de machados à distância'
  },
  ogre: {
    type: 'ogre',
    name: 'Ogro',
    icon: '/icoEspada.png',
    cost: { gold: 75, wood: 100, stone: 35, time: 14 },
    description: 'Bruto colossal com clava'
  }
};

export const BUILDING_BUILD_CONFIG = {
  // --- Human Buildings ---
  cottage: {
    type: 'cottage',
    name: 'Casa Residencial',
    icon: '/icoCasa.svg',
    cost: { wood: 50 },
    description: 'Fornece +5 de capacidade populacional'
  },
  lumber_camp: {
    type: 'lumber_camp',
    name: 'Serraria Florestal',
    icon: '/icoSerraria.svg',
    cost: { wood: 80 },
    description: 'Ponto de entrega de madeira'
  },
  farm: {
    type: 'farm',
    name: 'Fazenda de Trigo',
    icon: '/icoFazenda.svg',
    cost: { wood: 60 },
    description: 'Produz colheita e sustento para o reino'
  },
  barracks: {
    type: 'barracks',
    name: 'Quartel de Infantaria',
    icon: '/icoQuartel.svg',
    cost: { wood: 120, stone: 60 },
    description: 'Treina soldados, arqueiros e cavaleiros'
  },
  forge: {
    type: 'forge',
    name: 'Forja Real',
    icon: '/icoForja.svg',
    cost: { wood: 100, stone: 70, gold: 50 },
    description: 'Pesquisa melhorias de armas e armaduras'
  },
  watchtower: {
    type: 'watchtower',
    name: 'Torre de Vigia',
    icon: '/icoTorre.svg',
    cost: { wood: 80, stone: 40 },
    description: 'Torre defensiva com arqueiros'
  },

  // --- Orc Buildings ---
  orc_house: {
    type: 'orc_house',
    name: 'Toca Orc',
    icon: '/icoToca.svg',
    cost: { wood: 50 },
    description: 'Fornece +5 de capacidade populacional'
  },
  pig_farm: {
    type: 'pig_farm',
    name: 'Chiqueiro de Porcos',
    icon: '/icoPorco.svg',
    cost: { wood: 55 },
    description: 'Alimento e +5 de capacidade populacional'
  },
  orc_lumber_mill: {
    type: 'orc_lumber_mill',
    name: 'Serraria Mecânica',
    icon: '/icoSerrariaOrc.svg',
    cost: { wood: 85 },
    description: 'Ponto de entrega de madeira da Horda'
  },
  orc_barracks: {
    type: 'orc_barracks',
    name: 'Quartel da Horda',
    icon: '/icoQuartelOrc.svg',
    cost: { wood: 130, stone: 50 },
    description: 'Treina grunts, lanceiros e guerreiros orcs'
  },
  orc_forge: {
    type: 'orc_forge',
    name: 'Forja de Guerra Orc',
    icon: '/icoForjaOrc.svg',
    cost: { wood: 100, stone: 70, gold: 50 },
    description: 'Forja melhorias de combate para a Horda'
  },
  orc_watchtower: {
    type: 'orc_watchtower',
    name: 'Torre de Vigia Orc',
    icon: '/icoTorreOrc.svg',
    cost: { wood: 85, stone: 40 },
    description: 'Torre defensiva com arremesso de machados'
  }
};

export const WORKER_BUILD_LIST = {
  villager: ['cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'watchtower'],
  peon: ['orc_house', 'pig_farm', 'orc_lumber_mill', 'orc_barracks', 'orc_forge', 'orc_watchtower']
};

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

export class Building {
  constructor(scene, terrain, type, x, z, isConstructed = true, faction = 'player') {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'castle', 'lumber_camp', 'cottage', 'barracks', 'watchtower', 'farm', 'bandit_camp'
    this.faction = faction;
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
    this.attackCooldown = 1.4;
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

  static getBuildingStats(type) {
    switch (type) {
      case 'castle':
        return { name: 'Castelo Real', hp: 1600, cost: { wood: 200, stone: 150 }, popGranted: 5, collisionRadius: 5.5 };
      case 'great_hall':
        return { name: 'Grande Salão Orc', hp: 1750, cost: { wood: 220, stone: 140 }, popGranted: 5, collisionRadius: 5.5 };
      case 'lumber_camp':
        return { name: 'Campo de Madeira', hp: 550, cost: { wood: 80, gold: 0, stone: 0 }, collisionRadius: 3.2 };
      case 'orc_lumber_mill':
        return { name: 'Serraria Orc', hp: 580, cost: { wood: 85, gold: 0, stone: 0 }, collisionRadius: 3.2 };
      case 'cottage':
        return { name: 'Chalé / Casa', hp: 400, cost: { wood: 50, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
      case 'pig_farm':
        return { name: 'Fazenda de Porcos', hp: 420, cost: { wood: 55, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
      case 'orc_house':
        return { name: 'Toca Orc', hp: 450, cost: { wood: 50, gold: 0, stone: 0 }, popGranted: 5, collisionRadius: 2.8 };
      case 'orc_forge':
        return { name: 'Forja Orc', hp: 850, cost: { wood: 100, stone: 70, gold: 50 }, collisionRadius: 3.4 };
      case 'forge':
        return { name: 'Forja Real', hp: 850, cost: { wood: 100, stone: 70, gold: 50 }, collisionRadius: 3.4 };
      case 'barracks':
        return { name: 'Quartel de Infantaria', hp: 850, cost: { wood: 120, stone: 60 }, collisionRadius: 3.5 };
      case 'orc_barracks':
        return { name: 'Quartel Orc', hp: 900, cost: { wood: 130, stone: 50 }, collisionRadius: 3.6 };
      case 'watchtower':
        return { name: 'Torre de Vigia', hp: 650, cost: { wood: 80, stone: 40 }, attackRange: 18, attackDamage: 18, collisionRadius: 2.0 };
      case 'orc_watchtower':
        return { name: 'Torre de Vigia Orc', hp: 700, cost: { wood: 85, stone: 40 }, attackRange: 18, attackDamage: 19, collisionRadius: 2.0 };
      case 'farm':
        return { name: 'Fazenda de Trigo', hp: 350, cost: { wood: 60, gold: 0, stone: 0 }, collisionRadius: 2.8 };
      case 'bandit_camp':
        return { name: 'Acampamento de Bandidos', hp: 1400, cost: {}, collisionRadius: 4.2 };
      default:
        return { name: 'Construção', hp: 500, cost: { wood: 50 }, collisionRadius: 3.0 };
    }
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
    switch (this.type) {
      case 'great_hall': return 10.5;
      case 'castle': return 9.5;
      case 'watchtower': return 9.5;
      case 'orc_watchtower': return 10.0;
      case 'barracks': return 7.0;
      case 'orc_barracks': return 7.5;
      case 'orc_forge': return 6.5;
      case 'forge': return 6.8;
      case 'cottage': return 5.4;
      case 'orc_house': return 5.2;
      case 'pig_farm': return 4.8;
      case 'farm': return 4.5;
      case 'lumber_camp': return 5.2;
      case 'orc_lumber_mill': return 5.4;
      case 'bandit_camp': return 7.0;
      default: return 6.0;
    }
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
      if (gm) {
        if (this.faction === 'player') {
          gm.recalculatePopCap();
        } else if (gm.aiDirector) {
          gm.aiDirector.recalculatePop();
        } else if (gm.enemyAI) {
          gm.enemyAI.recalculatePop();
        }
      }
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
    if ((this.type === 'castle' || this.type === 'great_hall') && unitType !== 'villager' && unitType !== 'peon') {
      return false;
    }
    // Only military units can be trained at Barracks
    if ((this.type === 'barracks' || this.type === 'orc_barracks') && (unitType === 'villager' || unitType === 'peon')) {
      return false;
    }

    const cfg = UNIT_TRAIN_CONFIG[unitType];
    if (!cfg) return false;
    const c = cfg.cost;

    let queuedCount = 0;
    if (gameManager && gameManager.buildings) {
      gameManager.buildings.forEach(bld => {
        if (bld.faction === this.faction && bld.queue) {
          queuedCount += bld.queue.length;
        }
      });
    }

    if (this.faction === 'enemy') {
      const ai = gameManager.aiDirector || gameManager.enemyAI;
      if (!ai) return false;
      if (!ai.canAfford(c)) return false;
      if (ai.population + queuedCount >= ai.maxPopulation) return false;
      ai.deduct(c);
      this.queue.push({
        type: unitType,
        progress: 0,
        totalTime: c.time
      });
      return true;
    }

    if (!gameManager.canAfford(c)) return false;
    if (gameManager.population + queuedCount >= gameManager.maxPopulation) return false;

    gameManager.deductResources(c);
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
    if (cfg && this.faction === 'player' && gameManager) {
      if (cfg.cost.gold) gameManager.addResource('gold', cfg.cost.gold);
      if (cfg.cost.wood) gameManager.addResource('wood', cfg.cost.wood);
      if (cfg.cost.stone) gameManager.addResource('stone', cfg.cost.stone);
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
    if (gm.isUpgradeResearched(upgradeId, this.faction)) return false;

    // Check if another forge is already researching this
    if (gm.isUpgradeResearching(upgradeId, this.faction)) return false;

    if (this.faction === 'enemy') {
      const ai = gm.aiDirector || gm.enemyAI;
      if (!ai || !ai.canAfford(cfg.cost)) return false;
      ai.deduct(cfg.cost);
    } else {
      if (!gm.canAfford(cfg.cost)) return false;
      gm.deductResources(cfg.cost);
    }

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
    const gm = gameManager || this.gameManager;
    if (cfg && this.faction === 'player' && gm) {
      if (cfg.cost.gold) gm.addResource('gold', cfg.cost.gold);
      if (cfg.cost.wood) gm.addResource('wood', cfg.cost.wood);
      if (cfg.cost.stone) gm.addResource('stone', cfg.cost.stone);
    }
    this.currentResearch = null;
    return true;
  }

  update(delta, gameManager, soundManager, particleSystem, arrows, enemies, allUnits = []) {
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
          const worldPos = new THREE.Vector3();
          cluster.getWorldPosition(worldPos);
          worldPos.y += 0.5;
          particleSystem.spawnSmokePuff(worldPos);
        }
      }
    }

    // Subclass custom procedural animation and VFX update
    if (this.isConstructed) {
      this.updateCustomVFX(delta, gameManager, soundManager, particleSystem);
    }

    // Passive production (Farm / Pig Farm gives +3 food/gold)
    if (this.isConstructed && (this.type === 'farm' || this.type === 'pig_farm')) {
      this.passiveTimer += delta;
      if (this.passiveTimer >= 6.0) {
        this.passiveTimer = 0;
        if (this.faction === 'enemy') {
          const ai = gameManager.aiDirector || gameManager.enemyAI;
          if (ai) ai.addResource('gold', 3);
        } else {
          gameManager.addResource('gold', 3);
        }
        if (particleSystem) {
          particleSystem.spawnFloatingText('+3 Gold', this.mesh.position, '#ffd700');
        }
      }
    }

    // Cottage & Great Hall chimney smoke
    if (this.isConstructed && (this.type === 'cottage' || this.type === 'great_hall') && particleSystem) {
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.8) {
        this.smokeTimer = 0;
        const chimneyOffset = this.type === 'great_hall' ? new THREE.Vector3(-2.2, 9.8, -1.8) : new THREE.Vector3(-2.1, 4.4, -0.6);
        const chimneyPos = this.mesh.position.clone().add(chimneyOffset);
        particleSystem.spawnSmokePuff(chimneyPos);
      }
    }

    // Watchtower & Orc Watchtower auto-attack
    if (this.isConstructed && (this.type === 'watchtower' || this.type === 'orc_watchtower') && this.attackRange > 0 && enemies) {
      this.attackTimer += delta;
      if (this.attackTimer >= this.attackCooldown) {
        // Find closest enemy within range
        let closest = null;
        let minDist = this.attackRange;
        enemies.forEach(e => {
          if (!e.isDead) {
            const d = this.mesh.position.distanceTo(e.mesh.position);
            if (d < minDist) {
              minDist = d;
              closest = e;
            }
          }
        });

        if (closest) {
          this.attackTimer = 0;
          if (soundManager) {
            if (this.type === 'orc_watchtower') soundManager.playSword();
            else soundManager.playBow();
          }
          const arrowStart = this.mesh.position.clone().add(new THREE.Vector3(0, this.type === 'orc_watchtower' ? 8.2 : 6.8, 0));
          const projType = this.type === 'orc_watchtower' ? 'axe' : 'arrow';
          arrows.push(new Arrow(this.scene, arrowStart, closest, this.attackDamage, (target, dmg, hitPos) => {
            target.takeDamage(dmg, particleSystem, this, allUnits);
            if (soundManager) soundManager.playArrowHit();
          }, projType));
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
        gameManager.spawnUnit(current.type, spawnX, spawnZ, this.faction, this.rallyPoint);
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
          gm.completeUpgrade(completedId, this.faction);
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
