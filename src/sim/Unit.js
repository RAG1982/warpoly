import { fatan2, fcos, fhypot, fsin } from './fmath.js';
import { Body, Vec3 } from './Body.js';
import { applySplashDamage } from './splash.js';
import { Building } from './Building.js';
import { getUnitDef, getUnitStats as getUnitStatsFromData, CARRY, MINE_ENTER_TIME, gatherMultiplier } from '../data/index.js';
import { computeDamage } from './combat.js';
import { Projectile, ballisticFlightTime } from './projectiles.js';
import { legacyOwnerId } from './EntityIds.js';
import { CMD } from './commands.js';
import { steerDirection, SEP_MARGIN } from './steering.js';
import { EVT } from './events.js';
import { REPAIR_INTERVAL, MAX_WORKERS_PER_BUILDING } from './repair.js';
import { createStatusSlots, createMods, tickStatuses, clearStatuses, removeStatus, addStatus, STATUS_DEFS } from './statuses.js';
import { isDetectedBy } from './detection.js';
import { canTarget, defaultCanHitAir, defaultCanHitNaval } from './targeting.js';
import { FLAMESHIELD_DAMAGE, WATER_LEVEL, NAVAL_MAX_HEIGHT, OIL_LOAD_TIME, SHORE_REACH, SUBMERGE_DELAY, NAVAL_MESH_SCALE } from '../data/combat.js';
import { getAbility } from '../data/abilities.js';
import { visualScaleOf } from '../data/visualScale.js';
import { followBoat, detachFromBoat, killCargo, updateBoarding, updateUnloading } from './transport.js';
import { resolveAbility, canCast, needsEntityTarget, targetProblem, applyAbility, emitCastStart, findAutocastTarget, getChannel, applyChannelWave } from './abilities.js';
import { hitTagFor } from './hitTag.js';

/** Liga/desliga a animação de receber golpe (desligada: interrompia o ataque de unidades em combate). */
const HURT_ANIM_ENABLED = false;

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
// F3-02: vizinhos para o steering de separação (consulta + lista de {x,z,radius,stationary}).
const _steerBuf = [];
const _steerNb = [];
/** F3-02: raio (u) em que um waypoint intermediário conta como alcançado. */
const WAYPOINT_RADIUS = 1.4;
const CHASE_BLOCK_T = 0.25; // M2-29: sem progresso por este tempo (s) com inimigo encostado = bloqueado
const CHASE_BLOCK_REACH = 1.6; // M2-29: folga além do raio próprio para achar o bloqueador
/** F3-02: a partir de quantas unidades no comando o caminho usa folga extra (modo largo do Pathfinder). */
const WIDE_GROUP_SIZE = 6;
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

// F1-08: pontos de módulo reutilizados para calcular a origem/impacto do projétil (Projectile copia o valor recebido)
const _projectileOrigin = { x: 0, y: 0, z: 0 };
const SUBMERGED_FOREVER = 1e9;
const _impactPoint = { x: 0, y: 0, z: 0 }; // F4-02: ponto previsto do cerco

/** Origem do projétil: 1,68 u acima da posição `p` (reaproveita um objeto de módulo). */
function projectileOriginAt(p) {
  _projectileOrigin.x = p.x;
  _projectileOrigin.y = p.y + 1.68;
  _projectileOrigin.z = p.z;
  return _projectileOrigin;
}

