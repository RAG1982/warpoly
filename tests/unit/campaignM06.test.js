import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { getCampaign } from '../../src/data/campaigns/index.js';
import { availableTech } from '../../src/campaign/campaign.js';
import { missingUnitRequirements, missingRequirements, missingUpgradeRequirements } from '../../src/sim/requirements.js';
import { noArmy, rush } from '../fixtures/campaign-playthrough/war-alliance-06-a-geada.js';

/**
 * M3-07 — m06 "A Geada" (Prova de Fogo): mapa natural camp-06 (320, continente gelado, 4 bases a ~140+ u, lagos congelados não navegáveis), árvore COMPLETA
 * liberada, 2 clãs orcs (Lanças Quebradas: o forte de Drogath; Sal Cinzento) + o aliado de IA Brumar cujo forte não pode cair; primários: manter o Farol
 * Boreal 3 min, destruir o forte dos Lanças, o forte de Brumar de pé; secundárias: comboio, armas combinadas, Nevasca, Salão do Sal Cinzento; ocultas:
 * Dama Aurora, recrutas presos, Posto do Faroleiro. O playthrough completo do robô (vitória, derrota, determinismo) está em
 * tests/fixtures/campaign-playthrough/ e roda por campaignWorldPlaythrough.test.js.
 */
const ID = 'war-alliance-06-a-geada';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const trig = (def, id) => def.triggers.find((t) => t.id === id);

