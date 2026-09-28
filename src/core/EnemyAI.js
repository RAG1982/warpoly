import * as THREE from 'three';
import { Building } from '../entities/Building.js';

/**
 * Autonomous Computer Opponent AI (Inteligência Artificial do Oponente)
 * 
 * Manages an entire RTS civilization:
 * 1. Economy: Gathers wood and mines gold, manages population and resources.
 * 2. City Development: Constructs Farms, Barracks, Lumber Mills, and Watchtowers.
 * 3. Military Recruitment: Trains combat units (Grunts/Knights, Axethrowers/Archers, Ogres).
 * 4. Squad Coordination: Gathers an army at an assembly point and launches calculated military expeditions.
 * 5. Base Defense: Defends territory against player incursions.
 */
export class EnemyAI {
  constructor(gameManager, faction = 'orc', baseCenter = new THREE.Vector2(-32, 30)) {
    this.gm = gameManager;
    this.faction = faction; // 'orc' or 'human'
    this.baseCenter = baseCenter;

    // AI Economy
    this.resources = {
      wood: 260,
      gold: 220,
      stone: 120
    };
    this.population = 0;
    this.maxPopulation = 15;

    // Faction Archetypes
    this.workerType = faction === 'orc' ? 'peon' : 'villager';
    this.meleeType = faction === 'orc' ? 'grunt' : 'knight';
    this.rangedType = faction === 'orc' ? 'axethrower' : 'archer';
    this.siegeType = faction === 'orc' ? 'ogre' : 'knight';

    this.hqType = faction === 'orc' ? 'great_hall' : 'castle';
    this.barracksType = faction === 'orc' ? 'orc_barracks' : 'barracks';
    this.farmType = faction === 'orc' ? 'pig_farm' : 'cottage';
    this.lumberType = faction === 'orc' ? 'orc_lumber_mill' : 'lumber_camp';
    this.towerType = faction === 'orc' ? 'orc_watchtower' : 'watchtower';

    // Unit costs
    this.costs = {
      worker: { gold: 50, time: 7 },
      melee: { gold: 70, wood: 50, stone: 5, time: 10 },
      ranged: { wood: 60, gold: 35, time: 9 },
      siege: { wood: 100, gold: 75, stone: 35, time: 13 },
      farm: { wood: 50 },
      barracks: { wood: 120, stone: 60 },
      lumber: { wood: 80 },
      tower: { wood: 80, stone: 40 }
    };

    // Army Staging & Expedition timers (Halved map 160x160)
    this.assemblyRallyPoint = new THREE.Vector3(
      baseCenter.x + (baseCenter.x < 0 ? 10 : -10),
      0,
      baseCenter.y + (baseCenter.y < 0 ? 10 : -10)
    );
    this.strikeSquad = [];
    this.attackThreshold = 4; // Form attack squad as soon as 4 combat units are ready
    this.aiTickTimer = 0;
    this.strikeWaveNumber = 1;
  }

  canAfford(cost) {
    if (cost.wood && this.resources.wood < cost.wood) return false;
    if (cost.gold && this.resources.gold < cost.gold) return false;
    if (cost.stone && this.resources.stone < cost.stone) return false;
    return true;
  }

  deduct(cost) {
    if (cost.wood) this.resources.wood -= cost.wood;
    if (cost.gold) this.resources.gold -= cost.gold;
    if (cost.stone) this.resources.stone -= cost.stone;
  }

  addResource(type, amount) {
    if (this.resources[type] !== undefined) {
      this.resources[type] += amount;
    }
  }

  recalculatePop() {
    let cap = 0;
    const enemyBuildings = this.gm.buildings.filter(b => b.faction === 'enemy' && !b.isDead && b.isConstructed);
    enemyBuildings.forEach(b => {
      if (b.popGranted) cap += b.popGranted;
    });
    this.maxPopulation = cap;
    this.population = this.gm.enemies.filter(e => !e.isDead).length;
  }

  /**
   * Main AI Update Loop (runs every frame, ticks decisions every 0.8s)
   */
  update(delta) {
    this.aiTickTimer += delta;

    if (this.aiTickTimer < 0.8) return;
    this.aiTickTimer = 0;

    this.recalculatePop();

    // 1. Manage Base Defense
    this.manageBaseDefense();

    // 2. Manage Workers (Gathering Wood, Gold, Constructing)
    this.manageWorkers();

    // 3. Manage City Expansion & Construction
    this.manageConstruction();

    // 4. Manage Military Training
    this.manageTraining();

    // 5. Manage Strike Force Expeditions
    this.manageMilitaryExpedition();
  }

  /**
   * 1. Base Defense: Repel intruders near AI territory
   */
  manageBaseDefense() {
    const enemyHQ = this.gm.buildings.find(b => b.faction === 'enemy' && b.type === this.hqType && !b.isDead);
    if (!enemyHQ) return;

    const basePos = enemyHQ.mesh.position;
    const intruders = this.gm.units.filter(u => !u.isDead && u.mesh.position.distanceTo(basePos) < 24);

    if (intruders.length > 0) {
      const targetIntruder = intruders[0];
      // Order idle enemy combat units to defend
      this.gm.enemies.forEach(e => {
        if (!e.isDead && e.type !== this.workerType && e.state === 'idle') {
          e.orderAttack(targetIntruder);
        }
      });
    }
  }

