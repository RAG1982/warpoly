import * as THREE from 'three';
import { Unit } from '../entities/Unit.js';
import { Building } from '../entities/Building.js';
import {
  GreatHall,
  OrcBarracks,
  PigFarm,
  OrcHouse,
  OrcWatchtower,
  OrcLumberMill,
  OrcForge
} from '../entities/buildings/orc/index.js';
import { Tree } from '../entities/Tree.js';
import { ResourceDeposit } from '../entities/ResourceDeposit.js';
import { FogOfWar } from './FogOfWar.js';
import { EnemyAI } from './EnemyAI.js';
import { AIDirector } from '../ai/AIDirector.js';
import { TreeManager } from '../world/TreeManager.js';
import { Pathfinder } from './Pathfinder.js';
import { HumanForge } from '../entities/buildings/HumanForge.js';
import { UPGRADE_CONFIG } from './UpgradeConfig.js';
import { STARTING_RESOURCES, isDropoffFor } from '../data/index.js';

export class GameManager {
  constructor(scene, terrain, soundManager, particleSystem) {
    this.scene = scene;
    this.terrain = terrain;
    this.soundManager = soundManager;
    this.particleSystem = particleSystem;

    // Instanced Trees System (6 Draw Calls for all 180 Trees)
    this.treeManager = new TreeManager(this.scene);

    // Economy & Pop
    this.resources = { ...STARTING_RESOURCES };
    this.population = 0;
    this.maxPopulation = 15;

    // Entity collections
    this.units = [];
    this.enemies = [];
    this.buildings = [];
    this.trees = [];
    this.resourceDeposits = [];
    this.arrows = [];

    // Selected entities
    this.selectedUnits = [];
    this.selectedBuilding = null;
    this.selectedResource = null;

    // Game state
    this.isGameOver = false;
    this.gameWon = false;
    this.gameSpeed = 1.0;
    this.isPaused = false;
    this.gameTime = 0;

    // Faction: 'human' or 'orc'
    this.playerFaction = 'human';

    // Researched Upgrades per faction (Forge Upgrades)
    this.researchedUpgrades = { player: new Set(), enemy: new Set() };

    // Fog of War (covers 160x160 continent)
    this.fogOfWar = new FogOfWar(this.scene, 160, 160);

    // Autonomous Computer Opponent AI (Utility AI Director)
    this.aiDirector = null;
    this.enemyAI = null;

    // Terrain Navigation & Water Obstacle Pathfinder
    this.pathfinder = new Pathfinder(this.terrain);
    this.terrain.pathfinder = this.pathfinder;

    this.initMapEntities();
  }

  setPlayerFaction(faction) {
    if (this.playerFaction === faction) return;
    this.playerFaction = faction;
    this.resetMap();
    if (this.sceneManager) {
      if (faction === 'orc') {
        this.sceneManager.cameraTarget.set(-32, 2.5, 30);
      } else {
        this.sceneManager.cameraTarget.set(32, 2.5, -30);
      }
    }
  }

  resetMap() {
    this.units.forEach(u => this.scene.remove(u.mesh));
    this.enemies.forEach(e => this.scene.remove(e.mesh));
    this.buildings.forEach(b => {
      this.scene.remove(b.mesh);
      if (b.rallyGroup) this.scene.remove(b.rallyGroup);
    });
    this.trees.forEach(t => (t.dispose ? t.dispose() : this.scene.remove(t.mesh)));
    this.resourceDeposits.forEach(r => this.scene.remove(r.mesh));

    if (this.treeManager) {
      this.treeManager.dispose();
      this.treeManager = new TreeManager(this.scene);
    }

    this.units = [];
    this.enemies = [];
    this.buildings = [];
    this.trees = [];
    this.resourceDeposits = [];
    this.selectedUnits = [];
    this.selectedBuilding = null;
    this.selectedResource = null;
    this.resources = { ...STARTING_RESOURCES };
    this.population = 0;
    this.isGameOver = false;
    this.gameWon = false;
    this.aiDirector = null;
    this.enemyAI = null;

    // Reset Fog of War shroud
    if (this.fogOfWar) {
      this.fogOfWar.explored.fill(0);
      this.fogOfWar.activeVision.fill(0);
      this.fogOfWar.needsUpdate = true;
    }

    this.initMapEntities();
  }

