import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { runAction } from '../../src/sim/missions/actions.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { isCliffAt } from '../../src/data/maps/cliff.js';
import { validateMapDef } from '../../src/data/maps/validate.js';
import { UNITS } from '../../src/data/units.js';
import { ridgeFrame, measureGaps } from '../../tools/lib/cliffRidge.mjs';
import { noDefense, rush } from '../fixtures/campaign-playthrough/war-alliance-03-ouro-da-pedra-mae.js';
import { SIM_DT } from '../../src/sim/constants.js';

/**
 * M3-04 — m03 "Ouro da Pedra-Mãe": mapa com crista intransponível e 2 desfiladeiros FECHÁVEIS com 6 muralhas (conferido no Pathfinder do jogo),
 * minas iniciais afastadas do Centro, Capitão Brann jogável desde o início, 7 min de ondas orcas pelos desfiladeiros (com cerco na última),
 * secundárias (torres, muralhas, Cavaleiros, mineiros cativos) e ocultas (Escudos Reforçados, Santuário). O playthrough completo do robô
 * (vitória, derrota, determinismo) está em tests/fixtures/campaign-playthrough/ e roda por campaignWorldPlaythrough.test.js.
 */
const ID = 'war-alliance-03-ouro-da-pedra-mae';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });

/** Constrói (já concluída) as muralhas `L` ('A' ou 'B') do jogador nas âncoras `wall<L>1..3`. */
function wallsAt(gm, L) {
  const A = gm.terrain.mapDef.anchors;
  for (let k = 1; k <= 3; k++) runAction(gm.mission, { type: 'spawnBuilding', owner: 'player', buildingType: 'wall_human', x: A[`wall${L}${k}`].x, z: A[`wall${L}${k}`].z });
}
const route = (gm, from = 'orcMuster', to = 'playerStart') => {
  const A = gm.terrain.mapDef.anchors;
  return gm.pathfinder.findPath(A[from].x, A[from].z, A[to].x, A[to].z, true);
};
/** Distância do ponto `p` à linha poligonal `start → path` (a rota devolvida pelo Pathfinder tem poucos pontos: segmentos longos). */
function polyDist(start, path, p) {
  const pts = [start, ...path];
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz));
  }
  return best;
}
const near = (gm, path, p, r = 9) => polyDist(gm.terrain.mapDef.anchors.orcMuster, path, p) <= r;

