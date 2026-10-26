import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { components, compAt, shoreNear } from './helpers/navalWorld.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { getBiomeAt, BIOME } from '../../src/data/maps/biome.js';
import { runAction } from '../../src/sim/missions/actions.js';
import { noNavy, rush, win } from '../fixtures/campaign-playthrough/war-alliance-04-baixio-do-breu.js';

/**
 * M3-05 — m04 "O Baixio do Breu": 2 continentes SEM ligação por terra (Liga a oeste, grama; Clãs a leste, deserto/basalto), > 80 u de mar entre as
 * costas, 2 ilhotas no meio (madeira, 2 torres cada), 6 poços (2 por costa + 2 contestados no meio), Estaleiro/Refinaria/Plataformas/Petroleiro,
 * frota orca roteirizada em 3 levas, Estrela-d'Alva aos 5 min, Brann jogável, secundárias (3 Fragatas, Centro extra no Cabo, náufragos na ilhota,
 * Doca do Clã) e ocultas (Ruínas do Farol Velho, não perder a Estrela-d'Alva). O playthrough do robô está em tests/fixtures/campaign-playthrough/.
 */
const ID = 'war-alliance-04-baixio-do-breu';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const tick = (gm, n = 3) => { for (let i = 0; i < n; i++) gm.simStep(SIM_DT); };
const free = (gm, type, anchor, r = 12) => {
  const a = gm.terrain.mapDef.anchors[anchor];
  for (let rr = 0; rr <= r; rr += 1.5) for (let k = 0; k < (rr === 0 ? 1 : 12); k++) { const t = (k / 12) * Math.PI * 2; if (gm.canPlaceBuilding(type, a.x + Math.cos(t) * rr, a.z + Math.sin(t) * rr, null, 0)) return true; }
  return false;
};

