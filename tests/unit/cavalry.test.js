import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { getUnitDef, getBuildingDef, UNITS, FACTIONS } from '../../src/data/index.js';
import { RESEARCH } from '../../src/data/upgrades.js';

/**
 * cavalry.test.js — F4-01: Estábulo Real / Covil dos Ogros, cavaleiro, ogro como cavalaria,
 * pesquisas de corpo a corpo e nomes D7. Jogador 0 = humano, jogador 1 = orc (partida padrão 1×1).
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

function hqOf(gm, id) {
  return gm.buildings.find(b => b.ownerId === id && isHq(b));
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

describe('nomes D7 (F4-01)', () => {
  it('ids internos intactos, campo name/entityName trocado', () => {
    expect(getUnitDef('knight').name).toBe('Espadachim');
    expect(getUnitDef('knight').entityName).toBe('Espadachim');
    expect(getUnitDef('grunt').name).toBe('Talhador');
    expect(getUnitDef('axethrower').name).toBe('Lanceiro-Machado');
    expect(getUnitDef('villager').name).toBe('Camponês');
    expect(getUnitDef('peon').name).toBe('Lacaio');
    expect(getUnitDef('ogre').name).toBe('Ogro');
    expect(getUnitDef('archer').name).toBe('Arqueiro');
    expect(getUnitDef('cavalier').name).toBe('Cavaleiro');
  });
});

describe('dados da cavalaria (F4-01)', () => {
  it('cavalier: stats da spec e mais rápido que o Espadachim; ogro mais rápido que antes', () => {
    const c = UNITS.cavalier;
    expect(c.hp).toBe(300);
    expect(c.cost).toEqual({ gold: 120, wood: 60, stone: 20 });
    expect(c.trainTime).toBe(14);
    expect(c.requires).toEqual([{ hq: 2 }]);
    expect(c.speed).toBeGreaterThan(UNITS.knight.speed);
    expect(UNITS.ogre.speed).toBe(5.4);
    expect(UNITS.ogre.requires).toEqual([{ hq: 2 }]);
  });

  it('construções de cavalaria: papel stable, requisitos e listas de treino', () => {
    for (const [type, barracks, unit] of [['stable', 'barracks', 'cavalier'], ['ogre_den', 'orc_barracks', 'ogre']]) {
      const d = getBuildingDef(type);
      expect(d.role).toBe('stable');
      expect(d.requires).toEqual([barracks, { hq: 2 }]);
      expect(d.trains).toEqual([unit]);
    }
    expect(getBuildingDef('orc_barracks').trains).toEqual(['grunt', 'axethrower']);
    expect(getBuildingDef('barracks').trains).not.toContain('cavalier');
    expect(FACTIONS.human.units.cavalry).toBe('cavalier');
    expect(FACTIONS.orc.units.cavalry).toBe('ogre');
    expect(FACTIONS.human.buildList).toContain('stable');
    expect(FACTIONS.orc.buildList).toContain('ogre_den');
  });

  it('melee_weapons/melee_armor valem para cavalier e ogre', () => {
    expect(RESEARCH.melee_weapons.appliesTo).toEqual(expect.arrayContaining(['cavalier', 'ogre']));
    expect(RESEARCH.melee_armor.appliesTo).toEqual(expect.arrayContaining(['cavalier', 'ogre']));
  });
});

describe('Estábulo / Covil: construção e treino (F4-01)', () => {
  it('Estábulo só é construível com Quartel + Centro nível 2', () => {
    const gm = makeGm();
    rich(gm);
    const hq = hqOf(gm, 0);
    const x = hq.mesh.position.x + 14;
    const z = hq.mesh.position.z + 14;

    // sem Quartel e sem nível 2
    expect(gm.placeBuilding('stable', x, z, [], 0)).toBeNull();
    // só nível 2 (sem Quartel)
    hq.tier = 2;
    expect(gm.placeBuilding('stable', x, z, [], 0)).toBeNull();
    // Quartel, mas Centro nível 1
    hq.tier = 1;
    build(gm, 'barracks');
    expect(gm.placeBuilding('stable', x, z, [], 0)).toBeNull();
    // ambos
    hq.tier = 2;
    const stable = gm.placeBuilding('stable', x, z, [], 0);
    expect(stable).not.toBeNull();
    expect(stable.type).toBe('stable');
  });

  it('cavalier só treina no Estábulo concluído e com Centro nível 2', () => {
    const gm = makeGm();
    const p = rich(gm);
    const hq = hqOf(gm, 0);
    const barracks = build(gm, 'barracks');
    const stable = build(gm, 'stable', 0, 1);

    train(gm, barracks, 'cavalier'); // Quartel não treina cavalaria
    expect(barracks.queue.length).toBe(0);

    hq.tier = 1;
    const gold = p.resources.gold;
    train(gm, stable, 'cavalier'); // Centro nível 1
    expect(stable.queue.length).toBe(0);
    expect(p.resources.gold).toBe(gold);

    hq.tier = 2;
    stable.isConstructed = false;
    train(gm, stable, 'cavalier'); // em obra
    expect(stable.queue.length).toBe(0);

    stable.isConstructed = true;
    train(gm, stable, 'cavalier');
    expect(stable.queue.length).toBe(1);
    expect(p.resources.gold).toBe(gold - 120);

    run(gm, 15);
    const cav = gm.getUnitsOf(0).filter(u => u.type === 'cavalier' && !u.isDead);
    expect(cav.length).toBe(1);
  });

  it('Quartel orc não treina mais ogre; o Covil treina (Centro nível 2)', () => {
    const gm = makeGm();
    rich(gm, 1);
    const hq = hqOf(gm, 1);
    hq.tier = 2;
    const barracks = build(gm, 'orc_barracks', 1);
    const den = build(gm, 'ogre_den', 1, 1);

    train(gm, barracks, 'ogre', 1);
    expect(barracks.queue.length).toBe(0);
    train(gm, barracks, 'grunt', 1);
    expect(barracks.queue.length).toBe(1);

    train(gm, den, 'ogre', 1);
    expect(den.queue.length).toBe(1);
    train(gm, den, 'grunt', 1); // Covil só treina ogro
    expect(den.queue.length).toBe(1);
  });
});

describe('pesquisas de corpo a corpo em cavalaria (F4-01)', () => {
  it('melee_weapons nível 1 dá +2 de dano básico no cavalier vivo e no treinado depois', () => {
    const gm = makeGm();
    rich(gm);
    hqOf(gm, 0).tier = 2;
    const forge = build(gm, 'forge');
    const stable = build(gm, 'stable', 0, 1);
    build(gm, 'barracks', 0, 2);

    const before = gm.spawnUnit('cavalier', 0, 0, 0);
    const base = before.attack.basic ?? before.damage.basic;
    gm.issue({ type: CMD.RESEARCH, playerId: 0, buildingId: forge.id, upgradeId: 'melee_weapons' });
    gm.simStep(SIM_DT);
    run(gm, 31);
    expect(gm.getPlayer(0).getResearchLevel('melee_weapons')).toBe(1);
    expect((before.attack.basic ?? before.damage.basic)).toBe(base + 2);

    train(gm, stable, 'cavalier');
    run(gm, 15);
    const later = gm.getUnitsOf(0).filter(u => u.type === 'cavalier' && u !== before && !u.isDead);
    expect(later.length).toBe(1);
    expect((later[0].attack.basic ?? later[0].damage.basic)).toBe(base + 2);
  });
});

describe('IA e cavalaria (F4-01)', () => {
  it('IA orc com Centro nível 2 forçado constrói o Covil e treina ≥ 1 ogro', () => {
    const gm = makeGm(11);
    const ai = gm.getPlayer(1);
    // Centro nível 2 forçado desde o início e economia folgada (a IA ainda evolui o Centro sozinha
    // em partidas longas; aqui queremos isolar a decisão do Covil).
    hqOf(gm, 1).tier = 2;
    ai.resources.gold = 6000; ai.resources.wood = 6000; ai.resources.stone = 3000;
    ai.maxPopulation = 120;
    let denBuilt = false;
    for (let t = 0; t < 12 * 60 && !denBuilt; t += 1) {
      run(gm, 1);
      // mantém folga de ouro (o teste não mede a economia)
      if (ai.resources.gold < 1500) ai.resources.gold = 3000;
      if (ai.resources.wood < 1500) ai.resources.wood = 3000;
      if (ai.resources.stone < 800) ai.resources.stone = 1500;
      denBuilt = gm.buildings.some(b => b.ownerId === 1 && b.type === 'ogre_den' && b.isConstructed && !b.isDead);
    }
    expect(denBuilt).toBe(true);
    run(gm, 3 * 60);
    const ogres = gm.getUnitsOf(1).filter(u => u.type === 'ogre');
    expect(ogres.length).toBeGreaterThanOrEqual(1);
  }, 120000);
});
