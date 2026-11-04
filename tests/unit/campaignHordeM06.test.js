import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { getMap } from '../../src/data/maps/index.js';
import { runAction } from '../../src/sim/missions/actions.js';
import { getCampaign } from '../../src/data/campaigns/index.js';
import { availableTech } from '../../src/campaign/campaign.js';
import { missingUnitRequirements, missingRequirements, missingUpgradeRequirements } from '../../src/sim/requirements.js';
import { noArmy, rush } from '../fixtures/campaign-playthrough/war-horde-06-fogo-no-gelo.js';

/**
 * M4-06 (espelho da M3-07) — m06 da Horda "Fogo no Gelo" (Prova de Fogo): o mesmo palco de A Geada (camp-06, 320, lagos congelados não navegáveis) com os lados
 * trocados. O jogador (Clãs do Cinzal, Drogath) fica a oeste; o aliado de IA é o Clã Marés Negras (Salão a leste, que não pode cair, com Zarruk Fornalha);
 * os inimigos são o forte de Brumar (nordeste, com o Capitão Brann e posto avançado no Farol) e a Guarda Real (noroeste, com cais congelado e desembarque).
 * Árvore COMPLETA liberada. Primários: manter o Farol Boreal 3 min, destruir o forte de Brumar, Salão aliado de pé; secundárias: comboio, armas combinadas,
 * Nuvem de Cinzas, Paço da Guarda Real; ocultas: Zarruk, talhadores presos, Posto do Faroleiro. O playthrough completo do robô (vitória, derrota,
 * determinismo) está em tests/fixtures/campaign-playthrough/war-horde-06-fogo-no-gelo.js e roda por campaignWorldPlaythrough.test.js.
 */
const ID = 'war-horde-06-fogo-no-gelo';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const trig = (def, id) => def.triggers.find((t) => t.id === id);

