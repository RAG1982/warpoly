import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { readFileSync } from 'node:fs';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { buildPathfinder, floodFill, isReached } from '../../src/data/maps/generator.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { BUILDINGS } from '../../src/data/buildings.js';

/**
 * M3-09 — m08 "A Fornalha": mapa natural camp-08 (vulcânico, 320 de lado, bases a ~151 u, dois rios de lava norte-sul com passagens de
 * rocha, duas ilhotas do Mar Fendido: a Forja Naval dos Clãs (a leste) e a dos Magos (a oeste, 5 cativos + guarda). Primários: Santuário
 * das Cinzas e Forja Naval (só pelo mar); secundários: 5 magos libertados, 3 Fragatas e 4 Magos treinados; oculta: o rito do Santuário.
 * Estaleiro dado ao jogador; árvore completa (Paço nível 3) já no início. Orsolo morre em diálogo (sem unidade); Vozgul aparece na cutscene
 * (cameo, sem unidade); Lyra chega com grifos aos 8 min. O playthrough (vitória e derrota) fica em tests/fixtures/campaign-playthrough/.
 */
const ID = 'war-alliance-08-a-fornalha';
const MAP = 'camp-08-fornalha';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/campaign.json', import.meta.url), 'utf8'));
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-alliance/m08-a-fornalha.json', import.meta.url), 'utf8'));

/** Unidades e construções liberadas pela campanha ATÉ a missão 8 (sem contar a própria). */
function unlockedBefore8() {
  const units = new Set(), buildings = new Set();
  for (const m of campaign.missions) {
    if (m.id === ID) break;
    for (const u of m.unlocks?.units ?? []) units.add(u);
    for (const b of m.unlocks?.buildings ?? []) buildings.add(b);
  }
  return { units, buildings };
}

describe('m08 A Fornalha · mapa', () => {
  it('mapa natural camp-08 (não é "legado"): 320 de lado, bases a ~140–170 u, árvores novas de TREE_WOOD', async () => {
    await ensureMapLoaded(MAP);
    expect(LEGACY_TREE_MAPS.has(MAP)).toBe(false);
    const m = getMap(MAP);
    expect(m.size).toBe(320);
    const [s0, s1] = m.startSlots;
    expect(d(s0, s1)).toBeGreaterThanOrEqual(140);
    expect(d(s0, s1)).toBeLessThanOrEqual(170);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(60);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
  });

  it('âncoras da missão existem; as ilhotas NÃO se alcançam a pé de nenhuma base (só pelo mar), e a água da Forja e dos Magos é navegável', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'enemyStart', 'sanctum', 'isletForge', 'isletForgeWater', 'isletCaptive', 'isletCaptiveWater', 'shipyard1', 'shipyard1Water', 'lyraArrival', 'well1', 'well2']) expect(A[k], k).toBeTruthy();
    const land = buildPathfinder(m, 'land');
    const sea = buildPathfinder(m, 'naval');
    const seen0 = floodFill(land, m.startSlots[0].x, m.startSlots[0].z);
    const seen1 = floodFill(land, m.startSlots[1].x, m.startSlots[1].z);
    for (const k of ['isletForge', 'isletCaptive']) {
      expect(isReached(land, seen0, A[k].x, A[k].z), `${k} a pé desde a Liga`).toBe(false);
      expect(isReached(land, seen1, A[k].x, A[k].z), `${k} a pé desde os Clãs`).toBe(false);
    }
    expect(isReached(land, seen0, A.sanctum.x, A.sanctum.z)).toBe(true);
    expect(sea.isWalkableWorld(A.isletForgeWater.x, A.isletForgeWater.z)).toBe(true);
    expect(sea.isWalkableWorld(A.isletCaptiveWater.x, A.isletCaptiveWater.z)).toBe(true);
    expect(d(A.isletForgeWater, A.isletForge)).toBeLessThanOrEqual(24);
    expect(d(A.isletCaptiveWater, A.isletCaptive)).toBeLessThanOrEqual(24);
  });

  it('madeira ao alcance do jogador: ≥ 6.000 a 60 u do Paço', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const near = gm.trees.filter((t) => !t.isDead && d(posOf(t), A.playerStart) <= 60).reduce((s, t) => s + t.woodRemaining, 0);
    expect(near).toBeGreaterThanOrEqual(6000);
  });
});

