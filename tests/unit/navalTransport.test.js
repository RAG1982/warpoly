import { describe, it, expect } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import pen1 from '../../src/data/maps/pendentes/dois-continentes-1.json';
import { makeMapGm, run, build, hqOf, components, compAt, shoreNear, spotsNear } from './helpers/navalWorld.js';

/**
 * navalTransport.test.js — ENG-NAVAL: viagem completa de uma Barcaça entre dois continentes e uma ilhota
 * (`pendentes/dois-continentes-1`: oeste = humano, leste = orc, ilhotas em (0,-33) e (6,46)). Ordens pelo caminho real `gm.issue`.
 */
function world() {
  const gm = makeMapGm(pen1);
  const lc = components(gm.pathfinder);
  const west = compAt(gm.pathfinder, lc, -74, 6);
  const east = compAt(gm.pathfinder, lc, 72, -1);
  const islet = lc.list.find((c) => c.size > 100 && c.size < 1000).id;
  return { gm, lc, west, east, islet };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const where = (gm, lc, u) => { const s = gm.pathfinder.findNearestWalkable(u.mesh.position.x, u.mesh.position.z, 4); return compAt(gm.pathfinder, lc, s.x, s.z); };
const hqOfSet = (gm) => { hqOf(gm, 0).tier = 2; Object.assign(gm.getPlayer(0).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 }); build(gm, 'barracks', 0, -52, 30); };
const at = (u) => ({ x: u.mesh.position.x, z: u.mesh.position.z });

