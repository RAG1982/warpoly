import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { RESEARCH, promotedType } from '../../src/data/upgrades.js';
import { gatherMultiplier } from '../../src/data/index.js';

/**
 * research.test.js — F3-07: pesquisas em níveis (Forja/Serraria), aplicação de bônus e
 * classe avançada do atirador. Jogador 0 = humano, jogador 1 = orc (partida padrão 1×1).
 */
function makeGm(seed = 5) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  return new GameManager(scene, terrain, null, null, cfg);
}

const isHq = b => b.type === 'castle' || b.type === 'great_hall';

function rich(gm, id = 0) {
  const p = gm.getPlayer(id);
  p.resources.gold = 20000; p.resources.wood = 20000; p.resources.stone = 20000;
  p.maxPopulation = 200;
  return p;
}

function build(gm, type, ownerId = 0, dx = 0) {
  const hq = gm.buildings.find(b => b.ownerId === ownerId && isHq(b));
  const b = gm.createBuilding(type, hq.mesh.position.x + 12 + dx * 8, hq.mesh.position.z + 12, true, ownerId);
  b.isConstructed = true;
  gm.buildings.push(b);
  return b;
}

function run(gm, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) gm.simStep(SIM_DT);
}

function research(gm, b, id, playerId = 0) {
  gm.issue({ type: CMD.RESEARCH, playerId, buildingId: b.id, upgradeId: id });
  gm.simStep(SIM_DT);
}

function tier2(gm, id = 0) {
  gm.buildings.find(b => b.ownerId === id && isHq(b)).tier = 2;
}

describe('Building.startResearch (níveis, construção, requisitos)', () => {
  it('nível 1 e 2 na Forja; nível 2 exige Centro nível 2', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    research(gm, forge, 'melee_weapons');
    expect(forge.currentResearch.level).toBe(1);
    expect(p.resources.gold).toBe(20000 - 200);
    run(gm, 31);
    expect(p.getResearchLevel('melee_weapons')).toBe(1);
    expect(forge.currentResearch).toBeNull();

    research(gm, forge, 'melee_weapons'); // sem {hq:2}
    expect(forge.currentResearch).toBeNull();
    tier2(gm);
    research(gm, forge, 'melee_weapons');
    expect(forge.currentResearch.level).toBe(2);
    run(gm, 46);
    expect(p.getResearchLevel('melee_weapons')).toBe(2);
    // máximo
    research(gm, forge, 'melee_weapons');
    expect(forge.currentResearch).toBeNull();
    expect(gm.isUpgradeResearched('melee_weapons', 0)).toBe(true);
  });

  it('recusa na construção errada e de outra facção', () => {
    const gm = makeGm();
    rich(gm);
    const forge = build(gm, 'forge');
    const lumber = build(gm, 'lumber_camp', 0, 1);
    research(gm, forge, 'ranged_ammo');
    expect(forge.currentResearch).toBeNull();
    research(gm, lumber, 'melee_weapons');
    expect(lumber.currentResearch).toBeNull();
    research(gm, lumber, 'berserker_range');
    expect(lumber.currentResearch).toBeNull();
  });

  it('recusa duplicada por outra construção e reembolsa ao cancelar', () => {
    const gm = makeGm();
    const p = rich(gm);
    const l1 = build(gm, 'lumber_camp', 0, 1);
    const l2 = build(gm, 'lumber_camp', 0, 2);
    research(gm, l1, 'ranged_ammo');
    expect(l1.currentResearch).not.toBeNull();
    research(gm, l2, 'ranged_ammo');
    expect(l2.currentResearch).toBeNull();
    expect(p.resources.gold).toBe(20000 - 200);
    gm.issue({ type: CMD.CANCEL_RESEARCH, playerId: 0, buildingId: l1.id });
    gm.simStep(SIM_DT);
    expect(p.resources.gold).toBe(20000);
    expect(p.resources.wood).toBe(20000);
  });

  it('classe avançada exige ranged_class', () => {
    const gm = makeGm();
    rich(gm);
    tier2(gm);
    const lumber = build(gm, 'lumber_camp', 0, 1);
    research(gm, lumber, 'ranger_longbow');
    expect(lumber.currentResearch).toBeNull();
  });
});

