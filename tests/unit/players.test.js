import { describe, it, expect } from 'vitest';
import { Player } from '../../src/sim/Player.js';
import { PlayerRegistry } from '../../src/sim/PlayerRegistry.js';
import { EntityIdAllocator, EntityRegistry, NEUTRAL_OWNER_ID, legacyOwnerId } from '../../src/sim/EntityIds.js';
import {
  createMatchConfig,
  matchConfigFromSearch,
  validateMatchConfig,
  layoutAt,
  MAP_START_SLOTS
} from '../../src/sim/MatchConfig.js';
import { STARTING_RESOURCES } from '../../src/data/index.js';

describe('Player: economia', () => {
  it('começa com os recursos iniciais de src/data', () => {
    const p = new Player({ id: 0 });
    expect(p.resources).toEqual({ ...STARTING_RESOURCES });
    // cópia: mexer no jogador não altera a tabela congelada
    p.resources.gold -= 1;
    expect(STARTING_RESOURCES.gold).toBe(p.resources.gold + 1);
  });

  it('canAfford compara cada recurso cobrado', () => {
    const p = new Player({ id: 0, resources: { wood: 100, gold: 50, stone: 0 } });
    expect(p.canAfford({ wood: 100, gold: 50 })).toBe(true);
    expect(p.canAfford({ wood: 101 })).toBe(false);
    expect(p.canAfford({ gold: 51 })).toBe(false);
    expect(p.canAfford({ stone: 1 })).toBe(false);
    expect(p.canAfford({ gold: 0, time: 30 })).toBe(true); // tempo e zeros não contam
    expect(p.canAfford(null)).toBe(true);
  });

  it('deduct debita e add credita (tipo único ou custo inteiro)', () => {
    const p = new Player({ id: 0, resources: { wood: 100, gold: 50, stone: 20 } });
    p.deduct({ wood: 30, gold: 10, time: 5 });
    expect(p.resources).toEqual({ wood: 70, gold: 40, stone: 20 });
    p.add('stone', 5);
    p.add({ wood: 30, gold: 10, time: 5 }); // reembolso
    expect(p.resources).toEqual({ wood: 100, gold: 50, stone: 25 });
    p.add('mana', 99); // tipo desconhecido é ignorado
    expect(p.resources.mana).toBeUndefined();
    p.addResource('gold', 1); // alias legado
    expect(p.resources.gold).toBe(51);
  });

  it('recalculatePop conta só as entidades do próprio dono', () => {
    const p = new Player({ id: 2 });
    const gm = {
      buildings: [
        { ownerId: 2, isConstructed: true, isDead: false, popGranted: 5 },
        { ownerId: 2, isConstructed: false, isDead: false, popGranted: 5 }, // em obra
        { ownerId: 2, isConstructed: true, isDead: true, popGranted: 5 }, // destruída
        { ownerId: 1, isConstructed: true, isDead: false, popGranted: 5 } // de outro
      ],
      allUnits: [
        { ownerId: 2, isDead: false },
        { ownerId: 2, isDead: true },
        { ownerId: 1, isDead: false }
      ]
    };
    p.recalculatePop(gm);
    expect(p.maxPopulation).toBe(5);
    expect(p.population).toBe(1);
  });
});

describe('EntityIds', () => {
  it('contador monotônico começa em 1 e não repete', () => {
    const ids = new EntityIdAllocator();
    expect([ids.next(), ids.next(), ids.next()]).toEqual([1, 2, 3]);
    expect(ids.last).toBe(3);
    ids.reset();
    expect(ids.next()).toBe(1);
  });

  it('registro dá id/ownerId estáveis, remove e não reaproveita ids', () => {
    const reg = new EntityRegistry();
    const a = reg.register({}, 0);
    const b = reg.register({ ownerId: 1 }); // ownerId já definido é mantido
    const tree = reg.register({}); // sem dono → neutro
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(b.ownerId).toBe(1);
    expect(tree.ownerId).toBe(NEUTRAL_OWNER_ID);
    expect(reg.get(2)).toBe(b);
    expect(reg.size).toBe(3);

    reg.register(a, 5); // registrar de novo não troca id nem dono
    expect(a.id).toBe(1);
    expect(a.ownerId).toBe(0);

    reg.unregister(a);
    expect(reg.has(1)).toBe(false);
    const c = reg.register({}, 0);
    expect(c.id).toBe(4);

    reg.clear(); // reset de mapa: esvazia, mas o contador segue
    expect(reg.size).toBe(0);
    expect(reg.register({}, 0).id).toBe(5);
    reg.clear({ resetIds: true });
    expect(reg.register({}, 0).id).toBe(1);
  });

  it('legacyOwnerId converte o lado antigo', () => {
    expect(legacyOwnerId(3)).toBe(3);
    expect(legacyOwnerId('player')).toBe(0);
    expect(legacyOwnerId('enemy')).toBe(1);
  });
});

