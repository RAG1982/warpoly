import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { buildPathfinder } from '../../src/data/maps/generator.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { BUILDINGS } from '../../src/data/buildings.js';

/**
 * M3-08 — m07 "O Brejo Mudo": mapa natural camp-07 (pântano, 320 de lado, bases a ~151 u), traição do governador Mervane por `setTeam`
 * aos 330 s (padrão da clássica m07), Salão de Brakka e 2 Cercados de Javalis (dono `bandits`, hostis a todos), Ferraria de contrabando
 * (`iron_depot`), herói Brann. Primários: 2 Cercados, Salão de Brakka, Paço do traidor e sobreviver 150 s após a traição; secundárias: Ferraria,
 * 2 Torres de Vigia, 4 Magos vivos; oculta: o contrabando. O playthrough (vitória e derrota) fica em tests/fixtures/campaign-playthrough/.
 */
const ID = 'war-alliance-07-brejo-mudo';
const MAP = 'camp-07-brejo-mudo';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/campaign.json', import.meta.url), 'utf8'));

/** Unidades e construções liberadas pela campanha ATÉ a missão 7 (sem contar a própria): o que o jogador pode treinar/erguer aqui. */
function unlockedBefore7() {
  const units = new Set(), buildings = new Set();
  for (const m of campaign.missions) {
    if (m.id === ID) break;
    for (const u of m.unlocks?.units ?? []) units.add(u);
    for (const b of m.unlocks?.buildings ?? []) buildings.add(b);
  }
  // base do início (m01 já libera estas; o Paço é o castelo)
  return { units, buildings };
}

describe('m07 Brejo Mudo · mapa', () => {
  it('mapa natural camp-07 (não é um mapa "legado"): 320 de lado, bases a ~140–160 u, árvores novas de 180 de madeira', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(320);
    const [s0, s1] = m.startSlots;
    expect(d(s0, s1)).toBeGreaterThanOrEqual(140);
    expect(d(s0, s1)).toBeLessThanOrEqual(160);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(80);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('âncoras da missão existem e as de terra são caminháveis; o Salão de Brakka fica a igual distância dos dois Paços (~125 u), e os cercados e a Ferraria onde o texto diz', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'allyStart', 'brakkaHall', 'boarPen1', 'boarPen2', 'ironDepot', 'brakkaGold']) expect(A[k], k).toBeTruthy();
    const land = buildPathfinder(m, 'land'); // o mapa puro (sem os prédios da missão, que bloqueiam o pathfinder da partida)
    for (const k of ['brakkaHall', 'boarPen1', 'boarPen2', 'ironDepot']) expect(land.isWalkableWorld(A[k].x, A[k].z), k).toBe(true);
    expect(Math.abs(d(A.brakkaHall, A.playerStart) - d(A.brakkaHall, A.allyStart))).toBeLessThanOrEqual(6);
    expect(d(A.brakkaHall, A.playerStart)).toBeGreaterThanOrEqual(100);
    for (const k of ['boarPen1', 'boarPen2']) expect(d(A[k], A.brakkaHall), k).toBeLessThanOrEqual(30);
    expect(d(A.ironDepot, A.allyStart)).toBeLessThan(d(A.ironDepot, A.playerStart)); // a Ferraria fica atrás do Paço de Mervane
  });

  it('madeira ao alcance do jogador: ≥ 6.000 a 60 u do Paço (medida pelo harness de madeira)', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const near = gm.trees.filter((t) => !t.isDead && d(posOf(t), A.playerStart) <= 60).reduce((s, t) => s + t.woodRemaining, 0);
    expect(near).toBeGreaterThanOrEqual(6000);
  });
});

