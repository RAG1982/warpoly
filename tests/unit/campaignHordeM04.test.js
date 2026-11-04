import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { runAction } from '../../src/sim/missions/actions.js';
import { noNavy, rush, win } from '../fixtures/campaign-playthrough/war-horde-04-mare-de-breu.js';

/**
 * M4-04 (espelho da M3-05) — m04 da Horda "Maré de Breu": mesmo palco do Baixio do Breu (camp-04), com os lados invertidos. O jogador (Clãs do Cinzal)
 * ocupa a margem LESTE; Aurelan (IA humana fácil) a oeste, com Estaleiro, patrulha de 3 Fragatas e esquadra roteirizada em 3 levas (4, 6 e
 * Couraçado + 4 Fragatas = 15), mais Barcaças com tropa. Drogath jogável desde o início, Galé de Orvanna aos 5 min, secundárias (3 Galés treinadas,
 * 3 Fragatas de escolta, Salão extra no Cabo, Lacaios náufragos, Estaleiro de Aurelan) e oculta (nenhuma Galé perdida).
 * O playthrough do robô está em tests/fixtures/campaign-playthrough/war-horde-04-mare-de-breu.js.
 */
const ID = 'war-horde-04-mare-de-breu';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const tick = (gm, n = 3) => { for (let i = 0; i < n; i++) gm.simStep(SIM_DT); };
const PRIMARY = ['p-dock', 'p-platforms', 'p-oil', 'p-patrol', 'p-fleet'];
const SECONDARY = ['s-galleys', 's-escort', 's-outpost', 's-rescue', 's-dock'];
const free = (gm, type, anchor, r = 12) => {
  const a = gm.terrain.mapDef.anchors[anchor];
  for (let rr = 0; rr <= r; rr += 1.5) for (let k = 0; k < (rr === 0 ? 1 : 12); k++) { const t = (k / 12) * Math.PI * 2; if (gm.canPlaceBuilding(type, a.x + Math.cos(t) * rr, a.z + Math.sin(t) * rr, null, 0)) return true; }
  return false;
};