export class Unit {
  /**
   * F2-08c: entidade de simulação pura (sem three.js). A malha, o animador, as barras e o anel de seleção vivem em
   * `src/render/UnitView.js` (criada pela `EntityViews`); `mesh` é um `Body` (`position`, `rotation.y`, `visible`).
   * @param {number|'player'|'enemy'} [owner]  ownerId do Player dono (F2-01)
   * @param {import('../core/GameManager.js').GameManager|null} [gameManager]
   */
  constructor(terrain, type, x, z, owner = 0, gameManager = null) {
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
    this._noCorpse = false; // F4-07b: passageiro morto com a barcaça
    this._cast = null;
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
    /** F4-04b: camada ('ground' | 'air') e imunidade total a dano (Olho Vigia). F4-06 estende `layer`. */
    this.layer = def.layer || 'ground';
    this.immune = !!def.immune;
    /** F4-06: voo (`flyHeight` acima do terreno) e regras de alvo (`canTarget`, `src/sim/targeting.js`). */
    this.flyHeight = this.layer === 'air' ? (typeof def.flyHeight === 'number' ? def.flyHeight : 4.5) : 0;
    this.canHitAir = defaultCanHitAir(def);
    this.canHitGround = def.canHitGround !== false;
    /** F4-07: navios (`layer:'naval'`) — `canHitNaval` (atinge navios), petroleiro (`isTanker`, coleta petróleo e ergue plataforma). */
    this.canHitNaval = defaultCanHitNaval(def);
    this.isTanker = !!def.isTanker;
    /** F4-07b: transporte — barcaça (`transportCapacity` > 0) guarda `cargo` (unidades embarcadas); o passageiro guarda `transportedBy` (id do barco). */
    this.transportCapacity = def.transportCapacity || 0;
    this.cargo = this.transportCapacity > 0 ? [] : null;
    this.transportedBy = null;
    this._boardTarget = null;
    this._boardRetry = 0;
    this._unloadOrder = null;
    /** F4-07b: apresentação — segundos restantes com a rampa da barcaça aberta (embarque/desembarque); não entra no checksum. */
    this.rampT = 0;
    /** F4-07b: submersível — invisível permanente; emerge ao atacar/sofrer dano e volta após `SUBMERGE_DELAY` s. */
    this.submersible = !!def.submersible;
    this._surfaceT = 0;
    if (this.submersible) addStatus(this, 'invisible', SUBMERGED_FOREVER);
    /** F4-02: velocidade estimada (u/s) medida pelo `GameManager` a cada tick — mira preditiva do cerco. */
    this.velX = 0;
    this.velZ = 0;
    this._siegeRetreating = false;
    /** NEW-35: ponto {x,z} do ataque no chão (estado 'attackingGround'). */
    this.groundTarget = null;
    this.aggroRange = def.aggroRange;
    this.threatScanRange = def.threatScanRange;
    this.retargetRange = def.retargetRange;
    this.helpRadius = def.helpRadius;

    // State machine: 'idle', 'moving', 'gathering', 'returning', 'building', 'repairing', 'attacking', 'dying'
    this.state = 'idle';
    // F1-08: targetPos é uma Vector3 fixa (nunca recriada); hasTargetPos indica se há destino válido.
    this.targetPos = new Vec3();
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
    // F3-02: movimento em grupo — velocidade efetiva do grupo (0 = sem limite), detecção de travamento.
    this._groupSpeed = 0;
    this._groupSize = 0;
    this._widePath = false;
    this._stuckT = 0;
    this._explicitAttack = false; // M2-29
    this._chaseStuckT = 0;
    this._chaseLastX = NaN;
    this._chaseLastZ = NaN;
    this._repaths = 0;
    this._mvLastX = NaN;
    this._mvLastZ = NaN;
    this._mtX = NaN; // NEW-42: travamento de `moveTowards` (caminho velho que a unidade não consegue seguir)
    this._mtZ = NaN;
    this._mtStuck = 0;

    // Worker inventory (F3-04: `max` passa a ser por recurso — ver `src/data/economy.js` CARRY;
    // fixado quando a unidade começa a coletar, em vez de um valor único fixo).
    this.carrying = { type: null, amount: 0, max: def.isTanker ? CARRY.oil : CARRY.wood };
    /** F4-07a: segundos já gastos carregando petróleo junto à plataforma (petroleiro). */
    this._loadT = 0;
    // F3-04: timer de "dentro da mina/pedreira" (estado `insideMine`) — ver `updateInsideMine`.
    this._mineTimer = 0;
    this.actionTimer = 0;
    this.attackTimer = 0;
    this.walkTimer = 0;
    this.isDead = false;
    this.lastAttackerOwnerId = null; // F3-09
    this.lastHitTag = 'cut'; // F7-06: dica de render (animação de morte); fora do checksum
    /** F3-10: origem do guarda neutro ({x, z}) — `null` para unidades normais. */
    this.homePos = null;
    /** F5-06: raio do leash (guarnição de missão); null = GUARD_LEASH. */
    this.guardRadius = null;
    this._returningHome = false;
    this.isDying = false;
    this.canRemove = false;
    this.isDisposed = false;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.deathDuration = 1.6;
    this.hasFiredThisAttack = false;

    // Corpo de simulação (F2-08c): posição/rotação Y como números; a malha 3D é da `UnitView`.
    const h = this.terrain.getHeight(x, z);
    this.mesh = new Body(x, this.layer === 'naval' ? WATER_LEVEL : h + this.flyHeight, z);
    const meshScale = (this.layer === 'naval' ? NAVAL_MESH_SCALE : 1.62) * (def.scaleMul || 1) * visualScaleOf(type); // F4-07b: navios em escala própria; visualScale = só render (orcs ≈ humanos)
    this.mesh.scale.set(meshScale, meshScale, meshScale); // Scaled +20% for superior visibility and detail appreciation
    this.mesh.userData.entity = this;

    // F1-09: tick fixo — pose de simulação (posição/rotação Y) do início e do fim do último
    // passo, para a `UnitView` interpolar visualmente entre eles. Unidade recém-criada não
    // "voa" da origem: as duas poses começam iguais à posição inicial.
    this._prevPos = this.mesh.position.clone();
    this._simPos = this.mesh.position.clone();
    this._prevRotY = this.mesh.rotation.y;
    this._simRotY = this.mesh.rotation.y;

    // Estado de apresentação (lido pela `UnitView`; a simulação só escreve, nunca lê malhas):
    /** Tipo cujo modelo 3D é mostrado (muda na Transmutação; a view resolve `visualType`/`modelOf`). */
    this.visualBase = type;
    /** Contador de trocas de modelo (Transmutação). */
    this.modelSeq = 0;
    /** Animação desejada ('idle' | 'walk' | 'fight' | 'gather' | 'hurt' | 'die' | 'cast') e contadores de reinício/zera-pose. */
    this.anim = 'idle';
    this.animRestartSeq = 0;
    this.animResetSeq = 0;
    this.poseResetSeq = 0;
    this.walkResetSeq = 0;
    /** Ferramenta em uso: 'axe' | 'pickaxe' | 'hammer' | null (null = visual padrão do modelo). */
    this.tool = null;
    /** Trabalhador carregando (mochila/lenha/ouro visíveis); o tipo vem de `carrying.type`. */
    this.carryVisible = false;
    /** Cor `#rrggbb` do anel de seleção (ação de missão `spawn.markColor`); `null` = anel padrão do lado. Só render: fora do checksum. */
    this.markColor = null;

    if (def.maxMana > 0 || (def.abilities && def.abilities.length > 0)) this.setupMana(def);
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

  /** F4-07a: pathfinder da camada desta unidade — terrestre, naval ou `null` (aéreo voa em linha reta). */
  _pf(gm) {
    if (!gm || this.layer === 'air') return null;
    return this.layer === 'naval' ? gm.navalPathfinder : gm.pathfinder;
  }

  /** F4-07a: o ponto (x, z) é intransponível para esta unidade (água para terrestres; terra/raso para navios)? */
  _blockedAt(x, z) {
    const h = this.terrain.getHeight(x, z);
    return this.layer === 'naval' ? h > NAVAL_MAX_HEIGHT : h < 0.65;
  }

  /** F4-07a: folga extra de contato (navio encostando em construção costeira/plataforma: o casco para na célula livre mais próxima). */
  _contactSlack() {
    return this.layer === 'naval' ? 1.2 : 0;
  }

  /** Pede uma animação à view (a reprodução em si roda em `UnitView.update`). `restart` reinicia mesmo se já ativa. */
  _setAnim(name, restart = false) {
    this.anim = name;
    if (restart) this.animRestartSeq++;
  }

  /** Pede à view `animator.reset()` (zera transformações e tempo). */
  _resetAnim() {
    this.animResetSeq++;
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
    // F4-04b: habilidades com `autocastDefault` (Cura) já nascem com o auto-cast ligado.
    for (let i = 0; i < this.abilities.length; i++) {
      const ab = getAbility(this.abilities[i], { debug: true });
      if (ab && ab.autocast && ab.autocastDefault) this.autocast[ab.id] = true;
    }
    this._cast = null;
    clearStatuses(this);
  }

  /** F4-03: barras (vida/mana) visíveis? Selecionada, ferida ou com mana incompleta. */
  _barsVisible() {
    return !!this.isSelected || this.hp < this.maxHp || (this.maxMana > 0 && this.mana < this.maxMana);
  }

  /** Compat (F2-08c): a barra de vida é desenhada pela `UnitView` a cada quadro; mantido para ferramentas/testes antigos. */
  updateHealthBar() {}

  /** Compat (F2-08c): idem, barra de mana. */
  updateManaBar() {}

  setSelected(selected) {
    this.isSelected = selected;
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
    this._boardTarget = null; // F4-07b: qualquer ordem nova cancela embarque/desembarque pendentes
    this._unloadOrder = null;
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
        this.moveTo(order.x, order.z, gm, order.groupSpeed || 0, order.groupSize || 0);
        break;
      case CMD.ATTACK_MOVE:
        this.orderAttackMove(order.x, order.z, gm, order.groupSpeed || 0, order.groupSize || 0);
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

  /**
   * `groupSpeed` (F3-02): velocidade efetiva do grupo (u/s) quando a ordem veio de um comando com várias
   * unidades — a unidade nunca anda mais rápido que ela. 0 = sem limite (ordem individual).
   */
  moveTo(x, z, gameManager = this.gameManager, groupSpeed = 0, groupSize = 0) {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b: passageiro não recebe ordens
    this._clearOrderModes();

    this.state = 'moving';
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this._groupSpeed = groupSpeed;
    this._groupSize = groupSize;
    // Caminho com folga (evita frestas estreitas): unidades grandes e grupos numerosos.
    this._widePath = (this.collisionRadius || 0.6) >= 1.0 || groupSize >= WIDE_GROUP_SIZE;
    this._stuckT = 0;
    this._repaths = 0;
    this._mvLastX = NaN;

    const gm = gameManager || this.gameManager;
    const pf = this._pf(gm);
    if (pf) { // F4-06: aéreo voa em linha reta (sem pathfinder, sem ajuste de água); F4-07a: navio usa o pathfinder naval
      // Snap destination if clicked in water (navio: se clicado em terra/raso)
      if (pf._terrainBlocked(x, z)) {
        const snapped = pf.findNearestWalkable(x, z);
        x = snapped.x;
        z = snapped.z;
      }
      this._requestMovePath(gm, x, z);
    } else {
      this.targetPos.set(x, 0, z);
      this.hasTargetPos = true;
      this.waypoints = null;
      this.waypointIndex = 0;
      this.pathDestination = null;
    }
  }

  /** Pede ao pathfinder o caminho até (x, z) e o aplica quando chegar (descarta se a ordem mudou). */
  _requestMovePath(gm, x, z) {
    this.pathDestination = { x, z };
    this.hasTargetPos = false;
    this.pathPending = true;
    this._pf(gm).requestPath(this, x, z, (path) => {
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
    }, this._widePath);
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
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b
    if (!this.isWorker() && !this.isTanker) return;
    // F4-07a: petroleiro só coleta petróleo (de poço com plataforma própria concluída); trabalhadores nunca o coletam.
    if (this.isTanker !== (resource.type === 'oil')) return;
    if (this.isTanker) {
      const gm = this.gameManager;
      if (!gm || !gm.platformReady(resource, this.ownerId)) {
        if (gm && gm.events) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: '⚠️ Sem plataforma neste poço' });
        return;
      }
    }
    this._clearOrderModes();
    this.gatherTarget = resource;
    this.targetEntity = resource;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;

    // Ferramenta ativa (a `UnitView` mostra o machado/picareta/martelo do modelo)
    this.tool = resource.type === 'oil' ? null : (resource.type === 'tree' ? 'axe' : 'pickaxe');
    this._loadT = 0;

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
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b
    // F4-07a: a plataforma é erguida pelo petroleiro; as demais construções, pelos trabalhadores.
    if (building && building.role === 'platform' ? !this.isTanker : !this.isWorker()) return;
    if (!this._acceptWorkSlot(building)) return;
    this._clearOrderModes();
    this.state = 'building';
    this.repairTarget = null;
    this.buildTarget = building;
    this.targetEntity = building;
    this.gatherTarget = null;
    this.attackTarget = null;

    this.tool = 'hammer';
  }

