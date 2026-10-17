import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { createCampaignMissionConfig, CampaignProgress, memoryStorage } from '../../src/campaign/index.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { baseMission, makeMissionGm, runTicks, teleport } from './helpers/missionWorld.js';

/**
 * F5-06 — IA de campanha por DADOS (ações de missão): guarnição fixa (leash por área), onda no tempo, ataque
 * programado por morte de objetivo, determinismo e as missões 03/06 do Reino com script.
 */
const base = (setup, triggers = []) => baseMission({
  autoVictory: false,
  vars: { n: 0 },
  objectives: [{ id: 'o', type: 'survive', priority: 'primary', seconds: 9999, title: 'x' }],
  setup,
  triggers
});
const tagged = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i)).filter(Boolean);
const dist = (u, x, z) => Math.hypot(u.mesh.position.x - x, u.mesh.position.z - z);

describe('guarnição fixa (F5-06)', () => {
  it('não persegue além da área: com o alvo fora do raio, volta ao ponto', () => {
    const gm = makeMissionGm(base([
      { type: 'spawn', owner: 1, unitType: 'grunt', count: 2, x: 0, z: 10, tag: 'g', guard: { r: 5 } }
    ]));
    runTicks(gm, 2);
    const guards = tagged(gm, 'g');
    expect(guards.length).toBe(2);
    expect(guards[0].guardRadius).toBe(5);
    const bait = gm.getUnitsOf(0)[0];
    let max = 0;
    // isca a ~9 do ponto (dentro do aggro, fora do raio): puxa a guarnição para fora
    for (let t = 0; t < 400; t++) {
      teleport(gm, bait, 9, 10);
      runTicks(gm, 1);
      for (const g of guards) if (!g.isDead) max = Math.max(max, dist(g, 0, 10));
    }
    expect(max).toBeLessThan(5 + 4);
    teleport(gm, bait, -22, 20);
    runTicks(gm, 400);
    for (const g of guards) if (!g.isDead) expect(dist(g, 0, 10)).toBeLessThan(5);
  });

  it('ação guard prende unidades já existentes e release solta', () => {
    const gm = makeMissionGm(base([
      { type: 'spawn', owner: 1, unitType: 'grunt', count: 1, x: 0, z: 10, tag: 'g' }
    ], [
      { id: 'go', when: { type: 'time', at: 0 }, actions: [{ type: 'guard', select: { tag: 'g' }, area: { x: 0, z: 10, r: 6 } }] },
      { id: 'free', when: { type: 'time', at: 2 }, actions: [{ type: 'guard', select: { tag: 'g' }, release: true }] }
    ]));
    runTicks(gm, 5);
    const g = tagged(gm, 'g')[0];
    expect(g.homePos).toEqual({ x: 0, z: 10 });
    expect(g.guardRadius).toBe(6);
    runTicks(gm, 60);
    expect(g.homePos).toBeNull();
  });
});

