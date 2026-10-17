import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { HQ_TIER_HP } from '../../src/data/tiers.js';
import { missingRequirements, missingUnitRequirements } from '../../src/sim/requirements.js';
import { gatherMultiplier } from '../../src/data/economy.js';
import { isPlayerDefeated } from '../../src/sim/victory.js';
import { getBuildingDef } from '../../src/data/index.js';
import { baseMission, makeMissionGm, runTicks, statusOf } from './helpers/missionWorld.js';

/**
 * M2-02 — jogador com DOIS Centros: o inicial + um "Marco da Colônia" criado por `spawnBuilding` (missões 10–12 da campanha;
 * risco R3 de MUNDO-HISTORIA-CAMPANHA.md §8). Tudo que podia assumir "o" Centro do dono é conferido aqui. Com 1 Centro nada
 * muda (o checksum de `node tools/headless-match.js --seed 1` fica igual).
 */
const isHq = (b) => getBuildingDef(b.type).role === 'hq';
const hqsOf = (gm, id = 0) => gm.buildings.filter((b) => b.ownerId === id && isHq(b) && !b.isDead);
const rich = (gm, id = 0) => { Object.assign(gm.getPlayer(id).resources, { gold: 9000, wood: 9000, stone: 9000, oil: 9000 }); };
const issue = (gm, cmd) => { gm.issue(cmd); gm.simStep(SIM_DT); };
const seconds = (gm, s) => runTicks(gm, Math.round(s / SIM_DT));
const kill = (b) => b.takeDamage(1e9, { ownerId: 77 });
const workerOf = (b) => (b.type === 'great_hall' ? 'peon' : 'villager');

/** Primeiro ponto onde o dono poderia construir o Centro `type`, em anéis ao redor de (cx, cz). */
function freeSpotFor(gm, type, cx, cz, owner) {
  for (let r = 16; r <= 60; r += 4) {
    for (let a = 0; a < 16; a++) {
      const x = cx + Math.cos((a / 16) * Math.PI * 2) * r;
      const z = cz + Math.sin((a / 16) * Math.PI * 2) * r;
      if (gm.canPlaceBuilding(type, x, z, null, owner)) return { x, z };
    }
  }
  throw new Error('sem ponto livre para o 2º Centro');
}

/** Partida headless em que `owner` ganha um 2º Centro concluído, registrado como a ação `spawnBuilding` o faz. */
function makeTwoHqGm({ victoryMode = 'conquest', owner = 0, seed = 5, aiAll = false } = {}) {
  const cfg = createMatchConfig({ seed, headless: true, victoryMode });
  if (aiAll) cfg.players.forEach((p) => { p.isAI = true; });
  const gm = new GameManager(new Terrain(), null, null, cfg);
  const first = hqsOf(gm, owner)[0];
  const spot = freeSpotFor(gm, first.type, first.mesh.position.x, first.mesh.position.z, owner);
  const colony = gm.createBuilding(first.type, spot.x, spot.z, true, owner);
  gm.buildings.push(colony);
  gm.recalculatePopCap();
  return { gm, first, colony };
}

describe('2 Centros: o segundo Centro e a população', () => {
  it('nasce concluído, nível 1, com PV e id próprios; o teto de população soma os dois', () => {
    const solo = new GameManager(new Terrain(), null, null, createMatchConfig({ seed: 5, headless: true }));
    const { gm, first, colony } = makeTwoHqGm();
    expect(hqsOf(gm)).toHaveLength(2);
    expect(colony.id).not.toBe(first.id);
    expect(colony.isConstructed).toBe(true);
    expect(colony.tier).toBe(1);
    expect(colony.hp).toBe(colony.maxHp);
    expect(gm.getPlayer(0).maxPopulation).toBe(solo.getPlayer(0).maxPopulation + colony.popGranted);
  });

  it('perder um Centro tira só o teto dele; perder os dois zera o que os Centros davam', () => {
    const { gm, first, colony } = makeTwoHqGm();
    const cap = gm.getPlayer(0).maxPopulation;
    kill(colony);
    gm.recalculatePopCap();
    expect(gm.getPlayer(0).maxPopulation).toBe(cap - colony.popGranted);
    kill(first);
    gm.recalculatePopCap();
    expect(gm.getPlayer(0).maxPopulation).toBe(cap - colony.popGranted - first.popGranted);
  });
});