describe('PlayerRegistry: diplomacia por time', () => {
  // 0 e 1 no time A; 2 e 3 em times próprios
  const reg = new PlayerRegistry([
    { id: 0, team: 0, isLocal: true },
    { id: 1, team: 0, isAI: true },
    { id: 2, team: 1, isAI: true },
    { id: 3, team: 2, isAI: true }
  ]);

  it('isHostile: times diferentes; nunca consigo, com aliado ou com neutro', () => {
    expect(reg.isHostile(0, 2)).toBe(true);
    expect(reg.isHostile(2, 0)).toBe(true);
    expect(reg.isHostile(2, 3)).toBe(true);
    expect(reg.isHostile(0, 1)).toBe(false);
    expect(reg.isHostile(0, 0)).toBe(false);
    expect(reg.isHostile(0, NEUTRAL_OWNER_ID)).toBe(false);
    expect(reg.isHostile(NEUTRAL_OWNER_ID, 2)).toBe(false);
    expect(reg.isHostile(0, 99)).toBe(false); // dono desconhecido
  });

  it('isAlly: mesmo dono ou mesmo time', () => {
    expect(reg.isAlly(0, 0)).toBe(true);
    expect(reg.isAlly(0, 1)).toBe(true);
    expect(reg.isAlly(0, 2)).toBe(false);
    expect(reg.isAlly(NEUTRAL_OWNER_ID, NEUTRAL_OWNER_ID)).toBe(false);
  });

  it('localPlayer, getPlayer, times vivos e primeiro hostil', () => {
    expect(reg.localPlayer.id).toBe(0);
    expect(reg.getPlayer(3).team).toBe(2);
    expect(reg.getPlayer(42)).toBeNull();
    expect(reg.firstHostileOf(0).id).toBe(2);
    expect([...reg.aliveTeams()].sort()).toEqual([0, 1, 2]);
    reg.getPlayer(2).defeated = true;
    reg.getPlayer(3).defeated = true;
    expect([...reg.aliveTeams()]).toEqual([0]); // só um time vivo → fim de jogo
  });

  it('rejeita id duplicado', () => {
    expect(() => new PlayerRegistry([{ id: 0 }, { id: 0 }])).toThrow();
  });
});

describe('MatchConfig', () => {
  it('padrão = 1×1 humano local no slot NE × IA orc no slot SW', () => {
    const cfg = createMatchConfig({ seed: 7 });
    expect(cfg.seed).toBe(7);
    expect(cfg.players).toHaveLength(2);
    expect(cfg.players[0]).toMatchObject({ id: 0, factionId: 'human', isLocal: true, isAI: false, startSlot: 0 });
    expect(cfg.players[1]).toMatchObject({ id: 1, factionId: 'orc', isLocal: false, isAI: true, startSlot: 1 });
    expect(cfg.players[0].team).not.toBe(cfg.players[1].team);
  });

  it('?faction=orc mantém as posições históricas (orc no SW, humano no NE)', () => {
    const cfg = matchConfigFromSearch('?faction=orc');
    expect(cfg.players[0]).toMatchObject({ factionId: 'orc', isLocal: true, startSlot: 1 });
    expect(cfg.players[1]).toMatchObject({ factionId: 'human', isAI: true, startSlot: 0 });
  });

  it('?ffa=1 cria 3 jogadores em 3 times, 2 IAs', () => {
    const cfg = matchConfigFromSearch('?ffa=1&seed=3');
    expect(cfg.seed).toBe(3);
    expect(cfg.players).toHaveLength(3);
    expect(new Set(cfg.players.map((p) => p.team)).size).toBe(3);
    expect(cfg.players.filter((p) => p.isAI)).toHaveLength(2);
    expect(() => validateMatchConfig(cfg)).not.toThrow();
  });

  it('validateMatchConfig recusa configs inconsistentes', () => {
    const ok = createMatchConfig();
    expect(() => validateMatchConfig({ ...ok, players: [ok.players[0]] })).toThrow();
    expect(() => validateMatchConfig({ ...ok, players: [ok.players[0], { ...ok.players[1], id: 0 }] })).toThrow();
    expect(() =>
      validateMatchConfig({ ...ok, players: [ok.players[0], { ...ok.players[1], isLocal: true }] })
    ).toThrow();
    expect(() =>
      validateMatchConfig({ ...ok, players: [ok.players[0], { ...ok.players[1], team: ok.players[0].team }] })
    ).toThrow();
  });

  it('layoutAt reproduz as posições fixas antigas das duas bases', () => {
    const [ne, sw] = MAP_START_SLOTS.continental.fixed;
    const a = layoutAt(ne);
    expect(a.buildings.map((b) => [b.role, b.x, b.z])).toEqual([
      ['hq', 32, -30],
      ['lumber', 20, -34],
      ['house', 44, -30]
    ]);
    expect(a.units.map((u) => [u.x, u.z])).toEqual([
      [28, -28],
      [36, -32],
      [30, -22],
      [34, -22],
      [24, -20]
    ]);
    const b = layoutAt(sw);
    expect(b.buildings.map((e) => [e.role, e.x, e.z])).toEqual([
      ['hq', -32, 30],
      ['lumber', -20, 34],
      ['house', -44, 30]
    ]);
    expect(b.units.map((u) => [u.x, u.z])).toEqual([
      [-28, 28],
      [-36, 32],
      [-30, 22],
      [-34, 22],
      [-24, 20]
    ]);
  });
});
