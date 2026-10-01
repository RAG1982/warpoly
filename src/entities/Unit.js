import * as THREE from 'three';
import { ModelFactory } from './ModelFactory.js';
import { Arrow } from './Arrow.js';
import { BallisticProjectile, ballisticFlightTime } from './BallisticProjectile.js';
import { applySplashDamage } from './splash.js';
import { Building } from './Building.js';
import { UnitAnimator } from '../animation/UnitAnimator.js';
import { getUnitDef, getUnitStats as getUnitStatsFromData, CARRY, MINE_ENTER_TIME, gatherMultiplier } from '../data/index.js';
import { computeDamage } from '../sim/combat.js';
import { legacyOwnerId } from '../sim/EntityIds.js';
import { SIM_DT, lerpAngle } from '../sim/constants.js';
import { CMD } from '../sim/commands.js';
import { EVT } from '../sim/events.js';
import { REPAIR_INTERVAL, MAX_WORKERS_PER_BUILDING } from '../sim/repair.js';
import { createStatusSlots, createMods, tickStatuses, clearStatuses, removeStatus, STATUS_DEFS } from '../sim/statuses.js';
import { isDetectedBy } from '../sim/detection.js';
import { FLAMESHIELD_DAMAGE } from '../data/combat.js';
import { resolveAbility, canCast, needsEntityTarget, targetProblem, applyAbility, emitCastStart, findAutocastTarget, getChannel, applyChannelWave } from '../sim/abilities.js';

/** F4-04: callback de expiração de status (módulo: sem closure por unidade). */
function onStatusExpire(unit, id) {
  unit._statusExpired(id);
}

/** Vector3 → objeto plano `{x,y,z}` (payload de evento: nunca referências a objetos three.js). */
function posOf(v) {
  return { x: v.x, y: v.y, z: v.z };
}

// F2-02: estados em que a unidade está caminhando por `waypoints`/`pathDestination` via
// pathfinder assíncrono (moveTo). O callback de `requestPath` precisa reconhecer todos eles
// para não descartar um caminho que chegou depois de `orderAttackMove`/`orderPatrol` trocarem
// `state` de 'moving' para o estado derivado (ver `moveTo`).
const MOVEY_STATES = new Set(['moving', 'attackMoving']);

/** F3-10: distância máxima da origem para guardas neutros e regeneração (fração do PV/s) no retorno. */
export const GUARD_LEASH = 22;
const GUARD_REGEN = 0.05;

// Buffers de módulo reutilizados pelas buscas de alvo hostil (F1-06: unitGrid/blockerGrid),
// evitando alocar um array novo por unidade a cada frame.
const _combatBuf = [];
const _unitBuf = [];
const _towerBuf = [];
const _buildingBuf = [];
const _wallBuf = [];
const _helpBuf = [];

/**
 * Entre os candidatos de `buf` (já ordenado por id crescente pelo SpatialGrid), retorna o mais
 * próximo de `(x, z)`; em caso de empate de distância, o de menor id vence (por ser encontrado
 * primeiro no array e a comparação usar `<` estrito).
 */
function pickNearestInBuf(buf, x, z) {
  let best = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < buf.length; i++) {
    const e = buf[i];
    const p = e.mesh.position;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestDistSq) {
      bestDistSq = d;
      best = e;
    }
  }
  return best;
}

// Shared Selection Ring Geometry & Materials
const unitRingGeo = new THREE.RingGeometry(0.85, 1.05, 24);
unitRingGeo.rotateX(-Math.PI / 2);

// F1-08: vetor de módulo reutilizado para calcular a origem do projétil (Arrow clona o valor recebido)
const _projectileOrigin = new THREE.Vector3();
const _up168 = new THREE.Vector3(0, 1.68, 0);
const _impactPoint = new THREE.Vector3(); // F4-02: ponto previsto do cerco (BallisticProjectile copia o valor)

const playerRingMat = new THREE.MeshBasicMaterial({
  color: 0xdeb841,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});
const enemyRingMat = new THREE.MeshBasicMaterial({
  color: 0xef4444,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});

// Shared 3D Health Bar Geometries & Materials (Zero Canvas, zero texture uploads)
const hpBgGeo = new THREE.PlaneGeometry(1.34, 0.22);
const hpFillGeo = new THREE.PlaneGeometry(1.28, 0.16);
hpFillGeo.translate(0.64, 0, 0); // pivot at left edge so scale.x scales neatly

const hpBgMat = new THREE.MeshBasicMaterial({
  color: 0x0f172a,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  transparent: false
});
const hpGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hpYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hpRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
// F4-03: barra de mana azul (mesma geometria/fundo da barra de vida; só o material do preenchimento é novo)
const manaBlueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, depthTest: false, depthWrite: false, side: THREE.DoubleSide });

export class Unit {
  /**
   * @param {number|'player'|'enemy'} [owner]  ownerId do Player dono (F2-01)
   * @param {import('../core/GameManager.js').GameManager|null} [gameManager]
   */
  constructor(scene, terrain, type, x, z, owner = 0, gameManager = null) {
    this.scene = scene;
    this.terrain = terrain;
    this.type = type; // 'villager', 'knight', 'archer', 'bandit'
    /** Id estável da entidade (atribuído por GameManager.registerEntity). */
    this.id = undefined;
    /** Id do Player dono (F2-01). */
    this.ownerId = legacyOwnerId(owner);
    this.gameManager = gameManager;

    // Stats configuration
    const stats = this.getUnitStats(type);
    this.name = stats.name;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    // F3-03: dano básico+perfurante (substitui o antigo `attack` plano); `this.attack` (getter,
    // abaixo) deriva `basic + piercing` para leitura legada (AI/HUD) — nunca é escrito direto.
    this.damage = { ...stats.damage };
    this.attackRange = stats.attackRange;
    this.attackCooldown = stats.attackCooldown;
    this.armor = stats.armor || 0;
    this.collisionRadius = stats.collisionRadius || 0.6;
    /** F3-07: bônus de visão (pesquisa `sight`) somado ao raio da névoa; `regen` = PV/s. */
    this.sightBonus = 0;
    this.regen = 0;

    // F4-03: mana, habilidades, recargas, auto-cast e status (só muda em `simStep`). `statuses` é um
    // array fixo de slots (sem alocação por passo); `mods` é o agregado cacheado (ver sim/statuses.js).
    this.maxMana = 0;
    this.mana = 0;
    this.manaRegen = 1;
    this.abilities = [];
    this.cooldowns = {};
    this.autocast = {};
    this.statuses = createStatusSlots();
    this.mods = createMods();
    /** F4-03: segundos de vida de unidades invocadas (0 = permanente). */
    this.lifetime = 0;
    /** F4-04: invocada (Erguer Mortos): não consome suprimento; ao expirar morre sem cadáver nem baixa. */
    this.summoned = false;
    this._expired = false;
    this._cast = null;
    this._manaFill = -1;
    this._effDamage = { basic: 0, piercing: 0, type: 'normal' };

    // Raios de varredura / flags de papel (src/data/units.js)
    const def = getUnitDef(type);
    this.isRanged = def.isRanged;
    this.projectileType = def.projectile;
    /** F4-02: cerco — alcance mínimo (distância de borda) e raio de dano em área; 0 = sem. */
    this.minAttackRange = def.minAttackRange || 0;
    this.splashRadius = def.splashRadius || 0;
    /** F4-02: projétil balístico (`bolt`/`boulder`): não persegue, mira a posição prevista. */
    this.isBallistic = (def.projectile === 'bolt' || def.projectile === 'boulder') && def.splashRadius > 0; // F4-04: 'bolt' sem área (Mago) é projétil comum
    /** F4-05: unidade suicida (Sapadores/Incendiários) — detona no alcance (`_detonate`). */
    this.suicide = !!def.suicide;
    /** F4-02: velocidade estimada (u/s) medida pelo `GameManager` a cada tick — mira preditiva do cerco. */
    this.velX = 0;
    this.velZ = 0;
    this._siegeRetreating = false;
    this.aggroRange = def.aggroRange;
    this.threatScanRange = def.threatScanRange;
    this.retargetRange = def.retargetRange;
    this.helpRadius = def.helpRadius;

    // State machine: 'idle', 'moving', 'gathering', 'returning', 'building', 'repairing', 'attacking', 'dying'
    this.state = 'idle';
    // F1-08: targetPos é uma Vector3 fixa (nunca recriada); hasTargetPos indica se há destino válido.
    this.targetPos = new THREE.Vector3();
    this.hasTargetPos = false;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    /** F3-05: construção que o trabalhador está reparando (estado 'repairing'). */
    this.repairTarget = null;
    this.attackTarget = null;

    // Navigation & Waypoints
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    // F1-07: true enquanto um requestPath desta unidade está na fila do Pathfinder.
    this.pathPending = false;
    this._chaseRequestPending = false;

    // Worker inventory (F3-04: `max` passa a ser por recurso — ver `src/data/economy.js` CARRY;
    // fixado quando a unidade começa a coletar, em vez de um valor único fixo).
    this.carrying = { type: null, amount: 0, max: CARRY.wood };
    // F3-04: timer de "dentro da mina/pedreira" (estado `insideMine`) — ver `updateInsideMine`.
    this._mineTimer = 0;
    this.actionTimer = 0;
    this.attackTimer = 0;
    this.walkTimer = 0;
    this.isDead = false;
    this.lastAttackerOwnerId = null; // F3-09
    /** F3-10: origem do guarda neutro ({x, z}) — `null` para unidades normais. */
    this.homePos = null;
    this._returningHome = false;
    this.isDying = false;
    this.canRemove = false;
    this.isDisposed = false;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.deathDuration = 1.6;
    this.hasFiredThisAttack = false;

    // Create 3D Model (zero-cost clone sharing pre-compiled geometries and materials)
    this.mesh = this.createModel(def.modelOf || type);
    const h = this.terrain.getHeight(x, z);
    this.mesh.position.set(x, h, z);
    this.mesh.scale.set(1.62, 1.62, 1.62); // Scaled +20% for superior visibility and detail appreciation
    this.mesh.userData.entity = this;

    // F1-09: tick fixo — pose de simulação (posição/rotação Y) do início e do fim do último
    // passo, para `renderUpdate` interpolar visualmente entre eles. Unidade recém-criada não
    // "voa" da origem: as duas poses começam iguais à posição inicial.
    this._prevPos = this.mesh.position.clone();
    this._simPos = this.mesh.position.clone();
    this._prevRotY = this.mesh.rotation.y;
    this._simRotY = this.mesh.rotation.y;
    // Delta de animação acumulado enquanto a unidade estava fora do frustum/invisível (LOD).
    this._animAcc = 0;
    // Deslocamento vertical acumulado do afundamento visual pós-morte (renderUpdate).
    this._deathSinkOffset = 0;

    // Animator
    this.animator = new UnitAnimator(this.mesh, def.modelOf || type);

    // Selection ring & 3D Health Bar
    this.createSelectionRing();
    this.createHealthBar();
    if (def.maxMana > 0 || (def.abilities && def.abilities.length > 0)) this.setupMana(def);

    this.scene.add(this.mesh);
  }

