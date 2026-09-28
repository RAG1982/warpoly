/**
 * PlayerRegistry.js — Conjunto de jogadores da partida e regras de diplomacia (F2-01).
 *
 * Hostilidade é decidida por time: jogadores de times diferentes são hostis,
 * do mesmo time são aliados. O dono neutro (NEUTRAL_OWNER_ID = −1: árvores,
 * minas) não é hostil nem aliado de ninguém.
 *
 * Sem three.js nem DOM: testável em Node.
 */
import { Player } from './Player.js';
import { NEUTRAL_OWNER_ID } from './EntityIds.js';

export class PlayerRegistry {
  /** @param {Array<Player|object>} players  instâncias de Player ou specs ({id, factionId, team, …}) */
  constructor(players = []) {
    /** @type {Player[]} */
    this.players = [];
    /** @type {Map<number, Player>} */
    this._byId = new Map();
    /** @type {Player|null} */
    this._local = null;
    /** Matriz de hostilidade por id (ids são inteiros pequenos): _hostile[a][b] === 1. */
    this._hostile = [];
    players.forEach((p) => this.add(p));
  }

  /** @param {Player|object} p */
  add(p) {
    const player = p instanceof Player ? p : new Player(p);
    if (this._byId.has(player.id)) throw new Error(`PlayerRegistry: id duplicado ${player.id}`);
    this.players.push(player);
    this._byId.set(player.id, player);
    this._local = this.players.find((p) => p.isLocal) || this.players.find((p) => !p.isAI) || this.players[0] || null;
    this.rebuildDiplomacy();
    return player;
  }

  /** Recalcula a matriz de hostilidade. Chame de novo se `team` de algum jogador mudar. */
  rebuildDiplomacy() {
    this._hostile = [];
    for (const a of this.players) {
      if (a.id < 0) continue;
      const row = [];
      for (const b of this.players) {
        if (b.id >= 0) row[b.id] = a.id !== b.id && a.team !== b.team ? 1 : 0;
      }
      this._hostile[a.id] = row;
    }
  }

  /** @returns {Player|null} */
  getPlayer(id) {
    return this._byId.get(id) || null;
  }

  /** Jogador controlado por este cliente (o primeiro com isLocal; senão o primeiro humano). */
  get localPlayer() {
    return this._local;
  }

  /**
   * Dois donos são hostis se ambos são jogadores da partida e de times diferentes.
   * Caminho quente (varredura de alvos O(n²)): consulta direta à matriz.
   */
  isHostile(a, b) {
    const row = this._hostile[a];
    return row !== undefined && row[b] === 1;
  }

  /** Mesmo dono ou mesmo time (um jogador é aliado de si mesmo). Neutro não é aliado. */
  isAlly(a, b) {
    if (a === NEUTRAL_OWNER_ID || b === NEUTRAL_OWNER_ID) return false;
    if (a === b) return this._byId.has(a);
    const pa = this._byId.get(a);
    const pb = this._byId.get(b);
    if (!pa || !pb) return false;
    return pa.team === pb.team;
  }

  /** Jogadores ainda não derrotados. */
  get alivePlayers() {
    return this.players.filter((p) => !p.defeated);
  }

  /** Times com pelo menos um jogador não derrotado. */
  aliveTeams() {
    const teams = new Set();
    for (const p of this.players) if (!p.defeated) teams.add(p.team);
    return teams;
  }

  /** Primeiro jogador hostil ao `ownerId` (compatibilidade com o antigo lado 'enemy'). */
  firstHostileOf(ownerId) {
    return this.players.find((p) => this.isHostile(ownerId, p.id)) || null;
  }

  [Symbol.iterator]() {
    return this.players[Symbol.iterator]();
  }

  get size() {
    return this.players.length;
  }
}