describe('m07 Brejo Mudo · jogadores, objetivos e liberação', () => {
  it('2 jogadores: Liga (humano, local) e o Governador Mervane (humano, IA, aliado em 1º time), que só vira inimigo pela traição', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['human', 'human']);
    expect(def.players[1]).toMatchObject({ isAI: true, team: 0, startSlot: 1 });
    expect(gm.getPlayer(1).team).toBe(0);
  });

  it('objetivos: primários (2 Cercados, Salão de Brakka, Paço do traidor, sobreviver), secundários (Ferraria, Torres, 4 Magos) e oculto (contrabando); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-pens', 'p-brakka', 'p-traitor', 'p-survive']);
    expect(by(def, 'secondary')).toEqual(['s-depot', 's-towers', 's-mages']);
    expect(by(def, 'hidden')).toEqual(['h-signs']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-pens')).toMatchObject({ type: 'destroy', select: { tag: 'boar_pen' }, count: 2 });
    expect(o('p-brakka')).toMatchObject({ type: 'destroy', select: { tag: 'brakka_hall' } });
    expect(o('p-traitor')).toMatchObject({ type: 'destroy', select: { tag: 'traitor_castle' }, active: false });
    expect(o('p-survive')).toMatchObject({ type: 'survive', seconds: 150, active: false });
    expect(o('s-depot')).toMatchObject({ type: 'destroy', select: { tag: 'iron_depot' }, active: false });
    expect(o('s-towers')).toMatchObject({ type: 'build', buildingType: 'watchtower', count: 2 });
    expect(o('s-mages')).toMatchObject({ type: 'flag', condition: { type: 'count', select: { owner: 'player', unitType: 'mage' }, value: 4 } });
    expect(gm.mission.objectives.get('h-signs').visible).toBe(false);
  });

  it('tudo que os objetivos exigem está liberado antes da m07 (techLock): Torre de Vigia, Magos (Torre Arcana) e a tropa inicial', () => {
    const { units, buildings } = unlockedBefore7();
    expect(buildings.has('watchtower')).toBe(true);
    expect(buildings.has('arcane_tower')).toBe(true);
    expect(units.has('mage')).toBe(true);
    expect(UNITS.mage).toBeTruthy();
    expect(BUILDINGS.watchtower).toBeTruthy();
    // construções/unidades de base (Paço, Fazenda, Quartel, Serraria, Cavaleiro e Arqueiro) vêm da m01
    for (const b of ['castle', 'farm', 'barracks', 'lumber_camp']) expect(BUILDINGS[b], b).toBeTruthy();
  });

  it('o Paço começa nível 1 e vira Castelo (nível 3) aos 40 s, por gatilho, para liberar a Torre Arcana (mesmo padrão da m05)', async () => {
    const first = await boot();
    expect(first.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier || 1).toBe(1);
    const later = await boot([{ name: 'espera', wait: 41 }], 42);
    expect(later.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier).toBe(3);
    expect(later.gm.mission.def.triggers.find((t) => t.id === 'castle-up').when.at).toBe(40);
  });

  it('Brann está na missão desde o início, vivo, perto do Paço; herói liberado na m03', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('brann');
    expect(ids).toHaveLength(1);
    const b = gm.entitiesById.get(ids[0]);
    expect(b.type).toBe('hero_brann');
    expect(b.ownerId).toBe(0);
    expect(d(posOf(b), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
  });
});

