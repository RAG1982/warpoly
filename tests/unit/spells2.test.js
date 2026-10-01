import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { ABILITIES } from '../../src/data/abilities.js';
import { BUILDINGS } from '../../src/data/buildings.js';
import { UNITS } from '../../src/data/units.js';
import { RESEARCH } from '../../src/data/upgrades.js';
import { hasStatus, addStatus } from '../../src/sim/statuses.js';
import { isDetectedBy } from '../../src/sim/detection.js';
import { evalRequirements } from '../../src/sim/requirements.js';
import { stateChecksum } from '../../src/sim/checksum.js';

/** spells2.test.js — F4-04b: Templo/Altar, Templário/Ogro Feiticeiro, magias restantes, runas, redemoinho. */
function makeGm(seed = 11) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  return new GameManager(scene, terrain, null, null, createMatchConfig({ seed, headless: true }));
}
const isHq = b => b.type === 'castle' || b.type === 'great_hall';
const hqOf = (gm, id) => gm.buildings.find(b => b.ownerId === id && isHq(b));
const arena = gm => { const hq = hqOf(gm, 0); return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 }; };
const place = (u, x, z) => { u.mesh.position.set(x, u.terrain.getHeight(x, z), z); };
const run = (gm, s) => { for (let i = 0, n = Math.round(s / SIM_DT); i < n; i++) gm.simStep(SIM_DT); };
const learn = (gm, owner, ...ids) => ids.forEach(id => gm.getPlayer(owner).setResearchLevel(id, 1));
function rich(gm, id = 0) {
  const p = gm.getPlayer(id);
  p.resources.gold = 50000; p.resources.wood = 50000; p.resources.stone = 50000;
  p.maxPopulation = 200;
  return p;
}
function build(gm, type, ownerId = 0, dx = 0) {
  const hq = hqOf(gm, ownerId);
  const b = gm.createBuilding(type, hq.mesh.position.x + 12 + dx * 8, hq.mesh.position.z + 12, true, ownerId);
  b.isConstructed = true;
  gm.buildings.push(b);
  return b;
}

function unit(gm, type, owner, dx, dz) {
  const a = arena(gm);
  const u = gm.spawnUnit(type, a.x + dx, a.z + dz, owner);
  place(u, a.x + dx, a.z + dz);
  return u;
}
function caster(gm, type, dx = 0, dz = 0, mana = 255) {
  const u = unit(gm, type, 0, dx, dz);
  u.mana = mana;
  u.manaRegen = 0;
  u.isCombatUnit = () => false;
  return u;
}
function foe(gm, dx, dz, type = 'knight') {
  const e = unit(gm, type, 1, dx, dz);
  e.speed = 0;
  e.isCombatUnit = () => false;
  return e;
}
function cast(gm, c, abilityId, extra = {}) {
  gm.issue({ type: CMD.CAST, playerId: 0, unitIds: [c.id], abilityId, ...extra });
  gm.simStep(SIM_DT);
}
function notifies(gm) {
  const out = [];
  gm.events.on(EVT.NOTIFY, e => out.push(e.text));
  return out;
}
const spot = (gm, dx, dz) => { const a = arena(gm); return { x: a.x + dx, z: a.z + dz }; };

