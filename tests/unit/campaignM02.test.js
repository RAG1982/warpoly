import { describe, it, expect } from 'vitest';
import { playMission } from './helpers/campaignHarness.js';
import { rush } from '../fixtures/campaign-playthrough/war-alliance-02-pouso-do-encontro.js';
import { PLAYER_COLORS } from '../../src/sim/MatchConfig.js';

/**
 * M3-03 — m02 "O Pouso do Encontro": 6 batedores presos em cercados de muralha (2 perto dos acampamentos de bandidos, 4 atrás da base orc),
 * soltos DERRUBANDO um trecho do muro (o dono muda por `transfer` quando qualquer muralha da prisão morre). A vitória NÃO exige derrotar os
 * orcs: Ferraria + Armas Forjadas + 6 batedores vivos. O playthrough completo (robô) está em tests/fixtures/campaign-playthrough/.
 */
const ID = 'war-alliance-02-pouso-do-encontro';
const done = (c, ids) => ids.forEach((i) => c.gm.mission.setObjectiveStatus(i, 'completed'));
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('m02 Pouso do Encontro · mapa e prisões', () => {
  it('2 acampamentos de bandidos + 6 prisões (12 muralhas cada) com 1 batedor neutro dentro; 4 prisões atrás da base orc, longe de onde a IA ergue torres', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const map = gm.terrain.mapDef;
    const A = map.anchors;
    expect(map.id).toBe('camp-02-pouso-do-encontro');
    expect(gm.buildings.filter((b) => b.type === 'bandit_camp')).toHaveLength(2);
    expect(gm.mission.tags.get('bandit_camp')).toHaveLength(2);
    const scouts = gm.mission.tags.get('scout').map((i) => gm.entitiesById.get(i));
    expect(scouts).toHaveLength(6);
    for (let k = 1; k <= 6; k++) {
      const walls = gm.mission.tags.get(`prison${k}`);
      expect(walls, `prisão ${k}`).toHaveLength(12);
      const p = A[`scoutPrison${k}`];
      const inside = scouts.filter((s) => d({ x: s.mesh.position.x, z: s.mesh.position.z }, p) < 2.5);
      expect(inside, `batedor da prisão ${k}`).toHaveLength(1);
      expect(inside[0].ownerId).toBe(-1); // neutro: ninguém o ataca
    }
    // 1 prisão perto de cada acampamento de bandidos (≤ 16 u); as outras 4 atrás da base orc
    for (const k of [1, 2]) expect(d(A[`scoutPrison${k}`], A[`banditCamp${k}`])).toBeLessThanOrEqual(16);
    const s0 = A.playerStart, s1 = A.enemyStart;
    const L = d(s0, s1);
    for (const k of [3, 4, 5, 6]) {
      const p = A[`scoutPrison${k}`];
      expect(d(p, s1), `prisão ${k} longe do pátio orc`).toBeGreaterThanOrEqual(38); // a IA ergue construções a 11–27 u do Centro
      expect(((p.x - s1.x) * (s1.x - s0.x) + (p.z - s1.z) * (s1.z - s0.z)) / L, `prisão ${k} atrás da base orc`).toBeGreaterThanOrEqual(12);
      expect(d(p, s0)).toBeGreaterThanOrEqual(80);
    }
    // o Emissário é um tipo que o jogador não treina nesta missão, com anel de cor distinta
    const em = gm.mission.tags.get('emissary').map((i) => gm.entitiesById.get(i));
    expect(em).toHaveLength(1);
    expect(em[0].type).toBe('ogre_mage');
    expect(em[0].markColor).toBeTruthy();
    expect(['#2563eb', '#dc2626', '#22d3ee']).not.toContain(em[0].markColor);
  });

  it('o batedor preso não consegue sair (muralha fechada) e a base orc existe e é hostil', async () => {
    let start = null;
    const run = await playMission('war-alliance', ID, [
      { name: 'tenta', run: (c) => { start = c.tagged('scout').map((s) => ({ x: s.mesh.position.x, z: s.mesh.position.z })); c.tagged('scout').forEach((s, i) => { s.moveTo(start[i].x + 25, start[i].z + 25, c.gm); }); }, wait: 20 }
    ], { maxSeconds: 25 });
    run.gm.mission.tags.get('scout').forEach((id, i) => {
      const s = run.gm.entitiesById.get(id);
      expect(Math.hypot(s.mesh.position.x - start[i].x, s.mesh.position.z - start[i].z)).toBeLessThan(2);
    });
    expect(run.gm.buildings.filter((b) => b.ownerId === 1 && b.role === 'hq')).toHaveLength(1);
  });
});

