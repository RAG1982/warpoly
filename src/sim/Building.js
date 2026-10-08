import { isDetectedBy } from './detection.js';
import { canTarget } from './targeting.js';
import { Projectile } from './projectiles.js';
import { UPGRADE_CONFIG, RESEARCH } from '../data/index.js';
import { legacyOwnerId } from './EntityIds.js';
import { EVT } from './events.js';
import { computeDamage } from './combat.js';
import { WATER_LEVEL } from '../data/combat.js';
import { repairCostFor, cancelRefundFor, REPAIR_HP_FRACTION, CONSTRUCTION_MIN_HP_FRACTION } from './repair.js';

/** Vector3 → objeto plano `{x,y,z}` (payload de evento: nunca referências a objetos three.js). */
function posOf(v) {
  return { x: v.x, y: v.y, z: v.z };
}

import {
  getBuildingDef,
  getUnitDef,
  getBuildingStats as getBuildingStatsFromData,
  isWorkerType,
  UNIT_TRAIN_CONFIG,
  BUILDING_BUILD_CONFIG,
  WORKER_BUILD_LIST,
  HQ_TIER_HP,
  getHqUpgradeCost
} from '../data/index.js';
import { Body, Vec3 } from './Body.js';
import { missingUnitRequirements, missingUpgradeRequirements } from './requirements.js';

// Tabelas derivadas de src/data (F0-06). Reexportadas com os nomes legados porque
// UIManager, InputManager e outros módulos importam daqui.
export { UNIT_TRAIN_CONFIG, BUILDING_BUILD_CONFIG, WORKER_BUILD_LIST };

// F1-08: vetor de módulo reutilizado por frame (evita alocação em simUpdate)
const _towerArrowStart = { x: 0, y: 0, z: 0 };

export class Building {
  /**
   * F2-08c: entidade de simulação pura (sem three.js). A malha vive em `src/render/BuildingView.js`
   * (criada pela `EntityViews`); `mesh` é um `Body` (`position`, `visible`, `userData.entity`).
   * @param {{getHeight: (x:number, z:number) => number}} terrain
   * @param {number|'player'|'enemy'} [owner]  ownerId do Player dono (F2-01); aceita o lado legado.
   */
  constructor(terrain, type, x, z, isConstructed = true, owner = 0) {
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
    /** Papel da construção (`hq`, `house`, `wall`…), de src/data/buildings.js. */
    this.role = getBuildingDef(type).role || null;
    /** F4-07a: construção costeira (Estaleiro/Refinaria/Fundição — bloqueia a grade naval) e ponto de saída dos navios (`GameManager.getDockPoint`). */
    this.coastal = !!getBuildingDef(type).coastal;
    this.dockPoint = null;
    /** F4-07a: poço (`ResourceDeposit`) sob uma plataforma de petróleo. */
    this.deposit = null;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    // F3-05: obra nasce com 10 % do PV e ganha PV proporcional ao progresso (ver `construct`).
    if (!isConstructed) this.hp = Math.max(1, Math.round(stats.hp * CONSTRUCTION_MIN_HP_FRACTION));
    /** F3-05: nº de trabalhadores com esta construção como alvo (recalculado por tick no GameManager). */
    this.workerCount = 0;
    this.cost = stats.cost;
    this.popGranted = stats.popGranted || 0;
    // F3-03: armadura da construção (corrige B5 — antes não existia). `towerDamage` é o
    // dano da torre em {basic, piercing, type}; `attackDamage` continua como soma derivada
    // (leitura legada da HUD).
    this.armor = stats.armor || 0;
    this.attackRange = stats.attackRange || 0;
    this.towerDamage = stats.towerDamage ? { ...stats.towerDamage } : null;
    /** F4-06: torres de arqueiros (`tower.hitsAir`) atingem aéreos (`canTarget`). Construções não atacam por outro meio. */
    const towerCfg = getBuildingDef(type).tower;
    this.canHitAir = !!(towerCfg && towerCfg.hitsAir);
    this.canHitGround = true;
    this.canHitNaval = !!towerCfg; // F4-07: torres atingem navios ao alcance
    this.attackDamage = stats.attackDamage || 0;
    this.collisionRadius = stats.collisionRadius || 3.0;
    this.attackCooldown = stats.attackCooldown;
    this.attackTimer = 0;

    // Training / Production queue & Research
    this.queue = [];
    this.currentResearch = null;
    this.researchSoundTimer = 0;

    // F3-06: nível do Centro (`role: 'hq'`). Outras construções ficam em `tier: 1` fixo
    // (campo presente por uniformidade, nunca sobe).
    this.tier = 1;
    /** @type {{targetTier:number, progress:number, totalTime:number, cost:object}|null} */
    this.tierUpgrade = null;
    const rallyDist = this.collisionRadius + 2.5;
    this.rallyPoint = new Vec3(x + (this.type === 'castle' ? 0 : 2.0), 0, z + rallyDist);
    this.rallyPoint.y = this.terrain.getHeight(this.rallyPoint.x, this.rallyPoint.z);
    /** Bandeira do ponto de reunião visível? (lida pela `BuildingView`) */
    this.rallyShown = false;

    this.passiveTimer = 0;

    // Corpo de simulação (a malha 3D é da `BuildingView`).
    // F4-07a: a plataforma fica no mar — a base do modelo é o nível da água (o fundo do mar é fundo demais para o Y).
    this.mesh = new Body(x, this.role === 'platform' ? WATER_LEVEL : this.terrain.getHeight(x, z), z);
    this.mesh.userData.entity = this;

    this.isSelected = false;
    /** Já sofreu dano de combate (obra em andamento só mostra chamas de dano depois disso). */
    this.wasDamaged = false;
    this.isDead = false;
    this.isDisposed = false;
    this.underAttackTimer = 0;
  }

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

