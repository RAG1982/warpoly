import * as THREE from 'three';
import { AIEconomyManager } from './AIEconomyManager.js';
import { AIMilitaryManager } from './AIMilitaryManager.js';

/**
 * AIDirector (Diretor de IA Oponente - Utility AI System)
 * 
 * Orquestrador central da civilização adversária. Opera sob um ciclo
 * de decisão de 1.0 segundo para máxima performance no navegador, avaliando
 * utilidades dinâmicas (U_eco, U_def, U_mil) e delegando ações executivas
 * aos gerentes especializados (AIEconomyManager e AIMilitaryManager).
 */
export class AIDirector {
  /**
   * @param {import('../core/GameManager.js').GameManager} gameManager
   * @param {'orc'|'human'} faction
   * @param {THREE.Vector2} baseCenter
   */
  constructor(gameManager, faction = 'orc', baseCenter = new THREE.Vector2(-32, 30)) {
    this.gm = gameManager;
    this.faction = faction;
    this.baseCenter = baseCenter;

    // Faction archetypes
    this.workerType = faction === 'orc' ? 'peon' : 'villager';
    this.meleeType = faction === 'orc' ? 'grunt' : 'knight';
    this.rangedType = faction === 'orc' ? 'axethrower' : 'archer';
    this.siegeType = faction === 'orc' ? 'ogre' : 'knight';

    this.hqType = faction === 'orc' ? 'great_hall' : 'castle';
    this.barracksType = faction === 'orc' ? 'orc_barracks' : 'barracks';
    this.farmType = faction === 'orc' ? 'pig_farm' : 'cottage';
    this.houseType = faction === 'orc' ? 'orc_house' : 'cottage';
    this.lumberType = faction === 'orc' ? 'orc_lumber_mill' : 'lumber_camp';
    this.towerType = faction === 'orc' ? 'orc_watchtower' : 'watchtower';
    this.forgeType = faction === 'orc' ? 'orc_forge' : 'forge';

    // Costs configuration
    this.costs = {
      worker: { gold: 50, time: 7 },
      melee: { gold: 70, wood: 50, stone: 5, time: 11 },
      ranged: { wood: 60, gold: 35, time: 9 },
      siege: { wood: 100, gold: 75, stone: 35, time: 14 },
      farm: { wood: 50 },
      house: { wood: 50 },
      barracks: { wood: 120, stone: 60 },
      lumber: { wood: 80 },
      tower: { wood: 80, stone: 40 },
      forge: { wood: 100, stone: 70, gold: 50 }
    };

    // AI Economy starting resources (identical to player: 240 wood, 200 gold, 120 stone)
    this.resources = {
      wood: 240,
      gold: 200,
      stone: 120
    };

    // Population State (starts at 5/15 with 1 HQ and 1 Farm/House)
    this.population = 5;
    this.maxPopulation = 15;

    // Tick Timer (Exact 1.0 second evaluation interval)
    this.tickTimer = 0;
    this.TICK_INTERVAL = 1.0;

    // Utility Scores (0.0 to 1.0)
    this.utilities = {
      eco: 0.6,
      housing: 0.2,
      def: 0.0,
      mil: 0.0
    };

    // Sub-Managers
    this.economyManager = new AIEconomyManager(this);
    this.militaryManager = new AIMilitaryManager(this);
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

  /**
   * Returns current count of living enemy combat units
   * @returns {number}
   */
  getCombatUnitCount() {
    const enemies = this.gm.enemies;
    const lenE = enemies.length;
    const workerType = this.workerType;
    let count = 0;
    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type !== workerType) {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns living, constructed enemy barracks if available
   * @returns {import('../entities/Building.js').Building|null}
   */
  getConstructedBarracks() {
    const buildings = this.gm.buildings;
    const lenB = buildings.length;
    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.faction === 'enemy' && b.type === this.barracksType && b.isConstructed && !b.isDead) {
        return b;
      }
    }
    return null;
  }

