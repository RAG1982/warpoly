import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { canTarget } from '../../src/sim/targeting.js';
import { isDetectedBy } from '../../src/sim/detection.js';
import { missingRequirements } from '../../src/sim/requirements.js';
import { UNITS, FACTIONS, getBuildingDef } from '../../src/data/index.js';

/**
 * air.test.js — F4-06: camada de voo, regras de alvo (`canTarget`), batedores/ataque aéreo, Aviário/Ninho.
 * Jogador 0 = humano, 1 = orc (IAs desligadas).
 */
function makeGm(seed = 5) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}
const isHq = b => b.type === 'castle' || b.type === 'great_hall';
const hqOf = (gm, id) => gm.buildings.find(b => b.ownerId === id && isHq(b));
const arena = gm => { const hq = hqOf(gm, 0); return { x: hq.mesh.position.x - 6, z: hq.mesh.position.z - 26 }; };
function run(gm, s) { const n = Math.round(s / SIM_DT); for (let i = 0; i < n; i++) gm.simStep(SIM_DT); }
function place(u, x, z) {
  u.mesh.position.set(x, u.terrain.getHeight(x, z) + u.flyHeight, z);
  u._prevPos.copy(u.mesh.position);
  u._simPos.copy(u.mesh.position);
}
function build(gm, type, ownerId, x, z) {
  const b = gm.createBuilding(type, x, z, true, ownerId);
  b.isConstructed = true;
  gm.buildings.push(b);
  return b;
}
const still = u => { u.speed = 0; };

describe('dados aéreos (F4-06)', () => {
  it('Batedor aéreo: números da spec, sem ataque, detector', () => {
    for (const [t, f] of [['glider', 'human'], ['war_balloon', 'orc']]) {
      const u = UNITS[t];
      expect(u.faction).toBe(f);
      expect(u).toMatchObject({ hp: 120, speed: 7.0, armor: 0, layer: 'air', visionRadius: 30, detector: true, attackRange: 0, isCombat: false, trainTime: 14 });
      expect(u.damage).toEqual({ basic: 0, piercing: 0, type: 'normal' });
      expect(u.cost).toEqual({ gold: 110, wood: 60, stone: 20 });
      expect(u.requires).toEqual([{ hq: 2 }]);
    }
    expect(getBuildingDef('workshop').trains).toContain('glider');
    expect(getBuildingDef('orc_workshop').trains).toContain('war_balloon');
  });

  it('Ataque aéreo: números da spec e Aviário/Ninho exigem Quartel + Centro 3', () => {
    for (const [t, f, b, barr] of [['gryphon_rider', 'human', 'aviary', 'barracks'], ['war_serpent', 'orc', 'serpent_nest', 'orc_barracks']]) {
      const u = UNITS[t];
      expect(u.faction).toBe(f);
      expect(u).toMatchObject({ hp: 350, speed: 6.2, armor: 2, layer: 'air', canHitAir: true, canHitGround: true, attackRange: 2.5, attackCooldown: 1.6, splashRadius: 1.2, trainTime: 22 });
      expect(u.damage).toEqual({ basic: 0, piercing: 38, type: 'magic' });
      expect(u.cost).toEqual({ gold: 250, wood: 100, stone: 0 });
      expect(u.requires).toEqual([{ hq: 3 }]);
      const d = getBuildingDef(b);
      expect(d.role).toBe('aerie');
      expect(d.hp).toBe(900);
      expect(d.cost).toEqual({ gold: 300, wood: 150, stone: 60 });
      expect(d.collisionRadius).toBe(3.4);
      expect(d.requires).toEqual([barr, { hq: 3 }]);
      expect(d.trains).toEqual([t]);
      expect(FACTIONS[f].buildList).toContain(b);
    }
  });

  it('Aviário exige Quartel e Centro nível 3 (requisitos avaliados)', () => {
    const gm = makeGm();
    expect(missingRequirements(0, 'aviary', gm).length).toBe(2);
    build(gm, 'barracks', 0, 0, 0);
    expect(missingRequirements(0, 'aviary', gm).length).toBe(1);
    hqOf(gm, 0).tier = 3;
    expect(missingRequirements(0, 'aviary', gm)).toEqual([]);
  });
});

