/**
 * LockstepSession.js — F9-01/F9-03: lockstep determinístico por turnos (ver docs/09_MULTIPLAYER.md).
 *
 * Um TURNO = `turnTicks` ticks de simulação (20 Hz). Só comandos trafegam; cada par roda a sua
 * própria sim. Fluxo:
 *  - comandos locais (`queueCommand`) ficam num buffer; quando o turno `T` passa a ser o próximo a
 *    executar, o par fecha e envia o seu pacote do turno `T + delayTurns` (atraso de input);
 *  - o turno `T` só executa quando há pacote de TODOS os jogadores (senão a sim espera = "stall");
 *  - ao executar, os comandos são enfileirados no tick `T * turnTicks` em ordem de `playerId` (e de
 *    emissão dentro do jogador), e a sim avança `turnTicks` passos;
 *  - a cada `checkEvery` turnos calcula-se o checksum do estado; ele viaja nos pacotes seguintes e
 *    é comparado com o dos outros pares → divergência = desync (`onDesync`, sim congelada).
 *
 * F9-03:
 *  - RTT/jitter por par (ping/pong a cada `pingEveryMs`) e ATRASO ADAPTATIVO: cada par escolhe o
 *    próprio `delayTurns` = ceil((RTTmax/2 + 2·jitter)/turnMs) + 1, limitado a [minDelay, maxDelay];
 *    sobe na hora e desce 1 turno depois de `lowerAfter` turnos seguidos com alvo menor. Não precisa
 *    de anúncio: o atraso é só "quantos turnos à frente eu mando pacote", e cada par exige apenas
 *    um pacote por turno de cada outro — mudar o próprio atraso não altera o estado da sim;
 *  - `pump(dtMs)`: ritmo em tempo real (1 turno por `turnMs`, com recuperação limitada);
 *  - desync com relatório: quais turnos/jogadores divergem (maioria com >= 3), checksum por categoria
 *    e unidades divergentes (`desync` + `desyncDump()`);
 *  - `status()` para a HUD (RTT, atraso, quem estamos aguardando, tempo parado).
 *
 * Independente de three.js/DOM: o relógio entra por `now()` (padrão `performance.now`). A sim entra
 * por um adaptador `{ enqueue(cmd, tick), step(), checksum(), detail?(), beginTurn?(), endTurn?() }`.
 */
import { validateCommand } from '../sim/commands.js';

const KEEP_SUMS = 128;
const KEEP_DETAIL = 6;
const KEEP_LOG = 100;
const MAX_AHEAD = 64; // pacote de turno > turn + MAX_AHEAD = lixo/hostil
const MAX_UNITS_IN_REPORT = 1500;

