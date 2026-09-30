import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { computeDamage } from '../../src/sim/combat.js';
import { getUnitDef, getBuildingDef, UNITS, FACTIONS } from '../../src/data/index.js';
import { RESEARCH } from '../../src/data/upgrades.js';
import { applySplashDamage, splashFalloff } from '../../src/entities/splash.js';
import { BallisticProjectile, ballisticPeak, ballisticFlightTime } from '../../src/entities/BallisticProjectile.js';

/**
 * siege.test.js — F4-02: Balista/Catapulta, Oficina, projétil balístico, alcance mínimo, dano em
 * área com queda linear, sem fogo amigo, pesquisa siege_damage e IA. Jogador 0 = humano, 1 = orc.
 */
function makeGm(seed = 5) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  return new GameManager(scene, terrain, null, null, cfg);
}

const isHq = b => b.type === 'castle' || b.type === 'great_hall';
const hqOf = (gm, id) => gm.buildings.find(b => b.ownerId === id && isHq(b));

function rich(gm, id = 0) {
  const p = gm.getPlayer(id);
  p.resources.gold = 20000; p.resources.wood = 20000; p.resources.stone = 20000;
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

function run(gm, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

function train(gm, b, unitType, playerId = 0) {
  gm.issue({ type: CMD.TRAIN, playerId, buildingId: b.id, unitType });
  gm.simStep(SIM_DT);
}

/** Campo aberto longe das bases (cerco do jogador 0 × alvos do jogador 1). */
function arena(gm) {
  const hq = hqOf(gm, 0);
  return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 };
}

const place = (u, x, z) => {
  u.mesh.position.x = x;
  u.mesh.position.z = z;
  u.mesh.position.y = u.terrain.getHeight(x, z);
};

const hpSum = gm => gm.allUnits.map(u => Math.round(u.hp * 100) / 100).join(',');

describe('dados do cerco (F4-02)', () => {
  it('Balista e Catapulta: números da spec e campos novos', () => {
    for (const [type, faction, proj] of [['ballista', 'human', 'bolt'], ['catapult', 'orc', 'boulder']]) {
      const u = UNITS[type];
      expect(u.faction).toBe(faction);
      expect(u.hp).toBe(220);
      expect(u.speed).toBe(3.0);
      expect(u.armor).toBe(0);
      expect(u.damage).toEqual({ basic: 80, piercing: 0, type: 'siege' });
      expect(u.attackRange).toBe(20);
      expect(u.minAttackRange).toBe(4);
      expect(u.splashRadius).toBe(1.5);
      expect(u.attackCooldown).toBe(3.2);
      expect(u.cost).toEqual({ gold: 90, wood: 200, stone: 40 });
      expect(u.trainTime).toBe(18);
      expect(u.requires).toEqual([{ hq: 2 }]);
      expect(u.projectile).toBe(proj);
      expect(u.isRanged && u.isCombat).toBe(true);
    }
    expect(getUnitDef('ballista').name).toBe('Balista');
    expect(getUnitDef('catapult').name).toBe('Catapulta');
  });

  it('Oficinas: papel workshop, requisitos, treino e listas das facções', () => {
    for (const [type, barracks, unit, suicide] of [['workshop', 'barracks', 'ballista', 'sapper'], ['orc_workshop', 'orc_barracks', 'catapult', 'arsonist']]) {
      const d = getBuildingDef(type);
      expect(d.role).toBe('workshop');
      expect(d.hp).toBe(700);
      expect(d.cost).toEqual({ gold: 180, wood: 100, stone: 40 });
      expect(d.requires).toEqual([barracks, { hq: 2 }]);
      expect(d.trains).toEqual([unit, suicide]); // F4-05: sapadores também saem da Oficina
    }
    expect(FACTIONS.human.buildList.indexOf('workshop')).toBeGreaterThan(FACTIONS.human.buildList.indexOf('stable'));
    expect(FACTIONS.orc.buildList).toContain('orc_workshop');
    expect(FACTIONS.human.units.siege).toBe('ballista');
    expect(FACTIONS.orc.units.siege).toBe('catapult');
  });

  it('projétil: pico ∝ distância (clamp 2..9) e Balista mais rápida que a Catapulta', () => {
    expect(ballisticPeak(1)).toBe(2);
    expect(ballisticPeak(20)).toBeCloseTo(7);
    expect(ballisticPeak(100)).toBe(9);
    expect(ballisticFlightTime(22, 'bolt')).toBeCloseTo(1);
    expect(ballisticFlightTime(14, 'boulder')).toBeCloseTo(1);
    expect(ballisticFlightTime(20, 'bolt')).toBeLessThan(ballisticFlightTime(20, 'boulder'));
  });
});

describe('Oficina: construção e treino (F4-02)', () => {
  it('só é construível com Quartel + Centro nível 2', () => {
    const gm = makeGm();
    rich(gm);
    const hq = hqOf(gm, 0);
    const x = hq.mesh.position.x + 14;
    const z = hq.mesh.position.z + 14;
    expect(gm.placeBuilding('workshop', x, z, [], 0)).toBeNull();
    hq.tier = 2;
    expect(gm.placeBuilding('workshop', x, z, [], 0)).toBeNull(); // sem Quartel
    hq.tier = 1;
    build(gm, 'barracks');
    expect(gm.placeBuilding('workshop', x, z, [], 0)).toBeNull(); // Centro nível 1
    hq.tier = 2;
    const w = gm.placeBuilding('workshop', x, z, [], 0);
    expect(w).not.toBeNull();
    expect(w.type).toBe('workshop');
  });

  it('balista só treina na Oficina concluída com Centro nível 2; Quartel não treina cerco', () => {
    const gm = makeGm();
    const p = rich(gm);
    const hq = hqOf(gm, 0);
    const barracks = build(gm, 'barracks');
    const w = build(gm, 'workshop', 0, 1);

    train(gm, barracks, 'ballista');
    expect(barracks.queue.length).toBe(0);
    hq.tier = 1;
    train(gm, w, 'ballista');
    expect(w.queue.length).toBe(0);
    hq.tier = 2;
    const gold = p.resources.gold;
    train(gm, w, 'ballista');
    expect(w.queue.length).toBe(1);
    expect(p.resources.gold).toBe(gold - 90);
    run(gm, 19);
    expect(gm.getUnitsOf(0).filter(u => u.type === 'ballista' && !u.isDead).length).toBe(1);
  });

  it('Oficina orc treina catapulta', () => {
    const gm = makeGm();
    rich(gm, 1);
    hqOf(gm, 1).tier = 2;
    const w = build(gm, 'orc_workshop', 1);
    train(gm, w, 'catapult', 1);
    expect(w.queue.length).toBe(1);
    train(gm, w, 'ballista', 1);
    expect(w.queue.length).toBe(1);
  });
});

describe('dano em área (F4-02)', () => {
  it('queda linear 100 % → 50 %, só hostis, sem fogo amigo, cerco × construção ≈ ×1,5 e × unidade ≈ ×0,5', () => {
    const gm = makeGm();
    gm.combatRng = { next: () => 1 }; // multiplicador aleatório fixo (1,0): resultado previsível
    const { x, z } = arena(gm);
    const siege = gm.spawnUnit('ballista', x, z + 10, 0);
    const center = gm.spawnUnit('grunt', x, z, 1);
    const edge = gm.spawnUnit('grunt', x + 1.5, z, 1);
    const outside = gm.spawnUnit('grunt', x + 1.6, z, 1);
    const ally = gm.spawnUnit('knight', x, z + 0.3, 0);
    for (const u of [center, edge, outside, ally]) place(u, u.mesh.position.x, u.mesh.position.z);
    const bld = build(gm, 'orc_barracks', 1);
    const bPos = bld.mesh.position;
    const bldHp = bld.hp;

    const dmg = siege.damage;
    const dCenter = computeDamage(dmg, center, gm.combatRng);
    const dBld = computeDamage(dmg, bld, gm.combatRng);

    const hits = applySplashDamage(gm, siege, dmg, { x, z }, siege.splashRadius, gm.allUnits);
    expect(hits).toBe(2); // centro + borda
    expect(center.maxHp - center.hp).toBe(dCenter);
    expect(edge.maxHp - edge.hp).toBe(Math.max(1, Math.round(dCenter * 0.5)));
    expect(outside.hp).toBe(outside.maxHp);
    expect(ally.hp).toBe(ally.maxHp);

    // × construção (1,5) contra × unidade (0,5): mesma base (80 - armadura)
    const armorU = center.armor;
    const expectU = Math.round((80 - armorU) * 0.5 * 1.333);
    expect(dCenter).toBe(expectU);
    expect(dBld).toBe(Math.round((80 - bld.armor) * 1.5 * 1.333));
    // a construção, atingida no seu centro, leva o dano cheio
    const hits2 = applySplashDamage(gm, siege, dmg, { x: bPos.x, z: bPos.z }, siege.splashRadius, gm.allUnits);
    expect(hits2).toBeGreaterThanOrEqual(1);
    expect(bldHp - bld.hp).toBe(dBld);
    expect(splashFalloff(0, 1.5)).toBe(1);
    expect(splashFalloff(1.5, 1.5)).toBe(0.5);
    expect(splashFalloff(0.75, 1.5)).toBeCloseTo(0.75);
  });

  it('determinismo: mesma seed → mesmos danos (ordem crescente de id)', () => {
    const once = () => {
      const gm = makeGm(9);
      const { x, z } = arena(gm);
      const siege = gm.spawnUnit('catapult', x, z + 12, 1);
      for (let i = 0; i < 5; i++) gm.spawnUnit('knight', x + (i - 2) * 0.4, z + (i % 2) * 0.3, 0);
      const before = gm.combatRng.next();
      applySplashDamage(gm, siege, siege.damage, { x, z }, siege.splashRadius, gm.allUnits);
      applySplashDamage(gm, siege, siege.damage, { x, z }, siege.splashRadius, gm.allUnits);
      return `${before}|${hpSum(gm)}|${gm.combatRng.next()}`;
    };
    expect(once()).toBe(once());
  });
});

describe('alcance mínimo e míssil balístico (F4-02)', () => {
  function duel(seed = 5) {
    const gm = makeGm(seed);
    const { x, z } = arena(gm);
    const siege = gm.spawnUnit('ballista', x, z, 0);
    const target = gm.spawnUnit('grunt', x + 2, z, 1);
    target.speed = 0; // alvo parado (não persegue, não foge)
    target.hp = target.maxHp = 100000;
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [siege.id], targetId: target.id });
    return { gm, siege, target, x, z };
  }
  const edgeDist = (a, b) => Math.hypot(a.mesh.position.x - b.mesh.position.x, a.mesh.position.z - b.mesh.position.z) - (b.collisionRadius || 0.6);

  it('alvo a < minAttackRange: não dispara, recua até min + 0,5 e depois dispara', () => {
    const { gm, siege, target } = duel();
    expect(edgeDist(siege, target)).toBeLessThan(4);
    let firedTooClose = false;
    for (let i = 0; i < 40; i++) {
      gm.simStep(SIM_DT);
      if (gm.arrows.length > 0 && edgeDist(siege, target) < 4) firedTooClose = true;
    }
    expect(firedTooClose).toBe(false);
    expect(edgeDist(siege, target)).toBeGreaterThanOrEqual(4);
    run(gm, 8);
    expect(target.hp).toBeLessThan(target.maxHp); // disparou dentro da janela [min, max]
  });

  it('não escolhe alvo dentro do alcance mínimo na auto-aquisição', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const siege = gm.spawnUnit('catapult', x, z, 1);
    const close = gm.spawnUnit('knight', x + 2, z, 0);
    close.speed = 0;
    gm.simStep(SIM_DT); // sincroniza a grade espacial
    expect(siege.findNearestHostile(gm.allUnits, gm.buildings, 14)).toBeNull();
    const far = gm.spawnUnit('knight', x + 8, z, 0);
    gm.simStep(SIM_DT);
    expect(siege.findNearestHostile(gm.allUnits, gm.buildings, 14)).toBe(far);
  });

  it('míssil não persegue: alvo que saiu do raio antes do impacto não é atingido', () => {
    const { gm, siege, target, x, z } = duel();
    place(siege, x, z);
    place(target, x + 12, z); // já dentro da janela
    let guard = 0;
    while (gm.arrows.length === 0 && guard++ < 200) gm.simStep(SIM_DT);
    expect(gm.arrows.length).toBe(1);
    const proj = gm.arrows[0];
    expect(proj).toBeInstanceOf(BallisticProjectile);
    place(target, x + 12, z + 15); // foge para longe do ponto previsto
    const hpBefore = target.hp;
    guard = 0;
    while (!proj.isDead && guard++ < 200) gm.simStep(SIM_DT);
    expect(proj.isDead).toBe(true);
    expect(target.hp).toBe(hpBefore);
  });

  it('alvo parado na janela é atingido pelo míssil', () => {
    const { gm, siege, target, x, z } = duel();
    place(siege, x, z);
    place(target, x + 12, z);
    run(gm, 7);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('míssil usa posição prevista: alvo em movimento uniforme é atingido', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const siege = gm.spawnUnit('ballista', x, z, 0);
    const target = gm.spawnUnit('grunt', x + 14, z - 6, 1);
    target.hp = target.maxHp = 100000;
    target.speed = 4.0;
    // velocidade medida pelo GameManager entre ticks (mira preditiva)
    gm.issue({ type: CMD.MOVE, playerId: 1, unitIds: [target.id], x: x + 14, z: z + 40 });
    run(gm, 1);
    expect(Math.abs(target.velZ)).toBeGreaterThan(2);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [siege.id], targetId: target.id });
    run(gm, 6);
    expect(target.hp).toBeLessThan(target.maxHp);
  });
});

