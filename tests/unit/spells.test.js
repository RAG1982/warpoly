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
import { CORPSE_LIFETIME } from '../../src/data/combat.js';
import { hasStatus } from '../../src/sim/statuses.js';
import { isDetectedBy } from '../../src/sim/detection.js';
import { stateChecksum } from '../../src/sim/checksum.js';

/** spells.test.js — F4-04: magias do Mago/Necromante, canalização, invisibilidade, polimorfia, cadáveres. */
function makeGm(seed = 11) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const gm = new GameManager(scene, terrain, null, null, createMatchConfig({ seed, headless: true }));
  return gm;
}
const hqOf = (gm, id) => gm.buildings.find(b => b.ownerId === id && (b.type === 'castle' || b.type === 'great_hall'));
const arena = gm => { const hq = hqOf(gm, 0); return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 }; };
const place = (u, x, z) => { u.mesh.position.set(x, u.terrain.getHeight(x, z), z); };
const run = (gm, s) => { for (let i = 0, n = Math.round(s / SIM_DT); i < n; i++) gm.simStep(SIM_DT); };
const learn = (gm, owner, ...ids) => ids.forEach(id => gm.getPlayer(owner).setResearchLevel(id, 1));

function unit(gm, type, owner, dx, dz) {
  const a = arena(gm);
  const u = gm.spawnUnit(type, a.x + dx, a.z + dz, owner);
  place(u, a.x + dx, a.z + dz);
  return u;
}
function mage(gm, dx = 0, dz = 0, type = 'mage', mana = 255) {
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
function cast(gm, caster, abilityId, extra = {}) {
  gm.issue({ type: CMD.CAST, playerId: 0, unitIds: [caster.id], abilityId, ...extra });
  gm.simStep(SIM_DT);
}
function notifies(gm) {
  const out = [];
  gm.events.on(EVT.NOTIFY, e => out.push(e.text));
  return out;
}

describe('dados F4-04', () => {
  it('construções arcanas exigem Centro nível 3 e treinam conjuradores', () => {
    for (const [b, u] of [['arcane_tower', 'mage'], ['ash_sanctum', 'necromancer']]) {
      expect(BUILDINGS[b].role).toBe('arcane');
      expect(BUILDINGS[b].requires).toContainEqual({ hq: 3 });
      expect(BUILDINGS[b].trains).toEqual([u]);
      expect(UNITS[u].requires).toContainEqual({ hq: 3 });
      expect(UNITS[u].maxMana).toBe(255);
    }
    expect(UNITS.skeleton.undead).toBe(true);
    expect(ABILITIES.fireball.requires[0].research).toBe('spell_fireball');
  });
});

describe('magias do Mago', () => {
  it('requisito de pesquisa bloqueia a magia e não gasta mana', () => {
    const gm = makeGm();
    const m = mage(gm);
    const e = foe(gm, 5, 0);
    const msgs = notifies(gm);
    cast(gm, m, 'slow', { targetId: e.id });
    run(gm, 2);
    expect(hasStatus(e, 'slow')).toBe(false);
    expect(m.mana).toBe(255);
    expect(msgs.some(t => t.includes('Requer'))).toBe(true);
  });

  it('Lentidão: custo, status e expiração', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_slow');
    const m = mage(gm);
    const e = foe(gm, 5, 0);
    cast(gm, m, 'slow', { targetId: e.id });
    run(gm, 2);
    expect(hasStatus(e, 'slow')).toBe(true);
    expect(e.mods.speedMul).toBe(0.5);
    expect(m.mana).toBeLessThan(255 - 49);
    run(gm, 31);
    expect(hasStatus(e, 'slow')).toBe(false);
  });

  it('Bola de Fogo atinge até 3 alvos em linha', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_fireball');
    const m = mage(gm, 0, 0);
    const es = [foe(gm, 8, 0), foe(gm, 9, 0), foe(gm, 10, 0), foe(gm, 11, 0)];
    cast(gm, m, 'fireball', { targetId: es[0].id });
    run(gm, 4);
    const hit = es.filter(e => e.hp < e.maxHp).length;
    expect(hit).toBe(3);
    expect(es[3].hp).toBe(es[3].maxHp);
    expect(m.mana).toBeLessThan(231);
  });

  it('Escudo de Chamas devolve 8 no corpo a corpo e não no ataque à distância', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_flameshield');
    const m = mage(gm);
    const tank = unit(gm, 'knight', 0, 2, 0);
    tank.isCombatUnit = () => false;
    cast(gm, m, 'flameshield', { targetId: tank.id });
    run(gm, 2);
    expect(hasStatus(tank, 'flameshield')).toBe(true);
    const melee = foe(gm, 3, 0, 'grunt');
    place(melee, tank.mesh.position.x + 1.5, tank.mesh.position.z);
    melee.isCombatUnit = () => true;
    melee.orderAttack(tank);
    const hp0 = melee.hp;
    run(gm, 3);
    expect(melee.hp).toBeLessThanOrEqual(hp0 - 8);

    const archer = foe(gm, -6, 0, 'axethrower');
    archer.isCombatUnit = () => true;
    place(archer, tank.mesh.position.x + 8, tank.mesh.position.z);
    const a0 = archer.hp;
    archer.orderAttack(tank);
    run(gm, 3);
    expect(archer.hp).toBe(a0);
  });

  it('Transmutação: vira ovelha (HP<=20), mantém id/dono, não afeta cerco e não vaza malha', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_polymorph');
    const m = mage(gm);
    const e = foe(gm, 5, 0, 'knight');
    const id = e.id;
    const siege = foe(gm, 5, 3, 'catapult');
    const scene0 = gm.scene.children.length;
    cast(gm, m, 'polymorph', { targetId: e.id });
    run(gm, 3);
    expect(e.type).toBe('sheep');
    expect(e.id).toBe(id);
    expect(e.ownerId).toBe(1);
    expect(e.hp).toBeLessThanOrEqual(20);
    expect(e.abilities.length).toBe(0);
    expect(gm.scene.children.length).toBe(scene0);
    const msgs = notifies(gm);
    m.mana = 255;
    m.cooldowns = {};
    cast(gm, m, 'polymorph', { targetId: siege.id });
    run(gm, 2);
    expect(siege.type).toBe('catapult');
    expect(msgs.some(t => t.includes('transmutado'))).toBe(true);
  });

  it('Nevasca: 8 ondas, mana por onda, interrompe sem mana e por nova ordem', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_blizzard');
    const a = arena(gm);
    const m = mage(gm, 0, 0);
    const e = foe(gm, 6, 0, 'knight');
    e.maxHp = e.hp = 1000;
    cast(gm, m, 'blizzard', { x: a.x + 6, z: a.z });
    run(gm, 12);
    const waves = Math.round((255 - m.mana) / 25);
    expect(waves).toBe(8);
    expect(e.hp).toBeLessThan(1000 - 8 * 4);

    const m2 = mage(gm, 0, 4, 'mage', 60); // só 2 ondas de mana
    const e2 = foe(gm, 6, 4, 'knight');
    e2.maxHp = e2.hp = 1000;
    m2.manaRegen = 0;
    cast(gm, m2, 'blizzard', { x: a.x + 6, z: a.z + 4 });
    run(gm, 12);
    expect(Math.round((60 - m2.mana) / 25)).toBe(2);

    const m3 = mage(gm, 0, -4);
    m3.manaRegen = 0;
    cast(gm, m3, 'blizzard', { x: a.x + 6, z: a.z - 4 });
    run(gm, 2.5);
    gm.issue({ type: CMD.STOP, playerId: 0, unitIds: [m3.id] });
    run(gm, 8);
    const paid = Math.round((255 - m3.mana) / 25);
    expect(paid).toBeGreaterThanOrEqual(2);
    expect(paid).toBeLessThan(8);
  });
});