describe('m06 Fogo no Gelo · jogadores, tecnologia e Drogath', () => {
  it('4 jogadores: Clãs (local) e Marés Negras (IA orc aliada) no time 0; Brumar e Guarda Real (IAs humanas) no time 1; mesmo palco camp-06 e mesmos startSlots da Aliança', async () => {
    const { gm } = await boot();
    expect(gm.terrain.mapDef.id).toBe('camp-06-a-geada');
    const P = gm.mission.def.players;
    expect(P.map((p) => [p.factionId, p.team])).toEqual([['orc', 0], ['orc', 0], ['human', 1], ['human', 1]]);
    expect(P[0].isLocal).toBe(true);
    expect(P.slice(1).every((p) => p.isAI)).toBe(true);
    expect(P.map((p) => p.startSlot)).toEqual([0, 3, 1, 2]);
    expect(P.slice(1).map((p) => p.difficulty)).toEqual(['easy', 'easy', 'easy']); // a dificuldade está nas levas roteirizadas, nos fortes e na guarda (como nas m03 a m05)
    expect(gm.isAlly(0, 1)).toBe(true);
    expect(gm.isHostile(0, 2) && gm.isHostile(0, 3) && gm.isHostile(1, 2) && gm.isHostile(1, 3)).toBe(true);
  });

  it('árvore COMPLETA liberada (15 unidades, 16 construções, todas as pesquisas), e tudo o que os objetivos exigem está liberado para o jogador local', async () => {
    const t = availableTech(getCampaign('war-horde'), 5);
    expect(t.units.size).toBe(15);
    expect(t.buildings.size).toBe(16);
    expect(t.heroes.has('hero_drogath')).toBe(true);
    for (const r of ['berserker_regen', 'berserker_fury', 'spell_haste', 'spell_unholy_armor', 'spell_ash_cloud', 'spell_whirlwind', 'spell_runes', 'spell_death_touch', 'spell_raise_dead', 'cavalry_class']) expect(t.research.has(r), r).toBe(true);
    const { gm } = await boot();
    const locked = (arr) => arr.filter((r) => r && r.locked);
    for (const u of ['peon', 'grunt', 'axethrower', 'ogre', 'catapult', 'arsonist', 'berserker', 'war_balloon', 'necromancer', 'war_serpent', 'ogre_mage', 'tanker', 'barge', 'war_galley', 'iron_leviathan']) {
      expect(locked(missingUnitRequirements(0, u, gm)), `unidade ${u}`).toEqual([]);
    }
    for (const b of ['orc_house', 'orc_lumber_mill', 'pig_farm', 'orc_barracks', 'orc_forge', 'orc_watchtower', 'ogre_den', 'orc_workshop', 'wall_orc', 'ash_sanctum', 'storm_altar', 'serpent_nest', 'ship_dock', 'naval_forge', 'ash_cauldron', 'oil_platform']) {
      expect(locked(missingRequirements(0, b, gm)), `construção ${b}`).toEqual([]);
    }
    expect(locked(missingUpgradeRequirements(0, 'spell_ash_cloud', gm, 1))).toEqual([]);
    const def = gm.mission.def;
    for (const u of def.objectives.find((o) => o.id === 's-arms').units) expect(t.units.has(u.type), u.type).toBe(true);
    expect(t.research.has(def.objectives.find((o) => o.id === 's-cloud').condition.id)).toBe(true);
    expect(gm.matchConfig.techRestriction.players).toEqual([0]);
  });

  it('Drogath está na missão desde o início, vivo, perto do Salão; a campanha eleva o Salão ao nível 3 ao fim da abertura', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('drogath');
    expect(ids).toHaveLength(1);
    const h = gm.entitiesById.get(ids[0]);
    expect(h.type).toBe('hero_drogath');
    expect(h.ownerId).toBe(0);
    expect(d(posOf(h), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'great_hall').tier || 1).toBe(1);
    const later = await boot([{ name: 'espera', wait: 51 }], 52);
    expect(later.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'great_hall').tier).toBe(3);
  });

  it('objetivos: 3 primários (Farol 3 min, forte de Brumar, Salão aliado), 4 secundários e 3 ocultos; autoVictory off; ocultos invisíveis até cumpridos', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-hold', 'p-fort', 'p-ally']);
    expect(by(def, 'secondary')).toEqual(['s-convoy', 's-arms', 's-cloud', 's-guard']);
    expect(by(def, 'hidden')).toEqual(['h-zarruk', 'h-recruits', 'h-ruins']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-hold').condition).toMatchObject({ type: 'var', name: 'hold', op: '>=', value: 180 });
    expect(o('p-fort')).toMatchObject({ type: 'destroy', select: { tag: 'fort_hall' }, active: false }); // ativa quando o Farol é mantido
    expect(o('p-ally').failWhen).toMatchObject({ type: 'dead', select: { tag: 'tide_fort' } });
    expect(o('s-convoy')).toMatchObject({ type: 'escort', tag: 'convoy', count: 3, active: false });
    expect(o('s-arms')).toMatchObject({ type: 'train', units: [{ type: 'necromancer', count: 2 }, { type: 'catapult', count: 2 }, { type: 'ogre', count: 2 }, { type: 'war_serpent', count: 1 }] });
    expect(o('s-guard')).toMatchObject({ type: 'destroy', select: { tag: 'guard_hall' } });
    expect(o('h-recruits')).toMatchObject({ type: 'rescue', tag: 'recruits', count: 4 });
    for (const id of ['h-zarruk', 'h-recruits', 'h-ruins']) expect(gm.mission.objectives.get(id).visible, id).toBe(false);
  });
});

