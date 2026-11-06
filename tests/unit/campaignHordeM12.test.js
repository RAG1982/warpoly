import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { rush, noArmy, lose } from '../fixtures/campaign-playthrough/war-horde-12-cidadela-de-brasa-alta.js';

/**
 * M4-12 (espelho da M3-13) — m12 da Horda "A Cidadela de Brasa-Alta" (missão final dos Clãs do Cinzal): mapa natural camp-12-cabo-aurora-leste (384 de lado, naval,
 * crista de falésia com 2 desfiladeiros, estreito, 3 Docas humanas). 3 atos: (I) Marco da Cidadela ao nível 3 + 4 Torres de Vigia + 8 trechos de Paliçada de Ferro
 * + 2 Catapultas, sob as levas leves de Aurelan; (II) destruir as 3 Docas e manter 2 galés no estreito 90 s sem inimigo, contra frotas humanas; (III) o Marechal
 * Dorian (chefe, `hero_dorian`) com guarda e assalto anfíbio: cai OU foge ferido para a base (guarda partida). Os três heróis (Drogath desde o início; Vozgul e Skarn
 * chegam por barcaça aos 20 s); Grok (Ogro Feiticeiro nomeado) desde o início. Epílogo na cutscene final. O playthrough do robô está em
 * tests/fixtures/campaign-playthrough/war-horde-12-cidadela-de-brasa-alta.js.
 */
const ID = 'war-horde-12-cidadela-de-brasa-alta';
const MAP = 'camp-12-cabo-aurora-leste';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-horde/m12-cidadela-de-brasa-alta.json', import.meta.url), 'utf8'));
const trig = (id) => DEF.triggers.find((t) => t.id === id);
const done = (rt, ...ids) => ids.forEach((i) => rt.setObjectiveStatus(i, 'completed'));
const ACT1 = ['p-hall', 'p-towers', 'p-walls', 'p-catapults'];
const T = (gm, t) => (gm.mission.tags.get(t) || []).map((i) => gm.entitiesById.get(i)).filter(Boolean);

describe('m12 Cidadela de Brasa-Alta · mapa', () => {
  it('mapa natural camp-12 (não é "legado"): 384 de lado (o máximo), tileset exuberante, árvores novas e 6 poços de petróleo; bases a >= 150 u', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(384);
    expect(m.tileset).toBe('exuberante');
    expect(m.cliffHeight).toBeGreaterThan(0);
    expect(m.resources.filter((r) => r.type === 'oil')).toHaveLength(6);
    expect(d(m.startSlots[0], m.startSlots[1])).toBeGreaterThanOrEqual(150);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(60);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('âncoras da missão existem; o Marco da Cidadela fica por terra desde o Salão, atrás da crista; mar de reforço, frotas e poços do robô são navegáveis', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'enemyStart', 'bastion', 'bastionHall', 'strait', 'landingZone', 'reinforceSea', 'assaultSea', 'assaultBeach', 'fleetStart', 'orcFleetStart', 'orcFleetStart2', 'bossStart', 'waveStart1', 'waveStart2', 'raid3', 'dock1', 'dock2', 'dock3', 'dockGuard1', 'dockGuard2', 'dockGuard3', 'passA', 'passB', 'isletCaptive', 'isletRuin', 'well2', 'well4']) expect(A[k], k).toBeTruthy();
    const land = buildPathfinder(m, 'land');
    const sea = buildPathfinder(m, 'naval');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    expect(isReached(land, seen0, A.bastionHall.x, A.bastionHall.z)).toBe(true);
    expect(isReached(land, seen0, A.raid3.x, A.raid3.z)).toBe(true); // o Farol do Cabo alcança-se por terra
    for (const k of ['reinforceSea', 'assaultSea', 'fleetStart', 'orcFleetStart', 'strait']) expect(sea.isWalkableWorld(A[k].x, A[k].z), k).toBe(true);
    expect(d(A.bastionHall, A.passA)).toBeLessThan(60);
  });
});

