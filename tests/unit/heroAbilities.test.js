import { describe, it, expect, vi } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { getAbility } from '../../src/data/abilities.js';
import { hasStatus } from '../../src/sim/statuses.js';
import * as statusesModule from '../../src/sim/statuses.js';
import { applyAbility } from '../../src/sim/abilities.js';

function makeGm(seed = 7) {
  const terrain = new Terrain();
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(terrain, null, null, cfg);
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
  if (u.gameManager && u.gameManager.unitGrid) {
    u.gameManager.unitGrid.update(u, x, z, u.collisionRadius || 0.6);
  }
};

function spawnHero(gm, heroType, dx = 0, dz = 0, ownerId = 0) {
  const a = arena(gm);
  const u = gm.spawnUnit(heroType, a.x + dx, a.z + dz, ownerId);
  place(u, a.x + dx, a.z + dz);
  u.isCombatUnit = () => false;
  return u;
}

function spawnAlly(gm, dx, dz, ownerId = 0) {
  const a = arena(gm);
  const u = gm.spawnUnit('knight', a.x + dx, a.z + dz, ownerId);
  place(u, a.x + dx, a.z + dz);
  u.isCombatUnit = () => false;
  return u;
}

function spawnEnemy(gm, dx, dz, ownerId = 1) {
  const a = arena(gm);
  const u = gm.spawnUnit('grunt', a.x + dx, a.z + dz, ownerId);
  place(u, a.x + dx, a.z + dz);
  u.speed = 0;
  u.isCombatUnit = () => false;
  return u;
}

