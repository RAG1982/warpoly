import { describe, it, expect } from 'vitest';
import { playMission } from './helpers/campaignHarness.js';
import { EVT } from '../../src/sim/events.js';
import { rush, noArmy } from '../fixtures/campaign-playthrough/war-horde-03-a-pedra-que-brilha.js';

/**
 * M4-03 — m03 da Horda "A Pedra que Brilha" (assalto à colônia mineira de Pedra-Mãe). A cadeia de objetivos tem de ser VERDADEIRA: Covil dos Ogros →
 * 4 Ogros + 2 Catapultas → 3 fortes → Paço de Mervane, cada conclusão abrindo a seguinte e disparando o diálogo; Drogath (herói jogável a partir daqui) cai = derrota;
 * o Presa-Negra manda reforços; os humanos contra-atacam a cabeça de ponte; secundárias (ouro, Torre, Paliçada) e ocultas (Honra do Clã, Santuário) pagam de fato.
 */
const ID = 'war-horde-03-a-pedra-que-brilha';
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('m03 A Pedra que Brilha · mundo e objetivos', () => {
  it('o jogador (Clãs) ocupa a base leste, a colônia humana (IA) o Paço a oeste; 3 fortes (Quartel) nas âncoras, Paço tagueado, Drogath e guarnições', async () => {
    const { gm } = await playMission('war-horde', ID, [], { maxSeconds: 1 });
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-03-pedra-mae');
    expect(gm.players.map((p) => [p.id, p.factionId])).toEqual([[0, 'orc'], [1, 'human']]);
    const hall = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'great_hall');
    expect(d2({ x: hall.mesh.position.x, z: hall.mesh.position.z }, A.enemyStart)).toBeLessThan(1); // base do jogador = slot leste
    const castle = gm.buildings.find((b) => b.ownerId === 1 && b.type === 'castle');
    expect(d2({ x: castle.mesh.position.x, z: castle.mesh.position.z }, A.colonyHall)).toBeLessThan(1);
    expect(gm.mission.tags.get('enemy_base')).toEqual([castle.id]);
    const forts = gm.mission.tags.get('fort').map((i) => gm.entitiesById.get(i));
    expect(forts).toHaveLength(3);
    for (const k of [1, 2, 3]) {
      const f = gm.entitiesById.get(gm.mission.tags.get(`fort${k}`)[0]);
      expect(f.type).toBe('barracks');
      expect(f.ownerId).toBe(1);
      expect(d2({ x: f.mesh.position.x, z: f.mesh.position.z }, A[`fort${k}`])).toBeLessThan(1);
    }
    expect(gm.mission.tags.get('fort_tower')).toHaveLength(6);
    expect(gm.mission.tags.get('fort_guard')).toHaveLength(15); // 3 × (2 Espadachins + 2 Arqueiros + 1 Balista)
    const ballistas = gm.mission.tags.get('fort_guard').map((i) => gm.entitiesById.get(i)).filter((u) => u.type === 'ballista');
    expect(ballistas).toHaveLength(3);
    const brann = gm.entitiesById.get(gm.mission.tags.get('brann')[0]);
    expect(brann.type).toBe('hero_brann');
    expect(brann.ownerId).toBe(1);
    const drogath = gm.entitiesById.get(gm.mission.tags.get('drogath')[0]);
    expect(drogath.type).toBe('hero_drogath');
    expect(drogath.ownerId).toBe(0);
    expect(gm.mission.tags.get('hall_guard').map((i) => gm.entitiesById.get(i)).filter((u) => u.type === 'cavalier')).toHaveLength(2);
    expect(gm.mission.tags.get('peons0')).toHaveLength(2);
    expect(gm.mission.def.objectives.filter((o) => o.priority === 'primary').map((o) => o.id)).toEqual(['p-den', 'p-army', 'p-forts', 'p-hall']);
    expect(gm.mission.def.autoVictory).toBe(false);
  });

  it('os fortes ficam longe das minas do lado leste (a guarnição não caça os Lacaios)', async () => {
    const { gm } = await playMission('war-horde', ID, [], { maxSeconds: 1 });
    const mines = gm.resourceDeposits.filter((r) => r.type === 'gold' && !r.isDead).map((r) => ({ x: r.mesh.position.x, z: r.mesh.position.z }));
    const east = mines.filter((m) => d2(m, gm.terrain.mapDef.anchors.enemyStart) < 50);
    expect(east.length).toBe(2);
    for (const id of [...gm.mission.tags.get('fort_guard'), ...gm.mission.tags.get('fort_tower')]) {
      const e = gm.entitiesById.get(id);
      const p = { x: e.mesh.position.x, z: e.mesh.position.z };
      for (const m of east) expect(d2(p, m), `${e.type} perto da mina`).toBeGreaterThan(19);
    }
  });

  it('cadeia: Covil → (4 Ogros + 2 Catapultas) → 3 fortes → Paço; cada conclusão abre a seguinte e dispara o diálogo; a vitória só vem depois da cutscene final', async () => {
    const log = [];
    const status = {};
    const script = [
      {
        name: 'gravador',
        run: (c) => {
          const gm = c.gm;
          gm.events.on(EVT.MISSION_OBJECTIVE, (e) => log.push(`obj:${e.id}:${e.status}`));
          gm.events.on(EVT.MISSION_DIALOG, (e) => log.push(`dlg:${e.text['pt-BR'].slice(0, 12)}`));
          gm.events.on(EVT.MISSION_CUTSCENE, (e) => log.push(`cut:${e.id}:${e.steps.filter((s) => s.dialog).length}`));
          gm.events.on(EVT.MISSION_ENDED, (e) => log.push(`end:${e.outcome}`));
        }
      },
      { name: 'estado-inicial', wait: 1, run: (c) => { for (const id of ['p-den', 'p-army', 'p-forts', 'p-hall']) status[id] = c.status(id); } },
      { name: 'covil', wait: 2, run: (c) => c.gm.mission.setObjectiveStatus('p-den', 'completed') },
      { name: 'tropa', wait: 2, run: (c) => { if (c.status('p-army') !== 'active') throw new Error('p-army devia abrir com o Covil'); c.gm.mission.setObjectiveStatus('p-army', 'completed'); } },
      { name: 'fortes', wait: 2, run: (c) => { if (c.status('p-forts') !== 'active' || c.status('p-hall') !== 'inactive') throw new Error('só os fortes abrem'); c.slayTag('fort'); } },
      { name: 'paco', wait: 3, run: (c) => { if (c.status('p-forts') !== 'completed' || c.status('p-hall') !== 'active') throw new Error('o Paço devia abrir'); c.slayTag('enemy_base'); } }
    ];
    const run = await playMission('war-horde', ID, script, { maxSeconds: 120 });
    expect(status).toEqual({ 'p-den': 'active', 'p-army': 'inactive', 'p-forts': 'inactive', 'p-hall': 'inactive' });
    expect(run.outcome).toBe('victory');
    const at = (s) => log.findIndex((l) => l.startsWith(s));
    expect(at('cut:stone:5'), JSON.stringify(log)).toBeGreaterThanOrEqual(0);
    expect(at('obj:p-den:completed')).toBeGreaterThan(at('cut:stone'));
    expect(at('obj:p-army:active'), JSON.stringify(log)).toBeGreaterThan(at('obj:p-den:completed'));
    expect(at('dlg:Covil de pé')).toBeGreaterThan(at('obj:p-den:completed'));
    expect(at('obj:p-army:completed')).toBeGreaterThan(at('dlg:Covil de pé'));
    expect(at('obj:p-forts:active')).toBeGreaterThan(at('obj:p-army:completed'));
    expect(at('dlg:Tropa pront')).toBeGreaterThan(at('obj:p-army:completed'));
    expect(at('obj:p-forts:completed')).toBeGreaterThan(at('dlg:Tropa pront'));
    expect(at('obj:p-hall:active')).toBeGreaterThan(at('obj:p-forts:completed'));
    expect(at('dlg:Os três fort')).toBeGreaterThan(at('obj:p-forts:completed'));
    expect(at('obj:p-hall:completed')).toBeGreaterThan(at('dlg:Os três fort'));
    expect(at('cut:finale:2')).toBeGreaterThan(at('obj:p-hall:completed'));
    expect(at('end:victory')).toBeGreaterThan(at('cut:finale:2'));
  }, 60000);

  it('o contador de treino (n/6) só sobe com Ogros e Catapultas TREINADOS (os reforços do Presa-Negra e o herói inicial não contam)', async () => {
    const run = await playMission('war-horde', ID, [{ name: 'covil', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-den', 'completed') }, { name: 'espera', wait: 340 }], { maxSeconds: 345 });
    const o = run.gm.mission.objectives.get('p-army');
    expect(o.status).toBe('active');
    expect(o.cur).toBe(0);
    expect(o.max).toBe(6);
    expect(run.gm.mission.trainedCount(0, 'ogre')).toBe(0); // Brakka (Ogro) chegou aos 330 s e não é treinado
    expect(run.gm.getUnitsOf(0).filter((u) => !u.isDead && u.type === 'ogre')).toHaveLength(1);
  }, 60000);
});

describe('m03 A Pedra que Brilha · derrota, investida precoce e robô sem tropa', () => {
  it('Drogath cair é derrota; o Salão do Clã cair também', async () => {
    const run1 = await playMission('war-horde', ID, [{ name: 'drogath', wait: 3, run: (c) => { const k = c.gm.allUnits.find((u) => u.ownerId === 1); for (const u of c.tagged('drogath')) u.takeDamage(1e6, k); } }], { maxSeconds: 10 });
    expect(run1.outcome).toBe('defeat');
    const run2 = await playMission('war-horde', ID, [{ name: 'salao', wait: 3, run: (c) => { const k = c.gm.allUnits.find((u) => u.ownerId === 1); c.bld('great_hall').takeDamage(1e6, k); } }], { maxSeconds: 10 });
    expect(run2.outcome).toBe('defeat');
  }, 60000);

  it('investida precoce: Drogath e os 3 soldados do início não vencem (no máximo um forte cai; o Paço de Mervane segue de pé e o objetivo dos fortes nunca abriu)', async () => {
    const run = await playMission('war-horde', ID, rush, { maxSeconds: 300 });
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.tags.get('fort').map((i) => run.gm.entitiesById.get(i)).filter((b) => b && !b.isDead).length).toBeGreaterThanOrEqual(2);
    expect(run.gm.mission.tags.get('enemy_base').map((i) => run.gm.entitiesById.get(i)).filter((b) => b && !b.isDead)).toHaveLength(1);
    expect(run.gm.mission.objectives.get('p-forts').status).toBe('inactive');
  }, 60000);

  it('a mesma economia SEM tropa nunca vence em 20 min (o Covil e a Oficina existem, mas ninguém marcha)', async () => {
    const run = await playMission('war-horde', ID, noArmy, { maxSeconds: 1200 });
    expect(run.outcome).not.toBe('victory');
    expect(run.gm.mission.objectives.get('p-forts').status).toBe('inactive');
  }, 120000);
});

describe('m03 A Pedra que Brilha · reforços, contra-ataques e secundárias', () => {
  it('Brakka e o Presa-Negra chegam aos 330 s (Ogro nomeado + 4 Talhadores do jogador, +150 de ouro e de madeira)', async () => {
    let before = null;
    const run = await playMission('war-horde', ID, [
      { name: 'antes', wait: 329, run: (c) => { before = { ...c.gm.getPlayer(0).resources }; } },
      { name: 'depois', wait: 3 }
    ], { maxSeconds: 335 });
    const gm = run.gm;
    const brakka = gm.mission.tags.get('brakka').map((i) => gm.entitiesById.get(i));
    expect(brakka).toHaveLength(1);
    expect(brakka[0].type).toBe('ogre');
    expect(brakka[0].ownerId).toBe(0);
    expect(gm.mission.tags.get('blackfang')).toHaveLength(4);
    expect(gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before.gold + 150 - 5);
    expect(gm.getPlayer(0).resources.wood).toBeGreaterThanOrEqual(before.wood + 150 - 5);
  }, 60000);

  it('contra-ataque humano aos 480 s sai do desfiladeiro sul rumo à cabeça de ponte (tag raid); o segundo, aos 840 s, traz Cavaleiros e Balista', async () => {
    const run = await playMission('war-horde', ID, [{ name: 'espera', wait: 482 }, { name: 'conta', wait: 1, run: (c) => { if (c.tagged('raid').length !== 7) throw new Error(`onda 1 devia ter 7 (${c.tagged('raid').length})`); } }], { maxSeconds: 490 });
    expect(run.gm.mission.vars.raids).toBe(1);
    const t = run.gm.mission.def.triggers.find((x) => x.id === 'raid-2');
    expect(t.when).toEqual({ type: 'time', at: 840 });
    const sp = t.actions.find((a) => a.type === 'spawn');
    expect(sp.owner).toBe('enemy');
    expect(sp.units).toEqual([{ type: 'cavalier', count: 3 }, { type: 'knight', count: 4 }, { type: 'ballista', count: 1 }]);
    const bhA = run.gm.terrain.mapDef.anchors.bridgehead;
    expect(sp.order).toMatchObject({ kind: 'attackMove', x: bhA.x, z: bhA.z });
    const pb = run.gm.terrain.mapDef.anchors.passBPlayer;
    const s1 = run.gm.mission.def.triggers.find((x) => x.id === 'raid-1').actions.find((a) => a.type === 'spawn');
    expect(Math.hypot(s1.x - pb.x, s1.z - pb.z)).toBeLessThan(3);
  }, 90000);

  it('ouro: coletar 1500 dá +150; Torre de Vigia e Paliçada na cabeça de ponte dão +100 cada (construção real)', async () => {
    let before = 0;
    const bh = (c) => c.anchor('bridgehead');
    const script = [
      { name: 'ouro', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; c.gm.events.emit(EVT.RESOURCE_GATHERED, { ownerId: 0, type: 'gold', amount: 1500 }); } },
      { name: 'confere-ouro', wait: 1, run: (c) => { if (c.status('s-gold') !== 'completed') throw new Error('s-gold devia concluir'); } },
      { name: 'recursos', run: (c) => c.give({ wood: 600, stone: 600, gold: 300 }) },
      {
        name: 'torre',
        run: (c) => {
          const p = bh(c);
          for (const [dx, dz] of [[0, 0], [4, 3], [-4, 3], [0, 6], [6, -2]]) if (c.gm.canPlaceBuilding('orc_watchtower', p.x + dx, p.z + dz, null, 0)) { c.issue({ type: c.CMD.PLACE_BUILDING, buildingType: 'orc_watchtower', x: p.x + dx, z: p.z + dz, unitIds: c.mine('peon').map((u) => u.id) }); return; }
          throw new Error('sem lugar para a torre');
        },
        each: () => {},
        until: (c) => c.status('s-tower') === 'completed',
        timeout: 200
      },
      {
        name: 'palicada',
        run: (c) => {
          const p = bh(c);
          for (const dz of [-4, -2, 0, 2, 4, -6, 6]) {
            const pts = [];
            for (let k = -3; k <= 6; k++) { const q = { x: p.x + k * 2.4, z: p.z + dz }; if (c.gm.canPlaceBuilding('wall_orc', q.x, q.z, null, 0)) pts.push(q); }
            if (pts.length >= 5) { c.issue({ type: c.CMD.PLACE_WALL, buildingType: 'wall_orc', points: pts.slice(-6), unitIds: c.mine('peon').map((u) => u.id) }); return; }
          }
          throw new Error('sem linha para a paliçada');
        },
        each: () => {},
        until: (c) => c.status('s-walls') === 'completed',
        timeout: 300
      }
    ];
    const run = await playMission('war-horde', ID, script, { maxSeconds: 700 });
    expect(run.gm.mission.objectives.get('s-tower').status).toBe('completed');
    expect(run.gm.mission.objectives.get('s-walls').status).toBe('completed');
    // +150 (ouro) +100 +100 sobre o que havia (e os 300 que o próprio teste deu); sem gastos de ouro nas obras (torre e paliçada custam madeira e pedra)
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 300 + 150 + 100 + 100 - 20);
  }, 120000);
});

