import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { getLanguage, setLanguage } from '../../src/i18n/index.js';
import { buildObjectivesModel } from '../../src/ui/missionPresentation.js';
import { BUILDINGS } from '../../src/data/buildings.js';

/**
 * M3-10 — m09 "Miragem": mapa natural camp-09 (deserto, 320 de lado, bases a ~151 u, três poços de água no centro, ruínas, cabeça de
 * ponte com barcaça de desembarque no início, ilhota dos Náufragos no mar a leste da Liga). Primários: controlar os três poços por 1 min,
 * derrotar Grok (Ogro-Feiticeiro, contra-ofensiva por terra aos 600 s) e afundar 8 galés da esquadra de Grok (duas levas no mar, 660 e 840 s).
 * Secundários: resgatar 3 náufragos de Brumar (bandidos na ilhota, só pelo mar), 3 Fragatas e 4 Magos treinados. Oculta: ler as ruínas.
 * Estaleiro e Refinaria NÃO são dados: a Liga constrói (liberados pela campanha até a m04). O playthrough fica em
 * tests/fixtures/campaign-playthrough/ (vitória e derrota).
 */
const ID = 'war-alliance-09-miragem';
const MAP = 'camp-09-miragem';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/campaign.json', import.meta.url), 'utf8'));
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/m09-miragem.json', import.meta.url), 'utf8'));

/** Unidades e construções liberadas pela campanha ATÉ a missão 9 (sem contar a própria). */
function unlockedBefore9() {
  const units = new Set(), buildings = new Set();
  for (const m of campaign.missions) {
    if (m.id === ID) break;
    for (const u of m.unlocks?.units ?? []) units.add(u);
    for (const b of m.unlocks?.buildings ?? []) buildings.add(b);
  }
  return { units, buildings };
}

describe('m09 Miragem · mapa', () => {
  it('mapa natural camp-09 (não é "legado"): 320 de lado, bases a ~140–170 u, árvores novas de TREE_WOOD', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(320);
    expect(m.tileset).toBe('deserto');
    const [s0, s1] = m.startSlots;
    expect(d(s0, s1)).toBeGreaterThanOrEqual(140);
    expect(d(s0, s1)).toBeLessThanOrEqual(170);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(60);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('âncoras da missão existem; os três poços ficam no meio; a ilhota dos Náufragos NÃO se alcança a pé (só pelo mar), e a água dela é navegável', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'enemyStart', 'waterWell1', 'waterWell2', 'waterWell3', 'ruins1', 'bridgehead1', 'bridgehead1Sea', 'isletCastaway', 'isletCastawayWater', 'isletCastaway1', 'grokFleetStart']) expect(A[k], k).toBeTruthy();
    const land = buildPathfinder(m, 'land');
    const sea = buildPathfinder(m, 'naval');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    const seen1 = floodFill(land, m.startSlots[1].x, m.startSlots[1].z);
    expect(isReached(land, seen0, A.isletCastaway.x, A.isletCastaway.z), 'ilhota a pé desde a Liga').toBe(false);
    expect(isReached(land, seen1, A.isletCastaway.x, A.isletCastaway.z), 'ilhota a pé desde os Clãs').toBe(false);
    expect(isReached(land, seen0, A.waterWell2.x, A.waterWell2.z)).toBe(true);
    expect(sea.isWalkableWorld(A.isletCastawayWater.x, A.isletCastawayWater.z)).toBe(true);
    expect(sea.isWalkableWorld(A.grokFleetStart.x, A.grokFleetStart.z)).toBe(true);
    expect(d(A.isletCastawayWater, A.isletCastaway)).toBeLessThanOrEqual(24);
    // os três poços de água: entre as duas bases (a Liga e os Clãs chegam a eles por terra)
    for (const k of [1, 2, 3]) {
      expect(d(A[`waterWell${k}`], m.startSlots[0])).toBeGreaterThanOrEqual(30);
      expect(d(A[`waterWell${k}`], m.startSlots[1])).toBeGreaterThanOrEqual(30);
    }
  });

  it('madeira ao alcance do jogador: ≥ 6.000 a 60 u do Paço', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const near = gm.trees.filter((t) => !t.isDead && d(posOf(t), A.playerStart) <= 60).reduce((s, t) => s + t.woodRemaining, 0);
    expect(near).toBeGreaterThanOrEqual(6000);
  });
});