describe('m02 Pouso do Encontro · objetivos', () => {
  it('primários: Ferraria, pesquisa Armas Forjadas e rescue 6; vitória sem destruir orcs (autoVictory off); secundário e oculto presentes', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const def = gm.mission.def;
    expect(def.autoVictory).toBe(false);
    expect(def.objectives.filter((o) => o.priority === 'primary').map((o) => o.id)).toEqual(['build-forge', 'research-weapons', 'rescue-scouts']);
    expect(def.objectives.find((o) => o.id === 'rescue-scouts')).toMatchObject({ type: 'rescue', tag: 'scout', count: 6 });
    expect(def.objectives.find((o) => o.id === 'research-weapons').condition).toMatchObject({ type: 'research', id: 'melee_weapons' });
    expect(def.objectives.some((o) => o.type === 'destroy' && o.priority === 'primary')).toBe(false);
    expect(def.objectives.some((o) => o.type === 'eliminate')).toBe(false);
    expect(gm.mission.objectives.get('research-weapons').status).toBe('inactive'); // só abre com a Ferraria
  });

  it('libertável: derrubar UM trecho da muralha transfere o batedor ao jogador (n/6 sobe de um em um); com Ferraria + pesquisa, 6/6 vence sem tocar na base orc', async () => {
    const counts = [];
    const script = [
      { name: 'ferraria-e-pesquisa', run: (c) => { done(c, ['build-forge']); c.gm.getPlayer(0).researchLevels ??= {}; } },
      ...[1, 2, 3, 4, 5, 6].map((k) => ({
        name: `solta-${k}`, wait: 1,
        run: (c) => {
          counts.push(c.obj('rescue-scouts').cur);           const w = c.tagged(`prison${k}`);
          expect(w).toHaveLength(12);
          if (k >= 3) c.slayTag('prison_guard'); // os guardas orcs matariam o batedor assim que ele fosse nosso: limpe antes
          c.slay([w[3]]); // um só trecho
        }
      })),
      { name: 'confere', wait: 2, run: (c) => { counts.push(c.obj('rescue-scouts').cur); const sc = c.tagged('scout'); if (!sc.every((s) => s.ownerId === 0)) throw new Error('todos devem ser do jogador'); c.gm.mission.setObjectiveStatus('research-weapons', 'completed'); } }
    ];
    const run = await playMission('war-alliance', ID, script, { maxSeconds: 120 });
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.outcome).toBe('victory');
    // os orcs seguem de pé: a missão acabou sem derrotar a base
    expect(run.gm.buildings.some((b) => b.ownerId === 1 && b.role === 'hq' && !b.isDead)).toBe(true);
    expect(run.gm.mission.vars.near_freed).toBe(2);
    expect(run.gm.mission.vars.far_freed).toBe(4);
  }, 60000);

  it('falha: se um batedor morre, rescue falha e a missão é perdida (menos de 6 vivos)', async () => {
    const run = await playMission('war-alliance', ID, [{ name: 'morte', wait: 2, run: (c) => c.slay([c.tagged('scout')[0]]) }], { maxSeconds: 20 });
    expect(run.gm.mission.objectives.get('rescue-scouts').status).toBe('failed');
    expect(run.outcome).toBe('defeat');
  });

  it('falha: o Paço cair é derrota', async () => {
    const run = await playMission('war-alliance', ID, [{ name: 'queda', wait: 2, run: (c) => { const k = c.mine('knight')[0]; c.bld('castle').takeDamage(1e6, c.gm.allUnits.find((u) => u.ownerId === 1) || k); } }], { maxSeconds: 20 });
    expect(run.outcome).toBe('defeat');
  });

  it('Emissário (oculto): chegar perto dele vivo dá +100 de ouro; matá-lo falha o objetivo', async () => {
    let before = 0;
    const ok = await playMission('war-alliance', ID, [
      { name: 'ir', run: (c) => { before = c.gm.getPlayer(0).resources.gold; const p = c.anchor('emissary1'); c.teleport(c.mine('knight')[0], p.x + 2, p.z + 2); }, wait: 1 },
      { name: 'espera', wait: 2 }
    ], { maxSeconds: 6 });
    expect(ok.gm.mission.objectives.get('emissary-honor').status).toBe('completed');
    expect(ok.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 90);
    const bad = await playMission('war-alliance', ID, [{ name: 'mata', wait: 1, run: (c) => c.slayTag('emissary') }], { maxSeconds: 4 });
    expect(bad.gm.mission.objectives.get('emissary-honor').status).toBe('failed');
  });
});

