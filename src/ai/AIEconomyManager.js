import { CMD } from '../sim/commands.js';
import { repairCostFor, REPAIR_HP_FRACTION } from '../sim/repair.js';
import { missingRequirements, missingUpgradeRequirements } from '../sim/requirements.js';
import { getHqUpgradeCost, getBuildingDef, getUnitDef, RESEARCH, WALL_STEP } from '../data/index.js';

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
    /** F3-08: no máx. 1 linha de muralha por partida (`_wallAttempts` limita tentativas sem espaço). */
    this._wallLineDone = false;
    this._wallAttempts = 0;
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

    // 5. F3-06: evolui o Centro (HQ) quando a economia já está madura
    this.considerHqUpgrade();

    // 6. F3-07: pesquisas da Forja/Serraria quando sobra ouro
    this.considerResearch();

    // 7. F3-05: repara construções danificadas
    this.considerRepair();
  }

  /**
   * F3-05: construção concluída com PV < 70 %, sem ataque nos últimos 6 s e sem reparador,
   * recebe 1 trabalhador ocioso (CMD.REPAIR). Só age se o dono pagar ao menos um golpe.
   */
  considerRepair() {
    const pid = this.director.playerId;
    const owner = this.gm.getPlayer(pid);
    if (!owner) return;
    const buildings = this.gm.buildings;
    const units = this.director.getOwnUnits();
    const assigned = new Set();
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId !== pid || b.isDead || !b.isConstructed) continue;
      if (b.hp >= b.maxHp * 0.7 || b.underAttackTimer > 0) continue;
      if (this.gm.countWorkersOn(b) > 0) continue;
      const hit = repairCostFor({ hp: b.maxHp, cost: b.cost }, b.maxHp * REPAIR_HP_FRACTION);
      if (!owner.canAfford(hit)) continue;
      let worker = null;
      for (let j = 0; j < units.length; j++) {
        const u = units[j];
        if (!u.isDead && u.type === this.director.workerType && u.state === 'idle' && !assigned.has(u.id)) {
          worker = u;
          break;
        }
      }
      if (!worker) return;
      assigned.add(worker.id);
      this.gm.issue({ type: CMD.REPAIR, playerId: pid, unitIds: [worker.id], buildingId: b.id });
    }
  }

  /**
   * F3-07: com Forja/Serraria concluídas e ociosas, pesquisa (nível 1 com ouro > 400 de sobra;
   * nível 2 exige Centro nível 2 — checado pelos requisitos). `ranged_class` com ≥ 4 atiradores
   * e Centro nível 2. O débito/validação final é do executor (CMD.RESEARCH).
   */
  considerResearch() {
    const buildings = this.gm.buildings;
    const pid = this.director.playerId;
    const player = this.director.player;
    let rangedCount = 0;
    const units = this.director.getOwnUnits();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.isDead && getUnitDef(u.type).isRanged) rangedCount++;
    }
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId !== pid || b.isDead || !b.isConstructed || b.currentResearch) continue;
      const def = getBuildingDef(b.type);
      const role = def.role;
      let plan = null;
      if (role === 'forge') plan = ['melee_weapons', 'melee_armor'];
      else if (role === 'lumber') plan = ['ranged_class', 'ranged_ammo', 'woodcutting'];
      if (!plan) continue;
      for (const id of plan) {
        const research = RESEARCH[id];
        if (!research || (research.faction && research.faction !== def.faction)) continue;
        const lv = player.getResearchLevel(id);
        if (lv >= research.levels.length) continue;
        if (this.gm.isUpgradeResearching(id, pid)) continue;
        if (id === 'ranged_class' && rangedCount < 4) continue;
        if (missingUpgradeRequirements(pid, id, this.gm, lv + 1).length > 0) continue;
        const cost = research.levels[lv].cost;
        if (!this.director.canAfford(cost)) continue;
        if (id !== 'ranged_class' && player.resources.gold <= 400) continue;
        this.gm.issue({ type: CMD.RESEARCH, playerId: pid, buildingId: b.id, upgradeId: id });
        break;
      }
    }
  }

  /**
   * F3-06: evolui o Centro para o próximo nível quando a base já tem Quartel + Forja
   * concluídos, ≥8 trabalhadores vivos e sobram recursos para o custo do upgrade. Nunca
   * enfileira treino no Centro enquanto ele estiver em upgrade (`manageWorkerRecruitment`
   * já barra isso via `hq.tierUpgrade`).
   */
  considerHqUpgrade() {
    const buildings = this.gm.buildings;
    const lenB = buildings.length;
    let hq = null;
    let hasForge = false;
    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.ownerId === this.director.playerId && !b.isDead) {
        if (!hq && b.type === this.director.hqType && b.isConstructed) hq = b;
        if (b.type === this.director.forgeType && b.isConstructed) hasForge = true;
      }
    }
    if (!hq || hq.tier >= 3 || hq.tierUpgrade) return;
    if (this.getLivingWorkerCount() < 8) return;
    if (!this.director.getConstructedBarracks() || !hasForge) return;

    const cost = getHqUpgradeCost(hq.tier + 1);
    if (!cost || !this.director.canAfford(cost)) return;

    // F2-02: comando UPGRADE_HQ — o débito/validação final é do executor.
    this.gm.issue({ type: CMD.UPGRADE_HQ, playerId: this.director.playerId, buildingId: hq.id });
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
    // (F2-02: comando BUILD).
    if (!hasBuilder && candidateWorker) {
      this.gm.issue({
        type: CMD.BUILD,
        playerId: this.director.playerId,
        unitIds: [candidateWorker.id],
        buildingId: incomplete.id
      });
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
    // F3-06: Centro em upgrade de nível não treina (fila pausada — ver `Building.queueUnit`).
    if (hq.tierUpgrade) return;

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
    // (F2-02: comando TRAIN — a dedução real acontece no executor).
    if (hq.queue && hq.queue.length < 2 && this.director.canAfford(this.director.costs.worker)) {
      this.gm.issue({
        type: CMD.TRAIN,
        playerId: this.director.playerId,
        buildingId: hq.id,
        unitType: this.director.workerType
      });
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
    // F2-02: sem dedução aqui — o custo é cobrado no CommandExecutor (PLACE_BUILDING).
    if (uHousing >= 0.85 || this.director.population >= this.director.maxPopulation) {
      if (this.director.canAfford(this.director.costs.farm)) {
        const chosenType = (this.director.faction === 'orc' && this.director.rng.next() < 0.45)
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
    let hasStable = false;
    let towerCount = 0;

    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.ownerId === this.director.playerId && !b.isDead) {
        if (b.type === this.director.barracksType) hasBarracks = true;
        if (b.type === this.director.lumberType) hasLumber = true;
        if (b.type === this.director.forgeType) hasForge = true;
        if (b.type === this.director.stableType) hasStable = true;
        if (b.type === this.director.towerType) towerCount++;
      }
    }

    // F3-04: Quartel exige Fazenda/Chiqueiro concluída (`missingRequirements` — mesma regra
    // que `GameManager.placeBuilding` valida). Se faltar, a IA constrói a Fazenda primeiro em
    // vez de insistir num Quartel que `placeBuilding` vai recusar sem consumir recursos.
    if (!hasBarracks) {
      const missing = missingRequirements(this.director.playerId, this.director.barracksType, this.gm);
      if (missing.length > 0) {
        if (this.director.canAfford(this.director.costs.farm)) {
          this.placeBuilding(this.director.farmType);
        }
        return;
      }
      if (this.director.canAfford(this.director.costs.barracks)) {
        this.placeBuilding(this.director.barracksType);
        return;
      }
    }

    // 3. LUMBER MILL: Enhanced wood harvesting & dropoff (requires at least 4 workers)
    if (workerCount >= 4 && !hasLumber && this.director.canAfford(this.director.costs.lumber)) {
      this.placeBuilding(this.director.lumberType);
      return;
    }

    // 4. SECONDARY HOUSING: Maintain population headroom as army grows
    if (this.director.population >= this.director.maxPopulation - 3 && this.director.canAfford(this.director.costs.farm)) {
      const chosenType = (this.director.faction === 'orc' && this.director.rng.next() < 0.5)
        ? this.director.houseType
        : this.director.farmType;
      this.placeBuilding(chosenType);
      return;
    }

    // 5. WAR FORGE: forja de pesquisas — necessária para o Centro evoluir (F3-06,
    // `considerHqUpgrade`); antes só a IA orc construía, agora as duas facções (requer ≥5 workers).
    if (workerCount >= 5 && hasBarracks && !hasForge && this.director.canAfford(this.director.costs.forge)) {
      this.placeBuilding(this.director.forgeType);
      return;
    }

    // 5b. F4-01: Estábulo/Covil quando o Centro é nível 2 (requisito checado por
    // `missingRequirements`), sobra ≥ 600 de ouro e já há ≥ 6 combatentes.
    if (hasBarracks && !hasStable && this.director.resources.gold >= 600 &&
        this.director.getCombatUnitCount() >= 6 && this.director.canAfford(this.director.costs.stable) &&
        missingRequirements(this.director.playerId, this.director.stableType, this.gm).length === 0) {
      this.placeBuilding(this.director.stableType);
      return;
    }

    // 6. WATCHTOWERS: Perimeter defense against player incursions (requires at least 5 workers)
    if (workerCount >= 5 && towerCount < 2 && this.director.canAfford(this.director.costs.tower)) {
      this.placeBuilding(this.director.towerType);
      return;
    }

    // 7. WALL LINE (F3-08): com trabalhadores e recursos sobrando, uma linha curta de muralha na
    // frente do Centro, na direção do inimigo (só nas dificuldades Normal/Difícil/Brutal).
    if (workerCount >= 8 && hasBarracks && towerCount >= 1) {
      this.considerWallLine();
    }
  }

  /**
   * F3-08: constrói (uma única vez por partida) uma linha de até 6 segmentos de muralha a ~16
   * unidades do Centro, perpendicular à direção do Centro inimigo mais próximo. Só com sobra de
   * madeira/pedra (não compete com Quartel/Forja/Torres, que vêm antes em `manageBuildingPlacement`).
   */
  considerWallLine() {
    if (this._wallLineDone || this._wallAttempts >= 3) return;
    const diff = this.gm.matchConfig ? this.gm.matchConfig.difficulty : 'normal';
    if (diff === 'easy') return;

    const wallType = this.director.faction === 'orc' ? 'wall_orc' : 'wall_human';
    const unit = getBuildingDef(wallType).cost;
    const SEGMENTS = 6;
    const res = this.director.resources;
    if (res.wood < unit.wood * SEGMENTS + 120 || res.stone < unit.stone * SEGMENTS + 80) return;

    const me = this.director.baseCenter;
    const myId = this.director.playerId;
    let enemyHq = null;
    let best = Infinity;
    for (const b of this.gm.buildings) {
      if (b.isDead || b.role !== 'hq' || !this.gm.isHostile(myId, b.ownerId)) continue;
      const d = Math.hypot(b.mesh.position.x - me.x, b.mesh.position.z - me.y);
      if (d < best) { best = d; enemyHq = b; }
    }
    if (!enemyHq) return;
    this._wallAttempts++;

    const dx = enemyHq.mesh.position.x - me.x;
    const dz = enemyHq.mesh.position.z - me.y;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    const px = -fz; // perpendicular à direção do inimigo
    const pz = fx;
    const cx = me.x + fx * 16;
    const cz = me.y + fz * 16;
    const points = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const off = (i - (SEGMENTS - 1) / 2) * WALL_STEP;
      const x = Math.round((cx + px * off) * 100) / 100;
      const z = Math.round((cz + pz * off) * 100) / 100;
      if (this.gm.canPlaceBuilding(wallType, x, z, null, myId)) points.push({ x, z });
    }
    if (points.length < 3) return;

    const workers = this.director.getOwnUnits()
      .filter(w => !w.isDead && w.type === this.director.workerType)
      .sort((a, b) => {
        const da = Math.hypot(a.mesh.position.x - cx, a.mesh.position.z - cz) + (a.state === 'idle' ? 0 : 50);
        const db = Math.hypot(b.mesh.position.x - cx, b.mesh.position.z - cz) + (b.state === 'idle' ? 0 : 50);
        return da - db || a.id - b.id;
      })
      .slice(0, 2)
      .map(w => w.id);
    this.gm.issue({ type: CMD.PLACE_WALL, playerId: myId, buildingType: wallType, points, unitIds: workers });
    this._wallLineDone = true;
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

    // F3-04: mina de ouro só tem 1 vaga por vez (`MINE_SLOTS.gold`) — excedente de mineiros só
    // ficaria esperando na fila sem coletar. Limita ~5 por mina (folga para revezar viagens) e
    // manda o excedente para madeira em vez de empilhar peões ociosos na fila.
    const GOLD_WORKERS_PER_MINE_CAP = 5;
    if (targetGold > GOLD_WORKERS_PER_MINE_CAP) {
      targetWood += targetGold - GOLD_WORKERS_PER_MINE_CAP;
      targetGold = GOLD_WORKERS_PER_MINE_CAP;
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

        if (e.state === 'building' || e.state === 'repairing') {
          // Worker is busy building scaffold (or repairing, F3-05); do not interrupt
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
        this.gm.issue({ type: CMD.GATHER, playerId: this.director.playerId, unitIds: [w.id], targetId: resEntity.id });
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
        this.gm.issue({ type: CMD.GATHER, playerId: this.director.playerId, unitIds: [candidate.id], targetId: resEntity.id });
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
   * Finds an unobstructed, valid placement spot around the base and orders a worker to
   * construct it. F2-02: emite PLACE_BUILDING em vez de `createBuilding`+push — a construção
   * (e a dedução do custo) só acontece de fato no `CommandExecutor`, no tick de execução.
   * @param {string} type
   */
  placeBuilding(type) {
    let chosenX = null;
    let chosenZ = null;
    const baseCenter = this.director.baseCenter;

    // Search radially around base center for a valid placement location
    for (let attempt = 0; attempt < 45; attempt++) {
      const angle = (attempt * 0.45) + (this.director.rng.next() * 0.3);
      const dist = 11.5 + (attempt % 3) * 4.5 + this.director.rng.next() * 3.0;
      const testX = baseCenter.x + Math.cos(angle) * dist;
      const testZ = baseCenter.y + Math.sin(angle) * dist;

      if (this.gm.canPlaceBuilding(type, testX, testZ)) {
        chosenX = testX;
        chosenZ = testZ;
        break;
      }
    }

    // Nenhum local livre neste ciclo: nada foi deduzido ainda, então não há reembolso a fazer.
    if (chosenX === null) return;

    // Escolhe o construtor mais próximo (mesmo critério de antes) para já mandar no comando;
    // o executor cai de volta no vilão/peão mais próximo do dono se `unitIds` vier vazio.
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

    this.gm.issue({
      type: CMD.PLACE_BUILDING,
      playerId: this.director.playerId,
      buildingType: type,
      x: chosenX,
      z: chosenZ,
      unitIds: nearestWorker ? [nearestWorker.id] : []
    });
  }
}
