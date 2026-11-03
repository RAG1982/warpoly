import { fcos, fhypot, fsin } from '../sim/fmath.js';
import { CMD } from '../sim/commands.js';
import { EVT } from '../sim/events.js';
import { getUnitDef } from '../data/index.js';
import { findBoardingPoint, findLandingSpot } from '../sim/transport.js';
import { baseRegion, regionAt, pointReachable } from './AIWood.js';

/** Quanto tempo (s) um pedido de transporte vale sem ser renovado pelo exército (ele renova a cada tick enquanto a onda está pronta). */
const WANT_TTL = 20;
/** Pausa (s) depois de um plano de desembarque que falhou (sem praia/rota) antes de tentar de novo. */
const PLAN_RETRY = 30;
/** Pausa (s) depois de um desembarque abortado. */
const ABORT_COOLDOWN = 45;
/** Espera (s) por mais barcaças antes de sair com as que há (grupo menor). */
const PARTIAL_WAIT = 45;
/** Tempos máximos (s) das fases da operação. */
const GATHER_MAX = 100;
const BOARD_MAX = 80;
const ESCORT_MAX = 80;
const LANDING_MAX = 160;
/** Reenvio (s) da ordem de embarque para quem ainda está parado em terra. */
const BOARD_RETRY = 10;
/** Raio (u) de alcance do ponto de desembarque para a escolta contar como "chegou". */
const ESCORT_NEAR = 25;
/** Máx. de navios de guerra na escolta e raio (u) em que navio inimigo visto perto da praia segura o transporte. */
const ESCORT_MAX_SHIPS = 4;
const SEA_THREAT_RADIUS = 40;
/** Distância mínima (u) entre a praia e o alvo (fora do alcance de torres e dos defensores) e alcance máximo da busca. */
const BEACH_MIN = 14;
const BEACH_MAX = 64;
const BEACH_CANDIDATES = 14;
/** PV mínimo (fração) de uma barcaça para ser usada. */
const MIN_BOAT_HP = 0.4;

const TAU = Math.PI * 2;

/**
 * AIAmphibiousManager — AI-AMPHIB. Quando o alvo da expedição NÃO é alcançável por terra (outra ilha) mas há costa junto dele,
 * a IA leva o exército por mar com a Barcaça de Transporte:
 *   1. `requestAssault` (chamado pelo gerente militar com a onda pronta) registra o pedido; com barcaça(s) ociosa(s) e uma praia
 *      alcançável pelo mar, abre uma operação: barcaças vão à margem da base → tropa embarca (CMD.LOAD) → (escolta de navios de guerra
 *      vai à frente) → barcaças navegam à praia e desembarcam (CMD.UNLOAD) → a tropa sai em attack-move rumo ao alvo.
 *   2. Sem barcaça, o pedido (`demand()`) faz o `AINavalManager` priorizar Centro nível 2 → Estaleiro → Refinaria → Barcaça
 *      (`trainTransport`), respeitando o petróleo (a barcaça custa petróleo) e a reserva `planReserve`.
 *   3. Sem como atacar (sem praia, sem rota, sem petróleo/estaleiro possível) a onda NÃO sai: as tropas ficam em staging e
 *      o aviso "o esquadrão avança contra sua base" só é emitido quando as barcaças de fato zarpam.
 * Mapas sem água (ou alvos alcançáveis por terra): totalmente inerte. Determinístico: só estado da sim, `fmath` e comandos.
 */
