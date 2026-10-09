import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { createMissionConfig } from '../../src/data/missions/index.js';
import { runTicks, recordEvents, teleport, statusOf, EVT } from './helpers/missionWorld.js';

/** F8-04 — a missão de demonstração (`mission-demo`) jogada de ponta a ponta em modo headless. */
function demoGm() {
  const cfg = createMissionConfig('mission-demo');
  cfg.headless = true;
  return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
}
const tag = (gm, name) => gm.mission.tags.get(name).map((id) => gm.entitiesById.get(id));

describe('mission-demo (F8-04)', () => {
  it('começa com os objetivos visíveis, o oculto escondido e a cutscene de abertura', () => {
    const gm = demoGm();
    const log = recordEvents(gm, [EVT.MISSION_CUTSCENE, EVT.MISSION_MUSIC]);
    runTicks(gm, 3);
    const snap = gm.mission.snapshot();
    expect(snap.objectives.map((o) => o.id)).toEqual(['build-barracks', 'destroy-camp', 'rescue-captives', 'escort-envoy', 'gold-stock']);
    expect(snap.objectives.every((o) => o.status === 'active')).toBe(true);
    expect(log.map((e) => e.type)).toEqual([EVT.MISSION_MUSIC, EVT.MISSION_CUTSCENE]);
    expect(tag(gm, 'camp').length).toBe(1);
    expect(tag(gm, 'camp-guards').length).toBe(2);
    expect(tag(gm, 'captives').every((u) => u.ownerId === -1)).toBe(true);
    expect(tag(gm, 'envoy')[0].ownerId).toBe(0);
  });

  it('jogada completa: quartel, ondas, resgate, ruínas ocultas, acampamento e trégua => vitória', () => {
    const gm = demoGm();
    const msgs = recordEvents(gm, [EVT.MISSION_DIALOG, EVT.MISSION_MESSAGE, EVT.MISSION_OBJECTIVE]);
    const me = () => gm.getUnitsOf(0).find((u) => u.type === 'knight') || gm.getUnitsOf(0)[0];

    // 1. Quartel => objetivo secundário de resistência ativa, ondas habilitadas
    const b = gm.createBuilding('barracks', -42, 34, true, 0);
    gm.buildings.push(b);
    runTicks(gm, 12); // objetivos de varredura são avaliados a cada 5 ticks
    expect(statusOf(gm, 'build-barracks')).toBe('completed');
    expect(statusOf(gm, 'hold-the-line')).toBe('active');
    expect(gm.mission.triggers.get('raid-wave').enabled).toBe(true);

    // 2. A 1ª onda chega aos 40 s
    runTicks(gm, 800);
    expect(gm.mission.vars.waves).toBeGreaterThanOrEqual(1);
    expect(msgs.some((e) => e.type === EVT.MISSION_DIALOG && e.portrait === '👁️')).toBe(true);
    expect(gm.getUnitsOf(99).length).toBeGreaterThan(2);

    // 3. Resgate dos cativos
    const wood = gm.getPlayer(0).resources.wood;
    teleport(gm, me(), -32, -10);
    runTicks(gm, 10);
    expect(tag(gm, 'captives').every((u) => u.ownerId === 0)).toBe(true);
    expect(statusOf(gm, 'rescue-captives')).toBe('completed');
    expect(gm.mission.vars.rescued).toBe(true);
    expect(gm.getPlayer(0).resources.wood).toBeLessThan(wood + 1); // rações descontadas (a coleta pode somar)
    expect(gm.mission.objectives.get('scout-ruins').visible).toBe(true); // revelado pelo gatilho encadeado

    // 4. Ruínas (objetivo oculto): +150 de ouro
    const gold = gm.getPlayer(0).resources.gold;
    teleport(gm, me(), 34, 26);
    runTicks(gm, 10);
    expect(statusOf(gm, 'scout-ruins')).toBe('completed');
    expect(gm.getPlayer(0).resources.gold).toBe(gold + 150);

    // 5. Acampamento destruído pelo jogador: espólio + novo objetivo
    const goldBeforeCamp = gm.getPlayer(0).resources.gold;
    gm.buildings.find((x) => x.type === 'bandit_camp').takeDamage(1e6, me());
    runTicks(gm, 5);
    expect(statusOf(gm, 'destroy-camp')).toBe('completed');
    expect(gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(goldBeforeCamp + 100);
    expect(statusOf(gm, 'rout-bandits')).toBe('active');

    // 6. Escolta do emissário => trégua (rival vira aliado) e vitória
    expect(gm.isGameOver).toBe(false);
    expect(gm.isHostile(0, 1)).toBe(true);
    teleport(gm, tag(gm, 'envoy')[0], 14, -18);
    runTicks(gm, 10);
    expect(statusOf(gm, 'escort-envoy')).toBe('completed');
    expect(gm.isHostile(0, 1)).toBe(false);
    expect(gm.mission.vars.truce).toBe(true);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
    expect(gm.mission.snapshot().outcome).toBe('victory');
    // ouro (secundário) não era necessário para vencer
    expect(statusOf(gm, 'gold-stock')).toBe('active');
  });

  it('o emissário morto antes da entrega causa derrota com o texto da missão', () => {
    const gm = demoGm();
    tag(gm, 'envoy')[0].takeDamage(1e6, null);
    runTicks(gm, 10);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(false);
    expect(gm.mission.outcome).toBe('defeat');
  });

  it('depois da entrega, a morte do emissário não derrota mais', () => {
    const gm = demoGm();
    const vip = tag(gm, 'envoy')[0];
    teleport(gm, vip, 14, -18);
    runTicks(gm, 10);
    expect(statusOf(gm, 'escort-envoy')).toBe('completed');
    vip.takeDamage(1e6, null);
    runTicks(gm, 10);
    expect(gm.mission.outcome).toBeNull();
  });

  it('a missão é determinística com a seed da missão (mesmos checksums)', () => {
    const a = demoGm();
    const b = demoGm();
    runTicks(a, 400);
    runTicks(b, 400);
    expect(b.checksums).toEqual(a.checksums);
    expect(a.checksums.length).toBeGreaterThan(10);
  });
});