describe('m03 A Pedra que Brilha · ocultas (Honra do Clã e Santuário)', () => {
  it('Honra do Clã: com os 2 Lacaios iniciais vivos ao destruir o Paço, conclui; perder um deles a FALHA', async () => {
    const win = [
      { name: 'covil', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-den', 'completed') },
      { name: 'tropa', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('p-army', 'completed') },
      { name: 'fortes', wait: 1, run: (c) => c.slayTag('fort') },
      { name: 'paco', wait: 2, run: (c) => c.slayTag('enemy_base') }
    ];
    const a = await playMission('war-horde', ID, win, { maxSeconds: 60 });
    expect(a.gm.mission.objectives.get('h-honra').status).toBe('completed');
    const lose1 = [{ name: 'morte', wait: 5, run: (c) => { const k = c.gm.allUnits.find((u) => u.ownerId === 1); c.tagged('peons0')[0].takeDamage(1e6, k); } }, ...win];
    const b = await playMission('war-horde', ID, lose1, { maxSeconds: 60 });
    expect(b.gm.mission.objectives.get('h-honra').status).toBe('failed');
    expect(b.outcome).toBe('victory'); // oculta nunca decide a vitória
  }, 60000);

  it('Santuário: revelado aos 150 s; andar até ele dá +120 de ouro e acende o marco, sem mudar o desfecho', async () => {
    let before = 0;
    let seen = null;
    const run = await playMission('war-horde', ID, [
      { name: 'dica', wait: 152, run: (c) => { seen = c.gm.mission.objectives.get('h-shrine').visible; } },
      { name: 'vai', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; const p = c.anchor('shrine1'); c.teleport(c.mine('grunt')[0], p.x, p.z); } },
      { name: 'confere', wait: 2, run: (c) => { if (c.status('h-shrine') !== 'completed') throw new Error('o Santuário devia estar achado'); } }
    ], { maxSeconds: 170 });
    expect(seen).toBe(true);
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'shrine').lit).toBeGreaterThan(0);
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 120 - 5);
    expect(run.outcome).toBeNull();
  }, 60000);
});