  /**
   * Recalculates total population and population capacity strictly from living entities
   */
  recalculatePop() {
    let cap = 0;
    const buildings = this.gm.buildings;
    const lenB = buildings.length;

    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.faction === 'enemy' && !b.isDead && b.isConstructed) {
        if (b.popGranted) {
          cap += b.popGranted;
        }
      }
    }

    this.maxPopulation = cap;

    let livingCount = 0;
    const enemies = this.gm.enemies;
    const lenE = enemies.length;
    for (let i = 0; i < lenE; i++) {
      if (!enemies[i].isDead) {
        livingCount++;
      }
    }
    this.population = livingCount;
  }

  /**
   * Evaluates dynamic utility curves based on real-time game state
   */
  evaluateUtilities() {
    const enemies = this.gm.enemies;
    const playerUnits = this.gm.units;
    const buildings = this.gm.buildings;

    // --- 1. Defense Utility (U_def) ---
    // Detect player units threatening enemy base territory (within 26 units of base center)
    let intrudersNearBase = 0;
    const numPlayerUnits = playerUnits.length;
    for (let i = 0; i < numPlayerUnits; i++) {
      const u = playerUnits[i];
      if (!u.isDead) {
        const dx = u.mesh.position.x - this.baseCenter.x;
        const dz = u.mesh.position.z - this.baseCenter.y;
        if ((dx * dx + dz * dz) < 676) { // 26^2
          intrudersNearBase++;
        }
      }
    }

    if (intrudersNearBase > 0) {
      this.utilities.def = Math.min(1.0, 0.4 + intrudersNearBase * 0.2);
    } else {
      this.utilities.def = 0.0;
    }

    // --- 2. Economic Utility & Housing Need (U_eco & U_housing) ---
    // Immediate Population Unlock: When at or near cap (5/5), U_housing fires at 1.0 maximum priority
    const isEmergency = this.economyManager && this.economyManager.isWorkerEmergency();

    if (this.population >= this.maxPopulation) {
      this.utilities.housing = 1.0;
      this.utilities.eco = 1.0;
    } else if (this.population >= this.maxPopulation - 2) {
      this.utilities.housing = 0.85;
      this.utilities.eco = 0.9;
    } else if (isEmergency) {
      this.utilities.housing = 0.3;
      this.utilities.eco = 1.0;
    } else {
      this.utilities.housing = 0.2;
      this.utilities.eco = 0.6;
    }

    // --- 3. Military Utility (U_mil) ---
    // Ratio of ready combat troops vs strike threshold
    let readyCombatTroops = 0;
    const lenE = enemies.length;
    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type !== this.workerType) {
        if (e.state === 'idle' || e.state === 'moving') {
          readyCombatTroops++;
        }
      }
    }

    const threshold = this.militaryManager.attackThreshold;
    if (this.utilities.def > 0.5) {
      // Prioritize homeland defense over foreign offensive
      this.utilities.mil = 0.2;
    } else if (isEmergency) {
      // Keep troops to defend home base while economy recovers
      this.utilities.mil = 0.0;
    } else if (readyCombatTroops >= threshold) {
      this.utilities.mil = 1.0; // Ready for assault!
    } else {
      this.utilities.mil = readyCombatTroops / Math.max(1, threshold);
    }
  }

  /**
   * Main AI Update loop called every frame from GameManager.
   * Employs an exact 1.0 second tick accumulator to eliminate CPU overhead.
   * @param {number} dt 
   */
  update(dt) {
    this.tickTimer += dt;
    if (this.tickTimer < this.TICK_INTERVAL) return;
    this.tickTimer = 0;

    // 1. Recalculate population limit and head count
    this.recalculatePop();

    // 2. Score utility curves
    this.evaluateUtilities();

    // 3. Coordinate Homeland Defense
    this.militaryManager.updateDefense(this.utilities.def);

    // 4. Coordinate Economy, Gathering, and City Construction
    this.economyManager.update(this.utilities.eco, this.utilities.housing);

    // 5. Coordinate Army Recruitment & Military Assault Expeditions
    this.militaryManager.update(this.utilities.mil);
  }
}
