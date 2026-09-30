import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { ABILITIES, getAbility } from '../../src/data/abilities.js';
import { addStatus, STATUS_DEFS, tickStatuses, hasStatus } from '../../src/sim/statuses.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { Unit } from '../../src/entities/Unit.js';

/**
 * abilities.test.js — F4-03: mana, recarga, CMD.CAST, efeitos, status, auto-cast e determinismo.
 * Jogador 0 (humano) × jogador 1 (orc). `gm.debugAbilities = true` libera `debug_bolt`/`debug_heal`.
 */
function makeGm(seed = 7) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);
  gm.debugAbilities = true;
  return gm;
}

const hqOf = (gm, id) => gm.buildings.find(b => b.ownerId === id && (b.type === 'castle' || b.type === 'great_hall'));

function arena(gm) {
  const hq = hqOf(gm, 0);
  return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 };
}

const place = (u, x, z) => {
  u.mesh.position.x = x;
  u.mesh.position.z = z;
  u.mesh.position.y = u.terrain.getHeight(x, z);
};

/** Conjurador do jogador 0 com as duas habilidades de teste. */
function caster(gm, dx = 0, dz = 0, mana = 100) {
  const a = arena(gm);
  const u = gm.spawnUnit('knight', a.x + dx, a.z + dz, 0);
  place(u, a.x + dx, a.z + dz);
  u.setupMana({ maxMana: 100, startMana: mana, abilities: ['debug_bolt', 'debug_heal'] });
  u.isCombatUnit = () => false; // não entra em combate sozinho: isola o efeito da habilidade
  return u;
}

function enemy(gm, dx, dz, type = 'villager') {
  const a = arena(gm);
  const e = gm.spawnUnit(type, a.x + dx, a.z + dz, 1);
  place(e, a.x + dx, a.z + dz);
  e.speed = 0; // alvo parado (a IA do jogador 1 não o tira do lugar)
  return e;
}

function ally(gm, dx, dz) {
  const a = arena(gm);
  const u = gm.spawnUnit('knight', a.x + dx, a.z + dz, 0);
  place(u, a.x + dx, a.z + dz);
  u.isCombatUnit = () => false;
  return u;
}

