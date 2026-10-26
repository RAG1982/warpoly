import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { getMap, ensureMapLoaded } from '../../src/data/maps/index.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { noArmy, rush } from '../fixtures/campaign-playthrough/war-alliance-05-cerne-verde.js';

/**
 * M3-06 — m05 "O Cerne Verde": mapa natural camp-05 (floresta densa; árvores novas de 180 de madeira, 1 em cada 3 descartada), 2.000 de madeira
 * COLETADA como primário, Salão do Bosque (Salão do Clã avançado + serraria + 3 torres) guardado por necromantes, esqueletos, guerreiros e serpes,
 * secundárias (Magos + Cavaleiro Grifo, lenhadores cativos), ocultas (Templário, Bosque Sagrado), cameo do Oren com 2 Magos. O playthrough completo
 * do robô (vitória, derrota, determinismo) está em tests/fixtures/campaign-playthrough/ e roda por campaignWorldPlaythrough.test.js.
 */
const ID = 'war-alliance-05-cerne-verde';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-alliance', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);

describe('m05 Cerne Verde · mapa e madeira', () => {
  it('mapa natural camp-05 (não é um mapa "legado"): árvores novas de 180 de madeira, ≥ 4× as 2.000 do objetivo (alcançável com folga) e perto da base', async () => {
    await ensureMapLoaded('camp-05-cerne-verde');
    expect(LEGACY_TREE_MAPS.has('camp-05-cerne-verde')).toBe(false);
    for (const id of ['camp-01-baia-de-aurelan', 'camp-02-pouso-do-encontro', 'camp-03-pedra-mae', 'camp-04-baixio-do-breu']) expect(LEGACY_TREE_MAPS.has(id), id).toBe(true); // mapas revisados não mudam
    const { gm } = await boot();
    const alive = gm.trees.filter((t) => !t.isDead);
    expect(alive.length).toBeGreaterThanOrEqual(80);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
    const total = alive.reduce((s, t) => s + t.woodRemaining, 0);
    expect(total).toBeGreaterThanOrEqual(8000); // 4× o objetivo
    const A = gm.terrain.mapDef.anchors;
    // madeira ao alcance do jogador: ≥ 20 árvores (3.600) a até 45 u do Paço
    expect(alive.filter((t) => d(posOf(t), A.playerStart) <= 45).length).toBeGreaterThanOrEqual(20);
  });

  it('âncoras da missão existem e as de terra são caminháveis; o Salão do Bosque fica no meio da ilha, longe do Paço e fora da base inimiga', async () => {
    const { gm } = await boot();
    const m = gm.terrain.mapDef, A = m.anchors;
    for (const k of ['playerStart', 'enemyStart', 'lumberHall2', 'sacredGrove', 'gryphonNest', 'clearing2']) expect(A[k], k).toBeTruthy();
    for (const k of ['sacredGrove', 'gryphonNest', 'clearing2']) expect(gm.pathfinder.isWalkableWorld(A[k].x, A[k].z), k).toBe(true);
    expect(d(A.lumberHall2, A.playerStart)).toBeGreaterThanOrEqual(50);
    expect(d(A.lumberHall2, A.enemyStart)).toBeGreaterThanOrEqual(24);
    expect(d(A.lumberHall2, A.enemyStart)).toBeLessThanOrEqual(45);
    expect(d(A.sacredGrove, A.playerStart)).toBeGreaterThanOrEqual(38);
      });
});