describe('m04 Baixio do Breu · o mapa', () => {
  it('formato: camp-04, painted com biomeGrid, 2 vagas, sem erros de validação (avisos só de conectividade entre continentes e da serraria)', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef;
    expect(m.id).toBe('camp-04-baixio-do-breu');
    expect(m.hidden).toBe(true);
    expect(m.terrain.generator).toBe('painted');
    expect(m.startSlots).toHaveLength(2);
    const v = validateMapDef(m, { checkId: false });
    expect(v.errors).toEqual([]);
    const ok = new Set(['slotsDisconnected', 'unreachable', 'lumberFarFromForest']);
    for (const w of v.warnings) expect(ok.has(w.code), `${w.code} ${JSON.stringify(w.params)}`).toBe(true);
  });

  it('biomas próprios: Liga em grama/floresta (tileset base exuberante), Clãs em deserto/estepe/basalto', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef;
    expect(m.tileset).toBe('exuberante');
    const green = [BIOME.GRASS, BIOME.FOREST, BIOME.SAVANNA, BIOME.ROCK, BIOME.SNOW];
    const dry = [BIOME.DESERT, BIOME.STEPPE, BIOME.VOLCANIC, BIOME.ROCK, BIOME.SAND];
    const count = (s, set) => { let n = 0, t = 0; for (let dx = -30; dx <= 30; dx += 4) for (let dz = -30; dz <= 30; dz += 4) { t++; if (set.includes(getBiomeAt(m, s.x + dx, s.z + dz))) n++; } return n / t; };
    expect(count(m.startSlots[0], [BIOME.GRASS, BIOME.FOREST, BIOME.SAVANNA])).toBeGreaterThan(0.5);
    expect(count(m.startSlots[1], [BIOME.DESERT, BIOME.STEPPE, BIOME.VOLCANIC, BIOME.ROCK])).toBeGreaterThan(0.6);
    expect(green.length + dry.length).toBeGreaterThan(0);
    expect(getBiomeAt(m, m.startSlots[1].x, m.startSlots[1].z)).toBe(BIOME.VOLCANIC); // o basalto em volta da base orc marca a fronteira
  });

  it('2 continentes isolados por terra (componentes conexos de terra), mais 2 ilhotas; > 80 u de costa a costa; nenhuma ponte', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const lc = components(gm.pathfinder);
    const west = compAt(gm.pathfinder, lc, A.playerStart.x, A.playerStart.z);
    const east = compAt(gm.pathfinder, lc, A.enemyStart.x, A.enemyStart.z);
    expect(west).not.toBe(east);
    const big = lc.list.filter((c) => c.size > 2000);
    expect(big.map((c) => c.id).sort()).toEqual([west, east].sort());
    const isl = lc.list.filter((c) => c.size > 40 && c.size <= 2000);
    expect(isl.length).toBeGreaterThanOrEqual(2);
    // a menor distância entre as costas dos 2 continentes
    const pf = gm.pathfinder;
    const cells = (id) => { const out = []; for (let i = 0; i < pf.numCells; i += 1) if (lc.comp[i] === id && (i % pf.cols) % 3 === 0 && ((i / pf.cols) | 0) % 3 === 0) out.push(pf.toWorld(i % pf.cols, (i / pf.cols) | 0)); return out; };
    const W = cells(west), E = cells(east);
    let best = Infinity;
    for (const a of W) for (const b of E) { const dd = Math.hypot(a.x - b.x, a.z - b.z); if (dd < best) best = dd; }
    expect(best).toBeGreaterThan(80);
    // cada ilhota fica longe das duas costas (mar entre elas e os continentes)
    for (const k of ['islet1', 'islet2']) { const p = A[k]; expect(Math.min(...W.map((w) => d(w, p)), ...E.map((e) => d(e, p))), k).toBeGreaterThan(20); }
  });

  it('mar navegável liga as costas: Estaleiro ↔ Doca, todos os poços e as duas ilhotas ficam na mesma água', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const nav = gm.navalPathfinder;
    const p = nav.findPath(A.shipyard1Water.x, A.shipyard1Water.z, A.shipyard2Water.x, A.shipyard2Water.z, true);
    expect(p.noPath).toBeFalsy();
    for (const k of ['well1', 'well2', 'well3', 'well4', 'wellMid1', 'wellMid2', 'fleetStart2', 'patrol1', 'patrol2', 'stellaArrival', 'shipWreck1', 'shipWreck2']) {
      const q = nav.findPath(A.shipyard1Water.x, A.shipyard1Water.z, A[k].x, A[k].z, true);
      expect(q.noPath, k).toBeFalsy();
    }
    const wells = gm.resourceDeposits.filter((r) => r.type === 'oil');
    expect(wells).toHaveLength(6);
    // 2 poços perto de cada costa e 2 contestados no meio (x ≈ ±13)
    expect(Math.abs(A.wellMid1.x)).toBeLessThan(20); expect(Math.abs(A.wellMid2.x)).toBeLessThan(20);
    expect(d(A.well1, A.playerStart)).toBeLessThan(d(A.well1, A.enemyStart));
    expect(d(A.well3, A.enemyStart)).toBeLessThan(d(A.well3, A.playerStart));
  });

  it('terra viável para tudo da missão: Estaleiro, Refinaria, Centro extra e 4 torres (2 por ilhota); praias de embarque; mina grande longe do Centro', async () => {
    const { gm } = await boot([], 0.2);
    tick(gm);
    const A = gm.terrain.mapDef.anchors;
    expect(free(gm, 'shipyard', 'shipyard1')).toBe(true);
    expect(free(gm, 'refinery', 'refinery1')).toBe(true);
    expect(free(gm, 'castle', 'outpost1')).toBe(true);
    for (const k of ['isletTower1a', 'isletTower1b', 'isletTower2a', 'isletTower2b']) expect(gm.canPlaceBuilding('watchtower', A[k].x, A[k].z, null, 0), k).toBe(true);
    expect(d(A.isletTower1a, A.isletTower1b)).toBeGreaterThanOrEqual(6);
    expect(d(A.farGold1, A.playerStart)).toBeGreaterThan(60);
    // as minas iniciais (Liga e Clã) a ~22–30 u do Centro, borda a borda (Centro 5,5 + mina 3,4)
    for (const [s, g] of [[A.playerStart, A.goldMine1], [A.enemyStart, A.goldMine2]]) { const e = d(s, g) - 8.9; expect(e).toBeGreaterThanOrEqual(21); expect(e).toBeLessThanOrEqual(30); }
    // praia de embarque: terra com água navegável a poucos passos
    for (const k of ['beach1', 'beach2']) expect(gm.navalPathfinder.nearNavigable(A[k].x, A[k].z, 8), k).toBe(true);
  });
});

