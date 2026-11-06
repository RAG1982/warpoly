import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { runAction } from '../../src/sim/missions/actions.js';
import { getLanguage, setLanguage } from '../../src/i18n/index.js';
import { buildObjectivesModel } from '../../src/ui/missionPresentation.js';
import { rush, noArmy } from '../fixtures/campaign-playthrough/war-horde-09-o-ultimo-poco.js';

/**
 * M4-09 (espelho da M3-10) — m09 da Horda "O Último Poço": o mesmo palco de Miragem (camp-09, deserto, 320, três poços) com os lados invertidos. O jogador (Clãs do
 * Cinzal, startSlot 1, margem leste) desembarca por Barcaça na cabeça de ponte (`bridgehead2`) e tem Drogath e o Acampamento prontos; Aurelan (IA easy, slot 0) tem o
 * Castelo e um Aviário. Primários: tomar os três poços 1 min, erguer o Forte do Poço (3 Torres de Vigia no sítio `fortSite2`), resistir 480 s e repelir a
 * contra-ofensiva do Marechal Dorian (36 dos 42 soldados das 3 levas de 380/440/470 s); secundárias: Aviário de Aurelan, 2 Serpes de Guerra, 6 Lanceiros-Machado;
 * oculta: nenhum soldado de Dorian chega a um poço. A Anciã Ulma morre (só diálogo) na cena final. Playthrough do robô: tests/fixtures/campaign-playthrough/war-horde-09-o-ultimo-poco.js.
 */
const ID = 'war-horde-09-o-ultimo-poco';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const trig = (def, id) => def.triggers.find((t) => t.id === id);
const PRIMARY = ['p-wells', 'p-fort', 'p-survive', 'p-dorian'];
const SECONDARY = ['s-aviary', 's-serpents', 's-lancers'];

describe('m09 O Último Poço · cenário', () => {
  it('mesmo palco camp-09; Salão do Clã no slot 1 (leste) nível 3 aos 40 s, Drogath e Acampamento prontos; Castelo e Aviário de Aurelan no slot 0', async () => {
    const { gm } = await boot([{ name: 'espera', wait: 41 }], 42);
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-09-miragem');
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq');
    expect(hall.type).toBe('great_hall');
    expect(d(pos(hall), A.enemyStart)).toBeLessThan(5);
    expect(hall.tier).toBe(3);
    const dr = gm.entitiesById.get(gm.mission.tags.get('drogath')[0]);
    expect(dr.type).toBe('hero_drogath');
    expect(dr.ownerId).toBe(0);
    expect(gm.buildings.some((b) => b.ownerId === 0 && b.type === 'orc_barracks' && b.isConstructed)).toBe(true);
    const castle = gm.buildings.find((b) => b.ownerId === 1 && b.role === 'hq');
    expect(castle.type).toBe('castle');
    expect(d(pos(castle), A.playerStart)).toBeLessThan(5);
    const av = gm.mission.tags.get('aurelan_aviary').map((i) => gm.entitiesById.get(i));
    expect(av).toHaveLength(1);
    expect(av[0]).toMatchObject({ type: 'aviary', ownerId: 1 });
    expect(d(pos(av[0]), A.aviarySite)).toBeLessThan(5);
    expect(gm.isHostile(0, 1)).toBe(true);
  });

  it('2 jogadores: Clãs do Cinzal (orc, local, time 0, slot 1) e Tropas de Aurelan (humano, IA easy, time 1, slot 0)', async () => {
    const { gm } = await boot();
    const P = gm.mission.def.players;
    expect(P.map((p) => [p.factionId, p.team, p.startSlot])).toEqual([['orc', 0, 1], ['human', 1, 0]]);
    expect(P[0].isLocal).toBe(true);
    expect(P[1]).toMatchObject({ isAI: true, difficulty: 'easy' });
  });

  it('objetivos: 4 primários, 3 secundárias, 1 oculta; autoVictory desligado', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(PRIMARY);
    expect(by(def, 'secondary')).toEqual(SECONDARY);
    expect(by(def, 'hidden')).toEqual(['h-intact']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-survive')).toMatchObject({ type: 'survive', seconds: 480 });
    expect(o('p-dorian')).toMatchObject({ type: 'destroy', select: { tag: 'dorian_force' }, count: 36 });
    expect(o('s-aviary')).toMatchObject({ type: 'destroy', select: { tag: 'aurelan_aviary' } });
    expect(o('s-serpents').units).toEqual([{ type: 'war_serpent', count: 2 }]);
    expect(o('s-lancers').units).toEqual([{ type: 'axethrower', count: 6 }]);
  });

  it('cabeça de ponte: a Barcaça do Clã desembarca 6 guerreiros (tag landing_clan) em bridgehead2; as Marés Negras mandam 6 aos 300 s', async () => {
    const { gm } = await boot([], 2);
    const tagged = gm.mission.tags.get('landing_clan') || [];
    expect(tagged).toHaveLength(6);
    for (const id of tagged) expect(gm.entitiesById.get(id).ownerId).toBe(0);
    const barge = gm.getUnitsOf(0).find((u) => u.type === 'barge');
    expect(barge.layer).toBe('naval');
    const t = trig(gm.mission.def, 'mares-negras');
    expect(t.when.at).toBe(300);
    const land = t.actions.find((a) => a.type === 'spawnLanding');
    expect(land).toMatchObject({ owner: 'player', tag: 'tides_force' });
    expect(land.units).toEqual([{ type: 'ogre', count: 2 }, { type: 'grunt', count: 4 }]);
  });
});

