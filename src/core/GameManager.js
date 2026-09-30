import * as THREE from 'three';
import { Unit } from '../entities/Unit.js';
import { Building } from '../entities/Building.js';
import { Wall, WallBatch } from '../entities/Wall.js';
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
import { ModelFactory } from '../entities/ModelFactory.js';
import { FogOfWar } from './FogOfWar.js';
import { AIDirector } from '../ai/AIDirector.js';
import { TreeManager } from '../world/TreeManager.js';
import { Pathfinder } from './Pathfinder.js';
import { HumanForge } from '../entities/buildings/HumanForge.js';

import {
  STARTING_RESOURCES, FACTIONS, WALL_STEP, WALL_MAX_POINTS, getBuildingDef, getUnitDef, isDropoffFor, RESEARCH, getMaxResearchLevel, promotedType
} from '../data/index.js';
import { Player } from '../sim/Player.js';
import { PlayerRegistry } from '../sim/PlayerRegistry.js';
import { EntityRegistry, NEUTRAL_OWNER_ID } from '../sim/EntityIds.js';
import { SpatialGrid } from '../sim/SpatialGrid.js';
import {
  createMatchConfig,
  layoutAt,
  validateMatchConfig
} from '../sim/MatchConfig.js';
import { SIM_DT, MAX_STEPS, animationLodStep } from '../sim/constants.js';
import { CMD, makeCommand } from '../sim/commands.js';
import { CommandQueue, COMMAND_DELAY_TICKS } from '../sim/CommandQueue.js';
import { CommandExecutor } from '../sim/CommandExecutor.js';
import { createRng } from '../sim/rng.js';
import { recordChecksum } from '../sim/checksum.js';
import { EventBus } from '../sim/EventBus.js';
import { EVT } from '../sim/events.js';
import { missingRequirements } from '../sim/requirements.js';

const EMPTY_LIST = Object.freeze([]);

