import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { rush, noArmy } from '../fixtures/campaign-playthrough/war-horde-10-cabo-aurora.js';

/**
 * M4-10 (espelho da M3-11) — m10 da Horda "Desembarque no Cabo Aurora" (mapa `camp-10-cabo-aurora`, 384 de lado, naval). Os Clãs do Cinzal começam na
 * ilha leste (sem caminho a pé até Velmara) com Drogath, Vozgul (herói liberado aqui), 2 Barcaças e 12 guerreiros na praia de partida. Travessia do Mar
 * Fendido: embarcam a tropa (LOAD), desembarcam em Velmara (UNLOAD) e fundam o Marco da Colônia, Brasa-Alta (`spawnBuilding` quando uma unidade chega à
 * praia). Primários: o Marco de pé e as 3 Torres da guarda costeira destruídas. Secundários: no máximo uma Barcaça perdida, afundar a patrulha de 3
 * Fragatas do Farol e treinar 2 Necromantes. Oculto: achar o Bosque do Orvalho (só se alcança pelo mar). O playthrough do robô está em
 * tests/fixtures/campaign-playthrough/war-horde-10-cabo-aurora.js.
 */
const ID = 'war-horde-10-cabo-aurora';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
const DEF = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-horde/m10-cabo-aurora.json', import.meta.url), 'utf8'));
const campaign = JSON.parse(readFileSync(new URL('../../src/data/campaigns/war-horde/campaign.json', import.meta.url), 'utf8'));
const tagged = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i)).filter(Boolean);