describe('m06 A Geada · mapa', () => {
  it('mapa natural camp-06 de 320 (árvores novas de 180 de madeira): madeira de sobra e perto das bases; bases a >= 130 u entre si; mapas revisados não mudam', async () => {
    await ensureMapLoaded('camp-06-a-geada');
    expect(LEGACY_TREE_MAPS.has('camp-06-a-geada')).toBe(false);
    for (const id of ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro', 'camp-03-pedra-mae', 'camp-04-baixio-do-breu']) expect(LEGACY_TREE_MAPS.has(id), id).toBe(true);
    const m = getMap('camp-06-a-geada');
    expect(m.size).toBe(320);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(d(m.startSlots[i], m.startSlots[j]), `bases ${i}-${j}`).toBeGreaterThanOrEqual(130);
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
    const total = alive.reduce((s, t) => s + t.woodRemaining, 0);
    expect(total).toBeGreaterThanOrEqual(30000);
    // madeira ao alcance de CADA base: >= 20 árvores (3.600) a até 60 u do pátio
    for (const s of m.startSlots) expect(alive.filter((t) => d(posOf(t), s) <= 60).length, `base ${s.x},${s.z}`).toBeGreaterThanOrEqual(20);
  });

  it('âncoras da missão existem; as de terra são caminháveis e as de água (lagos, mar do norte) estão na água; gelo não navegável', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const land = ['playerStart', 'enemy1Start', 'enemy2Start', 'allyStart', 'lighthouse', 'lightSouth', 'enemy1Fort', 'fortTower1', 'fortTower2', 'fortTower3', 'allyFort', 'allyTower1', 'allyTower2',
      'allyHeroStart', 'convoyStart', 'convoyAmbush', 'convoyEnd', 'ruins1', 'captive1', 'iceDock', 'lightGold1', 'lightGold2', 'expansion1', 'expansion2', 'expansion3', 'expansion4', 'neutralCamp1', 'neutralCamp2'];
    for (const k of land) { expect(A[k], k).toBeTruthy(); expect(gm.pathfinder.isWalkableWorld(A[k].x, A[k].z), `${k} caminhável`).toBe(true); }
    for (const k of ['lightSea', 'iceDockSea', 'lake1', 'lake2']) { expect(A[k], k).toBeTruthy(); expect(A[k].water, k).toBe(true); }
    for (const k of ['lake1', 'lake2', 'lake3']) expect(gm.pathfinder.isWalkableWorld(A[k].x, A[k].z), `${k} (gelo) não é chão de tropa`).toBe(false);
  });

  it('geografia da história: Liga a oeste, Brumar a leste, Lanças a nordeste, Sal Cinzento a noroeste; o Farol ao norte, longe de todas as bases (>= 70 u); forte no lado do Farol', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    expect(A.playerStart.x).toBeLessThan(A.lighthouse.x - 80);
    expect(A.allyStart.x).toBeGreaterThan(A.lighthouse.x + 60);
    expect(A.enemy1Start.x).toBeGreaterThan(A.lighthouse.x + 40);
    expect(A.enemy1Start.z).toBeLessThan(A.lighthouse.z); // nordeste: ao norte (z menor) do Farol
    expect(A.enemy2Start.x).toBeLessThan(A.lighthouse.x - 40);
    expect(A.enemy2Start.z).toBeLessThan(A.lighthouse.z);
    for (const s of gm.terrain.mapDef.startSlots) expect(d(A.lighthouse, s)).toBeGreaterThanOrEqual(70);
    expect(d(A.enemy1Fort, A.enemy1Start)).toBeLessThan(32);
    expect(d(A.allyFort, A.allyStart)).toBeLessThan(32);
    expect(d(A.enemy1Fort, A.lighthouse)).toBeLessThan(d(A.enemy1Start, A.lighthouse));
    expect(d(A.allyFort, A.lighthouse)).toBeLessThan(d(A.allyStart, A.lighthouse));
    // comboio: sai do forte de Brumar e chega ao Farol, passando pela emboscada a meio caminho
    expect(d(A.convoyStart, A.allyStart)).toBeLessThan(d(A.convoyStart, A.playerStart));
    expect(d(A.convoyEnd, A.lighthouse)).toBeLessThan(30);
    expect(d(A.convoyAmbush, A.convoyStart)).toBeGreaterThan(30);
    expect(d(A.convoyAmbush, A.convoyEnd)).toBeGreaterThan(30);
    // ruínas longe de tudo; recrutas entre a Liga e o Sal Cinzento; cais no mar do norte entre o Farol e o Sal Cinzento
    expect(d(A.ruins1, A.playerStart)).toBeGreaterThanOrEqual(100);
    expect(d(A.captive1, A.playerStart)).toBeGreaterThanOrEqual(40);
    expect(d(A.captive1, A.playerStart)).toBeLessThanOrEqual(90);
    expect(d(A.iceDock, A.lighthouse)).toBeGreaterThanOrEqual(40);
    expect(d(A.iceDock, A.iceDockSea)).toBeGreaterThanOrEqual(30);
  });

  it('economia do mapa: cada base tem ouro e pedra por perto; 2 veios menores no Farol; a mina inicial fica a ~32 u do Centro; 10 minas de ouro no total', async () => {
    const m = getMap('camp-06-a-geada');
    const golds = m.resources.filter((r) => r.type === 'gold');
    expect(golds).toHaveLength(10);
    expect(m.resources.filter((r) => r.type === 'stone').length).toBeGreaterThanOrEqual(4);
    for (const s of m.startSlots) {
      const near = golds.map((g) => d(g, s)).sort((a, b) => a - b);
      expect(near[0]).toBeGreaterThanOrEqual(26);
      expect(near[0]).toBeLessThanOrEqual(38);
      expect(near[1], 'mina de expansão da base').toBeLessThanOrEqual(60);
      expect(m.resources.filter((r) => r.type === 'stone').some((r) => d(r, s) <= 40), `pedreira da base ${s.x},${s.z}`).toBe(true);
    }
    expect(golds.filter((g) => g.amount === 5000)).toHaveLength(2);
    for (const k of ['lightGold1', 'lightGold2']) expect(d(m.anchors[k], m.anchors.lighthouse)).toBeLessThan(45);
    expect(m.neutrals.filter((n) => n.kind === 'camp').length).toBeGreaterThanOrEqual(2);
  });
});

