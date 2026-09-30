/**
 * F2-01: fila de treino, pesquisa e escolha de alvo usam o dono da entidade (ownerId),
 * não mais o lado fixo 'player'/'enemy'.
 *
 * Building/Unit dependem de three.js e dos modelos procedurais no construtor; aqui usamos
 * os métodos reais do protótipo sobre objetos mínimos (sem mesh/DOM), como em
 * tools/check-data-parity.mjs.
 */
import { describe, it, expect } from 'vitest';
import { Building } from '../../src/entities/Building.js';
import { Unit } from '../../src/entities/Unit.js';
import { PlayerRegistry } from '../../src/sim/PlayerRegistry.js';
import { SpatialGrid } from '../../src/sim/SpatialGrid.js';
import { UNIT_TRAIN_CONFIG, UPGRADE_CONFIG, FORGE_UPGRADES } from '../../src/data/index.js';

/**
 * GameManager mínimo: jogadores + construções + as consultas usadas por Building/Unit.
 * F1-06: `unitGrid`/`blockerGrid` reais (as buscas de alvo hostil de Unit/Building passam
 * a consultar a grade espacial em vez de varrer `allUnits`/`buildings`).
 */
function makeGm(specs) {
  const registry = new PlayerRegistry(specs);
  const gm = {
    buildings: [],
    allUnits: [],
    unitGrid: new SpatialGrid(),
    blockerGrid: new SpatialGrid(),
    localPlayerId: registry.localPlayer.id,
    getPlayer: (id) => registry.getPlayer(id),
    isHostile: (a, b) => registry.isHostile(a, b),
    isAlly: (a, b) => registry.isAlly(a, b),
    isUpgradeResearched: (id, ownerId) => registry.getPlayer(ownerId).getResearchLevel(id) >= 1,
    isUpgradeResearching: (id, ownerId) =>
      gm.buildings.some((b) => b.ownerId === ownerId && b.currentResearch && b.currentResearch.id === id)
  };
  return gm;
}

let _nextEntityId = 1;

function makeBuilding(gm, type, ownerId, extra = {}) {
  const b = Object.assign(Object.create(Building.prototype), {
    id: _nextEntityId++,
    type,
    ownerId,
    queue: [],
    currentResearch: null,
    isConstructed: true,
    isDead: false,
    collisionRadius: 3.0,
    gameManager: gm,
    ...extra
  });
  gm.buildings.push(b);
  if (b.mesh) gm.blockerGrid.insert(b, b.mesh.position.x, b.mesh.position.z, b.collisionRadius);
  return b;
}

const THREE_PLAYERS = [
  { id: 0, factionId: 'human', team: 0, isLocal: true, resources: { wood: 500, gold: 500, stone: 500 } },
  { id: 1, factionId: 'orc', team: 1, isAI: true, resources: { wood: 500, gold: 500, stone: 500 } },
  { id: 2, factionId: 'human', team: 2, isAI: true, resources: { wood: 500, gold: 500, stone: 500 } }
];

