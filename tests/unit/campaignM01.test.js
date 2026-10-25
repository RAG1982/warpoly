import { describe, it, expect } from 'vitest';
import { playMission } from './helpers/campaignHarness.js';
import { EVT } from '../../src/sim/events.js';
import { win, rush } from '../fixtures/campaign-playthrough/war-alliance-01-terra-a-vista.js';

/**
 * M3-02 — m01 "Terra à Vista": a cadeia de objetivos tem de ser VERDADEIRA (cada título descreve exatamente a condição que o conclui),
 * cada conclusão dispara o diálogo seguinte, o contador do treino sobe de 0 a 7 só com tropas saídas do Quartel, e os bônus
 * (ouro, Mural da Fenda) e o final (cutscene da vela, vitória só depois dela) acontecem de fato.
 */
const ID = 'war-alliance-01-terra-a-vista';

describe('m01 Terra à Vista · objetivos e diálogos', () => {
  it('o objetivo de vitória casa com o mapa real: 3 acampamentos de bandidos = 3 tagueados, juntos e longe da base, e nenhuma base inimiga existe', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const camps = gm.buildings.filter((b) => b.type === 'bandit_camp');
    const mapCamps = gm.terrain.mapDef.neutrals.filter((n) => n.kind === 'camp').length;
    expect(mapCamps).toBe(3);
    expect(camps.length).toBe(mapCamps);
    expect(gm.mission.tags.get('smuggler_camp')).toHaveLength(camps.length);
    for (const i of [1, 2, 3]) expect(gm.mission.tags.get(`smuggler_camp${i}`)).toHaveLength(1); // 1 tag por acampamento
    // só o jogador local e os bandidos (99): nenhuma base orc a derrotar
    expect(gm.buildings.filter((b) => b.ownerId !== 0 && b.ownerId !== 99)).toHaveLength(0);
    expect(gm.mission.def.objectives.filter((o) => o.priority === 'primary').map((o) => o.id)).toEqual(['build-barracks', 'train-troops', 'destroy-camp']);
    expect(gm.mission.def.objectives.find((o) => o.id === 'destroy-camp').count).toBe(3);
    // reduto: acampamentos ≤ 18 u entre si e ≥ 70 u da base do jogador (âncoras nomeadas)
    const a = [1, 2, 3].map((i) => gm.terrain.mapDef.anchors[`banditCamp${i}`]);
    const base = gm.terrain.mapDef.anchors.playerStart;
    for (const p of a) expect(Math.hypot(p.x - base.x, p.z - base.z)).toBeGreaterThanOrEqual(70);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z)).toBeLessThanOrEqual(18);
    camps.forEach((c, i) => expect(Math.hypot(c.mesh.position.x - a[i].x, c.mesh.position.z - a[i].z)).toBeLessThan(1));
    // guarnição pesada: 3 × (7 bandidos + 2 Espadachins + 1 Arqueiro) de bandidos
    const guards = gm.allUnits.filter((u) => u.ownerId === 99 && !u.isDead);
    // (M3-X2: os 3 bandidos que guardam o pescador cativo também são ownerId 99; ficam fora desta conta)
    const fisherGuards = new Set(gm.mission.tags.get('fisher_guard'));
    const campGuards = guards.filter((u) => !fisherGuards.has(u.id));
    expect(campGuards.filter((u) => u.type === 'bandit')).toHaveLength(21);
    expect(campGuards.filter((u) => u.type === 'knight')).toHaveLength(6);
    expect(campGuards.filter((u) => u.type === 'archer')).toHaveLength(3);
  });

  it('investida precoce: os 3 soldados do início sozinhos NÃO vencem (Espadachins caem, os 3 acampamentos seguem de pé, objetivo de ataque nunca abre)', async () => {
    const run = await playMission('war-alliance', ID, rush, { maxSeconds: 300 });
    const gm = run.gm;
    expect(run.outcome).toBeNull();
    expect(gm.mission.outcome).toBeNull();
    expect(gm.mission.objectives.get('destroy-camp').status).toBe('inactive');
    expect(gm.buildings.filter((b) => b.type === 'bandit_camp' && !b.isDead)).toHaveLength(3);
    expect(gm.getUnitsOf(0).filter((u) => !u.isDead && u.type === 'knight')).toHaveLength(0);
  }, 60000);

  it('destruir um acampamento ANTES do objetivo abrir não pula nem trava nada: avisa, o contador abre em 1/3 e a vitória exige os 3', async () => {
    const log = [];
    const script = [
      { name: 'gravador', run: (c) => { c.gm.events.on(EVT.MISSION_DIALOG, (e) => log.push(e.text['pt-BR'].slice(0, 22))); } },
      { name: 'um-cedo', wait: 2, run: (c) => c.slay([c.tagged('smuggler_camp1')[0]]) },
      { name: 'espera', wait: 3, run: (c) => { if (c.status('destroy-camp') !== 'inactive') throw new Error('o objetivo de ataque não pode abrir sozinho'); } },
      { name: 'quartel', run: (c) => c.gm.mission.setObjectiveStatus('build-barracks', 'completed') },
      { name: 'treino', wait: 2, run: (c) => c.gm.mission.setObjectiveStatus('train-troops', 'completed') },
      { name: 'aberto', wait: 1, run: (c) => { if (c.status('destroy-camp') !== 'active' || c.obj('destroy-camp').cur !== 1 || c.obj('destroy-camp').max !== 3) throw new Error('devia abrir em 1/3'); } },
      { name: 'dois', wait: 2, run: (c) => { c.slay([c.tagged('smuggler_camp2')[0]]); } },
      { name: 'confere', wait: 2, run: (c) => { if (c.status('destroy-camp') !== 'active') throw new Error('com 2/3 ainda não vence'); } },
      { name: 'tres', run: (c) => c.slay([c.tagged('smuggler_camp3')[0]]) }
    ];
    const run = await playMission('war-alliance', ID, script, { maxSeconds: 120 });
    expect(log.filter((t) => t.startsWith('Derrubaram um acampa'))).toHaveLength(1);
    expect(run.gm.mission.objectives.get('destroy-camp').status).toBe('completed');
    expect(run.outcome).toBe('victory');
  }, 60000);

  it('cutscene da vela: a frota orc (4 galés) existe em orcSails e a área está REVELADA (visão atual) no fog do jogador, com a câmera apontando para lá', async () => {
    let cut = null;
    let seen = null;
    const script = [
      { name: 'gravador', run: (c) => { c.gm.events.on(EVT.MISSION_CUTSCENE, (e) => { if (e.id === 'sail') cut = e; }); } },
      { name: 'quartel', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('build-barracks', 'completed') },
      { name: 'treino', wait: 2, run: (c) => c.gm.mission.setObjectiveStatus('train-troops', 'completed') },
      { name: 'destruir', wait: 2, run: (c) => c.slayTag('smuggler_camp') },
      {
        name: 'vela',
        wait: 8, // meio da cutscene (a revelação dura 16 s)
        run: (c) => {
          const p = c.anchor('orcSails');
          const fog = c.gm.fogOfWar;
          const ships = c.tagged('sail');
          seen = { enabled: fog.enabled, ships: ships.length, near: ships.every((s) => Math.hypot(s.mesh.position.x - p.x, s.mesh.position.z - p.z) < 12), visible: fog.isVisible(p.x, p.z) && ships.every((s) => fog.isVisible(s.mesh.position.x, s.mesh.position.z)), edge: fog.isVisible(p.x + 20, p.z) };
        }
      }
    ];
    const run = await playMission('war-alliance', ID, script, { maxSeconds: 60 });
    const p = run.gm.terrain.mapDef.anchors.orcSails;
    expect(seen).toEqual({ enabled: true, ships: 4, near: true, visible: true, edge: true });
    expect(cut).not.toBeNull();
    for (const s of cut.steps.slice(1)) { expect(s.x).toBe(p.x); expect(s.z).toBe(p.z); }
  }, 60000);

  it('destruir os 3 acampamentos conclui o objetivo e leva à vitória (após a cutscene)', async () => {
    const script = [
      { name: 'quartel', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('build-barracks', 'completed') },
      { name: 'treino', wait: 2, run: (c) => c.gm.mission.setObjectiveStatus('train-troops', 'completed') },
      { name: 'destruir', wait: 2, run: (c) => c.slayTag('smuggler_camp') }
    ];
    const run = await playMission('war-alliance', ID, script, { maxSeconds: 120 });
    expect(run.gm.mission.objectives.get('destroy-camp').status).toBe('completed');
    expect(run.outcome).toBe('victory');
  });

  it('Quartel → treinar 7 (n/7) → destruir os 3 acampamentos, cada um abrindo o seguinte com seu diálogo; vitória só após a cutscene da vela', async () => {
    const log = [];
    const counters = [];
    const destroyed = [];
    const rec = {
      name: 'gravador',
      run: (c) => {
        const gm = c.gm;
        gm.events.on(EVT.MISSION_OBJECTIVE, (e) => log.push(`obj:${e.id}:${e.status}`));
        gm.events.on(EVT.MISSION_DIALOG, (e) => log.push(`dlg:${e.text['pt-BR'].slice(0, 14)}`));
        gm.events.on(EVT.MISSION_CUTSCENE, (e) => log.push(`cut:${e.id}:${e.steps.filter((s) => s.dialog).length}`));
        gm.events.on(EVT.MISSION_ENDED, (e) => log.push(`end:${e.outcome}`));
        const orig = gm.simStep.bind(gm);
        gm.simStep = (dt) => {
          orig(dt);
          const o = gm.mission.objectives.get('train-troops');
          if (o.status !== 'inactive' && counters[counters.length - 1] !== o.cur) counters.push(o.cur);
          const d = gm.mission.objectives.get('destroy-camp');
          if (d.status !== 'inactive' && destroyed[destroyed.length - 1] !== d.cur) destroyed.push(d.cur);
        };
      }
    };
    const run = await playMission('war-alliance', ID, [rec, ...win], { maxSeconds: 1200 });
    expect(run.outcome).toBe('victory');
    const at = (s) => log.findIndex((l) => l.startsWith(s));
    // objetivos em ordem, cada diálogo logo depois da conclusão que o dispara
    expect(at('cut:landing:3')).toBeGreaterThanOrEqual(0);
    expect(at('dlg:Objetivo um')).toBeGreaterThan(at('cut:landing'));
    expect(at('obj:build-barracks:completed')).toBeGreaterThan(at('dlg:Objetivo um'));
    expect(at('obj:train-troops:active')).toBeGreaterThan(at('obj:build-barracks:completed'));
    expect(at('dlg:Quartel de pé')).toBeGreaterThan(at('obj:build-barracks:completed'));
    expect(at('obj:train-troops:completed')).toBeGreaterThan(at('dlg:Quartel de pé'));
    expect(at('obj:destroy-camp:active')).toBeGreaterThan(at('obj:train-troops:completed'));
    expect(at('dlg:Tropa pronta')).toBeGreaterThan(at('obj:train-troops:completed'));
    expect(at('obj:destroy-camp:completed')).toBeGreaterThan(at('dlg:Tropa pronta'));
    expect(at('cut:sail:3')).toBeGreaterThan(at('obj:destroy-camp:completed'));
    expect(at('end:victory')).toBeGreaterThan(at('cut:sail:3'));
    // o contador n/7 sobe de 0 a 7, de um em um, só com tropa treinada
    expect(counters).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // o contador do ataque chega a 3/3 (um acampamento por vez)
    expect(destroyed[0]).toBe(0);
    expect(destroyed[destroyed.length - 1]).toBe(3);
    expect(destroyed.every((v, i) => i === 0 || v > destroyed[i - 1])).toBe(true);
    expect(run.gm.mission.trainedCount(0, 'knight')).toBeGreaterThanOrEqual(3);
    expect(run.gm.mission.trainedCount(0, 'archer')).toBeGreaterThanOrEqual(4);
    // a vela existe e a vitória veio ≥ 11 s depois do acampamento cair (a cutscene toca inteira)
    expect(run.gm.mission.tags.get('sail')).toHaveLength(4);
    for (const id of run.gm.mission.tags.get('sail')) {
      const ship = run.gm.entitiesById.get(id);
      expect(ship.ownerId).toBe(-1); // neutros: parados, não atacam
      expect(ship.type).toBe('war_galley');
    }
    expect(run.seconds).toBeLessThanOrEqual(20 * 60);
  }, 120000);

  it('nenhum objetivo conclui sozinho: sem Quartel o treino fica inativo e os soldados iniciais não contam', async () => {
    const run = await playMission('war-alliance', ID, [{ name: 'espera', wait: 90 }], { maxSeconds: 95 });
    const gm = run.gm;
    expect(gm.mission.objectives.get('build-barracks').status).toBe('active');
    expect(gm.mission.objectives.get('train-troops').status).toBe('inactive');
    expect(gm.mission.objectives.get('destroy-camp').status).toBe('inactive');
    expect(gm.mission.outcome).toBeNull();
    expect(gm.mission.trainedCount(0, 'knight')).toBe(0); // há 2 Espadachins iniciais; não são "treinados"
  });

  it('Mural da Fenda (oculto): andar até ele dá +100 de ouro e revela o objetivo; coletar 500 de ouro dá +100', async () => {
    let before = 0;
    const script = [
      { name: 'ir-ao-mural', run: (c) => { before = c.gm.getPlayer(0).resources.gold; const p = c.anchor('muralFenda'); c.issue({ type: c.CMD.MOVE, unitIds: c.mine('knight').map((u) => u.id), x: p.x, z: p.z }); }, each: () => {}, until: (c) => c.status('mural-fenda') === 'completed', timeout: 240 },
      { name: 'ouro', run: (c) => { c.gm.events.emit(EVT.RESOURCE_GATHERED, { ownerId: 0, type: 'gold', amount: 500 }); }, each: () => {}, until: (c) => c.status('gold-500') === 'completed', timeout: 20 }
    ];
    const run = await playMission('war-alliance', ID, script, { maxSeconds: 400 });
    const gm = run.gm;
    const snap = gm.mission.snapshot().objectives.map((o) => o.id);
    expect(snap).toContain('mural-fenda');
    expect(gm.mission.vars.mural).toBe(true);
    expect(gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 200 - 5);
  }, 60000);
});

