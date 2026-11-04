import { describe, it, expect } from 'vitest';
import '../../src/data/campaigns/index.js';
import { playMission } from './helpers/campaignHarness.js';
import { ensureMapLoaded } from '../../src/data/maps/index.js';
import { LEGACY_TREE_MAPS, TREE_WOOD } from '../../src/data/economy.js';
import { UNITS } from '../../src/data/units.js';
import { noArmy, rush } from '../fixtures/campaign-playthrough/war-horde-05-madeira-de-guerra.js';

/**
 * M4-05 — m05 da Horda "Madeira de Guerra" (assalto ao bosque-forte de Aurelan no Cerne Verde): 2.000 de madeira COLETADA como primário, bosque-forte
 * (Castelo avançado + serraria + 3 torres) guardado por Magos, Arqueiros, Espadachins, Grifos e Oren, secundária (2 Necromantes + 1 Serpe treinados),
 * oculta do Ritual das Tempestades (Ogro Feiticeiro) e do Bosque Sagrado, cameos de Narga (serpe nomeada do jogador) e de Vozgul (NPC). Drogath é o herói
 * (derrota se cair). O playthrough completo do robô (vitória, derrota, determinismo) roda por campaignWorldPlaythrough.test.js.
 */
const ID = 'war-horde-05-madeira-de-guerra';
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
const boot = (script = [], maxSeconds = 1) => playMission('war-horde', ID, script, { maxSeconds });
const by = (def, p) => def.objectives.filter((o) => (o.priority ?? 'primary') === p).map((o) => o.id);

describe('m05 Madeira de Guerra · mapa e madeira', () => {
  it('mapa natural camp-05: árvores novas de 180 de madeira, ≥ 4× as 2.000 do objetivo e perto da base do jogador (slot oeste)', async () => {
    await ensureMapLoaded('camp-05-cerne-verde');
    expect(LEGACY_TREE_MAPS.has('camp-05-cerne-verde')).toBe(false);
    const { gm } = await boot();
    expect(gm.terrain.mapDef.id).toBe('camp-05-cerne-verde');
    const alive = gm.trees.filter((t) => !t.isDead);
    for (const t of alive) expect(t.maxWood).toBe(TREE_WOOD);
    expect(alive.reduce((s, t) => s + t.woodRemaining, 0)).toBeGreaterThanOrEqual(8000);
    const A = gm.terrain.mapDef.anchors;
    expect(alive.filter((t) => d(posOf(t), A.playerStart) <= 45).length).toBeGreaterThanOrEqual(20);
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'great_hall');
    expect(d(posOf(hall), A.playerStart)).toBeLessThan(1);
    expect(gm.players.map((p) => [p.id, p.factionId])).toEqual([[0, 'orc'], [1, 'human']]);
  });

  it('âncoras: o bosque-forte fica no meio da ilha, longe do Salão do jogador e fora da base inimiga; o Bosque Sagrado é caminhável', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    for (const k of ['playerStart', 'enemyStart', 'lumberHall2', 'sacredGrove', 'gryphonNest']) expect(A[k], k).toBeTruthy();
    expect(gm.pathfinder.isWalkableWorld(A.sacredGrove.x, A.sacredGrove.z)).toBe(true);
    expect(d(A.lumberHall2, A.playerStart)).toBeGreaterThanOrEqual(50);
    expect(d(A.lumberHall2, A.enemyStart)).toBeGreaterThanOrEqual(24);
    expect(d(A.lumberHall2, A.enemyStart)).toBeLessThanOrEqual(45);
  });
});

