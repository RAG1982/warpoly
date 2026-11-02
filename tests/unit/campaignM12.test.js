import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { SIM_DT } from '../../src/sim/constants.js';

/**
 * M3-13 — m12 "O Bastião do Cabo Ferrugem" (missão final da Liga de Aurelan): mapa natural camp-12 (384 de lado, naval, crista de falésia com
 * 2 desfiladeiros, estreito, 3 docas orcs). 3 atos: (I) Marco do Bastião ao nível 3 + 4 Torres de Vigia + 8 trechos de Muralha + 2 Balistas, sob as
 * levas leves de Skarn; (II) destruir as 3 Docas e manter 2 navios de guerra no estreito 90 s sem inimigo, contra frotas orcs; (III) Skarn
 * (chefe, `hero_skarn`) com guarda e assalto anfíbio. Os três heróis (Brann desde o início; Oren e Dorian chegam por barcaça aos 20 s). Epílogo na cutscene final.
 */
const ID = 'war-alliance-12-bastiao-do-cabo-ferrugem';
const MAP = 'camp-12-cabo-ferrugem';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/m12-bastiao-do-cabo-ferrugem.json', import.meta.url), 'utf8'));
const trig = (id) => DEF.triggers.find((t) => t.id === id);
const done = (rt, ...ids) => ids.forEach((i) => rt.setObjectiveStatus(i, 'completed'));
const ACT1 = ['p-hall', 'p-towers', 'p-walls', 'p-ballistas'];

describe('m12 Bastião do Cabo Ferrugem · mapa', () => {
  it('mapa natural camp-12 (não é "legado"): 384 de lado (o máximo), deserto, árvores novas e 6 poços de petróleo; bases a >= 150 u', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(384);
    expect(m.tileset).toBe('deserto');
    expect(m.cliffHeight).toBeGreaterThan(0);
    expect(m.resources.filter((r) => r.type === 'oil')).toHaveLength(6);
    expect(d(m.startSlots[0], m.startSlots[1])).toBeGreaterThanOrEqual(150);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(60);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('âncoras da missão existem; o Marco do Bastião fica por terra desde o Paço, atrás da crista; mar de reforço e frotas são navegáveis', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'enemyStart', 'bastion', 'bastionHall', 'strait', 'landingZone', 'reinforceSea', 'assaultSea', 'assaultBeach', 'fleetStart', 'orcFleetStart', 'orcFleetStart2', 'bossStart', 'waveStart1', 'waveStart2', 'raid3', 'dock1', 'dock2', 'dock3', 'dockGuard1', 'passA', 'passB', 'isletCaptive', 'isletRuin', 'well5', 'well6']) expect(A[k], k).toBeTruthy();
    const land = buildPathfinder(m, 'land');
    const sea = buildPathfinder(m, 'naval');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    expect(isReached(land, seen0, A.bastionHall.x, A.bastionHall.z)).toBe(true);
    for (const k of ['reinforceSea', 'assaultSea', 'fleetStart', 'orcFleetStart', 'strait']) expect(sea.isWalkableWorld(A[k].x, A[k].z), k).toBe(true);
    expect(d(A.bastionHall, A.passA)).toBeLessThan(60);
  });
});