describe('m04 Baixio do Breu · a missão', () => {
  it('Brann jogável desde o início, Quartel da guarnição pronto, Doca orca, patrulha de 3 Galés, bandidos e 3 náufragos na ilhota; tier 3 aos 45 s', async () => {
    const { gm } = await boot([{ name: 'espera', wait: 46 }], 47);
    expect(gm.mission.tags.get('brann')).toHaveLength(1);
    expect(gm.entitiesById.get(gm.mission.tags.get('brann')[0]).ownerId).toBe(0);
    expect(gm.buildings.some((b) => b.ownerId === 0 && b.type === 'barracks' && b.isConstructed)).toBe(true);
    expect(gm.bld ? 1 : 1).toBe(1);
    expect(gm.buildings.filter((b) => b.ownerId === 1 && b.type === 'ship_dock')).toHaveLength(1);
    const patrol = gm.mission.tags.get('patrol').map((i) => gm.entitiesById.get(i));
    expect(patrol).toHaveLength(3);
    for (const p of patrol) { expect(p.type).toBe('war_galley'); expect(p.layer).toBe('naval'); }
    expect(gm.mission.tags.get('islet_guard')).toHaveLength(3);
    const cast = gm.mission.tags.get('castaways').map((i) => gm.entitiesById.get(i));
    expect(cast).toHaveLength(3);
    for (const u of cast) { expect(u.ownerId).toBe(-1); expect(u.markColor).toBe('#22d3ee'); }
    expect(gm.buildings.find((b) => b.ownerId === 0 && b.role === 'hq').tier).toBe(3);
    const def = gm.mission.def;
    for (const id of ['p-yard', 'p-platforms', 'p-oil', 'p-patrol', 'p-fleet']) expect(def.objectives.find((o) => o.id === id).priority).toBe('primary');
    for (const id of ['s-frigates', 's-outpost', 's-rescue', 's-dock']) expect(def.objectives.find((o) => o.id === id).priority).toBe('secondary');
    for (const id of ['h-ruins', 'h-stella']) expect(def.objectives.find((o) => o.id === id).priority).toBe('hidden');
    expect(def.autoVictory).toBe(false);
  });

  it('frota inimiga roteirizada: 3 levas navais (4, 6 e Leviatã + 4 Galés = 15) aos 380/540/700 s, saindo do mar da Doca; p-fleet só ativa na 1ª', async () => {
    const run = await boot([
      { name: 'antes', wait: 379, run: (c) => { if (c.status('p-fleet') === 'active') throw new Error('p-fleet ativo cedo'); } },
      { name: 'w1', wait: 8, run: (c) => { const f = c.tagged('orc_fleet'); if (f.length !== 4) throw new Error(`leva 1 = ${f.length}`); if (c.status('p-fleet') !== 'active') throw new Error('p-fleet'); if (!f.every((u) => u.layer === 'naval' && u.ownerId === 1)) throw new Error('navios'); } },
      { name: 'w2', wait: 160, run: (c) => { if (c.tagged('orc_fleet').length < 10) throw new Error('leva 2'); } },
      { name: 'w3', wait: 160, run: (c) => { const f = c.tagged('orc_fleet'); if (f.length !== 15) throw new Error(`leva 3 = ${f.length}`); if (!f.some((u) => u.type === 'iron_leviathan')) throw new Error('Leviatã'); } }
    ], 720);
    expect(run.outcome === null || run.outcome === 'defeat').toBe(true);
  }, 120000);

  it('Estrela-d\'Alva chega aos 5 min: Fragata nomeada do jogador, com anel e nome próprios, e +80 de petróleo', async () => {
    let oil0 = 0;
    const run = await boot([{ name: 'a', wait: 299, run: (c) => { oil0 = c.gm.getPlayer(0).resources.oil; } }, { name: 'b', wait: 3 }], 305);
    const s = run.gm.mission.tags.get('stella').map((i) => run.gm.entitiesById.get(i));
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe('frigate');
    expect(s[0].ownerId).toBe(0);
    expect(s[0].markColor).toBe('#f0abfc');
    expect(s[0].displayName['pt-BR']).toBe("Estrela-d'Alva");
    expect(run.gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(oil0 + 80);
  });

  it('petróleo no fluxo da missão: Petroleiro ergue Plataforma no poço do meio, coleta e entrega à Refinaria; contadores p-platforms e p-oil sobem', async () => {
    const run = await boot([
      { name: 'obras', wait: 47, run: (c) => {
        c.give({ gold: 2000, wood: 1000, stone: 400 });
        const A = c.gm.terrain.mapDef.anchors;
        const spot = (t, k) => { for (let r = 0; r < 13; r += 1.5) for (let q = 0; q < 12; q++) { const x = A[k].x + Math.cos(q) * r, z = A[k].z + Math.sin(q) * r; if (c.gm.canPlaceBuilding(t, x, z, null, 0)) return { x, z }; } return { x: A[k].x, z: A[k].z }; };
        const vs = c.mine('villager').map((u) => u.id);
        c.issue({ type: CMD.PLACE_BUILDING, buildingType: 'shipyard', ...spot('shipyard', 'shipyard1'), unitIds: vs.slice(0, 3) });
        c.gm.__spot = spot;
      } },
      { name: 'refin', when: (c) => c.bld('shipyard'), run: (c) => { c.issue({ type: CMD.PLACE_BUILDING, buildingType: 'refinery', ...c.gm.__spot('refinery', 'refinery1'), unitIds: c.mine('villager').map((u) => u.id).slice(0, 3) }); }, timeout: 200 },
      { name: 'prontas', when: (c) => c.bld('shipyard') && c.bld('refinery'), wait: 1, run: (c) => { c.issue({ type: CMD.TRAIN, buildingId: c.bld('shipyard').id, unitType: 'tanker' }); }, timeout: 200 },
      { name: 'tanker', when: (c) => c.mine('tanker').length > 0, run: (c) => { const w = c.gm.resourceDeposits.find((r) => r.type === 'oil' && d(pos(r), c.anchor('well1')) < 2); c.issue({ type: CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: pos(w).x, z: pos(w).z, unitIds: [c.mine('tanker')[0].id] }); }, timeout: 100 },
      { name: 'plat', when: (c) => c.gm.buildings.some((b) => b.type === 'oil_platform' && b.isConstructed), run: (c) => { const w = c.gm.resourceDeposits.find((r) => r.type === 'oil' && d(pos(r), c.anchor('well1')) < 2); c.issue({ type: CMD.GATHER, unitIds: [c.mine('tanker')[0].id], targetId: w.id }); }, timeout: 100 },
      { name: 'oleo', wait: 90 }
    ], 400);
    expect(run.gm.mission.objectives.get('p-yard').status).toBe('completed');
    expect(run.gm.mission.objectives.get('p-platforms').cur).toBe(1);
    expect(run.gm.mission.objectives.get('p-oil').cur).toBeGreaterThan(100);
  }, 120000);

  it('náufragos: matar os 3 bandidos liberta os 3 (3/3), revela as Ruínas (oculto); chegar lá dá +150 de ouro e +100 de petróleo e acende o marco', async () => {
    const { gm } = await boot();
    expect(gm.mission.objectives.get('h-ruins').visible).toBe(false);
    expect(gm.mission.landmarks.find((l) => l.tag === 'ruins')).toBeTruthy();
    let gold0 = 0, oil0 = 0;
    const run = await boot([
      { name: 'guardas', wait: 1, run: (c) => c.slayTag('islet_guard') },
      { name: 'livres', wait: 2, run: (c) => { if (c.obj('s-rescue').cur !== 3) throw new Error('3/3'); if (!c.tagged('castaways').every((u) => u.ownerId === 0)) throw new Error('do jogador'); if (!c.obj('h-ruins').visible) throw new Error('ruínas reveladas'); gold0 = c.gm.getPlayer(0).resources.gold; oil0 = c.gm.getPlayer(0).resources.oil; const p = c.anchor('ruins1'); c.teleport(c.mine('knight')[0], p.x, p.z); } },
      { name: 'achado', wait: 2 }
    ], 20);
    expect(run.gm.mission.objectives.get('s-rescue').status).toBe('completed');
    expect(run.gm.mission.objectives.get('h-ruins').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(gold0 + 140);
    expect(run.gm.getPlayer(0).resources.oil).toBeGreaterThanOrEqual(oil0 + 90);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'ruins').lit).toBeGreaterThan(0);
  }, 60000);

  it('derrotas (Paço, Brann) e vitória por objetivos (cutscene final); as secundárias não decidem', async () => {
    const hq = await boot([{ name: 'q', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Paço/);
    const br = await boot([{ name: 'm', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
    expect(br.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
    const sec = await boot([{ name: 's', wait: 1, run: (c) => { for (const i of ['s-frigates', 's-outpost', 's-rescue', 's-dock']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const fin = await boot([
      { name: 'tudo', wait: 1, run: (c) => { for (const i of ['p-yard', 'p-platforms', 'p-oil', 'p-patrol', 'p-fleet']) c.gm.mission.setObjectiveStatus(i, 'completed'); } },
      { name: 'final', wait: 25 }
    ], 40);
    expect(fin.outcome).toBe('victory');
  }, 60000);

  it('Estrela-d\'Alva (oculto): terminar com ela viva completa; morta, falha', async () => {
    const live = await boot([{ name: 'a', wait: 301 }, { name: 'tudo', run: (c) => { for (const i of ['p-yard', 'p-platforms', 'p-oil', 'p-patrol', 'p-fleet']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }, { name: 'f', wait: 3 }], 330);
    expect(live.gm.mission.objectives.get('h-stella').status).toBe('completed');
    const dead = await boot([{ name: 'a', wait: 301 }, { name: 'afunda', wait: 1, run: (c) => c.slayTag('stella') }, { name: 'f', wait: 2 }], 320);
    expect(dead.gm.mission.objectives.get('h-stella').status).toBe('failed');
  }, 60000);
});

describe('m04 Baixio do Breu · dificuldade', () => {
  it('investida precoce: as tropas iniciais não têm como cruzar o mar (sem ponte, sem Barcaça): ficam na margem, não vencem, e as levas orcas desembarcam', async () => {
    const run = await boot(rush, 300);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-fleet').status).not.toBe('completed');
    expect(run.gm.buildings.some((b) => b.ownerId === 1 && b.role === 'hq' && !b.isDead)).toBe(true);
  }, 60000);

  it('roteiro sem defesa naval (economia, nenhum Estaleiro): as levas orcas encostam, desembarcam tropas e PERDE', async () => {
    const run = await boot(noNavy, 1000);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.vars.landings ?? run.gm.mission.vars.get?.('landings')).toBeGreaterThanOrEqual(1);
    expect(run.seconds).toBeLessThan(700);
  }, 120000);

  it('o robô com frota e plataformas vence (Estaleiro, 2 Plataformas, óleo, as 4 vitórias navais) entre 12 e 16 min de partida simulada', async () => {
    const run = await boot(win, 1200);
    expect(run.outcome).toBe('victory');
    expect(run.seconds).toBeGreaterThan(12 * 60);
    expect(run.seconds).toBeLessThan(16 * 60);
    for (const i of ['p-yard', 'p-platforms', 'p-oil', 'p-patrol', 'p-fleet', 's-frigates']) expect(run.gm.mission.objectives.get(i).status, i).toBe('completed');
  }, 240000);
});

describe('m04 Baixio do Breu · transporte por Barcaça entre margens e ilhotas (sim headless)', () => {
  it('6 Espadachins embarcam na praia da Liga, desembarcam na ilhota e voltam; a viagem usa o Pathfinder naval real do mapa', async () => {
    const { gm } = await boot([], 0.2);
    const A = gm.terrain.mapDef.anchors;
    const lc = components(gm.pathfinder);
    const west = compAt(gm.pathfinder, lc, A.playerStart.x, A.playerStart.z);
    const islet = compAt(gm.pathfinder, lc, A.islet2.x, A.islet2.z);
    expect(islet).not.toBe(west);
    const shore = shoreNear(gm, lc, west, A.beach1.x, A.beach1.z);
    const men = [];
    for (let i = 0; i < 6; i++) men.push(gm.spawnUnit('knight', shore.x - 1 - i * 0.6, shore.z + 0.5 * i, 0));
    const barge = gm.spawnUnit('barge', A.shipyard1Water.x, A.shipyard1Water.z, 0);
    const run = (s) => { for (let i = 0; i < Math.round(s / SIM_DT); i++) gm.simStep(SIM_DT); };
    gm.issue({ type: CMD.MOVE, playerId: 0, unitIds: [barge.id], x: shore.x + 2, z: shore.z });
    run(40);
    gm.issue({ type: CMD.LOAD, playerId: 0, unitIds: men.map((m) => m.id), targetId: barge.id });
    run(15);
    expect(barge.cargo.length).toBe(6);
    const spot = shoreNear(gm, lc, islet, shore.x, shore.z);
    gm.issue({ type: CMD.UNLOAD, playerId: 0, unitId: barge.id, x: spot.x, z: spot.z });
    run(80);
    expect(barge.cargo.length).toBe(0);
    for (const m of men) { const s = gm.pathfinder.findNearestWalkable(m.mesh.position.x, m.mesh.position.z, 4); expect(compAt(gm.pathfinder, lc, s.x, s.z)).toBe(islet); }
  }, 120000);
});

describe('m04 Baixio do Breu · desembarque anfíbio orc (NAVAL-LANDING)', () => {
  const landingAction = (gm) => gm.mission.def.triggers.find((t) => t.id === 'landing').actions.find((a) => a.type === 'spawnLanding');
  const ents = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i));

  it('a leva nasce numa Barcaça na água (tropa embarcada, invisível) com 2 Galés de escolta; ninguém aparece em terra', async () => {
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
    expect(esc.every((u) => u.type === 'war_galley' && u.layer === 'naval')).toBe(true);
    expect(d(pos(barge), gm.terrain.mapDef.anchors.fleetStart2)).toBeLessThan(5);
  });

  it('a Barcaça navega até a praia, solta a tropa (que parte para o ataque) e a escolta a acompanha', async () => {
    const { gm } = await boot([], 0.2);
    runAction(gm.mission, landingAction(gm));
    const barge = ents(gm, 'landing_barge')[0];
    const troops = ents(gm, 'landing');
    for (let i = 0; i < 120 * 20 && barge.cargo.length; i++) gm.simStep(SIM_DT);
    expect(barge.cargo).toHaveLength(0);
    expect(barge.isDead).toBe(false);
    const beach = gm.terrain.mapDef.anchors.beach1;
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
