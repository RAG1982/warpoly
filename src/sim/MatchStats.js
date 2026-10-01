/**
 * MatchStats.js — F3-09: estatísticas da partida (sem three.js/DOM; testável em Node).
 *
 * Só LÊ eventos do `gm.events` (nunca altera a simulação). Alimenta a tela pós-jogo (F6-07).
 * Por jogador: unidades treinadas/perdidas/mortas, construções feitas/perdidas/destruídas,
 * recursos coletados e gastos, comandos emitidos (APM), pontuação e série temporal (10 s).
 *
 * Contrato mínimo do `gm` (duck typing): `events`, `playerRegistry`, `gameTime`, `allUnits`,
 * `buildings`, `matchConfig.victoryMode`.
 */
import { EVT } from './events.js';

/** Intervalo (s simulados) entre pontos da série temporal e teto de pontos por partida. */
export const SERIES_INTERVAL = 10;
export const SERIES_MAX_POINTS = 720;

/** Fórmula de pontuação (WC2 simplificada). Função pura sobre um objeto de estatísticas. */
export function computeScore(s) {
  const r = s.resources;
  return s.unitsKilled * 10 + s.buildingsDestroyed * 20 + (r.gold + r.wood + r.stone) / 10;
}

function newStats() {
  return {
    unitsTrained: 0,
    unitsLost: 0,
    unitsKilled: 0,
    buildingsBuilt: 0,
    buildingsLost: 0,
    buildingsDestroyed: 0,
    resources: { gold: 0, wood: 0, stone: 0 },
    spent: { gold: 0, wood: 0, stone: 0 },
    commands: 0
  };
}

export class MatchStats {
  /** @param {object} gm  GameManager (ou fake com o contrato mínimo). */
  constructor(gm) {
    this.gm = gm;
    /** @type {Map<number, ReturnType<typeof newStats>>} */
    this.byPlayer = new Map();
    /** @type {Array<object>} */
    this.series = [];
    this._nextSample = SERIES_INTERVAL;
    this._offs = [];

    const on = (type, fn) => this._offs.push(gm.events.on(type, fn));
    on(EVT.UNIT_TRAINED, (e) => {
      const s = this._get(e.ownerId);
      if (s) s.unitsTrained++;
    });
    on(EVT.UNIT_DIED, (e) => {
      if (e.expired) return; // F4-04: fim de invocação não é baixa
      const s = this._get(e.ownerId);
      if (s) s.unitsLost++;
      const k = this._killer(e);
      if (k) k.unitsKilled++;
    });
    on(EVT.BUILDING_COMPLETED, (e) => {
      const s = this._get(e.ownerId);
      if (s) s.buildingsBuilt++;
    });
    on(EVT.BUILDING_DESTROYED, (e) => {
      const s = this._get(e.ownerId);
      if (s) s.buildingsLost++;
      const k = this._killer(e);
      if (k) k.buildingsDestroyed++;
    });
    on(EVT.RESOURCE_GATHERED, (e) => {
      const s = this._get(e.ownerId);
      if (s && s.resources[e.type] !== undefined) s.resources[e.type] += e.amount;
    });
    on(EVT.RESOURCES_SPENT, (e) => {
      const s = this._get(e.ownerId);
      if (!s) return;
      s.spent.gold += e.cost.gold || 0;
      s.spent.wood += e.cost.wood || 0;
      s.spent.stone += e.cost.stone || 0;
    });
    this.reset();
  }

  /** Zera tudo e recria as entradas a partir dos jogadores atuais (chame após recriar o mapa). */
  reset() {
    this.byPlayer.clear();
    this.series.length = 0;
    this._nextSample = SERIES_INTERVAL;
    const reg = this.gm.playerRegistry;
    if (reg) for (const p of reg.players) this.byPlayer.set(p.id, newStats());
  }

  dispose() {
    this._offs.forEach((off) => off());
    this._offs.length = 0;
  }

  _get(ownerId) {
    return this.byPlayer.get(ownerId) || null;
  }

  /** Estatísticas do assassino se o kill conta (jogadores hostis entre si); senão null. */
  _killer(e) {
    const kid = e.killerOwnerId;
    if (kid === null || kid === undefined) return null;
    const reg = this.gm.playerRegistry;
    if (!reg || !reg.isHostile(kid, e.ownerId)) return null;
    // F3-10: o neutro hostil (bandoleiros/acampamentos) não conta para pontuação nem estatística.
    const victim = reg.getPlayer(e.ownerId);
    if (victim && victim.isNeutralHostile) return null;
    return this._get(kid);
  }

  /** Conta um comando emitido por `playerId` (chamado por `gm.issue`). */
  countCommand(playerId) {
    const s = this._get(playerId);
    if (s) s.commands++;
  }

  /** Chamado a cada passo de simulação (após `gameTime += dt`): amostra a série a cada 10 s. */
  update(gameTime) {
    while (gameTime >= this._nextSample) {
      if (this.series.length < SERIES_MAX_POINTS) this._sample(this._nextSample);
      this._nextSample += SERIES_INTERVAL;
    }
  }

  _sample(t) {
    const gm = this.gm;
    const alive = new Map();
    for (const id of this.byPlayer.keys()) alive.set(id, { units: 0, buildings: 0 });
    const units = gm.allUnits || [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const a = !u.isDead && !u.isDying && alive.get(u.ownerId);
      if (a) a.units++;
    }
    const buildings = gm.buildings || [];
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const a = !b.isDead && alive.get(b.ownerId);
      if (a) a.buildings++;
    }
    const players = {};
    for (const [id, s] of this.byPlayer) {
      const a = alive.get(id);
      players[id] = {
        gold: s.resources.gold,
        wood: s.resources.wood,
        stone: s.resources.stone,
        units: a.units,
        buildings: a.buildings,
        kills: s.unitsKilled
      };
    }
    this.series.push({ t, players });
  }

  /** Objeto serializável com o estado atual (não guarda referências internas). */
  snapshot() {
    const gm = this.gm;
    const elapsed = gm.gameTime || 0;
    const minutes = elapsed / 60;
    const reg = gm.playerRegistry;
    const teams = reg ? reg.aliveTeams() : new Set();
    const players = [];
    for (const p of reg ? reg.players : []) {
      const s = this.byPlayer.get(p.id) || newStats();
      players.push({
        id: p.id,
        name: p.name,
        factionId: p.factionId,
        team: p.team,
        isAI: p.isAI,
        defeated: !!p.defeated,
        unitsTrained: s.unitsTrained,
        unitsLost: s.unitsLost,
        unitsKilled: s.unitsKilled,
        buildingsBuilt: s.buildingsBuilt,
        buildingsLost: s.buildingsLost,
        buildingsDestroyed: s.buildingsDestroyed,
        resources: { ...s.resources },
        spent: { ...s.spent },
        commands: s.commands,
        apm: minutes > 0 ? s.commands / minutes : 0,
        score: computeScore(s)
      });
    }
    return {
      elapsed,
      mode: (gm.matchConfig && gm.matchConfig.victoryMode) || 'conquest',
      winnerTeam: teams.size === 1 ? [...teams][0] : null,
      players,
      series: this.series.map((pt) => ({ t: pt.t, players: { ...pt.players } }))
    };
  }
}
