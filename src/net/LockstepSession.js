/**
 * LockstepSession.js — F9-01: lockstep determinístico por turnos (ver docs/09_MULTIPLAYER.md).
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
 * Independente de three.js/DOM/relógio: o chamador decide quando chamar `update()` (setInterval,
 * rAF ou laço de teste). A sim entra por um adaptador `{ enqueue(cmd, tick), step(), checksum() }`.
 */
import { validateCommand } from '../sim/commands.js';

const KEEP_SUMS = 128;

export class LockstepSession {
  /**
   * @param {object} o
   * @param {import('./Transport.js').Transport} o.transport
   * @param {number} o.localId  playerId do par local
   * @param {number[]} o.playerIds  todos os jogadores humanos da partida (inclui o local)
   * @param {{enqueue: Function, step: Function, checksum: Function}} o.sim
   * @param {number} [o.turnTicks=2]  ticks por turno (2 = 100 ms)
   * @param {number} [o.delayTurns=2]  atraso de input em turnos
   * @param {number} [o.checkEvery=1]  checksum a cada N turnos
   * @param {(info: object) => void} [o.onDesync]
   * @param {(info: object) => void} [o.onViolation]  pacote inválido/forjado de um par
   */
  constructor({ transport, localId, playerIds, sim, turnTicks = 2, delayTurns = 2, checkEvery = 1, onDesync, onViolation }) {
    this.transport = transport;
    this.localId = localId;
    this.playerIds = [...playerIds].sort((a, b) => a - b);
    this.sim = sim;
    this.turnTicks = turnTicks;
    this.delayTurns = delayTurns;
    this.checkEvery = checkEvery;
    this.onDesync = onDesync || (() => {});
    this.onViolation = onViolation || (() => {});

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
    /** @type {Map<number, Map<number, number>>} turno → (jogador → hash) */
    this._remoteSums = new Map();
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
    let ran = 0;
    while (ran < maxTurns && !this.desync) {
      const t = this.turn;
      while (this._sentUpTo < t + this.delayTurns) this._sendTurn(this._sentUpTo + 1);
      const box = this._inbox.get(t);
      if (!box || this.playerIds.some((p) => !box.has(p))) {
        this.stalls++;
        break;
      }
      this._execute(t, box);
      ran++;
    }
    return ran;
  }

  /** Último checksum local calculado: `{t, h}` (turno, hash) ou null. */
  get lastChecksum() {
    let best = null;
    for (const [t, h] of this._localSums) if (best === null || t > best.t) best = { t, h };
    return best;
  }

  dispose() {
    this._unsub();
  }

  // --- interno ---

  _sendTurn(turn) {
    const cmds = turn < this.delayTurns ? [] : this._pending.splice(0);
    const last = this.lastChecksum;
    this._storeCmds(turn, this.localId, cmds);
    this._sentUpTo = turn;
    this.transport.send({ k: 'turn', from: this.localId, turn, cmds, sum: last ? { turn: last.t, hash: last.h } : null });
  }

  _storeCmds(turn, pid, cmds) {
    let box = this._inbox.get(turn);
    if (!box) {
      box = new Map();
      this._inbox.set(turn, box);
    }
    if (!box.has(pid)) box.set(pid, cmds);
  }

  _onMessage(m) {
    if (!m || m.k !== 'turn' || !this.playerIds.includes(m.from) || m.from === this.localId) return;
    if (!Number.isInteger(m.turn) || !Array.isArray(m.cmds)) {
      this.onViolation({ from: m.from, reason: 'pacote malformado' });
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
    if (m.sum && Number.isInteger(m.sum.turn)) {
      let row = this._remoteSums.get(m.sum.turn);
      if (!row) {
        row = new Map();
        this._remoteSums.set(m.sum.turn, row);
      }
      row.set(m.from, m.sum.hash);
      this._compare(m.sum.turn);
    }
  }

  _execute(turn, box) {
    const tick = turn * this.turnTicks;
    for (const pid of this.playerIds) {
      for (const c of box.get(pid)) this.sim.enqueue({ ...c, playerId: pid }, tick);
    }
    for (let i = 0; i < this.turnTicks; i++) this.sim.step();
    this._inbox.delete(turn);
    this.turn = turn + 1;
    if (turn % this.checkEvery === 0) {
      this._localSums.set(turn, this.sim.checksum());
      this._compare(turn);
    }
    const old = turn - KEEP_SUMS;
    this._localSums.delete(old);
    this._remoteSums.delete(old);
  }

  _compare(turn) {
    const mine = this._localSums.get(turn);
    const row = this._remoteSums.get(turn);
    if (mine === undefined || !row || this.desync) return;
    for (const [pid, hash] of row) {
      if (hash !== mine) {
        this.desync = { turn, tick: (turn + 1) * this.turnTicks, local: mine, remote: hash, playerId: pid };
        this.onDesync(this.desync);
        return;
      }
    }
  }
}