describe('m05 Cerne Verde · Brann, objetivos e tecnologia', () => {
  it('Brann está na missão desde o início, vivo, perto do Paço; a campanha eleva o Paço ao nível 3 ao fim da abertura e a Torre Arcana, o Templo e o Aviário ficam construíveis', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('brann');
    expect(ids).toHaveLength(1);
    const b = gm.entitiesById.get(ids[0]);
    expect(b.type).toBe('hero_brann');
    expect(b.ownerId).toBe(0);
    expect(d(posOf(b), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier || 1).toBe(1);
    const later = await boot([{ name: 'espera', wait: 41 }], 42);
    expect(later.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'castle').tier).toBe(3);
    expect(UNITS.mage.cost.gold).toBeGreaterThan(0);
  });

  it('objetivos: primários (2.000 de madeira + destruir o Salão), secundárias (Magos+Grifo, lenhadores) e ocultas (Templário, Bosque Sagrado); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-wood', 'p-hall']);
    expect(by(def, 'secondary')).toEqual(['s-arcane', 's-rescue']);
    expect(by(def, 'hidden')).toEqual(['h-templar', 'h-grove']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-wood')).toMatchObject({ type: 'collect', resource: 'wood', amount: 2000, mode: 'gathered' });
    expect(o('p-hall')).toMatchObject({ type: 'destroy', select: { tag: 'grove_hall' } });
    expect(o('s-arcane')).toMatchObject({ type: 'train', units: [{ type: 'mage', count: 2 }, { type: 'gryphon_rider', count: 1 }] });
    expect(o('s-rescue')).toMatchObject({ type: 'rescue', tag: 'woodcutters', count: 3 });
    expect(gm.mission.objectives.get('h-grove').visible).toBe(false);
    expect(gm.mission.objectives.get('h-templar').visible).toBe(false);
  });

  it('a madeira conta o que se COLETA, não o estoque: dar 5.000 de madeira não conclui o objetivo', async () => {
    const run = await boot([{ name: 'rico', wait: 1, run: (c) => c.give({ wood: 5000 }) }, { name: 'espera', wait: 3 }], 6);
    expect(run.gm.mission.objectives.get('p-wood').status).toBe('active');
    expect(run.gm.mission.objectives.get('p-wood').cur).toBeLessThan(200);
  });
});

describe('m05 Cerne Verde · o Salão do Bosque e as levas inimigas', () => {
  it('Salão do Bosque: Salão do Clã avançado (tag grove_hall) + serraria + 3 torres, em terra firme, com guarda de 3 necromantes, 6 esqueletos, 4 guerreiros, 2 lanceiros e 3 serpes', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const hall = gm.mission.tags.get('grove_hall').map((i) => gm.entitiesById.get(i));
    expect(hall).toHaveLength(1);
    expect(hall[0].type).toBe('great_hall');
    expect(hall[0].ownerId).toBe(1);
    expect(d(posOf(hall[0]), A.lumberHall2)).toBeLessThan(0.5);
    // o Salão principal do Clã é outro (tag enemy_base) e fica na base
    const base = gm.mission.tags.get('enemy_base').map((i) => gm.entitiesById.get(i));
    expect(base).toHaveLength(1);
    expect(d(posOf(base[0]), A.enemyStart)).toBeLessThan(1);
    expect(gm.mission.tags.get('grove_tower')).toHaveLength(3);
    expect(gm.mission.tags.get('grove_mill')).toHaveLength(1);
    const guards = gm.mission.tags.get('grove_guard').map((i) => gm.entitiesById.get(i));
    const n = (t) => guards.filter((u) => u.type === t).length;
    expect({ necro: n('necromancer'), skel: n('skeleton'), grunt: n('grunt'), axe: n('axethrower'), serp: n('war_serpent') }).toEqual({ necro: 3, skel: 6, grunt: 4, axe: 2, serp: 3 });
    for (const u of guards.filter((x) => x.type !== 'war_serpent')) expect(gm.pathfinder.isWalkableWorld(u.mesh.position.x, u.mesh.position.z), `${u.type} #${u.id}`).toBe(true);
    for (const u of guards) expect(d(posOf(u), A.lumberHall2)).toBeLessThan(26);
  });

  it('2 jogadores (Liga × Clã Forja Negra) e o inimigo é IA, com a pressão vinda das levas roteirizadas (a IA fica em easy; a dificuldade Média está nas levas e na guarda)', async () => {
    const { gm } = await boot();
    expect(gm.mission.def.players.map((p) => p.factionId)).toEqual(['human', 'orc']);
    expect(gm.mission.def.players[1]).toMatchObject({ isAI: true, difficulty: 'easy' });
  });

  it('3 levas roteirizadas (360, 600 e 840 s) saem da base inimiga rumo ao Paço: serpes+esqueletos, necromantes+esqueletos+ogros, serpes+ogros+guerreiros+catapulta', async () => {
    const { gm } = await boot();
    const trig = (id) => gm.mission.def.triggers.find((t) => t.id === id);
    const A = gm.terrain.mapDef.anchors;
    const comp = (id) => Object.fromEntries(trig(id).actions.find((a) => a.type === 'spawn').units.map((u) => [u.type, u.count]));
    expect([1, 2, 3].map((i) => trig(`raid-${i}`).when.at)).toEqual([360, 600, 840]);
    expect(comp('raid-1')).toEqual({ war_serpent: 3, skeleton: 4 });
    expect(comp('raid-2')).toEqual({ necromancer: 2, skeleton: 5, ogre: 3 });
    expect(comp('raid-3')).toEqual({ war_serpent: 3, ogre: 4, grunt: 4, catapult: 1 });
    for (const i of [1, 2, 3]) {
      const a = trig(`raid-${i}`).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe('enemy');
      expect(d(a, A.enemyStart)).toBeLessThan(12);
      expect(a.order.kind).toBe('attackMove');
      expect(d(a.order, A.playerStart)).toBeLessThan(0.5);
    }
    // a 1ª chega: 7 unidades hostis no instante 360 s
    const run = await boot([{ name: 'espera', wait: 361, run: (c) => { expect(c.tagged('raid')).toHaveLength(7); expect(c.tagged('raid').every((u) => u.ownerId === 1)).toBe(true); } }], 365);
    expect(run.outcome).toBeNull();
  }, 60000);
});

