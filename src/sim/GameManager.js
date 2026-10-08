import { Unit } from './Unit.js';
import { Building } from './Building.js';
import { Wall } from './Wall.js';
import { Tree } from './Tree.js';
import { ResourceDeposit } from './ResourceDeposit.js';
import { FogOfWar } from './FogOfWar.js';
import { createAIDirector } from './aiRegistry.js';
import { Pathfinder } from './Pathfinder.js';

import {
  STARTING_RESOURCES, FACTIONS, WALL_STEP, WALL_MAX_POINTS, getBuildingDef, getUnitDef, isDropoffFor, RESEARCH, getMaxResearchLevel, promotedType, getHqUpgradeCost
} from '../data/index.js';
import { Player } from './Player.js';
import { PlayerRegistry } from './PlayerRegistry.js';
import { EntityRegistry, NEUTRAL_OWNER_ID, NEUTRAL_HOSTILE_ID } from './EntityIds.js';
import { Critter } from './Critter.js';
import { SpatialGrid } from './SpatialGrid.js';
import {
  createMatchConfig,
  layoutAt,
  validateMatchConfig,
  difficultyOf
} from './MatchConfig.js';
import { SIM_DT, MAX_STEPS } from './constants.js';
import { CMD, makeCommand } from './commands.js';
import { CommandQueue, COMMAND_DELAY_TICKS } from './CommandQueue.js';
import { CommandExecutor } from './CommandExecutor.js';
import { createRng } from './rng.js';
import { recordChecksum } from './checksum.js';
import { CorpsePool } from './corpses.js';
import { HazardPool } from './hazards.js';
import { EventBus } from './EventBus.js';
import { EVT } from './events.js';
import { MatchStats } from './MatchStats.js';
import { isPlayerDefeated } from './victory.js';
import { missingRequirements, formatRequirementList } from './requirements.js';
import { NAVAL_MAX_HEIGHT, WATER_LEVEL } from '../data/combat.js';

const EMPTY_LIST = Object.freeze([]);

