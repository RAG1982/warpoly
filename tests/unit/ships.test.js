import { describe, it, expect } from 'vitest';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { canTarget } from '../../src/sim/targeting.js';
import { isDetectedBy } from '../../src/sim/detection.js';
import { missingUnitRequirements } from '../../src/sim/requirements.js';
import { UNITS, BUILDINGS, RESEARCH, getUnitDef, getBuildingDef, FACTIONS } from '../../src/data/index.js';
import { NAVAL_MAX_HEIGHT, SUBMERGE_DELAY, BOARD_DISTANCE } from '../../src/data/combat.js';
import { makeNavalGm, run, build, hqOf, place, coastSpots } from './helpers/navalWorld.js';

/**
 * ships.test.js — F4-07b: navios de guerra, Barcaça (LOAD/UNLOAD), Couraçado, Submersível, Fundição.
 * `estreito-1v1`: canal navegável em x∈[-14,14] (humano a oeste, orc a leste); jogador 0 = humano, 1 = orc.
 */
const still = (u) => { u.speed = 0; return u; };
const ship = (gm, type, owner, x, z) => gm.spawnUnit(type, x, z, owner);

describe('dados dos navios (F4-07b)', () => {
  it('Fragata/Galé: números da spec; ataca navio, aéreo e costa', () => {
    for (const [t, f] of [['frigate', 'human'], ['war_galley', 'orc']]) {
      const u = UNITS[t];
      expect(u.faction).toBe(f);
      expect(u).toMatchObject({ hp: 280, speed: 5.5, armor: 3, attackRange: 12, attackCooldown: 1.3, layer: 'naval', canHitAir: true, canHitGround: true, trainTime: 16 });
      expect(u.damage).toEqual({ basic: 0, piercing: 26, type: 'piercing' });
      expect(u.cost).toEqual({ gold: 200, wood: 100, stone: 0, oil: 50 });
      expect(u.requires).toEqual([{ hq: 2 }]);
    }
  });

  it('Barcaça: sem ataque, capacidade 6, tipo único', () => {
    const u = UNITS.barge;
    expect(u).toMatchObject({ hp: 220, speed: 4.6, armor: 2, transportCapacity: 6, layer: 'naval', trainTime: 14, isCombat: false });
    expect(u.cost).toEqual({ gold: 150, wood: 100, stone: 0, oil: 30 });
    expect(u.damage.basic + u.damage.piercing).toBe(0);
  });

  it('Couraçado/Leviatã: balístico, alcance mínimo, Centro 3 + Fundição/Fornalha', () => {
    for (const [t, f, forge] of [['dreadnought', 'human', 'foundry'], ['iron_leviathan', 'orc', 'naval_forge']]) {
      const u = UNITS[t];
      expect(u.faction).toBe(f);
      expect(u).toMatchObject({ hp: 520, speed: 3.6, armor: 6, attackRange: 22, minAttackRange: 6, attackCooldown: 3.4, splashRadius: 1.8, trainTime: 24, canHitAir: false });
      expect(u.damage).toEqual({ basic: 90, piercing: 0, type: 'siege' });
      expect(u.cost).toEqual({ gold: 300, wood: 200, stone: 0, oil: 120 });
      expect(u.requires).toEqual([{ hq: 3 }, forge]);
    }
  });

  it('Submersível/Tartaruga: só ataca navios, invisível permanente', () => {
    for (const [t, f, forge] of [['submersible', 'human', 'foundry'], ['colossal_turtle', 'orc', 'naval_forge']]) {
      const u = UNITS[t];
      expect(u.faction).toBe(f);
      expect(u).toMatchObject({ hp: 200, speed: 4.4, armor: 0, attackRange: 9, attackCooldown: 2.0, canHitGround: false, canHitAir: false, canHitNaval: true, submersible: true, trainTime: 22 });
      expect(u.damage).toEqual({ basic: 0, piercing: 60, type: 'piercing' });
      expect(u.cost).toEqual({ gold: 300, wood: 150, stone: 0, oil: 100 });
      expect(u.requires).toEqual([{ hq: 3 }, forge]);
    }
  });

  it('Estaleiro/Doca treinam a frota; Fundição/Fornalha: role foundry, costeira, 800 PV', () => {
    expect(getBuildingDef('shipyard').trains).toEqual(['tanker', 'frigate', 'barge', 'dreadnought', 'submersible']);
    expect(getBuildingDef('ship_dock').trains).toEqual(['tanker', 'war_galley', 'barge', 'iron_leviathan', 'colossal_turtle']);
    for (const [t, f, yard] of [['foundry', 'human', 'shipyard'], ['naval_forge', 'orc', 'ship_dock']]) {
      expect(BUILDINGS[t]).toMatchObject({ faction: f, role: 'foundry', coastal: true, hp: 800, armor: 15, collisionRadius: 3.4 });
      expect(BUILDINGS[t].cost).toEqual({ gold: 180, wood: 100, stone: 60 });
      expect(BUILDINGS[t].requires).toEqual([yard, { hq: 2 }]);
      expect(FACTIONS[f].buildList).toContain(t);
    }
  });

  it('pesquisas da Fundição: 2 níveis, custam petróleo', () => {
    for (const id of ['naval_cannons', 'naval_hulls']) {
      expect(RESEARCH[id].building).toBe('foundry');
      expect(RESEARCH[id].levels).toHaveLength(2);
      for (const lv of RESEARCH[id].levels) expect(lv.cost.oil).toBeGreaterThan(0);
    }
    expect(RESEARCH.naval_cannons.levels[0].bonus.piercing).toBe(8);
    expect(RESEARCH.naval_hulls.levels[0].bonus.armor).toBe(3);
  });
});