describe('m06 A Geada · jogadores, tecnologia e Brann', () => {
  it('4 jogadores: Liga (local) e Brumar (IA aliada) no time 0; Lanças Quebradas e Sal Cinzento (IAs orcs) no time 1; dificuldade por perfil', async () => {
    const { gm } = await boot();
    const P = gm.mission.def.players;
    expect(P.map((p) => [p.factionId, p.team])).toEqual([['human', 0], ['human', 0], ['orc', 1], ['orc', 1]]);
    expect(P[0].isLocal).toBe(true);
    expect(P.slice(1).every((p) => p.isAI)).toBe(true);
    expect(P.map((p) => p.startSlot)).toEqual([0, 3, 1, 2]);
    expect(P.slice(1).map((p) => p.difficulty)).toEqual(['normal', 'normal', 'easy']);
    expect(gm.isAlly(0, 1)).toBe(true);
    expect(gm.isHostile(0, 2) && gm.isHostile(0, 3) && gm.isHostile(1, 2) && gm.isHostile(1, 3)).toBe(true);
  });

  it('árvore COMPLETA liberada (16 unidades, 16 construções, todas as fichas), e tudo o que os objetivos exigem está liberado para o jogador local (nada travado por techLock)', async () => {
    const camp = getCampaign('war-alliance');
    const t = availableTech(camp, 5);
    expect(t.units.size).toBe(16);
    expect(t.buildings.size).toBe(16);
    expect(t.heroes.has('hero_brann')).toBe(true);
    for (const r of ['spell_blizzard', 'spell_flameshield', 'spell_invisibility', 'spell_polymorph', 'spell_holy_vision', 'ranger_sight', 'ranger_marksman']) expect(t.research.has(r), r).toBe(true);
    const { gm } = await boot();
    const locked = (arr) => arr.filter((r) => r && r.locked);
    for (const u of ['villager', 'knight', 'archer', 'cavalier', 'ballista', 'sapper', 'ranger', 'mage', 'templar', 'gryphon_rider', 'glider', 'tanker', 'barge', 'frigate', 'dreadnought', 'submersible']) {
      expect(locked(missingUnitRequirements(0, u, gm)), `unidade ${u}`).toEqual([]);
    }
    for (const b of ['cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'watchtower', 'stable', 'workshop', 'wall_human', 'arcane_tower', 'temple', 'aviary', 'shipyard', 'refinery', 'foundry', 'oil_platform']) {
      expect(locked(missingRequirements(0, b, gm)), `construção ${b}`).toEqual([]);
    }
    expect(locked(missingUpgradeRequirements(0, 'spell_blizzard', gm, 1))).toEqual([]);
    // a missão EXIGE (objetivos) só o que está liberado: s-arms e s-blizzard
    const def = gm.mission.def;
    for (const u of def.objectives.find((o) => o.id === 's-arms').units) expect(t.units.has(u.type), u.type).toBe(true);
    expect(t.research.has(def.objectives.find((o) => o.id === 's-blizzard').condition.id)).toBe(true);
    // e a IA inimiga/aliada não é restringida
    expect(gm.matchConfig.techRestriction.players).toEqual([0]);
  });

  it('Brann está na missão desde o início, vivo, perto do Paço; a campanha eleva o Paço ao nível 3 ao fim da abertura; Torre Arcana, Aviário, Estábulo e Oficina ficam construíveis', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('brann');
    expect(ids).toHaveLength(1);
    const b = gm.entitiesById.get(ids[0]);
    expect(b.type).toBe('hero_brann');
    expect(b.ownerId).toBe(0);
    expect(d(posOf(b), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier || 1).toBe(1);
    const later = await boot([{ name: 'espera', wait: 51 }], 52);
    expect(later.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier).toBe(3);
    expect(UNITS.mage.cost.gold).toBeGreaterThan(0);
  });

  it('objetivos: 3 primários (Farol 3 min, forte dos Lanças, forte de Brumar), 4 secundários e 3 ocultos; autoVictory off; ocultos invisíveis até cumpridos', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-hold', 'p-fort', 'p-ally']);
    expect(by(def, 'secondary')).toEqual(['s-convoy', 's-arms', 's-blizzard', 's-salt']);
    expect(by(def, 'hidden')).toEqual(['h-aurora', 'h-recruits', 'h-ruins']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-hold').condition).toMatchObject({ type: 'var', name: 'hold', op: '>=', value: 180 });
    expect(o('p-fort')).toMatchObject({ type: 'destroy', select: { tag: 'fort_hall' } });
    expect(o('p-ally').failWhen).toMatchObject({ type: 'dead', select: { tag: 'brumar_fort' } });
    expect(o('s-convoy')).toMatchObject({ type: 'escort', tag: 'convoy', count: 3, active: false });
    expect(o('s-arms')).toMatchObject({ type: 'train', units: [{ type: 'mage', count: 2 }, { type: 'ballista', count: 2 }, { type: 'cavalier', count: 2 }, { type: 'gryphon_rider', count: 1 }] });
    expect(o('s-salt')).toMatchObject({ type: 'destroy', select: { tag: 'salt_hall' } });
    expect(o('h-recruits')).toMatchObject({ type: 'rescue', tag: 'recruits', count: 4 });
    for (const id of ['h-aurora', 'h-recruits', 'h-ruins']) expect(gm.mission.objectives.get(id).visible, id).toBe(false);
  });
});

describe('m06 A Geada · os dois fortes e os clãs', () => {
  it('forte dos Lanças Quebradas: Salão (tag fort_hall) na base + 3 torres + guarda (5 guerreiros, 3 lanceiros, 2 ogros) + Drogath; o Salão do Sal Cinzento tem tag própria', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const ent = (tag) => gm.mission.tags.get(tag).map((i) => gm.entitiesById.get(i));
    const hall = ent('fort_hall');
    expect(hall).toHaveLength(1);
    expect(hall[0]).toMatchObject({ type: 'great_hall', ownerId: 2 });
    expect(d(posOf(hall[0]), A.enemy1Start)).toBeLessThan(1);
    const salt = ent('salt_hall');
    expect(salt).toHaveLength(1);
    expect(salt[0]).toMatchObject({ type: 'great_hall', ownerId: 3 });
    expect(d(posOf(salt[0]), A.enemy2Start)).toBeLessThan(1);
    const towers = ent('fort_tower');
    expect(towers).toHaveLength(3);
    for (const t of towers) { expect(t.ownerId).toBe(2); expect(d(posOf(t), A.enemy1Start)).toBeLessThan(30); expect(d(posOf(t), A.lighthouse)).toBeLessThan(d(A.enemy1Start, A.lighthouse)); }
    const guards = ent('fort_guard');
    const n = (t) => guards.filter((u) => u.type === t).length;
    expect({ grunt: n('grunt'), axe: n('axethrower'), ogre: n('ogre') }).toEqual({ grunt: 5, axe: 3, ogre: 2 });
    for (const u of guards) expect(gm.pathfinder.isWalkableWorld(u.mesh.position.x, u.mesh.position.z), `${u.type} #${u.id}`).toBe(true);
    const drogath = ent('drogath');
    expect(drogath).toHaveLength(1);
    expect(drogath[0]).toMatchObject({ type: 'hero_drogath', ownerId: 2 });
    expect(d(posOf(drogath[0]), A.enemy1Fort)).toBeLessThan(10);
  });

  it('forte de Brumar: Centro de IA aliada (tag brumar_fort), 2 torres, guarda de 4 espadachins e 3 arqueiros e a Dama Aurora (Cavaleiro nomeado aliado, presa ao forte)', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const ent = (tag) => gm.mission.tags.get(tag).map((i) => gm.entitiesById.get(i));
    const fort = ent('brumar_fort');
    expect(fort).toHaveLength(1);
    expect(fort[0]).toMatchObject({ type: 'castle', ownerId: 1 });
    expect(d(posOf(fort[0]), A.allyStart)).toBeLessThan(1);
    const towers = ent('brumar_tower');
    expect(towers).toHaveLength(2);
    for (const t of towers) { expect(t.ownerId).toBe(1); expect(t.type).toBe('watchtower'); expect(d(posOf(t), A.allyStart)).toBeLessThan(30); }
    const guard = ent('brumar_guard');
    expect(guard.filter((u) => u.type === 'knight')).toHaveLength(4);
    expect(guard.filter((u) => u.type === 'archer')).toHaveLength(3);
    for (const u of guard) expect(u.ownerId).toBe(1);
    const aurora = ent('aurora');
    expect(aurora).toHaveLength(1);
    expect(aurora[0]).toMatchObject({ type: 'cavalier', ownerId: 1 });
    expect(aurora[0].markColor).toBe('#f0abfc');
    expect(gm.mission.def.setup.find((s) => s.tag === 'aurora').displayName).toEqual({ 'pt-BR': 'Dama Aurora', en: 'Lady Aurora' });
    expect(d(posOf(aurora[0]), A.allyFort)).toBeLessThan(25);
  });

  it('levas roteirizadas: Sal Cinzento aos 330 s (base da Liga), Lanças aos 450 (Farol), desembarque no cais aos 600, Lanças aos 720 (Brumar), Sal aos 840 (base), Lanças aos 1020 (Farol, com balões), Sal aos 1140 (Brumar)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    const A = gm.terrain.mapDef.anchors;
    const comp = (id) => Object.fromEntries(trig(def, id).actions.find((a) => a.type === 'spawn').units.map((u) => [u.type, u.count]));
    const spec = [
      ['raid-s1', 330, 3, 'playerStart', { grunt: 4, axethrower: 2 }],
      ['raid-l1', 450, 2, 'lighthouse', { grunt: 5, axethrower: 3 }],
      ['raid-l2', 720, 2, 'allyFort', { ogre: 3, grunt: 4, catapult: 1 }],
      ['raid-s2', 840, 3, 'playerStart', { ogre: 2, grunt: 5, arsonist: 2 }],
      ['raid-l3', 1020, 2, 'lighthouse', { ogre: 4, grunt: 4, axethrower: 3, war_balloon: 2 }],
      ['raid-s3', 1140, 3, 'allyFort', { grunt: 6, berserker: 3 }]
    ];
    for (const [id, at, owner, target, units] of spec) {
      expect(trig(def, id).when.at, id).toBe(at);
      const a = trig(def, id).actions.find((x) => x.type === 'spawn');
      expect(a.owner, id).toBe(owner);
      expect(comp(id), id).toEqual(units);
      expect(a.order.kind).toBe('attackMove');
      expect(d(a.order, A[target]), `${id} alvo ${target}`).toBeLessThan(0.5);
      expect(d(a, A[owner === 2 ? 'enemy1Start' : 'enemy2Start']), `${id} sai da base do clã`).toBeLessThan(20);
    }
    // a 1ª sai: 6 unidades hostis (Sal Cinzento) aos 330 s
    const run = await boot([{ name: 'espera', wait: 331, run: (c) => { expect(c.tagged('raid')).toHaveLength(6); expect(c.tagged('raid').every((u) => u.ownerId === 3)).toBe(true); } }], 335);
    expect(run.outcome).toBeNull();
  }, 120000);

  it('cais congelado: aos 600 s uma barcaça do Sal Cinzento (com 4 guerreiros e 2 lanceiros a bordo e 1 Galé de escolta) parte do mar do norte rumo ao cais', async () => {
    const { gm } = await boot();
    const t = trig(gm.mission.def, 'dock-landing').actions.find((a) => a.type === 'spawnLanding');
    const A = gm.terrain.mapDef.anchors;
    expect(t.owner).toBe(3);
    expect(d(t, A.iceDockSea)).toBeLessThan(0.5);
    expect(d(t.unloadAt, A.iceDock)).toBeLessThan(0.5);
    expect(t.units).toEqual([{ type: 'grunt', count: 4 }, { type: 'axethrower', count: 2 }]);
    expect(d(t.order, A.lighthouse)).toBeLessThan(0.5);
    const run = await boot([{ name: 'espera', wait: 601 }], 603);
    const barge = run.gm.mission.tags.get('landing_barge').map((i) => run.gm.entitiesById.get(i));
    expect(barge).toHaveLength(1);
    expect(barge[0]).toMatchObject({ type: 'barge', ownerId: 3 });
    expect(run.gm.mission.tags.get('landing_escort')).toHaveLength(1);
    expect(run.gm.mission.tags.get('landing')).toHaveLength(6);
    expect(run.outcome).toBeNull();
  }, 120000);
});

