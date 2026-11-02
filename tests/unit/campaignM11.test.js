import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { BUILDINGS } from '../../src/data/buildings.js';

/**
 * M3-12 — m11 "Porto Albor": mapa natural camp-11 (savana/estepe, 352 de lado, bases a >= 150 u, mar de cerco a oeste e ao sul).
 * Primários: Marco da Colônia (Centro na praia) evoluído a nível 2; resistir 12 min (3 incursões: 4, 7 e 10 min); afundar 8 galés da
 * esquadra de cerco (duas levas, 8 e 12 min). Secundários: converter o clã dissidente de Hurgan (rescue), Estábulo e Aviário.
 * Oculto: ver o acampamento de Hurgan. Reforços por mar a cada 4 min (4 barcaças); Dorian chega na 2ª onda (480 s).
 */
const ID = 'war-alliance-11-porto-albor';
const MAP = 'camp-11-estepe-do-vento';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/campaign.json', import.meta.url), 'utf8'));
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/m11-porto-albor.json', import.meta.url), 'utf8'));
const trig = (id) => DEF.triggers.find((t) => t.id === id);

/** Unidades e construções liberadas pela campanha ATÉ a missão 11 (sem contar a própria). */
function unlockedBefore11() {
  const units = new Set(), buildings = new Set(), heroes = new Set();
  for (const m of campaign.missions) {
    if (m.id === ID) break;
    for (const u of m.unlocks?.units ?? []) units.add(u);
    for (const b of m.unlocks?.buildings ?? []) buildings.add(b);
    for (const h of m.unlocks?.heroes ?? []) heroes.add(h);
  }
  return { units, buildings, heroes };
}

describe('m11 Porto Albor · mapa', () => {
  it('mapa natural camp-11 (não é "legado"): 352 de lado, savana, árvores novas de TREE_WOOD e 6 poços de petróleo', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(352);
    expect(m.tileset).toBe('savana');
    expect(m.resources.filter((r) => r.type === 'oil')).toHaveLength(6);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(60);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('âncoras da missão existem; o Marco da Colônia fica na praia (a 14–22 u do desembarque), o Paço no interior; o mar de reforço e a frota de cerco são navegáveis', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'enemyStart', 'colonyMark', 'skarnStart', 'hurganStart', 'landingZone', 'reinforceSea', 'siegeFleetStart', 'siegeFleetStart2', 'raid1', 'raid2', 'raid3', 'dissidentClan', 'expansion1', 'well1']) expect(A[k], k).toBeTruthy();
    const land = buildPathfinder(m, 'land');
    const sea = buildPathfinder(m, 'naval');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    expect(isReached(land, seen0, A.colonyMark.x, A.colonyMark.z), 'Marco alcançável por terra desde o Paço').toBe(true);
    expect(d(A.colonyMark, A.landingZone)).toBeGreaterThanOrEqual(14);
    expect(d(A.colonyMark, A.landingZone)).toBeLessThanOrEqual(22);
    expect(sea.isWalkableWorld(A.reinforceSea.x, A.reinforceSea.z)).toBe(true);
    expect(sea.isWalkableWorld(A.siegeFleetStart.x, A.siegeFleetStart.z)).toBe(true);
  });

  it('bases bem afastadas: as três vagas a >= 150 u, e madeira ao alcance do Paço (>= 5.000 a 75 u)', async () => {
    const { gm } = await boot();
    const S = gm.terrain.mapDef.startSlots;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(d(S[i], S[j])).toBeGreaterThanOrEqual(150);
    const A = gm.terrain.mapDef.anchors;
    const near = gm.trees.filter((t) => !t.isDead && d(posOf(t), A.playerStart) <= 75).reduce((s, t) => s + t.woodRemaining, 0);
    // a receita estima 6.360 de madeira para o Paço (pelo seu critério); a soma das árvores vivas a 75 u dá 5.940: piso de 5.000 aqui
    expect(near).toBeGreaterThanOrEqual(5000);
  });
});