describe('m05 Cerne Verde · Oren e os Magos (cameo)', () => {
  it('Oren chega aos 240 s: o herói Oren fica NEUTRO (NPC, nome e anel próprios) e 2 Magos de Oren passam ao comando do jogador; eles NÃO contam no "treinar Magos"', async () => {
    const run = await boot([{ name: 'espera', wait: 241 }], 245);
    const { gm } = run;
    const oren = gm.mission.tags.get('oren').map((i) => gm.entitiesById.get(i));
    expect(oren).toHaveLength(1);
    expect(oren[0].type).toBe('hero_oren');
    expect(oren[0].ownerId).toBe(-1);
    expect(UNITS.hero_oren.cost).toBeNull(); // herói de papel: não treinável
    const mages = gm.mission.tags.get('oren_mages').map((i) => gm.entitiesById.get(i));
    expect(mages).toHaveLength(2);
    for (const u of mages) { expect(u.type).toBe('mage'); expect(u.ownerId).toBe(0); expect(d(posOf(u), gm.terrain.mapDef.anchors.playerStart)).toBeLessThan(24); }
    expect(gm.mission.def.triggers.find((t) => t.id === 'oren-arrives').actions.find((a) => a.tag === 'oren').displayName).toEqual({ 'pt-BR': 'Mestre Oren', en: 'Master Oren' });
    expect(gm.mission.objectives.get('s-arcane').cur).toBe(0);
    expect(run.outcome).toBeNull();
  });

  it('quando o exército chega perto do Salão (4 unidades a 34 u), os Magos de Oren marcham para ele (attackMove)', async () => {
    const run = await boot([
      { name: 'oren', wait: 241 },
      { name: 'perto', wait: 1, run: (c) => { const p = c.anchor('lumberHall2', -22, 6); for (const u of c.mine('knight')) c.teleport(u, p.x, p.z); c.teleport(c.mine('archer')[0], p.x, p.z + 1); } },
      { name: 'marcha', wait: 10 }
    ], 266);
    const A = run.gm.terrain.mapDef.anchors;
    const mages = run.gm.mission.tags.get('oren_mages').map((i) => run.gm.entitiesById.get(i)).filter((u) => !u.isDead);
    expect(mages.length).toBeGreaterThan(0);
    // saíram da base rumo ao Salão (ou já lutam lá)
    for (const u of mages) expect(d(posOf(u), A.lumberHall2)).toBeLessThan(d(A.playerStart, A.lumberHall2) - 8);
  }, 60000);
});

