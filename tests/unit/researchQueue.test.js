import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { BUILDING_QUEUE_MAX } from '../../src/sim/Building.js';
import { EVT } from '../../src/sim/events.js';

/**
 * researchQueue.test.js — RES-QUEUE: pesquisas enfileiráveis nos slots (como o treino).
 * Regras: custo debitado ao enfileirar; cancelar devolve 100 %; a cabeça anda; requisitos valem
 * ao enfileirar e são rechecados ao assumir a cabeça; sem duplicatas nem já concluídas.
 * Jogador 0 = humano (partida 1×1 headless, mesmos helpers de research.test.js).
 */
function makeGm(seed = 5) {
  const terrain = new Terrain();
  const cfg = createMatchConfig({ seed, headless: true });
  return new GameManager(terrain, null, null, cfg);
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

function enqueue(gm, b, id, playerId = 0) {
  gm.issue({ type: CMD.RESEARCH, playerId, buildingId: b.id, upgradeId: id });
  gm.simStep(SIM_DT);
}

function cancel(gm, b, slot, playerId = 0) {
  const cmd = { type: CMD.CANCEL_RESEARCH, playerId, buildingId: b.id };
  if (slot !== undefined) cmd.slot = slot;
  gm.issue(cmd);
  gm.simStep(SIM_DT);
}

const ids = b => b.researchQueue.map(r => r.id);

function tier(gm, value, id = 0) {
  gm.buildings.find(b => b.ownerId === id && isHq(b)).tier = value;
}

describe('RES-QUEUE: enfileirar, andar e cancelar', () => {
  it('enfileira 3 pesquisas, debita cada custo ao enfileirar e anda em sequência com os tempos', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    build(gm, 'workshop', 0, 1); // siege_damage exige Oficina
    const g0 = p.resources.gold, w0 = p.resources.wood, s0 = p.resources.stone;

    enqueue(gm, forge, 'melee_weapons'); // 200 ouro / 100 madeira / 30 s
    enqueue(gm, forge, 'melee_armor');   // 150 / 100 / 80 pedra / 30 s
    enqueue(gm, forge, 'siege_damage'); // 300 / 300 / 40 s
    expect(ids(forge)).toEqual(['melee_weapons', 'melee_armor', 'siege_damage']);
    expect(p.resources.gold).toBe(g0 - 650);
    expect(p.resources.wood).toBe(w0 - 500);
    expect(p.resources.stone).toBe(s0 - 80);
    expect(forge.currentResearch.id).toBe('melee_weapons');
    expect(forge.currentResearch.progress).toBeLessThan(1);

    run(gm, 31); // melee_weapons conclui (30 s); armadura assume
    expect(p.getResearchLevel('melee_weapons')).toBe(1);
    expect(ids(forge)).toEqual(['melee_armor', 'siege_damage']);
    expect(forge.currentResearch.id).toBe('melee_armor');

    run(gm, 30); // armadura conclui; siege assume
    expect(p.getResearchLevel('melee_armor')).toBe(1);
    expect(ids(forge)).toEqual(['siege_damage']);

    run(gm, 41); // siege conclui (40 s)
    expect(p.getResearchLevel('siege_damage')).toBe(1);
    expect(forge.researchQueue).toHaveLength(0);
    expect(forge.currentResearch).toBeNull();
  });

  it('cancelar cada posição devolve 100 % e a fila anda (em andamento inclusive)', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    build(gm, 'workshop', 0, 1);
    const g0 = p.resources.gold, w0 = p.resources.wood, s0 = p.resources.stone;
    enqueue(gm, forge, 'melee_weapons');
    enqueue(gm, forge, 'melee_armor');
    enqueue(gm, forge, 'siege_damage');

    cancel(gm, forge, 2); // última da fila
    expect(ids(forge)).toEqual(['melee_weapons', 'melee_armor']);
    expect(p.resources.gold).toBe(g0 - 350);
    expect(p.resources.wood).toBe(w0 - 200);

    cancel(gm, forge, 1); // do meio
    expect(ids(forge)).toEqual(['melee_weapons']);
    expect(p.resources.gold).toBe(g0 - 200);
    expect(p.resources.stone).toBe(s0);

    run(gm, 10);
    cancel(gm, forge, 0); // em andamento, com 10 s de progresso: reembolso integral
    expect(forge.researchQueue).toHaveLength(0);
    expect(p.resources.gold).toBe(g0);
    expect(p.resources.wood).toBe(w0);
    expect(p.resources.stone).toBe(s0);
  });

  it('cancelar a em andamento inicia a próxima do zero', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    enqueue(gm, forge, 'melee_weapons');
    enqueue(gm, forge, 'melee_armor');
    run(gm, 20);
    cancel(gm, forge, 0);
    expect(forge.currentResearch.id).toBe('melee_armor');
    expect(forge.currentResearch.progress).toBeLessThan(1.5);
    run(gm, 31);
    expect(p.getResearchLevel('melee_armor')).toBe(1);
    expect(p.getResearchLevel('melee_weapons')).toBe(0);
  });

  it('comando sem `slot` cancela a em andamento (compatibilidade) e slot inválido não faz nada', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    enqueue(gm, forge, 'melee_weapons');
    enqueue(gm, forge, 'melee_armor');
    const g = p.resources.gold;
    cancel(gm, forge, 7);
    expect(ids(forge)).toEqual(['melee_weapons', 'melee_armor']);
    expect(p.resources.gold).toBe(g);
    cancel(gm, forge); // sem slot
    expect(ids(forge)).toEqual(['melee_armor']);
  });
});