describe('Barcaça: continente → ilhota → continente', () => {
  it('viagem completa: embarca na praia oeste, desembarca na ilhota, recolhe e leva ao continente leste', () => {
    const { gm, lc, west, east, islet } = world();
    const shore = shoreNear(gm, lc, west, 0, -33);
    const men = [];
    for (let i = 0; i < 6; i++) men.push(gm.spawnUnit('knight', shore.x - 1 - i * 0.7, shore.z + 0.5 * i, 0));
    const barge = gm.spawnUnit('barge', -30, -10, 0);
    // 1) a barcaça vem até a praia (MOVE na água junto às tropas)
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [barge.id], x: shore.x + 2, z: shore.z });
    run(gm, 25);
    expect(dist(at(barge), shore)).toBeLessThan(8);
    // 2) clique direito da barcaça nas tropas → LOAD
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 12);
    expect(barge.cargo.length).toBe(6);
    // 3) leva para a ilhota e desembarca
    const spot = shoreNear(gm, lc, islet, shore.x, shore.z);
    gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id, x: spot.x, z: spot.z });
    run(gm, 40);
    expect(barge.cargo.length).toBe(0);
    for (const m of men) {
      expect(m.transportedBy).toBe(null);
      expect(m.mesh.visible).toBe(true);
      expect(where(gm, lc, m)).toBe(islet);
    }
    // 4) o mesmo grupo embarca de novo na ilhota e vai ao continente leste
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 12);
    console.log('DBG', barge.collisionRadius, men[0].collisionRadius, JSON.stringify(at(barge)), men.map((m)=>[m.mesh.position.x.toFixed(1),m.mesh.position.z.toFixed(1),m.state,m.transportedBy!==null,m._boardTarget?1:0].join(':')).join(' '));
    expect(barge.cargo.length).toBe(6);
    const eshore = shoreNear(gm, lc, east, spot.x, spot.z);
    gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id, x: eshore.x, z: eshore.z });
    run(gm, 80);
    expect(barge.cargo.length).toBe(0);
    for (const m of men) expect(where(gm, lc, m)).toBe(east);
  });

  it('LOAD de uma tropa em OUTRO continente: não há caminho a pé até o barco; a ordem acaba com aviso e a tropa fica parada', () => {
    const { gm, lc, west, east } = world();
    const shore = shoreNear(gm, lc, west, 0, -33);
    const far = shoreNear(gm, lc, east, 0, -33);
    const m = gm.spawnUnit('knight', far.x, far.z, 0);
    const barge = gm.spawnUnit('barge', shore.x + 2, shore.z, 0);
    const msgs = [];
    gm.events.on(EVT.NOTIFY, (e) => msgs.push(e.text));
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: [m.id], targetId: barge.id });
    run(gm, 40);
    expect(m.transportedBy).toBe(null);
    expect(barge.cargo.length).toBe(0);
    expect(m.state).toBe('idle');
    expect(dist(at(m), far)).toBeLessThan(3);
    expect(msgs.some((t) => t.includes('longe da margem'))).toBe(true);
  });

  it('a barcaça vai buscar a tropa (ordem dada à barcaça): aproxima-se da margem e a tropa embarca', () => {
    const { gm, lc, west } = world();
    const shore = shoreNear(gm, lc, west, 0, -33);
    const m = gm.spawnUnit('knight', shore.x - 1, shore.z, 0);
    const barge = gm.spawnUnit('barge', -25, -5, 0);
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: [barge.id], targetId: m.id });
    run(gm, 30);
    expect(m.transportedBy).toBe(barge.id);
  });

  it('facção orc: grunhidos embarcam na praia leste, descem na ilhota e seguem a pé; a barcaça é a mesma para as duas facções', () => {
    const { gm, lc, east, islet } = world();
    const shore = shoreNear(gm, lc, east, 0, -33);
    const men = [];
    for (let i = 0; i < 6; i++) men.push(gm.spawnUnit(i % 2 ? 'grunt' : 'axethrower', shore.x + 1 + i * 0.7, shore.z + 0.4 * i, 1));
    const barge = gm.spawnUnit('barge', 30, -5, 1);
    gm.issue({ type: CMD.MOVE, playerId: 1, unitIds: [barge.id], x: shore.x - 2, z: shore.z });
    run(gm, 25);
    gm.issue({ type: CMD.LOAD, playerId: 1, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 15);
    expect(barge.cargo.length).toBe(6);
    const spot = shoreNear(gm, lc, islet, shore.x, shore.z);
    gm.issue({ type: CMD.UNLOAD, playerId: 1, unitId: barge.id, x: spot.x, z: spot.z });
    run(gm, 40);
    expect(barge.cargo.length).toBe(0);
    for (const m of men) expect(where(gm, lc, m)).toBe(islet);
    // desce e anda: uma ordem de MOVE no chão da ilhota é obedecida
    gm.issue({ type: CMD.MOVE, playerId: 1, unitIds: men.map((m) => m.id), x: spot.x - 3, z: spot.z - 6 });
    run(gm, 8);
    for (const m of men) expect(m.state === 'idle' || m.state === 'moving').toBe(true);
    expect(dist(at(men[0]), { x: spot.x - 3, z: spot.z - 6 })).toBeLessThan(6);
  });

  it('barcaça recém-treinada no estaleiro (cais): tropas ao lado do estaleiro embarcam, e o desembarque na outra margem funciona', () => {
    const { gm, lc, west, east } = world();
    hqOfSet(gm);
    const yardSpot = spotsNear(gm, 'shipyard', -35, -10, 1)[0];
    const yard = build(gm, 'shipyard', 0, yardSpot.x, yardSpot.z);
    gm.issue({ type: CMD.TRAIN, playerId: 0, buildingId: yard.id, unitType: 'barge' });
    run(gm, 16);
    const barge = gm.allUnits.find((u) => u.type === 'barge' && u.ownerId === 0);
    expect(barge, 'barcaça treinada').toBeTruthy();
    const men = [];
    const dock = gm.getDockPoint(yard);
    const near = gm.pathfinder.findNearestWalkable(dock.x, dock.z, 12);
    for (let i = 0; i < 4; i++) men.push(gm.spawnUnit('knight', near.x - i * 0.8, near.z + 0.5, 0));
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 20);
    expect(barge.cargo.length).toBe(4);
    const eshore = shoreNear(gm, lc, east, 0, 0);
    gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id, x: eshore.x, z: eshore.z });
    run(gm, 90);
    expect(barge.cargo.length).toBe(0);
    for (const m of men) expect(where(gm, lc, m)).toBe(east);
    expect(west).not.toBe(east);
  });

  it('UNLOAD sem ponto (botão Desembarcar): solta a carga na margem mais próxima do barco', () => {
    const { gm, lc, west } = world();
    const shore = shoreNear(gm, lc, west, 0, -33);
    const men = [0, 1, 2].map((i) => gm.spawnUnit('knight', shore.x - 1 - i, shore.z, 0));
    const barge = gm.spawnUnit('barge', shore.x + 2, shore.z, 0);
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 10);
    expect(barge.cargo.length).toBe(3);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [barge.id], x: shore.x + 12, z: shore.z - 6 });
    run(gm, 6);
    gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id });
    run(gm, 20);
    expect(barge.cargo.length).toBe(0);
    for (const m of men) expect(where(gm, lc, m)).toBe(west);
  });

  it('afundar a barcaça cheia no mar: passageiros morrem junto (comportamento documentado: não há resgate nem afogamento parcial)', () => {
    const { gm, lc, west } = world();
    const shore = shoreNear(gm, lc, west, 0, -33);
    const men = [0, 1, 2].map((i) => gm.spawnUnit('knight', shore.x - 1 - i, shore.z, 0));
    const barge = gm.spawnUnit('barge', shore.x + 2, shore.z, 0);
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 10);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [barge.id], x: shore.x + 15, z: shore.z - 8 });
    run(gm, 8);
    const enemy = gm.spawnUnit('war_galley', barge.mesh.position.x + 8, barge.mesh.position.z, 1);
    run(gm, 60);
    expect(barge.isDead).toBe(true);
    for (const m of men) expect(m.isDead).toBe(true);
    expect(gm.allUnits.some((u) => u.transportedBy !== null)).toBe(false);
    expect(enemy.isDead).toBe(false);
  });

  it('passageiro a bordo não é mais alvo: o atirador inimigo que o perseguia larga-o (e passa a mirar a barcaça), sem feri-lo', () => {
    const { gm, lc, west } = world();
    const sh = shoreNear(gm, lc, west, 0, -33);
    const k = gm.spawnUnit('knight', sh.x - 1, sh.z, 0);
    const barge = gm.spawnUnit('barge', sh.x + 2, sh.z, 0);
    const enemy = gm.spawnUnit('axethrower', sh.x - 9, sh.z + 3, 1);
    gm.issue({ type: CMD.ATTACK, playerId: 1, unitIds: [enemy.id], targetId: k.id });
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: [k.id], targetId: barge.id });
    run(gm, 2);
    expect(k.transportedBy).toBe(barge.id);
    const hp = k.hp;
    run(gm, 8);
    expect(k.hp).toBe(hp);
    expect(enemy.attackTarget === barge || enemy.attackTarget === null).toBe(true);
  });
});