  /**
   * Lado relativo ao jogador local: 'player' se o dono é o jogador local, 'enemy' caso contrário.
   * DÍVIDA (F2-01): getter de compatibilidade para UI/InputManager/névoa. Lógica nova deve usar
   * ownerId + gameManager.isHostile/isAlly.
   */
  get faction() {
    const gm = this.gameManager;
    const localId = gm && typeof gm.localPlayerId === 'number' ? gm.localPlayerId : 0;
    return this.ownerId === localId ? 'player' : 'enemy';
  }

  /** Dono de `other` é hostil ao dono desta unidade (por time). */
  isHostileTo(other) {
    if (!other) return false;
    const gm = this.gameManager;
    if (gm && gm.isHostile) return gm.isHostile(this.ownerId, other.ownerId);
    return other.ownerId !== this.ownerId;
  }

  /** Mesmo dono ou mesmo time. */
  isAlliedWith(other) {
    if (!other) return false;
    const gm = this.gameManager;
    if (gm && gm.isAlly) return gm.isAlly(this.ownerId, other.ownerId);
    return other.ownerId === this.ownerId;
  }

  getUnitStats(type) {
    return getUnitStatsFromData(type);
  }

  /** F3-03: dano total legado (`basic + piercing`), derivado — leitura por AI/HUD; nunca escrito. */
  get attack() {
    return this.damage.basic + this.damage.piercing;
  }

  /** F4-03: cooldown de ataque efetivo (status `attackSpeedMul` divide o cooldown). */
  get effAttackCooldown() {
    return this.attackCooldown / this.mods.attackSpeedMul;
  }

  /** F4-03: dano efetivo (status `damageMul`); sem status devolve `this.damage` (sem alocar). */
  getEffDamage() {
    const m = this.mods.damageMul;
    if (m === 1) return this.damage;
    const d = this._effDamage;
    d.basic = this.damage.basic * m;
    d.piercing = this.damage.piercing * m;
    d.type = this.damage.type;
    return d;
  }

  isCombatUnit() {
    return getUnitDef(this.type).isCombat;
  }

  isWorker() {
    return getUnitDef(this.type).isWorker;
  }

  createModel(type) {
    return ModelFactory.createUnit(type);
  }