describe('m05 Cerne Verde · secundárias e ocultas', () => {
  it('lenhadores cativos: 3 aldeões neutros com nome e anel próprios, guardados por 3 orcs; matar os guardas liberta os 3 (n/3) e eles passam ao jogador; se um morre o resgate falha', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const cut = gm.mission.tags.get('woodcutters').map((i) => gm.entitiesById.get(i));
    expect(cut).toHaveLength(3);
    for (const u of cut) { expect(u.ownerId).toBe(-1); expect(u.markColor).toBe('#22d3ee'); expect(d(posOf(u), A.clearing2)).toBeLessThan(6); }
    expect(gm.mission.def.setup.find((s) => s.tag === 'woodcutters').displayName).toEqual({ 'pt-BR': 'Lenhador cativo', en: 'Captive woodcutter' });
    expect(gm.mission.tags.get('wood_guard')).toHaveLength(3);
    expect(d(A.clearing2, A.playerStart)).toBeGreaterThanOrEqual(38);
    const run = await boot([
      { name: 'guardas', wait: 1, run: (c) => c.slayTag('wood_guard') },
      { name: 'livres', wait: 2, run: (c) => { if (c.obj('s-rescue').cur !== 3) throw new Error('devia estar em 3/3'); if (!c.tagged('woodcutters').every((u) => u.ownerId === 0)) throw new Error('lenhadores do jogador'); } }
    ], 10);
    expect(run.gm.mission.objectives.get('s-rescue').status).toBe('completed');
    const dead = await boot([{ name: 'morte', wait: 1, run: (c) => c.slay([c.tagged('woodcutters')[0]]) }], 6);
    expect(dead.gm.mission.objectives.get('s-rescue').status).toBe('failed');
    expect(dead.outcome).toBeNull();
  }, 60000);

  it('Bosque Sagrado (oculto): chegar lá dá +250 de madeira e +150 de ouro e acende o marco; o marco só aparece depois de explorado', async () => {
    const { gm } = await boot();
    expect(gm.mission.landmarks.find((l) => l.tag === 'grove_shrine')).toBeTruthy();
    let before;
    const run = await boot([
      { name: 'ir', wait: 1, run: (c) => { before = { ...c.gm.getPlayer(0).resources }; const p = c.anchor('sacredGrove'); c.teleport(c.mine('knight')[0], p.x, p.z); } },
      { name: 'achado', wait: 2 }
    ], 12);
    expect(run.gm.mission.objectives.get('h-grove').status).toBe('completed');
    const after = run.gm.getPlayer(0).resources;
    expect(after.wood).toBeGreaterThanOrEqual(before.wood + 240);
    expect(after.gold).toBeGreaterThanOrEqual(before.gold + 140);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'grove_shrine').lit).toBeGreaterThan(0);
  }, 60000);

  it('Templário (oculto): só conclui com Ordenação pesquisada E um Templário vivo; dá +300 de ouro', async () => {
    let before = 0;
    const so = await boot([{ name: 'so-pesquisa', wait: 1, run: (c) => c.gm.getPlayer(0).setResearchLevel('cavalry_class', 1) }, { name: 'espera', wait: 3 }], 8);
    expect(so.gm.mission.objectives.get('h-templar').status).toBe('active'); // sem Templário
    const ok = await boot([
      { name: 'pesq', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.gm.getPlayer(0).setResearchLevel('cavalry_class', 1); } },
      { name: 'templario', wait: 1, run: (c) => c.gm.mission && c.gm.promoteUnit(c.mine('knight')[0], 'templar') },
      { name: 'espera', wait: 3 }
    ], 12);
    expect(ok.gm.mission.objectives.get('h-templar').status).toBe('completed');
    expect(ok.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 280);
  }, 60000);

  it('Magos + Cavaleiro Grifo treinados (comandos reais) completam a secundária s-arcane; tudo liberado pela campanha', async () => {
    const run = await boot([
      { name: 'rico', wait: 41, run: (c) => c.give({ gold: 3000, wood: 2000, stone: 1000 }) },
      { name: 'obras', every: 20, timeout: 500, until: (c) => c.status('s-arcane') === 'completed', each: (c) => {
        const help = () => c.mine('villager').slice(0, 4).map((u) => u.id);
        for (const b of c.gm.buildings.filter((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) c.issue({ type: c.CMD.BUILD, unitIds: help(), buildingId: b.id });
        const has = (t) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === t && !x.isDead);
        const next = ['farm', 'barracks', 'arcane_tower', 'aviary'].find((t) => !has(t));
        if (next && (next === 'farm' || done(c, next === 'barracks' ? 'farm' : 'barracks')) && !c.gm.buildings.some((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) place(c, next);
        const a = c.bld('arcane_tower'), v = c.bld('aviary');
        if (a && a.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: a.id, unitType: 'mage' });
        if (v && v.queue.length < 1 && c.gm.mission.trainedCount(0, 'gryphon_rider') < 1) c.issue({ type: c.CMD.TRAIN, buildingId: v.id, unitType: 'gryphon_rider' });
      } }
    ], 700);
    expect(run.gm.mission.objectives.get('s-arcane').status).toBe('completed');
    expect(run.gm.mission.trainedCount(0, 'mage')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'gryphon_rider')).toBeGreaterThanOrEqual(1);
  }, 120000);
});

