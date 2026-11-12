import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { rush, noArmy } from '../fixtures/campaign-playthrough/war-horde-08-o-monte-caldeira.js';

/**
 * M4-08 (espelho da M3-09) — m08 da Horda "O Monte Caldeira": mesmo palco da Fornalha (camp-08), lados invertidos. O jogador (Clãs do Cinzal, base LESTE =
 * âncora `enemyStart`) segura o Santuário das Cinzas (norte), a Fornalha Naval com a Doca e o Caldeirão (margem sul do lago) e o Salão enquanto a Profetisa Vozgul
 * conduz o rito (survive 600 s); Aurelan (IA fácil + levas roteirizadas) cruza os rios de lava pelas 4 passagens de rocha, entra no lago com Fragatas e ataca do ar
 * com o esquadrão de Lyra; Oren vem na 5ª leva. Drogath jogável, Zarruk Fornalha (Incendiário) guarda a Fornalha. Primários: o rito (600 s) e 2 Leviatãs de Ferro;
 * secundárias: libertar 4 guardas presos (ilhota oeste, só pelo mar), 3 Torres de Vigia, 2 Galés de Guerra; oculta: Zarruk vivo ao fim do rito (+400 de ouro).
 * O playthrough do robô está em tests/fixtures/campaign-playthrough/war-horde-08-o-monte-caldeira.js.
 */
const ID = 'war-horde-08-o-monte-caldeira';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const PRIMARY = ['p-rite', 'p-leviathans'];
const SECONDARY = ['s-guards', 's-towers', 's-galleys'];
const T = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i));