describe('treino e requisitos (F4-07b)', () => {
  function setup() {
    const gm = makeNavalGm();
    const hq = hqOf(gm, 0);
    const p = gm.getPlayer(0);
    Object.assign(p.resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 });
    build(gm, 'barracks', 0, -30, 6);
    const [ys, fs] = coastSpots(gm, 'shipyard', -1, 2);
    const yard = build(gm, 'shipyard', 0, ys.x, ys.z);
    return { gm, hq, p, yard, fs };
  }

  it('Fragata/Barcaça exigem Centro 2; Couraçado/Submersível exigem Centro 3 + Fundição', () => {
    const { gm, hq, p, yard } = setup();
    expect(missingUnitRequirements(0, 'frigate', gm)).toEqual([{ hq: 2 }]);
    expect(yard.queueUnit('frigate', gm)).toBe(false);
    hq.tier = 2;
    expect(yard.queueUnit('frigate', gm)).toBe(true);
    expect(yard.queueUnit('barge', gm)).toBe(true);
    expect(yard.queueUnit('dreadnought', gm)).toBe(false);
    hq.tier = 3;
    expect(yard.queueUnit('dreadnought', gm)).toBe(false); // falta a Fundição
    expect(yard.queueUnit('submersible', gm)).toBe(false);
    expect(missingUnitRequirements(0, 'dreadnought', gm)).toEqual(['foundry']);
    const spot = coastSpots(gm, 'foundry', -1, 3, 9).find((s) => Math.hypot(s.x - yard.mesh.position.x, s.z - yard.mesh.position.z) > 8);
    build(gm, 'foundry', 0, spot.x, spot.z);
    expect(missingUnitRequirements(0, 'dreadnought', gm)).toEqual([]);
    expect(yard.queueUnit('dreadnought', gm)).toBe(true);
    expect(yard.queueUnit('submersible', gm)).toBe(true);
    expect(p.resources.oil).toBe(9000 - 50 - 30 - 120 - 100);
  });

  it('sem petróleo suficiente o treino é recusado (nada debitado)', () => {
    const { gm, hq, p, yard } = setup();
    hq.tier = 2;
    p.resources.oil = 49;
    const gold = p.resources.gold;
    expect(yard.queueUnit('frigate', gm)).toBe(false);
    expect(p.resources.gold).toBe(gold);
    p.resources.oil = 50;
    expect(yard.queueUnit('frigate', gm)).toBe(true);
    expect(p.resources.oil).toBe(0);
  });

  it('o navio sai do cais na água; Doca do Clã treina a Galé do orc', () => {
    const { gm, hq, yard } = setup();
    hq.tier = 2;
    expect(yard.queueUnit('frigate', gm)).toBe(true);
    run(gm, 18);
    const f = gm.allUnits.find((u) => u.type === 'frigate' && u.ownerId === 0);
    expect(f).toBeTruthy();
    expect(gm.terrain.getHeight(f.mesh.position.x, f.mesh.position.z)).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT);
    const gm2 = makeNavalGm();
    hqOf(gm2, 1).tier = 2;
    Object.assign(gm2.getPlayer(1).resources, { gold: 9000, wood: 9000, oil: 9000 });
    build(gm2, 'orc_barracks', 1, 30, -6);
    const [s] = coastSpots(gm2, 'ship_dock', 1, 1);
    const dock = build(gm2, 'ship_dock', 1, s.x, s.z);
    expect(dock.queueUnit('war_galley', gm2)).toBe(true);
    expect(dock.queueUnit('frigate', gm2)).toBe(false); // tipo da outra facção
  });
});