describe('dados F4-04b', () => {
  it('Templo/Altar: role temple, exigem Estábulo/Covil e Centro 3', () => {
    for (const [b, req] of [['temple', 'stable'], ['storm_altar', 'ogre_den']]) {
      expect(BUILDINGS[b].role).toBe('temple');
      expect(BUILDINGS[b].requires).toEqual([req, { hq: 3 }]);
      expect(BUILDINGS[b].trains).toEqual([]);
    }
    const gm = makeGm();
    expect(evalRequirements(BUILDINGS.temple.requires, 0, gm).length).toBeGreaterThan(0);
    rich(gm);
    build(gm, 'stable');
    hqOf(gm, 0).tier = 3;
    expect(evalRequirements(BUILDINGS.temple.requires, 0, gm)).toEqual([]);
  });

  it('classes avançadas e pesquisas de magia', () => {
    expect(UNITS.templar.modelOf).toBe('cavalier');
    expect(UNITS.ogre_mage.modelOf).toBe('ogre');
    expect(UNITS.templar.abilities).toEqual(['holy_vision', 'heal', 'exorcism']);
    expect(UNITS.ogre_mage.abilities).toEqual(['eye_of_watch', 'bloodlust', 'runes']);
    expect(RESEARCH.cavalry_class.building).toBe('temple');
    for (const id of ['spell_holy_vision', 'spell_heal', 'spell_exorcism', 'spell_eye', 'spell_bloodlust', 'spell_runes']) {
      expect(RESEARCH[id].building).toBe('temple');
      expect(RESEARCH[id].levels[0].requires).toContainEqual({ research: 'cavalry_class' });
      expect(RESEARCH[id].levels[0].cost.gold).toBeGreaterThanOrEqual(500);
      expect(RESEARCH[id].levels[0].cost.gold).toBeLessThanOrEqual(1000);
    }
    expect(UNITS.necromancer.abilities).toContain('whirlwind');
    expect(RESEARCH.spell_whirlwind.building).toBe('arcane');
    expect(UNITS.watching_eye).toMatchObject({ layer: 'air', detector: true, hp: 1 });
  });
});

describe('cavalry_class (Ordenação / Ritual das Tempestades)', () => {
  it('promove cavaleiros vivos a Templários (mantém % de PV, ganha mana) e o Estábulo treina a classe nova', () => {
    const gm = makeGm();
    const p = rich(gm);
    hqOf(gm, 0).tier = 3;
    const stable = build(gm, 'stable', 0, 0);
    const temple = build(gm, 'temple', 0, 1);
    const hqp = hqOf(gm, 0).mesh.position;
    const cav = [0, 1].map(i => { const c = gm.spawnUnit('cavalier', hqp.x + 4 + i * 2, hqp.z - 6, 0); place(c, hqp.x + 4 + i * 2, hqp.z - 6); return c; });
    const ogre = gm.spawnUnit('ogre', 20, 20, 1);
    cav[0].hp = cav[0].maxHp / 2;
    expect(stable.queueUnit('templar', gm)).toBe(false);
    gm.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: temple.id, upgradeId: 'cavalry_class' });
    gm.simStep(SIM_DT);
    expect(p.resources.gold).toBe(50000 - 1000);
    run(gm, 61);
    expect(p.getResearchLevel('cavalry_class')).toBe(1);
    for (const c of cav) {
      expect(c.type).toBe('templar');
      expect(c.name).toBe('Templário');
      expect(c.maxMana).toBe(255);
      expect(c.mana).toBeGreaterThanOrEqual(85);
      expect(c.abilities).toEqual(['holy_vision', 'heal', 'exorcism']);
    }
    expect(cav[0].maxHp).toBeCloseTo(345, 5);
    expect(cav[0].hp / cav[0].maxHp).toBeCloseTo(0.5, 5);
    expect(ogre.type).toBe('ogre'); // orcs não são afetados
    expect(gm.resolveTrainType('cavalier', 0)).toBe('templar');
    expect(stable.queueUnit('cavalier', gm)).toBe(true);
    expect(stable.queue[0].type).toBe('templar');
    expect(cav[0].autocast.heal).toBe(true); // Cura já nasce em auto-cast
  });

  it('Altar promove ogros a Ogros Feiticeiros', () => {
    const gm = makeGm();
    rich(gm, 1);
    hqOf(gm, 1).tier = 3;
    build(gm, 'ogre_den', 1, 0);
    const altar = build(gm, 'storm_altar', 1, 1);
    const hq1 = hqOf(gm, 1).mesh.position;
    const o = gm.spawnUnit('ogre', hq1.x + 4, hq1.z - 6, 1);
    gm.issue({ type: CMD.RESEARCH, playerId: 1, buildingId: altar.id, upgradeId: 'cavalry_class' });
    gm.simStep(SIM_DT);
    run(gm, 61);
    expect(o.type).toBe('ogre_mage');
    expect(o.abilities).toEqual(['eye_of_watch', 'bloodlust', 'runes']);
    expect(o.maxHp).toBeCloseTo(352, 5);
  });
});

