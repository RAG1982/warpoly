import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { UNITS } from '../../src/data/units.js';
import { rush, noArmy } from '../fixtures/campaign-playthrough/war-horde-11-brasa-alta.js';

/**
 * M4-11 (espelho da M3-12) — m11 da Horda "Brasa-Alta" (mapa `camp-11-savana-de-ambar`, 352 de lado, savana). Os Clãs do Cinzal defendem a colônia: o Marco
 * (`great_hall` na praia, tag `colony`, nível 1) e o Salão do clã no interior (nível 3). Primários: evoluir o Marco a Bastião (nível 2), resistir 12 min
 * (3 incursões: 4, 7 e 10 min, a última com Lyra e grifos) e afundar as 8 fragatas da esquadra de cerco (duas levas, 8 e 12 min). Secundários: Covil de
 * Ogros e Ninho de Serpes. Oculto: converter o posto avançado da Liga (rescue). Reforços por mar a cada 4 min (4 barcaças); Skarn chega na 2ª onda (480 s);
 * Drogath guarda o Salão (sua morte é derrota), Vozgul e Grok (NPC) ficam na colônia. O playthrough do robô está em
 * tests/fixtures/campaign-playthrough/war-horde-11-brasa-alta.js.
 */
const ID = 'war-horde-11-brasa-alta';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-horde/m11-brasa-alta.json', import.meta.url), 'utf8'));
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-horde/campaign.json', import.meta.url), 'utf8'));
const trig = (id) => DEF.triggers.find((t) => t.id === id);
const tagged = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i)).filter(Boolean);

describe('m11 Brasa-Alta · a missão', () => {
  it('mapa camp-11-savana-de-ambar (savana, 352); âncoras da missão existem; o Marco fica na praia e a esquadra de cerco nasce no mar', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    expect(m.id).toBe('camp-11-savana-de-ambar');
    expect(m.size).toBe(352);
    expect(m.tileset).toBe('savana');
    for (const k of ['playerStart', 'enemyStart', 'colonyMark', 'landingZone', 'reinforceSea', 'siegeFleetStart', 'siegeFleetStart2', 'raid1', 'raid2', 'raid3', 'dissidentClan', 'expansion1', 'well1']) expect(A[k], k).toBeTruthy();
    expect(d(A.colonyMark, A.landingZone)).toBeLessThanOrEqual(22);
    expect(DEF.autoVictory).toBe(false);
  });

  it('2 jogadores: Clãs do Cinzal (orc, local, time 0) e Liga de Aurelan (humano, IA, time 1)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['orc', 'human']);
    expect(def.players[0]).toMatchObject({ isLocal: true, team: 0, startSlot: 0 });
    expect(def.players[1]).toMatchObject({ isAI: true, team: 1, startSlot: 1 });
    expect(gm.getPlayer(1).team).toBe(1);
  });

  it('objetivos: primários (Marco nível 2, 12 min, 8 fragatas), secundários (Covil, Ninho), oculto (posto da Liga); Skarn liberado nesta missão', () => {
    expect(by(DEF, 'primary')).toEqual(['p-colony', 'p-hold', 'p-fleet']);
    expect(by(DEF, 'secondary')).toEqual(['s-den', 's-nest']);
    expect(by(DEF, 'hidden')).toEqual(['h-post']);
    const o = (id) => DEF.objectives.find((x) => x.id === id);
    expect(o('p-colony')).toMatchObject({ type: 'flag', condition: { type: 'count', select: { tag: 'colony', owner: 'player', minTier: 2 } } });
    expect(o('p-hold')).toMatchObject({ type: 'survive', seconds: 720 });
    expect(o('p-fleet')).toMatchObject({ type: 'destroy', select: { tag: 'siege_fleet' }, count: 8 });
    expect(o('s-den')).toMatchObject({ type: 'build', buildingType: 'ogre_den', count: 1 });
    expect(o('s-nest')).toMatchObject({ type: 'build', buildingType: 'serpent_nest', count: 1 });
    expect(o('h-post')).toMatchObject({ type: 'rescue', tag: 'outpost_folk', count: 3 });
    expect(campaign.missions.find((m) => m.id === ID).unlocks.heroes).toEqual(['hero_skarn']);
  });

  it('o Salão do interior nasce no nível 3 e o Marco (great_hall com tag colony) no nível 1 junto da praia; o setTier poupa o Marco', async () => {
    const { gm } = await boot();
    const [marco] = tagged(gm, 'colony');
    expect(marco).toMatchObject({ type: 'great_hall', ownerId: 0 });
    expect(marco.tier).toBe(1);
    expect(d(pos(marco), gm.terrain.mapDef.anchors.colonyMark)).toBeLessThan(5);
    const hall = tagged(gm, 'home_hall')[0];
    expect(hall).toMatchObject({ type: 'great_hall', ownerId: 0 });
    expect(hall.id).not.toBe(marco.id);
    expect(hall.tier).toBe(3);
    expect(trig('full-tree').actions[0]).toMatchObject({ type: 'setTier', tier: 3, exceptTag: 'colony' });
  });

  it('heróis: Drogath no Salão e Vozgul na colônia desde o início, Grok (Ogro Feiticeiro) na colônia; Skarn chega pela 3ª barcaça', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const dr = tagged(gm, 'drogath')[0];
    expect(dr).toMatchObject({ type: 'hero_drogath', ownerId: 0 });
    expect(d(pos(dr), A.playerStart)).toBeLessThanOrEqual(20);
    const vz = tagged(gm, 'vozgul')[0];
    expect(vz).toMatchObject({ type: 'hero_vozgul', ownerId: 0 });
    expect(d(pos(vz), A.colonyMark)).toBeLessThanOrEqual(12);
    const gk = tagged(gm, 'grok')[0];
    expect(gk).toMatchObject({ type: 'ogre_mage', ownerId: 0 });
    expect(tagged(gm, 'skarn_wave')).toHaveLength(0);
    const landing = trig('landing-3').actions.find((a) => a.type === 'spawnLanding');
    expect(landing.units[0]).toEqual({ type: 'hero_skarn', count: 1 });
    expect(landing.tag).toBe('skarn_wave');
  });
});