describe('m05 Madeira de Guerra · Drogath, objetivos e tecnologia', () => {
  it('Drogath está na missão desde o início, vivo, perto do Salão; a campanha eleva o Salão ao nível 3 aos 40 s', async () => {
    const { gm } = await boot();
    const ids = gm.mission.tags.get('drogath');
    expect(ids).toHaveLength(1);
    const h = gm.entitiesById.get(ids[0]);
    expect(h.type).toBe('hero_drogath');
    expect(h.ownerId).toBe(0);
    expect(d(posOf(h), gm.terrain.mapDef.anchors.playerStart)).toBeLessThanOrEqual(20);
    expect(gm.buildings.find((x) => x.ownerId === 0 && x.type === 'great_hall').tier || 1).toBe(1);
    const later = await boot([{ name: 'espera', wait: 41 }], 42);
    expect(later.gm.buildings.find((x) => x.ownerId === 0 && x.type === 'great_hall').tier).toBe(3);
    expect(UNITS.necromancer.cost.gold).toBeGreaterThan(0);
  });

  it('objetivos: primários (2.000 de madeira + destruir o bosque-forte), secundária (Necromantes + Serpe) e ocultas (Ritual, Bosque Sagrado); autoVictory off', async () => {
    const { gm } = await boot();
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(by(def, 'primary')).toEqual(['p-wood', 'p-hall']);
    expect(by(def, 'secondary')).toEqual(['s-necro']);
    expect(by(def, 'hidden')).toEqual(['h-ritual', 'h-grove']);
    const o = (id) => def.objectives.find((x) => x.id === id);
    expect(o('p-wood')).toMatchObject({ type: 'collect', resource: 'wood', amount: 2000, mode: 'gathered' });
    expect(o('p-hall')).toMatchObject({ type: 'destroy', select: { tag: 'grove_fort' } });
    expect(o('s-necro')).toMatchObject({ type: 'train', units: [{ type: 'necromancer', count: 2 }, { type: 'war_serpent', count: 1 }] });
    expect(gm.mission.objectives.get('h-grove').visible).toBe(false);
    expect(gm.mission.objectives.get('h-ritual').visible).toBe(false);
  });

  it('a madeira conta o que se COLETA, não o estoque: dar 5.000 de madeira não conclui o objetivo', async () => {
    const run = await boot([{ name: 'rico', wait: 1, run: (c) => c.give({ wood: 5000 }) }, { name: 'espera', wait: 3 }], 6);
    expect(run.gm.mission.objectives.get('p-wood').status).toBe('active');
    expect(run.gm.mission.objectives.get('p-wood').cur).toBeLessThan(200);
  });
});