describe('m06 Fogo no Gelo · os dois fortes humanos e o aliado', () => {
  const ent = (gm, tag) => gm.mission.tags.get(tag).map((i) => gm.entitiesById.get(i));

  it('forte de Brumar: Paço (tag fort_hall) na base + 4 torres + guarda (5 espadachins, 4 arqueiros, 2 cavaleiros) + Capitão Brann; posto avançado no Farol (2 torres + guarda); o Paço da Guarda Real tem tag própria', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const hall = ent(gm, 'fort_hall');
    expect(hall).toHaveLength(1);
    expect(hall[0]).toMatchObject({ type: 'castle', ownerId: 2 });
    expect(d(posOf(hall[0]), A.enemy1Start)).toBeLessThan(1);
    const guardHall = ent(gm, 'guard_hall');
    expect(guardHall).toHaveLength(1);
    expect(guardHall[0]).toMatchObject({ type: 'castle', ownerId: 3 });
    expect(d(posOf(guardHall[0]), A.enemy2Start)).toBeLessThan(1);
    const towers = ent(gm, 'fort_tower');
    expect(towers).toHaveLength(4);
    for (const t of towers) { expect(t.ownerId).toBe(2); expect(t.type).toBe('watchtower'); expect(d(posOf(t), A.enemy1Start)).toBeLessThan(30); expect(d(posOf(t), A.lighthouse)).toBeLessThan(d(A.enemy1Start, A.lighthouse)); }
    const guards = ent(gm, 'fort_guard');
    const n = (t) => guards.filter((u) => u.type === t).length;
    expect({ knight: n('knight'), archer: n('archer'), cavalier: n('cavalier') }).toEqual({ knight: 5, archer: 4, cavalier: 2 });
    for (const u of guards) { expect(u.ownerId).toBe(2); expect(gm.pathfinder.isWalkableWorld(u.mesh.position.x, u.mesh.position.z), `${u.type} #${u.id}`).toBe(true); }
    const lt = ent(gm, 'light_tower');
    expect(lt).toHaveLength(2);
    for (const t of lt) { expect(t.ownerId).toBe(2); expect(d(posOf(t), A.lighthouse)).toBeLessThan(30); }
    const lg = ent(gm, 'light_guard');
    expect(lg).toHaveLength(9);
    expect(lg.every((u) => u.ownerId === 2 && d(posOf(u), A.lighthouse) < 22)).toBe(true);
    const brann = ent(gm, 'brann');
    expect(brann).toHaveLength(1);
    expect(brann[0]).toMatchObject({ type: 'hero_brann', ownerId: 2 });
    expect(d(posOf(brann[0]), A.enemy1Fort)).toBeLessThan(10);
  });

  it('forte dos Marés Negras: Salão de IA aliada (tag tide_fort), 2 torres orcs, guarda de 4 talhadores e 3 lanceiros e Zarruk Fornalha (Incendiário nomeado aliado, preso ao forte)', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const fort = ent(gm, 'tide_fort');
    expect(fort).toHaveLength(1);
    expect(fort[0]).toMatchObject({ type: 'great_hall', ownerId: 1 });
    expect(d(posOf(fort[0]), A.allyStart)).toBeLessThan(1);
    const towers = ent(gm, 'tide_tower');
    expect(towers).toHaveLength(2);
    for (const t of towers) { expect(t.ownerId).toBe(1); expect(t.type).toBe('orc_watchtower'); expect(d(posOf(t), A.allyStart)).toBeLessThan(30); }
    const guard = ent(gm, 'tide_guard');
    expect(guard.filter((u) => u.type === 'grunt')).toHaveLength(4);
    expect(guard.filter((u) => u.type === 'axethrower')).toHaveLength(3);
    for (const u of guard) expect(u.ownerId).toBe(1);
    const z = ent(gm, 'zarruk');
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ type: 'arsonist', ownerId: 1 });
    expect(z[0].markColor).toBe('#f0abfc');
    expect(gm.mission.def.setup.find((s) => s.tag === 'zarruk').displayName).toEqual({ 'pt-BR': 'Zarruk Fornalha', en: 'Zarruk Furnace' });
    expect(d(posOf(z[0]), A.allyFort)).toBeLessThan(25);
  });

  it('levas roteirizadas (unidades humanas): Guarda Real aos 330 s (base), Brumar aos 450 e 660 (Farol), desembarque no cais aos 600, Brumar aos 720 (Salão aliado), Guarda aos 840 (base), Brumar aos 1020 (Farol, com planadores), Guarda aos 1140 (Salão aliado)', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    const A = gm.terrain.mapDef.anchors;
    const comp = (id) => Object.fromEntries(trig(def, id).actions.find((a) => a.type === 'spawn').units.map((u) => [u.type, u.count]));
    const spec = [
      ['raid-s1', 330, 3, 'playerStart', { knight: 5, archer: 3 }],
      ['raid-l1', 450, 2, 'lighthouse', { knight: 5, archer: 3, cavalier: 1 }],
      ['raid-l1b', 660, 2, 'lighthouse', { knight: 6, archer: 3, cavalier: 2 }],
      ['raid-l2', 720, 2, 'allyFort', { cavalier: 2, knight: 4, ballista: 1 }],
      ['raid-s2', 840, 3, 'playerStart', { cavalier: 3, knight: 6, sapper: 2 }],
      ['raid-l3', 1020, 2, 'lighthouse', { cavalier: 5, knight: 5, archer: 4, glider: 3 }],
      ['raid-s3', 1140, 3, 'allyFort', { knight: 5, ranger: 3 }]
    ];
    for (const [id, at, owner, target, units] of spec) {
      expect(trig(def, id).when.at, id).toBe(at);
      const a = trig(def, id).actions.find((x) => x.type === 'spawn');
      expect(a.owner, id).toBe(owner);
      expect(comp(id), id).toEqual(units);
      expect(a.order.kind).toBe('attackMove');
      expect(d(a.order, A[target]), `${id} alvo ${target}`).toBeLessThan(0.5);
      expect(d(a, A[owner === 2 ? 'enemy1Start' : 'enemy2Start']), `${id} sai da base`).toBeLessThan(20);
    }
    const run = await boot([{ name: 'espera', wait: 331, run: (c) => { expect(c.tagged('raid')).toHaveLength(8); expect(c.tagged('raid').every((u) => u.ownerId === 3)).toBe(true); } }], 335);
    expect(run.outcome).toBeNull();
  }, 120000);

  it('reforços dos Marés Negras (IA aliada) chegam aos 480, 780 e 1080 s e ficam presos ao Salão', async () => {
    const { gm } = await boot();
    for (const [id, at] of [['tide-relief-1', 480], ['tide-relief-2', 780], ['tide-relief-3', 1080]]) {
      const t = trig(gm.mission.def, id);
      expect(t.when.at).toBe(at);
      const a = t.actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe(1);
      expect(a.guard.r).toBeGreaterThan(0);
    }
  });

  it('cais congelado: aos 600 s uma barcaça da Guarda Real (4 espadachins e 2 arqueiros a bordo e 1 Fragata de escolta) parte do mar do norte rumo ao cais', async () => {
    const { gm } = await boot();
    const t = trig(gm.mission.def, 'dock-landing').actions.find((a) => a.type === 'spawnLanding');
    const A = gm.terrain.mapDef.anchors;
    expect(t.owner).toBe(3);
    expect(d(t, A.iceDockSea)).toBeLessThan(0.5);
    expect(d(t.unloadAt, A.iceDock)).toBeLessThan(0.5);
    expect(t.units).toEqual([{ type: 'knight', count: 4 }, { type: 'archer', count: 2 }]);
    expect(t.escort).toEqual([{ type: 'frigate', count: 1 }]);
    expect(d(t.order, A.lighthouse)).toBeLessThan(0.5);
    // um jogador parado perderia antes dos 600 s: roda as ações do gatilho direto (como o jogo faria) e confere o resultado
    const run = await boot([{ name: 'cais', wait: 2, run: (c) => { for (const a of trig(c.gm.mission.def, 'dock-landing').actions) runAction(c.gm.mission, a); } }, { name: 'espera', wait: 2 }], 8);
    const barge = run.gm.mission.tags.get('landing_barge').map((i) => run.gm.entitiesById.get(i));
    expect(barge).toHaveLength(1);
    expect(barge[0]).toMatchObject({ type: 'barge', ownerId: 3 });
    expect(d(posOf(barge[0]), A.iceDockSea)).toBeLessThan(40);
    const esc = run.gm.mission.tags.get('landing_escort').map((i) => run.gm.entitiesById.get(i));
    expect(esc).toHaveLength(1);
    expect(esc[0]).toMatchObject({ type: 'frigate', ownerId: 3, layer: 'naval' });
    expect(run.gm.mission.tags.get('landing')).toHaveLength(6);
    expect(run.outcome).toBeNull();
  }, 120000);

});