describe('m11 Brasa-Alta · ondas e reforços', () => {
  it('reforços por mar: barcaças aos 0, 240, 480 e 720 s (4 ao todo), até 6 tropas cada (cabe na barcaça), desembarcando na praia do Marco', () => {
    const cap = UNITS.barge.transportCapacity;
    const landings = DEF.triggers.flatMap((t) => t.actions.filter((a) => a.type === 'spawnLanding').map((a) => ({ at: t.when?.at ?? 0, a })));
    expect(landings.map((x) => x.at).sort((x, y) => x - y)).toEqual([0, 240, 480, 720]);
    for (const { a } of landings) {
      expect(a.owner).toBe('player');
      expect(a.unloadAt).toEqual({ anchor: 'landingZone' });
      expect(a.units.reduce((s, u) => s + u.count, 0)).toBeLessThanOrEqual(cap);
    }
  });

  it('incursões de Aurelan aos 240, 420 e 600 s (rotas raid1–3, com Lyra e grifos na última) e a esquadra de cerco aos 480 e 720 s (tag siege_fleet, 8 fragatas)', () => {
    expect([trig('raid-1').when.at, trig('raid-2').when.at, trig('raid-3').when.at]).toEqual([240, 420, 600]);
    const raid3 = trig('raid-3').actions.filter((a) => a.type === 'spawn');
    expect(raid3.find((a) => a.unitType === 'gryphon_rider')).toMatchObject({ owner: 1, tag: 'lyra' });
    expect(raid3.some((a) => a.units?.some((u) => u.type === 'gryphon_rider'))).toBe(true);
    for (const id of ['fleet-1', 'fleet-2']) {
      const a = trig(id).actions.find((x) => x.type === 'spawn');
      expect(a).toMatchObject({ owner: 1, tag: 'siege_fleet' });
      expect(a.units[0].type).toBe('frigate');
      expect(a.order.kind).toBe('attackMove');
    }
    expect([trig('fleet-1').when.at, trig('fleet-2').when.at]).toEqual([480, 720]);
    expect(trig('fleet-1').actions[0].units[0].count + trig('fleet-2').actions[0].units[0].count).toBe(8);
  });

  it('a primeira barcaça já desembarca 6 guerreiros na praia no início (e Vozgul, Grok e o Marco estão lá)', async () => {
    const run = await boot([{ name: 'espera', wait: 100 }], 100);
    const reinf = tagged(run.gm, 'reinf_1');
    expect(reinf.length).toBeGreaterThanOrEqual(1);
    expect(reinf.every((u) => u.ownerId === 0)).toBe(true);
  }, 60000);

  it('o posto avançado da Liga: 3 homens neutros guardados por 4 bandidos; os guardas caírem passa os 3 ao jogador (oculto h-post)', async () => {
    const { gm } = await boot();
    expect(tagged(gm, 'outpost_folk')).toHaveLength(3);
    for (const c of tagged(gm, 'outpost_folk')) expect(c).toMatchObject({ type: 'villager', ownerId: -1 });
    expect(tagged(gm, 'outpost_guard')).toHaveLength(4);
    expect(trig('post-free').when).toMatchObject({ type: 'dead', count: 4 });
    const r = await boot([{ name: 'guardas', wait: 2, run: (c) => c.slayTag('outpost_guard') }, { name: 'f', wait: 3 }], 12);
    for (const id of r.gm.mission.tags.get('outpost_folk')) expect(r.gm.entitiesById.get(id).ownerId).toBe(0);
    expect(r.gm.mission.objectives.get('h-post').status).toBe('completed');
    expect(r.outcome).toBeNull();
  }, 60000);
});