describe('m06 A Geada · Farol Boreal (manter 3 minutos)', () => {
  const at = (c, name, dx = 0, dz = 0) => c.anchor(name, dx, dz);
  const sendTo = (c, name, n = 3) => { const p = at(c, name); c.mine().filter((u) => u.type !== 'villager').slice(0, n).forEach((u, i) => c.teleport(u, p.x + i * 1.5, p.z)); };

  it('com 2+ unidades no cabo e nenhum inimigo por perto o contador sobe (a lanterna acende); aos 180 s o primário se conclui', async () => {
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => sendTo(c, 'lighthouse', 3) },
      { name: 'meio', wait: 100, run: (c) => { expect(c.gm.mission.vars.hold).toBeGreaterThanOrEqual(95); expect(c.status('p-hold')).toBe('active'); } },
      { name: 'fim', wait: 95 }
    ], 200);
    expect(run.gm.mission.vars.hold).toBeGreaterThanOrEqual(180);
    expect(run.gm.mission.objectives.get('p-hold').status).toBe('completed');
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'beacon').lit).toBeGreaterThan(0);
    expect(run.outcome).toBeNull(); // só um primário
  }, 120000);

  it('1 unidade só não basta; um inimigo na área zera o contador (e avisa)', async () => {
    const one = await boot([{ name: 'ir', wait: 1, run: (c) => sendTo(c, 'lighthouse', 1) }, { name: 'espera', wait: 30 }], 40);
    expect(one.gm.mission.vars.hold).toBe(0);
    let before = 0;
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => sendTo(c, 'lighthouse', 3) },
      { name: 'sobe', wait: 40, run: (c) => { before = c.gm.mission.vars.hold; expect(before).toBeGreaterThan(30); const p = at(c, 'lighthouse', 6, 4); const e = c.gm.spawnUnit('grunt', p.x, p.z, 2); e.markColor = '#ff0000'; } },
      { name: 'zera', wait: 2 }
    ], 50);
    expect(run.gm.mission.vars.lost).toBeGreaterThanOrEqual(1);
    expect(run.gm.mission.vars.hold).toBeLessThan(before);
  }, 120000);
});