describe('2 Centros: requisitos {hq:N} usam o maior nível dos Centros vivos', () => {
  it('o Centro de nível 2 libera o Estábulo mesmo com o outro no nível 1; morto o de nível 2, volta a faltar', () => {
    const { gm, first, colony } = makeTwoHqGm();
    expect(missingRequirements(0, 'stable', gm)).toContainEqual({ hq: 2 });
    colony.tier = 2; // `setTier` ou `UPGRADE_HQ` concluído no SEGUNDO Centro
    expect(missingRequirements(0, 'stable', gm)).not.toContainEqual({ hq: 2 });
    expect(missingRequirements(0, 'stable', gm)).toContain('barracks'); // só o requisito de nível mudou
    expect(first.tier).toBe(1);
    kill(colony);
    expect(missingRequirements(0, 'stable', gm)).toContainEqual({ hq: 2 });
    first.tier = 3; // o nível 3 também cobre {hq:2} e {hq:3}
    expect(missingRequirements(0, 'stable', gm).some((r) => r && r.hq)).toBe(false);
    expect(missingRequirements(0, 'aviary', gm).some((r) => r && r.hq)).toBe(false);
  });

  it('o mesmo vale para treinar unidades de nível 2 (cavaleiro: cavalier)', () => {
    const { gm, first, colony } = makeTwoHqGm();
    expect(missingUnitRequirements(0, 'cavalier', gm)).toContainEqual({ hq: 2 });
    colony.tier = 2;
    expect(missingUnitRequirements(0, 'cavalier', gm).some((r) => r && r.hq)).toBe(false);
    kill(colony);
    expect(missingUnitRequirements(0, 'cavalier', gm)).toContainEqual({ hq: 2 });
    expect(first.tier).toBe(1);
  });

  it('o multiplicador de ouro usa o maior nível (não soma, não faz média)', () => {
    const { gm, first, colony } = makeTwoHqGm();
    const m1 = gatherMultiplier(0, 'gold', gm);
    colony.tier = 3;
    const m3 = gatherMultiplier(0, 'gold', gm);
    expect(m3).toBeGreaterThan(m1);
    first.tier = 2;
    expect(gatherMultiplier(0, 'gold', gm)).toBe(m3);
  });
});

describe('2 Centros: UPGRADE_HQ e CANCEL_UPGRADE_HQ em qualquer um', () => {
  it('evoluir o SEGUNDO Centro: debita uma vez, só ele sobe de nível/PV, evento com o id dele', () => {
    const { gm, first, colony } = makeTwoHqGm();
    rich(gm);
    const events = [];
    gm.events.on(EVT.HQ_TIER_CHANGED, (e) => events.push(e));
    const before = { ...gm.getPlayer(0).resources };
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: colony.id });
    expect(colony.tierUpgrade).not.toBeNull();
    expect(first.tierUpgrade).toBeNull();
    expect(gm.getPlayer(0).resources.gold).toBe(before.gold - 1000);
    seconds(gm, 61);
    expect(colony.tier).toBe(2);
    expect(colony.maxHp).toBe(HQ_TIER_HP[2]);
    expect(first.tier).toBe(1);
    expect(first.maxHp).toBe(HQ_TIER_HP[1]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ buildingId: colony.id, ownerId: 0, tier: 2 });
    expect(missingRequirements(0, 'stable', gm)).not.toContainEqual({ hq: 2 });
  });

  it('os dois Centros evoluem ao mesmo tempo, cada um com seu progresso e seu custo', () => {
    const { gm, first, colony } = makeTwoHqGm();
    rich(gm);
    const g0 = gm.getPlayer(0).resources.gold;
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: first.id });
    seconds(gm, 20);
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: colony.id });
    expect(gm.getPlayer(0).resources.gold).toBe(g0 - 2000);
    seconds(gm, 41); // o primeiro (60 s) conclui; o segundo (começou 20 s depois) ainda não
    expect(first.tier).toBe(2);
    expect(colony.tier).toBe(1);
    expect(colony.tierUpgrade).not.toBeNull();
    seconds(gm, 20);
    expect(colony.tier).toBe(2);
  });

  it('cancelar no segundo Centro devolve 100 % e não mexe no primeiro (que continua evoluindo)', () => {
    const { gm, first, colony } = makeTwoHqGm();
    rich(gm);
    const g0 = gm.getPlayer(0).resources.gold;
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: first.id });
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: colony.id });
    seconds(gm, 10);
    issue(gm, { type: CMD.CANCEL_UPGRADE_HQ, playerId: 0, buildingId: colony.id });
    expect(colony.tierUpgrade).toBeNull();
    expect(first.tierUpgrade).not.toBeNull();
    expect(gm.getPlayer(0).resources.gold).toBe(g0 - 1000);
    seconds(gm, 51);
    expect(first.tier).toBe(2);
    expect(colony.tier).toBe(1);
  });

  it('um jogador não evolui o Centro de outro (dono é conferido)', () => {
    const { gm, colony } = makeTwoHqGm();
    rich(gm, 1);
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 1, buildingId: colony.id });
    expect(colony.tierUpgrade).toBeNull();
  });

  it('Centro em upgrade pausa só o próprio treino; o outro continua treinando e os dois entregam recursos', () => {
    const { gm, first, colony } = makeTwoHqGm();
    rich(gm);
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: colony.id });
    expect(colony.queueUnit(workerOf(colony), gm)).toBe(false);
    expect(first.queueUnit(workerOf(first), gm)).toBe(true);
    // ambos seguem como ponto de entrega mesmo em upgrade
    const c = colony.mesh.position;
    expect(gm.findNearestDropoff({ x: c.x, z: c.z + 3 }, 'gold', gm.buildings, 0)).toBe(colony);
  });
});