describe('m03 Pedra-Mãe · mapa: crista, desfiladeiros e muralhas', () => {
  it('mapa natural camp-03 (pedregoso, painted) com `cliffHeight`, 2 desfiladeiros e validateMapDef limpo', async () => {
    await ensureMapLoaded('camp-03-pedra-mae');
    const m = getMap('camp-03-pedra-mae');
    expect(m.tileset).toBe('pedregoso');
    expect(m.terrain.generator).toBe('painted');
    expect(m.cliffHeight).toBe(5);
    expect(m.meta.ridge.gaps).toHaveLength(2);
    const v = validateMapDef(m, { checkId: false });
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    // bases, jazidas e âncoras de terra nunca sobre a crista
    for (const s of m.startSlots) expect(isCliffAt(m, s.x, s.z)).toBe(false);
    for (const r of m.resources) expect(isCliffAt(m, r.x, r.z)).toBe(false);
    for (const [k, a] of Object.entries(m.anchors)) if (!a.water) expect(isCliffAt(m, a.x, a.z), k).toBe(false);
  });

  it('GARGALO real: cada desfiladeiro tem passagem de 1 a 6 células (≈ 4,5–9 u) na grade de navegação; a rota orc passa por um deles', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef;
    const rg = m.meta.ridge;
    const F = ridgeFrame(m, { seed: m.meta.seedUsed, along: rg.along, wave: rg.wave });
    const gaps = measureGaps(m, F, rg.gaps.map((u) => ({ u, w: rg.gapWidth })), gm.pathfinder);
    expect(gaps).toHaveLength(2);
    for (const g of gaps) {
      expect(g.cells, `passagem do desfiladeiro u=${g.u}`).toBeGreaterThanOrEqual(1);
      expect(g.cells).toBeLessThanOrEqual(6);
      expect(g.width).toBeGreaterThanOrEqual(4.5);
      expect(g.width).toBeLessThanOrEqual(9);
    }
    // a rota do acampamento orc até o Paço atravessa um dos dois desfiladeiros (não há outro caminho: crista de costa a costa)
    const A = m.anchors;
    const p = route(gm);
    expect(p.noPath).toBeFalsy();
    expect(near(gm, p, A.passA) || near(gm, p, A.passB)).toBe(true);
    // os dois desfiladeiros ficam perto um do outro (as torres do meio cobrem os dois: alcance 18)
    expect(d(A.passA, A.passB)).toBeGreaterThanOrEqual(20);
    expect(d(A.passA, A.passB)).toBeLessThanOrEqual(32);
  });

  it('muralhas nos desfiladeiros (via spawnBuilding): uma linha de 3 blocos fecha a passagem; só as DUAS linhas partem a ilha (Pathfinder do jogo)', async () => {
    const A = (await boot()).gm.terrain.mapDef.anchors;
    // aberto: há caminho
    const open = await boot();
    expect(route(open.gm).noPath).toBeFalsy();
    // só a linha A: o caminho existe e passa pelo desfiladeiro B
    const a = await boot();
    wallsAt(a.gm, 'A');
    const pa = route(a.gm);
    expect(pa.noPath).toBeFalsy();
    expect(near(a.gm, pa, A.passB)).toBe(true);
    expect(near(a.gm, pa, A.passA, 4)).toBe(false);
    // só a linha B: passa pelo A
    const b = await boot();
    wallsAt(b.gm, 'B');
    const pb = route(b.gm);
    expect(pb.noPath).toBeFalsy();
    expect(near(b.gm, pb, A.passA)).toBe(true);
    // as duas: SEM caminho (nem o modo largo nem o normal)
    const both = await boot();
    wallsAt(both.gm, 'A');
    wallsAt(both.gm, 'B');
    expect(route(both.gm).noPath).toBe(true);
    expect(both.gm.pathfinder.findPath(A.orcMuster.x, A.orcMuster.z, A.playerStart.x, A.playerStart.z, false).noPath).toBe(true);
    // derrubar UM bloco reabre a passagem
    const w = both.gm.buildings.filter((x) => x.type === 'wall_human' && x.ownerId === 0).find((x) => d({ x: x.mesh.position.x, z: x.mesh.position.z }, A.wallA2) < 1);
    w.takeDamage(1e6, both.gm.getUnitsOf(1)[0] || both.gm.getUnitsOf(0)[0]);
    both.gm.simStep(SIM_DT);
    both.gm.simStep(SIM_DT);
    expect(route(both.gm).noPath).toBeFalsy();
  });

  it('o jogador consegue pôr as 6 muralhas e ≥ 3 torres nos pontos da âncora (canPlaceBuilding)', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    for (const L of 'AB') for (let k = 1; k <= 3; k++) expect(gm.canPlaceBuilding('wall_human', A[`wall${L}${k}`].x, A[`wall${L}${k}`].z, null, 0), `wall${L}${k}`).toBe(true);
    const ok = ['towerA1', 'towerA2', 'towerB1', 'towerB2'].filter((n) => gm.canPlaceBuilding('watchtower', A[n].x, A[n].z, null, 0));
    expect(ok.length).toBeGreaterThanOrEqual(3);
    // as torres ficam ATRÁS da linha de muralha e alcançam o desfiladeiro (alcance 18)
    for (const n of ok) expect(Math.min(d(A[n], A.passA), d(A[n], A.passB)), n).toBeLessThanOrEqual(18);
  });

  it('crista intransponível de verdade: construção recusada, unidade terrestre ordenada para dentro dela fica de fora; mapa sem `cliffHeight` não muda', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    const rg = m.meta.ridge;
    const F = ridgeFrame(m, { seed: m.meta.seedUsed, along: rg.along, wave: rg.wave });
    // ponto no meio da crista, longe dos desfiladeiros
    const u = rg.gaps[0] - 30;
    const top = F.world(F.wv(u), u);
    expect(gm.terrain.isCliff(top.x, top.z)).toBe(true);
    expect(gm.canPlaceBuilding('wall_human', top.x, top.z, null, 0)).toBe(false);
    expect(gm.pathfinder.isWalkableWorld(top.x, top.z)).toBe(false);
    // unidade a pé: manda andar para o topo da crista; nunca pisa em penhasco
    const knight = gm.getUnitsOf(0).find((x) => x.type === 'knight');
    knight.moveTo(top.x, top.z, gm);
    for (let i = 0; i < 20 * 25; i++) {
      gm.simStep(SIM_DT);
      expect(gm.terrain.isCliff(knight.mesh.position.x, knight.mesh.position.z)).toBe(false);
    }
    void A;
    // mapas antigos: sem campo, sem crista
    await ensureMapLoaded('camp-02-pouso-do-encontro');
    const old = getMap('camp-02-pouso-do-encontro');
    expect(old.cliffHeight).toBeUndefined();
    expect(isCliffAt(old, 0, 0)).toBe(false);
  });
});