export class LockstepSession {
  /**
   * @param {object} o
   * @param {import('./Transport.js').Transport} o.transport
   * @param {number} o.localId  playerId do par local
   * @param {number[]} o.playerIds  todos os jogadores humanos da partida (inclui o local)
   * @param {object} o.sim  adaptador da sim
   * @param {number} [o.turnTicks=2]  ticks por turno (2 = 100 ms)
   * @param {number} [o.delayTurns=2]  atraso de input inicial em turnos
   * @param {boolean} [o.adaptive=false]  liga o atraso adaptativo
   * @param {number} [o.minDelay=2]
   * @param {number} [o.maxDelay=6]
   * @param {number} [o.lowerAfter=30]  turnos com alvo menor antes de descer 1
   * @param {number} [o.pingEveryMs=500]
   * @param {number} [o.checkEvery=1]  checksum a cada N turnos
   * @param {() => number} [o.now]  relógio em ms
   * @param {number} [o.turnMs]  duração de um turno em ms (padrão turnTicks*50)
   * @param {(info: object) => void} [o.onDesync]
   * @param {(info: object) => void} [o.onDesyncDetail]  relatório enriquecido (chegou o detalhe de outro par)
   * @param {(info: object) => void} [o.onViolation]  pacote inválido/forjado de um par
   * @param {(info: {from: number, to: number}) => void} [o.onDelayChange]
   */
  constructor({
    transport, localId, playerIds, sim, turnTicks = 2, delayTurns = 2, adaptive = false, minDelay = 2, maxDelay = 6, lowerAfter = 30,
    pingEveryMs = 500, checkEvery = 1, now = () => performance.now(), turnMs, onDesync, onDesyncDetail, onViolation, onDelayChange
  }) {
    this.transport = transport;
    this.localId = localId;
    this.playerIds = [...playerIds].sort((a, b) => a - b);
    this.sim = sim;
    this.turnTicks = turnTicks;
    this.turnMs = turnMs ?? turnTicks * 50;
    this.adaptive = adaptive;
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
    this.lowerAfter = lowerAfter;
    this.delayTurns = Math.min(maxDelay, Math.max(minDelay, delayTurns));
    this._initialDelay = this.delayTurns;
    this.targetDelay = this.delayTurns;
    this.pingEveryMs = pingEveryMs;
    this.checkEvery = checkEvery;
    this.now = now;
    this.onDesync = onDesync || (() => {});
    this.onDesyncDetail = onDesyncDetail || (() => {});
    this.onViolation = onViolation || (() => {});
    this.onDelayChange = onDelayChange || (() => {});

    /** Próximo turno a executar (turnos 0..turn-1 já executados). */
    this.turn = 0;
    this.desync = null;
    this.stalls = 0;
    this.started = false;
    this._sentUpTo = -1;
    this._pending = [];
    /** @type {Map<number, Map<number, object[]>>} turno → (jogador → comandos) */
    this._inbox = new Map();
    this._localSums = new Map();
    this._localDetail = new Map();
    /** @type {Map<number, Map<number, number>>} turno → (jogador → hash) */
    this._remoteSums = new Map();
    this._unsentSums = [];
    this._remoteDetail = new Map(); // turno → (jogador → {parts, units})
    this._cmdLog = [];
    this._lowerCount = 0;
    /** @type {Map<number, {rtt: number, jitter: number, samples: number}>} */
    this.peers = new Map();
    this._pingSeq = 0;
    this._lastPingAt = -Infinity;
    this._waiting = [];
    this._stallSince = null;
    this._acc = 0;
    this._unsub = transport.onMessage((m) => this._onMessage(m));
  }

  /** Enfileira um comando local (campos de `makeCommand`, sem `tick`); vai no próximo pacote a ser fechado. */
  queueCommand(fields) {
    const cmd = { ...fields, playerId: this.localId };
    delete cmd.tick;
    delete cmd.seqNo;
    const v = validateCommand(cmd);
    if (!v.ok) throw new Error(`queueCommand: ${v.reason}`);
    this._pending.push(cmd);
  }

  /** Envia os pacotes vazios dos primeiros `delayTurns` turnos (ninguém pode ter emitido nada antes). */
  start() {
    if (this.started) return;
    this.started = true;
    for (let t = 0; t < this.delayTurns; t++) this._sendTurn(t);
  }

  /**
   * Executa todos os turnos prontos (até `maxTurns`). Devolve quantos executou.
   * Se faltar o pacote de algum jogador o turno não executa (stall) e `stalls` é incrementado.
   */
  update(maxTurns = Infinity) {
    if (!this.started) this.start();
    this._pingTick();
    let ran = 0;
    while (ran < maxTurns && !this.desync) {
      const t = this.turn;
      while (this._sentUpTo < t + this.delayTurns) this._sendTurn(this._sentUpTo + 1);
      const box = this._inbox.get(t);
      const missing = this.playerIds.filter((p) => !box || !box.has(p));
      if (missing.length > 0) {
        this.stalls++;
        this._waiting = missing;
        if (this._stallSince === null) this._stallSince = this.now();
        break;
      }
      this._waiting = [];
      this._stallSince = null;
      this._execute(t, box);
      ran++;
    }
    return ran;
  }