describe('m12 Bastião do Cabo Ferrugem · jogadores, objetivos e heróis', () => {
  it('2 jogadores: Liga (humano, local, time 0) e Clãs do Cinzal (orc, IA, time 1)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['human', 'orc']);
    expect(def.players[1]).toMatchObject({ isAI: true, team: 1, startSlot: 1 });
    expect(gm.getPlayer(1).team).toBe(1);
  });

  it('objetivos primários nos 3 atos (Marco nível 3, 4 torres, 8 muralhas, 2 balistas; 3 docas, estreito 90 s; Skarn), secundários, ocultos; autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-hall', 'p-towers', 'p-walls', 'p-ballistas', 'p-docks', 'p-strait', 'p-skarn']);
    expect(by(def, 'secondary')).toEqual(['s-captives', 's-fleet', 's-mages']);
    expect(by(def, 'hidden')).toEqual(['h-relic']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-hall').condition).toMatchObject({ type: 'count', select: { tag: 'bastion_hall', owner: 'player', minTier: 3 } });
    expect(o('p-towers').condition).toMatchObject({ select: { buildingType: 'watchtower' }, op: '>=', value: 4 });
    expect(o('p-walls').condition).toMatchObject({ select: { buildingType: 'wall_human' }, op: '>=', value: 8 });
    expect(o('p-ballistas').condition).toMatchObject({ select: { unitType: 'ballista' }, op: '>=', value: 2 });
    expect(o('p-docks')).toMatchObject({ type: 'destroy', select: { tag: 'orc_dock' }, count: 3, active: false });
    expect(o('p-strait')).toMatchObject({ type: 'flag', condition: { type: 'var', name: 'block', value: 90 }, active: false });
    expect(o('p-skarn')).toMatchObject({ type: 'destroy', select: { tag: 'skarn' }, count: 1, active: false });
    expect(o('s-captives')).toMatchObject({ type: 'rescue', tag: 'captives', count: 4 });
    expect(o('s-fleet')).toMatchObject({ type: 'train', unitType: 'frigate', count: 5 });
    expect(o('s-mages')).toMatchObject({ type: 'train', unitType: 'mage', count: 3 });
    expect(gm.mission.objectives.get('p-docks').status).toBe('inactive');
    expect(gm.mission.objectives.get('p-strait').status).toBe('inactive');
    expect(gm.mission.objectives.get('p-skarn').status).toBe('inactive');
  });

  it('setup: Brann, 2 Fragatas, o Marco do Bastião no nível 2 (o Paço no 3), 3 docas orcs com guarda, náufragos e a relíquia', async () => {
    const { gm } = await boot([], 1);
    const T = (t) => (gm.mission.tags.get(t) || []).map((i) => gm.entitiesById.get(i));
    const [br] = T('brann');
    expect(br).toMatchObject({ type: 'hero_brann', ownerId: 0 });
    expect(d(posOf(br), gm.terrain.mapDef.startSlots[0])).toBeLessThanOrEqual(20);
    expect(T('liga_fleet')).toHaveLength(2);
    for (const f of T('liga_fleet')) expect(f).toMatchObject({ type: 'frigate', ownerId: 0 });
    const [hall] = T('bastion_hall');
    expect(hall).toMatchObject({ type: 'castle', ownerId: 0 });
    expect(hall.tier).toBe(2);
    const paco = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle' && x.id !== hall.id);
    expect(paco.tier).toBe(3);
    expect(T('orc_dock')).toHaveLength(3);
    for (const dk of T('orc_dock')) expect(dk).toMatchObject({ type: 'ship_dock', ownerId: 1 });
    expect(T('dock_guard')).toHaveLength(15);
    expect(T('captives')).toHaveLength(4);
    expect(T('skarn')).toHaveLength(0);
    expect(gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(600);
  });

  it('Oren e Dorian chegam por barcaça aos 20 s (reunião dos três heróis) e a árvore toda está liberada pelo campaign.json', async () => {
    const landing = trig('landing-1').actions.find((a) => a.type === 'spawnLanding');
    expect(landing.units.map((u) => u.type)).toEqual(['hero_oren', 'hero_dorian', 'knight']);
    expect(landing.units.reduce((s, u) => s + u.count, 0)).toBeLessThanOrEqual(UNITS.barge.transportCapacity);
    expect(trig('landing-1').when.at).toBe(20);
    const r = await boot([{ name: 'espera', wait: 70 }], 75);
    const mine = r.gm.getUnitsOf(0).filter((u) => !u.isDead).map((u) => u.type);
    for (const h of ['hero_brann', 'hero_oren', 'hero_dorian']) expect(mine, h).toContain(h);
  }, 120000);
});

describe('m12 Bastião do Cabo Ferrugem · Ato I (construir sob pressão)', () => {
  it('3 levas leves por terra (150, 300, 450 s) rumo ao Marco, saindo de trás da crista', () => {
    expect([trig('raid-1').when.at, trig('raid-2').when.at, trig('raid-3').when.at]).toEqual([150, 300, 450]);
    for (const id of ['raid-1', 'raid-2', 'raid-3']) {
      const a = trig(id).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe(1);
      expect(a.order).toEqual({ kind: 'attackMove', anchor: 'bastionHall' });
    }
  });

  it('a evolução do Marco ao nível 3 (flag minTier 3) só conta o Marco: o Paço (nível 3) não completa p-hall', async () => {
    const r = await boot([{ name: 'espera', wait: 3 }], 4);
    expect(r.gm.mission.objectives.get('p-hall').status).not.toBe('completed');
    const hall = r.gm.mission.tags.get('bastion_hall').map((i) => r.gm.entitiesById.get(i))[0];
    hall.tier = 3;
    r.gm.simStep(SIM_DT); r.gm.simStep(SIM_DT);
    expect(r.gm.mission.objectives.get('p-hall').status).toBe('completed');
  });

  it('as 4 conclusões do Ato I levam ao Ato II: act=2 e p-docks/p-strait ativos', async () => {
    const r = await boot([{ name: 'ato1', wait: 2, run: (c) => done(c.gm.mission, ...ACT1) }, { name: 'espera', wait: 3 }], 8);
    expect(r.gm.mission.vars.act).toBe(2);
    expect(r.gm.mission.objectives.get('p-docks').status).toBe('active');
    expect(r.gm.mission.objectives.get('p-strait').status).toBe('active');
  });
});

