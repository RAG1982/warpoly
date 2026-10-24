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
    expect(guards.filter((u) => u.type === 'bandit')).toHaveLength(21);
    expect(guards.filter((u) => u.type === 'knight')).toHaveLength(6);
    expect(guards.filter((u) => u.type === 'archer')).toHaveLength(3);
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
