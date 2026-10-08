import { describe, it, expect } from 'vitest';
import { baseMission, makeMissionGm, runTicks, recordEvents, teleport, statusOf, EVT } from './helpers/missionWorld.js';
import { CMD } from '../../src/sim/commands.js';
import { stateChecksum } from '../../src/sim/checksum.js';

/**
 * F8-04 — runtime headless da missão: cada tipo de objetivo, condição de gatilho e ação, mais o desfecho (vitória/derrota)
 * integrado ao `GameManager`. Os cenários usam o mapa `tutorial` (jogador 0 em (-22,20); acampamento de bandidos em (4,-8)).
 */
const PRIMARY = (extra) => ({ priority: 'primary', title: 'Objetivo', ...extra });

describe('objetivos (F8-04)', () => {
  it('destroy: conta mortes por tipo/dono/killedBy; completa em N', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [
        PRIMARY({ id: 'kills', type: 'destroy', select: { unitType: 'bandit', owner: 'bandits', killedBy: 'player' }, count: 2 }),
        PRIMARY({ id: 'camp', type: 'destroy', select: { buildingType: 'bandit_camp' } })
      ]
    }));
    const me = gm.getUnitsOf(0)[0];
    const bandits = gm.getUnitsOf(99);
    expect(bandits.length).toBe(2);
    bandits[0].takeDamage(1e6, me, gm.allUnits);
    runTicks(gm, 3);
    expect(statusOf(gm, 'kills')).toBe('active');
    expect(gm.mission.objectives.get('kills').cur).toBe(1);
    bandits[1].takeDamage(1e6, me, gm.allUnits);
    runTicks(gm, 3);
    expect(statusOf(gm, 'kills')).toBe('completed');
    expect(statusOf(gm, 'camp')).toBe('active');
    gm.buildings.find((b) => b.type === 'bandit_camp').takeDamage(1e6, me);
    runTicks(gm, 3);
    expect(statusOf(gm, 'camp')).toBe('completed');
  });

  it('destroy: baixa causada por outro dono não conta com killedBy', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [PRIMARY({ id: 'k', type: 'destroy', select: { unitType: 'bandit', killedBy: 'player' }, count: 1 })]
    }));
    const rival = gm.getUnitsOf(1)[0];
    gm.getUnitsOf(99)[0].takeDamage(1e6, rival, gm.allUnits);
    runTicks(gm, 3);
    expect(statusOf(gm, 'k')).toBe('active');
  });

  it('survive: completa após X segundos e a missão vence (único primário)', () => {
    const gm = makeMissionGm(baseMission({ objectives: [PRIMARY({ id: 's', type: 'survive', seconds: 3 })] }));
    runTicks(gm, 50);
    expect(statusOf(gm, 's')).toBe('active');
    expect(gm.isGameOver).toBe(false);
    runTicks(gm, 20);
    expect(statusOf(gm, 's')).toBe('completed');
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(true);
    expect(gm.mission.outcome).toBe('victory');
  });

  it('survive: só conta a partir da ativação', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [PRIMARY({ id: 's', type: 'survive', seconds: 2, active: false })],
      triggers: [{ id: 'go', when: { type: 'time', at: 3 }, actions: [{ type: 'setObjective', id: 's', status: 'active' }] }]
    }));
    runTicks(gm, 80); // 4 s: ativou aos 3 s, faltam 1 s
    expect(statusOf(gm, 's')).toBe('active');
    runTicks(gm, 40);
    expect(statusOf(gm, 's')).toBe('completed');
  });

  it('escort: completa quando a unidade escoltada chega à área; falha se morre antes', () => {
    const def = (id) => baseMission({
      autoVictory: false,
      setup: [{ type: 'spawn', owner: 'player', unitType: 'villager', x: -20, z: 8, tag: 'vip' }],
      objectives: [PRIMARY({ id, type: 'escort', tag: 'vip', area: { x: 10, z: 10, r: 4 } })]
    });
    const a = makeMissionGm(def('e'));
    const vip = a.entitiesById.get(a.mission.tags.get('vip')[0]);
    runTicks(a, 25);
    expect(statusOf(a, 'e')).toBe('active');
    teleport(a, vip, 10, 10);
    runTicks(a, 10);
    expect(statusOf(a, 'e')).toBe('completed');

    const b = makeMissionGm(def('e'));
    const vip2 = b.entitiesById.get(b.mission.tags.get('vip')[0]);
    vip2.takeDamage(1e6, null);
    runTicks(b, 10);
    expect(statusOf(b, 'e')).toBe('failed');
  });

  it('escort primário falho encerra a missão em derrota', () => {
    const gm = makeMissionGm(baseMission({
      setup: [{ type: 'spawn', owner: 'player', unitType: 'villager', x: -20, z: 8, tag: 'vip' }],
      objectives: [PRIMARY({ id: 'e', type: 'escort', tag: 'vip', area: { x: 10, z: 10, r: 4 } })]
    }));
    gm.entitiesById.get(gm.mission.tags.get('vip')[0]).takeDamage(1e6, null);
    runTicks(gm, 10);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(false);
    expect(gm.mission.outcome).toBe('defeat');
    expect(gm.localPlayer.defeated).toBe(true);
  });

  it('rescue: unidades neutras viram do jogador por transferência e contam', () => {
    const gm = makeMissionGm(baseMission({
      setup: [{ type: 'spawn', owner: 'neutral', unitType: 'villager', count: 2, x: -30, z: -10, tag: 'cap' }],
      objectives: [PRIMARY({ id: 'r', type: 'rescue', tag: 'cap', count: 2 })],
      triggers: [{ id: 'free', when: { type: 'area', owner: 'player', area: { x: -30, z: -10, r: 6 } }, actions: [{ type: 'transfer', select: { tag: 'cap' }, to: 'player' }] }]
    }));
    const caps = gm.mission.tags.get('cap').map((id) => gm.entitiesById.get(id));
    expect(caps.every((u) => u.ownerId === -1)).toBe(true);
    runTicks(gm, 10);
    expect(statusOf(gm, 'r')).toBe('active');
    teleport(gm, gm.getUnitsOf(0)[0], -30, -10);
    runTicks(gm, 10);
    expect(caps.every((u) => u.ownerId === 0)).toBe(true);
    expect(gm.getUnitsOf(0)).toEqual(expect.arrayContaining(caps));
    expect(gm.getUnitsOf(-1).length).toBe(0);
    expect(gm.getPlayer(0).population).toBeGreaterThanOrEqual(7);
    expect(statusOf(gm, 'r')).toBe('completed');
  });

  it('build: conta construções concluídas do tipo', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [PRIMARY({ id: 'b', type: 'build', buildingType: 'barracks', count: 2 })]
    }));
    const add = (x, z, done) => {
      const b = gm.createBuilding('barracks', x, z, done, 0);
      gm.buildings.push(b);
      return b;
    };
    add(-40, 30, true);
    add(-46, 30, false); // em obra não conta
    runTicks(gm, 10);
    expect(gm.mission.objectives.get('b').cur).toBe(1);
    expect(statusOf(gm, 'b')).toBe('active');
    add(-34, 34, true);
    runTicks(gm, 10);
    expect(statusOf(gm, 'b')).toBe('completed');
  });

  it('collect: modo gathered (eventos) e stock (saldo)', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [
        PRIMARY({ id: 'g', type: 'collect', resource: 'gold', amount: 100 }),
        PRIMARY({ id: 'w', type: 'collect', resource: 'wood', amount: 1000, mode: 'stock' })
      ]
    }));
    gm.events.emit(EVT.RESOURCE_GATHERED, { type: 'gold', amount: 60, pos: { x: 0, y: 0, z: 0 }, ownerId: 0 });
    gm.events.emit(EVT.RESOURCE_GATHERED, { type: 'gold', amount: 500, pos: { x: 0, y: 0, z: 0 }, ownerId: 1 }); // outro dono: ignorado
    runTicks(gm, 10);
    expect(gm.mission.objectives.get('g').cur).toBe(60);
    gm.events.emit(EVT.RESOURCE_GATHERED, { type: 'gold', amount: 40, pos: { x: 0, y: 0, z: 0 }, ownerId: 0 });
    runTicks(gm, 10);
    expect(statusOf(gm, 'g')).toBe('completed');
    expect(statusOf(gm, 'w')).toBe('active');
    gm.getPlayer(0).resources.wood = 1000;
    runTicks(gm, 10);
    expect(statusOf(gm, 'w')).toBe('completed');
  });

  it('eliminate: completa quando não resta unidade/construção dos donos', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [PRIMARY({ id: 'x', type: 'eliminate', owners: ['bandits'] }), PRIMARY({ id: 'u', type: 'eliminate', owners: [99], include: 'units' })]
    }));
    runTicks(gm, 10);
    expect(statusOf(gm, 'x')).toBe('active');
    gm.getUnitsOf(99).forEach((u) => u.takeDamage(1e6, null));
    runTicks(gm, 10);
    expect(statusOf(gm, 'u')).toBe('completed');
    expect(statusOf(gm, 'x')).toBe('active'); // o acampamento ainda existe
    gm.buildings.find((b) => b.type === 'bandit_camp').takeDamage(1e6, null);
    runTicks(gm, 10);
    expect(statusOf(gm, 'x')).toBe('completed');
  });

  it('flag + failWhen: condição arbitrária completa/falha o objetivo', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      vars: { done: false, bad: false },
      objectives: [
        PRIMARY({ id: 'f', type: 'flag', condition: { type: 'var', name: 'done', value: true } }),
        PRIMARY({ id: 'g', type: 'flag', condition: { type: 'var', name: 'never', value: true }, failWhen: { type: 'var', name: 'bad', value: true } })
      ].map((o) => (o.id === 'g' ? { ...o, condition: { type: 'var', name: 'done', value: 'impossível' } } : o)),
      triggers: [
        { id: 't1', when: { type: 'time', at: 1 }, actions: [{ type: 'setVar', name: 'done', value: true }] },
        { id: 't2', when: { type: 'time', at: 2 }, actions: [{ type: 'setVar', name: 'bad', value: true }] }
      ]
    }));
    runTicks(gm, 30);
    expect(statusOf(gm, 'f')).toBe('completed');
    expect(statusOf(gm, 'g')).toBe('active');
    runTicks(gm, 30);
    expect(statusOf(gm, 'g')).toBe('failed');
  });

  it('prioridades: secundário/oculto não decidem a vitória; oculto só aparece quando revelado/concluído', () => {
    const gm = makeMissionGm(baseMission({
      vars: { v: false },
      objectives: [
        PRIMARY({ id: 'p', type: 'survive', seconds: 2 }),
        { id: 's', type: 'survive', priority: 'secondary', seconds: 999, title: 'Longo' },
        { id: 'h', type: 'flag', priority: 'hidden', title: 'Segredo', condition: { type: 'var', name: 'v', value: true } }
      ]
    }));
    expect(gm.mission.snapshot().objectives.map((o) => o.id)).toEqual(['p', 's']);
    runTicks(gm, 50);
    expect(gm.mission.outcome).toBe('victory'); // o secundário (999 s) não impede
    expect(gm.mission.snapshot().objectives.find((o) => o.id === 'h')).toBeUndefined();
  });

  it('defeatWhenWiped: jogador sem unidades nem construções perde', () => {
    const gm = makeMissionGm(baseMission({ objectives: [PRIMARY({ id: 's', type: 'survive', seconds: 600 })] }));
    gm.getUnitsOf(0).forEach((u) => u.takeDamage(1e6, null));
    gm.buildings.filter((b) => b.ownerId === 0).forEach((b) => b.takeDamage(1e6, null));
    runTicks(gm, 60);
    expect(gm.mission.outcome).toBe('defeat');
    expect(gm.isGameOver).toBe(true);
  });
});

