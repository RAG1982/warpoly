import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';

/**
 * M3-11 — m10 "Desembarque na Costa Ferrugem" (mapa `camp-10-costa-ferrugem`, 384 de lado, naval). Travessia do Mar Fendido: a Liga embarca
 * a tropa nas Barcaças (LOAD), desembarca em Cinzara (UNLOAD) e funda o Marco da Colônia (`spawnBuilding`) na praia. Primários: o Marco de
 * pé e as 3 docas dos Clãs destruídas. Secundários: afundar a patrulha de 3 galés do Farol, bombear 300 de petróleo e treinar 2 Magos.
 * Oculto: achar o Poço Velho do Farol (só se alcança pelo mar). Brann e Oren (herói liberado aqui) entram no desembarque.
 * O roteiro de vitória fica em tests/fixtures/campaign-playthrough/ (vitória e derrota).
 */
const ID = 'war-alliance-10-desembarque-costa-ferrugem';
const MAP = 'camp-10-costa-ferrugem';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/m10-desembarque-costa-ferrugem.json', import.meta.url), 'utf8'));
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/campaign.json', import.meta.url), 'utf8'));

describe('m10 Costa Ferrugem · mapa', () => {
  it('mapa natural camp-10 (não é "legado"): 384 de lado, árvores novas de TREE_WOOD, bases a ≥ 150 u', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(384);
    const [s0, s1] = m.startSlots;
    expect(d(s0, s1)).toBeGreaterThanOrEqual(150);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(60);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('a Liga começa na ilha (sem caminho a pé até Cinzara); as Barcaças e a tropa estão na praia de partida; o Paço nasce no nível 3', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const barges = ['barge1', 'barge2'].map((t) => gm.entitiesById.get((gm.mission.tags.get(t) || [])[0]));
    expect(barges.every(Boolean)).toBe(true);
    for (const b of barges) {
      expect(b).toMatchObject({ type: 'barge', ownerId: 0 });
      expect(d(posOf(b), A.beach1)).toBeLessThanOrEqual(16);
    }
    const troops = (gm.mission.tags.get('liga_troops') || []).map((i) => gm.entitiesById.get(i));
    expect(troops).toHaveLength(12);
    for (const u of troops) expect(d(posOf(u), A.beach1)).toBeLessThanOrEqual(16);
    const castle = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle');
    expect(castle.tier).toBe(3);
  });

  it('o Marco não existe no início (nasce quando a tropa chega à praia); as 3 docas dos Clãs e a patrulha de 3 galés estão no lugar', async () => {
    const { gm } = await boot();
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'great_hall')).toBeUndefined();
    const docks = gm.buildings.filter((x) => x.ownerId === 1 && x.type === 'ship_dock');
    expect(docks).toHaveLength(3);
    const galleys = (gm.mission.tags.get('patrol_galley') || []).map((i) => gm.entitiesById.get(i));
    expect(galleys).toHaveLength(3);
    for (const g of galleys) expect(g).toMatchObject({ type: 'war_galley', ownerId: 1 });
  });
});

describe('m10 Costa Ferrugem · objetivos, heróis e ondas', () => {
  it('objetivos: primários (Marco, 3 docas), secundários (patrulha, petróleo, magos), oculto (Poço Velho); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-colony', 'p-docks']);
    expect(by(def, 'secondary')).toEqual(['s-galleys', 's-oil', 's-mages']);
    expect(by(def, 'hidden')).toEqual(['h-well']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-colony')).toMatchObject({ type: 'flag' });
    expect(o('p-docks')).toMatchObject({ type: 'destroy', select: { tag: 'orc_dock' }, count: 3 });
    expect(o('s-galleys')).toMatchObject({ type: 'destroy', select: { tag: 'patrol_galley' }, count: 3 });
    expect(o('s-oil')).toMatchObject({ type: 'collect', resource: 'oil', amount: 300 });
    expect(o('s-mages')).toMatchObject({ type: 'train', unitType: 'mage', count: 2 });
    expect(o('h-well')).toMatchObject({ type: 'flag' });
  });

  it('heróis: Brann e Oren nascem no Paço (Oren liberado nesta missão); Brann está vivo perto do Paço', async () => {
    const { gm } = await boot();
    const brann = gm.entitiesById.get(gm.mission.tags.get('brann')[0]);
    const oren = gm.entitiesById.get(gm.mission.tags.get('oren')[0]);
    expect(brann.type).toBe('hero_brann');
    expect(oren.type).toBe('hero_oren');
    expect(oren.ownerId).toBe(0);
    expect(d(posOf(brann), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
    const unlocks = campaign.missions.find((m) => m.id === ID).unlocks;
    expect(unlocks.heroes).toEqual(['hero_oren']);
  });

  it('ondas dos Clãs: 300 s (terra à praia), 480 s (Ogro e tropa à praia), 600 s (3 galés à praia), 780 s (catapulta e tropa)', () => {
    const get = (id) => DEF.triggers.find((t) => t.id === id);
    expect([get('raid-1').when.at, get('raid-2').when.at, get('fleet-raid').when.at, get('raid-3').when.at]).toEqual([300, 480, 600, 780]);
    const galleys = get('fleet-raid').actions.find((a) => a.type === 'spawn');
    expect(galleys).toMatchObject({ owner: 1, unitType: 'war_galley', count: 3, anchor: 'patrolSea' });
  });

  it('o Marco nasce quando uma unidade da Liga chega à praia (gatilho de área, uma vez) e Oren avisa', () => {
    const t = DEF.triggers.find((x) => x.id === 'landed');
    expect(t.when).toMatchObject({ type: 'area', owner: 'player', area: { anchor: 'landingZone', r: 16 } });
    expect(t.once).toBe(true);
    const b = t.actions.find((a) => a.type === 'spawnBuilding');
    expect(b).toMatchObject({ owner: 'player', buildingType: 'great_hall', anchor: 'colonyMark' });
  });
});

describe('m10 Costa Ferrugem · desfecho', () => {
  it('derrotas: o Paço cair é derrota; Brann morrer é derrota', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
  }, 120000);

  it('sem as 3 docas caídas a missão não vence (roteiro ocioso)', async () => {
    const r = await boot([{ name: 'espera', wait: 3 }], 60);
    expect(r.outcome).not.toBe('victory');
    expect(r.gm.mission.objectives.get('p-docks').status).not.toBe('completed');
  }, 120000);
});