  /**
   * 2. Manage Workers: Assign idle workers to nearest trees and gold mines
   */
  manageWorkers() {
    const workers = this.gm.enemies.filter(e => !e.isDead && e.type === this.workerType);
    const livingTrees = this.gm.trees.filter(t => !t.isDead && t.woodRemaining > 0);
    const goldMines = this.gm.resourceDeposits.filter(r => r.type === 'gold' && r.resourcesRemaining > 0);
    const stoneQuarries = this.gm.resourceDeposits.filter(r => r.type === 'stone' && r.resourcesRemaining > 0);

    // Filter idle workers
    const idleWorkers = workers.filter(w => w.state === 'idle');

    idleWorkers.forEach(w => {
      // Balance: woodcutters, miners, and stonecutters
      const woodcutters = workers.filter(u => u.state === 'gathering' && u.gatherTarget && u.gatherTarget.type === 'tree').length;
      const miners = workers.filter(u => u.state === 'gathering' && u.gatherTarget && u.gatherTarget.type === 'gold').length;
      const stonecutters = workers.filter(u => u.state === 'gathering' && u.gatherTarget && u.gatherTarget.type === 'stone').length;

      if (stonecutters < 2 && stoneQuarries.length > 0 && Math.random() < 0.4) {
        let nearestS = stoneQuarries[0];
        let minDist = Infinity;
        stoneQuarries.forEach(s => {
          const d = w.mesh.position.distanceTo(s.mesh.position);
          if (d < minDist) {
            minDist = d;
            nearestS = s;
          }
        });
        if (nearestS) w.orderGather(nearestS);
      } else if (woodcutters <= miners && livingTrees.length > 0) {
        // Find nearest tree to worker
        let nearestT = livingTrees[0];
        let minDist = Infinity;
        livingTrees.forEach(t => {
          const d = w.mesh.position.distanceTo(t.mesh.position);
          if (d < minDist) {
            minDist = d;
            nearestT = t;
          }
        });
        if (nearestT) w.orderGather(nearestT);
      } else if (goldMines.length > 0) {
        // Find nearest gold mine
        let nearestG = goldMines[0];
        let minDist = Infinity;
        goldMines.forEach(g => {
          const d = w.mesh.position.distanceTo(g.mesh.position);
          if (d < minDist) {
            minDist = d;
            nearestG = g;
          }
        });
        if (nearestG) w.orderGather(nearestG);
      }
    });

    // Check if AI needs more workers (target 7-8 workers)
    if (workers.length < 8 && this.population < this.maxPopulation) {
      const hq = this.gm.buildings.find(b => b.faction === 'enemy' && b.type === this.hqType && b.isConstructed && !b.isDead);
      if (hq && (!hq.queue || hq.queue.length === 0) && this.canAfford(this.costs.worker)) {
        this.deduct(this.costs.worker);
        hq.queue.push({
          type: this.workerType,
          progress: 0,
          totalTime: this.costs.worker.time
        });
      }
    }
  }

  /**
   * 3. City Expansion: Construct Farms, Barracks, Lumber Mill, Watchtower
   */
  manageConstruction() {
    const enemyBuildings = this.gm.buildings.filter(b => b.faction === 'enemy' && !b.isDead);
    const incomplete = enemyBuildings.filter(b => !b.isConstructed);

    // If there's an incomplete building, ensure a worker is building it
    if (incomplete.length > 0) {
      const b = incomplete[0];
      const workers = this.gm.enemies.filter(e => !e.isDead && e.type === this.workerType);
      const isBeingBuilt = workers.some(w => w.state === 'building' && w.buildTarget === b);
      if (!isBeingBuilt && workers.length > 0) {
        workers[0].orderBuild(b);
      }
      return;
    }

    // 1. Build Farm / House if approaching pop limit
    if (this.population >= this.maxPopulation - 3 && this.canAfford(this.costs.farm)) {
      this.deduct(this.costs.farm);
      const chosenHousing = (this.faction === 'orc' && Math.random() < 0.5) ? 'orc_house' : this.farmType;
      this.placeBuilding(chosenHousing);
      return;
    }

    // 2. Build Barracks if none exists
    const hasBarracks = enemyBuildings.some(b => b.type === this.barracksType);
    if (!hasBarracks && this.canAfford(this.costs.barracks)) {
      this.deduct(this.costs.barracks);
      this.placeBuilding(this.barracksType);
      return;
    }

    // 3. Build Lumber Mill if none exists
    const hasLumber = enemyBuildings.some(b => b.type === this.lumberType);
    if (!hasLumber && this.canAfford(this.costs.lumber)) {
      this.deduct(this.costs.lumber);
      this.placeBuilding(this.lumberType);
      return;
    }

    // 4. Build War Forge if has Barracks
    const forgeType = this.faction === 'orc' ? 'orc_forge' : 'forge';
    const hasForge = enemyBuildings.some(b => b.type === forgeType);
    const forgeCost = { wood: 100, stone: 70, gold: 50 };
    if (!hasForge && hasBarracks && this.canAfford(forgeCost)) {
      this.deduct(forgeCost);
      this.placeBuilding(forgeType);
      return;
    }

    // 5. Build Watchtower near perimeter
    const towerCount = enemyBuildings.filter(b => b.type === this.towerType).length;
    if (towerCount < 2 && this.canAfford(this.costs.tower)) {
      this.deduct(this.costs.tower);
      this.placeBuilding(this.towerType);
      return;
    }
  }

