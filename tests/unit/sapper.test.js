import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { EVT } from '../../src/sim/events.js';
import { computeDamage } from '../../src/sim/combat.js';
import { UNITS, FACTIONS, getBuildingDef, WALL_STEP } from '../../src/data/index.js';
import { splashFalloff } from '../../src/entities/splash.js';

/**
 * sapper.test.js — F4-05: Sapadores de Pólvora / Incendiários (unidade suicida).
 * Jogador 0 = humano, 1 = orc (IAs desligadas; os testes controlam tudo à mão).
 */
function makeGm(seed = 5, withAi = false) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);
  if (!withAi) {
    gm.aiDirectors.forEach(d => d.dispose?.());
    gm.aiDirectors = [];
    gm.aiDirector = null;
  }
  return gm;
}

const isHq = b => b.type === 'castle' || b.type === 'great_hall';
const hqOf = (gm, id) => gm.buildings.find(b => b.ownerId === id && isHq(b));

function build(gm, type, ownerId, x, z) {
  const b = gm.createBuilding(type, x, z, true, ownerId);
  b.isConstructed = true;
  gm.buildings.push(b);
  return b;
}

function run(gm, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

const place = (u, x, z) => {
  u.mesh.position.x = x;
  u.mesh.position.z = z;
  u.mesh.position.y = u.terrain.getHeight(x, z);
  u._prevPos.copy(u.mesh.position);
  u._simPos.copy(u.mesh.position);
};

/** Campo aberto longe das bases. */
function arena(gm) {
  const hq = hqOf(gm, 0);
  return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 };
}

describe('dados dos sapadores (F4-05)', () => {
  it('números da spec, campo suicide e treino na Oficina', () => {
    for (const [type, faction] of [['sapper', 'human'], ['arsonist', 'orc']]) {
      const u = UNITS[type];
      expect(u.faction).toBe(faction);
      expect(u.hp).toBe(60);
      expect(u.speed).toBe(5.0);
      expect(u.armor).toBe(0);
      expect(u.collisionRadius).toBe(0.7);
      expect(u.attackRange).toBe(1.2);
      expect(u.attackCooldown).toBe(0.1);
      expect(u.damage).toEqual({ basic: 400, piercing: 0, type: 'siege' });
      expect(u.splashRadius).toBe(2.2);
      expect(u.suicide).toBe(true);
      expect(u.cost).toEqual({ gold: 70, wood: 25, stone: 0 });
      expect(u.trainTime).toBe(10);
      expect(u.requires).toEqual([{ hq: 2 }]);
      expect(u.isCombat).toBe(true);
    }
    expect(UNITS.sapper.name).toBe('Sapadores de Pólvora');
    expect(UNITS.arsonist.name).toBe('Incendiários');
    expect(getBuildingDef('workshop').trains).toContain('sapper');
    expect(getBuildingDef('orc_workshop').trains).toContain('arsonist');
    expect(FACTIONS.human.units.suicide).toBe('sapper');
    expect(FACTIONS.orc.units.suicide).toBe('arsonist');
  });

  it('queda linear parametrizada: 100 % → 40 % na borda (cerco continua 50 %)', () => {
    expect(splashFalloff(0, 2.2, 0.4)).toBe(1);
    expect(splashFalloff(2.2, 2.2, 0.4)).toBeCloseTo(0.4);
    expect(splashFalloff(1.1, 2.2, 0.4)).toBeCloseTo(0.7);
    expect(splashFalloff(1.5, 1.5)).toBe(0.5);
  });
});

