import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { HQ_TIER_HP } from '../../src/data/tiers.js';
import { missingRequirements } from '../../src/sim/requirements.js';
import { FACTIONS, WORKER_BUILD_LIST, BUILDING_BUILD_CONFIG, HQ_MAX_PER_PLAYER, HQ_MIN_DISTANCE, HQ_ENEMY_CLEARANCE, getBuildingDef } from '../../src/data/index.js';
import { getBuildHotkey } from '../../src/ui/hotkeys.js';

/**
 * ENG-WALL (B) — Centros extras CONSTRUÍDOS pelo trabalhador (Paço Real / Salão do Clã nível 1): menu, custo, limite de 3, distância mínima,
 * entrega, treino, upgrade e derrota. (O 2º Centro por `spawnBuilding` de missão está em twoHq.test.js.) A IA não constrói Centros extras.
 */
const isHq = (b) => getBuildingDef(b.type).role === 'hq';
const hqsOf = (gm, id = 0) => gm.buildings.filter((b) => b.ownerId === id && isHq(b) && !b.isDead);
const rich = (gm, id = 0) => { Object.assign(gm.getPlayer(id).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 }); };
const issue = (gm, cmd) => { gm.issue(cmd); gm.simStep(SIM_DT); };
const seconds = (gm, s) => { for (let i = 0; i < Math.round(s / SIM_DT); i++) gm.simStep(SIM_DT); };
const kill = (b) => b.takeDamage(1e9, { ownerId: 77 });

function makeGm({ faction = 'human', victoryMode = 'conquest' } = {}) {
  const cfg = createMatchConfig({ seed: 5, headless: true, victoryMode });
  if (faction === 'orc') cfg.players[0].factionId = 'orc';
  const gm = new GameManager(new Terrain(), null, null, cfg);
  gm.aiDirectors.forEach((d) => d.dispose?.());
  gm.aiDirectors = [];
  gm.aiDirector = null;
  gm.trees.forEach((t) => { t.woodRemaining = 0; }); // o mapa real é denso de florestas (folga de 9 u): o teste mede as regras do Centro, não as árvores
  return gm;
}
const hqType = (gm, id = 0) => FACTIONS[gm.getPlayer(id).factionId].hq;
const workerType = (gm, id = 0) => FACTIONS[gm.getPlayer(id).factionId].worker;
const workers = (gm, n, id = 0) => gm.getUnitsOf(id).filter((u) => u.type === workerType(gm, id)).slice(0, n).map((u) => u.id);

/** Primeiro ponto válido para um novo Centro do dono, em anéis ao redor de `from`, distante de `avoid` (pontos já escolhidos). */
function spotFor(gm, from, owner = 0, avoid = []) {
  const type = hqType(gm, owner);
  const cands = [];
  for (let x = -60; x <= 60; x += 4) for (let z = -60; z <= 60; z += 4) cands.push({ x, z, d: Math.hypot(x - from.x, z - from.z) });
  cands.sort((p, q) => p.d - q.d);
  for (const c of cands) {
    if (c.d < HQ_MIN_DISTANCE) continue;
    if (avoid.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < HQ_MIN_DISTANCE)) continue;
    if (gm.canPlaceBuilding(type, c.x, c.z, null, owner)) return { x: c.x, z: c.z };
  }
  throw new Error('sem ponto livre para um novo Centro');
}

/** Constrói um Centro extra pelo caminho normal (comando PLACE_BUILDING + 3 trabalhadores) e espera a obra terminar. */
function buildHq(gm, spot, owner = 0) {
  const n0 = hqsOf(gm, owner).length;
  issue(gm, { type: CMD.PLACE_BUILDING, playerId: owner, buildingType: hqType(gm, owner), x: spot.x, z: spot.z, unitIds: workers(gm, 3, owner) });
  const b = hqsOf(gm, owner).find((h) => Math.hypot(h.mesh.position.x - spot.x, h.mesh.position.z - spot.z) < 0.01);
  expect(hqsOf(gm, owner)).toHaveLength(n0 + 1);
  for (let i = 0; i < 60 / SIM_DT && !b.isConstructed; i++) gm.simStep(SIM_DT);
  return b;
}

describe('Centro extra: dados e menu de construção', () => {
  it('Paço Real/Salão do Clã estão no menu do aldeão/peão, com custo alto, tempo de obra e dica em PT-BR', () => {
    for (const [f, worker] of [['human', 'villager'], ['orc', 'peon']]) {
      const hq = FACTIONS[f].hq;
      expect(WORKER_BUILD_LIST[worker]).toContain(hq);
      const cfg = BUILDING_BUILD_CONFIG[hq];
      expect(cfg.cost).toMatchObject({ gold: 800, wood: 400, stone: 250 });
      expect(cfg.description).toMatch(/Centros extras/);
      expect(getBuildingDef(hq).buildTime).toBe(30);
      expect(getBuildHotkey(hq)).not.toBe('');
    }
    expect(HQ_MAX_PER_PLAYER).toBe(3);
    expect(HQ_MIN_DISTANCE).toBe(24);
  });
});