describe('invisibilidade e detecção', () => {
  it('não é alvo sem detector; é com unidade adjacente; acaba ao atacar', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_invisibility');
    const m = mage(gm);
    const target = unit(gm, 'knight', 0, 3, 0);
    cast(gm, m, 'invisibility', { targetId: target.id });
    run(gm, 2);
    expect(target.mods.invisible).toBe(true);
    const e = foe(gm, 9, 0, 'grunt');
    e.isCombatUnit = () => true;
    place(e, target.mesh.position.x + 6, target.mesh.position.z);
    expect(isDetectedBy(gm, target, 1)).toBe(false);
    expect(e.findNearestHostileUnit(gm.allUnits, 15)).not.toBe(target);
    place(e, target.mesh.position.x + 1.5, target.mesh.position.z);
    gm.unitGrid.update(e, e.mesh.position.x, e.mesh.position.z, 0.6);
    expect(isDetectedBy(gm, target, 1)).toBe(true);
    // ataque quebra a invisibilidade
    target.isCombatUnit = () => true;
    target.orderAttack(e);
    run(gm, 3);
    expect(target.mods.invisible).toBe(false);
  });

  it('dano e lançamento também revelam', () => {
    const gm = makeGm();
    const t = unit(gm, 'knight', 0, 0, 0);
    const { addStatus } = require_statuses();
    addStatus(t, 'invisible', 100);
    expect(t.mods.invisible).toBe(true);
    t.takeDamage(1, null, gm.allUnits);
    expect(t.mods.invisible).toBe(false);
  });
});