describe('detonação (F4-05)', () => {
  it('detona ao chegar na construção: morre sem cadáver, EXPLOSION, unitsLost, sem kill para o inimigo', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const target = build(gm, 'orc_barracks', 1, x, z);
    const hp0 = target.hp;
    const sapper = gm.spawnUnit('sapper', x + 10, z, 0);
    const events = [];
    gm.events.on(EVT.EXPLOSION, e => events.push(['boom', e]));
    gm.events.on(EVT.UNIT_DIED, e => events.push(['died', e]));
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [sapper.id], targetId: target.id });
    run(gm, 6);
    expect(sapper.isDead).toBe(true);
    expect(sapper.canRemove).toBe(true); // sem cadáver: removida logo após a detonação
    expect(target.hp).toBeLessThan(hp0);
    const boom = events.find(e => e[0] === 'boom')[1];
    expect(boom.radius).toBe(2.2);
    expect(boom.ownerId).toBe(0);
    const died = events.find(e => e[0] === 'died')[1];
    expect(died.unitId).toBe(sapper.id);
    expect(died.killerOwnerId).toBeNull();
    expect(gm.matchStats.byPlayer.get(0).unitsLost).toBe(1);
    expect(gm.matchStats.byPlayer.get(1).unitsKilled).toBe(0);
  });

  it('dano em área: queda com a distância, só hostis, ×1,5 em construção e ×0,5 em unidade', () => {
    const gm = makeGm();
    gm.combatRng = { next: () => 1 }; // multiplicador aleatório fixo (1,0)
    const { x, z } = arena(gm);
    const sapper = gm.spawnUnit('sapper', x, z + 1, 0);
    const center = gm.spawnUnit('grunt', x, z, 1); // alvo
    const mid = gm.spawnUnit('grunt', x + 2.0, z, 1);
    const far = gm.spawnUnit('grunt', x + 1.0 + 0.6 + 3.0, z, 1); // fora do raio
    const ally = gm.spawnUnit('knight', x, z - 2.0, 0);
    for (const u of [center, mid, far, ally]) { u.speed = 0; u.hp = u.maxHp = 5000; place(u, u.mesh.position.x, u.mesh.position.z); }
    const bld = build(gm, 'orc_barracks', 1, x + 30, z);
    gm.simStep(SIM_DT); // sincroniza a grade espacial
    place(sapper, x, z + 1);
    const hpC = center.hp; const hpM = mid.hp; const hpF = far.hp; const hpA = ally.hp;
    sapper.attackTarget = center;
    const full = computeDamage(sapper.damage, center, gm.combatRng);
    sapper._detonate(gm, gm.allUnits);
    expect(hpC - center.hp).toBe(full); // centro: 100 %
    const surfMid = Math.max(0, Math.hypot(mid.mesh.position.x - center.mesh.position.x, mid.mesh.position.z - center.mesh.position.z) - mid.collisionRadius);
    expect(hpM - mid.hp).toBe(Math.max(1, Math.round(computeDamage(sapper.damage, mid, gm.combatRng) * splashFalloff(surfMid, 2.2, 0.4))));
    expect(far.hp).toBe(hpF);
    expect(ally.hp).toBe(hpA); // sem fogo amigo
    // ×1,5 contra construção e ×0,5 contra unidade (mesma base 400 − armadura)
    expect(computeDamage(sapper.damage, bld, gm.combatRng)).toBe(Math.round((400 - bld.armor) * 1.5 * 1.333));
    expect(full).toBe(Math.round((400 - center.armor) * 0.5 * 1.333));
  });

  it('1 RNG por entidade atingida, em ordem de id (determinismo)', () => {
    const once = () => {
      const gm = makeGm(9);
      const { x, z } = arena(gm);
      const sapper = gm.spawnUnit('arsonist', x, z + 1, 1);
      const victims = [];
      for (let i = 0; i < 4; i++) {
        const u = gm.spawnUnit('knight', x + (i % 2) * 2.0, z + Math.floor(i / 2) * 2.0, 0);
        u.speed = 0;
        u.hp = u.maxHp = 5000;
        place(u, u.mesh.position.x, u.mesh.position.z);
        victims.push(u);
      }
      gm.simStep(SIM_DT);
      place(sapper, x, z + 1);
      sapper.attackTarget = victims[0];
      let calls = 0;
      const rng = gm.combatRng;
      const orig = rng.next.bind(rng);
      rng.next = () => { calls++; return orig(); };
      sapper._detonate(gm, gm.allUnits);
      rng.next = orig;
      const hp = victims.map(u => Math.round(u.hp * 100) / 100).join(',');
      return { calls, hp, next: rng.next() };
    };
    const a = once();
    expect(a.calls).toBe(4);
    expect(once()).toEqual(a);
  });
});

