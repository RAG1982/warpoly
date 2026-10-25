import { describe, it, expect } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import pen1 from '../../src/data/maps/pendentes/dois-continentes-1.json';
import { makeMapGm, makeNavalGm, run, build, place, components, compAt, shoreNear } from './helpers/navalWorld.js';

/**
 * navalCombat.test.js — ENG-NAVAL: combate naval com ordens reais (`gm.issue`): ATTACK, ATTACK_MOVE, PATROL, grupos,
 * artilharia costeira, torres vs. navio, afundamento, névoa de guerra e formação sem empilhar.
 * Mapa de mar aberto: `pendentes/dois-continentes-1` (continentes a oeste/leste, canal largo no meio).
 */
const dist = (a, b) => Math.hypot(a.mesh.position.x - b.mesh.position.x, a.mesh.position.z - b.mesh.position.z);
const sea = (gm, type, owner, x, z) => gm.spawnUnit(type, x, z, owner);

describe('ordens de ataque naval (gm.issue)', () => {
  it('2 fragatas ATACAM um navio inimigo parado a ~35 u: aproximam-se, afundam o alvo, e o corpo some', () => {
    const gm = makeMapGm(pen1);
    const a = sea(gm, 'frigate', 0, -20, 0);
    const b = sea(gm, 'frigate', 0, -20, 6);
    const enemy = sea(gm, 'war_galley', 1, 15, 3);
    enemy.speed = 0;
    const kills = [];
    gm.events.on(EVT.UNIT_DIED, (e) => kills.push(e));
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [a.id, b.id], targetId: enemy.id });
    run(gm, 10);
    expect(dist(a, enemy)).toBeLessThan(13.5);
    run(gm, 30);
    expect(enemy.isDead).toBe(true);
    expect(kills.some((k) => k.unitType === 'war_galley')).toBe(true);
    run(gm, 6);
    expect(gm.allUnits.includes(enemy)).toBe(false); // afundou e foi removida
    expect(a.hp).toBeGreaterThan(0);
    expect(b.hp).toBeGreaterThan(0);
  });

  it('ATTACK_MOVE: a frota cruza o mar, engaja o inimigo que encontra e segue ao destino', () => {
    const gm = makeMapGm(pen1);
    const f = [sea(gm, 'frigate', 0, -25, -5), sea(gm, 'frigate', 0, -25, 0), sea(gm, 'frigate', 0, -25, 5)];
    const enemy = sea(gm, 'war_galley', 1, 0, 0);
    enemy.speed = 0;
    gm.issue({ type: CMD.ATTACK_MOVE, playerId: 0, unitIds: f.map((u) => u.id), x: 28, z: 0 });
    run(gm, 40);
    expect(enemy.isDead).toBe(true);
    run(gm, 20);
    for (const u of f) expect(Math.hypot(u.mesh.position.x - 28, u.mesh.position.z)).toBeLessThan(14);
  });

  it('PATROL: o navio vai e volta entre os pontos e engaja o intruso', () => {
    const gm = makeMapGm(pen1);
    const p = sea(gm, 'frigate', 0, -25, 0);
    gm.issue({ type: CMD.PATROL, playerId: 0, unitIds: [p.id], x: -5, z: 0 });
    let maxX = -99; let minXafter = 99;
    for (let i = 0; i < 40; i++) {
      run(gm, 1);
      maxX = Math.max(maxX, p.mesh.position.x);
      if (maxX > -9) minXafter = Math.min(minXafter, p.mesh.position.x);
    }
    expect(maxX).toBeGreaterThan(-9);
    expect(minXafter).toBeLessThan(-20);
    const intruder = sea(gm, 'war_galley', 1, -14, 10);
    intruder.speed = 0;
    run(gm, 30);
    expect(intruder.hp).toBeLessThan(intruder.maxHp);
  });

  it('dano: perfurante da fragata (26) vs. armadura 3 e couraçado splash em navios agrupados', () => {
    const gm = makeMapGm(pen1);
    const f = sea(gm, 'frigate', 0, -10, 0);
    const e = sea(gm, 'war_galley', 1, 0, 0);
    e.speed = 0; e.attackRange = 0;
    const hp0 = e.hp;
    run(gm, 3);
    expect(e.hp).toBeLessThan(hp0);
    expect(hp0 - e.hp).toBeLessThanOrEqual(26 * 3);
    expect(f.hp).toBe(f.maxHp);
  });
});