describe('pesquisa siege_damage (F4-02)', () => {
  it('+15 por nível no dano básico do cerco; exige Oficina no nível 1', () => {
    expect(RESEARCH.siege_damage.appliesTo).toEqual(['ballista', 'catapult']);
    const gm = makeGm();
    rich(gm);
    hqOf(gm, 0).tier = 2;
    const forge = build(gm, 'forge');
    build(gm, 'barracks', 0, 1);
    const a = arena(gm);
    const ballista = gm.spawnUnit('ballista', a.x, a.z, 0);
    expect(ballista.damage.basic).toBe(80);

    gm.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: forge.id, upgradeId: 'siege_damage' });
    gm.simStep(SIM_DT);
    expect(forge.currentResearch).toBeFalsy(); // sem Oficina: recusado

    build(gm, 'workshop', 0, 2);
    gm.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: forge.id, upgradeId: 'siege_damage' });
    gm.simStep(SIM_DT);
    run(gm, 41);
    expect(gm.getPlayer(0).getResearchLevel('siege_damage')).toBe(1);
    expect(ballista.damage.basic).toBe(95);

    gm.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: forge.id, upgradeId: 'siege_damage' });
    gm.simStep(SIM_DT);
    run(gm, 61);
    expect(gm.getPlayer(0).getResearchLevel('siege_damage')).toBe(2);
    expect(ballista.damage.basic).toBe(110);
    // e quem for treinado depois já nasce melhorado
    expect(gm.spawnUnit('ballista', a.x, a.z, 0).damage.basic).toBe(110);
  });
});

