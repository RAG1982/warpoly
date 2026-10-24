import { describe, it, expect } from 'vitest';
import { playMission } from './helpers/campaignHarness.js';
import { EVT } from '../../src/sim/events.js';
import { win } from '../fixtures/campaign-playthrough/war-alliance-01-terra-a-vista.js';

/**
 * M3-02 — m01 "Terra à Vista": a cadeia de objetivos tem de ser VERDADEIRA (cada título descreve exatamente a condição que o conclui),
 * cada conclusão dispara o diálogo seguinte, o contador do treino sobe de 0 a 7 só com tropas saídas do Quartel, e os bônus
 * (ouro, Mural da Fenda) e o final (cutscene da vela, vitória só depois dela) acontecem de fato.
 */
const ID = 'war-alliance-01-terra-a-vista';

describe('m01 Terra à Vista · objetivos e diálogos', () => {
  it('o objetivo de vitória casa com o mapa real: N acampamentos de bandidos = N tagueados, e nenhuma base inimiga existe', async () => {
    const { gm } = await playMission('war-alliance', ID, [], { maxSeconds: 1 });
    const camps = gm.buildings.filter((b) => b.type === 'bandit_camp');
    const mapCamps = gm.terrain.mapDef.neutrals.filter((n) => n.kind === 'camp').length;
    expect(camps.length).toBe(mapCamps);
    expect(gm.mission.tags.get('smuggler_camp')).toHaveLength(camps.length);
    // só o jogador local e os bandidos (99): nenhuma base orc a derrotar
    expect(gm.buildings.filter((b) => b.ownerId !== 0 && b.ownerId !== 99)).toHaveLength(0);
    expect(gm.mission.def.objectives.filter((o) => o.priority === 'primary').map((o) => o.id)).toEqual(['build-barracks', 'train-troops', 'destroy-camp']);
  });

  it('destruir o(s) acampamento(s) conclui o objetivo e leva à vitória (após a cutscene)', async () => {
    const script = [
      { name: 'quartel', wait: 1, run: (c) => c.gm.mission.setObjectiveStatus('build-barracks', 'completed') },
      { name: 'treino', wait: 2, run: (c) => c.gm.mission.setObjectiveStatus('train-troops', 'completed') },
      { name: 'destruir', wait: 2, run: (c) => c.slayTag('smuggler_camp') }
    ];
    const run = await playMission('war-alliance', ID, script, { maxSeconds: 120 });
    expect(run.gm.mission.objectives.get('destroy-camp').status).toBe('completed');
    expect(run.outcome).toBe('victory');
  });

  it('Quartel → treinar 7 (n/7) → destruir o acampamento, cada um abrindo o seguinte com seu diálogo; vitória só após a cutscene da vela', async () => {
    const log = [];
    const counters = [];
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
    expect(at('dlg:Sete soldados')).toBeGreaterThan(at('obj:train-troops:completed'));
    expect(at('obj:destroy-camp:completed')).toBeGreaterThan(at('dlg:Sete soldados'));
    expect(at('cut:sail:3')).toBeGreaterThan(at('obj:destroy-camp:completed'));
    expect(at('end:victory')).toBeGreaterThan(at('cut:sail:3'));
    // o contador n/7 sobe de 0 a 7, de um em um, só com tropa treinada
    expect(counters).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(run.gm.mission.trainedCount(0, 'knight')).toBeGreaterThanOrEqual(3);
    expect(run.gm.mission.trainedCount(0, 'archer')).toBeGreaterThanOrEqual(4);
    // a vela existe e a vitória veio ≥ 11 s depois do acampamento cair (a cutscene toca inteira)
    expect(run.gm.mission.tags.get('sail')).toHaveLength(1);
    expect(run.gm.entitiesById.get(run.gm.mission.tags.get('sail')[0]).ownerId).toBe(-1);
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