describe('m08 A Fornalha · jogadores, objetivos e liberação', () => {
  it('2 jogadores: Liga (humano, local, time 0) e os Clãs do Cinzal (orc, IA easy, time 1, inimigos)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.players.map((p) => p.factionId)).toEqual(['human', 'orc']);
    expect(def.players[1]).toMatchObject({ isAI: true, team: 1, startSlot: 1, difficulty: 'easy' });
    expect(gm.getPlayer(1).team).toBe(1);
  });

  it('objetivos: primários (Santuário, Forja Naval), secundários (5 magos libertados, 3 Fragatas, 4 Magos), oculto (o rito); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-sanctum', 'p-forge']);
    expect(by(def, 'secondary')).toEqual(['s-captives', 's-frigates', 's-mages']);
    expect(by(def, 'hidden')).toEqual(['h-rite']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-sanctum')).toMatchObject({ type: 'destroy', select: { tag: 'sanctum' } });
    expect(o('p-forge')).toMatchObject({ type: 'destroy', select: { tag: 'naval_forge' } });
    expect(o('s-captives')).toMatchObject({ type: 'rescue', tag: 'captives', count: 5 });
    expect(o('s-frigates')).toMatchObject({ type: 'train', unitType: 'frigate', count: 3 });
    expect(o('s-mages')).toMatchObject({ type: 'train', unitType: 'mage', count: 4 });
    expect(o('h-rite')).toMatchObject({ type: 'flag' });
    expect(gm.mission.objectives.get('h-rite').visible).toBe(false);
  });

  it('árvore completa visível: o Paço nasce no nível 3 (gatilho em 0 s, como na m06) e o Estaleiro é dado à Liga', async () => {
    const { gm } = await boot();
    const castle = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle');
    expect(castle.tier).toBe(3);
    const yard = gm.buildings.find((x) => x.ownerId === 0 && x.type === 'shipyard' && !x.isDead);
    expect(yard).toBeTruthy();
    expect(d(posOf(yard), gm.terrain.mapDef.anchors.shipyard1)).toBeLessThanOrEqual(2);
  });

  it('tudo que a missão exige do jogador está liberado antes da m08 (campaign.json): Estaleiro, Refinaria, Plataforma, Petroleiro, Fragata, Torre Arcana, Magos e Grifos', () => {
    const { units, buildings } = unlockedBefore8();
    for (const b of ['shipyard', 'refinery', 'oil_platform', 'arcane_tower']) expect(buildings.has(b), b).toBe(true);
    for (const u of ['tanker', 'frigate', 'mage', 'gryphon_rider']) expect(units.has(u), u).toBe(true);
    // alvos dos Clãs (não são construídos pelo jogador): existem no catálogo
    expect(BUILDINGS.naval_forge).toBeTruthy();
    expect(BUILDINGS.ash_sanctum).toBeTruthy();
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

describe('m08 A Fornalha · setup, narrativa e ondas', () => {
  it('setup: Santuário (ash_sanctum, dono Clãs, tag sanctum), Forja Naval (naval_forge, tag naval_forge) no islote, 5 magos neutros cativos (tag captives), guardas nos dois islotes e no Santuário', async () => {
    const { gm } = await boot();
    const T = (t) => gm.mission.tags.get(t).map((i) => gm.entitiesById.get(i));
    expect(T('sanctum')[0]).toMatchObject({ type: 'ash_sanctum', ownerId: 1 });
    expect(T('naval_forge')[0]).toMatchObject({ type: 'naval_forge', ownerId: 1 });
    const captives = T('captives');
    expect(captives).toHaveLength(5);
    for (const c of captives) expect(c).toMatchObject({ type: 'mage', ownerId: -1 });
    expect(T('captive_guard')).toHaveLength(6);
    expect(T('forge_guard')).toHaveLength(5);
    expect(T('sanctum_guard')).toHaveLength(7);
  });

  it('Vozgul aparece só na cutscene (cameo, sem unidade) e Orsolo morre em diálogo (sem unidade): não há unidade nem entidade com o nome dos dois', () => {
    const texts = JSON.stringify(DEF);
    expect(texts).toContain('Profetisa Vozgul');
    expect(texts).toContain('Mestre Orsolo');
    const spawns = [...DEF.setup, ...DEF.triggers.flatMap((t) => t.actions)].filter((a) => a.type === 'spawn');
    for (const a of spawns) expect(JSON.stringify(a)).not.toMatch(/vozgul|orsolo|Vozgul|Orsolo/i);
    const freed = DEF.triggers.find((t) => t.id === 'captives-freed');
    expect(freed.actions.map((a) => a.type)).toEqual(expect.arrayContaining(['transfer', 'dialog']));
    const dlg = freed.actions.find((a) => a.type === 'dialog');
    expect(dlg.text['pt-BR']).toMatch(/Orsolo/);
    expect(dlg.text.en).toMatch(/Orsolo/);
  });

  it('libertação dos magos: os 6 guardas do islote dos Magos morrendo → 5 magos passam ao jogador (transferência), e o objetivo de resgate se completa', async () => {
    const r = await boot([
      { name: 'guardas', wait: 2, run: (c) => c.slayTag('captive_guard') },
      { name: 'espera', wait: 2 }
    ], 12);
    expect(r.gm.mission.vars.freed).toBe(true);
    expect(r.gm.mission.objectives.get('s-captives').status).toBe('completed');
    for (const id of r.gm.mission.tags.get('captives')) expect(r.gm.entitiesById.get(id).ownerId).toBe(0);
  }, 60000);

  it('ondas dos Clãs (300, 540 e 720 s) saem do Santuário e marcham para o Paço do jogador; Lyra chega aos 480 s com grifos do jogador', () => {
    const get = (id) => DEF.triggers.find((t) => t.id === id);
    expect([get('raid-1').when.at, get('raid-2').when.at, get('raid-3').when.at]).toEqual([300, 540, 720]);
    for (const id of ['raid-1', 'raid-2', 'raid-3']) {
      const a = get(id).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe(1);
      expect(a.anchor).toBe('sanctum');
      expect(a.order.kind).toBe('attackMove');
      expect(a.order.anchor).toBe('playerStart');
    }
    const lyra = get('lyra');
    expect(lyra.when.at).toBe(480);
    expect(lyra.actions.find((x) => x.type === 'spawn')).toMatchObject({ owner: 'player', unitType: 'gryphon_rider', count: 3, anchor: 'lyraArrival' });
  });
});

describe('m08 A Fornalha · desfecho', () => {
  it('derrotas: o Paço cair é derrota; Brann morrer é derrota', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
  });

  it('vitória: Santuário e Forja destruídos → cutscene final e vitória; só a Forja, sem o Santuário, não vence', async () => {
    const soForja = await boot([
      { name: 'forja', wait: 1, run: (c) => c.slayTag('naval_forge') },
      { name: 'espera', wait: 3 }
    ], 40);
    expect(soForja.outcome).toBeNull();
    const fim = await boot([
      { name: 'santuario', wait: 1, run: (c) => c.slayTag('sanctum') },
      { name: 'forja', wait: 1, run: (c) => c.slayTag('naval_forge') },
      { name: 'final', wait: 25 }
    ], 300);
    expect(fim.gm.mission.objectives.get('p-sanctum').status).toBe('completed');
    expect(fim.gm.mission.objectives.get('p-forge').status).toBe('completed');
    expect(fim.outcome).toBe('victory');
  }, 120000);
});