// F1-09: buffers de módulo reutilizados pelo LOD de animação em renderUpdate (sem alocação/frame).
const _lodFrustum = new THREE.Frustum();
const _lodProjScreenMatrix = new THREE.Matrix4();
const _lodSphere = new THREE.Sphere(new THREE.Vector3(), 3);

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
    // F2-07: barramento de eventos da simulação — nem `simStep` nem as entidades chamam
    // `soundManager`/`particleSystem`/`uiManager` direto; emitem eventos aqui, despachados só em
    // `flush()` (fim do passo/quadro) para os ouvintes (`src/audio/AudioEvents.js`,
    // `src/render/VfxEvents.js`, `src/ui/UiEvents.js`), criados pela `MatchSession`.
    this.events = new EventBus();

    // Instanced Trees System (6 Draw Calls for all 180 Trees)
    this.treeManager = new TreeManager(this.scene);

    // Configuração da partida e jogadores (F2-01). Economia/pop/pesquisas vivem em Player.
    this.matchConfig = validateMatchConfig(matchConfig || createMatchConfig());
    // F2-03: partida headless (testes de determinismo em Node, sem DOM/WebGL) — nenhuma malha
    // procedural (textura em canvas) é criada; ver ModelFactory.getOrCreateModel.
    this.headless = !!this.matchConfig.headless;
    ModelFactory.headless = this.headless;
    /** @type {PlayerRegistry} */
    this.playerRegistry = new PlayerRegistry();
    this._localPlayerId = 0;

    // F2-03: RNG de simulação — determinístico, derivado da seed da partida. Tudo que altera
    // estado de jogo usa `this.rng` (ou um fork dele); RNG visual (Math.random) continua livre.
    this.rng = createRng(this.matchConfig.seed);
    this.rngMap = this.rng.fork('map');
    // F3-03: RNG do modelo de combate (computeDamage) — fork isolado para não perturbar
    // outros consumidores (mapa, IA, etc.) nem ser perturbado por eles.
    this.combatRng = this.rng.fork('combat');

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

    // F1-09: tick fixo — acumulador de tempo de simulação e contador de frames renderizados
    // (usado para espalhar o LOD de animação entre unidades via `id % k`).
    this._acc = 0;
    this._lastAlpha = 0;
    this._frameIndex = 0;

    // F2-02: sistema de comandos — única forma de alterar o estado do jogo. `currentTick`
    // incrementa a cada `simStep` (20 Hz); comandos emitidos por `issue()` são executados
    // no tick `currentTick + COMMAND_DELAY_TICKS` (0 agora — ver src/sim/CommandQueue.js).
    this.commands = new CommandQueue();
    this.currentTick = 0;
    // F2-03: checksum de estado (src/sim/checksum.js) a cada 20 ticks — últimos 100 (teste de
    // determinismo/replay). Não inclui nada visual.
    this.checksums = [];

    // Fog of War (F2-05: tamanho do mundo a partir do mapa — mesma margem de 20 u que o
    // mapa continental (140+20=160) sempre teve em relação à área jogável).
    const fogWorldSize = this.terrain.mapDef.size + 20;
    this.fogOfWar = new FogOfWar(this.scene, fogWorldSize, fogWorldSize);

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
      if (this.pathfinder && (entity instanceof Building || entity instanceof Tree)) {
        this.pathfinder.blockCircle(pos.x, pos.z, entity.collisionRadius || 0, +1);
        entity._pathBlocked = true;
      }
    }
  }

  _removeFromGrid(entity) {
    if (!entity) return;
    if (entity instanceof Unit) {
      this.unitGrid.remove(entity);
    } else if (entity instanceof Building || entity instanceof ResourceDeposit || entity instanceof Tree) {
      this.blockerGrid.remove(entity);
      if (this.pathfinder && entity._pathBlocked) {
        this.pathfinder.blockCircle(entity.mesh.position.x, entity.mesh.position.z, entity.collisionRadius || 0, -1);
        entity._pathBlocked = false;
      }
    }
  }

  getEntity(id) {
    return this.entityRegistry.get(id);
  }

  /**
   * F2-02: API pública para emitir um comando (única forma de alterar o estado do jogo,
   * fora do efeito interno documentado em `spawnUnit`/`src/debug/bench.js`). `fields` é o
   * mesmo objeto que `makeCommand` espera (`type`, `playerId`, + campos do tipo — ver
   * `src/sim/commands.js`); `tick` é preenchido aqui.
   */
  issue(fields) {
    const cmd = makeCommand({ ...fields, tick: this.currentTick + COMMAND_DELAY_TICKS });
    return this.commands.enqueue(cmd);
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
    this.headless = !!this.matchConfig.headless;
    ModelFactory.headless = this.headless;
    this.rng = createRng(this.matchConfig.seed);
    this.rngMap = this.rng.fork('map');
    this.combatRng = this.rng.fork('combat');
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
    if (this._wallBatches) {
      Object.values(this._wallBatches).forEach(wb => wb.dispose());
      this._wallBatches = null;
    }

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
    this.commands = new CommandQueue();
    this.currentTick = 0;
    this.checksums = [];

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
    // F2-05: mapa orientado a dados — slots, jazidas e florestas vêm de src/data/maps/<id>.json
    // (ver Terrain.mapDef; validateMatchConfig já garantiu que todo startSlot existe no mapa).
    const mapDef = this.terrain.mapDef;

    // 1. Jazidas fixas do mapa antes das bases, para que canPlaceBuilding as considere.
    this.spawnResourceDeposits();

    // 2. Bases iniciais a partir dos slots do mapa (mesmo layout de antes da F2-01/F2-05).
    for (const player of this.players) {
      const slot = mapDef.startSlots[player.startSlot];
      player.startPos = { x: slot.x, z: slot.z };
      this._spawnStartingBase(player, slot);
    }

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
   * Jazidas fixas do mapa (`mapDef.resources`). Uma entrada com `slot: N` só é criada se algum
   * jogador desta partida usar `startSlot === N` (jazidas extras de um slot de teste/FFA que não
   * faz parte do layout padrão do mapa — F2-05, ver `src/data/maps/README.md`).
   */
  spawnResourceDeposits() {
    const mapDef = this.terrain.mapDef;
    const usedSlots = new Set(this.players.map(p => p.startSlot));
    for (const r of mapDef.resources) {
      if (r.slot !== undefined && !usedSlots.has(r.slot)) continue;
      this.resourceDeposits.push(this.registerEntity(new ResourceDeposit(this.scene, this.terrain, r.type, r.x, r.z)));
    }
  }

  /**
   * Spawns spaced-out clusters of harvestable trees with strict clearance from all buildings,
   * base courtyards, resource deposits, and river crossings. Clusters vêm de `mapDef.forests`.
   */
  spawnWoodlands() {
    const treeTypes = ['oak', 'pine', 'autumn'];
    const minTreeSpacing = 4.4; // Generous distance between trees for open meadows

    const mapDef = this.terrain.mapDef;
    const fords = mapDef.fords || [];
    // Pátios das bases realmente usadas nesta partida (F2-05: slots vêm do mapa).
    const courtyards = this.players.map(p => p.startPos);

    const spawnCluster = (centerX, centerZ, targetCount, radius, preferredType = 'oak') => {
      let placed = 0;
      let attempts = 0;
      const maxAttempts = targetCount * 24;

      while (placed < targetCount && attempts < maxAttempts) {
        attempts++;
        const ang = this.rngMap.next() * Math.PI * 2;
        const dist = 2.0 + this.rngMap.next() * radius;
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
        if (fords.some(f => Math.hypot(x - f.x, z - f.z) < 9.0)) continue;

        // 6. Check minimum distance to all already placed trees
        const tooCloseToTree = this.trees.some(t => {
          const dx = t.mesh.position.x - x;
          const dz = t.mesh.position.z - z;
          return (dx * dx + dz * dz) < (minTreeSpacing * minTreeSpacing);
        });
        if (tooCloseToTree) continue;

        const type = this.rngMap.next() < 0.65 ? preferredType : this.rngMap.pick(treeTypes);
        this.trees.push(this.registerEntity(new Tree(this.scene, this.terrain, x, z, type, this.treeManager, this.rngMap)));
        placed++;
      }
    };

    // F2-05: clusters vêm de mapDef.forests, na mesma ordem de chamadas do JSON — preserva o
    // checksum de determinismo (mesma sequência de consumo de rngMap) para o mapa continental.
    for (const f of mapDef.forests) {
      spawnCluster(f.x, f.z, f.count, f.radius, f.species);
    }
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
  canPlaceBuilding(type, x, z, ignoreBuilding = null, ownerId = this._localPlayerId) {
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
    if (buildingHits.length > 0) {
      if (getBuildingDef(type).role !== 'wall') return false;
      // F3-08: muralha — o gap de 3,2 não vale contra muralhas do mesmo dono (distância mínima
      // entre centros 2,0, permite o passo WALL_STEP = 2,4) e cai para 0,5 contra torre/Centro
      // do mesmo dono; contra as demais construções (ou de outros donos) vale como sempre.
      for (let i = 0; i < buildingHits.length; i++) {
        const e = buildingHits[i];
        const d = Math.hypot(e.mesh.position.x - x, e.mesh.position.z - z);
        const er = e.collisionRadius || 3.0;
        let gap = minBuildingGap;
        if (e.ownerId === ownerId) {
          const role = getBuildingDef(e.type).role;
          if (role === 'wall') gap = -1.0;
          else if (role === 'tower' || role === 'hq') gap = 0.5;
        }
        if (d < radius + er + gap) return false;
      }
    }

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

    // 5. Must not block any of the map's river crossings / fords
    const fords = this.terrain.mapDef.fords || [];
    for (let i = 0; i < fords.length; i++) {
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
      // Aplica as pesquisas já concluídas (todos os níveis) do dono à unidade recém-treinada
      this.applyUpgradeToUnit(unit);
      player.recalculatePop(this);
      // Ponto de reunião: só para jogadores humanos (a IA sempre ignorou o rally no spawn;
      // mantido para a partida 1×1 continuar idêntica).
      if (rallyPoint && !player.isAI) {
        unit.moveTo(rallyPoint.x, rallyPoint.z, this);
      }
    }
    return unit;
  }

  /** F3-07: `true` quando a pesquisa já está no nível máximo (desabilita o botão na HUD). */
  isUpgradeResearched(upgradeId, owner = 'player') {
    const player = this.getPlayer(this.resolveOwnerId(owner));
    return player ? player.getResearchLevel(upgradeId) >= getMaxResearchLevel(upgradeId) : false;
  }

  /** F3-07: nível concluído (0..máx) da pesquisa para o dono. */
  getResearchLevel(upgradeId, owner = 'player') {
    const player = this.getPlayer(this.resolveOwnerId(owner));
    return player ? player.getResearchLevel(upgradeId) : 0;
  }

  isUpgradeResearching(upgradeId, owner = 'player') {
    const ownerId = this.resolveOwnerId(owner);
    return this.buildings.some(b => b.ownerId === ownerId && b.currentResearch && b.currentResearch.id === upgradeId);
  }

  /** F3-07: tipo efetivamente treinado para `unitType` (arqueiro → patrulheiro após `ranged_class`). */
  resolveTrainType(unitType, owner = 'player') {
    const player = this.getPlayer(this.resolveOwnerId(owner));
    if (!player) return unitType;
    return promotedType(unitType, player.researchLevels, t => getUnitDef(t).faction, player.factionId);
  }

  /** Conclui o próximo nível de `upgradeId` e aplica seu bônus/efeito às unidades vivas do dono. */
  completeUpgrade(upgradeId, owner = 'player') {
    const ownerId = this.resolveOwnerId(owner);
    const player = this.getPlayer(ownerId);
    const research = RESEARCH[upgradeId];
    if (!player || !research) return;
    const level = Math.min(player.getResearchLevel(upgradeId) + 1, research.levels.length);
    player.setResearchLevel(upgradeId, level);
    const lv = research.levels[level - 1];

    // Promoção de classe (F3-07): converte as unidades vivas ANTES de aplicar bônus de nível.
    if (lv.effect && lv.effect.promote) {
      this.getUnitsOf(ownerId).forEach(u => {
        if (u.isDead) return;
        const to = lv.effect.promote[u.type];
        if (to && getUnitDef(to).faction === player.factionId) this.promoteUnit(u, to);
      });
    }
    // Aplica só o delta deste nível às unidades vivas.
    this.getUnitsOf(ownerId).forEach(u => {
      if (!u.isDead) this.applyResearchLevelToUnit(u, upgradeId, level);
    });
    // F2-07: a notificação "Melhoria forjada" sai do evento RESEARCH_DONE (emitido por
    // `Building.simUpdate` ao concluir a pesquisa) — ver `src/ui/UiEvents.js`.
  }

  /**
   * F3-07: troca o tipo da unidade viva (classe avançada). Mantém % de PV e os bônus de pesquisa
   * já aplicados (soma só a diferença entre as definições base); o modelo 3D não muda.
   */
  promoteUnit(unit, toType) {
    const from = getUnitDef(unit.type);
    const to = getUnitDef(toType);
    const pct = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
    unit.type = toType;
    unit.name = to.entityName;
    unit.maxHp += to.hp - from.hp;
    unit.hp = Math.max(1, unit.maxHp * pct);
    unit.damage.basic += to.damage.basic - from.damage.basic;
    unit.damage.piercing += to.damage.piercing - from.damage.piercing;
    unit.armor = (unit.armor || 0) + ((to.armor || 0) - (from.armor || 0));
    unit.attackRange += to.attackRange - from.attackRange;
  }

  /** Aplica o bônus de UM nível de uma pesquisa à unidade (se ela for afetada). */
  applyResearchLevelToUnit(unit, upgradeId, level) {
    const research = RESEARCH[upgradeId];
    const lv = research && research.levels[level - 1];
    if (!lv) return;
    if (research.appliesTo && !research.appliesTo.includes(unit.type)) return;
    const b = lv.bonus;
    if (b) {
      // F3-03: `attack` é getter derivado (basic + piercing) — bônus soma nos campos reais.
      if (b.basic) unit.damage.basic += b.basic;
      if (b.piercing) unit.damage.piercing += b.piercing;
      if (b.armor) unit.armor = (unit.armor || 0) + b.armor;
      if (b.range) unit.attackRange += b.range;
      if (b.sight) unit.sightBonus = (unit.sightBonus || 0) + b.sight;
    }
    if (lv.effect && lv.effect.regen && research.appliesTo) unit.regen = (unit.regen || 0) + lv.effect.regen;
  }

  /**
   * Aplica à unidade todos os níveis já concluídos (ou só `upgradeId`, todos os níveis
   * concluídos dele) do dono. Usado ao treinar unidades novas.
   */
  applyUpgradeToUnit(unit, upgradeId = null) {
    const player = this.getPlayer(unit.ownerId);
    if (!player) return;
    const ids = upgradeId ? [upgradeId] : Object.keys(RESEARCH);
    for (const id of ids) {
      const lvls = player.getResearchLevel(id);
      for (let l = 1; l <= lvls; l++) this.applyResearchLevelToUnit(unit, id, l);
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
      case 'wall_human':
      case 'wall_orc':
        b = new Wall(this.scene, this.terrain, type, x, z, isConstructed, ownerId);
        b.gameManager = this;
        if (!this.headless) b.attachToBatch(this.getWallBatch(type === 'wall_orc' ? 'orc' : 'human'));
        break;
      default:
        b = new Building(this.scene, this.terrain, type, x, z, isConstructed, ownerId);
        break;
    }
    b.gameManager = this;
    this.registerEntity(b, ownerId);
    return b;
  }

  /**
   * F2-02: executor do comando PLACE_BUILDING (chamado só por `CommandExecutor`, nunca
   * direto pela UI/IA — ver `GameManager.issue`). Valida o custo aqui (não no clique):
   * se `ownerId` não puder pagar, descarta e notifica o jogador local (se for ele).
   * `unitIds` são os construtores pré-selecionados (podem vir vazios: usa o vilão/peão
   * vivo mais próximo do dono).
   */
  placeBuilding(type, x, z, unitIds, ownerId) {
    const owner = this.getPlayer(ownerId);
    if (!owner) return null;

    const stats = getBuildingDef(type);

    const missing = missingRequirements(ownerId, type, this);
    if (missing.length > 0) {
      if (owner.isLocal) {
        const names = missing.map(t => getBuildingDef(t).name).join(', ');
        this.events.emit(EVT.NOTIFY, { ownerId, text: `⚠️ Requer: ${names}` });
      }
      return null;
    }

    if (!owner.canAfford(stats.cost)) {
      if (owner.isLocal) this.events.emit(EVT.NOTIFY, { ownerId, text: '⚠️ Recursos insuficientes!' });
      return null;
    }
    owner.deduct(stats.cost);

    const b = this._createPlacedBuilding(type, x, z, ownerId);

    // Task workers (villagers or peons) to construct it — só os do próprio dono.
    const builders = (unitIds || [])
      .map(id => this.entitiesById.get(id))
      .filter(u => u && !u.isDead && u.ownerId === ownerId && (u.type === 'villager' || u.type === 'peon'));

    if (builders.length > 0) {
      builders.forEach(v => v.orderBuild(b));
    } else {
      let nearestV = null;
      let minDist = Infinity;
      this.getUnitsOf(ownerId).forEach(u => {
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

  /**
   * Cria (em obra) e registra uma construção posicionada por jogador — parte comum de
   * `placeBuilding` e `placeWall` (sem cobrança nem ordem de construção).
   */
  _createPlacedBuilding(type, x, z, ownerId) {
    const b = this.createBuilding(type, x, z, false, ownerId);
    this.buildings.push(b);
    this.events.emit(EVT.BUILDING_PLACED, {
      buildingId: b.id,
      ownerId,
      pos: { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z },
      buildingType: type
    });
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
    return b;
  }

  /** F3-08: InstancedMesh compartilhado dos segmentos de muralha da facção ('human' | 'orc'). */
  getWallBatch(faction) {
    if (!this._wallBatches) this._wallBatches = {};
    if (!this._wallBatches[faction]) this._wallBatches[faction] = new WallBatch(this.scene, faction);
    return this._wallBatches[faction];
  }

  /**
   * F3-08: executor do comando PLACE_WALL. `points` = [{x,z}] (≤ WALL_MAX_POINTS). Valida cada
   * ponto na ordem (`canPlaceBuilding` + distância mínima entre os próprios pontos do comando),
   * cobra `n × custo` só dos válidos (tudo ou nada: sem recursos para todos, nada é criado) e
   * cria um segmento por ponto válido (1 BUILDING_PLACED por segmento). Os aldeões/peões
   * escolhidos (ou o mais próximo) recebem os segmentos numa fila de obras, cada um começando
   * num segmento diferente para trabalharem em paralelo.
   * @returns {Wall[]} segmentos criados
   */
  placeWall(type, points, unitIds, ownerId) {
    const owner = this.getPlayer(ownerId);
    if (!owner || !Array.isArray(points)) return [];
    const stats = getBuildingDef(type);
    if (stats.role !== 'wall') return [];

    const missing = missingRequirements(ownerId, type, this);
    if (missing.length > 0) {
      if (owner.isLocal) {
        const names = missing.map(t => getBuildingDef(t).name).join(', ');
        this.events.emit(EVT.NOTIFY, { ownerId, text: `⚠️ Requer: ${names}` });
      }
      return [];
    }

    const list = points.length > WALL_MAX_POINTS ? points.slice(0, WALL_MAX_POINTS) : points;
    const minSelfDist = WALL_STEP * 0.8;
    const valid = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      let clash = false;
      for (let j = 0; j < valid.length; j++) {
        if (Math.hypot(valid[j].x - p.x, valid[j].z - p.z) < minSelfDist) { clash = true; break; }
      }
      if (clash) continue;
      if (!this.canPlaceBuilding(type, p.x, p.z, null, ownerId)) continue;
      valid.push({ x: p.x, z: p.z });
    }

    if (valid.length === 0) {
      if (owner.isLocal) this.events.emit(EVT.NOTIFY, { ownerId, text: '⚠️ Muralha: sem pontos válidos' });
      return [];
    }

    const total = {};
    for (const k of Object.keys(stats.cost)) total[k] = stats.cost[k] * valid.length;
    if (!owner.canAfford(total)) {
      if (owner.isLocal) this.events.emit(EVT.NOTIFY, { ownerId, text: '⚠️ Recursos insuficientes!' });
      return [];
    }
    owner.deduct(total);

    const created = valid.map(p => this._createPlacedBuilding(type, p.x, p.z, ownerId));

    let builders = (unitIds || [])
      .map(id => this.entitiesById.get(id))
      .filter(u => u && !u.isDead && u.ownerId === ownerId && (u.type === 'villager' || u.type === 'peon'));
    if (builders.length === 0) {
      let nearest = null;
      let minDist = Infinity;
      const first = created[0].mesh.position;
      this.getUnitsOf(ownerId).forEach(u => {
        if (!u.isDead && (u.type === 'villager' || u.type === 'peon')) {
          const d = u.mesh.position.distanceTo(first);
          if (d < minDist) { minDist = d; nearest = u; }
        }
      });
      if (nearest) builders = [nearest];
    }
    const n = created.length;
    for (let bi = 0; bi < builders.length; bi++) {
      const worker = builders[bi];
      const start = bi % n;
      worker.orderQueue = null;
      worker.orderBuild(created[start]);
      for (let k = 1; k < n; k++) {
        if (!worker.orderQueue) worker.orderQueue = [];
        worker.orderQueue.push({ type: CMD.BUILD, target: created[(start + k) % n] });
      }
    }
    return created;
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

  /**
   * F2-02: tradutor do clique direito → emite um comando (MOVE/ATTACK/GATHER/BUILD/RALLY;
   * ver `src/sim/commands.js`) em vez de chamar as entidades diretamente. A formação de
   * MOVE (offsets por unidade) é calculada pelo `CommandExecutor`, não aqui: o comando
   * carrega só o ponto clicado.
   */
  issueOrder(entityUnderCursor, groundPoint) {
    this.selectedUnits = this.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    if (this.selectedUnits.length === 0) {
      if (this.selectedBuilding && groundPoint) {
        let rallyPoint = groundPoint;
        if (this.pathfinder && this.pathfinder.isWater(rallyPoint.x, rallyPoint.z)) {
          rallyPoint = this.pathfinder.findNearestWalkable(rallyPoint.x, rallyPoint.z);
        }
        this.issue({
          type: CMD.RALLY,
          playerId: this._localPlayerId,
          buildingId: this.selectedBuilding.id,
          x: rallyPoint.x,
          z: rallyPoint.z
        });
        this.soundManager.playOrder();
      }
      return;
    }

    this.soundManager.playOrder();
    const unitIds = this.selectedUnits.map(u => u.id);

    if (entityUnderCursor) {
      const e = entityUnderCursor;
      // Right-clicked a hostile unit/building: Attack!
      if ((e instanceof Unit || e instanceof Building) && this.isHostile(this._localPlayerId, e.ownerId)) {
        this.issue({ type: CMD.ATTACK, playerId: this._localPlayerId, unitIds, targetId: e.id });
        return;
      }
      // Right-clicked a resource: Gather! (Villagers and Peons)
      if (e instanceof Tree || e instanceof ResourceDeposit) {
        const isDepleted = e.isDead || (e.woodRemaining !== undefined && e.woodRemaining <= 0) || (e.resourcesRemaining !== undefined && e.resourcesRemaining <= 0);
        if (!isDepleted) {
          const workerIds = this.selectedUnits.filter(u => u.type === 'villager' || u.type === 'peon').map(u => u.id);
          if (workerIds.length > 0) {
            this.issue({ type: CMD.GATHER, playerId: this._localPlayerId, unitIds: workerIds, targetId: e.id });
            return;
          }
        }
        // If resource is depleted (e.g. cut stump with no wood) or non-workers selected, move units towards target
        if (groundPoint) {
          this.issue({ type: CMD.MOVE, playerId: this._localPlayerId, unitIds, x: groundPoint.x, z: groundPoint.z });
          return;
        }
        return;
      }
      // Right-clicked an incomplete building: Build!
      if (e instanceof Building && !e.isConstructed && e.ownerId === this._localPlayerId) {
        const workerIds = this.selectedUnits.filter(u => u.type === 'villager' || u.type === 'peon').map(u => u.id);
        this.issue({ type: CMD.BUILD, playerId: this._localPlayerId, unitIds: workerIds, buildingId: e.id });
        return;
      }
    }

    // Right-clicked ground: Move (o executor calcula a formação e evita água)
    if (groundPoint) {
      this.issue({ type: CMD.MOVE, playerId: this._localPlayerId, unitIds, x: groundPoint.x, z: groundPoint.z });
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
        this.events.emit(EVT.MATCH_WON, { ownerId: local.id });
      }
      return true;
    }

    // Partida continua (FFA/times): avisa quem caiu. A IA derrotada para de jogar (ver update).
    newlyDefeated.forEach(p => {
      this.events.emit(EVT.PLAYER_DEFEATED, { ownerId: p.id, name: p.name });
    });
    return false;
  }

  /**
   * F1-09: avança a simulação em passos fixos de `SIM_DT` (20 Hz), determinístico em relação ao
   * FPS. `frameDelta` é o delta do frame renderizado (já limitado); internamente é multiplicado
   * por `gameSpeed` e acumulado — cada passo de `simStep` sempre recebe exatamente `SIM_DT`.
   * Retorna `alpha` ∈ [0,1): fração do próximo passo ainda não simulada, usada por
   * `renderUpdate` para interpolar a pose visual entre o passo anterior e o atual.
   */
  advance(frameDelta) {
    if (this.isPaused || this.isGameOver) return this._lastAlpha;

    // Desfaz a interpolação visual do frame anterior: a simulação sempre parte da última pose
    // simulada real (`_simPos`/`_simRotY`), nunca da pose interpolada exibida na tela.
    this._restoreSimPose();

    this._acc += frameDelta * this.gameSpeed;
    let steps = 0;
    // Épsilon evita perder/ganhar um passo por erro de arredondamento de ponto flutuante
    // (ex.: somar 1/30 sessenta vezes fica ligeiramente abaixo de 2.0, não exatamente 2.0).
    while (this._acc >= SIM_DT - 1e-9 && steps < MAX_STEPS) {
      this._snapshotPrevPose();
      this.simStep(SIM_DT);
      this._snapshotSimPose();
      this._acc -= SIM_DT;
      steps++;
    }
    // Frame(s) muito lentos: evita espiral de morte (acumulador cresce mais rápido do que a
    // simulação consegue consumir) descartando o excedente.
    if (steps >= MAX_STEPS) this._acc = 0;

    // Clamp: o épsilon do laço acima pode deixar `_acc` ligeiramente negativo por arredondamento.
    if (this._acc < 0) this._acc = 0;
    this._lastAlpha = this._acc / SIM_DT;
    return this._lastAlpha;
  }

  /** Pose visual (interpolada) → pose de simulação, antes de rodar `simStep` neste frame. */
  _restoreSimPose() {
    const all = this.allUnits;
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (!u._simPos) continue;
      u.mesh.position.copy(u._simPos);
      u.mesh.rotation.y = u._simRotY;
    }
    const arrows = this.arrows;
    for (let i = 0; i < arrows.length; i++) {
      const a = arrows[i];
      if (!a._simPos) continue;
      a.mesh.position.copy(a._simPos);
      a.mesh.quaternion.copy(a._simQuat);
    }
  }

  /** Pose atual (antes de rodar um passo de simulação) → `_prevPos`/`_prevRotY`. */
  _snapshotPrevPose() {
    const all = this.allUnits;
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (!u._prevPos) continue;
      u._prevPos.copy(u.mesh.position);
      u._prevRotY = u.mesh.rotation.y;
    }
    const arrows = this.arrows;
    for (let i = 0; i < arrows.length; i++) {
      const a = arrows[i];
      if (!a._prevPos) continue;
      a._prevPos.copy(a.mesh.position);
      a._prevQuat.copy(a.mesh.quaternion);
    }
  }

  /** Pose atual (depois de rodar um passo de simulação) → `_simPos`/`_simRotY`. */
  _snapshotSimPose() {
    const all = this.allUnits;
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (!u._simPos) continue;
      u._simPos.copy(u.mesh.position);
      u._simRotY = u.mesh.rotation.y;
    }
    const arrows = this.arrows;
    for (let i = 0; i < arrows.length; i++) {
      const a = arrows[i];
      if (!a._simPos) continue;
      a._simPos.copy(a.mesh.position);
      a._simQuat.copy(a.mesh.quaternion);
    }
  }

  /**
   * F1-09: um passo de simulação de `dt` segundos fixos (sempre `SIM_DT`, exceto em testes).
   * Corpo antigo de `update(delta)`: vitória, árvores, projéteis, construções, unidades,
   * colisões, IA, névoa, limpeza. Sem chamadas de animação/visual (ver `renderUpdate`).
   */
  simStep(dt) {
    // F2-02: drena e executa os comandos agendados para este tick (única forma de alterar o
    // estado do jogo). Incrementa `currentTick` já aqui, antes do resto do passo, para que o
    // contador sempre avance mesmo num `return` antecipado (fim de partida) mais abaixo.
    const tick = this.currentTick;
    this.currentTick = tick + 1;
    const dueCommands = this.commands.drain(tick);
    for (let i = 0; i < dueCommands.length; i++) {
      CommandExecutor.execute(this, dueCommands[i]);
    }

    this.gameTime += dt;

    // Check Win/Loss conditions
    if (this._updateVictoryConditions()) {
      this.events.flush();
      return;
    }

    // Orçamento de A* por passo de simulação (F1-07): resolve pedidos pendentes de requestPath.
    // F2-03: orçamento por nós expandidos (não por relógio) — mesmo limite em todas as máquinas.
    if (this.pathfinder) this.pathfinder.processQueue(4000);

    // Update Trees (árvore cortada — isDead/woodRemaining <= 0 — sai do blockerGrid; remove()
    // é no-op se já não estiver na grade, então repetir o teste em árvores já cortadas é barato)
    this.trees.forEach(t => {
      t.update(dt, this.events);
      if (t.isDead || t.woodRemaining <= 0) {
        this.blockerGrid.remove(t);
        if (this.pathfinder && t._pathBlocked) {
          this.pathfinder.blockCircle(t.mesh.position.x, t.mesh.position.z, t.collisionRadius || 0, -1);
          t._pathBlocked = false;
        }
      }
    });

    // Update Projectiles
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      this.arrows[i].simStep(dt);
      if (this.arrows[i].isDead) {
        const deadArrow = this.arrows.splice(i, 1)[0];
        this.unregisterEntity(deadArrow);
      }
    }

    // Lista única de unidades (todos os jogadores). Construções filtram alvos por isHostile.
    const allUnits = this.allUnits;

    // Update Buildings (lógica de jogo; VFX/billboard vão em renderUpdate)
    this.buildings.forEach(b => {
      b.simUpdate(dt, this, this.arrows, allUnits, allUnits);
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
      const u = allUnits[i];
      // F3-07: regeneração de pesquisa (`effect.regen`, PV/s) — nunca passa do máximo.
      if (u.regen > 0 && !u.isDead && !u.isDying && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + u.regen * dt);
      }
      u.update(dt, this, this.arrows, allUnits, this.buildings);
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

    // F2-03: checksum de estado a cada 20 ticks (teste de determinismo/replay).
    if (this.currentTick % 20 === 0) recordChecksum(this);

    // F2-07: despacha os eventos emitidos neste passo para os ouvintes (áudio/VFX/UI) — depois
    // do checksum, para nunca influenciar o estado determinístico.
    this.events.flush();
  }

  /**
   * F1-09: parte visual do quadro — roda a cada frame renderizado (não a cada passo de
   * simulação). Interpola posição/rotação de unidades e projéteis entre a pose anterior e a
   * atual (`alpha`), aplica o LOD de animação por distância/frustum/visibilidade e atualiza
   * VFX/billboards de construções.
   * @param {number} frameDelta  segundos reais desde o último frame renderizado
   * @param {number} alpha  fração ∈ [0,1) do próximo passo de simulação ainda não ocorrida
   */
  renderUpdate(frameDelta, alpha) {
    if (this.isPaused || this.isGameOver) return;

    // Projéteis: pose interpolada (posição + quaternion completo — trajetória balística).
    const arrows = this.arrows;
    for (let i = 0; i < arrows.length; i++) {
      arrows[i].renderUpdate(alpha);
    }

    // Construções: billboards, chamas, fumaça e VFX customizado das subclasses.
    this.buildings.forEach(b => {
      b.renderUpdate(frameDelta, this);
    });

    // LOD de animação por unidade (F1-09 item 4): frustum + distância à câmera-alvo.
    this._frameIndex++;
    const sm = this.sceneManager;
    const camera = sm && sm.camera;
    let frustum = null;
    let camTarget = null;
    if (camera && sm) {
      _lodProjScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum = _lodFrustum.setFromProjectionMatrix(_lodProjScreenMatrix);
      camTarget = sm.cameraTarget;
    }

    const all = this.allUnits;
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (u.canRemove) continue;

      let animDelta = frameDelta;
      let lodStep = 1;

      if (frustum) {
        const mesh = u.mesh;
        const visible = mesh.visible !== false;
        _lodSphere.center.copy(mesh.position);
        const inView = visible && frustum.intersectsSphere(_lodSphere);

        if (!visible || !inView) {
          // Fora de tela/névoa: não anima; acumula o delta perdido (até 0,5s) para não
          // "saltar" a animação quando a unidade reaparecer.
          u._animAcc = Math.min(0.5, (u._animAcc || 0) + frameDelta);
          animDelta = 0;
          lodStep = 0;
        } else if (u._animAcc) {
          // Reapareceu: entrega de uma vez o delta acumulado enquanto estava oculta.
          animDelta = frameDelta + u._animAcc;
          u._animAcc = 0;
          lodStep = 1;
        } else {
          const dist = camTarget.distanceTo(mesh.position);
          lodStep = animationLodStep(dist, this._frameIndex, u.id);
          if (lodStep && dist > 60) {
            // Anima só a cada k frames (k=2 até 100, k=4 acima) — entrega de uma vez o delta
            // de k frames para não parecer mais lento que o normal.
            animDelta = frameDelta * (dist <= 100 ? 2 : 4);
          } else if (!lodStep) {
            animDelta = 0;
          }
        }
      }

      u.renderUpdate(animDelta, alpha, lodStep);
    }

    // F2-07: VFX ambiente (fumaça de chaminé, faíscas…) emitido durante o quadro renderizado
    // (fora do tick fixo) — despacha já aqui em vez de esperar o próximo `simStep` (até 50 ms).
    this.events.flush();
  }

  /**
   * Wrapper legado: `advance` + `renderUpdate` num só frame renderizado = o antigo `update(delta)`
   * com delta variável (F1-09). Mantido para testes/bench antigos que não distinguem sim/render.
   */
  update(delta) {
    const alpha = this.advance(delta);
    this.renderUpdate(delta, alpha);
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
      unit.depositResources(this);
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
    if (this._wallBatches) {
      Object.values(this._wallBatches).forEach(wb => wb.dispose());
      this._wallBatches = null;
    }

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