  initMapEntities() {
    const isOrc = this.playerFaction === 'orc';

    // 1. Initial Player Base & Enemy AI Base (140x140 Continental Map)
    // Enforces generous spacing between all buildings (at least 11-14 units apart)
    if (!isOrc) {
      // --- PLAYER: Human Alliance Kingdom (Northeast around 32, -30) ---
      // 1 Town Center, 1 Lumber Mill, 1 House
      const castle = this.createBuilding('castle', 32, -30, true, 'player');
      this.buildings.push(castle);

      const lumberCamp = this.createBuilding('lumber_camp', 20, -34, true, 'player');
      lumberCamp.mesh.rotation.y = Math.PI / 4;
      this.buildings.push(lumberCamp);

      const cottage = this.createBuilding('cottage', 44, -30, true, 'player');
      cottage.mesh.rotation.y = -Math.PI / 4;
      this.buildings.push(cottage);

      // Player Initial Units: 2 Workers (Villagers), 3 Military Units (2 Knights, 1 Archer)
      this.spawnUnit('villager', 28, -28, 'player');
      this.spawnUnit('villager', 36, -32, 'player');
      this.spawnUnit('knight', 30, -22, 'player');
      this.spawnUnit('knight', 34, -22, 'player');
      this.spawnUnit('archer', 24, -20, 'player');

      // --- ENEMY AI: Orc Horde Stronghold (Southwest around -32, 30) ---
      // 1 Town Center, 1 Lumber Mill, 1 House
      const greatHall = this.createBuilding('great_hall', -32, 30, true, 'enemy');
      this.buildings.push(greatHall);

      const orcLumber = this.createBuilding('orc_lumber_mill', -20, 34, true, 'enemy');
      orcLumber.mesh.rotation.y = Math.PI / 4;
      this.buildings.push(orcLumber);

      const pigFarm = this.createBuilding('pig_farm', -44, 30, true, 'enemy');
      pigFarm.mesh.rotation.y = -Math.PI / 4;
      this.buildings.push(pigFarm);

      // Enemy AI Initial Units: 2 Workers (Peons), 3 Military Units (2 Grunts, 1 Axethrower)
      this.spawnUnit('peon', -28, 28, 'enemy');
      this.spawnUnit('peon', -36, 32, 'enemy');
      this.spawnUnit('grunt', -30, 22, 'enemy');
      this.spawnUnit('grunt', -34, 22, 'enemy');
      this.spawnUnit('axethrower', -24, 20, 'enemy');

      // Initialize AI Opponent Director as Orcs
      this.aiDirector = new AIDirector(this, 'orc', new THREE.Vector2(-32, 30));
      this.enemyAI = this.aiDirector;

      // Reveal Player's Kingdom in Fog of War
      this.fogOfWar.revealArea(32, -30, 28);
    } else {
      // --- PLAYER: Orc Horde Stronghold (Southwest around -32, 30) ---
      // 1 Town Center, 1 Lumber Mill, 1 House
      const greatHall = this.createBuilding('great_hall', -32, 30, true, 'player');
      this.buildings.push(greatHall);

      const orcLumber = this.createBuilding('orc_lumber_mill', -20, 34, true, 'player');
      orcLumber.mesh.rotation.y = Math.PI / 4;
      this.buildings.push(orcLumber);

      const pigFarm = this.createBuilding('pig_farm', -44, 30, true, 'player');
      pigFarm.mesh.rotation.y = -Math.PI / 4;
      this.buildings.push(pigFarm);

      // Player Initial Units: 2 Workers (Peons), 3 Military Units (2 Grunts, 1 Axethrower)
      this.spawnUnit('peon', -28, 28, 'player');
      this.spawnUnit('peon', -36, 32, 'player');
      this.spawnUnit('grunt', -30, 22, 'player');
      this.spawnUnit('grunt', -34, 22, 'player');
      this.spawnUnit('axethrower', -24, 20, 'player');

      // --- ENEMY AI: Human Alliance Kingdom (Northeast around 32, -30) ---
      // 1 Town Center, 1 Lumber Mill, 1 House
      const castle = this.createBuilding('castle', 32, -30, true, 'enemy');
      this.buildings.push(castle);

      const lumberCamp = this.createBuilding('lumber_camp', 20, -34, true, 'enemy');
      lumberCamp.mesh.rotation.y = Math.PI / 4;
      this.buildings.push(lumberCamp);

      const cottage = this.createBuilding('cottage', 44, -30, true, 'enemy');
      cottage.mesh.rotation.y = -Math.PI / 4;
      this.buildings.push(cottage);

      // Enemy AI Initial Units: 2 Workers (Villagers), 3 Military Units (2 Knights, 1 Archer)
      this.spawnUnit('villager', 28, -28, 'enemy');
      this.spawnUnit('villager', 36, -32, 'enemy');
      this.spawnUnit('knight', 30, -22, 'enemy');
      this.spawnUnit('knight', 34, -22, 'enemy');
      this.spawnUnit('archer', 24, -20, 'enemy');

      // Initialize AI Opponent Director as Humans
      this.aiDirector = new AIDirector(this, 'human', new THREE.Vector2(32, -30));
      this.enemyAI = this.aiDirector;

      // Reveal Player's Stronghold in Fog of War
      this.fogOfWar.revealArea(-32, 30, 28);
    }

    // 2. Resource Deposits (Gold Mines & Stone Quarries)
    this.spawnResourceDeposits();

    // 3. Harvestable Woodlands & Trees (Spacious wilderness forests, completely outside bases)
    this.spawnWoodlands();

    this.recalculatePopCap();
  }