describe('m09 O Último Poço · poços e Forte', () => {
  it('3 marcos water_well sempre visíveis, rótulo pt-BR/en, raio 9 = o dos gatilhos, nas âncoras waterWell1..3', async () => {
    const { gm } = await boot();
    const wells = gm.mission.landmarks.filter((l) => l.kind === 'water_well');
    expect(wells).toHaveLength(3);
    const A = gm.terrain.mapDef.anchors;
    for (const [i, w] of wells.entries()) {
      expect(w.known).toBe(true);
      expect(w.label).toMatchObject({ 'pt-BR': 'Poço', en: 'Well' });
      expect(w.radius).toBe(9);
      expect(d(w, A[`waterWell${i + 1}`])).toBeLessThan(0.01);
    }
    for (const c of trig(gm.mission.def, 'wells-tick').when.all) expect(c.area.r).toBe(9);
  });

  it('wellStates: só unidade DENTRO do anel ocupa; inimigo na folga contesta; painel mostra "Poços ocupados: n/3"', async () => {
    const { gm } = await boot([], 1);
    const wells = gm.mission.landmarks.filter((l) => l.kind === 'water_well');
    const st = () => { gm.simStep(1 / 20); return [...gm.mission.wellStates().values()]; };
    expect(st()).toEqual([0, 0, 0]);
    const u = gm.getUnitsOf(0).find((x) => x.type === 'grunt' && !x.isDead);
    const place = (unit, p, dx = 0) => { unit.mesh.position.x = p.x + dx; unit.mesh.position.z = p.z; };
    place(u, wells[1], 12);
    expect(st()[1]).toBe(0);
    place(u, wells[1], 5);
    expect(st()[1]).toBe(1);
    const snap = gm.mission.snapshot().objectives.find((o) => o.id === 'p-wells');
    expect(snap.wells).toEqual({ occupied: 1, total: 3 });
    const lang0 = getLanguage();
    setLanguage('pt-BR', { persist: false });
    expect(buildObjectivesModel({ objectives: [snap] }, 'pt-BR').primary[0].progress).toMatch(/^Poços ocupados: 1\/3 · \d+ s$/);
    setLanguage(lang0, { persist: false });
    const foe = gm.getUnitsOf(1).find((x) => !x.isDead && x.mesh);
    place(foe, wells[1], -11);
    expect(st()[1]).toBe(2);
  });

  it('as 3 unidades nos anéis por 60 s completam os poços (+150 de ouro); inimigo perto zera o contador', async () => {
    let gold0 = 0;
    const run = await boot([
      { name: 'ini', wait: 1, run: (c) => { gold0 = c.gm.getPlayer(0).resources.gold; } },
      {
        name: 'poços', run: (c) => {
          const us = c.mine('grunt').slice(0, 3).concat(c.mine('axethrower').slice(0, 0));
          ['waterWell1', 'waterWell2', 'waterWell3'].forEach((n, i) => c.teleport(us[i], c.anchor(n).x, c.anchor(n).z));
        },
        each: () => {}, until: (c) => c.status('p-wells') === 'completed' || c.seconds > 140, timeout: 200
      }
    ], 140);
    expect(run.gm.mission.objectives.get('p-wells').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(gold0 + 100);
    const t = trig(run.gm.mission.def, 'wells-reset');
    expect(t.when.all[1].any).toHaveLength(3);
    expect(t.actions.some((a) => a.type === 'setVar' && a.value === 0)).toBe(true);
  }, 120000);

  it('Forte do Poço: 3 Torres de Vigia concluídas a ≤ 24 u de fortSite2 completam p-fort; fora do anel não contam', async () => {
    const run = await boot([
      {
        name: 'fora', wait: 1, run: (c) => {
          const h = c.anchor('enemyStart');
          for (let i = 0; i < 3; i++) runAction(c.gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'orc_watchtower', x: h.x + 30 + i * 6, z: h.z + 20 });
        }
      },
      { name: 'espera1', wait: 2, run: (c) => { if (c.status('p-fort') === 'completed') throw new Error('torres fora do sítio não contam'); } },
      {
        name: 'dentro', run: (c) => {
          const f = c.anchor('fortSite2');
          for (let i = 0; i < 3; i++) runAction(c.gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'orc_watchtower', x: f.x - 8 + i * 8, z: f.z + 4 });
        }
      },
      { name: 'espera2', wait: 3 }
    ], 12);
    expect(run.gm.mission.objectives.get('p-fort').status).toBe('completed');
    expect(run.outcome).toBeNull();
  }, 60000);
});