describe('m06 A Geada · comboio, recrutas e ocultas', () => {
  it('comboio de Brumar (secundária): 4 carregadores do jogador (nome e anel próprios) aos 480 s junto ao forte; a emboscada sai quando eles passam a meio caminho; 3 no destino concluem (+600 de ouro, +400 de madeira, +200 de pedra); 2 vivos = falha', async () => {
    const { gm } = await boot();
    expect(gm.mission.objectives.get('s-convoy').status).toBe('pending');
    let before;
    const ok = await boot([
      { name: 'chega', wait: 481 },
      { name: 'ver', wait: 1, run: (c) => {
        const cv = c.tagged('convoy');
        expect(cv).toHaveLength(4);
        for (const u of cv) { expect(u.ownerId).toBe(0); expect(u.type).toBe('villager'); expect(u.markColor).toBe('#22d3ee'); expect(d(posOf(u), c.anchor('convoyStart'))).toBeLessThan(8); }
        expect(c.status('s-convoy')).toBe('active');
        c.teleport(cv[0], c.anchor('convoyAmbush').x, c.anchor('convoyAmbush').z);
      } },
      { name: 'emboscada', wait: 2, run: (c) => { expect(c.tagged('ambush')).toHaveLength(8); expect(c.tagged('ambush').every((u) => u.ownerId === 3)).toBe(true); before = { ...c.gm.getPlayer(0).resources }; for (const u of c.tagged('convoy').slice(0, 3)) c.teleport(u, c.anchor('convoyEnd').x, c.anchor('convoyEnd').z); } },
      { name: 'fim', wait: 3 }
    ], 500);
    expect(ok.gm.mission.objectives.get('s-convoy').status).toBe('completed');
    const after = ok.gm.getPlayer(0).resources;
    expect(after.gold).toBeGreaterThanOrEqual(before.gold + 550);
    expect(after.wood).toBeGreaterThanOrEqual(before.wood + 350);
    expect(after.stone).toBeGreaterThanOrEqual(before.stone + 150);
    const lost = await boot([{ name: 'chega', wait: 481 }, { name: 'perde', wait: 1, run: (c) => c.slay(c.tagged('convoy').slice(0, 2)) }, { name: 'espera', wait: 3 }], 495);
    expect(lost.gm.mission.objectives.get('s-convoy').status).toBe('failed');
    expect(lost.outcome).toBeNull(); // secundária não decide
  }, 120000);

  it('recrutas presos (oculta): 4 Espadachins neutros com nome e anel próprios, guardados por 3 guerreiros e 1 lanceiro do Sal Cinzento; matar os guardas liberta os 4 e dá +250 de ouro; se um morre antes, o resgate falha', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const cap = gm.mission.tags.get('recruits').map((i) => gm.entitiesById.get(i));
    expect(cap).toHaveLength(4);
    for (const u of cap) { expect(u.ownerId).toBe(-1); expect(u.type).toBe('knight'); expect(u.markColor).toBe('#22d3ee'); expect(d(posOf(u), A.captive1)).toBeLessThan(6); }
    expect(gm.mission.def.setup.find((s) => s.tag === 'recruits').displayName).toEqual({ 'pt-BR': 'Recruta preso', en: 'Captive recruit' });
    const guards = gm.mission.tags.get('recruit_guard').map((i) => gm.entitiesById.get(i));
    expect(guards).toHaveLength(4);
    expect(guards.every((u) => u.ownerId === 3)).toBe(true);
    let before;
    const run = await boot([
      { name: 'guardas', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.slayTag('recruit_guard'); } },
      { name: 'livres', wait: 2, run: (c) => { if (c.obj('h-recruits').cur !== 4) throw new Error('devia estar em 4/4'); if (!c.tagged('recruits').every((u) => u.ownerId === 0)) throw new Error('recrutas do jogador'); } }
    ], 10);
    expect(run.gm.mission.objectives.get('h-recruits').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 240);
    const dead = await boot([{ name: 'morte', wait: 1, run: (c) => c.slay([c.tagged('recruits')[0]]) }], 6);
    expect(dead.gm.mission.objectives.get('h-recruits').status).toBe('failed');
    expect(dead.outcome).toBeNull();
  }, 120000);

  it('Posto do Faroleiro (oculta): chegar às ruínas dá +300 de madeira, +200 de ouro e +150 de pedra e acende o marco; o marco só aparece depois de explorado', async () => {
    const { gm } = await boot();
    expect(gm.mission.landmarks.find((l) => l.tag === 'keeper_post')).toBeTruthy();
    let before;
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => { before = { ...c.gm.getPlayer(0).resources }; const p = c.anchor('ruins1'); c.teleport(c.mine('knight')[0], p.x, p.z); } },
      { name: 'achado', wait: 2 }
    ], 12);
    expect(run.gm.mission.objectives.get('h-ruins').status).toBe('completed');
    const a = run.gm.getPlayer(0).resources;
    expect(a.wood).toBeGreaterThanOrEqual(before.wood + 290);
    expect(a.gold).toBeGreaterThanOrEqual(before.gold + 190);
    expect(a.stone).toBeGreaterThanOrEqual(before.stone + 140);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'keeper_post').lit).toBeGreaterThan(0);
  }, 60000);

  it('Nevasca (secundária): só conclui com a pesquisa feita; +300 de ouro. Salão do Sal Cinzento (secundária): destruir dá +500 de ouro', async () => {
    let before = 0;
    const ok = await boot([
      { name: 'pesq', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.gm.getPlayer(0).setResearchLevel('spell_blizzard', 1); } },
      { name: 'espera', wait: 3 }
    ], 8);
    expect(ok.gm.mission.objectives.get('s-blizzard').status).toBe('completed');
    expect(ok.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 290);
    const salt = await boot([{ name: 'pre', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; } }, { name: 'salao', wait: 1, run: (c) => c.slayTag('salt_hall') }, { name: 'espera', wait: 3 }], 10);
    expect(salt.gm.mission.objectives.get('s-salt').status).toBe('completed');
    expect(salt.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 490);
    expect(salt.outcome).toBeNull();
  }, 60000);

  it('armas combinadas (secundária): treinar 2 Magos, 2 Balistas, 2 Cavaleiros e 1 Grifo por comandos reais conclui; tudo liberado', async () => {
    const run = await boot([
      { name: 'rico', wait: 51, run: (c) => c.give({ gold: 4000, wood: 3000, stone: 1500 }) },
      { name: 'obras', every: 20, timeout: 900, until: (c) => c.status('s-arms') === 'completed', each: (c) => {
        const help = () => c.mine('villager').slice(0, 4).map((u) => u.id);
        for (const b of c.gm.buildings.filter((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) c.issue({ type: c.CMD.BUILD, unitIds: help(), buildingId: b.id });
        const has = (t) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === t && !x.isDead);
        const done = (t) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === t && !x.isDead && x.isConstructed);
        const pre = { barracks: 'farm', stable: 'barracks', workshop: 'barracks', arcane_tower: 'barracks', aviary: 'barracks' };
        const next = ['farm', 'barracks', 'stable', 'workshop', 'arcane_tower', 'aviary'].find((t) => !has(t));
        if (next && (!pre[next] || done(pre[next])) && !c.gm.buildings.some((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) place(c, next);
        const tr = (b, t, max) => { if (b && b.queue.length < 2 && c.gm.mission.trainedCount(0, t) + b.queue.length < max) c.issue({ type: c.CMD.TRAIN, buildingId: b.id, unitType: t }); };
        tr(c.bld('arcane_tower'), 'mage', 2); tr(c.bld('workshop'), 'ballista', 2); tr(c.bld('stable'), 'cavalier', 2); tr(c.bld('aviary'), 'gryphon_rider', 1);
      } }
    ], 1000);
    expect(run.gm.mission.objectives.get('s-arms').status).toBe('completed');
    expect(run.gm.mission.trainedCount(0, 'mage')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'ballista')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'cavalier')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'gryphon_rider')).toBeGreaterThanOrEqual(1);
  }, 240000);
});