describe('m09 Miragem · jogadores, objetivos e liberação', () => {
  it('2 jogadores: Liga (humano, local, time 0) e os Clãs do Cinzal (orc, IA easy, time 1, inimigos)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['human', 'orc']);
    expect(def.players[1]).toMatchObject({ isAI: true, team: 1, startSlot: 1, difficulty: 'easy' });
    expect(gm.getPlayer(1).team).toBe(1);
  });

  it('objetivos: primários (poços, Grok, frota de Grok), secundários (náufragos, 3 Fragatas, 4 Magos), oculto (ruínas); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-wells', 'p-grok', 'p-fleet']);
    expect(by(def, 'secondary')).toEqual(['s-castaways', 's-frigates', 's-mages']);
    expect(by(def, 'hidden')).toEqual(['h-ruins']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-wells')).toMatchObject({ type: 'flag' });
    expect(o('p-grok')).toMatchObject({ type: 'destroy', select: { tag: 'grok' } });
    expect(o('p-fleet')).toMatchObject({ type: 'destroy', select: { tag: 'grok_fleet' }, count: 8 });
    expect(o('s-castaways')).toMatchObject({ type: 'rescue', tag: 'castaways', count: 3 });
    expect(o('s-frigates')).toMatchObject({ type: 'train', unitType: 'frigate', count: 3 });
    expect(o('s-mages')).toMatchObject({ type: 'train', unitType: 'mage', count: 4 });
    expect(gm.mission.objectives.get('h-ruins')).toBeTruthy();
  });

  it('árvore completa visível: o Paço nasce no nível 3 (gatilho em 0 s, como na m08); Estaleiro e Refinaria não são dados (a Liga constrói)', async () => {
    const { gm } = await boot();
    const castle = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle');
    expect(castle.tier).toBe(3);
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'shipyard')).toBeUndefined();
    expect(DEF.setup.some((a) => a.type === 'spawnBuilding')).toBe(false);
  });

  it('tudo que a missão exige do jogador está liberado antes da m09 (campaign.json): Estaleiro, Refinaria, Plataforma, Petroleiro, Barcaça, Fragata, Torre Arcana, Mago, Cavaleiro e Arqueiro', () => {
    const { units, buildings } = unlockedBefore9();
    for (const b of ['shipyard', 'refinery', 'oil_platform', 'arcane_tower']) expect(buildings.has(b), b).toBe(true);
    for (const u of ['tanker', 'barge', 'frigate', 'mage']) expect(units.has(u), u).toBe(true);
    // Cavaleiro e Arqueiro vêm do início da campanha (m01); o Ogro-Feiticeiro (Grok) e as galés são inimigos (não são construídos)
    expect(BUILDINGS.arcane_tower).toBeTruthy();
  });

  it('Brann está na missão desde o início, vivo, perto do Paço', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('brann');
    expect(ids).toHaveLength(1);
    const b = gm.entitiesById.get(ids[0]);
    expect(b.type).toBe('hero_brann');
    expect(b.ownerId).toBe(0);
    expect(d(posOf(b), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
  });
});

describe('m09 Miragem · setup, narrativa e ondas', () => {
  it('a barcaça da Liga desembarca 6 tropas na cabeça de ponte no início (cabeça de ponte pelo mar)', async () => {
    const { gm } = await boot();
    const tagged = gm.mission.tags.get('landing_liga') || [];
    expect(tagged).toHaveLength(6);
    for (const id of tagged) expect(gm.entitiesById.get(id).ownerId).toBe(0);
    const barges = gm.getUnitsOf(0).filter((u) => u.type === 'barge' && !u.isDead);
    expect(barges.length).toBeGreaterThanOrEqual(1);
  });

  it('setup: Grok (ogre_mage, tag grok) entra na contra-ofensiva aos 600 s, não no início; 3 náufragos neutros (tag castaways) e bandidos na ilhota (tag islet_guard)', async () => {
    const { gm } = await boot();
    const T = (t) => (gm.mission.tags.get(t) || []).map((i) => gm.entitiesById.get(i));
    expect(T('castaways')).toHaveLength(3);
    for (const c of T('castaways')) expect(c).toMatchObject({ type: 'villager', ownerId: -1 });
    expect(T('islet_guard')).toHaveLength(4);
    expect(T('grok')).toHaveLength(0);
    const grok = DEF.triggers.find((t) => t.id === 'grok-march');
    expect(grok.when.at).toBe(600);
    const spawn = grok.actions.find((a) => a.type === 'spawn' && a.unitType === 'ogre_mage');
    expect(spawn).toMatchObject({ owner: 1, count: 1, tag: 'grok' });
  });

  it('ondas: 240 s e 420 s (levas terrestres ao poço), 600 s (Grok), 660 s e 840 s (4 galés cada no mar), com as galés com tag grok_fleet', () => {
    const get = (id) => DEF.triggers.find((t) => t.id === id);
    expect([get('raid-1').when.at, get('raid-2').when.at, get('grok-march').when.at, get('fleet-1').when.at, get('fleet-2').when.at]).toEqual([240, 420, 600, 660, 840]);
    for (const id of ['fleet-1', 'fleet-2']) {
      const a = get(id).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe(1);
      expect(a.anchor).toBe('grokFleetStart');
      expect(a.tag).toBe('grok_fleet');
      expect(a.units).toEqual([{ type: 'war_galley', count: 4 }]);
      expect(a.order.kind).toBe('attackMove');
    }
  });

  it('libertação dos náufragos: os 4 bandidos da ilhota morrendo → os 3 náufragos passam ao jogador (transferência)', async () => {
    const r = await boot([
      { name: 'bandidos', wait: 2, run: (c) => c.slayTag('islet_guard') },
      { name: 'espera', wait: 2 }
    ], 12);
    for (const id of r.gm.mission.tags.get('castaways')) expect(r.gm.entitiesById.get(id).ownerId).toBe(0);
  }, 60000);
});