describe('m05 Madeira de Guerra · o bosque-forte e as levas de Aurelan', () => {
  it('bosque-forte: Castelo avançado (tag grove_fort) + serraria + 3 torres, em terra firme, com 3 Magos, 4 Arqueiros, 3 Espadachins, 3 Grifos e Oren; a base inimiga é outro Castelo', async () => {
    const { gm } = await boot();
    const A = gm.terrain.mapDef.anchors;
    const fort = gm.mission.tags.get('grove_fort').map((i) => gm.entitiesById.get(i));
    expect(fort).toHaveLength(1);
    expect(fort[0].type).toBe('castle');
    expect(fort[0].ownerId).toBe(1);
    expect(d(posOf(fort[0]), A.lumberHall2)).toBeLessThan(0.5);
    const base = gm.mission.tags.get('enemy_base').map((i) => gm.entitiesById.get(i));
    expect(base).toHaveLength(1);
    expect(d(posOf(base[0]), A.enemyStart)).toBeLessThan(1);
    expect(gm.mission.tags.get('grove_tower')).toHaveLength(3);
    expect(gm.mission.tags.get('grove_mill')).toHaveLength(1);
    const guards = gm.mission.tags.get('grove_guard').map((i) => gm.entitiesById.get(i));
    const n = (t) => guards.filter((u) => u.type === t).length;
    expect({ mage: n('mage'), archer: n('archer'), knight: n('knight'), gryphon: n('gryphon_rider') }).toEqual({ mage: 3, archer: 4, knight: 3, gryphon: 3 });
    for (const u of guards.filter((x) => x.type !== 'gryphon_rider')) expect(gm.pathfinder.isWalkableWorld(u.mesh.position.x, u.mesh.position.z), `${u.type} #${u.id}`).toBe(true);
    for (const u of guards) expect(d(posOf(u), A.lumberHall2)).toBeLessThan(26);
    const oren = gm.entitiesById.get(gm.mission.tags.get('oren')[0]);
    expect(oren.type).toBe('hero_oren');
    expect(oren.ownerId).toBe(1);
  });

  it('2 jogadores (Clãs × Tropas de Aurelan); o inimigo é IA em easy, com a pressão vinda das levas roteirizadas', async () => {
    const { gm } = await boot();
    expect(gm.mission.def.players.map((p) => p.factionId)).toEqual(['orc', 'human']);
    expect(gm.mission.def.players[1]).toMatchObject({ isAI: true, difficulty: 'easy' });
  });

  it('3 levas roteirizadas (330, 570 e 810 s) saem da base inimiga rumo ao Salão: Grifos+arqueiros, Magos+espadachins+arqueiros, Grifos+espadachins+arqueiros+Balista', async () => {
    const { gm } = await boot();
    const trig = (id) => gm.mission.def.triggers.find((t) => t.id === id);
    const A = gm.terrain.mapDef.anchors;
    const comp = (id) => Object.fromEntries(trig(id).actions.find((a) => a.type === 'spawn').units.map((u) => [u.type, u.count]));
    expect([1, 2, 3].map((i) => trig(`raid-${i}`).when.at)).toEqual([330, 570, 810]);
    expect(comp('raid-1')).toEqual({ gryphon_rider: 3, archer: 4 });
    expect(comp('raid-2')).toEqual({ mage: 3, knight: 5, archer: 2 });
    expect(comp('raid-3')).toEqual({ gryphon_rider: 3, knight: 4, archer: 3, ballista: 1 });
    for (const i of [1, 2, 3]) {
      const a = trig(`raid-${i}`).actions.find((x) => x.type === 'spawn');
      expect(a.owner).toBe('enemy');
      expect(d(a, A.enemyStart)).toBeLessThan(12);
      expect(a.order.kind).toBe('attackMove');
      expect(d(a.order, A.playerStart)).toBeLessThan(0.5);
    }
    const run = await boot([{ name: 'espera', wait: 331, run: (c) => { expect(c.tagged('raid')).toHaveLength(7); expect(c.tagged('raid').every((u) => u.ownerId === 1)).toBe(true); } }], 335);
    expect(run.outcome).toBeNull();
    expect(run.gm.mission.vars.raids).toBe(1);
  }, 60000);
});

describe('m05 Madeira de Guerra · Narga e Vozgul (cameos)', () => {
  it('aos 240 s: Narga (Serpe de Guerra nomeada) passa ao jogador e Vozgul fica NEUTRA (NPC com nome e anel próprios); Narga NÃO conta no "treinar Serpe"', async () => {
    let before = null;
    const run = await boot([{ name: 'antes', wait: 239, run: (c) => { before = { ...c.gm.getPlayer(0).resources }; } }, { name: 'depois', wait: 3 }], 245);
    const { gm } = run;
    const narga = gm.mission.tags.get('narga').map((i) => gm.entitiesById.get(i));
    expect(narga).toHaveLength(1);
    expect(narga[0].type).toBe('war_serpent');
    expect(narga[0].ownerId).toBe(0);
    const voz = gm.mission.tags.get('vozgul').map((i) => gm.entitiesById.get(i));
    expect(voz).toHaveLength(1);
    expect(voz[0].type).toBe('hero_vozgul');
    expect(voz[0].ownerId).toBe(-1);
    expect(UNITS.hero_vozgul.cost).toBeNull();
    const t = gm.mission.def.triggers.find((x) => x.id === 'allies-arrive');
    expect(t.actions.find((a) => a.tag === 'narga').displayName).toEqual({ 'pt-BR': 'Narga Asa-Rota', en: 'Narga Broken-Wing' });
    expect(gm.mission.objectives.get('s-necro').cur).toBe(0);
    expect(gm.mission.trainedCount(0, 'war_serpent')).toBe(0);
    expect(gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before.gold + 100 - 5);
    expect(run.outcome).toBeNull();
  });

  it('quando o exército chega perto do bosque-forte (4 unidades a 34 u), Narga marcha para ele (attackMove)', async () => {
    const run = await boot([
      { name: 'aliados', wait: 241 },
      { name: 'perto', wait: 1, run: (c) => { const p = c.anchor('lumberHall2', -22, 6); for (const u of c.mine('grunt')) c.teleport(u, p.x, p.z); c.teleport(c.mine('axethrower')[0], p.x, p.z + 1); } },
      { name: 'marcha', wait: 10 }
    ], 266);
    const A = run.gm.terrain.mapDef.anchors;
    const narga = run.gm.mission.tags.get('narga').map((i) => run.gm.entitiesById.get(i)).filter((u) => !u.isDead);
    expect(narga.length).toBe(1);
    expect(d(posOf(narga[0]), A.lumberHall2)).toBeLessThan(d(A.playerStart, A.lumberHall2) - 8);
  }, 60000);
});

