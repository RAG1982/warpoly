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
 * F9-04 (robustez, ver docs/09_MULTIPLAYER.md §12):
 *  - reenvio/ack: cada pacote carrega `ack` (próximo turno do remetente); pacotes de todos ficam num
 *    histórico (`HIST_KEEP` turnos) e qualquer par responde a `need{turn,to,pids}` (NACK em stall) e
 *    reenvia os próprios pacotes a quem não avança (`_resendOwn`);
 *  - `RoomState` (src/net/RoomState.js): pausa votada, saída voluntária, queda por timeout e retorno —
 *    operações de sala viajam DENTRO dos pacotes (`room:[...]`), logo valem no mesmo turno em todos;
 *  - queda por timeout: cada sobrevivente vota `dropvote{pid,next}` (próximo turno que executaria); com
 *    todos os votos, a queda vale no turno `max(next)` e a sim troca o jogador para IA (`sim.takeover`);
 *  - retorno: o jogador removido pede `snapreq`; o menor id ativo envia um snapshot (SaveGame-like,
 *    em pedaços) validado por checksum; depois a operação `rejoin` devolve o controle (`sim.release`);
 *  - chat e pings de mapa (`chat`, `mpin`) trafegam fora da sim e nunca entram no checksum.
 *
 * Independente de three.js/DOM: o relógio entra por `now()` (padrão `performance.now`). A sim entra
 * por um adaptador `{ enqueue(cmd, tick), step(), checksum(), detail?(), beginTurn?(), endTurn?() }`.
 */
import { validateCommand } from '../sim/commands.js';
import { RoomState, cleanRoomOps } from './RoomState.js';

const KEEP_SUMS = 128;
const KEEP_DETAIL = 6;
const KEEP_LOG = 100;
const MAX_AHEAD = 64; // pacote de turno > turn + MAX_AHEAD = lixo/hostil
const MAX_UNITS_IN_REPORT = 1500;
const HIST_KEEP = 1200; // turnos de pacotes guardados para reenvio/recuperação (2 min)
const NEED_SPAN = 32; // turnos por pedido de reenvio
const SNAP_CHUNK = 12000; // caracteres por pedaço de snapshot (< limite de mensagem do DataChannel)
const SNAP_MAX_CHUNKS = 400;
const CHAT_MAX = 200;