describe('condições de gatilho (F8-04)', () => {
  const fires = (gm, id) => gm.mission.triggers.get(id).fired;
  const mission = (triggers, over = {}) => makeMissionGm(baseMission({
    autoVictory: false,
    vars: { n: 0, flag: false },
    objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 })],
    triggers,
    ...over
  }));
  const act = [{ type: 'incVar', name: 'n' }];

  it('time: dispara uma vez no instante certo', () => {
    const gm = mission([{ id: 't', when: { type: 'time', at: 2 }, actions: act }]);
    runTicks(gm, 38);
    expect(fires(gm, 't')).toBe(0);
    runTicks(gm, 6);
    expect(fires(gm, 't')).toBe(1);
    runTicks(gm, 100);
    expect(gm.mission.vars.n).toBe(1);
  });

  it('every + once:false: repete em intervalos exatos', () => {
    const gm = mission([{ id: 'e', once: false, when: { type: 'every', seconds: 1, start: 1 }, actions: act }]);
    runTicks(gm, 100); // 5 s => t=1,2,3,4,5
    expect(gm.mission.vars.n).toBe(5);
  });

  it('area: conta unidades do dono dentro da área (círculo e retângulo)', () => {
    const gm = mission([
      { id: 'c', when: { type: 'area', owner: 'player', area: { x: 0, z: 0, r: 3 }, count: 2 }, actions: act },
      { id: 'r', when: { type: 'area', owner: 'player', area: { x1: 20, z1: 20, x2: 30, z2: 30 }, unitType: 'villager' }, actions: act }
    ]);
    const [a, b] = gm.getUnitsOf(0);
    teleport(gm, a, 1, 1);
    runTicks(gm, 3);
    expect(fires(gm, 'c')).toBe(0);
    teleport(gm, b, -1, 0);
    runTicks(gm, 3);
    expect(fires(gm, 'c')).toBe(1);
    teleport(gm, gm.getUnitsOf(0).find((u) => u.type === 'villager'), 25, 25);
    runTicks(gm, 3);
    expect(fires(gm, 'r')).toBe(1);
  });

  it('dead: por tipo e por tag (todas as unidades marcadas)', () => {
    const gm = mission([
      { id: 'd1', when: { type: 'dead', select: { unitType: 'bandit' }, count: 2 }, actions: act },
      { id: 'd2', when: { type: 'dead', select: { tag: 'grp' } }, actions: act }
    ], { setup: [{ type: 'spawn', owner: 'player', unitType: 'archer', count: 2, x: -20, z: 0, tag: 'grp' }] });
    gm.mission.tags.get('grp').forEach((id) => gm.entitiesById.get(id).takeDamage(1e6, null));
    runTicks(gm, 3);
    expect(fires(gm, 'd2')).toBe(1);
    expect(fires(gm, 'd1')).toBe(0);
    gm.getUnitsOf(99).forEach((u) => u.takeDamage(1e6, null));
    runTicks(gm, 3);
    expect(fires(gm, 'd1')).toBe(1);
  });

  it('count + operadores: população viva por seletor', () => {
    const gm = mission([
      { id: 'ge', when: { type: 'count', select: { unitType: 'archer', owner: 'player' }, op: '>=', value: 2 }, actions: act },
      { id: 'lt', when: { type: 'count', select: { unitType: 'archer', owner: 'player' }, op: '<', value: 1 }, actions: act }
    ]);
    runTicks(gm, 3);
    expect(fires(gm, 'ge')).toBe(0);
    expect(fires(gm, 'lt')).toBe(0); // o jogador começa com 1 arqueiro
    gm.spawnUnit('archer', -10, 10, 0);
    runTicks(gm, 3);
    expect(fires(gm, 'ge')).toBe(1);
  });

  it('var: números, booleanos e textos, com operadores', () => {
    const gm = mission([
      { id: 'v1', when: { type: 'var', name: 'n', op: '>=', value: 3 }, actions: [{ type: 'setVar', name: 'flag', value: true }] },
      { id: 'v2', when: { type: 'var', name: 'flag', value: true }, actions: [{ type: 'setVar', name: 'n', value: 100 }] },
      { id: 'inc', once: false, cooldown: 0, when: { type: 'every', seconds: 0.5 }, actions: act }
    ]);
    runTicks(gm, 80);
    expect(gm.mission.vars.flag).toBe(true);
    expect(fires(gm, 'v2')).toBe(1);
  });

  it('objective: reage ao estado de outro objetivo', () => {
    const gm = mission([{ id: 'ob', when: { type: 'objective', id: 'q', status: 'completed' }, actions: act }], {
      objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 }), { id: 'q', type: 'survive', priority: 'secondary', seconds: 1, title: 'Q' }]
    });
    runTicks(gm, 10);
    expect(fires(gm, 'ob')).toBe(0);
    runTicks(gm, 20);
    expect(fires(gm, 'ob')).toBe(1);
  });

  it('resource: saldo do jogador', () => {
    const gm = mission([{ id: 'rs', when: { type: 'resource', owner: 'player', resource: 'gold', op: '>=', value: 5000 }, actions: act }]);
    runTicks(gm, 3);
    expect(fires(gm, 'rs')).toBe(0);
    gm.getPlayer(0).resources.gold = 5000;
    runTicks(gm, 3);
    expect(fires(gm, 'rs')).toBe(1);
  });

  it('trigger: encadeia no disparo de outro gatilho; combinadores all/any/not', () => {
    const gm = mission([
      { id: 'a', when: { type: 'time', at: 0.5 }, actions: act },
      { id: 'b', when: { type: 'trigger', id: 'a' }, actions: act },
      { id: 'c', when: { all: [{ type: 'trigger', id: 'a' }, { not: { type: 'var', name: 'flag', value: true } }, { any: [{ type: 'time', at: 99 }, { type: 'var', name: 'n', op: '>=', value: 1 }] }] }, actions: act }
    ]);
    runTicks(gm, 20);
    expect(gm.mission.vars.n).toBe(3);
  });

  it('enable/disable e cooldown de gatilhos repetíveis', () => {
    const gm = mission([
      { id: 'rep', enabled: false, once: false, cooldown: 1, when: { type: 'var', name: 'n', op: '>=', value: 0 }, actions: act },
      { id: 'on', when: { type: 'time', at: 1 }, actions: [{ type: 'enableTrigger', id: 'rep' }] },
      { id: 'off', when: { type: 'time', at: 4 }, actions: [{ type: 'disableTrigger', id: 'rep' }] }
    ]);
    runTicks(gm, 90); // habilitado entre t=1 e t=4: dispara em ~1, 2 e 3 s
    expect(gm.mission.vars.n).toBe(3);
    const n = gm.mission.vars.n;
    runTicks(gm, 60);
    expect(gm.mission.vars.n).toBe(n);
  });
});

