import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { rush, noArmy } from '../fixtures/campaign-playthrough/war-horde-07-casa-no-brejo.js';

/**
 * M4-07 (espelho da M3-08) — m07 da Horda "Casa no Brejo": mesmo palco do Brejo Mudo (camp-07), lados invertidos. O jogador (Clãs do Cinzal) defende a margem
 * noroeste; Hurgan Lança-Partida (IA orc fácil, aliada, mesmo time) ocupa o leste e TRAI aos 330 s (`setTeam`); Aurelan (dono `bandits`, hostil a todos) desembarca
 * 5 levas de Barcaças na praia nordeste (150/260/380/520/640 s). Drogath jogável desde o início, 2 Necromantes e o Acampamento da guarnição prontos.
 * Primários: repelir as levas, 3 Cercados de Javalis (e segurá-los), sobreviver 240 s à traição e destruir o Salão de Hurgan; secundárias: Forja de ferro do
 * traidor, 2 Torres de Vigia, 3 Ogros; oculta: 4 Necromantes vivos. O playthrough do robô está em tests/fixtures/campaign-playthrough/war-horde-07-casa-no-brejo.js.
 */
const ID = 'war-horde-07-casa-no-brejo';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const PRIMARY = ['p-landings', 'p-pens', 'p-survive', 'p-traitor'];
const SECONDARY = ['s-depot', 's-towers', 's-ogres'];