function run(gm, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

function cast(gm, units, abilityId, extra = {}) {
  gm.issue({ type: CMD.CAST, playerId: 0, unitIds: units.map(u => u.id), abilityId, ...extra });
  gm.simStep(SIM_DT);
}

function notifies(gm) {
  const out = [];
  gm.events.on(EVT.NOTIFY, e => out.push(e.text));
  return out;
}

describe('dados de habilidades (F4-03)', () => {
  it('debug_bolt/debug_heal existem só com debug', () => {
    expect(getAbility('debug_bolt')).toBeNull();
    expect(getAbility('debug_heal', { debug: false })).toBeNull();
    expect(getAbility('debug_bolt', { debug: true })).toBe(ABILITIES.debug_bolt);
    expect(ABILITIES.debug_bolt).toMatchObject({ target: 'enemy', range: 12, manaCost: 10, cooldown: 3, debugOnly: true });
    expect(ABILITIES.debug_heal).toMatchObject({ target: 'ally', debugOnly: true });
  });

  it('sem debug o CAST é ignorado (habilidade inexistente)', () => {
    const gm = makeGm();
    const u = caster(gm);
    const e = enemy(gm, 4, 0);
    gm.debugAbilities = false;
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    run(gm, 2);
    expect(e.hp).toBe(e.maxHp);
    expect(u.mana).toBe(100);
  });
});

describe('mana e recarga', () => {
  it('regenera 1/s até o teto e não passa dele', () => {
    const gm = makeGm();
    const u = caster(gm, 0, 0, 50);
    run(gm, 10);
    expect(u.mana).toBeGreaterThan(59.5);
    expect(u.mana).toBeLessThan(60.5);
    run(gm, 60);
    expect(u.mana).toBe(100);
  });

  it('unidade sem maxMana não tem mana nem barra', () => {
    const gm = makeGm();
    const a = arena(gm);
    const u = gm.spawnUnit('knight', a.x, a.z, 0);
    expect(u.maxMana).toBe(0);
    expect(u.manaFillMesh).toBeUndefined();
    run(gm, 2);
    expect(u.mana).toBe(0);
  });

  it('CAST sem mana é recusado com NOTIFY e nada acontece', () => {
    const gm = makeGm();
    const out = notifies(gm);
    const u = caster(gm, 0, 0, 5);
    u.manaRegen = 0;
    const e = enemy(gm, 4, 0);
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    run(gm, 2);
    expect(out.some(t => t.includes('Mana insuficiente'))).toBe(true);
    expect(e.hp).toBe(e.maxHp);
    expect(u.mana).toBe(5);
  });

  it('anda até o alcance, lança, gasta mana e inicia recarga; em recarga é recusado', () => {
    const gm = makeGm();
    const out = notifies(gm);
    const u = caster(gm, 0, 0, 100);
    u.manaRegen = 0;
    const e = enemy(gm, 30, 0); // longe: fora do alcance 12
    const dist = () => Math.hypot(e.mesh.position.x - u.mesh.position.x, e.mesh.position.z - u.mesh.position.z);
    expect(dist()).toBeGreaterThan(12);
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    expect(u.state).toBe('casting');
    for (let i = 0; i < 400 && u.mana === 100; i++) gm.simStep(SIM_DT);
    expect(dist()).toBeLessThanOrEqual(13.4);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(u.mana).toBe(90);
    expect(u.cooldowns.debug_bolt).toBeGreaterThan(0);
    run(gm, 0.2);
    // em recarga
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    expect(out.some(t => t.includes('recarga'))).toBe(true);
    // depois da recarga (3 s) lança de novo
    run(gm, 3.2);
    const hp = e.hp;
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    run(gm, 1);
    expect(e.hp).toBeLessThan(hp);
    expect(u.mana).toBe(80);
  });

  it('cancelar durante o castTime não gasta mana nem inicia recarga', () => {
    const gm = makeGm();
    const u = caster(gm, 0, 0, 100);
    u.manaRegen = 0;
    const e = enemy(gm, 0, 6);
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    run(gm, 0.25); // dentro de castTime (0,5 s)
    expect(u.state).toBe('casting');
    gm.issue({ type: CMD.STOP, playerId: 0, unitIds: [u.id] });
    run(gm, 1.5);
    expect(u.mana).toBe(100);
    expect(u.cooldowns.debug_bolt || 0).toBe(0);
    expect(e.hp).toBe(e.maxHp);
  });

  it('requisito não cumprido é recusado com NOTIFY', () => {
    const gm = makeGm();
    const out = notifies(gm);
    const original = ABILITIES.debug_bolt.requires;
    ABILITIES.debug_bolt.requires = ['forge'];
    try {
      const u = caster(gm);
      const e = enemy(gm, 4, 0);
      cast(gm, [u], 'debug_bolt', { targetId: e.id });
      run(gm, 1);
      expect(out.some(t => t.includes('Requer'))).toBe(true);
      expect(u.mana).toBe(100);
    } finally {
      ABILITIES.debug_bolt.requires = original;
    }
  });
});

describe('efeitos', () => {
  it('damage mágico ignora armadura (armadura 50 não zera o dano)', () => {
    const gm = makeGm();
    const u = caster(gm);
    const e = enemy(gm, 4, 0);
    e.armor = 50;
    cast(gm, [u], 'debug_bolt', { targetId: e.id });
    run(gm, 1);
    const dealt = e.maxHp - e.hp;
    expect(dealt).toBeGreaterThanOrEqual(20); // 30 × [0,5..1] × 1,333 ≈ 20..40
    expect(dealt).toBeLessThanOrEqual(40);
  });

  it('damage em área atinge todos os hostis da área, um valor de RNG por alvo, e poupa aliados', () => {
    const gm = makeGm();
    const u = caster(gm);
    const e1 = enemy(gm, 4, 0);
    const e2 = enemy(gm, 4.5, 0.5);
    const friend = ally(gm, 4, 1);
    const original = ABILITIES.debug_bolt.effects;
    ABILITIES.debug_bolt.effects = [{ kind: 'damage', amount: 30, damageType: 'magic', radius: 3 }];
    try {
      const before = gm.combatRng.next.bind(gm.combatRng);
      let calls = 0;
      gm.combatRng.next = () => { calls++; return before(); };
      cast(gm, [u], 'debug_bolt', { targetId: e1.id });
      run(gm, 1);
      gm.combatRng.next = before;
      expect(e1.hp).toBeLessThan(e1.maxHp);
      expect(e2.hp).toBeLessThan(e2.maxHp);
      expect(friend.hp).toBe(friend.maxHp);
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      ABILITIES.debug_bolt.effects = original;
    }
  });

  it('heal limita ao maxHp; alvo hostil é inválido para "ally"', () => {
    const gm = makeGm();
    const out = notifies(gm);
    const u = caster(gm);
    const a = ally(gm, 3, 0);
    a.hp = a.maxHp - 10;
    cast(gm, [u], 'debug_heal', { targetId: a.id });
    run(gm, 1);
    expect(a.hp).toBe(a.maxHp);
    const e = enemy(gm, 4, 0);
    run(gm, 2.1);
    cast(gm, [u], 'debug_heal', { targetId: e.id });
    expect(out.some(t => t.includes('Alvo inválido'))).toBe(true);
  });

  it('heal com manaPerHp cobra mana por PV curado', () => {
    const gm = makeGm();
    const u = caster(gm);
    u.manaRegen = 0;
    const orig = ABILITIES.debug_heal;
    ABILITIES.debug_heal = { ...orig, manaCost: 0, manaPerHp: 0.5, effects: [{ kind: 'heal', amount: 40 }] };
    try {
      const a = ally(gm, 3, 0);
      a.hp = a.maxHp - 20;
      cast(gm, [u], 'debug_heal', { targetId: a.id });
      run(gm, 1);
      expect(a.hp).toBe(a.maxHp);
      expect(u.mana).toBeCloseTo(90); // 20 PV × 0,5
    } finally {
      ABILITIES.debug_heal = orig;
    }
  });
});

describe('status', () => {
  it('slow reduz a velocidade efetiva e expira', () => {
    const gm = makeGm();
    const u = caster(gm);
    expect(u.mods.speedMul).toBe(1);
    addStatus(u, 'slow', 2, 0);
    expect(u.mods.speedMul).toBe(STATUS_DEFS.slow.speedMul);
    const x0 = u.mesh.position.x;
    u.moveTo(x0 + 30, u.mesh.position.z, gm);
    run(gm, 1);
    const slowDist = Math.abs(u.mesh.position.x - x0);
    run(gm, 1.2); // slow expirou
    expect(hasStatus(u, 'slow')).toBe(false);
    expect(u.mods.speedMul).toBe(1);
    expect(slowDist).toBeLessThanOrEqual(u.speed * 0.5 * 1 + 0.6);
  });

  it('haste reduz o cooldown de ataque; bloodlust aumenta o dano; invulnerable zera o dano', () => {
    const gm = makeGm();
    const u = caster(gm);
    addStatus(u, 'haste', 5, 0);
    expect(u.effAttackCooldown).toBeCloseTo(u.attackCooldown / 1.5);
    addStatus(u, 'bloodlust', 5, 0);
    expect(u.getEffDamage().basic).toBeCloseTo(u.damage.basic * 1.5);
    addStatus(u, 'invulnerable', 5, 0);
    const hp = u.hp;
    u.takeDamage(50, null, []);
    expect(u.hp).toBe(hp);
    tickStatuses(u, 6);
    expect(u.effAttackCooldown).toBe(u.attackCooldown);
    u.takeDamage(10, null, []);
    expect(u.hp).toBe(hp - 10);
  });

  it('capacidade 8: slots fixos, sem alocar objetos novos', () => {
    const gm = makeGm();
    const u = caster(gm);
    const slots = u.statuses.slice();
    ['slow', 'haste', 'bloodlust', 'invisible', 'invulnerable', 'polymorph', 'shielded'].forEach((id, i) => addStatus(u, id, 10 + i, 0));
    expect(u.statuses.length).toBe(8);
    expect(u.statuses.filter(s => s.id !== null).length).toBe(7);
    u.statuses.forEach((s, i) => expect(s).toBe(slots[i]));
  });
});

describe('auto-cast e multi-seleção', () => {
  it('SET_AUTOCAST liga e cura aliado ferido sozinho; só habilidades com autocast', () => {
    const gm = makeGm();
    const u = caster(gm);
    const a = ally(gm, 3, 0);
    a.hp = 50;
    run(gm, 2.5);
    expect(a.hp).toBe(50); // desligado por padrão
    gm.issue({ type: CMD.SET_AUTOCAST, playerId: 0, unitIds: [u.id], abilityId: 'debug_heal', enabled: true });
    gm.issue({ type: CMD.SET_AUTOCAST, playerId: 0, unitIds: [u.id], abilityId: 'debug_bolt', enabled: true });
    run(gm, 3);
    expect(u.autocast.debug_heal).toBe(true);
    expect(u.autocast.debug_bolt).toBeUndefined(); // bolt não suporta autocast
    expect(a.hp).toBeGreaterThan(50);
  });

  it('multi-seleção: só uma unidade lança (a de maior mana)', () => {
    const gm = makeGm();
    const a = caster(gm, 0, 0, 60);
    const b = caster(gm, 1, 0, 90);
    a.manaRegen = 0;
    b.manaRegen = 0;
    const e = enemy(gm, 4, 0);
    cast(gm, [a, b], 'debug_bolt', { targetId: e.id });
    run(gm, 2);
    expect(b.mana).toBe(80);
    expect(a.mana).toBe(60);
  });
});

describe('reposição e determinismo', () => {
  it('unidade nova nasce limpa; setupMana repõe mana/status/recargas/auto-cast', () => {
    const gm = makeGm();
    const u = caster(gm);
    addStatus(u, 'slow', 10, 0);
    u.cooldowns.debug_bolt = 5;
    u.autocast.debug_heal = true;
    u.setupMana({ maxMana: 50, abilities: [] });
    expect(u.statuses.every(s => s.id === null)).toBe(true);
    expect(u.mods.speedMul).toBe(1);
    expect(u.cooldowns).toEqual({});
    expect(u.autocast).toEqual({});
    expect(u.mana).toBe(50);
    const fresh = gm.spawnUnit('knight', 10, 10, 0);
    expect(fresh instanceof Unit).toBe(true);
    expect(fresh.statuses.every(s => s.id === null)).toBe(true);
  });

  it('checksum inclui mana e status: duas execuções iguais; status/mana alteram o hash', () => {
    const play = () => {
      const gm = makeGm(11);
      const u = caster(gm);
      const e = enemy(gm, 4, 0);
      cast(gm, [u], 'debug_bolt', { targetId: e.id });
      run(gm, 3);
      return { gm, u, hash: stateChecksum(gm) };
    };
    const a = play();
    const b = play();
    expect(a.hash).toBe(b.hash);
    const before = stateChecksum(a.gm);
    addStatus(a.u, 'haste', 5, 0);
    expect(stateChecksum(a.gm)).not.toBe(before);
    const mid = stateChecksum(a.gm);
    a.u.mana -= 7;
    expect(stateChecksum(a.gm)).not.toBe(mid);
  });
});