describe('m05 Madeira de Guerra · secundária e ocultas', () => {
  it('Bosque Sagrado (oculto): revelado aos 150 s; chegar lá dá +250 de madeira e +150 de ouro e acende o marco', async () => {
    const { gm } = await boot();
    expect(gm.mission.landmarks.find((l) => l.tag === 'grove_shrine')).toBeTruthy();
    let before;
    let seen = null;
    const run = await boot([
      { name: 'dica', wait: 152, run: (c) => { seen = c.gm.mission.objectives.get('h-grove').visible; } },
      { name: 'ir', wait: 1, run: (c) => { before = { ...c.gm.getPlayer(0).resources }; const p = c.anchor('sacredGrove'); c.teleport(c.mine('grunt')[0], p.x, p.z); } },
      { name: 'achado', wait: 2 }
    ], 160);
    expect(seen).toBe(true);
    expect(run.gm.mission.objectives.get('h-grove').status).toBe('completed');
    const after = run.gm.getPlayer(0).resources;
    expect(after.wood).toBeGreaterThanOrEqual(before.wood + 240);
    expect(after.gold).toBeGreaterThanOrEqual(before.gold + 140);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'grove_shrine').lit).toBeGreaterThan(0);
  }, 60000);

  it('Ritual das Tempestades (oculto): só conclui com a pesquisa E um Ogro Feiticeiro vivo; dá +300 de ouro', async () => {
    let before = 0;
    const so = await boot([{ name: 'so-pesquisa', wait: 1, run: (c) => c.gm.getPlayer(0).setResearchLevel('cavalry_class', 1) }, { name: 'espera', wait: 3 }], 8);
    expect(so.gm.mission.objectives.get('h-ritual').status).toBe('active'); // sem Ogro Feiticeiro
    const ok = await boot([
      { name: 'pesq', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.gm.getPlayer(0).setResearchLevel('cavalry_class', 1); } },
      { name: 'feiticeiro', wait: 1, run: (c) => c.gm.promoteUnit(c.mine('grunt')[0], 'ogre_mage') },
      { name: 'espera', wait: 3 }
    ], 12);
    expect(ok.gm.mission.objectives.get('h-ritual').status).toBe('completed');
    expect(ok.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 280);
  }, 60000);

  it('Necromantes + Serpe de Guerra treinados (comandos reais) completam a secundária s-necro e pagam +200 de ouro', async () => {
    const run = await boot([
      { name: 'rico', wait: 41, run: (c) => c.give({ gold: 3000, wood: 2000, stone: 1000 }) },
      {
        name: 'obras',
        every: 20,
        timeout: 700,
        until: (c) => c.status('s-necro') === 'completed',
        each: (c) => {
          const help = () => c.mine('peon').slice(0, 4).map((u) => u.id);
          for (const b of c.gm.buildings.filter((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) c.issue({ type: c.CMD.BUILD, unitIds: help(), buildingId: b.id });
          const has = (t) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === t && !x.isDead);
          const next = ['pig_farm', 'orc_barracks', 'ash_sanctum', 'serpent_nest'].find((t) => !has(t));
          if (next && (next === 'pig_farm' || done(c, next === 'orc_barracks' ? 'pig_farm' : 'orc_barracks')) && !c.gm.buildings.some((x) => x.ownerId === 0 && !x.isDead && !x.isConstructed)) place(c, next);
          const s = c.bld('ash_sanctum'), n = c.bld('serpent_nest');
          if (s && s.queue.length < 2) c.issue({ type: c.CMD.TRAIN, buildingId: s.id, unitType: 'necromancer' });
          if (n && n.queue.length < 1 && c.gm.mission.trainedCount(0, 'war_serpent') < 1) c.issue({ type: c.CMD.TRAIN, buildingId: n.id, unitType: 'war_serpent' });
        }
      }
    ], 900);
    expect(run.gm.mission.objectives.get('s-necro').status).toBe('completed');
    expect(run.gm.mission.trainedCount(0, 'necromancer')).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.trainedCount(0, 'war_serpent')).toBeGreaterThanOrEqual(1);
  }, 120000);
});