describe('aplicação de bônus', () => {
  it('melee_weapons 2 níveis: +4 básico em unidade viva e em unidade treinada depois', () => {
    const gm = makeGm();
    rich(gm);
    tier2(gm);
    const forge = build(gm, 'forge');
    const live = gm.spawnUnit('knight', 10, 10, 0);
    const base = live.damage.basic;
    research(gm, forge, 'melee_weapons'); run(gm, 31);
    expect(live.damage.basic).toBe(base + 2);
    research(gm, forge, 'melee_weapons'); run(gm, 46);
    expect(live.damage.basic).toBe(base + 4);
    const fresh = gm.spawnUnit('knight', 14, 14, 0);
    expect(fresh.damage.basic).toBe(base + 4);
  });

  it('ranged_ammo: piercing +1/+2', () => {
    const gm = makeGm();
    rich(gm);
    tier2(gm);
    const lumber = build(gm, 'lumber_camp', 0, 1);
    const a = gm.spawnUnit('archer', 10, 10, 0);
    const base = a.damage.piercing;
    research(gm, lumber, 'ranged_ammo'); run(gm, 31);
    expect(a.damage.piercing).toBe(base + 1);
    research(gm, lumber, 'ranged_ammo'); run(gm, 46);
    expect(a.damage.piercing).toBe(base + 2);
  });

  it('woodcutting: multiplicador 1,25 na madeira entregue', () => {
    const gm = makeGm();
    rich(gm);
    const lumber = build(gm, 'lumber_camp', 0, 1);
    expect(gatherMultiplier(0, 'wood', gm)).toBe(1);
    research(gm, lumber, 'woodcutting'); run(gm, 41);
    expect(gatherMultiplier(0, 'wood', gm)).toBe(1.25);
    const w = gm.spawnUnit('villager', 10, 10, 0);
    const before = gm.getPlayer(0).resources.wood;
    w.carrying.type = 'wood'; w.carrying.amount = 12;
    w.depositResources(gm);
    expect(gm.getPlayer(0).resources.wood).toBe(before + 15);
  });
});

describe('promoção (ranged_class) e classe avançada', () => {
  it('3 arqueiros viram ranger mantendo % de PV e bônus; Quartel treina ranger', () => {
    const gm = makeGm();
    const p = rich(gm);
    tier2(gm);
    const lumber = build(gm, 'lumber_camp', 0, 1);
    const barracks = build(gm, 'barracks', 0, 2);
    const archers = [0, 1, 2].map(i => gm.spawnUnit('archer', 10 + i * 2, 10, 0));
    research(gm, lumber, 'ranged_ammo'); run(gm, 31);
    archers[0].hp = archers[0].maxHp / 2;
    const pierce = archers[0].damage.piercing; // 12 + 1
    research(gm, lumber, 'ranged_class'); run(gm, 61);
    expect(p.getResearchLevel('ranged_class')).toBe(1);
    for (const a of archers) {
      expect(a.type).toBe('ranger');
      expect(a.name).toBe('Patrulheiro');
    }
    expect(archers[0].maxHp).toBe(106);
    expect(archers[0].hp / archers[0].maxHp).toBeCloseTo(0.5, 5);
    expect(archers[0].damage.piercing).toBe(pierce + 1); // +1 da classe, mantém +1 da pesquisa

    expect(barracks.queueUnit('archer', gm)).toBe(true);
    expect(barracks.queue[0].type).toBe('ranger');
    // orcs não são afetados
    expect(gm.resolveTrainType('axethrower', 1)).toBe('axethrower');
  });

  it('ranger não treina sem a pesquisa; ranger_longbow depois da classe', () => {
    const gm = makeGm();
    rich(gm);
    tier2(gm);
    const barracks = build(gm, 'barracks', 0, 2);
    expect(barracks.queueUnit('ranger', gm)).toBe(false);
    const lumber = build(gm, 'lumber_camp', 0, 1);
    research(gm, lumber, 'ranged_class'); run(gm, 61);
    const r = gm.spawnUnit('ranger', 10, 10, 0);
    const range = r.attackRange;
    research(gm, lumber, 'ranger_longbow'); run(gm, 41);
    expect(r.attackRange).toBe(range + 2);
  });

  it('berserker_regen: PV sobe 1/s até o máximo', () => {
    const gm = makeGm();
    gm.aiDirectors.length = 0; // a IA (jogador 1) também pesquisaria
    rich(gm, 1);
    tier2(gm, 1);
    const lumber = build(gm, 'orc_lumber_mill', 1, 1);
    const b = gm.spawnUnit('berserker', 10, 10, 1);
    research(gm, lumber, 'ranged_class', 1); run(gm, 61);
    research(gm, lumber, 'berserker_regen', 1); run(gm, 51);
    expect(b.regen).toBe(1);
    b.hp = b.maxHp - 3;
    run(gm, 2);
    expect(b.hp).toBeCloseTo(b.maxHp - 1, 1);
    run(gm, 5);
    expect(b.hp).toBe(b.maxHp);
  });

  it('promotedType puro', () => {
    const lv = new Map([['ranged_class', 1]]);
    expect(promotedType('archer', lv)).toBe('ranger');
    expect(promotedType('knight', lv)).toBe('knight');
    expect(promotedType('archer', new Map())).toBe('archer');
    expect(RESEARCH.ranged_class.levels[0].effect.promote.axethrower).toBe('berserker');
  });
});