describe('m06 Fogo no Gelo · Farol Boreal (manter 3 minutos)', () => {
  const at = (c, name, dx = 0, dz = 0) => c.anchor(name, dx, dz);
  const sendTo = (c, name, n = 3) => { const p = at(c, name); c.mine().filter((u) => u.type !== 'peon').slice(0, n).forEach((u, i) => c.teleport(u, p.x + i * 1.5, p.z)); };
  const clearCape = (c) => c.slayTag('light_guard'); // o posto avançado de Brumar guarda o cabo: é preciso limpá-lo para manter

  it('com 2+ unidades no cabo e nenhum inimigo por perto o contador sobe (a lanterna acende); aos 180 s o primário se conclui e ativa o forte', async () => {
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => { clearCape(c); sendTo(c, 'lighthouse', 3); } },
      { name: 'meio', wait: 100, run: (c) => { expect(c.gm.mission.vars.hold).toBeGreaterThanOrEqual(95); expect(c.status('p-hold')).toBe('active'); } },
      { name: 'fim', wait: 95 }
    ], 200);
    expect(run.gm.mission.vars.hold).toBeGreaterThanOrEqual(180);
    expect(run.gm.mission.objectives.get('p-hold').status).toBe('completed');
    expect(run.gm.mission.objectives.get('p-fort').status).toBe('active');
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'beacon').lit).toBeGreaterThan(0);
    expect(run.outcome).toBeNull();
  }, 120000);

  it('1 unidade só não basta; um inimigo na área zera o contador (e avisa)', async () => {
    const one = await boot([{ name: 'ir', wait: 1, run: (c) => { clearCape(c); sendTo(c, 'lighthouse', 1); } }, { name: 'espera', wait: 30 }], 40);
    expect(one.gm.mission.vars.hold).toBe(0);
    let before = 0;
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => { clearCape(c); sendTo(c, 'lighthouse', 3); } },
      { name: 'sobe', wait: 40, run: (c) => { before = c.gm.mission.vars.hold; expect(before).toBeGreaterThan(30); const p = at(c, 'lighthouse', 6, 4); const e = c.gm.spawnUnit('knight', p.x, p.z, 2); e.markColor = '#ff0000'; } },
      { name: 'zera', wait: 2 }
    ], 50);
    expect(run.gm.mission.vars.lost).toBeGreaterThanOrEqual(1);
    expect(run.gm.mission.vars.hold).toBeLessThan(before);
  }, 120000);
});