function place(c, type) {
  const hq = posOf(c.bld('great_hall'));
  for (let r = 9; r < 44; r += 2.5) for (let a = 0; a < 16; a++) {
    const ang = (((a % 2 ? 1 : -1) * Math.ceil(a / 2)) * Math.PI) / 8 + Math.PI / 2;
    const x = hq.x + Math.cos(ang) * r, z = hq.z + Math.sin(ang) * r;
    if (c.gm.canPlaceBuilding(type, x, z, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: type, x, z, unitIds: c.mine('peon').slice(0, 4).map((u) => u.id) }); return true; }
  }
  return false;
}
const done = (c, type) => c.gm.buildings.some((x) => x.ownerId === 0 && x.type === type && !x.isDead && x.isConstructed);

describe('m05 Madeira de Guerra · desfecho', () => {
  it('derrotas: o Salão do Clã cair é derrota; Drogath morrer é derrota (com o texto próprio)', async () => {
    const hq = await boot([{ name: 'queda', wait: 2, run: (c) => c.bld('great_hall').takeDamage(1e6, c.gm.getUnitsOf(1)[0] || c.mine()[0]) }], 20);
    expect(hq.outcome).toBe('defeat');
    expect(hq.gm.mission.outcomeText['pt-BR']).toMatch(/Salão/);
    const dr = await boot([{ name: 'morte', wait: 2, run: (c) => c.slayTag('drogath') }], 20);
    expect(dr.outcome).toBe('defeat');
    expect(dr.gm.mission.outcomeText['pt-BR']).toMatch(/Drogath/);
  });

  it('vitória: madeira + bosque-forte destruído → cutscene final e vitória; um dos dois sozinho não vence; a secundária não decide', async () => {
    const wood = await boot([{ name: 'so-madeira', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-wood', 'completed') }], 40);
    expect(wood.outcome).toBeNull();
    const fort = await boot([{ name: 'so-forte', wait: 1, run: (c) => c.slayTag('grove_fort') }], 40);
    expect(fort.gm.mission.objectives.get('p-hall').status).toBe('completed');
    expect(fort.outcome).toBeNull();
    const sec = await boot([{ name: 'sec', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('s-necro', 'completed') }], 12);
    expect(sec.outcome).toBeNull();
    const fin = await boot([
      { name: 'madeira', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-wood', 'completed') },
      { name: 'forte', wait: 1, run: (c) => c.slayTag('grove_fort') },
      { name: 'final', wait: 25 }
    ], 60);
    expect(fin.outcome).toBe('victory');
  }, 60000);
});

describe('m05 Madeira de Guerra · dificuldade', () => {
  it('investida precoce: Drogath + 3 soldados do início contra o bosque-forte NÃO vencem nem o derrubam', async () => {
    const run = await boot(rush, 300);
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-hall').status).not.toBe('completed');
    expect(run.gm.mission.tags.get('grove_fort').map((i) => run.gm.entitiesById.get(i)).every((b) => !b.isDead)).toBe(true);
  }, 60000);

  it('roteiro sem exército (só economia e obras: nem tropa nem conjuradores) PERDE para as levas, a 1ª com Grifos (que Talhadores não alcançam)', async () => {
    const run = await boot(noArmy, 1100);
    expect(run.outcome).toBe('defeat');
    expect(run.gm.mission.objectives.get('p-hall').status).not.toBe('completed');
    expect(run.seconds).toBeLessThan(900);
  }, 120000);
});