describe('m11 Brasa-Alta · desfecho', () => {
  it('derrotas: o Salão do clã, o Marco ou Drogath caírem é derrota; Vozgul, Skarn e Grok morrerem não são', async () => {
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.slayTag('home_hall') }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const marco = await boot([{ name: 'marco', wait: 2, run: (c) => c.slayTag('colony') }], 20);
    expect(marco.outcome).toBe('defeat');
    expect(marco.gm.mission.outcomeText['pt-BR']).toMatch(/Marco/);
    const dr = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const vz = await boot([{ name: 'm', wait: 2, run: (c) => { c.slayTag('vozgul'); c.slayTag('grok'); } }], 12);
    expect(vz.outcome).toBeNull();
  }, 180000);

  it('vitória pelos três primários (cutscene final); as secundárias e a oculta não decidem; evoluir o Marco sem resistir nem afundar a esquadra não vence', async () => {
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of ['s-den', 's-nest', 'h-post']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const parcial = await boot([{ name: 'p', wait: 1, run: (c) => { for (const i of ['p-colony', 'p-fleet']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }, { name: 'f', wait: 5 }], 30);
    expect(parcial.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of ['p-colony', 'p-hold', 'p-fleet']) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
  }, 120000);

  it('o Marco evoluído (UPGRADE_HQ no Marco, não no Salão do interior) conclui p-colony', async () => {
    const run = await boot([
      { name: 'recursos', wait: 1, run: (c) => { if (c.status('p-colony') === 'completed') throw new Error('cedo'); c.give({ gold: 1500, wood: 600, stone: 500 }); } },
      { name: 'evolui', run: (c) => c.issue({ type: c.CMD.UPGRADE_HQ, buildingId: c.tagged('colony')[0].id }) },
      { name: 'f', wait: 90 }
    ], 120);
    expect(run.gm.mission.objectives.get('p-colony').status).toBe('completed');
    expect(run.outcome).toBeNull();
  }, 120000);
});

describe('m11 Brasa-Alta · dificuldade', () => {
  it('investida precoce (a tropa do início ataca a base de Aurelan e abandona a colônia): não vence em 10 min', async () => {
    const run = await boot(rush, 650);
    expect(run.outcome).not.toBe('victory');
  }, 180000);

  it('roteiro só de economia (sem tropa, sem frota, sem ataque): não vence em 15 min', async () => {
    const run = await boot(noArmy, 900);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-fleet').status).not.toBe('completed');
  }, 240000);
});