describe('m09 O Último Poço · contra-ofensiva de Dorian', () => {
  it('cronograma: raides 150/270 s, Marés Negras 300 s, Dorian 380 s, Grifos 440 s, última leva 470 s; dorian_force soma 42 (36 exigidos)', async () => {
    const def = (await boot([], 0.2)).gm.mission.def;
    expect(['raid-1', 'raid-2', 'mares-negras', 'dorian-march', 'gryphons', 'last-push'].map((id) => trig(def, id).when.at)).toEqual([150, 270, 300, 380, 440, 470]);
    const force = def.triggers.flatMap((t) => t.actions).filter((a) => a.type === 'spawn' && a.tag === 'dorian_force');
    expect(force).toHaveLength(3);
    for (const a of force) expect(a.owner).toBe(1);
    const total = force.flatMap((a) => a.units).reduce((n, u) => n + u.count, 0);
    expect(total).toBe(42);
    expect(def.objectives.find((o) => o.id === 'p-dorian').count).toBeLessThan(total);
    const types = new Set(force.flatMap((a) => a.units).map((u) => u.type));
    for (const t of ['cavalier', 'ballista', 'gryphon_rider']) expect(types.has(t), t).toBe(true);
  });

  it('aos 380 s nascem Dorian (Cavaleiro nomeado, tag dorian, fora do objetivo) e 19 soldados da força; antes disso não há ninguém', async () => {
    const run = await boot([
      { name: 'antes', wait: 379, run: (c) => { if (c.tagged('dorian').length || c.tagged('dorian_force').length) throw new Error('cedo'); } },
      { name: 'depois', wait: 3 }
    ], 384);
    const dor = run.gm.mission.tags.get('dorian').map((i) => run.gm.entitiesById.get(i));
    expect(dor).toHaveLength(1);
    expect(dor[0]).toMatchObject({ type: 'cavalier', ownerId: 1 });
    expect(run.gm.mission.tags.get('dorian_force')).toHaveLength(19);
    expect(run.gm.mission.tags.get('dorian_force')).not.toContain(dor[0].id);
  }, 120000);
});

describe('m09 O Último Poço · Ulma e desfecho', () => {
  it('cena final: Ulma se despede no poço do leste e Drogath herda o Fogo (só diálogo, sem unidade de Ulma)', async () => {
    const def = (await boot([], 0.2)).gm.mission.def;
    const fin = trig(def, 'all-done').actions.find((a) => a.type === 'cutscene');
    const lines = fin.steps.map((s) => s.dialog);
    expect(lines[0].speaker.en).toBe('Elder Ulma');
    expect(lines.some((l) => /não se levantou/.test(l.text['pt-BR']))).toBe(true);
    expect(lines.at(-1).speaker.en).toBe('Drogath Emberfist');
    expect(lines.at(-1).text['pt-BR']).toMatch(/Fogo/);
    const all = JSON.stringify(def);
    expect(all).not.toMatch(/hero_ulma/);
    const retreat = trig(def, 'dorian-retreat');
    expect(retreat.when).toMatchObject({ type: 'objective', id: 'p-dorian', status: 'completed' });
    expect(retreat.actions.find((a) => a.type === 'order')).toMatchObject({ kind: 'move', select: { tag: 'dorian' } });
    const hid = def.objectives.find((o) => o.id === 'h-intact');
    expect(JSON.stringify(hid.condition)).toMatch(/p-dorian/);
    expect(JSON.stringify(hid.condition)).toMatch(/breaches/);
  });

  it('derrotas: Salão e Drogath; vitória só com os 4 primários (cena final); secundárias não decidem', async () => {
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.bld('great_hall').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const dr = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of SECONDARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const tres = await boot([{ name: 't', wait: 1, run: (c) => { for (const i of PRIMARY.slice(0, 3)) c.gm.mission.setObjectiveStatus(i, 'completed'); } }, { name: 'e', wait: 20 }], 30);
    expect(tres.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of PRIMARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
    expect(fin.gm.mission.objectives.get('h-intact').status).toBe('completed');
  }, 60000);
});

describe('m09 O Último Poço · dificuldade', () => {
  it('investida precoce: só as unidades do início sobre o Castelo de Aurelan não vencem', async () => {
    const run = await boot(rush, 650);
    expect(run.outcome).not.toBe('victory');
  }, 120000);

  it('roteiro sem tropa nova nem torres (só economia): a contra-ofensiva derruba o Salão e PERDE', async () => {
    const run = await boot(noArmy, 1200);
    expect(run.outcome).toBe('defeat');
    expect(run.seconds).toBeLessThan(1000);
  }, 180000);
});