describe('m03 Pedra-Mãe · minas', () => {
  it('minas iniciais a ~32 u do Centro (28–36), iguais para os dois lados; a mina grande (Veio, 12.000) fica atrás dos desfiladeiros, mais longe que a inicial', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    const golds = m.resources.filter((r) => r.type === 'gold');
    expect(golds).toHaveLength(4);
    const d0 = d(A.goldMine1, A.playerStart), d1 = d(A.goldMine2, A.enemyStart);
    for (const x of [d0, d1]) { expect(x).toBeGreaterThanOrEqual(28); expect(x).toBeLessThanOrEqual(36); }
    expect(Math.abs(d0 - d1)).toBeLessThanOrEqual(2); // mesmo critério dos dois lados
    // borda a borda (Paço 5,5 + mina 3,4): ≥ 19 u (antes ≈ 6–9 u)
    expect(d0 - 5.5 - 3.4).toBeGreaterThanOrEqual(19);
    // o Veio
    const veio = golds.find((r) => r.amount === 12000);
    expect(veio).toBeTruthy();
    expect(d(veio, A.colonyGold1)).toBeLessThan(0.2);
    expect(d(veio, A.playerStart)).toBeGreaterThan(d0 + 4);
    // do lado do Paço (atrás da linha) e ao alcance de uma torre da linha (alcance 18)
    const rg = m.meta.ridge;
    const F = ridgeFrame(m, { seed: m.meta.seedUsed, along: rg.along, wave: rg.wave });
    expect(F.side(veio.x, veio.z)).toBeLessThan(-8);
    expect(Math.min(...['towerA1', 'towerA2', 'towerB1', 'towerB2'].map((n) => d(veio, A[n])))).toBeLessThanOrEqual(18);
    // as jazidas existem de fato no jogo e as minas iniciais ficam do lado certo da crista
    expect(gm.resourceDeposits.filter((r) => r.type === 'gold')).toHaveLength(4);
    expect(F.side(A.goldMine1.x, A.goldMine1.z)).toBeLessThan(0);
    expect(F.side(A.goldMine2.x, A.goldMine2.z)).toBeGreaterThan(0);
  });
});