function place(c, type) {
  const hq = posOf(c.bld('castle'));
  for (let r = 9; r < 48; r += 2.5) for (let a = 0; a < 16; a++) {
    const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8 + Math.PI / 2;
    const x = hq.x + Math.cos(ang) * r, z = hq.z + Math.sin(ang) * r;
    if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('villager').slice(0, 4).map((u) => u.id) }); return true; }
  }
  return false;
}

describe('m06 A Geada · desfecho', () => {
  it('derrotas: o Paço da Liga cair; Brann morrer; o forte de Brumar cair (cada uma com o texto próprio); a Dama Aurora cair NÃO é derrota (só falha a oculta)', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(2)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Paço da Liga/);
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
    expect(br.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
    const fort = await boot([{ name: 'queda', wait: 2, run: (c) => c.slayTag('brumar_fort') }], 20);
    expect(fort.outcome).toBe('defeat');
    expect(fort.gm.mission.outcomeText['pt-BR']).toMatch(/Brumar/);
    const aur = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('aurora') }, { name: 'espera', wait: 3 }], 12);
    expect(aur.outcome).toBeNull();
    expect(aur.gm.mission.objectives.get('h-aurora').status).toBe('failed');
  }, 120000);

  it('vitória: Farol + forte dos Lanças + Centro de Brumar de pé → cutscene final e vitória; um primário sozinho não vence; as secundárias não decidem; Aurora de pé rende +400', async () => {
    const hold = await boot([{ name: 'so-farol', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-hold', 'completed') }], 40);
    expect(hold.outcome).toBeNull();
    const fort = await boot([{ name: 'so-forte', wait: 1, run: (c) => c.slayTag('fort_hall') }], 40);
    expect(fort.gm.mission.objectives.get('p-fort').status).toBe('completed');
    expect(fort.outcome).toBeNull();
    const sec = await boot([{ name: 'sec', wait: 1, run: (c) => { for (const i of ['s-arms', 's-blizzard']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    let before;
    const fin = await boot([
      { name: 'pre', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; } },
      { name: 'farol', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-hold', 'completed') },
      { name: 'forte', wait: 1, run: (c) => c.slayTag('fort_hall') },
      { name: 'final', wait: 35 }
    ], 80);
    expect(fin.outcome).toBe('victory');
    expect(fin.gm.mission.objectives.get('p-ally').status).toBe('completed');
    expect(fin.gm.mission.objectives.get('h-aurora').status).toBe('completed');
    expect(fin.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 390);
  }, 120000);
});

describe('m06 A Geada · dificuldade', () => {
  it('investida precoce: Brann + 3 soldados do início contra o forte NÃO vencem nem derrubam o Salão dos Lanças; o Capitão cai e é derrota', async () => {
    const run = await boot(rush, 360);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
    expect(run.gm.mission.objectives.get('p-fort').status).not.toBe('completed');
    expect(run.gm.mission.tags.get('fort_hall').map((i) => run.gm.entitiesById.get(i)).every((b) => !b.isDead)).toBe(true);
  }, 120000);

  it('roteiro sem exército (só economia e obras) PERDE: o Paço, Brann ou o forte de Brumar caem para as levas', async () => {
    const run = await boot(noArmy, 1500);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.objectives.get('p-fort').status).not.toBe('completed');
  }, 240000);
});