describe('m06 Fogo no Gelo · comboio, presos e ocultas', () => {
  it('comboio dos Marés Negras (secundária): 4 carregadores (Lacaios do jogador, nome e anel próprios) aos 480 s junto ao forte aliado; a emboscada da Guarda Real sai a meio caminho; 3 no destino concluem (+600 de ouro, +400 de madeira, +200 de pedra); 2 vivos = falha', async () => {
    const { gm } = await boot();
    expect(gm.mission.objectives.get('s-convoy').status).toBe('inactive');
    let before;
    const ok = await boot([
      { name: 'calma', wait: 340, run: (c) => c.slayTag('raid') }, // um jogador parado perderia aos ~480 s: a 1ª leva é desfeita para o teste chegar ao comboio
      { name: 'chega', wait: 141 },
      { name: 'ver', wait: 1, run: (c) => {
        const cv = c.tagged('convoy');
        expect(cv).toHaveLength(4);
        for (const u of cv) { expect(u.ownerId).toBe(0); expect(u.type).toBe('peon'); expect(u.markColor).toBe('#22d3ee'); expect(d(posOf(u), c.anchor('convoyStart'))).toBeLessThan(8); }
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
    const lost = await boot([{ name: 'calma', wait: 340, run: (c) => c.slayTag('raid') }, { name: 'chega', wait: 141 }, { name: 'perde', wait: 1, run: (c) => c.slay(c.tagged('convoy').slice(0, 2)) }, { name: 'espera', wait: 3 }], 495);
    expect(lost.gm.mission.objectives.get('s-convoy').status).toBe('failed');
    expect(lost.outcome).toBeNull(); // secundária não decide
  }, 120000);

  it('talhadores presos (oculta): 4 Talhadores neutros com nome e anel próprios, guardados por 3 espadachins e 1 arqueiro da Guarda Real; matar os guardas liberta os 4 e dá +250 de ouro; se um morre antes, o resgate falha', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const cap = gm.mission.tags.get('recruits').map((i) => gm.entitiesById.get(i));
    expect(cap).toHaveLength(4);
    for (const u of cap) { expect(u.ownerId).toBe(-1); expect(u.type).toBe('grunt'); expect(u.markColor).toBe('#22d3ee'); expect(d(posOf(u), A.captive1)).toBeLessThan(6); }
    expect(gm.mission.def.setup.find((s) => s.tag === 'recruits').displayName).toEqual({ 'pt-BR': 'Talhador preso', en: 'Captive Slasher' });
    const guards = gm.mission.tags.get('recruit_guard').map((i) => gm.entitiesById.get(i));
    expect(guards).toHaveLength(4);
    expect(guards.every((u) => u.ownerId === 3)).toBe(true);
    let before;
    const run = await boot([
      { name: 'guardas', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.slayTag('recruit_guard'); } },
      { name: 'livres', wait: 2, run: (c) => { if (c.obj('h-recruits').cur !== 4) throw new Error('devia estar em 4/4'); if (!c.tagged('recruits').every((u) => u.ownerId === 0)) throw new Error('presos do jogador'); } }
    ], 10);
    expect(run.gm.mission.objectives.get('h-recruits').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 240);
    const dead = await boot([{ name: 'morte', wait: 1, run: (c) => c.slay([c.tagged('recruits')[0]]) }], 6);
    expect(dead.gm.mission.objectives.get('h-recruits').status).toBe('failed');
    expect(dead.outcome).toBeNull();
  }, 120000);

  it('Posto do Faroleiro (oculta): chegar às ruínas dá +300 de madeira, +200 de ouro e +150 de pedra e acende o marco', async () => {
    const { gm } = await boot();
    expect(gm.mission.landmarks.find((l) => l.tag === 'keeper_post')).toBeTruthy();
    let before;
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => { before = { ...c.gm.getPlayer(0).resources }; const p = c.anchor('ruins1'); c.teleport(c.mine('grunt')[0], p.x, p.z); } },
      { name: 'achado', wait: 2 }
    ], 12);
    expect(run.gm.mission.objectives.get('h-ruins').status).toBe('completed');
    const a = run.gm.getPlayer(0).resources;
    expect(a.wood).toBeGreaterThanOrEqual(before.wood + 290);
    expect(a.gold).toBeGreaterThanOrEqual(before.gold + 190);
    expect(a.stone).toBeGreaterThanOrEqual(before.stone + 140);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'keeper_post').lit).toBeGreaterThan(0);
  }, 60000);

  it('Nuvem de Cinzas (secundária): só conclui com a pesquisa feita; +300 de ouro. Paço da Guarda Real (secundária): destruir dá +500 de ouro', async () => {
    let before = 0;
    const ok = await boot([
      { name: 'pesq', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.gm.getPlayer(0).setResearchLevel('spell_ash_cloud', 1); } },
      { name: 'espera', wait: 3 }
    ], 8);
    expect(ok.gm.mission.objectives.get('s-cloud').status).toBe('completed');
    expect(ok.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 290);
    const guard = await boot([{ name: 'pre', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; } }, { name: 'paco', wait: 1, run: (c) => c.slayTag('guard_hall') }, { name: 'espera', wait: 3 }], 10);
    expect(guard.gm.mission.objectives.get('s-guard').status).toBe('completed');
    expect(guard.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 490);
    expect(guard.outcome).toBeNull();
  }, 60000);

  it('armas combinadas (secundária): treinar 2 Necromantes, 2 Catapultas, 2 Ogros e 1 Serpe por comandos reais conclui; tudo liberado', async () => {
    const run = await boot([
      { name: 'rico', wait: 51, run: (c) => c.give({ gold: 4000, wood: 3000, stone: 1500 }) },
      { name: 'obras', every: 20, timeout: 900, until: (c) => c.status('s-arms') === 'completed', each: (c) => {
        c.slay(c.gm.allUnits.filter((u) => !u.isDead && c.gm.isHostile(0, u.ownerId) && d(posOf(u), c.anchor('playerStart')) < 70)); // o teste só mede o treino: levas e a IA de Brumar/Guarda não derrubam o Salão enquanto ele constrói
        const help = () => c.mine('peon').slice(0, 4).map((u) => u.id);
        for (const b of c.gm.buildings.filter((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) c.issue({ type: c.CMD.BUILD, unitIds: help(), buildingId: b.id });
        const has = (t) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === t && !x.isDead);
        const done = (t) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === t && !x.isDead && x.isConstructed);
        const pre = { orc_house: null, orc_barracks: 'pig_farm', ogre_den: 'orc_barracks', orc_workshop: 'orc_barracks', ash_sanctum: 'orc_barracks', serpent_nest: 'orc_barracks' };
        const houses = c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'orc_house' && !x.isDead).length;
        const next = houses < 3 ? 'orc_house' : ['pig_farm', 'orc_barracks', 'ogre_den', 'orc_workshop', 'ash_sanctum', 'serpent_nest'].find((t) => !has(t));
        if (next && (!pre[next] || done(pre[next])) && !c.gm.buildings.some((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) place(c, next);
        const tr = (b, t, max) => { if (b && b.queue.length < 2 && c.gm.mission.trainedCount(0, t) + b.queue.length < max) c.issue({ type: c.CMD.TRAIN, buildingId: b.id, unitType: t }); };
        tr(c.bld('ash_sanctum'), 'necromancer', 2); tr(c.bld('orc_workshop'), 'catapult', 2); tr(c.bld('ogre_den'), 'ogre', 2); tr(c.bld('serpent_nest'), 'war_serpent', 1);
      } }
    ], 1000);
    expect(run.gm.mission.objectives.get('s-arms').status).toBe('completed');
    expect(run.gm.mission.trainedCount(0, 'necromancer')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'catapult')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'ogre')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'war_serpent')).toBeGreaterThanOrEqual(1);
  }, 240000);
});