describe('m04 Maré de Breu · a missão', () => {
  it('base na margem leste; Drogath jogável, Acampamento da guarnição pronto, Estaleiro de Aurelan, patrulha de 3 Fragatas na água, bandidos e 3 Lacaios na ilhota; tier 3 aos 45 s', async () => {
    const { gm } = await boot([{ name: 'espera', wait: 46 }], 47);
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-04-baixio-do-breu');
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq');
    expect(hall.type).toBe('great_hall');
    expect(d(pos(hall), A.enemyStart)).toBeLessThan(5); // margem leste
    expect(hall.tier).toBe(3);
    expect(gm.mission.tags.get('drogath')).toHaveLength(1);
    expect(gm.entitiesById.get(gm.mission.tags.get('drogath')[0]).ownerId).toBe(0);
    expect(gm.entitiesById.get(gm.mission.tags.get('drogath')[0]).type).toBe('hero_drogath');
    expect(gm.buildings.some((b) => b.ownerId === 0 && b.type === 'orc_barracks' && b.isConstructed)).toBe(true);
    const enemyHq = gm.buildings.find((b) => b.ownerId === 1 && b.role === 'hq');
    expect(enemyHq.type).toBe('castle');
    expect(d(pos(enemyHq), A.playerStart)).toBeLessThan(5); // margem oeste
    const yard = gm.mission.tags.get('human_dock').map((id) => gm.entitiesById.get(id));
    expect(yard).toHaveLength(1);
    expect(yard[0].type).toBe('shipyard');
    expect(yard[0].ownerId).toBe(1);
    const patrol = gm.mission.tags.get('patrol').map((i) => gm.entitiesById.get(i));
    expect(patrol).toHaveLength(3);
    for (const p of patrol) { expect(p.type).toBe('frigate'); expect(p.layer).toBe('naval'); expect(p.ownerId).toBe(1); expect(p.mesh.position.x).toBeLessThan(0); } // lado de Aurelan
    expect(gm.mission.tags.get('islet_guard')).toHaveLength(3);
    const cast = gm.mission.tags.get('castaways').map((i) => gm.entitiesById.get(i));
    expect(cast).toHaveLength(3);
    for (const u of cast) { expect(u.type).toBe('peon'); expect(u.ownerId).toBe(-1); expect(u.markColor).toBe('#22d3ee'); }
    const def = gm.mission.def;
    for (const id of PRIMARY) expect(def.objectives.find((o) => o.id === id).priority).toBe('primary');
    for (const id of SECONDARY) expect(def.objectives.find((o) => o.id === id).priority).toBe('secondary');
    expect(def.objectives.find((o) => o.id === 'h-no-loss').priority).toBe('hidden');
    expect(def.autoVictory).toBe(false);
  });

  it('os sítios da Doca, do Caldeirão e do Posto do Cabo comportam as construções orcs; o poço perto fica na água e a menos de 40 u da Doca', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    expect(free(gm, 'ship_dock', 'shipyard2')).toBe(true);
    expect(free(gm, 'ash_cauldron', 'refinery2')).toBe(true);
    expect(free(gm, 'great_hall', 'outpost2')).toBe(true);
    expect(d(A.well3, A.shipyard2Water)).toBeLessThan(40);
    expect(A.well3.water && A.well2.water).toBe(true);
    // a Doca da Horda (leste) está bem longe do Estaleiro de Aurelan (oeste)
    expect(d(A.shipyard1, A.shipyard2)).toBeGreaterThan(80);
  });

  it('esquadra roteirizada de Aurelan: 3 levas (4, 6 e Couraçado + 4 Fragatas = 15) aos 380/540/700 s, saindo do mar do Estaleiro oeste; p-fleet só ativa na 1ª', async () => {
    const run = await boot([
      { name: 'antes', wait: 379, run: (c) => { if (c.status('p-fleet') === 'active') throw new Error('p-fleet ativo cedo'); } },
      { name: 'w1', wait: 8, run: (c) => { const f = c.tagged('aurelan_fleet'); if (f.length !== 4) throw new Error(`leva 1 = ${f.length}`); if (c.status('p-fleet') !== 'active') throw new Error('p-fleet'); if (!f.every((u) => u.layer === 'naval' && u.ownerId === 1 && u.type === 'frigate')) throw new Error('navios'); if (!f.every((u) => u.mesh.position.x < 0)) throw new Error('saem do oeste'); } },
      { name: 'w2', wait: 160, run: (c) => { if (c.tagged('aurelan_fleet').length < 10) throw new Error('leva 2'); } },
      { name: 'w3', wait: 160, run: (c) => { const f = c.tagged('aurelan_fleet'); if (f.length !== 15) throw new Error(`leva 3 = ${f.length}`); if (!f.some((u) => u.type === 'dreadnought')) throw new Error('Couraçado'); } }
    ], 720);
    expect(run.outcome === null || run.outcome === 'defeat').toBe(true);
  }, 120000);

  it('a Galé de Orvanna chega aos 5 min: Galé de Guerra nomeada do jogador, com anel e nome próprios, e +160 de petróleo', async () => {
    let oil0 = 0;
    const run = await boot([{ name: 'a', wait: 299, run: (c) => { oil0 = c.gm.getPlayer(0).resources.oil; } }, { name: 'b', wait: 3 }], 305);
    const s = run.gm.mission.tags.get('orvanna').map((i) => run.gm.entitiesById.get(i));
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe('war_galley');
    expect(s[0].ownerId).toBe(0);
    expect(s[0].layer).toBe('naval');
    expect(s[0].markColor).toBe('#f0abfc');
    expect(s[0].displayName['pt-BR']).toBe('Orvanna Maré-Negra');
    expect(run.gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(oil0 + 150);
  });

  it('Doca → +200 de petróleo (Orvanna); petróleo no fluxo: Petroleiro ergue Plataforma, coleta e entrega ao Caldeirão; contadores p-dock, p-platforms e p-oil sobem', async () => {
    let oilAfterDock = 0;
    const run = await boot([
      { name: 'obras', wait: 47, run: (c) => {
        c.give({ gold: 2000, wood: 1000, stone: 400 });
        const A = c.gm.terrain.mapDef.anchors;
        const spot = (t, k) => { for (let r = 0; r < 13; r += 1.5) for (let q = 0; q < 12; q++) { const x = A[k].x + Math.cos(q) * r, z = A[k].z + Math.sin(q) * r; if (c.gm.canPlaceBuilding(t, x, z, null, 0)) return { x, z }; } return { x: A[k].x, z: A[k].z }; };
        const ps = c.mine('peon').map((u) => u.id);
        c.issue({ type: CMD.PLACE_BUILDING, buildingType: 'ship_dock', ...spot('ship_dock', 'shipyard2'), unitIds: ps.slice(0, 3) });
        c.gm.__spot = spot;
      } },
      { name: 'caldeirao', when: (c) => c.bld('ship_dock'), run: (c) => { c.issue({ type: CMD.PLACE_BUILDING, buildingType: 'ash_cauldron', ...c.gm.__spot('ash_cauldron', 'refinery2'), unitIds: c.mine('peon').map((u) => u.id).slice(0, 3) }); }, timeout: 200 },
      { name: 'prontas', when: (c) => c.bld('ship_dock') && c.bld('ash_cauldron'), wait: 1, run: (c) => { oilAfterDock = c.gm.getPlayer(0).resources.oil; c.issue({ type: CMD.TRAIN, buildingId: c.bld('ship_dock').id, unitType: 'tanker' }); }, timeout: 200 },
      { name: 'tanker', when: (c) => c.mine('tanker').length > 0, run: (c) => { const w = c.gm.resourceDeposits.find((r) => r.type === 'oil' && d(pos(r), c.anchor('well3')) < 2); c.issue({ type: CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: pos(w).x, z: pos(w).z, unitIds: [c.mine('tanker')[0].id] }); }, timeout: 100 },
      { name: 'plat', when: (c) => c.gm.buildings.some((b) => b.type === 'oil_platform' && b.isConstructed), run: (c) => { const w = c.gm.resourceDeposits.find((r) => r.type === 'oil' && d(pos(r), c.anchor('well3')) < 2); c.issue({ type: CMD.GATHER, unitIds: [c.mine('tanker')[0].id], targetId: w.id }); }, timeout: 100 },
      { name: 'oleo', wait: 90 }
    ], 400);
    expect(oilAfterDock).toBeGreaterThanOrEqual(200);
    expect(run.gm.mission.objectives.get('p-dock').status).toBe('completed');
    expect(run.gm.mission.objectives.get('p-platforms').cur).toBe(1);
    expect(run.gm.mission.objectives.get('p-oil').cur).toBeGreaterThan(100);
  }, 120000);

  it('Lacaios náufragos: matar os 3 bandidos liberta os 3 (3/3) e dá +100 de ouro e +100 de madeira', async () => {
    let gold0 = 0, wood0 = 0;
    const run = await boot([
      { name: 'guardas', wait: 1, run: (c) => { gold0 = c.gm.getPlayer(0).resources.gold; wood0 = c.gm.getPlayer(0).resources.wood; c.slayTag('islet_guard'); } },
      { name: 'livres', wait: 2, run: (c) => { if (c.obj('s-rescue').cur !== 3) throw new Error('3/3'); if (!c.tagged('castaways').every((u) => u.ownerId === 0)) throw new Error('do jogador'); } },
      { name: 'ganho', wait: 1 }
    ], 20);
    expect(run.gm.mission.objectives.get('s-rescue').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(gold0 + 95);
    expect(run.gm.getPlayer(0).resources.wood).toBeGreaterThanOrEqual(wood0 + 95);
    expect(run.outcome).toBeNull(); // secundária: a partida segue
  }, 60000);

  it('derrotas (Salão, Drogath) e vitória por objetivos (cutscene final); as secundárias não decidem', async () => {
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.bld('great_hall').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const dr = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of SECONDARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of PRIMARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
  }, 60000);

  it('Nenhuma Galé perdida (oculto): terminar a esquadra sem perder Galé completa (+200 de ouro); perdendo uma, falha', async () => {
    let gold0 = 0;
    const live = await boot([
      { name: 'a', wait: 301, run: (c) => { gold0 = c.gm.getPlayer(0).resources.gold; } },
      { name: 'tudo', run: (c) => { for (const i of PRIMARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'f', wait: 3 }
    ], 330);
    expect(live.gm.mission.objectives.get('h-no-loss').status).toBe('completed');
    expect(live.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(gold0 + 150);
    const dead = await boot([{ name: 'a', wait: 301 }, { name: 'afunda', wait: 1, run: (c) => c.slayTag('orvanna') }, { name: 'tudo', wait: 1, run: (c) => { for (const i of PRIMARY) c.gm.mission.setObjectiveStatus(i, 'completed'); } }, { name: 'f', wait: 3 }], 330);
    expect(dead.gm.mission.objectives.get('h-no-loss').status).toBe('failed');
  }, 60000);
});

describe('m04 Maré de Breu · dificuldade', () => {
  it('investida precoce: as tropas iniciais não têm como cruzar o mar (sem ponte, sem Barcaça): ficam na margem, não vencem', async () => {
    const run = await boot(rush, 300);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-fleet').status).not.toBe('completed');
    expect(run.gm.buildings.some((b) => b.ownerId === 1 && b.role === 'hq' && !b.isDead)).toBe(true);
  }, 60000);

  it('roteiro sem defesa naval (economia, nenhuma Doca): as levas de Aurelan encostam, desembarcam tropas e PERDE', async () => {
    const run = await boot(noNavy, 1000);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.vars.landings ?? run.gm.mission.vars.get?.('landings')).toBeGreaterThanOrEqual(1);
    expect(run.seconds).toBeLessThan(900);
  }, 120000);

  it('o robô com frota e plataformas vence (Doca, 2 Plataformas, óleo, as vitórias navais) em tempo de partida simulada plausível', async () => {
    const run = await boot(win, 1200);
    expect(run.outcome).toBe('victory');
    expect(run.seconds).toBeGreaterThan(10 * 60);
    expect(run.seconds).toBeLessThan(18 * 60);
    for (const i of PRIMARY) expect(run.gm.mission.objectives.get(i).status, i).toBe('completed');
  }, 240000);
});

describe('m04 Maré de Breu · desembarque anfíbio de Aurelan (NAVAL-LANDING)', () => {
  const landingAction = (gm) => gm.mission.def.triggers.find((t) => t.id === 'landing').actions.find((a) => a.type === 'spawnLanding');
  const ents = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i));

  it('a leva nasce numa Barcaça na água do Estaleiro oeste (tropa embarcada, invisível) com 2 Fragatas de escolta; ninguém aparece em terra', async () => {
    const { gm } = await boot([], 0.2);
    expect(landingAction(gm)).toBeTruthy();
    runAction(gm.mission, landingAction(gm));
    const barge = ents(gm, 'landing_barge')[0];
    expect(barge.type).toBe('barge');
    expect(barge.ownerId).toBe(1);
    expect(barge.layer).toBe('naval');
    expect(barge.cargo).toHaveLength(6);
    for (const u of ents(gm, 'landing')) { expect(u.transportedBy).toBe(barge.id); expect(u.mesh.visible).toBe(false); }
    const esc = ents(gm, 'landing_escort');
    expect(esc).toHaveLength(2);
    expect(esc.every((u) => u.type === 'frigate' && u.layer === 'naval')).toBe(true);
    expect(d(pos(barge), gm.terrain.mapDef.anchors.fleetStart1)).toBeLessThan(5);
  });

  it('a Barcaça navega até a nossa praia (beach2), solta a tropa (que parte para o ataque) e a escolta a acompanha', async () => {
    const { gm } = await boot([], 0.2);
    runAction(gm.mission, landingAction(gm));
    const barge = ents(gm, 'landing_barge')[0];
    const troops = ents(gm, 'landing');
    for (let i = 0; i < 150 * 20 && barge.cargo.length; i++) gm.simStep(SIM_DT);
    expect(barge.cargo).toHaveLength(0);
    expect(barge.isDead).toBe(false);
    const beach = gm.terrain.mapDef.anchors.beach2;
    for (const u of troops) {
      expect(u.transportedBy).toBe(null);
      expect(u.mesh.visible).toBe(true);
      expect(d(pos(u), beach)).toBeLessThan(40);
    }
    tick(gm, 40);
    expect(troops.some((u) => u.state !== 'idle')).toBe(true);
  }, 120000);

  it('Barcaça afundada antes do desembarque: a carga se afoga (ninguém chega à praia)', async () => {
    const { gm } = await boot([], 0.2);
    runAction(gm.mission, landingAction(gm));
    const barge = ents(gm, 'landing_barge')[0];
    const troops = ents(gm, 'landing');
    tick(gm, 20);
    expect(barge.cargo.length).toBe(6);
    barge.hp = 0;
    barge.lastAttackerOwnerId = 0;
    barge.die();
    tick(gm, 40);
    expect(troops.every((u) => u.isDead || u.isDying)).toBe(true);
  });
});