describe('m11 Porto Albor · jogadores, objetivos e liberação', () => {
  it('2 jogadores: Liga (humano, local, time 0) e os Clãs do Cinzal (orc, IA easy, time 1, inimigos)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['human', 'orc']);
    expect(def.players[1]).toMatchObject({ isAI: true, team: 1, startSlot: 1, difficulty: 'easy' });
    expect(gm.getPlayer(1).team).toBe(1);
  });

  it('objetivos: primários (Marco nível 2, 12 min de resistência, 8 galés), secundários (clã dissidente, Estábulo, Aviário), oculto (acampamento de Hurgan); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-colony', 'p-hold', 'p-fleet']);
    expect(by(def, 'secondary')).toEqual(['s-clan', 's-stable', 's-aviary']);
    expect(by(def, 'hidden')).toEqual(['h-hurgan']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-colony')).toMatchObject({ type: 'flag', condition: { type: 'count', select: { tag: 'colony', owner: 'player', minTier: 2 } } }); // o Paço (tier 3) não conta
    expect(o('p-hold')).toMatchObject({ type: 'survive', seconds: 720 });
    expect(o('p-fleet')).toMatchObject({ type: 'destroy', select: { tag: 'siege_fleet' }, count: 8 });
    expect(o('s-clan')).toMatchObject({ type: 'rescue', tag: 'dissidents', count: 3 });
    expect(o('s-stable')).toMatchObject({ type: 'build', buildingType: 'stable', count: 1 });
    expect(o('s-aviary')).toMatchObject({ type: 'build', buildingType: 'aviary', count: 1 });
    expect(gm.mission.objectives.get('h-hurgan')).toBeTruthy();
  });

  it('Paço nasce no nível 3 e o Marco da Colônia (castle com tag colony) nasce no nível 1, sem o setTier de ficar no 3', async () => {
    const { gm } = await boot();
    const [marco] = gm.mission.tags.get('colony').map((i) => gm.entitiesById.get(i));
    expect(marco.type).toBe('castle');
    expect(marco.ownerId).toBe(0);
    expect(marco.tier).toBe(1);
    const paco = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle' && x.id !== marco.id);
    expect(paco.tier).toBe(3);
    expect(DEF.triggers.find((t) => t.id === 'full-tree').actions[0]).toMatchObject({ type: 'setTier', tier: 3, exceptTag: 'colony' });
  });

  it('tudo que a missão exige do jogador está liberado antes da m11 (campaign.json): Estaleiro, Refinaria, Plataforma, Barcaça, Fragata, Torre Arcana, Mago, Estábulo, Aviário, Cavaleiro e Arqueiro; Oren (m10) já está; Dorian entra nesta missão', () => {
    const { units, buildings, heroes } = unlockedBefore11();
    for (const b of ['shipyard', 'refinery', 'oil_platform', 'arcane_tower', 'stable', 'aviary']) expect(buildings.has(b), b).toBe(true);
    for (const u of ['barge', 'frigate', 'tanker', 'mage', 'knight', 'archer']) expect(units.has(u), u).toBe(true);
    expect(heroes.has('hero_brann')).toBe(true);
    expect(heroes.has('hero_oren')).toBe(true);
    expect(heroes.has('hero_dorian')).toBe(false); // o Marechal entra na m11 (campaign.json: unlocks da m11)
    expect(UNITS.hero_dorian).toBeTruthy();
    expect(BUILDINGS.oil_platform).toBeTruthy();
  });

  it('Brann está na missão desde o início, vivo, perto do Paço; Oren nasce na colônia e Dorian chega pela 2ª barcaça', async () => {
    const { gm } = await boot();
    const [b] = gm.mission.tags.get('brann').map((i) => gm.entitiesById.get(i));
    expect(b.type).toBe('hero_brann');
    expect(b.ownerId).toBe(0);
    expect(d(posOf(b), gm.terrain.mapDef.startSlots[0])).toBeLessThanOrEqual(20);
    const [o] = gm.mission.tags.get('oren').map((i) => gm.entitiesById.get(i));
    expect(o.type).toBe('hero_oren');
    expect(d(posOf(o), gm.terrain.mapDef.anchors.colonyMark)).toBeLessThanOrEqual(12);
    const landing = trig('landing-3').actions.find((a) => a.type === 'spawnLanding');
    expect(landing.units[0]).toEqual({ type: 'hero_dorian', count: 1 });
    expect(landing.tag).toBe('dorian_wave');
  });
});