describe('2 Centros: entrega de recursos, rally e treino', () => {
  it('a entrega vai ao Centro mais próximo; sem ele, ao outro', () => {
    const { gm, first, colony } = makeTwoHqGm();
    const a = first.mesh.position;
    const c = colony.mesh.position;
    for (const res of ['gold', 'wood', 'stone']) {
      expect(gm.findNearestDropoff({ x: a.x, z: a.z }, res, gm.buildings, 0)).toBe(first);
      expect(gm.findNearestDropoff({ x: c.x, z: c.z }, res, gm.buildings, 0)).toBe(colony);
    }
    kill(colony);
    gm.simStep(SIM_DT);
    expect(gm.findNearestDropoff({ x: c.x, z: c.z }, 'gold', gm.buildings, 0)).toBe(first);
  });

  it('cada Centro tem o próprio rally e o aldeão treinado nasce no Centro que o treinou', () => {
    const { gm, first, colony } = makeTwoHqGm();
    rich(gm);
    const rallyFirst = { x: first.mesh.position.x + 5, z: first.mesh.position.z + 5 };
    const rallyColony = { x: colony.mesh.position.x - 5, z: colony.mesh.position.z - 5 };
    issue(gm, { type: CMD.RALLY, playerId: 0, buildingId: first.id, x: rallyFirst.x, z: rallyFirst.z });
    issue(gm, { type: CMD.RALLY, playerId: 0, buildingId: colony.id, x: rallyColony.x, z: rallyColony.z });
    expect(first.rallyPoint.x).toBeCloseTo(rallyFirst.x, 6);
    expect(colony.rallyPoint.x).toBeCloseTo(rallyColony.x, 6);
    const n0 = gm.getUnitsOf(0).length;
    expect(colony.queueUnit(workerOf(colony), gm)).toBe(true);
    seconds(gm, 40);
    const fresh = gm.getUnitsOf(0).filter((u) => u.type === workerOf(colony)).length;
    expect(gm.getUnitsOf(0).length).toBe(n0 + 1);
    expect(fresh).toBeGreaterThan(0);
  });
});

describe('2 Centros: derrota e vitória', () => {
  it('isPlayerDefeated: regicide só cai quando morrem os dois Centros', () => {
    const b = (role, isDead = false) => ({ role, isDead });
    expect(isPlayerDefeated('regicide', [b('hq', true), b('hq')])).toBe(false);
    expect(isPlayerDefeated('regicide', [b('hq', true), b('hq', true), b('house')])).toBe(true);
  });

  it('regicide numa partida: perder um Centro não derrota; perder os dois, sim', () => {
    const { gm, first, colony } = makeTwoHqGm({ victoryMode: 'regicide', owner: 1, aiAll: true });
    gm.simStep(SIM_DT);
    kill(first);
    seconds(gm, 1);
    expect(gm.getPlayer(1).defeated).toBeFalsy();
    expect(gm.isGameOver).toBe(false);
    kill(colony);
    seconds(gm, 1);
    expect(gm.getPlayer(1).defeated).toBe(true);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
  }, 30000);

  it('conquest: com o Centro principal caído e outras construções, o jogador segue vivo', () => {
    const { gm, first } = makeTwoHqGm({ victoryMode: 'conquest', owner: 1, aiAll: true });
    kill(first);
    seconds(gm, 1);
    expect(gm.getPlayer(1).defeated).toBeFalsy();
  }, 30000);
});

