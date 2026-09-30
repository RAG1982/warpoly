import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { CMD } from '../../src/sim/commands.js';
import { EVT } from '../../src/sim/events.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { HQ_TIER_HP, getHqUpgradeCost, getTierName } from '../../src/data/tiers.js';

/**
 * tiers.test.js — F3-06: upgrade de nível do Centro (`role: 'hq'`).
 *
 * `GameManager` já cria o Centro inicial de cada jogador (`_spawnStartingBase`) em
 * `gm.buildings`, do mesmo jeito que `requirements.test.js` (F3-04) assume.
 */
function makeGm(seed = 5) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed, headless: true });
  return new GameManager(scene, terrain, null, null, cfg);
}

function getHq(gm, playerId = 0) {
  return gm.buildings.find(b => b.ownerId === playerId && (b.type === 'castle' || b.type === 'great_hall'));
}

function runTicks(gm, seconds) {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) gm.simStep(SIM_DT);
}

describe('tiers.js (dados puros)', () => {
  it('getTierName: nomes PT-BR por facção/nível', () => {
    expect(getTierName('human', 1)).toBe('Paço Real');
    expect(getTierName('human', 2)).toBe('Fortaleza');
    expect(getTierName('orc', 3)).toBe('Cidadela de Ferro');
  });

  it('getHqUpgradeCost: nível 2 e 3 batem com a spec', () => {
    expect(getHqUpgradeCost(2)).toEqual({ gold: 1000, wood: 400, stone: 300, time: 60 });
    expect(getHqUpgradeCost(3)).toEqual({ gold: 2000, wood: 800, stone: 600, oil: 200, time: 90 });
    expect(getHqUpgradeCost(4)).toBeNull();
  });
});

describe('Building.startTierUpgrade / CMD.UPGRADE_HQ (integração)', () => {
  it('debita o custo e leva exatamente o tempo do nível (nível 2: 60s)', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 5000;
    owner.resources.wood = 5000;
    owner.resources.stone = 5000;
    const hq = getHq(gm);
    expect(hq.tier).toBe(1);

    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT); // drena o comando (COMMAND_DELAY_TICKS = 0)

    expect(hq.tierUpgrade).not.toBeNull();
    const before = { ...owner.resources };
    expect(before.gold).toBe(5000 - 1000);
    expect(before.wood).toBe(5000 - 400);
    expect(before.stone).toBe(5000 - 300);

    runTicks(gm, 60 - SIM_DT); // quase no fim: ainda não concluiu
    expect(hq.tier).toBe(1);
    expect(hq.tierUpgrade).not.toBeNull();

    gm.simStep(SIM_DT); // cruza totalTime = 60s
    expect(hq.tier).toBe(2);
    expect(hq.tierUpgrade).toBeNull();
    // Recursos não voltam a mudar após concluir (só foram debitados uma vez)
    expect(owner.resources).toEqual(before);
  });

  it('recursos insuficientes: nada acontece e nada é debitado', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 0;
    owner.resources.wood = 0;
    owner.resources.stone = 0;
    const before = { ...owner.resources };
    const hq = getHq(gm);

    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT);

    expect(hq.tierUpgrade).toBeNull();
    expect(hq.tier).toBe(1);
    expect(owner.resources).toEqual(before);
  });

  it('PV máximo sobe preservando a proporção de PV atual', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 5000;
    owner.resources.wood = 5000;
    owner.resources.stone = 5000;
    const hq = getHq(gm);

    hq.hp = hq.maxHp / 2; // 50% de vida antes do upgrade
    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT);
    runTicks(gm, 60);

    expect(hq.tier).toBe(2);
    expect(hq.maxHp).toBe(HQ_TIER_HP[2]);
    expect(hq.hp).toBe(Math.round(HQ_TIER_HP[2] * 0.5));
  });

  it('emite EVT.HQ_TIER_CHANGED ao concluir', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 5000;
    owner.resources.wood = 5000;
    owner.resources.stone = 5000;
    const hq = getHq(gm);

    const events = [];
    gm.events.on(EVT.HQ_TIER_CHANGED, (payload) => events.push(payload));

    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT);
    runTicks(gm, 60);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ buildingId: hq.id, ownerId: 0, tier: 2 });
  });

  it('fila de treino pausada durante o upgrade e retomada depois', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 5000;
    owner.resources.wood = 5000;
    owner.resources.stone = 5000;
    const hq = getHq(gm);
    const workerType = hq.type === 'great_hall' ? 'peon' : 'villager';

    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT);
    expect(hq.tierUpgrade).not.toBeNull();

    // Tentativa de treinar durante o upgrade: recusado, sem debitar.
    const goldBefore = owner.resources.gold;
    expect(hq.queueUnit(workerType, gm)).toBe(false);
    expect(hq.queue).toHaveLength(0);
    expect(owner.resources.gold).toBe(goldBefore);

    runTicks(gm, 60);
    expect(hq.tierUpgrade).toBeNull();

    expect(hq.queueUnit(workerType, gm)).toBe(true);
    expect(hq.queue).toHaveLength(1);
  });

  it('cancelar devolve 100% do custo', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 5000;
    owner.resources.wood = 5000;
    owner.resources.stone = 5000;
    const before = { ...owner.resources };
    const hq = getHq(gm);

    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT);
    expect(hq.tierUpgrade).not.toBeNull();

    gm.issue({ type: CMD.CANCEL_UPGRADE_HQ, playerId: 0, buildingId: hq.id });
    gm.simStep(SIM_DT);

    expect(hq.tierUpgrade).toBeNull();
    expect(hq.tier).toBe(1);
    expect(owner.resources).toEqual(before);
  });

  it('tier 3 não evolui mais', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 99999;
    owner.resources.wood = 99999;
    owner.resources.stone = 99999;
    const hq = getHq(gm);
    hq.tier = 3;
    hq.maxHp = HQ_TIER_HP[3];
    hq.hp = HQ_TIER_HP[3];

    expect(hq.startTierUpgrade(gm)).toBe(false);
    expect(hq.tierUpgrade).toBeNull();
  });

  it('comando de jogador alheio (id diferente do dono) é ignorado pelo CommandExecutor', () => {
    const gm = makeGm();
    const owner = gm.getPlayer(0);
    owner.resources.gold = 5000;
    owner.resources.wood = 5000;
    owner.resources.stone = 5000;
    const before = { ...owner.resources };
    const hq = getHq(gm);

    // playerId=1 tentando mandar upgrade no Centro do jogador 0
    gm.issue({ type: CMD.UPGRADE_HQ, playerId: 1, buildingId: hq.id });
    gm.simStep(SIM_DT);

    expect(hq.tierUpgrade).toBeNull();
    expect(owner.resources).toEqual(before);
  });
});
