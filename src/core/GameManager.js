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
import { AIDirector } from '../ai/AIDirector.js';
import { TreeManager } from '../world/TreeManager.js';
import { Pathfinder } from './Pathfinder.js';
import { HumanForge } from '../entities/buildings/HumanForge.js';
import { UPGRADE_CONFIG } from './UpgradeConfig.js';
import { STARTING_RESOURCES, FACTIONS, getBuildingDef, isDropoffFor } from '../data/index.js';
import { Player } from '../sim/Player.js';
import { PlayerRegistry } from '../sim/PlayerRegistry.js';
import { EntityRegistry, NEUTRAL_OWNER_ID } from '../sim/EntityIds.js';
import { SpatialGrid } from '../sim/SpatialGrid.js';
import {
  MAP_START_SLOTS,
  DEFAULT_MAP_ID,
  createMatchConfig,
  layoutAt,
  validateMatchConfig
} from '../sim/MatchConfig.js';

const EMPTY_LIST = Object.freeze([]);

export class GameManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../world/Terrain.js').Terrain} terrain
   * @param {*} soundManager
   * @param {*} particleSystem
   * @param {object|null} [matchConfig]  ver src/sim/MatchConfig.js (padrão: 1×1 humano local × IA orc)
   */
  constructor(scene, terrain, soundManager, particleSystem, matchConfig = null) {
    this.scene = scene;
    this.terrain = terrain;
    this.soundManager = soundManager;
    this.particleSystem = particleSystem;

    // Instanced Trees System (6 Draw Calls for all 180 Trees)
    this.treeManager = new TreeManager(this.scene);

    // Configuração da partida e jogadores (F2-01). Economia/pop/pesquisas vivem em Player.
    this.matchConfig = validateMatchConfig(matchConfig || createMatchConfig());
    /** @type {PlayerRegistry} */
    this.playerRegistry = new PlayerRegistry();
    this._localPlayerId = 0;

    // IDs de entidade (F2-01): id numérico estável + ownerId em toda entidade.
    this.entityRegistry = new EntityRegistry();
    /** @type {Map<number, object>} id → entidade (Unit, Building, Tree, ResourceDeposit, projétil) */
    this.entitiesById = this.entityRegistry.byId;

    // Entity collections
    /** Lista única de unidades de todos os jogadores, em ordem de spawn. */
    this.allUnits = [];
    /** @type {Map<number, Array>} ownerId → unidades desse dono (mantido em add/remove) */
    this._unitsByOwner = new Map();
    /** @type {Map<number, {list: Array, dirty: boolean}>} ownerId → unidades hostis a ele (cache) */
    this._hostileUnitsCache = new Map();
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

    // Fog of War (covers 160x160 continent)
    this.fogOfWar = new FogOfWar(this.scene, 160, 160);

    // Um AIDirector por jogador de IA. `aiDirector` = o primeiro (compatibilidade: bench, UI).
    /** @type {AIDirector[]} */
    this.aiDirectors = [];
    this.aiDirector = null;

    // Terrain Navigation & Water Obstacle Pathfinder
    this.pathfinder = new Pathfinder(this.terrain);
    this.terrain.pathfinder = this.pathfinder;

    // Grade espacial (F1-06): unitGrid = unidades (dinâmica, sincronizada 1x/tick em update());
    // blockerGrid = construções/depósitos/árvores vivas (inserida/removida em registerEntity/unregisterEntity).
    this.unitGrid = new SpatialGrid();
    this.blockerGrid = new SpatialGrid();
    // Buffers reutilizados por canPlaceBuilding (evita alocar em toda pré-visualização do fantasma).
    this._placeBuildingBuf = [];
    this._placeTreeBuf = [];
    this._placeDepositBuf = [];
    this._blockerCollisionBuf = [];
    this._unitCollisionBuf = [];

    this.initMapEntities();
  }

  // --- JOGADORES (F2-01) ---

  /** @returns {Player[]} */
  get players() {
    return this.playerRegistry.players;
  }

  /** @returns {Player|null} */
  getPlayer(id) {
    return this.playerRegistry.getPlayer(id);
  }

  /** @returns {Player} */
  get localPlayer() {
    return this.playerRegistry.localPlayer;
  }

  get localPlayerId() {
    return this._localPlayerId;
  }

  isHostile(a, b) {
    return this.playerRegistry.isHostile(a, b);
  }

  isAlly(a, b) {
    return this.playerRegistry.isAlly(a, b);
  }

  /**
   * Converte o "lado" legado em ownerId: número → ele mesmo; 'player'/undefined → jogador local;
   * 'enemy' → primeiro jogador hostil ao local. DÍVIDA (F2-01): some quando UI/bench usarem ids.
   */
  resolveOwnerId(owner) {
    if (typeof owner === 'number') return owner;
    if (owner === 'enemy') {
      const h = this.playerRegistry.firstHostileOf(this._localPlayerId);
      return h ? h.id : NEUTRAL_OWNER_ID;
    }
    return this._localPlayerId;
  }

  /** Dá id/ownerId a uma entidade, a coloca em `entitiesById` e na grade espacial (F1-06). */
  registerEntity(entity, ownerId = NEUTRAL_OWNER_ID) {
    this.entityRegistry.register(entity, ownerId);
    this._insertIntoGrid(entity);
    return entity;
  }

  unregisterEntity(entity) {
    this._removeFromGrid(entity);
    this.entityRegistry.unregister(entity);
  }

  /** Unidade → `unitGrid`; Building/ResourceDeposit/Tree → `blockerGrid` (colisão/alvo/picking). */
  _insertIntoGrid(entity) {
    if (!entity || !entity.mesh) return;
    const pos = entity.mesh.position;
    if (entity instanceof Unit) {
      this.unitGrid.insert(entity, pos.x, pos.z, entity.collisionRadius || 0);
    } else if (entity instanceof Building || entity instanceof ResourceDeposit || entity instanceof Tree) {
      this.blockerGrid.insert(entity, pos.x, pos.z, entity.collisionRadius || 0);
    }
  }

  _removeFromGrid(entity) {
    if (!entity) return;
    if (entity instanceof Unit) {
      this.unitGrid.remove(entity);
    } else if (entity instanceof Building || entity instanceof ResourceDeposit || entity instanceof Tree) {
      this.blockerGrid.remove(entity);
    }
  }

  getEntity(id) {
    return this.entityRegistry.get(id);
  }

  // --- Compatibilidade com o modelo antigo de dois lados (DÍVIDA F2-01, ver docs/01_ARQUITETURA.md) ---
  // UIManager, InputManager e FogOfWar ainda leem estes campos do "jogador"; todos apontam para o jogador local.

  get playerFaction() {
    return this.localPlayer ? this.localPlayer.factionId : 'human';
  }

  get resources() {
    return this.localPlayer.resources;
  }

  get population() {
    return this.localPlayer.population;
  }

  set population(v) {
    this.localPlayer.population = v;
  }

  get maxPopulation() {
    return this.localPlayer.maxPopulation;
  }

  set maxPopulation(v) {
    this.localPlayer.maxPopulation = v;
  }

  /** { player: pesquisas do local, enemy: do primeiro hostil } — formato legado lido pela UI. */
  get researchedUpgrades() {
    const hostile = this.playerRegistry.firstHostileOf(this._localPlayerId);
    return {
      player: this.localPlayer.researchedUpgrades,
      enemy: hostile ? hostile.researchedUpgrades : new Set()
    };
  }

  /** Alias legado do primeiro diretor de IA. */
  get enemyAI() {
    return this.aiDirector;
  }

  /** Unidades do jogador local (visão derivada de `allUnits`, mantida em add/remove). */
  get units() {
    return this.getUnitsOf(this._localPlayerId);
  }

  /** Unidades hostis ao jogador local (visão derivada de `allUnits`, cacheada até a próxima mudança). */
  get enemies() {
    return this.getHostileUnitsOf(this._localPlayerId);
  }

  /** Unidades (vivas ou morrendo) de um dono. Não modifique o array retornado. */
  getUnitsOf(ownerId) {
    return this._unitsByOwner.get(ownerId) || EMPTY_LIST;
  }

  /** Unidades de donos hostis a `ownerId`. Não modifique o array retornado. */
  getHostileUnitsOf(ownerId) {
    let entry = this._hostileUnitsCache.get(ownerId);
    if (!entry) {
      entry = { list: [], dirty: true };
      this._hostileUnitsCache.set(ownerId, entry);
    }
    if (entry.dirty) {
      const list = entry.list;
      list.length = 0;
      const all = this.allUnits;
      for (let i = 0; i < all.length; i++) {
        if (this.playerRegistry.isHostile(ownerId, all[i].ownerId)) list.push(all[i]);
      }
      entry.dirty = false;
    }
    return entry.list;
  }

  _markUnitListsDirty() {
    this._hostileUnitsCache.forEach(entry => { entry.dirty = true; });
  }

  _addUnit(unit) {
    this.registerEntity(unit, unit.ownerId);
    this.allUnits.push(unit);
    let list = this._unitsByOwner.get(unit.ownerId);
    if (!list) {
      list = [];
      this._unitsByOwner.set(unit.ownerId, list);
    }
    list.push(unit);
    this._markUnitListsDirty();
  }

  _removeUnitAt(index) {
    const unit = this.allUnits.splice(index, 1)[0];
    const list = this._unitsByOwner.get(unit.ownerId);
    if (list) {
      const i = list.indexOf(unit);
      if (i !== -1) list.splice(i, 1);
    }
    this.unregisterEntity(unit);
    this._markUnitListsDirty();
    return unit;
  }

  /**
   * Troca a facção do jogador local mantendo o resto da config (1×1 ou FFA) e recria o mapa.
   * Mantido para compatibilidade; o caminho normal é passar a MatchConfig no construtor.
   */
  setPlayerFaction(faction) {
    if (this.playerFaction === faction) return;
    const ffa = this.matchConfig.players.length > 2;
    this.startMatch(createMatchConfig({ localFaction: faction, ffa, seed: this.matchConfig.seed, mapId: this.matchConfig.mapId }));
  }

  /** Recria o mapa com uma nova MatchConfig e centraliza a câmera na base do jogador local. */
  startMatch(matchConfig) {
    this.matchConfig = validateMatchConfig(matchConfig);
    this.resetMap();
    this.focusCameraOnLocalBase();
  }

  focusCameraOnLocalBase() {
    const p = this.localPlayer;
    if (this.sceneManager && p && p.startPos) {
      this.sceneManager.cameraTarget.set(p.startPos.x, 2.5, p.startPos.z);
    }
  }

  resetMap() {
    this.allUnits.forEach(u => this.scene.remove(u.mesh));
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

    this.allUnits = [];
    this._unitsByOwner.clear();
    this._hostileUnitsCache.clear();
    this.buildings = [];
    this.trees = [];
    this.resourceDeposits = [];
    this.selectedUnits = [];
    this.selectedBuilding = null;
    this.selectedResource = null;
    this.isGameOver = false;
    this.gameWon = false;
    this.aiDirectors = [];
    this.aiDirector = null;
    this.entityRegistry.clear();
    this.unitGrid.clear();
    this.blockerGrid.clear();

    // Reset Fog of War shroud
    if (this.fogOfWar) {
      this.fogOfWar.explored.fill(0);
      this.fogOfWar.activeVision.fill(0);
      this.fogOfWar.needsUpdate = true;
    }

    this.initMapEntities();
  }

  /** Cria jogadores a partir da MatchConfig (recursos iniciais de src/data). */
  _createPlayers() {
    this.playerRegistry = new PlayerRegistry(
      this.matchConfig.players.map(spec => new Player({ ...spec, resources: STARTING_RESOURCES }))
    );
    this._localPlayerId = this.playerRegistry.localPlayer.id;
    this._unitsByOwner.clear();
    this._hostileUnitsCache.clear();
    this.players.forEach(p => this._unitsByOwner.set(p.id, []));
  }

  initMapEntities() {
    this._createPlayers();
    const slots = MAP_START_SLOTS[this.matchConfig.mapId] || MAP_START_SLOTS[DEFAULT_MAP_ID];

    // 1. Bases iniciais a partir dos slots da MatchConfig (slot 0 = NE, slot 1 = SW, extras validados).
    // Mesmo layout e mesmas posições de antes da F2-01 para os slots 0 e 1.
    // Slots fixos primeiro: as posições extras são validadas contra as bases já colocadas.
    const ordered = [...this.players].sort((a, b) => {
      const fa = a.startSlot < slots.fixed.length ? 0 : 1;
      const fb = b.startSlot < slots.fixed.length ? 0 : 1;
      return fa - fb;
    });
    // Jazidas fixas do mapa antes das bases, para que canPlaceBuilding as considere nos slots extras.
    this.spawnResourceDeposits();

    const extraSlotPositions = [];
    for (const player of ordered) {
      let pos;
      if (player.startSlot < slots.fixed.length) {
        pos = slots.fixed[player.startSlot];
      } else {
        pos = this._findExtraStartPosition(player.factionId, slots.extraCandidates);
        extraSlotPositions.push(pos);
      }
      player.startPos = { x: pos.x, z: pos.z };
      this._spawnStartingBase(player, pos);
    }

    // 2. Jazidas próprias dos slots extras (o mapa continental só tem minas para 2 bases)
    extraSlotPositions.forEach(pos => this._spawnExtraSlotDeposits(pos));

    // 3. Harvestable Woodlands & Trees (Spacious wilderness forests, completely outside bases)
    this.spawnWoodlands();

    this.recalculatePopCap();
  }

  /** HQ + serraria + casa e 5 unidades iniciais da facção do jogador, espelhados para o slot. */
  _spawnStartingBase(player, pos) {
    const start = FACTIONS[player.factionId].startingBase;
    const layout = layoutAt(pos);

    layout.buildings.forEach(entry => {
      const b = this.createBuilding(start.buildings[entry.role], entry.x, entry.z, true, player.id);
      if (entry.rotY) b.mesh.rotation.y = entry.rotY;
      this.buildings.push(b);
    });

    layout.units.forEach(entry => {
      this.spawnUnit(start.units[entry.role], entry.x, entry.z, player.id);
    });

    if (player.isAI) {
      const director = new AIDirector(this, player.id, new THREE.Vector2(pos.x, pos.z));
      this.aiDirectors.push(director);
      if (!this.aiDirector) this.aiDirector = director;
    }

    if (player.isLocal) {
      // Reveal Player's base in Fog of War
      this.fogOfWar.revealArea(pos.x, pos.z, 28);
    }
  }

  /**
   * Primeira posição candidata em que a base inteira (HQ, serraria, casa) passa em
   * canPlaceBuilding e que fica a ≥ 40 u das outras bases.
   */
  _findExtraStartPosition(factionId, candidates) {
    const start = FACTIONS[factionId].startingBase;
    const taken = this.players.filter(p => p.startPos).map(p => p.startPos);
    for (const c of candidates) {
      if (taken.some(t => Math.hypot(t.x - c.x, t.z - c.z) < 40)) continue;
      const layout = layoutAt(c);
      const ok = layout.buildings.every(e => this.canPlaceBuilding(start.buildings[e.role], e.x, e.z));
      if (ok) return c;
    }
    throw new Error('GameManager: nenhuma posição livre para o slot inicial extra');
  }

  /**
   * Slots extras (FFA de teste) não têm minas próprias no mapa continental: coloca 1 mina de
   * ouro e 1 pedreira a ~15 u do HQ, em terreno seco e longe de construções, vaus e outras jazidas.
   * DÍVIDA: some com os mapas orientados a dados (F2-05).
   */
  _spawnExtraSlotDeposits(pos) {
    const fords = [{ x: -16, z: -16 }, { x: 0, z: 0 }, { x: 16, z: 16 }];
    const isFree = (x, z) => {
      if (Math.max(Math.abs(x), Math.abs(z)) > 50) return false;
      for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
        if (this.terrain.getHeight(x + ox, z + oz) < 1.9) return false;
      }
      if (this.buildings.some(b => Math.hypot(x - b.mesh.position.x, z - b.mesh.position.z) < (b.collisionRadius || 3) + 7)) return false;
      if (this.resourceDeposits.some(r => Math.hypot(x - r.mesh.position.x, z - r.mesh.position.z) < 10)) return false;
      if (fords.some(f => Math.hypot(x - f.x, z - f.z) < 12)) return false;
      return true;
    };
    for (const type of ['gold', 'stone']) {
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const x = pos.x + Math.cos(ang) * 15;
        const z = pos.z + Math.sin(ang) * 15;
        if (isFree(x, z)) {
          this.resourceDeposits.push(this.registerEntity(new ResourceDeposit(this.scene, this.terrain, type, x, z)));
          break;
        }
      }
    }
  }

  /**
   * Spawns strategic resource deposits across both kingdoms and the central plains
   */
  spawnResourceDeposits() {
    const add = (type, x, z) => {
      this.resourceDeposits.push(this.registerEntity(new ResourceDeposit(this.scene, this.terrain, type, x, z)));
    };
    // Human Realm Deposits
    add('gold', 30, -46);
    add('stone', 46, -46);
    add('gold', 16, -26);

    // Orc Realm Deposits
    add('gold', -30, 46);
    add('stone', -46, 46);
    add('gold', -16, 26);

    // Contested Central Plains Deposits
    add('gold', 8, -6);
    add('stone', -8, 6);
  }

  /**
   * Spawns spaced-out clusters of harvestable trees with strict clearance from all buildings,
   * base courtyards, resource deposits, and river crossings.
   */
  spawnWoodlands() {
    const treeTypes = ['oak', 'pine', 'autumn'];
    const minTreeSpacing = 4.4; // Generous distance between trees for open meadows

    const slots = MAP_START_SLOTS[this.matchConfig.mapId] || MAP_START_SLOTS[DEFAULT_MAP_ID];
    const courtyards = [...slots.fixed];
    this.players.forEach(p => {
      if (p.startPos && !courtyards.some(c => c.x === p.startPos.x && c.z === p.startPos.z)) courtyards.push(p.startPos);
    });

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
        // Sempre as duas bases históricas (NE/SW) + qualquer slot extra ocupado.
        if (courtyards.some(c => Math.hypot(x - c.x, z - c.z) < 26.0)) continue;

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
        this.trees.push(this.registerEntity(new Tree(this.scene, this.terrain, x, z, type, this.treeManager)));
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

    // 2. Minimum distance to other buildings (F1-06: blockerGrid.queryRadius já soma o raio
    //    de cada construção encontrada; passamos radius + minBuildingGap como `r`).
    const minBuildingGap = 3.2;
    const buildingHits = this.blockerGrid.queryRadius(
      x, z, radius + minBuildingGap,
      e => e instanceof Building && e !== ignoreBuilding && !e.isDead,
      this._placeBuildingBuf
    );
    if (buildingHits.length > 0) return false;

    // 3. Minimum distance to trees (só árvores vivas com madeira)
    const minTreeGap = 3.5;
    const treeHits = this.blockerGrid.queryRadius(
      x, z, radius + minTreeGap,
      e => e instanceof Tree && !e.isDead && e.woodRemaining > 0,
      this._placeTreeBuf
    );
    if (treeHits.length > 0) return false;

    // 4. Minimum distance to resource deposits (raio real de cada jazida, via blockerGrid)
    const minDepositGap = 3.0;
    const depositHits = this.blockerGrid.queryRadius(
      x, z, radius + minDepositGap,
      e => e instanceof ResourceDeposit && e.resourcesRemaining > 0,
      this._placeDepositBuf
    );
    if (depositHits.length > 0) return false;

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

  /** Recalcula população e teto de TODOS os jogadores (poucos jogadores × entidades: barato). */
  recalculatePopCap() {
    const players = this.players;
    for (let i = 0; i < players.length; i++) {
      players[i].recalculatePop(this);
    }
  }

  // Economia do jogador local (API legada usada por UIManager/InputManager).
  canAfford(cost) {
    return this.localPlayer.canAfford(cost);
  }

  deductResources(cost) {
    this.localPlayer.deduct(cost);
  }

  addResource(type, amount) {
    this.localPlayer.add(type, amount);
  }

  /**
   * @param {string} type
   * @param {number} x
   * @param {number} z
   * @param {number|'player'|'enemy'} [owner]  ownerId (ou lado legado, ver resolveOwnerId)
   * @param {THREE.Vector3|null} [rallyPoint]
   */
  spawnUnit(type, x, z, owner = 'player', rallyPoint = null) {
    const ownerId = this.resolveOwnerId(owner);
    if (this.pathfinder && this.pathfinder.isWater(x, z)) {
      const snapped = this.pathfinder.findNearestWalkable(x, z);
      x = snapped.x;
      z = snapped.z;
    }
    const unit = new Unit(this.scene, this.terrain, type, x, z, ownerId, this);
    this._addUnit(unit);

    const player = this.getPlayer(ownerId);
    if (player) {
      // Apply active forge upgrades of the owner to new units
      player.researchedUpgrades.forEach(upgId => {
        this.applyUpgradeToUnit(unit, upgId);
      });
      player.recalculatePop(this);
      // Ponto de reunião: só para jogadores humanos (a IA sempre ignorou o rally no spawn;
      // mantido para a partida 1×1 continuar idêntica).
      if (rallyPoint && !player.isAI) {
        unit.moveTo(rallyPoint.x, rallyPoint.z, this);
      }
    }
    return unit;
  }

  isUpgradeResearched(upgradeId, owner = 'player') {
    const player = this.getPlayer(this.resolveOwnerId(owner));
    return player ? player.researchedUpgrades.has(upgradeId) : false;
  }

  isUpgradeResearching(upgradeId, owner = 'player') {
    const ownerId = this.resolveOwnerId(owner);
    return this.buildings.some(b => b.ownerId === ownerId && b.currentResearch && b.currentResearch.id === upgradeId);
  }

  completeUpgrade(upgradeId, owner = 'player') {
    const ownerId = this.resolveOwnerId(owner);
    const player = this.getPlayer(ownerId);
    if (!player) return;
    player.researchedUpgrades.add(upgradeId);

    // Apply to all currently alive units of this owner
    this.getUnitsOf(ownerId).forEach(u => {
      if (!u.isDead) {
        this.applyUpgradeToUnit(u, upgradeId);
      }
    });

    if (player.isLocal) {
      const cfg = UPGRADE_CONFIG[upgradeId];
      const factionType = player.factionId === 'orc' ? 'orc' : 'human';
      const upgName = cfg?.name[factionType] || upgradeId;
      this.uiManager?.showNotification(`🔥 Melhoria forjada: ${upgName}!`);
    }
  }

  applyUpgradeToUnit(unit, upgradeId = null) {
    if (!upgradeId) {
      const player = this.getPlayer(unit.ownerId);
      if (player) {
        player.researchedUpgrades.forEach(id => {
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

  /**
   * @param {number|'player'|'enemy'} [owner]  ownerId (ou lado legado, ver resolveOwnerId)
   */
  createBuilding(type, x, z, isConstructed = true, owner = 'player') {
    const ownerId = this.resolveOwnerId(owner);
    let b;
    switch (type) {
      case 'great_hall':
        b = new GreatHall(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'orc_barracks':
        b = new OrcBarracks(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'pig_farm':
        b = new PigFarm(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'orc_house':
        b = new OrcHouse(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'orc_watchtower':
        b = new OrcWatchtower(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'orc_lumber_mill':
        b = new OrcLumberMill(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'orc_forge':
        b = new OrcForge(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      case 'forge':
        b = new HumanForge(this.scene, this.terrain, x, z, isConstructed, ownerId);
        break;
      default:
        b = new Building(this.scene, this.terrain, type, x, z, isConstructed, ownerId);
        break;
    }
    b.gameManager = this;
    this.registerEntity(b, ownerId);
    return b;
  }

  buildNewBuilding(type, x, z) {
    const b = this.createBuilding(type, x, z, false, this._localPlayerId);
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

  /** Recurso mais próximo (árvore com madeira ou jazida do `type`), via `blockerGrid.nearest`. */
  findNearestResource(pos, type) {
    if (type === 'tree') {
      return this.blockerGrid.nearest(pos.x, pos.z, Infinity, e => e instanceof Tree && !e.isDead && e.woodRemaining > 0);
    }
    return this.blockerGrid.nearest(pos.x, pos.z, Infinity, e => e instanceof ResourceDeposit && e.type === type && e.resourcesRemaining > 0);
  }

  /**
   * Depósito de entrega mais próximo que pertence a `ownerId` (só o próprio dono, como no WC2),
   * via `blockerGrid.nearest`. `buildings` é mantido por compatibilidade (chamadores antigos
   * passam sempre `gm.buildings`, que já é a mesma lista espelhada pelo `blockerGrid`).
   */
  findNearestDropoff(pos, resourceType, buildings = this.buildings, ownerId = this._localPlayerId) {
    return this.blockerGrid.nearest(pos.x, pos.z, Infinity, b =>
      b instanceof Building && b.isConstructed && !b.isDead && b.ownerId === ownerId && isDropoffFor(b.type, resourceType)
    );
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

    if (entity instanceof Unit && entity.ownerId === this._localPlayerId) {
      entity.setSelected(true);
      this.selectedUnits.push(entity);
      this.soundManager.playSelect();
    } else if (entity instanceof Building && entity.ownerId === this._localPlayerId) {
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

    this.getUnitsOf(this._localPlayerId).forEach(u => {
      if (u.isDead || u.ownerId !== this._localPlayerId) return;
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
      // Right-clicked a hostile unit/building: Attack!
      if ((e instanceof Unit || e instanceof Building) && this.isHostile(this._localPlayerId, e.ownerId)) {
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
      if (e instanceof Building && !e.isConstructed && e.ownerId === this._localPlayerId) {
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

  /** O jogador ainda tem um centro de comando (HQ) de pé? (regra de derrota atual) */
  _hasLivingHQ(ownerId) {
    const buildings = this.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === ownerId && !b.isDead && getBuildingDef(b.type).role === 'hq') return true;
    }
    return false;
  }

  /**
   * Derrota: jogador sem HQ. Fim de jogo: jogador local derrotado (derrota) ou só um time
   * vivo (vitória do time local). Retorna true se a partida acabou neste frame.
   */
  _updateVictoryConditions() {
    const newlyDefeated = [];
    const players = this.players;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.defeated && !this._hasLivingHQ(p.id)) {
        p.defeated = true;
        newlyDefeated.push(p);
      }
    }

    const local = this.localPlayer;
    if (local.defeated) {
      this.isGameOver = true;
      this.gameWon = false;
      return true;
    }

    if (this.playerRegistry.aliveTeams().size <= 1) {
      if (!this.gameWon) {
        this.gameWon = true;
        this.isGameOver = true;
        this.soundManager.playVictory();
      }
      return true;
    }

    // Partida continua (FFA/times): avisa quem caiu. A IA derrotada para de jogar (ver update).
    newlyDefeated.forEach(p => {
      this.uiManager?.showNotification(`☠️ ${p.name} foi derrotado!`);
    });
    return false;
  }

  update(delta) {
    if (this.isPaused || this.isGameOver) return;
    const dt = delta * this.gameSpeed;
    this.gameTime += dt;

    // Check Win/Loss conditions
    if (this._updateVictoryConditions()) return;

    // Update Trees (árvore cortada — isDead/woodRemaining <= 0 — sai do blockerGrid; remove()
    // é no-op se já não estiver na grade, então repetir o teste em árvores já cortadas é barato)
    this.trees.forEach(t => {
      t.update(dt, this.particleSystem);
      if (t.isDead || t.woodRemaining <= 0) this.blockerGrid.remove(t);
    });

    // Update Projectiles
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      this.arrows[i].update(dt);
      if (this.arrows[i].isDead) {
        const deadArrow = this.arrows.splice(i, 1)[0];
        this.unregisterEntity(deadArrow);
      }
    }

    // Lista única de unidades (todos os jogadores). Construções filtram alvos por isHostile.
    const allUnits = this.allUnits;

    // Update Buildings
    this.buildings.forEach(b => {
      b.update(dt, this, this.soundManager, this.particleSystem, this.arrows, allUnits, allUnits);
    });

    // Clean dead buildings
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (this.buildings[i].isDead) {
        const deadB = this.buildings.splice(i, 1)[0];
        if (deadB.dispose) deadB.dispose();
        this.unregisterEntity(deadB);
        this.recalculatePopCap();
      }
    }

    // Sincroniza a grade espacial de unidades UMA vez por tick, antes de atualizar unidades
    // (F1-06): colisão/alvo/picking deste tick usam a posição do início do tick.
    const unitCount = allUnits.length;
    for (let i = 0; i < unitCount; i++) {
      const u = allUnits[i];
      if (!u.isDead) {
        const p = u.mesh.position;
        this.unitGrid.update(u, p.x, p.z, u.collisionRadius || 0.6);
      }
    }

    // Update Units (tamanho fixado: unidades criadas neste frame só atualizam no próximo)
    for (let i = 0; i < unitCount; i++) {
      allUnits[i].update(dt, this, this.soundManager, this.particleSystem, this.arrows, allUnits, this.buildings);
    }

    // Resolve Collisions: Units cannot walk through buildings, deposits, trees, or each other
    this.resolveBuildingCollisions();
    this.resolveUnitCollisions();

    // Autonomous Computer Opponent AI (Utility AI Director): um por jogador de IA ainda vivo
    for (let i = 0; i < this.aiDirectors.length; i++) {
      const director = this.aiDirectors[i];
      if (director.player && director.player.defeated) continue;
      director.update(dt);
    }

    // Update Fog of War (reveals explored territory & culls unexplored enemies)
    if (this.fogOfWar) {
      const localId = this._localPlayerId;
      this.fogOfWar.update(
        dt,
        this.allUnits.filter(u => u.ownerId === localId || this.isAlly(localId, u.ownerId)),
        this.buildings.filter(b => b.ownerId === localId || this.isAlly(localId, b.ownerId)),
        this.enemies,
        this.buildings.filter(b => this.isHostile(localId, b.ownerId))
      );
    }

    // Clean dead units from selection
    if (this.selectedUnits.length > 0) {
      this.selectedUnits = this.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    }

    // Clean dead units (waits for death collapse animation if canRemove is false)
    for (let i = allUnits.length - 1; i >= 0; i--) {
      const u = allUnits[i];
      if (u.isDead && u.canRemove !== false) {
        const deadU = this._removeUnitAt(i);
        if (deadU.dispose) deadU.dispose();
        const owner = this.getPlayer(deadU.ownerId);
        if (owner) owner.recalculatePop(this);
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
      (b.ownerId === unit.ownerId);

    if (unit.state === 'returning' && isDropoff) {
      unit.depositResources(this, this.soundManager, this.particleSystem);
    }
  }

  /**
   * F1-06: em vez de varrer todas as construções/depósitos/árvores para toda unidade, consulta
   * só o `blockerGrid` num raio `collisionRadius + 6` ao redor de cada unidade.
   */
  resolveBuildingCollisions() {
    const buf = this._blockerCollisionBuf;
    const all = this.allUnits;
    for (let i = 0; i < all.length; i++) {
      const unit = all[i];
      if (unit.isDead) continue;
      const pos = unit.mesh.position;
      const radius = (unit.collisionRadius || 0.6) + 6;
      this.blockerGrid.queryRadius(pos.x, pos.z, radius, null, buf);
      for (let j = 0; j < buf.length; j++) {
        this._checkUnitBlockerCollision(unit, buf[j]);
      }
    }
  }

  /**
   * F1-06: para cada unidade, consulta só o `unitGrid` num raio `r1 + unitGrid.maxRadius`
   * (o próprio `queryRadius` já soma o raio de cada candidata encontrada) e resolve apenas os
   * pares com `id` maior que o da unidade atual — cada par é resolvido uma única vez,
   * independentemente da ordem de iteração da grade (determinismo por id).
   */
  resolveUnitCollisions() {
    const buf = this._unitCollisionBuf;
    const all = this.allUnits;
    const maxR = this.unitGrid.maxRadius;

    for (let i = 0; i < all.length; i++) {
      const u1 = all[i];
      if (u1.isDead) continue;
      const p1 = u1.mesh.position;
      const r1 = u1.collisionRadius || 0.6;

      this.unitGrid.queryRadius(p1.x, p1.z, r1 + maxR, null, buf);
      for (let k = 0; k < buf.length; k++) {
        const u2 = buf[k];
        if (u2 === u1 || u2.id <= u1.id || u2.isDead) continue;

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
          // Ângulo derivado dos ids (determinístico) no lugar de Math.random() (F1-06).
          const angleDeg = ((u1.id * 73856093) ^ (u2.id * 19349663)) % 360;
          const angle = (angleDeg * Math.PI) / 180;
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

  /**
   * F2-04: fim da sessão de partida. Para as IAs, solta as entidades e descarta os
   * recursos próprios da partida que não ficam na cena (textura da névoa, árvores
   * instanciadas). As malhas que ainda estão na cena são descartadas pelo MatchSession.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.isGameOver = true; // update() vira no-op se alguém ainda chamar
    this.isPaused = true;

    // IAs: nenhuma usa timers próprios; basta tirar do loop.
    this.aiDirectors.forEach(d => d.dispose?.());
    this.aiDirectors = [];
    this.aiDirector = null;

    this.allUnits.forEach(u => u.dispose?.());
    this.buildings.forEach(b => (b.dispose ? b.dispose() : this.scene.remove(b.mesh)));
    this.trees.forEach(t => (t.dispose ? t.dispose() : this.scene.remove(t.mesh)));
    this.resourceDeposits.forEach(r => this.scene.remove(r.mesh));
    this.arrows.forEach(a => (a.dispose ? a.dispose() : this.scene.remove(a.mesh)));
    this.treeManager?.dispose();

    // Névoa por shader (F1-05): sem plano sobreposto (shroudMesh) para remover.
    this.fogOfWar?.dispose();

    this.allUnits = [];
    this._unitsByOwner.clear();
    this._hostileUnitsCache.clear();
    this.buildings = [];
    this.trees = [];
    this.resourceDeposits = [];
    this.arrows = [];
    this.selectedUnits = [];
    this.selectedBuilding = null;
    this.selectedResource = null;
    this.entityRegistry.clear();
    this.unitGrid.clear();
    this.blockerGrid.clear();
    if (this.terrain && this.terrain.pathfinder === this.pathfinder) this.terrain.pathfinder = null;
    this.uiManager = null;
    this.sceneManager = null;
  }
}