function run(gm, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

function cast(gm, unit, abilityId, extra = {}) {
  gm.issue({ type: CMD.CAST, playerId: unit.ownerId, unitIds: [unit.id], abilityId, ...extra });
  gm.simStep(SIM_DT);
}

describe('Extensão A1: status em área para aliados', () => {
  it('aplica status a todos os aliados no raio e exclui aliados fora do raio', () => {
    const gm = makeGm();
    const hero = spawnHero(gm, 'hero_dorian', 0, 0, 0);
    const allyInside = spawnAlly(gm, 4, 0, 0);
    const allyFar = spawnAlly(gm, 15, 0, 0);

    cast(gm, hero, 'hero_banner'); // radius: 9, allies: true, haste 12s
    run(gm, 0.8);

    expect(hasStatus(hero, 'haste')).toBe(true);
    expect(hasStatus(allyInside, 'haste')).toBe(true);
    expect(hasStatus(allyFar, 'haste')).toBe(false);
  });

  it('não afeta unidades inimigas dentro do raio', () => {
    const gm = makeGm();
    const hero = spawnHero(gm, 'hero_dorian', 0, 0, 0);
    const enemyNear = spawnEnemy(gm, 3, 0, 1);

    cast(gm, hero, 'hero_banner');
    run(gm, 0.8);

    expect(hasStatus(hero, 'haste')).toBe(true);
    expect(hasStatus(enemyNear, 'haste')).toBe(false);
  });

  it('não afeta construções aliadas dentro do raio', () => {
    const gm = makeGm();
    const a = arena(gm);
    const hero = spawnHero(gm, 'hero_dorian', 0, 0, 0);
    const farm = gm.createBuilding('farm', a.x + 3, a.z, true, 0);

    cast(gm, hero, 'hero_shield_line'); // radius: 7, allies: true, flameshield
    run(gm, 0.8);

    expect(hasStatus(hero, 'flameshield')).toBe(true);
    expect(farm.statuses).toBeUndefined();
  });

  it('itera estritamente em ordem crescente de unit.id para determinismo', () => {
    const gm = makeGm();
    const hero = spawnHero(gm, 'hero_dorian', 0, 0, 0);
    // Spawna vários aliados com ids conhecidos
    spawnAlly(gm, 2, 0, 0);
    spawnAlly(gm, 3, 0, 0);
    spawnAlly(gm, -2, 0, 0);

    const receivedIds = [];
    const spy = vi.spyOn(statusesModule, 'addStatus').mockImplementation((target, id, duration, casterId) => {
      receivedIds.push(target.id);
      target.statuses.push({ id, duration, remaining: duration, casterId });
    });

    const ability = getAbility('hero_banner');
    applyAbility(gm, hero, ability, null, hero.mesh.position.x, hero.mesh.position.z);

    spy.mockRestore();

    expect(receivedIds.length).toBeGreaterThanOrEqual(4); // hero + 3 aliados
    const sorted = [...receivedIds].sort((a, b) => a - b);
    expect(receivedIds).toEqual(sorted);
  });

  it('sem radius/allies mantém o comportamento inalterado de alvo único', () => {
    const gm = makeGm();
    const hero = spawnHero(gm, 'hero_brann', 0, 0, 0);
    const allyNear = spawnAlly(gm, 2, 0, 0);

    cast(gm, hero, 'hero_war_cry'); // target self, status bloodlust sem radius
    run(gm, 0.8);

    expect(hasStatus(hero, 'bloodlust')).toBe(true);
    expect(hasStatus(allyNear, 'bloodlust')).toBe(false);
  });
});

describe('Habilidades dos 6 heróis', () => {
  it('Capitão Brann: conjura Grito de Guerra, Golpe Transpassante e Postura Defensiva', () => {
    const gm = makeGm();
    const brann = spawnHero(gm, 'hero_brann', 0, 0, 0);
    const target = spawnEnemy(gm, 2, 0, 1);

    expect(brann.abilities).toEqual(['hero_war_cry', 'hero_cleave_strike', 'hero_defensive_stance']);
    expect(brann.maxMana).toBe(150);

    // Grito de Guerra
    cast(gm, brann, 'hero_war_cry');
    run(gm, 0.8);
    expect(hasStatus(brann, 'bloodlust')).toBe(true);

    // Golpe Transpassante
    const hpBefore = target.hp;
    cast(gm, brann, 'hero_cleave_strike', { targetId: target.id });
    run(gm, 0.8);
    expect(target.hp).toBeLessThan(hpBefore);
    expect(hasStatus(target, 'slow')).toBe(true);

    // Postura Defensiva
    cast(gm, brann, 'hero_defensive_stance');
    run(gm, 0.8);
    expect(hasStatus(brann, 'flameshield')).toBe(true);
  });

  it('Mestre Arcano Oren: conjura Raio Arcano, Restauro e Tempestade Arcana', () => {
    const gm = makeGm();
    const oren = spawnHero(gm, 'hero_oren', 0, 0, 0);
    const enemy = spawnEnemy(gm, 6, 0, 1);
    const wounded = spawnAlly(gm, 3, 0, 0);
    wounded.hp = wounded.maxHp - 30;

    expect(oren.abilities).toEqual(['hero_arcane_bolt', 'hero_mend', 'hero_blizzard']);

    // Raio Arcano
    const hpBefore = enemy.hp;
    cast(gm, oren, 'hero_arcane_bolt', { targetId: enemy.id });
    run(gm, 0.8);
    expect(enemy.hp).toBeLessThan(hpBefore);

    // Restauro
    const healHpBefore = wounded.hp;
    cast(gm, oren, 'hero_mend', { targetId: wounded.id });
    run(gm, 1.2);
    expect(wounded.hp).toBeGreaterThan(healHpBefore);

    // Tempestade Arcana (ground channel)
    const enemy2 = spawnEnemy(gm, 7, 0, 1);
    const hp2Before = enemy2.hp;
    cast(gm, oren, 'hero_blizzard', { x: enemy2.mesh.position.x, z: enemy2.mesh.position.z });
    run(gm, 2.0);
    expect(enemy2.hp).toBeLessThan(hp2Before);
  });

  it('Marechal Dorian: conjura Estandarte, Escudos Cerrados e Carga', () => {
    const gm = makeGm();
    const dorian = spawnHero(gm, 'hero_dorian', 0, 0, 0);
    const ally = spawnAlly(gm, 4, 0, 0);
    const enemy = spawnEnemy(gm, 6, 0, 1);

    expect(dorian.abilities).toEqual(['hero_banner', 'hero_shield_line', 'hero_marshal_charge']);
    expect(dorian.maxMana).toBe(180);

    // Estandarte
    cast(gm, dorian, 'hero_banner');
    run(gm, 0.8);
    expect(hasStatus(dorian, 'haste')).toBe(true);
    expect(hasStatus(ally, 'haste')).toBe(true);

    // Escudos Cerrados
    cast(gm, dorian, 'hero_shield_line');
    run(gm, 0.8);
    expect(hasStatus(dorian, 'flameshield')).toBe(true);
    expect(hasStatus(ally, 'flameshield')).toBe(true);

    // Carga do Marechal
    const hpBefore = enemy.hp;
    cast(gm, dorian, 'hero_marshal_charge', { targetId: enemy.id });
    run(gm, 0.8);
    expect(enemy.hp).toBeLessThan(hpBefore);
    expect(hasStatus(enemy, 'slow')).toBe(true);
  });

  it('Drogath Punho-de-Brasa: conjura Grito de Guerra, Golpe de Brasa e Fogo do Clã', () => {
    const gm = makeGm();
    const drogath = spawnHero(gm, 'hero_drogath', 0, 0, 1);
    const enemy = spawnAlly(gm, 2, 0, 0); // inimigo do drogath (owner 0)

    expect(drogath.abilities).toEqual(['hero_war_cry', 'hero_ember_strike', 'hero_clan_fire']);
    expect(drogath.maxMana).toBe(150);

    // Golpe de Brasa
    const hpBefore = enemy.hp;
    cast(gm, drogath, 'hero_ember_strike', { targetId: enemy.id });
    run(gm, 0.8);
    expect(enemy.hp).toBeLessThan(hpBefore);

    // Fogo do Clã (cura a si mesmo)
    drogath.hp = drogath.maxHp - 100;
    cast(gm, drogath, 'hero_clan_fire');
    run(gm, 0.8);
    expect(drogath.hp).toBe(drogath.maxHp);
  });

  it('Vozgul a Profetisa: conjura Dreno de Alma, Chamado dos Ancestrais e Véu de Cinzas', () => {
    const gm = makeGm();
    const vozgul = spawnHero(gm, 'hero_vozgul', 0, 0, 1);
    const enemy = spawnAlly(gm, 5, 0, 0);
    const ally = spawnEnemy(gm, 3, 0, 1); // aliado de Vozgul (owner 1)

    expect(vozgul.abilities).toEqual(['hero_soul_drain', 'hero_ancestors', 'hero_ash_veil']);

    // Dreno de Alma
    vozgul.hp = vozgul.maxHp - 40;
    const hpBefore = enemy.hp;
    cast(gm, vozgul, 'hero_soul_drain', { targetId: enemy.id });
    run(gm, 0.8);
    expect(enemy.hp).toBeLessThan(hpBefore);
    expect(vozgul.hp).toBeGreaterThan(vozgul.maxHp - 40);

    // Véu de Cinzas
    cast(gm, vozgul, 'hero_ash_veil', { targetId: ally.id });
    run(gm, 0.8);
    expect(hasStatus(ally, 'invisible')).toBe(true);

    // Chamado dos Ancestrais com cadáveres
    gm.corpses.add(vozgul.mesh.position.x + 2, vozgul.mesh.position.z);
    cast(gm, vozgul, 'hero_ancestors');
    run(gm, 1.0);
    const skels = gm.allUnits.filter(u => u.type === 'skeleton' && u.ownerId === vozgul.ownerId);
    expect(skels.length).toBeGreaterThanOrEqual(1);
  });

  it('Skarn chefe-de-brasa: conjura Rugido dos Clãs, Pacto de Sangue e Impacto no Solo', () => {
    const gm = makeGm();
    const skarn = spawnHero(gm, 'hero_skarn', 0, 0, 1);
    const ally = spawnEnemy(gm, 3, 0, 1); // aliado do Skarn (owner 1)
    const enemy = spawnAlly(gm, 2, 0, 0); // inimigo do Skarn (owner 0)

    expect(skarn.abilities).toEqual(['hero_horde_roar', 'hero_blood_pact', 'hero_ground_slam']);
    expect(skarn.maxMana).toBe(180);

    // Rugido dos Clãs
    cast(gm, skarn, 'hero_horde_roar');
    run(gm, 0.8);
    expect(hasStatus(skarn, 'bloodlust')).toBe(true);
    expect(hasStatus(ally, 'bloodlust')).toBe(true);

    // Pacto de Sangue
    cast(gm, skarn, 'hero_blood_pact');
    run(gm, 0.8);
    expect(hasStatus(skarn, 'unholy_armor')).toBe(true);

    // Impacto no Solo
    const hpBefore = enemy.hp;
    cast(gm, skarn, 'hero_ground_slam', { targetId: enemy.id });
    run(gm, 0.8);
    expect(enemy.hp).toBeLessThan(hpBefore);
    expect(hasStatus(enemy, 'slow')).toBe(true);
  });

  it('aliases de habilidades existem e não exigem pesquisa', () => {
    const aliases = [
      'hero_shield_bash',
      'hero_cleave_strike',
      'hero_defensive_stance',
      'hero_revide_stance',
      'hero_blizzard',
      'hero_arcane_storm',
      'hero_banner',
      'hero_shield_line',
      'hero_marshal_charge',
      'hero_ember_strike',
      'hero_clan_fire',
      'hero_soul_drain',
      'hero_ancestors',
      'hero_ash_veil',
      'hero_horde_roar',
      'hero_blood_pact',
      'hero_ash_pact',
      'hero_ground_slam',
      'hero_crown_hammer'
    ];

    for (const id of aliases) {
      const ab = getAbility(id);
      expect(ab, `Habilidade ${id} deve existir`).toBeTruthy();
      expect(ab.requires, `Habilidade ${id} não deve exigir pesquisa`).toEqual([]);
    }
  });
});