describe('m12 Cidadela de Brasa-Alta · jogadores, objetivos e heróis', () => {
  it('2 jogadores: Clãs do Cinzal (orc, local, time 0) e Tropas de Aurelan (humano, IA, time 1)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['orc', 'human']);
    expect(def.players[1]).toMatchObject({ isAI: true, team: 1, startSlot: 1 });
    expect(gm.getPlayer(1).team).toBe(1);
    expect(gm.isHostile(0, 1)).toBe(true);
  });

  it('objetivos primários nos 3 atos (Marco nível 3, 4 torres, 8 paliçadas, 2 catapultas; 3 docas, estreito 90 s; Dorian), secundários, ocultos; autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-hall', 'p-towers', 'p-walls', 'p-catapults', 'p-docks', 'p-strait', 'p-dorian']);
    expect(by(def, 'secondary')).toEqual(['s-farol', 's-captives', 's-fleet']);
    expect(by(def, 'hidden')).toEqual(['h-fire', 'h-palisade']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-hall').condition).toMatchObject({ type: 'count', select: { tag: 'bastion_hall', owner: 'player', minTier: 3 } });
    expect(o('p-towers').condition).toMatchObject({ select: { buildingType: 'orc_watchtower' }, op: '>=', value: 4 });
    expect(o('p-walls').condition).toMatchObject({ select: { buildingType: 'wall_orc' }, op: '>=', value: 8 });
    expect(o('p-catapults').condition).toMatchObject({ select: { unitType: 'catapult' }, op: '>=', value: 2 });
    expect(o('p-docks')).toMatchObject({ type: 'destroy', select: { tag: 'human_dock' }, count: 3, active: false });
    expect(o('p-strait')).toMatchObject({ type: 'flag', condition: { type: 'var', name: 'block', value: 90 }, active: false });
    expect(o('p-dorian')).toMatchObject({ type: 'flag', active: false });
    expect(o('s-farol')).toMatchObject({ type: 'destroy', select: { tag: 'farol' }, count: 1 });
    expect(o('s-captives')).toMatchObject({ type: 'rescue', tag: 'captives', count: 4 });
    expect(o('s-fleet')).toMatchObject({ type: 'train', unitType: 'war_galley', count: 5 });
    for (const id of ['p-docks', 'p-strait', 'p-dorian']) expect(gm.mission.objectives.get(id).status).toBe('inactive');
  });

  it('setup: Drogath e Grok, 2 galés, o Marco da Cidadela no nível 2 (o Salão no 3), 3 docas humanas com guarda, o Farol do Cabo, náufragos e a Fogueira dos Antigos', async () => {
    const { gm } = await boot([], 1);
    const [dro] = T(gm, 'drogath');
    expect(dro).toMatchObject({ type: 'hero_drogath', ownerId: 0 });
    expect(d(posOf(dro), gm.terrain.mapDef.startSlots[0])).toBeLessThanOrEqual(20);
    const [grok] = T(gm, 'grok');
    expect(grok).toMatchObject({ type: 'ogre_mage', ownerId: 0 });
    expect(T(gm, 'clan_fleet')).toHaveLength(2);
    for (const f of T(gm, 'clan_fleet')) expect(f).toMatchObject({ type: 'war_galley', ownerId: 0 });
    const [hall] = T(gm, 'bastion_hall');
    expect(hall).toMatchObject({ type: 'great_hall', ownerId: 0 });
    expect(hall.tier).toBe(2);
    const salao = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'great_hall' && x.id !== hall.id);
    expect(salao.tier).toBe(3);
    expect(T(gm, 'human_dock')).toHaveLength(3);
    for (const dk of T(gm, 'human_dock')) expect(dk).toMatchObject({ type: 'shipyard', ownerId: 1 });
    expect(T(gm, 'dock_guard')).toHaveLength(24);
    expect(T(gm, 'farol')).toHaveLength(1);
    expect(T(gm, 'farol')[0]).toMatchObject({ type: 'watchtower', ownerId: 1 });
    expect(T(gm, 'farol_guard')).toHaveLength(5);
    expect(T(gm, 'captives')).toHaveLength(4);
    expect(T(gm, 'dorian')).toHaveLength(0);
    expect(gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(600);
  });

  it('Vozgul e Skarn chegam por barcaça aos 20 s (reunião dos três heróis) e a árvore toda está liberada pelo campaign.json', async () => {
    const landing = trig('landing-1').actions.find((a) => a.type === 'spawnLanding');
    expect(landing.units.map((u) => u.type)).toEqual(['hero_vozgul', 'hero_skarn', 'ogre']);
    expect(landing.units.reduce((s, u) => s + u.count, 0)).toBeLessThanOrEqual(UNITS.barge.transportCapacity);
    expect(trig('landing-1').when.at).toBe(20);
    const r = await boot([{ name: 'espera', wait: 70 }], 75);
    const mine = r.gm.getUnitsOf(0).filter((u) => !u.isDead).map((u) => u.type);
    for (const h of ['hero_drogath', 'hero_vozgul', 'hero_skarn']) expect(mine, h).toContain(h);
  }, 120000);
});