describe('m09 Miragem · poços (marcos permanentes)', () => {
  it('3 marcos water_well sempre visíveis (known), com rótulo pt-BR/en, raio 9 = o do gatilho wells-tick, em terra firme a ≥ 6 u da costa', async () => {
    const { gm } = await boot();
    const wells = gm.mission.landmarks.filter((l) => l.kind === 'water_well');
    expect(wells).toHaveLength(3);
    const m = gm.terrain.mapDef;
    for (const [i, w] of wells.entries()) {
      expect(w.known).toBe(true);
      expect(w.label['pt-BR']).toBe('Poço');
      expect(w.label.en).toBe('Well');
      expect(w.radius).toBe(9);
      const a = m.anchors[`waterWell${i + 1}`];
      expect(d(w, a)).toBeLessThan(0.01);
      expect(gm.terrain.getHeight(w.x, w.z)).toBeGreaterThan(m.waterLevel + 1);
      for (let k = 0; k < 32; k++) { // nenhum ponto da água a menos de 6 u
        const t = (k / 32) * Math.PI * 2;
        for (const r of [3, 6]) expect(gm.terrain.getHeight(w.x + Math.cos(t) * r, w.z + Math.sin(t) * r), `poço ${i + 1} r=${r}`).toBeGreaterThan(m.waterLevel);
      }
    }
    // os gatilhos usam o mesmo raio dos marcos
    const tick = DEF.triggers.find((t) => t.id === 'wells-tick');
    for (const c of tick.when.all) expect(c.area.r).toBe(9);
  });

  it('ocupação (wellStates): só unidade DENTRO do anel ocupa; inimigo perto contesta; fora do raio não conta; painel mostra "Poços ocupados: n/3"', async () => {
    const { gm } = await boot([], 1);
    const wells = gm.mission.landmarks.filter((l) => l.kind === 'water_well');
    const st = () => { gm.simStep(1 / 20); return [...gm.mission.wellStates().values()]; };
    expect(st()).toEqual([0, 0, 0]);
    const mine = gm.getUnitsOf(0).filter((u) => u.type === 'footman' || u.type === 'peasant' || u.mesh);
    const u = mine.find((x) => x.type !== undefined && !x.isDead);
    const place = (unit, p, dx = 0) => { unit.mesh.position.x = p.x + dx; unit.mesh.position.z = p.z; };
    place(u, wells[1], 12); // fora do anel (r 9)
    expect(st()[1]).toBe(0);
    place(u, wells[1], 5); // dentro
    expect(st()[1]).toBe(1);
    const snap = gm.mission.snapshot().objectives.find((o) => o.id === 'p-wells');
    expect(snap.wells).toEqual({ occupied: 1, total: 3 });
    const lang0 = getLanguage();
    setLanguage('pt-BR', { persist: false });
    expect(buildObjectivesModel({ objectives: [snap] }, 'pt-BR').primary[0].progress).toMatch(/^Poços ocupados: 1\/3 · \d+ s$/);
    setLanguage('en', { persist: false });
    expect(buildObjectivesModel({ objectives: [snap] }, 'en').primary[0].progress).toMatch(/^Wells held: 1\/3 · \d+ s$/);
    setLanguage(lang0, { persist: false });
    const foe = gm.getUnitsOf(1).find((x) => !x.isDead && x.mesh);
    place(foe, wells[1], -11); // inimigo na folga (raio + 3)
    expect(st()[1]).toBe(2);
  });
});

describe('m09 Miragem · desfecho', () => {
  it('derrotas: o Paço cair é derrota; Brann morrer é derrota', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
  });

  it('vitória só com os três primários: Grok e a frota morrendo sem os poços controlados não vence', async () => {
    const semPocos = await boot([
      { name: 'grok', when: (c) => c.tagged('grok').length > 0, run: (c) => c.slayTag('grok') }, // Grok nasce aos 600 s
      { name: 'frota', when: (c) => c.tagged('grok_fleet').length > 0, run: (c) => c.slayTag('grok_fleet') }, // primeira leva de galés aos 660 s
      { name: 'espera', wait: 3 }
    ], 900);
    // Grok e a frota mortos NÃO bastam: sem os três poços controlados a missão não vence (o p-grok completo é checado no playthrough)
    expect(semPocos.outcome).not.toBe('victory');
    expect(semPocos.gm.mission.objectives.get('p-wells').status).not.toBe('completed');
  }, 120000);
});