  /** F3-05: ordem de reparo de uma construção (só trabalhadores; mesma regra de 4 por obra). */
  orderRepair(building) {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b
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

    this.tool = 'hammer';
  }

  orderAttack(target, preserveObjective = false) {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b: passageiro não recebe ordens
    if (target && !canTarget(this, target)) return; // F4-06: melee/cerco não atingem aéreos; batedores não atacam
    if (target && !this._shoreOk(target)) return; // F4-07b: navios só atingem terra junto à margem
    this._clearOrderModes();
    this.state = 'attacking';
    this.attackTarget = target;
    this.targetEntity = target;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.hasFiredThisAttack = false;
    this._explicitAttack = false; // M2-29: CommandExecutor (CMD.ATTACK) marca true depois
    this._chaseStuckT = 0;
    this._chaseLastX = NaN;
    const isBuilding = target && (target.fullMesh || target.isConstructed !== undefined);
    if (isBuilding) {
      this.objectiveTarget = target;
    } else if (!preserveObjective) {
      this.objectiveTarget = null;
    }
  }

  /**
   * NEW-35: ataque no chão (só cerco `isBallistic`): aproxima-se até `attackRange`, recua se o ponto estiver
   * a menos de `minAttackRange` e dispara repetidamente no ponto (dano em área, sem alvo entidade) até nova ordem.
   * @returns {boolean} se a ordem foi aceita
   */
  orderAttackGround(x, z, gameManager = this.gameManager) {
    if (this.isDead || this.isDying || this.state === 'dying') return false;
    if (this.transportedBy !== null || !this.isBallistic) return false;
    this._clearOrderModes();
    this.state = 'attackingGround';
    this.groundTarget = { x, z };
    this.targetEntity = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.repairTarget = null;
    this.attackTarget = null;
    this.objectiveTarget = null;
    this.hasTargetPos = false;
    this.hasFiredThisAttack = false;
    this.gameManager = gameManager || this.gameManager;
    return true;
  }

  updateAttackGround(delta, gameManager, arrows, allUnits) {
    const g = this.groundTarget;
    if (!g) { this.stop(); return; }
    const pos = this.mesh.position;
    const dist = fhypot(g.x - pos.x, g.z - pos.z);
    if (dist < this.minAttackRange) {
      this.hasFiredThisAttack = false;
      let ax = pos.x - g.x;
      let az = pos.z - g.z;
      const al = fhypot(ax, az);
      if (al < 0.001) { ax = -fsin(this.mesh.rotation.y); az = -fcos(this.mesh.rotation.y); } else { ax /= al; az /= al; }
      this.stepTowards(pos.x + ax * 2, pos.z + az * 2, this.speed * this.mods.speedMul * delta);
      if (this.hurtTimer <= 0) this._setAnim('walk');
      return;
    }
    if (dist > this.attackRange) {
      this.hasFiredThisAttack = false;
      this.moveTowards(g.x, g.z, delta);
      return;
    }
    this.mesh.rotation.y = fatan2(g.x - pos.x, g.z - pos.z);
    if (this.hurtTimer <= 0) this._setAnim('fight');
    const progress = Math.min(1.0, this.attackTimer / this.effAttackCooldown);
    const gm = gameManager || this.gameManager;
    const gmEvents = gm && gm.events;
    if (progress >= 0.60 && !this.hasFiredThisAttack) {
      this.hasFiredThisAttack = true;
      if (this.mods.invisible) this.breakInvisibility();
      const kind = this.projectileType;
      const startPos = projectileOriginAt(pos);
      _impactPoint.x = g.x;
      _impactPoint.y = pos.y;
      _impactPoint.z = g.z;
      if (gmEvents) gmEvents.emit(EVT.PROJECTILE_FIRED, { kind, from: posOf(startPos), ownerId: this.ownerId });
      const owner = this;
      const projectile = new Projectile({ kind, from: startPos, impact: _impactPoint, onHit: (hitPos) => {
        if (gm && gm.unitGrid && gm.blockerGrid) applySplashDamage(gm, owner, owner.getEffDamage(), hitPos, owner.splashRadius, allUnits);
        if (gmEvents) gmEvents.emit(EVT.PROJECTILE_HIT, { kind, pos: posOf(hitPos), ownerId: owner.ownerId, splashRadius: owner.splashRadius });
      } });
      arrows.push(projectile);
      if (this.gameManager && this.gameManager.registerEntity) this.gameManager.registerEntity(projectile, this.ownerId);
    }
    if (this.attackTimer >= this.effAttackCooldown) {
      this.attackTimer = 0;
      this.hasFiredThisAttack = false;
    }
  }

