import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { computeDamage } from '../../src/sim/combat.js';
import { applySplashDamage } from '../../src/sim/splash.js';
import { addStatus } from '../../src/sim/statuses.js';
import { UNITS } from '../../src/data/units.js';

/** F10-01 — combate com unidades reais: dano por tipo/armadura, morte, UNIT_DIED, kills, imunidade, área. */

function makeGm(seed = 7) {
  const cfg = createMatchConfig({ seed, headless: true });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  gm.aiDirectors.forEach(d => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  return gm;
}

/** Campo aberto longe das bases. */
function arena(gm) {
  const p = gm.getPlayer(0).startPos;
  return { x: p.x - 6, z: p.z - 26 };
}

function step(gm, n) {
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

const bounds = (damage, target) => {
  const lo = computeDamage(damage, target, { next: () => 0 });
  const hi = computeDamage(damage, target, { next: () => 1 });
  return [lo, hi];
};

describe('morte e eventos', () => {
  it('takeDamage subtrai exatamente a quantidade (sem armadura embutida) e não mata acima de 0', () => {
    const gm = makeGm();
    const a = arena(gm);
    const u = gm.spawnUnit('knight', a.x, a.z, 0);
    const hp0 = u.hp;
    u.takeDamage(10, null, gm.allUnits);
    expect(u.hp).toBe(hp0 - 10);
    expect(u.isDead).toBe(false);
  });

  it('dano letal: hp 0, isDead/isDying, estado dying e UNIT_DIED único com o dono do matador', () => {
    const gm = makeGm();
    const a = arena(gm);
    const victim = gm.spawnUnit('archer', a.x, a.z, 0);
    const killer = gm.spawnUnit('grunt', a.x + 30, a.z, 1);
    const died = [];
    gm.events.on(EVT.UNIT_DIED, e => died.push(e));
    victim.takeDamage(victim.hp + 500, killer, gm.allUnits);
    expect(victim.hp).toBe(0);
    expect(victim.isDead).toBe(true);
    expect(victim.isDying).toBe(true);
    expect(victim.state).toBe('dying');
    victim.takeDamage(50, killer, gm.allUnits); // golpe em cadáver é ignorado
    gm.events.flush();
    expect(died).toHaveLength(1);
    expect(died[0]).toMatchObject({ unitId: victim.id, ownerId: 0, unitType: 'archer', killerOwnerId: 1 });
  });

  it('MatchStats: baixa para o dono, abate para o matador; morte sem matador não conta abate', () => {
    const gm = makeGm();
    const a = arena(gm);
    const v1 = gm.spawnUnit('archer', a.x, a.z, 0);
    const v2 = gm.spawnUnit('archer', a.x + 3, a.z, 0);
    const killer = gm.spawnUnit('grunt', a.x + 30, a.z, 1);
    const s0 = gm.matchStats.byPlayer.get(0);
    const s1 = gm.matchStats.byPlayer.get(1);
    const lost0 = s0.unitsLost, k1 = s1.unitsKilled;
    v1.takeDamage(9999, killer, gm.allUnits);
    v2.takeDamage(9999, null, gm.allUnits);
    gm.events.flush();
    expect(s0.unitsLost).toBe(lost0 + 2);
    expect(s1.unitsKilled).toBe(k1 + 1);
  });

  it('status invulnerable ignora o dano; ao expirar volta a sofrer', () => {
    const gm = makeGm();
    const a = arena(gm);
    const u = gm.spawnUnit('knight', a.x, a.z, 0);
    addStatus(u, 'invulnerable', 1);
    const hp0 = u.hp;
    u.takeDamage(50, null, gm.allUnits);
    expect(u.hp).toBe(hp0);
    step(gm, Math.ceil(1.5 / SIM_DT));
    u.takeDamage(50, null, gm.allUnits);
    expect(u.hp).toBe(hp0 - 50);
  });

  it('morte reduz a população do dono após recalculatePop', () => {
    const gm = makeGm();
    const a = arena(gm);
    const p = gm.getPlayer(0);
    const u = gm.spawnUnit('knight', a.x, a.z, 0);
    p.recalculatePop(gm);
    const pop = p.population;
    u.takeDamage(99999, null, gm.allUnits);
    p.recalculatePop(gm);
    expect(p.population).toBe(pop - 1);
  });
});

describe('dano por tipo e armadura (golpes reais)', () => {
  /** Faz `attacker` bater uma vez em `target` e devolve o dano do primeiro golpe. */
  function firstHit(gm, attacker, target) {
    gm.issue({ type: CMD.ATTACK, playerId: attacker.ownerId, unitIds: [attacker.id], targetId: target.id });
    const hp0 = target.hp;
    for (let i = 0; i < 200 && target.hp === hp0; i++) gm.simStep(SIM_DT);
    return hp0 - target.hp;
  }

  it('Cavaleiro (normal) contra alvo sem armadura e contra alvo blindado: dano dentro dos limites da fórmula', () => {
    const gm = makeGm();
    const a = arena(gm);
    const attacker = gm.spawnUnit('knight', a.x, a.z, 0);
    const soft = gm.spawnUnit('villager', a.x + 1.6, a.z, 1);
    soft.hp = soft.maxHp = 9999;
    const dmg = UNITS.knight.damage;
    const [lo, hi] = bounds(dmg, { armor: soft.armor });
    const got = firstHit(gm, attacker, soft);
    expect(got).toBeGreaterThanOrEqual(lo);
    expect(got).toBeLessThanOrEqual(hi);
  });

  it('armadura reduz o dano: o mesmo atacante causa menos (ou igual a 1) contra alvo de armadura alta', () => {
    const gm = makeGm();
    const a = arena(gm);
    const [loSoft, hiSoft] = bounds(UNITS.grunt.damage, { armor: 0 });
    const [loHard, hiHard] = bounds(UNITS.grunt.damage, { armor: 12 });
    expect(hiHard).toBeLessThan(hiSoft);
    expect(loHard).toBeLessThanOrEqual(loSoft);
    const attacker = gm.spawnUnit('grunt', a.x, a.z, 1);
    const tank = gm.spawnUnit('knight', a.x + 1.6, a.z, 0);
    tank.armor = 12;
    tank.hp = tank.maxHp = 9999;
    const got = firstHit(gm, attacker, tank);
    expect(got).toBeGreaterThanOrEqual(loHard);
    expect(got).toBeLessThanOrEqual(hiHard);
  });

  it('arqueiro dispara de longe: a flecha causa dano ao alvo dentro do alcance (projétil, não corpo a corpo)', () => {
    const gm = makeGm();
    const a = arena(gm);
    const archer = gm.spawnUnit('archer', a.x, a.z, 0);
    const target = gm.spawnUnit('knight', a.x + 9, a.z, 1);
    target.hp = target.maxHp = 9999;
    const [lo, hi] = bounds(UNITS.archer.damage, { armor: target.armor });
    gm.issue({ type: CMD.ATTACK, playerId: 0, unitIds: [archer.id], targetId: target.id });
    const hp0 = target.hp;
    let dist0 = null;
    for (let i = 0; i < 300 && target.hp === hp0; i++) {
      gm.simStep(SIM_DT);
      if (dist0 === null && archer.state === 'attacking') dist0 = Math.hypot(archer.mesh.position.x - target.mesh.position.x, archer.mesh.position.z - target.mesh.position.z);
    }
    const dmg = hp0 - target.hp;
    expect(dmg).toBeGreaterThanOrEqual(lo);
    expect(dmg).toBeLessThanOrEqual(hi);
    expect(dist0).toBeGreaterThan(UNITS.knight.attackRange + 2); // atirou a distância, sem encostar
  });

  it('mesma seed e mesmos comandos: a sequência de PV do alvo é idêntica (RNG de combate determinístico)', () => {
    const trace = () => {
      const gm = makeGm(11);
      const a = arena(gm);
      const att = gm.spawnUnit('grunt', a.x, a.z, 1);
      const tgt = gm.spawnUnit('knight', a.x + 1.6, a.z, 0);
      tgt.hp = tgt.maxHp = 9999;
      gm.issue({ type: CMD.ATTACK, playerId: 1, unitIds: [att.id], targetId: tgt.id });
      const out = [];
      for (let i = 0; i < 160; i++) { gm.simStep(SIM_DT); out.push(tgt.hp); }
      return out;
    };
    const t1 = trace();
    expect(t1[t1.length - 1]).toBeLessThan(9999); // houve golpes
    expect(trace()).toEqual(t1);
  });
});

describe('dano em área (applySplashDamage)', () => {
  it('só hostis dentro do raio sofrem; aliados do dono e distantes ficam intactos; queda com a distância', () => {
    const gm = makeGm();
    const a = arena(gm);
    const owner = gm.spawnUnit('archer', a.x - 20, a.z, 0);
    const center = gm.spawnUnit('knight', a.x, a.z, 1);
    const edge = gm.spawnUnit('knight', a.x + 1.4, a.z, 1);
    const far = gm.spawnUnit('knight', a.x + 8, a.z, 1);
    const friend = gm.spawnUnit('knight', a.x + 0.2, a.z + 0.3, 0);
    for (const u of [center, edge, far, friend]) { u.hp = u.maxHp = 9999; u.armor = 0; }
    const dmg = { basic: 60, piercing: 0, type: 'magic' };
    const hits = applySplashDamage(gm, owner, dmg, { x: a.x, z: a.z }, 1.5, gm.allUnits);
    expect(hits).toBe(2);
    expect(friend.hp).toBe(9999);
    expect(far.hp).toBe(9999);
    const dCenter = 9999 - center.hp;
    const dEdge = 9999 - edge.hp;
    expect(dCenter).toBeGreaterThan(0);
    expect(dEdge).toBeGreaterThan(0);
    expect(dEdge).toBeLessThanOrEqual(dCenter + 1); // borda recebe ≤ centro (±1 pelo sorteio)
  });
});