describe('magias humanas', () => {
  it('requisito de pesquisa bloqueia a magia', () => {
    const gm = makeGm();
    const t = caster(gm, 'templar');
    const msgs = notifies(gm);
    const p = spot(gm, 10, 0);
    cast(gm, t, 'holy_vision', { x: p.x, z: p.z });
    run(gm, 2);
    expect(t.mana).toBe(255);
    expect(msgs.some(m => m.includes('Requer'))).toBe(true);
  });

  it('Vista Sagrada revela a área por 20 s e expira', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_holy_vision');
    const t = caster(gm, 'templar');
    const h0 = hqOf(gm, 0).mesh.position;
    const h1 = hqOf(gm, 1).mesh.position;
    const d = Math.hypot(h1.x - h0.x, h1.z - h0.z) || 1;
    const ux = (h1.x - h0.x) / d;
    const uz = (h1.z - h0.z) / d;
    // conjurador no meio do caminho entre as bases; alvo 30 u à frente (fora da visão de qualquer unidade/construção)
    place(t, h0.x + ux * d * 0.5, h0.z + uz * d * 0.5);
    const x = t.mesh.position.x + ux * 30;
    const z = t.mesh.position.z + uz * 30;
    gm.fogOfWar.activeVision.fill(0);
    expect(gm.fogOfWar.grid.isVisible(x, z)).toBe(false);
    cast(gm, t, 'holy_vision', { x, z });
    run(gm, 2);
    expect(t.mana).toBeLessThan(255 - 69);
    expect(gm.fogOfWar.isVisible(x, z)).toBe(true);
    expect(gm.fogOfWar.isVisible(x + ux * 8, z + uz * 8)).toBe(true);
    expect(gm.fogOfWar.isVisible(x + ux * 14, z + uz * 14)).toBe(false);
    run(gm, 23);
    expect(gm.fogOfWar.hasTimedReveals).toBe(false);
    expect(gm.fogOfWar.isVisible(x, z)).toBe(false);
  });

  it('Cura: cura por PV (6 de mana por PV), auto-cast em aliados < 60 % PV e repete até curar', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_heal');
    const t = caster(gm, 'templar', 0, 0, 100);
    const ally = unit(gm, 'knight', 0, 3, 0);
    ally.isCombatUnit = () => false;
    ally.hp = ally.maxHp * 0.5;
    const hp0 = ally.hp;
    run(gm, 2.5); // auto-cast liga sozinho (varre a cada 1 s; cada cura leva 1 s)
    expect(ally.hp).toBeGreaterThan(hp0);
    expect(ally.hp - hp0).toBeLessThanOrEqual(5.01 * 2);
    run(gm, 4);
    const healed = ally.hp - hp0;
    expect(healed).toBeGreaterThan(8);
    expect(100 - t.mana).toBeCloseTo(healed * 6, 0);
    // sem mana: para
    t.mana = 3;
    const h1 = ally.hp;
    run(gm, 3);
    expect(ally.hp).toBe(h1);
    // aliado acima de 60 %: o auto-cast não age
    t.mana = 100;
    ally.hp = ally.maxHp * 0.8;
    const h2 = ally.hp;
    run(gm, 3);
    expect(ally.hp).toBe(h2);
    expect(t.mana).toBe(100);
  });

  it('Cura manual repete no alvo enquanto ele estiver ferido; nunca passa de maxHp', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_heal');
    const t = caster(gm, 'templar', 0, 0, 255);
    t.autocast.heal = false;
    const ally = unit(gm, 'knight', 0, 3, 0);
    ally.isCombatUnit = () => false;
    ally.hp = ally.maxHp - 12;
    cast(gm, t, 'heal', { targetId: ally.id });
    run(gm, 6);
    expect(ally.hp).toBe(ally.maxHp);
    expect(255 - t.mana).toBeCloseTo(12 * 6, 0);
  });

  it('Exorcismo só fere mortos-vivos: min(PV do alvo, mana/4), 4 de mana por PV', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_exorcism');
    const t = caster(gm, 'templar', 0, 0, 100);
    const skel = foe(gm, 5, 0, 'skeleton');
    cast(gm, t, 'exorcism', { targetId: skel.id });
    run(gm, 2);
    expect(skel.hp).toBe(skel.maxHp - 25); // 100/4
    expect(t.mana).toBe(0);
    // PV do alvo limita o dano
    t.mana = 255;
    cast(gm, t, 'exorcism', { targetId: skel.id });
    run(gm, 2);
    expect(skel.isDead || skel.hp <= 0).toBe(true);
    expect(255 - t.mana).toBe(35 * 4);
    // alvo vivo: inválido, sem custo
    const gm2 = makeGm();
    learn(gm2, 0, 'spell_exorcism');
    const t2 = caster(gm2, 'templar');
    const k = foe(gm2, 5, 0, 'knight');
    const msgs = notifies(gm2);
    cast(gm2, t2, 'exorcism', { targetId: k.id });
    run(gm2, 2);
    expect(k.hp).toBe(k.maxHp);
    expect(t2.mana).toBe(255);
    expect(msgs.some(m => m.includes('Alvo inválido'))).toBe(true);
  });
});