function place(c, type) {
  const hq = posOf(c.bld('castle'));
  for (let r = 9; r < 44; r += 2.5) for (let a = 0; a < 16; a++) {
    const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8 + Math.PI / 2;
    const x = hq.x + Math.cos(ang) * r, z = hq.z + Math.sin(ang) * r;
    if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('villager').slice(0, 4).map((u) => u.id) }); return true; }
  }
  return false;
}
const done = (c, type) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === type && !x.isDead && x.isConstructed);

describe('m05 Cerne Verde · desfecho', () => {
  it('derrotas: o Paço cair é derrota; Brann morrer é derrota (com o texto próprio)', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('castle').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Paço/);
    const br = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('brann') }], 20);
    expect(br.outcome).toBe('defeat');
    expect(br.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
  });

  it('vitória: madeira + Salão do Bosque destruído → cutscene final e vitória; um dos dois sozinho não vence; as secundárias não decidem', async () => {
    const wood = await boot([{ name: 'so-madeira', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-wood', 'completed') }], 40);
    expect(wood.outcome).toBeNull();
    const hall = await boot([{ name: 'so-salao', wait: 1, run: (c) => c.slayTag('grove_hall') }], 40);
    expect(hall.gm.mission.objectives.get('p-hall').status).toBe('completed');
    expect(hall.outcome).toBeNull();
    const sec = await boot([{ name: 'sec', wait: 1, run: (c) => { for (const i of ['s-arcane', 's-rescue']) c.gm.mission.setObjectiveStatus(i, 'completed'); } }], 12);
    expect(sec.outcome).toBeNull();
    const fin = await boot([
      { name: 'madeira', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-wood', 'completed') },
      { name: 'salao', wait: 1, run: (c) => c.slayTag('grove_hall') },
      { name: 'final', wait: 25 }
    ], 60);
    expect(fin.outcome).toBe('victory');
  }, 60000);
});

describe('m05 Cerne Verde · dificuldade', () => {
  it('investida precoce: Brann + 3 soldados do início contra o Salão do Bosque NÃO vencem nem o derrubam; o Capitão cai e é derrota', async () => {
    const run = await boot(rush, 300);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.outcomeText['pt-BR']).toMatch(/Brann/);
    expect(run.gm.mission.objectives.get('p-hall').status).not.toBe('completed');
    expect(run.gm.mission.tags.get('grove_hall').map((i) => run.gm.entitiesById.get(i)).every((b) => !b.isDead)).toBe(true);
  }, 60000);

  it('roteiro sem exército (só economia e obras: nem tropa nem magos) PERDE para as levas, a 1ª com serpes (que espadachins não alcançam)', async () => {
    const run = await boot(noArmy, 1000);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.objectives.get('p-hall').status).not.toBe('completed');
    expect(run.seconds).toBeLessThan(700);
  }, 120000);
});

describe('m05 Cerne Verde · mapa antigo não muda', () => {
  it('as árvores dos mapas revisados continuam com 120 de madeira (camp-03)', async () => {
    await ensureMapLoaded('camp-03-pedra-mae');
    expect(getMap('camp-03-pedra-mae')).toBeTruthy();
    const { gm } = await playMission('war-alliance', 'war-alliance-03-ouro-da-pedra-mae', [], { maxSeconds: 1 });
    expect(gm.trees.find((t) => !t.isDead).maxWood).toBe(120);
  });
});