describe('m10 Cabo Aurora · a missão', () => {
  it('mapa camp-10-cabo-aurora; os Clãs começam na ilha: Salão no nível 3, Drogath e Vozgul, 2 Barcaças e 12 guerreiros na praia de partida; 1500 de petróleo', async () => {
    const { gm } = await boot([{ name: 'espera', wait: 1 }], 2);
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-10-cabo-aurora');
    expect(DEF.autoVictory).toBe(false);
    const hall = tagged(gm, 'home_hall')[0];
    expect(hall).toMatchObject({ type: 'great_hall', ownerId: 0 });
    expect(hall.tier).toBe(3);
    expect(d(pos(hall), A.playerStart)).toBeLessThan(5);
    const drogath = tagged(gm, 'drogath')[0];
    const vozgul = tagged(gm, 'vozgul')[0];
    expect(drogath).toMatchObject({ type: 'hero_drogath', ownerId: 0 });
    expect(vozgul).toMatchObject({ type: 'hero_vozgul', ownerId: 0 });
    expect(d(pos(drogath), A.playerStart)).toBeLessThanOrEqual(20);
    for (const t of ['barge1', 'barge2']) {
      const b = tagged(gm, t)[0];
      expect(b).toMatchObject({ type: 'barge', ownerId: 0, layer: 'naval' });
      expect(d(pos(b), A.beach1)).toBeLessThanOrEqual(16);
    }
    const troops = tagged(gm, 'clan_troops');
    expect(troops).toHaveLength(12);
    for (const u of troops) expect(d(pos(u), A.beach1)).toBeLessThanOrEqual(16);
    expect(gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(1500);
  });

  it('Aurelan: 3 Torres da guarda costeira, guarnição, patrulha de 3 Fragatas e o Marco ainda não existe', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const towers = tagged(gm, 'coast_tower');
    expect(towers).toHaveLength(3);
    towers.forEach((t, i) => { expect(t).toMatchObject({ type: 'watchtower', ownerId: 1 }); expect(d(pos(t), A[`coastTower${i + 1}`])).toBeLessThan(5); });
    const guard = tagged(gm, 'coast_guard');
    expect(guard).toHaveLength(7);
    expect(guard.every((u) => u.ownerId === 1)).toBe(true);
    const patrol = tagged(gm, 'patrol_frigate');
    expect(patrol).toHaveLength(3);
    for (const f of patrol) expect(f).toMatchObject({ type: 'frigate', ownerId: 1, layer: 'naval' });
    expect(tagged(gm, 'colony')).toHaveLength(0);
    expect(gm.buildings.filter((b) => b.ownerId === 0 && b.type === 'great_hall')).toHaveLength(1);
  });

  it('objetivos: primários (Marco, 3 Torres), secundários (Barcaças, patrulha, Necromantes), oculto (Bosque do Orvalho); Vozgul liberado nesta missão', () => {
    expect(by(DEF, 'primary')).toEqual(['p-colony', 'p-towers']);
    expect(by(DEF, 'secondary')).toEqual(['s-barges', 's-patrol', 's-necros']);
    expect(by(DEF, 'hidden')).toEqual(['h-grove']);
    const o = (id) => DEF.objectives.find((x) => x.id === id);
    expect(o('p-colony')).toMatchObject({ type: 'flag' });
    expect(o('p-towers')).toMatchObject({ type: 'destroy', select: { tag: 'coast_tower' }, count: 3 });
    expect(o('s-barges').failWhen).toMatchObject({ type: 'dead', select: { unitType: 'barge', owner: 'player' }, count: 2 });
    expect(o('s-patrol')).toMatchObject({ type: 'destroy', select: { tag: 'patrol_frigate' }, count: 3 });
    expect(o('s-necros')).toMatchObject({ type: 'train', unitType: 'necromancer', count: 2 });
    expect(o('h-grove')).toMatchObject({ type: 'flag' });
    expect(campaign.missions.find((m) => m.id === ID).unlocks.heroes).toEqual(['hero_vozgul']);
  });

  it('ondas de Aurelan: 300 s (terra à praia), 480 s (Balista e tropa), 600 s (3 fragatas à praia), 780 s (2 Balistas, Cavaleiros)', () => {
    const get = (id) => DEF.triggers.find((t) => t.id === id);
    expect([get('raid-1').when.at, get('raid-2').when.at, get('fleet-raid').when.at, get('raid-3').when.at]).toEqual([300, 480, 600, 780]);
    const fleet = get('fleet-raid').actions.find((a) => a.type === 'spawn');
    expect(fleet).toMatchObject({ owner: 1, unitType: 'frigate', count: 3, anchor: 'patrolSea' });
  });

  it('o Marco (great_hall) nasce quando uma unidade dos Clãs chega à praia (gatilho de área, uma vez) e conclui p-colony', async () => {
    const t = DEF.triggers.find((x) => x.id === 'landed');
    expect(t.when).toMatchObject({ type: 'area', owner: 'player', area: { anchor: 'landingZone', r: 16 } });
    expect(t.once).toBe(true);
    expect(t.actions.find((a) => a.type === 'spawnBuilding')).toMatchObject({ owner: 'player', buildingType: 'great_hall', anchor: 'colonyMark', tag: 'colony' });
    const run = await boot([
      { name: 'antes', wait: 2, run: (c) => { if (c.status('p-colony') === 'completed') throw new Error('cedo'); } },
      { name: 'praia', run: (c) => { const l = c.anchor('landingZone'); c.teleport(c.mine('grunt')[0], l.x, l.z); } },
      { name: 'depois', wait: 3 }
    ], 12);
    const marco = tagged(run.gm, 'colony');
    expect(marco).toHaveLength(1);
    expect(marco[0]).toMatchObject({ type: 'great_hall', ownerId: 0 });
    expect(marco[0].tier).toBe(1);
    expect(d(pos(marco[0]), run.gm.terrain.mapDef.anchors.colonyMark)).toBeLessThan(5);
    expect(run.gm.mission.objectives.get('p-colony').status).toBe('completed');
    expect(run.outcome).toBeNull();
  }, 60000);

  it('Barcaças: perder as duas cancela s-barges; perder uma só (e fundar o Marco) completa; torres derrubadas completam p-towers', async () => {
    const two = await boot([{ name: 'afunda', wait: 1, run: (c) => { c.slayTag('barge1'); c.slayTag('barge2'); } }, { name: 'f', wait: 3 }], 8);
    expect(two.gm.mission.objectives.get('s-barges').status).toBe('failed');
    const one = await boot([
      { name: 'afunda', wait: 1, run: (c) => c.slayTag('barge1') },
      { name: 'praia', run: (c) => { const l = c.anchor('landingZone'); c.teleport(c.mine('grunt')[0], l.x, l.z); } },
      { name: 'torres', wait: 3, run: (c) => c.slayTag('coast_tower') },
      { name: 'f', wait: 3 }
    ], 12);
    expect(one.gm.mission.objectives.get('s-barges').status).toBe('completed');
    expect(one.gm.mission.objectives.get('p-towers').status).toBe('completed');
  }, 60000);

  it('objetivo oculto: Vozgul no Bosque do Orvalho completa e dá +150 de ouro', async () => {
    let gold0 = 0;
    const run = await boot([
      { name: 'a', wait: 1, run: (c) => { gold0 = c.gm.getPlayer(0).resources.gold; if (c.status('h-grove') === 'completed') throw new Error('cedo'); } },
      { name: 'bosque', run: (c) => { const w = c.anchor('isletWell'); c.teleport(c.tagged('vozgul')[0], w.x, w.z); } },
      { name: 'f', wait: 3 }
    ], 10);
    expect(run.gm.mission.objectives.get('h-grove').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(gold0 + 140);
    expect(run.outcome).toBeNull();
  }, 60000);
});

describe('m10 Cabo Aurora · desfecho', () => {
  it('derrotas: o Salão da ilha cair é derrota; Drogath morrer é derrota; Vozgul morrer não é', async () => {
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.slayTag('home_hall') }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const dr = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const vz = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('vozgul') }], 12);
    expect(vz.outcome).toBeNull();
  }, 120000);

  it('vitória pelos dois primários (cutscene final); as secundárias e a oculta não decidem', async () => {
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of ['s-patrol', 's-necros', 'h-grove']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of ['p-colony', 'p-towers']) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
  }, 60000);
});

describe('m10 Cabo Aurora · dificuldade', () => {
  it('investida por terra (a ilha não tem caminho a pé até Velmara): a tropa do início não vence nem funda o Marco', async () => {
    const run = await boot(rush, 650);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-colony').status).not.toBe('completed');
    expect(run.gm.mission.objectives.get('p-towers').status).not.toBe('completed');
  }, 120000);

  it('roteiro só de economia (sem exército, sem frota, sem travessia): não vence em 15 min', async () => {
    const run = await boot(noArmy, 900);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-towers').status).not.toBe('completed');
    expect(run.gm.mission.objectives.get('p-colony').status).not.toBe('completed');
  }, 180000);
});