  /** Compat (F2-08c): a barra de vida é desenhada pela `BuildingView` a cada quadro; mantido para ferramentas/testes antigos. */
  updateHealthBar() {}

  /** Compat (F2-08c): as chamas de dano são da `BuildingView` (lêem `hp`/`isDead`). */
  updateDamageFlames() {}

  setSelected(selected) {
    this.isSelected = selected;
    this.rallyShown = selected && (this.type === 'castle' || this.type === 'barracks' || this.type === 'great_hall' || this.type === 'orc_barracks');
  }

  setRallyPoint(pos) {
    this.rallyPoint.copy(pos);
    this.rallyPoint.y = this.terrain.getHeight(pos.x, pos.z);
    this.rallyShown = true;
  }

  /** Compat (F2-08c): a `BuildingView` lê `isConstructed`/`buildProgress` a cada quadro. */
  updateConstructionState() {}

  construct(amount, gameManager) {
    if (this.isConstructed) return;
    const gm = gameManager || this.gameManager;
    const before = this.buildProgress;
    this.buildProgress += amount;
    // F3-05: PV sobe com o progresso (de 10 % a 100 % de hpMax), preservando o dano já sofrido.
    const gained = (Math.min(100, this.buildProgress) - before) / 100 * this.maxHp * (1 - CONSTRUCTION_MIN_HP_FRACTION);
    this.hp = Math.min(this.maxHp, this.hp + gained);
    if (this.buildProgress >= 100) {
      this.buildProgress = 100;
      this.isConstructed = true;
      if (gm && gm.events) {
        gm.events.emit(EVT.BUILDING_COMPLETED, {
          buildingId: this.id,
          ownerId: this.ownerId,
          pos: posOf(this.mesh.position),
          buildingType: this.type
        });
      }
      const owner = this.getOwner(gm);
      if (owner) owner.recalculatePop(gm);
    }
  }

  /**
   * F3-05: um golpe de reparo (chamado por `Unit.updateRepairing`). Restaura até 5 % de hpMax e
   * cobra `repairCostFor` do dono. Retorna 'ok' | 'full' (nada a reparar/em obra) | 'nofunds'.
   */
  repairHit(gameManager) {
    const gm = gameManager || this.gameManager;
    if (this.isDead || !this.isConstructed || this.hp >= this.maxHp) return 'full';
    const restored = Math.min(this.maxHp * REPAIR_HP_FRACTION, this.maxHp - this.hp);
    const cost = repairCostFor({ hp: this.maxHp, cost: this.cost }, restored);
    const owner = this.getOwner(gm);
    if (!owner) return 'full';
    if (!owner.canAfford(cost)) return 'nofunds';
    owner.deduct(cost);
    this.hp = Math.min(this.maxHp, this.hp + restored);
    return 'ok';
  }

