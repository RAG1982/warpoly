import { AIEconomyManager } from './AIEconomyManager.js';
import { AIMilitaryManager } from './AIMilitaryManager.js';
import { AIPerception } from './AIPerception.js';
import { AIMicroManager } from './AIMicroManager.js';
import { getAIProfile } from './AIProfile.js';
import { pickStrategy } from './AIStrategy.js';
import { SIM_DT } from '../sim/constants.js';
import { EVT } from '../sim/events.js';
import { FACTIONS, getBuildingDef, getCost, getTrainCost } from '../data/index.js';

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
   * @param {number} playerId  id do Player controlado por esta IA (F2-01): facção, recursos e
   *                           população vêm de `gm.getPlayer(playerId)` — sem cópia própria.
   * @param {{x:number,y:number}} baseCenter  centro da base no plano (`y` = coordenada Z do mundo)
   * @param {string} [difficulty]  'easy' | 'normal' | 'hard' | 'brutal' (F5-03; ver `AIProfile.js`)
   */
  constructor(gameManager, playerId, baseCenter = { x: -32, y: 30 }, difficulty = 'normal') {
    this.gm = gameManager;
    this.playerId = playerId;
    /** @type {import('../sim/Player.js').Player} */
    this.player = gameManager.getPlayer(playerId);
    if (!this.player) throw new Error(`AIDirector: jogador ${playerId} inexistente`);
    const faction = this.player.factionId;
    this.faction = faction;
    this.baseCenter = baseCenter;

    // F2-03: RNG determinístico próprio desta IA, derivado de `gm.rng` — todas as decisões da
    // IA que envolvem sorteio (tipo de construção, posição de tentativa, unidade a treinar)
    // usam `this.rng`, nunca `Math.random`.
    this.rng = gameManager.rng ? gameManager.rng.fork('ai:' + playerId) : null;

    // F5-03: perfil de dificuldade (APM, reação, micro, bônus) e F5-04: estratégia sorteada pelo RNG da IA.
    this.profile = getAIProfile(difficulty);
    this.difficulty = this.profile.id;
    this.strategy = pickStrategy(this.rng, this.profile);
    /** F5-03: balde de fichas de APM (1 comando = 1 ficha; reposição `maxApm/60` por segundo). */
    this._apmCap = Math.max(4, this.profile.maxApm / 6);
    this._apmTokens = this._apmCap;
    this.commandsIssued = 0;
    this.commandsDropped = 0;
    /** Unidades reservadas (explorador, assédio) que o exército principal não deve mexer. */
    this._reserved = new Set();
    this.simTime = 0;
    this._lastEco = -1e9;

    // Faction archetypes (src/data/factions.js)
    const f = faction === 'orc' ? FACTIONS.orc : FACTIONS.human;
    this.workerType = f.units.worker;
    this.meleeType = f.units.melee;
    this.rangedType = f.units.ranged;
    this.siegeType = f.units.siege;
    this.cavalryType = f.units.cavalry; // F4-01
    this.suicideType = f.units.suicide; // F4-05: Sapadores / Incendiários

    this.hqType = f.hq;
    this.barracksType = f.barracks;
    // "Fazenda" da IA = construção de população: a fazenda da facção se ela der pop, senão a casa.
    this.farmType = getBuildingDef(f.farm).popGranted > 0 ? f.farm : f.house;
    this.houseType = f.house;
    this.lumberType = f.lumber;
    this.towerType = f.tower;
    this.forgeType = f.forge;
    this.stableType = f.stable; // F4-01: Estábulo Real / Covil dos Ogros
    this.workshopType = f.workshop; // F4-02: Oficina de Engenharia / dos Engenhoqueiros
    this.arcaneType = f.arcane; // F4-04: Torre Arcana / Santuário das Cinzas
    this.casterType = f.units.caster; // F4-04: Mago / Necromante

    // Costs configuration — derivados dos dados reais (corrige B3: antes eram números próprios da IA)
    this.costs = {
      worker: getTrainCost(this.workerType),
      melee: getTrainCost(this.meleeType),
      ranged: getTrainCost(this.rangedType),
      siege: getTrainCost(this.siegeType),
      cavalry: getTrainCost(this.cavalryType),
      suicide: getTrainCost(this.suicideType),
      farm: getCost(this.farmType),
      house: getCost(this.houseType),
      barracks: getCost(this.barracksType),
      lumber: getCost(this.lumberType),
      tower: getCost(this.towerType),
      forge: getCost(this.forgeType),
      stable: getCost(this.stableType),
      workshop: getCost(this.workshopType),
      arcane: getCost(this.arcaneType),
      caster: getTrainCost(this.casterType)
    };

    // Tick Timer (Exact 1.0 second evaluation interval)
    this.tickTimer = 0;
    this.TICK_INTERVAL = this.profile.tickInterval;

    // Utility Scores (0.0 to 1.0)
    this.utilities = {
      eco: 0.6,
      housing: 0.2,
      def: 0.0,
      mil: 0.0
    };

    // Sub-Managers
    this.perception = new AIPerception(this); // F5-02
    this.economyManager = new AIEconomyManager(this);
    this.militaryManager = new AIMilitaryManager(this);
    this.microManager = new AIMicroManager(this); // F5-05

    // F5-03: bônus de coleta (só Brutal) — soma uma fração de cada coleta do próprio jogador.
    this._bonusAcc = { gold: 0, wood: 0, stone: 0 };
    this._onGather = null;
    if (this.profile.resourceBonus > 0 && gameManager.events) {
      this._onGather = (e) => {
        if (e.ownerId !== this.playerId || e.passive || !(e.amount > 0)) return;
        const acc = this._bonusAcc;
        if (acc[e.type] === undefined) return;
        acc[e.type] += e.amount * this.profile.resourceBonus;
        const whole = Math.floor(acc[e.type]);
        if (whole > 0) { acc[e.type] -= whole; this.player.add(e.type, whole); }
      };
      gameManager.events.on(EVT.RESOURCE_GATHERED, this._onGather);
    }

    // Buffer reutilizado pela consulta de intrusos (F1-06: gm.unitGrid.queryRadius).
    this._intruderBuf = [];
  }

  // --- Comandos (F5-01/F5-03): única saída da IA para a simulação ---

  /**
   * Emite um comando com o `playerId` desta IA, respeitando o orçamento de APM da dificuldade.
   * Devolve o retorno de `gm.issue` ou `null` se o orçamento acabou (a decisão é refeita no próximo tick).
   */
  issue(fields) {
    if (this._apmTokens < 1) { this.commandsDropped++; return null; }
    this._apmTokens -= 1;
    this.commandsIssued++;
    return this.gm.issue(fields.playerId === undefined ? { ...fields, playerId: this.playerId } : fields);
  }

  reserve(id) { this._reserved.add(id); }
  unreserve(id) { this._reserved.delete(id); }
  isReserved(id) { return this._reserved.has(id); }

  /** Ponto de reunião do exército (fora dos portões). */
  militaryRally() { return this.militaryManager.assemblyRallyPoint; }

  dispose() {
    if (this._onGather && this.gm.events) this.gm.events.off(EVT.RESOURCE_GATHERED, this._onGather);
    this._onGather = null;
  }

  // --- Economia: tudo delega ao Player (F2-01) ---

  /** Recursos do jogador da IA (mesmo objeto de Player.resources). */
  get resources() {
    return this.player.resources;
  }

  get population() {
    return this.player.population;
  }

  get maxPopulation() {
    return this.player.maxPopulation;
  }

  canAfford(cost) {
    return this.player.canAfford(cost);
  }

  deduct(cost) {
    this.player.deduct(cost);
  }

  addResource(type, amount) {
    this.player.add(type, amount);
  }

  /** Unidades próprias (vivas ou morrendo). */
  getOwnUnits() {
    return this.gm.getUnitsOf(this.playerId);
  }

  /** Unidades de jogadores hostis a esta IA. */
  getHostileUnits() {
    return this.gm.getHostileUnitsOf(this.playerId);
  }

  /** Construção pertence a esta IA. */
  owns(entity) {
    return entity.ownerId === this.playerId;
  }

  /**
   * Returns current count of living own combat units
   * @returns {number}
   */
  getCombatUnitCount() {
    const enemies = this.getOwnUnits();
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
      if (b.ownerId === this.playerId && b.type === this.barracksType && b.isConstructed && !b.isDead) {
        return b;
      }
    }
    return null;
  }

  /** F5-04: todos os quartéis concluídos e vivos da IA (ordem de `gm.buildings`). */
  getConstructedBarracksList() {
    const out = [];
    const buildings = this.gm.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === this.playerId && b.type === this.barracksType && b.isConstructed && !b.isDead) out.push(b);
    }
    return out;
  }

  /** F4-04: Torre Arcana/Santuário concluído e vivo da IA (ou null). */
  getConstructedArcane() {
    const buildings = this.gm.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === this.playerId && b.type === this.arcaneType && b.isConstructed && !b.isDead) return b;
    }
    return null;
  }

  /** F4-01: Estábulo/Covil concluído e vivo da IA (ou null). */
  getConstructedStable() {
    const buildings = this.gm.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === this.playerId && b.type === this.stableType && b.isConstructed && !b.isDead) return b;
    }
    return null;
  }

  /** F4-02: Oficina concluída e viva da IA (ou null). */
  getConstructedWorkshop() {
    const buildings = this.gm.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === this.playerId && b.type === this.workshopType && b.isConstructed && !b.isDead) return b;
    }
    return null;
  }

  /**
   * Recalculates total population and population capacity strictly from living entities
   */
  recalculatePop() {
    this.player.recalculatePop(this.gm);
  }

  /**
   * Evaluates dynamic utility curves based on real-time game state
   */
  evaluateUtilities() {
    const enemies = this.getOwnUnits();

    // --- 1. Defense Utility (U_def) ---
    // Detect hostile units threatening this AI's base territory (within 26 units of base center;
    // F1-06: gm.unitGrid.queryRadius no lugar de varrer todas as unidades hostis do mapa)
    const gm = this.gm;
    const intruders = gm.unitGrid.queryRadius(
      this.baseCenter.x, this.baseCenter.y, 26,
      u => !u.isDead && gm.isHostile(this.playerId, u.ownerId),
      this._intruderBuf
    );
    const intrudersNearBase = intruders.length;

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
    this._apmTokens = Math.min(this._apmCap, this._apmTokens + dt * this.profile.maxApm / 60);
    if (this.tickTimer < this.TICK_INTERVAL) return;
    this.tickTimer = 0;
    this.simTime = this.gm.currentTick * SIM_DT;

    // 0. F5-02: atualiza o conhecimento sob a névoa e gerencia o explorador
    this.perception.update();
    this.perception.manageScout();

    // 1. Recalculate population limit and head count
    this.recalculatePop();

    // 2. Score utility curves
    this.evaluateUtilities();

    // 3. Coordinate Homeland Defense
    this.militaryManager.updateDefense(this.utilities.def);

    // 4. Coordinate Economy, Gathering, and City Construction — cadência própria (>= 1 s): reagir mais rápido
    // não deve significar mexer mais nos trabalhadores (o atraso de reação vale para defesa/micro/ataque).
    if (this.simTime - this._lastEco >= 1.0 - 1e-6) {
      this._lastEco = this.simTime;
      this.economyManager.update(this.utilities.eco, this.utilities.housing);
    }

    // 5. Coordinate Army Recruitment & Military Assault Expeditions
    this.militaryManager.update(this.utilities.mil);

    // 6. F5-05: micro tático
    this.microManager.update();
  }
}