describe('canTarget (F4-06)', () => {
  const air = { layer: 'air' };
  const ground = { layer: 'ground' };
  it('melee e cerco não atingem aéreo; atirador, torre e aéreo sim', () => {
    expect(canTarget({ canHitAir: false, canHitGround: true }, air)).toBe(false);
    expect(canTarget({ canHitAir: true, canHitGround: true }, air)).toBe(true);
    expect(canTarget({ canHitAir: true, canHitGround: true }, ground)).toBe(true);
    expect(canTarget({ canHitAir: false, canHitGround: false }, ground)).toBe(false);
    expect(canTarget({ canHitAir: true, canHitGround: true }, { layer: 'air', immune: true })).toBe(false);
  });

  it('unidades reais: arqueiro/lançador/magos sim; cavaleiro/cerco/sapador não; grifo atinge terrestre e aéreo', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const mk = t => gm.spawnUnit(t, x, z, 0);
    const glider = gm.spawnUnit('war_balloon', x, z, 1);
    expect(canTarget(mk('archer'), glider)).toBe(true);
    expect(canTarget(mk('axethrower'), glider)).toBe(true);
    expect(canTarget(mk('knight'), glider)).toBe(false);
    expect(canTarget(mk('cavalier'), glider)).toBe(false);
    expect(canTarget(mk('ballista'), glider)).toBe(false);
    expect(canTarget(mk('sapper'), glider)).toBe(false);
    const gryphon = mk('gryphon_rider');
    expect(canTarget(gryphon, glider)).toBe(true);
    expect(canTarget(gryphon, mk('grunt'))).toBe(true);
    expect(canTarget(mk('glider'), mk('grunt'))).toBe(false); // batedor sem ataque
  });

  it('torres de arqueiros acertam aéreo; ordem de ataque de melee a aéreo é ignorada', () => {
    const gm = makeGm();
    expect(getBuildingDef('watchtower').tower.hitsAir).toBe(true);
    expect(getBuildingDef('orc_watchtower').tower.hitsAir).toBe(true);
    const { x, z } = arena(gm);
    const tower = build(gm, 'watchtower', 0, x, z);
    expect(canTarget(tower, { layer: 'air' })).toBe(true);
    const knight = gm.spawnUnit('knight', x + 4, z, 0);
    const ser = gm.spawnUnit('war_serpent', x + 6, z, 1);
    gm.simStep(SIM_DT);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [knight.id], targetId: ser.id });
    expect(knight.state).not.toBe('attacking');
  });
});

describe('voo (F4-06)', () => {
  it('Y = terreno + flyHeight; sem pathfinder; atravessa água e muralha em linha reta', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const u = gm.spawnUnit('gryphon_rider', x, z, 0);
    expect(u.layer).toBe('air');
    expect(u.flyHeight).toBe(4.5);
    expect(u.mesh.position.y).toBeCloseTo(u.terrain.getHeight(x, z) + 4.5, 5);
    // faixa de "água" falsa entre x+10 e x+14 (terreno < 0,65) e uma muralha orc no caminho
    const real = gm.terrain.getHeight.bind(gm.terrain);
    gm.terrain.getHeight = (px, pz) => (px > x + 10 && px < x + 14 ? 0 : real(px, pz));
    build(gm, 'wall_orc', 1, x + 6, z);
    let asked = 0;
    const rp = gm.pathfinder.requestPath.bind(gm.pathfinder);
    gm.pathfinder.requestPath = (...a) => { asked++; return rp(...a); };
    gm.simStep(SIM_DT);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [u.id], x: x + 24, z });
    run(gm, 6);
    expect(asked).toBe(0);
    expect(Math.abs(u.mesh.position.x - (x + 24))).toBeLessThan(1);
    expect(u.mesh.position.y).toBeGreaterThan(3.5);
    // um terrestre com a mesma ordem não passa pela faixa de água
    const g = gm.spawnUnit('knight', x, z + 8, 0);
    gm.pathfinder.requestPath = rp;
    g.moveTo(x + 24, z + 8, gm);
    for (let i = 0; i < 20 * 8; i++) gm.simStep(SIM_DT);
    expect(g.mesh.position.x).toBeLessThan(x + 10.5);
    gm.terrain.getHeight = real;
  });

  it('não bloqueia o pathfinder nem colide com construções/terrestres', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const before = Array.from(gm.pathfinder.dynamicBlock).reduce((a, b) => a + b, 0);
    const u = gm.spawnUnit('war_serpent', x, z, 1);
    const g = gm.spawnUnit('knight', x, z, 0);
    still(g); still(u);
    place(g, x, z);
    place(u, x, z);
    const gx = g.mesh.position.x;
    run(gm, 1);
    expect(g.mesh.position.x).toBeCloseTo(gx, 5); // sem empurrão entre camadas
    expect(Array.from(gm.pathfinder.dynamicBlock).reduce((a, b) => a + b, 0)).toBe(before);
    const b = build(gm, 'orc_barracks', 1, x + 20, z);
    place(u, b.mesh.position.x, b.mesh.position.z);
    const ux = u.mesh.position.x;
    run(gm, 1);
    expect(u.mesh.position.x).toBeCloseTo(ux, 3); // sobrevoa a construção sem ser expulso
  });

  it('formação mista: terrestres mantêm caminho, aéreos vão direto', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const us = [gm.spawnUnit('knight', x, z, 0), gm.spawnUnit('knight', x + 2, z, 0), gm.spawnUnit('glider', x + 1, z + 2, 0), gm.spawnUnit('gryphon_rider', x + 3, z + 2, 0)];
    gm.simStep(SIM_DT);
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: us.map(u => u.id), x: x, z: z + 10 });
    gm.simStep(SIM_DT);
    const air = us.filter(u => u.layer === 'air');
    for (const u of air) { expect(u.waypoints).toBeNull(); expect(u.hasTargetPos).toBe(true); }
    run(gm, 8);
    for (const u of us) expect([u.type, Math.hypot(u.mesh.position.x - x, u.mesh.position.z - (z + 10)) < 5]).toEqual([u.type, true]);
  });
});