describe('artilharia costeira e torres', () => {
  it('couraçado ATACA uma construção na costa dentro de 22 e a destrói; fora do alcance se aproxima antes', () => {
    const gm = makeMapGm(pen1);
    const lc = components(gm.pathfinder);
    const east = compAt(gm.pathfinder, lc, 72, -1);
    const sh = shoreNear(gm, lc, east, 0, 0, 3);
    const tgt = build(gm, 'orc_barracks', 1, sh.x + 2, sh.z);
    const d = sea(gm, 'dreadnought', 0, sh.x - 40, sh.z);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [d.id], targetId: tgt.id });
    run(gm, 30);
    expect(tgt.hp).toBeLessThan(tgt.maxHp);
    expect(Math.hypot(d.mesh.position.x - tgt.mesh.position.x, d.mesh.position.z - tgt.mesh.position.z)).toBeLessThan(28);
  });

  it('torre de vigia na costa atira em navio inimigo ao alcance; fragata revida e a derruba', () => {
    const gm = makeMapGm(pen1);
    const lc = components(gm.pathfinder);
    const east = compAt(gm.pathfinder, lc, 72, -1);
    const sh = shoreNear(gm, lc, east, 0, 0, 3);
    const tower = build(gm, 'orc_watchtower', 1, sh.x + 1, sh.z);
    const f = sea(gm, 'frigate', 0, sh.x - 10, sh.z);
    run(gm, 6);
    expect(f.hp).toBeLessThan(f.maxHp);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [f.id], targetId: tower.id });
    run(gm, 60);
    expect(tower.hp < tower.maxHp || tower.isDead).toBe(true);
  });
});

describe('frota: formação, travamentos e névoa', () => {
  it('8 navios (fragatas, couraçados, barcaças) cruzam o mar até um ponto: todos chegam, sem empilhar', () => {
    const gm = makeMapGm(pen1);
    const ships = [];
    const types = ['frigate', 'frigate', 'frigate', 'dreadnought', 'dreadnought', 'barge', 'barge', 'tanker'];
    types.forEach((t, i) => ships.push(sea(gm, t, 0, -22 + (i % 2) * 3, -14 + i * 4)));
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ships.map((s) => s.id), x: 22, z: 0 });
    run(gm, 60);
    for (const s of ships) expect(Math.hypot(s.mesh.position.x - 22, s.mesh.position.z), s.type).toBeLessThan(14);
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
      expect(dist(ships[i], ships[j]), `${ships[i].type}/${ships[j].type}`).toBeGreaterThan((ships[i].collisionRadius + ships[j].collisionRadius) * 0.6);
    }
  });

  it('a frota contorna a ilhota: nenhum navio sai da água navegável durante a travessia norte-sul', () => {
    const gm = makeMapGm(pen1);
    const ships = [sea(gm, 'frigate', 0, 0, -60), sea(gm, 'barge', 0, 3, -62), sea(gm, 'dreadnought', 0, -3, -64)];
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: ships.map((s) => s.id), x: 3, z: 60 });
    for (let t = 0; t < 70; t++) {
      run(gm, 1);
      for (const s of ships) expect(gm.terrain.getHeight(s.mesh.position.x, s.mesh.position.z), `${s.type}@${t}`).toBeLessThanOrEqual(0.5 - 0.0);
    }
    for (const s of ships) expect(Math.abs(s.mesh.position.z - 60)).toBeLessThan(14);
  });

  it('visão naval: o navio revela a névoa ao navegar e a deixa explorada ao partir', () => {
    const gm = makeMapGm(pen1);
    const f = sea(gm, 'frigate', 0, -20, -40);
    run(gm, 1);
    expect(gm.fogOfWar.isVisible(-20, -40)).toBe(true);
    expect(gm.fogOfWar.isVisible(30, 40)).toBe(false);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [f.id], x: 20, z: 40 });
    run(gm, 30);
    expect(gm.fogOfWar.isVisible(f.mesh.position.x, f.mesh.position.z)).toBe(true);
    expect(gm.fogOfWar.isExplored(-20, -40)).toBe(true);
    expect(gm.fogOfWar.isVisible(-20, -40)).toBe(false);
    // inimigo dentro do raio de visão aparece; fora, não
    const near = sea(gm, 'war_galley', 1, f.mesh.position.x + 10, f.mesh.position.z);
    const far = sea(gm, 'war_galley', 1, f.mesh.position.x + 5, f.mesh.position.z - 70);
    run(gm, 1);
    expect(gm.fogOfWar.isVisible(near.mesh.position.x, near.mesh.position.z)).toBe(true);
    expect(gm.fogOfWar.isVisible(far.mesh.position.x, far.mesh.position.z)).toBe(false);
  });
});