/** Troca caracteres de controle por espaço (chat vem de pares não confiáveis). */
function cleanText(text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0);
    out += c < 32 || c === 127 ? ' ' : ch;
  }
  return out;
}

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
   * @param {number} [o.dropTimeoutMs=10000]  stall de um jogador por este tempo => voto de queda (vira IA)
   * @param {number} [o.nackEveryMs=300]  intervalo entre pedidos de reenvio durante um stall
   * @param {number} [o.resendEveryMs=500]
   * @param {boolean} [o.autoRejoin=true]  jogador removido pede snapshot sozinho
   * @param {object} [o.room]  opções do RoomState (voteTurns, countdownTurns, cooldownTurns, rejoinLead)
   * @param {(info: object) => void} [o.onRoomEvent]  pausa/votação/queda/retorno (só apresentação)
   * @param {(m: {from: number, text: string, team: boolean, local?: boolean}) => void} [o.onChat]
   * @param {(m: {from: number, x: number, z: number, kind: string, team: boolean, local?: boolean}) => void} [o.onMapPing]
   * @param {(pid: number) => boolean} [o.isAlly]  aliado do par local? (filtra chat/ping `team`)
   */
  constructor({
    transport, localId, playerIds, sim, turnTicks = 2, delayTurns = 2, adaptive = false, minDelay = 2, maxDelay = 6, lowerAfter = 30,
    pingEveryMs = 500, checkEvery = 1, now = () => performance.now(), turnMs, onDesync, onDesyncDetail, onViolation, onDelayChange,
    dropTimeoutMs = 10000, nackEveryMs = 300, resendEveryMs = 500, autoRejoin = true, room, onRoomEvent, onChat, onMapPing, isAlly
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
    this.dropTimeoutMs = dropTimeoutMs;
    this.nackEveryMs = nackEveryMs;
    this.resendEveryMs = resendEveryMs;
    this.autoRejoin = autoRejoin;
    this.onRoomEvent = onRoomEvent || (() => {});
    this.onChat = onChat || (() => {});
    this.onMapPing = onMapPing || (() => {});
    this.isAlly = isAlly || (() => true);
    this.room = new RoomState(this.playerIds, room);
    /** Tick da sim (= ticks já simulados); congela em pausa. Em jogo normal vale `turn * turnTicks`. */
    this.simTick = 0;
    /** `{at}` se os outros pares nos removeram (viramos IA); null caso contrário. */
    this.removed = null;
    this._pendingRoom = [];
    this._hist = new Map();
    this._peerAck = new Map();
    this._ackSeen = new Map();
    this._lastNack = -Infinity;
    this._lastResend = -Infinity;
    this._missSince = new Map();
    this._dropVotes = new Map();
    this._myDrop = new Map();
    this._dropFreeze = null;
    this._notifiedRemoved = new Map();
    this._snapReq = null;
    this._snapIn = null;
    this._snapOutAt = new Map();
    this._catchup = false;
    this._maxSeen = 0;
    this._chatSeen = new Map();
    this._bye = new Set();

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
    if (this.removed || !this.room.activeAt(this.localId, this.turn + this.delayTurns)) return; // fora da partida (IA no controle)
    this._pending.push(cmd);
  }

  // --- F9-04: pausa votada, saída, chat e pings (API para a UI) ---

  /** Aviso imediato de que vamos embora (aba fechada/saída): os outros pulam o timeout e passam o jogador à IA. */
  bye() {
    this.transport.send({ k: 'bye', from: this.localId });
  }

  /** Página recarregada no meio da partida: a sim local está zerada; pede o snapshot a um par saudável. */
  beginResync() {
    this.removed = { at: 0 };
    this._requestSnapshot();
  }

  /** Propõe pausar (ou retomar, se já pausado). A votação vale no turno em que o pacote executa. */
  proposePause() {
    this._pendingRoom.push({ op: 'propose', kind: this.room.paused ? 'resume' : 'pause' });
  }

  /** Vota na proposta em andamento. */
  vote(yes) {
    this._pendingRoom.push({ op: 'vote', yes: !!yes });
  }

  /** Sai da partida: depois do turno em que o pacote executa, o jogador vira IA em todos os pares. */
  leave() {
    this._pendingRoom.push({ op: 'leave' });
  }

  /** Chat in-game (fora da sim). `team` = só aliados. Devolve o texto enviado (ou null). */
  sendChat(text, { team = false } = {}) {
    const t = cleanText(text).trim().slice(0, CHAT_MAX);
    if (!t) return null;
    this.transport.send({ k: 'chat', from: this.localId, text: t, team: !!team });
    this.onChat({ from: this.localId, text: t, team: !!team, local: true });
    return t;
  }

  /** Ping no mapa (fora da sim, não afeta o checksum). `team` = só aliados veem. */
  sendMapPing(x, z, { kind = 'attention', team = true } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const msg = { k: 'mpin', from: this.localId, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, kind: String(kind).slice(0, 12), team: !!team };
    this.transport.send(msg);
    this.onMapPing({ ...msg, local: true });
    return true;
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
    this._maintenance();
    let ran = 0;
    while (ran < maxTurns && !this.desync && !this.removed && !this._snapIn) {
      const t = this.turn;
      this._cancelStaleDropVotes(t);
      if (this._dropFreeze !== null && t >= this._dropFreeze) break; // votamos a queda de alguém: esperar o acordo
      while (this._sentUpTo < t + this.delayTurns) this._sendTurn(this._sentUpTo + 1);
      const box = this._inbox.get(t);
      const missing = this._required(t).filter((p) => !box || !box.has(p));
      if (missing.length > 0) {
        this.stalls++;
        this._waiting = missing;
        const nowT = this.now();
        if (this._stallSince === null) this._stallSince = nowT;
        for (const p of missing) if (!this._missSince.has(p)) this._missSince.set(p, nowT);
        for (const p of [...this._missSince.keys()]) if (!missing.includes(p)) this._missSince.delete(p);
        this._onStall(t, missing, nowT);
        break;
      }
      this._waiting = [];
      this._stallSince = null;
      this._missSince.clear();
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
      desync: this.desync,
      simTick: this.simTick,
      active: this.room.activePlayers(this.turn),
      dropped: this.playerIds.filter((p) => !this.room.activeAt(p, this.turn)),
      dropping: [...this._myDrop.keys()],
      removed: this.removed,
      resyncing: !!this._snapIn || (!!this._snapReq && !!this.removed),
      catchingUp: this._catchup,
      pause: this.room.info(this.turn)
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
    this._sentUpTo = turn;
    // Fora da partida (removido, ou ainda observando até o `rejoin` valer): não enviamos pacote de turno.
    if (this.removed || !this.room.activeAt(this.localId, turn)) return;
    const cmds = turn < this._initialDelay ? [] : this._pending.splice(0);
    const room = turn < this._initialDelay ? [] : this._pendingRoom.splice(0);
    this._storeCmds(turn, this.localId, cmds, room);
    this.transport.send({ k: 'turn', from: this.localId, turn, cmds, room, sums: this._unsentSums.splice(0), ack: this.turn });
  }

  _storeCmds(turn, pid, cmds, room = []) {
    let box = this._inbox.get(turn);
    if (!box) {
      box = new Map();
      this._inbox.set(turn, box);
    }
    if (!box.has(pid)) box.set(pid, { cmds, room });
  }

  /** Jogadores cujo pacote é obrigatório no turno `t`. */
  _required(t) {
    return this.room.activePlayers(t);
  }

  /** Pacote (já guardado ou executado) de `pid` no turno `turn`, no formato do fio; null se não temos. */
  _packetFor(pid, turn) {
    const e = this._inbox.get(turn)?.get(pid) || this._hist.get(turn)?.get(pid);
    return e ? { k: 'turn', from: pid, turn, cmds: e.cmds, room: e.room, ack: this.turn, relay: pid !== this.localId } : null;
  }

  // --- F9-04: manutenção periódica (reenvio, ack, votos de queda, pedido de snapshot) ---

  _maintenance() {
    const t = this.now();
    if (t - this._lastResend >= this.resendEveryMs) {
      this._lastResend = t;
      this._resendOwn(t);
      for (const [pid, v] of this._myDrop) this.transport.send({ k: 'dropvote', from: this.localId, pid, next: v });
      if (this._snapReq && this.removed && t - this._snapReq.at >= 2000) this._sendSnapReq();
    }
  }

  /** Reenvia nossos pacotes a quem não avança (ack parado): cobre perdas em reconexão. */
  _resendOwn(t) {
    for (const p of this.room.activePlayers(this.turn)) {
      if (p === this.localId) continue;
      const ack = this._peerAck.get(p);
      if (ack === undefined) continue;
      const seen = this._ackSeen.get(p);
      if (!seen || seen.ack !== ack) {
        this._ackSeen.set(p, { ack, at: t });
        continue;
      }
      if (t - seen.at < this.resendEveryMs || ack >= this._sentUpTo) continue;
      for (let k = ack; k <= Math.min(this._sentUpTo, ack + NEED_SPAN); k++) {
        const pk = this._packetFor(this.localId, k);
        if (pk) this.transport.send(pk);
      }
    }
  }

  _onStall(t, missing, nowT) {
    if (nowT - this._lastNack >= this.nackEveryMs) {
      this._lastNack = nowT;
      this.transport.send({ k: 'need', from: this.localId, turn: t, to: t + (this._catchup ? NEED_SPAN : 8), pids: missing });
    }
    for (const p of missing) {
      if (p !== this.localId && nowT - this._missSince.get(p) >= (this._bye.has(p) ? 0 : this.dropTimeoutMs)) this._castDropVote(p);
    }
    // Recuperação após snapshot que não anda (histórico dos outros já expirou): pede outro.
    if (this._catchup && this._stallSince !== null && nowT - this._stallSince > 8000 && !this._snapReq) {
      this.removed = { at: this.turn };
      this._requestSnapshot();
    }
  }

  _castDropVote(pid) {
    if (this._myDrop.has(pid) || !this.room.finalState(pid)) return;
    this._myDrop.set(pid, this.turn);
    this._dropFreeze = Math.min(this._dropFreeze ?? Infinity, this.turn);
    this._recordDropVote(pid, this.localId, this.turn);
    this.transport.send({ k: 'dropvote', from: this.localId, pid, next: this.turn });
  }

  _recordDropVote(pid, from, next) {
    if (!this.room.finalState(pid)) {
      const at = this.room.droppedAt(pid);
      if (at !== null) this.transport.send({ k: 'dropdone', from: this.localId, pid, at });
      return;
    }
    let m = this._dropVotes.get(pid);
    if (!m) {
      m = new Map();
      this._dropVotes.set(pid, m);
    }
    if (!m.has(from)) m.set(from, next);
    const need = this.room.activePlayers(this.turn).filter((p) => p !== pid);
    if (need.length > 0 && need.every((p) => m.has(p))) {
      const at = Math.max(...need.map((p) => m.get(p)));
      this._applyDrop(pid, at);
    }
  }

  /** O pacote que faltava chegou (atrasado ou por relé) e ninguém mais votou: desistimos da queda. */
  _cancelStaleDropVotes(t) {
    for (const pid of [...this._myDrop.keys()]) {
      if (!this._inbox.get(t)?.has(pid)) continue;
      const m = this._dropVotes.get(pid);
      if (m && m.size > 1) continue;
      this._myDrop.delete(pid);
      m?.delete(this.localId);
      this._dropFreeze = this._myDrop.size > 0 ? Math.min(...this._myDrop.values()) : null;
      this.transport.send({ k: 'dropcancel', from: this.localId, pid });
    }
  }

  _applyDrop(pid, at) {
    if (!this.room.addDrop(pid, at)) return;
    this._dropVotes.delete(pid);
    this._myDrop.delete(pid);
    this._bye.delete(pid);
    this._dropFreeze = this._myDrop.size > 0 ? Math.min(...this._myDrop.values()) : null;
    this._missSince.clear();
    this._flushNotices();
    this.transport.send({ k: 'dropdone', from: this.localId, pid, at });
  }

  _flushNotices() {
    for (const n of this.room.takeNotices()) this.onRoomEvent({ ...n, turn: this.turn });
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
    // Quem foi removido e reaparece (reconexão): avisa, para ele pedir o snapshot (no máx. 1 aviso/s por jogador).
    if (!this.removed && m.k !== 'dropped' && m.k !== 'dropdone' && !m.relay) {
      const dAt = this.room.droppedAt(m.from);
      if (dAt !== null) {
        const nowT = this.now();
        if (nowT - (this._notifiedRemoved.get(m.from) ?? -Infinity) > 1000) {
          this._notifiedRemoved.set(m.from, nowT);
          this.transport.send({ k: 'dropped', from: this.localId, pid: m.from, at: dAt });
        }
      }
    }
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
      case 'need':
        this._onNeed(m);
        return;
      case 'dropvote':
        if (Number.isInteger(m.pid) && Number.isInteger(m.next) && this.playerIds.includes(m.pid) && m.pid !== m.from) this._recordDropVote(m.pid, m.from, m.next);
        return;
      case 'dropcancel':
        if (Number.isInteger(m.pid) && this.room.finalState(m.pid)) this._dropVotes.get(m.pid)?.delete(m.from);
        return;
      case 'dropdone':
        if (Number.isInteger(m.pid) && Number.isInteger(m.at) && this.playerIds.includes(m.pid) && m.at >= this.turn && m.pid !== this.localId) this._applyDrop(m.pid, m.at);
        return;
      case 'dropped':
        if (m.pid === this.localId && Number.isInteger(m.at)) this._onRemoved(m.at);
        return;
      case 'bye':
        this._bye.add(m.from);
        return;
      case 'snapreq':
        this._onSnapReq(m);
        return;
      case 'snap':
        this._onSnapChunk(m);
        return;
      case 'snapok':
        this._onSnapOk(m);
        return;
      case 'chat':
        this._onChatMsg(m);
        return;
      case 'mpin':
        this._onPingMsg(m);
        return;
      default:
    }
  }

  /** Pedido de reenvio de pacotes (NACK): respondemos com o que temos do histórico. */
  _onNeed(m) {
    if (!Number.isInteger(m.turn) || !Number.isInteger(m.to) || !Array.isArray(m.pids)) return;
    const to = Math.min(m.to, m.turn + NEED_SPAN);
    for (let t = Math.max(0, m.turn); t <= to; t++) {
      for (const pid of m.pids) {
        if (!Number.isInteger(pid) || !this.playerIds.includes(pid) || pid === m.from) continue;
        const pk = this._packetFor(pid, t);
        if (pk) this.transport.send(pk);
      }
    }
  }

  _onChatMsg(m) {
    if (typeof m.text !== 'string') return;
    const now = this.now();
    const rec = this._chatSeen.get(m.from) || { at: now, n: 0 };
    if (now - rec.at > 1000) {
      rec.at = now;
      rec.n = 0;
    }
    if (++rec.n > 5) return; // limite por remetente: 5 mensagens/s
    this._chatSeen.set(m.from, rec);
    const team = !!m.team;
    if (team && !this.isAlly(m.from)) return;
    this.onChat({ from: m.from, text: cleanText(m.text).slice(0, CHAT_MAX), team });
  }

  _onPingMsg(m) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.z) || typeof m.kind !== 'string') return;
    const team = !!m.team;
    if (team && !this.isAlly(m.from)) return;
    this.onMapPing({ from: m.from, x: m.x, z: m.z, kind: m.kind.slice(0, 12), team });
  }

  // --- F9-04: removido (viramos IA) e retorno por snapshot ---

  _onRemoved(at) {
    if (this.removed) return;
    this.removed = { at };
    this._pending.length = 0;
    this._pendingRoom.length = 0;
    this.onRoomEvent({ type: 'removed', at, turn: this.turn });
    if (this.autoRejoin) this._requestSnapshot();
  }

  /** Pede o estado atual a um par saudável (repetido a cada 2 s até chegar). */
  _requestSnapshot() {
    if (this._snapIn) return;
    this._snapReq = { at: -Infinity, tries: this._snapReq ? this._snapReq.tries : 0 };
    this._sendSnapReq();
  }

  _sendSnapReq() {
    this._snapReq.at = this.now();
    this._snapReq.tries++;
    this.transport.send({ k: 'snapreq', from: this.localId });
  }

  /** Servidor de snapshot = menor id ativo (excluindo o pedinte). Monta e envia em pedaços. */
  _onSnapReq(m) {
    if (this.room.droppedAt(m.from) === null) return; // só quem foi removido precisa de snapshot
    const server = this.room.activePlayers(this.turn).filter((p) => p !== m.from)[0];
    if (server !== this.localId || typeof this.sim.captureSnapshot !== 'function') return;
    const now = this.now();
    if (now - (this._snapOutAt.get(m.from) ?? -Infinity) < 1500) return;
    this._snapOutAt.set(m.from, now);
    const payload = JSON.stringify({ turn: this.turn, simTick: this.simTick, room: this.room.export(), data: this.sim.captureSnapshot() });
    const n = Math.ceil(payload.length / SNAP_CHUNK);
    const id = `${this.localId}:${this.turn}:${Math.floor(now)}`;
    for (let i = 0; i < n; i++) this.transport.send({ k: 'snap', from: this.localId, to: m.from, id, i, n, d: payload.slice(i * SNAP_CHUNK, (i + 1) * SNAP_CHUNK) });
  }

  _onSnapChunk(m) {
    if (m.to !== this.localId || !this.removed || typeof m.d !== 'string' || typeof m.id !== 'string') return;
    if (this.sim.ready && !this.sim.ready()) return; // a partida local ainda está sendo recriada: o servidor reenvia
    if (!Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n < 1 || m.n > SNAP_MAX_CHUNKS || m.i < 0 || m.i >= m.n) return;
    if (!this._snapIn || this._snapIn.id !== m.id) this._snapIn = { id: m.id, n: m.n, parts: new Map(), from: m.from };
    this._snapIn.parts.set(m.i, m.d);
    if (this._snapIn.parts.size < this._snapIn.n) return;
    const { id, n, parts, from } = this._snapIn;
    let text = '';
    for (let i = 0; i < n; i++) text += parts.get(i);
    this._snapIn = null;
    let snap = null;
    try {
      snap = JSON.parse(text);
    } catch {
      snap = null;
    }
    this._applySnapshot(snap, id, from);
  }

  _applySnapshot(snap, id, from) {
    const fail = (reason) => {
      this.onViolation({ from, reason: `snapshot inválido: ${reason}` });
      this._snapReq = { at: this.now(), tries: this._snapReq ? this._snapReq.tries : 1 }; // tenta de novo no próximo ciclo
    };
    if (!snap || !Number.isInteger(snap.turn) || !Number.isInteger(snap.simTick) || !snap.room || !snap.data || typeof this.sim.restoreSnapshot !== 'function') return fail('formato');
    let res;
    try {
      res = this.sim.restoreSnapshot(snap.data);
    } catch (err) {
      return fail(err.message);
    }
    if (!res || !res.ok) return fail('checksum não bate');
    this.room.import(snap.room);
    this.turn = snap.turn;
    this.simTick = snap.simTick;
    this._sentUpTo = snap.turn - 1;
    this._inbox.clear();
    this._hist.clear();
    this._localSums.clear();
    this._localDetail.clear();
    this._remoteSums.clear();
    this._remoteDetail.clear();
    this._unsentSums = [];
    this._pending.length = 0;
    this._pendingRoom.length = 0;
    this._dropVotes.clear();
    this._myDrop.clear();
    this._dropFreeze = null;
    this._missSince.clear();
    this._stallSince = null;
    this._waiting = [];
    this._acc = 0;
    this.desync = null;
    this.removed = null;
    this._snapReq = null;
    this._catchup = true;
    this.transport.send({ k: 'snapok', from: this.localId, turn: snap.turn });
    this.onRoomEvent({ type: 'resynced', turn: snap.turn, id });
  }

  /** O pedinte carregou o snapshot: pedimos (via pacote, para valer em todos) que ele volte a ser humano. */
  _onSnapOk(m) {
    if (!Number.isInteger(m.turn)) return;
    const server = this.room.activePlayers(this.turn).filter((p) => p !== m.from)[0];
    if (server !== this.localId || this.room.finalState(m.from)) return;
    if (!this._pendingRoom.some((o) => o.op === 'rejoin' && o.pid === m.from)) this._pendingRoom.push({ op: 'rejoin', pid: m.from });
  }

  _onTurn(m) {
    if (!Number.isInteger(m.turn) || !Array.isArray(m.cmds)) {
      this.onViolation({ from: m.from, reason: 'pacote malformado' });
      return;
    }
    if (m.turn > this._maxSeen) this._maxSeen = m.turn;
    if (!m.relay && Number.isInteger(m.ack) && m.ack > (this._peerAck.get(m.from) ?? -1)) this._peerAck.set(m.from, m.ack);
    if (m.turn > this.turn + MAX_AHEAD) {
      // Remetente legítimo muito à frente de nós (estamos atrasados/reconectando): ignora sem alarde; o NACK recupera.
      if (!(Number.isInteger(m.ack) && m.turn <= m.ack + 16)) this.onViolation({ from: m.from, turn: m.turn, reason: 'turno muito à frente' });
      return;
    }
    const roomOps = cleanRoomOps(m.room);
    if (roomOps === null) {
      this.onViolation({ from: m.from, turn: m.turn, reason: 'operação de sala inválida' });
      return;
    }
    if (m.turn >= this.turn && !this.removed) {
      for (const c of m.cmds) {
        const v = validateCommand(c);
        if (!v.ok || c.playerId !== m.from) {
          this.onViolation({ from: m.from, turn: m.turn, reason: v.ok ? 'comando em nome de outro jogador' : v.reason });
          return;
        }
      }
      this._storeCmds(m.turn, m.from, m.cmds, roomOps); // duplicata do mesmo turno é ignorada (vale o primeiro)
    }
    if (Array.isArray(m.sums)) {
      for (const s of m.sums) if (s && Number.isInteger(s.turn)) this._recordRemoteSum(m.from, s.turn, s.hash);
    }
  }

  _recordRemoteSum(pid, turn, hash) {
    if (!this.room.activeAt(pid, turn) || this.removed) return; // quem está fora (IA no lugar) não participa do checksum
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
    const tick = this.simTick;
    this.sim.beginTurn?.();
    // 1) eventos agendados para este turno: queda => IA assume; retorno => humano reassume (mesmo tick em todos)
    for (const a of this.room.actionsAt(turn)) {
      if (a.active) this.sim.release?.(a.pid);
      else this.sim.takeover?.(a.pid);
      this.onRoomEvent({ type: a.active ? 'release' : 'takeover', pid: a.pid, turn, tick });
    }
    const req = this._required(turn);
    // 2) operações de sala (pausa, saída, retorno) na ordem de playerId
    for (const pid of req) this.room.applyOps(turn, pid, box.get(pid).room || []);
    // 3) comandos
    const logged = [];
    for (const pid of req) {
      for (const c of box.get(pid).cmds) {
        this.sim.enqueue({ ...c, playerId: pid }, tick);
        logged.push({ ...c, playerId: pid });
      }
    }
    if (logged.length > 0) {
      this._cmdLog.push({ turn, cmds: logged });
      if (this._cmdLog.length > KEEP_LOG) this._cmdLog.shift();
    }
    // 4) votação/pausa: turno congelado = nenhum passo de sim (todos decidem igual: estado vem dos pacotes)
    const frozen = this.room.settle(turn);
    if (!frozen) {
      for (let i = 0; i < this.turnTicks; i++) {
        this.sim.step();
        this.simTick++;
      }
    }
    this.sim.endTurn?.();
    this._hist.set(turn, box);
    this._hist.delete(turn - HIST_KEEP);
    this._inbox.delete(turn);
    this.turn = turn + 1;
    if (this._catchup && this.turn >= this._maxSeen - this.delayTurns - 2) this._catchup = false;
    this._flushNotices();
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