describe('detecção e combate aéreo (F4-06)', () => {
  it('batedor aéreo (detector) revela invisível; sem ele não', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const enemy = gm.spawnUnit('grunt', x + 12, z, 1);
    enemy.mods.invisible = true;
    gm.simStep(SIM_DT);
    expect(isDetectedBy(gm, enemy, 0)).toBe(false);
    const g = gm.spawnUnit('glider', x, z, 0);
    place(g, x + 8, z);
    expect(isDetectedBy(gm, enemy, 0)).toBe(true);
  });

  it('batedor não ataca; Grifo causa dano em área mágico e ignora armadura', () => {
    const gm = makeGm();
    gm.combatRng = { next: () => 1 };
    const { x, z } = arena(gm);
    const gl = gm.spawnUnit('glider', x, z, 0);
    const victim = gm.spawnUnit('grunt', x + 2, z, 1);
    const near = gm.spawnUnit('grunt', x + 2.8, z, 1);
    const far = gm.spawnUnit('grunt', x + 12, z, 1);
    for (const u of [victim, near, far]) { still(u); u.hp = u.maxHp = 5000; u.armor = 9; }
    gm.simStep(SIM_DT);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [gl.id], targetId: victim.id });
    run(gm, 3);
    expect(victim.hp).toBe(5000);
    const gr = gm.spawnUnit('gryphon_rider', x, z, 0);
    gm.simStep(SIM_DT);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [gr.id], targetId: victim.id });
    run(gm, 3);
    expect(victim.hp).toBeLessThan(5000);
    expect(near.hp).toBeLessThan(5000); // área curta (1,2)
    expect(far.hp).toBe(5000);
    expect(5000 - victim.hp).toBe(Math.round(38 * 1.333) * Math.floor((5000 - victim.hp) / Math.round(38 * 1.333))); // magia ignora armadura 9
  });

  it('arqueiro abate aéreo; guerreiro corpo a corpo não o ataca', () => {
    const gm = makeGm();
    const { x, z } = arena(gm);
    const ser = gm.spawnUnit('war_balloon', x + 6, z, 1);
    still(ser);
    const knight = gm.spawnUnit('knight', x, z, 0);
    gm.simStep(SIM_DT);
    run(gm, 3);
    expect(ser.hp).toBe(ser.maxHp);
    expect(knight.state).not.toBe('attacking');
    const archer = gm.spawnUnit('archer', x, z + 1, 0);
    gm.simStep(SIM_DT);
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [archer.id], targetId: ser.id });
    run(gm, 8);
    expect(ser.hp).toBeLessThan(ser.maxHp);
  });
});

describe('modelos aéreos (F4-06)', () => {
  it('nós animados (asas/hélice) sobrevivem ao skinning e construções têm modelo', async () => {
    const { ModelFactory } = await import('../../src/entities/ModelFactory.js');
    const wasHeadless = ModelFactory.headless;
    ModelFactory.headless = false; // as partidas de teste ligam o modo headless (grupos vazios)
    try {
    for (const t of ['glider', 'war_balloon', 'gryphon_rider', 'war_serpent']) {
      const m = ModelFactory.createUnit(t);
      expect(m.userData.torso, t).toBeTruthy();
      if (t === 'war_balloon') expect(m.userData.rotor).toBeTruthy();
      else { expect(m.userData.wingL, t).toBeTruthy(); expect(m.userData.wingR, t).toBeTruthy(); }
    }
    for (const b of ['aviary', 'serpent_nest']) expect(ModelFactory.createBuildingByType(b).children.length).toBeGreaterThan(3);
    } finally { ModelFactory.headless = wasHeadless; }
  });
});