describe('ondas e ataques programados (F5-06)', () => {
  it('onda spawna no tempo marcado e marcha ao alvo', () => {
    const gm = makeMissionGm(base([], [
      { id: 'wave', when: { type: 'time', at: 3 }, actions: [
        { type: 'spawn', owner: 'enemy', unitType: 'grunt', count: 3, x: 20, z: -20, tag: 'w', order: { kind: 'attackMove', x: -20, z: 20 } }] }
    ]));
    runTicks(gm, 40);
    expect(tagged(gm, 'w').length).toBe(0);
    runTicks(gm, 40);
    const w = tagged(gm, 'w');
    expect(w.length).toBe(3);
    runTicks(gm, 100);
    expect(w.every((u) => u.isDead || dist(u, 20, -20) > 3)).toBe(true);
  });

  it('ataque programado pela morte de um alvo libera a guarnição', () => {
    const gm = makeMissionGm(base([
      { type: 'spawn', owner: 1, unitType: 'grunt', count: 2, x: 0, z: 12, tag: 'g', guard: { r: 4 } },
      { type: 'spawn', owner: 1, unitType: 'peon', count: 1, x: 10, z: 12, tag: 'target' }
    ], [
      { id: 'counter', when: { type: 'dead', select: { tag: 'target' } }, actions: [
        { type: 'order', select: { tag: 'g' }, kind: 'attackMove', x: -20, z: 20, release: true }] }
    ]));
    runTicks(gm, 40);
    const g = tagged(gm, 'g');
    expect(g.every((u) => u.homePos)).toBe(true);
    tagged(gm, 'target')[0].takeDamage(1e6, gm.getUnitsOf(0)[0], gm.allUnits);
    runTicks(gm, 200);
    expect(g.every((u) => u.isDead || (u.homePos === null && dist(u, 0, 12) > 8))).toBe(true);
  });

  it('determinismo: mesma seed, mesmo checksum', () => {
    const mk = () => makeMissionGm(base([
      { type: 'spawn', owner: 1, unitType: 'grunt', count: 3, x: 0, z: 12, tag: 'g', guard: { r: 4 } }
    ], [
      { id: 'wave', once: false, when: { type: 'every', seconds: 5 }, actions: [
        { type: 'spawn', owner: 'enemy', unitType: 'grunt', count: 2, x: 20, z: -20, order: { kind: 'attackMove', x: -20, z: 20 } }] }
    ]), { seed: 7 });
    const a = mk();
    const b = mk();
    runTicks(a, 400);
    runTicks(b, 400);
    expect(stateChecksum(a)).toBe(stateChecksum(b));
  });

  it('o validador aceita guard/release e recusa raio inválido', () => {
    const ok = base([{ type: 'spawn', owner: 1, unitType: 'grunt', x: 0, z: 0, tag: 'g', guard: { r: 3 } }], [
      { id: 't', when: { type: 'time', at: 1 }, actions: [
        { type: 'guard', select: { tag: 'g' }, area: { x: 0, z: 0, r: 4 } },
        { type: 'order', select: { tag: 'g' }, kind: 'stop', release: true }] }]);
    expect(validateMission(ok, { checkMap: false }).ok).toBe(true);
    const bad = base([{ type: 'spawn', owner: 1, unitType: 'grunt', x: 0, z: 0, guard: { r: -1 } }]);
    expect(validateMission(bad, { checkMap: false }).ok).toBe(false);
  });
});

describe('missões da campanha com IA scriptada (F5-06)', () => {
  const boot = (id) => {
    const cfg = createCampaignMissionConfig('alliance', id, { progress: new CampaignProgress(memoryStorage()), unlockAll: true });
    cfg.headless = true;
    return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
  };

  it('m03: piquete fixo até a onda 5 e depois ataca; sem exceção', () => {
    const gm = boot('alliance-03-muralhas-de-alvorada');
    runTicks(gm, 5);
    const pk = tagged(gm, 'picket');
    expect(pk.length).toBe(3);
    expect(pk.every((u) => u.homePos && u.guardRadius === 8)).toBe(true);
    runTicks(gm, 20 * 10);
    expect(pk.every((u) => u.homePos)).toBe(true); // ainda presos antes da onda 5
    gm.mission.vars.waves = 5;
    runTicks(gm, 5);
    expect(pk.every((u) => u.isDead || u.homePos === null)).toBe(true);
  });

  it('m06: guarnição do Sal Cinzento solta pela queda do salão das Marés; determinístico', () => {
    const run = () => {
      const gm = boot('alliance-06-ilhas-de-brasa');
      runTicks(gm, 5);
      expect(tagged(gm, 'garrison-sal').every((u) => u.homePos)).toBe(true);
      runTicks(gm, 20 * 20);
      const hall = gm.buildings.find((b) => b.type === 'great_hall' && b.ownerId === 2);
      hall.takeDamage(1e6, gm.getUnitsOf(0)[0]);
      runTicks(gm, 20 * 30);
      expect(tagged(gm, 'garrison-sal').every((u) => u.isDead || u.homePos === null)).toBe(true);
      return stateChecksum(gm);
    };
    expect(run()).toBe(run());
  });
});