  stop() {
    if (this.isDead || this.isDying || this.state === 'dying') return;
    this.groundTarget = null;
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
    this._groupSpeed = 0;
    this.hasFiredThisAttack = false;
    this.resetPose();
    this._setAnim('idle');
    this._resetAnim();
  }

  /**
   * F2-02 (comando HOLD): fica parada nesta posição; unidades de combate atacam sozinhas,
   * mas só alvos dentro do próprio `attackRange` (nunca perseguem — ver `updateAttacking`).
   */
  hold() {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b: passageiro não recebe ordens
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
    this._setAnim('idle');
    this._resetAnim();
  }

  /**
   * F2-02 (comando ATTACK_MOVE): anda até (x, z) via `moveTo` (reaproveitado); ao longo do
   * caminho, unidades de combate atacam sozinhas qualquer hostil dentro de `aggroRange`
   * (ver `updateAttackMoving`) e retomam a marcha ao destino quando não sobrar alvo
   * (`_giveUpAttack`).
   */
  orderAttackMove(x, z, gameManager = this.gameManager, groupSpeed = this._groupSpeed || 0, groupSize = this._groupSize || 0) {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b: passageiro não recebe ordens
    this.moveTo(x, z, gameManager, groupSpeed, groupSize); // já chama _clearOrderModes()
    this.state = 'attackMoving';
    this._amDest = { x, z };
  }