describe('m11 Porto Albor · setup, narrativa e ondas', () => {
  it('reforços por mar: barcaças aos 0, 240, 480 e 720 s (4 ao todo), 6 tropas cada (cabe na barcaça), desembarcando no Marco', () => {
    const cap = UNITS.barge.transportCapacity;
    const landings = DEF.triggers.flatMap((t) => t.actions.filter((a) => a.type === 'spawnLanding').map((a) => ({ at: t.when?.at ?? 0, a })));
    expect(landings.map((x) => x.at).sort((x, y) => x - y)).toEqual([0, 240, 480, 720]);
    for (const { a } of landings) {
      expect(a.owner).toBe('player');
      expect(a.unloadAt).toEqual({ anchor: 'landingZone' });
      expect(a.units.reduce((s, u) => s + u.count, 0)).toBeLessThanOrEqual(cap);
    }
  });

  it('incursões terrestres aos 240, 420 e 600 s (rotas raid1–3, rumo à mina do interior e ao Marco) e a esquadra de cerco aos 480 e 720 s, com a tag siege_fleet', () => {
    expect(trig('raid-1').when.at).toBe(240);
    expect(trig('raid-2').when.at).toBe(420);
    expect(trig('raid-3').when.at).toBe(600);
    expect(trig('raid-3').actions.find((a) => a.unitType === 'hero_skarn')).toMatchObject({ owner: 1, tag: 'skarn' });
    for (const id of ['fleet-1', 'fleet-2']) {
      const a = trig(id).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe(1);
      expect(a.tag).toBe('siege_fleet');
      expect(a.units[0].type).toBe('war_galley');
      expect(a.order.kind).toBe('attackMove');
    }
    expect([trig('fleet-1').when.at, trig('fleet-2').when.at]).toEqual([480, 720]);
    expect(trig('fleet-1').actions[0].units[0].count + trig('fleet-2').actions[0].units[0].count).toBe(8);
  });

  it('setup: o Marco e os dissidentes (neutros, tag dissidents) e 4 bandidos guardando (tag clan_guard) no acampamento de Hurgan', async () => {
    const { gm } = await boot();
    const T = (t) => (gm.mission.tags.get(t) || []).map((i) => gm.entitiesById.get(i));
    expect(T('dissidents')).toHaveLength(3);
    for (const c of T('dissidents')) expect(c).toMatchObject({ type: 'villager', ownerId: -1 });
    expect(T('clan_guard')).toHaveLength(4);
    expect(T('skarn')).toHaveLength(0);
    expect(trig('clan-free').when).toMatchObject({ type: 'dead', count: 4 });
  });
});

describe('m11 Porto Albor · desfecho', () => {
  it('derrotas: o Paço e o Marco cair é derrota (o Marco pela tag colony); Brann morrer é derrota', async () => {
    const marco = await boot([{ name: 'marco', wait: 2, run: (c) => c.slayTag('colony') }], 20);
    expect(marco.outcome).toBe('defeat');
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
  });

  it('a esquadra de cerco e o Marco evoluído são necessários: matar a frota sem evoluir o Marco não vence', async () => {
    const r = await boot([
      { name: 'frota', when: (c) => c.tagged('siege_fleet').length > 0, run: (c) => c.slayTag('siege_fleet') },
      { name: 'espera', wait: 3 }
    ], 900);
    expect(r.outcome).not.toBe('victory');
    expect(r.gm.mission.objectives.get('p-colony').status).not.toBe('completed');
  }, 180000);

  it('a libertação do clã dissidente: os 4 bandidos caindo passam os 3 dissidentes ao jogador (transferência)', async () => {
    const r = await boot([
      { name: 'bandidos', wait: 2, run: (c) => c.slayTag('clan_guard') },
      { name: 'espera', wait: 2 }
    ], 12);
    for (const id of r.gm.mission.tags.get('dissidents')) expect(r.gm.entitiesById.get(id).ownerId).toBe(0);
  }, 60000);
});
