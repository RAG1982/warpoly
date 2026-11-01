import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { ABILITIES } from '../../src/data/abilities.js';
import { UNITS } from '../../src/data/units.js';
import { RESEARCH } from '../../src/data/upgrades.js';

/** mageBase.test.js — F-MAGE-BASE: Mago (humano) e Necromante (orc) nascem com ataque básico à distância e cura. */

function makeGm(seed = 21) {
  const terrain = new Terrain();
  return new GameManager(terrain, null, null, createMatchConfig({ seed, headless: true }));
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
function cast(gm, caster, abilityId, extra = {}) {
  gm.issue({ type: CMD.CAST, playerId: caster.ownerId, unitIds: [caster.id], abilityId, ...extra });
  gm.simStep(SIM_DT);
}
function notifies(gm) {
  const out = [];
  gm.events.on(EVT.NOTIFY, e => out.push(e.text));
  return out;
}

describe('dados F-MAGE-BASE', () => {
  it('Mago e Necromante começam com ataque básico e a cura própria (sem pesquisa)', () => {
    expect(UNITS.mage.abilities[0]).toBe('mage_heal');
    expect(UNITS.necromancer.abilities[0]).toBe('bone_mend');
    expect(ABILITIES.mage_heal.requires).toEqual([]);
    expect(ABILITIES.bone_mend.requires).toEqual([]);
    expect(ABILITIES.bone_mend.livingOnly).toBe(true);
    for (const id of ['mage', 'necromancer']) {
      expect(UNITS[id].attackRange).toBe(8);
      expect(UNITS[id].damage.piercing + UNITS[id].damage.basic).toBeGreaterThan(0);
      expect(UNITS[id].isRanged).toBe(true);
      expect(UNITS[id].startMana).toBe(85);
    }
  });

  it('as magias avançadas continuam exigindo pesquisa', () => {
    expect(ABILITIES.fireball.requires[0].research).toBe('spell_fireball');
    expect(ABILITIES.death_touch.requires[0].research).toBe('spell_death_touch');
    expect(UNITS.mage.abilities.slice(1)).toEqual(['fireball', 'slow', 'flameshield', 'invisibility', 'polymorph', 'blizzard']);
    expect(UNITS.necromancer.abilities.slice(1)).toEqual(['death_touch', 'haste_spell', 'raise_dead', 'unholy_armor', 'ash_cloud', 'whirlwind']);
  });

  it('o Templário mantém a Cura com pesquisa spell_heal', () => {
    expect(ABILITIES.heal.requires).toEqual([{ research: 'spell_heal' }]);
    expect(RESEARCH.spell_heal.levels[0].effect.unlock).toBe('heal');
  });

  it('teclas de cada card são únicas', () => {
    for (const id of ['mage', 'necromancer']) {
      const keys = UNITS[id].abilities.map(a => ABILITIES[a].hotkey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('Mago e Necromante nascem com ataque básico e cura', () => {
  it('Mago ataca automaticamente à distância e dispara um orbe arcano visível', () => {
    const gm = makeGm();
    const m = unit(gm, 'mage', 0, 0, 0);
    const f = unit(gm, 'knight', 1, 5, 0);
    f.speed = 0;
    const shots = [];
    gm.events.on(EVT.PROJECTILE_FIRED, e => shots.push(e));
    const hp0 = f.hp;
    run(gm, 6);
    expect(shots.some(s => s.ownerId === m.ownerId && s.kind === 'arcane')).toBe(true);
    expect(f.hp).toBeLessThan(hp0);
  });

  it('Necromante ataca à distância com orbe de cinzas', () => {
    const gm = makeGm();
    const n = unit(gm, 'necromancer', 0, 0, 0);
    const f = unit(gm, 'knight', 1, 5, 0);
    f.speed = 0;
    const shots = [];
    gm.events.on(EVT.PROJECTILE_FIRED, e => shots.push(e));
    run(gm, 6);
    expect(shots.some(s => s.ownerId === n.ownerId && s.kind === 'ash')).toBe(true);
    expect(f.hp).toBeLessThan(f.maxHp);
  });

  it('Mago já sai com a cura Arcana ligada no auto-cast e a usa sem pesquisa', () => {
    const gm = makeGm();
    const m = unit(gm, 'mage', 0, 0, 0);
    m.manaRegen = 0;
    expect(m.abilities).toContain('mage_heal');
    expect(m.autocast.mage_heal).toBe(true);
    const ally = unit(gm, 'knight', 0, 2, 0);
    ally.hp = 10;
    const mana0 = m.mana;
    const msgs = notifies(gm);
    cast(gm, m, 'mage_heal', { targetId: ally.id });
    run(gm, 2);
    expect(msgs.join(' ')).not.toMatch(/Requer/);
    expect(ally.hp).toBeGreaterThan(10);
    expect(m.mana).toBeLessThan(mana0);
  });

  it('Necromante cura aliado vivo sem pesquisa, cobrando mana por PV', () => {
    const gm = makeGm();
    const n = unit(gm, 'necromancer', 0, 0, 0);
    n.manaRegen = 0;
    expect(n.autocast.bone_mend).toBe(true);
    const ally = unit(gm, 'grunt', 0, 2, 0);
    ally.hp = 10;
    const mana0 = n.mana;
    cast(gm, n, 'bone_mend', { targetId: ally.id });
    run(gm, 2);
    expect(ally.hp).toBeGreaterThan(10);
    const healed = ally.hp - 10;
    expect(mana0 - n.mana).toBeGreaterThanOrEqual(healed * ABILITIES.bone_mend.manaPerHp - 1e-6);
  });

  it('Cura das Cinzas não tem como alvo mortos-vivos', () => {
    const gm = makeGm();
    const n = unit(gm, 'necromancer', 0, 0, 0);
    const sk = unit(gm, 'skeleton', 0, 2, 0);
    sk.hp = 5;
    const hp0 = sk.hp;
    const msgs = notifies(gm);
    cast(gm, n, 'bone_mend', { targetId: sk.id });
    run(gm, 1);
    expect(sk.hp).toBe(hp0);
    expect(msgs.join(' ')).toMatch(/vivas/);
  });

  it('Mago: magias avançadas exigem pesquisa e não gastam mana sem ela', () => {
    const gm = makeGm();
    const m = unit(gm, 'mage', 0, 0, 0);
    const f = unit(gm, 'knight', 1, 5, 0);
    f.speed = 0;
    m.manaRegen = 0;
    m.mana = 200;
    const msgs = notifies(gm);
    cast(gm, m, 'fireball', { targetId: f.id });
    expect(msgs.join(' ')).toMatch(/Requer/);
    expect(m.mana).toBe(200);
    learn(gm, 0, 'spell_fireball');
    cast(gm, m, 'fireball', { targetId: f.id });
    run(gm, 1.5); // tempo de conjuração (0,6 s): a mana é debitada ao aplicar
    expect(m.mana).toBeLessThan(200);
  });
});