describe('regras de alvo e combate naval (F4-07b)', () => {
  it('canTarget: fragata atinge aéreo; couraçado não; submersível só navio; melee nunca atinge navio', () => {
    const gm = makeNavalGm();
    const frigate = ship(gm, 'frigate', 0, -2, -20);
    const dread = ship(gm, 'dreadnought', 0, -2, -26);
    const sub = ship(gm, 'submersible', 0, -2, -32);
    const enemyShip = ship(gm, 'frigate', 1, 8, -20);
    const glider = gm.spawnUnit('war_balloon', 0, 0, 1);
    const grunt = gm.spawnUnit('grunt', -30, 0, 1);
    const archer = gm.spawnUnit('archer', -30, 2, 0);
    expect(canTarget(frigate, glider)).toBe(true);
    expect(canTarget(frigate, enemyShip)).toBe(true);
    expect(canTarget(frigate, grunt)).toBe(true);
    expect(canTarget(dread, glider)).toBe(false);
    expect(canTarget(dread, enemyShip)).toBe(true);
    expect(canTarget(dread, grunt)).toBe(true);
    expect(canTarget(sub, enemyShip)).toBe(true);
    expect(canTarget(sub, grunt)).toBe(false);
    expect(canTarget(sub, glider)).toBe(false);
    expect(canTarget(grunt, enemyShip)).toBe(false); // melee não atinge navio
    expect(canTarget(archer, enemyShip)).toBe(true);
  });

  it('fragata abate um balão de guerra e um navio inimigo na água', () => {
    const gm = makeNavalGm();
    ship(gm, 'frigate', 0, -2, -20);
    const balloon = gm.spawnUnit('war_balloon', -2, -14, 1);
    balloon.speed = 0;
    run(gm, 20);
    expect(balloon.isDead).toBe(true);
    const gm2 = makeNavalGm();
    const a = ship(gm2, 'frigate', 0, -2, -20);
    const b = still(ship(gm2, 'frigate', 1, 6, -20));
    run(gm2, 20);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(a.hp).toBeLessThan(a.maxHp); // revidou
  });

  it('melee não ataca navio; arqueiro na costa atinge o navio ao alcance', () => {
    const gm = makeNavalGm();
    const boat = still(ship(gm, 'frigate', 1, -12, -20));
    boat.attackRange = 0; // não revida: isola o teste
    const grunt = gm.spawnUnit('grunt', -17, -20, 0);
    run(gm, 6);
    expect(boat.hp).toBe(boat.maxHp);
    const archer = gm.spawnUnit('archer', -17, -22, 0);
    run(gm, 8);
    expect(archer.isDead || boat.hp < boat.maxHp).toBe(true);
    expect(grunt.state).not.toBe('dying');
  });

  it('couraçado acerta tropas na costa (até 2 da margem) e respeita o alcance mínimo', () => {
    const gm = makeNavalGm();
    still(ship(gm, 'dreadnought', 0, -6, -20));
    const near = still(gm.spawnUnit('grunt', -17, -20, 1)); // ~11 de distância, junto à margem
    run(gm, 14);
    expect(near.hp).toBeLessThan(near.maxHp);
    // alvo a menos do mínimo (6): não dispara contra ele
    const gm2 = makeNavalGm();
    const d2 = still(ship(gm2, 'dreadnought', 0, -12, -20));
    const close = still(ship(gm2, 'frigate', 1, -9, -20));
    close.attackRange = 0;
    const projectiles = [];
    gm2.events.on(EVT.PROJECTILE_FIRED, (e) => projectiles.push(e));
    run(gm2, 6);
    expect(close.hp).toBe(close.maxHp);
    expect(projectiles.length).toBe(0);
    expect(d2.state).not.toBe('dying');
  });

  it('navio só mira terra a até SHORE_REACH da margem (tropa no interior é ignorada)', () => {
    const gm = makeNavalGm();
    const f = still(ship(gm, 'frigate', 0, -6, -20));
    const inland = still(gm.spawnUnit('grunt', -22, -20, 1)); // ~16 de distância e longe da água
    const ordered = f._shoreOk(inland);
    expect(ordered).toBe(false);
    const shore = still(gm.spawnUnit('grunt', -17, -22, 1));
    expect(f._shoreOk(shore)).toBe(true);
  });
});