  /**
   * Selects an open, unobstructed location around base center with clearance from other buildings and trees
   */
  placeBuilding(type) {
    let chosenX = null;
    let chosenZ = null;

    // Search for a valid, unobstructed spot around the base
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 14;
      const x = this.baseCenter.x + Math.cos(angle) * dist;
      const z = this.baseCenter.y + Math.sin(angle) * dist;

      if (this.gm.canPlaceBuilding(type, x, z)) {
        chosenX = x;
        chosenZ = z;
        break;
      }
    }

    if (chosenX === null) {
      return; // Could not find clear spot this tick, will retry next tick
    }

    const b = this.gm.createBuilding(type, chosenX, chosenZ, false, 'enemy');
    this.gm.buildings.push(b);
    this.recalculatePop();

    // Assign nearest worker to build it
    const workers = this.gm.enemies.filter(e => !e.isDead && e.type === this.workerType);
    if (workers.length > 0) {
      let nearestW = workers[0];
      let minDist = Infinity;
      workers.forEach(w => {
        const d = w.mesh.position.distanceTo(b.mesh.position);
        if (d < minDist) {
          minDist = d;
          nearestW = w;
        }
      });
      nearestW.orderBuild(b);
    }
  }

  /**
   * 4. Military Training: Trains Grunts/Knights, Axethrowers/Archers, Ogres
   */
  manageTraining() {
    if (this.population >= this.maxPopulation) return;

    const barracks = this.gm.buildings.find(b => b.faction === 'enemy' && b.type === this.barracksType && b.isConstructed && !b.isDead);
    if (!barracks) return;

    if (barracks.queue && barracks.queue.length >= 2) return;

    // Determine unit type to recruit based on army composition & resources
    const combatUnits = this.gm.enemies.filter(e => !e.isDead && e.type !== this.workerType);
    const meleeCount = combatUnits.filter(u => u.type === this.meleeType).length;
    const rangedCount = combatUnits.filter(u => u.type === this.rangedType).length;

    let recruitType = this.meleeType;
    let cost = this.costs.melee;

    if (this.canAfford(this.costs.siege) && Math.random() < 0.25) {
      recruitType = this.siegeType;
      cost = this.costs.siege;
    } else if (rangedCount < meleeCount && this.canAfford(this.costs.ranged)) {
      recruitType = this.rangedType;
      cost = this.costs.ranged;
    } else if (this.canAfford(this.costs.melee)) {
      recruitType = this.meleeType;
      cost = this.costs.melee;
    } else {
      return; // Can't afford
    }

    this.deduct(cost);
    barracks.queue.push({
      type: recruitType,
      progress: 0,
      totalTime: cost.time
    });

    // Set rally point towards assembly staging area
    barracks.setRallyPoint(this.assemblyRallyPoint);
  }

  /**
   * 5. Manage Military Expeditions: Gather squad and launch marches across the continent
   */
  manageMilitaryExpedition() {
    // Collect all idle combat units
    const combatUnits = this.gm.enemies.filter(e => !e.isDead && e.type !== this.workerType);
    const readyUnits = combatUnits.filter(u => u.state === 'idle' || u.state === 'moving');

    // Attack whenever the AI has gathered an expedition squad (dynamic threshold 3 to 6 units)
    if (readyUnits.length >= this.attackThreshold) {
      this.attackThreshold = 3 + (this.strikeWaveNumber % 4);
      this.strikeWaveNumber++;

      // Identify player target: priority on forward towers/buildings, then Castle/Great Hall
      const playerBuildings = this.gm.buildings.filter(b => b.faction === 'player' && !b.isDead);
      const playerHQ = playerBuildings.find(b => b.type === (this.faction === 'orc' ? 'castle' : 'great_hall'));
      const target = playerHQ || playerBuildings[0] || (this.gm.units.length > 0 ? this.gm.units[0] : null);

      if (target) {
        if (this.gm.soundManager) this.gm.soundManager.playAlarm();
        if (this.gm.uiManager) {
          const factionName = this.faction === 'orc' ? 'Horda Orc' : 'Aliança Humana';
          this.gm.uiManager.showNotification(`⚔️ A ${factionName} reuniu suas tropas e está marchando para o ataque!`);
        }
        readyUnits.forEach((soldier, idx) => {
          // Staggered formation march
          soldier.orderAttack(target);
        });
      }
    }
  }
}