describe('ações de missão (F8-04)', () => {
  const mission = (setup, triggers = [], over = {}) => makeMissionGm(baseMission({
    autoVictory: false,
    vars: { n: 0 },
    objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 })],
    setup,
    triggers,
    ...over
  }));
  const at0 = (actions) => [{ id: 'go', when: { type: 'time', at: 0 }, actions }];

  it('spawn: unidades (dono, quantidade, tag, ordem) sem aleatoriedade e sem comandos', () => {
    const gm = mission([], at0([
      { type: 'spawn', owner: 'bandits', units: [{ type: 'bandit', count: 2 }, { type: 'archer', count: 1 }], x: 30, z: -20, tag: 'w', order: { kind: 'attackMove', x: -22, z: 12 }, guard: true }
    ]));
    const before = gm.getUnitsOf(99).length;
    runTicks(gm, 3);
    expect(gm.getUnitsOf(99).length).toBe(before + 3);
    expect(gm.mission.tags.get('w').length).toBe(3);
    const u = gm.entitiesById.get(gm.mission.tags.get('w')[0]);
    expect(u.homePos).toBeTruthy();
    expect(gm.commands.log.length).toBe(0); // nada vai para o log de comandos
    // mesma espiral em outra execução
    const gm2 = mission([], at0([{ type: 'spawn', owner: 'bandits', units: [{ type: 'bandit', count: 2 }, { type: 'archer', count: 1 }], x: 30, z: -20, tag: 'w', order: { kind: 'attackMove', x: -22, z: 12 }, guard: true }]));
    runTicks(gm2, 3);
    const pos = (g) => g.mission.tags.get('w').map((id) => g.entitiesById.get(id).mesh.position.x.toFixed(3));
    expect(pos(gm2)).toEqual(pos(gm));
  });

  it('giveResources / takeResources (sem ficar negativo)', () => {
    const gm = mission([], at0([
      { type: 'giveResources', owner: 'player', gold: 100, wood: 50 },
      { type: 'takeResources', owner: 'player', wood: 10000, stone: 20 }
    ]));
    const r0 = { ...gm.getPlayer(0).resources };
    runTicks(gm, 2);
    const r = gm.getPlayer(0).resources;
    expect(r.gold).toBe(r0.gold + 100);
    expect(r.wood).toBe(0);
    expect(r.stone).toBe(r0.stone - 20);
  });

  it('setObjective / addObjective / revealObjective', () => {
    const gm = mission([], at0([
      { type: 'addObjective', objective: { id: 'novo', type: 'flag', priority: 'secondary', title: 'Novo', condition: { type: 'var', name: 'n', op: '>=', value: 99 } } },
      { type: 'setObjective', id: 'o', status: 'failed' },
      { type: 'revealObjective', id: 'oculto' }
    ]), { objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 }), { id: 'oculto', type: 'survive', priority: 'hidden', seconds: 9999, title: 'Oc' }] });
    const log = recordEvents(gm, [EVT.MISSION_OBJECTIVE]);
    runTicks(gm, 2);
    expect(statusOf(gm, 'o')).toBe('failed');
    expect(statusOf(gm, 'novo')).toBe('active');
    expect(gm.mission.objectives.get('oculto').visible).toBe(true);
    expect(log.some((e) => e.id === 'novo')).toBe(true);
  });

  it('reveal: área e mapa inteiro na névoa', () => {
    const gm = mission([], at0([{ type: 'reveal', x: 30, z: 30, radius: 6 }]));
    expect(gm.fogOfWar.isExplored(30, 30)).toBeFalsy();
    runTicks(gm, 2);
    expect(gm.fogOfWar.isExplored(30, 30)).toBeTruthy();
    const gm2 = mission([], at0([{ type: 'reveal', all: true }]));
    runTicks(gm2, 2);
    expect(gm2.fogOfWar.isExplored(-40, -40)).toBeTruthy();
    expect(gm2.fogOfWar.isExplored(40, 40)).toBeTruthy();
  });

  it('setTeam: muda a diplomacia (rival vira aliado) e o cache de hostis', () => {
    const gm = mission([], at0([{ type: 'setTeam', player: 1, team: 0 }]));
    expect(gm.isHostile(0, 1)).toBe(true);
    const enemiesBefore = gm.enemies.length;
    expect(enemiesBefore).toBeGreaterThan(0);
    runTicks(gm, 2);
    expect(gm.isHostile(0, 1)).toBe(false);
    expect(gm.isAlly(0, 1)).toBe(true);
    expect(gm.enemies.every((u) => u.ownerId !== 1)).toBe(true);
  });

  it('setTeam em neutros hostis (bandoleiros) e transfer de unidades', () => {
    const gm = mission([], at0([
      { type: 'setTeam', player: 'bandits', team: 0 },
      { type: 'transfer', select: { unitType: 'bandit', owner: 'bandits' }, to: 'player', tag: 'conv' }
    ]));
    runTicks(gm, 2);
    expect(gm.isHostile(0, 99)).toBe(false);
    expect(gm.getUnitsOf(99).length).toBe(0);
    expect(gm.mission.tags.get('conv').length).toBe(2);
    expect(gm.getUnitsOf(0).filter((u) => u.type === 'bandit').length).toBe(2);
  });

  it('tag + order: marca unidades existentes e dá ordem direta', () => {
    const gm = mission([{ type: 'tag', select: { unitType: 'archer', owner: 'player' }, tag: 'arq' }], at0([{ type: 'order', select: { tag: 'arq' }, kind: 'move', x: -30, z: 30 }]));
    expect(gm.mission.tags.get('arq').length).toBe(1);
    runTicks(gm, 2);
    const arq = gm.entitiesById.get(gm.mission.tags.get('arq')[0]);
    expect(arq.hasTargetPos || arq.pathDestination || arq.state === 'moving').toBeTruthy();
    expect(gm.commands.log.length).toBe(0);
  });

  it('eventos de apresentação: dialog, message, camera, cutscene, music, sound', () => {
    const gm = mission([], at0([
      { type: 'dialog', speaker: 'Lyra', portrait: '🧙', text: { 'pt-BR': 'Olá', en: 'Hi' }, duration: 3 },
      { type: 'message', text: 'Aviso' },
      { type: 'camera', x: 5, z: 6, zoom: 1.2 },
      { type: 'cutscene', id: 'c1', duration: 4, steps: [{ at: 0, x: 0, z: 0 }, { at: 3, x: 10, z: 10, dialog: { text: 'fim' } }] },
      { type: 'music', id: 'off' },
      { type: 'sound', id: 'alarm' }
    ]));
    const log = recordEvents(gm, [EVT.MISSION_DIALOG, EVT.MISSION_MESSAGE, EVT.MISSION_CAMERA, EVT.MISSION_CUTSCENE, EVT.MISSION_MUSIC, EVT.MISSION_SOUND]);
    runTicks(gm, 2);
    expect(log.map((e) => e.type)).toEqual([EVT.MISSION_DIALOG, EVT.MISSION_MESSAGE, EVT.MISSION_CAMERA, EVT.MISSION_CUTSCENE, EVT.MISSION_MUSIC, EVT.MISSION_SOUND]);
    expect(log[0].text).toEqual({ 'pt-BR': 'Olá', en: 'Hi' });
    expect(log[3]).toMatchObject({ id: 'c1', duration: 4, skippable: true });
    expect(log[3].steps.length).toBe(2);
  });

  it('victory / defeat explícitos encerram a partida', () => {
    const v = mission([], at0([{ type: 'victory', text: 'Fim!' }]));
    runTicks(v, 3);
    expect(v.isGameOver && v.gameWon).toBe(true);
    expect(v.mission.outcomeText).toBe('Fim!');
    const d = mission([], at0([{ type: 'defeat' }]));
    runTicks(d, 3);
    expect(d.isGameOver).toBe(true);
    expect(d.gameWon).toBe(false);
  });

  it('o encerramento emite MATCH_WON/MATCH_LOST e MISSION_ENDED', () => {
    const gm = mission([], at0([{ type: 'victory' }]));
    const log = recordEvents(gm, [EVT.MATCH_WON, EVT.MATCH_LOST, EVT.MISSION_ENDED]);
    runTicks(gm, 3);
    expect(log.map((e) => e.type)).toEqual([EVT.MISSION_ENDED, EVT.MATCH_WON]);
  });
});