describe('m12 Cidadela de Brasa-Alta · Ato I (construir sob pressão)', () => {
  it('3 levas leves por terra (150, 300, 450 s) rumo ao Marco, saindo de trás da crista', () => {
    expect([trig('raid-1').when.at, trig('raid-2').when.at, trig('raid-3').when.at]).toEqual([150, 300, 450]);
    for (const id of ['raid-1', 'raid-2', 'raid-3']) {
      const a = trig(id).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe(1);
      expect(a.order).toEqual({ kind: 'attackMove', anchor: 'bastionHall' });
    }
  });

  it('a evolução do Marco ao nível 3 (flag minTier 3) só conta o Marco: o Salão (nível 3) não completa p-hall', async () => {
    const r = await boot([{ name: 'espera', wait: 3 }], 4);
    expect(r.gm.mission.objectives.get('p-hall').status).not.toBe('completed');
    const hall = T(r.gm, 'bastion_hall')[0];
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

describe('m12 Cidadela de Brasa-Alta · Ato II (docas e bloqueio do estreito)', () => {
  it('frotas humanas em levas (fragatas + um Couraçado) rumo ao estreito, controladas pelo relógio do Ato II', () => {
    const ats = ['fleet-1', 'fleet-2', 'fleet-3'].map((id) => trig(id).when.value);
    expect(ats).toEqual([20, 170, 330]);
    for (const id of ['fleet-1', 'fleet-2', 'fleet-3']) {
      const a = trig(id).actions.find((x) => x.type === 'spawn');
      expect(a).toMatchObject({ owner: 1, tag: 'human_fleet', order: { kind: 'attackMove', anchor: 'strait' } });
      expect(a.units.some((u) => u.type === 'frigate')).toBe(true);
    }
    expect(trig('fleet-3').actions.find((x) => x.type === 'spawn').units.map((u) => u.type)).toContain('dreadnought');
  });

  it('o contador do estreito só corre depois das 3 docas: 2 galés na água e nenhum inimigo por 90 s completam p-strait', async () => {
    const r = await boot([
      { name: 'ato1', wait: 2, run: (c) => done(c.gm.mission, ...ACT1) },
      { name: 'espera sem docas', wait: 40, run: (c) => { for (const f of c.tagged('clan_fleet')) c.teleport(f, c.anchor('strait').x, c.anchor('strait').z); } },
      { name: 'verifica', run: (c) => { if (c.gm.mission.vars.block !== 0) throw new Error('o contador correu sem as docas caídas'); } },
      { name: 'docas', run: (c) => c.slayTag('human_dock') },
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
      { name: 'docas', wait: 1, run: (c) => { c.slayTag('human_dock'); for (const f of c.tagged('clan_fleet')) c.teleport(f, c.anchor('strait').x, c.anchor('strait').z); } },
      { name: 'limpa', wait: 1, run: (c) => { for (const u of c.gm.allUnits.filter((x) => !x.isDead && x.ownerId === 1)) u.takeDamage(1e6, c.mine()[0]); } },
      { name: 'conta', wait: 20, run: (c) => { if (!(c.gm.mission.vars.block >= 10)) throw new Error('contador não correu: ' + c.gm.mission.vars.block); } },
      { name: 'intruso', run: (c) => { const g = c.gm.allUnits.find((u) => u.ownerId === 1 && !u.isDead && u.type === 'frigate'); if (g) c.teleport(g, c.anchor('strait').x + 5, c.anchor('strait').z); else c.gm.mission.vars.block = 5; } },
      { name: 'zera', wait: 3 }
    ], 29);
    expect(r.gm.mission.vars.block).toBeLessThan(10);
  }, 200000);
});

describe('m12 Cidadela de Brasa-Alta · Ato III (Dorian: queda ou fuga) e desfecho', () => {
  const toAct3 = [
    { name: 'ato1', wait: 2, run: (c) => done(c.gm.mission, ...ACT1) },
    { name: 'ato2', wait: 2, run: (c) => done(c.gm.mission, 'p-docks', 'p-strait') },
    { name: 'espera', wait: 3 }
  ];

  it('fim do Ato II: Dorian (hero_dorian, tag dorian) nasce perto da base dele com a guarda (cavaleiros, magos, grifos, balistas) e um assalto anfíbio pela praia sul', async () => {
    const r = await boot(toAct3, 12);
    expect(r.gm.mission.vars.act).toBe(3);
    expect(r.gm.mission.objectives.get('p-dorian').status).toBe('active');
    const [dor] = T(r.gm, 'dorian');
    expect(dor).toMatchObject({ type: 'hero_dorian', ownerId: 1 });
    expect(d(posOf(dor), r.gm.terrain.mapDef.anchors.bossStart)).toBeLessThan(70);
    const types = new Set(T(r.gm, 'dorian_guard').map((u) => u.type));
    for (const t of ['cavalier', 'mage', 'gryphon_rider', 'knight', 'ballista']) expect(types.has(t), t).toBe(true);
    expect(T(r.gm, 'assault_1').length + T(r.gm, 'assault_barge_1').length).toBeGreaterThan(0);
  }, 60000);

  it('Dorian fere-se e foge: com 8 baixas na guarda ele recebe ordem de recuo para a base e, ao chegar lá, o objetivo p-dorian fecha SEM ele morrer', async () => {
    const r = await boot([
      ...toAct3,
      { name: 'antes', run: (c) => { if (c.gm.mission.vars.fled !== 0) throw new Error('fugiu cedo'); } },
      { name: 'guarda', run: (c) => c.slay(c.tagged('dorian_guard').slice(0, 8)) },
      { name: 'foge', wait: 3, run: (c) => { if (c.gm.mission.vars.fled !== 1) throw new Error('não fugiu'); c.gm.__d1 = d(posOf(c.tagged('dorian')[0]), c.anchor('enemyStart')); } },
      { name: 'recua', wait: 6, run: (c) => { if (!(d(posOf(c.tagged('dorian')[0]), c.anchor('enemyStart')) < c.gm.__d1 - 5)) throw new Error('Dorian não está recuando para a base'); } },
      { name: 'corre', wait: 1, run: (c) => { c.gm.__d0 = d(posOf(c.tagged('dorian')[0]), c.anchor('enemyStart')); }, each: (c) => { if (c.tagged('dorian')[0] && !c.tagged('dorian')[0].isDead) c.tagged('dorian')[0].mesh.position.set(c.anchor('enemyStart').x, c.tagged('dorian')[0].mesh.position.y, c.anchor('enemyStart').z); }, every: 5, until: (c) => c.status('p-dorian') === 'completed', timeout: 30 }
    ], 90);
    const dor = T(r.gm, 'dorian')[0];
    expect(dor.isDead).toBe(false);
    expect(r.gm.mission.vars.fled).toBe(1);
    expect(r.gm.mission.objectives.get('p-dorian').status).toBe('completed');
    expect(r.gm.mission.vars.fin).toBe(1);
  }, 120000);

  it('Dorian morto antes de fugir também fecha p-dorian; a fuga não dispara com Dorian morto (sem diálogo de retirada)', async () => {
    const r = await boot([...toAct3, { name: 'mata', wait: 1, run: (c) => c.slayTag('dorian') }, { name: 'guarda', wait: 1, run: (c) => c.slay(c.tagged('dorian_guard').slice(0, 8)) }, { name: 'fim', wait: 4 }], 40);
    expect(r.gm.mission.objectives.get('p-dorian').status).toBe('completed');
    expect(r.gm.mission.vars.fled).toBe(0);
  }, 60000);

  it('os primários só vencem com Dorian morto ou em fuga: com tudo menos o Ato III não há vitória; Dorian morto + os 6 primários anteriores = vitória (cutscene final com o epílogo)', async () => {
    const r1 = await boot([...toAct3, { name: 'sem dorian', wait: 1, run: (c) => done(c.gm.mission, 'p-hall', 'p-towers') }], 15);
    expect(r1.outcome).not.toBe('victory');
    const r2 = await boot([...toAct3, { name: 'dorian', wait: 5, run: (c) => c.slayTag('dorian') }, { name: 'fim', wait: 6 }], 40);
    expect(r2.outcome).toBe('victory');
    const fin = trig('all-done').actions.find((a) => a.type === 'cutscene');
    const texts = fin.steps.map((s) => s.dialog?.text?.['pt-BR'] ?? '').join(' ');
    expect(texts).toContain('Quando a última torre da Cidadela de Brasa-Alta ergueu o estandarte');
    expect(fin.steps.map((s) => s.dialog?.text?.en ?? '').join(' ')).toContain('When the last tower of Highember Citadel raised the banner');
  }, 120000);

  it('derrotas: o Marco da Cidadela cair, o Salão cair (nenhum Centro) ou Drogath morrer', async () => {
    const hall = await boot([{ name: 'marco', wait: 2, run: (c) => c.slayTag('bastion_hall') }], 20);
    expect(hall.outcome).toBe('defeat');
    const dr = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const centers = await boot([{ name: 'centros', wait: 2, run: (c) => c.slay(c.gm.buildings.filter((b) => b.ownerId === 0 && b.type === 'great_hall')) }], 20);
    expect(centers.outcome).toBe('defeat');
  }, 90000);
});

describe('m12 Cidadela de Brasa-Alta · secundários e ocultos', () => {
  it('náufragos: uma unidade do jogador perto da ilhota transfere os 4 para o Cinzal (rescue)', async () => {
    const r = await boot([
      { name: 'barco', wait: 2, run: (c) => c.teleport(c.tagged('clan_fleet')[0], c.anchor('isletCaptive').x, c.anchor('isletCaptive').z) },
      { name: 'espera', wait: 3 }
    ], 8);
    for (const id of r.gm.mission.tags.get('captives')) expect(r.gm.entitiesById.get(id).ownerId).toBe(0);
    expect(r.gm.mission.objectives.get('s-captives').status).toBe('completed');
  });

  it('Farol do Cabo: destruir a torre de sinal completa a secundária s-farol e não decide a missão', async () => {
    const r = await boot([{ name: 'farol', wait: 2, run: (c) => c.slayTag('farol') }, { name: 'espera', wait: 3 }], 8);
    expect(r.gm.mission.objectives.get('s-farol').status).toBe('completed');
    expect(r.outcome).toBeNull();
  });

  it('oculto: chegar à Fogueira dos Antigos dá 400 de ouro e 150 de petróleo (h-fire)', async () => {
    const before = await boot([], 1);
    const g0 = before.gm.getPlayer(0).resources.gold, o0 = before.gm.getPlayer(0).resources.oil;
    const r = await boot([
      { name: 'barco', wait: 2, run: (c) => c.teleport(c.tagged('clan_fleet')[0], c.anchor('isletRuin').x, c.anchor('isletRuin').z) },
      { name: 'espera', wait: 3 }
    ], 8);
    expect(r.gm.mission.objectives.get('h-fire').status).toBe('completed');
    expect(r.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(g0 + 300);
    expect(r.gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(o0 + 100);
  });

  it('oculto "nenhuma Paliçada cai": com 8 Paliçadas de pé ao fim (fin=1) completa; se uma morre antes, falha', async () => {
    const walls = (c) => { const p = c.anchor('passA'); for (let i = 0; i < 8; i++) { const b = c.gm.createBuilding('wall_orc', p.x + i * 2, p.z, true, 0); c.gm.buildings.push(b); } };
    const ok = await boot([{ name: 'obra', wait: 1, run: walls }, { name: 'fim', wait: 1, run: (c) => { c.gm.mission.vars.fin = 1; } }, { name: 'espera', wait: 3 }], 8);
    expect(ok.gm.mission.objectives.get('h-palisade').status).toBe('completed');
    const bad = await boot([
      { name: 'obra', wait: 1, run: walls },
      { name: 'cai', wait: 1, run: (c) => c.gm.buildings.filter((b) => b.ownerId === 0 && b.type === 'wall_orc')[0].takeDamage(1e6, c.mine()[0]) },
      { name: 'fim', wait: 1, run: (c) => { c.gm.mission.vars.fin = 1; } },
      { name: 'espera', wait: 3 }
    ], 10);
    expect(bad.gm.mission.objectives.get('h-palisade').status).toBe('failed');
  });
});

describe('m12 Cidadela de Brasa-Alta · dificuldade', () => {
  it('investida precoce: só as unidades do início sobre a base humana não vencem', async () => {
    const run = await boot(rush, 650);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-dorian').status).not.toBe('completed');
  }, 120000);

  it('roteiro sem tropa nem frota (economia, paliçadas, torres, nenhuma catapulta): não passa do Ato I e não vence', async () => {
    const run = await boot(noArmy, 1200);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.vars.act).toBe(1);
    expect(run.gm.mission.objectives.get('p-catapults').status).toBe('active');
  }, 400000);

  it('roteiro de derrota (sem tropa; no Ato III Drogath sai sozinho contra o inimigo): PERDE', async () => {
    const run = await boot(lose, 2400);
    expect(run.outcome).toBe('defeat');
  }, 400000);
});