describe('magias orcs', () => {
  it('Olho Vigia: unidade aérea com lifetime, detector, imune, não consome suprimento e some sem baixa', () => {
    const gm = makeGm();
    learn(gm, 1, 'spell_eye');
    const o = gm.spawnUnit('ogre_mage', 0, 0, 1);
    const a = arena(gm);
    place(o, a.x, a.z);
    o.mana = 255; o.manaRegen = 0; o.isCombatUnit = () => false;
    const pop0 = gm.getPlayer(1).population;
    const target = spot(gm, 8, 0);
    gm.issue({ type: CMD.CAST, playerId: 1, unitIds: [o.id], abilityId: 'eye_of_watch', x: target.x, z: target.z });
    gm.simStep(SIM_DT);
    run(gm, 2);
    const eye = gm.allUnits.find(u => u.type === 'watching_eye');
    expect(eye).toBeTruthy();
    expect(eye.layer).toBe('air');
    expect(eye.ownerId).toBe(1);
    expect(eye.lifetime).toBeGreaterThan(55);
    expect(o.mana).toBeLessThan(255 - 69);
    expect(gm.getPlayer(1).population).toBe(pop0);
    // imune
    eye.takeDamage(50, null, gm.allUnits);
    expect(eye.hp).toBe(1);
    expect(eye.isDead).toBe(false);
    // detector: revela invisível a 10 u (> contato 2)
    const inv = unit(gm, 'knight', 0, 8, 6);
    place(inv, eye.mesh.position.x + 10, eye.mesh.position.z);
    addStatus(inv, 'invisible', 100);
    expect(isDetectedBy(gm, inv, 1)).toBe(true);
    place(inv, eye.mesh.position.x + 20, eye.mesh.position.z);
    expect(isDetectedBy(gm, inv, 1)).toBe(false);
    // não é alvo: corpo a corpo, cerco e até arqueiro ignoram
    const grunt = unit(gm, 'grunt', 0, 8, 1);
    expect(grunt._canEngage(eye)).toBe(false);
    const ballista = unit(gm, 'ballista', 0, 9, 1);
    expect(ballista._canEngage(eye)).toBe(false);
    const archer = unit(gm, 'archer', 0, 10, 1);
    expect(archer._canEngage(eye)).toBe(false); // imune: ninguém perde tempo mirando
    // expira sem cadáver nem baixa
    const lost0 = gm.matchStats.get ? null : null;
    void lost0;
    run(gm, 64);
    expect(gm.allUnits.includes(eye)).toBe(false);
    expect(gm.corpses.count).toBe(0);
  });

  it('regra mínima de camada aérea: só atacantes à distância não-cerco engajam', () => {
    const gm = makeGm();
    const fake = { layer: 'air', immune: false, mesh: { position: new THREE.Vector3() }, collisionRadius: 0.5 };
    expect(unit(gm, 'grunt', 0, 0, 0)._canEngage(fake)).toBe(false);
    expect(unit(gm, 'catapult', 0, 1, 0)._canEngage(fake)).toBe(false);
    expect(unit(gm, 'archer', 0, 2, 0)._canEngage(fake)).toBe(true);
  });

  it('Sede de Batalha: dano x1,5 e cooldown de ataque menor por 20 s', () => {
    const gm = makeGm();
    learn(gm, 1, 'spell_bloodlust');
    const o = gm.spawnUnit('ogre_mage', 0, 0, 1);
    const a = arena(gm);
    place(o, a.x, a.z);
    o.mana = 255; o.manaRegen = 0; o.isCombatUnit = () => false;
    const ally = gm.spawnUnit('grunt', a.x + 3, a.z, 1);
    place(ally, a.x + 3, a.z);
    ally.isCombatUnit = () => false;
    const cd0 = ally.effectiveAttackCooldown ? ally.effectiveAttackCooldown : null;
    void cd0;
    gm.issue({ type: CMD.CAST, playerId: 1, unitIds: [o.id], abilityId: 'bloodlust', targetId: ally.id });
    gm.simStep(SIM_DT);
    run(gm, 2);
    expect(hasStatus(ally, 'bloodlust')).toBe(true);
    expect(ally.mods.damageMul).toBe(1.5);
    expect(ally.mods.attackSpeedMul).toBe(1.5);
    expect(o.mana).toBeLessThan(256 - 50);
    run(gm, 20);
    expect(hasStatus(ally, 'bloodlust')).toBe(false);
  });

  function ogreMage(gm, mana = 255) {
    const o = gm.spawnUnit('ogre_mage', 0, 0, 1);
    const a = arena(gm);
    place(o, a.x, a.z);
    o.mana = mana; o.manaRegen = 0; o.isCombatUnit = () => false;
    return o;
  }
  const castAs1 = (gm, c, id, x, z) => {
    gm.issue({ type: CMD.CAST, playerId: 1, unitIds: [c.id], abilityId: id, x, z });
    gm.simStep(SIM_DT);
  };
  const enemyOf1 = (gm, dx, dz, type = 'knight') => {
    const e = unit(gm, type, 0, dx, dz);
    e.speed = 0;
    e.isCombatUnit = () => false;
    return e;
  };

  it('Runas Explosivas: cria 6, explodem em inimigo terrestre (dano mágico 60 em área) e somem', () => {
    const gm = makeGm();
    learn(gm, 1, 'spell_runes');
    const o = ogreMage(gm);
    const c = spot(gm, 6, 0);
    castAs1(gm, o, 'runes', c.x, c.z);
    run(gm, 2);
    expect(gm.hazards.count('rune', 1)).toBe(6);
    expect(o.mana).toBeLessThan(256 - 200);
    // aliado não aciona
    const friend = unit(gm, 'grunt', 1, 6, 0);
    place(friend, c.x + 2.5, c.z);
    friend.speed = 0;
    run(gm, 1);
    expect(gm.hazards.count('rune', 1)).toBe(6);
    // inimigo pisa numa runa
    const e = enemyOf1(gm, 0, 0);
    place(e, c.x + 2.5, c.z);
    gm.unitGrid.update(e, e.mesh.position.x, e.mesh.position.z, e.collisionRadius);
    const hp0 = e.hp;
    run(gm, 1);
    expect(e.hp).toBeLessThan(hp0);
    expect(gm.hazards.count('rune', 1)).toBeLessThan(6);
  });

  it('Runas: expiram em 60 s e o limite é 12 por jogador', () => {
    const gm = makeGm();
    learn(gm, 1, 'spell_runes');
    const o = ogreMage(gm, 255);
    o.maxMana = 1000;
    const c = spot(gm, 0, 0);
    for (let i = 0; i < 3; i++) {
      o.mana = 255;
      castAs1(gm, o, 'runes', c.x + 4 + i * 2, c.z);
      run(gm, 3);
    }
    expect(gm.hazards.count('rune', 1)).toBe(12);
    run(gm, 70);
    expect(gm.hazards.count('rune', 1)).toBe(0);
  });

  it('Redemoinho: vaga deterministicamente, causa dano em terrestres (inclusive amigos) e dura 12 s', () => {
    const go = () => {
      const gm = makeGm(7);
      learn(gm, 1, 'spell_whirlwind');
      const n = gm.spawnUnit('necromancer', 0, 0, 1);
      const a = arena(gm);
      place(n, a.x, a.z);
      n.mana = 255; n.manaRegen = 0; n.isCombatUnit = () => false;
      const c = spot(gm, 6, 0);
      castAs1(gm, n, 'whirlwind', c.x, c.z);
      const victim = unit(gm, 'knight', 0, 6, 0);
      victim.speed = 0;
      victim.isCombatUnit = () => false;
      const pos = [];
      for (let i = 0; i < 80; i++) {
        gm.simStep(SIM_DT);
        const h = gm.hazards.items[0];
        if (h) pos.push([Math.round(h.x * 1000), Math.round(h.z * 1000)]);
      }
      return { pos, hash: stateChecksum(gm), gm, victim, n };
    };
    const r1 = go();
    const r2 = go();
    expect(r1.pos).toEqual(r2.pos);
    expect(r1.hash).toBe(r2.hash);
    expect(r1.pos.length).toBeGreaterThan(30);
    const moved = r1.pos.some(p => p[0] !== r1.pos[0][0] || p[1] !== r1.pos[0][1]);
    expect(moved).toBe(true);
    const gm = r1.gm;
    expect(r1.n.mana).toBeLessThan(256 - 99);
    // dura 12 s
    run(gm, 12);
    expect(gm.hazards.count('whirlwind')).toBe(0);
  });

  it('Redemoinho fere quem está dentro (aliados também)', () => {
    const gm = makeGm();
    learn(gm, 1, 'spell_whirlwind');
    const n = gm.spawnUnit('necromancer', 0, 0, 1);
    const a = arena(gm);
    place(n, a.x, a.z);
    n.mana = 255; n.manaRegen = 0; n.isCombatUnit = () => false;
    const c = spot(gm, 6, 0);
    castAs1(gm, n, 'whirlwind', c.x, c.z);
    run(gm, 1);
    const h = gm.hazards.items[0];
    const enemy = enemyOf1(gm, 0, 0);
    const friend = gm.spawnUnit('grunt', 0, 0, 1);
    place(enemy, h.x, h.z);
    place(friend, h.x, h.z + 0.5);
    friend.speed = 0;
    friend.isCombatUnit = () => false;
    for (const u of [enemy, friend]) gm.unitGrid.update(u, u.mesh.position.x, u.mesh.position.z, u.collisionRadius);
    const e0 = enemy.hp;
    const f0 = friend.hp;
    gm.hazards.step(0.5);
    expect(enemy.hp).toBeLessThan(e0);
    expect(friend.hp).toBeLessThan(f0);
  });
});

