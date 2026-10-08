/**
 * RoomState.js — F9-04: estado "de sala" DETERMINÍSTICO do lockstep (sem relógio, sem rede, sem sim).
 *
 * Tudo aqui só muda por (a) operações de sala que viajam DENTRO dos pacotes de turno (`room: [...]`) e
 * são aplicadas no turno em que o pacote executa, em ordem de `playerId`, ou (b) eventos agendados
 * para um turno futuro acordado por todos (`addDrop`). Logo todos os pares têm o mesmo estado em cada
 * turno. Cobre:
 *  - linha do tempo de atividade por jogador (`activeAt`): quem é exigido em cada turno; saída voluntária
 *    (`leave`), queda por timeout (`addDrop`) e retorno (`rejoin`) são eventos {at, active};
 *  - pausa votada: `propose{kind:'pause'|'resume'}` + `vote{yes}`; maioria estrita dos ativos aprova;
 *    a retomada tem contagem regressiva (`countdownTurns`) com a sim ainda congelada.
 */

export const VOTE_KINDS = ['pause', 'resume'];

/** Valida (e normaliza) as operações de sala de um pacote. @returns {object[]|null} null se inválido. */
export function cleanRoomOps(ops) {
  if (ops === undefined) return [];
  if (!Array.isArray(ops) || ops.length > 8) return null;
  const out = [];
  for (const o of ops) {
    if (!o || typeof o !== 'object') return null;
    if (o.op === 'propose' && VOTE_KINDS.includes(o.kind)) out.push({ op: 'propose', kind: o.kind });
    else if (o.op === 'vote' && typeof o.yes === 'boolean') out.push({ op: 'vote', yes: o.yes });
    else if (o.op === 'leave') out.push({ op: 'leave' });
    else if (o.op === 'rejoin' && Number.isInteger(o.pid) && o.pid >= 0) out.push({ op: 'rejoin', pid: o.pid });
    else return null;
  }
  return out;
}

export class RoomState {
  /**
   * @param {number[]} playerIds
   * @param {object} [o]
   * @param {number} [o.voteTurns=50]  validade de uma votação (5 s)
   * @param {number} [o.countdownTurns=30]  contagem da retomada (3 s)
   * @param {number} [o.cooldownTurns=100]  intervalo mínimo após uma proposta recusada (por proponente)
   * @param {number} [o.rejoinLead=12]  turnos entre a operação `rejoin` e o jogador voltar a ser exigido
   */
  constructor(playerIds, { voteTurns = 50, countdownTurns = 30, cooldownTurns = 100, rejoinLead = 12 } = {}) {
    this.playerIds = [...playerIds].sort((a, b) => a - b);
    this.voteTurns = voteTurns;
    this.countdownTurns = countdownTurns;
    this.cooldownTurns = cooldownTurns;
    this.rejoinLead = rejoinLead;
    /** @type {Map<number, {at: number, active: boolean}[]>} */
    this.events = new Map(this.playerIds.map((p) => [p, []]));
    this.paused = false;
    /** turno em que a sim volta a andar (contagem da retomada), ou null */
    this.resumeAt = null;
    /** @type {{kind: string, proposer: number, yes: number[], no: number[], at: number}|null} */
    this.vote = null;
    this._cool = new Map();
    /** avisos para a UI produzidos pela última chamada de `applyOps`/`settle` (esvaziar com `takeNotices`). */
    this._notices = [];
  }

  takeNotices() {
    const n = this._notices;
    this._notices = [];
    return n;
  }

  /** O jogador é exigido (pacote obrigatório) no turno `t`? */
  activeAt(pid, t) {
    const ev = this.events.get(pid);
    if (!ev) return false;
    let active = true;
    for (const e of ev) {
      if (e.at > t) break;
      active = e.active;
    }
    return active;
  }

  activePlayers(t) {
    return this.playerIds.filter((p) => this.activeAt(p, t));
  }

  /** Estado do jogador depois do último evento agendado (inclui eventos futuros). */
  finalState(pid) {
    const ev = this.events.get(pid);
    return !ev || ev.length === 0 ? true : ev[ev.length - 1].active;
  }

  /** Turno da última queda do jogador (se estiver fora no fim da linha do tempo), senão null. */
  droppedAt(pid) {
    const ev = this.events.get(pid);
    if (!ev || ev.length === 0 || ev[ev.length - 1].active) return null;
    return ev[ev.length - 1].at;
  }

  /** Eventos que acontecem exatamente no início do turno `t` (a sessão chama takeover/release da sim). */
  actionsAt(t) {
    const out = [];
    for (const pid of this.playerIds) for (const e of this.events.get(pid)) if (e.at === t) out.push({ pid, active: e.active });
    return out;
  }