describe('m03 Pedra-Mãe · Brann, objetivos e ondas', () => {
  it('Capitão Brann está na missão desde o início, perto do Paço, vivo, com mana e as 3 habilidades de herói; Grito de Guerra funciona', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('brann');
    expect(ids).toHaveLength(1);
    const b = gm.entitiesById.get(ids[0]);
    expect(b.type).toBe('hero_brann');
    expect(b.ownerId).toBe(0);
    expect(b.isDead).toBe(false);
    expect(gm.getUnitsOf(0).filter((u) => u.type === 'hero_brann')).toHaveLength(1);
    const A = gm.terrain.mapDef.anchors;
    expect(d({ x: b.mesh.position.x, z: b.mesh.position.z }, A.playerStart)).toBeLessThanOrEqual(20);
    expect(gm.pathfinder.isWalkableWorld(b.mesh.position.x, b.mesh.position.z)).toBe(true);
    expect(UNITS.hero_brann.abilities).toHaveLength(3);
    const mana0 = b.mana;
    expect(mana0).toBeGreaterThanOrEqual(100);
    gm.issue({ playerId: 0, type: 'cast', unitIds: [b.id], abilityId: 'hero_war_cry' });
    for (let i = 0; i < 40; i++) gm.simStep(SIM_DT);
    expect(b.mana).toBeLessThan(mana0 - 20);
    // a campanha eleva o Paço ao nível 2 (Estábulo/Cavaleiro) ao fim da cutscene de abertura (40 s), e o herói está liberado em campaign.json (unlocks.heroes)
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier || 1).toBe(1);
    const later = await boot([{ name: 'espera', wait: 41 }], 42);
    expect(later.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier).toBe(2);
  });

  it('objetivos: primários (7 min de sobrevivência + 2.000 de ouro), secundários (torres, muralhas, Cavaleiros, mineiros) e ocultos (Escudos, Santuário); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    const by = (p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);
    expect(by('primary')).toEqual(['p-survive', 'p-gold']);
    expect(by('secondary')).toEqual(['s-towers', 's-walls', 's-cavaliers', 's-rescue']);
    expect(by('hidden')).toEqual(['h-armor', 'h-shrine']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-survive')).toMatchObject({ type: 'survive', seconds: 420, active: false });
    expect(o('p-gold')).toMatchObject({ type: 'collect', resource: 'gold', amount: 2000, mode: 'gathered' });
    expect(o('s-towers')).toMatchObject({ type: 'build', buildingType: 'watchtower', count: 2 });
    expect(o('s-walls')).toMatchObject({ type: 'build', buildingType: 'wall_human', count: 6 });
    expect(o('s-cavaliers')).toMatchObject({ type: 'train', units: [{ type: 'cavalier', count: 4 }] });
    expect(o('s-rescue')).toMatchObject({ type: 'rescue', tag: 'miners', count: 3 });
    expect(o('h-armor').condition).toMatchObject({ type: 'research', id: 'melee_armor' });
    expect(gm.mission.objectives.get('p-survive').status).toBe('inactive'); // só abre com o desembarque
    expect(gm.mission.objectives.get('h-shrine').visible).toBe(false);
  });

  it('o relógio dos 7 min começa no desembarque (295 s); ondas: 5, 11, 9 e 9 orcs + Catapulta na última, saindo do acampamento orc rumo ao Paço', async () => {
    const { gm } = await boot();
    const trig = (id) => gm.mission.def.triggers.find((t) => t.id === id);
    const count = (a) => a.units.reduce((n, u) => n + u.count, 0);
    const spawnOf = (id) => trig(id).actions.find((a) => a.type === 'spawn');
    expect(trig('landing').when.at).toBe(295);
    expect(trig('landing').actions.some((a) => a.type === 'setObjective' && a.id === 'p-survive' && a.status === 'active')).toBe(true);
    expect([1, 2, 3, 4].map((i) => count(spawnOf(`wave-${i}`)))).toEqual([5, 11, 9, 9]);
    expect([1, 2, 3, 4].map((i) => trig(`wave-${i}`).when.at)).toEqual([330, 420, 510, 600]);
    for (const i of [1, 2, 3, 4]) {
      const a = spawnOf(`wave-${i}`);
      expect(a.owner).toBe('enemy');
      expect(d(a, gm.terrain.mapDef.anchors.orcMuster)).toBeLessThan(0.5); // (as âncoras já vêm resolvidas em x/z)
      expect(a.order.kind).toBe('attackMove');
      expect(d(a.order, gm.terrain.mapDef.anchors.playerStart)).toBeLessThan(0.5);
    }
    // cerco na última: 1 Catapulta, antes da onda de infantaria
    const siege = spawnOf('siege-launch');
    expect(siege.units).toEqual([{ type: 'catapult', count: 1 }]);
    expect(trig('siege-launch').when.at).toBeLessThan(trig('wave-4').when.at);
    expect(spawnOf('wave-3').units.some((u) => u.type === 'ogre')).toBe(true);
    // o acampamento orc de onde saem fica do lado dos orcs, longe da crista de fato (marcha de ≥ 40 u até o Paço, pelos desfiladeiros)
    const A = gm.terrain.mapDef.anchors;
    expect(d(A.orcMuster, A.playerStart)).toBeGreaterThanOrEqual(40);
    // a 1ª onda chega: spawn de 5 orcs hostis no instante 330 s
    const run = await boot([{ name: 'espera', wait: 331, run: (c) => { expect(c.tagged('wave')).toHaveLength(5); expect(c.tagged('wave').every((u) => u.ownerId === 1)).toBe(true); } }], 335);
    expect(run.outcome).toBeNull();
  }, 60000);

  it('Escudos Reforçados (oculto): pesquisar antes da 3ª onda dá +150 de ouro; passada a 3ª onda o objetivo falha', async () => {
    let before = 0;
    const ok = await boot([
      { name: 'pesq', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.gm.getPlayer(0).setResearchLevel('melee_armor', 1); } },
      { name: 'espera', wait: 2 }
    ], 8);
    expect(ok.gm.mission.objectives.get('h-armor').status).toBe('completed');
    expect(ok.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 140);
    // (sem defesa o jogador cairia antes: as ondas são varridas a cada segundo só para chegar à 3ª)
    const late = await boot([{ name: 'espera', every: 20, each: (c) => c.slay(c.gm.allUnits.filter((u) => u.ownerId === 1)), until: (c) => c.seconds > 515, timeout: 600 }], 520);
    expect(late.gm.mission.objectives.get('h-armor').status).toBe('failed');
  }, 60000);

  it('derrotas: o Paço cair é derrota; Brann morrer é derrota (com o texto próprio)', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Paço/);
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
    expect(br.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
  });

  it('vitória: sobreviver 7 min + 2.000 de ouro → cutscene final e vitória (sem eles, nada); as secundárias não decidem', async () => {
    const early = await boot([{ name: 'sec', wait: 1, run: (c) => { for (const i of ['s-towers', 's-walls', 's-cavaliers']) c.gm.mission.setObjectiveStatus(i, 'completed'); c.gm.mission.setObjectiveStatus('p-gold', 'completed'); } }], 12);
    expect(early.outcome).toBeNull(); // falta o p-survive
    const fin = await boot([
      { name: 'desembarque', wait: 296 },
      { name: 'tudo', wait: 1, run: (c) => { c.gm.mission.setObjectiveStatus('p-gold', 'completed'); c.gm.mission.setObjectiveStatus('p-survive', 'completed'); } },
      { name: 'final', wait: 25 }
    ], 340);
    expect(fin.outcome).toBe('victory');
  }, 60000);
});