describe('determinismo e sem vazamento', () => {
  it('runas + redemoinho + olho: mesmo checksum em 2 execuções', () => {
    const go = () => {
      const gm = makeGm(5);
      learn(gm, 1, 'spell_runes', 'spell_eye');
      const o = gm.spawnUnit('ogre_mage', 0, 0, 1);
      const a = arena(gm);
      place(o, a.x, a.z);
      o.mana = 255; o.manaRegen = 0; o.isCombatUnit = () => false;
      gm.issue({ type: CMD.CAST, playerId: 1, unitIds: [o.id], abilityId: 'runes', x: a.x + 6, z: a.z });
      gm.simStep(SIM_DT);
      run(gm, 4);
      return stateChecksum(gm);
    };
    expect(go()).toBe(go());
  });

  it('o Olho Vigia some sem sobrar unidade/malha', () => {
    const gm = makeGm();
    learn(gm, 1, 'spell_eye');
    const o = gm.spawnUnit('ogre_mage', 0, 0, 1);
    const a = arena(gm);
    place(o, a.x, a.z);
    o.mana = 255; o.manaRegen = 0; o.isCombatUnit = () => false;
    gm.issue({ type: CMD.CAST, playerId: 1, unitIds: [o.id], abilityId: 'eye_of_watch', x: a.x + 5, z: a.z });
    gm.simStep(SIM_DT);
    run(gm, 2);
    const eyeU = gm.allUnits.find(u => u.type === 'watching_eye');
    expect(eyeU).toBeTruthy();
    expect(gm.scene.children.includes(eyeU.mesh)).toBe(true);
    run(gm, 66);
    expect(gm.scene.children.includes(eyeU.mesh)).toBe(false);
    expect(gm.allUnits.filter(u => u.type === 'watching_eye').length).toBe(0);
  });

  it('catálogo: toda magia nova tem requisito de pesquisa existente', () => {
    for (const id of ['holy_vision', 'heal', 'exorcism', 'eye_of_watch', 'bloodlust', 'runes', 'whirlwind']) {
      const r = ABILITIES[id].requires[0].research;
      expect(RESEARCH[r]).toBeTruthy();
      expect(RESEARCH[r].levels[0].effect.unlock).toBe(id);
    }
  });
});