describe('alvos e ordens (F4-05)', () => {
  it('auto-adquire construção/muralha mas não unidade isolada', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const sapper = gm.spawnUnit('sapper', x, z, 0);
    const lone = gm.spawnUnit('grunt', x + 4, z, 1);
    lone.speed = 0;
    gm.simStep(SIM_DT);
    expect(sapper.findNearestHostile(gm.allUnits, gm.buildings, 11)).toBeNull();
    run(gm, 2);
    expect(sapper.isDead).toBe(false);
    expect(lone.hp).toBe(lone.maxHp);
    const wall = build(gm, 'wall_orc', 1, x, z - 6);
    gm.simStep(SIM_DT);
    expect(sapper.findNearestHostile(gm.allUnits, gm.buildings, 11)).toBe(wall);
  });

  it('ordem de ataque explícita em unidade hostil funciona', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const sapper = gm.spawnUnit('sapper', x, z, 0);
    const grunt = gm.spawnUnit('grunt', x + 6, z, 1);
    grunt.speed = 0;
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [sapper.id], targetId: grunt.id });
    run(gm, 5);
    expect(sapper.isDead).toBe(true);
    expect(grunt.hp).toBeLessThan(grunt.maxHp);
  });

  it('sob hold não persegue; só explode em quem entra no alcance', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const sapper = gm.spawnUnit('sapper', x, z, 0);
    const grunt = gm.spawnUnit('grunt', x + 8, z, 1);
    grunt.speed = 0;
    grunt.attackRange = 0;
    gm.issue({ type: CMD.HOLD, playerId: 0, unitIds: [sapper.id] });
    run(gm, 3);
    expect(sapper.isDead).toBe(false);
    expect(Math.abs(sapper.mesh.position.x - x)).toBeLessThan(0.5);
    place(grunt, x + 1.2, z);
    run(gm, 2);
    expect(sapper.isDead).toBe(true);
    expect(grunt.hp).toBeLessThan(grunt.maxHp);
  });
});

describe('muralhas (F4-05)', () => {
  function wallRow(gm, n, ownerId = 1) {
    const { x, z } = arena(gm);
    const walls = [];
    for (let i = 0; i < n; i++) walls.push(build(gm, 'wall_orc', ownerId, x + i * WALL_STEP, z));
    return { walls, x, z };
  }

  it('1 sapador abre ≥ 1 segmento (e costuma levar os vizinhos)', () => {
    const gm = makeGm();
    const { walls, x, z } = wallRow(gm, 6);
    const sapper = gm.spawnUnit('sapper', walls[2].mesh.position.x, z + 12, 0);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [sapper.id], targetId: walls[2].id });
    run(gm, 8);
    expect(sapper.isDead).toBe(true);
    const dead = walls.filter(w => w.isDead).length;
    expect(dead).toBeGreaterThanOrEqual(1);
    expect(dead).toBeLessThanOrEqual(3);
    expect(x).toBeDefined();
  });

  it('3 sapadores derrubam a linha de 6 segmentos', () => {
    const gm = makeGm();
    const { walls, z } = wallRow(gm, 6);
    const ids = [];
    const aims = [walls[1], walls[4], walls[3]];
    aims.forEach((w, i) => {
      const s = gm.spawnUnit('sapper', w.mesh.position.x + (i - 1) * 0.6, z + 10 + i * 1.5, 0);
      ids.push(s.id);
      gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [s.id], targetId: w.id });
    });
    run(gm, 10);
    expect(walls.every(w => w.isDead)).toBe(true);
  });
});

describe('IA e sapadores (F4-05)', () => {
  it('IA orc com Oficina e inimigo com Centro nível 2 produz incendiários (até 3)', () => {
    const gm = makeGm(11, true);
    const ai = gm.getPlayer(1);
    const hq = hqOf(gm, 1);
    hq.tier = 2;
    hqOf(gm, 0).tier = 2; // inimigo com Centro nível ≥ 2
    ai.resources.gold = 9000; ai.resources.wood = 9000; ai.resources.stone = 5000;
    ai.maxPopulation = 150;
    for (let i = 0; i < 6; i++) build(gm, 'orc_house', 1, hq.mesh.position.x + 12 + (i % 3) * 6, hq.mesh.position.z - 12 - Math.floor(i / 3) * 6);
    gm.recalculatePopCap();
    build(gm, 'orc_barracks', 1, hq.mesh.position.x + 14, hq.mesh.position.z + 14);
    build(gm, 'orc_workshop', 1, hq.mesh.position.x + 22, hq.mesh.position.z + 14);
    for (let i = 0; i < 8; i++) gm.spawnUnit('grunt', hq.mesh.position.x + 6 + i * 0.6, hq.mesh.position.z + 6, 1);
    gm.buildings.filter(b => b.ownerId === 0).forEach(b => { b.hp = b.maxHp = 1e7; });
    let count = 0;
    let maxAlive = 0;
    for (let t = 0; t < 8 * 60 && count === 0; t++) {
      run(gm, 1);
      if (ai.resources.gold < 3000) ai.resources.gold = 6000;
      if (ai.resources.wood < 3000) ai.resources.wood = 6000;
      count = gm.getUnitsOf(1).filter(u => u.type === 'arsonist').length;
      maxAlive = Math.max(maxAlive, count);
    }
    expect(maxAlive).toBeGreaterThanOrEqual(1);
    expect(maxAlive).toBeLessThanOrEqual(3);
  }, 120000);
});
