import * as THREE from 'three';

/**
 * AIMilitaryManager (Gerenciador Militar e Ofensivo da IA)
 * 
 * Gerencia a segurança da base (defesa contra invasores), o recrutamento
 * balanceado de infantaria/arqueiros/ogros no Quartel e a montagem de esquadrões
 * de expedição militar em direção ao reino do jogador.
 * 
 * Prevenção estrita de gargalos de CPU/GC:
 * - Emissão em lote de orderAttack via loops indexados rápidos.
 * - Reutilização de buffers internos pré-alocados para evitar instanciações
 *   de novos arrays a cada ciclo de 1.0 segundo.
 */
export class AIMilitaryManager {
  /**
   * @param {import('./AIDirector.js').AIDirector} director
   */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;

    // Staging rally point outside base gates
    const baseCenter = director.baseCenter;
    this.assemblyRallyPoint = new THREE.Vector3(
      baseCenter.x + (baseCenter.x < 0 ? 12 : -12),
      0,
      baseCenter.y + (baseCenter.y < 0 ? 12 : -12)
    );

    // Dynamic expedition threshold (starts with 4 troops, cycles 4 -> 5 -> 6 -> 4...)
    this.attackThreshold = 4;
    this.strikeWaveNumber = 1;

    // Pre-allocated squad buffers to eliminate Garbage Collector pauses
    this.readySquadBuffer = new Array(64);
    this.readySquadCount = 0;
  }

  /**
   * Evaluates base defense and commands combat units to repel invaders
   * @param {number} uDef 
   */
  updateDefense(uDef) {
    if (uDef <= 0) return;

    const baseCenter = this.director.baseCenter;
    const playerUnits = this.gm.units;
    const lenP = playerUnits.length;
    let closestIntruder = null;
    let minIntruderDistSq = 676; // 26^2

    // Locate closest intruder
    for (let i = 0; i < lenP; i++) {
      const u = playerUnits[i];
      if (!u.isDead) {
        const dx = u.mesh.position.x - baseCenter.x;
        const dz = u.mesh.position.z - baseCenter.y;
        const dSq = dx * dx + dz * dz;
        if (dSq < minIntruderDistSq) {
          minIntruderDistSq = dSq;
          closestIntruder = u;
        }
      }
    }

    if (!closestIntruder) return;

    // Dispatch idle or moving combat troops to intercept the intruder
    const enemies = this.gm.enemies;
    const lenE = enemies.length;
    const workerType = this.director.workerType;

    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type !== workerType) {
        if (e.state === 'idle' || e.state === 'moving') {
          e.orderAttack(closestIntruder);
        }
      }
    }
  }

  /**
   * Main military update: recruits troops and coordinates strike expeditions
   * @param {number} uMil 
   */
  update(uMil) {
    // 1. Train military reinforcements at the Barracks
    this.manageTraining();

    // 2. Coordinate and dispatch military expedition squads if threshold reached
    if (uMil >= 0.8) {
      this.manageMilitaryExpedition();
    }
  }

  /**
   * Recruits Grunts/Knights, Axethrowers/Archers, or Ogres at the Barracks
   */
  manageTraining() {
    if (this.director.population >= this.director.maxPopulation) return;

    // Strict Economic Protection: never starve peon recovery when workforce is critically low
    const eco = this.director.economyManager;
    if (eco) {
      if (eco.isWorkerEmergency()) {
        return; // Full recruitment freeze while recovering workforce (< 3 peons)
      }
      if (!eco.canAffordMilitaryRecruitment()) {
        return; // Hold resource reserve for peons until workforce is mature
      }
    }

    const barracks = this.director.getConstructedBarracks();
    if (!barracks) return;
    if (barracks.queue && barracks.queue.length >= 2) return;

    // Assess army balance
    const enemies = this.gm.enemies;
    const lenE = enemies.length;
    let meleeCount = 0;
    let rangedCount = 0;

    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead) {
        if (e.type === this.director.meleeType) meleeCount++;
        else if (e.type === this.director.rangedType) rangedCount++;
      }
    }

    let recruitType = null;
    const canMelee = this.director.canAfford(this.director.costs.melee);
    const canRanged = this.director.canAfford(this.director.costs.ranged);
    const canSiege = this.director.canAfford(this.director.costs.siege);

    // Defense priority: If base has ZERO combat units, train whatever combat unit is affordable!
    if (meleeCount === 0 && rangedCount === 0) {
      if (canMelee) {
        recruitType = this.director.meleeType;
      } else if (canRanged) {
        recruitType = this.director.rangedType;
      } else {
        return;
      }
    } else {
      // Balanced tactical recruitment
      if (canSiege && Math.random() < 0.25) {
        recruitType = this.director.siegeType;
      } else if (rangedCount < meleeCount && canRanged) {
        recruitType = this.director.rangedType;
      } else if (canMelee) {
        recruitType = this.director.meleeType;
      } else if (canRanged) {
        recruitType = this.director.rangedType;
      } else {
        return; // Cannot afford currently
      }
    }

    // Official queueUnit call
    const queued = barracks.queueUnit(recruitType, this.gm);
    if (queued) {
      barracks.setRallyPoint(this.assemblyRallyPoint);
    }
  }

  /**
   * Gathers assembled troops without GC allocations and launches batch march orders
   */
  manageMilitaryExpedition() {
    const enemies = this.gm.enemies;
    const lenE = enemies.length;
    const workerType = this.director.workerType;

    // Fill reusable buffer with ready combat units (idle or moving)
    this.readySquadCount = 0;
    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (!e.isDead && e.type !== workerType) {
        if (e.state === 'idle' || e.state === 'moving') {
          if (this.readySquadCount < this.readySquadBuffer.length) {
            this.readySquadBuffer[this.readySquadCount++] = e;
          }
        }
      }
    }

    if (this.readySquadCount < this.attackThreshold) {
      return;
    }

    // Select primary strategic target in player territory
    const target = this.selectExpeditionTarget();
    if (!target) return;

    // Trigger audible alarm and UI battle notification
    if (this.gm.soundManager) {
      this.gm.soundManager.playAlarm();
    }
    if (this.gm.uiManager) {
      const factionName = this.director.faction === 'orc' ? 'Horda Orc' : 'Aliança Humana';
      this.gm.uiManager.showNotification(`⚔️ A ${factionName} reuniu um esquadrão de guerra (${this.readySquadCount} tropas) e avança contra sua base!`);
    }

    // BATCH DISPATCH: Fast indexed loop without allocating closures or arrays
    const count = this.readySquadCount;
    for (let i = 0; i < count; i++) {
      this.readySquadBuffer[i].orderAttack(target);
      this.readySquadBuffer[i] = null; // Clear reference for GC hygiene
    }
    this.readySquadCount = 0;

    // Update threshold for subsequent wave
    this.strikeWaveNumber++;
    this.attackThreshold = 3 + (this.strikeWaveNumber % 4); // 4, 5, 6, 3...
  }

  /**
   * Prioritizes high-value tactical targets:
   * 1. Forward Watchtowers / Outposts
   * 2. Player Capital (Castle / Great Hall)
   * 3. Any living player building
   * 4. Any living player troop
   */
  selectExpeditionTarget() {
    const buildings = this.gm.buildings;
    const lenB = buildings.length;
    const enemyBase = this.director.baseCenter;

    let closestTower = null;
    let minTowerDistSq = Infinity;
    let playerHQ = null;
    let anyPlayerBuilding = null;
    const targetHqType = this.director.faction === 'orc' ? 'castle' : 'great_hall';

    for (let i = 0; i < lenB; i++) {
      const b = buildings[i];
      if (b.faction === 'player' && !b.isDead) {
        if (!anyPlayerBuilding) anyPlayerBuilding = b;

        if (b.type === targetHqType) {
          playerHQ = b;
        }

        if (b.type === 'watchtower' || b.type === 'orc_watchtower') {
          const dx = b.mesh.position.x - enemyBase.x;
          const dz = b.mesh.position.z - enemyBase.y;
          const dSq = dx * dx + dz * dz;
          if (dSq < minTowerDistSq) {
            minTowerDistSq = dSq;
            closestTower = b;
          }
        }
      }
    }

    // Priority hierarchy
    if (closestTower) return closestTower;
    if (playerHQ) return playerHQ;
    if (anyPlayerBuilding) return anyPlayerBuilding;

    // Fallback: attack nearest player unit
    const playerUnits = this.gm.units;
    const lenP = playerUnits.length;
    for (let i = 0; i < lenP; i++) {
      if (!playerUnits[i].isDead) {
        return playerUnits[i];
      }
    }

    return null;
  }
}