describe('Building.queueUnit debita do dono correto', () => {
  it('cada construção cobra do próprio Player', () => {
    const gm = makeGm(THREE_PLAYERS);
    gm.getPlayer(0).maxPopulation = gm.getPlayer(1).maxPopulation = gm.getPlayer(2).maxPopulation = 20;
    const humanBarracks = makeBuilding(gm, 'barracks', 0);
    const orcBarracks = makeBuilding(gm, 'orc_barracks', 1);

    expect(humanBarracks.queueUnit('knight', gm)).toBe(true);
    expect(orcBarracks.queueUnit('grunt', gm)).toBe(true);

    const knight = UNIT_TRAIN_CONFIG.knight.cost;
    const grunt = UNIT_TRAIN_CONFIG.grunt.cost;
    expect(gm.getPlayer(0).resources).toEqual({
      wood: 500 - (knight.wood || 0),
      gold: 500 - (knight.gold || 0),
      stone: 500 - (knight.stone || 0)
    });
    expect(gm.getPlayer(1).resources).toEqual({
      wood: 500 - (grunt.wood || 0),
      gold: 500 - (grunt.gold || 0),
      stone: 500 - (grunt.stone || 0)
    });
    // terceiro jogador intocado
    expect(gm.getPlayer(2).resources).toEqual({ wood: 500, gold: 500, stone: 500 });
  });

  it('sem recursos do dono não enfileira (mesmo que outro jogador seja rico)', () => {
    const gm = makeGm([
      { id: 0, team: 0, isLocal: true, resources: { wood: 0, gold: 0, stone: 0 } },
      { id: 1, team: 1, isAI: true, resources: { wood: 9999, gold: 9999, stone: 9999 } }
    ]);
    gm.getPlayer(0).maxPopulation = 20;
    const b = makeBuilding(gm, 'barracks', 0);
    expect(b.queueUnit('knight', gm)).toBe(false);
    expect(b.queue).toHaveLength(0);
    expect(gm.getPlayer(1).resources.gold).toBe(9999);
  });

  it('teto de população conta só as filas do mesmo dono', () => {
    const gm = makeGm(THREE_PLAYERS);
    const p0 = gm.getPlayer(0);
    p0.population = 1;
    p0.maxPopulation = 2;
    gm.getPlayer(1).maxPopulation = 20;
    const castle = makeBuilding(gm, 'castle', 0);
    const orcHall = makeBuilding(gm, 'great_hall', 1, { queue: [{ type: 'peon' }, { type: 'peon' }] });

    expect(castle.queueUnit('villager', gm)).toBe(true); // 1 vivo + 0 na fila < 2
    expect(castle.queueUnit('villager', gm)).toBe(false); // 1 vivo + 1 na fila >= 2
    expect(orcHall.queue).toHaveLength(2); // filas do outro jogador não pesaram no teto do 0
  });

  it('cancelQueuedUnit reembolsa o dono', () => {
    const gm = makeGm(THREE_PLAYERS);
    gm.getPlayer(2).maxPopulation = 20;
    const b = makeBuilding(gm, 'barracks', 2);
    expect(b.queueUnit('archer', gm)).toBe(true);
    expect(gm.getPlayer(2).resources).not.toEqual({ wood: 500, gold: 500, stone: 500 });
    expect(b.cancelQueuedUnit(0, gm)).toBe(true);
    expect(gm.getPlayer(2).resources).toEqual({ wood: 500, gold: 500, stone: 500 });
    expect(gm.getPlayer(0).resources).toEqual({ wood: 500, gold: 500, stone: 500 });
  });

  it('startResearch/cancelResearch cobram e reembolsam o dono; pesquisas são por jogador', () => {
    const gm = makeGm(THREE_PLAYERS);
    const upg = FORGE_UPGRADES[0];
    const cost = UPGRADE_CONFIG[upg].cost;
    const orcForge = makeBuilding(gm, 'orc_forge', 1);
    const humanForge = makeBuilding(gm, 'forge', 0);

    expect(orcForge.startResearch(upg, gm)).toBe(true);
    expect(gm.getPlayer(1).resources.gold).toBe(500 - (cost.gold || 0));
    expect(gm.getPlayer(0).resources.gold).toBe(500);

    // outro jogador pode pesquisar o mesmo upgrade em paralelo
    expect(humanForge.startResearch(upg, gm)).toBe(true);

    expect(orcForge.cancelResearch(gm)).toBe(true);
    expect(gm.getPlayer(1).resources).toEqual({ wood: 500, gold: 500, stone: 500 });

    // já pesquisado pelo jogador 1 → bloqueado só para ele
    gm.getPlayer(1).setResearchLevel(upg, 2); // nível máximo (F3-07)
    expect(orcForge.startResearch(upg, gm)).toBe(false);
  });
});

describe('Unit: hostilidade por time', () => {
  const at = (x, z) => ({ position: { x, z } });
  function makeUnit(gm, ownerId, x, z, type = 'knight') {
    const u = Object.assign(Object.create(Unit.prototype), {
      id: _nextEntityId++,
      type,
      ownerId,
      gameManager: gm,
      isDead: false,
      hp: 10,
      collisionRadius: 0.6,
      mesh: at(x, z)
    });
    gm.allUnits.push(u);
    gm.unitGrid.insert(u, x, z, u.collisionRadius);
    return u;
  }

  it('ignora aliados e mira no hostil mais próximo', () => {
    const gm = makeGm([
      { id: 0, team: 0, isLocal: true },
      { id: 1, team: 0, isAI: true }, // aliado do 0
      { id: 2, team: 1, isAI: true }
    ]);
    const me = makeUnit(gm, 0, 0, 0);
    makeUnit(gm, 1, 1, 0); // aliado colado
    const foe = makeUnit(gm, 2, 5, 0);
    expect(me.findNearestHostileUnit(gm.allUnits, 14)).toBe(foe);
    expect(me.isHostileTo(foe)).toBe(true);
    expect(me.isAlliedWith(gm.allUnits[1])).toBe(true);
  });

  it('getter de compatibilidade faction é relativo ao jogador local', () => {
    const gm = makeGm(THREE_PLAYERS);
    expect(makeUnit(gm, 0, 0, 0).faction).toBe('player');
    expect(makeUnit(gm, 1, 0, 0).faction).toBe('enemy');
    expect(makeUnit(gm, 2, 0, 0).faction).toBe('enemy');
    expect(makeBuilding(gm, 'barracks', 2).faction).toBe('enemy');
  });

  it('torre só mira unidades hostis', () => {
    const gm = makeGm(THREE_PLAYERS);
    const tower = makeBuilding(gm, 'watchtower', 0, { mesh: at(0, 0) });
    const own = makeUnit(gm, 0, 1, 0);
    const foe = makeUnit(gm, 2, 3, 0);
    expect(tower.isHostileTo(own)).toBe(false);
    expect(tower.isHostileTo(foe)).toBe(true);
  });
});