  createSelectionRing() {
    this.selectionRing = new THREE.Mesh(unitRingGeo, this.faction === 'player' ? playerRingMat : enemyRingMat);
    this.selectionRing.name = 'SelectionRing';
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);
  }

  createHealthBar() {
    this.hpGroup = new THREE.Group();
    this.hpGroup.name = 'HealthBar';
    const h = this.getHealthBarHeight();
    this.hpGroup.position.set(this.mesh.position.x, this.mesh.position.y + h, this.mesh.position.z);

    const bgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    bgMesh.name = 'HealthBg';
    bgMesh.renderOrder = 1100;
    this.hpGroup.add(bgMesh);

    this.hpFillMesh = new THREE.Mesh(hpFillGeo, hpGreenMat);
    this.hpFillMesh.name = 'HealthFill';
    this.hpFillMesh.position.set(-0.64, 0, 0.005);
    this.hpFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.hpFillMesh);

    this.hpGroup.visible = false;
    this.hpSprite = this.hpGroup; // backward compatibility alias
    if (this.scene) {
      this.scene.add(this.hpGroup);
    }
    this.updateHealthBar();
  }

  /**
   * F4-03: configura mana/habilidades (a partir de `src/data/units.js` no construtor; também
   * usável via console/testes). `cfg`: `{maxMana, startMana?, manaRegen?, abilities?}`.
   * Reposição completa: zera recargas, auto-cast e status (idempotente; seguro ao reciclar).
   */
  setupMana(cfg) {
    this.maxMana = cfg.maxMana || 0;
    this.mana = Math.min(this.maxMana, cfg.startMana !== undefined ? cfg.startMana : this.maxMana);
    this.manaRegen = cfg.manaRegen !== undefined ? cfg.manaRegen : 1;
    this.abilities = cfg.abilities ? cfg.abilities.slice(0, 9) : [];
    this.cooldowns = {};
    this.autocast = {};
    this._cast = null;
    clearStatuses(this);
    if (this.maxMana > 0) this._ensureManaBar();
  }

  /** F4-03: cria a barra de mana (filhos do `hpGroup`, geometria e fundo compartilhados). */
  _ensureManaBar() {
    if (this.manaFillMesh || !this.hpGroup) return;
    this.manaBgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    this.manaBgMesh.name = 'ManaBg';
    this.manaBgMesh.position.set(0, -0.26, 0);
    this.manaBgMesh.renderOrder = 1100;
    this.hpGroup.add(this.manaBgMesh);
    this.manaFillMesh = new THREE.Mesh(hpFillGeo, manaBlueMat);
    this.manaFillMesh.name = 'ManaFill';
    this.manaFillMesh.position.set(-0.64, -0.26, 0.005);
    this.manaFillMesh.renderOrder = 1101;
    this.hpGroup.add(this.manaFillMesh);
    this.updateManaBar();
  }

  updateManaBar() {
    if (!this.manaFillMesh) return;
    const pct = this.maxMana > 0 ? Math.max(0, Math.min(1, this.mana / this.maxMana)) : 0;
    this.manaFillMesh.scale.x = Math.max(0.001, pct);
    this._manaFill = Math.round(pct * 200);
  }

  /** F4-03: barras (vida/mana) visíveis? Selecionada, ferida ou com mana incompleta. */
  _barsVisible() {
    return !!this.isSelected || this.hp < this.maxHp || (this.maxMana > 0 && this.mana < this.maxMana);
  }

  getHealthBarHeight() {
    return getUnitDef(this.type).healthBarHeight;
  }

  updateHealthBar() {
    if (!this.hpFillMesh) return;
    const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpFillMesh.scale.x = Math.max(0.001, pct);
    this.hpFillMesh.material = pct > 0.5 ? hpGreenMat : (pct > 0.25 ? hpYellowMat : hpRedMat);
  }

  setSelected(selected) {
    this.isSelected = selected;
    if (this.isDead || this.isDying || this.state === 'dying') {
      if (this.selectionRing) this.selectionRing.visible = false;
      if (this.hpGroup) this.hpGroup.visible = false;
      return;
    }
    this.selectionRing.visible = selected;
    if (this.hpGroup) {
      this.hpGroup.visible = (this.mesh ? this.mesh.visible : true) && (selected || this._barsVisible());
    }
  }

  // --- COMMANDS ---

  /**
   * F2-02: limpa a memória dos estados derivados de attack-move/patrol/hold (`_amDest`,
   * `_returnToPatrol`, `_patrolA/_patrolB`, `_isHolding`) — chamado no início de toda ordem
   * explícita (moveTo/orderGather/orderBuild/orderAttack/stop/hold) para que uma nova ordem
   * do jogador sempre substitua a anterior, mesmo quando ela viria de um "retorno" automático
   * (ver `_giveUpAttack`).
   */
  _clearOrderModes() {
    this._cast = null;
    this._exitMine();
    this._isHolding = false;
    this._amDest = null;
    this._returnToPatrol = false;
    this._patrolA = null;
    this._patrolB = null;
  }

  /**
   * F3-04: sai da mina/pedreira quando uma nova ordem chega enquanto a unidade está em
   * `waitingMine` (fila) ou `insideMine` (dentro, invisível) — libera o slot/lugar na fila
   * (`ResourceDeposit.release`) e reaparece sem carga (item 4 da spec). Chamado por
   * `_clearOrderModes` (moveTo/orderGather/orderBuild/orderAttack/orderPatrol/die) e
   * explicitamente por `stop`/`hold`, que não passam por `_clearOrderModes`.
   */
  _exitMine() {
    if (this.state !== 'waitingMine' && this.state !== 'insideMine') return;
    const deposit = this.gatherTarget;
    if (deposit && typeof deposit.release === 'function') deposit.release(this);
    if (this.mesh && !this.mesh.visible) {
      this.mesh.visible = true;
      if (this.gameManager && typeof this.gameManager._insertIntoGrid === 'function') {
        this.gameManager._insertIntoGrid(this);
      }
    }
    this._mineTimer = 0;
  }

  /**
   * F2-02: executa uma ordem já resolvida (entidades reais, não ids) — usada tanto pelo
   * `CommandExecutor` (execução imediata) quanto por `updateIdle` (próximo item de
   * `orderQueue`, ver item 4 da spec: shift-queue para MOVE/ATTACK_MOVE/GATHER/BUILD).
   * `order.type` reaproveita os valores de `CMD` (`src/sim/commands.js`).
   */
  runQueuedOrder(order) {
    const gm = this.gameManager;
    switch (order.type) {
      case CMD.MOVE:
        this.moveTo(order.x, order.z, gm);
        break;
      case CMD.ATTACK_MOVE:
        this.orderAttackMove(order.x, order.z, gm);
        break;
      case CMD.GATHER:
        this.orderGather(order.target);
        break;
      case CMD.BUILD:
        this.orderBuild(order.target);
        break;
      case CMD.REPAIR:
        this.orderRepair(order.target);
        break;
      case CMD.CAST:
        this.orderCast(order);
        break;
      default:
        break;
    }
  }

  moveTo(x, z, gameManager = this.gameManager) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this._clearOrderModes();

    this.state = 'moving';
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;

    const gm = gameManager || this.gameManager;
    if (gm && gm.pathfinder) {
      // Snap destination if clicked in water
      if (gm.pathfinder.isWater(x, z)) {
        const snapped = gm.pathfinder.findNearestWalkable(x, z);
        x = snapped.x;
        z = snapped.z;
      }
      this.pathDestination = { x, z };
      this.hasTargetPos = false;
      this.pathPending = true;
      gm.pathfinder.requestPath(this, x, z, (path) => {
        this.pathPending = false;
        // Descarta callback obsoleto (ordem já mudou enquanto o pedido esperava na fila).
        if (!MOVEY_STATES.has(this.state) || !this.pathDestination || this.pathDestination.x !== x || this.pathDestination.z !== z) return;
        this.waypoints = path;
        this.waypointIndex = 0;
        // F3-08: destino inalcançável (parede fechada) em attack-move — ataca a muralha que bloqueia.
        if (path.noPath && this.state === 'attackMoving' && this._attackBlockingWall(gm, path, x, z)) return;
        if (path.length === 0) {
          this.hasTargetPos = false;
          this.stop();
          return;
        }
        this.targetPos.set(path[0].x, 0, path[0].z);
        this.hasTargetPos = true;
      });
    } else {
      this.targetPos.set(x, 0, z);
      this.hasTargetPos = true;
      this.waypoints = null;
      this.waypointIndex = 0;
      this.pathDestination = null;
    }
  }

  /**
   * F3-08: `requestPath` de um attack-move terminou sem caminho até o destino. Escolhe a muralha
   * hostil mais próxima do ponto alcançável mais próximo do destino (fim do caminho parcial, ou a
   * própria posição se não há caminho parcial) e a ataca; a marcha é retomada (`_amDest`) quando
   * ela cair. Devolve true se passou a atacar uma muralha.
   */
  _attackBlockingWall(gm, path, destX, destZ) {
    const wall = this._findBlockingWall(gm, path, destX, destZ, true);
    if (!wall) return false;
    this.orderAttack(wall);
    this._amDest = { x: destX, z: destZ };
    return true;
  }

  /**
   * F3-08: muralha hostil mais próxima do fim do caminho parcial `path` (ponto alcançável mais
   * próximo do destino; a própria posição se o caminho é vazio). Com `allowFar`, se não há muralha
   * perto desse ponto, tenta a mais próxima do destino (raio 30).
   */
  _findBlockingWall(gm, path, destX, destZ, allowFar = false) {
    if (!gm || !gm.blockerGrid || !this.isCombatUnit()) return null;
    const end = path.length > 0 ? path[path.length - 1] : this.mesh.position;
    const self = this;
    const isWall = b => b instanceof Building && !b.isDead && b.hp > 0 && b.role === 'wall' && self.isHostileTo(b);
    gm.blockerGrid.queryRadius(end.x, end.z, 14, isWall, _wallBuf);
    let wall = pickNearestInBuf(_wallBuf, end.x, end.z);
    if (!wall && allowFar) {
      gm.blockerGrid.queryRadius(destX, destZ, 30, isWall, _wallBuf);
      wall = pickNearestInBuf(_wallBuf, destX, destZ);
    }
    return wall;
  }

  orderGather(resource) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    if (!this.isWorker()) return;
    this._clearOrderModes();
    this.gatherTarget = resource;
    this.targetEntity = resource;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;

    // Update active tool visibility on model
    if (this.mesh.userData.axe && this.mesh.userData.pickaxe) {
      const isTree = resource.type === 'tree';
      this.mesh.userData.axe.visible = isTree;
      this.mesh.userData.pickaxe.visible = !isTree;
      if (this.mesh.userData.hammer) this.mesh.userData.hammer.visible = false;
    }

    const resType = resource.type === 'tree' ? 'wood' : resource.type;
    // If worker is carrying a different resource type, drop off at base first before harvesting new type
    if (this.carrying.amount > 0 && this.carrying.type !== resType) {
      this.state = 'returning';
    } else {
      this.state = 'gathering';
    }
  }

  /**
   * F3-05: trabalhador pode juntar-se a `building`? Máx. 4 trabalhadores simultâneos por
   * construção; se lotada, avisa o dono local e o trabalhador fica parado (`stop`).
   */
  _acceptWorkSlot(building) {
    const gm = this.gameManager;
    if (!gm || typeof gm.countWorkersOn !== 'function') return true;
    if (gm.countWorkersOn(building, this) < MAX_WORKERS_PER_BUILDING) return true;
    const owner = gm.getPlayer ? gm.getPlayer(this.ownerId) : null;
    if (owner && owner.isLocal) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: '⚠️ Muitos trabalhadores nesta obra' });
    this.stop();
    return false;
  }

  orderBuild(building) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    if (!this.isWorker()) return;
    if (!this._acceptWorkSlot(building)) return;
    this._clearOrderModes();
    this.state = 'building';
    this.repairTarget = null;
    this.buildTarget = building;
    this.targetEntity = building;
    this.gatherTarget = null;
    this.attackTarget = null;

    if (this.mesh.userData.hammer) {
      this.mesh.userData.hammer.visible = true;
      if (this.mesh.userData.axe) this.mesh.userData.axe.visible = false;
      if (this.mesh.userData.pickaxe) this.mesh.userData.pickaxe.visible = false;
    }
  }

  /** F3-05: ordem de reparo de uma construção (só trabalhadores; mesma regra de 4 por obra). */
  orderRepair(building) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    if (!this.isWorker()) return;
    if (!building || building.isDead || !building.isConstructed || building.hp >= building.maxHp) return;
    if (!this._acceptWorkSlot(building)) return;
    this._clearOrderModes();
    this.state = 'repairing';
    this.repairTarget = building;
    this.buildTarget = null;
    this.targetEntity = building;
    this.gatherTarget = null;
    this.attackTarget = null;

    if (this.mesh.userData.hammer) {
      this.mesh.userData.hammer.visible = true;
      if (this.mesh.userData.axe) this.mesh.userData.axe.visible = false;
      if (this.mesh.userData.pickaxe) this.mesh.userData.pickaxe.visible = false;
    }
  }

  orderAttack(target, preserveObjective = false) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this._clearOrderModes();
    this.state = 'attacking';
    this.attackTarget = target;
    this.targetEntity = target;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.hasFiredThisAttack = false;
    const isBuilding = target && (target.fullMesh || target.isConstructed !== undefined);
    if (isBuilding) {
      this.objectiveTarget = target;
    } else if (!preserveObjective) {
      this.objectiveTarget = null;
    }
  }

  stop() {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this._cast = null;
    this._exitMine();
    this.state = 'idle';
    this.hasTargetPos = false;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.hasFiredThisAttack = false;
    this.resetPose();
    if (this.animator) {
      this.animator.setAnimation('idle');
      this.animator.reset();
    }
  }

  /**
   * F2-02 (comando HOLD): fica parada nesta posição; unidades de combate atacam sozinhas,
   * mas só alvos dentro do próprio `attackRange` (nunca perseguem — ver `updateAttacking`).
   */
  hold() {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this._cast = null;
    this._exitMine();
    this.state = 'holding';
    this._isHolding = true;
    this._amDest = null;
    this._returnToPatrol = false;
    this.hasTargetPos = false;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.hasFiredThisAttack = false;
    this.resetPose();
    if (this.animator) {
      this.animator.setAnimation('idle');
      this.animator.reset();
    }
  }

  /**
   * F2-02 (comando ATTACK_MOVE): anda até (x, z) via `moveTo` (reaproveitado); ao longo do
   * caminho, unidades de combate atacam sozinhas qualquer hostil dentro de `aggroRange`
   * (ver `updateAttackMoving`) e retomam a marcha ao destino quando não sobrar alvo
   * (`_giveUpAttack`).
   */
  orderAttackMove(x, z, gameManager = this.gameManager) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this.moveTo(x, z, gameManager); // já chama _clearOrderModes()
    this.state = 'attackMoving';
    this._amDest = { x, z };
  }

  /**
   * F2-02 (comando PATROL): alterna entre a posição atual e (x, z), com comportamento de
   * attack-move em cada trecho (ver `updatePatrolling`).
   */
  orderPatrol(x, z, gameManager = this.gameManager) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this._clearOrderModes();
    this._patrolA = { x: this.mesh.position.x, z: this.mesh.position.z };
    this._patrolB = { x, z };
    this._patrolToB = true;
    this.state = 'patrolling';
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.hasFiredThisAttack = false;
    this.gameManager = gameManager || this.gameManager;
  }

  /**
   * F2-02: chamado quando `updateAttacking` não tem mais alvo (morto/fora de alcance sem
   * substituto). Unidades comuns voltam a `idle` (`stop`); unidades em HOLD voltam a `hold`
   * (sem se mover); unidades em ATTACK_MOVE/PATROL retomam a marcha/o trecho de patrulha.
   */
  _giveUpAttack() {
    if (this._isHolding) {
      this.hold();
      return;
    }
    if (this._returnToPatrol) {
      this._returnToPatrol = false;
      this.state = 'patrolling';
      return;
    }
    if (this._amDest) {
      const dest = this._amDest;
      this._amDest = null;
      this.orderAttackMove(dest.x, dest.z, this.gameManager);
      return;
    }
    this.stop();
  }

  /**
   * F3-03: `amount` já é o dano final (calculado por `computeDamage` no chamador, que consome
   * o RNG de combate) — esta função não subtrai mais armadura nem força mínimo 2.
   */
  takeDamage(amount, attacker = null, allUnits = []) {
    if (this.isDead || this.isDying) return;
    if (this.mods.invulnerable) return; // F4-03: status invulnerable zera o dano
    if (this.mods.invisible) this.breakInvisibility(); // F4-04: dano revela
    // F3-09: atribuição de kills (lida em die()).
    if (attacker && typeof attacker.ownerId === 'number') this.lastAttackerOwnerId = attacker.ownerId;

    const effectiveDamage = amount;
    this.hp -= effectiveDamage;
    this.updateHealthBar();
    if (this.hpGroup) {
      this.hpGroup.visible = (this.mesh ? this.mesh.visible : true) && this._barsVisible();
    }

    const gmEvents = this.gameManager && this.gameManager.events;
    if (gmEvents) {
      gmEvents.emit(EVT.UNIT_DAMAGED, {
        unitId: this.id,
        ownerId: this.ownerId,
        pos: posOf(this.mesh.position),
        amount: effectiveDamage
      });
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }

    // Hurt recoil animation & red damage flash
    this.hurtTimer = 0.45;
    if (this.animator) {
      this.animator.setAnimation('hurt', true);
    }

    // Retaliation & Call for help: combat troops strike back when attacked
    if (attacker && !attacker.isDead && attacker.hp > 0 && this.isHostileTo(attacker)) {
      if (this.isCombatUnit() && this.state !== 'casting') {
        const isTargetBuilding = this.attackTarget && (this.attackTarget.fullMesh || this.attackTarget.isConstructed !== undefined);
        // F4-05: suicida já em ataque mantém o alvo (não troca a construção por quem o acertou)
        if (this.suicide ? this.state !== 'attacking' : (this.state !== 'attacking' || isTargetBuilding)) {
          const savedObjective = isTargetBuilding ? this.attackTarget : this.objectiveTarget;
          this.orderAttack(attacker, !!savedObjective);
          if (savedObjective) {
            this.objectiveTarget = savedObjective;
          }
        }
      }

      // Nearby friendly combat troops rush to assist! (F1-06: unitGrid.queryRadius no lugar de
      // varrer allUnits — o próprio raio da consulta já cobre `helpRadius + raio do aliado`)
      const gm = this.gameManager;
      if (gm && gm.unitGrid) {
        const pos = this.mesh.position;
        const self = this;
        gm.unitGrid.queryRadius(pos.x, pos.z, this.helpRadius, u =>
          !u.isDead && self.isAlliedWith(u) && u.isCombatUnit && u.isCombatUnit() && !u.suicide,
        _helpBuf);
        for (let i = 0; i < _helpBuf.length; i++) {
          const u = _helpBuf[i];
          const isFriendlyTargetBuilding = u.attackTarget && (u.attackTarget.fullMesh || u.attackTarget.isConstructed !== undefined);
          if (u.state === 'idle' || (u.state === 'attacking' && isFriendlyTargetBuilding)) {
            const savedObjective = isFriendlyTargetBuilding ? u.attackTarget : u.objectiveTarget;
            u.orderAttack(attacker, !!savedObjective);
            if (savedObjective) {
              u.objectiveTarget = savedObjective;
            }
          }
        }
      }
    }
  }

  die() {
    if (this.isDying) return;
    this._exitMine();
    this.isDying = true;
    this.isDead = true;
    this._cast = null;
    this.canRemove = false;
    this.state = 'dying';
    this.deathTimer = 0;
    this.deathDuration = 1.6;
    this._deathSinkOffset = 0;

    const gmEvents = this.gameManager && this.gameManager.events;
    if (gmEvents) {
      gmEvents.emit(EVT.UNIT_DIED, {
        unitId: this.id,
        ownerId: this.ownerId,
        pos: posOf(this.mesh.position),
        unitType: this.type,
        killerOwnerId: this.lastAttackerOwnerId ?? null,
        expired: this._expired // F4-04: fim de `lifetime` — não conta como baixa
      });
    }
    // F4-04: registra o cadáver (só dados) para Erguer Mortos — sem cadáver: invocações expiradas, cerco, suicidas, ovelhas.
    if (!this._expired && !getUnitDef(this.type).corpseless && this.gameManager && this.gameManager.corpses) {
      this.gameManager.corpses.add(this.mesh.position.x, this.mesh.position.z, this.ownerId, this.type, this.gameManager.gameTime);
    }

    this.hasTargetPos = false;
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.orderQueue = null;
    this._clearOrderModes();

    if (this.gameManager && this.gameManager.selectedUnits) {
      const idx = this.gameManager.selectedUnits.indexOf(this);
      if (idx !== -1) {
        this.gameManager.selectedUnits.splice(idx, 1);
      }
    }

    if (this.selectionRing) this.selectionRing.visible = false;
    if (this.hpGroup) this.hpGroup.visible = false;

    if (this.animator) {
      this.animator.setAnimation('die', true);
    }
  }

  resetPose() {
    this.resetWalkPose();
    const ud = this.mesh.userData;
    if (ud.toolGroup) ud.toolGroup.rotation.x = 0;
    if (ud.sword) ud.sword.rotation.x = 0.5;
    if (ud.weapon) ud.weapon.rotation.x = 0.5;
  }

  resetWalkPose() {
    const ud = this.mesh.userData;
    if (ud.legL) ud.legL.rotation.x = 0;
    if (ud.legR) ud.legR.rotation.x = 0;
    if (ud.armL) ud.armL.rotation.x = 0;
    if (ud.armR) ud.armR.rotation.x = 0;
  }

  stepTowards(targetX, targetZ, maxDist) {
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const dx = targetX - curX;
    const dz = targetZ - curZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;

    const move = Math.min(dist, maxDist);
    const dirX = dx / dist;
    const dirZ = dz / dist;

    const nextX = curX + dirX * move;
    const nextZ = curZ + dirZ * move;

    // WATER IMPASSABILITY: Units cannot enter or cross water!
    const nextH = this.terrain.getHeight(nextX, nextZ);
    if (nextH < 0.65) {
      // Impassable water obstacle! Try sliding along X or Z if one direction is on dry land
      const hX = this.terrain.getHeight(nextX, curZ);
      const hZ = this.terrain.getHeight(curX, nextZ);
      if (hX >= 0.65) {
        this.mesh.position.x = nextX;
      } else if (hZ >= 0.65) {
        this.mesh.position.z = nextZ;
      }
      this.mesh.position.y = this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z);
      return false;
    }

    this.mesh.position.x = nextX;
    this.mesh.position.z = nextZ;
    this.mesh.position.y = nextH;

    this.mesh.rotation.y = Math.atan2(dirX, dirZ);
    return (dist - move) < 0.15;
  }

  moveTowards(destX, destZ, delta, gameManager = this.gameManager) {
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const distToFinal = Math.hypot(destX - curX, destZ - curZ);
    if (distToFinal < 0.1) return;

    let subTargetX = destX;
    let subTargetZ = destZ;

    const gm = gameManager || this.gameManager;
    if (gm && gm.pathfinder) {
      const los = gm.pathfinder.hasLineOfSight(curX, curZ, destX, destZ);
      if (!los) {
        // Direct line blocked by water! Route through waypoints / fords
        const distFromLastDest = this.pathDestination
          ? Math.hypot(destX - this.pathDestination.x, destZ - this.pathDestination.z)
          : Infinity;

        if ((!this.waypoints || this.waypoints.length === 0 || distFromLastDest > 2.5) && !this._chaseRequestPending) {
          this.pathDestination = { x: destX, z: destZ };
          this._chaseRequestPending = true;
          gm.pathfinder.requestPath(this, destX, destZ, (path) => {
            this._chaseRequestPending = false;
            this.waypoints = path;
            this.waypointIndex = 0;
            // F3-08: perseguindo um alvo sem caminho (parede fechada no meio) — ataca a muralha
            // que bloqueia e retoma o alvo original (`objectiveTarget`) quando ela cair.
            if (path.noPath && this.state === 'attacking' && this.attackTarget && this.attackTarget.role !== 'wall') {
              const wall = this._findBlockingWall(gm, path, destX, destZ);
              if (wall) {
                if (!this.objectiveTarget) this.objectiveTarget = this.attackTarget;
                this.attackTarget = wall;
                this.targetEntity = wall;
                this.hasFiredThisAttack = false;
              }
            }
          });
        }

        if (this.waypoints && this.waypointIndex < this.waypoints.length) {
          const wp = this.waypoints[this.waypointIndex];
          const distToWp = Math.hypot(wp.x - curX, wp.z - curZ);
          if (distToWp < 0.8 && this.waypointIndex < this.waypoints.length - 1) {
            this.waypointIndex++;
          }
          const activeWp = this.waypoints[this.waypointIndex];
          subTargetX = activeWp.x;
          subTargetZ = activeWp.z;
        } else {
          // Aguardando o caminho chegar da fila (F1-07): fica parada em vez de atravessar o obstáculo.
          subTargetX = curX;
          subTargetZ = curZ;
        }
      } else {
        this.waypoints = null;
        this.pathDestination = null;
      }
    }

    this.stepTowards(subTargetX, subTargetZ, this.speed * this.mods.speedMul * delta);

    // Walk animation (troca de estado só; a reprodução em si roda em renderUpdate — F1-09)
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('walk');
    }
  }

  update(delta, gameManager, arrows, allUnits, buildings) {
    if (this.canRemove) return;
    this.gameManager = gameManager;

    // Safety: ensure unit never stays submerged in water
    if (this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z) < 0.65) {
      if (gameManager && gameManager.pathfinder) {
        const safe = gameManager.pathfinder.findNearestWalkable(this.mesh.position.x, this.mesh.position.z);
        this.mesh.position.x = safe.x;
        this.mesh.position.z = safe.z;
        this.mesh.position.y = this.terrain.getHeight(safe.x, safe.z);
      }
    }

    if (this.isDead || this.isDying || this.state === 'dying') {
      this.state = 'dying';
      this.deathTimer += delta;
      // Animação 'die' e o afundamento visual (mesh.position.y) rodam em renderUpdate (F1-09):
      // aqui só a lógica de simulação (timer que decide quando a unidade pode ser removida).
      if (this.deathTimer >= this.deathDuration) {
        this.canRemove = true;
        this.dispose();
      }
      return;
    }

    if (this.hurtTimer > 0) {
      this.hurtTimer -= delta;
      // A reprodução da animação de 'hurt' roda em renderUpdate (F1-09); aqui só o timer.
      if (this.hurtTimer <= 0 && this.animator) {
        this.animator.reset();
      }
    }

    this.attackTimer += delta;
    this.actionTimer += delta;

    this._updateAbilityTimers(delta, gameManager);
    if (this.isDead) return;

    // F3-10: guarda neutro com leash (bandoleiros) — volta à origem se se afastar demais.
    if (this.homePos) this._updateGuardLeash(delta);

    switch (this.state) {
      case 'idle':
        this.updateIdle(delta, allUnits, buildings);
        break;
      case 'moving':
        this.updateMoving(delta, gameManager);
        break;
      case 'gathering':
        this.updateGathering(delta, gameManager, buildings);
        break;
      case 'waitingMine':
        this.updateWaitingMine(delta, gameManager);
        break;
      case 'insideMine':
        this.updateInsideMine(delta, gameManager);
        break;
      case 'returning':
        this.updateReturning(delta, gameManager, buildings);
        break;
      case 'building':
        this.updateBuilding(delta, gameManager);
        break;
      case 'repairing':
        this.updateRepairing(delta, gameManager);
        break;
      case 'attacking':
        this.updateAttacking(delta, gameManager, arrows, allUnits, buildings);
        break;
      case 'holding':
        this.updateHolding(delta, allUnits, buildings);
        break;
      case 'attackMoving':
        this.updateAttackMoving(delta, gameManager, allUnits, buildings);
        break;
      case 'patrolling':
        this.updatePatrolling(delta, gameManager, allUnits, buildings);
        break;
      case 'casting':
        this.updateCasting(delta, gameManager);
        break;
    }
  }

  // --- F4-03: mana, recargas, status, auto-cast e lançamento de habilidades ---

  /** Regenera mana, avança recargas/status/vida de invocação e roda o auto-cast (1 s, escalonado por id). */
  _updateAbilityTimers(delta, gm) {
    if (this.maxMana > 0 && this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * delta);
    }
    for (const id in this.cooldowns) {
      if (this.cooldowns[id] > 0) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - delta);
    }
    tickStatuses(this, delta, onStatusExpire);
    if (this.lifetime > 0) {
      this.lifetime -= delta;
      if (this.lifetime <= 0) {
        this.lifetime = 0;
        this._expired = true;
        this.die();
        return;
      }
    }
    if (this.abilities.length > 0 && gm && (this.state === 'idle' || this.state === 'attackMoving') &&
        (gm.currentTick + this.id) % 20 === 0) {
      this._autocastScan(gm);
    }
  }

  _autocastScan(gm) {
    for (let i = 0; i < this.abilities.length; i++) {
      const id = this.abilities[i];
      if (!this.autocast[id]) continue;
      const ab = resolveAbility(gm, id);
      if (!ab || !ab.autocast || !canCast(gm, this, ab).ok) continue;
      const found = findAutocastTarget(gm, this, ab);
      if (!found) continue;
      const resume = this.state === 'attackMoving' && this._amDest ? { x: this._amDest.x, z: this._amDest.z } : null;
      this.orderCast({ type: CMD.CAST, abilityId: id, target: found.target, resume });
      return;
    }
  }

  /** F4-04: um status expirou (NOTIFY de invisibilidade; Armadura Profana cobra metade do PV atual). */
  _statusExpired(id) {
    if (this.isDead || this.isDying) return;
    if (id === 'invisible') this._notifyInvisibleEnded();
    const def = STATUS_DEFS[id];
    if (def && def.onEndHpLoss > 0) {
      this.hp = Math.max(1, this.hp * (1 - def.onEndHpLoss));
      this.updateHealthBar();
    }
  }

  _notifyInvisibleEnded() {
    const gm = this.gameManager;
    if (gm && gm.events) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: 'Invisibilidade terminou' });
  }

  /** F4-04: invisibilidade acaba (ao atacar, lançar ou sofrer dano). */
  breakInvisibility() {
    if (removeStatus(this, 'invisible')) this._notifyInvisibleEnded();
  }

  /** F4-04: este jogador/unidade consegue enxergar/mirar `e`? (invisíveis só com detecção — `src/sim/detection.js`). */
  _canSee(e) {
    if (!e.mods || !e.mods.invisible) return true;
    return isDetectedBy(this.gameManager, e, this.ownerId);
  }

  /**
   * F4-04: Transmutação já aplicada por `GameManager.polymorphUnit` (que rodou `promoteUnit`): ajusta o que
   * `promoteUnit` não cobre — atributos da nova definição, modelo 3D (ovelha), ordens, mana/habilidades e
   * PV ≤ PV da nova unidade. Mantém dono, id, posição, barra de vida e anel de seleção.
   */
  applyPolymorph(toType) {
    const def = getUnitDef(toType);
    this._clearOrderModes();
    this.orderQueue = null;
    this.state = 'idle';
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.hasTargetPos = false;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.carrying.type = null;
    this.carrying.amount = 0;
    this.maxHp = def.hp;
    this.hp = Math.min(this.hp, def.hp);
    this.speed = def.speed;
    this.damage.basic = def.damage.basic;
    this.damage.piercing = def.damage.piercing;
    this.damage.type = def.damage.type;
    this.armor = def.armor || 0;
    this.attackRange = def.attackRange;
    this.attackCooldown = def.attackCooldown;
    this.collisionRadius = def.collisionRadius;
    this.isRanged = def.isRanged;
    this.projectileType = def.projectile;
    this.minAttackRange = def.minAttackRange || 0;
    this.splashRadius = def.splashRadius || 0;
    this.isBallistic = false;
    this.suicide = false;
    this.regen = 0;
    this.setupMana({ maxMana: 0 });
    this.mana = 0;
    if (this.manaFillMesh) { this.manaFillMesh.visible = false; this.manaBgMesh.visible = false; }
    this.lifetime = 0;
    this.updateHealthBar();
    this._swapModel(def.modelOf || toType);
    if (this.gameManager && this.gameManager.unitGrid) {
      const p = this.mesh.position;
      this.gameManager.unitGrid.update(this, p.x, p.z, this.collisionRadius);
    }
  }

  /** F4-04: troca o modelo 3D (mesma posição/escala/rotação), sem vazar malhas: remove o antigo da cena. */
  _swapModel(modelType) {
    const old = this.mesh;
    const mesh = this.createModel(modelType);
    mesh.position.copy(old.position);
    mesh.rotation.y = old.rotation.y;
    mesh.scale.copy(old.scale);
    mesh.visible = old.visible;
    mesh.userData.entity = this;
    if (this.selectionRing) {
      old.remove(this.selectionRing);
      mesh.add(this.selectionRing);
    }
    if (this.scene) {
      this.scene.remove(old);
      this.scene.add(mesh);
    }
    this.mesh = mesh;
    this.animator = new UnitAnimator(mesh, modelType);
    this._ghost = false;
  }

  /** Ordem `cast` (já validada por `CommandExecutor`): anda até o alcance, lança e volta a `idle`. */
  orderCast(order) {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    const gm = this.gameManager;
    const ab = resolveAbility(gm, order.abilityId);
    if (!ab || !this.abilities.includes(ab.id)) return;
    this._clearOrderModes();
    this.state = 'casting';
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.hasTargetPos = false;
    this.waypoints = null;
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.hasFiredThisAttack = false;
    this._cast = { ab, target: order.target || null, x: order.x, z: order.z, phase: 0, timer: 0, resume: order.resume || null };
  }

  _endCast() {
    const c = this._cast;
    this._cast = null;
    this.stop();
    if (c && c.resume) this.orderAttackMove(c.resume.x, c.resume.z, this.gameManager);
  }

  updateCasting(delta, gm) {
    const c = this._cast;
    if (!c) { this.stop(); return; }
    const ab = c.ab;
    const t = c.target;
    // F4-04: fase 2 = canalização em curso (Nevasca/Nuvem de Cinzas): o conjurador fica parado, pagando mana por onda.
    if (c.phase === 2) {
      this._updateChannel(delta, gm, c);
      return;
    }
    let tx;
    let tz;
    if (needsEntityTarget(ab)) {
      if (targetProblem(this, ab, t)) { this._endCast(); return; }
      tx = t.mesh.position.x;
      tz = t.mesh.position.z;
    } else if (ab.target === 'ground') {
      tx = c.x;
      tz = c.z;
    } else {
      tx = this.mesh.position.x;
      tz = this.mesh.position.z;
    }
    const dist = Math.hypot(tx - this.mesh.position.x, tz - this.mesh.position.z) - ((t && t.collisionRadius) || 0);

    if (c.phase === 0) {
      if (dist > ab.range) {
        this.moveTowards(tx, tz, delta, gm);
        return;
      }
      const check = canCast(gm, this, ab);
      if (!check.ok) {
        if (gm.events) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: check.reason });
        this._endCast();
        return;
      }
      c.phase = 1;
      c.timer = 0;
      emitCastStart(gm, this, ab, t);
      if (this.animator && this.hurtTimer <= 0) this.animator.setAnimation('cast');
    } else if (dist > ab.range + 1.5) {
      c.phase = 0; // alvo fugiu durante o lançamento: reperseguir (recomeça o castTime)
      return;
    } else {
      c.timer += delta;
    }

    if (tx !== this.mesh.position.x || tz !== this.mesh.position.z) {
      this.mesh.rotation.y = Math.atan2(tx - this.mesh.position.x, tz - this.mesh.position.z);
    }
    if (c.timer + 1e-9 >= (ab.castTime || 0)) {
      const check = canCast(gm, this, ab);
      if (!check.ok) {
        if (gm.events) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: check.reason });
        this._endCast();
        return;
      }
      if (this.mods.invisible) this.breakInvisibility(); // F4-04: lançar revela
      const channel = getChannel(ab);
      if (channel) {
        // F4-04: canalização — a recarga começa já; as ondas (mana por onda) rodam em `_updateChannel`.
        this.cooldowns[ab.id] = ab.cooldown || 0;
        c.phase = 2;
        c.wave = 0;
        c.waveTimer = channel.interval; // 1ª onda imediata
        c.channel = channel;
        return;
      }
      applyAbility(gm, this, ab, t, c.x, c.z);
      this._endCast();
    }
  }

  /** F4-04: uma onda por `interval` s; cada onda cobra `manaCost`; para sem mana ou após `waves` ondas. */
  _updateChannel(delta, gm, c) {
    const ch = c.channel;
    if (c.wave >= ch.waves) { this._endCast(); return; }
    c.waveTimer += delta;
    if (c.waveTimer + 1e-9 < ch.interval) return;
    c.waveTimer = 0;
    if (!applyChannelWave(gm, this, c.ab, ch, c.x, c.z)) { // sem mana: interrompe
      if (gm.events) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: '⚠️ Mana insuficiente' });
      this._endCast();
      return;
    }
    c.wave++;
    if (c.wave >= ch.waves) this._endCast();
  }

  /**
   * F1-09: parte visual, rodada uma vez por frame renderizado (não por passo de simulação).
   * Interpola `mesh.position`/`mesh.rotation.y` entre a pose anterior e a atual do tick fixo,
   * atualiza o billboard da barra de vida e reproduz a animação (com o LOD por distância que
   * `GameManager.renderUpdate` calcula em `lodStep`/`frameDelta`).
   * @param {number} frameDelta  segundos reais desde o último frame (0 = pausado; já pode vir
   *   com o delta acumulado do LOD — ver GameManager.renderUpdate)
   * @param {number} alpha  fração ∈ [0,1) do próximo passo de simulação ainda não ocorrida
   * @param {number} lodStep  1 = anima este frame, 0 = pula (unidade oculta/distante)
   */
  renderUpdate(frameDelta, alpha, lodStep) {
    if (this.canRemove) return;

    // Interpolação de transform (item 2 da spec F1-09): a lógica de simulação continua
    // escrevendo em mesh.position/mesh.rotation.y; aqui só suavizamos a exibição entre poses.
    this.mesh.position.lerpVectors(this._prevPos, this._simPos, alpha);
    this.mesh.rotation.y = lerpAngle(this._prevRotY, this._simRotY, alpha);

    // Billboard da barra de vida (movido de update() para renderUpdate() — precisa da câmera).
    if (this.hpGroup && this.scene) {
      if (this.isDead || this.isDying || this.state === 'dying' || (this.mesh && !this.mesh.visible)) {
        this.hpGroup.visible = false;
      } else {
        const isVisible = this._barsVisible();
        this.hpGroup.visible = isVisible;
        if (isVisible && this.manaFillMesh && Math.round(this.mana / this.maxMana * 200) !== this._manaFill) this.updateManaBar();
        if (isVisible && this.gameManager && this.gameManager.sceneManager) {
          const h = this.getHealthBarHeight();
          this.hpGroup.position.set(this.mesh.position.x, this.mesh.position.y + h, this.mesh.position.z);
          this.hpGroup.quaternion.copy(this.gameManager.sceneManager.camera.quaternion);
        }
      }
    }

    if (this.isDying) {
      // Afundamento visual pós-colapso (mesh.position.y), com frameDelta real — não o tick fixo.
      if (this.deathTimer >= 1.0) {
        this._deathSinkOffset += frameDelta * 0.35;
        this.mesh.position.y -= this._deathSinkOffset;
      }
      if (this.animator && lodStep > 0) this.animator.update(frameDelta);
      return;
    }

    if (!this.animator || lodStep <= 0) return;

    if (this.state === 'attacking' && this.hurtTimer <= 0 && this.animator.currentAnim === 'fight') {
      // Progresso contínuo do ataque (attackTimer do último tick + fração do próximo ainda não
      // simulada) — evita o "degrau" de 20 Hz na animação de ataque.
      const t = Math.min(1, (this.attackTimer + alpha * SIM_DT) / this.effAttackCooldown);
      this.animator.setTime(t);
    } else {
      this.animator.update(frameDelta * lodStep);
    }
  }

  /**
   * F3-10: leash dos guardas neutros (`homePos` definido por `GameManager.spawnNeutrals`).
   * Se a unidade se afastar mais de `GUARD_LEASH` da origem, larga o alvo e volta (`moveTo`),
   * recuperando 5 % do PV máximo por segundo até chegar; durante o retorno ordens de ataque
   * automáticas (retaliação/auto-aquisição) são sobrescritas — não persegue além do leash.
   */
  _updateGuardLeash(delta) {
    const p = this.mesh.position;
    const h = this.homePos;
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (!this._returningHome) {
      if (d > GUARD_LEASH) {
        this._returningHome = true;
        this.moveTo(h.x, h.z, this.gameManager);
      }
      return;
    }
    if (this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * GUARD_REGEN * delta);
      this.updateHealthBar();
    }
    if (d < 2.5) {
      this._returningHome = false;
      this.stop();
    } else if (this.state !== 'moving') {
      this.moveTo(h.x, h.z, this.gameManager);
    }
  }

  updateIdle(delta, allUnits, buildings) {
    // F2-02 item 4 (shift-queue): próxima ordem empilhada por CommandExecutor/runQueuedOrder
    // roda assim que a unidade fica idle (MOVE/ATTACK_MOVE/GATHER/BUILD).
    if (this.orderQueue && this.orderQueue.length > 0) {
      const next = this.orderQueue.shift();
      this.runQueuedOrder(next);
      return;
    }

    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('idle');
    }

    // Auto-Aggro: Military combat units actively scan for and attack approaching enemies
    if (this.isCombatUnit()) {
      const target = this.findNearestHostile(allUnits, buildings, this.aggroRange);
      if (target) {
        this.orderAttack(target);
      }
    }
  }

  /**
   * F2-02 (comando HOLD): não se move; ataca sozinha só alvos dentro do próprio `attackRange`
   * (nunca do `aggroRange`, mais largo). Ao contrário de `updateIdle`, não consome `orderQueue`
   * (HOLD é uma ordem "fim de linha" — cancela a fila em `CommandExecutor`).
   */
  updateHolding(delta, allUnits, buildings) {
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('idle');
    }
    if (!this.isCombatUnit()) return;
    const target = this.findNearestHostile(allUnits, buildings, this.attackRange);
    if (target) {
      this.state = 'attacking';
      this.attackTarget = target;
      this.targetEntity = target;
      this.hasFiredThisAttack = false;
    }
  }

  /**
   * F2-02 (comando ATTACK_MOVE): anda ao destino (`updateMoving`, reaproveitado) enquanto varre
   * hostis em `aggroRange`; ao achar um, ataca (via 'attacking') e retoma a marcha ao limpar
   * a área (`_giveUpAttack`, chamado por `updateAttacking`).
   */
  updateAttackMoving(delta, gameManager, allUnits, buildings) {
    if (this.isCombatUnit()) {
      const target = this.findNearestHostile(allUnits, buildings, this.aggroRange);
      if (target) {
        this.state = 'attacking';
        this.attackTarget = target;
        this.targetEntity = target;
        this.hasFiredThisAttack = false;
        return;
      }
    }
    this.updateMoving(delta, gameManager);
  }

  /**
   * F2-02 (comando PATROL): alterna entre `_patrolA`/`_patrolB` com o mesmo comportamento de
   * varredura de attack-move; ao chegar numa ponta, inverte o sentido em vez de parar.
   */
  updatePatrolling(delta, gameManager, allUnits, buildings) {
    if (this.isCombatUnit()) {
      const target = this.findNearestHostile(allUnits, buildings, this.aggroRange);
      if (target) {
        this.state = 'attacking';
        this.attackTarget = target;
        this.targetEntity = target;
        this.hasFiredThisAttack = false;
        this._returnToPatrol = true;
        return;
      }
    }

    const dest = this._patrolToB ? this._patrolB : this._patrolA;
    if (!dest) {
      this.stop();
      return;
    }
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const dist = Math.hypot(dest.x - curX, dest.z - curZ);
    if (dist < 0.5) {
      this._patrolToB = !this._patrolToB;
      return;
    }
    this.moveTowards(dest.x, dest.z, delta, gameManager);
  }

  updateMoving(delta, gameManager = this.gameManager) {
    if (!this.hasTargetPos) {
      if (this.pathPending) return; // aguardando requestPath (F1-07): fica parada, não cancela a ordem
      this.stop();
      return;
    }

    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const targetX = this.targetPos.x;
    const targetZ = this.targetPos.z;
    const dist = Math.hypot(targetX - curX, targetZ - curZ);

    if (dist < 0.45) {
      // Check if there are more waypoints along the route
      if (this.waypoints && this.waypointIndex < this.waypoints.length - 1) {
        this.waypointIndex++;
        const nextWp = this.waypoints[this.waypointIndex];
        this.targetPos.set(nextWp.x, 0, nextWp.z);
        return;
      }

      this.stop();
      return;
    }

    // Move step towards current target waypoint
    this.stepTowards(targetX, targetZ, this.speed * this.mods.speedMul * delta);

    // Walk animation cycle
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('walk');
    }
  }

  updateGathering(delta, gameManager, buildings) {
    if (!this.gatherTarget || this.gatherTarget.isDead || (this.gatherTarget.resourcesRemaining <= 0 && this.gatherTarget.woodRemaining <= 0)) {
      // Find another nearby resource of same type if possible
      const nextResource = gameManager.findNearestResource(this.mesh.position, this.gatherTarget ? this.gatherTarget.type : 'tree');
      if (nextResource) {
        this.gatherTarget = nextResource;
      } else {
        // Return whatever is currently carried
        if (this.carrying.amount > 0) {
          this.state = 'returning';
        } else {
          this.stop();
        }
        return;
      }
    }

    const targetPos = this.gatherTarget.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    // Contact / collision perimeter with resource
    const targetRadius = this.gatherTarget.collisionRadius || (this.gatherTarget.type === 'tree' ? 0.75 : 3.4);
    const contactDist = targetRadius + this.collisionRadius + 0.25;

    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // In contact / collided with resource: face it.
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);

    // F3-04: madeira continua cortada "de fora" (corte contínuo). Ouro/pedra passam a exigir
    // entrar na mina/pedreira — ver `updateWaitingMine`/`updateInsideMine` (item 2 da spec).
    if (this.gatherTarget.type !== 'tree') {
      this.actionTimer = 0;
      this.state = 'waitingMine';
      return;
    }

    // Chop Animation
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('gather');
    }

    // Extract resource ticks (every 0.9s)
    if (this.actionTimer >= 0.9) {
      this.actionTimer = 0;
      this.carrying.type = 'wood';
      if (this.carrying.amount === 0) this.carrying.max = CARRY.wood;
      const gmEvents = this.gameManager && this.gameManager.events;

      const harvested = this.gatherTarget.chop(3);
      this.carrying.amount += harvested;
      if (gmEvents) gmEvents.emit(EVT.WORKER_CHOP, { pos: posOf(this.mesh.position), ownerId: this.ownerId });

      // If full capacity reached, return to base
      if (this.carrying.amount >= this.carrying.max) {
        this.state = 'returning';
        this.updateCarryingVisuals(true);
      }
    }
  }

  /**
   * F3-04: unidade parada junto à mina/pedreira, tentando um lugar (`ResourceDeposit.slots`).
   * Fila determinística: ordem de chegada (primeira chamada de `requestEnter` enfileira; ver
   * `ResourceDeposit`), sem `Math.random`/relógio.
   */
  updateWaitingMine(delta, gameManager) {
    if (!this.gatherTarget || this.gatherTarget.isDead || this.gatherTarget.resourcesRemaining <= 0) {
      const gm = gameManager || this.gameManager;
      const depletedType = this.gatherTarget ? this.gatherTarget.type : 'gold';
      if (this.gatherTarget && typeof this.gatherTarget.release === 'function') this.gatherTarget.release(this);
      const nextResource = gm ? gm.findNearestResource(this.mesh.position, depletedType) : null;
      if (nextResource) {
        this.gatherTarget = nextResource;
        this.state = 'gathering';
      } else {
        this.stop();
      }
      return;
    }

    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('idle');
    }

    if (this.gatherTarget.requestEnter(this)) {
      this.state = 'insideMine';
      this._mineTimer = 0;
      this.mesh.visible = false;
      const gm = gameManager || this.gameManager;
      if (gm && typeof gm._removeFromGrid === 'function') gm._removeFromGrid(this);
    }
  }

  /**
   * F3-04: unidade "dentro" da mina/pedreira (`mesh.visible = false`, fora do `unitGrid`
   * — alvo/seleção ignoram) por `MINE_ENTER_TIME` segundos; ao sair, carrega
   * `min(CARRY[recurso], restante) * gatherMultiplier` e libera o slot.
   */
  updateInsideMine(delta, gameManager) {
    const gm = gameManager || this.gameManager;
    const deposit = this.gatherTarget;
    if (!deposit || deposit.isDead) {
      this._exitMine();
      this.stop();
      return;
    }

    this._mineTimer += delta;
    if (this._mineTimer < MINE_ENTER_TIME) return;
    this._mineTimer = 0;

    const resType = deposit.type;
    const mult = gatherMultiplier(this.ownerId, resType, gm);
    const harvested = deposit.mine(CARRY[resType] * mult);

    this.carrying.type = resType;
    this.carrying.max = CARRY[resType];
    this.carrying.amount = harvested;

    if (deposit.consumeDepletedFlag()) {
      const gmEvents = gm && gm.events;
      if (gmEvents) {
        gmEvents.emit(EVT.RESOURCE_DEPLETED, {
          resourceId: deposit.id,
          pos: posOf(deposit.mesh.position),
          resourceType: resType
        });
      }
    }

    deposit.release(this);
    this.mesh.visible = true;
    if (gm && typeof gm._insertIntoGrid === 'function') gm._insertIntoGrid(this);

    if (harvested > 0) {
      this.state = 'returning';
      this.updateCarryingVisuals(true);
    } else {
      // Esgotou entre a entrada e a saída: procura outra jazida do mesmo tipo, sem carga.
      const nextResource = gm ? gm.findNearestResource(this.mesh.position, resType) : null;
      if (nextResource) {
        this.gatherTarget = nextResource;
        this.state = 'gathering';
      } else {
        this.stop();
      }
    }
  }

  depositResources(gameManager) {
    if (this.carrying.amount > 0) {
      const owner = gameManager.getPlayer ? gameManager.getPlayer(this.ownerId) : null;
      // F3-07: madeira entregue × `woodMultiplier` (Ofício do Lenhador); ouro/pedra já saem
      // multiplicados da mina (`updateInsideMine`).
      if (this.carrying.type === 'wood') {
        this.carrying.amount = Math.round(this.carrying.amount * gatherMultiplier(this.ownerId, 'wood', gameManager));
      }
      if (owner) owner.add(this.carrying.type, this.carrying.amount);

      const gmEvents = gameManager && gameManager.events;
      if (gmEvents) {
        gmEvents.emit(EVT.RESOURCE_GATHERED, {
          type: this.carrying.type,
          amount: this.carrying.amount,
          pos: posOf(this.mesh.position),
          ownerId: this.ownerId
        });
      }
      this.carrying.amount = 0;
      this.updateCarryingVisuals(false);
    }

    // Immediately resume gathering if target still has resources
    if (this.gatherTarget && !this.gatherTarget.isDead && (this.gatherTarget.woodRemaining > 0 || this.gatherTarget.resourcesRemaining > 0)) {
      this.state = 'gathering';
      this.resetWalkPose();
      if (this.mesh.userData.axe && this.mesh.userData.pickaxe) {
        const isTree = this.gatherTarget.type === 'tree';
        this.mesh.userData.axe.visible = isTree;
        this.mesh.userData.pickaxe.visible = !isTree;
        if (this.mesh.userData.hammer) this.mesh.userData.hammer.visible = false;
      }
    } else {
      this.stop();
    }
  }

  updateReturning(delta, gameManager, buildings) {
    // Find nearest dropoff building owned by this unit's player
    const dropoff = gameManager.findNearestDropoff(this.mesh.position, this.carrying.type, buildings || gameManager.buildings, this.ownerId);
    if (!dropoff) {
      this.stop();
      return;
    }

    const targetPos = dropoff.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);

    // Contact / collision perimeter of dropoff building
    const dropoffRadius = dropoff.collisionRadius || (dropoff.type === 'castle' ? 5.5 : 3.2);
    const contactDist = dropoffRadius + this.collisionRadius + 0.25;

    // Delivery triggers upon colliding / contacting the dropoff building!
    if (dist <= contactDist) {
      if (dropoff.processWoodDelivery && this.carrying.type === 'wood') {
        const gmEvents = gameManager && gameManager.events;
        if (gmEvents) {
          gmEvents.emit(EVT.BUILDING_VFX, {
            buildingId: dropoff.id,
            ownerId: dropoff.ownerId,
            pos: posOf(dropoff.mesh.position),
            kind: 'sawdust'
          });
        }
      }
      this.depositResources(gameManager);
      return;
    }

    this.moveTowards(targetPos.x, targetPos.z, delta);
  }

  updateCarryingVisuals(visible) {
    const ud = this.mesh.userData;
    if (ud.pack) {
      ud.pack.visible = visible;
      if (ud.woodBundle) ud.woodBundle.visible = visible && this.carrying.type === 'wood';
      if (ud.goldSack) ud.goldSack.visible = visible && (this.carrying.type === 'gold' || this.carrying.type === 'stone');
    }
  }

  updateBuilding(delta, gameManager) {
    if (!this.buildTarget || this.buildTarget.isDead || this.buildTarget.isConstructed) {
      this.stop();
      return;
    }

    const targetPos = this.buildTarget.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const targetRadius = this.buildTarget.collisionRadius || 3.0;
    const contactDist = targetRadius + this.collisionRadius + 0.25;

    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // In contact / collided with building scaffold: hammer it!
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);

    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('gather');
    }

    if (this.actionTimer >= 0.8) {
      this.actionTimer = 0;
      const gm = gameManager || this.gameManager;
      this.buildTarget.construct(10, gm);
      if (gm && gm.events) {
        gm.events.emit(EVT.WORKER_HAMMER, { pos: posOf(this.buildTarget.mesh.position), ownerId: this.ownerId });
      }
    }
  }

  /** F3-05: reparo — vai até o contato e a cada 0,8 s restaura 5 % do PV (custo por golpe). */
  updateRepairing(delta, gameManager) {
    const t = this.repairTarget;
    if (!t || t.isDead || !t.isConstructed || t.hp >= t.maxHp) {
      this.stop();
      return;
    }

    const targetPos = t.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const contactDist = (t.collisionRadius || 3.0) + this.collisionRadius + 0.25;
    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    this.mesh.rotation.y = Math.atan2(targetPos.x - this.mesh.position.x, targetPos.z - this.mesh.position.z);
    this.hasFiredThisAttack = false;
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('gather');
    }

    if (this.actionTimer >= REPAIR_INTERVAL) {
      this.actionTimer = 0;
      const gm = gameManager || this.gameManager;
      const res = t.repairHit(gm);
      if (res === 'nofunds') {
        const owner = gm.getPlayer ? gm.getPlayer(t.ownerId) : null;
        if (owner && owner.isLocal) gm.events.emit(EVT.NOTIFY, { ownerId: t.ownerId, text: '⚠️ Recursos insuficientes para reparar' });
        this.orderQueue = null;
        this.stop();
      } else if (res === 'full') {
        this.stop();
      } else if (gm && gm.events) {
        gm.events.emit(EVT.WORKER_HAMMER, { pos: posOf(t.mesh.position), ownerId: this.ownerId });
      }
    }
  }

  updateAttacking(delta, gameManager, arrows, allUnits, buildings) {
    // F2-02: unidade em HOLD só re-adquire alvo dentro do próprio attackRange (nunca persegue
    // além dele — ver o passo 3 abaixo); as demais mantêm o retargetRange de sempre.
    const scanRange = this._isHolding ? this.attackRange : this.retargetRange;

    // 1. Target dead or invalid: find next closest hostile or resume objective
    if (!this.attackTarget || this.attackTarget.isDead || this.attackTarget.hp <= 0 || !this._canSee(this.attackTarget)) { // F4-04: alvo invisível não detectado = perdido
      const nextUnit = this.findNearestHostileUnit(allUnits, scanRange);
      if (nextUnit) {
        this.attackTarget = nextUnit;
        this.targetEntity = nextUnit;
        this.hasFiredThisAttack = false;
      } else if (this.objectiveTarget && !this.objectiveTarget.isDead && this.objectiveTarget.hp > 0) {
        // Resume siege on strategic objective building after clearing defending troops
        this.attackTarget = this.objectiveTarget;
        this.targetEntity = this.objectiveTarget;
        this.hasFiredThisAttack = false;
      } else {
        const nextTarget = this.findNearestHostile(allUnits, buildings, scanRange);
        if (nextTarget) {
          this.attackTarget = nextTarget;
          this.targetEntity = nextTarget;
          this.hasFiredThisAttack = false;
        } else {
          this.objectiveTarget = null;
          // F2-02: idle comum (stop) ou retorna ao modo anterior (hold/attack-move/patrol).
          this._giveUpAttack();
          return;
        }
      }
    }

    // Dynamic Threat Scanning (Attack-Move logic):
    // If our current target is a building (or worker), scan for nearby hostile combat units to prevent tunnel-visioning!
    const isTargetBuilding = this.attackTarget && (this.attackTarget.fullMesh || this.attackTarget.isConstructed !== undefined);
    const isTargetWorker = this.attackTarget && this.attackTarget.isWorker && this.attackTarget.isWorker();
    if ((isTargetBuilding || isTargetWorker) && this.isCombatUnit() && allUnits) {
      this.threatScanTimer = (this.threatScanTimer || 0) + delta;
      if (this.threatScanTimer >= 0.35) {
        this.threatScanTimer = 0;
        const visionRange = this.threatScanRange;
        const nearestHostile = isTargetWorker ? this.findNearestHostileCombatUnit(allUnits, visionRange) : this.findNearestHostileUnit(allUnits, visionRange);
        if (nearestHostile) {
          if (isTargetBuilding && !this.objectiveTarget) {
            this.objectiveTarget = this.attackTarget;
          }
          this.attackTarget = nearestHostile;
          this.targetEntity = nearestHostile;
          this.hasFiredThisAttack = false;
        }
      }
    }

    // 2. Target is alive: compute distance accounting for target collision radius
    const targetPos = this.attackTarget.mesh.position;
    const dist = Math.hypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const targetRadius = this.attackTarget.collisionRadius || (this.attackTarget.fullMesh ? 3.0 : 0.6);
    const effectiveRange = this.attackRange + targetRadius;

    // 2b. F4-02: alcance mínimo do cerco. Alvo a < minAttackRange (distância de borda) não é
    // atacável: tenta outro alvo dentro da janela [min, max]; senão recua até min + 0,5.
    if (this.minAttackRange > 0) {
      const edge = dist - targetRadius;
      if (edge < this.minAttackRange) this._siegeRetreating = true;
      else if (edge >= this.minAttackRange + 0.5) this._siegeRetreating = false;
      if (this._siegeRetreating) {
        if (this._isHolding) {
          this._giveUpAttack();
          return;
        }
        const other = this.findNearestHostile(allUnits, buildings, this.attackRange);
        if (other && other !== this.attackTarget) {
          this.attackTarget = other;
          this.targetEntity = other;
          this.hasFiredThisAttack = false;
          this._siegeRetreating = false;
          return;
        }
        let ax = this.mesh.position.x - targetPos.x;
        let az = this.mesh.position.z - targetPos.z;
        const al = Math.hypot(ax, az);
        if (al < 0.001) { ax = -Math.sin(this.mesh.rotation.y); az = -Math.cos(this.mesh.rotation.y); } else { ax /= al; az /= al; }
        this.hasFiredThisAttack = false;
        this.stepTowards(this.mesh.position.x + ax * 2, this.mesh.position.z + az * 2, this.speed * this.mods.speedMul * delta);
        if (this.animator && this.hurtTimer <= 0) this.animator.setAnimation('walk');
        return;
      }
    }

    // 3. Pursuit: If outside effective attack range, chase the moving target every frame!
    // F2-02: unidade em HOLD nunca sai da posição — desiste do alvo em vez de perseguir.
    if (dist > effectiveRange) {
      if (this._isHolding) {
        this._giveUpAttack();
        return;
      }
      this.hasFiredThisAttack = false;
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // 4a. F4-05: unidade suicida detona ao entrar em alcance (sem animação de golpe)
    if (this.suicide) {
      this._detonate(gameManager || this.gameManager, allUnits);
      return;
    }

    // 4. In range: Face target, drive attack animation synchronized with cooldown
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dirX, dirZ);

    // Animação 'fight': troca de estado só; o tempo é sincronizado com o cooldown em
    // renderUpdate (F1-09), de forma contínua (usa `alpha` para não "degrau" a 20 Hz).
    if (this.animator && this.hurtTimer <= 0) {
      this.animator.setAnimation('fight');
    }

    const progress = Math.min(1.0, this.attackTimer / this.effAttackCooldown);

    const gm = gameManager || this.gameManager;
    const gmEvents = gm && gm.events;

    if (this.isBallistic) {
      // F4-02: cerco (Balista/Catapulta): projétil balístico que mira a posição PREVISTA do alvo
      // (posição + velocidade × tempo de voo), não persegue, e causa dano em área no impacto.
      if (progress >= 0.60 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (this.mods.invisible) this.breakInvisibility();
        const kind = this.projectileType;
        const startPos = _projectileOrigin.copy(this.mesh.position).add(_up168);
        const tgt = this.attackTarget;
        const flight = ballisticFlightTime(Math.hypot(tgt.mesh.position.x - startPos.x, tgt.mesh.position.z - startPos.z), kind);
        _impactPoint.x = tgt.mesh.position.x + (tgt.velX || 0) * flight;
        _impactPoint.y = tgt.mesh.position.y;
        _impactPoint.z = tgt.mesh.position.z + (tgt.velZ || 0) * flight;
        if (gmEvents) gmEvents.emit(EVT.PROJECTILE_FIRED, { kind, from: posOf(startPos), ownerId: this.ownerId });
        const owner = this;
        const projectile = new BallisticProjectile(this.scene, startPos, _impactPoint, kind, (pos) => {
          if (gm && gm.unitGrid && gm.blockerGrid) applySplashDamage(gm, owner, owner.getEffDamage(), pos, owner.splashRadius, allUnits);
          if (gmEvents) gmEvents.emit(EVT.PROJECTILE_HIT, { kind, pos: posOf(pos), ownerId: owner.ownerId, splashRadius: owner.splashRadius });
        });
        arrows.push(projectile);
        if (this.gameManager && this.gameManager.registerEntity) this.gameManager.registerEntity(projectile, this.ownerId);
      }
    } else if (this.isRanged) {
      // Archer & Axethrower: Release projectile shot at progress >= 0.60
      if (progress >= 0.60 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (this.mods.invisible) this.breakInvisibility();
        const startPos = _projectileOrigin.copy(this.mesh.position).add(_up168);
        const projType = this.projectileType;
        if (gmEvents) gmEvents.emit(EVT.PROJECTILE_FIRED, { kind: projType, from: posOf(startPos), ownerId: this.ownerId });
        // F3-03: o dano final (computeDamage, 1 valor de RNG) é calculado no impacto — a
        // armadura/tipo do alvo naquele instante decidem o resultado, não na hora do disparo.
        const arrow = new Arrow(this.scene, startPos, this.attackTarget, this.getEffDamage(), (target, dmgObj, hitPos) => {
          const dmg = computeDamage(dmgObj, target, gm.combatRng);
          target.takeDamage(dmg, this, allUnits);
          if (gmEvents) gmEvents.emit(EVT.PROJECTILE_HIT, { kind: projType, pos: posOf(hitPos), ownerId: this.ownerId });
        }, projType);
        arrows.push(arrow);
        if (this.gameManager && this.gameManager.registerEntity) this.gameManager.registerEntity(arrow, this.ownerId);
      }
    } else {
      // Melee units (Knight, Villager, Bandit, Grunt, Ogre) strike at apex (progress >= 0.45)
      if (progress >= 0.45 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (gmEvents) gmEvents.emit(EVT.MELEE_HIT, { pos: posOf(this.mesh.position), ownerId: this.ownerId });
        if (this.mods.invisible) this.breakInvisibility();
        const target = this.attackTarget;
        const dmg = computeDamage(this.getEffDamage(), target, gm.combatRng);
        target.takeDamage(dmg, this, allUnits);
        // F4-04: Escudo de Chamas — quem golpeia corpo a corpo um alvo com o status sofre dano mágico fixo.
        if (target.mods && target.mods.flameshield && !this.isDead && !this.isDying) {
          this.takeDamage(FLAMESHIELD_DAMAGE, target, allUnits);
        }
      }
    }

    if (this.attackTimer >= this.effAttackCooldown) {
      this.attackTimer = 0;
      this.hasFiredThisAttack = false;
    }
  }

  /**
   * F4-05: detonação da unidade suicida. `EVT.EXPLOSION`, dano em área em TODAS as entidades hostis
   * no `splashRadius` (queda 100 % → 40 %, 1 RNG por entidade em ordem de id) e morte sem cadáver.
   * O kill das vítimas vai ao dono (`takeDamage(attacker = this)`); a própria morte conta como
   * baixa (`UNIT_DIED` → `MatchStats.unitsLost`) mas não dá kill a ninguém.
   */
  _detonate(gm, allUnits) {
    if (this.isDead || this.isDying) return;
    // A explosão é centrada no alvo (o sapador para a `attackRange` + raio do alvo do centro dele) e a
    // distância é medida até a superfície: atinge o alvo inteiro e os vizinhos encostados (muralhas).
    const pos = this.attackTarget && this.attackTarget.mesh ? this.attackTarget.mesh.position : this.mesh.position;
    const gmEvents = gm && gm.events;
    if (gmEvents) gmEvents.emit(EVT.EXPLOSION, { pos: posOf(pos), radius: this.splashRadius, ownerId: this.ownerId });
    if (gm && gm.unitGrid && gm.blockerGrid) {
      applySplashDamage(gm, this, this.damage, pos, this.splashRadius, allUnits, 0.4, true);
    }
    this.lastAttackerOwnerId = null;
    this.die();
    this.deathDuration = 0; // sem cadáver: removida no próximo tick
    if (this.mesh) this.mesh.visible = false;
  }

  /** F4-05: construção/muralha hostil mais próxima em `maxDist` (alvo padrão dos sapadores). */
  _nearestStructure(maxDist) {
    const gm = this.gameManager;
    if (!gm || !gm.blockerGrid) return null;
    const pos = this.mesh.position;
    const self = this;
    gm.blockerGrid.queryRadius(pos.x, pos.z, maxDist, b =>
      b instanceof Building && !b.isDead && b.hp > 0 && self.isHostileTo(b),
    _buildingBuf);
    return pickNearestInBuf(_buildingBuf, pos.x, pos.z);
  }

  /**
   * F4-02: `e` pode ser escolhido numa auto-aquisição? Só o cerco filtra: alvo aéreo nunca
   * (F4-06 usa `layer === 'air'`) e alvo a menos de `minAttackRange` (distância de borda) não.
   */
  _canEngage(e) {
    if (!this.isBallistic && this.minAttackRange <= 0) return true;
    if (e.layer === 'air') return false;
    if (this.minAttackRange > 0) {
      const p = this.mesh.position;
      const q = e.mesh.position;
      const edge = Math.hypot(p.x - q.x, p.z - q.z) - (e.collisionRadius || (e.fullMesh ? 3.0 : 0.6));
      if (edge < this.minAttackRange) return false;
    }
    return true;
  }

  /**
   * F1-06: `gm.unitGrid.queryRadius` no lugar de varrer `allUnits`. Mantém o parâmetro
   * `allUnits` por compatibilidade com os chamadores existentes (não é mais usado).
   */
  findNearestHostileCombatUnit(allUnits, maxDist = 14) {
    if (this.suicide && !this._isHolding) return null; // F4-05: não auto-adquire unidades
    const gm = this.gameManager;
    if (!gm || !gm.unitGrid) return null;
    const pos = this.mesh.position;
    const self = this;
    gm.unitGrid.queryRadius(pos.x, pos.z, maxDist, u =>
      !u.isDead && u.hp > 0 && self.isHostileTo(u) && u.isCombatUnit && u.isCombatUnit() && self._canEngage(u) && self._canSee(u),
    _combatBuf);
    return pickNearestInBuf(_combatBuf, pos.x, pos.z);
  }

  findNearestHostileUnit(allUnits, maxDist = 14) {
    if (this.suicide && !this._isHolding) return null; // F4-05
    const combatUnit = this.findNearestHostileCombatUnit(allUnits, maxDist);
    if (combatUnit) return combatUnit;

    const gm = this.gameManager;
    if (!gm || !gm.unitGrid) return null;
    const pos = this.mesh.position;
    const self = this;
    gm.unitGrid.queryRadius(pos.x, pos.z, maxDist, u =>
      !u.isDead && u.hp > 0 && self.isHostileTo(u) && self._canEngage(u) && self._canSee(u),
    _unitBuf);
    return pickNearestInBuf(_unitBuf, pos.x, pos.z);
  }

  /**
   * Prioridade preservada: combate > trabalhador (unidades) > torre > construção comum,
   * menor distância dentro de cada classe, empate por menor id (via `pickNearestInBuf`,
   * já que o `SpatialGrid` devolve os candidatos ordenados por id).
   */
  findNearestHostile(allUnits, buildings, maxDist = 15) {
    // F4-05: suicidas preferem a construção/muralha mais próxima; unidades só sob `hold`.
    if (this.suicide) {
      const s = this._nearestStructure(maxDist);
      if (s || !this._isHolding) return s;
    }
    // 1. High priority: hostile units (combat troops > workers)
    const hostileUnit = this.findNearestHostileUnit(allUnits, maxDist);
    if (hostileUnit) {
      return hostileUnit;
    }

    // 2. Secondary priority: buildings (defensive watchtowers > regular buildings)
    const gm = this.gameManager;
    if (!gm || !gm.blockerGrid) return null;
    const pos = this.mesh.position;
    const self = this;

    gm.blockerGrid.queryRadius(pos.x, pos.z, maxDist, b =>
      b instanceof Building && !b.isDead && b.hp > 0 && self.isHostileTo(b) &&
      (b.type === 'watchtower' || b.type === 'orc_watchtower') && self._canEngage(b),
    _towerBuf);
    const closestTower = pickNearestInBuf(_towerBuf, pos.x, pos.z);
    if (closestTower) return closestTower;

    gm.blockerGrid.queryRadius(pos.x, pos.z, maxDist, b =>
      b instanceof Building && !b.isDead && b.hp > 0 && b.role !== 'wall' && self.isHostileTo(b) && self._canEngage(b),
    _buildingBuf);
    return pickNearestInBuf(_buildingBuf, pos.x, pos.z);
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
    if (this.hpGroup && this.scene) {
      this.scene.remove(this.hpGroup);
    }
  }
}