  _push(pid, at, active) {
    const ev = this.events.get(pid);
    if (!ev) return false;
    ev.push({ at, active });
    ev.sort((a, b) => a.at - b.at); // estável
    return true;
  }

  /** Queda acordada (timeout): `pid` deixa de ser exigido a partir do turno `at`. */
  addDrop(pid, at) {
    if (!this.events.has(pid) || !this.finalState(pid)) return false;
    this._push(pid, at, false);
    this._notices.push({ type: 'drop', pid, at });
    return true;
  }

  /** Aplica as operações de sala do pacote de `pid` no turno `turn`. */
  applyOps(turn, pid, ops) {
    for (const o of ops) {
      switch (o.op) {
        case 'leave':
          if (this.finalState(pid)) {
            this._push(pid, turn + 1, false);
            this._notices.push({ type: 'leave', pid, at: turn + 1 });
          }
          break;
        case 'rejoin':
          if (o.pid !== pid && this.events.has(o.pid) && !this.finalState(o.pid) && this.droppedAt(o.pid) <= turn + 1) {
            this._push(o.pid, turn + this.rejoinLead, true);
            this._notices.push({ type: 'rejoin', pid: o.pid, at: turn + this.rejoinLead });
          }
          break;
        case 'propose': {
          const ok = !this.vote && turn >= (this._cool.get(pid) ?? 0) && (o.kind === 'pause' ? !this.paused : this.paused && this.resumeAt === null);
          if (ok) {
            this.vote = { kind: o.kind, proposer: pid, yes: [pid], no: [], at: turn };
            this._notices.push({ type: 'voteStart', kind: o.kind, proposer: pid });
          }
          break;
        }
        case 'vote':
          if (this.vote && !this.vote.yes.includes(pid) && !this.vote.no.includes(pid)) {
            (o.yes ? this.vote.yes : this.vote.no).push(pid);
          }
          break;
        default:
      }
    }
  }

  /**
   * Fecha o turno `turn` (depois de todas as operações): conta votos, conclui a contagem da retomada e
   * decide se a sim fica congelada neste turno.
   * @returns {boolean} true = não rodar os passos de sim deste turno
   */
  settle(turn) {
    if (this.paused && this.resumeAt !== null && turn >= this.resumeAt) {
      this.paused = false;
      this.resumeAt = null;
      this._notices.push({ type: 'resumed' });
    }
    const v = this.vote;
    if (v) {
      const act = this.activePlayers(turn);
      const n = act.length;
      const yes = v.yes.filter((p) => act.includes(p)).length;
      const no = v.no.filter((p) => act.includes(p)).length;
      if (yes * 2 > n) {
        this.vote = null;
        if (v.kind === 'pause') {
          this.paused = true;
          this.resumeAt = null;
          this._notices.push({ type: 'paused', by: v.proposer });
        } else {
          this.resumeAt = turn + this.countdownTurns;
          this._notices.push({ type: 'resuming', at: this.resumeAt });
        }
      } else if (no * 2 >= n || turn - v.at >= this.voteTurns) {
        this.vote = null;
        this._cool.set(v.proposer, turn + this.cooldownTurns);
        this._notices.push({ type: 'voteFailed', kind: v.kind, proposer: v.proposer, expired: no * 2 < n });
      }
    }
    return this.paused;
  }

  /** Foto para a UI. */
  info(turn) {
    return {
      paused: this.paused,
      resumeIn: this.paused && this.resumeAt !== null ? Math.max(0, this.resumeAt - turn) : null,
      vote: this.vote ? { kind: this.vote.kind, proposer: this.vote.proposer, yes: [...this.vote.yes], no: [...this.vote.no], turnsLeft: Math.max(0, this.vote.at + this.voteTurns - turn) } : null
    };
  }

  export() {
    return {
      events: this.playerIds.map((p) => [p, this.events.get(p).map((e) => ({ ...e }))]),
      paused: this.paused,
      resumeAt: this.resumeAt,
      vote: this.vote ? { ...this.vote, yes: [...this.vote.yes], no: [...this.vote.no] } : null,
      cool: [...this._cool]
    };
  }

  import(data) {
    this.events = new Map(this.playerIds.map((p) => [p, []]));
    for (const [p, list] of data.events) if (this.events.has(p)) this.events.set(p, list.map((e) => ({ at: e.at, active: !!e.active })));
    this.paused = !!data.paused;
    this.resumeAt = data.resumeAt ?? null;
    this.vote = data.vote ? { ...data.vote, yes: [...data.vote.yes], no: [...data.vote.no] } : null;
    this._cool = new Map(data.cool || []);
    this._notices = [];
  }
}