  /**
   * Ritmo em tempo real: acumula `dtMs` e executa 1 turno por `turnMs` (no máximo `maxCatchUp` por
   * chamada). Em stall o acumulador fica limitado a `maxCatchUp` turnos (sem rajada infinita ao
   * destravar). Devolve `{ran, alpha}` — `alpha` em [0,1] é a fração do turno atual já decorrida
   * (para interpolar a apresentação).
   */
  pump(dtMs, maxCatchUp = 4) {
    this._acc += dtMs;
    let ran = 0;
    while (this._acc >= this.turnMs && ran < maxCatchUp && !this.desync) {
      if (this.update(1) === 0) break;
      this._acc -= this.turnMs;
      ran++;
    }
    if (ran === 0 && !this.started) this.update(0);
    this._acc = Math.min(this._acc, this.turnMs * maxCatchUp);
    if (this.desync || this._acc >= this.turnMs) return { ran, alpha: 1 };
    return { ran, alpha: this._acc / this.turnMs };
  }

  /** Último checksum local calculado: `{t, h}` (turno, hash) ou null. */
  get lastChecksum() {
    let best = null;
    for (const [t, h] of this._localSums) if (best === null || t > best.t) best = { t, h };
    return best;
  }

  /** Foto para a HUD: RTT por par, atraso atual/alvo, quem estamos aguardando e há quanto tempo. */
  status() {
    const rtt = {};
    let maxRtt = 0;
    for (const [pid, p] of this.peers) {
      if (p.samples > 0) {
        rtt[pid] = Math.round(p.rtt);
        maxRtt = Math.max(maxRtt, p.rtt);
      }
    }
    return {
      turn: this.turn,
      delay: this.delayTurns,
      targetDelay: this.targetDelay,
      rtt,
      maxRtt: Math.round(maxRtt),
      waiting: [...this._waiting],
      stalledMs: this._stallSince === null ? 0 : Math.max(0, this.now() - this._stallSince),
      stalls: this.stalls,
      desync: this.desync
    };
  }

  /** Dump de depuração (JSON puro): relatório de desync + últimos turnos de comandos + checksums locais. */
  desyncDump() {
    return {
      localId: this.localId,
      playerIds: this.playerIds,
      turnTicks: this.turnTicks,
      turn: this.turn,
      report: this.desync,
      localSums: [...this._localSums].map(([turn, hash]) => ({ turn, hash })),
      commandLog: this._cmdLog
    };
  }

  dispose() {
    this._unsub();
  }

  // --- interno ---

  _sendTurn(turn) {
    const cmds = turn < this._initialDelay ? [] : this._pending.splice(0);
    this._storeCmds(turn, this.localId, cmds);
    this._sentUpTo = turn;
    this.transport.send({ k: 'turn', from: this.localId, turn, cmds, sums: this._unsentSums.splice(0) });
  }

  _storeCmds(turn, pid, cmds) {
    let box = this._inbox.get(turn);
    if (!box) {
      box = new Map();
      this._inbox.set(turn, box);
    }
    if (!box.has(pid)) box.set(pid, cmds);
  }

  _pingTick() {
    const t = this.now();
    if (t - this._lastPingAt < this.pingEveryMs || this.playerIds.length < 2) return;
    this._lastPingAt = t;
    this.transport.send({ k: 'ping', from: this.localId, id: this._pingSeq++, t });
  }

  _onPong(m) {
    const sample = this.now() - m.t;
    if (!(sample >= 0) || sample > 60000) return;
    let p = this.peers.get(m.from);
    if (!p) {
      p = { rtt: sample, jitter: 0, samples: 0 };
      this.peers.set(m.from, p);
    }
    if (p.samples > 0) {
      p.jitter += (Math.abs(sample - p.rtt) - p.jitter) * 0.25;
      p.rtt += (sample - p.rtt) * 0.25;
    }
    p.samples++;
    this._retarget();
  }

  _retarget() {
    let worst = 0;
    for (const p of this.peers.values()) if (p.samples > 0) worst = Math.max(worst, p.rtt / 2 + 2 * p.jitter);
    this.targetDelay = Math.min(this.maxDelay, Math.max(this.minDelay, Math.ceil(worst / this.turnMs) + 1));
  }