describe('Centro extra: regras de colocação', () => {
  it('2º e 3º Centros pelo comando normal; o 4º é recusado (limite 3) sem cobrar', () => {
    const gm = makeGm();
    rich(gm);
    const first = hqsOf(gm)[0];
    const s2 = spotFor(gm, first.mesh.position);
    const s3 = spotFor(gm, first.mesh.position, 0, [s2]);
    const s4 = spotFor(gm, first.mesh.position, 0, [s2, s3]); // válido ENQUANTO há vaga; deixa de ser com 3 Centros
    expect(gm.canPlaceBuilding('castle', s4.x, s4.z, null, 0)).toBe(true);
    const h2 = buildHq(gm, s2);
    const h3 = buildHq(gm, s3);
    expect(hqsOf(gm)).toHaveLength(3);
    for (const h of [h2, h3]) {
      expect(h.isConstructed).toBe(true);
      expect(h.tier).toBe(1);
      expect(h.maxHp).toBe(HQ_TIER_HP[1]);
      expect(h.hp).toBe(h.maxHp);
    }
    expect(gm.canPlaceBuilding('castle', s4.x, s4.z, null, 0)).toBe(false);
    const before = { ...gm.getPlayer(0).resources };
    issue(gm, { type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'castle', x: s4.x, z: s4.z, unitIds: workers(gm, 1) });
    expect(hqsOf(gm)).toHaveLength(3);
    expect(gm.getPlayer(0).resources.gold).toBe(before.gold);
  });

  it('cobra 800/400/250 e a obra leva ~30 s com um trabalhador (mais rápido com três)', () => {
    const gm = makeGm();
    rich(gm);
    const first = hqsOf(gm)[0];
    const s = spotFor(gm, first.mesh.position);
    const r0 = { ...gm.getPlayer(0).resources };
    issue(gm, { type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'castle', x: s.x, z: s.z, unitIds: workers(gm, 1) });
    const r1 = gm.getPlayer(0).resources;
    expect([r0.gold - r1.gold, r0.wood - r1.wood, r0.stone - r1.stone]).toEqual([800, 400, 250]);
    const b = hqsOf(gm).find((h) => h !== first);
    expect(b.isConstructed).toBe(false);
    expect(b.buildHit).toBeCloseTo(80 / 30, 6);
    let t = 0;
    while (!b.isConstructed && t < 120) { gm.simStep(SIM_DT); t += SIM_DT; }
    expect(b.isConstructed).toBe(true);
    // 30 s de martelo + a caminhada até a obra
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThan(75);
  });

  it('distância mínima de 24 u de outro Centro do mesmo dono; nenhum ponto a menos disso é válido', () => {
    const gm = makeGm();
    const first = hqsOf(gm)[0];
    const p = first.mesh.position;
    let tested = 0;
    for (let dx = -23; dx <= 23; dx += 2) {
      for (let dz = -23; dz <= 23; dz += 2) {
        if (Math.hypot(dx, dz) >= HQ_MIN_DISTANCE - 0.01) continue;
        expect(gm.canPlaceBuilding('castle', p.x + dx, p.z + dz, null, 0)).toBe(false);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(200);
    const s = spotFor(gm, p);
    expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThanOrEqual(HQ_MIN_DISTANCE);
  });

  it('não se ergue Centro a menos de HQ_ENEMY_CLEARANCE de um Centro inimigo', () => {
    const gm = makeGm();
    const enemy = hqsOf(gm, 1)[0].mesh.position;
    for (let dx = -44; dx <= 44; dx += 4) {
      for (let dz = -44; dz <= 44; dz += 4) {
        if (Math.hypot(dx, dz) >= HQ_ENEMY_CLEARANCE - 0.01) continue;
        expect(gm.canPlaceBuilding('castle', enemy.x + dx, enemy.z + dz, null, 0)).toBe(false);
      }
    }
  });

  it('não funda Centro sobre trabalho recusado: sem recursos, nada é criado', () => {
    const gm = makeGm();
    const first = hqsOf(gm)[0];
    const s = spotFor(gm, first.mesh.position);
    gm.getPlayer(0).resources.gold = 799;
    issue(gm, { type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'castle', x: s.x, z: s.z, unitIds: workers(gm, 1) });
    expect(hqsOf(gm)).toHaveLength(1);
  });

  it('o Centro inicial morto libera uma vaga (limite conta só Centros vivos)', () => {
    const gm = makeGm();
    rich(gm);
    const first = hqsOf(gm)[0];
    const s2 = spotFor(gm, first.mesh.position);
    buildHq(gm, s2);
    const s3 = spotFor(gm, first.mesh.position, 0, [s2]);
    buildHq(gm, s3);
    kill(first);
    gm.simStep(SIM_DT);
    expect(hqsOf(gm)).toHaveLength(2);
    expect(spotFor(gm, s2, 0, [s2, s3])).toBeTruthy(); // há vaga de novo
  });
});

describe('Centro extra: funciona como Centro (entrega, treino, upgrade, derrota)', () => {
  it('só entrega recursos depois de concluído; depois o Centro mais próximo recebe ouro/madeira/pedra', () => {
    const gm = makeGm();
    rich(gm);
    const first = hqsOf(gm)[0];
    const s = spotFor(gm, first.mesh.position);
    issue(gm, { type: CMD.PLACE_BUILDING, playerId: 0, buildingType: 'castle', x: s.x, z: s.z, unitIds: workers(gm, 3) });
    const b = hqsOf(gm).find((h) => h !== first);
    expect(gm.findNearestDropoff({ x: s.x, z: s.z }, 'gold', gm.buildings, 0)).toBe(first); // em obra: ainda não serve
    for (let i = 0; i < 60 / SIM_DT && !b.isConstructed; i++) gm.simStep(SIM_DT);
    for (const res of ['gold', 'wood', 'stone']) {
      expect(gm.findNearestDropoff({ x: s.x, z: s.z + 2 }, res, gm.buildings, 0)).toBe(b);
      expect(gm.findNearestDropoff({ x: first.mesh.position.x, z: first.mesh.position.z }, res, gm.buildings, 0)).toBe(first);
    }
  });

  it('um trabalhador carregado entrega o ouro no Centro novo e o saldo sobe', () => {
    const gm = makeGm();
    rich(gm);
    const first = hqsOf(gm)[0];
    const s = spotFor(gm, first.mesh.position);
    const b = buildHq(gm, s);
    const w = gm.getUnitsOf(0).find((u) => u.type === 'villager');
    w.mesh.position.x = s.x + b.collisionRadius + 1;
    w.mesh.position.z = s.z;
    w.carrying.type = 'gold';
    w.carrying.amount = 10;
    w.state = 'returning';
    const g0 = gm.getPlayer(0).resources.gold;
    expect(gm.findNearestDropoff(w.mesh.position, 'gold', gm.buildings, 0)).toBe(b);
    seconds(gm, 8);
    expect(gm.getPlayer(0).resources.gold).toBeGreaterThan(g0);
  });

  it('treina trabalhadores (fila e nascimento no Centro novo) e evolui para o nível 2 normalmente', () => {
    const gm = makeGm();
    rich(gm);
    const first = hqsOf(gm)[0];
    const b = buildHq(gm, spotFor(gm, first.mesh.position));
    const n0 = gm.getUnitsOf(0).length;
    issue(gm, { type: CMD.TRAIN, playerId: 0, buildingId: b.id, unitType: 'villager' });
    expect(b.queue.length).toBe(1);
    seconds(gm, 40);
    expect(gm.getUnitsOf(0).length).toBe(n0 + 1);
    const g0 = gm.getPlayer(0).resources.gold;
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: b.id });
    expect(g0 - gm.getPlayer(0).resources.gold).toBe(667);
    seconds(gm, 61);
    expect(b.tier).toBe(2);
    expect(b.maxHp).toBe(HQ_TIER_HP[2]);
    expect(first.tier).toBe(1);
    expect(missingRequirements(0, 'stable', gm)).not.toContainEqual({ hq: 2 });
  });

  it('o Salão do Clã orc também: constrói, treina peão', () => {
    const gm = makeGm({ faction: 'orc' });
    expect(hqType(gm)).toBe('great_hall');
    rich(gm);
    const first = hqsOf(gm)[0];
    const b = buildHq(gm, spotFor(gm, first.mesh.position));
    expect(b.type).toBe('great_hall');
    expect(b.queueUnit('peon', gm)).toBe(true);
  });

  it('derrota (Regicídio) só quando TODOS os Centros caem; perder o inicial não derrota', () => {
    const gm = makeGm({ victoryMode: 'regicide' });
    rich(gm);
    const first = hqsOf(gm)[0];
    const s2 = spotFor(gm, first.mesh.position);
    const b2 = buildHq(gm, s2);
    const b3 = buildHq(gm, spotFor(gm, first.mesh.position, 0, [s2]));
    kill(first);
    seconds(gm, 1);
    expect(gm.getPlayer(0).defeated).toBeFalsy();
    kill(b2);
    seconds(gm, 1);
    expect(gm.getPlayer(0).defeated).toBeFalsy();
    kill(b3);
    seconds(gm, 1);
    expect(gm.getPlayer(0).defeated).toBe(true);
  }, 60000);
});