describe('2 Centros: IA com dois Centros', () => {
  it('a IA com 2 Centros joga 3 min sem erro, evolui um Centro por vez e nunca duplica o upgrade', () => {
    const { gm, first, colony } = makeTwoHqGm({ owner: 1, aiAll: true });
    rich(gm, 1);
    let guard = 0;
    for (let i = 0; i < 180 / SIM_DT; i++) {
      gm.simStep(SIM_DT);
      if (gm.isGameOver) break;
      const both = first.tierUpgrade && colony.tierUpgrade;
      if (both) guard++;
    }
    expect(guard).toBe(0);
    expect(Math.max(first.tier, colony.tier)).toBeGreaterThanOrEqual(2);
  }, 60000);
});

describe('2 Centros: missão sintética (ciclo completo)', () => {
  const COL = { x: -20, z: 20 };
  const mission = () => baseMission({
    autoVictory: false,
    startingResources: { gold: 5000, wood: 5000, stone: 5000 },
    vars: { fundado: false },
    objectives: [
      { id: 'cidade', type: 'build', priority: 'primary', role: 'hq', count: 2, title: 'Dois Centros' },
      { id: 'cair', type: 'destroy', priority: 'secondary', select: { tag: 'marco' }, title: 'Marco cai' }
    ],
    triggers: [
      { id: 'funda', when: { type: 'time', at: 2 }, actions: [{ type: 'spawnBuilding', owner: 'player', buildingType: 'castle', x: COL.x, z: COL.z, tag: 'marco' }, { type: 'setVar', name: 'fundado', value: true }] },
      { id: 'fim', when: { type: 'objective', id: 'cidade', status: 'completed' }, actions: [{ type: 'victory' }] }
    ]
  });

  it('fundar o Marco, evoluir o 2º Centro, treinar nele, perdê-lo e mesmo assim vencer pela missão', () => {
    const gm = makeMissionGm(mission());
    const first = hqsOf(gm)[0];
    runTicks(gm, 10);
    expect(statusOf(gm, 'cidade')).toBe('active');
    expect(hqsOf(gm)).toHaveLength(1);
    runTicks(gm, 60); // t > 2 s: o gatilho fundou o Marco
    const marco = gm.entitiesById.get(gm.mission.tags.get('marco')[0]);
    expect(marco && marco.type).toBe('castle');
    expect(marco.isConstructed).toBe(true);
    expect(hqsOf(gm)).toHaveLength(2);
    expect(hqsOf(gm).map((b) => b.id)).toContain(marco.id);
    // os dois Centros contam para o objetivo 'build' (a vitória vem do próprio runtime)
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
    expect(first.isDead).toBe(false);
  });

  it('com autoVictory desligado: o Marco evolui, treina, cai — a missão segue e só falha ao zerar tudo', () => {
    const def = mission();
    def.triggers = def.triggers.filter((t) => t.id === 'funda');
    def.objectives = [{ id: 'o', type: 'survive', priority: 'primary', seconds: 9999, title: 's' }, def.objectives[1]];
    const gm = makeMissionGm(def);
    runTicks(gm, 60);
    const marco = gm.entitiesById.get(gm.mission.tags.get('marco')[0]);
    const first = hqsOf(gm).find((b) => b !== marco);
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: marco.id });
    seconds(gm, 61);
    expect(marco.tier).toBe(2);
    expect(first.tier).toBe(1);
    expect(missingRequirements(0, 'stable', gm)).not.toContainEqual({ hq: 2 });
    expect(marco.queueUnit(workerOf(marco), gm)).toBe(true);
    seconds(gm, 25);
    // o Marco cai: o objetivo 'destroy' por tag conclui, a missão continua e o requisito de nível 2 volta a faltar
    kill(marco);
    seconds(gm, 6);
    expect(statusOf(gm, 'cair')).toBe('completed');
    expect(gm.isGameOver).toBe(false);
    expect(hqsOf(gm)).toEqual([first]);
    expect(missingRequirements(0, 'stable', gm)).toContainEqual({ hq: 2 });
    // o Centro original continua evoluindo/treinando normalmente
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: first.id });
    expect(first.tierUpgrade).not.toBeNull();
  }, 60000);
});