describe('RES-QUEUE: duplicatas, concluídas, requisitos e recursos', () => {
  it('recusa a mesma pesquisa duas vezes (na fila ou em outra construção) sem debitar', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    const forge2 = build(gm, 'forge', 0, 2);
    enqueue(gm, forge, 'melee_weapons');
    const g = p.resources.gold;
    enqueue(gm, forge, 'melee_weapons');
    expect(ids(forge)).toEqual(['melee_weapons']);
    enqueue(gm, forge2, 'melee_weapons');
    expect(forge2.researchQueue).toHaveLength(0);
    expect(p.resources.gold).toBe(g);
  });

  it('não enfileira uma pesquisa já concluída (nível máximo)', () => {
    const gm = makeGm();
    const p = rich(gm);
    const lumber = build(gm, 'lumber_camp');
    enqueue(gm, lumber, 'woodcutting'); // 1 nível
    run(gm, 41);
    expect(p.getResearchLevel('woodcutting')).toBe(1);
    const w = p.resources.wood;
    enqueue(gm, lumber, 'woodcutting');
    expect(lumber.researchQueue).toHaveLength(0);
    expect(p.resources.wood).toBe(w);
  });

  it('nível 2 exige Centro nível 2 ao enfileirar (recusa sem debitar)', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    enqueue(gm, forge, 'melee_weapons');
    run(gm, 31); // nível 1 concluído
    const g = p.resources.gold;
    enqueue(gm, forge, 'melee_weapons'); // Centro nível 1: recusado
    expect(forge.researchQueue).toHaveLength(0);
    expect(p.resources.gold).toBe(g);
    tier(gm, 2);
    enqueue(gm, forge, 'melee_weapons');
    expect(forge.currentResearch.level).toBe(2);
  });

  it('requisito deixa de valer antes de a pesquisa assumir: devolve o custo, descarta e avisa', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    tier(gm, 2);
    const notes = [];
    gm.events.on(EVT.NOTIFY, e => notes.push(e));
    enqueue(gm, forge, 'melee_weapons');   // 30 s, nível 1
    enqueue(gm, forge, 'melee_armor');     // 30 s
    run(gm, 31);                            // melee_weapons nível 1 concluído; armadura assume
    expect(forge.currentResearch.id).toBe('melee_armor');
    enqueue(gm, forge, 'melee_weapons');   // nível 2 exige Centro 2 (ok agora)
    expect(ids(forge)).toEqual(['melee_armor', 'melee_weapons']);
    const g = p.resources.gold, w = p.resources.wood;
    tier(gm, 1); // o Centro cai de nível: a nível 2 deixa de valer
    run(gm, 31); // armadura conclui; a nível 2 tenta assumir e é removida
    expect(p.getResearchLevel('melee_armor')).toBe(1);
    expect(forge.researchQueue).toHaveLength(0);
    expect(p.resources.gold).toBe(g + 400); // custo de melee_weapons nível 2 devolvido
    expect(p.resources.wood).toBe(w + 200);
    expect(notes.some(n => /requisito/.test(n.text) && n.ownerId === 0)).toBe(true);
  });

  it('recursos insuficientes: recusa a 2ª sem debitar', () => {
    const gm = makeGm();
    const p = rich(gm);
    const forge = build(gm, 'forge');
    p.resources.gold = 250; // cabe melee_weapons (200), não cabe mais nada de 150+
    enqueue(gm, forge, 'melee_weapons');
    expect(ids(forge)).toEqual(['melee_weapons']);
    enqueue(gm, forge, 'melee_armor'); // 150 de ouro: sobram 50
    expect(ids(forge)).toEqual(['melee_weapons']);
    expect(p.resources.gold).toBe(50);
  });

  it('limite de fila: BUILDING_QUEUE_MAX slots (como o treino)', () => {
    const gm = makeGm();
    rich(gm);
    const arcane = build(gm, 'arcane_tower');
    const spells = ['spell_fireball', 'spell_slow', 'spell_flameshield', 'spell_invisibility', 'spell_polymorph', 'spell_blizzard'];
    expect(BUILDING_QUEUE_MAX).toBe(6);
    for (const s of spells) enqueue(gm, arcane, s);
    expect(arcane.researchQueue).toHaveLength(6);
    // Cheia: com 6 entradas (fictícias, para isolar o teto), a recusa vem antes de qualquer outra checagem.
    arcane.researchQueue.length = 0;
    for (let i = 0; i < BUILDING_QUEUE_MAX; i++) arcane.researchQueue.push({ id: `dummy${i}`, level: 1, progress: 0, totalTime: 1, cost: {} });
    const g = gm.getPlayer(0).resources.gold;
    enqueue(gm, arcane, 'spell_slow');
    expect(arcane.researchQueue).toHaveLength(BUILDING_QUEUE_MAX);
    expect(gm.getPlayer(0).resources.gold).toBe(g);
  });

  it('pesquisa de outra construção (papel errado) continua recusada', () => {
    const gm = makeGm();
    rich(gm);
    const lumber = build(gm, 'lumber_camp');
    enqueue(gm, lumber, 'melee_weapons');
    expect(lumber.researchQueue).toHaveLength(0);
  });
});