describe('submersível (F4-07b)', () => {
  it('invisível para inimigos sem detector; um detector (balão) o revela; emerge ao atacar e mergulha após 4 s', () => {
    const gm = makeNavalGm();
    const sub = still(ship(gm, 'submersible', 0, -2, -20));
    const enemyShip = still(ship(gm, 'frigate', 1, 4, -20));
    enemyShip.attackRange = 0;
    expect(sub.mods.invisible).toBe(true);
    expect(isDetectedBy(gm, sub, 1)).toBe(false);
    expect(isDetectedBy(gm, sub, 0)).toBe(true);
    // a fragata inimiga não o auto-ataca
    run(gm, 2);
    expect(sub.hp).toBe(sub.maxHp);
    // o submersível ataca o navio inimigo e emerge
    run(gm, 6);
    expect(enemyShip.hp).toBeLessThan(enemyShip.maxHp);
    // detector inimigo
    const balloon = gm.spawnUnit('war_balloon', -2, -22, 1);
    balloon.speed = 0;
    expect(getUnitDef('war_balloon').detector).toBe(true);
    expect(isDetectedBy(gm, sub, 1)).toBe(true);
    balloon.die();
    gm.simStep(0.05);
    // sem atacar, volta a mergulhar depois de SUBMERGE_DELAY
    sub.breakInvisibility();
    expect(sub.mods.invisible).toBe(false);
    enemyShip.die();
    run(gm, SUBMERGE_DELAY + 1);
    expect(sub.mods.invisible).toBe(true);
  });

  it('torpedo só em navio: ignora tropas na margem', () => {
    const gm = makeNavalGm();
    const sub = still(ship(gm, 'submersible', 0, -10, -20));
    const g = still(gm.spawnUnit('grunt', -17, -20, 1));
    run(gm, 8);
    expect(g.hp).toBe(g.maxHp);
    expect(sub.mods.invisible).toBe(true);
  });
});