export class AIAmphibiousManager {
  /** @param {import('./AIDirector.js').AIDirector} director */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;
    this.cfg = director.profile.naval || null;
    this.transportType = 'barge';
    /** Pedido de transporte corrente: {target, boats, until}. */
    this._want = null;
    this._everWanted = false;
    this._partialSince = -1;
    this._planRetryAt = 0;
    this._cooldownUntil = 0;
    /** Operação anfíbia em curso, ou null. */
    this._op = null;
    this._reachCache = new Map();
    this._cacheRegion = -2;
    this._baseReg = -1;
    this._baseRegAt = -1e9;
    this._demandTick = -1;
    this._demand = null;
    this._seaCache = new Map();
    this.operationsStarted = 0;
    this.landings = 0;
  }

  /** Há mar e a barcaça existe nos dados? Sem isto a classe não faz nada. */
  get enabled() {
    if (this._enabled === undefined) {
      this._enabled = !!this.cfg && !!this.gm.navalPathfinder && !!this.gm.pathfinder && !!getUnitDef(this.transportType);
    }
    return this._enabled;
  }

  /** Esta unidade pertence à operação em curso (o exército terrestre não deve mexer nela)? */
  owns(id) {
    const op = this._op;
    return !!op && (op.troopSet.has(id) || op.boatSet.has(id));
  }

  /**
   * O exército terrestre deve ignorar esta unidade? Só depois que a IA pediu transporte (ou durante uma operação): barcaças e
   * passageiros. Antes disso (inclusive barcaça com tropa de uma missão scriptada) vale o comportamento de sempre.
   */
  excludes(e) {
    if (!this._everWanted && !this._op) return false;
    return this.owns(e.id) || e.transportedBy != null || e.transportCapacity > 0;
  }

  /** A operação está ativa? */
  get active() { return !!this._op; }

  // --- Alcançabilidade por terra / por mar ---

  _baseRegion(now) {
    if (now - this._baseRegAt >= 5) {
      this._baseReg = baseRegion(this.director);
      this._baseRegAt = now;
    }
    return this._baseReg;
  }

  /** Região terrestre de (x, z) (varre a célula e as 8 vizinhas) ou −1. */
  _regionOf(x, z) {
    const pf = this.gm.pathfinder;
    const r = regionAt(pf, x, z);
    if (r >= 0) return r;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const q = regionAt(pf, x + fcos(a) * 1.6, z + fsin(a) * 1.6);
      if (q >= 0) return q;
    }
    return -1;
  }

  /** (x, z) é alcançável por terra a partir da base da IA? Cacheado por região da base e célula arredondada. */
  landReachable(x, z) {
    const now = this.director.simTime || 0;
    const reg = this._baseRegion(now);
    if (reg < 0) return true; // base sem região (Centro caiu): comportamento antigo
    if (reg !== this._cacheRegion) { this._reachCache.clear(); this._cacheRegion = reg; }
    const key = Math.round(x / 4) * 4096 + Math.round(z / 4);
    let v = this._reachCache.get(key);
    if (v === undefined) {
      v = pointReachable(this.gm.pathfinder, reg, x, z) || this._regionOf(x, z) === reg;
      this._reachCache.set(key, v);
    }
    return v;
  }

  /**
   * Veredito para um alvo em (x, z): 'land' (alcançável por terra, ou ponto sem terra firme: comportamento antigo) ou
   * 'sea' (terra firme em outra massa de terra: só por transporte).
   */
  verdict(x, z) {
    if (!this.enabled) return 'land';
    if (this.landReachable(x, z)) return 'land';
    return this._regionOf(x, z) < 0 ? 'land' : 'sea';
  }

  // --- Barcaças ---

  _freeBarges() {
    const out = [];
    const us = this.director.getOwnUnits();
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.isDead || u.isDying || !(u.transportCapacity > 0) || !u.cargo || u.cargo.length > 0) continue;
      if (u.hp < u.maxHp * MIN_BOAT_HP || u.state !== 'idle' || this.owns(u.id)) continue;
      out.push(u);
    }
    return out;
  }

  _queuedBarges() {
    let n = 0;
    const bs = this.gm.buildings;
    const pid = this.director.playerId;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.ownerId !== pid || b.isDead || !b.queue) continue;
      for (let j = 0; j < b.queue.length; j++) if (b.queue[j].type === this.transportType) n++;
    }
    return n;
  }

  /**
   * Barcaças que ainda faltam para o pedido corrente ({boats: faltam, total}) ou null (sem pedido, pedido vencido, operação em
   * curso ou já há barcaças/fila suficientes). Cacheado por tick.
   */
  demand() {
    if (!this.enabled) return null;
    const tick = this.gm.currentTick;
    if (this._demandTick === tick) return this._demand;
    this._demandTick = tick;
    this._demand = null;
    const w = this._want;
    if (!w || (this.director.simTime || 0) > w.until || this._op) return null;
    const miss = w.boats - this._freeBarges().length - this._queuedBarges();
    if (miss > 0) this._demand = { boats: miss, total: w.boats };
    return this._demand;
  }

  /**
   * Chamado pelo `AINavalManager._training` com o Estaleiro pronto: treina a barcaça que falta. Devolve true se a ação
   * "consumiu" o turno (treinou, ou segura o petróleo para a barcaça em vez de gastá-lo em navios de guerra).
   */
  trainTransport(shipyard, train, snap) {
    const d = this.demand();
    if (!d) return false;
    if (train(this.transportType)) return true;
    const c = getUnitDef(this.transportType).cost || {};
    const res = this.director.resources;
    return (c.oil || 0) > (res.oil || 0) && snap.platforms.length > 0;
  }

  /** Custo da barcaça (para a reserva do plano naval). */
  transportCost() {
    return getUnitDef(this.transportType).cost;
  }

  // --- Pedido de ataque (gerente militar) ---

  /**
   * A onda `units` quer atacar `target` (alvo sem rota terrestre). Registra o pedido de transporte e, havendo barcaças e praia,
   * abre a operação. Nunca emite o aviso de ataque: ele sai quando as barcaças zarpam.
   * @param {object[]} units  unidades terrestres prontas
   * @param {{id:number,x:number,z:number,ownerId:number}} target
   */
  requestAssault(units, target) {
    const dir = this.director;
    const now = dir.simTime || 0;
    const cfg = this.cfg;
    if (this._op) return;
    const def = getUnitDef(this.transportType);
    const cap = def.transportCapacity || 6;
    const maxBoats = Math.max(1, cfg.boats || 1);
    // grupo: combatentes primeiro (cerco por último), ordem de id (determinístico), até a capacidade das barcaças da dificuldade
    const sorted = units
      .filter(u => !u.isDead && u.transportedBy === null && u.layer === 'ground')
      .sort((a, b) => ((getUnitDef(a.type).isSiege ? 1 : 0) - (getUnitDef(b.type).isSiege ? 1 : 0)) || a.id - b.id);
    const group = sorted.slice(0, cap * maxBoats);
    if (group.length < 2) return;
    const need = Math.ceil(group.length / cap);
    this._everWanted = true;
    this._want = { target: { id: target.id, x: target.x, z: target.z, ownerId: target.ownerId }, boats: need, until: now + WANT_TTL };
    if (now < this._cooldownUntil || now < this._planRetryAt || dir.utilities.def > 0) return;

    let boats = this._freeBarges();
    if (boats.length === 0) { this._partialSince = -1; return; }
    boats.sort((a, b) => a.id - b.id);
    if (boats.length < need) {
      if (this._partialSince < 0) this._partialSince = now;
      if (now - this._partialSince < PARTIAL_WAIT) return;
    }
    boats = boats.slice(0, need);
    const members = group.slice(0, boats.length * cap);
    const plan = this._plan(boats, members, target);
    if (!plan) { this._planRetryAt = now + PLAN_RETRY; return; }
    this._partialSince = -1;
    const assign = new Map();
    members.forEach((u, i) => assign.set(u.id, boats[Math.floor(i / cap)].id));
    this._op = {
      phase: 'gather', since: now, phaseAt: now,
      target: { id: target.id, x: target.x, z: target.z, ownerId: target.ownerId },
      boats: boats.map(b => b.id), boatSet: new Set(boats.map(b => b.id)),
      troops: members.map(u => u.id), troopSet: new Set(members.map(u => u.id)),
      assign, pickup: plan.pickup, beach: plan.beach, loadAt: -1e9, escorts: [], issued: false
    };
    this.operationsStarted++;
    // vai à margem da base
    for (let i = 0; i < boats.length; i++) {
      const p = plan.pickup.points[i];
      if (p) dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: [boats[i].id], x: p.x, z: p.z });
    }
  }

  /** Ponto de embarque + praia de desembarque alcançável pelo mar, ou null. */
  _plan(boats, members, target) {
    const gm = this.gm;
    const npf = gm.navalPathfinder;
    const lpf = gm.pathfinder;
    const now = this.director.simTime || 0;
    const baseReg = this._baseRegion(now);
    const b0 = boats[0];
    // embarque: barcaça já encostada na terra da base fica onde está; senão, a margem da base mais perto da tropa
    const bp = findBoardingPoint(gm, b0);
    let pickupSea;
    if (bp && pointReachable(lpf, baseReg, bp.x, bp.z)) {
      pickupSea = { x: b0.mesh.position.x, z: b0.mesh.position.z };
    } else {
      let cx = 0; let cz = 0;
      for (let i = 0; i < members.length; i++) { cx += members[i].mesh.position.x; cz += members[i].mesh.position.z; }
      cx /= members.length; cz /= members.length;
      let found = null;
      for (let r = 0; r <= 90 && !found; r += 3) {
        const steps = r === 0 ? 1 : 16;
        for (let k = 0; k < steps && !found; k++) {
          const a = (k / steps) * TAU;
          const lx = cx + fcos(a) * r;
          const lz = cz + fsin(a) * r;
          if (!lpf.isWalkableWorld(lx, lz) || regionAt(lpf, lx, lz) !== baseReg) continue;
          const sp = findLandingSpot(gm, lx, lz, 0);
          if (sp) found = sp.sea;
        }
      }
      if (!found) return null;
      pickupSea = found;
    }
    const points = boats.map((b, i) => {
      if (i === 0) return pickupSea;
      return npf.findNearestWalkable(pickupSea.x + (i % 2 ? 3 : -3) * Math.ceil(i / 2), pickupSea.z + 2, 6) || pickupSea;
    });
    const beach = this._findBeach(target, pickupSea);
    if (!beach) return null;
    return { pickup: { sea: pickupSea, points }, beach };
  }

  /** Praia junto do alvo (mesma massa de terra, ≥ `BEACH_MIN` do alvo) com rota naval a partir de `from`. Cacheado. */
  _findBeach(target, from) {
    const gm = this.gm;
    const lpf = gm.pathfinder;
    const npf = gm.navalPathfinder;
    const key = `${Math.round(target.x / 6)}:${Math.round(target.z / 6)}:${Math.round(from.x / 8)}:${Math.round(from.z / 8)}`;
    if (this._seaCache.has(key)) return this._seaCache.get(key);
    const tr = this._regionOf(target.x, target.z);
    let result = null;
    let tried = 0;
    for (let r = BEACH_MIN; r <= BEACH_MAX && !result && tried < BEACH_CANDIDATES; r += 3) {
      for (let k = 0; k < 24 && !result && tried < BEACH_CANDIDATES; k++) {
        const a = (k / 24) * TAU;
        const lx = target.x + fcos(a) * r;
        const lz = target.z + fsin(a) * r;
        if (!lpf.isWalkableWorld(lx, lz) || regionAt(lpf, lx, lz) !== tr) continue;
        const sp = findLandingSpot(gm, lx, lz, 0);
        if (!sp) continue;
        tried++;
        const path = npf.findPath(from.x, from.z, sp.sea.x, sp.sea.z);
        if (path && path.length > 0 && fhypot(path[path.length - 1].x - sp.sea.x, path[path.length - 1].z - sp.sea.z) <= 5) {
          result = { sea: sp.sea, land: sp.land };
        }
      }
    }
    this._seaCache.set(key, result);
    return result;
  }

  // --- Operação ---

  update() {
    if (!this.enabled) return;
    const op = this._op;
    if (!op) return;
    const dir = this.director;
    const gm = this.gm;
    const now = dir.simTime || 0;
    const boats = op.boats.map(id => gm.getEntity(id)).filter(b => b && !b.isDead && !b.isDying);
    const troops = op.troops.map(id => gm.getEntity(id)).filter(u => u && !u.isDead && !u.isDying);
    if (op.phase !== 'landing' && (boats.length === 0 || troops.length < 2)) { this._abort(boats, now); return; }
    if (op.phase !== 'landing' && dir.utilities.def > 0) { this._abort(boats, now); return; } // base invadida: a tropa volta para casa
    const phase = op.phase;
    if (phase === 'gather') this._gather(op, boats, troops, now);
    else if (phase === 'board') this._board(op, boats, troops, now);
    else if (phase === 'escort') this._escort(op, boats, troops, now);
    else if (phase === 'landing') this._landing(op, boats, troops, now);
  }

  _setPhase(op, phase, now) { op.phase = phase; op.phaseAt = now; }

  _gather(op, boats, troops, now) {
    const dir = this.director;
    let ready = true;
    for (let i = 0; i < boats.length; i++) {
      const p = op.pickup.points[op.boats.indexOf(boats[i].id)] || op.pickup.sea;
      const d = fhypot(boats[i].mesh.position.x - p.x, boats[i].mesh.position.z - p.z);
      if (d > 5 && !(boats[i].state === 'idle' && d <= 9)) {
        ready = false;
        if (boats[i].state === 'idle' && now - op.phaseAt > 5) dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: [boats[i].id], x: p.x, z: p.z });
      }
    }
    if (now - op.phaseAt > GATHER_MAX) { this._abort(boats, now); return; }
    if (ready) this._setPhase(op, 'board', now);
  }

  _board(op, boats, troops, now) {
    const dir = this.director;
    let loaded = 0;
    const pending = new Map();
    for (let i = 0; i < troops.length; i++) {
      const u = troops[i];
      if (u.transportedBy !== null) { loaded++; continue; }
      const bid = op.assign.get(u.id);
      if (!pending.has(bid)) pending.set(bid, []);
      pending.get(bid).push(u.id);
    }
    if (loaded === troops.length) { this._afterBoard(op, boats, troops, now); return; }
    const age = now - op.phaseAt;
    if (age > BOARD_MAX) {
      if (loaded >= 2) { this._afterBoard(op, boats, troops, now); return; }
      this._abort(boats, now);
      return;
    }
    if (now - op.loadAt >= BOARD_RETRY) {
      let all = true;
      for (const [bid, ids] of pending) {
        const boat = this.gm.getEntity(bid);
        if (!boat || boat.isDead) continue;
        // só manda quem ainda está ocioso/parado em terra (quem já anda até a barcaça não é reordenado)
        const idle = ids.filter(id => { const e = this.gm.getEntity(id); return e && e.state === 'idle'; });
        if (idle.length === 0) continue;
        if (!dir.issue({ type: CMD.LOAD, playerId: dir.playerId, unitIds: idle, targetId: bid })) all = false;
      }
      if (all) op.loadAt = now;
    }
  }

  _afterBoard(op, boats, troops, now) {
    // quem não embarcou fica de fora da operação
    for (const u of troops) if (u.transportedBy === null) { op.troopSet.delete(u.id); }
    op.troops = op.troops.filter(id => op.troopSet.has(id));
    // escolta: navios de guerra ociosos vão à frente, até a praia
    const nm = this.director.navalManager;
    const escorts = [];
    if (nm.managesFleet()) {
      const s = nm.snapshot();
      for (const u of s.warships) {
        if (escorts.length >= ESCORT_MAX_SHIPS) break;
        if (u.state !== 'idle' || u.hp < u.maxHp * 0.5 || (nm._wave && nm._wave.ids.has(u.id))) continue;
        escorts.push(u);
      }
    }
    if (escorts.length > 0) {
      const ids = escorts.map(u => u.id);
      if (this.director.issue({ type: CMD.ATTACK_MOVE, playerId: this.director.playerId, unitIds: ids, x: op.beach.sea.x, z: op.beach.sea.z })) {
        op.escorts = ids;
        for (const id of ids) nm.escortHold.add(id);
      }
    }
    this._setPhase(op, 'escort', now);
  }

  _hostileSeaNear(x, z) {
    const per = this.director.perception;
    for (const k of per.units.values()) {
      const d = getUnitDef(k.type);
      if (!d || d.layer !== 'naval' || !d.isCombat || per.now - k.lastSeen > 30) continue;
      if (fhypot(k.x - x, k.z - z) <= SEA_THREAT_RADIUS) return true;
    }
    return false;
  }

  _releaseEscorts() {
    const nm = this.director.navalManager;
    nm.escortHold.clear();
  }

  _escort(op, boats, troops, now) {
    const gm = this.gm;
    const beach = op.beach.sea;
    let alive = 0; let near = 0; let moving = 0;
    for (const id of op.escorts) {
      const e = gm.getEntity(id);
      if (!e || e.isDead) continue;
      alive++;
      if (fhypot(e.mesh.position.x - beach.x, e.mesh.position.z - beach.z) <= ESCORT_NEAR) near++;
      if (e.state !== 'idle') moving++;
    }
    const age = now - op.phaseAt;
    let go;
    if (alive > 0) {
      go = near * 2 >= alive || moving === 0 || age > ESCORT_MAX;
    } else {
      // sem escolta: sai se o mar junto da praia está livre; do contrário espera um pouco e desiste
      go = !this._hostileSeaNear(beach.x, beach.z);
      if (!go && age > ESCORT_MAX) { this._abort(boats, now); return; }
    }
    if (!go) return;
    this._sail(op, boats, troops, now);
  }

  _sail(op, boats, troops, now) {
    const dir = this.director;
    const loadedBoats = boats.filter(b => b.cargo && b.cargo.length > 0);
    if (loadedBoats.length === 0) { this._abort(boats, now); return; }
    for (let i = 0; i < loadedBoats.length; i++) {
      const b = loadedBoats[i];
      if (op.unloadSent && op.unloadSent.has(b.id)) continue;
      if (!dir.issue({ type: CMD.UNLOAD, playerId: dir.playerId, unitId: b.id, x: op.beach.land.x, z: op.beach.land.z })) return; // sem APM: retoma no próximo tick
      (op.unloadSent || (op.unloadSent = new Set())).add(b.id);
    }
    this._releaseEscorts();
    // aviso ao alvo só agora: o ataque realmente vai acontecer (alvo às cegas: avisa todos os jogadores hostis)
    const events = this.gm.events;
    if (events) {
      const n = troops.filter(u => u.transportedBy !== null).length;
      const text = dir.faction === 'orc'
        ? `⚔️ Os Clãs Orcs embarcaram um esquadrão de guerra (${n} tropas) e navegam rumo à sua costa!`
        : `⚔️ O Reino Humano embarcou um esquadrão de guerra (${n} tropas) e navega rumo à sua costa!`;
      const owners = [];
      if (op.target.ownerId !== null && op.target.ownerId !== undefined) owners.push(op.target.ownerId);
      else for (const p of this.gm.players) if (p.id !== dir.playerId && this.gm.isHostile(dir.playerId, p.id)) owners.push(p.id);
      for (const ownerId of owners) {
        events.emit(EVT.UNDER_ATTACK, { ownerId, pos: { x: op.beach.land.x, y: 0, z: op.beach.land.z } });
        events.emit(EVT.NOTIFY, { ownerId, text });
      }
    }
    op.unloadAt = now;
    this._setPhase(op, 'landing', now);
  }

  _landing(op, boats, troops, now) {
    const dir = this.director;
    const pending = boats.filter(b => b.cargo && b.cargo.length > 0);
    const age = now - op.phaseAt;
    if (pending.length > 0 && age <= LANDING_MAX) {
      // barcaça parada com carga (rota/margem falhou): reemite a ordem; na 3ª vez solta onde está
      for (let i = 0; i < pending.length; i++) {
        const b = pending[i];
        if (b.state !== 'idle' || age < 8) continue;
        const tries = (op.retries || (op.retries = new Map())).get(b.id) || 0;
        if (tries >= 4) continue;
        const cmd = { type: CMD.UNLOAD, playerId: dir.playerId, unitId: b.id };
        if (tries < 2) { cmd.x = op.beach.land.x; cmd.z = op.beach.land.z; }
        if (dir.issue(cmd)) {
          op.retries.set(b.id, tries + 1);
        }
      }
      return;
    }
    // carga solta (ou tempo esgotado): quem desembarcou ataca; quem ficou na barcaça segue com ela
    const landed = [];
    for (let i = 0; i < troops.length; i++) if (troops[i].transportedBy === null) landed.push(troops[i]);
    if (landed.length > 0) {
      const ids = landed.map(u => u.id);
      if (!dir.issue({ type: CMD.ATTACK_MOVE, playerId: dir.playerId, unitIds: ids, x: op.target.x, z: op.target.z })) return;
      const mil = dir.militaryManager;
      for (let i = 0; i < ids.length; i++) mil.waveIds.add(ids[i]);
      this.landings++;
    }
    // barcaças voltam à margem da base (prontas para um reforço)
    const back = boats.filter(b => !b.cargo || b.cargo.length === 0);
    if (back.length > 0) dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: back.map(b => b.id), x: op.pickup.sea.x, z: op.pickup.sea.z });
    this._op = null;
    this._cooldownUntil = now + (this.cfg.landCooldown || 60);
  }

  /** Cancela a operação: quem está embarcado desembarca onde está, a escolta é solta, pausa antes de tentar de novo. */
  _abort(boats, now) {
    const dir = this.director;
    for (let i = 0; i < boats.length; i++) {
      if (boats[i].cargo && boats[i].cargo.length > 0) dir.issue({ type: CMD.UNLOAD, playerId: dir.playerId, unitId: boats[i].id });
    }
    this._releaseEscorts();
    this._op = null;
    this._cooldownUntil = now + ABORT_COOLDOWN;
  }
}