describe('m07 Casa no Brejo · a missão', () => {
  it('base noroeste; Drogath e 2 Necromantes do jogador, Acampamento da guarnição pronto, Hurgan aliado a leste (Salão e Forja de ferro), tier 3 aos 40 s', async () => {
    const { gm } = await boot([{ name: 'espera', wait: 41 }], 42);
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-07-brejo-mudo');
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq');
    expect(hall.type).toBe('great_hall');
    expect(d(pos(hall), A.playerStart)).toBeLessThan(5);
    expect(hall.tier).toBe(3);
    const dr = gm.entitiesById.get(gm.mission.tags.get('drogath')[0]);
    expect(dr.type).toBe('hero_drogath');
    expect(dr.ownerId).toBe(0);
    expect(gm.getUnitsOf(0).filter((u) => u.type === 'necromancer')).toHaveLength(2);
    expect(gm.buildings.some((b) => b.ownerId === 0 && b.type === 'orc_barracks' && b.isConstructed)).toBe(true);
    const hurgan = gm.buildings.find((b) => b.ownerId === 1 && b.role === 'hq');
    expect(hurgan.type).toBe('great_hall');
    expect(d(pos(hurgan), A.allyStart)).toBeLessThan(5);
    expect(gm.mission.tags.get('traitor_hall')).toEqual([hurgan.id]);
    const depot = gm.mission.tags.get('iron_depot').map((i) => gm.entitiesById.get(i));
    expect(depot).toHaveLength(1);
    expect(depot[0].type).toBe('orc_forge');
    expect(depot[0].ownerId).toBe(1);
    expect(d(pos(depot[0]), A.ironDepot)).toBeLessThan(5);
    expect(gm.isHostile(0, 1)).toBe(false); // aliado até a traição
    const def = gm.mission.def;
    for (const id of PRIMARY) expect(def.objectives.find((o) => o.id === id).priority).toBe('primary');
    for (const id of SECONDARY) expect(def.objectives.find((o) => o.id === id).priority).toBe('secondary');
    expect(def.objectives.find((o) => o.id === 'h-necro').priority).toBe('hidden');
    expect(def.autoVictory).toBe(false);
  });

  it('Aurelan: 5 levas de Barcaças (54 soldados, mais que os 44 exigidos); a 1ª aos 150 s traz 6 soldados numa Barcaça na água com Fragata de escolta', async () => {
    const def = (await boot([], 0.2)).gm.mission.def;
    const total = def.triggers.flatMap((t) => t.actions).filter((a) => a.type === 'spawnLanding').flatMap((a) => a.units).reduce((n, u) => n + u.count, 0);
    expect(total).toBe(54);
    expect(def.objectives.find((o) => o.id === 'p-landings').count).toBe(44);
    const waves = def.triggers.filter((t) => /^wave-/.test(t.id)).map((t) => t.when.at);
    expect(waves).toEqual([150, 260, 380, 520, 640]);
    const run = await boot([{ name: 'antes', wait: 149, run: (c) => { if (c.tagged('aurelan_force').length) throw new Error('cedo'); } }, { name: 'w1', wait: 3 }], 154);
    const f = run.gm.mission.tags.get('aurelan_force').map((i) => run.gm.entitiesById.get(i));
    expect(f).toHaveLength(6);
    expect(f.every((u) => u.ownerId === 99)).toBe(true);
    const barge = run.gm.mission.tags.get('aurelan_fleet').map((i) => run.gm.entitiesById.get(i)).find((u) => u.type === 'barge');
    expect(barge.layer).toBe('naval');
  }, 60000);

  it('traição aos 330 s: até 329 s Hurgan é aliado; depois é hostil, ativa p-traitor, p-survive e s-depot e lança 9 guerreiros contra a base', async () => {
    let before = null, units1 = 0;
    const run = await boot([
      { name: 'guarda', every: 10, each: (c) => c.slayTag('aurelan_force'), until: (c) => c.seconds >= 329.5, timeout: 400 },
      { name: 'antes', run: (c) => { before = { hostile: c.gm.isHostile(0, 1), p: c.status('p-traitor'), s: c.status('p-survive'), d: c.status('s-depot') }; units1 = c.gm.getUnitsOf(1).length; } },
      { name: 'depois', wait: 3 }
    ], 340);
    expect(before.hostile).toBe(false);
    expect(before.p).toBe('inactive');
    expect(before.s).toBe('inactive');
    expect(run.gm.isHostile(0, 1)).toBe(true);
    expect(run.gm.mission.objectives.get('p-traitor').status).toBe('active');
    expect(run.gm.mission.objectives.get('p-survive').status).toBe('active');
    expect(run.gm.mission.objectives.get('s-depot').status).toBe('active');
    expect(run.gm.getUnitsOf(1).length).toBeGreaterThanOrEqual(units1 + 9);
    expect(run.outcome).toBeNull();
  }, 120000);

  it('objetivo oculto: 4 Necromantes vivos ao mesmo tempo (2 iniciais + 2 novos) completam e dão +150 de ouro', async () => {
    let gold0 = 0;
    const run = await boot([
      { name: 'a', wait: 1, run: (c) => { gold0 = c.gm.getPlayer(0).resources.gold; if (c.status('h-necro') === 'completed') throw new Error('cedo'); } },
      { name: 'mais', wait: 1, run: (c) => { const h = c.anchor('playerStart', 8, 14); for (let i = 0; i < 2; i++) c.gm.spawnUnit('necromancer', h.x + i * 2, h.z, 0); } },
      { name: 'f', wait: 3 }
    ], 10);
    expect(run.gm.mission.objectives.get('h-necro').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(gold0 + 140);
    expect(run.outcome).toBeNull();
  }, 60000);

  it('derrotas (Salão, Drogath, todos os Cercados depois de erguidos) e vitória por objetivos (cutscene final); as secundárias não decidem', async () => {
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.bld('great_hall').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const dr = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const pens = await boot([
      { name: 'p', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-pens', 'completed') },
      { name: 'q', wait: 2, run: (c) => { for (const b of c.gm.buildings.filter((x) => x.ownerId === 0 && x.type === 'pig_farm')) b.takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]); } }
    ], 20);
    expect(pens.outcome).toBe('defeat');
    expect(pens.gm.mission.outcomeText['pt-BR']).toMatch(/Cercados/);
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of SECONDARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of PRIMARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
  }, 60000);
});

describe('m07 Casa no Brejo · dificuldade', () => {
  it('investida precoce: só as unidades do início sobre o Salão de Hurgan não vencem', async () => {
    const run = await boot(rush, 650);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-traitor').status).not.toBe('completed');
  }, 120000);

  it('roteiro sem tropa (economia, nenhum soldado): as levas e a traição derrubam a base e PERDE', async () => {
    const run = await boot(noArmy, 1200);
    expect(run.outcome).toBe('defeat');
    expect(run.seconds).toBeLessThan(1000);
  }, 180000);
});