  /**
   * Spawns strategic resource deposits across both kingdoms and the central plains
   */
  spawnResourceDeposits() {
    // Human Realm Deposits
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'gold', 30, -46));
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'stone', 46, -46));
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'gold', 16, -26));

    // Orc Realm Deposits
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'gold', -30, 46));
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'stone', -46, 46));
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'gold', -16, 26));

    // Contested Central Plains Deposits
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'gold', 8, -6));
    this.resourceDeposits.push(new ResourceDeposit(this.scene, this.terrain, 'stone', -8, 6));
  }

  /**
   * Spawns spaced-out clusters of harvestable trees with strict clearance from all buildings,
   * base courtyards, resource deposits, and river crossings.
   */
  spawnWoodlands() {
    const treeTypes = ['oak', 'pine', 'autumn'];
    const minTreeSpacing = 4.4; // Generous distance between trees for open meadows

    const spawnCluster = (centerX, centerZ, targetCount, radius, preferredType = 'oak') => {
      let placed = 0;
      let attempts = 0;
      const maxAttempts = targetCount * 24;

      while (placed < targetCount && attempts < maxAttempts) {
        attempts++;
        const ang = Math.random() * Math.PI * 2;
        const dist = 2.0 + Math.random() * radius;
        const x = centerX + Math.cos(ang) * dist;
        const z = centerZ + Math.sin(ang) * dist;
        const h = this.terrain.getHeight(x, z);

        // 1. Only plant trees on solid elevated grass plateaus
        if (h < 1.9) continue;

        // 2. CRITICAL: Never spawn trees inside or near any building footprint (bRad + 7.5 units)
        const nearBuilding = this.buildings.some(b => {
          const bRad = b.collisionRadius || 3.0;
          return Math.hypot(x - b.mesh.position.x, z - b.mesh.position.z) < (bRad + 7.5);
        });
        if (nearBuilding) continue;

        // 3. Keep base courtyards and expansion zones completely clear of wild trees (26 unit radius)
        const distHumanBase = Math.hypot(x - 32, z - (-30));
        const distOrcBase = Math.hypot(x - (-32), z - 30);
        if (distHumanBase < 26.0 || distOrcBase < 26.0) continue;

        // 4. Never spawn on top of or hugging resource deposits (8.5 unit clearance)
        const nearDeposit = this.resourceDeposits.some(r => {
          return Math.hypot(x - r.mesh.position.x, z - r.mesh.position.z) < 8.5;
        });
        if (nearDeposit) continue;

        // 5. Keep river crossings / fords completely clear
        const fords = [{ x: -16, z: -16 }, { x: 0, z: 0 }, { x: 16, z: 16 }];
        if (fords.some(f => Math.hypot(x - f.x, z - f.z) < 9.0)) continue;

        // 6. Check minimum distance to all already placed trees
        const tooCloseToTree = this.trees.some(t => {
          const dx = t.mesh.position.x - x;
          const dz = t.mesh.position.z - z;
          return (dx * dx + dz * dz) < (minTreeSpacing * minTreeSpacing);
        });
        if (tooCloseToTree) continue;

        const type = Math.random() < 0.65 ? preferredType : treeTypes[Math.floor(Math.random() * treeTypes.length)];
        this.trees.push(new Tree(this.scene, this.terrain, x, z, type, this.treeManager));
        placed++;
      }
    };

    // Far Northern Wilderness (Far outside Human Kingdom)
    spawnCluster(12, -54, 6, 6.0, 'pine');
    spawnCluster(-12, -54, 6, 6.0, 'pine');

    // Far Eastern Wilderness (East Coastline)
    spawnCluster(54, 12, 6, 6.0, 'autumn');
    spawnCluster(54, -2, 6, 6.0, 'autumn');

    // Far Southern Wilderness (Far outside Orc Stronghold)
    spawnCluster(-12, 54, 6, 6.0, 'pine');
    spawnCluster(12, 54, 6, 6.0, 'pine');

    // Far Western Wilderness (West Coastline)
    spawnCluster(-54, -12, 6, 6.0, 'autumn');
    spawnCluster(-54, 2, 6, 6.0, 'autumn');

    // Central Wilderness & Riverbanks (well clear of the 3 fords)
    spawnCluster(-28, -26, 6, 6.0, 'oak');
    spawnCluster(28, 26, 6, 6.0, 'oak');
    spawnCluster(26, 2, 5, 5.5, 'pine');
    spawnCluster(-26, -2, 5, 5.5, 'pine');
    spawnCluster(2, -26, 5, 5.5, 'oak');
    spawnCluster(-2, 26, 5, 5.5, 'autumn');
  }

  /**
   * Validates whether a building of given type can be placed at (x, z).
   * Enforces:
   * - Dry elevated terrain (not in water or river channel).
   * - Minimum clearance from ALL other buildings (collisionRadius + bRad + 3.2).
   * - Minimum clearance from ALL living trees (collisionRadius + 3.5).
   * - Minimum clearance from resource deposits (gold mines & stone quarries).
   * - Not blocking the 3 strategic river crossings.
   */
  canPlaceBuilding(type, x, z, ignoreBuilding = null) {
    const stats = Building.getBuildingStats(type);
    const radius = stats.collisionRadius || 3.0;

    // 1. Terrain Height check at center and 4 footprint perimeter samples
    const h = this.terrain.getHeight(x, z);
    if (h < 1.8) return false;

    const sampleOffset = radius * 0.75;
    if (this.terrain.getHeight(x + sampleOffset, z + sampleOffset) < 1.8) return false;
    if (this.terrain.getHeight(x - sampleOffset, z + sampleOffset) < 1.8) return false;
    if (this.terrain.getHeight(x + sampleOffset, z - sampleOffset) < 1.8) return false;
    if (this.terrain.getHeight(x - sampleOffset, z - sampleOffset) < 1.8) return false;

    // 2. Minimum distance to other buildings (fast AABB reject)
    const minBuildingGap = 3.2;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b === ignoreBuilding || b.isDead) continue;
      const bRad = b.collisionRadius || 3.0;
      const maxDist = radius + bRad + minBuildingGap;
      const dx = x - b.mesh.position.x;
      if (dx > maxDist || dx < -maxDist) continue;
      const dz = z - b.mesh.position.z;
      if (dz > maxDist || dz < -maxDist) continue;
      if (dx * dx + dz * dz < maxDist * maxDist) {
        return false;
      }
    }

    // 3. Minimum distance to trees (fast AABB reject skips 98% of trees)
    const minTreeGap = 3.5;
    const maxTreeDist = radius + minTreeGap;
    const maxTreeDistSq = maxTreeDist * maxTreeDist;
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.isDead || t.woodRemaining <= 0) continue;
      const dx = x - t.mesh.position.x;
      if (dx > maxTreeDist || dx < -maxTreeDist) continue;
      const dz = z - t.mesh.position.z;
      if (dz > maxTreeDist || dz < -maxTreeDist) continue;
      if (dx * dx + dz * dz < maxTreeDistSq) {
        return false;
      }
    }

    // 4. Minimum distance to resource deposits (fast AABB reject)
    const minDepositGap = 3.0;
    const maxDepDist = radius + 3.0 + minDepositGap;
    const maxDepDistSq = maxDepDist * maxDepDist;
    for (let i = 0; i < this.resourceDeposits.length; i++) {
      const r = this.resourceDeposits[i];
      if (r.resourcesRemaining <= 0) continue;
      const dx = x - r.mesh.position.x;
      if (dx > maxDepDist || dx < -maxDepDist) continue;
      const dz = z - r.mesh.position.z;
      if (dz > maxDepDist || dz < -maxDepDist) continue;
      if (dx * dx + dz * dz < maxDepDistSq) {
        return false;
      }
    }

    // 5. Must not block the 3 strategic river crossings / fords
    const fords = [
      { x: -16, z: -16 },
      { x: 0, z: 0 },
      { x: 16, z: 16 }
    ];
    for (let i = 0; i < 3; i++) {
      const f = fords[i];
      const dx = x - f.x;
      if (dx > 10.0 || dx < -10.0) continue;
      const dz = z - f.z;
      if (dz > 10.0 || dz < -10.0) continue;
      if (dx * dx + dz * dz < 100.0) {
        return false;
      }
    }

    return true;
  }

  recalculatePopCap() {
    let cap = 0;
    this.buildings.forEach(b => {
      if (b.isConstructed && !b.isDead && b.faction === 'player') {
        cap += (b.popGranted || 0);
      }
    });
    this.maxPopulation = cap;
    this.population = this.units.filter(u => !u.isDead).length;
  }

  canAfford(cost) {
    if (cost.wood && this.resources.wood < cost.wood) return false;
    if (cost.gold && this.resources.gold < cost.gold) return false;
    if (cost.stone && this.resources.stone < cost.stone) return false;
    return true;
  }

  deductResources(cost) {
    if (cost.wood) this.resources.wood -= cost.wood;
    if (cost.gold) this.resources.gold -= cost.gold;
    if (cost.stone) this.resources.stone -= cost.stone;
  }

  addResource(type, amount) {
    if (this.resources[type] !== undefined) {
      this.resources[type] += amount;
    }
  }

  spawnUnit(type, x, z, faction = 'player', rallyPoint = null) {
    if (this.pathfinder && this.pathfinder.isWater(x, z)) {
      const snapped = this.pathfinder.findNearestWalkable(x, z);
      x = snapped.x;
      z = snapped.z;
    }
    const unit = new Unit(this.scene, this.terrain, type, x, z, faction);
    unit.gameManager = this;

    // Apply active forge upgrades for this faction to new units
    if (this.researchedUpgrades[faction]) {
      this.researchedUpgrades[faction].forEach(upgId => {
        this.applyUpgradeToUnit(unit, upgId);
      });
    }

    if (faction === 'player') {
      this.units.push(unit);
      this.population++;
      if (rallyPoint) {
        unit.moveTo(rallyPoint.x, rallyPoint.z, this);
      }
    } else {
      this.enemies.push(unit);
      if (this.enemyAI) this.enemyAI.recalculatePop();
    }
    return unit;
  }

  isUpgradeResearched(upgradeId, faction = 'player') {
    return this.researchedUpgrades[faction]?.has(upgradeId) || false;
  }

  isUpgradeResearching(upgradeId, faction = 'player') {
    return this.buildings.some(b => b.faction === faction && b.currentResearch && b.currentResearch.id === upgradeId);
  }

  completeUpgrade(upgradeId, faction = 'player') {
    if (!this.researchedUpgrades[faction]) {
      this.researchedUpgrades[faction] = new Set();
    }
    this.researchedUpgrades[faction].add(upgradeId);

    // Apply to all currently alive units of this faction
    const list = faction === 'player' ? this.units : this.enemies;
    list.forEach(u => {
      if (!u.isDead) {
        this.applyUpgradeToUnit(u, upgradeId);
      }
    });

    if (faction === 'player') {
      const cfg = UPGRADE_CONFIG[upgradeId];
      const factionType = this.playerFaction === 'orc' ? 'orc' : 'human';
      const upgName = cfg?.name[factionType] || upgradeId;
      this.uiManager?.showNotification(`🔥 Melhoria forjada: ${upgName}!`);
    }
  }

  applyUpgradeToUnit(unit, upgradeId = null) {
    if (!upgradeId) {
      const faction = unit.faction || 'player';
      if (this.researchedUpgrades && this.researchedUpgrades[faction]) {
        this.researchedUpgrades[faction].forEach(id => {
          this.applyUpgradeToUnit(unit, id);
        });
      }
      return;
    }

    const cfg = UPGRADE_CONFIG[upgradeId];
    if (!cfg) return;
    if (!cfg.appliesTo(unit.type)) return;

    if (cfg.statType === 'attack') {
      unit.attack += cfg.bonus;
    } else if (cfg.statType === 'defense') {
      unit.armor = (unit.armor || 0) + cfg.bonus;
    }
  }

  createBuilding(type, x, z, isConstructed = true, faction = 'player') {
    let b;
    switch (type) {
      case 'great_hall':
        b = new GreatHall(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'orc_barracks':
        b = new OrcBarracks(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'pig_farm':
        b = new PigFarm(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'orc_house':
        b = new OrcHouse(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'orc_watchtower':
        b = new OrcWatchtower(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'orc_lumber_mill':
        b = new OrcLumberMill(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'orc_forge':
        b = new OrcForge(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      case 'forge':
        b = new HumanForge(this.scene, this.terrain, x, z, isConstructed, faction);
        break;
      default:
        b = new Building(this.scene, this.terrain, type, x, z, isConstructed, faction);
        break;
    }
    b.gameManager = this;
    return b;
  }

  buildNewBuilding(type, x, z) {
    const b = this.createBuilding(type, x, z, false, 'player');
    this.buildings.push(b);
    this.soundManager.playBuildPlace();
    this.recalculatePopCap();

    // Clean up any depleted tree stumps inside the building footprint so they do not poke through floors
    const bRadius = b.collisionRadius || 3.0;
    this.trees.forEach(t => {
      if (t.isDead && t.stumpMesh) {
        const d = Math.hypot(x - t.mesh.position.x, z - t.mesh.position.z);
        if (d < bRadius + 0.5) {
          t.dispose();
        }
      }
    });

    // Task workers (villagers or peons) to construct it
    const selectedBuilders = this.selectedUnits.filter(u => u.type === 'villager' || u.type === 'peon');
    if (selectedBuilders.length > 0) {
      selectedBuilders.forEach(v => v.orderBuild(b));
    } else {
      let nearestV = null;
      let minDist = Infinity;
      this.units.forEach(u => {
        if (!u.isDead && (u.type === 'villager' || u.type === 'peon')) {
          const d = u.mesh.position.distanceTo(b.mesh.position);
          if (d < minDist) {
            minDist = d;
            nearestV = u;
          }
        }
      });
      if (nearestV) {
        nearestV.orderBuild(b);
      }
    }
    return b;
  }

  findNearestResource(pos, type) {
    let list = [];
    if (type === 'tree') {
      list = this.trees.filter(t => !t.isDead && t.woodRemaining > 0);
    } else {
      list = this.resourceDeposits.filter(r => r.type === type && r.resourcesRemaining > 0);
    }

    let nearest = null;
    let minDist = Infinity;
    list.forEach(item => {
      const d = pos.distanceTo(item.mesh.position);
      if (d < minDist) {
        minDist = d;
        nearest = item;
      }
    });
    return nearest;
  }

  findNearestDropoff(pos, resourceType, buildings = this.buildings, faction = 'player') {
    const list = buildings || this.buildings || [];
    const valid = list.filter(b => {
      if (!b.isConstructed || b.faction !== faction || b.isDead) return false;
      return isDropoffFor(b.type, resourceType);
    });

    let nearest = null;
    let minDist = Infinity;
    valid.forEach(b => {
      const d = pos.distanceTo(b.mesh.position);
      if (d < minDist) {
        minDist = d;
        nearest = b;
      }
    });
    return nearest;
  }

  // --- SELECTION LOGIC ---

  clearSelection() {
    this.selectedUnits.forEach(u => u.setSelected(false));
    this.selectedUnits = [];
    if (this.selectedBuilding) {
      this.selectedBuilding.setSelected(false);
      this.selectedBuilding = null;
    }
    this.selectedResource = null;
  }

  selectSingle(entity) {
    this.clearSelection();
    if (!entity) return;

    if (entity instanceof Unit && entity.faction === 'player') {
      entity.setSelected(true);
      this.selectedUnits.push(entity);
      this.soundManager.playSelect();
    } else if (entity instanceof Building && entity.faction === 'player') {
      entity.setSelected(true);
      this.selectedBuilding = entity;
      this.soundManager.playSelect();
    } else if (entity instanceof Tree || entity instanceof ResourceDeposit) {
      this.selectedResource = entity;
      this.soundManager.playSelect();
    }
  }

  selectUnitsInBox(screenRect, camera) {
    this.clearSelection();
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const minX = Math.min(screenRect.x1, screenRect.x2);
    const maxX = Math.max(screenRect.x1, screenRect.x2);
    const minY = Math.min(screenRect.y1, screenRect.y2);
    const maxY = Math.max(screenRect.y1, screenRect.y2);

    this.units.forEach(u => {
      if (u.isDead || u.faction !== 'player') return;
      const screenPos = u.mesh.position.clone().project(camera);
      const sx = ((screenPos.x + 1) * window.innerWidth) / 2;
      const sy = ((-screenPos.y + 1) * window.innerHeight) / 2;

      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        u.setSelected(true);
        this.selectedUnits.push(u);
      }
    });

    if (this.selectedUnits.length > 0) {
      this.soundManager.playSelect();
    }
  }

  issueOrder(entityUnderCursor, groundPoint) {
    this.selectedUnits = this.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    if (this.selectedUnits.length === 0) {
      if (this.selectedBuilding && groundPoint) {
        if (this.pathfinder && this.pathfinder.isWater(groundPoint.x, groundPoint.z)) {
          groundPoint = this.pathfinder.findNearestWalkable(groundPoint.x, groundPoint.z);
        }
        this.selectedBuilding.setRallyPoint(groundPoint);
        this.soundManager.playOrder();
      }
      return;
    }

    this.soundManager.playOrder();

    if (entityUnderCursor) {
      const e = entityUnderCursor;
      // Right-clicked an enemy: Attack!
      if ((e instanceof Unit && e.faction === 'enemy') || (e instanceof Building && e.faction === 'enemy')) {
        this.selectedUnits.forEach(u => u.orderAttack(e));
        return;
      }
      // Right-clicked a resource: Gather! (Villagers and Peons)
      if (e instanceof Tree || e instanceof ResourceDeposit) {
        const isDepleted = e.isDead || (e.woodRemaining !== undefined && e.woodRemaining <= 0) || (e.resourcesRemaining !== undefined && e.resourcesRemaining <= 0);
        if (!isDepleted) {
          let hasWorkers = false;
          this.selectedUnits.forEach(u => {
            if (u.type === 'villager' || u.type === 'peon') {
              u.orderGather(e);
              hasWorkers = true;
            }
          });
          if (hasWorkers) return;
        }
        // If resource is depleted (e.g. cut stump with no wood) or non-workers selected, move units towards target
        if (groundPoint) {
          this.selectedUnits.forEach(u => u.moveTo(groundPoint.x, groundPoint.z, this));
          return;
        }
        return;
      }
      // Right-clicked an incomplete building: Build!
      if (e instanceof Building && !e.isConstructed && e.faction === 'player') {
        this.selectedUnits.forEach(u => {
          if (u.type === 'villager' || u.type === 'peon') u.orderBuild(e);
        });
        return;
      }
    }

    // Right-clicked ground: Move in formation avoiding water
    if (groundPoint) {
      let centerTarget = groundPoint;
      if (this.pathfinder && this.pathfinder.isWater(centerTarget.x, centerTarget.z)) {
        centerTarget = this.pathfinder.findNearestWalkable(centerTarget.x, centerTarget.z);
      }

      const count = this.selectedUnits.length;
      const cols = Math.ceil(Math.sqrt(count));
      const spacing = 1.6;

      this.selectedUnits.forEach((u, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const offsetX = (col - (cols - 1) / 2) * spacing;
        const offsetZ = (row - (cols - 1) / 2) * spacing;
        let destX = centerTarget.x + offsetX;
        let destZ = centerTarget.z + offsetZ;
        if (this.pathfinder && this.pathfinder.isWater(destX, destZ)) {
          destX = centerTarget.x;
          destZ = centerTarget.z;
        }
        u.moveTo(destX, destZ, this);
      });
    }
  }

  // --- GAME LOOP & AI ---

  update(delta) {
    if (this.isPaused || this.isGameOver) return;
    const dt = delta * this.gameSpeed;
    this.gameTime += dt;

    // Check Win/Loss conditions
    const playerHQ = this.buildings.find(b => (b.type === 'castle' || b.type === 'great_hall') && b.faction === 'player');
    if (!playerHQ || playerHQ.isDead) {
      this.isGameOver = true;
      this.gameWon = false;
      return;
    }

    const enemyHQ = this.buildings.find(b => (b.type === 'castle' || b.type === 'great_hall') && b.faction === 'enemy');
    if (!enemyHQ || enemyHQ.isDead) {
      if (!this.gameWon) {
        this.gameWon = true;
        this.isGameOver = true;
        this.soundManager.playVictory();
      }
      return;
    }

    // Update Trees
    this.trees.forEach(t => t.update(dt, this.particleSystem));

    // Update Projectiles
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      this.arrows[i].update(dt);
      if (this.arrows[i].isDead) {
        this.arrows.splice(i, 1);
      }
    }

    // Update Units and Buildings
    if (!this._allUnits) this._allUnits = [];
    const allUnits = this._allUnits;
    allUnits.length = 0;
    for (let i = 0; i < this.units.length; i++) allUnits.push(this.units[i]);
    for (let i = 0; i < this.enemies.length; i++) allUnits.push(this.enemies[i]);

    // Update Buildings
    this.buildings.forEach(b => {
      b.update(dt, this, this.soundManager, this.particleSystem, this.arrows, b.faction === 'player' ? this.enemies : this.units, allUnits);
    });

    // Clean dead buildings
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (this.buildings[i].isDead) {
        const deadB = this.buildings.splice(i, 1)[0];
        if (deadB.dispose) deadB.dispose();
        this.recalculatePopCap();
        if (this.enemyAI) this.enemyAI.recalculatePop();
      }
    }

    // Update Units
    this.units.forEach(u => {
      u.update(dt, this, this.soundManager, this.particleSystem, this.arrows, allUnits, this.buildings);
    });
    this.enemies.forEach(e => {
      e.update(dt, this, this.soundManager, this.particleSystem, this.arrows, allUnits, this.buildings);
    });

    // Resolve Collisions: Units cannot walk through buildings, deposits, trees, or each other
    this.resolveBuildingCollisions();
    this.resolveUnitCollisions();

    // Autonomous Computer Opponent AI (Utility AI Director)
    if (this.aiDirector) {
      this.aiDirector.update(dt);
    } else if (this.enemyAI) {
      this.enemyAI.update(dt);
    }

    // Update Fog of War (reveals explored territory & culls unexplored enemies)
    if (this.fogOfWar) {
      this.fogOfWar.update(
        dt,
        this.units,
        this.buildings.filter(b => b.faction === 'player'),
        this.enemies,
        this.buildings.filter(b => b.faction === 'enemy')
      );
    }

    // Clean dead units from selection
    if (this.selectedUnits.length > 0) {
      this.selectedUnits = this.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    }

    // Clean dead units (waits for death collapse animation if canRemove is false)
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].isDead && this.units[i].canRemove !== false) {
        const deadU = this.units.splice(i, 1)[0];
        if (deadU.dispose) deadU.dispose();
        this.recalculatePopCap();
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].isDead && this.enemies[i].canRemove !== false) {
        const deadE = this.enemies.splice(i, 1)[0];
        if (deadE.dispose) deadE.dispose();
        if (this.enemyAI) this.enemyAI.recalculatePop();
      }
    }
  }

  warmLiveScene() {
    if (!this.sceneManager || !this.sceneManager.renderer) return;
    const unhideList = [];
    this.scene.traverse(obj => {
      if (obj.isMesh && !obj.visible) {
        obj.visible = true;
        unhideList.push(obj);
      }
    });
    this.sceneManager.renderer.compile(this.scene, this.sceneManager.camera);
    for (let i = 0; i < unhideList.length; i++) {
      unhideList[i].visible = false;
    }
  }

  _checkUnitBlockerCollision(unit, b) {
    if (b.isDead) return;
    const bPos = b.mesh.position;
    const uPos = unit.mesh.position;
    const uRad = unit.collisionRadius || 0.6;
    const bRad = b.collisionRadius || (b.type === 'tree' ? 0.75 : 3.0);
    const minDist = bRad + uRad;

    const dx = uPos.x - bPos.x;
    if (dx >= minDist || dx <= -minDist) return;
    const dz = uPos.z - bPos.z;
    if (dz >= minDist || dz <= -minDist) return;

    const distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist) return;

    const dist = Math.sqrt(distSq);
    let nx, nz;
    if (dist < 0.001) {
      nx = 1;
      nz = 0;
    } else {
      nx = dx / dist;
      nz = dz / dist;
    }
    const push = minDist - dist;
    uPos.x += nx * push;
    uPos.z += nz * push;
    uPos.y = this.terrain.getHeight(uPos.x, uPos.z);

    // Direct delivery upon colliding with dropoff building!
    const isDropoff = isDropoffFor(b.type, unit.carrying ? unit.carrying.type : null) &&
      (b.faction === unit.faction);

    if (unit.state === 'returning' && isDropoff) {
      unit.depositResources(this, this.soundManager, this.particleSystem);
    }
  }

  resolveBuildingCollisions() {
    const checkCollisionsForUnit = (unit) => {
      if (unit.isDead) return;
      // 1. Buildings
      const bCount = this.buildings.length;
      for (let i = 0; i < bCount; i++) {
        this._checkUnitBlockerCollision(unit, this.buildings[i]);
      }
      // 2. Resource deposits
      const rCount = this.resourceDeposits.length;
      for (let i = 0; i < rCount; i++) {
        this._checkUnitBlockerCollision(unit, this.resourceDeposits[i]);
      }
      // 3. Living trees
      const tCount = this.trees.length;
      for (let i = 0; i < tCount; i++) {
        const t = this.trees[i];
        if (!t.isDead && t.woodRemaining > 0) {
          this._checkUnitBlockerCollision(unit, t);
        }
      }
    };

    for (let i = 0; i < this.units.length; i++) {
      checkCollisionsForUnit(this.units[i]);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      checkCollisionsForUnit(this.enemies[i]);
    }
  }

  resolveUnitCollisions() {
    if (!this._collisionUnits) this._collisionUnits = [];
    const arr = this._collisionUnits;
    arr.length = 0;

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.isDead) arr.push(u);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.isDead) arr.push(e);
    }

    const count = arr.length;
    for (let i = 0; i < count; i++) {
      const u1 = arr[i];
      const p1 = u1.mesh.position;
      const r1 = u1.collisionRadius || 0.6;

      for (let j = i + 1; j < count; j++) {
        const u2 = arr[j];
        const p2 = u2.mesh.position;
        const r2 = u2.collisionRadius || 0.6;
        const minDist = r1 + r2;

        const dx = p2.x - p1.x;
        if (dx >= minDist || dx <= -minDist) continue;
        const dz = p2.z - p1.z;
        if (dz >= minDist || dz <= -minDist) continue;

        const distSq = dx * dx + dz * dz;
        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq);
        let nx, nz;
        if (dist < 0.001) {
          const angle = Math.random() * Math.PI * 2;
          nx = Math.cos(angle);
          nz = Math.sin(angle);
        } else {
          nx = dx / dist;
          nz = dz / dist;
        }

        const overlap = (minDist - dist) * 0.5;
        p1.x -= nx * overlap;
        p1.z -= nz * overlap;
        p1.y = this.terrain.getHeight(p1.x, p1.z);

        p2.x += nx * overlap;
        p2.z += nz * overlap;
        p2.y = this.terrain.getHeight(p2.x, p2.z);
      }
    }
  }
}