describe('2 Centros: HUD (card de evolução do Centro selecionado)', () => {
  /** `UIManager.updateHqTierCard` com elementos falsos: o card reflete SEMPRE o Centro que se passa (o selecionado). */
  async function makeCard(gm) {
    const { UIManager } = await import('../../src/ui/UIManager.js');
    const el = () => ({ style: {}, innerText: '', innerHTML: '', title: '', disabled: false, classList: { add() {}, remove() {} }, querySelector: () => null });
    const ui = {
      gm, _hqIconKey: null, _icon: () => '',
      bldHqTierSection: el(), bldHqTierLabel: el(), bldHqUpgradeBtn: el(), bldHqUpgradeBtnLabel: el(), bldHqUpgradeIcon: el(),
      bldHqUpgradeProgressBar: el(), bldHqUpgradeProgressTrack: el()
    };
    return { ui, update: (b) => UIManager.prototype.updateHqTierCard.call(ui, b) };
  }

  it('mostra nível, botão e progresso do Centro passado, independente do outro', async () => {
    const { gm, first, colony } = makeTwoHqGm();
    rich(gm);
    const { ui, update } = await makeCard(gm);
    update(colony);
    expect(ui.bldHqTierSection.style.display).toBe('flex');
    const labelNivel1 = ui.bldHqTierLabel.innerText;
    expect(ui.bldHqUpgradeBtn.disabled).toBe(false);
    issue(gm, { type: CMD.UPGRADE_HQ, playerId: 0, buildingId: colony.id });
    seconds(gm, 30);
    update(colony); // em andamento: botão vira "cancelar" com a barra em ~50 %
    const pct = parseFloat(ui.bldHqUpgradeProgressBar.style.width);
    expect(pct).toBeGreaterThan(45);
    expect(pct).toBeLessThan(55);
    update(first); // o outro Centro: sem upgrade, barra zerada, botão de evoluir normal
    expect(ui.bldHqUpgradeProgressBar.style.width).toBe('0%');
    expect(ui.bldHqUpgradeBtn.disabled).toBe(false);
    seconds(gm, 31);
    update(colony);
    expect(ui.bldHqTierLabel.innerText).not.toBe(labelNivel1); // nível 2 no card do Marco
    update(first);
    expect(ui.bldHqTierLabel.innerText).toBe(labelNivel1); // o card do Centro original segue no nível 1
  });

  it('tecla do Centro alterna entre os Centros vivos (com 1 Centro, seleciona sempre o mesmo)', async () => {
    const { InputManager } = await import('../../src/core/InputManager.js');
    const { gm, first, colony } = makeTwoHqGm();
    const picked = [];
    gm.selectSingle = (b) => { gm.selectedBuilding = b; picked.push(b); };
    const sm = { cameraTarget: { copy() {} } };
    const call = () => InputManager.prototype.centerOnHq.call({ gm, sm });
    call(); call(); call();
    expect(picked).toEqual([first, colony, first]);
    kill(first);
    gm.selectedBuilding = null;
    picked.length = 0;
    call(); call();
    expect(picked).toEqual([colony, colony]); // um só vivo: o morto nunca é escolhido
  });
});

describe('2 Centros: a IA treina no Centro que não está evoluindo', () => {
  it('com o 1º Centro evoluindo, o Marco recebe a fila de aldeões da IA', () => {
    const { gm, first, colony } = makeTwoHqGm({ owner: 1, aiAll: true });
    rich(gm, 1);
    first.tierUpgrade = { targetTier: 2, progress: 0, totalTime: 9999, cost: { gold: 0 } };
    seconds(gm, 20);
    expect(first.queue.length).toBe(0);
    expect(colony.queue.length + gm.getUnitsOf(1).length).toBeGreaterThan(0);
    expect(colony.queue.length).toBeGreaterThan(0);
  }, 30000);
});