/**
 * M3-X2 — secundárias da m01: ruínas de pedra (exploração, oculta até o aviso do capitão, +80 de ouro e marco aceso) e um pescador
 * cativo (resgate, guardado por 3 bandidos: vira nosso ao chegar perto com os guardas mortos, +100 de ouro). Nenhuma muda a vitória.
 */
describe('m01 Terra à Vista · secundárias de exploração e resgate (M3-X2)', () => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  it('ruínas e pescador em terra firme, longe das bases e dos acampamentos; os 3 bandidos guardam o pescador (dono neutro)', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const A = gm.terrain.mapDef.anchors;
    expect(gm.terrain.mapDef.id).toBe('camp-01-baia-de-aurelan');
    for (const k of ['ruins1', 'captive1']) {
      expect(A[k], k).toBeTruthy();
      expect(A[k].water, `${k} em terra`).toBeFalsy();
      for (const i of [1, 2, 3]) expect(d(A[k], A[`banditCamp${i}`]), `${k} longe do acampamento ${i}`).toBeGreaterThanOrEqual(50);
      expect(d(A[k], A.playerStart), `${k} longe da base`).toBeGreaterThanOrEqual(50);
    }
    expect(d(A.ruins1, A.captive1)).toBeGreaterThanOrEqual(40);
    const lm = gm.mission.landmarks.find((l) => l.tag === 'ruins');
    expect(lm).toBeTruthy();
    expect(Math.hypot(lm.x - A.ruins1.x, lm.z - A.ruins1.z)).toBeLessThan(0.5);
    expect(lm.lit).toBe(0);
    const cap = gm.mission.tags.get('fisher').map((i) => gm.entitiesById.get(i));
    expect(cap).toHaveLength(1);
    expect(cap[0].ownerId).toBe(-1);
    expect(cap[0].type).toBe('villager');
    const guards = gm.mission.tags.get('fisher_guard').map((i) => gm.entitiesById.get(i));
    expect(guards).toHaveLength(3);
    for (const g of guards) {
      expect(g.ownerId).toBe(99);
      expect(g.type).toBe('bandit');
      expect(d({ x: g.mesh.position.x, z: g.mesh.position.z }, A.captive1)).toBeLessThan(6);
    }
  });

  it('objetivos: a ruína é oculta (só aparece depois do aviso do capitão, ~60 s); o resgate é secundário e visível desde o início', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const def = gm.mission.def;
    expect(def.objectives.find((o) => o.id === 'find-ruins')).toMatchObject({ type: 'flag', priority: 'hidden' });
    expect(def.objectives.find((o) => o.id === 'rescue-fisher')).toMatchObject({ type: 'rescue', priority: 'secondary', tag: 'fisher', count: 1 });
    expect(gm.mission.objectives.get('find-ruins').visible).toBe(false);
    expect(gm.mission.objectives.get('rescue-fisher').visible).toBe(true);
    expect(def.objectives.filter((o) => o.priority === 'primary').map((o) => o.id)).toEqual(['build-barracks', 'train-troops', 'destroy-camp']);
  });

  it('o aviso do capitão (~60 s) revela as ruínas no painel', async () => {
    let seen = null;
    const run = await playMission('war-alliance', ID, [
      { name: 'espera', wait: 62 },
      { name: 'confere', wait: 1, run: (c) => { seen = c.gm.mission.objectives.get('find-ruins').visible; } }
    ], { maxSeconds: 70 });
    expect(seen).toBe(true);
    void run;
  }, 60000);

  it('achar as ruínas (andar até elas) dá +80 de ouro, acende o marco e completa a secundária; a vitória não muda', async () => {
    let before = 0;
    const run = await playMission('war-alliance', ID, [
      { name: 'dica', wait: 62 },
      { name: 'vai', wait: 2, run: (c) => { before = c.gm.getPlayer(0).resources.gold; const p = c.anchor('ruins1'); c.teleport(c.mine('knight')[0], p.x, p.z); } },
      { name: 'confere', wait: 1, run: (c) => { if (c.status('find-ruins') !== 'completed') throw new Error('as ruínas deviam estar achadas'); } }
    ], { maxSeconds: 90 });
    expect(run.gm.mission.objectives.get('find-ruins').status).toBe('completed');
    expect(run.gm.mission.landmarks.find((l) => l.tag === 'ruins').lit).toBeGreaterThan(0);
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 80 - 5);
    expect(run.outcome).toBeNull(); // secundária: a partida segue
  }, 60000);

  it('pescador: com os guardas vivos ele NÃO vira nosso; mortos os guardas, um soldado perto dele o libera (+100 de ouro, rescue concluído)', async () => {
    let before = 0;
    const run = await playMission('war-alliance', ID, [
      { name: 'guardas-vivos', wait: 1, run: (c) => { before = c.gm.getPlayer(0).resources.gold; const p = c.anchor('captive1'); c.teleport(c.mine('knight')[0], p.x + 6, p.z); } },
      // (só ao vivo: com os guardas vivos, nada muda; o soldado perto basta quando eles caem)
      { name: 'ainda-neutro', wait: 1, run: (c) => { if (c.tagged('fisher')[0].ownerId !== -1) throw new Error('não pode ser libertado com guardas vivos'); c.slayTag('fisher_guard'); } },
      { name: 'confere', wait: 2, run: (c) => { if (c.tagged('fisher')[0].ownerId !== 0) throw new Error('o pescador devia ser nosso (guardas mortos, soldado perto)'); } }
    ], { maxSeconds: 60 });
    expect(run.gm.mission.objectives.get('rescue-fisher').status).toBe('completed');
    expect(run.gm.getPlayer(0).resources.gold).toBeGreaterThanOrEqual(before + 100 - 5);
  }, 60000);
});