  /** Sobe na hora; desce 1 depois de `lowerAfter` turnos seguidos com alvo menor. */
  _adapt() {
    if (!this.adaptive) return;
    const cur = this.delayTurns;
    if (this.targetDelay > cur) {
      this.delayTurns = this.targetDelay;
      this._lowerCount = 0;
    } else if (this.targetDelay < cur) {
      if (++this._lowerCount >= this.lowerAfter) {
        this.delayTurns = cur - 1;
        this._lowerCount = 0;
      }
    } else {
      this._lowerCount = 0;
    }
    if (this.delayTurns !== cur) this.onDelayChange({ from: cur, to: this.delayTurns });
  }

  _onMessage(m) {
    if (!m || typeof m !== 'object' || !Number.isInteger(m.from) || !this.playerIds.includes(m.from) || m.from === this.localId) return;
    switch (m.k) {
      case 'ping':
        if (typeof m.t === 'number') this.transport.send({ k: 'pong', from: this.localId, to: m.from, id: m.id, t: m.t });
        return;
      case 'pong':
        if (m.to === this.localId && typeof m.t === 'number') this._onPong(m);
        return;
      case 'desync':
        this._onDesyncMsg(m);
        return;
      case 'turn':
        this._onTurn(m);
        return;
      default:
    }
  }

  _onTurn(m) {
    if (!Number.isInteger(m.turn) || !Array.isArray(m.cmds)) {
      this.onViolation({ from: m.from, reason: 'pacote malformado' });
      return;
    }
    if (m.turn > this.turn + MAX_AHEAD) {
      this.onViolation({ from: m.from, turn: m.turn, reason: 'turno muito à frente' });
      return;
    }
    if (m.turn >= this.turn) {
      for (const c of m.cmds) {
        const v = validateCommand(c);
        if (!v.ok || c.playerId !== m.from) {
          this.onViolation({ from: m.from, turn: m.turn, reason: v.ok ? 'comando em nome de outro jogador' : v.reason });
          return;
        }
      }
      this._storeCmds(m.turn, m.from, m.cmds); // duplicata do mesmo turno é ignorada (vale o primeiro)
    }
    if (Array.isArray(m.sums)) {
      for (const s of m.sums) if (s && Number.isInteger(s.turn)) this._recordRemoteSum(m.from, s.turn, s.hash);
    }
  }

  _recordRemoteSum(pid, turn, hash) {
    let row = this._remoteSums.get(turn);
    if (!row) {
      row = new Map();
      this._remoteSums.set(turn, row);
    }
    row.set(pid, hash);
    this._compare(turn);
    if (this.desync && this.desync.turn === turn) this._refreshReport();
  }

  _onDesyncMsg(m) {
    if (!Number.isInteger(m.turn)) return;
    if (m.parts && typeof m.parts === 'object') {
      let row = this._remoteDetail.get(m.turn);
      if (!row) {
        row = new Map();
        this._remoteDetail.set(m.turn, row);
      }
      row.set(m.from, { parts: m.parts, units: Array.isArray(m.units) ? m.units.slice(0, MAX_UNITS_IN_REPORT) : [] });
    }
    if (Array.isArray(m.sums)) {
      for (const s of m.sums) if (s && Number.isInteger(s.turn)) this._recordRemoteSum(m.from, s.turn, s.hash);
    }
    this._recordRemoteSum(m.from, m.turn, m.hash);
    if (this.desync && this.desync.turn === m.turn) {
      this._refreshReport();
      this.onDesyncDetail(this.desync);
    }
  }