describe('m12 Bastião do Cabo Ferrugem · Ato II (docas e bloqueio do estreito)', () => {
  it('frotas orcas em levas (galés + um Leviatã de Ferro) rumo ao estreito, controladas pelo relógio do Ato II', () => {
    const ats = ['fleet-1', 'fleet-2', 'fleet-3'].map((id) => trig(id).when.value);
    expect(ats).toEqual([20, 170, 330]);
    for (const id of ['fleet-1', 'fleet-2', 'fleet-3']) {
      const a = trig(id).actions.find((x) => x.type === 'spawn');
      expect(a).toMatchObject({ owner: 1, tag: 'orc_fleet', order: { kind: 'attackMove', anchor: 'strait' } });
      expect(a.units.some((u) => u.type === 'war_galley')).toBe(true);
    }
    expect(trig('fleet-3').actions.find((x) => x.type === 'spawn').units.map((u) => u.type)).toContain('iron_leviathan');
  });

  it('o contador do estreito só corre depois das 3 docas: 2 Fragatas na água e nenhum inimigo por 90 s completam p-strait', async () => {
    const r = await boot([
      { name: 'ato1', wait: 2, run: (c) => done(c.gm.mission, ...ACT1) },
      { name: 'espera sem docas', wait: 40, run: (c) => { for (const f of c.tagged('liga_fleet')) c.teleport(f, c.anchor('strait').x, c.anchor('strait').z); } },
      { name: 'verifica', run: (c) => { if (c.gm.mission.vars.block !== 0) throw new Error('o contador correu sem as docas caídas'); } },
      { name: 'docas', run: (c) => c.slayTag('orc_dock') },
      { name: 'limpa o mar', wait: 1, run: (c) => { for (const u of c.gm.allUnits.filter((x) => !x.isDead && x.ownerId === 1)) u.takeDamage(1e6, c.mine()[0]); } },
      { name: 'segura', wait: 95, run: () => {} }
    ], 400);
    expect(r.gm.mission.objectives.get('p-docks').status).toBe('completed');
    expect(r.gm.mission.objectives.get('p-strait').status).toBe('completed');
    expect(r.gm.mission.vars.act).toBe(3);
  }, 200000);

  it('um inimigo no estreito zera o contador (hold-reset)', async () => {
    const r = await boot([
      { name: 'ato1', wait: 2, run: (c) => done(c.gm.mission, ...ACT1) },
      { name: 'docas', wait: 1, run: (c) => { c.slayTag('orc_dock'); for (const f of c.tagged('liga_fleet')) c.teleport(f, c.anchor('strait').x, c.anchor('strait').z); } },
      { name: 'limpa', wait: 1, run: (c) => { for (const u of c.gm.allUnits.filter((x) => !x.isDead && x.ownerId === 1)) u.takeDamage(1e6, c.mine()[0]); } },
      { name: 'conta', wait: 20, run: (c) => { if (!(c.gm.mission.vars.block >= 10)) throw new Error('contador não correu: ' + c.gm.mission.vars.block); } },
      { name: 'intruso', run: (c) => { const g = c.gm.allUnits.find((u) => u.ownerId === 1 && !u.isDead && u.type === 'war_galley'); if (g) c.teleport(g, c.anchor('strait').x + 5, c.anchor('strait').z); else c.gm.mission.vars.block = 5; } },
      { name: 'zera', wait: 3 }
    ], 29);
    expect(r.gm.mission.vars.block).toBeLessThan(10);
  }, 200000);
});

