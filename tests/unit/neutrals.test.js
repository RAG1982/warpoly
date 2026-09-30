import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig, validateNeutrals } from '../../src/sim/MatchConfig.js';
import { getMap } from '../../src/data/maps/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { NEUTRAL_HOSTILE_ID, NEUTRAL_OWNER_ID } from '../../src/sim/EntityIds.js';
import { PlayerRegistry } from '../../src/sim/PlayerRegistry.js';
import { EVT } from '../../src/sim/events.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { GUARD_LEASH } from '../../src/entities/Unit.js';
import { Critter } from '../../src/entities/Critter.js';

/** F3-10 — neutros hostis (acampamento de bandidos) e critters. Partidas headless. */
function makeGm(seed = 42, mapId = 'continental-1v1') {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene, getMap(mapId));
  const cfg = createMatchConfig({ seed, headless: true, mapId });
  return new GameManager(scene, terrain, null, null, cfg);
}

function step(gm, n) {
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

describe('jogador neutro hostil (F3-10)', () => {
  it('mapa com neutrals cria o jogador 99, hostil a todos, fora das listas normais', () => {
    const gm = makeGm();
    const n = gm.getPlayer(NEUTRAL_HOSTILE_ID);
    expect(n).toBeTruthy();
    expect(n.isNeutralHostile).toBe(true);
    expect(n.team).toBe(99);
    expect(gm.isHostile(NEUTRAL_HOSTILE_ID, 0)).toBe(true);
    expect(gm.isHostile(0, NEUTRAL_HOSTILE_ID)).toBe(true);
    expect(gm.isHostile(1, NEUTRAL_HOSTILE_ID)).toBe(true);
    expect(gm.isHostile(NEUTRAL_OWNER_ID, NEUTRAL_HOSTILE_ID)).toBe(false);
    expect(gm.players.map((p) => p.id)).toEqual([0, 1]);
    expect(gm.playerRegistry.alivePlayers.length).toBe(2);
    expect([...gm.playerRegistry.aliveTeams()].sort()).toEqual([0, 1]);
    expect(gm.playerRegistry.firstHostileOf(0).id).toBe(1);
  });

  it('registro sem neutro hostil não muda (não é criado sem `neutrals`)', () => {
    const reg = new PlayerRegistry([
      { id: 0, factionId: 'human', team: 0, isLocal: true },
      { id: 1, factionId: 'orc', team: 1 }
    ]);
    expect(reg.neutralHostile).toBeNull();
    expect(reg.getPlayer(NEUTRAL_HOSTILE_ID)).toBeNull();
    expect(reg.isHostile(0, NEUTRAL_HOSTILE_ID)).toBe(false);
  });

  it('aliveTeams/alivePlayers ignoram o neutro mesmo com jogadores derrotados', () => {
    const reg = new PlayerRegistry([
      { id: 0, factionId: 'human', team: 0, isLocal: true },
      { id: 1, factionId: 'orc', team: 1 },
      { id: NEUTRAL_HOSTILE_ID, factionId: 'human', team: 99, isNeutralHostile: true }
    ]);
    reg.getPlayer(1).defeated = true;
    expect([...reg.aliveTeams()]).toEqual([0]);
    expect(reg.alivePlayers.map((p) => p.id)).toEqual([0]);
    expect(reg.isHostile(0, 99)).toBe(true);
    expect(reg.isHostile(99, 1)).toBe(true);
  });

  it('a partida não termina por causa do neutro e ele nunca é derrotado', () => {
    const gm = makeGm();
    step(gm, 60);
    expect(gm.isGameOver).toBe(false);
    expect(gm.getPlayer(NEUTRAL_HOSTILE_ID).defeated).toBe(false);
  });

  it('MatchStats ignora o neutro hostil (mortes dele não pontuam; mortes de inimigos normais sim)', () => {
    const gm = makeGm();
    const pos = { x: 0, y: 0, z: 0 };
    gm.events.emit(EVT.UNIT_DIED, { unitId: 1, ownerId: NEUTRAL_HOSTILE_ID, pos, unitType: 'bandit', killerOwnerId: 0 });
    gm.events.flush();
    expect(gm.matchStats.byPlayer.get(0).unitsKilled).toBe(0);
    expect(gm.matchStats.byPlayer.has(NEUTRAL_HOSTILE_ID)).toBe(false);
    gm.events.emit(EVT.UNIT_DIED, { unitId: 2, ownerId: 1, pos, unitType: 'grunt', killerOwnerId: 0 });
    gm.events.flush();
    expect(gm.matchStats.byPlayer.get(0).unitsKilled).toBe(1);
    // bandido matando jogador: perda contada, kill do neutro não existe
    gm.events.emit(EVT.UNIT_DIED, { unitId: 3, ownerId: 0, pos, unitType: 'knight', killerOwnerId: NEUTRAL_HOSTILE_ID });
    gm.events.flush();
    expect(gm.matchStats.byPlayer.get(0).unitsLost).toBe(1);
    const snap = gm.matchStats.snapshot();
    expect(snap.players.map((p) => p.id)).toEqual([0, 1]);
  });
});

describe('spawnNeutrals (F3-10)', () => {
  it('cria 2 acampamentos com 4 bandidos e jazida de 3000 cada, e critters (≤ 40)', () => {
    const gm = makeGm();
    const camps = gm.buildings.filter((b) => b.type === 'bandit_camp');
    expect(camps.length).toBe(2);
    for (const c of camps) {
      expect(c.ownerId).toBe(NEUTRAL_HOSTILE_ID);
      expect(c.isConstructed).toBe(true);
      expect(c.hp).toBe(1400);
    }
    const bandits = gm.allUnits.filter((u) => u.type === 'bandit');
    expect(bandits.length).toBe(8);
    for (const b of bandits) {
      expect(b.ownerId).toBe(NEUTRAL_HOSTILE_ID);
      expect(b.homePos).toBeTruthy();
    }
    const rich = gm.resourceDeposits.filter((d) => d.resourcesRemaining === 3000);
    expect(rich.length).toBe(2);
    expect(gm.critters.length).toBe(18);
    expect(gm.critters.length).toBeLessThanOrEqual(40);
    // critters fora de getUnitsOf de qualquer jogador
    expect(gm.critters.every((c) => !gm.allUnits.includes(c))).toBe(true);
    expect(gm.getUnitsOf(NEUTRAL_OWNER_ID).length).toBe(0);
  });

  it('acampamentos do 1×1 são espelhados e ficam a ≥ 25 de qualquer startSlot', () => {
    const map = getMap('continental-1v1');
    const camps = map.neutrals.filter((n) => n.kind === 'camp');
    expect(camps.length).toBe(2);
    expect(camps[0].x).toBe(-camps[1].x);
    expect(camps[0].z).toBe(-camps[1].z);
    for (const c of camps) {
      for (const s of map.startSlots) expect(Math.hypot(c.x - s.x, c.z - s.z)).toBeGreaterThanOrEqual(25);
    }
  });

  it('todos os mapas: neutrals válidos, em terra seca e ≥ 25 de startSlots', () => {
    for (const id of ['continental-1v1', 'ilhas-4p']) {
      const map = getMap(id);
      expect(() => validateNeutrals(map)).not.toThrow();
      expect(map.neutrals.filter((n) => n.kind === 'camp').length).toBe(2);
      for (const n of map.neutrals) {
        expect(getHeightForMap(map, n.x, n.z), `${id} ${n.kind} (${n.x}, ${n.z})`).toBeGreaterThanOrEqual(1.9);
        if (n.kind === 'camp') {
          for (const s of map.startSlots) expect(Math.hypot(n.x - s.x, n.z - s.z)).toBeGreaterThanOrEqual(25);
        }
      }
    }
  });

  it('a jazida do acampamento fica em terra a ~9 do acampamento', () => {
    const gm = makeGm();
    for (const camp of gm.buildings.filter((b) => b.type === 'bandit_camp')) {
      const dep = gm.resourceDeposits.find((d) => d.resourcesRemaining === 3000 &&
        Math.hypot(d.mesh.position.x - camp.mesh.position.x, d.mesh.position.z - camp.mesh.position.z) < 10);
      expect(dep).toBeTruthy();
      const d = Math.hypot(dep.mesh.position.x - camp.mesh.position.x, dep.mesh.position.z - camp.mesh.position.z);
      expect(d).toBeGreaterThan(8);
    }
  });

  it('determinismo: mesma seed com neutros → mesmos checksums', () => {
    const run = (seed) => {
      const gm = makeGm(seed);
      step(gm, 400);
      return gm.checksums.map((c) => c.hash);
    };
    const a = run(5);
    const b = run(5);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

describe('validação do formato neutrals (F3-10)', () => {
  const base = { id: 'x', size: 100, playable: 80, neutrals: [] };
  const withN = (n) => ({ ...base, neutrals: [n] });
  it('rejeita kind inválido, fora dos limites, guards fora de 1..8 e espécie inválida', () => {
    expect(() => validateNeutrals(withN({ kind: 'torre', x: 0, z: 0 }))).toThrow(/kind/);
    expect(() => validateNeutrals(withN({ kind: 'camp', x: 90, z: 0, guards: 3 }))).toThrow(/fora/);
    expect(() => validateNeutrals(withN({ kind: 'camp', x: 0, z: 0, guards: 0 }))).toThrow(/guards/);
    expect(() => validateNeutrals(withN({ kind: 'camp', x: 0, z: 0, guards: 9 }))).toThrow(/guards/);
    expect(() => validateNeutrals(withN({ kind: 'critters', species: 'dragao', x: 0, z: 0, count: 3 }))).toThrow(/espécie/);
    expect(() => validateNeutrals(withN({ kind: 'critters', species: 'sheep', x: 0, z: 0, count: 41 }))).toThrow(/count/);
  });
  it('aceita entradas válidas', () => {
    expect(() => validateNeutrals(withN({ kind: 'camp', x: 8, z: -30, guards: 4, reward: { gold: 300 }, deposit: { type: 'gold', amount: 3000 } }))).not.toThrow();
    expect(() => validateNeutrals(withN({ kind: 'critters', species: 'pig', x: 10, z: 10, count: 5, radius: 6 }))).not.toThrow();
  });
});

describe('bandoleiros: guarda e leash (F3-10)', () => {
  it('bandido ataca unidade próxima', () => {
    const gm = makeGm();
    const bandit = gm.allUnits.find((u) => u.type === 'bandit');
    const knight = gm.spawnUnit('knight', bandit.homePos.x + 4, bandit.homePos.z, 0);
    const hp0 = knight.hp;
    step(gm, 80);
    expect(knight.hp).toBeLessThan(hp0);
  });

  it('bandido que se afasta > leash volta à origem, recuperando PV', () => {
    const gm = makeGm();
    const bandit = gm.allUnits.find((u) => u.type === 'bandit');
    const home = { ...bandit.homePos };
    // Teleporta para além do leash e o fere.
    let placed = false;
    for (let a = 0; a < 16 && !placed; a++) {
      const x = home.x + Math.cos((a / 16) * Math.PI * 2) * (GUARD_LEASH + 4);
      const z = home.z + Math.sin((a / 16) * Math.PI * 2) * (GUARD_LEASH + 4);
      if (gm.terrain.getHeight(x, z) >= 1.9 && gm.pathfinder.hasLineOfSight(home.x, home.z, x, z)) {
        bandit.mesh.position.set(x, gm.terrain.getHeight(x, z), z);
        placed = true;
      }
    }
    expect(placed).toBe(true);
    bandit.hp = bandit.maxHp * 0.5;
    step(gm, 3);
    expect(bandit._returningHome).toBe(true);
    const hpBefore = bandit.hp;
    step(gm, 400);
    const d = Math.hypot(bandit.mesh.position.x - home.x, bandit.mesh.position.z - home.z);
    expect(d).toBeLessThan(4);
    expect(bandit._returningHome).toBe(false);
    expect(bandit.hp).toBeGreaterThan(hpBefore);
  });
});

describe('recompensa do acampamento (F3-10)', () => {
  it('destruir o acampamento credita a recompensa ao último atacante e emite CAMP_CLEARED uma vez', () => {
    const gm = makeGm();
    const camp = gm.buildings.find((b) => b.type === 'bandit_camp');
    const cleared = [];
    const notes = [];
    gm.events.on(EVT.CAMP_CLEARED, (e) => cleared.push(e));
    gm.events.on(EVT.NOTIFY, (e) => notes.push(e));
    const knight = gm.spawnUnit('knight', 0, 0, 0);
    const gold0 = gm.getPlayer(0).resources.gold;
    camp.takeDamage(99999, knight);
    step(gm, 5);
    expect(cleared.length).toBe(1);
    expect(cleared[0].byOwnerId).toBe(0);
    expect(cleared[0].reward).toEqual({ gold: 300 });
    expect(gm.getPlayer(0).resources.gold).toBe(gold0 + 300);
    expect(notes.some((n) => n.ownerId === 0 && /Acampamento de bandidos destruído!/.test(n.text) && /300 de ouro/.test(n.text))).toBe(true);
    step(gm, 40);
    expect(cleared.length).toBe(1);
    expect(gm.buildings.some((b) => b === camp)).toBe(false);
  });

  it('sem atacante conhecido não há crédito, mas o evento sai', () => {
    const gm = makeGm();
    const camp = gm.buildings.find((b) => b.type === 'bandit_camp');
    const cleared = [];
    gm.events.on(EVT.CAMP_CLEARED, (e) => cleared.push(e));
    const gold0 = gm.getPlayer(0).resources.gold;
    camp.takeDamage(99999, null);
    step(gm, 3);
    expect(cleared.length).toBe(1);
    expect(cleared[0].byOwnerId).toBeNull();
    expect(gm.getPlayer(0).resources.gold).toBe(gold0);
  });
});

describe('critters (F3-10)', () => {
  function spawnCritter(gm, x, z) {
    const rng = { next: () => 0.5, fork: () => rng };
    const c = new Critter(gm, 'sheep', x, z, rng, 6);
    gm.registerEntity(c, NEUTRAL_OWNER_ID);
    gm.critters.push(c);
    return c;
  }

  it('não é alvo de auto-aquisição, mas é atacável por ordem explícita', () => {
    const gm = makeGm();
    const critter = spawnCritter(gm, 5, 5);
    critter.mesh.visible = true;
    const knight = gm.spawnUnit('knight', 6, 5, 0);
    step(gm, 60);
    expect(critter.hp).toBe(critter.maxHp); // idle não adquire critter
    expect(knight.state).not.toBe('attacking');

    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [knight.id], targetId: critter.id });
    step(gm, 120);
    expect(critter.isDead).toBe(true);
  });

  it('foge ao ser ferido e a carcaça some após ~3 s; não emite UNIT_DIED nem soma recursos', () => {
    const gm = makeGm();
    const critter = spawnCritter(gm, 5, 5);
    const attacker = { mesh: { position: new THREE.Vector3(4, 0, 5) }, ownerId: 0 };
    const died = [];
    gm.events.on(EVT.UNIT_DIED, (e) => died.push(e));
    const res0 = { ...gm.getPlayer(0).resources };
    critter.takeDamage(1, attacker);
    expect(critter.state).toBe('fleeing');
    const x0 = critter.mesh.position.x;
    step(gm, 20);
    expect(critter.mesh.position.x).toBeGreaterThan(x0);
    critter.takeDamage(100, attacker);
    expect(critter.isDead).toBe(true);
    step(gm, 70);
    expect(gm.critters.includes(critter)).toBe(false);
    expect(gm.entitiesById.has(critter.id)).toBe(false);
    expect(died.length).toBe(0);
    expect(gm.getPlayer(0).resources).toEqual(res0);
    expect(gm.matchStats.byPlayer.get(0).unitsKilled).toBe(0);
  });
});