describe('m07 Brejo Mudo · o Salão, os cercados e a traição', () => {
  it('setup: Salão de Brakka (great_hall, dono bandits, tag brakka_hall), 2 Cercados de Javalis (pig_farm, tag boar_pen), Ferraria do traidor (forge, tag iron_depot) e o Paço do traidor (castle, tag traitor_castle)', async () => {
    const { gm } = await boot();
    const hall = gm.mission.tags.get('brakka_hall').map((i) => gm.entitiesById.get(i));
    expect(hall).toHaveLength(1);
    expect(hall[0]).toMatchObject({ type: 'great_hall', ownerId: 99 });
    expect(gm.mission.tags.get('boar_pen').map((i) => gm.entitiesById.get(i)).map((b) => b.type)).toEqual(['pig_farm', 'pig_farm']);
    const depot = gm.mission.tags.get('iron_depot').map((i) => gm.entitiesById.get(i));
    expect(depot).toHaveLength(1);
    expect(depot[0]).toMatchObject({ type: 'forge', ownerId: 1 });
    const castle = gm.mission.tags.get('traitor_castle').map((i) => gm.entitiesById.get(i));
    expect(castle).toHaveLength(1);
    expect(castle[0]).toMatchObject({ type: 'castle', ownerId: 1 });
    const guards = gm.mission.tags.get('brakka_guard').map((i) => gm.entitiesById.get(i));
    const n = (t) => guards.filter((u) => u.type === t).length;
    expect({ grunt: n('grunt'), axe: n('axethrower'), ogre: n('ogre'), cat: n('catapult') }).toEqual({ grunt: 4, axe: 2, ogre: 1, cat: 1 });
  });

  it('a traição é aos 330 s: antes, Mervane é aliado (time 0); no instante da traição vira inimigo (time 1), o objetivo do Paço e a sobrevivência ficam ativos', async () => {
    const before = await boot([{ name: 'antes', wait: 320, run: (c) => { if (c.gm.getPlayer(1).team !== 0) throw new Error('traiu cedo'); } }], 325);
    expect(before.gm.getPlayer(1).team).toBe(0);
    expect(before.gm.mission.objectives.get('p-traitor').status).toBe('inactive');
    const after = await boot([{ name: 'depois', wait: 335, run: (c) => { if (c.gm.getPlayer(1).team !== 1) throw new Error('não traiu'); } }], 340);
    expect(after.gm.getPlayer(1).team).toBe(1);
    expect(after.gm.mission.objectives.get('p-traitor').status).toBe('active');
    expect(after.gm.mission.objectives.get('p-survive').status).toBe('active');
    expect(after.gm.mission.objectives.get('s-depot').status).toBe('active');
  }, 60000);

  it('ondas roteirizadas de Brakka (390, 570 e 750 s) saem do Salão (dono bandits) e marcham para o Paço do jogador', () => {
    const def = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/m07-brejo-mudo.json', import.meta.url), 'utf8'));
    const get = (id) => def.triggers.find((t) => t.id === id);
    expect([get('raid-1').when.at, get('raid-2').when.at, get('raid-3').when.at]).toEqual([390, 570, 750]);
    for (const id of ['raid-1', 'raid-2', 'raid-3']) {
      const a = get(id).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe('bandits');
      expect(a.anchor).toBe('brakkaHall');
      expect(a.order.kind).toBe('attackMove');
      expect(a.order.anchor).toBe('playerStart');
    }
  });
});

describe('m07 Brejo Mudo · desfecho', () => {
  it('derrotas: o Paço cair é derrota; Brann morrer é derrota (com o texto próprio do Paço ou de Brann)', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
  });

  it('vitória: Cercados, Salão e traidor destruídos e a sobrevivência cumprida → cutscene final e vitória; sem o traidor, não vence', async () => {
    const semTraidor = await boot([
      { name: 'pens', wait: 1, run: (c) => { c.slayTag('boar_pen'); c.slayTag('brakka_hall'); } },
      { name: 'espera', wait: 3 }
    ], 40);
    expect(semTraidor.outcome).toBeNull();
    const fim = await boot([
      { name: 'pens', wait: 1, run: (c) => { c.slayTag('boar_pen'); c.slayTag('brakka_hall'); } },
      { name: 'traidor', wait: 335, run: (c) => c.slayTag('traitor_castle') },
      { name: 'sobreviveu', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-survive', 'completed') },
      { name: 'final', wait: 25 }
    ], 700);
    expect(fim.gm.mission.objectives.get('p-brakka').status).toBe('completed');
    expect(fim.gm.mission.objectives.get('p-traitor').status).toBe('completed');
    expect(fim.outcome).toBe('victory');
  }, 120000);
});