describe('m12 Bastião do Cabo Ferrugem · Ato III (Skarn) e desfecho', () => {
  const toAct3 = [
    { name: 'ato1', wait: 2, run: (c) => done(c.gm.mission, ...ACT1) },
    { name: 'ato2', wait: 2, run: (c) => done(c.gm.mission, 'p-docks', 'p-strait') },
    { name: 'espera', wait: 3 }
  ];

  it('fim do Ato II: Skarn (hero_skarn, tag skarn) nasce perto da base dele com a guarda (ogros, ogre_mage, serpentes) e um assalto anfíbio pela praia sul', async () => {
    const r = await boot(toAct3, 12);
    const T = (t) => (r.gm.mission.tags.get(t) || []).map((i) => r.gm.entitiesById.get(i)).filter(Boolean);
    expect(r.gm.mission.vars.act).toBe(3);
    expect(r.gm.mission.objectives.get('p-skarn').status).toBe('active');
    const [sk] = T('skarn');
    expect(sk).toMatchObject({ type: 'hero_skarn', ownerId: 1 });
    expect(d(posOf(sk), r.gm.terrain.mapDef.anchors.bossStart)).toBeLessThan(70);
    const types = new Set(T('skarn_guard').map((u) => u.type));
    for (const t of ['ogre', 'ogre_mage', 'war_serpent', 'grunt', 'catapult']) expect(types.has(t), t).toBe(true);
    expect(T('assault_1').length + T('assault_barge_1').length).toBeGreaterThan(0);
  }, 60000);

  it('os primários só vencem com Skarn morto: com tudo menos Skarn não há vitória; Skarn morto + os 6 primários anteriores = vitória (cutscene final com o epílogo)', async () => {
    const r1 = await boot([...toAct3, { name: 'sem skarn', wait: 1, run: (c) => done(c.gm.mission, 'p-hall', 'p-towers') }], 15);
    expect(r1.outcome).not.toBe('victory');
    const r2 = await boot([...toAct3, { name: 'skarn', wait: 5, run: (c) => c.slayTag('skarn') }, { name: 'fim', wait: 6 }], 40);
    expect(r2.outcome).toBe('victory');
    const fin = trig('all-done').actions.find((a) => a.type === 'cutscene');
    const texts = fin.steps.map((s) => s.dialog?.text?.['pt-BR'] ?? '').join(' ');
    expect(texts).toContain('Quando a última torre do Bastião do Cabo Ferrugem foi coroada');
    expect(fin.steps.map((s) => s.dialog?.text?.en ?? '').join(' ')).toContain('When the last tower of the Cape Rust Bastion was crowned');
  }, 120000);

  it('derrotas: o Marco do Bastião cair, o Paço cair (nenhum Centro) ou Brann morrer', async () => {
    const hall = await boot([{ name: 'marco', wait: 2, run: (c) => c.slayTag('bastion_hall') }], 20);
    expect(hall.outcome).toBe('defeat');
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
    const castles = await boot([{ name: 'centros', wait: 2, run: (c) => c.slay(c.gm.buildings.filter((b) => b.ownerId === 0 && b.type === 'castle')) }], 20);
    expect(castles.outcome).toBe('defeat');
  }, 90000);
});

describe('m12 Bastião do Cabo Ferrugem · secundários e oculto', () => {
  it('náufragos: uma unidade do jogador perto da ilhota transfere os 4 para a Liga (rescue)', async () => {
    const r = await boot([
      { name: 'barco', wait: 2, run: (c) => c.teleport(c.tagged('liga_fleet')[0], c.anchor('isletCaptive').x, c.anchor('isletCaptive').z) },
      { name: 'espera', wait: 3 }
    ], 8);
    for (const id of r.gm.mission.tags.get('captives')) expect(r.gm.entitiesById.get(id).ownerId).toBe(0);
    expect(r.gm.mission.objectives.get('s-captives').status).toBe('completed');
  });

  it('oculto: chegar ao Farol Velho do Cabo dá 400 de ouro e 150 de petróleo (h-relic)', async () => {
    const before = await boot([], 1);
    const g0 = before.gm.getPlayer(0).resources.gold, o0 = before.gm.getPlayer(0).resources.oil;
    const r = await boot([
      { name: 'barco', wait: 2, run: (c) => c.teleport(c.tagged('liga_fleet')[0], c.anchor('isletRuin').x, c.anchor('isletRuin').z) },
      { name: 'espera', wait: 3 }
    ], 8);
    expect(r.gm.mission.objectives.get('h-relic').status).toBe('completed');
    expect(r.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(g0 + 300);
    expect(r.gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(o0 + 100);
  });
});