describe('m03 Pedra-Mãe · secundárias de resgate e exploração', () => {
  it('mineiros cativos: 3 aldeões neutros com nome e anel próprios, guardados por 3 orcs; matar os guardas liberta os 3 (n/3), revela o Santuário (oculto) e chegar lá dá +200 e acende o marco', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const miners = gm.mission.tags.get('miners').map((i) => gm.entitiesById.get(i));
    expect(miners).toHaveLength(3);
    for (const u of miners) { expect(u.ownerId).toBe(-1); expect(u.markColor).toBe('#22d3ee'); expect(d({ x: u.mesh.position.x, z: u.mesh.position.z }, A.captive1)).toBeLessThan(5); }
    const sp = gm.mission.def.setup.find((s) => s.tag === 'miners');
    expect(sp.displayName).toEqual({ 'pt-BR': 'Mineiro cativo', en: 'Captive miner' });
    // a cor do anel não é cor de jogador
    expect(['#2563eb', '#dc2626', '#16a34a', '#eab308', '#9333ea', '#ea580c', '#0891b2', '#db2777']).not.toContain(sp.markColor);
    expect(gm.mission.tags.get('miner_guard')).toHaveLength(3);
    // longe dos desfiladeiros e do Paço (canto do platô), do lado do jogador
    expect(d(A.captive1, A.playerStart)).toBeGreaterThanOrEqual(38);
    expect(d(A.captive1, A.passA)).toBeGreaterThanOrEqual(40);
    // o santuário existe como marco (só aparece depois de explorado) e a missão o esconde
    expect(gm.mission.landmarks.find((l) => l.tag === 'shrine')).toBeTruthy();
    expect(d(A.shrine1, A.captive1)).toBeGreaterThanOrEqual(30);
    expect(gm.mission.objectives.get('h-shrine').visible).toBe(false);
    let before = 0;
    const run = await boot([
      { name: 'guardas', wait: 1, run: (c) => c.slayTag('miner_guard') },
      { name: 'livres', wait: 2, run: (c) => { if (c.obj('s-rescue').cur !== 3) throw new Error('devia estar em 3/3'); if (!c.tagged('miners').every((u) => u.ownerId === 0)) throw new Error('mineiros do jogador'); if (!c.obj('h-shrine').visible) throw new Error('santuário revelado'); before = c.gm.getPlayer(0).resources.gold; const p = c.anchor('shrine1'); c.teleport(c.mine('knight')[0], p.x, p.z); } },
      { name: 'achado', wait: 2 }
    ], 20);
    expect(run.gm.mission.objectives.get('s-rescue').status).toBe('completed');
    expect(run.gm.mission.objectives.get('h-shrine').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 190);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'shrine').lit).toBeGreaterThan(0);
    expect(run.outcome).toBeNull();
  }, 60000);

  it('se um mineiro morre, o resgate falha (secundária) mas a missão segue', async () => {
    const run = await boot([{ name: 'morte', wait: 1, run: (c) => c.slay([c.tagged('miners')[0]]) }], 6);
    expect(run.gm.mission.objectives.get('s-rescue').status).toBe('failed');
    expect(run.outcome).toBeNull();
  });
});