  /**
   * F2-02 (comando PATROL): alterna entre a posição atual e (x, z), com comportamento de
   * attack-move em cada trecho (ver `updatePatrolling`).
   */
  orderPatrol(x, z, gameManager = this.gameManager) {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b: passageiro não recebe ordens
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
    if (this.immune || this.mods.invulnerable) return; // F4-03: status invulnerable zera o dano (F4-04b: `immune` idem)
    if (this.mods.invisible) this.breakInvisibility(); // F4-04: dano revela
    // F3-09: atribuição de kills (lida em die()).
    if (attacker && typeof attacker.ownerId === 'number') this.lastAttackerOwnerId = attacker.ownerId;
    this.lastHitTag = hitTagFor(attacker); // F7-06

    const effectiveDamage = amount;
    this.hp -= effectiveDamage;

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

    // Animação 'hurt' (recuo + flash) DESLIGADA: com muitos arqueiros ela travava a infantaria em combate
    // (cada flecha reiniciava o recuo e interrompia o golpe). Religar só com estratégia que não atrapalhe o combate.
    if (HURT_ANIM_ENABLED) {
      this.hurtTimer = 0.45;
      this._setAnim('hurt', true);
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
        } else if (!this.suicide && !this._explicitAttack && !this._isHolding && this.attackTarget &&
          this.attackTarget !== attacker && !this.attackTarget.isDead && this.attackTarget.hp > 0 &&
          this._closerThanTarget(attacker)) {
          // M2-29 regra 2: já revidando um atacante (alvo-unidade, ordem não explícita): só troca se o
          // novo atacante estiver MAIS PERTO que o alvo atual (distância de agora, empate mantém o alvo).
          const savedObjective = this.objectiveTarget;
          this.orderAttack(attacker, !!savedObjective);
          if (savedObjective) this.objectiveTarget = savedObjective;
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

  /** M2-29: `other` está estritamente mais perto (distância de centro, no plano) que o alvo atual? */
  _closerThanTarget(other) {
    const p = this.mesh.position;
    const t = this.attackTarget.mesh.position;
    const o = other.mesh.position;
    return fhypot(o.x - p.x, o.z - p.z) < fhypot(t.x - p.x, t.z - p.z);
  }

  /**
   * M2-29 regra 3: durante a perseguição de um alvo-unidade (ordem não explícita), sem progresso por
   * `CHASE_BLOCK_T` com um inimigo encostado no caminho -> o bloqueador vira o alvo. Aliado/construção/
   * árvore não contam (seguem a lógica de caminho existente). Determinístico: o mais perto, empate por id
   * (via `findNearestHostileUnit`). Devolve true se trocou o alvo.
   */
  _chaseBlockCheck(delta, allUnits, step) {
    const pos = this.mesh.position;
    if (this._chaseLastX === this._chaseLastX) {
      const moved = fhypot(pos.x - this._chaseLastX, pos.z - this._chaseLastZ);
      if (moved < step * 0.3) this._chaseStuckT += delta;
      else this._chaseStuckT = 0;
    }
    this._chaseLastX = pos.x;
    this._chaseLastZ = pos.z;
    if (this._chaseStuckT < CHASE_BLOCK_T) return false;
    const blocker = this.findNearestHostileUnit(allUnits, (this.collisionRadius || 0.6) + CHASE_BLOCK_REACH);
    this._chaseStuckT = 0;
    if (!blocker || blocker === this.attackTarget || !canTarget(this, blocker) || !this._shoreOk(blocker)) return false;
    this.attackTarget = blocker;
    this.targetEntity = blocker;
    this.hasFiredThisAttack = false;
    return true;
  }

  die() {
    if (this.isDying) return;
    this._exitMine();
    this.isDying = true;
    this.isDead = true;
    this._cast = null;
    // F4-07b: barcaça afundando leva a carga junto; passageiro morto (invocação expirada…) sai da carga.
    const dgm = this.gameManager;
    if (dgm && this.cargo && this.cargo.length > 0) killCargo(dgm, this);
    if (dgm && this.transportedBy !== null) detachFromBoat(dgm, this);
    this.canRemove = false;
    this.state = 'dying';
    this.deathTimer = 0;
    this.deathDuration = 1.6;

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
    if (!this._expired && !this._noCorpse && !getUnitDef(this.type).corpseless && this.gameManager && this.gameManager.corpses) {
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

    this._setAnim('die', true);
  }

  /** Pede à view zerar a pose do modelo (membros/arma/ferramenta); a view aplica no próximo quadro. */
  resetPose() {
    this.poseResetSeq++;
  }

  /** Pede à view zerar só pernas/braços (pose de caminhada). */
  resetWalkPose() {
    this.walkResetSeq++;
  }

  stepTowards(targetX, targetZ, maxDist) {
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const dx = targetX - curX;
    const dz = targetZ - curZ;
    const dist = fhypot(dx, dz);
    if (dist < 0.05) return true;

    const move = Math.min(dist, maxDist);
    const dirX = dx / dist;
    const dirZ = dz / dist;

    const nextX = curX + dirX * move;
    const nextZ = curZ + dirZ * move;

    // F4-06: voo — ignora água/relevo (o Y suaviza em `_updateFlightHeight`).
    if (this.layer === 'air') {
      this.mesh.position.x = nextX;
      this.mesh.position.z = nextZ;
      this.mesh.rotation.y = fatan2(dirX, dirZ);
      return (dist - move) < 0.15;
    }

    // F4-07a: navio — só se move onde há profundidade suficiente (desliza ao longo da costa como os terrestres na água).
    if (this.layer === 'naval') {
      if (this.terrain.getHeight(nextX, nextZ) > NAVAL_MAX_HEIGHT) {
        const hX = this.terrain.getHeight(nextX, curZ);
        const hZ = this.terrain.getHeight(curX, nextZ);
        if (hX <= NAVAL_MAX_HEIGHT) this.mesh.position.x = nextX;
        else if (hZ <= NAVAL_MAX_HEIGHT) this.mesh.position.z = nextZ;
        return false;
      }
      this.mesh.position.x = nextX;
      this.mesh.position.z = nextZ;
      this.mesh.position.y = WATER_LEVEL;
      this.mesh.rotation.y = fatan2(dirX, dirZ);
      return (dist - move) < 0.15;
    }

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

    this.mesh.rotation.y = fatan2(dirX, dirZ);
    return (dist - move) < 0.15;
  }

  moveTowards(destX, destZ, delta, gameManager = this.gameManager) {
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const distToFinal = fhypot(destX - curX, destZ - curZ);
    if (distToFinal < 0.1) return;

    let subTargetX = destX;
    let subTargetZ = destZ;

    const gm = gameManager || this.gameManager;
    const pf = this._pf(gm);
    if (pf) {
      const los = pf.hasLineOfSight(curX, curZ, destX, destZ);
      if (!los) {
        // Direct line blocked by water! Route through waypoints / fords
        const distFromLastDest = this.pathDestination
          ? fhypot(destX - this.pathDestination.x, destZ - this.pathDestination.z)
          : Infinity;

        // NEW-42: sem progresso por 1,5 s com um caminho velho (unidade empurrada para a margem da água, atravessada
        // a um waypoint que o relevo não deixa alcançar) — descarta o caminho para pedir um novo desta posição.
        if (fhypot(curX - this._mtX, curZ - this._mtZ) < this.speed * delta * 0.3) this._mtStuck += delta;
        else this._mtStuck = 0;
        this._mtX = curX;
        this._mtZ = curZ;
        if (this._mtStuck > 1.5 && this.waypoints && !this._chaseRequestPending) {
          this.waypoints = null;
          this._mtStuck = 0;
        }

        if ((!this.waypoints || this.waypoints.length === 0 || distFromLastDest > 2.5) && !this._chaseRequestPending) {
          this.pathDestination = { x: destX, z: destZ };
          this._chaseRequestPending = true;
          pf.requestPath(this, destX, destZ, (path) => {
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
          const distToWp = fhypot(wp.x - curX, wp.z - curZ);
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
    if (this.hurtTimer <= 0) {
      this._setAnim('walk');
    }
  }

  /** F4-06: Y alvo = terreno (mín. nível da água) + `flyHeight`, suavizado (sobe/desce relevo sem trancos). */
  _updateFlightHeight(delta) {
    const p = this.mesh.position;
    const target = Math.max(this.terrain.getHeight(p.x, p.z), 0.65) + this.flyHeight;
    p.y += (target - p.y) * Math.min(1, 4 * delta);
  }

  update(delta, gameManager, arrows, allUnits, buildings) {
    if (this.canRemove) return;
    this.gameManager = gameManager;

    // F4-07b: passageiro de barcaça só acompanha o barco (sem IA/ordens/colisão).
    if (this.transportedBy !== null) {
      const boat = gameManager.entitiesById.get(this.transportedBy);
      if (boat && !boat.isDead) followBoat(this, boat);
      else { detachFromBoat(gameManager, this); this.mesh.visible = true; gameManager._insertIntoGrid(this); }
      return;
    }

    // Safety: ensure unit never stays submerged in water (navio: nunca em terra/raso — F4-07a)
    if (this.layer === 'naval') {
      if (this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z) > NAVAL_MAX_HEIGHT && gameManager && gameManager.navalPathfinder) {
        const safe = gameManager.navalPathfinder.findNearestWalkable(this.mesh.position.x, this.mesh.position.z, 24);
        this.mesh.position.x = safe.x;
        this.mesh.position.z = safe.z;
        this.mesh.position.y = WATER_LEVEL;
      }
    } else if (this.layer !== 'air' && this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z) < 0.65) {
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
      if (this.hurtTimer <= 0) this._resetAnim();
    }

    this.attackTimer += delta;
    this.actionTimer += delta;
    if (this.layer === 'air') this._updateFlightHeight(delta);
    // F4-07b: submersível volta a mergulhar após `SUBMERGE_DELAY` s sem atacar/sofrer dano; embarque e desembarque pendentes.
    if (this.rampT > 0) this.rampT -= delta;
    if (this.submersible && !this.mods.invisible) {
      this._surfaceT += delta;
      if (this._surfaceT >= SUBMERGE_DELAY) addStatus(this, 'invisible', SUBMERGED_FOREVER);
    }
    if (gameManager) {
      if (this._boardTarget) updateBoarding(gameManager, this, delta);
      if (this._unloadOrder) updateUnloading(gameManager, this);
    }

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
      case 'attackingGround':
        this.updateAttackGround(delta, gameManager, arrows, allUnits);
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
    if (this.submersible) return; // F4-07b: o submersível emerge/mergulha sem aviso
    const gm = this.gameManager;
    if (gm && gm.events) gm.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: 'Invisibilidade terminou' });
  }

  /** F4-04: invisibilidade acaba (ao atacar, lançar ou sofrer dano). */
  breakInvisibility() {
    this._surfaceT = 0; // F4-07b: reinicia a contagem do mergulho
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
    this.layer = def.layer || 'ground'; // F4-06: a ovelha (e qualquer forma terrestre) desce ao chão
    this.flyHeight = this.layer === 'air' ? (typeof def.flyHeight === 'number' ? def.flyHeight : 4.5) : 0;
    this.canHitAir = defaultCanHitAir(def);
    this.canHitGround = def.canHitGround !== false;
    this.mesh.position.y = this.terrain.getHeight(this.mesh.position.x, this.mesh.position.z) + this.flyHeight;
    this.regen = 0;
    this.setupMana({ maxMana: 0 });
    this.mana = 0;
    this.lifetime = 0;
    this._swapModel(toType);
    if (this.gameManager && this.gameManager.unitGrid) {
      const p = this.mesh.position;
      this.gameManager.unitGrid.update(this, p.x, p.z, this.collisionRadius);
    }
  }

  /** F4-04: troca o modelo 3D (a `UnitView` recria a malha, mantendo posição/rotação/escala e o anel de seleção). */
  _swapModel(toType) {
    this.visualBase = toType;
    this.modelSeq++;
    this.tool = null;
    this.carryVisible = false;
  }

  /** Ordem `cast` (já validada por `CommandExecutor`): anda até o alcance, lança e volta a `idle`. */
  orderCast(order) {
    if (this.isDead || this.isDying || this.state === 'dying') return; if (this.transportedBy !== null) return; // F4-07b
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
    const dist = fhypot(tx - this.mesh.position.x, tz - this.mesh.position.z) - ((t && t.collisionRadius) || 0);

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
      if (this.hurtTimer <= 0) this._setAnim('cast');
    } else if (dist > ab.range + 1.5) {
      c.phase = 0; // alvo fugiu durante o lançamento: reperseguir (recomeça o castTime)
      return;
    } else {
      c.timer += delta;
    }

    if (tx !== this.mesh.position.x || tz !== this.mesh.position.z) {
      this.mesh.rotation.y = fatan2(tx - this.mesh.position.x, tz - this.mesh.position.z);
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
      // F4-04b: `repeat` (Cura) — continua no mesmo alvo enquanto ele estiver ferido e houver mana.
      if (ab.repeat && t && !targetProblem(this, ab, t) && t.hp < t.maxHp && canCast(gm, this, ab).ok) {
        c.timer = 0; // sem novo ABILITY_CAST (evita repetir o som a cada ciclo)
        return;
      }
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
   * F3-10: leash dos guardas neutros (`homePos` definido por `GameManager.spawnNeutrals`).
   * Se a unidade se afastar mais de `GUARD_LEASH` da origem, larga o alvo e volta (`moveTo`),
   * recuperando 5 % do PV máximo por segundo até chegar; durante o retorno ordens de ataque
   * automáticas (retaliação/auto-aquisição) são sobrescritas — não persegue além do leash.
   */
  _updateGuardLeash(delta) {
    const p = this.mesh.position;
    const h = this.homePos;
    const d = fhypot(p.x - h.x, p.z - h.z);
    if (!this._returningHome) {
      if (d > (this.guardRadius ?? GUARD_LEASH)) {
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
    if (this.hurtTimer <= 0) {
      this._setAnim('idle');
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
    if (this.hurtTimer <= 0) {
      this._setAnim('idle');
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
    const dist = fhypot(dest.x - curX, dest.z - curZ);
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

    const gm = gameManager || this.gameManager;
    const curX = this.mesh.position.x;
    const curZ = this.mesh.position.z;
    const targetX = this.targetPos.x;
    const targetZ = this.targetPos.z;
    const dist = fhypot(targetX - curX, targetZ - curZ);
    const isLastLeg = !this.waypoints || this.waypointIndex >= this.waypoints.length - 1;

    // F3-02: velocidade efetiva (grupo anda na da unidade mais lenta).
    let speed = this.speed * this.mods.speedMul;
    if (this._groupSpeed > 0 && this._groupSpeed < speed) speed = this._groupSpeed;
    const step = speed * delta;

    // F3-02: progresso real desde o tick anterior (inclui empurrões da colisão) — detecta travamento.
    if (this._mvLastX === this._mvLastX) {
      const moved = fhypot(curX - this._mvLastX, curZ - this._mvLastZ);
      if (moved < step * 0.3) this._stuckT += delta;
      else this._stuckT = Math.max(0, this._stuckT - delta);
    }
    this._mvLastX = curX;
    this._mvLastZ = curZ;

    // Chegada: tolerância cresce com as unidades já paradas em volta do lugar (formação cheia não "dança").
    // Waypoint intermediário: raio maior (a multidão não precisa tocar o canto exato — evita engarrafar nas quinas).
    let arriveR = isLastLeg ? 0.45 : WAYPOINT_RADIUS;
    if (isLastLeg && dist < 4 && gm && gm.unitGrid) arriveR += this._settleSlack(gm, targetX, targetZ);
    if (dist < arriveR) {
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

    if (this._stuckT > 0.5 && !isLastLeg && dist < 3.5) {
      // Preso perto de um waypoint intermediário (quina que a colisão não deixa uma unidade grande alcançar): pula para o próximo.
      this.waypointIndex++;
      const nextWp = this.waypoints[this.waypointIndex];
      this.targetPos.set(nextWp.x, 0, nextWp.z);
      this._stuckT = 0;
      return;
    }
    if (this._stuckT > 0.7 && isLastLeg && dist < 4) {
      // Preso perto do lugar (vizinhas ocupando-o): considera chegado.
      this.stop();
      return;
    }
    if (this._stuckT > 1.5 && this._pf(gm) && this.pathDestination && !this.pathPending) {
      // Preso longe do destino: pede um caminho novo a partir daqui (algumas vezes), depois desiste se estiver perto.
      this._stuckT = 0;
      this._repaths++;
      if (this._repaths > 8) {
        this.stop();
        return;
      }
      this._requestMovePath(gm, this.pathDestination.x, this.pathDestination.z);
      return;
    }

    // Move step towards current target waypoint, desviando das vizinhas (steering de separação).
    if (!this._steerStep(gm, targetX, targetZ, dist, step, isLastLeg)) {
      this.stepTowards(targetX, targetZ, step);
    }

    // Walk animation cycle
    this.hasFiredThisAttack = false;
    if (this.hurtTimer <= 0) {
      this._setAnim('walk');
    }
  }

  /**
   * F3-02: folga de chegada = 0,45 por vizinha parada (idle/holding) encostada no lugar de destino
   * (máx. 2,0). Impede que o último a chegar fique empurrando a formação já assentada.
   */
  _settleSlack(gm, tx, tz) {
    const buf = _steerBuf;
    gm.unitGrid.queryRadius(tx, tz, this.collisionRadius + SEP_MARGIN, null, buf);
    let n = 0;
    for (let i = 0; i < buf.length; i++) {
      const u = buf[i];
      if (u === this || u.isDead || (u.state !== 'idle' && u.state !== 'holding')) continue;
      n++;
    }
    return Math.min(2.0, n * 0.45);
  }

  /**
   * F3-02: um passo em direção a (tx, tz) desviando das unidades vizinhas (`steerDirection`).
   * Devolve false (sem mover) quando não há ninguém por perto, para o chamador usar `stepTowards` comum.
   */
  _steerStep(gm, tx, tz, dist, step, isLastLeg) {
    if (!gm || !gm.unitGrid || dist < 1e-4) return false;
    const px = this.mesh.position.x;
    const pz = this.mesh.position.z;
    const r = this.collisionRadius || 0.6;
    const buf = _steerBuf;
    gm.unitGrid.queryRadius(px, pz, r + SEP_MARGIN, null, buf);
    const nb = _steerNb;
    nb.length = 0;
    for (let i = 0; i < buf.length; i++) {
      const u = buf[i];
      if (u === this || u.isDead || u.isDying || u.layer === 'air' || this.layer === 'air' || u.layer !== this.layer) continue; // sem checar `mesh.visible` (névoa é visual; a sim não pode depender dela); F4-07: camadas distintas não interagem
      const p = u.mesh.position;
      nb.push({ x: p.x, z: p.z, radius: u.collisionRadius || 0.6, stationary: u.state === 'idle' || u.state === 'holding' });
    }
    if (nb.length === 0) return false;
    const dir = steerDirection((tx - px) / dist, (tz - pz) / dist, px, pz, r, nb, isLastLeg && dist < 3 ? 0.5 : 1);
    const move = Math.min(step, dist);
    // O desvio nunca leva à água: se o passo desviado cair na água, usa o passo normal até o waypoint.
    if (this._blockedAt(px + dir.x * move, pz + dir.z * move)) return false;
    this.stepTowards(px + dir.x * 10, pz + dir.z * 10, move);
    return true;
  }

  /**
   * F4-07a: petroleiro junto à plataforma — encosta, carrega `CARRY.oil` em `OIL_LOAD_TIME` s (sem fila nem slot) e
   * volta à Refinaria (`returning`); poço esgotado ou plataforma destruída → próximo poço com plataforma própria.
   */
  updateTankerGathering(delta, gm) {
    const dep = this.gatherTarget;
    if (!dep || dep.isDead || dep.resourcesRemaining <= 0 || !gm.platformReady(dep, this.ownerId)) {
      if (this.carrying.amount > 0) {
        this.state = 'returning';
        return;
      }
      const next = gm.findNearestResource(this.mesh.position, 'oil', this.ownerId);
      if (next) {
        this.gatherTarget = next;
        this.targetEntity = next;
        this._loadT = 0;
      } else {
        this.stop();
      }
      return;
    }

    const tp = dep.mesh.position;
    const dist = fhypot(this.mesh.position.x - tp.x, this.mesh.position.z - tp.z);
    const contactDist = (dep.platform.collisionRadius || dep.collisionRadius) + this.collisionRadius + 0.25 + this._contactSlack();
    if (dist > contactDist) {
      this._loadT = 0;
      this.moveTowards(tp.x, tp.z, delta);
      return;
    }

    this.mesh.rotation.y = fatan2(tp.x - this.mesh.position.x, tp.z - this.mesh.position.z);
    this.hasFiredThisAttack = false;
    if (this.hurtTimer <= 0) this._setAnim('idle');
    this._loadT += delta;
    if (this._loadT < OIL_LOAD_TIME) return;
    this._loadT = 0;

    const harvested = dep.mine(CARRY.oil * gatherMultiplier(this.ownerId, 'oil', gm));
    this.carrying.type = 'oil';
    this.carrying.max = CARRY.oil;
    this.carrying.amount = harvested;
    if (dep.consumeDepletedFlag() && gm.events) {
      gm.events.emit(EVT.RESOURCE_DEPLETED, { resourceId: dep.id, pos: posOf(dep.mesh.position), resourceType: 'oil' });
    }
    if (harvested > 0) {
      this.state = 'returning';
      this.updateCarryingVisuals(true);
    }
  }

  updateGathering(delta, gameManager, buildings) {
    if (this.isTanker) {
      this.updateTankerGathering(delta, gameManager || this.gameManager);
      return;
    }
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
    const dist = fhypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
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
    this.mesh.rotation.y = fatan2(dirX, dirZ);

    // F3-04: madeira continua cortada "de fora" (corte contínuo). Ouro/pedra passam a exigir
    // entrar na mina/pedreira — ver `updateWaitingMine`/`updateInsideMine` (item 2 da spec).
    if (this.gatherTarget.type !== 'tree') {
      this.actionTimer = 0;
      this.state = 'waitingMine';
      return;
    }

    // Chop Animation
    this.hasFiredThisAttack = false;
    if (this.hurtTimer <= 0) {
      this._setAnim('gather');
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
    if (this.hurtTimer <= 0) {
      this._setAnim('idle');
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
      this.tool = this.gatherTarget.type === 'tree' ? 'axe' : 'pickaxe';
    } else {
      this.stop();
    }
  }

  updateReturning(delta, gameManager, buildings) {
    // Find nearest dropoff building owned by this unit's player
    const dropoff = gameManager.findNearestDropoff(this.mesh.position, this.carrying.type, buildings || gameManager.buildings, this.ownerId);
    if (!dropoff) {
      if (this.isTanker && gameManager.events) gameManager.events.emit(EVT.NOTIFY, { ownerId: this.ownerId, text: '⚠️ Sem Refinaria para entregar o petróleo' });
      this.stop();
      return;
    }

    const targetPos = dropoff.mesh.position;
    const dist = fhypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);

    // Contact / collision perimeter of dropoff building
    const dropoffRadius = dropoff.collisionRadius || (dropoff.type === 'castle' ? 5.5 : 3.2);
    const contactDist = dropoffRadius + this.collisionRadius + 0.25 + this._contactSlack();

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

  /** Mochila/carga visíveis (a `UnitView` mostra `pack`/`woodBundle`/`goldSack` conforme `carrying.type`). */
  updateCarryingVisuals(visible) {
    this.carryVisible = visible;
  }

  updateBuilding(delta, gameManager) {
    if (!this.buildTarget || this.buildTarget.isDead || this.buildTarget.isConstructed) {
      this.stop();
      return;
    }

    const targetPos = this.buildTarget.mesh.position;
    const dist = fhypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const targetRadius = this.buildTarget.collisionRadius || 3.0;
    const contactDist = targetRadius + this.collisionRadius + 0.25 + this._contactSlack();

    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    // In contact / collided with building scaffold: hammer it!
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = fatan2(dirX, dirZ);

    this.hasFiredThisAttack = false;
    if (this.hurtTimer <= 0) {
      this._setAnim('gather');
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
    const dist = fhypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
    const contactDist = (t.collisionRadius || 3.0) + this.collisionRadius + 0.25;
    if (dist > contactDist) {
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }

    this.mesh.rotation.y = fatan2(targetPos.x - this.mesh.position.x, targetPos.z - this.mesh.position.z);
    this.hasFiredThisAttack = false;
    if (this.hurtTimer <= 0) {
      this._setAnim('gather');
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
      this._explicitAttack = false; // M2-29: o alvo explícito acabou; o próximo é automático
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
    const dist = fhypot(this.mesh.position.x - targetPos.x, this.mesh.position.z - targetPos.z);
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
        const al = fhypot(ax, az);
        if (al < 0.001) { ax = -fsin(this.mesh.rotation.y); az = -fcos(this.mesh.rotation.y); } else { ax /= al; az /= al; }
        this.hasFiredThisAttack = false;
        this.stepTowards(this.mesh.position.x + ax * 2, this.mesh.position.z + az * 2, this.speed * this.mods.speedMul * delta);
        if (this.hurtTimer <= 0) this._setAnim('walk');
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
      // F4-07b: um terrestre não alcança um navio pela costa — desiste em vez de ficar parado na margem.
      if (this.attackTarget.layer === 'naval' && this.layer === 'ground') {
        this.objectiveTarget = null;
        this._giveUpAttack();
        return;
      }
      this.hasFiredThisAttack = false;
      // M2-29 regra 3: revide/aggro automático bloqueado por um inimigo troca o alvo para ele.
      if (!this._explicitAttack && !isTargetBuilding && !this.suicide &&
        this._chaseBlockCheck(delta, allUnits, this.speed * this.mods.speedMul * delta)) return;
      this.moveTowards(targetPos.x, targetPos.z, delta);
      return;
    }
    this._chaseStuckT = 0;
    this._chaseLastX = NaN;

    // 4a. F4-05: unidade suicida detona ao entrar em alcance (sem animação de golpe)
    if (this.suicide) {
      this._detonate(gameManager || this.gameManager, allUnits);
      return;
    }

    // 4. In range: Face target, drive attack animation synchronized with cooldown
    const dirX = targetPos.x - this.mesh.position.x;
    const dirZ = targetPos.z - this.mesh.position.z;
    this.mesh.rotation.y = fatan2(dirX, dirZ);

    // Animação 'fight': troca de estado só; o tempo é sincronizado com o cooldown em
    // renderUpdate (F1-09), de forma contínua (usa `alpha` para não "degrau" a 20 Hz).
    if (this.hurtTimer <= 0) {
      this._setAnim('fight');
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
        const startPos = projectileOriginAt(this.mesh.position);
        const tgt = this.attackTarget;
        const flight = ballisticFlightTime(fhypot(tgt.mesh.position.x - startPos.x, tgt.mesh.position.z - startPos.z), kind);
        _impactPoint.x = tgt.mesh.position.x + (tgt.velX || 0) * flight;
        _impactPoint.y = tgt.mesh.position.y;
        _impactPoint.z = tgt.mesh.position.z + (tgt.velZ || 0) * flight;
        if (gmEvents) gmEvents.emit(EVT.PROJECTILE_FIRED, { kind, from: posOf(startPos), ownerId: this.ownerId });
        const owner = this;
        const projectile = new Projectile({ kind, from: startPos, impact: _impactPoint, onHit: (pos) => {
          if (gm && gm.unitGrid && gm.blockerGrid) applySplashDamage(gm, owner, owner.getEffDamage(), pos, owner.splashRadius, allUnits);
          if (gmEvents) gmEvents.emit(EVT.PROJECTILE_HIT, { kind, pos: posOf(pos), ownerId: owner.ownerId, splashRadius: owner.splashRadius });
        } });
        arrows.push(projectile);
        if (this.gameManager && this.gameManager.registerEntity) this.gameManager.registerEntity(projectile, this.ownerId);
      }
    } else if (this.isRanged) {
      // Archer & Axethrower: Release projectile shot at progress >= 0.60
      if (progress >= 0.60 && !this.hasFiredThisAttack) {
        this.hasFiredThisAttack = true;
        if (this.mods.invisible) this.breakInvisibility();
        const startPos = projectileOriginAt(this.mesh.position);
        const projType = this.projectileType;
        if (gmEvents) gmEvents.emit(EVT.PROJECTILE_FIRED, { kind: projType, from: posOf(startPos), ownerId: this.ownerId });
        // F3-03: o dano final (computeDamage, 1 valor de RNG) é calculado no impacto — a
        // armadura/tipo do alvo naquele instante decidem o resultado, não na hora do disparo.
        const arrow = new Projectile({ kind: projType, from: startPos, target: this.attackTarget, damage: this.getEffDamage(), onHit: (target, dmgObj, hitPos) => {
          const dmg = computeDamage(dmgObj, target, gm.combatRng);
          target.takeDamage(dmg, this, allUnits);
          if (gmEvents) gmEvents.emit(EVT.PROJECTILE_HIT, { kind: projType, pos: posOf(hitPos), ownerId: this.ownerId });
        } });
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
        if (this.splashRadius > 0 && gm && gm.unitGrid && gm.blockerGrid) {
          // F4-06: golpe mágico em área curta (Grifo/Serpe) centrado no alvo — atinge hostis vizinhos (`canTarget`).
          applySplashDamage(gm, this, this.getEffDamage(), target.mesh.position, this.splashRadius, allUnits, 0.5, true);
        } else {
          const dmg = computeDamage(this.getEffDamage(), target, gm.combatRng);
          target.takeDamage(dmg, this, allUnits);
        }
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
   * F4-02: `e` pode ser escolhido numa auto-aquisição? `canTarget` (camada) e, só no cerco, alvo a menos de `minAttackRange` (distância de borda) não.
   */
  _canEngage(e) {
    if (!canTarget(this, e)) return false; // F4-06: imune (Olho Vigia), camada aérea/terrestre (`src/sim/targeting.js`)
    if (!this._shoreOk(e)) return false; // F4-07b: navio só mira terra junto à margem
    // F4-07b: terrestre (que não voa) só auto-adquire navio ao alcance (não persegue o que não alcança pela costa).
    if (e.layer === 'naval' && this.layer === 'ground') {
      const p = this.mesh.position;
      const q = e.mesh.position;
      if (fhypot(p.x - q.x, p.z - q.z) - (e.collisionRadius || 1) > this.attackRange) return false;
    }
    if (this.minAttackRange <= 0) return true;
    if (this.minAttackRange > 0) {
      const p = this.mesh.position;
      const q = e.mesh.position;
      const edge = fhypot(p.x - q.x, p.z - q.z) - (e.collisionRadius || (e.fullMesh ? 3.0 : 0.6));
      if (edge < this.minAttackRange) return false;
    }
    return true;
  }

  /**
   * F4-07b: navio atacando alvo em TERRA (unidade ou construção): só se o alvo estiver a até `SHORE_REACH` da água navegável
   * (margem). Alvo naval/aéreo e atacantes não-navais passam direto (a camada já foi checada por `canTarget`).
   */
  _shoreOk(e) {
    if (this.layer !== 'naval' || e.layer === 'naval' || e.layer === 'air') return true;
    const gm = this.gameManager;
    const npf = gm && gm.navalPathfinder;
    if (!npf) return true;
    const p = e.mesh.position;
    return npf.nearNavigable(p.x, p.z, SHORE_REACH + (e.collisionRadius || 0));
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
  }
}