describe('m02 Pouso do Encontro · dificuldade', () => {
  it('investida precoce: os 3 soldados do início sozinhos NÃO vencem nem soltam o batedor 1 (Espadachins caem)', async () => {
    const run = await playMission('war-alliance', ID, rush, { maxSeconds: 300 });
    expect(run.outcome).toBeNull();
    expect(run.gm.mission.vars.near_freed).toBe(0);
    expect(run.gm.mission.objectives.get('rescue-scouts').cur).toBe(0);
    expect(run.gm.getUnitsOf(0).filter((u) => !u.isDead && u.type === 'knight')).toHaveLength(0);
    expect(run.gm.buildings.some((b) => b.type === 'bandit_camp' && !b.isDead && Math.hypot(b.mesh.position.x + 64, b.mesh.position.z - 6) < 2)).toBe(true); // o acampamento 1 segue de pé
  }, 60000);
});

/**
 * M3-X2 — m02: o Emissário tem nome e cor próprios (fora das cores de jogador); 1 secundária de exploração oculta: as Ruínas Esquecidas
 * (no norte, fora das rotas e dos acampamentos), reveladas pelo primeiro batedor libertado; chegar lá dá +200 de ouro e acende o marco.
 */
describe('m02 Pouso do Encontro · emissário e secundária de exploração (M3-X2)', () => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  it('Emissário com displayName e markColor próprios; ruínas em terra, longe dos acampamentos, das prisões e da rota Liga–Clãs', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const em = gm.mission.def.setup.find((s) => s.tag === 'emissary');
    expect(em.unitType).toBe('ogre_mage');
    expect(em.displayName).toEqual({ 'pt-BR': 'Emissário', en: 'Envoy' });
    expect(em.markColor).toBe('#f0abfc');
    expect(PLAYER_COLORS).not.toContain(em.markColor);
    const A = gm.terrain.mapDef.anchors;
    expect(A.ruins1.water).toBeFalsy();
    for (const k of [1, 2]) expect(d(A.ruins1, A[`banditCamp${k}`]), `longe do acampamento ${k}`).toBeGreaterThanOrEqual(30);
    for (let k = 1; k <= 6; k++) expect(d(A.ruins1, A[`scoutPrison${k}`]), `longe da prisão ${k}`).toBeGreaterThanOrEqual(24);
    expect(d(A.ruins1, A.emissary1)).toBeGreaterThanOrEqual(24);
    // fora da rota direta entre as bases (segmento Liga–Clãs)
    const s0 = A.playerStart, s1 = A.enemyStart, L2 = d(s0, s1) ** 2;
    const t = Math.max(0, Math.min(1, ((A.ruins1.x - s0.x) * (s1.x - s0.x) + (A.ruins1.z - s0.z) * (s1.z - s0.z)) / L2));
    expect(d(A.ruins1, { x: s0.x + t * (s1.x - s0.x), z: s0.z + t * (s1.z - s0.z) })).toBeGreaterThanOrEqual(22);
    const lm = gm.mission.landmarks.find((l) => l.tag === 'ruins');
    expect(lm).toBeTruthy();
    expect(d(lm, A.ruins1)).toBeLessThan(0.5);
    expect(gm.mission.def.objectives.find((o) => o.id === 'find-ruins')).toMatchObject({ type: 'flag', priority: 'hidden' });
    expect(gm.mission.objectives.get('find-ruins').visible).toBe(false);
  });

  it('o primeiro batedor libertado revela as ruínas; chegar a elas dá +200 de ouro, acende o marco e não mexe na vitória', async () => {
    let before = 0;
    const run = await playMission('war-alliance', ID, [
      // prisão distante (3): a guarda do acampamento não a cerca; a libertação é a mesma do teste "libertável"
      { name: 'solta-3', wait: 2, run: (c) => { c.slayTag('prison_guard'); const w = c.tagged('prison3'); c.slay([w[3]]); } },
      { name: 'revelado', wait: 1, run: (c) => {
        if (!c.gm.mission.objectives.get('find-ruins').visible) throw new Error('as ruínas deviam aparecer após o batedor');
        before = c.gm.getPlayer(0).resources.gold;
        const p = c.anchor('ruins1');
        c.teleport(c.mine('knight')[0], p.x, p.z);
      } },
      { name: 'confere', wait: 1, run: (c) => { if (c.status('find-ruins') !== 'completed') throw new Error('as ruínas deviam estar achadas'); } }
    ], { maxSeconds: 30 });
    expect(run.gm.mission.objectives.get('find-ruins').status).toBe('completed');
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'ruins').lit).toBeGreaterThan(0);
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 200 - 5);
    expect(run.gm.mission.vars.far_freed).toBe(1);
    expect(run.outcome).toBeNull();
  }, 60000);
});