  _execute(turn, box) {
    const tick = turn * this.turnTicks;
    this.sim.beginTurn?.();
    const logged = [];
    for (const pid of this.playerIds) {
      for (const c of box.get(pid)) {
        this.sim.enqueue({ ...c, playerId: pid }, tick);
        logged.push({ ...c, playerId: pid });
      }
    }
    if (logged.length > 0) {
      this._cmdLog.push({ turn, cmds: logged });
      if (this._cmdLog.length > KEEP_LOG) this._cmdLog.shift();
    }
    for (let i = 0; i < this.turnTicks; i++) this.sim.step();
    this.sim.endTurn?.();
    this._inbox.delete(turn);
    this.turn = turn + 1;
    if (turn % this.checkEvery === 0) {
      let hash;
      if (this.sim.detail) {
        const d = this.sim.detail(true);
        hash = d.total;
        this._localDetail.set(turn, { parts: d.parts, units: d.units });
        this._localDetail.delete(turn - KEEP_DETAIL * this.checkEvery);
      } else {
        hash = this.sim.checksum();
      }
      this._localSums.set(turn, hash);
      this._unsentSums.push({ turn, hash });
      this._compare(turn);
    }
    const old = turn - KEEP_SUMS;
    this._localSums.delete(old);
    this._remoteSums.delete(old);
    this._remoteDetail.delete(old);
    this._adapt();
  }

  _compare(turn) {
    const mine = this._localSums.get(turn);
    const row = this._remoteSums.get(turn);
    if (mine === undefined || !row || this.desync) return;
    for (const [pid, hash] of row) {
      if (hash !== mine) {
        this.desync = { turn, tick: (turn + 1) * this.turnTicks, local: mine, remote: hash, playerId: pid, hashes: {}, divergent: [], majority: null, parts: null, partsDiff: {}, diffUnits: {} };
        this._refreshReport();
        this._announceDesync(turn, mine);
        this.onDesync(this.desync);
        return;
      }
    }
  }

  _announceDesync(turn, hash) {
    const d = this._localDetail.get(turn);
    this.transport.send({
      k: 'desync',
      from: this.localId,
      turn,
      hash,
      parts: d ? d.parts : null,
      units: d ? d.units.slice(0, MAX_UNITS_IN_REPORT) : [],
      sums: this._unsentSums.splice(0)
    });
  }

  /** Recalcula divergentes (maioria), categorias e unidades divergentes com o que já chegou. */
  _refreshReport() {
    const r = this.desync;
    const row = this._remoteSums.get(r.turn) || new Map();
    r.hashes = { [this.localId]: r.local };
    for (const [pid, h] of row) r.hashes[pid] = h;
    const groups = new Map();
    for (const [pid, h] of Object.entries(r.hashes)) {
      if (!groups.has(h)) groups.set(h, []);
      groups.get(h).push(Number(pid));
    }
    let best = null;
    let tie = false;
    for (const [h, pids] of groups) {
      if (!best || pids.length > best.pids.length) {
        best = { h, pids };
        tie = false;
      } else if (pids.length === best.pids.length) tie = true;
    }
    // Com maioria estrita (>= 3 jogadores) os minoritários são os divergentes; sem ela (empate, 2 jogadores), todos que diferem do par local.
    if (best && !tie && Object.keys(r.hashes).length >= 3) {
      r.majority = best.h;
      r.divergent = Object.entries(r.hashes).filter(([, h]) => h !== best.h).map(([pid]) => Number(pid)).sort((a, b) => a - b);
    } else {
      r.majority = null;
      r.divergent = Object.entries(r.hashes).filter(([, h]) => h !== r.local).map(([pid]) => Number(pid)).sort((a, b) => a - b);
    }
    const mine = this._localDetail.get(r.turn);
    r.parts = mine ? mine.parts : null;
    const remote = this._remoteDetail.get(r.turn);
    if (mine && remote) {
      for (const [pid, d] of remote) {
        r.partsDiff[pid] = Object.keys(mine.parts).filter((k) => mine.parts[k] !== d.parts[k]);
        const theirs = new Map(d.units);
        const ours = new Map(mine.units || []);
        const diff = [];
        for (const [id, h] of ours) if (theirs.get(id) !== h) diff.push(id);
        for (const id of theirs.keys()) if (!ours.has(id)) diff.push(id);
        r.diffUnits[pid] = diff.sort((a, b) => a - b).slice(0, 20);
      }
    }
  }
}