describe('determinismo, save/load e replay da missão (F8-04)', () => {
  /** Missão pequena e "jogável" só por comandos: mover o emissário, ondas por tempo, objetivos de vários tipos. */
  function scripted(over = {}) {
    return baseMission({
      autoVictory: false, // a partida segue rodando para comparar muitos checksums
      defeatWhenWiped: false,
      vars: { waves: 0 },
      setup: [
        { type: 'spawn', owner: 'player', unitType: 'villager', x: -20, z: 8, tag: 'vip' },
        { type: 'spawn', owner: 'neutral', unitType: 'villager', count: 2, x: -26, z: 0, tag: 'cap' }
      ],
      objectives: [
        PRIMARY({ id: 'esc', type: 'escort', tag: 'vip', area: { x: -20, z: -4, r: 4 } }),
        { id: 'res', type: 'rescue', priority: 'primary', tag: 'cap', count: 2, title: 'Resgate' },
        { id: 'hold', type: 'survive', priority: 'secondary', seconds: 8, title: 'Resistir' }
      ],
      triggers: [
        { id: 'wave', once: false, when: { type: 'every', seconds: 4, start: 4 }, actions: [{ type: 'incVar', name: 'waves' }, { type: 'spawn', owner: 'bandits', unitType: 'bandit', count: 2, x: 20, z: 0, order: { kind: 'attackMove', x: -22, z: 12 } }] },
        { id: 'free', when: { type: 'area', owner: 'player', area: { x: -26, z: 0, r: 5 }, unitType: 'villager' }, actions: [{ type: 'transfer', select: { tag: 'cap' }, to: 'player' }] }
      ],
      ...over
    });
  }

  /** O "jogador" é um roteiro de comandos reproduzíveis (mandar o emissário e um aldeão aos destinos). */
  function player(gm) {
    const t = gm.currentTick;
    if (t === 10) {
      const vip = gm.entitiesById.get(gm.mission.tags.get('vip')[0]);
      gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [vip.id], x: -20, z: -4 });
      const other = gm.getUnitsOf(0).find((u) => u.type === 'villager' && u.id !== vip.id);
      gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [other.id], x: -26, z: 0 });
    }
  }

  const play = (gm, until) => {
    while (gm.currentTick < until && !gm.isGameOver) {
      player(gm);
      gm.simStep(0.05);
    }
  };

  it('mesma seed + mesmos comandos => mesmo checksum a cada 20 ticks', () => {
    const a = makeMissionGm(scripted());
    const b = makeMissionGm(scripted());
    play(a, 900);
    play(b, 900);
    expect(a.checksums.length).toBeGreaterThan(20);
    expect(b.checksums).toEqual(a.checksums);
    expect(a.mission.vars.waves).toBeGreaterThanOrEqual(3);
    expect(stateChecksum(b)).toBe(stateChecksum(a));
  });

  it('o estado da missão entra no checksum (variável diferente => hash diferente)', () => {
    const a = makeMissionGm(scripted());
    const b = makeMissionGm(scripted());
    play(a, 40);
    play(b, 40);
    expect(stateChecksum(a)).toBe(stateChecksum(b));
    b.mission.vars.waves = 77;
    expect(stateChecksum(b)).not.toBe(stateChecksum(a));
  });

  it('partidas comuns não mudam de checksum por causa do sistema de missões (sem parte "mission")', async () => {
    const { stateChecksumDetail } = await import('../../src/sim/checksum.js');
    const { makeGm } = await import('./helpers/aiWorld.js');
    const gm = makeGm({ seed: 3, allAI: true });
    gm.simStep(0.05);
    expect(gm.mission).toBeNull();
    expect(stateChecksumDetail(gm).parts.mission).toBeUndefined();
  });

  it('save/load: restaurar no meio da missão e continuar dá o mesmo estado', async () => {
    const { captureSave, restoreSync, parseSave, serializeSave } = await import('../../src/sim/SaveGame.js');
    const a = makeMissionGm(scripted());
    play(a, 500);
    const save = parseSave(serializeSave(captureSave(a, { name: 't' })));
    expect(save.config.victoryMode).toBe('mission');
    const b = makeMissionGm(save.config.mission, { seed: save.config.seed });
    const res = restoreSync(b, save);
    expect(res.ok).toBe(true);
    expect(b.mission.hashString()).toBe(a.mission.hashString());
    play(a, 900);
    play(b, 900);
    expect(b.checksums.filter((c) => c.tick > 500)).toEqual(a.checksums.filter((c) => c.tick > 500));
  });

  it('replay: gravar a missão e reproduzir confere todos os checksums e o desfecho', async () => {
    const { captureReplay, parseReplay, serializeReplay, playReplaySync } = await import('../../src/replay/Replay.js');
    const a = makeMissionGm(scripted({ autoVictory: true }));
    play(a, 800);
    expect(a.mission.outcome).toBe('victory'); // escoltou o emissário e resgatou os cativos
    const replay = parseReplay(serializeReplay(captureReplay(a)));
    const b = makeMissionGm(replay.config.mission, { seed: replay.config.seed });
    const r = playReplaySync(b, replay);
    expect(r.ok).toBe(true);
    expect(r.mismatch).toBeNull();
    expect(b.mission.outcome).toBe(a.mission.outcome);
    expect(b.mission.hashString()).toBe(a.mission.hashString());
  });
});