describe('IA e cerco (F4-02)', () => {
  it('IA orc com Centro nível 2 e ≥ 8 combatentes constrói a Oficina e treina ≥ 1 catapulta', () => {
    const gm = makeGm(11);
    const ai = gm.getPlayer(1);
    const hq = hqOf(gm, 1);
    hq.tier = 2;
    ai.resources.gold = 6000; ai.resources.wood = 6000; ai.resources.stone = 3000;
    ai.maxPopulation = 120;
    for (let i = 0; i < 6; i++) build(gm, 'orc_house', 1, i % 4 - 2 + 6 * Math.floor(i / 4)); // folga de população
    gm.recalculatePopCap();
    for (let i = 0; i < 8; i++) gm.spawnUnit('grunt', hq.mesh.position.x + 6 + i * 0.6, hq.mesh.position.z + 6, 1);
    // o exército da IA sai para atacar: a base humana precisa sobreviver para a partida continuar
    gm.buildings.filter(b => b.ownerId === 0).forEach(b => { b.hp = b.maxHp = 1e7; });
    let built = false;
    for (let t = 0; t < 14 * 60 && !built; t += 1) {
      run(gm, 1);
      if (ai.resources.gold < 1500) ai.resources.gold = 3000;
      if (ai.resources.wood < 1500) ai.resources.wood = 3000;
      if (ai.resources.stone < 800) ai.resources.stone = 1500;
      built = gm.buildings.some(b => b.ownerId === 1 && b.type === 'orc_workshop' && b.isConstructed && !b.isDead);
    }
    expect(built).toBe(true);
    // a IA manda todo o exército no ataque: observa a catapulta assim que ela existir
    let catapults = 0;
    for (let t = 0; t < 6 * 60 && catapults === 0; t++) {
      run(gm, 1);
      if (ai.resources.gold < 1500) ai.resources.gold = 3000;
      catapults = gm.getUnitsOf(1).filter(u => u.type === 'catapult').length;
    }
    expect(catapults).toBeGreaterThanOrEqual(1);
  }, 120000);
});