function place(c, type) {
  const hq = posOf(c.bld('great_hall'));
  for (let r = 9; r < 48; r += 2.5) for (let a = 0; a < 16; a++) {
    const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8 + Math.PI / 2;
    const x = hq.x + Math.cos(ang) * r, z = hq.z + Math.sin(ang) * r;
    if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('peon').slice(0, 4).map((u) => u.id) }); return true; }
  }
  return false;
}

describe('m06 Fogo no Gelo · desfecho', () => {
  it('derrotas: o Salão do Clã cair; Drogath morrer; o Salão dos Marés Negras cair (cada uma com o texto próprio); Zarruk cair NÃO é derrota (só falha a oculta); Brann cair não vence', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('great_hall').takeDamage(1e6, c.gm.getUnitsOf(2)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão do Clã/);
    const dr = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const fort = await boot([{ name: 'queda', wait: 2, run: (c) => c.slayTag('tide_fort') }], 20);
    expect(fort.outcome).toBe('defeat');
    expect(fort.gm.mission.outcomeText['pt-BR']).toMatch(/Marés Negras/);
    const z = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('zarruk') }, { name: 'espera', wait: 3 }], 12);
    expect(z.outcome).toBeNull();
    expect(z.gm.mission.objectives.get('h-zarruk').status).toBe('failed');
    const b = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }, { name: 'espera', wait: 3 }], 12);
    expect(b.outcome).toBeNull();
  }, 120000);

  it('vitória: Farol + forte de Brumar + Salão aliado de pé → cutscene final e vitória; um primário sozinho não vence; as secundárias não decidem; Zarruk de pé rende +400', async () => {
    const hold = await boot([{ name: 'so-farol', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-hold', 'completed') }], 40);
    expect(hold.outcome).toBeNull();
    const fort = await boot([{ name: 'so-forte', wait: 1, run: (c) => c.slayTag('fort_hall') }], 40);
    expect(fort.gm.mission.objectives.get('p-fort').status).toBe('inactive'); // o forte só vale depois de acender o Farol (a lanterna rasga a névoa)
    expect(fort.outcome).toBeNull();
    const sec = await boot([{ name: 'sec', wait: 1, run: (c) => { for (const i of ['s-arms', 's-cloud']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    let before;
    const fin = await boot([
      { name: 'pre', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; } },
      { name: 'farol', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-hold', 'completed') },
      { name: 'ativa', wait: 1, run: (c) => { if (c.status('p-fort') !== 'active') throw new Error('p-fort devia ativar com o Farol'); } },
      { name: 'forte', wait: 1, run: (c) => c.slayTag('fort_hall') },
      { name: 'final', wait: 35 }
    ], 80);
    expect(fin.outcome).toBe('victory');
    expect(fin.gm.mission.objectives.get('p-ally').status).toBe('completed');
    expect(fin.gm.mission.objectives.get('h-zarruk').status).toBe('completed');
    expect(fin.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 390);
  }, 120000);
});

describe('m06 Fogo no Gelo · dificuldade', () => {
  it('investida precoce: Drogath + a tropa do início contra o forte NÃO vencem nem derrubam o Paço de Brumar; o herói cai e é derrota', async () => {
    const run = await boot(rush, 360);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    expect(run.gm.mission.objectives.get('p-fort').status).not.toBe('completed');
    expect(run.gm.mission.tags.get('fort_hall').map((i) => run.gm.entitiesById.get(i)).every((b) => !b.isDead)).toBe(true);
  }, 120000);

  it('roteiro sem exército (só economia e obras) PERDE: o Salão, Drogath ou o Salão aliado caem para as levas', async () => {
    const run = await boot(noArmy, 1500);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.objectives.get('p-fort').status).not.toBe('completed');
  }, 240000);

  it('o mapa é o mesmo de A Geada: 4 bases a >= 130 u entre si e o Farol a >= 70 u de todas; a Horda parte do oeste', async () => {
    const { gm } = await boot();
    const m = getMap('camp-06-a-geada');
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(d(m.startSlots[i], m.startSlots[j]), `bases ${i}-${j}`).toBeGreaterThanOrEqual(130);
    for (const s of m.startSlots) expect(d(m.anchors.lighthouse, s)).toBeGreaterThanOrEqual(70);
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq');
    expect(hall.type).toBe('great_hall');
    expect(d(posOf(hall), m.anchors.playerStart)).toBeLessThan(5);
    expect(m.anchors.playerStart.x).toBeLessThan(m.anchors.lighthouse.x - 80);
  });
});
