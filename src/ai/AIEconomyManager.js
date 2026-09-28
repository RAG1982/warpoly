import { getCost } from '../data/index.js';

/**
 * AIEconomyManager (Gerenciador de Economia e Construção da IA)
 * 
 * Responsável pela extração equilibrada e adaptativa de recursos (Madeira, Ouro, Pedra),
 * treinamento prioritário de trabalhadores no Great Hall / Castle e expansão
 * ordenada da cidade através da colocação inteligente de edifícios.
 * 
 * Pilares do Sistema:
 * 1. Prioridade Absoluta da Força de Trabalho: Se a contagem de peões for baixa (< 4),
 *    a IA entra em modo de emergência econômica, priorizando ouro e madeira para
 *    treinar peões e proibindo mineração desnecessária de pedra e canibalização militar.
 * 2. Rebalanceamento Dinâmico Ativo: Avalia a força de trabalho a cada ciclo e
 *    redireciona peões ativos para o recurso mais urgente no momento presente
 *    (ex: transição automática de pedra para ouro/madeira se houver escassez).
 * 3. Expansão Balanceada: Não compromete a economia com construções caras enquanto
 *    a base de trabalhadores ainda estiver em formação.
 */
export class AIEconomyManager {
  /**
   * @param {import('./AIDirector.js').AIDirector} director
   */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;
    this.currentGoal = 'BUILD_WORKFORCE';
  }

  /**
   * Main economy tick executed every 1.0s by AIDirector
   * @param {number} uEco 
   * @param {number} uHousing 
   */
  update(uEco, uHousing) {
    // 1. Ensure incomplete buildings have an assigned worker
    const hasPendingScaffold = this.manageActiveConstruction();

    // 2. High-Priority Peon Recruitment: Ensure Town Center continuously trains workers
    this.manageWorkerRecruitment();

    // 3. Strategic City Expansion & Housing Placement
    if (!hasPendingScaffold) {
      this.manageBuildingPlacement(uHousing);
    }

    // 4. Dynamic Workforce Rebalancing: Actively direct gatherers to the most immediate needed resource
    this.rebalanceWorkforce();
  }

  /**
   * Returns current count of living enemy workers
   * @returns {number}
   */
  getLivingWorkerCount() {
    const enemies = this.director.getOwnUnits();
    const lenE = enemies.length;
    const workerType = this.director.workerType;
    let count = 0;
    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type === workerType) {
        count++;
      }
    }
    return count;
  }

  /**
   * Indicates whether the AI is suffering a severe worker deficit (< 3 workers)
   * During emergency, all resources are strictly safeguarded for worker recovery.
   * @returns {boolean}
   */
  isWorkerEmergency() {
    return this.getLivingWorkerCount() < 3;
  }

  /**
   * Verifies if the military manager can safely recruit combat troops without starving peon production
   * @returns {boolean}
   */
  canAffordMilitaryRecruitment() {
    const workerCount = this.getLivingWorkerCount();
    const combatCount = this.director.getCombatUnitCount();

    // Defense priority: If the base has fewer than 2 combat units and at least 3 workers,
    // recruitment is urgently permitted so the base does not sit completely defenseless!
    if (combatCount < 2 && workerCount >= 3) {
      return true;
    }

    if (workerCount >= 6) return true;

    // Preserve resource buffer for peon recruitment so peon training doesn't stall
    return this.director.resources.gold >= 80;
  }

  /**
   * Verifies if any incomplete building needs a builder worker assigned
   * @returns {boolean} True if there is currently an unfinished building under construction
   */
  manageActiveConstruction() {
    const buildings = this.gm.buildings;
    const lenB = buildings.length;
    let incomplete = null;

    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.ownerId === this.director.playerId && !b.isDead && !b.isConstructed) {
        incomplete = b;
        break;
      }
    }

    if (!incomplete) return false;

    // Check if an enemy worker is actively building this scaffold
    const enemies = this.director.getOwnUnits();
    const lenE = enemies.length;
    let hasBuilder = false;
    let candidateWorker = null;

    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type === this.director.workerType) {
        if (e.state === 'building' && e.buildTarget === incomplete) {
          hasBuilder = true;
          break;
        }
        if (!candidateWorker && (e.state === 'idle' || e.state === 'gathering')) {
          candidateWorker = e;
        }
      }
    }

    // If no worker is building the incomplete structure, order candidate worker to build it
    if (!hasBuilder && candidateWorker) {
      candidateWorker.orderBuild(incomplete);
    }

    return true;
  }

  /**
   * Recruits peons / villagers at the HQ using the official queueUnit API
   */
  manageWorkerRecruitment() {
    if (this.director.population >= this.director.maxPopulation) return;

    const workerCount = this.getLivingWorkerCount();

    // Find living constructed HQ
    const buildings = this.gm.buildings;
    const lenB = buildings.length;
    let hq = null;

    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.ownerId === this.director.playerId && b.type === this.director.hqType && b.isConstructed && !b.isDead) {
        hq = b;
        break;
      }
    }

    if (!hq) return;

    const queuedWorkers = (hq.queue ? hq.queue.length : 0);
    const totalWorkers = workerCount + queuedWorkers;

    // DEFENSE SAFEGUARD:
    // If the base has a constructed Barracks but ZERO combat units (completely defenseless) and at least 3 workers,
    // do not consume all gold on peons if gold < 120 (soldier 70 + peon 50).
    // Reserve the resources so the Barracks can recruit a defender first!
    const barracks = this.director.getConstructedBarracks();
    const combatCount = this.director.getCombatUnitCount();
    const barracksQueued = (barracks && barracks.queue ? barracks.queue.length : 0);

    if (barracks && combatCount === 0 && barracksQueued === 0 && workerCount >= 3) {
      if (this.director.resources.gold < 120) {
        return; // Yield priority to Barracks for military defense!
      }
    }

    // Normal workforce target: 8 workers.
    // Booming economy target: up to 12 workers if resources are abundant
    let maxDesiredWorkers = 8;
    if (this.director.resources.wood >= 150 && this.director.resources.gold >= 80) {
      maxDesiredWorkers = 12;
    }

    if (totalWorkers >= maxDesiredWorkers) return;

    // Queue worker if queue is not full (< 2 units) and resources are available
    if (hq.queue && hq.queue.length < 2 && this.director.canAfford(this.director.costs.worker)) {
      hq.queueUnit(this.director.workerType, this.gm);
    }
  }

  /**
   * Handles building placement based on economic utility, population headroom, and workforce maturity
   * @param {number} uHousing
   */
  manageBuildingPlacement(uHousing) {
    const buildings = this.gm.buildings;
    const lenB = buildings.length;
    const workerCount = this.getLivingWorkerCount();

    // 1. POPULATION UNLOCK: Pig Farm or Orc House (Maximum priority when population is near/at cap)
    if (uHousing >= 0.85 || this.director.population >= this.director.maxPopulation) {
      const farmCost = this.director.costs.farm;
      if (this.director.canAfford(farmCost)) {
        this.director.deduct(farmCost);
        const chosenType = (this.director.faction === 'orc' && Math.random() < 0.45)
          ? this.director.houseType
          : this.director.farmType;
        this.placeBuilding(chosenType);
        return;
      }
    }

    // Do not initiate non-essential construction projects if workforce is too small!
    // Building a Barracks with only 1 or 2 workers freezes half or all the workforce.
    if (workerCount < 3) return;

    // 2. BARRACKS: Military training foundation (requires at least 3 workers)
    let hasBarracks = false;
    let hasLumber = false;
    let hasForge = false;
    let towerCount = 0;

    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.ownerId === this.director.playerId && !b.isDead) {
        if (b.type === this.director.barracksType) hasBarracks = true;
        if (b.type === this.director.lumberType) hasLumber = true;
        if (b.type === this.director.forgeType) hasForge = true;
        if (b.type === this.director.towerType) towerCount++;
      }
    }

    if (!hasBarracks && this.director.canAfford(this.director.costs.barracks)) {
      this.director.deduct(this.director.costs.barracks);
      this.placeBuilding(this.director.barracksType);
      return;
    }

    // 3. LUMBER MILL: Enhanced wood harvesting & dropoff (requires at least 4 workers)
    if (workerCount >= 4 && !hasLumber && this.director.canAfford(this.director.costs.lumber)) {
      this.director.deduct(this.director.costs.lumber);
      this.placeBuilding(this.director.lumberType);
      return;
    }

    // 4. SECONDARY HOUSING: Maintain population headroom as army grows
    if (this.director.population >= this.director.maxPopulation - 3 && this.director.canAfford(this.director.costs.farm)) {
      this.director.deduct(this.director.costs.farm);
      const chosenType = (this.director.faction === 'orc' && Math.random() < 0.5)
        ? this.director.houseType
        : this.director.farmType;
      this.placeBuilding(chosenType);
      return;
    }

    // 5. WAR FORGE: Orc arms workshop for advanced units (requires at least 5 workers)
    if (workerCount >= 5 && this.director.faction === 'orc' && hasBarracks && !hasForge && this.director.canAfford(this.director.costs.forge)) {
      this.director.deduct(this.director.costs.forge);
      this.placeBuilding(this.director.forgeType);
      return;
    }

    // 6. WATCHTOWERS: Perimeter defense against player incursions (requires at least 5 workers)
    if (workerCount >= 5 && towerCount < 2 && this.director.canAfford(this.director.costs.tower)) {
      this.director.deduct(this.director.costs.tower);
      this.placeBuilding(this.director.towerType);
      return;
    }
  }

  /**
   * Evaluates the current state of the economy and determines the ideal target distribution of workers.
   * Understands multi-resource requirements for military troops (Gold, Wood, Stone) and tech buildings.
   * @param {Array<import('../entities/Unit.js').Unit>} livingWorkers
   * @param {Array<import('../entities/Unit.js').Unit>} availableGatherers
   * @returns {{ wood: number, gold: number, stone: number }}
   */
  evaluateWorkforceTargets(livingWorkers, availableGatherers) {
    const res = this.director.resources;
    const workerCount = livingWorkers.length;
    const count = availableGatherers.length;
    if (count === 0) return { wood: 0, gold: 0, stone: 0 };

    const isPopBlocked = this.director.population >= this.director.maxPopulation;

    // Check buildings status
    let hasBarracks = false;
    let isBuildingBarracks = false;
    let hasForge = false;
    let towerCount = 0;
    const buildings = this.gm.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === this.director.playerId && !b.isDead) {
        if (b.type === this.director.barracksType) {
          if (b.isConstructed) hasBarracks = true;
          else isBuildingBarracks = true;
        }
        if (b.type === this.director.forgeType && b.isConstructed) hasForge = true;
        if (b.type === this.director.towerType && b.isConstructed) towerCount++;
      }
    }

    // --- 1. DETERMINE STONE TARGET ---
    let targetStone = 0;

    // Strict Rule: Never mine stone with <= 2 workers (all workers must focus on gold/wood)
    if (workerCount <= 2) {
      targetStone = 0;
    } else if (workerCount === 3) {
      // With 3 workers:
      // If saving for barracks (60 stone, 120 wood) and wood is somewhat ready:
      if (!hasBarracks && !isBuildingBarracks && res.stone < 60 && res.wood >= 60) {
        targetStone = 1;
      } else if (hasBarracks && res.stone < 10) {
        // Military troops need 5 stone each (Grunt/Knight)
        targetStone = 1;
      } else {
        targetStone = 0;
      }
    } else {
      // With 4+ workers:
      if (!hasBarracks && !isBuildingBarracks && res.stone < 60) {
        targetStone = 1;
      } else if (hasBarracks || isBuildingBarracks) {
        // Military is active! Grunts/Knights require 5 stone each; Forge 70; Towers 40.
        if (res.stone < 25) {
          // Keep steady stone flow for troop recruitment (1 worker gathers 3 stone per chop)
          targetStone = 1;
        } else if (workerCount >= 5 && res.stone < 60 && (towerCount < 2 || !hasForge || workerCount >= 7)) {
          // Saving stone for base fortresses (towers) or war forge when economy has enough workers (>= 5)
          targetStone = 1;
        } else if (workerCount >= 8 && res.stone < 80) {
          targetStone = Math.min(2, Math.floor(count * 0.25));
        } else {
          // When stone is sufficient (>= 25 with small workforce, or >= 60), free the worker for Wood and Gold!
          targetStone = 0;
        }
      } else {
        targetStone = 0;
      }
    }

    // Safety: Ensure stone never claims all workers (always keep at least 1 wood and 1 gold if >= 2 workers)
    if (count >= 2 && targetStone > count - 2) {
      targetStone = Math.max(0, count - 2);
    }
    if (count === 1 && targetStone > 0) {
      targetStone = 0;
    }

    // --- 2. DETERMINE WOOD AND GOLD TARGETS ---
    const remaining = count - targetStone;
    let targetWood = 0;
    let targetGold = 0;

    if (remaining === 1) {
      // Single gatherer available
      if (isPopBlocked || res.wood < 50) {
        targetWood = 1;
      } else if (res.gold < 50) {
        targetGold = 1;
      } else if (res.wood <= res.gold) {
        targetWood = 1;
      } else {
        targetGold = 1;
      }
    } else if (remaining === 2) {
      // 2 gatherers available
      if (isPopBlocked && res.wood < 50) {
        targetWood = 2;
        targetGold = 0;
      } else if (res.gold < 30 && res.wood >= 120) {
        targetGold = 2;
        targetWood = 0;
      } else if (res.wood < 30 && res.gold >= 120) {
        targetWood = 2;
        targetGold = 0;
      } else {
        // Healthy, balanced default: 1 woodcutter, 1 gold miner
        targetWood = 1;
        targetGold = 1;
      }
    } else {
      // 3 or more gatherers available:
      // Multi-resource awareness: military units consume Gold (70) and Wood (50-60)
      if (isPopBlocked && res.wood < 50) {
        // High priority on wood to unblock population cap
        targetWood = Math.max(2, Math.ceil(remaining * 0.65));
        targetGold = remaining - targetWood;
      } else if (!hasBarracks && !isBuildingBarracks && res.wood < 120) {
        // Saving wood for Barracks (120 wood)
        targetWood = Math.ceil(remaining * 0.6);
        targetGold = remaining - targetWood;
      } else if (res.gold >= 100 && res.wood < 50) {
        // Gold is sufficient for soldiers/workers, but wood is in severe deficit
        targetWood = Math.ceil(remaining * 0.65);
        targetGold = remaining - targetWood;
      } else if (res.wood >= 100 && res.gold < 50) {
        // Wood is sufficient, but gold is in severe deficit
        targetGold = Math.ceil(remaining * 0.65);
        targetWood = remaining - targetGold;
      } else if (res.gold < 70 && res.wood < 50) {
        // Both resources are low for military production; balance evenly
        targetGold = Math.ceil(remaining * 0.55);
        targetWood = remaining - targetGold;
      } else if (res.gold < 80) {
        // Slight gold bias for troop training (70G) and peons (50G)
        targetGold = Math.ceil(remaining * 0.55);
        targetWood = remaining - targetGold;
      } else {
        // Balanced general economy
        targetWood = Math.ceil(remaining * 0.5);
        targetGold = remaining - targetWood;
      }

      // CRITICAL GUARANTEE: Never leave Wood or Gold completely unharvested when remaining >= 2
      if (targetWood < 1) {
        targetWood = 1;
        targetGold = remaining - 1;
      }
      if (targetGold < 1) {
        targetGold = 1;
        targetWood = remaining - 1;
      }
    }

    return { wood: targetWood, gold: targetGold, stone: targetStone };
  }

  /**
   * Actively balances and redirects the workforce among Wood, Gold, and Stone.
   * If there is an excess of workers on one resource and a deficit in another,
   * workers are dynamically reassigned to satisfy the most urgent resource need.
   */
  rebalanceWorkforce() {
    const enemies = this.director.getOwnUnits();
    const lenE = enemies.length;
    const workerType = this.director.workerType;

    const livingWorkers = [];
    const availableGatherers = [];
    const woodWorkers = [];
    const goldWorkers = [];
    const stoneWorkers = [];
    const idleWorkers = [];

    // Categorize workers by current role
    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type === workerType) {
        livingWorkers.push(e);

        if (e.state === 'building') {
          // Worker is busy building scaffold; do not interrupt active construction
          continue;
        }

        availableGatherers.push(e);

        if (e.state === 'idle') {
          idleWorkers.push(e);
        } else {
          // Identify resource assignment from gatherTarget or carrying type
          let assignedType = null;
          if (e.gatherTarget && !e.gatherTarget.isDead) {
            assignedType = e.gatherTarget.type;
          } else if (e.carrying && e.carrying.amount > 0) {
            assignedType = e.carrying.type === 'wood' ? 'tree' : e.carrying.type;
          }

          if (assignedType === 'tree' || assignedType === 'wood') {
            woodWorkers.push(e);
          } else if (assignedType === 'gold') {
            goldWorkers.push(e);
          } else if (assignedType === 'stone') {
            stoneWorkers.push(e);
          } else {
            idleWorkers.push(e);
          }
        }
      }
    }

    if (availableGatherers.length === 0) return;

    // Calculate optimal workforce target distribution
    const targets = this.evaluateWorkforceTargets(livingWorkers, availableGatherers);

    const cur = {
      gold: goldWorkers.length,
      wood: woodWorkers.length,
      stone: stoneWorkers.length
    };

    const workerPools = {
      gold: goldWorkers,
      wood: woodWorkers,
      stone: stoneWorkers
    };

    const getTargetForType = (workerPos, type) => {
      if (type === 'wood' || type === 'tree') return this.findNearestLivingTree(workerPos);
      return this.findNearestResource(workerPos, type);
    };

    // 1. Task idle workers first to satisfy deficit categories
    for (let i = 0; i < idleWorkers.length; i++) {
      const w = idleWorkers[i];

      // Find the resource with the greatest deficit
      let bestType = null;
      let maxDeficit = -Infinity;
      const resKeys = ['gold', 'wood', 'stone'];
      for (let k = 0; k < 3; k++) {
        const key = resKeys[k];
        const deficit = targets[key] - cur[key];
        if (deficit > maxDeficit) {
          maxDeficit = deficit;
          bestType = key;
        }
      }

      if (maxDeficit <= 0) {
        // Fallback: pick the resource with the lowest current count between gold and wood
        bestType = (cur.gold <= cur.wood) ? 'gold' : 'wood';
      }

      cur[bestType]++;
      const resEntity = getTargetForType(w.mesh.position, bestType);
      if (resEntity) {
        w.orderGather(resEntity);
      }
    }

    // 2. Active Rebalancing across all 3 resources:
    // Dynamically transfer surplus workers to deficit resources
    while (true) {
      // Find surplus resource with largest excess
      let surplusType = null;
      let maxExcess = 0;
      const resKeys = ['gold', 'wood', 'stone'];

      for (let k = 0; k < 3; k++) {
        const key = resKeys[k];
        const excess = cur[key] - targets[key];
        if (excess > maxExcess && workerPools[key].length > 0) {
          maxExcess = excess;
          surplusType = key;
        }
      }

      // Find deficit resource with largest shortage
      let deficitType = null;
      let maxShortage = 0;
      for (let k = 0; k < 3; k++) {
        const key = resKeys[k];
        const shortage = targets[key] - cur[key];
        if (shortage > maxShortage) {
          maxShortage = shortage;
          deficitType = key;
        }
      }

      // If no surplus or no deficit exists, rebalancing is complete!
      if (!surplusType || !deficitType) {
        break;
      }

      const candidate = workerPools[surplusType].pop();
      cur[surplusType]--;
      cur[deficitType]++;

      const resEntity = getTargetForType(candidate.mesh.position, deficitType);
      if (resEntity) {
        candidate.orderGather(resEntity);
      }
    }
  }

  /**
   * Finds closest living tree with remaining wood to a given position
   * @param {THREE.Vector3} pos 
   */
  findNearestLivingTree(pos) {
    const trees = this.gm.trees;
    const len = trees.length;
    let nearest = null;
    let minDistSq = Infinity;

    for (let i = 0; i < len; i++) {
      const t = trees[i];
      if (!t.isDead && t.woodRemaining > 0) {
        const dx = t.mesh.position.x - pos.x;
        const dz = t.mesh.position.z - pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          nearest = t;
        }
      }
    }
    return nearest;
  }

  /**
   * Finds closest resource deposit of a specific type (gold or stone) with remaining resources
   * @param {THREE.Vector3} pos 
   * @param {'gold'|'stone'} type 
   */
  findNearestResource(pos, type) {
    const deposits = this.gm.resourceDeposits;
    const len = deposits.length;
    let nearest = null;
    let minDistSq = Infinity;

    for (let i = 0; i < len; i++) {
      const r = deposits[i];
      if (r.type === type && r.resourcesRemaining > 0) {
        const dx = r.mesh.position.x - pos.x;
        const dz = r.mesh.position.z - pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          nearest = r;
        }
      }
    }
    return nearest;
  }

  /**
   * Finds an unobstructed, valid placement spot around the base and orders a worker to construct it
   * @param {string} type 
   */
  placeBuilding(type) {
    let chosenX = null;
    let chosenZ = null;
    const baseCenter = this.director.baseCenter;

    // Search radially around base center for a valid placement location
    for (let attempt = 0; attempt < 45; attempt++) {
      const angle = (attempt * 0.45) + (Math.random() * 0.3);
      const dist = 11.5 + (attempt % 3) * 4.5 + Math.random() * 3.0;
      const testX = baseCenter.x + Math.cos(angle) * dist;
      const testZ = baseCenter.y + Math.sin(angle) * dist;

      if (this.gm.canPlaceBuilding(type, testX, testZ)) {
        chosenX = testX;
        chosenZ = testZ;
        break;
      }
    }

    if (chosenX === null) {
      // Refund if no valid spot found this cycle
      const cost = getCost(type) || this.director.costs.farm;
      if (cost.wood) this.director.resources.wood += cost.wood;
      if (cost.stone) this.director.resources.stone += cost.stone;
      if (cost.gold) this.director.resources.gold += cost.gold;
      return;
    }

    // Instantiate scaffold in unconstructed state
    const scaffold = this.gm.createBuilding(type, chosenX, chosenZ, false, this.director.playerId);
    this.gm.buildings.push(scaffold);
    this.director.recalculatePop();

    // Assign nearest available worker to build using the official orderBuild API
    const enemies = this.director.getOwnUnits();
    const lenE = enemies.length;
    let nearestWorker = null;
    let minDistSq = Infinity;

    for (let i = 0; i < lenE; i++) {
      const w = enemies[i];
      if (!w.isDead && w.type === this.director.workerType) {
        const dx = w.mesh.position.x - chosenX;
        const dz = w.mesh.position.z - chosenZ;
        const dSq = dx * dx + dz * dz;

        // Prefer idle workers, then gathering workers
        const bias = w.state === 'idle' ? 0 : 50;
        if ((dSq + bias) < minDistSq) {
          minDistSq = dSq + bias;
          nearestWorker = w;
        }
      }
    }

    if (nearestWorker) {
      nearestWorker.orderBuild(scaffold);
    }
  }
}