describe('m03 Pedra-Mãe · dificuldade', () => {
  it('investida precoce: Brann + 3 soldados do início contra a base orc (2 torres e 6 guardas) NÃO vencem nem derrubam o Salão; o Capitão cai e é derrota', async () => {
    const { gm: g0 } = await boot();
    const towers = g0.buildings.filter((b) => b.ownerId === 1 && b.type === 'orc_watchtower');
    expect(towers).toHaveLength(2);
    for (const t of towers) { expect(g0.terrain.getHeight(t.mesh.position.x, t.mesh.position.z)).toBeGreaterThanOrEqual(1.8); expect(g0.terrain.isCliff(t.mesh.position.x, t.mesh.position.z)).toBe(false); }
    expect(g0.mission.tags.get('orc_guard')).toHaveLength(6);
    const run = await boot(rush, 300);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-survive').status).not.toBe('completed');
    expect(run.gm.buildings.some((b) => b.ownerId === 1 && b.role === 'hq' && !b.isDead)).toBe(true); // a base orc segue de pé
    expect(run.outcome).toBe('defeat'); // o herói corre na frente e cai sozinho nas torres e nos guardas
    expect(run.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
    expect(run.seconds).toBeLessThan(120);
  }, 60000);

  it('roteiro sem defesas (economia + Cavaleiros, nem torres nem muralhas nem infantaria em massa) PERDE: as ondas passam pelos desfiladeiros abertos', async () => {
    const run = await boot(noDefense, 1000);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.objectives.get('s-walls').cur).toBe(0);
    expect(run.seconds).toBeLessThan(660);
  }, 120000);
});