  /**
   * F3-05: cancela uma obra em andamento (só do próprio dono; construção concluída é ignorada).
   * Devolve 75 % do custo, emite BUILDING_CANCELLED (não é baixa de combate) e marca a
   * construção como morta para o `GameManager` liberar pathfinder/grade/população.
   * @returns {boolean} true se cancelou.
   */
  cancelConstruction(gameManager) {
    if (this.isConstructed || this.isDead) return false;
    const gm = gameManager || this.gameManager;
    const owner = this.getOwner(gm);
    if (owner) owner.add(cancelRefundFor(this.cost));
    // Trabalhadores que miravam esta obra param.
    const units = gm && gm.allUnits ? gm.allUnits : [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.buildTarget === this || u.repairTarget === this) {
        u.orderQueue = null;
        u.stop();
      }
    }
    this.isDead = true;
    if (gm && gm.events) {
      gm.events.emit(EVT.BUILDING_CANCELLED, {
        buildingId: this.id,
        ownerId: this.ownerId,
        pos: posOf(this.mesh.position),
        buildingType: this.type
      });
    }
    this.dispose();
    if (owner) owner.recalculatePop(gm);
    return true;
  }

  /** F3-03: `amount` já é o dano final (calculado por `computeDamage` no chamador). */
  takeDamage(amount, attacker = null) {
    // F3-09: atribuição de kills (lida em die()).
    if (attacker && typeof attacker.ownerId === 'number') this.lastAttackerOwnerId = attacker.ownerId;
    this.hp -= amount;
    this.wasDamaged = true;
    this.underAttackTimer = 6.0;

    const gmEvents = this.gameManager && this.gameManager.events;
    if (gmEvents) {
      gmEvents.emit(EVT.BUILDING_DAMAGED, {
        buildingId: this.id,
        ownerId: this.ownerId,
        pos: posOf(this.mesh.position),
        amount
      });
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  die() {
    this.isDead = true;
    const gmEvents = this.gameManager && this.gameManager.events;
    if (gmEvents) {
      gmEvents.emit(EVT.BUILDING_DESTROYED, {
        buildingId: this.id,
        ownerId: this.ownerId,
        pos: posOf(this.mesh.position),
        buildingType: this.type,
        killerOwnerId: this.lastAttackerOwnerId ?? null
      });
    }
    this.dispose();
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
  }

  queueUnit(unitType, gameManager) {
    // Maximum 6 slots in the training queue
    if (this.queue.length >= 6) {
      return false;
    }

    // F4-01: construção em obra não treina.
    if (!this.isConstructed) return false;

    // F3-06: Centro em upgrade de nível não treina (a fila fica pausada; ver `startTierUpgrade`).
    if (this.tierUpgrade) {
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

    const gm = gameManager || this.gameManager;
    // F3-07: após `ranged_class`, o Quartel treina a classe avançada no lugar do atirador base.
    if (gm && typeof gm.resolveTrainType === 'function') unitType = gm.resolveTrainType(unitType, this.ownerId);

    const cfg = UNIT_TRAIN_CONFIG[unitType];
    if (!cfg) return false;
    const c = cfg.cost;

    // F4-01: cada construção só treina o que está em `BUILDINGS[type].trains` (classe avançada
    // conta pelo `modelOf` da unidade base: Patrulheiro no lugar do Arqueiro).
    const trains = getBuildingDef(this.type).trains || [];
    const base = getUnitDef(unitType).modelOf || unitType;
    if (!trains.includes(unitType) && !trains.includes(base)) return false;

    const owner = this.getOwner(gm);
    if (!owner) return false;

    // F4-07a: navio precisa de saída para o mar (célula navegável junto ao cais) — senão recusa sem debitar.
    if (getUnitDef(unitType).layer === 'naval' && !gm.getDockPoint(this)) {
      if (owner.isLocal) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: '⚠️ Sem saída para o mar' });
      return false;
    }

    // F3-06: requisitos generalizados (construção/{hq:N}) — falha silenciosa, sem debitar.
    if (missingUnitRequirements(this.ownerId, unitType, gm).length > 0) {
      return false;
    }

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

  /**
   * F3-07: inicia o PRÓXIMO nível de `upgradeId` (`RESEARCH`). Só constrói/pesquisa na construção
   * cujo `role` bate com `RESEARCH[id].building` (Forja → 'forge', Serraria → 'lumber') e, se a
   * pesquisa for de uma facção, só nessa facção. Falha silenciosa (sem debitar) se já no máximo,
   * ocupada, duplicada em outra construção, requisito faltando ou sem recursos.
   */
  startResearch(upgradeId, gameManager) {
    if (!this.isConstructed || this.isDead) return false;
    if (this.currentResearch) return false;

    const research = RESEARCH[upgradeId];
    if (!research) return false;
    const def = getBuildingDef(this.type);
    if (def.role !== research.building) return false;
    if (research.faction && def.faction !== research.faction) return false;

    const gm = gameManager || this.gameManager;
    if (!gm) return false;
    const owner = this.getOwner(gm);
    if (!owner) return false;

    const nextLevel = owner.getResearchLevel(upgradeId) + 1;
    if (nextLevel > research.levels.length) return false;

    // Outra construção do mesmo jogador já pesquisa o mesmo id?
    if (gm.isUpgradeResearching(upgradeId, this.ownerId)) return false;

    // F3-06/F3-07: requisitos do nível (construção/{hq:N}/{research:id}) — sem debitar.
    if (missingUpgradeRequirements(this.ownerId, upgradeId, gm, nextLevel).length > 0) return false;

    const lv = research.levels[nextLevel - 1];
    if (!owner.canAfford(lv.cost)) return false;
    owner.deduct(lv.cost);

    this.currentResearch = {
      id: upgradeId,
      level: nextLevel,
      progress: 0,
      totalTime: lv.time,
      cost: { ...lv.cost },
      cfg: UPGRADE_CONFIG[upgradeId]
    };
    this.researchSoundTimer = 0;
    return true;
  }

  cancelResearch(gameManager) {
    if (!this.currentResearch) return false;
    const owner = this.getOwner(gameManager || this.gameManager);
    if (owner) {
      owner.add(this.currentResearch.cost);
    }
    this.currentResearch = null;
    return true;
  }

  /**
   * F3-06: inicia o upgrade de nível do Centro (`role: 'hq'`). Valida tipo/tier/custo/estado
   * e debita o custo; a evolução real (`tier++`, PV, evento) acontece em `simUpdate` quando
   * `tierUpgrade.progress >= totalTime`. Enquanto em andamento, `queueUnit` recusa treino
   * (fila pausada) mas o Centro continua sendo ponto de entrega normalmente.
   */
  startTierUpgrade(gameManager) {
    if (getBuildingDef(this.type).role !== 'hq') return false;
    if (!this.isConstructed || this.isDead) return false;
    if (this.tier >= 3) return false;
    if (this.tierUpgrade) return false;

    const nextTier = this.tier + 1;
    const gm = gameManager || this.gameManager;
    if (!gm) return false;
    const cost = typeof gm.hqUpgradeCost === 'function' ? gm.hqUpgradeCost(nextTier) : getHqUpgradeCost(nextTier); // F4-07a: petróleo do nível 3
    if (!cost) return false;
    const owner = this.getOwner(gm);
    if (!owner || !owner.canAfford(cost)) return false;

    owner.deduct(cost);
    this.tierUpgrade = {
      targetTier: nextTier,
      progress: 0,
      totalTime: cost.time,
      cost
    };
    return true;
  }

  /** F3-06: cancela o upgrade em andamento e devolve 100% do custo (símétrico a `cancelResearch`). */
  cancelTierUpgrade(gameManager) {
    if (!this.tierUpgrade) return false;
    const cost = this.tierUpgrade.cost;
    const owner = this.getOwner(gameManager || this.gameManager);
    if (cost && owner) {
      owner.add(cost);
    }
    this.tierUpgrade = null;
    return true;
  }

  /**
   * F1-09: lógica de jogo (fila de treino, pesquisa, torre atirando, produção passiva,
   * underAttackTimer) — roda em `GameManager.simStep`, no tick fixo. VFX/billboard ficam em
   * `renderUpdate` (rodam a cada frame renderizado).
   * @param {Array} targets   não usado desde a F1-06 (alvo das torres vem de `gm.unitGrid.nearest`);
   *                          mantido por compatibilidade com o chamador (`GameManager.simStep`)
   * @param {Array} allUnits  todas as unidades (repassado ao dano para retaliação/ajuda)
   */
  simUpdate(delta, gameManager, arrows, targets, allUnits = []) {
    if (this.isDead) return;
    if (gameManager) this.gameManager = gameManager;
    const gmEvents = gameManager && gameManager.events;

    // Under attack timer
    if (this.underAttackTimer > 0) {
      this.underAttackTimer -= delta;
    }

    // Passive production (Farm / Pig Farm gives +3 food/gold) — valores em src/data/buildings.js
    const passive = getBuildingDef(this.type).passiveIncome;
    if (this.isConstructed && passive) {
      this.passiveTimer += delta;
      if (this.passiveTimer >= passive.interval) {
        this.passiveTimer = 0;
        const owner = this.getOwner(gameManager);
        if (owner) owner.add(passive.resource, passive.amount);
        if (gmEvents) {
          gmEvents.emit(EVT.RESOURCE_GATHERED, {
            type: passive.resource,
            amount: passive.amount,
            pos: posOf(this.mesh.position),
            ownerId: this.ownerId,
            passive: true
          });
        }
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
          ? gm.unitGrid.nearest(pos.x, pos.z, this.attackRange, u => !u.isDead && self.isHostileTo(u) && canTarget(self, u) && (!u.mods || !u.mods.invisible || isDetectedBy(gm, u, self.ownerId)))
          : null;

        if (closest) {
          this.attackTimer = 0;
          const projType = towerDef.projectile;
          _towerArrowStart.x = this.mesh.position.x;
          _towerArrowStart.y = this.mesh.position.y + towerDef.projectileOriginY;
          _towerArrowStart.z = this.mesh.position.z;
          if (gmEvents) {
            gmEvents.emit(EVT.PROJECTILE_FIRED, { kind: projType, from: posOf(_towerArrowStart), ownerId: this.ownerId });
          }
          // F3-03: dano final calculado no impacto (computeDamage, 1 valor de RNG de gm.combatRng).
          const arrow = new Projectile({ kind: projType, from: _towerArrowStart, target: closest, damage: this.towerDamage, onHit: (target, dmgObj, hitPos) => {
            const dmg = computeDamage(dmgObj, target, gm.combatRng);
            target.takeDamage(dmg, this, allUnits);
            if (gmEvents) gmEvents.emit(EVT.PROJECTILE_HIT, { kind: projType, pos: posOf(hitPos), ownerId: this.ownerId });
          } });
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
        let spawnX;
        let spawnZ;
        const dock = getUnitDef(current.type).layer === 'naval' ? gameManager.getDockPoint(this) : null;
        if (dock) {
          // F4-07a: navio nasce na água, no cais da construção (sem consumir o RNG de simulação).
          spawnX = dock.x;
          spawnZ = dock.z;
        } else {
          if (!gameManager || !gameManager.rng) throw new Error('Building: gameManager.rng obrigatório para treinar unidades (F9-03)');
          spawnX = this.mesh.position.x + (gameManager.rng.next() - 0.5) * 1.5;
          spawnZ = this.mesh.position.z + spawnDist;
        }
        const spawned = gameManager.spawnUnit(current.type, spawnX, spawnZ, this.ownerId, this.rallyPoint);
        if (gmEvents) {
          gmEvents.emit(EVT.UNIT_TRAINED, {
            unitId: spawned.id,
            ownerId: this.ownerId,
            pos: posOf(spawned.mesh.position),
            unitType: current.type
          });
        }
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
        if (gmEvents) {
          gmEvents.emit(EVT.BUILDING_VFX, { buildingId: this.id, ownerId: this.ownerId, pos: posOf(this.mesh.position), kind: 'anvil_spark' });
        }
      }

      if (r.progress >= r.totalTime) {
        const completedId = r.id;
        const completedLevel = r.level || 1;
        this.currentResearch = null;
        const gm = gameManager || this.gameManager;
        if (gm) {
          gm.completeUpgrade(completedId, this.ownerId);
        }
        if (gmEvents) {
          gmEvents.emit(EVT.BUILDING_VFX, { buildingId: this.id, ownerId: this.ownerId, pos: posOf(this.mesh.position), kind: 'anvil_spark' });
          gmEvents.emit(EVT.RESEARCH_DONE, { ownerId: this.ownerId, upgradeId: completedId, level: completedLevel, pos: posOf(this.mesh.position) });
        }
      }
    }

    // F3-06: progresso do upgrade de nível do Centro (fila de treino já recusa novos pedidos
    // via `queueUnit`; o item já em treino quando o upgrade começou continua até o fim).
    if (this.isConstructed && this.tierUpgrade) {
      const t = this.tierUpgrade;
      t.progress += delta;
      if (t.progress >= t.totalTime) {
        const newTier = t.targetTier;
        this.tierUpgrade = null;
        this.tier = newTier;

        // PV máximo sobe para o valor do nível preservando a proporção de PV atual.
        const pct = this.maxHp > 0 ? this.hp / this.maxHp : 1;
        this.maxHp = HQ_TIER_HP[newTier] || this.maxHp;
        this.hp = Math.min(this.maxHp, Math.round(this.maxHp * pct));

        if (gmEvents) {
          gmEvents.emit(EVT.HQ_TIER_CHANGED, {
            buildingId: this.id,
            ownerId: this.ownerId,
            pos: posOf(this.mesh.position),
            tier: newTier
          });
        }
      }
    }
  }
}