export class GameManager {
  /**
   * F2-08c: simulação pura — sem cena/three.js/DOM. As malhas vivem nas views (`src/render/EntityViews.js`, criada
   * pela `MatchSession`); `fogView`/`hazardView`/`entityViews` e os ganchos de HUD/áudio/cena são apenas ganchos de
   * apresentação preenchidos por quem monta a partida (nunca lidos pela lógica de simulação).
   * @param {import('./Terrain.js').Terrain} terrain
   * @param {*} [_sound]  legado (F2-08d): ignorado — a sim não conhece áudio; ouvintes em `src/audio/AudioEvents.js`
   * @param {*} [_particles]  legado (F2-08d): ignorado — VFX via `src/render/VfxEvents.js`
   * @param {object|null} [matchConfig]  ver src/sim/MatchConfig.js (padrão: 1×1 humano local × IA orc)
   */
  constructor(terrain, _sound = null, _particles = null, matchConfig = null) {
    this.terrain = terrain;
    // F2-07: barramento de eventos da simulação — nem `simStep` nem as entidades chamam
    // som/partículas/HUD direto; emitem eventos aqui, despachados só em
    // `flush()` (fim do passo/quadro) para os ouvintes (`src/audio/AudioEvents.js`,
    // `src/render/VfxEvents.js`, `src/ui/UiEvents.js`), criados pela `MatchSession`.
    this.events = new EventBus();
    // F3-09: estatísticas da partida (só lê eventos) e resultado congelado ao fim da partida.
    this.matchStats = new MatchStats(this);
    /** @type {object|null} snapshot de `matchStats` tirado quando a partida termina */
    this.result = null;

    // Configuração da partida e jogadores (F2-01). Economia/pop/pesquisas vivem em Player.
    this.matchConfig = validateMatchConfig(matchConfig || createMatchConfig());
    // F2-03: partida headless (testes de determinismo em Node, sem DOM/WebGL) — quem monta as views (MatchSession)
    // não cria malhas nesse modo.
    this.headless = !!this.matchConfig.headless;
    /** @type {PlayerRegistry} */
    this.playerRegistry = new PlayerRegistry();
    this._localPlayerId = 0;
    /** F9-03: partida online — `netIssue(fields)` desvia comandos da UI para a sessão lockstep; `_inStep` marca passos da sim. */
    this.netIssue = null;
    this._inStep = false;

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
    /** Projéteis em voo: `Projectile`s de `src/sim/projectiles.js` (nome legado `arrows`); malhas em `render/ProjectileViews`. */
    this.arrows = [];
    /** F3-10: critters decorativos (Critter, fora de `allUnits`/grades) e acampamentos neutros. */
    this.critters = [];
    /** F4-04: pool fixo de cadáveres (só dados; `src/sim/corpses.js`) — consumidos por Erguer Mortos. */
    this.corpses = new CorpsePool();
    /** F4-04b: runas explosivas e redemoinhos (só dados; `src/sim/hazards.js`). */
    this.hazards = new HazardPool(this);
    /** @type {Map<number, {remaining:number, reward:object, pos:{x:number,z:number}}>} campId → cluster */
    this._camps = new Map();

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
    this.fogOfWar = new FogOfWar(fogWorldSize, fogWorldSize);
    /** Listas usadas pela `FogView` a cada quadro (recalculadas em `simStep`, junto com `fogOfWar.update`). */
    this._fogLists = { playerUnits: [], playerBuildings: [], enemyUnits: [], enemyBuildings: [] };

    // Um AIDirector por jogador de IA. `aiDirector` = o primeiro (compatibilidade: bench, UI).
    /** @type {any[]} */
    this.aiDirectors = [];
    this.aiDirector = null;

    // Terrain Navigation & Water Obstacle Pathfinder
    this.pathfinder = new Pathfinder(this.terrain);
    this.terrain.pathfinder = this.pathfinder;
    // F4-07a: grade de navegação dos navios (água com profundidade ≥ NAVAL_MIN_DEPTH); mesma API, fila/cache próprios.
    this.navalPathfinder = new Pathfinder(this.terrain, undefined, 1.5, 'naval');

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
      // F4-07a: poços, plataformas e construções costeiras também bloqueiam a grade naval (o resto está em terra).
      if (this.navalPathfinder && (entity instanceof ResourceDeposit ? entity.type === 'oil' : (entity instanceof Building && (entity.coastal || entity.role === 'platform')))) {
        this.navalPathfinder.blockCircle(pos.x, pos.z, entity.collisionRadius || 0, +1);
        entity._navalBlocked = true;
      }
      if (this.pathfinder && (entity instanceof Building || entity instanceof Tree)) {
        this.pathfinder.blockCircle(pos.x, pos.z, entity.collisionRadius || 0, +1);
        entity._pathBlocked = true;
      } else if (this.pathfinder && entity instanceof ResourceDeposit) {
        // F3-02: minas só bloqueiam as buscas "largas" (grupos/unidades grandes) — ver Pathfinder.blockCircle(soft).
        this.pathfinder.blockCircle(pos.x, pos.z, entity.collisionRadius || 0, +1, true);
        entity._pathSoftBlocked = true;
      }
    }
  }

  _removeFromGrid(entity) {
    if (!entity) return;
    if (entity instanceof Unit) {
      this.unitGrid.remove(entity);
    } else if (entity instanceof Building || entity instanceof ResourceDeposit || entity instanceof Tree) {
      this.blockerGrid.remove(entity);
      if (this.navalPathfinder && entity._navalBlocked) {
        this.navalPathfinder.blockCircle(entity.mesh.position.x, entity.mesh.position.z, entity.collisionRadius || 0, -1);
        entity._navalBlocked = false;
      }
      if (this.pathfinder && entity._pathBlocked) {
        this.pathfinder.blockCircle(entity.mesh.position.x, entity.mesh.position.z, entity.collisionRadius || 0, -1);
        entity._pathBlocked = false;
      }
      if (this.pathfinder && entity._pathSoftBlocked) {
        this.pathfinder.blockCircle(entity.mesh.position.x, entity.mesh.position.z, entity.collisionRadius || 0, -1, true);
        entity._pathSoftBlocked = false;
      }
    }
  }

  getEntity(id) {
    return this.entityRegistry.get(id);
  }

  /**
   * F3-05: nº de unidades (exceto `except`) vivas que têm `building` como alvo de obra/reparo.
   * Varredura determinística sobre `allUnits` (sem estado extra).
   */
  countWorkersOn(building, except = null) {
    const units = this.allUnits;
    let n = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u === except || u.isDead) continue;
      if (u.buildTarget === building || u.repairTarget === building) n++;
    }
    return n;
  }

  /**
   * F9-04: jogador humano que saiu/caiu vira IA (`difficultyOf` = dificuldade configurada). Chamado pela
   * sessão lockstep NO MESMO tick em todos os pares (antes do passo do turno), então é determinístico.
   * O diretor é anexado ao fim de `aiDirectors` (ordem de atualização estável).
   */
  convertPlayerToAI(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.isAI || player.defeated) return false;
    player.isAI = true;
    const pos = player.startPos || { x: 0, z: 0 };
    const director = createAIDirector(this, player.id, { x: pos.x, y: pos.z }, difficultyOf(this.matchConfig, player.id));
    this.aiDirectors.push(director);
    if (!this.aiDirector) this.aiDirector = director;
    return true;
  }

  /** F9-04: inverso de `convertPlayerToAI` (jogador que volta à partida reassume o controle). */
  convertPlayerToHuman(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || !player.isAI) return false;
    player.isAI = false;
    const i = this.aiDirectors.findIndex((d) => d.playerId === playerId);
    if (i >= 0) {
      const [d] = this.aiDirectors.splice(i, 1);
      d.dispose?.();
      if (this.aiDirector === d) this.aiDirector = this.aiDirectors[0] || null;
    }
    return true;
  }

  /**
   * F2-02: API pública para emitir um comando (única forma de alterar o estado do jogo,
   * fora do efeito interno documentado em `spawnUnit`/`src/debug/bench.js`). `fields` é o
   * mesmo objeto que `makeCommand` espera (`type`, `playerId`, + campos do tipo — ver
   * `src/sim/commands.js`); `tick` é preenchido aqui.
   */
  issue(fields) {
    // F9-03: em partida online, comandos da UI (fora de `simStep`) vão para a sessão lockstep e só
    // entram na `CommandQueue` quando o turno executa. Comandos da própria sim (IA) passam direto.
    if (this.netIssue && !this._inStep) {
      this.netIssue(fields);
      return null;
    }
    const cmd = makeCommand({ ...fields, tick: this.currentTick + COMMAND_DELAY_TICKS });
    this.matchStats.countCommand(fields.playerId);
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
    this.startMatch(createMatchConfig({ localFaction: faction, ffa, seed: this.matchConfig.seed, mapId: this.matchConfig.mapId, victoryMode: this.matchConfig.victoryMode }));
  }

  /** Recria o mapa com uma nova MatchConfig e centraliza a câmera na base do jogador local. */
  startMatch(matchConfig) {
    this.matchConfig = validateMatchConfig(matchConfig);
    this.headless = !!this.matchConfig.headless;
    this.rng = createRng(this.matchConfig.seed);
    this.rngMap = this.rng.fork('map');
    this.combatRng = this.rng.fork('combat');
    this.resetMap();
    if (this.onMatchStarted) this.onMatchStarted(this); // gancho de apresentação (câmera na base local)
  }

  resetMap() {
    // F2-08c: as malhas de unidades/construções são das views (`EntityViews` as remove no próximo quadro).
    this.allUnits.forEach(u => u.dispose?.());
    this.buildings.forEach(b => b.dispose?.());
    this.trees.forEach(t => t.dispose());
    this.critters.forEach(c => c.dispose());

    this.allUnits = [];
    this._unitsByOwner.clear();
    this._hostileUnitsCache.clear();
    this.buildings = [];
    this.trees = [];
    this.resourceDeposits = [];
    this.critters = [];
    this.corpses.clear();
    this.hazards.clear();
    this._camps = new Map();
    this.selectedUnits = [];
    this.selectedBuilding = null;
    this.selectedResource = null;
    this.isGameOver = false;
    this.gameWon = false;
    this.result = null;
    this.gameTime = 0;
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
      this.matchConfig.players.map(spec => new Player({ ...spec, resources: this.matchConfig.startingResources || STARTING_RESOURCES })) // F6-02: recursos iniciais da config
    );
    // F3-10: jogador neutro hostil (id 99) só existe quando o mapa tem `neutrals`.
    const neutrals = this.terrain.mapDef.neutrals;
    if (neutrals && neutrals.length > 0) {
      this.playerRegistry.add(new Player({
        id: NEUTRAL_HOSTILE_ID,
        name: 'Bandoleiros',
        factionId: 'human',
        team: NEUTRAL_HOSTILE_ID,
        color: '#f97316',
        isNeutralHostile: true,
        startSlot: -1,
        resources: { wood: 0, gold: 0, stone: 0 }
      }));
    }
    this._localPlayerId = this.playerRegistry.localPlayer.id;
    this.playerRegistry.players.forEach(p => { p.events = this.events; });
    this.matchStats.reset();
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

    // 2b. F3-10: acampamentos de bandidos e critters (antes das florestas: elas evitam o acampamento).
    this.spawnNeutrals();

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
      const director = createAIDirector(this, player.id, { x: pos.x, y: pos.z }, difficultyOf(this.matchConfig, player.id));
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
      this.resourceDeposits.push(this.registerEntity(new ResourceDeposit(this.terrain, r.type, r.x, r.z, typeof r.amount === 'number' ? r.amount : undefined)));
    }
  }

  /**
   * F3-10: entidades neutras do mapa (`mapDef.neutrals`, ver src/data/maps/README.md).
   * - `camp`: 1 `bandit_camp` (dono `NEUTRAL_HOSTILE_ID`, já concluído), `guards` bandidos em
   *   círculo (raio 5, com leash — ver `Unit._updateGuardLeash`) e a jazida `deposit` a ~9 unidades.
   * - `critters`: `count` ovelhas/porcos passeando ao redor de (x, z).
   * Usa um fork determinístico de `this.rng` (nunca `Math.random`; não consome `rngMap`).
   */
  spawnNeutrals() {
    const list = this.terrain.mapDef.neutrals || [];
    if (list.length === 0) return;
    const rng = this.rng.fork('neutrals');
    let campSeq = 0;
    let critterSeq = 0;
    const isLand = (x, z) => this.terrain.getHeight(x, z) >= 1.9 && !(this.pathfinder && this.pathfinder.isWater(x, z));

    for (const n of list) {
      if (n.kind === 'camp') {
        const campId = ++campSeq;
        const camp = this.createBuilding('bandit_camp', n.x, n.z, true, NEUTRAL_HOSTILE_ID);
        camp.campId = campId;
        this.buildings.push(camp);
        this._camps.set(campId, { remaining: 1, reward: { ...(n.reward || {}) }, pos: { x: n.x, z: n.z } });

        const phase = rng.next() * Math.PI * 2;
        for (let i = 0; i < n.guards; i++) {
          const ang = phase + (i / n.guards) * Math.PI * 2;
          const bandit = this.spawnUnit('bandit', n.x + Math.cos(ang) * 5, n.z + Math.sin(ang) * 5, NEUTRAL_HOSTILE_ID);
          bandit.homePos = { x: bandit.mesh.position.x, z: bandit.mesh.position.z };
        }

        if (n.deposit) {
          let dx = n.x + 9;
          let dz = n.z;
          for (let tries = 0; tries < 16; tries++) {
            const ang = rng.next() * Math.PI * 2;
            const x = n.x + Math.cos(ang) * 9;
            const z = n.z + Math.sin(ang) * 9;
            if (isLand(x, z)) { dx = x; dz = z; break; }
          }
          const dep = new ResourceDeposit(this.terrain, n.deposit.type, dx, dz);
          dep.resourcesRemaining = n.deposit.amount;
          dep.maxResources = n.deposit.amount;
          this.resourceDeposits.push(this.registerEntity(dep));
        }
      } else if (n.kind === 'critters') {
        for (let i = 0; i < n.count; i++) {
          let x = n.x;
          let z = n.z;
          for (let tries = 0; tries < 8; tries++) {
            const ang = rng.next() * Math.PI * 2;
            const d = rng.next() * (n.radius || 6);
            const cx = n.x + Math.cos(ang) * d;
            const cz = n.z + Math.sin(ang) * d;
            if (isLand(cx, cz)) { x = cx; z = cz; break; }
          }
          const critter = new Critter(this, n.species, x, z, rng.fork(`critter:${critterSeq++}`), n.radius || 6);
          this.registerEntity(critter, NEUTRAL_OWNER_ID);
          this.critters.push(critter);
        }
      }
    }
  }

  /** F3-10: último acampamento do cluster caiu — credita a recompensa a quem deu o último golpe. */
  _onCampDestroyed(camp) {
    const c = this._camps.get(camp.campId);
    if (!c) return;
    c.remaining--;
    if (c.remaining > 0) return;
    const by = camp.lastAttackerOwnerId; // mesmo valor de `killerOwnerId` em BUILDING_DESTROYED (F3-09)
    const player = typeof by === 'number' ? this.getPlayer(by) : null;
    const credited = player && !player.isNeutralHostile ? player : null;
    const reward = c.reward || {};
    if (credited) credited.add(reward);
    this.events.emit(EVT.CAMP_CLEARED, {
      campId: camp.campId,
      byOwnerId: credited ? credited.id : null,
      pos: { x: c.pos.x, y: camp.mesh.position.y, z: c.pos.z },
      reward: { ...reward }
    });
    if (credited) {
      const parts = [];
      if (reward.gold) parts.push(`+${reward.gold} de ouro`);
      if (reward.wood) parts.push(`+${reward.wood} de madeira`);
      if (reward.stone) parts.push(`+${reward.stone} de pedra`);
      this.events.emit(EVT.NOTIFY, {
        ownerId: credited.id,
        text: `Acampamento de bandidos destruído!${parts.length ? ' ' + parts.join(' ') : ''}`
      });
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
        this.trees.push(this.registerEntity(new Tree(this.terrain, x, z, type, this.rngMap)));
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
    const bdef = getBuildingDef(type);

    // F4-07a: plataforma de petróleo — só sobre um poço livre (no mar), sem as demais regras de terra.
    if (bdef.platform) return !!this.findFreeOilDeposit(x, z);

    // 1. Terrain Height check at center and 4 footprint perimeter samples
    const h = this.terrain.getHeight(x, z);
    if (h < 1.8) return false;

    if (bdef.coastal) {
      // F4-07a: Estaleiro/Refinaria/Fundição — o centro é terra seca e há água NAVEGÁVEL encostada na construção (o casco
      // precisa alcançar o cais a `radius + 1,3`); sem as amostras de pegada, que exigiriam terra firme até o mar.
      if (!this.hasNavigableWaterNear(x, z, radius + 1.3)) return false;
    } else {
      const sampleOffset = radius * 0.75;
      if (this.terrain.getHeight(x + sampleOffset, z + sampleOffset) < 1.8) return false;
      if (this.terrain.getHeight(x - sampleOffset, z + sampleOffset) < 1.8) return false;
      if (this.terrain.getHeight(x + sampleOffset, z - sampleOffset) < 1.8) return false;
      if (this.terrain.getHeight(x - sampleOffset, z - sampleOffset) < 1.8) return false;
    }

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

  /**
   * F4-07a: há água navegável (profundidade ≥ NAVAL_MIN_DEPTH) em algum ponto do anel de raio `dist` ao redor de (x, z)?
   * 24 amostras; usado pelas construções costeiras e para achar o cais (`getDockPoint`).
   */
  hasNavigableWaterNear(x, z, dist) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      if (this.terrain.getHeight(x + Math.sin(a) * dist, z + Math.cos(a) * dist) <= NAVAL_MAX_HEIGHT) return true;
    }
    return false;
  }

  /**
   * F4-07a: ponto de saída (célula navegável livre) de um Estaleiro/Doca — varre anéis crescentes ao redor da construção
   * começando pela frente do modelo (+Z) e alternando os lados (determinístico). Cacheado em `b.dockPoint`;
   * `null` se não há saída para o mar (o treino é recusado: "Sem saída para o mar").
   */
  getDockPoint(b) {
    if (b.dockPoint) return b.dockPoint;
    const npf = this.navalPathfinder;
    if (!npf) return null;
    const p = b.mesh.position;
    const r = b.collisionRadius || 3.6;
    for (let ring = 0; ring < 4; ring++) {
      const d = r + 1.6 + ring * 1.5;
      for (let k = 0; k < 24; k++) {
        const step = Math.ceil(k / 2) * (Math.PI * 2 / 24) * (k % 2 === 0 ? 1 : -1);
        const x = p.x + Math.sin(step) * d;
        const z = p.z + Math.cos(step) * d;
        if (npf.isWalkableWorld(x, z)) {
          b.dockPoint = { x, z };
          return b.dockPoint;
        }
      }
    }
    return null;
  }

  /** F4-07a: poço de petróleo livre (sem plataforma, com petróleo) a até `radius` de (x, z), o mais próximo; ou null. */
  findFreeOilDeposit(x, z, radius = 2.0) {
    let best = null;
    let bestD = radius;
    const list = this.resourceDeposits;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.type !== 'oil' || d.resourcesRemaining <= 0 || (d.platform && !d.platform.isDead)) continue;
      const dist = Math.hypot(d.mesh.position.x - x, d.mesh.position.z - z);
      if (dist <= bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  /** F4-07a: o poço tem plataforma CONCLUÍDA e viva do jogador `ownerId` (e ainda tem petróleo)? */
  platformReady(deposit, ownerId) {
    const p = deposit && deposit.platform;
    return !!p && !p.isDead && p.isConstructed && p.ownerId === ownerId;
  }

  /** F4-07a: a partida tem poços de petróleo (mesmo esgotados)? Sem eles o petróleo é dispensado nos custos (ver `hqUpgradeCost`). */
  get hasOilWells() {
    const list = this.resourceDeposits;
    for (let i = 0; i < list.length; i++) if (list[i].type === 'oil') return true;
    return false;
  }

  /**
   * F4-07a: custo de evoluir o Centro ao nível `tier`. O nível 3 cobra 200 de petróleo (`HQ_UPGRADE_COST`), mas em mapas SEM poços
   * o petróleo é dispensado (senão o nível 3 seria inalcançável).
   */
  hqUpgradeCost(tier) {
    const cost = getHqUpgradeCost(tier);
    if (!cost || !cost.oil || this.hasOilWells) return cost;
    const { oil: _oil, ...rest } = cost; // eslint-disable-line no-unused-vars
    return rest;
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
    if (getUnitDef(type).layer === 'naval') {
      // F4-07a: navio nasce na água navegável (não na costa/terra).
      if (this.navalPathfinder && !this.navalPathfinder.isWalkableWorld(x, z)) {
        const snapped = this.navalPathfinder.findNearestWalkable(x, z, 24);
        x = snapped.x;
        z = snapped.z;
      }
    } else if (this.pathfinder && this.pathfinder.isWater(x, z)) {
      const snapped = this.pathfinder.findNearestWalkable(x, z);
      x = snapped.x;
      z = snapped.z;
    }
    const unit = new Unit(this.terrain, type, x, z, ownerId, this);
    this._addUnit(unit);

    const player = this.getPlayer(ownerId);
    if (player) {
      // Aplica as pesquisas já concluídas (todos os níveis) do dono à unidade recém-treinada
      this.applyUpgradeToUnit(unit);
      player.recalculatePop(this);
      // Ponto de reunião: só para jogadores humanos (a IA sempre ignorou o rally no spawn;
      // mantido para a partida 1×1 continuar idêntica).
      // F4-07a: navio só segue o ponto de reunião se ele estiver na água navegável (o padrão fica em terra).
      if (rallyPoint && !player.isAI && (unit.layer !== 'naval' || (this.navalPathfinder && this.navalPathfinder.isWalkableWorld(rallyPoint.x, rallyPoint.z)))) {
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
    // F4-04b: a classe avançada ganha mana e habilidades (Templário / Ogro Feiticeiro); quem já tinha mana mantém.
    if (to.maxMana > 0 && !(from.maxMana > 0) && unit.setupMana) {
      unit.setupMana(to);
    }
  }

  /**
   * F4-04: Transmutação — a unidade vira `sheep` para sempre (mantém dono e id). Reaproveita `promoteUnit`
   * (tipo/nome/stats) e depois `Unit.applyPolymorph` (modelo, ordens, mana, PV ≤ PV da ovelha).
   * Não afeta heróis, cerco nem construções (ver `canPolymorph`); devolve false se não pôde.
   */
  polymorphUnit(unit, toType = 'sheep') {
    if (!unit || unit.isDead || unit.isDying || unit.type === toType) return false;
    this.promoteUnit(unit, toType);
    unit.applyPolymorph(toType);
    const owner = this.getPlayer(unit.ownerId);
    if (owner) owner.recalculatePop(this);
    return true;
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
    // F2-08c: a entidade é pura; a malha (e as subclasses visuais por tipo) é criada pela `EntityViews`.
    const b = getBuildingDef(type).role === 'wall'
      ? new Wall(this.terrain, type, x, z, isConstructed, ownerId)
      : new Building(this.terrain, type, x, z, isConstructed, ownerId);
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
        const names = formatRequirementList(missing, owner.factionId);
        this.events.emit(EVT.NOTIFY, { ownerId, text: `⚠️ Requer: ${names}` });
      }
      return null;
    }

    if (!owner.canAfford(stats.cost)) {
      if (owner.isLocal) this.events.emit(EVT.NOTIFY, { ownerId, text: '⚠️ Recursos insuficientes!' });
      return null;
    }

    // F4-07a: plataforma — erguida SOBRE um poço livre (a posição vira a do poço) pelo petroleiro (o construtor).
    const isPlatform = stats.role === 'platform';
    let deposit = null;
    if (isPlatform) {
      deposit = this.findFreeOilDeposit(x, z);
      if (!deposit) {
        if (owner.isLocal) this.events.emit(EVT.NOTIFY, { ownerId, text: '⚠️ Sem poço de petróleo livre aqui' });
        return null;
      }
      if (!this.getUnitsOf(ownerId).some(u => !u.isDead && u.isTanker)) {
        if (owner.isLocal) this.events.emit(EVT.NOTIFY, { ownerId, text: '⚠️ Requer um Petroleiro' });
        return null;
      }
      x = deposit.mesh.position.x;
      z = deposit.mesh.position.z;
    }
    owner.deduct(stats.cost);

    const b = this._createPlacedBuilding(type, x, z, ownerId);
    if (deposit) {
      b.deposit = deposit;
      deposit.platform = b;
    }
    const canBuild = isPlatform ? (u => u.isTanker) : (u => u.type === 'villager' || u.type === 'peon');

    // Task workers (villagers or peons) to construct it — só os do próprio dono.
    const builders = (unitIds || [])
      .map(id => this.entitiesById.get(id))
      .filter(u => u && !u.isDead && u.ownerId === ownerId && canBuild(u));

    if (builders.length > 0) {
      builders.forEach(v => v.orderBuild(b));
    } else {
      let nearestV = null;
      let minDist = Infinity;
      this.getUnitsOf(ownerId).forEach(u => {
        if (!u.isDead && canBuild(u)) {
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
      if (t.hasStump) {
        const d = Math.hypot(x - t.mesh.position.x, z - t.mesh.position.z);
        if (d < bRadius + 0.5) {
          t.dispose();
        }
      }
    });
    return b;
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
        const names = formatRequirementList(missing, owner.factionId);
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
  findNearestResource(pos, type, ownerId = null) {
    if (type === 'tree') {
      return this.blockerGrid.nearest(pos.x, pos.z, Infinity, e => e instanceof Tree && !e.isDead && e.woodRemaining > 0);
    }
    // F4-07a: petróleo — só poços com plataforma própria concluída (`ownerId`).
    if (type === 'oil') {
      return this.blockerGrid.nearest(pos.x, pos.z, Infinity, e => e instanceof ResourceDeposit && e.type === 'oil' && e.resourcesRemaining > 0 && (ownerId === null || this.platformReady(e, ownerId)));
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
      this.events.emit(EVT.SELECTED, { entityId: entity.id, ownerId: entity.ownerId });
    } else if (entity instanceof Building && entity.ownerId === this._localPlayerId) {
      entity.setSelected(true);
      this.selectedBuilding = entity;
      this.events.emit(EVT.SELECTED, { entityId: entity.id, ownerId: entity.ownerId });
    } else if (entity instanceof Building && entity.ownerId === NEUTRAL_HOSTILE_ID) {
      // F3-10: acampamento neutro — card apenas informativo (sem comandos).
      entity.setSelected(true);
      this.selectedBuilding = entity;
      this.events.emit(EVT.SELECTED, { entityId: entity.id, ownerId: entity.ownerId });
    } else if (entity instanceof Tree || entity instanceof ResourceDeposit) {
      this.selectedResource = entity;
      this.events.emit(EVT.SELECTED, { entityId: entity.id, ownerId: entity.ownerId });
    }
  }

  /**
   * F2-02: tradutor do clique direito → emite um comando (MOVE/ATTACK/GATHER/BUILD/RALLY;
   * ver `src/sim/commands.js`) em vez de chamar as entidades diretamente. A formação de
   * MOVE (offsets por unidade) é calculada pelo `CommandExecutor`, não aqui: o comando
   * carrega só o ponto clicado.
   */
  issueOrder(entityUnderCursor, groundPoint, { queued = false } = {}) {
    // F3-01: Shift = enfileira (MOVE/GATHER/BUILD/REPAIR; ATTACK ignora `queued`).
    const q = queued ? { queued: true } : null;
    this.selectedUnits = this.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    if (this.selectedUnits.length === 0) {
      if (this.selectedBuilding && this.selectedBuilding.ownerId === this._localPlayerId && groundPoint) {
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
        this.events.emit(EVT.ORDER_ISSUED, { ownerId: this._localPlayerId });
      }
      return;
    }

    this.events.emit(EVT.ORDER_ISSUED, { ownerId: this._localPlayerId });
    const unitIds = this.selectedUnits.map(u => u.id);

    if (entityUnderCursor) {
      const e = entityUnderCursor;
      // Right-clicked a hostile unit/building: Attack!
      if ((e instanceof Unit || e instanceof Building) && this.isHostile(this._localPlayerId, e.ownerId)) {
        this.issue({ type: CMD.ATTACK, playerId: this._localPlayerId, unitIds, targetId: e.id });
        return;
      }
      // F4-07b: clique direito numa barcaça aliada com terrestres selecionados = embarcar (LOAD).
      if (e instanceof Unit && e.transportCapacity > 0 && e.ownerId === this._localPlayerId) {
        const ground = this.selectedUnits.filter(u => u.layer === 'ground' && u.transportedBy === null).map(u => u.id);
        if (ground.length > 0) {
          this.issue({ type: CMD.LOAD, playerId: this._localPlayerId, unitIds: ground, targetId: e.id });
          return;
        }
      }
      // F3-10: critter só é atacado por ordem explícita (nunca por auto-aquisição).
      if (e instanceof Critter && !e.isDead) {
        this.issue({ type: CMD.ATTACK, playerId: this._localPlayerId, unitIds, targetId: e.id });
        return;
      }
      // F4-07a: poço de petróleo — petroleiros coletam (plataforma própria pronta), erguem a plataforma (poço livre) ou ajudam a obra.
      if (e instanceof ResourceDeposit && e.type === 'oil') {
        const tankerIds = this.selectedUnits.filter(u => u.isTanker).map(u => u.id);
        const local = this._localPlayerId;
        if (tankerIds.length > 0 && e.resourcesRemaining > 0) {
          if (this.platformReady(e, local)) {
            this.issue({ type: CMD.GATHER, playerId: local, unitIds: tankerIds, targetId: e.id, ...q });
            return;
          }
          if (!e.platform || e.platform.isDead) {
            this.issue({ type: CMD.PLACE_BUILDING, playerId: local, buildingType: 'oil_platform', x: e.mesh.position.x, z: e.mesh.position.z, unitIds: tankerIds });
            return;
          }
          if (e.platform.ownerId === local && !e.platform.isConstructed) {
            this.issue({ type: CMD.BUILD, playerId: local, unitIds: tankerIds, buildingId: e.platform.id, ...q });
            return;
          }
        }
      }
      // Right-clicked a resource: Gather! (Villagers and Peons)
      if (e instanceof Tree || e instanceof ResourceDeposit) {
        const isDepleted = e.isDead || (e.woodRemaining !== undefined && e.woodRemaining <= 0) || (e.resourcesRemaining !== undefined && e.resourcesRemaining <= 0);
        if (!isDepleted) {
          const workerIds = this.selectedUnits.filter(u => u.type === 'villager' || u.type === 'peon').map(u => u.id);
          if (workerIds.length > 0) {
            this.issue({ type: CMD.GATHER, playerId: this._localPlayerId, unitIds: workerIds, targetId: e.id, ...q });
            return;
          }
        }
        // If resource is depleted (e.g. cut stump with no wood) or non-workers selected, move units towards target
        if (groundPoint) {
          this.issue({ type: CMD.MOVE, playerId: this._localPlayerId, unitIds, x: groundPoint.x, z: groundPoint.z, ...q });
          return;
        }
        return;
      }
      // Right-clicked an incomplete building: Build!
      if (e instanceof Building && !e.isConstructed && e.ownerId === this._localPlayerId) {
        const workerIds = this.selectedUnits.filter(u => e.role === 'platform' ? u.isTanker : (u.type === 'villager' || u.type === 'peon')).map(u => u.id); // F4-07a: a plataforma é do petroleiro
        this.issue({ type: CMD.BUILD, playerId: this._localPlayerId, unitIds: workerIds, buildingId: e.id, ...q });
        return;
      }
      // F3-05: clique direito em construção própria concluída e danificada: Reparar (custa recursos).
      if (e instanceof Building && e.isConstructed && e.hp < e.maxHp && e.ownerId === this._localPlayerId) {
        const workerIds = this.selectedUnits.filter(u => u.type === 'villager' || u.type === 'peon').map(u => u.id);
        if (workerIds.length > 0) {
          this.issue({ type: CMD.REPAIR, playerId: this._localPlayerId, unitIds: workerIds, buildingId: e.id });
          return;
        }
      }
    }

    // F4-07b: barcaças com carga + clique direito em terra firme junto à água = desembarcar nessa margem (UNLOAD).
    if (groundPoint && this.terrain.getHeight(groundPoint.x, groundPoint.z) >= 0.65) {
      const barges = this.selectedUnits.filter(u => u.transportCapacity > 0 && u.cargo && u.cargo.length > 0);
      if (barges.length > 0 && barges.length === this.selectedUnits.length && this.navalPathfinder && this.navalPathfinder.nearNavigable(groundPoint.x, groundPoint.z, 12)) {
        for (let i = 0; i < barges.length; i++) {
          this.issue({ type: CMD.UNLOAD, playerId: this._localPlayerId, unitId: barges[i].id, x: groundPoint.x, z: groundPoint.z });
        }
        return;
      }
    }

    // Right-clicked ground: Move (o executor calcula a formação e evita água)
    if (groundPoint) {
      this.issue({ type: CMD.MOVE, playerId: this._localPlayerId, unitIds, x: groundPoint.x, z: groundPoint.z, ...q });
    }
  }

  // --- GAME LOOP & AI ---

  /**
   * F3-09: o jogador está derrotado segundo o modo de vitória da partida? (`src/sim/victory.js`).
   * Reutiliza uma lista de wrappers `{role,isDead}` para não alocar por tick.
   */
  _isDefeatedByRule(ownerId) {
    const scratch = this._victoryScratch || (this._victoryScratch = []);
    let n = 0;
    const buildings = this.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId !== ownerId) continue;
      const w = scratch[n] || (scratch[n] = { role: '', isDead: false });
      w.role = getBuildingDef(b.type).role;
      w.isDead = !!b.isDead;
      n++;
    }
    scratch.length = n;
    return isPlayerDefeated(this.matchConfig.victoryMode, scratch);
  }

  /** F3-09: despacha eventos pendentes (kills do último tick) e congela o snapshot final. */
  _freezeResult() {
    if (this.result) return;
    this.events.flush();
    this.result = this.matchStats.snapshot();
  }

  /**
   * Derrota por modo (`conquest`: sem construções; `regicide`: sem Centro). Cada derrotado emite
   * `PLAYER_DEFEATED` uma vez; suas entidades continuam no mapa, inertes (ver `simStep`).
   * Fim de jogo: jogador local derrotado (derrota) ou só um time vivo (vitória do time local).
   * Ao terminar, congela `this.result` (snapshot de `matchStats`). Retorna true se acabou.
   */
  _updateVictoryConditions() {
    const players = this.players;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.defeated && this._isDefeatedByRule(p.id)) {
        p.defeated = true;
        this.events.emit(EVT.PLAYER_DEFEATED, { ownerId: p.id, name: p.name });
      }
    }

    const local = this.localPlayer;
    if (local.defeated) {
      this.isGameOver = true;
      this.gameWon = false;
      this._freezeResult();
      return true;
    }

    if (this.playerRegistry.aliveTeams().size <= 1) {
      if (!this.gameWon) {
        this.gameWon = true;
        this.isGameOver = true;
        this.events.emit(EVT.MATCH_WON, { ownerId: local.id });
      }
      this._freezeResult();
      return true;
    }
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

  /** F3-09: o dono é um jogador já derrotado? (neutro → false) */
  _isOwnerDefeated(ownerId) {
    const p = this.playerRegistry.getPlayer(ownerId);
    return !!p && p.defeated;
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
      // F3-09: jogador derrotado não recebe ordens.
      const owner = this.playerRegistry.getPlayer(dueCommands[i].playerId);
      if (owner && owner.defeated) continue;
      CommandExecutor.execute(this, dueCommands[i]);
    }

    this.gameTime += dt;
    this.corpses.prune(this.gameTime); // F4-04
    this.matchStats.update(this.gameTime);

    // Check Win/Loss conditions
    if (this._updateVictoryConditions()) {
      this.events.flush();
      return;
    }

    // Orçamento de A* por passo de simulação (F1-07): resolve pedidos pendentes de requestPath.
    // F2-03: orçamento por nós expandidos (não por relógio) — mesmo limite em todas as máquinas.
    if (this.pathfinder) this.pathfinder.processQueue(4000);
    if (this.navalPathfinder) this.navalPathfinder.processQueue(4000); // F4-07a: fila dos navios (orçamento próprio)

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

    // F3-05: recalcula `workerCount` (trabalhadores com obra/reparo como alvo) por varredura.
    for (let i = 0; i < this.buildings.length; i++) this.buildings[i].workerCount = 0;
    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (u.isDead) continue;
      const t = u.buildTarget || u.repairTarget;
      if (t) t.workerCount = (t.workerCount || 0) + 1;
    }

    // Update Buildings (lógica de jogo; VFX/billboard vão em renderUpdate)
    this.buildings.forEach(b => {
      if (this._isOwnerDefeated(b.ownerId)) return; // F3-09: entidades de derrotado ficam inertes
      b.simUpdate(dt, this, this.arrows, allUnits, allUnits);
    });

    // Clean dead buildings
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (this.buildings[i].isDead) {
        const deadB = this.buildings.splice(i, 1)[0];
        if (deadB.deposit && deadB.deposit.platform === deadB) deadB.deposit.platform = null; // F4-07a: o poço volta a ficar livre
        if (this.selectedBuilding === deadB) this.selectedBuilding = null; // QA NEW-28: não deixa o card da obra cancelada/destruída preso
        if (deadB.dispose) deadB.dispose();
        this.unregisterEntity(deadB);
        if (deadB.campId) this._onCampDestroyed(deadB);
        this.recalculatePopCap();
      }
    }

    // Sincroniza a grade espacial de unidades UMA vez por tick, antes de atualizar unidades
    // (F1-06): colisão/alvo/picking deste tick usam a posição do início do tick.
    const unitCount = allUnits.length;
    for (let i = 0; i < unitCount; i++) {
      const u = allUnits[i];
      if (!u.isDead && u.transportedBy === null) { // F4-07b: passageiro fora da grade
        const p = u.mesh.position;
        // F4-02: velocidade (u/s) entre ticks — mira preditiva do cerco (não entra no checksum).
        if (u._lastSyncX !== undefined && dt > 0) {
          u.velX = (p.x - u._lastSyncX) / dt;
          u.velZ = (p.z - u._lastSyncZ) / dt;
        }
        u._lastSyncX = p.x;
        u._lastSyncZ = p.z;
        this.unitGrid.update(u, p.x, p.z, u.collisionRadius || 0.6);
      }
    }

    // Update Units (tamanho fixado: unidades criadas neste frame só atualizam no próximo)
    for (let i = 0; i < unitCount; i++) {
      const u = allUnits[i];
      // F3-09: unidades de jogador derrotado ficam paradas (as que morrem continuam a animação).
      if (!u.isDead && !u.isDying && this._isOwnerDefeated(u.ownerId)) continue;
      // F3-07: regeneração de pesquisa (`effect.regen`, PV/s) — nunca passa do máximo.
      if (u.regen > 0 && !u.isDead && !u.isDying && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + u.regen * dt);
      }
      u.update(dt, this, this.arrows, allUnits, this.buildings);
    }

    // F3-10: critters (passeio/fuga/carcaça); removidos ao fim da carcaça.
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.update(dt);
      if (c.canRemove) {
        this.critters.splice(i, 1);
        c.dispose();
        this.unregisterEntity(c);
      }
    }

    // Resolve Collisions: Units cannot walk through buildings, deposits, trees, or each other
    this.resolveBuildingCollisions();
    this.resolveUnitCollisions();

    this.hazards.step(dt); // F4-04b: runas e redemoinhos

    // Autonomous Computer Opponent AI (Utility AI Director): um por jogador de IA ainda vivo
    for (let i = 0; i < this.aiDirectors.length; i++) {
      const director = this.aiDirectors[i];
      if (director.player && director.player.defeated) continue;
      director.update(dt);
    }

    // Update Fog of War (reveals explored territory & culls unexplored enemies)
    if (this.fogOfWar) {
      const localId = this._localPlayerId;
      const fl = this._fogLists;
      fl.playerUnits = this.allUnits.filter(u => u.ownerId === localId || this.isAlly(localId, u.ownerId));
      fl.playerBuildings = this.buildings.filter(b => b.ownerId === localId || this.isAlly(localId, b.ownerId));
      fl.enemyUnits = this.enemies;
      fl.enemyBuildings = this.buildings.filter(b => this.isHostile(localId, b.ownerId));
      this.fogOfWar.update(dt, fl.playerUnits, fl.playerBuildings, fl.enemyUnits, fl.enemyBuildings);
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
   * F1-09/F2-08c: fim do quadro renderizado. A parte visual (interpolação, LOD, barras, VFX ambiente, névoa) vive nas
   * views (`MatchSession.update` → `EntityViews`/`FogView`); aqui só se despacham os eventos acumulados.
   * @param {number} frameDelta  segundos reais desde o último frame renderizado
   * @param {number} alpha  fração ∈ [0,1) do próximo passo de simulação ainda não ocorrida
   */
  renderUpdate(frameDelta, alpha) {
    if (this.isPaused || this.isGameOver) return;
    // F2-07: VFX ambiente emitido durante o quadro (fora do tick fixo) — despacha já aqui.
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
    this._pushFor(unit, uPos, nx * push, nz * push); // F3-02: nunca empurra para a água (F4-07a: navio, nunca para a terra)

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
      if (unit.isDead || unit.layer === 'air' || unit.transportedBy !== null) continue; // F4-06: aéreo sobrevoa construções/árvores; F4-07b: passageiro
      const pos = unit.mesh.position;
      const radius = (unit.collisionRadius || 0.6) + 6;
      this.blockerGrid.queryRadius(pos.x, pos.z, radius, null, buf);
      for (let j = 0; j < buf.length; j++) {
        this._checkUnitBlockerCollision(unit, buf[j]);
      }
    }
  }

  /**
   * F3-02: desloca `p` por (dx, dz) sem entrar na água (altura < 0,65): tenta o vetor inteiro, depois só X,
   * depois só Z; se nenhum for seco, não move. Evita que o empurrão da colisão jogue unidades no rio.
   */
  _pushFor(unit, p, dx, dz) {
    if (unit.layer === 'naval') this._pushWet(p, dx, dz);
    else this._pushDry(p, dx, dz);
  }

  /** F4-07a: como `_pushDry`, mas para navios — só desloca para pontos com profundidade navegável (nunca para terra/raso). */
  _pushWet(p, dx, dz) {
    const t = this.terrain;
    if (t.getHeight(p.x + dx, p.z + dz) <= NAVAL_MAX_HEIGHT) {
      p.x += dx;
      p.z += dz;
    } else if (dx !== 0 && t.getHeight(p.x + dx, p.z) <= NAVAL_MAX_HEIGHT) {
      p.x += dx;
    } else if (dz !== 0 && t.getHeight(p.x, p.z + dz) <= NAVAL_MAX_HEIGHT) {
      p.z += dz;
    } else {
      return;
    }
    p.y = WATER_LEVEL;
  }

  _pushDry(p, dx, dz) {
    const t = this.terrain;
    if (t.getHeight(p.x + dx, p.z + dz) >= 0.65) {
      p.x += dx;
      p.z += dz;
    } else if (dx !== 0 && t.getHeight(p.x + dx, p.z) >= 0.65) {
      p.x += dx;
    } else if (dz !== 0 && t.getHeight(p.x, p.z + dz) >= 0.65) {
      p.z += dz;
    } else {
      return;
    }
    p.y = t.getHeight(p.x, p.z);
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
      if (u1.isDead || u1.transportedBy !== null) continue; // F4-07b: passageiros não colidem
      const p1 = u1.mesh.position;
      const r1 = u1.collisionRadius || 0.6;

      this.unitGrid.queryRadius(p1.x, p1.z, r1 + maxR, null, buf);
      for (let k = 0; k < buf.length; k++) {
        const u2 = buf[k];
        if (u2 === u1 || u2.id <= u1.id || u2.isDead) continue;
        const air1 = u1.layer === 'air';
        if (u1.layer !== u2.layer) continue; // F4-06/F4-07: camadas distintas (solo/ar/mar) não colidem

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

        // F3-02: uma unidade que só está de passagem (moving/attackMoving) cede mais (80%) a uma parada
        // (idle/holding) — a formação já assentada não é desmanchada por quem chega (fim da "dança").
        // Qualquer outra combinação (combate, coleta…) mantém a divisão 50/50 de antes.
        const m1 = u1.state === 'moving' || u1.state === 'attackMoving';
        const m2 = u2.state === 'moving' || u2.state === 'attackMoving';
        const p1Still = u1.state === 'idle' || u1.state === 'holding';
        const p2Still = u2.state === 'idle' || u2.state === 'holding';
        const w1 = m1 && p2Still ? 0.8 : (m2 && p1Still ? 0.2 : 0.5);
        const overlap = minDist - dist;
        if (air1) {
          // F4-06: aéreos se afastam de leve (repulsão suave; sem água/relevo — o Y é do voo).
          const push = overlap * 0.25;
          p1.x -= nx * push; p1.z -= nz * push;
          p2.x += nx * push; p2.z += nz * push;
          continue;
        }
        this._pushFor(u1, p1, -nx * overlap * w1, -nz * overlap * w1);
        this._pushFor(u2, p2, nx * overlap * (1 - w1), nz * overlap * (1 - w1));
      }
    }
  }

  /**
   * F2-04: fim da sessão de partida. Para as IAs, solta as entidades e descarta os
   * recursos próprios da partida (as views — malhas, textura da névoa, árvores
   * instanciadas — são descartadas pelo MatchSession).
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
    this.matchStats.dispose();

    this.allUnits.forEach(u => u.dispose?.());
    this.buildings.forEach(b => b.dispose?.());
    this.trees.forEach(t => t.dispose());
    this.critters.forEach(c => c.dispose());
    this.critters = [];
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
  }
}