function require_statuses() {
  return { addStatus: (u, id, d) => import_addStatus(u, id, d) };
}
import { addStatus as import_addStatus } from '../../src/sim/statuses.js';

describe('magias do Necromante e cadáveres', () => {
  it('Toque da Morte cura o necromante em 50% do dano', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_death_touch');
    const n = mage(gm, 0, 0, 'necromancer');
    n.hp = 10;
    const e = foe(gm, 5, 0, 'knight');
    e.maxHp = e.hp = 500;
    cast(gm, n, 'death_touch', { targetId: e.id });
    run(gm, 3);
    const dealt = 500 - e.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(n.hp).toBeCloseTo(10 + dealt * 0.5, 0);
  });

  it('Pressa e Armadura Profana (invulnerável 6 s, depois -50% PV)', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_haste', 'spell_unholy_armor');
    const n = mage(gm, 0, 0, 'necromancer');
    const ally = unit(gm, 'knight', 0, 2, 0);
    ally.isCombatUnit = () => false;
    cast(gm, n, 'haste_spell', { targetId: ally.id });
    run(gm, 2);
    expect(ally.mods.speedMul).toBe(1.5);
    cast(gm, n, 'unholy_armor', { targetId: ally.id });
    run(gm, 2);
    const hp = ally.hp;
    ally.takeDamage(50, null, gm.allUnits);
    expect(ally.hp).toBe(hp);
    run(gm, 5);
    expect(ally.hp).toBeCloseTo(hp * 0.5, 0);
  });

  it('cadáveres: registro, expiração e Erguer Mortos (2 esqueletos temporários, sem cadáver)', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_raise_dead');
    const n = mage(gm, 0, 0, 'necromancer');
    const v1 = unit(gm, 'knight', 1, 2, 0);
    const v2 = unit(gm, 'knight', 1, 3, 0);
    const v3 = unit(gm, 'knight', 1, 3, 1);
    v1.die(); v2.die(); v3.die();
    expect(gm.corpses.count).toBe(3);
    const pop0 = gm.getPlayer(0).population;
    cast(gm, n, 'raise_dead');
    run(gm, 2);
    expect(gm.corpses.count).toBe(1);
    const sk = gm.allUnits.filter(u => u.type === 'skeleton' && !u.isDead);
    expect(sk.length).toBe(2);
    expect(sk[0].lifetime).toBeGreaterThan(50);
    expect(sk[0].ownerId).toBe(0);
    expect(gm.getPlayer(0).population).toBe(pop0);
    sk.forEach(u => { u.isCombatUnit = () => false; });
    run(gm, 62);
    expect(gm.allUnits.filter(u => u.type === 'skeleton').length).toBe(0);
    expect(gm.corpses.items.filter(c => c.active && c.type === 'skeleton').length).toBe(0);
    run(gm, CORPSE_LIFETIME + 1);
    expect(gm.corpses.count).toBe(0);
  });

  it('cerco, esqueleto e ovelha não deixam cadáver', () => {
    const gm = makeGm();
    for (const t of ['catapult', 'sheep']) unit(gm, t, 1, 4, 4).die();
    expect(gm.corpses.count).toBe(0);
  });

  it('Erguer Mortos sem cadáver não lança', () => {
    const gm = makeGm();
    learn(gm, 0, 'spell_raise_dead');
    const n = mage(gm, 0, 0, 'necromancer');
    const msgs = notifies(gm);
    cast(gm, n, 'raise_dead');
    run(gm, 2);
    expect(n.mana).toBe(255);
    expect(msgs.some(t => t.includes('cadáver'))).toBe(true);
  });
});

describe('determinismo', () => {
  it('2 execuções com magias dão o mesmo checksum', () => {
    const go = () => {
      const gm = makeGm(5);
      learn(gm, 0, 'spell_slow', 'spell_raise_dead');
      const m = mage(gm);
      const e = foe(gm, 5, 0);
      cast(gm, m, 'slow', { targetId: e.id });
      run(gm, 5);
      return stateChecksum(gm);
    };
    expect(go()).toBe(go());
  });
});