describe('transporte: LOAD / UNLOAD (F4-07b)', () => {
  function world() {
    const gm = makeNavalGm();
    const barge = ship(gm, 'barge', 0, -14, -20);
    const men = [];
    for (let i = 0; i < 7; i++) men.push(gm.spawnUnit('knight', -17.5, -18 - i * 0.8, 0));
    return { gm, barge, men };
  }

  it('embarcar: o terrestre anda até a margem e entra; limite de 6; passageiro some da grade e não recebe ordens', () => {
    const { gm, barge, men } = world();
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(gm, 20);
    expect(barge.cargo.length).toBe(6);
    const aboard = men.filter((m) => m.transportedBy === barge.id);
    expect(aboard.length).toBe(6);
    const left = men.filter((m) => m.transportedBy === null);
    expect(left.length).toBe(1);
    for (const m of aboard) {
      expect(m.mesh.visible).toBe(false);
      expect(gm.unitGrid.queryRadius(m.mesh.position.x, m.mesh.position.z, 0.5, (u) => u === m, [])).toBeDefined();
    }
    // ordens ignoradas
    const pos = { x: aboard[0].mesh.position.x, z: aboard[0].mesh.position.z };
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [aboard[0].id], x: -30, z: -10 });
    run(gm, 3);
    expect(aboard[0].transportedBy).toBe(barge.id);
    expect(Math.hypot(aboard[0].mesh.position.x - barge.mesh.position.x, aboard[0].mesh.position.z - barge.mesh.position.z)).toBeLessThan(0.01);
    expect(pos).toBeTruthy();
  });

  it('embarque só perto: barco longe da margem não recebe (a ordem expira com aviso)', () => {
    const gm = makeNavalGm();
    const barge = ship(gm, 'barge', 0, 0, -20); // meio do canal
    const m = gm.spawnUnit('knight', -17.5, -20, 0);
    const msgs = [];
    gm.events.on(EVT.NOTIFY, (e) => msgs.push(e.text));
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: [m.id], targetId: barge.id });
    run(gm, 15);
    expect(m.transportedBy).toBe(null);
    expect(barge.cargo.length).toBe(0);
    expect(msgs.some((t) => t.includes('longe da margem'))).toBe(true);
  });

  it('desembarcar: a barcaça vai à margem do ponto e libera a carga em anel, em terra', () => {
    const { gm, barge, men } = world();
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.slice(0, 6).map((m) => m.id), targetId: barge.id });
    run(gm, 15);
    expect(barge.cargo.length).toBe(6);
    // leva a barcaça para o outro lado do canal e desembarca na margem leste (terra do orc, à vista)
    gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id, x: 17, z: -20 });
    run(gm, 40);
    expect(barge.cargo.length).toBe(0);
    for (const m of men.slice(0, 6)) {
      expect(m.transportedBy).toBe(null);
      expect(m.mesh.visible).toBe(true);
      expect(m.mesh.position.x).toBeGreaterThan(8);
      expect(gm.terrain.getHeight(m.mesh.position.x, m.mesh.position.z)).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('a carga morre com a barcaça: UNIT_DIED por passageiro (matador = dono do atacante) e sem cadáver', () => {
    const { gm, barge, men } = world();
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.slice(0, 3).map((m) => m.id), targetId: barge.id });
    run(gm, 12);
    expect(barge.cargo.length).toBe(3);
    const died = [];
    gm.events.on(EVT.UNIT_DIED, (e) => died.push(e));
    const bp = barge.mesh.position;
    const corpsesBefore = gm.corpses.countNear(bp.x, bp.z, 6);
    barge.lastAttackerOwnerId = 1;
    barge.hp = 0;
    barge.die();
    gm.events.flush();
    expect(died.filter((e) => e.unitType === 'knight').length).toBe(3);
    expect(died.every((e) => e.killerOwnerId === 1 || e.unitType === 'barge')).toBe(true);
    run(gm, 1);
    for (const m of men.slice(0, 3)) expect(m.isDead).toBe(true);
    expect(gm.allUnits.some((u) => u.transportedBy !== null)).toBe(false);
    expect(gm.corpses.countNear(bp.x, bp.z, 6)).toBe(corpsesBefore); // sem cadáver
  });

  it('a IA não quebra com a barcaça cheia (partida com IA 600 ticks)', () => {
    const gm = makeNavalGm({ ai: true });
    const barge = ship(gm, 'barge', 1, 14, 20);
    const sol = gm.spawnUnit('grunt', 17.5, 20, 1);
    gm.issue({ type: CMD.LOAD, playerId: 1, unitIds: [sol.id], targetId: barge.id });
    run(gm, 30);
    expect(() => run(gm, 30)).not.toThrow();
    expect(BOARD_DISTANCE).toBe(3);
  });
});