describe('m08 O Monte Caldeira · a missão', () => {
  it('base leste; Salão no nível 3, Drogath, Santuário, Doca, Fornalha Naval e Caldeirão dados; Zarruk guarda a Fornalha; Aurelan a oeste', async () => {
    const { gm } = await boot([{ name: 'espera', wait: 3 }], 4);
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-08-fornalha');
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq');
    expect(hall.type).toBe('great_hall');
    expect(d(pos(hall), A.enemyStart)).toBeLessThan(5);
    expect(hall.tier).toBe(3);
    const dr = T(gm, 'drogath')[0];
    expect(dr).toMatchObject({ type: 'hero_drogath', ownerId: 0 });
    for (const [tag, type] of [['sanctum', 'ash_sanctum'], ['dock', 'ship_dock'], ['forge', 'naval_forge'], ['cauldron', 'ash_cauldron']]) {
      const b = T(gm, tag)[0];
      expect(b, tag).toMatchObject({ type, ownerId: 0, isConstructed: true });
    }
    expect(d(pos(T(gm, 'sanctum')[0]), A.sanctum)).toBeLessThan(3);
    const z = T(gm, 'zarruk')[0];
    expect(z).toMatchObject({ type: 'arsonist', ownerId: 0 });
    expect(z.displayName['pt-BR']).toMatch(/Zarruk/);
    const foe = gm.buildings.find((b) => b.ownerId === 1 && b.role === 'hq');
    expect(foe.type).toBe('castle');
    expect(d(pos(foe), A.playerStart)).toBeLessThan(5);
    expect(gm.isHostile(0, 1)).toBe(true);
    const def = gm.mission.def;
    for (const id of PRIMARY) expect(def.objectives.find((o) => o.id === id).priority).toBe('primary');
    for (const id of SECONDARY) expect(def.objectives.find((o) => o.id === id).priority).toBe('secondary');
    expect(def.objectives.find((o) => o.id === 'h-zarruk').priority).toBe('hidden');
    expect(def.autoVictory).toBe(false);
    expect(gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(150);
  });

  it('lava como divisor: as 4 passagens de rocha ligam as duas bases a pé (sem elas não haveria caminho); a ilhota dos guardas presos só se alcança pelo mar', async () => {
    const { gm } = await boot();
    const { buildPathfinder, floodFill, isReached } = await import('../../src/data/maps/generator.js');
    const m = gm.terrain.mapDef, A = m.anchors;
    const land = buildPathfinder(m, 'land');
    const seen = floodFill(land, m.startSlots[1].x, m.startSlots[1].z);
    expect(isReached(land, seen, m.startSlots[0].x, m.startSlots[0].z), 'Aurelan alcança o Salão a pé').toBe(true);
    for (const k of [1, 2, 3, 4]) expect(isReached(land, seen, A[`lavaPass${k}`].x, A[`lavaPass${k}`].z), `passagem ${k}`).toBe(true);
    expect(isReached(land, seen, A.isletCaptive.x, A.isletCaptive.z), 'ilhota a pé').toBe(false);
    expect(d(A.lavaPass4, A.enemyStart)).toBeLessThan(25); // a passagem leste fica quase à porta do Salão
  });

  it('o rito: survive 600 s ativo desde o início; sem ataque, com Zarruk vivo, completa aos 600 s (+400 de ouro oculto)', async () => {
    const run = await boot([
      { name: 'guarda', every: 10, each: (c) => c.slay(c.gm.allUnits.filter((u) => u.ownerId === 1)), until: (c) => c.seconds >= 603, timeout: 700 }
    ], 604);
    expect(run.gm.mission.objectives.get('p-rite').status).toBe('completed');
    expect(run.gm.mission.objectives.get('h-zarruk').status).toBe('completed');
    expect(run.outcome).toBeNull(); // falta o Leviatã
  }, 120000);

  it('ondas: 1ª aos 150 s (7 soldados por terra rumo ao Salão); Fragatas aos 380 s; grifos de Lyra aos 450 s rumo ao Santuário; Oren (Mago nomeado) na leva de 510 s', async () => {
    const def = (await boot([], 0.2)).gm.mission.def;
    const waves = def.triggers.filter((t) => /^wave-/.test(t.id)).map((t) => t.when.at);
    expect(waves).toEqual([150, 270, 380, 510, 570]);
    const w1 = def.triggers.find((t) => t.id === 'wave-1').actions.find((a) => a.type === 'spawn');
    expect(w1.units.reduce((n, u) => n + u.count, 0)).toBe(7);
    expect(w1.order.kind).toBe('attackMove');
    expect(d(w1.order, (await boot()).gm.terrain.mapDef.anchors.enemyStart)).toBeLessThan(1); // o carregador resolve a âncora em x/z
    const lyra = def.triggers.find((t) => t.id === 'lyra-arrives');
    expect(lyra.when.at).toBe(450);
    expect(lyra.actions.find((a) => a.type === 'spawn')).toMatchObject({ unitType: 'gryphon_rider', count: 3, owner: 1 });
    expect(JSON.stringify(def.triggers.find((t) => t.id === 'wave-4'))).toMatch(/Mestre Oren/);
    const run = await boot([{ name: 'antes', wait: 149, run: (c) => { if (c.tagged('aurelan_force').length) throw new Error('cedo'); } }, { name: 'w1', wait: 3 }], 154);
    const f = T(run.gm, 'aurelan_force');
    expect(f).toHaveLength(7);
    expect(f.every((u) => u.ownerId === 1)).toBe(true);
  }, 60000);

  it('guardas presos: os 5 captores (ilhota oeste) mortos → 4 guardas passam ao jogador e o resgate completa', async () => {
    const r = await boot([
      { name: 'captores', wait: 2, run: (c) => c.slayTag('captive_guard') },
      { name: 'espera', wait: 2 }
    ], 12);
    expect(r.gm.mission.objectives.get('s-guards').status).toBe('completed');
    for (const u of T(r.gm, 'captives')) expect(u.ownerId).toBe(0);
  }, 60000);

  it('Zarruk morrer falha só o objetivo oculto (a missão segue); Vozgul e Oren só falam (sem unidade com o nome de Vozgul)', async () => {
    const run = await boot([
      { name: 'zarruk', wait: 2, run: (c) => c.slayTag('zarruk') },
      { name: 'fim', wait: 2 }
    ], 8);
    expect(run.gm.mission.objectives.get('h-zarruk').status).not.toBe('completed');
    expect(run.outcome).toBeNull();
    const def = run.gm.mission.def;
    const text = JSON.stringify(def);
    expect(text).toContain('Vozgul, a Profetisa');
    const spawns = [...def.setup, ...def.triggers.flatMap((t) => t.actions)].filter((a) => a.type === 'spawn');
    for (const a of spawns) expect(JSON.stringify(a.unitType ?? a.units)).not.toMatch(/vozgul/i);
  }, 60000);

  it('derrotas (Salão, Santuário, Fornalha Naval, Drogath) e vitória só com o rito E os 2 Leviatãs (cutscene final); as secundárias não decidem', async () => {
    const hit = (tag) => (c) => c.slayTag(tag);
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.bld('great_hall').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const san = await boot([{ name: 's', wait: 2, run: hit('sanctum') }], 20);
    expect(san.outcome).toBe('defeat');
    expect(san.gm.mission.outcomeText['pt-BR']).toMatch(/Santuário/);
    const fo = await boot([{ name: 'f', wait: 2, run: hit('forge') }], 20);
    expect(fo.outcome).toBe('defeat');
    expect(fo.gm.mission.outcomeText['pt-BR']).toMatch(/Fornalha/);
    const dr = await boot([{ name: 'm', wait: 2, run: hit('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of SECONDARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const soRito = await boot([
      { name: 'rito', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-rite', 'completed') },
      { name: 'espera', wait: 20 }
    ], 40);
    expect(soRito.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of PRIMARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
  }, 120000);
});

describe('m08 O Monte Caldeira · dificuldade', () => {
  it('investida precoce: só as unidades do início sobre a base de Aurelan não vencem', async () => {
    const run = await boot(rush, 650);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-leviathans').status).not.toBe('completed');
  }, 120000);

  it('roteiro sem tropa (economia, nenhum soldado): as levas derrubam a base e PERDE', async () => {
    const run = await boot(noArmy, 1200);
    expect(run.outcome).toBe('defeat');
    expect(run.seconds).toBeLessThan(1000);
  }, 180000);
});
