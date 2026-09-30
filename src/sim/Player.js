/**
 * Player.js — Jogador da partida (F2-01).
 *
 * Um Player por participante (humano local, IA, futuramente remoto). Guarda a
 * economia (recursos e população) e as pesquisas concluídas, que antes viviam
 * duplicadas em GameManager (jogador) e AIDirector (IA).
 *
 * Sem three.js nem DOM: testável em Node.
 */
import { STARTING_RESOURCES } from '../data/index.js';
import { EVT } from './events.js';

export const RESOURCE_TYPES = Object.freeze(['wood', 'gold', 'stone']);

export class Player {
  /**
   * @param {object} opts
   * @param {number} opts.id                 id estável (0, 1, 2…); é o `ownerId` das entidades
   * @param {string} [opts.name]
   * @param {'human'|'orc'} [opts.factionId]
   * @param {string} [opts.color]            cor do time (CSS hex)
   * @param {number} [opts.team]             jogadores do mesmo time são aliados
   * @param {boolean} [opts.isAI]
   * @param {boolean} [opts.isLocal]         jogador controlado por este cliente (HUD, seleção, névoa)
   * @param {number} [opts.startSlot]        posição inicial no mapa (MatchConfig)
   * @param {{wood:number,gold:number,stone:number}} [opts.resources]
   */
  constructor({
    id,
    name = `Jogador ${id + 1}`,
    factionId = 'human',
    color = '#2563eb',
    team = id,
    isAI = false,
    isLocal = false,
    startSlot = id,
    resources = STARTING_RESOURCES
  } = {}) {
    if (typeof id !== 'number') throw new Error('Player: id numérico obrigatório');
    this.id = id;
    this.name = name;
    this.factionId = factionId;
    this.color = color;
    this.team = team;
    this.isAI = isAI;
    this.isLocal = isLocal;
    this.startSlot = startSlot;
    /** Posição {x, z} do HQ inicial, resolvida pelo GameManager a partir do slot. */
    this.startPos = null;

    this.resources = { wood: 0, gold: 0, stone: 0, ...resources };
    this.population = 0;
    this.maxPopulation = 0;

    /** @type {Set<string>} ids de pesquisas concluídas (forja) */
    this.researchedUpgrades = new Set();
    /** F3-07: nível concluído por pesquisa (0 = nada). `researchedUpgrades` é derivado (nível >= 1). */
    this.researchLevels = new Map();
    this.defeated = false;
    /** F3-09: barramento de eventos (definido pelo GameManager); `deduct` emite RESOURCES_SPENT. */
    this.events = null;
  }

  /** Nível concluído da pesquisa `id` (0 se nenhum). */
  getResearchLevel(id) {
    return this.researchLevels.get(id) || 0;
  }

  /** Registra a conclusão do próximo nível de `id`; mantém `researchedUpgrades` derivado. */
  setResearchLevel(id, level) {
    this.researchLevels.set(id, level);
    if (level >= 1) this.researchedUpgrades.add(id);
  }

  /** @param {{wood?:number,gold?:number,stone?:number}} cost */
  canAfford(cost) {
    if (!cost) return true;
    for (const r of RESOURCE_TYPES) {
      if (cost[r] && this.resources[r] < cost[r]) return false;
    }
    return true;
  }

  /** Debita o custo (não checa saldo: chame canAfford antes). */
  deduct(cost) {
    if (!cost) return;
    for (const r of RESOURCE_TYPES) {
      if (cost[r]) this.resources[r] -= cost[r];
    }
    if (this.events) {
      this.events.emit(EVT.RESOURCES_SPENT, {
        ownerId: this.id,
        cost: { gold: cost.gold || 0, wood: cost.wood || 0, stone: cost.stone || 0 }
      });
    }
  }

  /**
   * Credita recursos. Aceita `add('gold', 10)` ou `add({gold: 10, wood: 5})` (reembolso de custo).
   * Tipos desconhecidos são ignorados (mesmo comportamento do antigo addResource).
   */
  add(typeOrCost, amount) {
    if (typeOrCost && typeof typeOrCost === 'object') {
      for (const r of RESOURCE_TYPES) {
        if (typeOrCost[r]) this.resources[r] += typeOrCost[r];
      }
      return;
    }
    if (this.resources[typeOrCost] !== undefined) {
      this.resources[typeOrCost] += amount;
    }
  }

  /** Alias com o nome legado (GameManager/AIDirector.addResource). */
  addResource(type, amount) {
    this.add(type, amount);
  }

  /**
   * Recalcula população (unidades vivas) e teto (construções prontas que dão pop)
   * a partir das entidades do GameManager que pertencem a este jogador.
   * @param {{buildings: Array, allUnits?: Array}} gm
   */
  recalculatePop(gm) {
    let cap = 0;
    const buildings = gm.buildings || [];
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.ownerId === this.id && b.isConstructed && !b.isDead) cap += b.popGranted || 0;
    }
    let pop = 0;
    const units = gm.allUnits || [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.ownerId === this.id && !u.isDead) pop++;
    }
    this.maxPopulation = cap;
    this.population = pop;
  }
}