describe('Fundição e pesquisas (F4-07b)', () => {
  it('naval_cannons +8 perfurante/nível nos navios de ataque; naval_hulls +3 de armadura (aplica nos já vivos e nos novos)', () => {
    const gm = makeNavalGm();
    hqOf(gm, 0).tier = 3;
    Object.assign(gm.getPlayer(0).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 });
    build(gm, 'barracks', 0, -30, 6);
    const spots = coastSpots(gm, 'shipyard', -1, 2, 10);
    build(gm, 'shipyard', 0, spots[0].x, spots[0].z);
    const foundry = build(gm, 'foundry', 0, spots[1].x, spots[1].z);
    const f = ship(gm, 'frigate', 0, -2, -20);
    const base = { p: f.damage.piercing, a: f.armor };
    expect(foundry.startResearch('naval_cannons', gm)).toBe(true);
    run(gm, RESEARCH.naval_cannons.levels[0].time + 1);
    expect(gm.getResearchLevel('naval_cannons', 0)).toBe(1);
    expect(f.damage.piercing).toBe(base.p + 8);
    expect(foundry.startResearch('naval_hulls', gm)).toBe(true);
    run(gm, RESEARCH.naval_hulls.levels[0].time + 1);
    expect(f.armor).toBe(base.a + 3);
    const g = ship(gm, 'frigate', 0, -2, -26);
    expect(g.damage.piercing).toBe(base.p + 8);
    expect(g.armor).toBe(base.a + 3);
    // petróleo debitado
    expect(gm.getPlayer(0).resources.oil).toBe(9000 - 100 - 80);
  });

  it('pesquisa exige a Fundição da facção e petróleo; nível 2 exige Centro 3', () => {
    const gm = makeNavalGm();
    hqOf(gm, 0).tier = 2;
    Object.assign(gm.getPlayer(0).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 50 });
    build(gm, 'barracks', 0, -30, 6);
    const spots = coastSpots(gm, 'shipyard', -1, 2, 10);
    build(gm, 'shipyard', 0, spots[0].x, spots[0].z);
    const foundry = build(gm, 'foundry', 0, spots[1].x, spots[1].z);
    expect(foundry.startResearch('naval_cannons', gm)).toBe(false); // 50 < 100 de petróleo
    gm.getPlayer(0).resources.oil = 9000;
    expect(foundry.startResearch('naval_cannons', gm)).toBe(true);
    run(gm, 41);
    expect(foundry.startResearch('naval_cannons', gm)).toBe(false); // nível 2 requer Centro 3
    hqOf(gm, 0).tier = 3;
    expect(foundry.startResearch('naval_cannons', gm)).toBe(true);
  });
});

describe('simulação headless com navios (F4-07b)', () => {
  it('estreito-1v1, 3000 ticks com frotas dos dois lados e transporte: sem exceção, navios sempre na água', () => {
    const gm = makeNavalGm({ ai: true });
    const fleet = [];
    for (let i = 0; i < 3; i++) {
      fleet.push(ship(gm, 'frigate', 0, -4, -30 + i * 4));
      fleet.push(ship(gm, 'war_galley', 1, 4, -26 + i * 4));
    }
    fleet.push(ship(gm, 'dreadnought', 0, -6, -10), ship(gm, 'iron_leviathan', 1, 6, 10));
    fleet.push(ship(gm, 'submersible', 0, -8, 4), ship(gm, 'colossal_turtle', 1, 8, -4));
    const barge = ship(gm, 'barge', 0, -14, -20);
    const m = gm.spawnUnit('knight', -17.5, -20, 0);
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: [m.id], targetId: barge.id });
    for (const u of fleet) {
      const enemy = u.ownerId === 0 ? 1 : 0;
      gm.issue({ type: CMD.ATTACK_MOVE, playerId: u.ownerId, unitIds: [u.id], x: enemy === 1 ? 14 : -14, z: u.ownerId === 0 ? 20 : -20 });
    }
    for (let i = 0; i < 3000; i++) {
      gm.simStep(0.05);
      if (i === 400) gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id, x: -17, z: -30 });
    }
    for (const u of gm.allUnits) {
      if (u.layer !== 'naval' || u.isDead) continue;
      expect(gm.terrain.getHeight(u.mesh.position.x, u.mesh.position.z), `${u.type} #${u.id}`).toBeLessThanOrEqual(NAVAL_MAX_HEIGHT + 1e-9);
    }
    expect(place).toBeTypeOf('function');
  });
});
